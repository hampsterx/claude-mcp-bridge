import { beforeEach, describe, expect, it, vi } from "vitest";

const { execFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execFileSync: execFileSyncMock };
});

import { parseNumstat, getDiffStat } from "../../src/utils/git.js";

describe("parseNumstat", () => {
  it("parses empty output", () => {
    expect(parseNumstat("")).toEqual({ files: 0, insertions: 0, deletions: 0 });
  });

  it("parses single file", () => {
    const output = "10\t3\tsrc/index.ts\n";
    expect(parseNumstat(output)).toEqual({ files: 1, insertions: 10, deletions: 3 });
  });

  it("parses multiple files", () => {
    const output = [
      "10\t3\tsrc/index.ts",
      "5\t0\tsrc/utils/git.ts",
      "0\t8\tsrc/old.ts",
    ].join("\n");
    expect(parseNumstat(output)).toEqual({ files: 3, insertions: 15, deletions: 11 });
  });

  it("handles binary files (- for insertions/deletions)", () => {
    const output = [
      "10\t3\tsrc/index.ts",
      "-\t-\timage.png",
    ].join("\n");
    const stat = parseNumstat(output);
    expect(stat.files).toBe(2);
    expect(stat.insertions).toBe(10);
    expect(stat.deletions).toBe(3);
  });

  it("handles renames with => syntax", () => {
    const output = "5\t2\tsrc/{old.ts => new.ts}\n";
    const stat = parseNumstat(output);
    expect(stat.files).toBe(1);
    expect(stat.insertions).toBe(5);
    expect(stat.deletions).toBe(2);
  });

  it("ignores blank lines", () => {
    const output = "\n10\t3\tsrc/index.ts\n\n";
    expect(parseNumstat(output)).toEqual({ files: 1, insertions: 10, deletions: 3 });
  });
});

describe("getDiffStat", () => {
  beforeEach(() => {
    execFileSyncMock.mockReset();
  });

  it("uses git diff HEAD --numstat for uncommitted", () => {
    execFileSyncMock.mockReturnValue("5\t2\tsrc/index.ts\n");

    const stat = getDiffStat("/repo", { type: "uncommitted" });

    expect(execFileSyncMock).toHaveBeenCalledWith(
      "git",
      ["-C", "/repo", "diff", "HEAD", "--numstat"],
      expect.objectContaining({ encoding: "utf8", timeout: 30_000 }),
    );
    expect(stat).toEqual({ files: 1, insertions: 5, deletions: 2 });
  });

  it("uses git diff base...HEAD --numstat for branch", () => {
    execFileSyncMock.mockReturnValue("3\t1\tREADME.md\n");

    const stat = getDiffStat("/repo", { type: "branch", base: "main" });

    expect(execFileSyncMock).toHaveBeenCalledWith(
      "git",
      ["-C", "/repo", "diff", "main...HEAD", "--numstat"],
      expect.objectContaining({ encoding: "utf8", timeout: 30_000 }),
    );
    expect(stat).toEqual({ files: 1, insertions: 3, deletions: 1 });
  });

  it("propagates git errors", () => {
    execFileSyncMock.mockImplementation(() => { throw new Error("not a git repo"); });

    expect(() => getDiffStat("/tmp", { type: "uncommitted" })).toThrow("not a git repo");
  });
});
