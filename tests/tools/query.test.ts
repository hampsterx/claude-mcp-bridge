import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

vi.mock("../../src/utils/spawn.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/spawn.js")>();
  return { ...actual, spawnClaude: vi.fn() };
});

import { executeQuery } from "../../src/tools/query.js";
import { spawnClaude } from "../../src/utils/spawn.js";

const mockSpawn = vi.mocked(spawnClaude);

function jsonResponse(text: string) {
  return {
    stdout: JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      result: text,
      session_id: "session-123",
      total_cost_usd: 0.01,
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
    stderr: "",
    exitCode: 0,
    timedOut: false,
  };
}

describe("executeQuery", () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "cmb-query-test-"));
  });

  it("text-only query uses Claude print mode", async () => {
    mockSpawn.mockResolvedValue(jsonResponse("Hello!"));

    const result = await executeQuery({
      prompt: "Say hello",
      workingDirectory: tmpDir,
    });

    expect(result.response).toBe("Hello!");
    expect(result.sessionId).toBe("session-123");
    expect(result.totalCostUsd).toBe(0.01);
    expect(result.imagesIncluded).toEqual([]);
    expect(result.timedOut).toBe(false);

    const args = mockSpawn.mock.calls[0][0].args;
    expect(args).toContain("-p");
    expect(args).toContain("--bare");
    expect(args).toContain("--disable-slash-commands");
    expect(args).not.toContain("--allowed-tools");
  });

  it("text files are inlined in stdin", async () => {
    await writeFile(path.join(tmpDir, "notes.txt"), "some notes");
    mockSpawn.mockResolvedValue(jsonResponse("Got it"));

    const result = await executeQuery({
      prompt: "Read this",
      files: ["notes.txt"],
      workingDirectory: tmpDir,
    });

    expect(result.filesIncluded).toEqual(["notes.txt"]);
    expect(result.imagesIncluded).toEqual([]);
    expect(mockSpawn.mock.calls[0][0].stdin).toContain("some notes");
  });

  it("image files allow Read tool", async () => {
    await writeFile(path.join(tmpDir, "photo.png"), "fake png data");
    mockSpawn.mockResolvedValue(jsonResponse("I see a photo"));

    const result = await executeQuery({
      prompt: "Describe this",
      files: ["photo.png"],
      workingDirectory: tmpDir,
    });

    expect(result.imagesIncluded).toEqual(["photo.png"]);
    const call = mockSpawn.mock.calls[0][0];
    expect(call.args).toContain("--allowed-tools");
    expect(call.args).toContain("Read");
    expect(call.stdin).toContain("Read and analyze the image at:");
  });

  it("uses 120s default timeout for image queries", async () => {
    await writeFile(path.join(tmpDir, "img.png"), "data");
    mockSpawn.mockResolvedValue(jsonResponse("ok"));

    await executeQuery({
      prompt: "Analyze",
      files: ["img.png"],
      workingDirectory: tmpDir,
    });

    expect(mockSpawn.mock.calls[0][0].timeout).toBe(120_000);
  });

  it("skips oversized image files", async () => {
    const bigImage = Buffer.alloc(5_100_000, 0);
    await writeFile(path.join(tmpDir, "huge.png"), bigImage);
    mockSpawn.mockResolvedValue(jsonResponse("no images to read"));

    const result = await executeQuery({
      prompt: "Analyze",
      files: ["huge.png"],
      workingDirectory: tmpDir,
    });

    expect(result.imagesIncluded).toEqual([]);
    expect(result.filesSkipped[0]).toContain("exceeds");
  });

  it("returns partial timeout text", async () => {
    mockSpawn.mockResolvedValue({
      stdout: "partial response",
      stderr: "",
      exitCode: null,
      timedOut: true,
    });

    const result = await executeQuery({
      prompt: "Describe",
      workingDirectory: tmpDir,
    });

    expect(result.timedOut).toBe(true);
    expect(result.response).toContain("partial response");
  });

  it("appends length limit when requested", async () => {
    mockSpawn.mockResolvedValue(jsonResponse("Short answer"));

    await executeQuery({
      prompt: "Explain this",
      maxResponseLength: 300,
      workingDirectory: tmpDir,
    });

    const call = mockSpawn.mock.calls[0][0];
    const content = call.stdin ?? call.args.join(" ");
    expect(content).toContain("Keep your response under 300 words");
  });

  it("rejects more than 20 files", async () => {
    const files = Array.from({ length: 21 }, (_, i) => `file${i}.txt`);
    await expect(
      executeQuery({ prompt: "test", files, workingDirectory: tmpDir }),
    ).rejects.toThrow("Too many files");
  });

  it("surfaces auth errors from Claude JSON output", async () => {
    mockSpawn.mockResolvedValue({
      stdout: JSON.stringify({
        type: "result",
        is_error: true,
        result: "Invalid API key provided",
      }),
      stderr: "",
      exitCode: 1,
      timedOut: false,
    });

    await expect(
      executeQuery({
        prompt: "Describe",
        workingDirectory: tmpDir,
      }),
    ).rejects.toThrow("authentication error");
  });
});
