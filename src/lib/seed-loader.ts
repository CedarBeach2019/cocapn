// ═══════════════════════════════════════════════════════════════════
// Phase 4B — Seed Loader
// Parses /api/seed responses into knowledge graph nodes/edges
// Author: Superinstance & Lucineer (DiGennaro et al.)
// ═══════════════════════════════════════════════════════════════════

import type { KGNode, KGEdge } from './knowledge-graph.js';

export function parseSeedToGraph(seedData: any, domain: string): { nodes: KGNode[]; edges: KGEdge[] } {
  const nodes: KGNode[] = [];
  const edges: KGEdge[] = [];
  const now = Date.now();
  const nodeId = (label: string) => `${domain}:${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  // Domain root concept
  nodes.push({
    id: nodeId(seedData.domain || domain),
    label: seedData.domain || domain,
    type: 'concept',
    domain,
    confidence: 1.0,
    created: now,
    accessed: now,
    accessCount: 0,
  });

  // Description as a fact
  if (seedData.description) {
    nodes.push({
      id: nodeId(`desc:${seedData.description.slice(0, 60)}`),
      label: seedData.description,
      type: 'fact',
      domain,
      confidence: 0.9,
      created: now,
      accessed: now,
      accessCount: 0,
    });
    edges.push({ from: nodeId(seedData.domain || domain), to: nodeId(`desc:${seedData.description.slice(0, 60)}`), relation: 'applies_to', weight: 0.8, domain });
  }

  // Principles as concepts
  if (Array.isArray(seedData.principles)) {
    for (const p of seedData.principles) {
      const pid = nodeId(p);
      nodes.push({ id: pid, label: p, type: 'concept', domain, confidence: 0.8, created: now, accessed: now, accessCount: 0 });
      edges.push({ from: nodeId(seedData.domain || domain), to: pid, relation: 'extends', weight: 0.7, domain });
    }
    // Chain principles together
    for (let i = 0; i < seedData.principles.length - 1; i++) {
      edges.push({ from: nodeId(seedData.principles[i]), to: nodeId(seedData.principles[i + 1]), relation: 'similar_to', weight: 0.5, domain });
    }
  }

  // System prompt as a procedure
  if (seedData.systemPrompt) {
    nodes.push({
      id: nodeId('system-prompt'),
      label: seedData.systemPrompt,
      type: 'procedure',
      domain,
      confidence: 0.95,
      created: now,
      accessed: now,
      accessCount: 0,
    });
    edges.push({ from: nodeId(seedData.domain || domain), to: nodeId('system-prompt'), relation: 'depends_on', weight: 0.9, domain });
  }

  // Any top-level arrays become concepts/patterns
  for (const [key, val] of Object.entries(seedData)) {
    if (['domain', 'description', 'principles', 'systemPrompt', 'seedVersion'].includes(key)) continue;
    if (Array.isArray(val)) {
      const parentLabel = key;
      const parentId = nodeId(parentLabel);
      nodes.push({ id: parentId, label: parentLabel, type: 'pattern', domain, confidence: 0.7, created: now, accessed: now, accessCount: 0 });
      edges.push({ from: nodeId(seedData.domain || domain), to: parentId, relation: 'extends', weight: 0.6, domain });
      for (const item of val as string[]) {
        if (typeof item === 'string') {
          const iid = nodeId(`${key}:${item}`);
          nodes.push({ id: iid, label: item, type: 'pattern', domain, confidence: 0.6, created: now, accessed: now, accessCount: 0 });
          edges.push({ from: parentId, to: iid, relation: 'extends', weight: 0.5, domain });
        }
      }
    } else if (typeof val === 'string' && val.length > 10) {
      const sid = nodeId(key);
      nodes.push({ id: sid, label: val, type: 'fact', domain, confidence: 0.7, created: now, accessed: now, accessCount: 0 });
      edges.push({ from: nodeId(seedData.domain || domain), to: sid, relation: 'applies_to', weight: 0.6, domain });
    }
  }

  return { nodes, edges };
}

export async function loadSeedIntoKG(env: any, seedData: any, domain: string): Promise<{ nodes: number; edges: number }> {
  const { nodes, edges } = parseSeedToGraph(seedData, domain);
  const { addNode, addEdge } = await import('./knowledge-graph.js');
  for (const n of nodes) await addNode(env, n);
  for (const e of edges) await addEdge(env, e);
  return { nodes: nodes.length, edges: edges.length };
}

// Fleet repos for cross-domain queries
export const FLEET_REPOS = [
  'studylog-ai', 'dmlog-ai', 'petlog-ai', 'healthlog-ai', 'nightlog-ai',
  'gardenlog-ai', 'musiclog-ai', 'podcast-ai', 'sciencelog-ai', 'kungfu-ai',
  'mycelium-ai', 'craftlog-ai', 'makerlog-ai', 'travelog-ai',
];

export async function loadAllSeeds(env: any, repos: string[]): Promise<{ nodes: number; edges: number }> {
  let totalNodes = 0;
  let totalEdges = 0;
  for (const repo of repos) {
    try {
      const resp = await fetch(`https://${repo}.superinstance.workers.dev/api/seed`);
      if (!resp.ok) continue;
      const data = await resp.json();
      const result = await loadSeedIntoKG(env, data, repo);
      totalNodes += result.nodes;
      totalEdges += result.edges;
    } catch { /* skip offline repos */ }
  }
  return { nodes: totalNodes, edges: totalEdges };
}
