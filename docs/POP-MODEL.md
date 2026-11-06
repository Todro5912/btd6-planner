# Pop model (`data/pop-model.json`)

The pop model answers one question per tower, crosspath and bloon property: **can this crosspath damage it at all?** It replaces the old per-upgrade `grants` tags in `towers.json` (now renamed `_grants_deprecated`). Those tags caused the 0.4 errors: Fortified shown as unpoppable, MOAB-class read as "MOAB bonus only", and Sniper 1-1-0 shown unable to hit DDTs.

Bonus damage, stuns and slows are a separate question. They live in `bonuses` and never decide "can it pop".

Contract: C1 in `docs/CONTRACTS.md`. This file documents the schema, the extensions D added and how to extend the model.

## Files

| File | What it holds |
|---|---|
| `data/pop-model.json` | Damage-type table, bloon immunities, the 26 towers, `supportFixes`, hero camo/lead levels |
| `data/bloons.json` | Every bloon and blimp: children, RBE, speed, immunities, properties it can carry, "what beats it", sources |
| `data/heroes-levels.json` | Contract C2: cost, levels 1–20, abilities with level and cooldown, `camoLevel`, `leadLevel` |
| `data/towers.json` | Prices and upgrade names. `innate` is regenerated from the pop model at 0-0-0; `damageType` marks upgrades that change type |
| `data/_tests/test_pop_model.py` | Schema checks and more than 80 known-truth assertions, each with its source |

Run the tests with `python3 data/_tests/test_pop_model.py`, or with pytest.

## Damage types

Every attack has one damage type. Each bloon property blocks some of them (decoded from the game's immunity bitflags on bloonswiki):

| Type | Can't damage |
|---|---|
| normal | nothing |
| acid | glass only |
| sharp | lead, frozen |
| shatter | lead |
| explosion | black |
| glacier | white |
| cold | lead, white |
| fire | purple |
| frigid | purple, white |
| plasma | purple, glass |
| energy | lead, purple, glass |

Zebra = Black + White. DDT = Camo + Lead + Black and is MOAB-class. Camo is a **targeting** rule, not an immunity: a tower without detection can't target camo, and its projectiles and explosions pass through. Fortified only adds HP. BAD is immune to slows, stuns and knockback, not to damage. "Magic" is a tower class; Wizards deal Energy.

## Tower entries

```json
"sniper": {
  "camo":   {"any": [[{"path": 1, "tier": 1}]], "note": "Night Vision Goggles"},
  "lead":   {"any": [[{"path": 0, "tier": 1}]]},
  "purple": {"any": [["base"]]},
  "ddt":    {"derived": true},
  "bonuses": [{"vs": "moab", "from": {"path": 0, "tier": 4}, "note": "Maim MOAB stun"}],
  "confidence": "high",
  "sources": ["..."]
}
```

Properties: `camo lead purple black white zebra frozen moab bad fortified ddt`, plus `bonuses`, `confidence` (high/medium/low) and `sources`.

### Evaluating `any`

- `any` is a list of alternatives (OR). Each alternative is a list of requirements (AND).
- `"base"` always holds. `"never"` appears alone and never holds.
- `{"path": p, "tier": t}` holds when `tiers[p] >= t`. Paths are 0 = top, 1 = middle, 2 = bottom.
- **Extension:** `{"path": p, "maxTier": m}` holds when `tiers[p] <= m`. It models upgrades that **lose** an ability. Examples: Tack Ring of Fire (4-x-x) is fire and can't pop Purple, so Tack purple is `[[{"path":0,"maxTier":3}]]`. Super Monkey purple is `[[maxTier 0 on top, maxTier 3 on middle], [top >= 4], [middle >= 5], [bottom >= 4]]`.

A consumer that doesn't know `maxTier` will read it as "not met". That under-claims (says "can't") instead of over-claiming, but please implement it; it's two lines.

Reference evaluator (the same logic is in the test file):

```js
const holds = (r, t) => r === "base" ? true : r === "never" ? false
  : ("maxTier" in r ? t[r.path] <= r.maxTier : t[r.path] >= r.tier);
const anyHolds = (spec, t) => spec.any.some(alt => alt.every(r => holds(r, t)));
function canPop(tower, tiers, prop) {
  const e = model.towers[tower];
  if (prop === "ddt") {
    if (e.ddt.derived) return ["camo", "lead", "black"].every(p => anyHolds(e[p], tiers));
    return anyHolds(e.ddt, tiers);
  }
  return anyHolds(e[prop], tiers);
}
```

### `ddt`: derived or explicit

- `{"derived": true}`: compute camo AND lead AND black on the **same** crosspath, as C1 says. The tests check that every derived tower can also damage MOAB-class wherever the three-way rule passes, so leaving out the MOAB check is safe for these towers.
- `{"derived": false, "any": [...]}`: **explicit.** The three-way rule would be wrong for this tower because the Lead attack and the Black attack are different attacks, or because the tower can't hurt blimps. Always use `any` when `derived` is false. Explicit towers:
  - Ace: pineapples are explosive and darts are sharp, so 0-2-0 can't hit DDTs.
  - Heli: MOAB Shove missiles are explosive, so 0-2-3 can't.
  - Ninja: Flash Bomb is explosive, so it's `never` without support.
  - Ice: Cold Snap can't affect blimps.
  - Beast Handler: the Owl's detection isn't known to reach the Adasaurus.
  - Banana Farm: never.

### `conditional`

`conditional` is an optional list of `{"req": [...], "note": "..."}` entries. It covers things that are **not** counted in `any`: abilities, effects that need another tower (Sub Advanced Intel), decamo without damage (Submerge and Support), and graveyard-dependent attacks. Show them as hints ("also: Bomb Blitz ability"), never as coverage.

Real attacks that only fire sometimes are counted in `any`, with a note. Examples: Flash Bomb on every 4th throw, Exploding Pineapple, Necromancer's undead bloons.

### Invariants (enforced by the tests)

- `fortified` is true exactly when the crosspath can damage anything. It is never an immunity.
- `bad.any == moab.any`.
- Every alternative can be reached by at least one legal crosspath (at most two paths used, at most one above tier 2).
- The pop model covers exactly the towers listed in `towers.json`.

## `supportFixes`

Each entry looks like `{"grants": "camo" | "lead" | "purple" | "black" | "white" | "zebra" | "frozen" | "decamo" | "degrow", "source": tower or hero id, "req": {"path","tier"} or {"level"}, "radius": "...", "note": "..."}`. There is one entry per granted property. Code checking a defence should:

1. For each own tower, evaluate `canPop`.
2. For each property still uncovered, look for a support fix whose `source` is in the build and whose `req` is met. Mind the radius: Radar Scanner and MIB cover village range; Etienne L8 is global.
3. Treat `decamo` as "camo solved for towers whose attack reaches the decamoed bloons".
4. For DDTs, a fix only helps when the remaining requirements are met **by the same tower**. Example: Alchemist 2-x-x gives a camo Sharp tower Lead, and Sharp already pops Black, so that tower can hit DDTs. Radar Scanner next to a Bomb gives camo, but explosions still can't hurt Black, so it can't.

MIB grants Lead, Purple, Black, White, Zebra and Frozen. Its path includes Radar Scanner (0-2-0), so a 0-3-0 Village also grants camo through the `village` camo entry (tier 2 or more).

## `heroes`

`{"camo": {"level": n | null}, "lead": {"level": n | null}, "note": ...}`, plus `purple`, `black` or `white` where they matter. `null` means never on the hero's own attacks. Ability-only or item-only routes are explained in `note` and repeated in `supportFixes` when they buff other towers. `heroes-levels.json` holds the same `camoLevel` and `leadLevel` (a test enforces this).

## Extending the model

**New tower:**
1. Add it to `towers.json`.
2. Add an entry under `towers` with every property key, `confidence` and at least one source.
3. Start from the base damage type. Look up which properties it can't damage in the table above, and write `base` for the rest.
4. For each upgrade that changes the type (record it as `damageType` in `towers.json`), add an alternative. If an upgrade *removes* an ability, use `maxTier`.
5. Decide `ddt`: if the camo, Lead and Black answers come from the same attack and that attack hits blimps, leave it `derived`. Otherwise write it explicitly.
6. Add at least two known-truth assertions with sources to the test file, then run it.

**New hero:** add it to `heroes` and `heroes-levels.json` with the same camo and lead levels. If it buffs other towers, add a `supportFixes` entry.

**Patch changes a damage type:** edit the tower entry and the upgrade's `damageType`, add the patch note to `sources`, add a test, and bump `version`.

## Known uncertainties (v57.4)

| Entry | Confidence | What isn't certain |
|---|---|---|
| Skywarden | low | Only patch notes were readable. Base arrows assumed Sharp; Ice path Frozen tier unverified |
| Beast Handler | low | Beast-by-beast damage types; whether Horned Owl detection carries to other beasts |
| Village | low | Primary Expertise (5-x-x) attack types |
| Desperado | medium | Deadeye rifle assumed Normal for Frozen. The old Big Iron lead tag was dropped (the wiki lists no lead change) |
| Mermonkey | medium | Riptide Champion type inferred (pops Lead, loses Purple). Decamo tier is 0-0-3 on bloonswiki, 0-0-4 on fandom |
| Ice | medium | White popping (Icicle Impale only); Embrittlement vs DDT |
| Super Monkey | medium | Robo Monkey (0-3-0) Purple and Tech Terror main attack, from fandom's Purple page |
| Ninja | medium | Sticky Bomb vs DDT |
| Corvus, Dan | low | The wiki level tables couldn't be read |

The damage-type table follows bloonswiki's bitflags. Fandom's older table differs: it also has Glacier blocked by Lead and Cold blocked by Frozen.
