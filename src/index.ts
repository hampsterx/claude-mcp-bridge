#!/usr/bin/env node

import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { executeQuery } from "./tools/query.js";
import { executeReview } from "./tools/review.js";
import { executeSearch } from "./tools/search.js";
import { executePing } from "./tools/ping.js";
import { executeStructured } from "./tools/structured.js";

const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require("../package.json") as { version: string };

const server = new McpServer({
  name: "claude-mcp-bridge",
  version: PKG_VERSION,
});

function appendMeta(base: string, meta: string[]): string {
  return meta.length > 0 ? `${base}\n\n---\n${meta.join("\n")}` : base;
}

server.tool(
  "query",
  "Execute a prompt via Claude Code CLI with optional file context and session resume.",
  {
    prompt: z.string().describe("The prompt to send to Claude"),
    files: z
      .array(z.string())
      .optional()
      .describe("File paths (text or images) relative to workingDirectory"),
    model: z.string().optional().describe("Model alias or full Claude model name"),
    sessionId: z
      .string()
      .optional()
      .describe("Claude session ID to resume with --resume"),
    noSessionPersistence: z
      .boolean()
      .optional()
      .describe("Disable session persistence for ephemeral print calls"),
    workingDirectory: z
      .string()
      .optional()
      .describe("Working directory for file resolution and CLI execution"),
    timeout: z
      .number()
      .optional()
      .describe("Timeout in milliseconds (default: 60000, image queries: 120000)"),
    maxResponseLength: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Soft limit on response length in words"),
    maxBudgetUsd: z
      .number()
      .positive()
      .optional()
      .describe("Maximum cost budget in USD for this call (passed to --max-budget-usd)"),
    effort: z
      .string()
      .optional()
      .describe("Effort level: low, medium, high, or max (passed to --effort)"),
  },
  async (input) => {
    try {
      const result = await executeQuery(input);
      const meta: string[] = [];
      if (result.filesIncluded.length > 0) meta.push(`Files included: ${result.filesIncluded.join(", ")}`);
      if (result.imagesIncluded.length > 0) meta.push(`Images included: ${result.imagesIncluded.join(", ")}`);
      if (result.filesSkipped.length > 0) meta.push(`Files skipped: ${result.filesSkipped.join(", ")}`);
      if (result.model) meta.push(`Model: ${result.model}`);
      if (result.sessionId) meta.push(`Session: ${result.sessionId}`);
      if (typeof result.totalCostUsd === "number") meta.push(`Cost USD: ${result.totalCostUsd}`);
      if (result.timedOut) meta.push("(timed out)");

      return {
        content: [{ type: "text", text: appendMeta(result.response, meta) }],
      };
    } catch (e) {
      console.error("[query]", e);
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  },
);

server.tool(
  "structured",
  "Generate JSON that conforms to a provided JSON Schema using Claude CLI native schema validation.",
  {
    prompt: z.string().describe("What to generate or extract"),
    schema: z.string().describe("JSON Schema as a JSON string"),
    files: z
      .array(z.string())
      .optional()
      .describe("Text file paths to include as context"),
    model: z.string().optional().describe("Model alias or full Claude model name"),
    sessionId: z
      .string()
      .optional()
      .describe("Claude session ID to resume with --resume"),
    noSessionPersistence: z
      .boolean()
      .optional()
      .describe("Disable session persistence for ephemeral print calls"),
    workingDirectory: z
      .string()
      .optional()
      .describe("Working directory for file resolution and CLI execution"),
    timeout: z
      .number()
      .optional()
      .describe("Timeout in milliseconds (default: 60000)"),
    maxBudgetUsd: z
      .number()
      .positive()
      .optional()
      .describe("Maximum cost budget in USD for this call (passed to --max-budget-usd)"),
  },
  async (input) => {
    try {
      const result = await executeStructured(input);
      const meta: string[] = [];
      if (result.errors) meta.push(`Errors: ${result.errors}`);
      if (result.filesIncluded.length > 0) meta.push(`Files: ${result.filesIncluded.join(", ")}`);
      if (result.model) meta.push(`Model: ${result.model}`);
      if (result.sessionId) meta.push(`Session: ${result.sessionId}`);
      if (typeof result.totalCostUsd === "number") meta.push(`Cost USD: ${result.totalCostUsd}`);
      if (result.timedOut) meta.push("(timed out)");

      return {
        content: [{ type: "text", text: appendMeta(result.response, meta) }],
      };
    } catch (e) {
      console.error("[structured]", e);
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  },
);

server.tool(
  "review",
  "Repo-aware code review. Quick mode reviews a precomputed diff. Agentic mode explores changed files with a narrow Claude tool allowlist.",
  {
    uncommitted: z.boolean().optional().describe("Review uncommitted changes. Default: true"),
    base: z.string().optional().describe("Base branch/ref to diff against. Overrides uncommitted."),
    focus: z.string().optional().describe("Optional review focus area"),
    quick: z.boolean().optional().describe("Use diff-only quick review mode"),
    model: z.string().optional().describe("Model alias or full Claude model name"),
    sessionId: z.string().optional().describe("Claude session ID to resume with --resume"),
    noSessionPersistence: z.boolean().optional().describe("Disable session persistence for ephemeral print calls"),
    workingDirectory: z.string().optional().describe("Repository directory"),
    timeout: z.number().optional().describe("Timeout in milliseconds"),
    maxResponseLength: z.number().int().positive().optional().describe("Soft limit on response length in words"),
    maxBudgetUsd: z.number().positive().optional().describe("Maximum cost budget in USD for this call (passed to --max-budget-usd)"),
    effort: z.string().optional().describe("Effort level: low, medium, high, or max (default: high for agentic)"),
  },
  async (input) => {
    try {
      const result = await executeReview(input);
      const meta: string[] = [
        `Diff source: ${result.diffSource}`,
        `Mode: ${result.mode}`,
      ];
      if (result.base) meta.push(`Base: ${result.base}`);
      if (result.model) meta.push(`Model: ${result.model}`);
      if (result.sessionId) meta.push(`Session: ${result.sessionId}`);
      if (typeof result.totalCostUsd === "number") meta.push(`Cost USD: ${result.totalCostUsd}`);
      if (result.timedOut) meta.push("(timed out)");

      return {
        content: [{ type: "text", text: appendMeta(result.response, meta) }],
      };
    } catch (e) {
      console.error("[review]", e);
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  },
);

server.tool(
  "search",
  "Web search via Claude Code CLI using WebSearch and WebFetch.",
  {
    query: z.string().describe("Search query or question"),
    model: z.string().optional().describe("Model alias or full Claude model name"),
    sessionId: z.string().optional().describe("Claude session ID to resume with --resume"),
    noSessionPersistence: z.boolean().optional().describe("Disable session persistence for ephemeral print calls"),
    workingDirectory: z.string().optional().describe("Working directory for the CLI"),
    timeout: z.number().optional().describe("Timeout in milliseconds"),
    maxResponseLength: z.number().int().positive().optional().describe("Soft limit on response length in words"),
    maxBudgetUsd: z.number().positive().optional().describe("Maximum cost budget in USD for this call (passed to --max-budget-usd)"),
    effort: z.string().optional().describe("Effort level: low, medium, high, or max (default: medium for search)"),
  },
  async (input) => {
    try {
      const result = await executeSearch(input);
      const meta: string[] = [];
      if (result.model) meta.push(`Model: ${result.model}`);
      if (result.sessionId) meta.push(`Session: ${result.sessionId}`);
      if (typeof result.totalCostUsd === "number") meta.push(`Cost USD: ${result.totalCostUsd}`);
      if (result.timedOut) meta.push("(timed out)");

      return {
        content: [{ type: "text", text: appendMeta(result.response, meta) }],
      };
    } catch (e) {
      console.error("[search]", e);
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  },
);

server.tool(
  "ping",
  "Check whether Claude CLI is installed and whether API-key auth is available for bare mode.",
  {},
  async () => {
    try {
      const result = await executePing();
      const lines = [
        `cliFound: ${result.cliFound}`,
        `version: ${result.version ?? "unknown"}`,
        `authStatus: ${result.authStatus}`,
        `defaultModel: ${result.defaultModel ?? "none"}`,
        `fallbackModel: ${result.fallbackModel ?? "none"}`,
        `serverVersion: ${result.serverVersion}`,
        `nodeVersion: ${result.nodeVersion}`,
        `maxConcurrent: ${result.maxConcurrent}`,
        `capabilities: bareMode=${result.capabilities.bareMode}, jsonOutput=${result.capabilities.jsonOutput}, jsonSchema=${result.capabilities.jsonSchema}, sessionResume=${result.capabilities.sessionResume}`,
      ];

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (e) {
      console.error("[ping]", e);
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
