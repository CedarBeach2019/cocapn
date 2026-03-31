# Encounter Builder

> *"A good encounter is one the players remember — not because it was hard, but because it mattered."*

Building balanced encounters is part math, part instinct, and part knowing your table. This guide covers the D&D 5e encounter-building system from the ground up, with practical tips for making fights that feel right.

## Difficulty Thresholds

Every encounter has a difficulty rating based on the party's level and size. The Encounter XP thresholds determine how much adjusted XP an encounter needs to qualify:

| Level | Easy | Medium | Hard | Deadly |
|-------|------|--------|------|--------|
| 1 | 25 | 50 | 75 | 100 |
| 2 | 50 | 100 | 150 | 200 |
| 3 | 75 | 150 | 225 | 400 |
| 4 | 125 | 250 | 375 | 500 |
| 5 | 250 | 500 | 750 | 1,100 |
| 6 | 300 | 600 | 900 | 1,400 |
| 7 | 350 | 750 | 1,100 | 1,700 |
| 8 | 450 | 900 | 1,400 | 2,100 |
| 9 | 550 | 1,100 | 1,600 | 2,400 |
| 10 | 600 | 1,200 | 1,900 | 2,800 |
| 11 | 800 | 1,600 | 2,400 | 3,600 |
| 12 | 1,000 | 2,000 | 3,000 | 4,500 |
| 13 | 1,100 | 2,200 | 3,400 | 5,100 |
| 14 | 1,250 | 2,500 | 3,800 | 5,700 |
| 15 | 1,400 | 2,800 | 4,300 | 6,400 |
| 16 | 1,600 | 3,200 | 4,800 | 7,200 |
| 17 | 2,000 | 3,900 | 5,900 | 8,800 |
| 18 | 2,100 | 4,200 | 6,300 | 9,500 |
| 19 | 2,400 | 4,900 | 7,300 | 10,900 |
| 20 | 2,800 | 5,700 | 8,500 | 12,700 |

These are **per character**. Multiply by party size to get the total threshold.

## Building an Encounter Step by Step

### Step 1: Choose the Difficulty

Match the difficulty to the narrative moment:

- **Easy** — Speed bumps, attrition fights, confidence builders. The party spends resources but is never in real danger.
- **Medium** — The default. Costs hit points and spell slots. Some tension. The party usually wins without a death.
- **Hard** — Boss fights, climactic encounters. A character might drop to 0 HP. Requires tactical play.
- **Deadly** — The climactic boss, the fight that could go very wrong. A character could die. Use sparingly and only when the story demands it.

### Step 2: Calculate the XP Budget

```
XP Threshold = (Per-character threshold) x (Party size)
```

For a party of 4 level-5 characters aiming for a Hard encounter:
```
750 XP x 4 = 3,000 XP threshold
```

### Step 3: Pick Monsters Within Budget

Each monster has an XP value based on its Challenge Rating (CR):

| CR | XP | CR | XP | CR | XP |
|----|------|----|------|----|------|
| 0 | 10 | 7 | 2,900 | 14 | 11,500 |
| 1/8 | 25 | 8 | 3,900 | 15 | 13,000 |
| 1/4 | 50 | 9 | 5,000 | 16 | 15,000 |
| 1/2 | 100 | 10 | 5,900 | 17 | 18,000 |
| 1 | 200 | 11 | 7,200 | 18 | 20,000 |
| 2 | 450 | 12 | 8,400 | 19 | 22,000 |
| 3 | 700 | 13 | 10,000 | 20 | 25,000 |
| 4 | 1,100 | | | 21 | 33,000 |
| 5 | 1,800 | | | 22 | 41,000 |
| 6 | 2,300 | | | 23 | 50,000 |

### Step 4: Apply the Encounter Multiplier

More monsters = more danger. Multiply total monster XP by this factor:

| Monsters | Multiplier |
|----------|------------|
| 1 | x1 |
| 2 | x1.5 |
| 3-6 | x2 |
| 7-10 | x2.5 |
| 11-14 | x3 |
| 15+ | x4 |

**Adjusted XP = (Total Monster XP) x (Multiplier)**

Compare adjusted XP to your threshold to determine final difficulty.

### Example: Building an Encounter

Party: 4 characters at level 5. Target: Hard (3,000 XP threshold).

Option A — Single boss: 1 x Young Green Dragon (CR 8, 3,900 XP)
- Adjusted XP = 3,900 x 1 = 3,900 (Hard, approaching Deadly)

Option B — Boss + minions: 1 x Worg (CR 1/2, 100 XP) + 4 x Goblin Boss (CR 1, 200 XP)
- Total XP = 100 + 800 = 900
- 5 monsters = x2 multiplier
- Adjusted XP = 900 x 2 = 1,800 (Medium)

Option C — Mixed threat: 1 x Ogre (CR 2, 450 XP) + 2 x Hobgoblins (CR 1, 200 XP) + 4 x Goblins (CR 1/4, 50 XP)
- Total XP = 450 + 400 + 200 = 1,050
- 7 monsters = x2.5 multiplier
- Adjusted XP = 1,050 x 2.5 = 2,625 (Hard)

## Encounter Design Principles

### Action Economy Matters More Than CR

The side with more actions per round usually wins. Four goblins (CR 1/4) are more dangerous than one bugbear (CR 1) because:

- 4 attacks per round vs 1 attack
- Harder to focus fire
- More tactical options (flanking, surrounding, objectives)
- The party must split attention

**Rule of thumb:** An encounter with more enemies than the party has members is always harder than the math suggests.

### The Daily XP Budget

Adventuring Day XP budget per character (DMG p. 84):

| Level | Daily XP |
|-------|----------|
| 1 | 300 |
| 5 | 3,500 |
| 10 | 9,000 |
| 15 | 17,000 |
| 20 | 28,000 |

A full adventuring day should include 6-8 medium-hard encounters plus short rests. This matters because it determines how many resources the party should be spending per fight.

### Mix Encounter Types

Not every fight is two sides slogging it out:

| Type | Description | Example |
|------|-------------|---------|
| **Stand-up fight** | Straight combat, both sides aware | Ambush in a clearing |
| **Ambush** | One side surprised | Goblins drop from trees |
| **Chase** | One side fleeing, the other pursuing | Escaping a collapsing dungeon |
| **Defense** | Protect a point, NPC, or object | Guard the ritual circle |
| **Timed** | Complete before a deadline | Kill the boss before reinforcements arrive |
| **Puzzle** | Combat + environmental puzzle | Fight while solving the glyph sequence |
| **Social under fire** | Negotiation during combat | Convince the guard captain while orcs attack |
| **Running battle** | Multiple small fights during movement | Fighting through a goblin warren room by room |

### Environmental Considerations

The battlefield is a combatant. Use terrain to make fights interesting:

- **Cover:** Half cover (+2 AC), three-quarters cover (+5 AC). Monsters with low AC become viable when they have cover.
- **Elevation:** High ground gives ranged advantage and melee disadvantage against those below.
- **Hazards:** Lava pools, poison gas, unstable ground, swinging blades. Force movement effects shine here.
- **Chokepoints:** Doorways, narrow bridges, staircases. Control positioning and make small numbers feel powerful.
- **Destructible objects:** Pillars that collapse, barrels that explode, rope bridges that can be cut.
- **Lighting:** Darkness limits ranged combat and enables stealth. Dim light gives disadvantage on Perception.

## Scaling Encounters Up and Down

### Adding or Removing Players

For each player beyond 4, add one monster of equivalent CR to the encounter. For parties of 3 or fewer, reduce monster count by one or drop the boss CR by 1-2.

### Adjusting Mid-Fight

If the fight is too easy:

- Reinforcements arrive (roll initiative for them)
- A monster uses a tactic it was holding back (lair actions, legendary actions)
- The environment shifts (ceiling starts collapsing, water rises)
- A monster flees and returns with allies

If the fight is too hard:

- Monsters make suboptimal choices (attack the tank instead of the downed wizard)
- Reinforcements that were coming don't arrive (they heard the fight and fled)
- A monster surrenders or flees when bloodied
- An environmental advantage appears (collapsing wall separates the party from half the enemies)

**Do not fudge dice.** Adjust the situation instead. Players notice fudged dice and it undermines trust.

## Quick Reference: Encounters by Party Level

### Levels 1-4 (Local Heroes)

**Easy encounters:** Skeletons, zombies, goblins, kobolds, giant rats, bandits
**Medium encounters:** Goblin boss + goblins, bugbear + wolves, ochre jelly, mimic
**Hard encounters:** Owlbear, gelatinous cube, gnoll pack lord + hyenas, ogre
**Deadly encounters:** Young green dragon (level 4 party), mummy, basilisk, bulette

### Levels 5-10 (Heroes of the Realm)

**Easy encounters:** Ogres, trolls, wights, hell hounds, ettins
**Medium encounters:** Young dragon, vampire spawn + thralls, mind flayer, chimera
**Hard encounters:** Adult white dragon, beholder (level 10), lich (level 10 with minions)
**Deadly encounters:** Adult red dragon (level 10), death knight, iron golem + support

### Levels 11-16 (Masters of the Realm)

**Easy encounters:** Fire giants, behirs, revenants, young dragons
**Medium encounters:** Adult dragons, liches (with support), balor (level 16)
**Hard encounters:** Ancient brass dragon, kraken, ancient green dragon
**Deadly encounters:** Ancient red dragon, tarrasque (level 16+ party), Orcus (level 20)

### Levels 17-20 (Masters of the World)

At this tier, raw CR becomes less useful. Encounters should involve legendary monsters, lair actions, mythic forms, and environmental storytelling. The challenge comes from stakes, time pressure, and moral complexity — not just damage output.
