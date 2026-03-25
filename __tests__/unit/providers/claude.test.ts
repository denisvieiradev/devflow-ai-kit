import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { DEFAULT_CONFIG } from "../../../src/core/types.js";
import type { ChatParams } from "../../../src/providers/types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCreate = jest.fn<(...args: any[]) => any>();

jest.unstable_mockModule("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
      constructor() {}
      static APIError = class extends Error {
        status: number;
        constructor(status: number, _error: unknown, message: string | undefined, _headers: unknown) {
          super(message ?? "API Error");
          this.status = status;
        }
      };
    },
  };
});

describe("ClaudeProvider", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ClaudeProvider: any;

  beforeEach(async () => {
    mockCreate.mockReset();
    const mod = await import("../../../src/providers/claude.js");
    ClaudeProvider = mod.ClaudeProvider;
  });

  it("should call API with correct parameters", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "Hello world" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const provider = new ClaudeProvider(DEFAULT_CONFIG);
    const params: ChatParams = {
      systemPrompt: "You are a helper",
      messages: [{ role: "user", content: "Say hello" }],
      model: "fast",
    };
    const result = await provider.chat(params);
    expect(result.content).toBe("Hello world");
    expect(result.usage.inputTokens).toBe(10);
    expect(result.usage.outputTokens).toBe(5);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: DEFAULT_CONFIG.models.fast,
        system: "You are a helper",
        messages: [{ role: "user", content: "Say hello" }],
      }),
    );
  });

  it("should use balanced tier by default", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "response" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const provider = new ClaudeProvider(DEFAULT_CONFIG);
    const params: ChatParams = {
      systemPrompt: "test",
      messages: [{ role: "user", content: "test" }],
    };
    await provider.chat(params);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: DEFAULT_CONFIG.models.balanced,
      }),
    );
  });

  it("should concatenate multiple text blocks", async () => {
    mockCreate.mockResolvedValue({
      content: [
        { type: "text", text: "Part 1 " },
        { type: "text", text: "Part 2" },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const provider = new ClaudeProvider(DEFAULT_CONFIG);
    const params: ChatParams = {
      systemPrompt: "test",
      messages: [{ role: "user", content: "test" }],
    };
    const result = await provider.chat(params);
    expect(result.content).toBe("Part 1 Part 2");
  });

  it("should throw on non-retryable errors", async () => {
    mockCreate.mockRejectedValue(new Error("Bad request"));
    const provider = new ClaudeProvider(DEFAULT_CONFIG);
    const params: ChatParams = {
      systemPrompt: "test",
      messages: [{ role: "user", content: "test" }],
    };
    await expect(provider.chat(params)).rejects.toThrow("Bad request");
  });

  it("should retry on 429 rate limit errors", async () => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const apiError = new Anthropic.APIError(429, undefined, "Rate limited", {});
    mockCreate
      .mockRejectedValueOnce(apiError)
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "success after retry" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    const provider = new ClaudeProvider(DEFAULT_CONFIG);
    const params: ChatParams = {
      systemPrompt: "test",
      messages: [{ role: "user", content: "test" }],
    };
    const result = await provider.chat(params);
    expect(result.content).toBe("success after retry");
    expect(mockCreate).toHaveBeenCalledTimes(2);
  }, 15000);

  it("should retry on 529 overloaded errors", async () => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const apiError = new Anthropic.APIError(529, undefined, "Overloaded", {});
    mockCreate
      .mockRejectedValueOnce(apiError)
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "recovered" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    const provider = new ClaudeProvider(DEFAULT_CONFIG);
    const params: ChatParams = {
      systemPrompt: "test",
      messages: [{ role: "user", content: "test" }],
    };
    const result = await provider.chat(params);
    expect(result.content).toBe("recovered");
    expect(mockCreate).toHaveBeenCalledTimes(2);
  }, 15000);

  it("should throw after max retries exhausted", async () => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const apiError = new Anthropic.APIError(429, undefined, "Rate limited", {});
    mockCreate
      .mockRejectedValueOnce(apiError)
      .mockRejectedValueOnce(apiError)
      .mockRejectedValueOnce(apiError);
    const provider = new ClaudeProvider(DEFAULT_CONFIG);
    const params: ChatParams = {
      systemPrompt: "test",
      messages: [{ role: "user", content: "test" }],
    };
    await expect(provider.chat(params)).rejects.toThrow();
    expect(mockCreate).toHaveBeenCalledTimes(3);
  }, 30000);

  it("should not retry on 401 auth errors", async () => {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const apiError = new Anthropic.APIError(401, undefined, "Unauthorized", {});
    mockCreate.mockRejectedValue(apiError);
    const provider = new ClaudeProvider(DEFAULT_CONFIG);
    const params: ChatParams = {
      systemPrompt: "test",
      messages: [{ role: "user", content: "test" }],
    };
    await expect(provider.chat(params)).rejects.toThrow();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("should use custom maxTokens when provided", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const provider = new ClaudeProvider(DEFAULT_CONFIG);
    const params: ChatParams = {
      systemPrompt: "test",
      messages: [{ role: "user", content: "test" }],
      maxTokens: 8192,
    };
    await provider.chat(params);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 8192 }),
    );
  });

  it("should handle non-Error thrown values", async () => {
    mockCreate.mockRejectedValue("string error");
    const provider = new ClaudeProvider(DEFAULT_CONFIG);
    const params: ChatParams = {
      systemPrompt: "test",
      messages: [{ role: "user", content: "test" }],
    };
    await expect(provider.chat(params)).rejects.toThrow("string error");
  });
});
