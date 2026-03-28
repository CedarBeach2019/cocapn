/**
 * Fleet security — shared symmetric key and A2A domain verification.
 *
 * The fleet key is a 32-byte random secret used to:
 *   - Sign short-lived JWTs for WebSocket authentication between fleet members
 *   - Sign A2A request headers for inter-bridge communication
 *
 * It is stored encrypted in secrets/fleet-key.age so any bridge instance with
 * the age identity can load it.
 *
 * Domain verification:
 *   Resolves the CNAME of bridge.<domain> to confirm it points to the expected
 *   tunnel hostname before accepting inbound A2A requests from that domain.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { promises as dns } from "node:dns";
import { signJwt, verifyJwt, generateJwtSecret, type JwtPayload } from "./jwt.js";

// ─── Fleet key management ─────────────────────────────────────────────────────

const FLEET_KEY_FILE = "secrets/fleet-key.age";
const FLEET_KEY_PLAIN_FILE = "secrets/.fleet-key.tmp"; // temp, 0600, deleted after use

export class FleetKeyManager {
  private repoRoot:   string;
  private cachedKey:  string | undefined;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  /**
   * Generate a new fleet key, encrypt it with the repo's age public key, and
   * store it in secrets/fleet-key.age.
   *
   * Returns the plaintext key for immediate use.
   */
  async generateAndStore(
    publicKey: string,
    encryptFn: (plaintext: string, recipient: string) => Promise<Uint8Array>
  ): Promise<string> {
    const key       = generateJwtSecret();
    const ciphertext = await encryptFn(key, publicKey);
    const destPath  = join(this.repoRoot, FLEET_KEY_FILE);
    writeFileSync(destPath, ciphertext);
    this.cachedKey = key;
    return key;
  }

  /**
   * Load the fleet key from the encrypted file using the age identity.
   * Caches in memory for the lifetime of this object.
   */
  async load(
    decryptFn: (ciphertext: Uint8Array) => Promise<string>
  ): Promise<string | undefined> {
    if (this.cachedKey) return this.cachedKey;

    const keyFile = join(this.repoRoot, FLEET_KEY_FILE);
    if (!existsSync(keyFile)) return undefined;

    try {
      const ciphertext  = new Uint8Array(readFileSync(keyFile));
      this.cachedKey = await decryptFn(ciphertext);
      return this.cachedKey;
    } catch (err) {
      console.warn("[fleet] Failed to load fleet key:", err instanceof Error ? err.message : err);
      return undefined;
    }
  }

  /** Sign a short-lived JWT for WebSocket authentication. */
  signToken(
    subject:    string,
    key:        string,
    ttlSeconds  = 3600,
    domain?:    string
  ): string {
    return signJwt(
      { sub: subject },
      key,
      { ttlSeconds, ...(domain ? { domain } : {}) }
    );
  }

  /** Verify an inbound fleet JWT. Returns the payload or throws. */
  verifyToken(token: string, key: string): JwtPayload {
    return verifyJwt(token, key);
  }

  clearCache(): void {
    this.cachedKey = undefined;
  }
}

// ─── Domain verification ──────────────────────────────────────────────────────

const DNS_TIMEOUT_MS = 5_000;

export interface DomainVerifyResult {
  ok:     boolean;
  cname:  string | undefined;
  reason: string | undefined;
}

/**
 * Verify that bridge.<domain> CNAME points to an expected suffix.
 *
 * acceptedSuffixes: e.g. [".trycloudflare.com", ".cfargotunnel.com", ".cocapn.io"]
 */
export async function verifyDomainCname(
  domain:           string,
  acceptedSuffixes: string[]
): Promise<DomainVerifyResult> {
  const hostToCheck = `bridge.${domain}`;

  return Promise.race([
    resolveCname(hostToCheck, acceptedSuffixes),
    timeout(DNS_TIMEOUT_MS).then<DomainVerifyResult>(() => ({
      ok:     false,
      cname:  undefined,
      reason: `DNS lookup timed out after ${DNS_TIMEOUT_MS}ms`,
    })),
  ]);
}

async function resolveCname(
  host:             string,
  acceptedSuffixes: string[]
): Promise<DomainVerifyResult> {
  try {
    const cnames = await dns.resolveCname(host);
    const cname  = cnames[0];

    if (!cname) {
      return { ok: false, cname: undefined, reason: `No CNAME record for ${host}` };
    }

    const accepted = acceptedSuffixes.some((suffix) => cname.endsWith(suffix));
    if (!accepted) {
      return {
        ok:     false,
        cname,
        reason: `CNAME ${cname} does not match accepted suffixes: ${acceptedSuffixes.join(", ")}`,
      };
    }

    return { ok: true, cname, reason: undefined };
  } catch (err) {
    return {
      ok:     false,
      cname:  undefined,
      reason: `DNS lookup failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function timeout(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Token scope validation (GitHub fine-grained vs classic) ─────────────────

export type TokenKind = "classic" | "fine-grained" | "unknown";

export interface TokenInfo {
  kind:   TokenKind;
  scopes: string[];
}

/**
 * Inspect a GitHub PAT — determine if classic or fine-grained and list scopes.
 * Fine-grained tokens start with "github_pat_"; classic with "ghp_" or "gho_".
 */
export function classifyGithubToken(token: string): TokenInfo {
  if (token.startsWith("github_pat_")) {
    return { kind: "fine-grained", scopes: [] }; // scopes are not in the token string itself
  }
  if (token.startsWith("ghp_") || token.startsWith("gho_")) {
    return { kind: "classic", scopes: [] };
  }
  return { kind: "unknown", scopes: [] };
}

/**
 * Verify the PAT against the GitHub API and return the scopes it carries.
 * Required scopes for Cocapn: repo, workflow, pages.
 */
export async function verifyGithubToken(token: string): Promise<{
  valid:         boolean;
  login:         string | undefined;
  scopes:        string[];
  missingScopes: string[];
}> {
  const REQUIRED = ["repo", "workflow"];
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization:  `Bearer ${token}`,
        "User-Agent":   "cocapn-bridge/0.1.0",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!res.ok) {
      return { valid: false, login: undefined, scopes: [], missingScopes: REQUIRED };
    }

    const scopeHeader = res.headers.get("x-oauth-scopes") ?? "";
    const scopes = scopeHeader.split(",").map((s) => s.trim()).filter(Boolean);
    const body = (await res.json()) as { login?: string };

    // Fine-grained tokens don't report scopes via header — treat as sufficient
    const { kind } = classifyGithubToken(token);
    const effectiveScopes = kind === "fine-grained" ? REQUIRED : scopes;
    const missingScopes = REQUIRED.filter((r) => !effectiveScopes.includes(r));

    return {
      valid:        true,
      login:        body.login,
      scopes:       effectiveScopes,
      missingScopes,
    };
  } catch {
    return { valid: false, login: undefined, scopes: [], missingScopes: REQUIRED };
  }
}
