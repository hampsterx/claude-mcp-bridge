import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { findClaudeBinary } from "../utils/spawn.js";
import { buildSubprocessEnv } from "../utils/env.js";
import { getDefaultModel, getFallbackModel } from "../utils/model.js";

const require = createRequire(import.meta.url);
const PKG_VERSION: string = (require("../../package.json") as { version: string }).version;

export interface PingResult {
  cliFound: boolean;
  version: string | null;
  authStatus: "ok" | "missing" | "error";
  defaultModel: string | null;
  fallbackModel: string | null;
  serverVersion: string;
  nodeVersion: string;
  maxConcurrent: number;
  capabilities: {
    bareMode: boolean;
    jsonOutput: boolean;
    jsonSchema: boolean;
    sessionResume: boolean;
  };
}

function detectAuthStatus(): PingResult["authStatus"] {
  const env = buildSubprocessEnv();
  return env["ANTHROPIC_API_KEY"] ? "ok" : "missing";
}

export async function executePing(): Promise<PingResult> {
  const binary = findClaudeBinary();
  const maxConcurrent = parseInt(process.env["CLAUDE_MAX_CONCURRENT"] ?? "3", 10);

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
        authStatus: "missing",
        defaultModel: getDefaultModel("query"),
        fallbackModel: getFallbackModel() ?? null,
        serverVersion: PKG_VERSION,
        nodeVersion: process.version,
        maxConcurrent,
        capabilities: {
          bareMode: false,
          jsonOutput: false,
          jsonSchema: false,
          sessionResume: false,
        },
      };
    }
    return {
      cliFound: true,
      version: null,
      authStatus: "error",
      defaultModel: getDefaultModel("query"),
      fallbackModel: getFallbackModel() ?? null,
      serverVersion: PKG_VERSION,
      nodeVersion: process.version,
      maxConcurrent,
      capabilities: {
        bareMode: true,
        jsonOutput: true,
        jsonSchema: true,
        sessionResume: true,
      },
    };
  }

  return {
    cliFound,
    version,
    authStatus: detectAuthStatus(),
    defaultModel: getDefaultModel("query"),
    fallbackModel: getFallbackModel() ?? null,
    serverVersion: PKG_VERSION,
    nodeVersion: process.version,
    maxConcurrent,
    capabilities: {
      bareMode: true,
      jsonOutput: true,
      jsonSchema: true,
      sessionResume: true,
    },
  };
}
