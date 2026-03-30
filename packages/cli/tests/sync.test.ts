/**
 * Tests for cocapn sync command
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import {
  parseStatusPorcelain,
  getRepoStatus,
  autoCommit,
  pushRepo,
  pullRepo,
  resolveRepoPaths,
  syncRepo,
  printRepoStatus,
  type SyncRepoStatus,
} from "../src/commands/sync.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

const testDir = join(process.cwd(), ".test-sync-tmp");
const privateDir = join(testDir, "brain");
const publicDir = join(testDir, "alice.makerlog.ai");

function initGitRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  exec("git init -b main", dir);
  exec('git config user.email "test@test.com"', dir);
  exec('git config user.name "Test"', dir);
}

function exec(cmd: string, cwd: string): string {
  const { execSync } = require("child_process") as typeof import("child_process");
  try {
    return execSync(cmd, { cwd, encoding: "utf-8", timeout: 10_000 }).trim();
  } catch {
    return "";
  }
}

function setupRepos(): void {
  rmSync(testDir, { recursive: true, force: true });

  // Private (brain) repo
  initGitRepo(privateDir);
  const cocapnDir = join(privateDir, "cocapn");
  mkdirSync(join(cocapnDir, "memory"), { recursive: true });
  writeFileSync(join(cocapnDir, "soul.md"), "# Test Soul\n\nI am a test agent.");
  writeFileSync(join(cocapnDir, "memory", "facts.json"), JSON.stringify({ "user.name": "Alice" }));
  exec("git add -A", privateDir);
  exec('git commit -m "init brain"', privateDir);

  // Public (face) repo
  initGitRepo(publicDir);
  writeFileSync(join(publicDir, "cocapn.yml"), "name: test");
  writeFileSync(join(publicDir, "index.html"), "<html><body>hello</body></html>");
  exec("git add -A", publicDir);
  exec('git commit -m "init face"', publicDir);
}

function cleanup(): void {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

// ─── parseStatusPorcelain ──────────────────────────────────────────────────

describe("parseStatusPorcelain", () => {
  it("parses empty output", () => {
    expect(parseStatusPorcelain("")).toEqual([]);
  });

  it("parses modified files", () => {
    const output = " M src/foo.ts\n M src/bar.ts";
    expect(parseStatusPorcelain(output)).toEqual(["src/foo.ts", "src/bar.ts"]);
  });

  it("parses untracked files", () => {
    const output = "?? newfile.ts\n?? another.ts";
    expect(parseStatusPorcelain(output)).toEqual(["newfile.ts", "another.ts"]);
  });

  it("parses staged files", () => {
    const output = "A  staged.ts\nD  deleted.ts\nR  old.ts -> new.ts";
    const result = parseStatusPorcelain(output);
    expect(result).toContain("staged.ts");
    expect(result).toContain("deleted.ts");
    expect(result).toContain("new.ts");
  });

  it("handles mixed status", () => {
    const output = " M modified.ts\n?? untracked.ts\nA  staged.ts\nD  gone.ts";
    const result = parseStatusPorcelain(output);
    expect(result).toHaveLength(4);
  });
});

// ─── getRepoStatus ─────────────────────────────────────────────────────────

describe("getRepoStatus", () => {
  beforeEach(() => setupRepos());
  afterEach(() => cleanup());

  it("returns clean status for committed repo", () => {
    const status = getRepoStatus(privateDir);
    expect(status.clean).toBe(true);
    expect(status.changedFiles).toEqual([]);
    expect(status.branch).toBe("main");
  });

  it("detects uncommitted changes", () => {
    writeFileSync(join(privateDir, "cocapn", "new-file.md"), "test");
    const status = getRepoStatus(privateDir);
    expect(status.clean).toBe(false);
    expect(status.changedFiles.length).toBeGreaterThan(0);
    expect(status.changedFiles.some((f) => f.includes("new-file.md"))).toBe(true);
  });

  it("detects no remote by default", () => {
    const status = getRepoStatus(privateDir);
    expect(status.hasRemote).toBe(false);
  });

  it("returns last commit info", () => {
    const status = getRepoStatus(privateDir);
    expect(status.lastCommitMsg).toBe("init brain");
  });

  it("returns ahead=0 behind=0 with no remote", () => {
    const status = getRepoStatus(privateDir);
    expect(status.ahead).toBe(0);
    expect(status.behind).toBe(0);
  });
});

// ─── autoCommit ────────────────────────────────────────────────────────────

describe("autoCommit", () => {
  beforeEach(() => setupRepos());
  afterEach(() => cleanup());

  it("returns null when no changes", () => {
    const result = autoCommit(privateDir, "test commit");
    expect(result).toBeNull();
  });

  it("commits changes and returns file list", () => {
    writeFileSync(join(privateDir, "cocapn", "change.md"), "new content");
    const result = autoCommit(privateDir, "test commit");
    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThan(0);
  });

  it("creates a git commit with the given message", () => {
    writeFileSync(join(privateDir, "cocapn", "change.md"), "new content");
    autoCommit(privateDir, "sync test message");
    const lastMsg = exec('git log -1 --format="%s"', privateDir);
    expect(lastMsg).toBe("sync test message");
  });

  it("handles multiple files", () => {
    writeFileSync(join(privateDir, "a.txt"), "a");
    writeFileSync(join(privateDir, "b.txt"), "b");
    writeFileSync(join(privateDir, "c.txt"), "c");
    const result = autoCommit(privateDir, "multi file commit");
    expect(result).not.toBeNull();
    expect(result!.length).toBe(3);
  });
});

// ─── pushRepo / pullRepo ──────────────────────────────────────────────────

describe("pushRepo", () => {
  beforeEach(() => setupRepos());
  afterEach(() => cleanup());

  it("returns false when no remote configured", () => {
    const result = pushRepo(privateDir);
    expect(result).toBe(false);
  });
});

describe("pullRepo", () => {
  beforeEach(() => setupRepos());
  afterEach(() => cleanup());

  it("returns false when no remote configured", () => {
    const result = pullRepo(privateDir);
    expect(result).toBe(false);
  });
});

// ─── resolveRepoPaths ──────────────────────────────────────────────────────

describe("resolveRepoPaths", () => {
  beforeEach(() => setupRepos());
  afterEach(() => cleanup());

  it("detects private repo when in brain directory", () => {
    const { privatePath } = resolveRepoPaths(privateDir);
    expect(privatePath).toBe(privateDir);
  });

  it("detects public repo when in face directory", () => {
    const { publicPath } = resolveRepoPaths(publicDir);
    expect(publicPath).toBe(publicDir);
  });

  it("finds sibling public repo from brain directory", () => {
    const { publicPath } = resolveRepoPaths(privateDir);
    expect(publicPath).toBe(publicDir);
  });

  it("returns nulls when not in a cocapn directory", () => {
    const { privatePath } = resolveRepoPaths(testDir);
    expect(privatePath).toBeNull();
  });
});

// ─── syncRepo ──────────────────────────────────────────────────────────────

describe("syncRepo", () => {
  beforeEach(() => setupRepos());
  afterEach(() => cleanup());

  it("syncs a clean repo (no changes)", () => {
    const result = syncRepo(privateDir, "private", "[cocapn] test");
    expect(result.committed).toBe(false);
    expect(result.files).toEqual([]);
    expect(result.repo).toBe("private");
  });

  it("syncs a dirty repo (commits changes)", () => {
    writeFileSync(join(privateDir, "cocapn", "dirty.md"), "dirty");
    const result = syncRepo(privateDir, "private", "[cocapn] test");
    expect(result.committed).toBe(true);
    expect(result.files.length).toBeGreaterThan(0);
  });

  it("pushed is false when no remote configured", () => {
    const result = syncRepo(privateDir, "private", "[cocapn] test");
    expect(result.pushed).toBe(false);
  });
});

// ─── printRepoStatus ──────────────────────────────────────────────────────

describe("printRepoStatus", () => {
  it("prints clean status without throwing", () => {
    const status: SyncRepoStatus = {
      path: "/tmp/test",
      branch: "main",
      clean: true,
      changedFiles: [],
      hasRemote: false,
      ahead: 0,
      behind: 0,
      lastCommitMsg: "init",
      lastCommitDate: "2 hours ago",
    };
    expect(() => printRepoStatus("Test", status)).not.toThrow();
  });

  it("prints dirty status with files", () => {
    const status: SyncRepoStatus = {
      path: "/tmp/test",
      branch: "main",
      clean: false,
      changedFiles: ["foo.ts", "bar.ts"],
      hasRemote: true,
      ahead: 2,
      behind: 1,
      lastCommitMsg: "feat: add thing",
      lastCommitDate: "5 min ago",
    };
    expect(() => printRepoStatus("Test", status)).not.toThrow();
  });
});

// ─── Conflict detection ────────────────────────────────────────────────────

describe("conflict handling", () => {
  beforeEach(() => setupRepos());
  afterEach(() => cleanup());

  it("syncRepo handles repos with simulated conflict markers", () => {
    // Create a file with conflict markers to simulate a conflict state
    const conflictedFile = join(privateDir, "conflict.md");
    writeFileSync(conflictedFile, "<<<<<<< HEAD\ncontent\n=======\nother\n>>>>>>> branch\n");

    // The sync should still work (conflict detection uses git ls-files -u, not file content)
    const result = syncRepo(privateDir, "private", "[cocapn] test");
    expect(result.repo).toBe("private");
  });
});

// ─── End-to-end: sync both repos ───────────────────────────────────────────

describe("end-to-end sync", () => {
  beforeEach(() => setupRepos());
  afterEach(() => cleanup());

  it("can sync both repos with changes", () => {
    // Make changes in both repos
    writeFileSync(join(privateDir, "cocapn", "brain-update.md"), "brain change");
    writeFileSync(join(publicDir, "face-update.html"), "<html>face change</html>");

    const brainResult = syncRepo(privateDir, "private", "[cocapn] brain sync");
    const faceResult = syncRepo(publicDir, "public", "[cocapn] face sync");

    expect(brainResult.committed).toBe(true);
    expect(faceResult.committed).toBe(true);
  });

  it("handles one clean and one dirty repo", () => {
    writeFileSync(join(privateDir, "cocapn", "update.md"), "update");

    const brainResult = syncRepo(privateDir, "private", "[cocapn] brain sync");
    const faceResult = syncRepo(publicDir, "public", "[cocapn] face sync");

    expect(brainResult.committed).toBe(true);
    expect(faceResult.committed).toBe(false);
  });
});
