import type { ClaudeUsage } from "./parse.js";

export interface MetaFields {
  durationMs: number;
  model?: string;
  sessionId?: string;
  totalCostUsd?: number;
  usage?: ClaudeUsage;
  timedOut?: boolean;
}

/**
 * Build execution metadata attached as `_meta` on CallToolResult.
 *
 * Provides orchestrating agents with timing, model, cost, and token usage.
 * Claude-mcp-bridge returns the richest metadata of the three bridges:
 * totalCostUsd + full token breakdown (input, output, cache read).
 */
export function buildMeta(fields: MetaFields): Record<string, unknown> {
  const meta: Record<string, unknown> = {
    durationMs: fields.durationMs,
  };
  if (fields.model) meta.model = fields.model;
  if (fields.sessionId) meta.sessionId = fields.sessionId;
  if (typeof fields.totalCostUsd === "number") meta.totalCostUsd = fields.totalCostUsd;
  if (fields.usage?.input_tokens !== undefined) meta.inputTokens = fields.usage.input_tokens;
  if (fields.usage?.output_tokens !== undefined) meta.outputTokens = fields.usage.output_tokens;
  if (fields.usage?.cache_read_input_tokens !== undefined) {
    meta.cacheReadTokens = fields.usage.cache_read_input_tokens;
  }
  if (fields.timedOut) meta.timedOut = true;
  return meta;
}
