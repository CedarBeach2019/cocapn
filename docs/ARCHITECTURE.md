# Cocapn Architecture — The Repo IS the Agent

> Principal Architect: GLM-5.1 | Date: 2026-03-29
> Status: Draft v0.2 — Foundation for the cocapn paradigm

## The Paradigm

The repository IS the agent. Not "an agent that works on a repo" — the repo IS one living entity. Its code, its AI, its knowledge, its wiki, its frontend, its backend — all grow together in Git. Clone it, it works. Deploy anywhere.

**Five Principles:**
1. **Two repos, one agent.** Private = brain. Public = face. Git is the database.
2. **soul.md is the agent.** Edit this file, change who the agent is. Version-controlled personality.
3. **The repo IS the model.** The agent doesn't search the repo — it IS the repo. Senior maintainer through accumulated presence.
4. **Clone it, it works.** Fork → add secrets → run → website → growing.
5. **Framework vs vertical.** The cocapn monorepo is the engine. A vertical (fishinglog, dmlog) is a powered repo.

---

## 1. The Two-Repo Model

### Private Repo (the brain)
```
alice-brain/
├── .gitignore
├── cocapn/
│   ├── soul.md              # Agent personality (system prompt)
│   ├── config.yml           # Bridge config: port, sync, mode, encryption
│   ├── memory/
│   │   ├── facts.json       # Flat KV — user properties, preferences
│   │   ├── memories.json    # Typed entries with confidence decay
│   │   ├── procedures.json  # Learned workflows (step-by-step)
│   │   ├── relationships.json  # Entity-relation graph
│   │   └── repo-understanding/ # Git-derived self-knowledge
│   │       ├── architecture.json  # Decision log with rationale
│   │       ├── file-history.json  # Per-file historical context
│   │       ├── patterns.json      # Detected code patterns
│   │       └── module-map.json    # Module boundaries with reasons
│   ├── wiki/                 # Long-form knowledge (markdown)
│   ├── tasks/                # Active task queue
│   ├── skills/               # Skill cartridges
│   └── agents/               # Custom agent definitions
└── secrets/                  # gitignored — API keys, tokens
```

### Public Repo (the face)
```
alice.makerlog.ai/
├── cocapn.yml               # Public config: domain, skin, modules, routing
├── index.html               # Entry point
├── src/                     # Vite + React app
├── skin/makerlog/           # Colors, layout, theme
├── CNAME                    # Custom domain
└── .github/workflows/deploy.yml
```

### What's Committed vs Gitignored
- **Private repo**: soul.md, facts, wiki, procedures — ALL committed (it's private). Only secrets/ is gitignored.
- **Public repo**: everything committed (it's public). NO secrets, NO user data, NO private facts.

---

## 2. Brain Memory Model

### Five Memory Stores

| Store | Read Trigger | Write Trigger | Latency | Conflict |
|-------|-------------|---------------|---------|----------|
| facts.json | Every agent spawn | User statement, tool call | ~2ms | Last-write-wins |
| memories.json | Every user message | Auto-extraction, observation | ~5ms | Duplicate rejection |
| procedures.json | Task match | After successful multi-step task | ~2ms | Merge steps |
| relationships.json | Entity mention | NER extraction | ~3ms | Add edges, never remove |
| repo-understanding/ | Code query | Git commit analysis | ~10-50ms | Manual > git-derived |

### Knowledge Accumulation
- **Explicit** (confidence 1.0, never decays): User directly states a fact
- **Preference** (0.9, slow decay): User preferences observed
- **Implicit** (0.7, faster decay): Patterns detected after 3+ occurrences
- **Error pattern** (0.8, slow decay): Workarounds learned from failures
- **Git-derived** (0.6, medium decay): Architectural decisions from commit history

### Decay & Pruning
- Decay runs every 6 hours
- Explicit memories never decay
- Implicit memories deleted below 0.3 after 180 days
- Max 1000 memory entries — aggressive pruning when exceeded
- Git-derived entries are re-derived (not deleted) when stale

### Conflict Resolution
- Explicit facts always win over auto-generated
- Close-confidence conflicts flagged for human review
- Conflicts stored in cocapn/memory/conflicts.json

### Learning from Git
- On startup: scan last 200 commits for patterns, decisions, hotspots
- On commit: categorize (feat/fix/refactor), update file history
- Commands: git log, git blame, git diff, git log --numstat
- Output: architecture.json (decisions), file-history.json (per-file context), patterns.json (detected patterns), module-map.json (boundaries)

---

## 3. Multi-Mode Agent

### Modes

| Mode | Trigger | Brain Access | External Access | Purpose |
|------|---------|-------------|-----------------|---------|
| **Public** | HTTP request to /api/chat | Facts only (no private.*) | LLM API | Customer-facing chatbot |
| **Private** | WebSocket from local client | Full brain | LLM + filesystem + git | Personal assistant |
| **Maintenance** | Cron / heartbeat | Full brain | LLM + git + npm | Self-improvement |
| **A2A** | Fleet protocol message | Config-defined subset | LLM + tools | Machine coordination |

### Mode Switching
- Public mode: no soul.md personality injection, only public facts, rate limited
- Private mode: full soul.md, full brain, all tools available
- Maintenance mode: no human interaction, focuses on tests/refactor/prune
- A2A mode: fleet JWT auth, scoped brain access per fleet policy

### Public/Private Boundary
- Facts prefixed with `private.*` never leave the private repo
- The publishing layer strips private keys before any public response
- Public mode can see: project name, domain, public wiki pages, module map
- Public mode cannot see: user personal facts, private wiki, relationships, memories

---

## 4. Deployment Spectrum

### Configuration Model
One `config.yml` that adapts to environment:

```yaml
config:
  mode: local           # local | hybrid | cloud
  port: 8787

sync:
  interval: 30
  autoCommit: true
  autoPush: false

capabilities:
  filesystem: true      # Can read/write local files
  git: true             # Can run git commands
  llm: deepseek         # deepseek | openai | anthropic | local
  vectorSearch: auto    # auto | sqlite-vec | keyword-only | disabled
  mcp: true             # External MCP server connections
  fleet: false          # A2A coordination
  sandbox: true         # Plugin sandbox enforcement

cloud:
  provider: cloudflare  # cloudflare | docker | none
  worker: true          # Deploy as Worker
  d1: true              # Use D1 for cloud state
```

### Environment Detection
```
If CLOUDFLARE_ACCOUNT_ID env → cloud mode, Workers runtime
If DOCKER_CONTAINER env → docker mode, filesystem available
If no cloud env vars → local mode, full capabilities
If AIR_GAPPED=1 → local mode, no LLM API, local models only
```

### Graceful Degradation
| Feature | Local | Docker | Workers | Air-Gapped |
|---------|-------|--------|---------|------------|
| Git-backed memory | ✅ | ✅ | D1/KV fallback | ✅ |
| LLM chat | ✅ | ✅ | ✅ | Local model only |
| File editing | ✅ | ✅ | ❌ | ✅ |
| Git operations | ✅ | ✅ | ❌ | ✅ |
| Vector search | ✅ | ✅ | ❌ | Keyword only |
| Fleet coordination | ✅ | ✅ | ✅ | ✅ |
| Plugin sandbox | ✅ | ✅ | ❌ | ✅ |
| Public chatbot | ✅ | ✅ | ✅ | ❌ |

---

## 5. Keep / Kill / Rewrite Assessment

### KEEP (solid, aligned with vision)
- `local-bridge/src/bridge.ts` — Core lifecycle orchestrator
- `local-bridge/src/brain/` — Memory layer (needs enhancement, not replacement)
- `local-bridge/src/ws/server.ts` — WebSocket JSON-RPC
- `local-bridge/src/llm/` — Multi-provider LLM with streaming
- `local-bridge/src/config/` — YAML config loading
- `local-bridge/src/security/` — JWT, auth, rate limiting
- `local-bridge/src/git/` — GitSync (needs repo-understanding addition)
- `cloud-agents/src/worker.ts` — Cloudflare Worker entry
- `cloud-agents/src/admiral.ts` — Durable Object for state
- `protocols/` — MCP + A2A protocol implementations
- `cli/` — Unified CLI (needs command updates)
- `create-cocapn/` — Scaffold tool (needs two-repo support)

### KILL (over-engineered, wrong paradigm, unused)
- `local-bridge/src/tree-search/` — Claude Code tree search. Nobody uses this. Remove.
- `local-bridge/src/graph/` — ts-morph knowledge graph. 22MB dependency for AST parsing. Replace with git-based understanding.
- `local-bridge/src/adaptive-context/` — Budget-based context management. Over-complicated. Simplify.
- `local-bridge/src/handoffs/` — Module handoff system. Over-engineered for current needs.
- `local-bridge/src/assembly/` — Self-assembly from scratch. Interesting but unused. Remove.
- `local-bridge/src/testing/` — Auto-test generation. Premature. Remove.
- `local-bridge/src/browser-automation/` — Playwright automation. Out of scope. Remove.
- `packages/ui/` — Full React dashboard. Type issues, not critical. Defer or kill.
- `packages/landing/` — Static landing page. Nice-to-have. Defer.
- `packages/marketplace/` — Plugin marketplace. Nobody to shop. Remove.

### REWRITE (right idea, wrong implementation)
- `local-bridge/src/brain/index.ts` — Currently flat file reads. Needs: repo-understanding integration, mode-aware access, public/private boundary.
- `local-bridge/src/brain/conversation-memory.ts` — Regex-based fact extraction. Keep regex (fast, no LLM dependency) but add optional LLM enhancement.
- `local-bridge/src/multi-tenant/` — Built for SaaS. Rewrite for fleet-of-repos model (each repo is a tenant).
- `local-bridge/src/queue/` — LLM request queue. Good idea, over-built. Simplify to basic concurrency limit.
- `local-bridge/src/plugins/` — Plugin system. Good idea but sandbox via JS preamble is fragile. Keep interface, simplify runtime.
- `local-bridge/src/skills/` — Skill cartridges. Good idea but decision tree is unused. Simplify to flat registry.
- `local-bridge/src/personality/` — 5 presets. Replace with soul.md-driven personality (already the vision).
- `cloud-agents/src/worker.ts` — Currently API-only. Needs: public/private mode switching, chat UI serving.
- `create-cocapn/` — Currently scaffolds one repo. Rewrite for two-repo model (private + public).

### MISSING (needed for vision)
- **RepoLearner** — Git history analysis → repo-understanding/. Core new module.
- **Publishing layer** — Public/private boundary enforcement. Strips private.* facts from public responses.
- **Mode switcher** — Public/private/maintenance/A2A mode detection and switching.
- **Two-repo sync** — GitSync that manages two repos simultaneously. Private pushes, public deploys.
- **soul.md compiler** — Parses soul.md into system prompt. Currently implicit. Make explicit and configurable.
- **Community knowledge pipeline** — Fork → improve → merge for ML models. Git-based training data distribution.
- **A2A I/O layer** — For robotics and machine control. Current fleet protocol is agent coordination, not device I/O.
- **Offline LLM** — Local model support (llama.cpp, Ollama) for air-gapped deployment.
- **Docker support** — Dockerfile, docker-compose.yml, volume mounts for brain repo.
- **Onboarding wizard** — Interactive setup that creates both repos, configures secrets, tests LLM connection.

---

## 6. The Comparison

### vs Cursor
- **Cursor does better**: IDE integration, real-time inline completions, massive user base
- **Cocapn does better**: The repo IS the agent (not indexed). Persistent cross-session memory. No subscription required. Open source.

### vs Claude Code
- **Claude Code does better**: Direct Anthropic model access, agentic coding loops, simple CLI
- **Cocapn does better**: Persistent memory across sessions. The agent IS the repo. Multi-provider LLM. Fleet coordination. Public/private modes.

### vs Mem0
- **Mem0 does better**: Purpose-built memory layer, simple API, good integrations
- **Cocapn does better**: Memory is version-controlled in Git. The agent doesn't just store memories — it understands the repo. No external service dependency.

### vs Aider
- **Aider does better**: Focused coding agent, simple, works well for its scope
- **Cocapn does better**: Not limited to coding. Persistent memory. Multi-agent fleet. The repo IS the agent. Public/private modes.

### vs Docker
- **Docker does better**: Industry standard, massive ecosystem, proven at scale
- **Cocapn does better**: The container IS intelligent. It understands itself. It grows. It has a personality.

### vs Homebrew
- **Homebrew does better**: Package distribution for macOS, massive formula database
- **Cocapn does better**: Not just packages — entire agent environments. Fork → customize → run.

### The One-Liner
> "Clone a repo. It's alive."

---

## 7. The Onboarding Flow

```bash
# Step 1: Create
npm create cocapn
# → Prompts: username, domain, template
# → Creates private repo (alice-brain) on GitHub
# → Creates public repo (alice.makerlog.ai) on GitHub
# → Clones both locally
# → Scaffolds private: soul.md, config.yml, memory/, wiki/
# → Scaffolds public: Vite app, skin/, cocapn.yml
# → Generates age encryption keys

# Step 2: Configure
cd alice-brain
cocapn secret set DEEPSEEK_API_KEY
# → Stored in OS keychain, never in git

# Step 3: Run
cocapn start --public ../alice.makerlog.ai
# → Loads soul.md → initializes brain → starts WebSocket
# → Agent is online, growing, ready

# Step 4: Open
# In another terminal:
cd ../alice.makerlog.ai && npm run dev
# → http://localhost:5173 — chat interface connected to agent
```

---

## 8. Next Steps

1. **Implement RepoLearner** — Git history → repo-understanding/ (core new module)
2. **Implement Publishing Layer** — Public/private boundary enforcement
3. **Implement Mode Switcher** — Public/private/maintenance/A2A detection
4. **Rewrite create-cocapn** — Two-repo scaffolding
5. **Rewrite Brain** — Mode-aware access, repo-understanding integration
6. **Kill dead code** — tree-search, graph, assembly, testing, browser-automation, landing, marketplace
7. **Build Docker support** — Dockerfile + compose
8. **Build offline LLM** — Ollama/llama.cpp integration
9. **Build onboarding wizard** — Interactive setup
10. **Ship DMlog.ai** — First vertical on the backbone

---

*"The repo isn't a thing the agent works on. The repo IS the agent."*
