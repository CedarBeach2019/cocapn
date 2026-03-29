<div align="center">

# Cocapn

### *The self-hosted AI agent runtime that remembers.*

**Deploy in 60 seconds. It remembers you tomorrow.**

[![npm version](https://badge.fury.io/js/cocapn.svg)](https://www.npmjs.com/package/cocapn)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![by Superinstance](https://img.shields.io/badge/by-Superinstance-purple)](https://superinstance.com)

[![Demo](docs/demo.gif)](docs/demo.md)

</div>

## Install

```bash
npx create-cocapn my-agent
cd my-agent
cocapn start
```

That's it. Open `localhost:3000`, chat, close it, restart — your agent remembers everything.

## Why Cocapn?

Every AI assistant forgets you when you close the tab. Cocapn doesn't.

**Persistent Memory** — Your agent stores facts, context, and personality in a Git-backed Brain. It remembers your name, your preferences, and your projects across every session. Memory is version-controlled, auditable, and fully yours.

**Self-Assembly** — Run `cocapn start` and it detects your project, reads your config, and configures itself. No YAML wrestling, no boilerplate.

**Plugin System** — Extend your agent with npm packages. Skills run hot (in-process) or cold (sandboxed). Permissions are explicit and granular.

**Fleet Protocol** — Multiple agents coordinate via A2A (Agent-to-Agent). Distribute tasks, share context, and scale across machines.

**Zero Lock-in** — Your data lives in Git repos on your machine. No cloud dependency, no vendor lock-in, no API key required. Cloud is optional enhancement, not a requirement.

## Quick Start

```bash
# Create with a template
npx create-cocapn my-agent
cd my-agent
cocapn init --template makerlog

# Start
cocapn start

# Deploy to Cloudflare Workers (optional)
cocapn deploy
```

**Templates:** `bare`, `businesslog`, `cloud-worker`, `dmlog`, `makerlog`, `studylog`, `web-app`

## What Agents Remember

Agent memory lives in two Git repos:

- **Private Brain** — Facts (`private.*` never leave your machine), procedures, soul/personality
- **Public Repo** — Published content, shared knowledge

```bash
# Memory is just Git
cd ~/.cocapn/brains/default
git log --oneline  # Every memory change, versioned
```

## Plugins & Skills

```json
{
  "name": "cocapn-plugin-example",
  "version": "1.0.0",
  "skills": [
    { "name": "my-skill", "entry": "skills/my-skill.js", "type": "hot" }
  ],
  "permissions": ["network:api.example.com", "fs:read:~/documents"]
}
```

```bash
cocapn plugin install cocapn-plugin-example
```

## Fleet

```yaml
# cocapn.yml
fleet:
  enabled: true
  peers:
    - id: "research-agent"
      url: "https://research.example.com"
    - id: "writing-agent"
      url: "https://writing.example.com"
```

## Documentation

Full docs at [docs.cocapn.app](https://docs.cocapn.app) — architecture, plugins, templates, API reference, fleet protocol, and contributing guide.

## CLI

| Command | What it does |
|---------|-------------|
| `cocapn init` | Initialize a project |
| `cocapn start` | Start the local bridge |
| `cocapn deploy` | Deploy to Cloudflare Workers |
| `cocapn status` | Show bridge and agent status |
| `cocapn plugin install` | Install a plugin from npm |
| `cocapn skills run` | Run a skill |
| `cocapn fleet send` | Send a fleet message |

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built by [Superinstance](https://superinstance.com)**

</div>
