# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Changed

- `npm audit` now reports a clean tree. The production tree inherits an express 5 / hono HTTP stack from `@modelcontextprotocol/sdk`, which serves the SDK's streamable-HTTP and SSE transports; this bridge registers stdio only, so that code never loads. An `overrides` block pins the flagged packages to fixed versions inside the ranges their dependents already declare, and `SECURITY.md` gains a "Dependency Audit Posture" section covering why the findings were unreachable and why overrides do not reach consumers.

## [0.7.0] - 2026-07-31

Upgrade recommended for all users: 0.6.1 and earlier let a crafted `query` prompt execute arbitrary commands.

**Behaviour change**: subprocesses no longer get the CLI's full toolset. A caller that relied on `query` reaching for `Bash`, `Write` or `Edit` will find those absent, and should set the matching `CLAUDE_*_TOOLS` env var to widen the default.

### Security

- **Caller-supplied values can no longer inject CLI flags.** The prompt is passed after a `--` separator, and the session id, model and effort are bound with the `=` form (`--resume=<id>`, `--model=<name>`, `--effort=<level>`). Previously a prompt or session id that looked like a flag was parsed as one: a `query` call whose prompt was a `--settings=` payload carrying a `SessionStart` hook executed an arbitrary command in the caller-supplied `workingDirectory`, and the CLI reported an input error only after the hook had already run. A flag-shaped prompt could also restore the full toolset via `--tools=default`, defeating the restriction below. Tool names are validated as plain identifiers for the same reason.

- **Subprocesses are now restricted to a read-only toolset.** Every spawn passes `--tools`, and the defaults withhold `Bash`, `Write` and `Edit` on every path: `query` and `structured` get `Read Glob Grep`, `search` gets `WebSearch WebFetch`. Operators can widen this per tool via the new env vars below.

  Previously `query` and `structured` passed no tool restriction at all, and the `--allowed-tools` used by `search` and image-`query` does not restrict the toolset (it only grants permission). The practical effect was that a `query` call could execute shell commands in the caller-supplied `workingDirectory`. Verified against CLI 2.1.220 on both auth paths: `--bare` and `--setting-sources ""` bound what *context* the subprocess loads and never restricted its tools.

### Added

- `CLAUDE_QUERY_TOOLS`, `CLAUDE_STRUCTURED_TOOLS` and `CLAUDE_SEARCH_TOOLS` to override the built-in toolset per tool. Accepts a comma or space separated list, `default` for the CLI's full set, or an empty value for no tools.

### Fixed

- `SECURITY.md` claimed the `query` tool "in `--bare` mode has no tool access by default". That was false: `--bare` skips hooks, CLAUDE.md, memory and plugins but leaves the full toolset live. The section now documents the `--tools` vs `--allowed-tools` split and the per-tool defaults.

### Changed

- `spawnClaude` now rejects any argv lacking `--tools`. The restriction is enforced at the subprocess boundary rather than relying on every caller having gone through `buildClaudeArgs`.
- `buildClaudeArgs` takes a required `tools` array in place of the optional `allowedTools`, so no call site can silently omit a tool restriction. Both flags are emitted from that one list: `--tools` bounds the surface, `--allowed-tools` pre-approves it (`WebSearch` and `WebFetch` are not auto-approved and otherwise stall on a permission prompt).
- Bumped `@modelcontextprotocol/sdk` to 1.30.0 and `vitest` to 3.2.7, clearing the vitest UI-server advisory ([GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp)). No direct-dependency advisories remain.

## [0.6.1] - 2026-05-04

### Added

- **Docker image** for container distribution (PR #22). Runs as non-root, suitable for the [Glama](https://glama.ai/) MCP server listing. See `Dockerfile` for the canonical invocation.

### Changed

- ADR-001 reframed from "remove review tool" (historical) to "bridge does not bundle reviewer prompts" (forward-looking principle). Renamed to `docs/decisions/001-no-bundled-prompts.md`. README "Code review" section reworked: three honest sources for the review prompt (built-in REPL command, bridge `query` / `structured` with caller-supplied prompt, direct `claude -p`). PR #21, PR #23.
- Dropped `--disable-slash-commands` from `claude -p` invocations on both auth paths. The flag was redundant: `--bare` (API-key path) disables all skills by design ([anthropics/claude-code#37207](https://github.com/anthropics/claude-code/issues/37207)), and `--setting-sources ""` (subscription path) excludes the user source where commands live. No user-visible behaviour change. PR #23.

## [0.6.0] - 2026-04-26

### Removed

- **BREAKING: `review` tool removed.** Code review now goes through Claude Code's built-in `/review`, `/security-review`, and `/ultrareview` slash commands (in-session) or direct `claude -p` invocation with hardened isolation flags (subprocess). README has the full hardened invocation and a Claude Code skill template.
- Bundled reviewer prompts (`prompts/review-agentic.md`, `prompts/review-quick.md`).
- `CLAUDE_REVIEW_MODEL` and `CLAUDE_REVIEW_EFFORT` env vars (no consumer remains).
- `src/utils/git.ts` and its tests (sole consumer was `review.ts`).

### Changed

- Tool surface is now 5 tools: `query`, `search`, `structured`, `ping`, `listSessions`.
- `package.json` and `server.json` descriptions updated to reflect the reduced surface.

Rationale: [ADR-001](docs/decisions/001-no-bundled-prompts.md). Bridges should accept caller-supplied prompts rather than bundle them; for code review specifically, Claude Code's built-ins cover the in-session path and `claude -p` covers subprocess isolation, leaving no audience for a `review` tool in the bridge.

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
