/**
 * Notification channels — dispatch notifications to various outputs.
 *
 * Terminal bell, desktop notifications (macOS/Linux), and webhook delivery.
 */

import { execSync } from "child_process";
import type { AgentEvent } from "./rules.js";

export interface NotifyResult {
  channel: string;
  success: boolean;
  error?: string;
}

/** Send a terminal bell notification */
export function terminalNotify(event: AgentEvent): NotifyResult {
  try {
    // Write terminal bell + message to stderr (visible in terminal)
    process.stderr.write(`\x07[${event.type}] ${event.message}\n`);
    return { channel: "terminal", success: true };
  } catch (err) {
    return {
      channel: "terminal",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Send a desktop notification via osascript (macOS) or notify-send (Linux) */
export function desktopNotify(event: AgentEvent): NotifyResult {
  const title = `cocapn: ${event.type}`;
  const body = event.message.replace(/"/g, '\\"');

  const platform = process.platform;

  try {
    if (platform === "darwin") {
      execSync(
        `osascript -e 'display notification "${body}" with title "${title}"'`,
        { timeout: 5000, stdio: "pipe" },
      );
    } else if (platform === "linux") {
      execSync(`notify-send "${title}" "${body}"`, {
        timeout: 5000,
        stdio: "pipe",
      });
    } else {
      return {
        channel: "desktop",
        success: false,
        error: `Desktop notifications not supported on ${platform}`,
      };
    }
    return { channel: "desktop", success: true };
  } catch (err) {
    return {
      channel: "desktop",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Deliver a notification via webhook */
export async function webhookNotify(
  event: AgentEvent,
  url: string,
): Promise<NotifyResult> {
  const payload = JSON.stringify({
    type: event.type,
    priority: event.priority,
    message: event.message,
    timestamp: event.timestamp,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Cocapn-Notify/1.0",
      },
      body: payload,
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      return { channel: "webhook", success: true };
    }
    return {
      channel: "webhook",
      success: false,
      error: `HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      channel: "webhook",
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
