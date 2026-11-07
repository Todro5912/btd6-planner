#!/usr/bin/env python3
"""Build data/monkey-knowledge.json (all 134 nodes) from data/game/knowledge.json (tools/game/extract_knowledge.py).

Keeps the site schema the tools already read ({about, version, trees, totalNodes, maxPoints, nodes[]} with node
{id, name, tree, effect, ptsNeeded, mm, fx}) and the 29 existing ids, effect texts and fx values, so saved profiles
(static/progress.js profile.mk, keyed by node id) keep working. Adds per node: gameId, desc, pre (site ids), layout
{row, col}, tags, use ('applied' | 'noted' | absent) and source.

fx keys the engine (src/pages/assets/tools-core.js C.profileFx) reads:
  startCash, sellAdd, heroCostMult, heroXpMult, xpMult, militaryXpMult, heroStartLevel        (0.9 keys, unchanged)
  towerCost   [{towers, pct?, flat?, first?}]   placement price; first = only the first one of those towers each game
  upgradeCost [{tower, path (0-2), tier (1-5), pct?, flat?}]
  freeTower   site tower id (Bonus Monkey / Bonus Glue Gunner; one free tower per game)
  sellAddFor  {tower: add}                      extra sell rate for those towers only (Flat Pack Buildings)
  incomeAdd   [{tower, min [a,b,c], value}]     end-of-round cash per tower at or above that crosspath (Trade Agreements)
  bananaValueAdd   Valuable Bananas bonus +0.05 (25% -> 30%)
  heroXpPerHero    +5% hero XP per hero placed (Monkeys Together Strong)
  noted only (the tools carry them, nothing uses them yet): blimpHpMult, reloadMult, attack[], townPopCashAdd,
  bankCapAdd, loanAdd, heroLevelCostMult, lives
Usage: python3 tools/game/build_mk.py   (deterministic; run after extract_knowledge.py)
"""
import json
import os
import re

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(REPO, 'data', 'game', 'knowledge.json')
OUT = os.path.join(REPO, 'data', 'monkey-knowledge.json')
MILITARY = ['sniper', 'sub', 'buccaneer', 'ace', 'heli', 'mortar', 'dartling']
SITE_TOWERS = {'dart', 'boomerang', 'bomb', 'tack', 'ice', 'glue', 'desperado', 'sniper', 'sub', 'buccaneer', 'ace', 'heli',
               'mortar', 'dartling', 'wizard', 'super', 'ninja', 'alchemist', 'druid', 'mermonkey', 'skywarden', 'farm',
               'spike', 'village', 'engineer', 'beast'}
GAME_FILE = 'game file %s (v56.0)'
# The 29 nodes the site shipped before 0.10 (data/monkey-knowledge.json at 0.9.1): their effect text, fx and source stay
# exactly as they were, so saved profiles and the 0.9 tests behave the same. New fx keys are added beside them.
LEGACY = {
    'mo-monkey-money': {"effect": "+10% Monkey Money from wins and Daily Challenges"},
    'monkey-education': {"effect": "All towers and heroes earn 8% more XP", "fx": {"xpMult": 1.08}},
    'elite-military-training': {"effect": "+1,000 XP once to every Military tower, and +5% Military XP", "fx": {"militaryXpMult": 1.05}},
    'self-taught-heroes': {"effect": "Heroes earn XP 10% faster", "fx": {"heroXpMult": 1.1}},
    'hero-favors': {"effect": "Heroes 10% cheaper", "fx": {"heroCostMult": 0.9}},
    'extra-dart-pops': {"effect": "+1 pierce to Dart Monkeys"},
    'naval-upgrades': {"effect": "+1 pierce to Subs and Buccaneers"},
    'farm-subsidy': {"effect": "A small discount on your first Banana Farm"},
    'first-last-line-of-defense': {"effect": "A small discount on your first Spike Factory"},
    'more-cash': {"effect": "+$200 starting cash", "fx": {"startCash": 200}},
    'bonus-monkey': {"effect": "A free Dart Monkey at the start (one free tower per game; or Bonus Glue Gunner)"},
    'bonus-glue-gunner': {"effect": "A free Glue Gunner at the start (instead of Bonus Monkey!)"},
    'better-sell-deals': {"effect": "All towers sell for 5% more", "fx": {"sellAdd": 0.05}, "source": "game file Knowledge/Support/BetterSellDeals.json (multiplier 0.05)"},
    'veteran-monkey-training': {"effect": "All towers reload 3% faster"},
    'global-ability-cooldowns': {"effect": "Ability cooldowns -3%"},
    'healthy-bananas': {"effect": "Marketplace +1 life per round, Central Market +3"},
    'empowered-heroes': {"effect": "Heroes start at level 3", "fx": {"heroStartLevel": 3}},
    'mana-shield': {"effect": "Absorbs up to 25 lives, slowly recharges"},
    'big-bloon-sabotage': {"effect": "MOAB-class bloons spawn partly damaged. A must for Freeplay"},
    'military-conscription': {"effect": "The first Military tower each game costs two-thirds"},
    'bank-deposits': {"effect": "Tier 4+ Monkey Banks accept deposits"},
    'paragon-of-power': {"effect": "Paragons attack faster with no same-type tier 5 on the map"},
    'pre-game-prep': {"effect": "Free permanent Road Spikes at the end of the track"},
    'monkeys-together-strong': {"effect": "+5% hero XP per hero placed"},
    'more-valuable-bananas': {"effect": "Valuable Bananas +30% instead of +25%"},
    'bigger-banks': {"effect": "+$2,500 Monkey Bank capacity"},
    'backroom-deals': {"effect": "IMF Loan +$1,000, repaid at 40%"},
    'trade-agreements': {"effect": "Merchantman +$20 a round"},
    'inland-revenue-streams': {"effect": "Monkey Town pop cash +60% instead of +50%"},
}


def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def when_to_min(w):
    """'x-x-3+' -> [0, 0, 3]; None if the rule isn't a single 'n+' on one path"""
    m = re.fullmatch(r'(x|\d\+)-(x|\d\+)-(x|\d\+)', w or '')
    if not m:
        return None
    return [int(g[0]) if g != 'x' else 0 for g in m.groups()]


def fx_for(n, by_id):
    """engine fx for one game node, or (None, None). Returns (fx, use) with use 'applied' or 'noted'."""
    gid = n['id']
    E = n['effects']
    applies = n.get('applies') or []
    towers = sorted({a['site'] for a in applies if a.get('site') in SITE_TOWERS})
    fx, applied, noted = {}, False, False
    for e in E:
        k = e['kind']
        if k == 'startCash':
            fx['startCash'] = e['value']; applied = True
        elif k == 'sellRate':
            if gid == 'FlatPackBuildings':
                fx['sellAddFor'] = {t: e['add'] for t in towers}
            else:
                fx['sellAdd'] = e['add']
            applied = True
        elif k == 'heroCost':
            fx['heroCostMult'] = round(1 + e['pct'], 4); applied = True
        elif k == 'towerCost':
            ts = [t for t in e['towers'] if t in SITE_TOWERS]
            row = {'towers': ts}
            if 'pct' in e:
                row['pct'] = e['pct']
            if 'value' in e:
                row['flat'] = e['value']
            if e.get('firstOnly'):
                row['first'] = True
            fx.setdefault('towerCost', []).append(row); applied = True
        elif k == 'upgradeDiscount':
            row = {'tower': e['tower'], 'path': e['path'] - 1, 'tier': e['tier']}
            if 'pct' in e:
                row['pct'] = e['pct']
            if 'value' in e:
                row['flat'] = e['value']
            fx.setdefault('upgradeCost', []).append(row); applied = True
        elif k == 'freeTower':
            fx['freeTower'] = e['tower']; applied = True
        elif k == 'income' and e['what'] == 'perRound' and gid == 'TradeAgreements':
            fx['incomeAdd'] = [{'tower': 'buccaneer', 'min': [0, 0, 3], 'value': e['value']}]; applied = True
        elif k == 'income' and e['what'] == 'bananaValueBuff':
            fx['bananaValueAdd'] = e['add']; applied = True
        elif k == 'income' and e['what'] == 'popCashBonus':
            fx['townPopCashAdd'] = e['add']; noted = True
        elif k == 'income' and e['what'] == 'bankCapacity':
            fx['bankCapAdd'] = e['add']; noted = True
        elif k == 'income' and e['what'] == 'imfLoan':
            fx['loanAdd'] = e['loanAdd']; noted = True
        elif k == 'towerXp':
            if e.get('who') == 'heroes':
                fx['heroXpMult'] = e['mult']
            elif e.get('who') == 'all':
                fx['xpMult'] = e['mult']
            else:
                fx['militaryXpMult'] = e['mult']
            applied = True
        elif k == 'heroXp':
            fx['heroXpPerHero'] = e['perHeroPlaced']; applied = True
        elif k == 'heroStartLevel':
            fx['heroStartLevel'] = e['startLevel']; applied = True
        elif k == 'heroLevelCost':
            fx['heroLevelCostMult'] = e['mult']; noted = True
        elif k == 'bloonHealth':
            fx['blimpHpMult'] = round(1 + e['pct'], 4); noted = True
        elif k == 'lives':
            fx['lives'] = {kk: v for kk, v in e.items() if kk not in ('kind', 'type')}; noted = True
        elif k == 'attack':
            if gid == 'VeteranMonkeyTraining':
                fx['reloadMult'] = round(1 - e['pct'], 4); noted = True
                continue
            hero_only = applies and all(a['kind'] in ('hero', 'sub') for a in applies)
            ts = ['heroes'] if hero_only else towers
            if not ts:
                continue
            row = {'towers': ts}
            row.update({kk: v for kk, v in e.items() if kk not in ('kind', 'type', 'projectile', 'ability')})
            wh = {a['site']: a['when'] for a in applies if a.get('site') in SITE_TOWERS and a['when'] != 'all'}
            if wh:
                row['when'] = wh
            fx.setdefault('attack', []).append(row); noted = True
    if not fx:
        return None, None
    return fx, ('applied' if applied else 'noted')


def main():
    G = load(SRC)
    old_by = LEGACY
    by_id = {n['id']: n for n in G['nodes']}
    site_of = {n['id']: n['site'] for n in G['nodes']}
    nodes = []
    for n in G['nodes']:
        sid = n['site']
        o = old_by.get(sid, {})
        fx, use = fx_for(n, by_id)
        if o.get('fx'):
            # the 0.9 fx values stay exactly as they were (tests and saved behaviour); new keys are added beside them
            merged = dict(fx or {})
            merged.update(o['fx'])
            fx = merged
            use = 'applied'
        rec = {
            'id': sid,
            'gameId': n['id'],
            'name': n['name'],
            'tree': n['tree'],
            'effect': o.get('effect') or n['desc'],
            'desc': n['desc'],
            'ptsNeeded': n['pts'],
            'mm': n['mm'],
            'pre': [site_of[p] for p in n['pre']],
            'layout': {'row': n['layout']['row'], 'col': n['layout']['col']},
            'tags': n['tags'],
        }
        if fx:
            rec['fx'] = fx
            rec['use'] = use
        src = [GAME_FILE % n['src']]
        if o.get('source') and o['source'] not in src:
            src.append(o['source'])
        rec['source'] = '; '.join(src)
        nodes.append(rec)
    tree_info = {}
    for t, v in G['treeInfo'].items():
        tree_info[t] = {'rows': v['rows'], 'cols': v['cols'], 'bands': v['bands'], 'bandRows': v['bandRows'], 'nodes': v['nodes']}
    out = {
        'about': 'All 134 Monkey Knowledge nodes, built by tools/game/build_mk.py from data/game/knowledge.json (game files v56.0). '
                 'fx = effects the tools apply (use "applied") or carry for later (use "noted"). Ids are the game ids in kebab case.',
        'version': '57.4',
        'gameData': G['_meta']['gameVersion'],
        'trees': G['_meta']['trees'],
        'totalNodes': len(nodes),
        'maxPoints': 138,
        'maxPointsSource': 'not in the game files; https://bloons.fandom.com/wiki/Monkey_Knowledge_(BTD6) (level 155 + achievements)',
        'treeInfo': tree_info,
        'nodes': nodes,
    }
    missing = sorted(set(LEGACY) - {n['id'] for n in nodes})
    if missing:
        raise SystemExit('build_mk: saved-profile ids would be lost: %s' % missing)
    s = json.dumps(out, indent=1, ensure_ascii=False)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(s + '\n')
    print('wrote data/monkey-knowledge.json: %d nodes (%d with fx), %d bytes' % (len(nodes), sum(1 for n in nodes if 'fx' in n), len(s)))


if __name__ == '__main__':
    main()
