# Security

Security model and hardening measures for claude-mcp-bridge.

## Environment Isolation

The subprocess receives a strict allowlist of environment variables. Sensitive credentials are not forwarded unless explicitly opted in.

**Allowed keys**: `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `AWS_REGION`, `AWS_DEFAULT_REGION`, `HOME`, `PATH`, `USER`, `SHELL`, `LANG`, `TERM`, `XDG_CONFIG_HOME`

**Conditional**: `ANTHROPIC_API_KEY` is only forwarded when `CLAUDE_BRIDGE_USE_API_KEY=1` is set. This prevents accidental API credit consumption when subscription auth is available.

**Always set**: `NO_COLOR=1`, `FORCE_COLOR=0`

Everything else from `process.env` is stripped. The allowlist is defined in `src/utils/env.ts`.

## Path Sandboxing

All file paths are resolved to absolute paths via `realpath()` and verified to stay within the working directory:

- No path traversal via `..` components
- No symlink following outside the root directory
- Paths outside the sandbox are rejected before reaching the CLI

## Tool Sandboxing

The `query` tool in `--bare` mode has no tool access by default unless the caller specifies otherwise. Callers that need code review with Claude as a subprocess should use the hardened `claude -p` invocation documented in [README § Code review with this CLI](README.md#code-review-with-this-cli) (with `--permission-mode plan`, `--bare`, `--strict-mcp-config`, `--mcp-config '{"mcpServers":{}}'`, `--no-session-persistence`, and `--max-budget-usd`). The bridge no longer ships a `review` tool (see [ADR-001](docs/decisions/001-remove-review-tool.md)).

## Subprocess Safety

- Subprocess spawned with `shell: false` and args as an array. No command injection from the bridge itself.
- Large prompts piped via stdin rather than passed as command-line arguments.
- Process groups killed on timeout (SIGTERM then SIGKILL after 5s grace period).

### Isolation by Auth Mode

| Feature | API key (`--bare`) | Subscription (non-bare) |
|---------|-------------------|------------------------|
| Hooks | Skipped | May run |
| CLAUDE.md loading | Skipped | Loaded from cwd |
| Auto-memory | Disabled | Active |
| Plugin sync | Skipped | May run |
| Settings loading | Skipped | Disabled via `--setting-sources ""` |

API key auth provides maximum isolation via `--bare` mode. Subscription auth requires non-bare mode because the CLI disables OAuth/keychain reads in bare mode. The bridge mitigates this by passing `--setting-sources ""` to prevent project and local settings from influencing the subprocess. The environment variable allowlist applies equally to both modes.

## Output Redaction

CLI output is scanned for sensitive patterns before being returned to the MCP client:

- Anthropic API keys (`sk-ant-*`)
- Bearer tokens
- Token assignments in output
- Base64-encoded strings that resemble secrets

Matches are replaced with `[REDACTED]`.

## Resource Limits

| Limit | Value |
|-------|-------|
| Max file size (text) | 1 MB |
| Max file size (image) | 5 MB |
| Max files per request | 20 |
| Max JSON Schema size | 20 KB |
| Hard timeout cap | 600s (10 min) |
| Max concurrent spawns | 3 (configurable) |
| Queue timeout | 30s |

## Budget Controls

Claude-mcp-bridge exposes cost caps at multiple levels:

- **Per-call**: `maxBudgetUsd` parameter on query, search, and structured tools (passed to `--max-budget-usd`)
- **Global**: `CLAUDE_MAX_BUDGET_USD` env var sets a default cap for all calls
- **Fallback model**: On quota exhaustion, the bridge falls back to a cheaper model (default: haiku) rather than failing

These controls prevent runaway costs when the bridge is used by automated orchestration systems that may make many calls.
