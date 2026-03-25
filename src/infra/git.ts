import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { debug } from "./logger.js";

const exec = promisify(execFile);
const GIT_TIMEOUT_MS = 30_000;

interface ExecResult {
  stdout: string;
  stderr: string;
}

async function run(args: string[], cwd: string): Promise<string> {
  debug("git command", { args, cwd });
  try {
    const result: ExecResult = await exec("git", args, { cwd, timeout: GIT_TIMEOUT_MS });
    return result.stdout.trim();
  } catch (err: unknown) {
    if (err instanceof Error && "killed" in err && (err as { killed: boolean }).killed) {
      throw new Error(`Git command timed out after ${GIT_TIMEOUT_MS / 1000}s: git ${args.join(" ")}`);
    }
    throw err;
  }
}

export async function getBranch(cwd: string): Promise<string> {
  return run(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
}

export async function createBranch(
  cwd: string,
  branchName: string,
  startPoint?: string,
): Promise<void> {
  const args = ["checkout", "-b", branchName];
  if (startPoint) args.push(startPoint);
  await run(args, cwd);
}

export async function checkout(cwd: string, branchName: string): Promise<void> {
  await run(["checkout", branchName], cwd);
}

export async function getDiff(cwd: string, base?: string): Promise<string> {
  const args = base ? ["diff", `${base}...HEAD`] : ["diff"];
  return run(args, cwd);
}

export async function getStagedDiff(cwd: string): Promise<string> {
  return run(["diff", "--cached"], cwd);
}

export async function getLog(
  cwd: string,
  range?: string,
  maxCount?: number,
): Promise<string> {
  const args = ["log", "--oneline"];
  if (maxCount) args.push(`-${maxCount}`);
  if (range) args.push(range);
  return run(args, cwd);
}

export async function add(cwd: string, files: string[]): Promise<void> {
  await run(["add", ...files], cwd);
}

export async function commit(cwd: string, message: string): Promise<string> {
  return run(["commit", "-m", message], cwd);
}

export async function status(cwd: string): Promise<string> {
  return run(["status", "--porcelain"], cwd);
}

export async function push(
  cwd: string,
  remote: string,
  branch: string,
): Promise<void> {
  await run(["push", remote, branch], cwd);
}

export async function fetch(cwd: string, remote: string): Promise<void> {
  await run(["fetch", remote], cwd);
}
