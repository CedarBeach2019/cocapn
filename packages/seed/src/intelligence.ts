/**
 * Intelligence — repo as teacher for coding agents.
 *
 * Provides deep context, explanations, impact analysis, and history.
 * Two layers: data gathering (git/fs) + LLM synthesis.
 * Zero external deps. Uses only Node.js built-ins + existing LLM class.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LLM } from './llm.js';
import type { ChatMessage } from './llm.js';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface FileContext {
  path: string;
  content: string;
  log: Array<{ hash: string; date: string; msg: string }>;
  imports: string[];
  importedBy: string[];
}

export interface ImpactReport {
  path: string;
  dependents: string[];
  dependencies: string[];
  risk: 'low' | 'medium' | 'high';
  recentChanges: number;
}

export interface HistoryEntry {
  hash: string; date: string; author: string; msg: string; files: string[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function git(cmd: string, dir: string): string {
  try { return execSync(`git ${cmd}`, { cwd: dir, encoding: 'utf-8', timeout: 5000 }).trim(); }
  catch { return ''; }
}

function extractImports(content: string): string[] {
  const re = /(?:import|require)\s.*?['"](\.[^'"]+)['"]/g;
  const out: string[] = [];
  let m; while ((m = re.exec(content)) !== null) out.push(m[1]);
  return out;
}

function findImporters(dir: string, filePath: string): string[] {
  const base = filePath.replace(/\.[^/.]+$/, '');
  const result: string[] = [];
  walkFiles(dir, (f) => {
    if (f === filePath) return;
    try {
      const c = readFileSync(join(dir, f), 'utf-8');
      if (c.includes(base) || c.includes(filePath)) result.push(f);
    } catch { /* skip */ }
  });
  return result;
}

function walkFiles(dir: string, fn: (p: string) => void, prefix = ''): void {
  let entries; try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    if (e.startsWith('.') || e === 'node_modules' || e === 'dist') continue;
    const full = join(dir, e), rel = prefix ? `${prefix}/${e}` : e;
    try { statSync(full).isDirectory() ? walkFiles(full, fn, rel) : fn(rel); } catch { /* skip */ }
  }
}

function buildStructure(dir: string, depth = 0): string {
  if (depth > 3) return '';
  const entries = readdirSync(dir).filter(e => !e.startsWith('.') && e !== 'node_modules' && e !== 'dist');
  return entries.map(e => {
    const full = join(dir, e);
    try {
      return statSync(full).isDirectory()
        ? `${'  '.repeat(depth)}${e}/\n${buildStructure(full, depth + 1)}`
        : `${'  '.repeat(depth)}${e}`;
    } catch { return ''; }
  }).filter(Boolean).join('\n');
}

function readExistingDocs(dir: string): string {
  const paths = ['README.md', 'CLAUDE.md', 'docs/ARCHITECTURE.md', 'ARCHITECTURE.md'];
  return paths.map(p => {
    const full = join(dir, p);
    return existsSync(full) ? `### ${p}\n${readFileSync(full, 'utf-8').slice(0, 1000)}` : '';
  }).filter(Boolean).join('\n\n');
}

// ─── Layer 1: Data Gathering (no LLM, fully testable) ─────────────────────

export function getFileContext(dir: string, filePath: string): FileContext {
  const fullPath = join(dir, filePath);
  const content = existsSync(fullPath) ? readFileSync(fullPath, 'utf-8') : '';
  const logRaw = git(`log --format="%h|%ai|%s" --follow -20 -- ${filePath}`, dir);
  const log = logRaw ? logRaw.split('\n').filter(Boolean).map(l => {
    const [hash, date, ...msg] = l.split('|');
    return { hash, date, msg: msg.join('|') };
  }) : [];
  const imports = extractImports(content);
  const importedBy = findImporters(dir, filePath);
  return { path: filePath, content, log, imports, importedBy };
}

export function assessImpact(dir: string, filePath: string): ImpactReport {
  const dependents = findImporters(dir, filePath);
  const ctx = getFileContext(dir, filePath);
  const risk = dependents.length > 10 ? 'high' as const : dependents.length > 3 ? 'medium' as const : 'low' as const;
  const recentChanges = ctx.log.filter(l => {
    const d = new Date(l.date); return (Date.now() - d.getTime()) < 7 * 86400000;
  }).length;
  return { path: filePath, dependents, dependencies: ctx.imports, risk, recentChanges };
}

export function getHistory(dir: string, topic: string, count = 20): HistoryEntry[] {
  const raw = git(`log -${count} --format="%h|%ai|%an|%s" --all-match --grep="${topic}"`, dir);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(l => {
    const [hash, date, author, ...msg] = l.split('|');
    const filesRaw = git(`diff-tree --no-commit-id --name-only -r --root ${hash}`, dir);
    return { hash, date, author, msg: msg.join('|'), files: filesRaw ? filesRaw.split('\n').filter(Boolean) : [] };
  });
}

// ─── Layer 2: LLM Synthesis ───────────────────────────────────────────────

export async function explainCode(llm: LLM, dir: string, filePath: string, question: string): Promise<string> {
  const ctx = getFileContext(dir, filePath);
  const messages: ChatMessage[] = [
    { role: 'system', content: 'You are an expert code analyst. Explain with deep context about WHY, not just WHAT. Use git history to explain decisions.' },
    { role: 'user', content: `File: ${filePath}\n\nHistory:\n${ctx.log.map(l => `${l.hash} ${l.date}: ${l.msg}`).join('\n')}\n\nImported by: ${ctx.importedBy.join(', ') || 'none'}\n\nCode:\n${ctx.content.slice(0, 4000)}\n\nQuestion: ${question}` },
  ];
  return (await llm.chat(messages)).content;
}

export async function generateClaudeMd(llm: LLM, dir: string): Promise<string> {
  const structure = buildStructure(dir);
  const recentLog = git('log -30 --format="%s"', dir);
  const messages: ChatMessage[] = [
    { role: 'system', content: 'Generate a CLAUDE.md for this repo. Include: architecture, key patterns, conventions, gotchas, and WHY decisions were made. Not just rules — UNDERSTANDING.' },
    { role: 'user', content: `Structure:\n${structure}\n\nRecent commits:\n${recentLog}\n\nExisting docs:\n${readExistingDocs(dir)}` },
  ];
  return (await llm.chat(messages)).content;
}

export async function generateWiki(llm: LLM, dir: string): Promise<Array<{ title: string; content: string }>> {
  const structure = buildStructure(dir);
  const messages: ChatMessage[] = [
    { role: 'system', content: 'Generate wiki pages for this codebase. Each page explains a module/concept with git history context. Return JSON array of {title, content}.' },
    { role: 'user', content: `Structure:\n${structure}\n\nRecent history:\n${git('log -20 --format="%s"', dir)}` },
  ];
  const res = await llm.chat(messages);
  try {
    const json = res.content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(json);
  } catch { return [{ title: 'Overview', content: res.content }]; }
}
