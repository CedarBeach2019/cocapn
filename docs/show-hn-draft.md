# Show HN: Cocapn – Open-source AI agent runtime with persistent memory

**TL;DR:** Self-hosted AI agent that remembers everything across sessions. Git-backed memory, plugin system, fleet protocol, Cloudflare Workers deploy. MIT license.

## What it is

Cocapn is a self-hosted AI agent runtime — not a code editor plugin, not a cloud service. Your agent runs locally (Node.js) with all memory stored in Git repos.

The key insight: **most AI agents lose context when you close the window.** Cocapn's "Brain" stores facts, procedures, and personality in a Git repo. Open it, chat, close it, come back tomorrow — it remembers.

## What makes it different

- **Git-backed Brain** — All memory is version-controlled. You can diff what your agent learned, roll back, branch. No vector DB required.
- **Plugin system** — Extend with npm packages. Skills run hot (in-process) or cold (sandboxed). Permissions are explicit.
- **Fleet protocol** — Multiple agents coordinate via A2A (Agent-to-Agent). Distribute tasks and share context.
- **Zero lock-in** — Data lives in Git repos on your machine. Cloud is optional. MIT license.
- **Cloudflare Workers** — Deploy to the edge if you want. One command.

## Quick start

```bash
npx create-cocapn my-agent
cd my-agent
cocapn start
```

Open localhost:3100, chat, close it, restart — your agent remembers everything.

## Live demo

https://cocapn-agent.magnus-digennaro.workers.dev — running on Cloudflare Workers with DeepSeek.

## How it compares

| | Cocapn | Aider | Cline | Cursor |
|--|--------|-------|-------|--------|
| Persistent memory | Git-backed Brain | File-based | File-based | Session only |
| Fleet coordination | A2A protocol | None | None | None |
| Plugin system | npm + sandbox | None | Extensions | Extensions |
| Self-hosted | Yes | Yes | VS Code | No (cloud) |
| Vendor lock-in | None (MIT) | Apache-2 | MIT | Proprietary |

## What's inside

- 119 commits, 423 TypeScript files, 104K lines
- 125 test files across 5 packages
- 12 packages: core runtime, CLI, protocols, cloud agents, templates
- CI pipeline (Node 18/20/22), ESLint, Prettier, strict TypeScript
- Security audit completed, SECURITY.md with vulnerability reporting

## Templates

Pre-built personalities for different use cases:
- `dmlog` — TTRPG game console
- `studylog` — Education & research
- `makerlog` — Developers & makers
- `businesslog` — Enterprise deployments

## What I'd love feedback on

1. Is Git-backed memory a good idea, or is everyone happy with vector DBs?
2. Would you use a multi-tenant version for customer-facing AI agents?
3. What's missing that would make this useful for your workflow?

## Links

- **GitHub:** https://github.com/CedarBeach2019/cocapn
- **Live Demo:** https://cocapn-agent.magnus-digennaro.workers.dev
- **Docs:** https://github.com/CedarBeach2019/cocapn/tree/main/docs

Built by [Superinstance](https://superinstance.com).
