/**
 * Conversation Tracker — maintains conversation state for routing.
 *
 * Tracks active modules, tasks, and conversation context to enable
 * conversation-aware routing. The tracker maintains state per session
 * and suggests modules based on conversation continuity.
 *
 * Key features:
 * - Tracks active module and task across conversation turns
 * - Maintains list of files read during conversation
 * - Suggests module continuation based on conversation state
 * - Detects topic changes and resets state appropriately
 */

import type { ClassificationResult } from './classifier.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConversationState {
  activeModule: string | null;
  activeTask: string | null;
  filesInContext: string[];
  turnCount: number;
  lastClassification: string;
  startTime: number;
  lastActivity: number;
}

export interface ModuleSuggestion {
  module: string | null;
  confidence: number;
  reason: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CONVERSATION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const TOPIC_CHANGE_THRESHOLD = 0.3; // Similarity threshold for topic continuity

// ─── Conversation Tracker ─────────────────────────────────────────────────────

export class ConversationTracker {
  private states: Map<string, ConversationState>;

  constructor() {
    this.states = new Map();
  }

  /**
   * Update conversation state after a message.
   */
  update(
    sessionId: string,
    classification: ClassificationResult,
    module?: string,
    task?: string
  ): ConversationState {
    let state = this.states.get(sessionId);

    if (!state) {
      // Initialize new conversation state
      state = {
        activeModule: module || null,
        activeTask: task || null,
        filesInContext: [],
        turnCount: 1,
        lastClassification: classification.complexity,
        startTime: Date.now(),
        lastActivity: Date.now(),
      };
    } else {
      // Update existing state
      state.turnCount++;
      state.lastClassification = classification.complexity;
      state.lastActivity = Date.now();

      // Update active module if provided
      if (module) {
        state.activeModule = module;
      }

      // Update active task if provided
      if (task) {
        state.activeTask = task;
      }
    }

    this.states.set(sessionId, state);
    return state;
  }

  /**
   * Get current conversation state for a session.
   */
  getState(sessionId: string): ConversationState | null {
    return this.states.get(sessionId) || null;
  }

  /**
   * Check if a session exists and is active (not timed out).
   */
  isActive(sessionId: string): boolean {
    const state = this.states.get(sessionId);
    if (!state) return false;

    const age = Date.now() - state.lastActivity;
    return age < CONVERSATION_TIMEOUT;
  }

  /**
   * Reset conversation state for a session.
   */
  reset(sessionId: string): void {
    this.states.delete(sessionId);
  }

  /**
   * Suggest module based on current conversation state.
   */
  suggestModule(
    sessionId: string,
    currentMessage: string,
    classification: ClassificationResult
  ): ModuleSuggestion {
    const state = this.states.get(sessionId);

    if (!state || !state.activeModule) {
      return {
        module: null,
        confidence: 0,
        reason: 'No active conversation or module',
      };
    }

    // Check if conversation has timed out
    const age = Date.now() - state.lastActivity;
    if (age > CONVERSATION_TIMEOUT) {
      this.reset(sessionId);
      return {
        module: null,
        confidence: 0,
        reason: 'Conversation timed out',
      };
    }

    // Check for topic change (only if we have an active task to compare against)
    if (state.activeTask) {
      const similarity = this.calculateTopicSimilarity(currentMessage, state);
      if (similarity < TOPIC_CHANGE_THRESHOLD) {
        return {
          module: null,
          confidence: 0,
          reason: `Topic changed (similarity: ${similarity.toFixed(2)})`,
        };
      }
    }

    // Calculate confidence based on conversation continuity
    let confidence = 0.5; // Base confidence

    // Higher confidence for deeper conversations
    if (state.turnCount > 3) confidence += 0.2;
    if (state.turnCount > 10) confidence += 0.2;

    // Higher confidence for continued simple/moderate tasks
    if (classification.complexity === 'simple' || classification.complexity === 'moderate') {
      confidence += 0.1;
    }

    // Lower confidence for trivial queries (might be status checks)
    if (classification.complexity === 'trivial') {
      confidence -= 0.2;
    }

    // Cap confidence at 1.0
    confidence = Math.min(confidence, 1.0);

    return {
      module: state.activeModule,
      confidence,
      reason: `Continuing ${state.activeModule} conversation (turn ${state.turnCount}, confidence: ${confidence.toFixed(2)})`,
    };
  }

  /**
   * Track a file being added to conversation context.
   */
  trackFile(sessionId: string, filePath: string): void {
    const state = this.states.get(sessionId);
    if (!state) return;

    if (!state.filesInContext.includes(filePath)) {
      state.filesInContext.push(filePath);
    }

    this.states.set(sessionId, state);
  }

  /**
   * Get files currently in conversation context.
   */
  getFilesInContext(sessionId: string): string[] {
    const state = this.states.get(sessionId);
    return state?.filesInContext || [];
  }

  /**
   * Calculate topic similarity between current message and conversation state.
   */
  private calculateTopicSimilarity(currentMessage: string, state: ConversationState): number {
    if (!state.activeTask) return 0;

    // Simple word overlap similarity
    const currentWords = new Set(currentMessage.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const taskWords = new Set(state.activeTask.toLowerCase().split(/\s+/).filter(w => w.length > 3));

    if (currentWords.size === 0 || taskWords.size === 0) return 0;

    let overlap = 0;
    for (const word of currentWords) {
      if (taskWords.has(word)) overlap++;
    }

    const union = new Set([...currentWords, ...taskWords]);
    return overlap / union.size;
  }

  /**
   * Clean up inactive conversations (older than timeout).
   */
  cleanup(): number {
    let cleaned = 0;
    const now = Date.now();

    for (const [sessionId, state] of this.states.entries()) {
      if (now - state.lastActivity > CONVERSATION_TIMEOUT) {
        this.states.delete(sessionId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get statistics about active conversations.
   */
  getStats(): { total: number; active: number; timeout: number } {
    let active = 0;
    let timeout = 0;
    const now = Date.now();

    for (const state of this.states.values()) {
      if (now - state.lastActivity > CONVERSATION_TIMEOUT) {
        timeout++;
      } else {
        active++;
      }
    }

    return {
      total: this.states.size,
      active,
      timeout,
    };
  }
}
