# Changelog

## 0.8.1 (2026-11-07)
- **Co-op**: a Players setting (Solo, 2, 3 or 4) in the Simulator and Strategy Advisor. Your cash is your share: start $50 less per player (Deflation splits the start cash), and 1/n of pop cash, round bonuses and More Cash (Bloons Wiki, unverified in game). Farms still pay their owner. Share links keep it (`pl=2`).
- **Every fix has an action**: Advisor gaps get "Add to my picks" or "Add in the Simulator" (the buy lands at the round you can pay for it); leftovers get "Use a cheaper crosspath"; "Can't use here" gets Remove; Check my defence gets Add and Upgrade on each fix; every Pairs well list adds the tower or hero.
- **Security**: Content-Security-Policy and referrer meta on every page, private words for the leak check out of the repo, `.gitignore` covers secrets files, bad `#hash` links can't throw.
- Fix: the Advisor's "Pick for me (Corvus)" named a hero you don't own while the plan used Quincy.

## 0.8.0 (2026-11-07)
- **My profile** (`/tools/profile/`, the "Me" button in the header): player level, Monkey Money and your hardest map tier; every tower's unlocked upgrades as tappable pips with Paragon and "not unlocked yet"; heroes you own (or "only the ones my level unlocks"); the Monkey Knowledge nodes from our guide; your Insta Monkey inventory. Backup code covers it.
- **The tools use it.** Monkey Knowledge the tools can model: More Cash (+$200 start), Hero Favors (heroes 10% cheaper), Empowered Heroes (start at level 3), Self Taught Heroes and Monkey Education (hero XP), Elite Military Training, Better Sell Deals (unverified). Off in CHIMPS and with the profile switch. The Advisor's "Pick for me" picks the best hero you own, marks towers you haven't unlocked and Instas you have, and starts the plan with your best-fitting free Insta ("Use my Insta Monkeys"). The Simulator places Instas for free from your inventory (share links keep them as `i` steps), flags ones you don't own and blocks them in CHIMPS.
- `data/monkey-knowledge.json` (29 nodes from the guide, with the effects the tools apply). Hero data in the tools now carries unlock level and Monkey Money price.

## 0.7.0 (2026-11-06)
- **My goals** (`/tools/goals/`): pick a Paragon, every tier 5 or one upgrade. A progress bar, XP banked, XP still to earn, runs and time left. **Log a run** (best farm for your hardest map tier, or the exact XP from the end screen) banks XP on that tower; **Unlock it** spends it like the game ("Unlock all N I can afford" when the bank covers several). Milestones at 25/50/75%, undo for logged runs, "mark it unlocked" for upgrades you already have. "Open the farm in the Simulator" builds the tower guide's farm (map, mode, towers, helpers, hero); "Plan a run in the Advisor" pre-fills it. Quickest Paragons suggested on an empty page.
- **Your progress, shared** (`static/progress.js`, every page, localStorage only): per-tower unlocks + Paragon + banked XP, goals, run log, recent pages, last plans, last game setup, settings. Backup code to move it to another device; reset.
- **Pick up where you left off** on home: your goals with bars, resume your last Advisor plan or Simulator build, recently viewed pages. The search box shows recent pages before you type.
- **Tools use your unlocks**: the XP calculator reads and saves them and has "Track this as a goal"; the Advisor has "Only use upgrades I've unlocked"; the Simulator flags steps you haven't unlocked and can log a run's XP to My goals. Advisor and Simulator remember your last map and mode across tools.
- **Linked pages**: tower pages get "Plan a game with it", "Go for <Paragon>" and a "you have 2-0-4 · 48%" box; map pages "Plan this map"; hero pages "Plan a game with <hero>"; round pages "Check my defence from R<n>"; the Paragons table "Go for it"; Advisor cards and fix lists link to tower pages.
- Fix: the tower page's "Work it out for your XP" link used `?tower=`, which the XP page ignored (it now reads both).

## 0.6.0 (2026-11-06)
- **Strategy Advisor** (`/tools/advisor/`): pick map, mode, hero and up to 8 monkeys; get each one's end crosspath and job, a build order by round, gaps with priced fixes and map tips, then open it in the Simulator.
- **Type-to-search pickers** for map, mode and hero (initials, later words and groups match).
- **Simulator** reframed as the strategy lab, with a "Strategy ideas" panel per map (strong and weak towers, best heroes, the map page's plan, key rounds, known start). `map-tips.js` is built from map-strats.
- **Home**: "Plan a run" band with the Advisor and Simulator; Tools index reordered.

## 0.5.0 (2026-11-06)
- **Monkey Intel by Solou.** New header lock-up (our own CSS/SVG wordmark, "by Solou" tag), a "Made by Todro5912" badge with a GitHub link above the header, a bigger credit block in the footer, and a new **About** page (unofficial fan project, built with AI assistance, credits, how to report errors). `site.json` gains `brand` and `project`.
- **New information architecture**: Quick (home) · Monkeys · Maps · Guides · Tools ▾ (Simulator, XP calculator, Check my defence). Records, Patch notes, Known issues, About and A–Z moved to the footer and a "More" menu. The search box lives in the header on wide screens. `/planner/` redirects to `/tools/simulator/` and keeps the hash.
- **Home = quick answers.** Eight "In a game right now?" tiles open quick cards (`/quick/<slug>/`): the one-line rule in big type, 3–6 cheapest fixes (tower, crosspath, price on your difficulty) and more options collapsed. Fixes are generated from the pop model and `towers.json`, never typed. Round lookup and the run-ending rounds strip; "Between games" doors. "What's in 57.4" moved to `/patch/`; "Quick numbers" removed.
- **Round pages** `/rounds/1/` to `/rounds/100/`: what spawns, the threats (linked to their quick cards), what you need by now and the next run-enders. Danger rounds 24, 28, 33, 37, 40, 45, 63, 76, 78, 90, 95, 98, 99, 100 are flagged everywhere. The rounds table moved to `/rounds/`.
- **Tower pages** reordered: what it's for with key-answer chips ("Camo: 0-1-0 Night Vision Goggles"), an interactive **crosspath picker** (3 paths, the one-path-past-tier-2 rule enforced) that updates the price, what it can pop (pop model) and good partners live, then upgrades, best crosspaths, paragon, and the XP farm and solo-CHIMPS proof collapsed. The old per-upgrade "grants" tags are gone from the pages.
- **Map pages** reordered: a one-line header (difficulty, lanes, easiness; water and line of sight in small text), "How to beat it" as 3–6 steps per difficulty with round chips and tower links, a key-rounds strip, best monkeys as chips, and the expert data (lane lengths, Index records, LCC, 2MP, XP farm) collapsed. The Hard/Impoppable paragraph shared by 51 maps is replaced by a link to one **general Hard and Impoppable plan** page plus each map's own notes. CHIMPS build orders are collapsed and labelled "calculated, not play-tested".
- **Maps index**: filters for difficulty, water ("has water") and line of sight ("has blockers"); fixed the stray "(" on the difficulty buttons (a segment style was hitting the medal dot). Expert columns moved to Records.
- **Hero pages** use `data/heroes-levels.json` when present: abilities, a level timeline, camo and Lead levels.
- **Search**: `data/search-synonyms.json` (216 player phrasings), quick cards, rounds, guides, glossary terms, bosses and modes are indexed. Synonyms and exact titles rank first, then prefixes; no letters-in-order matching under 4 characters. "camo" opens the camo card, "ddt" the DDT card, "r63" round 63.
- **Readability**: body copy capped at about 65 characters a line, strategy text split into steps, cash in bold, round chips, tower links.
- **Checks**: `check_site.py` adds stray-"(" detection in buttons, 3+ fixes per quick card, a 450-character paragraph limit outside guides and a player-word search test (31 queries). `test_site.js` covers home, quick cards, the picker, map, round, hero, about and tool pages at 400 and 1280 px (light and dark), the header menus, round lookup and the `/planner/` redirect.
- **One pop model everywhere.** `data/pop-model.json` (damage types, bloon immunities, support fixes, hero camo/Lead levels; see `docs/POP-MODEL.md`), `data/heroes-levels.json` and `data/bloons.json` replace the per-upgrade `grants` tags (now `_grants_deprecated`). The site build, the tower-page picker and the tools all read it and support `maxTier` (upgrades that lose an ability, e.g. Ring of Fire can't pop Purple), explicit DDT rules (Ace, Heli, Ice, Ninja, Beast Handler, Banana Farm) and `conditional` entries shown as "also, not counted" hints. Fixes: Sniper 1-1-0 hits DDTs, Fortified is never "can't", Buccaneer DDT from 0-2-2, Ice 2-0-0 / Ace 0-2-0 no longer listed as DDT answers.
- **Tools**: Simulator (round timeline, cash, first leak, priced fixes, known starts, share links), XP calculator (any upgrade, tier 5s or Paragon; ranked farms) and Check my defence (next 15 rounds with your towers). Synergy engine (50 rules) on tool pages and in the tower-page picker. Hero support fixes (Etienne UAV, Obyn for Druids/Skywardens, ...) now apply.
- **Old planner retired**: `src/build.py`, `logic.js`, `test_logic.js` and `template.html` are removed; `/planner/` redirects to `/tools/simulator/` with the hash.
- **No fixtures**: `tools/build_site.py` and `src/build_tools.py` stop if `data/pop-model.json` or `data/heroes-levels.json` is missing. `tools/consistency_check.py` checks the data tests' evaluator, the site build, `tools-core.js` and the rendered pickers agree on every tower × crosspath.
- Data fixes: R24 notes no longer say a Mortar handles the first camo (it needs Signal Flare 0-0-3); the Lead card no longer says Glue pops Lead from the start (Corrosive Glue 2-0-0).

## 0.4.1 (2026-11-05)
- **Player-facing copy pass.** 355 data strings that leaked research notes (wiki and chapter citations, "calc", "alt:" prices, first-person notes) were rewritten as plain English with the same facts and numbers. The original text stays in the data under `_src` (and research-only fields under `notes_internal`); neither generator renders these keys, and the planner build strips them.
- New **"unverified"** and **"calculated"** badges (small, outlined) replace parenthetical "(unverified)" / "(calc)" text. Data marks them with `{unverified}` / `{calc}` tokens.
- Every page except guides ends with a collapsed **About this data** section listing that page's sources and how its numbers were made (conflicting sources, price rounding, untested plans).
- Tower pages open with a one- or two-sentence **lead** on what the tower is for (`lead` in `tower-guides.json`, all 26 towers).
- Hero pages: cost on every difficulty, an "At a glance" stat block (beginner tier, unlock, levelling speed, roles), camo and Lead answers and a **Good with** row linking the towers the hero's text names.
- Map pages: "Proven solo here" is now one row of tower chips with a count badge; the upgrade names sit behind a "Which upgrades" expander.
- Home: "What's in 57.4" shows the 4 towers with the most changes; the rest sit behind an "All 57.x changes" button.
- Monospace is now only for crosspath codes and round numbers; change descriptions, key hints and planner counters use Rubik.
- `tools/leak_scan.py` lists research wording in rendered data (`data`) or built pages (`html`), with counts per pattern.

## 0.4.0 (2026-11-05)
- The planner becomes **Monkey Intel**, a BTD6 hub. Same URL, same data (v57.4).
- New pages: home, 26 tower pages, 18 hero pages, Monkeys index (Towers / Heroes / Paragons), 90 map pages, filterable Maps index, Guides index and guide pages from `content/guides/`, Rounds 1–140 reference (standard and ABR), sortable Records table, A–Z index, 404.
- Tower pages: 3 × 5 upgrade paths with Easy / Medium / Hard / Impoppable prices ($5 rounding as in the planner), XP to unlock, what it pops and where it gains it, best crosspaths with totals, tier 5 ranking, paragon, XP farm, maps with a solo-CHIMPS (2MP) record.
- Map pages: facts, BTD6 Index evidence, strategies per difficulty, the CHIMPS build order as a table, strong / avoid towers and heroes.
- Site search (press `/`): towers, upgrades, heroes, paragons, maps, guides and rounds, with keyboard navigation.
- Planner: re-skinned to the shared design, plus hash prefill (`#map=`, `#mode=`, `#tower=`, `#hero=`) used by every "Open in Planner" link.
- Light and dark themes with a footer toggle. Mobile layout down to 400px.
- Build: `tools/build_site.py` (Python + Jinja2 + Markdown) with a manifest-based cleanup; checks in `tools/check_site.py` and `tools/test_site.js`.

## 0.3.0 (2026-11-05)
- First public version.
- Data for BTD6 v57.4: 26 towers, 18 heroes, 90 maps, 17 modes, standard and ABR rounds 1–140.
- Map card shows BTD6 Index evidence: lane lengths, LoS, water, LCC record, and solo-CHIMPS (2MP) proof for your towers.
- Version label and unofficial disclaimer in the footer.
