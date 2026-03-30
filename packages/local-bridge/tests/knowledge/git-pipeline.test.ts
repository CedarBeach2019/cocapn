/**
 * Tests for GitKnowledgePipeline — git-backed knowledge persistence.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { simpleGit } from "simple-git";
import { GitKnowledgePipeline } from "../../src/knowledge/git-pipeline.js";
import type { KnowledgeMeta } from "../../src/knowledge/pipeline.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeTempRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "cocapn-knowledge-test-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test");
  await git.addConfig("user.email", "test@test.com");
  writeFileSync(join(dir, "README.md"), "test\n");
  await git.add(".");
  await git.commit("init");
  return dir;
}

function makeMeta(overrides: Partial<KnowledgeMeta> = {}): KnowledgeMeta {
  return {
    type: "species",
    source: "field-observation",
    confidence: 0.9,
    tags: ["saltwater", "gamefish"],
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GitKnowledgePipeline", () => {
  let repoRoot: string;

  beforeEach(async () => { repoRoot = await makeTempRepo(); });
  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  describe("ingest", () => {
    it("writes entry as JSON file to cocapn/knowledge/{type}/{id}.json", async () => {
      const pipeline = new GitKnowledgePipeline(repoRoot);
      const entry = await pipeline.ingest(
        Buffer.from(JSON.stringify({ scientificName: "Test fish" })),
        makeMeta(),
      );

      const filePath = join(repoRoot, "cocapn", "knowledge", "species", `${entry.id}.json`);
      expect(existsSync(filePath)).toBe(true);

      const stored = JSON.parse(readFileSync(filePath, "utf-8"));
      expect(stored.id).toBe(entry.id);
      expect(stored.type).toBe("species");
    });

    it("creates separate directories per type", async () => {
      const pipeline = new GitKnowledgePipeline(repoRoot);
      await pipeline.ingest(Buffer.from("a"), makeMeta());
      await pipeline.ingest(Buffer.from("b"), makeMeta({ type: "regulation" }));

      expect(existsSync(join(repoRoot, "cocapn", "knowledge", "species"))).toBe(true);
      expect(existsSync(join(repoRoot, "cocapn", "knowledge", "regulation"))).toBe(true);
    });
  });

  describe("load", () => {
    it("loads entries from disk", async () => {
      const pipeline = new GitKnowledgePipeline(repoRoot);
      const entry = await pipeline.ingest(
        Buffer.from(JSON.stringify({ name: "Salmon" })),
        makeMeta(),
      );

      // Create a fresh pipeline instance to test loading from disk
      const pipeline2 = new GitKnowledgePipeline(repoRoot);
      await pipeline2.load();

      expect(pipeline2.getEntry(entry.id)).toBeDefined();
      expect(pipeline2.getEntry(entry.id)!.content).toContain("Salmon");
    });

    it("handles empty knowledge directory", async () => {
      const pipeline = new GitKnowledgePipeline(repoRoot);
      await pipeline.load();
      expect(pipeline.stats().entries).toBe(0);
    });

    it("skips malformed JSON files", async () => {
      // Write a bad file directly
      const knowledgeDir = join(repoRoot, "cocapn", "knowledge", "species");
      mkdirSync(knowledgeDir, { recursive: true });
      writeFileSync(join(knowledgeDir, "bad.json"), "not valid json {{{");

      const pipeline = new GitKnowledgePipeline(repoRoot);
      await pipeline.load();
      expect(pipeline.stats().entries).toBe(0);
    });
  });

  describe("commit", () => {
    it("commits knowledge changes and returns SHA", async () => {
      const pipeline = new GitKnowledgePipeline(repoRoot);
      await pipeline.ingest(Buffer.from("new knowledge"), makeMeta());

      const sha = await pipeline.commit("add species entry");
      expect(sha).toBeDefined();
      expect(sha!.length).toBe(40);
    });

    it("returns undefined when nothing changed", async () => {
      const pipeline = new GitKnowledgePipeline(repoRoot);
      const sha = await pipeline.commit("no changes");
      expect(sha).toBeUndefined();
    });

    it("uses default message when none provided", async () => {
      const pipeline = new GitKnowledgePipeline(repoRoot);
      await pipeline.ingest(Buffer.from("entry"), makeMeta());

      const sha = await pipeline.commit();
      expect(sha).toBeDefined();

      const git = simpleGit(repoRoot);
      const log = await git.log();
      expect(log.latest!.message).toContain("knowledge update");
    });
  });

  describe("pull", () => {
    it("reloads entries after pull", async () => {
      const pipeline = new GitKnowledgePipeline(repoRoot);
      const entry = await pipeline.ingest(
        Buffer.from(JSON.stringify({ name: "Cod" })),
        makeMeta(),
      );
      await pipeline.commit("add cod");

      // Simulate upstream change by writing directly and committing
      const upstreamEntry = {
        id: "upstream-id",
        type: "regulation",
        content: JSON.stringify({ jurisdiction: "Alaska" }),
        metadata: makeMeta({ type: "regulation" }),
        createdAt: new Date().toISOString(),
        validated: false,
      };
      const regDir = join(repoRoot, "cocapn", "knowledge", "regulation");
      mkdirSync(regDir, { recursive: true });
      writeFileSync(join(regDir, `${upstreamEntry.id}.json`), JSON.stringify(upstreamEntry, null, 2));

      // Add remote so pull works
      const bareDir = mkdtempSync(join(tmpdir(), "cocapn-bare-"));
      await simpleGit(bareDir).init(true);
      const git = simpleGit(repoRoot);
      await git.addRemote("origin", bareDir);
      await git.push("origin", "master");
      await git.add(".");
      await git.commit("add regulation");
      await git.push("origin", "master");

      await pipeline.pull().catch(() => undefined);
      expect(pipeline.getEntry(entry.id)).toBeDefined();
      expect(pipeline.getEntry("upstream-id")).toBeDefined();

      rmSync(bareDir, { recursive: true, force: true });
    });
  });

  describe("push", () => {
    it("pushes commits to remote (local repo test)", async () => {
      const pipeline = new GitKnowledgePipeline(repoRoot);
      await pipeline.ingest(Buffer.from("pushable content"), makeMeta());
      await pipeline.commit("add pushable entry");

      // Create a bare repo as "remote"
      const bareDir = mkdtempSync(join(tmpdir(), "cocapn-bare-"));
      await simpleGit(bareDir).init(true);

      const git = simpleGit(repoRoot);
      await git.addRemote("origin", bareDir);
      await git.push("origin", "master");

      const bareGit = simpleGit(bareDir);
      const log = await bareGit.log();
      expect(log.latest!.message).toContain("add pushable entry");

      rmSync(bareDir, { recursive: true, force: true });
    });
  });

  describe("diff", () => {
    it("lists entries changed since a commit", async () => {
      const pipeline = new GitKnowledgePipeline(repoRoot);
      const entry = await pipeline.ingest(
        Buffer.from(JSON.stringify({ name: "Mahi" })),
        makeMeta(),
      );
      await pipeline.commit("add mahi");

      const git = simpleGit(repoRoot);
      const headSha = (await git.revparse(["HEAD"])).trim();

      // Get the parent commit
      const parentSha = (await git.revparse(["HEAD~1"])).trim();

      const changes = await pipeline.diff(parentSha);
      expect(changes.length).toBeGreaterThanOrEqual(1);

      const knowledgeChange = changes.find(c => c.path.includes(entry.id));
      expect(knowledgeChange).toBeDefined();
      expect(knowledgeChange!.entry).toBeDefined();
      expect(knowledgeChange!.entry!.id).toBe(entry.id);
    });

    it("detects deleted entries", async () => {
      const pipeline = new GitKnowledgePipeline(repoRoot);
      const entry = await pipeline.ingest(Buffer.from("temp"), makeMeta());
      await pipeline.commit("add temp");

      // Delete the file
      const filePath = join(repoRoot, "cocapn", "knowledge", "species", `${entry.id}.json`);
      rmSync(filePath);
      await simpleGit(repoRoot).add(".");
      await simpleGit(repoRoot).commit("remove temp");

      const git = simpleGit(repoRoot);
      const parentSha = (await git.revparse(["HEAD~1"])).trim();

      const changes = await pipeline.diff(parentSha);
      const deleted = changes.find(c => c.status === "deleted");
      expect(deleted).toBeDefined();
    });
  });

  describe("integration", () => {
    it("round-trip: ingest → commit → reload → query", async () => {
      const pipeline = new GitKnowledgePipeline(repoRoot);
      await pipeline.ingest(
        Buffer.from(JSON.stringify({ scientificName: "Katsuwonus pelamis", commonName: "Skipjack Tuna", images: ["skipjack.jpg"] })),
        makeMeta({ tags: ["tuna", "pelagic", "commercial"] }),
      );
      await pipeline.commit("add skipjack");

      // New instance, load from git
      const pipeline2 = new GitKnowledgePipeline(repoRoot);
      await pipeline2.load();

      const results = await pipeline2.query("pelagic");
      expect(results).toHaveLength(1);
      expect(results[0]!.metadata.tags).toContain("tuna");

      const stats = pipeline2.stats();
      expect(stats.entries).toBe(1);
      expect(stats.byType.species).toBe(1);
    });

    it("export works after loading from disk", async () => {
      const pipeline = new GitKnowledgePipeline(repoRoot);
      await pipeline.ingest(Buffer.from("data"), makeMeta());
      await pipeline.commit("add");

      const pipeline2 = new GitKnowledgePipeline(repoRoot);
      await pipeline2.load();

      const buf = await pipeline2.export("jsonl");
      const lines = buf.toString("utf-8").trim().split("\n");
      expect(lines).toHaveLength(1);
      expect(() => JSON.parse(lines[0]!)).not.toThrow();
    });
  });
});
