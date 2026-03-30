/**
 * Deploy configuration loader
 *
 * Reads cocapn.json from project root and merges with:
 * - cocapn.{env}.json (environment-specific overrides)
 * - ~/.cocapn/deploy-settings.json (user settings)
 * - Default values
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface DeployConfig {
  name: string;
  version: string;
  template: string;
  description?: string;
  author?: string;
  license?: string;
  deploy: {
    account: string;
    account_id?: string;
    region: string;
    compatibility_date: string;
    compatibility_flags?: string[];
    environments?: Record<string, EnvironmentConfig>;
    vars: Record<string, string>;
    secrets: SecretConfig;
    durable_objects?: DurableObjectConfig[];
    kv_namespaces?: KVNamespaceConfig[];
    d1_databases?: D1DatabaseConfig[];
    migrations?: MigrationConfig[];
  };
}

export interface EnvironmentConfig {
  route?: string;
  vars?: Record<string, string>;
}

export interface SecretConfig {
  required: string[];
  optional?: string[];
}

export interface DurableObjectConfig {
  name: string;
  class_name: string;
  script_name?: string;
}

export interface KVNamespaceConfig {
  name: string;
  binding: string;
}

export interface D1DatabaseConfig {
  name: string;
  binding: string;
}

export interface MigrationConfig {
  tag: string;
  new_sqlite_classes?: string[];
}

export interface DeploySettings {
  cloudflare_api_token?: string;
  cloudflare_account_id?: string;
  default_region?: string;
  defaults?: Record<string, string>;
}

const DEFAULT_COMPATIBILITY_DATE = "2024-12-05";
const DEFAULT_REGION = "auto";

/**
 * Load deploy configuration from project directory
 */
export function loadDeployConfig(
  projectDir: string,
  env: string = "production"
): DeployConfig {
  // Load base configuration
  const configPath = join(projectDir, "cocapn.json");

  if (!existsSync(configPath)) {
    throw new Error(
      `Missing cocapn.json in ${projectDir}. Run 'cocapn init' first.`
    );
  }

  let config = JSON.parse(readFileSync(configPath, "utf-8")) as DeployConfig;

  // Validate required fields
  validateDeployConfig(config);

  // Load environment-specific overrides
  const envConfigPath = join(projectDir, `cocapn.${env}.json`);
  if (existsSync(envConfigPath)) {
    const envConfig = JSON.parse(readFileSync(envConfigPath, "utf-8"));
    config = mergeDeep(config, envConfig);
  }

  // Load user settings
  const settingsPath = join(homedir(), ".cocapn", "deploy-settings.json");
  if (existsSync(settingsPath)) {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as DeploySettings;
    if (settings.cloudflare_account_id && !config.deploy.account_id) {
      config.deploy.account_id = settings.cloudflare_account_id;
    }
    if (settings.default_region && config.deploy.region === DEFAULT_REGION) {
      config.deploy.region = settings.default_region;
    }
  }

  // Apply defaults
  applyDefaults(config);

  return config;
}

/**
 * Load secrets from ~/.cocapn/secrets.json
 */
export function loadSecrets(account: string): Record<string, string> {
  const secretsPath = join(homedir(), ".cocapn", "secrets.json");

  if (!existsSync(secretsPath)) {
    return {};
  }

  const secrets = JSON.parse(readFileSync(secretsPath, "utf-8"));

  if (!secrets.accounts || !secrets.accounts[account]) {
    return {};
  }

  const accountSecrets = secrets.accounts[account];

  // Return decrypted secrets (for now, assume decrypted)
  // In production, this would decrypt using age-encryption
  return accountSecrets.secrets || {};
}

/**
 * Validate deploy configuration
 */
function validateDeployConfig(config: DeployConfig): void {
  if (!config.name) {
    throw new Error("Missing required field: name");
  }

  if (!config.template) {
    throw new Error("Missing required field: template");
  }

  if (!config.deploy) {
    throw new Error("Missing required field: deploy");
  }

  if (!config.deploy.account) {
    throw new Error("Missing required field: deploy.account");
  }

  if (!config.deploy.vars) {
    config.deploy.vars = {};
  }

  if (!config.deploy.secrets) {
    config.deploy.secrets = { required: [], optional: [] };
  }
}

/**
 * Apply default values
 */
function applyDefaults(config: DeployConfig): void {
  if (!config.deploy.region) {
    config.deploy.region = DEFAULT_REGION;
  }

  if (!config.deploy.compatibility_date) {
    config.deploy.compatibility_date = DEFAULT_COMPATIBILITY_DATE;
  }

  if (!config.deploy.compatibility_flags) {
    config.deploy.compatibility_flags = ["nodejs_compat"];
  }

  if (!config.version) {
    config.version = "1.0.0";
  }

  // Default vars
  config.deploy.vars = {
    BRIDGE_MODE: "cloud",
    TEMPLATE: config.template,
    ...config.deploy.vars,
  };
}

/**
 * Deep merge two objects
 */
function mergeDeep<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const output = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue) &&
      targetValue &&
      typeof targetValue === "object" &&
      !Array.isArray(targetValue)
    ) {
      (output as any)[key] = mergeDeep(targetValue as any, sourceValue as any);
    } else {
      (output as any)[key] = sourceValue;
    }
  }

  return output;
}

/**
 * Get environment-specific configuration
 */
export function getEnvironmentConfig(
  config: DeployConfig,
  env: string
): EnvironmentConfig | undefined {
  return config.deploy.environments?.[env];
}
