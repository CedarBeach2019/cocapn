# Code Review — Principal Engineer
## Modules: Bridge 6.5/10, LLM 7/10, Brain 6/10, Multi-Tenant 7.5/10, Queue 8/10

### Top 5 Issues for v0.2.0:
1. Bridge: No graceful shutdown (listeners not closed, pending promises abandoned)
2. Brain: No file locking for concurrent Git writes (race condition)
3. LLM: No connection pooling (new TCP connection per request)
4. Multi-Tenant: Usage counter not atomic (concurrent requests can undercount)
5. Queue: No dead-letter queue (failed items lost after max retries)

### Top 3 Things Done Well:
1. Plugin sandbox permission preamble (creative approach to Node.js sandboxing)
2. Request queue with backpressure and tenant-aware concurrency
3. Conversation memory with regex fact extraction (practical, no LLM dependency)

### Overall: "Good v0.1. Ship it. Fix these for v0.2."
