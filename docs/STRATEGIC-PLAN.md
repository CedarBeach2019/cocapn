# Cocapn Strategic Plan — Phase 16-18

> Planned with GLM-5.1 | Executed by Superinstance

## The Core Insight

Cocapn has impressive architecture but zero users. The gap is not features — it's that nobody can `npm install cocapn` and get value in 5 minutes.

**The #1 thing:** A 60-second "wow" moment where a developer installs, chats, closes, reopens, and the agent *remembers them*.

**Unique position:** Self-hosted + persistent memory + fleet coordination. Nobody has this combination.

---

## Phase 16: Ship It (Week 1-2, ~30h)

| # | Task | Est. | Done Looks Like |
|---|------|------|----------------|
| 16.1 | Wire LLM into bridge (Anthropic + OpenAI) | 4h | Real API calls, responses via WebSocket |
| 16.2 | Minimal chat UI (<500 lines) | 6h | Chat client at localhost:3000 |
| 16.3 | Memory round-trip (Brain → chat → Brain) | 4h | Agent remembers facts across sessions |
| 16.4 | npm publish (create-cocapn + CLI) | 3h | `npx create-cocapn` works globally |
| 16.5 | 3 real E2E tests | 4h | Install → chat → memory verified |
| 16.6 | Fix cloud Worker LLM stub | 3h | Worker executes tasks with real LLM |
| 16.7 | Demo video + README update | 3h | GIF showing 60-second install-to-value |
| 16.8 | Landing page | 3h | One-page site |

**Exit criteria:** Stranger can install, get working agent in 60s, agent remembers tomorrow.

## Phase 17: Developer Experience (Week 3-4, ~28h)

| # | Task | Est. |
|---|------|------|
| 17.1 | VS Code extension | 8h |
| 17.2 | MCP tool creation from chat | 4h |
| 17.3 | Agent personality customization UI | 3h |
| 17.4 | Plugin install from CLI | 4h |
| 17.5 | Git-based memory browser | 3h |
| 17.6 | SWE-bench Lite evaluation | 6h |

## Phase 18: Fleet & Growth (Week 5-8, ~40h)

| # | Task | Est. |
|---|------|------|
| 18.1 | Fleet demo: 2 agents coordinate | 6h |
| 18.2 | AdmiralDO fleet registry | 4h |
| 18.3 | Cross-domain messaging | 4h |
| 18.4 | Plugin marketplace MVP | 6h |
| 18.5 | GitHub Action for CI | 4h |
| 18.6 | Template deepening (makerlog + dmlog) | 6h |
| 18.7 | Launch on HN + Reddit | 2h |
| 18.8 | Telemetry (opt-in) | 4h |

## Monetization

- **Free**: Local bridge, unlimited agents, Git Brain, MCP, plugins, fleet (local)
- **Pro ($15/mo)**: Cloud sync, fleet relay, custom domains, analytics
- **Team ($40/user/mo)**: Shared fleet, shared Brain, SSO, webhooks
- **Enterprise**: Self-hosted, custom, SLA

## Launch

1. Show HN with demo GIF
2. Reddit (r/localLLaMA, r/ChatGPTCoding)
3. Twitter thread on persistent memory
4. VS Code extension (highest-leverage channel)
5. SWE-bench score for credibility
