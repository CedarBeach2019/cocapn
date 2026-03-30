/**
 * Plugin Installer — Install/uninstall/list cocapn plugins via npm
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, cp, rm, readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const execAsync = promisify(exec);

export interface InstalledPlugin {
  name: string;
  version: string;
  path: string;
  description: string;
  author: string;
  skills: string[];
  permissions: string[];
}

/**
 * Get the global plugins directory: ~/.cocapn/plugins/
 */
export function getPluginDir(): string {
  return join(homedir(), ".cocapn", "plugins");
}

/**
 * Validate a cocapn-plugin.json manifest.
 * Returns the parsed manifest or throws.
 */
export async function validateManifest(
  manifestPath: string,
): Promise<Record<string, unknown>> {
  if (!existsSync(manifestPath)) {
    throw new Error(`cocapn-plugin.json not found at ${manifestPath}`);
  }

  const raw = await readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(raw) as Record<string, unknown>;

  if (!manifest["name"] || typeof manifest["name"] !== "string") {
    throw new Error("Invalid manifest: missing or invalid 'name'");
  }
  if (!manifest["version"] || typeof manifest["version"] !== "string") {
    throw new Error("Invalid manifest: missing or invalid 'version'");
  }
  if (!manifest["skills"] || !Array.isArray(manifest["skills"])) {
    throw new Error("Invalid manifest: missing or invalid 'skills' array");
  }
  if (!manifest["permissions"] || !Array.isArray(manifest["permissions"])) {
    throw new Error("Invalid manifest: missing or invalid 'permissions' array");
  }

  return manifest;
}

/**
 * Install a plugin from npm.
 *
 * Steps:
 * 1. npm install <name> in a temp dir to fetch the package
 * 2. Read cocapn-plugin.json from node_modules/<name>/
 * 3. Validate manifest
 * 4. Copy plugin to ~/.cocapn/plugins/<name>/
 * 5. Clean up temp install
 */
export async function installPlugin(name: string): Promise<InstalledPlugin> {
  const pluginDir = getPluginDir();
  await mkdir(pluginDir, { recursive: true });

  // Use a temp staging directory for npm install
  const stagingDir = join(homedir(), ".cocapn", ".staging", name);
  await mkdir(stagingDir, { recursive: true });

  try {
    // npm install into staging
    console.log(`Installing ${name} from npm...`);
    await execAsync(`npm install --prefix "${stagingDir}" "${name}"`, {
      timeout: 60000,
    });

    // Read manifest
    const manifestPath = join(stagingDir, "node_modules", name, "cocapn-plugin.json");
    const manifest = await validateManifest(manifestPath);

    const pkgJsonPath = join(stagingDir, "node_modules", name, "package.json");
    let pkgJson: Record<string, unknown> = {};
    if (existsSync(pkgJsonPath)) {
      const raw = await readFile(pkgJsonPath, "utf-8");
      pkgJson = JSON.parse(raw) as Record<string, unknown>;
    }

    const version = String(manifest["version"] || pkgJson["version"] || "unknown");
    const description = String(manifest["description"] || pkgJson["description"] || "");
    const author = String(manifest["author"] || pkgJson["author"] || "");
    const skills = (manifest["skills"] as Array<{ name: string }>).map((s) => s.name);
    const permissions = (manifest["permissions"] as string[]);

    // Copy to plugin dir
    const targetDir = join(pluginDir, name);
    if (existsSync(targetDir)) {
      await rm(targetDir, { recursive: true, force: true });
    }
    await cp(join(stagingDir, "node_modules", name), targetDir, { recursive: true });

    return {
      name: String(manifest["name"]),
      version,
      path: targetDir,
      description,
      author,
      skills,
      permissions,
    };
  } finally {
    // Clean up staging
    await rm(stagingDir, { recursive: true, force: true });
    // Also clean parent staging dir if empty
    try {
      await rm(join(homedir(), ".cocapn", ".staging"), { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

/**
 * Uninstall a plugin by removing its directory.
 */
export async function uninstallPlugin(name: string): Promise<void> {
  const targetDir = join(getPluginDir(), name);

  if (!existsSync(targetDir)) {
    throw new Error(`Plugin not installed: ${name}`);
  }

  await rm(targetDir, { recursive: true, force: true });
}

/**
 * List all installed plugins by scanning ~/.cocapn/plugins/.
 */
export async function listPlugins(): Promise<InstalledPlugin[]> {
  const pluginDir = getPluginDir();

  if (!existsSync(pluginDir)) {
    return [];
  }

  const entries = await readdir(pluginDir, { withFileTypes: true });
  const plugins: InstalledPlugin[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const manifestPath = join(pluginDir, entry.name, "cocapn-plugin.json");
    if (!existsSync(manifestPath)) continue;

    try {
      const manifest = await validateManifest(manifestPath);

      const skills = (manifest["skills"] as Array<{ name: string }>).map((s) => s.name);
      const permissions = (manifest["permissions"] as string[]);

      plugins.push({
        name: String(manifest["name"]),
        version: String(manifest["version"]),
        path: join(pluginDir, entry.name),
        description: String(manifest["description"] || ""),
        author: String(manifest["author"] || ""),
        skills,
        permissions,
      });
    } catch {
      // Skip invalid manifests
    }
  }

  return plugins;
}

/**
 * Get details about an installed plugin.
 */
export async function getInstalledPlugin(name: string): Promise<InstalledPlugin | null> {
  const plugins = await listPlugins();
  return plugins.find((p) => p.name === name) ?? null;
}
