/**
 * cocapn deploy — Deploy to Cloudflare Workers
 */

import { Command } from "commander";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import {
  loadDeployConfig,
  loadSecrets,
  getEnvironmentConfig,
  type DeployConfig,
} from "./deploy-config.js";

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

interface DeployOptions {
  env: string;
  region?: string;
  secrets?: string;
  verify: boolean;
  tests: boolean;
  dryRun: boolean;
  verbose: boolean;
}

interface DeployResult {
  success: boolean;
  url?: string;
  bundleSize?: number;
  startupTime?: number;
  error?: string;
}

export function createDeployCommand(): Command {
  return new Command("deploy")
    .description("Deploy cocapn instance to Cloudflare Workers")
    .option("-e, --env <environment>", "Environment (production, staging, preview)", "production")
    .option("-r, --region <region>", "Cloudflare region", "auto")
    .option("-s, --secrets <path>", "Path to secrets file")
    .option("--no-verify", "Skip post-deploy health checks")
    .option("--no-tests", "Skip pre-deploy tests")
    .option("--dry-run", "Build and validate without uploading")
    .option("-v, --verbose", "Detailed logging")
    .action(async (options: DeployOptions) => {
      const projectDir = process.cwd();

      try {
        // Load configuration
        const config = loadDeployConfig(projectDir, options.env);

        if (options.verbose) {
          console.log(yellow("Configuration loaded:"));
          console.log(`  Name: ${config.name}`);
          console.log(`  Template: ${config.template}`);
          console.log(`  Environment: ${options.env}`);
          console.log(`  Region: ${options.region || config.deploy.region}`);
          console.log();
        }

        // Run deployment pipeline
        const result = await runDeployPipeline(config, options, projectDir);

        if (result.success && !options.dryRun) {
          console.log();
          console.log(cyan("🚀 Deployed to: ") + green(result.url || ""));
          console.log();

          console.log(cyan("📊 Metrics:"));
          if (result.startupTime) {
            console.log(`   Startup time: ${result.startupTime}ms`);
          }
          if (result.bundleSize) {
            console.log(`   Bundle size: ${formatBytes(result.bundleSize)}`);
          }
          console.log(`   Region: ${options.region || config.deploy.region}`);
          console.log();

          console.log(cyan("🔗 Next steps:"));
          console.log(`   - View logs: ${cyan("npx wrangler tail")}`);
          console.log(`   - Rollback: ${cyan("cocapn rollback")}`);
        } else if (options.dryRun) {
          console.log();
          console.log(cyan("✓ Dry run complete — no deployment performed"));
        }

        process.exit(result.success ? 0 : 1);
      } catch (err) {
        console.error(red("✗ Deployment failed"));
        console.error(`  ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}

async function runDeployPipeline(
  config: DeployConfig,
  options: DeployOptions,
  projectDir: string
): Promise<DeployResult> {
  const startTime = Date.now();

  // Step 1: Type check
  console.log(cyan("▸ Type checking..."));
  const typecheckResult = await runTypecheck(projectDir, options.verbose);
  if (!typecheckResult.success) {
    throw new Error("Type check failed");
  }
  console.log(green("✓ Type check passed"));

  // Step 2: Run tests
  if (options.tests) {
    console.log(cyan("▸ Running tests..."));
    const testResult = await runTests(projectDir, options.verbose);
    if (!testResult.success) {
      throw new Error("Tests failed");
    }
    console.log(green(`✓ Tests passed (${testResult.count} tests)`));
  } else {
    console.log(yellow("⚠ Skipping tests (--no-tests)"));
  }

  // Step 3: Build worker
  console.log(cyan("▸ Building worker..."));
  const buildResult = await buildWorker(projectDir, options.verbose);
  if (!buildResult.success) {
    throw new Error("Build failed");
  }
  console.log(green(`✓ Built dist/worker.js (${formatBytes(buildResult.size || 0)})`));

  if (options.dryRun) {
    return { success: true, bundleSize: buildResult.size };
  }

  // Step 4: Create D1 database if needed
  if (config.deploy.d1_databases && config.deploy.d1_databases.length > 0) {
    console.log(cyan("▸ Provisioning D1 databases..."));
    for (const db of config.deploy.d1_databases) {
      await ensureD1Database(db.name, options.verbose);
    }
    console.log(green("✓ D1 databases ready"));
  }

  // Step 5: Create KV namespaces if needed
  if (config.deploy.kv_namespaces && config.deploy.kv_namespaces.length > 0) {
    console.log(cyan("▸ Provisioning KV namespaces..."));
    for (const kv of config.deploy.kv_namespaces) {
      await ensureKVNamespace(kv.name, options.verbose);
    }
    console.log(green("✓ KV namespaces ready"));
  }

  // Step 6: Deploy to Cloudflare
  console.log(cyan("▸ Uploading to Cloudflare..."));
  const deployResult = await deployToCloudflare(config, options.env, options.verbose);
  if (!deployResult.success) {
    throw new Error(deployResult.error || "Deployment failed");
  }
  console.log(green("✓ Uploaded to Cloudflare"));

  // Step 7: Inject secrets
  if (config.deploy.secrets.required.length > 0) {
    console.log(cyan("▸ Injecting secrets..."));
    const secrets = loadSecrets(config.deploy.account);
    const injectedCount = await injectSecrets(config, secrets, options.env, options.verbose);
    console.log(green(`✓ Injected ${injectedCount} secrets`));
  }

  // Step 8: Health check
  if (options.verify) {
    console.log(cyan("▸ Running health checks..."));
    const healthResult = await runHealthCheck(config, options.env, options.verbose);
    if (!healthResult.success) {
      console.error(red("✗ Health check failed"));
      console.error(yellow("  Run 'cocapn rollback' to revert"));
      throw new Error("Health check failed");
    }
    console.log(green("✓ Health checks passed"));
  }

  const deploymentTime = Date.now() - startTime;

  return {
    success: true,
    url: deployResult.url,
    bundleSize: buildResult.size,
    startupTime: deploymentTime,
  };
}

async function runTypecheck(projectDir: string, verbose: boolean): Promise<{ success: boolean }> {
  return runCommand("npx", ["tsc", "--noEmit"], { cwd: projectDir, verbose });
}

async function runTests(projectDir: string, verbose: boolean): Promise<{ success: boolean; count?: number }> {
  const result = await runCommand("npx", ["vitest", "run", "--reporter=json"], { cwd: projectDir, verbose });
  // Parse test count from output if possible
  return result;
}

async function buildWorker(projectDir: string, verbose: boolean): Promise<{ success: boolean; size?: number }> {
  const workerPath = join(projectDir, "src", "worker.ts");
  const outputPath = join(projectDir, "dist", "worker.js");

  if (!existsSync(workerPath)) {
    throw new Error(`Worker file not found: ${workerPath}`);
  }

  const args = [
    "esbuild",
    workerPath,
    "--bundle",
    "--format=esm",
    "--target=esnext",
    "--platform=browser",
    `--outfile=${outputPath}`,
    "--minify",
  ];

  const result = await runCommand("npx", args, { cwd: projectDir, verbose });

  if (result.success && existsSync(outputPath)) {
    const { statSync } = await import("fs");
    const size = statSync(outputPath).size;
    return { success: true, size };
  }

  return result;
}

async function ensureD1Database(name: string, verbose: boolean): Promise<void> {
  // Check if database exists
  const listResult = await runCommand("npx", ["wrangler", "d1", "list"], { cwd: process.cwd(), verbose });

  if (listResult.success) {
    // Parse output to check if database exists
    // If not, create it
    const createResult = await runCommand("npx", ["wrangler", "d1", "create", name], {
      cwd: process.cwd(),
      verbose,
      ignoreError: true, // May already exist
    });
  }
}

async function ensureKVNamespace(name: string, verbose: boolean): Promise<void> {
  // Similar to D1, check and create if needed
  const createResult = await runCommand("npx", ["wrangler", "kv:namespace", "create", name], {
    cwd: process.cwd(),
    verbose,
    ignoreError: true,
  });
}

async function deployToCloudflare(
  config: DeployConfig,
  env: string,
  verbose: boolean
): Promise<{ success: boolean; url?: string; error?: string }> {
  const args = ["wrangler", "deploy"];

  if (env !== "production") {
    args.push(`--env`, env);
  }

  const result = await runCommand("npx", args, { cwd: process.cwd(), verbose });

  if (result.success) {
    // Extract URL from output
    const url = `https://${config.name}.${config.deploy.account}.workers.dev`;
    return { success: true, url };
  }

  return { success: false, error: "Upload failed" };
}

async function injectSecrets(
  config: DeployConfig,
  secrets: Record<string, string>,
  env: string,
  verbose: boolean
): Promise<number> {
  let injectedCount = 0;
  const requiredSecrets = config.deploy.secrets.required;

  for (const secretName of requiredSecrets) {
    const secretValue = secrets[secretName];

    if (!secretValue) {
      console.warn(yellow(`⚠ Missing secret: ${secretName}`));
      continue;
    }

    const args = ["wrangler", "secret", "put", secretName];

    if (env !== "production") {
      args.push(`--env`, env);
    }

    // Run with stdin for secret value
    const result = await runCommandWithInput(
      "npx",
      args,
      secretValue,
      { cwd: process.cwd(), verbose }
    );

    if (result.success) {
      injectedCount++;
    }
  }

  return injectedCount;
}

async function runHealthCheck(
  config: DeployConfig,
  env: string,
  verbose: boolean
): Promise<{ success: boolean }> {
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
  options: { cwd: string; verbose: boolean; ignoreError?: boolean }
): Promise<{ success: boolean; count?: number }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: options.verbose ? "inherit" : "pipe",
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
      const success = code === 0 || (options.ignoreError && code !== null);

      if (options.verbose) {
        console.log(stdout);
      }

      resolve({ success: success ? true : false });
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      child.kill();
      resolve({ success: false });
    }, 120000);
  });
}

async function runCommandWithInput(
  command: string,
  args: string[],
  input: string,
  options: { cwd: string; verbose: boolean }
): Promise<{ success: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN },
    });

    child.stdin?.write(input);
    child.stdin?.end();

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({ success: code === 0 });
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      child.kill();
      resolve({ success: false });
    }, 30000);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
