import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { parse as parseYaml } from "../../packages/local-bridge/node_modules/yaml/index.js";

const SANDBOX_DIR = resolve(import.meta.dirname, "..");
const ROOT_DIR = resolve(SANDBOX_DIR, "..");

describe("Docker Sandbox", () => {
  describe("Dockerfile", () => {
    const dockerfilePath = join(SANDBOX_DIR, "Dockerfile");

    it("should exist", () => {
      expect(existsSync(dockerfilePath)).toBe(true);
    });

    it("should use multi-stage build", () => {
      const content = readFileSync(dockerfilePath, "utf-8");
      expect(content).toContain("AS builder");
      expect(content).toContain("FROM node:22-alpine");
    });

    it("should use alpine base images", () => {
      const content = readFileSync(dockerfilePath, "utf-8");
      const fromLines = content.match(/FROM.+/g) || [];
      for (const line of fromLines) {
        if (line.includes("AS builder")) {
          expect(line).toContain("alpine");
        }
      }
      // Runtime stage should be alpine
      expect(content).toMatch(/FROM node:22-alpine\s*$/m);
    });

    it("should include git and curl", () => {
      const content = readFileSync(dockerfilePath, "utf-8");
      expect(content).toContain("git");
      expect(content).toContain("curl");
    });

    it("should expose port 3100", () => {
      const content = readFileSync(dockerfilePath, "utf-8");
      expect(content).toContain("EXPOSE 3100");
    });

    it("should include health check", () => {
      const content = readFileSync(dockerfilePath, "utf-8");
      expect(content).toContain("HEALTHCHECK");
      expect(content).toContain("/health");
    });

    it("should set production environment", () => {
      const content = readFileSync(dockerfilePath, "utf-8");
      expect(content).toContain("NODE_ENV=production");
    });

    it("should copy built artifacts from builder", () => {
      const content = readFileSync(dockerfilePath, "utf-8");
      expect(content).toContain("--from=builder");
      expect(content).toContain("packages/cli/dist/");
      expect(content).toContain("packages/local-bridge/dist/");
    });

    it("should define a VOLUME for brain data", () => {
      const content = readFileSync(dockerfilePath, "utf-8");
      expect(content).toContain("VOLUME");
    });
  });

  describe("docker-compose.yml", () => {
    const composePath = join(SANDBOX_DIR, "docker-compose.yml");

    it("should exist", () => {
      expect(existsSync(composePath)).toBe(true);
    });

    it("should reference the sandbox Dockerfile", () => {
      const content = readFileSync(composePath, "utf-8");
      expect(content).toContain("docker-sandbox/Dockerfile");
    });

    it("should set restart policy", () => {
      const content = readFileSync(composePath, "utf-8");
      expect(content).toContain("restart: unless-stopped");
    });

    it("should define a named volume for data persistence", () => {
      const content = readFileSync(composePath, "utf-8");
      expect(content).toContain("cocapn-data");
      expect(content).toContain("volumes:");
    });

    it("should pass API keys from environment", () => {
      const content = readFileSync(composePath, "utf-8");
      expect(content).toContain("DEEPSEEK_API_KEY");
    });

    it("should include health check", () => {
      const content = readFileSync(composePath, "utf-8");
      expect(content).toContain("healthcheck");
    });
  });

  describe("default-config.yml", () => {
    const configPath = join(SANDBOX_DIR, "default-config.yml");

    it("should exist", () => {
      expect(existsSync(configPath)).toBe(true);
    });

    it("should parse as valid YAML", () => {
      const content = readFileSync(configPath, "utf-8");
      expect(() => parseYaml(content)).not.toThrow();
    });

    it("should have required top-level keys", () => {
      const content = readFileSync(configPath, "utf-8");
      const config = parseYaml(content);
      expect(config).toHaveProperty("soul");
      expect(config).toHaveProperty("config");
      expect(config).toHaveProperty("memory");
      expect(config).toHaveProperty("sync");
    });

    it("should default to private mode on port 3100", () => {
      const content = readFileSync(configPath, "utf-8");
      const config = parseYaml(content);
      expect(config.config.mode).toBe("private");
      expect(config.config.port).toBe(3100);
    });

    it("should reference environment variables for API keys", () => {
      const content = readFileSync(configPath, "utf-8");
      expect(content).toContain("${DEEPSEEK_API_KEY}");
    });

    it("should have sensible sync defaults", () => {
      const content = readFileSync(configPath, "utf-8");
      const config = parseYaml(content);
      expect(config.sync.autoCommit).toBe(true);
      expect(config.sync.autoPush).toBe(false);
      expect(config.sync.interval).toBeGreaterThanOrEqual(60);
    });
  });

  describe("default-soul.md", () => {
    const soulPath = join(SANDBOX_DIR, "default-soul.md");

    it("should exist", () => {
      expect(existsSync(soulPath)).toBe(true);
    });

    it("should have YAML frontmatter", () => {
      const content = readFileSync(soulPath, "utf-8");
      expect(content).toMatch(/^---\n/);
      expect(content).toMatch(/\n---\n/);
    });

    it("should define agent name in frontmatter", () => {
      const content = readFileSync(soulPath, "utf-8");
      const frontmatter = content.match(/^---\n([\s\S]*?)\n---/)?.[1] || "";
      expect(frontmatter).toContain("name:");
    });

    it("should have Identity and Rules sections", () => {
      const content = readFileSync(soulPath, "utf-8");
      expect(content).toContain("# Identity");
      expect(content).toContain("## Rules");
    });
  });

  describe(".env.example", () => {
    const envPath = join(SANDBOX_DIR, ".env.example");

    it("should exist", () => {
      expect(existsSync(envPath)).toBe(true);
    });

    it("should list DEEPSEEK_API_KEY as required", () => {
      const content = readFileSync(envPath, "utf-8");
      expect(content).toContain("DEEPSEEK_API_KEY=");
    });

    it("should not contain real API keys", () => {
      const content = readFileSync(envPath, "utf-8");
      expect(content).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
    });
  });

  describe("install.sh", () => {
    const installPath = join(SANDBOX_DIR, "install.sh");

    it("should exist", () => {
      expect(existsSync(installPath)).toBe(true);
    });

    it("should use strict mode", () => {
      const content = readFileSync(installPath, "utf-8");
      expect(content).toContain("set -euo pipefail");
    });

    it("should check for docker", () => {
      const content = readFileSync(installPath, "utf-8");
      expect(content).toContain("command -v docker");
    });

    it("should check for git", () => {
      const content = readFileSync(installPath, "utf-8");
      expect(content).toContain("command -v git");
    });

    it("should handle headless mode", () => {
      const content = readFileSync(installPath, "utf-8");
      expect(content).toContain("[ -t 0 ]");
    });
  });

  describe("test-sandbox.sh", () => {
    const testPath = join(SANDBOX_DIR, "test-sandbox.sh");

    it("should exist", () => {
      expect(existsSync(testPath)).toBe(true);
    });

    it("should test health endpoint", () => {
      const content = readFileSync(testPath, "utf-8");
      expect(content).toContain("/health");
    });

    it("should test chat endpoint", () => {
      const content = readFileSync(testPath, "utf-8");
      expect(content).toContain("/api/chat");
    });

    it("should test streaming", () => {
      const content = readFileSync(testPath, "utf-8");
      expect(content).toContain("stream");
    });

    it("should test memory", () => {
      const content = readFileSync(testPath, "utf-8");
      expect(content).toContain("/api/memory");
    });
  });

  describe("enterprise.md", () => {
    const enterprisePath = join(SANDBOX_DIR, "enterprise.md");

    it("should exist", () => {
      expect(existsSync(enterprisePath)).toBe(true);
    });

    it("should cover Kubernetes", () => {
      const content = readFileSync(enterprisePath, "utf-8");
      expect(content).toContain("Kubernetes");
      expect(content).toContain("kubectl");
    });

    it("should cover secret management", () => {
      const content = readFileSync(enterprisePath, "utf-8");
      expect(content).toContain("Secret");
      expect(content).toMatch(/Vault|secret/i);
    });

    it("should cover monitoring", () => {
      const content = readFileSync(enterprisePath, "utf-8");
      expect(content).toMatch(/monitoring|Prometheus|metrics/i);
    });
  });

  describe("Kubernetes manifests", () => {
    const k8sDir = join(SANDBOX_DIR, "kubernetes");
    const requiredFiles = [
      "deployment.yaml",
      "service.yaml",
      "configmap.yaml",
      "secret.yaml",
      "ingress.yaml",
    ];

    it("should have all required manifests", () => {
      for (const file of requiredFiles) {
        expect(existsSync(join(k8sDir, file))).toBe(true);
      }
    });

    it("deployment should reference cocapn image", () => {
      const content = readFileSync(join(k8sDir, "deployment.yaml"), "utf-8");
      expect(content).toContain("image:");
      expect(content).toContain("cocapn");
    });

    it("service should target port 3100", () => {
      const content = readFileSync(join(k8sDir, "service.yaml"), "utf-8");
      expect(content).toContain("3100");
    });

    it("secret should have placeholder API key", () => {
      const content = readFileSync(join(k8sDir, "secret.yaml"), "utf-8");
      expect(content).toContain("DEEPSEEK_API_KEY");
    });

    it("ingress should configure TLS", () => {
      const content = readFileSync(join(k8sDir, "ingress.yaml"), "utf-8");
      expect(content).toContain("tls:");
    });
  });
});
