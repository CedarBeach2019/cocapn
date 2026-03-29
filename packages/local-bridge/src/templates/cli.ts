/**
 * Template CLI Commands
 *
 * Command-line interface for managing Cocapn templates:
 * - Search templates
 * - Install templates
 * - Publish templates
 * - List installed templates
 * - Show template info
 * - Create new instance from template
 */

import { Command } from "commander";
import { resolve } from "path";
import { TemplateRegistryClient, BUILTIN_TEMPLATES } from "./registry-client.js";
import type { RegistryConfig } from "./registry-client-types.js";

// Color output helpers
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  gray: "\x1b[90m",
};

const format = {
  bold: (s: string) => `${colors.bold}${s}${colors.reset}`,
  green: (s: string) => `${colors.green}${s}${colors.reset}`,
  cyan: (s: string) => `${colors.cyan}${s}${colors.reset}`,
  yellow: (s: string) => `${colors.yellow}${s}${colors.reset}`,
  dim: (s: string) => `${colors.dim}${s}${colors.reset}`,
  gray: (s: string) => `${colors.gray}${s}${colors.reset}`,
};

/**
 * Create registry client from environment or defaults
 */
function createClient(): TemplateRegistryClient {
  const config: RegistryConfig = {};

  if (process.env.COCAPN_REGISTRY_URL) {
    config.apiUrl = process.env.COCAPN_REGISTRY_URL;
  }
  if (process.env.COCAPN_REGISTRY_TOKEN) {
    config.authToken = process.env.COCAPN_REGISTRY_TOKEN;
  }
  if (process.env.COCAPN_REGISTRY_PATH) {
    config.localPath = process.env.COCAPN_REGISTRY_PATH;
  }

  return new TemplateRegistryClient(config);
}

/**
 * Format template for display
 */
function formatTemplate(template: {
  name: string;
  version: string;
  description: string;
  author: string;
  downloads?: number;
  keywords?: string[];
}): string {
  const parts = [
    format.green(template.name),
    format.dim(template.version),
    format.gray(template.description),
  ];

  if (template.author) {
    parts.push(format.dim(`by ${template.author}`));
  }

  return parts.join(" ");
}

/**
 * Search for templates
 */
async function cmdSearch(query: string, options: { limit?: number; json?: boolean }): Promise<void> {
  const client = createClient();

  if (!query) {
    console.error("Error: Search query is required");
    process.exit(1);
  }

  const result = await client.search(query, options.limit || 20);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nSearch results for "${format.bold(query)}" (${result.total} found):\n`);

  if (result.templates.length === 0) {
    console.log("  No matching templates found.\n");
    return;
  }

  for (const template of result.templates) {
    console.log(`  ${formatTemplate(template)}`);

    if (template.keywords && template.keywords.length > 0) {
      console.log(`    ${format.dim(`keywords: ${template.keywords.join(", ")}`)}`);
    }
    console.log();
  }
}

/**
 * List installed templates
 */
async function cmdList(options: { json?: boolean }): Promise<void> {
  const client = createClient();
  const installed = client.listInstalled();

  if (options.json) {
    console.log(JSON.stringify(installed, null, 2));
    return;
  }

  console.log("\nInstalled templates:\n");

  if (installed.length === 0) {
    console.log("  No templates installed.\n");
    console.log(`  Install a template:`);
    console.log(`    ${format.cyan("cocapn template install <name>")}\n`);
    return;
  }

  for (const template of installed) {
    console.log(`  ${format.green(template.name)} ${format.dim(template.version)}`);
    console.log(`    ${format.dim(`Path: ${template.path}`)}`);
    console.log(`    ${format.dim(`Installed: ${template.installedAt}`)}`);
    console.log();
  }
}

/**
 * Show template details
 */
async function cmdInfo(name: string, options: { json?: boolean }): Promise<void> {
  const client = createClient();

  if (!name) {
    console.error("Error: Template name is required");
    process.exit(1);
  }

  const template = await client.get(name);

  if (!template) {
    console.error(`Error: Template not found: ${name}`);
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(template, null, 2));
    return;
  }

  console.log(`\n${format.bold(template.name)} ${format.dim(template.version)}\n`);
  console.log(`  ${format.gray(template.description)}\n`);

  if (template.author) {
    console.log(`  ${format.dim("Author:")} ${template.author}`);
  }

  if (template.keywords && template.keywords.length > 0) {
    console.log(`  ${format.dim("Keywords:")} ${template.keywords.join(", ")}`);
  }

  if (template.downloads !== undefined) {
    console.log(`  ${format.dim("Downloads:")} ${template.downloads}`);
  }

  if (template.license) {
    console.log(`  ${format.dim("License:")} ${template.license}`);
  }

  if (template.homepage) {
    console.log(`  ${format.dim("Homepage:")} ${format.cyan(template.homepage)}`);
  }

  if (template.repository) {
    console.log(`  ${format.dim("Repository:")} ${format.cyan(template.repository)}`);
  }

  console.log(`  ${format.dim("Created:")} ${template.createdAt}`);
  console.log(`  ${format.dim("Updated:")} ${template.updatedAt}\n`);
}

/**
 * Install a template
 */
async function cmdInstall(name: string, options: { version?: string; json?: boolean }): Promise<void> {
  const client = createClient();

  if (!name) {
    console.error("Error: Template name is required");
    process.exit(1);
  }

  console.log(`\nInstalling template ${format.green(name)}...`);

  try {
    const path = await client.install(name, options.version);

    if (options.json) {
      console.log(JSON.stringify({ name, version: options.version || "latest", path }, null, 2));
      return;
    }

    console.log(`  ${format.green("✓")} Installed to ${format.dim(path)}\n`);
  } catch (err) {
    console.error(`  ${format.yellow("✗")} Failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

/**
 * Uninstall a template
 */
async function cmdUninstall(name: string, options: { json?: boolean }): Promise<void> {
  const client = createClient();

  if (!name) {
    console.error("Error: Template name is required");
    process.exit(1);
  }

  console.log(`\nUninstalling template ${format.green(name)}...`);

  try {
    client.uninstall(name);

    if (options.json) {
      console.log(JSON.stringify({ name, uninstalled: true }, null, 2));
      return;
    }

    console.log(`  ${format.green("✓")} Uninstalled\n`);
  } catch (err) {
    console.error(`  ${format.yellow("✗")} Failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

/**
 * Publish a template
 */
async function cmdPublish(dir: string, options: { json?: boolean }): Promise<void> {
  const client = createClient();
  const templateDir = resolve(dir || process.cwd());

  console.log(`\nPublishing template from ${format.dim(templateDir)}...`);

  const result = await client.publish(templateDir);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.ok) {
    console.log(`  ${format.green("✓")} Published successfully!`);
    if (result.url) {
      console.log(`  ${format.dim("URL:")} ${format.cyan(result.url)}`);
    }
    console.log();
  } else {
    console.error(`  ${format.yellow("✗")} Failed: ${result.error}\n`);
    process.exit(1);
  }
}

/**
 * Create new instance from template
 */
async function cmdCreate(name: string, options: { from?: string; dir?: string; json?: boolean }): Promise<void> {
  const client = createClient();

  if (!name) {
    console.error("Error: Project name is required");
    process.exit(1);
  }

  const templateName = options.from || "bare";

  console.log(`\nCreating ${format.green(name)} from template ${format.cyan(templateName)}...`);

  try {
    // First ensure template is installed
    await client.install(templateName);

    if (options.json) {
      console.log(JSON.stringify({ name, template: templateName }, null, 2));
      return;
    }

    console.log(`  ${format.green("✓")} Project created\n`);
    console.log(`Next steps:`);
    console.log(`  cd ${name}`);
    console.log(`  npm install\n`);
  } catch (err) {
    console.error(`  ${format.yellow("✗")} Failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

/**
 * List built-in templates
 */
async function cmdBuiltin(options: { json?: boolean }): Promise<void> {
  if (options.json) {
    console.log(JSON.stringify(BUILTIN_TEMPLATES, null, 2));
    return;
  }

  console.log("\nBuilt-in templates (no download required):\n");

  const client = createClient();

  for (const name of BUILTIN_TEMPLATES) {
    const template = await client.get(name);
    if (template) {
      console.log(`  ${formatTemplate(template)}`);
    }
  }

  console.log();
}

/**
 * Create template CLI program
 */
export function createTemplateCLI(): Command {
  const program = new Command("template");

  program
    .description("Manage Cocapn templates (search, install, publish, create)");

  program
    .command("search <query>")
    .description("Search for templates in the registry")
    .option("-l, --limit <number>", "Maximum number of results", "20")
    .option("--json", "Output as JSON")
    .action(cmdSearch);

  program
    .command("list")
    .description("List installed templates")
    .option("--json", "Output as JSON")
    .action(cmdList);

  program
    .command("info <name>")
    .description("Show template details")
    .option("--json", "Output as JSON")
    .action(cmdInfo);

  program
    .command("install <name>")
    .description("Install a template from the registry")
    .option("-v, --version <version>", "Specific version to install")
    .option("--json", "Output as JSON")
    .action(cmdInstall);

  program
    .command("uninstall <name>")
    .description("Uninstall a template")
    .option("--json", "Output as JSON")
    .action(cmdUninstall);

  program
    .command("publish [dir]")
    .description("Publish a template to the registry (default: current directory)")
    .option("--json", "Output as JSON")
    .action(cmdPublish);

  program
    .command("create <name>")
    .description("Create a new project from a template")
    .option("-f, --from <template>", "Template to use", "bare")
    .option("-d, --dir <directory>", "Target directory")
    .option("--json", "Output as JSON")
    .action(cmdCreate);

  program
    .command("builtin")
    .description("List built-in templates")
    .option("--json", "Output as JSON")
    .action(cmdBuiltin);

  return program;
}
