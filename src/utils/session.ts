/**
 * In-memory session storage for Claude CLI conversations.
 *
 * Tracks session IDs, models, timing, turn counts, and cumulative cost.
 * Claude CLI returns session_id directly (no indirection like codex's conversationId),
 * and total_cost_usd per call enables cumulative cost tracking.
 */

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const MAX_SESSION_ID_LENGTH = 256;
const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_MAX_SESSIONS = 100;

/** Validate a session ID format. */
export function isValidSessionId(id: string): boolean {
  return id.length > 0 && id.length <= MAX_SESSION_ID_LENGTH && SESSION_ID_PATTERN.test(id);
}

export interface SessionEntry {
  sessionId: string;
  model?: string;
  createdAt: number;
  lastUsedAt: number;
  turnCount: number;
  totalCostUsd: number;
}

export interface SessionStorage {
  get(id: string): SessionEntry | undefined;
  set(id: string, entry: SessionEntry): void;
  delete(id: string): void;
  list(): SessionEntry[];
}

/**
 * In-memory session storage with TTL and LRU eviction.
 *
 * - TTL checked lazily on get/list (expired entries cleaned up on access)
 * - LRU eviction when at capacity (oldest by lastUsedAt)
 */
export class SessionStore implements SessionStorage {
  private store = new Map<string, SessionEntry>();
  private ttl: number;
  private maxSessions: number;

  constructor(ttl = DEFAULT_TTL, maxSessions = DEFAULT_MAX_SESSIONS) {
    this.ttl = ttl;
    this.maxSessions = maxSessions;
  }

  /** Get an active session by ID. Returns a defensive copy when found. */
  get(id: string): SessionEntry | undefined {
    this.evictExpired();
    const entry = this.store.get(id);
    return entry ? { ...entry } : undefined;
  }

  set(id: string, entry: SessionEntry): void {
    this.evictExpired();
    if (this.store.size >= this.maxSessions && !this.store.has(id)) {
      let oldestKey: string | undefined;
      let oldestTime = Infinity;
      for (const [key, val] of this.store) {
        if (val.lastUsedAt < oldestTime) {
          oldestTime = val.lastUsedAt;
          oldestKey = key;
        }
      }
      if (oldestKey) this.store.delete(oldestKey);
    }
    this.store.set(id, entry);
  }

  delete(id: string): void {
    this.store.delete(id);
  }

  /** List all active sessions, sorted by lastUsedAt descending (most recent first). */
  list(): SessionEntry[] {
    this.evictExpired();
    return Array.from(this.store.values())
      .map((e) => ({ ...e }))
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now - entry.lastUsedAt > this.ttl) {
        this.store.delete(key);
      }
    }
  }
}

/**
 * Persist session state from a tool result.
 *
 * Creates or updates the session entry:
 * - createdAt preserved on resume (not overwritten)
 * - totalCostUsd accumulated across calls
 * - turnCount incremented by 1
 *
 * Best-effort: never throws (try/catch wrapper).
 */
export function persist(
  store: SessionStore,
  sessionId: string,
  result: { model?: string; totalCostUsd?: number },
): void {
  try {
    if (!sessionId || !isValidSessionId(sessionId)) return;
    const now = Date.now();
    const existing = store.get(sessionId);
    store.set(sessionId, {
      sessionId,
      model: result.model ?? existing?.model,
      createdAt: existing?.createdAt ?? now,
      lastUsedAt: now,
      turnCount: (existing?.turnCount ?? 0) + 1,
      totalCostUsd: (existing?.totalCostUsd ?? 0) + (result.totalCostUsd ?? 0),
    });
  } catch {
    // Best-effort: session storage must never break tool execution
  }
}

/** Global session store singleton. */
export const sessionStore = new SessionStore();
