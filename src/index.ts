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
import { getErrorMessage } from "./utils/errors.js";
import { buildMeta } from "./utils/meta.js";
import {
  queryAnnotations,
  reviewAnnotations,
  searchAnnotations,
  structuredAnnotations,
  pingAnnotations,
} from "./annotations.js";
import {
  queryDescription,
  reviewDescription,
  searchDescription,
  structuredDescription,
  pingDescription,
} from "./descriptions.js";

const require = createRequire(import.meta.url);
const { version: PKG_VERSION } = require("../package.json") as { version: string };

const server = new McpServer({
  name: "claude-mcp-bridge",
  version: PKG_VERSION,
});

// --- query tool ---

server.registerTool(
  "query",
  {
    title: "Claude Query",
    description: queryDescription,
    inputSchema: {
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
    annotations: queryAnnotations,
  },
  async (input) => {
    const start = Date.now();
    try {
      const result = await executeQuery(input);

      const textMeta: string[] = [];
      if (result.filesIncluded.length > 0) textMeta.push(`Files included: ${result.filesIncluded.join(", ")}`);
      if (result.imagesIncluded.length > 0) textMeta.push(`Images included: ${result.imagesIncluded.join(", ")}`);
      if (result.filesSkipped.length > 0) textMeta.push(`Files skipped: ${result.filesSkipped.join(", ")}`);
      if (result.timedOut) textMeta.push("(timed out)");

      const text = textMeta.length > 0
        ? `${result.response}\n\n---\n${textMeta.join("\n")}`
        : result.response;

      return {
        content: [{ type: "text" as const, text }],
        _meta: buildMeta({
          durationMs: Date.now() - start,
          model: result.model,
          sessionId: result.sessionId,
          totalCostUsd: result.totalCostUsd,
          usage: result.usage,
          timedOut: result.timedOut,
        }),
      };
    } catch (e) {
      console.error("[query]", e);
      return {
        content: [{ type: "text" as const, text: `Error: ${getErrorMessage(e)}` }],
        isError: true,
        _meta: buildMeta({ durationMs: Date.now() - start }),
      };
    }
  },
);

// --- structured tool ---

server.registerTool(
  "structured",
  {
    title: "Structured Output",
    description: structuredDescription,
    inputSchema: {
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
    annotations: structuredAnnotations,
  },
  async (input) => {
    const start = Date.now();
    try {
      const result = await executeStructured(input);
      const meta = buildMeta({
        durationMs: Date.now() - start,
        model: result.model,
        sessionId: result.sessionId,
        totalCostUsd: result.totalCostUsd,
        usage: result.usage,
        timedOut: result.timedOut,
      });

      if (!result.valid) {
        return {
          content: [{ type: "text" as const, text: `Error: ${result.errors ?? "Invalid response"}` }],
          isError: true,
          _meta: meta,
        };
      }

      const content: Array<{ type: "text"; text: string }> = [
        { type: "text", text: result.response },
      ];

      const textMeta: string[] = [];
      if (result.filesIncluded.length > 0) textMeta.push(`Files: ${result.filesIncluded.join(", ")}`);
      if (result.timedOut) textMeta.push("(timed out)");
      if (textMeta.length > 0) {
        content.push({ type: "text", text: textMeta.join("\n") });
      }

      return { content, _meta: meta };
    } catch (e) {
      console.error("[structured]", e);
      return {
        content: [{ type: "text" as const, text: `Error: ${getErrorMessage(e)}` }],
        isError: true,
        _meta: buildMeta({ durationMs: Date.now() - start }),
      };
    }
  },
);

// --- review tool ---

server.registerTool(
  "review",
  {
    title: "Code Review",
    description: reviewDescription,
    inputSchema: {
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
    annotations: reviewAnnotations,
  },
  async (input) => {
    const start = Date.now();
    try {
      const result = await executeReview(input);

      const textMeta: string[] = [
        `Diff source: ${result.diffSource}`,
        `Mode: ${result.mode}`,
      ];
      if (result.base) textMeta.push(`Base: ${result.base}`);
      if (result.timedOut) textMeta.push("(timed out)");

      const text = `${result.response}\n\n---\n${textMeta.join("\n")}`;

      return {
        content: [{ type: "text" as const, text }],
        _meta: buildMeta({
          durationMs: Date.now() - start,
          model: result.model,
          sessionId: result.sessionId,
          totalCostUsd: result.totalCostUsd,
          usage: result.usage,
          timedOut: result.timedOut,
        }),
      };
    } catch (e) {
      console.error("[review]", e);
      return {
        content: [{ type: "text" as const, text: `Error: ${getErrorMessage(e)}` }],
        isError: true,
        _meta: buildMeta({ durationMs: Date.now() - start }),
      };
    }
  },
);

// --- search tool ---

server.registerTool(
  "search",
  {
    title: "Web Search",
    description: searchDescription,
    inputSchema: {
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
    annotations: searchAnnotations,
  },
  async (input) => {
    const start = Date.now();
    try {
      const result = await executeSearch(input);

      const text = result.timedOut
        ? `${result.response}\n\n---\n(timed out)`
        : result.response;

      return {
        content: [{ type: "text" as const, text }],
        _meta: buildMeta({
          durationMs: Date.now() - start,
          model: result.model,
          sessionId: result.sessionId,
          totalCostUsd: result.totalCostUsd,
          usage: result.usage,
          timedOut: result.timedOut,
        }),
      };
    } catch (e) {
      console.error("[search]", e);
      return {
        content: [{ type: "text" as const, text: `Error: ${getErrorMessage(e)}` }],
        isError: true,
        _meta: buildMeta({ durationMs: Date.now() - start }),
      };
    }
  },
);

// --- ping tool ---

server.registerTool(
  "ping",
  {
    title: "Health Check",
    description: pingDescription,
    inputSchema: {},
    annotations: pingAnnotations,
  },
  async () => {
    const start = Date.now();
    try {
      const result = await executePing();
      const lines = [
        `cliFound: ${result.cliFound}`,
        `version: ${result.version ?? "unknown"}`,
        `authMethod: ${result.authMethod}`,
        ...(result.subscriptionType ? [`subscriptionType: ${result.subscriptionType}`] : []),
        `defaultModel: ${result.defaultModel ?? "none"}`,
        `fallbackModel: ${result.fallbackModel ?? "none"}`,
        `serverVersion: ${result.serverVersion}`,
        `nodeVersion: ${result.nodeVersion}`,
        `maxConcurrent: ${result.maxConcurrent}`,
        `capabilities: bareMode=${result.capabilities.bareMode}, jsonOutput=${result.capabilities.jsonOutput}, jsonSchema=${result.capabilities.jsonSchema}, sessionResume=${result.capabilities.sessionResume}`,
      ];

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
        _meta: buildMeta({ durationMs: Date.now() - start }),
      };
    } catch (e) {
      console.error("[ping]", e);
      return {
        content: [{ type: "text" as const, text: `Error: ${getErrorMessage(e)}` }],
        isError: true,
        _meta: buildMeta({ durationMs: Date.now() - start }),
      };
    }
  },
);

// --- Start server ---

const transport = new StdioServerTransport();
await server.connect(transport);
