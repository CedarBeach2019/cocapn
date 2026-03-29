/**
 * cocapn start — Start the cocapn bridge
 */

import { Command } from "commander";
import { spawn } from "child_process";
import { resolve } from "path";

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

export function createStartCommand(): Command {
  return new Command("start")
    .description("Start the cocapn bridge")
    .option("-p, --port <port>", "WebSocket port", "3100")
    .option("--repo <path>", "Path to cocapn repo", process.cwd())
    .option("--tunnel", "Start Cloudflare tunnel")
    .option("--no-auth", "Disable authentication (local only)")
    .action(async (options: {
      port: string;
      repo: string;
      tunnel?: boolean;
      auth: boolean;
    }) => {
      const repoPath = resolve(options.repo);
      const port = parseInt(options.port, 10);

      console.log(cyan("🚀 Starting Cocapn Bridge"));
      console.log(`${colors.gray}Repo: ${repoPath}${colors.reset}`);
      console.log(`${colors.gray}Port: ${port}${colors.reset}\n`);

      try {
        // Try to use local-bridge package
        const bridgePath = tryResolveBridge();

        if (bridgePath) {
          console.log(green("✓") + " Found cocapn-bridge package");
          await startBridge(bridgePath, repoPath, port, options);
        } else {
          console.log(yellow("⚠") + " cocapn-bridge not installed");
          console.log(`Install it: ${cyan("npm install -g cocapn-bridge")}`);
          console.log(`Or use locally: ${cyan("npm install cocapn-bridge")}`);
          process.exit(1);
        }
      } catch (err) {
        console.error(yellow("✗ Failed to start bridge:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

function tryResolveBridge(): string | null {
  // Try to resolve cocapn-bridge from node_modules
  const paths = [
    resolve(process.cwd(), "node_modules", "cocapn-bridge", "dist", "esm", "main.js"),
    resolve(process.cwd(), "packages", "local-bridge", "dist", "esm", "main.js"),
    resolve(__dirname, "../../local-bridge/dist/esm/main.js"),
  ];

  for (const path of paths) {
    try {
      const { existsSync } = require("fs");
      if (existsSync(path)) {
        return path;
      }
    } catch {
      // Continue
    }
  }

  return null;
}

async function startBridge(
  bridgePath: string,
  repoPath: string,
  port: number,
  options: { tunnel?: boolean; auth: boolean }
): Promise<void> {
  const args = ["--repo", repoPath, "--port", String(port)];

  if (!options.auth) {
    args.push("--no-auth");
  }

  console.log(green("→") + " Starting bridge process...\n");

  const child = spawn(process.execPath, [bridgePath, ...args], {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_OPTIONS: "--import=tsx",
    },
  });

  child.on("error", (err) => {
    console.error(yellow("✗ Failed to spawn bridge process:"), err.message);
    process.exit(1);
  });

  child.on("exit", (code) => {
    if (code !== 0) {
      console.error(yellow(`✗ Bridge exited with code ${code}`));
      process.exit(code);
    }
  });

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n" + yellow("→") + " Stopping bridge...");
    child.kill("SIGINT");
  });

  process.on("SIGTERM", () => {
    child.kill("SIGTERM");
  });

  // Keep process alive
  await new Promise(() => {}); // Never resolves
}
