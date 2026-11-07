#!/usr/bin/env python3
"""Build the data bundles for the Monkey Intel tool pages (stream S, contract C3).

Writes:
  src/pages/assets/tools-data.js     window.MonkeyIntelData = {...}  (towers, modes, rounds, maps, pop model, presets)
  src/pages/assets/synergy-rules.js  window.MonkeyIntel.synergyRules = {...}  (rules + tower names, small; for tower pages)
  src/pages/assets/map-tips.js       window.MonkeyIntelTips = {...}  (per-map plan steps, placement, key rounds; advisor + simulator)

Pop model: data/pop-model.json (contract C1) and hero levels: data/heroes-levels.json (C2). Both are required:
the build stops if either is missing or unreadable. There is no fixture fallback.

  python3 src/build_tools.py            build the bundles
  python3 src/build_tools.py --preview  also write src/.preview/<slug>.html (each fragment in a minimal shell)
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
DATA = os.path.join(ROOT, 'data')
ASSETS = os.path.join(HERE, 'pages', 'assets')
PAGES = os.path.join(HERE, 'pages')
PRIVATE = {'_src', 'notes_internal', 'source', 'about'}
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from mi_lib import key_round, steps  # noqa: E402  (tools/mi_lib.py: the same sentence splitter the map pages use)


def load(path, default=None):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError) as e:
        if default is None:
            print(f'warning: could not read {path}: {e}', file=sys.stderr)
        return default


def pick(d, keys):
    return {k: d.get(k) for k in keys if isinstance(d, dict) and k in d}


def js_blob(obj):
    s = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    return s.replace('</', '<\\/').replace('<!--', '<\\u0021--')


# ---------- presets: parse the bracketed CHIMPS build orders in map-strats ----------
STEP_PLACE = re.compile(r"R(\d+) ([A-Z][\w .']+?) #(\d+) place at (\d)-(\d)-(\d)")
STEP_UP = re.compile(r"R(\d+) ([A-Z][\w .']+?) #(\d+) (\d)-(\d)-(\d) -> (\d)-(\d)-(\d)")
STEP_HERO = re.compile(r"R(\d+) Hero: ([A-Z][\w .']+?) \[")
SPENT = re.compile(r"\[\$[\d,]+; spent \$([\d,]+)")


def name_index(towers, heroes):
    tix, hix = {}, {}
    for t in towers:
        n = t['name']
        for k in {n, n.replace(' Monkey', ''), n.split(' ')[0], n.replace('Monkey ', '')}:
            tix.setdefault(k.lower(), t['id'])
    for h in heroes:
        for k in {h['name'], h['name'].split(' ')[0], h['name'].split(' ')[-1]}:
            hix.setdefault(k.lower(), h['id'])
    return tix, hix


def parse_presets(strats, towers, heroes):
    tix, hix = name_index(towers, heroes)
    out = {}
    for s in strats:
        plan = s.get('chimpsPlan') or ''
        if not STEP_PLACE.search(plan):
            continue
        events = []
        for m in STEP_PLACE.finditer(plan):
            tid = tix.get(m.group(2).lower())
            if tid:
                events.append((m.start(), {'r': int(m.group(1)), 'op': 'place', 't': tid, 'n': int(m.group(3)),
                                           'x': [int(m.group(4)), int(m.group(5)), int(m.group(6))]}))
        for m in STEP_UP.finditer(plan):
            tid = tix.get(m.group(2).lower())
            if tid:
                events.append((m.start(), {'r': int(m.group(1)), 'op': 'up', 't': tid, 'n': int(m.group(3)),
                                           'x': [int(m.group(7)), int(m.group(8)), int(m.group(9))]}))
        for m in STEP_HERO.finditer(plan):
            hid = hix.get(m.group(2).lower()) or hix.get(m.group(2).split(' ')[0].lower())
            if hid:
                events.append((m.start(), {'r': int(m.group(1)), 'op': 'hero', 'h': hid}))
        events.sort(key=lambda e: e[0])
        steps = [e[1] for e in events]
        spent = [int(x.replace(',', '')) for x in SPENT.findall(plan)]
        if len(steps) >= 4:
            out[s['mapId']] = {'mode': 'chimps', 'steps': steps, 'spent': spent[-1] if spent else None,
                               'label': 'Known start from the map page'}
    return out


# ---------- map tips: the strategy text from map-strats, split into short steps (advisor + simulator) ----------
def tidy(s):
    """Same clean-up as tools/build_site.py: drop research-note references and alt prices."""
    if not s:
        return ''
    s = re.sub(r'\s*See 0\d[a-z]? Part [\d.]+\.?', '', s)
    s = re.sub(r'\s*\(see Methods\)', '', s)
    s = re.sub(r'(;\s*)?alt: \$[\d,]+(?: fandom)?(;\s*)?', '', s)
    s = re.sub(r'\s*\(\s*\)', '', s).replace('( ', '(')
    return s.strip()


def split_plan(text, cut_build=False):
    """Plan text -> (steps, key rounds). Build orders after "Build:" are left out: the known start covers them."""
    text = tidy(text)
    m = re.search(r'Build(?: \([^)]*\))?(?: \{calc\})?:\s*', text)
    if m and cut_build:
        text = text[:m.start()].strip()
    out, keys = [], []
    for st in steps(text):
        kr = key_round(st)
        if kr:
            keys.append([kr[0], kr[1]])
        elif re.match(r'^Build: follow\b', st):
            continue  # points at the map page's table; the known start covers it here
        else:
            out.append(re.sub(r'^Key rounds:\s*', '', st))
    return out, keys


def map_tips(strats):
    out = {}
    for s in strats:
        mid = s.get('mapId')
        if not mid:
            continue
        easy, ek = split_plan(s.get('easyPlan'))
        hard, hk = split_plan(s.get('hardPlan'))
        chimps, ck = split_plan(s.get('chimpsPlan'), cut_build=True)
        keys = {}
        for r, t in ek + hk + ck:
            keys.setdefault(r, t)
        out[mid] = {'easy': easy, 'hard': hard, 'chimps': chimps, 'placement': steps(tidy(s.get('placement'))),
                    'keyRounds': [[r, keys[r]] for r in sorted(keys)], 'confidence': s.get('confidence')}
    return out


def require(name):
    path = os.path.join(DATA, name)
    try:
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
    except (OSError, ValueError) as e:
        sys.exit(f'build_tools: data/{name} is required ({e})')
    if not data:
        sys.exit(f'build_tools: data/{name} is empty')
    return data


def collect():
    """Everything the tool pages ship, as one dict (no files written)."""
    towers = load(os.path.join(DATA, 'towers.json'), {}) or {}
    maps = load(os.path.join(DATA, 'maps.json'), []) or []
    modes = load(os.path.join(DATA, 'modes.json'), []) or []
    rounds = load(os.path.join(DATA, 'rounds.json'), {}) or {}
    strats = (load(os.path.join(DATA, 'map-strats-a.json'), []) or []) + (load(os.path.join(DATA, 'map-strats-b.json'), []) or [])
    guides = load(os.path.join(DATA, 'tower-guides.json'), []) or []
    econ = load(os.path.join(DATA, 'economy.json'), {}) or {}
    rules = load(os.path.join(DATA, 'synergy-rules.json'), {}) or {}
    mk = load(os.path.join(DATA, 'monkey-knowledge.json'), {}) or {}

    pop = require('pop-model.json')
    if pop.get('_fixture') or not pop.get('towers'):
        sys.exit('build_tools: data/pop-model.json is a fixture or has no towers')
    pop_source = 'data'
    hero_levels = require('heroes-levels.json')

    tower_list = []
    for t in towers.get('towers', []) or []:
        tt = pick(t, ['id', 'name', 'class', 'baseCost', 'waterOnly', 'paragon'])
        tt['paths'] = [[pick(u, ['tier', 'name', 'cost', 'xp']) for u in (p or [])] for p in (t.get('paths') or [])]
        tower_list.append(tt)
    heroes = [pick(h, ['id', 'name', 'cost', 'waterOnly', 'xpCurve', 'camo', 'lead', 'bestFor', 'beginnerTier', 'unlockLevel', 'mmUnlock']) for h in towers.get('heroes', []) or []]
    rk = ['round', 'xp', 'cash', 'cashPop', 'rbe', 'threats', 'composition', 'danger', 'notes']
    data = {
        'meta': {'version': towers.get('version'), 'popSource': pop_source, 'popVersion': (pop or {}).get('version'),
                 'heroLevelsSource': 'data' if hero_levels else 'estimate'},
        'towers': tower_list,
        'heroes': heroes,
        'maps': [dict(pick(m, ['id', 'name', 'difficulty', 'water', 'losBlockers']),
                      **({'rbs': (m.get('rbs') or {}).get('avg'),
                          # lanes = the BTD6 Index path count (paths), not the number of lane measurements in rbs.lanes
                          'lanes': m.get('paths') if isinstance(m.get('paths'), int) and m.get('paths') > 0 else 1}
                         if isinstance(m.get('rbs'), dict) and (m.get('rbs') or {}).get('avg') else {})) for m in maps],
        'modes': [pick(m, ['id', 'name', 'base', 'startCash', 'lives', 'startRound', 'endRound', 'costMult', 'cashMult',
                           'roundSet', 'allowedClasses', 'rules', 'medal', 'bloonSpeedMult']) for m in modes],
        'rounds': {k: [pick(r, rk) for r in rounds.get(k, []) or []] for k in ('standard', 'abr')},
        'strats': {s['mapId']: pick(s, ['strongTowers', 'avoidTowers', 'heroes']) for s in strats if s.get('mapId')},
        'guides': {g['towerId']: pick(g, ['xpAllUpgrades', 'xpParagon', 'farm', 'bestCrosspaths', 'buyTiming', 'lacks'])
                   for g in guides if g.get('towerId')},
        'income': [pick(s, ['tower', 'code', 'incomePerRound', 'chimpsLegal']) for s in econ.get('incomeSources', []) or []],
        'farmCross': econ.get('farmCross') or {},
        'pop': pop,
        'heroLevels': hero_levels,
        'presets': parse_presets(strats, tower_list, heroes),
        'synergy': rules,
        'mk': [pick(n, ['id', 'name', 'tree', 'group', 'effect', 'ptsNeeded', 'mm', 'fx']) for n in mk.get('nodes', []) or []],
        'mkMeta': pick(mk, ['totalNodes', 'maxPoints', 'trees']),
        'power': load(os.path.join(DATA, 'tower-power.json'), {}) or {},
    }
    for m in data['modes']:
        if isinstance(m.get('rules'), dict):
            m['rules'] = {k: v for k, v in m['rules'].items() if not isinstance(v, str)}

    def strip(o):
        if isinstance(o, dict):
            return {k: strip(v) for k, v in o.items() if k not in PRIVATE}
        if isinstance(o, list):
            return [strip(v) for v in o]
        return o
    data['_tips'] = map_tips(strats)
    keep = {k: data.pop(k) for k in ('pop', 'heroLevels', 'synergy', 'power')}  # contract files ship whole (C1 uses 'source')
    data = strip(data)
    data.update(keep)
    return data


def build():
    data = collect()
    tips = data.pop('_tips')
    rules = data['synergy']
    tower_list, heroes = data['towers'], data['heroes']
    pop_source = data['meta']['popSource']
    os.makedirs(ASSETS, exist_ok=True)
    blob = js_blob(data)
    with open(os.path.join(ASSETS, 'tools-data.js'), 'w', encoding='utf-8') as f:
        f.write('/* generated by src/build_tools.py; do not edit */\nwindow.MonkeyIntelData=' + blob + ';\n')
    syn = {'rules': rules, 'towers': {t['id']: {'name': t['name'], 'class': t.get('class')} for t in tower_list},
           'heroes': {h['id']: {'name': h['name']} for h in heroes}}
    with open(os.path.join(ASSETS, 'synergy-rules.js'), 'w', encoding='utf-8') as f:
        f.write('/* generated by src/build_tools.py from data/synergy-rules.json; do not edit */\n'
                'window.MonkeyIntel=window.MonkeyIntel||{};window.MonkeyIntel.synergyRules=' + js_blob(syn) + ';\n')
    tblob = js_blob(tips)
    with open(os.path.join(ASSETS, 'map-tips.js'), 'w', encoding='utf-8') as f:
        f.write('/* generated by src/build_tools.py from data/map-strats-*.json; do not edit */\nwindow.MonkeyIntelTips=' + tblob + ';\n')
    print(f'map-tips.js {len(tblob.encode()):,} bytes for {len(tips)} maps')
    print(f'tools-data.js {len(blob.encode()):,} bytes (pop model: {pop_source}); presets for {len(data["presets"])} maps; '
          f'{len(rules.get("rules", []))} synergy rules')
    return data


SHELL = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} preview</title>
<link rel="stylesheet" href="../../static/site.css">
</head><body><main id="main" class="wrap wrap-wide">
{body}
</main></body></html>
"""


def preview():
    out = os.path.join(HERE, '.preview')
    os.makedirs(out, exist_ok=True)
    for fn in sorted(os.listdir(PAGES)):
        if not fn.endswith('.body.html'):
            continue
        slug = fn[:-len('.body.html')]
        with open(os.path.join(PAGES, fn), encoding='utf-8') as f:
            body = f.read().replace('{{BASE}}static/tools/', '../pages/assets/')
        with open(os.path.join(out, slug + '.html'), 'w', encoding='utf-8') as f:
            f.write(SHELL.format(title=slug, body=body))
    print('previews in', out)


if __name__ == '__main__':
    build()
    if '--preview' in sys.argv:
        preview()
