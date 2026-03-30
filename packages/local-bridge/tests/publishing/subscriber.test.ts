/**
 * Tests for Subscriber — pulls face repo changes into brain awareness.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { simpleGit } from "simple-git";
import { Subscriber, type SubscribeResult } from "../../src/publishing/subscriber.js";
import type { Brain } from "../../src/brain/index.js";

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

function makeStubBrain(buildIndexCalled?: { value: boolean }): Brain {
  return {
    getRepoLearner: () => ({
      buildIndex: async () => {
        if (buildIndexCalled) buildIndexCalled.value = true;
        return {};
      },
      onCommit: async () => {},
    }),
  } as unknown as Brain;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Subscriber", () => {
  let privateDir: string;
  let publicDir: string;

  beforeEach(async () => {
    privateDir = await makeGitRepo("sub-priv-");
    publicDir = await makeGitRepo("sub-pub-");
  });

  afterEach(() => {
    rmSync(privateDir, { recursive: true, force: true });
    rmSync(publicDir, { recursive: true, force: true });
  });

  it("returns pulled=false when no remote configured", async () => {
    const subscriber = new Subscriber({
      privateRepoRoot: privateDir,
      publicRepoRoot: publicDir,
      brain: makeStubBrain(),
    });

    const result = await subscriber.subscribe();
    expect(result.pulled).toBe(false);
  });

  it("reports no changes when face repo has no remote", async () => {
    const subscriber = new Subscriber({
      privateRepoRoot: privateDir,
      publicRepoRoot: publicDir,
      brain: makeStubBrain(),
    });

    const result = await subscriber.subscribe();
    expect(result.changedFiles).toEqual([]);
    expect(result.repoLearnerUpdated).toBe(false);
    expect(result.summary).toBeTruthy();
  });

  it("detects changes when face repo has new commits via remote", async () => {
    // Create a "remote" as a bare repo
    const remoteDir = mkdtempSync(join(tmpdir(), "sub-remote-"));
    const remoteGit = simpleGit(remoteDir);
    await remoteGit.init(["--bare"]);

    // Clone face repo from remote
    const faceDir = mkdtempSync(join(tmpdir(), "sub-face-"));
    const git = simpleGit();
    await git.clone(remoteDir, faceDir);
    const faceGit = simpleGit(faceDir);
    await faceGit.addConfig("user.name", "Test");
    await faceGit.addConfig("user.email", "test@test.com");

    // Initial commit on face
    writeFileSync(join(faceDir, "index.html"), "<h1>Hello</h1>");
    await faceGit.add(".");
    await faceGit.commit("initial");
    await faceGit.push("origin", "main");

    // Now add a second commit to the remote directly (simulating external change)
    // We'll use a second clone to push changes
    const otherClone = mkdtempSync(join(tmpdir(), "sub-other-"));
    await git.clone(remoteDir, otherClone);
    const otherGit = simpleGit(otherClone);
    await otherGit.addConfig("user.name", "Other");
    await otherGit.addConfig("user.email", "other@test.com");
    writeFileSync(join(otherClone, "new-feature.ts"), "export const x = 1;");
    await otherGit.add(".");
    await otherGit.commit("add feature");
    await otherGit.push("origin", "main");

    // Subscriber should detect the change when pulling
    const buildIndexCalled = { value: false };
    const subscriber = new Subscriber({
      privateRepoRoot: privateDir,
      publicRepoRoot: faceDir,
      brain: makeStubBrain(buildIndexCalled),
    });

    const result = await subscriber.subscribe();
    expect(result.pulled).toBe(true);
    expect(result.changedFiles.length).toBeGreaterThan(0);
    expect(result.repoLearnerUpdated).toBe(true);

    // Cleanup extra dirs
    rmSync(remoteDir, { recursive: true, force: true });
    rmSync(faceDir, { recursive: true, force: true });
    rmSync(otherClone, { recursive: true, force: true });
  });

  it("handles pull failure gracefully", async () => {
    // Face repo with a "remote" that doesn't exist
    const faceDir = await makeGitRepo("sub-face-noremote-");
    const faceGit = simpleGit(faceDir);
    await faceGit.addRemote("origin", "https://nonexistent-host-xyz.invalid/repo.git");

    const subscriber = new Subscriber({
      privateRepoRoot: privateDir,
      publicRepoRoot: faceDir,
      brain: makeStubBrain(),
    });

    // Should not throw, just report failure
    const result = await subscriber.subscribe();
    expect(result.pulled).toBe(false);

    rmSync(faceDir, { recursive: true, force: true });
  });
});
