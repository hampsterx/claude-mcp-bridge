import { redactSecrets } from "./parse.js";

function combinedText(stdout: string, stderr: string): string {
  return [stdout, stderr].filter(Boolean).join("\n").trim();
}

export function isRetryableError(exitCode: number | null, stdout: string, stderr: string): boolean {
  if (exitCode === 0) return false;

  const text = combinedText(stdout, stderr).toLowerCase();
  if (!text) return false;

  return [
    "credit balance is too low",
    "rate limit",
    "too many requests",
    "quota",
    "overloaded",
    "529",
    "429",
  ].some((pattern) => text.includes(pattern));
}

export function checkErrorPatterns(exitCode: number | null, stdout: string, stderr: string): void {
  if (exitCode === 0) return;

  const raw = combinedText(stdout, stderr);
  if (!raw) return;

  const lower = raw.toLowerCase();
  const safe = redactSecrets(raw);

  if (
    lower.includes("api key")
    || lower.includes("authentication")
    || lower.includes("unauthorized")
    || lower.includes("forbidden")
  ) {
    throw new Error(
      `Claude CLI authentication error. Run "claude login" for subscription auth, or set ANTHROPIC_API_KEY + CLAUDE_BRIDGE_USE_API_KEY=1 for API key auth.\n\nDetails: ${safe}`,
    );
  }

  if (
    lower.includes("credit balance is too low")
    || lower.includes("rate limit")
    || lower.includes("too many requests")
    || lower.includes("quota")
    || lower.includes("overloaded")
  ) {
    throw new Error(`Claude API quota or rate-limit error.\n\nDetails: ${safe}`);
  }

  if (
    lower.includes("connectionrefused")
    || lower.includes("connection refused")
    || lower.includes("unable to connect to api")
    || lower.includes("network")
    || lower.includes("econnrefused")
  ) {
    throw new Error(`Claude API connection error.\n\nDetails: ${safe}`);
  }
}

export function throwIfClaudeError(isError: boolean, message: string): void {
  if (isError) {
    throw new Error(message);
  }
}

export function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
