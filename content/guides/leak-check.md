---
title: How the leak check works
slug: leak-check
group: More
order: 16
summary: How the Simulator, Strategy Advisor and Check my defence estimate whether your towers pop enough, and the lives a round costs.
updated: 2026-11-07
gameVersion: "57.4"
related:
  - rounds
  - known-issues
  - danger-rounds
---

# How the leak check works

The tools check two things every round. First, **can** something you have pop each bloon type: camo, Lead, Purple, MOABs and the rest. Second, do your towers pop **enough**. The second is the leak check. It's an estimate, marked "estimate" wherever it shows.

## What it uses

**Your towers' real stats.** Every crosspath's damage, pierce, attack speed, range, damage type and sub-projectiles come from the game's own tower models. So do sub-towers that stay on the map, freeze, stun, slow and MOAB Shove. We read them from the [BTD Mod Helper game data export](https://github.com/Btd6ModHelper/btd6-game-data) (game version 56). Hero stats come from the same place, level by level.

**Abilities.** Each ability's attack, cooldown and duration come from the same files. That covers MOAB Eliminator, Rocket Storm, Absolute Zero, Turbo Charge, Storm of Arrows, Overclock, Call to Arms and the rest.

**The round's bloons.** Every bloon group, its start, its spacing and its speed come from the game's round sets, standard and ABR. They match the [Bloons Wiki round set](https://www.bloonswiki.com/Rounds_(BTD6)) group for group. Our bloon model rebuilds every round's RBE exactly, a test checks R1 to R140.

**Game rules that change a round.** Bloons are 10% faster on Medium and 25% faster on Hard and CHIMPS. From R81 every bloon speeds up, blimps get more HP each round, and Ceramics become Super Ceramics. Fortified bloons have double HP. Double HP MOABs doubles blimp HP.

## How it works it out

The check plays the round out, a fraction of a second at a time.

1. **Bloons move down the track.** Each group spawns at its real times and moves at its own speed. The track is as long as the map's (BTD6 Index length). Bloons are handled in small batches, not one by one, so it stays fast.
2. **Each tower covers a stretch of track.** At a typical spot a tower sees 3 range-widths of track: bends put more track in reach. All your towers share one spot.
3. **Each attack fires at its real rate.** Its hits land on the bloons in its reach, half on the ones furthest along, half spread over the crowd. More bloons in reach means more pierce gets used.
4. **Damage types count.** A hit only pops a layer its damage type can. Darts bounce off Lead, bombs can't hurt Black, frozen bloons shrug off Sharp. Leftover damage carries into the children, like in the game.
5. **Children spawn where their parent popped** and move at their own speed. A Ceramic's Rainbows don't wait for it.
6. **Blimps have HP.** Towers aim at them when they're in reach. An attack that pierces or splashes hits several at once. When a blimp pops, its children appear where it died.
7. **Freeze, stun and slow stop or slow** the share of bloons they hit, for as long as the effect lasts.
8. **What reaches the end leaks.** Lives follow the game's own round table. From R81 a leak costs less than its RBE, because blimps don't charge their extra HP.

Once your lives run out, the run is over: later rounds aren't checked for leaks.

On a long build the check takes a moment, more so on a phone. The Simulator shows your cash and coverage at once and says "Checking leaks…" while it works. You can keep editing. Rounds it has already checked are kept, so most edits finish at once.

## Abilities

The check assumes you use each ability when it's ready and it matters. That means when a blimp is in reach (for blimp abilities), when a big crowd is in reach, or when bloons are about to get past every tower. Cooldowns only run during rounds, so a round shorter than the cooldown gets a share of its effect.

Real late-game wins lean on abilities, so the number you see counts them. The check without abilities is there too: in our test it flagged slightly more real wins (R80: 5.4% against 4.0%, R98: 51% against 48%). If you don't use abilities, read the higher number.

## Buffs

These come from the game files (`data/game/support.json`):

- **Monkey Village:** +10% range, Jungle Drums cooldown x0.85 (17.6% more attacks), Primary Training +1 pierce and +10% range for Primary towers (no attack speed). Several Villages don't stack.
- **Berserker Brew:** one tower per throw every 8 seconds. The 3-x-x brew gives +1 damage, +2 pierce and 11% more attacks for 5 seconds or 25 shots. The 4-x-x brew lasts 12 seconds or 40 shots. Towers share the throws, so each one is brewed part of the time. 5-x-x is permanent.
- **Overclock and Ultraboost:** cooldown x0.6 on your strongest tower, while abilities count.
- **Call to Arms and Homeland Defense:** x1.5 for 15 seconds and x2 for 20 seconds, every 45 seconds.
- **Monkey Knowledge** you've switched on: attack speed, pierce, range and bonus damage nodes.

**Placement is an estimate.** We don't know where you put towers. A Village reaches the 4 towers listed nearest it in your build. An Alchemist shares its brews between the 3 nearest. A Heli Pilot flies to the bloons, so it covers the whole track.

## Your spot changes the answer

A great spot on a loop can do far better than a straight. So the check also works out the leak at a **great spot** (4 range-widths of track) and at a **bad spot** (1 range-width, a straight).

**Close calls.** A leak under 1% of the round's RBE is within the check's own error. It shows as a close call, not as a leak.

## Map rules

- **Glacial Trail:** each tower freezes on rounds 9 and 10 after you placed it, then every 10 rounds. Ice Monkeys never freeze.
- **Maps with several paths** split the bloons between them, so fewer bloons sit in reach at once.

## What it doesn't count

- Exact placement and line of sight. Targeting other than "First" and "Strong" for blimps.
- Regrow, Sun Temple sacrifices and towers an ability turns into something else.
- Some code-driven abilities: MOAB Takedown, Bomb Blitz, Drone Swarm, MOAB Hex, Heartstopper.
- Short support effects that need timing: Gwendolin's Heat It Up, Alchemist's Acid Dip, Ezili's totem, Corvus's spells, Geraldo's items, Brickell's Naval Tactics. They show as hints, never as cover.
- Spike piles saved from earlier rounds: Spike Factories only count what they make during the round.

## How we tuned it

Three numbers are fitted, not read from the game: the typical spot (3 range-widths), the Ice Monkey's reach (4.2 range-widths: bloons stall in its frozen circle) and the even split of hits between the front bloons and the crowd. We fitted them to these real games:

- **One base Dart Monkey** pops Rounds 1 to 3 on Monkey Meadow and starts leaking at Round 4. The check agrees (33 of 71 RBE at R4).
- **A 2-2-0 Ice Monkey with Quincy** on Glacial Trail Hard was down to 16 lives at Round 13. The check gives 19. Quincy is frozen by the map on R12 and R13, so the Ice is on its own then. The Ice reach is a steep fit: a small change moves the answer a lot.

Then we checked it, without changing anything, against **1,481 real CHIMPS wins with two towers** from the BTD6 Index. Each one lost no lives, so any leak the check shows is a false alarm.

| Round | Wins flagged (0.10) | Before (0.9.2) |
|---|---|---|
| R40 | 0.2% | 1.6% |
| R63 | 2.5% | 2.3% |
| R70 | 2.2% | 3.5% |
| R76 | 2.8% | 12.1% |
| R80 | 3.6% | 37.1% |
| R90 | 15.3% | 29.3% |
| R95 | 38.8% | 67.1% |
| R98 | 43.2% | 97.6% |
| R100 | 56.4% | 70.8% |

Up to R85 the check is about as good as our data: under 4% of real wins flagged. **From R86 it is still rough.** It flags many builds that win real games, often by a few Ceramics. The tools say so on those rounds. Treat a late leak as a warning, not a verdict.

It also has to fail what should fail. A lone base Dart can't pass the R40 MOAB, two base Darts can't beat R28's Leads, and a lone base Sniper leaks R6. One tower of a two-tower win, on its own, leaks somewhere from R40 to R100 in about 9 of 10 cases.

## Known gaps

The late-round false alarms come from a few places we can see:

- Blimp children that pop near the end of the track: in the game, players place towers so blimps die early.
- Some towers' pierce on bunched blimps is too low in our crowd tables (Ray of Doom, Archmage).
- Camo that only one attack of a pair can see, and towers that strip camo for the other one.
- Two wins in our test sample leak before R80: Absolute Zero with Golden Justice on Balance (R27) and Archmage with Lord of the Abyss on Logs (R59).

If the check says you're fine and you leak, or the other way round, please report it with your build and the round. That's how it gets better.
