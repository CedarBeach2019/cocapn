/**
 * AuditLogger — append-only audit log for all agent and bridge actions.
 *
 * Written to cocapn/audit.log as newline-delimited JSON (never YAML — no parse ambiguity).
 * Secret values are masked before writing; the log is never encrypted so it can
 * be inspected without a key.
 *
 * Entry format:
 *   { ts, action, agent?, user?, command?, files?, result, durationMs? }
 */

import { appendFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Entry types ──────────────────────────────────────────────────────────────

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
  | "a2a.domain_verify";

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

// ─── AuditLogger ─────────────────────────────────────────────────────────────

export class AuditLogger {
  private logPath: string;
  private enabled: boolean;

  constructor(repoRoot: string, enabled = true) {
    this.logPath = join(repoRoot, "cocapn", "audit.log");
    this.enabled = enabled;
  }

  /**
   * Append a single audit entry.
   * Never throws — audit failure must not disrupt normal operation.
   */
  log(partial: Omit<AuditEntry, "ts"> & { ts?: string }): void {
    if (!this.enabled) return;
    try {
      mkdirSync(dirname(this.logPath), { recursive: true });
      const maskedDetail = partial.detail ? maskSecrets(partial.detail) : undefined;
      const entry: AuditEntry = {
        ts:         partial.ts ?? new Date().toISOString(),
        action:     partial.action,
        agent:      partial.agent,
        user:       partial.user,
        command:    partial.command ? maskSecrets(partial.command) : undefined,
        files:      partial.files,
        result:     partial.result,
        durationMs: partial.durationMs,
        ...(maskedDetail ? { detail: maskedDetail } : {}),
      };
      appendFileSync(this.logPath, JSON.stringify(entry) + "\n", "utf8");
    } catch {
      // Non-fatal — never interrupt the operation
    }
  }

  /** Convenience: start a timer and return a finish fn that logs with duration. */
  start(
    partial: Omit<AuditEntry, "ts" | "result" | "durationMs" | "detail">
  ): (result: AuditEntry["result"], detail?: string) => void {
    const started = Date.now();
    return (result, detail) => {
      this.log({
        ...partial,
        result,
        durationMs: Date.now() - started,
        ...(detail !== undefined ? { detail } : {}),
      });
    };
  }
}
