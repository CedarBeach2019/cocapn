/**
 * Tests for installer.ts
 */

import { describe, it, expect } from "vitest";
import {
  validatePrerequisites,
  generateInstallScript,
  type InstallerOptions,
} from "../src/installer.js";

// ─── validatePrerequisites ────────────────────────────────────────────────────

describe("validatePrerequisites", () => {
  it("returns an object with ok and errors", () => {
    const result = validatePrerequisites();
    expect(typeof result.ok).toBe("boolean");
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it("passes on a dev machine (Node and git should be available)", () => {
    const result = validatePrerequisites();
    // In a test environment, Node.js and git should be present
    expect(result.ok).toBe(true);
    expect(result.errors.length).toBe(0);
  });
});

// ─── generateInstallScript ────────────────────────────────────────────────────

describe("generateInstallScript", () => {
  it("returns a bash script", () => {
    const script = generateInstallScript();
    expect(script.startsWith("#!/usr/bin/env bash")).toBe(true);
  });

  it("checks for Node.js", () => {
    const script = generateInstallScript();
    expect(script.includes("node")).toBe(true);
    expect(script.includes("NODE_VERSION")).toBe(true);
  });

  it("checks for git", () => {
    const script = generateInstallScript();
    expect(script.includes("git")).toBe(true);
  });

  it("runs npx create-cocapn", () => {
    const script = generateInstallScript();
    expect(script.includes("npx create-cocapn")).toBe(true);
  });

  it("has set -euo pipefail for safety", () => {
    const script = generateInstallScript();
    expect(script.includes("set -euo pipefail")).toBe(true);
  });

  it("checks Node.js version is >= 18", () => {
    const script = generateInstallScript();
    expect(script.includes("18")).toBe(true);
  });

  it("installs Node.js if missing", () => {
    const script = generateInstallScript();
    expect(script.includes("nodesource")).toBe(true);
  });
});
