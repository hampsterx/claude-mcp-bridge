import { describe, expect, it } from "vitest";

const runIntegration = process.env["CLAUDE_INTEGRATION"] === "1";
const maybeIt = runIntegration ? it : it.skip;

describe("claude integration", () => {
  maybeIt("is enabled explicitly via CLAUDE_INTEGRATION=1", () => {
    expect(runIntegration).toBe(true);
  });
});
