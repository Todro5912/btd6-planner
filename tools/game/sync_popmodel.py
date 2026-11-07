"""Sync data/pop-model.json "can it damage X" rules with the game files (data/game/towers.json, v56).

Truth per crosspath: a property holds when one of the crosspath's own permanent attacks (direct hit, sub-projectile,
DoT, passive, or a permanent sub-tower) can damage it. Abilities, spells and temple sacrifices don't count.
Exceptions (KEEP) are kept as the site has them, with the reason.

    python3 tools/game/sync_popmodel.py [--check]

--check exits 1 if the pop model would change (used by the tests).
"""
import itertools
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
PM_PATH = os.path.join(ROOT, 'data', 'pop-model.json')
GAME_PATH = os.path.join(ROOT, 'data', 'game', 'towers.json')
PROPS = ['camo', 'lead', 'purple', 'black', 'white', 'zebra', 'frozen', 'moab', 'bad', 'fortified']
NOTE = ' (synced with the game files, v56)'

# (tower, prop, crosspath set or None for all): keep the site's claim, and why
KEEP = [
    ('spike', 'camo', None, 'spikes pop camo bloons that run over them; the attack just can\'t aim at camo'),
    ('spike', 'ddt', None, 'same as camo: spikes pop camo DDTs that run over them'),
    ('skywarden', 'lead', None, 'v57 changed Thundering Arc and 0-2-0 to Plasma (patch notes); the v56 files predate it'),
    ('skywarden', 'frozen', None, 'v57 Skywarden changes (patch notes)'),
    ('skywarden', 'ddt', None, 'v57 Skywarden changes (patch notes)'),
    ('sniper', 'lead', {'040', '041', '042', '050', '051', '052'}, 'v57.1 made Supply Drop\'s shots Sharp (patch notes)'),
    ('sniper', 'frozen', {'040', '041', '042', '050', '051', '052'}, 'v57.1 Supply Drop change (patch notes)'),
    ('sniper', 'ddt', {'040', '041', '042', '050', '051', '052'}, 'v57.1 Supply Drop change (patch notes)'),
    ('desperado', 'lead', {'005', '015', '025', '105', '205'}, 'the site follows the v57 Desert Phantom change (patch notes)'),
    ('desperado', 'ddt', {'015', '025'}, 'v57 Desert Phantom change (patch notes)'),
]


def valid(x):
    a = sorted(x, reverse=True)
    return a[0] <= 5 and a[1] <= 2 and a[2] == 0


VALID = [x for x in itertools.product(range(6), repeat=3) if valid(x)]
CODE = lambda x: ''.join(map(str, x))


def holds(req, x):
    if req == 'base':
        return True
    if req == 'never':
        return False
    if 'maxTier' in req:
        return x[req['path']] <= req['maxTier']
    return x[req['path']] >= req['tier']


def any_holds(spec, x):
    return bool(spec) and any(all(holds(r, x) for r in alt) for alt in spec.get('any', []))


def box_cover(pos):
    """Smallest-ish list of boxes (per-path min..max) whose valid crosspaths are exactly `pos`."""
    pos = set(pos)
    if not pos:
        return [['never']]
    if pos == {CODE(x) for x in VALID}:
        return [['base']]
    boxes = []
    rng = [(lo, hi) for lo in range(6) for hi in range(lo, 6)]
    for b in itertools.product(rng, repeat=3):
        cells = {CODE(x) for x in VALID if all(b[i][0] <= x[i] <= b[i][1] for i in range(3))}
        if cells and cells <= pos:
            boxes.append((b, cells))
    left, out = set(pos), []
    while left:
        b, cells = max(boxes, key=lambda bc: (len(bc[1] & left), len(bc[1])))
        left -= cells
        alt = []
        for i, (lo, hi) in enumerate(b):
            if lo > 0:
                alt.append({'path': i, 'tier': lo})
            if hi < 5:
                alt.append({'path': i, 'maxTier': hi})
        out.append(alt or ['base'])
    return out


ALL = sorted(['red', 'lead', 'black', 'white', 'zebra', 'purple', 'frozen', 'glass', 'ceramic', 'camo', 'camoHit', 'fortified', 'moab', 'ddt', 'bad', 'boss'])
PERMANENT_VIA = ('placed', 'pet', 'drone', 'attack', 'totem', 'reinforcement', 'projectile')
YES = ('direct', 'alt', 'sub', 'dot', 'passive', 'subTower')


def can_set(a):
    if a.get('noDamage'):
        return set()
    return set(ALL) - set(a.get('cannot', []))


def own_routes(rec, ATT, SUB):
    """prop -> best route the crosspath damages it by: direct | alt | sub | dot | passive | subTower | conditional.
    Same rules as the audit (reports/game/towers.md section 3): conditional = ability, spell, temple, transform."""
    rank = ['direct', 'alt', 'sub', 'dot', 'passive', 'subTower', 'conditional']
    best = {}

    def mark(p, how):
        if p not in best or rank.index(how) < rank.index(best[p]):
            best[p] = how
    for k in rec.get('attacks', []):
        a = ATT[k]
        via = a.get('canDamageVia', {})
        for p in can_set(a):
            if a.get('cond') == 'passive':
                mark(p, 'passive')
            elif a.get('cond'):
                mark(p, 'conditional')
            else:
                mark(p, via.get(p, 'direct'))
    for st_ref in rec.get('subTowers', []):
        st = SUB.get(st_ref['ref'])
        if not st:
            continue
        perm = st_ref.get('via') in PERMANENT_VIA
        for k in st.get('attacks', []):
            a = ATT[k]
            if a.get('cond') and a.get('cond') != 'passive':
                continue
            for p in can_set(a):
                mark(p, 'subTower' if perm else 'conditional')
    return best


def main():
    pm = json.load(open(PM_PATH, encoding='utf-8'))
    game = json.load(open(GAME_PATH, encoding='utf-8'))
    ATT, SUB = game['attacks'], game['subTowers']
    changes = []
    for tid, e in pm['towers'].items():
        g = game['towers'].get(tid)
        if not g:
            continue
        routes = {code: own_routes(rec, ATT, SUB) for code, rec in (g.get('crosspaths') or {}).items()}
        for prop in PROPS + ['ddt']:
            spec = e.get(prop)
            derived = prop == 'ddt' and (not spec or spec.get('derived'))
            if derived:
                site = {CODE(x) for x in VALID if all(any_holds(e[p], x) for p in ('camo', 'lead', 'black'))}
            else:
                site = {CODE(x) for x in VALID if any_holds(spec, x)}
            want = {code for code, r in routes.items() if r.get(prop) in YES}
            for kt, kp, ks, why in KEEP:
                if kt == tid and kp == prop:
                    scope = ks if ks is not None else {CODE(x) for x in VALID}
                    want = (want - scope) | (site & scope)
            if prop == 'ddt' and derived:
                # recheck the derived rule with the synced camo/lead/black first
                site_now = {CODE(x) for x in VALID if all(any_holds(e[p], x) for p in ('camo', 'lead', 'black'))}
                if site_now == want:
                    continue
            if want != site:
                changes.append((tid, prop, sorted(site - want), sorted(want - site)))
                n = {k: v for k, v in (spec or {}).items() if k != 'derived'}
                if prop == 'ddt':
                    n['derived'] = False
                n['any'] = box_cover(want)
                n['note'] = (n.get('note') or '').replace(NOTE, '') + NOTE
                e[prop] = n
    if '--check' in sys.argv:
        for c in changes:
            print('would change', c)
        sys.exit(1 if changes else 0)
    for tid, prop, off, on in changes:
        print(f'{tid:10} {prop:9} -{len(off):2} +{len(on):2}  off {" ".join(off)[:70]}  on {" ".join(on)[:70]}')
    open(PM_PATH, 'w', encoding='utf-8').write(json.dumps(pm, indent=1, ensure_ascii=False) + '\n')
    print(len(changes), 'tower/property rules changed')


if __name__ == '__main__':
    main()
