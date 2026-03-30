/**
 * create-cocapn — Two-repo scaffolder for Cocapn agent instances.
 *
 * Usage:
 *   npx create-cocapn
 *   npx create-cocapn my-app
 *   npx create-cocapn my-app --template dmlog --domain dmlog
 */

import { resolve } from "path";
import { existsSync, rmSync } from "fs";
import { program } from "commander";
import { prompt, promptHidden, choose, closePrompts } from "./prompts.js";
import {
  createPrivateRepo,
  createPublicRepo,
  initAndCommit,
  writeSecrets,
  testLLMConnection,
  printSuccess,
  type ScaffoldConfig,
  type LLMTestResult,
} from "./scaffold.js";

// ─── Templates ────────────────────────────────────────────────────────────────

const TEMPLATES = ["bare", "dmlog", "makerlog", "studylog"] as const;
type Template = (typeof TEMPLATES)[number];

// ─── Main flow ────────────────────────────────────────────────────────────────

export async function createCocapn(
  projectName: string | undefined,
  opts?: {
    template?: string;
    domain?: string;
    username?: string;
    skipSecrets?: boolean;
    skipLLMTest?: boolean;
    dir?: string;
  },
): Promise<void> {
  // ── Collect inputs ──────────────────────────────────────────────────────────

  const username = opts?.username ?? await prompt("Username: ");

  if (!username) {
    console.error("Error: username is required.");
    closePrompts();
    process.exit(1);
  }

  const name = projectName ?? await prompt("Project name (e.g. my-app): ");

  if (!name) {
    console.error("Error: project name is required.");
    closePrompts();
    process.exit(1);
  }

  // Template
  let template: string = opts?.template ?? "";
  if (!template || !(TEMPLATES as readonly string[]).includes(template)) {
    template = await choose("Choose a template (1): ", [...TEMPLATES]);
  }

  // Domain (optional)
  let domain = opts?.domain ?? "";
  if (!domain) {
    const domainInput = await prompt("Custom domain (optional, e.g. makerlog): ");
    domain = domainInput;
  }

  const baseDir = opts?.dir ?? resolve(process.cwd());

  // ── Build config ────────────────────────────────────────────────────────────

  const config: ScaffoldConfig = {
    username,
    projectName: name,
    domain,
    template,
    baseDir,
  };

  const brainDir = resolve(baseDir, `${name}-brain`);
  const publicDir = resolve(baseDir, name);

  // ── Validate directories don't exist ────────────────────────────────────────

  for (const dir of [brainDir, publicDir]) {
    if (existsSync(dir)) {
      console.error(`Error: Directory "${dir}" already exists. Remove it and try again.`);
      closePrompts();
      process.exit(1);
    }
  }

  // ── Scaffold both repos ─────────────────────────────────────────────────────

  console.log(`\nCreating Cocapn instance for ${username}...`);

  console.log(`  Scaffolding brain repo...`);
  createPrivateRepo(brainDir, config);

  console.log(`  Scaffolding public repo...`);
  createPublicRepo(publicDir, config);

  // ── Initialize git ──────────────────────────────────────────────────────────

  console.log(`  Initializing git repos...`);
  initAndCommit(brainDir, username, "Initial Cocapn brain scaffold");
  initAndCommit(publicDir, username, "Initial Cocapn public scaffold");

  // ── Secrets ─────────────────────────────────────────────────────────────────

  let llmResult: LLMTestResult | undefined;

  if (!opts?.skipSecrets) {
    console.log();
    const apiKey = await promptHidden("DEEPSEEK_API_KEY (or Anthropic key, press Enter to skip): ");
    if (apiKey) {
      const keyName = apiKey.startsWith("sk-ant-") ? "ANTHROPIC_API_KEY" : "DEEPSEEK_API_KEY";
      writeSecrets(brainDir, { [keyName]: apiKey });

      // ── Test LLM connection ─────────────────────────────────────────────────
      if (!opts?.skipLLMTest) {
        console.log(`  Testing LLM connection...`);
        llmResult = await testLLMConnection(apiKey);
      }
    }
  }

  // ── Done ────────────────────────────────────────────────────────────────────

  closePrompts();
  printSuccess({
    username,
    projectName: name,
    domain,
    brainDir,
    publicDir,
    ...(llmResult ? { llmResult } : {}),
  });
}

// ─── CLI definition ───────────────────────────────────────────────────────────

program
  .name("create-cocapn")
  .description("Two-repo scaffolder for Cocapn agent instances")
  .argument("[name]", "Project name (e.g. my-app)")
  .option("--template <template>", `Template type (${TEMPLATES.join(", ")})`)
  .option("--domain <domain>", "Domain slug (e.g. makerlog)")
  .option("--username <user>", "Username")
  .option("--skip-secrets", "Skip secret prompts")
  .option("--skip-llm-test", "Skip LLM connection test")
  .action(async (name: string | undefined, opts: {
    template?: string;
    domain?: string;
    username?: string;
    skipSecrets?: boolean;
    skipLLMTest?: boolean;
  }) => {
    await createCocapn(name, opts);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`);
  closePrompts();
  process.exit(1);
});
