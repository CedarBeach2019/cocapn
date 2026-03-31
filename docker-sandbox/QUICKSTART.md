# Cocapn Sandbox — Quickstart

Get a running cocapn agent in under 5 minutes.

## One-Liner Install

```bash
curl -sSL https://raw.githubusercontent.com/CedarBeach2019/cocapn/main/docker-sandbox/install.sh | bash
```

This clones the repo, prompts for your API key, builds the image, and starts the container.

## Manual Setup

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (v20.10+)
- [Docker Compose](https://docs.docker.com/compose/install/) (v2.0+)
- An LLM API key (DeepSeek, OpenAI, or Anthropic)

### Steps

```bash
# 1. Clone the repo
git clone --depth 1 https://github.com/CedarBeach2019/cocapn.git
cd cocapn/docker-sandbox

# 2. Configure your API key
cp .env.example .env
# Edit .env and add your DEEPSEEK_API_KEY (or OPENAI_API_KEY / ANTHROPIC_API_KEY)
nano .env

# 3. Build and start
docker compose up -d --build

# 4. Verify it's running
curl http://localhost:3100/health
```

### Chat with Your Agent

```bash
# Simple chat request
curl -X POST http://localhost:3100/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello! What can you do?"}'

# With streaming
curl -X POST http://localhost:3100/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Tell me about yourself", "stream": true}'
```

### Run the Test Suite

```bash
bash test-sandbox.sh
```

This checks health, chat, memory, and streaming endpoints.

## Customizing

### Change Personality (soul.md)

Create `custom-soul.md` in `docker-sandbox/`:

```markdown
---
name: My Custom Agent
tone: professional
model: gpt-4o
---

# Identity
You are a specialized assistant for [domain].

## Rules
- [Your rules here]
```

Then uncomment the volume mount in `docker-compose.yml`:

```yaml
volumes:
  - ./custom-soul.md:/app/cocapn/soul.md:ro
```

Restart: `docker compose up -d`

### Change LLM Provider

Edit `.env`:

```bash
# Switch to OpenAI
DEEPSEEK_API_KEY=
OPENAI_API_KEY=sk-your-openai-key

# Update config to use gpt-4o
```

And update `default-config.yml` or mount a custom config.

### Test Variations

Create multiple compose overrides to test different configurations:

```bash
# test-openai.yml — OpenAI variant
cp docker-compose.yml test-openai.yml
# Edit to use different env vars and soul
docker compose -f docker-compose.yml -f test-openai.yml up -d
```

### Install Plugins

Mount plugin files into the container:

```yaml
volumes:
  - ./my-plugin/:/app/cocapn/plugins/my-plugin:ro
```

## Monitoring

```bash
# View logs
docker compose logs -f cocapn

# Check health
docker inspect --format='{{.State.Health.Status}}' cocapn-sandbox

# Resource usage
docker stats cocapn-sandbox
```

## Stopping

```bash
docker compose down          # Stop containers, keep data
docker compose down -v       # Stop and delete data volume
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails | Ensure Docker has 4GB+ RAM. Run `docker system prune` if low on space |
| Container exits immediately | Check logs: `docker compose logs cocapn` |
| Health check fails | Verify the port isn't in use: `lsof -i :3100` |
| API key errors | Check `.env` has a valid key with no trailing whitespace |
| Slow responses | LLM latency — try a different model or provider |

## Next Steps

- [Enterprise deployment guide](enterprise.md)
- [Kubernetes manifests](kubernetes/)
- [Main project docs](../docs/ARCHITECTURE.md)
