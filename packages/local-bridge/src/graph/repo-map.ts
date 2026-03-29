/**
 * Repo Map Generator — Aider-style repository summary from knowledge graph.
 *
 * Generates a concise map of the entire repository (class/function signatures)
 * optimized for the LLM context window. Similar to Aider's repo map feature:
 * - Prioritizes files by importance (number of dependents)
 * - Applies token budget to fit within context limits
 * - Uses tree-dotted format (⋮) for skipped lines
 * - ~1K tokens replaces ~20K tokens of file reads
 */

import type { GraphDB } from "./db.js";
import type { GraphNode } from "./types.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface RepoMapOptions {
  /** Maximum tokens for the generated map (default: 1024) */
  maxTokens?: number;
  /** Include function/class signatures (default: true) */
  includeSignatures?: boolean;
  /** Include JSDoc comments (default: true) */
  includeDocStrings?: boolean;
  /** Files to prioritize (expand their symbols) */
  focusFiles?: string[];
  /** Files/patterns to skip (e.g., [/\.test\.ts$/, /node_modules/]) */
  excludePatterns?: RegExp[];
  /** Skip test files by default (default: true) */
  skipTests?: boolean;
}

interface FileEntry {
  file: string;
  nodes: GraphNode[];
  importance: number; // Number of dependents
}

interface SymbolEntry {
  name: string;
  signature?: string;
  docs?: string;
  type: string;
}

// ─── Repo Map Generator ────────────────────────────────────────────────────────

export class RepoMapGenerator {
  private db: GraphDB;
  private readonly DEFAULT_MAX_TOKENS = 1024;

  constructor(db: GraphDB) {
    this.db = db;
  }

  /**
   * Generate an Aider-style repo map from the knowledge graph.
   */
  async generate(options: RepoMapOptions = {}): Promise<string> {
    const opts = this.normalizeOptions(options);

    // Get all files with their nodes
    const files = await this.getFilesWithNodes(opts);

    // Sort by importance (number of dependents)
    const sortedFiles = await this.sortFilesByImportance(files);

    // Generate the map respecting token budget
    return this.generateMap(sortedFiles, opts);
  }

  /**
   * Generate a repo map for specific files only.
   */
  async generateForFiles(files: string[], options: RepoMapOptions = {}): Promise<string> {
    const opts = this.normalizeOptions(options);

    // Get nodes for the requested files
    const fileEntries: FileEntry[] = [];
    for (const file of files) {
      const nodes = await this.db.getNodesByFile(file);
      if (nodes.length > 0) {
        fileEntries.push({
          file,
          nodes,
          importance: 0, // Not relevant for focused generation
        });
      }
    }

    // Generate the map
    return this.generateMap(fileEntries, opts);
  }

  /**
   * Estimate token count for a generated map.
   * Uses a simple heuristic: ~4 characters per token.
   */
  estimateTokens(map: string): number {
    return Math.ceil(map.length / 4);
  }

  // ─── Private Methods ─────────────────────────────────────────────────────────

  private normalizeOptions(options: RepoMapOptions): Required<RepoMapOptions> {
    return {
      maxTokens: options.maxTokens ?? this.DEFAULT_MAX_TOKENS,
      includeSignatures: options.includeSignatures ?? true,
      includeDocStrings: options.includeDocStrings ?? true,
      focusFiles: options.focusFiles ?? [],
      excludePatterns: options.excludePatterns ?? [],
      skipTests: options.skipTests ?? true,
    };
  }

  private async getFilesWithNodes(options: Required<RepoMapOptions>): Promise<FileEntry[]> {
    const allNodes = await this.getAllNodes();
    const fileMap = new Map<string, GraphNode[]>();

    // Group nodes by file
    for (const node of allNodes) {
      // Skip if file matches exclude patterns
      if (this.shouldExcludeFile(node.file, options)) {
        continue;
      }

      if (!fileMap.has(node.file)) {
        fileMap.set(node.file, []);
      }
      fileMap.get(node.file)!.push(node);
    }

    // Convert to FileEntry array
    return Array.from(fileMap.entries()).map(([file, nodes]) => ({
      file,
      nodes,
      importance: 0, // Will be calculated later
    }));
  }

  private async getAllNodes(): Promise<GraphNode[]> {
    // Get all nodes from the database
    return await this.db.getAllNodes();
  }

  private shouldExcludeFile(file: string, options: Required<RepoMapOptions>): boolean {
    // Skip test files if requested
    if (options.skipTests && (file.endsWith(".test.ts") || file.endsWith(".spec.ts"))) {
      return true;
    }

    // Skip common directories
    if (file.includes("node_modules/") || file.includes(".git/") || file.includes("dist/")) {
      return true;
    }

    // Check custom exclude patterns
    for (const pattern of options.excludePatterns) {
      if (pattern.test(file)) {
        return true;
      }
    }

    return false;
  }

  private async sortFilesByImportance(files: FileEntry[]): Promise<FileEntry[]> {
    // Calculate importance for each file
    for (const entry of files) {
      const dependents = await this.db.getDependents(entry.file);
      entry.importance = dependents.length;
    }

    // Sort by importance (descending), then by file path for consistency
    return files.sort((a, b) => {
      if (b.importance !== a.importance) {
        return b.importance - a.importance;
      }
      return a.file.localeCompare(b.file);
    });
  }

  private generateMap(files: FileEntry[], options: Required<RepoMapOptions>): string {
    const lines: string[] = [];
    let currentTokens = 0;
    const maxTokens = options.maxTokens;

    // Split files into focused and regular
    const focusedFiles = files.filter(f => options.focusFiles.includes(f.file));
    const regularFiles = files.filter(f => !options.focusFiles.includes(f.file));

    // Allocate 60% of budget to focused files if any
    const focusedBudget = options.focusFiles.length > 0 ? Math.floor(maxTokens * 0.6) : maxTokens;
    const regularBudget = maxTokens - focusedBudget;

    // Generate focused files first
    for (const entry of focusedFiles) {
      const fileLines = this.generateFileEntry(entry, options);
      const fileTokens = this.estimateTokens(fileLines.join("\n"));

      if (currentTokens + fileTokens > focusedBudget) {
        // Try a truncated version
        const truncated = this.truncateFileEntry(entry, options, focusedBudget - currentTokens);
        if (truncated.length > 0) {
          lines.push(...truncated);
        }
        break;
      }

      lines.push(...fileLines);
      currentTokens += fileTokens;
    }

    // Then add regular files if we have budget left
    if (regularFiles.length > 0 && currentTokens < maxTokens) {
      const remainingBudget = regularFiles.length > 0 ? regularBudget : (maxTokens - currentTokens);

      for (const entry of regularFiles) {
        const fileLines = this.generateFileEntry(entry, options);
        const fileTokens = this.estimateTokens(fileLines.join("\n"));

        if (currentTokens + fileTokens > maxTokens) {
          // Try a truncated version
          const truncated = this.truncateFileEntry(entry, options, maxTokens - currentTokens);
          if (truncated.length > 0) {
            lines.push(...truncated);
          }
          break;
        }

        lines.push(...fileLines);
        currentTokens += fileTokens;
      }
    }

    return lines.join("\n");
  }

  private generateFileEntry(entry: FileEntry, options: Required<RepoMapOptions>): string[] {
    const lines: string[] = [];

    // Add file header
    lines.push(`${entry.file}:`);
    lines.push("⋮...");

    // Extract and organize symbols
    const symbols = this.extractSymbols(entry.nodes, options);

    if (symbols.length === 0) {
      lines.push("│  (no exported symbols)");
      return lines;
    }

    // Group by type
    const grouped = this.groupSymbolsByType(symbols);

    // Output each symbol
    for (const symbol of symbols) {
      const line = this.formatSymbol(symbol, options);
      if (line) {
        lines.push(line);
      }
    }

    return lines;
  }

  private extractSymbols(nodes: GraphNode[], options: Required<RepoMapOptions>): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];

    for (const node of nodes) {
      // Skip file nodes themselves
      if (node.type === "file" || node.type === "import") {
        continue;
      }

      // Skip export nodes (they're references to other symbols)
      if (node.type === "export") {
        continue;
      }

      symbols.push({
        name: node.name,
        signature: node.signature,
        docs: node.docs,
        type: node.type,
      });
    }

    return symbols;
  }

  private groupSymbolsByType(symbols: SymbolEntry[]): Map<string, SymbolEntry[]> {
    const grouped = new Map<string, SymbolEntry[]>();

    for (const symbol of symbols) {
      if (!grouped.has(symbol.type)) {
        grouped.set(symbol.type, []);
      }
      grouped.get(symbol.type)!.push(symbol);
    }

    return grouped;
  }

  private formatSymbol(symbol: SymbolEntry, options: Required<RepoMapOptions>): string | null {
    let line = "│";

    // Add type indicator
    switch (symbol.type) {
      case "class":
        line += "class ";
        break;
      case "function":
        line += "function ";
        break;
      case "interface":
        line += "interface ";
        break;
      case "variable":
        line += "var ";
        break;
      default:
        line += `${symbol.type} `;
    }

    // Add name and signature
    if (options.includeSignatures && symbol.signature) {
      // Clean up signature for compact display
      const cleanSig = this.cleanSignature(symbol.signature);
      line += `${symbol.name}: ${cleanSig}`;
    } else {
      line += symbol.name;
    }

    // Add docs if requested (compact format)
    if (options.includeDocStrings && symbol.docs) {
      const cleanDocs = this.cleanDocs(symbol.docs);
      if (cleanDocs) {
        line += `  # ${cleanDocs}`;
      }
    }

    return line;
  }

  private cleanSignature(signature: string): string {
    // Remove common keywords for compactness
    let cleaned = signature
      .replace(/^export\s+/, "")
      .replace(/^async\s+/, "")
      .replace(/^public\s+/, "")
      .replace(/^private\s+/, "")
      .replace(/^protected\s+/, "")
      .replace(/^static\s+/, "")
      .replace(/\s+/g, " ")
      .trim();

    // Truncate if too long
    if (cleaned.length > 80) {
      cleaned = cleaned.substring(0, 77) + "...";
    }

    return cleaned;
  }

  private cleanDocs(docs: string): string {
    // Remove leading/trailing whitespace and common patterns
    let cleaned = docs
      .replace(/^\/\*\*?/, "")
      .replace(/\*\/$/, "")
      .replace(/^\s*\*\s?/gm, "")
      .replace(/\s+/g, " ")
      .trim();

    // Truncate if too long
    if (cleaned.length > 50) {
      cleaned = cleaned.substring(0, 47) + "...";
    }

    return cleaned;
  }

  private truncateFileEntry(
    entry: FileEntry,
    options: Required<RepoMapOptions>,
    remainingTokens: number
  ): string[] {
    const lines: string[] = [];

    // Add file header
    lines.push(`${entry.file}:`);
    lines.push("⋮...");

    // Estimate tokens used so far
    let currentTokens = this.estimateTokens(lines.join("\n"));

    // Extract symbols
    const symbols = this.extractSymbols(entry.nodes, options);

    // Add as many symbols as we have budget for
    for (const symbol of symbols) {
      const line = this.formatSymbol(symbol, options);
      if (!line) continue;

      const lineTokens = this.estimateTokens(line);
      if (currentTokens + lineTokens > remainingTokens) {
        break;
      }

      lines.push(line);
      currentTokens += lineTokens;
    }

    return lines;
  }
}
