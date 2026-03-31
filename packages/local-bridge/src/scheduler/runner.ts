/**
 * Runner — Execute scheduled commands via child_process
 *
 * Spawns shell commands and tracks execution results.
 */

import { exec } from "child_process";

export interface RunResult {
  /** Task name that was executed */
  task: string;
  /** Exit code (null if timed out or killed) */
  exitCode: number | null;
  /** stdout output */
  stdout: string;
  /** stderr output */
  stderr: string;
  /** Whether the command succeeded (exit code 0) */
  success: boolean;
  /** Execution duration in ms */
  durationMs: number;
  /** ISO timestamp when execution started */
  startedAt: string;
}

/**
 * Run a shell command and return the result.
 *
 * @param taskName - Name of the task (for logging/attribution)
 * @param command - Shell command to execute
 * @param timeoutMs - Maximum execution time in ms (default 5 minutes)
 * @returns Run result with exit code, output, and timing
 */
export function runCommand(
  taskName: string,
  command: string,
  timeoutMs: number = 5 * 60 * 1000,
): Promise<RunResult> {
  const startedAt = new Date().toISOString();
  const start = Date.now();

  return new Promise((resolve) => {
    const child = exec(
      command,
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - start;
        const exitCode = error ? (error.killed ? null : error.code ?? 1) : 0;

        resolve({
          task: taskName,
          exitCode: exitCode as number | null,
          stdout: stdout?.toString() ?? "",
          stderr: stderr?.toString() ?? "",
          success: exitCode === 0,
          durationMs,
          startedAt,
        });
      },
    );

    // Ensure process doesn't hang beyond timeout
    child.on("error", () => {
      resolve({
        task: taskName,
        exitCode: 1,
        stdout: "",
        stderr: "Failed to spawn process",
        success: false,
        durationMs: Date.now() - start,
        startedAt,
      });
    });
  });
}
