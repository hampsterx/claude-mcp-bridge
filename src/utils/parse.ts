import stripAnsi from "strip-ansi";

export const OUTPUT_FORMAT = "json";

export interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  server_tool_use?: {
    web_search_requests?: number;
    web_fetch_requests?: number;
  };
  [key: string]: unknown;
}

export interface ClaudeOutput {
  response: string;
  sessionId?: string;
  isError: boolean;
  totalCostUsd?: number;
  usage?: ClaudeUsage;
  raw?: unknown;
}

const SECRET_PATTERNS = [
  /sk-ant-api[a-zA-Z0-9_-]{20,}/g,
  /sk-[a-zA-Z0-9_-]{20,}/g,
  /Bearer\s+[a-zA-Z0-9._-]{20,}/gi,
  /token[=:]\s*["']?[a-zA-Z0-9._-]{20,}["']?/gi,
  /[A-Za-z0-9+/]{40,}={0,2}/g,
];

export function redactSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

export function parseClaudeOutput(stdout: string, stderr: string): ClaudeOutput {
  const cleanedStdout = redactSecrets(stripAnsi(stdout).trim());
  const cleanedStderr = redactSecrets(stripAnsi(stderr).trim());

  if (cleanedStdout) {
    const parsed = tryParseJsonObject(cleanedStdout);
    if (parsed) return extractFromJson(parsed);
  }

  if (cleanedStderr) {
    const parsed = tryParseJsonObject(cleanedStderr);
    if (parsed) return extractFromJson(parsed);
  }

  if (cleanedStdout) {
    return { response: cleanedStdout, isError: false };
  }

  if (cleanedStderr) {
    return { response: cleanedStderr, isError: false };
  }

  throw new Error("Claude CLI produced no output");
}

function tryParseJsonObject(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function extractFromJson(parsed: unknown): ClaudeOutput {
  if (typeof parsed === "string") {
    return { response: parsed, isError: false, raw: parsed };
  }

  if (!parsed || typeof parsed !== "object") {
    return { response: String(parsed), isError: false, raw: parsed };
  }

  const obj = parsed as Record<string, unknown>;
  const sessionId = typeof obj["session_id"] === "string" ? obj["session_id"] : undefined;
  const totalCostUsd = typeof obj["total_cost_usd"] === "number" ? obj["total_cost_usd"] : undefined;
  const usage = obj["usage"] && typeof obj["usage"] === "object"
    ? obj["usage"] as ClaudeUsage
    : undefined;
  const isError = obj["is_error"] === true;

  const response = extractResponseText(obj);

  return {
    response,
    sessionId,
    isError,
    totalCostUsd,
    usage,
    raw: parsed,
  };
}

function extractResponseText(obj: Record<string, unknown>): string {
  for (const key of ["result", "response", "text", "content", "message", "output"]) {
    if (typeof obj[key] === "string") {
      return obj[key] as string;
    }
  }

  if (obj["result"] && typeof obj["result"] === "object") {
    const nested = obj["result"] as Record<string, unknown>;
    for (const key of ["response", "text", "content", "message", "output"]) {
      if (typeof nested[key] === "string") {
        return nested[key] as string;
      }
    }
  }

  return JSON.stringify(obj, null, 2);
}

export function tryParsePartial(stdout: string, stderr: string, timeoutMs: number): string {
  try {
    return parseClaudeOutput(stdout, stderr).response;
  } catch {
    const combined = redactSecrets(stripAnsi([stdout, stderr].filter(Boolean).join("\n")).trim());
    return combined || `Query timed out after ${Math.round(timeoutMs / 1000)}s.`;
  }
}

const MAX_EXTRACT_SIZE = 1_000_000;

export function extractJson(text: string): { json: unknown; raw: string } | null {
  if (!text || text.length > MAX_EXTRACT_SIZE) return null;

  try {
    return { json: JSON.parse(text), raw: text };
  } catch {
    // continue
  }

  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) {
    try {
      return { json: JSON.parse(fenced[1]), raw: fenced[1] };
    } catch {
      // continue
    }
  }

  const objStart = text.indexOf("{");
  const arrStart = text.indexOf("[");
  const start = objStart === -1 ? arrStart : arrStart === -1 ? objStart : Math.min(objStart, arrStart);
  if (start !== -1) {
    const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
    if (end > start) {
      try {
        const slice = text.slice(start, end + 1);
        return { json: JSON.parse(slice), raw: slice };
      } catch {
        // continue
      }
    }
  }

  return null;
}
