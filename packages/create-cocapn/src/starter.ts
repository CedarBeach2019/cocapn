/**
 * Starter template generator for cocapn-starter repos.
 *
 * Exports functions that produce all files for the private (brain) and
 * public (face) starter repos.  Template files live in templates/ and
 * are referenced here — the functions return TemplateFile arrays that
 * can be written to disk by the caller.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StarterConfig {
  name: string;
  domain: string;
}

export interface TemplateFile {
  path: string;
  content: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEMPLATES_DIR = join(import.meta.dirname, "..", "templates");

function replacePlaceholders(content: string, config: StarterConfig): string {
  return content
    .replace(/\{\{name\}\}/g, config.name)
    .replace(/\{\{domain\}\}/g, config.domain);
}

/**
 * Recursively read all files under `dir`, returning them as TemplateFile[]
 * with paths relative to `baseDir`.
 */
function readTemplateDir(baseDir: string, dir: string): TemplateFile[] {
  const files: TemplateFile[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readTemplateDir(baseDir, fullPath));
    } else {
      const relPath = relative(baseDir, fullPath);
      files.push({
        path: relPath,
        content: readFileSync(fullPath, "utf8"),
      });
    }
  }

  return files;
}

// ─── Private repo template ────────────────────────────────────────────────────

/**
 * Return all files for the private (brain) starter repo.
 * Placeholders like {{name}} and {{domain}} are replaced with config values.
 */
export function getPrivateRepoTemplate(config: StarterConfig): TemplateFile[] {
  const privateDir = join(TEMPLATES_DIR, "private-repo");
  const files = readTemplateDir(privateDir, privateDir);

  return files.map((f) => ({
    path: f.path,
    content: replacePlaceholders(f.content, config),
  }));
}

// ─── Public repo template ─────────────────────────────────────────────────────

/**
 * Return all files for the public (face) starter repo.
 * @param name - Agent name (e.g. "alice")
 * @param domain - Agent domain (e.g. "makerlog")
 */
export function getPublicRepoTemplate(
  name: string,
  domain: string,
): TemplateFile[] {
  const config: StarterConfig = { name, domain };
  const publicDir = join(TEMPLATES_DIR, "public-repo");
  const files = readTemplateDir(publicDir, publicDir);

  return files.map((f) => ({
    path: f.path,
    content: replacePlaceholders(f.content, config),
  }));
}

// ─── Combined generator ──────────────────────────────────────────────────────

/**
 * Generate all starter files for both repos.
 * Returns { private: TemplateFile[], public: TemplateFile[] }.
 */
export function generateStarterFiles(
  config: StarterConfig,
): { private: TemplateFile[]; public: TemplateFile[] } {
  return {
    private: getPrivateRepoTemplate(config),
    public: getPublicRepoTemplate(config.name, config.domain),
  };
}
