# CLAUDE.md — Cocapn Development Guide

> **For Claude Code and agentic workers.** This file is the single source of truth for conventions, architecture, and workflows.

---

## Project Overview

**Cocapn** is an open-source agent runtime and fleet protocol. Users run a local bridge that manages AI agents with persistent memory (Git-backed "Brain"), module system, and fleet communication. Themed deployments on custom domains (personallog.ai, makerlog.ai, DMlog.ai, etc.) are powered by cocapn as white-label instances on Cloudflare Workers.

### Domain Portfolio

| Domain | Focus | Onboarding |
|--------|-------|------------|
| personallog.ai | Generic personal assistant | Simplest |
| businesslog.ai | Professional/enterprise | Docker defaults, enterprise add-ons |
| makerlog.ai | Developers & manufacturers | Dev templates |
| studylog.ai | Education & research | Education templates |
| DMlog.ai | TTRPG | Game console UI |
| activelog.ai | Health & fitness | Fitness tracking |
| activeledger.ai | Finance & crypto | Finance tools |
| fishinglog.ai | Commercial & recreational fishing | **Fork: commercial vs recreational** |
| playerlog.ai | Video gamers | Gaming focus |
| reallog.ai | Journalists & documentarians | Media tools |

**All features are installable on any domain.** Templates are curated starting points with personality, prompts, and default modules pre-configured.

---

## Repository Structure

```
cocapn/
├── packages/
│   ├── local-bridge/     # Core bridge (Node.js, WebSocket, Git, agents)
│   │   ├── src/
│   │   │   ├── bridge.ts          # Bridge lifecycle (412 lines)
│   │   │   ├── ws/server.ts       # WebSocket server (582 lines)
│   │   │   ├── agents/            # Agent registry, router, spawner
│   │   │   ├── analytics/         # Event tracking, metrics, export
│   │   │   ├── auth/              # (in cloud-agents) signup/signin/JWT
│   │   │   ├── brain/             # Memory: facts, wiki, soul, procedures
│   │   │   ├── cli/               # Init wizard, CLI commands
│   │   │   ├── cloud-bridge/      # Cloudflare Workers integration
│   │   │   ├── config/            # YAML config loading, types
│   │   │   ├── git/               # Git sync, publishing
│   │   │   ├── handlers/          # Request/response handlers
│   │   │   ├── mcp-client/        # Connect to external MCP servers
│   │   │   ├── modules/           # Module manager, sandbox, hooks
│   │   │   ├── plugins/           # Plugin system, loader, permissions
│   │   │   ├── publishing/        # Profile export, templates, sanitizer
│   │   │   ├── scheduler/         # Cron-based task scheduling
│   │   │   ├── security/          # JWT, fleet keys, age encryption
│   │   │   ├── skills/            # Built-in skill system
│   │   │   ├── templates/         # Template installer/manager
│   │   │   ├── tools/             # Built-in tools (file, shell, git, etc.)
│   │   │   ├── tree-search/       # Semantic code search
│   │   │   └── webhooks/          # Event system, GitHub/Slack/Discord handlers
│   │   └── tests/                 # Unit + integration tests (100+ files)
│   ├── cloud-agents/      # Cloudflare Workers
│   │   └── src/
│   │       ├── admiral.ts         # AdmiralDO Durable Object
│   │       └── auth/              # Signup, signin, JWT, rate limiting
│   ├── cli/               # Command-line interface
│   │   └── src/commands/          # deploy, init, skills, start, status, etc.
│   ├── create-cocapn/     # Scaffolding package (npm create cocapn)
│   ├── ui/                # React + Vite WebSocket client
│   ├── protocols/         # MCP (client/server) + A2A protocol
│   ├── modules/           # Reference modules
│   ├── templates/         # 7 built-in templates (bare, dmlog, makerlog, etc.)
│   └── schemas/           # JSON schemas (enforced via SchemaValidator)
├── e2e/                  # Playwright end-to-end tests
├── docs/
│   ├── site/              # Documentation site (8 HTML pages)
│   ├── designs/           # 13 design documents
│   ├── superpowers/plans/ # Executable implementation plans
│   └── DEVELOPMENT_PLAN.md
├── onboard.md             # Project introduction
└── CLAUDE.md              # THIS FILE
```

---

## Monorepo Commands

```bash
# Working directory
cd /tmp/cocapn

# Local bridge (most work happens here)
cd packages/local-bridge
npm install
npx vitest run                    # Run tests
npx vitest run tests/brain.test   # Single test file
npx tsc --noEmit                  # Type check

# CLI
cd packages/cli
npm install
npm run build                     # Build CLI
cocapn --help                     # Show CLI commands

# Protocols
cd packages/protocols
npx vitest run

# Cloud agents
cd packages/cloud-agents
npx tsc --noEmit

# Templates
cd packages/templates
ls                                # View 7 built-in templates

# E2E tests
cd e2e
npx playwright test               # Run E2E tests

# Deploy to Cloudflare Workers
cd packages/cli
cocapn deploy                     # Deploy current project
```

---

## Test Status

- **104 test files** across packages (unit + integration)
- **E2E tests** via Playwright: bridge-startup, chat-flow, cloud-connector, skill-lifecycle, tree-search
- Most tests pass — some age-encryption tests fail on ARM64 (platform-specific WASM issue, not code bugs)
- Run tests: `cd packages/local-bridge && npx vitest run`

---

## Architecture Decisions

1. **Git is the database** — all agent memory (facts, wiki, soul, procedures) lives in Git repos. Two repos per user: private (brain) + public (published content).
2. **Offline-first** — the bridge runs locally; cloud is optional enhancement.
3. **WebSocket JSON-RPC** — the bridge protocol. Typed messages for streaming, JSON-RPC for requests.
4. **MCP for agent tools** — agents get tools via Model Context Protocol. Can connect to external MCP servers via `mcp-client/`.
5. **A2A for fleet communication** — inter-bridge communication via HTTP POST + fleet JWT.
6. **AdmiralDO** — Cloudflare Durable Object for cloud state (registry, message queue, task management).
7. **Plugin system** — Skills distributed as npm packages with `cocapn-plugin.json` manifest. Permissions-based sandbox for hot/cold skills.
8. **Webhook system** — Event-driven architecture with GitHub/Slack/Discord handlers, HMAC signature verification, retry logic.
9. **Analytics** — Event collection (agent.invoked, tool.used, etc.), aggregation, and export for fleet optimization.
10. **Template system** — 7 built-in templates (bare, businesslog, cloud-worker, dmlog, makerlog, studylog, web-app) with soul.md, config, and default modules.
11. **Auth on Workers** — Cloudflare Workers handle signup/signin with JWT, rate limiting, and secure session management.
12. **Module system** — 4 types: brain (modify behavior), ui (add UI), cloud (add cloud features), tool (add MCP tools). Installed via git submodules.
13. **Privacy by design** — `private.*` facts never leave the private repo. Env filtering strips secrets from agent contexts.
14. **TypeScript strict** — all packages use `"strict": true` in tsconfig.
15. **Zero external runtime deps for protocols** — MCP and A2A packages have no dependencies.

---

## Code Conventions

- **ESM only** — all packages use `"type": "module"` in package.json
- **Absolute imports** — use `../src/foo.js` (with `.js` extension for ESM)
- **Vitest** — test framework. Tests go in `tests/` next to `src/`.
- **No console.log in production** — use the Logger class (or `console.info`/`console.warn` with `[prefix]`).
- **YAML config** — `cocapn.yml` (public) and `cocapn-private.yml` (private, gitignored).
- **Schemas enforced** — all JSON files validated against schemas in `schemas/` via SchemaValidator.

---

## Major Features

### Plugin System
Plugins are npm packages that extend cocapn with new skills. Each plugin has a `cocapn-plugin.json` manifest:

```json
{
  "name": "cocapn-plugin-example",
  "version": "1.0.0",
  "description": "Example plugin",
  "author": "Your Name",
  "skills": [
    {
      "name": "my-skill",
      "entry": "skills/my-skill.js",
      "type": "hot",
      "triggers": ["do something"],
      "description": "Does something useful"
    }
  ],
  "permissions": ["network:api.example.com", "fs:read:~/documents"]
}
```

**Permission types**:
- `network:HOST` — Access specific host (or `*` for wildcard)
- `fs:read:PATH` — Read files under path
- `fs:write:PATH` — Write files under path
- `shell:COMMAND` — Execute specific shell command
- `env:VAR_NAME` — Read environment variable
- `admin` — Bridge administration

**Skill types**:
- **Hot skills** — Load in bridge process, always available
- **Cold skills** — Run on-demand in sandbox with resource limits

### Fleet Protocol
Multi-agent coordination via A2A (Agent-to-Agent) protocol:

- **Fleet JWT** — Signed identity tokens for inter-bridge communication
- **Message routing** — Direct or via AdmiralDO registry
- **Heartbeats** — Keep-alive and presence detection
- **Task distribution** — Distribute work across fleet members

See `docs/fleet.md` for protocol details.

### Webhook System
Event-driven architecture with external integrations:

**Event types**: `agent.invoked`, `task.completed`, `fact.remembered`, `error.thrown`, etc.

**Handlers**:
- **GitHub** — Push events, issue comments, PR reviews
- **Slack** — Messages, reactions, commands
- **Discord** — Messages, interactions

**Features**:
- HMAC signature verification
- Retry logic with exponential backoff
- Event filtering and routing
- Rate limiting

### Analytics
Track and analyze agent behavior:

**Events collected**:
- `agent.invoked` — Agent called with intent
- `tool.used` — Tool execution (with timing)
- `skill.executed` — Skill execution (with timing)
- `task.completed` — Task lifecycle events
- `error.thrown` — Error occurrences

**Export formats**: JSON, CSV, Prometheus metrics

### MCP Client Mode
Connect to external MCP servers and use their tools:

```yaml
# cocapn.yml
mcpServers:
  filesystem:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp/documents"]
  github:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_TOKEN: "secret:GITHUB_TOKEN"
```

Tools from external MCP servers are automatically available to agents.

### Template System
7 built-in templates for different use cases:

| Template | Focus | Best For |
|----------|-------|----------|
| `bare` | Minimal | Custom setups |
| `businesslog` | Enterprise | Business/enterprise deployments |
| `cloud-worker` | Cloudflare | Workers-only deployments |
| `dmlog` | TTRPG | Game console, campaign management |
| `makerlog` | Developers | Dev tools, project management |
| `studylog` | Education | Research, learning, notes |
| `web-app` | Web apps | Full-stack web applications |

Install with: `cocapn init --template dmlog`

### Deploy Flow
Deploy to Cloudflare Workers with `cocapn deploy`:

```bash
cocapn deploy --env production              # Deploy to production
cocapn deploy --env staging --dry-run       # Preview deployment
cocapn deploy --secrets .secrets.json       # Include secrets
cocapn deploy --verify                      # Verify deployment health
```

**Deployment process**:
1. Build Worker bundle (Vite)
2. Run tests (if `--tests` flag)
3. Upload to Cloudflare (wrangler publish)
4. Verify deployment health checks
5. Rollback on failure

**Configuration**: `cocapn.deploy.yml` in project root.

### Auth System (Cloudflare Workers)
Authentication and authorization on Workers:

**Routes**:
- `POST /auth/signup` — Register new account
- `POST /auth/signin` — Sign in with email/password
- `POST /auth/signout` — Sign out
- `POST /auth/refresh` — Refresh JWT token
- `GET /auth/me` — Get current user

**Features**:
- JWT tokens with expiration
- Rate limiting (prevents brute force)
- Secure password hashing (Argon2)
- Session management via AdmiralDO

See `packages/cloud-agents/src/auth/` for implementation.

### E2E Tests
Playwright end-to-end tests:

**Test suites**:
- `smoke.test.ts` — Basic smoke tests
- `bridge-startup.test.ts` — Bridge initialization
- `chat-flow.test.ts` — Chat interaction flow
- `cloud-connector.test.ts` — Cloud integration
- `skill-lifecycle.test.ts` — Skill execution
- `tree-search.test.ts` — Semantic search

**Run E2E tests**:
```bash
cd e2e
npx playwright test               # Run all tests
npx playwright test smoke.test.ts # Run single test file
npx playwright show-report        # View test report
```

---

## Key Files to Understand

### Core Bridge
| File | What it does |
|------|-------------|
| `packages/local-bridge/src/bridge.ts` | Bridge lifecycle: start/stop, wires all subsystems (412 lines) |
| `packages/local-bridge/src/ws/server.ts` | WebSocket server: JSON-RPC, streaming, auth (582 lines) |
| `packages/local-bridge/src/brain/index.ts` | Memory layer: facts, wiki, soul, tasks |
| `packages/local-bridge/src/agents/router.ts` | Routes messages to agents by capability or substring |
| `packages/local-bridge/src/agents/spawner.ts` | Spawns agent processes with env/context |
| `packages/local-bridge/src/agents/registry.ts` | Loads agent definitions from YAML |
| `packages/local-bridge/src/config/types.ts` | BridgeConfig interface + defaults |
| `packages/local-bridge/src/config/loader.ts` | YAML → BridgeConfig with defaults merge |
| `packages/local-bridge/src/security/jwt.ts` | Fleet JWT signing/verification |

### Plugin System
| File | What it does |
|------|-------------|
| `packages/local-bridge/src/plugins/types.ts` | Plugin manifest, skills, permissions types |
| `packages/local-bridge/src/plugins/loader.ts` | Load plugins from npm or local paths |
| `packages/local-bridge/src/plugins/sandbox.ts` | Sandbox execution for cold skills |
| `packages/local-bridge/src/plugins/permission-manager.ts` | Permission approval and checking |
| `packages/local-bridge/src/plugins/registry-client.ts` | Query cocapn plugin registry |

### Webhooks
| File | What it does |
|------|-------------|
| `packages/local-bridge/src/webhooks/manager.ts` | Webhook registration, event dispatch |
| `packages/local-bridge/src/webhooks/receiver.ts` | HTTP webhook receiver with HMAC verification |
| `packages/local-bridge/src/webhooks/handlers/github.ts` | GitHub webhook handler |
| `packages/local-bridge/src/webhooks/handlers/slack.ts` | Slack webhook handler |
| `packages/local-bridge/src/webhooks/handlers/discord.ts` | Discord webhook handler |

### Analytics
| File | What it does |
|------|-------------|
| `packages/local-bridge/src/analytics/collector.ts` | Event collection (agent.invoked, tool.used, etc.) |
| `packages/local-bridge/src/analytics/metrics.ts` | Metrics aggregation and computation |
| `packages/local-bridge/src/analytics/exporter.ts` | Export analytics data |

### MCP Client
| File | What it does |
|------|-------------|
| `packages/local-bridge/src/mcp-client/client.ts` | MCP client for external servers |
| `packages/local-bridge/src/mcp-client/transport.ts` | Transport layer (stdio, SSE) |
| `packages/local-bridge/src/mcp-client/registry.ts` | Registry of connected MCP servers |
| `packages/local-bridge/src/mcp-client/bridge-integration.ts` | Bridge integration for MCP tools |

### Templates
| File | What it does |
|------|-------------|
| `packages/local-bridge/src/templates/index.ts` | Template installer and manager |
| `packages/local-bridge/src/publishing/templates.ts` | Template builder and publisher |
| `packages/templates/bare/` | Minimal template |
| `packages/templates/dmlog/` | TTRPG game console template |
| `packages/templates/makerlog/` | Developer/manufacturer template |
| `packages/templates/studylog/` | Education/research template |
| `packages/templates/businesslog/` | Enterprise/business template |
| `packages/templates/cloud-worker/` | Cloudflare Workers template |
| `packages/templates/web-app/` | Web application template |

### Cloud & Auth
| File | What it does |
|------|-------------|
| `packages/cloud-agents/src/admiral.ts` | AdmiralDO: tasks, heartbeats, registry, messages |
| `packages/cloud-agents/src/auth/service.ts` | Auth service on Workers |
| `packages/cloud-agents/src/auth/routes.ts` | Auth routes (signup, signin, logout) |
| `packages/cloud-agents/src/auth/tokens.ts` | JWT token generation and verification |
| `packages/cloud-agents/src/auth/rate-limit.ts` | Rate limiting for auth endpoints |

### Protocols
| File | What it does |
|------|-------------|
| `packages/protocols/src/mcp/` | MCP client/server/transport |
| `packages/protocols/src/a2a/` | A2A client/server |

### CLI
| File | What it does |
|------|-------------|
| `packages/cli/src/commands/deploy.ts` | Deploy to Cloudflare Workers |
| `packages/cli/src/commands/init.ts` | Initialize cocapn project |
| `packages/cli/src/commands/skills.ts` | Manage skills |
| `packages/cli/src/commands/start.ts` | Start the bridge |
| `packages/cli/src/commands/status.ts` | Show bridge status |
| `packages/cli/src/commands/templates.ts` | Manage templates |

### Documentation
| File | What it does |
|------|-------------|
| `docs/site/index.html` | Documentation homepage |
| `docs/site/getting-started.html` | Installation and setup guide |
| `docs/site/architecture.html` | Architecture overview |
| `docs/site/plugins.html` | Plugin system guide |
| `docs/site/templates.html` | Template system guide |
| `docs/site/api-reference.html` | API reference |
| `docs/site/fleet.html` | Fleet protocol guide |
| `docs/site/contributing.html` | Contributing guidelines |

### Testing
| File | What it does |
|------|-------------|
| `e2e/tests/` | Playwright E2E tests |
| `packages/local-bridge/tests/e2e/` | Bridge E2E tests (7 test files) |
| `packages/local-bridge/tests/` | Unit + integration tests |

---

## Current Work (2026-03-29)

### Recent Completed Features
- **Phase 15.3**: Documentation site with 8 pages (homepage, getting-started, architecture, plugins, templates, API reference, fleet, contributing)
- **Phase 15.2**: MCP client mode — connect to external MCP servers and use their tools
- **Phase 14.3**: Template system with 7 built-in templates
- **Phase 14.2**: Webhook system with GitHub/Slack/Discord handlers
- **Phase 13.4**: Analytics event tracking and export
- **Phase 12-13**: Fleet protocol for multi-agent coordination
- **Phase 11**: Plugin system with permissions-based sandbox
- **Phase 9-10**: Self-assembly and cloud bridge

### Execution Priority (from roadmap2.txt)
**Week 1 — Social Layer (critical path for virality)**:
1. Profile Generation & Export (roadmap2 Prompt 1.1) — 4h
2. Activity Feed Aggregation (roadmap2 Prompt 1.2) — 6h
3. Magazine Layout Enhancements (roadmap2 Prompt 1.4) — 4h

**Week 2 — Registry + Testing**:
4. AdmiralDO Registry (roadmap2 Prompt 1.3) — 3h
5. Integration Test Suite (roadmap2 Prompt 3) — 8h

**Week 3 — E2E + Polish**:
6. E2E Tests with Playwright (roadmap2 Prompt 4) — 8h
7. Performance & Polish (roadmap2 Prompt 5) — 4h

**Week 4 — Cloud Background Tasks**:
8. Scheduled Task Parser (roadmap2 Prompt 2.1) — 4h
9. AdmiralDO Task Queue (roadmap2 Prompt 2.2) — 4h
10. Cloud Worker Execution (roadmap2 Prompt 2.3) — 4h

### In Progress / Queued
1. **Social layer** — profiles, discovery registry, cross-domain messaging (plan: `docs/superpowers/plans/2026-03-28-social-layer.md`)
2. **resolveSecretRefs** — `"secret:KEY"` env values not dereferenced at spawn time
3. **PAT-in-remote-URL** — security: GitHub PAT stored in .git/config
4. **Memory MCP tools** — Brain has read/write but no MCP tool exposure
5. **create-cocapn** — standalone `npm create cocapn` scaffolding package

### Known Bugs / Limitations
- `age-encryption` libsodium WASM doesn't resolve on ARM64 (Jetson) — platform-specific issue, tests fail but code is valid
- Agent secret injection doesn't resolve `"secret:KEY"` references (registry.ts:294)
- PAT embedded in git remote URL during init (init.ts:454) — security consideration

---

## Superpowers System

The `docs/superpowers/` directory contains executable plans for agentic workers:

- **plans/** — Implementation plans with checkbox tasks, full code, and tests
  - `2026-03-28-social-layer.md` — Social profiles + messaging (12 tasks, 2275 lines of spec)

Plans are self-contained: each task has failing test → implementation → passing test → commit. They can be executed by Claude Code or other agentic workers.

## Design Documents

The `docs/designs/` directory contains 13 design documents covering:
- Plugin system architecture
- Fleet protocol specification
- Webhook system design
- Analytics event schema
- Template system design
- Auth system architecture
- MCP client integration
- And more...

See `docs/designs/` for detailed design specifications.

---

## Ecosystem Integration

### LOG.ai → Cocapn Modules

The LOG.ai codebase (Cloudflare Workers) provides these cocapn cloud modules:

| LOG.ai Feature | Cocapn Module |
|---------------|---------------|
| PII dehydrate/rehydrate | `cloud-module-pii` |
| Intent routing (16 rules) | `cloud-module-router` |
| Draft comparison (creative/concise/balanced) | `cloud-module-drafts` |
| Session management | `cloud-module-sessions` |
| Route analytics | `cloud-module-analytics` |
| Guest mode | `cloud-module-guest` |
| Auto-recap | `cloud-module-recap` |

### LOG.ai Repos → Cocapn Templates

| LOG.ai Repo | Becomes |
|------------|---------|
| log-origin | `templates/cloud-personal` (base template for all domains) |
| dmlog-ai | `templates/cloud-dmlog` (TTRPG template) |
| studylog-ai | `templates/cloud-studylog` |
| makerlog-ai | `templates/cloud-makerlog` |
| etc. | etc. |

### Key Synergy Points

1. **cocapn personality (soul.md) → LOG.ai system prompts** — agent personality injected into themed Workers
2. **cocapn memory (facts.json) → LOG.ai session context** — user preferences flow to cloud
3. **cocapn fleet JWT → LOG.ai auth** — single identity across local + cloud
4. **cocapn modules → LOG.ai features** — install a module, get a cloud feature
5. **cocapn analytics → LOG.ai routing optimization** — local data improves cloud routing

---

## Research Notes

- **OpenMAIC** (AGPL-3.0): Director-orchestrator pattern, multi-agent coordination. Study patterns, don't copy code.
- **Craftmind**: Minecraft bot framework with personality scripts, A/B testing, fishing plugin.
- **FishingLog.ai**: Two distinct user groups (commercial fleet vs recreational angler). Onboarding fork is the key UX challenge.
