/**
 * Template System Tests
 *
 * Tests for template packaging, migration, and validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { packageTemplate, TemplateManifest } from '../src/templates/packager.js';
import { migrate, detectVariant, validateTemplate, listTemplates } from '../src/templates/migrator.js';
import { Logger } from '../src/logger.js';

const logger = new Logger('template-tests');

describe('Template Packager', () => {
  const testSourceDir = '/tmp/test-source-template';
  const testOutputDir = '/tmp/test-output-templates';

  beforeEach(async () => {
    // Create test source directory
    await mkdir(testSourceDir, { recursive: true });
    await mkdir(testOutputDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directories
    try {
      await rm(testSourceDir, { recursive: true, force: true });
      await rm(testOutputDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should package a minimal template', async () => {
    // Create a minimal template source
    await writeFile(join(testSourceDir, 'personality.md'), '# Test Personality\nYou are helpful.');
    await writeFile(join(testSourceDir, 'routes.json'), JSON.stringify({ version: '1.0.0', rules: [] }));
    await writeFile(join(testSourceDir, 'theme.json'), JSON.stringify({ primaryColor: '#3b82f6' }));

    await packageTemplate({
      sourceDir: testSourceDir,
      outputDir: testOutputDir,
      templateName: 'test-minimal',
      version: '1.0.0',
      description: 'Test minimal template'
    });

    // Verify output files exist
    const manifestPath = join(testOutputDir, 'test-minimal', 'cocapn-template.json');
    const manifestContent = await readFile(manifestPath, 'utf-8');
    const manifest: TemplateManifest = JSON.parse(manifestContent);

    expect(manifest.name).toBe('test-minimal');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.personality).toBe('personality.md');
    expect(manifest.routes).toBe('routes.json');
    expect(manifest.theme).toBe('theme.json');
  });

  it('should generate default files when missing', async () => {
    // Empty source directory
    await packageTemplate({
      sourceDir: testSourceDir,
      outputDir: testOutputDir,
      templateName: 'test-defaults',
      version: '1.0.0',
      description: 'Test defaults template'
    });

    // Verify default files were created
    const personalityPath = join(testSourceDir, 'personality.md');
    const routesPath = join(testSourceDir, 'routes.json');
    const themePath = join(testSourceDir, 'theme.json');

    expect(await readFile(personalityPath, 'utf-8')).toContain('Personality');
    expect(await readFile(routesPath, 'utf-8')).toContain('rules');
    expect(await readFile(themePath, 'utf-8')).toContain('colors');
  });

  it('should extract components from source directory', async () => {
    // Create components directory with test component
    const componentsDir = join(testSourceDir, 'components');
    await mkdir(componentsDir, { recursive: true });
    await writeFile(join(componentsDir, 'test-component.js'), '// Test component');

    await packageTemplate({
      sourceDir: testSourceDir,
      outputDir: testOutputDir,
      templateName: 'test-components',
      version: '1.0.0',
      description: 'Test components template'
    });

    const manifestPath = join(testOutputDir, 'test-components', 'cocapn-template.json');
    const manifest: TemplateManifest = JSON.parse(await readFile(manifestPath, 'utf-8'));

    expect(manifest.components).toContain('components/test-component.js');
  });

  it('should extract skills from source directory', async () => {
    // Create skills directory with test skill
    const skillsDir = join(testSourceDir, 'skills');
    await mkdir(skillsDir, { recursive: true });
    await writeFile(join(skillsDir, 'test-skill.skill'), '# Test skill');

    await packageTemplate({
      sourceDir: testSourceDir,
      outputDir: testOutputDir,
      templateName: 'test-skills',
      version: '1.0.0',
      description: 'Test skills template'
    });

    const manifestPath = join(testOutputDir, 'test-skills', 'cocapn-template.json');
    const manifest: TemplateManifest = JSON.parse(await readFile(manifestPath, 'utf-8'));

    expect(manifest.skills).toContain('skills/test-skill.skill');
  });
});

describe('Template Migrator', () => {
  const testRepoDir = '/tmp/test-log-ai-repo';
  const testOutputDir = '/tmp/test-migrated-templates';

  beforeEach(async () => {
    await mkdir(testRepoDir, { recursive: true });
    await mkdir(testOutputDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testRepoDir, { recursive: true, force: true });
      await rm(testOutputDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should detect dmlog variant from package.json', async () => {
    // Create a dmlog-style package.json
    const pkgJson = {
      name: 'dmlog-ai',
      version: '1.0.0'
    };
    await writeFile(join(testRepoDir, 'package.json'), JSON.stringify(pkgJson));

    const detected = await detectVariant(testRepoDir);
    expect(detected).toBe('dmlog');
  });

  it('should detect studylog variant from package.json', async () => {
    // Create a studylog-style package.json
    const pkgJson = {
      name: 'studylog-ai',
      version: '1.0.0'
    };
    await writeFile(join(testRepoDir, 'package.json'), JSON.stringify(pkgJson));

    const detected = await detectVariant(testRepoDir);
    expect(detected).toBe('studylog');
  });

  it('should migrate dmlog repo to template', async () => {
    // Create dmlog-style package.json
    const pkgJson = {
      name: 'dmlog-ai',
      version: '1.0.0'
    };
    await writeFile(join(testRepoDir, 'package.json'), JSON.stringify(pkgJson));

    await migrate({
      sourceRepo: testRepoDir,
      outputDir: testOutputDir
    });

    // Verify template was created
    const manifestPath = join(testOutputDir, 'dmlog', 'cocapn-template.json');
    const manifestContent = await readFile(manifestPath, 'utf-8');
    const manifest: TemplateManifest = JSON.parse(manifestContent);

    expect(manifest.name).toBe('dmlog');
    expect(manifest.personality).toBe('personality.md');
    expect(manifest.routes).toBe('routes.json');
    expect(manifest.theme).toBe('theme.json');
  });

  it('should list all available templates', () => {
    const templates = listTemplates();
    expect(templates).toContain('dmlog');
    expect(templates).toContain('studylog');
    expect(templates).toContain('makerlog');
    expect(templates).toContain('playerlog');
    expect(templates).toContain('reallog');
    expect(templates).toContain('businesslog');
    expect(templates).toContain('activelog');
    expect(templates).toContain('cloud-worker');
  });
});

describe('Template Validator', () => {
  const testTemplateDir = '/tmp/test-valid-template';

  beforeEach(async () => {
    await mkdir(testTemplateDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(testTemplateDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should validate a complete template', async () => {
    // Create complete template files
    const manifest = {
      name: 'test-valid',
      version: '1.0.0',
      description: 'Test valid template',
      author: 'Test Author',
      license: 'MIT',
      keywords: ['test'],
      personality: 'personality.md',
      routes: 'routes.json',
      theme: 'theme.json',
      skills: [],
      components: [],
      dependencies: { cocapn: '>=0.1.0' }
    };

    await writeFile(join(testTemplateDir, 'cocapn-template.json'), JSON.stringify(manifest));
    await writeFile(join(testTemplateDir, 'personality.md'), '# Test');
    await writeFile(join(testTemplateDir, 'routes.json'), JSON.stringify({ version: '1.0.0', rules: [] }));
    await writeFile(join(testTemplateDir, 'theme.json'), JSON.stringify({ primaryColor: '#3b82f6' }));

    const isValid = await validateTemplate(testTemplateDir);
    expect(isValid).toBe(true);
  });

  it('should reject template with missing files', async () => {
    // Create incomplete template (missing personality.md)
    const manifest = {
      name: 'test-invalid',
      version: '1.0.0',
      description: 'Test invalid template',
      author: 'Test Author',
      license: 'MIT',
      keywords: ['test'],
      personality: 'personality.md',
      routes: 'routes.json',
      theme: 'theme.json',
      skills: [],
      components: [],
      dependencies: { cocapn: '>=0.1.0' }
    };

    await writeFile(join(testTemplateDir, 'cocapn-template.json'), JSON.stringify(manifest));
    await writeFile(join(testTemplateDir, 'routes.json'), JSON.stringify({ version: '1.0.0', rules: [] }));
    await writeFile(join(testTemplateDir, 'theme.json'), JSON.stringify({ primaryColor: '#3b82f6' }));

    const isValid = await validateTemplate(testTemplateDir);
    expect(isValid).toBe(false);
  });

  it('should reject template with invalid manifest', async () => {
    // Create template with invalid manifest (missing name)
    const manifest = {
      version: '1.0.0',
      description: 'Test invalid manifest',
      author: 'Test Author',
      license: 'MIT',
      keywords: ['test'],
      personality: 'personality.md',
      routes: 'routes.json',
      theme: 'theme.json',
      skills: [],
      components: [],
      dependencies: { cocapn: '>=0.1.0' }
    };

    await writeFile(join(testTemplateDir, 'cocapn-template.json'), JSON.stringify(manifest));
    await writeFile(join(testTemplateDir, 'personality.md'), '# Test');
    await writeFile(join(testTemplateDir, 'routes.json'), JSON.stringify({ version: '1.0.0', rules: [] }));
    await writeFile(join(testTemplateDir, 'theme.json'), JSON.stringify({ primaryColor: '#3b82f6' }));

    const isValid = await validateTemplate(testTemplateDir);
    expect(isValid).toBe(false);
  });
});

describe('Built-in Templates', () => {
  const templatesDir = '/tmp/cocapn/packages/templates';

  it('should have bare template', async () => {
    const manifestPath = join(templatesDir, 'bare', 'cocapn-template.json');
    const manifest: TemplateManifest = JSON.parse(await readFile(manifestPath, 'utf-8'));

    expect(manifest.name).toBe('bare');
    expect(manifest.keywords).toContain('minimal');
  });

  it('should have cloud-worker template', async () => {
    const manifestPath = join(templatesDir, 'cloud-worker', 'cocapn-template.json');
    const manifest: TemplateManifest = JSON.parse(await readFile(manifestPath, 'utf-8'));

    expect(manifest.name).toBe('cloud-worker');
    expect(manifest.keywords).toContain('cloudflare');
  });

  it('should have dmlog template', async () => {
    const manifestPath = join(templatesDir, 'dmlog', 'cocapn-template.json');
    const manifest: TemplateManifest = JSON.parse(await readFile(manifestPath, 'utf-8'));

    expect(manifest.name).toBe('dmlog');
    expect(manifest.keywords).toContain('ttrpg');
  });

  it('should have studylog template', async () => {
    const manifestPath = join(templatesDir, 'studylog', 'cocapn-template.json');
    const manifest: TemplateManifest = JSON.parse(await readFile(manifestPath, 'utf-8'));

    expect(manifest.name).toBe('studylog');
    expect(manifest.keywords).toContain('education');
  });

  it('should have makerlog template', async () => {
    const manifestPath = join(templatesDir, 'makerlog', 'cocapn-template.json');
    const manifest: TemplateManifest = JSON.parse(await readFile(manifestPath, 'utf-8'));

    expect(manifest.name).toBe('makerlog');
    expect(manifest.keywords).toContain('development');
  });

  it('should have businesslog template', async () => {
    const manifestPath = join(templatesDir, 'businesslog', 'cocapn-template.json');
    const manifest: TemplateManifest = JSON.parse(await readFile(manifestPath, 'utf-8'));

    expect(manifest.name).toBe('businesslog');
    expect(manifest.keywords).toContain('enterprise');
  });

  it('should have playerlog template (converted from web-app)', async () => {
    const manifestPath = join(templatesDir, 'web-app', 'cocapn-template.json');
    const manifest: TemplateManifest = JSON.parse(await readFile(manifestPath, 'utf-8'));

    expect(manifest.name).toBe('playerlog');
    expect(manifest.keywords).toContain('gaming');
  });

  it('should validate all built-in templates', async () => {
    const templateNames = ['bare', 'cloud-worker', 'dmlog', 'studylog', 'makerlog', 'businesslog', 'web-app'];

    for (const templateName of templateNames) {
      const templateDir = join(templatesDir, templateName);
      const isValid = await validateTemplate(templateDir);
      expect(isValid).toBe(true);
    }
  });
});
