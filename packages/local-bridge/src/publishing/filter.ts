/**
 * PublishingFilter — enforces public/private boundary on outgoing data.
 *
 * Two core responsibilities:
 *   1. filterFacts(facts)   — strip keys starting with "private."
 *   2. sanitizeResponse(text) — catch accidental PII leaks (emails, phones, API keys)
 *   3. isPublicSafe(entry)  — check if a MemoryEntry is safe for public consumption
 *
 * The filter is applied to all data before it reaches public-facing endpoints
 * (HTTP API, published profile, A2A responses to untrusted peers).
 */

import type { MemoryEntry, MemoryType } from "../brain/memory-manager.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Fact visibility level assigned by the filter. */
export type Visibility = "public" | "private" | "sensitive";

// ─── PII regex patterns ───────────────────────────────────────────────────────

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

const PHONE_RE =
  /(?:(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{4})\b/g;

/**
 * Matches common API key / token patterns:
 *   - sk-...  (Stripe, OpenAI)
 *   - ghp_... (GitHub PAT)
 *   - gho_... (GitHub OAuth)
 *   - xox[bprsa]-... (Slack tokens)
 *   - AKIA... (AWS access key IDs)
 *   - Bearer <token>
 *   - 40-char hex (common secret format)
 */
const API_KEY_RE =
  /\b(?:sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|xox[bprsa]-[A-Za-z0-9-]{10,}|AKIA[A-Z0-9]{16}|Bearer\s+[A-Za-z0-9\-._~+/]+=*)/gi;

/**
 * Generic long-hex-string heuristic (32+ hex chars, likely a secret).
 * Excludes common non-secret patterns (UUIDs in prose, short hashes).
 */
const HEX_SECRET_RE = /\b[0-9a-f]{40,}\b/gi;

// ─── PublishingFilter ─────────────────────────────────────────────────────────

export class PublishingFilter {
  // ---------------------------------------------------------------------------
  // Fact filtering
  // ---------------------------------------------------------------------------

  /**
   * Strip all fact keys that start with "private." from a facts record.
   * Returns a new object — the input is not mutated.
   */
  filterFacts(facts: Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(facts)) {
      if (!key.startsWith("private.")) {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Classify the visibility of a single fact key.
   */
  classifyFact(key: string): Visibility {
    if (key.startsWith("private.")) return "private";
    if (key.startsWith("sensitive.") || key.startsWith("secret.")) return "sensitive";
    return "public";
  }

  // ---------------------------------------------------------------------------
  // PII sanitization
  // ---------------------------------------------------------------------------

  /**
   * Sanitize a response string by redacting accidental PII leaks.
   * Catches emails, phone numbers, and common API key patterns.
   * Returns the sanitized string with matches replaced by `[REDACTED]`.
   */
  sanitizeResponse(text: string): string {
    let out = text;

    out = out.replace(EMAIL_RE, "[REDACTED]");
    out = out.replace(PHONE_RE, (match) => {
      // Only redact if it looks like a real phone number (7+ digits)
      const digits = match.replace(/\D/g, "");
      return digits.length >= 7 ? "[REDACTED]" : match;
    });
    out = out.replace(API_KEY_RE, "[REDACTED]");
    out = out.replace(HEX_SECRET_RE, "[REDACTED]");

    return out;
  }

  // ---------------------------------------------------------------------------
  // MemoryEntry safety check
  // ---------------------------------------------------------------------------

  /**
   * Check whether a MemoryEntry is safe for public consumption.
   *
   * Rules:
   *   - Only 'explicit' type entries can be public.
   *   - Entries with 'private' or 'sensitive' tags are blocked.
   *   - Entries whose key starts with 'private.' are blocked.
   *   - Entries whose value contains PII patterns are blocked.
   */
  isPublicSafe(entry: MemoryEntry): boolean {
    // Only explicit facts marked as public pass through
    if (entry.type !== "explicit") return false;

    // Private-prefixed keys are never public
    if (entry.key.startsWith("private.")) return false;
    if (entry.key.startsWith("sensitive.") || entry.key.startsWith("secret.")) return false;

    // Tags can override: explicit 'private' or 'sensitive' tag blocks it
    if (entry.tags.includes("private") || entry.tags.includes("sensitive")) return false;

    // Value must not contain PII
    const sanitized = this.sanitizeResponse(entry.value);
    if (sanitized !== entry.value) return false;

    return true;
  }

  /**
   * Filter an array of MemoryEntries to only those that are public-safe.
   */
  filterEntries(entries: MemoryEntry[]): MemoryEntry[] {
    return entries.filter((e) => this.isPublicSafe(e));
  }

  /**
   * Filter a facts record for public consumption, also sanitizing values.
   * Combines filterFacts + sanitizeResponse on each remaining value.
   */
  filterAndSanitizeFacts(facts: Record<string, string>): Record<string, string> {
    const filtered = this.filterFacts(facts);
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(filtered)) {
      result[key] = this.sanitizeResponse(value);
    }
    return result;
  }
}
