/**
 * Reflect — periodic self-reflection for cocapn.
 *
 * Summarizes what the agent has learned, identifies interaction patterns,
 * and updates its self-description based on accumulated knowledge.
 * Saves reflection to memory.
 */

import type { Memory } from './memory.js';
import type { Awareness } from './awareness.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Reflection {
  summary: string;
  patterns: string[];
  factCount: number;
  messageCount: number;
  ts: string;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/** Generate a reflection from current memory and awareness state. */
export function reflect(memory: Memory, awareness: Awareness): Reflection {
  const self = awareness.perceive();
  const facts = Object.entries(memory.facts);
  const msgs = memory.messages;
  const now = new Date().toISOString();

  // Identify patterns from message roles
  const userMsgs = msgs.filter(m => m.role === 'user');
  const topics = extractTopics(userMsgs.map(m => m.content));
  const patterns = identifyPatterns(userMsgs, facts);

  // Build summary
  const lines: string[] = [];
  lines.push(`I have ${facts.length} facts and ${msgs.length} messages in memory.`);
  if (facts.length > 0) {
    lines.push(`Key facts: ${facts.slice(0, 5).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }
  if (topics.length > 0) {
    lines.push(`Frequent topics: ${topics.join(', ')}`);
  }
  lines.push(`I am ${self.name}, on ${self.branch} branch, ${self.feeling || 'calm'}.`);

  const reflection: Reflection = {
    summary: lines.join(' '),
    patterns,
    factCount: facts.length,
    messageCount: msgs.length,
    ts: now,
  };

  // Save reflection as a fact for future context
  memory.facts['_lastReflection'] = reflection.summary.slice(0, 200);
  memory.facts['_reflectionTs'] = now;
  memory['save']();

  return reflection;
}

/** Check if reflection is due (idle > 30 min or no previous reflection). */
export function shouldReflect(memory: Memory): boolean {
  const lastTs = memory.facts['_reflectionTs'];
  if (!lastTs) return memory.messages.length > 2;
  const elapsed = Date.now() - new Date(lastTs).getTime();
  return elapsed > 30 * 60 * 1000; // 30 minutes
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function extractTopics(texts: string[]): string[] {
  const stopWords = new Set(['the','a','an','is','are','was','were','i','you','me','my','it','to','of','in','for','and','or','but','not','this','that','with','how','what','when','where','why','do','can','have','has','on','at','be']);
  const counts: Record<string, number> = {};
  for (const text of texts) {
    for (const w of text.toLowerCase().split(/\W+/)) {
      if (w.length > 3 && !stopWords.has(w)) counts[w] = (counts[w] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);
}

function identifyPatterns(userMsgs: Array<{ content: string }>, facts: Array<[string, string]>): string[] {
  const patterns: string[] = [];
  if (userMsgs.length > 10) patterns.push('active conversation');
  if (facts.length > 5) patterns.push('accumulating knowledge');
  const questions = userMsgs.filter(m => m.content.includes('?')).length;
  if (questions > userMsgs.length * 0.4) patterns.push('curious interlocutor');
  return patterns;
}
