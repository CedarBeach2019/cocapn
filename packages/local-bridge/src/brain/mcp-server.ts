/**
 * BrainMCPServer — MCP server exposing Brain memory as tools and resources.
 *
 * Tools:
 *   - brain_set_fact: Set a key=value fact in the brain
 *   - brain_get_fact: Get a fact by key
 *   - brain_search_facts: Search facts by substring/pattern
 *   - brain_set_wiki_page: Create/update a wiki page
 *   - brain_get_wiki_page: Read a wiki page
 *   - brain_list_wiki_pages: List all wiki pages with titles
 *
 * Resources:
 *   - brain://soul: The soul.md content
 *   - brain://facts: All facts as JSON
 *   - brain://facts/{key}: Individual fact (resource template)
 *   - brain://wiki: All wiki pages index
 *   - brain://wiki/{slug}: Individual wiki page (resource template)
 */

import { MCPServer } from "../../../protocols/src/mcp/server.js";
import type { McpTool, McpResource, McpResourceTemplate } from "../../../protocols/src/mcp/types.js";
import { Brain } from "./index.js";
import type { WikiPage } from "./index.js";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrainMcpServerOptions {
  brain: Brain;
}

// ─── BrainMCPServer ─────────────────────────────────────────────────────────────

export class BrainMCPServer extends MCPServer {
  private brain: Brain;

  constructor(options: BrainMcpServerOptions) {
    super({
      serverInfo: {
        name: "cocapn-brain",
        version: "0.1.0",
      },
      capabilities: {
        tools: {},
        resources: {
          subscribe: false,
          listChanged: false,
        },
      },
    });
    this.brain = options.brain;
    this.registerTools();
    this.registerResources();
  }

  private registerTools(): void {
    // brain_set_fact — set a key=value fact (assistant-only)
    this.registerTool(
      {
        name: "brain_set_fact",
        description: "Set or update a fact in the brain memory. Facts are key-value pairs that persist across sessions.",
        title: "Set Brain Fact",
        inputSchema: {
          type: "object",
          properties: {
            key: {
              type: "string",
              description: "The fact key (e.g., 'user.name', 'project.status')",
            },
            value: {
              type: "string",
              description: "The fact value",
            },
          },
          required: ["key", "value"],
        },
        annotations: {
          audience: ["assistant"],
          priority: 0.8,
        },
      },
      async (params) => {
        const { key, value } = params.arguments ?? {};
        if (typeof key !== "string" || typeof value !== "string") {
          return {
            content: [
              { type: "text", text: "Error: key and value must be strings" },
            ],
            isError: true,
          };
        }
        await this.brain.setFact(key, value);
        return {
          content: [
            { type: "text", text: `Fact set: ${key} = ${value}` },
          ],
          isError: false,
        };
      }
    );

    // brain_get_fact — get a fact by key
    this.registerTool(
      {
        name: "brain_get_fact",
        description: "Retrieve a fact from the brain memory by its key.",
        title: "Get Brain Fact",
        inputSchema: {
          type: "object",
          properties: {
            key: {
              type: "string",
              description: "The fact key to retrieve",
            },
          },
          required: ["key"],
        },
        annotations: {
          audience: ["user", "assistant"],
          priority: 0.7,
        },
      },
      async (params) => {
        const { key } = params.arguments ?? {};
        if (typeof key !== "string") {
          return {
            content: [
              { type: "text", text: "Error: key must be a string" },
            ],
            isError: true,
          };
        }
        const value = this.brain.getFact(key);
        if (value === undefined) {
          return {
            content: [
              { type: "text", text: `Fact not found: ${key}` },
            ],
            isError: false,
          };
        }
        return {
          content: [
            { type: "text", text: `${key} = ${value}` },
          ],
          isError: false,
        };
      }
    );

    // brain_search_facts — search facts by substring/pattern
    this.registerTool(
      {
        name: "brain_search_facts",
        description: "Search for facts by key or value substring. Returns all matching facts.",
        title: "Search Brain Facts",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (matches against both keys and values)",
            },
          },
          required: ["query"],
        },
        annotations: {
          audience: ["user", "assistant"],
          priority: 0.6,
        },
      },
      async (params) => {
        const { query } = params.arguments ?? {};
        if (typeof query !== "string") {
          return {
            content: [
              { type: "text", text: "Error: query must be a string" },
            ],
            isError: true,
          };
        }
        const facts = this.brain.getAllFacts();
        const lower = query.toLowerCase();
        const matches: Array<{ key: string; value: string }> = [];
        for (const [key, value] of Object.entries(facts)) {
          if (key.toLowerCase().includes(lower) || value.toLowerCase().includes(lower)) {
            matches.push({ key, value });
          }
        }
        if (matches.length === 0) {
          return {
            content: [
              { type: "text", text: `No facts found matching: ${query}` },
            ],
            isError: false,
          };
        }
        const text = matches.map(({ key, value }) => `${key} = ${value}`).join("\n");
        return {
          content: [
            { type: "text", text: `Found ${matches.length} fact${matches.length === 1 ? "" : "s"}:\n${text}` },
          ],
          isError: false,
        };
      }
    );

    // brain_set_wiki_page — create/update a wiki page
    this.registerTool(
      {
        name: "brain_set_wiki_page",
        description: "Create or update a wiki page in the brain. The slug becomes the filename (e.g., 'my-page' -> 'my-page.md').",
        title: "Set Wiki Page",
        inputSchema: {
          type: "object",
          properties: {
            slug: {
              type: "string",
              description: "URL-friendly page identifier (e.g., 'my-page', 'projects/alpha')",
            },
            content: {
              type: "string",
              description: "Markdown content for the wiki page",
            },
          },
          required: ["slug", "content"],
        },
        annotations: {
          audience: ["assistant"],
          priority: 0.8,
        },
      },
      async (params) => {
        const { slug, content } = params.arguments ?? {};
        if (typeof slug !== "string" || typeof content !== "string") {
          return {
            content: [
              { type: "text", text: "Error: slug and content must be strings" },
            ],
            isError: true,
          };
        }
        // Get repo root from brain (private API access)
        const repoRoot = (this.brain as any).repoRoot as string;
        const wikiDir = join(repoRoot, "cocapn", "wiki");
        if (!existsSync(wikiDir)) {
          mkdirSync(wikiDir, { recursive: true });
        }
        const filename = slug.endsWith(".md") ? slug : `${slug}.md`;
        const filePath = join(wikiDir, filename);
        writeFileSync(filePath, content, "utf8");
        // Commit via sync
        const sync = (this.brain as any).sync as any;
        await sync.commit(`update memory: set wiki page ${slug}`);
        return {
          content: [
            { type: "text", text: `Wiki page saved: ${slug}` },
          ],
          isError: false,
        };
      }
    );

    // brain_get_wiki_page — read a wiki page
    this.registerTool(
      {
        name: "brain_get_wiki_page",
        description: "Retrieve a wiki page by its slug. Returns the full markdown content.",
        title: "Get Wiki Page",
        inputSchema: {
          type: "object",
          properties: {
            slug: {
              type: "string",
              description: "Page slug (e.g., 'my-page', 'projects/alpha')",
            },
          },
          required: ["slug"],
        },
        annotations: {
          audience: ["user", "assistant"],
          priority: 0.7,
        },
      },
      async (params) => {
        const { slug } = params.arguments ?? {};
        if (typeof slug !== "string") {
          return {
            content: [
              { type: "text", text: "Error: slug must be a string" },
            ],
            isError: true,
          };
        }
        const repoRoot = (this.brain as any).repoRoot as string;
        const filename = slug.endsWith(".md") ? slug : `${slug}.md`;
        const filePath = join(repoRoot, "cocapn", "wiki", filename);
        if (!existsSync(filePath)) {
          return {
            content: [
              { type: "text", text: `Wiki page not found: ${slug}` },
            ],
            isError: false,
          };
        }
        const content = readFileSync(filePath, "utf8");
        return {
          content: [
            { type: "text", text: content },
          ],
          isError: false,
        };
      }
    );

    // brain_list_wiki_pages — list all wiki pages
    this.registerTool(
      {
        name: "brain_list_wiki_pages",
        description: "List all wiki pages with their titles. Useful for discovering what knowledge is stored.",
        title: "List Wiki Pages",
        inputSchema: {
          type: "object",
          properties: {},
        },
        annotations: {
          audience: ["user", "assistant"],
          priority: 0.5,
        },
      },
      async () => {
        const repoRoot = (this.brain as any).repoRoot as string;
        const wikiDir = join(repoRoot, "cocapn", "wiki");
        if (!existsSync(wikiDir)) {
          return {
            content: [
              { type: "text", text: "No wiki pages found (wiki directory does not exist)" },
            ],
            isError: false,
          };
        }
        const results = await this.brain.searchWiki(""); // Search all pages
        if (results.length === 0) {
          return {
            content: [
              { type: "text", text: "No wiki pages found" },
            ],
            isError: false,
          };
        }
        const text = results.map(({ file, title }) => `- ${file}: ${title}`).join("\n");
        return {
          content: [
            { type: "text", text: `Wiki pages:\n${text}` },
          ],
          isError: false,
        };
      }
    );
  }

  private registerResources(): void {
    // brain://soul — soul.md content
    this.registerResource(
      {
        uri: "brain://soul",
        name: "soul",
        title: "Agent Soul",
        description: "The agent's personality and behavior definition (soul.md)",
        mimeType: "text/markdown",
      },
      async () => {
        const soul = this.brain.getSoul();
        return {
          contents: [
            {
              uri: "brain://soul",
              mimeType: "text/markdown",
              text: soul || "# No soul.md found",
            },
          ],
        };
      }
    );

    // brain://facts — all facts as JSON
    this.registerResource(
      {
        uri: "brain://facts",
        name: "facts",
        title: "All Facts",
        description: "All facts stored in brain memory as JSON",
        mimeType: "application/json",
      },
      async () => {
        const facts = this.brain.getAllFacts();
        return {
          contents: [
            {
              uri: "brain://facts",
              mimeType: "application/json",
              text: JSON.stringify(facts, null, 2),
            },
          ],
        };
      }
    );

    // brain://facts/{key} — individual fact (resource template)
    this.registerResourceTemplate({
      uriTemplate: "brain://facts/{key}",
      name: "fact",
      title: "Individual Fact",
      description: "A single fact by its key",
      mimeType: "text/plain",
    });

    // brain://wiki — wiki index
    this.registerResource(
      {
        uri: "brain://wiki",
        name: "wiki",
        title: "Wiki Index",
        description: "Index of all wiki pages",
        mimeType: "application/json",
      },
      async () => {
        const repoRoot = (this.brain as any).repoRoot as string;
        const wikiDir = join(repoRoot, "cocapn", "wiki");
        let pages: WikiPage[] = [];
        if (existsSync(wikiDir)) {
          pages = this.brain.searchWiki("");
        }
        return {
          contents: [
            {
              uri: "brain://wiki",
              mimeType: "application/json",
              text: JSON.stringify(pages, null, 2),
            },
          ],
        };
      }
    );

    // brain://wiki/{slug} — individual wiki page (resource template)
    this.registerResourceTemplate({
      uriTemplate: "brain://wiki/{slug}",
      name: "wiki-page",
      title: "Wiki Page",
      description: "Individual wiki page by slug",
      mimeType: "text/markdown",
    });

    // Register pattern handlers for dynamic URIs
    // brain://facts/{key} — individual fact
    this.registerResourcePattern({
      pattern: "brain://facts/",
      handler: async (params) => {
        const key = params.uri.slice("brain://facts/".length);
        const value = this.brain.getFact(key);
        if (value === undefined) {
          throw Object.assign(
            new Error(`Fact not found: ${key}`),
            { code: -32602 } // InvalidParams
          );
        }
        return {
          contents: [
            {
              uri: params.uri,
              mimeType: "text/plain",
              text: value,
            },
          ],
        };
      },
    });

    // brain://wiki/{slug} — individual wiki page
    this.registerResourcePattern({
      pattern: "brain://wiki/",
      handler: async (params) => {
        const slug = params.uri.slice("brain://wiki/".length);
        const repoRoot = (this.brain as any).repoRoot as string;
        const filename = slug.endsWith(".md") ? slug : `${slug}.md`;
        const filePath = join(repoRoot, "cocapn", "wiki", filename);
        if (!existsSync(filePath)) {
          throw Object.assign(
            new Error(`Wiki page not found: ${slug}`),
            { code: -32602 } // InvalidParams
          );
        }
        const content = readFileSync(filePath, "utf8");
        return {
          contents: [
            {
              uri: params.uri,
              mimeType: "text/markdown",
              text: content,
            },
          ],
        };
      },
    });
  }
}
