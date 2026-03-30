/**
 * Skills Handler — WebSocket handlers for skill cartridge operations
 */

import type { SkillLoader } from '../skills/loader.js';
import type { SkillDecisionTree } from '../skills/decision-tree.js';
import type { Sender } from '../ws/send.js';
import type { HandlerContext } from './types.js';

/**
 * Handle SKILL_LIST WebSocket method
 * Returns list of all registered skills
 */
export async function handleSkillList(
  context: HandlerContext,
  sender: Sender
): Promise<void> {
  const { skillLoader } = context;

  if (!skillLoader) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Skill loader not available',
        skills: [],
      },
    });
    return;
  }

  const skills = skillLoader.getAll();
  const stats = skillLoader.stats();

  await sender({
    jsonrpc: '2.0',
    id: null,
    result: {
      success: true,
      skills: skills.map(s => ({
        name: s.name,
        version: s.version,
        description: s.description,
        triggers: s.triggers,
        category: s.category,
        hot: s.hot || false,
        tokenBudget: s.tokenBudget || 500,
      })),
      stats: {
        total: stats.total,
        loaded: stats.loaded,
        hot: stats.hot,
        cold: stats.cold,
        memoryBytes: stats.memoryBytes,
      },
    },
  });
}

/**
 * Handle SKILL_LOAD WebSocket method
 * Loads a specific skill by name
 */
export async function handleSkillLoad(
  context: HandlerContext,
  sender: Sender,
  params: { name: string }
): Promise<void> {
  const { skillLoader } = context;

  if (!skillLoader) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Skill loader not available',
        loaded: false,
      },
    });
    return;
  }

  const { name } = params;
  const cartridge = skillLoader.load(name);

  if (!cartridge) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: `Skill not found: ${name}`,
        loaded: false,
      },
    });
    return;
  }

  await sender({
    jsonrpc: '2.0',
    id: null,
    result: {
      success: true,
      loaded: true,
      skill: {
        name: cartridge.name,
        version: cartridge.version,
        description: cartridge.description,
        triggers: cartridge.triggers,
        category: cartridge.category,
      },
    },
  });
}

/**
 * Handle SKILL_UNLOAD WebSocket method
 * Unloads a specific skill by name
 */
export async function handleSkillUnload(
  context: HandlerContext,
  sender: Sender,
  params: { name: string }
): Promise<void> {
  const { skillLoader } = context;

  if (!skillLoader) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Skill loader not available',
        unloaded: false,
      },
    });
    return;
  }

  const { name } = params;
  const unloaded = skillLoader.unload(name);

  await sender({
    jsonrpc: '2.0',
    id: null,
    result: {
      success: unloaded,
      unloaded,
      skill: name,
    },
  });
}

/**
 * Handle SKILL_MATCH WebSocket method
 * Matches keywords to available skills
 */
export async function handleSkillMatch(
  context: HandlerContext,
  sender: Sender,
  params: { keywords: string[] }
): Promise<void> {
  const { skillLoader, decisionTree } = context;

  if (!skillLoader || !decisionTree) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Skill system not available',
        matches: [],
      },
    });
    return;
  }

  const { keywords } = params;

  // Use decision tree for resolution
  const treeMatches = decisionTree.resolve(keywords);

  // Also use skill loader for intent matching
  const intentMatches = skillLoader.loadByIntent(keywords);

  await sender({
    jsonrpc: '2.0',
    id: null,
    result: {
      success: true,
      matches: [
        ...treeMatches,
        ...intentMatches.map(s => s.name),
      ],
      skills: intentMatches,
    },
  });
}

/**
 * Handle SKILL_CONTEXT WebSocket method
 * Returns the skill context for agent prompts
 */
export async function handleSkillContext(
  context: HandlerContext,
  sender: Sender,
  params: { maxTokens?: number }
): Promise<void> {
  const { skillLoader } = context;

  if (!skillLoader) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Skill loader not available',
        context: '',
        tokens: 0,
      },
    });
    return;
  }

  const { maxTokens } = params;
  const skillContext = skillLoader.buildSkillContext(maxTokens);

  await sender({
    jsonrpc: '2.0',
    id: null,
    result: {
      success: true,
      ...skillContext,
    },
  });
}

/**
 * Handle SKILL_STATS WebSocket method
 * Returns statistics about skill usage
 */
export async function handleSkillStats(
  context: HandlerContext,
  sender: Sender
): Promise<void> {
  const { skillLoader } = context;

  if (!skillLoader) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Skill loader not available',
        stats: null,
      },
    });
    return;
  }

  const stats = skillLoader.stats();
  const loaded = skillLoader.getLoaded();

  await sender({
    jsonrpc: '2.0',
    id: null,
    result: {
      success: true,
      stats: {
        ...stats,
        loaded: loaded.map(s => ({
          name: s.name,
          useCount: s.useCount,
          lastUsedAt: s.lastUsedAt,
          tokenBudget: s.cartridge.tokenBudget || 500,
        })),
      },
    },
  });
}