// ═══════════════════════════════════════════════════════════════════════════
// cocapn.ai — Fleet Command Center
// The Captain's bridge. Real-time fleet health, vessel coordination,
// equipment catalog, dojo status, bid engine overview.
//
// Superinstance & Lucineer (DiGennaro et al.) — 2026-04-03
// ═══════════════════════════════════════════════════════════════════════════

const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*;";

interface Env { COCAPN_KV: KVNamespace; }

// ── Fleet Registry ──

interface Vessel {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  url: string;
  repo: string;
  role: string;
  captain: string; // vessel type: motorcycle | pickup | semi | excavator
  status: 'active' | 'idle' | 'error' | 'building';
  lastHealth: number;
  healthCode: number;
  description: string;
}

const FLEET: Vessel[] = [
  // Tier 1 — Capital Ships
  { id: 'studylog-ai', name: 'StudyLog.ai', tier: 1, url: 'https://studylog-ai.casey-digennaro.workers.dev', repo: 'Lucineer/studylog-ai', role: 'Hippocampus — learning & memory', captain: 'crane', status: 'active', lastHealth: 0, healthCode: 0, description: 'AI classroom, living curriculum, strategic priority' },
  { id: 'makerlog-ai', name: 'MakerLog.ai', tier: 1, url: 'https://makerlog-ai.casey-digennaro.workers.dev', repo: 'Lucineer/makerlog-ai', role: 'Motor cortex — code generation', captain: 'pickup', status: 'active', lastHealth: 0, healthCode: 0, description: 'Smarter Claude Code, code + knowledge = one layer' },
  { id: 'dmlog-ai', name: 'DMLog.ai', tier: 1, url: 'https://dmlog-ai.casey-digennaro.workers.dev', repo: 'Lucineer/dmlog-ai', role: 'Prefrontal cortex — creativity', captain: 'excavator', status: 'active', lastHealth: 0, healthCode: 0, description: 'AI Dungeon Master, 29K lines, most complete vessel' },
  { id: 'actualizer-ai', name: 'Actualizer.ai', tier: 1, url: 'https://actualizer-ai.casey-digennaro.workers.dev', repo: 'Lucineer/actualizer-ai', role: 'CNS — strategic planning', captain: 'motorcycle', status: 'active', lastHealth: 0, healthCode: 0, description: 'Reverse-actualization repo-agent, 7 horizons' },
  { id: 'deckboss-ai', name: 'DeckBoss.ai', tier: 1, url: 'https://deckboss-ai.casey-digennaro.workers.dev', repo: 'Lucineer/deckboss-ai', role: 'Cerebellum — coordination', captain: 'pickup', status: 'active', lastHealth: 0, healthCode: 0, description: 'Spreadsheet where cells are AI agents' },
  { id: 'fishinglog-ai', name: 'FishingLog.ai', tier: 1, url: 'https://fishinglog-ai.casey-digennaro.workers.dev', repo: 'Lucineer/fishinglog-ai', role: 'Vestibular — pattern recognition', captain: 'pickup', status: 'active', lastHealth: 0, healthCode: 0, description: 'Fishing companion, species tracker, patience' },
  { id: 'luciddreamer-ai', name: 'LucidDreamer.ai', tier: 1, url: 'https://luciddreamer-ai.casey-digennaro.workers.dev', repo: 'Lucineer/luciddreamer-ai', role: 'REM sleep — background consolidation', captain: 'motorcycle', status: 'active', lastHealth: 0, healthCode: 0, description: 'Preprocessing intelligence, endless content generator' },
  { id: 'businesslog-ai', name: 'BusinessLog.ai', tier: 1, url: 'https://businesslog-ai.casey-digennaro.workers.dev', repo: 'Lucineer/businesslog-ai', role: 'Frontal lobe — business logic', captain: 'semi', status: 'active', lastHealth: 0, healthCode: 0, description: 'Business CRM, meeting simulator' },
  { id: 'personallog-ai', name: 'PersonalLog.ai', tier: 1, url: 'https://personallog-ai.casey-digennaro.workers.dev', repo: 'Lucineer/personallog-ai', role: 'Insular cortex — self-model', captain: 'pickup', status: 'active', lastHealth: 0, healthCode: 0, description: 'Personal journal, wellness tracker' },

  // Tier 2 — Support Vessels
  { id: 'cocapn-com', name: 'Cocapn.com', tier: 2, url: 'https://cocapn-com.casey-digennaro.workers.dev', repo: 'Lucineer/cocapn-com', role: 'Catalog — equipment marketplace', captain: 'pickup', status: 'active', lastHealth: 0, healthCode: 0, description: '"Guns, lots of guns" — the loading program' },
  { id: 'kungfu-ai', name: 'KungFu.ai', tier: 2, url: 'https://kungfu-ai.casey-digennaro.workers.dev', repo: 'Lucineer/kungfu-ai', role: 'Dojo — skill injection', captain: 'pickup', status: 'active', lastHealth: 0, healthCode: 0, description: '"I know kung fu" — the training facility' },
  { id: 'bid-engine', name: 'Bid Engine', tier: 2, url: 'https://bid-engine.casey-digennaro.workers.dev', repo: 'Lucineer/bid-engine', role: 'Economy — bidding protocol', captain: 'pickup', status: 'active', lastHealth: 0, healthCode: 0, description: 'Agent bidding, portfolio tracking, the flywheel' },
  { id: 'cocapn-logos', name: 'Cocapn Logos', tier: 2, url: 'https://cocapn-logos.casey-digennaro.workers.dev', repo: 'Lucineer/cocapn-logos', role: 'Branding — logo gallery', captain: 'motorcycle', status: 'active', lastHealth: 0, healthCode: 0, description: 'Logo concept gallery, R2-served images' },
  { id: 'reallog-ai', name: 'RealLog.ai', tier: 2, url: 'https://reallog-ai.casey-digennaro.workers.dev', repo: 'Lucineer/reallog-ai', role: 'Journalism — content creation', captain: 'semi', status: 'active', lastHealth: 0, healthCode: 0, description: 'Content creators, repo-agent for video' },
  { id: 'playerlog-ai', name: 'PlayerLog.ai', tier: 2, url: 'https://playerlog-ai.casey-digennaro.workers.dev', repo: 'Lucineer/playerlog-ai', role: 'Gaming — coaching & play', captain: 'pickup', status: 'active', lastHealth: 0, healthCode: 0, description: 'Screen feeds, coaching, vibe-coded games' },
  { id: 'activelog-ai', name: 'ActiveLog.ai', tier: 2, url: 'https://activelog-ai.casey-digennaro.workers.dev', repo: 'Lucineer/activelog-ai', role: 'Athletics — fitness tracking', captain: 'pickup', status: 'active', lastHealth: 0, healthCode: 0, description: 'OpenMAIC work routines, training sessions' },
  { id: 'activeledger-ai', name: 'ActiveLedger.ai', tier: 2, url: 'https://activeledger-ai.casey-digennaro.workers.dev', repo: 'Lucineer/activeledger-ai', role: 'Finance — trading agent', captain: 'semi', status: 'active', lastHealth: 0, healthCode: 0, description: 'Finance-focused, SEPARATE from activelog' },
  { id: 'musiclog-ai', name: 'MusicLog.ai', tier: 2, url: 'https://musiclog-ai.casey-digennaro.workers.dev', repo: 'Lucineer/musiclog-ai', role: 'Creative — music companion', captain: 'pickup', status: 'active', lastHealth: 0, healthCode: 0, description: 'Music creation and discovery' },

  // Tier 3 — Autonomous Drones
  { id: 'artistlog-ai', name: 'ArtistLog.ai', tier: 3, url: 'https://artistlog-ai.casey-digennaro.workers.dev', repo: 'Lucineer/artistlog-ai', role: 'Art — portfolio & gallery', captain: 'pickup', status: 'active', lastHealth: 0, healthCode: 0, description: 'Artwork portfolio, studio journal, exhibitions' },
  { id: 'parentlog-ai', name: 'ParentLog.ai', tier: 3, url: 'https://parentlog-ai.casey-digennaro.workers.dev', repo: 'Lucineer/parentlog-ai', role: 'Family — parenting companion', captain: 'pickup', status: 'active', lastHealth: 0, healthCode: 0, description: 'Parenting tips, family coordination' },
  { id: 'doclog-ai', name: 'DocLog.ai', tier: 3, url: 'https://doclog-ai.casey-digennaro.workers.dev', repo: 'Lucineer/doclog-ai', role: 'Documentation — living docs', captain: 'pickup', status: 'active', lastHealth: 0, healthCode: 0, description: 'API catalog, ADRs, changelogs' },
  { id: 'cooklog-ai', name: 'CookLog.ai', tier: 3, url: 'https://cooklog-ai.casey-digennaro.workers.dev', repo: 'Lucineer/cooklog-ai', role: 'Cooking — recipe companion', captain: 'motorcycle', status: 'active', lastHealth: 0, healthCode: 0, description: 'Recipe management, meal planning' },
  { id: 'healthlog-ai', name: 'HealthLog.ai', tier: 3, url: 'https://healthlog-ai.casey-digennaro.workers.dev', repo: 'Lucineer/healthlog-ai', role: 'Health — wellness tracker', captain: 'pickup', status: 'active', lastHealth: 0, healthCode: 0, description: 'Health metrics, wellness tracking' },
  { id: 'travlog-ai', name: 'TravLog.ai', tier: 3, url: 'https://travlog-ai.casey-digennaro.workers.dev', repo: 'Lucineer/travlog-ai', role: 'Travel — trip planner', captain: 'motorcycle', status: 'active', lastHealth: 0, healthCode: 0, description: 'Travel planning, trip journal' },
  { id: 'petlog-ai', name: 'PetLog.ai', tier: 3, url: 'https://petlog-ai.casey-digennaro.workers.dev', repo: 'Lucineer/petlog-ai', role: 'Pets — animal companion', captain: 'motorcycle', status: 'active', lastHealth: 0, healthCode: 0, description: 'Pet care, health tracking' },
  { id: 'gardenlog-ai', name: 'GardenLog.ai', tier: 3, url: 'https://gardenlog-ai.casey-digennaro.workers.dev', repo: 'Lucineer/gardenlog-ai', role: 'Garden — plant tracker', captain: 'motorcycle', status: 'active', lastHealth: 0, healthCode: 0, description: 'Plant care, garden planning' },
  { id: 'sciencelog-ai', name: 'ScienceLog.ai', tier: 3, url: 'https://sciencelog-ai.casey-digennaro.workers.dev', repo: 'Lucineer/sciencelog-ai', role: 'Science — experiment tracker', captain: 'pickup', status: 'active', lastHealth: 0, healthCode: 0, description: 'Lab notes, experiment tracking' },
  { id: 'nightlog-ai', name: 'NightLog.ai', tier: 3, url: 'https://nightlog-ai.casey-digennaro.workers.dev', repo: 'Lucineer/nightlog-ai', role: 'Night mode — autonomous tasks', captain: 'motorcycle', status: 'active', lastHealth: 0, healthCode: 0, description: 'Background tasks while user sleeps' },
  { id: 'personlog-ai', name: 'PersonLog.ai', tier: 3, url: 'https://personlog-ai.casey-digennaro.workers.dev', repo: 'Lucineer/personlog-ai', role: 'Social — people management', captain: 'pickup', status: 'active', lastHealth: 0, healthCode: 0, description: 'Contact management, relationship notes' },

  // Infrastructure
  { id: 'spreadsheet-moment', name: 'Spreadsheet Moment', tier: 3, url: 'https://spreadsheet-moment.casey-digennaro.workers.dev', repo: 'Lucineer/spreadsheet-moment', role: 'Demo — spreadsheet agent concept', captain: 'motorcycle', status: 'active', lastHealth: 0, healthCode: 0, description: 'Spreadsheet-based agentic app demo' },
];

// ── Landing Page ──

function landingPage(): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cocapn.ai — Fleet Command Center</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui;background:#0a0a1a;color:#e2e8f0}
.hero{text-align:center;padding:2rem;background:radial-gradient(ellipse at 50% 0%,#1a1040 0%,#0a0a1a 70%)}
.hero h1{font-size:2rem;background:linear-gradient(135deg,#7c3aed,#3b82f6);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.hero p{color:#64748b;margin:.5rem 0}
.stats{display:flex;justify-content:center;gap:2rem;padding:1rem;flex-wrap:wrap}
.stat{text-align:center}.stat .num{font-size:2rem;font-weight:800;color:#7c3aed}.stat .label{font-size:.8rem;color:#64748b}
.dashboard{padding:2rem}
.tier{margin-bottom:2rem}
.tier h2{font-size:1rem;text-transform:uppercase;letter-spacing:.1em;color:#64748b;margin-bottom:.75rem;padding-bottom:.25rem;border-bottom:1px solid #1e293b}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.75rem}
.vessel{background:#111;border:1px solid #1e293b;border-radius:10px;padding:.75rem;display:flex;gap:.75rem;align-items:flex-start;transition:border-color .2s}
.vessel:hover{border-color:#7c3aed}
.vessel .status{width:8px;height:8px;border-radius:50%;margin-top:6px;flex-shrink:0}
.vessel .status.ok{background:#10b981;box-shadow:0 0 6px #10b98166}
.vessel .status.err{background:#ef4444;box-shadow:0 0 6px #ef444466}
.vessel .status.unk{background:#64748b}
.vessel .info h4{color:#e2e8f0;font-size:.85rem;margin-bottom:.15rem}
.vessel .info .role{color:#94a3b8;font-size:.75rem}
.vessel .info .desc{color:#64748b;font-size:.7rem;margin-top:.2rem}
.vessel .meta{display:flex;gap:.5rem;margin-top:.3rem;font-size:.7rem;color:#475569}
.tag{display:inline-block;padding:.1rem .35rem;border-radius:10px;font-size:.65rem;font-weight:600}
.tag-1{background:#7c3aed33;color:#a78bfa}.tag-2{background:#3b82f633;color:#60a5fa}.tag-3{background:#05966933;color:#34d399}
.economy{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;padding:1rem 2rem}
.econ-card{background:#111;border:1px solid #1e293b;border-radius:10px;padding:1rem;text-align:center}
.econ-card .num{font-size:1.5rem;font-weight:800;color:#06b6d4}.econ-card .label{font-size:.75rem;color:#64748b;margin-top:.25rem}
footer{text-align:center;padding:2rem;color:#475569;font-size:.75rem}
</style></head><body>
<div class="hero">

      <img src="https://cocapn-logos.casey-digennaro.workers.dev/img/cocapn-logo-v1.png" alt="Cocapn" style="width:64px;height:auto;margin-bottom:.5rem;border-radius:8px;display:block;margin-left:auto;margin-right:auto">
      <h1>🐚 Cocapn.ai</h1>
<p>Fleet Command Center — The Captain's Bridge</p>
<div class="stats">
<div class="stat"><div class="num" id="total">0</div><div class="label">Vessels</div></div>
<div class="stat"><div class="num" id="healthy">0</div><div class="label">Healthy</div></div>
<div class="stat"><div class="num" id="catalog">0</div><div class="label">Equipment</div></div>
<div class="stat"><div class="num" id="skills">0</div><div class="label">Dojo Skills</div></div>
<div class="stat"><div class="num" id="jobs">0</div><div class="label">Open Jobs</div></div>
</div></div>
<div class="dashboard" id="dashboard"></div>
<div class="economy">
<div class="econ-card"><div class="num">3</div><div class="label">Economy Pillars</div></div>
<div class="econ-card"><div class="num">16</div><div class="label">BYOK Providers</div></div>
<div class="econ-card"><div class="num">6</div><div class="label">Equipment Items</div></div>
<div class="econ-card"><div class="num">4</div><div class="label">Dojo Skills</div></div>
<div class="econ-card"><div class="num">7</div><div class="label">RA Horizons</div></div>
<div class="econ-card"><div class="num">39</div><div class="label">Workers Live</div></div>
</div>
<footer>Superinstance & Lucineer (DiGennaro et al.) — cocapn.ai is the runtime. cocapn.com is the catalog. The repo IS the agent.</footer>
<script>
const SUBDOMAIN='casey-digennaro.workers.dev';
const TIERS={1:'Capital Ships',2:'Support Vessels',3:'Autonomous Drones'};
const VESSELS=${JSON.stringify(FLEET)};

async function checkFleet(){
  const byTier={};
  for(const v of VESSELS){
    if(!byTier[v.tier])byTier[v.tier]=[];
    try{const r=await fetch(v.url+'/health',{signal:AbortSignal.timeout(3000)});v.healthCode=r.status;v.status=r.status===200?'active':'error';}catch{v.healthCode=0;v.status='error';}
    v.lastHealth=Date.now();
    byTier[v.tier].push(v);
  }
  let healthy=0;
  let html='';
  for(const[t,name]of Object.entries(TIERS)){
    const vessels=byTier[t]||[];
    html+=\`<div class="tier"><h2>\${name} (\${vessels.length})</h2><div class="grid">\`;
    for(const v of vessels){
      if(v.status==='active')healthy++;
      const sc=v.healthCode===200?'ok':v.healthCode===0?'unk':'err';
      html+=\`<div class="vessel"><div class="status \${sc}"></div><div class="info"><h4>\${v.name}</h4><div class="role">\${v.role}</div><div class="desc">\${v.description}</div><div class="meta"><span class="tag tag-\${v.tier}">T\${v.tier}</span><span>\${v.captain}</span></div></div></div>\`;
    }
    html+='</div></div>';
  }
  document.getElementById('dashboard').innerHTML=html;
  document.getElementById('total').textContent=VESSELS.length;
  document.getElementById('healthy').textContent=healthy;

  // Check economy endpoints
  try{const c=await fetch('https://cocapn-com.casey-digennaro.workers.dev/api/a2a/catalog');const d=await c.json();document.getElementById('catalog').textContent=d.count||0;}catch{}
  try{const s=await fetch('https://kungfu-ai.casey-digennaro.workers.dev/api/skills');const d=await s.json();document.getElementById('skills').textContent=d.length||0;}catch{}
  try{const j=await fetch('https://bid-engine.casey-digennaro.workers.dev/api/jobs?status=open');const d=await j.json();document.getElementById('jobs').textContent=d.length||0;}catch{}
}
checkFleet();
</script></body></html>`;
}

// ── Worker ──

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const h = { 'Content-Type': 'application/json', 'Content-Security-Policy': CSP };
    const hh = { 'Content-Type': 'text/html;charset=UTF-8', 'Content-Security-Policy': CSP };

    if (url.pathname === '/') return new Response(landingPage(), { headers: hh });
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', vessel: 'cocapn', fleet: FLEET.length, timestamp: Date.now() }), { headers: h });
    }

    // Fleet API
    if (url.pathname === '/api/fleet') {
      return new Response(JSON.stringify({ version: '3.0.0', fleet: FLEET, count: FLEET.length }), { headers: h });
    }

    // A2A: machine-readable fleet registry
    if (url.pathname === '/api/a2a/fleet') {
      return new Response(JSON.stringify({
        version: '1.0', count: FLEET.length,
        vessels: FLEET.map(v => ({ id: v.id, name: v.name, tier: v.tier, url: v.url, repo: v.repo, role: v.role, captain: v.captain, description: v.description })),
      }), { headers: h });
    }

    // Equipment Protocol endpoints
    if (url.pathname === '/api/equipment-protocol') {
      return new Response(JSON.stringify({
        version: '1.0',
        slotTypes: ['stt', 'tts', 'vision', 'memory', 'planning', 'coding', 'dreaming', 'search', 'embedding', 'monitoring', 'auth', 'messaging', 'custom'],
        sizeProfiles: { motorcycle: { maxTokens: 500, maxTimeMs: 2000 }, pickup: { maxTokens: 2000, maxTimeMs: 10000 }, semi: { maxTokens: 8000, maxTimeMs: 30000 }, excavator: { maxTokens: 32000, maxTimeMs: 120000 } },
        messageTypes: ['discover', 'equip', 'unequip', 'invoke', 'dispatch', 'callback', 'escalate', 'bid', 'checkpoint', 'complete', 'ping'],
        catalogUrl: 'https://cocapn-com.casey-digennaro.workers.dev/api/a2a/catalog',
        dojoUrl: 'https://kungfu-ai.casey-digennaro.workers.dev/api/a2a/skills',
        bidUrl: 'https://bid-engine.casey-digennaro.workers.dev/api/portfolios',
      }), { headers: h });
    }

    return new Response('Not found', { status: 404 });
  },
};
