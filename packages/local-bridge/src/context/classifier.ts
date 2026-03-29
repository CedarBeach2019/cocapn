/**
 * Task Complexity Classifier — heuristics-based complexity detection.
 *
 * Analyzes incoming messages to classify task complexity without requiring
 * an LLM call. Uses lightweight heuristics to determine the appropriate
 * context budget for agent responses.
 *
 * Complexity levels:
 * - trivial: < 50 chars, single question, status query
 * - simple: < 200 chars, single action
 * - moderate: < 500 chars, multi-step but clear
 * - complex: > 500 chars, or contains refactor/redesign/architecture/implement/system
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ComplexityLevel = 'trivial' | 'simple' | 'moderate' | 'complex';
export type ContextBudget = 'minimal' | 'low' | 'medium' | 'full';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface ClassificationResult {
  complexity: ComplexityLevel;
  contextBudget: ContextBudget;
  estimatedTokens: number;
  reason: string;
}

// ─── Complexity Classifier ────────────────────────────────────────────────────

export class TaskComplexityClassifier {
  private readonly COMPLEXITY_KEYWORDS = [
    'refactor', 'redesign', 'architecture', 'implement', 'build', 'system',
    'create', 'develop', 'design', 'construct', 'engineering', 'framework',
    'rewrite', 'restructure', 'reorganize', 'replatform', 'migrate',
  ];

  private readonly THRESHOLDS = {
    trivial: 50,
    simple: 200,
    moderate: 500,
  };

  private readonly TOKEN_ESTIMATES = {
    trivial: 500,
    simple: 2000,
    moderate: 5000,
    complex: 15000,
  };

  /**
   * Classify a single message without conversation history.
   */
  classify(message: string): ClassificationResult {
    return this.classifyWithHistory(message, []);
  }

  /**
   * Classify a message with conversation history context.
   * History length affects complexity classification.
   */
  classifyWithHistory(message: string, history: Message[]): ClassificationResult {
    let level: ComplexityLevel;
    let reason: string;

    // Extract message features
    const trimmed = message.trim();
    const length = trimmed.length;
    const hasCodeBlock = trimmed.includes('```');
    const lowerMessage = trimmed.toLowerCase();
    const hasComplexKeywords = this.COMPLEXITY_KEYWORDS.some(kw => lowerMessage.includes(kw));
    const questionCount = (trimmed.match(/\?/g) || []).length;
    const historyLength = history.filter(m => m.role !== 'system').length;

    // Base classification by length
    if (length < this.THRESHOLDS.trivial) {
      level = 'trivial';
      reason = `Message is ${length} chars (<${this.THRESHOLDS.trivial})`;
    } else if (length < this.THRESHOLDS.simple) {
      level = 'simple';
      reason = `Message is ${length} chars (<${this.THRESHOLDS.simple})`;
    } else if (length < this.THRESHOLDS.moderate) {
      level = 'moderate';
      reason = `Message is ${length} chars (<${this.THRESHOLDS.moderate})`;
    } else {
      level = 'complex';
      reason = `Message is ${length} chars (>=${this.THRESHOLDS.moderate})`;
    }

    // Apply modifiers

    // Complex keywords bump to complex
    if (hasComplexKeywords) {
      level = 'complex';
      reason = 'Contains architecture/implementation keywords';
    }

    // Code blocks bump one level
    if (hasCodeBlock && level !== 'complex') {
      level = this.bumpLevel(level);
      reason += ' + code block';
    }

    // Deep conversation history (more than 10 messages) bumps one level
    if (historyLength > 10 && level !== 'complex') {
      level = this.bumpLevel(level);
      reason += ` + deep history (${historyLength} messages)`;
    }

    // Multiple questions bump one level
    if (questionCount > 1 && level !== 'complex') {
      level = this.bumpLevel(level);
      reason += ` + ${questionCount} questions`;
    }

    // Pure question marks (no action words) stay trivial/simple
    if (this.isPureQuestion(trimmed) && level !== 'complex') {
      // Keep at trivial or simple level, don't bump from these
      if (level === 'moderate') {
        level = 'simple';
        reason = 'Pure question, no action required';
      }
    }

    // Map complexity to context budget and estimate tokens
    const contextBudget = this.complexityToBudget(level);
    const estimatedTokens = this.TOKEN_ESTIMATES[level];

    return {
      complexity: level,
      contextBudget,
      estimatedTokens,
      reason,
    };
  }

  /**
   * Determine if a message is a pure question (no action words).
   */
  private isPureQuestion(message: string): boolean {
    const actionWords = ['write', 'create', 'make', 'build', 'fix', 'update', 'change', 'delete', 'add', 'remove'];
    const lower = message.toLowerCase();

    // Has question mark
    const hasQuestion = lower.includes('?');
    if (!hasQuestion) return false;

    // No action words
    const hasAction = actionWords.some(word => lower.includes(word));
    if (hasAction) return false;

    // Short enough to be a question
    return message.length < 200;
  }

  /**
   * Bump complexity level by one step.
   */
  private bumpLevel(current: ComplexityLevel): ComplexityLevel {
    const levels: ComplexityLevel[] = ['trivial', 'simple', 'moderate', 'complex'];
    const idx = levels.indexOf(current);
    if (idx < levels.length - 1) {
      return levels[idx + 1]!;
    }
    return current;
  }

  /**
   * Map complexity level to context budget.
   */
  private complexityToBudget(complexity: ComplexityLevel): ContextBudget {
    switch (complexity) {
      case 'trivial':
        return 'minimal';
      case 'simple':
        return 'low';
      case 'moderate':
        return 'medium';
      case 'complex':
        return 'full';
    }
  }
}
