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
        console.log(`\n${green("✓")} Age keypair generated`);
        console.log(`  ${cyan("Public key (recipient):")} ${recipient}`);
        console.log(`  ${dim("Private key: stored in OS keychain (or ~/.config/cocapn/identity.age)")}`);
        console.log(`\n  ${dim("Share the public key with fleet members so they can encrypt secrets for you.")}`);
      } catch (err) {
        console.error(`${red("Error:")} ${err instanceof Error ? err.message : String(err)}`);
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
        console.log(`${green("✓")} Secret ${cyan(`'${key}'`)} encrypted and saved to ${dim(`secrets/${key}.age`)}`);
      } catch (err) {
        console.error(`${red("Error:")} ${err instanceof Error ? err.message : String(err)}`);
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
        console.error(`${red("Error:")} Secret ${cyan(`'${key}'`)} not found or cannot be decrypted.`);
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
        console.log(`\n${green("✓")} Key rotation complete`);
        console.log(`  ${cyan("New public key:")} ${newRecipient}`);
        console.log(`  ${dim("All secrets re-encrypted. Commit the changes to propagate to fleet members.")}`);
      } catch (err) {
        console.error(`${red("Error:")} ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  return cmd;
}
