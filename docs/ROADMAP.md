# Cocapn Master Roadmap

> Superinstance — Building the npm of AI agents

## Current State (2026-03-29)

**Phases 0-12 Complete.** 1402 tests, 6 packages, 27 features, 1 live deployment.

- Live: https://cocapn-agent.magnus-digennaro.workers.dev
- Repo: github.com/CedarBeach2019/cocapn (superinstance/cocapn upstream)
- 13 design documents in docs/designs/

## Phase 13: Platform (Priority)

| # | Task | Design Doc | Est. |
|---|------|-----------|------|
| 13.1 | Plugin system — publish/install/search/verify | plugin-system.md | 8h |
| 13.2 | `cocapn deploy` — one-command Workers deployment | deploy-flow.md | 6h |
| 13.3 | Multi-user auth — signup/signin/JWT on Workers | multi-user-auth.md | 6h |
| 13.4 | LOG.ai → cocapn template migration (8 repos) | template-migration.md | 8h |
| 13.5 | E2E verification — full pipeline testing | e2e-verification.md | 6h |
| 13.6 | Fix create-cocapn tests + wiring verification | — | 2h |

## Phase 14: Ecosystem (Growth)

| # | Task | Design Doc | Est. |
|---|------|-----------|------|
| 14.1 | Fleet protocol — multi-agent coordination | fleet-protocol.md | 8h |
| 14.2 | Viral loop — referral, marketplace, landing page | viral-loop.md | 6h |
| 14.3 | Webhook system — GitHub, Slack, Discord triggers | — | 4h |
| 14.4 | Analytics dashboard — usage, costs, performance | — | 6h |

## Phase 15: Expansion (Nice-to-Have)

| # | Task | Est. |
|---|------|------|
| 15.1 | Mobile companion app | 20h |
| 15.2 | MCP client mode (not just server) | 4h |
| 15.3 | GitHub Pages wiki + documentation site | 4h |
| 15.4 | VS Code extension | 12h |
| 15.5 | Desktop app (Electron/Tauri) | 16h |

## Priority Order (What to Build Next)

1. **13.1 Plugin system** — unlocks third-party ecosystem
2. **13.2 `cocapn deploy`** — one-command deployment
3. **13.3 Multi-user auth** — users can sign up
4. **13.4 Template migration** — convert 8 LOG.ai repos
5. **13.5 E2E verification** — prove it works end-to-end
6. **14.1 Fleet protocol** — multi-agent coordination
7. **14.2 Viral loop** — growth engine
8. **14.3-14.4** — webhooks + analytics
9. **15.x** — expansion features

## Constraints

- **workers.dev only** (custom domains on different Cloudflare account)
- **Free Cloudflare tier** (no paid Workers, limited D1/KV)
- **Superinstance employee attribution** on all commits
- **Eventually merge into superinstance/cocapn** upstream
- **Jetson Orin Nano** for local dev (ARM64, 8GB RAM)

## Design Documents

All in `docs/designs/`:
- plugin-system.md
- deploy-flow.md
- multi-user-auth.md
- template-migration.md
- e2e-verification.md
- fleet-protocol.md
- viral-loop.md
- hybrid-search.md
- knowledge-graph.md
- knowledge-packs.md
- self-editing-memory.md
- handoff-pattern.md
- streaming-diffs.md
