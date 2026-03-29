# Frontier Research & Open Questions for Cocapn Roadmap

## Projects Analyzed (Beyond Phase 9 Research)

### Aider — Repo Map Pattern
- **Core idea**: Send a concise map of the ENTIRE repo (class/function signatures) to the LLM with every request
- **Graph ranking**: Uses dependency graph to prioritize which symbols to include within token budget
- **Dynamic sizing**: Expands map when no files are in chat, shrinks when context is full
- **Default**: 1K tokens for repo map
- **Key for cocapn**: Our knowledge graph already has this data. Generate an Aider-style repo map from GraphDB → inject into agent context.

### Cline (Claude Dev) — IDE-Native Agent
- **AST + regex analysis**: Analyzes file structure AND does regex searches to understand projects
- **Context management**: Carefully manages what goes into context window
- **Browser automation**: Headless browser for visual/runtime bug fixing
- **Permission model**: Human-in-the-loop for every file/terminal change
- **Cost tracking**: Tokens + API cost per task loop
- **Key for cocapn**: Context management + cost tracking are already built. Browser automation is new.

### OpenAI Swarm → Agents SDK — Multi-Agent Orchestration
- **Two primitives**: Agents + Handoffs (agent-to-agent delegation)
- **Lightweight**: Runs client-side, no server state between calls
- **Handoffs**: Functions return another Agent, conversation transfers
- **Context variables**: Shared state across agent handoffs
- **Guardrails**: Input/output validation per agent
- **Key for cocapn**: Our router + module system is similar. Add "handoff" pattern — modules can delegate to other modules.

### Letta (MemGPT) — Self-Editing Memory
- **Memory blocks**: human, persona, archival (with search)
- **Self-editing**: Agent can write to its own memory blocks
- **Continual learning**: Memory persists and grows over time
- **Recall**: Search archival memory with relevance scoring
- **Key for cocapn**: Brain already stores facts. Add self-editing — agent can update its own memory without explicit instruction.

---

## Open Questions

### Q1: Repo Map Generation from Knowledge Graph
**Status**: Knowledge graph can generate this TODAY.
**Question**: What's the optimal format? Aider uses tree-dotted file paths with function signatures. Should we:
- (a) Mirror Aider's format exactly (proven, familiar to LLMs)
- (b) Generate a more structured JSON format (easier to parse programmatically)
- (c) Adaptive format based on task type (code task → Aider format, research → JSON)
**Effort**: 2-4 hours. High impact for token efficiency.

### Q2: Self-Editing Memory
**Status**: Brain has read/write API. Agent can already write facts.
**Question**: Should the agent autonomously decide when to write memories? Or only when explicitly asked? Risks:
- Autonomous: More useful, but could accumulate garbage
- Explicit: Cleaner, but misses learnable moments
**Compromise**: Autonomous within a budget (max N memory writes per session, with a "forgetfulness" decay for unused facts).
**Effort**: 3-5 hours. Medium impact for agent quality.

### Q3: Handoff Pattern for Multi-Module Tasks
**Status**: Router dispatches to one module at a time.
**Question**: Should modules be able to hand off to other modules mid-task? Example: Chat module detects a scheduling request → hands off to Schedule module → Schedule hands back with result.
**Implementation**: Each module can return a `{ handoff: { module: 'schedule', context: '...' } }` response. Router handles the transfer.
**Effort**: 4-6 hours. High impact for complex workflows.

### Q4: Browser Automation for Testing
**Status**: Playwright E2E tests exist but aren't wired to the agent.
**Question**: Should the agent be able to launch a headless browser to verify its changes? Like Cline does — edit code, see the visual result, fix bugs.
**Implementation**: Add a `browser` tool to the agent that can: navigate, screenshot, click, type, capture console errors.
**Effort**: 8-12 hours. Very high impact for web development deployments.

### Q5: Streaming Diff Application
**Status**: Cloud bridge has SSE streaming parser.
**Question**: Can we apply diffs AS they stream in, rather than waiting for the complete response? This would make the agent feel faster — code appears line by line as the LLM generates it.
**Implementation**: Parse incoming SSE chunks for diff markers (```diff), apply partial patches to working tree.
**Effort**: 6-8 hours. Medium impact for UX.

### Q6: Adaptive Context Window Management
**Status**: Fixed context assembly — send same amount regardless of task.
**Question**: Can we dynamically adjust how much context to send based on:
- Task complexity (detected by router)
- Token budget remaining
- Model's context window size
- Historical success rate at different context levels
**Implementation**: Router annotates each task with `context_budget: 'low' | 'medium' | 'full'`. Context assembler respects the budget.
**Effort**: 3-5 hours. High impact for token efficiency.

### Q7: Cross-Repo Knowledge Transfer
**Status**: Each cocapn instance has its own Brain.
**Question**: Can agents share learned patterns across different repos/instances? Example: An agent that learned good auth patterns in one repo could suggest them in another.
**Implementation**: Export Brain facts as a "knowledge pack" (JSON). Import into another instance. Deduplicate on import.
**Risk**: Cross-contamination of project-specific knowledge.
**Effort**: 4-6 hours. Medium impact for multi-repo users.

### Q8: Autonomous Test Generation
**Status**: Agent can write tests when asked.
**Question**: Should the agent automatically generate tests for code it writes? And run them to verify?
**Implementation**: After each code edit, if no tests exist for the changed file → offer to generate tests → run them → fix failures.
**Risk**: Test generation costs tokens. Only do it for significant changes.
**Effort**: 2-4 hours (integration work, not new — vitest and test generation already exist).
**Impact**: Very high for code quality.

### Q9: Conversation-Aware Routing
**Status**: Router classifies each message independently.
**Question**: Should routing consider conversation history? Example: If the last 3 messages were about refactoring auth, the 4th message ("also fix the logout") should route to the auth module without re-classification.
**Implementation**: Maintain a `conversation_context` object that tracks active module/task. Weight it heavily in routing decisions.
**Effort**: 2-3 hours. Medium impact for conversation flow.

### Q10: Cost-Model for Tree Search
**Status**: Tree search framework built but uses mock executor.
**Question**: What's the actual cost-benefit? Tree search costs 2-3x tokens per task. Is the quality improvement worth it?
**Approach**: Run A/B tests — same tasks with and without tree search. Compare: success rate, rework needed, time to completion, token cost.
**Effort**: 4-6 hours (build A/B framework + run experiments).
**Impact**: Determines whether tree search is worth using in production.

---

## Phase 10 Roadmap (Ordered by Impact × Feasibility)

### 10.1 Repo Map from Knowledge Graph [4h, HIGH]
Generate Aider-style repo map from GraphDB. Inject into agent context. ~1K tokens replaces 20K tokens of file reads.

### 10.2 Adaptive Context Management [4h, HIGH]
Router annotates task complexity → context assembler adjusts level. Cuts average context 30-50%.

### 10.3 Conversation-Aware Routing [2h, MEDIUM]
Track active module/task across messages. Reduces misrouting.

### 10.4 Handoff Pattern [5h, HIGH]
Modules can delegate to other modules. Enables multi-step workflows.

### 10.5 Autonomous Test Generation [3h, VERY HIGH]
After code edits, auto-generate and run tests. Catches bugs immediately.

### 10.6 Self-Editing Memory [4h, MEDIUM]
Agent writes to its own Brain within budget. Self-improving over time.

### 10.7 Knowledge Pack Export/Import [5h, MEDIUM]
Share learned patterns across repos/instances.

### 10.8 Browser Automation Tool [10h, VERY HIGH]
Headless browser for visual verification of web changes.

### 10.9 Tree Search A/B Testing [5h, MEDIUM]
Measure actual value of tree search vs single-path execution.

### 10.10 Streaming Diff Application [7h, MEDIUM]
Apply diffs as they stream. Faster perceived response.

### Total: ~49 hours

---

## The Big Picture: Where Cocapn is Heading

### Current State (End of Phase 9)
Cocapn is a **repo-first agent runtime** with:
- Modular architecture (hot/cold skill loading)
- Intelligent search (hybrid keyword + semantic)
- Structural awareness (knowledge graph)
- Exploration capability (tree search)
- Efficiency measurement (token tracker)
- Template system (deploy themed instances)
- Social layer (profiles, activity feed, magazine)

### Near-Term Vision (Phase 10)
A **self-assembling, self-improving agent** that:
- Reads its repo and generates a map of capabilities
- Dynamically loads only what it needs for each task
- Routes intelligently based on conversation context
- Writes tests for its own code
- Learns from both successes and failures
- Shares knowledge across instances

### Long-Term Vision
The **npm of AI agents**:
- Anyone can create a template (skill cartridges + modules + personality)
- Templates published to a registry (ClawHub)
- Others install with `cocapn template install`
- Each instance self-assembles based on the repo it lives in
- The ecosystem grows organically
- Templates improve through community contributions

### The Differentiator
Every other agent framework (Aider, Cline, Windsurf, Cursor) is a **tool for humans**. Cocapn is a **runtime for agents**. The agent IS the product. The repo IS the configuration.

This is the "becomes anything" pattern from i-know-kung-fu, scaled to a full platform.

---

*Research compiled 2026-03-29*
