# CLAUDE.md - claude-mcp-bridge

## Project Overview

Open source MCP server that wraps Claude Code CLI as a subprocess, exposing code execution, agentic review, web search, and structured output as MCP tools. Works with any MCP-compatible client: Codex CLI, Gemini CLI, Cursor, Windsurf, VS Code.

- **npm package**: `claude-mcp-bridge`
- **License**: MIT
- **Language**: TypeScript
- **Framework**: `@modelcontextprotocol/sdk`

## Architecture

```
MCP Client  --stdio-->  claude-mcp-bridge  --spawn-->  claude CLI subprocess
```

Prompts are assembled in TypeScript and spawned via the CLI in `--bare` mode. The `review` and `search` tools load prompt templates from `prompts/*.md` via `src/utils/prompts.ts` and fill placeholders. The `review` tool's agentic mode runs Claude with `--allowed-tools` inside the target repo, letting it explore files, follow imports, and read project instruction files.

## Tools

| Tool | Purpose | Default Timeout |
|------|---------|----------------|
| `query` | Execute prompts with file context, session resume, budget control | 60s (text) / 120s (images) |
| `review` | Agentic repo-aware code review (Claude explores repo with Read/Grep/Glob/git) | 300s (agentic) / 120s (quick) |
| `search` | Web search via Claude CLI WebSearch/WebFetch tools | 120s |
| `structured` | JSON Schema validated output via `--json-schema` | 60s |
| `ping` | Health check + CLI capability detection | 10s |

### Review Tool Details

Two modes:

- **Agentic (default)**: Claude CLI runs with `--allowed-tools` inside the repo. It runs `git diff`, reads full files, follows imports, checks tests, and reads project instruction files before reviewing.
- **Quick** (`quick: true`): Sends only the diff text. Single-pass, no repo exploration.

Optional `focus` parameter directs attention (e.g. "security", "performance", "error handling").

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
npm run smoke -- review /path/to/repo    # review tool against another repo
npm run smoke -- search                  # web search
npm run smoke -- ping                    # health check
```

## Key Design Decisions

### Subprocess Environment (Security Critical)
- **Explicit env allowlist**, never spread `process.env`
- Allowed keys: `ANTHROPIC_API_KEY`, `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `AWS_REGION`, `AWS_DEFAULT_REGION`, `HOME`, `PATH`, `USER`, `SHELL`, `LANG`, `TERM`, `XDG_CONFIG_HOME`
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

## Configuration

### Models

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_DEFAULT_MODEL` | | Shared default for all tools |
| `CLAUDE_QUERY_MODEL` | `sonnet` | Default model for query |
| `CLAUDE_STRUCTURED_MODEL` | `sonnet` | Default model for structured |
| `CLAUDE_SEARCH_MODEL` | `sonnet` | Default model for search |
| `CLAUDE_REVIEW_MODEL` | `opus` | Default model for review |
| `CLAUDE_FALLBACK_MODEL` | `haiku` | Fallback on quota exhaustion. `none` to disable |

### Runtime

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_MAX_CONCURRENT` | `3` | Max concurrent subprocess spawns |
| `CLAUDE_CLI_PATH` | `claude` | Path to Claude CLI binary |
| `CLAUDE_MAX_BUDGET_USD` | | Global cost cap in USD (per call) |

## Testing

- `tests/tools/` - Tool-level tests (mock subprocess)
- `tests/utils/` - Utility unit tests
- `tests/integration/` - End-to-end with real Claude CLI (gated by `CLAUDE_INTEGRATION=1`)

## CI/CD

Manual npm publish with OTP (no automation token, no OIDC).

### Release Workflow

See [RELEASING.md](RELEASING.md) for the full checklist including pre-release checks, publish steps, and post-release validation.

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
