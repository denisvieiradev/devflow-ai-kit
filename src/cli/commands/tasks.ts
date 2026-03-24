import { Command } from "commander";
import * as p from "@clack/prompts";
import ora from "ora";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readConfig } from "../../core/config.js";
import { readState, writeState, updatePhase } from "../../core/state.js";
import { resolveFeatureRef, getFeaturePath } from "../../core/pipeline.js";
import { ContextBuilder, type Document } from "../../core/context.js";
import { ClaudeProvider } from "../../providers/claude.js";
import { resolveModelTier } from "../../providers/model-router.js";
import { fileExists } from "../../infra/filesystem.js";
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
      spinner.start("Generating tasks...");
      const response = await provider.chat({
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
      const content = response.content;
      const tasksListMatch = content.match(/```tasks\n([\s\S]*?)```/);
      const tasksList = tasksListMatch ? tasksListMatch[1]!.trim() : content;
      const tasksPath = join(featurePath, "tasks.md");
      await writeFile(tasksPath, `# Tasks: ${featureRef}\n\n${tasksList}\n`, "utf-8");
      const taskSections = content.matchAll(/```task:(\d+)\n([\s\S]*?)```/g);
      const parsedTasks: TaskState[] = [];
      for (const match of taskSections) {
        const taskNumber = parseInt(match[1]!, 10);
        const taskContent = match[2]!.trim();
        const taskFilePath = join(featurePath, `${taskNumber}_task.md`);
        await writeFile(taskFilePath, taskContent, "utf-8");
        const titleMatch = taskContent.match(/^# (?:Task \d+(?:\.\d+)?: )?(.+)/m);
        const title = titleMatch ? titleMatch[1]! : `Task ${taskNumber}`;
        parsedTasks.push({ number: taskNumber, title, completed: false });
      }
      if (parsedTasks.length === 0) {
        const lines = tasksList.split("\n");
        for (const line of lines) {
          const lineMatch = line.match(/- \[ \] (\d+)(?:\.\d+)?\s+(.+)/);
          if (lineMatch) {
            parsedTasks.push({
              number: parseInt(lineMatch[1]!, 10),
              title: lineMatch[2]!,
              completed: false,
            });
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
