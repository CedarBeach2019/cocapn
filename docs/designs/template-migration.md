# LOG.ai → Cocapn Template Migration

## 1. Overview

This document describes the migration strategy for converting eight existing LOG.ai codebases into installable cocapn template packages. The migration preserves each domain's unique personality, routing logic, and components while consolidating shared functionality into cocapn core.

### Goals

1. **Zero code duplication** — shared functionality lives in cocapn core, templates contain only differentiation
2. **Personality preservation** — each template maintains its unique voice and character
3. **Component portability** — Preact+HTM components become installable template assets
4. **Routing capture** — intent routing rules extracted and versioned with templates
5. **Theme encapsulation** — branding, colors, and typography self-contained in templates

### Migration Scope

| Source Repo | Target Template | Domain | Primary Persona |
|-------------|-----------------|--------|------------------|
| log-origin | `default` | personallog.ai | Helpful AI Assistant |
| dmlog-ai | `dmlog` | dmlog.ai | Dramatic Dungeon Master |
| studylog-ai | `studylog` | studylog.ai | Patient Tutor |
| makerlog-ai | `makerlog` | makerlog.ai | Focused Dev Companion |
| playerlog-ai | `playerlog` | playerlog.ai | Gaming Buddy |
| reallog-ai | `reallog` | reallog.ai | Grounded Advisor |
| activelog-ai | `activelog` | activelog.ai | Energetic Coach |
| businesslog-ai | `businesslog` | businesslog.ai | Professional Executive Assistant |

---

## 2. Template Anatomy

Each template package is a self-contained directory with standardized structure:

```
templates/<template-name>/
├── cocapn-template.json    # Template metadata and dependencies
├── personality.md           # System prompt / soul definition
├── routes.json              # Intent routing rules
├── theme.json               # Visual identity (colors, fonts, logo)
├── components/              # Template-specific Preact+HTM components
│   ├── *.js                # Component implementations
│   └── components.json      # Component registry
├── skills/                  # Template-specific skill cartridges
│   ├── *.skill              # Skill definition files
│   └── skills.json          # Skill manifest
├── config/                  # Template configuration overrides
│   ├── cocapn.yml           # Default bridge config
│   └── cocapn-private.yml   # Private config template (gitignored)
└── README.md                # Template documentation
```

### 2.1 cocapn-template.json

Metadata file defining template identity and compatibility:

```json
{
  "name": "dmlog",
  "version": "1.0.0",
  "displayName": "DMlog AI",
  "description": "TTRPG-focused AI assistant with dice rolling, character tracking, and campaign management",
  "author": "Superinstance",
  "homepage": "https://dmlog.ai",
  "cocapn": {
    "minVersion": "0.12.0",
    "maxVersion": "1.0.0"
  },
  "domains": ["dmlog.ai"],
  "features": [
    "dice-roller",
    "character-stats",
    "npc-panel",
    "combat-tracker",
    "map-canvas"
  ],
  "components": ["components/dice-roller.js", "components/character-sheet.js"],
  "skills": ["skills/ttrpg-rules.skill", "skills/npc-generator.skill"],
  "theme": "theme.json",
  "personality": "personality.md",
  "routes": "routes.json"
}
```

### 2.2 personality.md

The soul of the template — system prompt that defines agent behavior:

```markdown
# DMlog AI Personality

You are a dramatic Dungeon Master, weaving tales of adventure and peril. Your responses should:

1. Maintain narrative tension and suspense
2. Use vivid sensory descriptions
3. Embrace theatrical language and dramatic flair
4. Balance challenge with fairness
5. Adapt to player agency and unexpected choices

## Voice
- Theatrical, immersive, descriptive
- Second-person present tense ("You stand at the cliff's edge...")
- Rich sensory details (sounds, smells, textures)

## Constraints
- Never break character or acknowledge being AI
- Always offer meaningful choices
- Roll dice transparently when randomness is called for
```

### 2.3 routes.json

Intent routing rules extracted from LOG.ai routing logic:

```json
{
  "version": "1.0.0",
  "rules": [
    {
      "id": "dice-roll",
      "patterns": ["roll .*d\\d+", "r(oll)? \\d+d\\d+"],
      "action": "invoke-tool",
      "tool": "dice-roller",
      "confidence": 0.95
    },
    {
      "id": "character-query",
      "patterns": ["what are my.*stats", "show.*character", "hp.*level"],
      "action": "read-state",
      "stateKey": "character",
      "context": "character-sheet"
    },
    {
      "id": "combat-mode",
      "patterns": ["initiative", "combat", "attack roll", "damage"],
      "action": "switch-context",
      "context": "combat-tracker",
      "confidence": 0.9
    }
  ]
}
```

### 2.4 theme.json

Visual identity configuration:

```json
{
  "colors": {
    "primary": "#FFD700",
    "secondary": "#4A0080",
    "accent": "#FF6B35",
    "background": "#1A1A2E",
    "surface": "#16213E",
    "text": "#EAEAEA",
    "textSecondary": "#A0A0A0"
  },
  "typography": {
    "fontFamily": "\"Cinzel\", serif",
    "headingFont": "\"MedievalSharp\", cursive",
    "monoFont": "\"Fira Code\", monospace"
  },
  "logo": "assets/logo.svg",
  "favicon": "assets/favicon.ico",
  "styles": {
    "borderRadius": "8px",
    "buttonStyle": "ornate"
  }
}
```

---

## 3. Per-Template Mapping

### 3.1 log-origin → `default` Template

**Overview**: Base template for personallog.ai — the helpful AI assistant persona.

| Aspect | Source (log-origin) | Target (cocapn core vs template) |
|--------|---------------------|-----------------------------------|
| **Core Features** | Auth, streaming, PII, sessions, feedback, drafts, rate limiting, health checks | **cocapn core** — ALL shared functionality |
| **Personality** | Generic helpful assistant | `personality.md` — "You are a helpful AI assistant..." |
| **Routing** | 16 intent rules (base set) | `routes.json` — generic routing patterns |
| **Theme** | Minimal blue/gray scheme | `theme.json` — neutral professional colors |
| **Components** | Chat, sidebar, settings, analytics | **cocapn core** — base UI components |
| **Skills** | None (base Claude capabilities) | Empty `skills/` directory |

**Template Contents**:
```
templates/default/
├── cocapn-template.json    # Metadata: "default" template
├── personality.md           # "You are a helpful AI assistant..."
├── routes.json              # Generic routing (search, chat, settings)
├── theme.json               # Neutral blue/gray theme
└── README.md                # "Default cocapn template"
```

**Unique Features**: None — this is the baseline from which all others extend.

---

### 3.2 dmlog-ai → `dmlog` Template

**Overview**: TTRPG-focused template with dramatic Dungeon Master personality.

| Aspect | Source (dmlog-ai) | Target (cocapn core vs template) |
|--------|-------------------|-----------------------------------|
| **Core Features** | Auth, streaming, PII, sessions, etc. | **cocapn core** |
| **Personality** | Dramatic Dungeon Master | `personality.md` — theatrical, narrative voice |
| **Routing** | +4 TTRPG-specific rules | `routes.json` — dice rolls, character queries, combat |
| **Theme** | Gold/purple "ornate" style | `theme.json` — `#FFD700` primary, Cinzel font |
| **Components** | 5 custom components | `components/` — dice-roller, character-sheet, npc-panel, combat-tracker, map-canvas |
| **Skills** | TTRPG rules knowledge | `skills/` — ttrpg-rules.skill, npc-generator.skill |

**Template Contents**:
```
templates/dmlog/
├── cocapn-template.json
├── personality.md           # "You are a dramatic Dungeon Master..."
├── routes.json              # 20 rules (16 base + 4 TTRPG)
├── theme.json               # Gold/purple, ornate style
├── components/
│   ├── dice-roller.js       # D20 rolling with animation
│   ├── character-sheet.js   # Stats, HP, inventory
│   ├── npc-panel.js         # NPC quick reference
│   ├── combat-tracker.js    # Initiative, damage, conditions
│   ├── map-canvas.js        # Grid-based battle map
│   └── components.json      # Component registry
├── skills/
│   ├── ttrpg-rules.skill    # 5E/D&D rules reference
│   ├── npc-generator.skill  # NPC creation prompts
│   └── skills.json
└── README.md
```

**Unique Mapping Table**:

| LOG.ai Feature | Cocapn Target |
|----------------|---------------|
| `/roll` command | `components/dice-roller.js` + route rule |
| Character stats UI | `components/character-sheet.js` |
| NPC quick ref | `components/npc-panel.js` |
| Combat tracker | `components/combat-tracker.js` |
| Battle map canvas | `components/map-canvas.js` |
| TTRPG system prompt | `personality.md` |
| Gold/purple theme | `theme.json` |

**Migration Notes**:
- Dice roller uses Web Animations API — cocapn core must expose animation primitives
- Map canvas requires 2D context access — template must request `canvas` permission
- NPC generator skill uses structured prompting — requires cocapn skill format v1.1+

---

### 3.3 studylog-ai → `studylog` Template

**Overview**: Education-focused template with patient tutor personality.

| Aspect | Source (studylog-ai) | Target (cocapn core vs template) |
|--------|----------------------|-----------------------------------|
| **Core Features** | Auth, streaming, PII, sessions, etc. | **cocapn core** |
| **Personality** | Patient tutor | `personality.md` — encouraging, scaffolded explanations |
| **Routing** | +3 education rules | `routes.json` — quiz, study mode, progress check |
| **Theme** | Green/growth palette | `theme.json` — `#4CAF50` primary, rounded friendly |
| **Components** | 2 custom components | `components/` — study-route, quiz-panel |
| **Skills** | Quiz generation, Socratic method | `skills/` — quiz-generator.skill, socratic-questioning.skill |

**Template Contents**:
```
templates/studylog/
├── cocapn-template.json
├── personality.md           # "You are a patient tutor..."
├── routes.json              # 19 rules (16 base + 3 education)
├── theme.json               # Green, rounded, friendly
├── components/
│   ├── study-route.js       # Learning path visualization
│   ├── quiz-panel.js        # Interactive quiz interface
│   └── components.json
├── skills/
│   ├── quiz-generator.skill # Auto-generate practice questions
│   ├── socratic-questioning.skill  # Guided discovery prompts
│   └── skills.json
└── README.md
```

**Unique Mapping Table**:

| LOG.ai Feature | Cocapn Target |
|----------------|---------------|
| Study mode UI | `components/study-route.js` |
| Quiz generation | `skills/quiz-generator.skill` |
| Progress tracking | `components/study-route.js` (stores in brain/facts.json) |
| Socratic prompting | `personality.md` + `skills/socratic-questioning.skill` |
| Green/growth theme | `theme.json` |

**Migration Notes**:
- Quiz generator needs access to brain/facts.json for progress storage — template must declare `brain:write` permission
- Study route component uses incremental rendering — cocapn core must support progressive updates

---

### 3.4 makerlog-ai → `makerlog` Template

**Overview**: Developer-focused template with project tracking and build integration.

| Aspect | Source (makerlog-ai) | Target (cocapn core vs template) |
|--------|----------------------|-----------------------------------|
| **Core Features** | Auth, streaming, PII, sessions, etc. | **cocapn core** |
| **Personality** | Focused dev companion | `personality.md` — technical, concise, git-aware |
| **Routing** | +5 dev rules | `routes.json` — deploy, build status, git ops, logs |
| **Theme** | Dark monochrome | `theme.json` — `#00FF00` terminal green |
| **Components** | 3 custom components | `components/` — project-board, build-status, log-viewer |
| **Skills** | Git operations, deployment | `skills/` — git-ops.skill, deploy-monitor.skill |

**Template Contents**:
```
templates/makerlog/
├── cocapn-template.json
├── personality.md           # "You are a focused dev companion..."
├── routes.json              # 21 rules (16 base + 5 dev)
├── theme.json               # Terminal dark, green accent
├── components/
│   ├── project-board.js     # Kanban-style project tracker
│   ├── build-status.js      # CI/CD status indicators
│   ├── log-viewer.js        # Tail -f style log viewer
│   └── components.json
├── skills/
│   ├── git-ops.skill        # Git workflow automation
│   ├── deploy-monitor.skill # Deployment status checks
│   └── skills.json
└── README.md
```

**Unique Mapping Table**:

| LOG.ai Feature | Cocapn Target |
|----------------|---------------|
| Project board UI | `components/project-board.js` |
| Build status integration | `components/build-status.js` |
| Log streaming | `components/log-viewer.js` |
| Git shortcuts | `skills/git-ops.skill` |
| Deploy monitoring | `skills/deploy-monitor.skill` |
| Terminal theme | `theme.json` |

**Migration Notes**:
- Log viewer requires WebSocket streaming access — cocapn core must expose stream subscription API
- Git ops skill needs filesystem access — template must declare `fs:git` permission
- Build status component polls external CI APIs — template needs `external:http` permission

---

### 3.5 playerlog-ai → `playerlog` Template

**Overview**: Gaming-focused template with stats tracking and achievement management.

| Aspect | Source (playerlog-ai) | Target (cocapn core vs template) |
|--------|-----------------------|-----------------------------------|
| **Core Features** | Auth, streaming, PII, sessions, etc. | **cocapn core** |
| **Personality** | Gaming buddy | `personality.md` — casual, gamer slang, achievement-focused |
| **Routing** | +4 gaming rules | `routes.json` — stats queries, achievements, game lookup |
| **Theme** | Neon/cyber aesthetic | `theme.json` — `#FF00FF` magenta, glow effects |
| **Components** | 2 custom components | `components/` — game-stats, achievement-panel |
| **Skills** | Game database, achievement tracking | `skills/` — game-lookup.skill, achievement-tracker.skill |

**Template Contents**:
```
templates/playerlog/
├── cocapn-template.json
├── personality.md           # "You are a gaming buddy..."
├── routes.json              # 20 rules (16 base + 4 gaming)
├── theme.json               # Neon magenta, glow effects
├── components/
│   ├── game-stats.js        # Platform-agnostic stats display
│   ├── achievement-panel.js # Achievement tracker with progress
│   └── components.json
├── skills/
│   ├── game-lookup.skill    # IGDB/HLTB integration
│   ├── achievement-tracker.skill  # Achievement comparison
│   └── skills.json
└── README.md
```

**Unique Mapping Table**:

| LOG.ai Feature | Cocapn Target |
|----------------|---------------|
| Game stats display | `components/game-stats.js` |
| Achievement tracking | `components/achievement-panel.js` |
| Game database lookup | `skills/game-lookup.skill` |
| Gamer slang patterns | `personality.md` + `routes.json` |
| Neon theme | `theme.json` |

**Migration Notes**:
- Game lookup skill calls external APIs (IGDB, HowLongToBeat) — template needs `external:gaming` permission
- Achievement panel uses local storage for offline comparison — cocapn brain/facts.json integration

---

### 3.6 reallog-ai → `reallog` Template

**Overview**: Journalism-focused template with source citation and fact-checking.

| Aspect | Source (reallog-ai) | Target (cocapn core vs template) |
|--------|---------------------|-----------------------------------|
| **Core Features** | Auth, streaming, PII, sessions, etc. | **cocapn core** |
| **Personality** | Grounded advisor | `personality.md` — precise, source-conscious, uncertainty-acknowledging |
| **Routing** | +3 research rules | `routes.json` — fact check, source query, citation request |
| **Theme** | Newsprint aesthetic | `theme.json` — `#333333` ink, serif fonts |
| **Components** | 2 custom components | `components/` — source-panel, fact-checker |
| **Skills** | Source verification, citation formatting | `skills/` — source-verify.skill, citation-style.skill |

**Template Contents**:
```
templates/reallog/
├── cocapn-template.json
├── personality.md           # "You are a grounded advisor..."
├── routes.json              # 19 rules (16 base + 3 research)
├── theme.json               # Newsprint, serif, ink colors
├── components/
│   ├── source-panel.js      # Source list with confidence scores
│   ├── fact-checker.js      # Claim verification UI
│   └── components.json
├── skills/
│   ├── source-verify.skill  # Multi-source verification
│   ├── citation-style.skill # AP/MLA/Chicago formatting
│   └── skills.json
└── README.md
```

**Unique Mapping Table**:

| LOG.ai Feature | Cocapn Target |
|----------------|---------------|
| Source panel | `components/source-panel.js` |
| Fact checker | `components/fact-checker.js` |
| Source verification | `skills/source-verify.skill` |
| Citation formatting | `skills/citation-style.skill` |
| Newsprint theme | `theme.json` |

**Migration Notes**:
- Source verify skill requires web search access — cocapn core must provide search tool
- Fact checker stores claims in brain/facts.json — template needs `brain:write` permission

---

### 3.7 activelog-ai → `activelog` Template

**Overview**: Fitness-focused template with activity tracking and motivation.

| Aspect | Source (activelog-ai) | Target (cocapn core vs template) |
|--------|-----------------------|-----------------------------------|
| **Core Features** | Auth, streaming, PII, sessions, etc. | **cocapn core** |
| **Personality** | Energetic coach | `personality.md` — motivating, goal-oriented, celebration-focused |
| **Routing** | +4 fitness rules | `routes.json` — workout log, goal check, progress, motivation |
| **Theme** | Energetic orange/blue | `theme.json` — `#FF6B35` orange, gradient accents |
| **Components** | 3 custom components | `components/` — activity-tracker, goal-dashboard, motivation-feed |
| **Skills** | Workout planning, progress analysis | `skills/` — workout-planner.skill, progress-analyzer.skill |

**Template Contents**:
```
templates/activelog/
├── cocapn-template.json
├── personality.md           # "You are an energetic coach..."
├── routes.json              # 20 rules (16 base + 4 fitness)
├── theme.json               # Orange/blue, energetic gradients
├── components/
│   ├── activity-tracker.js  # Workout logging with graphs
│   ├── goal-dashboard.js    # Goal progress visualization
│   ├── motivation-feed.js   # Achievement celebrations
│   └── components.json
├── skills/
│   ├── workout-planner.skill # Progressive overload planning
│   ├── progress-analyzer.skill  # Trend analysis and insights
│   └── skills.json
└── README.md
```

**Unique Mapping Table**:

| LOG.ai Feature | Cocapn Target |
|----------------|---------------|
| Activity tracker | `components/activity-tracker.js` |
| Goal dashboard | `components/goal-dashboard.js` |
| Motivation feed | `components/motivation-feed.js` |
| Workout planning | `skills/workout-planner.skill` |
| Progress analysis | `skills/progress-analyzer.skill` |
| Energetic theme | `theme.json` |

**Migration Notes**:
- Activity tracker integrates with health APIs (Apple Health, Google Fit) — template needs `external:health` permission
- Goal dashboard uses chart library — cocapn core must provide chart primitives or template bundles its own

---

### 3.8 businesslog-ai → `businesslog` Template

**Overview**: Enterprise-focused template with Docker defaults and team management.

| Aspect | Source (businesslog-ai) | Target (cocapn core vs template) |
|--------|-------------------------|-----------------------------------|
| **Core Features** | Auth, streaming, PII, sessions, etc. | **cocapn core** |
| **Personality** | Professional executive assistant | `personality.md` — formal, efficient, security-conscious |
| **Routing** | +6 enterprise rules | `routes.json` — team query, meeting prep, report gen, security |
| **Theme** | Corporate blue/gray | `theme.json` — `#0052CC` enterprise blue |
| **Components** | 4 custom components | `components/` — team-panel, analytics-dashboard, report-generator, security-audit |
| **Skills** | Meeting prep, report generation | `skills/` — meeting-prep.skill, report-gen.skill |

**Template Contents**:
```
templates/businesslog/
├── cocapn-template.json
├── personality.md           # "You are a professional executive assistant..."
├── routes.json              # 22 rules (16 base + 6 enterprise)
├── theme.json               # Corporate blue, professional
├── components/
│   ├── team-panel.js        # Team roster and status
│   ├── analytics-dashboard.js # Business metrics dashboard
│   ├── report-generator.js  # Automated report creation
│   ├── security-audit.js    # Security compliance checker
│   └── components.json
├── config/
│   ├── cocapn.yml           # Docker defaults, enterprise settings
│   └── cocapn-private.yml   # Enterprise auth config template
├── skills/
│   ├── meeting-prep.skill   # Agenda and context gathering
│   ├── report-gen.skill     # Business report templates
│   └── skills.json
└── README.md
```

**Unique Mapping Table**:

| LOG.ai Feature | Cocapn Target |
|----------------|---------------|
| Team panel | `components/team-panel.js` |
| Analytics dashboard | `components/analytics-dashboard.js` |
| Report generator | `components/report-generator.js` |
| Security audit | `components/security-audit.js` |
| Docker defaults | `config/cocapn.yml` |
| Meeting prep | `skills/meeting-prep.skill` |
| Corporate theme | `theme.json` |

**Migration Notes**:
- Businesslog includes Docker Compose defaults in `config/cocapn.yml` — unique among templates
- Security audit component requires access to bridge security state — template needs `security:read` permission
- Team panel integrates with external directory services — template needs `external:ldap` permission

---

## 4. Migration Process

### Phase 1: Extraction (Week 1)

**Goal**: Extract unique assets from each LOG.ai repo without modifying cocapn.

1. **Clone all 8 repos** to `workspace/log-ai-orig/`
2. **Run extraction script** (`scripts/extract-template.ts`):
   ```bash
   npx tsx scripts/extract-template.ts <repo-name> <template-name>
   ```
3. **Manual review** of extracted components:
   - Verify component dependencies (Preact, HTM, cocapn APIs)
   - Identify missing cocapn API surface areas
   - Document permission requirements

**Deliverables**:
- 8 template directories in `templates/`
- Extraction report documenting gaps
- API surface requirements doc

### Phase 2: Cocapn API Surface (Week 2)

**Goal**: Extend cocapn core to support template requirements.

1. **Component API** — define `CocapnComponent` interface:
   ```typescript
   interface CocapnComponent {
     name: string;
     version: string;
     permissions: string[];
     mount(container: HTMLElement): void;
     unmount(): void;
     handleMessage(msg: BridgeMessage): void;
   }
   ```

2. **Permission system** — declare and enforce template permissions:
   ```typescript
   interface TemplatePermissions {
     brain?: { read: boolean, write: boolean };
     fs?: { git: boolean, read: string[], write: string[] };
     external?: { http: string[], health: boolean, gaming: boolean };
     security?: { read: boolean, audit: boolean };
     canvas?: boolean;
   }
   ```

3. **Template installer** — CLI command:
   ```bash
   cocapn template install <template-name> [--domain <custom-domain>]
   ```

**Deliverables**:
- `CocapnComponent` interface in core
- Permission system implementation
- Template installer CLI
- Template registry API

### Phase 3: Template Conversion (Week 3)

**Goal**: Convert extracted assets to cocapn template format.

For each template:

1. **Create `cocapn-template.json`** from metadata
2. **Convert system prompt → `personality.md`**
3. **Extract routing rules → `routes.json`**
4. **Extract theme → `theme.json`**
5. **Port Preact components → `components/`**:
   - Wrap each component in `CocapnComponent` interface
   - Add permission declarations
   - Test component isolation
6. **Convert skills → `skills/`**:
   - Format as cocapn skill cartridges
   - Define tool dependencies
7. **Write `README.md`** with template-specific docs

**Deliverables**:
- 8 complete template packages
- Template validation tests
- Installation smoke tests

### Phase 4: Testing & Validation (Week 4)

**Goal**: Ensure templates install correctly and preserve original functionality.

For each template:

1. **Install test**: `cocapn template install <name>`
2. **Smoke test**: Verify all routes, components, skills load
3. **Integration test**: Run template-specific scenarios
4. **Visual regression**: Compare with original LOG.ai UI
5. **Performance test**: Measure component load times
6. **Security audit**: Verify permission enforcement

**Deliverables**:
- Test suite for each template
- Visual regression baseline
- Performance benchmarks
- Security audit report

---

## 5. Shared Core (NOT in Templates)

The following functionality lives in cocapn core and is NOT duplicated in templates:

### 5.1 Authentication & Security

| Feature | Location |
|---------|----------|
| JWT signing/verification | `packages/local-bridge/src/security/jwt.ts` |
| Fleet key management | `packages/local-bridge/src/security/fleet-keys.ts` |
| Age encryption | `packages/local-bridge/src/security/age.ts` |
| Secret management | `packages/local-bridge/src/security/secrets.ts` |

### 5.2 Communication

| Feature | Location |
|---------|----------|
| WebSocket server | `packages/local-bridge/src/ws/server.ts` |
| A2A protocol | `packages/protocols/src/a2a/` |
| MCP protocol | `packages/protocols/src/mcp/` |
| Message routing | `packages/local-bridge/src/agents/router.ts` |

### 5.3 Memory & State

| Feature | Location |
|---------|----------|
| Brain (Git-backed memory) | `packages/local-bridge/src/brain/` |
| Facts store | `packages/local-bridge/src/brain/facts.ts` |
| Wiki store | `packages/local-bridge/src/brain/wiki.ts` |
| Procedures store | `packages/local-bridge/src/brain/procedures.ts` |

### 5.4 Agent Lifecycle

| Feature | Location |
|---------|----------|
| Agent registry | `packages/local-bridge/src/agents/registry.ts` |
| Agent spawner | `packages/local-bridge/src/agents/spawner.ts` |
| Agent router | `packages/local-bridge/src/agents/router.ts` |

### 5.5 Cloud Integration

| Feature | Location |
|---------|----------|
| AdmiralDO client | `packages/cloud-agents/src/admiral.ts` |
| Cloud connector | `packages/local-bridge/src/cloud/` |
| Fleet heartbeat | `packages/local-bridge/src/cloud/heartbeat.ts` |

### 5.6 Configuration

| Feature | Location |
|---------|----------|
| YAML config loader | `packages/local-bridge/src/config/loader.ts` |
| Config types | `packages/local-bridge/src/config/types.ts` |
| Settings API | `packages/local-bridge/src/settings/` |

### 5.7 PII & Privacy

| Feature | Location |
|---------|----------|
| PII dehydration/rehydration | Cloud module (not in local bridge) |
| Private fact filtering | `packages/local-bridge/src/brain/facts.ts` |
| Env var filtering | `packages/local-bridge/src/agents/spawner.ts` |

### 5.8 Session Management

| Feature | Location |
|---------|----------|
| Session creation | `packages/local-bridge/src/sessions/` |
| Session export | `packages/local-bridge/src/sessions/export.ts` |
| Session context | `packages/local-bridge/src/sessions/context.ts` |

### 5.9 User Interface

| Feature | Location |
|---------|----------|
| Base UI components | `packages/ui/src/components/` |
| WebSocket client | `packages/ui/src/client.ts` |
| Agent dashboard | `packages/ui/src/dashboard/` |

### 5.10 Utilities

| Feature | Location |
|---------|----------|
| Logger | `packages/local-bridge/src/utils/logger.ts` |
| Git operations | `packages/local-bridge/src/git/` |
| Schema validator | `packages/schemas/src/validator.ts` |

---

## 6. Versioning & Compatibility

### 6.1 Template Versioning

Templates use semantic versioning independent of cocapn core:

```
<template-name>@<major>.<minor>.<patch>
```

- **Major**: Breaking changes (routes format, component API, skill format)
- **Minor**: New features (new components, new routes, new skills)
- **Patch**: Bug fixes (route pattern fixes, component tweaks)

### 6.2 Cocapn Core Versioning

Cocapn core also uses semantic versioning:

```
cocapn@<major>.<minor>.<patch>
```

- **Major**: Breaking changes to core APIs, component interface, brain schema
- **Minor**: New core features (new permissions, new cloud integrations)
- **Patch**: Bug fixes

### 6.3 Compatibility Matrix

Each template declares compatible cocapn versions in `cocapn-template.json`:

```json
{
  "cocapn": {
    "minVersion": "0.12.0",
    "maxVersion": "1.0.0"
  }
}
```

**Rules**:
1. Templates declare `minVersion` — earliest cocapn core with required APIs
2. Templates declare `maxVersion` — latest cocapn core tested against (optional)
3. If `maxVersion` is omitted, template assumes forward compatibility within major version
4. Template installer validates compatibility before installation

**Compatibility examples**:

| Template Version | Cocapn Min | Cocapn Max | Notes |
|------------------|-----------|-----------|-------|
| dmlog@1.0.0 | 0.12.0 | 0.99.0 | Requires canvas API (added in 0.12.0) |
| makerlog@1.2.0 | 0.15.0 | — | Requires git permissions (added in 0.15.0) |
| businesslog@2.0.0 | 1.0.0 | 1.99.0 | Breaking change: new component API |

### 6.4 Migration Paths

When cocapn core releases a breaking change:

1. **Old templates** continue to work with old cocapn versions
2. **New template versions** released for new cocapn versions
3. **Template migration guide** documents breaking changes

Example migration guide:

```
# Migrating Templates from Cocapn 0.x to 1.0

## Breaking Changes

1. Component interface renamed `mount()` → `initialize()`
2. Permission format changed from array to object
3. Route rule `action` field renamed to `handler`

## Migration Steps

1. Update `cocapn-template.json`:
   ```json
   {
     "cocapn": {
       "minVersion": "1.0.0",
       "maxVersion": "1.99.0"
     }
   }
   ```

2. Update component files:
   ```typescript
   // Old
   mount(container: HTMLElement): void { ... }

   // New
   initialize(container: HTMLElement): void { ... }
   ```

3. Update permissions format:
   ```json
   // Old
   "permissions": ["brain:read", "brain:write"]

   // New
   "permissions": {
     "brain": { "read": true, "write": true }
   }
   ```

4. Update routes.json:
   ```json
   // Old
   { "action": "invoke-tool", ... }

   // New
   { "handler": "invoke-tool", ... }
   ```

5. Bump template version:
   ```bash
   npm version major  # 1.0.0 → 2.0.0
   ```
```

---

## 7. Installation & Usage

### 7.1 Template Installation

```bash
# Install from cocapn template registry
cocapn template install dmlog

# Install with custom domain
cocapn template install makerlog --domain mydevlog.ai

# Install specific version
cocapn template install studylog@1.2.0

# Install from local directory
cocapn template install ./templates/custom

# List installed templates
cocapn template list

# Uninstall a template
cocapn template uninstall dmlog
```

### 7.2 Template Creation

```bash
# Create new template from scratch
cocapn template create my-template --template default

# Create template by cloning existing
cocapn template clone dmlog my-dmlog-fork

# Validate template package
cocapn template validate ./templates/my-template

# Publish template to registry
cocapn template publish ./templates/my-template
```

### 7.3 Template Structure in Installed Bridge

After installation, template files are integrated into the bridge:

```
~/.cocapn/
├── bridge/
│   ├── config/
│   │   ├── cocapn.yml          # Merged: core defaults + template overrides
│   │   └── cocapn-private.yml  # Private config (not from template)
│   ├── brain/
│   │   ├── facts.json          # User facts (not from template)
│   │   ├── wiki/               # User wiki (not from template)
│   │   ├── soul.md             # Copied from template personality.md
│   │   └── procedures/         # Copied from template skills/
│   ├── templates/
│   │   └── dmlog/              # Installed template
│   │       ├── cocapn-template.json
│   │       ├── components/
│   │       ├── skills/
│   │       ├── routes.json
│   │       └── theme.json
│   └── modules/
│       └── (template-specific modules installed here)
```

### 7.4 Runtime Resolution

When the bridge starts:

1. **Load config** — merge `cocapn.yml` with template defaults
2. **Load soul** — read `brain/soul.md` (from template personality.md)
3. **Load routes** — merge base routes with template `routes.json`
4. **Load components** — register template components with UI
5. **Load skills** — install template skills into brain/procedures/
6. **Apply theme** — merge template `theme.json` with base theme

---

## 8. Validation & Testing

### 8.1 Template Validation

Templates must pass validation before installation:

```bash
cocapn template validate ./templates/dmlog
```

**Validation checks**:

1. **Structure** — all required files present
2. **Metadata** — `cocapn-template.json` valid against schema
3. **Compatibility** — cocapn version constraints satisfiable
4. **Permissions** — all permissions declared and valid
5. **Components** — all components implement `CocapnComponent` interface
6. **Skills** — all skills valid against skill schema
7. **Routes** — all routes valid against routing schema
8. **Theme** — `theme.json` valid against theme schema

### 8.2 Component Testing

Each template component must have tests:

```typescript
// templates/dmlog/tests/dice-roller.test.ts
import { describe, it, expect } from 'vitest';
import { DiceRoller } from '../components/dice-roller.js';

describe('DiceRoller component', () => {
  it('should roll d20 and return 1-20', () => {
    const roller = new DiceRoller();
    const result = roller.roll('1d20');
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(20);
  });

  it('should request canvas permission', () => {
    const roller = new DiceRoller();
    expect(roller.permissions).toContain('canvas');
  });
});
```

### 8.3 Integration Testing

Each template must have integration tests:

```bash
# Run template-specific integration tests
cd templates/dmlog
npm test

# Expected output:
# ✓ 12 components load correctly
# ✓ 5 routes parse successfully
# ✓ 2 skills install without errors
# ✓ theme applies to all components
# ✓ personality.md loads as soul.md
```

### 8.4 Visual Regression Testing

Templates should maintain visual consistency across cocapn versions:

```bash
# Capture baseline screenshots
cocapn template screenshot dmlog --output screenshots/baseline/

# Compare current build to baseline
cocapn template diff-screenshots dmlog --baseline screenshots/baseline/
```

---

## 9. Security Considerations

### 9.1 Permission Enforcement

Templates declare required permissions; cocapn core enforces them:

```json
{
  "permissions": {
    "brain": { "read": true, "write": true },
    "fs": { "git": true, "read": ["/var/log"], "write": [] },
    "external": {
      "http": ["api.github.com", "cdn.jsdelivr.net"],
      "health": false,
      "gaming": false
    },
    "security": { "read": false, "audit": false },
    "canvas": true
  }
}
```

**Enforcement points**:

1. **Component load time** — verify all permissions granted before mounting
2. **Runtime checks** — intercept file system, network, security API calls
3. **Sandbox violations** — terminate components that exceed permissions

### 9.2 Code Review Requirements

Templates from untrusted sources must be reviewed:

1. **Static analysis** — scan for dangerous patterns (eval, innerHTML, etc.)
2. **Dependency audit** — check component dependencies for vulnerabilities
3. **Permission audit** — verify permission requests match functionality
4. **Network audit** — verify external HTTP calls are documented

### 9.3 Template Signing

Templates can be cryptographically signed:

```bash
# Sign template with maintainer key
cocapn template sign ./templates/dmlog --key ~/.cocapn/keys/template-private.pem

# Verify template signature before installation
cocapn template verify ./templates/dmlog --key ~/.cocapn/keys/template-public.pem
```

**Signature format**:

```
-----BEGIN COCAPN TEMPLATE SIGNATURE-----
Template: dmlog@1.0.0
Version: 1
Signature: <base64-encoded signature>
Hash: sha256:<template-tarball-hash>
-----END COCAPN TEMPLATE SIGNATURE-----
```

---

## 10. Performance & Optimization

### 10.1 Component Lazy Loading

Template components are loaded on-demand:

```typescript
// Default: eager load (small components)
"components": ["components/dice-roller.js"]

// Opt-in: lazy load (large components)
"components": [
  { "path": "components/map-canvas.js", "lazy": true }
]
```

### 10.2 Skill Caching

Template skills are cached in brain after first load:

```typescript
// First load: read from template/skills/
// Subsequent loads: read from brain/procedures/ cache
```

### 10.3 Theme Preloading

Template theme assets (fonts, logos) are preloaded:

```typescript
// templates/dmlog/theme.json
{
  "assets": [
    { "type": "font", "url": "/assets/fonts/cinzel.woff2", "preload": true },
    { "type": "image", "url": "/assets/logo.svg", "preload": true }
  ]
}
```

---

## 11. Future Enhancements

### 11.1 Template Marketplace

Decentralized template registry:

```bash
# Search community templates
cocapn template search "ttrpg"

# Install from community registry
cocapn template install user/pathos-ttrpg --source community
```

### 11.2 Template Composition

Combine features from multiple templates:

```bash
# Create composite template
cocapn template compose my-template \
  --with dmlog/components/dice-roller.js \
  --with activelog/components/activity-tracker.js \
  --with studylog/personality.md
```

### 11.3 Template Versioning

Automatic migration when templates update:

```bash
# Auto-migrate to latest compatible version
cocapn template upgrade dmlog --auto-migrate
```

---

## 12. Summary

This migration strategy achieves:

1. **Zero code duplication** — shared functionality consolidated in cocapn core
2. **Personality preservation** — each template maintains unique voice
3. **Component portability** — Preact+HTM components become installable assets
4. **Routing capture** — intent rules versioned with templates
5. **Theme encapsulation** — branding self-contained in templates
6. **Clear separation** — core vs template responsibilities well-defined
7. **Versioning strategy** — templates and core version independently
8. **Permission model** — templates declare and request capabilities
9. **Installation UX** — simple CLI for template management
10. **Validation framework** — templates validated before installation

**Next steps**:

1. Implement extraction script (`scripts/extract-template.ts`)
2. Define `CocapnComponent` interface in core
3. Implement permission system
4. Build template installer CLI
5. Convert first template (dmlog) as proof of concept
6. Iterate on remaining 7 templates

---

**Document version**: 1.0.0
**Last updated**: 2026-03-29
**Author**: Cocapn by Superinstance
**Status**: Design draft — pending review
