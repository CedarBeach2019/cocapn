/**
 * Tests for PersonalityManager — built-in presets, custom personalities,
 * system prompt builder, and persistence.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { simpleGit } from "simple-git";
import { PersonalityManager, BUILT_IN } from "../../src/personality/index.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeTempRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "cocapn-personality-test-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test");
  await git.addConfig("user.email", "test@test.com");
  writeFileSync(join(dir, "README.md"), "test\n");
  await git.add(".");
  await git.commit("init");
  return dir;
}

/** Minimal Brain stub — only getSoul() is needed by PersonalityManager. */
function makeBrainMock(soulContent = ""): any {
  return { getSoul: () => soulContent };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PersonalityManager", () => {
  let repoRoot: string;

  beforeEach(async () => { repoRoot = await makeTempRepo(); });
  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  // ─── Built-in presets ─────────────────────────────────────────────────────

  describe("built-in presets", () => {
    it("has all 5 expected presets", () => {
      const expected = ["default", "tutor", "critic", "creative", "dm"];
      expect(Object.keys(BUILT_IN)).toEqual(expected);
    });

    it("listBuiltIn returns all preset names", () => {
      const brain = makeBrainMock();
      const pm = new PersonalityManager(brain, repoRoot);
      expect(pm.listBuiltIn()).toEqual(["default", "tutor", "critic", "creative", "dm"]);
    });

    it("getBuiltIn returns a clone (mutations don't affect original)", () => {
      const brain = makeBrainMock();
      const pm = new PersonalityManager(brain, repoRoot);
      const original = BUILT_IN.default;
      const clone = pm.getBuiltIn("default")!;
      clone.name = "mutated";
      expect(BUILT_IN.default.name).toBe("Assistant");
    });

    it("getBuiltIn returns undefined for unknown name", () => {
      const brain = makeBrainMock();
      const pm = new PersonalityManager(brain, repoRoot);
      expect(pm.getBuiltIn("nonexistent")).toBeUndefined();
    });
  });

  // ─── Default on fresh repo ────────────────────────────────────────────────

  describe("initialization", () => {
    it("defaults to the 'default' preset when no personality.json exists", () => {
      const brain = makeBrainMock();
      const pm = new PersonalityManager(brain, repoRoot);
      const personality = pm.get();
      expect(personality.name).toBe("Assistant");
      expect(personality.voice).toBe("casual");
    });

    it("loads persisted personality.json on initialization", () => {
      mkdirSync(join(repoRoot, "cocapn"), { recursive: true });
      const persisted = {
        name: "TestBot",
        tagline: "A test bot",
        traits: ["testy"],
        systemPrompt: "You are a test bot.",
        voice: "formal",
        rules: ["no tests left behind"],
      };
      writeFileSync(join(repoRoot, "cocapn", "personality.json"), JSON.stringify(persisted));

      const brain = makeBrainMock();
      const pm = new PersonalityManager(brain, repoRoot);
      expect(pm.get().name).toBe("TestBot");
      expect(pm.get().voice).toBe("formal");
    });

    it("falls back to default when persisted JSON is corrupt", () => {
      mkdirSync(join(repoRoot, "cocapn"), { recursive: true });
      writeFileSync(join(repoRoot, "cocapn", "personality.json"), "not json{{{");

      const brain = makeBrainMock();
      const pm = new PersonalityManager(brain, repoRoot);
      expect(pm.get().name).toBe("Assistant");
    });

    it("falls back to default when persisted JSON has invalid shape", () => {
      mkdirSync(join(repoRoot, "cocapn"), { recursive: true });
      writeFileSync(join(repoRoot, "cocapn", "personality.json"), JSON.stringify({ name: 123 }));

      const brain = makeBrainMock();
      const pm = new PersonalityManager(brain, repoRoot);
      expect(pm.get().name).toBe("Assistant");
    });
  });

  // ─── applyPreset ──────────────────────────────────────────────────────────

  describe("applyPreset", () => {
    it("applies a built-in preset and persists it", async () => {
      const brain = makeBrainMock();
      const pm = new PersonalityManager(brain, repoRoot);

      const result = await pm.applyPreset("critic");
      expect(result.name).toBe("Critic");
      expect(result.voice).toBe("formal");

      // Verify persistence
      const personality = pm.get();
      expect(personality.name).toBe("Critic");

      // Verify written to disk
      const raw = readFileSync(join(repoRoot, "cocapn", "personality.json"), "utf8");
      const parsed = JSON.parse(raw);
      expect(parsed.name).toBe("Critic");
    });

    it("throws for unknown preset", async () => {
      const brain = makeBrainMock();
      const pm = new PersonalityManager(brain, repoRoot);
      await expect(pm.applyPreset("nonexistent")).rejects.toThrow("Unknown personality preset");
    });
  });

  // ─── set (partial update) ────────────────────────────────────────────────

  describe("set", () => {
    it("merges partial update into current personality", async () => {
      const brain = makeBrainMock();
      const pm = new PersonalityManager(brain, repoRoot);

      await pm.set({ name: "CustomBot", voice: "technical" });

      const personality = pm.get();
      expect(personality.name).toBe("CustomBot");
      expect(personality.voice).toBe("technical");
      // Unchanged fields preserved from default
      expect(personality.tagline).toBe("Helpful, concise AI assistant");
    });

    it("persists partial update to disk", async () => {
      const brain = makeBrainMock();
      const pm = new PersonalityManager(brain, repoRoot);

      await pm.set({ traits: ["silly", "bold"] });

      const raw = readFileSync(join(repoRoot, "cocapn", "personality.json"), "utf8");
      const parsed = JSON.parse(raw);
      expect(parsed.traits).toEqual(["silly", "bold"]);
    });
  });

  // ─── loadFromFile ────────────────────────────────────────────────────────

  describe("loadFromFile", () => {
    it("loads personality from a JSON file", async () => {
      const personalityFile = join(repoRoot, "custom-personality.json");
      writeFileSync(personalityFile, JSON.stringify({
        name: "FileBot",
        tagline: "Loaded from file",
        traits: ["file-based"],
        systemPrompt: "You are FileBot.",
        voice: "creative",
        rules: ["be creative"],
      }));

      const brain = makeBrainMock();
      const pm = new PersonalityManager(brain, repoRoot);

      await pm.loadFromFile(personalityFile);
      expect(pm.get().name).toBe("FileBot");
    });

    it("throws for non-existent file", async () => {
      const brain = makeBrainMock();
      const pm = new PersonalityManager(brain, repoRoot);
      await expect(pm.loadFromFile("/nonexistent/path.json")).rejects.toThrow("Cannot read personality file");
    });

    it("throws for invalid JSON", async () => {
      const badFile = join(repoRoot, "bad.json");
      writeFileSync(badFile, "not json");

      const brain = makeBrainMock();
      const pm = new PersonalityManager(brain, repoRoot);
      await expect(pm.loadFromFile(badFile)).rejects.toThrow("Invalid JSON");
    });

    it("throws for invalid personality shape", async () => {
      const badFile = join(repoRoot, "bad-shape.json");
      writeFileSync(badFile, JSON.stringify({ name: "Missing required fields" }));

      const brain = makeBrainMock();
      const pm = new PersonalityManager(brain, repoRoot);
      await expect(pm.loadFromFile(badFile)).rejects.toThrow("Invalid personality format");
    });
  });

  // ─── buildSystemPrompt ───────────────────────────────────────────────────

  describe("buildSystemPrompt", () => {
    it("includes personality system prompt and metadata", () => {
      const brain = makeBrainMock();
      const pm = new PersonalityManager(brain, repoRoot);

      const prompt = pm.buildSystemPrompt();
      expect(prompt).toContain("helpful AI assistant");
      expect(prompt).toContain("Name: Assistant");
      expect(prompt).toContain("Voice: casual");
      expect(prompt).toContain("helpful, concise, direct");
    });

    it("includes behavioral rules", () => {
      const brain = makeBrainMock();
      const pm = new PersonalityManager(brain, repoRoot);

      const prompt = pm.buildSystemPrompt();
      expect(prompt).toContain("Be concise");
    });

    it("appends soul.md content when present", () => {
      const brain = makeBrainMock("# Soul\nBe excellent to each other.");
      const pm = new PersonalityManager(brain, repoRoot);

      const prompt = pm.buildSystemPrompt();
      expect(prompt).toContain("## Soul");
      expect(prompt).toContain("Be excellent to each other.");
    });

    it("omits Soul section when soul.md is empty", () => {
      const brain = makeBrainMock("");
      const pm = new PersonalityManager(brain, repoRoot);

      const prompt = pm.buildSystemPrompt();
      expect(prompt).not.toContain("## Soul");
    });

    it("reflects personality changes after applyPreset", async () => {
      const brain = makeBrainMock();
      const pm = new PersonalityManager(brain, repoRoot);

      await pm.applyPreset("dm");
      const prompt = pm.buildSystemPrompt();
      expect(prompt).toContain("Dungeon Master");
      expect(prompt).toContain("dramatic");
      expect(prompt).toContain("Narrate with vivid");
    });
  });

  // ─── toMarkdown ──────────────────────────────────────────────────────────

  describe("toMarkdown", () => {
    it("renders personality as markdown", () => {
      const brain = makeBrainMock();
      const pm = new PersonalityManager(brain, repoRoot);

      const md = pm.toMarkdown();
      expect(md).toContain("# Assistant");
      expect(md).toContain("Helpful, concise AI assistant");
      expect(md).toContain("**Voice:** casual");
      expect(md).toContain("**Traits:** helpful, concise, direct");
      expect(md).toContain("## Rules");
      expect(md).toContain("## System Prompt");
    });
  });

  // ─── get (immutability) ──────────────────────────────────────────────────

  describe("get", () => {
    it("returns a clone — mutations don't affect internal state", () => {
      const brain = makeBrainMock();
      const pm = new PersonalityManager(brain, repoRoot);

      const p1 = pm.get();
      p1.name = "Mutated";

      expect(pm.get().name).toBe("Assistant");
    });
  });
});
