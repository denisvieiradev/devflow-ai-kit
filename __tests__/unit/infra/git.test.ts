import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as git from "../../../src/infra/git.js";

const exec = promisify(execFile);

describe("GitClient", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "devflow-git-"));
    await exec("git", ["init"], { cwd: tempDir });
    await exec("git", ["config", "user.email", "test@test.com"], { cwd: tempDir });
    await exec("git", ["config", "user.name", "Test"], { cwd: tempDir });
    await writeFile(join(tempDir, "README.md"), "# Test");
    await exec("git", ["add", "."], { cwd: tempDir });
    await exec("git", ["commit", "-m", "initial commit"], { cwd: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should get current branch", async () => {
    const branch = await git.getBranch(tempDir);
    expect(["main", "master"]).toContain(branch);
  });

  it("should create and checkout a branch", async () => {
    await git.createBranch(tempDir, "feature/test");
    const branch = await git.getBranch(tempDir);
    expect(branch).toBe("feature/test");
  });

  it("should get status of working directory", async () => {
    await writeFile(join(tempDir, "new-file.txt"), "content");
    const result = await git.status(tempDir);
    expect(result).toContain("new-file.txt");
  });

  it("should add and commit files", async () => {
    await writeFile(join(tempDir, "feature.ts"), "export const x = 1;");
    await git.add(tempDir, ["feature.ts"]);
    const diff = await git.getStagedDiff(tempDir);
    expect(diff).toContain("feature.ts");
    await git.commit(tempDir, "feat: add feature");
    const log = await git.getLog(tempDir, undefined, 1);
    expect(log).toContain("feat: add feature");
  });

  it("should get diff between branches", async () => {
    const baseBranch = await git.getBranch(tempDir);
    await git.createBranch(tempDir, "feature/diff-test");
    await writeFile(join(tempDir, "diff-file.ts"), "const y = 2;");
    await git.add(tempDir, ["diff-file.ts"]);
    await git.commit(tempDir, "feat: add diff file");
    const diff = await git.getDiff(tempDir, baseBranch);
    expect(diff).toContain("diff-file.ts");
  });

  it("should get log with max count", async () => {
    await writeFile(join(tempDir, "a.txt"), "a");
    await git.add(tempDir, ["a.txt"]);
    await git.commit(tempDir, "add a");
    await writeFile(join(tempDir, "b.txt"), "b");
    await git.add(tempDir, ["b.txt"]);
    await git.commit(tempDir, "add b");
    const log = await git.getLog(tempDir, undefined, 1);
    const lines = log.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("add b");
  });
});
