# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

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
