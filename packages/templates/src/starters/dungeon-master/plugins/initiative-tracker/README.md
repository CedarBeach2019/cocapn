# Initiative Tracker Plugin

Combat is the most mechanically complex part of D&D, and tracking initiative, HP, conditions, and turn order is the part that slows tables down the most. This plugin manages the full state of an active combat encounter — who goes when, how hurt they are, what conditions they're suffering, and whether they're standing or dying. The DM focuses on tactics and narrative; the plugin handles the bookkeeping.

## Features

### Initiative Management

Start combat by listing all participants with their initiative modifiers. The plugin rolls for everyone and sorts the order:

```
init:start Thorin +3, Lyra +4, Brother Cedric +1, Whisper +5, 4x Goblin +2, 1x Goblin Boss +3

→ Initiative Order (Round 1):
  19 — Whisper (d20: 14 + 5)
  17 — Goblin Boss (d20: 14 + 3)
  15 — Lyra (d20: 11 + 4)
  12 — Goblin 2 (d20: 10 + 2)
  11 — Thorin (d20: 8 + 3)
   9 — Goblin 1 (d20: 7 + 2)
   8 — Goblin 3 (d20: 6 + 2)
   6 — Brother Cedric (d20: 5 + 1)
   5 — Goblin 4 (d20: 3 + 2)

  ▶ Whisper's turn
```

Ties are broken by the participant's modifier (higher goes first), then by Dexterity score, then by a d20 roll-off.

### Turn Advancement

Advance through combat one turn at a time:

```
init:next
→ Round 1 — Goblin Boss's turn (HP: 22/22, Conditions: none)
```

The plugin automatically:
- Tracks the current round number
- Decrements condition durations (a condition set for "3 rounds" expires automatically)
- Announces when conditions expire
- Flags when a creature drops to 0 HP

### Hit Point Tracking

Modify HP as damage and healing happen during combat:

```
init:hp Goblin Boss -14
→ Goblin Boss: 22 → 8 HP (14 damage)

init:hp Thorin -25
→ Thorin: 38 → 13 HP (25 damage)

init:hp Brother Cedric +8
→ Brother Cedric: 0 → 8 HP (healing, no longer dying!)
```

When a creature drops to 0 HP:
- **PCs:** Switch to death save tracking mode (3 successes stabilize, 3 failures = death)
- **Monsters:** Marked as unconscious/dying; the DM decides if they're dead or dying

### Condition Management

Track all conditions with optional durations:

```
init:condition Thorin poisoned 3 rounds
→ Thorin: Poisoned (expires end of round 3)

init:condition Lyra restrained
→ Lyra: Restrained (no duration set — until removed)

init:condition Goblin Boss frightened -remove
→ Goblin Boss: Frightened removed
```

Supported conditions with their mechanical effects:

| Condition | Key Effect |
|-----------|------------|
| Blinded | Auto-fail sight checks, attacks have disadvantage, attacks against have advantage |
| Charmed | Can't attack charmer, charmer has advantage on social checks |
| Deafened | Auto-fail hearing checks |
| Exhaustion | Cumulative penalties (disadvantage on checks → speed halved → etc.) |
| Frightened | Disadvantage on checks/attacks while source is visible, can't move toward source |
| Grappled | Speed becomes 0 (unless grappler is incapacitated) |
| Incapacitated | Can't take actions or reactions |
| Invisible | Attacks against have disadvantage, your attacks have advantage |
| Paralyzed | Incapacitated, can't move or speak, auto-fail Str/Dex saves, attacks have advantage, melee hits are crits |
| Petrified | Transformed to stone, weight x10, resistant to all damage, ageless |
| Poisoned | Disadvantage on attack rolls and ability checks |
| Prone | Disadvantage on attacks, melee attacks have advantage, ranged have disadvantage, movement costs half speed to stand |
| Restrained | Speed 0, attacks have disadvantage, attacks against have advantage, disadvantage on Dex saves |
| Stunned | Incapacitated, can't move, auto-fail Str/Dex saves, attacks against have advantage |
| Unconscious | Incapacitated, can't move or speak, drops prone, auto-fail Str/Dex saves, attacks have advantage, melee hits are crits |

### Death Save Tracking

When a PC drops to 0 HP, the plugin automatically tracks death saves:

```
init:deathsave Thorin
→ d20: 7 — Failure (1/3 failures)

init:deathsave Thorin
→ d20: 15 — Success (1/3 successes)

init:deathsave Thorin
→ d20: 18 — Success (2/3 successes)

init:deathsave Thorin
→ d20: 12 — Success (3/3 successes — Thorin is stable!)
```

Critical hits on death saves (natural 1) count as two failures. Natural 20s restore 1 HP.

### Mid-Combat Additions and Removals

Reinforcements arrive, summons appear, creatures flee or die:

```
init:add Orc Reinforcement 8 30
→ Orc Reinforcement added at initiative 8 (HP: 30)

init:remove Goblin 3
→ Goblin 3 removed from initiative
```

### Encounter Summary

When combat ends, log a complete summary:

```
init:end
→ Combat Complete!
  Duration: 6 rounds
  Party damage dealt: 187
  Party damage taken: 94
  Enemies defeated: 5 (4 Goblins, 1 Goblin Boss)
  Conditions inflicted: 3 (2 poisoned, 1 restrained)
  Highlights: Thorin critical hit on Goblin Boss (Round 4), Whisper stabilized Brother Cedric (Round 3)
  Status: All party members conscious.
```

## Commands

| Command | What it does |
|---------|-------------|
| `init:start <participants>` | Roll initiative for all and begin combat |
| `init:next` | Advance to next turn |
| `init:current` | Show initiative order and current turn |
| `init:hp <name> <+/-> <amount>` | Modify a creature's hit points |
| `init:condition <name> <condition> [duration]` | Add/remove a condition |
| `init:add <name> <init> <hp>` | Add creature mid-combat |
| `init:remove <name>` | Remove creature from order |
| `init:end` | End encounter and log summary |

## Data Storage

Combat state is stored in the brain's memory system under the `combat` namespace:

- **Active encounter:** Stored as a fact under `combat.active` with the full initiative order, round number, current turn, and all HP/condition state.
- **Encounter history:** Each completed encounter is stored as a memory entry with type `combat`, including the summary, round count, and key moments.
- **Cumulative stats:** Facts under `stats.combat.*` track total encounters, total rounds, enemies defeated, and party damage across the campaign.

## Tips for Best Results

1. **Start with the full participant list.** Providing all combatants at once means the plugin rolls all initiative and sorts immediately. Adding one at a time is supported but slower.
2. **Name monsters uniquely.** Use "Goblin 1", "Goblin 2" etc. rather than just "Goblin" — the tracker needs unique names to track HP and conditions individually.
3. **Set condition durations when possible.** "Poisoned 3 rounds" is better than "Poisoned" because it auto-expires. If you don't know the duration, set it without one and remove it manually.
4. **End encounters explicitly.** Running `init:end` clears the active combat state and logs the summary. If you forget, the plugin will prompt you next time you start a new encounter.
5. **Log death saves through the tracker.** Rather than rolling a d20 separately, use `init:deathsave <name>` — it tracks successes and failures and announces stabilization or death automatically.
