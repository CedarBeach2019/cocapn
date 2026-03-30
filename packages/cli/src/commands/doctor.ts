/**
 * cocapn doctor — Diagnose and fix common issues
 *
 * Usage:
 *   cocapn doctor       — Run full diagnostics
 *   cocapn doctor fix   — Auto-fix common issues
 */

import { Command } from "commander";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  statSync,
} from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { createServer } from "net";
import { parseYaml, validateConfig, resolveConfigPath, DEFAULT_CONFIG, serializeYaml } from "./config.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CheckResult {
  id: string;
  label: string;
  status: "pass" | "fail" | "warn";
  message: string;
  fixable: boolean;
  fix?: string;
}

export interface DoctorResult {
  checks: CheckResult[];
  fixes: string[];
}

// ─── ANSI colors ────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

const bold = (s: string) => `${c.bold}${s}${c.reset}`;
const green = (s: string) => `${c.green}${s}${c.reset}`;
const cyan = (s: string) => `${c.cyan}${s}${c.reset}`;
const yellow = (s: string) => `${c.yellow}${s}${c.reset}`;
const red = (s: string) => `${c.red}${s}${c.reset}`;
const gray = (s: string) => `${c.gray}${s}${c.reset}`;

// ─── Expected directory structure ───────────────────────────────────────────

const REQUIRED_DIRS = [
  "cocapn",
  "cocapn/memory",
  "cocapn/wiki",
];

const OPTIONAL_DIRS = [
  "cocapn/agents",
  "cocapn/tasks",
  "secrets",
];

const BRAIN_FILES = [
  "cocapn/memory/facts.json",
  "cocapn/memory/memories.json",
  "cocapn/memory/procedures.json",
  "cocapn/memory/relationships.json",
];

const KNOWN_API_KEYS = [
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
];

const LOCK_FILES = [
  "cocapn/.bridge.lock",
  "cocapn/.sync.lock",
  "cocapn/.git.lock",
];

const BRIDGE_PORT = 3100;

// ─── Check functions ────────────────────────────────────────────────────────

export function checkCocapnDir(repoRoot: string): CheckResult {
  const dir = join(repoRoot, "cocapn");
  if (!existsSync(dir)) {
    return {
      id: "cocapn-dir",
      label: "cocapn/ directory",
      status: "fail",
      message: "cocapn/ directory not found. Run cocapn setup to initialize.",
      fixable: true,
      fix: "mkdir",
    };
  }
  if (!statSync(dir).isDirectory()) {
    return {
      id: "cocapn-dir",
      label: "cocapn/ directory",
      status: "fail",
      message: "cocapn exists but is not a directory.",
      fixable: false,
    };
  }
  return {
    id: "cocapn-dir",
    label: "cocapn/ directory",
    status: "pass",
    message: "Found cocapn/ directory",
    fixable: false,
  };
}

export function checkSubdirectories(repoRoot: string): CheckResult {
  const missing: string[] = [];
  for (const dir of REQUIRED_DIRS) {
    if (!existsSync(join(repoRoot, dir))) {
      missing.push(dir);
    }
  }
  if (missing.length > 0) {
    return {
      id: "subdirectories",
      label: "Required subdirectories",
      status: "warn",
      message: `Missing: ${missing.join(", ")}`,
      fixable: true,
      fix: "mkdir",
    };
  }
  return {
    id: "subdirectories",
    label: "Required subdirectories",
    status: "pass",
    message: "All required directories present",
    fixable: false,
  };
}

export function checkConfigYaml(repoRoot: string): CheckResult {
  const configPath = resolveConfigPath(repoRoot);
  if (!configPath) {
    return {
      id: "config-yaml",
      label: "config.yml",
      status: "fail",
      message: "No config.yml found. Expected at cocapn/config.yml or config.yml.",
      fixable: true,
      fix: "default-config",
    };
  }
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = parseYaml(raw);
    if (!parsed || typeof parsed !== "object") {
      return {
        id: "config-yaml",
        label: "config.yml",
        status: "fail",
        message: "config.yml exists but is empty or invalid.",
        fixable: true,
        fix: "default-config",
      };
    }
    const issues = validateConfig(parsed);
    const errors = issues.filter((i) => i.level === "error");
    const warnings = issues.filter((i) => i.level === "warning");
    if (errors.length > 0) {
      return {
        id: "config-yaml",
        label: "config.yml",
        status: "fail",
        message: `Validation errors: ${errors.map((e) => e.message).join("; ")}`,
        fixable: false,
      };
    }
    if (warnings.length > 0) {
      return {
        id: "config-yaml",
        label: "config.yml",
        status: "warn",
        message: `Warnings: ${warnings.map((w) => w.message).join("; ")}`,
        fixable: false,
      };
    }
    return {
      id: "config-yaml",
      label: "config.yml",
      status: "pass",
      message: "Valid config with no errors",
      fixable: false,
    };
  } catch (err) {
    return {
      id: "config-yaml",
      label: "config.yml",
      status: "fail",
      message: `Failed to parse config.yml: ${err instanceof Error ? err.message : String(err)}`,
      fixable: true,
      fix: "default-config",
    };
  }
}

export function checkSoulMd(repoRoot: string): CheckResult {
  const soulPath = join(repoRoot, "cocapn", "soul.md");
  if (!existsSync(soulPath)) {
    return {
      id: "soul-md",
      label: "soul.md",
      status: "warn",
      message: "soul.md not found at cocapn/soul.md. The agent will have no personality.",
      fixable: true,
      fix: "default-soul",
    };
  }
  try {
    const content = readFileSync(soulPath, "utf-8");
    if (content.trim().length === 0) {
      return {
        id: "soul-md",
        label: "soul.md",
        status: "warn",
        message: "soul.md is empty. Add personality and instructions.",
        fixable: true,
        fix: "default-soul",
      };
    }
    return {
      id: "soul-md",
      label: "soul.md",
      status: "pass",
      message: `soul.md found (${content.split("\n").length} lines)`,
      fixable: false,
    };
  } catch (err) {
    return {
      id: "soul-md",
      label: "soul.md",
      status: "fail",
      message: `Cannot read soul.md: ${err instanceof Error ? err.message : String(err)}`,
      fixable: false,
    };
  }
}

export function checkBrainFiles(repoRoot: string): CheckResult {
  const invalid: string[] = [];
  const missing: string[] = [];

  for (const file of BRAIN_FILES) {
    const fullPath = join(repoRoot, file);
    if (!existsSync(fullPath)) {
      missing.push(file);
      continue;
    }
    try {
      const content = readFileSync(fullPath, "utf-8");
      JSON.parse(content);
    } catch {
      invalid.push(file);
    }
  }

  if (invalid.length > 0) {
    return {
      id: "brain-files",
      label: "Brain JSON files",
      status: "fail",
      message: `Invalid JSON: ${invalid.join(", ")}`,
      fixable: true,
      fix: "fix-json",
    };
  }
  if (missing.length > 0) {
    return {
      id: "brain-files",
      label: "Brain JSON files",
      status: "warn",
      message: `Missing: ${missing.join(", ")}`,
      fixable: true,
      fix: "create-brain-files",
    };
  }
  return {
    id: "brain-files",
    label: "Brain JSON files",
    status: "pass",
    message: "All brain files valid",
    fixable: false,
  };
}

export function checkGitRepo(repoRoot: string): CheckResult {
  if (!existsSync(join(repoRoot, ".git"))) {
    return {
      id: "git-repo",
      label: "Git repository",
      status: "fail",
      message: "Not a git repository. Run git init to initialize.",
      fixable: false,
    };
  }
  try {
    const remote = execSync("git remote get-url origin 2>/dev/null", {
      cwd: repoRoot,
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    if (!remote) {
      return {
        id: "git-repo",
        label: "Git repository",
        status: "warn",
        message: "Git initialized but no remote configured.",
        fixable: false,
      };
    }
    return {
      id: "git-repo",
      label: "Git repository",
      status: "pass",
      message: `Git repo with remote: ${remote}`,
      fixable: false,
    };
  } catch {
    // git remote get-url failed — might not have origin
    return {
      id: "git-repo",
      label: "Git repository",
      status: "warn",
      message: "Git initialized but no origin remote found.",
      fixable: false,
    };
  }
}

export function checkNodeVersion(): CheckResult {
  const version = process.version;
  const major = parseInt(version.replace("v", "").split(".")[0], 10);
  if (major < 18) {
    return {
      id: "node-version",
      label: "Node.js version",
      status: "fail",
      message: `Node.js ${version} is below minimum v18.0.0. Upgrade your Node.js installation.`,
      fixable: false,
    };
  }
  return {
    id: "node-version",
    label: "Node.js version",
    status: "pass",
    message: `Node.js ${version} (>= 18)`,
    fixable: false,
  };
}

export function checkLockFiles(repoRoot: string): CheckResult {
  const stale: string[] = [];
  for (const file of LOCK_FILES) {
    const fullPath = join(repoRoot, file);
    if (existsSync(fullPath)) {
      try {
        const stat = statSync(fullPath);
        const ageMs = Date.now() - stat.mtimeMs;
        // Stale if older than 1 hour
        if (ageMs > 60 * 60 * 1000) {
          stale.push(file);
        }
      } catch {
        stale.push(file);
      }
    }
  }
  if (stale.length > 0) {
    return {
      id: "lock-files",
      label: "Stale lock files",
      status: "warn",
      message: `Stale lock files (>1h old): ${stale.join(", ")}`,
      fixable: true,
      fix: "remove-locks",
    };
  }
  return {
    id: "lock-files",
    label: "Stale lock files",
    status: "pass",
    message: "No stale lock files",
    fixable: false,
  };
}

export function checkApiKeys(): CheckResult {
  const found: string[] = [];
  const missing: string[] = [];

  for (const key of KNOWN_API_KEYS) {
    if (process.env[key] && process.env[key]!.length > 0) {
      found.push(key);
    } else {
      missing.push(key);
    }
  }

  if (found.length === 0) {
    return {
      id: "api-keys",
      label: "API keys",
      status: "warn",
      message: `No LLM API keys found in environment. Set at least one: ${KNOWN_API_KEYS.join(", ")}`,
      fixable: false,
    };
  }
  if (missing.length > 0) {
    return {
      id: "api-keys",
      label: "API keys",
      status: "warn",
      message: `Found: ${found.join(", ")}. Missing: ${missing.join(", ")}`,
      fixable: false,
    };
  }
  return {
    id: "api-keys",
    label: "API keys",
    status: "pass",
    message: `API keys set: ${found.join(", ")}`,
    fixable: false,
  };
}

export function checkBridgePort(): Promise<CheckResult> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve({
          id: "bridge-port",
          label: `Bridge port ${BRIDGE_PORT}`,
          status: "pass",
          message: `Port ${BRIDGE_PORT} is in use (bridge may be running)`,
          fixable: false,
        });
      } else {
        resolve({
          id: "bridge-port",
          label: `Bridge port ${BRIDGE_PORT}`,
          status: "fail",
          message: `Port ${BRIDGE_PORT} check failed: ${err.message}`,
          fixable: false,
        });
      }
    });
    server.once("listening", () => {
      server.close(() => {
        resolve({
          id: "bridge-port",
          label: `Bridge port ${BRIDGE_PORT}`,
          status: "pass",
          message: `Port ${BRIDGE_PORT} is available`,
          fixable: false,
        });
      });
    });
    server.listen(BRIDGE_PORT, "127.0.0.1");
  });
}

// ─── Fix functions ──────────────────────────────────────────────────────────

export function fixMissingDirectories(repoRoot: string): string[] {
  const fixes: string[] = [];
  for (const dir of REQUIRED_DIRS) {
    const fullPath = join(repoRoot, dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
      fixes.push(`Created ${dir}/`);
    }
  }
  return fixes;
}

export function fixDefaultConfig(repoRoot: string): string[] {
  const fixes: string[] = [];
  const cocapnDir = join(repoRoot, "cocapn");
  const configPath = join(cocapnDir, "config.yml");

  if (!resolveConfigPath(repoRoot)) {
    if (!existsSync(cocapnDir)) {
      mkdirSync(cocapnDir, { recursive: true });
    }
    writeFileSync(configPath, serializeYaml(DEFAULT_CONFIG) + "\n", "utf-8");
    fixes.push(`Created ${configPath} with defaults`);
  }
  return fixes;
}

export function fixDefaultSoul(repoRoot: string): string[] {
  const fixes: string[] = [];
  const soulPath = join(repoRoot, "cocapn", "soul.md");
  const cocapnDir = join(repoRoot, "cocapn");

  if (!existsSync(soulPath) || readFileSync(soulPath, "utf-8").trim().length === 0) {
    if (!existsSync(cocapnDir)) {
      mkdirSync(cocapnDir, { recursive: true });
    }
    writeFileSync(
      soulPath,
      `# Soul\n\nYou are a helpful assistant powered by cocapn.\n\n## Personality\n\nFriendly, concise, knowledgeable.\n`,
      "utf-8",
    );
    fixes.push(`Created ${soulPath} with default template`);
  }
  return fixes;
}

export function fixBrainFiles(repoRoot: string): string[] {
  const fixes: string[] = [];
  for (const file of BRAIN_FILES) {
    const fullPath = join(repoRoot, file);
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (!existsSync(fullPath)) {
      writeFileSync(fullPath, "{}\n", "utf-8");
      fixes.push(`Created ${file} (empty)`);
    } else {
      // Try to fix invalid JSON — replace with empty object
      try {
        readFileSync(fullPath, "utf-8");
        JSON.parse(readFileSync(fullPath, "utf-8"));
      } catch {
        writeFileSync(fullPath, "{}\n", "utf-8");
        fixes.push(`Reset ${file} to empty object (was invalid JSON)`);
      }
    }
  }
  return fixes;
}

export function fixLockFiles(repoRoot: string): string[] {
  const fixes: string[] = [];
  for (const file of LOCK_FILES) {
    const fullPath = join(repoRoot, file);
    if (existsSync(fullPath)) {
      try {
        const stat = statSync(fullPath);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs > 60 * 60 * 1000) {
          unlinkSync(fullPath);
          fixes.push(`Removed stale ${file}`);
        }
      } catch {
        try { unlinkSync(fullPath); } catch { /* ignore */ }
        fixes.push(`Removed ${file}`);
      }
    }
  }
  return fixes;
}

// ─── Run all checks ─────────────────────────────────────────────────────────

export async function runDiagnostics(repoRoot: string): Promise<DoctorResult> {
  const checks: CheckResult[] = [
    checkNodeVersion(),
    checkCocapnDir(repoRoot),
    checkSubdirectories(repoRoot),
    checkConfigYaml(repoRoot),
    checkSoulMd(repoRoot),
    checkBrainFiles(repoRoot),
    checkGitRepo(repoRoot),
    checkLockFiles(repoRoot),
    checkApiKeys(),
    await checkBridgePort(),
  ];

  return { checks, fixes: [] };
}

// ─── Run all fixes ──────────────────────────────────────────────────────────

export function runFixes(repoRoot: string, diagnostics: DoctorResult): DoctorResult {
  const fixes: string[] = [];

  for (const check of diagnostics.checks) {
    if (!check.fixable) continue;

    switch (check.fix) {
      case "mkdir":
        fixes.push(...fixMissingDirectories(repoRoot));
        break;
      case "default-config":
        fixes.push(...fixDefaultConfig(repoRoot));
        break;
      case "default-soul":
        fixes.push(...fixDefaultSoul(repoRoot));
        break;
      case "fix-json":
      case "create-brain-files":
        fixes.push(...fixBrainFiles(repoRoot));
        break;
      case "remove-locks":
        fixes.push(...fixLockFiles(repoRoot));
        break;
    }
  }

  return { checks: diagnostics.checks, fixes };
}

// ─── Display ────────────────────────────────────────────────────────────────

function printResult(result: DoctorResult): void {
  console.log(bold("\n  cocapn doctor\n"));

  const labelWidth = 22;
  let passCount = 0;
  let failCount = 0;
  let warnCount = 0;

  for (const check of result.checks) {
    const label = check.label.padEnd(labelWidth);

    switch (check.status) {
      case "pass":
        console.log(`  ${green("\u2705")} ${label} ${gray(check.message)}`);
        passCount++;
        break;
      case "fail":
        console.log(`  ${red("\u274C")} ${label} ${red(check.message)}`);
        failCount++;
        break;
      case "warn":
        console.log(`  ${yellow("\u26A0\uFE0F")} ${label} ${yellow(check.message)}`);
        warnCount++;
        break;
    }
  }

  if (result.fixes.length > 0) {
    console.log();
    console.log(bold("  Fixes applied:"));
    for (const fix of result.fixes) {
      console.log(`  ${green("\u2713")} ${fix}`);
    }
  }

  console.log();
  const summary = `${passCount} passed, ${failCount} failed, ${warnCount} warnings`;
  if (failCount > 0) {
    console.log(`  ${red(summary)}`);
    console.log(`  ${gray("Run cocapn doctor fix to auto-fix issues.")}`);
  } else if (warnCount > 0) {
    console.log(`  ${yellow(summary)}`);
  } else {
    console.log(`  ${green(summary)}`);
  }
  console.log();
}

// ─── Command ────────────────────────────────────────────────────────────────

export function createDoctorCommand(): Command {
  return new Command("doctor")
    .description("Diagnose and fix common issues")
    .argument("[subcommand]", "Subcommand: fix", undefined)
    .action(async (subcommand: string | undefined) => {
      const repoRoot = process.cwd();
      let result: DoctorResult;

      if (subcommand === "fix") {
        const diagnostics = await runDiagnostics(repoRoot);
        result = runFixes(repoRoot, diagnostics);
      } else {
        result = await runDiagnostics(repoRoot);
      }

      printResult(result);

      if (result.checks.some((c) => c.status === "fail")) {
        process.exit(1);
      }
    });
}
