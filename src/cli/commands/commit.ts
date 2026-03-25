import { Command } from "commander";
import * as p from "@clack/prompts";
import ora from "ora";
import { readConfig } from "../../core/config.js";
import { ClaudeProvider, validateApiKey, handleLLMError } from "../../providers/claude.js";
import { resolveModelTier } from "../../providers/model-router.js";
import * as git from "../../infra/git.js";

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
      const diff = await git.getStagedDiff(cwd);
      if (!diff) {
        p.cancel("No staged changes. Use `git add` first.");
        process.exit(1);
      }
      validateApiKey();
      const provider = new ClaudeProvider(config);
      const tier = resolveModelTier("commit");
      const spinner = ora();
      let response;
      try {
        spinner.start("Analyzing changes...");
        response = await provider.chat({
        systemPrompt: `You are a developer writing commit messages. Analyze the git diff and generate a conventional commit message.

Rules:
- Format: type(scope): description
- Types: feat, fix, refactor, test, chore, style, docs
- Description must be imperative, lowercase, max 72 chars
- Scope is optional but recommended
- Do NOT mention AI, Claude, generated, LLM, or copilot
- Return ONLY the commit message, nothing else`,
        messages: [{ role: "user", content: diff }],
          model: tier,
        });
        spinner.stop();
      } catch (err) {
        spinner.stop();
        handleLLMError(err);
        return;
      }
      const commitMessage = response.content.trim();
      p.log.info(`Commit message: ${commitMessage}`);
      const confirm = await p.confirm({
        message: "Proceed with this commit message?",
      });
      if (p.isCancel(confirm) || !confirm) {
        p.cancel("Commit cancelled.");
        process.exit(0);
      }
      await git.commit(cwd, commitMessage);
      p.log.success("Committed.");
      if (options.push) {
        const branch = await git.getBranch(cwd);
        spinner.start("Pushing...");
        await git.push(cwd, "origin", branch);
        spinner.stop();
        p.log.success(`Pushed to origin/${branch}`);
      }
      p.outro("Done.");
    });
}
