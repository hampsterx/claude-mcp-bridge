import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpawnOptions, SpawnResult } from "../../src/utils/spawn.js";

const { spawnClaudeMock, verifyDirectoryMock } = vi.hoisted(() => ({
  spawnClaudeMock: vi.fn<(options: SpawnOptions) => Promise<SpawnResult>>(),
  verifyDirectoryMock: vi.fn<(dir: string) => Promise<string>>(),
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

import { executeSearch } from "../../src/tools/search.js";

describe("executeSearch", () => {
  beforeEach(() => {
    spawnClaudeMock.mockReset();
    verifyDirectoryMock.mockReset();
    verifyDirectoryMock.mockResolvedValue("/repo");
  });

  it("uses WebSearch and WebFetch with stdin prompt", async () => {
    spawnClaudeMock.mockResolvedValue({
      stdout: JSON.stringify({
        type: "result",
        is_error: false,
        result: "search response",
        session_id: "session-123",
        total_cost_usd: 0.03,
      }),
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });

    const result = await executeSearch({
      query: "latest release notes",
      model: "sonnet",
      workingDirectory: "/repo",
    });

    const call = spawnClaudeMock.mock.calls[0]![0];
    expect(call.cwd).toBe("/repo");
    expect(call.args).toContain("--allowed-tools");
    expect(call.args).toContain("WebSearch WebFetch");
    expect(call.args).toContain("--model");
    expect(call.args).toContain("sonnet");
    expect(call.stdin).toContain("latest release notes");
    expect(result.response).toBe("search response");
    expect(result.model).toBe("sonnet");
  });

  it("returns timeout partial response", async () => {
    spawnClaudeMock.mockResolvedValue({
      stdout: "partial",
      stderr: "",
      exitCode: null,
      timedOut: true,
    });

    const result = await executeSearch({ query: "slow query", timeout: 1234 });

    expect(result.timedOut).toBe(true);
    expect(result.response).toContain("partial");
  });
});
