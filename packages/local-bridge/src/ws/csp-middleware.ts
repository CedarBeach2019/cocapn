/**
 * CSP Middleware — Content Security Policy and security headers for HTTP responses.
 *
 * Adds security headers to HTTP responses to protect against:
 *   - XSS attacks via Content-Security-Policy
 *   - Clickjacking via X-Frame-Options and frame-ancestors
 *   - MIME sniffing via X-Content-Type-Options
 *   - Referrer leakage via Referrer-Policy
 *
 * Usage:
 *   applySecurityHeaders(res, { mode: "development" });
 */

import type { ServerResponse } from "http";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SecurityHeaderOptions {
  /** Mode determines strictness of CSP rules */
  mode: "development" | "production";
  /** Additional script sources to allow (e.g., CDN URLs) */
  additionalScriptSources?: string[];
  /** Additional connect sources to allow (e.g., API endpoints) */
  additionalConnectSources?: string[];
}

// ─── CSP Policies ──────────────────────────────────────────────────────────────

/**
 * Generate Content-Security-Policy header value.
 *
 * Development mode: more permissive for easier debugging
 * Production mode: stricter, only allows self and esm.sh for UI
 */
function generateCSP(options: SecurityHeaderOptions): string {
  const isDev = options.mode === "development";

  // Script sources
  const scriptSources = [
    "'self'",
    "esm.sh", // For Vite UI module imports
    ...(options.additionalScriptSources || []),
  ].join(" ");

  // Connect sources (WebSocket, AJAX)
  const connectSources = [
    "'self'",
    "ws:",
    "wss:",
    ...(isDev ? ["localhost:*", "127.0.0.1:*"] : []),
    ...(options.additionalConnectSources || []),
  ].join(" ");

  // Default sources (fallback for all other resource types)
  const defaultSrc = "'self'";

  // Style sources (CSS)
  const styleSrc = ["'self'", "'unsafe-inline'"].join(" ");

  // Image sources
  const imgSrc = ["'self'", "data:", "https:"].join(" ");

  // Font sources
  const fontSrc = "'self'";

  // Frame sources (prevent framing)
  const frameSrc = "'none'";

  // Frame ancestors (prevent being embedded in frames)
  const frameAncestors = "'none'";

  // Base URI
  const baseUri = "'self'";

  // Form action
  const formAction = "'self'";

  const directives = [
    `default-src ${defaultSrc}`,
    `script-src ${scriptSources}`,
    `connect-src ${connectSources}`,
    `style-src ${styleSrc}`,
    `img-src ${imgSrc}`,
    `font-src ${fontSrc}`,
    `frame-src ${frameSrc}`,
    `frame-ancestors ${frameAncestors}`,
    `base-uri ${baseUri}`,
    `form-action ${formAction}`,
    // Prevent loading of resources over HTTP in production
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
    // Report CSP violations to a reporting endpoint (if configured)
    // ...(options.reportUri ? [`report-uri ${options.reportUri}`] : []),
  ].join("; ");

  return directives;
}

// ─── Middleware Function ───────────────────────────────────────────────────────

/**
 * Apply security headers to an HTTP response.
 *
 * Adds the following headers:
 *   - Content-Security-Policy: restricts resource sources
 *   - X-Content-Type-Options: nosniff (prevent MIME sniffing)
 *   - X-Frame-Options: DENY (prevent clickjacking)
 *   - Referrer-Policy: strict-origin-when-cross-origin
 *   - Permissions-Policy: restricts browser features
 *   - Cross-Origin-Opener-Policy: same-origin (process isolation)
 *   - Cross-Origin-Embedder-Policy: require-corp (prevent COOP/COEP bypass)
 */
export function applySecurityHeaders(
  res: ServerResponse,
  options: SecurityHeaderOptions = { mode: "production" }
): void {
  // Content-Security-Policy
  const csp = generateCSP(options);
  res.setHeader("Content-Security-Policy", csp);

  // X-Content-Type-Options: prevents MIME sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // X-Frame-Options: prevents clickjacking (legacy, superseded by CSP frame-ancestors)
  res.setHeader("X-Frame-Options", "DENY");

  // Referrer-Policy: controls how much referrer info is sent
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions-Policy: restricts browser features
  const permissionsPolicy = [
    "geolocation=()",
    "microphone=()",
    "camera=()",
    "payment=()",
    "usb=()",
    "magnetometer=()",
    "gyroscope=()",
    "accelerometer=()",
    "ambient-light-sensor=()",
  ].join(", ");
  res.setHeader("Permissions-Policy", permissionsPolicy);

  // Cross-Origin-Opener-Policy: process isolation
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");

  // Cross-Origin-Embedder-Policy: prevent COOP/COEP bypass
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");

  // Strict-Transport-Security: enforce HTTPS (only in production with valid cert)
  if (options.mode === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

/**
 * Create a Node.js middleware wrapper for use with http.createServer.
 */
export function createSecurityMiddleware(options: SecurityHeaderOptions = { mode: "production" }) {
  return (_req: unknown, res: ServerResponse, next: () => void): void => {
    applySecurityHeaders(res, options);
    next();
  };
}
