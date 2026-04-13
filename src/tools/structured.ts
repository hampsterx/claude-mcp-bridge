import { spawnClaude, buildClaudeArgs, HARD_TIMEOUT_CAP } from "../utils/spawn.js";
import { parseClaudeOutput, extractJson, type ClaudeUsage } from "../utils/parse.js";
import { checkErrorPatterns, throwIfClaudeError } from "../utils/errors.js";
import { readFiles, assemblePrompt, isImageFile } from "../utils/files.js";
import { verifyDirectory, MAX_FILES } from "../utils/security.js";
import { resolveModel, getFallbackModel, resolveMaxBudget } from "../utils/model.js";

export const MAX_SCHEMA_SIZE = 20_000;
const STDIN_THRESHOLD = 4000;

export interface StructuredInput {
  prompt: string;
  schema: string;
  files?: string[];
  model?: string;
  sessionId?: string;
  noSessionPersistence?: boolean;
  workingDirectory?: string;
  timeout?: number;
  maxBudgetUsd?: number;
}

export interface StructuredResult {
  response: string;
  valid: boolean;
  errors?: string;
  model?: string;
  sessionId?: string;
  totalCostUsd?: number;
  usage?: ClaudeUsage;
  filesIncluded: string[];
  filesSkipped: string[];
  timedOut: boolean;
}

export async function executeStructured(input: StructuredInput): Promise<StructuredResult> {
  const { prompt, files = [], timeout, sessionId, noSessionPersistence, maxBudgetUsd } = input;
  const model = resolveModel("structured", input.model);

  if (input.schema.length > MAX_SCHEMA_SIZE) {
    throw new Error(`Schema too large: ${input.schema.length} bytes (max ${MAX_SCHEMA_SIZE})`);
  }

  let parsedSchema: object;
  try {
    parsedSchema = JSON.parse(input.schema) as object;
  } catch {
    throw new Error("Invalid schema: not valid JSON");
  }

  const imageFiles = files.filter((f) => isImageFile(f));
  if (imageFiles.length > 0) {
    throw new Error("Structured tool does not support image files (text only)");
  }

  if (files.length > MAX_FILES) {
    throw new Error(`Too many files: ${files.length} (max ${MAX_FILES})`);
  }

  const cwd = input.workingDirectory
    ? await verifyDirectory(input.workingDirectory)
    : process.cwd();

  const fileContents = files.length > 0 ? await readFiles(files, cwd) : [];
  const fullPrompt = assemblePrompt(prompt, fileContents);
  const useStdin = fullPrompt.length > STDIN_THRESHOLD || files.length > 0;
  const effectiveTimeout = Math.min(timeout ?? 60_000, HARD_TIMEOUT_CAP);

  const args = buildClaudeArgs({
    model,
    fallbackModel: getFallbackModel(),
    maxBudgetUsd: resolveMaxBudget(maxBudgetUsd),
    sessionId,
    noSessionPersistence,
    jsonSchema: JSON.stringify(parsedSchema),
    prompt: useStdin ? undefined : fullPrompt,
  });

  const result = await spawnClaude({ args, cwd, stdin: useStdin ? fullPrompt : undefined, timeout: effectiveTimeout });

  const filesIncluded = fileContents.filter((f) => !f.skipped).map((f) => f.path);
  const filesSkipped = fileContents.filter((f) => f.skipped).map((f) => `${f.path}: ${f.skipped}`);

  if (result.timedOut) {
    return {
      response: `Structured query timed out after ${effectiveTimeout / 1000}s.`,
      valid: false,
      model,
      filesIncluded,
      filesSkipped,
      timedOut: true,
    };
  }

  const parsed = parseClaudeOutput(result.stdout, result.stderr);
  checkErrorPatterns(result.exitCode, result.stdout, result.stderr);
  throwIfClaudeError(parsed.isError, parsed.response);

  // Claude CLI places --json-schema output in the structured_output field.
  // Use key-existence check (not truthy) to handle scalar values like false, 0, "", null.
  const raw = parsed.raw as Record<string, unknown> | undefined;
  if (raw && "structured_output" in raw) {
    return {
      response: JSON.stringify(raw.structured_output),
      valid: true,
      model,
      sessionId: parsed.sessionId,
      totalCostUsd: parsed.totalCostUsd,
      usage: parsed.usage,
      filesIncluded,
      filesSkipped,
      timedOut: false,
    };
  }

  // Fall back to extracting JSON from the response text
  const extracted = extractJson(parsed.response);
  if (!extracted) {
    return {
      response: parsed.response,
      valid: false,
      errors: "Could not extract JSON from response",
      model,
      sessionId: parsed.sessionId,
      totalCostUsd: parsed.totalCostUsd,
      usage: parsed.usage,
      filesIncluded,
      filesSkipped,
      timedOut: false,
    };
  }

  return {
    response: extracted.raw,
    valid: true,
    model,
    sessionId: parsed.sessionId,
    totalCostUsd: parsed.totalCostUsd,
    usage: parsed.usage,
    filesIncluded,
    filesSkipped,
    timedOut: false,
  };
}
