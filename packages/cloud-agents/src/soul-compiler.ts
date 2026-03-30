/**
 * SoulCompiler — cloud-compatible soul.md parser.
 *
 * Extracted from local-bridge for Cloudflare Workers compatibility (zero Node.js deps).
 * Parses soul.md with YAML frontmatter + markdown sections into a structured system prompt.
 * Cloud worker uses publicSystemPrompt (strips private sections).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompiledSoul {
  systemPrompt: string;
  publicSystemPrompt: string;
  traits: string[];
  constraints: string[];
  capabilities: string[];
  greeting: string;
  tone: 'formal' | 'casual' | 'professional' | 'friendly' | 'custom';
  version: string;
  name: string;
  emoji: string;
}

interface FrontmatterData {
  name?: string;
  version?: string;
  tone?: string;
  greeting?: string;
  [key: string]: unknown;
}

// ─── Compiler ─────────────────────────────────────────────────────────────────

export class SoulCompiler {
  compile(soulMd: string): CompiledSoul {
    const { data: frontmatter, body } = this.parseFrontmatter(soulMd);
    const traits = this.extractTraits(body);
    const constraints = this.extractConstraints(body);
    const capabilities = this.extractCapabilities(body);
    const tone = this.detectTone(frontmatter, body);
    const greeting = this.extractGreeting(frontmatter, body);

    const systemPrompt = this.buildSystemPrompt(frontmatter, body);
    const publicSystemPrompt = this.stripPrivateSections(systemPrompt, body);

    return {
      systemPrompt,
      publicSystemPrompt,
      traits,
      constraints,
      capabilities,
      greeting,
      tone,
      version: frontmatter.version ?? '0.0',
      name: frontmatter.name ?? '',
      emoji: (typeof frontmatter.emoji === 'string' ? frontmatter.emoji : '') || '\u{1F9E0}',
    };
  }

  parseFrontmatter(content: string): { data: FrontmatterData; body: string } {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) {
      return { data: {}, body: content.trim() };
    }

    const data = this.parseYamlSimple(match[1]);
    return { data, body: match[2].trim() };
  }

  private parseYamlSimple(raw: string): FrontmatterData {
    const data: FrontmatterData = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const colonIdx = trimmed.indexOf(':');
      if (colonIdx === -1) continue;

      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();

      if (value === 'true') data[key] = true;
      else if (value === 'false') data[key] = false;
      else data[key] = value.replace(/^["']|["']$/g, '');
    }
    return data;
  }

  private extractSection(body: string, headingPattern: RegExp): string {
    const lines = body.split('\n');
    let capturing = false;
    const captured: string[] = [];
    let headingLevel = 0;

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        if (capturing && level <= headingLevel) break;
        if (!capturing && headingPattern.test(headingMatch[2])) {
          capturing = true;
          headingLevel = level;
          continue;
        }
      }
      if (capturing) {
        captured.push(line);
      }
    }

    return captured.join('\n').trim();
  }

  private extractSectionDirect(body: string, headingPattern: RegExp): string {
    const lines = body.split('\n');
    let capturing = false;
    const captured: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        if (capturing) break;
        if (headingPattern.test(headingMatch[2])) {
          capturing = true;
          continue;
        }
      }
      if (capturing) {
        captured.push(line);
      }
    }

    return captured.join('\n').trim();
  }

  private extractListItems(section: string): string[] {
    return section
      .split('\n')
      .map((l) => l.replace(/^[-*]\s+/, '').trim())
      .filter((l) => l.length > 0);
  }

  extractTraits(body: string): string[] {
    const identity = this.extractSection(body, /^identity$/i);
    if (!identity) return [];

    const items = this.extractListItems(identity);
    if (items.length === 0) {
      return identity
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && l.length < 80 && !l.startsWith('#'));
    }
    return items;
  }

  extractConstraints(body: string): string[] {
    const section = this.extractSection(
      body,
      /^(what you don'?t do|constraints|rules|boundaries|limitations)$/i,
    );
    if (!section) return [];
    return this.extractListItems(section);
  }

  extractCapabilities(body: string): string[] {
    const section = this.extractSection(
      body,
      /^(what you know|capabilities|skills|knowledge|expertise)$/i,
    );
    if (!section) return [];
    return this.extractListItems(section);
  }

  private extractGreeting(frontmatter: FrontmatterData, body: string): string {
    if (typeof frontmatter.greeting === 'string' && frontmatter.greeting.trim()) {
      return frontmatter.greeting.trim();
    }

    const greetingSection = this.extractSection(body, /^(greeting|welcome|introduction)$/i);
    if (greetingSection) {
      return greetingSection.split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? '';
    }

    return '';
  }

  private VALID_TONES = new Set<CompiledSoul['tone']>([
    'formal', 'casual', 'professional', 'friendly', 'custom',
  ]);

  detectTone(frontmatter: FrontmatterData, body: string): CompiledSoul['tone'] {
    if (typeof frontmatter.tone === 'string') {
      const normalized = frontmatter.tone.toLowerCase().trim();
      if (this.VALID_TONES.has(normalized as CompiledSoul['tone'])) {
        return normalized as CompiledSoul['tone'];
      }
      return 'custom';
    }

    const lower = body.toLowerCase();
    const scores: Record<string, number> = {
      formal: 0, casual: 0, professional: 0, friendly: 0,
    };

    for (const w of ['formal', 'professional', 'respectful', 'proper', 'courteous']) {
      if (lower.includes(w)) scores.formal++;
    }
    for (const w of ['casual', 'chill', 'relaxed', 'hey', 'yo', 'dude']) {
      if (lower.includes(w)) scores.casual++;
    }
    for (const w of ['professional', 'business', 'expert', 'reliable', 'competent']) {
      if (lower.includes(w)) scores.professional++;
    }
    for (const w of ['friendly', 'warm', 'welcoming', 'helpful', 'kind', 'approachable']) {
      if (lower.includes(w)) scores.friendly++;
    }

    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return best[1] > 0 ? (best[0] as CompiledSoul['tone']) : 'casual';
  }

  buildSystemPrompt(frontmatter: FrontmatterData, body: string): string {
    const parts: string[] = [];

    if (frontmatter.name) {
      parts.push(`You are ${frontmatter.name}.`);
    }

    if (body.trim()) {
      parts.push(body.trim());
    }

    return parts.join('\n\n');
  }

  stripPrivateSections(systemPrompt: string, body: string): string {
    const identity = this.extractSectionDirect(body, /^identity$/i);
    const publicFace = this.extractSectionDirect(body, /^public face/i);

    const parts: string[] = [];

    if (identity) parts.push(identity);
    if (publicFace) parts.push(publicFace);

    if (parts.length === 0) return '';

    return parts.join('\n\n');
  }
}
