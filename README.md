# claude-mcp-bridge

MCP server that wraps [Claude Code CLI](https://github.com/anthropics/claude-code) as a subprocess, exposing code execution, agentic review, web search, and structured output as MCP tools.

Works with any MCP client: Codex CLI, Gemini CLI, Cursor, Windsurf, VS Code, or any tool that speaks MCP.

## Do you need this?

If you're in a terminal agent (Codex CLI, Gemini CLI) with shell access, call Claude Code CLI directly:

```bash
# Quick review of current diff
git diff origin/main...HEAD | claude -p --bare "Review this diff for bugs and security issues"

# Agentic review (Claude reads files, follows imports, checks tests)
claude -p --bare --allowed-tools "Read Grep Glob Bash(git diff:*,git log:*,git show:*)" \
  "Review the changes on this branch vs main"

# Analyze specific files
claude -p --bare --allowed-tools "Read" "Analyze src/utils/parse.ts for edge cases"

# With budget cap
claude -p --bare --max-budget-usd 0.50 "Is this retry logic sound?"
```

**Tips:** `--bare` skips hooks, memory, and plugins for clean subprocess use. `--allowed-tools` controls exactly what Claude can access (no `--dangerously-skip-permissions` needed). `--max-budget-usd` prevents runaway costs. Output includes `total_cost_usd` and token usage.

**Use this MCP bridge instead when:**
- Your client has no shell access (Cursor, Windsurf, Claude Desktop, VS Code)
- You need structured output with native `--json-schema` validation
- You need session resume across calls (`--resume SESSION_ID`)
- You need concurrency management and security hardening
- You want cost metadata surfaced in MCP responses

