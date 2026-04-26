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

export const listSessionsDescription = `List active Claude CLI sessions tracked by this server. Returns session metadata (IDs, models, timing, turn counts, cumulative cost) for orchestration. Use to check available sessions before resuming with sessionId. No cost (local lookup only).`;

export const pingDescription = `Health check: verifies Claude CLI is installed and authenticated, reports versions, capabilities, and configuration. No cost (local check only).`;
