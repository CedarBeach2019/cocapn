/**
 * Tests for template-based scaffolding (templates.ts).
 *
 * Run with:
 *   node --test --experimental-strip-types tests/templates.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getTemplateFiles, writeTemplateFiles } from "../src/templates.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tmpDir(suffix: string): string {
  const dir = join(tmpdir(), `create-cocapn-test-${suffix}-${Date.now()}`);
  return dir;
}

// ─── getTemplateFiles ──────────────────────────────────────────────────────────

describe("getTemplateFiles", () => {
  it("returns base files for all templates", () => {
    const templates = ["bare", "cloud-worker", "web-app", "dmlog", "studylog"];

    for (const template of templates) {
      const files = getTemplateFiles({ template });

      // All templates should have .gitignore and cocapn.json
      assert.ok(
        files.some((f) => f.path === ".gitignore"),
        `${template} should have .gitignore`
      );
      assert.ok(
        files.some((f) => f.path === "cocapn.json"),
        `${template} should have cocapn.json`
      );
    }
  });

  it("cloud-worker template includes wrangler.toml", () => {
    const files = getTemplateFiles({ template: "cloud-worker" });
    assert.ok(files.some((f) => f.path === "wrangler.toml"));
  });

  it("web-app template includes index.html", () => {
    const files = getTemplateFiles({ template: "web-app" });
    assert.ok(files.some((f) => f.path === "index.html"));
  });

  it("dmlog template includes soul.md with TTRPG content", () => {
    const files = getTemplateFiles({ template: "dmlog" });
    const soulFile = files.find((f) => f.path === "cocapn/soul.md");
    assert.ok(soulFile);
    assert.ok(soulFile.content.includes("Dungeon Master"));
    assert.ok(soulFile.content.includes("TTRPG"));
  });

  it("studylog template includes soul.md with education content", () => {
    const files = getTemplateFiles({ template: "studylog" });
    const soulFile = files.find((f) => f.path === "cocapn/soul.md");
    assert.ok(soulFile);
    assert.ok(soulFile.content.includes("AI tutor"));
    assert.ok(soulFile.content.includes("learning"));
  });

  it("replaces repoName placeholder in files", () => {
    const files = getTemplateFiles({
      template: "bare",
      repoName: "my-custom-app"
    });

    const pkgJson = files.find((f) => f.path === "package.json");
    assert.ok(pkgJson);

    const parsed = JSON.parse(pkgJson.content);
    assert.equal(parsed.name, "my-custom-app");
  });

  it("includes description in cocapn.json when provided", () => {
    const files = getTemplateFiles({
      template: "bare",
      repoName: "test-app",
      description: "My custom test app"
    });

    const cocapnJson = files.find((f) => f.path === "cocapn.json");
    assert.ok(cocapnJson);

    const parsed = JSON.parse(cocapnJson.content);
    assert.equal(parsed.description, "My custom test app");
  });

  it("includes author in dmlog soul.md when provided", () => {
    const files = getTemplateFiles({
      template: "dmlog",
      author: "Alice the DM"
    });

    const soulFile = files.find((f) => f.path === "cocapn/soul.md");
    assert.ok(soulFile);
    assert.ok(soulFile.content.includes("Alice the DM"));
  });
});

// ─── writeTemplateFiles ────────────────────────────────────────────────────────

describe("writeTemplateFiles", () => {
  let dir: string;

  before(() => {
    dir = tmpDir("write-files");
  });

  after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates all files for bare template", () => {
    writeTemplateFiles(dir, { template: "bare", repoName: "test-bare" });

    // Check base files
    assert.ok(existsSync(join(dir, ".gitignore")));
    assert.ok(existsSync(join(dir, "cocapn.json")));
    assert.ok(existsSync(join(dir, "package.json")));
    assert.ok(existsSync(join(dir, "src/index.ts")));
  });

  it("creates wrangler.toml for cloud-worker template", () => {
    const testDir = tmpDir("cloud-worker");
    try {
      writeTemplateFiles(testDir, { template: "cloud-worker", repoName: "test-worker" });

      assert.ok(existsSync(join(testDir, "wrangler.toml")));
      assert.ok(existsSync(join(testDir, "src/index.ts")));

      // Check that wrangler.toml has the project name
      const wrangler = readFileSync(join(testDir, "wrangler.toml"), "utf8");
      assert.ok(wrangler.includes("test-worker"));
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("creates cocapn/soul.md for dmlog template", () => {
    const testDir = tmpDir("dmlog");
    try {
      writeTemplateFiles(testDir, { template: "dmlog", repoName: "test-dmlog" });

      assert.ok(existsSync(join(testDir, "cocapn/soul.md")));
      assert.ok(existsSync(join(testDir, "cocapn/config.yml")));

      // Check soul.md content
      const soul = readFileSync(join(testDir, "cocapn/soul.md"), "utf8");
      assert.ok(soul.includes("Dungeon Master"));
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("creates cocapn/soul.md for studylog template", () => {
    const testDir = tmpDir("studylog");
    try {
      writeTemplateFiles(testDir, { template: "studylog", repoName: "test-studylog" });

      assert.ok(existsSync(join(testDir, "cocapn/soul.md")));
      assert.ok(existsSync(join(testDir, "cocapn/config.yml")));

      // Check soul.md content
      const soul = readFileSync(join(testDir, "cocapn/soul.md"), "utf8");
      assert.ok(soul.includes("AI tutor"));
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("creates web app files for web-app template", () => {
    const testDir = tmpDir("webapp");
    try {
      writeTemplateFiles(testDir, { template: "web-app", repoName: "test-webapp" });

      assert.ok(existsSync(join(testDir, "index.html")));
      assert.ok(existsSync(join(testDir, "src/index.ts")));
      assert.ok(existsSync(join(testDir, "src/App.tsx")));

      // Check index.html has project name
      const html = readFileSync(join(testDir, "index.html"), "utf8");
      assert.ok(html.includes("test-webapp"));
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("overwrites existing files", () => {
    const testDir = tmpDir("overwrite");
    try {
      // Write initial files
      writeTemplateFiles(testDir, { template: "bare", repoName: "initial" });

      // Write again with different options
      writeTemplateFiles(testDir, { template: "bare", repoName: "updated" });

      // Check that the file was updated
      const pkgJson = readFileSync(join(testDir, "package.json"), "utf8");
      const parsed = JSON.parse(pkgJson);
      assert.equal(parsed.name, "updated");
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("creates nested directory structure", () => {
    const testDir = tmpDir("nested");
    try {
      writeTemplateFiles(testDir, { template: "dmlog", repoName: "test-nested" });

      // Check that nested directories were created
      assert.ok(existsSync(join(testDir, "cocapn")));
      assert.ok(existsSync(join(testDir, "cocapn/soul.md")));
      assert.ok(existsSync(join(testDir, "cocapn/config.yml")));
      assert.ok(existsSync(join(testDir, "src")));
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});

// ─── Template content validation ───────────────────────────────────────────────

describe("Template content validation", () => {
  it("bare template has minimal dependencies", () => {
    const files = getTemplateFiles({ template: "bare" });
    const pkgJson = files.find((f) => f.path === "package.json");
    assert.ok(pkgJson);

    const parsed = JSON.parse(pkgJson.content);
    // Bare should have minimal dependencies (no runtime deps)
    assert.ok(!parsed.dependencies || Object.keys(parsed.dependencies).length === 0);
  });

  it("cloud-worker template includes hono dependency", () => {
    const files = getTemplateFiles({ template: "cloud-worker" });
    const pkgJson = files.find((f) => f.path === "package.json");
    assert.ok(pkgJson);

    const parsed = JSON.parse(pkgJson.content);
    assert.ok(parsed.dependencies.hono);
    assert.ok(parsed.devDependencies.wrangler);
  });

  it("web-app template includes preact dependency", () => {
    const files = getTemplateFiles({ template: "web-app" });
    const pkgJson = files.find((f) => f.path === "package.json");
    assert.ok(pkgJson);

    const parsed = JSON.parse(pkgJson.content);
    assert.ok(parsed.dependencies.preact);
    assert.ok(parsed.devDependencies.vite);
  });

  it("all templates use type: module in package.json", () => {
    const templates = ["bare", "cloud-worker", "web-app", "dmlog", "studylog"];

    for (const template of templates) {
      const files = getTemplateFiles({ template });
      const pkgJson = files.find((f) => f.path === "package.json");
      assert.ok(pkgJson, `${template} should have package.json`);

      const parsed = JSON.parse(pkgJson.content);
      assert.equal(parsed.type, "module", `${template} should use ESM`);
    }
  });

  it("all templates include test script", () => {
    const templates = ["bare", "cloud-worker", "web-app", "dmlog", "studylog"];

    for (const template of templates) {
      const files = getTemplateFiles({ template });
      const pkgJson = files.find((f) => f.path === "package.json");
      assert.ok(pkgJson, `${template} should have package.json`);

      const parsed = JSON.parse(pkgJson.content);
      assert.ok(parsed.scripts.test, `${template} should have test script`);
    }
  });
});
