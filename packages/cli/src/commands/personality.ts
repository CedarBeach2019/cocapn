/**
 * cocapn personality — Agent personality management commands
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
  dim: "\x1b[2m",
};

const bold = (s: string) => `${colors.bold}${s}${colors.reset}`;
const green = (s: string) => `${colors.green}${s}${colors.reset}`;
const cyan = (s: string) => `${colors.cyan}${s}${colors.reset}`;
const yellow = (s: string) => `${colors.yellow}${s}${colors.reset}`;
const dim = (s: string) => `${colors.dim}${s}${colors.reset}`;

export function createPersonalityCommand(): Command {
  const cmd = new Command("personality")
    .description("Manage agent personality");

  cmd
    .command("list")
    .description("Show built-in personalities")
    .option("-H, --host <host>", "Bridge host", "localhost")
    .option("-p, --port <port>", "Bridge port", "3100")
    .option("-t, --token <token>", "Auth token")
    .action(async (options) => {
      const port = parseInt(options.port, 10);

      try {
        const client = await createBridgeClient(options.host, port, options.token);

        try {
          const result = (await client.sendRequest("personality/list")) as {
            builtIn: Array<{ name: string; tagline: string; voice: string; traits: string[] }>;
            current: string;
          };

          console.log(cyan("🎭 Built-in Personalities\n"));

          const nameWidth = Math.max(...result.builtIn.map((p) => p.name.length));

          for (const personality of result.builtIn) {
            const isCurrent = personality.name === result.current;
            const marker = isCurrent ? green("●") : dim("○");
            const name = isCurrent
              ? green(personality.name.padEnd(nameWidth))
              : personality.name.padEnd(nameWidth);

            console.log(`  ${marker}  ${name}  ${dim(personality.voice)}`);
            console.log(`      ${personality.tagline}`);
            console.log(`      ${dim("traits: " + personality.traits.join(", "))}`);
            console.log();
          }
        } finally {
          client.disconnect();
        }
      } catch (err) {
        handleError(err, options.host, options.port);
      }
    });

  cmd
    .command("set <name>")
    .description("Set personality from a built-in preset")
    .option("-H, --host <host>", "Bridge host", "localhost")
    .option("-p, --port <port>", "Bridge port", "3100")
    .option("-t, --token <token>", "Auth token")
    .action(async (name: string, options) => {
      const port = parseInt(options.port, 10);

      try {
        const client = await createBridgeClient(options.host, port, options.token);

        try {
          const result = (await client.sendRequest("personality/set", { name })) as {
            personality: { name: string; tagline: string };
          };
          console.log(green(`✓ Personality set: ${result.personality.name}`));
          console.log(`  ${result.personality.tagline}`);
        } finally {
          client.disconnect();
        }
      } catch (err) {
        handleError(err, options.host, options.port);
      }
    });

  cmd
    .command("show")
    .description("Show current personality")
    .option("-H, --host <host>", "Bridge host", "localhost")
    .option("-p, --port <port>", "Bridge port", "3100")
    .option("-t, --token <token>", "Auth token")
    .action(async (options) => {
      const port = parseInt(options.port, 10);

      try {
        const client = await createBridgeClient(options.host, port, options.token);

        try {
          const result = (await client.sendRequest("personality/get")) as {
            personality: {
              name: string;
              tagline: string;
              voice: string;
              traits: string[];
              rules: string[];
              systemPrompt: string;
            };
          };

          const p = result.personality;
          console.log(cyan(`🎭 ${bold(p.name)}`));
          console.log(`  ${p.tagline}`);
          console.log();
          console.log(`  ${bold("Voice:")}   ${p.voice}`);
          console.log(`  ${bold("Traits:")}  ${p.traits.join(", ")}`);
          console.log();

          if (p.rules.length > 0) {
            console.log(`  ${bold("Rules:")}`);
            for (const rule of p.rules) {
              console.log(`    - ${rule}`);
            }
            console.log();
          }

          console.log(`  ${bold("System Prompt:")}`);
          for (const line of p.systemPrompt.split("\n")) {
            console.log(`  ${dim(line)}`);
          }
        } finally {
          client.disconnect();
        }
      } catch (err) {
        handleError(err, options.host, options.port);
      }
    });

  cmd
    .command("edit")
    .description("Open soul.md in your editor for full personality customization")
    .option("-H, --host <host>", "Bridge host", "localhost")
    .option("-p, --port <port>", "Bridge port", "3100")
    .option("-t, --token <token>", "Auth token")
    .action(async (options) => {
      const port = parseInt(options.port, 10);

      try {
        const client = await createBridgeClient(options.host, port, options.token);

        try {
          const result = (await client.sendRequest("personality/edit")) as {
            soulPath: string;
          };

          console.log(`Edit your soul.md for full personality customization:`);
          console.log(`  ${cyan(result.soulPath)}`);
          console.log();
          console.log(`Changes will be reflected on the next message.`);
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
