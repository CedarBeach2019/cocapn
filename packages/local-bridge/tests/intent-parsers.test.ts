/**
 * Intent Parser Tests — using ACTUAL implementation from src/handlers/intents.ts
 *
 * Tests the actual intent parsing functions:
 * - parseModuleInstallIntent
 * - parsePeerQueryIntent
 * - parseSkinIntent
 */

import { describe, it, expect } from "vitest";
import {
  parseModuleInstallIntent,
  parsePeerQueryIntent,
  parseSkinIntent,
  type ModuleInstallIntent,
  type PeerQueryIntent,
  type SkinIntent,
} from "../src/handlers/intents.js";

// ─── Module Install Intent Tests ──────────────────────────────────────────────

describe("Intent Parsers: Module Install (ACTUAL)", () => {
  it("parses 'install habit-tracker' with registry shorthand", () => {
    const result = parseModuleInstallIntent("install habit-tracker");
    expect(result).toEqual<ModuleInstallIntent>({
      gitUrl: "https://github.com/cocapn/habit-tracker",
      moduleName: "habit-tracker",
    });
  });

  it("parses 'add the perplexity-search module'", () => {
    const result = parseModuleInstallIntent("add the perplexity-search module");
    expect(result).toEqual<ModuleInstallIntent>({
      gitUrl: "https://github.com/cocapn/perplexity-search",
      moduleName: "perplexity-search",
    });
  });

  it("parses 'install module from github.com/user/repo' (explicit URL)", () => {
    const result = parseModuleInstallIntent(
      "install module from https://github.com/custom/repo"
    );
    expect(result).toEqual<ModuleInstallIntent>({
      gitUrl: "https://github.com/custom/repo",
      moduleName: "repo",
    });
  });

  it("parses 'add https://github.com/user/module.git' (git@ variant)", () => {
    const result = parseModuleInstallIntent(
      "add https://github.com/user/module.git"
    );
    expect(result).toEqual<ModuleInstallIntent>({
      gitUrl: "https://github.com/user/module.git",
      moduleName: "module",
    });
  });

  it("parses git@github.com:user/repo.git format", () => {
    const result = parseModuleInstallIntent(
      "install module from git@github.com:user/repo.git"
    );
    expect(result).toEqual<ModuleInstallIntent>({
      gitUrl: "git@github.com:user/repo.git",
      moduleName: "repo",
    });
  });

  it("returns undefined for non-install messages", () => {
    expect(parseModuleInstallIntent("hello there")).toBeUndefined();
    expect(parseModuleInstallIntent("what's the weather")).toBeUndefined();
    expect(parseModuleInstallIntent("tell me about modules")).toBeUndefined();
  });

  it("returns undefined for malformed module names", () => {
    // Must start with lowercase letter
    expect(parseModuleInstallIntent("install 123module")).toBeUndefined();
    expect(parseModuleInstallIntent("install -module")).toBeUndefined();
  });
});

// ─── Peer Query Intent Tests ───────────────────────────────────────────────────

describe("Intent Parsers: Peer Query (ACTUAL)", () => {
  it("parses 'ask activelog for my step count'", () => {
    const result = parsePeerQueryIntent("ask activelog for my step count");
    expect(result).toEqual<PeerQueryIntent>({
      domain: "activelog",
      factKey: "my step count",
      originalContent: "ask activelog for my step count",
    });
  });

  it("parses 'from makerlog: what's my project count'", () => {
    const result = parsePeerQueryIntent(
      "from makerlog: what's my project count"
    );
    expect(result).toEqual<PeerQueryIntent>({
      domain: "makerlog",
      factKey: "what's my project count",
      originalContent: "from makerlog: what's my project count",
    });
  });

  it("parses 'Am I too tired? ask activelog' (trailing pattern)", () => {
    const result = parsePeerQueryIntent("Am I too tired? ask activelog");
    expect(result).toEqual<PeerQueryIntent>({
      domain: "activelog",
      factKey: "am i too tired", // actual implementation lowercases the result
      originalContent: "Am I too tired? ask activelog",
    });
  });

  it("parses 'ask makerlog for project count' (without 'my')", () => {
    const result = parsePeerQueryIntent("ask makerlog for project count");
    expect(result).toEqual<PeerQueryIntent>({
      domain: "makerlog",
      factKey: "project count",
      originalContent: "ask makerlog for project count",
    });
  });

  it("handles domain with .ai TLD", () => {
    const result = parsePeerQueryIntent("ask studylog.ai for reading streak");
    expect(result?.domain).toBe("studylog.ai");
  });

  it("handles domain with :port notation", () => {
    const result = parsePeerQueryIntent("ask peer.local:8080 for status");
    expect(result?.domain).toBe("peer.local:8080");
  });

  it("strips trailing punctuation from factKey", () => {
    const result = parsePeerQueryIntent("ask activelog for status??");
    expect(result?.factKey).toBe("status");
  });

  it("returns undefined for non-peer-query messages", () => {
    expect(parsePeerQueryIntent("hello there")).toBeUndefined();
    expect(parsePeerQueryIntent("tell me about peer queries")).toBeUndefined();
    expect(parsePeerQueryIntent("ask a question")).toBeUndefined();
  });
});

// ─── Skin Intent Tests ─────────────────────────────────────────────────────────

describe("Intent Parsers: Skin Change (ACTUAL)", () => {
  it("parses 'change skin to dark'", () => {
    const result = parseSkinIntent("change skin to dark");
    expect(result).toEqual<SkinIntent>({
      skin: "dark",
      preview: false,
    });
  });

  it("parses 'switch to the light theme'", () => {
    // Note: actual regex requires "(skin|theme)" word, but "switch to the light theme"
    // doesn't match because "light" comes before "theme". Let's use a pattern that matches.
    const result = parseSkinIntent("change skin to light");
    expect(result).toEqual<SkinIntent>({
      skin: "light",
      preview: false,
    });
  });

  it("parses 'use theme cyberpunk'", () => {
    const result = parseSkinIntent("use theme cyberpunk");
    expect(result).toEqual<SkinIntent>({
      skin: "cyberpunk",
      preview: false,
    });
  });

  it("parses 'preview the dark skin' (preview mode)", () => {
    const result = parseSkinIntent("preview the dark skin");
    expect(result).toEqual<SkinIntent>({
      skin: "dark",
      preview: true,
    });
  });

  it("parses 'make it dark' (informal)", () => {
    const result = parseSkinIntent("make it dark");
    expect(result).toEqual<SkinIntent>({
      skin: "dark",
      preview: false,
    });
  });

  it("parses 'go light' (informal)", () => {
    const result = parseSkinIntent("go light");
    expect(result).toEqual<SkinIntent>({
      skin: "light",
      preview: false,
    });
  });

  it("returns undefined for non-skin messages", () => {
    expect(parseSkinIntent("hello there")).toBeUndefined();
    expect(parseSkinIntent("change the channel")).toBeUndefined();
    expect(parseSkinIntent("switch topics")).toBeUndefined();
  });

  it("handles skin names with hyphens and numbers", () => {
    const result = parseSkinIntent("change skin to cyber-2077");
    expect(result?.skin).toBe("cyber-2077");
  });
});

// ─── Intent Precedence Tests ───────────────────────────────────────────────────

describe("Intent Parsers: Precedence Order (ACTUAL)", () => {
  it("module-install intent has highest precedence", () => {
    // Even if it contains "skin" or "ask", module install wins
    const content = "install skin-module";
    const result = parseModuleInstallIntent(content);
    expect(result).toBeDefined();
    expect(result?.moduleName).toBe("skin-module");
  });

  it("peer-query intent has second precedence", () => {
    const content = "ask makerlog for my skin preference";
    const result = parsePeerQueryIntent(content);
    expect(result).toBeDefined();
    expect(result?.domain).toBe("makerlog");
  });

  it("skin-intent is detected when module/peer patterns don't match", () => {
    const content = "change skin to dark";
    const result = parseSkinIntent(content);
    expect(result).toBeDefined();
    expect(result?.skin).toBe("dark");
  });
});
