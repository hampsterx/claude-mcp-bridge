---
status: Accepted
date: 2026-04-26
---

# ADR-001: Bridge does not bundle reviewer prompts

## Principle

CLI-wrapping bridges and the prompts they wrap iterate at different speeds: prompts iterate fast, bridges publish slowly. Tools that bundle prompts (a `review` tool with built-in reviewer prompts and depth selectors) couple them. **Bridge tools accept caller-supplied prompts; they do not bundle prompts of their own.**

A new tool earns its place on different grounds: state the client should not hold (session IDs, budget tracking) or CLI invocation contracts the client should not reinvent (e.g. `structured` delegates schema validation to `claude --json-schema`).

## Code review path

The reviewer prompt is supplied by the caller. The bridge does not bundle review prompts.

- **In Claude Code (interactive REPL)**: use the built-in `/review`, `/security-review`, `/ultrareview`. REPL-only; not reachable via `claude -p` or this bridge.
- **Through this bridge** (`query` / `structured`): pass the review prompt as plain text. Slash commands (built-in or user-installed `~/.claude/commands/`) do *not* resolve through the bridge. The bridge's isolation flags (`--bare` on the API-key path, `--setting-sources ""` on the subscription path) block all skill resolution by design. Tracked upstream as [anthropics/claude-code#37207](https://github.com/anthropics/claude-code/issues/37207); a future `--skills-dir` would close the gap.
- **Direct `claude -p`** (no bridge): user skills resolve as `/skill-name` when no isolation flags suppress them. For subprocess-isolated review use the hardened invocation: `--bare`, `--strict-mcp-config`, `--mcp-config '{"mcpServers":{}}'`, `--add-dir`, `--no-session-persistence`, `--max-budget-usd`. The empty-MCP config requires the inner `mcpServers` key; the schema rejects bare `'{}'`.

The bridge previously also passed `--disable-slash-commands`. That was redundant on top of `--bare` / `--setting-sources ""` and has been dropped.

See [README § Code review with this CLI](../../README.md#code-review-with-this-cli).

## Consequences

Remote MCP clients without shell access (Claude Desktop, etc.) reach Claude only via this bridge. They can pass any review prompt as plain text but cannot invoke their host's slash commands or skills through it.

## Cross-references

- [README § Code review with this CLI](../../README.md#code-review-with-this-cli)
