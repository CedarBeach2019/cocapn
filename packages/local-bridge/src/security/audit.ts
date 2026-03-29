/**
 * AuditLogger — append-only audit log for all agent and bridge actions.
 *
 * Written to cocapn/audit.log as newline-delimited JSON (never YAML — no parse ambiguity).
 * Secret values are masked before writing; the log is never encrypted so it can
 * be inspected without a key.
 *
 * Features:
 *   - Automatic log rotation at configurable size
 *   - Severity levels for filtering
 *   - Critical action tracking for compliance
 *
 * Entry format:
 *   { ts, action, agent?, user?, command?, files?, result, level, durationMs? }
 */

import { appendFileSync, existsSync, mkdirSync, statSync, renameSync } from "fs";
import { join, dirname } from "path";

// ─── Entry types ──────────────────────────────────────────────────────────────

/** Severity level for audit entries */
export type AuditLevel = "info" | "warn" | "error" | "critical";

export type AuditAction =
  | "agent.spawn"
  | "agent.stop"
  | "agent.chat"
  | "agent.tool_call"
  | "bash.exec"
  | "file.edit"
  | "file.commit"
  | "secret.init"
  | "secret.add"
  | "secret.get"
  | "secret.rotate"
  | "token.set"
  | "token.verify"
  | "module.install"
  | "module.remove"
  | "module.update"
  | "module.enable"
  | "module.disable"
  | "auth.connect"
  | "auth.reject"
  | "a2a.route"
  | "a2a.domain_verify"
  | "streaming.diff.start"
  | "streaming.diff.chunk"
  | "streaming.diff.finalize"
  | "streaming.diff.rollback";

export interface AuditEntry {
  ts:          string;
  action:      AuditAction;
  /** Agent id performing the action (when applicable) */
  agent:       string | undefined;
  /** GitHub login of the connected user */
  user:        string | undefined;
  /** Shell command (bash.exec) */
  command:     string | undefined;
  /** Files touched */
  files:       string[] | undefined;
  /** Success/failure/outcome */
  result:      "ok" | "error" | "denied";
  /** Severity level for filtering and alerting */
  level:       AuditLevel;
  /** Details — secret values already masked */
  detail?:     string;
  /** Elapsed milliseconds */
  durationMs:  number | undefined;
}

// ─── Secret masking ───────────────────────────────────────────────────────────

const SECRET_KEY_RE = /(?:secret|token|password|key|api_?key|pat|auth|bearer|identity)/i;

/**
 * Mask any value that looks like a secret in a command or detail string.
 * Replaces the VALUE in KEY=VALUE patterns and Bearer tokens.
 */
export function maskSecrets(text: string): string {
  if (!text) return text;
  return text
    // KEY=VALUE where key looks like a secret
    .replace(
      /([A-Z_a-z]+(?:SECRET|TOKEN|PASSWORD|KEY|PAT|AUTH|IDENTITY)[A-Z_a-z]*)=(["']?)(\S+?)\2(?=\s|$)/gi,
      (_m, k: string, q: string) => `${k}=${q}***${q}`
    )
    // Bearer tokens
    .replace(/Bearer\s+\S{8,}/gi, "Bearer ***")
    // age identity strings
    .replace(/AGE-SECRET-KEY-1[a-z0-9]+/gi, "AGE-SECRET-KEY-1***")
    // Raw PAT tokens
    .replace(/\bghp_[A-Za-z0-9]{36,}/g, "ghp_***")
    .replace(/\bgho_[A-Za-z0-9]{36,}/g, "gho_***");
}

// ─── Critical Actions ──────────────────────────────────────────────────────────

/**
 * Actions that are considered critical for security/compliance.
 * These should always be logged at "critical" level and may trigger alerts.
 */
const CRITICAL_ACTIONS = new Set<AuditAction>([
  "auth.connect",
  "auth.reject",
  "secret.init",
  "secret.rotate",
  "token.set",
  "module.install",
  "module.remove",
]);

/**
 * Determine the appropriate log level for an action and result.
 */
function getDefaultLevel(action: AuditAction, result: AuditEntry["result"]): AuditLevel {
  if (result === "denied") return "warn";
  if (result === "error") return "error";
  if (CRITICAL_ACTIONS.has(action)) return "critical";
  return "info";
}

// ─── AuditLogger ─────────────────────────────────────────────────────────────

export interface AuditLoggerOptions {
  /** Maximum size of audit log before rotation (default: 10MB) */
  maxSize?: number;
  /** Number of rotated logs to keep (default: 5) */
  maxFiles?: number;
  /** Enable or disable logging */
  enabled?: boolean;
}

export class AuditLogger {
  private logPath: string;
  private logDir: string;
  private enabled: boolean;
  private maxSize: number;
  private maxFiles: number;

  constructor(repoRoot: string, options: AuditLoggerOptions = {}) {
    this.logDir = join(repoRoot, "cocapn");
    this.logPath = join(this.logDir, "audit.log");
    this.enabled = options.enabled ?? true;
    this.maxSize = options.maxSize ?? 10 * 1024 * 1024; // 10MB default
    this.maxFiles = options.maxFiles ?? 5;
  }

  /**
   * Append a single audit entry.
   * Never throws — audit failure must not disrupt normal operation.
   */
  log(partial: Omit<AuditEntry, "ts" | "level"> & { ts?: string; level?: AuditLevel }): void {
    if (!this.enabled) return;
    try {
      mkdirSync(this.logDir, { recursive: true });

      // Check for log rotation before writing
      this.rotateIfNeeded();

      const level = partial.level ?? getDefaultLevel(partial.action, partial.result);
      const maskedDetail = partial.detail ? maskSecrets(partial.detail) : undefined;
      const entry: AuditEntry = {
        ts:         partial.ts ?? new Date().toISOString(),
        action:     partial.action,
        agent:      partial.agent,
        user:       partial.user,
        command:    partial.command ? maskSecrets(partial.command) : undefined,
        files:      partial.files,
        result:     partial.result,
        level,
        durationMs: partial.durationMs,
        ...(maskedDetail ? { detail: maskedDetail } : {}),
      };
      appendFileSync(this.logPath, JSON.stringify(entry) + "\n", "utf8");
    } catch {
      // Non-fatal — never interrupt the operation
    }
  }

  /**
   * Convenience: start a timer and return a finish fn that logs with duration.
   */
  start(
    partial: Omit<AuditEntry, "ts" | "result" | "durationMs" | "detail" | "level"> & { level?: AuditLevel }
  ): (result: AuditEntry["result"], detail?: string) => void {
    const started = Date.now();
    const level = partial.level;
    return (result, detail) => {
      const finalLevel = level ?? getDefaultLevel(partial.action, result);
      this.log({
        ...partial,
        result,
        level: finalLevel,
        durationMs: Date.now() - started,
        ...(detail !== undefined ? { detail } : {}),
      });
    };
  }

  /**
   * Check if log rotation is needed and perform it.
   * Rotation happens when the current log exceeds maxSize.
   */
  private rotateIfNeeded(): void {
    try {
      if (!existsSync(this.logPath)) return;

      const stats = statSync(this.logPath);
      if (stats.size < this.maxSize) return;

      // Rotate logs: audit.log.1, audit.log.2, etc.
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const oldPath = i === 1 ? this.logPath : join(this.logDir, `audit.log.${i}`);
        const newPath = join(this.logDir, `audit.log.${i + 1}`);

        if (existsSync(oldPath)) {
          if (i === this.maxFiles - 1) {
            // Delete the oldest log if we've reached maxFiles
            const { unlinkSync } = require("fs");
            unlinkSync(newPath).catch(() => {});
          }
          renameSync(oldPath, newPath);
        }
      }

      // The first rotation is just renaming the current log
      const rotatedPath = join(this.logDir, "audit.log.1");
      renameSync(this.logPath, rotatedPath);
    } catch {
      // Non-fatal — rotation failures shouldn't break the app
    }
  }

  /**
   * Log a critical action with explicit level.
   * Critical actions are those that affect security or compliance.
   */
  logCritical(partial: Omit<AuditEntry, "ts" | "level"> & { ts?: string }): void {
    this.log({ ...partial, level: "critical" });
  }

  /**
   * Get the current size of the audit log in bytes.
   * Returns 0 if the log doesn't exist.
   */
  getLogSize(): number {
    try {
      if (!existsSync(this.logPath)) return 0;
      return statSync(this.logPath).size;
    } catch {
      return 0;
    }
  }

  /**
   * Get the path to the audit log.
   */
  getLogPath(): string {
    return this.logPath;
  }

  /**
   * Enable or disable logging.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if logging is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
