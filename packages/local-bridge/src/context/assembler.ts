/**
 * Context Assembler — dynamic context assembly based on task complexity.
 *
 * Builds agent context payloads based on the specified budget level.
 * Different budgets include different amounts of information:
 *
 * - minimal (~500 tokens): System prompt only. No repo map, no files. For status queries.
 * - low (~2000 tokens): System prompt + repo map summary (compact). For simple edits.
 * - medium (~5000 tokens): System prompt + repo map + relevant Brain facts + 1-2 files.
 * - full (~15000 tokens): System prompt + repo map + facts + skills + up to 5 files + history.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Brain } from '../brain/index.js';
import type { SkillLoader } from '../skills/loader.js';
import type { ContextBudget, Message } from './classifier.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContextRequest {
  task: string;
  budget: ContextBudget;
  activeModule?: string;
  activeSkill?: string;
  conversationHistory: Message[];
  maxFiles?: number;
}

export interface AssembledContext {
  systemPrompt: string;
  repoMap?: string;
  relevantFacts: string[];
  skillContext?: string;
  fileContents: Array<{ path: string; content: string }>;
  conversationHistory: Message[];
  totalTokens: number;
  reason: string;
}

export interface ContextAssemblerOptions {
  brain?: Brain;
  skillLoader?: SkillLoader;
  systemPrompt?: string;
  repoRoot?: string;
}

// ─── Token Budget Constants ───────────────────────────────────────────────────

const TOKEN_BUDGETS = {
  minimal: 500,
  low: 2000,
  medium: 5000,
  full: 15000,
};

const TOKEN_COSTS = {
  systemPrompt: 200, // Base system prompt
  repoMapCompact: 300,
  repoMapFull: 1000,
  fact: 50, // Per fact
  skillContext: 200,
  fileContent: 1000, // Per file (average estimate)
  historyMessage: 100, // Per history message
};

// ─── Context Assembler ────────────────────────────────────────────────────────

export class ContextAssembler {
  private brain?: Brain;
  private skillLoader?: SkillLoader;
  private systemPrompt: string;
  private repoRoot?: string;

  constructor(options: ContextAssemblerOptions = {}) {
    this.brain = options.brain;
    this.skillLoader = options.skillLoader;
    this.systemPrompt = options.systemPrompt || this.defaultSystemPrompt();
    this.repoRoot = options.repoRoot;
  }

  /**
   * Assemble context based on the specified budget level.
   */
  async assemble(request: ContextRequest): Promise<AssembledContext> {
    const { budget, task, conversationHistory } = request;

    // Initialize token counter
    let tokens = TOKEN_COSTS.systemPrompt;

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(request);

    // Build repo map (if budget allows — graph module removed)
    let repoMap: string | undefined;

    // Gather relevant facts (if budget allows)
    let relevantFacts: string[] = [];
    if (budget !== 'minimal' && this.brain) {
      relevantFacts = await this.gatherRelevantFacts(task, budget);
      tokens += relevantFacts.length * TOKEN_COSTS.fact;
    }

    // Build skill context (if active skill and budget allows)
    let skillContext: string | undefined;
    if (request.activeSkill && budget !== 'minimal' && this.skillLoader) {
      skillContext = await this.buildSkillContext(request.activeSkill);
      tokens += TOKEN_COSTS.skillContext;
    }

    // Include file contents (if budget allows)
    let fileContents: Array<{ path: string; content: string }> = [];
    if (budget !== 'minimal' && request.activeModule) {
      fileContents = await this.gatherFileContents(request);
      tokens += fileContents.length * TOKEN_COSTS.fileContent;
    }

    // Include conversation history (if budget allows)
    const includedHistory = this.selectHistory(conversationHistory, budget, tokens);
    tokens += includedHistory.length * TOKEN_COSTS.historyMessage;

    return {
      systemPrompt,
      repoMap,
      relevantFacts,
      skillContext,
      fileContents,
      conversationHistory: includedHistory,
      totalTokens: tokens,
      reason: this.explainBudget(budget),
    };
  }

  /**
   * Build the system prompt with contextual information.
   */
  private buildSystemPrompt(request: ContextRequest): string {
    let prompt = this.systemPrompt;

    if (request.activeModule) {
      prompt += `\n\nActive module: ${request.activeModule}`;
    }

    if (request.activeSkill) {
      prompt += `\n\nActive skill: ${request.activeSkill}`;
    }

    return prompt;
  }

  /**
   * Gather relevant facts from brain based on task and budget.
   */
  private async gatherRelevantFacts(task: string, budget: ContextBudget): Promise<string[]> {
    if (!this.brain) return [];

    try {
      // Use hybrid search if available, otherwise fall back to simple fact search
      const facts: string[] = [];
      const maxFacts = budget === 'full' ? 10 : budget === 'medium' ? 5 : 2;

      // Try to get relevant facts via search (if brain has search capability)
      if (typeof this.brain.search === 'function') {
        const results = await this.brain.search(task, { limit: maxFacts });
        for (const result of results) {
          if (result.key && result.value) {
            facts.push(`${result.key}: ${result.value}`);
          }
        }
      }

      return facts.slice(0, maxFacts);
    } catch (error) {
      console.error('[context] Failed to gather relevant facts:', error);
      return [];
    }
  }

  /**
   * Build skill context for the active skill.
   */
  private async buildSkillContext(skillName: string): Promise<string> {
    if (!this.skillLoader) return '';

    try {
      const skill = this.skillLoader.load(skillName);
      if (!skill) return '';

      return `Skill: ${skill.name}\nDescription: ${skill.description}\n${skill.instructions || ''}`;
    } catch (error) {
      console.error('[context] Failed to build skill context:', error);
      return '';
    }
  }

  /**
   * Gather file contents based on active module/task.
   */
  private async gatherFileContents(request: ContextRequest): Promise<Array<{ path: string; content: string }>> {
    if (!this.repoRoot) return [];

    const files: Array<{ path: string; content: string }> = [];
    const maxFiles = request.maxFiles || (request.budget === 'full' ? 5 : request.budget === 'medium' ? 2 : 0);

    // Extract file paths from task if mentioned
    const fileMatches = request.task.match(/[\w-]+\.(ts|js|json|md)/g) || [];

    for (const match of fileMatches.slice(0, maxFiles)) {
      try {
        const filePath = join(this.repoRoot, match);
        const content = await readFile(filePath, 'utf-8');
        files.push({ path: match, content });
      } catch (error) {
        // File not found or unreadable - skip
        console.debug(`[context] Could not read file ${match}:`, error);
      }
    }

    return files;
  }

  /**
   * Select conversation history based on remaining token budget.
   */
  private selectHistory(history: Message[], budget: ContextBudget, currentTokens: number): Message[] {
    const budgetRemaining = TOKEN_BUDGETS[budget] - currentTokens;
    const maxMessages = Math.floor(budgetRemaining / TOKEN_COSTS.historyMessage);

    if (maxMessages <= 0) return [];

    // Return most recent messages up to the limit
    return history.slice(-maxMessages);
  }

  /**
   * Explain the budget choice for debugging/transparency.
   */
  private explainBudget(budget: ContextBudget): string {
    switch (budget) {
      case 'minimal':
        return 'System prompt only - for quick status queries';
      case 'low':
        return 'System prompt + compact repo map - for simple edits';
      case 'medium':
        return 'System prompt + repo map + facts + files - for moderate tasks';
      case 'full':
        return 'Full context - for complex, multi-step tasks';
    }
  }

  /**
   * Default system prompt for agents.
   */
  private defaultSystemPrompt(): string {
    return `You are a helpful AI assistant with access to a codebase and user memory.
Follow the user's instructions precisely. When making code changes, explain your reasoning briefly.
If you need more context, ask for it rather than making assumptions.`;
  }
}
