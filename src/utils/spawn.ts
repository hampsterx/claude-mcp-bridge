import { spawn, type ChildProcess } from "node:child_process";
import { buildSubprocessEnv } from "./env.js";

/** Hard maximum timeout — no request can exceed this. */
export const HARD_TIMEOUT_CAP = 600_000;

const DEFAULT_MAX_CONCURRENT = 3;
const QUEUE_TIMEOUT = 30_000;

export interface SpawnOptions {
  args: string[];
  cwd: string;
  stdin?: string;
  timeout?: number;
}

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

let activeCount = 0;
const parsedConcurrent = parseInt(
  process.env["CLAUDE_MAX_CONCURRENT"] ?? String(DEFAULT_MAX_CONCURRENT),
  10,
);
const maxConcurrent = Number.isNaN(parsedConcurrent) || parsedConcurrent <= 0
  ? DEFAULT_MAX_CONCURRENT
  : parsedConcurrent;
const waitQueue: Array<{
  resolve: () => void;
  reject: (err: Error) => void;
}> = [];

function acquireSlot(): Promise<void> {
  if (activeCount < maxConcurrent) {
    activeCount++;
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = waitQueue.findIndex((w) => w.resolve === resolve);
      if (idx !== -1) waitQueue.splice(idx, 1);
      reject(new Error(`Concurrency queue timeout after ${QUEUE_TIMEOUT}ms — ${activeCount} processes active`));
    }, QUEUE_TIMEOUT);

    waitQueue.push({
      resolve: () => {
        clearTimeout(timer);
        activeCount++;
        resolve();
      },
      reject,
    });
  });
}

function releaseSlot(): void {
  activeCount--;
  const next = waitQueue.shift();
  if (next) next.resolve();
}

export function findClaudeBinary(): string {
  return process.env["CLAUDE_CLI_PATH"] ?? "claude";
}

export async function spawnClaude(options: SpawnOptions): Promise<SpawnResult> {
  const timeout = Math.min(options.timeout ?? 60_000, HARD_TIMEOUT_CAP);

  await acquireSlot();
  try {
    return await doSpawn(options, timeout);
  } finally {
    releaseSlot();
  }
}

async function doSpawn(options: SpawnOptions, timeout: number): Promise<SpawnResult> {
  const binary = findClaudeBinary();
  const env = buildSubprocessEnv();

  return new Promise<SpawnResult>((resolve, reject) => {
    let child: ChildProcess;
    const detached = process.platform !== "win32";

    try {
      child = spawn(binary, options.args, {
        cwd: options.cwd,
        env,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        detached,
      });
    } catch (e) {
      reject(new Error(`Failed to spawn Claude CLI: ${e}`));
      return;
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const timer = setTimeout(() => {
      timedOut = true;
      killTimer = killProcessGroup(child);
    }, timeout);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      if (!settled) {
        settled = true;
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new Error("claude CLI not found. Install Claude Code and ensure `claude` is on PATH."));
        } else {
          reject(new Error(`Failed to run Claude CLI: ${err.message}`));
        }
      }
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      if (!settled) {
        settled = true;
        resolve({ stdout, stderr, exitCode: code, timedOut });
      }
    });

    if (options.stdin) {
      child.stdin?.write(options.stdin);
    }
    child.stdin?.end();
  });
}

function killProcessGroup(child: ChildProcess): NodeJS.Timeout | undefined {
  const pid = child.pid;
  if (!pid) return undefined;

  const useGroupKill = process.platform !== "win32";
  const kill = (signal: NodeJS.Signals) => {
    try {
      if (useGroupKill) {
        process.kill(-pid, signal);
      } else {
        child.kill(signal);
      }
    } catch {
      try {
        child.kill(signal);
      } catch {
        // Already dead.
      }
    }
  };

  kill("SIGTERM");
  return setTimeout(() => kill("SIGKILL"), 5000);
}

export function resetConcurrency(): void {
  activeCount = 0;
  waitQueue.length = 0;
}

export interface ClaudeArgsOptions {
  model?: string;
  fallbackModel?: string;
  maxBudgetUsd?: number;
  effort?: string;
  sessionId?: string;
  noSessionPersistence?: boolean;
  allowedTools?: string[];
  jsonSchema?: string;
  prompt?: string;
}

export function buildClaudeArgs(options: ClaudeArgsOptions): string[] {
  const args: string[] = ["-p", "--bare", "--disable-slash-commands", "--output-format", "json"];
  if (options.model) args.push("--model", options.model);
  if (options.fallbackModel) args.push("--fallback-model", options.fallbackModel);
  if (options.maxBudgetUsd && options.maxBudgetUsd > 0) args.push("--max-budget-usd", String(options.maxBudgetUsd));
  if (options.effort) args.push("--effort", options.effort);
  if (options.sessionId) args.push("--resume", options.sessionId);
  if (options.noSessionPersistence) args.push("--no-session-persistence");
  if (options.allowedTools && options.allowedTools.length > 0) {
    args.push("--allowed-tools", options.allowedTools.join(" "));
  }
  if (options.jsonSchema) args.push("--json-schema", options.jsonSchema);
  if (options.prompt) args.push(options.prompt);
  return args;
}
