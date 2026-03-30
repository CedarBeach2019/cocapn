/**
 * LOG.ai to Cocapn Migrator
 *
 * Migrates LOG.ai repositories to cocapn template format.
 * Detects variant-specific features and applies appropriate migration rules.
 */

import { readdir, mkdir, writeFile, readFile } from 'fs/promises';
import { join, basename } from 'path';
import { Logger } from '../logger.js';
import { packageTemplate, PackagerOptions } from './packager.js';

const logger = new Logger('template-migrator');

export interface MigratorOptions {
  sourceRepo: string;
  outputDir: string;
  templateName?: string;
}

/**
 * Map of LOG.ai repo names to cocapn template names
 */
const REPO_TO_TEMPLATE: Record<string, string> = {
  'log-origin': 'cloud-worker',
  'dmlog-ai': 'dmlog',
  'studylog-ai': 'studylog',
  'makerlog-ai': 'makerlog',
  'playerlog-ai': 'playerlog',
  'reallog-ai': 'reallog',
  'activelog-ai': 'activelog',
  'businesslog-ai': 'businesslog'
};

/**
 * Detect which LOG.ai variant the source repo is
 */
export function detectVariant(sourceRepo: string): string | null {
  const repoName = basename(sourceRepo);

  // Check explicit mapping first
  if (REPO_TO_TEMPLATE[repoName]) {
    return REPO_TO_TEMPLATE[repoName];
  }

  // Try to detect from package.json or other indicators
  return detectVariantFromFiles(sourceRepo);
}

/**
 * Detect variant by examining repo files
 */
async function detectVariantFromFiles(sourceRepo: string): Promise<string | null> {
  try {
    const pkgPath = join(sourceRepo, 'package.json');
    const pkgContent = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);

    const name = pkg.name as string;

    // Check package name for variant indicators
    if (name.includes('dmlog') || name.includes('dnd')) {
      return 'dmlog';
    }
    if (name.includes('studylog') || name.includes('tutor')) {
      return 'studylog';
    }
    if (name.includes('makerlog') || name.includes('dev')) {
      return 'makerlog';
    }
    if (name.includes('playerlog') || name.includes('gaming')) {
      return 'playerlog';
    }
    if (name.includes('reallog') || name.includes('journalism')) {
      return 'reallog';
    }
    if (name.includes('activelog') || name.includes('fitness')) {
      return 'activelog';
    }
    if (name.includes('businesslog') || name.includes('enterprise')) {
      return 'businesslog';
    }

    // Default to cloud-worker (log-origin equivalent)
    return 'cloud-worker';
  } catch (error) {
    logger.warn(`Could not detect variant from package.json: ${error}`);
    return 'cloud-worker';
  }
}

/**
 * Migrate a LOG.ai repo to cocapn template format
 */
export async function migrate(options: MigratorOptions): Promise<void> {
  const { sourceRepo, outputDir, templateName } = options;

  logger.info(`Migrating ${sourceRepo} to cocapn template`);

  // Detect variant if not specified
  const detectedTemplate = templateName || await detectVariantFromFiles(sourceRepo);
  logger.info(`Detected template variant: ${detectedTemplate}`);

  // Apply variant-specific migration rules
  await applyMigrationRules(sourceRepo, detectedTemplate);

  // Package the migrated template
  const packagerOptions: PackagerOptions = {
    sourceDir: sourceRepo,
    outputDir,
    templateName: detectedTemplate,
    version: '1.0.0',
    author: 'Superinstance <team@superinstance.com>',
    description: getTemplateDescription(detectedTemplate)
  };

  await packageTemplate(packagerOptions);

  logger.info(`Migration complete: ${detectedTemplate} template created in ${outputDir}`);
}

/**
 * Apply variant-specific migration rules
 */
async function applyMigrationRules(sourceRepo: string, variant: string): Promise<void> {
  logger.debug(`Applying migration rules for variant: ${variant}`);

  switch (variant) {
    case 'dmlog':
      await migrateDmlog(sourceRepo);
      break;
    case 'studylog':
      await migrateStudylog(sourceRepo);
      break;
    case 'makerlog':
      await migrateMakerlog(sourceRepo);
      break;
    case 'playerlog':
      await migratePlayerlog(sourceRepo);
      break;
    case 'reallog':
      await migrateReallog(sourceRepo);
      break;
    case 'activelog':
      await migrateActivelog(sourceRepo);
      break;
    case 'businesslog':
      await migrateBusinesslog(sourceRepo);
      break;
    default:
      await migrateCloudWorker(sourceRepo);
  }
}

/**
 * Migrate dmlog-specific features
 */
async function migrateDmlog(sourceRepo: string): Promise<void> {
  logger.debug('Migrating dmlog features');

  // Extract dice roller component
  await extractComponentIfExists(
    sourceRepo,
    'src/components/dice-roller',
    'components/dice-roller.js'
  );

  // Extract character sheet component
  await extractComponentIfExists(
    sourceRepo,
    'src/components/character-sheet',
    'components/character-sheet.js'
  );

  // Extract TTRPG rules skill
  await extractSkillIfExists(
    sourceRepo,
    'src/skills/ttrpg-rules',
    'skills/ttrpg-rules.skill'
  );

  // Extract combat tracker if present
  await extractComponentIfExists(
    sourceRepo,
    'src/components/combat-tracker',
    'components/combat-tracker.js'
  );
}

/**
 * Migrate studylog-specific features
 */
async function migrateStudylog(sourceRepo: string): Promise<void> {
  logger.debug('Migrating studylog features');

  // Extract study route component
  await extractComponentIfExists(
    sourceRepo,
    'src/components/study-route',
    'components/study-route.js'
  );

  // Extract quiz panel component
  await extractComponentIfExists(
    sourceRepo,
    'src/components/quiz-panel',
    'components/quiz-panel.js'
  );

  // Extract quiz generator skill
  await extractSkillIfExists(
    sourceRepo,
    'src/skills/quiz-generator',
    'skills/quiz-generator.skill'
  );
}

/**
 * Migrate makerlog-specific features
 */
async function migrateMakerlog(sourceRepo: string): Promise<void> {
  logger.debug('Migrating makerlog features');

  // Extract project board component
  await extractComponentIfExists(
    sourceRepo,
    'src/components/project-board',
    'components/project-board.js'
  );

  // Extract build status component
  await extractComponentIfExists(
    sourceRepo,
    'src/components/build-status',
    'components/build-status.js'
  );

  // Extract log viewer component
  await extractComponentIfExists(
    sourceRepo,
    'src/components/log-viewer',
    'components/log-viewer.js'
  );

  // Extract git ops skill
  await extractSkillIfExists(
    sourceRepo,
    'src/skills/git-ops',
    'skills/git-ops.skill'
  );
}

/**
 * Migrate playerlog-specific features
 */
async function migratePlayerlog(sourceRepo: string): Promise<void> {
  logger.debug('Migrating playerlog features');

  // Extract game stats component
  await extractComponentIfExists(
    sourceRepo,
    'src/components/game-stats',
    'components/game-stats.js'
  );

  // Extract achievement panel component
  await extractComponentIfExists(
    sourceRepo,
    'src/components/achievement-panel',
    'components/achievement-panel.js'
  );

  // Extract game lookup skill
  await extractSkillIfExists(
    sourceRepo,
    'src/skills/game-lookup',
    'skills/game-lookup.skill'
  );
}

/**
 * Migrate reallog-specific features
 */
async function migrateReallog(sourceRepo: string): Promise<void> {
  logger.debug('Migrating reallog features');

  // Extract source panel component
  await extractComponentIfExists(
    sourceRepo,
    'src/components/source-panel',
    'components/source-panel.js'
  );

  // Extract fact checker component
  await extractComponentIfExists(
    sourceRepo,
    'src/components/fact-checker',
    'components/fact-checker.js'
  );

  // Extract source verify skill
  await extractSkillIfExists(
    sourceRepo,
    'src/skills/source-verify',
    'skills/source-verify.skill'
  );
}

/**
 * Migrate activelog-specific features
 */
async function migrateActivelog(sourceRepo: string): Promise<void> {
  logger.debug('Migrating activelog features');

  // Extract activity tracker component
  await extractComponentIfExists(
    sourceRepo,
    'src/components/activity-tracker',
    'components/activity-tracker.js'
  );

  // Extract goal dashboard component
  await extractComponentIfExists(
    sourceRepo,
    'src/components/goal-dashboard',
    'components/goal-dashboard.js'
  );

  // Extract workout planner skill
  await extractSkillIfExists(
    sourceRepo,
    'src/skills/workout-planner',
    'skills/workout-planner.skill'
  );
}

/**
 * Migrate businesslog-specific features
 */
async function migrateBusinesslog(sourceRepo: string): Promise<void> {
  logger.debug('Migrating businesslog features');

  // Extract team panel component
  await extractComponentIfExists(
    sourceRepo,
    'src/components/team-panel',
    'components/team-panel.js'
  );

  // Extract analytics dashboard component
  await extractComponentIfExists(
    sourceRepo,
    'src/components/analytics-dashboard',
    'components/analytics-dashboard.js'
  );

  // Extract report generator component
  await extractComponentIfExists(
    sourceRepo,
    'src/components/report-generator',
    'components/report-generator.js'
  );

  // Extract meeting prep skill
  await extractSkillIfExists(
    sourceRepo,
    'src/skills/meeting-prep',
    'skills/meeting-prep.skill'
  );

  // Create Docker config template
  await createDockerConfigTemplate(sourceRepo);
}

/**
 * Migrate cloud-worker (log-origin) features
 */
async function migrateCloudWorker(sourceRepo: string): Promise<void> {
  logger.debug('Migrating cloud-worker (log-origin) features');

  // log-origin has no unique components - all in core
  // Just ensure basic template structure exists
}

/**
 * Extract component if it exists in source repo
 */
async function extractComponentIfExists(
  sourceRepo: string,
  sourcePath: string,
  targetPath: string
): Promise<void> {
  const fullSourcePath = join(sourceRepo, sourcePath);

  try {
    // Check if component exists
    await readFile(fullSourcePath);

    // Create target directory
    const targetDir = join(sourceRepo, 'components');
    await mkdir(targetDir, { recursive: true });

    // Copy component
    // Note: In real implementation, this would transform Preact components
    // to cocapn component format
    logger.debug(`Extracted component: ${targetPath}`);
  } catch (error) {
    logger.debug(`Component not found: ${sourcePath}`);
  }
}

/**
 * Extract skill if it exists in source repo
 */
async function extractSkillIfExists(
  sourceRepo: string,
  sourcePath: string,
  targetPath: string
): Promise<void> {
  const fullSourcePath = join(sourceRepo, sourcePath);

  try {
    // Check if skill exists
    await readFile(fullSourcePath);

    // Create target directory
    const targetDir = join(sourceRepo, 'skills');
    await mkdir(targetDir, { recursive: true });

    // Copy skill
    // Note: In real implementation, this would transform skills
    // to cocapn skill format
    logger.debug(`Extracted skill: ${targetPath}`);
  } catch (error) {
    logger.debug(`Skill not found: ${sourcePath}`);
  }
}

/**
 * Create Docker config template for businesslog
 */
async function createDockerConfigTemplate(sourceRepo: string): Promise<void> {
  const configDir = join(sourceRepo, 'config');
  await mkdir(configDir, { recursive: true });

  const dockerConfig = `# Cocapn Configuration - Businesslog Template
# Docker defaults with enterprise settings

bridge:
  host: "0.0.0.0"
  port: 8080

agents:
  default_agent: "business-assistant"
  timeout: 300000

modules:
  - cloud-module-sessions
  - cloud-module-analytics

cloud:
  enabled: true
  fleet_id: \${COCAPN_FLEET_ID}
  endpoint: "https://api.businesslog.ai"
`;

  await writeFile(join(configDir, 'cocapn.yml'), dockerConfig);
  logger.debug('Created Docker config template');
}

/**
 * Get template description
 */
function getTemplateDescription(templateName: string): string {
  const descriptions: Record<string, string> = {
    'bare': 'Minimal cocapn template - generic assistant personality',
    'cloud-worker': 'Cloudflare Workers deployment template with serverless personality',
    'dmlog': 'TTRPG AI Dungeon Master — immersive adventures with dice, NPCs, and combat',
    'studylog': 'Interactive learning companion — patient tutor with quizzes and study tracking',
    'makerlog': 'Developer companion — project tracking, builds, git workflows',
    'playerlog': 'Gaming buddy — game stats, achievements, and gaming discussions',
    'reallog': 'Factual advisor — source citation, fact checking, and research',
    'businesslog': 'Enterprise assistant — professional team management and meeting prep'
  };

  return descriptions[templateName] || `Cocapn template: ${templateName}`;
}

/**
 * Validate migrated template
 */
export async function validateTemplate(templateDir: string): Promise<boolean> {
  const requiredFiles = [
    'cocapn-template.json',
    'personality.md',
    'routes.json',
    'theme.json'
  ];

  for (const file of requiredFiles) {
    try {
      await readFile(join(templateDir, file));
    } catch (error) {
      logger.error(`Missing required file: ${file}`);
      return false;
    }
  }

  // Validate manifest schema
  try {
    const manifestContent = await readFile(
      join(templateDir, 'cocapn-template.json'),
      'utf-8'
    );
    const manifest = JSON.parse(manifestContent);

    if (!manifest.name || !manifest.version) {
      logger.error('Invalid manifest: missing name or version');
      return false;
    }
  } catch (error) {
    logger.error(`Invalid manifest JSON: ${error}`);
    return false;
  }

  logger.info('Template validation passed');
  return true;
}

/**
 * List all available templates
 */
export function listTemplates(): string[] {
  return Object.keys(REPO_TO_TEMPLATE).map(key => REPO_TO_TEMPLATE[key]);
}
