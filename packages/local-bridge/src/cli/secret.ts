/**
 * `cocapn-bridge secret` sub-commands.
 *
 *   secret init              — Generate age keypair, store private in keychain/file
 *   secret add <key> <value> — Encrypt value, save to secrets/<key>.age
 *   secret get <key>         — Decrypt and print (for debugging)
 *   secret rotate            — New keypair, re-encrypt all secrets
 */

import { Command } from "commander";
import { resolve } from "path";
import { SecretManager } from "../secret-manager.js";
import { maskSecrets } from "../security/audit.js";

export function buildSecretCommand(): Command {
  const cmd = new Command("secret").description("Manage age-encrypted secrets");

  // ── init ──────────────────────────────────────────────────────────────────

  cmd
    .command("init")
    .description("Generate a new age keypair and store in OS keychain (or ~/.config/cocapn/)")
    .option("--repo <path>", "Private repo root", process.cwd())
    .action(async (opts: { repo: string }) => {
      const mgr = new SecretManager(resolve(opts.repo));
      try {
        const { recipient } = await mgr.init();
        console.log("\n✓ Age keypair generated");
        console.log(`  Public key (recipient): ${recipient}`);
        console.log("  Private key: stored in OS keychain (or ~/.config/cocapn/identity.age)");
        console.log("\n  Share the public key with fleet members so they can encrypt secrets for you.");
      } catch (err) {
        console.error("Error:", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── add ───────────────────────────────────────────────────────────────────

  cmd
    .command("add <key> <value>")
    .description("Encrypt a secret value and save to secrets/<key>.age")
    .option("--repo <path>", "Private repo root", process.cwd())
    .action(async (key: string, value: string, opts: { repo: string }) => {
      const mgr = new SecretManager(resolve(opts.repo));
      await mgr.loadIdentity();
      try {
        await mgr.addSecret(key, value);
        console.log(`✓ Secret '${key}' encrypted and saved to secrets/${key}.age`);
      } catch (err) {
        console.error("Error:", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  // ── get ───────────────────────────────────────────────────────────────────

  cmd
    .command("get <key>")
    .description("Decrypt and print a secret value (for debugging only)")
    .option("--repo <path>", "Private repo root", process.cwd())
    .action(async (key: string, opts: { repo: string }) => {
      const mgr = new SecretManager(resolve(opts.repo));
      await mgr.loadIdentity();
      const value = await mgr.getSecret(key);
      if (value === undefined) {
        console.error(`Secret '${key}' not found or cannot be decrypted.`);
        process.exit(1);
      }
      // Double-check we're not printing something that looks like a private key
      console.log(maskSecrets(value));
    });

  // ── rotate ────────────────────────────────────────────────────────────────

  cmd
    .command("rotate")
    .description("Generate a new keypair and re-encrypt all secrets")
    .option("--repo <path>", "Private repo root", process.cwd())
    .action(async (opts: { repo: string }) => {
      const mgr = new SecretManager(resolve(opts.repo));
      await mgr.loadIdentity();
      try {
        const { newRecipient } = await mgr.rotate();
        console.log("\n✓ Key rotation complete");
        console.log(`  New public key: ${newRecipient}`);
        console.log("  All secrets re-encrypted. Commit the changes to propagate to fleet members.");
      } catch (err) {
        console.error("Error:", err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  return cmd;
}
