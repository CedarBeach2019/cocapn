/**
 * cocapn plugin — Plugin management commands
 *
 * Usage:
 *   cocapn plugin search <query>   — search npm for cocapn-plugin-* packages
 *   cocapn plugin install <name>   — npm install + register with bridge
 *   cocapn plugin uninstall <name> — npm uninstall + unregister
 *   cocapn plugin list             — list installed plugins
 *   cocapn plugin info <name>      — show plugin details
 */

import { Command } from "commander";
import { searchPlugins, getPluginInfo } from "../lib/npm-search.js";
import {
  installPlugin,
  uninstallPlugin,
  listPlugins,
  getInstalledPlugin,
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

export function createPluginCommand(): Command {
  const cmd = new Command("plugin")
    .description("Manage cocapn plugins");

  // ── search ──────────────────────────────────────────────────────────────────

  cmd
    .command("search <query>")
    .description("Search npm for cocapn-plugin packages")
    .action(async (query: string) => {
      try {
        const results = await searchPlugins(query);

        if (results.length === 0) {
          console.log(yellow("No plugins found"));
          return;
        }

        console.log(cyan("Plugins matching") + ` ${bold(query)}\n`);

        const nameWidth = Math.max(...results.map((r) => r.name.length));

        for (const result of results) {
          const name = result.name.padEnd(nameWidth);
          const version = dim(`v${result.version}`);
          const author = result.author ? dim(result.author) : "";

          console.log(`  ${green(name)}  ${version}  ${author}`);
          if (result.description) {
            const desc = result.description.length > 70
              ? result.description.slice(0, 67) + "..."
              : result.description;
            console.log(`    ${colors.gray}${desc}${colors.reset}`);
          }
        }

        console.log();
      } catch (err) {
        console.error(yellow("Search failed:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── install ─────────────────────────────────────────────────────────────────

  cmd
    .command("install <name>")
    .description("Install a plugin from npm")
    .action(async (name: string) => {
      try {
        const plugin = await installPlugin(name);
        console.log(green(`Installed`) + ` ${bold(plugin.name)}` + ` ${dim(`v${plugin.version}`)}`);
        console.log(`  ${dim(plugin.description)}`);
        console.log(`  ${dim("Skills:")} ${plugin.skills.map((s) => cyan(s)).join(", ") || dim("none")}`);
        console.log(`  ${dim("Permissions:")} ${plugin.permissions.join(", ") || dim("none")}`);
        console.log();
        console.log(`  ${dim("Installed to")} ${dim(plugin.path)}`);
      } catch (err) {
        console.error(yellow("Install failed:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── uninstall ───────────────────────────────────────────────────────────────

  cmd
    .command("uninstall <name>")
    .description("Uninstall a plugin")
    .action(async (name: string) => {
      try {
        await uninstallPlugin(name);
        console.log(green(`Uninstalled`) + ` ${bold(name)}`);
      } catch (err) {
        console.error(yellow("Uninstall failed:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── list ────────────────────────────────────────────────────────────────────

  cmd
    .command("list")
    .description("List installed plugins")
    .action(async () => {
      try {
        const plugins = await listPlugins();

        if (plugins.length === 0) {
          console.log(yellow("No plugins installed"));
          console.log(dim(`  Plugin dir: ${getPluginDir()}`));
          return;
        }

        console.log(cyan("Installed Plugins\n"));

        const nameWidth = Math.max(...plugins.map((p) => p.name.length));

        for (const plugin of plugins) {
          const name = plugin.name.padEnd(nameWidth);
          const version = dim(`v${plugin.version}`);
          const author = plugin.author ? dim(plugin.author) : "";

          console.log(`  ${green(name)}  ${version}  ${author}`);
          if (plugin.description) {
            console.log(`    ${colors.gray}${plugin.description}${colors.reset}`);
          }
          if (plugin.skills.length > 0) {
            console.log(`    ${dim("Skills:")} ${plugin.skills.map((s) => cyan(s)).join(", ")}`);
          }
          console.log();
        }
      } catch (err) {
        console.error(yellow("List failed:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── info ────────────────────────────────────────────────────────────────────

  cmd
    .command("info <name>")
    .description("Show detailed info about a plugin")
    .option("--remote", "Fetch info from npm registry instead of local install")
    .action(async (name: string, options: { remote?: boolean }) => {
      try {
        if (options.remote) {
          const info = await getPluginInfo(name);
          console.log(bold(info.name) + ` ${dim(`v${info.version}`)}`);
          console.log();
          if (info.description) {
            console.log(`  ${info.description}`);
          }
          if (info.author) {
            console.log(`  ${dim("Author:")} ${info.author}`);
          }
          if (info.license) {
            console.log(`  ${dim("License:")} ${info.license}`);
          }
          if (info.repository) {
            console.log(`  ${dim("Repository:")} ${info.repository}`);
          }
          if (info.homepage) {
            console.log(`  ${dim("Homepage:")} ${info.homepage}`);
          }
          if (info.keywords && info.keywords.length > 0) {
            console.log(`  ${dim("Keywords:")} ${info.keywords.join(", ")}`);
          }
        } else {
          const plugin = await getInstalledPlugin(name);
          if (!plugin) {
            console.error(yellow(`Plugin not installed: ${name}`));
            console.log(dim(`  Use ${cyan("cocapn plugin info --remote <name>")} to check npm`));
            process.exit(1);
          }

          console.log(bold(plugin.name) + ` ${dim(`v${plugin.version}`)}`);
          console.log();
          if (plugin.description) {
            console.log(`  ${plugin.description}`);
          }
          if (plugin.author) {
            console.log(`  ${dim("Author:")} ${plugin.author}`);
          }
          if (plugin.skills.length > 0) {
            console.log(`  ${dim("Skills:")}`);
            for (const skill of plugin.skills) {
              console.log(`    ${green(skill)}`);
            }
          }
          if (plugin.permissions.length > 0) {
            console.log(`  ${dim("Permissions:")}`);
            for (const perm of plugin.permissions) {
              console.log(`    ${yellow(perm)}`);
            }
          }
          console.log();
          console.log(`  ${dim("Path:")} ${plugin.path}`);
        }
      } catch (err) {
        console.error(yellow("Info failed:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  return cmd;
}
