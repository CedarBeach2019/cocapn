/**
 * Notifier — top-level notification dispatch.
 *
 * Loads config/rules, matches incoming events, and dispatches to channels.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "fs";
import { join } from "path";
import { randomBytes } from "crypto";
import {
  type NotifyConfig,
  type NotifyRule,
  type NotifyEventType,
  type NotifyPriority,
  type AgentEvent,
  createDefaultConfig,
  matchRules,
  isValidEventType,
  isValidPriority,
} from "./rules.js";
import { terminalNotify, desktopNotify, webhookNotify } from "./channels.js";

// ─── Storage ────────────────────────────────────────────────────────────────

const NOTIFY_FILE = "cocapn/notifications.json";

function storagePath(repoRoot: string): string {
  return join(repoRoot, NOTIFY_FILE);
}

export function loadConfig(repoRoot: string): NotifyConfig {
  const path = storagePath(repoRoot);
  if (!existsSync(path)) return createDefaultConfig();
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return createDefaultConfig();
  }
}

export function saveConfig(repoRoot: string, config: NotifyConfig): void {
  const dir = join(repoRoot, "cocapn");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  config.updatedAt = Date.now();
  writeFileSync(storagePath(repoRoot), JSON.stringify(config, null, 2), "utf-8");
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  return randomBytes(8).toString("hex");
}

// ─── Core operations ────────────────────────────────────────────────────────

/** Enable notifications globally */
export function enableNotifications(repoRoot: string): void {
  const config = loadConfig(repoRoot);
  config.enabled = true;
  saveConfig(repoRoot, config);
}

/** Disable notifications globally */
export function disableNotifications(repoRoot: string): void {
  const config = loadConfig(repoRoot);
  config.enabled = false;
  saveConfig(repoRoot, config);
}

/** Check if notifications are enabled */
export function isEnabled(repoRoot: string): boolean {
  return loadConfig(repoRoot).enabled;
}

/** Add a notification rule */
export function addRule(
  repoRoot: string,
  opts: {
    name: string;
    events: NotifyEventType[];
    minPriority: NotifyPriority;
    channels: ("terminal" | "desktop" | "webhook")[];
  },
): NotifyRule {
  const config = loadConfig(repoRoot);

  const rule: NotifyRule = {
    id: generateId(),
    name: opts.name,
    events: opts.events,
    minPriority: opts.minPriority,
    channels: opts.channels,
    enabled: true,
    createdAt: Date.now(),
  };

  config.rules.push(rule);
  saveConfig(repoRoot, config);
  return rule;
}

/** Remove a notification rule by ID */
export function removeRule(repoRoot: string, ruleId: string): boolean {
  const config = loadConfig(repoRoot);
  const index = config.rules.findIndex((r) => r.id === ruleId);
  if (index === -1) return false;
  config.rules.splice(index, 1);
  saveConfig(repoRoot, config);
  return true;
}

/** List all notification rules */
export function listRules(repoRoot: string): NotifyRule[] {
  return loadConfig(repoRoot).rules;
}

/** Dispatch an event through all matching rules and channels */
export async function dispatch(
  repoRoot: string,
  event: AgentEvent,
  webhookUrl?: string,
): Promise<{ dispatched: boolean; results: Array<{ channel: string; success: boolean }> }> {
  const config = loadConfig(repoRoot);
  if (!config.enabled) {
    return { dispatched: false, results: [] };
  }

  const matched = matchRules(config.rules, event);
  if (matched.length === 0) {
    return { dispatched: false, results: [] };
  }

  const results: Array<{ channel: string; success: boolean }> = [];

  for (const rule of matched) {
    for (const channel of rule.channels) {
      if (channel === "terminal") {
        results.push(terminalNotify(event));
      } else if (channel === "desktop") {
        results.push(desktopNotify(event));
      } else if (channel === "webhook" && webhookUrl) {
        results.push(await webhookNotify(event, webhookUrl));
      }
    }
  }

  return { dispatched: true, results };
}

/** Send a test notification through all configured channels */
export async function sendTest(repoRoot: string): Promise<{
  sent: boolean;
  results: Array<{ channel: string; success: boolean; error?: string }>;
}> {
  const config = loadConfig(repoRoot);

  if (!config.enabled) {
    return {
      sent: false,
      results: [{ channel: "none", success: false, error: "Notifications are disabled" }],
    };
  }

  const testEvent: AgentEvent = {
    type: "chat:message",
    priority: "normal",
    message: "Test notification from cocapn",
    timestamp: Date.now(),
  };

  const results: Array<{ channel: string; success: boolean; error?: string }> = [];

  // Always try terminal for test
  results.push(terminalNotify(testEvent));

  // Try desktop if any rule uses it
  const hasDesktop = config.rules.some((r) => r.enabled && r.channels.includes("desktop"));
  if (hasDesktop) {
    results.push(desktopNotify(testEvent));
  }

  return { sent: true, results };
}

// Re-export validation helpers for CLI use
export { isValidEventType, isValidPriority };
