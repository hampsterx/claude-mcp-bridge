import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { findClaudeBinary, getActiveCount, getQueueDepth, getMaxConcurrent } from "../utils/spawn.js";
import { buildSubprocessEnv } from "../utils/env.js";
import { getDefaultModel, getFallbackModel } from "../utils/model.js";

const require = createRequire(import.meta.url);
const PKG_VERSION: string = (require("../../package.json") as { version: string }).version;

export interface PingResult {
  cliFound: boolean;
  version: string | null;
  authMethod: "api-key" | "subscription" | "none";
  subscriptionType: string | null;
  defaultModel: string | null;
  fallbackModel: string | null;
  serverVersion: string;
  nodeVersion: string;
  maxConcurrent: number;
  activeCount: number;
  queueDepth: number;
  capabilities: {
    bareMode: boolean;
    jsonOutput: boolean;
    jsonSchema: boolean;
    sessionResume: boolean;
  };
}

interface CredentialsFile {
  claudeAiOauth?: {
    expiresAt?: number;
    subscriptionType?: string;
  };
}

function detectAuth(): { method: PingResult["authMethod"]; subscriptionType: string | null } {
  const env = buildSubprocessEnv();
  if (env["ANTHROPIC_API_KEY"]) {
    return { method: "api-key", subscriptionType: null };
  }

  const configDir = process.env["CLAUDE_CONFIG_DIR"]
    ?? join(process.env["HOME"] ?? "", ".claude");
  try {
    const raw = readFileSync(join(configDir, ".credentials.json"), "utf8");
    const creds = JSON.parse(raw) as CredentialsFile;
    const oauth = creds.claudeAiOauth;
    if (oauth?.expiresAt && oauth.expiresAt > Date.now()) {
      return { method: "subscription", subscriptionType: oauth.subscriptionType ?? null };
    }
  } catch {
    // No credentials file or unreadable
  }

  return { method: "none", subscriptionType: null };
}

export async function executePing(): Promise<PingResult> {
  const binary = findClaudeBinary();
  const maxConcurrent = getMaxConcurrent();
  const activeCount = getActiveCount();
  const queueDepth = getQueueDepth();

  let cliFound = false;
  let version: string | null = null;

  try {
    version = execFileSync(binary, ["--version"], {
      encoding: "utf8",
      timeout: 10_000,
    }).trim();
    cliFound = true;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return {
        cliFound: false,
        version: null,
        authMethod: "none",
        subscriptionType: null,
        defaultModel: getDefaultModel("query"),
        fallbackModel: getFallbackModel() ?? null,
        serverVersion: PKG_VERSION,
        nodeVersion: process.version,
        maxConcurrent,
        activeCount,
        queueDepth,
        capabilities: {
          bareMode: false,
          jsonOutput: false,
          jsonSchema: false,
          sessionResume: false,
        },
      };
    }
    // Non-ENOENT errors (EACCES, timeout, broken binary) mean the CLI exists
    // but is not usable. Report cliFound: false with a diagnostic message.
    return {
      cliFound: false,
      version: `error: ${err.message ?? String(e)}`,
      authMethod: "none",
      subscriptionType: null,
      defaultModel: getDefaultModel("query"),
      fallbackModel: getFallbackModel() ?? null,
      serverVersion: PKG_VERSION,
      nodeVersion: process.version,
      maxConcurrent,
      activeCount,
      queueDepth,
      capabilities: {
        bareMode: false,
        jsonOutput: false,
        jsonSchema: false,
        sessionResume: false,
      },
    };
  }

  const auth = detectAuth();
  return {
    cliFound,
    version,
    authMethod: auth.method,
    subscriptionType: auth.subscriptionType,
    defaultModel: getDefaultModel("query"),
    fallbackModel: getFallbackModel() ?? null,
    serverVersion: PKG_VERSION,
    nodeVersion: process.version,
    maxConcurrent,
    activeCount,
    queueDepth,
    capabilities: {
      bareMode: true,
      jsonOutput: true,
      jsonSchema: true,
      sessionResume: true,
    },
  };
}
