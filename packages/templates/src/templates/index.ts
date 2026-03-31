import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface TemplateMeta {
  slug: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  icon: string;
}

export interface Template extends TemplateMeta {
  soul: string;
  config: string;
  readme: string;
  theme: string;
  plugins: string[];
}

const TEMPLATE_META: TemplateMeta[] = [
  {
    slug: 'researcher',
    name: 'Research Assistant',
    description: 'Academic research companion for literature reviews, paper drafting, citation management, and experiment tracking',
    category: 'education',
    tags: ['academic', 'research', 'citations', 'papers', 'science'],
    icon: '🔬',
  },
  {
    slug: 'personal-assistant',
    name: 'Life Admin',
    description: 'Personal assistant for scheduling, reminders, shopping lists, travel planning, and daily life management',
    category: 'productivity',
    tags: ['personal', 'scheduling', 'reminders', 'organization', 'calendar'],
    icon: '📋',
  },
  {
    slug: 'content-creator',
    name: 'Content Creator',
    description: 'Social media and blog agent for content calendars, drafting, hashtag strategy, and analytics',
    category: 'creative',
    tags: ['social-media', 'blogging', 'content', 'marketing', 'writing'],
    icon: '🎨',
  },
  {
    slug: 'customer-support',
    name: 'Support Agent',
    description: 'Business support agent for FAQs, ticket tracking, escalation management, and professional communication',
    category: 'business',
    tags: ['support', 'customer-service', 'tickets', 'faq', 'helpdesk'],
    icon: '🎧',
  },
  {
    slug: 'fitness-coach',
    name: 'Fitness Coach',
    description: 'Health and wellness agent for workout logging, meal tracking, progress charts, and goal setting',
    category: 'health',
    tags: ['fitness', 'workout', 'nutrition', 'health', 'exercise'],
    icon: '💪',
  },
  {
    slug: 'home-automation',
    name: 'Home Agent',
    description: 'Smart home agent for IoT device control, routine scheduling, energy monitoring, and alert management',
    category: 'iot',
    tags: ['smart-home', 'iot', 'automation', 'energy', 'devices'],
    icon: '🏠',
  },
  {
    slug: 'language-tutor',
    name: 'Language Tutor',
    description: 'Language learning agent for vocabulary, grammar, conversation practice, and progress tracking',
    category: 'education',
    tags: ['language', 'learning', 'tutoring', 'vocabulary', 'grammar'],
    icon: '🌍',
  },
  {
    slug: 'project-manager',
    name: 'Project Manager',
    description: 'Software project agent for sprint planning, burndown tracking, standups, and dependency management',
    category: 'development',
    tags: ['project-management', 'agile', 'scrum', 'sprints', 'kanban'],
    icon: '📊',
  },
  {
    slug: 'chef-recipe',
    name: 'Chef Agent',
    description: 'Cooking and meal planning agent for recipe management, meal planning, grocery lists, and cooking coordination',
    category: 'lifestyle',
    tags: ['cooking', 'recipes', 'meal-planning', 'food', 'groceries'],
    icon: '🍳',
  },
  {
    slug: 'writer-novelist',
    name: "Writer's Muse",
    description: 'Creative writing agent for character development, plotting, worldbuilding, chapter tracking, and writing prompts',
    category: 'creative',
    tags: ['writing', 'novel', 'fiction', 'creative', 'storytelling'],
    icon: '✍️',
  },
];

function loadFile(slug: string, filename: string): string {
  const filepath = join(__dirname, slug, filename);
  if (!existsSync(filepath)) {
    throw new Error(`Template file not found: ${filepath}`);
  }
  return readFileSync(filepath, 'utf-8');
}

function loadPlugins(slug: string): string[] {
  const pluginsDir = join(__dirname, slug, 'plugins');
  if (!existsSync(pluginsDir)) return [];
  return readdirSync(pluginsDir).filter((f) => f !== '.gitkeep');
}

export function getTemplate(slug: string): Template | undefined {
  const meta = TEMPLATE_META.find(
    (t) => t.slug === slug || t.slug === slug.replace(/_/g, '-')
  );
  if (!meta) return undefined;

  return {
    ...meta,
    soul: loadFile(meta.slug, 'soul.md'),
    config: loadFile(meta.slug, 'config.yml'),
    readme: loadFile(meta.slug, 'README.md'),
    theme: loadFile(meta.slug, 'theme.css'),
    plugins: loadPlugins(meta.slug),
  };
}

export function listTemplates(): TemplateMeta[] {
  return [...TEMPLATE_META];
}

export function getTemplateByCategory(category: string): TemplateMeta[] {
  return TEMPLATE_META.filter((t) => t.category === category);
}

export function searchTemplates(query: string): TemplateMeta[] {
  const lower = query.toLowerCase();
  return TEMPLATE_META.filter(
    (t) =>
      t.name.toLowerCase().includes(lower) ||
      t.description.toLowerCase().includes(lower) ||
      t.tags.some((tag) => tag.includes(lower))
  );
}

export const TEMPLATES = TEMPLATE_META;
