/**
 * Web wizard — serves the onboarding HTML at /onboard and provides API endpoints.
 *
 * API endpoints:
 *   POST /onboard/api/gh-status     → check GitHub auth
 *   POST /onboard/api/cf-status     → check Cloudflare auth
 *   POST /onboard/api/create-repos  → create both repos
 *   POST /onboard/api/deploy        → deploy to chosen platform
 *   GET  /onboard/api/qr            → generate QR code data for mobile
 *   GET  /onboard                   → serve the onboarding HTML page
 *
 * Zero external HTTP dependencies — uses Node.js built-in http module.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http";
import { execSync } from "child_process";
import {
  checkGitHubAuth,
  checkCloudflareAuth,
  checkPrerequisites,
  createRepos,
  createGitHubRemotes,
  createGitHubActionsWorkflow,
  createCloudflareConfig,
  createDockerfile,
  generateQrCodeData,
  runOnboarding,
  type OnboardingConfig,
  type DeploymentTarget,
} from "./onboarding-wizard.js";

// ─── JSON helpers ─────────────────────────────────────────────────────────────

function json(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// ─── HTML page ────────────────────────────────────────────────────────────────

function getWizardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cocapn Onboarding</title>
<style>
  :root { --bg: #0a0a0a; --text: #e0e0e0; --accent: #7c3aed; --accent2: #a78bfa; --surface: #1a1a1a; --border: #2a2a2a; --ok: #22c55e; --warn: #eab308; --err: #ef4444; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
  .container { max-width: 680px; margin: 0 auto; padding: 2rem 1.5rem; }
  h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
  h1 span { color: var(--accent2); }
  .subtitle { color: #888; margin-bottom: 2rem; }
  .step { display: none; }
  .step.active { display: block; }
  .step-title { font-size: 1.2rem; margin-bottom: 1rem; color: var(--accent2); }
  .form-group { margin-bottom: 1rem; }
  label { display: block; font-size: 0.85rem; color: #aaa; margin-bottom: 0.3rem; }
  input, textarea { width: 100%; padding: 0.6rem 0.8rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 0.95rem; outline: none; }
  input:focus, textarea:focus { border-color: var(--accent); }
  textarea { resize: vertical; min-height: 60px; }
  .deploy-grid { display: grid; gap: 0.6rem; }
  .deploy-option { padding: 0.8rem 1rem; background: var(--surface); border: 2px solid var(--border); border-radius: 8px; cursor: pointer; transition: border-color 0.2s; }
  .deploy-option:hover { border-color: var(--accent); }
  .deploy-option.selected { border-color: var(--accent); background: #1a1030; }
  .deploy-option h3 { font-size: 0.95rem; margin-bottom: 0.2rem; }
  .deploy-option p { font-size: 0.8rem; color: #888; }
  .status-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0; }
  .status-dot { width: 10px; height: 10px; border-radius: 50%; }
  .status-dot.ok { background: var(--ok); }
  .status-dot.warn { background: var(--warn); }
  .btn { display: inline-block; padding: 0.7rem 1.5rem; background: var(--accent); color: #fff; border: none; border-radius: 6px; font-size: 1rem; cursor: pointer; margin-top: 1rem; }
  .btn:hover { background: var(--accent2); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-row { display: flex; gap: 0.8rem; margin-top: 1.5rem; }
  .btn-secondary { background: var(--surface); border: 1px solid var(--border); }
  .progress-bar { height: 4px; background: var(--border); border-radius: 2px; margin-bottom: 1.5rem; }
  .progress-fill { height: 100%; background: var(--accent); border-radius: 2px; transition: width 0.3s; }
  .result-url { font-family: monospace; color: var(--accent2); word-break: break-all; }
  .log { background: var(--surface); padding: 0.8rem; border-radius: 6px; font-family: monospace; font-size: 0.85rem; max-height: 200px; overflow-y: auto; margin-top: 0.5rem; }
  .log-line { margin-bottom: 0.2rem; }
  .log-ok { color: var(--ok); }
  .log-err { color: var(--err); }
  .log-dim { color: #666; }
</style>
</head>
<body>
<div class="container">
  <h1>Welcome to <span>Cocapn</span></h1>
  <p class="subtitle">The repo IS the agent. Let's set yours up in 5 steps.</p>

  <div class="progress-bar"><div class="progress-fill" id="progress" style="width:20%"></div></div>

  <!-- Step 1: Identity -->
  <div class="step active" id="step1">
    <div class="step-title">Step 1: Agent Identity</div>
    <div class="form-group">
      <label>Agent name</label>
      <input id="agentName" placeholder="my-agent" value="">
    </div>
    <div class="form-group">
      <label>Emoji</label>
      <input id="agentEmoji" placeholder="🤖" value="🤖" maxlength="4">
    </div>
    <div class="form-group">
      <label>What does it do?</label>
      <textarea id="agentDescription" placeholder="A personal AI agent that helps with..."></textarea>
    </div>
    <div class="form-group">
      <label>GitHub username</label>
      <input id="username" placeholder="your-username">
    </div>
    <button class="btn" onclick="goStep(2)">Next: Deployment</button>
  </div>

  <!-- Step 2: Deployment -->
  <div class="step" id="step2">
    <div class="step-title">Step 2: Choose Deployment</div>
    <div class="deploy-grid" id="deployGrid">
      <div class="deploy-option selected" data-id="local" onclick="selectDeploy(this)">
        <h3>Local (your computer)</h3>
        <p>Run everything locally. No cloud, no cost. Full capabilities.</p>
      </div>
      <div class="deploy-option" data-id="cloudflare" onclick="selectDeploy(this)">
        <h3>Cloudflare Workers (free tier)</h3>
        <p>Deploy to the edge. Free tier covers most usage. Auto-scaling.</p>
      </div>
      <div class="deploy-option" data-id="github-actions" onclick="selectDeploy(this)">
        <h3>GitHub Actions (CI/CD)</h3>
        <p>Automated builds and deploys on push. Runs in the cloud for free.</p>
      </div>
      <div class="deploy-option" data-id="docker" onclick="selectDeploy(this)">
        <h3>Docker container</h3>
        <p>Run anywhere Docker runs. VPS, home server, NAS, or cloud.</p>
      </div>
      <div class="deploy-option" data-id="vps" onclick="selectDeploy(this)">
        <h3>Cloud VM / VPS</h3>
        <p>Deploy to a VPS (DigitalOcean, Hetzner, etc.). Full control.</p>
      </div>
    </div>
    <div class="btn-row">
      <button class="btn btn-secondary" onclick="goStep(1)">Back</button>
      <button class="btn" onclick="goStep(3)">Next: Auth</button>
    </div>
  </div>

  <!-- Step 3: Auth -->
  <div class="step" id="step3">
    <div class="step-title">Step 3: Configure Authentication</div>
    <div id="authStatus">
      <div class="status-row">
        <div class="status-dot" id="ghDot"></div>
        <span id="ghLabel">Checking GitHub...</span>
      </div>
      <div class="status-row">
        <div class="status-dot" id="cfDot"></div>
        <span id="cfLabel">Checking Cloudflare...</span>
      </div>
    </div>
    <p style="margin-top:0.8rem;font-size:0.85rem;color:#888;">
      Run <code>gh auth login</code> for GitHub, <code>wrangler login</code> for Cloudflare.
      You can continue without these — repos will be local-only.
    </p>
    <div class="btn-row">
      <button class="btn btn-secondary" onclick="goStep(2)">Back</button>
      <button class="btn" onclick="goStep(4)">Next: Create Repos</button>
    </div>
  </div>

  <!-- Step 4: Repo creation -->
  <div class="step" id="step4">
    <div class="step-title">Step 4: Create Your Repos</div>
    <button class="btn" id="createBtn" onclick="createRepos()">Create Repos</button>
    <div id="createLog" class="log" style="display:none"></div>
    <div class="btn-row">
      <button class="btn btn-secondary" onclick="goStep(3)">Back</button>
      <button class="btn" id="step4Next" onclick="goStep(5)" disabled>Next: Done</button>
    </div>
  </div>

  <!-- Step 5: Done -->
  <div class="step" id="step5">
    <div class="step-title">Done! Your Agent Is Live</div>
    <div style="margin-bottom:1rem;">
      <p><strong>Local:</strong> <span class="result-url" id="localUrl"></span></p>
      <p id="cloudUrlWrap" style="display:none"><strong>Cloud:</strong> <span class="result-url" id="cloudUrl"></span></p>
    </div>
    <div id="qrSection">
      <p style="font-size:0.9rem;margin-bottom:0.3rem;">Scan to connect from your phone:</p>
      <div id="qrCode" style="font-family:monospace;background:#fff;color:#000;padding:1rem;display:inline-block;border-radius:6px;"></div>
    </div>
    <div class="log" id="resultLog"></div>
    <button class="btn" onclick="startBridge()" style="margin-top:1rem;">Start Agent</button>
  </div>
</div>

<script>
let currentStep = 1;
let deployment = 'local';
let reposCreated = false;

function goStep(n) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById('step' + n).classList.add('active');
  document.getElementById('progress').style.width = (n * 20) + '%';
  currentStep = n;
  if (n === 3) checkAuth();
}

function selectDeploy(el) {
  document.querySelectorAll('.deploy-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  deployment = el.dataset.id;
}

async function checkAuth() {
  try {
    const r = await fetch('/onboard/api/gh-status', {method:'POST'});
    const d = await r.json();
    document.getElementById('ghDot').className = 'status-dot ' + (d.ok ? 'ok' : 'warn');
    document.getElementById('ghLabel').textContent = d.ok ? 'GitHub: logged in as ' + (d.username||'user') : 'GitHub: not logged in';
  } catch(e) {
    document.getElementById('ghDot').className = 'status-dot warn';
    document.getElementById('ghLabel').textContent = 'GitHub: check failed';
  }
  try {
    const r = await fetch('/onboard/api/cf-status', {method:'POST'});
    const d = await r.json();
    document.getElementById('cfDot').className = 'status-dot ' + (d.ok ? 'ok' : 'warn');
    document.getElementById('cfLabel').textContent = d.ok ? 'Cloudflare: authenticated as ' + (d.account||'user') : 'Cloudflare: not authenticated';
  } catch(e) {
    document.getElementById('cfDot').className = 'status-dot warn';
    document.getElementById('cfLabel').textContent = 'Cloudflare: check failed';
  }
}

function addLog(msg, cls) {
  const log = document.getElementById('createLog');
  log.style.display = 'block';
  const line = document.createElement('div');
  line.className = 'log-line' + (cls ? ' ' + cls : '');
  line.textContent = msg;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

async function createRepos() {
  const btn = document.getElementById('createBtn');
  btn.disabled = true;
  const agentName = document.getElementById('agentName').value || 'my-agent';
  const username = document.getElementById('username').value || 'user';
  const emoji = document.getElementById('agentEmoji').value || '🤖';
  const desc = document.getElementById('agentDescription').value || '';

  try {
    const r = await fetch('/onboard/api/create-repos', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ agentName, username, agentEmoji: emoji, agentDescription: desc, deployment, template:'bare', domain:'' })
    });
    const d = await r.json();
    if (d.ok) {
      addLog('Private repo: ' + d.brainDir, 'log-ok');
      addLog('Public repo:  ' + d.publicDir, 'log-ok');
      if (d.brainRemote) addLog('Remote: ' + d.brainRemote, 'log-ok');
      reposCreated = true;
      document.getElementById('step4Next').disabled = false;
      // Store URLs for step 5
      window._localUrl = d.localUrl || 'http://localhost:3100';
      window._cloudUrl = d.cloudUrl || null;
    } else {
      addLog('Error: ' + d.error, 'log-err');
      btn.disabled = false;
    }
  } catch(e) {
    addLog('Error: ' + e.message, 'log-err');
    btn.disabled = false;
  }
}

function startBridge() {
  // The actual bridge start happens via the CLI or API
  window.open(window._localUrl || 'http://localhost:3100', '_blank');
}

// Step 5 setup
const origGoStep = goStep;
goStep = function(n) {
  origGoStep(n);
  if (n === 5) {
    document.getElementById('localUrl').textContent = window._localUrl || 'http://localhost:3100';
    if (window._cloudUrl) {
      document.getElementById('cloudUrlWrap').style.display = 'block';
      document.getElementById('cloudUrl').textContent = window._cloudUrl;
    }
    // Fetch QR data
    fetch('/onboard/api/qr').then(r=>r.json()).then(d => {
      document.getElementById('qrCode').textContent = d.url || window._localUrl || 'http://localhost:3100';
    }).catch(()=>{});
    const rlog = document.getElementById('resultLog');
    rlog.innerHTML = '<div class="log-line log-ok">Repos created</div><div class="log-line log-dim">Agent ready to start</div>';
  }
};
</script>
</body>
</html>`;
}

// ─── API route handlers ───────────────────────────────────────────────────────

async function handleGhStatus(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const status = checkGitHubAuth();
  json(res, status);
}

async function handleCfStatus(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const status = checkCloudflareAuth();
  json(res, status);
}

async function handlePrerequisites(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const prereqs = checkPrerequisites();
  json(res, prereqs);
}

async function handleCreateRepos(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = JSON.parse(await readBody(req)) as OnboardingConfig;
    const config: OnboardingConfig = {
      agentName: body.agentName || "my-agent",
      agentEmoji: body.agentEmoji || "🤖",
      agentDescription: body.agentDescription || "",
      username: body.username || "user",
      template: body.template || "bare",
      domain: body.domain || "",
      deployment: (body.deployment as DeploymentTarget) || "local",
      baseDir: body.baseDir || process.cwd(),
    };

    const result = await runOnboarding(config);

    json(res, {
      ok: true,
      brainDir: result.repos.brainDir,
      publicDir: result.repos.publicDir,
      brainRemote: result.repos.brainRemote,
      publicRemote: result.repos.publicRemote,
      localUrl: result.localUrl,
      cloudUrl: result.cloudUrl,
    });
  } catch (e) {
    json(res, { ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

async function handleDeploy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = JSON.parse(await readBody(req)) as {
      deployment: DeploymentTarget;
      publicDir: string;
      agentName: string;
    };

    const { deployment, publicDir, agentName } = body;

    switch (deployment) {
      case "cloudflare":
        createCloudflareConfig(publicDir, agentName);
        try {
          execSync("wrangler deploy", { cwd: publicDir, stdio: "pipe", timeout: 60_000 });
        } catch (e) {
          json(res, { ok: false, error: `Wrangler deploy failed: ${e instanceof Error ? e.message : String(e)}` }, 500);
          return;
        }
        break;
      case "github-actions":
        createGitHubActionsWorkflow(publicDir, agentName);
        break;
      case "docker":
        createDockerfile(publicDir.replace(/-public$/, "-brain"), agentName);
        break;
    }

    json(res, { ok: true, deployment });
  } catch (e) {
    json(res, { ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

async function handleQr(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = "http://localhost:3100";
  json(res, { url: generateQrCodeData(url) });
}

// ─── Router ───────────────────────────────────────────────────────────────────

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const path = url.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  // API routes
  if (path === "/onboard/api/gh-status" && req.method === "POST") {
    return await handleGhStatus(req, res);
  }
  if (path === "/onboard/api/cf-status" && req.method === "POST") {
    return await handleCfStatus(req, res);
  }
  if (path === "/onboard/api/prerequisites" && req.method === "GET") {
    return await handlePrerequisites(req, res);
  }
  if (path === "/onboard/api/create-repos" && req.method === "POST") {
    return await handleCreateRepos(req, res);
  }
  if (path === "/onboard/api/deploy" && req.method === "POST") {
    return await handleDeploy(req, res);
  }
  if (path === "/onboard/api/qr" && req.method === "GET") {
    return await handleQr(req, res);
  }

  // Serve wizard HTML
  if (path === "/onboard" || path === "/onboard/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(getWizardHtml());
    return;
  }

  // Redirect root to onboard
  if (path === "/") {
    res.writeHead(302, { Location: "/onboard" });
    res.end();
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

// ─── Server ───────────────────────────────────────────────────────────────────

export interface WebWizardOptions {
  port?: number;
}

export function startWebWizard(options: WebWizardOptions = {}): Server {
  const port = options.port ?? 3100;
  const server = createServer(route);

  server.listen(port, () => {
    console.info(`[web-wizard] Onboarding wizard at http://localhost:${port}/onboard`);
  });

  return server;
}

// Export internals for testing
export { getWizardHtml, route, json, readBody };
