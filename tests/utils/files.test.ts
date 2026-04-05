import { describe, it, expect } from "vitest";
import { isImageFile, assemblePrompt, readFiles } from "../../src/utils/files.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("isImageFile", () => {
  it("detects png", () => expect(isImageFile("photo.png")).toBe(true));
  it("detects jpg", () => expect(isImageFile("photo.jpg")).toBe(true));
  it("detects jpeg", () => expect(isImageFile("photo.JPEG")).toBe(true));
  it("detects gif", () => expect(isImageFile("anim.gif")).toBe(true));
  it("detects webp", () => expect(isImageFile("image.webp")).toBe(true));
  it("rejects txt", () => expect(isImageFile("file.txt")).toBe(false));
  it("rejects ts", () => expect(isImageFile("src/index.ts")).toBe(false));
});

describe("assemblePrompt", () => {
  it("returns prompt alone when no files", () => {
    expect(assemblePrompt("Hello", [])).toBe("Hello");
  });

  it("includes file contents", () => {
    const result = assemblePrompt("Review this:", [
      { path: "foo.ts", content: "const x = 1;" },
    ]);
    expect(result).toContain("foo.ts");
    expect(result).toContain("const x = 1;");
  });

  it("marks skipped files", () => {
    const result = assemblePrompt("Review:", [
      { path: "big.bin", content: "", skipped: "too large" },
    ]);
    expect(result).toContain("[SKIPPED: too large]");
  });
});

describe("readFiles", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "codex-files-test-"));
  writeFileSync(join(tempDir, "a.txt"), "content-a");
  writeFileSync(join(tempDir, "b.txt"), "content-b");

  it("reads files within root", async () => {
    const results = await readFiles(["a.txt", "b.txt"], tempDir);
    expect(results).toHaveLength(2);
    expect(results[0].content).toBe("content-a");
    expect(results[1].content).toBe("content-b");
  });

  it("throws for too many files", async () => {
    const files = Array.from({ length: 21 }, (_, i) => `file${i}.txt`);
    await expect(readFiles(files, tempDir)).rejects.toThrow(/too many files/i);
  });
});
