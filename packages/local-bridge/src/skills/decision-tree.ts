/**
 * Skill Decision Tree — Zero-Shot Skill Discovery
 *
 * The decision tree enables zero-shot navigation of skills using
 * a tree structure, similar to the i-know-kung-fu pattern.
 * No LLM tokens needed for skill discovery.
 */

import type {
  TreeNode,
  SkillCartridge,
  SkillTrace,
  SkillCategory,
} from './types.js';

/**
 * Skill Decision Tree for zero-shot skill discovery
 *
 * Maps keywords to skills using a tree structure without LLM involvement.
 * Based on the i-know-kung-fu pattern.
 */
export class SkillDecisionTree {
  private tree: TreeNode;
  private skills: Map<string, SkillCartridge> = new Map();

  constructor() {
    this.tree = this.buildDefaultTree();
  }

  /**
   * Resolve keywords to matching skill(s)
   * @param keywords - Keywords to search for
   * @returns Array of matching skill names
   */
  resolve(keywords: string[]): string[] {
    const matches = new Set<string>();
    const lowerKeywords = keywords.map(k => k.toLowerCase());

    // Navigate tree for each keyword
    for (const keyword of lowerKeywords) {
      const result = this.navigateTree(keyword, this.tree, []);
      if (result) {
        matches.add(result);
      }
    }

    // Fallback: check all skill triggers directly
    if (matches.size === 0) {
      for (const [name, cartridge] of this.skills) {
        for (const trigger of cartridge.triggers) {
          if (lowerKeywords.includes(trigger.toLowerCase())) {
            matches.add(name);
            break;
          }
        }
      }
    }

    return Array.from(matches);
  }

  /**
   * Trace the path taken through the tree for each keyword
   * @param keywords - Keywords to search for
   * @returns Array of trace results with skill and path
   */
  trace(keywords: string[]): SkillTrace[] {
    const traces: SkillTrace[] = [];
    const lowerKeywords = keywords.map(k => k.toLowerCase());

    for (const keyword of lowerKeywords) {
      const path: string[] = [];
      const result = this.navigateTree(keyword, this.tree, path);

      if (result) {
        traces.push({
          skill: result,
          path: [...path],
        });
      }
    }

    return traces;
  }

  /**
   * Rebuild the tree from registered skills
   * @param skills - Array of skill cartridges
   */
  rebuild(skills: SkillCartridge[]): void {
    this.skills.clear();
    for (const skill of skills) {
      this.skills.set(skill.name, skill);
    }
    this.tree = this.buildTreeFromSkills(skills);
  }

  /**
   * Get the current tree structure (for debugging)
   * @returns The tree root node
   */
  getTree(): TreeNode {
    return this.tree;
  }

  /**
   * Navigate the tree for a single keyword
   * @param keyword - Keyword to search for
   * @param node - Current tree node
   * @param path - Path taken so far
   * @returns Skill name or null
   */
  private navigateTree(
    keyword: string,
    node: TreeNode,
    path: string[]
  ): string | null {
    // Record the question
    path.push(node.question);

    // Check if any branch matches the keyword
    for (const [branchKey, branchValue] of Object.entries(node.branches)) {
      if (keyword.includes(branchKey.toLowerCase()) || branchKey.toLowerCase().includes(keyword)) {
        if (typeof branchValue === 'string') {
          // Leaf node - skill name
          return branchValue;
        } else {
          // Internal node - continue navigation
          return this.navigateTree(keyword, branchValue, path);
        }
      }
    }

    return null;
  }

  /**
   * Build the default decision tree
   * @returns Default tree root node
   */
  private buildDefaultTree(): TreeNode {
    return {
      question: 'What type of task are you working on?',
      branches: {
        code: {
          question: 'What kind of code work?',
          branches: {
            write: 'code-write',
            refactor: 'code-refactor',
            debug: 'code-debug',
            test: 'code-test',
            review: 'code-review',
          },
        },
        research: {
          question: 'What do you want to find?',
          branches: {
            information: 'research-search',
            documentation: 'research-docs',
            examples: 'research-examples',
          },
        },
        communication: {
          question: 'How do you want to communicate?',
          branches: {
            chat: 'comm-chat',
            message: 'comm-message',
            notify: 'comm-notify',
          },
        },
        operations: {
          question: 'What operation do you need?',
          branches: {
            deploy: 'ops-deploy',
            schedule: 'ops-schedule',
            publish: 'ops-publish',
            monitor: 'ops-monitor',
          },
        },
        security: {
          question: 'What security task?',
          branches: {
            authenticate: 'sec-auth',
            authorize: 'sec-authz',
            encrypt: 'sec-encrypt',
            audit: 'sec-audit',
          },
        },
        analysis: {
          question: 'What do you want to analyze?',
          branches: {
            data: 'analysis-data',
            performance: 'analysis-perf',
            logs: 'analysis-logs',
          },
        },
      },
    };
  }

  /**
   * Build a tree from skill cartridges
   * @param skills - Array of skill cartridges
   * @returns Tree root node
   */
  private buildTreeFromSkills(skills: SkillCartridge[]): TreeNode {
    const categories = new Map<SkillCategory, SkillCartridge[]>();

    // Group skills by category
    for (const skill of skills) {
      const category = skill.category || 'code';
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(skill);
    }

    // Build tree branches from categories
    const branches: Record<string, TreeNode | string> = {};

    for (const [category, categorySkills] of categories) {
      if (categorySkills.length === 1) {
        branches[category] = categorySkills[0].name;
      } else {
        const categoryBranches: Record<string, string> = {};
        for (const skill of categorySkills) {
          // Use first trigger as branch key
          const key = skill.triggers[0] || skill.name;
          categoryBranches[key] = skill.name;
        }

        branches[category] = {
          question: `Which ${category} task?`,
          branches: categoryBranches,
        };
      }
    }

    return {
      question: 'What type of task are you working on?',
      branches,
    };
  }
}

/**
 * Skill Matcher — Alternative keyword-based matching
 *
 * Simple keyword matching when decision tree is overkill.
 */
export class SkillMatcher {
  private skills: Map<string, SkillCartridge> = new Map();
  private triggerIndex: Map<string, Set<string>> = new Map(); // trigger -> skill names

  /**
   * Add a skill to the matcher
   * @param skill - Skill cartridge
   */
  add(skill: SkillCartridge): void {
    this.skills.set(skill.name, skill);

    for (const trigger of skill.triggers) {
      const key = trigger.toLowerCase();
      if (!this.triggerIndex.has(key)) {
        this.triggerIndex.set(key, new Set());
      }
      this.triggerIndex.get(key)!.add(skill.name);
    }
  }

  /**
   * Match keywords to skills
   * @param keywords - Keywords to match
   * @returns Array of matching skill names
   */
  match(keywords: string[]): string[] {
    const matches = new Set<string>();

    for (const keyword of keywords) {
      const key = keyword.toLowerCase();
      const skills = this.triggerIndex.get(key);
      if (skills) {
        for (const skill of skills) {
          matches.add(skill);
        }
      }
    }

    return Array.from(matches);
  }

  /**
   * Clear all skills
   */
  clear(): void {
    this.skills.clear();
    this.triggerIndex.clear();
  }

  /**
   * Get all registered skills
   * @returns Array of skill cartridges
   */
  getAll(): SkillCartridge[] {
    return Array.from(this.skills.values());
  }
}