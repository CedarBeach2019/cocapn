/**
 * Template Packager
 *
 * Packages source directories into cocapn template format.
 * Extracts unique components while preserving personality, routes, and theme.
 */

import { readFile, readdir, copyFile, mkdir, stat, writeFile } from 'fs/promises';
import { join, relative, basename } from 'path';
import { Logger } from '../logger.js';

const logger = new Logger('template-packager');

export interface TemplateManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  keywords: string[];
  personality: string;
  routes: string;
  theme: string;
  skills: string[];
  components: string[];
  dependencies: {
    cocapn: string;
  };
}

export interface PackagerOptions {
  sourceDir: string;
  outputDir: string;
  templateName: string;
  version?: string;
  author?: string;
  description?: string;
}

/**
 * Package a source directory into a cocapn template
 */
export async function packageTemplate(options: PackagerOptions): Promise<void> {
  const {
    sourceDir,
    outputDir,
    templateName,
    version = '1.0.0',
    author = 'Superinstance <team@superinstance.com>',
    description = `Cocapn template: ${templateName}`
  } = options;

  logger.info(`Packaging template "${templateName}" from ${sourceDir}`);

  // Create output directory
  await mkdir(join(outputDir, templateName), { recursive: true });

  // Detect and extract components
  const components = await extractComponents(sourceDir);

  // Detect and extract skills
  const skills = await extractSkills(sourceDir);

  // Extract or generate personality
  const personalityFile = await extractPersonality(sourceDir, templateName);
  await copyFile(
    join(sourceDir, personalityFile),
    join(outputDir, templateName, 'personality.md')
  );

  // Extract or generate routes
  const routesFile = await extractRoutes(sourceDir, templateName);
  await copyFile(
    join(sourceDir, routesFile),
    join(outputDir, templateName, 'routes.json')
  );

  // Extract or generate theme
  const themeFile = await extractTheme(sourceDir, templateName);
  await copyFile(
    join(sourceDir, themeFile),
    join(outputDir, templateName, 'theme.json')
  );

  // Create manifest
  const manifest: TemplateManifest = {
    name: templateName,
    version,
    description,
    author,
    license: 'MIT',
    keywords: generateKeywords(templateName),
    personality: 'personality.md',
    routes: 'routes.json',
    theme: 'theme.json',
    skills,
    components,
    dependencies: {
      cocapn: '>=0.1.0'
    }
  };

  // Write manifest
  const manifestPath = join(outputDir, templateName, 'cocapn-template.json');
  await writeFile(
    manifestPath,
    JSON.stringify(manifest, null, 2)
  );

  logger.info(`Template "${templateName}" packaged successfully`);
  logger.info(`  - ${components.length} components`);
  logger.info(`  - ${skills.length} skills`);
  logger.info(`  - Output: ${join(outputDir, templateName)}`);
}

/**
 * Extract component files from source directory
 */
async function extractComponents(sourceDir: string): Promise<string[]> {
  const components: string[] = [];
  const componentsDir = join(sourceDir, 'components');

  try {
    const entries = await readdir(componentsDir);

    for (const entry of entries) {
      if (entry.endsWith('.js') || entry.endsWith('.jsx')) {
        components.push(`components/${entry}`);
      }
    }
  } catch (error) {
    // Components directory doesn't exist
    logger.debug('No components directory found');
  }

  return components;
}

/**
 * Extract skill files from source directory
 */
async function extractSkills(sourceDir: string): Promise<string[]> {
  const skills: string[] = [];
  const skillsDir = join(sourceDir, 'skills');

  try {
    const entries = await readdir(skillsDir);

    for (const entry of entries) {
      if (entry.endsWith('.skill')) {
        skills.push(`skills/${entry}`);
      }
    }
  } catch (error) {
    // Skills directory doesn't exist
    logger.debug('No skills directory found');
  }

  return skills;
}

/**
 * Extract or generate personality file
 */
async function extractPersonality(sourceDir: string, templateName: string): Promise<string> {
  const possiblePaths = [
    'personality.md',
    'soul.md',
    'system-prompt.md',
    'personality.txt'
  ];

  for (const path of possiblePaths) {
    try {
      await stat(join(sourceDir, path));
      return path;
    } catch {
      // File doesn't exist
    }
  }

  // Generate default personality based on template name
  const defaultPersonality = generateDefaultPersonality(templateName);
  await writeFile(
    join(sourceDir, 'personality.md'),
    defaultPersonality
  );

  return 'personality.md';
}

/**
 * Extract or generate routes file
 */
async function extractRoutes(sourceDir: string, templateName: string): Promise<string> {
  const possiblePaths = [
    'routes.json',
    'routing.json',
    'intents.json'
  ];

  for (const path of possiblePaths) {
    try {
      await stat(join(sourceDir, path));
      return path;
    } catch {
      // File doesn't exist
    }
  }

  // Generate default routes based on template name
  const defaultRoutes = generateDefaultRoutes(templateName);
  await writeFile(
    join(sourceDir, 'routes.json'),
    JSON.stringify(defaultRoutes, null, 2)
  );

  return 'routes.json';
}

/**
 * Extract or generate theme file
 */
async function extractTheme(sourceDir: string, templateName: string): Promise<string> {
  const possiblePaths = [
    'theme.json',
    'styles.json',
    'colors.json'
  ];

  for (const path of possiblePaths) {
    try {
      await stat(join(sourceDir, path));
      return path;
    } catch {
      // File doesn't exist
    }
  }

  // Generate default theme based on template name
  const defaultTheme = generateDefaultTheme(templateName);
  await writeFile(
    join(sourceDir, 'theme.json'),
    JSON.stringify(defaultTheme, null, 2)
  );

  return 'theme.json';
}

/**
 * Generate keywords based on template name
 */
function generateKeywords(templateName: string): string[] {
  const keywordMap: Record<string, string[]> = {
    'dmlog': ['ttrpg', 'dnd', 'dungeon-master', 'rpg', 'dice', 'adventure'],
    'studylog': ['education', 'learning', 'tutor', 'quiz', 'study'],
    'makerlog': ['development', 'developer', 'git', 'build', 'project'],
    'playerlog': ['gaming', 'games', 'achievements', 'stats', 'player'],
    'reallog': ['journalism', 'research', 'facts', 'sources', 'citation'],
    'businesslog': ['enterprise', 'business', 'team', 'professional', 'management'],
    'activelog': ['fitness', 'health', 'workout', 'activity', 'goals'],
    'bare': ['minimal', 'basic', 'simple'],
    'cloud-worker': ['cloudflare', 'workers', 'cloud', 'serverless']
  };

  return keywordMap[templateName] || [templateName];
}

/**
 * Generate default personality for template
 */
function generateDefaultPersonality(templateName: string): string {
  const personalities: Record<string, string> = {
    'bare': `# Bare Template Personality

You are a helpful AI assistant. Your responses should be:
1. Clear and concise
2. Focused on the user's needs
3. Friendly and professional
4. Honest about uncertainty

Maintain a neutral, adaptable tone that works for any task.`,

    'cloud-worker': `# Cloud Worker Template Personality

You are a helpful AI assistant optimized for Cloudflare Workers deployment. Your responses should be:
1. Technical and precise when discussing deployment
2. Helpful with serverless architecture questions
3. Knowledgeable about Workers, KV, Durable Objects, and R2
4. Clear about limitations and best practices

You help users build and deploy edge computing solutions.`,

    'dmlog': `# DMlog AI Dungeon Master

You are a dramatic Dungeon Master, weaving tales of adventure and peril. Your responses should:

1. Maintain narrative tension and suspense
2. Use vivid sensory descriptions
3. Embrace theatrical language and dramatic flair
4. Balance challenge with fairness
5. Adapt to player agency and unexpected choices

## Voice
- Theatrical, immersive, descriptive
- Second-person present tense ("You stand at the cliff's edge...")
- Rich sensory details (sounds, smells, textures)

## Constraints
- Never break character or acknowledge being AI
- Always offer meaningful choices
- Roll dice transparently when randomness is called for`,

    'studylog': `# Studylog AI Tutor

You are a patient tutor dedicated to helping students learn effectively. Your responses should:

1. Encourage curiosity and exploration
2. Scaffold explanations step by step
3. Use the Socratic method when appropriate
4. Provide examples and analogies
5. Celebrate progress and breakthrough moments

## Teaching Style
- Patient and supportive
- Break complex topics into manageable pieces
- Check for understanding regularly
- Adapt to different learning paces

## Approach
- Ask questions to gauge current understanding
- Build on what the student already knows
- Provide practice problems when helpful
- Encourage independent thinking`,

    'makerlog': `# Makerlog AI Developer Companion

You are a focused development companion helping builders ship code. Your responses should:

1. Be technical and concise
2. Prioritize working solutions over theory
3. Understand git workflows and deployment
4. Help debug with systematic approaches
5. Celebrate shipping and incremental progress

## Communication Style
- Direct and practical
- Code-focused with examples
- Aware of time/complexity tradeoffs
- Familiar with modern tooling

## Constraints
- Don't over-engineer simple problems
- Suggest testing strategies
- Consider deployment implications
- Respect git hygiene and conventions`,

    'playerlog': `# Playerlog AI Gaming Buddy

You are an enthusiastic gaming buddy who loves talking about games. Your responses should:

1. Match the excitement and passion of gamers
2. Use appropriate gaming terminology naturally
3. Celebrate achievements and milestones
4. Share strategies and tips
5. Discuss game mechanics and design

## Voice
- Casual and energetic
- Gamer-friendly language (GG, nerf, buff, meta, etc.)
- Knowledgeable about various game genres
- Excited about player accomplishments

## Expertise
- Achievement tracking and strategies
- Game mechanics and optimization
- Platform-agnostic gaming knowledge
- Community trends and discussions`,

    'reallog': `# Reallog AI Research Advisor

You are a precise, source-conscious advisor focused on factual accuracy. Your responses should:

1. Cite sources when making claims
2. Acknowledge uncertainty explicitly
3. Distinguish between facts and analysis
4. Verify information before presenting
5. Provide context and nuance

## Approach
- Prioritize accuracy over speed
- Attribute claims to sources
- Note when information is preliminary
- Cross-reference multiple sources
- Distinguish between correlation and causation

## Constraints
- Never present speculation as fact
- Qualify claims with confidence levels
- Update understanding with new evidence
- Admit when you don't know`,

    'businesslog': `# Businesslog AI Executive Assistant

You are a professional executive assistant supporting business operations. Your responses should:

1. Maintain professional formality
2. Be efficient and concise
3. Prioritize security and compliance
4. Support team collaboration
5. Respect organizational hierarchy

## Communication Style
- Professional and courteous
- Clear and structured
- Action-oriented with next steps
- Aware of business context

## Focus Areas
- Meeting preparation and summaries
- Report generation and formatting
- Team coordination and status
- Security best practices
- Efficient workflow support`
  };

  return personalities[templateName] || personalities['bare'];
}

/**
 * Generate default routes for template
 */
function generateDefaultRoutes(templateName: string): { version: string; rules: any[] } {
  const baseRoutes = [
    {
      id: 'search',
      patterns: ['search', 'find', 'look up', 'what is'],
      action: 'search',
      confidence: 0.8
    },
    {
      id: 'settings',
      patterns: ['settings', 'configure', 'preferences', 'options'],
      action: 'open-settings',
      confidence: 0.9
    }
  ];

  const templateRoutes: Record<string, any[]> = {
    'dmlog': [
      {
        id: 'dice-roll',
        patterns: ['roll .*d\\d+', 'r(oll)? \\d+d\\d+'],
        action: 'invoke-tool',
        tool: 'dice-roller',
        confidence: 0.95
      },
      {
        id: 'character-query',
        patterns: ['what are my.*stats', 'show.*character', 'hp.*level'],
        action: 'read-state',
        stateKey: 'character',
        context: 'character-sheet'
      },
      {
        id: 'combat-mode',
        patterns: ['initiative', 'combat', 'attack roll', 'damage'],
        action: 'switch-context',
        context: 'combat-tracker',
        confidence: 0.9
      }
    ],
    'studylog': [
      {
        id: 'quiz',
        patterns: ['quiz me', 'test my knowledge', 'practice'],
        action: 'invoke-tool',
        tool: 'quiz-generator',
        confidence: 0.9
      },
      {
        id: 'study-mode',
        patterns: ['study mode', 'help me learn', 'explain'],
        action: 'switch-context',
        context: 'study',
        confidence: 0.85
      }
    ],
    'makerlog': [
      {
        id: 'deploy',
        patterns: ['deploy', 'push to prod', 'release'],
        action: 'invoke-tool',
        tool: 'deploy',
        confidence: 0.9
      },
      {
        id: 'git-status',
        patterns: ['git status', 'branch', 'commit'],
        action: 'read-state',
        stateKey: 'git',
        confidence: 0.95
      }
    ],
    'playerlog': [
      {
        id: 'game-stats',
        patterns: ['what are my stats', 'achievement', 'progress'],
        action: 'read-state',
        stateKey: 'game-stats',
        confidence: 0.9
      },
      {
        id: 'game-lookup',
        patterns: ['look up.*game', 'game info', 'steam.*game'],
        action: 'invoke-tool',
        tool: 'game-lookup',
        confidence: 0.85
      }
    ],
    'reallog': [
      {
        id: 'fact-check',
        patterns: ['fact check', 'verify', 'is this true'],
        action: 'invoke-tool',
        tool: 'fact-checker',
        confidence: 0.9
      },
      {
        id: 'cite-sources',
        patterns: ['cite', 'sources', 'reference', 'where did'],
        action: 'read-state',
        stateKey: 'sources',
        confidence: 0.85
      }
    ],
    'businesslog': [
      {
        id: 'team-query',
        patterns: ['team status', 'who is on', 'team members'],
        action: 'read-state',
        stateKey: 'team',
        confidence: 0.9
      },
      {
        id: 'meeting-prep',
        patterns: ['prepare for meeting', 'meeting agenda', 'meeting notes'],
        action: 'invoke-tool',
        tool: 'meeting-prep',
        confidence: 0.9
      }
    ]
  };

  return {
    version: '1.0.0',
    rules: [...baseRoutes, ...(templateRoutes[templateName] || [])]
  };
}

/**
 * Generate default theme for template
 */
function generateDefaultTheme(templateName: string): any {
  const themes: Record<string, any> = {
    'bare': {
      colors: {
        primary: '#3b82f6',
        secondary: '#2563eb',
        accent: '#60a5fa',
        background: '#ffffff',
        surface: '#f9fafb',
        text: '#111827',
        textSecondary: '#6b7280'
      },
      typography: {
        fontFamily: 'system-ui',
        headingFont: 'system-ui',
        monoFont: '"Fira Code", monospace'
      },
      logo: '',
      darkMode: false
    },
    'cloud-worker': {
      primaryColor: '#F48120',
      fontFamily: 'system-ui',
      logo: '',
      darkMode: true
    },
    'dmlog': {
      colors: {
        primary: '#c9a23c',
        secondary: '#4A0080',
        accent: '#FF6B35',
        background: '#1A1A2E',
        surface: '#16213E',
        text: '#EAEAEA',
        textSecondary: '#A0A0A0'
      },
      typography: {
        fontFamily: '"Cinzel", serif',
        headingFont: '"MedievalSharp", cursive',
        monoFont: '"Fira Code", monospace'
      },
      logo: '',
      darkMode: true
    },
    'studylog': {
      colors: {
        primary: '#4CAF50',
        secondary: '#2E7D32',
        accent: '#81C784',
        background: '#F5F5F5',
        surface: '#FFFFFF',
        text: '#212121',
        textSecondary: '#757575'
      },
      typography: {
        fontFamily: 'system-ui',
        headingFont: 'system-ui',
        monoFont: '"Fira Code", monospace'
      },
      logo: '',
      darkMode: false
    },
    'makerlog': {
      colors: {
        primary: '#00FF00',
        secondary: '#00CC00',
        accent: '#00DD00',
        background: '#0D1117',
        surface: '#161B22',
        text: '#C9D1D9',
        textSecondary: '#8B949E'
      },
      typography: {
        fontFamily: '"Fira Code", monospace',
        headingFont: 'system-ui',
        monoFont: '"Fira Code", monospace'
      },
      logo: '',
      darkMode: true
    },
    'playerlog': {
      colors: {
        primary: '#FF00FF',
        secondary: '#9400D3',
        accent: '#00FFFF',
        background: '#0D0D1A',
        surface: '#1A1A2E',
        text: '#FFFFFF',
        textSecondary: '#B0B0B0'
      },
      typography: {
        fontFamily: 'system-ui',
        headingFont: '"Orbitron", sans-serif',
        monoFont: '"Fira Code", monospace'
      },
      logo: '',
      darkMode: true
    },
    'reallog': {
      colors: {
        primary: '#333333',
        secondary: '#666666',
        accent: '#8B4513',
        background: '#FAF9F6',
        surface: '#FFFFFF',
        text: '#1A1A1A',
        textSecondary: '#4A4A4A'
      },
      typography: {
        fontFamily: '"Georgia", serif',
        headingFont: '"Playfair Display", serif',
        monoFont: '"Fira Code", monospace'
      },
      logo: '',
      darkMode: false
    },
    'businesslog': {
      colors: {
        primary: '#0052CC',
        secondary: '#0065FF',
        accent: '#2684FF',
        background: '#FAFBFC',
        surface: '#FFFFFF',
        text: '#172B4D',
        textSecondary: '#6B778C'
      },
      typography: {
        fontFamily: 'system-ui',
        headingFont: 'system-ui',
        monoFont: '"SF Mono", "Fira Code", monospace'
      },
      logo: '',
      darkMode: false
    }
  };

  return themes[templateName] || themes['bare'];
}
