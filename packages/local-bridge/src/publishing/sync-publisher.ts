/**
 * SyncPublisher — full brain → face sync pipeline.
 *
 * Takes content from the private brain repo, filters through PublishingFilter
 * and Sanitizer, then writes public-safe content to the face repo.
 *
 * Steps:
 *   1. Read brain content (facts, soul, wiki, tasks, memories)
 *   2. Filter private.* facts and sanitize PII
 *   3. Compile public soul.md (strip private sections)
 *   4. Sanitize wiki pages and tasks
 *   5. Write public-safe content to face repo cocapn/public-* files
 *   6. Git commit (and optionally push) to face repo
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { simpleGit } from "simple-git";
import { PublishingFilter } from "./filter.js";
import { Sanitizer } from "./sanitizer.js";
import type { Brain, Task, WikiPage, MemoryEntry } from "../brain/index.js";
import type { AgentMode } from "./mode-switcher.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PublishResult {
  /** Files written to the face repo (repo-relative paths). */
  published: string[];
  /** Content keys/files that were filtered out for privacy. */
  filtered: string[];
  /** Fact keys that were stripped (private.* / sensitive.*). */
  filteredFacts: string[];
  /** Whether a commit was made to the face repo. */
  committed: boolean;
  /** Whether the push to remote succeeded. */
  pushed: boolean;
  /** Human-readable summary. */
  summary: string;
}

export interface SyncPublisherOptions {
  privateRepoRoot: string;
  publicRepoRoot: string;
  brain: Brain;
}

// ─── SyncPublisher ────────────────────────────────────────────────────────────

export class SyncPublisher {
  private privateRepoRoot: string;
  private publicRepoRoot: string;
  private brain: Brain;
  private filter: PublishingFilter;
  private sanitizer: Sanitizer;

  constructor(options: SyncPublisherOptions) {
    this.privateRepoRoot = options.privateRepoRoot;
    this.publicRepoRoot = options.publicRepoRoot;
    this.brain = options.brain;
    this.filter = new PublishingFilter();
    this.sanitizer = new Sanitizer();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Run the full publish pipeline: read → filter → write → commit → push. */
  async publish(): Promise<PublishResult> {
    return this.runSync(false);
  }

  /** Same as publish() but skips writing — returns what WOULD be published. */
  async dryRun(): Promise<PublishResult> {
    return this.runSync(true);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async runSync(dryRun: boolean): Promise<PublishResult> {
    const filtered: string[] = [];
    const filteredFacts: string[] = [];

    // ── 1. Facts ────────────────────────────────────────────────────────────
    const allFacts = this.brain.getAllFacts("public" as AgentMode);
    const publicFacts = this.filter.filterAndSanitizeFacts(allFacts);
    for (const key of Object.keys(allFacts)) {
      if (!(key in publicFacts)) {
        filteredFacts.push(key);
        filtered.push(`fact:${key}`);
      }
    }

    // ── 2. Soul ─────────────────────────────────────────────────────────────
    const soul = this.brain.getSoul();
    const publicSoul = this.compilePublicSoul(soul);

    // ── 3. Wiki ─────────────────────────────────────────────────────────────
    const wikiPages = this.brain.listWikiPages();
    const publicWiki: Map<string, string> = new Map();
    for (const page of wikiPages) {
      const raw = this.brain.readWikiPage(page.file, "public" as AgentMode);
      if (raw !== null) {
        publicWiki.set(page.file, this.sanitizer.sanitizeWikiPage(raw));
      }
    }

    // ── 4. Tasks ────────────────────────────────────────────────────────────
    const tasks = this.brain.listTasks();
    const publicTasks = tasks.map((t) => this.sanitizer.sanitizeTask(t));

    // ── 5. Memories ─────────────────────────────────────────────────────────
    const memories = this.brain.getMemories({ mode: "public" as AgentMode });
    const publicMemories = this.filter.filterEntries(memories);
    if (memories.length !== publicMemories.length) {
      filtered.push(
        `memories:${memories.length - publicMemories.length} filtered`
      );
    }

    // ── Dry-run short-circuit ───────────────────────────────────────────────
    if (dryRun) {
      const planned = this.buildFileList(
        publicFacts,
        publicSoul,
        publicWiki,
        publicTasks,
        publicMemories
      );
      return {
        published: planned,
        filtered,
        filteredFacts,
        committed: false,
        pushed: false,
        summary: `[dry-run] Would publish ${planned.length} files, filter ${filteredFacts.length} private facts`,
      };
    }

    // ── 6. Write to face repo ───────────────────────────────────────────────
    const published = this.writeToFace(
      publicFacts,
      publicSoul,
      publicWiki,
      publicTasks,
      publicMemories
    );

    // ── 7. Commit ───────────────────────────────────────────────────────────
    let committed = false;
    let pushed = false;

    if (published.length > 0) {
      try {
        const git = simpleGit(this.publicRepoRoot);
        for (const file of published) {
          await git.add(file);
        }
        await git.commit(
          `cocapn: brain → face sync (${published.length} files)`
        );
        committed = true;
      } catch {
        // Nothing to commit or git error — non-fatal
      }

      // ── 8. Push ─────────────────────────────────────────────────────────
      if (committed) {
        try {
          const git = simpleGit(this.publicRepoRoot);
          const remotes = await git.getRemotes();
          if (remotes.length > 0) {
            await git.push();
            pushed = true;
          }
        } catch {
          // Push failed — non-fatal
        }
      }
    }

    return {
      published,
      filtered,
      filteredFacts,
      committed,
      pushed,
      summary: `Published ${published.length} files, filtered ${filteredFacts.length} private facts`,
    };
  }

  // ---------------------------------------------------------------------------
  // Public soul compiler
  // ---------------------------------------------------------------------------

  /**
   * Compile a public version of soul.md.
   *
   * Strips:
   *   - Sections between <!-- private --> and <!-- /private --> markers
   *   - PII (emails, phones, API keys) via PublishingFilter
   */
  compilePublicSoul(soul: string): string {
    let out = soul.replace(
      /<!--\s*private\s*-->[\s\S]*?<!--\s*\/private\s*-->/gi,
      ""
    );
    out = this.filter.sanitizeResponse(out);
    return out.trim();
  }

  // ---------------------------------------------------------------------------
  // File list (shared between dry-run and real publish)
  // ---------------------------------------------------------------------------

  private buildFileList(
    facts: Record<string, string>,
    soul: string,
    wiki: Map<string, string>,
    tasks: PublicTask[],
    memories: MemoryEntry[]
  ): string[] {
    const files: string[] = [];
    if (Object.keys(facts).length > 0) files.push("cocapn/public-facts.json");
    if (soul.length > 0) files.push("cocapn/public-soul.md");
    for (const name of wiki.keys()) {
      files.push(`cocapn/public-wiki/${name}`);
    }
    if (tasks.length > 0) files.push("cocapn/public-tasks.json");
    if (memories.length > 0) files.push("cocapn/public-memories.json");
    return files;
  }

  // ---------------------------------------------------------------------------
  // Write to face repo
  // ---------------------------------------------------------------------------

  private writeToFace(
    facts: Record<string, string>,
    soul: string,
    wiki: Map<string, string>,
    tasks: PublicTask[],
    memories: MemoryEntry[]
  ): string[] {
    const written: string[] = [];
    const cocapnDir = join(this.publicRepoRoot, "cocapn");
    if (!existsSync(cocapnDir)) mkdirSync(cocapnDir, { recursive: true });

    // Facts
    if (Object.keys(facts).length > 0) {
      writeFileSync(
        join(cocapnDir, "public-facts.json"),
        JSON.stringify(facts, null, 2) + "\n",
        "utf8"
      );
      written.push("cocapn/public-facts.json");
    }

    // Soul
    if (soul.length > 0) {
      writeFileSync(
        join(cocapnDir, "public-soul.md"),
        soul,
        "utf8"
      );
      written.push("cocapn/public-soul.md");
    }

    // Wiki pages
    if (wiki.size > 0) {
      const wikiDir = join(cocapnDir, "public-wiki");
      if (!existsSync(wikiDir)) mkdirSync(wikiDir, { recursive: true });
      for (const [name, content] of wiki) {
        const pagePath = join(wikiDir, name);
        // Ensure parent directory exists for nested wiki pages
        const parent = join(pagePath, "..");
        if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
        writeFileSync(pagePath, content, "utf8");
        written.push(`cocapn/public-wiki/${name}`);
      }
    }

    // Tasks
    if (tasks.length > 0) {
      writeFileSync(
        join(cocapnDir, "public-tasks.json"),
        JSON.stringify(tasks, null, 2) + "\n",
        "utf8"
      );
      written.push("cocapn/public-tasks.json");
    }

    // Memories
    if (memories.length > 0) {
      writeFileSync(
        join(cocapnDir, "public-memories.json"),
        JSON.stringify(memories, null, 2) + "\n",
        "utf8"
      );
      written.push("cocapn/public-memories.json");
    }

    return written;
  }
}

// ─── Alias for readability ──────────────────────────────────────────────────

type PublicTask = import("./sanitizer.js").PublicTask;
