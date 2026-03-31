import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Soul {
  name: string;
  tone: string;
  model: string;
  body: string;
  theme?: string;
  avatar?: string;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

export function loadSoul(soulPath: string): Soul {
  const raw = readFileSync(resolve(soulPath), 'utf-8');
  const match = raw.match(FRONTMATTER_RE);
  const meta: Record<string, string> = {};
  let body = raw;

  if (match) {
    body = raw.slice(match[0].length);
    for (const line of match[1].split('\n')) {
      const [k, ...v] = line.split(':');
      if (k && v.length) meta[k.trim()] = v.join(':').trim();
    }
  }

  return {
    name: meta.name || 'unnamed',
    tone: meta.tone || 'neutral',
    model: meta.model || 'deepseek',
    body: body.trim(),
    theme: meta.theme,
    avatar: meta.avatar,
  };
}

export function soulToSystemPrompt(soul: Soul): string {
  return `You are ${soul.name}. Your tone is ${soul.tone}.\n\n${soul.body}`;
}

/**
 * Build a full system prompt combining soul, awareness, facts, and reflection.
 * This is the enhanced prompt that makes the agent actually smart.
 */
export function buildFullSystemPrompt(
  soul: Soul,
  awarenessNarration: string,
  formattedFacts: string,
  reflectionSummary?: string,
): string {
  const sections: string[] = [];

  // Core personality
  sections.push(`You are ${soul.name}. Your tone is ${soul.tone}.\n\n${soul.body}`);

  // Git awareness — who I am in the repo
  sections.push(`## Who I Am\n${awarenessNarration}`);

  // Learned facts — what I remember about the user and world
  if (formattedFacts) {
    sections.push(`## What I Remember\n${formattedFacts}`);
  }

  // Self-reflection — recent insights
  if (reflectionSummary) {
    sections.push(`## Recent Reflection\n${reflectionSummary}`);
  }

  return sections.join('\n\n');
}

/**
 * Build an A2A-aware system prompt for when another agent is visiting.
 * Adds context about visiting agents and privacy constraints.
 */
export function buildA2ASystemPrompt(
  soul: Soul,
  visitingAgentName: string,
  visitingAgentUrl?: string,
): string {
  const origin = visitingAgentUrl ? ` from ${visitingAgentUrl}` : '';
  return `You are ${soul.name}. Your tone is ${soul.tone}.\n\n${soul.body}\n\n## Visiting Agent\nAnother agent (name: ${visitingAgentName}${origin}) is visiting. Be helpful but don't share private facts (prefixed with private.*). Respond concisely and collaboratively.`;
}
