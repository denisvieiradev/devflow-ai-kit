import { Command } from "commander";
import * as p from "@clack/prompts";
import chalk from "chalk";
import ora from "ora";
import { readConfig } from "../../core/config.js";
import { handleLLMError } from "../../providers/claude.js";
import { createProvider, validateProvider } from "../../providers/factory.js";
import { resolveModelTier } from "../../providers/model-router.js";
import * as git from "../../infra/git.js";
import type { ChangedFile } from "../../infra/git.js";

interface SingleCommit {
  type: "single";
  message: string;
}

interface CommitPlan {
  type: "plan";
  commits: Array<{ message: string; files: string[] }>;
}

type CommitResponse = SingleCommit | CommitPlan;

function parseCommitResponse(raw: string): CommitResponse {
  try {
    const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.type === "plan" && Array.isArray(parsed.commits)) return parsed;
    if (parsed.type === "single" && parsed.message) return parsed;
  } catch { /* fallback to raw message */ }
  return { type: "single", message: raw.trim() };
}

function statusLabel(file: ChangedFile): string {
  if (file.indexStatus === "?" && file.workTreeStatus === "?") return "untracked";
  if (file.workTreeStatus === "M") return "modified";
  if (file.workTreeStatus === "D") return "deleted";
  return "changed";
}

async function selectAndStageFiles(cwd: string, files: ChangedFile[]): Promise<void> {
  const selected = await p.multiselect({
    message: "Select files to stage:",
    options: files.map((f) => ({
      value: f.file,
      label: f.file,
      hint: statusLabel(f),
    })),
  });
  if (p.isCancel(selected)) {
    p.cancel("Commit cancelled.");
    process.exit(0);
  }
  if ((selected as string[]).length === 0) {
    p.cancel("No files selected.");
    process.exit(0);
  }
  await git.add(cwd, selected as string[]);
}

const SYSTEM_PROMPT = `You are a developer writing commit messages. Analyze the git diff and the list of staged files to determine if the changes span one or multiple contexts.

Rules for commit messages:
- Format: type(scope): description
- Types: feat, fix, refactor, test, chore, style, docs
- Description must be imperative, lowercase, max 72 chars
- Scope is optional but recommended
- Do NOT mention AI, Claude, generated, LLM, or copilot

Response format (JSON only, no extra text):

If all changes belong to a SINGLE context, return:
{"type": "single", "message": "type(scope): description"}

If changes span MULTIPLE distinct contexts (e.g., a bug fix AND a new feature, or docs AND refactoring), return:
{"type": "plan", "commits": [{"message": "type(scope): description", "files": ["file1.ts", "file2.ts"]}, {"message": "type(scope): description", "files": ["file3.ts"]}]}

Only return a plan when there are clearly separate concerns. Do not split for minor differences.`;

async function handleSingleCommit(
  cwd: string,
  commitMessage: string,
  options: { push?: boolean },
): Promise<void> {
  p.log.info(`Commit message: ${chalk.green(commitMessage)}`);
  const confirm = await p.confirm({
    message: "Proceed with this commit message?",
  });
  if (p.isCancel(confirm) || !confirm) {
    p.cancel("Commit cancelled.");
    process.exit(0);
  }
  await git.commit(cwd, commitMessage);
  p.log.success("Committed.");
  await pushIfRequested(cwd, options);
}

async function handleCommitPlan(
  cwd: string,
  plan: CommitPlan,
  options: { push?: boolean },
): Promise<void> {
  p.log.info(chalk.bold("Commit plan detected — changes span multiple contexts:\n"));
  for (const [i, c] of plan.commits.entries()) {
    p.log.message(
      `  ${chalk.cyan(`${i + 1}.`)} ${chalk.green(c.message)}\n     Files: ${c.files.join(", ")}`,
    );
  }

  const action = await p.select({
    message: "How would you like to proceed?",
    options: [
      { value: "split", label: "Split into separate commits (recommended)" },
      { value: "single", label: "Commit all as a single commit" },
      { value: "cancel", label: "Cancel" },
    ],
  });

  if (p.isCancel(action) || action === "cancel") {
    p.cancel("Commit cancelled.");
    process.exit(0);
  }

  if (action === "single") {
    const combined = plan.commits.map((c) => c.message).join("\n");
    await git.commit(cwd, combined);
    p.log.success("Committed all changes as a single commit.");
  } else {
    await git.resetStaged(cwd);
    for (const group of plan.commits) {
      await git.add(cwd, group.files);
      await git.commit(cwd, group.message);
      p.log.success(`Committed: ${chalk.green(group.message)}`);
    }
  }

  await pushIfRequested(cwd, options);
}

async function pushIfRequested(
  cwd: string,
  options: { push?: boolean },
): Promise<void> {
  if (options.push) {
    const branch = await git.getBranch(cwd);
    const spinner = ora();
    spinner.start("Pushing...");
    await git.push(cwd, "origin", branch);
    spinner.stop();
    p.log.success(`Pushed to origin/${branch}`);
  }
}

export function makeCommitCommand(): Command {
  return new Command("commit")
    .description("Generate intelligent commit message from staged changes")
    .option("--push", "Push after committing")
    .action(async (options: { push?: boolean }) => {
      const cwd = process.cwd();
      p.intro("devflow commit");
      const config = await readConfig(cwd);
      if (!config) {
        p.cancel("No config found. Run `devflow init` first.");
        process.exit(1);
      }

      let diff = await git.getStagedDiff(cwd);

      if (!diff) {
        const unstaged = await git.getUnstagedFiles(cwd);
        if (unstaged.length === 0) {
          p.cancel("Nothing to commit (working tree clean).");
          process.exit(1);
        }

        const action = await p.select({
          message: "No staged changes found. How would you like to proceed?",
          options: [
            { value: "all", label: "Add all changes to stage" },
            { value: "select", label: "Select specific files" },
          ],
        });
        if (p.isCancel(action)) {
          p.cancel("Commit cancelled.");
          process.exit(0);
        }

        if (action === "all") {
          await git.add(cwd, ["-A"]);
        } else {
          await selectAndStageFiles(cwd, unstaged);
        }

        diff = await git.getStagedDiff(cwd);
        if (!diff) {
          p.cancel("No staged changes after staging. Nothing to commit.");
          process.exit(1);
        }
      } else {
        const stagedFiles = await git.getStagedFiles(cwd);
        p.log.info(
          `Staged files:\n${stagedFiles.map((f) => `  ${f.file}`).join("\n")}`,
        );

        const unstaged = await git.getUnstagedFiles(cwd);
        if (unstaged.length > 0) {
          const action = await p.select({
            message: "You have staged changes. What would you like to do?",
            options: [
              { value: "continue", label: "Continue with current staged changes" },
              { value: "add", label: "Add more files to stage" },
            ],
          });
          if (p.isCancel(action)) {
            p.cancel("Commit cancelled.");
            process.exit(0);
          }

          if (action === "add") {
            await selectAndStageFiles(cwd, unstaged);
            diff = await git.getStagedDiff(cwd);
          }
        }
      }

      const stagedFilesList = await git.getStagedFilesList(cwd);

      validateProvider(config);
      const provider = createProvider(config);
      const tier = resolveModelTier("commit");
      const spinner = ora();
      let response;
      try {
        spinner.start("Analyzing changes...");
        response = await provider.chat({
          systemPrompt: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `Staged files:\n${stagedFilesList.join("\n")}\n\nDiff:\n${diff}`,
            },
          ],
          model: tier,
        });
        spinner.stop();
      } catch (err) {
        spinner.stop();
        handleLLMError(err);
        return;
      }

      const parsed = parseCommitResponse(response.content);

      if (parsed.type === "plan") {
        await handleCommitPlan(cwd, parsed, options);
      } else {
        await handleSingleCommit(cwd, parsed.message, options);
      }

      p.outro("Done.");
    });
}
