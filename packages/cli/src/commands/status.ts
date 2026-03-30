/**
 * cocapn status — Show bridge status
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

export function createStatusCommand(): Command {
  return new Command("status")
    .description("Show bridge status")
    .option("-H, --host <host>", "Bridge host", "localhost")
    .option("-p, --port <port>", "Bridge port", "3100")
    .option("-t, --token <token>", "Auth token")
    .action(async (options: {
      host: string;
      port: string;
      token?: string;
    }) => {
      const port = parseInt(options.port, 10);

      try {
        const client = await createBridgeClient(options.host, port, options.token);

        try {
          const status = await client.getStatus();

          console.log(cyan("🤖 Cocapn Bridge Status"));
          console.log();

          printStatus("Running", status.running ? green("● Yes") : yellow("○ No"));

          if (status.uptime !== undefined) {
            const uptime = formatUptime(status.uptime);
            printStatus("Uptime", uptime);
          }

          if (status.port !== undefined) {
            printStatus("Port", String(status.port));
          }

          if (status.agents !== undefined) {
            printStatus("Agents", String(status.agents));
          }

          if (status.connections !== undefined) {
            printStatus("Connections", String(status.connections));
          }

          console.log();

        } finally {
          client.disconnect();
        }
      } catch (err) {
        console.error(yellow("✗ Cannot connect to bridge"));
        console.error(`  ${err instanceof Error ? err.message : String(err)}`);
        console.error();
        console.error(`Make sure the bridge is running:`);
        console.error(`  ${cyan("cocapn start")}`);
        process.exit(1);
      }
    });
}

function printStatus(label: string, value: string): void {
  const labelWidth = 15;
  const paddedLabel = label.padEnd(labelWidth);
  console.log(`${colors.gray}${paddedLabel}${colors.reset} ${value}`);
}

function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
}
