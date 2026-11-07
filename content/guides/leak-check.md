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

**Your towers' real stats.** Every crosspath's damage, pierce, attack speed, range and sub-projectiles (explosions, fragments, burn) come from the game's own tower models. So do sub-towers that stay on the map: sentries, Carrier planes, pets and drones. We read them from the [BTD Mod Helper game data export](https://github.com/Btd6ModHelper/btd6-game-data) (game version 56). Hero stats come from the same place, level by level.

**The round's bloons.** For each round we take every bloon group, its spawn time and its speed. They come from the game's round sets, standard and ABR, and match the [Bloons Wiki round set](https://www.bloonswiki.com/Rounds_(BTD6)) group for group. Our bloon model rebuilds every round's RBE exactly.

**Game rules that change a round.** Bloons are 10% faster on Medium and 25% faster on Hard and CHIMPS. From R81 every bloon speeds up, blimps get more HP each round, and Ceramics become Super Ceramics. Double HP MOABs doubles blimp HP.

## How it works it out

1. **How many bloons are in range at once.** The round's spawn rate times how long a bloon takes to cross the tower's range. Fast rounds bunch up, so high-pierce towers do better on them.
2. **How much each tower pops.** Its hits per second at that crowd size, times the layers each hit takes off, times the time the round is passing. Leftover damage carries into the children, like in the game, so a 20-damage hit clears a whole Ceramic. Explosions only reach the bloons near the target.
3. **MOAB-class bloons.** Each blimp has to lose its shell HP while it's in your towers' reach. If it doesn't, it leaks whole. A popped BFB drops 4 MOABs where it died, and those only get the reach that's left.
4. **What gets through.** The round's RBE minus what your towers pop. Lives follow the game's own table: up to R80 one RBE is one life, and from R81 a leak costs less than its RBE, because blimps don't charge their extra HP. Leaked layers pay no pop cash, so the Simulator takes that money off later rounds.

## What it counts and what it doesn't

**Counted:**

- Every attack of every crosspath, including sub-projectiles and sub-towers that stay on the map.
- Camo and Lead: a tower that can't hit them doesn't pop them.
- Village buffs: range, Jungle Drums attack speed, and Primary Training. They're assumed to reach every tower.
- Alchemist Berserker Brew.
- Ice Monkey freezing: frozen bloons can't be popped by Sharp attacks, so darts and Quincy next to an Ice Monkey pop less.

**Not counted:**

- Abilities, and towers an ability makes (Marines, Lord Phoenix, Drone Swarm, UCAV).
- Sun Temple sacrifices.
- Targeting priorities.
- Where you place towers. A tower is assumed to see about 1.6 range-widths of track, which is a decent spot with a bend. A great spot on a loop does better, and a bad one does worse.
- Every other buff. From Monkey Knowledge only Big Bloon Sabotage (blimps 10% less HP) and Veteran Monkey Training (3% faster reload) are counted.
- Regrow.
- Short support effects: Gwendolin's Heat It Up, Alchemist's Acid Dip, Ezili's totem, Corvus's spells, Geraldo's potions and Brickell's Naval Tactics. They show as hints, never as cover.

## How we tuned it

We checked it against real games:

- **One base Dart Monkey** pops Rounds 1 to 3 on Monkey Meadow and starts leaking at Round 4.
- **A 2-2-0 Ice Monkey with Quincy** on Glacial Trail Hard was down to 16 lives at Round 13. The check gives 14. The Ice freezing factor behind it is a steep estimate: a small change moves the answer a lot.
- **1,481 real CHIMPS wins with two towers** from the BTD6 Index. Each one lost no lives. Up to R70 the check agrees: at most 3.5% of them show a leak. From R76 it doesn't. It shows leaks in 12% of them at R76, 37% at R80 and 98% at R98.

Those late numbers went up in 0.9.2. The tower stats are now right, and some towers had been counted far too strong before: a Buccaneer 0-4-0 as 90 times its real MOAB damage. So from R76 the tools say the check is rough. Treat a late leak as a warning, not a verdict. The fix (bloon groups over time, and abilities) is the next big piece of work.

If the check says you're fine and you leak, or the other way round, please report it with your build and the round. That's how it gets better.
