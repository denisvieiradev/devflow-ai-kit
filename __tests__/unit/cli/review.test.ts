import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockChat = jest.fn<any>();

jest.mock("../../../src/core/config.js", () => ({
  readConfig: jest.fn(),
}));

jest.mock("../../../src/core/state.js", () => ({
  readState: jest.fn(),
  writeState: jest.fn(),
  updatePhase: jest.fn((state: unknown) => state),
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

jest.mock("../../../src/providers/claude.js", () => ({
  ClaudeProvider: jest.fn().mockImplementation(() => ({
    chat: mockChat,
  })),
  validateApiKey: jest.fn(),
  handleLLMError: jest.fn(),
}));

jest.mock("../../../src/providers/model-router.js", () => ({
  resolveModelTier: () => "powerful",
}));

jest.mock("../../../src/infra/filesystem.js", () => ({
  fileExists: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
}));

jest.mock("../../../src/infra/git.js", () => ({
  getDiff: jest.fn(),
}));

jest.mock("node:fs/promises", () => ({
  readFile: jest.fn<() => Promise<string>>().mockResolvedValue(""),
  writeFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

jest.mock("@clack/prompts", () => ({
  intro: jest.fn(),
  cancel: jest.fn(),
  outro: jest.fn(),
  log: { info: jest.fn(), success: jest.fn(), warn: jest.fn(), message: jest.fn() },
  isCancel: () => false,
}));

import { readConfig } from "../../../src/core/config.js";
import { readState } from "../../../src/core/state.js";
import { resolveFeatureRef } from "../../../src/core/pipeline.js";
import { handleLLMError } from "../../../src/providers/claude.js";
import * as git from "../../../src/infra/git.js";
import { writeFile } from "node:fs/promises";
import * as p from "@clack/prompts";
import { makeReviewCommand } from "../../../src/cli/commands/review.js";

const mockReadConfig = readConfig as jest.MockedFunction<typeof readConfig>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockReadState = readState as jest.MockedFunction<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockResolveFeatureRef = resolveFeatureRef as jest.MockedFunction<any>;
const mockGetDiff = git.getDiff as jest.MockedFunction<typeof git.getDiff>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockWriteFile = writeFile as jest.MockedFunction<any>;
const mockHandleLLMError = handleLLMError as jest.MockedFunction<typeof handleLLMError>;

describe("review command", () => {
  const mockExit = jest.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("process.exit");
  }) as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should exit when no config found", async () => {
    mockReadConfig.mockResolvedValue(null);
    const cmd = makeReviewCommand();
    await expect(cmd.parseAsync(["node", "test", "001"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should exit when no ref provided", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: {}, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue({ features: {} });
    const cmd = makeReviewCommand();
    await expect(cmd.parseAsync(["node", "test"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should exit when feature not found", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: {}, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue({ features: {} });
    mockResolveFeatureRef.mockResolvedValue(null);
    const cmd = makeReviewCommand();
    await expect(cmd.parseAsync(["node", "test", "999"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should generate review and save to file", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { powerful: "opus" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue({ features: { "001-auth": {} } });
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockGetDiff.mockResolvedValue("diff --git a/file.ts");
    mockChat.mockResolvedValue({
      content: "## Suggestions\n- Use better naming",
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const cmd = makeReviewCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(mockChat).toHaveBeenCalledTimes(1);
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("review.md"),
      "## Suggestions\n- Use better naming",
      "utf-8",
    );
  });

  it("should detect critical findings and warn", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { powerful: "opus" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue({ features: { "001-auth": {} } });
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockGetDiff.mockResolvedValue("diff --git a/file.ts");
    mockChat.mockResolvedValue({
      content: "## Critical\n- Security bug found\n## Suggestions\n- None",
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const cmd = makeReviewCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(p.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("Critical findings"),
    );
  });

  it("should fallback to unstaged diff when base diff fails", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { powerful: "opus" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue({ features: { "001-auth": {} } });
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockGetDiff
      .mockRejectedValueOnce(new Error("no base branch"))
      .mockResolvedValueOnce("diff --git a/fallback.ts");
    mockChat.mockResolvedValue({
      content: "## Suggestions\n- Minor improvement",
      usage: { inputTokens: 50, outputTokens: 25 },
    });

    const cmd = makeReviewCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(mockGetDiff).toHaveBeenCalledTimes(2);
    expect(mockChat).toHaveBeenCalledTimes(1);
  });

  it("should exit when diff is empty", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { powerful: "opus" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue({ features: { "001-auth": {} } });
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockGetDiff.mockResolvedValue("");

    const cmd = makeReviewCommand();
    await expect(cmd.parseAsync(["node", "test", "001"])).rejects.toThrow("process.exit");
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("should not warn when review has no critical findings", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { powerful: "opus" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue({ features: { "001-auth": {} } });
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockGetDiff.mockResolvedValue("diff --git a/file.ts");
    mockChat.mockResolvedValue({
      content: "## Critical\nNo critical issues found.\n## Suggestions\n- Minor fix",
      usage: { inputTokens: 100, outputTokens: 50 },
    });

    const cmd = makeReviewCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(p.log.warn).not.toHaveBeenCalled();
  });

  it("should handle LLM error and return early", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReadConfig.mockResolvedValue({ models: { powerful: "opus" }, contextMode: "normal" } as any);
    mockReadState.mockResolvedValue({ features: { "001-auth": {} } });
    mockResolveFeatureRef.mockResolvedValue("001-auth");
    mockGetDiff.mockResolvedValue("diff --git a/file.ts");
    mockChat.mockRejectedValue(new Error("API error"));

    const cmd = makeReviewCommand();
    await cmd.parseAsync(["node", "test", "001"]);

    expect(mockHandleLLMError).toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });
});
