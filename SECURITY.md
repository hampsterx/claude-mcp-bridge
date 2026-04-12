# Security

Security model and hardening measures for claude-mcp-bridge.

## Environment Isolation

The subprocess receives a strict allowlist of environment variables. Your credentials and tokens are not leaked to the Claude CLI process.

**Allowed keys**: `ANTHROPIC_API_KEY`, `CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`, `AWS_REGION`, `AWS_DEFAULT_REGION`, `HOME`, `PATH`, `USER`, `SHELL`, `LANG`, `TERM`, `XDG_CONFIG_HOME`

**Always set**: `NO_COLOR=1`, `FORCE_COLOR=0`

Everything else from `process.env` is stripped. The allowlist is defined in `src/utils/env.ts`.

## Path Sandboxing

All file paths are resolved to absolute paths via `realpath()` and verified to stay within the working directory:

- No path traversal via `..` components
- No symlink following outside the root directory
- Paths outside the sandbox are rejected before reaching the CLI

## Tool Sandboxing

The `review` tool's agentic mode uses `--allowed-tools` to restrict Claude to a specific set of read-only tools:

```
Read, Grep, Glob, Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git status:*)
```

This prevents Claude from executing arbitrary shell commands, writing files, or accessing the network during review. The `query` tool in `--bare` mode has no tool access by default unless the caller specifies otherwise.

## Git Argument Injection Prevention

The `base` parameter in the review tool is validated against `/^[\w./-]+$/` before being passed to git commands. This prevents argument injection through crafted ref names (e.g. a malicious ref like `--output=/tmp/pwned`).

## Subprocess Safety

- Subprocess spawned with `shell: false` and args as an array. No command injection from the bridge itself.
- Large prompts piped via stdin rather than passed as command-line arguments.
- Process groups killed on timeout (SIGTERM then SIGKILL after 5s grace period).
- `--bare` mode ensures the CLI subprocess skips hooks, memory, and plugins.

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

- **Per-call**: `maxBudgetUsd` parameter on query, review, search, and structured tools (passed to `--max-budget-usd`)
- **Global**: `CLAUDE_MAX_BUDGET_USD` env var sets a default cap for all calls
- **Fallback model**: On quota exhaustion, the bridge falls back to a cheaper model (default: haiku) rather than failing

These controls prevent runaway costs when the bridge is used by automated orchestration systems that may make many calls.
