/**
 * cocapn rollback — Rollback Cloudflare Workers deployment
 */

import { Command } from "commander";
import { spawn } from "child_process";
import { loadDeployConfig } from "./deploy-config.js";

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

interface RollbackOptions {
  env: string;
  version?: string;
  confirm: boolean;
  verify: boolean;
  verbose: boolean;
}

interface Deployment {
  id: string;
  version?: string;
  created_at: string;
}

export function createRollbackCommand(): Command {
  return new Command("rollback")
    .description("Rollback Cloudflare Workers deployment")
    .argument("[version]", "Version to rollback to (defaults to previous)")
    .option("-e, --env <environment>", "Environment (production, staging, preview)", "production")
    .option("--confirm", "Skip confirmation prompt")
    .option("--no-verify", "Skip post-rollback health checks")
    .option("-v, --verbose", "Detailed logging")
    .action(async (version: string | undefined, options: RollbackOptions) => {
      const projectDir = process.cwd();

      try {
        // Load configuration
        const config = loadDeployConfig(projectDir, options.env);

        if (options.verbose) {
          console.log(yellow("Configuration loaded:"));
          console.log(`  Name: ${config.name}`);
          console.log(`  Environment: ${options.env}`);
          console.log();
        }

        // Get deployment history
        const deployments = await getDeploymentHistory(config, options.env, options.verbose);

        if (deployments.length === 0) {
          console.error(yellow("No previous deployments found"));
          process.exit(1);
        }

        // Determine target version
        const targetVersion = version || deployments[1]?.version;

        if (!targetVersion) {
          console.error(yellow("No previous version to rollback to"));
          process.exit(1);
        }

        // Confirm rollback
        if (!options.confirm) {
          console.log(yellow("⚠️  Rollback will replace current deployment"));
          console.log(`  Current: ${deployments[0].version || deployments[0].id}`);
          console.log(`  Target: ${targetVersion}`);
          console.log();
          console.log(yellow("Continue? (y/N)"));

          const confirmed = await waitForConfirmation();

          if (!confirmed) {
            console.log(yellow("Rollback cancelled"));
            process.exit(0);
          }
        }

        // Run rollback
        console.log(cyan(`▸ Rolling back to ${targetVersion}...`));
        const result = await runRollback(config, targetVersion, options.env, options.verbose);

        if (result.success) {
          console.log(green("✓ Rollback complete"));

          if (options.verify) {
            console.log(cyan("▸ Running health checks..."));
            const healthResult = await runHealthCheck(config, options.env, options.verbose);

            if (!healthResult.success) {
              console.error(red("✗ Health check failed after rollback"));
              console.error(yellow("  Deployment may be unstable"));
              process.exit(1);
            }

            console.log(green("✓ Health checks passed"));
          }

          console.log();
          console.log(cyan("Current version: ") + bold(targetVersion));
          console.log(cyan("URL: ") + green(`https://${config.name}.${config.deploy.account}.workers.dev`));
        } else {
          throw new Error(result.error || "Rollback failed");
        }

        process.exit(0);
      } catch (err) {
        console.error(red("✗ Rollback failed"));
        console.error(`  ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}

async function getDeploymentHistory(
  config: any,
  env: string,
  verbose: boolean
): Promise<Deployment[]> {
  const args = ["wrangler", "deployments", "list"];

  if (env !== "production") {
    args.push(`--env`, env);
  }

  const result = await runCommand("npx", args, { cwd: process.cwd(), verbose });

  if (!result.success || !result.output) {
    return [];
  }

  // Parse wrangler output to extract deployments
  // Output format: "Created at\tID\tTags"
  const lines = result.output.split("\n").filter(line => line.trim());
  const deployments: Deployment[] = [];

  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length >= 2) {
      deployments.push({
        id: parts[1],
        created_at: parts[0],
      });
    }
  }

  return deployments;
}

async function runRollback(
  config: any,
  version: string,
  env: string,
  verbose: boolean
): Promise<{ success: boolean; error?: string }> {
  // Wrangler doesn't have a direct rollback command
  // We need to redeploy the previous version
  // For now, we'll implement a basic rollback using deployments list

  const args = ["wrangler", "rollback"];

  if (env !== "production") {
    args.push(`--env`, env);
  }

  // Note: wrangler rollback may not be available in all versions
  // Alternative: download previous deployment and upload it
  const result = await runCommand("npx", args, { cwd: process.cwd(), verbose });

  if (result.success) {
    return { success: true };
  }

  return { success: false, error: "Rollback command failed" };
}

async function runHealthCheck(config: any, env: string, verbose: boolean): Promise<{ success: boolean }> {
  const url = `https://${config.name}.${config.deploy.account}.workers.dev/_health`;

  try {
    const response = await fetch(url);
    const data = await response.json() as { status?: string };

    return { success: data.status === "healthy" };
  } catch {
    return { success: false };
  }
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; verbose: boolean }
): Promise<{ success: boolean; output?: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN },
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({ success: code === 0, output: stdout });
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      child.kill();
      resolve({ success: false });
    }, 120000);
  });
}

async function waitForConfirmation(): Promise<boolean> {
  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const onData = (key: string) => {
      if (key.toLowerCase() === "y") {
        cleanup();
        resolve(true);
      } else if (key === "\x03" || key.toLowerCase() === "n") {
        // Ctrl+C or 'n'
        cleanup();
        resolve(false);
      }
    };

    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
    };

    process.stdin.on("data", onData);

    // Timeout after 30 seconds
    setTimeout(() => {
      cleanup();
      resolve(false);
    }, 30000);
  });
}
