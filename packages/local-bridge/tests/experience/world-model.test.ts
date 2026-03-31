/**
 * Tests for WorldModel — the agent's model of the outside world.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { simpleGit } from "simple-git";
import { WorldModel } from "../../src/experience/world-model.js";
import { Brain } from "../../src/brain/index.js";
import { GitSync } from "../../src/git/sync.js";
import { DEFAULT_CONFIG, type BridgeConfig } from "../../src/config/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeTempRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "cocapn-world-test-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "TestUser");
  await git.addConfig("user.email", "test@test.com");
  writeFileSync(join(dir, "README.md"), "# Test Agent\nA test agent for world modeling.\n");
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "test-agent",
      version: "1.0.0",
      description: "A test agent",
      dependencies: { express: "^4.18.0" },
      devDependencies: { vitest: "^1.0.0" },
    })
  );
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

describe("WorldModel.myWorld", () => {
  let repoRoot: string;

  beforeEach(async () => { repoRoot = await makeTempRepo(); });
  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("returns deployment info with local platform", async () => {
    const brain = makeBrain(repoRoot);
    const w = new WorldModel(repoRoot, brain);
    const world = await w.myWorld();

    expect(world.deployment.platform).toBeTruthy();
    expect(world.deployment.environment).toBeTruthy();
  });

  it("scans dependencies from package.json", async () => {
    const brain = makeBrain(repoRoot);
    const w = new WorldModel(repoRoot, brain);
    const world = await w.myWorld();

    expect(world.dependencies.length).toBeGreaterThanOrEqual(2);
    const prodDeps = world.dependencies.filter((d) => d.type === "production");
    const devDeps = world.dependencies.filter((d) => d.type === "development");
    expect(prodDeps.some((d) => d.name === "express")).toBe(true);
    expect(devDeps.some((d) => d.name === "vitest")).toBe(true);
  });

  it("detects context signals", async () => {
    // Add a Dockerfile
    writeFileSync(join(repoRoot, "Dockerfile"), "FROM node:20\n");

    const brain = makeBrain(repoRoot);
    const w = new WorldModel(repoRoot, brain);
    const world = await w.myWorld();

    expect(world.context).toContain("I have a body that can be containerized");
  });

  it("detects cloud connections from config", async () => {
    mkdirSync(join(repoRoot, "cocapn"), { recursive: true });
    writeFileSync(
      join(repoRoot, "cocapn", "cocapn-cloud.yml"),
      "cloudflare:\n  workers:\n    - agentId: test\n      workerUrl: https://test.workers.dev\n"
    );

    const brain = makeBrain(repoRoot);
    const w = new WorldModel(repoRoot, brain);
    const world = await w.myWorld();

    expect(world.connections.some((c) => c.name === "cloud-agents")).toBe(true);
  });
});

describe("WorldModel.myRelationships", () => {
  let repoRoot: string;

  beforeEach(async () => { repoRoot = await makeTempRepo(); });
  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("lists git authors as contributors", async () => {
    const brain = makeBrain(repoRoot);
    const w = new WorldModel(repoRoot, brain);
    const rels = await w.myRelationships();

    const gitAuthors = rels.filter((r) => r.type === "creator" || r.type === "contributor");
    expect(gitAuthors.length).toBeGreaterThanOrEqual(1);
    const user = gitAuthors[0];
    expect(user?.type).toBe("contributor");
  });

  it("includes production dependencies as relationships", async () => {
    const brain = makeBrain(repoRoot);
    const w = new WorldModel(repoRoot, brain);
    const rels = await w.myRelationships();

    expect(rels.some((r) => r.name === "express" && r.type === "dependency")).toBe(true);
  });
});

describe("WorldModel.myPurpose", () => {
  let repoRoot: string;

  beforeEach(async () => { repoRoot = await makeTempRepo(); });
  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("infers purpose from package.json description", async () => {
    const brain = makeBrain(repoRoot);
    const w = new WorldModel(repoRoot, brain);
    const purpose = await w.myPurpose();

    expect(purpose).toContain("A test agent");
  });

  it("falls back to README when no package.json description", async () => {
    writeFileSync(join(repoRoot, "package.json"), JSON.stringify({ name: "bare" }));

    const brain = makeBrain(repoRoot);
    const w = new WorldModel(repoRoot, brain);
    const purpose = await w.myPurpose();

    expect(purpose).toContain("test agent for world modeling");
  });

  it("falls back to soul.md", async () => {
    writeFileSync(join(repoRoot, "package.json"), JSON.stringify({}));
    writeFileSync(join(repoRoot, "README.md"), "");

    mkdirSync(join(repoRoot, "cocapn"), { recursive: true });
    writeFileSync(join(repoRoot, "cocapn", "soul.md"), "# I am a guardian of knowledge.", "utf8");

    // Commit soul.md so git tracks it author
    const git = simpleGit(repoRoot);
    await git.add(".");
    await git.commit("add soul");

    const brain = makeBrain(repoRoot);
    const w = new WorldModel(repoRoot, brain);
    const purpose = await w.myPurpose();

    expect(purpose).toContain("guardian");
  });

  it("returns honest when no purpose signals exist", async () => {
    const noInfoDir = mkdtempSync(join(tmpdir(), "cocapn-purpose-empty-"));
    const git = simpleGit(noInfoDir);
    await git.init();
    await git.addConfig("user.name", "Test");
    await git.addConfig("user.email", "t@t.com");
    writeFileSync(join(noInfoDir, "empty.txt"), "nothing");
    await git.add(".");
    await git.commit("init");

    try {
      const brain = makeBrain(noInfoDir);
      const w = new WorldModel(noInfoDir, brain);
      const purpose = await w.myPurpose();

      expect(purpose).toBeTruthy();
    } finally {
      rmSync(noInfoDir, { recursive: true, force: true });
    }
  });
});
