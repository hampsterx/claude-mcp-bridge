/**
 * Rich tool descriptions for MCP clients.
 *
 * Descriptions include capability summaries, cost guidance, and prompt tips
 * so calling LLMs can make informed tool selection and parameterization decisions.
 *
 * Keep each description at or under 2048 bytes to avoid bloating tool listings.
 */

export const queryDescription = `Execute a prompt via Claude Code CLI with optional file context and session resume. Claude is an AI coding agent that can generate, analyze, refactor, and explain code.

Capabilities: code generation and refactoring, code analysis and explanation, file understanding (text and images), multi-turn conversations via sessionId.

Cost: Default model is Sonnet (~$0.01-0.10/call). Use effort="low" for simple tasks, effort="high" + model="opus" for complex analysis. Set maxBudgetUsd to cap per-call cost (recommended for effort="max" or model="opus").

Tips:
- Set workingDirectory to the target repo for project-aware responses.
- Break complex tasks into focused prompts rather than one large request.
- Resume multi-turn conversations with sessionId from a previous response's metadata.
- Include relevant files via the files parameter for targeted context (text files inlined in prompt, images trigger allowed-tools mode).
- Use noSessionPersistence=true for stateless one-shot calls.`;

export const reviewDescription = `Repo-aware code review powered by Claude Code CLI. Returns structured feedback on code changes with two modes:

- Agentic (default): Claude explores the repo with Read, Grep, Glob, and git tools. Reads changed files, follows imports, and examines related code before reviewing. Best for thorough reviews. Default timeout: 5 minutes.
- Quick (quick: true): Receives only the diff text. Fast single-pass review without repo exploration. Default timeout: 2 minutes.

Cost: Both modes default to Opus (~$0.05-0.15 quick, ~$0.25-0.50 agentic). Override with model parameter. Use maxBudgetUsd to cap cost on large diffs.

Tips:
- Use the focus parameter to direct attention: "security", "performance", "error handling", "test coverage".
- Set workingDirectory to the repo being reviewed (auto-resolves to git root).
- Default reviews uncommitted changes (staged + unstaged). Use base to review a branch diff (e.g. base: "main").
- Prefer agentic mode for important reviews, quick mode for rapid feedback during development.`;

export const searchDescription = `Web search via Claude Code CLI using WebSearch and WebFetch tools. Searches the web and synthesizes a comprehensive answer with source URLs.

Use for: current information, documentation lookups, API references, comparing libraries, and research questions.

Cost: Typically ~$0.02-0.05/search with Sonnet.

Tips:
- Ask specific, focused questions for best results.
- Results include source URLs for verification.
- Use maxResponseLength to control response verbosity.
- Increase timeout for complex research queries that may require multiple web fetches.`;

export const structuredDescription = `Generate JSON conforming to a provided JSON Schema. Uses Claude CLI's native --json-schema flag for validated output (not client-side validation).

Use for: data extraction from text/files, classification, entity parsing, or any task needing machine-parseable output.

Cost: Similar to query (~$0.01-0.10/call). Schema complexity doesn't significantly affect cost.

Tips:
- Pass the JSON Schema as a JSON string in the schema parameter.
- Schema max size: 20KB. Keep schemas focused for reliable output.
- For extraction tasks, include source text via the files parameter or inline in the prompt.`;

export const pingDescription = `Health check: verifies Claude CLI is installed and authenticated, reports versions, capabilities, and configuration. No cost (local check only).`;
