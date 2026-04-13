import { spawnClaude, buildClaudeArgs, clampTimeout } from "../utils/spawn.js";
import { parseClaudeOutput, tryParsePartial, type ClaudeUsage } from "../utils/parse.js";
import { checkAndThrow } from "../utils/errors.js";
import { loadPrompt, buildLengthLimit } from "../utils/prompts.js";
import { resolveCwd } from "../utils/security.js";
import { resolveModel, getFallbackModel, resolveEffort, resolveMaxBudget } from "../utils/model.js";

export interface SearchInput {
  query: string;
  model?: string;
  sessionId?: string;
  noSessionPersistence?: boolean;
  workingDirectory?: string;
  timeout?: number;
  maxResponseLength?: number;
  maxBudgetUsd?: number;
  effort?: string;
}

export interface SearchResult {
  response: string;
  model?: string;
  sessionId?: string;
  totalCostUsd?: number;
  usage?: ClaudeUsage;
  timedOut: boolean;
  resolvedCwd: string;
}

const SEARCH_TIMEOUT = 120_000;

export async function executeSearch(input: SearchInput): Promise<SearchResult> {
  const { query, maxResponseLength, sessionId, noSessionPersistence, maxBudgetUsd, effort } = input;
  const model = resolveModel("search", input.model);
  const timeout = clampTimeout(input.timeout, SEARCH_TIMEOUT);

  const cwd = await resolveCwd(input.workingDirectory);

  const prompt = loadPrompt("search.md", {
    QUERY: query,
    LENGTH_LIMIT: buildLengthLimit(maxResponseLength) || "Provide a focused synthesis. Aim for 500-1500 words unless the topic clearly warrants less.",
  });

  const args = buildClaudeArgs({
    model,
    fallbackModel: getFallbackModel(),
    maxBudgetUsd: resolveMaxBudget(maxBudgetUsd),
    effort: resolveEffort("search", effort),
    sessionId,
    noSessionPersistence,
    allowedTools: ["WebSearch", "WebFetch"],
  });

  const result = await spawnClaude({ args, cwd, stdin: prompt, timeout });

  if (result.timedOut) {
    return {
      response: tryParsePartial(result.stdout, result.stderr, timeout),
      model,
      timedOut: true,
      resolvedCwd: cwd,
    };
  }

  const parsed = parseClaudeOutput(result.stdout, result.stderr);
  checkAndThrow(result, parsed);

  return {
    response: parsed.response,
    model,
    sessionId: parsed.sessionId,
    totalCostUsd: parsed.totalCostUsd,
    usage: parsed.usage,
    timedOut: false,
    resolvedCwd: cwd,
  };
}
