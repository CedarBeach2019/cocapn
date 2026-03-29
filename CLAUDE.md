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
│   │   │   ├── bridge.ts          # Bridge lifecycle (313 lines)
│   │   │   ├── ws/server.ts       # WebSocket server (878 lines — being decomposed)
│   │   │   ├── agents/            # Agent registry, router, spawner
│   │   │   ├── brain/             # Memory: facts, wiki, soul, procedures
│   │   │   ├── config/            # YAML config loading, types
│   │   │   ├── git/               # Git sync, publishing
│   │   │   ├── security/          # JWT, fleet keys, age encryption
│   │   │   ├── modules/           # Module manager, sandbox, hooks
│   │   │   ├── handlers/          # (planned) extracted from server.ts
│   │   │   └── cli/               # Init wizard, CLI commands
│   │   └── tests/                 # 203 tests (196 pass, 7 age-encryption on ARM)
│   ├── ui/                # React + Vite WebSocket client
│   ├── protocols/         # MCP (client/server) + A2A protocol
│   ├── cloud-agents/      # Cloudflare Workers: AdmiralDO Durable Object
│   ├── modules/           # Reference modules (habit-tracker, perplexity-search, zotero-bridge)
│   ├── templates/         # Public (Vite app) + Private (soul.md, config, memory)
│   └── schemas/           # JSON schemas (6+ enforced via SchemaValidator)
├── docs/
│   ├── superpowers/plans/ # Executable implementation plans (checkbox tasks)
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

# Protocols
cd packages/protocols
npx vitest run

# Cloud agents
cd packages/cloud-agents
npx tsc --noEmit

# All packages
cd packages/local-bridge && npx vitest run  # Currently only local-bridge has tests
```

---

## Test Status

- **196/203 pass** on x86_64
- **7 fail** on ARM/Jetson (age-encryption/libsodium WASM — not a code issue)
- Failing tests: `tests/security.test.ts` (SecretManager, FleetKeyManager)
- These tests are valid code — just can't run on this platform

---

## Architecture Decisions

1. **Git is the database** — all agent memory (facts, wiki, soul, procedures) lives in Git repos. Two repos per user: private (brain) + public (published content).
2. **Offline-first** — the bridge runs locally; cloud is optional enhancement.
3. **WebSocket JSON-RPC** — the bridge protocol. Typed messages for streaming, JSON-RPC for requests.
4. **MCP for agent tools** — agents get tools via Model Context Protocol.
5. **A2A for fleet communication** — inter-bridge communication via HTTP POST + fleet JWT.
6. **AdmiralDO** — Cloudflare Durable Object for cloud state (registry, message queue, task management).
7. **Module system** — 4 types: brain (modify behavior), ui (add UI), cloud (add cloud features), tool (add MCP tools). Installed via git submodules.
8. **Privacy by design** — `private.*` facts never leave the private repo. Env filtering strips secrets from agent contexts.
9. **TypeScript strict** — all packages use `"strict": true` in tsconfig.
10. **Zero external runtime deps for protocols** — MCP and A2A packages have no dependencies.

---

## Code Conventions

- **ESM only** — all packages use `"type": "module"` in package.json
- **Absolute imports** — use `../src/foo.js` (with `.js` extension for ESM)
- **Vitest** — test framework. Tests go in `tests/` next to `src/`.
- **No console.log in production** — use the Logger class (or `console.info`/`console.warn` with `[prefix]`).
- **YAML config** — `cocapn.yml` (public) and `cocapn-private.yml` (private, gitignored).
- **Schemas enforced** — all JSON files validated against schemas in `schemas/` via SchemaValidator.

---

## Key Files to Understand

| File | What it does |
|------|-------------|
| `packages/local-bridge/src/bridge.ts` | Bridge lifecycle: start/stop, wires all subsystems |
| `packages/local-bridge/src/ws/server.ts` | WebSocket server (being decomposed — see refactor plan) |
| `packages/local-bridge/src/brain/index.ts` | Memory layer: facts, wiki, soul, tasks |
| `packages/local-bridge/src/agents/router.ts` | Routes messages to agents by capability or substring |
| `packages/local-bridge/src/agents/spawner.ts` | Spawns agent processes with env/context |
| `packages/local-bridge/src/agents/registry.ts` | Loads agent definitions from YAML |
| `packages/local-bridge/src/config/types.ts` | BridgeConfig interface + defaults |
| `packages/local-bridge/src/config/loader.ts` | YAML → BridgeConfig with defaults merge |
| `packages/local-bridge/src/security/jwt.ts` | Fleet JWT signing/verification |
| `packages/cloud-agents/src/admiral.ts` | AdmiralDO: tasks, heartbeats, registry, messages |
| `packages/protocols/src/mcp/` | MCP client/server/transport |
| `packages/protocols/src/a2a/` | A2A client/server |

---

## Current Work (2026-03-28)

### Server Refactor — IN PROGRESS (Claude Code)
Source plan: `docs/superpowers/plans/2026-03-28-server-refactor.md`

| Task | Status | Commit |
|------|--------|--------|
| 1. Extract types | ✅ Done | `adcb4e0` |
| 2. Extract auth handler | ✅ Done | `78c6654` |
| 3. Extract send helpers | ✅ Done | `c63c4d6` |
| 4. Extract handler types | ✅ Done | `6572340` |
| 5. Extract individual handlers | ✅ Done | `6572340` |
| 6. Extract dispatcher | ✅ Done | `6572340` |
| 7. Extract peer handler | 🔄 Running | — |
| 8. Extract intent parsers | 🔄 Running | — |
| 9. Final server.ts cleanup | 🔄 Running | — |

**Result so far**: server.ts 878→338 lines, 203/210 tests pass.

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
1. **Server refactor** — decompose 878-line server.ts into handler modules (plan: `docs/superpowers/plans/2026-03-28-server-refactor.md`)
2. **Social layer** — profiles, discovery registry, cross-domain messaging (plan: `docs/superpowers/plans/2026-03-28-social-layer.md`)
3. **resolveSecretRefs** — `"secret:KEY"` env values not dereferenced at spawn time
4. **PAT-in-remote-URL** — security: GitHub PAT stored in .git/config
5. **Memory MCP tools** — Brain has read/write but no MCP tool exposure
6. **Cloud bridge** — connect cocapn agents to Cloudflare Workers backends
7. **create-cocapn** — standalone `npm create cocapn` scaffolding package

### Known Bugs
- `age-encryption` libsodium WASM doesn't resolve on ARM64 (Jetson) — 7 security tests fail
- Agent secret injection doesn't resolve `"secret:KEY"` references (registry.ts:294)
- PAT embedded in git remote URL during init (init.ts:454)

---

## Superpowers System

The `docs/superpowers/` directory contains executable plans for agentic workers:

- **plans/** — Implementation plans with checkbox tasks, full code, and tests
  - `2026-03-28-server-refactor.md` — BridgeServer decomposition (12 modules, 578 lines of spec)
  - `2026-03-28-social-layer.md` — Social profiles + messaging (12 tasks, 2275 lines of spec)

Plans are self-contained: each task has failing test → implementation → passing test → commit. They can be executed by Claude Code or other agentic workers.

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
