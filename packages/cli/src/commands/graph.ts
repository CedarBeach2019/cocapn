/**
 * cocapn graph — Knowledge graph statistics
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
const cyan = (s: string) => `${colors.cyan}${s}${colors.reset}`;

export function createGraphCommand(): Command {
  return new Command("graph")
    .description("Show knowledge graph statistics")
    .option("-H, --host <host>", "Bridge host", "localhost")
    .option("-p, --port <port>", "Bridge port", "3100")
    .option("-t, --token <token>", "Auth token")
    .action(async (options) => {
      const port = parseInt(options.port, 10);

      try {
        const client = await createBridgeClient(options.host, port, options.token);

        try {
          const stats = await client.getGraphStats();

          console.log(cyan("🕸️  Knowledge Graph Statistics\n"));

          printStat("Nodes", String(stats.nodes));
          printStat("Edges", String(stats.edges));

          if (stats.languages) {
            console.log();
            console.log(`${colors.gray}Languages:${colors.reset}`);
            for (const [lang, count] of Object.entries(stats.languages)) {
              console.log(`  ${lang.padEnd(15)} ${count}`);
            }
          }

          if (stats.lastUpdated) {
            console.log();
            printStat("Last Updated", new Date(stats.lastUpdated).toLocaleString());
          }

          console.log();

        } finally {
          client.disconnect();
        }
      } catch (err) {
        handleError(err, options.host, options.port);
      }
    });
}

function printStat(label: string, value: string): void {
  const labelWidth = 15;
  console.log(`${colors.gray}${label.padEnd(labelWidth)}${colors.reset} ${value}`);
}

function handleError(err: unknown, host: string, port: string): void {
  console.error(`✗ Error:`, err instanceof Error ? err.message : String(err));
  console.error();
  console.error(`Make sure the bridge is running on ${cyan(`ws://${host}:${port}`)}`);
  console.error(`Start it: ${cyan("cocapn start")}`);
  process.exit(1);
}
