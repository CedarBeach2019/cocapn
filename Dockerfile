# ── Stage 1: Builder ──────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM node:22 AS builder

WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json package-lock.json* ./
COPY packages/cli/package.json packages/cli/
COPY packages/local-bridge/package.json packages/local-bridge/
COPY packages/protocols/package.json packages/protocols/
COPY packages/cloud-agents/package.json packages/cloud-agents/
COPY packages/create-cocapn/package.json packages/create-cocapn/
COPY packages/ui/package.json packages/ui/
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
FROM node:22-slim

LABEL maintainer="Superinstance <team@superinstance.com>"
LABEL description="Cocapn — self-hosted AI agent runtime"
LABEL org.opencontainers.image.source="https://github.com/CedarBeach2019/cocapn"

# Install runtime-only system deps (git for brain sync, curl for health checks)
RUN apt-get update && \
    apt-get install -y --no-install-recommends git curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace manifests
COPY package.json ./
COPY packages/cli/package.json packages/cli/
COPY packages/local-bridge/package.json packages/local-bridge/
COPY packages/protocols/package.json packages/protocols/
COPY packages/cloud-agents/package.json packages/cloud-agents/
COPY packages/create-cocapn/package.json packages/create-cocapn/
COPY packages/ui/package.json packages/ui/
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

# Brain volume — Git-backed agent memory
VOLUME /app/brain

# Environment variables
ENV COCAPN_MODE=local \
    COCAPN_PORT=3100 \
    COCAPN_BRAIN_DIR=/app/brain \
    DOCKER_CONTAINER=true \
    NODE_ENV=production

# Expose bridge WebSocket + HTTP
EXPOSE 3100

# Health check (matches local-bridge /health endpoint)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fs http://localhost:3100/health || exit 1

CMD ["node", "packages/cli/bin/cocapn.js", "start"]
