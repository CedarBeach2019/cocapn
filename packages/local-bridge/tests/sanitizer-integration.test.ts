/**
 * Sanitizer Integration Tests — using ACTUAL Sanitizer class from src/publishing/sanitizer.ts
 *
 * Tests the actual Sanitizer methods:
 * - sanitizeWikiPage(content)
 * - sanitizeTask(task)
 * - generateDigest(tasks, wikiPages)
 */

import { describe, it, expect } from "vitest";
import { Sanitizer, type Digest } from "../src/publishing/sanitizer.js";
import type { Task } from "../src/brain/index.js";

// ─── Wiki Page Sanitization Tests ───────────────────────────────────────────────

describe("Sanitizer Integration: Wiki Pages (ACTUAL)", () => {
  const sanitizer = new Sanitizer();

  it("removes fenced code blocks (backtick)", () => {
    const input = `
# My Notes

Here's some code:

\`\`\`javascript
const secret = "password123";
api_key = "abc-def";
\`\`\`

And some normal text.
`;

    const result = sanitizer.sanitizeWikiPage(input);
    expect(result).toContain("[code block removed]");
    expect(result).not.toContain("password123");
    expect(result).not.toContain("api_key");
    expect(result).toContain("And some normal text");
  });

  it("removes fenced code blocks (tilde)", () => {
    const input = `~~~python
TOKEN = "sk-1234567890"
~~~`;

    const result = sanitizer.sanitizeWikiPage(input);
    expect(result).toContain("[code block removed]");
    expect(result).not.toContain("TOKEN");
    expect(result).not.toContain("sk-1234567890");
  });

  it("removes internal URLs", () => {
    const input = `
Visited http://localhost:8080/api/test
Also checked https://127.0.0.1:3000/secret
`;
    const result = sanitizer.sanitizeWikiPage(input);
    expect(result).toContain("[internal URL removed]");
    expect(result).not.toContain("localhost:8080");
    expect(result).not.toContain("127.0.0.1:3000");
  });

  it("removes UNIX home paths", () => {
    const input = `
My project is in /Users/alice/code/project
Config at /home/bob/.config/app.json
`;
    const result = sanitizer.sanitizeWikiPage(input);
    expect(result).toContain("[path removed]");
    expect(result).not.toContain("/Users/alice");
    expect(result).not.toContain("/home/bob");
  });

  it("removes Windows user paths", () => {
    const input = `Files in C:\\Users\\John\\Documents`;
    const result = sanitizer.sanitizeWikiPage(input);
    expect(result).toContain("[path removed]");
    expect(result).not.toContain("C:\\Users\\John");
  });

  it("removes environment variable assignments", () => {
    const input = `
Set API_KEY=sk-1234567890
export DATABASE_URL=postgres://localhost/db
SECRET_TOKEN=abc123
`;
    const result = sanitizer.sanitizeWikiPage(input);
    expect(result).toContain("[env var removed]");
    expect(result).not.toContain("API_KEY=sk-1234567890");
    expect(result).not.toContain("DATABASE_URL=postgres://");
  });

  it("removes lines with sensitive keywords", () => {
    const input = `
This is a normal line.
My password is hunter2
The access_key is AKIA1234567890
Another normal line.
`;
    const result = sanitizer.sanitizeWikiPage(input);
    expect(result).toContain("This is a normal line");
    expect(result).toContain("[redacted]");
    expect(result).toContain("Another normal line");
    expect(result).not.toContain("hunter2");
    expect(result).not.toContain("AKIA1234567890");
  });

  it("preserves safe content", () => {
    const input = `
# Project Notes

- Task 1: Implement feature X
- Task 2: Fix bug Y

Learned about React and TypeScript.
`;
    const result = sanitizer.sanitizeWikiPage(input);
    expect(result).toContain("Project Notes");
    expect(result).toContain("Implement feature X");
    expect(result).toContain("React and TypeScript");
  });
});

// ─── Task Sanitization Tests ─────────────────────────────────────────────────────

describe("Sanitizer Integration: Tasks (ACTUAL)", () => {
  const sanitizer = new Sanitizer();

  it("passes through safe task fields", () => {
    const task: Task = {
      id: "task-1",
      title: "Build feature",
      description: "Implement the new feature for users",
      status: "active",
      createdAt: "2026-03-28T00:00:00.000Z",
    };

    const result = sanitizer.sanitizeTask(task);
    expect(result.id).toBe("task-1");
    expect(result.title).toBe("Build feature");
    expect(result.status).toBe("active");
    expect(result.createdAt).toBe("2026-03-28T00:00:00.000Z");
    expect(result.description).toBe("Implement the new feature for users");
  });

  it("redacts code-heavy descriptions", () => {
    const task: Task = {
      id: "task-1",
      title: "Fix bug",
      description: `
\`\`\`typescript
const API_KEY = "sk-1234567890";
function fetch() { return token; }
\`\`\`
`,
      status: "active",
      createdAt: "2026-03-28T00:00:00.000Z",
    };

    const result = sanitizer.sanitizeTask(task);
    expect(result.description).toBe("[implementation details removed]");
  });

  it("removes sensitive patterns from task descriptions", () => {
    const task: Task = {
      id: "task-1",
      title: "Configure API",
      description: "Set API_KEY=sk-1234567890 in /Users/alice/config",
      status: "active",
      createdAt: "2026-03-28T00:00:00.000Z",
    };

    const result = sanitizer.sanitizeTask(task);
    expect(result.description).not.toContain("sk-1234567890");
    expect(result.description).not.toContain("/Users/alice");
  });
});

// ─── Digest Generation Tests ─────────────────────────────────────────────────────

describe("Sanitizer Integration: Digest Generation (ACTUAL)", () => {
  const sanitizer = new Sanitizer();

  it("generates digest with no tasks", () => {
    const digest = sanitizer.generateDigest([], []);
    expect(digest.summary).toBe("No tasks recorded.");
    expect(digest.accomplishments).toEqual([]);
    expect(digest.learnings).toEqual([]);
    expect(digest.streakDay).toBe(false);
  });

  it("generates digest with active tasks only", () => {
    const tasks: Task[] = [
      {
        id: "task-1",
        title: "Design UI",
        description: "Create mockups",
        status: "active",
        createdAt: "2026-03-28T00:00:00.000Z",
      },
      {
        id: "task-2",
        title: "Write tests",
        description: "Add unit tests",
        status: "active",
        createdAt: "2026-03-28T00:00:00.000Z",
      },
    ];

    const digest = sanitizer.generateDigest(tasks, []);
    expect(digest.summary).toBe("0 tasks completed, 2 in progress.");
    expect(digest.accomplishments).toEqual([]);
    expect(digest.streakDay).toBe(false);
  });

  it("generates digest with completed tasks", () => {
    const tasks: Task[] = [
      {
        id: "task-1",
        title: "Fix authentication bug",
        description: "Fixed JWT validation",
        status: "done",
        createdAt: "2026-03-28T00:00:00.000Z",
      },
      {
        id: "task-2",
        title: "Add tests",
        description: "Added unit tests",
        status: "done",
        createdAt: "2026-03-28T00:00:00.000Z",
      },
      {
        id: "task-3",
        title: "Documentation",
        description: "Write README",
        status: "active",
        createdAt: "2026-03-28T00:00:00.000Z",
      },
    ];

    const digest = sanitizer.generateDigest(tasks, []);
    expect(digest.summary).toBe("2 tasks completed, 1 in progress.");
    expect(digest.accomplishments).toEqual([
      "Fix authentication bug",
      "Add tests",
    ]);
    expect(digest.streakDay).toBe(true);
  });

  it("extracts learnings from wiki page headings", () => {
    const tasks: Task[] = [];
    const wikiPages = [
      `
# React Hooks
Learned about useState and useEffect.

## TypeScript Types
Discovered utility types.
`,
      `
# Testing
Found vitest is fast.
`,
    ];

    const digest = sanitizer.generateDigest(tasks, wikiPages);
    expect(digest.learnings).toContain("React Hooks");
    expect(digest.learnings).toContain("TypeScript Types");
    expect(digest.learnings).toContain("Testing");
    expect(digest.learnings.length).toBeLessThanOrEqual(5);
  });

  it("sanitizes wiki content before extracting learnings", () => {
    const tasks: Task[] = [
      {
        id: "task-1",
        title: "Secret task",
        description: "password123",
        status: "done",
        createdAt: "2026-03-28T00:00:00.000Z",
      },
    ];
    const wikiPages = [
      `
# API Setup
\`\`\`javascript
const API_KEY = "sk-secret";
\`\`\`

## Configuration Guide
Store credentials in env var.
`,
    ];

    const digest = sanitizer.generateDigest(tasks, wikiPages);
    // Headings without sensitive keywords are extracted
    expect(digest.learnings).toContain("API Setup");
    expect(digest.learnings).toContain("Configuration Guide");
    // But secrets in the content are removed
    expect(digest.summary).not.toContain("sk-secret");
  });

  it("limits learnings to 5 items", () => {
    const tasks: Task[] = [];
    const wikiPages = [
      `
# Topic 1
Content
## Topic 2
Content
## Topic 3
Content
## Topic 4
Content
## Topic 5
Content
## Topic 6 (should not appear)
Content
`,
    ];

    const digest = sanitizer.generateDigest(tasks, wikiPages);
    expect(digest.learnings.length).toBe(5);
    expect(digest.learnings).not.toContain("Topic 6");
  });
});
