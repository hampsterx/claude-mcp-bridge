export type ToolName = "query" | "structured" | "search" | "ping";

const DEFAULT_MODELS: Record<ToolName, string> = {
  query: "sonnet",
  structured: "sonnet",
  search: "sonnet",
  ping: "haiku",
};

export function getDefaultModel(tool: ToolName = "query"): string {
  const specific = process.env[`CLAUDE_${tool.toUpperCase()}_MODEL`]?.trim();
  if (specific) return specific;

  const shared = process.env["CLAUDE_DEFAULT_MODEL"]?.trim();
  if (shared) return shared;

  return DEFAULT_MODELS[tool];
}

export function getFallbackModel(): string | undefined {
  const value = process.env["CLAUDE_FALLBACK_MODEL"]?.trim();
  if (value?.toLowerCase() === "none") return undefined;
  return value || "haiku";
}

export function resolveModel(tool: ToolName, explicit?: string): string {
  return explicit?.trim() || getDefaultModel(tool);
}

const DEFAULT_EFFORT: Partial<Record<ToolName, string>> = {
  search: "medium",
};

export function resolveEffort(tool: ToolName, explicit?: string): string | undefined {
  const value = explicit?.trim();
  if (value) return value;
  const envVal = process.env[`CLAUDE_${tool.toUpperCase()}_EFFORT`]?.trim();
  if (envVal) return envVal;
  return DEFAULT_EFFORT[tool];
}

/**
 * Built-in tools each spawned subprocess may use.
 *
 * Read-only by default. The bridge inlines file contents itself before
 * spawning, so the subprocess needs no execution or mutation tools; Bash,
 * Write and Edit are withheld deliberately.
 */
const DEFAULT_TOOLS: Record<ToolName, string[]> = {
  query: ["Read", "Glob", "Grep"],
  structured: ["Read", "Glob", "Grep"],
  search: ["WebSearch", "WebFetch"],
  ping: [],
};

/**
 * Resolve the built-in tool set for a subprocess.
 *
 * `CLAUDE_<TOOL>_TOOLS` overrides the default: a comma or space separated
 * list of tool names, the literal `default` for the CLI's full built-in set,
 * or an empty value for no tools at all.
 */
export function resolveTools(tool: ToolName): string[] {
  const raw = process.env[`CLAUDE_${tool.toUpperCase()}_TOOLS`];
  if (raw === undefined) return DEFAULT_TOOLS[tool];
  const trimmed = raw.trim();
  if (trimmed === "") return [];
  return trimmed.split(/[,\s]+/).filter(Boolean);
}

export function resolveMaxBudget(explicit?: number): number {
  if (explicit !== undefined && explicit > 0) return explicit;
  const envVal = parseFloat(process.env["CLAUDE_MAX_BUDGET_USD"] ?? "0");
  return envVal > 0 ? envVal : 0;
}
