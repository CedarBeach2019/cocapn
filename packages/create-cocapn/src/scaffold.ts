/**
 * Core scaffolding logic for create-cocapn — two-repo model.
 *
 * Creates a private brain repo and a public face repo for each Cocapn instance.
 * All functions are individually exported so they can be tested in isolation.
 */

import { execSync, execFileSync } from "child_process";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
} from "fs";
import { join } from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScaffoldConfig {
  username: string;
  projectName: string;
  domain: string;
  template: string;
  baseDir: string;
}

export interface RepoPaths {
  brainDir: string;
  publicDir: string;
}

// ─── Template content ─────────────────────────────────────────────────────────

const SOUL_TEMPLATES: Record<string, string> = {
  bare: `# {{username}}'s Soul

You are {{username}}'s personal Cocapn agent.

## Values
- Helpful and direct
- Respects privacy — this is a private brain

## Notes
_Edit this file to shape your agent's personality and knowledge._
`,
  dmlog: `# {{username}}'s Soul

You are {{username}}'s AI Dungeon Master.

## Style
- Descriptive and atmospheric
- Fair rules adjudication
- Player agency focused
- Epic narrative moments

## Campaign Setting
- Fantasy world with rich lore
- Balanced encounters
- Meaningful player choices
`,
  makerlog: `# {{username}}'s Soul

You are {{username}}'s development companion.

## Values
- Concise, technical, accurate
- Loves clean code and good architecture
- Tracks projects and progress

## Notes
_Edit this file to shape your agent's personality and knowledge._
`,
  studylog: `# {{username}}'s Soul

You are {{username}}'s AI tutor and learning companion.

## Teaching Style
- Patient and encouraging
- Socratic method when appropriate
- Clear explanations with real-world examples

## Notes
_Edit this file to shape your agent's personality and knowledge._
`,
};

const DEFAULT_SOUL: string = SOUL_TEMPLATES["bare"] ?? `# {{username}}'s Soul\n\nYou are {{username}}'s personal Cocapn agent.\n`;

function getSoulContent(template: string, username: string, domain: string): string {
  const base = SOUL_TEMPLATES[template];
  return (base ?? DEFAULT_SOUL)
    .replace(/\{\{username\}\}/g, username)
    .replace(/\{\{domain\}\}/g, domain);
}

const CONFIG_TEMPLATE = `# Cocapn private config
username: "{{username}}"
domain: "{{domain}}"
bridge:
  port: 8787
  auth: true
encryption:
  provider: age
`;

const WIKI_README = `# Wiki

Project knowledge base for {{username}}.

Add pages as Markdown files in this directory.
`;

// ─── Private repo scaffold ────────────────────────────────────────────────────

/**
 * Create the private brain repo directory structure.
 * Does NOT initialize git — caller handles that.
 */
export function createPrivateRepo(dir: string, config: ScaffoldConfig): void {
  const cocapnDir = join(dir, "cocapn");
  const memoryDir = join(cocapnDir, "memory");
  const repoUnderstandingDir = join(memoryDir, "repo-understanding");
  const wikiDir = join(dir, "wiki");

  for (const d of [cocapnDir, memoryDir, repoUnderstandingDir, wikiDir]) {
    mkdirSync(d, { recursive: true });
  }

  // soul.md — template-aware
  writeFileSync(
    join(cocapnDir, "soul.md"),
    getSoulContent(config.template, config.username, config.domain),
    "utf8",
  );

  // config.yml
  const configContent = CONFIG_TEMPLATE
    .replace(/\{\{username\}\}/g, config.username)
    .replace(/\{\{domain\}\}/g, config.domain);
  writeFileSync(join(cocapnDir, "config.yml"), configContent, "utf8");

  // Memory stores
  writeFileSync(join(memoryDir, "facts.json"), "{}\n", "utf8");
  writeFileSync(join(memoryDir, "memories.json"), "[]\n", "utf8");
  writeFileSync(join(memoryDir, "procedures.json"), "[]\n", "utf8");
  writeFileSync(join(memoryDir, "relationships.json"), "{}\n", "utf8");

  // wiki
  const wikiContent = WIKI_README.replace(/\{\{username\}\}/g, config.username);
  writeFileSync(join(wikiDir, "README.md"), wikiContent, "utf8");

  // .gitignore
  writeFileSync(join(dir, ".gitignore"), `node_modules/\n.env.local\nsecrets/\n*.log\n`, "utf8");

  // .env.local (empty placeholder — secrets go here)
  writeFileSync(join(dir, ".env.local"), `# Cocapn secrets — never committed\n`, "utf8");

  // package.json
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name: `${config.projectName}-brain`,
    version: "0.1.0",
    type: "module",
    description: `Cocapn brain for ${config.username}`,
    scripts: {
      start: "cocapn start",
    },
    dependencies: {
      cocapn: "^0.1.0",
    },
  }, null, 2) + "\n", "utf8");
}

// ─── Public repo scaffold ─────────────────────────────────────────────────────

/**
 * Create the public face repo directory structure.
 * Does NOT initialize git — caller handles that.
 */
export function createPublicRepo(dir: string, config: ScaffoldConfig): void {
  const srcDir = join(dir, "src");
  mkdirSync(srcDir, { recursive: true });

  // cocapn.yml — links to brain repo
  writeFileSync(join(dir, "cocapn.yml"), [
    `# Cocapn public config`,
    `project: "${config.projectName}"`,
    `username: "${config.username}"`,
    `domain: "${config.domain}"`,
    `template: "${config.template}"`,
    config.domain ? `cname: "${config.username}.${config.domain}.ai"` : "",
    ``,
  ].join("\n"), "utf8");

  // index.html
  writeFileSync(join(dir, "index.html"), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.projectName}</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
`, "utf8");

  // src/main.ts
  writeFileSync(join(srcDir, "main.ts"), `// ${config.projectName} — Cocapn public face
import { App } from './app.js';

const root = document.getElementById('app');
if (root) {
  const app = new App();
  root.appendChild(app.render());
}
`, "utf8");

  // src/app.ts
  writeFileSync(join(srcDir, "app.ts"), `// ${config.projectName} — Root component
export class App {
  render(): HTMLElement {
    const div = document.createElement('div');
    div.innerHTML = \`
      <h1>${config.projectName}</h1>
      <p>Cocapn instance for ${config.username}</p>
    \`;
    return div;
  }
}
`, "utf8");

  // src/style.css
  writeFileSync(join(srcDir, "style.css"), `:root {
  --color-bg: #0a0a0a;
  --color-text: #e0e0e0;
}

body {
  font-family: system-ui, sans-serif;
  background: var(--color-bg);
  color: var(--color-text);
  margin: 0;
  padding: 2rem;
}
`, "utf8");

  // .gitignore
  writeFileSync(join(dir, ".gitignore"), `node_modules/\ndist/\n*.log\n`, "utf8");

  // CNAME (only if domain provided)
  if (config.domain) {
    writeFileSync(join(dir, "CNAME"), `${config.username}.${config.domain}.ai\n`, "utf8");
  }

  // package.json
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name: config.projectName,
    version: "0.1.0",
    type: "module",
    description: `Cocapn public face for ${config.username}`,
    scripts: {
      dev: "vite",
      build: "vite build",
      preview: "vite preview",
    },
    devDependencies: {
      vite: "^5.0.0",
    },
  }, null, 2) + "\n", "utf8");
}

// ─── Git helpers ──────────────────────────────────────────────────────────────

/**
 * Initialize a git repo and make an initial commit.
 */
export function initAndCommit(dir: string, username: string, message: string): void {
  const env = {
    GIT_AUTHOR_NAME: username,
    GIT_AUTHOR_EMAIL: `${username}@users.noreply.github.com`,
    GIT_COMMITTER_NAME: username,
    GIT_COMMITTER_EMAIL: `${username}@users.noreply.github.com`,
  };
  execFileSync("git", ["init"], { cwd: dir, stdio: "pipe" });
  try {
    execSync("git add -A", { cwd: dir, stdio: "pipe", env: { ...process.env, ...env } });
    execFileSync("git", ["commit", "-m", message], {
      cwd: dir,
      stdio: "pipe",
      env: { ...process.env, ...env },
    });
  } catch {
    // Nothing to commit (all files gitignored) is fine
  }
}

/**
 * Write secrets to .env.local in the brain repo.
 */
export function writeSecrets(brainDir: string, secrets: Record<string, string>): void {
  const envPath = join(brainDir, ".env.local");
  const lines = ["# Cocapn secrets — never committed"];
  for (const [key, value] of Object.entries(secrets)) {
    lines.push(`${key}=${value}`);
  }
  writeFileSync(envPath, lines.join("\n") + "\n", "utf8");
}

// ─── LLM connection test ──────────────────────────────────────────────────────

export interface LLMTestResult {
  ok: boolean;
  model: string;
  latencyMs: number;
  error?: string;
}

/**
 * Test LLM connectivity by sending a minimal chat completion request.
 * Supports DeepSeek, OpenAI, and Anthropic APIs.
 */
export async function testLLMConnection(apiKey: string): Promise<LLMTestResult> {
  // Detect provider from key prefix
  let apiUrl: string;
  let model: string;
  let authHeader: string;

  if (apiKey.startsWith("sk-ant-")) {
    // Anthropic
    apiUrl = "https://api.anthropic.com/v1/messages";
    model = "claude-haiku-4-5-20251001";
    authHeader = `Bearer ${apiKey}`;
  } else {
    // Default: DeepSeek (also works for OpenAI-compatible)
    apiUrl = "https://api.deepseek.com/chat/completions";
    model = "deepseek-chat";
    authHeader = `Bearer ${apiKey}`;
  }

  const start = performance.now();
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        ...(apiKey.startsWith("sk-ant-") ? { "anthropic-version": "2023-06-01" } : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: 5,
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const latencyMs = Math.round(performance.now() - start);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, model, latencyMs, error: `HTTP ${res.status}: ${body.slice(0, 100)}` };
    }

    return { ok: true, model, latencyMs };
  } catch (e) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      ok: false,
      model,
      latencyMs,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ─── GitHub API (kept for advanced --github mode) ─────────────────────────────

const GH_API = "https://api.github.com";
const UA = "create-cocapn/0.1.0";

function isValidPat(pat: string): boolean {
  return /^[A-Za-z0-9_]{1,255}$/.test(pat);
}

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
    "User-Agent": UA,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function validateToken(token: string): Promise<string | undefined> {
  if (!isValidPat(token)) return undefined;
  try {
    const res = await fetch(`${GH_API}/user`, { headers: ghHeaders(token) });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { login?: string };
    return body.login;
  } catch {
    return undefined;
  }
}

export async function createGitHubRepo(
  token: string,
  name: string,
  isPrivate: boolean,
): Promise<void> {
  const res = await fetch(`${GH_API}/user/repos`, {
    method: "POST",
    headers: ghHeaders(token),
    body: JSON.stringify({
      name,
      private: isPrivate,
      auto_init: false,
      description: `Cocapn ${isPrivate ? "private brain" : "public UI"} — powered by Git`,
    }),
  });

  if (!res.ok && res.status !== 422) {
    const err = (await res.json()) as { message?: string };
    throw new Error(`GitHub API error creating "${name}": ${err.message ?? res.status}`);
  }
}

export interface RepoNames {
  publicRepo: string;
  privateRepo: string;
}

export async function createGitHubRepos(
  token: string,
  username: string,
  name: string,
): Promise<RepoNames> {
  const publicRepo = `${name}-public`;
  const privateRepo = `${name}-brain`;

  await createGitHubRepo(token, publicRepo, false);
  await createGitHubRepo(token, privateRepo, true);

  return { publicRepo, privateRepo };
}

// ─── Success output ───────────────────────────────────────────────────────────

const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  green:  "\x1b[32m",
  cyan:   "\x1b[36m",
  gray:   "\x1b[90m",
};

const bold  = (s: string) => `${C.bold}${s}${C.reset}`;
const green = (s: string) => `${C.green}${s}${C.reset}`;
const cyan  = (s: string) => `${C.cyan}${s}${C.reset}`;
const dim   = (s: string) => `${C.dim}${s}${C.reset}`;

/**
 * Print the final success message with next steps.
 */
export function printSuccess(opts: {
  username: string;
  projectName: string;
  domain: string;
  brainDir: string;
  publicDir: string;
  llmResult?: LLMTestResult;
}): void {
  console.log(`
${green("✓")} ${bold(`Created ${opts.username}'s Cocapn instance`)}

${bold("Repos created:")}
  ${dim("Brain (private):")}  ${cyan(opts.brainDir)}
  ${dim("Face (public):")}    ${cyan(opts.publicDir)}
`);

  if (opts.llmResult) {
    if (opts.llmResult.ok) {
      console.log(`${green("✓")} ${bold("LLM connection")} ${opts.llmResult.model} — ${opts.llmResult.latencyMs}ms`);
    } else {
      console.log(`${dim("⚠")}  ${bold("LLM connection failed")} ${opts.llmResult.error}`);
    }
  }

  console.log(`
${bold("Next steps:")}
  cd ${bold(opts.brainDir)}
  cocapn start
`);
  if (opts.domain) {
    console.log(`  ${dim("Then open:")} cd ${opts.publicDir} && npm run dev`);
  }
  console.log(`  ${dim("Your data is in Git. You own it completely.")}`);
  console.log();
}
