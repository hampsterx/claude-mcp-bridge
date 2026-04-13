import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildSubprocessEnv, isApiKeyAuth } from "../../src/utils/env.js";

describe("buildSubprocessEnv", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env["ANTHROPIC_API_KEY"];
    delete process.env["CLAUDE_BRIDGE_USE_API_KEY"];
    delete process.env["CLAUDE_CONFIG_DIR"];
    delete process.env["CLAUDE_CODE_USE_BEDROCK"];
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("always sets NO_COLOR and FORCE_COLOR", () => {
    const env = buildSubprocessEnv();
    expect(env["NO_COLOR"]).toBe("1");
    expect(env["FORCE_COLOR"]).toBe("0");
  });

  it("excludes ANTHROPIC_API_KEY by default (subscription auth)", () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-api-test";
    const env = buildSubprocessEnv();
    expect(env["ANTHROPIC_API_KEY"]).toBeUndefined();
  });

  it("includes ANTHROPIC_API_KEY when CLAUDE_BRIDGE_USE_API_KEY=1", () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-api-test";
    process.env["CLAUDE_BRIDGE_USE_API_KEY"] = "1";
    const env = buildSubprocessEnv();
    expect(env["ANTHROPIC_API_KEY"]).toBe("sk-ant-api-test");
  });

  it("does not forward ANTHROPIC_API_KEY for non-1 opt-in values", () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-api-test";
    process.env["CLAUDE_BRIDGE_USE_API_KEY"] = "true";
    const env = buildSubprocessEnv();
    expect(env["ANTHROPIC_API_KEY"]).toBeUndefined();
  });

  it("does not include ANTHROPIC_API_KEY when CLAUDE_BRIDGE_USE_API_KEY=1 but key absent", () => {
    process.env["CLAUDE_BRIDGE_USE_API_KEY"] = "1";
    const env = buildSubprocessEnv();
    expect(env["ANTHROPIC_API_KEY"]).toBeUndefined();
  });

  it("includes Claude config keys", () => {
    process.env["CLAUDE_CONFIG_DIR"] = "/tmp/claude";
    const env = buildSubprocessEnv();
    expect(env["CLAUDE_CONFIG_DIR"]).toBe("/tmp/claude");
  });

  it("includes system essentials", () => {
    process.env["HOME"] = "/home/test";
    process.env["PATH"] = "/usr/bin";
    const env = buildSubprocessEnv();
    expect(env["HOME"]).toBe("/home/test");
    expect(env["PATH"]).toBe("/usr/bin");
  });

  it("excludes non-allowlisted vars", () => {
    process.env["SECRET_KEY"] = "should-not-appear";
    const env = buildSubprocessEnv();
    expect(env["SECRET_KEY"]).toBeUndefined();
  });

  it("skips empty values", () => {
    process.env["ANTHROPIC_API_KEY"] = "";
    process.env["CLAUDE_BRIDGE_USE_API_KEY"] = "1";
    const env = buildSubprocessEnv();
    expect(env["ANTHROPIC_API_KEY"]).toBeUndefined();
  });
});

describe("isApiKeyAuth", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env["ANTHROPIC_API_KEY"];
    delete process.env["CLAUDE_BRIDGE_USE_API_KEY"];
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("returns false by default (subscription auth)", () => {
    expect(isApiKeyAuth()).toBe(false);
  });

  it("returns true when opt-in and key present", () => {
    process.env["CLAUDE_BRIDGE_USE_API_KEY"] = "1";
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
    expect(isApiKeyAuth()).toBe(true);
  });

  it("returns false when opt-in but key absent", () => {
    process.env["CLAUDE_BRIDGE_USE_API_KEY"] = "1";
    expect(isApiKeyAuth()).toBe(false);
  });

  it("returns false when key present but no opt-in", () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
    expect(isApiKeyAuth()).toBe(false);
  });
});
