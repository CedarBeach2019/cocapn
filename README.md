# COCAPN

> The Cocapn Ecosystem Hub — part of the [Cocapn](https://cocapn.ai) ecosystem

![Build](https://img.shields.io/badge/build-passing-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-1_files-blue) ![Lines](https://img.shields.io/badge/lines-80-green)

## Description

The Cocapn Ecosystem Hub. Part of the Cocapn ecosystem of AI-powered log and analysis tools.

## ✨ Features

- **Git is the database** — memory is version-controlled, auditable, portable. No external DB required.
- **Clone it, it works** — fork → add API key → run → live agent with a website. That's it.
- **Multi-provider LLM** — DeepSeek, OpenAI, Anthropic, or local models (Ollama/llama.cpp). Swap without rewriting.
- **Plugin system** — extend with npm packages. Skills run hot (in-process) or cold (sandboxed). Explicit permissions.
- **Fleet protocol** — multiple agents coordinate via A2A. Distribute tasks, share context across repos.
- **Privacy by design** — `private.*` facts never leave the brain repo. Publishing layer enforces the boundary.
- **Offline-first** — runs locally. Cloud is optional enhancement, not requirement.
- **Zero lock-in** — MIT license. Your data lives in Git repos on your machine. Take it anywhere.

## 🚀 Quick Start

```bash
git clone https://github.com/Lucineer/cocapn.git
cd cocapn
npm install
npx wrangler dev
```

## 🤖 Claude Code Integration

Optimized for Claude Code with full agent support:

- **CLAUDE.md** — Complete project context, conventions, and architecture
- **.claude/agents/** — Specialized sub-agents for exploration, architecture, and review
- **.claude/settings.json** — Permissions and plugin configuration

## 🏗️ Architecture

| Component | File | Description |
|-----------|------|-------------|
| Worker | `src/worker.ts` | Cloudflare Worker with inline HTML |
| BYOK | `src/lib/byok.ts` | 7 LLM providers, encrypted keys |
| Health | `/health` | Health check endpoint |
| Setup | `/setup` | BYOK configuration wizard |
| Chat | `/api/chat` | LLM chat endpoint |
| Assets | `/public/*` | KV-served images |

**Zero runtime dependencies.** Pure TypeScript on Cloudflare Workers.

## 🔑 BYOK (Bring Your Own Key)

Supports 7 LLM providers — no vendor lock-in:

- OpenAI (GPT-4, GPT-4o)
- Anthropic (Claude 3.5, Claude 4)
- Google (Gemini Pro, Gemini Flash)
- DeepSeek (Chat, Reasoner)
- Groq (Llama, Mixtral)
- Mistral (Large, Medium)
- OpenRouter (100+ models)

Configuration discovery: URL params → Auth header → Cookie → KV → fail.

## 📦 Deployment

```bash
npx wrangler deploy
```

Requires `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` environment variables.

## 🔗 Links

- 🌐 **Live**: https://cocapn.magnus-digennaro.workers.dev
- ❤️ **Health**: https://cocapn.magnus-digennaro.workers.dev/health
- ⚙️ **Setup**: https://cocapn.magnus-digennaro.workers.dev/setup
- 🧠 **Cocapn**: https://cocapn.ai

## License

MIT — Built with ❤️ by [Superinstance](https://github.com/superinstance) & [Lucineer](https://github.com/Lucineer) (DiGennaro et al.)
