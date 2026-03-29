/**
 * RepoParser Tests — Parser unit tests.
 *
 * Tests AST extraction from TypeScript source code.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { rmSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { RepoParser } from "../../src/graph/parser.js";

describe("RepoParser", () => {
  const testDir = join(process.cwd(), ".test-parser-tmp");
  let parser: RepoParser;

  beforeEach(() => {
    // Clean up before each test
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }

    // Create test directory
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up after each test
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("parseFile", () => {
    beforeEach(() => {
      // Initialize parser for each parseFile test
      parser = new RepoParser(testDir);
    });

    it("should extract function declarations", () => {
      const testFile = join(testDir, "test.ts");
      const code = "function testFunc(a: string, b: number): boolean {\n  return true;\n}";
      writeFileSync(testFile, code, "utf8");

      const result = parser.parseFile(testFile);

      const funcNodes = result.nodes.filter((n) => n.type === "function");
      expect(funcNodes.length).toBeGreaterThan(0);
      expect(funcNodes[0]?.name).toBe("testFunc");
      expect(funcNodes[0]?.signature).toContain("testFunc");
    });

    it("should extract class declarations", () => {
      const testFile = join(testDir, "test.ts");
      const code = "class MyClass {\n  constructor(public value: string) {}\n  method(): void {\n    console.log(this.value);\n  }\n}";
      writeFileSync(testFile, code, "utf8");

      const result = parser.parseFile(testFile);

      const classNodes = result.nodes.filter((n) => n.type === "class");
      expect(classNodes.length).toBeGreaterThan(0);
      expect(classNodes[0]?.name).toBe("MyClass");

      // Should also extract methods
      const funcNodes = result.nodes.filter((n) => n.type === "function");
      const methodNodes = funcNodes.filter((n) => n.name.includes("method"));
      expect(methodNodes.length).toBeGreaterThan(0);
    });

    it("should extract interface declarations", () => {
      const testFile = join(testDir, "test.ts");
      const code = "interface MyInterface {\n  value: string;\n  method(): void;\n}\ntype MyType = string | number;";
      writeFileSync(testFile, code, "utf8");

      const result = parser.parseFile(testFile);

      const ifaceNodes = result.nodes.filter((n) => n.type === "interface");
      expect(ifaceNodes.length).toBeGreaterThanOrEqual(2);
      expect(ifaceNodes.some((n) => n.name === "MyInterface")).toBe(true);
      expect(ifaceNodes.some((n) => n.name === "MyType")).toBe(true);
    });

    it("should extract variable declarations", () => {
      const testFile = join(testDir, "test.ts");
      const code = "const myVar = 'test';\nlet myLet = 42;";
      writeFileSync(testFile, code, "utf8");

      const result = parser.parseFile(testFile);

      const varNodes = result.nodes.filter((n) => n.type === "variable");
      expect(varNodes.length).toBeGreaterThan(0);
      expect(varNodes.some((n) => n.name === "myVar")).toBe(true);
      expect(varNodes.some((n) => n.name === "myLet")).toBe(true);
    });

    it("should extract import statements", () => {
      const testFile = join(testDir, "test.ts");
      const code = "import { func1 } from './module1';\nimport * as mod2 from './module2';\nimport mod3 from './module3';";
      writeFileSync(testFile, code, "utf8");

      const result = parser.parseFile(testFile);

      const importNodes = result.nodes.filter((n) => n.type === "import");
      expect(importNodes.length).toBe(3);
      expect(importNodes.some((n) => n.importsModule === "./module1")).toBe(true);
      expect(importNodes.some((n) => n.importsModule === "./module2")).toBe(true);
      expect(importNodes.some((n) => n.importsModule === "./module3")).toBe(true);
    });

    it("should extract export statements", () => {
      const testFile = join(testDir, "test.ts");
      const code = "export function exportFunc() {}\nexport class ExportClass {}\nexport interface ExportInterface {}\nexport { exportFunc };\nexport * from './other';";
      writeFileSync(testFile, code, "utf8");

      const result = parser.parseFile(testFile);

      const exportNodes = result.nodes.filter((n) => n.type === "export");
      expect(exportNodes.length).toBeGreaterThan(0);
    });

    it("should extract import edges between files", () => {
      // Create a module file
      const moduleFile = join(testDir, "module.ts");
      writeFileSync(moduleFile, "export function moduleFunc() {}", "utf8");

      // Create a file that imports it
      const testFile = join(testDir, "test.ts");
      writeFileSync(testFile, "import { moduleFunc } from './module';", "utf8");

      const result = parser.parseFile(testFile);

      const importEdges = result.edges.filter((e) => e.type === "imports");
      expect(importEdges.length).toBeGreaterThan(0);
    });

    it("should extract contains edges", () => {
      const testFile = join(testDir, "test.ts");
      writeFileSync(testFile, "function testFunc() {}\nclass TestClass {}", "utf8");

      const result = parser.parseFile(testFile);

      const containsEdges = result.edges.filter((e) => e.type === "contains");
      expect(containsEdges.length).toBeGreaterThan(0);
    });

    it("should extract extends edges for class inheritance", () => {
      const testFile = join(testDir, "test.ts");
      writeFileSync(testFile, "class BaseClass {}\nclass DerivedClass extends BaseClass {}", "utf8");

      const result = parser.parseFile(testFile);

      const extendsEdges = result.edges.filter((e) => e.type === "extends");
      expect(extendsEdges.length).toBeGreaterThan(0);
      expect(extendsEdges[0]?.source).toContain("DerivedClass");
    });

    it("should extract implements edges for interface implementations", () => {
      const testFile = join(testDir, "test.ts");
      writeFileSync(testFile, "interface MyInterface {\n  method(): void;\n}\nclass MyClass implements MyInterface {\n  method(): void {}\n}", "utf8");

      const result = parser.parseFile(testFile);

      const implEdges = result.edges.filter((e) => e.type === "implements");
      expect(implEdges.length).toBeGreaterThan(0);
      expect(implEdges[0]?.source).toContain("MyClass");
    });

    it("should handle files with syntax errors gracefully", () => {
      const testFile = join(testDir, "invalid.ts");
      writeFileSync(testFile, "this is not valid typescript {{{{", "utf8");

      // Should not throw
      const result = parser.parseFile(testFile);
      expect(result).toBeDefined();
    });

    it("should extract JSDoc comments", () => {
      const testFile = join(testDir, "test.ts");
      const code = "/**\n * This is a test function.\n * @param input - The input value\n * @returns The output value\n */\nfunction documentedFunc(input: string): string {\n  return input;\n}";
      writeFileSync(testFile, code, "utf8");

      const result = parser.parseFile(testFile);

      const funcNode = result.nodes.find((n) => n.name === "documentedFunc");
      expect(funcNode?.docs).toBeDefined();
      expect(funcNode?.docs).toContain("test function");
    });

    it("should handle anonymous functions", () => {
      const testFile = join(testDir, "test.ts");
      writeFileSync(testFile, "const myFunc = function() {\n  return true;\n};", "utf8");

      const result = parser.parseFile(testFile);

      // Should find the variable declaration
      const varNodes = result.nodes.filter((n) => n.type === "variable");
      expect(varNodes.some((n) => n.name === "myFunc")).toBe(true);
    });

    it("should handle arrow functions", () => {
      const testFile = join(testDir, "test.ts");
      writeFileSync(testFile, "const myArrowFunc = (a: string, b: number): boolean => {\n  return true;\n};", "utf8");

      const result = parser.parseFile(testFile);

      // Should find the variable declaration
      const varNodes = result.nodes.filter((n) => n.type === "variable");
      expect(varNodes.some((n) => n.name === "myArrowFunc")).toBe(true);
    });

    it("should handle empty files", () => {
      const testFile = join(testDir, "empty.ts");
      writeFileSync(testFile, "", "utf8");

      const result = parser.parseFile(testFile);
      expect(result.nodes).toBeDefined();
      expect(result.edges).toBeDefined();
    });
  });

  describe("parseDirectory", () => {
    beforeEach(() => {
      // Initialize parser for each parseDirectory test
      parser = new RepoParser(testDir);
    });

    it("should parse all TypeScript files in a directory", () => {
      // Create multiple test files
      writeFileSync(join(testDir, "file1.ts"), "export const a = 1;", "utf8");
      writeFileSync(join(testDir, "file2.ts"), "export const b = 2;", "utf8");
      writeFileSync(join(testDir, "file3.ts"), "export const c = 3;", "utf8");

      const result = parser.parseDirectory(testDir);

      // Should extract nodes from all files
      const fileNodes = result.nodes.filter((n) => n.type === "file");
      expect(fileNodes.length).toBeGreaterThanOrEqual(3);
    });

    it("should handle directories with no TypeScript files", () => {
      // Create a subdirectory with no TS files
      const subdir = join(testDir, "subdir");
      mkdirSync(subdir, { recursive: true });
      writeFileSync(join(subdir, "readme.md"), "# Readme", "utf8");

      const result = parser.parseDirectory(subdir);
      expect(result.nodes.length).toBe(0);
    });

    it("should handle non-existent directories", () => {
      const result = parser.parseDirectory("/non/existent/path");
      expect(result.nodes.length).toBe(0);
      expect(result.edges.length).toBe(0);
    });
  });

  describe("node structure", () => {
    beforeEach(() => {
      // Initialize parser for each node structure test
      parser = new RepoParser(testDir);
    });

    it("should include line numbers for functions", () => {
      const testFile = join(testDir, "test.ts");
      writeFileSync(testFile, "function testFunc() {\n  return true;\n}", "utf8");

      const result = parser.parseFile(testFile);
      const funcNode = result.nodes.find((n) => n.name === "testFunc");

      expect(funcNode?.startLine).toBeDefined();
      expect(funcNode?.endLine).toBeDefined();
      expect(funcNode!.startLine!).toBeLessThan(funcNode!.endLine!);
    });

    it("should include file path in nodes", () => {
      const testFile = join(testDir, "test.ts");
      writeFileSync(testFile, "function testFunc() {}", "utf8");

      const result = parser.parseFile(testFile);
      const funcNode = result.nodes.find((n) => n.name === "testFunc");

      expect(funcNode?.file).toBeDefined();
      expect(funcNode?.file).toContain("test.ts");
    });

    it("should generate unique IDs for nodes", () => {
      const testFile = join(testDir, "test.ts");
      writeFileSync(testFile, "function func1() {}\nfunction func2() {}\nclass MyClass {}", "utf8");

      const result = parser.parseFile(testFile);
      const ids = result.nodes.map((n) => n.id);

      // All IDs should be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("edge structure", () => {
    beforeEach(() => {
      // Initialize parser for each edge structure test
      parser = new RepoParser(testDir);
    });

    it("should create edges with proper source and target", () => {
      const testFile = join(testDir, "test.ts");
      writeFileSync(testFile, "function testFunc() {}", "utf8");

      const result = parser.parseFile(testFile);
      const containsEdge = result.edges.find((e) => e.type === "contains");

      expect(containsEdge).toBeDefined();
      expect(containsEdge?.source).toBeDefined();
      expect(containsEdge?.target).toBeDefined();
    });

    it("should use valid edge types", () => {
      const testFile = join(testDir, "test.ts");
      writeFileSync(testFile, "import { something } from './module';\nfunction testFunc() {}", "utf8");

      const result = parser.parseFile(testFile);
      const edgeTypes = new Set(result.edges.map((e) => e.type));

      // Check that all edge types are valid
      const validTypes = new Set([
        "imports", "exports", "calls", "extends", "implements", "uses", "contains", "depends_on"
      ]);

      for (const type of edgeTypes) {
        expect(validTypes).toContain(type);
      }
    });
  });

  describe("complex code patterns", () => {
    beforeEach(() => {
      // Initialize parser for each complex code pattern test
      parser = new RepoParser(testDir);
    });

    it("should handle generic types", () => {
      const testFile = join(testDir, "test.ts");
      const code = "interface GenericInterface<T> {\n  value: T;\n}\nclass GenericClass<T> implements GenericInterface<T> {\n  constructor(public value: T) {}\n}";
      writeFileSync(testFile, code, "utf8");

      const result = parser.parseFile(testFile);

      const ifaceNode = result.nodes.find((n) => n.name === "GenericInterface");
      const classNode = result.nodes.find((n) => n.name === "GenericClass");

      expect(ifaceNode).toBeDefined();
      expect(classNode).toBeDefined();
    });

    it("should handle nested classes", () => {
      const testFile = join(testDir, "test.ts");
      const code = "class OuterClass {\n  innerValue: string;\n  innerMethod() {\n    class InnerClass {\n      constructor(public value: number) {}\n    }\n    return new InnerClass(42);\n  }\n}";
      writeFileSync(testFile, code, "utf8");

      const result = parser.parseFile(testFile);

      const outerClass = result.nodes.find((n) => n.name === "OuterClass");
      expect(outerClass).toBeDefined();
    });

    it("should handle async functions", () => {
      const testFile = join(testDir, "test.ts");
      writeFileSync(testFile, "async function asyncFunc(): Promise<string> {\n  return 'test';\n}", "utf8");

      const result = parser.parseFile(testFile);

      const funcNode = result.nodes.find((n) => n.name === "asyncFunc");
      expect(funcNode).toBeDefined();
      expect(funcNode?.signature).toContain("async");
    });

    it("should handle decorators (TypeScript experimental)", () => {
      const testFile = join(testDir, "test.ts");
      const code = "function MyDecorator(target: any) {\n  // decorator logic\n}\nclass DecoratedClass {\n  @MyDecorator\n  method() {\n    return true;\n  }\n}";
      writeFileSync(testFile, code, "utf8");

      const result = parser.parseFile(testFile);

      const classNode = result.nodes.find((n) => n.name === "DecoratedClass");
      expect(classNode).toBeDefined();
    });
  });
});
