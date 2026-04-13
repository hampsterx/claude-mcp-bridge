import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import {
  getGitRoot,
  getUncommittedDiff,
  getBranchDiff,
  validateBaseRef,
} from "../../src/utils/git.js";

let repoDir: string;
let nonRepoDir: string;

beforeAll(async () => {
  // Create a temp git repo with an initial commit
  repoDir = await mkdtemp(path.join(os.tmpdir(), "cmb-git-test-"));
  execFileSync("git", ["init"], { cwd: repoDir });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: repoDir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repoDir });
  await writeFile(path.join(repoDir, "initial.txt"), "hello");
  execFileSync("git", ["add", "."], { cwd: repoDir });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: repoDir });

  // Non-repo directory
  nonRepoDir = await mkdtemp(path.join(os.tmpdir(), "cmb-git-nonrepo-"));
});

afterAll(async () => {
  if (repoDir) await rm(repoDir, { recursive: true, force: true }).catch(() => {});
  if (nonRepoDir) await rm(nonRepoDir, { recursive: true, force: true }).catch(() => {});
});

describe("validateBaseRef", () => {
  it("accepts valid refs", () => {
    expect(() => validateBaseRef("main")).not.toThrow();
    expect(() => validateBaseRef("origin/main")).not.toThrow();
    expect(() => validateBaseRef("feature/my-branch")).not.toThrow();
    expect(() => validateBaseRef("v1.0.0")).not.toThrow();
    expect(() => validateBaseRef("HEAD")).not.toThrow();
  });

  it("rejects refs starting with -", () => {
    expect(() => validateBaseRef("--evil")).toThrow("Invalid base ref");
  });

  it("rejects refs with ..", () => {
    expect(() => validateBaseRef("../etc/passwd")).toThrow("Invalid base ref");
  });

  it("rejects refs with @{", () => {
    expect(() => validateBaseRef("origin@{0}")).toThrow("Invalid base ref");
  });

  it("rejects refs with special characters", () => {
    expect(() => validateBaseRef("ref with spaces")).toThrow("Invalid base ref");
    expect(() => validateBaseRef("ref;rm -rf")).toThrow("Invalid base ref");
  });
});

describe("getGitRoot", () => {
  it("returns repo root for a valid git directory", () => {
    const root = getGitRoot(repoDir);
    // realpath may differ from mkdtemp on some systems (symlinks in /tmp)
    expect(root).toContain("cmb-git-test-");
  });

  it("works from a nested subdirectory", async () => {
    const subdir = path.join(repoDir, "nested", "deep");
    await mkdir(subdir, { recursive: true });
    const root = getGitRoot(subdir);
    expect(root).toContain("cmb-git-test-");
  });

  it("throws for a non-repo directory", () => {
    expect(() => getGitRoot(nonRepoDir)).toThrow("Not a git repository");
  });

  it("includes cause in error", () => {
    try {
      getGitRoot(nonRepoDir);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as { cause?: unknown }).cause).toBeDefined();
    }
  });
});

describe("getUncommittedDiff", () => {
  it("throws when no uncommitted changes", () => {
    expect(() => getUncommittedDiff(repoDir)).toThrow("No uncommitted changes found");
  });

  it("returns diff for unstaged changes", async () => {
    await writeFile(path.join(repoDir, "initial.txt"), "modified");
    try {
      const diff = getUncommittedDiff(repoDir);
      expect(diff).toContain("modified");
      expect(diff).toContain("diff --git");
    } finally {
      execFileSync("git", ["checkout", "--", "initial.txt"], { cwd: repoDir });
    }
  });

  it("returns diff for staged changes", async () => {
    await writeFile(path.join(repoDir, "staged.txt"), "new file");
    execFileSync("git", ["add", "staged.txt"], { cwd: repoDir });
    try {
      const diff = getUncommittedDiff(repoDir);
      expect(diff).toContain("staged.txt");
    } finally {
      execFileSync("git", ["reset", "HEAD", "staged.txt"], { cwd: repoDir });
      execFileSync("git", ["checkout", "--", "."], { cwd: repoDir });
      await rm(path.join(repoDir, "staged.txt"), { force: true });
    }
  });

  it("preserves cause on git failure", () => {
    try {
      getUncommittedDiff("/nonexistent/path");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      const err = e as Error;
      expect(err.message).toBe("Failed to get git diff");
      expect((err as { cause?: unknown }).cause).toBeDefined();
    }
  });
});

describe("getBranchDiff", () => {
  it("throws when no diff exists", () => {
    // Diff HEAD against itself via current branch
    expect(() => getBranchDiff(repoDir, "HEAD")).toThrow("No diff found");
  });

  it("preserves cause on git failure", () => {
    try {
      getBranchDiff(repoDir, "nonexistent-ref-xyz");
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as { cause?: unknown }).cause).toBeDefined();
    }
  });
});
