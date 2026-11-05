---
title: Bloons
slug: bloons
group: Reference
order: 10
summary: Every bloon and MOAB-class blimp with RBE, HP, speed, immunities and the upgrades that counter it.
updated: 2026-11-05
gameVersion: "57.4"
related:
  - danger-rounds
  - rounds
  - boss-events
  - glossary
---

# Bloons

Speed is relative to a Red Bloon (1.0). **RBE** (Red Bloon Equivalent) is the number of single hits needed to pop a bloon and everything inside it.

## Regular bloons

| Bloon | RBE | HP | Speed | First round | Immune to | Pops into |
|---|---|---|---|---|---|---|
| Red | 1 | 1 | 1.0 | 1 | – | nothing |
| Blue | 2 | 1 | 1.4 | 3 | – | 1 Red |
| Green | 3 | 1 | 1.8 | 6 | – | 1 Blue |
| Yellow | 4 | 1 | 3.2 | 11 | – | 1 Green |
| Pink | 5 | 1 | 3.5 | 15 | – | 1 Yellow |
| Black | 11 | 1 | 1.8 | 20 | Explosions | 2 Pink |
| White | 11 | 1 | 2.0 | 22 | Freezing and cold | 2 Pink |
| Purple | 11 | 1 | 3.0 | 25 | Energy, fire, plasma (most magic) | 2 Pink |
| Zebra | 23 | 1 | 1.8 | 26 | Explosions and freezing | 1 Black + 1 White |
| Lead | 23 (fortified 26) | 1 (fortified 4) | 1.0 | 28 | Sharp attacks | 2 Black |
| Rainbow | 47 | 1 | 2.2 | 35 | – | 2 Zebra |
| Ceramic | 104 (fortified 114) | 10 (fortified 20) | 2.5 | 38 | – (but tanky) | 2 Rainbow |

"First round" is the standard round set. Alternate Bloons Rounds bring most types in far earlier: see [Danger Rounds](/guides/danger-rounds/).

Notes:
- **Yellow and Pink** outrun many early projectiles. Slow darts and bombs can miss them.
- **Purple** shuts down Wizards, most Super Monkey lasers and plasma, Tack fire paths (Hot Shots, Ring of Fire, Inferno Ring), Dartling laser paths and Dragon's Breath. Darts, Ninjas, Glaives, Subs and Spikes work fine.
- **Lead** blocks sharp projectiles, so it also soaks shots aimed at bloons behind it.
- **Ceramic** has a Red's hitbox and 10 HP. It is the main single-target check before blimps.

## MOAB-class

Base values, fortified in brackets. Only the outer layer's HP counts before it pops and releases its children.

| Blimp | RBE | HP | Speed | First round | Children | Notes |
|---|---|---|---|---|---|---|
| MOAB | 616 (856) | 200 (400) | 1.0 | 40 | 4 Ceramic | On Easy, the R40 MOAB has 2/3 HP (133) |
| BFB | 3,164 (4,824) | 700 (1,400) | 0.25 | 60 | 4 MOAB | Very slow, very tanky |
| ZOMG | 16,656 (27,296) | 4,000 (8,000) | 0.18 | 80 | 4 BFB | |
| DDT | 816 (1,256) | 400 (800) | 2.64 | 90 | 4 Camo Regrow Ceramic | Camo, Lead and Black properties. Higher Strong-targeting priority than a ZOMG |
| BAD | 55,760 (98,360) | 20,000 (40,000) | 0.18 | 100 | 2 ZOMG + 3 DDT | Immune to slows, stuns and knockback. The R100 BAD has 28,000 HP from the R81+ ramp |

- Every blimp shows 4 damage states.
- **Fortified passes down blimp chains.** A Fortified BFB drops Fortified MOABs, which drop Fortified Ceramics. Fortified regular bloons don't pass it on.
- Effects that only reach "up to BFB" skip DDTs, such as Abyssal Warrior's ink and [Psi](/heroes/psi/) before level 20. Small-blimp effects like the Monkey Pirates hook do work on DDTs.

## Properties

| Property | What it does | Counters |
|---|---|---|
| **Camo** | Only towers with camo detection can target it. Area and track effects (spikes, Mortar shells, explosions) still hit it. Standard R24, ABR R5 | See camo counters below |
| **Regrow** | Lost layers grow back to the original type. Doesn't apply to blimp layers | Pop it fast. Grow Blocker (Village 0-1-0) stops regrowth in its radius. Cleansing Foam (Engineer 0-3-0) is also used (regrow removal unverified) |
| **Fortified** | Lead, Ceramic and MOAB-class only. Doubles outer HP (Lead ×4) | More damage. Perishing Potions (Alchemist 0-2-0) removes it from non-blimps. Shattering Shells (Mortar 0-0-4) strips it |

## Counters by bloon type

**Camo**
- Built in: [Ninja Monkey](/monkeys/ninja/). [Monkey Sub](/monkeys/sub/) is a common early camo answer (built-in detection unverified).
- Upgrades: Enhanced Eyesight (Dart 0-0-2), Night Vision Goggles (Sniper 0-1-0), Monkey Sense (Wizard 0-0-2), Ultravision (Super Monkey 0-0-2), Crow's Nest (Buccaneer 0-0-2), Spy Plane (Ace 0-2-0), IFR (Heli 0-2-0), Cold Snap (Ice 2-0-0).
- For everything in range: Radar Scanner (Village 0-2-0).
- Decamo: Signal Flare (Mortar 0-0-3), Submerge and Support (Sub 3-0-0), Counter-Espionage (Ninja 0-2-0), Shimmer (Wizard 0-0-3), Embrittlement (Ice 4-0-0), Super Brittle (Ice 5-0-0).
- Hero: [Etienne](/heroes/etienne/)'s drones give camo detection to all towers.

**Lead**
- Built in: [Bomb Shooter](/monkeys/bomb/), [Mortar Monkey](/monkeys/mortar/).
- Upgrades: Juggernaut (Dart 4-0-0), Red Hot Rangs (Boomerang 0-0-2), Hot Shots (Tack 3-0-0), Full Metal Jacket (Sniper 1-0-0), Heat-tipped Darts (Sub 0-2-0), Hot Shot (Buccaneer 0-2-0), Flash Bomb (Ninja 0-0-3), Fireball (Wizard 0-1-0), Plasma Blasts (Super Monkey 2-0-0), White Hot Spikes (Spike Factory 2-0-0).
- For nearby towers: Acidic Mixture Dip (Alchemist 2-0-0), Monkey Intelligence Bureau (Village 0-3-0).
- Remove lead immunity: Glue Strike (Glue 0-4-0), Glue Storm (Glue 0-5-0).
- Hero: [Gwendolin](/heroes/gwendolin/)'s Heat It Up.

**Black and Zebra:** anything that isn't explosive. A bomb or Mortar defence needs a MIB or a non-explosive partner.

**White and Zebra:** anything that isn't cold. An ice-only defence can't touch them.

**Purple:** sharp and explosive damage: Dart, Ninja, Boomerang, Sub, Spike Factory, Bomb, Mortar, Sniper. Don't rely on Wizard, Tack fire paths or Super Monkey energy paths for R25, R45 and especially R95 (500 Camo Regrow Purples).

**DDT:** needs camo detection plus damage that isn't sharp or explosive, or immunity removal. Options: Acidic Mixture Dip, Gwendolin's Heat It Up, Radar Scanner, Etienne, Submerge and Support, Signal Flare, Glue Strike, Glue Storm, Embrittlement, Super Brittle, [Striker Jones](/heroes/striker/) (levels 5 and 19 remove Black immunity), MIB. Bloon Sabotage (Ninja 0-4-0) halves DDT speed.

**Blimps (common answers):**

| Tower | Upgrades |
|---|---|
| [Bomb Shooter](/monkeys/bomb/) | MOAB Mauler (0-3-x), MOAB Assassin (0-4-x, ability one-shots small blimps), MOAB Eliminator (0-5-x) |
| [Sniper Monkey](/monkeys/sniper/) | Large Calibre (2-x-x), Deadly Precision (3-x-x), Maim MOAB (4-x-x, stun), Cripple MOAB (5-x-x) |
| [Monkey Buccaneer](/monkeys/buccaneer/) | Destroyer (3-x-x), Carrier Flagship (5-x-x), Monkey Pirates hook (0-4-x) |
| [Boomerang Monkey](/monkeys/boomerang/) | MOAB Press (0-0-4, stall), MOAB Domination (0-0-5), Glaive Lord (5-x-x) |
| [Spike Factory](/monkeys/spike/) | MOAB SHREDR (0-3-x), Spike Storm (0-4-x), Perma-Spike (0-0-5) |
| [Dartling Gunner](/monkeys/dartling/) | Plasma Accelerator (4-x-x), Ray of Doom (5-x-x), M.A.D (0-5-x) |
| [Ninja Monkey](/monkeys/ninja/) | Sticky Bomb (0-0-4), Master Bomber (0-0-5) |
| [Monkey Sub](/monkeys/sub/) | First Strike Capability (0-4-x), Pre-emptive Strike (0-5-x) |
| [Alchemist](/monkeys/alchemist/) | Perishing Potions (0-2-x), Unstable Concoction (0-3-x) |
| [Glue Gunner](/monkeys/glue/) | MOAB Glue (0-0-3, slow), Super Glue (0-0-5), The Bloon Solver (5-x-x) |
| Hero | [Ezili](/heroes/ezili/)'s MOAB Hex (percentage damage) |

## Late rounds and Freeplay

**From R81:**
- Every Ceramic becomes a **Super Ceramic**: 60 HP (120 fortified), and it pops into only one child per layer.
- Non-blimp bloons generally spawn one child each.
- Pierce-heavy towers built for fat ceramic waves (Recursive Cluster, Ring of Fire, Crossbow Master) fall off.

**Speed ramp (all bloons):**

| Rounds | Speed |
|---|---|
| 1–80 | 1.0× |
| 81–100 | +2% per round, up to 1.4× |
| 101–150 | jumps to 1.6×, then +2% per round |
| 151–200 | jumps to 3.0×, then +2% per round |
| 201+ | jumps to 4.5×; 6.0× from 252 |

**MOAB-class HP ramp:**

| Rounds | Per round | Multiplier |
|---|---|---|
| 81–100 | +2% | 1.02× to 1.4× |
| 101–124 | +5% | 1.45× to 2.6× |
| 125–150 | +15% | 2.75× to 6.5× |
| 151–250 | +35% | 6.85× to 41.5× |
| 251–300 | +100% | 42.5× to 91.5× |

Stuns, slows and freezes get 10% shorter from R150, rising to 50% shorter from R350. R140 is a Fortified BAD with 200,000 HP. BADs come every round from R231, Fortified BADs from R251.

## Boss Bloons

Bloonarius, Lych, Vortex, Dreadbloon, Phayze, Blastapopoulos and Diamondback appear in weekly Boss Events. Their mechanics and counters are on the [Boss Events](/guides/boss-events/) page.

Frontier Legends (paid DLC) adds six more bloon types: Aura, Diamond, Dynamite, Glass, Retribution and Ringleader. Apart from the Diamond Bloons that Diamondback scatters, they don't appear in the base game.

---

Sources: Bloons Wiki, Bloons Fandom wiki.
