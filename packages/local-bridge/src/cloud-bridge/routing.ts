/**
 * Client-side Intent Routing Rules
 *
 * Port of LOG.ai's 16 routing rules to TypeScript.
 * Classifies user messages to determine optimal routing strategy.
 *
 * Routes:
 * - creative: Writing, storytelling, brainstorming, drafting
 * - code: Programming, debugging, code review
 * - analysis: Data analysis, research, summarization
 * - casual: Chat, small talk, general conversation
 * - search: Information lookup, fact-finding
 * - task: Actionable tasks, reminders, planning
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type RouteType =
  | 'creative'
  | 'code'
  | 'analysis'
  | 'casual'
  | 'search'
  | 'task';

export interface RouteResult {
  route: RouteType;
  confidence: number;
  reason?: string;
}

// ─── Routing Rules ─────────────────────────────────────────────────────────────

interface RoutingRule {
  pattern: RegExp;
  route: RouteType;
  confidence: number;
  reason: string;
}

const ROUTING_RULES: RoutingRule[] = [
  // 1. Code patterns (highest priority)
  {
    pattern: /\b(function|class|const|let|var|import|export|return|if|else|for|while|async|await)\b|[{()}]/g,
    route: 'code',
    confidence: 0.9,
    reason: 'Code syntax detected',
  },
  {
    pattern: /\b(debug|bug|error|exception|fix|refactor|compile|syntax|runtime)\b/gi,
    route: 'code',
    confidence: 0.85,
    reason: 'Debug/fix terminology',
  },
  {
    pattern: /```(?:ts|js|py|java|go|rs|cpp|c\b|html|css|json|sql|sh|bash)/g,
    route: 'code',
    confidence: 0.95,
    reason: 'Code block marker',
  },

  // 2. Creative patterns
  {
    pattern: /\b(write|story|poem|essay|draft|narrative|character|plot|dialogue|creative)\b/gi,
    route: 'creative',
    confidence: 0.85,
    reason: 'Creative writing request',
  },
  {
    pattern: /\b(imagine|brainstorm|idea|concept|invent|create|design|vision)\b/gi,
    route: 'creative',
    confidence: 0.8,
    reason: 'Ideation request',
  },
  {
    pattern: /\b(title|headline|caption|slogan|tagline|marketing copy)\b/gi,
    route: 'creative',
    confidence: 0.8,
    reason: 'Copywriting request',
  },

  // 3. Analysis patterns
  {
    pattern: /\b(analyze|analysis|summarize|summary|compare|contrast|evaluate)\b/gi,
    route: 'analysis',
    confidence: 0.85,
    reason: 'Analysis request',
  },
  {
    pattern: /\b(statistics|stats|trend|pattern|insight|correlation)\b/gi,
    route: 'analysis',
    confidence: 0.8,
    reason: 'Data analysis terminology',
  },
  {
    pattern: /\b(report|findings|conclusion|methodology|results)\b/gi,
    route: 'analysis',
    confidence: 0.8,
    reason: 'Report terminology',
  },

  // 4. Search patterns
  {
    pattern: /\b(what is|who is|when did|where is|how do|how to|find|search|look up)\b/gi,
    route: 'search',
    confidence: 0.75,
    reason: 'Question format',
  },
  {
    pattern: /\b(define|meaning|explanation|tell me about|information on)\b/gi,
    route: 'search',
    confidence: 0.7,
    reason: 'Definition request',
  },

  // 5. Task patterns
  {
    pattern: /\b(remind|schedule|calendar|todo|task|deadline|meeting|appointment)\b/gi,
    route: 'task',
    confidence: 0.85,
    reason: 'Task/schedule terminology',
  },
  {
    pattern: /\b(plan|organize|track|manage|priority|goal)\b/gi,
    route: 'task',
    confidence: 0.8,
    reason: 'Planning terminology',
  },

  // 6. Casual patterns (lowest priority - fallback)
  {
    pattern: /\b(hi|hello|hey|good morning|good afternoon|good evening|thanks|thank you)\b/gi,
    route: 'casual',
    confidence: 0.7,
    reason: 'Greeting or courtesy',
  },
  {
    pattern: /^(how are you|what's up|sup|how do you feel)/gi,
    route: 'casual',
    confidence: 0.75,
    reason: 'Small talk',
  },
];

// ─── Route Classifier ───────────────────────────────────────────────────────────

/**
 * Classify the intent of a text message
 * Returns the best matching route with confidence score
 */
export function classifyIntent(text: string): RouteResult {
  const results: RouteResult[] = [];

  for (const rule of ROUTING_RULES) {
    const matches = text.match(rule.pattern);
    if (matches) {
      results.push({
        route: rule.route,
        confidence: rule.confidence,
        reason: rule.reason,
      });
    }
  }

  // If no rules match, default to casual
  if (results.length === 0) {
    return {
      route: 'casual',
      confidence: 0.3,
      reason: 'No specific pattern detected (default)',
    };
  }

  // Return the result with highest confidence
  results.sort((a, b) => b.confidence - a.confidence);
  return results[0];
}

// ─── Batch Classification ──────────────────────────────────────────────────────

/**
 * Classify multiple messages (useful for context analysis)
 * Returns the most common route across all messages
 */
export function classifyBatch(texts: string[]): RouteResult {
  if (texts.length === 0) {
    return {
      route: 'casual',
      confidence: 0,
      reason: 'No texts provided',
    };
  }

  const results = texts.map((t) => classifyIntent(t));

  // Count route occurrences
  const routeCounts = new Map<RouteType, number>();
  for (const result of results) {
    const count = routeCounts.get(result.route) || 0;
    routeCounts.set(result.route, count + 1);
  }

  // Find most common route
  let bestRoute: RouteType = 'casual';
  let bestCount = 0;

  for (const [route, count] of routeCounts.entries()) {
    if (count > bestCount) {
      bestRoute = route;
      bestCount = count;
    }
  }

  // Average confidence for the best route
  const routeResults = results.filter((r) => r.route === bestRoute);
  const avgConfidence =
    routeResults.reduce((sum, r) => sum + r.confidence, 0) / routeResults.length;

  return {
    route: bestRoute,
    confidence: avgConfidence,
    reason: `Most common route (${bestCount}/${texts.length} messages)`,
  };
}

// ─── Model Selection ───────────────────────────────────────────────────────────

/**
 * Get recommended model for a given route
 * Returns model name based on route type
 */
export function getModelForRoute(route: RouteType): string {
  const modelMap: Record<RouteType, string> = {
    creative: 'claude-3-opus',
    code: 'claude-3.5-sonnet',
    analysis: 'claude-3.5-sonnet',
    casual: 'deepseek-chat',
    search: 'deepseek-chat',
    task: 'claude-3-haiku',
  };

  return modelMap[route] || 'deepseek-chat';
}
