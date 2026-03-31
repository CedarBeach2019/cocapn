# Plugin Developer Guide

Extend cocapn with plugins — zero-config, drop-in JS files.

---

## Quick Start

1. Create `cocapn/plugins/` in your repo
2. Add a `.js` file that exports a plugin object
3. Restart cocapn — done

```js
// cocapn/plugins/hello.js
export default {
  name: 'hello',
  version: '1.0.0',
  hooks: {
    command: {
      async hello(args) {
        return `Hello, ${args || 'world'}!`;
      }
    }
  }
};
```

Run `/hello Alice` in chat. That's it.

---

## Plugin Shape

Every plugin is an ES module exporting an object with this shape:

```typescript
interface Plugin {
  name: string;        // Required. Unique identifier.
  version: string;     // Required. Semver string.
  hooks: {
    'before-chat'?: (message: string, context: ChatContext) => Promise<ChatContext>;
    'after-chat'?: (response: string, context: ChatContext) => Promise<string>;
    'command'?: Record<string, (args: string) => Promise<string>>;
    'periodic'?: () => Promise<void>;
  };
}

interface ChatContext {
  message: string;                    // The user's message
  facts: Record<string, string>;      // Current memory facts (read-only)
  [key: string]: unknown;             // Add your own data for other hooks
}
```

---

## Hook Reference

### `before-chat`

Runs **before** each LLM call. Receives the raw user message and a context object.

**Use cases**: inject hints, enrich context, detect intent, pre-fetch data.

```js
async 'before-chat'(message, context) {
  if (/\bweather\b/i.test(message)) {
    const data = await fetchWeather();
    context.weatherData = data;  // available to after-chat
  }
  return context;
}
```

### `after-chat`

Runs **after** each LLM response. Receives the response text and context. Return the (possibly modified) response.

**Use cases**: post-process responses, append data, format output.

```js
async 'after-chat'(response, context) {
  if (context.weatherData) {
    return response + '\n\nWeather: ' + context.weatherData;
  }
  return response;
}
```

### `command`

Register slash commands. Each key becomes `/key` in chat. The handler receives the argument string after the command name.

```js
command: {
  async weather(args) {
    return await fetchWeather(args);
  },
  async define(args) {
    return await lookupDefinition(args);
  }
}
```

Usage: `/weather Seattle`, `/define serendipity`

### `periodic`

Runs on a schedule (if configured). No arguments, no return value.

```js
async periodic() {
  await checkForUpdates();
}
```

---

## Plugin Loading

Plugins are loaded from `cocapn/plugins/*.js` relative to the repo root. Files are loaded in alphabetical order. Hooks execute in load order.

Requirements:
- ES module (`export default { ... }`)
- `.js` extension
- Valid `name` and `hooks` fields

Invalid plugins are skipped with a log message — they never crash the agent.

---

## Error Handling

Plugin errors are **always caught and logged**. A failing plugin:
- Does not crash the agent
- Logs to `[cocapn:plugins]`
- Skips that hook — other plugins continue

---

## Built-in Commands

These commands always exist and cannot be overridden:
- `/help`, `/whoami`, `/memory`, `/git`, `/export`, `/import`, `/clear`, `/quit`, `/plugins`

Plugin commands are checked after built-in commands. If you name a command the same as a built-in, the built-in wins.

---

## /plugins Command

Lists all loaded plugins with versions and their commands:

```
  weather@1.0.0 — commands: /weather
  timezone@1.0.0 — commands: /tz
  git-summary@1.0.0 — commands: /summary
```

---

## Example: Weather Plugin

```js
// cocapn/plugins/weather.js
import { execSync } from 'node:child_process';

export default {
  name: 'weather',
  version: '1.0.0',
  hooks: {
    command: {
      async weather(args) {
        const city = args.trim() || 'New York';
        try {
          return execSync(
            `curl -s "wttr.in/${encodeURIComponent(city)}?format=%l:+%t,+%C,+wind+%w"`,
            { encoding: 'utf-8', timeout: 10000 }
          ).trim();
        } catch {
          return `Could not fetch weather for ${city}`;
        }
      }
    },
    async 'before-chat'(message, context) {
      if (/\b(weather|forecast)\b/i.test(message)) {
        const m = message.match(/(?:in|at|for)\s+([A-Z][\w\s]{1,25})/i);
        if (m) {
          try {
            const raw = execSync(
              `curl -s "wttr.in/${encodeURIComponent(m[1].trim())}?format=%l:+%t,+%C,+wind+%w"`,
              { encoding: 'utf-8', timeout: 10000 }
            ).trim();
            if (!raw.includes('ERROR')) context._weatherHint = raw;
          } catch {}
        }
      }
      return context;
    }
  }
};
```

---

## Best Practices

1. **One file, one plugin.** Keep it simple.
2. **Use `node:child_process` and `node:fs`** — no npm dependencies needed.
3. **Prefix context keys** with your plugin name (e.g., `_weatherHint`) to avoid collisions.
4. **Set timeouts** on external calls (curl, fetch) — don't block the agent.
5. **Return early** when your hook doesn't apply — don't slow every message.
6. **Handle errors internally** — even though cocapn catches them, clean error handling makes debugging easier.
7. **Name commands clearly** — short, memorable, no collisions with built-ins.
8. **Keep it minimal** — plugins that do one thing well are better than Swiss Army knives.

---

## File Structure

```
your-repo/
├── cocapn/
│   ├── plugins/         ← Drop plugins here
│   │   ├── weather.js
│   │   ├── timezone.js
│   │   └── git-summary.js
│   ├── soul.md
│   └── cocapn.json
├── .cocapn/
│   └── memory.json
└── ...
```
