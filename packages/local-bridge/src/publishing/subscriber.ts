/**
 * Subscriber — pulls public face repo changes into private brain awareness.
 *
 * When the face repo receives changes (new code, new features, deployment
 * artifacts), the subscriber makes the brain aware so RepoLearner can index
 * them and the agent can reason about its public-facing surface.
 *
 * Steps:
 *   1. Record face repo HEAD before pull
 *   2. Pull latest from face repo remote
 *   3. Diff HEAD before/after to detect changed files
 *   4. Update RepoLearner index with new face repo content
 *   5. Return change report
 */

import { simpleGit } from "simple-git";
import type { Brain } from "../brain/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubscribeResult {
  /** Whether a pull was performed (remote exists + succeeded). */
  pulled: boolean;
  /** Files added in the face repo since last subscribe. */
  newFiles: string[];
  /** Files modified in the face repo since last subscribe. */
  changedFiles: string[];
  /** Whether RepoLearner was refreshed. */
  repoLearnerUpdated: boolean;
  /** Human-readable summary. */
  summary: string;
}

export interface SubscriberOptions {
  /** Root of the private brain repo. */
  privateRepoRoot: string;
  /** Root of the public face repo. */
  publicRepoRoot: string;
  /** Brain instance for RepoLearner access. */
  brain: Brain;
}

// ─── Subscriber ───────────────────────────────────────────────────────────────

export class Subscriber {
  private publicRepoRoot: string;
  private brain: Brain;

  constructor(options: SubscriberOptions) {
    this.publicRepoRoot = options.publicRepoRoot;
    this.brain = options.brain;
  }

  /** Pull face repo changes and update brain awareness. */
  async subscribe(): Promise<SubscribeResult> {
    const git = simpleGit(this.publicRepoRoot);

    // 1. Record current HEAD
    let beforeSha: string | undefined;
    try {
      const log = await git.log({ maxCount: 1 });
      beforeSha = log.latest?.hash;
    } catch {
      // Repo may have no commits yet
    }

    // 2. Pull from remote
    let pulled = false;
    try {
      const remotes = await git.getRemotes();
      if (remotes.length > 0) {
        await git.pull();
        pulled = true;
      }
    } catch {
      // Pull failed (no remote, merge conflict, network) — non-fatal
    }

    // 3. Get new HEAD
    let afterSha: string | undefined;
    try {
      const log = await git.log({ maxCount: 1 });
      afterSha = log.latest?.hash;
    } catch {
      // Repo may have no commits
    }

    // 4. Detect changed files between before and after
    const changedFiles: string[] = [];
    const newFiles: string[] = [];

    if (pulled && beforeSha && afterSha && beforeSha !== afterSha) {
      try {
        const diff = await git.diffSummary([beforeSha, afterSha]);
        for (const file of diff.files) {
          if (file.file) {
            changedFiles.push(file.file);
          }
        }
      } catch {
        // Diff failed — non-fatal
      }
    }

    // 5. Update RepoLearner
    let repoLearnerUpdated = false;
    if (changedFiles.length > 0) {
      try {
        const repoLearner = this.brain.getRepoLearner();
        await repoLearner.buildIndex();
        repoLearnerUpdated = true;
      } catch {
        // RepoLearner refresh failed — non-fatal
      }
    }

    const totalChanges = changedFiles.length;
    const parts: string[] = [];
    if (pulled) parts.push("pulled");
    if (totalChanges > 0) parts.push(`${totalChanges} file(s) changed`);
    if (repoLearnerUpdated) parts.push("RepoLearner updated");

    return {
      pulled,
      newFiles,
      changedFiles,
      repoLearnerUpdated,
      summary:
        parts.length > 0
          ? parts.join(", ")
          : "No remote configured or no changes",
    };
  }
}
