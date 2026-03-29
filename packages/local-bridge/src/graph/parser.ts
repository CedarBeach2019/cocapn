/**
 * Repo Parser — Extracts nodes and edges from TypeScript AST using ts-morph.
 *
 * Parses TypeScript source files to build a knowledge graph:
 * - Extracts functions, classes, interfaces, variables
 * - Tracks imports, exports, and inheritance relationships
 * - Builds call graph using identifier references (heuristic)
 */

import { Project, SourceFile, SyntaxKind } from "ts-morph";
import { join, relative } from "path";
import { existsSync } from "fs";
import type { GraphNode, GraphEdge, NodeType } from "./types.js";

// ─── Parser Result ───────────────────────────────────────────────────────────

export interface ParseResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ─── Repo Parser ─────────────────────────────────────────────────────────────

export class RepoParser {
  private project: Project;
  private repoRoot: string;

  constructor(repoRoot: string, tsconfigPath?: string) {
    this.repoRoot = repoRoot;
    const configPath = tsconfigPath || join(repoRoot, "tsconfig.json");

    // Only use tsconfig if it exists, otherwise use default options
    const projectOptions: any = {
      skipAddingFilesFromTsConfig: true,
      compilerOptions: {
        allowJs: true,
        declaration: false,
        sourceMap: false,
        noEmit: true,
       esModuleInterop: true,
        skipLibCheck: true,
      },
    };

    if (existsSync(configPath)) {
      projectOptions.tsConfigFilePath = configPath;
    }

    this.project = new Project(projectOptions);
  }

  /**
   * Parse a single TypeScript file and extract nodes and edges.
   */
  parseFile(filePath: string): ParseResult {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    try {
      // Add source file to project if not already present
      const sourceFile = this.project.addSourceFileAtPath(filePath);

      // Get relative file path
      const relPath = relative(this.repoRoot, filePath);

      // Extract all nodes and edges
      nodes.push(...this.extractFileNode(sourceFile, relPath));
      nodes.push(...this.extractFunctions(sourceFile, relPath));
      nodes.push(...this.extractClasses(sourceFile, relPath));
      nodes.push(...this.extractInterfaces(sourceFile, relPath));
      nodes.push(...this.extractVariables(sourceFile, relPath));
      nodes.push(...this.extractExports(sourceFile, relPath));
      nodes.push(...this.extractImports(sourceFile, relPath));

      edges.push(...this.extractImportsEdges(sourceFile, relPath));
      edges.push(...this.extractExportsEdges(sourceFile, relPath));
      edges.push(...this.extractInheritance(sourceFile, relPath));
      edges.push(...this.extractContainsEdges(sourceFile, relPath));
      edges.push(...this.extractCallEdges(sourceFile, relPath));

      // Clean up: remove source file from project to avoid memory leaks
      this.project.removeSourceFile(sourceFile);
    } catch (error) {
      // Skip files that can't be parsed
      console.error(`[graph] Failed to parse ${filePath}:`, error);
    }

    return { nodes, edges };
  }

  /**
   * Parse all TypeScript files in a directory.
   */
  parseDirectory(dir: string, options: { recursive?: boolean } = {}): ParseResult {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    try {
      const sourceFiles = this.project.addSourceFilesAtPaths(`${dir}/**/*.ts`);

      for (const sourceFile of sourceFiles) {
        const filePath = sourceFile.getFilePath();
        const relPath = relative(this.repoRoot, filePath);

        nodes.push(...this.extractFileNode(sourceFile, relPath));
        nodes.push(...this.extractFunctions(sourceFile, relPath));
        nodes.push(...this.extractClasses(sourceFile, relPath));
        nodes.push(...this.extractInterfaces(sourceFile, relPath));
        nodes.push(...this.extractVariables(sourceFile, relPath));
        nodes.push(...this.extractExports(sourceFile, relPath));
        nodes.push(...this.extractImports(sourceFile, relPath));

        edges.push(...this.extractImportsEdges(sourceFile, relPath));
        edges.push(...this.extractExportsEdges(sourceFile, relPath));
        edges.push(...this.extractInheritance(sourceFile, relPath));
        edges.push(...this.extractContainsEdges(sourceFile, relPath));
        edges.push(...this.extractCallEdges(sourceFile, relPath));

        // Clean up
        this.project.removeSourceFile(sourceFile);
      }
    } catch (error) {
      console.error(`[graph] Failed to parse directory ${dir}:`, error);
    }

    return { nodes, edges };
  }

  // ─── Private Extractors ─────────────────────────────────────────────────────

  private extractFileNode(sourceFile: SourceFile, relPath: string): GraphNode[] {
    return [{
      id: relPath,
      type: "file",
      name: relPath,
      file: relPath,
      startLine: 1,
      endLine: sourceFile.getFullText().split("\n").length,
    }];
  }

  private extractFunctions(sourceFile: SourceFile, relPath: string): GraphNode[] {
    const nodes: GraphNode[] = [];

    for (const func of sourceFile.getFunctions()) {
      const name = func.getName() || "(anonymous)";
      const docs = this.getJsDocs(func);
      const signature = this.getFunctionSignature(func);

      nodes.push({
        id: `${relPath}#${name}`,
        type: "function",
        name,
        file: relPath,
        startLine: func.getStartLineNumber(),
        endLine: func.getEndLineNumber(),
        docs,
        signature,
      });
    }

    // Also extract methods from classes
    for (const cls of sourceFile.getClasses()) {
      for (const method of cls.getMethods()) {
        const name = method.getName();
        const docs = this.getJsDocs(method);
        const signature = this.getMethodSignature(method);

        nodes.push({
          id: `${relPath}#${cls.getName()}#${name}`,
          type: "function",
          name: `${cls.getName()}#${name}`,
          file: relPath,
          startLine: method.getStartLineNumber(),
          endLine: method.getEndLineNumber(),
          docs,
          signature,
        });
      }
    }

    return nodes;
  }

  private extractClasses(sourceFile: SourceFile, relPath: string): GraphNode[] {
    const nodes: GraphNode[] = [];

    for (const cls of sourceFile.getClasses()) {
      const name = cls.getName() || "(anonymous)";
      const docs = this.getJsDocs(cls);
      const signature = this.getClassSignature(cls);

      nodes.push({
        id: `${relPath}#${name}`,
        type: "class",
        name,
        file: relPath,
        startLine: cls.getStartLineNumber(),
        endLine: cls.getEndLineNumber(),
        docs,
        signature,
      });
    }

    return nodes;
  }

  private extractInterfaces(sourceFile: SourceFile, relPath: string): GraphNode[] {
    const nodes: GraphNode[] = [];

    for (const iface of sourceFile.getInterfaces()) {
      const name = iface.getName();
      const docs = this.getJsDocs(iface);
      const signature = this.getInterfaceSignature(iface);

      nodes.push({
        id: `${relPath}#${name}`,
        type: "interface",
        name,
        file: relPath,
        startLine: iface.getStartLineNumber(),
        endLine: iface.getEndLineNumber(),
        docs,
        signature,
      });
    }

    // Also extract type aliases
    for (const typeAlias of sourceFile.getTypeAliases()) {
      const name = typeAlias.getName();
      const docs = this.getJsDocs(typeAlias);
      const signature = `type ${name} = ${typeAlias.getTypeNode()?.getText() || "unknown"}`;

      nodes.push({
        id: `${relPath}#${name}`,
        type: "interface",
        name,
        file: relPath,
        startLine: typeAlias.getStartLineNumber(),
        endLine: typeAlias.getEndLineNumber(),
        docs,
        signature,
      });
    }

    return nodes;
  }

  private extractVariables(sourceFile: SourceFile, relPath: string): GraphNode[] {
    const nodes: GraphNode[] = [];

    for (const variable of sourceFile.getVariableStatements()) {
      const docs = this.getJsDocs(variable);

      for (const decl of variable.getDeclarations()) {
        const name = decl.getName();
        const signature = decl.getTypeNode()?.getText() || "unknown";

        nodes.push({
          id: `${relPath}#${name}`,
          type: "variable",
          name,
          file: relPath,
          startLine: decl.getStartLineNumber(),
          endLine: decl.getEndLineNumber(),
          docs,
          signature,
        });
      }
    }

    return nodes;
  }

  private extractExports(sourceFile: SourceFile, relPath: string): GraphNode[] {
    const nodes: GraphNode[] = [];

    for (const exportDecl of sourceFile.getExportDeclarations()) {
      const module = exportDecl.getModuleSpecifierValue();
      if (!module) continue;

      nodes.push({
        id: `${relPath}#export#${module}`,
        type: "export",
        name: `export ${module}`,
        file: relPath,
        startLine: exportDecl.getStartLineNumber(),
        endLine: exportDecl.getEndLineNumber(),
        exportsSymbol: module,
      });
    }

    // Also track exported symbols
    for (const func of sourceFile.getFunctions()) {
      if (func.isExported()) {
        const name = func.getName() || "(anonymous)";
        nodes.push({
          id: `${relPath}#export#${name}`,
          type: "export",
          name: `export ${name}`,
          file: relPath,
          startLine: func.getStartLineNumber(),
          endLine: func.getEndLineNumber(),
          exportsSymbol: name,
        });
      }
    }

    for (const cls of sourceFile.getClasses()) {
      if (cls.isExported()) {
        const name = cls.getName();
        nodes.push({
          id: `${relPath}#export#${name}`,
          type: "export",
          name: `export ${name}`,
          file: relPath,
          startLine: cls.getStartLineNumber(),
          endLine: cls.getEndLineNumber(),
          exportsSymbol: name,
        });
      }
    }

    for (const iface of sourceFile.getInterfaces()) {
      if (iface.isExported()) {
        const name = iface.getName();
        nodes.push({
          id: `${relPath}#export#${name}`,
          type: "export",
          name: `export ${name}`,
          file: relPath,
          startLine: iface.getStartLineNumber(),
          endLine: iface.getEndLineNumber(),
          exportsSymbol: name,
        });
      }
    }

    return nodes;
  }

  private extractImports(sourceFile: SourceFile, relPath: string): GraphNode[] {
    const nodes: GraphNode[] = [];

    for (const importDecl of sourceFile.getImportDeclarations()) {
      const module = importDecl.getModuleSpecifierValue();
      const aliases = importDecl.getNamedImports().map((ni) => ni.getName()).join(", ");
      const name = aliases || `* as ${importDecl.getDefaultImport()?.getText() || ""}` || module;

      nodes.push({
        id: `${relPath}#import#${module}`,
        type: "import",
        name: `import ${name}`,
        file: relPath,
        startLine: importDecl.getStartLineNumber(),
        endLine: importDecl.getEndLineNumber(),
        importsModule: module,
      });
    }

    return nodes;
  }

  private extractImportsEdges(sourceFile: SourceFile, relPath: string): GraphEdge[] {
    const edges: GraphEdge[] = [];

    for (const importDecl of sourceFile.getImportDeclarations()) {
      const module = importDecl.getModuleSpecifierValue();
      // Only track relative imports (local files)
      if (module.startsWith(".") || module.startsWith("/")) {
        edges.push({
          source: relPath,
          target: this.resolveModulePath(relPath, module),
          type: "imports",
          weight: 1.0,
        });
      }
    }

    return edges;
  }

  private extractExportsEdges(sourceFile: SourceFile, relPath: string): GraphEdge[] {
    const edges: GraphEdge[] = [];

    for (const exportDecl of sourceFile.getExportDeclarations()) {
      const module = exportDecl.getModuleSpecifierValue();
      if (module && (module.startsWith(".") || module.startsWith("/"))) {
        edges.push({
          source: relPath,
          target: this.resolveModulePath(relPath, module),
          type: "exports",
          weight: 1.0,
        });
      }
    }

    return edges;
  }

  private extractInheritance(sourceFile: SourceFile, relPath: string): GraphEdge[] {
    const edges: GraphEdge[] = [];

    for (const cls of sourceFile.getClasses()) {
      const baseClass = cls.getExtends();
      if (baseClass) {
        const baseName = baseClass.getText();
        edges.push({
          source: `${relPath}#${cls.getName()}`,
          target: this.findSymbolTarget(relPath, baseName),
          type: "extends",
          weight: 1.0,
        });
      }

      for (const impl of cls.getImplements()) {
        const ifaceName = impl.getText();
        edges.push({
          source: `${relPath}#${cls.getName()}`,
          target: this.findSymbolTarget(relPath, ifaceName),
          type: "implements",
          weight: 1.0,
        });
      }
    }

    return edges;
  }

  private extractContainsEdges(sourceFile: SourceFile, relPath: string): GraphEdge[] {
    const edges: GraphEdge[] = [];

    for (const func of sourceFile.getFunctions()) {
      const name = func.getName() || "(anonymous)";
      edges.push({
        source: relPath,
        target: `${relPath}#${name}`,
        type: "contains",
        weight: 1.0,
      });
    }

    for (const cls of sourceFile.getClasses()) {
      const name = cls.getName() || "(anonymous)";
      edges.push({
        source: relPath,
        target: `${relPath}#${name}`,
        type: "contains",
        weight: 1.0,
      });

      for (const method of cls.getMethods()) {
        edges.push({
          source: `${relPath}#${name}`,
          target: `${relPath}#${name}#${method.getName()}`,
          type: "contains",
          weight: 1.0,
        });
      }
    }

    for (const iface of sourceFile.getInterfaces()) {
      edges.push({
        source: relPath,
        target: `${relPath}#${iface.getName()}`,
        type: "contains",
        weight: 1.0,
      });
    }

    return edges;
  }

  private extractCallEdges(sourceFile: SourceFile, relPath: string): GraphEdge[] {
    const edges: GraphEdge[] = [];

    // Heuristic: extract function calls from function bodies
    for (const func of sourceFile.getFunctions()) {
      const funcName = func.getName() || "(anonymous)";
      const calls = this.extractCallsFromFunction(func, relPath, `${relPath}#${funcName}`);

      edges.push(...calls);
    }

    // Also extract calls from class methods
    for (const cls of sourceFile.getClasses()) {
      for (const method of cls.getMethods()) {
        const methodId = `${relPath}#${cls.getName()}#${method.getName()}`;
        const calls = this.extractCallsFromFunction(method, relPath, methodId);

        edges.push(...calls);
      }
    }

    return edges;
  }

  private extractCallsFromFunction(func: any, relPath: string, funcId: string): GraphEdge[] {
    const edges: GraphEdge[] = [];

    try {
      // Get all call expressions in the function body
      const callExpressions = func.getBody()?.getDescendantsOfKind(SyntaxKind.CallExpression) || [];

      for (const call of callExpressions) {
        const expr = call.getExpression();
        if (!expr) continue;

        // Get the function being called
        const calledFuncName = expr.getText();

        // Only track calls to functions in the same file or local symbols
        // (skip built-ins and library calls)
        if (this.isLocalSymbol(calledFuncName, relPath)) {
          edges.push({
            source: funcId,
            target: this.findSymbolTarget(relPath, calledFuncName),
            type: "calls",
            weight: 1.0,
          });
        }
      }
    } catch (error) {
      // Skip if we can't extract calls
    }

    return edges;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private getJsDocs(node: any): string | undefined {
    try {
      const docs = node.getJsDocs();
      if (docs.length > 0) {
        return docs[0].getDescription().trim();
      }
    } catch {
      // Skip
    }
    return undefined;
  }

  private getFunctionSignature(func: any): string {
    try {
      const name = func.getName() || "(anonymous)";
      const params = func.getParameters().map((p: any) => p.getText()).join(", ");
      const returnType = func.getReturnType().getText();
      return `function ${name}(${params}): ${returnType}`;
    } catch {
      return "function";
    }
  }

  private getMethodSignature(method: any): string {
    try {
      const name = method.getName();
      const params = method.getParameters().map((p: any) => p.getText()).join(", ");
      const returnType = method.getReturnType().getText();
      return `${name}(${params}): ${returnType}`;
    } catch {
      return "method";
    }
  }

  private getClassSignature(cls: any): string {
    try {
      const name = cls.getName();
      const extendsClause = cls.getExtends();
      const implementsClause = cls.getImplements().map((i: any) => i.getText()).join(", ");

      let sig = `class ${name}`;
      if (extendsClause) {
        sig += ` extends ${extendsClause.getText()}`;
      }
      if (implementsClause) {
        sig += ` implements ${implementsClause}`;
      }

      return sig;
    } catch {
      return "class";
    }
  }

  private getInterfaceSignature(iface: any): string {
    try {
      const name = iface.getName();
      const extendsClause = iface.getExtends().map((e: any) => e.getText()).join(", ");

      let sig = `interface ${name}`;
      if (extendsClause) {
        sig += ` extends ${extendsClause}`;
      }

      return sig;
    } catch {
      return "interface";
    }
  }

  private resolveModulePath(fromFile: string, moduleSpecifier: string): string {
    // Resolve relative import path to absolute file path
    const fromDir = fromFile.substring(0, fromFile.lastIndexOf("/"));
    const resolved = moduleSpecifier.endsWith(".ts")
      ? moduleSpecifier
      : `${moduleSpecifier}.ts`;

    // Normalize path (handle ../ and ./)
    const parts = fromDir.split("/");
    const moduleParts = resolved.split("/");

    for (const part of moduleParts) {
      if (part === "..") {
        parts.pop();
      } else if (part !== ".") {
        parts.push(part);
      }
    }

    return parts.join("/");
  }

  private findSymbolTarget(currentFile: string, symbolName: string): string {
    // Simple heuristic: if symbol name contains #, it's already a node ID
    if (symbolName.includes("#")) {
      return symbolName;
    }

    // Otherwise, assume it's in the current file
    return `${currentFile}#${symbolName}`;
  }

  private isLocalSymbol(name: string, relPath: string): boolean {
    // Filter out built-ins and library calls
    const builtIns = [
      "console", "process", "Buffer", "setTimeout", "setInterval",
      "clearTimeout", "clearInterval", "setImmediate", "Promise",
      "Array", "Object", "String", "Number", "Boolean", "Map", "Set",
      "JSON", "Math", "Date", "Error", "RegExp",
    ];

    if (builtIns.includes(name)) return false;
    if (name.includes(".")) return false; // Skip method calls like "fs.readFileSync"

    // Assume it's local if it doesn't look like a library import
    return !name.startsWith("require(") && !name.includes("import");
  }
}
