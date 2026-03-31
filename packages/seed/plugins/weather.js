/**
 * Weather plugin — /weather <city>
 * Fetches from wttr.in (no API key needed).
 * Hook: before-chat, auto-fetches when user mentions weather.
 */

import { execSync } from 'node:child_process';

export default {
  name: 'weather',
  version: '1.0.0',
  hooks: {
    command: {
      async weather(args) {
        const city = args.trim() || 'New York';
        try {
          const raw = execSync(
            `curl -s "wttr.in/${encodeURIComponent(city)}?format=%l:+%t,+%C,+wind+%w"`,
            { encoding: 'utf-8', timeout: 10000 }
          ).trim();
          return raw.includes('ERROR') ? `Could not fetch weather for ${city}` : raw;
        } catch {
          return `Could not fetch weather for ${city}`;
        }
      },
    },
    async 'before-chat'(message, context) {
      if (/\b(weather|forecast|temperature)\b/i.test(message)) {
        const cityMatch = message.match(/(?:in|at|for)\s+([A-Z][\w\s]{1,25})/i);
        if (cityMatch) {
          try {
            const raw = execSync(
              `curl -s "wttr.in/${encodeURIComponent(cityMatch[1].trim())}?format=%l:+%t,+%C,+wind+%w"`,
              { encoding: 'utf-8', timeout: 10000 }
            ).trim();
            if (!raw.includes('ERROR')) context._weatherHint = raw;
          } catch { /* skip */ }
        }
      }
      return context;
    },
  },
};
