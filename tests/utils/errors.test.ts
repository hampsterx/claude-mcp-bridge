import { describe, it, expect } from "vitest";
import { isRetryableError, checkErrorPatterns, throwIfClaudeError } from "../../src/utils/errors.js";

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
