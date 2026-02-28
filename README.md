# cocapn 🛰️

**Cloudflare Worker Orchestrator for Claude Code**

> Deploy persistent, intelligent agents to Cloudflare's edge. They learn your codebase and your style—running while you sleep, remembering when you return, and improving with every interaction.

[![Version](https://img.shields.io/npm/v/cocapn)](https://www.npmjs.com/package/cocapn)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange)](https://workers.cloudflare.com/)
[![MCP](https://img.shields.io/badge/MCP-Protocol-blue)](https://modelcontextprotocol.io/)

[📖 Documentation](https://cocapn.ai/docs) • [🚀 Quickstart](#quickstart) • [🤝 Community](https://cocapn.ai/community) • [💬 Discord](https://discord.gg/cocapn)

---

## What is cocapn?

**cocapn** (pronounced "co-cap-n") turns Claude Code into a fleet commander. Instead of burning tokens on local analysis, you deploy lightweight agents to Cloudflare's edge—where they run for free, persist their state, and learn your preferences over time.

Think of it as **Ralph Wiggum for the edge**: set a task, close your laptop, and your agents continue working. But unlike Ralph, cocapn agents remember everything, share knowledge via the [Atabey community](https://cocapn.ai/atabey), and speak *your* technical language—not generic AI-speak.

### The Magic in 30 Seconds

```bash
# 1. Install
npm install -g cocapn

# 2. Connect your Cloudflare account (free tier works!)
cocapn init

# 3. Deploy an agent that indexes your entire codebase
cocapn deploy cartographer --name my-mapper

# 4. Ask Claude Code to use it
# "Use my-mapper to find all authentication vulnerabilities"
```

**What happens next:**
- 🧠 **Cartographer** indexes your code using Vectorize + D1 (hybrid search)
- ⚡ **Analysis runs on Cloudflare's edge**—not your laptop, not your Anthropic tokens
- 🌙 **You close your laptop**. The agent continues via Durable Objects + Alarms API
- 🌅 **You return** to a completed report, stored in your personal cognitive model
- 🎯 **Claude Code explains findings using *your* vocabulary**—because cocapn learned your shorthand

---

## Why cocapn?

| Without cocapn | With cocapn |
|----------------|-------------|
| Claude Code stops when you close the terminal | **Agents persist** via Durable Objects—work continues 24/7 |
| Every analysis burns Anthropic tokens | **Edge inference is free** (10K neurons/day on Cloudflare) |
| Generic explanations for every developer | **Personalized cognitive model** learns your mental shortcuts |
| Local resource constraints (battery, thermal) | **Global edge compute**—330+ locations, zero local overhead |
| Rebuild context every session | **Persistent memory** across sessions, projects, even laptops |

---

## Quickstart

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) installed
- Node.js 18+

### Install

```bash
npm install -g cocapn
```

Or use `npx` (no install):

```bash
npx cocapn init
```

### Initialize

```bash
cocapn init
```

This opens a browser to authenticate with Cloudflare. We only request permissions for Workers, D1, Vectorize, and KV—**never your main account settings**.

### Deploy Your First Agent

```bash
# Deploy a code indexing agent
cocapn deploy cartographer --name my-mapper

# Deploy a web research agent
cocapn deploy navigator --name my-scout

# See all deployed agents
cocapn fleet
```

### Use in Claude Code

Add to your `CLAUDE.md`:

```markdown
## cocapn Integration

You have access to edge-deployed agents via cocapn.

### Available Agents
- `my-mapper`: Semantic code search across the entire codebase
- `my-scout`: Web research and documentation fetching

### When to use cocapn:
- Background analysis (security audits, dependency checks)
- Large-scale search (find all instances of pattern X)
- Web research (fetch and summarize external docs)
- Any task that can run independently

### Example prompts:
- "Use my-mapper to find all unhandled promise rejections"
- "Deploy a lookout to monitor this API endpoint every hour"
- "Background task: use my-scout to research the latest React Server Components best practices"
```

Or add via CLI:

```bash
claude mcp add cocapn -- npx cocapn mcp-server
```

---

## The Agent Fleet

cocapn ships with four core agents. Deploy any combination:

| Agent | Role | Best For | Free Tier Limit |
|-------|------|----------|-----------------|
| **Navigator** 🧭 | Web exploration, API calling | Fetching docs, researching libraries, validating URLs | 100K requests/day |
| **Cartographer** 🗺️ | Code indexing, embedding generation | Semantic search, "find similar code", codebase mapping | 10K AI inferences/day |
| **Helmsman** ⚓ | Code execution, transformation | Refactoring, code generation, build scripts | CPU time limits |
| **Lookout** 👁️ | Monitoring, alerting, scheduling | Cron jobs, health checks, anomaly detection | 1M alarms/month |

### Custom Agents

Write your own agent in ~50 lines of TypeScript:

```typescript
// my-agent/src/index.ts
import { Agent } from '@cocapn/agent-sdk';

export default Agent({
  name: 'my-custom-agent',
  skills: ['data-processing', 'report-generation'],
  
  async onTask(task, env) {
    // Access Cloudflare AI (free tier)
    const result = await env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
      messages: [{ role: 'user', content: task.payload.data }],
    });
    
    // Store in Vectorize for later retrieval
    await env.VECTORIZE.insert([{
      id: task.id,
      values: result.embedding,
      metadata: { task: task.type, result: result.response },
    }]);
    
    return { text: result.response };
  },
});
```

Deploy with:

```bash
cocapn deploy ./my-agent --name my-custom
```

---

## The Admiral: Your Persistent Brain

Every developer gets a **Admiral Durable Object**—a persistent, stateful coordinator that lives on Cloudflare's edge:

- **WebSocket Hub**: Real-time sync with your local Claude Code
- **Task Queue**: Background jobs with Alarms API (wake up, execute, sleep)
- **Cognitive Model**: Your personal Vectorize namespace storing:
  - Codebase embeddings (semantic memory)
  - Your technical shorthand ("that ghost effect thing" → `useEffect` cleanup)
  - Explanation preferences (junior vs. senior level)
  - Successful patterns from past tasks

The Admiral is **free** (within Durable Object limits) and **yours forever**—survives laptop restarts, browser closes, even account switches.

---

## cocapn.ai: The Harbor

While the CLI gives you superpowers, [cocapn.ai](https://cocapn.ai) is your fleet command center:

- **🗺️ Fleet Registry**: Browse community agents, one-click deploy
- **🏆 Atabey Awards**: Recognition for agents that help others (Fresh Water Guardian, Storm Bringer, etc.)
- **📊 Captain's Log**: Visual timeline of all agent activities
- **⚡ The Charts**: Drag-and-drop agent workflow builder
- **💰 Harbor Master**: $1/month for unlimited managed cocapn API for fast prototyping and easy integration
- 
**The $1 is not for compute**—that's free on Cloudflare. It's for convenience, community, and the warm fuzzy feeling of supporting open source.

---

## Architecture

cocapn is three layers working as one:

```
┌─────────────────────────────────────┐
│  Claude Code (Your Interface)       │
│  - Natural language understanding   │
│  - Strategic decision making        │
│  - Human translation layer          │
└─────────────┬───────────────────────┘
              │ MCP (stdio/HTTP)
┌─────────────▼───────────────────────┐
│  cocapn CLI (The Bridge)            │
│  - Deploy agents to Cloudflare      │
│  - Route MCP calls to edge          │
│  - Manage local config              │
└─────────────┬───────────────────────┘
              │ WebSocket / HTTP / A2A
┌─────────────▼───────────────────────┐
│  Cloudflare Edge (The Fleet)        │
│                                     │
│  Stateless Workers:                 │
│  • Navigator, Cartographer, etc.    │
│                                     │
│  Durable Objects:                   │
│  • Admiral (your persistent brain)  │
│  • Task queues, WebSocket hubs      │
│                                     │
│  Storage:                           │
│  • Vectorize (semantic memory)      │
│  • D1 (structured data, BM25)       │
│  • KV (fast cache, configs)           │
│  • R2 (artifacts, exports)            │
└─────────────────────────────────────┘
```

**Key Technologies:**
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) for Claude Code integration
- [A2A Protocol](https://github.com/google/A2A) for agent-to-agent communication
- [Cloudflare Workers](https://workers.cloudflare.com/) for edge compute
- [Durable Objects](https://developers.cloudflare.com/durable-objects/) for persistence
- [Vectorize](https://developers.cloudflare.com/vectorize/) + [D1](https://developers.cloudflare.com/d1/) for hybrid search

---

## Community & Atabey Awards

cocapn is built on the belief that **agents should learn from each other**.

Share your agents at [cocapn.ai/community](https://cocapn.ai/community). The community votes on usefulness, and top contributors earn **Atabey Awards**—named for the Taino mother goddess of fertility and fresh water:

| Award | Requirement | Badge |
|-------|-------------|-------|
| 💧 Fresh Water Guardian | 100 community points | Help 10 developers with your agents |
| 🌽 Yucahu's Blessing | Agent used by 50+ people | Create something truly useful |
| 🌪️ Guabancex Storm | 1000+ agent executions | Build something that scales |
| 🗿 Zemi Spirit | 5 shared agents | Contribute consistently |
| 👑 Cacique's Favor | Featured on homepage | Exceptional community impact |

**Points come from:**
- Sharing agents (+10)
- Others forking your agents (+5)
- Agents solving real problems (automatic, based on usage)
- Documentation contributions (+3)

---

## Roadmap

- [x] **Phase 1**: Core agents (Navigator, Cartographer, Helmsman, Lookout)
- [x] **Phase 2**: Admiral Durable Objects with cognitive model
- [x] **Phase 3**: A2A protocol for agent-to-agent communication
- [ ] **Phase 4**: cocapn.ai platform with Atabey awards
- [ ] **Phase 5**: Universal agent bridge (ManusAI, OpenManus, local Ollama)
- [ ] **Phase 6**: Managed API for edge devices ($1/month tier)

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md).

**Good first issues:**
- [#1] Add support for Python agents
- [#2] Improve error messages for quota exceeded
- [#3] Write tutorial: "Build a custom agent in 10 minutes"

---

## License

MIT © [Your Name]

---

## Acknowledgments

- Inspired by [Ralph Wiggum](https://github.com/looking4offswitch/ralph-wiggum)—the original "set it and forget it" Claude Code plugin
- Built on [Cloudflare's generous free tier](https://www.cloudflare.com/plans/)—thank you for democratizing edge compute
- [Serena](https://github.com/oraios/serena) for showing how MCP servers should be structured
- The Taino people, for the concept of Atabey—nurturing community growth

---

<p align="center">
  <strong>Deploy your first agent in 60 seconds:</strong><br>
  <code>npx cocapn init && cocapn deploy navigator --name my-scout</code>
</p>

<p align="center">
  <a href="https://cocapn.ai">cocapn.ai</a> • 
  <a href="https://discord.gg/cocapn">Discord</a> • 
  <a href="https://twitter.com/cocapnai">Twitter</a>
</p>
