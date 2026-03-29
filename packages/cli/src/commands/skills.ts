/**
 * cocapn skill — Skill management commands
 */

import { Command } from "commander";
import { createBridgeClient } from "../ws-client.js";

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
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

export function createSkillsCommand(): Command {
  const cmd = new Command("skill")
    .description("Manage skills");

  cmd
    .command("list")
    .description("List available skills")
    .option("-H, --host <host>", "Bridge host", "localhost")
    .option("-p, --port <port>", "Bridge port", "3100")
    .option("-t, --token <token>", "Auth token")
    .action(async (options) => {
      const port = parseInt(options.port, 10);

      try {
        const client = await createBridgeClient(options.host, port, options.token);

        try {
          const skills = await client.listSkills();

          if (skills.length === 0) {
            console.log(yellow("No skills available"));
            return;
          }

          console.log(cyan("📚 Available Skills\n"));

          const nameWidth = Math.max(...skills.map((s) => s.name.length));
          const statusWidth = 8;

          for (const skill of skills) {
            const name = skill.name.padEnd(nameWidth);
            const status = skill.loaded ? green("● Loaded") : yellow("○ Available");
            const version = skill.version ? `v${skill.version}` : "";

            console.log(`  ${name}  ${status.padEnd(statusWidth)}  ${version}`);

            if (skill.description) {
              console.log(`    ${colors.gray}${skill.description}${colors.reset}`);
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
    .command("load <name>")
    .description("Load a skill")
    .option("-H, --host <host>", "Bridge host", "localhost")
    .option("-p, --port <port>", "Bridge port", "3100")
    .option("-t, --token <token>", "Auth token")
    .action(async (name: string, options) => {
      const port = parseInt(options.port, 10);

      try {
        const client = await createBridgeClient(options.host, port, options.token);

        try {
          await client.loadSkill(name);
          console.log(green(`✓ Skill loaded: ${name}`));
        } finally {
          client.disconnect();
        }
      } catch (err) {
        handleError(err, options.host, options.port);
      }
    });

  cmd
    .command("unload <name>")
    .description("Unload a skill")
    .option("-H, --host <host>", "Bridge host", "localhost")
    .option("-p, --port <port>", "Bridge port", "3100")
    .option("-t, --token <token>", "Auth token")
    .action(async (name: string, options) => {
      const port = parseInt(options.port, 10);

      try {
        const client = await createBridgeClient(options.host, port, options.token);

        try {
          await client.unloadSkill(name);
          console.log(green(`✓ Skill unloaded: ${name}`));
        } finally {
          client.disconnect();
        }
      } catch (err) {
        handleError(err, options.host, options.port);
      }
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
