import { beforeEach, describe, expect, it, vi } from "vitest";

const { findClaudeBinaryMock, execFileSyncMock } = vi.hoisted(() => ({
  findClaudeBinaryMock: vi.fn<() => string>(),
  execFileSyncMock: vi.fn(),
}));

vi.mock("../../src/utils/spawn.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/spawn.js")>();
  return {
    ...actual,
    findClaudeBinary: findClaudeBinaryMock,
    getActiveCount: () => 1,
    getQueueDepth: () => 2,
    getMaxConcurrent: () => 5,
  };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execFileSync: execFileSyncMock };
});

import { executePing } from "../../src/tools/ping.js";

describe("executePing", () => {
  beforeEach(() => {
    findClaudeBinaryMock.mockReset();
    execFileSyncMock.mockReset();
    findClaudeBinaryMock.mockReturnValue("claude");
  });

  it("includes activeCount and queueDepth from spawn state", async () => {
    execFileSyncMock.mockReturnValue("1.0.0\n");

    const result = await executePing();

    expect(result.activeCount).toBe(1);
    expect(result.queueDepth).toBe(2);
    expect(typeof result.activeCount).toBe("number");
    expect(typeof result.queueDepth).toBe("number");
  });

  it("uses spawn.ts getMaxConcurrent instead of parsing env", async () => {
    execFileSyncMock.mockReturnValue("1.0.0\n");

    const result = await executePing();

    expect(result.maxConcurrent).toBe(5);
  });

  it("returns diagnostics when CLI not found", async () => {
    const err = new Error("ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    execFileSyncMock.mockImplementation(() => { throw err; });

    const result = await executePing();

    expect(result.cliFound).toBe(false);
    expect(result.activeCount).toBe(1);
    expect(result.queueDepth).toBe(2);
    expect(result.maxConcurrent).toBe(5);
  });

  it("returns diagnostics on non-ENOENT error", async () => {
    const err = new Error("permission denied") as NodeJS.ErrnoException;
    err.code = "EACCES";
    execFileSyncMock.mockImplementation(() => { throw err; });

    const result = await executePing();

    expect(result.cliFound).toBe(true);
    expect(result.version).toBeNull();
    expect(result.activeCount).toBe(1);
    expect(result.queueDepth).toBe(2);
  });
});
