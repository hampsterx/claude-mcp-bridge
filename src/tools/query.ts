import { spawnClaude, buildClaudeArgs, HARD_TIMEOUT_CAP } from "../utils/spawn.js";
import { parseClaudeOutput, tryParsePartial, type ClaudeUsage } from "../utils/parse.js";
import { checkErrorPatterns, throwIfClaudeError } from "../utils/errors.js";
import {
  readFiles,
  assemblePrompt,
  isImageFile,
  MAX_IMAGE_FILE_SIZE,
} from "../utils/files.js";
import { appendLengthLimit } from "../utils/prompts.js";
import { resolveAndVerify, checkFileSize, verifyDirectory, MAX_FILES } from "../utils/security.js";
import { resolveModel, getFallbackModel, resolveEffort, resolveMaxBudget } from "../utils/model.js";

export interface QueryInput {
  prompt: string;
  files?: string[];
  model?: string;
  sessionId?: string;
  noSessionPersistence?: boolean;
  workingDirectory?: string;
  timeout?: number;
  maxResponseLength?: number;
  maxBudgetUsd?: number;
  effort?: string;
}

export interface QueryResult {
  response: string;
  model?: string;
  sessionId?: string;
  totalCostUsd?: number;
  usage?: ClaudeUsage;
  filesIncluded: string[];
  filesSkipped: string[];
  imagesIncluded: string[];
  timedOut: boolean;
  resolvedCwd: string;
}

const STDIN_THRESHOLD = 4000;
const IMAGE_QUERY_TIMEOUT = 120_000;

export async function executeQuery(input: QueryInput): Promise<QueryResult> {
  const { prompt, files = [], timeout, maxResponseLength, maxBudgetUsd, effort } = input;
  const model = resolveModel("query", input.model);

  const cwd = input.workingDirectory
    ? await verifyDirectory(input.workingDirectory)
    : process.cwd();

  if (files.length > MAX_FILES) {
    throw new Error(`Too many files: ${files.length} (max ${MAX_FILES})`);
  }

  const textFiles = files.filter((f) => !isImageFile(f));
  const imageFiles = files.filter((f) => isImageFile(f));

  if (imageFiles.length > 0) {
    return executeImageQuery({ prompt, textFiles, imageFiles, model, timeout, cwd, maxResponseLength, sessionId: input.sessionId, noSessionPersistence: input.noSessionPersistence, maxBudgetUsd, effort });
  }

  return executeTextQuery({ prompt, textFiles, model, timeout, cwd, maxResponseLength, sessionId: input.sessionId, noSessionPersistence: input.noSessionPersistence, maxBudgetUsd, effort });
}

interface BaseQueryInput {
  prompt: string;
  textFiles: string[];
  model?: string;
  timeout?: number;
  cwd: string;
  maxResponseLength?: number;
  sessionId?: string;
  noSessionPersistence?: boolean;
  maxBudgetUsd?: number;
  effort?: string;
}

interface ImageQueryInput extends BaseQueryInput {
  imageFiles: string[];
}

async function executeTextQuery(input: BaseQueryInput): Promise<QueryResult> {
  const { prompt, textFiles, model, timeout, cwd, maxResponseLength, sessionId, noSessionPersistence, maxBudgetUsd, effort } = input;

  const fileContents = textFiles.length > 0 ? await readFiles(textFiles, cwd) : [];
  const fullPrompt = appendLengthLimit(assemblePrompt(prompt, fileContents), maxResponseLength);
  const useStdin = fullPrompt.length > STDIN_THRESHOLD || textFiles.length > 0;
  const effectiveTimeout = Math.min(timeout ?? 60_000, HARD_TIMEOUT_CAP);

  const args = buildClaudeArgs({
    model,
    fallbackModel: getFallbackModel(),
    maxBudgetUsd: resolveMaxBudget(maxBudgetUsd),
    effort: resolveEffort("query", effort),
    sessionId,
    noSessionPersistence,
    prompt: useStdin ? undefined : fullPrompt,
  });

  const result = await spawnClaude({ args, cwd, stdin: useStdin ? fullPrompt : undefined, timeout: effectiveTimeout });

  const filesIncluded = fileContents.filter((f) => !f.skipped).map((f) => f.path);
  const filesSkipped = fileContents.filter((f) => f.skipped).map((f) => `${f.path}: ${f.skipped}`);

  if (result.timedOut) {
    return {
      response: tryParsePartial(result.stdout, result.stderr, effectiveTimeout),
      model,
      filesIncluded,
      filesSkipped,
      imagesIncluded: [],
      timedOut: true,
      resolvedCwd: cwd,
    };
  }

  const parsed = parseClaudeOutput(result.stdout, result.stderr);
  checkErrorPatterns(result.exitCode, result.stdout, result.stderr);
  throwIfClaudeError(parsed.isError, parsed.response);

  return {
    response: parsed.response,
    model,
    sessionId: parsed.sessionId,
    totalCostUsd: parsed.totalCostUsd,
    usage: parsed.usage,
    filesIncluded,
    filesSkipped,
    imagesIncluded: [],
    timedOut: false,
    resolvedCwd: cwd,
  };
}

async function executeImageQuery(input: ImageQueryInput): Promise<QueryResult> {
  const { prompt, textFiles, imageFiles, model, timeout, cwd, maxResponseLength, sessionId, noSessionPersistence, maxBudgetUsd, effort } = input;

  const imageResults = await Promise.all(
    imageFiles.map(async (img) => {
      try {
        const resolved = await resolveAndVerify(img, cwd);
        const size = await checkFileSize(resolved);
        if (size > MAX_IMAGE_FILE_SIZE) {
          return { skipped: `${img}: ${(size / 1024).toFixed(0)}KB exceeds ${(MAX_IMAGE_FILE_SIZE / 1024).toFixed(0)}KB limit` };
        }
        return { resolved, original: img };
      } catch (err) {
        return { skipped: `${img}: ${(err as Error).message}` };
      }
    }),
  );

  const validImages = imageResults.filter(
    (r): r is { resolved: string; original: string } => "resolved" in r,
  );
  const imageNames = validImages.map((r) => r.original);
  const skippedImages = imageResults
    .filter((r): r is { skipped: string } => "skipped" in r)
    .map((r) => r.skipped);

  const fileContents = textFiles.length > 0 ? await readFiles(textFiles, cwd) : [];
  const textPart = assemblePrompt(prompt, fileContents);
  const imagePart = imageNames.map((p) => `Read and analyze the image at: ${p}`).join("\n");
  const fullPrompt = appendLengthLimit(
    imageNames.length > 0 ? `${textPart}\n\n## Image Files\n\n${imagePart}` : textPart,
    maxResponseLength,
  );
  const effectiveTimeout = Math.min(timeout ?? IMAGE_QUERY_TIMEOUT, HARD_TIMEOUT_CAP);

  const args = buildClaudeArgs({
    model,
    fallbackModel: getFallbackModel(),
    maxBudgetUsd: resolveMaxBudget(maxBudgetUsd),
    effort: resolveEffort("query", effort),
    sessionId,
    noSessionPersistence,
    allowedTools: ["Read"],
  });

  const result = await spawnClaude({ args, cwd, stdin: fullPrompt, timeout: effectiveTimeout });

  const filesIncluded = fileContents.filter((f) => !f.skipped).map((f) => f.path);
  const filesSkipped = [
    ...fileContents.filter((f) => f.skipped).map((f) => `${f.path}: ${f.skipped}`),
    ...skippedImages,
  ];

  if (result.timedOut) {
    return {
      response: tryParsePartial(result.stdout, result.stderr, effectiveTimeout),
      model,
      filesIncluded,
      filesSkipped,
      imagesIncluded: imageNames,
      timedOut: true,
      resolvedCwd: cwd,
    };
  }

  const parsed = parseClaudeOutput(result.stdout, result.stderr);
  checkErrorPatterns(result.exitCode, result.stdout, result.stderr);
  throwIfClaudeError(parsed.isError, parsed.response);

  return {
    response: parsed.response,
    model,
    sessionId: parsed.sessionId,
    totalCostUsd: parsed.totalCostUsd,
    usage: parsed.usage,
    filesIncluded,
    filesSkipped,
    imagesIncluded: imageNames,
    timedOut: false,
    resolvedCwd: cwd,
  };
}
