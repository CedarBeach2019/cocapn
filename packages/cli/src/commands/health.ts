/**
 * cocapn health — Health check (local + cloud)
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
const red = (s: string) => `${colors.red}${s}${colors.reset}`;

export function createHealthCommand(): Command {
  return new Command("health")
    .description("Health check (local + cloud)")
    .option("-H, --host <host>", "Bridge host", "localhost")
    .option("-p, --port <port>", "Bridge port", "3100")
    .option("-t, --token <token>", "Auth token")
    .action(async (options) => {
      const port = parseInt(options.port, 10);

      try {
        const client = await createBridgeClient(options.host, port, options.token);

        try {
          const health = await client.getHealth();

          console.log(cyan("🏥 Cocapn Health Check\n"));

          // Overall status
          let statusEmoji: string;
          let statusColor: (s: string) => string;

          switch (health.status) {
            case "healthy":
              statusEmoji = "✓";
              statusColor = green;
              break;
            case "degraded":
              statusEmoji = "⚠";
              statusColor = yellow;
              break;
            case "unhealthy":
              statusEmoji = "✗";
              statusColor = red;
              break;
            default:
              statusEmoji = "?";
              statusColor = yellow;
          }

          console.log(`${bold("Status:")} ${statusColor(statusEmoji + " " + health.status.toUpperCase())}`);
          console.log();

          // Individual checks
          if (health.checks) {
            const checkNames: Array<keyof typeof health.checks> = [
              "git",
              "brain",
              "disk",
              "websocket",
            ];

            for (const name of checkNames) {
              const check = health.checks[name];
              if (check) {
                printCheck(name, check.status, check.message);
              }
            }
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

function printCheck(name: string, status: string, message?: string): void {
  const labelWidth = 12;
  const label = name.charAt(0).toUpperCase() + name.slice(1);

  let statusIcon: string;
  let statusColor: (s: string) => string;

  const statusLower = status.toLowerCase();
  if (statusLower === "ok" || statusLower === "healthy" || statusLower === "passed") {
    statusIcon = "✓";
    statusColor = green;
  } else if (statusLower === "warn" || statusLower === "degraded") {
    statusIcon = "⚠";
    statusColor = yellow;
  } else {
    statusIcon = "✗";
    statusColor = red; // Use red for errors or failures
  }

  console.log(
    `${colors.gray}${label.padEnd(labelWidth)}${colors.reset} ${statusColor(statusIcon)} ${status}`
  );

  if (message) {
    console.log(`             ${colors.gray}${message}${colors.reset}`);
  }
}
