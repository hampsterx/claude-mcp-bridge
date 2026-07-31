import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDefaultModel, getFallbackModel, resolveModel, resolveEffort, resolveMaxBudget, resolveTools } from "../../src/utils/model.js";

describe("model", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env["CLAUDE_DEFAULT_MODEL"];
    delete process.env["CLAUDE_QUERY_MODEL"];
    delete process.env["CLAUDE_STRUCTURED_MODEL"];
    delete process.env["CLAUDE_SEARCH_MODEL"];
    delete process.env["CLAUDE_PING_MODEL"];
    delete process.env["CLAUDE_FALLBACK_MODEL"];
    delete process.env["CLAUDE_MAX_BUDGET_USD"];
    delete process.env["CLAUDE_QUERY_TOOLS"];
    delete process.env["CLAUDE_STRUCTURED_TOOLS"];
    delete process.env["CLAUDE_SEARCH_TOOLS"];
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns built-in defaults per tool", () => {
    expect(getDefaultModel("query")).toBe("sonnet");
    expect(getDefaultModel("structured")).toBe("sonnet");
    expect(getDefaultModel("ping")).toBe("haiku");
  });

  it("prefers tool-specific env over shared default", () => {
    process.env["CLAUDE_DEFAULT_MODEL"] = "haiku";
    process.env["CLAUDE_QUERY_MODEL"] = "sonnet";
    expect(getDefaultModel("query")).toBe("sonnet");
  });

  it("defaults fallback to haiku", () => {
    expect(getFallbackModel()).toBe("haiku");
  });

  it("allows fallback to be disabled", () => {
    process.env["CLAUDE_FALLBACK_MODEL"] = "none";
    expect(getFallbackModel()).toBeUndefined();
  });

  it("uses explicit model when provided", () => {
    expect(resolveModel("query", "opus")).toBe("opus");
  });
});

describe("resolveEffort", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env["CLAUDE_SEARCH_EFFORT"];
    delete process.env["CLAUDE_QUERY_EFFORT"];
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns built-in effort defaults per tool", () => {
    expect(resolveEffort("search")).toBe("medium");
    expect(resolveEffort("query")).toBeUndefined();
    expect(resolveEffort("ping")).toBeUndefined();
  });

  it("prefers explicit value over default", () => {
    expect(resolveEffort("query", "max")).toBe("max");
    expect(resolveEffort("search", "low")).toBe("low");
  });

  it("uses env override over built-in default", () => {
    process.env["CLAUDE_SEARCH_EFFORT"] = "low";
    expect(resolveEffort("search")).toBe("low");
  });
});

describe("resolveMaxBudget", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env["CLAUDE_MAX_BUDGET_USD"];
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns 0 when not set", () => {
    expect(resolveMaxBudget()).toBe(0);
  });

  it("uses explicit value", () => {
    expect(resolveMaxBudget(2.50)).toBe(2.50);
  });

  it("uses env var when no explicit value", () => {
    process.env["CLAUDE_MAX_BUDGET_USD"] = "1.50";
    expect(resolveMaxBudget()).toBe(1.50);
  });

  it("prefers explicit value over env var", () => {
    process.env["CLAUDE_MAX_BUDGET_USD"] = "1.50";
    expect(resolveMaxBudget(3.00)).toBe(3.00);
  });

  it("ignores zero and negative explicit values", () => {
    expect(resolveMaxBudget(0)).toBe(0);
    expect(resolveMaxBudget(-1)).toBe(0);
  });
});

describe("resolveTools", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env["CLAUDE_QUERY_TOOLS"];
    delete process.env["CLAUDE_STRUCTURED_TOOLS"];
    delete process.env["CLAUDE_SEARCH_TOOLS"];
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("defaults to read-only tools for query and structured", () => {
    expect(resolveTools("query")).toEqual(["Read", "Glob", "Grep"]);
    expect(resolveTools("structured")).toEqual(["Read", "Glob", "Grep"]);
  });

  it("defaults search to web tools only", () => {
    expect(resolveTools("search")).toEqual(["WebSearch", "WebFetch"]);
  });

  it("never grants execution or mutation tools by default", () => {
    for (const tool of ["query", "structured", "search"] as const) {
      for (const forbidden of ["Bash", "Write", "Edit"]) {
        expect(resolveTools(tool)).not.toContain(forbidden);
      }
    }
  });

  it("accepts a comma or space separated env override", () => {
    process.env["CLAUDE_QUERY_TOOLS"] = "Read, Grep";
    expect(resolveTools("query")).toEqual(["Read", "Grep"]);
    process.env["CLAUDE_QUERY_TOOLS"] = "Read Grep";
    expect(resolveTools("query")).toEqual(["Read", "Grep"]);
  });

  it("treats an empty env override as no tools", () => {
    process.env["CLAUDE_QUERY_TOOLS"] = "";
    expect(resolveTools("query")).toEqual([]);
    process.env["CLAUDE_QUERY_TOOLS"] = "   ";
    expect(resolveTools("query")).toEqual([]);
  });

  it("passes through the CLI's default keyword", () => {
    process.env["CLAUDE_STRUCTURED_TOOLS"] = "default";
    expect(resolveTools("structured")).toEqual(["default"]);
  });
});
