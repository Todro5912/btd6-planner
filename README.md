# Bloons Planner (unofficial BTD6 tool)

**Live site:** https://todro5912.github.io/btd6-planner/

An unofficial planner for **Bloons TD 6** (data for game version **57.4**). You pick:
- a map and a mode
- the towers you'll use, with their crosspaths
- the towers you're levelling
- a hero and a playstyle

For that setup it shows you:

- **Coverage check.** For each threat (camo, lead, purple, fortified, MOAB-class, DDT and BAD), the first round in that mode that needs it, and which of your towers answers it.
- **Mode legality.** Primary Only, Magic Monkeys Only, no income in CHIMPS, water-only towers on dry maps.
- **Map card.** Layout facts and a strategy for each difficulty tier. It also shows **BTD6 Index evidence**: lane lengths, line of sight and water, the least-cost CHIMPS record, and whether your towers have a recorded solo-CHIMPS (2MP) win on that map.
- **Cash and build order.** Your cash by round for the selected mode, with each purchase priced at that mode's cost multiplier and placed in the first round you can afford it.
- **Tower XP projection.** XP per run, split by cash invested, with runs to the next tier, all tier 5s and the Paragon. It includes Monkey Education and Elite Military Training.

It's a single static HTML file. It needs no install and no account, and works offline once loaded.

## Accuracy

- The data is a snapshot of **v57.4** (October 2026). Prices and stats change with each game update.
- The numbers were cross-checked against several community sources (see Credits). The strategies and build orders are **calculated, not play-tested**.
- Values that couldn't be confirmed are marked as unverified in the data.
- Found something wrong? Open an issue with the in-game value and the game version.

## Project structure

```
index.html          the built site (what GitHub Pages serves)
data/               the dataset: towers, maps, modes, rounds, strategies, economy (JSON)
src/template.html   page layout and UI code
src/logic.js        pure calculation functions (pricing, XP, coverage, build order)
src/build.py        inlines data/ and logic.js into the page
src/test_logic.js   automated tests (node)
tools/build_site.py builds index.html
docs/APP-SPEC.md    formulas, inputs and outputs, known limits
```

## Build and test

```bash
python3 tools/build_site.py           # rebuild index.html from data/ and src/
cd src && node test_logic.js          # logic tests
cd src && node test_logic.js --browser   # plus a headless browser check (needs playwright)
```

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

- Code (`src/`, `tools/`, `index.html` scripts): [MIT](LICENSE)
- Data and docs (`data/`, `docs/`): [CC BY-SA 4.0](DATA-LICENSE.md), because parts are derived from CC BY-SA wiki content
