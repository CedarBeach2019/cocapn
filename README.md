<div align="center">

# 🤖 Cocapn

### *The npm of AI Agents*

**An open-source agent runtime that self-assembles, learns, and deploys in 60 seconds**

[![npm version](https://badge.fury.io/js/cocapn.svg)](https://www.npmjs.com/package/cocapn)
[![Tests](https://img.shields.io/badge/tests-104%20files-success)](https://github.com/superinstance/cocapn)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![License](https://img.shields.io/badge/by-Superinstance-purple)](https://superinstance.com)

---

</div>

## 🚀 Quick Start

Get your AI agent up and running in three commands:

```bash
# 1. Create your agent
npm create cocapn@latest my-agent

# 2. Configure it
cd my-agent
cocapn init --template makerlog

# 3. Deploy it
cocapn deploy
```

**That's it!** Your agent is now live at `your-domain.cocapn.app` or your own custom domain.

---

## ✨ Features

### 🧠 **Git-Backed Memory**
- All agent knowledge stored in Git repositories
- Full version control of your agent's "brain"
- `private.*` facts never leave your private repo
- Age-encrypted secrets management

### 🔌 **Plugin System**
- Hot & cold skill execution
- Permissions-based sandbox
- npm-based plugin distribution
- Built-in skill registry

### 🌐 **Fleet Protocol**
- Multi-agent coordination via A2A
- Fleet JWT for secure communication
- Message routing & heartbeats
- Distributed task execution

### 🎨 **7 Built-in Templates**
| Template | Perfect For | Personality |
|----------|-------------|-------------|
| `bare` | Custom setups | Minimalist |
| `businesslog` | Enterprise | Professional |
| `cloud-worker` | Cloudflare deployments | Serverless-first |
| `dmlog` | TTRPG campaigns | Dungeon Master |
| `makerlog` | Developers | Builder-focused |
| `studylog` | Education | Research-oriented |
| `web-app` | Full-stack apps | Production-ready |

### 🔄 **MCP Integration**
- Connect to external MCP servers
- Use their tools seamlessly
- Stdio & SSE transport support
- Auto-discovery of available tools

### 📊 **Analytics**
- Event tracking (`agent.invoked`, `tool.used`, etc.)
- Metrics aggregation
- Export to JSON, CSV, Prometheus
- Fleet optimization insights

### 🎣 **Webhook System**
- GitHub, Slack, Discord handlers
- HMAC signature verification
- Retry logic with exponential backoff
- Event filtering & routing

### ☁️ **Cloudflare Workers**
- Optional cloud tier for 24/7 background tasks
- AdmiralDO for task queue & registry
- Auth service with JWT
- Rate limiting & session management

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Browser    │  │   CLI UI     │  │  WebSocket   │          │
│  │  (your.ai)   │  │  (cocapn)    │  │   Client     │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼──────────────────┼──────────────────┼────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BRIDGE LAYER                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Router     │  │   Spawner    │  │   Plugins    │          │
│  │  (messages)  │  │  (agents)    │  │  (skills)    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐          │
│  │    Brain     │  │   Modules    │  │  Scheduler   │          │
│  │  (memory)    │  │ (extensions) │  │   (cron)     │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼──────────────────┼──────────────────┼────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                        STORAGE LAYER                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Private Repo │  │  Public Repo │  │   Secrets    │          │
│  │  (brain)     │  │ (published)  │  │ (.age files) │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼ (optional)
┌─────────────────────────────────────────────────────────────────┐
│                         CLOUD LAYER                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Cloudflare   │  │  AdmiralDO   │  │     Auth     │          │
│  │   Workers    │  │ (Durable Obj)│  │   (JWT)      │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔌 Plugin System

Create and publish plugins to extend cocapn functionality:

### Plugin Structure

```json
// cocapn-plugin.json
{
  "name": "cocapn-plugin-example",
  "version": "1.0.0",
  "description": "Example plugin",
  "author": "Your Name",
  "skills": [
    {
      "name": "my-skill",
      "entry": "skills/my-skill.js",
      "type": "hot",
      "triggers": ["do something"],
      "description": "Does something useful"
    }
  ],
  "permissions": [
    "network:api.example.com",
    "fs:read:~/documents",
    "shell:ls"
  ]
}
```

### Permission Types

| Permission | Description |
|------------|-------------|
| `network:HOST` | Access specific host (or `*` for wildcard) |
| `fs:read:PATH` | Read files under path |
| `fs:write:PATH` | Write files under path |
| `shell:COMMAND` | Execute specific shell command |
| `env:VAR_NAME` | Read environment variable |
| `admin` | Bridge administration |

### Publishing

```bash
# Publish to npm
npm publish

# Install in cocapn
cocapn plugin install cocapn-plugin-example
```

---

## 🌐 Fleet Protocol

Multi-agent coordination via A2A (Agent-to-Agent) protocol:

### Features

- **Fleet JWT** — Signed identity tokens for inter-bridge communication
- **Message routing** — Direct or via AdmiralDO registry
- **Heartbeats** — Keep-alive and presence detection
- **Task distribution** — Distribute work across fleet members

### Configuration

```yaml
# cocapn.yml
fleet:
  enabled: true
  jwtSecret: "secret:FLEET_JWT_SECRET"
  peers:
    - id: "agent-1"
      url: "https://agent-1.example.com"
    - id: "agent-2"
      url: "https://agent-2.example.com"
```

### Usage

```bash
# Send message to fleet
cocapn fleet send --to agent-1 --message "Hello, fleet!"

# Check fleet status
cocapn fleet status

# Distribute task
cocapn fleet distribute --task "process-data"
```

---

## 📋 CLI Reference

### Core Commands

| Command | Description |
|---------|-------------|
| `cocapn init` | Initialize a new cocapn project |
| `cocapn start` | Start the local bridge |
| `cocapn deploy` | Deploy to Cloudflare Workers |
| `cocapn status` | Show bridge and agent status |
| `cocapn stop` | Stop the running bridge |

### Plugin Commands

| Command | Description |
|---------|-------------|
| `cocapn plugin install` | Install a plugin from npm |
| `cocapn plugin list` | List installed plugins |
| `cocapn plugin remove` | Remove an installed plugin |
| `cocapn plugin search` | Search the plugin registry |

### Skill Commands

| Command | Description |
|---------|-------------|
| `cocapn skills list` | List available skills |
| `cocapn skills run` | Run a specific skill |
| `cocapn skills create` | Create a new skill |

### Module Commands

| Command | Description |
|---------|-------------|
| `cocapn module add` | Add a module from git |
| `cocapn module list` | List installed modules |
| `cocapn module remove` | Remove a module |

### Template Commands

| Command | Description |
|---------|-------------|
| `cocapn templates list` | List available templates |
| `cocapn templates install` | Install a template |

### Fleet Commands

| Command | Description |
|---------|-------------|
| `cocapn fleet send` | Send message to fleet |
| `cocapn fleet status` | Check fleet status |
| `cocapn fleet distribute` | Distribute task across fleet |

---

## 📚 Documentation

Full documentation available at [docs.cocapn.app](https://docs.cocapn.app)

- **Getting Started** — Installation and setup
- **Architecture** — Deep dive into system design
- **Plugins** — Create and publish plugins
- **Templates** — Using and customizing templates
- **API Reference** — Complete API documentation
- **Fleet Protocol** — Multi-agent coordination
- **Contributing** — How to contribute

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific package tests
cd packages/local-bridge
npx vitest run

# Run E2E tests
cd e2e
npx playwright test

# Type check
npm run type-check
```

**Test Coverage:** 104 test files across packages

---

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

- Fork the repository
- Create your feature branch
- Commit your changes
- Push to the branch
- Open a Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 👤 Author

**Superinstance**

🌐 [superinstance.com](https://superinstance.com)

---

<div align="center">

**Built with ❤️ by Superinstance**

**Star us on GitHub — [github.com/superinstance/cocapn](https://github.com/superinstance/cocapn)**

</div>
