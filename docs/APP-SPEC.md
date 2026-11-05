# Bloons Planner: app spec

A single-page BTD6 (v57.4) planner for tower-XP grinding and build planning. Built around a Sniper Paragon grind, and works for any tower, map and mode.

## Files

| File | Role |
|---|---|
| `template.html` | Page shell: styles, controls, rendering. Has the `<script id="data" type="application/json">__DATA__</script>` placeholder and a `__LOGIC__` placeholder. |
| `logic.js` | Pure functions only (no DOM), exported as `window.BTD` / `module.exports`. Inlined into the page by the build. |
| `build.py` | Loads `../data/*.json` read-only, trims unused fields, escapes `</`, inlines data + logic, writes `btd6-planner.html`. |
| `btd6-planner.html` | Built page (about 695 KB; data about 596 KB). Follows the Artifact page contract (no doctype/html/head/body tags). |
| `test_logic.js` | Node tests run against the built page (extracts the data and logic blocks). `--browser` also loads the page in Chromium, checks console errors, NaN/undefined text, chart presence and horizontal overflow; `--shots` saves `shot-1280.png` and `shot-400.png`. |

Rebuild: `python3 build.py && node test_logic.js --browser`.

## Inputs (left rail)

1. **Map**: search box plus a list of the 90 maps grouped Beginner / Intermediate / Advanced / Expert (with the XP multiplier and water / heavy-LoS hints).
2. **Mode**: 17 modes grouped by medal tier; the three Sandbox modes are listed but disabled and marked "no XP".
3. **Towers I'll use**: 26 chips coloured by class. Each chosen tower gets three path steppers (0–5) and a count (1–20). The steppers enforce the crosspath rules: only one path above 2 (raising a second one caps the other at 2) and at most two paths upgraded (adding a third drops the smaller other path).
4. **Levelling**: per chosen tower, a "Levelling this tower" tick, an "XP so far" number and a target (next tier / all T5s / Paragon; Paragon only offered when the tower has one).
5. **Hero**: 18 heroes, priced at the mode's multiplier.
6. **Playstyle**: the 8 archetypes from `economy.json`.
7. **Monkey Knowledge**: Monkey Education and Elite Military Training toggles.
8. Optional **freeplay to round N**.

The page opens on the example setup (Infernal, Deflation, Sniper 2-0-4 ×2 + Mortar 0-0-3, levelling Sniper to the Paragon, Sauda, Monkey Education on), labelled "Example setup". Selections are saved in `localStorage` (`bloons-planner-v1`, every access in try/catch); "Load example" restores it.

## Outputs (summary first)

- **Verdict**: overall state (blockers / things to watch / good to go), rounds, start cash, total cash, build + hero cost, price multiplier. Legality notes: class-restricted modes, Banana Farm in CHIMPS, income upgrades that pay nothing (CHIMPS, Deflation), water-only towers on no-water or little-water maps, line-of-sight warnings on heavy-LoS maps, MK off in CHIMPS, Apopalypse's random rounds, Sandbox. Coverage chips for Camo, Lead, Purple, Fortified, MOAB, DDT and BAD: first round needing it in this mode's round set and range, which tower/crosspath/upgrade answers it, and a status (covered, late, partial, uncovered!, not in range).
- **Map card**: tier, water, LoS blockers, lanes, track, CHIMPS-friendly, removables (at mode prices), map notes; the strategy text for the mode tier (easyPlan for Easy/Medium modes, hardPlan for Hard and Impoppable modes, chimpsPlan for CHIMPS); strong / avoid towers and recommended heroes with the user's picks highlighted; placement and XP-farm notes; confidence.
- **Index evidence** (round 3, inside the map card): btd6index.win v57.4 data for the map: lane RBS, entrances / exits, Index water and LoS flags, removal cost, LCC record (money and version), the size and state of the 2MP list, and for each picked tower and the hero a chip: "✓ solo-CHIMPS proven on this map" when a 2MP entry uses that tower (matched through its tier 3–5 upgrade names, the Index's "Base <tower>" name, or the hero's name; names are normalised so "Pre-Emptive"/"Pre-emptive" and "Pouākai"/"Pouakai" match), otherwise "—" with whether the list was complete, partial or not captured. Flags a water-only tower on a map the Index says has no water. Recorded Index-vs-wiki conflicts are shown underneath. Logic: `L.indexEvidence(data, map, picks, heroId)`.
- **Cash and build order**: SVG chart of cash available at the start of each round (Deflation flat at $20,000), cumulative spend as a step line with purchase dots, danger-3 rounds marked on the axis. Completion chips per tower instance, a purchase table (round, item, cost, total spent, bank after) and a flag for anything not affordable by the final round.
- **Tower XP**: run total and its formula, a share bar for every tower, and for each levelled tower: XP per run, share of cash, runs to next tier / all T5s / Paragon (target highlighted, progress bars), plus a comparison of Expert Deflation / Expert Hard / Expert Impoppable at the user's split and at 100% (mono).
- **Playstyle and economy**: the playstyle's template, risks and cash-curve notes; income sources legal in the mode with cost, $/round, payback rounds and the last round to buy that still pays back; DPS-per-$1k rows for the chosen towers (exact build highlighted).
- **Tower guide**: per chosen tower, the guide summary, best crosspaths (matching code highlighted, cost at mode prices), synergies, what it lacks, buy timing and the reference farm setup.

## Formulas

- **Round XP**: `20r+20` for r ≤ 20; `40(r−20)+420` for 21–50; `90(r−50)+1620` above 50. Checked against every `xp` in `rounds.json` and every `xpBaseTotal` in `modes.json`.
- **XP per run** = Σ round XP (startRound..endRound) × map tier (1.0 / 1.1 / 1.2 / 1.3) × 1.08 if Monkey Education. Freeplay rounds after the win are ×0.3 up to R100 and ×0.1 after. Expert Deflation = 45,950 × 1.3 = **59,735**.
- **Elite Military Training**: ×1.05 on Military towers' share (multiplicative; reproduces the 67,739 in `tower-guides.json`). MK is off in CHIMPS (`rules.noMK`).
- **XP split**: each round's XP is shared by cash invested per tower type at the end of that round (from the build order); hero spending is excluded; rounds with nothing built lose their XP.
- **Prices**: Medium cost × mode `costMult`, rounded to the nearest $5 per individual purchase, exact ties down (integer maths). Tower cost = placement + each upgrade.
- **Cash**: cash at the start of round r = startCash + cashMult × Σ round cash (startRound..r−1), from the mode's round set (`abr` for ABR, otherwise `standard`). Deflation (`rules.noIncome`) stays at startCash. Half Cash uses its $325 start and ×0.5.
- **Build order**: per-instance steps are place, then tiers 1–2 of the main and second path interleaved, then the main path's tiers 3–5. Playstyle sets the merge: Safe and CHIMPS-tight buy every tower's cheap tiers first, then cheapest-next. Eco buys an opener and the hero, then income towers, then the rest. Rush to T5 and Boss buy an opener and the hero, then the most expensive tower in full. Mono finishes one tower at a time. LCC is cheapest-next throughout. Each step lands on the earliest round whose starting cash covers the running total; a step that never fits is flagged and blocks the rest of that tower.
- **Coverage**: innate flags plus `grants` of the bought tiers. Village grants (Radar camo, MIB lead/purple/black/DDT) count for the whole team. Camo: camo grant, innate camo or Village Radar (decamo alone is partial). Fortified: `fortified`/`defortify` grant, else partial via a MOAB-damage tower. MOAB: a `moab` grant, else partial via any tier 3+ attacker. DDT: a `ddt` grant, or one tower with camo + lead + black + MOAB damage, else partial when they are split. BAD: tier 5 MOAB grant, partial at tier 4. "Late" means the answer is bought after the round that needs it.
- **Levelling**: "XP so far" = lifetime XP on that tower (spent + unspent). Next tier follows a cheapest-first unlock sequence. All T5s = `xpAllUpgrades` (guide; falls back to the sum of path XP). Paragon = all upgrades + Paragon XP (Sniper: 145,200 + 750,000 = 895,200). Runs = XP needed / XP per run.

## Data dependencies (`/home/claude/btd6/data`, read-only)

`towers.json` (towers, paths, innate, paragon, crosspaths, heroes, costMultipliers), `maps.json`, `modes.json`, `rounds.json` (standard, abr: xp, cash, threats, danger, notes, composition), `map-strats-a.json` + `map-strats-b.json` (merged by `mapId`), `tower-guides.json` (keyed by `towerId`), `economy.json` (incomeSources, dpsTable, playstyles, budgetCheck). Re-run `build.py` after the data changes.

## Known limits

- Coverage reads the dataset's `grants` tokens, which are an interpretation of wiki text. Heroes are not counted. Fortified, MOAB, DDT and BAD checks show whether a tower can answer a threat, not whether it has enough damage.
- The cash curve ignores tower income, selling, More Cash MK, Bananite crystals and Bloon Trap cash, so eco builds look later than they are.
- The build order is a greedy heuristic, not an optimiser. It does not look at danger rounds or threat timing.
- XP split uses the build-order timeline. Selling and re-buying, Insta Monkeys and Powers are not modelled.
- Apopalypse uses the standard round set as a stand-in for its random rounds.
- "Next tier" assumes cheapest-first unlocking. If upgrades were unlocked in another order, enter lifetime XP and read "all T5s" / "Paragon", which do not depend on order.
- Eight upgrades have unknown XP (`missingXp`: Skywarden tiers 1–2, Intense Magic, Banana Salvage) and count as 0. The guide totals are used where they exist.
- Income-source costs are the Medium total × multiplier, so they can be a few dollars off the per-upgrade-rounded in-game price.
- ME and EMT stacking multiplicatively, and Sandbox paying no XP, are unverified in the source chapter.
- Line-of-sight warnings use a fixed list of towers that don't need LoS (Mortar, Heli, Ace, Spike, Farm, Village, Skywarden).
