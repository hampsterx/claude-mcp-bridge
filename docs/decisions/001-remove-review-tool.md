# ADR-001: Remove `review` tool

**Status**: Accepted
**Date**: 2026-04-26

## Context

This bridge registers `query`, `structured`, `search`, `ping`, `listSessions`, plus `review` (bundled reviewer prompts, depth selector).

CLI-wrapping tools should accept caller-supplied prompts rather than bundle them: prompts iterate fast, bridges publish slowly. `review` crosses that boundary.

Claude Code ships `/review`, `/security-review`, and `/ultrareview` as built-in slash commands. For Claude Code users (the dominant audience for invoking claude-as-reviewer) the built-ins cover the use case in-session. Subprocess-isolated review is available by running `claude -p` directly with the documented hardened flag set.

Remote MCP clients without shell access (Claude Desktop, etc.) have no claude-invocation path through this bridge once `review` is removed. That loss is bounded: users on those hosts already have native Claude access through the host's primary chat surface.

## Decision

Drop `review`.

Code review with this CLI uses one of:

- **Claude Code built-ins** (`/review`, `/security-review`, `/ultrareview`) for in-session review. No bridge involvement.
- **Direct `claude -p` invocation** for subprocess-isolated review with hardened flags (`--bare`, `--strict-mcp-config`, `--mcp-config '{"mcpServers":{}}'`, `--add-dir`, `--no-session-persistence`, `--max-budget-usd`). The empty-MCP config requires the inner `mcpServers` key; the schema rejects bare `'{}'`. Recommended path for shell-equipped consumers and for BYOS skill/command templates on hosts that support them.

The recommended invocations are documented in [README § Code review with this CLI](../../README.md#code-review-with-this-cli), including a Claude Code skill template consumers can drop into `~/.claude/commands/`.

Claude bridge keeps its stateful tools (`query`, `structured`, `search`, `ping`, `listSessions`). Those earn MCP's keep on different terms.

## Alternatives considered

**Reshape `review` to accept caller-supplied prompts.** Grows bridge surface to sit alongside Claude Code's built-in `/review` family. The host already provides the review path; the bridge doesn't need to.

**Add a generic `claude` raw-passthrough tool.** Cleaner fit than a reshaped `review` if a generic invocation surface is wanted, but no audience signal justifies adding one today. The README's hardened-invocation block plus a BYOS skill template covers shell-equipped hosts; hosts without shell access fall back to their host's primary chat surface.

**Keep bundled prompts.** Trades against the speed-mismatch principle.

## Consequences

- **Removed**: `src/tools/review.ts`, prompt files, related tests, tool registration. Also `src/utils/git.ts` (review was its sole consumer) and the `CLAUDE_REVIEW_MODEL` / `CLAUDE_REVIEW_EFFORT` env vars.
- **Bridge surface**: 5 tools (`query`, `structured`, `search`, `ping`, `listSessions`).
- **Documentation**: README adds a "Code review with this CLI" section that ships the hardened invocation plus a Claude Code skill template. The template is documentation, not code; the bridge does not maintain it as a runtime artifact.
- **Bounded loss**: remote MCP clients without shell access lose the bridge-mediated path to claude-as-reviewer. Mitigated by host built-ins (Claude Code) where applicable; hosts without either built-ins or shell access fall back to the host's primary chat surface.
- **Version bump**: minor (0.5.1 → 0.6.0). Pre-1.0; breaking changes ride on minor bumps. See CHANGELOG for the BREAKING marker.

## Cross-references

- [README § Code review with this CLI](../../README.md#code-review-with-this-cli)
- [CHANGELOG v0.6.0](../../CHANGELOG.md)
