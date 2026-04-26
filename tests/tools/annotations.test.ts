import { describe, it, expect } from "vitest";
import {
  queryAnnotations,
  searchAnnotations,
  structuredAnnotations,
  listSessionsAnnotations,
  pingAnnotations,
} from "../../src/annotations.js";

describe("tool annotations", () => {
  const allAnnotations = {
    query: queryAnnotations,
    search: searchAnnotations,
    structured: structuredAnnotations,
    listSessions: listSessionsAnnotations,
    ping: pingAnnotations,
  };

  it("query: not read-only (session persistence), not destructive, not idempotent, open world", () => {
    expect(queryAnnotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
  });

  it("search: not read-only (session persistence), not destructive, idempotent, open world", () => {
    expect(searchAnnotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
  });

  it("structured: not read-only (session persistence), not destructive, not idempotent (LLM output varies), open world", () => {
    expect(structuredAnnotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
  });

  it("listSessions: read-only (local lookup), not destructive, idempotent, closed world", () => {
    expect(listSessionsAnnotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  it("ping: read-only (no session), not destructive, idempotent, closed world (local check only)", () => {
    expect(pingAnnotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  it("all tools are non-destructive; only ping and listSessions are read-only", () => {
    for (const [name, ann] of Object.entries(allAnnotations)) {
      expect(ann.destructiveHint, `${name} should not be destructive`).toBe(false);
    }
    expect(pingAnnotations.readOnlyHint).toBe(true);
    expect(listSessionsAnnotations.readOnlyHint).toBe(true);
    for (const name of ["query", "search", "structured"] as const) {
      expect(allAnnotations[name].readOnlyHint, `${name} should not be read-only (session persistence)`).toBe(false);
    }
  });

  it("family consistency: ping and listSessions match codex-mcp-bridge values", () => {
    expect(pingAnnotations.readOnlyHint).toBe(true);
    expect(pingAnnotations.openWorldHint).toBe(false);
    expect(listSessionsAnnotations.readOnlyHint).toBe(true);
    expect(listSessionsAnnotations.openWorldHint).toBe(false);
    expect(searchAnnotations.idempotentHint).toBe(true);
  });
});
