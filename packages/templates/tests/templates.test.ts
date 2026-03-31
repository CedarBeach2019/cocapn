import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getTemplate,
  listTemplates,
  getTemplateByCategory,
  searchTemplates,
  TEMPLATES,
} from '../src/templates/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '..', 'src', 'templates');

const EXPECTED_SLUGS = [
  'researcher',
  'personal-assistant',
  'content-creator',
  'customer-support',
  'fitness-coach',
  'home-automation',
  'language-tutor',
  'project-manager',
  'chef-recipe',
  'writer-novelist',
];

const REQUIRED_FILES = ['soul.md', 'config.yml', 'README.md', 'theme.css'];

function parseYamlFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length > 0) {
      frontmatter[key.trim()] = rest.join(':').trim();
    }
  }
  return frontmatter;
}

describe('template directory structure', () => {
  for (const slug of EXPECTED_SLUGS) {
    describe(slug, () => {
      it('has all required files', () => {
        for (const file of REQUIRED_FILES) {
          const filepath = join(TEMPLATES_DIR, slug, file);
          expect(existsSync(filepath), `Missing ${file} in ${slug}`).toBe(true);
        }
      });

      it('has plugins directory', () => {
        const pluginsDir = join(TEMPLATES_DIR, slug, 'plugins');
        expect(existsSync(pluginsDir), `Missing plugins/ in ${slug}`).toBe(true);
      });
    });
  }
});

describe('soul.md frontmatter', () => {
  for (const slug of EXPECTED_SLUGS) {
    describe(slug, () => {
      it('has valid YAML frontmatter with required fields', () => {
        const soulPath = join(TEMPLATES_DIR, slug, 'soul.md');
        const content = readFileSync(soulPath, 'utf-8');
        const frontmatter = parseYamlFrontmatter(content);

        expect(frontmatter.name, `${slug} soul.md missing name`).toBeDefined();
        expect(frontmatter.version, `${slug} soul.md missing version`).toBeDefined();
        expect(frontmatter.tone, `${slug} soul.md missing tone`).toBeDefined();
        expect(frontmatter.model, `${slug} soul.md missing model`).toBeDefined();
      });

      it('has Identity section', () => {
        const soulPath = join(TEMPLATES_DIR, slug, 'soul.md');
        const content = readFileSync(soulPath, 'utf-8');
        expect(content).toContain('# Identity');
      });

      it('has Personality section', () => {
        const soulPath = join(TEMPLATES_DIR, slug, 'soul.md');
        const content = readFileSync(soulPath, 'utf-8');
        expect(content).toContain('## Personality');
      });

      it('has What You Do section', () => {
        const soulPath = join(TEMPLATES_DIR, slug, 'soul.md');
        const content = readFileSync(soulPath, 'utf-8');
        expect(content).toContain('## What You Do');
      });

      it('has What You Don\'t Do section', () => {
        const soulPath = join(TEMPLATES_DIR, slug, 'soul.md');
        const content = readFileSync(soulPath, 'utf-8');
        expect(content).toContain("## What You Don't Do");
      });

      it('has Memory Priorities section', () => {
        const soulPath = join(TEMPLATES_DIR, slug, 'soul.md');
        const content = readFileSync(soulPath, 'utf-8');
        expect(content).toContain('## Memory Priorities');
      });

      it('has Public Face section', () => {
        const soulPath = join(TEMPLATES_DIR, slug, 'soul.md');
        const content = readFileSync(soulPath, 'utf-8');
        expect(content).toContain('## Public Face');
      });
    });
  }
});

describe('config.yml validation', () => {
  for (const slug of EXPECTED_SLUGS) {
    describe(slug, () => {
      it('has config section with mode', () => {
        const configPath = join(TEMPLATES_DIR, slug, 'config.yml');
        const content = readFileSync(configPath, 'utf-8');
        expect(content).toContain('config:');
        expect(content).toMatch(/mode:\s*(local|hybrid|cloud)/);
      });

      it('has llm configuration', () => {
        const configPath = join(TEMPLATES_DIR, slug, 'config.yml');
        const content = readFileSync(configPath, 'utf-8');
        expect(content).toContain('llm:');
        expect(content).toContain('provider:');
        expect(content).toContain('model:');
      });

      it('has features section', () => {
        const configPath = join(TEMPLATES_DIR, slug, 'config.yml');
        const content = readFileSync(configPath, 'utf-8');
        expect(content).toContain('features:');
      });

      it('has valid LLM temperature', () => {
        const configPath = join(TEMPLATES_DIR, slug, 'config.yml');
        const content = readFileSync(configPath, 'utf-8');
        const tempMatch = content.match(/temperature:\s*([\d.]+)/);
        expect(tempMatch, `${slug} missing temperature`).not.toBeNull();
        const temp = parseFloat(tempMatch![1]);
        expect(temp).toBeGreaterThanOrEqual(0);
        expect(temp).toBeLessThanOrEqual(1);
      });
    });
  }
});

describe('theme.css validation', () => {
  for (const slug of EXPECTED_SLUGS) {
    describe(slug, () => {
      it('has CSS custom properties', () => {
        const themePath = join(TEMPLATES_DIR, slug, 'theme.css');
        const content = readFileSync(themePath, 'utf-8');
        expect(content).toContain(':root');
        expect(content).toContain('--color-primary');
        expect(content).toContain('--color-secondary');
        expect(content).toContain('--color-accent');
        expect(content).toContain('--color-background');
        expect(content).toContain('--color-surface');
        expect(content).toContain('--color-text');
      });

      it('has valid color format', () => {
        const themePath = join(TEMPLATES_DIR, slug, 'theme.css');
        const content = readFileSync(themePath, 'utf-8');
        const colorMatches = content.match(/--color-\w+:\s*(#[0-9a-fA-F]{3,8})/g);
        expect(colorMatches, `${slug} has no valid colors`).not.toBeNull();
        expect(colorMatches!.length).toBeGreaterThanOrEqual(5);
      });
    });
  }
});

describe('template registry (index.ts)', () => {
  it('exports all 10 templates', () => {
    const templates = listTemplates();
    expect(templates).toHaveLength(10);
  });

  it('all expected slugs are present', () => {
    const templates = listTemplates();
    const slugs = templates.map((t) => t.slug);
    for (const slug of EXPECTED_SLUGS) {
      expect(slugs).toContain(slug);
    }
  });

  it('each template has required metadata fields', () => {
    for (const meta of TEMPLATES) {
      expect(meta.slug).toBeDefined();
      expect(meta.name).toBeDefined();
      expect(meta.description).toBeDefined();
      expect(meta.category).toBeDefined();
      expect(meta.tags).toBeInstanceOf(Array);
      expect(meta.tags.length).toBeGreaterThan(0);
      expect(meta.icon).toBeDefined();
    }
  });

  it('getTemplate returns full template for valid slug', () => {
    const template = getTemplate('researcher');
    expect(template).toBeDefined();
    expect(template!.soul).toContain('Research Assistant');
    expect(template!.config).toContain('config:');
    expect(template!.readme).toContain('Research Assistant Template');
    expect(template!.theme).toContain(':root');
  });

  it('getTemplate returns undefined for invalid slug', () => {
    expect(getTemplate('nonexistent')).toBeUndefined();
  });

  it('getTemplateByCategory filters correctly', () => {
    const education = getTemplateByCategory('education');
    expect(education.length).toBeGreaterThanOrEqual(2);
    expect(education.map((t) => t.slug)).toContain('researcher');
    expect(education.map((t) => t.slug)).toContain('language-tutor');
  });

  it('searchTemplates finds by name', () => {
    const results = searchTemplates('fitness');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].slug).toBe('fitness-coach');
  });

  it('searchTemplates finds by tag', () => {
    const results = searchTemplates('agile');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].slug).toBe('project-manager');
  });
});

describe('README validation', () => {
  for (const slug of EXPECTED_SLUGS) {
    describe(slug, () => {
      it('has What It Does section', () => {
        const readmePath = join(TEMPLATES_DIR, slug, 'README.md');
        const content = readFileSync(readmePath, 'utf-8');
        expect(content).toContain('## What It Does');
      });

      it('has Quick Start section', () => {
        const readmePath = join(TEMPLATES_DIR, slug, 'README.md');
        const content = readFileSync(readmePath, 'utf-8');
        expect(content).toContain('## Quick Start');
      });

      it('has Use Cases section', () => {
        const readmePath = join(TEMPLATES_DIR, slug, 'README.md');
        const content = readFileSync(readmePath, 'utf-8');
        expect(content).toContain('## Use Cases');
      });
    });
  }
});
