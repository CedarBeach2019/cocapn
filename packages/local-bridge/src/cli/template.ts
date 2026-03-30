/**
 * `cocapn template` sub-commands.
 *
 * Usage (via cocapn-bridge binary):
 *   cocapn-bridge template list           [--repo <path>]
 *   cocapn-bridge template info <name>    [--repo <path>]
 *   cocapn-bridge template install <name> [--fork <id>] [--repo <path>]
 *   cocapn-bridge template create         [--repo <path>]
 */

import { Command } from "commander";
import { resolve } from "path";
import { TemplateRegistry } from "../templates/registry.js";
import type { TemplateManifest } from "../config/template-types.js";

export function buildTemplateCommand(): Command {
  const cmd = new Command("template").description("Manage Cocapn templates");

  // ── list ──────────────────────────────────────────────────────────────────

  cmd
    .command("list")
    .description("List available templates")
    .option("--repo <path>", "Private repo root", process.cwd())
    .action(async (opts: { repo: string }) => {
      const registry = new TemplateRegistry();
      const templates = registry.listTemplates();

      if (templates.length === 0) {
        console.log("No templates available.");
        return;
      }

      console.log("\nAvailable templates:\n");

      // Calculate column widths
      const emojiWidth = 4;
      const nameWidth = Math.max(...templates.map((t) => t.name.length));
      const domainWidth = Math.max(...templates.map((t) => t.domains.join(", ").length));

      for (const tmpl of templates) {
        const emoji = tmpl.emoji.padEnd(emojiWidth);
        const name = tmpl.name.padEnd(nameWidth);
        const domains = tmpl.domains.join(", ").padEnd(domainWidth);
        console.log(`  ${emoji}  ${name}  ${domains}  ${tmpl.description}`);
      }
      console.log();
    });

  // ── info ───────────────────────────────────────────────────────────────────

  cmd
    .command("info <name>")
    .description("Show full template details")
    .option("--repo <path>", "Private repo root", process.cwd())
    .action(async (name: string, opts: { repo: string }) => {
      const registry = new TemplateRegistry();
      const template = await registry.getTemplate(name);

      if (!template) {
        console.error(`Template not found: ${name}`);
        console.log(`\nAvailable templates:`);
        const templates = registry.listTemplates();
        for (const t of templates) {
          console.log(`  - ${t.name}`);
        }
        process.exit(1);
      }

      console.log(`\n${template.emoji}  ${template.displayName}`);
      console.log(`  Version: ${template.version}`);
      console.log(`  Author: ${template.author}`);
      if (template.repository) {
        console.log(`  Repository: ${template.repository}`);
      }
      console.log(`\n  ${template.description}`);
      console.log(`\n  Domains: ${template.domains.join(", ")}`);

      if (template.features && template.features.length > 0) {
        console.log(`\n  Features:`);
        for (const feature of template.features) {
          console.log(`    - ${feature}`);
        }
      }

      if (template.modules && template.modules.length > 0) {
        console.log(`\n  Modules:`);
        for (const mod of template.modules) {
          console.log(`    - ${mod}`);
        }
      }

      if (template.personality) {
        console.log(`\n  Personality:`);
        if (template.personality.file) {
          console.log(`    File: ${template.personality.file}`);
        }
        if (template.personality.systemPrompt) {
          console.log(`    System Prompt: ${template.personality.systemPrompt.slice(0, 80)}...`);
        }
      }

      if (template.config) {
        console.log(`\n  Config:`);
        if (template.config.cloud?.workerUrl) {
          console.log(`    Cloud Worker: ${template.config.cloud.workerUrl}`);
        }
        if (template.config.theme) {
          console.log(`    Theme: ${template.config.theme.mode || "default"} ${template.config.theme.accent || ""}`);
        }
      }

      if (template.forks && template.forks.length > 0) {
        console.log(`\n  Forks:`);
        for (const fork of template.forks) {
          console.log(`    - ${fork.id}: ${fork.label}`);
          console.log(`      ${fork.description}`);
        }
      }

      console.log();
    });

  // ── install ───────────────────────────────────────────────────────────────

  cmd
    .command("install <name>")
    .description("Install a template")
    .option("--fork <id>", "Select a fork for multi-path templates")
    .option("--repo <path>", "Target directory", process.cwd())
    .action(async (name: string, opts: { fork?: string; repo: string }) => {
      const registry = new TemplateRegistry();

      try {
        await registry.installTemplate(name, {
          fork: opts.fork,
          targetDir: resolve(opts.repo),
        });
        console.log(`\n✓ Template installed: ${name}`);
      } catch (err) {
        console.error("Error:", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── create ───────────────────────────────────────────────────────────────

  cmd
    .command("create")
    .description("Scaffold a new template from current config")
    .option("--name <name>", "Template name (required)")
    .option("--displayName <name>", "Display name")
    .option("--description <text>", "Description")
    .option("--domain <domain>", "Domain (can be specified multiple times)", collect, [])
    .option("--emoji <emoji>", "Emoji icon")
    .option("--author <author>", "Author")
    .option("--repository <url>", "GitHub repository URL")
    .option("--repo <path>", "Private repo root to read from", process.cwd())
    .option("--output <path>", "Output file path", "cocapn-template.json")
    .action(async (opts: {
      name?: string;
      displayName?: string;
      description?: string;
      domain: string[];
      emoji?: string;
      author?: string;
      repository?: string;
      repo: string;
      output: string;
    }) => {
      if (!opts.name) {
        console.error("--name is required");
        process.exit(1);
      }

      const registry = new TemplateRegistry();
      const template = registry.createTemplateFromConfig(opts.name, {
        displayName: opts.displayName,
        description: opts.description,
        domains: opts.domain.length > 0 ? opts.domain : undefined,
        emoji: opts.emoji,
        author: opts.author,
        repository: opts.repository,
      });

      // Validate the created template
      const validation = registry.validateTemplate(template);
      if (!validation.valid) {
        console.error("Template validation failed:");
        for (const error of validation.errors) {
          console.error(`  - ${error}`);
        }
        process.exit(1);
      }

      // Write to file
      const outputPath = resolve(opts.repo, opts.output);
      try {
        await import("fs").then(({ writeFileSync }) => {
          writeFileSync(outputPath, JSON.stringify(template, null, 2), "utf8");
        });
        console.log(`\n✓ Template created: ${outputPath}`);
        console.log(`  Name: ${template.displayName}`);
        console.log(`  Description: ${template.description}`);
      } catch (err) {
        console.error("Error writing template:", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  return cmd;
}

// Helper for collecting multiple values for an option
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}
