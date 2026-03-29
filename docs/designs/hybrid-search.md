# Hybrid Search Design for Brain

## Current State
Brain uses an inverted index built from wiki pages and facts. Search is keyword-based using trigram tokenization. Works for exact matches but misses semantic queries.

## Target State
Hybrid search: inverted index (fast, exact) + vector embeddings (semantic, fuzzy). Results merged and deduplicated.

## Architecture

### Storage
Use SQLite with the `vec0` virtual table extension (sqlite-vec), which is a pure C extension that compiles on ARM64. No external server needed.

```sql
-- Facts table (existing)
CREATE TABLE facts (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT
);

-- Vector embeddings table (new)
CREATE VIRTUAL TABLE fact_vectors USING vec0(
  id TEXT PRIMARY KEY,
  embedding float[384]  -- sentence-transformers/all-MiniLM-L6-v2
);

-- Inverted index (existing, in-memory)
-- Keep as-is — it's fast for exact matches
```

### Embedding Strategy

**Option A: Local embeddings (recommended)**
- Use `@xenova/transformers` (WASM, no GPU needed)
- Model: `all-MiniLM-L6-v2` (384-dim, 22MB, fast on CPU)
- Runs in the same Node.js process
- ~50ms per embedding on Jetson Orin Nano

**Option B: API embeddings**
- OpenAI `text-embedding-3-small` (1536-dim)
- $0.02/1M tokens
- Latency: ~200ms per call
- Better quality, but network dependency

**Hybrid: Use local by default, API if configured**

### Search Pipeline

```
Query string
├── Inverted index search → results_a (keyword matches, scored)
├── Vector search → results_b (semantic matches, scored)
└── Merge: weighted sum
    score = α * results_a.score + (1-α) * results_b.score
    Default α = 0.6 (slight keyword preference)
└── Deduplicate by fact key
└── Sort by merged score
└── Return top-N
```

### When to Embed

- **Eager**: Embed every fact/wiki page on write. Query is instant.
- **Lazy**: Embed on first search, cache result. Slower first query.
- **Hybrid**: Embed on write with a background queue (doesn't block the write).

Recommended: Eager with background queue. The write adds a job to the queue, a worker processes it. If the worker hasn't run yet, search falls back to inverted-only.

### Token Efficiency Impact

Without vector search:
- Query "how does auth work" → inverted index finds nothing (no "how does auth work" tokens)
- Agent gets 0 relevant facts → asks for full files → 5000+ tokens

With vector search:
- Query "how does auth work" → vector search finds auth-related facts semantically
- Agent gets 3-5 relevant facts → ~200 tokens
- May not need full files at all

**Estimated savings: 60-80% for semantic queries.**

### Implementation Plan

1. Add `sqlite-vec` as optional dependency (native addon)
2. Create `brain/vector-search.ts`:
   - `initializeVectorDB(dbPath)` — creates vec0 table
   - `embed(text, options)` — generates embedding (local or API)
   - `storeEmbedding(id, embedding)` — inserts into vec0
   - `vectorSearch(query, topK)` — nearest neighbor search
   - `hybridSearch(query, options)` — combines inverted + vector
3. Integrate into Brain:
   - On fact/wiki write: queue embedding job
   - On search: try hybrid, fall back to inverted
4. Add config: `brain.vectorSearch.enabled`, `brain.vectorSearch.provider` (local|openai)

### Fallback Grace

If sqlite-vec fails to install (compilation issues on ARM):
- Vector search is disabled
- Inverted index continues to work
- No degradation, just no semantic search
- Log warning once at startup

### Sizes

- all-MiniLM-L6-v2 model: 22MB
- Per-fact embedding: 384 floats × 4 bytes = 1.5KB
- 1000 facts: ~1.5MB vector table
- 10000 facts: ~15MB vector table
- Negligible on 8GB Jetson

---

*Design doc — 2026-03-29*
