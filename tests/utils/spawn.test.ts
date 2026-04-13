import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildClaudeArgs,
  findClaudeBinary,
  clampTimeout,
  HARD_TIMEOUT_CAP,
  STDIN_THRESHOLD,
  getActiveCount,
  getQueueDepth,
  getMaxConcurrent,
  resetConcurrency,
} from "../../src/utils/spawn.js";

describe("STDIN_THRESHOLD", () => {
  it("is 4000", () => {
    expect(STDIN_THRESHOLD).toBe(4000);
  });
});

describe("clampTimeout", () => {
  it("returns requested timeout when under cap", () => {
    expect(clampTimeout(30_000, 60_000)).toBe(30_000);
  });

  it("falls back to default when requested is undefined", () => {
    expect(clampTimeout(undefined, 120_000)).toBe(120_000);
  });

  it("clamps to HARD_TIMEOUT_CAP when requested exceeds it", () => {
    expect(clampTimeout(999_999, 60_000)).toBe(HARD_TIMEOUT_CAP);
  });

  it("clamps default to HARD_TIMEOUT_CAP when default exceeds it", () => {
    expect(clampTimeout(undefined, 999_999)).toBe(HARD_TIMEOUT_CAP);
  });

  it("clamps negative values to zero", () => {
    expect(clampTimeout(-1, 60_000)).toBe(0);
    expect(clampTimeout(-999, 60_000)).toBe(0);
  });

  it("clamps negative default to zero", () => {
    expect(clampTimeout(undefined, -100)).toBe(0);
  });

  it("returns exact cap value when requested equals cap", () => {
    expect(clampTimeout(HARD_TIMEOUT_CAP, 60_000)).toBe(HARD_TIMEOUT_CAP);
  });
});

describe("findClaudeBinary", () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns 'claude' by default", () => {
    delete process.env["CLAUDE_CLI_PATH"];
    expect(findClaudeBinary()).toBe("claude");
  });

  it("returns CLAUDE_CLI_PATH when set", () => {
    process.env["CLAUDE_CLI_PATH"] = "/usr/local/bin/claude-dev";
    expect(findClaudeBinary()).toBe("/usr/local/bin/claude-dev");
  });
});

describe("buildClaudeArgs", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env["CLAUDE_BRIDGE_USE_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("uses non-bare mode with --setting-sources for subscription auth", () => {
    const args = buildClaudeArgs({});
    expect(args).toContain("-p");
    expect(args).toContain("--disable-slash-commands");
    expect(args).toContain("--setting-sources");
    expect(args).not.toContain("--bare");
  });

  it("uses --bare for API key auth", () => {
    process.env["CLAUDE_BRIDGE_USE_API_KEY"] = "1";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
    const args = buildClaudeArgs({});
    expect(args).toContain("--bare");
    expect(args).not.toContain("--setting-sources");
  });

  it("forwards model", () => {
    const args = buildClaudeArgs({ model: "opus" });
    expect(args).toContain("--model");
    expect(args).toContain("opus");
  });

  it("forwards fallback model", () => {
    const args = buildClaudeArgs({ fallbackModel: "haiku" });
    expect(args).toContain("--fallback-model");
    expect(args).toContain("haiku");
  });

  it("forwards maxBudgetUsd when positive", () => {
    const args = buildClaudeArgs({ maxBudgetUsd: 0.5 });
    expect(args).toContain("--max-budget-usd");
    expect(args).toContain("0.5");
  });

  it("omits maxBudgetUsd when zero", () => {
    const args = buildClaudeArgs({ maxBudgetUsd: 0 });
    expect(args).not.toContain("--max-budget-usd");
  });

  it("forwards effort", () => {
    const args = buildClaudeArgs({ effort: "high" });
    expect(args).toContain("--effort");
    expect(args).toContain("high");
  });

  it("forwards sessionId as --resume", () => {
    const args = buildClaudeArgs({ sessionId: "sess-1" });
    expect(args).toContain("--resume");
    expect(args).toContain("sess-1");
  });

  it("forwards noSessionPersistence", () => {
    const args = buildClaudeArgs({ noSessionPersistence: true });
    expect(args).toContain("--no-session-persistence");
  });

  it("forwards allowedTools as space-joined string", () => {
    const args = buildClaudeArgs({ allowedTools: ["Read", "Grep"] });
    expect(args).toContain("--allowed-tools");
    expect(args).toContain("Read Grep");
  });

  it("omits allowedTools when empty", () => {
    const args = buildClaudeArgs({ allowedTools: [] });
    expect(args).not.toContain("--allowed-tools");
  });

  it("forwards jsonSchema", () => {
    const schema = '{"type":"object"}';
    const args = buildClaudeArgs({ jsonSchema: schema });
    expect(args).toContain("--json-schema");
    expect(args).toContain(schema);
  });

  it("appends prompt as last positional arg", () => {
    const args = buildClaudeArgs({ prompt: "Hello world" });
    expect(args[args.length - 1]).toBe("Hello world");
  });

  it("builds minimal args with no options", () => {
    const args = buildClaudeArgs({});
    expect(args).toContain("-p");
    expect(args).toContain("--output-format");
    expect(args).toContain("json");
  });
});

describe("concurrency state", () => {
  beforeEach(() => {
    resetConcurrency();
  });

  it("starts with zero active count", () => {
    expect(getActiveCount()).toBe(0);
  });

  it("starts with zero queue depth", () => {
    expect(getQueueDepth()).toBe(0);
  });

  it("returns configured max concurrent", () => {
    expect(getMaxConcurrent()).toBeGreaterThan(0);
  });

  it("resetConcurrency clears state", () => {
    // Just verifying the function works without error
    resetConcurrency();
    expect(getActiveCount()).toBe(0);
    expect(getQueueDepth()).toBe(0);
  });
});
