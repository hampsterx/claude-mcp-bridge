import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(__dirname, "../../prompts");

/**
 * Load a prompt template from prompts/ and replace placeholders.
 * Placeholders use the format {{KEY}}. Only keys present in `vars`
 * are replaced; unknown placeholders pass through unchanged.
 */
export function loadPrompt(filename: string, vars: Record<string, string>): string {
  const template = readFileSync(resolve(PROMPTS_DIR, basename(filename)), "utf8");
  // Single-pass replacement prevents user-supplied text in earlier
  // placeholders from being mutated by later replacement passes.
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);
}

/**
 * Build a length limit instruction string from a word count.
 * Returns empty string when no limit is set, suitable for use
 * as a {{LENGTH_LIMIT}} template variable.
 */
export function buildLengthLimit(maxWords?: number): string {
  if (!maxWords || maxWords <= 0) return "";
  return `Keep your response under ${maxWords} words.`;
}

/**
 * Append a length limit instruction to a prompt string.
 * No-op when maxWords is not set. Use this for tools that don't
 * have a prompt template with a {{LENGTH_LIMIT}} placeholder.
 */
export function appendLengthLimit(prompt: string, maxWords?: number): string {
  const limit = buildLengthLimit(maxWords);
  return limit ? `${prompt}\n\n${limit}` : prompt;
}
