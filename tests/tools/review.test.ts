import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpawnOptions, SpawnResult } from "../../src/utils/spawn.js";

const {
  spawnClaudeMock,
  resolveCwdMock,
  getGitRootMock,
  getUncommittedDiffMock,
  getBranchDiffMock,
  getDiffStatMock,
} = vi.hoisted(() => ({
  spawnClaudeMock: vi.fn<(options: SpawnOptions) => Promise<SpawnResult>>(),
  resolveCwdMock: vi.fn<(dir?: string) => Promise<string>>(),
  getGitRootMock: vi.fn<(cwd: string) => string>(),
  getUncommittedDiffMock: vi.fn<(cwd: string, contextLines?: number) => string>(),
  getBranchDiffMock: vi.fn<(cwd: string, base: string, contextLines?: number) => string>(),
  getDiffStatMock: vi.fn(),
}));

vi.mock("../../src/utils/spawn.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/spawn.js")>();
  return { ...actual, spawnClaude: spawnClaudeMock };
});

vi.mock("../../src/utils/security.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/utils/security.js")>("../../src/utils/security.js");
  return {
    ...actual,
    resolveCwd: resolveCwdMock,
  };
});

vi.mock("../../src/utils/git.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/git.js")>();
  return {
    ...actual,
    getGitRoot: getGitRootMock,
    getUncommittedDiff: getUncommittedDiffMock,
    getBranchDiff: getBranchDiffMock,
    getDiffStat: getDiffStatMock,
  };
});

import { executeReview, scaleAgenticTimeout } from "../../src/tools/review.js";

function jsonResponse(text: string) {
  return {
    stdout: JSON.stringify({
      type: "result",
      is_error: false,
      result: text,
      session_id: "session-123",
      total_cost_usd: 0.04,
      usage: { input_tokens: 10, output_tokens: 12 },
    }),
    stderr: "",
    exitCode: 0,
    timedOut: false,
  };
}

describe("scaleAgenticTimeout", () => {
  it("returns base timeout for zero files", () => {
    expect(scaleAgenticTimeout({ files: 0, insertions: 0, deletions: 0 })).toBe(180_000);
  });

  it("scales linearly with file count", () => {
    expect(scaleAgenticTimeout({ files: 1, insertions: 10, deletions: 5 })).toBe(210_000);
    expect(scaleAgenticTimeout({ files: 5, insertions: 50, deletions: 20 })).toBe(330_000);
  });

  it("caps at HARD_TIMEOUT_CAP (600s)", () => {
    expect(scaleAgenticTimeout({ files: 100, insertions: 1000, deletions: 500 })).toBe(600_000);
  });
});

describe("executeReview", () => {
  beforeEach(() => {
    spawnClaudeMock.mockReset();
    resolveCwdMock.mockReset();
    getGitRootMock.mockReset();
    getUncommittedDiffMock.mockReset();
    getBranchDiffMock.mockReset();

    resolveCwdMock.mockResolvedValue("/repo/requested");
    getGitRootMock.mockReturnValue("/repo/root");
    getDiffStatMock.mockReturnValue({ files: 3, insertions: 50, deletions: 10 });
  });

  it("uses allowed-tools agentic review and returns parsed response", async () => {
    getUncommittedDiffMock.mockReturnValue("diff --git a/x b/x");
    spawnClaudeMock.mockResolvedValue(jsonResponse("review findings"));

    const result = await executeReview({
      quick: false,
      uncommitted: true,
      model: "opus",
      workingDirectory: "/repo/requested",
    });

    expect(getGitRootMock).toHaveBeenCalledWith("/repo/requested");
    const call = spawnClaudeMock.mock.calls[0]![0];
    expect(call.cwd).toBe("/repo/root");
    expect(call.args).toContain("--allowed-tools");
    const allowedTools = call.args[call.args.indexOf("--allowed-tools") + 1];
    expect(allowedTools).toContain("Read");
    expect(allowedTools).toContain("Bash(git diff:*)");
    expect(allowedTools).toContain("Bash(git status:*)");
    expect(call.stdin).toContain("git diff HEAD -U5");
    expect(result.mode).toBe("agentic");
    expect(result.diffSource).toBe("uncommitted");
    expect(result.response).toBe("review findings");
    expect(result.sessionId).toBe("session-123");
  });

  it("returns early when quick review has no uncommitted changes", async () => {
    getUncommittedDiffMock.mockImplementation(() => {
      throw new Error("No uncommitted changes found");
    });

    const result = await executeReview({
      quick: true,
      uncommitted: true,
    });

    expect(spawnClaudeMock).not.toHaveBeenCalled();
    expect(result.mode).toBe("quick");
    expect(result.response).toBe("No uncommitted changes found");
  });

  it("uses plain print mode for quick branch review", async () => {
    getBranchDiffMock.mockReturnValue("diff --git a/y b/y");
    spawnClaudeMock.mockResolvedValue(jsonResponse("quick review"));

    const result = await executeReview({
      quick: true,
      base: "main",
      model: "opus",
    });

    const call = spawnClaudeMock.mock.calls[0]![0];
    expect(call.args).toContain("-p");
    expect(call.args).not.toContain("--allowed-tools");
    expect(call.stdin).toContain("diff --git a/y b/y");
    expect(result.mode).toBe("quick");
    expect(result.diffSource).toBe("branch");
    expect(result.base).toBe("main");
  });

  it("auto-scales agentic timeout from diff stat", async () => {
    getDiffStatMock.mockReturnValue({ files: 5, insertions: 100, deletions: 20 });
    getUncommittedDiffMock.mockReturnValue("diff --git a/x b/x");
    spawnClaudeMock.mockResolvedValue(jsonResponse("review"));

    const result = await executeReview({ uncommitted: true });

    // 180_000 base + 30_000 * 5 files = 330_000
    const call = spawnClaudeMock.mock.calls[0]![0];
    expect(call.timeout).toBe(330_000);
    expect(result.timeoutScaled).toBe(true);
  });

  it("explicit timeout overrides scaling", async () => {
    getDiffStatMock.mockReturnValue({ files: 5, insertions: 100, deletions: 20 });
    getUncommittedDiffMock.mockReturnValue("diff --git a/x b/x");
    spawnClaudeMock.mockResolvedValue(jsonResponse("review"));

    const result = await executeReview({ uncommitted: true, timeout: 200_000 });

    const call = spawnClaudeMock.mock.calls[0]![0];
    expect(call.timeout).toBe(200_000);
    expect(result.timeoutScaled).toBe(false);
  });

  it("falls back to static default when numstat fails", async () => {
    getDiffStatMock.mockImplementation(() => { throw new Error("git error"); });
    getUncommittedDiffMock.mockReturnValue("diff --git a/x b/x");
    spawnClaudeMock.mockResolvedValue(jsonResponse("review"));

    const result = await executeReview({ uncommitted: true });

    const call = spawnClaudeMock.mock.calls[0]![0];
    expect(call.timeout).toBe(300_000);
    expect(result.timeoutScaled).toBe(false);
  });

  it("quick mode timeout is unaffected by scaling", async () => {
    getDiffStatMock.mockReturnValue({ files: 20, insertions: 500, deletions: 200 });
    getUncommittedDiffMock.mockReturnValue("diff --git a/x b/x");
    spawnClaudeMock.mockResolvedValue(jsonResponse("quick review"));

    const result = await executeReview({ quick: true, uncommitted: true });

    const call = spawnClaudeMock.mock.calls[0]![0];
    expect(call.timeout).toBe(120_000);
    expect(result.timeoutScaled).toBe(false);
  });
});
