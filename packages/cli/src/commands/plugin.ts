/**
 * cocapn plugin — Plugin management commands
 *
 * Usage:
 *   cocapn plugin list              — list installed plugins
 *   cocapn plugin list --json       — list as JSON
 *   cocapn plugin install <name>    — install a plugin
 *   cocapn plugin remove <name>     — remove a plugin
 *   cocapn plugin enable <name>     — enable a plugin
 *   cocapn plugin disable <name>    — disable a plugin
 */

import { Command } from "commander";
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as readline from "node:readline";
import {
  listPlugins,
  installPlugin,
  removePlugin,
  enablePlugin,
  disablePlugin,
  getPluginDir,
} from "../lib/plugin-installer.js";

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

const bold = (s: string) => `${colors.bold}${s}${colors.reset}`;
const green = (s: string) => `${colors.green}${s}${colors.reset}`;
const cyan = (s: string) => `${colors.cyan}${s}${colors.reset}`;
const yellow = (s: string) => `${colors.yellow}${s}${colors.reset}`;
const dim = (s: string) => `${colors.dim}${s}${colors.reset}`;
const red = (s: string) => `${colors.red}${s}${colors.reset}`;

function requireCocapnDir(): string {
  const cocapnDir = join(process.cwd(), "cocapn");
  if (!existsSync(cocapnDir)) {
    console.error(red("Error:"), " No cocapn/ directory found. Run cocapn setup first.");
    process.exit(1);
  }
  return process.cwd();
}

async function confirmPrompt(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${yellow("?")} ${question} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

export function createPluginCommand(): Command {
  const cmd = new Command("plugin")
    .description("Manage cocapn plugins");

  // ── list ──────────────────────────────────────────────────────────────────

  cmd
    .command("list")
    .description("List installed plugins")
    .option("--json", "Output as JSON")
    .action(async (options: { json?: boolean }) => {
      requireCocapnDir();

      try {
        const plugins = await listPlugins();

        if (options.json) {
          console.log(JSON.stringify(plugins, null, 2));
          return;
        }

        if (plugins.length === 0) {
          console.log(yellow("No plugins installed"));
          console.log(dim(`  Plugin dir: ${getPluginDir()}`));
          return;
        }

        console.log(cyan("Installed Plugins\n"));

        const nameWidth = Math.max(...plugins.map((p) => p.name.length));

        for (const plugin of plugins) {
          const name = plugin.name.padEnd(nameWidth);
          const status = plugin.enabled ? green("enabled ") : red("disabled");
          const version = dim(`v${plugin.version}`);

          console.log(`  ${bold(name)}  ${status}  ${version}`);
          if (plugin.description) {
            console.log(`    ${colors.gray}${plugin.description}${colors.reset}`);
          }
          console.log();
        }
      } catch (err) {
        console.error(yellow("List failed:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── install ───────────────────────────────────────────────────────────────

  cmd
    .command("install <name>")
    .description("Install a plugin")
    .action(async (name: string) => {
      requireCocapnDir();

      try {
        const plugin = await installPlugin(name);
        console.log(green("Installed") + ` ${bold(plugin.name)}` + ` ${dim(`v${plugin.version}`)}`);
        console.log(`  ${dim(plugin.description)}`);
        console.log(`  ${dim("Path:")} ${dim(plugin.path)}`);
      } catch (err) {
        console.error(yellow("Install failed:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── remove ────────────────────────────────────────────────────────────────

  cmd
    .command("remove <name>")
    .description("Remove a plugin")
    .action(async (name: string) => {
      requireCocapnDir();

      try {
        const confirmed = await confirmPrompt(`Remove plugin "${name}"?`);
        if (!confirmed) {
          console.log(dim("Cancelled"));
          return;
        }

        await removePlugin(name);
        console.log(green("Removed") + ` ${bold(name)}`);
      } catch (err) {
        console.error(yellow("Remove failed:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── enable ────────────────────────────────────────────────────────────────

  cmd
    .command("enable <name>")
    .description("Enable a plugin")
    .action(async (name: string) => {
      requireCocapnDir();

      try {
        await enablePlugin(name);
        console.log(green("Enabled") + ` ${bold(name)}`);
      } catch (err) {
        console.error(yellow("Enable failed:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── disable ───────────────────────────────────────────────────────────────

  cmd
    .command("disable <name>")
    .description("Disable a plugin")
    .action(async (name: string) => {
      requireCocapnDir();

      try {
        await disablePlugin(name);
        console.log(yellow("Disabled") + ` ${bold(name)}`);
      } catch (err) {
        console.error(yellow("Disable failed:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  return cmd;
}
