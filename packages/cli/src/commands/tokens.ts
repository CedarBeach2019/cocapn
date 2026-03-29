/**
 * cocapn tokens — Token usage statistics
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

export function createTokensCommand(): Command {
  return new Command("tokens")
    .description("Show token usage statistics")
    .option("-H, --host <host>", "Bridge host", "localhost")
    .option("-p, --port <port>", "Bridge port", "3100")
    .option("-t, --token <token>", "Auth token")
    .action(async (options) => {
      const port = parseInt(options.port, 10);

      try {
        const client = await createBridgeClient(options.host, port, options.token);

        try {
          const stats = await client.getTokenStats();

          console.log(cyan("📊 Token Usage Statistics\n"));

          printStat("Total Tokens", formatNumber(stats.totalTokens));
          printStat("Prompt Tokens", formatNumber(stats.promptTokens));
          printStat("Completion Tokens", formatNumber(stats.completionTokens));
          printStat("Requests", formatNumber(stats.requests));

          if (stats.avgTokensPerRequest) {
            printStat("Avg per Request", formatNumber(stats.avgTokensPerRequest));
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
  const labelWidth = 20;
  console.log(`${colors.gray}${label.padEnd(labelWidth)}${colors.reset} ${value}`);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n);
}

function handleError(err: unknown, host: string, port: string): void {
  console.error(`✗ Error:`, err instanceof Error ? err.message : String(err));
  console.error();
  console.error(`Make sure the bridge is running on ${cyan(`ws://${host}:${port}`)}`);
  console.error(`Start it: ${cyan("cocapn start")}`);
  process.exit(1);
}
