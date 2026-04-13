import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpawnOptions, SpawnResult } from "../../src/utils/spawn.js";

const { spawnClaudeMock, verifyDirectoryMock, readFilesMock } = vi.hoisted(() => ({
  spawnClaudeMock: vi.fn<(options: SpawnOptions) => Promise<SpawnResult>>(),
  verifyDirectoryMock: vi.fn<(dir: string) => Promise<string>>(),
  readFilesMock: vi.fn<(files: string[], rootDir: string) => Promise<Array<{ path: string; content: string; skipped?: string }>>>(),
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

vi.mock("../../src/utils/files.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/utils/files.js")>("../../src/utils/files.js");
  return {
    ...actual,
    readFiles: readFilesMock,
  };
});

import { executeStructured } from "../../src/tools/structured.js";

describe("executeStructured", () => {
  beforeEach(() => {
    spawnClaudeMock.mockReset();
    verifyDirectoryMock.mockReset();
    readFilesMock.mockReset();
    verifyDirectoryMock.mockResolvedValue("/repo");
    readFilesMock.mockResolvedValue([]);
  });

  it("uses native --json-schema and returns JSON output", async () => {
    spawnClaudeMock.mockResolvedValue({
      stdout: JSON.stringify({
        type: "result",
        is_error: false,
        result: '{"answer":"ok"}',
        session_id: "session-123",
        total_cost_usd: 0.02,
        usage: { input_tokens: 5, output_tokens: 4 },
      }),
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });

    const result = await executeStructured({
      prompt: "Extract answer",
      schema: JSON.stringify({
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"],
      }),
      model: "sonnet",
      workingDirectory: "/repo",
    });

    const call = spawnClaudeMock.mock.calls[0]![0];
    expect(call.cwd).toBe("/repo");
    expect(call.args).toContain("--json-schema");
    expect(call.args).toContain("--model");
    expect(call.args).toContain("sonnet");
    expect(result.valid).toBe(true);
    expect(JSON.parse(result.response) as { answer: string }).toEqual({ answer: "ok" });
    expect(result.sessionId).toBe("session-123");
  });

  it("reports invalid non-JSON output", async () => {
    spawnClaudeMock.mockResolvedValue({
      stdout: JSON.stringify({
        type: "result",
        is_error: false,
        result: "not json",
      }),
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });

    const result = await executeStructured({
      prompt: "Extract answer",
      schema: JSON.stringify({
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"],
      }),
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Could not extract JSON");
  });

  it("extracts structured_output field from CLI response", async () => {
    spawnClaudeMock.mockResolvedValue({
      stdout: JSON.stringify({
        type: "result",
        is_error: false,
        result: "",
        structured_output: { answer: "pong" },
        session_id: "s-1",
        total_cost_usd: 0.01,
        usage: { input_tokens: 5, output_tokens: 3 },
      }),
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });

    const result = await executeStructured({
      prompt: "Return pong",
      schema: JSON.stringify({
        type: "object",
        properties: { answer: { type: "string" } },
        required: ["answer"],
      }),
    });

    expect(result.valid).toBe(true);
    expect(result.response).toBe('{"answer":"pong"}');
  });

  it("handles scalar structured_output values", async () => {
    for (const scalar of [false, 0, "", null]) {
      spawnClaudeMock.mockResolvedValue({
        stdout: JSON.stringify({
          type: "result",
          is_error: false,
          result: "",
          structured_output: scalar,
          session_id: "s-2",
          total_cost_usd: 0.01,
        }),
        stderr: "",
        exitCode: 0,
        timedOut: false,
      });

      const result = await executeStructured({
        prompt: "Return scalar",
        schema: JSON.stringify({}),
      });

      expect(result.valid).toBe(true);
      expect(result.response).toBe(JSON.stringify(scalar));
    }
  });

  it("rejects image files before spawning Claude", async () => {
    await expect(executeStructured({
      prompt: "Extract answer",
      schema: JSON.stringify({ type: "object" }),
      files: ["diagram.png"],
    })).rejects.toThrow("does not support image files");

    expect(spawnClaudeMock).not.toHaveBeenCalled();
  });
});
