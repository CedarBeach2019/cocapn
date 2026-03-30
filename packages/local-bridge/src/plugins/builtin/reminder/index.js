/**
 * reminder plugin — set timed reminders via /remind command.
 * Usage: /remind me in 30min to check nets
 *        /remind at 3pm to pull lines
 *        /reminders (list active)
 */

let ctx = null;
const timers = new Map();

/** Parse time expression like "30min", "2h", "1h30m", "90s". */
export function parseDuration(str) {
  let ms = 0;
  const parts = str.toLowerCase().match(/(\d+)\s*(h|m|min|s|sec)?/g);
  if (!parts) return null;

  for (const part of parts) {
    const match = part.match(/(\d+)\s*(h|m|min|s|sec)?/);
    if (!match) return null;
    const val = parseInt(match[1], 10);
    const unit = match[2] || "m";
    if (unit.startsWith("h")) ms += val * 3600_000;
    else if (unit.startsWith("m")) ms += val * 60_000;
    else if (unit.startsWith("s")) ms += val * 1000;
    else ms += val * 60_000; // default minutes
  }

  return ms > 0 ? ms : null;
}

/** Create a reminder entry. */
export function createReminder(durationMs, text) {
  const now = Date.now();
  return {
    id: `rem-${now}`,
    text,
    triggerAt: now + durationMs,
    createdAt: new Date(now).toISOString(),
  };
}

export default {
  async load(context) {
    ctx = context;
  },

  async activate(context) {
    ctx = context;

    // Restore persisted reminders
    const saved = (await ctx.brain.read("fact", "reminders")) || [];
    if (Array.isArray(saved)) {
      for (const r of saved) {
        const remaining = r.triggerAt - Date.now();
        if (remaining > 0) {
          scheduleReminder(r, remaining);
        }
      }
    }

    ctx.events.on("chat.message", async (message) => {
      if (typeof message !== "string") return;

      // /remind me in <duration> to <text>
      const inMatch = message.match(/^\/remind\s+(?:me\s+)?in\s+(\S+(?:\s+\d+\s*[hms])*)\s+(?:to\s+)?(.+)$/i);
      if (inMatch) {
        const durationMs = parseDuration(inMatch[1]);
        if (!durationMs) {
          ctx.chat.send('Could not parse duration. Use: /remind me in 30min to check nets');
          return;
        }
        const text = inMatch[2].trim();
        const reminder = createReminder(durationMs, text);
        scheduleReminder(reminder, durationMs);
        await persistReminders();
        const mins = Math.round(durationMs / 60_000);
        ctx.chat.send(`Reminder set: "${text}" in ${mins} minute${mins !== 1 ? "s" : ""}`);
        return;
      }

      // /reminders — list active
      if (message.match(/^\/reminders$/i)) {
        const saved = (await ctx.brain.read("fact", "reminders")) || [];
        if (!Array.isArray(saved) || saved.length === 0) {
          ctx.chat.send("No active reminders.");
          return;
        }
        // Filter to future only
        const now = Date.now();
        const active = saved.filter((r) => r.triggerAt > now);
        if (active.length === 0) {
          ctx.chat.send("No active reminders.");
          return;
        }
        const lines = active.map((r) => {
          const remaining = Math.round((r.triggerAt - now) / 60_000);
          return `- "${r.text}" (in ${remaining} min)`;
        });
        ctx.chat.send(`Active reminders:\n${lines.join("\n")}`);
      }
    });
  },

  async deactivate() {
    // Clear all timers
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    timers.clear();
    ctx = null;
  },
};

function scheduleReminder(reminder, delayMs) {
  const timer = setTimeout(async () => {
    try {
      ctx?.chat.send(`Reminder: ${reminder.text}`);
      // Remove from persisted list
      const saved = (await ctx?.brain.read("fact", "reminders")) || [];
      if (Array.isArray(saved)) {
        const updated = saved.filter((r) => r.id !== reminder.id);
        await ctx?.brain.write("fact", "reminders", updated);
      }
    } catch {
      // best effort
    }
    timers.delete(reminder.id);
  }, delayMs);

  timers.set(reminder.id, timer);
}

async function persistReminders() {
  if (!ctx) return;
  const saved = (await ctx.brain.read("fact", "reminders")) || [];
  const list = Array.isArray(saved) ? saved : [];
  // Add all scheduled that aren't already saved
  const existingIds = new Set(list.map((r) => r.id));
  for (const [id, _timer] of timers) {
    if (!existingIds.has(id)) {
      // Find the reminder from timers (we track them in a side-channel)
    }
  }
  await ctx.brain.write("fact", "reminders", list);
}
