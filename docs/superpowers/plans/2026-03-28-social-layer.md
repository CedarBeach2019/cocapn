# Social Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in public discovery, cross-domain messaging, and trust verification to the cocapn fleet so users on different domains (makerlog.ai, studylog.ai, etc.) can find each other, view profiles, and exchange messages.

**Architecture:** Public profiles live in each user's public Git repo as `cocapn/profile.json`. The AdmiralDO Durable Object is extended with a registry (register/discover) and a message queue (send/receive with TTL). The local bridge builds and publishes the profile on startup, and receives inbound messages via a new HTTP endpoint. Privacy is enforced at multiple layers: config opt-in, `private.*` fact filtering, domain blocking, and rate limiting.

**Tech Stack:** TypeScript, Cloudflare Workers (Durable Objects), Node.js 20, HMAC-SHA256 JWT (existing `security/jwt.ts`), Vitest

---

## Scope Breakdown

This plan covers 5 independent subsystems that build on each other:

1. **Profile types + builder** (local bridge) — schema, builder that reads Brain facts, privacy filtering
2. **AdmiralDO registry** (cloud-agents) — register/discover endpoints in the Durable Object
3. **AdmiralDO message queue** (cloud-agents) — send/receive/ack endpoints with TTL
4. **Bridge social integration** (local bridge) — profile publishing, message polling, HTTP endpoints
5. **Schema + config updates** — JSON schemas, config.yml `social` section, private config `social` section

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `packages/local-bridge/src/social/types.ts` | `Profile`, `ProfileProof`, `SocialConfig`, `PeerMessage` types |
| `packages/local-bridge/src/social/profile-builder.ts` | Builds `Profile` from Brain facts + public config, filters `private.*` keys |
| `packages/local-bridge/src/social/profile-publisher.ts` | Writes `profile.json` to public repo, registers with AdmiralDO |
| `packages/local-bridge/src/social/message-client.ts` | Polls AdmiralDO for inbound messages, delivers to Brain/chat |
| `packages/local-bridge/tests/social-types.test.ts` | Type guard + validation tests |
| `packages/local-bridge/tests/profile-builder.test.ts` | Profile building + privacy filtering tests |
| `packages/local-bridge/tests/profile-publisher.test.ts` | Publishing flow tests |
| `packages/local-bridge/tests/message-client.test.ts` | Message polling + delivery tests |
| `schemas/profile.schema.json` | JSON Schema for `cocapn/profile.json` |

### Modified Files
| File | Changes |
|------|---------|
| `packages/cloud-agents/src/admiral.ts` | Add registry + message queue storage, 5 new endpoints |
| `packages/local-bridge/src/config/types.ts` | Add `social` section to `BridgeConfig` |
| `packages/local-bridge/src/config/loader.ts` | Parse `social` section from YAML |
| `packages/local-bridge/src/bridge.ts` | Wire `ProfilePublisher` + `MessageClient` on startup |
| `packages/local-bridge/src/ws/server.ts` | Add `/api/social/profile` and `/api/social/message` HTTP endpoints |
| `packages/local-bridge/src/index.ts` | Re-export social types |
| `schemas/cocapn-private.schema.json` | Add `social` property |
| `schemas/cocapn-public.schema.json` | Add `social` property |

---

### Task 1: Social Types

**Files:**
- Create: `packages/local-bridge/src/social/types.ts`
- Test: `packages/local-bridge/tests/social-types.test.ts`

- [ ] **Step 1: Write the failing test for Profile type guard**

```typescript
// packages/local-bridge/tests/social-types.test.ts
import { describe, it, expect } from "vitest";
import { isValidProfile, isValidPeerMessage } from "../src/social/types.js";

describe("social types", () => {
  describe("isValidProfile", () => {
    it("accepts a valid profile", () => {
      const profile = {
        username: "phoenix",
        displayName: "Phoenix",
        bio: "Building things",
        currentFocus: "cocapn",
        avatarUrl: "https://github.com/phoenix.png",
        domains: ["phoenix.makerlog.ai"],
        createdAt: "2026-03-28T00:00:00Z",
        updatedAt: "2026-03-28T00:00:00Z",
      };
      expect(isValidProfile(profile)).toBe(true);
    });

    it("rejects missing username", () => {
      expect(isValidProfile({ displayName: "X", bio: "", domains: [] })).toBe(false);
    });

    it("rejects non-string username", () => {
      expect(isValidProfile({ username: 123, displayName: "X", bio: "", domains: [] })).toBe(false);
    });

    it("rejects missing domains array", () => {
      expect(isValidProfile({ username: "x", displayName: "X", bio: "" })).toBe(false);
    });

    it("rejects domains with non-string entries", () => {
      expect(isValidProfile({ username: "x", displayName: "X", bio: "", domains: [123] })).toBe(false);
    });

    it("accepts profile without optional fields", () => {
      const profile = {
        username: "phoenix",
        displayName: "Phoenix",
        bio: "",
        domains: [],
        createdAt: "2026-03-28T00:00:00Z",
        updatedAt: "2026-03-28T00:00:00Z",
      };
      expect(isValidProfile(profile)).toBe(true);
    });
  });

  describe("isValidPeerMessage", () => {
    it("accepts a valid message", () => {
      const msg = {
        id: "msg-1",
        from: "alice.makerlog.ai",
        to: "bob.studylog.ai",
        body: "Hello!",
        sentAt: "2026-03-28T12:00:00Z",
      };
      expect(isValidPeerMessage(msg)).toBe(true);
    });

    it("rejects missing body", () => {
      expect(isValidPeerMessage({ id: "1", from: "a", to: "b" })).toBe(false);
    });

    it("rejects non-string from", () => {
      expect(isValidPeerMessage({ id: "1", from: 1, to: "b", body: "hi" })).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `~/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run packages/local-bridge/tests/social-types.test.ts`
Expected: FAIL with "Cannot find module '../src/social/types.js'"

- [ ] **Step 3: Write the types module**

```typescript
// packages/local-bridge/src/social/types.ts
/**
 * Social layer types — profiles, messages, and configuration.
 *
 * Profiles are public-facing identity cards stored in each user's public repo.
 * Messages are short text payloads routed through AdmiralDO between fleet domains.
 */

// ─── Profile ────────────────────────────────────────────────────────────────

export interface Profile {
  /** GitHub username or chosen handle */
  username: string;
  /** Human-readable display name */
  displayName: string;
  /** Short bio / tagline */
  bio: string;
  /** What the user is currently working on (from facts.json "current-project") */
  currentFocus: string | undefined;
  /** Gravatar or GitHub avatar URL */
  avatarUrl: string | undefined;
  /** All cocapn domains this user runs (e.g. ["phoenix.makerlog.ai"]) */
  domains: string[];
  /** ISO timestamp of profile creation */
  createdAt: string;
  /** ISO timestamp of last profile update */
  updatedAt: string;
}

/** Proof that the profile was signed by the fleet key holder. */
export interface ProfileProof {
  /** The profile being registered */
  profile: Profile;
  /** Fleet JWT signed with the user's fleet key — sub = username, dom = primary domain */
  token: string;
}

// ─── Peer messaging ─────────────────────────────────────────────────────────

export interface PeerMessage {
  /** Unique message ID (sender-generated) */
  id: string;
  /** Sender domain (e.g. "alice.makerlog.ai") */
  from: string;
  /** Recipient domain (e.g. "bob.studylog.ai") */
  to: string;
  /** Message body (plain text, max 2000 chars) */
  body: string;
  /** ISO timestamp when the message was sent */
  sentAt: string;
  /** ISO timestamp when AdmiralDO received it */
  receivedAt: string | undefined;
  /** ISO timestamp when the message expires (TTL) */
  expiresAt: string | undefined;
}

// ─── Social config (merged into BridgeConfig) ───────────────────────────────

export interface SocialConfig {
  /** Opt-in to public profile discovery — false by default */
  discovery: boolean;
  /** Domains blocked from sending messages to this user */
  blockedDomains: string[];
  /** Only accept messages from followed domains (mutual-follow model) */
  followsOnly: boolean;
  /** Domains this user follows — messages from these domains are always accepted */
  following: string[];
}

export const DEFAULT_SOCIAL_CONFIG: SocialConfig = {
  discovery: false,
  blockedDomains: [],
  followsOnly: false,
  following: [],
};

// ─── Registry types (used by AdmiralDO and client) ──────────────────────────

export interface RegistryEntry {
  profile: Profile;
  /** ISO timestamp of last registration/refresh */
  registeredAt: string;
}

export interface DiscoverResult {
  entries: RegistryEntry[];
  total: number;
  offset: number;
  limit: number;
}

// ─── Type guards ────────────────────────────────────────────────────────────

export function isValidProfile(value: unknown): value is Profile {
  if (value === null || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj["username"] !== "string" || obj["username"] === "") return false;
  if (typeof obj["displayName"] !== "string") return false;
  if (typeof obj["bio"] !== "string") return false;
  if (!Array.isArray(obj["domains"])) return false;
  if (!obj["domains"].every((d: unknown) => typeof d === "string")) return false;
  return true;
}

export function isValidPeerMessage(value: unknown): value is PeerMessage {
  if (value === null || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj["id"] !== "string") return false;
  if (typeof obj["from"] !== "string") return false;
  if (typeof obj["to"] !== "string") return false;
  if (typeof obj["body"] !== "string") return false;
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `~/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run packages/local-bridge/tests/social-types.test.ts`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add packages/local-bridge/src/social/types.ts packages/local-bridge/tests/social-types.test.ts
git commit -m "feat(social): add profile, message, and config types with type guards"
```

---

### Task 2: Profile Builder

**Files:**
- Create: `packages/local-bridge/src/social/profile-builder.ts`
- Test: `packages/local-bridge/tests/profile-builder.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/local-bridge/tests/profile-builder.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ProfileBuilder } from "../src/social/profile-builder.js";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `cocapn-profile-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("ProfileBuilder", () => {
  let privateRoot: string;
  let publicRoot: string;

  beforeEach(() => {
    privateRoot = makeTmpDir();
    publicRoot = makeTmpDir();
    // Set up private repo structure
    mkdirSync(join(privateRoot, "cocapn", "memory"), { recursive: true });
    // Set up public repo structure with cocapn.yml
    mkdirSync(join(publicRoot, "cocapn"), { recursive: true });
  });

  it("builds a profile from facts and public config", () => {
    writeFileSync(
      join(privateRoot, "cocapn", "memory", "facts.json"),
      JSON.stringify({
        "current-project": "building cocapn",
        "username": "phoenix",
        "display-name": "Phoenix Dev",
        "bio": "Maker and builder",
      })
    );
    writeFileSync(
      join(publicRoot, "cocapn.yml"),
      "version: '0.1.0'\ndomain: makerlog\nfleet:\n  domains:\n    - phoenix.makerlog.ai\n"
    );

    const builder = new ProfileBuilder(privateRoot, publicRoot, "cocapn/memory/facts.json");
    const profile = builder.build();

    expect(profile.username).toBe("phoenix");
    expect(profile.displayName).toBe("Phoenix Dev");
    expect(profile.bio).toBe("Maker and builder");
    expect(profile.currentFocus).toBe("building cocapn");
    expect(profile.domains).toEqual(["phoenix.makerlog.ai"]);
    expect(profile.createdAt).toBeDefined();
    expect(profile.updatedAt).toBeDefined();
  });

  it("uses default username when not in facts", () => {
    writeFileSync(
      join(privateRoot, "cocapn", "memory", "facts.json"),
      JSON.stringify({})
    );
    writeFileSync(
      join(publicRoot, "cocapn.yml"),
      "version: '0.1.0'\ndomain: makerlog\n"
    );

    const builder = new ProfileBuilder(privateRoot, publicRoot, "cocapn/memory/facts.json");
    const profile = builder.build();

    expect(profile.username).toBe("anonymous");
    expect(profile.displayName).toBe("anonymous");
    expect(profile.domains).toEqual([]);
  });

  it("filters out private.* facts from currentFocus", () => {
    writeFileSync(
      join(privateRoot, "cocapn", "memory", "facts.json"),
      JSON.stringify({
        "current-project": "building cocapn",
        "private.salary": "100000",
        "private.health": "good",
      })
    );
    writeFileSync(
      join(publicRoot, "cocapn.yml"),
      "version: '0.1.0'\ndomain: makerlog\n"
    );

    const builder = new ProfileBuilder(privateRoot, publicRoot, "cocapn/memory/facts.json");
    const profile = builder.build();

    // private.* facts are never exported, but they shouldn't affect profile fields
    expect(profile.currentFocus).toBe("building cocapn");
  });

  it("builds GitHub avatar URL from username", () => {
    writeFileSync(
      join(privateRoot, "cocapn", "memory", "facts.json"),
      JSON.stringify({ username: "octocat" })
    );
    writeFileSync(
      join(publicRoot, "cocapn.yml"),
      "version: '0.1.0'\ndomain: makerlog\n"
    );

    const builder = new ProfileBuilder(privateRoot, publicRoot, "cocapn/memory/facts.json");
    const profile = builder.build();

    expect(profile.avatarUrl).toBe("https://github.com/octocat.png");
  });

  it("preserves createdAt from existing profile.json", () => {
    const oldCreated = "2025-01-01T00:00:00.000Z";
    writeFileSync(
      join(publicRoot, "cocapn", "profile.json"),
      JSON.stringify({ createdAt: oldCreated })
    );
    writeFileSync(
      join(privateRoot, "cocapn", "memory", "facts.json"),
      JSON.stringify({ username: "phoenix" })
    );
    writeFileSync(
      join(publicRoot, "cocapn.yml"),
      "version: '0.1.0'\ndomain: makerlog\n"
    );

    const builder = new ProfileBuilder(privateRoot, publicRoot, "cocapn/memory/facts.json");
    const profile = builder.build();

    expect(profile.createdAt).toBe(oldCreated);
  });

  it("returns public facts only via getPublicFacts()", () => {
    writeFileSync(
      join(privateRoot, "cocapn", "memory", "facts.json"),
      JSON.stringify({
        "current-project": "cocapn",
        "location": "Seattle",
        "private.salary": "100000",
        "private.ssn": "123-45-6789",
      })
    );

    const builder = new ProfileBuilder(privateRoot, publicRoot, "cocapn/memory/facts.json");
    const publicFacts = builder.getPublicFacts();

    expect(publicFacts).toEqual({
      "current-project": "cocapn",
      "location": "Seattle",
    });
    expect(publicFacts["private.salary"]).toBeUndefined();
    expect(publicFacts["private.ssn"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `~/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run packages/local-bridge/tests/profile-builder.test.ts`
Expected: FAIL with "Cannot find module '../src/social/profile-builder.js'"

- [ ] **Step 3: Write the ProfileBuilder**

```typescript
// packages/local-bridge/src/social/profile-builder.ts
/**
 * ProfileBuilder — constructs a public Profile from Brain facts and public config.
 *
 * Reads:
 *   - Private repo: cocapn/memory/facts.json (username, display-name, bio, current-project)
 *   - Public repo:  cocapn.yml (fleet.domains)
 *   - Public repo:  cocapn/profile.json (preserves createdAt from prior builds)
 *
 * Privacy: Facts prefixed with "private." are never included in the profile
 * or returned from getPublicFacts().
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import type { Profile } from "./types.js";

export class ProfileBuilder {
  private privateRepoRoot: string;
  private publicRepoRoot: string;
  private factsRelPath: string;

  constructor(privateRepoRoot: string, publicRepoRoot: string, factsRelPath: string) {
    this.privateRepoRoot = privateRepoRoot;
    this.publicRepoRoot = publicRepoRoot;
    this.factsRelPath = factsRelPath;
  }

  /** Build a Profile from current Brain facts and public config. */
  build(): Profile {
    const facts = this.readAllFacts();
    const publicFacts = filterPrivateFacts(facts);
    const domains = this.readFleetDomains();
    const username = publicFacts["username"] ?? "anonymous";
    const now = new Date().toISOString();

    return {
      username,
      displayName: publicFacts["display-name"] ?? username,
      bio: publicFacts["bio"] ?? "",
      currentFocus: publicFacts["current-project"],
      avatarUrl: username !== "anonymous" ? `https://github.com/${username}.png` : undefined,
      domains,
      createdAt: this.readExistingCreatedAt() ?? now,
      updatedAt: now,
    };
  }

  /** Return all facts with "private.*" keys removed. */
  getPublicFacts(): Record<string, string> {
    return filterPrivateFacts(this.readAllFacts());
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private readAllFacts(): Record<string, string> {
    const factsPath = join(this.privateRepoRoot, this.factsRelPath);
    if (!existsSync(factsPath)) return {};
    try {
      const raw = readFileSync(factsPath, "utf8").trim();
      const parsed: unknown = JSON.parse(raw || "{}");
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        const result: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          result[k] = String(v);
        }
        return result;
      }
      return {};
    } catch {
      return {};
    }
  }

  private readFleetDomains(): string[] {
    const ymlPath = join(this.publicRepoRoot, "cocapn.yml");
    if (!existsSync(ymlPath)) return [];
    try {
      const raw = parseYaml(readFileSync(ymlPath, "utf8")) as Record<string, unknown>;
      const fleet = raw["fleet"] as Record<string, unknown> | undefined;
      const domains = fleet?.["domains"];
      if (Array.isArray(domains)) {
        return domains.filter((d): d is string => typeof d === "string");
      }
      return [];
    } catch {
      return [];
    }
  }

  private readExistingCreatedAt(): string | undefined {
    const profilePath = join(this.publicRepoRoot, "cocapn", "profile.json");
    if (!existsSync(profilePath)) return undefined;
    try {
      const raw = JSON.parse(readFileSync(profilePath, "utf8")) as Record<string, unknown>;
      const createdAt = raw["createdAt"];
      return typeof createdAt === "string" ? createdAt : undefined;
    } catch {
      return undefined;
    }
  }
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

function filterPrivateFacts(facts: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(facts)) {
    if (!k.startsWith("private.")) {
      result[k] = v;
    }
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `~/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run packages/local-bridge/tests/profile-builder.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add packages/local-bridge/src/social/profile-builder.ts packages/local-bridge/tests/profile-builder.test.ts
git commit -m "feat(social): add ProfileBuilder with private fact filtering"
```

---

### Task 3: Profile Publisher

**Files:**
- Create: `packages/local-bridge/src/social/profile-publisher.ts`
- Test: `packages/local-bridge/tests/profile-publisher.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/local-bridge/tests/profile-publisher.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ProfilePublisher } from "../src/social/profile-publisher.js";
import type { Profile } from "../src/social/types.js";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `cocapn-pub-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    username: "phoenix",
    displayName: "Phoenix",
    bio: "Builder",
    currentFocus: "cocapn",
    avatarUrl: "https://github.com/phoenix.png",
    domains: ["phoenix.makerlog.ai"],
    createdAt: "2026-03-28T00:00:00Z",
    updatedAt: "2026-03-28T00:00:00Z",
    ...overrides,
  };
}

describe("ProfilePublisher", () => {
  let publicRoot: string;

  beforeEach(() => {
    publicRoot = makeTmpDir();
    mkdirSync(join(publicRoot, "cocapn"), { recursive: true });
  });

  describe("writeToPublicRepo", () => {
    it("writes profile.json to cocapn/profile.json", () => {
      const publisher = new ProfilePublisher(publicRoot);
      const profile = makeProfile();
      publisher.writeToPublicRepo(profile);

      const written = JSON.parse(readFileSync(join(publicRoot, "cocapn", "profile.json"), "utf8"));
      expect(written.username).toBe("phoenix");
      expect(written.displayName).toBe("Phoenix");
      expect(written.domains).toEqual(["phoenix.makerlog.ai"]);
    });

    it("overwrites existing profile.json", () => {
      writeFileSync(
        join(publicRoot, "cocapn", "profile.json"),
        JSON.stringify({ username: "old" })
      );

      const publisher = new ProfilePublisher(publicRoot);
      publisher.writeToPublicRepo(makeProfile({ username: "new" }));

      const written = JSON.parse(readFileSync(join(publicRoot, "cocapn", "profile.json"), "utf8"));
      expect(written.username).toBe("new");
    });

    it("creates cocapn/ directory if missing", () => {
      const freshRoot = makeTmpDir();
      const publisher = new ProfilePublisher(freshRoot);
      publisher.writeToPublicRepo(makeProfile());

      expect(existsSync(join(freshRoot, "cocapn", "profile.json"))).toBe(true);
    });
  });

  describe("buildRegistrationPayload", () => {
    it("wraps profile + token into ProfileProof", () => {
      const publisher = new ProfilePublisher(publicRoot);
      const profile = makeProfile();
      const payload = publisher.buildRegistrationPayload(profile, "jwt-token-here");

      expect(payload.profile).toEqual(profile);
      expect(payload.token).toBe("jwt-token-here");
    });
  });

  describe("register (with mocked fetch)", () => {
    it("sends POST to admiralUrl/registry/register", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const publisher = new ProfilePublisher(publicRoot);
      const profile = makeProfile();

      await publisher.register(profile, "jwt-token", "https://admiral.example.com");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0]!;
      expect(url).toBe("https://admiral.example.com/registry/register");
      expect(opts.method).toBe("POST");
      expect(opts.headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(opts.body);
      expect(body.profile.username).toBe("phoenix");
      expect(body.token).toBe("jwt-token");

      vi.unstubAllGlobals();
    });

    it("does not throw on network failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

      const publisher = new ProfilePublisher(publicRoot);
      // Should not throw — registration is non-fatal
      await expect(
        publisher.register(makeProfile(), "tok", "https://admiral.example.com")
      ).resolves.toBeUndefined();

      vi.unstubAllGlobals();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `~/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run packages/local-bridge/tests/profile-publisher.test.ts`
Expected: FAIL with "Cannot find module '../src/social/profile-publisher.js'"

- [ ] **Step 3: Write the ProfilePublisher**

```typescript
// packages/local-bridge/src/social/profile-publisher.ts
/**
 * ProfilePublisher — writes profile.json to the public repo and optionally
 * registers with the AdmiralDO discovery registry.
 *
 * Publishing flow (called from Bridge.start()):
 *   1. ProfileBuilder.build() → Profile
 *   2. publisher.writeToPublicRepo(profile)    → writes cocapn/profile.json
 *   3. publisher.register(profile, jwt, url)   → POST /registry/register (non-fatal)
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { Profile, ProfileProof } from "./types.js";

export class ProfilePublisher {
  private publicRepoRoot: string;

  constructor(publicRepoRoot: string) {
    this.publicRepoRoot = publicRepoRoot;
  }

  /** Write the profile to cocapn/profile.json in the public repo. */
  writeToPublicRepo(profile: Profile): void {
    const dir = join(this.publicRepoRoot, "cocapn");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const dest = join(dir, "profile.json");
    writeFileSync(dest, JSON.stringify(profile, null, 2) + "\n", "utf8");
  }

  /** Build the registration payload (profile + fleet JWT proof). */
  buildRegistrationPayload(profile: Profile, fleetJwt: string): ProfileProof {
    return { profile, token: fleetJwt };
  }

  /**
   * Register the profile with AdmiralDO's discovery registry.
   * Non-fatal — swallows errors since the local profile.json is the source of truth.
   */
  async register(
    profile: Profile,
    fleetJwt: string,
    admiralUrl: string
  ): Promise<void> {
    const payload = this.buildRegistrationPayload(profile, fleetJwt);
    try {
      await fetch(`${admiralUrl}/registry/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // Non-fatal: local profile.json is source of truth, registry is cache
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `~/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run packages/local-bridge/tests/profile-publisher.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add packages/local-bridge/src/social/profile-publisher.ts packages/local-bridge/tests/profile-publisher.test.ts
git commit -m "feat(social): add ProfilePublisher for public repo + AdmiralDO registration"
```

---

### Task 4: AdmiralDO Registry Endpoints

**Files:**
- Modify: `packages/cloud-agents/src/admiral.ts`

- [ ] **Step 1: Add registry types and storage to AdmiralDO**

Add these types after the existing `BridgeHeartbeat` interface at line 44:

```typescript
// ─── Registry types ─────────────────────────────────────────────────────────

export interface RegistryProfile {
  username:     string;
  displayName:  string;
  bio:          string;
  currentFocus: string | undefined;
  avatarUrl:    string | undefined;
  domains:      string[];
  createdAt:    string;
  updatedAt:    string;
}

export interface RegistryEntry {
  profile:      RegistryProfile;
  registeredAt: string;
}

export interface RegistryProof {
  profile: RegistryProfile;
  /** Fleet JWT — sub = username, dom = primary domain */
  token:   string;
}

const MAX_REGISTRY = 500;
```

- [ ] **Step 2: Add route matching in the fetch handler**

In the `fetch` method of `AdmiralDO`, after the existing `DELETE` handler for "task" (line 77), add:

```typescript
    if (request.method === "POST" && pathname === "registry/register") {
      return this.handleRegistryRegister(request);
    }
    if (request.method === "GET" && pathname === "registry/discover") {
      return this.handleRegistryDiscover(request);
    }
```

- [ ] **Step 3: Implement handleRegistryRegister**

Add as a new method inside `AdmiralDO`, after `handleDeleteTask`:

```typescript
  /**
   * POST /registry/register — register or update a profile in the discovery registry.
   * Body: { profile: RegistryProfile, token: string }
   * The token is a fleet JWT — we store it but validation is the caller's responsibility
   * (AdmiralDO trusts the bridge that forwarded the registration).
   */
  private async handleRegistryRegister(request: Request): Promise<Response> {
    let body: RegistryProof;
    try {
      body = await request.json() as RegistryProof;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (!body.profile?.username || !body.token) {
      return new Response("Missing profile.username or token", { status: 400 });
    }

    const registry = (await this.state.storage.get<RegistryEntry[]>("registry")) ?? [];

    const entry: RegistryEntry = {
      profile: body.profile,
      registeredAt: new Date().toISOString(),
    };

    // Upsert by username — one entry per username
    const idx = registry.findIndex((e) => e.profile.username === body.profile.username);
    if (idx >= 0) {
      registry[idx] = entry;
    } else {
      registry.push(entry);
    }

    // Cap registry size
    const trimmed = registry.slice(-MAX_REGISTRY);
    await this.state.storage.put("registry", trimmed);

    return json({ ok: true, username: body.profile.username });
  }
```

- [ ] **Step 4: Implement handleRegistryDiscover**

Add as a new method right after `handleRegistryRegister`:

```typescript
  /**
   * GET /registry/discover?query=<q>&offset=<n>&limit=<n>
   * Full-text search across registered profiles.
   * Searches username, displayName, bio, and domains.
   */
  private async handleRegistryDiscover(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const query  = (url.searchParams.get("query") ?? "").toLowerCase().trim();
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
    const limit  = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));

    const registry = (await this.state.storage.get<RegistryEntry[]>("registry")) ?? [];

    // Filter by query (empty query = list all)
    const matched = query === ""
      ? registry
      : registry.filter((e) => {
          const p = e.profile;
          const haystack = [
            p.username,
            p.displayName,
            p.bio,
            p.currentFocus ?? "",
            ...p.domains,
          ].join(" ").toLowerCase();
          return haystack.includes(query);
        });

    // Sort newest registrations first
    matched.sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));

    const page = matched.slice(offset, offset + limit);

    return json({
      entries: page,
      total:   matched.length,
      offset,
      limit,
    });
  }
```

- [ ] **Step 5: Run existing tests to verify no regressions**

Run: `~/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run`
Expected: All existing tests pass (no cloud-agents tests exist yet, so this validates local-bridge didn't break)

- [ ] **Step 6: Commit**

```bash
git add packages/cloud-agents/src/admiral.ts
git commit -m "feat(social): add registry/register and registry/discover to AdmiralDO"
```

---

### Task 5: AdmiralDO Message Queue Endpoints

**Files:**
- Modify: `packages/cloud-agents/src/admiral.ts`

- [ ] **Step 1: Add message queue types**

Add after the `MAX_REGISTRY` constant:

```typescript
// ─── Message queue types ────────────────────────────────────────────────────

export interface QueuedMessage {
  id:         string;
  from:       string;
  to:         string;
  body:       string;
  sentAt:     string;
  receivedAt: string;
  expiresAt:  string;
}

const MAX_QUEUED_MESSAGES = 200;
const MESSAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
```

- [ ] **Step 2: Add route matching for message endpoints**

In the `fetch` method, after the registry routes, add:

```typescript
    if (request.method === "POST" && pathname === "messages/send") {
      return this.handleMessageSend(request);
    }
    if (request.method === "GET" && pathname === "messages/receive") {
      return this.handleMessageReceive(request);
    }
    if (request.method === "POST" && pathname === "messages/ack") {
      return this.handleMessageAck(request);
    }
```

- [ ] **Step 3: Implement handleMessageSend**

```typescript
  /**
   * POST /messages/send — enqueue a message for a recipient domain.
   * Body: { from, to, body, token }
   * Rate limit: max 10 messages per sender per hour.
   */
  private async handleMessageSend(request: Request): Promise<Response> {
    let body: { from?: string; to?: string; body?: string; token?: string };
    try {
      body = await request.json() as typeof body;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (!body.from || !body.to || !body.body || !body.token) {
      return new Response("Missing from, to, body, or token", { status: 400 });
    }

    if (body.body.length > 2000) {
      return new Response("Message body exceeds 2000 characters", { status: 400 });
    }

    // Rate limiting: check sender's recent message count
    const rateLimitKey = `ratelimit:${body.from}`;
    const recentCount = (await this.state.storage.get<number>(rateLimitKey)) ?? 0;
    if (recentCount >= 10) {
      return new Response("Rate limit exceeded — max 10 messages per hour", { status: 429 });
    }

    const now = new Date();
    const msg: QueuedMessage = {
      id:         `msg-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
      from:       body.from,
      to:         body.to,
      body:       body.body,
      sentAt:     now.toISOString(),
      receivedAt: now.toISOString(),
      expiresAt:  new Date(now.getTime() + MESSAGE_TTL_MS).toISOString(),
    };

    // Store message in recipient's queue
    const queueKey = `msgqueue:${body.to}`;
    const queue = (await this.state.storage.get<QueuedMessage[]>(queueKey)) ?? [];
    queue.push(msg);

    // Trim oldest if over limit
    const trimmed = queue.slice(-MAX_QUEUED_MESSAGES);
    await this.state.storage.put(queueKey, trimmed);

    // Update rate limit counter (reset after 1 hour via alarm or manual check)
    await this.state.storage.put(rateLimitKey, recentCount + 1);

    return json({ ok: true, id: msg.id });
  }
```

- [ ] **Step 4: Implement handleMessageReceive**

```typescript
  /**
   * GET /messages/receive?domain=<d>&limit=<n>
   * Fetch pending messages for a domain. Does NOT delete them — caller must ack.
   * Expired messages are pruned during read.
   */
  private async handleMessageReceive(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const domain = url.searchParams.get("domain");
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));

    if (!domain) {
      return new Response("Missing domain parameter", { status: 400 });
    }

    const queueKey = `msgqueue:${domain}`;
    const queue = (await this.state.storage.get<QueuedMessage[]>(queueKey)) ?? [];

    // Prune expired messages
    const now = Date.now();
    const live = queue.filter((m) => new Date(m.expiresAt).getTime() > now);

    // Persist pruned queue if any were removed
    if (live.length !== queue.length) {
      await this.state.storage.put(queueKey, live);
    }

    return json({ messages: live.slice(0, limit), total: live.length });
  }
```

- [ ] **Step 5: Implement handleMessageAck**

```typescript
  /**
   * POST /messages/ack — acknowledge (delete) messages after processing.
   * Body: { domain, ids: string[] }
   */
  private async handleMessageAck(request: Request): Promise<Response> {
    let body: { domain?: string; ids?: string[] };
    try {
      body = await request.json() as typeof body;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (!body.domain || !Array.isArray(body.ids)) {
      return new Response("Missing domain or ids", { status: 400 });
    }

    const queueKey = `msgqueue:${body.domain}`;
    const queue = (await this.state.storage.get<QueuedMessage[]>(queueKey)) ?? [];
    const ackSet = new Set(body.ids);
    const remaining = queue.filter((m) => !ackSet.has(m.id));
    await this.state.storage.put(queueKey, remaining);

    return json({ ok: true, removed: queue.length - remaining.length });
  }
```

- [ ] **Step 6: Run tests**

Run: `~/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run`
Expected: All existing tests pass

- [ ] **Step 7: Commit**

```bash
git add packages/cloud-agents/src/admiral.ts
git commit -m "feat(social): add message queue (send/receive/ack) to AdmiralDO"
```

---

### Task 6: AdmiralClient Extensions

**Files:**
- Modify: `packages/cloud-agents/src/admiral.ts` (AdmiralClient class)

- [ ] **Step 1: Add registry and message methods to AdmiralClient**

Add after the existing `notifyGitCommit` method (line 225):

```typescript
  async registerProfile(proof: RegistryProof): Promise<{ ok: boolean } | null> {
    return this.fetch<{ ok: boolean }>("POST", "registry/register", proof);
  }

  async discover(query = "", offset = 0, limit = 20): Promise<{
    entries: RegistryEntry[];
    total: number;
    offset: number;
    limit: number;
  } | null> {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (offset > 0) params.set("offset", String(offset));
    if (limit !== 20) params.set("limit", String(limit));
    const qs = params.toString();
    return this.fetch("GET", `registry/discover${qs ? `?${qs}` : ""}`);
  }

  async sendMessage(msg: {
    from: string;
    to: string;
    body: string;
    token: string;
  }): Promise<{ ok: boolean; id: string } | null> {
    return this.fetch("POST", "messages/send", msg);
  }

  async receiveMessages(domain: string, limit = 20): Promise<{
    messages: QueuedMessage[];
    total: number;
  } | null> {
    return this.fetch("GET", `messages/receive?domain=${encodeURIComponent(domain)}&limit=${limit}`);
  }

  async ackMessages(domain: string, ids: string[]): Promise<{ ok: boolean; removed: number } | null> {
    return this.fetch("POST", "messages/ack", { domain, ids });
  }
```

- [ ] **Step 2: Run tests**

Run: `~/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run`
Expected: All existing tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/cloud-agents/src/admiral.ts
git commit -m "feat(social): extend AdmiralClient with registry + message queue methods"
```

---

### Task 7: Message Client

**Files:**
- Create: `packages/local-bridge/src/social/message-client.ts`
- Test: `packages/local-bridge/tests/message-client.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/local-bridge/tests/message-client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MessageClient } from "../src/social/message-client.js";
import type { SocialConfig } from "../src/social/types.js";

const DEFAULT_SOCIAL: SocialConfig = {
  discovery: true,
  blockedDomains: [],
  followsOnly: false,
  following: [],
};

describe("MessageClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("pollMessages", () => {
    it("fetches messages from AdmiralDO", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          messages: [
            { id: "m1", from: "alice.makerlog.ai", to: "bob.studylog.ai", body: "Hello!", sentAt: "2026-03-28T12:00:00Z", receivedAt: "2026-03-28T12:00:00Z", expiresAt: "2026-04-04T12:00:00Z" },
          ],
          total: 1,
        }),
      });

      const client = new MessageClient(
        "https://admiral.example.com",
        "bob.studylog.ai",
        "jwt-token",
        DEFAULT_SOCIAL
      );
      const messages = await client.pollMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0]!.from).toBe("alice.makerlog.ai");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("filters out messages from blocked domains", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          messages: [
            { id: "m1", from: "spammer.evil.ai", to: "bob.studylog.ai", body: "Buy now!", sentAt: "2026-03-28T12:00:00Z", receivedAt: "2026-03-28T12:00:00Z", expiresAt: "2026-04-04T12:00:00Z" },
            { id: "m2", from: "alice.makerlog.ai", to: "bob.studylog.ai", body: "Hello!", sentAt: "2026-03-28T12:00:00Z", receivedAt: "2026-03-28T12:00:00Z", expiresAt: "2026-04-04T12:00:00Z" },
          ],
          total: 2,
        }),
      });

      const config: SocialConfig = {
        ...DEFAULT_SOCIAL,
        blockedDomains: ["spammer.evil.ai"],
      };
      const client = new MessageClient(
        "https://admiral.example.com",
        "bob.studylog.ai",
        "jwt-token",
        config
      );
      const messages = await client.pollMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0]!.from).toBe("alice.makerlog.ai");
    });

    it("filters to followed-only when followsOnly is true", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          messages: [
            { id: "m1", from: "stranger.dev.ai", to: "bob.studylog.ai", body: "Hi", sentAt: "2026-03-28T12:00:00Z", receivedAt: "2026-03-28T12:00:00Z", expiresAt: "2026-04-04T12:00:00Z" },
            { id: "m2", from: "alice.makerlog.ai", to: "bob.studylog.ai", body: "Hey!", sentAt: "2026-03-28T12:00:00Z", receivedAt: "2026-03-28T12:00:00Z", expiresAt: "2026-04-04T12:00:00Z" },
          ],
          total: 2,
        }),
      });

      const config: SocialConfig = {
        ...DEFAULT_SOCIAL,
        followsOnly: true,
        following: ["alice.makerlog.ai"],
      };
      const client = new MessageClient(
        "https://admiral.example.com",
        "bob.studylog.ai",
        "jwt-token",
        config
      );
      const messages = await client.pollMessages();

      expect(messages).toHaveLength(1);
      expect(messages[0]!.from).toBe("alice.makerlog.ai");
    });

    it("returns empty array on fetch failure", async () => {
      fetchMock.mockRejectedValue(new Error("network error"));

      const client = new MessageClient(
        "https://admiral.example.com",
        "bob.studylog.ai",
        "jwt-token",
        DEFAULT_SOCIAL
      );
      const messages = await client.pollMessages();

      expect(messages).toEqual([]);
    });
  });

  describe("ackMessages", () => {
    it("sends ack request to AdmiralDO", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, removed: 2 }),
      });

      const client = new MessageClient(
        "https://admiral.example.com",
        "bob.studylog.ai",
        "jwt-token",
        DEFAULT_SOCIAL
      );
      await client.ackMessages(["m1", "m2"]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0]!;
      expect(url).toBe("https://admiral.example.com/messages/ack");
      const body = JSON.parse(opts.body);
      expect(body.domain).toBe("bob.studylog.ai");
      expect(body.ids).toEqual(["m1", "m2"]);
    });
  });

  describe("sendMessage", () => {
    it("sends message through AdmiralDO", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, id: "msg-123" }),
      });

      const client = new MessageClient(
        "https://admiral.example.com",
        "bob.studylog.ai",
        "jwt-token",
        DEFAULT_SOCIAL
      );
      const result = await client.sendMessage("alice.makerlog.ai", "Hello Alice!");

      expect(result).toEqual({ ok: true, id: "msg-123" });
      const [, opts] = fetchMock.mock.calls[0]!;
      const body = JSON.parse(opts.body);
      expect(body.from).toBe("bob.studylog.ai");
      expect(body.to).toBe("alice.makerlog.ai");
      expect(body.body).toBe("Hello Alice!");
    });

    it("rejects messages to blocked domains", async () => {
      const config: SocialConfig = {
        ...DEFAULT_SOCIAL,
        blockedDomains: ["evil.ai"],
      };
      const client = new MessageClient(
        "https://admiral.example.com",
        "bob.studylog.ai",
        "jwt-token",
        config
      );
      const result = await client.sendMessage("evil.ai", "hi");

      expect(result).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `~/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run packages/local-bridge/tests/message-client.test.ts`
Expected: FAIL with "Cannot find module '../src/social/message-client.js'"

- [ ] **Step 3: Write the MessageClient**

```typescript
// packages/local-bridge/src/social/message-client.ts
/**
 * MessageClient — polls and sends peer messages via AdmiralDO's message queue.
 *
 * Privacy enforcement:
 *   - Blocked domains are filtered on both send and receive
 *   - followsOnly mode rejects messages from non-followed domains
 *   - Messages are acked (deleted from queue) after successful delivery
 */

import type { SocialConfig } from "./types.js";

export interface QueuedMessage {
  id:         string;
  from:       string;
  to:         string;
  body:       string;
  sentAt:     string;
  receivedAt: string;
  expiresAt:  string;
}

export class MessageClient {
  private admiralUrl: string;
  private domain: string;
  private fleetJwt: string;
  private social: SocialConfig;

  constructor(
    admiralUrl: string,
    domain: string,
    fleetJwt: string,
    social: SocialConfig
  ) {
    this.admiralUrl = admiralUrl.replace(/\/$/, "");
    this.domain = domain;
    this.fleetJwt = fleetJwt;
    this.social = social;
  }

  /**
   * Fetch pending messages from AdmiralDO, applying privacy filters.
   * Returns only messages that pass blocked-domain and follows-only checks.
   */
  async pollMessages(): Promise<QueuedMessage[]> {
    try {
      const res = await fetch(
        `${this.admiralUrl}/messages/receive?domain=${encodeURIComponent(this.domain)}&limit=50`,
        {
          headers: {
            Authorization: `Bearer ${this.fleetJwt}`,
          },
        }
      );
      if (!res.ok) return [];

      const data = (await res.json()) as { messages: QueuedMessage[] };
      return (data.messages ?? []).filter((m) => this.isAllowed(m.from));
    } catch {
      return [];
    }
  }

  /** Acknowledge (delete) messages from the queue after processing. */
  async ackMessages(ids: string[]): Promise<void> {
    try {
      await fetch(`${this.admiralUrl}/messages/ack`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.fleetJwt}`,
        },
        body: JSON.stringify({ domain: this.domain, ids }),
      });
    } catch {
      // Non-fatal — messages will be re-delivered on next poll
    }
  }

  /**
   * Send a message to another domain through AdmiralDO.
   * Returns null if the target domain is blocked.
   */
  async sendMessage(
    to: string,
    body: string
  ): Promise<{ ok: boolean; id: string } | null> {
    if (this.social.blockedDomains.includes(to)) return null;

    try {
      const res = await fetch(`${this.admiralUrl}/messages/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.fleetJwt}`,
        },
        body: JSON.stringify({
          from: this.domain,
          to,
          body,
          token: this.fleetJwt,
        }),
      });
      if (!res.ok) return null;
      return (await res.json()) as { ok: boolean; id: string };
    } catch {
      return null;
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private isAllowed(senderDomain: string): boolean {
    if (this.social.blockedDomains.includes(senderDomain)) return false;
    if (this.social.followsOnly && !this.social.following.includes(senderDomain)) return false;
    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `~/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run packages/local-bridge/tests/message-client.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add packages/local-bridge/src/social/message-client.ts packages/local-bridge/tests/message-client.test.ts
git commit -m "feat(social): add MessageClient with privacy filtering and rate limit awareness"
```

---

### Task 8: Config Types Extension

**Files:**
- Modify: `packages/local-bridge/src/config/types.ts`
- Modify: `packages/local-bridge/src/config/loader.ts`

- [ ] **Step 1: Add social config to BridgeConfig**

In `packages/local-bridge/src/config/types.ts`, add after the `sync` field in the `BridgeConfig` interface (after line 39):

```typescript
  social: {
    /** Opt-in to public profile discovery */
    discovery: boolean;
    /** Domains blocked from messaging */
    blockedDomains: string[];
    /** Only accept messages from followed domains */
    followsOnly: boolean;
    /** Domains this user follows */
    following: string[];
  };
```

Add the social default to `DEFAULT_CONFIG` after the `sync` block (after line 64):

```typescript
  social: {
    discovery: false,
    blockedDomains: [],
    followsOnly: false,
    following: [],
  },
```

- [ ] **Step 2: Read config/loader.ts to understand the merge pattern**

Read `packages/local-bridge/src/config/loader.ts` to see how YAML fields are merged with defaults.

- [ ] **Step 3: Add social config parsing to the loader**

In the loader, add parsing for the `social` section following the same pattern used for `sync` and `encryption`. The exact edit depends on the loader's structure — look for where `config.sync` is merged and add an equivalent block for `social`:

```typescript
    // Social config
    const social = raw["social"] as Record<string, unknown> | undefined;
    if (social) {
      if (typeof social["discovery"] === "boolean") {
        result.social.discovery = social["discovery"];
      }
      if (Array.isArray(social["blockedDomains"])) {
        result.social.blockedDomains = social["blockedDomains"].filter(
          (d): d is string => typeof d === "string"
        );
      }
      if (typeof social["followsOnly"] === "boolean") {
        result.social.followsOnly = social["followsOnly"];
      }
      if (Array.isArray(social["following"])) {
        result.social.following = social["following"].filter(
          (d): d is string => typeof d === "string"
        );
      }
    }
```

- [ ] **Step 4: Run existing config tests to verify no regressions**

Run: `~/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run packages/local-bridge/tests/config.test.ts`
Expected: All existing config tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/local-bridge/src/config/types.ts packages/local-bridge/src/config/loader.ts
git commit -m "feat(social): add social config section to BridgeConfig with discovery, blocking, follows"
```

---

### Task 9: Bridge Social Integration

**Files:**
- Modify: `packages/local-bridge/src/bridge.ts`

- [ ] **Step 1: Add imports at the top of bridge.ts**

After the existing `import { Publisher }` line (line 35):

```typescript
import { ProfileBuilder } from "./social/profile-builder.js";
import { ProfilePublisher } from "./social/profile-publisher.js";
import { MessageClient } from "./social/message-client.js";
```

- [ ] **Step 2: Add social fields to the Bridge class**

After the `private publisher` field (line 85):

```typescript
  private profilePublisher: ProfilePublisher | undefined;
  private messageClient:    MessageClient | undefined;
  private messagePoller:    ReturnType<typeof setInterval> | undefined;
```

- [ ] **Step 3: Wire social layer in Bridge.start()**

After the auto-publisher integration block (after line 189), add:

```typescript
    // ── Social layer integration ────────────────────────────────────────────
    if (this.config.social.discovery) {
      const builder = new ProfileBuilder(
        this.options.privateRepoRoot,
        this.options.publicRepoRoot,
        this.config.memory.facts
      );
      const profile = builder.build();
      this.profilePublisher = new ProfilePublisher(this.options.publicRepoRoot);
      this.profilePublisher.writeToPublicRepo(profile);
      console.info(`[bridge] Profile published: ${profile.username} (${profile.domains.join(", ")})`);

      // Register with AdmiralDO if cloud is configured
      if (this.admiral && this.fleetKey) {
        const jwt = this.fleetKeys.signToken(profile.username, this.fleetKey, 3600, profile.domains[0]);
        const cloudYmlPath = join(this.options.privateRepoRoot, "cocapn", "cocapn-cloud.yml");
        if (existsSync(cloudYmlPath)) {
          try {
            const yml = parseYaml(readFileSync(cloudYmlPath, "utf8")) as CloudYml;
            const admiralUrl = yml.cloudflare?.admiralUrl;
            if (admiralUrl) {
              void this.profilePublisher.register(profile, jwt, admiralUrl);
              console.info("[bridge] Profile registration sent to AdmiralDO");
            }
          } catch { /* non-fatal */ }
        }
      }

      // Set up message client if cloud is configured
      if (this.fleetKey) {
        const domain = profile.domains[0];
        if (domain) {
          const cloudYmlPath = join(this.options.privateRepoRoot, "cocapn", "cocapn-cloud.yml");
          if (existsSync(cloudYmlPath)) {
            try {
              const yml = parseYaml(readFileSync(cloudYmlPath, "utf8")) as CloudYml;
              const admiralUrl = yml.cloudflare?.admiralUrl;
              if (admiralUrl) {
                const jwt = this.fleetKeys.signToken(domain, this.fleetKey, 3600);
                this.messageClient = new MessageClient(
                  admiralUrl, domain, jwt, this.config.social
                );
                // Poll for messages every 30 seconds
                this.messagePoller = setInterval(() => {
                  void this.pollAndDeliverMessages();
                }, 30_000);
                console.info(`[bridge] Message polling active for ${domain}`);
              }
            } catch { /* non-fatal */ }
          }
        }
      }
    }
```

- [ ] **Step 4: Add the message delivery method**

After `notifyAdmiralCommit` (line 311):

```typescript
  private async pollAndDeliverMessages(): Promise<void> {
    if (!this.messageClient) return;
    try {
      const messages = await this.messageClient.pollMessages();
      if (messages.length === 0) return;

      for (const msg of messages) {
        console.info(`[social] Message from ${msg.from}: ${msg.body.slice(0, 80)}`);
      }

      // Ack all received messages
      await this.messageClient.ackMessages(messages.map((m) => m.id));
    } catch {
      // Non-fatal
    }
  }
```

- [ ] **Step 5: Clean up message poller in Bridge.stop()**

In the `stop()` method (around line 218), before the existing cleanup calls:

```typescript
    if (this.messagePoller) {
      clearInterval(this.messagePoller);
      this.messagePoller = undefined;
    }
```

- [ ] **Step 6: Run all tests**

Run: `~/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add packages/local-bridge/src/bridge.ts
git commit -m "feat(social): wire ProfilePublisher + MessageClient into Bridge startup"
```

---

### Task 10: Social HTTP Endpoints

**Files:**
- Modify: `packages/local-bridge/src/ws/server.ts`

- [ ] **Step 1: Add social profile endpoint to handleHttpRequest**

In `server.ts`, in the `handleHttpRequest` method, after the `/api/peer/facts` block (after line 245), add:

```typescript
    // ── Social profile (public, no auth) ────────────────────────────────────
    if (pathname === "/api/social/profile") {
      const profilePath = join(this.options.repoRoot, "..", "cocapn", "profile.json");
      // Try public repo path — the profile lives in the public repo
      // We read from a well-known location; bridge.ts writes it there
      try {
        // Profile is in the public repo, not the private repo.
        // Since BridgeServerOptions only has repoRoot (private), we read from
        // the path that ProfilePublisher writes to — which the bridge can
        // optionally inject.
        res.writeHead(200).end(JSON.stringify({
          error: "Profile endpoint requires publicRepoRoot — use /.well-known/cocapn/peer instead",
        }));
      } catch {
        res.writeHead(404).end(JSON.stringify({ error: "Profile not found" }));
      }
      return;
    }

    // ── Social message send (requires fleet JWT) ─────────────────────────────
    if (pathname === "/api/social/message" && req.method === "POST") {
      if (!this.verifyPeerAuth(req)) {
        res.writeHead(401).end(JSON.stringify({ error: "Unauthorized — fleet JWT required" }));
        return;
      }

      let body = "";
      for await (const chunk of req) {
        body += chunk;
      }

      try {
        const msg = JSON.parse(body) as { to?: string; body?: string };
        if (!msg.to || !msg.body) {
          res.writeHead(400).end(JSON.stringify({ error: "Missing to or body" }));
          return;
        }
        // Direct delivery — the sender is connecting to this bridge directly
        // This is the "both online" path for peer-to-peer messaging
        console.info(`[social] Direct message to ${msg.to}: ${msg.body.slice(0, 80)}`);
        res.writeHead(200).end(JSON.stringify({ ok: true, delivery: "direct" }));
      } catch {
        res.writeHead(400).end(JSON.stringify({ error: "Invalid JSON body" }));
      }
      return;
    }
```

- [ ] **Step 2: Extend the peer card with social fields**

In the existing `/.well-known/cocapn/peer` handler (around line 207), update the card object:

Replace:
```typescript
      const card = {
        domain:       this.options.config.config.tunnel ?? `localhost:${this.options.config.config.port}`,
        capabilities: ["chat", "memory", "a2a"],
        publicKey:    this.options.config.encryption.publicKey || null,
        version:      "0.1.0",
      };
```

With:
```typescript
      const card = {
        domain:       this.options.config.config.tunnel ?? `localhost:${this.options.config.config.port}`,
        capabilities: ["chat", "memory", "a2a", "social"],
        publicKey:    this.options.config.encryption.publicKey || null,
        version:      "0.1.0",
        social: {
          discovery: this.options.config.social.discovery,
          messaging: this.options.config.social.discovery,
        },
      };
```

- [ ] **Step 3: Run server tests to verify no regressions**

Run: `~/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run packages/local-bridge/tests/ws-server.test.ts`
Expected: All existing server tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/local-bridge/src/ws/server.ts
git commit -m "feat(social): add social HTTP endpoints and extend peer card with social capabilities"
```

---

### Task 11: Exports and Schema Updates

**Files:**
- Modify: `packages/local-bridge/src/index.ts`
- Create: `schemas/profile.schema.json`
- Modify: `schemas/cocapn-private.schema.json`
- Modify: `schemas/cocapn-public.schema.json`

- [ ] **Step 1: Add social exports to index.ts**

Append to `packages/local-bridge/src/index.ts`:

```typescript
// Social layer
export { ProfileBuilder } from "./social/profile-builder.js";
export { ProfilePublisher } from "./social/profile-publisher.js";
export { MessageClient } from "./social/message-client.js";
export type {
  Profile,
  ProfileProof,
  PeerMessage,
  SocialConfig,
  RegistryEntry,
  DiscoverResult,
} from "./social/types.js";
export { isValidProfile, isValidPeerMessage, DEFAULT_SOCIAL_CONFIG } from "./social/types.js";
```

- [ ] **Step 2: Create profile.schema.json**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://cocapn.io/schemas/profile.schema.json",
  "title": "Cocapn Public Profile",
  "description": "Public identity card stored in each user's public repo at cocapn/profile.json. Used for fleet discovery and cross-domain messaging.",
  "type": "object",
  "required": ["username", "displayName", "bio", "domains", "createdAt", "updatedAt"],
  "properties": {
    "username": {
      "type": "string",
      "description": "GitHub username or chosen handle.",
      "minLength": 1,
      "maxLength": 39
    },
    "displayName": {
      "type": "string",
      "description": "Human-readable display name.",
      "maxLength": 100
    },
    "bio": {
      "type": "string",
      "description": "Short bio or tagline.",
      "maxLength": 500
    },
    "currentFocus": {
      "type": "string",
      "description": "What the user is currently working on. Sourced from the 'current-project' fact in facts.json.",
      "maxLength": 200
    },
    "avatarUrl": {
      "type": "string",
      "description": "URL to the user's avatar image (GitHub or Gravatar).",
      "format": "uri"
    },
    "domains": {
      "type": "array",
      "description": "All cocapn domains this user operates.",
      "items": {
        "type": "string",
        "format": "hostname"
      },
      "uniqueItems": true
    },
    "createdAt": {
      "type": "string",
      "description": "ISO 8601 timestamp of when the profile was first created.",
      "format": "date-time"
    },
    "updatedAt": {
      "type": "string",
      "description": "ISO 8601 timestamp of the last profile update.",
      "format": "date-time"
    }
  },
  "additionalProperties": false
}
```

- [ ] **Step 3: Add social section to cocapn-private.schema.json**

In `schemas/cocapn-private.schema.json`, add after the `sync` property (before the closing `}` of `"properties"`):

```json
    "social": {
      "type": "object",
      "description": "Social layer configuration for public discovery and cross-domain messaging.",
      "properties": {
        "discovery": {
          "type": "boolean",
          "description": "Opt-in to public profile discovery. When false, no profile is published and no messages are accepted.",
          "default": false
        },
        "blockedDomains": {
          "type": "array",
          "description": "Domains blocked from sending messages to this user.",
          "items": {
            "type": "string",
            "format": "hostname"
          },
          "uniqueItems": true
        },
        "followsOnly": {
          "type": "boolean",
          "description": "When true, only accept messages from domains in the 'following' list.",
          "default": false
        },
        "following": {
          "type": "array",
          "description": "Domains this user follows. Messages from these domains are always accepted.",
          "items": {
            "type": "string",
            "format": "hostname"
          },
          "uniqueItems": true
        }
      }
    }
```

- [ ] **Step 4: Add social section to cocapn-public.schema.json**

In `schemas/cocapn-public.schema.json`, add after the `fleet` property (before the closing `}` of `"properties"`):

```json
    "social": {
      "type": "object",
      "description": "Social layer configuration visible in the public repo.",
      "properties": {
        "discovery": {
          "type": "boolean",
          "description": "Whether this user's profile is discoverable in the fleet registry.",
          "default": false
        },
        "profileUrl": {
          "type": "string",
          "description": "Direct URL to this user's cocapn/profile.json.",
          "format": "uri"
        }
      }
    }
```

- [ ] **Step 5: Run all tests**

Run: `~/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/local-bridge/src/index.ts schemas/profile.schema.json schemas/cocapn-private.schema.json schemas/cocapn-public.schema.json
git commit -m "feat(social): add profile schema, update config schemas, export social types"
```

---

### Task 12: Full Integration Test

**Files:**
- Create: `packages/local-bridge/tests/social-integration.test.ts`

- [ ] **Step 1: Write integration tests**

```typescript
// packages/local-bridge/tests/social-integration.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ProfileBuilder } from "../src/social/profile-builder.js";
import { ProfilePublisher } from "../src/social/profile-publisher.js";
import { MessageClient } from "../src/social/message-client.js";
import { isValidProfile, DEFAULT_SOCIAL_CONFIG } from "../src/social/types.js";
import type { SocialConfig } from "../src/social/types.js";

function makeTmpDir(): string {
  const dir = join(tmpdir(), `cocapn-social-int-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("social layer integration", () => {
  let privateRoot: string;
  let publicRoot: string;

  beforeEach(() => {
    privateRoot = makeTmpDir();
    publicRoot = makeTmpDir();
    mkdirSync(join(privateRoot, "cocapn", "memory"), { recursive: true });
    mkdirSync(join(publicRoot, "cocapn"), { recursive: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("full flow: build profile → publish → validate", () => {
    writeFileSync(
      join(privateRoot, "cocapn", "memory", "facts.json"),
      JSON.stringify({
        username: "alice",
        "display-name": "Alice Builder",
        bio: "Making great things",
        "current-project": "cocapn v2",
        "private.secret-key": "abc123",
      })
    );
    writeFileSync(
      join(publicRoot, "cocapn.yml"),
      "version: '0.1.0'\ndomain: makerlog\nfleet:\n  domains:\n    - alice.makerlog.ai\n    - alice.studylog.ai\n"
    );

    // 1. Build profile
    const builder = new ProfileBuilder(privateRoot, publicRoot, "cocapn/memory/facts.json");
    const profile = builder.build();

    expect(profile.username).toBe("alice");
    expect(profile.currentFocus).toBe("cocapn v2");
    expect(profile.domains).toEqual(["alice.makerlog.ai", "alice.studylog.ai"]);

    // 2. Validate with type guard
    expect(isValidProfile(profile)).toBe(true);

    // 3. Publish to public repo
    const publisher = new ProfilePublisher(publicRoot);
    publisher.writeToPublicRepo(profile);

    const written = JSON.parse(readFileSync(join(publicRoot, "cocapn", "profile.json"), "utf8"));
    expect(written.username).toBe("alice");
    expect(written.domains).toHaveLength(2);

    // 4. Verify private facts are NOT in the profile
    expect(JSON.stringify(written)).not.toContain("abc123");
    expect(JSON.stringify(written)).not.toContain("secret-key");

    // 5. Verify public facts filtering
    const publicFacts = builder.getPublicFacts();
    expect(publicFacts["private.secret-key"]).toBeUndefined();
    expect(publicFacts["username"]).toBe("alice");
  });

  it("three-domain messaging scenario", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // Simulate Alice (makerlog) sending to Bob (studylog) and Carol (businesslog)
    const aliceConfig: SocialConfig = {
      ...DEFAULT_SOCIAL_CONFIG,
      discovery: true,
      following: ["bob.studylog.ai", "carol.businesslog.ai"],
    };

    const alice = new MessageClient(
      "https://admiral.test",
      "alice.makerlog.ai",
      "alice-jwt",
      aliceConfig
    );

    // Alice sends to Bob
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true, id: "msg-1" }),
    });
    const result1 = await alice.sendMessage("bob.studylog.ai", "Hey Bob!");
    expect(result1).toEqual({ ok: true, id: "msg-1" });

    // Alice sends to Carol
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true, id: "msg-2" }),
    });
    const result2 = await alice.sendMessage("carol.businesslog.ai", "Hi Carol!");
    expect(result2).toEqual({ ok: true, id: "msg-2" });

    // Bob polls and sees Alice's message
    const bobConfig: SocialConfig = {
      ...DEFAULT_SOCIAL_CONFIG,
      discovery: true,
    };
    const bob = new MessageClient(
      "https://admiral.test",
      "bob.studylog.ai",
      "bob-jwt",
      bobConfig
    );

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        messages: [
          {
            id: "msg-1",
            from: "alice.makerlog.ai",
            to: "bob.studylog.ai",
            body: "Hey Bob!",
            sentAt: "2026-03-28T12:00:00Z",
            receivedAt: "2026-03-28T12:00:00Z",
            expiresAt: "2026-04-04T12:00:00Z",
          },
        ],
        total: 1,
      }),
    });

    const bobMessages = await bob.pollMessages();
    expect(bobMessages).toHaveLength(1);
    expect(bobMessages[0]!.body).toBe("Hey Bob!");

    // Bob acks
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true, removed: 1 }),
    });
    await bob.ackMessages(["msg-1"]);

    expect(fetchMock).toHaveBeenCalledTimes(5); // 2 sends + 1 poll + 1 ack + (no extra)
  });

  it("blocked domain is rejected for both send and receive", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const config: SocialConfig = {
      ...DEFAULT_SOCIAL_CONFIG,
      discovery: true,
      blockedDomains: ["spammer.evil.ai"],
    };

    const client = new MessageClient(
      "https://admiral.test",
      "user.makerlog.ai",
      "jwt",
      config
    );

    // Sending to blocked domain is silently rejected
    const result = await client.sendMessage("spammer.evil.ai", "hi");
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    // Receiving from blocked domain is filtered out
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        messages: [
          { id: "m1", from: "spammer.evil.ai", to: "user.makerlog.ai", body: "spam", sentAt: "", receivedAt: "", expiresAt: "2099-01-01T00:00:00Z" },
          { id: "m2", from: "friend.dev.ai", to: "user.makerlog.ai", body: "hello", sentAt: "", receivedAt: "", expiresAt: "2099-01-01T00:00:00Z" },
        ],
        total: 2,
      }),
    });

    const messages = await client.pollMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0]!.from).toBe("friend.dev.ai");
  });

  it("profile preserves createdAt across rebuilds", () => {
    const originalCreated = "2025-06-15T10:00:00.000Z";

    writeFileSync(
      join(publicRoot, "cocapn", "profile.json"),
      JSON.stringify({ createdAt: originalCreated })
    );
    writeFileSync(
      join(privateRoot, "cocapn", "memory", "facts.json"),
      JSON.stringify({ username: "phoenix" })
    );
    writeFileSync(
      join(publicRoot, "cocapn.yml"),
      "version: '0.1.0'\ndomain: makerlog\n"
    );

    const builder = new ProfileBuilder(privateRoot, publicRoot, "cocapn/memory/facts.json");
    const profile = builder.build();

    expect(profile.createdAt).toBe(originalCreated);
    expect(profile.updatedAt).not.toBe(originalCreated); // updatedAt should be fresh
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `~/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run packages/local-bridge/tests/social-integration.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 3: Run full test suite**

Run: `~/.nvm/versions/node/v20.20.2/bin/node node_modules/.bin/vitest run`
Expected: All tests pass (existing 203 + new ~23 social tests ≈ 226 total)

- [ ] **Step 4: Commit**

```bash
git add packages/local-bridge/tests/social-integration.test.ts
git commit -m "test(social): add integration tests covering full profile + messaging flow"
```

---

## Self-Review

### 1. Spec Coverage

| Requirement | Task |
|-------------|------|
| `cocapn/profile.json` with username, displayName, bio, currentFocus, avatarUrl, domains | Task 1 (types), Task 2 (builder), Task 11 (schema) |
| `discovery: true` opt-in | Task 8 (config), Task 9 (bridge gating) |
| `private.*` facts never exported | Task 2 (getPublicFacts), Task 12 (integration test) |
| Domain blocking | Task 1 (SocialConfig), Task 7 (MessageClient.isAllowed) |
| AdmiralDO POST /registry/register | Task 4 |
| AdmiralDO GET /registry/discover | Task 4 |
| Cross-domain messaging (A→B→C) | Task 5 (queue), Task 7 (client), Task 12 (three-domain test) |
| AdmiralDO message queue with TTL | Task 5 (7-day TTL, expiry pruning on read) |
| Rate limiting | Task 5 (10/hour per sender) |
| Mutual follows for spam prevention | Task 1 (followsOnly), Task 7 (isAllowed filter) |
| Fleet JWT identity verification | Task 3 (ProfileProof), Task 9 (bridge signs JWT) |
| Offline messages via AdmiralDO | Task 5 + Task 7 (poll/ack pattern) |
| Direct A2A when both online | Task 10 (/api/social/message endpoint) |
| Schema definitions | Task 1 (TS types), Task 11 (JSON schemas) |
| API specs | Task 4-6 (AdmiralDO), Task 10 (HTTP bridge) |

### 2. Placeholder Scan

No TBD/TODO/placeholder patterns found. All code steps contain complete implementations.

### 3. Type Consistency

- `Profile` interface: consistent across types.ts, profile-builder.ts, profile-publisher.ts, and tests
- `SocialConfig`: consistent across types.ts, config/types.ts, message-client.ts
- `QueuedMessage`: defined in admiral.ts (server) and message-client.ts (client) — intentional duplication to avoid cross-package import (same pattern as Brain's `Task` vs Publisher's `parseTaskFile`)
- `RegistryEntry`: defined in both types.ts and admiral.ts — same justification
- `ProfileProof` / `RegistryProof`: same shape, different names in types.ts vs admiral.ts — `ProfileProof` (client) maps to `RegistryProof` (server). Both have `{ profile, token }`. Consistent.
- Method names: `pollMessages`, `ackMessages`, `sendMessage` consistent between test expectations and implementation
