import { Command } from "commander";
import * as p from "@clack/prompts";
import ora from "ora";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readConfig } from "../../core/config.js";
import { readState, writeState, updatePhase, completeTask } from "../../core/state.js";
import { resolveFeatureRef, getFeaturePath } from "../../core/pipeline.js";
import { ContextBuilder, type Document } from "../../core/context.js";
import { ClaudeProvider } from "../../providers/claude.js";
import { resolveModelTier } from "../../providers/model-router.js";
import { fileExists } from "../../infra/filesystem.js";
import * as git from "../../infra/git.js";
import type { TaskState } from "../../core/types.js";

export function makeRunTasksCommand(): Command {
  return new Command("run-tasks")
    .description("Execute pending tasks sequentially with auto-commit")
    .argument("[ref]", "Feature reference (number or slug)")
    .action(async (ref: string | undefined) => {
      const cwd = process.cwd();
      p.intro("devflow run-tasks");
      const config = await readConfig(cwd);
      if (!config) {
        p.cancel("No config found. Run `devflow init` first.");
        process.exit(1);
      }
      let state = await readState(cwd);
      if (!ref) {
        p.cancel("Feature reference is required. Usage: devflow run-tasks <ref>");
        process.exit(1);
      }
      const featureRef = await resolveFeatureRef(cwd, state, ref);
      if (!featureRef) {
        p.cancel(`Feature '${ref}' not found.`);
        process.exit(1);
      }
      const feature = state.features[featureRef];
      if (!feature) {
        p.cancel(`Feature '${featureRef}' not found in state.`);
        process.exit(1);
      }
      if (feature.phase === "initialized" || feature.phase === "prd_created" || feature.phase === "techspec_created") {
        state = updatePhase(state, featureRef, "tasks_created");
      }
      if (feature.phase !== "tasks_created" && feature.phase !== "in_progress") {
        state = updatePhase(state, featureRef, "in_progress");
      }
      const featurePath = getFeaturePath(cwd, featureRef);
      const pendingTasks = feature.tasks.filter((t: TaskState) => !t.completed);
      if (pendingTasks.length === 0) {
        p.cancel("No pending tasks found.");
        process.exit(0);
      }
      let techspecContent = "";
      const techspecPath = join(featurePath, "techspec.md");
      if (await fileExists(techspecPath)) {
        techspecContent = await readFile(techspecPath, "utf-8");
      }
      const provider = new ClaudeProvider(config);
      const tier = resolveModelTier("run-tasks");
      const spinner = ora();
      p.log.info(`${pendingTasks.length} pending tasks to execute.`);
      for (const task of pendingTasks) {
        p.log.step(`Task ${task.number}: ${task.title}`);
        let taskContent = "";
        const taskFilePath = join(featurePath, `${task.number}_task.md`);
        if (await fileExists(taskFilePath)) {
          taskContent = await readFile(taskFilePath, "utf-8");
        }
        const contextBuilder = new ContextBuilder();
        const docs: Document[] = [
          { name: "Task", content: taskContent || `Task ${task.number}: ${task.title}`, priority: "high" },
        ];
        if (techspecContent) {
          docs.push({ name: "Tech Spec", content: techspecContent, priority: "medium" });
        }
        const context = contextBuilder.build(docs, config.contextMode);
        spinner.start(`Executing task ${task.number}...`);
        const response = await provider.chat({
          systemPrompt: `You are a senior developer implementing a task. Based on the task description and tech spec, describe what code changes need to be made. Be specific about file paths, function signatures, and implementation details.`,
          messages: [{ role: "user", content: context }],
          model: tier,
        });
        spinner.stop();
        const outputPath = join(featurePath, `${task.number}_output.md`);
        await writeFile(outputPath, response.content, "utf-8");
        state = completeTask(state, featureRef, task.number);
        if (feature.phase === "tasks_created") {
          state = updatePhase(state, featureRef, "in_progress");
        }
        await writeState(cwd, state);
        try {
          await git.add(cwd, ["."]);
          await git.commit(cwd, `feat: complete task ${task.number} - ${task.title}`);
          const log = await git.getLog(cwd, undefined, 1);
          p.log.success(`Task ${task.number} done — ${log}`);
        } catch {
          p.log.info(`Task ${task.number} done (no changes to commit)`);
        }
      }
      p.outro(`All ${pendingTasks.length} tasks completed.`);
    });
}
