import { describe, it, expect } from "vitest";
import {
  queryAnnotations,
  reviewAnnotations,
  searchAnnotations,
  structuredAnnotations,
  pingAnnotations,
} from "../../src/annotations.js";

describe("tool annotations", () => {
  const allAnnotations = {
    query: queryAnnotations,
    review: reviewAnnotations,
    search: searchAnnotations,
    structured: structuredAnnotations,
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

  it("review: not read-only (session persistence), not destructive, not idempotent, open world", () => {
    expect(reviewAnnotations).toEqual({
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

  it("ping: read-only (no session), not destructive, idempotent, closed world (local check only)", () => {
    expect(pingAnnotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  it("all tools are non-destructive; only ping is read-only", () => {
    for (const [name, ann] of Object.entries(allAnnotations)) {
      expect(ann.destructiveHint, `${name} should not be destructive`).toBe(false);
    }
    expect(pingAnnotations.readOnlyHint).toBe(true);
    for (const name of ["query", "review", "search", "structured"] as const) {
      expect(allAnnotations[name].readOnlyHint, `${name} should not be read-only (session persistence)`).toBe(false);
    }
  });

  it("family consistency: ping matches codex-mcp-bridge values", () => {
    expect(pingAnnotations.readOnlyHint).toBe(true);
    expect(pingAnnotations.openWorldHint).toBe(false);
    expect(searchAnnotations.idempotentHint).toBe(true);
  });
});
