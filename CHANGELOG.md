# Changelog

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
