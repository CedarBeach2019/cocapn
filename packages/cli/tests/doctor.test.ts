/**
 * Tests for cocapn doctor command.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  mkdirSync,
  statSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  checkCocapnDir,
  checkSubdirectories,
  checkConfigYaml,
  checkSoulMd,
  checkBrainFiles,
  checkGitRepo,
  checkNodeVersion,
  checkLockFiles,
  checkApiKeys,
  checkBridgePort,
  fixMissingDirectories,
  fixDefaultConfig,
  fixDefaultSoul,
  fixBrainFiles,
  fixLockFiles,
  runDiagnostics,
  runFixes,
} from "../src/commands/doctor.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "cocapn-doctor-test-"));
  // Create a valid cocapn project by default
  mkdirSync(join(tmpDir, "cocapn", "memory"), { recursive: true });
  mkdirSync(join(tmpDir, "cocapn", "wiki"), { recursive: true });
  writeFileSync(join(tmpDir, "cocapn", "soul.md"), "# Soul\n\nYou are helpful.\n", "utf-8");
  writeFileSync(join(tmpDir, "cocapn", "config.yml"), "soul: cocapn/soul.md\nconfig:\n  mode: local\n  port: 8787\nsync:\n  interval: 300\n  memoryInterval: 60\n  autoCommit: true\n  autoPush: false\nmemory:\n  facts: cocapn/memory/facts.json\n  procedures: cocapn/memory/procedures.json\n  relationships: cocapn/memory/relationships.json\n", "utf-8");
  for (const file of ["facts.json", "memories.json", "procedures.json", "relationships.json"]) {
    writeFileSync(join(tmpDir, "cocapn", "memory", file), "{}\n", "utf-8");
  }
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─── checkCocapnDir ─────────────────────────────────────────────────────────

describe("checkCocapnDir", () => {
  it("passes when cocapn/ exists", () => {
    const result = checkCocapnDir(tmpDir);
    expect(result.status).toBe("pass");
  });

  it("fails when cocapn/ is missing", () => {
    const empty = mkdtempSync(join(tmpdir(), "cocapn-doctor-empty-"));
    const result = checkCocapnDir(empty);
    expect(result.status).toBe("fail");
    expect(result.fixable).toBe(true);
    expect(result.fix).toBe("mkdir");
    rmSync(empty, { recursive: true, force: true });
  });

  it("fails when cocapn is a file not a directory", () => {
    writeFileSync(join(tmpDir, "cocapn-file"), "not a dir", "utf-8");
    // Rename the directory and create a file instead
    rmSync(join(tmpDir, "cocapn"), { recursive: true, force: true });
    writeFileSync(join(tmpDir, "cocapn"), "not a dir", "utf-8");
    const result = checkCocapnDir(tmpDir);
    expect(result.status).toBe("fail");
    expect(result.fixable).toBe(false);
  });
});

// ─── checkSubdirectories ────────────────────────────────────────────────────

describe("checkSubdirectories", () => {
  it("passes when all required dirs exist", () => {
    const result = checkSubdirectories(tmpDir);
    expect(result.status).toBe("pass");
  });

  it("warns when directories are missing", () => {
    rmSync(join(tmpDir, "cocapn", "memory"), { recursive: true, force: true });
    const result = checkSubdirectories(tmpDir);
    expect(result.status).toBe("warn");
    expect(result.message).toContain("cocapn/memory");
    expect(result.fixable).toBe(true);
  });
});

// ─── checkConfigYaml ────────────────────────────────────────────────────────

describe("checkConfigYaml", () => {
  it("passes with valid config", () => {
    const result = checkConfigYaml(tmpDir);
    expect(result.status).toBe("pass");
  });

  it("fails when no config.yml exists", () => {
    const empty = mkdtempSync(join(tmpdir(), "cocapn-doctor-cfg-"));
    const result = checkConfigYaml(empty);
    expect(result.status).toBe("fail");
    expect(result.fixable).toBe(true);
    expect(result.fix).toBe("default-config");
    rmSync(empty, { recursive: true, force: true });
  });

  it("fails when config.yml has invalid YAML", () => {
    // Use content that causes parseYaml to return null/empty
    writeFileSync(join(tmpDir, "cocapn", "config.yml"), ":\n  - [broken\n", "utf-8");
    const result = checkConfigYaml(tmpDir);
    // Parser may return null or invalid object for broken YAML
    expect(["fail", "warn"]).toContain(result.status);
  });

  it("warns when config has validation warnings", () => {
    // Minimal config missing required sections
    writeFileSync(join(tmpDir, "cocapn", "config.yml"), "soul: test\n", "utf-8");
    const result = checkConfigYaml(tmpDir);
    expect(result.status).toBe("warn");
  });
});

// ─── checkSoulMd ────────────────────────────────────────────────────────────

describe("checkSoulMd", () => {
  it("passes when soul.md exists with content", () => {
    const result = checkSoulMd(tmpDir);
    expect(result.status).toBe("pass");
    expect(result.message).toContain("lines");
  });

  it("warns when soul.md is missing", () => {
    rmSync(join(tmpDir, "cocapn", "soul.md"), { force: true });
    const result = checkSoulMd(tmpDir);
    expect(result.status).toBe("warn");
    expect(result.fixable).toBe(true);
    expect(result.fix).toBe("default-soul");
  });

  it("warns when soul.md is empty", () => {
    writeFileSync(join(tmpDir, "cocapn", "soul.md"), "", "utf-8");
    const result = checkSoulMd(tmpDir);
    expect(result.status).toBe("warn");
  });
});

// ─── checkBrainFiles ────────────────────────────────────────────────────────

describe("checkBrainFiles", () => {
  it("passes when all brain files are valid JSON", () => {
    const result = checkBrainFiles(tmpDir);
    expect(result.status).toBe("pass");
  });

  it("warns when brain files are missing", () => {
    rmSync(join(tmpDir, "cocapn", "memory", "facts.json"), { force: true });
    const result = checkBrainFiles(tmpDir);
    expect(result.status).toBe("warn");
    expect(result.message).toContain("facts.json");
    expect(result.fixable).toBe(true);
  });

  it("fails when brain files have invalid JSON", () => {
    writeFileSync(join(tmpDir, "cocapn", "memory", "facts.json"), "{broken json", "utf-8");
    const result = checkBrainFiles(tmpDir);
    expect(result.status).toBe("fail");
    expect(result.message).toContain("facts.json");
    expect(result.fixable).toBe(true);
    expect(result.fix).toBe("fix-json");
  });
});

// ─── checkGitRepo ───────────────────────────────────────────────────────────

describe("checkGitRepo", () => {
  it("fails when not a git repo", () => {
    const empty = mkdtempSync(join(tmpdir(), "cocapn-doctor-git-"));
    const result = checkGitRepo(empty);
    expect(result.status).toBe("fail");
    expect(result.message).toContain("Not a git repository");
    rmSync(empty, { recursive: true, force: true });
  });

  it("warns when no remote is configured", () => {
    mkdirSync(join(tmpDir, ".git"), { recursive: true });
    const result = checkGitRepo(tmpDir);
    expect(result.status).toBe("warn");
  });

  it("passes when git repo has remote", () => {
    mkdirSync(join(tmpDir, ".git"), { recursive: true });
    mkdirSync(join(tmpDir, ".git", "refs"), { recursive: true });
    mkdirSync(join(tmpDir, ".git", "objects"), { recursive: true });
    writeFileSync(join(tmpDir, ".git", "HEAD"), "ref: refs/heads/main\n", "utf-8");
    writeFileSync(
      join(tmpDir, ".git", "config"),
      '[remote "origin"]\n\turl = git@github.com:user/repo.git\n',
      "utf-8",
    );
    const result = checkGitRepo(tmpDir);
    expect(result.status).toBe("pass");
    expect(result.message).toContain("git@github.com");
  });
});

// ─── checkNodeVersion ───────────────────────────────────────────────────────

describe("checkNodeVersion", () => {
  it("passes with Node.js >= 18", () => {
    const result = checkNodeVersion();
    expect(result.status).toBe("pass");
    expect(result.message).toContain(process.version);
  });
});

// ─── checkLockFiles ─────────────────────────────────────────────────────────

describe("checkLockFiles", () => {
  it("passes when no stale lock files exist", () => {
    const result = checkLockFiles(tmpDir);
    expect(result.status).toBe("pass");
  });

  it("warns when stale lock files exist (>1h old)", () => {
    // Create a lock file and backdate its mtime
    const lockPath = join(tmpDir, "cocapn", ".bridge.lock");
    writeFileSync(lockPath, "locked", "utf-8");
    const now = Date.now();
    const oldTime = now - 2 * 60 * 60 * 1000; // 2 hours ago
    // Use utimes via stat workaround
    const { utimesSync } = require("fs") as typeof import("fs");
    utimesSync(lockPath, new Date(oldTime), new Date(oldTime));

    const result = checkLockFiles(tmpDir);
    expect(result.status).toBe("warn");
    expect(result.message).toContain(".bridge.lock");
    expect(result.fixable).toBe(true);
  });
});

// ─── checkApiKeys ───────────────────────────────────────────────────────────

describe("checkApiKeys", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Remove API keys from env
    process.env = { ...originalEnv };
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("warns when no API keys are set", () => {
    const result = checkApiKeys();
    expect(result.status).toBe("warn");
    expect(result.message).toContain("No LLM API keys");
  });

  it("warns when some API keys are missing", () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    const result = checkApiKeys();
    expect(result.status).toBe("warn");
    expect(result.message).toContain("DEEPSEEK_API_KEY");
  });

  it("passes when at least one API key is set (no missing)", () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const result = checkApiKeys();
    expect(result.status).toBe("pass");
  });

  it("ignores empty string API keys", () => {
    process.env.DEEPSEEK_API_KEY = "";
    const result = checkApiKeys();
    expect(result.status).toBe("warn");
  });
});

// ─── checkBridgePort ────────────────────────────────────────────────────────

describe("checkBridgePort", () => {
  it("resolves with a status", async () => {
    const result = await checkBridgePort();
    expect(["pass", "fail"]).toContain(result.status);
    expect(result.id).toBe("bridge-port");
  });
});

// ─── Fix functions ──────────────────────────────────────────────────────────

describe("fixMissingDirectories", () => {
  it("creates missing required directories", () => {
    rmSync(join(tmpDir, "cocapn", "memory"), { recursive: true, force: true });
    rmSync(join(tmpDir, "cocapn", "wiki"), { recursive: true, force: true });
    const fixes = fixMissingDirectories(tmpDir);
    expect(fixes.length).toBeGreaterThanOrEqual(2);
    expect(existsSync(join(tmpDir, "cocapn", "memory"))).toBe(true);
    expect(existsSync(join(tmpDir, "cocapn", "wiki"))).toBe(true);
  });

  it("does nothing when all directories exist", () => {
    const fixes = fixMissingDirectories(tmpDir);
    expect(fixes.length).toBe(0);
  });
});

describe("fixDefaultConfig", () => {
  it("creates default config when none exists", () => {
    const empty = mkdtempSync(join(tmpdir(), "cocapn-doctor-fix-"));
    mkdirSync(join(empty, "cocapn"), { recursive: true });
    // No config.yml
    const fixes = fixDefaultConfig(empty);
    expect(fixes.length).toBe(1);
    expect(existsSync(join(empty, "cocapn", "config.yml"))).toBe(true);
    const content = readFileSync(join(empty, "cocapn", "config.yml"), "utf-8");
    expect(content).toContain("mode:");
    rmSync(empty, { recursive: true, force: true });
  });

  it("does nothing when config already exists", () => {
    const fixes = fixDefaultConfig(tmpDir);
    expect(fixes.length).toBe(0);
  });
});

describe("fixDefaultSoul", () => {
  it("creates default soul.md when missing", () => {
    rmSync(join(tmpDir, "cocapn", "soul.md"), { force: true });
    const fixes = fixDefaultSoul(tmpDir);
    expect(fixes.length).toBe(1);
    expect(existsSync(join(tmpDir, "cocapn", "soul.md"))).toBe(true);
    const content = readFileSync(join(tmpDir, "cocapn", "soul.md"), "utf-8");
    expect(content).toContain("# Soul");
  });

  it("replaces empty soul.md", () => {
    writeFileSync(join(tmpDir, "cocapn", "soul.md"), "", "utf-8");
    const fixes = fixDefaultSoul(tmpDir);
    expect(fixes.length).toBe(1);
  });

  it("does nothing when soul.md has content", () => {
    const fixes = fixDefaultSoul(tmpDir);
    expect(fixes.length).toBe(0);
  });
});

describe("fixBrainFiles", () => {
  it("creates missing brain files", () => {
    rmSync(join(tmpDir, "cocapn", "memory", "facts.json"), { force: true });
    const fixes = fixBrainFiles(tmpDir);
    expect(fixes.some((f) => f.includes("facts.json"))).toBe(true);
    expect(existsSync(join(tmpDir, "cocapn", "memory", "facts.json"))).toBe(true);
    const content = readFileSync(join(tmpDir, "cocapn", "memory", "facts.json"), "utf-8");
    expect(JSON.parse(content)).toEqual({});
  });

  it("fixes invalid JSON files", () => {
    writeFileSync(join(tmpDir, "cocapn", "memory", "memories.json"), "not json{", "utf-8");
    const fixes = fixBrainFiles(tmpDir);
    expect(fixes.some((f) => f.includes("memories.json") && f.includes("invalid JSON"))).toBe(true);
    const content = readFileSync(join(tmpDir, "cocapn", "memory", "memories.json"), "utf-8");
    expect(JSON.parse(content)).toEqual({});
  });

  it("does nothing when all files are valid", () => {
    const fixes = fixBrainFiles(tmpDir);
    expect(fixes.length).toBe(0);
  });
});

describe("fixLockFiles", () => {
  it("removes stale lock files", () => {
    const lockPath = join(tmpDir, "cocapn", ".bridge.lock");
    writeFileSync(lockPath, "locked", "utf-8");
    const oldTime = Date.now() - 2 * 60 * 60 * 1000;
    const { utimesSync } = require("fs") as typeof import("fs");
    utimesSync(lockPath, new Date(oldTime), new Date(oldTime));

    const fixes = fixLockFiles(tmpDir);
    expect(fixes.length).toBe(1);
    expect(fixes[0]).toContain("Removed stale");
    expect(existsSync(lockPath)).toBe(false);
  });

  it("does nothing when no stale lock files", () => {
    const fixes = fixLockFiles(tmpDir);
    expect(fixes.length).toBe(0);
  });
});

// ─── runDiagnostics ─────────────────────────────────────────────────────────

describe("runDiagnostics", () => {
  it("returns all checks", async () => {
    const result = await runDiagnostics(tmpDir);
    expect(result.checks.length).toBe(10);
    expect(result.fixes.length).toBe(0);
    expect(result.checks.map((c) => c.id)).toEqual([
      "node-version",
      "cocapn-dir",
      "subdirectories",
      "config-yaml",
      "soul-md",
      "brain-files",
      "git-repo",
      "lock-files",
      "api-keys",
      "bridge-port",
    ]);
  });

  it("returns failures for empty directory", async () => {
    const empty = mkdtempSync(join(tmpdir(), "cocapn-doctor-empty2-"));
    const result = await runDiagnostics(empty);
    expect(result.checks.some((c) => c.status === "fail")).toBe(true);
    rmSync(empty, { recursive: true, force: true });
  });
});

// ─── runFixes ───────────────────────────────────────────────────────────────

describe("runFixes", () => {
  it("applies fixes for fixable issues", async () => {
    // Create a broken project
    const broken = mkdtempSync(join(tmpdir(), "cocapn-doctor-fix2-"));
    mkdirSync(join(broken, "cocapn", "memory"), { recursive: true });
    writeFileSync(join(broken, "cocapn", "memory", "facts.json"), "{invalid", "utf-8");

    const diagnostics = await runDiagnostics(broken);
    const result = runFixes(broken, diagnostics);
    expect(result.fixes.length).toBeGreaterThan(0);

    // Verify facts.json was fixed
    const content = readFileSync(join(broken, "cocapn", "memory", "facts.json"), "utf-8");
    expect(() => JSON.parse(content)).not.toThrow();

    rmSync(broken, { recursive: true, force: true });
  });

  it("returns empty fixes when nothing is fixable", async () => {
    const result = await runDiagnostics(tmpDir);
    const fixed = runFixes(tmpDir, result);
    // Most checks should pass in a valid project
    expect(fixed.fixes.length).toBe(0);
  });
});
