import { Command } from "commander";
import * as p from "@clack/prompts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readConfig, writeConfig } from "../../core/config.js";
import { initState } from "../../core/state.js";
import { scanProject } from "../../core/scanner.js";
import { fileExists } from "../../infra/filesystem.js";
import { DEFAULT_CONFIG, type ContextMode } from "../../core/types.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const exec = promisify(execFile);

async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await exec("git", ["rev-parse", "--is-inside-work-tree"], { cwd });
    return true;
  } catch {
    return false;
  }
}

async function hasGhCli(): Promise<boolean> {
  try {
    await exec("gh", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

async function isInGitignore(projectRoot: string, entry: string): Promise<boolean> {
  const gitignorePath = join(projectRoot, ".gitignore");
  if (!(await fileExists(gitignorePath))) return false;
  const content = await readFile(gitignorePath, "utf-8");
  return content.split("\n").some((line) => line.trim() === entry);
}

export function makeInitCommand(): Command {
  return new Command("init")
    .description("Initialize devflow in current project")
    .option("--force", "Overwrite existing config")
    .action(async (options: { force?: boolean }) => {
      const cwd = process.cwd();
      p.intro("devflow init");
      if (!(await isGitRepo(cwd))) {
        p.cancel("Not a git repository. Run `git init` first.");
        process.exit(1);
      }
      const existingConfig = await readConfig(cwd);
      if (existingConfig && !options.force) {
        p.cancel("Config already exists. Use --force to overwrite.");
        process.exit(1);
      }
      const scan = await scanProject(cwd);
      p.log.info(
        `Detected: ${scan.language}${scan.framework ? ` (${scan.framework})` : ""}, ${scan.testFramework ?? "no tests"}, ${scan.hasCI ? "CI found" : "no CI"}`,
      );
      const provider = await p.select({
        message: "LLM Provider",
        options: [
          { value: "claude" as const, label: "Claude (Anthropic)", hint: "default" },
        ],
      });
      if (p.isCancel(provider)) {
        p.cancel("Init cancelled.");
        process.exit(0);
      }
      const contextMode = await p.select({
        message: "Context mode",
        options: [
          { value: "normal" as const, label: "Normal", hint: "full documents, best quality" },
          { value: "light" as const, label: "Light", hint: "chunked context, lower cost" },
        ],
      });
      if (p.isCancel(contextMode)) {
        p.cancel("Init cancelled.");
        process.exit(0);
      }
      const config = {
        ...DEFAULT_CONFIG,
        provider: provider as "claude",
        contextMode: contextMode as ContextMode,
        project: scan,
      };
      await writeConfig(cwd, config);
      await initState(cwd);
      if (!(await hasGhCli())) {
        p.log.warn("GitHub CLI (gh) not found. `devflow pr` will not work until installed.");
      }
      if (!(await isInGitignore(cwd, ".devflow/config.json"))) {
        p.log.warn("Consider adding .devflow/config.json to .gitignore (may contain API key references).");
      }
      p.outro("Config saved to .devflow/config.json");
    });
}
