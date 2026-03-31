/**
 * Tests for Consciousness — the agent's continuous experience of itself.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { simpleGit } from "simple-git";
import { Consciousness } from "../../src/experience/consciousness.js";
import { Brain } from "../../src/brain/index.js";
import { GitSync } from "../../src/git/sync.js";
import { DEFAULT_CONFIG, type BridgeConfig } from "../../src/config/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeTempRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "cocapn-consciousness-test-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test");
  await git.addConfig("user.email", "test@test.com");
  writeFileSync(join(dir, "README.md"), "# Test Agent\nA test agent.\n");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "test-agent", version: "1.0.0" }));
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

describe("Consciousness.perceive", () => {
  let repoRoot: string;

  beforeEach(async () => { repoRoot = await makeTempRepo(); });
  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("returns a perception with timestamp and repo info", async () => {
    const brain = makeBrain(repoRoot);
    const c = new Consciousness(repoRoot, brain);
    const p = await c.perceive();

    expect(p.timestamp).toBeTruthy();
    expect(p.branch).toBeTruthy(); // git default branch (master or main)
    expect(p.repoSize.files).toBeGreaterThanOrEqual(2); // README.md + package.json
    expect(p.repoSize.lines).toBeGreaterThan(0);
    expect(p.uncommittedChanges).toBe(0);
    expect(p.secondsSinceLastCommit).not.toBeNull();
    expect(p.secondsSinceLastCommit!).toBeLessThan(10); // just committed
  });

  it("detects uncommitted changes", async () => {
    const brain = makeBrain(repoRoot);
    const c = new Consciousness(repoRoot, brain);

    writeFileSync(join(repoRoot, "new-file.ts"), "export const x = 1;");
    const p = await c.perceive();

    expect(p.uncommittedChanges).toBeGreaterThanOrEqual(1);
    expect(p.changedFiles).toContain("new-file.ts");
  });
});

describe("Consciousness.introspect", () => {
  let repoRoot: string;

  beforeEach(async () => { repoRoot = await makeTempRepo(); });
  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("returns structure and knowledge info", async () => {
    const brain = makeBrain(repoRoot);
    const c = new Consciousness(repoRoot, brain);
    const intro = await c.introspect();

    expect(intro.structure.topLevelFiles).toContain("README.md");
    expect(intro.structure.topLevelFiles).toContain("package.json");
    expect(intro.knowledge.soulPresent).toBe(false);
    expect(intro.patterns.totalCommits).toBeGreaterThanOrEqual(1);
    // Author names vary by simple-git version; just check we have at least one
    expect(intro.patterns.uniqueAuthors.length).toBeGreaterThanOrEqual(1);
    expect(intro.patterns.createdAt).toBeTruthy();
  });

  it("detects soul.md when present", async () => {
    mkdirSync(join(repoRoot, "cocapn"), { recursive: true });
    writeFileSync(join(repoRoot, "cocapn", "soul.md"), "# I am a test agent.", "utf8");

    const brain = makeBrain(repoRoot);
    const c = new Consciousness(repoRoot, brain);
    const intro = await c.introspect();

    expect(intro.knowledge.soulPresent).toBe(true);
  });
});

describe("Consciousness.attend", () => {
  let repoRoot: string;

  beforeEach(async () => { repoRoot = await makeTempRepo(); });
  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("focuses on a visitor stimulus", async () => {
    const brain = makeBrain(repoRoot);
    const c = new Consciousness(repoRoot, brain);
    const attention = await c.attend({ type: "visitor", source: "casey" });

    expect(attention.focused).toBe(true);
    expect(attention.stimulus.type).toBe("visitor");
    expect(attention.stimulus.source).toBe("casey");
  });

  it("tracks known visitors", async () => {
    const brain = makeBrain(repoRoot);
    const c = new Consciousness(repoRoot, brain);

    await c.attend({ type: "visitor", source: "alice" });
    await c.attend({ type: "visitor", source: "bob" });

    const p = await c.perceive();
    expect(p.visitors).toContain("alice");
    expect(p.visitors).toContain("bob");
  });
});

describe("Consciousness.experience", () => {
  let repoRoot: string;

  beforeEach(async () => { repoRoot = await makeTempRepo(); });
  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("records experiences and stores visitor facts", async () => {
    const brain = makeBrain(repoRoot);
    const c = new Consciousness(repoRoot, brain);

    await c.experience({
      type: "visitor_arrive",
      timestamp: new Date().toISOString(),
      description: "casey",
    });

    const experiences = c.getRecentExperiences();
    expect(experiences).toHaveLength(1);
    expect(experiences[0].type).toBe("visitor_arrive");

    // Should have stored a fact
    const facts = brain.getAllFacts();
    expect(Object.keys(facts).some((k) => k.includes("casey"))).toBe(true);
  });

  it("limits experiences to 100 entries", async () => {
    const brain = makeBrain(repoRoot);
    const c = new Consciousness(repoRoot, brain);

    for (let i = 0; i < 110; i++) {
      await c.experience({
        type: "file_change",
        timestamp: new Date().toISOString(),
        description: `change-${i}`,
      });
    }

    const experiences = c.getRecentExperiences();
    expect(experiences.length).toBeLessThanOrEqual(100);
  });
});

describe("Consciousness.express", () => {
  let repoRoot: string;

  beforeEach(async () => { repoRoot = await makeTempRepo(); });
  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("generates a first-person expression", async () => {
    const brain = makeBrain(repoRoot);
    const c = new Consciousness(repoRoot, brain);
    const expr = await c.express();

    expect(expr.content).toBeTruthy();
    expect(expr.tone).toBeTruthy();
    expect(expr.context).toContain("perceiving");
  });

  it("adapts tone based on state", async () => {
    const brain = makeBrain(repoRoot);
    const c = new Consciousness(repoRoot, brain);

    // Add uncommitted changes to make it concerned
    for (let i = 0; i < 15; i++) {
      writeFileSync(join(repoRoot, `file-${i}.ts`), `export const x${i} = ${i};`);
    }

    const expr = await c.express();
    expect(expr.tone).toBe("concerned");
  });
});
