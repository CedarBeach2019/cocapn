/**
 * Tests for cocapn template command.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  mkdirSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  createTemplateCommand,
  listSoulTemplates,
  listDeploymentTemplates,
  listVerticalTemplates,
  listAllTemplates,
  findTemplate,
  getTemplateDetails,
  applyTemplate,
  createTemplateFromCurrent,
  resolveTemplatesDir,
} from "../src/commands/template.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "cocapn-template-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─── resolveTemplatesDir ───────────────────────────────────────────────────

describe("resolveTemplatesDir", () => {
  it("returns a path that exists in the monorepo", () => {
    const dir = resolveTemplatesDir();
    expect(existsSync(dir)).toBe(true);
  });

  it("points to packages/templates", () => {
    const dir = resolveTemplatesDir();
    expect(dir).toMatch(/packages\/templates$/);
  });
});

// ─── listSoulTemplates ─────────────────────────────────────────────────────

describe("listSoulTemplates", () => {
  it("returns an array of soul templates", () => {
    const templates = listSoulTemplates();
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThan(0);
  });

  it("each template has name, type, description, and path", () => {
    const templates = listSoulTemplates();
    for (const t of templates) {
      expect(t).toHaveProperty("name");
      expect(t).toHaveProperty("type");
      expect(t.type).toBe("soul");
      expect(t).toHaveProperty("description");
      expect(t).toHaveProperty("path");
    }
  });

  it("includes known soul templates", () => {
    const templates = listSoulTemplates();
    const names = templates.map((t) => t.name);
    expect(names).toContain("fishing-buddy");
    expect(names).toContain("dungeon-master");
    expect(names).toContain("developer-assistant");
  });

  it("template paths exist on disk", () => {
    const templates = listSoulTemplates();
    for (const t of templates) {
      expect(existsSync(t.path)).toBe(true);
    }
  });
});

// ─── listDeploymentTemplates ───────────────────────────────────────────────

describe("listDeploymentTemplates", () => {
  it("returns an array of deployment templates", () => {
    const templates = listDeploymentTemplates();
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThan(0);
  });

  it("each template has type 'deployment'", () => {
    const templates = listDeploymentTemplates();
    for (const t of templates) {
      expect(t.type).toBe("deployment");
    }
  });

  it("includes dmlog-ai deployment", () => {
    const templates = listDeploymentTemplates();
    const names = templates.map((t) => t.name);
    expect(names).toContain("dmlog-ai");
  });
});

// ─── listVerticalTemplates ─────────────────────────────────────────────────

describe("listVerticalTemplates", () => {
  it("returns an array of vertical templates", () => {
    const templates = listVerticalTemplates();
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThan(0);
  });

  it("each template has type 'vertical'", () => {
    const templates = listVerticalTemplates();
    for (const t of templates) {
      expect(t.type).toBe("vertical");
    }
  });

  it("includes known verticals", () => {
    const templates = listVerticalTemplates();
    const names = templates.map((t) => t.name);
    expect(names).toContain("dmlog");
    expect(names).toContain("bare");
  });
});

// ─── listAllTemplates ──────────────────────────────────────────────────────

describe("listAllTemplates", () => {
  it("returns templates from all categories", () => {
    const templates = listAllTemplates();
    const types = new Set(templates.map((t) => t.type));
    expect(types.has("soul")).toBe(true);
    expect(types.has("deployment")).toBe(true);
    expect(types.has("vertical")).toBe(true);
  });

  it("includes local templates when repoRoot is provided", () => {
    // Create a local template
    const localDir = join(tmpDir, "cocapn", "templates", "local", "my-custom");
    mkdirSync(localDir, { recursive: true });
    writeFileSync(join(localDir, "soul.md"), "# Custom Soul\n", "utf-8");

    const templates = listAllTemplates(tmpDir);
    const localTemplates = templates.filter((t) => t.path.includes("templates/local"));
    expect(localTemplates.length).toBe(1);
    expect(localTemplates[0].name).toBe("my-custom");
  });

  it("does not include local templates when no repoRoot", () => {
    const templates = listAllTemplates();
    const localTemplates = templates.filter((t) => t.path.includes("templates/local"));
    expect(localTemplates.length).toBe(0);
  });
});

// ─── findTemplate ──────────────────────────────────────────────────────────

describe("findTemplate", () => {
  it("finds a template by exact name", () => {
    const found = findTemplate("fishing-buddy");
    expect(found).toBeDefined();
    expect(found!.name).toBe("fishing-buddy");
    expect(found!.type).toBe("soul");
  });

  it("finds a template case-insensitively", () => {
    const found = findTemplate("FISHING-BUDDY");
    expect(found).toBeDefined();
    expect(found!.name).toBe("fishing-buddy");
  });

  it("finds a vertical template", () => {
    const found = findTemplate("dmlog");
    expect(found).toBeDefined();
    expect(found!.type).toBe("vertical");
  });

  it("finds a deployment template", () => {
    const found = findTemplate("dmlog-ai");
    expect(found).toBeDefined();
    expect(found!.type).toBe("deployment");
  });

  it("returns undefined for unknown template", () => {
    const found = findTemplate("nonexistent-template");
    expect(found).toBeUndefined();
  });

  it("finds local templates when repoRoot is provided", () => {
    const localDir = join(tmpDir, "cocapn", "templates", "local", "my-local");
    mkdirSync(localDir, { recursive: true });
    writeFileSync(join(localDir, "soul.md"), "# Local\n", "utf-8");

    const found = findTemplate("my-local", tmpDir);
    expect(found).toBeDefined();
    expect(found!.name).toBe("my-local");
  });
});

// ─── getTemplateDetails ────────────────────────────────────────────────────

describe("getTemplateDetails", () => {
  it("returns details for a soul template", () => {
    const details = getTemplateDetails("fishing-buddy");
    expect(details).toBeDefined();
    expect(details!.name).toBe("fishing-buddy");
    expect(details!.type).toBe("soul");
    expect(details!.soulMd).toBeDefined();
    expect(details!.soulMd!.length).toBeGreaterThan(0);
  });

  it("returns details for a vertical template with soul.md", () => {
    const details = getTemplateDetails("dmlog");
    expect(details).toBeDefined();
    expect(details!.type).toBe("vertical");
    // dmlog vertical should have a soul.md
    if (details!.soulMd) {
      expect(details!.soulMd.length).toBeGreaterThan(0);
    }
  });

  it("returns undefined for unknown template", () => {
    const details = getTemplateDetails("nonexistent");
    expect(details).toBeUndefined();
  });
});

// ─── applyTemplate ─────────────────────────────────────────────────────────

describe("applyTemplate", () => {
  beforeEach(() => {
    // Create a cocapn directory for tests
    mkdirSync(join(tmpDir, "cocapn"), { recursive: true });
  });

  it("applies a soul template to cocapn/soul.md", () => {
    const result = applyTemplate("fishing-buddy", tmpDir);

    expect(result.template).toBe("fishing-buddy");
    expect(result.applied).toContain("soul.md");

    const soulMd = readFileSync(join(tmpDir, "cocapn", "soul.md"), "utf-8");
    expect(soulMd.length).toBeGreaterThan(0);
  });

  it("skips soul.md if it already exists without --force", () => {
    writeFileSync(join(tmpDir, "cocapn", "soul.md"), "# Existing\n", "utf-8");

    const result = applyTemplate("fishing-buddy", tmpDir);

    expect(result.applied).not.toContain("soul.md");
    expect(result.skipped.some((s) => s.includes("soul.md"))).toBe(true);

    // Original content preserved
    const soulMd = readFileSync(join(tmpDir, "cocapn", "soul.md"), "utf-8");
    expect(soulMd).toBe("# Existing\n");
  });

  it("overwrites soul.md with --force", () => {
    writeFileSync(join(tmpDir, "cocapn", "soul.md"), "# Existing\n", "utf-8");

    const result = applyTemplate("fishing-buddy", tmpDir, { force: true });

    expect(result.applied).toContain("soul.md");
    expect(result.skipped.length).toBe(0);

    const soulMd = readFileSync(join(tmpDir, "cocapn", "soul.md"), "utf-8");
    expect(soulMd).not.toBe("# Existing\n");
  });

  it("throws when cocapn/ directory does not exist", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "cocapn-template-nococapn-"));
    try {
      expect(() => applyTemplate("fishing-buddy", emptyDir)).toThrow("No cocapn/ directory found");
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("throws for unknown template", () => {
    expect(() => applyTemplate("nonexistent", tmpDir)).toThrow("Template not found");
  });
});

// ─── createTemplateFromCurrent ─────────────────────────────────────────────

describe("createTemplateFromCurrent", () => {
  beforeEach(() => {
    mkdirSync(join(tmpDir, "cocapn"), { recursive: true });
  });

  it("creates a template from soul.md and config.yml", () => {
    writeFileSync(join(tmpDir, "cocapn", "soul.md"), "# My Soul\n\nYou are helpful.\n", "utf-8");
    writeFileSync(join(tmpDir, "cocapn", "config.yml"), "llm:\n  provider: deepseek\n", "utf-8");

    const result = createTemplateFromCurrent(tmpDir, "my-template");

    expect(result.name).toBe("my-template");
    expect(result.files).toContain("soul.md");
    expect(result.files).toContain("config.yml");

    // Verify files were copied
    expect(existsSync(join(result.path, "soul.md"))).toBe(true);
    expect(existsSync(join(result.path, "config.yml"))).toBe(true);

    const copiedSoul = readFileSync(join(result.path, "soul.md"), "utf-8");
    expect(copiedSoul).toBe("# My Soul\n\nYou are helpful.\n");
  });

  it("creates a template with modules.json", () => {
    writeFileSync(join(tmpDir, "cocapn", "soul.md"), "# Soul\n", "utf-8");
    writeFileSync(
      join(tmpDir, "cocapn", "modules.json"),
      JSON.stringify(["personality", "knowledge"]),
      "utf-8",
    );

    const result = createTemplateFromCurrent(tmpDir);
    expect(result.files).toContain("modules.json");
  });

  it("generates a name if none provided", () => {
    writeFileSync(join(tmpDir, "cocapn", "soul.md"), "# Soul\n", "utf-8");

    const result = createTemplateFromCurrent(tmpDir);
    expect(result.name).toMatch(/^custom-\d+$/);
  });

  it("throws when no template-able files exist", () => {
    expect(() => createTemplateFromCurrent(tmpDir, "empty")).toThrow(
      "No template-able files found",
    );
  });

  it("throws when cocapn/ does not exist", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "cocapn-template-create-"));
    try {
      expect(() => createTemplateFromCurrent(emptyDir)).toThrow("No cocapn/ directory found");
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("created template appears in listAllTemplates", () => {
    writeFileSync(join(tmpDir, "cocapn", "soul.md"), "# Soul\n", "utf-8");
    writeFileSync(join(tmpDir, "cocapn", "config.yml"), "llm:\n  provider: deepseek\n", "utf-8");

    createTemplateFromCurrent(tmpDir, "test-tmpl");

    const templates = listAllTemplates(tmpDir);
    const local = templates.filter((t) => t.path.includes("templates/local"));
    expect(local.length).toBe(1);
    expect(local[0].name).toBe("test-tmpl");
  });

  it("created template can be applied to another repo", () => {
    writeFileSync(join(tmpDir, "cocapn", "soul.md"), "# Original Soul\n", "utf-8");

    createTemplateFromCurrent(tmpDir, "reusable");

    // Create another repo
    const otherDir = mkdtempSync(join(tmpdir(), "cocapn-template-other-"));
    mkdirSync(join(otherDir, "cocapn"), { recursive: true });
    try {
      const result = applyTemplate("reusable", otherDir, { sourceRoot: tmpDir });
      expect(result.applied).toContain("soul.md");

      const soul = readFileSync(join(otherDir, "cocapn", "soul.md"), "utf-8");
      expect(soul).toBe("# Original Soul\n");
    } finally {
      rmSync(otherDir, { recursive: true, force: true });
    }
  });
});

// ─── Command creation ──────────────────────────────────────────────────────

describe("createTemplateCommand", () => {
  it("creates command with subcommands", () => {
    const cmd = createTemplateCommand();
    expect(cmd.name()).toBe("template");

    const subcommands = cmd.commands.map((c: { name: () => string }) => c.name());
    expect(subcommands).toContain("list");
    expect(subcommands).toContain("apply");
    expect(subcommands).toContain("create");
    expect(subcommands).toContain("info");
  });

  it("apply command has --force option", () => {
    const cmd = createTemplateCommand();
    const applyCmd = cmd.commands.find((c: { name: () => string }) => c.name() === "apply");
    expect(applyCmd).toBeDefined();

    const forceOption = applyCmd.options.find((o: { long: string }) => o.long === "--force");
    expect(forceOption).toBeDefined();
  });

  it("create command has --name option", () => {
    const cmd = createTemplateCommand();
    const createCmd = cmd.commands.find((c: { name: () => string }) => c.name() === "create");
    expect(createCmd).toBeDefined();

    const nameOption = createCmd.options.find((o: { long: string }) => o.long === "--name");
    expect(nameOption).toBeDefined();
  });

  it("list command has --type option", () => {
    const cmd = createTemplateCommand();
    const listCmd = cmd.commands.find((c: { name: () => string }) => c.name() === "list");
    expect(listCmd).toBeDefined();

    const typeOption = listCmd.options.find((o: { long: string }) => o.long === "--type");
    expect(typeOption).toBeDefined();
  });
});

// ─── Integration ───────────────────────────────────────────────────────────

describe("integration", () => {
  it("list → info → create → apply cycle works", () => {
    // List
    const all = listAllTemplates();
    expect(all.length).toBeGreaterThan(0);

    // Info
    const info = getTemplateDetails(all[0].name);
    expect(info).toBeDefined();

    // Create a repo with existing data
    mkdirSync(join(tmpDir, "cocapn"), { recursive: true });
    writeFileSync(join(tmpDir, "cocapn", "soul.md"), "# Old\n", "utf-8");
    writeFileSync(join(tmpDir, "cocapn", "config.yml"), "key: value\n", "utf-8");

    // Create template from current
    const created = createTemplateFromCurrent(tmpDir, "snapshot");
    expect(created.files.length).toBe(2);

    // Apply the template to a new repo
    const newDir = mkdtempSync(join(tmpdir(), "cocapn-template-int-"));
    mkdirSync(join(newDir, "cocapn"), { recursive: true });
    try {
      const applied = applyTemplate("snapshot", newDir, { sourceRoot: tmpDir });
      expect(applied.applied).toContain("soul.md");
      expect(applied.applied).toContain("config.yml");

      const soul = readFileSync(join(newDir, "cocapn", "soul.md"), "utf-8");
      expect(soul).toBe("# Old\n");
    } finally {
      rmSync(newDir, { recursive: true, force: true });
    }
  });
});
