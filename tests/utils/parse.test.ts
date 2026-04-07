import { describe, it, expect } from "vitest";
import { parseClaudeOutput, extractJson, redactSecrets, tryParsePartial } from "../../src/utils/parse.js";

describe("parseClaudeOutput", () => {
  it("parses Claude JSON result objects", () => {
    const json = JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      result: "test response",
      session_id: "session-123",
      total_cost_usd: 0.01,
      usage: { input_tokens: 1, output_tokens: 2 },
    });
    const result = parseClaudeOutput(json, "");
    expect(result.response).toBe("test response");
    expect(result.sessionId).toBe("session-123");
    expect(result.totalCostUsd).toBe(0.01);
    expect(result.isError).toBe(false);
  });

  it("parses Claude JSON errors while preserving message", () => {
    const json = JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: true,
      result: "Credit balance is too low",
    });
    const result = parseClaudeOutput(json, "");
    expect(result.response).toBe("Credit balance is too low");
    expect(result.isError).toBe(true);
  });

  it("falls back to plain text when output is not JSON", () => {
    const result = parseClaudeOutput("Hello world", "");
    expect(result.response).toBe("Hello world");
  });

  it("throws on empty output", () => {
    expect(() => parseClaudeOutput("", "")).toThrow("no output");
  });

  it("redacts API keys in output", () => {
    const result = parseClaudeOutput("Key: sk-ant-apiabcdefghijklmnopqrstuvwxyz", "");
    expect(result.response).not.toContain("sk-ant-apiabcdefghijklmnopqrstuvwxyz");
    expect(result.response).toContain("[REDACTED]");
  });
});

describe("tryParsePartial", () => {
  it("returns parsed partial text when possible", () => {
    expect(tryParsePartial("partial response", "", 5000)).toContain("partial response");
  });
});

describe("extractJson", () => {
  it("extracts raw JSON", () => {
    const result = extractJson('{"key": "value"}');
    expect(result).not.toBeNull();
    expect((result!.json as Record<string, string>).key).toBe("value");
  });

  it("extracts JSON from markdown fences", () => {
    const result = extractJson('```json\n{"key": "value"}\n```');
    expect(result).not.toBeNull();
    expect((result!.json as Record<string, string>).key).toBe("value");
  });

  it("returns null for non-JSON", () => {
    expect(extractJson("just plain text")).toBeNull();
  });
});

describe("redactSecrets", () => {
  it("redacts Anthropic API keys", () => {
    expect(redactSecrets("key is sk-ant-apiabcdefghijklmnopqrstuvwxyz")).toContain("[REDACTED]");
  });

  it("redacts Bearer tokens", () => {
    expect(redactSecrets("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6.abcdefghijklmnopqrstuvwxyz")).toContain("[REDACTED]");
  });

  it("redacts base64 key patterns", () => {
    const longKey = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuv==";
    expect(redactSecrets(`secret: ${longKey}`)).not.toContain(longKey);
    expect(redactSecrets(`secret: ${longKey}`)).toContain("[REDACTED]");
  });
});
