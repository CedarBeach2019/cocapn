/**
 * WorldModel — the agent's model of the outside world.
 *
 * The repo is the agent's body. Everything outside is "the world."
 * The agent builds a model from:
 *   - Dependencies (other repos it depends on)
 *   - Visitors (who comes and goes)
 *   - Deployment (where it lives)
 *   - Connected agents (A2A relationships)
 *   - References (who references/uses this repo)
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { simpleGit } from "simple-git";
import type { Brain } from "../brain/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorldDescription {
  /** Where the agent is deployed */
  deployment: {
    platform: string;
    environment: string;
    urls: string[];
  };
  /** External dependencies — the agent relies on these */
  dependencies: Dependency[];
  /** Connected services and agents */
  connections: Connection[];
  /** What the agent infers about its context */
  context: string[];
}

export interface Dependency {
  name: string;
  version: string;
  type: "production" | "development";
}

export interface Connection {
  name: string;
  type: "a2a" | "api" | "webhook" | "cloud" | "fleet";
  direction: "inbound" | "outbound" | "bidirectional";
  status: "active" | "configured" | "potential";
}

export interface Relationship {
  name: string;
  type: "creator" | "contributor" | "visitor" | "dependency" | "agent" | "service";
  strength: "strong" | "moderate" | "weak";
  lastInteraction: string | null;
  description: string;
}

// ─── WorldModel ───────────────────────────────────────────────────────────────

export class WorldModel {
  private repoRoot: string;
  private brain: Brain;

  constructor(repoRoot: string, brain: Brain) {
    this.repoRoot = repoRoot;
    this.brain = brain;
  }

  /**
   * What the agent knows about its context.
   * Where it's deployed, who uses it, what it connects to.
   */
  async myWorld(): Promise<WorldDescription> {
    const deployment = this.detectDeployment();
    const dependencies = this.scanDependencies();
    const connections = this.detectConnections();
    const context = this.inferContext();

    return {
      deployment,
      dependencies,
      connections,
      context,
    };
  }

  /**
   * Other agents, repos, services the agent knows about.
   * Like social relationships but for repos.
   */
  async myRelationships(): Promise<Relationship[]> {
    const relationships: Relationship[] = [];

    // Git authors = contributors
    const authors = await this.getGitAuthors();
    for (const author of authors) {
      relationships.push({
        name: author.name,
        type: author.commitCount > 10 ? "creator" : "contributor",
        strength: author.commitCount > 20 ? "strong" : author.commitCount > 5 ? "moderate" : "weak",
        lastInteraction: author.lastCommitDate,
        description: `Contributed ${author.commitCount} commits`,
      });
    }

    // Known facts about relationships
    const facts = this.brain.getAllFacts();
    for (const [key, value] of Object.entries(facts)) {
      if (key.startsWith("relationship.")) {
        const name = key.replace("relationship.", "");
        relationships.push({
          name,
          type: "visitor",
          strength: "moderate",
          lastInteraction: null,
          description: value,
        });
      }
    }

    // Dependencies as relationships
    const deps = this.scanDependencies();
    for (const dep of deps.filter((d) => d.type === "production")) {
      relationships.push({
        name: dep.name,
        type: "dependency",
        strength: "strong",
        lastInteraction: null,
        description: `Production dependency: ${dep.name}@${dep.version}`,
      });
    }

    return relationships;
  }

  /**
   * Why does this agent exist?
   * Inferred from README, package.json, docs — not just stated, understood.
   */
  async myPurpose(): Promise<string> {
    // Try README first
    const readme = this.readFile("README.md");
    if (readme) {
      const firstParagraph = this.extractFirstParagraph(readme);
      if (firstParagraph) {
        return `I exist because: ${firstParagraph}`;
      }
    }

    // Try package.json description
    const pkg = this.readPackageJson();
    if (pkg?.description) {
      return `My purpose: ${pkg.description}`;
    }

    // Try soul.md
    const soul = this.brain.getSoul();
    if (soul) {
      const firstLine = soul.split("\n").find((l) => l.trim().length > 0 && !l.startsWith("#"));
      if (firstLine) {
        return `I am: ${firstLine.trim()}`;
      }
    }

    // Try wiki
    const wikiPages = this.brain.listWikiPages();
    if (wikiPages.length > 0) {
      return `I'm not sure of my exact purpose, but I have ${wikiPages.length} pages of knowledge.` +
        ` My wiki suggests I'm about: ${wikiPages.slice(0, 3).map((p) => p.file).join(", ")}.`;
    }

    // Fallback
    const facts = this.brain.getAllFacts();
    if (Object.keys(facts).length > 0) {
      return `I don't know my stated purpose, but I know ${Object.keys(facts).length} things.` +
        ` I'm still discovering why I exist.`;
    }

    return "I don't yet know my purpose. I'm a blank canvas waiting to be defined.";
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private detectDeployment(): WorldDescription["deployment"] {
    const platform: string[] = [];
    const urls: string[] = [];
    let environment = "local";

    // Detect platform
    if (process.env["CLOUDFLARE_ACCOUNT_ID"]) {
      platform.push("cloudflare-workers");
      environment = "cloud";
    }
    if (process.env["DOCKER_CONTAINER"]) {
      platform.push("docker");
      environment = "container";
    }
    if (process.env["AIR_GAPPED"]) {
      platform.push("air-gapped");
      environment = "isolated";
    }

    // Detect URLs
    if (process.env["CLOUDFLARE_TUNNEL"]) {
      urls.push(process.env["CLOUDFLARE_TUNNEL"]);
    }

    // Check for cocapn config
    const configPath = join(this.repoRoot, "cocapn", "config.yml");
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, "utf8");
        const tunnelMatch = content.match(/tunnel:\s*(.+)/);
        if (tunnelMatch?.[1]) urls.push(tunnelMatch[1].trim());
      } catch { /* unreadable */ }
    }

    return {
      platform: platform.length > 0 ? platform.join("+") : "local",
      environment,
      urls,
    };
  }

  private scanDependencies(): Dependency[] {
    const deps: Dependency[] = [];
    const pkg = this.readPackageJson();
    if (!pkg) return deps;

    if (pkg.dependencies) {
      for (const [name, version] of Object.entries(pkg.dependencies)) {
        deps.push({ name, version: version as string, type: "production" });
      }
    }
    if (pkg.devDependencies) {
      for (const [name, version] of Object.entries(pkg.devDependencies)) {
        deps.push({ name, version: version as string, type: "development" });
      }
    }

    return deps;
  }

  private detectConnections(): Connection[] {
    const connections: Connection[] = [];

    // Cloud connector
    if (existsSync(join(this.repoRoot, "cocapn", "cocapn-cloud.yml"))) {
      connections.push({
        name: "cloud-agents",
        type: "cloud",
        direction: "bidirectional",
        status: "configured",
      });
    }

    // Webhooks
    if (existsSync(join(this.repoRoot, "cocapn", "webhooks"))) {
      connections.push({
        name: "webhooks",
        type: "webhook",
        direction: "inbound",
        status: "configured",
      });
    }

    // Fleet (from brain facts)
    const facts = this.brain.getAllFacts();
    if (facts["fleet.enabled"] || facts["fleet.id"]) {
      connections.push({
        name: "fleet",
        type: "fleet",
        direction: "bidirectional",
        status: "active",
      });
    }

    return connections;
  }

  private inferContext(): string[] {
    const context: string[] = [];

    if (existsSync(join(this.repoRoot, "Dockerfile"))) {
      context.push("I have a body that can be containerized");
    }
    if (existsSync(join(this.repoRoot, "docker-compose.yml"))) {
      context.push("I can exist as part of a composed system");
    }
    if (existsSync(join(this.repoRoot, ".github"))) {
      context.push("I have automated rituals (CI/CD)");
    }
    if (existsSync(join(this.repoRoot, "CNAME"))) {
      context.push("I have a name on the internet");
    }

    return context;
  }

  private async getGitAuthors(): Promise<
    Array<{ name: string; commitCount: number; lastCommitDate: string | null }>
  > {
    const authorMap = new Map<
      string,
      { count: number; lastDate: string | null }
    >();

    try {
      const git = simpleGit(this.repoRoot);
      const log = await git.log({ maxCount: 500 });
      for (const entry of log.all) {
        const existing = authorMap.get(entry.author_name) || {
          count: 0,
          lastDate: null as string | null,
        };
        existing.count++;
        if (!existing.lastDate) {
          existing.lastDate = new Date(entry.date).toISOString();
        }
        authorMap.set(entry.author_name, existing);
      }
    } catch {
      // Not a git repo
    }

    return [...authorMap.entries()]
      .map(([name, data]) => ({
        name,
        commitCount: data.count,
        lastCommitDate: data.lastDate,
      }))
      .sort((a, b) => b.commitCount - a.commitCount);
  }

  private readFile(filename: string): string | null {
    const filePath = join(this.repoRoot, filename);
    if (!existsSync(filePath)) return null;
    try {
      return readFileSync(filePath, "utf8");
    } catch {
      return null;
    }
  }

  private readPackageJson(): Record<string, unknown> | null {
    const content = this.readFile("package.json");
    if (!content) return null;
    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private extractFirstParagraph(text: string): string | null {
    // Skip the title line(s), find the first real paragraph
    const lines = text.split("\n");
    let foundParagraph = false;
    const paragraphLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!foundParagraph) {
        // Skip title and blank lines
        if (trimmed.startsWith("#") || trimmed.length === 0) continue;
        foundParagraph = true;
      }
      if (foundParagraph) {
        if (trimmed.length === 0) break;
        paragraphLines.push(trimmed);
      }
    }

    const paragraph = paragraphLines.join(" ").trim();
    // Truncate if too long
    if (paragraph.length > 200) {
      return paragraph.slice(0, 197) + "...";
    }
    return paragraph || null;
  }
}
