/**
 * cocapn publish — publish brain content to face repo.
 *
 * Usage:
 *   cocapn publish           — Show dry-run, confirm, then publish
 *   cocapn publish --yes     — Skip confirmation prompt
 *   cocapn publish --dry-run — Only show what would be published
 */

import { Command } from "commander";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import { resolveRepoPaths } from "./sync.js";

// --- Color helpers ---

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

const bold = (s: string) => `${c.bold}${s}${c.reset}`;
const cyan = (s: string) => `${c.cyan}${s}${c.reset}`;
const green = (s: string) => `${c.green}${s}${c.reset}`;
const yellow = (s: string) => `${c.yellow}${s}${c.reset}`;
const red = (s: string) => `${c.red}${s}${c.reset}`;
const dim = (s: string) => `${c.dim}${s}${c.reset}`;

// --- PII filtering (matches PublishingFilter) ---

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const API_KEY_RE =
  /\b(?:sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|AKIA[A-Z0-9]{16}|Bearer\s+[A-Za-z0-9\-._~+/]+=*)/gi;
const HEX_SECRET_RE = /\b[0-9a-f]{40,}\b/gi;

function sanitizePii(text: string): string {
  return text
    .replace(EMAIL_RE, "[REDACTED]")
    .replace(API_KEY_RE, "[REDACTED]")
    .replace(HEX_SECRET_RE, "[REDACTED]");
}

function filterFacts(
  facts: Record<string, string>
): { public: Record<string, string>; filtered: string[] } {
  const pub: Record<string, string> = {};
  const filtered: string[] = [];
  for (const [key, value] of Object.entries(facts)) {
    if (
      key.startsWith("private.") ||
      key.startsWith("sensitive.") ||
      key.startsWith("secret.")
    ) {
      filtered.push(key);
    } else {
      pub[key] = sanitizePii(value);
    }
  }
  return { public: pub, filtered };
}

// --- Content readers ---

function readFacts(privateRoot: string): Record<string, string> {
  const factsPath = join(
    privateRoot,
    "cocapn",
    "memory",
    "facts.json"
  );
  if (!existsSync(factsPath)) return {};
  try {
    return JSON.parse(readFileSync(factsPath, "utf8"));
  } catch {
    return {};
  }
}

function readSoul(privateRoot: string): string {
  const soulPath = join(privateRoot, "cocapn", "soul.md");
  if (!existsSync(soulPath)) return "";
  try {
    let soul = readFileSync(soulPath, "utf8");
    // Strip private sections
    soul = soul.replace(
      /<!--\s*private\s*-->[\s\S]*?<!--\s*\/private\s*-->/gi,
      ""
    );
    return sanitizePii(soul).trim();
  } catch {
    return "";
  }
}

function readWikiPages(
  privateRoot: string
): { files: string[]; sanitizedCount: number } {
  const wikiDir = join(privateRoot, "cocapn", "wiki");
  if (!existsSync(wikiDir)) return { files: [], sanitizedCount: 0 };
  const files: string[] = [];
  let count = 0;
  try {
    const entries = listFilesRecursive(wikiDir, wikiDir);
    for (const rel of entries) {
      if (rel.endsWith(".md")) {
        files.push(rel);
        count++;
      }
    }
  } catch {
    // unreadable
  }
  return { files, sanitizedCount: count };
}

function listFilesRecursive(dir: string, base: string): string[] {
  const results: string[] = [];
  try {
    const entries = require("fs").readdirSync(dir, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...listFilesRecursive(full, base));
      } else {
        results.push(full.slice(base.length + 1));
      }
    }
  } catch {
    // unreadable
  }
  return results;
}

function readTasks(privateRoot: string): { id: string; title: string; status: string }[] {
  const tasksDir = join(privateRoot, "cocapn", "tasks");
  if (!existsSync(tasksDir)) return [];
  const tasks: { id: string; title: string; status: string }[] = [];
  try {
    const entries = require("fs").readdirSync(tasksDir);
    for (const file of entries) {
      if (!file.endsWith(".md")) continue;
      try {
        const content = readFileSync(join(tasksDir, file), "utf8");
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const statusMatch = content.match(/^status:\s*(active|done)$/m);
        if (titleMatch) {
          tasks.push({
            id: file.replace(/\.md$/, ""),
            title: titleMatch[1].trim(),
            status: statusMatch?.[1] ?? "active",
          });
        }
      } catch {
        // skip
      }
    }
  } catch {
    // unreadable
  }
  return tasks;
}

// --- Publish actions ---

interface PublishPlan {
  facts: { public: Record<string, string>; filtered: string[] };
  soul: string;
  wikiFiles: string[];
  tasks: { id: string; title: string; status: string }[];
  filesToWrite: string[];
}

function buildPlan(privateRoot: string): PublishPlan {
  const facts = filterFacts(readFacts(privateRoot));
  const soul = readSoul(privateRoot);
  const wiki = readWikiPages(privateRoot);
  const tasks = readTasks(privateRoot);

  const filesToWrite: string[] = [];
  if (Object.keys(facts.public).length > 0)
    filesToWrite.push("cocapn/public-facts.json");
  if (soul.length > 0) filesToWrite.push("cocapn/public-soul.md");
  for (const f of wiki.files) filesToWrite.push(`cocapn/public-wiki/${f}`);
  if (tasks.length > 0) filesToWrite.push("cocapn/public-tasks.json");

  return { facts, soul, wikiFiles: wiki.files, tasks, filesToWrite };
}

function showPlan(plan: PublishPlan): void {
  console.log(cyan("Publish plan:"));
  console.log(
    `  ${bold("Facts:")}     ${Object.keys(plan.facts.public).length} public, ${plan.facts.filtered.length} filtered`
  );
  console.log(`  ${bold("Soul:")}      ${plan.soul.length > 0 ? plan.soul.length + " chars" : "(empty)"}`);
  console.log(`  ${bold("Wiki:")}      ${plan.wikiFiles.length} page(s)`);
  console.log(`  ${bold("Tasks:")}     ${plan.tasks.length} task(s)`);
  console.log(`  ${bold("Files:")}     ${plan.filesToWrite.length} to write`);

  if (plan.facts.filtered.length > 0) {
    console.log();
    console.log(yellow("Filtered (private) facts:"));
    for (const key of plan.facts.filtered) {
      console.log(`  ${dim("-")} ${key}`);
    }
  }
}

function executePublish(
  privateRoot: string,
  publicRoot: string,
  plan: PublishPlan
): string[] {
  const written: string[] = [];
  const cocapnDir = join(publicRoot, "cocapn");
  if (!existsSync(cocapnDir)) mkdirSync(cocapnDir, { recursive: true });

  // Facts
  if (Object.keys(plan.facts.public).length > 0) {
    writeFileSync(
      join(cocapnDir, "public-facts.json"),
      JSON.stringify(plan.facts.public, null, 2) + "\n",
      "utf8"
    );
    written.push("cocapn/public-facts.json");
  }

  // Soul
  if (plan.soul.length > 0) {
    writeFileSync(
      join(cocapnDir, "public-soul.md"),
      plan.soul,
      "utf8"
    );
    written.push("cocapn/public-soul.md");
  }

  // Wiki
  if (plan.wikiFiles.length > 0) {
    const wikiDir = join(cocapnDir, "public-wiki");
    if (!existsSync(wikiDir)) mkdirSync(wikiDir, { recursive: true });
    for (const rel of plan.wikiFiles) {
      const src = join(privateRoot, "cocapn", "wiki", rel);
      const dst = join(wikiDir, rel);
      try {
        mkdirSync(join(dst, ".."), { recursive: true });
        let content = readFileSync(src, "utf8");
        content = sanitizePii(content);
        writeFileSync(dst, content, "utf8");
        written.push(`cocapn/public-wiki/${rel}`);
      } catch {
        // skip unreadable
      }
    }
  }

  // Tasks
  if (plan.tasks.length > 0) {
    writeFileSync(
      join(cocapnDir, "public-tasks.json"),
      JSON.stringify(plan.tasks, null, 2) + "\n",
      "utf8"
    );
    written.push("cocapn/public-tasks.json");
  }

  return written;
}

// --- Command registration ---

export function createPublishCommand(): Command {
  return new Command("publish")
    .description("Publish brain content to face repo (private → public sync)")
    .option("--dry-run", "Show what would be published without writing")
    .option("--yes, -y", "Skip confirmation prompt")
    .action((opts: { dryRun?: boolean; yes?: boolean }) => {
      try {
        publishAction(opts);
      } catch (err) {
        console.error(red("Publish failed"));
        console.error(`  ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });
}

function publishAction(opts: { dryRun?: boolean; yes?: boolean }): void {
  const { privatePath, publicPath } = resolveRepoPaths();

  if (!privatePath) {
    console.log(red("Private (brain) repo not found."));
    console.log(dim("Run this command from your brain repo directory."));
    process.exit(1);
  }
  if (!publicPath) {
    console.log(red("Public (face) repo not found."));
    console.log(dim("Make sure your face repo sibling exists."));
    process.exit(1);
  }

  console.log(cyan(`Brain: ${privatePath}`));
  console.log(cyan(`Face:  ${publicPath}`));
  console.log();

  // Build plan
  const plan = buildPlan(privatePath);

  if (plan.filesToWrite.length === 0) {
    console.log(yellow("Nothing to publish — brain has no public content."));
    return;
  }

  // Show dry-run or plan
  showPlan(plan);
  console.log();

  if (opts.dryRun) {
    console.log(dim("[dry-run] No files were written."));
    return;
  }

  // Confirm
  if (!opts.yes) {
    console.log(yellow("Proceed with publish? [y/N]"));
    // Simple stdin read
    try {
      const answer = require("fs").readFileSync(0, "utf8").trim().toLowerCase();
      if (answer !== "y" && answer !== "yes") {
        console.log(dim("Cancelled."));
        return;
      }
    } catch {
      // Non-interactive — proceed
    }
  }

  // Execute
  const written = executePublish(privatePath, publicPath, plan);
  console.log(green(`Wrote ${written.length} file(s) to face repo:`));
  for (const f of written) {
    console.log(`  ${dim("→")} ${f}`);
  }

  // Git commit
  try {
    execFileSync("git", ["add", "cocapn/"], {
      cwd: publicPath,
      timeout: 10_000,
    });
    execFileSync(
      "git",
      ["commit", "-m", `cocapn: brain → face sync (${written.length} files)`],
      { cwd: publicPath, timeout: 10_000 }
    );
    console.log(green("Committed to face repo."));
  } catch {
    console.log(dim("Nothing new to commit."));
  }

  // Push
  try {
    execFileSync("git", ["push"], {
      cwd: publicPath,
      timeout: 30_000,
    });
    console.log(green("Pushed to remote."));
  } catch {
    console.log(dim("Push skipped (no remote or push failed)."));
  }
}
