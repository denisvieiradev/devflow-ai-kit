import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockChat = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockReadConfig = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockValidateApiKey = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockHandleLLMError = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetStagedDiff = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGitCommit = jest.fn<any>();
const mockGetBranch = jest.fn<() => Promise<string>>().mockResolvedValue("feature/test");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPush = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockConfirm = jest.fn<any>();

jest.unstable_mockModule("../../../src/core/config.js", () => ({
  readConfig: mockReadConfig,
}));

jest.unstable_mockModule("../../../src/providers/claude.js", () => ({
  ClaudeProvider: jest.fn().mockImplementation(() => ({
    chat: mockChat,
  })),
  validateApiKey: mockValidateApiKey,
  handleLLMError: mockHandleLLMError,
}));

jest.unstable_mockModule("../../../src/providers/model-router.js", () => ({
  resolveModelTier: () => "fast",
}));

jest.unstable_mockModule("../../../src/infra/git.js", () => ({
  getStagedDiff: mockGetStagedDiff,
  commit: mockGitCommit,
  getBranch: mockGetBranch,
  push: mockPush,
}));

jest.unstable_mockModule("@clack/prompts", () => ({
  intro: jest.fn(),
  cancel: jest.fn(),
  outro: jest.fn(),
  log: { info: jest.fn(), success: jest.fn(), message: jest.fn() },
  confirm: mockConfirm,
  isCancel: () => false,
}));

const { makeCommitCommand } = await import("../../../src/cli/commands/commit.js");

describe("commit command", () => {
  const mockExit = jest.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("process.exit");
  }) as never);

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfirm.mockResolvedValue(true);
  });

  it("should exit when no config found", async () => {
    mockReadConfig.mockResolvedValue(null);
    const cmd = makeCommitCommand();
    await expect(cmd.parseAsync(["node", "test"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should exit when no staged changes", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: {}, contextMode: "normal" } as any);
    mockGetStagedDiff.mockResolvedValue("");
    const cmd = makeCommitCommand();
    await expect(cmd.parseAsync(["node", "test"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should generate commit message and commit on confirmation", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { fast: "haiku" }, contextMode: "normal" } as any);
    mockGetStagedDiff.mockResolvedValue("diff --git a/file.ts");
    mockChat.mockResolvedValue({
      content: "feat(core): add new feature",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    mockConfirm.mockResolvedValue(true);
    mockGitCommit.mockResolvedValue("abc1234");

    const cmd = makeCommitCommand();
    await cmd.parseAsync(["node", "test"]);

    expect(mockChat).toHaveBeenCalledTimes(1);
    expect(mockGitCommit).toHaveBeenCalledWith(
      expect.any(String),
      "feat(core): add new feature",
    );
  });

  it("should exit when user cancels confirmation", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { fast: "haiku" }, contextMode: "normal" } as any);
    mockGetStagedDiff.mockResolvedValue("diff --git a/file.ts");
    mockChat.mockResolvedValue({
      content: "feat: something",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    mockConfirm.mockResolvedValue(false);

    const cmd = makeCommitCommand();
    await expect(cmd.parseAsync(["node", "test"])).rejects.toThrow("process.exit");
    expect(mockGitCommit).not.toHaveBeenCalled();
  });

  it("should handle LLM error gracefully", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { fast: "haiku" }, contextMode: "normal" } as any);
    mockGetStagedDiff.mockResolvedValue("diff --git a/file.ts");
    mockChat.mockRejectedValue(new Error("API error"));

    const cmd = makeCommitCommand();
    await cmd.parseAsync(["node", "test"]);

    expect(mockHandleLLMError).toHaveBeenCalled();
    expect(mockGitCommit).not.toHaveBeenCalled();
  });
});
