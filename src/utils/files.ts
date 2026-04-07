import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  resolveAndVerify,
  checkFileSize,
  MAX_FILE_SIZE,
  MAX_FILES,
} from "./security.js";

/** Maximum file size for image files (5MB). */
export const MAX_IMAGE_FILE_SIZE = 5_000_000;

/** Extensions treated as image files (binary, passed by path to CLI). */
export const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp",
]);

/**
 * Check whether a file path refers to an image based on extension.
 */
export function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export interface FileContent {
  path: string;
  content: string;
  skipped?: string;
}

/**
 * Read multiple files with path sandboxing and size limits.
 */
export async function readFiles(
  files: string[],
  rootDir: string,
): Promise<FileContent[]> {
  if (files.length > MAX_FILES) {
    throw new Error(`Too many files: ${files.length} (max ${MAX_FILES})`);
  }

  return Promise.all(
    files.map(async (f): Promise<FileContent> => {
      try {
        const resolved = await resolveAndVerify(f, rootDir);
        const size = await checkFileSize(resolved);

        if (size > MAX_FILE_SIZE) {
          return {
            path: f,
            content: "",
            skipped: `${(size / 1024).toFixed(0)}KB exceeds ${(MAX_FILE_SIZE / 1024).toFixed(0)}KB limit`,
          };
        }

        const content = await readFile(resolved, "utf8");
        return { path: f, content };
      } catch (e) {
        return {
          path: f,
          content: "",
          skipped: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );
}

/**
 * Assemble a prompt with inlined file contents.
 */
export function assemblePrompt(prompt: string, fileContents: FileContent[]): string {
  if (fileContents.length === 0) return prompt;

  const parts = fileContents.map((f) => {
    if (f.skipped) {
      return `--- ${f.path} ---\n[SKIPPED: ${f.skipped}]`;
    }
    return `--- ${f.path} ---\n${f.content}`;
  });

  return `${prompt}\n\n${parts.join("\n\n")}`;
}
