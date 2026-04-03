// autonomous-schema.ts — Self-evolving context structures
// The accumulated context structure adapts as patterns emerge
// No manual schema migration — the ontology grows organically

export interface SchemaNode {
  path: string;           // e.g. "user.studylog.sessions.quiz"
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'enum';
  inferred: boolean;      // true if auto-discovered from data
  confidence: number;     // 0-1, how sure we are about this type
  frequency: number;      // how often this path appears
  lastSeen: number;
  children?: SchemaNode[];
  constraints?: {
    min?: number;
    max?: number;
    pattern?: string;     // regex
    enum?: string[];      // allowed values
  };
}

export interface SchemaEvolution {
  timestamp: number;
  event: 'added' | 'merged' | 'split' | 'promoted' | 'deprecated';
  path: string;
  description: string;
  confidence_before: number;
  confidence_after: number;
}

// Infer schema from a flat data object
// Each interaction adds evidence to the schema
export function inferFromData(
  currentSchema: Map<string, SchemaNode>,
  data: Record<string, unknown>,
  prefix = ''
): { schema: Map<string, SchemaNode>; changes: SchemaEvolution[] } {
  const changes: SchemaEvolution[] = [];
  
  for (const [key, value] of Object.entries(data)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const existing = currentSchema.get(path);
    
    const inferredType = inferType(value);
    const newConfidence = existing ? 
      Math.min(1, existing.confidence + 0.1) : 0.3; // Bayesian update
    
    const node: SchemaNode = {
      path,
      type: inferredType,
      inferred: true,
      confidence: newConfidence,
      frequency: (existing?.frequency || 0) + 1,
      lastSeen: Date.now(),
    };
    
    // Detect constraints from data
    if (inferredType === 'number' && typeof value === 'number') {
      node.constraints = { ...existing?.constraints };
      if (node.constraints.min === undefined || value < node.constraints.min) {
        node.constraints.min = value;
      }
      if (node.constraints.max === undefined || value > node.constraints.max) {
        node.constraints.max = value;
      }
    }
    
    // Detect enum values from strings
    if (inferredType === 'string' && typeof value === 'string') {
      const existingEnums = existing?.constraints?.enum || [];
      if (!existingEnums.includes(value) && existingEnums.length < 20) {
        node.constraints = { ...node.constraints, enum: [...existingEnums, value] };
      }
      // If we see many unique strings, demote from enum
      if (node.constraints.enum && node.constraints.enum.length > 15) {
        delete node.constraints.enum;
      }
    }
    
    if (!existing) {
      changes.push({
        timestamp: Date.now(),
        event: 'added',
        path,
        description: `Discovered new field: ${path} (${inferredType})`,
        confidence_before: 0,
        confidence_after: newConfidence,
      });
    }
    
    currentSchema.set(path, node);
    
    // Recurse into objects
    if (inferredType === 'object' && value && typeof value === 'object' && !Array.isArray(value)) {
      const sub = inferFromData(currentSchema, value as Record<string, unknown>, path);
      changes.push(...sub.changes);
    }
  }
  
  return { schema: currentSchema, changes };
}

// Merge two schemas (when domains share data)
export function mergeSchemas(
  base: Map<string, SchemaNode>,
  incoming: Map<string, SchemaNode>
): SchemaEvolution[] {
  const changes: SchemaEvolution[] = [];
  
  for (const [path, node] of incoming) {
    const existing = base.get(path);
    
    if (!existing) {
      base.set(path, { ...node, confidence: node.confidence * 0.5 }); // Lower confidence for cross-domain
      changes.push({
        timestamp: Date.now(),
        event: 'merged',
        path,
        description: `Cross-domain merge: ${path} from external domain`,
        confidence_before: 0,
        confidence_after: node.confidence * 0.5,
      });
    } else if (existing.type !== node.type) {
      // Type conflict — promote to broader type
      existing.type = resolveTypeConflict(existing.type, node.type);
      existing.confidence = Math.max(existing.confidence, node.confidence) * 0.7;
      changes.push({
        timestamp: Date.now(),
        event: 'split',
        path,
        description: `Type conflict resolved: ${existing.type}`,
        confidence_before: existing.confidence,
        confidence_after: existing.confidence,
      });
    } else {
      // Same type — reinforce
      existing.confidence = Math.min(1, (existing.confidence + node.confidence) / 2 + 0.05);
      existing.frequency += node.frequency;
    }
  }
  
  return changes;
}

// Promote high-confidence inferred fields to "official" schema
// These get validation rules applied
export function promoteHighConfidence(
  schema: Map<string, SchemaNode>,
  threshold = 0.8
): SchemaEvolution[] {
  const changes: SchemaEvolution[] = [];
  
  for (const [path, node] of schema) {
    if (node.inferred && node.confidence >= threshold && node.frequency >= 10) {
      node.inferred = false; // Now it's "official"
      changes.push({
        timestamp: Date.now(),
        event: 'promoted',
        path,
        description: `Field ${path} promoted to official schema (confidence: ${node.confidence.toFixed(2)}, freq: ${node.frequency})`,
        confidence_before: node.confidence,
        confidence_after: 1,
      });
    }
  }
  
  return changes;
}

// Prune stale schema nodes
export function pruneStale(
  schema: Map<string, SchemaNode>,
  maxAgeDays = 30,
  minFrequency = 3
): SchemaEvolution[] {
  const changes: SchemaEvolution[] = [];
  const cutoff = Date.now() - maxAgeDays * 86400000;
  
  for (const [path, node] of schema) {
    if (node.inferred && (node.lastSeen < cutoff || node.frequency < minFrequency)) {
      schema.delete(path);
      changes.push({
        timestamp: Date.now(),
        event: 'deprecated',
        path,
        description: `Pruned stale field: ${path} (last seen ${Math.round((Date.now() - node.lastSeen) / 86400000)}d ago, freq: ${node.frequency})`,
        confidence_before: node.confidence,
        confidence_after: 0,
      });
    }
  }
  
  return changes;
}

function inferType(value: unknown): SchemaNode['type'] {
  if (value === null || value === undefined) return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return 'string';
}

function resolveTypeConflict(a: SchemaNode['type'], b: SchemaNode['type']): SchemaNode['type'] {
  // Broader type wins
  const hierarchy: Record<string, number> = {
    'boolean': 0, 'number': 1, 'string': 2, 'enum': 3, 'array': 4, 'object': 5
  };
  return (hierarchy[a] ?? 5) >= (hierarchy[b] ?? 5) ? a : b;
}
