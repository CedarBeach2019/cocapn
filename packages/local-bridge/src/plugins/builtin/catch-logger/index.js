/**
 * catch-logger plugin — log fishing catches via /catch command.
 * Usage: /catch bass 5.2 "Horseshoe Bay"
 * Stores catches as brain facts and can list recent catches.
 */

let ctx = null;

/** Parse a catch command: /catch <species> <weight> [location] */
export function parseCatch(args) {
  // /catch species weight [location]
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const species = parts[0].toLowerCase();
  const weight = parseFloat(parts[1]);
  if (isNaN(weight) || weight <= 0) return null;

  let location = "unknown";
  if (parts.length >= 3) {
    // Remaining parts form location, strip quotes if present
    const locParts = parts.slice(2).join(" ");
    location = locParts.replace(/^["']|["']$/g, "");
  }

  return {
    species,
    weight,
    location,
    timestamp: new Date().toISOString(),
  };
}

/** Format a catch entry. */
export function formatCatch(entry) {
  const units = ctx ? ctx.config.get("units") || "lbs" : "lbs";
  const date = new Date(entry.timestamp).toLocaleDateString();
  return `${entry.species} — ${entry.weight} ${units} at ${entry.location} (${date})`;
}

export default {
  async load(context) {
    ctx = context;
  },

  async activate(context) {
    ctx = context;
    ctx.events.on("chat.message", async (message) => {
      if (typeof message !== "string") return;

      // /catch species weight [location]
      const catchMatch = message.match(/^\/catch\s+(.+)$/i);
      if (catchMatch) {
        const parsed = parseCatch(catchMatch[1]);
        if (!parsed) {
          ctx.chat.send("Usage: /catch <species> <weight> [location] — e.g. /catch bass 5.2 Horseshoe");
          return;
        }

        // Read existing catches
        const existing = (await ctx.brain.read("fact", "catches")) || [];
        if (!Array.isArray(existing)) {
          // Corrupt data, reset
        }
        const catches = Array.isArray(existing) ? existing : [];
        catches.push(parsed);

        // Keep last 100
        if (catches.length > 100) catches.splice(0, catches.length - 100);

        await ctx.brain.write("fact", "catches", catches);
        ctx.chat.send(`Logged: ${formatCatch(parsed)}`);
        return;
      }

      // /catches — list recent catches
      const listMatch = message.match(/^\/catches(?:\s+(\d+))?$/i);
      if (listMatch) {
        const limit = listMatch[1] ? parseInt(listMatch[1], 10) : 10;
        const catches = (await ctx.brain.read("fact", "catches")) || [];
        if (!Array.isArray(catches) || catches.length === 0) {
          ctx.chat.send("No catches logged yet.");
          return;
        }
        const recent = catches.slice(-limit);
        const lines = recent.map(formatCatch);
        ctx.chat.send(`Recent catches:\n${lines.join("\n")}`);
        return;
      }

      // /catch-stats
      if (message.match(/^\/catch-stats$/i)) {
        const catches = (await ctx.brain.read("fact", "catches")) || [];
        if (!Array.isArray(catches) || catches.length === 0) {
          ctx.chat.send("No catches logged yet.");
          return;
        }
        const speciesCount = {};
        let totalWeight = 0;
        for (const c of catches) {
          speciesCount[c.species] = (speciesCount[c.species] || 0) + 1;
          totalWeight += c.weight;
        }
        const topSpecies = Object.entries(speciesCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([s, n]) => `${s} (${n})`)
          .join(", ");
        ctx.chat.send(`Total: ${catches.length} catches, ${totalWeight.toFixed(1)} lbs\nTop species: ${topSpecies}`);
      }
    });
  },

  async deactivate() {
    ctx = null;
  },
};
