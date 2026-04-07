import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpawnOptions, SpawnResult } from "../../src/utils/spawn.js";

const {
  spawnClaudeMock,
  verifyDirectoryMock,
  getGitRootMock,
  getUncommittedDiffMock,
  getBranchDiffMock,
} = vi.hoisted(() => ({
  spawnClaudeMock: vi.fn<(options: SpawnOptions) => Promise<SpawnResult>>(),
  verifyDirectoryMock: vi.fn<(dir: string) => Promise<string>>(),
  getGitRootMock: vi.fn<(cwd: string) => string>(),
  getUncommittedDiffMock: vi.fn<(cwd: string, contextLines?: number) => string>(),
  getBranchDiffMock: vi.fn<(cwd: string, base: string, contextLines?: number) => string>(),
}));

vi.mock("../../src/utils/spawn.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/spawn.js")>();
  return { ...actual, spawnClaude: spawnClaudeMock };
});

vi.mock("../../src/utils/security.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/utils/security.js")>("../../src/utils/security.js");
  return {
    ...actual,
    verifyDirectory: verifyDirectoryMock,
  };
});

vi.mock("../../src/utils/git.js", () => ({
  getGitRoot: getGitRootMock,
  getUncommittedDiff: getUncommittedDiffMock,
  getBranchDiff: getBranchDiffMock,
}));

import { executeReview } from "../../src/tools/review.js";

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

describe("executeReview", () => {
  beforeEach(() => {
    spawnClaudeMock.mockReset();
    verifyDirectoryMock.mockReset();
    getGitRootMock.mockReset();
    getUncommittedDiffMock.mockReset();
    getBranchDiffMock.mockReset();

    verifyDirectoryMock.mockResolvedValue("/repo/requested");
    getGitRootMock.mockReturnValue("/repo/root");
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
});
