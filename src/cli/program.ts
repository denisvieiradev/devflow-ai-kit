import { Command } from "commander";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
  return program;
}
