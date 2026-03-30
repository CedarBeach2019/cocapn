/**
 * cocapn serve — Serve web UI locally with API proxy
 */

import { Command } from "commander";
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "http";
import { existsSync, readFileSync, statSync } from "fs";
import { join, resolve, extname } from "path";

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  gray: "\x1b[90m",
};

const green = (s: string) => `${colors.green}${s}${colors.reset}`;
const cyan = (s: string) => `${colors.cyan}${s}${colors.reset}`;
const yellow = (s: string) => `${colors.yellow}${s}${colors.reset}`;
const bold = (s: string) => `${colors.bold}${s}${colors.reset}`;

const DEFAULT_PORT = 3100;

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

export function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

export interface ServeOptions {
  port: string;
  open: boolean;
  production: boolean;
  repo: string;
}

export function resolveUiDir(): string | null {
  const candidates = [
    resolve(process.cwd(), "packages", "ui-minimal"),
    resolve(process.cwd(), "ui-minimal"),
    resolve(__dirname, "../../ui-minimal"),
  ];

  for (const dir of candidates) {
    if (existsSync(join(dir, "index.html"))) {
      return dir;
    }
  }

  return null;
}

function serveStatic(uiDir: string, req: IncomingMessage, res: ServerResponse): void {
  let urlPath = req.url?.split("?")[0] || "/";

  // Serve index.html for / and SPA-style routes
  if (urlPath === "/") {
    urlPath = "/index.html";
  }

  const filePath = join(uiDir, urlPath);

  if (!filePath.startsWith(uiDir)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    // SPA fallback — serve index.html for unknown routes
    const indexPath = join(uiDir, "index.html");
    if (existsSync(indexPath)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(readFileSync(indexPath));
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
    return;
  }

  const mime = getMimeType(filePath);
  res.writeHead(200, { "Content-Type": mime });
  res.end(readFileSync(filePath));
}

export function createServeHandler(uiDir: string, bridgePort: number) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    const url = req.url || "/";

    // Proxy /api/* to bridge server
    if (url.startsWith("/api/")) {
      proxyToBridge(req, res, bridgePort);
      return;
    }

    serveStatic(uiDir, req, res);
  };
}

function proxyToBridge(req: IncomingMessage, res: ServerResponse, bridgePort: number): void {
  const http = require("http") as typeof import("http");

  const proxyReq = http.request(
    {
      hostname: "127.0.0.1",
      port: bridgePort,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${bridgePort}`,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", () => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Bridge not running", code: "BRIDGE_OFFLINE" }));
  });

  req.pipe(proxyReq);
}

export function createServeCommand(): Command {
  return new Command("serve")
    .description("Serve web UI locally with API proxy")
    .option("-p, --port <port>", "Port to serve on", String(DEFAULT_PORT))
    .option("--no-open", "Don't open browser automatically")
    .option("--production", "Minified, no HMR")
    .option("--repo <path>", "Path to cocapn repo", process.cwd())
    .action(async (options: ServeOptions) => {
      const port = parseInt(options.port, 10);
      const uiDir = resolveUiDir();

      if (!uiDir) {
        console.error(yellow("x") + " Could not find ui-minimal package");
        console.error(`  Looked in: packages/ui-minimal/, ui-minimal/`);
        console.error(`  Run ${cyan("npm install")} in the monorepo root first.`);
        process.exit(1);
      }

      if (!existsSync(join(uiDir, "index.html"))) {
        console.error(yellow("x") + ` ${uiDir} has no index.html`);
        process.exit(1);
      }

      console.log(cyan(">") + " Starting Cocapn Web UI");
      console.log(`${colors.gray}  UI:     ${uiDir}${colors.reset}`);
      console.log(`${colors.gray}  Port:   ${port}${colors.reset}`);
      console.log(`${colors.gray}  Mode:   ${options.production ? "production" : "development"}${colors.reset}\n`);

      const server: Server = createServer(createServeHandler(uiDir, DEFAULT_PORT));

      server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          console.error(yellow("x") + ` Port ${port} is already in use`);
          console.error(`  Try: ${cyan(`cocapn serve --port ${port + 1}`)}`);
          process.exit(1);
        }
        console.error(yellow("x") + ` Server error: ${err.message}`);
        process.exit(1);
      });

      await new Promise<void>((resolve) => {
        server.listen(port, () => {
          const url = `http://localhost:${port}`;
          console.log(green("+") + ` Web UI running at ${bold(url)}`);
          console.log(`${colors.gray}  API proxy → bridge on port ${DEFAULT_PORT}${colors.reset}`);

          if (options.open) {
            openBrowser(url);
          } else {
            console.log(`\n  Press Ctrl+C to stop.`);
          }

          resolve();
        });
      });

      // Graceful shutdown
      const shutdown = () => {
        console.log(`\n${yellow(">")} Stopping web UI...`);
        server.close(() => process.exit(0));
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      // Keep alive
      await new Promise(() => {});
    });
}

function openBrowser(url: string): void {
  const { exec } = require("child_process") as typeof import("child_process");
  const cmd = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? "start"
      : "xdg-open";

  exec(`${cmd} "${url}"`, (err) => {
    if (err) {
      console.log(`\n  Open this URL in your browser: ${cyan(url)}`);
    }
  });
}
