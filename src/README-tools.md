# Monkey Intel tools (stream S)

Three tool pages plus a synergy engine, built to contract C3 in `docs/CONTRACTS.md`.

| Slug | Page | What it does |
|---|---|---|
| `simulator` | `pages/simulator.body.html` + `assets/simulator.js` | The planner grown into a round timeline: timed build steps, cash curve, coverage per round, first leak in big text, problems with priced fixes, synergy hints, known starts, XP-per-run (collapsed). |
| `xp` | `pages/xp.body.html` + `assets/xp.js` | Progression: tap unlocked pips (or enter total XP), pick an upgrade / all tier 5s / Paragon, get XP needed, unlock order and ranked farms. |
| `defence` | `pages/defence.body.html` + `assets/defence.js` | "Check my defence": mode, round, towers with path steppers, optional hero and level. Shows the next uncovered threats in the next 15 rounds with the cheapest fixes. |

## Files

| File | Role |
|---|---|
| `build_tools.py` | Writes `pages/assets/tools-data.js` (`window.MonkeyIntelData`) and `pages/assets/synergy-rules.js`. `--preview` also writes `src/.preview/<slug>.html` (fragment in a bare shell, git-ignored). |
| `pages/assets/tools-core.js` | Pure logic, no DOM: pop model, coverage, simulator, fixes, hero level estimate, XP plans, farm table, share links, presets. `window.MonkeyIntel.core` or `require()`. |
| `pages/assets/synergy.js` | `window.MonkeyIntel.synergy(placed, ctx)`. No DOM. |
| `pages/assets/tools-ui.js` | Shared DOM helpers: tower grid, path steppers, fix list, suggestion list. |
| `pages/assets/tools.css` | Tool components. Site tokens only, no gradients or soft shadows. |
| `../data/synergy-rules.json` | 50 hand-written rules. |
| `test_tools.js` | Node tests; `--browser [--shots]` adds the playwright smoke test. |

The old planner (`template.html`, `logic.js`, `build.py`, `test_logic.js`) was retired in 0.5.

## Data flow

`build_tools.py` reads `data/*.json`. `data/pop-model.json` and `data/heroes-levels.json` are required (the build stops without them; there is no fixture). From `data/heroes-levels.json` (C2) it reads `xpTable` (21 cumulative values, index = level) or `xpRatio` override the built-in hero XP estimate. The old `grants` tags are never read.

Rebuild after any data change:

```
python3 src/build_tools.py
node src/test_tools.js --browser
```

## Integration (for U's build, beyond C3)

1. `tools/build_site.py` runs `src/build_tools.py` itself before copying `src/pages/assets/*` to `assets/tools/`.
2. Replace `{{BASE}}` in the fragments with the site base. Each fragment starts with a `<link rel="stylesheet" href="{{BASE}}static/tools/tools.css">`; hoist it to `<head>` if you prefer. Scripts are `defer` and in load order.
3. Each fragment has its own `<h1 class="h1">` and an `about-data` `<details>` at the foot. Don't add a second title.
4. `/planner/` → `/tools/simulator/`, keeping the hash. The simulator reads both the old planner hashes (`#map=`, `#mode=`, `#tower=`, `#hero=`) and its own format.
5. Cross-links: the simulator's XP panel links to `../xp/`. The XP page accepts `#tower=<id>`, and the defence page accepts `#mode=<id>&round=<n>`.
6. Tower pages ("pick an upgrade path, see what pairs well"): load `synergy-rules.js` then `synergy.js` (about 20 KB together; no big bundle needed), then call `MonkeyIntel.synergy([{id: 'sniper', x: '0-2-4'}], {modeId: 'chimps'})`. Render `label`, `why`, `strength`, `kind` (`pair` or `avoid`), `unverified` and `pairsWith`.

## Share-link format (simulator)

`#map=<id>&mode=<id>&b=<steps>&hl=<hero level override>`. Steps are joined with `_`, and each one starts with its round:

| Token | Meaning |
|---|---|
| `13hquincy` | hero |
| `6psniper` or `6psniper.002` | place, optionally at a crosspath |
| `20u1.010` | upgrade the 1st placed tower (placement order by round) to 0-1-0 |
| `30s1` | sell the 1st placed tower |

## Rules the logic follows

- **Cash.** Start of round r = startCash + cashMult × Σ cash(start..r−1), from `rounds.json`. Deflation is flat. Farm income is added for crosspaths listed in `economy.json` (not in CHIMPS or Deflation).
- **Selling.** Refunds 70% of what was spent on that instance. Selling is blocked in CHIMPS.
- **Affordability.** A step is short when cash after it goes negative. "Earliest" is the first later round where cash after all buys is ≥ 0.
- **Needs per round.** Read from the composition plus children: lead → black, ceramic → rainbow → zebra → black + white, and MOAB-class down to ceramic. Fortified is never a need. With nothing attacking, only "nothing placed" is reported.
- **Coverage.** C1 `any` alternatives against the tower's crosspath at that round. Active `supportFixes` (tower req, or hero `{level}`; `only` limits them to listed towers) add to every attacker; support is assumed in range. DDT = camo + lead + black + MOAB on one tower, own or via support. That is C1's derived rule plus the MOAB-class check, since a DDT is a MOAB. Heroes count through the `heroes` block at the estimated level.
- **Fixes.** Candidate actions are tested by recomputing coverage, so a fix is only listed if it really closes the gap. Order: upgrades to towers you own (including support upgrades), then new towers, then new support towers, then "your hero gets it at level N". Prices are for the mode.
- **Hero level estimate.** XP per round = round XP × map tier multiplier, from the round the hero is placed. Level thresholds are a built-in 1.0× table × the hero's `xpCurve`. The page labels it an estimate and offers a manual level.
- **XP.** Round XP formula as in APP-SPEC. The XP plan's unlock order is cheapest-first but never skips a tier. Paragon = all 15 upgrades + Paragon XP. The farm table assumes a mono-tower run on the chosen map tier. Run times use rough fast-forward minutes per round. The recommendation picks the best XP per minute among modes rated easy to win.

## Synergy rule conditions (`when` is AND of these)

| Condition | Meaning |
|---|---|
| `{"has": "village", "x": "0-2-x", "count": 2}` | Has (at least `count`) of that tower. Pattern digits are **minimum** tiers; `x` = any. |
| `{"lacks": "glue"}`, `{"lacks": "village", "x": "x-2-x"}` | No such tower (at that pattern). |
| `{"hasGroup": "sharp"}`, `{"countGroup": "attackers", "min": 2}`, `{"onlyGroup": "sharp"}` | Groups are defined in the file: a list of ids, `{"class": ...}` or `{"exclude": [...]}`. |
| `{"maxTier": 4, "group": "fastAttack"}` | A tower in the group has some path at tier ≥ 4. |
| `{"missing": "lead"}`, `{"noBonus": "moab"}` | From `ctx.missing` / `ctx.bonuses`. |
| `{"mode": [...]}`, `{"notMode": [...]}`, `{"endRound": 90}` | Mode filters; `endRound` means the mode's last round is ≥ that. |
| `{"hero": [...]}`, `{"notHero": [...]}`, `{"noHero": true}` | Hero filters. |
| `{"mapWater": ["none"]}`, `{"mapLos": ["heavy"]}` | Map filters. |
| `{"any": [...]}`, `{"not": {...}}` | OR / NOT. |

A `pair` suggestion drops out once the build already has it (tower at ≥ the suggested crosspath, or that hero). Results are ranked: avoid first, then missing-coverage fixes, then core before nice, with specific (`has`) rules ahead of generic ones. One suggestion is kept per target.

## Known gaps

- The hero XP table and the "no catch-up XP" assumption are unverified; hence the manual override.
- Coverage is "can hit", not "enough damage". There is no DPS or pierce model; R63, R98 and the BAD are flagged only when nothing can damage them.
- Support towers are assumed to be in range of everything.
- Known starts are parsed from the bracketed CHIMPS build orders in map-strats (37 maps). Non-tower items such as the Tricky Tracks train are skipped, so 5 maps total less than the page text.
- Income other than the farm crosspaths in `economy.json` (Merchantman, Bloon Trap, Benjamin, Monkey Knowledge) is not added to the cash curve.
- Farm run times are rough guesses.
