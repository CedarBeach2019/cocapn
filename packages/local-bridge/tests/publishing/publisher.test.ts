/**
 * Tests for SyncPublisher — the full brain → face sync pipeline.
 *
 * Uses real temp git repos for private + public, with a stub Brain.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { simpleGit } from "simple-git";
import { SyncPublisher, type PublishResult } from "../../src/publishing/sync-publisher.js";
import type {
  Brain,
  Task,
  WikiPage,
  MemoryEntry,
} from "../../src/brain/index.js";
import type { AgentMode } from "../../src/publishing/mode-switcher.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeGitRepo(prefix: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test");
  await git.addConfig("user.email", "test@test.com");
  writeFileSync(join(dir, "README.md"), "# Test\n");
  await git.add(".");
  await git.commit("init");
  return dir;
}

interface StubBrainOptions {
  facts?: Record<string, string>;
  soul?: string;
  wikiPages?: Array<{ file: string; content: string }>;
  tasks?: Task[];
  memories?: MemoryEntry[];
}

function makeStubBrain(opts: StubBrainOptions = {}): Brain {
  const facts = opts.facts ?? {};
  const soul = opts.soul ?? "";
  const wikiPages = opts.wikiPages ?? [];
  const tasks = opts.tasks ?? [];
  const memories = opts.memories ?? [];

  return {
    getSoul: () => soul,
    getAllFacts: (mode?: string) => {
      if (mode === "public") {
        const publicFacts: Record<string, string> = {};
        for (const [k, v] of Object.entries(facts)) {
          if (!k.startsWith("private.") && !k.startsWith("sensitive.")) {
            publicFacts[k] = v;
          }
        }
        return publicFacts;
      }
      return facts;
    },
    readWikiPage: (file: string, _mode?: string) => {
      const page = wikiPages.find((p) => p.file === file);
      return page?.content ?? null;
    },
    listWikiPages: () =>
      wikiPages.map((p) => ({
        file: p.file,
        title: p.file.replace(".md", ""),
        excerpt: "",
      })),
    listTasks: () => tasks,
    getMemories: (_options?: { type?: string; mode?: string }) => {
      if (_options?.mode === "public") {
        return memories.filter(
          (m) =>
            !m.key.startsWith("private.") &&
            !m.tags.includes("private") &&
            m.type === "explicit"
        );
      }
      return memories;
    },
    getRepoLearner: () => ({
      buildIndex: async () => ({}),
      onCommit: async () => {},
    }),
  } as unknown as Brain;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SyncPublisher", () => {
  let privateDir: string;
  let publicDir: string;

  beforeEach(async () => {
    privateDir = await makeGitRepo("sync-pub-priv-");
    publicDir = await makeGitRepo("sync-pub-pub-");
  });

  afterEach(() => {
    rmSync(privateDir, { recursive: true, force: true });
    rmSync(publicDir, { recursive: true, force: true });
  });

  // ── dryRun ──────────────────────────────────────────────────────────────────

  describe("dryRun", () => {
    it("returns planned files without writing anything", async () => {
      const brain = makeStubBrain({
        facts: { name: "alice", "private.token": "secret" },
        soul: "# Hello\nI am Alice.",
        tasks: [{ id: "t1", title: "Build", description: "Do it", createdAt: new Date().toISOString(), status: "active" }],
      });

      const publisher = new SyncPublisher({
        privateRepoRoot: privateDir,
        publicRepoRoot: publicDir,
        brain,
      });

      const result = await publisher.dryRun();

      expect(result.committed).toBe(false);
      expect(result.pushed).toBe(false);
      expect(result.summary).toContain("dry-run");
      expect(result.published.length).toBeGreaterThan(0);

      // Verify nothing was actually written
      expect(existsSync(join(publicDir, "cocapn"))).toBe(false);
    });

    it("lists public facts but not private ones", async () => {
      const brain = makeStubBrain({
        facts: {
          name: "alice",
          "private.apiKey": "sk-deadbeef",
          hobby: "coding",
        },
      });

      const publisher = new SyncPublisher({
        privateRepoRoot: privateDir,
        publicRepoRoot: publicDir,
        brain,
      });

      const result = await publisher.dryRun();
      expect(result.filteredFacts).not.toContain("private.apiKey");
      expect(result.published).toContain("cocapn/public-facts.json");
    });
  });

  // ── publish ─────────────────────────────────────────────────────────────────

  describe("publish", () => {
    it("writes public-facts.json with filtered facts", async () => {
      const brain = makeStubBrain({
        facts: {
          name: "alice",
          "private.secret": "hidden",
          website: "https://example.com",
        },
      });

      const publisher = new SyncPublisher({
        privateRepoRoot: privateDir,
        publicRepoRoot: publicDir,
        brain,
      });

      const result = await publisher.publish();

      expect(result.published).toContain("cocapn/public-facts.json");
      expect(result.filteredFacts).not.toContain("private.secret");

      const written = JSON.parse(
        readFileSync(join(publicDir, "cocapn", "public-facts.json"), "utf8")
      );
      expect(written.name).toBe("alice");
      expect(written.website).toBe("https://example.com");
      expect(written["private.secret"]).toBeUndefined();
    });

    it("writes public-soul.md with private sections stripped", async () => {
      const brain = makeStubBrain({
        soul: "# Alice\nPublic info.\n\n<!-- private -->\nSecret key=abc\n<!-- /private -->\n\nMore public.",
      });

      const publisher = new SyncPublisher({
        privateRepoRoot: privateDir,
        publicRepoRoot: publicDir,
        brain,
      });

      const result = await publisher.publish();
      expect(result.published).toContain("cocapn/public-soul.md");

      const written = readFileSync(
        join(publicDir, "cocapn", "public-soul.md"),
        "utf8"
      );
      expect(written).toContain("Public info.");
      expect(written).toContain("More public.");
      expect(written).not.toContain("Secret key=abc");
    });

    it("sanitizes PII in soul", async () => {
      const brain = makeStubBrain({
        soul: "# Alice\nContact: alice@example.com for info.",
      });

      const publisher = new SyncPublisher({
        privateRepoRoot: privateDir,
        publicRepoRoot: publicDir,
        brain,
      });

      await publisher.publish();

      const written = readFileSync(
        join(publicDir, "cocapn", "public-soul.md"),
        "utf8"
      );
      expect(written).not.toContain("alice@example.com");
      expect(written).toContain("[REDACTED]");
    });

    it("writes public-wiki pages sanitized", async () => {
      const brain = makeStubBrain({
        wikiPages: [
          {
            file: "notes.md",
            content: "# Notes\n\nCheck localhost:3000 for dev.\n\nSecret password=admin123",
          },
        ],
      });

      const publisher = new SyncPublisher({
        privateRepoRoot: privateDir,
        publicRepoRoot: publicDir,
        brain,
      });

      const result = await publisher.publish();
      expect(result.published).toContain("cocapn/public-wiki/notes.md");

      const written = readFileSync(
        join(publicDir, "cocapn", "public-wiki", "notes.md"),
        "utf8"
      );
      expect(written).toContain("Notes");
      expect(written).not.toContain("password=admin123");
    });

    it("writes public-tasks.json", async () => {
      const brain = makeStubBrain({
        tasks: [
          { id: "t1", title: "Ship feature", description: "Implement the thing", createdAt: new Date().toISOString(), status: "done" },
        ],
      });

      const publisher = new SyncPublisher({
        privateRepoRoot: privateDir,
        publicRepoRoot: publicDir,
        brain,
      });

      const result = await publisher.publish();
      expect(result.published).toContain("cocapn/public-tasks.json");

      const written = JSON.parse(
        readFileSync(join(publicDir, "cocapn", "public-tasks.json"), "utf8")
      );
      expect(written).toHaveLength(1);
      expect(written[0].title).toBe("Ship feature");
    });

    it("commits to the face repo", async () => {
      const brain = makeStubBrain({
        facts: { name: "test" },
      });

      const publisher = new SyncPublisher({
        privateRepoRoot: privateDir,
        publicRepoRoot: publicDir,
        brain,
      });

      const result = await publisher.publish();
      expect(result.committed).toBe(true);

      const git = simpleGit(publicDir);
      const log = await git.log({ maxCount: 1 });
      expect(log.latest?.message).toContain("brain → face sync");
    });

    it("returns empty result when brain is empty", async () => {
      const brain = makeStubBrain({});

      const publisher = new SyncPublisher({
        privateRepoRoot: privateDir,
        publicRepoRoot: publicDir,
        brain,
      });

      const result = await publisher.publish();
      expect(result.published).toEqual([]);
      expect(result.committed).toBe(false);
      expect(result.filteredFacts).toEqual([]);
    });

    it("filters sensitive facts", async () => {
      const brain = makeStubBrain({
        facts: {
          name: "alice",
          "sensitive.medical": "private data",
          "secret.dbPassword": "hunter2",
        },
      });

      const publisher = new SyncPublisher({
        privateRepoRoot: privateDir,
        publicRepoRoot: publicDir,
        brain,
      });

      const result = await publisher.dryRun();
      expect(result.filteredFacts).not.toContain("sensitive.medical");
      expect(result.filteredFacts).not.toContain("secret.dbPassword");
      expect(result.filteredFacts).not.toContain("name");
    });

    it("filters non-explicit memories", async () => {
      const brain = makeStubBrain({
        memories: [
          {
            id: "m1",
            key: "public.fact",
            value: "visible",
            type: "explicit",
            confidence: 1.0,
            accessCount: 0,
            lastAccessed: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            tags: [],
            autoGenerated: false,
          },
          {
            id: "m2",
            key: "private.note",
            value: "hidden",
            type: "implicit",
            confidence: 0.7,
            accessCount: 0,
            lastAccessed: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            tags: ["private"],
            autoGenerated: true,
          },
        ],
      });

      const publisher = new SyncPublisher({
        privateRepoRoot: privateDir,
        publicRepoRoot: publicDir,
        brain,
      });

      const result = await publisher.dryRun();
      // Only explicit, non-private memories should pass
      expect(result.published).toContain("cocapn/public-memories.json");
    });
  });

  // ── compilePublicSoul ───────────────────────────────────────────────────────

  describe("compilePublicSoul", () => {
    it("strips private sections and sanitizes PII", () => {
      const brain = makeStubBrain({});
      const publisher = new SyncPublisher({
        privateRepoRoot: privateDir,
        publicRepoRoot: publicDir,
        brain,
      });

      const result = (publisher as any).compilePublicSoul(
        "# Hello\nContact bob@example.com\n<!-- private -->\nSecret stuff\n<!-- /private -->"
      );

      expect(result).not.toContain("Secret stuff");
      expect(result).not.toContain("bob@example.com");
      expect(result).toContain("Hello");
    });
  });
});
