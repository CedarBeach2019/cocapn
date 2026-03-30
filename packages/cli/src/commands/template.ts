/**
 * cocapn template — Create and manage agent templates
 *
 * Usage:
 *   cocapn template list                — List available templates
 *   cocapn template apply <name>        — Apply template to current repo
 *   cocapn template create --from current — Create template from current config
 *   cocapn template info <name>         — Show template details
 */

import { Command } from "commander";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  statSync,
} from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "node:url";

// ─── ANSI colors ────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  dim: "\x1b[2m",
};

const bold = (s: string) => `${c.bold}${s}${c.reset}`;
const green = (s: string) => `${c.green}${s}${c.reset}`;
const cyan = (s: string) => `${c.cyan}${s}${c.reset}`;
const yellow = (s: string) => `${c.yellow}${s}${c.reset}`;
const red = (s: string) => `${c.red}${s}${c.reset}`;
const gray = (s: string) => `${c.gray}${s}${c.reset}`;
const dim = (s: string) => `${c.dim}${s}${c.reset}`;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TemplateInfo {
  name: string;
  type: "soul" | "deployment" | "vertical";
  description: string;
  path: string;
}

export interface TemplateDetails {
  name: string;
  type: "soul" | "deployment" | "vertical";
  description: string;
  soulMd?: string;
  config?: Record<string, any>;
  modules?: string[];
  plugins?: string[];
}

export interface ApplyResult {
  template: string;
  applied: string[];
  skipped: string[];
  created: string[];
}

export interface CreateResult {
  name: string;
  path: string;
  files: string[];
}

// ─── Template resolution ───────────────────────────────────────────────────

/**
 * Resolve the monorepo root by walking up from this file.
 */
function resolveMonorepoRoot(): string {
  // This file is at packages/cli/src/commands/template.ts
  const __filename = fileURLToPath(import.meta.url);
  // Walk up: commands -> src -> cli -> packages -> root
  return resolve(dirname(__filename), "..", "..", "..", "..");
}

/**
 * Resolve the templates package directory within the monorepo.
 */
export function resolveTemplatesDir(): string {
  return join(resolveMonorepoRoot(), "packages", "templates");
}

/**
 * Get the local custom templates directory inside a cocapn project.
 */
function resolveLocalTemplatesDir(repoRoot: string): string {
  return join(repoRoot, "cocapn", "templates", "local");
}

// ─── Soul templates ────────────────────────────────────────────────────────

const SOUL_DESCRIPTIONS: Record<string, string> = {
  "fishing-buddy": "Fishing companion — commercial & recreational fishing expertise",
  "fishingBuddy": "Fishing companion — commercial & recreational fishing expertise",
  "dungeon-master": "TTRPG game master — campaign management & storytelling",
  "dungeonMaster": "TTRPG game master — campaign management & storytelling",
  deckboss: "Fleet management — commercial fishing operations",
  "developer-assistant": "Developer assistant — coding & software engineering",
  "developerAssistant": "Developer assistant — coding & software engineering",
  "student-tutor": "Student tutor — learning & knowledge coaching",
  "studentTutor": "Student tutor — learning & knowledge coaching",
};

/**
 * List all soul templates from packages/templates/src/souls/.
 */
export function listSoulTemplates(): TemplateInfo[] {
  const soulsDir = join(resolveTemplatesDir(), "src", "souls");
  if (!existsSync(soulsDir)) return [];

  return readdirSync(soulsDir)
    .filter((f) => f.endsWith(".md") && f !== "index.ts")
    .map((f) => {
      const name = f.replace(/\.md$/, "");
      return {
        name,
        type: "soul" as const,
        description: SOUL_DESCRIPTIONS[name] || SOUL_DESCRIPTIONS[f.replace(/\.md$/, "")] || "Soul personality template",
        path: join(soulsDir, f),
      };
    });
}

/**
 * Get a soul template's content by name.
 */
export function getSoulTemplateContent(name: string): string | undefined {
  const soulsDir = join(resolveTemplatesDir(), "src", "souls");
  // Try exact match first
  let filePath = join(soulsDir, `${name}.md`);
  if (existsSync(filePath)) return readFileSync(filePath, "utf-8");

  // Try kebab-case
  const kebab = name.replace(/([A-Z])/g, "-$1").toLowerCase();
  filePath = join(soulsDir, `${kebab}.md`);
  if (existsSync(filePath)) return readFileSync(filePath, "utf-8");

  return undefined;
}

// ─── Deployment templates ──────────────────────────────────────────────────

/**
 * List all deployment templates from packages/templates/src/deployments/.
 */
export function listDeploymentTemplates(): TemplateInfo[] {
  const deploymentsDir = join(resolveTemplatesDir(), "src", "deployments");
  if (!existsSync(deploymentsDir)) return [];

  return readdirSync(deploymentsDir)
    .filter((f) => f.endsWith(".ts") && f !== "index.ts")
    .map((f) => {
      const name = f.replace(/\.ts$/, "");
      const desc = name
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return {
        name,
        type: "deployment" as const,
        description: `${desc} deployment — full config with soul, modules, and web theme`,
        path: join(deploymentsDir, f),
      };
    });
}

// ─── Vertical templates ────────────────────────────────────────────────────

const VERTICAL_DESCRIPTIONS: Record<string, string> = {
  bare: "Minimal starter — soul.md + config only",
  makerlog: "Makerlog — build in public, project tracking",
  dmlog: "DMlog.ai — TTRPG game console",
  fishinglog: "Fishinglog.ai — commercial & recreational fishing",
  deckboss: "Deckboss.ai — fleet management",
  businesslog: "Businesslog — business operations dashboard",
  cloudWorker: "Cloud Worker — Cloudflare Workers deployment",
  studylog: "Studylog — learning & knowledge management",
  webApp: "Web App — full-stack web application",
};

/**
 * List vertical templates from packages/templates/.
 */
export function listVerticalTemplates(): TemplateInfo[] {
  const templatesDir = resolveTemplatesDir();
  if (!existsSync(templatesDir)) return [];

  return readdirSync(templatesDir)
    .filter((f) => {
      const fullPath = join(templatesDir, f);
      return statSync(fullPath).isDirectory() && f !== "src" && f !== "tests";
    })
    .map((f) => ({
      name: f,
      type: "vertical" as const,
      description: VERTICAL_DESCRIPTIONS[f] || "Vertical template",
      path: join(templatesDir, f),
    }));
}

// ─── Local custom templates ───────────────────────────────────────────────

/**
 * List user-created templates from cocapn/templates/local/.
 */
export function listLocalTemplates(repoRoot: string): TemplateInfo[] {
  const localDir = resolveLocalTemplatesDir(repoRoot);
  if (!existsSync(localDir)) return [];

  return readdirSync(localDir)
    .filter((f) => {
      const fullPath = join(localDir, f);
      return statSync(fullPath).isDirectory();
    })
    .map((f) => ({
      name: f,
      type: "soul" as const,
      description: `Local template — ${f}`,
      path: join(localDir, f),
    }));
}

// ─── Combined list ─────────────────────────────────────────────────────────

/**
 * List all available templates (soul + deployment + vertical + local).
 */
export function listAllTemplates(repoRoot?: string): TemplateInfo[] {
  const templates = [
    ...listSoulTemplates(),
    ...listDeploymentTemplates(),
    ...listVerticalTemplates(),
  ];

  if (repoRoot) {
    templates.push(...listLocalTemplates(repoRoot));
  }

  return templates;
}

/**
 * Find a template by name across all categories.
 */
export function findTemplate(name: string, repoRoot?: string): TemplateInfo | undefined {
  const all = listAllTemplates(repoRoot);
  // Exact match first
  let found = all.find((t) => t.name === name);
  if (found) return found;

  // Case-insensitive
  found = all.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (found) return found;

  // Try kebab-case matching for camelCase input
  const kebab = name.replace(/([A-Z])/g, "-$1").toLowerCase();
  found = all.find((t) => t.name === kebab);
  if (found) return found;

  // Try camelCase for kebab-case input
  const camel = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  found = all.find((t) => t.name === camel);
  return found;
}

// ─── Template info ─────────────────────────────────────────────────────────

/**
 * Get detailed information about a template.
 */
export function getTemplateDetails(name: string, repoRoot?: string): TemplateDetails | undefined {
  const template = findTemplate(name, repoRoot);
  if (!template) return undefined;

  const details: TemplateDetails = {
    name: template.name,
    type: template.type,
    description: template.description,
  };

  // Soul content
  const soulContent = getSoulTemplateContent(template.name);
  if (soulContent) {
    details.soulMd = soulContent;
  }

  // For vertical templates, look for soul.md and config.yml
  if (template.type === "vertical") {
    const soulPath = join(template.path, "soul.md");
    if (existsSync(soulPath)) {
      details.soulMd = readFileSync(soulPath, "utf-8");
    }

    const configPath = join(template.path, "config.yml");
    if (existsSync(configPath)) {
      details.config = parseSimpleYaml(readFileSync(configPath, "utf-8"));
    }
  }

  // For local templates, look for soul.md and config.yml
  if (template.type === "soul" && template.path.includes("templates/local")) {
    const soulPath = join(template.path, "soul.md");
    if (existsSync(soulPath)) {
      details.soulMd = readFileSync(soulPath, "utf-8");
    }

    const configPath = join(template.path, "config.yml");
    if (existsSync(configPath)) {
      details.config = parseSimpleYaml(readFileSync(configPath, "utf-8"));
    }

    const modulesPath = join(template.path, "modules.json");
    if (existsSync(modulesPath)) {
      try {
        details.modules = JSON.parse(readFileSync(modulesPath, "utf-8"));
      } catch {
        // ignore parse errors
      }
    }
  }

  return details;
}

// ─── Apply template ────────────────────────────────────────────────────────

/**
 * Apply a template to the current repo's cocapn/ directory.
 */
export function applyTemplate(
  name: string,
  repoRoot: string,
  options: { force?: boolean; sourceRoot?: string } = {},
): ApplyResult {
  const template = findTemplate(name, options.sourceRoot ?? repoRoot);
  if (!template) {
    throw new Error(`Template not found: ${name}\nRun 'cocapn template list' to see available templates.`);
  }

  const cocapnDir = join(repoRoot, "cocapn");
  if (!existsSync(cocapnDir)) {
    throw new Error("No cocapn/ directory found. Run 'cocapn setup' first.");
  }

  const result: ApplyResult = {
    template: template.name,
    applied: [],
    skipped: [],
    created: [],
  };

  // Get soul content
  let soulContent: string | undefined;
  if (template.type === "soul" && !template.path.includes("templates/local")) {
    soulContent = getSoulTemplateContent(template.name);
  } else if (template.type === "vertical" || template.path.includes("templates/local")) {
    const soulPath = join(template.path, "soul.md");
    if (existsSync(soulPath)) {
      soulContent = readFileSync(soulPath, "utf-8");
    }
  }

  // Write soul.md
  if (soulContent) {
    const soulDest = join(cocapnDir, "soul.md");
    if (existsSync(soulDest) && !options.force) {
      result.skipped.push("soul.md (exists — use --force to overwrite)");
    } else {
      writeFileSync(soulDest, soulContent, "utf-8");
      result.applied.push("soul.md");
    }
  }

  // Copy config overrides for vertical/deployment templates
  if (template.type === "vertical" || template.type === "deployment") {
    const configPath = join(template.path, "config.yml");
    if (existsSync(configPath)) {
      const configDest = join(cocapnDir, "config.yml");
      if (existsSync(configDest) && !options.force) {
        result.skipped.push("config.yml (exists — use --force to overwrite)");
      } else {
        copyFileSync(configPath, configDest);
        result.applied.push("config.yml");
      }
    }
  }

  // Copy additional files from vertical templates
  if (template.type === "vertical") {
    const templateFiles = ["modules.json", "plugins.json", "env.json"];
    for (const file of templateFiles) {
      const srcPath = join(template.path, file);
      const destPath = join(cocapnDir, file);
      if (existsSync(srcPath)) {
        if (existsSync(destPath) && !options.force) {
          result.skipped.push(`${file} (exists — use --force to overwrite)`);
        } else {
          copyFileSync(srcPath, destPath);
          result.applied.push(file);
        }
      }
    }
  }

  // Copy local template files
  if (template.path.includes("templates/local")) {
    const localFiles = readdirSync(template.path);
    for (const file of localFiles) {
      if (file === "soul.md") continue; // already handled above
      const srcPath = join(template.path, file);
      if (statSync(srcPath).isFile()) {
        const destPath = join(cocapnDir, file);
        if (existsSync(destPath) && !options.force) {
          result.skipped.push(`${file} (exists — use --force to overwrite)`);
        } else {
          copyFileSync(srcPath, destPath);
          result.applied.push(file);
        }
      }
    }
  }

  return result;
}

// ─── Create template ───────────────────────────────────────────────────────

/**
 * Create a template from the current repo's configuration.
 */
export function createTemplateFromCurrent(
  repoRoot: string,
  name?: string,
): CreateResult {
  const cocapnDir = join(repoRoot, "cocapn");
  if (!existsSync(cocapnDir)) {
    throw new Error("No cocapn/ directory found. Run 'cocapn setup' first.");
  }

  const templateName = name || `custom-${Date.now()}`;
  const localDir = resolveLocalTemplatesDir(repoRoot);
  mkdirSync(localDir, { recursive: true });

  const templateDir = join(localDir, templateName);
  mkdirSync(templateDir, { recursive: true });

  const files: string[] = [];

  // Copy soul.md
  const soulSrc = join(cocapnDir, "soul.md");
  if (existsSync(soulSrc)) {
    copyFileSync(soulSrc, join(templateDir, "soul.md"));
    files.push("soul.md");
  }

  // Copy config.yml
  const configSrc = join(cocapnDir, "config.yml");
  if (existsSync(configSrc)) {
    copyFileSync(configSrc, join(templateDir, "config.yml"));
    files.push("config.yml");
  }

  // Copy modules list
  const modulesSrc = join(cocapnDir, "modules.json");
  if (existsSync(modulesSrc)) {
    copyFileSync(modulesSrc, join(templateDir, "modules.json"));
    files.push("modules.json");
  }

  // Copy plugins list
  const pluginsSrc = join(cocapnDir, "plugins.json");
  if (existsSync(pluginsSrc)) {
    copyFileSync(pluginsSrc, join(templateDir, "plugins.json"));
    files.push("plugins.json");
  }

  if (files.length === 0) {
    throw new Error("No template-able files found in cocapn/ directory.");
  }

  return {
    name: templateName,
    path: templateDir,
    files,
  };
}

// ─── YAML helper (minimal, no deps) ───────────────────────────────────────

/**
 * Minimal YAML parser — extracts top-level keys into a flat object.
 * Sufficient for displaying config overrides without requiring a YAML library.
 */
function parseSimpleYaml(content: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = content.split("\n");
  let currentKey = "";
  let currentIndent = -1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;

    // Top-level key
    if (indent === 0 && trimmed.endsWith(":")) {
      currentKey = trimmed.slice(0, -1);
      result[currentKey] = {};
      currentIndent = indent;
      continue;
    }

    // Nested key-value
    if (currentKey && indent > currentIndent) {
      const match = trimmed.match(/^(\w[\w-]*):\s*(.*)/);
      if (match) {
        let value: string | number | boolean = match[2].trim();
        if (value === "true") value = true;
        else if (value === "false") value = false;
        else if (!isNaN(Number(value)) && value !== "") value = Number(value);
        result[currentKey][match[1]] = value;
      }
    }
  }

  return result;
}

// ─── Display helpers ───────────────────────────────────────────────────────

function displayTemplateList(templates: TemplateInfo[]): void {
  const souls = templates.filter((t) => t.type === "soul");
  const deployments = templates.filter((t) => t.type === "deployment");
  const verticals = templates.filter((t) => t.type === "vertical");

  if (souls.length > 0) {
    console.log(bold("\n  Soul Templates (personality)\n"));
    const nameWidth = Math.max(...souls.map((t) => t.name.length));
    for (const t of souls) {
      console.log(`  ${cyan(t.name.padEnd(nameWidth))}  ${gray(t.description)}`);
    }
  }

  if (deployments.length > 0) {
    console.log(bold("\n  Deployment Templates (full config)\n"));
    const nameWidth = Math.max(...deployments.map((t) => t.name.length));
    for (const t of deployments) {
      console.log(`  ${cyan(t.name.padEnd(nameWidth))}  ${gray(t.description)}`);
    }
  }

  if (verticals.length > 0) {
    console.log(bold("\n  Vertical Templates\n"));
    const nameWidth = Math.max(...verticals.map((t) => t.name.length));
    for (const t of verticals) {
      console.log(`  ${cyan(t.name.padEnd(nameWidth))}  ${gray(t.description)}`);
    }
  }

  console.log();
}

function displayTemplateInfo(details: TemplateDetails): void {
  console.log(bold(`\n  ${details.name}\n`));
  console.log(`  ${gray("Type:")}        ${details.type}`);
  console.log(`  ${gray("Description:")} ${details.description}`);

  if (details.modules) {
    console.log(`  ${gray("Modules:")}     ${details.modules.join(", ")}`);
  }
  if (details.plugins) {
    console.log(`  ${gray("Plugins:")}     ${details.plugins.join(", ")}`);
  }

  if (details.config) {
    console.log(`\n  ${bold("Config overrides:")}`);
    for (const [key, value] of Object.entries(details.config)) {
      console.log(`    ${gray(key)}: ${JSON.stringify(value)}`);
    }
  }

  if (details.soulMd) {
    // Show first 20 lines of soul.md
    const lines = details.soulMd.split("\n").slice(0, 20);
    console.log(`\n  ${bold("soul.md (preview):")}`);
    for (const line of lines) {
      console.log(dim(`    ${line}`));
    }
    if (details.soulMd.split("\n").length > 20) {
      console.log(dim("    ..."));
    }
  }

  console.log();
}

function displayApplyResult(result: ApplyResult): void {
  console.log(bold(`\n  Applied: ${result.template}\n`));

  if (result.applied.length > 0) {
    console.log(`  ${green("Written:")}`);
    for (const f of result.applied) {
      console.log(`    ${green("+")} ${f}`);
    }
  }

  if (result.skipped.length > 0) {
    console.log(`\n  ${yellow("Skipped:")}`);
    for (const f of result.skipped) {
      console.log(`    ${yellow("~")} ${f}`);
    }
  }

  console.log();
}

// ─── Command ───────────────────────────────────────────────────────────────

export function createTemplateCommand(): Command {
  return new Command("template")
    .description("Create and manage agent templates")
    .addCommand(
      new Command("list")
        .description("List available templates")
        .option("--type <type>", "Filter by type: soul, deployment, vertical")
        .action(() => {
          const opts = this.opts();
          const repoRoot = process.cwd();
          let templates = listAllTemplates(repoRoot);

          if (opts.type) {
            const type = opts.type.toLowerCase();
            templates = templates.filter((t) => t.type === type);
          }

          if (templates.length === 0) {
            console.log(yellow("\n  No templates found.\n"));
            return;
          }

          displayTemplateList(templates);
        }),
    )
    .addCommand(
      new Command("apply")
        .description("Apply template to current repo")
        .argument("<name>", "Template name")
        .option("-f, --force", "Overwrite existing files")
        .action((name: string) => {
          const repoRoot = process.cwd();
          const opts = this.opts();

          try {
            const result = applyTemplate(name, repoRoot, { force: opts.force });
            displayApplyResult(result);
          } catch (err) {
            console.log(red(`\n  ${(err as Error).message}\n`));
            process.exit(1);
          }
        }),
    )
    .addCommand(
      new Command("create")
        .description("Create template from current config")
        .option("--from <source>", "Source: 'current' (default)", "current")
        .option("--name <name>", "Custom template name")
        .action(() => {
          const repoRoot = process.cwd();
          const opts = this.opts();

          try {
            const result = createTemplateFromCurrent(repoRoot, opts.name);
            console.log(bold("\n  Template created\n"));
            console.log(`  ${green("Name:")}   ${result.name}`);
            console.log(`  ${cyan("Path:")}   ${result.path}`);
            console.log(`  ${cyan("Files:")}  ${result.files.join(", ")}`);
            console.log();
          } catch (err) {
            console.log(red(`\n  ${(err as Error).message}\n`));
            process.exit(1);
          }
        }),
    )
    .addCommand(
      new Command("info")
        .description("Show template details")
        .argument("<name>", "Template name")
        .action((name: string) => {
          const repoRoot = process.cwd();
          const details = getTemplateDetails(name, repoRoot);

          if (!details) {
            console.log(red(`\n  Template not found: ${name}`));
            console.log(gray("  Run 'cocapn template list' to see available templates.\n"));
            process.exit(1);
          }

          displayTemplateInfo(details);
        }),
    );
}
