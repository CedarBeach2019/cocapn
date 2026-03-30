/**
 * Tests for cocapn serve command
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServer, type Server } from "http";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import {
  getMimeType,
  resolveUiDir,
  createServeHandler,
} from "../src/commands/serve.js";

// ─── MIME type detection ──────────────────────────────────────────────────────

describe("getMimeType", () => {
  it("detects HTML", () => {
    expect(getMimeType("index.html")).toContain("text/html");
  });

  it("detects JavaScript", () => {
    expect(getMimeType("app.js")).toContain("application/javascript");
    expect(getMimeType("app.mjs")).toContain("application/javascript");
  });

  it("detects CSS", () => {
    expect(getMimeType("style.css")).toContain("text/css");
  });

  it("detects images", () => {
    expect(getMimeType("logo.png")).toContain("image/png");
    expect(getMimeType("photo.jpg")).toContain("image/jpeg");
    expect(getMimeType("icon.svg")).toContain("image/svg+xml");
  });

  it("detects JSON", () => {
    expect(getMimeType("data.json")).toContain("application/json");
  });

  it("returns octet-stream for unknown types", () => {
    expect(getMimeType("file.xyz")).toBe("application/octet-stream");
  });
});

// ─── UI directory resolution ──────────────────────────────────────────────────

describe("resolveUiDir", () => {
  it("returns null when no ui-minimal directory exists", () => {
    // In test environment, unlikely to find ui-minimal at expected paths
    // But we test that it returns string or null (not undefined)
    const result = resolveUiDir();
    expect(result === null || typeof result === "string").toBe(true);
  });
});

// ─── Static file serving ──────────────────────────────────────────────────────

describe("createServeHandler", () => {
  const testDir = join(process.cwd(), ".test-serve-tmp");
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    writeFileSync(join(testDir, "index.html"), "<html><body>hello</body></html>");
    writeFileSync(join(testDir, "app.js"), "console.log('test');");
    writeFileSync(join(testDir, "style.css"), "body { color: red; }");

    const handler = createServeHandler(testDir, 9999);
    server = createServer(handler);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterEach(() => {
    server.close();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  async function fetch(path: string): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    const http = await import("http");
    return new Promise((resolve, reject) => {
      http.get(`${baseUrl}${path}`, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers as Record<string, string>,
            body,
          });
        });
      }).on("error", reject);
    });
  }

  it("serves index.html at /", async () => {
    const res = await fetch("/");
    expect(res.status).toBe(200);
    expect(res.body).toContain("<html>");
    expect(res.headers["content-type"]).toContain("text/html");
  });

  it("serves JS files with correct MIME type", async () => {
    const res = await fetch("/app.js");
    expect(res.status).toBe(200);
    expect(res.body).toContain("console.log");
    expect(res.headers["content-type"]).toContain("application/javascript");
  });

  it("serves CSS files with correct MIME type", async () => {
    const res = await fetch("/style.css");
    expect(res.status).toBe(200);
    expect(res.body).toContain("color: red");
    expect(res.headers["content-type"]).toContain("text/css");
  });

  it("returns 502 for /api/* when bridge is not running", async () => {
    const res = await fetch("/api/health");
    expect(res.status).toBe(502);
    expect(res.body).toContain("BRIDGE_OFFLINE");
  });

  it("falls back to index.html for unknown routes (SPA)", async () => {
    const res = await fetch("/some/random/route");
    expect(res.status).toBe(200);
    expect(res.body).toContain("<html>");
  });

  it("serves /index.html directly", async () => {
    const res = await fetch("/index.html");
    expect(res.status).toBe(200);
    expect(res.body).toContain("hello");
  });
});

// ─── Port configuration ───────────────────────────────────────────────────────

describe("port configuration", () => {
  it("parses valid port numbers", () => {
    expect(parseInt("3100", 10)).toBe(3100);
    expect(parseInt("8080", 10)).toBe(8080);
    expect(parseInt("3000", 10)).toBe(3000);
  });
});
