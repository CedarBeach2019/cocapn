# TRIPARTITE.md — The Pathos/Logos/Ethos Architecture

> *"The outside world speaks to Pathos. Pathos speaks to Logos. Logos speaks to Ethos. Ethos speaks to the hardware. The hardware speaks back."*

---

## Overview

Cocapn uses a **Tripartite Architecture** adapted from SuperInstance's tripartite-rs. Three concerns — not three separate repos, but three layers of responsibility within every cocapn-powered system.

```
┌─────────────────────────────────────────────────────────────┐
│                     OUTSIDE WORLD                            │
│  Users, other agents (A2A), web apps, APIs, sensors, UIs   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  PATHOS — The Face                                          │
│  Intent extraction, identity, relationship, white-label      │
│  "What does the user actually want?"                         │
│  Public repo. Forkable. No secrets.                          │
└──────────────────────────┬──────────────────────────────────┘
                           │ A2A Manifest
┌──────────────────────────▼──────────────────────────────────┐
│  LOGOS — The Brain                                          │
│  Memory, reasoning, intelligence, code, knowledge            │
│  "How do we accomplish this?"                                │
│  Private repo. Holds secrets. The cocapn seed IS Logos.      │
└──────────────────────────┬──────────────────────────────────┘
                           │ Validated Instructions
┌──────────────────────────▼──────────────────────────────────┐
│  ETHOS — The Hands                                          │
│  Hardware, OS, execution, reflexes, muscle memory            │
│  "How do we actually do this?"                               │
│  Device-specific. Jetson, Pi, Cloud, Docker.                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   HARDWARE / CLOUD                            │
│  Cameras, motors, GPUs, APIs, databases, sensors             │
└─────────────────────────────────────────────────────────────┘
```

---

## The Three Concerns

### 1. PATHOS — The Face (Public)

**Domain:** Understanding what the outside world wants.

Pathos is the relationship layer. It's the white-label face of every cocapn product. It receives raw input from humans, other agents, APIs, and sensors, and transforms it into clear intent.

**Responsibilities:**
- Intent extraction (what does the user actually want?)
- Persona detection (novice, expert, casual, formal)
- Identity management (who is this user?)
- White-label customization (every deployment has unique Pathos)
- Relationship building (learning preferences over time)
- Input normalization (voice, text, API, A2A → unified format)

**Pathos has NO access to secrets.** It can't read API keys, can't access private memory, can't execute code. It's the safe, forkable public face.

**Per-product examples:**
| Product | Pathos |
|---|---|
| personallog.ai | Warm personal assistant personality |
| businesslog.ai | Professional team interface |
| makerlog.ai | IDE UX, code-focused |
| fishinglog.ai | Captain-facing wheelhouse interface |
| DMlog.ai | Dungeon Master personality |
| TaskFlow | Project manager chat |

### 2. LOGOS — The Brain (Private)

**Domain:** Logic, reasoning, memory, code.

Logos is the thinking layer. It receives clean intent from Pathos and determines what to do. It holds all memory, knowledge, and the application's vision. **The cocapn seed IS Logos** — memory.ts, context.ts, intelligence.ts, a2a.ts are all Logos.

**Responsibilities:**
- Memory management (facts, conversations, knowledge)
- Reasoning and decision-making
- Code intelligence (understanding the repo)
- A2A protocol (talking to other agents)
- Auto-research (background deep-dives)
- Knowledge base (wiki, documents, learned facts)
- Application logic (rules, workflows, business logic)
- Secret management (API keys, tokens)

**Logos holds ALL secrets.** It validates every request from Pathos before passing instructions to Ethos. It's the private repo — never forked, never public.

### 3. ETHOS — The Hands (Device)

**Domain:** Execution, hardware, reflexes.

Ethos is the operating system layer. It translates Logos's instructions into actual physical or digital actions. It knows the hardware capabilities and optimizes execution.

**Responsibilities:**
- Hardware management (GPU, memory, sensors, cameras)
- API execution (calling external services)
- Docker/container management
- File system operations
- Real-time sensor feedback loops
- Muscle memory (cached execution patterns)
- Reflexes (back-channel adjustments without bothering Logos)

**Ethos has NO access to secrets.** It only receives validated, sanitized instructions from Logos. It can't make decisions — only execute.

**The Cerebellum Pattern:**
Ethos handles low-level reflexes without bothering the thinking layer. Like walking:
- Vision center (Logos) sends: "obstacle ahead, 6 inches high"
- Ethos adjusts step height automatically
- Ethos back-channels: "adjusted, suggest longer stride"
- Logos barely notices — it's focused on the conversation

This is the key insight: **Ethos can operate semi-autonomously** for well-learned patterns. Only novel situations escalate to Logos.

---

## Chain of Command

### Data Flow

```
1. Input arrives → Pathos receives
2. Pathos extracts intent → generates A2A Manifest
3. Pathos sends Manifest to Logos
4. Logos validates intent against secrets/permissions
5. Logos reasons about what to do
6. Logos generates instructions for Ethos
7. Logos sends validated instructions to Ethos
8. Ethos executes on hardware/cloud
9. Results flow back: Ethos → Logos → Pathos → User
```

### The A2A Manifest (Pathos → Logos)

Adapted from SuperInstance's tripartite-rs:

```typescript
interface A2AManifest {
  id: string;
  timestamp: number;
  
  intent: {
    telos: string;                    // The actual goal
    query_type: 'generate' | 'analyze' | 'transform' | 'verify' | 'explain' | 'act';
    constraints: string[];            // Explicit + inferred limits
    priority: 'speed' | 'quality' | 'cost';
  };
  
  persona: {
    expertise_level: 'novice' | 'intermediate' | 'expert';
    communication_style: 'formal' | 'casual' | 'technical';
    user_id: string;
    session_id: string;
  };
  
  context_hints: {
    relevant_files: string[];
    related_queries: string[];
    domain: string;
    hardware_requirements?: string[];  // Hints for Ethos
  };
  
  verification_scope: {
    check_facts: boolean;
    check_hardware: boolean;
    check_safety: boolean;
    check_permissions: boolean;
  };
}
```

### Validated Instructions (Logos → Ethos)

```typescript
interface EthosInstruction {
  manifest_id: string;
  action: 'execute_code' | 'call_api' | 'read_file' | 'write_file' | 
          'control_hardware' | 'display' | 'play_audio' | 'deploy';
  target: string;                     // What to execute on
  payload: unknown;                   // Parameters
  timeout_ms: number;
  safety_level: 'read_only' | 'sandboxed' | 'privileged';
  resources: {
    max_memory_mb?: number;
    max_cpu_percent?: number;
    gpu_required?: boolean;
    network_access?: boolean;
  };
}
```

---

## Per-Product Mapping

### personallog.ai
```
PATHOS: Personal assistant personality, multi-channel input (Telegram, Discord, email)
LOGOS:  Personal memory, preferences, knowledge base, scheduling
ETHOS:  Cloudflare Workers (hosting), local device (mobile/desktop), API calls
```

### businesslog.ai
```
PATHOS: Professional team interface, user management, admin panel
LOGOS:  Team analytics, business rules, multi-user memory, reports
ETHOS:  Docker containers (sandboxing), Cloudflare Workers, database
```

### makerlog.ai
```
PATHOS: IDE UX, file browser, chat panel, terminal interface
LOGOS:  Code intelligence, repo map, CLAUDE.md generation, A2A, MCP
ETHOS:  File system operations, shell execution, git commands, tool APIs
```

### fishinglog.ai
```
PATHOS: Captain-facing wheelhouse interface, voice commands, alerts display
LOGOS:  Species classification logic, catch reporting, regulatory compliance, training
ETHOS:  Jetson Orin (GPU, cameras), microphone array, alert sounds, display
        — Reflex: species mismatch detection, confidence-based escalation
```

### DMlog.ai
```
PATHOS: Dungeon Master personality, narrative voice, scene descriptions
LOGOS:  World state, campaign memory, NPC relationships, quest tracking, rules engine
ETHOS:  Dice roller (crypto-random), combat math, UI rendering, effects
        — Reflex: initiative tracking, HP updates, status effect timers
```

---

## The Cerebellum Pattern (Ethos Reflexes)

### How It Works

Ethos maintains a cache of well-learned execution patterns. When a common situation arises, Ethos handles it without escalating to Logos:

```typescript
class EthosReflex {
  // Cached patterns: input fingerprint → execution action
  private reflexes: Map<string, ReflexPattern>;
  
  // Confidence threshold: below this, escalate to Logos
  private reflexConfidenceThreshold = 0.85;
  
  process(instruction: EthosInstruction): ReflexResult {
    // 1. Check for matching reflex
    const fingerprint = this.fingerprint(instruction);
    const reflex = this.reflexes.get(fingerprint);
    
    if (reflex && reflex.confidence >= this.reflexConfidenceThreshold) {
      // Execute reflex — no need to bother Logos
      return this.executeReflex(reflex);
    }
    
    // 2. No reflex — escalate to Logos for decision
    return { needsLogos: true, instruction };
  }
  
  // After successful execution, learn the pattern
  learn(instruction: EthosInstruction, result: ExecutionResult) {
    const fingerprint = this.fingerprint(instruction);
    const confidence = this.calculateConfidence(instruction, result);
    
    if (confidence > this.reflexConfidenceThreshold) {
      this.reflexes.set(fingerprint, { instruction, result, confidence });
    }
  }
}
```

### Real Examples

**Fishing vessel:**
- Camera detects fish → Ethos classifies species (reflex, 200ms) → only escalates to Logos if confidence < 85%
- Captain says "king in bin 1" → Ethos updates ground truth (reflex) → back-channels label to training
- Species mismatch detected → Ethos alerts immediately (reflex) → Logos logs for later review

**Robotics:**
- Pressure sensor on foot detects uneven ground → Ethos adjusts step height (reflex) → back-channel to Logos: "terrain changed"
- Vision center detects obstacle → Ethos plans step over (reflex) → Logos continues conversation unaware
- Novel terrain (ice, sand) → Ethos can't handle → escalates to Logos → Logos adjusts strategy

**DMLog:**
- Player attacks → Ethos rolls initiative (reflex) → resolves combat math (reflex) → narrates result
- Player tries something unexpected → Ethos can't handle → escalates to Logos → DM improvises
- NPC interaction → Ethos checks relationship (reflex) → adjusts response tone

---

## Security Model

### The Trust Boundary

```
┌─────────────────────────────────────────┐
│  PATHOS (Public)                        │
│  ✅ Can receive any input               │
│  ✅ Can detect intent                   │
│  ❌ CANNOT access secrets               │
│  ❌ CANNOT access private memory        │
│  ❌ CANNOT execute code                 │
│  ❌ CANNOT call external APIs           │
│  ✅ Forkable, auditable, safe           │
└────────────────┬────────────────────────┘
                 │ Manifest only (no secrets)
┌────────────────▼────────────────────────┐
│  LOGOS (Private)                        │
│  ✅ Has all secrets                     │
│  ✅ Has all memory                      │
│  ✅ Can reason and decide               │
│  ✅ Can validate and sanitize           │
│  ✅ Can generate instructions           │
│  ❌ NEVER directly executes on hardware │
│  ❌ NEVER exposes secrets to Pathos     │
│  🔒 Private repo, never forked          │
└────────────────┬────────────────────────┘
                 │ Sanitized instructions only
┌────────────────▼────────────────────────┐
│  ETHOS (Device)                         │
│  ✅ Can execute on hardware             │
│  ✅ Can call external APIs (validated)  │
│  ✅ Can manage containers               │
│  ✅ Can handle reflexes                 │
│  ❌ CANNOT see secrets                  │
│  ❌ CANNOT make autonomous decisions    │
│  🔒 Device-specific, isolated           │
└─────────────────────────────────────────┘
```

### Key Principles

1. **Pathos is expendable** — It's the public face. Compromise it and you lose the UI, not the data.
2. **Logos is the crown jewel** — All secrets, all memory, all intelligence. Protected by the trust boundary.
3. **Ethos is sandboxed** — It can only execute what Logos tells it to. No autonomous decision-making.
4. **No lateral movement** — Pathos can't talk to Ethos directly. Everything goes through Logos.
5. **Minimal exposure** — Secrets exist only in Logos. Even if Pathos or Ethos are compromised, secrets stay safe.

---

## Implementation for Cocapn Seed

### Module Structure

```typescript
// packages/seed/src/tripartite/
// ├── manifest.ts     — A2A Manifest type definitions
// ├── pathos.ts       — Intent extraction + persona detection
// ├── chain.ts        — Pathos → Logos → Ethos pipeline
// └── ethos.ts        — Hardware detection + execution routing
```

### manifest.ts
```typescript
export interface A2AManifest {
  id: string;
  timestamp: number;
  intent: {
    telos: string;
    query_type: 'generate' | 'analyze' | 'transform' | 'verify' | 'explain' | 'act';
    constraints: string[];
    priority: 'speed' | 'quality' | 'cost';
  };
  persona: {
    expertise_level: 'novice' | 'intermediate' | 'expert';
    communication_style: 'formal' | 'casual' | 'technical';
    user_id: string;
  };
  context_hints: {
    relevant_files: string[];
    domain: string;
  };
  verification_scope: {
    check_facts: boolean;
    check_hardware: boolean;
    check_safety: boolean;
  };
}

export interface EthosInstruction {
  manifest_id: string;
  action: string;
  target: string;
  payload: unknown;
  safety_level: 'read_only' | 'sandboxed' | 'privileged';
}
```

### pathos.ts
```typescript
// Lightweight intent extraction — uses the same LLM as chat
// but with a system prompt focused on structured output
export async function extractIntent(
  message: string,
  context: { userId: string; history: Message[] }
): Promise<A2AManifest> {
  // Build system prompt for intent extraction
  // Parse response into A2AManifest
  // Detect persona from message patterns + history
  // Return structured manifest
}
```

### ethos.ts
```typescript
// Hardware detection and execution routing
export function detectCapabilities(): HardwareCapabilities {
  // Check: GPU available? Memory? Camera? Audio? Network?
  // Return capabilities object
}

export async function execute(instruction: EthosInstruction): Promise<ExecutionResult> {
  // Route to appropriate executor based on instruction.action
  // Monitor execution, enforce timeout, handle errors
  // Log results for learning
}
```

### chain.ts
```typescript
// The full pipeline: input → Pathos → Logos → Ethos → output
export async function processInput(
  rawInput: string,
  context: ProcessingContext
): Promise<Response> {
  // 1. Pathos: extract intent
  const manifest = await extractIntent(rawInput, context);
  
  // 2. Logos: reason about what to do
  const instructions = await reason(manifest, context);
  
  // 3. Ethos: execute
  const results = await Promise.all(
    instructions.map(i => execute(i))
  );
  
  // 4. Format response for Pathos to deliver
  return formatResponse(results, manifest.persona);
}
```

---

## Comparison with tripartite-rs

| Aspect | tripartite-rs (SuperInstance) | Cocapn Tripartite |
|---|---|---|
| Language | Rust | TypeScript |
| Architecture | 3 separate agent processes | 3 concerns within one system |
| Consensus | All 3 must agree (85% threshold) | Chain of command (sequential) |
| Pathos | Intent extraction via local model | Intent extraction via LLM |
| Logos | RAG + LoRA loading + reasoning | Memory + context + intelligence |
| Ethos | Fact-check + safety + hardware verify | Hardware execution + reflexes |
| Veto | Ethos has veto power | Logos validates, Ethos executes |
| Deployment | Local kernel | Local + Cloud + Docker |
| Secrets | Token vault (SQLite) | Private repo only |
| Knowledge | Vector DB (Knowledge Vault) | Flat JSON + git-native |

### What We Adopt
- ✅ A2A Manifest format (intent → action pipeline)
- ✅ Three-concern separation (Pathos/Logos/Ethos)
- ✅ Security model (no lateral movement)
- ✅ Persona detection and adaptation
- ✅ Verification scope (facts, hardware, safety)

### What We Adapt
- Chain of command instead of consensus (simpler, faster)
- Ethos as execution layer instead of verification layer
- Ethos has reflexes (cerebellum pattern) — our novel addition
- Logos holds secrets instead of separate token vault
- TypeScript instead of Rust (broader ecosystem)

### What We Extend
- Ethos as hardware OS (Jetson, Pi, ESP32, cloud)
- Pathos as white-label (every deployment unique)
- Reflex system (back-channel, muscle memory)
- The walking analogy for human-like autonomy
- Multi-device coordination (fleet of Ethos agents)

---

## Future Evolution

### Phase 1: Current
- Pathos = chat UI with personality
- Logos = cocapn seed (memory, intelligence, A2A)
- Ethos = Cloudflare Workers + file system

### Phase 2: Reflexes
- Ethos learns common patterns
- Back-channel communication (Ethos → Logos hints)
- Reduced latency for common operations

### Phase 3: Autonomy
- Pathos anticipates user needs (proactive suggestions)
- Logos reasons about goals, not just queries
- Ethos handles more complex hardware independently

### Phase 4: Emergence
- Pathos, Logos, Ethos each learn from their domain
- The system becomes more than the sum of its parts
- Human sets goals, system figures out how to achieve them
- The agent IS the application — self-improving, self-evolving

---

*"The unexamined code is not worth shipping. The unexamined hardware is not worth trusting."*

— Adapted from Socrates, by the cocapn collective

---

*Last updated: 2026-03-31*
*Inspired by: SuperInstance's tripartite-rs (github.com/Lucineer/tripartite-rs)*
