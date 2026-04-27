# Multi-stage build for claude-mcp-bridge.
#
# Bundles the Claude Code CLI this server wraps. The container responds to
# MCP `tools/list` introspection without credentials; invoking tools requires
# ANTHROPIC_API_KEY (or a mounted ~/.claude auth dir for subscription mode).

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

ENTRYPOINT ["node", "dist/index.js"]
