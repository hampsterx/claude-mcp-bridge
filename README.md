# claude-mcp-bridge

[![npm version](https://img.shields.io/npm/v/claude-mcp-bridge)](https://www.npmjs.com/package/claude-mcp-bridge)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![MCP SDK](https://img.shields.io/badge/MCP%20SDK-1.12-purple)](https://modelcontextprotocol.io/)

MCP server that wraps [Claude Code CLI](https://github.com/anthropics/claude-code) as a subprocess, exposing code execution, agentic review, web search, and structured output as MCP tools.

Works with any MCP client: Codex CLI, Gemini CLI, Cursor, Windsurf, VS Code, or any tool that speaks [Model Context Protocol](https://modelcontextprotocol.io/).

## Do you need this?

If you're in a terminal agent (Codex CLI, Gemini CLI) with shell access, you can call Claude Code CLI directly:

```bash
# Quick review of current diff
git diff origin/main...HEAD | claude -p --bare "Review this diff for bugs and security issues"

# Agentic review (Claude reads files, follows imports, checks tests)
claude -p --bare --allowed-tools "Read Grep Glob Bash(git diff:*,git log:*,git show:*)" \
  "Review the changes on this branch vs main"

# Analyze specific files
claude -p --bare --allowed-tools "Read" "Analyze src/utils/parse.ts for edge cases"

# With budget cap
claude -p --bare --max-budget-usd 0.50 "Is this retry logic sound?"
```

`--bare` skips hooks, memory, and plugins for clean subprocess use. `--allowed-tools` controls exactly what Claude can access. `--max-budget-usd` prevents runaway costs.

**Use this MCP bridge instead when:**
- Your client has no shell access (Cursor, Windsurf, Claude Desktop, VS Code)
- You need structured output with native `--json-schema` validation
- You need session resume across calls (`--resume SESSION_ID`)
- You need concurrency management and security hardening
- You want cost metadata surfaced in MCP responses

## Installation

### Prerequisites

- Node.js >= 18
- [Claude Code CLI](https://github.com/anthropics/claude-code) installed and on PATH
- `ANTHROPIC_API_KEY` set for bare mode

### From source

```bash
git clone https://github.com/hampsterx/claude-mcp-bridge.git
cd claude-mcp-bridge
npm install
npm run build
```

### MCP client configuration

Add to your MCP client config (e.g. `~/.claude/settings.json`, Cursor settings, etc.):

```json
{
  "mcpServers": {
    "claude-mcp-bridge": {
      "command": "node",
      "args": ["/path/to/claude-mcp-bridge/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "claude-mcp-bridge": {
      "command": "claude-mcp-bridge"
    }
  }
}
```

## Tools

### `query`

Execute a prompt via Claude Code CLI with optional file context and session resume.

```json
{
  "prompt": "Explain the error handling in this file",
  "files": ["src/utils/errors.ts"],
  "model": "sonnet",
  "workingDirectory": "/path/to/repo",
  "timeout": 60000,
  "maxBudgetUsd": 0.50
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | (required) | The prompt to send to Claude |
| `files` | string[] | | File paths relative to workingDirectory (text or images) |
| `model` | string | `sonnet` | Model alias or full Claude model name |
| `sessionId` | string | | Session ID to resume a multi-turn conversation |
| `noSessionPersistence` | boolean | | Disable session persistence for one-off calls |
| `workingDirectory` | string | `cwd` | Working directory for file resolution and CLI execution |
| `timeout` | number | 60000 | Timeout in ms (120000 for image queries) |
| `maxResponseLength` | number | | Soft limit on response length in words |
| `maxBudgetUsd` | number | | Cost cap in USD |
| `effort` | string | | `low`, `medium`, `high`, or `max` |

Supports images (.png, .jpg, .jpeg, .gif, .webp, .bmp) up to 5MB each. Text files are inlined into the prompt; image paths are passed to Claude's Read tool.

### `structured`

Generate JSON that conforms to a provided JSON Schema using Claude CLI's native `--json-schema` validation.

```json
{
  "prompt": "Extract all function signatures from this file",
  "schema": "{\"type\":\"object\",\"properties\":{\"functions\":{\"type\":\"array\",\"items\":{\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\"},\"params\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}}},\"required\":[\"name\"]}}},\"required\":[\"functions\"]}",
  "files": ["src/index.ts"],
  "workingDirectory": "/path/to/repo"
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | (required) | What to generate or extract |
| `schema` | string | (required) | JSON Schema as a JSON string (max 20KB) |
| `files` | string[] | | Text file paths to include as context (no images) |
| `model` | string | `sonnet` | Model alias or full model name |
| `sessionId` | string | | Session ID to resume |
| `noSessionPersistence` | boolean | | Disable session persistence |
| `workingDirectory` | string | `cwd` | Working directory for file resolution |
| `timeout` | number | 60000 | Timeout in ms |
| `maxBudgetUsd` | number | | Cost cap in USD |

Returns clean JSON in the first content block. Metadata (model, session, cost) in a separate content block so JSON parsing isn't broken.

### `review`

Repo-aware code review with two modes:

**Agentic mode** (default): Claude explores the repo using Read, Grep, Glob, and git commands. It follows imports, checks tests, and reads surrounding context. Slower but thorough.

**Quick mode** (`quick: true`): Reviews a pre-computed diff only. No tool calls, no file exploration. Faster, cheaper, good for small changes.

```json
{
  "base": "main",
  "focus": "security and error handling",
  "workingDirectory": "/path/to/repo",
  "maxBudgetUsd": 1.00
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `uncommitted` | boolean | `true` | Review uncommitted changes (staged + unstaged) |
| `base` | string | | Base branch/ref to diff against (overrides uncommitted) |
| `focus` | string | | Review focus area (e.g. "security", "error handling") |
| `quick` | boolean | `false` | Use quick (diff-only) mode instead of agentic |
| `model` | string | `opus` | Model alias or full model name |
| `sessionId` | string | | Session ID to resume |
| `noSessionPersistence` | boolean | | Disable session persistence |
| `workingDirectory` | string | `cwd` | Repository root |
| `timeout` | number | 300000 / 120000 | 5min (agentic) or 2min (quick) |
| `maxResponseLength` | number | | Soft limit on response length in words |
| `maxBudgetUsd` | number | | Cost cap in USD |
| `effort` | string | `high` | `low`, `medium`, `high`, or `max` |

Agentic mode allowed tools: `Read`, `Grep`, `Glob`, `Bash(git diff:*)`, `Bash(git log:*)`, `Bash(git show:*)`, `Bash(git status:*)`.

### `search`

Web search via Claude Code CLI using WebSearch and WebFetch tools.

```json
{
  "query": "What changed in MCP SDK v1.12?",
  "maxResponseLength": 500
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | (required) | Search query or question |
| `model` | string | `sonnet` | Model alias or full model name |
| `sessionId` | string | | Session ID to resume |
| `noSessionPersistence` | boolean | | Disable session persistence |
| `workingDirectory` | string | `cwd` | Working directory for the CLI |
| `timeout` | number | 120000 | Timeout in ms |
| `maxResponseLength` | number | | Soft limit on response length in words |
| `maxBudgetUsd` | number | | Cost cap in USD |
| `effort` | string | `medium` | `low`, `medium`, `high`, or `max` |

### `ping`

Health check. No parameters. Returns CLI availability, auth status, configured models, server version, and capability flags.

```
cliFound: true
version: 1.0.33 (Claude Code)
authStatus: ok
defaultModel: sonnet
fallbackModel: haiku
serverVersion: 0.1.0
nodeVersion: v22.12.0
maxConcurrent: 3
capabilities: bareMode=true, jsonOutput=true, jsonSchema=true, sessionResume=true
```

## Configuration

All configuration is through environment variables. None are required if Claude CLI is on PATH and `ANTHROPIC_API_KEY` is already set in your environment.

### Models

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_DEFAULT_MODEL` | | Shared default for all tools |
| `CLAUDE_QUERY_MODEL` | `sonnet` | Default model for query |
| `CLAUDE_STRUCTURED_MODEL` | `sonnet` | Default model for structured |
| `CLAUDE_SEARCH_MODEL` | `sonnet` | Default model for search |
| `CLAUDE_REVIEW_MODEL` | `opus` | Default model for review |
| `CLAUDE_FALLBACK_MODEL` | `haiku` | Fallback on quota exhaustion (set to `none` to disable) |

Model resolution order: explicit parameter > tool-specific env var > `CLAUDE_DEFAULT_MODEL` > built-in default.

### Effort and budget

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_REVIEW_EFFORT` | `high` | Default effort for review tool |
| `CLAUDE_SEARCH_EFFORT` | `medium` | Default effort for search tool |
| `CLAUDE_QUERY_EFFORT` | | Default effort for query tool |
| `CLAUDE_MAX_BUDGET_USD` | | Global cost cap in USD (per call) |

### Runtime

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_MAX_CONCURRENT` | `3` | Max simultaneous Claude CLI processes |
| `CLAUDE_CLI_PATH` | `claude` | Custom path to Claude CLI binary |
| `ANTHROPIC_API_KEY` | | API key for bare mode auth |

## Security

### Subprocess environment isolation

Only a strict allowlist of environment variables is passed to Claude CLI subprocesses: `ANTHROPIC_API_KEY`, `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `AWS_REGION`, `AWS_DEFAULT_REGION`, `HOME`, `PATH`, `USER`, `SHELL`, `LANG`, `TERM`, `XDG_CONFIG_HOME`. Everything else is stripped.

### Path sandboxing

All file paths are resolved to absolute paths via `realpath()` and verified to stay within the working directory. Symlink traversal and `..` path components that escape the sandbox are rejected.

### Git argument injection prevention

The `base` parameter in the review tool is validated against `/^[\w./-]+$/` before being passed to git commands, preventing argument injection (e.g. a malicious ref like `--output=/tmp/pwned`).

### Output redaction

CLI output is scanned for sensitive patterns before being returned: Anthropic API keys (`sk-ant-*`), Bearer tokens, token assignments, and base64-encoded strings that look like secrets are replaced with `[REDACTED]`.

### Limits

| Limit | Value |
|-------|-------|
| Max file size (text) | 1 MB |
| Max file size (image) | 5 MB |
| Max files per request | 20 |
| Max JSON Schema size | 20 KB |
| Hard timeout cap | 10 minutes |
| Concurrency queue timeout | 30 seconds |

## Concurrency

Requests are queued with a FIFO scheduler. Default: 3 concurrent Claude CLI processes. If all slots are busy, new requests wait up to 30 seconds before being rejected. Timed-out processes are killed with SIGTERM, then SIGKILL after 5 seconds. On Unix, the entire process group is killed to clean up child processes.

## Development

```bash
npm run build          # Compile TypeScript
npm run dev            # Watch mode
npm test               # Run unit tests (vitest)
npm run lint           # ESLint
npm run typecheck      # Type check without emitting
npm run smoke          # Smoke test against live Claude CLI
```

### Smoke tests

```bash
node scripts/smoke-test.mjs query ~/my-repo
node scripts/smoke-test.mjs structured ~/my-repo
node scripts/smoke-test.mjs review ~/my-repo
node scripts/smoke-test.mjs search
node scripts/smoke-test.mjs ping
```

Requires Claude CLI installed and `ANTHROPIC_API_KEY` set.

## License

MIT
