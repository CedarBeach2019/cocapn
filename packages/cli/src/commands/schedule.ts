/**
 * cocapn schedule — Cron jobs and scheduled tasks
 *
 * Usage:
 *   cocapn schedule list                          — List scheduled tasks
 *   cocapn schedule add <name> --cron <expr> --command <cmd> — Add task
 *   cocapn schedule remove <name>                 — Remove task
 *   cocapn schedule run <name>                    — Run task immediately
 *   cocapn schedule pause <name>                  — Pause task
 *   cocapn schedule resume <name>                 — Resume paused task
 */

import { Command } from "commander";
import { existsSync } from "fs";
import { join } from "path";
import {
  addTask,
  removeTask,
  listTasks,
  pauseTask,
  resumeTask,
  runTask,
  type ScheduleEntry,
} from "../../../local-bridge/src/scheduler/scheduler.js";

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

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolveCocapnDir(repoRoot: string): string | null {
  const cocapnDir = join(repoRoot, "cocapn");
  return existsSync(cocapnDir) ? cocapnDir : null;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return gray("never");
  const date = new Date(iso);
  const now = Date.now();
  const diff = date.getTime() - now;

  if (diff < 0) {
    const ago = Math.abs(diff);
    if (ago < 60000) return gray("just now");
    if (ago < 3600000) return gray(`${Math.floor(ago / 60000)}m ago`);
    if (ago < 86400000) return gray(`${Math.floor(ago / 3600000)}h ago`);
    return gray(`${Math.floor(ago / 86400000)}d ago`);
  }

  if (diff < 60000) return green("in <1m");
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusIcon(task: ScheduleEntry): string {
  return task.enabled ? green("on") : yellow("paused");
}

// ─── List ───────────────────────────────────────────────────────────────────

function printTaskList(tasks: ScheduleEntry[]): void {
  console.log(bold("\n  cocapn schedule list\n"));

  if (tasks.length === 0) {
    console.log(gray("  No scheduled tasks. Use `cocapn schedule add` to create one.\n"));
    return;
  }

  for (const task of tasks) {
    const status = statusIcon(task);
    console.log(`  ${status}  ${bold(task.name)}`);
    console.log(`      ${cyan("cron:")}     ${task.cron}`);
    console.log(`      ${cyan("command:")}  ${task.command}`);
    console.log(`      ${cyan("next run:")} ${formatRelativeTime(task.nextRun)}`);
    console.log(`      ${cyan("last run:")} ${formatRelativeTime(task.lastRun)}`);
    if (task.lastResult) {
      const icon = task.lastResult.success ? green("ok") : red("fail");
      console.log(`      ${cyan("last result:")} ${icon} (${formatDuration(task.lastResult.durationMs)})`);
    }
    console.log();
  }

  console.log(`  ${gray(`${tasks.length} task(s) total`)}\n`);
}

// ─── Command ────────────────────────────────────────────────────────────────

interface AddOptions {
  cron: string;
  command: string;
}

export function createScheduleCommand(): Command {
  return new Command("schedule")
    .description("Manage cron jobs and scheduled tasks")
    .addCommand(
      new Command("list")
        .description("List all scheduled tasks")
        .action(async () => {
          const repoRoot = process.cwd();
          if (!resolveCocapnDir(repoRoot)) {
            console.log(red("\n  No cocapn/ directory found. Run cocapn setup first.\n"));
            process.exit(1);
          }

          try {
            const tasks = await listTasks(repoRoot);
            printTaskList(tasks);
          } catch (err) {
            console.log(red(`\n  ${(err as Error).message}\n`));
            process.exit(1);
          }
        }),
    )
    .addCommand(
      new Command("add")
        .description("Add a scheduled task")
        .argument("<name>", "Task name (alphanumeric, dashes, underscores)")
        .requiredOption("--cron <expression>", "Cron expression (e.g., '0 * * * *', '@daily')")
        .requiredOption("--command <cmd>", "Command to run (e.g., 'cocapn sync')")
        .action(async (name: string, options: AddOptions) => {
          const repoRoot = process.cwd();
          if (!resolveCocapnDir(repoRoot)) {
            console.log(red("\n  No cocapn/ directory found. Run cocapn setup first.\n"));
            process.exit(1);
          }

          try {
            const task = await addTask(repoRoot, name, options.cron, options.command);
            console.log(bold("\n  cocapn schedule add\n"));
            console.log(`  ${green("Added:")}     ${task.name}`);
            console.log(`  ${cyan("Cron:")}      ${task.cron}`);
            console.log(`  ${cyan("Command:")}   ${task.command}`);
            console.log(`  ${cyan("Next run:")}  ${formatRelativeTime(task.nextRun)}`);
            console.log(green("\n  Done.\n"));
          } catch (err) {
            console.log(red(`\n  ${(err as Error).message}\n`));
            process.exit(1);
          }
        }),
    )
    .addCommand(
      new Command("remove")
        .description("Remove a scheduled task")
        .argument("<name>", "Task name to remove")
        .action(async (name: string) => {
          const repoRoot = process.cwd();
          if (!resolveCocapnDir(repoRoot)) {
            console.log(red("\n  No cocapn/ directory found. Run cocapn setup first.\n"));
            process.exit(1);
          }

          try {
            await removeTask(repoRoot, name);
            console.log(green(`\n  Removed task: ${name}\n`));
          } catch (err) {
            console.log(red(`\n  ${(err as Error).message}\n`));
            process.exit(1);
          }
        }),
    )
    .addCommand(
      new Command("run")
        .description("Run a scheduled task immediately")
        .argument("<name>", "Task name to run")
        .action(async (name: string) => {
          const repoRoot = process.cwd();
          if (!resolveCocapnDir(repoRoot)) {
            console.log(red("\n  No cocapn/ directory found. Run cocapn setup first.\n"));
            process.exit(1);
          }

          try {
            console.log(gray(`  Running ${name}...`));
            const result = await runTask(repoRoot, name);

            console.log(bold("\n  cocapn schedule run\n"));
            console.log(`  ${cyan("Task:")}     ${name}`);
            console.log(`  ${cyan("Status:")}   ${result.success ? green("success") : red("failed")}`);
            console.log(`  ${cyan("Duration:")} ${formatDuration(result.durationMs)}`);

            if (result.stdout.trim()) {
              console.log(`  ${cyan("Output:")}`);
              for (const line of result.stdout.trim().split("\n")) {
                console.log(`    ${line}`);
              }
            }

            if (result.stderr.trim()) {
              console.log(`  ${cyan("Errors:")}`);
              for (const line of result.stderr.trim().split("\n")) {
                console.log(`    ${red(line)}`);
              }
            }

            console.log();
          } catch (err) {
            console.log(red(`\n  ${(err as Error).message}\n`));
            process.exit(1);
          }
        }),
    )
    .addCommand(
      new Command("pause")
        .description("Pause a scheduled task")
        .argument("<name>", "Task name to pause")
        .action(async (name: string) => {
          const repoRoot = process.cwd();
          if (!resolveCocapnDir(repoRoot)) {
            console.log(red("\n  No cocapn/ directory found. Run cocapn setup first.\n"));
            process.exit(1);
          }

          try {
            await pauseTask(repoRoot, name);
            console.log(yellow(`\n  Paused task: ${name}\n`));
          } catch (err) {
            console.log(red(`\n  ${(err as Error).message}\n`));
            process.exit(1);
          }
        }),
    )
    .addCommand(
      new Command("resume")
        .description("Resume a paused task")
        .argument("<name>", "Task name to resume")
        .action(async (name: string) => {
          const repoRoot = process.cwd();
          if (!resolveCocapnDir(repoRoot)) {
            console.log(red("\n  No cocapn/ directory found. Run cocapn setup first.\n"));
            process.exit(1);
          }

          try {
            const task = await resumeTask(repoRoot, name);
            console.log(green(`\n  Resumed task: ${name}`));
            console.log(`  ${cyan("Next run:")} ${formatRelativeTime(task.nextRun)}\n`);
          } catch (err) {
            console.log(red(`\n  ${(err as Error).message}\n`));
            process.exit(1);
          }
        }),
    );
}
