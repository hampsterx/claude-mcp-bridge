import { describe, it, expect } from "vitest";
import { resolveAndVerify, verifyDirectory } from "../../src/utils/security.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("resolveAndVerify", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "codex-test-"));
  const testFile = join(tempDir, "test.txt");
  writeFileSync(testFile, "hello");

  it("resolves a valid file within root", async () => {
    const resolved = await resolveAndVerify("test.txt", tempDir);
    expect(resolved).toBe(testFile);
  });

  it("blocks path traversal", async () => {
    await expect(resolveAndVerify("../../../etc/passwd", tempDir)).rejects.toThrow(
      /path traversal blocked/i,
    );
  });

  it("handles subdirectory paths", async () => {
    const { mkdirSync, writeFileSync: writeSync } = await import("node:fs");
    const subDir = join(tempDir, "sub");
    mkdirSync(subDir, { recursive: true });
    const subFile = join(subDir, "nested.txt");
    writeSync(subFile, "nested");
    const resolved = await resolveAndVerify("sub/nested.txt", tempDir);
    expect(resolved).toBe(subFile);
  });
});

describe("verifyDirectory", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "codex-test-dir-"));

  it("accepts a valid directory", async () => {
    const resolved = await verifyDirectory(tempDir);
    expect(resolved).toBe(tempDir);
  });

  it("rejects a file path", async () => {
    const file = join(tempDir, "file.txt");
    writeFileSync(file, "test");
    await expect(verifyDirectory(file)).rejects.toThrow(/not a directory/i);
  });

  it("rejects non-existent path", async () => {
    await expect(verifyDirectory("/nonexistent/path")).rejects.toThrow();
  });
});
