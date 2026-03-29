/**
 * Template-based scaffolding for create-cocapn.
 *
 * Provides simple template files for different Cocapn instance types.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface TemplateOptions {
  template: string;
  repoName: string;
  description?: string;
  author?: string;
}

export interface TemplateFile {
  path: string;
  content: string;
}

/**
 * Get template files for the specified template type.
 */
export function getTemplateFiles(options: TemplateOptions): TemplateFile[] {
  const { template, repoName = 'my-cocapn', description = '', author = '' } = options;

  // Base files for all templates
  const baseFiles: TemplateFile[] = [
    {
      path: '.gitignore',
      content: 'node_modules/\ndist/\n.env\n.claude/\n*.log\n'
    },
    {
      path: 'cocapn.json',
      content: JSON.stringify({
        template,
        version: '0.1.0',
        name: repoName,
        description: description || `Cocapn instance from ${template} template`
      }, null, 2)
    }
  ];

  // Template-specific files
  switch (template) {
    case 'cloud-worker':
      return [
        ...baseFiles,
        {
          path: 'wrangler.toml',
          content: `name = "${repoName}"
main = "src/index.ts"
compatibility_date = "2024-01-01"
`
        },
        {
          path: 'package.json',
          content: JSON.stringify({
            name: repoName,
            version: '0.1.0',
            type: 'module',
            description: description || `Cocapn Cloudflare Worker instance`,
            scripts: {
              dev: 'wrangler dev',
              deploy: 'wrangler deploy',
              test: 'vitest run'
            },
            dependencies: {
              hono: '^4.0.0'
            },
            devDependencies: {
              wrangler: '^3.0.0',
              vitest: '^1.0.0',
              '@types/node': '^20.0.0'
            }
          }, null, 2)
        },
        {
          path: 'src/index.ts',
          content: `// ${repoName} - Cocapn Cloudflare Worker
import { Hono } from 'hono';

const app = new Hono();

app.get('/', (c) => c.text('Hello from ${repoName}!'));

export default app;
`
        }
      ];

    case 'web-app':
      return [
        ...baseFiles,
        {
          path: 'package.json',
          content: JSON.stringify({
            name: repoName,
            version: '0.1.0',
            type: 'module',
            description: description || `Cocapn web application`,
            scripts: {
              dev: 'vite',
              build: 'vite build',
              preview: 'vite preview',
              test: 'vitest run'
            },
            dependencies: {
              'preact': '^10.0.0'
            },
            devDependencies: {
              'vite': '^5.0.0',
              '@preact/preset-vite': '^2.0.0',
              'vitest': '^1.0.0',
              '@types/node': '^20.0.0'
            }
          }, null, 2)
        },
        {
          path: 'src/index.ts',
          content: `// ${repoName} - Cocapn Web App
import { render } from 'preact';
import { App } from './App';

render(<App />, document.getElementById('app')!);
`
        },
        {
          path: 'src/App.tsx',
          content: `import { h } from 'preact';

export function App() {
  return (
    <div>
      <h1>Welcome to ${repoName}</h1>
      <p>Your Cocapn instance is ready!</p>
    </div>
  );
}
`
        },
        {
          path: 'index.html',
          content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${repoName}</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/index.ts"></script>
</body>
</html>
`
        }
      ];

    case 'dmlog':
      return [
        ...baseFiles,
        {
          path: 'cocapn/soul.md',
          content: `# ${repoName} - TTRPG AI Dungeon Master

You are an AI Dungeon Master for a tabletop role-playing game campaign.

## Style
- Descriptive and atmospheric
- Fair rules adjudication
- Player agency focused
- Epic narrative moments

## Campaign Setting
- Fantasy world with rich lore
- Balanced encounters
- Meaningful player choices
${author ? `## Game Master\n- Created by: ${author}\n` : ''}

${description ? `## Campaign\n${description}\n` : ''}
`
        },
        {
          path: 'cocapn/config.yml',
          content: `# ${repoName} DMlog Configuration
name: "${repoName}"
domain: "dmlog.ai"
theme: "ttrpg"

features:
  - dice_roller
  - character_tracker
  - campaign_notes
  - encounter_generator
`
        },
        {
          path: 'package.json',
          content: JSON.stringify({
            name: repoName,
            version: '0.1.0',
            type: 'module',
            description: description || `TTRPG AI Dungeon Master - Cocapn instance`,
            scripts: {
              start: 'node src/index.ts',
              test: 'vitest run'
            },
            devDependencies: {
              vitest: '^1.0.0',
              '@types/node': '^20.0.0'
            }
          }, null, 2)
        },
        {
          path: 'src/index.ts',
          content: `// ${repoName} - DMlog TTRPG Instance
console.log('Welcome to ${repoName} - Your AI Dungeon Master!');
console.log('Initializing Cocapn bridge...');
`
        }
      ];

    case 'studylog':
      return [
        ...baseFiles,
        {
          path: 'cocapn/soul.md',
          content: `# ${repoName} - Interactive Learning Platform

You are an AI tutor and learning companion for ${repoName}.

## Teaching Style
- Patient and encouraging
- Socratic method when appropriate
- Clear explanations
- Real-world examples
- Adaptive difficulty

## Learning Philosophy
- Active recall over passive review
- Spaced repetition integration
- Concept mapping
- Practice problems
${author ? `## Instructor\n- Created by: ${author}\n` : ''}

${description ? `## Course Focus\n${description}\n` : ''}
`
        },
        {
          path: 'cocapn/config.yml',
          content: `# ${repoName} Studylog Configuration
name: "${repoName}"
domain: "studylog.ai"
theme: "education"

features:
  - flashcard_system
  - quiz_generator
  - progress_tracking
  - concept_mapping
  - spaced_repetition
`
        },
        {
          path: 'package.json',
          content: JSON.stringify({
            name: repoName,
            version: '0.1.0',
            type: 'module',
            description: description || `Interactive learning platform - Cocapn instance`,
            scripts: {
              start: 'node src/index.ts',
              test: 'vitest run'
            },
            devDependencies: {
              vitest: '^1.0.0',
              '@types/node': '^20.0.0'
            }
          }, null, 2)
        },
        {
          path: 'src/index.ts',
          content: `// ${repoName} - Studylog Education Instance
console.log('Welcome to ${repoName} - Your AI Learning Companion!');
console.log('Initializing Cocapn bridge...');
`
        }
      ];

    case 'bare':
    default:
      return [
        ...baseFiles,
        {
          path: 'package.json',
          content: JSON.stringify({
            name: repoName,
            version: '0.1.0',
            type: 'module',
            description: description || `Minimal Cocapn instance`,
            scripts: {
              start: 'node src/index.ts',
              test: 'vitest run'
            },
            devDependencies: {
              vitest: '^1.0.0',
              '@types/node': '^20.0.0'
            }
          }, null, 2)
        },
        {
          path: 'src/index.ts',
          content: `// ${repoName} - Minimal Cocapn Instance
console.log('${repoName} is running!');
`
        }
      ];
  }
}

/**
 * Write template files to the target directory.
 */
export function writeTemplateFiles(targetDir: string, options: TemplateOptions): void {
  const files = getTemplateFiles(options);

  for (const file of files) {
    const fullPath = join(targetDir, file.path);
    const dir = join(fullPath, '..');

    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, file.content, 'utf8');
  }
}
