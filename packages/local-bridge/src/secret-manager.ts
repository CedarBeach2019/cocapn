/**
 * SecretManager — manages age-encrypted secrets in the private repo.
 *
 * Identity loading order:
 *   1. OS keychain (keytar) under service "cocapn", account "age-identity"
 *   2. AGE_IDENTITY environment variable (for CI/headless environments)
 *   3. ~/.config/cocapn/identity.age file as last resort (mode 0600)
 *
 * Decrypted values are cached in memory and never written to disk.
 * The secrets/ directory contains files encrypted with age.
 *
 * Public key (recipient) is stored in cocapn/age-recipients.txt for other
 * fleet members to encrypt secrets for this instance.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  chmodSync,
} from "fs";
import { join, resolve } from "path";
import { homedir } from "os";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const KEYCHAIN_SERVICE = "cocapn";
const KEYCHAIN_ACCOUNT_IDENTITY = "age-identity";
const KEYCHAIN_ACCOUNT_GITHUB = "github-token";
const FALLBACK_IDENTITY_DIR  = join(homedir(), ".config", "cocapn");
const FALLBACK_IDENTITY_PATH = join(FALLBACK_IDENTITY_DIR, "identity.age");
const RECIPIENTS_FILE = "cocapn/age-recipients.txt";

// ─── Age module type ──────────────────────────────────────────────────────────

interface AgeEncryption {
  Encrypter: new () => {
    addRecipient(recipient: string): void;
    encrypt(data: string | Uint8Array, format: "uint8array"): Uint8Array;
  };
  Decrypter: new () => {
    addIdentity(identity: string): void;
    decrypt(data: Uint8Array, format: "text"): string;
  };
  generateIdentity(): string;
  identityToRecipient(identity: string): string;
}

// ─── Keytar type ──────────────────────────────────────────────────────────────

interface KeytarLike {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

// ─── SecretManager ────────────────────────────────────────────────────────────

export class SecretManager {
  private repoRoot: string;
  /** In-memory cache: key → decrypted value. Never persisted to disk. */
  private cache = new Map<string, string>();
  private identity: string | null = null;
  private recipient: string | null = null;
  private ageModule: AgeEncryption | null = null;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  // ── Identity management ───────────────────────────────────────────────────

  /**
   * Load the age identity from keychain → env → fallback file.
   * Must be called before getSecret() or any encryption operation.
   */
  async loadIdentity(): Promise<void> {
    const keychainIdentity = await this.loadFromKeychain(KEYCHAIN_ACCOUNT_IDENTITY);
    if (keychainIdentity) {
      this.identity = keychainIdentity;
      console.info("[secrets] Loaded age identity from OS keychain");
      this.recipient = await this.deriveRecipient(keychainIdentity);
      return;
    }

    const envIdentity = process.env["AGE_IDENTITY"];
    if (envIdentity) {
      this.identity = envIdentity;
      console.info("[secrets] Loaded age identity from AGE_IDENTITY env var");
      this.recipient = await this.deriveRecipient(envIdentity);
      return;
    }

    if (existsSync(FALLBACK_IDENTITY_PATH)) {
      this.identity = readFileSync(FALLBACK_IDENTITY_PATH, "utf8").trim();
      console.info(`[secrets] Loaded age identity from ${FALLBACK_IDENTITY_PATH}`);
      this.recipient = await this.deriveRecipient(this.identity);
      return;
    }

    console.warn("[secrets] No age identity found — secrets will not be decryptable");
  }

  /**
   * Initialise a new age keypair.
   *   1. Generates identity + recipient
   *   2. Stores identity in OS keychain (or fallback file at ~/.config/cocapn/identity.age)
   *   3. Writes public key to cocapn/age-recipients.txt
   *   4. Updates cocapn/config.yml encryption.publicKey field
   * Returns the public key (recipient).
   */
  async init(): Promise<{ identity: string; recipient: string }> {
    const age = await this.loadAgeModule();
    const identity  = age.generateIdentity();
    const recipient = age.identityToRecipient(identity);

    // Store private key
    const stored = await this.storeIdentityInKeychain(identity);
    if (!stored) {
      // Fallback: write to ~/.config/cocapn/identity.age with 0600
      mkdirSync(FALLBACK_IDENTITY_DIR, { recursive: true });
      writeFileSync(FALLBACK_IDENTITY_PATH, identity + "\n", { mode: 0o600 });
      console.info(`[secrets] Identity stored at ${FALLBACK_IDENTITY_PATH} (mode 0600)`);
    }

    // Write public key to repo
    const recipientsPath = join(this.repoRoot, RECIPIENTS_FILE);
    mkdirSync(join(this.repoRoot, "cocapn"), { recursive: true });
    writeFileSync(recipientsPath, recipient + "\n", "utf8");
    console.info(`[secrets] Public key written to ${RECIPIENTS_FILE}`);

    // Update config.yml
    this.updateConfigPublicKey(recipient);

    this.identity  = identity;
    this.recipient = recipient;
    return { identity, recipient };
  }

  /**
   * Encrypt a value and write to secrets/<key>.age
   * The plaintext written is: "<KEY>=<value>\n" so the env-line parser picks it up.
   */
  async addSecret(key: string, value: string): Promise<void> {
    const recipient = this.recipient ?? this.readRecipientsFile();
    if (!recipient) {
      throw new Error("COCAPN-030: No public key configured - Initialize age encryption with: cocapn-bridge secret init");
    }

    const age       = await this.loadAgeModule();
    const encrypter = new age.Encrypter();
    encrypter.addRecipient(recipient);
    const ciphertext = encrypter.encrypt(`${key}=${value}\n`, "uint8array");

    const secretsDir = join(this.repoRoot, "secrets");
    mkdirSync(secretsDir, { recursive: true });
    writeFileSync(join(secretsDir, `${key}.age`), ciphertext);

    // Invalidate cache entry so next getSecret() re-reads from disk
    this.cache.delete(key);
    console.info(`[secrets] Encrypted secret stored: secrets/${key}.age`);
  }

  /**
   * Rotate to a new keypair:
   *   1. Decrypts all existing secrets with the current identity
   *   2. Generates a new keypair
   *   3. Re-encrypts all secrets with the new public key
   *   4. Stores the new identity in keychain/file
   */
  async rotate(): Promise<{ newRecipient: string }> {
    // Ensure we can decrypt first
    if (!this.identity) await this.loadIdentity();
    if (!this.identity) throw new Error("COCAPN-031: Cannot rotate: no current identity loaded - Load your identity first with: cocapn-bridge secret load");

    // Decrypt all secrets into memory
    await this.loadSecretsDirectory();
    const allSecrets = new Map(this.cache);

    // Generate new identity
    const age           = await this.loadAgeModule();
    const newIdentity   = age.generateIdentity();
    const newRecipient  = age.identityToRecipient(newIdentity);

    // Re-encrypt each secret
    const secretsDir = join(this.repoRoot, "secrets");
    if (existsSync(secretsDir)) {
      const files = readdirSync(secretsDir).filter((f) => f.endsWith(".age"));
      for (const file of files) {
        // Reconstruct the key name from the filename
        const key   = file.replace(/\.age$/, "");
        const value = allSecrets.get(key);
        if (value === undefined) continue;

        const encrypter = new age.Encrypter();
        encrypter.addRecipient(newRecipient);
        const ciphertext = encrypter.encrypt(`${key}=${value}\n`, "uint8array");
        writeFileSync(join(secretsDir, file), ciphertext);
      }
    }

    // Store new identity
    const stored = await this.storeIdentityInKeychain(newIdentity);
    if (!stored) {
      mkdirSync(FALLBACK_IDENTITY_DIR, { recursive: true });
      writeFileSync(FALLBACK_IDENTITY_PATH, newIdentity + "\n", { mode: 0o600 });
    }

    // Update recipients file + config
    const recipientsPath = join(this.repoRoot, RECIPIENTS_FILE);
    writeFileSync(recipientsPath, newRecipient + "\n", "utf8");
    this.updateConfigPublicKey(newRecipient);

    // Refresh in-memory state
    this.identity  = newIdentity;
    this.recipient = newRecipient;
    this.cache.clear();

    console.info("[secrets] Key rotation complete. New public key written.");
    return { newRecipient };
  }

  /**
   * Store an age identity string in the OS keychain.
   * Returns true on success, false if keytar is unavailable.
   */
  async storeIdentityInKeychain(identity: string): Promise<boolean> {
    const keytar = await this.tryImportKeytar();
    if (!keytar) return false;
    try {
      await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_IDENTITY, identity);
      console.info("[secrets] Stored age identity in OS keychain");
      return true;
    } catch {
      return false;
    }
  }

  // ── GitHub token management ───────────────────────────────────────────────

  /**
   * Store a GitHub PAT in the OS keychain.
   * Never stored in cocapn.yml or any file in the repo.
   */
  async storeGithubToken(token: string): Promise<boolean> {
    const keytar = await this.tryImportKeytar();
    if (!keytar) {
      // Fallback: environment variable hint
      console.warn("[secrets] Keychain unavailable. Set GITHUB_TOKEN env var instead.");
      return false;
    }
    try {
      await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_GITHUB, token);
      console.info("[secrets] GitHub PAT stored in OS keychain");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Retrieve the GitHub PAT from keychain, then GITHUB_TOKEN env var.
   * Never reads from any file in the repo.
   */
  async getGithubToken(): Promise<string | undefined> {
    const fromKeychain = await this.loadFromKeychain(KEYCHAIN_ACCOUNT_GITHUB);
    if (fromKeychain) return fromKeychain;
    return process.env["GITHUB_TOKEN"] ?? undefined;
  }

  async deleteGithubToken(): Promise<boolean> {
    const keytar = await this.tryImportKeytar();
    if (!keytar) return false;
    try {
      return await keytar.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_GITHUB);
    } catch {
      return false;
    }
  }

  // ── Secret access ─────────────────────────────────────────────────────────

  /**
   * Get a secret by key. Decrypts on demand, caches result in memory.
   */
  async getSecret(key: string): Promise<string | undefined> {
    if (this.cache.has(key)) return this.cache.get(key);
    if (!this.identity) {
      console.warn("[secrets] Cannot decrypt — no identity loaded");
      return undefined;
    }
    await this.loadSecretsDirectory();
    return this.cache.get(key);
  }

  async hasSecret(key: string): Promise<boolean> {
    return (await this.getSecret(key)) !== undefined;
  }

  /** Expose the loaded public key (recipient) for other components. */
  getRecipient(): string | null {
    return this.recipient ?? this.readRecipientsFile();
  }

  /** Clear in-memory cache (e.g. after rotation). */
  clearCache(): void {
    this.cache.clear();
  }

  // ── Encryption helper (for FleetKeyManager) ───────────────────────────────

  /**
   * Encrypt arbitrary plaintext with the current public key.
   * Used by FleetKeyManager to encrypt the fleet key.
   */
  async encrypt(plaintext: string): Promise<Uint8Array> {
    const recipient = this.recipient ?? this.readRecipientsFile();
    if (!recipient) throw new Error("COCAPN-032: No public key - Initialize age encryption to encrypt secrets for fleet members: cocapn-bridge secret init");
    const age       = await this.loadAgeModule();
    const encrypter = new age.Encrypter();
    encrypter.addRecipient(recipient);
    return encrypter.encrypt(plaintext, "uint8array");
  }

  /**
   * Decrypt ciphertext with the current identity.
   */
  async decrypt(ciphertext: Uint8Array): Promise<string> {
    if (!this.identity) throw new Error("COCAPN-033: No identity loaded - Load your age identity with: cocapn-bridge secret load");
    const age       = await this.loadAgeModule();
    const decrypter = new age.Decrypter();
    decrypter.addIdentity(this.identity);
    return decrypter.decrypt(ciphertext, "text");
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async loadSecretsDirectory(): Promise<void> {
    const secretsDir = join(this.repoRoot, "secrets");
    if (!existsSync(secretsDir)) return;

    let files: string[];
    try {
      files = readdirSync(secretsDir).filter((f) => f.endsWith(".age"));
    } catch { return; }

    for (const file of files) {
      await this.decryptFileIntoCache(join(secretsDir, file));
    }
  }

  private async decryptFileIntoCache(filePath: string): Promise<void> {
    if (!this.identity) return;
    try {
      const age       = await this.loadAgeModule();
      const decrypter = new age.Decrypter();
      decrypter.addIdentity(this.identity);
      const plaintext = decrypter.decrypt(new Uint8Array(readFileSync(filePath)), "text");
      this.parseEnvLines(plaintext);
    } catch (err) {
      console.warn(`[secrets] Failed to decrypt ${filePath}:`, err);
    }
  }

  private parseEnvLines(content: string): void {
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key   = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key) this.cache.set(key, value);
    }
  }

  private async deriveRecipient(identity: string): Promise<string | null> {
    try {
      const age = await this.loadAgeModule();
      return age.identityToRecipient(identity);
    } catch {
      return null;
    }
  }

  private readRecipientsFile(): string | null {
    const p = join(this.repoRoot, RECIPIENTS_FILE);
    if (!existsSync(p)) return null;
    const content = readFileSync(p, "utf8").trim();
    // First non-comment line
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (t && !t.startsWith("#")) return t;
    }
    return null;
  }

  private updateConfigPublicKey(recipient: string): void {
    const configPath = join(this.repoRoot, "cocapn", "config.yml");
    if (!existsSync(configPath)) return;
    try {
      const raw = parseYaml(readFileSync(configPath, "utf8")) as Record<string, unknown>;
      const enc = (raw["encryption"] ?? {}) as Record<string, unknown>;
      enc["publicKey"] = recipient;
      raw["encryption"] = enc;
      writeFileSync(configPath, stringifyYaml(raw), "utf8");
    } catch { /* non-fatal */ }
  }

  private async loadFromKeychain(account: string): Promise<string | null> {
    const keytar = await this.tryImportKeytar();
    if (!keytar) return null;
    try {
      return await keytar.getPassword(KEYCHAIN_SERVICE, account);
    } catch {
      return null;
    }
  }

  private async loadAgeModule(): Promise<AgeEncryption> {
    if (this.ageModule) return this.ageModule;
    const { default: initAge } = await import("age-encryption") as {
      default: () => Promise<AgeEncryption>;
    };
    this.ageModule = await initAge();
    return this.ageModule;
  }

  private async tryImportKeytar(): Promise<KeytarLike | null> {
    try {
      const mod = await import("keytar");
      return (mod.default ?? mod) as unknown as KeytarLike;
    } catch {
      return null;
    }
  }
}
