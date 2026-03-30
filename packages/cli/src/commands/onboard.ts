/**
 * cocapn onboard — Full onboarding wizard (terminal + web)
 *
 * Starts a web-based onboarding wizard at localhost:3100/onboard,
 * or runs a terminal-based wizard if --no-web is specified.
 */

import { Command } from "commander";
import { createInterface } from "readline";
import {
  runTerminalWizard,
  checkPrerequisites,
  type DeploymentTarget,
} from "../../../create-cocapn/src/onboarding-wizard.js";
import { startWebWizard } from "../../../create-cocapn/src/web-wizard.js";
import { runInstaller } from "../../../create-cocapn/src/installer.js";

// ANSI colors (no external deps)
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

const bold = (s: string) => `${c.bold}${s}${c.reset}`;
const green = (s: string) => `${c.green}${s}${c.reset}`;
const cyan = (s: string) => `${c.cyan}${s}${c.reset}`;
const yellow = (s: string) => `${c.yellow}${s}${c.reset}`;

export function createOnboardCommand(): Command {
  return new Command("onboard")
    .description("Full onboarding wizard — creates repos, configures deployment, starts agent")
    .option("--no-web", "Run terminal wizard instead of web UI")
    .option("--port <port>", "Web wizard port", "3100")
    .option("--name <name>", "Agent name (skip prompt)")
    .option("--deployment <type>", "Deployment target: local, cloudflare, github-actions, docker, vps")
    .option("--template <template>", "Template: bare, dmlog, makerlog, studylog")
    .option("--skip-start", "Don't start the bridge after setup")
    .option("--skip-open", "Don't open browser after setup")
    .action(async (options: {
      web: boolean;
      port: string;
      name?: string;
      deployment?: string;
      template?: string;
      skipStart?: boolean;
      skipOpen?: boolean;
    }) => {
      // Check prerequisites first
      const prereqs = checkPrerequisites();
      if (!prereqs.nodeOk) {
        console.error(`${c.red}Node.js 18+ required. Current: ${prereqs.nodeVersion || "not installed"}${c.reset}`);
        process.exit(1);
      }
      if (!prereqs.gitOk) {
        console.error(`${c.red}Git is required. Install it first.${c.reset}`);
        process.exit(1);
      }

      console.log(`\n${bold("Cocapn Onboarding")} — Node ${green(prereqs.nodeVersion)} | ${green(prereqs.gitVersion)}\n`);

      if (options.web) {
        // Web wizard mode
        const port = parseInt(options.port, 10) || 3100;
        console.log(`Starting web wizard at ${cyan(`http://localhost:${port}/onboard`)}...`);
        console.log(`Press Ctrl+C to stop.\n`);

        const server = startWebWizard({ port });

        // Graceful shutdown
        const shutdown = () => {
          console.log("\nShutting down...");
          server.close();
          process.exit(0);
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
      } else {
        // Terminal wizard mode
        const rl = createInterface({ input: process.stdin, output: process.stdout });

        const promptFn = (q: string): Promise<string> =>
          new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));

        const chooseFn = async (q: string, opts: string[]): Promise<string> => {
          opts.forEach((o, i) => console.log(`  [${i + 1}] ${o}`));
          console.log();
          const raw = await promptFn(q);
          const idx = parseInt(raw, 10) - 1;
          if (idx >= 0 && idx < opts.length) return opts[idx] ?? opts[0];
          return opts[0];
        };

        try {
          await runTerminalWizard(promptFn, chooseFn);
        } finally {
          rl.close();
        }
      }
    });
}
