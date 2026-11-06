"""Known-truth and schema tests for data/pop-model.json (contract C1), data/heroes-levels.json (C2)
and data/bloons.json.

Plain Python, no dependencies. Run either way:
    python3 data/_tests/test_pop_model.py
    python3 -m pytest data/_tests/test_pop_model.py

Every known-truth assertion names the source of the fact. Short keys used below:
  BW-DT   bloonswiki damage-type bitflag table      https://www.bloonswiki.com/Sharp
  FD-CAMO fandom BTD6 camo table                    https://bloons.fandom.com/wiki/Camo_Bloon/Strategies
  FD-LEAD fandom BTD6 lead table                    https://bloons.fandom.com/wiki/Lead-Popping_Power
  FD-PURP fandom Purple Bloon immune list           https://bloons.fandom.com/wiki/Purple_Bloon
  FD-EN   fandom Energy page                        https://bloons.fandom.com/wiki/Energy
  FD-FRZ  fandom Frozen Bloon page                  https://bloons.fandom.com/wiki/Frozen_Bloon
  FD-ICE  fandom Ice Monkey (BTD6)                  https://bloons.fandom.com/wiki/Ice_Monkey_(BTD6)
  FD-GLUE fandom Glue Gunner (BTD6)                 https://bloons.fandom.com/wiki/Glue_Gunner_(BTD6)
  FD-SUB  fandom Monkey Sub / Advanced Intel (BTD6)
  BW-FLR  bloonswiki Signal Flare (BTD6)            https://www.bloonswiki.com/Signal_Flare_(BTD6)
  BW-DESP bloonswiki Desperado (BTD6)
  BW-MER  bloonswiki Mermonkey (BTD6)
  NK-57   Ninja Kiwi v57 patch notes (Steam announcements)
  V25     BTD6 v25.0 patch notes (steamdb 6537293)
  FORT    fandom Fortified Bloon: fortified adds HP only
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.dirname(HERE)


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


MODEL = load("pop-model.json")
TOWERS_JSON = load("towers.json")
PROPS = ["camo", "lead", "purple", "black", "white", "zebra", "frozen", "moab", "bad", "fortified"]
REQUIRED_KEYS = PROPS + ["ddt", "bonuses", "confidence", "sources"]


# ---------------------------------------------------------------- evaluator
def parse(code):
    tiers = [int(x) for x in code.split("-")]
    assert len(tiers) == 3, code
    return tiers


def legal(tiers):
    return (all(0 <= t <= 5 for t in tiers)
            and sum(1 for t in tiers if t > 0) <= 2
            and sum(1 for t in tiers if t > 2) <= 1)


def holds(r, tiers):
    if r == "base":
        return True
    if r == "never":
        return False
    if "maxTier" in r:
        return tiers[r["path"]] <= r["maxTier"]
    return tiers[r["path"]] >= r["tier"]


def any_holds(spec, tiers):
    return any(all(holds(r, tiers) for r in alt) for alt in spec["any"])


def can(tower, code, prop):
    tiers = parse(code)
    assert legal(tiers), "illegal crosspath " + code
    t = MODEL["towers"][tower]
    if prop == "ddt":
        d = t["ddt"]
        if d.get("derived"):
            return all(any_holds(t[p], tiers) for p in ("camo", "lead", "black"))
        return any_holds(d, tiers)
    return any_holds(t[prop], tiers)


def hero(h, prop):
    return MODEL["heroes"][h][prop]["level"]


# ---------------------------------------------------------------- test runner
RESULTS = {"pass": 0, "fail": []}


def check(cond, msg):
    if cond:
        RESULTS["pass"] += 1
    else:
        RESULTS["fail"].append(msg)


# ---------------------------------------------------------------- schema (C1)
def t_schema():
    check(MODEL.get("version") == "57.4", "version must be 57.4")
    check(isinstance(MODEL.get("bloonImmunities"), dict), "bloonImmunities missing")
    ids = sorted(t["id"] for t in TOWERS_JSON["towers"])
    check(sorted(MODEL["towers"]) == ids, "pop-model must cover exactly the towers.json towers")
    check(len(MODEL["towers"]) == 26, "26 towers expected")
    for tid, t in MODEL["towers"].items():
        for k in REQUIRED_KEYS:
            check(k in t, "%s missing %s" % (tid, k))
        check(t.get("confidence") in ("high", "medium", "low"), tid + " confidence")
        check(isinstance(t.get("sources"), list) and t["sources"], tid + " needs sources")
        for p in PROPS + ["ddt"]:
            spec = t.get(p, {})
            if p == "ddt" and spec.get("derived"):
                check("any" not in spec, tid + " derived ddt must not also carry any")
                continue
            alts = spec.get("any")
            check(isinstance(alts, list) and alts, "%s.%s needs a non-empty any" % (tid, p))
            for alt in alts or []:
                check(isinstance(alt, list) and alt, "%s.%s alternative must be a non-empty list" % (tid, p))
                if "never" in alt:
                    check(alt == ["never"], "%s.%s: 'never' must be used alone" % (tid, p))
                for r in alt:
                    ok = r in ("base", "never") or (
                        isinstance(r, dict) and r.get("path") in (0, 1, 2)
                        and (("tier" in r and 1 <= r["tier"] <= 5) or ("maxTier" in r and 0 <= r["maxTier"] <= 4)))
                    check(ok, "%s.%s bad requirement %r" % (tid, p, r))
                # every alternative must be reachable by at least one legal crosspath
                if alt != ["never"]:
                    reach = any(legal([a, b, c]) and all(holds(r, [a, b, c]) for r in alt)
                                for a in range(6) for b in range(6) for c in range(6))
                    check(reach, "%s.%s alternative %r is unreachable" % (tid, p, alt))
            for c in spec.get("conditional", []):
                check("req" in c and "note" in c, "%s.%s conditional needs req+note" % (tid, p))
        for b in t.get("bonuses", []):
            check({"vs", "from", "note"} <= set(b), tid + " bonus needs vs/from/note")
    for s in MODEL.get("supportFixes", []):
        check({"grants", "source", "req", "radius"} <= set(s), "supportFix keys: %r" % s)
    for h, v in MODEL.get("heroes", {}).items():
        check("level" in v.get("camo", {}) and "level" in v.get("lead", {}), h + " hero camo/lead level")
    check(len(MODEL.get("heroes", {})) == 18, "18 heroes expected")


def t_fortified_matches_base():
    # FORT: fortified never blocks damage. For every tower and every legal crosspath, it can damage
    # fortified exactly when it can damage at all (= can pop a plain red-type bloon, i.e. black|white|purple|lead).
    for tid in MODEL["towers"]:
        for a in range(6):
            for b in range(6):
                for c in range(6):
                    tiers = [a, b, c]
                    if not legal(tiers):
                        continue
                    code = "%d-%d-%d" % tuple(tiers)
                    damages = any(can(tid, code, p) for p in ("black", "white", "purple", "lead", "moab"))
                    if can(tid, code, "fortified") != damages:
                        check(False, "%s %s fortified != can-damage" % (tid, code))
                        return
    check(True, "fortified")


def t_bad_matches_moab():
    # BAD is MOAB-class: same damage rule (fandom/bloonswiki BAD page: immune to slows/stuns/knockback, not damage).
    for tid, t in MODEL["towers"].items():
        check(t["bad"]["any"] == t["moab"]["any"], tid + " bad must equal moab")


def t_derived_ddt_safe():
    # A DDT is MOAB-class, so the strict rule is camo AND lead AND black AND moab on one crosspath.
    # C1's derived rule drops "moab"; it is only allowed where both rules agree on every legal crosspath.
    for tid, t in MODEL["towers"].items():
        if not t["ddt"].get("derived"):
            continue
        for a in range(6):
            for b in range(6):
                for c in range(6):
                    tiers = [a, b, c]
                    if not legal(tiers):
                        continue
                    three = all(any_holds(t[p], tiers) for p in ("camo", "lead", "black"))
                    if three and not any_holds(t["moab"], tiers):
                        check(False, "%s %s: derived ddt passes but tower can't damage MOAB-class" % (tid, tiers))
                        return
    check(True, "derived ddt safe")


# ---------------------------------------------------------------- known truths
def t_known_truths():
    imm = MODEL["bloonImmunities"]
    # Damage-type system
    check(set(imm["lead"]) >= {"sharp", "cold", "energy"}, "Lead immune to Sharp, Cold, Energy [BW-DT, FD-EN]")
    check("explosion" in imm["black"], "Black immune to Explosion [BW-DT]")
    check("cold" in imm["white"], "White immune to Cold [BW-DT]")
    check({"energy", "fire", "plasma"} <= set(imm["purple"]), "Purple immune to Energy/Fire/Plasma [FD-PURP]")
    check("sharp" in imm["frozen"], "Frozen immune to Sharp [FD-FRZ]")
    check(imm["fortified"] == [], "Fortified has no damage immunity [FORT]")
    check({"sharp", "explosion"} <= set(imm["ddt"]), "DDT immune to Sharp and Explosion [V25, BW-DT]")
    check(set(imm["zebra"]) >= {"explosion", "cold"}, "Zebra = Black + White immunities [BW-DT]")
    check(MODEL["damageTypes"]["normal"] == [], "Normal pops everything [BW-DT]")
    check("purple" not in MODEL["damageTypes"]["acid"], "Acid pops Purple [BW-DT]")

    # Dart
    check(not can("dart", "0-0-0", "lead"), "Dart 0-0-0 can't pop Lead [FD-LEAD]")
    check(can("dart", "0-0-0", "black"), "Dart 0-0-0 pops Black (Sharp) [BW-DT]")
    check(can("dart", "0-0-0", "purple"), "Dart 0-0-0 pops Purple [FD-PURP: not listed immune]")
    check(not can("dart", "0-0-1", "camo"), "Dart 0-0-1 has no camo [FD-CAMO x-x-2]")
    check(can("dart", "0-0-2", "camo"), "Dart 0-0-2 sees camo [FD-CAMO]")
    check(can("dart", "4-0-0", "lead"), "Juggernaut pops Lead [FD-LEAD]")
    check(can("dart", "4-0-2", "ddt"), "Dart 4-0-2 can hit DDTs [FD-LEAD + FD-CAMO; audit]")
    check(can("dart", "0-0-0", "moab"), "Dart 0-0-0 damages MOABs [audit: base attacks damage MOABs]")
    # Bomb / Mortar
    check(not can("bomb", "0-0-0", "black"), "Bomb 0-0-0 can't pop Black [BW-DT explosion]")
    check(can("bomb", "0-0-0", "lead"), "Bomb pops Lead by default [FD-LEAD]")
    check(not can("bomb", "2-0-4", "camo"), "Bomb has no camo outside Bomb Blitz ability [FD-CAMO x-x-5 passive]")
    check(not can("mortar", "0-0-0", "camo"), "Mortar 0-0-0 can't hit camo [FD-CAMO x-x-3; BW-FLR]")
    check(not can("mortar", "0-0-1", "camo"), "Increased Accuracy gives no camo [FD Mortar page]")
    check(can("mortar", "0-0-3", "camo"), "Signal Flare gives camo detection [BW-FLR]")
    check(can("mortar", "0-3-0", "black"), "Heavy Shells pop Black [FD Mortar page]")
    check(can("mortar", "0-0-0", "lead"), "Mortar pops Lead by default [FD-LEAD]")
    # Ice
    check(not can("ice", "0-0-0", "white"), "Ice 0-0-0 can't pop White [BW-DT cold]")
    check(not can("ice", "0-0-0", "lead"), "Ice 0-0-0 can't pop Lead [BW-DT cold; FD-LEAD 2-x-x]")
    check(can("ice", "2-0-0", "lead") and can("ice", "2-0-0", "camo"), "Cold Snap: Lead + camo [FD-ICE]")
    check(not can("ice", "0-0-0", "frozen") and can("ice", "0-0-2", "frozen"), "Only Re-Freeze lets Ice hit Frozen [BW-DT note, FD-ICE]")
    check(not can("ice", "0-0-0", "moab"), "Ice 0-0-0 can't damage MOABs [FD-ICE]")
    check(not can("ice", "2-0-0", "ddt"), "Cold Snap can't affect blimps, so no DDT [FD-ICE MOAB weakness]")
    # Wizard
    check(not can("wizard", "0-0-0", "lead"), "Wizard 0-0-0 is Energy: no Lead [FD-EN]")
    check(not can("wizard", "0-0-0", "purple"), "Wizard 0-0-0 can't pop Purple [FD-PURP]")
    check(can("wizard", "0-0-0", "frozen"), "Wizard 0-0-0 pops Frozen [FD-FRZ cheapest default frozen popper]")
    check(can("wizard", "0-1-0", "lead"), "Fireball pops Lead [FD-LEAD]")
    check(can("wizard", "0-1-2", "ddt"), "Wizard 0-1-2 (Fireball + Monkey Sense) hits DDTs [FD-LEAD camo-lead note]")
    # Sniper
    check(can("sniper", "0-0-0", "moab"), "Sniper 0-0-0 damages MOABs [audit]")
    check(not can("sniper", "0-0-0", "lead"), "Sniper 0-0-0 can't pop Lead [FD-LEAD 1-x-x]")
    check(can("sniper", "1-1-0", "ddt"), "Sniper 1-1-0 hits DDTs [FD-LEAD; Steam camo-lead thread]")
    check(not can("sniper", "1-0-0", "ddt"), "Sniper 1-0-0 has no camo, so no DDT [FD-CAMO x-1-x]")
    # Super Monkey
    check(can("super", "0-0-0", "purple"), "Super 0-0-0 darts pop Purple [FD-PURP: only laser/plasma/Sun Avatar/Tech Terror listed]")
    check(not can("super", "1-0-0", "purple"), "Laser Blasts can't pop Purple [FD-EN, FD-PURP]")
    check(not can("super", "3-0-0", "purple"), "Sun Avatar can't pop Purple [FD-PURP]")
    check(can("super", "4-0-0", "purple"), "Sun Temple pops Purple [FD-PURP]")
    check(can("super", "2-0-2", "ddt"), "Super 2-0-2 (Plasma + Ultravision) hits DDTs [FD-LEAD]")
    # Sub
    check(not can("sub", "0-0-0", "camo"), "Sub 0-0-0 has no camo [FD-SUB range table 'No']")
    check(not can("sub", "2-0-0", "camo"), "Advanced Intel alone is not camo detection [FD-SUB]")
    check(can("sub", "0-2-0", "lead"), "Heat-tipped Darts pop Lead [FD-LEAD]")
    # Ninja / Spike / Alchemist / Glue
    check(can("ninja", "0-0-0", "camo"), "Ninja has innate camo [FD-CAMO]")
    check(not can("ninja", "0-0-0", "lead"), "Ninja shurikens are Sharp [FD-LEAD x-x-3]")
    check(can("spike", "0-0-0", "camo"), "Spike Factory hits camo by default [FD-CAMO]")
    check(can("spike", "2-0-0", "ddt"), "White Hot Spikes hit DDTs [FD-LEAD]")
    check(not can("alchemist", "4-0-0", "camo"), "Alchemist can never hit camo [FD-CAMO]")
    check(can("alchemist", "0-0-0", "lead") and can("alchemist", "0-0-0", "purple"), "Acid pops Lead and Purple [BW-DT]")
    check(not can("glue", "0-0-0", "lead") and can("glue", "2-0-0", "lead"), "Glue needs Corrosive to damage [FD-GLUE]")
    check(not can("glue", "0-0-3", "moab") and can("glue", "2-0-3", "moab"), "MOAB Glue alone deals no MOAB damage [FD-GLUE]")
    # Tack / Dartling / Mermonkey purple losses
    check(can("tack", "3-0-0", "purple") and not can("tack", "4-0-0", "purple"), "Ring of Fire loses Purple, Hot Shots doesn't [FD-PURP]")
    check(not can("dartling", "3-0-0", "purple") and can("dartling", "0-0-0", "purple"), "Laser Cannon loses Purple [FD-PURP]")
    check(can("dartling", "0-3-0", "ddt"), "Dartling 0-3-0 Hydra (+Advanced Targeting) hits DDTs [FD-LEAD natively detects camo leads]")
    check(not can("mermonkey", "0-3-0", "purple"), "Riptide Champion loses Purple [FD Mermonkey]")
    check(can("mermonkey", "0-0-1", "camo"), "Echosense Precision gives camo [BW-MER]")
    # Desperado / Skywarden / Beast / Engineer / Heli / Ace / Bucc
    check(can("desperado", "0-1-0", "camo") and can("desperado", "0-3-0", "lead"), "Eagle Eye camo, Deadeye Lead [BW-DESP]")
    check(can("skywarden", "0-2-0", "lead"), "Thundering Arc pops Lead since v57 [NK-57]")
    check(not can("beast", "0-0-0", "purple"), "Beast Handler staff can't pop Purple [FD-PURP]")
    check(can("engineer", "0-3-0", "camo") and not can("engineer", "0-2-0", "camo"), "Engineer camo only via Cleansing Foam [FD-CAMO x-3-x]")
    check(can("heli", "3-2-0", "ddt") and not can("heli", "0-2-3", "ddt"), "Heli 3-2-0 hits DDTs; MOAB Shove missiles are explosive [FD-LEAD, BW-DT]")
    check(not can("ace", "0-2-0", "ddt"), "Ace 0-2-0 pineapples are explosive: no DDT [BW-DT, V25]")
    check(can("buccaneer", "0-2-2", "ddt"), "Bucc 0-2-2 (Hot Shot fire + Crow's Nest) hits DDTs [FD-LEAD]")
    check(not can("ninja", "0-0-3", "ddt"), "Flash Bomb is explosive: no DDT damage [V25, BW-DT]")
    # Fortified sanity
    for tid in ("dart", "sniper", "bomb", "ninja"):
        check(can(tid, "0-0-0", "fortified"), tid + " 0-0-0 damages fortified [FORT]")
    check(not can("farm", "5-0-0", "fortified"), "Banana Farm never damages [towers.json]")
    # Heroes
    check(hero("quincy", "camo") == 5, "Quincy camo at L5 [bloonswiki Quincy]")
    check(hero("etienne", "camo") == 5, "Etienne drones camo at L5 [bloonswiki Etienne]")
    check(hero("ezili", "camo") == 1 and hero("psi", "camo") == 1, "Ezili and Psi camo from L1 [FD-CAMO]")
    check(hero("psi", "lead") == 6, "Psi Lead at L6 [fandom Psi]")
    check(hero("sauda", "lead") == 13, "Sauda Lead at L13 [bloonswiki Sauda]")
    check(hero("churchill", "camo") == 6, "Churchill camo at L6 [fandom Churchill]")
    check(hero("gwendolin", "camo") is None, "Gwendolin main attack never sees camo [bloonswiki Gwendolin]")
    sf = MODEL["supportFixes"]
    check(any(s["source"] == "village" and s["grants"] == "camo" and s["req"] == {"path": 1, "tier": 2} for s in sf),
          "Radar Scanner 0-2-0 grants camo [FD-CAMO x-2-x support]")
    check(any(s["source"] == "village" and s["grants"] == "lead" and s["req"] == {"path": 1, "tier": 3} for s in sf),
          "MIB 0-3-0 grants lead [FD-LEAD]")
    check(any(s["source"] == "etienne" and s["req"] == {"level": 8} for s in sf), "Etienne L8 UAV global camo [bloonswiki Etienne]")
    check(not any(s["source"] == "alchemist" and s["grants"] == "black" for s in sf), "AMD does not grant Black [V25]")


def t_heroes_levels():
    hl = load("heroes-levels.json")
    ids = sorted(h["id"] for h in TOWERS_JSON["heroes"])
    check(sorted(hl) == ids, "heroes-levels.json must cover the 18 towers.json heroes")
    for h, v in hl.items():
        for k in ("cost", "levels", "abilities", "camoLevel", "leadLevel", "notes"):
            check(k in v, "%s missing %s" % (h, k))
        check(isinstance(v.get("cost"), int), h + " cost int")
        for a in v.get("abilities", []):
            check({"name", "level", "cooldown"} <= set(a), h + " ability keys")
        check(v.get("camoLevel") == MODEL["heroes"][h]["camo"]["level"], h + " camo level agrees with pop-model")
        check(v.get("leadLevel") == MODEL["heroes"][h]["lead"]["level"], h + " lead level agrees with pop-model")
    check(hl["etienne"]["cost"] == 650, "Etienne $650 Medium [bloonswiki Etienne: cut from $850]")
    check(hl["quincy"]["cost"] == 540, "Quincy $540 Medium [bloonswiki Quincy]")


def t_bloons():
    b = load("bloons.json")["bloons"]
    byid = {x["id"]: x for x in b}
    for need in ("red", "blue", "green", "yellow", "pink", "black", "white", "purple", "zebra", "lead",
                 "rainbow", "ceramic", "moab", "bfb", "zomg", "ddt", "bad"):
        check(need in byid, "bloons.json missing " + need)
    for x in b:
        for k in ("children", "rbe", "speed", "immunities", "canCarry", "whatBeatsIt", "sources"):
            check(k in x, "%s missing %s" % (x.get("id"), k))
    # RBE arithmetic: 1 + children RBE for layers with 1 HP; blimps HP + children
    def rbe_of(child):
        n, kind = child
        return n * byid[kind]["rbe"]
    for x in b:
        if x["id"] in byid and x.get("hp") is not None:
            calc = x["hp"] + sum(rbe_of((c["count"], c["id"])) for c in x["children"])
            check(calc == x["rbe"], "%s RBE %s != %s" % (x["id"], x["rbe"], calc))
    check(byid["bad"]["rbe"] == 55760, "BAD RBE 55,760 [site bloons guide / wiki]")
    check(set(byid["lead"]["immunities"]) >= {"sharp", "cold", "energy"}, "bloons.json Lead immunities [BW-DT]")


def main():
    for fn in (t_schema, t_fortified_matches_base, t_bad_matches_moab, t_derived_ddt_safe, t_known_truths,
               t_heroes_levels, t_bloons):
        fn()
    total = RESULTS["pass"] + len(RESULTS["fail"])
    for m in RESULTS["fail"]:
        print("FAIL:", m)
    print("%d/%d checks passed" % (RESULTS["pass"], total))
    return 1 if RESULTS["fail"] else 0


# pytest entry points
def test_all():
    assert main() == 0


if __name__ == "__main__":
    sys.exit(main())
