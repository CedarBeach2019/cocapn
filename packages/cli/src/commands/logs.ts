/**
 * cocapn logs — View and search agent logs
 */

import { Command } from "commander";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  dim: "\x1b[2m",
};

const cyan = (s: string) => `${colors.cyan}${s}${colors.reset}`;
const bold = (s: string) => `${colors.bold}${s}${colors.reset}`;

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  raw: string;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, (s: string) => string> = {
  debug: (s) => `${colors.green}${s}${colors.reset}`,
  info: (s) => `${colors.cyan}${s}${colors.reset}`,
  warn: (s) => `${colors.yellow}${s}${colors.reset}`,
  error: (s) => `${colors.red}${s}${colors.reset}`,
};

const LOG_PATTERN = /^\[([^\]]+)\]\s+\[(DEBUG|INFO|WARN|ERROR)\]\s+(.+)$/i;

export function parseLogLine(line: string): LogEntry | null {
  const match = line.match(LOG_PATTERN);
  if (!match) return null;
  return {
    timestamp: match[1],
    level: match[2].toLowerCase() as LogLevel,
    message: match[3],
    raw: line,
  };
}

export function resolveLogsDir(cwd: string): string {
  return join(cwd, "cocapn", "logs");
}

export function findLogFiles(logsDir: string): string[] {
  if (!existsSync(logsDir)) return [];
  return readdirSync(logsDir)
    .filter((f) => f.endsWith(".log"))
    .map((f) => join(logsDir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

export function readLogs(logFiles: string[], lines: number): LogEntry[] {
  const allEntries: LogEntry[] = [];
  for (const file of logFiles) {
    const content = readFileSync(file, "utf-8");
    const fileLines = content.split("\n");
    for (const line of fileLines) {
      const entry = parseLogLine(line);
      if (entry) allEntries.push(entry);
    }
  }
  return allEntries.slice(-lines);
}

export function filterByLevel(entries: LogEntry[], minLevel: LogLevel): LogEntry[] {
  const minPriority = LEVEL_PRIORITY[minLevel];
  return entries.filter((e) => LEVEL_PRIORITY[e.level] >= minPriority);
}

export function searchLogs(entries: LogEntry[], query: string): LogEntry[] {
  const lowerQuery = query.toLowerCase();
  return entries.filter(
    (e) =>
      e.message.toLowerCase().includes(lowerQuery) ||
      e.raw.toLowerCase().includes(lowerQuery)
  );
}

export function formatEntry(entry: LogEntry): string {
  const colorFn = LEVEL_COLORS[entry.level];
  const levelTag = colorFn(`[${entry.level.toUpperCase()}]`.padEnd(8));
  return `${colors.dim}${entry.timestamp}${colors.reset} ${levelTag} ${entry.message}`;
}

export function createLogsCommand(): Command {
  const cmd = new Command("logs")
    .description("View and search agent logs")
    .option("-n, --lines <n>", "Number of lines to show", "50")
    .option("-f, --follow", "Follow log output (tail -f)", false)
    .option("-l, --level <level>", "Minimum log level (debug|info|warn|error)", "debug")
    .option("--logs-dir <path>", "Custom logs directory")
    .action(async (options) => {
      const cwd = process.cwd();
      const logsDir = options.logsDir || resolveLogsDir(cwd);
      const lines = parseInt(options.lines, 10);
      const minLevel = options.level as LogLevel;

      if (!existsSync(logsDir)) {
        console.error(`${colors.red}No logs directory found at ${logsDir}${colors.reset}`);
        console.error(`Make sure the bridge has been started at least once: ${cyan("cocapn start")}`);
        process.exit(1);
      }

      const logFiles = findLogFiles(logsDir);
      if (logFiles.length === 0) {
        console.error(`${colors.yellow}No log files found in ${logsDir}${colors.reset}`);
        process.exit(1);
      }

      if (!LEVEL_PRIORITY[minLevel]) {
        console.error(`${colors.red}Invalid log level: ${minLevel}. Use: debug, info, warn, error${colors.reset}`);
        process.exit(1);
      }

      // Initial display
      let entries = readLogs(logFiles, lines);
      entries = filterByLevel(entries, minLevel);

      if (entries.length === 0) {
        console.log(`${colors.gray}No log entries found matching level ${minLevel}${colors.reset}`);
        if (!options.follow) process.exit(0);
      } else {
        for (const entry of entries) {
          console.log(formatEntry(entry));
        }
      }

      // Follow mode
      if (options.follow) {
        console.log(cyan("\n--- following logs (Ctrl+C to stop) ---\n"));

        // Track current sizes of all log files
        const fileSizes = new Map<string, number>();
        for (const file of logFiles) {
          fileSizes.set(file, statSync(file).size);
        }

        // Poll for changes every 500ms
        const interval = setInterval(() => {
          const currentFiles = findLogFiles(logsDir);
          for (const file of currentFiles) {
            try {
              const currentSize = statSync(file).size;
              const prevSize = fileSizes.get(file) || 0;

              if (currentSize > prevSize) {
                const content = readFileSync(file, "utf-8");
                const allLines = content.split("\n");
                const newLines = allLines.slice(
                  prevSize === 0 ? -lines : Math.floor(prevSize / (allLines[allLines.length - 1]?.length || 80))
                );

                for (const line of newLines) {
                  const entry = parseLogLine(line);
                  if (entry && LEVEL_PRIORITY[entry.level] >= LEVEL_PRIORITY[minLevel]) {
                    console.log(formatEntry(entry));
                  }
                }

                fileSizes.set(file, currentSize);
              }

              // Track new files
              if (!fileSizes.has(file)) {
                fileSizes.set(file, statSync(file).size);
              }
            } catch {
              // File may have been rotated
            }
          }
        }, 500);

        // Graceful shutdown
        const cleanup = () => {
          clearInterval(interval);
          process.exit(0);
        };
        process.on("SIGINT", cleanup);
        process.on("SIGTERM", cleanup);
      }
    });

  // Search subcommand
  cmd.addCommand(
    new Command("search")
      .description("Search logs for a query")
      .argument("<query>", "Search query")
      .option("-n, --lines <n>", "Number of lines to search", "500")
      .option("--logs-dir <path>", "Custom logs directory")
      .action(async (query, options) => {
        const cwd = process.cwd();
        const logsDir = options.logsDir || resolveLogsDir(cwd);
        const lines = parseInt(options.lines, 10);

        if (!existsSync(logsDir)) {
          console.error(`${colors.red}No logs directory found at ${logsDir}${colors.reset}`);
          process.exit(1);
        }

        const logFiles = findLogFiles(logsDir);
        if (logFiles.length === 0) {
          console.error(`${colors.yellow}No log files found in ${logsDir}${colors.reset}`);
          process.exit(1);
        }

        const entries = readLogs(logFiles, lines);
        const matches = searchLogs(entries, query);

        if (matches.length === 0) {
          console.log(`${colors.gray}No matches found for "${bold(query)}"${colors.reset}`);
          process.exit(0);
        }

        console.log(cyan(`Found ${matches.length} match(es) for "${bold(query)}":\n`));
        for (const entry of matches) {
          console.log(formatEntry(entry));
        }
      })
  );

  return cmd;
}
