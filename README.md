# Monkey Intel by Solou (unofficial BTD6 hub)

**Live site:** https://todro5912.github.io/btd6-planner/

An unofficial **Bloons TD 6** fan project by [Todro5912](https://github.com/Todro5912) for Solou (data for game version **57.4**). It has two speeds: answers you can read mid-game in five seconds, and denser pages for between games.

| Tab | What's there |
|---|---|
| **Quick** (home) | "In a game right now?" tiles: Camo, Lead, Purple, Black/Zebra, White/Frozen, Fortified, MOAB-class, DDT. Each opens a quick card (`/quick/<slug>/`): the rule in big type and the cheapest fixes on your difficulty. Plus a round lookup and the run-ending rounds. |
| **Monkeys** | 26 tower pages (what it's for, a live **crosspath picker** with price, what it pops and good partners, upgrades, best crosspaths, paragon), 18 hero pages (level timeline when the data has it) and a paragon table. |
| **Maps** | 90 maps, filterable by difficulty, water and line of sight. Each map page: a one-line header, "How to beat it" as short steps for Easy/Medium, Hard/Impoppable and CHIMPS with the key rounds, the best monkeys, and the expert data collapsed. |
| **Guides** | Guides from `content/guides/`, the rounds table and a page for every round 1–100 (`/rounds/<n>/`). |
| **Tools ▾** | Simulator (`/tools/simulator/`), XP calculator (`/tools/xp/`), Check my defence (`/tools/defence/`). `/planner/` redirects to the simulator and keeps its hash. |
| More (footer and ☰ menu) | Records, Patch notes, Known issues, About, A–Z. |

Search (press `/`, or the box in the header) understands player words: "camo", "pops lead", "r63", "black border", "lych", "farm xp".

It's a static site: no install, no account, no tracking.

## Accuracy

- The data is a snapshot of **v57.4** (October 2026). Prices and stats change with each game update.
- The numbers were cross-checked against several community sources (see Credits). The strategies and CHIMPS build orders are **calculated, not play-tested**; build orders are collapsed and labelled that way.
- "Can it pop X" comes from the pop model (`data/pop-model.json`), not from per-upgrade tags.
- Values that couldn't be confirmed are marked as unverified in the data.
- Found something wrong? Open an issue with the in-game value and the game version.

## Project structure

```
site.json               name, project, brand, version, data version and the base path (/btd6-planner/)
data/                   the dataset (JSON): towers, maps, modes, rounds, strategies, economy,
                        pop-model.json (can it pop X), heroes-levels.json, search-synonyms.json
content/guides/*.md     guides (front matter: title, slug, group, order, summary, updated, gameVersion, related;
                        group: More keeps a page out of the Guides list, e.g. Known issues)
content/quick/*.md      quick cards (front matter: title, slug, tile, order, props, mode, rule, sub, related;
                        bullets in the body become "Good to know"). Fixes are generated, never typed.
templates/              Jinja2 page templates (base.html, _macros.html, one per page type)
static/                 site.css and scripts, copied to assets/: site.js (theme, menus, search UI, round lookup),
                        search-core.js (search scoring, also used by the checks), picker.js (tower crosspath picker),
                        prices.js, maps.js, rounds.js, sort.js
src/pages/*.body.html   tool pages (simulator, xp, defence), wrapped into /tools/<slug>/ (assets -> assets/tools/)
src/build_tools.py      builds the tools' data bundle (tools-data.js, synergy-rules.js); build_site.py runs it first
data/pop-model.json     the single source of truth for "can it pop X" (docs/POP-MODEL.md); required, no fallback;
                        synced with the game files by tools/game/sync_popmodel.py
data/game/*.json        mined from the game's own files (BTD Mod Helper export, v56): towers (attacks, sub-towers),
                        support (abilities, buffs), knowledge (134 MK nodes), bloons + rounds, misc (powers, Geraldo,
                        paragons, modes). Built by tools/game/extract_*.py --gd <export>; tests in data/_tests/test_game_*.py
data/tower-power.json   leak-check stats per crosspath, built by tools/build_power.py from the same export
tools/build_site.py     builds the whole site into the repo root
tools/mi_lib.py         pop-model maths, crosspath rules, strategy text -> steps and links
tools/consistency_check.py  proves every "can it pop X" evaluator agrees with the pop model
tools/check_site.py     static checks on the built site
tools/test_site.js      browser checks (playwright)
docs/                   DESIGN.md (design system), CONTRACTS.md, APP-SPEC.md
```

Generated (do not edit by hand): `index.html`, `404.html`, `search-index.json`, `quick/`, `rounds/`, `monkeys/`, `heroes/`, `maps/`, `guides/`, `tools/<slug>/` and `tools/index.html`, `patch/`, `about/`, `records/`, `a-z/`, `planner/`, `assets/`. Every generated file is listed in `.build-manifest.json`; each build deletes exactly those files and writes them again, so nothing else in the repo is touched (inside `tools/`, only `tools/index.html` and `tools/<slug>/index.html` are ever written).

All links are relative, so the site works under the GitHub Pages base path `/btd6-planner/`. The only exception is `404.html`, which GitHub Pages serves at any depth; it uses absolute links built from `base` in `site.json`.

## Build and test

Rebuilding from the game files (only when the export changes) needs a checkout of https://github.com/Btd6ModHelper/btd6-game-data: run `tools/game/extract_*.py --gd PATH`, `tools/build_power.py PATH`, `tools/game/build_mk.py` and `tools/game/sync_popmodel.py`. The normal build doesn't need it.

Needs Python 3 with `markdown` and `jinja2` (`pip install --break-system-packages markdown jinja2`), and Node with `playwright` for the browser checks.

```bash
python3 tools/build_site.py              # build the whole site (about 1 s)
python3 tools/check_site.py              # links, anchors, titles, search index, stray "(" in buttons,
                                         # 3+ fixes per quick card, no 450+ char paragraphs, search words
python3 data/_tests/test_pop_model.py    # pop model schema, known truths, sync with the game files, data/game tests
node src/test_tools.js --browser         # simulator, XP, defence and synergy logic + headless tool pages
python3 tools/consistency_check.py       # data tests, site build, tools and the built pickers agree (--all: every crosspath)
node tools/test_site.js                  # browser checks at 1280px and 400px under /btd6-planner/
node tools/test_site.js --shots DIR --prefix v05-   # same, plus full-page screenshots into DIR
```

To add a guide, drop a Markdown file into `content/guides/` and rebuild. Links like `/maps/infernal/` or `/monkeys/sniper/` are rewritten to work under the base path; a link to a page that doesn't exist is rendered as plain text and reported as a build warning. A guide with slug `rounds` becomes the introduction of the generated Rounds page.

To add a quick card, drop a Markdown file into `content/quick/` with `props` (pop-model keys that must all hold, e.g. `[black, white]`) and `mode: bonus` if the fixes should be the cheapest towers with a bonus against it (MOAB, Fortified). To teach search a player word, add it to `data/search-synonyms.json`.

## Credits

The data was compiled from:
- [Bloons Wiki](https://www.bloonswiki.com/) and [Bloons Fandom wiki](https://bloons.fandom.com/), CC BY-SA
- [BTD6 Index](https://btd6index.win/): map metadata, LCC and 2MP records
- [Cyber Quincy](https://github.com/hemisemidemipresent/cyberquincy): used to cross-check costs and rounds
- Ninja Kiwi patch notes

Made by [Todro5912](https://github.com/Todro5912) for Solou. Built with AI assistance (Claude); designed, directed and validated by Todro5912.

## Disclaimer

This is an unofficial fan project, not affiliated with or endorsed by Ninja Kiwi. Bloons and Bloons TD 6 are trademarks of Ninja Kiwi. No game art is included.

## License

- Code (`src/`, `tools/`, `templates/`, `static/` and the generated pages' scripts): [MIT](LICENSE)
- Data, guides and docs (`data/`, `content/`, `docs/`): [CC BY-SA 4.0](DATA-LICENSE.md), because parts are derived from CC BY-SA wiki content
