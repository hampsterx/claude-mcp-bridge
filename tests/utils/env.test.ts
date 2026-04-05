import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildSubprocessEnv } from "../../src/utils/env.js";

describe("buildSubprocessEnv", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env["ANTHROPIC_API_KEY"];
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

  it("includes Anthropic auth and Claude config keys", () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-api-test";
    process.env["CLAUDE_CONFIG_DIR"] = "/tmp/claude";
    const env = buildSubprocessEnv();
    expect(env["ANTHROPIC_API_KEY"]).toBe("sk-ant-api-test");
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
    const env = buildSubprocessEnv();
    expect(env["ANTHROPIC_API_KEY"]).toBeUndefined();
  });
});
