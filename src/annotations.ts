import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

/**
 * MCP tool annotations for all claude-mcp-bridge tools.
 *
 * Annotations are hints that help MCP clients understand tool behavior
 * for permission prompts, safety checks, and orchestration decisions.
 *
 * readOnly: query/review/search/structured are false because they can persist
 * Claude CLI session state to disk (~/.claude/) when sessionId is used.
 * ping is true (purely local, no side effects).
 *
 * review: destructive=false because the default --allowed-tools list is read-only
 * (Read, Grep, Glob, git). Callers that pass custom tools including write access
 * should treat it as potentially destructive.
 *
 * Titles are set on the registerTool config in index.ts, not here (avoid duplication).
 */

export const queryAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

export const reviewAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

export const searchAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const structuredAnnotations: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

export const pingAnnotations: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
