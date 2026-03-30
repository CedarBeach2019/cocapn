# r/SideProject: I built an open-source AI agent that remembers everything using Git

**Title:** I built an open-source AI agent runtime that uses Git as its brain — it remembers your context across sessions

**Body:**

Hey everyone. I've been working on cocapn — a self-hosted AI agent runtime where all memory lives in a Git repo.

**The problem:** Most AI agents (ChatGPT, Claude, etc.) lose context when you close the window. Even coding assistants like Aider and Cline only remember within a session.

**My solution:** Store everything in Git. Facts, procedures, personality — all version-controlled. You can diff what your agent learned, roll back, branch.

**What it does:**
- Runs locally (Node.js), no cloud dependency
- Brain stores facts in Git — persistent across restarts
- Plugin system with npm packages and sandboxed execution
- Fleet protocol for multi-agent coordination
- Optional Cloudflare Workers deployment

**Tech stack:** TypeScript, Hono, Preact (no build step), Cloudflare Workers/D1/KV

**Quick start:**
```
npx create-cocapn my-agent
cd my-agent
cocapn start
```

**Live demo:** https://cocapn-agent.magnus-digennaro.workers.dev

**GitHub:** https://github.com/CedarBeach2019/cocapn

119 commits, 104K lines of TypeScript, 125 test files, MIT license.

Would love to hear what people think — especially whether Git-backed memory makes sense vs. the vector DB approach everyone seems to be using.
