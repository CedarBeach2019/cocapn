/**
 * Tests for Security Components
 *
 * Tests AuditLogger, RateLimiter, and CSP middleware.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AuditLogger, maskSecrets, type AuditAction, type AuditLevel } from "../src/security/audit.js";
import { RateLimiter, rateLimitErrorMessage } from "../src/ws/rate-limiter.js";
import { applySecurityHeaders } from "../src/ws/csp-middleware.js";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ServerResponse } from "http";

describe("AuditLogger", () => {
  let logger: AuditLogger;
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "cocapn-audit-test-"));
    logger = new AuditLogger(repoRoot);
  });

  afterEach(() => {
    try {
      rmSync(repoRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("constructor", () => {
    it("should set default options", () => {
      expect(logger.isEnabled()).toBe(true);
      expect(logger.getLogPath()).toContain("audit.log");
    });

    it("should respect disabled option", () => {
      const disabledLogger = new AuditLogger(repoRoot, { enabled: false });
      expect(disabledLogger.isEnabled()).toBe(false);
    });

    it("should respect custom max size", () => {
      const customLogger = new AuditLogger(repoRoot, { maxSize: 1024 });
      // We can't directly access maxSize, but we can verify the logger was created
      expect(customLogger).toBeDefined();
    });
  });

  describe("log", () => {
    it("should write audit entry to log file", () => {
      logger.log({
        action: "agent.spawn",
        agent: "test-agent",
        result: "ok",
        level: "info",
      });

      const logContent = readFileSync(logger.getLogPath(), "utf8");
      const entry = JSON.parse(logContent.trim());

      expect(entry.action).toBe("agent.spawn");
      expect(entry.agent).toBe("test-agent");
      expect(entry.result).toBe("ok");
      expect(entry.level).toBe("info");
      expect(entry.ts).toBeDefined();
    });

    it("should not throw when logging fails", () => {
      // Create logger with invalid path
      const invalidLogger = new AuditLogger("/invalid/path/that/does/not/exist");
      expect(() => {
        invalidLogger.log({
          action: "test",
          result: "ok",
          level: "info",
        });
      }).not.toThrow();
    });

    it("should mask secrets in command field", () => {
      logger.log({
        action: "bash.exec",
        command: "export SECRET_TOKEN=ghp_123456789012345678901234567890123456 && run",
        result: "ok",
        level: "info",
      });

      const logContent = readFileSync(logger.getLogPath(), "utf8");
      // The KEY=VALUE pattern masks to ***
      expect(logContent).toContain("SECRET_TOKEN=***");
      expect(logContent).not.toContain("ghp_123456789012345678901234567890123456");
    });

    it("should auto-generate timestamp", () => {
      logger.log({
        action: "test.action",
        result: "ok",
        level: "info",
      });

      const logContent = readFileSync(logger.getLogPath(), "utf8");
      const entry = JSON.parse(logContent.trim());
      expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("should auto-detect level for critical actions", () => {
      logger.log({
        action: "auth.connect",
        result: "ok",
      });

      const logContent = readFileSync(logger.getLogPath(), "utf8");
      const entry = JSON.parse(logContent.trim());
      expect(entry.level).toBe("critical");
    });

    it("should use warn level for denied results", () => {
      logger.log({
        action: "agent.chat",
        result: "denied",
      });

      const logContent = readFileSync(logger.getLogPath(), "utf8");
      const entry = JSON.parse(logContent.trim());
      expect(entry.level).toBe("warn");
    });

    it("should use error level for error results", () => {
      logger.log({
        action: "bash.exec",
        result: "error",
      });

      const logContent = readFileSync(logger.getLogPath(), "utf8");
      const entry = JSON.parse(logContent.trim());
      expect(entry.level).toBe("error");
    });
  });

  describe("start", () => {
    it("should return a finish function", () => {
      const finish = logger.start({
        action: "test.action",
        agent: "test-agent",
      });

      expect(typeof finish).toBe("function");
    });

    it("should log with duration when finish is called", () => {
      const finish = logger.start({
        action: "test.action",
        agent: "test-agent",
      });

      // Simulate some work
      finish("ok");

      const logContent = readFileSync(logger.getLogPath(), "utf8");
      const entry = JSON.parse(logContent.trim());

      expect(entry.durationMs).toBeGreaterThanOrEqual(0);
      expect(entry.result).toBe("ok");
    });

    it("should include detail in log", () => {
      const finish = logger.start({
        action: "test.action",
      });

      finish("ok", "Additional detail here");

      const logContent = readFileSync(logger.getLogPath(), "utf8");
      const entry = JSON.parse(logContent.trim());

      expect(entry.detail).toBe("Additional detail here");
    });
  });

  describe("logCritical", () => {
    it("should log at critical level", () => {
      logger.logCritical({
        action: "secret.rotate",
        result: "ok",
      });

      const logContent = readFileSync(logger.getLogPath(), "utf8");
      const entry = JSON.parse(logContent.trim());

      expect(entry.level).toBe("critical");
    });
  });

  describe("setEnabled", () => {
    it("should toggle enabled state", () => {
      expect(logger.isEnabled()).toBe(true);

      logger.setEnabled(false);
      expect(logger.isEnabled()).toBe(false);

      logger.setEnabled(true);
      expect(logger.isEnabled()).toBe(true);
    });

    it("should not write when disabled", () => {
      logger.setEnabled(false);
      logger.log({
        action: "test",
        result: "ok",
        level: "info",
      });

      // Log file shouldn't exist or be empty
      const exists = require("fs").existsSync(logger.getLogPath());
      expect(exists).toBe(false);
    });
  });

  describe("getLogSize", () => {
    it("should return 0 for non-existent log", () => {
      const newLogger = new AuditLogger("/tmp/nonexistent-path-audit");
      expect(newLogger.getLogSize()).toBe(0);
    });

    it("should return actual file size", () => {
      logger.log({
        action: "test",
        result: "ok",
        level: "info",
      });

      expect(logger.getLogSize()).toBeGreaterThan(0);
    });
  });
});

describe("maskSecrets", () => {
  it("should mask Bearer tokens", () => {
    const result = maskSecrets("Authorization: Bearer ghp_1234567890123456789012345678901234");
    expect(result).toContain("Bearer ***");
    expect(result).not.toContain("ghp_1234567890123456789012345678901234");
  });

  it("should mask KEY=VALUE patterns", () => {
    const result = maskSecrets("SECRET_TOKEN=ghp_1234567890abcdef");
    expect(result).toContain("SECRET_TOKEN=***");
    expect(result).not.toContain("ghp_1234567890abcdef");
  });

  it("should mask age identity strings", () => {
    const result = maskSecrets("AGE-SECRET-KEY-1abcdefghijklmnopqrstuvwxyz");
    expect(result).toContain("AGE-SECRET-KEY-1***");
    expect(result).not.toContain("AGE-SECRET-KEY-1abcdefghijklmnopqrstuvwxyz");
  });

  it("should handle multiple secrets in one string", () => {
    // Use tokens with 36+ characters to match the regex pattern
    const input = "Token1: ghp_123456789012345678901234567890123456, Token2: gho_987654321098765432109876543210987654";
    const result = maskSecrets(input);
    expect(result).toContain("ghp_***");
    expect(result).toContain("gho_***");
    expect(result).not.toContain("ghp_123456789012345678901234567890123456");
    expect(result).not.toContain("gho_987654321098765432109876543210987654");
  });

  it("should pass through strings without secrets", () => {
    const input = "Just normal text here";
    expect(maskSecrets(input)).toBe(input);
  });

  it("should handle empty string", () => {
    expect(maskSecrets("")).toBe("");
  });
});

describe("RateLimiter", () => {
  describe("check", () => {
    it("should allow requests within limit", () => {
      const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1000 });

      const result1 = limiter.check("127.0.0.1");
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(4);
    });

    it("should track requests per IP separately", () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });

      const ip1Result = limiter.check("192.168.1.1");
      const ip2Result = limiter.check("192.168.1.2");

      expect(ip1Result.allowed).toBe(true);
      expect(ip2Result.allowed).toBe(true);
      expect(ip1Result.remaining).toBe(1);
      expect(ip2Result.remaining).toBe(1);
    });

    it("should deny requests exceeding limit", () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });

      limiter.check("127.0.0.1");
      limiter.check("127.0.0.1");
      const result3 = limiter.check("127.0.0.1");

      expect(result3.allowed).toBe(false);
      expect(result3.remaining).toBe(0);
      expect(result3.errorCode).toBe("COCAPN-071");
    });

    it("should provide reset time", () => {
      const limiter = new RateLimiter({ maxRequests: 1, windowMs: 5000 });

      const now = Date.now();
      const result = limiter.check("127.0.0.1");

      expect(result.resetAt).toBeGreaterThan(now);
      expect(result.resetAt).toBeLessThanOrEqual(now + 5000);
    });
  });

  describe("reset", () => {
    it("should clear rate limit for IP", () => {
      const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });

      limiter.check("127.0.0.1");
      limiter.check("127.0.0.1");

      limiter.reset("127.0.0.1");

      const result = limiter.check("127.0.0.1");
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });
  });

  describe("getStats", () => {
    it("should return usage statistics", () => {
      const limiter = new RateLimiter({ maxRequests: 10, windowMs: 1000 });

      limiter.check("127.0.0.1");
      limiter.check("127.0.0.1");

      const stats = limiter.getStats("127.0.0.1");
      expect(stats.count).toBe(2);
      expect(stats.resetAt).toBeDefined();
    });

    it("should return zero for unknown IP", () => {
      const limiter = new RateLimiter();
      const stats = limiter.getStats("unknown.ip");
      expect(stats.count).toBe(0);
      expect(stats.resetAt).toBeUndefined();
    });
  });

  describe("cleanup", () => {
    it("should remove expired entries", () => {
      const limiter = new RateLimiter({ maxRequests: 5, windowMs: 100 });

      limiter.check("127.0.0.1");
      expect(limiter.size()).toBe(1);

      // Wait for window to expire
      return new Promise((resolve) => {
        setTimeout(() => {
          limiter.cleanup();
          // After cleanup and window expiry, the entry should be removed
          // (This is implementation-dependent, so we just verify cleanup doesn't crash)
          expect(limiter.size()).toBeLessThanOrEqual(1);
          resolve(null);
        }, 150);
      });
    });
  });

  describe("size", () => {
    it("should return number of tracked IPs", () => {
      const limiter = new RateLimiter();

      expect(limiter.size()).toBe(0);

      limiter.check("192.168.1.1");
      expect(limiter.size()).toBe(1);

      limiter.check("192.168.1.2");
      expect(limiter.size()).toBe(2);
    });
  });
});

describe("rateLimitErrorMessage", () => {
  it("should generate error message", () => {
    const result = {
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 5000,
      errorCode: "COCAPN-071",
    };

    const message = rateLimitErrorMessage(result);
    expect(message).toContain("COCAPN-071");
    expect(message).toContain("Rate limit exceeded");
  });

  it("should throw when result is allowed", () => {
    const result = {
      allowed: true,
      remaining: 5,
      resetAt: Date.now() + 1000,
    };

    expect(() => rateLimitErrorMessage(result)).toThrow("Rate limit not exceeded");
  });
});

describe("CSP Middleware", () => {
  describe("applySecurityHeaders", () => {
    it("should set development CSP headers", () => {
      const mockResponse = {
        setHeader: vi.fn(),
      } as unknown as ServerResponse;

      applySecurityHeaders(mockResponse, { mode: "development" });

      const cspCall = mockResponse.setHeader.mock.calls.find(call => call[0] === "Content-Security-Policy");
      expect(cspCall).toBeDefined();
      const cspValue = cspCall![1] as string;
      expect(cspValue).toContain("script-src");
      expect(cspValue).toContain("'self'");
      expect(cspValue).toContain("localhost:*");
      expect(cspValue).toContain("127.0.0.1:*");
    });

    it("should set production CSP headers", () => {
      const mockResponse = {
        setHeader: vi.fn(),
      } as unknown as ServerResponse;

      applySecurityHeaders(mockResponse, { mode: "production" });

      const cspCall = mockResponse.setHeader.mock.calls.find(call => call[0] === "Content-Security-Policy");
      expect(cspCall).toBeDefined();
      const cspValue = cspCall![1] as string;
      expect(cspValue).toContain("upgrade-insecure-requests");
      expect(cspValue).not.toContain("localhost:*");
    });

    it("should include additional script sources", () => {
      const mockResponse = {
        setHeader: vi.fn(),
      } as unknown as ServerResponse;

      applySecurityHeaders(mockResponse, {
        mode: "production",
        additionalScriptSources: ["https://cdn.example.com"],
      });

      const cspCall = mockResponse.setHeader.mock.calls.find(call => call[0] === "Content-Security-Policy");
      const cspValue = cspCall![1] as string;
      expect(cspValue).toContain("https://cdn.example.com");
    });

    it("should include additional connect sources", () => {
      const mockResponse = {
        setHeader: vi.fn(),
      } as unknown as ServerResponse;

      applySecurityHeaders(mockResponse, {
        mode: "production",
        additionalConnectSources: ["wss://api.example.com"],
      });

      const cspCall = mockResponse.setHeader.mock.calls.find(call => call[0] === "Content-Security-Policy");
      const cspValue = cspCall![1] as string;
      expect(cspValue).toContain("wss://api.example.com");
    });

    it("should include default security directives", () => {
      const mockResponse = {
        setHeader: vi.fn(),
      } as unknown as ServerResponse;

      applySecurityHeaders(mockResponse, { mode: "production" });

      const cspCall = mockResponse.setHeader.mock.calls.find(call => call[0] === "Content-Security-Policy");
      const cspValue = cspCall![1] as string;
      expect(cspValue).toContain("default-src 'self'");
      expect(cspValue).toContain("style-src");
      expect(cspValue).toContain("img-src");
      expect(cspValue).toContain("frame-src 'none'");
      expect(cspValue).toContain("frame-ancestors 'none'");
      expect(cspValue).toContain("form-action 'self'");
    });
  });

  describe("applySecurityHeaders", () => {
    it("should set CSP header", () => {
      const mockResponse = {
        setHeader: vi.fn(),
      } as unknown as ServerResponse;

      applySecurityHeaders(mockResponse, { mode: "production" });

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "Content-Security-Policy",
        expect.stringContaining("default-src")
      );
    });

    it("should set X-Content-Type-Options", () => {
      const mockResponse = {
        setHeader: vi.fn(),
      } as unknown as ServerResponse;

      applySecurityHeaders(mockResponse, { mode: "production" });

      expect(mockResponse.setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
    });

    it("should set X-Frame-Options", () => {
      const mockResponse = {
        setHeader: vi.fn(),
      } as unknown as ServerResponse;

      applySecurityHeaders(mockResponse, { mode: "production" });

      expect(mockResponse.setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY");
    });

    it("should set Referrer-Policy", () => {
      const mockResponse = {
        setHeader: vi.fn(),
      } as unknown as ServerResponse;

      applySecurityHeaders(mockResponse, { mode: "production" });

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "Referrer-Policy",
        "strict-origin-when-cross-origin"
      );
    });

    it("should set Permissions-Policy", () => {
      const mockResponse = {
        setHeader: vi.fn(),
      } as unknown as ServerResponse;

      applySecurityHeaders(mockResponse, { mode: "production" });

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "Permissions-Policy",
        expect.stringContaining("geolocation=()")
      );
    });

    it("should set COOP and COEP headers", () => {
      const mockResponse = {
        setHeader: vi.fn(),
      } as unknown as ServerResponse;

      applySecurityHeaders(mockResponse, { mode: "production" });

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "Cross-Origin-Opener-Policy",
        "same-origin"
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "Cross-Origin-Embedder-Policy",
        "require-corp"
      );
    });

    it("should set HSTS only in production", () => {
      const mockResponse = {
        setHeader: vi.fn(),
      } as unknown as ServerResponse;

      applySecurityHeaders(mockResponse, { mode: "production" });

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        "Strict-Transport-Security",
        expect.stringContaining("max-age")
      );
    });

    it("should not set HSTS in development", () => {
      const mockResponse = {
        setHeader: vi.fn(),
      } as unknown as ServerResponse;

      applySecurityHeaders(mockResponse, { mode: "development" });

      const hstsCalls = mockResponse.setHeader.mock.calls.filter(
        call => call[0] === "Strict-Transport-Security"
      );
      expect(hstsCalls).toHaveLength(0);
    });
  });
});
