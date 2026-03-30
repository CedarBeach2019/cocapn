/**
 * Template manifest types for cocapn-template.json
 */

export interface TemplateManifest {
  /** Template identifier (kebab-case) */
  name: string;
  /** Semantic version */
  version: string;
  /** Human-readable name with domain */
  displayName: string;
  /** Short description of what this template provides */
  description: string;
  /** Domains this template is designed for */
  domains: string[];
  /** Single emoji icon for the template */
  emoji: string;
  /** Template author/organization */
  author: string;
  /** GitHub repository URL */
  repository?: string;
  /** Feature flags enabled by default */
  features?: string[];
  /** Pre-installed modules */
  modules?: string[];
  /** Agent personality configuration */
  personality?: TemplatePersonality;
  /** Default configuration values */
  config?: TemplateConfig;
  /** Optional fork paths for multi-path onboarding */
  forks?: TemplateFork[];
}

export interface TemplatePersonality {
  /** Path to soul.md file */
  file?: string;
  /** Default system prompt override */
  systemPrompt?: string;
}

export interface TemplateConfig {
  /** Cloud backend configuration */
  cloud?: {
    workerUrl?: string;
    [key: string]: unknown;
  };
  /** UI theme configuration */
  theme?: {
    accent?: string;
    mode?: "light" | "dark" | "auto";
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface TemplateFork {
  /** Fork identifier */
  id: string;
  /** Human-readable fork name */
  label: string;
  /** Short description of this fork */
  description: string;
  /** Features enabled for this fork */
  features?: string[];
  /** Override personality for this fork */
  personality?: {
    systemPrompt?: string;
  };
}

export interface TemplateSummary {
  name: string;
  displayName: string;
  description: string;
  emoji: string;
  domains: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
