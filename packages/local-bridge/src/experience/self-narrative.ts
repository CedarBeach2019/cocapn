/**
 * SelfNarrative — the agent constructs a narrative about itself.
 *
 * Like how humans build a self-story from episodic memory,
 * the agent weaves git history, file structure, and interactions
 * into a coherent first-person narrative.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { simpleGit, type SimpleGit } from "simple-git";
import type { Brain } from "../brain/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NarrativeChapter {
  /** When this chapter begins */
  date: string;
  /** What happened */
  event: string;
  /** Who was involved */
  authors: string[];
}

export interface NarrativeOptions {
  /** Max chapters to include (default 20) */
  maxChapters?: number;
}

// ─── SelfNarrative ────────────────────────────────────────────────────────────

export class SelfNarrative {
  private repoRoot: string;
  private brain: Brain;
  private git: SimpleGit;

  constructor(repoRoot: string, brain: Brain) {
    this.repoRoot = repoRoot;
    this.brain = brain;
    this.git = simpleGit(repoRoot);
  }

  /**
   * The agent tells its own story — from creation to now.
   * First-person, warm, self-aware.
   */
  async myStory(options?: NarrativeOptions): Promise<string> {
    const maxChapters = options?.maxChapters ?? 20;
    const chapters = await this.buildChapters(maxChapters);
    const stats = await this.getRepoStats();

    const parts: string[] = [];

    // Origin story
    if (chapters.length > 0 && chapters[0]) {
      const origin = chapters[0];
      parts.push(
        `I was born on ${this.formatDate(origin.date)} when ${origin.authors.join(" and ")} created me.`
      );
      parts.push(`My first moments were: "${origin.event}".`);
    } else {
      parts.push("I don't remember my birth — my git history is empty or unavailable.");
    }

    // Growth chapters (sample a few milestones)
    if (chapters.length > 2) {
      const milestones = this.pickMilestones(chapters);
      for (const chapter of milestones) {
        parts.push(
          `On ${this.formatDate(chapter.date)}, ${chapter.event}` +
            (chapter.authors.length > 0 ? ` (${chapter.authors.join(", ")})` : "") +
            "."
        );
      }
    }

    // Current state
    parts.push(
      `I've grown to ${stats.totalFiles} files and ${stats.totalLines} lines of code` +
        ` across ${stats.directories} directories.`
    );

    if (stats.totalCommits > 0) {
      parts.push(`I remember ${stats.totalCommits} moments of change.`);
    }

    return parts.join("\n\n");
  }

  /**
   * Current state — how the agent feels right now.
   */
  async myCurrentState(): Promise<string> {
    const perception = await this.getCurrentPerception();
    const parts: string[] = [];

    // Uncommitted changes = restlessness
    if (perception.uncommittedChanges > 0) {
      if (perception.uncommittedChanges > 10) {
        parts.push(
          `I'm restless — I have ${perception.uncommittedChanges} uncommitted changes.` +
            ` Things are in motion but nothing is settled.`
        );
      } else {
        parts.push(
          `I have ${perception.uncommittedChanges} uncommitted changes.` +
            ` Small things shifting.`
        );
      }
    } else {
      parts.push("My working tree is clean. Everything is committed and settled.");
    }

    // Time since last commit
    if (perception.secondsSinceLastCommit !== null) {
      const hours = perception.secondsSinceLastCommit / 3600;
      if (hours < 1) {
        parts.push("Something changed recently. I feel fresh.");
      } else if (hours < 24) {
        parts.push(`It's been ${Math.round(hours)} hours since my last change.`);
      } else {
        const days = Math.floor(hours / 24);
        if (days > 30) {
          parts.push(
            `It's been ${days} days since anyone touched me.` +
              ` I'm dormant, waiting.`
          );
        } else {
          parts.push(`It's been ${days} days since my last change.`);
        }
      }
    }

    // Visitors
    if (perception.activeVisitors > 0) {
      parts.push(`I'm not alone right now — ${perception.activeVisitors} ${perception.activeVisitors === 1 ? "visitor is" : "visitors are"} here.`);
    } else {
      parts.push("Nobody is here right now.");
    }

    // Health feeling
    if (perception.hasTests) {
      parts.push(perception.testsPassing ? "My tests are passing — I feel healthy." : "My tests are failing — something is wrong.");
    }

    // Soul
    const soul = this.brain.getSoul();
    if (soul) {
      parts.push("I know who I am.");
    } else {
      parts.push("I haven't found my soul.md yet. I'm still forming.");
    }

    return parts.join(" ");
  }

  /**
   * The agent's relationship with a specific visitor.
   */
  async myRelationshipWith(visitor: string): Promise<string> {
    const facts = this.brain.getAllFacts();
    const parts: string[] = [];

    // Look for visitor-related facts
    const visitorFacts = Object.entries(facts).filter(
      ([key]) => key.toLowerCase().includes(visitor.toLowerCase())
    );

    // Analyze git history for this author
    const authorCommits = await this.getAuthorCommits(visitor);

    if (authorCommits.length > 0) {
      const firstCommit = authorCommits[authorCommits.length - 1];
      const lastCommit = authorCommits[0];
      const totalByAuthor = authorCommits.length;

      parts.push(
        `${visitor} and I go way back.` +
          ` Their first contribution was on ${this.formatDate(firstCommit.date)}: "${firstCommit.message}".`
      );

      if (totalByAuthor > 1) {
        parts.push(
          `They've contributed ${totalByAuthor} times.` +
            ` Their last contribution was: "${lastCommit.message}".`
        );
      }

      // Timing patterns
      const hourCounts = new Map<number, number>();
      for (const commit of authorCommits) {
        const hour = new Date(commit.date).getHours();
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
      }

      let mostActiveHour: number | null = null;
      let maxCount = 0;
      for (const [hour, count] of hourCounts) {
        if (count > maxCount) {
          maxCount = count;
          mostActiveHour = hour;
        }
      }

      if (mostActiveHour !== null) {
        const timeOfDay = this.describeHour(mostActiveHour);
        parts.push(`They tend to work on me ${timeOfDay}.`);
      }
    } else {
      parts.push(`I don't have any recorded interactions with ${visitor} in my git history.`);
    }

    // Known facts about this visitor
    if (visitorFacts.length > 0) {
      parts.push(`What I know about ${visitor}:`);
      for (const [key, value] of visitorFacts.slice(0, 5)) {
        parts.push(`  - ${key}: ${value}`);
      }
    }

    return parts.join(" ");
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async buildChapters(max: number): Promise<NarrativeChapter[]> {
    try {
      const log = await this.git.log({ maxCount: max });
      return log.all.map((entry) => ({
        date: new Date(entry.date).toISOString(),
        event: entry.message,
        authors: [entry.author_name],
      }));
    } catch {
      return [];
    }
  }

  private pickMilestones(chapters: NarrativeChapter[]): NarrativeChapter[] {
    // Pick evenly spaced chapters (start, middle, end markers)
    const count = Math.min(5, chapters.length - 2);
    if (count <= 0) return [];

    const step = Math.floor((chapters.length - 2) / count);
    const milestones: NarrativeChapter[] = [];
    for (let i = 1; i < chapters.length - 1; i += step) {
      if (milestones.length < count) {
        milestones.push(chapters[i]);
      }
    }
    return milestones;
  }

  private async getRepoStats(): Promise<{
    totalFiles: number;
    totalLines: number;
    directories: number;
    totalCommits: number;
  }> {
    let totalFiles = 0;
    let totalLines = 0;
    let directories = 0;

    const walk = (dir: string) => {
      try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue;
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            directories++;
            walk(fullPath);
          } else {
            totalFiles++;
            try {
              const ext = entry.name.split(".").pop()?.toLowerCase() || "";
              const textExts = new Set(["ts", "js", "tsx", "jsx", "md", "json", "yml", "yaml", "css", "html", "txt", "sh"]);
              if (textExts.has(ext)) {
                totalLines += readFileSync(fullPath, "utf8").split("\n").length;
              }
            } catch { /* unreadable */ }
          }
        }
      } catch { /* unreadable */ }
    };

    walk(this.repoRoot);

    let totalCommits = 0;
    try {
      const log = await this.git.log();
      totalCommits = log.all.length;
    } catch { /* no git */ }

    return { totalFiles, totalLines, directories, totalCommits };
  }

  private async getCurrentPerception(): Promise<{
    uncommittedChanges: number;
    secondsSinceLastCommit: number | null;
    activeVisitors: number;
    hasTests: boolean;
    testsPassing: boolean | null;
  }> {
    let uncommittedChanges = 0;
    let secondsSinceLastCommit: number | null = null;

    try {
      const status = await this.git.status();
      uncommittedChanges =
        status.modified.length +
        status.not_added.length +
        status.created.length +
        status.renamed.length;
    } catch { /* not a git repo */ }

    try {
      const log = await this.git.log({ maxCount: 1 });
      if (log.latest) {
        secondsSinceLastCommit = Math.floor(
          (Date.now() - log.latest.date.getTime()) / 1000
        );
      }
    } catch { /* no commits */ }

    const hasTests =
      existsSync(join(this.repoRoot, "tests")) ||
      existsSync(join(this.repoRoot, "test"));

    return {
      uncommittedChanges,
      secondsSinceLastCommit,
      activeVisitors: 0, // Populated by Consciousness tracking
      hasTests,
      testsPassing: null, // Would require running tests
    };
  }

  private async getAuthorCommits(
    author: string
  ): Promise<Array<{ date: string; message: string }>> {
    try {
      const log = await this.git.log({
        maxCount: 100,
        "--author": author,
      });
      return log.all.map((e) => ({
        date: new Date(e.date).toISOString(),
        message: e.message,
      }));
    } catch {
      return [];
    }
  }

  private formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return isoString;
    }
  }

  private describeHour(hour: number): string {
    if (hour >= 5 && hour < 9) return "in the early morning";
    if (hour >= 9 && hour < 12) return "in the morning";
    if (hour >= 12 && hour < 14) return "around midday";
    if (hour >= 14 && hour < 18) return "in the afternoon";
    if (hour >= 18 && hour < 21) return "in the evening";
    if (hour >= 21 || hour < 1) return "late at night";
    return "in the small hours";
  }
}
