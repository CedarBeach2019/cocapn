/**
 * `cocapn-bridge token` sub-commands — GitHub PAT management.
 *
 *   token set              — Store PAT in OS keychain
 *   token get              — Print masked PAT (for verification)
 *   token verify           — Validate PAT against GitHub API, report scopes
 *   token delete           — Remove PAT from keychain
 */

import { Command } from "commander";
import { SecretManager } from "../secret-manager.js";
import { classifyGithubToken, verifyGithubToken } from "../security/fleet.js";
import { resolve } from "path";

// ─── Colours (no deps) ───────────────────────────────────────────────────────

const C = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  green:  "\x1b[32m",
  cyan:   "\x1b[36m",
  yellow: "\x1b[33m",
  red:    "\x1b[31m",
};

const green  = (s: string) => `${C.green}${s}${C.reset}`;
const cyan   = (s: string) => `${C.cyan}${s}${C.reset}`;
const yellow = (s: string) => `${C.yellow}${s}${C.reset}`;
const red    = (s: string) => `${C.red}${s}${C.reset}`;
const bold   = (s: string) => `${C.bold}${s}${C.reset}`;
const dim    = (s: string) => `${C.dim}${s}${C.reset}`;

export function buildTokenCommand(): Command {
  const cmd = new Command("token").description("Manage GitHub Personal Access Token (stored in OS keychain)");

  // ── set ───────────────────────────────────────────────────────────────────

  cmd
    .command("set <pat>")
    .description("Store a GitHub PAT in the OS keychain (never written to disk)")
    .option("--repo <path>", "Private repo root", process.cwd())
    .action(async (pat: string, opts: { repo: string }) => {
      const mgr = new SecretManager(resolve(opts.repo));
      const { kind } = classifyGithubToken(pat);
      console.log(`${dim("Token type:")} ${cyan(kind)}`);

      const stored = await mgr.storeGithubToken(pat);
      if (stored) {
        console.log(`${green("✓")} GitHub PAT stored in OS keychain`);
      } else {
        console.error(
          `${yellow("Keychain unavailable. Set the GITHUB_TOKEN environment variable instead:")}\n` +
          `  ${dim("export GITHUB_TOKEN=<your-token>")}`
        );
        process.exit(1);
      }
    });

  // ── get ───────────────────────────────────────────────────────────────────

  cmd
    .command("get")
    .description("Print the stored PAT (first 8 chars + ***)")
    .option("--repo <path>", "Private repo root", process.cwd())
    .action(async (opts: { repo: string }) => {
      const mgr   = new SecretManager(resolve(opts.repo));
      const token = await mgr.getGithubToken();
      if (!token) {
        console.error(`${red("Error:")} No GitHub PAT stored. Run: ${yellow("cocapn-bridge token set <pat>")}`);
        process.exit(1);
      }
      console.log(`${dim("Token:")} ${token.slice(0, 8)}...*** ${dim(`(${classifyGithubToken(token).kind})`)}`);
    });

  // ── verify ────────────────────────────────────────────────────────────────

  cmd
    .command("verify")
    .description("Validate the stored PAT against the GitHub API")
    .option("--repo <path>", "Private repo root", process.cwd())
    .action(async (opts: { repo: string }) => {
      const mgr   = new SecretManager(resolve(opts.repo));
      const token = await mgr.getGithubToken();
      if (!token) {
        console.error(`${red("Error:")} No GitHub PAT stored. Run: ${yellow("cocapn-bridge token set <pat>")}`);
        process.exit(1);
      }

      console.log(`${dim("Verifying token against GitHub API…")}`);
      const result = await verifyGithubToken(token);

      if (!result.valid) {
        console.error(`${red("✗ Token is invalid or expired.")}`);
        process.exit(1);
      }

      console.log(`${green("✓ Valid token for @")}${cyan(result.login ?? "unknown")}`);
      console.log(`  ${dim("Kind:")}   ${classifyGithubToken(token).kind}`);
      console.log(`  ${dim("Scopes:")} ${result.scopes.join(", ") || yellow("(fine-grained — scopes not reported)")}`);

      if (result.missingScopes.length > 0) {
        console.warn(`  ${yellow("⚠ Missing recommended scopes:")} ${result.missingScopes.join(", ")}`);
        console.warn(`  ${dim("Required: repo, workflow")}`);
      }
    });

  // ── delete ────────────────────────────────────────────────────────────────

  cmd
    .command("delete")
    .description("Remove the stored GitHub PAT from the keychain")
    .option("--repo <path>", "Private repo root", process.cwd())
    .action(async (opts: { repo: string }) => {
      const mgr = new SecretManager(resolve(opts.repo));
      const ok  = await mgr.deleteGithubToken();
      if (ok) {
        console.log(`${green("✓")} GitHub PAT removed from keychain`);
      } else {
        console.error(`${yellow("Could not remove from keychain (may not have been stored there).")}`);
      }
    });

  return cmd;
}
