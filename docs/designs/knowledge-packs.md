# Knowledge Pack Design

## Concept
Export Brain memories as portable "knowledge packs" that can be shared across cocapn instances and repos.

## Format
```json
{
  "version": "1.0",
  "exportedAt": "2026-03-29T12:00:00Z",
  "source": {
    "repo": "cocapn",
    "instance": "main"
  },
  "memories": [
    {
      "key": "lesson:promise-chains",
      "value": "Always use async/await instead of .then() chains for readability",
      "type": "implicit",
      "confidence": 0.9,
      "tags": ["javascript", "async", "best-practice"]
    },
    {
      "key": "pattern:error-recovery",
      "value": "Three-level recovery: retry → fallback → escalate",
      "type": "implicit",
      "confidence": 0.85,
      "tags": ["error-handling", "pattern"]
    }
  ],
  "stats": {
    "totalMemories": 2,
    "avgConfidence": 0.875,
    "types": { "implicit": 2 }
  }
}
```

## Export API
```typescript
class KnowledgePackExporter {
  constructor(brain: Brain);
  
  // Export all memories
  async exportAll(options?: {
    minConfidence?: number;  // default 0.5
    tags?: string[];         // filter by tags
    types?: string[];        // filter by type
  }): Promise<string>; // JSON string
  
  // Export to file
  async exportToFile(filePath: string, options?: ExportOptions): Promise<void>;
  
  // Export specific memories
  async exportKeys(keys: string[]): Promise<string>;
}
```

## Import API
```typescript
class KnowledgePackImporter {
  constructor(brain: Brain);
  
  // Import from JSON
  async import(pack: string, options?: {
    deduplicate?: boolean;   // default true — skip if key exists
    mergeStrategy?: 'skip' | 'overwrite' | 'merge'; // default 'skip'
    tagPrefix?: string;      // tag all imported memories with source
  }): Promise<{ imported: number; skipped: number; errors: number }>;
  
  // Import from file
  async importFromFile(filePath: string, options?: ImportOptions): Promise<ImportResult>;
  
  // Preview without importing
  async preview(pack: string): Promise<{ memories: number; conflicts: number }>;
}
```

## Cross-Repo Use Cases

1. **Pattern sharing**: Agent learns a good auth pattern in repo A, exports as knowledge pack, imports into repo B
2. **Team onboarding**: Senior dev exports their agent's learned patterns, junior devs import them
3. **Template enrichment**: Include knowledge packs in cocapn templates — new instances start with pre-learned patterns
4. **Backup**: Periodic export as backup of agent's learned knowledge

## Safety
- Import never overwrites explicit (user-created) memories without mergeStrategy: 'overwrite'
- Auto-generated memories always tagged with source instance
- Import preview shows what would be imported before committing
- Large imports (>100 memories) require confirmation

---

*Design doc — 2026-03-29*
