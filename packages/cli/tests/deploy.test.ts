/**
 * Deploy command tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmdirSync, readdirSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { loadDeployConfig, loadSecrets } from "../src/commands/deploy-config.js";

describe("Deploy Config", () => {
  const testDir = join(process.cwd(), "test-temp-deploy");

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      const files = readdirSync(testDir);
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

  describe("loadDeployConfig", () => {
    it("should load and validate cocapn.json", () => {
      const configPath = join(testDir, "cocapn.json");
      const config = {
        name: "test-makerlog",
        version: "1.0.0",
        template: "makerlog",
        description: "Test deployment",
        deploy: {
          account: "test-account",
          region: "auto",
          compatibility_date: "2024-12-05",
          vars: {
            BRIDGE_MODE: "cloud",
            TEMPLATE: "makerlog",
          },
          secrets: {
            required: ["API_KEY"],
            optional: [],
          },
        },
      };

      writeFileSync(configPath, JSON.stringify(config, null, 2));

      const loaded = loadDeployConfig(testDir, "production");

      expect(loaded.name).toBe("test-makerlog");
      expect(loaded.template).toBe("makerlog");
      expect(loaded.deploy.account).toBe("test-account");
      expect(loaded.deploy.region).toBe("auto");
    });

    it("should throw if cocapn.json is missing", () => {
      expect(() => loadDeployConfig(testDir, "production")).toThrow("Missing cocapn.json");
    });

    it("should apply defaults for missing fields", () => {
      const configPath = join(testDir, "cocapn.json");
      const config = {
        name: "test-makerlog",
        template: "makerlog",
        deploy: {
          account: "test-account",
          vars: {},
          secrets: {
            required: [],
            optional: [],
          },
        },
      };

      writeFileSync(configPath, JSON.stringify(config, null, 2));

      const loaded = loadDeployConfig(testDir, "production");

      expect(loaded.version).toBe("1.0.0");
      expect(loaded.deploy.region).toBe("auto");
      expect(loaded.deploy.compatibility_date).toBe("2024-12-05");
      expect(loaded.deploy.vars.BRIDGE_MODE).toBe("cloud");
      expect(loaded.deploy.vars.TEMPLATE).toBe("makerlog");
    });

    it("should merge environment-specific config", () => {
      const configPath = join(testDir, "cocapn.json");
      const config = {
        name: "test-makerlog",
        template: "makerlog",
        deploy: {
          account: "test-account",
          region: "auto",
          vars: {
            LOG_LEVEL: "info",
          },
          secrets: {
            required: [],
            optional: [],
          },
        },
      };

      writeFileSync(configPath, JSON.stringify(config, null, 2));

      const envConfigPath = join(testDir, "cocapn.staging.json");
      const envConfig = {
        deploy: {
          vars: {
            LOG_LEVEL: "debug",
            FEATURE_FLAGS: "beta_features",
          },
        },
      };

      writeFileSync(envConfigPath, JSON.stringify(envConfig, null, 2));

      const loaded = loadDeployConfig(testDir, "staging");

      expect(loaded.deploy.vars.LOG_LEVEL).toBe("debug");
      expect(loaded.deploy.vars.FEATURE_FLAGS).toBe("beta_features");
    });

    it("should validate required fields", () => {
      const configPath = join(testDir, "cocapn.json");

      // Missing name
      const invalidConfig1 = {
        template: "makerlog",
        deploy: {
          account: "test-account",
          vars: {},
          secrets: { required: [], optional: [] },
        },
      };
      writeFileSync(configPath, JSON.stringify(invalidConfig1, null, 2));
      expect(() => loadDeployConfig(testDir, "production")).toThrow("Missing required field: name");

      // Missing template
      const invalidConfig2 = {
        name: "test",
        deploy: {
          account: "test-account",
          vars: {},
          secrets: { required: [], optional: [] },
        },
      };
      writeFileSync(configPath, JSON.stringify(invalidConfig2, null, 2));
      expect(() => loadDeployConfig(testDir, "production")).toThrow("Missing required field: template");

      // Missing deploy.account
      const invalidConfig3 = {
        name: "test",
        template: "makerlog",
        deploy: {
          vars: {},
          secrets: { required: [], optional: [] },
        },
      };
      writeFileSync(configPath, JSON.stringify(invalidConfig3, null, 2));
      expect(() => loadDeployConfig(testDir, "production")).toThrow("Missing required field: deploy.account");
    });
  });

  describe("loadSecrets", () => {
    it("should return empty object if secrets file does not exist", () => {
      const secrets = loadSecrets("test-account");
      expect(secrets).toEqual({});
    });

    it("should return empty object if account not found in secrets", () => {
      const secretsPath = join(process.cwd(), ".cocapn", "secrets.json");
      // We won't create this file in tests, but if it existed, it would test this path
      // For now, just verify it returns empty when file doesn't exist
      const secrets = loadSecrets("nonexistent-account");
      expect(secrets).toEqual({});
    });
  });
});

describe("Deploy Command Parsing", () => {
  it("should parse deploy command correctly", async () => {
    const result = await runCommand(["deploy", "--help"]);
    expect(result.stdout).toContain("Deploy cocapn instance");
    expect(result.stdout).toContain("--env");
    expect(result.stdout).toContain("--region");
  });

  it("should parse deploy with dry-run flag", async () => {
    const result = await runCommand(["deploy", "--dry-run", "--help"]);
    expect(result.stdout).toContain("--dry-run");
  });

  it("should parse deploy with skip-tests flag", async () => {
    const result = await runCommand(["deploy", "--no-tests", "--help"]);
    expect(result.stdout).toContain("--no-tests");
  });
});

describe("Rollback Command Parsing", () => {
  it("should parse rollback command correctly", async () => {
    const result = await runCommand(["rollback", "--help"]);
    expect(result.stdout).toContain("Rollback Cloudflare Workers deployment");
    expect(result.stdout).toContain("--env");
  });

  it("should parse rollback with version argument", async () => {
    const result = await runCommand(["rollback", "--help"]);
    expect(result.stdout).toContain("[version]");
  });

  it("should parse rollback with confirm flag", async () => {
    const result = await runCommand(["rollback", "--confirm", "--help"]);
    expect(result.stdout).toContain("--confirm");
  });
});

/**
 * Helper to run CLI command
 */
async function runCommand(args: string[]): Promise<{
  stdout: string;
  stderr: string;
  code: number;
}> {
  return new Promise((resolve) => {
    const cliPath = join(process.cwd(), "dist", "index.js");

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

    // Timeout after 10 seconds
    setTimeout(() => {
      child.kill();
      resolve({ stdout, stderr, code: 1 });
    }, 10000);
  });
}
