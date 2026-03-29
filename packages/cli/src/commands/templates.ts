/**
 * cocapn template — Template management commands
 */

import { Command } from "commander";
import { createBridgeClient } from "../ws-client.js";

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  gray: "\x1b[90m",
};

const bold = (s: string) => `${colors.bold}${s}${colors.reset}`;
const green = (s: string) => `${colors.green}${s}${colors.reset}`;
const cyan = (s: string) => `${colors.cyan}${s}${colors.reset}`;
const yellow = (s: string) => `${colors.yellow}${s}${colors.reset}`;

export function createTemplateCommand(): Command {
  const cmd = new Command("template")
    .description("Manage templates");

  cmd
    .command("search <query>")
    .description("Search template registry")
    .option("-H, --host <host>", "Bridge host", "localhost")
    .option("-p, --port <port>", "Bridge port", "3100")
    .option("-t, --token <token>", "Auth token")
    .action(async (query: string, options) => {
      const port = parseInt(options.port, 10);

      try {
        const client = await createBridgeClient(options.host, port, options.token);

        try {
          const templates = await client.searchTemplates(query);

          if (templates.length === 0) {
            console.log(yellow(`No templates found for: ${query}`));
            return;
          }

          console.log(cyan(`🔍 Templates matching "${query}"\n`));

          const emojiWidth = 4;
          const nameWidth = Math.max(...templates.map((t) => t.name.length));

          for (const tmpl of templates) {
            const emoji = (tmpl.emoji || "📦").padEnd(emojiWidth);
            const name = tmpl.name.padEnd(nameWidth);

            console.log(`  ${emoji}  ${bold(name)}  ${tmpl.description || ""}`);

            if (tmpl.domains && tmpl.domains.length > 0) {
              console.log(`      ${colors.gray}Domains: ${tmpl.domains.join(", ")}${colors.reset}`);
            }
          }

          console.log();

        } finally {
          client.disconnect();
        }
      } catch (err) {
        handleError(err, options.host, options.port);
      }
    });

  cmd
    .command("install <name>")
    .description("Install a template")
    .option("-f, --fork <id>", "Select a fork for multi-path templates")
    .option("-H, --host <host>", "Bridge host", "localhost")
    .option("-p, --port <port>", "Bridge port", "3100")
    .option("-t, --token <token>", "Auth token")
    .action(async (name: string, options) => {
      const port = parseInt(options.port, 10);

      try {
        const client = await createBridgeClient(options.host, port, options.token);

        try {
          await client.installTemplate(name, { fork: options.fork });
          console.log(green(`✓ Template installed: ${name}`));

          if (options.fork) {
            console.log(`  Fork: ${options.fork}`);
          }
        } finally {
          client.disconnect();
        }
      } catch (err) {
        handleError(err, options.host, options.port);
      }
    });

  cmd
    .command("publish")
    .description("Publish current directory as a template")
    .option("--name <name>", "Template name (required)")
    .option("--displayName <name>", "Display name")
    .option("--description <text>", "Description")
    .option("--domain <domain>", "Domain (can be specified multiple times)", collect, [])
    .option("--emoji <emoji>", "Emoji icon")
    .option("--author <author>", "Author")
    .option("--repository <url>", "GitHub repository URL")
    .action(async (options) => {
      if (!options.name) {
        console.error(yellow("✗ --name is required"));
        process.exit(1);
      }

      console.log(cyan("📤 Publishing template"));
      console.log(`  Name: ${bold(options.name)}`);

      // TODO: Implement publish logic
      console.log(yellow("\n⚠ Publish not yet implemented"));
      console.log(`  This will publish the current directory as a template`);
    });

  return cmd;
}

function handleError(err: unknown, host: string, port: string): void {
  console.error(yellow("✗ Error:"), err instanceof Error ? err.message : String(err));
  console.error();
  console.error(`Make sure the bridge is running on ${cyan(`ws://${host}:${port}`)}`);
  console.error(`Start it: ${cyan("cocapn start")}`);
  process.exit(1);
}

// Helper for collecting multiple values
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}
