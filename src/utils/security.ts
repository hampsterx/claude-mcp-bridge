import { realpath, stat } from "node:fs/promises";
import path from "node:path";

/** Maximum file size in bytes (1MB). */
export const MAX_FILE_SIZE = 1_000_000;

/** Maximum number of files that can be attached to a query. */
export const MAX_FILES = 20;

/**
 * Resolve a path and verify it's within the allowed root directory.
 * Prevents path traversal attacks via symlinks, `..`, etc.
 */
export async function resolveAndVerify(
  filePath: string,
  rootDir: string,
): Promise<string> {
  const resolved = await realpath(path.resolve(rootDir, filePath));
  const resolvedRoot = await realpath(rootDir);

  if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
    throw new Error(
      `Path traversal blocked: "${filePath}" resolves outside allowed root "${rootDir}"`,
    );
  }

  return resolved;
}

/**
 * Verify a directory exists and is actually a directory.
 */
export async function verifyDirectory(dir: string): Promise<string> {
  const resolved = await realpath(dir);
  const s = await stat(resolved);
  if (!s.isDirectory()) {
    throw new Error(`Not a directory: ${dir}`);
  }
  return resolved;
}

/**
 * Check if a file is within size limits.
 */
export async function checkFileSize(filePath: string): Promise<number> {
  const s = await stat(filePath);
  return s.size;
}
