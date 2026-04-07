import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDefaultModel, getFallbackModel, resolveModel, resolveEffort, resolveMaxBudget } from "../../src/utils/model.js";

describe("model", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env["CLAUDE_DEFAULT_MODEL"];
    delete process.env["CLAUDE_QUERY_MODEL"];
    delete process.env["CLAUDE_FALLBACK_MODEL"];
    delete process.env["CLAUDE_REVIEW_EFFORT"];
    delete process.env["CLAUDE_MAX_BUDGET_USD"];
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns built-in defaults per tool", () => {
    expect(getDefaultModel("query")).toBe("sonnet");
    expect(getDefaultModel("review")).toBe("opus");
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
    delete process.env["CLAUDE_REVIEW_EFFORT"];
    delete process.env["CLAUDE_QUERY_EFFORT"];
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns built-in effort defaults per tool", () => {
    expect(resolveEffort("review")).toBe("high");
    expect(resolveEffort("search")).toBe("medium");
    expect(resolveEffort("query")).toBeUndefined();
    expect(resolveEffort("ping")).toBeUndefined();
  });

  it("prefers explicit value over default", () => {
    expect(resolveEffort("query", "max")).toBe("max");
    expect(resolveEffort("review", "low")).toBe("low");
  });

  it("uses env override over built-in default", () => {
    process.env["CLAUDE_REVIEW_EFFORT"] = "low";
    expect(resolveEffort("review")).toBe("low");
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
