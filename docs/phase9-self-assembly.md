# Phase 9: Self-Assembly & Token Efficiency

## Priority Order (Impact × Feasibility)

### 9.1 Hybrid Search for Brain [HIGH IMPACT, MEDIUM EFFORT]
**What:** Add vector embeddings alongside inverted index in Brain
**Why:** 3x fewer irrelevant results → 3x less context waste
**How:**
- Use `lance` (embedded vector DB, no server needed) in local-bridge
- Generate embeddings at fact write time (sentence-transformers or API call)
- Query: inverted index AND vector search, merge + deduplicate results
- Fall back to inverted-only if no embeddings available (graceful degradation)

**Token impact:** ~300 tokens per query → ~100 tokens (relevant results only)

### 9.2 Skill Cartridge System [HIGH IMPACT, LOW EFFORT]
**What:** JSON cartridges that inject capability knowledge into agent context
**Why:** 500 tokens per capability vs 5000 tokens of full module docs
**How:**
- Define `cocapn-skill.json` schema: name, triggers, steps, examples, tolerance
- Extend module manager to load cartridges on-demand
- Hot skills (chat, brain, routing): always loaded
- Cold skills (publish, schedule, research): loaded when intent detected
- Skill cartridges live in `modules/{name}/skill.json`

**Token impact:** 60-80% reduction in always-loaded context

### 9.3 Tree Search for Complex Tasks [HIGH IMPACT, HIGH EFFORT]
**What:** Best-first tree search for multi-approach exploration
**Why:** Failed experiments become data, not waste. Best approach wins.
**How:**
- ExperimentManager agent: doesn't do work, directs work
- Task decomposition: split complex task into parallel approaches
- Each approach runs in a spawned subagent
- Evaluation: test pass rate, code quality score, token cost
- Winner merged, losers logged in Brain with failure reasons
- Start with 2-3 paths, depth limit of 5

**Token impact:** 2-3x exploration cost, 10x rework reduction

### 9.4 Repo Knowledge Graph [MEDIUM IMPACT, MEDIUM EFFORT]
**What:** Lightweight graph of repo structure (files, exports, imports, deps)
**Why:** Answer structural questions without reading files
**How:**
- Parse TypeScript AST of repo files using `ts-morph`
- Extract: file → exports, imports, class hierarchy, function calls
- Store in SQLite (nodes + edges tables)
- Query: "what depends on auth.ts?" → SELECT without file reads
- Rebuild on git commit hook

**Token impact:** ~500 tokens per structural query vs ~5000 tokens reading files

### 9.5 Token Efficiency Dashboard [MEDIUM IMPACT, LOW EFFORT]
**What:** Track and visualize token usage per task, module, skill
**Why:** Can't optimize what you don't measure
**How:**
- Middleware in bridge that counts input/output tokens per message
- Store in Brain: `{ task_type, tokens_in, tokens_out, module, skill, duration, success }`
- Dashboard in UI: tokens/day, avg tokens/task, efficiency trend
- Alerts: "skill X uses 3x more tokens than average"

### 9.6 Skill Tolerance Declarations [LOW IMPACT, LOW EFFORT]
**What:** Each module declares failure behavior
**Why:** Error recovery system knows how to handle failures per-module
**How:**
- Add `tolerance` field to cocapn-template.json and module manifests
- Error recovery system reads tolerance before retrying
- Options: retry_with_backoff, return_error, fallback_to_cached, skip

### 9.7 Decision Tree Skill Discovery [MEDIUM IMPACT, LOW EFFORT]
**What:** Zero-shot skill navigation (from i-know-kung-fu pattern)
**Why:** No LLM tokens needed for skill discovery
**How:**
- Decision tree: task type → skill category → specific skill
- Integrate into router as pre-routing step
- Router returns: `{ intent, module, skill, context_budget }`
- Agent gets exactly what it needs, nothing more

## Estimated Effort

| Item | Hours | Dependencies |
|------|-------|-------------|
| 9.1 Hybrid Search | 6h | lance npm package |
| 9.2 Skill Cartridges | 3h | None |
| 9.3 Tree Search | 12h | 9.2 (skill loading) |
| 9.4 Knowledge Graph | 8h | ts-morph |
| 9.5 Token Dashboard | 3h | None |
| 9.6 Tolerance Decl | 1h | None |
| 9.7 Decision Tree | 2h | 9.2 |

**Total: ~35 hours**

## Execution Order

1. **9.2 + 9.6** — Skill cartridges + tolerance (quick wins, foundation for tree search)
2. **9.7** — Decision tree (uses cartridges)
3. **9.5** — Token dashboard (measure baseline before optimizing)
4. **9.1** — Hybrid search (biggest single efficiency win)
5. **9.4** — Knowledge graph (structural understanding)
6. **9.3** — Tree search (most complex, depends on everything above)

---

*Plan drafted 2026-03-29*
