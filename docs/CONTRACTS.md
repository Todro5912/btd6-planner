# 0.5 build: shared contracts between parallel workstreams

Three workstreams build 0.5 in parallel, each on its own git worktree and branch. An integrator merges them afterwards. Each stream may **only `git add` the paths it owns**.

**Never commit generated site output.** That covers `index.html`, `planner/`, `monkeys/`, `heroes/`, `maps/`, `guides/`, `records/`, `a-z/`, `tools/` output folders, `search-index.json` and `404.html`. You may build locally to test. The integrator rebuilds.

| Stream | Branch | Owns (may add or modify) |
|---|---|---|
| D: data correctness | `wt-data` | `data/pop-model.json` (new), `data/heroes-levels.json` (new), `data/bloons.json` (new), `data/towers.json`, `content/guides/bloons.md`, `content/guides/danger-rounds.md`, `docs/POP-MODEL.md` |
| S: tools | `wt-tools` | `src/**` (planner → simulator, XP calculator, check-my-defence, synergy engine), `data/synergy-rules.json` (new) |
| U: UI, IA and beginner layer | `wt-ui` | `templates/**`, `static/**`, `tools/**`, `site.json`, `content/guides/*.md` except the two that D owns (frontmatter and structure only; facts stay), `docs/DESIGN.md`, `README.md`, `CHANGELOG.md`, `data/search-synonyms.json` (new), `content/quick/**` (new) |

## C1. Pop model: `data/pop-model.json` (produced by D, consumed by S and U)

This replaces the per-upgrade `grants` tags as the source of truth for "can it pop X". It answers two separate questions: **can it damage** this bloon type at all, and **does it get a bonus** against it.

```json
{
  "version": "57.4",
  "bloonImmunities": { "lead": ["sharp", "cold", "energy"], "black": ["explosion"], "...": [] },
  "towers": {
    "sniper": {
      "camo":   {"any": [[{"path": 1, "tier": 1}]], "note": "Night Vision Goggles"},
      "lead":   {"any": [[{"path": 0, "tier": 1}]], "note": "Full Metal Jacket"},
      "purple": {"any": [["base"]]},
      "black":  {"any": [["base"]]},
      "white":  {"any": [["base"]]},
      "zebra":  {"any": [["base"]]},
      "frozen": {"any": [[{"path": 0, "tier": 1}]]},
      "moab":   {"any": [["base"]], "note": "can damage MOAB-class from base"},
      "ddt":    {"derived": true},
      "bad":    {"any": [["base"]]},
      "fortified": {"any": [["base"]], "note": "fortified = extra HP, never an immunity"},
      "bonuses": [{"vs": "moab", "from": {"path": 0, "tier": 4}, "note": "Maim MOAB stun"}],
      "confidence": "high",
      "sources": ["..."]
    }
  }
}
```

**Rules:**
- **`any`** is a list of alternatives. Each alternative is a list of requirements, and ALL of them must hold (AND).
  - `{"path": p, "tier": t}` holds when the chosen crosspath has `tiers[p] >= t`.
  - `"base"` always holds.
  - `"never"` is used alone and means not possible.
- **`ddt`** is derived: camo AND lead AND black, all satisfied by the **same** crosspath. Mark "derived" and let code compute it.
- **External fixes:** global things that grant camo or lead (Village Radar/MIB, Alchemist acid, Etienne drone, and so on) go in the top-level key `"supportFixes": [{"grants": "camo", "source": "village", "req": {"path": 1, "tier": 2}, "radius": "village range"}]`.
- **Heroes:** `"heroes": {"quincy": {"camo": {"level": 0}, "lead": {"level": 0}}}` uses hero levels. `{"level": null}` means never.

## C2. Hero levels: `data/heroes-levels.json` (D)

```json
{"quincy": {"cost": 540, "levels": {"1": "...", "3": "...", "10": "..."}, "abilities": [{"name": "", "level": 3, "cooldown": 0}], "camoLevel": null, "leadLevel": null, "notes": ""}}
```

## C3. Tool pages (S produces, U's build wraps)

- S writes each tool as `src/pages/<slug>.body.html`, a fragment with no `<html>`, header or footer. Scripts and CSS go in `src/pages/assets/` and are referenced as `{{BASE}}static/tools/<file>`.
- U's build wraps every `src/pages/*.body.html` into `/tools/<slug>/index.html` with the site header and footer, copies `src/pages/assets/*` to `/static/tools/`, and adds the pages to search and nav.
- **Slugs:**
  - `simulator`: the planner grown into a round timeline;
  - `xp`: the XP and progression calculator;
  - `defence`: "check my defence".
- `/planner/` must redirect to `/tools/simulator/`, keeping the hash.
- S styles only with the site CSS tokens (`--grass`, `--sky`, `--banana`, `--wood`, `--paper`, `--panel`, `--ink`, `--text`, `--muted`, `--danger`, `--ok`) and the shared component classes U documents in `docs/DESIGN.md`. If S needs a new component, put it in `src/pages/assets/tools.css` using tokens only.

## C4. Search synonyms: `data/search-synonyms.json` (U)

Maps player words to targets:
- "camo" → camo quick-answer card;
- "pops lead" → the lead card;
- "r63" → round 63;
- "black border" → the glossary entry.

## C5. Quick answers: `content/quick/*.md` (U, using D's pop-model)

One card per in-game question:
- camo, lead, purple, black/zebra, white/frozen, fortified, MOAB answers, DDTs, the R63 ceramic rush, the R95/R98/R100 checks;
- "is this map water / LoS" goes in the map filter, not a card.

**Cards are generated from pop-model.json and towers.json** (cheapest fixes, priced by difficulty) wherever possible, not hand-typed.
