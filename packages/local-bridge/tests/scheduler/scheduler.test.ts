/**
 * Tests for the scheduler engine (scheduler.ts)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import { join } from "path";
import {
  addTask,
  removeTask,
  listTasks,
  pauseTask,
  resumeTask,
  runTask,
  readSchedule,
  writeSchedule,
  scheduleFilePath,
  recalcNextRun,
  type ScheduleEntry,
} from "../../src/scheduler/scheduler.js";

const TEST_DIR = join(process.cwd(), "test-scheduler-data");

describe("Scheduler Engine", () => {
  beforeEach(async () => {
    await fs.mkdir(join(TEST_DIR, "cocapn"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("readSchedule / writeSchedule", () => {
    it("should return empty schedule when file missing", async () => {
      const schedule = await readSchedule(TEST_DIR);
      expect(schedule.version).toBe(1);
      expect(schedule.tasks).toEqual({});
    });

    it("should round-trip schedule data", async () => {
      await writeSchedule(TEST_DIR, {
        version: 1,
        tasks: {
          test: {
            name: "test",
            cron: "@daily",
            command: "echo hello",
            enabled: true,
            lastRun: null,
            nextRun: "2026-04-01T00:00:00.000Z",
            createdAt: "2026-03-30T00:00:00.000Z",
            lastResult: null,
          },
        },
      });

      const schedule = await readSchedule(TEST_DIR);
      expect(schedule.tasks.test.name).toBe("test");
      expect(schedule.tasks.test.cron).toBe("@daily");
    });
  });

  describe("addTask", () => {
    it("should add a new task", async () => {
      const task = await addTask(TEST_DIR, "sync", "@hourly", "cocapn sync");

      expect(task.name).toBe("sync");
      expect(task.cron).toBe("@hourly"); // stores original expression
      expect(task.command).toBe("cocapn sync");
      expect(task.enabled).toBe(true);
      expect(task.lastRun).toBeNull();
      expect(task.nextRun).toBeDefined();
    });

    it("should reject invalid cron expressions", async () => {
      await expect(
        addTask(TEST_DIR, "bad", "invalid-cron", "echo hi"),
      ).rejects.toThrow(/Invalid cron/);
    });

    it("should reject duplicate task names", async () => {
      await addTask(TEST_DIR, "dup", "@daily", "echo 1");
      await expect(
        addTask(TEST_DIR, "dup", "@hourly", "echo 2"),
      ).rejects.toThrow(/already exists/);
    });

    it("should persist task to schedule.json", async () => {
      await addTask(TEST_DIR, "persist", "@daily", "cocapn backup create");

      const schedule = await readSchedule(TEST_DIR);
      expect(schedule.tasks.persist).toBeDefined();
      expect(schedule.tasks.persist.command).toBe("cocapn backup create");
    });
  });

  describe("removeTask", () => {
    it("should remove an existing task", async () => {
      await addTask(TEST_DIR, "remove-me", "@daily", "echo bye");
      await removeTask(TEST_DIR, "remove-me");

      const schedule = await readSchedule(TEST_DIR);
      expect(schedule.tasks["remove-me"]).toBeUndefined();
    });

    it("should throw when task not found", async () => {
      await expect(removeTask(TEST_DIR, "nonexistent")).rejects.toThrow(
        /not found/,
      );
    });
  });

  describe("listTasks", () => {
    it("should return empty array for no tasks", async () => {
      const tasks = await listTasks(TEST_DIR);
      expect(tasks).toEqual([]);
    });

    it("should return all tasks with refreshed nextRun", async () => {
      await addTask(TEST_DIR, "task-a", "@hourly", "echo a");
      await addTask(TEST_DIR, "task-b", "@daily", "echo b");

      const tasks = await listTasks(TEST_DIR);
      expect(tasks).toHaveLength(2);
      expect(tasks.map((t) => t.name).sort()).toEqual(["task-a", "task-b"]);
      // Each should have a future nextRun
      for (const task of tasks) {
        expect(new Date(task.nextRun).getTime()).toBeGreaterThan(0);
      }
    });
  });

  describe("pauseTask / resumeTask", () => {
    it("should pause an enabled task", async () => {
      await addTask(TEST_DIR, "paws", "@hourly", "echo paws");
      const task = await pauseTask(TEST_DIR, "paws");

      expect(task.enabled).toBe(false);
    });

    it("should throw when pausing already-paused task", async () => {
      await addTask(TEST_DIR, "already", "@hourly", "echo x");
      await pauseTask(TEST_DIR, "already");

      await expect(pauseTask(TEST_DIR, "already")).rejects.toThrow(
        /already paused/,
      );
    });

    it("should resume a paused task", async () => {
      await addTask(TEST_DIR, "resume-me", "@hourly", "echo x");
      await pauseTask(TEST_DIR, "resume-me");
      const task = await resumeTask(TEST_DIR, "resume-me");

      expect(task.enabled).toBe(true);
      expect(task.nextRun).toBeDefined();
    });

    it("should throw when resuming already-running task", async () => {
      await addTask(TEST_DIR, "running", "@hourly", "echo x");

      await expect(resumeTask(TEST_DIR, "running")).rejects.toThrow(
        /already running/,
      );
    });

    it("should throw for nonexistent task", async () => {
      await expect(pauseTask(TEST_DIR, "ghost")).rejects.toThrow(/not found/);
      await expect(resumeTask(TEST_DIR, "ghost")).rejects.toThrow(/not found/);
    });
  });

  describe("runTask", () => {
    it("should execute a task and record result", async () => {
      await addTask(TEST_DIR, "echo-test", "@daily", "echo hello-world");

      const result = await runTask(TEST_DIR, "echo-test");

      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe("hello-world");
      expect(result.exitCode).toBe(0);
      expect(result.task).toBe("echo-test");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should update lastRun after execution", async () => {
      await addTask(TEST_DIR, "track", "@daily", "echo ok");
      const before = new Date();
      await runTask(TEST_DIR, "track");
      const after = new Date();

      const schedule = await readSchedule(TEST_DIR);
      const task = schedule.tasks["track"];

      expect(task.lastRun).not.toBeNull();
      const lastRunDate = new Date(task.lastRun!);
      expect(lastRunDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(lastRunDate.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("should update nextRun after execution", async () => {
      await addTask(TEST_DIR, "next", "@daily", "echo ok");
      await runTask(TEST_DIR, "next");

      const schedule = await readSchedule(TEST_DIR);
      const task = schedule.tasks["next"];
      expect(new Date(task.nextRun).getTime()).toBeGreaterThan(Date.now() - 1000);
    });

    it("should throw for nonexistent task", async () => {
      await expect(runTask(TEST_DIR, "ghost")).rejects.toThrow(/not found/);
    });

    it("should capture stderr for failing commands", async () => {
      await addTask(TEST_DIR, "fail", "@daily", "echo fail >&2 && exit 1");

      const result = await runTask(TEST_DIR, "fail");

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("fail");
    });
  });

  describe("recalcNextRun", () => {
    it("should compute a new nextRun from now", () => {
      const task: ScheduleEntry = {
        name: "test",
        cron: "0 * * * *",
        command: "echo hi",
        enabled: true,
        lastRun: null,
        nextRun: "",
        createdAt: new Date().toISOString(),
        lastResult: null,
      };

      const updated = recalcNextRun(task);
      expect(updated.nextRun).toBeDefined();
      expect(new Date(updated.nextRun).getTime()).toBeGreaterThan(0);
    });

    it("should use the provided after date", () => {
      const task: ScheduleEntry = {
        name: "test",
        cron: "0 0 * * *",
        command: "echo hi",
        enabled: true,
        lastRun: null,
        nextRun: "",
        createdAt: new Date().toISOString(),
        lastResult: null,
      };

      const after = new Date("2026-03-30T12:00:00Z");
      const updated = recalcNextRun(task, after);
      const nextRun = new Date(updated.nextRun);
      expect(nextRun.getUTCDate()).toBe(31); // next day
    });
  });
});
