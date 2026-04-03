// ═══════════════════════════════════════════════════════════════════
// Phase 4B — Fleet Knowledge Graph
// KV-backed unified knowledge graph spanning all Cocapn domains
// Author: Superinstance & Lucineer (DiGennaro et al.)
// ═══════════════════════════════════════════════════════════════════

export interface KGNode {
  id: string;
  label: string;
  type: 'concept' | 'skill' | 'fact' | 'pattern' | 'procedure';
  domain: string;
  confidence: number;
  created: number;
  accessed: number;
  accessCount: number;
}

export interface KGEdge {
  from: string;
  to: string;
  relation: 'extends' | 'applies_to' | 'similar_to' | 'depends_on' | 'conflicts_with';
  weight: number;
  domain: string;
}

const NODE_PREFIX = 'kg:node:';
const EDGE_PREFIX = 'kg:edge:';
const DOMAIN_INDEX = 'kg:domain:';

function nodeKey(id: string): string { return `${NODE_PREFIX}${id}`; }
function edgeKey(from: string, to: string, relation: string): string { return `${EDGE_PREFIX}${from}:${to}:${relation}`; }

export async function addNode(env: any, node: KGNode): Promise<void> {
  const existing: KGNode | null = await env.KG.get(nodeKey(node.id), 'json');
  if (existing) {
    // Merge: bump access, keep higher confidence
    existing.accessCount = (existing.accessCount || 0) + 1;
    existing.accessed = Date.now();
    existing.confidence = Math.max(existing.confidence, node.confidence);
    await env.KG.put(nodeKey(node.id), JSON.stringify(existing));
  } else {
    node.created = node.created || Date.now();
    node.accessed = Date.now();
    node.accessCount = 1;
    await env.KG.put(nodeKey(node.id), JSON.stringify(node));
  }
}

export async function addEdge(env: any, edge: KGEdge): Promise<void> {
  const key = edgeKey(edge.from, edge.to, edge.relation);
  const existing: KGEdge | null = await env.KG.get(key, 'json');
  if (!existing) {
    await env.KG.put(key, JSON.stringify(edge));
  }
}

export async function getNode(env: any, id: string): Promise<KGNode | null> {
  const node = await env.KG.get(nodeKey(id), 'json');
  if (node) {
    node.accessCount = (node.accessCount || 0) + 1;
    node.accessed = Date.now();
    await env.KG.put(nodeKey(id), JSON.stringify(node));
  }
  return node;
}

export async function traverse(env: any, startId: string, maxDepth: number = 2, domain?: string): Promise<{ nodes: KGNode[]; edges: KGEdge[] }> {
  const nodes: Map<string, KGNode> = new Map();
  const edges: KGEdge[] = [];
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
  visited.add(startId);

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    const node = await env.KG.get(nodeKey(id), 'json') as KGNode | null;
    if (!node) continue;
    if (domain && node.domain !== domain && depth > 0) continue;
    nodes.set(id, node);

    if (depth >= maxDepth) continue;

    // Find all edges involving this node
    const list = await env.KG.list({ prefix: EDGE_PREFIX });
    for (const key of list.keys) {
      const edge = await env.KG.get(key.name, 'json') as KGEdge | null;
      if (!edge) continue;
      let neighborId: string | null = null;
      if (edge.from === id) neighborId = edge.to;
      else if (edge.to === id) neighborId = edge.from;
      else continue;
      if (domain && edge.domain !== domain) continue;
      edges.push(edge);
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        queue.push({ id: neighborId, depth: depth + 1 });
      }
    }
  }

  return { nodes: [...nodes.values()], edges };
}

export async function crossDomainQuery(env: any, query: string, currentDomain: string, maxResults: number = 5): Promise<KGNode[]> {
  const queryLower = query.toLowerCase();
  const results: KGNode[] = [];
  const list = await env.KG.list({ prefix: NODE_PREFIX });

  for (const key of list.keys) {
    if (results.length >= maxResults) break;
    const node = await env.KG.get(key.name, 'json') as KGNode | null;
    if (!node || node.domain === currentDomain) continue;
    if (node.label.toLowerCase().includes(queryLower) || node.id.toLowerCase().includes(queryLower)) {
      results.push(node);
    }
  }

  // Sort by confidence desc
  results.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  return results.slice(0, maxResults);
}

export async function findPath(env: any, fromId: string, toId: string): Promise<KGEdge[]> {
  // BFS for shortest path
  const visited = new Set<string>();
  const parent: Map<string, { edge: KGEdge; nodeId: string }> = new Map();
  const queue: string[] = [fromId];
  visited.add(fromId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === toId) {
      // Reconstruct path
      const path: KGEdge[] = [];
      let node = toId;
      while (parent.has(node)) {
        const { edge } = parent.get(node)!;
        path.unshift(edge);
        node = edge.from === node ? edge.to : edge.from;
      }
      return path;
    }

    const list = await env.KG.list({ prefix: EDGE_PREFIX });
    for (const key of list.keys) {
      const edge = await env.KG.get(key.name, 'json') as KGEdge | null;
      if (!edge) continue;
      let neighbor: string | null = null;
      if (edge.from === current) neighbor = edge.to;
      else if (edge.to === current) neighbor = edge.from;
      else continue;
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        parent.set(neighbor, { edge, nodeId: current });
        queue.push(neighbor);
      }
    }
  }

  return [];
}

export async function domainStats(env: any): Promise<Record<string, { nodes: number; edges: number; connections: number }>> {
  const stats: Record<string, { nodes: number; edges: number; connections: number }> = {};

  const nodeList = await env.KG.list({ prefix: NODE_PREFIX });
  for (const key of nodeList.keys) {
    const node = await env.KG.get(key.name, 'json') as KGNode | null;
    if (!node) continue;
    if (!stats[node.domain]) stats[node.domain] = { nodes: 0, edges: 0, connections: 0 };
    stats[node.domain].nodes++;
  }

  const edgeList = await env.KG.list({ prefix: EDGE_PREFIX });
  for (const key of edgeList.keys) {
    const edge = await env.KG.get(key.name, 'json') as KGEdge | null;
    if (!edge) continue;
    if (!stats[edge.domain]) stats[edge.domain] = { nodes: 0, edges: 0, connections: 0 };
    stats[edge.domain].edges++;
  }

  // Count cross-domain connections
  for (const key of edgeList.keys) {
    const edge = await env.KG.get(key.name, 'json') as KGEdge | null;
    if (!edge) continue;
    const fromNode = await env.KG.get(nodeKey(edge.from), 'json') as KGNode | null;
    const toNode = await env.KG.get(nodeKey(edge.to), 'json') as KGNode | null;
    if (fromNode && toNode && fromNode.domain !== toNode.domain) {
      if (!stats[fromNode.domain]) stats[fromNode.domain] = { nodes: 0, edges: 0, connections: 0 };
      stats[fromNode.domain].connections++;
    }
  }

  return stats;
}

export async function getDomainNodes(env: any, domain: string): Promise<KGNode[]> {
  const nodes: KGNode[] = [];
  const list = await env.KG.list({ prefix: NODE_PREFIX });
  for (const key of list.keys) {
    const node = await env.KG.get(key.name, 'json') as KGNode | null;
    if (node && node.domain === domain) nodes.push(node);
  }
  return nodes;
}
