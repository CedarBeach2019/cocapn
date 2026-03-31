/**
 * Extract — learn from conversations.
 *
 * After each chat response, extracts facts, decisions, questions,
 * and emotional tone from user messages using simple keyword matching.
 * Saves extracted facts to memory automatically.
 */

import type { Memory } from './memory.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface Extraction {
  facts: Array<{ key: string; value: string }>;
  decisions: string[];
  questions: string[];
  tone: 'positive' | 'negative' | 'neutral';
}

// ─── Tone keywords ─────────────────────────────────────────────────────────────

const POSITIVE = /\b(love|great|awesome|happy|thanks|perfect|excellent|amazing|cool|nice|good|wonderful|excited)\b/i;
const NEGATIVE = /\b(hate|bad|awful|angry|frustrated|annoyed|broken|terrible|worst|ugly|slow|bug|error|fail)\b/i;

// ─── Public API ────────────────────────────────────────────────────────────────

/** Extract learnings from a user message and auto-save facts to memory. */
export function extract(message: string, memory: Memory): Extraction {
  const result: Extraction = { facts: [], decisions: [], questions: [], tone: 'neutral' };

  // Tone
  if (POSITIVE.test(message)) result.tone = 'positive';
  else if (NEGATIVE.test(message)) result.tone = 'negative';

  // Questions — sentences ending with ?
  const sentences = message.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  result.questions = sentences.filter(s => s.endsWith('?')).map(s => s + '?');

  // Facts — "I am X", "my name is X", "I like X", "I live in X", "I prefer X"
  const factPatterns: Array<{ re: RegExp; key: (m: RegExpMatchArray) => string }> = [
    { re: /\bmy name is (\w+)/i, key: (m) => 'user.name' },
    { re: /\bI(?:'m| am) from ([^,.!?]+)/i, key: () => 'user.location' },
    { re: /\bI live in ([^,.!?]+)/i, key: () => 'user.location' },
    { re: /\bI like ([^,.!?]+)/i, key: (m) => `user.likes.${m[1].trim().split(/\s+/)[0].toLowerCase()}` },
    { re: /\bI prefer ([^,.!?]+)/i, key: () => 'user.preference' },
    { re: /\bI use ([^,.!?]+)/i, key: () => 'user.tool' },
  ];

  for (const { re, key } of factPatterns) {
    const match = message.match(re);
    if (match) {
      const k = key(match);
      const v = match[1].trim();
      result.facts.push({ key: k, value: v });
      memory.facts[k] = v;
    }
  }

  // Decisions — "let's X", "we should X", "I'll X", "use X instead of Y"
  const decisionPatterns = [
    /let's ([^,.!?]+)/gi, /we should ([^,.!?]+)/gi,
    /I'll ([^,.!?]+)/gi, /use (\w+) instead of (\w+)/gi,
  ];
  for (const re of decisionPatterns) {
    let m;
    while ((m = re.exec(message)) !== null) {
      result.decisions.push(m[0]);
    }
  }

  // Persist facts
  if (result.facts.length > 0) memory['save']();

  return result;
}
