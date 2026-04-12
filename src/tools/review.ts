import { spawnClaude, buildClaudeArgs, HARD_TIMEOUT_CAP } from "../utils/spawn.js";
import { parseClaudeOutput, tryParsePartial, type ClaudeUsage } from "../utils/parse.js";
import { checkErrorPatterns, throwIfClaudeError } from "../utils/errors.js";
import { loadPrompt, buildLengthLimit } from "../utils/prompts.js";
import { getGitRoot, getUncommittedDiff, getBranchDiff, getDiffStat, type DiffStat } from "../utils/git.js";
import { verifyDirectory } from "../utils/security.js";
import { resolveModel, getFallbackModel, resolveEffort, resolveMaxBudget } from "../utils/model.js";

export interface ReviewInput {
  uncommitted?: boolean;
  base?: string;
  focus?: string;
  quick?: boolean;
  model?: string;
  sessionId?: string;
  noSessionPersistence?: boolean;
  workingDirectory?: string;
  timeout?: number;
  maxResponseLength?: number;
  maxBudgetUsd?: number;
  effort?: string;
}

export interface ReviewResult {
  response: string;
  diffSource: "uncommitted" | "branch";
  base?: string;
  mode: "agentic" | "quick";
  model?: string;
  sessionId?: string;
  totalCostUsd?: number;
  usage?: ClaudeUsage;
  timeoutScaled: boolean;
  timedOut: boolean;
  resolvedCwd: string;
}

const AGENTIC_FALLBACK_TIMEOUT = 300_000;
const AGENTIC_BASE_MS = 180_000;
const AGENTIC_PER_FILE_MS = 30_000;
const QUICK_TIMEOUT = 120_000;
const REVIEW_ALLOWED_TOOLS = [
  "Read",
  "Grep",
  "Glob",
  "Bash(git diff:*)",
  "Bash(git log:*)",
  "Bash(git show:*)",
  "Bash(git status:*)",
];

export function buildAgenticPrompt(diffSpec: string, focus?: string, maxResponseLength?: number): string {
  return loadPrompt("review-agentic.md", {
    DIFF_SPEC: diffSpec,
    FOCUS_SECTION: focus ? `## Focus Area\n\nPay special attention to: ${focus}` : "",
    LENGTH_LIMIT: buildLengthLimit(maxResponseLength),
  });
}

export function buildQuickPrompt(diff: string, focus?: string, maxResponseLength?: number): string {
  return loadPrompt("review-quick.md", {
    DIFF: diff,
    FOCUS_SECTION: focus ? `Pay special attention to: ${focus}` : "",
    LENGTH_LIMIT: buildLengthLimit(maxResponseLength),
  });
}

/**
 * Scale agentic review timeout based on diff size.
 * Base budget covers CLI cold start + small-diff review.
 * Each additional file adds budget for tool calls (Read, Grep, etc).
 * Capped at HARD_TIMEOUT_CAP.
 */
export function scaleAgenticTimeout(stat: DiffStat): number {
  return Math.min(AGENTIC_BASE_MS + AGENTIC_PER_FILE_MS * stat.files, HARD_TIMEOUT_CAP);
}

export async function executeReview(input: ReviewInput): Promise<ReviewResult> {
  const { uncommitted = true, base, focus, quick = false, maxResponseLength, maxBudgetUsd, effort } = input;
  const model = resolveModel("review", input.model);

  const requestedDir = input.workingDirectory
    ? await verifyDirectory(input.workingDirectory)
    : process.cwd();
  const cwd = getGitRoot(requestedDir);

  // Validate base ref early — before any git commands use it.
  // Security-critical: prevents argument injection into git commands.
  if (base && (base.startsWith("-") || base.includes("..") || base.includes("@{") || !/^[\w./-]+$/.test(base))) {
    throw new Error(`Invalid base ref: "${base}" — must be a valid git ref (alphanumeric, -, _, /, .)`);
  }

  if (quick) {
    const timeout = Math.min(input.timeout ?? QUICK_TIMEOUT, HARD_TIMEOUT_CAP);
    return executeQuickReview({ cwd, uncommitted, base, focus, model, timeout, timeoutScaled: false, maxResponseLength, sessionId: input.sessionId, noSessionPersistence: input.noSessionPersistence, maxBudgetUsd, effort });
  }

  // Auto-scale agentic timeout from diff size when no explicit timeout given
  let timeout: number;
  let timeoutScaled = false;
  if (input.timeout != null) {
    timeout = Math.min(input.timeout, HARD_TIMEOUT_CAP);
  } else {
    try {
      const spec = base ? { type: "branch" as const, base } : { type: "uncommitted" as const };
      const stat = getDiffStat(cwd, spec);
      timeout = scaleAgenticTimeout(stat);
      timeoutScaled = true;
    } catch {
      timeout = AGENTIC_FALLBACK_TIMEOUT;
    }
  }

  return executeAgenticReview({ cwd, uncommitted, base, focus, model, timeout, timeoutScaled, maxResponseLength, sessionId: input.sessionId, noSessionPersistence: input.noSessionPersistence, maxBudgetUsd, effort });
}

interface InternalReviewInput {
  cwd: string;
  uncommitted: boolean;
  base?: string;
  focus?: string;
  model?: string;
  timeout: number;
  timeoutScaled: boolean;
  maxResponseLength?: number;
  sessionId?: string;
  noSessionPersistence?: boolean;
  maxBudgetUsd?: number;
  effort?: string;
}

async function executeAgenticReview(input: InternalReviewInput): Promise<ReviewResult> {
  const { cwd, uncommitted, base, focus, model, timeout, timeoutScaled, maxResponseLength, sessionId, noSessionPersistence, maxBudgetUsd, effort } = input;

  let diffSpec: string;
  let diffSource: ReviewResult["diffSource"];

  if (base) {
    // Security-critical: prevents argument injection into git commands.
    if (base.startsWith("-") || base.includes("..") || base.includes("@{") || !/^[\w./-]+$/.test(base)) {
      throw new Error(`Invalid base ref: "${base}" — must be a valid git ref (alphanumeric, -, _, /, .)`);
    }
    diffSpec = `git diff ${base}...HEAD -U5`;
    diffSource = "branch";
  } else if (uncommitted) {
    diffSpec = "git diff HEAD -U5";
    diffSource = "uncommitted";
  } else {
    throw new Error("Either 'uncommitted' must be true or 'base' must be specified");
  }

  try {
    const diff = base ? getBranchDiff(cwd, base) : getUncommittedDiff(cwd);
    if (!diff.trim()) {
      return {
        response: base ? `No diff found between ${base} and HEAD.` : "No uncommitted changes found.",
        diffSource,
        base,
        mode: "agentic",
        model,
        timeoutScaled: false,
        timedOut: false,
        resolvedCwd: cwd,
      };
    }
  } catch (e) {
    if (e instanceof Error && (e.message.includes("No uncommitted changes") || e.message.includes("No diff found"))) {
      return {
        response: e.message,
        diffSource,
        base,
        mode: "agentic",
        model,
        timeoutScaled: false,
        timedOut: false,
        resolvedCwd: cwd,
      };
    }
    throw e;
  }

  const prompt = buildAgenticPrompt(diffSpec, focus, maxResponseLength);

  const args = buildClaudeArgs({
    model,
    fallbackModel: getFallbackModel(),
    maxBudgetUsd: resolveMaxBudget(maxBudgetUsd),
    effort: resolveEffort("review", effort),
    sessionId,
    noSessionPersistence,
    allowedTools: REVIEW_ALLOWED_TOOLS,
  });

  const result = await spawnClaude({ args, cwd, stdin: prompt, timeout });

  if (result.timedOut) {
    return {
      response: tryParsePartial(result.stdout, result.stderr, timeout),
      diffSource,
      base,
      mode: "agentic",
      model,
      timeoutScaled,
      timedOut: true,
      resolvedCwd: cwd,
    };
  }

  const parsed = parseClaudeOutput(result.stdout, result.stderr);
  checkErrorPatterns(result.exitCode, result.stdout, result.stderr);
  throwIfClaudeError(parsed.isError, parsed.response);

  return {
    response: parsed.response,
    diffSource,
    base,
    mode: "agentic",
    model,
    sessionId: parsed.sessionId,
    totalCostUsd: parsed.totalCostUsd,
    usage: parsed.usage,
    timeoutScaled,
    timedOut: false,
    resolvedCwd: cwd,
  };
}

async function executeQuickReview(input: InternalReviewInput): Promise<ReviewResult> {
  const { cwd, uncommitted, base, focus, model, timeout, timeoutScaled, maxResponseLength, sessionId, noSessionPersistence, maxBudgetUsd, effort } = input;

  let diff: string;
  let diffSource: ReviewResult["diffSource"];

  try {
    if (base) {
      if (base.startsWith("-") || base.includes("..") || base.includes("@{") || !/^[\w./-]+$/.test(base)) {
        throw new Error(`Invalid base ref: "${base}" — must be a valid git ref (alphanumeric, -, _, /, .)`);
      }
      diff = getBranchDiff(cwd, base);
      diffSource = "branch";
    } else if (uncommitted) {
      diff = getUncommittedDiff(cwd);
      diffSource = "uncommitted";
    } else {
      throw new Error("Either 'uncommitted' must be true or 'base' must be specified");
    }
  } catch (e) {
    if (e instanceof Error && (e.message.includes("No uncommitted changes") || e.message.includes("No diff found"))) {
      return {
        response: e.message,
        diffSource: base ? "branch" : "uncommitted",
        base,
        mode: "quick",
        model,
        timeoutScaled,
        timedOut: false,
        resolvedCwd: cwd,
      };
    }
    throw e;
  }

  const prompt = buildQuickPrompt(diff, focus, maxResponseLength);

  const args = buildClaudeArgs({
    model,
    fallbackModel: getFallbackModel(),
    maxBudgetUsd: resolveMaxBudget(maxBudgetUsd),
    effort: resolveEffort("review", effort),
    sessionId,
    noSessionPersistence,
  });

  const result = await spawnClaude({ args, cwd, stdin: prompt, timeout });

  if (result.timedOut) {
    return {
      response: tryParsePartial(result.stdout, result.stderr, timeout),
      diffSource,
      base,
      mode: "quick",
      model,
      timeoutScaled,
      timedOut: true,
      resolvedCwd: cwd,
    };
  }

  const parsed = parseClaudeOutput(result.stdout, result.stderr);
  checkErrorPatterns(result.exitCode, result.stdout, result.stderr);
  throwIfClaudeError(parsed.isError, parsed.response);

  return {
    response: parsed.response,
    diffSource,
    base,
    mode: "quick",
    model,
    sessionId: parsed.sessionId,
    totalCostUsd: parsed.totalCostUsd,
    usage: parsed.usage,
    timeoutScaled,
    timedOut: false,
    resolvedCwd: cwd,
  };
}
