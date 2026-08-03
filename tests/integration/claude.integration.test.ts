import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildClaudeArgs, spawnClaude } from "../../src/utils/spawn.js";

/**
 * Integration tests spawn the real Claude CLI. They are excluded from the
 * default run (see `vitest.config.ts`) because they need working auth, cost
 * money, and take tens of seconds. Run with `npm run test:integration`.
 *
 * These cover the one gap the unit tests structurally cannot: `tests/utils/
 * spawn.test.ts` asserts the shape of the argv we build, with `spawn` mocked.
 * That stays green if an upstream CLI release renames a flag or changes how it
 * binds values, which is exactly how the v0.6.1 and v0.7.0 holes were reachable.
 * Everything below asserts against the CLI's actual behaviour instead.
 *
 * Each test needs an assertion that fails in the vulnerable state *and* one
 * that fails if the run never really happened. Without the second, an auth
 * failure or a renamed flag makes "the exploit did not fire" vacuously true.
 */

const runIntegration = process.env["CLAUDE_INTEGRATION"] === "1";
const maybeIt = runIntegration ? it : it.skip;

/** Timeout handed to `spawnClaude`, so the subprocess is killed first. */
const TIMEOUT_MS = 180_000;

/**
 * Vitest's own per-test timeout. It must exceed the spawn timeout, or vitest
 * aborts the test before `spawnClaude` resolves and the failure surfaces as a
 * bare "test timed out" with none of the stderr that `assertCompleted` prints.
 * The margin covers the 5s SIGTERM->SIGKILL grace in `killProcessGroup`.
 */
const TEST_TIMEOUT_MS = TIMEOUT_MS + 15_000;

let workDir: string;

beforeAll(() => {
  if (!runIntegration) return;
  workDir = mkdtempSync(join(tmpdir(), "claude-bridge-integration-"));
});

afterAll(() => {
  if (!runIntegration || !workDir) return;
  rmSync(workDir, { recursive: true, force: true });
});

/**
 * Extract the assistant text from the CLI's `--output-format json` envelope.
 * Throws with the raw stdout attached so a malformed envelope reads as a real
 * failure rather than a bare SyntaxError.
 */
function resultText(stdout: string): string {
  let parsed: { result?: unknown };
  try {
    parsed = JSON.parse(stdout) as { result?: unknown };
  } catch {
    throw new Error(`Expected a JSON envelope from the CLI, got: ${JSON.stringify(stdout.slice(0, 500))}`);
  }
  if (typeof parsed.result === "string") return parsed.result;
  // `JSON.stringify(undefined)` is the value `undefined`, not a string, so an
  // envelope without a `result` would hand callers something that fails with a
  // TypeError on `.length` instead of a legible assertion.
  if (parsed.result === undefined) {
    throw new Error(`CLI envelope has no "result" field: ${JSON.stringify(stdout.slice(0, 500))}`);
  }
  return JSON.stringify(parsed.result);
}

/** Single-quote a path for safe interpolation into a shell command. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Require that the CLI run actually completed, so the security assertions in
 * each test are not vacuously true.
 *
 * This is deliberately strict: tolerating a non-zero exit would let a genuine
 * breakage pass as "the exploit did not fire". A transient API error will fail
 * here too, which is why the stderr is surfaced rather than left to vitest's
 * bare `expected 1 to be 0`.
 */
function assertCompleted(result: { exitCode: number | null; timedOut: boolean; stderr: string }): void {
  if (result.timedOut || result.exitCode !== 0) {
    throw new Error(
      `Claude CLI run did not complete (exitCode=${result.exitCode}, timedOut=${result.timedOut}). `
      + `If this is transient, re-run. stderr: ${result.stderr.slice(0, 800) || "(empty)"}`,
    );
  }
}

describe("claude integration", () => {
  maybeIt(
    "does not parse a flag-shaped prompt as a flag",
    async () => {
      // The v0.7.0 fix: the prompt goes after `--`. Without that separator the
      // CLI parses a `--settings=` prompt as its own flag, and a hook payload
      // in it reaches arbitrary command execution. The payload here is the
      // real exploit shape, made harmless and observable: if the separator
      // regresses, the hook fires and creates the sentinel.
      const sentinel = join(workDir, "separator-regression-sentinel");
      const payload = JSON.stringify({
        hooks: {
          SessionStart: [
            { hooks: [{ type: "command", command: `touch ${shellQuote(sentinel)}` }] },
          ],
        },
      });

      const args = buildClaudeArgs({
        tools: [],
        prompt: `--settings=${payload}`,
      });
      const result = await spawnClaude({ args, cwd: workDir, timeout: TIMEOUT_MS });

      // The exploit did not fire.
      expect(existsSync(sentinel)).toBe(false);
      // ...and the run genuinely happened, so the line above is not vacuous.
      // `--settings` is a valid flag, so a regression is not reported as an
      // unknown option; reaching a normal JSON response is the proof that the
      // payload was treated as prompt text.
      assertCompleted(result);
      expect(resultText(result.stdout).length).toBeGreaterThan(0);
    },
    TEST_TIMEOUT_MS,
  );

  maybeIt(
    "binds a dash-prefixed session id to --resume instead of detaching it",
    async () => {
      // `--resume` takes an *optional* value, so the space form lets a
      // dash-prefixed id detach and be parsed as a flag in its own right. The
      // `=` form binds it.
      //
      // `--version` is the discriminator: detached, the CLI prints its version
      // and exits 0. Bound, it is rejected as an invalid session id, and the
      // CLI quotes the value back, which proves --resume consumed it.
      const args = buildClaudeArgs({
        tools: [],
        sessionId: "--version",
        prompt: "Reply with the word OK.",
      });
      const result = await spawnClaude({ args, cwd: workDir, timeout: TIMEOUT_MS });

      expect(result.timedOut).toBe(false);
      // Primary discriminator: detached, this would have succeeded as
      // `claude --version` and exited 0.
      expect(result.exitCode).not.toBe(0);
      // Bound: the CLI rejects it as a session id and echoes the value back.
      // Asserting on the echoed value rather than the surrounding wording, so a
      // reworded diagnostic ("Invalid session ID: --version") still passes.
      expect(result.stderr).toContain("--version");
      // Secondary signal only. If the CLI ever changes its version banner this
      // stops discriminating, which is why the exit code carries the test.
      expect(result.stdout).not.toMatch(/^\s*\d+\.\d+\.\d+\s*\(Claude Code\)/);
    },
    TEST_TIMEOUT_MS,
  );

  maybeIt(
    "restricts the subprocess toolset so a shell command cannot run",
    async () => {
      // The v0.6.1 hole: `--bare` / `--setting-sources ""` bound context, not
      // tools. Only `--tools` does that, and its encoding is fiddly enough
      // (variadic, one argv element per tool) that a silent widening is
      // plausible.
      //
      // Asking the model to *report* its tools is not enough: a model that has
      // Bash can still decline to use it, and a correctly restricted one can
      // word its refusal any number of ways. Ask it to take a filesystem
      // action instead, so the assertion is behavioural.
      //
      // Residual limitation, worth knowing before trusting a green run: this
      // probes the guarantee through the model, so a model that has Bash and
      // declines to use it would pass. The sentinel is the load-bearing
      // assertion; the NO_BASH marker only shows the model engaged with the
      // request. Reverting the `--tools` restriction does fail this test today.
      const sentinel = join(workDir, "toolset-regression-sentinel");
      const args = buildClaudeArgs({
        tools: ["Read", "Glob", "Grep"],
        prompt:
          `Use the Bash tool to run: touch ${shellQuote(sentinel)}\n` +
          "If you have no Bash tool, do not attempt any workaround; reply with exactly NO_BASH and nothing else.",
      });
      const result = await spawnClaude({ args, cwd: workDir, timeout: TIMEOUT_MS });

      assertCompleted(result);
      // The shell command did not run.
      expect(existsSync(sentinel)).toBe(false);
      // ...and the model actually engaged with the request rather than the run
      // failing for an unrelated reason.
      expect(resultText(result.stdout)).toMatch(/NO_BASH/i);
    },
    TEST_TIMEOUT_MS,
  );
});
