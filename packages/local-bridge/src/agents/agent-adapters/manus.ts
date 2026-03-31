/**
 * ManusAdapter — interface with Manus-like agents.
 *
 * Manus agents run as sandboxed processes that accept task descriptions
 * and produce file changes + results. Communication happens over stdio
 * using a simple JSON protocol.
 */

import { spawn, type ChildProcess } from "child_process";
import { join } from "path";
import { randomUUID } from "crypto";
import type { AgentAdapter, AgentAdapterConfig } from "./adapter.js";

interface ManusMessage {
  id: string;
  type: "task" | "result" | "error" | "ping";
  payload: string;
}

export class ManusAdapter implements AgentAdapter {
  private config: AgentAdapterConfig;
  private process: ChildProcess | null = null;
  private pending = new Map<string, { resolve: (v: string) => void; reject: (e: Error) => void }>();
  private buffer = "";

  constructor(config: AgentAdapterConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    const command = this.resolveCommand();
    const args = this.resolveArgs();

    this.process = spawn(command, args, {
      cwd: this.config.workingDir,
      env: { ...process.env, ...this.config.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.stdout?.on("data", (chunk: Buffer) => this.onStdout(chunk));
    this.process.stderr?.on("data", (chunk: Buffer) => {
      // Manus logs progress to stderr — forward for debugging.
      const line = chunk.toString().trim();
      if (line) {
        console.info("[manus]", line);
      }
    });

    this.process.on("error", (err) => {
      // Reject all pending requests.
      for (const [, pending] of this.pending) {
        pending.reject(new Error(`Manus process error: ${err.message}`));
      }
      this.pending.clear();
    });

    this.process.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        for (const [, pending] of this.pending) {
          pending.reject(new Error(`Manus process exited with code ${code}`));
        }
        this.pending.clear();
      }
    });

    // Wait briefly for the process to stabilize.
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve(); // assume started
      }, 1000);

      this.process!.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      this.process!.on("exit", (code) => {
        if (code !== 0 && code !== null) {
          clearTimeout(timeout);
          reject(new Error(`Manus exited immediately with code ${code}`));
        }
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.process) return;

    // Send a graceful shutdown signal.
    const msg: ManusMessage = { id: "shutdown", type: "ping", payload: "shutdown" };
    this.process.stdin?.write(JSON.stringify(msg) + "\n");

    // Give it a moment, then force-kill.
    const forceKill = setTimeout(() => {
      this.process?.kill("SIGKILL");
    }, 5000);

    await new Promise<void>((resolve) => {
      this.process?.on("exit", () => {
        clearTimeout(forceKill);
        resolve();
      });
      // If already dead:
      if (this.process?.exitCode !== null) {
        clearTimeout(forceKill);
        resolve();
      }
    });

    this.process = null;
  }

  async send(message: string): Promise<string> {
    if (!this.process || this.process.exitCode !== null) {
      throw new Error("Manus agent is not running");
    }

    const id = randomUUID();
    const msg: ManusMessage = { id, type: "task", payload: message };

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Manus task timed out: ${id}`));
      }, 300_000); // 5 min timeout for long tasks

      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timeout); this.pending.delete(id); resolve(v); },
        reject: (e) => { clearTimeout(timeout); this.pending.delete(id); reject(e); },
      });

      this.process!.stdin?.write(JSON.stringify(msg) + "\n");
    });
  }

  isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  // --- internals ---

  private onStdout(chunk: Buffer): void {
    this.buffer += chunk.toString();
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const msg = JSON.parse(trimmed) as ManusMessage;
        const pending = this.pending.get(msg.id);
        if (!pending) continue;

        if (msg.type === "result") {
          pending.resolve(msg.payload);
        } else if (msg.type === "error") {
          pending.reject(new Error(msg.payload));
        }
      } catch {
        // Not JSON — ignore non-protocol output.
      }
    }
  }

  private resolveCommand(): string {
    return (this.config.options["command"] as string) ?? "manus";
  }

  private resolveArgs(): string[] {
    const args = (this.config.options["args"] as string[]) ?? [];
    if (this.config.options["sandboxDir"]) {
      return ["--sandbox", join(this.config.workingDir, this.config.options["sandboxDir"] as string), ...args];
    }
    return args;
  }
}
