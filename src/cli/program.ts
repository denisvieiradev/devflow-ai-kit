import { Command } from "commander";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeInitCommand } from "./commands/init.js";
import { makePrdCommand } from "./commands/prd.js";
import { makeTechspecCommand } from "./commands/techspec.js";
import { makeTasksCommand } from "./commands/tasks.js";
import { makeCommitCommand } from "./commands/commit.js";
import { makeRunTasksCommand } from "./commands/run-tasks.js";
import { makeTestCommand } from "./commands/test.js";
import { makeReviewCommand } from "./commands/review.js";

function loadVersion(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(currentDir, "..", "package.json");
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function createProgram(): Command {
  const program = new Command();
  program
    .name("devflow")
    .description(
      "CLI pipeline for structured software development — from PRD to merge",
    )
    .version(loadVersion());
  program.addCommand(makeInitCommand());
  program.addCommand(makePrdCommand());
  program.addCommand(makeTechspecCommand());
  program.addCommand(makeTasksCommand());
  program.addCommand(makeCommitCommand());
  program.addCommand(makeRunTasksCommand());
  program.addCommand(makeTestCommand());
  program.addCommand(makeReviewCommand());
  return program;
}
