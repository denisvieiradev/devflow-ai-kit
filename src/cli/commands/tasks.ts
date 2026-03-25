import { Command } from "commander";
import * as p from "@clack/prompts";
import ora from "ora";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readConfig } from "../../core/config.js";
import { readState, writeState, updatePhase } from "../../core/state.js";
import { resolveFeatureRef, getFeaturePath } from "../../core/pipeline.js";
import { ContextBuilder, type Document } from "../../core/context.js";
import { ClaudeProvider, validateApiKey, handleLLMError } from "../../providers/claude.js";
import { resolveModelTier } from "../../providers/model-router.js";
import { fileExists } from "../../infra/filesystem.js";
import { checkDrift } from "../../core/drift.js";
import type { TaskState } from "../../core/types.js";

export function makeTasksCommand(): Command {
  return new Command("tasks")
    .description("Decompose a tech spec into implementable tasks")
    .argument("[ref]", "Feature reference (number or slug)")
    .action(async (ref: string | undefined) => {
      const cwd = process.cwd();
      p.intro("devflow tasks");
      const config = await readConfig(cwd);
      if (!config) {
        p.cancel("No config found. Run `devflow init` first.");
        process.exit(1);
      }
      let state = await readState(cwd);
      if (!ref) {
        p.cancel("Feature reference is required. Usage: devflow tasks <ref>");
        process.exit(1);
      }
      const featureRef = await resolveFeatureRef(cwd, state, ref);
      if (!featureRef) {
        p.cancel(`Feature '${ref}' not found.`);
        process.exit(1);
      }
      const driftWarnings = await checkDrift(cwd, featureRef, state);
      for (const warning of driftWarnings) {
        p.log.warn(warning.message);
      }
      const featurePath = getFeaturePath(cwd, featureRef);
      const techspecPath = join(featurePath, "techspec.md");
      if (!(await fileExists(techspecPath))) {
        p.cancel(`Tech spec not found at ${techspecPath}. Run \`devflow techspec\` first.`);
        process.exit(1);
      }
      const techspecContent = await readFile(techspecPath, "utf-8");
      const prdPath = join(featurePath, "prd.md");
      let prdContent = "";
      if (await fileExists(prdPath)) {
        prdContent = await readFile(prdPath, "utf-8");
      }
      validateApiKey();
      const provider = new ClaudeProvider(config);
      const tier = resolveModelTier("tasks");
      const contextBuilder = new ContextBuilder();
      const docs: Document[] = [
        { name: "Tech Spec", content: techspecContent, priority: "high" },
      ];
      if (prdContent) {
        docs.push({ name: "PRD", content: prdContent, priority: "medium" });
      }
      const context = contextBuilder.build(docs, config.contextMode);
      const spinner = ora();
      let response;
      try {
        spinner.start("Generating tasks...");
        response = await provider.chat({
          systemPrompt: `You are a senior developer. Decompose the tech spec into implementable tasks.

Output format:
1. First, output a tasks summary in this exact format (one task per line):
\`\`\`tasks
- [ ] 1.0 Task title here
- [ ] 2.0 Another task title
\`\`\`

2. Then for each task, output a detailed section:
\`\`\`task:N
# Task N.0: Title
## Overview
## Subtasks
- [ ] N.1 Subtask description
## Implementation Details
## Success Criteria
## Relevant Files
\`\`\`

Tasks should be ordered by dependency. Each task should be independently implementable and testable.`,
          messages: [{ role: "user", content: context }],
          model: tier,
        });
        spinner.stop();
      } catch (err) {
        spinner.stop();
        handleLLMError(err);
        return;
      }
      const content = response.content;
      // Pattern 1: ```tasks fenced block
      const tasksListMatch = content.match(/```(?:tasks|markdown)\n([\s\S]*?)```/);
      const tasksList = tasksListMatch?.[1]?.trim() ?? content;
      const tasksPath = join(featurePath, "tasks.md");
      await writeFile(tasksPath, `# Tasks: ${featureRef}\n\n${tasksList}\n`, "utf-8");
      // Pattern 1: ```task:N fenced blocks
      const taskSections = content.matchAll(/```task:(\d+)\n([\s\S]*?)```/g);
      const parsedTasks: TaskState[] = [];
      for (const match of taskSections) {
        const taskNumber = match[1] ? parseInt(match[1], 10) : NaN;
        const taskContent = match[2]?.trim() ?? "";
        if (isNaN(taskNumber) || !taskContent) continue;
        const taskFilePath = join(featurePath, `${taskNumber}_task.md`);
        await writeFile(taskFilePath, taskContent, "utf-8");
        const titleMatch = taskContent.match(/^# (?:Task \d+(?:\.\d+)?: )?(.+)/m);
        const title = titleMatch?.[1] ?? `Task ${taskNumber}`;
        parsedTasks.push({ number: taskNumber, title, completed: false });
      }
      // Pattern 2: ## Task N headers (no fenced blocks)
      if (parsedTasks.length === 0) {
        const headerSections = content.matchAll(/^##\s*Task\s+(\d+)(?:\.\d+)?[:\s]+(.+)/gm);
        for (const match of headerSections) {
          const taskNumber = match[1] ? parseInt(match[1], 10) : NaN;
          const title = match[2]?.trim() ?? "";
          if (!isNaN(taskNumber) && title) {
            parsedTasks.push({ number: taskNumber, title, completed: false });
          }
        }
      }
      // Pattern 3: - [ ] N.0 Title lines
      if (parsedTasks.length === 0) {
        const lines = tasksList.split("\n");
        for (const line of lines) {
          const lineMatch = line.match(/- \[ \] (\d+)(?:\.\d+)?\s+(.+)/);
          if (lineMatch) {
            const taskNumber = lineMatch[1] ? parseInt(lineMatch[1], 10) : NaN;
            const title = lineMatch[2]?.trim() ?? "";
            if (!isNaN(taskNumber) && title) {
              parsedTasks.push({ number: taskNumber, title, completed: false });
            }
          }
        }
      }
      const feature = state.features[featureRef];
      if (feature) {
        state = {
          ...state,
          features: {
            ...state.features,
            [featureRef]: {
              ...feature,
              tasks: parsedTasks,
              updatedAt: new Date().toISOString(),
            },
          },
        };
      }
      state = updatePhase(state, featureRef, "tasks_created");
      await writeState(cwd, state);
      p.log.success(`Tasks saved: ${tasksPath} (${parsedTasks.length} tasks)`);
      for (const task of parsedTasks) {
        p.log.info(`  ${task.number}.0 ${task.title}`);
      }
      p.outro(`Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`);
    });
}
