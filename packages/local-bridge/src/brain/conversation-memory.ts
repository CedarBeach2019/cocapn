/**
 * ConversationMemory — extracts facts from conversations and injects them
 * as context so the agent remembers users across sessions.
 *
 * Responsibilities:
 *   - extractAndStore() — after a chat response, extract facts and persist them in Brain
 *   - retrieveRelevantContext() — before a chat request, find relevant facts
 *   - extractFactsHeuristic() — regex/pattern extraction (no LLM needed)
 *
 * Fact types extracted:
 *   - name, organization, project, preference, tech_stack, contact
 *
 * Integration:
 *   - BridgeServer creates ConversationMemory on startup
 *   - After each CHAT response, call extractAndStore()
 *   - Before each CHAT request, call retrieveRelevantContext()
 *   - Inject context into the system prompt
 */

import type { Brain } from "./index.js";
import type { LLMProvider } from "../llm/provider.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedFact {
  key: string;
  value: string;
  type: "name" | "organization" | "project" | "preference" | "tech_stack" | "contact" | "date" | "location";
  confidence: number; // 0-1
}

export interface ConversationMemoryOptions {
  /** Maximum number of facts to retrieve for context injection (default: 10) */
  maxContextFacts?: number;
  /** Minimum confidence threshold for auto-storing facts (default: 0.6) */
  storeThreshold?: number;
  /** Enable heuristic extraction (default: true) */
  heuristicExtraction?: boolean;
}

// ─── Heuristic extraction patterns ────────────────────────────────────────────

const FACT_PATTERNS: Array<{
  type: ExtractedFact["type"];
  pattern: RegExp;
  key: string;
  confidence: number;
}> = [
  // Name patterns
  {
    type: "name",
    pattern: /(?:my name is |i'm |call me |i am |i go by )([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
    key: "user.name",
    confidence: 0.9,
  },
  {
    type: "name",
    pattern: /(?:i'm known as|they call me|everyone calls me) ([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
    key: "user.name",
    confidence: 0.8,
  },
  // Organization patterns
  {
    type: "organization",
    pattern: /(?:i work (?:at|for) |i'm (?:at|working at) |my (?:company|org|employer) is )([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*)/i,
    key: "user.organization",
    confidence: 0.85,
  },
  {
    type: "organization",
    pattern: /(?:i'm from |i belong to )([A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*)/i,
    key: "user.organization",
    confidence: 0.7,
  },
  // Project patterns
  {
    type: "project",
    pattern: /(?:my (?:project|app|product|startup) is |i'm (?:building|working on|developing) |i built )(["']?)([\w][\w\s-]{1,50}?)\1/i,
    key: "user.project",
    confidence: 0.8,
  },
  {
    type: "project",
    pattern: /(?:currently (?:building|developing|working on) )(["']?)([\w][\w\s-]{1,50}?)\1/i,
    key: "user.project",
    confidence: 0.75,
  },
  // Preference patterns
  {
    type: "preference",
    pattern: /(?:i (?:prefer|like|love|enjoy|favor|appreciate)) ([\w][\w\s,]{1,80}?)(?:\.|,|$)/i,
    key: "user.preference",
    confidence: 0.7,
  },
  {
    type: "preference",
    pattern: /(?:i (?:don't like|dislike|hate|can't stand|avoid)) ([\w][\w\s,]{1,80}?)(?:\.|,|$)/i,
    key: "user.dislike",
    confidence: 0.7,
  },
  // Tech stack patterns
  {
    type: "tech_stack",
    pattern: /(?:my (?:tech )?stack is |i use |i'm using |we use |our stack is )([\w][\w\s,/+]{2,80}?)(?:\.|,|$)/i,
    key: "user.tech_stack",
    confidence: 0.8,
  },
  // Contact patterns (email)
  {
    type: "contact",
    pattern: /(?:my email is |email me at |reach me at )([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i,
    key: "user.email",
    confidence: 0.85,
  },
  // Contact patterns (phone - basic US format)
  {
    type: "contact",
    pattern: /(?:my (?:phone|number) is |call me at |reach me at )([+]?[\d\s-]{7,15})/i,
    key: "user.phone",
    confidence: 0.8,
  },
  // Location patterns
  {
    type: "location",
    pattern: /(?:i (?:live|am based|am located|reside) in )([A-Z][A-Za-z\s,]{2,50}?)(?:\.|,|$)/i,
    key: "user.location",
    confidence: 0.75,
  },
  {
    type: "location",
    pattern: /(?:i'm (?:from|based in) )([A-Z][A-Za-z\s,]{2,50}?)(?:\.|,|$)/i,
    key: "user.location",
    confidence: 0.7,
  },
  // Date patterns (birthday, anniversary, deadline)
  {
    type: "date",
    pattern: /(?:my birthday is|born on|birthday is on) (\d{1,2}[\s/]\w{3,9}[\s/]\d{2,4})/i,
    key: "user.birthday",
    confidence: 0.8,
  },
  {
    type: "date",
    pattern: /(?:my (?:deadline|due date) is|due by|deadline is) (\d{1,2}[\s/]\w{3,9}[\s/]\d{2,4})/i,
    key: "user.deadline",
    confidence: 0.75,
  },
];

// ─── ConversationMemory ───────────────────────────────────────────────────────

export class ConversationMemory {
  private brain: Brain;
  private llm: LLMProvider | undefined;
  private options: Required<ConversationMemoryOptions>;

  constructor(brain: Brain, llm?: LLMProvider, options?: ConversationMemoryOptions) {
    this.brain = brain;
    this.llm = llm;
    this.options = {
      maxContextFacts: options?.maxContextFacts ?? 10,
      storeThreshold: options?.storeThreshold ?? 0.6,
      heuristicExtraction: options?.heuristicExtraction ?? true,
    };
  }

  /**
   * Extract facts from the conversation and store them in Brain.
   * Called after each chat response.
   *
   * Returns the list of keys that were stored.
   */
  async extractAndStore(userMessage: string, agentResponse: string): Promise<string[]> {
    const storedKeys: string[] = [];
    const combinedText = `${userMessage}\n${agentResponse}`;

    // 1. Heuristic extraction (always available)
    if (this.options.heuristicExtraction) {
      const facts = this.extractFactsHeuristic(combinedText);
      for (const fact of facts) {
        if (fact.confidence < this.options.storeThreshold) continue;

        const existingValue = this.brain.getFact(fact.key);
        if (existingValue === fact.value) continue; // Already stored

        await this.brain.setFact(fact.key, fact.value);
        storedKeys.push(fact.key);
      }
    }

    // 2. LLM extraction (if provider is available)
    if (this.llm) {
      try {
        const llmFacts = await this.extractFactsLLM(userMessage, agentResponse);
        for (const fact of llmFacts) {
          if (fact.confidence < this.options.storeThreshold) continue;

          const existingValue = this.brain.getFact(fact.key);
          if (existingValue === fact.value) continue;

          await this.brain.setFact(fact.key, fact.value);
          if (!storedKeys.includes(fact.key)) {
            storedKeys.push(fact.key);
          }
        }
      } catch {
        // LLM extraction is best-effort, don't fail the conversation
      }
    }

    return storedKeys;
  }

  /**
   * Retrieve relevant facts for a given user message.
   * Called before each chat request.
   *
   * Returns a formatted context string suitable for injection into the system prompt.
   */
  async retrieveRelevantContext(userMessage: string): Promise<string> {
    const allFacts = this.brain.getAllFacts();
    const factEntries = Object.entries(allFacts);

    if (factEntries.length === 0) return "";

    // Score facts by relevance to the user message
    const scored = factEntries.map(([key, value]) => ({
      key,
      value,
      score: this.scoreRelevance(key, value, userMessage),
    }));

    // Sort by score descending, take top N
    scored.sort((a, b) => b.score - a.score);
    const topFacts = scored.slice(0, this.options.maxContextFacts);

    if (topFacts.length === 0) return "";

    // Format as bullet list
    const lines = topFacts.map(({ key, value }) => {
      const label = key.replace(/^user\./, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
      return `- ${label}: ${value}`;
    });

    return lines.join("\n");
  }

  /**
   * Build a full system prompt section with conversation memory context.
   * This can be prepended to the existing system prompt.
   */
  async buildMemoryPrompt(userMessage: string): Promise<string> {
    const context = await this.retrieveRelevantContext(userMessage);
    if (!context) return "";

    return `Here's what you know about this user:\n${context}`;
  }

  /**
   * Simple heuristic fact extraction using regex patterns.
   * No LLM required — works offline.
   */
  extractFactsHeuristic(text: string): ExtractedFact[] {
    const facts: ExtractedFact[] = [];

    for (const { type, pattern, key, confidence } of FACT_PATTERNS) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const value = match[1].trim();

        // Skip very short values (likely false positives)
        if (value.length < 2) continue;

        // Skip if we already extracted this type (keep first match)
        if (facts.some((f) => f.key === key)) continue;

        // Clean up preference values
        let cleanValue = value;
        if (type === "preference" || type === "dislike") {
          // Remove trailing punctuation
          cleanValue = value.replace(/[.,;:!]+$/, "").trim();
        }

        facts.push({ key, value: cleanValue, type, confidence });
      }
    }

    return facts;
  }

  /**
   * Extract facts using an LLM (optional, best-effort).
   * Falls back to heuristic extraction if LLM is unavailable.
   */
  private async extractFactsLLM(userMessage: string, agentResponse: string): Promise<ExtractedFact[]> {
    if (!this.llm) return [];

    const prompt = [
      "Extract key facts about the user from this conversation. Return ONLY a JSON array of objects with keys: key, value, type, confidence.",
      "Types: name, organization, project, preference, tech_stack, contact, date, location",
      "Confidence: 0.0-1.0 (how confident you are this is a factual statement about the user)",
      "Only extract definite facts, not assumptions. If no facts found, return an empty array.",
      "",
      "User: " + userMessage,
      "Assistant: " + agentResponse,
    ].join("\n");

    try {
      const response = await this.llm.chat(
        [{ role: "user", content: prompt }],
        { maxTokens: 500, temperature: 0 },
      );

      const content = response.content.trim();
      // Extract JSON from response (may be wrapped in markdown code block)
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      const jsonStr = (jsonMatch[1] ?? content).trim();
      const parsed = JSON.parse(jsonStr) as Array<{ key: string; value: string; type: string; confidence: number }>;

      return parsed.map((item) => ({
        key: item.key,
        value: String(item.value),
        type: item.type as ExtractedFact["type"],
        confidence: Number(item.confidence) || 0.5,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Score how relevant a fact is to a given user message.
   * Uses simple keyword overlap scoring.
   */
  private scoreRelevance(key: string, value: string, message: string): number {
    const messageLower = message.toLowerCase();
    const keyLower = key.toLowerCase();
    const valueLower = value.toLowerCase();

    // Split into tokens
    const messageTokens = new Set(messageLower.split(/\W+/).filter(Boolean));
    const valueTokens = valueLower.split(/\W+/).filter(Boolean);
    const keyTokens = keyLower.split(/[._]/).filter(Boolean);

    // Calculate overlap score
    let matches = 0;
    const allFactTokens = [...keyTokens, ...valueTokens];

    for (const token of allFactTokens) {
      if (token.length < 2) continue;
      if (messageTokens.has(token)) matches++;
      // Also check for partial matches (e.g., "rust" matches "rustic" is not good,
      // but "python" matching "python3" is)
      if (token.length >= 4) {
        for (const msgToken of messageTokens) {
          if (msgToken.includes(token) || token.includes(msgToken)) {
            matches += 0.5;
            break;
          }
        }
      }
    }

    // Normalize by total fact tokens (avoid bias towards longer values)
    const nonTrivialTokens = allFactTokens.filter((t) => t.length >= 2);
    const score = nonTrivialTokens.length > 0 ? matches / nonTrivialTokens.length : 0;

    // Boost certain fact types that are always relevant
    if (keyLower.includes("name")) return Math.max(score, 0.5);
    if (keyLower.includes("project")) return Math.max(score, 0.4);
    if (keyLower.includes("preference")) return Math.max(score, 0.3);

    return score;
  }

  /**
   * List all conversation facts stored in Brain.
   */
  listFacts(): Record<string, string> {
    return this.brain.getAllFacts();
  }

  /**
   * Manually add a fact to Brain.
   */
  async addFact(key: string, value: string): Promise<void> {
    await this.brain.setFact(key, value);
  }

  /**
   * Delete a fact from Brain.
   */
  async deleteFact(key: string): Promise<void> {
    await this.brain.deleteFact(key);
  }
}
