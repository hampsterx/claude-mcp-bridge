import { execFileSync } from "node:child_process";

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
  } catch {
    throw new Error(`Not a git repository: ${cwd}`);
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
    throw new Error(`Failed to get git diff: ${e}`);
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
    throw new Error(`Failed to get branch diff against "${base}": ${e}`);
  }
}
