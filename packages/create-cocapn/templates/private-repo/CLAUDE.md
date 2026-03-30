# CLAUDE.md — My Agent

> This agent is powered by [Cocapn](https://github.com/CedarBeach2019/cocapn).

## Structure

- `cocapn/soul.md` — Agent personality (edit this!)
- `cocapn/config.yml` — Agent configuration
- `cocapn/memory/` — Agent's knowledge stores
- `cocapn/wiki/` — Long-form knowledge base

## Commands

```bash
npm start          # Start the agent
npm run chat       # Chat with the agent
npm run status     # Check agent status
npm run onboard    # Interactive onboarding
```

## For Claude Code

When working with this repo:
- Read `cocapn/soul.md` to understand the agent's personality
- Check `cocapn/config.yml` for runtime configuration
- Memory stores are JSON — edit carefully
- Wiki pages are Markdown — edit freely
- Never commit secrets (use `.env.local`)
