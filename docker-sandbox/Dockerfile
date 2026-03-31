# ── Stage 1: Builder ──────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json package-lock.json* ./
COPY packages/cli/package.json packages/cli/
COPY packages/local-bridge/package.json packages/local-bridge/
COPY packages/protocols/package.json packages/protocols/
COPY packages/cloud-agents/package.json packages/cloud-agents/
COPY packages/create-cocapn/package.json packages/create-cocapn/
COPY packages/ui-minimal/package.json packages/ui-minimal/
COPY packages/templates/package.json packages/templates/
COPY packages/schemas/package.json packages/schemas/

# Install all workspace dependencies
RUN npm install --ignore-scripts 2>/dev/null || npm install

# Copy full source
COPY . .

# Build all packages
RUN npm run build

# ── Stage 2: Runtime ─────────────────────────────────────────────────
FROM node:22-alpine

LABEL maintainer="Superinstance <team@superinstance.com>"
LABEL description="Cocapn — self-hosted AI agent runtime (sandbox)"
LABEL org.opencontainers.image.source="https://github.com/CedarBeach2019/cocapn"

# Runtime deps: git for brain sync, curl for health checks
RUN apk add --no-cache git curl ca-certificates

WORKDIR /app

# Copy workspace manifests for production install
COPY package.json ./
COPY packages/cli/package.json packages/cli/
COPY packages/local-bridge/package.json packages/local-bridge/
COPY packages/protocols/package.json packages/protocols/
COPY packages/cloud-agents/package.json packages/cloud-agents/
COPY packages/create-cocapn/package.json packages/create-cocapn/
COPY packages/ui-minimal/package.json packages/ui-minimal/
COPY packages/templates/package.json packages/templates/
COPY packages/schemas/package.json packages/schemas/

# Install production dependencies only
COPY --from=builder /app/package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts 2>/dev/null || npm install --omit=dev

# Copy built artifacts
COPY --from=builder /app/packages/cli/dist/ packages/cli/dist/
COPY --from=builder /app/packages/cli/bin/ packages/cli/bin/
COPY --from=builder /app/packages/local-bridge/dist/ packages/local-bridge/dist/
COPY --from=builder /app/packages/protocols/dist/ packages/protocols/dist/
COPY --from=builder /app/packages/cloud-agents/dist/ packages/cloud-agents/dist/
COPY --from=builder /app/packages/templates/ packages/templates/
COPY --from=builder /app/packages/schemas/ packages/schemas/

# Create cocapn data directories
RUN mkdir -p /app/cocapn/memory /app/cocapn/wiki /app/cocapn/knowledge \
    /app/cocapn/plugins /app/cocapn/tasks /app/cocapn/agents

# Default config and soul
COPY docker-sandbox/default-config.yml /app/cocapn/config.yml
COPY docker-sandbox/default-soul.md /app/cocapn/soul.md

# Brain volume — persistent agent memory
VOLUME /app/cocapn

# Environment defaults
ENV COCAPN_PORT=3100 \
    COCAPN_MODE=private \
    COCAPN_BRAIN_DIR=/app/cocapn \
    DOCKER_CONTAINER=true \
    NODE_ENV=production

# Expose bridge WebSocket + HTTP
EXPOSE 3100

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fs http://localhost:3100/health || exit 1

CMD ["node", "packages/cli/bin/cocapn.js", "serve", "--port", "3100"]
