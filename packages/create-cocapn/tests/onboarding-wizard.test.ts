/**
 * Tests for onboarding-wizard.ts
 */

import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { existsSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  DEPLOYMENT_OPTIONS,
  checkPrerequisites,
  createRepos,
  createGitHubActionsWorkflow,
  createCloudflareConfig,
  createDockerfile,
  generateQrCodeData,
  type OnboardingConfig,
} from "../src/onboarding-wizard.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tmpDir(suffix: string): string {
  return join(tmpdir(), `cocapn-onboard-test-${suffix}-${Date.now()}`);
}

const BASE_CONFIG: OnboardingConfig = {
  agentName: "test-agent",
  agentEmoji: "🤖",
  agentDescription: "Test agent",
  username: "testuser",
  template: "bare",
  domain: "",
  deployment: "local",
  baseDir: "",
};

// ─── DEPLOYMENT_OPTIONS ───────────────────────────────────────────────────────

describe("DEPLOYMENT_OPTIONS", () => {
  it("has 5 deployment options", () => {
    expect(DEPLOYMENT_OPTIONS.length).toBe(5);
  });

  it("includes all expected deployment targets", () => {
    const ids = DEPLOYMENT_OPTIONS.map(d => d.id);
    expect(ids).toContain("local");
    expect(ids).toContain("cloudflare");
    expect(ids).toContain("github-actions");
    expect(ids).toContain("docker");
    expect(ids).toContain("vps");
  });

  it("each option has label and description", () => {
    for (const opt of DEPLOYMENT_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0);
      expect(opt.description.length).toBeGreaterThan(0);
    }
  });
});

// ─── checkPrerequisites ──────────────────────────────────────────────────────

describe("checkPrerequisites", () => {
  it("returns nodeOk, nodeVersion, gitOk, gitVersion", () => {
    const result = checkPrerequisites();
    expect(typeof result.nodeOk).toBe("boolean");
    expect(typeof result.nodeVersion).toBe("string");
    expect(typeof result.gitOk).toBe("boolean");
    expect(typeof result.gitVersion).toBe("string");
  });

  it("node version should be v-prefixed string", () => {
    const result = checkPrerequisites();
    if (result.nodeVersion) {
      expect(result.nodeVersion.startsWith("v")).toBe(true);
    }
  });
});

// ─── createRepos ──────────────────────────────────────────────────────────────

describe("createRepos", () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = tmpDir("repos");
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("creates brain and public repos", () => {
    const config = { ...BASE_CONFIG, baseDir };
    const result = createRepos(config);

    expect(existsSync(result.brainDir)).toBe(true);
    expect(existsSync(result.publicDir)).toBe(true);
    expect(result.brainDir).toContain("test-agent-brain");
    expect(result.publicDir).toContain("test-agent");
  });

  it("brain repo has soul.md and config.yml", () => {
    const config = { ...BASE_CONFIG, baseDir };
    const result = createRepos(config);

    expect(existsSync(join(result.brainDir, "cocapn", "soul.md"))).toBe(true);
    expect(existsSync(join(result.brainDir, "cocapn", "config.yml"))).toBe(true);
  });

  it("brain repo has memory stores", () => {
    const config = { ...BASE_CONFIG, baseDir };
    const result = createRepos(config);

    expect(existsSync(join(result.brainDir, "cocapn", "memory", "facts.json"))).toBe(true);
    expect(existsSync(join(result.brainDir, "cocapn", "memory", "memories.json"))).toBe(true);
  });

  it("public repo has cocapn.yml and index.html", () => {
    const config = { ...BASE_CONFIG, baseDir };
    const result = createRepos(config);

    expect(existsSync(join(result.publicDir, "cocapn.yml"))).toBe(true);
    expect(existsSync(join(result.publicDir, "index.html"))).toBe(true);
  });

  it("repos are git-initialized", () => {
    const config = { ...BASE_CONFIG, baseDir };
    const result = createRepos(config);

    expect(existsSync(join(result.brainDir, ".git"))).toBe(true);
    expect(existsSync(join(result.publicDir, ".git"))).toBe(true);
  });

  it("throws if brain dir already exists", () => {
    const config = { ...BASE_CONFIG, baseDir };
    createRepos(config);

    expect(() => createRepos(config)).toThrow("already exists");
  });

  it("soul.md contains username from config", () => {
    const config = { ...BASE_CONFIG, baseDir, username: "alice" };
    const result = createRepos(config);

    const soul = readFileSync(join(result.brainDir, "cocapn", "soul.md"), "utf8");
    expect(soul.includes("alice")).toBe(true);
  });
});

// ─── createGitHubActionsWorkflow ──────────────────────────────────────────────

describe("createGitHubActionsWorkflow", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir("ghactions");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates workflow file in .github/workflows", () => {
    createGitHubActionsWorkflow(dir, "my-agent");

    expect(existsSync(join(dir, ".github", "workflows", "cocapn.yml"))).toBe(true);
  });

  it("workflow contains agent name", () => {
    createGitHubActionsWorkflow(dir, "testbot");

    const content = readFileSync(join(dir, ".github", "workflows", "cocapn.yml"), "utf8");
    expect(content.includes("testbot")).toBe(true);
  });
});

// ─── createCloudflareConfig ───────────────────────────────────────────────────

describe("createCloudflareConfig", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir("cfconfig");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates wrangler.toml", () => {
    createCloudflareConfig(dir, "my-agent");

    expect(existsSync(join(dir, "wrangler.toml"))).toBe(true);
  });

  it("wrangler.toml contains agent name", () => {
    createCloudflareConfig(dir, "cloudbot");

    const content = readFileSync(join(dir, "wrangler.toml"), "utf8");
    expect(content.includes("cloudbot")).toBe(true);
  });
});

// ─── createDockerfile ─────────────────────────────────────────────────────────

describe("createDockerfile", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpDir("docker");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates Dockerfile and docker-compose.yml", () => {
    createDockerfile(dir, "my-agent");

    expect(existsSync(join(dir, "Dockerfile"))).toBe(true);
    expect(existsSync(join(dir, "docker-compose.yml"))).toBe(true);
  });

  it("Dockerfile exposes port 3100", () => {
    createDockerfile(dir, "my-agent");

    const content = readFileSync(join(dir, "Dockerfile"), "utf8");
    expect(content.includes("3100")).toBe(true);
  });

  it("docker-compose.yml contains agent name", () => {
    createDockerfile(dir, "dockbot");

    const content = readFileSync(join(dir, "docker-compose.yml"), "utf8");
    expect(content.includes("dockbot")).toBe(true);
  });
});

// ─── generateQrCodeData ───────────────────────────────────────────────────────

describe("generateQrCodeData", () => {
  it("returns the URL passed in", () => {
    const url = "http://localhost:3100";
    expect(generateQrCodeData(url)).toBe(url);
  });

  it("handles complex URLs", () => {
    const url = "http://192.168.1.100:3100/onboard?token=abc123";
    expect(generateQrCodeData(url)).toBe(url);
  });
});
