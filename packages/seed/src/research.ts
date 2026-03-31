/**
 * Research — auto-research background process for cocapn.
 *
 * Discovers topics from code, generates deep research documents,
 * stores in .cocapn/research/. Zero external deps.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { LLM } from './llm.js';
import type { ChatMessage } from './llm.js';

function git(cmd: string, dir: string): string {
  try { return execSync(`git ${cmd}`, { cwd: dir, encoding: 'utf-8', timeout: 5000 }).trim(); }
  catch { return ''; }
}

// ─── Topic Discovery ──────────────────────────────────────────────────────

export function discoverTopics(dir: string): string[] {
  const topics = new Set<string>();
  const files = git('ls-files', dir).split('\n').filter(Boolean);
  for (const f of files.slice(0, 50)) {
    try {
      const content = readFileSync(join(dir, f), 'utf-8');
      const matches = content.matchAll(/(?:TODO|FIXME|HACK|NOTE|XXX)[:\s]+(.+)/gi);
      for (const m of matches) topics.add(m[1].trim().slice(0, 80));
    } catch { /* skip */ }
  }
  const log = git('log -30 --format="%s"', dir);
  if (log) for (const l of log.split('\n').filter(Boolean)) topics.add(l);
  for (const d of ['docs', 'doc']) {
    const docDir = join(dir, d);
    if (!existsSync(docDir)) continue;
    for (const f of readdirSync(docDir).filter(f => f.endsWith('.md')).slice(0, 10)) {
      try {
        const first = readFileSync(join(docDir, f), 'utf-8').split('\n')[0];
        if (first?.startsWith('#')) topics.add(first.replace(/^#+\s*/, ''));
      } catch { /* skip */ }
    }
  }
  return [...topics].slice(0, 20);
}

// ─── Research Generation ──────────────────────────────────────────────────

export async function researchTopic(llm: LLM, dir: string, topic: string): Promise<{ topic: string; content: string; sources: string[] }> {
  const log = git(`log -20 --format="%h %s" --all --grep="${topic}"`, dir);
  const grepOut = git(`grep -rl "${topic}" -- *.ts *.js *.md 2>/dev/null`, dir);
  const relevantFiles = grepOut ? grepOut.split('\n').filter(Boolean).slice(0, 5).map(f => {
    try { return `### ${f}\n${readFileSync(join(dir, f), 'utf-8').slice(0, 500)}`; } catch { return ''; }
  }).filter(Boolean).join('\n\n') : '';

  const messages: ChatMessage[] = [
    { role: 'system', content: 'You are a research agent. Generate a deep technical research document. Include: current state, open questions, approaches, and risks.' },
    { role: 'user', content: `Topic: ${topic}\n\nGit history:\n${log || 'No relevant commits'}\n\nRelevant code:\n${relevantFiles || 'No direct references'}` },
  ];
  const res = await llm.chat(messages);
  return { topic, content: res.content, sources: grepOut ? grepOut.split('\n').filter(Boolean) : [] };
}

// ─── Persistence ──────────────────────────────────────────────────────────

export function saveResearch(dir: string, topic: string, content: string, sources: string[]): string {
  const researchDir = join(dir, '.cocapn', 'research');
  if (!existsSync(researchDir)) mkdirSync(researchDir, { recursive: true });
  const slug = topic.toLowerCase().replace(/\W+/g, '-').slice(0, 60);
  const path = join(researchDir, `${slug}.md`);
  const header = [`# ${topic}`, '', `> Generated: ${new Date().toISOString()}`, `> Sources: ${sources.join(', ') || 'git history, code analysis'}`, '', ''];
  writeFileSync(path, header.concat(content).join('\n'), 'utf-8');
  return path;
}

export function listResearch(dir: string): Array<{ topic: string; path: string; ts: string }> {
  const researchDir = join(dir, '.cocapn', 'research');
  if (!existsSync(researchDir)) return [];
  return readdirSync(researchDir).filter(f => f.endsWith('.md')).map(f => {
    const content = readFileSync(join(researchDir, f), 'utf-8');
    const title = content.split('\n')[0]?.replace(/^#\s*/, '') ?? f;
    const tsMatch = content.match(/Generated:\s*(.+)/);
    return { topic: title, path: join(researchDir, f), ts: tsMatch?.[1]?.trim() ?? '' };
  });
}

export function loadResearch(dir: string, slug: string): string | null {
  const path = join(dir, '.cocapn', 'research', `${slug}.md`);
  return existsSync(path) ? readFileSync(path, 'utf-8') : null;
}
