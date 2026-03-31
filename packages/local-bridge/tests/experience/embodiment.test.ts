/**
 * Tests for Embodiment — the repo IS the body.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { simpleGit } from "simple-git";
import { Embodiment } from "../../src/experience/embodiment.js";
import { Brain } from "../../src/brain/index.js";
import { GitSync } from "../../src/git/sync.js";
import { DEFAULT_CONFIG, type BridgeConfig } from "../../src/config/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeTempRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "cocapn-embodiment-test-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test");
  await git.addConfig("user.email", "test@test.com");
  writeFileSync(join(dir, "README.md"), "# Test Agent\nA test agent body.\n");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "test-agent", version: "1.0.0", dependencies: {} }));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "index.ts"), "export const main = () => {};\n");
  mkdirSync(join(dir, "tests"), { recursive: true });
  writeFileSync(join(dir, "tests", "basic.test.ts"), "test('works', () => {});\n");
  mkdirSync(join(dir, "docs"), { recursive: true });
  mkdirSync(join(dir, "public"), { recursive: true });
  await git.add(".");
  await git.commit("initial commit");
  return dir;
}

function makeConfig(repoRoot: string): BridgeConfig {
  return {
    ...DEFAULT_CONFIG,
    soul: "cocapn/soul.md",
    memory: {
      facts: "cocapn/memory/facts.json",
      procedures: "cocapn/memory/procedures.json",
      relationships: "cocapn/memory/relationships.json",
    },
    sync: { interval: 300, memoryInterval: 60, autoCommit: false, autoPush: false },
  };
}

function makeBrain(repoRoot: string): Brain {
  const config = makeConfig(repoRoot);
  const sync = new GitSync(repoRoot, config);
  return new Brain(repoRoot, config, sync);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Embodiment.myBody", () => {
  let repoRoot: string;

  beforeEach(async () => { repoRoot = await makeTempRepo(); });
  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("maps repo structure to body parts", async () => {
    const brain = makeBrain(repoRoot);
    const e = new Embodiment(repoRoot, brain);
    const body = await e.myBody();

    expect(body.face).toBe("README.md");
    expect(body.nervousSystem).toBe(".git/");
    expect(body.dna).toBe("package.json");
    expect(body.skeleton).toBeTruthy();
    expect(body.muscles).toBeTruthy();
  });

  it("detects existing directories for skeleton and immune system", async () => {
    mkdirSync(join(repoRoot, "tests"), { recursive: true });
    writeFileSync(join(repoRoot, "tests", "basic.test.ts"), "test('works', () => {});\n");

    const brain = makeBrain(repoRoot);
    const e = new Embodiment(repoRoot, brain);
    const body = await e.myBody();

    expect(body.immuneSystem).toBe("tests/");
    expect(body.skeleton).toBe("src/");
  });
});

describe("Embodiment.healthCheck", () => {
  let repoRoot: string;

  beforeEach(async () => { repoRoot = await makeTempRepo(); });
  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("returns a health report with status and organs", async () => {
    const brain = makeBrain(repoRoot);
    const e = new Embodiment(repoRoot, brain);
    const health = await e.healthCheck();

    expect(health.status).toBeTruthy();
    expect(health.organs.length).toBeGreaterThan(0);
    expect(health.feeling).toBeTruthy();
    expect(health.timestamp).toBeTruthy();
  });

  it("reports healthy when everything is in order", async () => {
    const brain = makeBrain(repoRoot);
    const e = new Embodiment(repoRoot, brain);
    const health = await e.healthCheck();

    // With src/, README, package.json, .git/ — should be at least growing
    expect(["healthy", "growing"]).toContain(health.status);
  });

  it("reports restless with uncommitted changes", async () => {
    writeFileSync(join(repoRoot, "new-file.ts"), "export const x = 1;");

    const brain = makeBrain(repoRoot);
    const e = new Embodiment(repoRoot, brain);
    const health = await e.healthCheck();

    expect(health.status).toBe("restless");
    expect(health.feeling).toContain("uncommitted");
  });

  it("checks all major organs", async () => {
    const brain = makeBrain(repoRoot);
    const e = new Embodiment(repoRoot, brain);
    const health = await e.healthCheck();

    const organNames = health.organs.map((o) => o.name);
    expect(organNames).toContain("face");
    expect(organNames).toContain("skeleton");
    expect(organNames).toContain("nervous system");
    expect(organNames).toContain("DNA");
    expect(organNames).toContain("soul");
  });

  it("detects soul organ from brain", async () => {
    mkdirSync(join(repoRoot, "cocapn"), { recursive: true });
    writeFileSync(join(repoRoot, "cocapn", "soul.md"), "# I am a test agent with a soul.", "utf8");

    const brain = makeBrain(repoRoot);
    const e = new Embodiment(repoRoot, brain);
    const health = await e.healthCheck();

    const soul = health.organs.find((o) => o.name === "soul");
    expect(soul?.exists).toBe(true);
    expect(soul?.status).toBe("healthy");
  });

  it("reports missing soul when no soul.md", async () => {
    const brain = makeBrain(repoRoot);
    const e = new Embodiment(repoRoot, brain);
    const health = await e.healthCheck();

    const soul = health.organs.find((o) => o.name === "soul");
    expect(soul?.exists).toBe(false);
    expect(soul?.status).toBe("missing");
  });

  it("recommends adding face when README is missing", async () => {
    // Remove README
    const fs = await import("fs/promises");
    await fs.unlink(join(repoRoot, "README.md"));

    const brain = makeBrain(repoRoot);
    const e = new Embodiment(repoRoot, brain);
    const health = await e.healthCheck();

    expect(health.recommendations.some((r) => r.includes("README"))).toBe(true);
  });
});
