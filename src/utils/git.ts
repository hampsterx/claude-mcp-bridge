import { execFileSync } from "node:child_process";

export interface DiffStat {
  files: number;
  insertions: number;
  deletions: number;
}

export type DiffSpec =
  | { type: "uncommitted" }
  | { type: "branch"; base: string };

/**
 * Parse `git diff --numstat` output into aggregate stats.
 * Binary files show "-" for insertions/deletions; they count as files but contribute 0 lines.
 */
export function parseNumstat(output: string): DiffStat {
  let files = 0;
  let insertions = 0;
  let deletions = 0;

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split("\t");
    if (parts.length < 3) continue;
    files++;
    const ins = parseInt(parts[0]!, 10);
    const del = parseInt(parts[1]!, 10);
    if (!Number.isNaN(ins)) insertions += ins;
    if (!Number.isNaN(del)) deletions += del;
  }

  return { files, insertions, deletions };
}

/**
 * Get diff stats (file count, insertions, deletions) for a diff spec.
 * Uses `git diff HEAD --numstat` for uncommitted to avoid double-counting
 * files with both staged and unstaged changes.
 */
export function getDiffStat(cwd: string, spec: DiffSpec): DiffStat {
  const args = spec.type === "uncommitted"
    ? ["-C", cwd, "diff", "HEAD", "--numstat"]
    : ["-C", cwd, "diff", `${spec.base}...HEAD`, "--numstat"];

  const output = execFileSync("git", args, {
    encoding: "utf8",
    timeout: 30_000,
  });

  return parseNumstat(output);
}

/**
 * Validate a git base ref for safety.
 * Rejects refs that could inject arguments or traverse paths.
 */
export function validateBaseRef(base: string): void {
  if (base.startsWith("-") || base.includes("..") || base.includes("@{") || !/^[\w./-]+$/.test(base)) {
    throw new Error(`Invalid base ref: "${base}" — must be a valid git ref (alphanumeric, -, _, /, .)`);
  }
}

/**
 * Find the git repository root for a given directory.
 * Throws if not inside a git repo.
 */
export function getGitRoot(cwd: string): string {
  try {
    return execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      throw new Error("git not found. Install git and ensure it is on PATH.", { cause: e });
    }
    if ((e as { killed?: boolean }).killed || (e as { signal?: string }).signal) {
      throw new Error(`git timed out checking repository root: ${cwd}`, { cause: e });
    }
    throw new Error(`Not a git repository: ${cwd}`, { cause: e });
  }
}

/**
 * Get a unified diff of uncommitted changes (staged + unstaged).
 */
export function getUncommittedDiff(cwd: string, contextLines = 5): string {
  try {
    // Staged changes
    const staged = execFileSync(
      "git",
      ["-C", cwd, "diff", "--cached", `-U${contextLines}`],
      { encoding: "utf8", timeout: 30000 },
    ).trim();

    // Unstaged changes
    const unstaged = execFileSync(
      "git",
      ["-C", cwd, "diff", `-U${contextLines}`],
      { encoding: "utf8", timeout: 30000 },
    ).trim();

    const parts = [staged, unstaged].filter(Boolean);
    if (parts.length === 0) {
      throw new Error("No uncommitted changes found");
    }
    return parts.join("\n");
  } catch (e) {
    if (e instanceof Error && e.message === "No uncommitted changes found") {
      throw e;
    }
    throw new Error("Failed to get git diff", { cause: e });
  }
}

/**
 * Get a diff between the current branch and a base branch/ref.
 */
export function getBranchDiff(cwd: string, base: string, contextLines = 5): string {
  try {
    const diff = execFileSync(
      "git",
      ["-C", cwd, "diff", `${base}...HEAD`, `-U${contextLines}`],
      { encoding: "utf8", timeout: 30000 },
    ).trim();

    if (!diff) {
      throw new Error(`No diff found between ${base} and HEAD`);
    }
    return diff;
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("No diff found")) {
      throw e;
    }
    throw new Error(`Failed to get branch diff against "${base}"`, { cause: e });
  }
}
