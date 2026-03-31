/**
 * Scheduler — Task scheduling engine
 *
 * Manages scheduled tasks stored in cocapn/schedule.json.
 * Supports add, remove, pause, resume, run, and list operations.
 */

import { promises as fs } from "fs";
import { join } from "path";
import { validateCronExpression, getNextRun } from "./cron-parser.js";
import { runCommand, type RunResult } from "./runner.js";

/** A scheduled task entry */
export interface ScheduleEntry {
  /** Unique task name */
  name: string;
  /** 5-field cron expression or shortcut */
  cron: string;
  /** Shell command to run */
  command: string;
  /** Whether the task is active */
  enabled: boolean;
  /** ISO timestamp of last successful run */
  lastRun: string | null;
  /** ISO timestamp of next scheduled run */
  nextRun: string;
  /** ISO timestamp when the task was created */
  createdAt: string;
  /** Last run result */
  lastResult: RunResult | null;
}

/** schedule.json root structure */
export interface ScheduleFile {
  version: number;
  tasks: Record<string, ScheduleEntry>;
}

const SCHEDULE_VERSION = 1;

/** Get the path to schedule.json */
export function scheduleFilePath(repoRoot: string): string {
  return join(repoRoot, "cocapn", "schedule.json");
}

/** Read and parse schedule.json, returning empty structure if missing */
export async function readSchedule(repoRoot: string): Promise<ScheduleFile> {
  const path = scheduleFilePath(repoRoot);
  try {
    const raw = await fs.readFile(path, "utf-8");
    return JSON.parse(raw) as ScheduleFile;
  } catch {
    return { version: SCHEDULE_VERSION, tasks: {} };
  }
}

/** Write schedule.json atomically */
export async function writeSchedule(repoRoot: string, data: ScheduleFile): Promise<void> {
  const path = scheduleFilePath(repoRoot);
  const dir = join(repoRoot, "cocapn");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path, JSON.stringify(data, null, 2), "utf-8");
}

/** Recalculate nextRun for a task based on its cron expression */
export function recalcNextRun(task: ScheduleEntry, after: Date = new Date()): ScheduleEntry {
  return {
    ...task,
    nextRun: getNextRun(task.cron, after).toISOString(),
  };
}

/** Add a new scheduled task */
export async function addTask(
  repoRoot: string,
  name: string,
  cron: string,
  command: string,
): Promise<ScheduleEntry> {
  if (!name || !cron || !command) {
    throw new Error("name, cron, and command are required");
  }

  if (!validateCronExpression(cron)) {
    throw new Error(`Invalid cron expression: ${cron}`);
  }

  const schedule = await readSchedule(repoRoot);

  if (schedule.tasks[name]) {
    throw new Error(`Task already exists: ${name}. Remove it first or use a different name.`);
  }

  const entry: ScheduleEntry = recalcNextRun({
    name,
    cron,
    command,
    enabled: true,
    lastRun: null,
    nextRun: "",
    createdAt: new Date().toISOString(),
    lastResult: null,
  });

  schedule.tasks[name] = entry;
  await writeSchedule(repoRoot, schedule);

  return entry;
}

/** Remove a scheduled task */
export async function removeTask(repoRoot: string, name: string): Promise<void> {
  const schedule = await readSchedule(repoRoot);

  if (!schedule.tasks[name]) {
    throw new Error(`Task not found: ${name}`);
  }

  delete schedule.tasks[name];
  await writeSchedule(repoRoot, schedule);
}

/** List all scheduled tasks */
export async function listTasks(repoRoot: string): Promise<ScheduleEntry[]> {
  const schedule = await readSchedule(repoRoot);

  // Refresh nextRun for all enabled tasks
  const now = new Date();
  return Object.values(schedule.tasks).map((task) => {
    if (task.enabled) {
      return recalcNextRun(task, now);
    }
    return task;
  });
}

/** Pause a scheduled task */
export async function pauseTask(repoRoot: string, name: string): Promise<ScheduleEntry> {
  const schedule = await readSchedule(repoRoot);

  if (!schedule.tasks[name]) {
    throw new Error(`Task not found: ${name}`);
  }

  if (!schedule.tasks[name].enabled) {
    throw new Error(`Task already paused: ${name}`);
  }

  schedule.tasks[name].enabled = false;
  await writeSchedule(repoRoot, schedule);

  return schedule.tasks[name];
}

/** Resume a paused task */
export async function resumeTask(repoRoot: string, name: string): Promise<ScheduleEntry> {
  const schedule = await readSchedule(repoRoot);

  if (!schedule.tasks[name]) {
    throw new Error(`Task not found: ${name}`);
  }

  if (schedule.tasks[name].enabled) {
    throw new Error(`Task already running: ${name}`);
  }

  schedule.tasks[name].enabled = true;
  schedule.tasks[name] = recalcNextRun(schedule.tasks[name]);
  await writeSchedule(repoRoot, schedule);

  return schedule.tasks[name];
}

/** Run a task immediately (regardless of schedule) */
export async function runTask(repoRoot: string, name: string): Promise<RunResult> {
  const schedule = await readSchedule(repoRoot);

  if (!schedule.tasks[name]) {
    throw new Error(`Task not found: ${name}`);
  }

  const task = schedule.tasks[name];
  const result = await runCommand(name, task.command);

  // Update task with run info
  task.lastRun = new Date().toISOString();
  task.lastResult = result;
  task.nextRun = getNextRun(task.cron).toISOString();

  schedule.tasks[name] = task;
  await writeSchedule(repoRoot, schedule);

  return result;
}

/**
 * Tick — check for due tasks and run them.
 * Call this on a timer (e.g., every 60 seconds) for the scheduler loop.
 *
 * @returns Array of run results for tasks that were triggered
 */
export async function tick(repoRoot: string): Promise<RunResult[]> {
  const schedule = await readSchedule(repoRoot);
  const now = new Date();
  const results: RunResult[] = [];

  for (const [name, task] of Object.entries(schedule.tasks)) {
    if (!task.enabled) continue;

    const nextRun = new Date(task.nextRun);
    if (nextRun <= now) {
      const result = await runCommand(name, task.command);
      results.push(result);

      // Update task
      task.lastRun = now.toISOString();
      task.lastResult = result;
      task.nextRun = getNextRun(task.cron, now).toISOString();

      schedule.tasks[name] = task;
    }
  }

  if (results.length > 0) {
    await writeSchedule(repoRoot, schedule);
  }

  return results;
}
