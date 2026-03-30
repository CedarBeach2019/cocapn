# Research-Driven Improvements for Next Phase

## Findings from External Research (2026-03-28)

### 1. Cloudflare SQLite-backed Durable Objects (HIGH PRIORITY)
**Current**: AdmiralDO uses KV storage (`ctx.storage.get/put/list`)
**New**: Cloudflare now supports SQLite-backed Durable Objects via `ctx.storage.sql` API
**Impact**: 
- Registry queries go from O(n) list+filter to SQL WHERE with indexes
- Task queue can use proper SQL transactions
- No more manual JSON serialization — store structured data natively
- Sub-ms reads vs 10-50ms KV reads
**Action**: Migrate AdmiralDO from KV to SQLite storage

### 2. MCP Spec 2025-06-18 Has Evolved (MEDIUM PRIORITY)
**Current**: cocapn MCP implements tools, resources, prompts but missing new features
**New features in spec**:
- Tool `title` field (human-readable name for UI display)
- Tool `outputSchema` (type-safe output validation)
- Tool `annotations` (audience: user/assistant, priority: 0-1)
- Resource `subscribe` capability (real-time change notifications)
- Resource templates (parameterized URIs like `brain://facts/{key}`)
- `tools/list_changed` notification (dynamic tool discovery)
- `resources/list_changed` notification (dynamic resource discovery)
**Impact**: 
- Brain facts as MCP resources with `brain://facts/{key}` templates
- Soul/personality as MCP resource (auto-included in context)
- Wiki pages as MCP resources
- Tool annotations let Claude Code know which tools are for user vs assistant
**Action**: Update MCP types.ts and server.ts to match 2025-06-18 spec, expose Brain via MCP

### 3. Brain → MCP Tool Exposure (HIGH PRIORITY)
**Current**: Brain has setFact/getFact/searchWiki but NO MCP tool exposure
**Gap**: Agents can't modify their own memory via MCP — only via WebSocket JSON-RPC
**Impact**:
- Any MCP-compatible AI (Claude Desktop, OpenAI, etc.) can read/write cocapn memory
- Makes cocapn usable as a standalone MCP server (no WebSocket needed)
- Enables cross-agent memory sharing via MCP resource subscriptions
**Action**: Create BrainMcpServer that exposes brain as MCP resources + tools

### 4. Cloud Bridge Architecture (HIGH PRIORITY)
**Current**: CloudAdapter.ts exists but is a stub
**Gap**: No actual connection between cocapn agents and Cloudflare Workers
**Architecture needed**:
```
cocapn bridge → WebSocket → CloudAdapter → HTTPS → Cloudflare Worker → D1/KV → DeepSeek
                    ↑                                            ↓
               local brain                                   response cache
```
**Key design decisions**:
- Workers should cache model responses (Cloudflare KV with 1h TTL)
- PII dehydrate/rehydrate at edge (from LOG.ai codebase)
- Fleet JWT for auth between bridge and Workers
- Adaptive routing rules run in Worker (regex, <1ms)
- Draft comparison available as optional cloud feature
**Action**: Build CloudBridge module using LOG.ai's routing/PII/session code as Workers backend

### 5. Template Packaging System (MEDIUM PRIORITY)
**Current**: Templates are folders with soul.md + config + memory
**Gap**: No standardized packaging, versioning, or distribution
**Improvement**:
- `cocapn template install dmlog` — fetches from npm or GitHub
- Template manifest (cocapn-template.json) with: name, version, domains, features, personality
- Feature flags: which modules are pre-installed
- Domain-specific defaults (DMlog gets dice-roller, StudyLog gets flashcards)
**Action**: Create template packaging spec + CLI commands

### 6. fishinglog.ai Fork Pattern (LOW PRIORITY, DESIGN NEEDED)
**Current**: All other domains have one template per domain
**Unique**: fishinglog.ai needs TWO user paths (commercial vs recreational)
**Design options**:
1. Two separate templates that share 80% code (fishinglog-commercial, fishinglog-recreational)
2. One template with fork-at-onboarding (cocapn.yml includes `fork:` section)
3. Feature flags that unlock different modules based on user choice
**Recommendation**: Option 2 (fork-at-onboarding in cocapn.yml) — keeps one codebase, different default modules/personality
**Action**: Design the fork-onboarding pattern, make it a generic cocapn feature

### 7. AdmiralDO → SQLite Migration Plan (from finding #1)
```typescript
// Before (KV):
const profiles = await ctx.storage.list({ prefix: 'profile:' });
// O(n) scan

// After (SQLite):
const results = await ctx.storage.sql`
  SELECT * FROM profiles 
  WHERE displayName LIKE ? OR currentFocus LIKE ?
  LIMIT 20
`;
// Indexed, sub-ms
```
**Migration steps**:
1. Add SQLite schema initialization in AdmiralDO constructor
2. Migrate KV data to SQLite on first access
3. Update all storage reads to use SQL
4. Add indexes on username, displayName, currentFocus
5. Remove KV fallback after migration

### 8. Performance Improvements
- **Bundle the UI**: Vite build produces <50KB initial load
- **Lazy load agent processes**: Only spawn when first message arrives
- **Git sync debouncing**: Batch multiple edits into one commit (500ms debounce)
- **Memory search**: Use inverted index instead of linear scan for wiki pages

### 9. Security Improvements
- **Content Security Policy** for the UI
- **Subresource Integrity** for esm.sh CDN imports
- **Rate limiting** on WebSocket connections (per-IP, 60/min)
- **Audit logging** for all admin operations
