/**
 * Tests for web-wizard.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "http";
import { getWizardHtml, startWebWizard } from "../src/web-wizard.js";

// ─── getWizardHtml ────────────────────────────────────────────────────────────

describe("getWizardHtml", () => {
  it("returns a complete HTML page", () => {
    const html = getWizardHtml();
    expect(html.includes("<!DOCTYPE html>")).toBe(true);
    expect(html.includes("</html>")).toBe(true);
  });

  it("includes agent name input field", () => {
    const html = getWizardHtml();
    expect(html.includes("agentName")).toBe(true);
  });

  it("includes username input field", () => {
    const html = getWizardHtml();
    expect(html.includes("username")).toBe(true);
  });

  it("includes deployment selection grid", () => {
    const html = getWizardHtml();
    expect(html.includes("deploy-grid")).toBe(true);
    expect(html.includes("deploy-option")).toBe(true);
  });

  it("includes local deployment option", () => {
    const html = getWizardHtml();
    expect(html.includes("local")).toBe(true);
  });

  it("includes cloudflare deployment option", () => {
    const html = getWizardHtml();
    expect(html.includes("cloudflare")).toBe(true);
  });

  it("includes JavaScript for interactivity", () => {
    const html = getWizardHtml();
    expect(html.includes("<script>")).toBe(true);
    expect(html.includes("createRepos")).toBe(true);
    expect(html.includes("checkAuth")).toBe(true);
  });

  it("has dark theme CSS variables", () => {
    const html = getWizardHtml();
    expect(html.includes("--bg")).toBe(true);
    expect(html.includes("--text")).toBe(true);
    expect(html.includes("--accent")).toBe(true);
  });

  it("contains progress bar", () => {
    const html = getWizardHtml();
    expect(html.includes("progress-bar")).toBe(true);
    expect(html.includes("progress-fill")).toBe(true);
  });

  it("has 5 steps", () => {
    const html = getWizardHtml();
    expect(html.includes("step1")).toBe(true);
    expect(html.includes("step2")).toBe(true);
    expect(html.includes("step3")).toBe(true);
    expect(html.includes("step4")).toBe(true);
    expect(html.includes("step5")).toBe(true);
  });

  it("includes QR code section", () => {
    const html = getWizardHtml();
    expect(html.includes("qrCode") || html.includes("qr")).toBe(true);
  });

  it("includes fetch calls to API endpoints", () => {
    const html = getWizardHtml();
    expect(html.includes("/onboard/api/")).toBe(true);
  });
});

// ─── startWebWizard ───────────────────────────────────────────────────────────

describe("startWebWizard", () => {
  let server: Server | undefined;
  const testPort = 13999;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });

  it("starts an HTTP server on the given port", async () => {
    server = startWebWizard({ port: testPort });

    await new Promise<void>((resolve) => {
      server!.on("listening", resolve);
    });

    const res = await fetch(`http://localhost:${testPort}/onboard`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");

    const body = await res.text();
    expect(body.includes("<!DOCTYPE html>")).toBe(true);
  });

  it("redirects / to /onboard", async () => {
    server = startWebWizard({ port: testPort + 1 });

    await new Promise<void>((resolve) => {
      server!.on("listening", resolve);
    });

    const res = await fetch(`http://localhost:${testPort + 1}/`, {
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/onboard");
  });

  it("returns 404 for unknown paths", async () => {
    server = startWebWizard({ port: testPort + 2 });

    await new Promise<void>((resolve) => {
      server!.on("listening", resolve);
    });

    const res = await fetch(`http://localhost:${testPort + 2}/unknown-path`);
    expect(res.status).toBe(404);
  });

  it("handles CORS preflight", async () => {
    server = startWebWizard({ port: testPort + 3 });

    await new Promise<void>((resolve) => {
      server!.on("listening", resolve);
    });

    const res = await fetch(`http://localhost:${testPort + 3}/onboard/api/gh-status`, {
      method: "OPTIONS",
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("responds to /onboard/api/qr", async () => {
    server = startWebWizard({ port: testPort + 4 });

    await new Promise<void>((resolve) => {
      server!.on("listening", resolve);
    });

    const res = await fetch(`http://localhost:${testPort + 4}/onboard/api/qr`);
    expect(res.status).toBe(200);
    const data = await res.json() as { url: string };
    expect(typeof data.url).toBe("string");
    expect(data.url.includes("localhost")).toBe(true);
  });
});
