/**
 * Repo Map — Aider-style file ranking for cocapn.
 *
 * Scans source files, extracts exports/imports, builds a dependency graph,
 * ranks files by PageRank-like importance (files imported by many others rank higher).
 * @target <80 lines, zero runtime deps.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

export interface FileEntry {
  path: string;
  exports: string[];
  imports: string[];
  importCount: number;
  rank: number;
}

const EXTS = new Set(['.ts', '.js', '.py', '.md']);
const SKIP = new Set(['node_modules', '.git', '.cocapn', 'dist']);

export function scanFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, pfx: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const rel = pfx ? `${pfx}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(join(d, e.name), rel); }
      else if (EXTS.has(extname(e.name))) out.push(rel);
    }
  };
  walk(dir, '');
  return out.sort();
}

export function extractNames(src: string): string[] {
  const re = new RegExp('export\\s+(?:function|const|let|var|class|interface|type|enum)\\s+(\\w+)|def\\s+(\\w+)|class\\s+(\\w+)', 'g');
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) names.push(m[1] || m[2] || m[3]);
  return [...new Set(names)];
}

export function extractImports(src: string): string[] {
  const re = /(?:import|require)\b.*?['"]([^'"]+)['"]/g;
  const paths: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) paths.push(m[1]);
  return [...new Set(paths)];
}

export function buildGraph(
  files: Map<string, { exports: string[]; imports: string[] }>,
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const [file, { imports: paths }] of files) {
    const deps = new Set<string>();
    for (const imp of paths) {
      if (!imp.startsWith('.')) continue;
      const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
      const resolved = (dir ? `${dir}/` : '') + imp.replace(/^\.\/?/, '');
      const base = resolved.replace(/\.(ts|js)$/, '');
      for (const ext of ['', '.ts', '.js']) {
        const candidate = base + ext;
        if (files.has(candidate)) { deps.add(candidate); break; }
      }
    }
    graph.set(file, deps);
  }
  return graph;
}

export function rankFiles(graph: Map<string, Set<string>>, iter = 20): Map<string, number> {
  const files = [...graph.keys()];
  const n = files.length;
  if (n === 0) return new Map();
  // Build reverse graph: who imports each file
  const inLinks = new Map<string, Set<string>>();
  for (const f of files) inLinks.set(f, new Set());
  for (const [file, deps] of graph) for (const dep of deps) inLinks.get(dep)?.add(file);
  const ranks = new Map(files.map(f => [f, 1 / n]));
  for (let i = 0; i < iter; i++) {
    const next = new Map(files.map(f => [f, 0]));
    for (const [file, importers] of inLinks) {
      const out = importers.size || 1;
      for (const imp of importers) next.set(file, (next.get(file) ?? 0) + (ranks.get(imp) ?? 0) / (graph.get(imp)?.size || 1));
    }
    for (const f of files) ranks.set(f, 0.85 / n + 0.15 * (next.get(f) ?? 0));
  }
  return ranks;
}

export function generateRepoMap(dir: string): FileEntry[] {
  const paths = scanFiles(dir);
  const data = new Map<string, { exports: string[]; imports: string[] }>();
  for (const p of paths) {
    try {
      const src = readFileSync(join(dir, p), 'utf-8');
      data.set(p, { exports: extractNames(src), imports: extractImports(src) });
    } catch { data.set(p, { exports: [], imports: [] }); }
  }
  const graph = buildGraph(data);
  const ranks = rankFiles(graph);
  return paths.map(p => ({
    path: p, exports: data.get(p)!.exports, imports: data.get(p)!.imports,
    importCount: graph.get(p)?.size ?? 0, rank: ranks.get(p) ?? 0,
  })).sort((a, b) => b.rank - a.rank);
}
