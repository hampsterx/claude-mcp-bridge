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

export function resolveMaxBudget(explicit?: number): number {
  if (explicit !== undefined && explicit > 0) return explicit;
  const envVal = parseFloat(process.env["CLAUDE_MAX_BUDGET_USD"] ?? "0");
  return envVal > 0 ? envVal : 0;
}
