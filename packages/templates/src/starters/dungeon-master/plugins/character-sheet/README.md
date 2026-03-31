# Character Sheet Plugin

A living character sheet that never gets lost between sessions. This plugin tracks the full mechanical state of every player character and important NPC — ability scores, HP, AC, spell slots, inventory, gold, experience, and class-specific resources like Ki points, Rage, and Bardic Inspiration. When a player says "how many spell slots do I have left?" the answer is instant.

## Features

### Full Character Tracking

Every character sheet stores:

**Identity:**
- Name, race, class, subclass, level, background, alignment
- Experience points and level progression

**Ability Scores:**
- All six ability scores with automatically calculated modifiers
- Proficiency bonus (auto-scales with level)

**Combat Stats:**
- Current HP, maximum HP, and temporary HP
- Armor Class (including equipped armor and shield)
- Initiative modifier
- Movement speed (all types: walk, swim, fly, climb)
- Hit dice (type and current/maximum)

**Saving Throws:**
- All six saves with proficiency indicators
- Auto-calculated values: modifier + proficiency (if proficient)

**Skills:**
- All 18 skills with proficiency and expertise tracking
- Auto-calculated passive scores (Passive Perception = 10 + Wis mod + proficiency)

**Class Resources:**
- Spell slots by level (current/maximum) for all full, half, and third-casters
- Monk Ki points and Martial Arts die
- Barbarian Rage uses and damage bonus
- Rogue Sneak Attack dice
- Paladin Lay on Hands pool and Channel Divinity
- Fighter Action Surge and Second Wind
- Bard Bardic Inspiration uses and die size
- Warlock pact slots and Mystic Arcanum

**Inventory:**
- All carried items with quantity
- Attuned magic items (max 3)
- Currency: gold, silver, copper, electrum, platinum
- Encumbrance tracking (optional)

**Death Saves:**
- Successes and failures (reset on stabilization, healing, or long rest)

### Creating a Character

Create a new character with the essential information:

```
char:create Thorin Dwarf Fighter 5 STR:18 DEX:12 CON:16 INT:8 WIS:10 CHA:14

→ Character created: Thorin
  Race: Mountain Dwarf | Class: Fighter (Champion) | Level: 5
  HP: 49/49 | AC: 18 (Chain Mail + Shield) | Speed: 25 ft
  Hit Dice: 5d10 | Proficiency: +3
  STR +4 | DEX +1 | CON +3 | INT -1 | WIS +0 | CHA +2
  Saves: Str +7, Con +6 (proficient)
  Resources: Action Surge (1/1), Second Wind (1/1)
```

The plugin auto-calculates derived stats from the provided ability scores and class. Proficiency bonus is set based on level.

### Viewing a Character

Display the full sheet or a quick summary:

```
char:show Thorin

→ ╔══════════════════════════════════════╗
  ║  THORIN — Dwarf Fighter 5           ║
  ╠══════════════════════════════════════╣
  ║  HP: 38/49  AC: 18  Speed: 25 ft    ║
  ║  Hit Dice: 3/5 d10                  ║
  ║  Proficiency: +3                    ║
  ╠══════════════════════════════════════╣
  ║  STR 18 (+4)  Save: +7  ●          ║
  ║  DEX 12 (+1)  Save: +1             ║
  ║  CON 16 (+3)  Save: +6  ●          ║
  ║  INT  8 (-1)  Save: -1             ║
  ║  WIS 10 (+0)  Save: +0             ║
  ║  CHA 14 (+2)  Save: +2             ║
  ╠══════════════════════════════════════╣
  ║  Resources:                         ║
  ║  Action Surge: 1/1                  ║
  ║  Second Wind: 1/1                   ║
  ║  Extra Attack: Yes                  ║
  ╠══════════════════════════════════════╣
  ║  Inventory:                         ║
  ║  Longsword, Shield, Chain Mail      ║
  ║  Handaxe (2), Potion of Healing (3) ║
  ║  Gold: 127                          ║
  ║  Attuned: Gauntlets of Ogre Power   ║
  ╚══════════════════════════════════════╝
```

### Updating Characters During Play

Modify any field in real time as the session progresses:

```
char:update Thorin hp 32/49
→ Thorin HP updated: 38 → 32/49 (took 6 damage)

char:update Thorin tempHp 5
→ Thorin temporary HP: 5

char:update Lyra ac 16
→ Lyra AC updated: 15 → 16 (Shield spell active)
```

### Spell Slot Tracking

Track spell slot usage and recovery for all caster types:

```
char:spellslots Lyra
→ Lyra (Wizard 5) Spell Slots:
  1st: 3/4 | 2nd: 2/3 | 3rd: 1/2

char:spellslots Lyra 3 use
→ Lyra used a 3rd-level spell slot. 3rd level: 0/2 remaining.

char:spellslots Lyra 3 recover
→ Lyra recovered a 3rd-level spell slot. 3rd level: 1/2 remaining.
```

Warlock pact magic slots are tracked separately and auto-recover on short rest.

### Inventory Management

Add and remove items, track quantities and attunement:

```
char:inventory Thorin add Potion of Healing x2
→ Added 2x Potion of Healing to Thorin's inventory (now 5 total)

char:inventory Thorin use Potion of Healing
→ Thorin used a Potion of Healing (4 remaining). Regained 2d4+2 HP.

char:inventory Thorin add Flame Tongue Longsword --attune
→ Added Flame Tongue Longsword to Thorin's inventory (attuned)
  Attuned items: 1/3 — Gauntlets of Ogre Power, Flame Tongue Longsword
```

### Rest Mechanics

Apply short or long rests to restore resources according to D&D 5e rules:

**Short Rest:**
```
char:rest Thorin short
→ Thorin takes a short rest.
  Recovered: Second Wind (1/1)
  Hit Dice available: 3d10. Spend hit dice to recover HP?
```

**Long Rest:**
```
char:rest party long
→ Party takes a long rest.
  Thorin: HP restored to 49/49. Hit dice recovered: 2 (now 5/5).
  Lyra: HP restored to 28/28. All spell slots restored.
  Brother Cedric: HP restored to 35/35. All spell slots restored. Channel Divinity restored.
  Whisper: HP restored to 31/31. Hit dice recovered.

  All party death saves reset.
```

### Level Up

Advance a character to the next level with appropriate HP, features, and resources:

```
char:levelup Thorin
→ Thorin levels up! Fighter 5 → Fighter 6
  HP gained: 6 (average d10 + CON mod). New max HP: 55.
  New feature: Extra Attack (2nd attack on Attack action)
  Hit dice: 6d10
  Proficiency bonus: +3 (unchanged)
```

### Listing Characters

See all tracked characters at a glance:

```
char:list
→ Tracked Characters:
  Thorin — Dwarf Fighter 5 (HP: 38/49, AC: 18)
  Lyra — Elf Wizard 5 (HP: 22/28, AC: 15)
  Brother Cedric — Human Cleric 5 (HP: 35/35, AC: 16)
  Whisper — Halfling Rogue 5 (HP: 31/31, AC: 15)
```

## Commands

| Command | What it does |
|---------|-------------|
| `char:create <details>` | Create a new character sheet |
| `char:show <name>` | Display full character sheet |
| `char:update <name> <field> <value>` | Update a specific stat |
| `char:spellslots <name> [level] [use/recover]` | Track spell slot usage |
| `char:inventory <name> <add/remove/use> <item>` | Manage inventory |
| `char:levelup <name>` | Level up a character |
| `char:list` | List all tracked characters |
| `char:rest <name/party> <short/long>` | Apply rest and recover resources |

## Data Storage

Character data is stored in the brain's memory system under the `characters` namespace:

- **Each character** is a fact under `characters.<name>` containing the full JSON sheet.
- **Level-up history** is stored as memory entries with type `levelup` including what changed.
- **Session changes** (HP lost, items used, spells cast) are tracked per session for recovery audits.

## Tips for Best Results

1. **Create characters before the first session.** Having all four PCs entered before Session 1 means the DM has instant access to every stat during play.
2. **Update HP after every hit.** The tracker is only as accurate as its latest update. Get in the habit of calling `char:update Thorin hp 32/49` right after the goblin hits.
3. **Use the rest command at the table.** Rather than manually resetting HP, spell slots, and resources, one `char:rest party long` does it all.
4. **Track NPC stats too.** Important recurring NPCs (allies, rivals, villains) can have character sheets. `char:show Mayor Torman` is faster than flipping through notes.
5. **Let players check their own sheets.** Players can ask "how many hit dice do I have?" or "what's my passive perception?" — the DM's agent has the answer instantly.
