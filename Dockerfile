# Multi-stage build for claude-mcp-bridge.
#
# Bundles the Claude Code CLI this server wraps. The container responds to
# MCP `tools/list` introspection without credentials.
#
# Auth for actual tool calls (see src/utils/env.ts):
#   - default: subscription auth via OAuth tokens. Mount the host
#     ~/.claude directory at /home/node/.claude (read/write, UID 1000).
#   - API key: set CLAUDE_BRIDGE_USE_API_KEY=1 and ANTHROPIC_API_KEY in the
#     container env. The bridge passes --bare to the CLI internally.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
COPY prompts ./prompts
RUN npm run build

FROM node:22-alpine
WORKDIR /app

# Claude Code CLI is spawned as a subprocess at tool-call time.
RUN npm install -g @anthropic-ai/claude-code

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/prompts ./prompts

# Drop root. node:22-alpine ships a `node` user (UID 1000); use it.
RUN chown -R node:node /app
USER node

ENTRYPOINT ["node", "dist/index.js"]
