import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { FeatureState } from "../../../src/core/types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockChat = jest.fn<any>();

jest.mock("../../../src/core/config.js", () => ({
  readConfig: jest.fn(),
}));

jest.mock("../../../src/core/state.js", () => ({
  readState: jest.fn(),
  writeState: jest.fn(),
  updatePhase: jest.fn((state: unknown) => state),
  completeTask: jest.fn((state: unknown) => state),
}));

jest.mock("../../../src/core/pipeline.js", () => ({
  resolveFeatureRef: jest.fn(),
  getFeaturePath: (_cwd: string, ref: string) => `/tmp/.devflow/features/${ref}`,
}));

jest.mock("../../../src/core/context.js", () => ({
  ContextBuilder: jest.fn().mockImplementation(() => ({
    build: () => "mock context",
  })),
}));

jest.mock("../../../src/core/drift.js", () => ({
  checkDrift: jest.fn<() => Promise<never[]>>().mockResolvedValue([]),
}));

jest.mock("../../../src/providers/claude.js", () => ({
  ClaudeProvider: jest.fn().mockImplementation(() => ({
    chat: mockChat,
  })),
  validateApiKey: jest.fn(),
  handleLLMError: jest.fn(),
}));

jest.mock("../../../src/providers/model-router.js", () => ({
  resolveModelTier: () => "balanced",
}));

jest.mock("../../../src/infra/filesystem.js", () => ({
  fileExists: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
}));

jest.mock("../../../src/infra/git.js", () => ({
  getChangedFiles: jest.fn(),
  add: jest.fn(),
  commit: jest.fn(),
  getLog: jest.fn<() => Promise<string>>().mockResolvedValue("abc1234 feat: task done"),
}));

jest.mock("node:fs/promises", () => ({
  readFile: jest.fn<() => Promise<string>>().mockResolvedValue(""),
  writeFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.mock("@clack/prompts", () => ({
  intro: jest.fn(),
  cancel: jest.fn(),
  outro: jest.fn(),
  log: { info: jest.fn(), success: jest.fn(), warn: jest.fn(), step: jest.fn(), message: jest.fn() },
  isCancel: () => false,
}));

import { readConfig } from "../../../src/core/config.js";
import { readState, completeTask } from "../../../src/core/state.js";
import { resolveFeatureRef } from "../../../src/core/pipeline.js";
import { handleLLMError } from "../../../src/providers/claude.js";
import * as git from "../../../src/infra/git.js";
import { makeRunTasksCommand } from "../../../src/cli/commands/run-tasks.js";

const mockReadConfig = readConfig as jest.MockedFunction<typeof readConfig>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockReadState = readState as jest.MockedFunction<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockResolveFeatureRef = resolveFeatureRef as jest.MockedFunction<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetChangedFiles = git.getChangedFiles as jest.MockedFunction<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockAdd = git.add as jest.MockedFunction<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGitCommit = git.commit as jest.MockedFunction<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCompleteTask = completeTask as jest.MockedFunction<any>;
const mockHandleLLMError = handleLLMError as jest.MockedFunction<typeof handleLLMError>;

function makeFeature(overrides?: Partial<FeatureState>): FeatureState {
  return {
    slug: "auth-oauth",
    number: 1,
    phase: "tasks_created",
    tasks: [
      { number: 1, title: "Setup config", completed: false },
      { number: 2, title: "Implement flow", completed: false },
    ],
    artifacts: {},
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("run-tasks command", () => {
  const mockExit = jest.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("process.exit");
  }) as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should exit when no config found", async () => {
    mockReadConfig.mockResolvedValue(null);
    const cmd = makeRunTasksCommand();
    await expect(cmd.parseAsync(["node", "test", "001"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should exit when no ref provided", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: {}, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue({ features: {} });
    const cmd = makeRunTasksCommand();
    await expect(cmd.parseAsync(["node", "test"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should exit when no pending tasks", async () => {
    const feature = makeFeature({
      tasks: [{ number: 1, title: "Done", completed: true }],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { balanced: "sonnet" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue({ features: { "001-auth": feature } });
    mockResolveFeatureRef.mockResolvedValue("001-auth");

    const cmd = makeRunTasksCommand();
    await expect(cmd.parseAsync(["node", "test", "001"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("should execute pending tasks sequentially and commit", async () => {
    const feature = makeFeature();
    const state = { features: { "001-auth": feature } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { balanced: "sonnet" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue(state);
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockCompleteTask.mockReturnValue(state);
    mockChat.mockResolvedValue({
      content: "Implementation details",
      usage: { inputTokens: 50, outputTokens: 30 },
    });
    mockGetChangedFiles.mockResolvedValue(["src/config.ts"]);
    mockGitCommit.mockResolvedValue("abc1234");

    const cmd = makeRunTasksCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(mockChat).toHaveBeenCalledTimes(2);
    expect(mockCompleteTask).toHaveBeenCalledTimes(2);
    expect(mockAdd).toHaveBeenCalledTimes(2);
    expect(mockGitCommit).toHaveBeenCalledTimes(2);
  });

  it("should filter out sensitive files from staging", async () => {
    const feature = makeFeature({
      tasks: [{ number: 1, title: "Setup", completed: false }],
    });
    const state = { features: { "001-auth": feature } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { balanced: "sonnet" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue(state);
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockCompleteTask.mockReturnValue(state);
    mockChat.mockResolvedValue({
      content: "done",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    mockGetChangedFiles.mockResolvedValue(["src/app.ts", ".env", ".env.local", "credentials.json"]);
    mockGitCommit.mockResolvedValue("def5678");

    const cmd = makeRunTasksCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(mockAdd).toHaveBeenCalledWith(
      expect.any(String),
      ["src/app.ts"],
    );
  });

  it("should handle LLM error and return early", async () => {
    const feature = makeFeature({
      tasks: [{ number: 1, title: "Setup", completed: false }],
    });
    const state = { features: { "001-auth": feature } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { balanced: "sonnet" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue(state);
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockChat.mockRejectedValue(new Error("API error"));

    const cmd = makeRunTasksCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(mockHandleLLMError).toHaveBeenCalled();
    expect(mockGitCommit).not.toHaveBeenCalled();
  });

  it("should exit when feature not found in state", async () => {
    const state = { features: {} };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { balanced: "sonnet" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue(state);
    mockResolveFeatureRef.mockResolvedValue("001-nonexistent");

    const cmd = makeRunTasksCommand();
    await expect(cmd.parseAsync(["node", "test", "001"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should skip commit when all changed files are sensitive", async () => {
    const feature = makeFeature({
      tasks: [{ number: 1, title: "Setup", completed: false }],
    });
    const state = { features: { "001-auth": feature } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { balanced: "sonnet" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue(state);
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockCompleteTask.mockReturnValue(state);
    mockChat.mockResolvedValue({
      content: "done",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    mockGetChangedFiles.mockResolvedValue([".env", ".env.local", "credentials.json"]);

    const cmd = makeRunTasksCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockGitCommit).not.toHaveBeenCalled();
  });

  it("should not update phase when already in_progress", async () => {
    const feature = makeFeature({
      phase: "in_progress",
      tasks: [{ number: 1, title: "Setup", completed: false }],
    });
    const state = { features: { "001-auth": feature } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { balanced: "sonnet" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue(state);
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockCompleteTask.mockReturnValue(state);
    mockChat.mockResolvedValue({
      content: "done",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    mockGetChangedFiles.mockResolvedValue(["src/file.ts"]);
    mockGitCommit.mockResolvedValue("abc1234");

    const { updatePhase } = await import("../../../src/core/state.js");
    const mockUpdatePhase = updatePhase as jest.MockedFunction<typeof updatePhase>;

    const cmd = makeRunTasksCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(mockUpdatePhase).not.toHaveBeenCalled();
  });
});
