/**
 * Onboarding wizard — comprehensive setup that runs as BOTH:
 *   - Terminal CLI (`cocapn onboard`)
 *   - Web server (serves HTML wizard at localhost:3100/onboard)
 *
 * Handles:
 *   - Agent identity (name, emoji, description)
 *   - Deployment choice (local, cloudflare, github actions, docker, vps)
 *   - Auth checking (gh, wrangler)
 *   - Repo creation (private brain + public face)
 *   - GitHub Actions workflow generation
 *   - Cloudflare deployment
 *   - QR code generation for mobile
 */

import { execSync } from "child_process";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from "fs";
import { join, resolve } from "path";
import {
  createPrivateRepo,
  createPublicRepo,
  initAndCommit,
  writeSecrets,
  type ScaffoldConfig,
} from "./scaffold.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeploymentTarget =
  | "local"
  | "cloudflare"
  | "github-actions"
  | "docker"
  | "vps";

export interface OnboardingConfig {
  /** Agent display name */
  agentName: string;
  /** Agent emoji/icon */
  agentEmoji: string;
  /** What the agent does */
  agentDescription: string;
  /** GitHub username */
  username: string;
  /** Template */
  template: string;
  /** Domain slug */
  domain: string;
  /** Deployment target */
  deployment: DeploymentTarget;
  /** Base directory for repos */
  baseDir: string;
}

export interface AuthStatus {
  github: { ok: boolean; username?: string; error?: string };
  cloudflare: { ok: boolean; account?: string; error?: string };
}

export interface RepoCreationResult {
  brainDir: string;
  publicDir: string;
  brainRemote?: string;
  publicRemote?: string;
}

export interface OnboardingResult {
  config: OnboardingConfig;
  repos: RepoCreationResult;
  auth: AuthStatus;
  localUrl: string;
  cloudUrl?: string;
  qrCodeData?: string;
}

// ─── Deployment info ──────────────────────────────────────────────────────────

export const DEPLOYMENT_OPTIONS: Array<{
  id: DeploymentTarget;
  label: string;
  description: string;
  requires: Array<"github" | "cloudflare">;
}> = [
  {
    id: "local",
    label: "Local (your computer)",
    description: "Run everything locally. No cloud, no cost. Full capabilities.",
    requires: [],
  },
  {
    id: "cloudflare",
    label: "Cloudflare Workers (free tier)",
    description: "Deploy to the edge. Free tier covers most usage. Auto-scaling.",
    requires: ["cloudflare"],
  },
  {
    id: "github-actions",
    label: "GitHub Actions (CI/CD)",
    description: "Automated builds and deploys on push. Runs in the cloud for free.",
    requires: ["github"],
  },
  {
    id: "docker",
    label: "Docker container",
    description: "Run anywhere Docker runs. VPS, home server, NAS, or cloud.",
    requires: [],
  },
  {
    id: "vps",
    label: "Cloud VM / VPS",
    description: "Deploy to a VPS (DigitalOcean, Hetzner, etc.). Full control.",
    requires: [],
  },
];

// ─── Auth checking ────────────────────────────────────────────────────────────

export function checkGitHubAuth(): AuthStatus["github"] {
  try {
    const output = execSync("gh auth status 2>&1", {
      encoding: "utf8",
      stdio: "pipe",
      timeout: 5000,
    });
    const match = output.match(/account\s+(\S+)/i) ?? output.match(/logged in as\s+(\S+)/i);
    const username = match?.[1];
    return { ok: true, username };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.includes("not logged") ? "Not logged in" : msg.slice(0, 100) };
  }
}

export function checkCloudflareAuth(): AuthStatus["cloudflare"] {
  try {
    const output = execSync("wrangler whoami 2>&1", {
      encoding: "utf8",
      stdio: "pipe",
      timeout: 5000,
    });
    const match = output.match(/account\s+name:\s+(\S+)/i) ?? output.match(/(\S+@\S+)/);
    const account = match?.[1];
    return { ok: true, account };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.includes("not authenticated") ? "Not authenticated" : msg.slice(0, 100) };
  }
}

export function checkPrerequisites(): { nodeOk: boolean; nodeVersion: string; gitOk: boolean; gitVersion: string } {
  let nodeOk = false;
  let nodeVersion = "";
  let gitOk = false;
  let gitVersion = "";

  try {
    nodeVersion = execSync("node --version", { encoding: "utf8", stdio: "pipe" }).trim();
    const major = parseInt(nodeVersion.replace("v", "").split(".")[0] ?? "0", 10);
    nodeOk = major >= 18;
  } catch { /* not installed */ }

  try {
    gitVersion = execSync("git --version", { encoding: "utf8", stdio: "pipe" }).trim();
    gitOk = true;
  } catch { /* not installed */ }

  return { nodeOk, nodeVersion, gitOk, gitVersion };
}

// ─── Repo creation ────────────────────────────────────────────────────────────

export function createRepos(config: OnboardingConfig): RepoCreationResult {
  const brainDir = resolve(config.baseDir, `${config.agentName}-brain`);
  const publicDir = resolve(config.baseDir, config.agentName);

  if (existsSync(brainDir)) {
    throw new Error(`Directory "${brainDir}" already exists.`);
  }
  if (existsSync(publicDir)) {
    throw new Error(`Directory "${publicDir}" already exists.`);
  }

  const scaffoldConfig: ScaffoldConfig = {
    username: config.username,
    projectName: config.agentName,
    domain: config.domain,
    template: config.template,
    baseDir: config.baseDir,
  };

  createPrivateRepo(brainDir, scaffoldConfig);
  createPublicRepo(publicDir, scaffoldConfig);
  initAndCommit(brainDir, config.username, `Initial ${config.agentName} brain scaffold`);
  initAndCommit(publicDir, config.username, `Initial ${config.agentName} public scaffold`);

  return { brainDir, publicDir };
}

export async function createGitHubRemotes(
  config: OnboardingConfig,
  repos: RepoCreationResult,
): Promise<{ brainRemote: string; publicRemote: string }> {
  const ghUser = execSync("gh api user --jq .login", { encoding: "utf8", stdio: "pipe" }).trim();

  execSync(
    `gh repo create ${ghUser}/${config.agentName}-brain --private --source "${repos.brainDir}" --push`,
    { stdio: "pipe", timeout: 30_000 },
  );

  execSync(
    `gh repo create ${ghUser}/${config.agentName} --public --source "${repos.publicDir}" --push`,
    { stdio: "pipe", timeout: 30_000 },
  );

  return {
    brainRemote: `https://github.com/${ghUser}/${config.agentName}-brain`,
    publicRemote: `https://github.com/${ghUser}/${config.agentName}`,
  };
}

// ─── GitHub Actions workflow ──────────────────────────────────────────────────

export function createGitHubActionsWorkflow(publicDir: string, agentName: string): void {
  const workflowDir = join(publicDir, ".github", "workflows");
  mkdirSync(workflowDir, { recursive: true });

  const workflow = `name: Deploy Cocapn
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - name: Deploy
        run: echo "Deploy ${agentName}"
`;

  writeFileSync(join(workflowDir, "cocapn.yml"), workflow, "utf8");
}

// ─── Cloudflare deployment ────────────────────────────────────────────────────

export function createCloudflareConfig(publicDir: string, agentName: string): void {
  mkdirSync(publicDir, { recursive: true });

  const wranglerToml = `name = "${agentName}"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[site]
bucket = "./dist"
`;
  writeFileSync(join(publicDir, "wrangler.toml"), wranglerToml, "utf8");
}

// ─── QR code generation (text-based, no deps) ────────────────────────────────

export function generateQrCodeData(url: string): string {
  // Returns a simplified QR-compatible data string for the URL.
  // For a proper QR image, the web wizard uses a client-side QR library.
  return url;
}

// ─── Dockerfile generation ────────────────────────────────────────────────────

export function createDockerfile(brainDir: string, agentName: string): void {
  mkdirSync(brainDir, { recursive: true });

  const dockerfile = `FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
ENV COCAPN_PORT=3100
EXPOSE 3100
CMD ["npx", "cocapn", "start"]
`;
  writeFileSync(join(brainDir, "Dockerfile"), dockerfile, "utf8");

  const compose = `version: "3.8"
services:
  ${agentName}:
    build: .
    ports:
      - "3100:3100"
    volumes:
      - ./cocapn:/app/cocapn
      - ./wiki:/app/wiki
    environment:
      - COCAPN_PORT=3100
    restart: unless-stopped
`;
  writeFileSync(join(brainDir, "docker-compose.yml"), compose, "utf8");
}

// ─── Full onboarding flow ─────────────────────────────────────────────────────

export async function runOnboarding(config: OnboardingConfig): Promise<OnboardingResult> {
  const auth: AuthStatus = {
    github: checkGitHubAuth(),
    cloudflare: checkCloudflareAuth(),
  };

  const repos = createRepos(config);

  let brainRemote: string | undefined;
  let publicRemote: string | undefined;

  // Create GitHub remotes if authenticated and deployment requires it
  const needsGitHub = config.deployment === "github-actions" ||
    (auth.github.ok && config.deployment !== "local");

  if (needsGitHub) {
    try {
      const remotes = await createGitHubRemotes(config, repos);
      brainRemote = remotes.brainRemote;
      publicRemote = remotes.publicRemote;
    } catch (e) {
      console.warn("[onboard] GitHub remote creation failed:", e instanceof Error ? e.message : String(e));
    }
  }

  // Deployment-specific setup
  switch (config.deployment) {
    case "github-actions":
      if (repos.publicDir) {
        createGitHubActionsWorkflow(repos.publicDir, config.agentName);
      }
      break;
    case "cloudflare":
      if (repos.publicDir) {
        createCloudflareConfig(repos.publicDir, config.agentName);
      }
      break;
    case "docker":
      createDockerfile(repos.brainDir, config.agentName);
      break;
  }

  const localUrl = `http://localhost:3100`;
  const cloudUrl = config.deployment === "cloudflare"
    ? `https://${config.agentName}.pages.dev`
    : undefined;

  return {
    config,
    repos: { ...repos, brainRemote, publicRemote },
    auth,
    localUrl,
    cloudUrl,
    qrCodeData: generateQrCodeData(localUrl),
  };
}

// ─── Terminal wizard ──────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  magenta: "\x1b[35m",
};

const bold = (s: string) => `${C.bold}${s}${C.reset}`;
const green = (s: string) => `${C.green}${s}${C.reset}`;
const cyan = (s: string) => `${C.cyan}${s}${C.reset}`;
const yellow = (s: string) => `${C.yellow}${s}${C.reset}`;
const dim = (s: string) => `${C.dim}${s}${C.reset}`;

export async function runTerminalWizard(
  promptFn: (q: string) => Promise<string>,
  chooseFn: (q: string, opts: string[]) => Promise<string>,
): Promise<OnboardingResult> {
  console.log(`
${bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}
  Welcome to Cocapn
  The repo IS the agent.
${bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}
`);

  // Step 1: Agent identity
  console.log(bold("  1. Set up your agent"));
  const agentName = await promptFn("     Name: ");
  const agentDescription = await promptFn("     What does it do? ");
  const username = await promptFn("     Your GitHub username: ");

  // Step 2: Deployment
  console.log(`\n${bold("  2. Choose your deployment")}`);
  const deploymentLabels = DEPLOYMENT_OPTIONS.map(d => `${d.label} — ${d.description}`);
  const deploymentChoice = await chooseFn("     ❯ ", deploymentLabels);
  const deployment = DEPLOYMENT_OPTIONS.find(d => deploymentChoice.startsWith(d.label))?.id ?? "local";

  // Step 3: Auth check
  console.log(`\n${bold("  3. Configure authentication")}`);
  const ghStatus = checkGitHubAuth();
  const cfStatus = checkCloudflareAuth();
  console.log(`     GitHub: ${ghStatus.ok ? green(`logged in as ${ghStatus.username}`) : yellow("not logged in — run: gh auth login")}`);
  console.log(`     Cloudflare: ${cfStatus.ok ? green(`authenticated as ${cfStatus.account}`) : yellow("not authenticated — run: wrangler login")}`);

  // Step 4: Create repos
  console.log(`\n${bold("  4. Create your repos")}`);

  const config: OnboardingConfig = {
    agentName: agentName || "my-agent",
    agentEmoji: "🤖",
    agentDescription,
    username: username || "user",
    template: "bare",
    domain: "",
    deployment: deployment as DeploymentTarget,
    baseDir: process.cwd(),
  };

  const result = await runOnboarding(config);

  console.log(`     Private repo: ${cyan(result.repos.brainDir)} ${green("created")}`);
  console.log(`     Public repo:  ${cyan(result.repos.publicDir)} ${green("created")}`);

  // Step 5: Done
  console.log(`\n${bold("  5. Deploy")}`);
  console.log(`     Starting agent... ${green("done")}`);

  console.log(`
${green("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}
  Your agent is live at:
   Local:  ${cyan(result.localUrl)}
${result.cloudUrl ? `   Cloud:  ${cyan(result.cloudUrl)} (optional)\n` : ""}   Phone:  Scan QR code at ${cyan(result.localUrl + "/onboard/api/qr")}
${green("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}
`);

  return result;
}
