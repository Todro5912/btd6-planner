# Changelog

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
