---
title: Bloons
slug: bloons
group: Reference
order: 10
summary: Every bloon and MOAB-class blimp with RBE, HP, speed, immunities and the upgrades that counter it.
updated: 2026-11-06
gameVersion: "57.4"
related:
  - danger-rounds
  - rounds
  - boss-events
  - glossary
---

# Bloons

Speed is relative to a Red Bloon (1.0). **RBE** (Red Bloon Equivalent) is the number of single hits needed to pop a bloon and everything inside it.

## Damage types: who can't pop what

Every attack has a damage type. A bloon is immune to some types, never to damage as such.

| Damage type | Can't damage | Typical users |
|---|---|---|
| Sharp | Lead, Frozen | Darts, tacks, shurikens, thorns, base Sniper |
| Explosion | Black (so Zebra and DDT too) | Bomb Shooter, Mortar, Flash Bomb, pineapples |
| Cold | Lead, White (Zebra) | Ice Monkey base attack |
| Glacier | White (Zebra) | Cold Snap (Ice 2-0-0) |
| Shatter | Lead | Powerful Darts (Dartling 0-0-2), Mermonkey splash, Bloontonium Reactor |
| Energy | Lead, Purple | Wizard bolts, Laser Blasts, Laser Cannon |
| Plasma | Purple | Plasma Blasts, Arcane Spike, Plasma Accelerator, Obyn, Adora |
| Fire | Purple | Fireball, Dragon's Breath, Ring of Fire, Hot Shot grapes |
| Normal | nothing | Juggernaut, Full Metal Jacket, Razor Rotors, White Hot Spikes, Hydra Rocket Pods |
| Acid | nothing | Alchemist, Corrosive Glue |

There is no "magic" damage type: Wizards deal Energy, which is why a 0-0-0 Wizard pops Frozen but not Lead or Purple. Per-tower answers for every crosspath are in `data/pop-model.json`.

## Regular bloons

| Bloon | RBE | HP | Speed | First round | Immune to | Pops into |
|---|---|---|---|---|---|---|
| Red | 1 | 1 | 1.0 | 1 | – | nothing |
| Blue | 2 | 1 | 1.4 | 3 | – | 1 Red |
| Green | 3 | 1 | 1.8 | 6 | – | 1 Blue |
| Yellow | 4 | 1 | 3.2 | 11 | – | 1 Green |
| Pink | 5 | 1 | 3.5 | 15 | – | 1 Yellow |
| Black | 11 | 1 | 1.8 | 20 | Explosions | 2 Pink |
| White | 11 | 1 | 2.0 | 22 | Cold (Ice Monkey attacks) | 2 Pink |
| Purple | 11 | 1 | 3.0 | 25 | Energy, fire, plasma | 2 Pink |
| Zebra | 23 | 1 | 1.8 | 26 | Explosions and cold | 1 Black + 1 White |
| Lead | 23 (fortified 26) | 1 (fortified 4) | 1.0 | 28 | Sharp, cold, energy (and shatter) | 2 Black |
| Rainbow | 47 | 1 | 2.2 | 35 | – | 2 Zebra |
| Ceramic | 104 (fortified 114) | 10 (fortified 20) | 2.5 | 38 | – (but tanky) | 2 Rainbow |

"First round" is the standard round set. Alternate Bloons Rounds bring most types in far earlier: see [Danger Rounds](/guides/danger-rounds/).

Notes:
- **Yellow and Pink** outrun many early projectiles. Slow darts and bombs can miss them.
- **Purple** shuts down Wizards (except Necromancer's undead bloons), Super Monkey Laser/Plasma Blasts and Sun Avatar, Ring of Fire and Inferno Ring, Laser Cannon and Plasma Accelerator, Riptide Champion and Druid lightning. Darts, Ninjas, Glaives, Subs, Bombs, Spikes, Alchemists and Hot Shots Tacks work fine.
- **Lead** blocks sharp, cold and energy attacks: darts, tacks, shurikens, Ice Monkeys and plain Wizard bolts. It also soaks shots aimed at bloons behind it.
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
| **Camo** | Only towers with camo detection can target or damage it. Projectiles and explosions from a tower without detection pass straight through. Spike Factory and Ninja see camo by default. Standard R24, ABR R5 | See camo counters below |
| **Regrow** | Lost layers grow back to the original type. Doesn't apply to blimp layers | Pop it fast. Grow Blocker (Village 0-1-0) stops regrowth in its radius; Cleansing Foam (Engineer 0-3-0) strips Regrow and Camo |
| **Fortified** | Lead, Ceramic and MOAB-class only. Doubles outer HP (Lead ×4). **It is never an immunity**: anything that can damage the bloon can damage it fortified | More damage. Shattering Shells (Mortar 0-0-4) strips it |
| **Frozen** | A status, not a bloon type. Sharp attacks can't damage a frozen bloon, and Ice Monkeys can't target one again without Re-Freeze (Ice 0-0-2) | Any non-sharp damage; Wizard 0-0-0 is the cheapest |

## Counters by bloon type

**Camo** (Medium prices)
- Built in: [Ninja Monkey](/monkeys/ninja/) ($400) and [Spike Factory](/monkeys/spike/) spikes.
- Upgrades: Enhanced Eyesight (Dart 0-0-2, $490), Night Vision Goggles (Sniper 0-1-0, $600), Monkey Sense (Wizard 0-0-2, $850), Cold Snap (Ice 2-0-0, $900), Eagle Eye (Desperado 0-1-0), Advanced Targeting (Dartling 0-1-0), Echosense Precision (Mermonkey 0-0-1), Crow's Nest (Buccaneer 0-0-2), Spy Plane (Ace 0-2-0), IFR (Heli 0-2-0), Horned Owl (Beast Handler 0-0-2), Zephyr Sense (Skywarden 2-0-0), Ultravision (Super Monkey 0-0-2), Signal Flare (Mortar 0-0-3, $2,300).
- **No built-in camo:** Monkey Sub (camo only from Bloontonium Reactor 4-0-0; Advanced Intel 2-0-0 only hits camo inside another detecting tower's range), Mortar (until Signal Flare; Increased Accuracy only tightens aim), Bomb Shooter, Alchemist (never), Glue Gunner (never on its main attack).
- For everything in range: Radar Scanner (Village 0-2-0, $3,450).
- Decamo: Signal Flare (Mortar 0-0-3), Submerge and Support (Sub 3-0-0), Counter-Espionage (Ninja 0-2-0), Shimmer (Wizard 0-0-3), Cleansing Foam (Engineer 0-3-0).
- Heroes: [Ezili](/heroes/ezili/), [Sauda](/heroes/sauda/), [Psi](/heroes/psi/) and [Silas](/heroes/silas/) from level 1, [Quincy](/heroes/quincy/) and [Etienne](/heroes/etienne/)'s drones from level 5, [Churchill](/heroes/churchill/) from level 6. Etienne's level 8 UAV gives **every** tower camo detection.

**Lead** (Medium prices)
- Built in: [Bomb Shooter](/monkeys/bomb/) ($375), [Mortar Monkey](/monkeys/mortar/), [Alchemist](/monkeys/alchemist/).
- Upgrades: Full Metal Jacket (Sniper 1-0-0, $700), Fireball (Wizard 0-1-0, $550), Red Hot Rangs (Boomerang 0-0-2, $715), Cold Snap (Ice 2-0-0, $900), Heat-tipped Darts (Sub 0-2-0, $1,075), Hot Shots (Tack 3-0-0, $1,230), Hard Thorns (Druid 1-0-0), Hot Shot (Buccaneer 0-2-0), Exploding Pineapple (Ace 0-1-0, unreliable), White Hot Spikes (Spike Factory 2-0-0), Razor Rotors (Heli 3-0-0), Thundering Arc (Skywarden 0-2-0), Adasaurus (Beast Handler 0-2-0), Riptide Champion (Mermonkey 0-3-0), Deadeye (Desperado 0-3-0), Hydra Rocket Pods (Dartling 0-3-0), Flash Bomb (Ninja 0-0-3), Juggernaut (Dart 4-0-0), Plasma Blasts (Super Monkey 2-0-0), Sentry Expert (Engineer 4-0-0).
- For nearby towers: Acidic Mixture Dip (Alchemist 2-0-0, $1,150) lets buffed Sharp and Ice towers pop Lead; Monkey Intelligence Bureau (Village 0-3-0) lets them damage everything.
- Heroes: [Gwendolin](/heroes/gwendolin/)'s Heat It Up (L4) gives nearby towers Lead popping for 8 s.

**Black and Zebra:** anything that isn't explosive (Zebra: not cold either). A Bomb or Mortar defence needs Frag Bombs (Bomb 0-0-2, frags only), Heavy Shells (Mortar 0-3-0), a MIB, or a non-explosive partner. [Striker Jones](/heroes/striker/) removes Black immunity for explosives at L19 (50% chance from L5).

**White and Zebra:** anything that isn't cold. An Ice-only defence can't touch them; [Silas](/heroes/silas/) L13 or a MIB fixes that.

**Purple:** sharp, explosive, acid or Normal damage: Dart, Ninja, Boomerang, Sub, Spike Factory, Bomb, Mortar, Sniper, Alchemist, Beast Handler beasts. Don't rely on Wizards, Super Monkey 1-3 top path, Ring of Fire, Laser Cannon or Riptide Champion for R25, R45 and especially R95 (500 Camo Regrow Purples).

**Fortified:** not an immunity. Fortified Leads need a Lead popper and Fortified MOABs need anything that hurts a MOAB; they just take longer.

**DDT:** a MOAB-class blimp with Camo, Lead and Black. One tower needs camo detection plus an attack that is neither sharp nor explosive. Cheapest single towers: Sniper 1-1-0 ($950), Wizard 0-1-2 ($1,150), Buccaneer 0-2-2 ($2,000), Spike Factory 2-x-x ($2,400), Dart 4-0-2 ($2,950). Support routes: Acidic Mixture Dip next to a camo Sharp tower, MIB (includes Radar Scanner), or Signal Flare / Submerge and Support decamo for non-explosive Lead poppers. Not enough on their own: Radar Scanner or Etienne next to Bombs, Ninja Flash Bomb, Ice Cold Snap. Bloon Sabotage (Ninja 0-4-0) halves DDT speed.

**Blimps.** Almost every attack can damage MOAB-class; the exceptions are Banana Farms, Villages, a Glue Gunner without Corrosive Glue (2-x-x) and an Ice Monkey without Embrittlement (4-x-x) or Icicles (0-0-4). These are the specialists with extra MOAB damage or control:

| Tower | Upgrades |
|---|---|
| [Bomb Shooter](/monkeys/bomb/) | MOAB Mauler (0-3-x), MOAB Assassin (0-4-x, ability one-shots small blimps), MOAB Eliminator (0-5-x) |
| [Sniper Monkey](/monkeys/sniper/) | Large Caliber (2-x-x), Deadly Precision (3-x-x), Maim MOAB (4-x-x, stun), Cripple MOAB (5-x-x) |
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

Sources: Bloons Wiki (damage-type bitflags, tower pages), Bloons Fandom wiki (camo, lead and purple tables; Damage Types; Frozen and Fortified Bloon pages), Ninja Kiwi v57 notes. Machine-readable versions: `data/bloons.json`, `data/pop-model.json`.
