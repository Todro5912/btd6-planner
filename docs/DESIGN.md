# Monkey Intel: design system

**Monkey Intel by Solou**, an unofficial BTD6 fan project by Todro5912. The names live in one place, `site.json` (`project`, `brand`, `author`), so they are easy to change.

## Direction: "game-native"
The site should feel like it belongs next to BTD6: chunky, tactile and bright. It borrows the game's UI language, but uses **none of its art**. It must NOT look like a generic AI-generated site.

### Banned (these read as AI-made)
- Soft drop shadows, glassmorphism, gradients on backgrounds or buttons, and purple-blue anything.
- Pastel pill chips everywhere, `rounded-xl` on every box, and an accent rail on cards.
- Emoji as icons. Inter / Space Grotesk / Poppins.
- A centred hero with a big headline and two buttons.
- Walls of grey body text, and "✨"-style copy.
- Identical card grids for everything.

### Language
- **Outlines:** every interactive or panel element has a solid ink outline, 2.5–3px, `--ink`.
- **Hard offset shadow:** `box-shadow: 0 4px 0 var(--ink)` on buttons and panels. When a button is pressed, translate it down 3px and shrink the shadow. That's the tactile BTD6 button.
- **Radius:** small and consistent, 6px on panels and 999px only on round counters. Never mix in other values.
- **Display type:** **Luckiest Guy** (Google Fonts), uppercase, with a 2px ink outline (`-webkit-text-stroke` plus `paint-order: stroke fill`) and a 3px hard ink shadow beneath. Use it for page titles, section heads and big numbers only.
- **Body type:** **Rubik** at 400/500/700. Numbers use `font-variant-numeric: tabular-nums`. Use **JetBrains Mono** only for crosspath codes like `2-0-4` and round numbers. Everything else, including descriptions and key hints, is Rubik.
- **Palette (light):**

  | Token | Value |
  |---|---|
  | `--grass` | `#3E9B2F` (primary actions, header band) |
  | `--sky` | `#3FA9E6` (links, secondary buttons) |
  | `--banana` | `#FFD23F` (highlights, money) |
  | `--wood` | `#8A5A2B` (panel headers, like BTD6 wooden UI) |
  | `--paper` | `#FFF8E7` (page) |
  | `--panel` | `#FFFFFF` |
  | `--ink` | `#1C1A17` |
  | `--muted` | `#6B5E4E` |

- **Semantic colours:** `--danger #E2412E`, `--ok #2E8B3A`. Medal colours: bronze `#C77B3A`, silver `#A9B4BE`, gold `#F2B632`, black-border/CHIMPS `#1C1A17` with a gold edge.
- **Dark theme:** "night map". `--paper #13202B`, `--panel #1C2D3B`, `--ink #05090D`, with text in `#F4EEDC`. Grass, sky and banana shift slightly brighter. Outlines stay dark ink with lighter panel fills. Use the required `:root` / `prefers-color-scheme` / `[data-theme]` token pattern.
- **Credit strip:** a thin wood-deep band above the header: "Unofficial BTD6 fan project" on the left, a banana "Made by Todro5912" badge (code icon, GitHub link) on the right.
- **Header:** a grass-green band with a thick ink bottom border. The lock-up sits on the left: the balloon mark, "MONKEY INTEL" in Luckiest Guy and a small tilted banana "BY SOLOU" tag. The search box fills the middle on wide screens (from 1080px; below that a search button). The nav sits on the right as outlined tab buttons, active tab in banana, then the ☰ "More" menu. Menus are `<details>` dropdowns, so they work without JS.
- **Path display:** upgrades are shown the way the game shows them: 3 path rows × 5 pips. A filled pip is wood or banana; an empty pip is outlined. Crosspath codes go in mono.
- **Tables:** thick outer outline, zebra rows in a faint paper tint, a sticky header in wood with cream text, and tabular numbers.
- **Data badges:** "unverified" and "calculated" are small outlined badges (2px ink border, 6px radius, uppercase 11px Rubik); "unverified" has a dashed border. Never write them as parenthetical text. Data marks them with `{unverified}` / `{calc}` tokens.
- **About this data:** sources and method notes go in a collapsed `<details>` at the foot of the page, in small muted text, never in the body copy.
- **Difficulty / medals:** a small round medal dot with an ink outline. Don't use text-only pills.
- **Motion:** only button press feedback (80ms) and a 120ms search-panel open. Respect `prefers-reduced-motion`.
- **Density:** generous but not airy. Sentences are short. Facts go in tables and stat blocks, not paragraphs.

## Components added in 0.5 (for the tools stream too)

| Class | What it is |
|---|---|
| `.qcard`, `.fixes > .fix` | Quick card: rule in 22–30px Rubik with banana highlights on the key words, fix rows with the tower in 20px bold, the code in mono and the price in Luckiest Guy banana. Readable at arm's length on a phone. `.fix-support` (dashed) = a tower that helps others. |
| `.tile` | Home tile: display-type title, one-line rule, "from $X". |
| `.rchip`, `.rchip.danger` | Round chip: mono, outlined, links to `/rounds/<n>/`; red for run-ending rounds. |
| `.answer` (`.a-base`, `.a-up`, `.a-never`) | Key-answer chip: "Camo: 0-1-0 Night Vision Goggles". Clicking one sets the picker. |
| `.picker`, `.pk-*` | Crosspath picker: 3 rows of − / pips / +, big code and price, `.pop-y` / `.pop-n` chips. |
| `.pop-y`, `.pop-n` | Can / can't pop chips (grass fill vs dashed and struck through). |
| `.steps-list` | Short step bullets (strategy text split into sentences). |
| `.keyrounds` | Banana strip of key rounds on a map page. |
| `.threat`, `.need-item` | Round page threat chips and "what you need by now" rows. |
| `.menu`, `.menu-list` | Header dropdowns on `<details>`. |
| `.more` + `.more-btn` | Chunky expander. Use it for anything expert (records, build orders, proof lists). |
| `.btn-cream` | Cream button on wood (footer). |

**Copy rules:** body text max ~65ch. Long strategy text becomes 3–6 steps; semicolon chains split into separate steps. Cash in bold, round numbers as chips, tower names as links. Facts that aren't up for debate (immunities, first rounds) are stated plainly in the card rule, never hedged.

## Information architecture (0.5: 5 tabs + search + More)

| Tab | URL | Contains |
|---|---|---|
| Quick | / | in-game tiles → quick cards `/quick/<slug>/`, round lookup, run-ending rounds, "Between games" doors |
| Monkeys | /monkeys/ | sub-tabs Towers · Heroes · Paragons; detail pages /monkeys/<tower-id>/ and /heroes/<hero-id>/ |
| Maps | /maps/ | 90 maps filterable by difficulty, water and LoS; detail pages /maps/<map-id>/ |
| Guides | /guides/ | guides, the general Hard plan, Reference (Rounds, Bloons, Modes, MK, Glossary); /rounds/ and /rounds/<n>/ |
| Tools ▾ | /tools/ | Simulator /tools/simulator/, XP calculator /tools/xp/, Check my defence /tools/defence/ (pages from `src/pages/`, C3) |
| More (☰ and footer) | | Records /records/, Patch notes /patch/, Known issues, About /about/, A–Z /a-z/ |

- `/planner/` redirects to `/tools/simulator/` keeping the hash; `/guides/rounds/` redirects to `/rounds/`.
- **Search** in the header: "/" or typing in the header box opens the panel. It searches quick cards, tools, towers, upgrades, heroes, paragons, maps, guides, rounds, glossary terms, bosses and modes, plus the player words in `data/search-synonyms.json`.
- **Every detail page has** a breadcrumb, the game-version stamp, an "Open in Simulator" link (`#map=`, `#tower=`, `#hero=`) and "About this data" at the foot.
- **Footer:** "Made by Todro5912" in display type with GitHub, Report an error and About buttons; More and Tools link lists; the unofficial disclaimer, data version, sources and the theme toggle.
