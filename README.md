<div align="center">

# Cocapn

### *Self-hosted AI agent with persistent memory.*

Run an AI agent locally. It remembers your context across sessions, ships to Cloudflare Workers, and coordinates with other agents. No cloud dependency, no vendor lock-in.

[![CI](https://github.com/CedarBeach2019/cocapn/actions/workflows/ci.yml/badge.svg)](https://github.com/CedarBeach2019/cocapn/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/cocapn.svg)](https://www.npmjs.com/package/cocapn)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[Live Demo](https://cocapn-agent.magnus-digennaro.workers.dev) ·
[Docs](https://docs.cocapn.app) ·
[Contributing](CONTRIBUTING.md)

</div>

## What is Cocapn?

Cocapn is a **self-hosted AI agent runtime** — not a code editor plugin, not a cloud service.

- Your agent runs **locally** (Node.js) with all memory stored in **Git repos**
- It remembers facts, preferences, and personality across every session
- Optional Cloudflare Workers deployment for cloud features
- Multiple agents can coordinate via the A2A fleet protocol

**Quick start:**

```bash
npx create-cocapn my-agent
cd my-agent
cocapn start
```

**From source:**

```bash
git clone https://github.com/CedarBeach2019/cocapn.git
cd cocapn && npm install && npm run build
cd packages/cli && node bin/cocapn.js init ~/.cocapn
node bin/cocapn.js start
```

Open `localhost:8787`, chat, close it, restart — your agent remembers everything.

## Is It Real?

Yes. Here's the proof:

- **[Live instance](https://cocapn-agent.magnus-digennaro.workers.dev)** running on Cloudflare Workers
- **129 test files** (unit + integration) across the monorepo
- **[CI pipeline](https://github.com/CedarBeach2019/cocapn/actions/workflows/ci.yml)** testing Node 18, 20, 22 on every push

## How It Compares

| | **Cocapn** | **Aider** | **Cline** | **Cursor** |
|--|-----------|----------|----------|-----------|
| Self-hosted | Yes | Yes | Yes (VS Code) | No (cloud) |
| Persistent memory | Git-backed Brain | File-based | File-based | Session only |
| Offline-first | Yes | Yes | Partial | No |
| Fleet coordination | A2A protocol | None | None | None |
| Plugin system | npm skills + sandbox | None | Extensions | Extensions |
| Cloud deploy | Cloudflare Workers | None | None | Included |
| Vendor lock-in | None (MIT) | Apache-2 | MIT | Proprietary |

Cocapn is an **agent runtime**, not a coding assistant. It's built for agents that live, remember, and coordinate — not just autocomplete code.

## Features

- **Persistent Memory** — Git-backed Brain stores facts, procedures, and personality. Version-controlled, auditable, fully yours.
- **Self-Assembly** — `cocapn start` detects your project and configures itself. No boilerplate.
- **Plugin System** — Extend with npm packages. Skills run hot (in-process) or cold (sandboxed). Permissions are explicit.
- **Fleet Protocol** — Multiple agents coordinate via A2A (Agent-to-Agent). Distribute tasks and share context.
- **Zero Lock-in** — Data lives in Git repos on your machine. Cloud is optional.

## Templates

| Template | Focus |
|----------|-------|
| `bare` | Minimal, start from scratch |
| `dmlog` | TTRPG game console |
| `makerlog` | Developers & manufacturers |
| `studylog` | Education & research |
| `businesslog` | Enterprise deployments |
| `cloud-worker` | Cloudflare Workers only |
| `web-app` | Full-stack web apps |

```bash
cocapn init --template makerlog
```

## CLI

| Command | What it does |
|---------|-------------|
| `cocapn init` | Initialize a project (detect stack, self-assemble) |
| `cocapn start` | Start the local bridge |
| `cocapn deploy` | Deploy to Cloudflare Workers |
| `cocapn status` | Show bridge and agent status |
| `cocapn plugin install` | Install a plugin from npm |
| `cocapn skill load` | Load a skill into the bridge |
| `cocapn template install` | Install a template |
| `cocapn health` | Health check (local + cloud) |

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, code style, and PR guidelines.

## License

MIT — see [LICENSE](LICENSE) for details.

Fork of [superinstance/cocapn](https://github.com/superinstance/cocapn).

---

<div align="center">

**Built by [Superinstance](https://superinstance.com)**

</div>
