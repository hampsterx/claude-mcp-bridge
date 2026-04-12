# Design

Architecture and implementation details for claude-mcp-bridge.

## Architecture

```
MCP Client  --stdio-->  claude-mcp-bridge  --spawn-->  claude CLI subprocess
```

The bridge assembles prompts in TypeScript and spawns the Claude Code CLI in `--bare` mode (skips hooks, memory, and plugins). The `review` tool's agentic mode runs Claude with `--allowed-tools` inside the target repo, letting it explore files, follow imports, and read project instruction files. The bridge captures JSON output, parses it, and returns structured MCP responses.

## Subprocess Spawning

- Always `spawn()` with `shell: false`, args as array (never `exec()`)
- Large prompts piped via stdin to avoid `ARG_MAX` limits
- Kill process group on timeout: SIGTERM, 5s grace period, then SIGKILL
- On Unix, the entire process group is killed to clean up child processes
- `NO_COLOR=1` and `FORCE_COLOR=0` set for every spawn

## Output Parsing

Claude CLI outputs JSON via `--output-format json`. The bridge:

1. Parses the JSON output, extracting the response text and cost metadata
2. Falls back to plain text extraction if JSON parsing fails
3. Tolerates malformed JSON and extracts response text from partial output
4. Redacts potential secrets before returning to the MCP client

## Concurrency

Requests are managed by a FIFO queue:
- **Max concurrent**: 3 subprocess spawns (configurable via `CLAUDE_MAX_CONCURRENT`)
- **Queue timeout**: 30s (requests that can't acquire a slot within 30s are rejected)
- **Timeout enforcement**: Per-tool defaults, 600s (10 min) hard cap
- **Cleanup**: Timed-out processes killed with SIGTERM, then SIGKILL after 5s

## Authentication

The bridge supports two auth methods, matching Claude Code CLI:

| Method | Setup | Billing |
|--------|-------|---------|
| **Subscription** | `claude login` (OAuth) | Pro/Max plan (included) |
| **API key** | Set `ANTHROPIC_API_KEY` | Pay-per-use (console.anthropic.com) |

If `ANTHROPIC_API_KEY` is set, it takes priority over subscription auth. The `ping` tool reports the active auth method.

## Model Fallback

When the primary model returns a quota exhaustion error, the bridge automatically retries with `CLAUDE_FALLBACK_MODEL` (default: `haiku`). Set to `none` to disable. The `_meta.model` field reflects the model actually used.

Model resolution order: explicit parameter > tool-specific env var > `CLAUDE_DEFAULT_MODEL` > built-in default. This gives fine-grained control: use opus for reviews, sonnet for queries, haiku for fallback.

## Sessions

Session state is tracked in-memory across calls. When a tool returns a `sessionId` in `_meta`, pass it back on subsequent calls to resume the conversation via Claude CLI's `--resume` flag.

- **Cumulative cost**: `totalCostUsd` in `_meta` is the cost for that call only. Cumulative cost across turns is tracked per-session and visible via `listSessions`
- **Reset**: Pass `resetSession: true` on the query tool to clear stored state and start fresh
- **TTL**: Sessions expire after 24 hours of inactivity
- **Capacity**: LRU eviction at 100 sessions (oldest by `lastUsedAt` is evicted)
- **Ephemeral**: Session state is in-memory only, lost on server restart

## Cost Tracking

Claude-mcp-bridge is the only bridge in the family that surfaces detailed cost metadata, because Claude Code CLI provides it natively:

| Field | Type | Description |
|-------|------|-------------|
| `totalCostUsd` | number | Cost for this call in USD |
| `inputTokens` | number | Input tokens consumed |
| `outputTokens` | number | Output tokens generated |
| `cacheReadTokens` | number | Tokens read from prompt cache |

This enables calling agents to monitor spend, enforce budgets, and make cost-aware decisions about which model to use.

## Response Metadata

All tools attach an `_meta` object to the MCP `CallToolResult`:

| Field | Type | Present on |
|-------|------|------------|
| `durationMs` | number | All tools |
| `model` | string | Tools that run Claude CLI |
| `sessionId` | string | Tools with session support |
| `totalCostUsd` | number | Tools that run Claude CLI |
| `inputTokens` | number | Tools that run Claude CLI |
| `outputTokens` | number | Tools that run Claude CLI |
| `cacheReadTokens` | number | Tools that run Claude CLI |
| `timedOut` | boolean | Present (true) only when subprocess exceeded timeout |

## MCP Annotations

All tools declare [MCP tool annotations](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#annotations) so clients can make informed permission and safety decisions:

| Tool | readOnlyHint | destructiveHint | openWorldHint |
|------|-------------|----------------|---------------|
| query | false | false | true |
| review | false | false | true |
| search | false | false | true |
| structured | false | false | true |
| ping | true | false | false |
| listSessions | true | false | false |

Query, review, search, and structured are `readOnlyHint: false` because they can persist Claude CLI session state to disk (`~/.claude/`) when a `sessionId` is used. Most tools are `openWorldHint: true` since they spawn a CLI that can access files and network.

## Progress Notifications

Long-running tools (query, review, search) emit MCP `notifications/progress` every 15 seconds when the client provides a `progressToken` in the request's `_meta`. Heartbeats include elapsed time. Notifications are fire-and-forget; clients that don't support progress notifications are unaffected.

Implemented in `src/utils/progress.ts`.

## Agentic Review

The review tool's agentic mode gives Claude a specific set of allowed tools:

```
Read, Grep, Glob, Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git status:*)
```

This is more restrictive than giving Claude full shell access. It can read any file, search code, and run git commands, but cannot execute arbitrary shell commands, write files, or access the network.

The timeout auto-scales from diff size, following the same formula as the other bridges.

## Effort Control

Claude CLI supports `--effort` levels that trade quality for speed/cost:

| Level | Best for |
|-------|----------|
| `low` | Quick questions, triage |
| `medium` | General queries, search |
| `high` | Code review, complex analysis |
| `max` | Critical reviews, deep analysis |

Each tool has its own default effort level (configurable via env vars), and callers can override per-request.

## Prompt Templates

The `review` and `search` tools load prompt templates from the `prompts/` directory. Templates are filled with placeholders (diff content, focus area, etc.). Editable when running from a local clone; bundled when running via `npx`.
