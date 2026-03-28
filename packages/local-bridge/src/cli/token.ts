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
      console.log(`Token type: ${kind}`);

      const stored = await mgr.storeGithubToken(pat);
      if (stored) {
        console.log("✓ GitHub PAT stored in OS keychain");
      } else {
        console.error(
          "Keychain unavailable. Set the GITHUB_TOKEN environment variable instead:\n" +
          "  export GITHUB_TOKEN=<your-token>"
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
        console.error("No GitHub PAT stored. Run: cocapn-bridge token set <pat>");
        process.exit(1);
      }
      console.log(`Token: ${token.slice(0, 8)}...*** (${classifyGithubToken(token).kind})`);
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
        console.error("No GitHub PAT stored. Run: cocapn-bridge token set <pat>");
        process.exit(1);
      }

      console.log("Verifying token against GitHub API…");
      const result = await verifyGithubToken(token);

      if (!result.valid) {
        console.error("✗ Token is invalid or expired.");
        process.exit(1);
      }

      console.log(`✓ Valid token for @${result.login ?? "unknown"}`);
      console.log(`  Kind:   ${classifyGithubToken(token).kind}`);
      console.log(`  Scopes: ${result.scopes.join(", ") || "(fine-grained — scopes not reported)"}`);

      if (result.missingScopes.length > 0) {
        console.warn(`  ⚠ Missing recommended scopes: ${result.missingScopes.join(", ")}`);
        console.warn("  Required: repo, workflow");
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
        console.log("✓ GitHub PAT removed from keychain");
      } else {
        console.error("Could not remove from keychain (may not have been stored there).");
      }
    });

  return cmd;
}
