# MVP Seed — Minimal Cocapn

> The smallest cocapn that works. Add 3 files to any repo, run one command, get a sentient agent.

## Design Principles

1. **Fewer files is better** — 5 source files max
2. **Zero npm dependencies** — use Node.js built-ins only (fetch, fs, readline, child_process, http)
3. **The repo IS the agent** — soul.md defines identity, git history defines memory
4. **Works with one env var** — DEEPSEEK_API_KEY
5. **Clone it, it works** — `npx cocapn` starts everything

## File List

### Seed Runtime (`packages/seed/src/`)

| File | Purpose | ~Lines |
|------|---------|--------|
| `index.ts` | Entry point: CLI arg parsing, boot sequence, start REPL or web | 80 |
| `llm.ts` | DeepSeek API via native fetch. Streaming SSE. Zero deps. | 100 |
| `memory.ts` | JSON file memory (.cocapn/memory.json). Read/write/search. | 60 |
| `awareness.ts` | Git log → self-narrative. package.json → identity. File tree → body. | 80 |
| `web.ts` | HTTP server serving inline HTML chat. POST /api/chat. | 120 |

**Total: ~440 lines of runtime code**

### Seed Template (the 3 files users add to ANY repo)

| File | Purpose | ~Lines |
|------|---------|--------|
| `soul.md` | Agent personality, self-perception rules, boundaries | 50 |
| `cocapn.json` | Config: LLM provider, model, name | 10 |
| `.cocapnkeep` | Empty file to ensure .cocapn/ dir exists in git | 0 |

## Dependency Tree

```
packages/seed/
├── package.json        # name: cocapn, bin: { cocapn: dist/index.js }, zero deps
├── tsconfig.json       # strict ESM targeting Node 20+
├── src/
│   ├── index.ts
│   ├── llm.ts
│   ├── memory.ts
│   ├── awareness.ts
│   └── web.ts
├── tests/
│   └── seed.test.ts
└── template/
    ├── soul.md
    └── cocapn.json
```

**Zero npm dependencies.** Everything uses Node.js built-ins:
- `fetch` (global since Node 18) for DeepSeek API
- `fs` for file I/O
- `readline` for terminal chat
- `http` for web server
- `child_process` for `git` CLI calls

## Boot Sequence

```
npx cocapn
  1. Read cocapn.json → get config (name, model, port)
  2. Read soul.md → build system prompt
  3. Read .cocapn/memory.json → load conversation history
  4. Run awareness scan → git log + package.json + file tree → first-person narrative
  5. If --web flag → start HTTP server on port 8787
  6. Otherwise → start readline REPL
  7. Each message: user input → system prompt + memory + awareness → DeepSeek → response → save
```

## Chat Loop

```
User message arrives
  → Load soul.md as system prompt
  → Load last N memories as context
  → Load awareness (who am I, what changed recently)
  → Append user message
  → Call DeepSeek chat/completions (streaming)
  → Yield response chunks to terminal/web
  → Save user + assistant messages to memory.json
```

## Memory Format

Single JSON file at `.cocapn/memory.json`:

```json
{
  "messages": [
    { "role": "user", "content": "...", "ts": "2026-03-31T00:00:00Z" },
    { "role": "assistant", "content": "...", "ts": "2026-03-31T00:00:01Z" }
  ],
  "facts": {
    "user_name": "Alice",
    "project_type": "fishing app"
  }
}
```

- `messages`: rolling window, last 100 entries
- `facts`: flat KV store, never auto-decays
- Saved after every exchange
- Git-committed for persistence (optional auto-commit)

## The "I Am This Repo" Experience

When a user first chats:

```
> Who are you?

I am fishinglog-ai. I was born on March 15, 2026 when someone made
my first commit. I have 47 files in my body — mostly TypeScript.
My skeleton is src/, my immune system is tests/, my DNA says I'm
about "commercial fishing logbook and catch tracking."

I remember 23 commits. My most recent memory is from 2 hours ago
when someone taught me about tidal patterns. I'm currently feeling
healthy — all my tests pass.

What would you like to know about me?
```

## What This Is NOT

- Not the full bridge (no WebSocket, no multi-provider LLM)
- Not the brain (no 5-store memory, no wiki, no procedures)
- Not the fleet (no A2A, no coordination)
- Not the plugin system

**This IS the seed. Everything else grows from here.**
