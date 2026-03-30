/**
 * dice-roller plugin — parses /roll commands and returns dice results.
 * Supports: /roll d20, /roll 2d6+3, /roll 4d8-2, /roll d100
 */

/** Parse a dice expression like "2d6+3" or "d20". */
export function parseDice(expr) {
  const match = expr.trim().toLowerCase().match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!match) return null;
  return {
    count: match[1] ? parseInt(match[1], 10) : 1,
    sides: parseInt(match[2], 10),
    modifier: match[3] ? parseInt(match[3], 10) : 0,
  };
}

/** Roll a single die with `sides` faces. */
function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

/** Roll dice and return the result. */
export function rollDice(expr) {
  const parsed = parseDice(expr);
  if (!parsed) return null;

  if (parsed.count < 1 || parsed.count > 100) return null;
  if (parsed.sides < 2 || parsed.sides > 1000) return null;

  const rolls = [];
  for (let i = 0; i < parsed.count; i++) {
    rolls.push(rollDie(parsed.sides));
  }

  const sum = rolls.reduce((a, b) => a + b, 0) + parsed.modifier;
  return {
    expression: expr,
    rolls,
    modifier: parsed.modifier,
    total: sum,
  };
}

/** Format a roll result as a readable string. */
export function formatRoll(result) {
  const parts = [`Rolling ${result.expression}:`];
  if (result.rolls.length === 1 && result.modifier === 0) {
    parts.push(`**${result.total}**`);
  } else {
    const rollStr = result.rolls.join(", ");
    const modStr = result.modifier > 0 ? ` + ${result.modifier}` : result.modifier < 0 ? ` - ${Math.abs(result.modifier)}` : "";
    parts.push(`[${rollStr}]${modStr} = **${result.total}**`);
  }
  return parts.join(" ");
}

let ctx = null;

export default {
  async load(context) {
    ctx = context;
  },

  async activate(context) {
    ctx = context;
    ctx.events.on("chat.message", (message) => {
      if (typeof message !== "string") return;

      const match = message.match(/^\/roll\s+(.+)$/i);
      if (!match) return;

      const expr = match[1].trim();
      const result = rollDice(expr);
      if (!result) {
        ctx.chat.send(`Invalid dice expression: "${expr}". Try /roll d20 or /roll 2d6+3`);
        return;
      }
      ctx.chat.send(formatRoll(result));
    });
  },

  async deactivate() {
    ctx = null;
  },
};
