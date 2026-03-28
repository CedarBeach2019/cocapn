/**
 * Tests for the security layer:
 *   - JWT sign/verify/expiry
 *   - AuditLogger + secret masking
 *   - SecretManager: age encrypt/decrypt roundtrip
 *   - FleetKeyManager: generate + load
 *   - Domain verification (mocked)
 *   - filterEnv: agent env sandboxing
 *   - GitHub token classification
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { signJwt, verifyJwt, generateJwtSecret, decodeJwtPayload } from "../src/security/jwt.js";
import { AuditLogger, maskSecrets } from "../src/security/audit.js";
import { FleetKeyManager } from "../src/security/fleet.js";
import { classifyGithubToken } from "../src/security/fleet.js";
import { SecretManager } from "../src/secret-manager.js";
import { filterEnv } from "../src/agents/spawner.js";

// ─── JWT tests ────────────────────────────────────────────────────────────────

describe("JWT", () => {
  const secret = generateJwtSecret();

  it("sign + verify roundtrip", () => {
    const token   = signJwt({ sub: "test-user" }, secret);
    const payload = verifyJwt(token, secret);
    expect(payload.sub).toBe("test-user");
    expect(payload.iss).toBe("cocapn");
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects wrong secret", () => {
    const token = signJwt({ sub: "user" }, secret);
    expect(() => verifyJwt(token, "wrong-secret")).toThrow("bad signature");
  });

  it("rejects expired token", () => {
    // ttl = -1 → already expired
    const token = signJwt({ sub: "user" }, secret, { ttlSeconds: -1 });
    expect(() => verifyJwt(token, secret)).toThrow("expired");
  });

  it("rejects tampered payload", () => {
    const token  = signJwt({ sub: "user" }, secret);
    const parts  = token.split(".");
    // Replace payload with a different one
    const tampered = Buffer.from(JSON.stringify({ sub: "admin", iss: "cocapn", iat: 1, exp: 9999999999 })).toString("base64url");
    const bad = `${parts[0]}.${tampered}.${parts[2]}`;
    expect(() => verifyJwt(bad, secret)).toThrow("bad signature");
  });

  it("rejects wrong issuer", async () => {
    const payload = {
      sub: "user", iss: "evil", iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const body  = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const hdr   = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const data  = `${hdr}.${body}`;
    const { createHmac } = await import("node:crypto");
    const sig   = createHmac("sha256", secret).update(data).digest().toString("base64url");
    const token = `${data}.${sig}`;
    expect(() => verifyJwt(token, secret)).toThrow("issuer");
  });

  it("embeds domain when provided", () => {
    const token   = signJwt({ sub: "user" }, secret, { domain: "test.cocapn.io" });
    const payload = verifyJwt(token, secret);
    expect(payload.dom).toBe("test.cocapn.io");
  });

  it("decodeJwtPayload returns payload without verifying", () => {
    const token   = signJwt({ sub: "peek" }, secret);
    const payload = decodeJwtPayload(token);
    expect(payload?.sub).toBe("peek");
  });

  it("decodeJwtPayload returns undefined for garbage", () => {
    expect(decodeJwtPayload("not.a.token")).toBeUndefined();
  });
});

// ─── AuditLogger tests ────────────────────────────────────────────────────────

describe("AuditLogger", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), "cocapn-audit-"));
    mkdirSync(join(repoDir, "cocapn"), { recursive: true });
  });
  afterEach(() => { rmSync(repoDir, { recursive: true, force: true }); });

  it("creates audit.log on first write", () => {
    const logger = new AuditLogger(repoDir);
    logger.log({ action: "bash.exec", agent: undefined, user: "alice",
      command: "ls -la", files: undefined, result: "ok", durationMs: 10 });

    const logPath = join(repoDir, "cocapn", "audit.log");
    expect(existsSync(logPath)).toBe(true);
    const line = JSON.parse(readFileSync(logPath, "utf8").trim());
    expect(line.action).toBe("bash.exec");
    expect(line.user).toBe("alice");
    expect(line.result).toBe("ok");
  });

  it("appends multiple entries", () => {
    const logger = new AuditLogger(repoDir);
    logger.log({ action: "file.edit", agent: undefined, user: undefined,
      command: undefined, files: ["test.md"], result: "ok", durationMs: 5 });
    logger.log({ action: "file.commit", agent: undefined, user: undefined,
      command: undefined, files: ["test.md"], result: "ok", durationMs: 12 });

    const lines = readFileSync(join(repoDir, "cocapn", "audit.log"), "utf8")
      .trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
  });

  it("masks secret values in commands", () => {
    const logger = new AuditLogger(repoDir);
    logger.log({ action: "bash.exec", agent: undefined, user: undefined,
      command: "export API_KEY=sk-super-secret-12345 && do-thing",
      files: undefined, result: "ok", durationMs: 1 });

    const line = JSON.parse(readFileSync(join(repoDir, "cocapn", "audit.log"), "utf8").trim());
    expect(line.command).not.toContain("sk-super-secret-12345");
    expect(line.command).toContain("***");
  });

  it("masks Bearer tokens in detail", () => {
    const logger = new AuditLogger(repoDir);
    logger.log({ action: "auth.connect", agent: undefined, user: undefined,
      command: undefined, files: undefined, result: "ok",
      detail: "Bearer ghp_abcdefghijklmnopqrstuvwxyz0123456789", durationMs: undefined });

    const line = JSON.parse(readFileSync(join(repoDir, "cocapn", "audit.log"), "utf8").trim());
    expect(line.detail).toContain("Bearer ***");
    expect(line.detail).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz");
  });

  it("start() records duration", async () => {
    const logger = new AuditLogger(repoDir);
    const finish = logger.start({ action: "bash.exec", agent: undefined, user: undefined,
      command: "sleep 0", files: undefined });
    await new Promise((r) => setTimeout(r, 5));
    finish("ok");

    const line = JSON.parse(readFileSync(join(repoDir, "cocapn", "audit.log"), "utf8").trim());
    expect(line.durationMs).toBeGreaterThanOrEqual(0);
    expect(line.result).toBe("ok");
  });

  it("never throws even if log dir is unwritable (non-fatal)", () => {
    const logger = new AuditLogger("/nonexistent/path/that/does/not/exist", true);
    expect(() => logger.log({ action: "bash.exec", agent: undefined, user: undefined,
      command: "x", files: undefined, result: "ok", durationMs: 0 })).not.toThrow();
  });

  it("disabled logger writes nothing", () => {
    const logger = new AuditLogger(repoDir, false);
    logger.log({ action: "bash.exec", agent: undefined, user: undefined,
      command: "x", files: undefined, result: "ok", durationMs: 0 });
    expect(existsSync(join(repoDir, "cocapn", "audit.log"))).toBe(false);
  });
});

// ─── maskSecrets tests ────────────────────────────────────────────────────────

describe("maskSecrets", () => {
  it("masks KEY=value where key contains SECRET", () => {
    expect(maskSecrets("API_SECRET=hunter2 other")).not.toContain("hunter2");
  });

  it("masks age identity strings", () => {
    const id = "AGE-SECRET-KEY-1abcdefgh12345";
    expect(maskSecrets(id)).toContain("***");
    expect(maskSecrets(id)).not.toContain("abcdefgh12345");
  });

  it("masks GitHub PATs", () => {
    const pat = "ghp_" + "a".repeat(40);
    expect(maskSecrets(pat)).toBe("ghp_***");
  });

  it("leaves normal text alone", () => {
    expect(maskSecrets("hello world")).toBe("hello world");
  });

  it("masks Bearer token", () => {
    expect(maskSecrets("Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig")).toContain("Bearer ***");
  });
});

// ─── SecretManager age roundtrip ──────────────────────────────────────────────

describe("SecretManager", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), "cocapn-secrets-"));
    mkdirSync(join(repoDir, "cocapn"), { recursive: true });
    mkdirSync(join(repoDir, "secrets"), { recursive: true });
  });
  afterEach(() => { rmSync(repoDir, { recursive: true, force: true }); });

  it("init() generates keypair and writes recipients file", async () => {
    const mgr = new SecretManager(repoDir);
    const { identity, recipient } = await mgr.init();

    expect(identity).toMatch(/^AGE-SECRET-KEY-1/);
    expect(recipient).toMatch(/^age1/);

    const recipientsPath = join(repoDir, "cocapn", "age-recipients.txt");
    expect(existsSync(recipientsPath)).toBe(true);
    expect(readFileSync(recipientsPath, "utf8").trim()).toBe(recipient);
  });

  it("addSecret() + getSecret() roundtrip", async () => {
    const mgr = new SecretManager(repoDir);
    await mgr.init();
    await mgr.loadIdentity();

    await mgr.addSecret("MY_TOKEN", "super-secret-value");
    const value = await mgr.getSecret("MY_TOKEN");
    expect(value).toBe("super-secret-value");
  });

  it("getSecret() returns undefined when no identity", async () => {
    const mgr = new SecretManager(repoDir);
    const value = await mgr.getSecret("ANYTHING");
    expect(value).toBeUndefined();
  });

  it("addSecret() writes an .age file", async () => {
    const mgr = new SecretManager(repoDir);
    await mgr.init();
    await mgr.loadIdentity();
    await mgr.addSecret("PERPLEXITY_API_KEY", "pplx-test");

    expect(existsSync(join(repoDir, "secrets", "PERPLEXITY_API_KEY.age"))).toBe(true);
  });

  it("rotate() re-encrypts secrets with new key", async () => {
    const mgr = new SecretManager(repoDir);
    await mgr.init();
    await mgr.loadIdentity();
    await mgr.addSecret("DB_PASS", "oldpass");

    const { newRecipient } = await mgr.rotate();
    expect(newRecipient).toMatch(/^age1/);

    // After rotation, the secret should still be readable with the new identity
    const value = await mgr.getSecret("DB_PASS");
    expect(value).toBe("oldpass");
  });

  it("encrypt() + decrypt() roundtrip", async () => {
    const mgr = new SecretManager(repoDir);
    await mgr.init();
    await mgr.loadIdentity();

    const ct = await mgr.encrypt("fleet-secret-data");
    const pt = await mgr.decrypt(ct);
    expect(pt).toBe("fleet-secret-data");
  });

  it("getRecipient() returns the public key after init", async () => {
    const mgr = new SecretManager(repoDir);
    const { recipient } = await mgr.init();
    expect(mgr.getRecipient()).toBe(recipient);
  });
});

// ─── FleetKeyManager tests ────────────────────────────────────────────────────

describe("FleetKeyManager", () => {
  let repoDir: string;

  beforeEach(() => {
    repoDir = mkdtempSync(join(tmpdir(), "cocapn-fleet-"));
    mkdirSync(join(repoDir, "cocapn"), { recursive: true });
    mkdirSync(join(repoDir, "secrets"), { recursive: true });
  });
  afterEach(() => { rmSync(repoDir, { recursive: true, force: true }); });

  it("generateAndStore() + load() roundtrip", async () => {
    const secretsMgr = new SecretManager(repoDir);
    await secretsMgr.init();
    await secretsMgr.loadIdentity();
    const recipient = secretsMgr.getRecipient()!;

    const fleetMgr = new FleetKeyManager(repoDir);

    const key = await fleetMgr.generateAndStore(
      recipient,
      (pt, rec) => secretsMgr.encrypt(pt)
    );

    expect(key).toMatch(/^[0-9a-f]{64}$/);

    // Load it back
    fleetMgr.clearCache();
    const loaded = await fleetMgr.load((ct) => secretsMgr.decrypt(ct));
    expect(loaded).toBe(key);
  });

  it("load() returns undefined when fleet-key.age absent", async () => {
    const fleetMgr = new FleetKeyManager(repoDir);
    const key = await fleetMgr.load(async () => "plaintext");
    expect(key).toBeUndefined();
  });

  it("signToken() + verifyToken() roundtrip", () => {
    const fleetMgr = new FleetKeyManager(repoDir);
    const key   = generateJwtSecret();
    const token = fleetMgr.signToken("bridge-1", key, 60);
    const p     = fleetMgr.verifyToken(token, key);
    expect(p.sub).toBe("bridge-1");
  });
});

// ─── filterEnv tests ─────────────────────────────────────────────────────────

describe("filterEnv", () => {
  it("passes through COCAPN_* vars", () => {
    const env = filterEnv(
      { COCAPN_SOUL: "soul", SECRET_API_KEY: "secret", PATH: "/usr/bin" },
      {}
    );
    expect(env["COCAPN_SOUL"]).toBe("soul");
    expect(env["PATH"]).toBe("/usr/bin");
    expect(env["SECRET_API_KEY"]).toBeUndefined();
  });

  it("always passes agent's own env vars", () => {
    const env = filterEnv({}, { MY_CUSTOM_VAR: "value" });
    expect(env["MY_CUSTOM_VAR"]).toBe("value");
  });

  it("excludes sensitive host env vars", () => {
    const env = filterEnv({
      AWS_ACCESS_KEY_ID: "AKIA...",
      AWS_SECRET_ACCESS_KEY: "secret",
      OPENAI_API_KEY: "sk-...",
      GITHUB_TOKEN: "ghp_...",
      PATH: "/usr/bin",
    }, {});
    expect(env["AWS_ACCESS_KEY_ID"]).toBeUndefined();
    expect(env["AWS_SECRET_ACCESS_KEY"]).toBeUndefined();
    expect(env["OPENAI_API_KEY"]).toBeUndefined();
    expect(env["GITHUB_TOKEN"]).toBeUndefined();
    expect(env["PATH"]).toBe("/usr/bin");
  });

  it("agent env overrides parent env", () => {
    const env = filterEnv({ COCAPN_SOUL: "old" }, { COCAPN_SOUL: "new" });
    expect(env["COCAPN_SOUL"]).toBe("new");
  });
});

// ─── GitHub token classification ──────────────────────────────────────────────

describe("classifyGithubToken", () => {
  it("classifies classic ghp_ tokens", () => {
    expect(classifyGithubToken("ghp_abcdef").kind).toBe("classic");
  });

  it("classifies fine-grained github_pat_ tokens", () => {
    expect(classifyGithubToken("github_pat_abc").kind).toBe("fine-grained");
  });

  it("classifies gho_ OAuth tokens as classic", () => {
    expect(classifyGithubToken("gho_abc").kind).toBe("classic");
  });

  it("returns unknown for unrecognised format", () => {
    expect(classifyGithubToken("Bearer abc").kind).toBe("unknown");
  });
});
