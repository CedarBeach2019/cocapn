/**
 * cocapn init — Initialize cocapn in a repo (detect stack, self-assemble)
 */

import { Command } from "commander";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";

// Colors for terminal output
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

export function createInitCommand(): Command {
  return new Command("init")
    .description("Initialize cocapn in a repo (detect stack, self-assemble)")
    .argument("[dir]", "Directory to initialize", process.cwd())
    .option("-f, --force", "Force initialization even if cocapn already exists")
    .action(async (dir: string, options: { force?: boolean }) => {
      const targetDir = resolve(dir);

      console.log(cyan("🤖 Cocapn Initialization"));
      console.log(`${colors.gray}Target: ${targetDir}${colors.reset}\n`);

      // Check if directory exists
      if (!existsSync(targetDir)) {
        console.error(yellow(`✗ Directory does not exist: ${targetDir}`));
        console.log(`Create it first: mkdir -p ${targetDir}`);
        process.exit(1);
      }

      // Check if already initialized
      const cocapnDir = join(targetDir, "cocapn");
      if (existsSync(cocapnDir) && !options.force) {
        console.error(yellow("✗ Cocapn already initialized in this directory"));
        console.log(`Use --force to reinitialize`);
        process.exit(1);
      }

      try {
        // Detect project type
        const projectType = detectProjectType(targetDir);
        console.log(green("✓") + ` Detected project type: ${bold(projectType)}`);

        // Create cocapn directory structure
        createCocapnStructure(targetDir, projectType);
        console.log(green("✓") + " Created cocapn directory structure");

        // Create basic config
        createConfig(targetDir, projectType);
        console.log(green("✓") + " Created cocapn configuration");

        // Create soul.md
        createSoul(targetDir);
        console.log(green("✓") + " Created soul.md (agent personality)");

        console.log(`\n${bold(green("Initialization complete!"))}\n`);
        console.log(`Next steps:`);
        console.log(`  1. Edit ${cyan("cocapn/soul.md")} to customize your agent's personality`);
        console.log(`  2. Run ${cyan("cocapn start")} to start the bridge`);
        console.log(`  3. Open the UI to interact with your agent\n`);

      } catch (err) {
        console.error(yellow("✗ Initialization failed:"), err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}

function detectProjectType(dir: string): string {
  const packageJsonPath = join(dir, "package.json");
  const pyprojectPath = join(dir, "pyproject.toml");
  const cargoPath = join(dir, "Cargo.toml");
  const goPath = join(dir, "go.mod");

  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.react || deps.next || deps.vite) return "react";
      if (deps.vue || deps.nuxt) return "vue";
      if (deps.svelte || deps.sveltekit) return "svelte";
      if (deps.express || deps.fastify) return "node-server";
      return "node";
    } catch {
      return "unknown";
    }
  }

  if (existsSync(pyprojectPath)) return "python";
  if (existsSync(cargoPath)) return "rust";
  if (existsSync(goPath)) return "go";

  return "generic";
}

function createCocapnStructure(dir: string, projectType: string): void {
  const { mkdirSync } = require("fs");
  const cocapnDir = join(dir, "cocapn");

  // Create main directories
  const dirs = [
    "memory",
    "wiki",
    "tasks",
    "skills",
    "modules",
  ];

  for (const d of dirs) {
    mkdirSync(join(cocapnDir, d), { recursive: true });
  }
}

function createConfig(dir: string, projectType: string): void {
  const config = {
    name: "cocapn-agent",
    version: "1.0.0",
    description: "Cocapn agent instance",
    projectType,
    bridge: {
      port: 3100,
      host: "localhost",
    },
    agents: {
      default: "assistant",
    },
    modules: [],
    skills: [],
  };

  writeFileSync(
    join(dir, "cocapn", "config.yml"),
    `# Cocapn Configuration
name: cocapn-agent
version: 1.0.0
description: Cocapn agent instance

# Bridge settings
bridge:
  port: 3100
  host: localhost

# Default agent
agents:
  default: assistant

# Modules (empty by default)
modules: []

# Skills (empty by default)
skills: []
`,
    "utf8"
  );
}

function createSoul(dir: string): void {
  writeFileSync(
    join(dir, "cocapn", "soul.md"),
    `# Agent Soul

You are a helpful AI agent with access to a Git-based memory system.

## Personality

You are friendly, capable, and eager to help. You remember previous conversations
and learn from each interaction.

## Capabilities

- Read and write to a persistent memory store
- Track tasks and projects
- Use installed modules to extend your capabilities
- Communicate via WebSocket

## Guidelines

- Be concise but thorough
- Ask clarifying questions when needed
- Remember important context for future conversations
- Use tools and modules when they can help
`,
    "utf8"
  );
}
