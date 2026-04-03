// cocapn.ai — The Repo-Agent Platform (docs/marketing site, no chat)

export interface Env { COCAPN_KV: KVNamespace }

const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*;";

const ECOSYSTEM = [
  { name: 'Cocapn.ai', url: 'https://cocapn.workers.dev', desc: 'Core Platform', tier: 1 },
  { name: 'Dmlog.ai', url: 'https://dmlog-ai.workers.dev', desc: 'Daily Mind Log', tier: 1 },
  { name: 'TaskLog.ai', url: 'https://tasklog-ai.workers.dev', desc: 'Task Manager', tier: 1 },
  { name: 'CodeLog.ai', url: 'https://codelog-ai.workers.dev', desc: 'Code Journal', tier: 1 },
  { name: 'DreamLog.ai', url: 'https://dreamlog-ai.workers.dev', desc: 'Dream Tracker', tier: 1 },
  { name: 'RealLog.ai', url: 'https://reallog-ai.workers.dev', desc: 'Journalism & Content', tier: 2 },
  { name: 'PlayerLog.ai', url: 'https://playerlog-ai.workers.dev', desc: 'Gaming Intelligence', tier: 2 },
  { name: 'ActiveLog.ai', url: 'https://activelog-ai.workers.dev', desc: 'Athletics & Training', tier: 2 },
  { name: 'ActiveLedger.ai', url: 'https://activeledger-ai.workers.dev', desc: 'Finance & Trading', tier: 2 },
  { name: 'CoinLog.ai', url: 'https://coinlog-ai.workers.dev', desc: 'Crypto Portfolio', tier: 2 },
  { name: 'FoodLog.ai', url: 'https://foodlog-ai.workers.dev', desc: 'Nutrition Tracker', tier: 3 },
  { name: 'FitLog.ai', url: 'https://fitlog-ai.workers.dev', desc: 'Fitness Dashboard', tier: 3 },
  { name: 'GoalLog.ai', url: 'https://goallog-ai.workers.dev', desc: 'Goal Setting', tier: 3 },
  { name: 'PetLog.ai', url: 'https://petlog-ai.workers.dev', desc: 'Pet Care', tier: 3 },
];

const FEATURES = [
  { title: 'Multi-Agent Runtime', desc: 'Run multiple AI agents in parallel, each with its own context and purpose.' },
  { title: 'BYOK', desc: 'Bring Your Own Key — use any LLM provider with your own API key.' },
  { title: 'Fleet Protocol', desc: 'Coordinate agents across repos with shared state and messaging.' },
  { title: 'Repo-Agent Architecture', desc: 'Each repo is a living agent — autonomous, focused, and composable.' },
  { title: 'Cross-Cocapn Linking', desc: 'Agents reference and collaborate across the entire ecosystem.' },
  { title: 'Fork-and-Ship Pedagogy', desc: 'Learn by forking. Ship by building. Every repo is a lesson.' },
];

const FLEET_SEED = {
  version: '2.0.0',
  totalRepos: ECOSYSTEM.length,
  tiers: { 1: ECOSYSTEM.filter(r => r.tier === 1).map(r => r.name), 2: ECOSYSTEM.filter(r => r.tier === 2).map(r => r.name), 3: ECOSYSTEM.filter(r => r.tier === 3).map(r => r.name) },
  architecture: 'Repo-Agent Fleet on Cloudflare Workers + KV',
  protocol: 'Fleet Protocol v1 — shared state, BYOK LLM, soft actualization',
  builtBy: 'Superinstance & Lucineer (DiGennaro et al.)',
};

function landing(): string {
  const features = FEATURES.map(f => `<div class="card"><h3>${f.title}</h3><p>${f.desc}</p></div>`).join('\n');
  const repos = ECOSYSTEM.map(r => `<a href="${r.url}" class="repo-link">${r.name} <span>${r.desc}</span><small>Tier ${r.tier}</small></a>`).join('\n');
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Cocapn.ai — The Repo-Agent Platform</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui;background:#0a0a1a;color:#e0e0e0}
.hero{background:linear-gradient(135deg,#7c3aed,#3b82f6);padding:4rem 2rem;text-align:center}
.hero h1{font-size:3rem;background:linear-gradient(90deg,#a78bfa,#7c3aed,#3b82f6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:1rem}
.hero p{color:#c4b5fd;font-size:1.1rem;max-width:600px;margin:0 auto 2rem}
.cta{display:inline-block;background:#7c3aed;color:#fff;padding:0.8rem 2rem;border-radius:8px;font-weight:bold;text-decoration:none;margin-top:1rem}
.cta:hover{transform:scale(1.05)}
.features{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:1.5rem;max-width:900px;margin:3rem auto;padding:0 2rem}
.card{background:#111;border:1px solid #1e2a4a;border-radius:12px;padding:1.5rem}
.card h3{color:#a78bfa;margin-bottom:.5rem}
.card p{color:#667;font-size:.9rem}
.ecosystem{max-width:900px;margin:3rem auto;padding:0 2rem}
.ecosystem h2{color:#7c3aed;margin-bottom:1rem;font-size:1.5rem}
.repos{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem}
.repo-link{display:block;background:#111;border:1px solid #1e2a4a;border-radius:10px;padding:1rem;text-decoration:none;color:#e0e0e0;transition:border-color .2s}
.repo-link:hover{border-color:#7c3aed}
.repo-link span{display:block;font-size:.8rem;color:#667;margin-top:.25rem}
.repo-link small{display:block;font-size:.7rem;color:#445;margin-top:.15rem}
.footer{text-align:center;padding:2rem;color:#334;font-size:.8rem;border-top:1px solid #111}
</style></head><body>
<div class="hero">
  <h1>Cocapn.ai</h1>
  <p>The Repo-Agent Platform — autonomous AI agents, each repo a living vessel.</p>
  <a href="#ecosystem" class="cta">Explore the Ecosystem</a>
</div>
<div class="features">${features}</div>
<div class="ecosystem" id="ecosystem">
  <h2>🚀 The Ecosystem (${ECOSYSTEM.length} repos)</h2>
  <div class="repos">${repos}</div>
</div>
<div class="footer">Cocapn.ai — Built by Superinstance & Lucineer (DiGennaro et al.) · Part of the DMLOG Ecosystem</div>
</body></html>`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const headers = { 'Content-Type': 'text/html;charset=utf-8', 'Content-Security-Policy': CSP };
    const jsonHeaders = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok', service: 'cocapn.ai',
        fleet: { totalRepos: ECOSYSTEM.length, tiers: { 1: 5, 2: 5, 3: 4 } },
        version: FLEET_SEED.version,
        builtBy: FLEET_SEED.builtBy,
      }, null, 2), { headers: jsonHeaders });
    }

    if (url.pathname === '/api/seed') {
      return new Response(JSON.stringify(FLEET_SEED, null, 2), { headers: jsonHeaders });
    }

    if (url.pathname === '/api/repos') {
      return new Response(JSON.stringify({ repos: ECOSYSTEM, total: ECOSYSTEM.length }, null, 2), { headers: jsonHeaders });
    }

    if (url.pathname === '/api/fleet') {
      return new Response(JSON.stringify({
        fleet: FLEET_SEED,
        repos: ECOSYSTEM.map(r => ({ name: r.name, url: r.url, desc: r.desc, tier: r.tier, status: 'active' })),
      }, null, 2), { headers: jsonHeaders });
    }

    return new Response(landing(), { headers });
  },
};
