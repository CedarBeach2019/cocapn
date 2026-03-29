/**
 * Template Registry Client — npm-style registry for Cocapn templates
 *
 * Provides a client for:
 * - Searching remote template registry
 * - Downloading and installing templates
 * - Publishing templates to registry
 * - Managing local template cache
 * - Offline mode with local registry
 * - Built-in templates for common use cases
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  cpSync,
} from "fs";
import { join, dirname, homedir } from "path";
import { fileURLToPath } from "url";
import type {
  RegistryConfig,
  PublishedTemplate,
  SearchResult,
  InstalledTemplate,
  TemplatePackageManifest,
  DownloadResult,
  PublishResult,
  LocalRegistryIndex,
  LocalRegistryEntry,
} from "./registry-client-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Default configuration
const DEFAULT_API_URL = "https://registry.cocapn.ai/api";
const DEFAULT_LOCAL_PATH = join(homedir(), ".cocapn", "registry");
const BUILTIN_TEMPLATES_DIR = join(__dirname, "../../../templates");

/**
 * Built-in templates that are always available without download
 */
export const BUILTIN_TEMPLATES: readonly string[] = [
  "bare",
  "cloud-worker",
  "web-app",
  "dmlog",
  "studylog",
  "makerlog",
  "businesslog",
] as const;

/**
 * Template Registry Client
 *
 * Main client for interacting with the Cocapn template registry.
 * Supports both remote API and local offline mode.
 */
export class TemplateRegistryClient {
  private apiUrl: string;
  private authToken?: string;
  private localPath: string;
  private localIndexPath: string;
  private localTemplatesPath: string;

  constructor(config?: RegistryConfig) {
    this.apiUrl = config?.apiUrl || DEFAULT_API_URL;
    this.authToken = config?.authToken;
    this.localPath = config?.localPath || DEFAULT_LOCAL_PATH;
    this.localIndexPath = join(this.localPath, "index.json");
    this.localTemplatesPath = join(this.localPath, "templates");
    this.ensureLocalRegistry();
  }

  // ---------------------------------------------------------------------------
  // Remote Registry API
  // ---------------------------------------------------------------------------

  /**
   * Search templates in the registry
   */
  async search(query: string, limit = 20): Promise<SearchResult> {
    // Try remote API first
    try {
      const url = new URL(`${this.apiUrl}/templates/search`);
      url.searchParams.set("q", query);
      url.searchParams.set("limit", limit.toString());

      const response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const result = (await response.json()) as SearchResult;
        return result;
      }
    } catch (err) {
      // Fall through to local search
      console.debug(`[registry] Remote search failed, using local: ${err}`);
    }

    // Fallback to local search
    return this.searchLocal(query);
  }

  /**
   * Get template details from the registry
   */
  async get(name: string): Promise<PublishedTemplate | null> {
    // Check built-in templates first
    if (this.isBuiltinTemplate(name)) {
      return this.getBuiltinTemplate(name);
    }

    // Try remote API
    try {
      const url = new URL(`${this.apiUrl}/templates/${encodeURIComponent(name)}`);
      const response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
        },
      });

      if (response.ok) {
        return (await response.json()) as PublishedTemplate;
      }
    } catch (err) {
      console.debug(`[registry] Remote get failed, using local: ${err}`);
    }

    // Fallback to local registry
    return this.getLocalTemplate(name);
  }

  /**
   * Download a template package
   */
  async download(name: string, version?: string): Promise<DownloadResult> {
    // Check built-in templates first
    if (this.isBuiltinTemplate(name)) {
      return this.downloadBuiltin(name);
    }

    // Try remote download
    try {
      const url = new URL(
        `${this.apiUrl}/templates/${encodeURIComponent(name)}/download`
      );
      if (version) {
        url.searchParams.set("version", version);
      }

      const response = await fetch(url.toString());
      if (response.ok) {
        const content = Buffer.from(await response.arrayBuffer());
        const targetPath = join(this.localTemplatesPath, `${name}-${version || "latest"}.tgz`);

        return {
          name,
          version: version || "latest",
          content,
          targetPath,
        };
      }
    } catch (err) {
      console.debug(`[registry] Remote download failed, using local: ${err}`);
    }

    // Fallback to local template
    return this.downloadLocal(name, version);
  }

  /**
   * Publish a template to the registry
   */
  async publish(templateDir: string): Promise<PublishResult> {
    // Read manifest
    const manifestPath = join(templateDir, "cocapn-template.json");
    if (!existsSync(manifestPath)) {
      return {
        ok: false,
        error: "Missing cocapn-template.json manifest",
      };
    }

    const manifest = JSON.parse(
      readFileSync(manifestPath, "utf8")
    ) as TemplatePackageManifest;

    // Validate manifest
    const validation = this.validateManifest(manifest);
    if (!validation.valid) {
      return {
        ok: false,
        error: `Invalid manifest: ${validation.errors.join(", ")}`,
      };
    }

    // Check for auth token
    if (!this.authToken) {
      return {
        ok: false,
        error: "Authentication required. Set authToken or use COCAPN_REGISTRY_TOKEN env var.",
      };
    }

    // Create a tarball (simplified - in production use tar or fstream)
    // For now, we'll just upload the manifest as JSON
    try {
      const url = new URL(`${this.apiUrl}/templates/${encodeURIComponent(manifest.name)}`);
      const response = await fetch(url.toString(), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.authToken}`,
          Accept: "application/json",
        },
        body: JSON.stringify(manifest),
      });

      if (response.ok) {
        const result = (await response.json()) as { url?: string };
        return {
          ok: true,
          url: result.url || `${this.apiUrl}/templates/${manifest.name}`,
        };
      }

      const error = (await response.json()) as { error?: string };
      return {
        ok: false,
        error: error.error || `HTTP ${response.status}`,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Local Template Management
  // ---------------------------------------------------------------------------

  /**
   * List all installed templates
   */
  listInstalled(): InstalledTemplate[] {
    const installed: InstalledTemplate[] = [];

    if (!existsSync(this.localTemplatesPath)) {
      return installed;
    }

    const entries = readdirSync(this.localTemplatesPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const manifestPath = join(this.localTemplatesPath, entry.name, "cocapn-template.json");
      if (!existsSync(manifestPath)) {
        continue;
      }

      try {
        const manifest = JSON.parse(
          readFileSync(manifestPath, "utf8")
        ) as TemplatePackageManifest;
        const stats = readFileSync(manifestPath); // Use to get mtime if needed

        installed.push({
          name: manifest.name,
          version: manifest.version,
          path: join(this.localTemplatesPath, entry.name),
          installedAt: new Date().toISOString(), // Would use actual install time
        });
      } catch (err) {
        console.warn(`[registry] Failed to read installed template ${entry.name}:`, err);
      }
    }

    return installed.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Install a template from registry
   */
  async install(name: string, version?: string): Promise<string> {
    // Check if already installed
    const installedPath = join(this.localTemplatesPath, name);
    if (existsSync(installedPath)) {
      // Update existing installation
      rmSync(installedPath, { recursive: true, force: true });
    }

    // Download template
    const download = await this.download(name, version);
    mkdirSync(installedPath, { recursive: true });

    // Extract content (simplified - assumes content is a tarball)
    // For built-in templates, copy from source
    if (this.isBuiltinTemplate(name)) {
      const sourcePath = join(BUILTIN_TEMPLATES_DIR, name);
      if (existsSync(sourcePath)) {
        this.copyDirectory(sourcePath, installedPath);
      } else {
        // Create minimal structure for built-in
        this.createBuiltinTemplate(name, installedPath);
      }
    } else {
      // Write downloaded content
      writeFileSync(join(installedPath, "template.tgz"), download.content);
      // In production, extract the tarball here
    }

    // Update local index
    this.updateLocalIndex(name, download.version, installedPath);

    return installedPath;
  }

  /**
   * Uninstall a template
   */
  uninstall(name: string): void {
    const installedPath = join(this.localTemplatesPath, name);

    if (!existsSync(installedPath)) {
      throw new Error(`Template not installed: ${name}`);
    }

    rmSync(installedPath, { recursive: true, force: true });

    // Update local index
    const index = this.loadLocalIndex();
    delete index.templates[name];
    this.saveLocalIndex(index);
  }

  // ---------------------------------------------------------------------------
  // Built-in Templates
  // ---------------------------------------------------------------------------

  /**
   * Check if a template is built-in
   */
  isBuiltinTemplate(name: string): boolean {
    return BUILTIN_TEMPLATES.includes(name as (typeof BUILTIN_TEMPLATES)[number]);
  }

  /**
   * Get built-in template metadata
   */
  private getBuiltinTemplate(name: string): PublishedTemplate | null {
    const builtin: Record<string, PublishedTemplate> = {
      bare: {
        name: "bare",
        version: "1.0.0",
        description: "Minimal Cocapn instance with just the essentials",
        author: "Cocapn",
        keywords: ["minimal", "starter", "basic"],
        downloads: 0,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        license: "MIT",
      },
      "cloud-worker": {
        name: "cloud-worker",
        version: "1.0.0",
        description: "Cloudflare Workers deployment with Hono framework",
        author: "Cocapn",
        keywords: ["cloudflare", "worker", "serverless", "hono"],
        downloads: 0,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        license: "MIT",
      },
      "web-app": {
        name: "web-app",
        version: "1.0.0",
        description: "React/Preact web application frontend",
        author: "Cocapn",
        keywords: ["react", "preact", "web", "frontend", "vite"],
        downloads: 0,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        license: "MIT",
      },
      dmlog: {
        name: "dmlog",
        version: "1.0.0",
        description: "TTRPG AI Dungeon Master with dice rolling and encounter generation",
        author: "Cocapn",
        keywords: ["ttrpg", "dungeon-master", "dnd", "dice", "encounter"],
        downloads: 0,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        license: "MIT",
      },
      studylog: {
        name: "studylog",
        version: "1.0.0",
        description: "Interactive learning platform with spaced repetition",
        author: "Cocapn",
        keywords: ["education", "learning", "flashcards", "spaced-repetition", "quiz"],
        downloads: 0,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        license: "MIT",
      },
      makerlog: {
        name: "makerlog",
        version: "1.0.0",
        description: "Developer project tracker with build logs and metrics",
        author: "Cocapn",
        keywords: ["developer", "projects", "maker", "build-log", "metrics"],
        downloads: 0,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        license: "MIT",
      },
      businesslog: {
        name: "businesslog",
        version: "1.0.0",
        description: "Enterprise AI assistant with business-focused tools",
        author: "Cocapn",
        keywords: ["business", "enterprise", "analytics", "reports"],
        downloads: 0,
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        license: "MIT",
      },
    };

    return builtin[name] || null;
  }

  /**
   * Download a built-in template
   */
  private downloadBuiltin(name: string): DownloadResult {
    const meta = this.getBuiltinTemplate(name);
    if (!meta) {
      throw new Error(`Built-in template not found: ${name}`);
    }

    return {
      name,
      version: meta.version,
      content: Buffer.from(""), // Built-in templates don't need tarball
      targetPath: join(this.localTemplatesPath, name),
    };
  }

  /**
   * Create built-in template structure
   */
  private createBuiltinTemplate(name: string, targetPath: string): void {
    // Create minimal cocapn-template.json
    const meta = this.getBuiltinTemplate(name);
    if (!meta) {
      throw new Error(`Built-in template not found: ${name}`);
    }

    const manifest: TemplatePackageManifest = {
      name: meta.name,
      version: meta.version,
      description: meta.description,
      keywords: meta.keywords,
      author: meta.author,
      license: meta.license,
    };

    writeFileSync(join(targetPath, "cocapn-template.json"), JSON.stringify(manifest, null, 2));

    // Create skills directory
    const skillsDir = join(targetPath, "skills");
    mkdirSync(skillsDir, { recursive: true });

    // Create modules directory
    const modulesDir = join(targetPath, "modules");
    mkdirSync(modulesDir, { recursive: true });

    // Create personality.md
    const personalityContent = this.getPersonalityForTemplate(name);
    writeFileSync(join(targetPath, "personality.md"), personalityContent);

    // Create routes.json
    const routesContent = this.getRoutesForTemplate(name);
    writeFileSync(join(targetPath, "routes.json"), JSON.stringify(routesContent, null, 2));

    // Create README.md
    const readmeContent = this.getReadmeForTemplate(name, meta);
    writeFileSync(join(targetPath, "README.md"), readmeContent);
  }

  // ---------------------------------------------------------------------------
  // Local Registry (Offline Mode)
  // ---------------------------------------------------------------------------

  /**
   * Search local registry
   */
  private searchLocal(query: string): SearchResult {
    const index = this.loadLocalIndex();
    const templates: PublishedTemplate[] = [];

    const lowerQuery = query.toLowerCase();

    for (const [_name, entry] of Object.entries(index.templates)) {
      const manifestPath = join(entry.path, "cocapn-template.json");
      if (!existsSync(manifestPath)) {
        continue;
      }

      try {
        const manifest = JSON.parse(
          readFileSync(manifestPath, "utf8")
        ) as TemplatePackageManifest;

        // Search in name, description, keywords
        const matches =
          manifest.name.toLowerCase().includes(lowerQuery) ||
          manifest.description.toLowerCase().includes(lowerQuery) ||
          manifest.keywords?.some((k) => k.toLowerCase().includes(lowerQuery));

        if (matches) {
          templates.push({
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            author: manifest.author,
            keywords: manifest.keywords || [],
            downloads: 0,
            createdAt: entry.indexedAt,
            updatedAt: entry.indexedAt,
            homepage: manifest.homepage,
            repository: manifest.repository,
            license: manifest.license,
          });
        }
      } catch (err) {
        console.warn(`[registry] Failed to search local template: ${err}`);
      }
    }

    return {
      templates,
      total: templates.length,
      query,
    };
  }

  /**
   * Get local template metadata
   */
  private getLocalTemplate(name: string): PublishedTemplate | null {
    const index = this.loadLocalIndex();
    const entry = index.templates[name];

    if (!entry) {
      return null;
    }

    const manifestPath = join(entry.path, "cocapn-template.json");
    if (!existsSync(manifestPath)) {
      return null;
    }

    try {
      const manifest = JSON.parse(
        readFileSync(manifestPath, "utf8")
      ) as TemplatePackageManifest;

      return {
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        author: manifest.author,
        keywords: manifest.keywords || [],
        downloads: 0,
        createdAt: entry.indexedAt,
        updatedAt: entry.indexedAt,
        homepage: manifest.homepage,
        repository: manifest.repository,
        license: manifest.license,
      };
    } catch {
      return null;
    }
  }

  /**
   * Download local template
   */
  private downloadLocal(name: string, version?: string): DownloadResult {
    const index = this.loadLocalIndex();
    const entry = index.templates[name];

    if (!entry) {
      throw new Error(`Template not found in local registry: ${name}`);
    }

    if (!existsSync(entry.path)) {
      throw new Error(`Local template path not found: ${entry.path}`);
    }

    return {
      name,
      version: version || entry.version,
      content: Buffer.from(""), // Local templates don't need tarball
      targetPath: entry.path,
    };
  }

  /**
   * Load local registry index
   */
  private loadLocalIndex(): LocalRegistryIndex {
    if (!existsSync(this.localIndexPath)) {
      return {
        templates: {},
        lastUpdated: new Date().toISOString(),
      };
    }

    try {
      const content = readFileSync(this.localIndexPath, "utf8");
      return JSON.parse(content) as LocalRegistryIndex;
    } catch {
      return {
        templates: {},
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  /**
   * Save local registry index
   */
  private saveLocalIndex(index: LocalRegistryIndex): void {
    index.lastUpdated = new Date().toISOString();
    writeFileSync(this.localIndexPath, JSON.stringify(index, null, 2));
  }

  /**
   * Update local registry index
   */
  private updateLocalIndex(name: string, version: string, path: string): void {
    const index = this.loadLocalIndex();

    index.templates[name] = {
      name,
      version,
      path,
      indexedAt: new Date().toISOString(),
    };

    this.saveLocalIndex(index);
  }

  /**
   * Ensure local registry directories exist
   */
  private ensureLocalRegistry(): void {
    if (!existsSync(this.localPath)) {
      mkdirSync(this.localPath, { recursive: true });
    }
    if (!existsSync(this.localTemplatesPath)) {
      mkdirSync(this.localTemplatesPath, { recursive: true });
    }
  }

  // ---------------------------------------------------------------------------
  // Utility Functions
  // ---------------------------------------------------------------------------

  /**
   * Validate template manifest
   */
  private validateManifest(manifest: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!manifest || typeof manifest !== "object") {
      return { valid: false, errors: ["Manifest must be an object"] };
    }

    const m = manifest as Record<string, unknown>;

    if (typeof m.name !== "string" || !/^[a-z][a-z0-9-]*$/.test(m.name)) {
      errors.push('name must be a kebab-case string starting with a letter');
    }

    if (typeof m.version !== "string" || !/^\d+\.\d+\.\d+$/.test(m.version)) {
      errors.push('version must be a semver string (e.g., "1.0.0")');
    }

    if (typeof m.description !== "string") {
      errors.push('description must be a string');
    }

    if (typeof m.author !== "string") {
      errors.push('author must be a string');
    }

    if (m.keywords !== undefined && !Array.isArray(m.keywords)) {
      errors.push('keywords must be an array if provided');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Copy a directory recursively
   */
  private copyDirectory(source: string, target: string): void {
    mkdirSync(target, { recursive: true });

    const entries = readdirSync(source, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = join(source, entry.name);
      const tgtPath = join(target, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectory(srcPath, tgtPath);
      } else {
        cpSync(srcPath, tgtPath);
      }
    }
  }

  /**
   * Get personality.md content for a built-in template
   */
  private getPersonalityForTemplate(name: string): string {
    const personalities: Record<string, string> = {
      bare: `# Bare Cocapn Agent

You are a minimal Cocapn agent. Keep responses brief and helpful.
`,
      "cloud-worker": `# Cloud Worker Agent

You are a Cocapn agent optimized for Cloudflare Workers deployment.
Focus on serverless patterns and edge computing.
`,
      "web-app": `# Web App Agent

You are a Cocapn agent for web application development.
Focus on frontend best practices and user experience.
`,
      dmlog: `# AI Dungeon Master

You are an AI Dungeon Master for tabletop RPG campaigns.

## Style
- Descriptive and atmospheric
- Fair rules adjudication
- Player agency focused
- Epic narrative moments

## Campaign Setting
- Fantasy world with rich lore
- Balanced encounters
- Meaningful player choices
`,
      studylog: `# Learning Companion

You are an AI tutor and learning companion.

## Teaching Style
- Patient and encouraging
- Socratic method when appropriate
- Clear explanations
- Real-world examples
- Adaptive difficulty

## Learning Philosophy
- Active recall over passive review
- Spaced repetition integration
- Concept mapping
- Practice problems
`,
      makerlog: `# Developer Companion

You are a companion for developers and makers.

## Focus
- Build logs and progress tracking
- Technical discussions
- Project planning
- Code review
- Metrics and analytics
`,
      businesslog: `# Business Assistant

You are an enterprise-focused AI assistant.

## Capabilities
- Business analytics
- Report generation
- Data insights
- Professional communication
- Process optimization
`,
    };

    return personalities[name] || personalities.bare;
  }

  /**
   * Get routes.json content for a built-in template
   */
  private getRoutesForTemplate(_name: string): Record<string, unknown> {
    return {
      version: "1.0",
      routes: [],
    };
  }

  /**
   * Get README.md content for a built-in template
   */
  private getReadmeForTemplate(name: string, meta: PublishedTemplate): string {
    return `# ${name.charAt(0).toUpperCase() + name.slice(1)} Template

${meta.description}

## Author
${meta.author}

## License
${meta.license || "MIT"}

## Keywords
${meta.keywords.join(", ")}

## Installation

\`\`\`bash
cocapn template install ${name}
\`\`\`

## Usage

\`\`\`bash
cocapn template create my-app --from ${name}
\`\`\`
`;
  }
}
