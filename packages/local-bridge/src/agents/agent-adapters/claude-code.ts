/**
 * ClaudeCodeAdapter — interface with Claude Code sessions.
 *
 * Sends prompts to a Claude Code process and returns the resulting
 * code changes. Changes are applied to the repo via git after review.
 */

import { spawn, type ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import type { AgentAdapter, AgentAdapterConfig } from "./adapter.js";

interface ClaudeResponse {
  id: string;
  content: string;
  filesChanged: string[];
}

export class ClaudeCodeAdapter implements AgentAdapter {
  private config: AgentAdapterConfig;
  private process: ChildProcess | null = null;
  private pending = new Map<string, { resolve: (v: string) => void; reject: (e: Error) => void }>();
  private buffer = "";
  private model: string;

  constructor(config: AgentAdapterConfig) {
    this.config = config;
    this.model = (config.options["model"] as string) ?? "claude-sonnet-4-6";
  }

  async start(): Promise<void> {
    const apiKey = this.config.env["ANTHROPIC_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is required for Claude Code adapter");
    }

    // Start claude as a subprocess in --json mode.
    this.process = spawn("claude", ["--json", "--model", this.model], {
      cwd: this.config.workingDir,
      env: { ...process.env, ...this.config.env, ANTHROPIC_API_KEY: apiKey },
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.stdout?.on("data", (chunk: Buffer) => this.onStdout(chunk));
    this.process.stderr?.on("data", (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line) {
        console.info("[claude-code]", line);
      }
    });

    this.process.on("error", (err) => {
      for (const [, pending] of this.pending) {
        pending.reject(new Error(`Claude Code process error: ${err.message}`));
      }
      this.pending.clear();
    });

    this.process.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        for (const [, pending] of this.pending) {
          pending.reject(new Error(`Claude Code exited with code ${code}`));
        }
        this.pending.clear();
      }
    });

    // Give the process a moment to initialize.
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => resolve(), 2000);
      this.process!.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      this.process!.on("exit", (code) => {
        if (code !== 0 && code !== null) {
          clearTimeout(timeout);
          reject(new Error(`Claude Code exited immediately with code ${code}`));
        }
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.process) return;

    // Send exit command.
    this.process.stdin?.write("/exit\n");

    const forceKill = setTimeout(() => {
      this.process?.kill("SIGKILL");
    }, 5000);

    await new Promise<void>((resolve) => {
      this.process?.on("exit", () => {
        clearTimeout(forceKill);
        resolve();
      });
      if (this.process?.exitCode !== null) {
        clearTimeout(forceKill);
        resolve();
      }
    });

    this.process = null;
  }

  async send(message: string): Promise<string> {
    if (!this.process || this.process.exitCode !== null) {
      throw new Error("Claude Code agent is not running");
    }

    const id = randomUUID();

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Claude Code task timed out: ${id}`));
      }, 600_000); // 10 min timeout — code generation can be slow.

      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timeout); this.pending.delete(id); resolve(v); },
        reject: (e) => { clearTimeout(timeout); this.pending.delete(id); reject(e); },
      });

      // Send the prompt as a single line to claude's stdin.
      const payload = JSON.stringify({ id, prompt: message });
      this.process!.stdin?.write(payload + "\n");
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
        const resp = JSON.parse(trimmed) as ClaudeResponse;
        const pending = this.pending.get(resp.id);
        if (pending) {
          // Include file change summary in response.
          const summary = resp.filesChanged.length > 0
            ? `\n\nFiles changed: ${resp.filesChanged.join(", ")}`
            : "";
          pending.resolve(resp.content + summary);
        }
      } catch {
        // Not JSON — check if it's a plain text response for any pending request.
        // Claude Code may output non-JSON in some modes.
        if (this.pending.size === 1) {
          const [id, pending] = this.pending.entries().next().value!;
          pending.resolve(trimmed);
          this.pending.delete(id);
        }
      }
    }
  }
}
