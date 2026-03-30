/**
 * cocapn tree — Tree search command
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
const gray = (s: string) => `${colors.gray}${s}${colors.reset}`;

export function createTreeCommand(): Command {
  return new Command("tree")
    .description("Start tree search for a task")
    .argument("<task>", "Task description")
    .option("-H, --host <host>", "Bridge host", "localhost")
    .option("-p, --port <port>", "Bridge port", "3100")
    .option("-t, --token <token>", "Auth token")
    .option("-w, --watch", "Watch search progress")
    .action(async (task: string, options) => {
      const port = parseInt(options.port, 10);

      try {
        const client = await createBridgeClient(options.host, port, options.token);

        try {
          console.log(cyan("🌳 Starting tree search"));
          console.log(`  Task: ${bold(task)}\n`);

          const searchId = await client.startTreeSearch(task);
          console.log(green(`✓ Search started: ${searchId}`));

          if (options.watch) {
            console.log(gray("\nWatching progress... (Ctrl+C to stop)\n"));

            // Poll for status
            const interval = setInterval(async () => {
              try {
                const status = await client.getTreeSearchStatus(searchId);
                console.log(JSON.stringify(status, null, 2));
              } catch (err) {
                console.error(yellow("✗ Status check failed:"), err);
                clearInterval(interval);
              }
            }, 2000);

            process.on("SIGINT", () => {
              clearInterval(interval);
              console.log(gray("\n→ Stopped watching"));
              process.exit(0);
            });
          } else {
            console.log(`\nCheck status with: ${cyan(`cocapn tree-status ${searchId}`)}`);
          }

        } finally {
          if (!options.watch) {
            client.disconnect();
          }
        }
      } catch (err) {
        handleError(err, options.host, options.port);
      }
    });
}

function handleError(err: unknown, host: string, port: string): void {
  console.error(yellow("✗ Error:"), err instanceof Error ? err.message : String(err));
  console.error();
  console.error(`Make sure the bridge is running on ${cyan(`ws://${host}:${port}`)}`);
  console.error(`Start it: ${cyan("cocapn start")}`);
  process.exit(1);
}
