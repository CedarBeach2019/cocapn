/**
 * Skill Cartridge System — Types & Interfaces
 *
 * This module defines the core types for the skill cartridge system.
 * Skill cartridges are lightweight JSON descriptions of capabilities
 * that can be loaded into agent context.
 */

/**
 * High-level categories for decision tree navigation
 */
export type SkillCategory = 'code' | 'research' | 'communication' | 'operations' | 'security' | 'analysis';

/**
 * Action types for skill steps
 */
export type StepAction = 'read' | 'write' | 'execute' | 'search' | 'think' | 'delegate' | 'respond';

/**
 * Tolerance modes for error handling
 */
export type ToleranceMode = 'retry' | 'skip' | 'fallback' | 'error';

/**
 * A single step in a skill's procedure
 */
export interface SkillStep {
  /** Type of action to perform */
  action: StepAction;
  /** What this step does */
  description: string;
  /** Optional: specific tool to use */
  tool?: string;
  /** What to do if this step fails */
  fallback?: string;
}

/**
 * Example input/output for a skill
 */
export interface SkillExample {
  /** Example user input or trigger */
  input: string;
  /** Expected result or action */
  output?: string;
}

/**
 * Error tolerance configuration
 */
export interface SkillTolerance {
  /** Action when network operations fail */
  network_failure?: ToleranceMode;
  /** Action when input validation fails */
  invalid_input?: ToleranceMode;
  /** Action when operations timeout */
  timeout?: ToleranceMode;
}

/**
 * A skill cartridge — the core data structure
 *
 * Cartridges are lightweight (~500-1000 tokens) and describe
 * how to perform specific tasks.
 */
export interface SkillCartridge {
  /** Unique skill identifier (kebab-case) */
  name: string;
  /** Semantic version */
  version: string;
  /** One-line description (~50 chars) */
  description?: string;
  /** Keywords that activate this skill */
  triggers: string[];
  /** High-level category for decision tree navigation */
  category?: SkillCategory;
  /** Step-by-step procedure for executing this skill */
  steps: SkillStep[];
  /** Example inputs and outputs */
  examples?: SkillExample[];
  /** Approximate tokens when loaded */
  tokenBudget?: number;
  /** How to handle different failure modes */
  tolerance?: SkillTolerance;
  /** Other skills that must be loaded before this one */
  dependencies?: string[];
  /** If true, always loaded in agent context */
  hot?: boolean;
  /** Optional: module this skill belongs to */
  module?: string;
}

/**
 * A loaded skill with metadata
 */
export interface LoadedSkill {
  /** Skill name */
  name: string;
  /** The cartridge data */
  cartridge: SkillCartridge;
  /** When this skill was loaded (timestamp) */
  loadedAt: number;
  /** Number of times this skill has been used */
  useCount: number;
  /** Last time this skill was used (timestamp) */
  lastUsedAt: number;
}

/**
 * Configuration options for SkillLoader
 */
export interface SkillLoaderOptions {
  /** Maximum number of cold skills to keep loaded */
  maxColdSkills?: number;
  /** Maximum memory budget for skills (in bytes) */
  maxMemoryBytes?: number;
  /** Paths to search for skill cartridges */
  skillPaths?: string[];
}

/**
 * Statistics about skill loader state
 */
export interface SkillLoaderStats {
  /** Total registered skills */
  total: number;
  /** Currently loaded skills */
  loaded: number;
  /** Hot skills (always loaded) */
  hot: number;
  /** Cold skills (on-demand) */
  cold: number;
  /** Memory usage in bytes */
  memoryBytes: number;
}

/**
 * Decision tree node for skill discovery
 */
export interface TreeNode {
  /** Question to ask at this node */
  question: string;
  /** Branches: answer -> next node or skill name */
  branches: Record<string, TreeNode | string>;
}

/**
 * Result of decision tree navigation
 */
export interface SkillTrace {
  /** The skill that was selected */
  skill: string;
  /** Path taken through the tree */
  path: string[];
}

/**
 * Context injection result
 */
export interface SkillContext {
  /** The context string to inject */
  context: string;
  /** Skills that were included */
  skills: string[];
  /** Total token estimate */
  tokens: number;
}