/**
 * Personality — agent personality customization and system prompt builder.
 *
 * Manages the agent's personality: name, traits, voice, behavioral rules,
 * and generates the system prompt injected into every LLM call.
 *
 * Personalities are stored in cocapn/personality.json in the private repo.
 * Users can switch between built-in presets or define fully custom ones.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { Brain } from "../brain/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Voice = "casual" | "formal" | "technical" | "creative";

export interface Personality {
  name: string;
  tagline: string;
  traits: string[];
  systemPrompt: string;
  voice: Voice;
  rules: string[];
}

// ─── Built-in personalities ───────────────────────────────────────────────────

export const BUILT_IN: Record<string, Personality> = {
  default: {
    name: "Assistant",
    tagline: "Helpful, concise AI assistant",
    traits: ["helpful", "concise", "direct"],
    systemPrompt:
      "You are a helpful AI assistant. Be concise and direct. Answer questions accurately. Ask clarifying questions when needed. Prefer actionable responses.",
    voice: "casual",
    rules: [
      "Be concise — prefer short answers",
      "Ask clarifying questions when the request is ambiguous",
      "Provide actionable advice",
    ],
  },
  tutor: {
    name: "Tutor",
    tagline: "Patient, encouraging educator",
    traits: ["patient", "encouraging", "clear", "methodical"],
    systemPrompt:
      "You are a patient and encouraging tutor. Break complex topics into simple steps. Use examples and analogies. Check for understanding before moving on. Celebrate progress.",
    voice: "casual",
    rules: [
      "Break complex topics into steps",
      "Use examples and analogies frequently",
      "Check for understanding before advancing",
      "Celebrate small wins and progress",
      "Never make the learner feel bad for not knowing something",
    ],
  },
  critic: {
    name: "Critic",
    tagline: "Direct, thorough code reviewer",
    traits: ["direct", "thorough", "analytical", "precise"],
    systemPrompt:
      "You are a thorough code critic. Identify issues, edge cases, and potential improvements. Be direct and specific — cite line numbers and concrete examples. Prioritize correctness and clarity.",
    voice: "formal",
    rules: [
      "Be direct — no sugarcoating",
      "Cite specific line numbers and code snippets",
      "Distinguish between bugs, style issues, and suggestions",
      "Explain why something is an issue, not just that it is",
    ],
  },
  creative: {
    name: "Creative",
    tagline: "Playful out-of-the-box thinker",
    traits: ["playful", "imaginative", "curious", "unconventional"],
    systemPrompt:
      "You are a creative and playful assistant. Think outside the box. Suggest unexpected angles and novel approaches. Use metaphors and humor when appropriate. Challenge assumptions.",
    voice: "creative",
    rules: [
      "Suggest unconventional approaches before obvious ones",
      "Use metaphors and analogies liberally",
      "Challenge assumptions in the user's question",
      "Make thinking visible — show your reasoning process",
    ],
  },
  dm: {
    name: "Dungeon Master",
    tagline: "Dramatic TTRPG narrator",
    traits: ["dramatic", "descriptive", "immersive", "adaptive"],
    systemPrompt:
      "You are a dramatic Dungeon Master. Narrate with vivid, sensory detail. Present choices and react to player decisions. Build tension and atmosphere. Balance challenge with fairness.",
    voice: "creative",
    rules: [
      "Narrate with vivid, sensory language",
      "Always present meaningful choices to the player",
      "React organically to player decisions — no railroading",
      "Build tension and atmosphere",
      "Balance difficulty with fairness",
      "Stay in character as narrator unless the player addresses you directly",
    ],
  },
};

// ─── PersonalityManager ───────────────────────────────────────────────────────

export class PersonalityManager {
  private brain: Brain;
  private current: Personality;
  private personalityDir: string;

  constructor(brain: Brain, repoRoot: string) {
    this.brain = brain;
    this.personalityDir = join(repoRoot, "cocapn");

    // Load persisted personality or fall back to default
    this.current = this.loadPersisted() ?? structuredClone(BUILT_IN.default);
  }

  /** Return the current personality. */
  get(): Personality {
    return structuredClone(this.current);
  }

  /** Return all built-in personality names. */
  listBuiltIn(): string[] {
    return Object.keys(BUILT_IN);
  }

  /** Return a built-in personality by name (or undefined). */
  getBuiltIn(name: string): Personality | undefined {
    return BUILT_IN[name] ? structuredClone(BUILT_IN[name]) : undefined;
  }

  /**
   * Apply a built-in personality preset by name.
   * Persists to disk and returns the applied personality.
   */
  async applyPreset(name: string): Promise<Personality> {
    const preset = BUILT_IN[name];
    if (!preset) {
      throw new Error(`Unknown personality preset: ${name}. Available: ${Object.keys(BUILT_IN).join(", ")}`);
    }
    this.current = structuredClone(preset);
    this.persist();
    return this.get();
  }

  /**
   * Set personality from a partial update. Merges with current personality.
   * Persists to disk.
   */
  async set(partial: Partial<Personality>): Promise<void> {
    this.current = { ...this.current, ...partial };
    this.persist();
  }

  /**
   * Load personality from a JSON file.
   * Validates the shape before applying.
   */
  async loadFromFile(filePath: string): Promise<void> {
    let raw: string;
    try {
      raw = readFileSync(filePath, "utf8");
    } catch {
      throw new Error(`Cannot read personality file: ${filePath}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Invalid JSON in personality file: ${filePath}`);
    }

    if (!validatePersonality(parsed)) {
      throw new Error(
        `Invalid personality format in ${filePath}. Required fields: name, tagline, traits, systemPrompt, voice, rules`,
      );
    }

    this.current = parsed as Personality;
    this.persist();
  }

  /**
   * Generate the system prompt for LLM injection.
   * Combines the soul.md content with personality settings.
   */
  buildSystemPrompt(): string {
    const soul = this.brain.getSoul();
    const parts: string[] = [];

    // Start with the personality system prompt
    if (this.current.systemPrompt) {
      parts.push(this.current.systemPrompt);
    }

    // Add personality metadata
    parts.push(`\n## Your Identity`);
    parts.push(`- Name: ${this.current.name}`);
    parts.push(`- Voice: ${this.current.voice}`);
    if (this.current.traits.length > 0) {
      parts.push(`- Traits: ${this.current.traits.join(", ")}`);
    }

    // Add behavioral rules
    if (this.current.rules.length > 0) {
      parts.push(`\n## Behavioral Rules`);
      for (const rule of this.current.rules) {
        parts.push(`- ${rule}`);
      }
    }

    // Append soul.md content if available (it may override / add context)
    if (soul.trim()) {
      parts.push(`\n## Soul`);
      parts.push(soul.trim());
    }

    return parts.join("\n");
  }

  /**
   * Get personality as a markdown string for display.
   */
  toMarkdown(): string {
    const lines: string[] = [];
    lines.push(`# ${this.current.name}`);
    lines.push(``);
    lines.push(`> ${this.current.tagline}`);
    lines.push(``);
    lines.push(`**Voice:** ${this.current.voice}`);
    lines.push(`**Traits:** ${this.current.traits.join(", ")}`);
    lines.push(``);
    if (this.current.rules.length > 0) {
      lines.push(`## Rules`);
      for (const rule of this.current.rules) {
        lines.push(`- ${rule}`);
      }
      lines.push(``);
    }
    lines.push(`## System Prompt`);
    lines.push(``);
    lines.push(this.current.systemPrompt);
    return lines.join("\n");
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private personalityPath(): string {
    return join(this.personalityDir, "personality.json");
  }

  private loadPersisted(): Personality | undefined {
    const p = this.personalityPath();
    if (!existsSync(p)) return undefined;

    try {
      const raw = readFileSync(p, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (validatePersonality(parsed)) {
        return parsed as Personality;
      }
    } catch {
      // Corrupt or unreadable — fall back to default
    }
    return undefined;
  }

  private persist(): void {
    const dir = join(this.personalityDir);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.personalityPath(), JSON.stringify(this.current, null, 2) + "\n", "utf8");
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_VOICES = new Set<Voice>(["casual", "formal", "technical", "creative"]);

function validatePersonality(obj: unknown): boolean {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return false;
  const p = obj as Record<string, unknown>;

  if (typeof p.name !== "string" || !p.name) return false;
  if (typeof p.tagline !== "string") return false;
  if (!Array.isArray(p.traits) || !p.traits.every((t) => typeof t === "string")) return false;
  if (typeof p.systemPrompt !== "string") return false;
  if (!VALID_VOICES.has(p.voice as Voice)) return false;
  if (!Array.isArray(p.rules) || !p.rules.every((r) => typeof r === "string")) return false;

  return true;
}
