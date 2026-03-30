/**
 * cocapn notify — Notification system for agent events
 *
 * Usage:
 *   cocapn notify on                       — Enable notifications
 *   cocapn notify off                      — Disable notifications
 *   cocapn notify status                   — Show notification status
 *   cocapn notify rules                    — List notification rules
 *   cocapn notify rules add [opts]         — Add a notification rule
 *   cocapn notify rules remove <id>        — Remove a notification rule
 *   cocapn notify test                     — Send test notification
 */

import { Command } from "commander";

// ─── ANSI colors ────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

const bold = (s: string) => `${c.bold}${s}${c.reset}`;
const green = (s: string) => `${c.green}${s}${c.reset}`;
const cyan = (s: string) => `${c.cyan}${s}${c.reset}`;
const yellow = (s: string) => `${c.yellow}${s}${c.reset}`;
const red = (s: string) => `${c.red}${s}${c.reset}`;
const gray = (s: string) => `${c.gray}${s}${c.reset}`;

// ─── Local-bridge notify imports ────────────────────────────────────────────
// We inline the storage operations here since the CLI may not have the
// local-bridge compiled. The logic is identical — JSON file in cocapn/.

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

const NOTIFY_FILE = "cocapn/notifications.json";

interface NotifyRule {
  id: string;
  name: string;
  events: string[];
  minPriority: string;
  channels: string[];
  enabled: boolean;
  createdAt: number;
}

interface NotifyConfig {
  enabled: boolean;
  rules: NotifyRule[];
  updatedAt: number;
}

function storagePath(repoRoot: string): string {
  return join(repoRoot, NOTIFY_FILE);
}

function loadConfig(repoRoot: string): NotifyConfig {
  const path = storagePath(repoRoot);
  if (!existsSync(path)) {
    return { enabled: false, rules: [], updatedAt: Date.now() };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { enabled: false, rules: [], updatedAt: Date.now() };
  }
}

function saveConfig(repoRoot: string, config: NotifyConfig): void {
  const dir = join(repoRoot, "cocapn");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  config.updatedAt = Date.now();
  writeFileSync(storagePath(repoRoot), JSON.stringify(config, null, 2), "utf-8");
}

// ─── Constants ──────────────────────────────────────────────────────────────

const VALID_EVENTS = [
  "brain:update",
  "chat:message",
  "fleet:alert",
  "sync:complete",
  "error:critical",
] as const;

const VALID_PRIORITIES = ["low", "normal", "high", "critical"] as const;

const VALID_CHANNELS = ["terminal", "desktop", "webhook"] as const;

// ─── Display helpers ────────────────────────────────────────────────────────

function printRuleList(rules: NotifyRule[]): void {
  if (rules.length === 0) {
    console.log(gray("  No notification rules configured.\n"));
    return;
  }

  for (const r of rules) {
    const status = r.enabled ? green("on") : yellow("off");
    console.log(`  ${status}  ${cyan(r.id.slice(0, 12))}  ${bold(r.name)}`);
    console.log(`      ${gray("Events:")}     ${r.events.join(", ")}`);
    console.log(`      ${gray("Priority:")}   ${r.minPriority}`);
    console.log(`      ${gray("Channels:")}   ${r.channels.join(", ")}`);
    console.log();
  }
}

// ─── Command ────────────────────────────────────────────────────────────────

export function createNotifyCommand(): Command {
  const cmd = new Command("notify")
    .description("Notification system for agent events");

  // cocapn notify on
  cmd.addCommand(
    new Command("on")
      .description("Enable notifications")
      .action(() => {
        const repoRoot = process.cwd();
        const config = loadConfig(repoRoot);
        config.enabled = true;
        saveConfig(repoRoot, config);
        console.log(green("\n  Notifications enabled.\n"));
      }),
  );

  // cocapn notify off
  cmd.addCommand(
    new Command("off")
      .description("Disable notifications")
      .action(() => {
        const repoRoot = process.cwd();
        const config = loadConfig(repoRoot);
        config.enabled = false;
        saveConfig(repoRoot, config);
        console.log(yellow("\n  Notifications disabled.\n"));
      }),
  );

  // cocapn notify status
  cmd.addCommand(
    new Command("status")
      .description("Show notification status")
      .action(() => {
        const repoRoot = process.cwd();
        const config = loadConfig(repoRoot);
        const state = config.enabled ? green("enabled") : yellow("disabled");
        console.log(bold("\n  cocapn notify status\n"));
        console.log(`  Notifications: ${state}`);
        console.log(`  Rules:         ${config.rules.length}`);
        console.log();
      }),
  );

  // cocapn notify rules (subcommand group)
  const rulesCmd = new Command("rules")
    .description("Manage notification rules");

  // cocapn notify rules (list — default action)
  rulesCmd.action(() => {
    const repoRoot = process.cwd();
    const config = loadConfig(repoRoot);
    console.log(bold("\n  cocapn notify rules\n"));
    printRuleList(config.rules);
  });

  // cocapn notify rules add
  rulesCmd.addCommand(
    new Command("add")
      .description("Add a notification rule")
      .requiredOption("-n, --name <name>", "Rule name")
      .requiredOption("-e, --events <events>", "Comma-separated event types")
      .option("-p, --priority <priority>", "Minimum priority (default: normal)", "normal")
      .option(
        "-c, --channels <channels>",
        "Comma-separated channels (default: terminal)",
        "terminal",
      )
      .action((options) => {
        const repoRoot = process.cwd();
        const events = options.events
          .split(",")
          .map((e: string) => e.trim())
          .filter(Boolean);
        const channels = options.channels
          .split(",")
          .map((ch: string) => ch.trim())
          .filter(Boolean);

        // Validate events
        const invalidEvents = events.filter(
          (e: string) => !VALID_EVENTS.includes(e as typeof VALID_EVENTS[number]),
        );
        if (invalidEvents.length > 0) {
          console.error(
            red(`\n  Invalid event(s): ${invalidEvents.join(", ")}`),
          );
          console.error(
            gray(`  Valid events: ${VALID_EVENTS.join(", ")}\n`),
          );
          process.exit(1);
        }

        // Validate priority
        if (!VALID_PRIORITIES.includes(options.priority as typeof VALID_PRIORITIES[number])) {
          console.error(
            red(`\n  Invalid priority: ${options.priority}`),
          );
          console.error(
            gray(`  Valid priorities: ${VALID_PRIORITIES.join(", ")}\n`),
          );
          process.exit(1);
        }

        // Validate channels
        const invalidChannels = channels.filter(
          (ch: string) => !VALID_CHANNELS.includes(ch as typeof VALID_CHANNELS[number]),
        );
        if (invalidChannels.length > 0) {
          console.error(
            red(`\n  Invalid channel(s): ${invalidChannels.join(", ")}`),
          );
          console.error(
            gray(`  Valid channels: ${VALID_CHANNELS.join(", ")}\n`),
          );
          process.exit(1);
        }

        const config = loadConfig(repoRoot);
        const rule: NotifyRule = {
          id: randomBytes(8).toString("hex"),
          name: options.name,
          events,
          minPriority: options.priority,
          channels,
          enabled: true,
          createdAt: Date.now(),
        };

        config.rules.push(rule);
        saveConfig(repoRoot, config);

        console.log(bold("\n  cocapn notify rules add\n"));
        console.log(`  ${green("+")} ${bold(rule.name)}`);
        console.log(`    ${gray("ID:")}       ${rule.id}`);
        console.log(`    ${gray("Events:")}   ${rule.events.join(", ")}`);
        console.log(`    ${gray("Priority:")} ${rule.minPriority}`);
        console.log(`    ${gray("Channels:")} ${rule.channels.join(", ")}`);
        console.log(green("\n  Done.\n"));
      }),
  );

  // cocapn notify rules remove
  rulesCmd.addCommand(
    new Command("remove")
      .description("Remove a notification rule")
      .argument("<id>", "Rule ID (or prefix)")
      .action((id: string) => {
        const repoRoot = process.cwd();
        const config = loadConfig(repoRoot);
        const index = config.rules.findIndex(
          (r) => r.id === id || r.id.startsWith(id),
        );
        if (index === -1) {
          console.error(red(`\n  No rule found matching: ${id}\n`));
          process.exit(1);
        }
        const removed = config.rules[index];
        config.rules.splice(index, 1);
        saveConfig(repoRoot, config);
        console.log(green(`\n  Removed rule: ${removed.name} (${removed.id.slice(0, 12)})\n`));
      }),
  );

  cmd.addCommand(rulesCmd);

  // cocapn notify test
  cmd.addCommand(
    new Command("test")
      .description("Send a test notification")
      .action(() => {
        const repoRoot = process.cwd();
        const config = loadConfig(repoRoot);

        if (!config.enabled) {
          console.error(red("\n  Notifications are disabled. Run `cocapn notify on` first.\n"));
          process.exit(1);
        }

        // Send terminal bell test notification
        process.stderr.write("\x07");
        console.log(bold("\n  cocapn notify test\n"));
        console.log(`  ${green("Terminal bell sent.")}`);

        if (config.rules.length === 0) {
          console.log(yellow("  No rules configured. Add rules with `cocapn notify rules add`."));
        } else {
          console.log(
            `  ${gray(`${config.rules.length} rule(s) active.`)}`,
          );
        }
        console.log();
      }),
  );

  return cmd;
}
