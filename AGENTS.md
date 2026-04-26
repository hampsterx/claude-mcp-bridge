# AGENTS.md - claude-mcp-bridge

Guidance for AI coding agents working in the claude-mcp-bridge repository.

This file defines repository-specific operating rules for autonomous or semi-autonomous coding agents. Follow these instructions unless a maintainer explicitly tells you otherwise.

## Project Overview

Open source MCP server that wraps Claude Code CLI as a subprocess, exposing code execution, web search, and structured output as MCP tools. Works with any MCP-compatible client: Codex CLI, Gemini CLI, Cursor, Windsurf, VS Code.

- **npm package**: `claude-mcp-bridge`
- **License**: MIT
- **Language**: TypeScript
- **Framework**: `@modelcontextprotocol/sdk`

## Architecture

```
MCP Client  --stdio-->  claude-mcp-bridge  --spawn-->  claude CLI subprocess
```

Prompts are assembled in TypeScript and spawned via the Claude Code CLI. Auth determines the spawn flags: API-key auth (`CLAUDE_BRIDGE_USE_API_KEY=1`) uses `--bare` for maximum isolation (skips hooks, memory, plugins, CLAUDE.md loading); subscription auth (the default) runs non-bare so the CLI can resolve OAuth tokens, with `--setting-sources ""` preventing project settings from leaking into the subprocess. See `DESIGN.md` § Subprocess Spawning and `SECURITY.md` § Isolation by Auth Mode. The `search` tool loads its prompt template from `prompts/*.md` via `src/utils/prompts.ts` and fills placeholders.

Code review is not a bridge tool. Use Claude Code's built-in `/review` family in-session, or invoke `claude -p` directly with the hardened isolation flags documented in [README § Code review with this CLI](README.md#code-review-with-this-cli). Rationale: [ADR-001](docs/decisions/001-remove-review-tool.md).

## Tools

| Tool | Purpose | Default Timeout |
|------|---------|----------------|
| `query` | Execute prompts with file context, session resume, budget control | 60s (text) / 120s (images) |
| `search` | Web search via Claude CLI WebSearch/WebFetch tools | 120s |
| `structured` | JSON Schema validated output via `--json-schema` | 60s |
| `listSessions` | List active sessions with cumulative cost and turn counts | instant |
| `ping` | Health check + CLI capability detection | 10s |

### Structured Tool Details

Uses Claude CLI's native `--json-schema` flag for validated JSON output. Returns clean JSON in the first content block, metadata (model, session, cost) in a separate content block.

## Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm run dev          # Watch mode
npm test             # Run tests
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```

### Testing changes without restarting MCP client

MCP servers are long-lived processes. After rebuilding, use the smoke test to call compiled tool functions directly, bypassing the running server:

```bash
npm run smoke                            # query tool, cwd
npm run smoke -- query /path/to/repo     # query with specific workingDirectory
npm run smoke -- search                  # web search
npm run smoke -- structured              # structured JSON output
npm run smoke -- ping                    # health check
npm run smoke -- listSessions            # in-memory session store lookup
```

## Key Design Decisions

### Subprocess Environment (Security Critical)
- **Explicit env allowlist**, never spread `process.env`
- Allowed keys: `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `AWS_REGION`, `AWS_DEFAULT_REGION`, `HOME`, `PATH`, `USER`, `SHELL`, `LANG`, `TERM`, `XDG_CONFIG_HOME`
- Conditional: `ANTHROPIC_API_KEY` only forwarded when `CLAUDE_BRIDGE_USE_API_KEY=1`
- Always set: `NO_COLOR=1`, `FORCE_COLOR=0`

### Subprocess Spawning
- Always `spawn` with `shell: false`, args as array (never `exec`)
- Pipe large prompts via stdin (avoids `ARG_MAX` limit)
- Kill process group on timeout: SIGTERM -> 5s grace -> SIGKILL
- Max 3 concurrent spawns (configurable via `CLAUDE_MAX_CONCURRENT`), queue excess (FIFO, 30s queue timeout)

### Output Parsing
- JSON output parsing from `--output-format json`
- Falls back to plain text extraction
- Tolerates malformed JSON, extracts response text from partial output
- Redacts potential secrets (API keys, Bearer tokens) from CLI output

### Path Security
- All paths resolved via `realpath`
- Verify within allowed root directory (no traversal)
- No symlink following outside root
- Max file size: 1MB text, 5MB image, 20 files max

### Model Fallback
- On quota exhaustion, auto-retries with fallback model (default: `haiku`)
- Configurable via `CLAUDE_FALLBACK_MODEL`, set to `none` to disable

### Response Metadata (`_meta`)
Every tool response includes `_meta` with execution metadata:
- `durationMs`, `model`, `sessionId`, `totalCostUsd`
- Token breakdown: `inputTokens`, `outputTokens`, `cacheReadTokens`
- `timedOut: true` when subprocess exceeded timeout

### Tool Annotations
All tools declare MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) in `src/annotations.ts`. query, search, and structured are `readOnlyHint: false` because they can persist Claude CLI session state to disk (`~/.claude/`) when a `sessionId` is used. `listSessions` and `ping` are `readOnlyHint: true`.

### Session Tracking
In-memory `SessionStore` (TTL 24h, LRU eviction at 100) tracks cumulative cost, turn counts, and timing. `listSessions` tool exposes session state. `resetSession` parameter on query clears stored state before execution.

### Progress Heartbeats
Query and search handlers emit MCP `notifications/progress` every 15s during subprocess execution when the client provides a `progressToken` in `_meta`. Fire-and-forget (silent on unsupported clients). Implemented in `src/utils/progress.ts`.

## Configuration

### Models

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_DEFAULT_MODEL` | | Shared default for all tools |
| `CLAUDE_QUERY_MODEL` | `sonnet` | Default model for query |
| `CLAUDE_STRUCTURED_MODEL` | `sonnet` | Default model for structured |
| `CLAUDE_SEARCH_MODEL` | `sonnet` | Default model for search |
| `CLAUDE_FALLBACK_MODEL` | `haiku` | Fallback on quota exhaustion. `none` to disable |

### Runtime

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_MAX_CONCURRENT` | `3` | Max concurrent subprocess spawns |
| `CLAUDE_CLI_PATH` | `claude` | Path to Claude CLI binary |
| `CLAUDE_MAX_BUDGET_USD` | | Global cost cap in USD (per call) |
| `CLAUDE_BRIDGE_USE_API_KEY` | | Set to `1` to forward `ANTHROPIC_API_KEY` (default: subscription auth) |

## Testing

- `tests/tools/` - Tool-level tests (mock subprocess)
- `tests/utils/` - Utility unit tests
- `tests/integration/` - End-to-end with real Claude CLI (gated by `CLAUDE_INTEGRATION=1`)

## CI/CD

CI publishes to npm on tag push via OIDC trusted publishing (no OTP needed).

### Release Workflow

The maintainer's `RELEASING.md` is gitignored (personal checklist); the release-critical pitfalls are inlined in the next section so contributors see them on clone.

## Release Footguns

Load-bearing behaviour that has broken (or nearly broken) past releases. Read before changing anything in `spawn.ts`, `security.ts`, or the publish workflow.

- **Subscription-first auth is load-bearing.** `ANTHROPIC_API_KEY` is stripped from the subprocess environment by default. Opt in via `CLAUDE_BRIDGE_USE_API_KEY=1`. Do not re-enable forwarding "for convenience"; it causes silent API-credit burn for users who only pay for the Claude.ai subscription. Shipped v0.4.0, reinforced in v0.4.1 when `--bare` was dropped so the subscription path works.
- **`--bare` was dropped in v0.4.1.** Do not re-add it without testing the subscription path end-to-end. The CLI needs its full auth-resolution code path for OAuth-based subscription auth. With API-key auth (`CLAUDE_BRIDGE_USE_API_KEY=1`), `DESIGN.md` still describes `--bare` as the maximum-isolation mode; keep the two paths clearly separated.
- **Native structured output** uses Claude CLI's `--json-schema` flag (no Ajv dependency). Do not swap in Ajv to "match" gemini/codex; the native path is stricter and faster here.
- **Native session resume** via `--resume SESSION_ID` works and is exposed as the `sessionId` parameter. Keep it.
- **Cost tracking in `_meta`** is unique to this bridge; callers rely on it for budget control (`CLAUDE_MAX_BUDGET_USD`). Do not drop `totalCostUsd`, token breakdown, or `durationMs` from execution metadata during refactors.
- **Broader secret redaction patterns** (base64, API keys, Bearer tokens) are a feature. Do not narrow; gemini/codex have weaker redaction by design, this one is deliberately stricter.
- **Version fields must move together at release time.** `npm version X.Y.Z` updates `package.json` + lockfile but not `server.json`. The MCP Registry rejects publishes where `server.json.version`, `server.json.packages[0].version`, and the npm tarball version disagree, or where `package.json.mcpName` is missing.
- **MCP Registry `server.json` validation is schema-driven and pedantic.** Env-var `default` fields must be strings even when `format: "number"` is declared. Reviewer tools have converged on the wrong fix here before; run `mcp-publisher publish` against a dry target (or accept that the first publish attempt is your validator) rather than trusting type-match intuition.
- **OIDC publish requires npm ≥ 11.5.1.** Node 20 in GitHub Actions ships npm 10, which does not support OIDC trusted publishing. `publish.yml` works around this with `npx --yes npm@latest publish --provenance --access public`. Do not revert to bare `npm publish`.

## Git Workflow

- Use feature branches with PRs for all changes (do not commit directly to master)
- Branch naming: `feat/`, `fix/`, `refactor/` prefix, kebab-case
- Squash merge PRs

## Conventions

- Prefer explicit over clever
- No default exports
- Error messages must be actionable ("claude CLI not found - install with: npm i -g @anthropic-ai/claude-code")
- All public functions must have JSDoc
- Tests colocated by directory: `tests/tools/`, `tests/utils/`
