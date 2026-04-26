import { describe, it, expect } from "vitest";
import { loadPrompt, buildLengthLimit, appendLengthLimit } from "../../src/utils/prompts.js";

describe("loadPrompt", () => {
  it("loads and fills placeholders from search.md", () => {
    const result = loadPrompt("search.md", {
      QUERY: "what is MCP",
      LENGTH_LIMIT: "Keep it short.",
    });
    expect(result).toContain("what is MCP");
    expect(result).toContain("Keep it short.");
  });

  it("passes through unknown placeholders unchanged", () => {
    const result = loadPrompt("search.md", {
      QUERY: "test query",
      // Deliberately omit LENGTH_LIMIT
    });
    expect(result).toContain("test query");
    expect(result).toContain("{{LENGTH_LIMIT}}");
  });

  it("resists placeholder collision in user-supplied text", () => {
    // User query text contains a string that looks like a placeholder
    const maliciousQuery = "The template uses {{LENGTH_LIMIT}} for limits";
    const result = loadPrompt("search.md", {
      QUERY: maliciousQuery,
      LENGTH_LIMIT: "500 words max",
    });
    // The {{LENGTH_LIMIT}} inside the query text should NOT be replaced
    // because single-pass replacement processes each placeholder position once
    expect(result).toContain("The template uses {{LENGTH_LIMIT}} for limits");
    // The actual LENGTH_LIMIT placeholder in the template should be replaced
    expect(result).toContain("500 words max");
  });

  it("throws for missing template file", () => {
    expect(() => loadPrompt("nonexistent.md", {})).toThrow();
  });
});

describe("buildLengthLimit", () => {
  it("returns empty string when no limit", () => {
    expect(buildLengthLimit()).toBe("");
    expect(buildLengthLimit(undefined)).toBe("");
  });

  it("returns empty string for zero or negative", () => {
    expect(buildLengthLimit(0)).toBe("");
    expect(buildLengthLimit(-10)).toBe("");
  });

  it("returns instruction string for positive value", () => {
    const result = buildLengthLimit(500);
    expect(result).toContain("500 words");
  });
});

describe("appendLengthLimit", () => {
  it("is a no-op when maxWords is undefined", () => {
    expect(appendLengthLimit("prompt text")).toBe("prompt text");
  });

  it("is a no-op when maxWords is zero", () => {
    expect(appendLengthLimit("prompt text", 0)).toBe("prompt text");
  });

  it("appends limit instruction when maxWords is positive", () => {
    const result = appendLengthLimit("prompt text", 300);
    expect(result).toContain("prompt text");
    expect(result).toContain("300 words");
  });
});
