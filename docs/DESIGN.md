# Monkey Intel: design system

Working name **Monkey Intel**. This is an unofficial BTD6 hub. Keep the name in one place, `site.json`, so it's easy to rename.

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
- **Header:** a grass-green band with a thick ink bottom border. The logo wordmark sits on the left in Luckiest Guy. The nav sits on the right as outlined tab buttons, with the active tab in banana. The search button shows its "/" keyboard hint.
- **Path display:** upgrades are shown the way the game shows them: 3 path rows × 5 pips. A filled pip is wood or banana; an empty pip is outlined. Crosspath codes go in mono.
- **Tables:** thick outer outline, zebra rows in a faint paper tint, a sticky header in wood with cream text, and tabular numbers.
- **Data badges:** "unverified" and "calculated" are small outlined badges (2px ink border, 6px radius, uppercase 11px Rubik); "unverified" has a dashed border. Never write them as parenthetical text. Data marks them with `{unverified}` / `{calc}` tokens.
- **About this data:** sources and method notes go in a collapsed `<details>` at the foot of the page, in small muted text, never in the body copy.
- **Difficulty / medals:** a small round medal dot with an ink outline. Don't use text-only pills.
- **Motion:** only button press feedback (80ms) and a 120ms search-panel open. Respect `prefers-reduced-motion`.
- **Density:** generous but not airy. Sentences are short. Facts go in tables and stat blocks, not paragraphs.

## Information architecture (keep it simple: 5 tabs + search)

| Tab | URL | Contains |
|---|---|---|
| Planner | /planner/ | the existing planner tool, re-skinned |
| Monkeys | /monkeys/ | sub-tabs Towers · Heroes · Paragons; detail pages /monkeys/<tower-id>/ and /heroes/<hero-id>/ |
| Maps | /maps/ | 90 maps filterable by difficulty, water and LoS; detail pages /maps/<map-id>/ |
| Guides | /guides/ | guides list plus a Reference group (Rounds, Bloons, Modes, Monkey Knowledge, Glossary); /guides/<slug>/ |
| Records | /records/ | BTD6 Index data: solo-CHIMPS (2MP) and least-cost CHIMPS per map, lane lengths |

- **Search** in the header: a "/" shortcut opens a panel that searches every tower, upgrade, hero, paragon, map, guide and round.
- **A–Z index** at /a-z/, linked in the footer.
- **Home page:**
  - a search box;
  - 4 doors: "Plan a game", "Find a monkey", "Find a map", "Farm XP";
  - a "What's in 57.4" strip;
  - the version stamp.

  No marketing hero.
- **Every detail page has:**
  - a breadcrumb;
  - the game-version stamp;
  - an "Open in Planner" link that pre-fills the planner (via `#map=` or `#tower=` hash read by the planner);
  - "Related" links, e.g. tower → maps where it's 2MP-proven, map → its strong towers.
- **Footer:** the unofficial disclaimer, the data version, credits, A–Z, GitHub.
