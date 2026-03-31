/**
 * Learn — extract knowledge from conversations and files.
 *
 * After each chat, detects URLs, facts with sources, and file mentions.
 * Provides /learn, /knowledge search/list/clear commands.
 *
 * Zero dependencies. Uses only Node.js built-ins.
 */

import { existsSync } from 'node:fs';
import type { Knowledge } from './knowledge.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface LearnResult {
  urls: string[];
  facts: Array<{ content: string; source: string }>;
  fileMentions: string[];
}

// ─── Public API ────────────────────────────────────────────────────────────────

/** Scan a message for learnable content (URLs, sourced facts, file paths). */
export function learn(message: string): LearnResult {
  const result: LearnResult = { urls: [], facts: [], fileMentions: [] };

  // URLs
  const urlRe = /https?:\/\/[^\s)\]"']+/g;
  let m;
  while ((m = urlRe.exec(message)) !== null) {
    result.urls.push(m[0]);
  }

  // Facts with sources: "X according to Y", "X (source: Y)", "X — source: Y"
  const sourceRe = /([^.!?\n]{10,}?)\s*(?:according to|\(source:\s*|—\s*source:\s*)([^)!?\n]+)/gi;
  while ((m = sourceRe.exec(message)) !== null) {
    result.facts.push({ content: m[1].trim(), source: m[2].trim() });
  }

  // File mentions: "file.ext", "/path/to/file"
  const fileRe = /(?:^|\s)([\w/.-]+\.\w{1,10})(?:\s|$|[,.)])/gm;
  while ((m = fileRe.exec(message)) !== null) {
    const f = m[1];
    if (!f.startsWith('http') && !f.includes('://') && f.length > 3) {
      result.fileMentions.push(f);
    }
  }

  return result;
}

/** Import a file into the knowledge base. Returns status message. */
export function importToKnowledge(kb: Knowledge, filePath: string): string {
  if (!existsSync(filePath)) return `File not found: ${filePath}`;
  try {
    const count = kb.importFile(filePath);
    return `Imported ${count} entries from ${filePath}`;
  } catch (e: unknown) {
    return `Import failed: ${String(e)}`;
  }
}

/** Handle /knowledge commands. Returns output string. */
export function handleKnowledgeCommand(kb: Knowledge, input: string): string {
  const tokens = input.trim().split(/\s+/);
  const sub = tokens[1] ?? '';
  const arg = tokens.slice(2).join(' ');

  if (sub === 'search') {
    if (!arg) return 'Usage: /knowledge search <query>';
    const results = kb.search(arg, 10);
    if (results.length === 0) return `No knowledge matching "${arg}"`;
    return results.map(e => `[${e.type}] ${e.content.slice(0, 100)}${e.content.length > 100 ? '...' : ''} (${e.source})`).join('\n');
  }

  if (sub === 'list') {
    const entries = kb.list(arg || undefined, 20);
    if (entries.length === 0) return '(no knowledge entries)';
    return entries.map(e => `[${e.type}] ${e.content.slice(0, 80)}${e.content.length > 80 ? '...' : ''}`).join('\n');
  }

  if (sub === 'clear') {
    kb.clear();
    return 'Knowledge base cleared.';
  }

  return 'Usage: /knowledge search <query> | list [type] | clear';
}

/** Save learnable facts from a message into the knowledge base. */
export function saveLearnings(kb: Knowledge, message: string): number {
  const { facts, urls } = learn(message);
  let count = 0;
  for (const fact of facts) {
    kb.save({
      id: `learn-${Date.now()}-${count}`,
      type: 'fact',
      content: fact.content,
      source: fact.source,
      confidence: 0.8,
      tags: ['conversation'],
    });
    count++;
  }
  for (const url of urls) {
    kb.save({
      id: `url-${Date.now()}-${count}`,
      type: 'url',
      content: url,
      source: 'conversation',
      confidence: 0.7,
      tags: ['url'],
    });
    count++;
  }
  return count;
}
