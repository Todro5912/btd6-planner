#!/usr/bin/env python3
"""Build the Monkey Intel site into the repo root (what GitHub Pages serves).

    python3 tools/build_site.py

Reads data/*.json, content/guides/*.md, templates/ and static/, plus the
planner from src/ (via src/build.py). Writes index.html, 404.html,
search-index.json and the planner/, monkeys/, heroes/, maps/, guides/,
records/, a-z/ and assets/ folders. Every generated path is listed in
.build-manifest.json; the next build deletes exactly those files first, so
hand-written files are never touched.

Needs: pip install --break-system-packages markdown jinja2 (PyYAML optional).
Set MI_CONTENT_DIR to render guides from another folder (testing only).
"""
import datetime
import html as htmlmod
import json
import os
import posixpath
import re
import shutil
import sys
import time
import unicodedata

try:
    import jinja2
    import markdown
    from markupsafe import Markup
except ImportError:  # pragma: no cover
    sys.exit('missing dependency: pip install --break-system-packages markdown jinja2')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
SRC = os.path.join(ROOT, 'src')
TEMPLATES = os.path.join(ROOT, 'templates')
STATIC = os.path.join(ROOT, 'static')
CONTENT = os.environ.get('MI_CONTENT_DIR') or os.path.join(ROOT, 'content')
MANIFEST = os.path.join(ROOT, '.build-manifest.json')

PROTECTED_DIRS = {'.git', 'src', 'data', 'content', 'docs', 'tools', 'templates', 'static', 'node_modules'}
PROTECTED_FILES = {'README.md', 'CHANGELOG.md', 'LICENSE', 'DATA-LICENSE.md', 'site.json', '.nojekyll',
                   '.gitignore', '.build-manifest.json'}
GENERATED_DIRS = ['planner', 'monkeys', 'heroes', 'maps', 'guides', 'records', 'a-z', 'assets']

DIFFS = [('easy', 'Easy'), ('medium', 'Medium'), ('hard', 'Hard'), ('impoppable', 'Impoppable')]
CLASSES = ['Primary', 'Military', 'Magic', 'Support']
TIERS = ['Beginner', 'Intermediate', 'Advanced', 'Expert']
TIER_XP = {'Beginner': 1.0, 'Intermediate': 1.1, 'Advanced': 1.2, 'Expert': 1.3}
PATH_NAMES = ['Top path', 'Middle path', 'Bottom path']
HIT_PROPS = [('camo', 'Camo', 'camo'), ('lead', 'Lead', 'lead'), ('purple', 'Purple', 'purple'),
             ('black', 'Black', 'black'), ('white', 'White', 'white'), ('frozen', 'Frozen', 'frozen'),
             ('moab', 'MOAB-class', 'moabDamage'), ('fortified', 'Fortified', None), ('ddt', 'DDT', None)]
UTILITY = [('buff', 'Buffs other towers'), ('decamo', 'Removes camo'), ('defortify', 'Removes fortified'),
           ('degrow', 'Removes regrow'), ('slow', 'Slows Bloons'), ('stun', 'Stuns Bloons'), ('income', 'Makes cash')]
NON_ATTACKERS = {'farm', 'village'}
THREAT_LABEL = {'camo': 'Camo', 'lead': 'Lead', 'purple': 'Purple', 'fortified': 'Fortified', 'ceramic': 'Ceramic',
                'moab': 'MOAB', 'bfb': 'BFB', 'zomg': 'ZOMG', 'ddt': 'DDT', 'bad': 'BAD', 'regrow': 'Regrow',
                'black': 'Black', 'white': 'White', 'zebra': 'Zebra', 'rainbow': 'Rainbow'}
# The BTD6 Index names a 0-0-0 tower "Base <short>" (mirrors L.INDEX_BASE in src/logic.js).
INDEX_BASE = {'dart': 'dart', 'boomerang': 'boomer', 'bomb': 'bomb', 'tack': 'tack', 'ice': 'ice', 'glue': 'glue',
              'sniper': 'sniper', 'sub': 'sub', 'buccaneer': 'bucc', 'ace': 'ace', 'heli': 'heli', 'mortar': 'mortar',
              'dartling': 'dartling', 'wizard': 'wizard', 'super': 'super', 'ninja': 'ninja', 'alchemist': 'alch',
              'druid': 'druid', 'spike': 'spact', 'engineer': 'engi', 'beast': 'beast', 'skywarden': 'skywarden',
              'mermonkey': 'merm', 'desperado': 'desperado', 'village': 'village', 'farm': 'farm'}
HERO_ALIAS = {'gwendolin': ['gwen'], 'striker': ['jones']}
HERO_SKIP = {'captain', 'admiral', 'the'}
TOWER_ALIAS = {'beast': ['T-Rex'], 'spike': ['Spike Factories']}

# "About this data": who each fact on a page comes from. Rendered collapsed at the foot of the page.
SOURCES = {
    'wiki': ('Bloons Wiki', 'https://www.bloonswiki.com/', 'stats, prices, XP and map facts (CC BY-SA)'),
    'fandom': ('BTD6 Fandom wiki', 'https://bloons.fandom.com/', 'second source used to cross-check prices and XP'),
    'index': ('BTD6 Index', 'https://btd6index.win/', 'lane lengths, water and line-of-sight flags, least-cost CHIMPS and solo-CHIMPS (2MP) records'),
    'cq': ('Cyber Quincy', 'https://github.com/hemisemidemipresent/cyberquincy', 'cross-check for costs and rounds'),
    'nk': ('Ninja Kiwi patch notes', None, 'balance changes up to v57.4'),
    'community': ('Community strategy guides', None, 'crosspath picks, tier 5 rankings, roles and beginner tiers: opinions, not game data'),
}
PRICE_RULE = ('Prices on Easy, Hard and Impoppable are worked out from the Medium price (x0.85, x1.08, x1.2), '
              'rounded to the nearest $5 per purchase. An Easy price can be $5 off where the game rounds a half down.')

WARNINGS = []


def warn(msg):
    WARNINGS.append(msg)
    print('warning: ' + msg, file=sys.stderr)


# ---------------------------------------------------------------- helpers
def load(name, default=None):
    try:
        with open(os.path.join(DATA, name), encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError) as e:
        warn(f'could not read data/{name}: {e}')
        return default


def norm_name(s):
    """Same normalisation as L.normName in src/logic.js."""
    s = unicodedata.normalize('NFD', str(s or ''))
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower().replace('-', ' ')
    s = re.sub(r'[^a-z0-9 ]', '', s)
    return re.sub(r'\s+', ' ', s).strip()


def price(base, mult):
    """Same rule as L.price: base x mult to the nearest $5, exact ties round down (integer maths)."""
    if base is None:
        return None
    cents = round(base * round(mult * 100))
    q, rem = divmod(cents, 500)
    return (q + 1 if rem > 250 else q) * 5


def money(v):
    if v is None:
        return '–'
    v = int(round(v))
    return ('−$' if v < 0 else '$') + f'{abs(v):,}'


def num(v, digits=0):
    if v is None:
        return '–'
    if isinstance(v, float) and digits:
        return f'{v:,.{digits}f}'
    return f'{int(round(v)):,}'


def slugify(s):
    return re.sub(r'[^a-z0-9]+', '-', norm_name(s)).strip('-')


def tidy(s):
    """Drop references to the research notes the data was compiled from."""
    if not s:
        return s
    s = re.sub(r'\s*See 0\d[a-z]? Part [\d.]+\.?', '', s)
    s = re.sub(r'\s*\(see Methods\)', '', s)
    # alternative prices from a second wiki are kept in the data, not on the page
    s = re.sub(r'(;\s*)?alt: \$[\d,]+(?: fandom)?(;\s*)?', '', s)
    s = re.sub(r'\s*\(\s*\)', '', s).replace('( ', '(')
    return s.strip()


BADGES = {'calc': ('badge-calc', 'calculated', 'Worked out from the numbers on this site, not tested in a game'),
          'unverified': ('badge-unverified', 'unverified', 'Not confirmed yet')}
TOKEN = re.compile(r'\s*\{(calc|unverified)\}')


def badge(kind):
    cls, label, title = BADGES[kind]
    return f'<span class="badge {cls}" title="{title}">{label}</span>'


def rich(s):
    """Escape a data string and turn its {calc}/{unverified} tokens into badges."""
    if not s:
        return Markup('')
    out = htmlmod.escape(tidy(str(s)), quote=False)
    return Markup(TOKEN.sub(lambda m: ' ' + badge(m.group(1)), out))


def plain(s):
    """A data string with its badge tokens dropped (for attributes and summaries)."""
    return TOKEN.sub('', tidy(str(s or ''))).strip()


def parse_code(s):
    m = re.search(r'(\d)\s*-\s*(\d)\s*-\s*(\d)', str(s or ''))
    return [int(m.group(1)), int(m.group(2)), int(m.group(3))] if m else None


def valid_cross(c):
    return (c and len(c) == 3 and all(0 <= x <= 5 for x in c)
            and sum(1 for x in c if x > 0) <= 2 and sum(1 for x in c if x > 2) <= 1)


class Ctx:
    """Everything the templates need, computed once."""


# ---------------------------------------------------------------- data model
def build_model():
    c = Ctx()
    with open(os.path.join(ROOT, 'site.json'), encoding='utf-8') as f:
        c.site = json.load(f)
    T = load('towers.json', {}) or {}
    c.meta = {'version': T.get('version') or c.site.get('dataVersion'), 'researched': T.get('researched')}
    c.mult = T.get('costMultipliers') or {'easy': 0.85, 'medium': 1, 'hard': 1.08, 'impoppable': 1.2}
    c.towers = T.get('towers', []) or []
    c.heroes = T.get('heroes', []) or []
    c.missing_xp = T.get('missingXp', []) or []
    c.maps = load('maps.json', []) or []
    c.modes = load('modes.json', []) or []
    R = load('rounds.json', {}) or {}
    defl = next((m for m in c.modes if m.get('id') == 'deflation'), {}) or {}
    c.defl_base = defl.get('xpBaseTotal') or 45950
    c.defl_xp = round(c.defl_base * TIER_XP['Expert'])
    c.rounds = {'standard': R.get('standard', []) or [], 'abr': R.get('abr', []) or []}
    strats = (load('map-strats-a.json', []) or []) + (load('map-strats-b.json', []) or [])
    c.strats = {s['mapId']: s for s in strats if isinstance(s, dict) and s.get('mapId')}
    c.tguides = {g['towerId']: g for g in (load('tower-guides.json', []) or []) if g.get('towerId')}
    c.tower_by = {t['id']: t for t in c.towers}
    c.hero_by = {h['id']: h for h in c.heroes}
    c.map_by = {m['id']: m for m in c.maps}
    c.map_by_name = {norm_name(m['name']): m for m in c.maps}

    def prices(costs):
        costs = [x for x in costs if x is not None]
        return {k: sum(price(x, c.mult.get(k, 1)) for x in costs) for k, _ in DIFFS}
    c.prices = prices

    # ---- Index name lookup (who each 2MP entity belongs to)
    ent_owner = {}
    tower_names = {}
    for t in c.towers:
        names = {}
        for p in t.get('paths', []):
            for u in p:
                if (u.get('tier') or 0) >= 3:
                    names[norm_name(u['name'])] = u['name']
                    if ':' in u['name']:
                        names[norm_name(u['name'].split(':')[0])] = u['name']
        if t['id'] in INDEX_BASE:
            names['base ' + INDEX_BASE[t['id']]] = 'Base ' + t['name']
        tower_names[t['id']] = names
        for n in names:
            ent_owner[n] = ('tower', t['id'])
    hero_names = {}
    for h in c.heroes:
        names = {norm_name(h['name']): h['name']}
        for w in norm_name(h['name']).split(' '):
            if w and w not in HERO_SKIP:
                names[w] = h['name']
        for a in HERO_ALIAS.get(h['id'], []):
            names[a] = h['name']
        hero_names[h['id']] = names
        for n in names:
            ent_owner.setdefault(n, ('hero', h['id']))
    c.tower_names, c.hero_names = tower_names, hero_names

    def two_mp_hits(names):
        out = []
        for m in c.maps:
            ents = (m.get('twoMP') or {}).get('entities') or []
            hits = [e for e in ents if norm_name(e) in names]
            if hits:
                out.append({'map': m, 'entities': hits})
        return out

    c.maps_with_names = sum(1 for m in c.maps if (m.get('twoMP') or {}).get('entities'))
    c.maps_complete = sum(1 for m in c.maps if (m.get('twoMP') or {}).get('complete'))

    # ---- towers
    c.tower_models = []
    for t in c.towers:
        tm = tower_model(c, t, two_mp_hits(tower_names[t['id']]))
        c.tower_models.append(tm)
    c.tm_by = {tm['id']: tm for tm in c.tower_models}

    # ---- heroes
    c.hero_models = []
    for h in c.heroes:
        rec = []
        for m in c.maps:
            s = c.strats.get(m['id'])
            if s and any(norm_name(x) in hero_names[h['id']] or norm_name(x) == norm_name(h['name']) for x in s.get('heroes', [])):
                rec.append(m)
        c.hero_models.append({
            'id': h['id'], 'h': h, 'prices': prices([h.get('cost')]),
            'recommended': rec, 'proven': two_mp_hits(hero_names[h['id']]),
            'url': f"heroes/{h['id']}/",
        })
    c.hm_by = {hm['id']: hm for hm in c.hero_models}
    for hm in c.hero_models:
        hm['good_with'] = good_with(c, hm['h'])

    # ---- maps
    c.map_models = [map_model(c, m, ent_owner) for m in c.maps]
    c.mm_by = {mm['id']: mm for mm in c.map_models}

    # ---- v57 changes for the home strip
    c.changes = []
    for t in c.towers:
        for pi, p in enumerate(t.get('paths', [])):
            for u in p:
                eff = u.get('effect') or ''
                m = re.search(r'v57[:]?\s*([^;)]*)', eff)
                if m and m.group(1).strip():
                    txt = m.group(1).strip().replace('->', '→')
                    txt += ')' * (txt.count('(') - txt.count(')'))
                    c.changes.append({'tower': t, 'upgrade': u, 'text': txt,
                                      'url': f"monkeys/{t['id']}/#u-{pi + 1}-{u['tier']}"})
    # home strip: towers with the most v57 changes first
    groups = {}
    for x in c.changes:
        groups.setdefault(x['tower']['id'], []).append(x)
    order = [t['id'] for t in c.towers]
    ranked = sorted(groups.items(), key=lambda kv: (-len(kv[1]), order.index(kv[0])))
    c.change_groups = [{'tower': c.tower_by[k], 'url': f'monkeys/{k}/', 'changes': v} for k, v in ranked]
    return c


def tower_model(c, t, proven):
    g = c.tguides.get(t['id'], {}) or {}
    paths = []
    for pi, p in enumerate(t.get('paths', [])):
        ups = []
        for u in p:
            code = [0, 0, 0]
            code[pi] = u['tier']
            ups.append({'u': u, 'code': '-'.join(map(str, code)), 'anchor': f"u-{pi + 1}-{u['tier']}",
                        'prices': c.prices([u.get('cost')]), 'path': pi})
        paths.append({'name': PATH_NAMES[pi], 'ups': ups})

    def cost_for(code):
        items = [t.get('baseCost')]
        for pi, n in enumerate(code):
            for u in t['paths'][pi][:n]:
                items.append(u.get('cost'))
        return c.prices(items)

    def up_label(pi, tier):
        u = t['paths'][pi][tier - 1]
        code = [0, 0, 0]
        code[pi] = tier
        return {'name': u['name'], 'code': '-'.join(map(str, code)), 'anchor': f'u-{pi + 1}-{tier}'}

    # what it can hit
    innate = t.get('innate') or {}
    hits = []
    for key, label, ikey in HIT_PROPS:
        src = []
        for pi, p in enumerate(t['paths']):
            for u in p:
                if key in (u.get('grants') or []):
                    src.append((u['tier'], u.get('cost') or 0, pi, u))
        src.sort(key=lambda x: (x[0], x[1]))
        base = bool(ikey and innate.get(ikey))
        hits.append({'label': label, 'key': key, 'base': base,
                     'from': [up_label(pi, u['tier']) for _, _, pi, u in src]})
    utility = []
    for key, label in UTILITY:
        src = [(u['tier'], pi, u) for pi, p in enumerate(t['paths']) for u in p if key in (u.get('grants') or [])]
        src.sort(key=lambda x: x[0])
        if src:
            utility.append({'label': label, 'from': [up_label(pi, u['tier']) for _, pi, u in src]})

    # crosspaths: the guide's picks first, then the dataset's popular ones
    cps = {}
    order = []
    for x in g.get('bestCrosspaths', []) or []:
        code = parse_code(x.get('code'))
        if not code or not valid_cross(code):
            continue
        k = '-'.join(map(str, code))
        if k not in cps:
            cps[k] = {'code': k, 'cross': code, 'name': None, 'use': x.get('use'), 'pick': True, 'popular': True}
            order.append(k)
    for x in t.get('crosspaths', []) or []:
        code = parse_code(x.get('code'))
        if not code or not valid_cross(code):
            continue
        k = '-'.join(map(str, code))
        if k in cps:
            cps[k]['name'] = cps[k]['name'] or x.get('name')
            continue
        cps[k] = {'code': k, 'cross': code, 'name': x.get('name'), 'use': x.get('use'), 'pick': False,
                  'popular': bool(x.get('popular'))}
        order.append(k)
    crosspaths = [cps[k] for k in order]
    crosspaths.sort(key=lambda x: (not x['pick'], not x['popular']))
    for x in crosspaths:
        x['prices'] = cost_for(x['cross'])
        if not x['name']:
            mp = max(range(3), key=lambda i: x['cross'][i])
            if x['cross'][mp]:
                x['name'] = t['paths'][mp][x['cross'][mp] - 1]['name']

    # tier 5 ranking
    t5 = []
    for name in t.get('tier5Rank', []) or []:
        for pi, p in enumerate(t['paths']):
            if len(p) >= 5 and norm_name(p[4]['name']) == norm_name(name):
                t5.append(up_label(pi, 5))
                break
        else:
            t5.append({'name': name, 'code': None, 'anchor': None})

    xp_all = g.get('xpAllUpgrades') or sum((u.get('xp') or 0) for p in t['paths'] for u in p)
    para = t.get('paragon')
    para_m = None
    if para:
        para_m = {'name': para['name'], 'prices': c.prices([para.get('cost')]), 'xp': para.get('xp'),
                  'total': (xp_all or 0) + (para.get('xp') or 0)}
    strong = [m for m in c.maps if t['id'] in ((c.strats.get(m['id']) or {}).get('strongTowers') or [])]
    avoid = [m for m in c.maps if t['id'] in ((c.strats.get(m['id']) or {}).get('avoidTowers') or [])]
    best = crosspaths[0] if crosspaths else None
    return {'id': t['id'], 't': t, 'g': g, 'paths': paths, 'hits': hits, 'utility': utility,
            'crosspaths': crosspaths, 't5': t5, 'paragon': para_m, 'xp_all': xp_all, 'proven': proven,
            'strong': strong, 'avoid': avoid, 'base_prices': c.prices([t.get('baseCost')]),
            'best': best, 'url': f"monkeys/{t['id']}/", 'non_attacker': t['id'] in NON_ATTACKERS,
            'path_xp': sum((u.get('xp') or 0) for p in t['paths'] for u in p)}


BUILD_A = re.compile(r'^R(\d+) (.+?) \[\$([\d,]+); spent \$([\d,]+); avail \$([\d,]+)\]\.?$')
BUILD_B = re.compile(r'^R(\d+) (.+?) \(\+\$([\d,]+), total \$([\d,]+)\)\.?$')


def parse_chimps(text):
    """Split a CHIMPS plan into its summary, a build-order table and a closing note."""
    text = tidy(text or '')
    m = re.search(r'Build(?: \(([^)]*)\))?( \{calc\})?:\s*', text)
    if not m:
        return {'summary': text, 'rows': [], 'basis': None, 'tail': None, 'calc': False}
    summary = text[:m.start()].strip()
    rest = text[m.end():]
    tail = None
    tm = re.search(r'\.\s*(Spare at R\d+: [^.]*\.?(?: \{calc\}\.?)?)\s*$', rest)
    if tm:
        tail = tm.group(1).strip()
        rest = rest[:tm.start()]
    rest = rest.strip().rstrip('.')
    rows = []
    for item in re.split(r';\s+(?=R\d+ )', rest):
        item = item.strip()
        a = BUILD_A.match(item)
        b = BUILD_B.match(item) if not a else None
        if a:
            rows.append({'round': int(a.group(1)), 'step': a.group(2), 'cost': a.group(3), 'total': a.group(4)})
        elif b:
            rows.append({'round': int(b.group(1)), 'step': b.group(2), 'cost': b.group(3), 'total': b.group(4)})
        else:
            return {'summary': text, 'rows': [], 'basis': None, 'tail': None, 'calc': False}
    return {'summary': summary, 'rows': rows, 'basis': m.group(1) or 'Hard prices', 'tail': tail, 'calc': bool(m.group(2))}


def map_model(c, m, ent_owner):
    s = c.strats.get(m['id']) or {}
    tm = m.get('twoMP') or {}
    ents = tm.get('entities') or []
    by_tower, by_hero, other = {}, {}, []
    for e in ents:
        own = ent_owner.get(norm_name(e))
        if own and own[0] == 'tower':
            by_tower.setdefault(own[1], []).append(e)
        elif own and own[0] == 'hero':
            by_hero.setdefault(own[1], []).append(e)
        else:
            other.append(e)
    proven_towers = [{'tm': c.tm_by[k], 'entities': v} for k, v in by_tower.items() if k in c.tm_by]
    proven_towers.sort(key=lambda x: (-len(x['entities']), x['tm']['t']['name']))
    proven_heroes = [{'hm': c.hm_by[k], 'entities': v} for k, v in by_hero.items() if k in c.hm_by]
    heroes = []
    for name in s.get('heroes', []) or []:
        hit = None
        for hid, names in c.hero_names.items():
            if norm_name(name) in names:
                hit = c.hm_by[hid]
                break
        heroes.append({'name': name, 'hm': hit})
    lanes = (m.get('rbs') or {}).get('lanes') or []
    lane_vals = [l['rbs'] for l in lanes if isinstance(l.get('rbs'), (int, float))]
    list_state = 'complete' if tm.get('complete') else ('partial' if ents else 'none')
    return {
        'id': m['id'], 'm': m, 's': s, 'url': f"maps/{m['id']}/",
        'easy': tidy(s.get('easyPlan')), 'hard': tidy(s.get('hardPlan')), 'chimps': parse_chimps(s.get('chimpsPlan')),
        'placement': tidy(s.get('placement')), 'xpFarm': tidy(s.get('xpFarm')),
        'strong': [c.tm_by[x] for x in s.get('strongTowers', []) or [] if x in c.tm_by],
        'avoid': [c.tm_by[x] for x in s.get('avoidTowers', []) or [] if x in c.tm_by],
        'heroes': heroes, 'proven_towers': proven_towers, 'proven_heroes': proven_heroes, 'other_ents': other,
        'lanes': lanes, 'lane_min': min(lane_vals) if lane_vals else None,
        'lane_max': max(lane_vals) if lane_vals else None, 'list_state': list_state,
        'two_mp_count': tm.get('count'), 'removables': [dict(r, prices=c.prices([r.get('cost')])) for r in m.get('removables') or []],
    }


def about(c, keys, notes=None):
    return {'sources': [SOURCES[k] for k in keys], 'notes': [n for n in (notes or []) if n],
            'checked': c.meta.get('researched')}


def about_tower(c, tm):
    t = tm['t']
    notes = [PRICE_RULE]
    missing = [x.split(': ', 1)[1] for x in c.missing_xp if x.startswith(t['name'] + ': ')]
    if missing:
        notes.append('Unlock XP is unknown for ' + ', '.join(missing) + '; it is shown as "XP ?".')
    if tm['g'].get('farm'):
        notes.append('XP farm numbers are worked out with the Deflation XP formula (Expert map x1.3, Monkey Education on), '
                     'split by each tower\'s share of the money spent. They are not play-tested.')
    notes += t.get('about') or []
    return about(c, ['wiki', 'fandom', 'nk', 'index', 'community'], notes)


def about_map(c, mm):
    m = mm['m']
    notes = ['Strategies and build orders are worked out from the numbers on this site, not play-tested. '
             'Build-order prices are Hard (x1.08), which is also what CHIMPS charges.']
    yn = {True: 'yes', False: 'no'}
    label = {'losBlockers': 'Line of sight', 'paths': 'Lanes', 'removables': 'Removables'}
    for x in m.get('conflicts') or []:
        idx = yn.get(x.get('index'), x.get('index'))
        kept = {'index': 'the BTD6 Index value'}.get(x.get('kept'), x.get('kept'))
        notes.append(f"{label.get(x.get('field'), x.get('field'))}: the BTD6 Index says {idx}; other sources say {x.get('other')}. "
                     f"This page uses {kept}.")
    if m.get('trackLengthNote'):
        notes.append('Track length: ' + m['trackLengthNote'])
    notes += m.get('about') or []
    return about(c, ['wiki', 'fandom', 'index'], notes)


def about_hero(c, hm):
    return about(c, ['wiki', 'fandom', 'index', 'community'],
                 [PRICE_RULE, '"Recommended on" lists the maps whose strategy on this site names this hero.'])


def good_with(c, h):
    """Towers a hero's own text names (tower names, short names, tier 3+ upgrade names)."""
    text = ' '.join(plain(h.get(k)) for k in ('bestFor', 'camo', 'lead'))
    found = []
    for t in c.towers:
        names = {t['name']}
        short = re.sub(r'^Monkey |(?: Monkey| Shooter| Gunner| Pilot)$', '', t['name'])
        if short not in ('Ice', 'Super', 'Farm', 'Spike'):
            names.add(short)
        names |= {u['name'].split(':')[0] for p in t['paths'] for u in p if (u.get('tier') or 0) >= 3}
        names |= set(TOWER_ALIAS.get(t['id'], []))
        pos = [m.start() for n in names for m in re.finditer(r'(?<![\w-])' + re.escape(n) + r's?(?![\w-])', text)]
        if pos:
            found.append((min(pos), c.tm_by[t['id']]))
    return [tm for _, tm in sorted(found, key=lambda x: x[0])]


# ---------------------------------------------------------------- guides
def parse_frontmatter(text):
    if not text.startswith('---'):
        return {}, text
    m = re.match(r'^---\s*\n(.*?)\n---\s*\n?(.*)$', text, re.S)
    if not m:
        return {}, text
    raw, body = m.group(1), m.group(2)
    try:
        import yaml
        fm = yaml.safe_load(raw) or {}
        if not isinstance(fm, dict):
            fm = {}
    except Exception:
        fm, key = {}, None
        for line in raw.splitlines():
            if re.match(r'^\s+-\s+', line) and key:
                fm.setdefault(key, [])
                if isinstance(fm[key], list):
                    fm[key].append(line.split('-', 1)[1].strip().strip('"\''))
                continue
            mm = re.match(r'^([A-Za-z_][\w-]*):\s*(.*)$', line)
            if mm:
                key, val = mm.group(1), mm.group(2).strip()
                if val.startswith('[') and val.endswith(']'):
                    fm[key] = [v.strip().strip('"\'') for v in val[1:-1].split(',') if v.strip()]
                elif val == '':
                    fm[key] = []
                else:
                    fm[key] = val.strip('"\'')
    for k, v in list(fm.items()):
        if isinstance(v, (datetime.date, datetime.datetime)):
            fm[k] = v.isoformat()[:10]
    return fm, body


def load_guides():
    gdir = os.path.join(CONTENT, 'guides')
    out = []
    if not os.path.isdir(gdir):
        return out
    for fn in sorted(os.listdir(gdir)):
        if not fn.endswith('.md') or fn.startswith(('_', '.')):
            continue
        try:
            with open(os.path.join(gdir, fn), encoding='utf-8') as f:
                text = f.read()
        except OSError as e:
            warn(f'could not read guide {fn}: {e}')
            continue
        fm, body = parse_frontmatter(text)
        slug = slugify(str(fm.get('slug') or fn[:-3]))
        if not slug:
            continue
        title = str(fm.get('title') or fn[:-3].replace('-', ' ').title())
        group = str(fm.get('group') or 'Guides').strip()
        group = 'Reference' if group.lower().startswith('ref') else 'Guides'
        try:
            order = float(fm.get('order'))
        except (TypeError, ValueError):
            order = 999
        related = fm.get('related') or []
        if isinstance(related, str):
            related = [x.strip() for x in related.split(',') if x.strip()]
        out.append({'slug': slug, 'title': title, 'group': group, 'order': order,
                    'summary': str(fm.get('summary') or ''), 'updated': str(fm.get('updated') or ''),
                    'gameVersion': str(fm.get('gameVersion') or ''), 'related': [str(r) for r in related],
                    'body': body, 'file': fn, 'url': f'guides/{slug}/'})
    seen = {}
    uniq = []
    for g in out:
        if g['slug'] in seen:
            warn(f"duplicate guide slug '{g['slug']}' in {g['file']} (kept {seen[g['slug']]})")
            continue
        seen[g['slug']] = g['file']
        uniq.append(g)
    return uniq


def resolve_internal(href, from_path, base):
    """Return (site_path, fragment) for an internal link, or None for an external one."""
    if not href or re.match(r'^[a-z][a-z0-9+.-]*:', href, re.I) or href.startswith('//'):
        return None
    if href.startswith('#'):
        return (from_path, href[1:])
    path, _, frag = href.partition('#')
    path = path.split('?')[0]
    if path.startswith(base):
        path = path[len(base):]
    elif path.startswith('/'):
        path = path[1:]
    else:
        path = posixpath.normpath(posixpath.join(posixpath.dirname(from_path.rstrip('/') + '/x'), path))
        if path == '.':
            path = ''
    if path.endswith('.md'):
        path = 'guides/' + slugify(posixpath.basename(path)[:-3]) + '/'
    if path.endswith('index.html'):
        path = path[:-10]
    if path and not path.endswith('/') and '.' not in posixpath.basename(path):
        path += '/'
    return (path.lstrip('/'), frag)


def render_markdown(g, planned, base, root):
    md = markdown.Markdown(extensions=['tables', 'fenced_code', 'toc', 'sane_lists', 'attr_list'],
                           extension_configs={'toc': {'toc_depth': '2-3'}})
    body = md.convert(g['body'])
    toc = [{'id': t['id'], 'name': htmlmod.unescape(t['name'])} for t in getattr(md, 'toc_tokens', []) if t.get('level') == 2]
    # the page renders its own h1
    body = re.sub(r'^\s*<h1[^>]*>.*?</h1>\s*', '', body, count=1, flags=re.S)
    body = body.replace('<h1', '<h2').replace('</h1>', '</h2>')
    body = re.sub(r'<table>', '<div class="table-wrap"><table>', body)
    body = body.replace('</table>', '</table></div>')

    def fix(mo):
        attrs, inner = mo.group(1), mo.group(2)
        hm = re.search(r'href="([^"]*)"', attrs)
        if not hm:
            return mo.group(0)
        href = htmlmod.unescape(hm.group(1))
        r = resolve_internal(href, g['url'], base)
        if r is None:
            new_attrs = attrs if 'rel=' in attrs else attrs + ' rel="noopener"'
            return f'<a{new_attrs}>{inner}</a>'
        path, frag = r
        if path not in planned:
            warn(f"guide {g['file']}: link to '{href}' has no page here; rendered as plain text")
            return f'<span class="dead-link">{inner}</span>'
        new = root + path + ('#' + frag if frag else '')
        return '<a' + attrs.replace(hm.group(0), 'href="' + htmlmod.escape(new, quote=True) + '"') + '>' + inner + '</a>'
    body = re.sub(r'<a(\s[^>]*)>(.*?)</a>', fix, body, flags=re.S)
    body = re.sub(r'<img(?![^>]*\balt=)', '<img alt=""', body)
    return body, toc


# ---------------------------------------------------------------- output
class Writer:
    def __init__(self):
        self.files = []

    def write(self, rel, content, binary=False):
        full = os.path.join(ROOT, rel)
        os.makedirs(os.path.dirname(full) or ROOT, exist_ok=True)
        with open(full, 'wb' if binary else 'w', **({} if binary else {'encoding': 'utf-8'})) as f:
            f.write(content)
        self.files.append(rel.replace(os.sep, '/'))


def safe_rel(rel):
    rel = rel.replace('\\', '/').lstrip('/')
    if not rel or '..' in rel.split('/'):
        return False
    first = rel.split('/')[0]
    if first in PROTECTED_DIRS:
        return False
    if '/' not in rel and rel in PROTECTED_FILES:
        return False
    return True


def clean_previous():
    if not os.path.exists(MANIFEST):
        return 0
    try:
        with open(MANIFEST, encoding='utf-8') as f:
            old = json.load(f).get('files', [])
    except (OSError, ValueError):
        warn('could not read .build-manifest.json; skipping cleanup')
        return 0
    n = 0
    dirs = set()
    for rel in old:
        if not safe_rel(rel):
            continue
        full = os.path.join(ROOT, rel)
        if os.path.isfile(full):
            os.remove(full)
            n += 1
        d = os.path.dirname(rel)
        while d:
            dirs.add(d)
            d = os.path.dirname(d)
    for d in sorted(dirs, key=lambda x: -x.count('/')):
        full = os.path.join(ROOT, d)
        if safe_rel(d) and os.path.isdir(full) and not os.listdir(full):
            os.rmdir(full)
    return n


def main():
    t0 = time.time()
    c = build_model()
    site = c.site
    base = site.get('base', '/')
    removed = clean_previous()
    W = Writer()

    guides = load_guides()
    rounds_md = next((g for g in guides if g['slug'] == 'rounds'), None)
    guides = [g for g in guides if g['slug'] != 'rounds']

    # every page path, for link checks inside guides
    planned = {'', 'planner/', 'monkeys/', 'monkeys/heroes/', 'monkeys/paragons/', 'heroes/', 'maps/', 'guides/',
               'guides/rounds/', 'records/', 'a-z/', '404.html', 'search-index.json'}
    planned |= {tm['url'] for tm in c.tower_models} | {hm['url'] for hm in c.hero_models}
    planned |= {mm['url'] for mm in c.map_models} | {g['url'] for g in guides}

    env = jinja2.Environment(loader=jinja2.FileSystemLoader(TEMPLATES),
                             autoescape=jinja2.select_autoescape(['html']),
                             trim_blocks=True, lstrip_blocks=True, undefined=jinja2.ChainableUndefined)
    env.filters['money'] = money
    env.filters['num'] = num
    env.filters['tidy'] = tidy
    env.filters['rich'] = rich
    env.filters['plain'] = plain
    env.globals.update(site=site, meta=c.meta, DIFFS=DIFFS, TIERS=TIERS, TIER_XP=TIER_XP, CLASSES=CLASSES,
                       THREAT_LABEL=THREAT_LABEL, mult=c.mult, ctx=c, year=datetime.date.today().year)

    def link_maps(text, root):
        """Escape text and link any map names in it."""
        out = htmlmod.escape(text or '')
        for m in sorted(c.maps, key=lambda x: -len(x['name'])):
            pat = re.escape(htmlmod.escape(m['name']))
            out = re.sub(r'(?<![\w>])' + pat + r'(?![\w<])',
                         lambda mo, m=m: f'<a href="{root}maps/{m["id"]}/">{mo.group(0)}</a>', out, count=1)
        return Markup(out)
    env.globals['link_maps'] = link_maps

    generic_about = about(c, ['wiki', 'fandom', 'index', 'cq', 'nk'])

    def page(path, template, title, description, section=None, crumbs=None, **kw):
        if 'about' not in kw:
            kw['about'] = None if template in ('404.html', 'redirect.html', 'guide.html') else generic_about
        if path == '404.html':
            root = base
        else:
            depth = len([p for p in path.split('/') if p])
            root = '../' * depth
        html = env.get_template(template).render(
            root=root, path=path, title=title, description=description, section=section,
            crumbs=crumbs or [], canonical=site['siteUrl'] + (path if path != '404.html' else ''), **kw)
        html = re.sub(r'\n\s*\n+', '\n', html)
        W.write(path + 'index.html' if path.endswith('/') or path == '' else path, html)

    v = c.meta['version']
    counts = {'towers': len(c.towers), 'heroes': len(c.heroes), 'maps': len(c.maps),
              'paragons': sum(1 for t in c.towers if t.get('paragon')), 'guides': len(guides)}

    # ---- home
    farm_guide = next((g for g in guides if re.search(r'xp|farm', g['slug'])), None)
    page('', 'home.html', f"{site['name']}: unofficial BTD6 hub",
         f"Unofficial Bloons TD 6 hub for v{v}: every tower, hero, paragon and map, CHIMPS records, rounds and a build planner.",
         section='home', counts=counts, farm_guide=farm_guide)

    # ---- planner
    sys.path.insert(0, SRC)
    import build as planner_build  # src/build.py
    planner_build.main()
    with open(os.path.join(SRC, 'btd6-planner.html'), encoding='utf-8') as f:
        frag = f.read()
    frag = re.sub(r'<title>.*?</title>\s*', '', frag, flags=re.S)
    frag = re.sub(r'<meta name="claude:[^>]*>\s*', '', frag)
    frag = re.sub(r'<link rel="(?:preconnect|stylesheet)"[^>]*fonts\.(?:googleapis|gstatic)[^>]*>\s*', '', frag)
    styles = ''.join(re.findall(r'<style>.*?</style>', frag, flags=re.S))
    frag = re.sub(r'<style>.*?</style>\s*', '', frag, flags=re.S)
    page('planner/', 'planner.html', f"Planner · {site['name']}",
         'BTD6 build planner: coverage check, mode legality, priced build order, cash curve and tower-XP projection for any map and mode.',
         section='planner', crumbs=[('Planner', None)], planner_html=Markup(frag),
         planner_css=Markup(styles))

    # ---- monkeys
    by_class = [(cl, [tm for tm in c.tower_models if tm['t'].get('class') == cl]) for cl in CLASSES]
    page('monkeys/', 'monkeys.html', f"Monkeys · {site['name']}",
         f"All {counts['towers']} BTD6 towers by class, with base prices, top crosspaths and paragons (v{v}).",
         section='monkeys', crumbs=[('Monkeys', None)], tab='towers', by_class=by_class)
    page('monkeys/heroes/', 'heroes.html', f"Heroes · {site['name']}",
         f"All {counts['heroes']} BTD6 heroes: price on every difficulty, unlock level, camo and lead answers (v{v}).",
         section='monkeys', crumbs=[('Monkeys', 'monkeys/'), ('Heroes', None)], tab='heroes')
    page('monkeys/paragons/', 'paragons.html', f"Paragons and XP farms · {site['name']}",
         f"Every BTD6 paragon with its price, XP from zero and the best Deflation farm to get there (v{v}).",
         section='monkeys', crumbs=[('Monkeys', 'monkeys/'), ('Paragons', None)], tab='paragons',
         about=about(c, ['wiki', 'fandom', 'community'], ['Farm XP and runs are worked out with the Deflation XP formula '
                     '(Expert map x1.3, Monkey Education on), split by each tower\'s share of the money spent. They are not play-tested.']))
    page('heroes/', 'redirect.html', f"Heroes · {site['name']}", 'Moved to the Monkeys page, Heroes tab.',
         section='monkeys', target='monkeys/heroes/')
    for tm in c.tower_models:
        t = tm['t']
        page(tm['url'], 'tower.html', f"{t['name']} · {site['name']}",
             f"{t['name']} (BTD6 v{v}): all 15 upgrades with prices on every difficulty, XP to unlock, best crosspaths, what it pops and CHIMPS proof.",
             section='monkeys', crumbs=[('Monkeys', 'monkeys/'), (t.get('class'), 'monkeys/#' + slugify(t.get('class'))), (t['name'], None)],
             tm=tm, about=about_tower(c, tm))
    for hm in c.hero_models:
        h = hm['h']
        page(hm['url'], 'hero.html', f"{h['name']} · {site['name']}",
             f"{h['name']} (BTD6 v{v}): price, unlock, camo and lead, best maps and solo-CHIMPS proof.",
             section='monkeys', crumbs=[('Monkeys', 'monkeys/'), ('Heroes', 'monkeys/heroes/'), (h['name'], None)], hm=hm,
             about=about_hero(c, hm))

    # ---- maps
    page('maps/', 'maps.html', f"Maps · {site['name']}",
         f"All {counts['maps']} BTD6 maps: difficulty, water, line of sight, lane length, CHIMPS records. Filter and search.",
         section='maps', crumbs=[('Maps', None)])
    for mm in c.map_models:
        m = mm['m']
        page(mm['url'], 'map.html', f"{m['name']} · {site['name']}",
             f"{m['name']} ({m['difficulty']}) in BTD6 v{v}: map facts, BTD6 Index records and strategies for Easy, Hard and CHIMPS.",
             section='maps', crumbs=[('Maps', 'maps/'), (m['difficulty'], 'maps/#' + m['difficulty'].lower()), (m['name'], None)], mm=mm,
             about=about_map(c, mm))

    # ---- guides
    for g in guides:
        g['html'], g['toc'] = render_markdown(g, planned, base, '../../')
    rounds_intro = None
    if rounds_md:
        rounds_md['url'] = 'guides/rounds/'
        rounds_intro, _ = render_markdown(rounds_md, planned, base, '../../')
    rounds_entry = {'slug': 'rounds', 'title': rounds_md['title'] if rounds_md else 'Rounds',
                    'group': 'Reference', 'order': rounds_md['order'] if rounds_md else 0,
                    'summary': (rounds_md or {}).get('summary') or 'Every round 1–140, standard and ABR: Bloons, RBE, cash, XP and the danger rounds.',
                    'url': 'guides/rounds/', 'updated': (rounds_md or {}).get('updated') or c.meta['researched'] or '',
                    'gameVersion': (rounds_md or {}).get('gameVersion') or v, 'related': (rounds_md or {}).get('related') or []}
    all_guides = guides + [rounds_entry]
    groups = [(name, sorted([g for g in all_guides if g['group'] == name], key=lambda g: (g['order'], g['title'])))
              for name in ('Guides', 'Reference')]
    page('guides/', 'guides.html', f"Guides · {site['name']}",
         'BTD6 guides and reference: rounds, Bloons, modes, Monkey Knowledge and a glossary.',
         section='guides', crumbs=[('Guides', None)], groups=groups)

    def related_links(items, root):
        out = []
        for r in items:
            key = slugify(r.split('/')[-1] if '/' in r.strip('/') else r)
            rr = r.strip('/')
            if rr.startswith(('maps/', 'monkeys/', 'heroes/', 'guides/')) and rr + '/' in planned:
                label = rr
                if rr.startswith('maps/') and key in c.mm_by:
                    label = c.mm_by[key]['m']['name']
                elif rr.startswith('monkeys/') and key in c.tm_by:
                    label = c.tm_by[key]['t']['name']
                elif rr.startswith('heroes/') and key in c.hm_by:
                    label = c.hm_by[key]['h']['name']
                elif rr.startswith('guides/'):
                    label = next((g['title'] for g in all_guides if g['slug'] == key), key)
                out.append((label, rr + '/'))
            elif key in {g['slug'] for g in all_guides}:
                out.append((next(g['title'] for g in all_guides if g['slug'] == key), f'guides/{key}/'))
            elif key in c.tm_by:
                out.append((c.tm_by[key]['t']['name'], c.tm_by[key]['url']))
            elif key in c.mm_by:
                out.append((c.mm_by[key]['m']['name'], c.mm_by[key]['url']))
            elif key in c.hm_by:
                out.append((c.hm_by[key]['h']['name'], c.hm_by[key]['url']))
            elif norm_name(r) in c.map_by_name:
                mm = c.mm_by[c.map_by_name[norm_name(r)]['id']]
                out.append((mm['m']['name'], mm['url']))
            else:
                warn(f"related entry '{r}' matches no page; skipped")
        return out

    for g in guides:
        page(g['url'], 'guide.html', f"{g['title']} · {site['name']}",
             g['summary'] or f"{g['title']}: a BTD6 v{v} guide.", section='guides',
             crumbs=[('Guides', 'guides/')] + ([('Reference', 'guides/#reference')] if g['group'] == 'Reference' else []) + [(g['title'], None)],
             g=g, related=related_links(g['related'], '../../'))
    page('guides/rounds/', 'rounds.html', f"Rounds 1–140 · {site['name']}",
         'Every BTD6 round 1–140 for standard and Alternate Bloons Rounds: Bloons, RBE, cash, XP and danger rounds.',
         section='guides', crumbs=[('Guides', 'guides/'), ('Reference', 'guides/#reference'), ('Rounds', None)],
         intro=Markup(rounds_intro) if rounds_intro else None, g=rounds_entry,
         related=related_links(rounds_entry['related'], '../../'),
         about=about(c, ['wiki', 'cq', 'nk'], ['Cash is pop cash plus the end-of-round bonus (100 + the round number), with no '
                     'income towers, Monkey Knowledge or Double Cash.', 'Freeplay pop-cash rates for rounds 101-140 (8% and 5%) '
                     'follow the v53.0 patch notes.']))

    # ---- records
    page('records/', 'records.html', f"Records · {site['name']}",
         'BTD6 Index records for all 90 maps: solo-CHIMPS (2MP) counts, least-cost CHIMPS, lane lengths, entrances and exits.',
         section='records', crumbs=[('Records', None)],
         about=about(c, ['index'], ['Map metadata and records from the BTD6 Index, v57.4 data.']))

    # ---- search index + A-Z
    entries = []
    for tm in c.tower_models:
        t = tm['t']
        entries.append({'t': t['name'], 'k': 'Tower', 'u': tm['url'], 's': f"{t.get('class')} · {money(t.get('baseCost'))}"})
        for p in tm['paths']:
            for x in p['ups']:
                entries.append({'t': x['u']['name'], 'k': 'Upgrade', 'u': tm['url'] + '#' + x['anchor'],
                                's': f"{t['name']} {x['code']} · {money(x['u'].get('cost'))}", 'x': t['name']})
        if tm['paragon']:
            entries.append({'t': tm['paragon']['name'], 'k': 'Paragon', 'u': tm['url'] + '#paragon',
                            's': f"{t['name']} paragon · {money(tm['paragon']['prices']['medium'])}", 'x': t['name'] + ' paragon'})
    for hm in c.hero_models:
        entries.append({'t': hm['h']['name'], 'k': 'Hero', 'u': hm['url'], 's': f"Hero · {money(hm['h'].get('cost'))}"})
    for mm in c.map_models:
        entries.append({'t': mm['m']['name'], 'k': 'Map', 'u': mm['url'], 's': mm['m']['difficulty']})
    for g in all_guides:
        entries.append({'t': g['title'], 'k': g['group'][:-1] if g['group'].endswith('s') else g['group'], 'u': g['url'], 's': g['summary'][:80]})
    for r in c.rounds['standard']:
        comp = (r.get('composition') or '')[:70]
        entries.append({'t': f"Round {r['round']}", 'k': 'Round', 'u': f"guides/rounds/#r{r['round']}", 's': comp, 'x': f"r{r['round']}"})
    W.write('search-index.json', json.dumps({'version': site['version'], 'entries': entries}, ensure_ascii=False, separators=(',', ':')))

    az = {}
    for e in entries:
        if e['k'] == 'Round':
            continue
        letter = norm_name(e['t'])[:1].upper()
        letter = letter if letter.isalpha() else '#'
        az.setdefault(letter, []).append(e)
    az_groups = [(k, sorted(az[k], key=lambda e: (norm_name(e['t']), e['k']))) for k in sorted(az, key=lambda k: (k == '#', k))]
    page('a-z/', 'az.html', f"A–Z index · {site['name']}",
         'Every tower, upgrade, paragon, hero, map and guide on the site, A to Z.',
         section=None, crumbs=[('A–Z', None)], az_groups=az_groups)

    page('404.html', '404.html', f"Page not found · {site['name']}", 'This page does not exist.', section=None)

    # ---- static assets
    for fn in sorted(os.listdir(STATIC)):
        full = os.path.join(STATIC, fn)
        if os.path.isfile(full) and not fn.startswith('.'):
            with open(full, 'rb') as f:
                W.write('assets/' + fn, f.read(), binary=True)

    if not os.path.exists(os.path.join(ROOT, '.nojekyll')):
        open(os.path.join(ROOT, '.nojekyll'), 'w').close()
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        json.dump({'generator': 'tools/build_site.py', 'version': site['version'],
                   'files': sorted(W.files)}, f, indent=1)
        f.write('\n')
    kinds = {}
    for rel in W.files:
        if rel.endswith('.html'):
            k = rel.split('/')[0] if '/' in rel else rel
            kinds[k] = kinds.get(k, 0) + 1
    dt = time.time() - t0
    print(f"built {sum(kinds.values())} pages ({', '.join(f'{k} {n}' for k, n in sorted(kinds.items()))}); "
          f"{len(W.files)} files; removed {removed} old files; {len(WARNINGS)} warnings; {dt:.2f}s")


if __name__ == '__main__':
    main()
