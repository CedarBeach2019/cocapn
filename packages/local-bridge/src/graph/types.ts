/**
 * Graph Types — TypeScript AST knowledge graph nodes and edges.
 *
 * Represents the structure of TypeScript code as a queryable graph:
 * - Nodes: files, functions, classes, interfaces, variables, imports, exports
 * - Edges: relationships between nodes (imports, exports, calls, extends, etc.)
 */

// ─── Node Types ─────────────────────────────────────────────────────────────

export type NodeType =
  | "file"        // Source file
  | "function"    // Function declaration
  | "class"       // Class declaration
  | "interface"   // Interface or type alias
  | "variable"    // Variable declaration
  | "export"      // Exported symbol
  | "import";     // Import statement

export interface GraphNode {
  /** Unique identifier: e.g. "src/auth/handler.ts#authenticate" */
  id: string;
  /** Node type */
  type: NodeType;
  /** Symbol name: e.g. "authenticate" */
  name: string;
  /** File path relative to repo root: e.g. "src/auth/handler.ts" */
  file: string;
  /** Start line number (1-based) */
  startLine?: number;
  /** End line number (1-based) */
  endLine?: number;
  /** JSDoc / TSDoc comment */
  docs?: string;
  /** Function signature or type definition */
  signature?: string;
  /** For export nodes: the symbol being exported */
  exportsSymbol?: string;
  /** For import nodes: the module being imported from */
  importsModule?: string;
}

// ─── Edge Types ─────────────────────────────────────────────────────────────

export type EdgeType =
  | "imports"        // file A imports from file B
  | "exports"        // file A exports symbol X
  | "calls"          // function A calls function B
  | "extends"        // class A extends class B
  | "implements"     // class A implements interface B
  | "uses"           // function A uses type B
  | "contains"       // file A contains function B
  | "depends_on";    // file A depends on file B (transitive)

export interface GraphEdge {
  /** Source node ID */
  source: string;
  /** Target node ID */
  target: string;
  /** Edge type */
  type: EdgeType;
  /** Optional weight for ranking (default: 1.0) */
  weight?: number;
}

// ─── Query Results ───────────────────────────────────────────────────────────

export interface DependencyInfo {
  /** File that depends on the target */
  file: string;
  /** Import statements */
  imports: string[];
}

export interface ImpactNode {
  /** Node ID */
  id: string;
  /** Node type */
  type: NodeType;
  /** File path */
  file: string;
  /** Symbol name */
  name: string;
  /** Distance from root node */
  distance: number;
}

export interface GraphStats {
  /** Total number of nodes */
  nodes: number;
  /** Total number of edges */
  edges: number;
  /** Number of unique files */
  files: number;
  /** Number of symbols (functions, classes, interfaces, variables) */
  symbols: number;
}
