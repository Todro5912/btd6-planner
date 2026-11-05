# Monkey Intel (unofficial BTD6 hub)

**Live site:** https://todro5912.github.io/btd6-planner/

An unofficial hub for **Bloons TD 6** (data for game version **57.4**):

- **Planner**: pick a map, mode, towers with crosspaths, hero and playstyle. It checks coverage (camo, lead, purple, fortified, MOAB, DDT, BAD), mode legality, prices a build order against the cash curve, and projects tower XP to the next tier, all tier 5s and the Paragon.
- **Monkeys**: 26 tower pages (upgrade paths with prices on every difficulty and XP to unlock, what each tower pops and where it gains it, best crosspaths, tier 5 ranking, paragon, XP farm, maps where it has soloed CHIMPS), 18 hero pages and a paragon / XP-farm table.
- **Maps**: all 90 maps, filterable by difficulty, water and line of sight. Each map page has its facts, BTD6 Index evidence (lane lengths, least-cost CHIMPS, solo-CHIMPS list) and strategies for Easy/Medium, Hard/Impoppable and CHIMPS, with the CHIMPS build order as a table.
- **Guides**: written guides from `content/guides/` plus the generated Rounds 1–140 reference (standard and ABR).
- **Records**: a sortable table of BTD6 Index numbers for every map.
- **Search** (press `/` anywhere) and an **A–Z** index.

It's a static site: no install, no account, no tracking.

## Accuracy

- The data is a snapshot of **v57.4** (October 2026). Prices and stats change with each game update.
- The numbers were cross-checked against several community sources (see Credits). The strategies and build orders are **calculated, not play-tested**.
- Values that couldn't be confirmed are marked as unverified in the data.
- Found something wrong? Open an issue with the in-game value and the game version.

## Project structure

```
site.json             site name, version, data version and the base path (/btd6-planner/)
data/                 the dataset: towers, maps, modes, rounds, strategies, economy (JSON)
content/guides/*.md   guides (front matter: title, slug, group, order, summary, updated, gameVersion, related)
templates/            Jinja2 page templates (base.html, _macros.html, one per page type)
static/               site.css (all styles) and small scripts: site.js (theme, search),
                      prices.js, maps.js, rounds.js, sort.js. Copied to assets/ on build.
src/template.html     the planner page: layout, styles and UI code
src/logic.js          pure planner calculations (pricing, XP, coverage, build order)
src/build.py          inlines data/ and logic.js into the planner page (src/btd6-planner.html)
src/test_logic.js     planner logic tests (node)
tools/build_site.py   builds the whole site into the repo root
tools/check_site.py   static checks on the built site
tools/test_site.js    browser checks (playwright)
docs/                 DESIGN.md (design system), APP-SPEC.md (planner formulas and limits)
```

Generated (do not edit by hand): `index.html`, `404.html`, `search-index.json`, `planner/`, `monkeys/`, `heroes/`, `maps/`, `guides/`, `records/`, `a-z/`, `assets/`. Every generated file is listed in `.build-manifest.json`; each build deletes exactly those files and writes them again, so nothing else in the repo is touched.

All links are relative, so the site works under the GitHub Pages base path `/btd6-planner/`. The only exception is `404.html`, which GitHub Pages serves at any depth; it uses absolute links built from `base` in `site.json`.

## Build and test

Needs Python 3 with `markdown` and `jinja2` (`pip install --break-system-packages markdown jinja2`), and Node with `playwright` for the browser checks.

```bash
python3 tools/build_site.py              # build the whole site (about 1 s)
python3 tools/check_site.py              # links, anchors, titles, descriptions, search index
cd src && node test_logic.js --browser   # planner logic tests + headless planner check
node tools/test_site.js                  # browser checks at 1280px and 400px under /btd6-planner/
node tools/test_site.js --shots DIR      # same, plus full-page screenshots into DIR
```

To add a guide, drop a Markdown file into `content/guides/` and rebuild. Links like `/maps/infernal/` or `/monkeys/sniper/` are rewritten to work under the base path; a link to a page that doesn't exist is rendered as plain text and reported as a build warning. A guide with slug `rounds` becomes the introduction of the generated Rounds page.

## Credits

The data was compiled from:
- [Bloons Wiki](https://www.bloonswiki.com/) and [Bloons Fandom wiki](https://bloons.fandom.com/), CC BY-SA
- [BTD6 Index](https://btd6index.win/): map metadata, LCC and 2MP records
- [Cyber Quincy](https://github.com/hemisemidemipresent/cyberquincy): used to cross-check costs and rounds
- Ninja Kiwi patch notes

Built with AI assistance (Claude). Designed, directed and validated by [Todro5912](https://github.com/Todro5912).

## Disclaimer

This is an unofficial fan project, not affiliated with or endorsed by Ninja Kiwi. Bloons and Bloons TD 6 are trademarks of Ninja Kiwi. No game art is included.

## License

- Code (`src/`, `tools/`, `templates/`, `static/` and the generated pages' scripts): [MIT](LICENSE)
- Data, guides and docs (`data/`, `content/`, `docs/`): [CC BY-SA 4.0](DATA-LICENSE.md), because parts are derived from CC BY-SA wiki content
