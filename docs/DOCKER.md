# Docker Deployment

Run cocapn in Docker — fully self-hosted, air-gapped capable, multi-arch.

## Quick Start

```bash
# Build the image
docker build -t cocapn .

# Run with a brain volume
mkdir -p brain
docker run -d \
  --name cocapn \
  -p 3100:3100 \
  -v ./brain:/app/brain \
  -e DEEPSEEK_API_KEY=your-key \
  cocapn
```

The bridge starts at `http://localhost:3100` with WebSocket + HTTP.

## Docker Compose

```bash
# Production
docker compose up cocapn -d

# Development (live reload with nodemon)
docker compose up cocapn-dev -d
```

### Environment Variables

Create a `.env` file next to `docker-compose.yml`:

```env
# Required — at least one LLM provider
DEEPSEEK_API_KEY=sk-...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Optional
COCAPN_MODE=local          # local | hybrid
COCAPN_PORT=3100
COCAPN_BRAIN_DIR=/app/brain
```

## Multi-Arch Build

Build for both amd64 (servers) and arm64 (Jetson, Apple Silicon):

```bash
# Build for current platform
docker build -t cocapn .

# Build for both architectures
docker buildx build --platform linux/amd64,linux/arm64 -t cocapn .

# Build and push to registry
docker buildx build --platform linux/amd64,linux/arm64 -t your-registry/cocapn:latest --push .
```

## Air-Gapped Deployment

No network required after building. Copy the image to the target machine:

```bash
# On build machine — save image to tar
docker build -t cocapn .
docker save cocapn | gzip > cocapn.tar.gz

# Transfer via USB, SCP, air-gap, etc.
scp cocapn.tar.gz target-machine:~/

# On target machine — load and run
docker load < cocapn.tar.gz
mkdir -p brain
docker run -d \
  --name cocapn \
  -p 3100:3100 \
  -v ./brain:/app/brain \
  -e AIR_GAPPED=1 \
  cocapn
```

In air-gapped mode, cocapn detects `AIR_GAPPED=1` and disables all outbound network calls. Use a local LLM endpoint (e.g., Ollama) for inference:

```bash
docker run -d \
  --name cocapn \
  -p 3100:3100 \
  -v ./brain:/app/brain \
  -e AIR_GAPPED=1 \
  -e LLM_BASE_URL=http://host.docker.internal:11434 \
  -e LLM_PROVIDER=ollama \
  -e LLM_MODEL=llama3 \
  cocapn
```

## Custom LLM Provider

Configure any OpenAI-compatible endpoint:

```bash
docker run -d \
  --name cocapn \
  -p 3100:3100 \
  -v ./brain:/app/brain \
  -e LLM_PROVIDER=custom \
  -e LLM_BASE_URL=https://your-llm-endpoint/v1 \
  -e LLM_API_KEY=your-key \
  -e LLM_MODEL=your-model \
  cocapn
```

Or use Ollama for fully local inference:

```bash
docker run -d \
  --name cocapn \
  -p 3100:3100 \
  --add-host=host.docker.internal:host-gateway \
  -v ./brain:/app/brain \
  -e LLM_PROVIDER=ollama \
  -e LLM_BASE_URL=http://host.docker.internal:11434 \
  -e LLM_MODEL=deepseek-r1:8b \
  cocapn
```

## Health Check

The container includes a built-in health check hitting `/health`:

```bash
# Check container health
docker ps --format "table {{.Names}}\t{{.Status}}"

# Manual health check
curl http://localhost:3100/health
```

Orchestrators (Kubernetes, Docker Swarm, Nomad) can use the health check for automatic restarts and load balancing.

## Volumes

| Host path | Container path | Purpose |
|-----------|---------------|---------|
| `./brain` | `/app/brain` | Git-backed agent memory (facts, wiki, soul) |

The brain volume persists all agent state across container restarts and upgrades.

## Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 3100 | HTTP/WS | Bridge WebSocket server + HTTP API |

## Networking

To reach services on the host (e.g., local Ollama):

```bash
# Docker Compose — add to service
extra_hosts:
  - "host.docker.internal:host-gateway"

# Docker CLI
docker run --add-host=host.docker.internal:host-gateway ...
```
