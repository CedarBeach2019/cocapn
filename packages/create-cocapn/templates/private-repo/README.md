# cocapn-starter

> **Clone this repo. It's alive.**

Your personal AI agent. Code, memory, personality — all in Git. Yours forever.

---

## Quick Start (3 steps)

```bash
# 1. Clone and enter
git clone https://github.com/YOU/cocapn-starter.git my-agent
cd my-agent

# 2. Add your LLM key
cp .env.local.example .env.local
# Edit .env.local: add DEEPSEEK_API_KEY=sk-...

# 3. Start your agent
npm install && npm start
```

Your agent is running at `ws://localhost:3100`.

---

## What is Cocapn?

Cocapn is a paradigm: **the repo IS the agent.**

Not "an agent that works on a repo" — the repo itself is a living entity.
Its code, AI, knowledge, wiki, and personality all grow together in Git.
Clone it, it works. Deploy anywhere.

### Architecture

```
Private repo (brain)              Public repo (face)
─────────────────────             ──────────────────
cocapn/                           public/
  soul.md    → personality          index.html  → chat UI
  config.yml → settings             styles.css  → theme
  memory/    → knowledge            assets/     → avatar
  wiki/      → long-form docs     cocapn/
  plugins/   → extensions           soul.md     → public persona
knowledge/                        wrangler.toml  → deploy config
notifications.json
webhooks.json

Git is the database. No external services required.
```

## Deployment

| Option | Command | Where |
|--------|---------|-------|
| Local | `npm start` | Your machine |
| Docker | `docker-compose up` | Any container host |
| Cloudflare | `npm run deploy` | Edge network |

## Customization

### Personality
Edit `cocapn/soul.md` — this is your agent's brain:
- Change `tone`, `model`, `maxTokens` in the frontmatter
- Rewrite the identity section to change who your agent is
- Add knowledge sections for domain expertise

### Configuration
Edit `cocapn/config.yml`:
- Switch LLM providers (deepseek, openai, anthropic)
- Adjust memory limits and sync intervals
- Enable fleet coordination for multi-agent setups

### Memory
Your agent learns over time:
- `memory/facts.json` — Key-value facts about you
- `memory/memories.json` — Conversation memories with confidence decay
- `memory/procedures.json` — Learned workflows

### Wiki
Add `.md` files to `cocapn/wiki/` for persistent knowledge:
- Project documentation
- Domain expertise
- Decision logs

## Privacy

- `private.*` facts never leave this repo
- `.env.local` holds secrets (gitignored)
- Public repo gets only non-private data
- You own everything — no cloud lock-in

## Learn More

- [Cocapn Documentation](https://github.com/CedarBeach2019/cocapn)
- [Architecture Guide](https://github.com/CedarBeach2019/cocapn/blob/main/docs/ARCHITECTURE.md)
- [Verticals: DMlog, Fishinglog, Deckboss](https://github.com/CedarBeach2019/cocapn/tree/main/packages/templates)

---

*Powered by [Cocapn](https://github.com/CedarBeach2019/cocapn) — The repo IS the agent.*
