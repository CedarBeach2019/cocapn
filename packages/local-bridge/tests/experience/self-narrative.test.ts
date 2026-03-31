/**
 * Tests for SelfNarrative — the agent tells its own story.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { simpleGit } from "simple-git";
import { SelfNarrative } from "../../src/experience/self-narrative.js";
import { Brain } from "../../src/brain/index.js";
import { GitSync } from "../../src/git/sync.js";
import { DEFAULT_CONFIG, type BridgeConfig } from "../../src/config/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeTempRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "cocapn-narrative-test-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Creator");
  await git.addConfig("user.email", "creator@test.com");
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

describe("SelfNarrative.myStory", () => {
  let repoRoot: string;

  beforeEach(async () => { repoRoot = await makeTempRepo(); });
  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("tells the agent's origin story from git history", async () => {
    const brain = makeBrain(repoRoot);
    const n = new SelfNarrative(repoRoot, brain);
    const story = await n.myStory();

    expect(story).toContain("born");
    expect(story).toContain("Creator");
    expect(story).toContain("initial commit");
  });

  it("includes growth metrics", async () => {
    // Add more files to show growth
    mkdirSync(join(repoRoot, "src"), { recursive: true });
    writeFileSync(join(repoRoot, "src", "index.ts"), "export const hello = 'world';\n");

    const brain = makeBrain(repoRoot);
    const n = new SelfNarrative(repoRoot, brain);
    const story = await n.myStory();

    expect(story).toContain("files");
    expect(story).toContain("lines");
    expect(story).toContain("moments of change");
  });

  it("handles repo with no git history gracefully", async () => {
    // Create a repo without git
    const noGitDir = mkdtempSync(join(tmpdir(), "cocapn-narrative-nogit-"));
    writeFileSync(join(noGitDir, "README.md"), "test");
    try {
      const brain = makeBrain(noGitDir);
      const n = new SelfNarrative(noGitDir, brain);
      const story = await n.myStory();

      expect(story).toBeTruthy();
      // Should not crash
    } finally {
      rmSync(noGitDir, { recursive: true, force: true });
    }
  });
});

describe("SelfNarrative.myCurrentState", () => {
  let repoRoot: string;

  beforeEach(async () => { repoRoot = await makeTempRepo(); });
  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("reports clean working tree", async () => {
    const brain = makeBrain(repoRoot);
    const n = new SelfNarrative(repoRoot, brain);
    const state = await n.myCurrentState();

    expect(state).toContain("clean");
    expect(state).toContain("committed");
  });

  it("reports restlessness with uncommitted changes", async () => {
    writeFileSync(join(repoRoot, "new-file.ts"), "export const x = 1;");

    const brain = makeBrain(repoRoot);
    const n = new SelfNarrative(repoRoot, brain);
    const state = await n.myCurrentState();

    expect(state).toContain("uncommitted");
  });

  it("detects soul presence", async () => {
    mkdirSync(join(repoRoot, "cocapn"), { recursive: true });
    writeFileSync(join(repoRoot, "cocapn", "soul.md"), "# I am a test agent.", "utf8");

    const brain = makeBrain(repoRoot);
    const n = new SelfNarrative(repoRoot, brain);
    const state = await n.myCurrentState();

    expect(state).toContain("know who I am");
  });
});

describe("SelfNarrative.myRelationshipWith", () => {
  let repoRoot: string;

  beforeEach(async () => { repoRoot = await makeTempRepo(); });
  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("describes a known contributor", async () => {
    const brain = makeBrain(repoRoot);
    const n = new SelfNarrative(repoRoot, brain);
    const rel = await n.myRelationshipWith("Creator");

    expect(rel).toContain("Creator");
    expect(rel).toContain("contribution");
  });

  it("handles unknown visitors", async () => {
    const brain = makeBrain(repoRoot);
    const n = new SelfNarrative(repoRoot, brain);
    const rel = await n.myRelationshipWith("unknown-person");

    expect(rel).toContain("don't have any recorded interactions");
  });
});
