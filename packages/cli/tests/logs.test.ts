/**
 * Tests for cocapn logs command.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  parseLogLine,
  resolveLogsDir,
  findLogFiles,
  readLogs,
  filterByLevel,
  searchLogs,
  formatEntry,
} from "../src/commands/logs.js";
import type { LogEntry } from "../src/commands/logs.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "cocapn-logs-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─── parseLogLine ────────────────────────────────────────────────────────────

describe("parseLogLine", () => {
  it("parses a standard log line", () => {
    const entry = parseLogLine("[2026-03-30T12:00:00Z] [INFO] Bridge started on port 3100");
    expect(entry).not.toBeNull();
    expect(entry!.timestamp).toBe("2026-03-30T12:00:00Z");
    expect(entry!.level).toBe("info");
    expect(entry!.message).toBe("Bridge started on port 3100");
    expect(entry!.raw).toBe("[2026-03-30T12:00:00Z] [INFO] Bridge started on port 3100");
  });

  it("parses DEBUG level", () => {
    const entry = parseLogLine("[2026-03-30T12:00:00Z] [DEBUG] Loading config from cocapn/config.yml");
    expect(entry).not.toBeNull();
    expect(entry!.level).toBe("debug");
    expect(entry!.message).toBe("Loading config from cocapn/config.yml");
  });

  it("parses WARN level", () => {
    const entry = parseLogLine("[2026-03-30T12:00:00Z] [WARN] Disk usage above 80%");
    expect(entry).not.toBeNull();
    expect(entry!.level).toBe("warn");
  });

  it("parses ERROR level", () => {
    const entry = parseLogLine("[2026-03-30T12:00:00Z] [ERROR] Failed to connect to LLM provider");
    expect(entry).not.toBeNull();
    expect(entry!.level).toBe("error");
  });

  it("returns null for non-matching lines", () => {
    expect(parseLogLine("")).toBeNull();
    expect(parseLogLine("some random text")).toBeNull();
    expect(parseLogLine("INFO: something happened")).toBeNull();
    expect(parseLogLine("[INFO] missing timestamp bracket")).toBeNull();
  });

  it("handles case-insensitive level names", () => {
    const entry = parseLogLine("[2026-03-30T12:00:00Z] [info] lowercase info");
    expect(entry).not.toBeNull();
    expect(entry!.level).toBe("info");
  });

  it("handles multi-word messages", () => {
    const entry = parseLogLine("[2026-03-30T12:00:00Z] [ERROR] Connection refused: ECONNREFUSED 127.0.0.1:3100");
    expect(entry!.message).toBe("Connection refused: ECONNREFUSED 127.0.0.1:3100");
  });
});

// ─── resolveLogsDir ──────────────────────────────────────────────────────────

describe("resolveLogsDir", () => {
  it("returns cocapn/logs relative to cwd", () => {
    expect(resolveLogsDir("/home/alice/project")).toBe("/home/alice/project/cocapn/logs");
  });
});

// ─── findLogFiles ────────────────────────────────────────────────────────────

describe("findLogFiles", () => {
  it("returns empty array for nonexistent directory", () => {
    expect(findLogFiles(join(tmpDir, "nonexistent"))).toEqual([]);
  });

  it("returns empty array for directory with no .log files", () => {
    mkdirSync(join(tmpDir, "cocapn", "logs"), { recursive: true });
    writeFileSync(join(tmpDir, "cocapn", "logs", "readme.txt"), "hello");
    expect(findLogFiles(join(tmpDir, "cocapn", "logs"))).toEqual([]);
  });

  it("finds .log files sorted by mtime (newest first)", () => {
    const logsDir = join(tmpDir, "cocapn", "logs");
    mkdirSync(logsDir, { recursive: true });

    writeFileSync(join(logsDir, "old.log"), "old content");
    // Small delay to ensure different mtime
    const { utimesSync } = require("fs");
    utimesSync(join(logsDir, "old.log"), new Date(1000), new Date(1000));

    writeFileSync(join(logsDir, "new.log"), "new content");
    utimesSync(join(logsDir, "new.log"), new Date(2000), new Date(2000));

    const files = findLogFiles(logsDir);
    expect(files).toHaveLength(2);
    expect(files[0]).toContain("new.log");
    expect(files[1]).toContain("old.log");
  });
});

// ─── readLogs ────────────────────────────────────────────────────────────────

describe("readLogs", () => {
  it("reads and parses entries from log files", () => {
    const logsDir = join(tmpDir, "cocapn", "logs");
    mkdirSync(logsDir, { recursive: true });
    writeFileSync(
      join(logsDir, "bridge.log"),
      "[2026-03-30T12:00:00Z] [INFO] Bridge started\n[2026-03-30T12:00:01Z] [DEBUG] Config loaded\n[2026-03-30T12:00:02Z] [ERROR] Oops\n",
      "utf-8"
    );

    const entries = readLogs([join(logsDir, "bridge.log")], 50);
    expect(entries).toHaveLength(3);
    expect(entries[0].level).toBe("info");
    expect(entries[1].level).toBe("debug");
    expect(entries[2].level).toBe("error");
  });

  it("limits output to requested number of lines", () => {
    const logsDir = join(tmpDir, "cocapn", "logs");
    mkdirSync(logsDir, { recursive: true });
    const lines = Array.from({ length: 10 }, (_, i) =>
      `[2026-03-30T12:00:0${i}Z] [INFO] Line ${i}`
    ).join("\n");
    writeFileSync(join(logsDir, "bridge.log"), lines, "utf-8");

    const entries = readLogs([join(logsDir, "bridge.log")], 3);
    expect(entries).toHaveLength(3);
    expect(entries[0].message).toBe("Line 7");
    expect(entries[2].message).toBe("Line 9");
  });

  it("skips malformed lines", () => {
    const logsDir = join(tmpDir, "cocapn", "logs");
    mkdirSync(logsDir, { recursive: true });
    writeFileSync(
      join(logsDir, "bridge.log"),
      "[2026-03-30T12:00:00Z] [INFO] Valid\nthis is not a log line\n[2026-03-30T12:00:01Z] [WARN] Also valid\n",
      "utf-8"
    );

    const entries = readLogs([join(logsDir, "bridge.log")], 50);
    expect(entries).toHaveLength(2);
  });

  it("merges entries from multiple files", () => {
    const logsDir = join(tmpDir, "cocapn", "logs");
    mkdirSync(logsDir, { recursive: true });
    writeFileSync(join(logsDir, "a.log"), "[2026-03-30T12:00:00Z] [INFO] From A\n", "utf-8");
    writeFileSync(join(logsDir, "b.log"), "[2026-03-30T12:00:01Z] [ERROR] From B\n", "utf-8");

    const entries = readLogs([join(logsDir, "a.log"), join(logsDir, "b.log")], 50);
    expect(entries).toHaveLength(2);
  });
});

// ─── filterByLevel ───────────────────────────────────────────────────────────

describe("filterByLevel", () => {
  const entries: LogEntry[] = [
    { timestamp: "t1", level: "debug", message: "dbg", raw: "[t1] [DEBUG] dbg" },
    { timestamp: "t2", level: "info", message: "inf", raw: "[t2] [INFO] inf" },
    { timestamp: "t3", level: "warn", message: "wrn", raw: "[t3] [WARN] wrn" },
    { timestamp: "t4", level: "error", message: "err", raw: "[t4] [ERROR] err" },
  ];

  it("returns all entries at debug level", () => {
    expect(filterByLevel(entries, "debug")).toHaveLength(4);
  });

  it("filters out debug entries at info level", () => {
    const filtered = filterByLevel(entries, "info");
    expect(filtered).toHaveLength(3);
    expect(filtered.every((e) => e.level !== "debug")).toBe(true);
  });

  it("filters to warn and error at warn level", () => {
    const filtered = filterByLevel(entries, "warn");
    expect(filtered).toHaveLength(2);
    expect(filtered[0].level).toBe("warn");
    expect(filtered[1].level).toBe("error");
  });

  it("returns only errors at error level", () => {
    const filtered = filterByLevel(entries, "error");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].level).toBe("error");
  });
});

// ─── searchLogs ──────────────────────────────────────────────────────────────

describe("searchLogs", () => {
  const entries: LogEntry[] = [
    { timestamp: "t1", level: "info", message: "Bridge started on port 3100", raw: "[t1] [INFO] Bridge started on port 3100" },
    { timestamp: "t2", level: "error", message: "Connection refused to database", raw: "[t2] [ERROR] Connection refused to database" },
    { timestamp: "t3", level: "warn", message: "Memory usage at 85%", raw: "[t3] [WARN] Memory usage at 85%" },
    { timestamp: "t4", level: "info", message: "Git sync completed", raw: "[t4] [INFO] Git sync completed" },
  ];

  it("finds entries matching query in message", () => {
    const results = searchLogs(entries, "bridge");
    expect(results).toHaveLength(1);
    expect(results[0].message).toContain("Bridge");
  });

  it("finds entries matching query in raw line", () => {
    const results = searchLogs(entries, "ERROR");
    expect(results).toHaveLength(1);
  });

  it("is case-insensitive", () => {
    const results = searchLogs(entries, "MEMORY");
    expect(results).toHaveLength(1);
    expect(results[0].message).toContain("Memory");
  });

  it("returns empty for no matches", () => {
    expect(searchLogs(entries, "nonexistent")).toHaveLength(0);
  });

  it("finds multiple matches", () => {
    const results = searchLogs(entries, "port");
    expect(results).toHaveLength(1);
  });

  it("matches partial words", () => {
    const results = searchLogs(entries, "connect");
    expect(results).toHaveLength(1);
    expect(results[0].message).toContain("Connection");
  });
});

// ─── formatEntry ─────────────────────────────────────────────────────────────

describe("formatEntry", () => {
  it("includes the timestamp, level, and message", () => {
    const entry: LogEntry = {
      timestamp: "2026-03-30T12:00:00Z",
      level: "info",
      message: "Test message",
      raw: "[2026-03-30T12:00:00Z] [INFO] Test message",
    };
    const formatted = formatEntry(entry);
    expect(formatted).toContain("2026-03-30T12:00:00Z");
    expect(formatted).toContain("[INFO]");
    expect(formatted).toContain("Test message");
  });

  it("contains ANSI escape codes for coloring", () => {
    const entry: LogEntry = {
      timestamp: "t1",
      level: "error",
      message: "err",
      raw: "[t1] [ERROR] err",
    };
    const formatted = formatEntry(entry);
    expect(formatted).toContain("\x1b[");
  });
});
