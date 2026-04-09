import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SessionStore,
  isValidSessionId,
  persist,
  sessionStore,
} from "../../src/utils/session.js";

describe("isValidSessionId", () => {
  it("accepts alphanumeric with hyphens and underscores", () => {
    expect(isValidSessionId("session-123")).toBe(true);
    expect(isValidSessionId("session_abc_456")).toBe(true);
    expect(isValidSessionId("abc")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidSessionId("")).toBe(false);
  });

  it("rejects strings with special characters", () => {
    expect(isValidSessionId("session/../hack")).toBe(false);
    expect(isValidSessionId("a b")).toBe(false);
    expect(isValidSessionId("session!")).toBe(false);
  });

  it("rejects strings exceeding max length", () => {
    expect(isValidSessionId("a".repeat(257))).toBe(false);
    expect(isValidSessionId("a".repeat(256))).toBe(true);
  });
});

describe("SessionStore", () => {
  it("stores and retrieves sessions", () => {
    const store = new SessionStore();
    const now = Date.now();
    store.set("s1", {
      sessionId: "s1",
      model: "sonnet",
      createdAt: now,
      lastUsedAt: now,
      turnCount: 1,
      totalCostUsd: 0.05,
    });
    const entry = store.get("s1");
    expect(entry).toBeDefined();
    expect(entry!.sessionId).toBe("s1");
    expect(entry!.model).toBe("sonnet");
    expect(entry!.totalCostUsd).toBe(0.05);
  });

  it("returns undefined for missing sessions", () => {
    const store = new SessionStore();
    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("deletes sessions", () => {
    const store = new SessionStore();
    const now = Date.now();
    store.set("s1", {
      sessionId: "s1",
      createdAt: now,
      lastUsedAt: now,
      turnCount: 1,
      totalCostUsd: 0,
    });
    store.delete("s1");
    expect(store.get("s1")).toBeUndefined();
  });

  it("lists sessions sorted by lastUsedAt descending", () => {
    const store = new SessionStore();
    const now = Date.now();
    store.set("old", {
      sessionId: "old",
      createdAt: now - 2000,
      lastUsedAt: now - 2000,
      turnCount: 1,
      totalCostUsd: 0.01,
    });
    store.set("new", {
      sessionId: "new",
      createdAt: now - 1000,
      lastUsedAt: now,
      turnCount: 3,
      totalCostUsd: 0.10,
    });
    const sessions = store.list();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].sessionId).toBe("new");
    expect(sessions[1].sessionId).toBe("old");
  });

  it("returns empty list when no sessions exist", () => {
    const store = new SessionStore();
    expect(store.list()).toEqual([]);
  });

  it("evicts expired sessions on list", () => {
    const store = new SessionStore(100); // 100ms TTL
    store.set("s1", {
      sessionId: "s1",
      createdAt: Date.now(),
      lastUsedAt: Date.now() - 200, // already expired
      turnCount: 1,
      totalCostUsd: 0,
    });
    expect(store.list()).toEqual([]);
  });

  it("evicts expired sessions on get", () => {
    const store = new SessionStore(100);
    store.set("s1", {
      sessionId: "s1",
      createdAt: Date.now(),
      lastUsedAt: Date.now() - 200,
      turnCount: 1,
      totalCostUsd: 0,
    });
    expect(store.get("s1")).toBeUndefined();
  });

  it("evicts oldest session when at max capacity", () => {
    const now = Date.now();
    const store = new SessionStore(undefined, 2); // max 2
    store.set("s1", {
      sessionId: "s1",
      createdAt: now,
      lastUsedAt: now - 2000,
      turnCount: 1,
      totalCostUsd: 0,
    });
    store.set("s2", {
      sessionId: "s2",
      createdAt: now,
      lastUsedAt: now - 1000,
      turnCount: 1,
      totalCostUsd: 0,
    });
    store.set("s3", {
      sessionId: "s3",
      createdAt: now,
      lastUsedAt: now,
      turnCount: 1,
      totalCostUsd: 0,
    });
    const sessions = store.list();
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.sessionId)).toEqual(["s3", "s2"]);
  });

  it("does not evict when updating existing entry at capacity", () => {
    const now = Date.now();
    const store = new SessionStore(undefined, 2);
    store.set("s1", {
      sessionId: "s1",
      createdAt: now,
      lastUsedAt: now,
      turnCount: 1,
      totalCostUsd: 0,
    });
    store.set("s2", {
      sessionId: "s2",
      createdAt: now,
      lastUsedAt: now,
      turnCount: 1,
      totalCostUsd: 0,
    });
    // Update existing s1 (should not evict anything)
    store.set("s1", {
      sessionId: "s1",
      createdAt: now,
      lastUsedAt: now,
      turnCount: 2,
      totalCostUsd: 0.05,
    });
    expect(store.list()).toHaveLength(2);
  });
});

describe("persist", () => {
  it("creates a new session entry", () => {
    const store = new SessionStore();
    persist(store, "new-session", { model: "sonnet", totalCostUsd: 0.03 });
    const entry = store.get("new-session");
    expect(entry).toBeDefined();
    expect(entry!.sessionId).toBe("new-session");
    expect(entry!.model).toBe("sonnet");
    expect(entry!.turnCount).toBe(1);
    expect(entry!.totalCostUsd).toBe(0.03);
  });

  it("accumulates cost across calls", () => {
    const store = new SessionStore();
    persist(store, "s1", { model: "sonnet", totalCostUsd: 0.03 });
    persist(store, "s1", { model: "sonnet", totalCostUsd: 0.05 });
    persist(store, "s1", { model: "sonnet", totalCostUsd: 0.02 });
    const entry = store.get("s1");
    expect(entry!.totalCostUsd).toBeCloseTo(0.10);
    expect(entry!.turnCount).toBe(3);
  });

  it("preserves createdAt on resume", () => {
    const store = new SessionStore();
    const beforeCreate = Date.now();
    persist(store, "s1", { model: "sonnet", totalCostUsd: 0.01 });
    const createdAt = store.get("s1")!.createdAt;
    expect(createdAt).toBeGreaterThanOrEqual(beforeCreate);

    // Second persist should keep original createdAt
    persist(store, "s1", { model: "sonnet", totalCostUsd: 0.01 });
    expect(store.get("s1")!.createdAt).toBe(createdAt);
  });

  it("updates model if changed", () => {
    const store = new SessionStore();
    persist(store, "s1", { model: "sonnet", totalCostUsd: 0.01 });
    persist(store, "s1", { model: "opus", totalCostUsd: 0.10 });
    expect(store.get("s1")!.model).toBe("opus");
  });

  it("keeps existing model if result has none", () => {
    const store = new SessionStore();
    persist(store, "s1", { model: "sonnet", totalCostUsd: 0.01 });
    persist(store, "s1", { totalCostUsd: 0.02 });
    expect(store.get("s1")!.model).toBe("sonnet");
  });

  it("handles undefined totalCostUsd gracefully", () => {
    const store = new SessionStore();
    persist(store, "s1", { model: "sonnet" });
    expect(store.get("s1")!.totalCostUsd).toBe(0);
    persist(store, "s1", { model: "sonnet", totalCostUsd: 0.05 });
    expect(store.get("s1")!.totalCostUsd).toBe(0.05);
  });

  it("skips invalid session IDs", () => {
    const store = new SessionStore();
    persist(store, "", { model: "sonnet", totalCostUsd: 0.01 });
    persist(store, "bad/../path", { model: "sonnet", totalCostUsd: 0.01 });
    expect(store.list()).toEqual([]);
  });

  it("never throws even if store internals fail", () => {
    const store = new SessionStore();
    // Force an error by making set throw
    vi.spyOn(store, "set").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => persist(store, "s1", { model: "sonnet" })).not.toThrow();
    vi.restoreAllMocks();
  });
});

describe("global sessionStore", () => {
  afterEach(() => {
    for (const entry of sessionStore.list()) {
      sessionStore.delete(entry.sessionId);
    }
  });

  it("is a SessionStore instance", () => {
    expect(sessionStore).toBeInstanceOf(SessionStore);
  });
});
