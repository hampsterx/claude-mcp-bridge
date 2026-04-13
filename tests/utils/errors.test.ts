import { describe, it, expect } from "vitest";
import { isRetryableError, checkErrorPatterns, throwIfClaudeError, checkAndThrow, getErrorMessage } from "../../src/utils/errors.js";

describe("isRetryableError", () => {
  it("returns false for exit code 0", () => {
    expect(isRetryableError(0, "rate limit", "")).toBe(false);
  });

  it("detects low credit text in stdout", () => {
    expect(isRetryableError(1, "Credit balance is too low", "")).toBe(true);
  });

  it("detects rate limit text", () => {
    expect(isRetryableError(1, "", "Error: rate limit exceeded")).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isRetryableError(1, "file not found", "")).toBe(false);
  });
});

describe("checkErrorPatterns", () => {
  it("does not throw for exit code 0", () => {
    expect(() => checkErrorPatterns(0, "api key invalid", "")).not.toThrow();
  });

  it("throws for auth errors", () => {
    expect(() => checkErrorPatterns(1, "Invalid API key provided", "")).toThrow(
      /authentication error/i,
    );
  });

  it("throws for rate limit and low credit errors", () => {
    expect(() => checkErrorPatterns(1, "Credit balance is too low", "")).toThrow(
      /quota|rate-limit/i,
    );
  });

  it("throws for connection errors", () => {
    expect(() => checkErrorPatterns(1, "API Error: Unable to connect to API (ConnectionRefused)", "")).toThrow(
      /connection error/i,
    );
  });
});

describe("throwIfClaudeError", () => {
  it("throws when Claude marks the result as an error", () => {
    expect(() => throwIfClaudeError(true, "boom")).toThrow("boom");
  });

  it("does nothing for non-error results", () => {
    expect(() => throwIfClaudeError(false, "ok")).not.toThrow();
  });
});

describe("checkErrorPatterns does not handle generic non-zero exits", () => {
  it("does not throw for unrecognized non-zero exit with stderr", () => {
    // Generic non-zero handling moved to checkAndThrow
    expect(() => checkErrorPatterns(1, "", "Error: unknown flag --bad")).not.toThrow();
  });

  it("does not throw for non-zero exit with empty stderr", () => {
    expect(() => checkErrorPatterns(1, '{"is_error":true}', "")).not.toThrow();
  });

  it("specific patterns still throw", () => {
    expect(() => checkErrorPatterns(1, "", "API key invalid")).toThrow(
      /authentication error/i,
    );
  });
});

describe("checkAndThrow", () => {
  it("throws on error patterns from spawn result", () => {
    expect(() =>
      checkAndThrow(
        { exitCode: 1, stdout: "unauthorized", stderr: "" },
        { isError: false, response: "ok" },
      ),
    ).toThrow(/authentication/i);
  });

  it("throws on Claude is_error after pattern check passes", () => {
    expect(() =>
      checkAndThrow(
        { exitCode: 0, stdout: "", stderr: "" },
        { isError: true, response: "model error" },
      ),
    ).toThrow("model error");
  });

  it("does not throw when both checks pass", () => {
    expect(() =>
      checkAndThrow(
        { exitCode: 0, stdout: "", stderr: "" },
        { isError: false, response: "ok" },
      ),
    ).not.toThrow();
  });

  it("throws generic error for non-zero exit with stderr after is_error check", () => {
    expect(() =>
      checkAndThrow(
        { exitCode: 1, stdout: "", stderr: "Error: unknown flag --bad" },
        { isError: false, response: "" },
      ),
    ).toThrow(/exited with code 1/);
  });

  it("does not throw generic error for non-zero exit with empty stderr", () => {
    // stdout-only non-zero exit with is_error: false passes through
    expect(() =>
      checkAndThrow(
        { exitCode: 1, stdout: '{"result":"ok"}', stderr: "" },
        { isError: false, response: "ok" },
      ),
    ).not.toThrow();
  });

  it("does not throw generic error for non-zero exit with whitespace-only stderr", () => {
    expect(() =>
      checkAndThrow(
        { exitCode: 1, stdout: "output", stderr: "   \n  " },
        { isError: false, response: "output" },
      ),
    ).not.toThrow();
  });

  it("throwIfClaudeError takes precedence over generic stderr check", () => {
    // is_error should throw with the model message, not the generic stderr message
    expect(() =>
      checkAndThrow(
        { exitCode: 1, stdout: "", stderr: "some stderr" },
        { isError: true, response: "model flagged error" },
      ),
    ).toThrow("model flagged error");
  });

  it("specific patterns take precedence over generic stderr", () => {
    expect(() =>
      checkAndThrow(
        { exitCode: 1, stdout: "", stderr: "API key invalid" },
        { isError: false, response: "" },
      ),
    ).toThrow(/authentication error/i);
  });
});

describe("getErrorMessage", () => {
  it("extracts message from Error", () => {
    expect(getErrorMessage(new Error("test"))).toBe("test");
  });

  it("converts string to string", () => {
    expect(getErrorMessage("raw string")).toBe("raw string");
  });

  it("converts null to string", () => {
    expect(getErrorMessage(null)).toBe("null");
  });

  it("converts undefined to string", () => {
    expect(getErrorMessage(undefined)).toBe("undefined");
  });

  it("converts object to string", () => {
    expect(getErrorMessage({ code: 42 })).toBe("[object Object]");
  });
});
