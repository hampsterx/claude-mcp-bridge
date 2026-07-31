import { spawn, type ChildProcess } from "node:child_process";
import { buildSubprocessEnv, isApiKeyAuth } from "./env.js";

/** Hard maximum timeout — no request can exceed this. */
export const HARD_TIMEOUT_CAP = 600_000;

/** Byte threshold above which prompts are piped via stdin instead of CLI args. */
export const STDIN_THRESHOLD = 4000;

/**
 * Clamp a requested timeout to [0, HARD_TIMEOUT_CAP], falling back to
 * `defaultMs` when `requested` is undefined.
 */
export function clampTimeout(requested: number | undefined, defaultMs: number): number {
  return Math.max(0, Math.min(requested ?? defaultMs, HARD_TIMEOUT_CAP));
}

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

/**
 * Enforce the tool restriction at the subprocess boundary rather than trusting
 * every caller to have gone through `buildClaudeArgs`. `spawnClaude` takes a
 * raw argv array, so a future call site could otherwise spawn an unrestricted
 * subprocess and silently undo the guarantee documented in SECURITY.md.
 */
function assertToolsRestricted(args: string[]): void {
  // Past the `--` separator every token is a positional, so a `--tools` there
  // is prompt text and restricts nothing.
  const separatorIndex = args.indexOf("--");
  const effective = args
    .map((arg, i) => (arg === "--tools" && (separatorIndex === -1 || i < separatorIndex) ? i : -1))
    .filter((i) => i !== -1);
  // Exactly one: with repeated flags the CLI parser decides which wins, so a
  // permissive second `--tools` could override a restrictive first. Fail closed
  // rather than trust the ordering.
  const toolsIndex = effective.length === 1 ? effective[0]! : -1;
  // It also needs an actual value: the next token must not be absent, the
  // separator, or another flag.
  const value = toolsIndex === -1 ? undefined : args[toolsIndex + 1];
  const hasValue = value !== undefined && value !== "--" && !value.startsWith("--");
  if (!hasValue) {
    throw new Error(
      "Refusing to spawn Claude CLI without an effective --tools flag. Build argv with buildClaudeArgs(), which requires an explicit tool set.",
    );
  }
}

export async function spawnClaude(options: SpawnOptions): Promise<SpawnResult> {
  assertToolsRestricted(options.args);
  const timeout = clampTimeout(options.timeout, 60_000);

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

/** Current number of active subprocess slots in use. */
export function getActiveCount(): number { return activeCount; }

/** Number of callers waiting for a concurrency slot. */
export function getQueueDepth(): number { return waitQueue.length; }

/** Resolved max-concurrent value (from env or default). */
export function getMaxConcurrent(): number { return maxConcurrent; }

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
  /**
   * Built-in tools the subprocess may use. Required so every call site has to
   * make a deliberate choice: `[]` grants none, `["default"]` grants the CLI's
   * full set. See `resolveTools` for the per-tool defaults.
   */
  tools: string[];
  jsonSchema?: string;
  prompt?: string;
}

/**
 * Encode the tool restriction flags.
 *
 * The two flags are complementary, not alternatives. `--tools` decides which
 * tools exist in the subprocess's toolset; `--allowed-tools` pre-approves them
 * so a non-interactive run does not stall asking for permission. Read, Glob and
 * Grep are auto-approved anyway, but WebSearch and WebFetch are not, so both
 * flags are emitted from the same list.
 *
 * For `--tools`, each tool must be its own argv element: a single comma-joined
 * value silently keeps only the first tool, despite the CLI help showing that
 * form. `--allowed-tools` does take one space-separated value.
 */
function buildToolsArgs(tools: string[]): string[] {
  if (tools.length === 0) return ["--tools", ""];
  for (const tool of tools) {
    // A dash-prefixed entry would terminate the variadic list and be parsed as
    // a flag of its own, silently widening what the subprocess can do. Requiring
    // a leading letter rules that out while still allowing MCP identifiers,
    // whose server-name portion may contain hyphens (`mcp__my-server__tool`).
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(tool)) {
      throw new Error(
        `Invalid tool name ${JSON.stringify(tool)}. Expected a plain identifier such as "Read" or "WebSearch".`,
      );
    }
  }
  return ["--tools", ...tools, "--allowed-tools", tools.join(" ")];
}

/**
 * Build the CLI argument array for a Claude subprocess.
 *
 * Context isolation and tool restriction are separate concerns. `--bare` and
 * `--setting-sources ""` control what context the subprocess loads; neither
 * restricts its toolset. Only `--tools` does that.
 */
export function buildClaudeArgs(options: ClaudeArgsOptions): string[] {
  // --bare skips hooks, CLAUDE.md, memory and plugins, but only supports API
  // key auth (OAuth/keychain reads are disabled). Subscription auth requires
  // non-bare mode; --setting-sources "" prevents project/local settings from
  // influencing the subprocess.
  const auth: string[] = isApiKeyAuth()
    ? ["-p", "--bare"]
    : ["-p", "--setting-sources", ""];

  // `--tools` is variadic: it consumes every following non-flag token, which
  // would include the positional prompt appended at the end of this array. The
  // next flag-prefixed token terminates it, so the tool list is emitted here,
  // where `buildToolsArgs` puts `--allowed-tools` directly after it (or
  // `--output-format`, when no tools are granted). Keep a flag in that slot.
  const args: string[] = [
    ...auth,
    ...buildToolsArgs(options.tools),
    "--output-format",
    "json",
  ];
  // Values that originate outside this file (MCP input or env) use the `=`
  // form, so binding never depends on whether a given flag declares its value
  // required or optional. `--resume` is the cautionary case: it is optional, so
  // the space form lets a dash-prefixed value detach and be parsed as a flag.
  if (options.model) args.push(`--model=${options.model}`);
  if (options.fallbackModel) args.push(`--fallback-model=${options.fallbackModel}`);
  if (options.maxBudgetUsd && options.maxBudgetUsd > 0) args.push("--max-budget-usd", String(options.maxBudgetUsd));
  if (options.effort) args.push(`--effort=${options.effort}`);
  // `--resume` takes an *optional* value, so a dash-prefixed session id detaches
  // from it and is parsed as a flag in its own right. The `=` form binds the
  // value whatever it contains.
  if (options.sessionId) args.push(`--resume=${options.sessionId}`);
  if (options.noSessionPersistence) args.push("--no-session-persistence");
  if (options.jsonSchema) args.push("--json-schema", options.jsonSchema);
  // `--` ends option parsing. The prompt is caller-supplied, and without this a
  // prompt that looks like a flag (`--tools=default`, `--add-dir=/`, or a
  // `--settings=` payload carrying a hook command) is parsed as one and
  // overrides every restriction set above.
  if (options.prompt) args.push("--", options.prompt);
  return args;
}
