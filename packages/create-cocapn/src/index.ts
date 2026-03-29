#!/usr/bin/env node
/**
 * create-cocapn — Zero-friction scaffolder for Cocapn agent instances.
 *
 * Usage:
 *   npx create-cocapn my-app [options]
 *   npx create-cocapn my-makerlog --template dmlog
 *   npx create-cocapn my-studylog --template studylog
 */

import { program } from "commander";
import { resolve } from "path";
import { execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { writeTemplateFiles, type TemplateOptions as TemplateOptions } from "./templates.js";

// GitHub integration imports (for advanced usage)
import {
  validateToken,
  createGitHubRepos,
  enableGitHubPages,
  cloneRepos,
  scaffoldPrivateRepo,
  generateAgeKey,
  commitAll,
  pushRepo,
  printSuccess,
} from "./scaffold.js";
import { promptHidden, closePrompts } from "./prompts.js";

// ─── Template-based scaffolding (simple mode) ───────────────────────────────────

const TEMPLATES = ["bare", "cloud-worker", "web-app", "dmlog", "studylog"] as const;
type Template = (typeof TEMPLATES)[number];

/**
 * Main entry point for template-based Cocapn instance creation.
 * Creates a new directory with template files, initializes git, and installs dependencies.
 */
export async function createCocapn(
  targetDir: string,
  options?: Partial<TemplateOptions & { skipInstall?: boolean; skipGit?: boolean }>
): Promise<void> {
  const dir = resolve(targetDir);

  // Check if directory already exists and has content
  if (existsSync(dir)) {
    console.error(`Error: Directory "${dir}" already exists.`);
    console.error("Please choose a different location or remove the existing directory.");
    process.exit(1);
  }

  // Ask for template if not specified
  const template = options?.template || await askTemplate();

  // Validate template
  if (!(TEMPLATES as readonly string[]).includes(template)) {
    console.error(`Error: Unknown template "${template}". Valid choices: ${TEMPLATES.join(", ")}`);
    process.exit(1);
  }

  // 1. Create directory
  console.log(`Creating Cocapn instance at ${dir}...`);
  mkdirSync(dir, { recursive: true });

  // 2. Copy template files
  console.log(`Applying ${template} template...`);
  const templateOptions: TemplateOptions = {
    template,
    repoName: options?.repoName || 'my-cocapn'
  };
  if (options?.description) templateOptions.description = options.description;
  if (options?.author) templateOptions.author = options.author;

  writeTemplateFiles(dir, templateOptions);

  // 3. Initialize git (unless skipped)
  if (!options?.skipGit) {
    console.log("Initializing git repository...");
    execSync('git init', { cwd: dir, stdio: 'pipe' });
  }

  // 4. Create CLAUDE.md with repo-specific info
  await createClaudeMd(dir, templateOptions);

  // 5. Install dependencies (unless skipped)
  if (!options?.skipInstall) {
    console.log("Installing dependencies...");
    try {
      execSync('npm install', { cwd: dir, stdio: 'inherit' });
    } catch {
      console.warn("Warning: npm install failed. You may need to run it manually.");
    }
  }

  // 6. Initial commit (unless git was skipped)
  if (!options?.skipGit) {
    try {
      execSync('git add -A', { cwd: dir, stdio: 'pipe' });
      execSync(`git commit -m "Initial cocapn instance from ${template} template"`, {
        cwd: dir,
        stdio: 'pipe'
      });
    } catch {
      console.warn("Warning: Initial git commit failed. You may need to commit manually.");
    }
  }

  console.log(`\n✓ Cocapn instance created at ${dir}`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${dir}`);
  console.log(`  npm start  # or npm run dev for some templates`);
}

async function createClaudeMd(dir: string, options: Partial<TemplateOptions>): Promise<void> {
  const repoName = options.repoName || 'My Cocapn Instance';
  const description = options.description || '';
  const author = options.author || '';

  const content = `# ${repoName}

${description ? `> ${description}\n` : ''}${author ? `**Author:** ${author}\n` : ''}

## Template
This Cocapn instance was created from the **${options.template}** template.

## Project Structure
- \`src/\` - Source code for your instance
- \`cocapn/\` - Cocapn configuration (soul.md, config.yml, memory/)
- \`package.json\` - Dependencies and scripts

## Getting Started
\`\`\`bash
# Install dependencies (if not already done)
npm install

# Start the instance
npm start

# Run tests
npm test
\`\`\`

## Customization
- Edit \`cocapn/soul.md\` to define your agent's personality
- Modify \`cocapn/config.yml\` for instance settings
- Add memory facts in \`cocapn/memory/facts.json\`

## Conventions
- TypeScript with strict mode
- Vitest for testing
- Git commits for every change
- ESM modules only

${getTemplateSpecificNotes(options.template || 'bare')}
`;

  writeFileSync(resolve(dir, 'CLAUDE.md'), content, 'utf8');
}

function getTemplateSpecificNotes(template: string): string {
  switch (template) {
    case 'cloud-worker':
      return `
## Cloudflare Worker Notes
- Configure \`wrangler.toml\` with your Worker name
- Deploy with \`npm run deploy\`
- Uses Hono framework for routing
`;
    case 'web-app':
      return `
## Web App Notes
- Built with Preact for fast, lightweight UI
- Vite for development and building
- Run \`npm run dev\` for hot reload
`;
    case 'dmlog':
      return `
## DMlog Notes
- Specialized for TTRPG campaigns
- Includes dice rolling and encounter generation
- Character tracking and campaign notes built-in
`;
    case 'studylog':
      return `
## Studylog Notes
- Optimized for educational content
- Spaced repetition and flashcard support
- Quiz generation and progress tracking
`;
    default:
      return '';
  }
}

async function askTemplate(): Promise<string> {
  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    console.log('\nAvailable templates:');
    console.log('  bare          - Minimal cocapn instance');
    console.log('  cloud-worker  - Cloudflare Workers with Hono');
    console.log('  web-app       - React/Preact web application');
    console.log('  dmlog         - TTRPG AI Dungeon Master');
    console.log('  studylog      - Interactive learning platform');

    rl.question('\nChoose a template (bare): ', (answer) => {
      rl.close();
      resolve(answer.trim() || 'bare');
    });
  });
}

// ─── CLI definition ───────────────────────────────────────────────────────────

const DOMAINS = ["makerlog", "studylog", "activelog", "lifelog"] as const;
type Domain = (typeof DOMAINS)[number];

program
  .name("create-cocapn")
  .description("Zero-friction scaffolder for Cocapn agent instances")
  .argument("[name]", "Project name (e.g. my-app)")
  .option(
    "--template <template>",
    `Template type (choices: ${TEMPLATES.join(", ")})`
  )
  .option(
    "--github",
    "Use GitHub integration mode (create repos, clone, etc.)"
  )
  .option(
    "--domain <domain>",
    `Domain slug for GitHub mode (choices: ${DOMAINS.join(", ")})`,
    "makerlog"
  )
  .option("--token <pat>", "GitHub Personal Access Token (or set GITHUB_TOKEN env var)")
  .option("--skip-pages", "Skip enabling GitHub Pages on the public repo")
  .option("--skip-install", "Skip npm install after creating files")
  .option("--skip-git", "Skip git initialization and initial commit")
  .option("--description <desc>", "Project description")
  .option("--author <name>", "Author name")
  .action(async (name: string | undefined, opts: {
    template?: string;
    github?: boolean;
    domain: string;
    token?: string;
    skipPages?: boolean;
    skipInstall?: boolean;
    skipGit?: boolean;
    description?: string;
    author?: string;
    dir?: string;
  }) => {
    if (opts.github) {
      // GitHub integration mode (existing functionality)
      if (!name) {
        console.error("Error: <name> argument is required for GitHub mode");
        process.exit(1);
      }
      await runGitHub(name, opts);
    } else {
      // Simple template mode
      const createOptions: Partial<TemplateOptions & { skipInstall?: boolean; skipGit?: boolean }> = {
        template: opts.template || 'bare',
        repoName: name || 'my-cocapn'
      };
      if (opts.description) createOptions.description = opts.description;
      if (opts.author) createOptions.author = opts.author;
      if (opts.skipInstall) createOptions.skipInstall = opts.skipInstall;
      if (opts.skipGit) createOptions.skipGit = opts.skipGit;

      await createCocapn(name || '.', createOptions);
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

// ─── GitHub integration mode (advanced) ───────────────────────────────────────────

async function runGitHub(
  name: string,
  opts: {
    domain: string;
    token?: string;
    skipPages?: boolean;
    skipInstall?: boolean;
    skipGit?: boolean;
    description?: string;
    author?: string;
    dir?: string;
  }
): Promise<void> {
  // Validate domain choice
  const domain = opts.domain as Domain;
  if (!(DOMAINS as readonly string[]).includes(domain)) {
    console.error(
      `Error: Unknown domain "${domain}". Valid choices: ${DOMAINS.join(", ")}`
    );
    process.exit(1);
  }

  // Resolve base dir
  const baseDir = opts.dir ? resolve(opts.dir) : resolve(process.cwd(), name);

  // ── GitHub token ─────────────────────────────────────────────────────────
  let token = opts.token ?? process.env["GITHUB_TOKEN"] ?? "";

  if (!token) {
    console.log(
      "\nYou need a GitHub Personal Access Token with repo + pages scopes."
    );
    console.log("  https://github.com/settings/tokens/new\n");
    token = await promptHidden("GitHub PAT: ");
  }

  // ── Validate token ───────────────────────────────────────────────────────
  process.stdout.write("  Validating token… ");
  const username = await validateToken(token);
  if (!username) {
    console.error(
      "\nInvalid or expired token. Check your PAT and try again."
    );
    closePrompts();
    process.exit(1);
  }
  console.log(`ok (@${username})`);

  // ── Create repos ─────────────────────────────────────────────────────────
  console.log(`\n  Creating repos for "${name}" on domain ${domain}.ai…`);
  const repos = await createGitHubRepos(token, username, name);
  console.log(`  ✓ github.com/${username}/${repos.publicRepo} (public)`);
  console.log(`  ✓ github.com/${username}/${repos.privateRepo} (private)`);

  // ── Clone ─────────────────────────────────────────────────────────────────
  console.log("\n  Cloning repos…");
  const { publicDir, privateDir } = cloneRepos(token, username, repos, baseDir);
  console.log(`  ✓ ${privateDir}`);
  console.log(`  ✓ ${publicDir}`);

  // ── Scaffold private repo ─────────────────────────────────────────────────
  console.log("\n  Scaffolding private repo…");
  scaffoldPrivateRepo(privateDir, username, domain);

  // ── Age keygen ────────────────────────────────────────────────────────────
  console.log("  Generating age keypair…");
  const ageResult = generateAgeKey(privateDir);
  if (ageResult) {
    console.log(`  ✓ Age public key: ${ageResult.publicKey.slice(0, 24)}…`);
  } else {
    console.log(
      "  (age-keygen not found — skipping. Install: https://age-encryption.org)"
    );
  }

  // ── Commit and push ───────────────────────────────────────────────────────
  console.log("\n  Committing scaffold…");
  commitAll(privateDir, username, "Initial Cocapn scaffold");
  commitAll(publicDir, username, "Initial Cocapn scaffold");

  console.log("  Pushing to GitHub…");
  pushRepo(privateDir, username);
  pushRepo(publicDir, username);

  // ── GitHub Pages ──────────────────────────────────────────────────────────
  if (opts.skipPages !== true) {
    console.log("  Enabling GitHub Pages…");
    await enableGitHubPages(token, username, repos.publicRepo);
    console.log("  ✓ Pages enabled (may take ~60s to go live)");
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  closePrompts();
  printSuccess({
    username,
    domain,
    name,
    privateDir,
    privateRepo: repos.privateRepo,
    agePublicKey: ageResult?.publicKey,
  });
}
