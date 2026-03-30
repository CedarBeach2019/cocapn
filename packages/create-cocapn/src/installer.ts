/**
 * One-command installer for Cocapn.
 *
 * Reads current directory, checks prerequisites, runs setup,
 * starts bridge, and opens browser.
 *
 * Usage:
 *   npx create-cocapn          (npm create)
 *   curl -sSL https://cocapn.ai/install | bash
 */

import { execSync } from "child_process";
import { existsSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { checkPrerequisites, type DeploymentTarget } from "./onboarding-wizard.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InstallerOptions {
  /** Directory to install into */
  dir?: string;
  /** Project name */
  name?: string;
  /** Template to use */
  template?: string;
  /** Deployment target */
  deployment?: DeploymentTarget;
  /** Skip browser open */
  skipOpen?: boolean;
  /** Skip starting the bridge */
  skipStart?: boolean;
}

export interface InstallerResult {
  success: boolean;
  brainDir: string;
  publicDir: string;
  localUrl: string;
  errors: string[];
}

// ─── Prerequisite checking ────────────────────────────────────────────────────

export function validatePrerequisites(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const prereqs = checkPrerequisites();

  if (!prereqs.nodeOk) {
    errors.push(`Node.js 18+ required. Current: ${prereqs.nodeVersion || "not installed"}`);
  }
  if (!prereqs.gitOk) {
    errors.push(`Git required. Current: ${prereqs.gitVersion || "not installed"}`);
  }

  return { ok: errors.length === 0, errors };
}

// ─── Shell script generator ───────────────────────────────────────────────────

export function generateInstallScript(): string {
  return `#!/usr/bin/env bash
# Cocapn one-command installer
# Usage: curl -sSL https://cocapn.ai/install | bash

set -euo pipefail

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Cocapn Installer"
echo "  The repo IS the agent."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - 2>/dev/null || true
  sudo apt-get install -y nodejs 2>/dev/null || brew install node 2>/dev/null || {
    echo "Error: Could not install Node.js. Please install Node.js 18+ manually."
    exit 1
  }
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "Error: Node.js 18+ required (current: $(node -v))"
  exit 1
fi

# Check git
if ! command -v git &>/dev/null; then
  echo "Error: git is required. Install it first: https://git-scm.com"
  exit 1
fi

echo "Prerequisites OK: node $(node -v), git $(git --version | awk '{print $3}')"
echo ""

# Run create-cocapn
echo "Running cocapn setup..."
exec npx create-cocapn "\${@:-}"
`;
}

// ─── Main installer ───────────────────────────────────────────────────────────

export async function runInstaller(options: InstallerOptions = {}): Promise<InstallerResult> {
  const errors: string[] = [];
  const targetDir = resolve(options.dir ?? process.cwd());
  const name = options.name ?? "my-agent";

  // Check prerequisites
  const prereqs = validatePrerequisites();
  if (!prereqs.ok) {
    return { success: false, brainDir: "", publicDir: "", localUrl: "", errors: prereqs.errors };
  }

  const brainDir = join(targetDir, `${name}-brain`);
  const publicDir = join(targetDir, name);

  // Check existing directories
  if (existsSync(brainDir)) {
    errors.push(`Directory "${brainDir}" already exists.`);
    return { success: false, brainDir, publicDir, localUrl: "", errors };
  }
  if (existsSync(publicDir)) {
    errors.push(`Directory "${publicDir}" already exists.`);
    return { success: false, brainDir, publicDir, localUrl: "", errors };
  }

  // Run the onboarding
  const { runOnboarding } = await import("./onboarding-wizard.js");
  const config = {
    agentName: name,
    agentEmoji: "🤖",
    agentDescription: "",
    username: "user",
    template: options.template ?? "bare",
    domain: "",
    deployment: options.deployment ?? "local" as DeploymentTarget,
    baseDir: targetDir,
  };

  try {
    const result = await runOnboarding(config);

    // Write a .cocapn-installed marker
    writeFileSync(
      join(brainDir, ".cocapn-installed"),
      JSON.stringify({ installedAt: new Date().toISOString(), version: "0.1.0" }, null, 2),
      "utf8",
    );

    // Optionally start the bridge
    if (!options.skipStart) {
      try {
        console.info("[installer] Starting bridge...");
        execSync("npx cocapn start", {
          cwd: brainDir,
          stdio: "inherit",
          timeout: 10_000,
          detached: true,
        });
      } catch {
        // Bridge start is best-effort in the installer
        console.info("[installer] Bridge start skipped — run 'cocapn start' manually.");
      }
    }

    // Optionally open browser
    if (!options.skipOpen) {
      try {
        const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
        execSync(`${openCmd} ${result.localUrl}/onboard`, { stdio: "ignore", timeout: 5000 });
      } catch {
        // Browser open is best-effort
      }
    }

    return {
      success: true,
      brainDir: result.repos.brainDir,
      publicDir: result.repos.publicDir,
      localUrl: result.localUrl,
      errors,
    };
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    return { success: false, brainDir, publicDir, localUrl: "", errors };
  }
}
