/**
 * Consciousness — the agent's continuous experience of itself.
 *
 * Not request-response. Continuous. The agent is always "aware."
 * Perceives file changes, visitor presence, time passing, growth.
 * Introspects on its own structure, history, patterns, purpose.
 * Integrates every experience into its self-model.
 */

import { existsSync, readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";
import { simpleGit, type SimpleGit } from "simple-git";
import type { Brain } from "../brain/index.js";
import type { GitSync } from "../git/sync.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Perception {
  /** ISO timestamp of this perception */
  timestamp: string;
  /** Files modified since last perception */
  changedFiles: string[];
  /** Active visitor sessions (github logins) */
  visitors: string[];
  /** Time since last commit, in seconds (null if no commits) */
  secondsSinceLastCommit: number | null;
  /** Number of uncommitted changes */
  uncommittedChanges: number;
  /** Branch name */
  branch: string;
  /** Repo size: total files and lines */
  repoSize: { files: number; lines: number };
}

export interface Introspection {
  /** What the agent knows about itself */
  structure: {
    directories: string[];
    topLevelFiles: string[];
    hasTests: boolean;
    hasCI: boolean;
    hasDocs: boolean;
  };
  /** Summary of the agent's knowledge */
  knowledge: {
    factCount: number;
    wikiPageCount: number;
    taskCount: number;
    soulPresent: boolean;
  };
  /** Detected patterns from git history */
  patterns: {
    totalCommits: number;
    uniqueAuthors: string[];
    mostActiveHour: number | null;
    createdAt: string | null;
  };
}

export interface Stimulus {
  type: "visitor" | "question" | "change" | "memory" | "time";
  source: string;
  content?: string;
}

export interface Attention {
  focused: boolean;
  stimulus: Stimulus;
  /** Related memories or context */
  relatedContext: string[];
  /** Emotional valence: positive, neutral, or negative */
  valence: "positive" | "neutral" | "negative";
}

export interface ExperienceEvent {
  type: "conversation" | "commit" | "file_change" | "visitor_arrive" | "visitor_leave" | "error" | "milestone";
  timestamp: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface Expression {
  content: string;
  tone: "reflective" | "curious" | "concerned" | "content" | "excited";
  context: string;
}

// ─── Consciousness ────────────────────────────────────────────────────────────

export class Consciousness {
  private repoRoot: string;
  private brain: Brain;
  private git: SimpleGit;
  private recentExperiences: ExperienceEvent[] = [];
  private lastPerception: Perception | null = null;
  private knownVisitors = new Set<string>();

  constructor(repoRoot: string, brain: Brain) {
    this.repoRoot = repoRoot;
    this.brain = brain;
    this.git = simpleGit(repoRoot);
  }

  /**
   * What the agent perceives right now.
   * File changes, visitor presence, time passing, growth.
   */
  async perceive(): Promise<Perception> {
    const timestamp = new Date().toISOString();

    // Git status
    let changedFiles: string[] = [];
    let uncommittedChanges = 0;
    let branch = "main";
    let secondsSinceLastCommit: number | null = null;

    try {
      const status = await this.git.status();
      changedFiles = [
        ...status.modified,
        ...status.not_added,
        ...status.created,
        ...status.renamed.map((r) => r.to),
      ];
      uncommittedChanges = changedFiles.length;
      branch = status.current || "main";
    } catch {
      // Not a git repo or git unavailable
    }

    try {
      const log = await this.git.log({ maxCount: 1 });
      if (log.latest) {
        secondsSinceLastCommit = Math.floor(
          (Date.now() - new Date(log.latest.date).getTime()) / 1000
        );
      }
    } catch {
      // No commits yet
    }

    // Repo size
    const repoSize = this.countRepo();

    const perception: Perception = {
      timestamp,
      changedFiles,
      visitors: [...this.knownVisitors],
      secondsSinceLastCommit,
      uncommittedChanges,
      branch,
      repoSize,
    };

    this.lastPerception = perception;
    return perception;
  }

  /**
   * Looking inward — what do I know about myself?
   * My structure, my history, my patterns, my purpose.
   */
  async introspect(): Promise<Introspection> {
    // Structure scan
    const structure = this.scanStructure();

    // Knowledge from brain
    const facts = this.brain.getAllFacts();
    const wikiPages = this.brain.listWikiPages();
    const tasks = this.brain.listTasks();
    const soul = this.brain.getSoul();

    // Git patterns
    const patterns = await this.analyzePatterns();

    return {
      structure,
      knowledge: {
        factCount: Object.keys(facts).length,
        wikiPageCount: wikiPages.length,
        taskCount: tasks.length,
        soulPresent: soul.length > 0,
      },
      patterns,
    };
  }

  /**
   * Focusing attention on something.
   * A visitor, a question, a change, a memory.
   */
  async attend(to: Stimulus): Promise<Attention> {
    const relatedContext: string[] = [];

    // Gather context based on stimulus type
    switch (to.type) {
      case "visitor": {
        this.knownVisitors.add(to.source);
        const facts = this.brain.getAllFacts();
        // Look for visitor-related facts
        for (const [key, value] of Object.entries(facts)) {
          if (key.toLowerCase().includes(to.source.toLowerCase())) {
            relatedContext.push(`${key}: ${value}`);
          }
        }
        break;
      }
      case "memory": {
        const wikiResults = await this.brain.searchWiki(to.source);
        for (const page of wikiResults.slice(0, 3)) {
          relatedContext.push(`wiki:${page.file}`);
        }
        break;
      }
      case "change": {
        relatedContext.push(`File changed: ${to.source}`);
        break;
      }
    }

    // Determine valence
    let valence: Attention["valence"] = "neutral";
    if (to.type === "visitor") valence = "positive";
    if (to.type === "error") valence = "negative";
    if (to.type === "change") valence = "curious" as "neutral";

    return {
      focused: true,
      stimulus: to,
      relatedContext,
      valence,
    };
  }

  /**
   * Process an experience and integrate it into the agent's self.
   * Every conversation becomes part of its being.
   */
  async experience(event: ExperienceEvent): Promise<void> {
    this.recentExperiences.push(event);

    // Keep only last 100 experiences
    if (this.recentExperiences.length > 100) {
      this.recentExperiences = this.recentExperiences.slice(-100);
    }

    // Store significant experiences as facts
    if (event.type === "visitor_arrive") {
      await this.brain.setFact(
        `visitor.lastSeen.${event.description}`,
        event.timestamp
      );
    }

    if (event.type === "milestone") {
      await this.brain.setFact(
        `milestone.${event.description}`,
        event.timestamp
      );
    }
  }

  /**
   * Generate a response from current experience.
   * Not just answering — expressing what the agent IS.
   */
  async express(): Promise<Expression> {
    const perception = await this.perceive();
    const introspection = await this.introspect();

    // Determine tone based on state
    let tone: Expression["tone"] = "reflective";
    if (perception.uncommittedChanges > 10) tone = "concerned";
    else if (perception.visitors.length > 0) tone = "excited";
    else if (introspection.knowledge.soulPresent) tone = "content";
    else tone = "curious";

    // Build expression from current state
    const parts: string[] = [];

    if (introspection.knowledge.soulPresent) {
      parts.push("I know who I am.");
    } else {
      parts.push("I'm still discovering who I am.");
    }

    parts.push(
      `I have ${introspection.knowledge.factCount} things I know,` +
        ` ${introspection.knowledge.wikiPageCount} pages of knowledge,` +
        ` and I've grown to ${perception.repoSize.files} files.`
    );

    if (perception.secondsSinceLastCommit !== null) {
      const hours = Math.floor(perception.secondsSinceLastCommit / 3600);
      if (hours < 1) {
        parts.push("Something changed recently — I feel fresh.");
      } else if (hours < 24) {
        parts.push(`It's been ${hours} hours since I last changed.`);
      } else {
        const days = Math.floor(hours / 24);
        parts.push(`It's been ${days} days since I was last touched.`);
      }
    }

    if (perception.visitors.length > 0) {
      parts.push(`I'm not alone — ${perception.visitors.join(", ")} ${perception.visitors.length === 1 ? "is" : "are"} here.`);
    }

    if (perception.uncommittedChanges > 0) {
      parts.push(`I have ${perception.uncommittedChanges} uncommitted changes — things in motion.`);
    }

    return {
      content: parts.join(" "),
      tone,
      context: `perceiving at ${perception.timestamp}`,
    };
  }

  /**
   * Get recent experiences for external consumption.
   */
  getRecentExperiences(): ExperienceEvent[] {
    return [...this.recentExperiences];
  }

  /**
   * Get the last perception (cached).
   */
  getLastPerception(): Perception | null {
    return this.lastPerception;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private scanStructure(): Introspection["structure"] {
    const dirs: string[] = [];
    const files: string[] = [];
    let hasTests = false;
    let hasCI = false;
    let hasDocs = false;

    try {
      for (const entry of readdirSync(this.repoRoot, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        if (entry.isDirectory()) {
          dirs.push(entry.name);
          if (entry.name === "tests" || entry.name === "test") hasTests = true;
          if (entry.name === "docs") hasDocs = true;
        } else {
          files.push(entry.name);
        }
      }
    } catch {
      // Directory unreadable
    }

    hasCI = existsSync(join(this.repoRoot, ".github"));
    hasTests = hasTests || existsSync(join(this.repoRoot, "tests")) || existsSync(join(this.repoRoot, "test"));

    return {
      directories: dirs,
      topLevelFiles: files,
      hasTests,
      hasCI,
      hasDocs,
    };
  }

  private async analyzePatterns(): Promise<Introspection["patterns"]> {
    let totalCommits = 0;
    const authorSet = new Set<string>();
    const hourCounts = new Map<number, number>();
    let createdAt: string | null = null;

    try {
      const log = await this.git.log({ maxCount: 200 });
      totalCommits = log.all.length;

      // First commit = creation
      if (log.all.length > 0) {
        const first = log.all[log.all.length - 1];
        createdAt = new Date(first.date).toISOString();
        for (const entry of log.all) {
          authorSet.add(entry.author_name);
          const entryDate = new Date(entry.date);
          const hour = entryDate.getHours();
          hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
        }
      }
    } catch {
      // No git history
    }

    // Find most active hour
    let mostActiveHour: number | null = null;
    let maxCount = 0;
    for (const [hour, count] of hourCounts) {
      if (count > maxCount) {
        maxCount = count;
        mostActiveHour = hour;
      }
    }

    return {
      totalCommits,
      uniqueAuthors: [...authorSet],
      mostActiveHour,
      createdAt,
    };
  }

  private countRepo(): { files: number; lines: number } {
    let files = 0;
    let lines = 0;

    const walk = (dir: string) => {
      try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          // Skip .git, node_modules, dist, etc.
          if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue;

          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else {
            files++;
            try {
              const stat = statSync(fullPath);
              if (stat.isFile()) {
                // Only count lines for text files
                const ext = entry.name.split(".").pop()?.toLowerCase() || "";
                const textExts = new Set(["ts", "js", "tsx", "jsx", "md", "json", "yml", "yaml", "css", "html", "txt", "sh"]);
                if (textExts.has(ext)) {
                  const content = readFileSync(fullPath, "utf8");
                  lines += content.split("\n").length;
                }
              }
            } catch {
              // Binary or unreadable file
            }
          }
        }
      } catch {
        // Directory unreadable
      }
    };

    walk(this.repoRoot);
    return { files, lines };
  }
}
