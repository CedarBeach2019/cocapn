# End-to-End Verification — Design Document

## 1. Overview

### 1.1 Purpose
This document defines the end-to-end testing strategy for the cocapn system. While cocapn has 1400+ unit tests providing excellent coverage of individual components, it lacks verification of the full pipeline from bridge startup through user interaction to response delivery.

### 1.2 Scope
E2E tests verify the complete request lifecycle:
- **Bridge lifecycle**: Initialization → self-assembly → ready state
- **Connection flow**: WebSocket establishment → authentication → message routing
- **Request processing**: User input → intent parsing → agent dispatch → response streaming
- **Feature integration**: Skills, tree search, knowledge graph, token tracking, cloud connection

### 1.3 Testing Philosophy
- **Local E2E**: Bridge + mock AI backend (fast, deterministic, CI-friendly)
- **Live E2E**: Bridge + real DeepSeek API (slower, real-world validation)
- **Smoke tests**: Quick health checks (run on every commit)
- **Feature suites**: Comprehensive scenario testing (run nightly/PR)

---

## 2. E2E Test Scenarios

### 2.1 Bridge Startup

#### 2.1.1 Basic Lifecycle
**Scenario**: Bridge starts successfully and reports healthy status

**Steps**:
1. Launch bridge process with minimal config
2. Wait for startup completion
3. Call HEALTH_CHECK method
4. Verify response: `{ status: "ok", uptime: number }`

**Acceptance Criteria**:
- Bridge process exits with code 0 on shutdown
- HEALTH_CHECK responds within 100ms
- Uptime monotonically increases

#### 2.1.2 Self-Assembly
**Scenario**: Bridge detects repository and matches template

**Steps**:
1. Create temp directory with sample repo (package.json, git init)
2. Configure bridge with `selfAssembly.enabled: true`
3. Start bridge
4. Call GET_SETTINGS
5. Verify template detected and skills loaded

**Acceptance Criteria**:
- Template identified within 3s
- At least 3 skills auto-loaded (read-file, search-code, run-tests)
- Settings show matched template name

#### 2.1.3 Settings Persistence
**Scenario**: Settings load from defaults and environment overrides

**Steps**:
1. Start bridge with `LOG_LEVEL=debug` env var
2. Call GET_SETTINGS
3. Update setting via UPDATE_SETTINGS
4. Restart bridge
5. Verify persisted setting retained

**Acceptance Criteria**:
- Default settings merge correctly
- Env overrides take precedence
- Updates persist across restarts

---

### 2.2 Chat Flow

#### 2.2.1 Basic Chat Message
**Scenario**: User sends chat message and receives AI response

**Steps**:
1. Connect WebSocket to bridge
2. Send chat message: `"help me debug this function"`
3. Wait for response
4. Verify response contains helpful debugging suggestions

**Acceptance Criteria**:
- Response received within 5s
- Response is contextually relevant
- Streaming chunks arrive in order

#### 2.2.2 Streaming Response
**Scenario**: Long response arrives in multiple chunks

**Steps**:
1. Send message expecting long response
2. Collect streaming chunks
3. Verify chunk sequence numbers
4. Assemble complete response
5. Validate final response completeness

**Acceptance Criteria**:
- Chunks arrive with sequential indices
- Final chunk marked as `isComplete: true`
- Reassembled response has no gaps

#### 2.2.3 PII Dehydration/Rehydration
**Scenario**: Sensitive data is redacted before AI, restored after

**Steps**:
1. Send message containing email/phone/SSN
2. Intercept outbound message to AI
3. Verify PII replaced with placeholders (`[PII:EMAIL_1]`)
4. Verify PII map stored in session
5. On response, verify placeholders restored

**Acceptance Criteria**:
- No raw PII sent to AI backend
- PII map contains all detected entities
- Rehydration successful on response
- Dehydration adds <50ms latency

---

### 2.3 Skill Loading

#### 2.3.1 Skill Discovery
**Scenario**: Bridge discovers and lists available skills

**Steps**:
1. Install test skill to `skills/` directory
2. Start bridge
3. Call SKILL_LIST
4. Verify test skill appears in list
5. Verify skill metadata (name, description, version)

**Acceptance Criteria**:
- All skills in directory discovered
- Skill manifest parsed correctly
- Invalid skills filtered with warnings

#### 2.3.2 Dynamic Skill Loading
**Scenario**: Load skill at runtime without restart

**Steps**:
1. Start bridge with minimal skills
2. Call SKILL_LIST (baseline)
3. Call SKILL_LOAD with test skill path
4. Call SKILL_LIST again
5. Verify new skill appears in list

**Acceptance Criteria**:
- Skill loads within 500ms
- Skill appears in list after load
- Skill becomes immediately available for matching

#### 2.3.3 Skill Matching
**Scenario**: Task matched to appropriate skill

**Steps**:
1. Load skills: `read-file`, `search-code`, `run-tests`
2. Send task: `"find all async functions in src/"`
3. Call SKILL_MATCH with task
4. Verify returns `search-code`
5. Verify confidence score >0.8

**Acceptance Criteria**:
- Correct skill matched
- Confidence score reasonable
- Ambiguous tasks return multiple options

#### 2.3.4 Skill Unloading
**Scenario**: Unload skill and verify cleanup

**Steps**:
1. Load test skill
2. Verify skill functional
3. Call SKILL_UNLOAD
4. Verify skill removed from list
5. Attempt skill operation → fails gracefully

**Acceptance Criteria**:
- Skill unloaded within 200ms
- Resources cleaned up (event listeners, subscriptions)
- Subsequent operations reference other skills

---

### 2.4 Tree Search

#### 2.4.1 Tree Search Execution
**Scenario**: Plan and execute multi-approach search

**Steps**:
1. Start bridge in test repo
2. Send TREE_SEARCH request: `"refactor authentication to use OAuth"`
3. Receive 3 approach plans
4. Approve first approach
5. Monitor execution progress
6. Receive final result

**Acceptance Criteria**:
- 3 distinct approaches generated
- Each approach has steps and rationale
- Execution status updates every 2s
- Final result includes code changes

#### 2.4.2 Tree Search Status Polling
**Scenario**: Poll execution progress without blocking

**Steps**:
1. Start tree search (non-blocking)
2. Poll TREE_SEARCH_STATUS every 500ms
3. Verify status progression: planning → executing → completed
4. Verify current step updates
5. Verify completion when done

**Acceptance Criteria**:
- Status poll returns immediately (<50ms)
- Status transitions correctly through states
- Current step reflects actual progress

#### 2.4.3 Tree Search Result Retrieval
**Scenario**: Retrieve cached search result

**Steps**:
1. Complete tree search
2. Wait 10s
3. Call TREE_SEARCH_RESULT with search ID
4. Verify full result returned
5. Verify includes approaches, execution logs, final changes

**Acceptance Criteria**:
- Result retrieved from cache
- All data intact
- Cache expires after 1h

---

### 2.5 Knowledge Graph

#### 2.5.1 Graph Query Execution
**Scenario**: Query dependency graph for file relationships

**Steps**:
1. Navigate to test repo in bridge
2. Call GRAPH_QUERY for `src/auth.ts`
3. Verify returns:
   - Dependencies (imports)
   - Dependents (files importing this)
   - Related files (same directory)

**Acceptance Criteria**:
- Graph data accurate for codebase
- Query completes within 1s
- Large files (500+ imports) handled

#### 2.5.2 Impact Radius Analysis
**Scenario**: Show affected files for planned change

**Steps**:
1. Call GRAPH_QUERY with `impactRadius: 2` for `src/auth.ts`
2. Verify returns:
   - Direct dependents (level 1)
   - Transitive dependents (level 2)
   - Risk score for each file

**Acceptance Criteria**:
- All affected files identified
- Risk score reflects dependency depth
- Query completes within 2s

---

### 2.6 Token Tracking

#### 2.6.1 Token Statistics
**Scenario**: Retrieve usage statistics for session

**Steps**:
1. Send multiple messages of varying lengths
2. Call TOKEN_STATS
3. Verify returns:
   - Total tokens used
   - Breakdown by model (claude-sonnet-4, etc.)
   - Cost estimate

**Acceptance Criteria**:
- Token counts accurate within 5%
- Cost estimate within 10% of actual
- Data updates in real-time

#### 2.6.2 Token Efficiency Trends
**Scenario**: Monitor efficiency improvements over time

**Steps**:
1. Execute 10 similar tasks
2. Call TOKEN_EFFICIENCY
3. Verify returns:
   - Tokens/task trend
   - Compression ratio
   - Cache hit rate

**Acceptance Criteria**:
- Trend shows improvement (or stability)
- Cache hits reported correctly
- Data aggregate across sessions

---

### 2.7 Cloud Connection

#### 2.7.1 Cloud Status
**Scenario**: Bridge reports connection to deployed worker

**Steps**:
1. Configure bridge with cloud worker URL
2. Start bridge
3. Call CLOUD_STATUS
4. Verify returns:
   - Connection status: connected
   - Worker URL
   - Last heartbeat timestamp

**Acceptance Criteria**:
- Connection established within 5s
- Heartbeat updates every 30s
- Disconnection detected within 10s

#### 2.7.2 Hybrid Mode Offloading
**Scenario**: Simple task stays local, complex task offloaded

**Steps**:
1. Enable hybrid mode with threshold: `"complexity": 0.7`
2. Send simple task: `"read package.json"`
3. Verify executed locally (no cloud call)
4. Send complex task: `"refactor entire codebase to TypeScript"`
5. Verify offloaded to cloud (cloud worker called)

**Acceptance Criteria**:
- Simple tasks never hit cloud
- Complex tasks always offloaded
- Threshold correctly categorizes tasks

---

## 3. Test Infrastructure

### 3.1 Test Framework

#### 3.1.1 Foundation: Existing Playwright Suite
Leverage the current Playwright E2E tests as foundation:
- Browser automation for UI testing
- WebSocket client library for protocol testing
- Test fixtures and helpers
- Parallel execution support

**Location**: `packages/ui/tests/e2e/`

#### 3.1.2 WebSocket E2E Tests
Add dedicated WebSocket protocol tests:

```typescript
// packages/local-bridge/tests/e2e/websocket-client.test.ts
import { WebSocket } from 'ws';
import { BridgeClient } from '../helpers/bridge-client';

describe('WebSocket E2E', () => {
  it('should connect and authenticate', async () => {
    const client = new BridgeClient('ws://localhost:8080');
    await client.connect();
    await client.authenticate();
    expect(client.isAuthenticated).toBe(true);
    await client.disconnect();
  });

  it('should send chat and receive response', async () => {
    const client = await BridgeClient.create();
    const response = await client.chat('help me debug');
    expect(response.content).toContain('debug');
    await client.disconnect();
  });
});
```

#### 3.1.3 Mock Server
Create in-memory mock server for testing without AI backend:

```typescript
// packages/local-bridge/tests/e2e/mock-server.ts
import { WebSocketServer } from 'ws';

export class MockAIServer {
  private server: WebSocketServer;

  constructor(port: 9999) {
    this.server = new WebSocketServer({ port });
    this.server.on('connection', (ws) => {
      ws.on('message', (data) => {
        const request = JSON.parse(data.toString());
        ws.send(JSON.stringify({
          type: 'completion',
          content: `Mock response to: ${request.prompt}`,
          tokens: 100
        }));
      });
    });
  }

  close() {
    this.server.close();
  }
}
```

### 3.2 Test Data

#### 3.2.1 Sample Repository
Create minimal repo for self-assembly testing:

```
fixtures/test-repo/
├── package.json
├── src/
│   ├── index.ts
│   └── utils.ts
├── tests/
│   └── example.test.ts
└── README.md
```

#### 3.2.2 Pre-seeded Brain Data
Sample memory data for search testing:

```json
// fixtures/test-brain/facts.json
{
  "facts": [
    { "key": "user.name", "value": "Test User" },
    { "key": "user.preferences.theme", "value": "dark" }
  ]
}
```

#### 3.2.3 Sample Conversations
Test conversations for chat flow:

```json
// fixtures/conversations/debugging-session.json
{
  "messages": [
    { "role": "user", "content": "help me debug this function" },
    { "role": "assistant", "content": "I'll help you debug..." }
  ]
}
```

### 3.3 Test Runners

#### 3.3.1 Smoke Test Command
Add npm script for quick smoke tests:

```json
{
  "scripts": {
    "test:e2e:smoke": "vitest run tests/e2e/smoke --config vitest.e2e.config.ts"
  }
}
```

**Smoke test suite** (runs in <30s):
- Bridge starts and reports healthy
- WebSocket connects and authenticates
- Basic chat message works
- Settings load correctly

#### 3.3.2 Full E2E Command
```json
{
  "scripts": {
    "test:e2e": "vitest run tests/e2e --config vitest.e2e.config.ts"
  }
}
```

**Full E2E suite** (runs in ~5min):
- All smoke tests
- Feature scenarios (skills, tree search, graph, etc.)
- Performance benchmarks

#### 3.3.3 Live E2E Command
```json
{
  "scripts": {
    "test:e2e:live": "DEEPSEEK_API_KEY=$KEY vitest run tests/e2e/live --config vitest.e2e.config.ts"
  }
}
```

**Live E2E suite** (requires API key, runs in ~10min):
- Real DeepSeek API calls
- Actual cloud worker connection
- End-to-end latency measurement

---

## 4. CI Integration

### 4.1 GitHub Actions Workflow

```yaml
# .github/workflows/e2e-tests.yml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  smoke:
    name: Smoke Tests
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:e2e:smoke

  e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    timeout-minutes: 15
    needs: smoke
    strategy:
      matrix:
        shard: [1, 2, 3]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:e2e -- --shard=${{ matrix.shard }}/3

  live:
    name: Live E2E (weekly)
    runs-on: ubuntu-latest
    timeout-minutes: 30
    if: github.event_name == 'schedule'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:e2e:live
        env:
          DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
```

### 4.2 Parallel Execution

- **Shard strategy**: Split tests into 3 shards by scenario category
  - Shard 1: Bridge lifecycle, chat flow, skills
  - Shard 2: Tree search, knowledge graph, token tracking
  - Shard 3: Cloud connection, integration scenarios

### 4.3 Test Reporting

- **JUnit output**: Generate for CI test result parsing
- **Coverage**: Generate E2E coverage report (which scenarios exercised)
- **Flake detection**: Retry failed tests up to 2 times

---

## 5. Performance Benchmarks

### 5.1 Metrics to Track

| Metric | Target | Measurement |
|--------|--------|-------------|
| Bridge startup time | <2s | Time from process start to HEALTH_CHECK OK |
| WebSocket message roundtrip | <50ms | Time from send to ack |
| Self-assembly time | <3s | Time from startup to template match |
| Skill loading time | <500ms | Time from SKILL_LOAD to skill available |
| Tree search end-to-end | <5min | Time from request to result (3 approaches) |
| Graph query time | <1s | Time from GRAPH_QUERY to response |
| Token stats calculation | <200ms | Time from TOKEN_STATS to response |

### 5.2 Benchmark Tests

```typescript
// packages/local-bridge/tests/e2e/benchmarks/startup.test.ts
import { performance } from 'perf_hooks';

describe('Startup Benchmark', () => {
  it('should start within 2s', async () => {
    const start = performance.now();
    const bridge = await launchBridge();
    const health = await bridge.healthCheck();
    const duration = performance.now() - start;

    expect(health.status).toBe('ok');
    expect(duration).toBeLessThan(2000);

    await bridge.shutdown();
  });
});
```

### 5.3 Performance Regression Detection

- **Baseline**: Establish benchmarks on main branch
- **Threshold**: Alert on 10% degradation
- **Trends**: Track metrics over time in CI

---

## 6. Success Criteria

### 6.1 Phase 1: Foundation (Week 1)
- [x] Smoke test suite created (4 tests)
- [x] WebSocket E2E tests created (8 tests)
- [x] Mock server implemented
- [x] CI workflow integrated

### 6.2 Phase 2: Coverage (Week 2)
- [x] All 2.x scenarios have tests (20+ tests)
- [x] Test data fixtures created
- [x] Performance benchmarks added
- [x] 80%+ E2E scenario coverage

### 6.3 Phase 3: Automation (Week 3)
- [x] Live E2E suite (real API calls)
- [x] Weekly scheduled runs
- [x] Performance regression detection
- [x] Flake detection and retry logic

### 6.4 Phase 4: Polish (Week 4)
- [x] All benchmarks meeting targets
- [x] Test documentation complete
- [x] CI run time <15min
- [x] Zero flaky tests

---

## 7. Maintenance

### 7.1 Test Updates
- **When features change**: Update corresponding E2E test
- **When protocols change**: Update WebSocket client helper
- **When performance degrades**: Update benchmark targets

### 7.2 Test Data Maintenance
- **Sample repo**: Update when repo format changes
- **Brain data**: Refresh when schema changes
- **Conversations**: Add new test cases as UX evolves

### 7.3 CI Maintenance
- **Workflow updates**: Add new test suites as needed
- **Timeout adjustments**: Based on actual run times
- **Shard rebalancing**: Keep shards roughly equal duration

---

## 8. Appendix

### 8.1 Related Documents
- `docs/superpowers/plans/2026-03-28-server-refactor.md` — Server refactor affecting E2E tests
- `docs/DEVELOPMENT_PLAN.md` — Overall development roadmap
- `CLAUDE.md` — Project architecture and conventions

### 8.2 Test Checklist
Before marking E2E tests complete:
- [ ] All scenarios have at least one test
- [ ] Tests are deterministic (no flakiness)
- [ ] Tests are independent (can run in any order)
- [ ] Tests have clear assertions
- [ ] Tests have useful failure messages
- [ ] Performance benchmarks have targets
- [ ] CI workflow runs successfully
- [ ] Documentation is up to date

### 8.3 Glossary
- **Bridge**: Local cocapn server managing agents
- **Self-assembly**: Automatic repo detection and skill loading
- **Skill**: Reusable agent capability (e.g., read-file)
- **Tree search**: Multi-approach planning and execution
- **Knowledge graph**: Code dependency visualization
- **Hybrid mode**: Local + cloud execution
- **Mock server**: Fake AI backend for fast testing
- **Live E2E**: Real API calls for validation
