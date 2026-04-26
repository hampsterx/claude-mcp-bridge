import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  queryDescription,
  searchDescription,
  structuredDescription,
  listSessionsDescription,
  pingDescription,
} from "../../src/descriptions.js";

const MAX_DESCRIPTION_SIZE = 2048;

const allDescriptions = {
  query: queryDescription,
  search: searchDescription,
  structured: structuredDescription,
  listSessions: listSessionsDescription,
  ping: pingDescription,
} as const;

describe("tool descriptions", () => {
  describe("size limits", () => {
    for (const [name, desc] of Object.entries(allDescriptions)) {
      it(`${name} description is under ${MAX_DESCRIPTION_SIZE} bytes`, () => {
        const size = Buffer.byteLength(desc, "utf8");
        expect(size).toBeLessThanOrEqual(MAX_DESCRIPTION_SIZE);
      });
    }
  });

  describe("non-empty", () => {
    for (const [name, desc] of Object.entries(allDescriptions)) {
      it(`${name} description is a non-empty string`, () => {
        expect(typeof desc).toBe("string");
        expect(desc.trim().length).toBeGreaterThan(0);
      });
    }
  });

  describe("query description content", () => {
    it("mentions capabilities", () => {
      expect(queryDescription).toContain("code generation");
      expect(queryDescription).toContain("refactor");
    });

    it("includes cost guidance", () => {
      expect(queryDescription).toContain("Sonnet");
      expect(queryDescription).toContain("maxBudgetUsd");
    });

    it("mentions session resume", () => {
      expect(queryDescription).toContain("sessionId");
    });

    it("mentions file support", () => {
      expect(queryDescription).toContain("files");
      expect(queryDescription).toContain("image");
    });

    it("mentions effort levels", () => {
      expect(queryDescription).toContain("effort");
    });
  });

  describe("search description content", () => {
    it("describes web search capability", () => {
      expect(searchDescription).toContain("WebSearch");
      expect(searchDescription).toContain("WebFetch");
    });

    it("mentions source URLs", () => {
      expect(searchDescription).toContain("source URL");
    });

    it("includes cost guidance", () => {
      expect(searchDescription).toMatch(/\$\d+(?:\.\d+)?/);
    });
  });

  describe("structured description content", () => {
    it("mentions JSON Schema", () => {
      expect(structuredDescription).toContain("JSON Schema");
    });

    it("clarifies native validation", () => {
      expect(structuredDescription).toContain("--json-schema");
    });

    it("mentions schema size limit", () => {
      expect(structuredDescription).toContain("20KB");
    });

    it("includes cost guidance", () => {
      expect(structuredDescription).toMatch(/\$\d+(?:\.\d+)?/);
    });
  });

  describe("listSessions description content", () => {
    it("mentions orchestration use case", () => {
      expect(listSessionsDescription).toContain("orchestration");
    });

    it("mentions session resume", () => {
      expect(listSessionsDescription).toContain("sessionId");
    });

    it("indicates no cost", () => {
      expect(listSessionsDescription).toContain("No cost");
    });

    it("mentions cumulative cost tracking", () => {
      expect(listSessionsDescription).toContain("cumulative cost");
    });
  });

  describe("ping description content", () => {
    it("is concise (under 200 bytes)", () => {
      expect(Buffer.byteLength(pingDescription, "utf8")).toBeLessThan(200);
    });

    it("mentions health check purpose", () => {
      expect(pingDescription).toContain("Health check");
    });

    it("indicates no cost", () => {
      expect(pingDescription).toContain("No cost");
    });
  });

  describe("wiring: index.ts uses imported descriptions", () => {
    const indexSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../src/index.ts"),
      "utf8",
    );

    for (const name of ["query", "search", "structured", "listSessions", "ping"]) {
      it(`${name} tool uses ${name}Description from descriptions.ts`, () => {
        expect(indexSource).toContain(`description: ${name}Description`);
      });
    }

    it("imports all descriptions from descriptions.ts", () => {
      expect(indexSource).toMatch(/from ["']\.\/descriptions\.js["']/);
    });
  });
});
