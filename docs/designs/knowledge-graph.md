# Repo Knowledge Graph Design

## Goal
Parse the repo's TypeScript AST to build a lightweight knowledge graph. Answer structural questions without reading files.

## Graph Schema

### Nodes
```typescript
type NodeType = 'file' | 'function' | 'class' | 'interface' | 'variable' | 'export' | 'import';

interface GraphNode {
  id: string;           // e.g. "src/auth/handler.ts#authenticate"
  type: NodeType;
  name: string;         // e.g. "authenticate"
  file: string;         // e.g. "src/auth/handler.ts"
  startLine?: number;
  endLine?: number;
  docs?: string;        // JSDoc / TSDoc
  signature?: string;   // Function signature or type definition
}
```

### Edges
```typescript
type EdgeType = 
  | 'imports'        // file A imports from file B
  | 'exports'        // file A exports symbol X
  | 'calls'          // function A calls function B
  | 'extends'        // class A extends class B
  | 'implements'     // class A implements interface B
  | 'uses'           // function A uses type B
  | 'contains'       // file A contains function B
  | 'depends_on';    // file A depends on file B (transitive)

interface GraphEdge {
  source: string;
  target: string;
  type: EdgeType;
  weight?: number;    // for ranking
}
```

## Storage
SQLite tables — same DB as Brain:
```sql
CREATE TABLE graph_nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  file TEXT NOT NULL,
  start_line INTEGER,
  end_line INTEGER,
  docs TEXT,
  signature TEXT
);

CREATE TABLE graph_edges (
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  type TEXT NOT NULL,
  weight REAL DEFAULT 1.0,
  PRIMARY KEY (source, target, type)
);

CREATE INDEX idx_nodes_file ON graph_nodes(file);
CREATE INDEX idx_nodes_type ON graph_nodes(type);
CREATE INDEX idx_edges_source ON graph_edges(source);
CREATE INDEX idx_edges_target ON graph_edges(target);
CREATE INDEX idx_edges_type ON graph_edges(type);
```

## Query API
```typescript
class RepoGraph {
  // Structural queries
  getDependencies(file: string): string[];              // What does this file import?
  getDependents(file: string): string[];                // What imports this file?
  getCallGraph(functionId: string): string[];           // What does this function call?
  getReverseCallGraph(functionId: string): string[];    // What calls this function?
  
  // Search
  findByName(pattern: string): GraphNode[];             // Find functions/classes by name
  findByFile(file: string): GraphNode[];               // Get all symbols in a file
  findExported(): GraphNode[];                          // Get all exported symbols
  
  // Impact analysis
  getImpactRadius(symbolId: string, depth?: number): string[];  // What would break if X changes?
  
  // Maintenance
  build(repoRoot: string): Promise<void>;               // Parse entire repo
  updateFile(filePath: string): Promise<void>;          // Re-parse one file
  removeFile(filePath: string): Promise<void>;          // Remove file from graph
  
  // Stats
  stats(): { nodes: number; edges: number; files: number; symbols: number };
}
```

## Parser

Use `ts-morph` (TypeScript AST library):
```typescript
import { Project, SourceFile, FunctionDeclaration, ClassDeclaration } from 'ts-morph';

class RepoParser {
  private project: Project;
  
  constructor(repoRoot: string, tsconfig?: string);
  
  parseFile(filePath: string): { nodes: GraphNode[]; edges: GraphEdge[] };
  
  private extractFunctions(sourceFile: SourceFile): GraphNode[];
  private extractClasses(sourceFile: SourceFile): GraphNode[];
  private extractImports(sourceFile: SourceFile): GraphEdge[];
  private extractExports(sourceFile: SourceFile): GraphNode[];
  private extractCalls(sourceFile: SourceFile): GraphEdge[];  // Heuristic: identifier references
}
```

## Token Efficiency

Query: "What depends on auth-handler.ts?"
- Without graph: Read every file, check imports → 20+ file reads → ~100K tokens
- With graph: `SELECT source FROM graph_edges WHERE target = 'src/auth/handler.ts' AND type = 'imports'` → 1 SQL query → ~200 tokens

**500x efficiency gain for structural queries.**

## Incremental Updates

On git commit hook or file watcher:
1. Detect changed files (git diff --name-only)
2. For each changed file: remove old nodes/edges, re-parse, insert new
3. For deleted files: remove all nodes/edges
4. Update: ~100ms per file (fast enough for real-time)

## Limitations

- **TypeScript only** initially. Could extend to other languages.
- **Call graph is heuristic** — uses identifier references, not actual flow analysis. Good enough for ~90% of queries.
- **No cross-package resolution** — treats each file independently. Can add module resolution later.

---

*Design doc — 2026-03-29*
