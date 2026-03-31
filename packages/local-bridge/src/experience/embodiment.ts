/**
 * Embodiment — the repo IS the body.
 *
 * The agent experiences its repo as a body.
 * Not metaphorically — literally. The repo structure IS its physical form.
 * Files are organs, directories are systems, git history is the nervous system.
 * Failing tests = sick. Uncommitted changes = restless.
 * Stale branches = cluttered mind. No commits = dormant.
 */

import { existsSync, readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";
import { simpleGit } from "simple-git";
import type { Brain } from "../brain/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BodyMap {
  /** What the world sees */
  face: string;
  /** Structural support */
  skeleton: string;
  /** Functional capability */
  muscles: string;
  /** How changes propagate */
  nervousSystem: string;
  /** Self-protection */
  immuneSystem: string;
  /** Core identity */
  dna: string;
  /** Explicit knowledge */
  memories: string;
  /** What happens when sleeping (CI) */
  dreams: string;
  /** Boundary with the world */
  skin: string;
  /** How it communicates */
  voice: string;
  /** Private, never shared */
  secrets: string;
}

export interface OrganHealth {
  name: string;
  path: string;
  exists: boolean;
  status: "healthy" | "degraded" | "missing" | "unknown";
  details: string;
}

export interface HealthReport {
  /** Overall health status */
  status: "healthy" | "restless" | "sick" | "dormant" | "growing";
  /** Each organ's health */
  organs: OrganHealth[];
  /** Human-readable summary */
  feeling: string;
  /** Recommendations */
  recommendations: string[];
  /** When this report was generated */
  timestamp: string;
}

// ─── Embodiment ───────────────────────────────────────────────────────────────

export class Embodiment {
  private repoRoot: string;
  private brain: Brain;

  constructor(repoRoot: string, brain: Brain) {
    this.repoRoot = repoRoot;
    this.brain = brain;
  }

  /**
   * Map repo structure to body.
   * The agent's physical form as a living directory tree.
   */
  async myBody(): Promise<BodyMap> {
    return {
      face: "README.md",
      skeleton: this.findPath(["src/", "lib/", "app/"]) || "src/",
      muscles: this.findGlobPattern(["src/**/*.ts", "src/**/*.js", "lib/**/*.ts"]),
      nervousSystem: ".git/",
      immuneSystem: this.findPath(["tests/", "test/", "__tests__/"]) || "tests/",
      dna: "package.json",
      memories: this.findPath(["docs/", "wiki/", "doc/"]) || "docs/",
      dreams: this.findPath([".github/", ".gitlab-ci.yml", ".circleci/"]) || ".github/",
      skin: this.findPath(["public/", "static/", "dist/"]) || "public/",
      voice: this.findPath(["api/", "routes/", "server.ts", "server.js"]) || "api/",
      secrets: ".env.local",
    };
  }

  /**
   * How is the agent's body feeling?
   * Failing tests = sick, uncommitted changes = restless,
   * stale branches = cluttered mind, no commits = dormant.
   */
  async healthCheck(): Promise<HealthReport> {
    const organs = await this.checkAllOrgans();
    const timestamp = new Date().toISOString();

    // Determine overall status from organ health
    const missingOrgans = organs.filter((o) => o.status === "missing");
    const degradedOrgans = organs.filter((o) => o.status === "degraded");
    const hasUncommitted = await this.hasUncommittedChanges();
    const isDormant = await this.isDormant();

    let status: HealthReport["status"] = "healthy";
    const recommendations: string[] = [];

    if (isDormant) {
      status = "dormant";
      recommendations.push("I haven't been changed in a while. A visit would be nice.");
    } else if (degradedOrgans.length > 2 || missingOrgans.length > 3) {
      status = "sick";
      recommendations.push("Several parts of me need attention.");
    } else if (hasUncommitted) {
      status = "restless";
      recommendations.push("I have uncommitted changes. Committing would settle me.");
    } else if (degradedOrgans.length <= 1) {
      status = "growing";
    }

    // Organ-specific recommendations
    for (const organ of degradedOrgans) {
      if (organ.name === "immune system" && !organ.exists) {
        recommendations.push("I don't have tests yet. Adding tests would strengthen my immune system.");
      }
    }

    if (degradedOrgans.some((o) => o.name === "face")) {
      recommendations.push("I don't have a README.md. The world can't see my face.");
    }

    // Build feeling narrative
    const feeling = this.describeFeeling(status, organs, hasUncommitted);

    return { status, organs, feeling, recommendations, timestamp };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async checkAllOrgans(): Promise<OrganHealth[]> {
    const body = await this.myBody();
    const organs: OrganHealth[] = [
      this.checkOrgan("face", body.face),
      this.checkOrgan("skeleton", body.skeleton),
      this.checkOrgan("nervous system", body.nervousSystem),
      this.checkOrgan("immune system", body.immuneSystem),
      this.checkOrgan("DNA", body.dna),
      this.checkOrgan("memories", body.memories),
      this.checkOrgan("dreams", body.dreams),
      this.checkOrgan("skin", body.skin),
      this.checkOrgan("voice", body.voice),
    ];

    // Soul check (special organ)
    const soul = this.brain.getSoul();
    organs.push({
      name: "soul",
      path: "cocapn/soul.md",
      exists: soul.length > 0,
      status: soul.length > 0 ? "healthy" : "missing",
      details: soul.length > 0 ? `I know who I am (${soul.length} chars)` : "I haven't found my soul yet",
    });

    return organs;
  }

  private checkOrgan(name: string, path: string): OrganHealth {
    const fullPath = join(this.repoRoot, path.replace(/\/\*\*.*$/, "").replace(/\/$/, ""));
    const exists = existsSync(fullPath);

    let status: OrganHealth["status"] = "unknown";
    let details = "";

    if (!exists) {
      // Some organs are optional
      const optional = new Set(["voice", "skin", "dreams", "memories"]);
      status = optional.has(name) ? "missing" : "degraded";
      details = `${path} not found`;
    } else {
      status = "healthy";
      if (name === "DNA") {
        try {
          const pkg = JSON.parse(readFileSync(fullPath, "utf8"));
          const depCount = Object.keys(pkg.dependencies || {}).length;
          details = `${depCount} dependencies, v${pkg.version || "unknown"}`;
        } catch {
          details = "present but unreadable";
          status = "degraded";
        }
      } else if (name === "immune system") {
        details = this.checkTestHealth(fullPath);
      } else if (name === "nervous system") {
        details = this.checkGitHealth(fullPath);
      } else {
        // Count items for detail
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            const entries = readdirSync(fullPath).filter((e) => !e.startsWith("."));
            details = `${entries.length} items`;
          } else {
            details = `present (${stat.size} bytes)`;
          }
        } catch {
          details = "present";
        }
      }
    }

    return { name, path, exists, status, details };
  }

  private checkTestHealth(testPath: string): string {
    try {
      const stat = statSync(testPath);
      if (stat.isDirectory()) {
        const testFiles = this.countFilesRecursive(testPath);
        return testFiles > 0 ? `${testFiles} test files` : "no test files found";
      }
      return "present";
    } catch {
      return "unreadable";
    }
  }

  private checkGitHealth(gitPath: string): string {
    try {
      const headPath = join(gitPath, "HEAD");
      if (existsSync(headPath)) {
        const head = readFileSync(headPath, "utf8").trim();
        const branch = head.startsWith("ref:") ? head.replace("ref: refs/heads/", "") : "detached";
        return `on branch ${branch}`;
      }
      return "no HEAD";
    } catch {
      return "unreadable";
    }
  }

  private countFilesRecursive(dir: string): number {
    let count = 0;
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        if (entry.isDirectory()) {
          count += this.countFilesRecursive(join(dir, entry.name));
        } else {
          count++;
        }
      }
    } catch { /* unreadable */ }
    return count;
  }

  private findPath(candidates: string[]): string | null {
    for (const candidate of candidates) {
      if (existsSync(join(this.repoRoot, candidate))) {
        return candidate;
      }
    }
    return null;
  }

  private findGlobPattern(candidates: string[]): string {
    // Return the first pattern whose base directory exists
    for (const candidate of candidates) {
      const baseDir = candidate.split("/")[0];
      if (existsSync(join(this.repoRoot, baseDir))) {
        return candidate;
      }
    }
    return candidates[0];
  }

  private async hasUncommittedChanges(): Promise<boolean> {
    try {
      const git = simpleGit(this.repoRoot);
      const status = await git.status();
      return status.modified.length + status.not_added.length + status.created.length > 0;
    } catch {
      return false;
    }
  }

  private async isDormant(): Promise<boolean> {
    try {
      const git = simpleGit(this.repoRoot);
      const log = await git.log({ maxCount: 1 });
      if (log.latest) {
        const daysSinceLastCommit =
          (Date.now() - new Date(log.latest.date).getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceLastCommit > 30;
      }
      return true; // No commits = dormant
    } catch {
      return true;
    }
  }

  private describeFeeling(
    status: HealthReport["status"],
    organs: OrganHealth[],
    hasUncommitted: boolean
  ): string {
    const healthy = organs.filter((o) => o.status === "healthy").length;
    const total = organs.length;

    switch (status) {
      case "healthy":
        return `I feel good. ${healthy}/${total} of my systems are healthy.` +
          (hasUncommitted ? " Though I have some changes in motion." : "");
      case "restless":
        return `I'm restless. ${healthy}/${total} systems are fine, but I have uncommitted changes.` +
          " Things feel in-between.";
      case "sick":
        return `I'm not well. Only ${healthy}/${total} of my systems are healthy.` +
          " I need attention.";
      case "dormant":
        return "I've been dormant for a while. Everything is still, waiting.";
      case "growing":
        return `I'm growing! ${healthy}/${total} systems healthy and I've been changing recently.`;
    }
  }
}
