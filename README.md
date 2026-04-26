# claude-mcp-bridge

[![npm version](https://img.shields.io/npm/v/claude-mcp-bridge)](https://www.npmjs.com/package/claude-mcp-bridge)
[![npm downloads](https://img.shields.io/npm/dm/claude-mcp-bridge)](https://www.npmjs.com/package/claude-mcp-bridge)
[![CI](https://github.com/hampsterx/claude-mcp-bridge/actions/workflows/ci.yml/badge.svg)](https://github.com/hampsterx/claude-mcp-bridge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/node/v/claude-mcp-bridge)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-compatible-8A2BE2)](https://modelcontextprotocol.io/)

MCP server that wraps [Claude Code CLI](https://github.com/anthropics/claude-code) as a subprocess, exposing its capabilities as [Model Context Protocol](https://modelcontextprotocol.io/) tools.

Works with any MCP client: Codex CLI, Gemini CLI, Cursor, Windsurf, VS Code, or any tool that speaks MCP.

## Do you need this?

If you're in a terminal agent (Codex CLI, Gemini CLI) with shell access, call Claude Code CLI directly:

```bash
# Analyze specific files
claude -p --bare --allowed-tools "Read" "Analyze src/utils/parse.ts for edge cases"

# With budget cap
claude -p --bare --max-budget-usd 0.50 "Is this retry logic sound?"
```

`--bare` skips hooks, memory, and plugins for clean subprocess use. `--allowed-tools` controls exactly what Claude can access. `--max-budget-usd` prevents runaway costs.

For code review, see [Code review with this CLI](#code-review-with-this-cli).

**Use this MCP bridge instead when:**
- Your client has no shell access (Cursor, Windsurf, Claude Desktop, VS Code)
- You need structured output with native `--json-schema` validation
- You need session resume across calls (`--resume SESSION_ID`)
- You need concurrency management and security hardening
- You want cost metadata surfaced in MCP responses

## Quick Start

```bash
npx claude-mcp-bridge
```

### Prerequisites

- [Claude Code CLI](https://github.com/anthropics/claude-code) installed and on PATH
- Authentication (one of):
  - **Subscription** (default): `claude login` (uses your Pro/Max plan, no API credits needed)
  - **API key**: set `ANTHROPIC_API_KEY` + `CLAUDE_BRIDGE_USE_API_KEY=1` (billed per use via console.anthropic.com)

### Codex CLI

Add to `~/.codex/config.json`:
```json
{
  "mcpServers": {
    "claude-bridge": {
      "command": "npx",
      "args": ["-y", "claude-mcp-bridge"]
    }
  }
}
```

### Gemini CLI

Add to `~/.gemini/settings.json`:
```json
{
  "mcpServers": {
    "claude-bridge": {
      "command": "npx",
      "args": ["-y", "claude-mcp-bridge"]
    }
  }
}
```

### Cursor / Windsurf / VS Code

Add to your MCP settings:
```json
{
  "claude-bridge": {
    "command": "npx",
    "args": ["-y", "claude-mcp-bridge"],
    "env": {
      "ANTHROPIC_API_KEY": "sk-ant-...",
      "CLAUDE_BRIDGE_USE_API_KEY": "1"
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| **query** | Execute prompts with file context, session resume, effort control, and budget caps. Supports text and images. For code review, see [Code review with this CLI](#code-review-with-this-cli). |
| **search** | Web search via Claude CLI's WebSearch and WebFetch tools. Returns synthesized answers with sources. |
| **structured** | JSON Schema validated output via Claude CLI's native `--json-schema`. |
| **ping** | Health check with CLI version, auth method, capabilities, and model config. |
| **listSessions** | List active sessions with cumulative cost, turn count, and timestamps. |

### query

Execute a prompt with optional file context. Supports session resume via `sessionId`, effort control (`low`/`medium`/`high`/`max`), and budget caps (`maxBudgetUsd`). Images (.png, .jpg, .gif, .webp, .bmp) up to 5MB each are passed to Claude's Read tool.

Key parameters: `prompt` (required), `files`, `model` (default `sonnet`), `sessionId`, `effort`, `maxBudgetUsd`, `workingDirectory`, `timeout` (default 60s).

### search

Web search powered by Anthropic's WebSearch tool via Claude CLI. Returns synthesized answers with source URLs.

Key parameters: `query` (required), `model` (default `sonnet`), `maxResponseLength`, `maxBudgetUsd`, `timeout` (default 120s).

### structured

Generate JSON conforming to a provided schema using Claude CLI's native `--json-schema` flag. Returns clean JSON in the first content block, metadata in a separate block so JSON parsing isn't broken.

Key parameters: `prompt` (required), `schema` (required, JSON string, max 20KB), `files`, `model` (default `sonnet`), `sessionId`, `maxBudgetUsd`, `timeout` (default 60s).

### ping

No parameters. Returns CLI version, auth method (subscription/api-key/none), configured models, capabilities, and server version.

### listSessions

No parameters. Returns active sessions with metadata: `sessionId`, `model`, `createdAt`, `lastUsedAt`, `turnCount`, `totalCostUsd`.

All tools attach execution metadata (`_meta`) with `durationMs`, `model`, `sessionId`, `totalCostUsd`, and token breakdowns. See [DESIGN.md](DESIGN.md) for details.

## Code review with this CLI

This bridge does not bundle reviewer prompts. There are two paths for code review:

### Claude Code built-ins (in-session)

If you're already inside Claude Code, use the built-in slash commands: `/review`, `/security-review`, `/ultrareview`. No bridge involvement.

### Direct `claude -p` invocation (subprocess-isolated)

For shell-equipped consumers (terminal agents, CI, BYOS skills), invoke the CLI directly with hardened isolation flags:

```bash
claude -p \
  --permission-mode plan \
  --bare \
  --add-dir <repo-root> \
  --strict-mcp-config \
  --mcp-config '{"mcpServers":{}}' \
  --no-session-persistence \
  --max-budget-usd 0.50 \
  "<your review prompt + diff or file references>"
```

- `--permission-mode plan`: read-only.
- `--bare`: strips parent's hooks, plugins, auto-memory, and `CLAUDE.md` autoload.
- `--add-dir <repo-root>`: makes the repo's `CLAUDE.md` / `AGENTS.md` available where the diff warrants it.
- `--strict-mcp-config --mcp-config '{"mcpServers":{}}'`: blocks parent's MCP servers from leaking in. The inner `mcpServers` key is required; the schema rejects bare `'{}'`.
- `--no-session-persistence`: no session files for one-off reviews.
- `--max-budget-usd`: per-call cost cap.

### Claude Code skill template

For Claude Code users who want a reusable command, drop this into `~/.claude/commands/review-claude.md`:

```markdown
---
description: Code review via subprocess-isolated claude -p
---

Run code review on the diff between origin/main and HEAD.

```bash
claude -p \
  --permission-mode plan \
  --bare \
  --add-dir "$(git rev-parse --show-toplevel)" \
  --strict-mcp-config \
  --mcp-config '{"mcpServers":{}}' \
  --no-session-persistence \
  --max-budget-usd 0.50 \
  "Review the diff below for bugs, missing error handling on user input, tests modified to silence failures, and security issues (injection, missing auth checks, secret leaks). For each finding cite file:line, severity, and a suggested fix. Skip style/formatting.

$(git diff origin/main...HEAD)"
```
```

### Representative review prompt

A starting point; adapt freely:

```text
Review the following diff:

<diff content>

Look for:
- Bugs that would surface in production
- Missing error handling on user-supplied input
- Tests modified to silence failures rather than verify behaviour
- Security issues (injection, missing auth checks, secret leaks)

For each finding cite file:line, severity (high/medium/low), and a suggested fix.
Skip style/formatting; assume an autoformatter handles those.
```

The bridge has no opinion on prompt content. See [ADR-001](docs/decisions/001-remove-review-tool.md) for the rationale.

## Configuration

### Models

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_DEFAULT_MODEL` | | Shared default for all tools |
| `CLAUDE_QUERY_MODEL` | `sonnet` | Default for query |
| `CLAUDE_STRUCTURED_MODEL` | `sonnet` | Default for structured |
| `CLAUDE_SEARCH_MODEL` | `sonnet` | Default for search |
| `CLAUDE_FALLBACK_MODEL` | `haiku` | Fallback on quota exhaustion (`none` to disable) |

Model resolution: explicit parameter > tool-specific env var > `CLAUDE_DEFAULT_MODEL` > built-in default.

### Runtime

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_MAX_CONCURRENT` | `3` | Max concurrent subprocess spawns |
| `CLAUDE_CLI_PATH` | `claude` | Path to CLI binary |
| `CLAUDE_MAX_BUDGET_USD` | | Global cost cap in USD (per call) |
| `ANTHROPIC_API_KEY` | | API key (only forwarded when `CLAUDE_BRIDGE_USE_API_KEY=1`) |
| `CLAUDE_BRIDGE_USE_API_KEY` | | Set to `1` to forward `ANTHROPIC_API_KEY` to the subprocess (default: subscription auth) |

### Effort

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_SEARCH_EFFORT` | `medium` | Default effort for search |
| `CLAUDE_QUERY_EFFORT` | | Default effort for query |

## Choosing a Claude Code MCP server

| You need... | Consider |
|-------------|----------|
| Structured output, effort/budget control, session resume, cost metadata | This bridge |
| Multi-tool orchestration (read, grep, edit, bash as separate MCP tools) | [mcp-claude-code](https://github.com/SDGLBL/mcp-claude-code) |
| Session continuity with async execution | [claude-mcp](https://github.com/zhendalf/claude-mcp) |
| Maintained lightweight wrapper | [@kunihiros/claude-code-mcp](https://github.com/KunihiroS/claude-code-mcp) |
| Native Claude Code MCP (built-in, no wrapper) | `claude mcp serve` ([docs](https://github.com/anthropics/claude-code)) |

## Performance

Claude Code CLI has minimal startup overhead. Wall time is dominated by model inference and any agentic exploration.

| Scenario | Typical time |
|----------|-------------|
| Trivial prompt (sonnet) | 5-10s |
| Web search + synthesis | 15-30s |

Cost metadata (`totalCostUsd`, token breakdowns) is returned in `_meta` on every response.

## Bridge family

Three MCP servers, same architecture, different underlying CLIs. Each wraps a terminal agent as a subprocess and exposes it as MCP tools. Pick the one that matches your model provider, or run multiple for cross-model workflows.

| | [claude-mcp-bridge](https://github.com/hampsterx/claude-mcp-bridge) | [gemini-mcp-bridge](https://github.com/hampsterx/gemini-mcp-bridge) | [codex-mcp-bridge](https://github.com/hampsterx/codex-mcp-bridge) |
|---|---|---|---|
| **CLI** | Claude Code | Gemini CLI | Codex CLI |
| **Provider** | Anthropic | Google | OpenAI |
| **Tools** | query, search, structured, ping, listSessions | query, review, search, structured, ping | codex, search, query, structured, ping, listSessions |
| **Code review** | Built-in `/review`, `/security-review`, `/ultrareview` slash commands or direct `claude -p` invocation | `review` tool with caller-supplied prompt and hardened defaults | `codex review` (native) or `codex` tool with caller-supplied prompt |
| **Structured output** | Native `--json-schema` (no Ajv) | Ajv validation | Ajv validation |
| **Session resume** | Native `--resume` | Not supported | Session IDs with multi-turn |
| **Budget caps** | Native `--max-budget-usd` | Not supported | Not supported |
| **Effort control** | `--effort low/medium/high/max` | Not supported | Not supported |
| **Cold start** | ~1-2s | ~16s | <100ms (inference dominates) |
| **Auth** | `claude login` (default) or `ANTHROPIC_API_KEY` + opt-in | `gemini auth login` | `OPENAI_API_KEY` |
| **Cost** | Subscription (default) or API credits (opt-in) | Free tier available | Pay-per-token |
| **Concurrency** | 3 (configurable) | 3 (configurable) | 3 (configurable) |
| **Model fallback** | Auto-retry with fallback model | Not supported | Auto-retry with fallback model |

All three share: subprocess env isolation, path sandboxing, output redaction, FIFO concurrency queue, MCP tool annotations, `_meta` response metadata, progress heartbeats.

## Development

```bash
npm install
npm run build        # Compile TypeScript
npm run dev          # Watch mode
npm test             # Run tests (vitest)
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run smoke        # Smoke test against live CLI
```

## Further reading

- [DESIGN.md](DESIGN.md) - Architecture, sessions, cost tracking, response metadata, progress notifications
- [SECURITY.md](SECURITY.md) - Environment isolation, path sandboxing, output redaction, tool sandboxing
- [CHANGELOG.md](CHANGELOG.md) - Release history

## License

MIT
