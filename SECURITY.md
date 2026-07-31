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

Every spawned subprocess gets an explicit built-in toolset via `--tools`. The defaults below are read-only on every path, so `Bash`, `Write` and `Edit` are not granted unless an operator widens them:

| Tool | Built-in tools granted |
|------|------------------------|
| `query` (text) | `Read`, `Glob`, `Grep` |
| `query` (images) | `Read`, `Glob`, `Grep` (`Read` is always included; images are passed by path) |
| `structured` | `Read`, `Glob`, `Grep` |
| `search` | `WebSearch`, `WebFetch` |

Override per tool with `CLAUDE_QUERY_TOOLS`, `CLAUDE_STRUCTURED_TOOLS` or `CLAUDE_SEARCH_TOOLS`: a comma or space separated list, `default` for the CLI's full built-in set, or empty for no tools. Widening these grants the subprocess real capability in the caller-supplied working directory, so treat `default` as opting out of this section.

Two mechanics are worth stating plainly, because both are easy to get wrong:

- **`--tools` restricts the toolset; `--allowed-tools` only grants permission.** `--allowed-tools Read` does *not* remove `Bash`, and `Bash` is auto-approved in `--print` mode, so an allowlist alone leaves command execution reachable. The bridge emits both flags from the same list: `--tools` to bound the surface, `--allowed-tools` to pre-approve it (`WebSearch` and `WebFetch` are not auto-approved and stall on a permission prompt without it).
- **Neither `--bare` nor `--setting-sources ""` restricts tools.** They control what *context* the subprocess loads (hooks, CLAUDE.md, memory, plugins, settings). Tool access is orthogonal and governed only by `--tools`.

With no tools granted, the model may narrate plausible-looking tool calls it never made rather than reporting that it has none. Prefer a minimal read-only set over an empty one where the prompt might invite tool use.

Callers that need code review with Claude as a subprocess should use the hardened `claude -p` invocation documented in [README § Code review with this CLI](README.md#code-review-with-this-cli). The bridge no longer ships a `review` tool (see [ADR-001](docs/decisions/001-no-bundled-prompts.md)).

The README's hardened invocation passes `--strict-mcp-config` and `--mcp-config '{"mcpServers":{}}'` to suppress parent MCP servers. Note: at time of writing those flags have an open upstream-tracked behaviour history (anthropics/claude-code#10787 → #5593, both closed but the underlying parsing/schema reliability is worth re-checking before relying on it as a hard isolation guarantee). The other flags in the recipe (`--permission-mode plan`, `--bare`, `--no-session-persistence`, `--max-budget-usd`) are not affected.

## Argument Injection

`shell: false` stops the shell from interpreting arguments, but it does not stop the *CLI's own parser* from reading a caller-supplied value as a flag. Two values reach argv from MCP tool input, and both are bound so they cannot be re-parsed as options:

- **Prompt**: passed after a `--` separator, which ends option parsing. Without it, a prompt of `--tools=default` restores the full toolset, and a `--settings=` payload carrying a `SessionStart` hook runs an arbitrary command (the CLI reports an input error only after the hook has already fired).
- **Session id, model and effort**: passed as `--resume=<id>`, `--model=<name>`, `--effort=<level>`. Whether a dash-prefixed value stays bound otherwise depends on the flag declaring its value required or optional, and that differs per flag: `--resume` is optional, so in the space-separated form a dash-prefixed id detaches and is parsed as a flag. The `=` form removes the dependence on that distinction.

Tool names are validated as plain identifiers (`^[A-Za-z][A-Za-z0-9_]*$`) before reaching `--tools`, since a dash-prefixed entry would terminate the variadic list and be read as a flag.

## Subprocess Safety

- Subprocess spawned with `shell: false` and args as an array. No shell interpretation of arguments.
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
| Tool access | Set by `--tools` (see [Tool Sandboxing](#tool-sandboxing)) | Set by `--tools`, identical to the API key mode |

API key auth loads less context via `--bare` mode. Subscription auth requires non-bare mode because the CLI disables OAuth/keychain reads in bare mode. The bridge mitigates this by passing `--setting-sources ""` to prevent project and local settings from influencing the subprocess. The environment variable allowlist and the tool restriction apply equally to both modes.

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
