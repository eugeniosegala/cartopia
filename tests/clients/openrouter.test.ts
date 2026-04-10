import { describe, expect, it } from "vitest";
import { callOpenRouter } from "../../src/clients/openrouter.js";
import {
  okCompletionResponse,
  setupMockFetch,
} from "../support/openrouter-mocks.js";

const mockFetch = setupMockFetch();

const options = {
  apiKey: "test-key",
  messages: [{ role: "user", content: "translate this" }],
  schemaName: "test_schema",
  schema: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
    additionalProperties: false,
  },
};

describe("callOpenRouter", () => {
  it("parses structured JSON responses directly", async () => {
    mockFetch.mockResolvedValueOnce(okCompletionResponse('{"value":"ok"}'));

    const result = await callOpenRouter<{ value: string }>(options);

    expect(result.data.value).toBe("ok");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("accepts JSON wrapped in markdown code fences", async () => {
    mockFetch.mockResolvedValueOnce(
      okCompletionResponse('```json\n{"value":"wrapped"}\n```'),
    );

    const result = await callOpenRouter<{ value: string }>(options);

    expect(result.data.value).toBe("wrapped");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("fails on malformed JSON instead of repairing the payload", async () => {
    mockFetch.mockResolvedValue(okCompletionResponse('{"value":"broken",}'));

    await expect(callOpenRouter<{ value: string }>(options)).rejects.toThrow(
      "Invalid JSON response from OpenRouter",
    );
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("includes reasoning.effort when thinkingEffort is set", async () => {
    mockFetch.mockResolvedValueOnce(okCompletionResponse('{"value":"ok"}'));

    await callOpenRouter<{ value: string }>({
      ...options,
      thinkingEffort: "high",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reasoning).toEqual({ effort: "high" });
  });

  it("omits reasoning when thinkingEffort is not set", async () => {
    mockFetch.mockResolvedValueOnce(okCompletionResponse('{"value":"ok"}'));

    await callOpenRouter<{ value: string }>(options);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reasoning).toBeUndefined();
  });

  it("omits reasoning when thinkingEffort is none", async () => {
    mockFetch.mockResolvedValueOnce(okCompletionResponse('{"value":"ok"}'));

    await callOpenRouter<{ value: string }>({
      ...options,
      thinkingEffort: "none",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reasoning).toBeUndefined();
  });

  it("passes effort level string directly for low", async () => {
    mockFetch.mockResolvedValueOnce(okCompletionResponse('{"value":"ok"}'));

    await callOpenRouter<{ value: string }>({
      ...options,
      thinkingEffort: "low",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reasoning).toEqual({ effort: "low" });
  });
});
