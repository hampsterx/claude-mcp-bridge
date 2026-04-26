# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.6.0] - 2026-04-26

### Removed

- **BREAKING: `review` tool removed.** Code review now goes through Claude Code's built-in `/review`, `/security-review`, and `/ultrareview` slash commands (in-session) or direct `claude -p` invocation with hardened isolation flags (subprocess). README has the full hardened invocation and a Claude Code skill template.
- Bundled reviewer prompts (`prompts/review-agentic.md`, `prompts/review-quick.md`).
- `CLAUDE_REVIEW_MODEL` and `CLAUDE_REVIEW_EFFORT` env vars (no consumer remains).
- `src/utils/git.ts` and its tests (sole consumer was `review.ts`).

### Changed

- Tool surface is now 5 tools: `query`, `search`, `structured`, `ping`, `listSessions`.
- `package.json` and `server.json` descriptions updated to reflect the reduced surface.

Rationale: [ADR-001](docs/decisions/001-remove-review-tool.md). Bridges should accept caller-supplied prompts rather than bundle them; for code review specifically, Claude Code's built-ins cover the in-session path and `claude -p` covers subprocess isolation, leaving no audience for a `review` tool in the bridge.

## [0.5.1] - 2026-04-21

### Fixed

- `server.json` description shortened to meet the MCP registry's <=100-char limit (the registry validator rejected v0.5.0's longer description on publish)
- `CLAUDE_MAX_CONCURRENT` default reverted to string `"3"`: the registry's `KeyValueInput` schema requires string defaults regardless of declared `format`, even when `format: "number"`

The v0.5.0 npm tarball shipped with the pre-fix values. This release aligns the published tarball with what the registry actually accepts.

## [0.5.0] - 2026-04-21

### Added

- **MCP registry manifest** (`server.json`) conforming to the MCP registry schema, enabling publication to [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io) (#16)
- `mcpName` field in `package.json` linking the npm package to its registry entry (`io.github.hampsterx/claude-mcp-bridge`)
- Full env var documentation in the manifest: per-tool model overrides (`CLAUDE_QUERY_MODEL`, `CLAUDE_REVIEW_MODEL`, `CLAUDE_SEARCH_MODEL`, `CLAUDE_STRUCTURED_MODEL`), fallback behaviour, concurrency, budget caps, effort controls

### Changed

- **BREAKING: Node.js 22+ required**. Dropped Node 18 and 20 from the CI matrix and support (#14)
- `package.json` description updated to cover code review and web search (previously only mentioned query/structured/health)

## [0.4.1] - 2026-04-13

### Fixed

- **Subscription auth in non-API-key mode**: dropped `--bare` flag that was preventing subscription auth from working correctly (#12)

### Changed

- Extracted shared helpers (`buildEnv`, `buildArgs`, `handleSpawnResult`, `checkErrorPatterns`) to reduce duplication across tool handlers (#13)
- Expanded test coverage to 272 tests (up from 190)
- Updated CI/CD and search tool descriptions

## [0.4.0] - 2026-04-12

### Changed

- **Subscription-first auth**: subprocess no longer forwards `ANTHROPIC_API_KEY` by default. Set `CLAUDE_BRIDGE_USE_API_KEY=1` to opt in to API key auth. Subscription auth (`claude login`) is now the default, preventing accidental API credit consumption.
- Error messages in `checkErrorPatterns` now redacted via `redactSecrets()` before being thrown, preventing secret leakage in error paths
- 190 tests (up from 186)

### Added

- `CLAUDE_BRIDGE_USE_API_KEY` env var for explicit API key auth opt-in
- Extracted DESIGN.md and SECURITY.md from README for better navigation

## [0.3.1] - 2026-04-12

### Added

- Concurrency diagnostics in ping output: `activeCount`, `queueDepth`, `maxConcurrent` from live spawn state
- Auto-scaled agentic review timeout based on diff size (`git diff --numstat`), ranging 3-10 minutes
- Bridge family comparison table in README

### Changed

- Ping `maxConcurrent` reads from spawn.ts state instead of re-parsing env var
- Agentic review timeout defaults to scaled value when no explicit timeout is provided (quick mode unchanged at 120s)
- 186 tests (up from 166)

## [0.3.0] - 2026-04-09

### Added

- Tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) on all tools
- Structured `_meta` on every tool response: `durationMs`, `model`, `sessionId`, `totalCostUsd`, token breakdown
- Rich tool descriptions with capability summaries, cost guidance, and prompt tips
- `listSessions` tool: list active sessions with cumulative cost, turn counts, and timing
- Session tracking: in-memory `SessionStore` with TTL (24h) and LRU eviction (100 sessions)
- Cumulative cost tracking across session turns
- `resetSession` parameter on query tool to clear session state before execution
- Progress heartbeat notifications (`notifications/progress`) for query, review, and search tools
- 166 tests (up from 91)

## [0.2.0] - 2026-04-08

### Added

- Support subscription-based auth alongside API key authentication
- Ping tool detects auth method (API key vs subscription) and reports it

### Changed

- README expanded with full tool reference, configuration tables, and security docs
- README badges for npm version, license, and Node.js requirement

## [0.1.0] - 2026-04-05

### Added

- Initial release
- `query` tool: execute prompts with file context, session resume, sandbox control
- `review` tool: agentic (full-auto) and quick (diff-only) code review
- `search` tool: web search via Claude CLI `--search` flag
- `structured` tool: JSON Schema validated output with Ajv
- `ping` tool: health check and CLI capability detection
- Hardened subprocess environment with explicit env allowlist
- Path sandboxing with realpath boundary checks
- Log redaction for potential secrets in CLI output
- Concurrency limiting (max 3, FIFO queue)
- Model fallback on quota exhaustion (default: o3)
- Session management for multi-turn conversations
- Windows argument escaping support
- CI/CD with GitHub Actions (lint, test, build on Node 18/20/22)
- CI validation on tag push (manual npm publish with OTP)
