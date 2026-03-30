import { Command } from "commander";
import * as p from "@clack/prompts";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readConfig, writeConfig } from "../../core/config.js";
import { initState } from "../../core/state.js";
import { scanProject } from "../../core/scanner.js";
import { fileExists } from "../../infra/filesystem.js";
import { DEFAULT_CONFIG, type ContextMode, type DevflowConfig } from "../../core/types.js";
import { writeEnvVar } from "../../infra/env.js";
import { validateClaudeCli } from "../../providers/claude-code.js";
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
          { value: "claude-code-api-key" as const, label: "Claude (API Key)", hint: "requires Anthropic API key" },
          { value: "claude-code-cli" as const, label: "Claude Code (CLI)", hint: "uses your Claude Code subscription" },
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
      let apiKey: string | undefined;
      if (provider === "claude-code-cli") {
        validateClaudeCli();
        p.log.success("Claude Code CLI detected.");
      } else {
        const existingKey = process.env.ANTHROPIC_API_KEY;
        if (existingKey) {
          const masked = existingKey.length > 8
            ? `${existingKey.slice(0, 7)}...${existingKey.slice(-4)}`
            : "****";
          const keepKey = await p.confirm({
            message: `ANTHROPIC_API_KEY already set (${masked}). Keep it?`,
          });
          if (p.isCancel(keepKey)) {
            p.cancel("Init cancelled.");
            process.exit(0);
          }
          if (!keepKey) {
            const newKey = await p.password({
              message: "Anthropic API Key",
            });
            if (p.isCancel(newKey)) {
              p.cancel("Init cancelled.");
              process.exit(0);
            }
            apiKey = newKey;
          }
        } else {
          const wantsKey = await p.confirm({
            message: "Configure Anthropic API Key now?",
            initialValue: true,
          });
          if (p.isCancel(wantsKey)) {
            p.cancel("Init cancelled.");
            process.exit(0);
          }
          if (wantsKey) {
            const newKey = await p.password({
              message: "Anthropic API Key",
            });
            if (p.isCancel(newKey)) {
              p.cancel("Init cancelled.");
              process.exit(0);
            }
            apiKey = newKey;
          }
        }
      }
      const config = {
        ...DEFAULT_CONFIG,
        provider: provider as DevflowConfig["provider"],
        contextMode: contextMode as ContextMode,
        project: scan,
      };
      await writeConfig(cwd, config);
      await initState(cwd);
      if (apiKey) {
        await writeEnvVar(cwd, "ANTHROPIC_API_KEY", apiKey);
        process.env.ANTHROPIC_API_KEY = apiKey;
        p.log.success("API key saved to .devflow/.env");
      }
      if (!(await hasGhCli())) {
        p.log.warn("GitHub CLI (gh) not found. `devflow pr` will not work until installed.");
      }
      if (!(await isInGitignore(cwd, ".devflow/.env"))) {
        p.log.warn("Add .devflow/.env to .gitignore to avoid committing secrets.");
      }
      p.outro("Config saved to .devflow/config.json");
    });
}
