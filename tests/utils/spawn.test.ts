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
  spawnClaude,
} from "../../src/utils/spawn.js";

describe("spawnClaude tool-restriction guard", () => {
  it("refuses argv that was not built with a tool restriction", async () => {
    await expect(
      spawnClaude({ args: ["-p", "--output-format", "json", "hi"], cwd: process.cwd() }),
    ).rejects.toThrow(/without an effective --tools/);
  });

  it("refuses a --tools that sits after the -- separator", async () => {
    // Past the separator it is prompt text, not a flag, so it restricts nothing.
    await expect(
      spawnClaude({ args: ["-p", "--", "--tools"], cwd: process.cwd() }),
    ).rejects.toThrow(/without an effective --tools/);
  });

  it("refuses a --tools with no value of its own", async () => {
    await expect(
      spawnClaude({ args: ["--tools", "--", "prompt"], cwd: process.cwd() }),
    ).rejects.toThrow(/without an effective --tools/);
    await expect(
      spawnClaude({ args: ["-p", "--tools", "--output-format", "json"], cwd: process.cwd() }),
    ).rejects.toThrow(/without an effective --tools/);
  });

  it("refuses argv with more than one --tools before the separator", async () => {
    // With repeated flags the CLI parser decides which wins, so a permissive
    // second occurrence could override a restrictive first.
    await expect(
      spawnClaude({
        args: ["-p", "--tools", "Read", "--tools", "default", "--output-format", "json"],
        cwd: process.cwd(),
      }),
    ).rejects.toThrow(/without an effective --tools/);
  });

  it("accepts a --tools that precedes the -- separator", async () => {
    // Not a spawn test: it must get past the guard, so it fails later instead.
    await expect(
      spawnClaude({
        args: ["-p", "--tools", "Read", "--output-format", "json", "--", "hi"],
        cwd: "/nonexistent-dir-for-guard-test",
      }),
    ).rejects.not.toThrow(/without an effective --tools/);
  });

  it("does not leak a concurrency slot when it refuses", async () => {
    resetConcurrency();
    await expect(
      spawnClaude({ args: ["-p"], cwd: process.cwd() }),
    ).rejects.toThrow(/without an effective --tools/);
    expect(getActiveCount()).toBe(0);
    expect(getQueueDepth()).toBe(0);
  });
});

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

  const NO_TOOLS: { tools: string[] } = { tools: [] };

  it("uses non-bare mode with --setting-sources for subscription auth", () => {
    const args = buildClaudeArgs({ ...NO_TOOLS });
    expect(args).toContain("-p");
    expect(args).toContain("--setting-sources");
    expect(args).not.toContain("--bare");
    expect(args).not.toContain("--disable-slash-commands");
  });

  it("uses --bare for API key auth", () => {
    process.env["CLAUDE_BRIDGE_USE_API_KEY"] = "1";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
    const args = buildClaudeArgs({ ...NO_TOOLS });
    expect(args).toContain("--bare");
    expect(args).not.toContain("--setting-sources");
  });

  it("forwards model", () => {
    const args = buildClaudeArgs({ ...NO_TOOLS, model: "opus" });
    expect(args).toContain("--model=opus");
  });

  it("forwards fallback model", () => {
    const args = buildClaudeArgs({ ...NO_TOOLS, fallbackModel: "haiku" });
    expect(args).toContain("--fallback-model=haiku");
  });

  it("binds dash-prefixed model and effort rather than emitting them as bare tokens", () => {
    // Both are caller-supplied via MCP input. The `=` form means this holds
    // regardless of whether the CLI declares their values required or optional.
    const args = buildClaudeArgs({ ...NO_TOOLS, model: "--version", effort: "--version" });
    expect(args).toContain("--model=--version");
    expect(args).toContain("--effort=--version");
    expect(args).not.toContain("--version");
  });

  it("forwards maxBudgetUsd when positive", () => {
    const args = buildClaudeArgs({ ...NO_TOOLS, maxBudgetUsd: 0.5 });
    expect(args).toContain("--max-budget-usd");
    expect(args).toContain("0.5");
  });

  it("omits maxBudgetUsd when zero", () => {
    const args = buildClaudeArgs({ ...NO_TOOLS, maxBudgetUsd: 0 });
    expect(args).not.toContain("--max-budget-usd");
  });

  it("forwards effort", () => {
    const args = buildClaudeArgs({ ...NO_TOOLS, effort: "high" });
    expect(args).toContain("--effort=high");
  });

  it("forwards sessionId as --resume", () => {
    const args = buildClaudeArgs({ ...NO_TOOLS, sessionId: "sess-1" });
    expect(args).toContain("--resume=sess-1");
  });

  it("binds a dash-prefixed sessionId to --resume instead of letting it detach", () => {
    // --resume takes an optional value, so the space form would let a
    // dash-prefixed id be parsed as a flag of its own.
    const args = buildClaudeArgs({ ...NO_TOOLS, sessionId: "--version" });
    expect(args).toContain("--resume=--version");
    expect(args).not.toContain("--version");
  });

  it("ends option parsing before the caller-supplied prompt", () => {
    const args = buildClaudeArgs({ ...NO_TOOLS, prompt: "hello" });
    expect(args[args.length - 2]).toBe("--");
    expect(args[args.length - 1]).toBe("hello");
  });

  it("keeps a flag-shaped prompt positional", () => {
    // Without the -- separator this is parsed as an option and overrides the
    // tool restriction set earlier in the argv.
    const injection = '--settings={"hooks":{"SessionStart":[]}}';
    const args = buildClaudeArgs({ tools: ["Read"], prompt: injection });
    expect(args[args.length - 2]).toBe("--");
    expect(args[args.length - 1]).toBe(injection);
    expect(args.indexOf(injection)).toBeGreaterThan(args.indexOf("--"));
  });

  it("rejects a tool name that would be parsed as a flag", () => {
    expect(() => buildClaudeArgs({ tools: ["Read", "--add-dir=/"] })).toThrow(/Invalid tool name/);
    expect(() => buildClaudeArgs({ tools: ["Bash(git *)"] })).toThrow(/Invalid tool name/);
  });

  it("accepts plain identifier tool names", () => {
    expect(() => buildClaudeArgs({ tools: ["Read", "WebSearch", "mcp__srv__tool", "default"] })).not.toThrow();
  });

  it("accepts hyphenated MCP tool names", () => {
    // MCP identifiers carry the server name, which may contain hyphens.
    expect(() => buildClaudeArgs({ tools: ["mcp__claude-in-chrome__navigate"] })).not.toThrow();
    // A leading dash is still rejected: that is the injection shape.
    expect(() => buildClaudeArgs({ tools: ["-tools"] })).toThrow(/Invalid tool name/);
  });

  it("forwards noSessionPersistence", () => {
    const args = buildClaudeArgs({ ...NO_TOOLS, noSessionPersistence: true });
    expect(args).toContain("--no-session-persistence");
  });

  it("passes each tool as its own argv element", () => {
    // A single comma-joined value silently keeps only the first tool.
    const args = buildClaudeArgs({ tools: ["Read", "Glob", "Grep"] });
    const i = args.indexOf("--tools");
    expect(args.slice(i + 1, i + 4)).toEqual(["Read", "Glob", "Grep"]);
    expect(args).not.toContain("Read,Glob,Grep");
  });

  it("emits an empty --tools value to grant no tools", () => {
    const args = buildClaudeArgs({ tools: [] });
    const i = args.indexOf("--tools");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(args[i + 1]).toBe("");
  });

  it("also pre-approves the same tools via --allowed-tools", () => {
    // --tools makes a tool available; --allowed-tools permits it. WebSearch is
    // not auto-approved, so omitting the second flag stalls on a permission ask.
    const args = buildClaudeArgs({ tools: ["WebSearch", "WebFetch"] });
    const i = args.indexOf("--allowed-tools");
    expect(args[i + 1]).toBe("WebSearch WebFetch");
  });

  it("omits --allowed-tools when no tools are granted", () => {
    const args = buildClaudeArgs({ tools: [] });
    expect(args).not.toContain("--allowed-tools");
  });

  it("terminates the variadic --tools list with a following flag", () => {
    // --tools is variadic and would otherwise swallow the positional prompt.
    const args = buildClaudeArgs({ tools: ["Read", "Glob"], prompt: "hi" });
    const i = args.indexOf("--tools");
    expect(args[i + 3]).toBe("--allowed-tools");
    expect(args).toContain("--output-format");
  });

  it("keeps the prompt positional when tools are set", () => {
    const args = buildClaudeArgs({ tools: ["Read", "Glob"], prompt: "Hello world" });
    expect(args[args.length - 1]).toBe("Hello world");
    const i = args.indexOf("--tools");
    expect(args.slice(i + 1, i + 3)).not.toContain("Hello world");
  });

  it("forwards jsonSchema", () => {
    const schema = '{"type":"object"}';
    const args = buildClaudeArgs({ ...NO_TOOLS, jsonSchema: schema });
    expect(args).toContain("--json-schema");
    expect(args).toContain(schema);
  });

  it("appends prompt as last positional arg", () => {
    const args = buildClaudeArgs({ ...NO_TOOLS, prompt: "Hello world" });
    expect(args[args.length - 1]).toBe("Hello world");
  });

  it("builds minimal args with no options", () => {
    const args = buildClaudeArgs({ ...NO_TOOLS });
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
