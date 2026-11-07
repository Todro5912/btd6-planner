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

**Your towers' real stats.** Every crosspath's damage, pierce, attack speed, range and sub-projectiles (explosions, fragments, burn) come from the game's own tower models. We read them from the [BTD Mod Helper game data export](https://github.com/Btd6ModHelper/btd6-game-data) (game version 56). Hero stats come from the same place, level by level.

**The round's bloons.** For each round we take every bloon group, its spawn time and its speed, from the [Bloons Wiki round set](https://www.bloonswiki.com/Rounds_(BTD6)). The round's RBE (total layers) comes from our rounds data.

## How it works it out

1. **How many bloons are in range at once.** The round's spawn rate times how long a bloon takes to cross the tower's range. Fast rounds bunch up, so high-pierce towers do better on them.
2. **How much each tower pops.** Its hits per second at that crowd size, times the layers each hit takes off, times the time the round is passing. Explosions only reach the bloons near the target.
3. **MOAB-class bloons.** Each blimp has to lose its shell HP while it's in your towers' reach. If it doesn't, it leaks whole.
4. **What gets through.** The round's RBE minus what your towers pop. That's also the lives you lose, as in the game. Leaked layers pay no pop cash, so the Simulator takes that money off later rounds.

## What it counts and what it doesn't

**Counted:**

- Every attack of every crosspath, including sub-projectiles.
- Camo and Lead: a tower that can't hit them doesn't pop them.
- Village buffs: range, Jungle Drums attack speed, and Primary Training.
- Alchemist Berserker Brew.
- Ice Monkey freezing: frozen bloons can't be popped by Sharp attacks, so darts and Quincy next to an Ice Monkey pop less.

**Not counted:**

- Abilities.
- Sub-towers: sentries, Phoenix, drones, pets.
- Targeting priorities.
- Where you place towers. A tower is assumed to see about 1.6 range-widths of track, which is a decent spot with a bend. A great spot on a loop does better, and a bad one does worse.
- Every other buff, and Monkey Knowledge that changes attacks.

## How we tuned it

We checked it against real games:

- **One base Dart Monkey** pops Rounds 1 to 3 on Monkey Meadow and starts leaking at Round 4.
- **A 2-2-0 Ice Monkey with Quincy** on Glacial Trail Hard was down to 16 lives at Round 13. The check now lands close to that.
- **Known CHIMPS starts** from the map pages hold through the early and mid game.

If the check says you're fine and you leak, or the other way round, please report it with your build and the round. That's how it gets better.
