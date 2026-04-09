import { describe, it, expect } from "vitest";
import { buildMeta } from "../../src/utils/meta.js";

describe("buildMeta", () => {
  it("always includes durationMs", () => {
    const meta = buildMeta({ durationMs: 1234 });
    expect(meta).toEqual({ durationMs: 1234 });
  });

  it("includes all fields when provided", () => {
    const meta = buildMeta({
      durationMs: 5000,
      model: "sonnet",
      sessionId: "sess-abc",
      totalCostUsd: 0.042,
      usage: {
        input_tokens: 1500,
        output_tokens: 300,
        cache_read_input_tokens: 800,
      },
      timedOut: true,
    });

    expect(meta).toEqual({
      durationMs: 5000,
      model: "sonnet",
      sessionId: "sess-abc",
      totalCostUsd: 0.042,
      inputTokens: 1500,
      outputTokens: 300,
      cacheReadTokens: 800,
      timedOut: true,
    });
  });

  it("omits undefined optional fields", () => {
    const meta = buildMeta({
      durationMs: 100,
      model: "opus",
    });

    expect(meta).toEqual({ durationMs: 100, model: "opus" });
    expect(meta).not.toHaveProperty("sessionId");
    expect(meta).not.toHaveProperty("totalCostUsd");
    expect(meta).not.toHaveProperty("inputTokens");
    expect(meta).not.toHaveProperty("outputTokens");
    expect(meta).not.toHaveProperty("cacheReadTokens");
    expect(meta).not.toHaveProperty("timedOut");
  });

  it("includes totalCostUsd when zero", () => {
    const meta = buildMeta({ durationMs: 50, totalCostUsd: 0 });
    expect(meta.totalCostUsd).toBe(0);
  });

  it("omits timedOut when false", () => {
    const meta = buildMeta({ durationMs: 50, timedOut: false });
    expect(meta).not.toHaveProperty("timedOut");
  });

  it("handles usage with only input_tokens", () => {
    const meta = buildMeta({
      durationMs: 200,
      usage: { input_tokens: 500 },
    });

    expect(meta.inputTokens).toBe(500);
    expect(meta).not.toHaveProperty("outputTokens");
    expect(meta).not.toHaveProperty("cacheReadTokens");
  });

  it("handles usage with zero token values", () => {
    const meta = buildMeta({
      durationMs: 200,
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 },
    });

    expect(meta.inputTokens).toBe(0);
    expect(meta.outputTokens).toBe(0);
    expect(meta.cacheReadTokens).toBe(0);
  });

  it("ignores extra usage fields", () => {
    const meta = buildMeta({
      durationMs: 200,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        server_tool_use: { web_search_requests: 3 },
      },
    });

    expect(meta.inputTokens).toBe(100);
    expect(meta.outputTokens).toBe(50);
    expect(meta).not.toHaveProperty("server_tool_use");
  });

  it("error path: durationMs only", () => {
    const meta = buildMeta({ durationMs: 750 });
    expect(Object.keys(meta)).toEqual(["durationMs"]);
    expect(meta.durationMs).toBe(750);
  });
});
