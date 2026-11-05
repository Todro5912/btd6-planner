#!/usr/bin/env python3
"""Build the Bloons Planner page.

Reads the JSON files in ../data (read-only), trims fields the page never uses,
inlines logic.js and the data into template.html, and writes btd6-planner.html.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.normpath(os.path.join(HERE, '..', 'data'))
OUT = os.path.join(HERE, 'btd6-planner.html')


def load(name, default=None):
    path = os.path.join(DATA, name)
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError) as e:
        print(f'warning: could not read {name}: {e}', file=sys.stderr)
        return default


def pick(d, keys):
    return {k: d.get(k) for k in keys if isinstance(d, dict) and k in d}


# research notes kept in the data files but never shipped: originals of rewritten text, method notes, citations
PRIVATE = {'_src', 'notes_internal', 'source', 'about'}


def strip_private(o):
    if isinstance(o, dict):
        return {k: strip_private(v) for k, v in o.items() if k not in PRIVATE}
    if isinstance(o, list):
        return [strip_private(v) for v in o]
    return o


def build_data():
    towers = load('towers.json', {}) or {}
    maps = load('maps.json', []) or []
    modes = load('modes.json', []) or []
    rounds = load('rounds.json', {}) or {}
    strats = (load('map-strats-a.json', []) or []) + (load('map-strats-b.json', []) or [])
    guides = load('tower-guides.json', []) or []
    econ = load('economy.json', {}) or {}

    tower_list = []
    for t in towers.get('towers', []) or []:
        tt = pick(t, ['id', 'name', 'class', 'baseCost', 'waterOnly', 'placement', 'innate',
                      'paragon', 'roles', 'crosspaths', 'tier5Rank', 'notes'])
        paths = []
        for p in t.get('paths', []) or []:
            paths.append([pick(u, ['tier', 'name', 'cost', 'xp', 'grants', 'effect']) for u in (p or [])])
        tt['paths'] = paths
        tower_list.append(tt)

    round_keys = ['round', 'xp', 'cash', 'rbe', 'threats', 'composition', 'danger', 'notes']
    rounds_out = {
        'standard': [pick(r, round_keys) for r in rounds.get('standard', []) or []],
        'abr': [pick(r, round_keys) for r in rounds.get('abr', []) or []],
    }

    data = {
        'meta': {
            'version': towers.get('version'),
            'researched': towers.get('researched'),
            'costMultipliers': towers.get('costMultipliers'),
            'missingXp': towers.get('missingXp', []),
        },
        'towers': tower_list,
        'heroes': [pick(h, ['id', 'name', 'cost', 'camo', 'lead', 'roles', 'bestFor', 'beginnerTier'])
                   for h in towers.get('heroes', []) or []],
        'maps': [pick(m, ['id', 'name', 'difficulty', 'water', 'losBlockers', 'removables', 'paths',
                          'trackLength', 'trackClass', 'special', 'easiness', 'chimpsFriendly', 'notes',
                          'unverified',
                          # round 3: btd6index.win (v57.4) evidence
                          'rbs', 'entrances', 'exits', 'indexLength', 'indexWater', 'indexLos',
                          'removalCost', 'indexObjects', 'lcc', 'twoMP']) for m in maps],
        'modes': [pick(m, ['id', 'name', 'base', 'startCash', 'lives', 'startRound', 'endRound', 'costMult',
                           'cashMult', 'roundSet', 'allowedClasses', 'rules', 'rewardMM', 'medal',
                           'xpBaseTotal', 'notes']) for m in modes],
        'rounds': rounds_out,
        # indexProven duplicates maps[].twoMP; the page only needs the proven tower ids
        'strats': {s['mapId']: dict({k: v for k, v in s.items() if k != 'indexProven'},
                                    indexProven=(s.get('indexProven') or {}).get('proven', []))
                   for s in strats if isinstance(s, dict) and s.get('mapId')},
        'guides': {g['towerId']: g for g in guides if isinstance(g, dict) and g.get('towerId')},
        'economy': {
            'incomeSources': econ.get('incomeSources', []),
            'dpsTable': econ.get('dpsTable', []),
            'playstyles': econ.get('playstyles', []),
            'budgetCheck': econ.get('budgetCheck', []),
            'priceRule': econ.get('priceRule'),
        },
    }
    return strip_private(data)


def main():
    data = build_data()
    blob = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    # keep the JSON from closing the <script> element early
    blob = blob.replace('</', '<\\/').replace('<!--', '<\\u0021--')
    with open(os.path.join(HERE, 'template.html'), encoding='utf-8') as f:
        tpl = f.read()
    with open(os.path.join(HERE, 'logic.js'), encoding='utf-8') as f:
        logic = f.read()
    if '__DATA__' not in tpl or '__LOGIC__' not in tpl:
        sys.exit('template.html is missing a placeholder')
    html = tpl.replace('__LOGIC__', logic).replace('__DATA__', blob)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'data {len(blob.encode("utf-8")):,} bytes; page {len(html.encode("utf-8")):,} bytes -> {OUT}')


if __name__ == '__main__':
    main()
