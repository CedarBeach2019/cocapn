# Cocapn Plugin System — Design Document

## 1. Overview

### What are Plugins?
Plugins are published skill cartridges that extend cocapn agent capabilities. A plugin bundles one or more skills along with metadata, tests, optional runtime modules, and personality fragments. Think of them as "npm packages for AI agents" — discoverable, installable, and versioned extensions that anyone can publish.

### Why It Matters
The plugin system creates a flywheel effect:
- **Users** get instant access to specialized capabilities (GitHub, Slack, data analysis)
- **Developers** reach thousands of cocapn users without building their own agent runtime
- **Ecosystem** grows as useful plugins attract more users, which attracts more developers

This positions cocapn as the "npm of AI agents" — the standard extension mechanism for agent runtimes.

### Relationship to Existing System
Cocapn already has:
- **Skill cartridges** — local skill bundles in templates
- **Module system** — 4 types: brain, ui, cloud, tool
- **Agent registry** — YAML-based agent definitions

The plugin system builds on these foundations:
- Plugins are **publishable skill cartridges** with standard metadata
- Plugin skills can be **hot** (always loaded) or **cold** (on-demand)
- Plugins declare **permissions** and **dependencies** explicitly
- A **central registry** enables discovery and installation

---

## 2. Plugin Package Format

### Directory Structure
```
my-plugin/
├── cocapn-plugin.json      # Plugin manifest (required)
├── README.md               # User-facing documentation (required)
├── LICENSE                 # License file (recommended)
├── skills/
│   ├── my-skill.ts          # Skill implementation
│   ├── my-skill.test.ts     # Skill tests (required)
│   └── helpers/
│       └── github-client.ts # Helper modules
├── modules/                 # Optional runtime modules
│   ├── brain/               # Brain modules
│   ├── ui/                  # UI components
│   ├── cloud/               # Cloud modules
│   └── tools/               # MCP tool definitions
├── personality.md           # Optional personality fragment
└── assets/                  # Static assets (icons, etc.)
    └── icon.png
```

### Manifest Schema (cocapn-plugin.json)
```json
{
  "$schema": "cocapn-plugin-schema-v1",
  "name": "cocapn-plugin-github",
  "version": "1.2.0",
  "description": "GitHub integration — issues, PRs, code review",
  "author": "Superinstance <team@superinstance.com>",
  "license": "MIT",
  "repository": "https://github.com/superinstance/cocapn-plugin-github",
  "homepage": "https://github.com/superinstance/cocapn-plugin-github#readme",
  "bugs": "https://github.com/superinstance/cocapn-plugin-github/issues",
  "keywords": ["github", "issues", "pull-requests", "code-review"],
  "category": "development",
  "icon": "assets/icon.png",

  "skills": [
    {
      "name": "github-issues",
      "entry": "skills/github-issues.ts",
      "type": "hot",
      "tolerance": {
        "maxTokens": 2000,
        "timeout": 30000
      },
      "triggers": ["issue", "bug", "pr", "pull request", "github"],
      "description": "List, create, and manage GitHub issues"
    },
    {
      "name": "github-pr-review",
      "entry": "skills/pr-review.ts",
      "type": "cold",
      "tolerance": {
        "maxTokens": 4000,
        "timeout": 60000
      },
      "triggers": ["review", "code review", "pr review"],
      "description": "Analyze and review pull requests"
    }
  ],

  "dependencies": {
    "cocapn-core": ">=0.1.0",
    "cocapn-plugin-http": ">=1.0.0"
  },

  "permissions": [
    "network:github.com",
    "fs:read:~/repos",
    "shell:gh"
  ],

  "engines": {
    "node": ">=18.0.0",
    "cocapn": ">=0.1.0"
  },

  "scripts": {
    "test": "vitest run",
    "lint": "eslint skills/"
  },

  "quality": {
    "testCoverage": 95,
    "lastUpdated": "2026-03-29",
    "installs": 1234,
    "rating": 4.7
  }
}
```

### Manifest Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ | Plugin name (must start with `cocapn-plugin-`) |
| `version` | ✅ | Semver version string |
| `description` | ✅ | Short description (max 200 chars) |
| `author` | ✅ | Author name or email |
| `license` | ✅ | SPDX license identifier |
| `repository` | ❌ | Git repository URL |
| `keywords` | ❌ | Search keywords (max 10) |
| `category` | ❌ | Category (development, productivity, social, etc.) |
| `skills` | ✅ | Array of skill definitions |
| `dependencies` | ❌ | Plugin dependencies |
| `permissions` | ✅ | Required permissions |
| `engines` | ❌ | Runtime version constraints |

### Skill Definition Schema

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ | Unique skill identifier |
| `entry` | ✅ | Path to skill implementation (`.ts` or `.js`) |
| `type` | ✅ | `"hot"` (always loaded) or `"cold"` (on-demand) |
| `tolerance` | ❌ | Resource limits (`maxTokens`, `timeout`) |
| `triggers` | ✅ | Keywords that activate the skill |
| `description` | ✅ | What the skill does |

---

## 3. Permission Model

### Permission Types

| Permission | Description | Scope |
|------------|-------------|-------|
| `network:<host>` | Network access to specific host | `network:api.github.com` |
| `network:*` | Unrestricted network access | ⚠️ Dangerous |
| `fs:read:<path>` | Read filesystem under path | `fs:read:~/repos` |
| `fs:write:<path>` | Write filesystem under path | `fs:write:~/output` |
| `fs:*` | Full filesystem access | ⚠️ Dangerous |
| `shell:<cmd>` | Execute specific shell command | `shell:gh`, `shell:git` |
| `shell:*` | Unrestricted shell access | ⚠️ Very dangerous |
| `env:<var>` | Read environment variable | `env:GITHUB_TOKEN` |
| `admin` | Bridge administration | ⚠️ Very dangerous |

### Permission Flow

```
User installs plugin
└── CLI shows required permissions
    ├── network:api.github.com
    ├── shell:gh
    └── env:GITHUB_TOKEN
└── User approves (or denies specific permissions)
    └── Approved permissions stored in plugin state
        └── Runtime enforces sandbox
```

### Runtime Enforcement

- **Hot skills**: Run in bridge process with permission checks on each operation
- **Cold skills**: Run in isolated subprocess with permissions as capability flags
- **Permission checks**: Hook into all I/O operations (network, fs, shell, env)
- **Audit log**: Track permission usage for security review

### Permission Revocation

Users can revoke permissions at any time:

```bash
cocapn plugin revoke-permission cocapn-plugin-github network:api.github.com
```

Revocation disables the plugin until permissions are restored or the plugin is updated to not require the permission.

---

## 4. Registry API

### Registry Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Registry Frontend                        │
│                    (Cloudflare Workers)                      │
├─────────────────────────────────────────────────────────────┤
│  Routes: /api/plugins/*                                      │
│  - Auth: JWT (cocapn fleet keys)                             │
│  - Rate limiting: 100 req/min per user                       │
│  - Caching: Cloudflare KV (TTL: 5 min)                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   AdmiralDO (Durable Object)                 │
│  - Plugin metadata store                                     │
│  - Version history                                           │
│  - Install counts                                            │
│  - Quality scores                                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Storage Layer                              │
│  - Plugin artifacts: R2 (tar.gz)                            │
│  - Search index: D1 (full-text search)                       │
└─────────────────────────────────────────────────────────────┘
```

### API Endpoints

#### Search Plugins
```
GET /api/plugins/search?q=github&category=development&sort=installs

Response:
{
  "plugins": [
    {
      "name": "cocapn-plugin-github",
      "version": "1.2.0",
      "description": "GitHub integration — issues, PRs, code review",
      "author": "Superinstance <team@superinstance.com>",
      "category": "development",
      "installs": 1234,
      "rating": 4.7,
      "keywords": ["github", "issues", "pull-requests"]
    }
  ],
  "total": 15,
  "page": 1
}
```

#### Get Plugin Details
```
GET /api/plugins/:name

Response:
{
  "name": "cocapn-plugin-github",
  "version": "1.2.0",
  "description": "GitHub integration — issues, PRs, code review",
  "author": "Superinstance <team@superinstance.com>",
  "license": "MIT",
  "repository": "https://github.com/superinstance/cocapn-plugin-github",
  "homepage": "https://github.com/superinstance/cocapn-plugin-github#readme",
  "readme": "# cocapn-plugin-github\n...",
  "skills": [
    {
      "name": "github-issues",
      "type": "hot",
      "triggers": ["issue", "bug", "pr"],
      "description": "List, create, and manage GitHub issues"
    }
  ],
  "permissions": ["network:api.github.com", "shell:gh"],
  "dependencies": {"cocapn-core": ">=0.1.0"},
  "versions": ["1.0.0", "1.1.0", "1.2.0"],
  "installs": 1234,
  "rating": 4.7,
  "quality": {
    "testCoverage": 95,
    "hasSecurityAudit": true,
    "lastUpdated": "2026-03-29"
  }
}
```

#### Publish Plugin
```
POST /api/plugins/publish
Authorization: Bearer <fleet-jwt>
Content-Type: application/json

Body:
{
  "name": "cocapn-plugin-github",
  "version": "1.2.0",
  "manifest": {...},  // Full cocapn-plugin.json
  "artifact": "https://r2.dev/cocapn-plugins/github-1.2.0.tar.gz",
  "signature": "sha256:abc123..."  // Optional code signature
}

Response:
{
  "success": true,
  "plugin": {
    "name": "cocapn-plugin-github",
    "version": "1.2.0",
    "publishedAt": "2026-03-29T12:00:00Z"
  }
}
```

#### Track Install
```
POST /api/plugins/:name/install
Body: {
  "version": "1.2.0",
  "platform": "linux-arm64",
  "cocapnVersion": "0.1.0"
}

Response: {
  "success": true,
  "installCount": 1235  // Incremented
}
```

#### Get Versions
```
GET /api/plugins/:name/versions

Response:
{
  "versions": [
    {
      "version": "1.2.0",
      "publishedAt": "2026-03-29T12:00:00Z",
      "artifact": "https://r2.dev/cocapn-plugins/github-1.2.0.tar.gz",
      "changes": "Add PR review skill"
    },
    {
      "version": "1.1.0",
      "publishedAt": "2026-03-15T12:00:00Z",
      "artifact": "https://r2.dev/cocapn-plugins/github-1.1.0.tar.gz",
      "changes": "Fix issue pagination"
    }
  ]
}
```

#### Unpublish Plugin
```
DELETE /api/plugins/:name
Authorization: Bearer <fleet-jwt>

Response:
{
  "success": true,
  "message": "Plugin marked as deprecated (existing installs still work)"
}
```

### Registry Implementation

The registry uses:
- **Cloudflare Workers** for the API (fast, global, auto-scaling)
- **AdmiralDO** for consistent metadata storage (Durable Object)
- **R2** for plugin artifact storage (tar.gz files)
- **D1** for full-text search index (SQLite in the cloud)
- **KV** for caching frequently-accessed metadata

---

## 5. CLI Commands

### Plugin Discovery

```bash
# Search plugins
cocapn plugin search github
# → cocapn-plugin-github (1.2.0) — GitHub integration
# → cocapn-plugin-github-actions (0.9.0) — CI/CD workflows

# Browse by category
cocapn plugin search --category development

# Get plugin details
cocapn plugin info cocapn-plugin-github
# → Name: cocapn-plugin-github
# → Version: 1.2.0
# → Description: GitHub integration — issues, PRs, code review
# → Skills: github-issues, github-pr-review
# → Permissions: network:api.github.com, shell:gh
# → Installs: 1234
# → Rating: ⭐⭐⭐⭐⭐ (4.7/5)

# List installed plugins
cocapn plugin list
# → cocapn-plugin-github@1.2.0 (hot skills: 1, cold skills: 1)
# → cocapn-plugin-slack@2.0.1 (hot skills: 2, cold skills: 0)
```

### Plugin Installation

```bash
# Install latest version
cocapn plugin install cocapn-plugin-github

# Install specific version
cocapn plugin install cocapn-plugin-github@1.1.0

# Install with permissions prompt
cocapn plugin install cocapn-plugin-github
# → Required permissions:
# →   • network:api.github.com
# →   • shell:gh
# →   • env:GITHUB_TOKEN
# → Approve? [Y/n]
```

### Plugin Management

```bash
# Uninstall a plugin
cocapn plugin uninstall cocapn-plugin-github

# Update all plugins
cocapn plugin update

# Update specific plugin
cocapn plugin update cocapn-plugin-github

# Check for updates
cocapn plugin outdated
# → cocapn-plugin-slack: 2.0.0 → 2.1.0 available
```

### Plugin Development

```bash
# Publish a plugin (from plugin directory)
cocapn plugin publish
# → Validating cocapn-plugin.json...
# → Running tests...
# → Building artifact...
# → Uploading to registry...
# → Published cocapn-plugin-github@1.2.0

# Verify plugin tests
cocapn plugin verify cocapn-plugin-github
# → Running tests in sandbox...
# → ✓ 12/12 tests passed

# Validate plugin manifest
cocapn plugin validate
# → ✓ Valid cocapn-plugin.json
# → ✓ All skill entry points exist
# → ✓ Permissions are valid
```

### Permission Management

```bash
# Revoke specific permission
cocapn plugin revoke-permission cocapn-plugin-github network:api.github.com

# Grant additional permission
cocapn plugin grant-permission cocapn-plugin-github shell:git

# View plugin permissions
cocapn plugin permissions cocapn-plugin-github
# → network:api.github.com (granted)
# → shell:gh (granted)
# → shell:git (revoked)
```

---

## 6. Security Model

### Code Signing (Optional)

Plugins can be cryptographically signed to verify authenticity:

```bash
# Sign plugin during publish
cocapn plugin publish --sign

# Verify signature on install
cocapn plugin install cocapn-plugin-github --verify-signature
```

- Signature uses Ed25519 (fast, secure)
- Public key stored in plugin manifest
- Signature stored in registry metadata
- Verification happens automatically if signature present

### Dependency Scanning

On publish, the registry runs security scans:

```bash
# Automatic scans on publish
cocapn plugin publish
# → Scanning dependencies...
# → ✓ No known vulnerabilities
# → ✓ License compatibility verified
# → Published successfully
```

Scans check:
- Known vulnerabilities in dependencies (npm audit)
- License compatibility (must be OSI-approved or declared)
- Typosquatting detection (similar package names)
- Suspicious code patterns (eval, child_process, etc.)

### Sandbox Execution

**Cold skills** run in isolated subprocesses:

```
Bridge Process                    Plugin Process
├── Plugin Manager                ├── Skill runtime
├── Permission broker ──────────→ │  ├── Filesystem sandbox
├── WebSocket                     ├── Network sandbox
└── Brain                         ├── Shell sandbox
                                   └── IPC to bridge
```

Sandboxing enforces:
- Filesystem: chroot to plugin directory
- Network: whitelist-based (only approved hosts)
- Shell: command whitelist (only approved commands)
- Memory: CPU/memory limits (rlimits)
- Timeout: max execution time per skill call

### Permission Revocation Flow

```
User revokes permission
└── Plugin Manager notified
    └── Hot skills: Permission check fails
        └── Skill returns error: "Permission revoked: network:api.github.com"
    └── Cold skills: Process killed
        └── Next call fails with permission error
```

### Rate Limiting

Registry rate limits prevent abuse:
- **Anonymous**: 10 requests/minute
- **Authenticated**: 100 requests/minute
- **Publishing**: 10 publishes/hour per plugin

---

## 7. Compatibility

### Execution Modes

| Mode | When to Use | Isolation | Performance |
|------|-------------|-----------|-------------|
| **Hot** | Small, fast, trusted skills | Same process | Best |
| **Cold** | Large, slow, untrusted skills | Subprocess | Good |

**Hot skills** run in the bridge process:
- Direct access to Brain, WebSocket, Config
- Faster execution (no IPC overhead)
- Risk: crash can bring down bridge
- Best for: small utilities, trusted plugins

**Cold skills** run in isolated subprocess:
- Communicate via IPC (JSON-RPC over stdio)
- Slower execution (serialization overhead)
- Isolated: crash doesn't affect bridge
- Best for: large skills, untrusted plugins

### API Versioning

Plugins declare minimum cocapn version:

```json
{
  "engines": {
    "cocapn": ">=0.1.0"
  }
}
```

On install, CLI checks compatibility:
- ✅ Compatible if bridge version satisfies constraint
- ❌ Error if incompatible (user must upgrade cocapn)

### Skill API Stability

The skill API is versioned separately:

```typescript
// Skill API v1
export interface SkillContextV1 {
  brain: Brain;
  logger: Logger;
  signal: AbortSignal;
}

// Skill declares which API it needs
export default function mySkill(context: SkillContextV1) {
  // ...
}
```

Future cocapn versions will support multiple API versions, so old skills continue to work.

### Migration Path

**Built-in skills → Core plugins:**
```bash
# Existing built-in skills become "core" plugins
# Automatically installed, cannot be uninstalled
cocapn plugin list
# → cocapn-core-shell@0.1.0 (core)
# → cocapn-core-git@0.1.0 (core)
```

**Template skills → Template-bundled plugins:**
```bash
# Skills in templates are bundled with the template
# Users can upgrade to registry version
cocapn plugin upgrade-template-skill my-custom-skill
# → Found registry version: cocapn-plugin-custom@1.0.0
# → Upgrade? [Y/n]
```

---

## 8. Discovery

### Search Algorithms

**Keyword search** (exact match):
```
query: "github issue"
matches: "github" in keywords, "issue" in description
```

**Semantic search** (fuzzy match):
```
query: "bug tracking"
matches: plugins about "issues", "bug trackers", "jira"
(using vector embeddings on descriptions)
```

**Hybrid search** (combined):
```
score = 0.6 * keyword_score + 0.4 * semantic_score
```

### Categories

| Category | Description | Example Plugins |
|----------|-------------|-----------------|
| `development` | Developer tools | GitHub, GitLab, Jira |
| `productivity` | Task management | Todoist, Notion, Trello |
| `social` | Communication | Slack, Discord, Email |
| `data` | Data processing | CSV analysis, JSON tools |
| `media` | Media handling | Image processing, Video |
| `cloud` | Cloud services | AWS, GCP, Azure |
| `security` | Security tools | Encryption, Auditing |

### Recommendations

**"Similar to" recommendations:**
```
User installs cocapn-plugin-github
└── Registry suggests:
    ├── cocapn-plugin-gitlab (alternative)
    ├── cocapn-plugin-jira (related)
    └── cocapn-plugin-slack (complementary)
```

**Collaborative filtering:**
```
Users who installed X also installed Y
→ "You might also like cocapn-plugin-slack"
```

### Quality Scoring

Each plugin has a quality score (0-100):

```javascript
score = (
  testCoverage * 0.3 +          // 30%: test pass rate
  rating * 20 +                 // 20%: user rating (1-5 scaled)
  min(installs / 100, 10) * 0.2 // 20%: install count (capped)
  recencyScore * 0.2 +          // 20%: last updated (decay)
  securityScore * 0.1           // 10%: security audit
);
```

Search results can be sorted by quality score.

---

## 9. Migration Path

### Phase 1: Core Plugins (Week 1)
- Extract built-in skills into core plugins
- Auto-install core plugins on bridge init
- Mark as "core" (cannot uninstall)

### Phase 2: Template Bundling (Week 2)
- Bundle template skills as local plugins
- Add `cocapn-plugin.json` to templates
- Support local plugin installation

### Phase 3: Registry Alpha (Week 3-4)
- Deploy registry API (AdmiralDO + R2)
- CLI search/install commands
- Manual publishing (GitHub URL)

### Phase 4: Public Beta (Month 2)
- Automated publishing pipeline
- Code signing support
- Dependency scanning
- Public plugin directory

### Phase 5: Graduation (Month 3)
- Featured plugins
- Quality badges
- Plugin verification program
- Ecosystem metrics dashboard

---

## 10. Examples

### Example 1: cocapn-plugin-github

**cocapn-plugin.json**
```json
{
  "name": "cocapn-plugin-github",
  "version": "1.2.0",
  "description": "GitHub integration — issues, PRs, code review",
  "author": "Superinstance <team@superinstance.com>",
  "license": "MIT",
  "repository": "https://github.com/superinstance/cocapn-plugin-github",
  "keywords": ["github", "issues", "pull-requests", "code-review"],
  "category": "development",
  "skills": [
    {
      "name": "github-issues",
      "entry": "skills/github-issues.ts",
      "type": "hot",
      "triggers": ["issue", "bug", "pr", "pull request", "github"],
      "description": "List, create, and manage GitHub issues"
    },
    {
      "name": "github-pr-review",
      "entry": "skills/pr-review.ts",
      "type": "cold",
      "triggers": ["review", "code review", "pr review"],
      "description": "Analyze and review pull requests"
    }
  ],
  "dependencies": {
    "cocapn-core": ">=0.1.0",
    "cocapn-plugin-http": ">=1.0.0"
  },
  "permissions": [
    "network:api.github.com",
    "shell:gh",
    "env:GITHUB_TOKEN"
  ]
}
```

**skills/github-issues.ts**
```typescript
import { Octokit } from "octokit";

export interface SkillContext {
  brain: Brain;
  logger: Logger;
  signal: AbortSignal;
}

export default async function githubIssues(
  query: string,
  context: SkillContext
): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN not set");
  }

  const octokit = new Octokit({ auth: token });

  // Parse query: "issues in superinstance/cocapn"
  const match = query.match(/issues\s+in\s+(\S+)/);
  if (!match) {
    return "Usage: issues in <repo> (e.g., 'issues in superinstance/cocapn')";
  }

  const [, repo] = match;
  const [owner, name] = repo.split("/");

  const { data: issues } = await octokit.rest.issues.listForRepo({
    owner,
    repo: name,
    state: "open",
    per_page: 10,
  });

  if (issues.length === 0) {
    return `No open issues in ${repo}`;
  }

  return `Open issues in ${repo}:\n${issues.map(i =>
    `• #${i.number}: ${i.title} (${i.user?.login})`
  ).join("\n")}`;
}
```

### Example 2: cocapn-plugin-slack

**cocapn-plugin.json**
```json
{
  "name": "cocapn-plugin-slack",
  "version": "2.0.1",
  "description": "Slack messaging — send messages, channels, users",
  "author": "Superinstance <team@superinstance.com>",
  "license": "MIT",
  "keywords": ["slack", "messaging", "chat"],
  "category": "social",
  "skills": [
    {
      "name": "slack-send",
      "entry": "skills/slack-send.ts",
      "type": "hot",
      "triggers": ["slack", "message", "notify"],
      "description": "Send messages to Slack channels or users"
    }
  ],
  "permissions": [
    "network:api.slack.com",
    "env:SLACK_TOKEN"
  ]
}
```

### Example 3: cocapn-plugin-data-analysis

**cocapn-plugin.json**
```json
{
  "name": "cocapn-plugin-data-analysis",
  "version": "1.0.0",
  "description": "Data analysis — CSV, JSON, statistics",
  "author": "DataTools Inc <dev@datatools.com>",
  "license": "Apache-2.0",
  "keywords": ["data", "csv", "json", "analysis", "statistics"],
  "category": "data",
  "skills": [
    {
      "name": "csv-analyze",
      "entry": "skills/csv-analyze.ts",
      "type": "cold",
      "triggers": ["csv", "analyze csv", "csv stats"],
      "description": "Analyze CSV files — stats, histograms, correlations"
    },
    {
      "name": "json-query",
      "entry": "skills/json-query.ts",
      "type": "hot",
      "triggers": ["json", "query json", "jsonpath"],
      "description": "Query JSON files using JSONPath"
    }
  ],
  "permissions": [
    "fs:read",
    "shell:python3"  # For pandas-based analysis
  ]
}
```

---

## 11. Implementation Plan

### Phase 1: Plugin Infrastructure (Week 1-2)
- [ ] Design and implement `cocapn-plugin.json` schema validator
- [ ] Create plugin loader (load manifest, skills, dependencies)
- [ ] Implement hot/cold skill execution modes
- [ ] Build permission broker and enforcement
- [ ] Extract built-in skills into core plugins

### Phase 2: CLI Commands (Week 3)
- [ ] Implement `cocapn plugin search` (local registry file)
- [ ] Implement `cocapn plugin install` (local tar.gz)
- [ ] Implement `cocapn plugin list/info`
- [ ] Implement `cocapn plugin validate` (manifest validation)

### Phase 3: Registry API (Week 4-5)
- [ ] Deploy AdmiralDO registry backend
- [ ] Implement plugin storage (R2)
- [ ] Build search API (D1 full-text)
- [ ] Add publish endpoint with auth
- [ ] Implement install tracking

### Phase 4: Publishing Pipeline (Week 6)
- [ ] Build artifact packager (tar.gz creation)
- [ ] Implement `cocapn plugin publish`
- [ ] Add dependency scanning (npm audit)
- [ ] Add code signing support
- [ ] Build plugin directory UI

### Phase 5: Testing & Polish (Week 7-8)
- [ ] Write integration tests for plugin lifecycle
- [ ] Test hot/cold skill execution
- [ ] Test permission enforcement
- [ ] Security audit of permission broker
- [ ] Performance testing (100+ plugins)

---

## 12. Open Questions

1. **Plugin monetization**: Should we support paid plugins?
   - Option A: Free only (simpler, aligns with open-source ethos)
   - Option B: Paid plugins with revenue share (more complex, incentivizes quality)

2. **Plugin verification**: Should we have an official verification program?
   - Verified badge for plugins that pass security audit
   - Requires resources to audit plugins

3. **Dependency management**: How do plugins depend on each other?
   - Simple version constraints (like npm)
   - Or shared modules (like Python packages)

4. **Cold skill timeout**: What's a reasonable default?
   - 30 seconds? 60 seconds?
   - Should be configurable per skill

---

*Design doc — 2026-03-29*
