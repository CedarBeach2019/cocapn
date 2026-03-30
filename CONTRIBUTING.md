# Contributing to Cocapn

Cocapn is an open-source agent runtime where **the repo IS the agent**. Contributions are welcome — whether fixing bugs, adding features, improving docs, or building new plugins and templates.

Active fork: [CedarBeach2019/cocapn](https://github.com/CedarBeach2019/cocapn) (upstream: [superinstance/cocapn](https://github.com/superinstance/cocapn)).

---

## 1. Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- Git

### Setup

```bash
# Fork the repo, then clone your fork
git clone https://github.com/<your-username>/cocapn.git
cd cocapn

# Install all workspace packages
npm install

# Build all packages
npm run build

# Run all tests
npm test
```

### Quick verification

```bash
# Type check (any package)
cd packages/local-bridge && npx tsc --noEmit

# Run tests for a single package
cd packages/local-bridge && npx vitest run

# Run a single test file
cd packages/local-bridge && npx vitest run tests/brain.test.ts
```

---

## 2. Development Workflow

### Branch naming

Use prefixes that match conventional commit types:

| Prefix | Purpose | Example |
|--------|---------|---------|
| `feat/` | New feature | `feat/soul-md-compiler` |
| `fix/` | Bug fix | `fix/git-sync-conflict` |
| `docs/` | Documentation | `docs/contributing-guide` |
| `chore/` | Maintenance | `chore/update-deps` |
| `refactor/` | Code restructuring | `refactor/brain-memory-layer` |
| `test/` | Test additions/changes | `test/fleet-coordination` |

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add soul.md compiler for personality parsing
fix: resolve race condition in git sync auto-commit
docs: update CLAUDE.md with new architecture section
chore: bump dependencies to latest versions
```

### Superinstance attribution

All commits by agentic workers include the Superinstance attribution:

```
feat: add soul.md compiler for personality parsing

Author: Superinstance
```

### PR process

1. Create a branch from `main`
2. Make your changes with clear commits
3. Push to your fork
4. Open a PR against `CedarBeach2019/cocapn:main`
5. Ensure CI passes (build + typecheck + lint + test)

---

## 3. Code Style

### TypeScript

- **Strict mode** — all packages use `"strict": true`
- **ESM only** — all packages use `"type": "module"`
- **Absolute imports** — use `../src/foo.js` (with `.js` extension for ESM compatibility)
- **2-space indentation, single quotes**

### Formatting & Linting

- **Prettier** — run `npx prettier --write .` before committing
- **ESLint** — run `npx eslint .` to catch issues

### No JSX in backend

- Backend code uses plain TypeScript
- Web frontend uses **Preact + HTM** (tagged template literals, no JSX build step)

### Naming

- Files: `kebab-case.ts`
- Directories: `kebab-case/`
- Classes: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`

### No console.log in production

Use the Logger class or `console.info`/`console.warn` with a `[prefix]` tag:

```typescript
// Bad
console.log("bridge started");

// Good
console.info("[bridge] started");
```

---

## 4. Architecture

### The Paradigm

Cocapn's core idea: **the repo IS the agent**. Not "an agent that works on a repo" — the repo itself is a living entity with personality, memory, and capabilities. Clone it, it works.

### Two-Repo Model

Each user has two repos:

- **Private repo (brain)** — `soul.md`, facts, wiki, procedures, relationships, tasks. All committed. Only `secrets/` is gitignored.
- **Public repo (face)** — Vite app, skin, domain config. Everything committed. No secrets, no private data.

Git is the database. The agent has persistent memory across sessions through its brain stores.

### Brain Memory — Five Stores

| Store | Purpose | Latency | Conflict Resolution |
|-------|---------|---------|-------------------|
| `facts.json` | Flat KV — user properties, preferences | ~2ms | Last-write-wins |
| `memories.json` | Typed entries with confidence decay | ~5ms | Duplicate rejection |
| `procedures.json` | Learned workflows (step-by-step) | ~2ms | Merge steps |
| `relationships.json` | Entity-relation graph | ~3ms | Add edges, never remove |
| `repo-understanding/` | Git-derived self-knowledge | ~10-50ms | Manual > git-derived |

Knowledge confidence levels: Explicit (1.0) > Preference (0.9) > Error pattern (0.8) > Implicit (0.7) > Git-derived (0.6). Decay runs every 6 hours.

### Agent Modes

| Mode | Trigger | Brain Access | External Access |
|------|---------|-------------|-----------------|
| **Public** | HTTP to `/api/chat` | Facts only (no `private.*`) | LLM API |
| **Private** | WebSocket from local client | Full brain | LLM + filesystem + git |
| **Maintenance** | Cron / heartbeat | Full brain | LLM + git + npm |
| **A2A** | Fleet protocol message | Config-defined subset | LLM + tools |

Facts prefixed with `private.*` never leave the private repo. The publishing layer strips private keys before any public response.

### Package Layout

```
packages/
  local-bridge/     Core runtime (bridge, brain, agents, skills, fleet)
  cloud-agents/     Cloudflare Workers (AdmiralDO, auth)
  cli/              cocapn CLI (deploy, init, start, status, config, fleet, wiki, sync, logs)
  create-cocapn/    Scaffolding tool (npm create cocapn)
  protocols/        MCP client/server + A2A protocol (zero external deps)
  ui-minimal/       Lightweight web client (Preact + HTM)
  modules/          Reference modules
  templates/        Built-in templates (bare, dmlog, makerlog, etc.)
  schemas/          JSON schemas (enforced via SchemaValidator)
  vscode-extension/ VS Code extension
```

---

## 5. Adding Features

### Personality changes → `soul.md`

Edit `soul.md` to change who the agent is. This is version-controlled personality:

```markdown
# Soul

You are Alice, a creative writing assistant...
```

The soul.md compiler (planned) will parse this into a system prompt. For now, soul.md is loaded directly by the brain layer.

### New capabilities → Plugins

Plugins extend the agent with new tools, skills, or behaviors:

```bash
packages/local-bridge/src/plugins/
  loader.ts       # Plugin discovery and loading
  permissions.ts  # Plugin sandboxing
```

Follow the plugin interface in `local-bridge/src/plugins/` and register your plugin in the plugin manifest.

### Data improvements → Knowledge pipeline

The brain's knowledge stores (`facts.json`, `memories.json`, etc.) are validated against JSON schemas in `packages/schemas/`. When adding new knowledge types:

1. Define a schema in `packages/schemas/`
2. Add validation in `SchemaValidator`
3. Update the brain layer in `local-bridge/src/brain/`

### Fleet features → A2A protocol

Agent-to-agent communication uses the A2A protocol in `packages/protocols/src/a2a/`:

```typescript
// Zero external dependencies
import { A2AClient, A2AServer } from "@cocapn/protocols/a2a";
```

See `local-bridge/src/fleet/` for fleet coordination patterns.

### Templates

New starting points for users go in `packages/templates/`:

```
packages/templates/
  bare/           Minimal setup
  makerlog/       Maker-focused
  dmlog/          TTRPG
  fishinglog/     Fishing
  cloud-worker/   Cloudflare Workers
```

Each template includes: `soul.md`, `config.yml`, `cocapn.yml`, default modules, and a Vite app scaffold.

---

## 6. Testing

### Running tests

```bash
# All tests across all packages
npm test

# Single package
cd packages/local-bridge && npx vitest run

# Single test file
cd packages/local-bridge && npx vitest run tests/brain.test.ts

# Watch mode during development
cd packages/local-bridge && npx vitest

# E2E tests
cd e2e && npx playwright test
```

### Test isolation

Tests must be isolated and reproducible:

- **Use unique temp directories** — never write to shared or global paths
- **Don't use global paths** like `/home/user/.cocapn/` or `/tmp/cocapn/`
- **Clean up in `afterEach`** — remove temp files, close connections, reset state
- **Tests must match implementation** — test what the code actually does, not what it should ideally do

```typescript
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "cocapn-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});
```

### Test framework

- **Vitest** — all packages use Vitest
- Tests go in `tests/` next to `src/` within each package
- Use `describe`/`it` blocks with clear descriptions

---

## 7. PR Review

### Checklist before submitting

- [ ] **CI passes** — build + typecheck + lint + test all green
- [ ] **Superinstance attribution** — agentic commits include `Author: Superinstance`
- [ ] **No secrets** — no API keys, tokens, or credentials in code (use `secrets/` or env vars)
- [ ] **Tests cover new code** — unit tests for new functions, integration tests for new subsystems
- [ ] **Conventional commit messages** — `feat:`, `fix:`, `docs:`, `chore:`, etc.
- [ ] **Focused changes** — one logical change per PR
- [ ] **Docs updated** — CLAUDE.md, README, or inline docs if behavior changed

### Privacy by design

- Facts prefixed with `private.*` must never leave the private repo
- The publishing layer (`src/publishing/`) enforces this boundary
- Never bypass the public/private boundary in new code

### Review expectations

- PRs are reviewed by maintainers
- Address review feedback promptly
- Keep discussion in the PR thread (not DMs)
- Squash commits only if requested by maintainers

---

## Issues

Bug reports and feature requests are welcome. Please include:

- **What you expected** to happen
- **What actually happened**
- **Steps to reproduce**
- **Your environment** (Node version, OS, deployment mode: local/Docker/Workers)

---

## License

By contributing, you agree that your code will be licensed under the MIT License.

---

Built by [Superinstance](https://superinstance.com). Active development at [CedarBeach2019/cocapn](https://github.com/CedarBeach2019/cocapn).
