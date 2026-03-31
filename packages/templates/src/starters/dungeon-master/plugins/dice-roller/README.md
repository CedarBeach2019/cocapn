# Dice Roller Plugin

The clatter of dice is the heartbeat of every tabletop game. This plugin handles any dice expression you can throw at it — from a simple d20 ability check to the cascading damage of a 8d6 fireball plus 3d8 sneak attack plus 5 Dexterity modifier. It understands advantage, disadvantage, critical hits, exploding dice, and keeps a history of every roll so you can audit the session afterward.

## Features

### Standard Dice Notation

Supports the full D&D dice notation system:

| Notation | Meaning | Example |
|----------|---------|---------|
| `d20` | Roll one 20-sided die | `d20` → 14 |
| `2d6` | Roll two 6-sided dice, sum them | `2d6` → 3 + 5 = 8 |
| `1d20+5` | Roll d20, add modifier | `1d20+5` → 14 + 5 = 19 |
| `2d20kh1` | Roll 2d20, keep highest (advantage) | `2d20kh1` → max(8, 17) = 17 |
| `2d20kl1` | Roll 2d20, keep lowest (disadvantage) | `2d20kl1` → min(8, 17) = 8 |
| `4d6dl1` | Roll 4d6, drop lowest (ability score) | `4d6dl1` → 3+5+6 = 14 (dropped 1) |
| `8d6!` | Exploding dice — reroll and add on max | `8d6!` → rerolls any 6s |
| `1d6ro1` | Reroll once if 1 (brutal weapon) | `1d6ro1` → rerolls if 1 appears |

### Attack Rolls

Roll an attack with automatic advantage/disadvantage handling and critical hit detection:

```
roll:attack +7
→ d20(14) + 7 = 21

roll:attack +5 advantage
→ d20(8), d20(17) → keep 17 + 5 = 22

roll:attack +3 disadvantage
→ d20(15), d20(4) → keep 4 + 3 = 7
```

Natural 20s are flagged as critical hits with a clear indicator. Natural 1s are flagged as critical misses.

### Damage Rolls

Roll damage with optional critical hit doubling:

```
roll:damage 2d6+3
→ [4, 6] + 3 = 13 slashing damage

roll:damage 2d6+3d8+5 critical
→ [4, 6, 3, 6, 1, 8, 5, 3] + 5 = 41 damage (dice doubled for crit)
```

On a critical hit, the plugin doubles the number of dice in the expression but does not double static modifiers, matching the standard D&D 5e rule.

### Ability Score Generation

Generate a complete set of six ability scores using the 4d6-drop-lowest method:

```
roll:stats
→ STR: 15 (4d6: 5+4+6 drop 2)
  DEX: 12 (4d6: 3+4+5 drop 1)
  CON: 14 (4d6: 4+5+5 drop 3)
  INT: 10 (4d6: 2+3+5 drop 1)
  WIS: 13 (4d6: 3+5+5 drop 2)
  CHA: 8  (4d6: 1+3+4 drop 1)
  Total: 72
```

### Fate Rolls

For narrative moments when the dice tell a story, not just a number:

```
roll:fate stealth check sneaking past the dragon
→ d20: 1 — CRITICAL FAILURE. The dragon's eye opens. It heard you. It definitely heard you.
```

```
roll:fate persuasion convincing the guard to let you pass
→ d20: 20 — CRITICAL SUCCESS. The guard not only lets you pass, they salute and ask if there's anything else you need.
```

Fate rolls add narrative flavor based on the result range: 1 (disaster), 2-5 (failure with complication), 6-9 (failure), 10-14 (mixed success), 15-19 (success), 20 (triumph).

### Roll History

Every roll is recorded with a timestamp, the expression, the individual dice results, and the total. Query recent history to audit a session or settle disputes:

```
roll:history 5
→ [14:32] d20+5 → [14] + 5 = 19 (attack roll)
  [14:33] 2d6+3 → [4, 6] + 3 = 13 (damage)
  [14:35] d20+2 → [8] + 2 = 10 (saving throw)
  [14:36] d20+7 advantage → [3, 18] → 18 + 7 = 25 (attack)
  [14:37] 3d8+5 → [6, 8, 2] + 5 = 21 (sneak attack)
```

## Commands

| Command | What it does |
|---------|-------------|
| `roll <expression>` | Roll any dice expression |
| `roll:attack [mod] [advantage/disadvantage]` | Attack roll with crit detection |
| `roll:damage <expression> [critical]` | Damage roll with optional crit doubling |
| `roll:stats [method]` | Generate ability scores |
| `roll:history [count]` | Show recent rolls |
| `roll:fate [context]` | Narrative d20 roll with flavor text |

## Dice Expression Reference

The plugin supports these operations in dice expressions:

- **NdN** — Roll N dice with N sides
- **+N / -N** — Add or subtract a modifier
- **khN** — Keep the highest N rolls
- **klN** — Keep the lowest N rolls
- **dhN** — Drop the highest N rolls
- **dlN** — Drop the lowest N rolls
- **roN** — Reroll once if result is N or lower
- **!** — Exploding dice (reroll and add on maximum value)
- **Combine** — Chain expressions: `2d6+1d8+5` works as expected

## Data Storage

Roll history is stored in the brain's memory system under the `rolls` namespace:

- Each roll is a memory entry with type `roll`, confidence `1.0` (explicit, deterministic), and tags for the roll type (attack, damage, save, check).
- Session statistics (total rolls, average d20 result, natural 20s, natural 1s) are stored as facts under `stats.rolls.*`.

## Tips for Best Results

1. **Use named rolls during combat.** `roll:attack +7 advantage` is clearer than `roll 2d20kh1+7` — the plugin handles the translation.
2. **Roll damage as a full expression.** `roll:damage 2d6+3d8+5` gives you one total. Don't roll weapon and sneak attack separately unless you want to see individual results.
3. **Let the plugin track crits.** Use `roll:damage 2d6+5 critical` instead of manually doubling the dice yourself.
4. **Check roll history at session end.** A quick `roll:history 50` at the end of a session can catch math errors and settle any disputes about what was rolled.
