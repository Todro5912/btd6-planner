# Game images: what the site would use (prep only)

The site owner wants game images on the site and will collect them by hand. **Nothing here is live yet.** The design rule is still "no game art" (see the end of this page), and the owner decides whether it changes. This page is the checklist: every image, its exact file name, size and folder, and how it would be credited.

Generated from the site's own data (`data/towers.json`, `data/maps.json`, `data/bloons.json`), so every file name uses the id the site already uses in its URLs and share links.

## How to collect

- **Format:** PNG with a transparent background for towers, upgrades, Paragons, heroes, bloons and bosses. PNG or JPG for map screenshots. No watermarks, no game UI around the picture.
- **Source size (what you save):** at least the size in the table below, square for portraits, 16:9 for maps. Bigger is fine: the build would shrink it.
- **One file per item, named exactly as listed** (lower case). A missing file is fine: the page keeps today's drawn icon for it.
- **Folder:** `static/img/game/<kind>/` in the repo, for example `static/img/game/towers/dart.png`. The build would copy it to `assets/img/game/<kind>/` and write WebP copies at the display sizes. That copy step doesn't exist yet: `tools/build_site.py` copies only the top level of `static/` today.
- **Total:** 26 towers + 78 tier 5s + 14 Paragons + 18 heroes + 90 maps + 17 bloons + 7 bosses = 250 files.

## Sizes

| Kind | Save at least | Phone (400 px) shows | Desktop (1280 px) shows | Where |
|---|---|---|---|---|
| Tower (base) | 256 × 256 | 64 px (128 px file for sharp screens) | 96 px (192 px file) | tower page header, Monkeys index; 32 px on the tool tower tiles |
| Tier 5 upgrade | 256 × 256 | 48 px (96 px file) | 72 px (144 px file) | tower page upgrade rows, Paragons table |
| Paragon | 256 × 256 | 64 px (128 px file) | 96 px (192 px file) | Paragons table, tower page Paragon block, My goals card |
| Hero | 256 × 256 | 64 px (128 px file) | 96 px (192 px file) | hero page header, Heroes index; 32 px in the hero pickers |
| Map | 1280 × 720 | 360 × 203 (720 × 405 file) | 640 × 360 (1280 × 720 file) | map page header; 160 × 90 on the Maps index |
| Bloon | 128 × 128 | 32 px (64 px file) | 40 px (80 px file) | quick cards, round pages, rounds table |
| Boss | 256 × 256 | 64 px (128 px file) | 96 px (192 px file) | boss events guide |

Every image gets an `alt` with the name ("Dart Monkey", "Ultra-Juggernaut"), a fixed width and height so the page doesn't jump while it loads, `loading="lazy"` below the first screen, and the 3px ink outline frame from DESIGN.md around portraits. The picture itself is never recoloured or filtered.

## Towers (26): `static/img/game/towers/<tower-id>.png`

| Tower | File |
|---|---|
| Dart Monkey | `towers/dart.png` |
| Boomerang Monkey | `towers/boomerang.png` |
| Bomb Shooter | `towers/bomb.png` |
| Tack Shooter | `towers/tack.png` |
| Ice Monkey | `towers/ice.png` |
| Glue Gunner | `towers/glue.png` |
| Desperado | `towers/desperado.png` |
| Sniper Monkey | `towers/sniper.png` |
| Monkey Sub | `towers/sub.png` |
| Monkey Buccaneer | `towers/buccaneer.png` |
| Monkey Ace | `towers/ace.png` |
| Heli Pilot | `towers/heli.png` |
| Mortar Monkey | `towers/mortar.png` |
| Dartling Gunner | `towers/dartling.png` |
| Wizard Monkey | `towers/wizard.png` |
| Super Monkey | `towers/super.png` |
| Ninja Monkey | `towers/ninja.png` |
| Alchemist | `towers/alchemist.png` |
| Druid | `towers/druid.png` |
| Mermonkey | `towers/mermonkey.png` |
| Skywarden | `towers/skywarden.png` |
| Banana Farm | `towers/farm.png` |
| Spike Factory | `towers/spike.png` |
| Monkey Village | `towers/village.png` |
| Engineer Monkey | `towers/engineer.png` |
| Beast Handler | `towers/beast.png` |

## Tier 5 upgrades (78): `static/img/game/upgrades/<tower-id>-<crosspath>.png`

The crosspath is the tier 5 code without dashes: `500`, `050` or `005`, the same code the tools use in share links.

| Tower | Top path | Middle path | Bottom path |
|---|---|---|---|
| Dart Monkey | Ultra-Juggernaut: `upgrades/dart-500.png` | Plasma Monkey Fan Club: `upgrades/dart-050.png` | Crossbow Master: `upgrades/dart-005.png` |
| Boomerang Monkey | Glaive Lord: `upgrades/boomerang-500.png` | Perma Charge: `upgrades/boomerang-050.png` | MOAB Domination: `upgrades/boomerang-005.png` |
| Bomb Shooter | Bloon Crush: `upgrades/bomb-500.png` | MOAB Eliminator: `upgrades/bomb-050.png` | Bomb Blitz: `upgrades/bomb-005.png` |
| Tack Shooter | Inferno Ring: `upgrades/tack-500.png` | Super Maelstrom: `upgrades/tack-050.png` | The Tack Zone: `upgrades/tack-005.png` |
| Ice Monkey | Super Brittle: `upgrades/ice-500.png` | Absolute Zero: `upgrades/ice-050.png` | Icicle Impale: `upgrades/ice-005.png` |
| Glue Gunner | The Bloon Solver: `upgrades/glue-500.png` | Glue Storm: `upgrades/glue-050.png` | Super Glue: `upgrades/glue-005.png` |
| Desperado | The Blazing Sun: `upgrades/desperado-500.png` | Golden Justice: `upgrades/desperado-050.png` | The Desert Phantom: `upgrades/desperado-005.png` |
| Sniper Monkey | Cripple MOAB: `upgrades/sniper-500.png` | Elite Sniper: `upgrades/sniper-050.png` | Elite Defender: `upgrades/sniper-005.png` |
| Monkey Sub | Energizer: `upgrades/sub-500.png` | Pre-emptive Strike: `upgrades/sub-050.png` | Sub Commander: `upgrades/sub-005.png` |
| Monkey Buccaneer | Carrier Flagship: `upgrades/buccaneer-500.png` | Pirate Lord: `upgrades/buccaneer-050.png` | Trade Empire: `upgrades/buccaneer-005.png` |
| Monkey Ace | Sky Shredder: `upgrades/ace-500.png` | Tsar Bomba: `upgrades/ace-050.png` | Flying Fortress: `upgrades/ace-005.png` |
| Heli Pilot | Apache Prime: `upgrades/heli-500.png` | Special Poperations: `upgrades/heli-050.png` | Comanche Commander: `upgrades/heli-005.png` |
| Mortar Monkey | The Biggest One: `upgrades/mortar-500.png` | Pop and Awe: `upgrades/mortar-050.png` | Blooncineration: `upgrades/mortar-005.png` |
| Dartling Gunner | Ray of Doom: `upgrades/dartling-500.png` | M.A.D: `upgrades/dartling-050.png` | Bloon Exclusion Zone: `upgrades/dartling-005.png` |
| Wizard Monkey | Archmage: `upgrades/wizard-500.png` | Wizard Lord Phoenix: `upgrades/wizard-050.png` | Prince of Darkness: `upgrades/wizard-005.png` |
| Super Monkey | True Sun God: `upgrades/super-500.png` | The Anti-Bloon: `upgrades/super-050.png` | Legend of the Night: `upgrades/super-005.png` |
| Ninja Monkey | Grandmaster Ninja: `upgrades/ninja-500.png` | Grand Saboteur: `upgrades/ninja-050.png` | Master Bomber: `upgrades/ninja-005.png` |
| Alchemist | Permanent Brew: `upgrades/alchemist-500.png` | Total Transformation: `upgrades/alchemist-050.png` | Bloon Master Alchemist: `upgrades/alchemist-005.png` |
| Druid | Monarch of Storms: `upgrades/druid-500.png` | Spirit of the Forest: `upgrades/druid-050.png` | Avatar of Wrath: `upgrades/druid-005.png` |
| Mermonkey | Lord of the Abyss: `upgrades/mermonkey-500.png` | Popseidon: `upgrades/mermonkey-050.png` | The Final Harmonic: `upgrades/mermonkey-005.png` |
| Skywarden | Farwind Seer: `upgrades/skywarden-500.png` | Stormwrath Archon: `upgrades/skywarden-050.png` | Winter's Mercy: `upgrades/skywarden-005.png` |
| Banana Farm | Banana Central: `upgrades/farm-500.png` | Monkey-Nomics: `upgrades/farm-050.png` | Monkey Wall Street: `upgrades/farm-005.png` |
| Spike Factory | Super Mines: `upgrades/spike-500.png` | Carpet of Spikes: `upgrades/spike-050.png` | Perma-Spike: `upgrades/spike-005.png` |
| Monkey Village | Primary Expertise: `upgrades/village-500.png` | Homeland Defense: `upgrades/village-050.png` | Monkeyopolis: `upgrades/village-005.png` |
| Engineer Monkey | Sentry Champion: `upgrades/engineer-500.png` | Ultraboost: `upgrades/engineer-050.png` | XXXL Trap: `upgrades/engineer-005.png` |
| Beast Handler | Megalodon: `upgrades/beast-500.png` | Giganotosaurus: `upgrades/beast-050.png` | Pouākai: `upgrades/beast-005.png` |

## Paragons (14): `static/img/game/paragons/<tower-id>.png`

The site's data lists 14 Paragons (the request said 13: the data wins, so check the extra one in game).

| Paragon | Tower | File |
|---|---|---|
| Apex Plasma Master | Dart Monkey | `paragons/dart.png` |
| Glaive Dominus | Boomerang Monkey | `paragons/boomerang.png` |
| Ballistic Obliteration Missile Bunker | Bomb Shooter | `paragons/bomb.png` |
| Crucible of Steel and Flame | Tack Shooter | `paragons/tack.png` |
| Herald of Everfrost | Ice Monkey | `paragons/ice.png` |
| S.P.I.D.E.R. Monkey | Sniper Monkey | `paragons/sniper.png` |
| Nautic Siege Core | Monkey Sub | `paragons/sub.png` |
| Navarch of the Seas | Monkey Buccaneer | `paragons/buccaneer.png` |
| Goliath Doomship | Monkey Ace | `paragons/ace.png` |
| Magus Perfectus | Wizard Monkey | `paragons/wizard.png` |
| Ascended Shadow | Ninja Monkey | `paragons/ninja.png` |
| Root of all Nature | Druid | `paragons/druid.png` |
| Mega Massive Munitions Factory | Spike Factory | `paragons/spike.png` |
| Master Builder | Engineer Monkey | `paragons/engineer.png` |

## Heroes (18): `static/img/game/heroes/<hero-id>.png`

Default skin only. Skins would need their own names later.

| Hero | File |
|---|---|
| Quincy | `heroes/quincy.png` |
| Gwendolin | `heroes/gwendolin.png` |
| Striker Jones | `heroes/striker.png` |
| Obyn Greenfoot | `heroes/obyn.png` |
| Captain Churchill | `heroes/churchill.png` |
| Benjamin | `heroes/benjamin.png` |
| Ezili | `heroes/ezili.png` |
| Pat Fusty | `heroes/pat.png` |
| Adora | `heroes/adora.png` |
| Admiral Brickell | `heroes/brickell.png` |
| Etienne | `heroes/etienne.png` |
| Sauda | `heroes/sauda.png` |
| Psi | `heroes/psi.png` |
| Geraldo | `heroes/geraldo.png` |
| Corvus | `heroes/corvus.png` |
| Rosalia | `heroes/rosalia.png` |
| Silas | `heroes/silas.png` |
| Dan D'Monke | `heroes/dan.png` |

## Maps (90): `static/img/game/maps/<map-id>.png`

A clean overhead shot of the empty map at the start of a game (no towers, no game UI), 16:9.

### Beginner (26)

| Map | File |
|---|---|
| Alpine Run | `maps/alpine-run.png` |
| Candy Falls | `maps/candy-falls.png` |
| Carved | `maps/carved.png` |
| Cubism | `maps/cubism.png` |
| End Of The Road | `maps/end-of-the-road.png` |
| Four Circles | `maps/four-circles.png` |
| Frozen Over | `maps/frozen-over.png` |
| Hedge | `maps/hedge.png` |
| In The Loop | `maps/in-the-loop.png` |
| Logs | `maps/logs.png` |
| Lotus Island | `maps/lotus-island.png` |
| Middle of the Road | `maps/middle-of-the-road.png` |
| Monkey Meadow | `maps/monkey-meadow.png` |
| One Two Tree | `maps/one-two-tree.png` |
| Park Path | `maps/park-path.png` |
| Resort | `maps/resort.png` |
| Scrapyard | `maps/scrapyard.png` |
| Skates | `maps/skates.png` |
| Skull Tweak | `maps/skull-tweak.png` |
| Spa Pits | `maps/spa-pits.png` |
| The Cabin | `maps/the-cabin.png` |
| Three Mines 'Round | `maps/three-mines-round.png` |
| Tinkerton | `maps/tinkerton.png` |
| Town Center | `maps/town-center.png` |
| Tree Stump | `maps/tree-stump.png` |
| Winter Park | `maps/winter-park.png` |

### Intermediate (26)

| Map | File |
|---|---|
| Adora's Temple | `maps/adoras-temple.png` |
| Ancient Portal | `maps/ancient-portal.png` |
| Balance | `maps/balance.png` |
| Bazaar | `maps/bazaar.png` |
| Bloonarius Prime | `maps/bloonarius-prime.png` |
| Chutes | `maps/chutes.png` |
| Covered Garden | `maps/covered-garden.png` |
| Cracked | `maps/cracked.png` |
| Downstream | `maps/downstream.png` |
| Encrypted | `maps/encrypted.png` |
| Firing Range | `maps/firing-range.png` |
| Haunted | `maps/haunted.png` |
| KartsNDarts | `maps/kartsndarts.png` |
| Lost Crevasse | `maps/lost-crevasse.png` |
| Luminous Cove | `maps/luminous-cove.png` |
| Moon Landing | `maps/moon-landing.png` |
| Polyphemus | `maps/polyphemus.png` |
| Protect The Yacht | `maps/protect-the-yacht.png` |
| Quarry | `maps/quarry.png` |
| Quiet Street | `maps/quiet-street.png` |
| Rake | `maps/rake.png` |
| Spice Islands | `maps/spice-islands.png` |
| Spring Spring | `maps/spring-spring.png` |
| Streambed | `maps/streambed.png` |
| Sulfur Springs | `maps/sulfur-springs.png` |
| Water Park | `maps/water-park.png` |

### Advanced (24)

| Map | File |
|---|---|
| Another Brick | `maps/another-brick.png` |
| Ascent | `maps/ascent.png` |
| Cargo | `maps/cargo.png` |
| Castle Revenge | `maps/castle-revenge.png` |
| Cornfield | `maps/cornfield.png` |
| Dark Path | `maps/dark-path.png` |
| Enchanted Glade | `maps/enchanted-glade.png` |
| Erosion | `maps/erosion.png` |
| Geared | `maps/geared.png` |
| High Finance | `maps/high-finance.png` |
| Last Resort | `maps/last-resort.png` |
| Mesa | `maps/mesa.png` |
| Midnight Mansion | `maps/midnight-mansion.png` |
| Mushroom Grotto | `maps/mushroom-grotto.png` |
| Off The Coast | `maps/off-the-coast.png` |
| Party Parade | `maps/party-parade.png` |
| Pat's Pond | `maps/pats-pond.png` |
| Peninsula | `maps/peninsula.png` |
| Ship Capture | `maps/ship-capture.png` |
| Spillway | `maps/spillway.png` |
| Sunken Columns | `maps/sunken-columns.png` |
| Sunset Gulch | `maps/sunset-gulch.png` |
| Underground | `maps/underground.png` |
| X Factor | `maps/x-factor.png` |

### Expert (14)

| Map | File |
|---|---|
| #Ouch | `maps/ouch.png` |
| Blons | `maps/blons.png` |
| Bloody Puddles | `maps/bloody-puddles.png` |
| Dark Castle | `maps/dark-castle.png` |
| Dark Dungeons | `maps/dark-dungeons.png` |
| Flooded Valley | `maps/flooded-valley.png` |
| Glacial Trail | `maps/glacial-trail.png` |
| Infernal | `maps/infernal.png` |
| Muddy Puddles | `maps/muddy-puddles.png` |
| Quad | `maps/quad.png` |
| Ravine | `maps/ravine.png` |
| Sanctuary | `maps/sanctuary.png` |
| Tricky Tracks | `maps/tricky-tracks.png` |
| Workshop | `maps/workshop.png` |

## Bloons (17): `static/img/game/bloons/<bloon-id>.png`

The plain bloon. Camo, Regrow and Fortified are drawn by the site as markers on top, so they need no extra files.

| Bloon | File |
|---|---|
| Red | `bloons/red.png` |
| Blue | `bloons/blue.png` |
| Green | `bloons/green.png` |
| Yellow | `bloons/yellow.png` |
| Pink | `bloons/pink.png` |
| Black | `bloons/black.png` |
| White | `bloons/white.png` |
| Purple | `bloons/purple.png` |
| Zebra | `bloons/zebra.png` |
| Lead | `bloons/lead.png` |
| Rainbow | `bloons/rainbow.png` |
| Ceramic | `bloons/ceramic.png` |
| MOAB | `bloons/moab.png` |
| BFB | `bloons/bfb.png` |
| ZOMG | `bloons/zomg.png` |
| DDT | `bloons/ddt.png` |
| BAD | `bloons/bad.png` |

## Bosses (7): `static/img/game/bosses/<boss-id>.png`

The ids follow the boss events guide (`guides/boss-events/`).

| Boss | File |
|---|---|
| Bloonarius | `bosses/bloonarius.png` |
| Lych | `bosses/lych.png` |
| Vortex | `bosses/vortex.png` |
| Dreadbloon | `bosses/dreadbloon.png` |
| Phayze | `bosses/phayze.png` |
| Blastapopoulos | `bosses/blastapopoulos.png` |
| Diamondback | `bosses/diamondback.png` |

## Credit and licences

- **On every page that shows one** (footer, next to the disclaimer): "Game images © Ninja Kiwi. Used to identify towers, heroes, maps and bloons in an unofficial fan guide."
- **Outside the repo's licences.** `LICENSE` (code) and `DATA-LICENSE.md` (data) don't cover `static/img/game/`. Each of those files gets one sentence saying so, and a `static/img/game/README.md` says it again for anyone who copies the folder.
- **Takedown:** "If you hold the rights to an image and want it removed, open an issue on the GitHub repo (the site's Report an error link) and it comes down." The same sentence goes on the About page.
- **Don't** use the BTD6 logo, Ninja Kiwi's logo or anything that makes the site look official. The "Unofficial BTD6 fan project" strip stays.

## Lines that would change if the owner says yes

These stay as they are until the owner decides:

- `docs/DESIGN.md`, "Direction": "It borrows the game's UI language, but uses **none of its art**."
- `templates/base.html`, the footer disclaimer on every page: "No game art is used here."
- `README.md`: "No game art is included."
- `templates/_macros.html`, the comment "Icons are drawn here, no game art."

The site's drawn icons (balloon mark, tool icons, the "Me" monkey face) stay either way: they are ours, not game art.
