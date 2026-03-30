/**
 * GitKnowledgePipeline — versioned knowledge store backed by git.
 *
 * Each knowledge entry is stored as a JSON file at:
 *   cocapn/knowledge/{type}/{id}.json
 *
 * Extends KnowledgePipeline with git-aware operations: commit, pull, push, diff.
 * Git is the training pipeline — clone it, it works.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "fs";
import { join, relative } from "path";
import { simpleGit, type SimpleGit } from "simple-git";
import {
  KnowledgePipeline,
  type KnowledgeEntry,
  type KnowledgeMeta,
  type KnowledgeType,
} from "./pipeline.js";

const KNOWLEDGE_DIR = "cocapn/knowledge";

export class GitKnowledgePipeline extends KnowledgePipeline {
  private git: SimpleGit;
  private repoRoot: string;
  private knowledgeRoot: string;

  constructor(repoRoot: string) {
    super();
    this.repoRoot = repoRoot;
    this.knowledgeRoot = join(repoRoot, KNOWLEDGE_DIR);
    this.git = simpleGit(repoRoot);
  }

  // ─── Ingest (overrides base to write to disk) ─────────────────────────────

  /**
   * Ingest a knowledge entry and persist it as a JSON file on disk.
   * Does NOT auto-commit — call commit() explicitly.
   */
  async ingest(file: Buffer, metadata: KnowledgeMeta): Promise<KnowledgeEntry> {
    const entry = await super.ingest(file, metadata);
    this.writeEntry(entry);
    return entry;
  }

  // ─── Load ──────────────────────────────────────────────────────────────────

  /**
   * Load all knowledge entries from disk into memory.
   * Call this after construction or after a pull.
   */
  async load(): Promise<void> {
    this.ensureDir();

    for (const typeDir of this.typeDirs()) {
      if (!existsSync(typeDir)) continue;
      for (const file of readdirSync(typeDir)) {
        if (!file.endsWith(".json")) continue;
        try {
          const raw = readFileSync(join(typeDir, file), "utf-8");
          const entry: KnowledgeEntry = JSON.parse(raw);
          this.setEntry(entry);
        } catch {
          // Skip malformed entries
        }
      }
    }
  }

  // ─── Git operations ────────────────────────────────────────────────────────

  /**
   * Stage and commit all changed knowledge files.
   * Returns the commit SHA, or undefined if nothing changed.
   */
  async commit(message?: string): Promise<string | undefined> {
    const status = await this.git.status();

    const knowledgeFiles = status.files
      .filter(f => f.path.startsWith(KNOWLEDGE_DIR))
      .map(f => f.path);

    if (knowledgeFiles.length === 0) return undefined;

    await this.git.add(KNOWLEDGE_DIR);
    const result = await this.git.commit(
      message ?? `[cocapn] knowledge update — ${knowledgeFiles.length} file(s)`,
    );
    return result.commit;
  }

  /**
   * Pull latest knowledge from upstream.
   * After pull, reloads entries from disk.
   */
  async pull(): Promise<void> {
    await this.git.pull("origin", await this.currentBranch());
    await this.load();
  }

  /**
   * Push local knowledge commits to remote.
   */
  async push(): Promise<void> {
    await this.git.push("origin", await this.currentBranch());
  }

  /**
   * List knowledge files changed since a given commit.
   * Returns objects with path, status, and parsed entry (if parseable).
   */
  async diff(since: string): Promise<Array<{ path: string; status: string; entry?: KnowledgeEntry }>> {
    const result = await this.git.diffSummary([since, "HEAD", "--", KNOWLEDGE_DIR]);
    const changed: Array<{ path: string; status: string; entry?: KnowledgeEntry }> = [];

    for (const file of result.files) {
      const fullPath = join(this.repoRoot, file.file);
      const absPath = file.file;

      let status = "modified";
      if (!existsSync(fullPath)) {
        status = "deleted";
      }

      let entry: KnowledgeEntry | undefined;
      if (status !== "deleted") {
        try {
          const raw = readFileSync(fullPath, "utf-8");
          entry = JSON.parse(raw);
        } catch {
          // Malformed — still report the change
        }
      }

      changed.push({ path: absPath, status, entry });
    }

    return changed;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  private async currentBranch(): Promise<string> {
    return (await this.git.revparse(["--abbrev-ref", "HEAD"])).trim();
  }

  private writeEntry(entry: KnowledgeEntry): void {
    this.ensureDir();
    const dir = join(this.knowledgeRoot, entry.type);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${entry.id}.json`), JSON.stringify(entry, null, 2), "utf-8");
  }

  private ensureDir(): void {
    mkdirSync(this.knowledgeRoot, { recursive: true });
  }

  private typeDirs(): string[] {
    const types: KnowledgeType[] = ['species', 'regulation', 'technique', 'location', 'equipment'];
    return types.map(t => join(this.knowledgeRoot, t));
  }
}
