/**
 * Debug test for init command
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn } from "child_process";
import { existsSync, mkdirSync, rmdirSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";

describe("Init Debug", () => {
  const testDir = join(process.cwd(), "test-temp-debug");

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    console.log("Test dir:", testDir);
    console.log("Test dir exists before:", existsSync(testDir));
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      const files = readdirSync(testDir);
      console.log("Files in test dir:", files);
      for (const file of files) {
        const filePath = join(testDir, file);
        try {
          unlinkSync(filePath);
        } catch {
          // Ignore
        }
      }
      try {
        rmdirSync(testDir);
      } catch {
        // Ignore
      }
    }
  });

  it("should run init command", async () => {
    console.log("Running init command...");

    const result = await runCommand(["init", testDir]);
    console.log("Result:", result);
    console.log("Stdout:", result.stdout);
    console.log("Stderr:", result.stderr);
    console.log("Exit code:", result.code);

    const cocapnDir = join(testDir, "cocapn");
    console.log("Cocapn dir:", cocapnDir);
    console.log("Cocapn exists:", existsSync(cocapnDir));

    expect(existsSync(cocapnDir)).toBe(true);
  });
});

async function runCommand(args: string[]): Promise<{
  stdout: string;
  stderr: string;
  code: number;
}> {
  return new Promise((resolve) => {
    const cliPath = join(process.cwd(), "dist", "index.js");

    console.log("Running:", process.execPath, cliPath, ...args);

    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "test",
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });

    setTimeout(() => {
      child.kill();
      resolve({ stdout, stderr, code: 1 });
    }, 10000);
  });
}
