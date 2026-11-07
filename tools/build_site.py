#!/usr/bin/env python3
"""Build the Monkey Intel site into the repo root (what GitHub Pages serves).

    python3 tools/build_site.py

Reads data/*.json, content/guides/*.md, content/quick/*.md, templates/ and
static/ and the tool pages from src/pages/*.body.html (docs/CONTRACTS.md C3;
src/build_tools.py runs first so their data bundle is current). Writes index.html, 404.html,
search-index.json and the quick/, rounds/, monkeys/, heroes/, maps/, guides/,
tools/<slug>/, patch/, about/, records/, a-z/, planner/ (redirect) and assets/
folders. Every generated path is listed in .build-manifest.json; the next
build deletes exactly those files first, so hand-written files are never
touched.

data/pop-model.json (C1) and data/heroes-levels.json (C2) are required: the
build stops if either is missing. There are no fixture stand-ins.

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
PAGES_SRC = os.path.join(SRC, 'pages')
TEMPLATES = os.path.join(ROOT, 'templates')
STATIC = os.path.join(ROOT, 'static')
CONTENT = os.environ.get('MI_CONTENT_DIR') or os.path.join(ROOT, 'content')
MANIFEST = os.path.join(ROOT, '.build-manifest.json')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mi_lib import PopModel, PROP_LABEL, Linker, code_of, sentences, steps, key_round  # noqa: E402

PROTECTED_DIRS = {'.git', 'src', 'data', 'content', 'docs', 'tools', 'templates', 'static', 'node_modules'}
PROTECTED_FILES = {'README.md', 'CHANGELOG.md', 'LICENSE', 'DATA-LICENSE.md', 'site.json', '.nojekyll',
                   '.gitignore', '.build-manifest.json'}
# Tool pages live at /tools/<slug>/ (C3), next to this script's own folder. Only these generated files
# inside tools/ may be written or cleaned.
TOOL_OUTPUT = re.compile(r'^tools/(?:index\.html|(?!fixtures/)[a-z0-9-]+/index\.html)$')
GENERATED_DIRS = ['quick', 'rounds', 'monkeys', 'heroes', 'maps', 'guides', 'tools/<slug>', 'patch', 'about',
                  'records', 'a-z', 'planner', 'assets']

# Run-enders: rounds 1-100 with danger 3 in data/rounds.json (owner list + community killers). One source for every
# "run-ender" label: round pages, the rounds table and the Simulator all read the same field.
def _danger_rounds():
    try:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'rounds.json'), encoding='utf-8') as f:
            rows = json.load(f).get('standard', [])
        return [r['round'] for r in rows if r.get('round', 999) <= 100 and (r.get('danger') or 0) >= 3]
    except (OSError, ValueError):
        return [24, 28, 33, 37, 40, 45, 63, 75, 76, 78, 90, 95, 98, 99, 100]
DANGER_ROUNDS = _danger_rounds()


def clip_words(text, n):
    """Cut text to at most n characters at a word break, with an ellipsis when it was cut."""
    text = str(text or '')
    if len(text) <= n:
        return text
    cut = text[:n - 1]
    if ' ' in cut:
        cut = cut[:cut.rfind(' ')]
    return cut.rstrip(' ,;:') + '…'
# Tool pages written by the tools stream (C3). Order = menu order.
TOOLS = [('advisor', 'Strategy Advisor', 'I know my monkeys, not how to use them: crosspaths, a build order and the gaps.'),
         ('simulator', 'Simulator', 'Strategy lab: invent a build and test it round by round, cash and leaks included.'),
         ('goals', 'My goals', 'Track the Paragon or tier 5 you want: log runs, spend XP, see runs left.'),
         ('xp', 'XP calculator', 'I have this much XP and want that upgrade: how many games of what.'),
         ('defence', 'Check my defence', 'Your towers and round: the next threats you can\'t pop, each with a fix.'),
         ('profile', 'My profile', 'Your unlocks, Paragons, heroes, Monkey Knowledge and Insta Monkeys: every tool uses them.')]
TOOL_ICON = {'advisor': 'book', 'simulator': 'plan', 'goals': 'yes', 'xp': 'xp', 'defence': 'round', 'profile': 'monkey'}
TOOL_DOOR = {'advisor': 'door-grass', 'simulator': 'door-sky', 'goals': 'door-banana', 'xp': 'door-wood', 'defence': 'door-grass', 'profile': 'door-sky'}
# Footer and overflow menu.
MORE_LINKS = [('Records', 'records/'), ('Patch notes', 'patch/'), ('Known issues', 'guides/known-issues/'),
              ('About', 'about/'), ('A–Z index', 'a-z/')]
# Round threats -> quick card slug.
THREAT_CARD = {'camo': 'camo', 'lead': 'lead', 'purple': 'purple', 'black': 'black-zebra', 'zebra': 'black-zebra',
               'white': 'white-frozen', 'fortified': 'fortified', 'moab': 'moab', 'bfb': 'moab', 'zomg': 'moab',
               'bad': 'moab', 'ddt': 'ddt'}

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


def load_required(name):
    """data/<name> that the site can't be built without (C1 pop model, C2 hero levels). Missing = build fails."""
    try:
        with open(os.path.join(DATA, name), encoding='utf-8') as f:
            data = json.load(f)
    except (OSError, ValueError) as e:
        sys.exit(f'build_site: data/{name} is required ({e})')
    if not data or (isinstance(data, dict) and data.get('_fixture')):
        sys.exit(f'build_site: data/{name} is empty or a fixture')
    return data


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


def inline_md(s):
    """**bold** in short frontmatter strings (escaped first)."""
    out = htmlmod.escape(str(s or ''), quote=False)
    return Markup(re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', out))


def step_label(s):
    """Split a leading "Medium:" / "On Hard:" label off a step."""
    m = re.match(r'^((?:On )?(?:Easy|Medium|Hard|Impoppable|CHIMPS|Core build|Spend by R\d+|Placement|Camo|Lead))\s*:\s*(.+)$', s)
    return (m.group(1), m.group(2)) if m else (None, s)


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

    # ---- pop model (C1) and hero levels (C2): required
    c.pop = PopModel(load_required('pop-model.json'))
    if not c.pop.towers:
        sys.exit('build_site: data/pop-model.json has no towers')
    hl = load_required('heroes-levels.json')
    c.hero_levels = {k: v for k, v in hl.items() if isinstance(v, dict)}
    c.synergy_rules = (load('synergy-rules.json', {}) or {}).get('rules') or []

    def cross_items(tid, cross):
        t = c.tower_by.get(tid)
        if not t:
            return []
        items = [t.get('baseCost')]
        for pi, n in enumerate(cross):
            for u in t['paths'][pi][:n]:
                items.append(u.get('cost'))
        return items
    c.cross_prices = lambda tid, cross: prices(cross_items(tid, cross))
    c.cross_medium = lambda tid, cross: prices(cross_items(tid, cross))['medium']

    def cross_name(tid, cross):
        t = c.tower_by[tid]
        mp = max(range(3), key=lambda i: cross[i])
        if not cross[mp]:
            return 'base ' + re.sub(r'^Monkey ', '', t['name'])
        main = t['paths'][mp][cross[mp] - 1]['name']
        other = [i for i in range(3) if i != mp and cross[i]]
        if other:
            main += ' + ' + t['paths'][other[0]][cross[other[0]] - 1]['name']
        return main
    c.cross_name = cross_name

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

    # ---- text linker (round chips, codes, tower/hero links) used by map, round and card pages
    names = []
    for t in c.towers:
        names.append((t['name'], f"monkeys/{t['id']}/"))
        short = re.sub(r'^Monkey |(?: Monkey| Shooter| Gunner| Pilot)$', '', t['name'])
        if short not in ('Ice', 'Super', 'Farm', 'Spike', 'Monkey'):
            names.append((short, f"monkeys/{t['id']}/"))
        for a in TOWER_ALIAS.get(t['id'], []):
            names.append((a, f"monkeys/{t['id']}/"))
        for pi, p in enumerate(t['paths']):
            for u in p:
                if (u.get('tier') or 0) >= 3:
                    names.append((u['name'], f"monkeys/{t['id']}/#u-{pi + 1}-{u['tier']}"))
        if t.get('paragon'):
            names.append((t['paragon']['name'], f"monkeys/{t['id']}/#paragon"))
    names.append(('MIB', 'monkeys/village/#u-2-3'))
    for h in c.heroes:
        names.append((h['name'], f"heroes/{h['id']}/"))
        first = h['name'].split(' ')[0]
        if first not in ('Captain', 'Admiral') and len(first) >= 3:
            names.append((first, f"heroes/{h['id']}/"))
        for a in HERO_ALIAS.get(h['id'], []):
            names.append((a.capitalize(), f"heroes/{h['id']}/"))
    c.lx = Linker(names, DANGER_ROUNDS, badge)

    # ---- maps
    c.map_models = [map_model(c, m, ent_owner) for m in c.maps]
    c.mm_by = {mm['id']: mm for mm in c.map_models}
    hard_plans(c)

    # ---- rounds (standard 1-100 get a page each)
    c.round_models = round_models(c)
    c.rm_by = {r['n']: r for r in c.round_models}

    # ---- prices of every synergy-rule suggestion (the tower-page picker shows them next to each pairing)
    c.syn_prices = {}
    for r in c.synergy_rules:
        sg = r.get('suggest') or {}
        cross = parse_code(sg.get('x')) if sg.get('tower') in c.tower_by and sg.get('x') else None
        if cross and valid_cross(cross):
            c.syn_prices[f"{sg['tower']}:{sg['x']}"] = c.cross_prices(sg['tower'], cross)

    # ---- tower key answers + picker data (needs the pop model)
    for tm in c.tower_models:
        tm['answers'] = key_answers(c, tm)
        tm['picker'] = picker_data(c, tm)

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

    # what it can hit: the pop model (C1) only. The old per-upgrade `grants` tags are retired.
    hits = []
    for key, label, _ in HIT_PROPS:
        base = c.pop.can(t['id'], key, [0, 0, 0])
        frm = []
        for pi, p in enumerate(t['paths']):
            for u in p:
                cross = [0, 0, 0]
                cross[pi] = u['tier']
                prev = cross[:]
                prev[pi] -= 1
                if c.pop.can(t['id'], key, cross) and not c.pop.can(t['id'], key, prev):
                    frm.append(up_label(pi, u['tier']))
        hits.append({'label': label, 'key': key, 'base': base, 'from': frm})
    utility = []

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
        'easy_steps': steps(tidy(s.get('easyPlan'))),
        'chimps_steps': [x for x in steps(parse_chimps(s.get('chimpsPlan')).get('summary') or '') if not key_round(x)],
        'placement_steps': steps(tidy(s.get('placement'))),
        'xp_steps': steps(tidy(s.get('xpFarm'))),
        'placement': tidy(s.get('placement')), 'xpFarm': tidy(s.get('xpFarm')),
        'strong': [c.tm_by[x] for x in s.get('strongTowers', []) or [] if x in c.tm_by],
        'avoid': [c.tm_by[x] for x in s.get('avoidTowers', []) or [] if x in c.tm_by],
        'heroes': heroes, 'proven_towers': proven_towers, 'proven_heroes': proven_heroes, 'other_ents': other,
        'lanes': lanes, 'lane_min': min(lane_vals) if lane_vals else None,
        'lane_max': max(lane_vals) if lane_vals else None, 'list_state': list_state,
        'two_mp_count': tm.get('count'), 'removables': [dict(r, prices=c.prices([r.get('cost')])) for r in m.get('removables') or []],
    }


# ---------------------------------------------------------------- 0.5: pop-model answers, picker, rounds, cards
ANSWER_PROPS = ['camo', 'lead', 'purple', 'black', 'white', 'frozen', 'ddt']


def key_answers(c, tm):
    """'Camo: 0-1-0 Night Vision Goggles' style chips from the pop model."""
    tid = tm['id']
    if not c.pop.has(tid) or c.pop.non_attacker(tid) or tm['non_attacker']:
        return []
    out = []
    for prop in ANSWER_PROPS:
        cross = c.pop.cheapest(tid, [prop], c.cross_medium)
        if cross is None:
            out.append({'prop': prop, 'label': PROP_LABEL[prop], 'state': 'never', 'code': None, 'name': None})
        elif sum(cross) == 0:
            out.append({'prop': prop, 'label': PROP_LABEL[prop], 'state': 'base', 'code': '0-0-0', 'name': 'from the start'})
        else:
            out.append({'prop': prop, 'label': PROP_LABEL[prop], 'state': 'up', 'code': code_of(cross),
                        'name': c.cross_name(tid, cross)})
    cross = c.pop.cheapest(tid, ['moab'], c.cross_medium, mode='bonus')
    if cross is not None:
        b = c.pop.bonuses(tid, cross, 'moab')
        out.append({'prop': 'moab', 'label': 'MOAB bonus', 'state': 'up', 'code': code_of(cross),
                    'name': (b[0].get('note') if b else None) or c.cross_name(tid, cross)})
    return out


# Built-in synergy hints, used on tower pages until (or unless) S's synergy.js answers.
# when: a missing pop property ("no-camo"), "attacker", "primary" (class) or "always".
FALLBACK_SYNERGY = [
    ('no-camo', 'village', [0, 2, 0], 'Radar Scanner: every tower in range sees camo'),
    ('no-lead', 'alchemist', [2, 0, 0], 'Acidic Mixture Dip: towers it dips pop Lead'),
    ('no-purple', 'village', [0, 3, 0], 'Monkey Intelligence Bureau: towers in range pop every Bloon type'),
    ('no-black', 'village', [0, 3, 0], 'Monkey Intelligence Bureau: towers in range pop every Bloon type'),
    ('no-ddt', 'village', [0, 3, 0], 'Radar + MIB in one Village: towers in range can hit DDTs'),
    ('attacker', 'alchemist', [3, 0, 0], 'Berserker Brew: more damage, pierce, range and speed'),
    ('attacker', 'village', [2, 0, 0], 'Jungle Drums: everything in range attacks faster'),
    ('primary', 'village', [3, 0, 0], 'Primary Training: Primary towers get more pierce and range'),
    ('support', 'dart', [0, 2, 4], 'Put strong attackers in its range: buffs only help towers nearby'),
]


def picker_data(c, tm):
    t = tm['t']
    tid = t['id']
    fallback = []
    for when, other, cross, why in FALLBACK_SYNERGY:
        if other == tid or other not in c.tower_by:
            continue
        o = c.tower_by[other]
        fallback.append({'when': when, 'tower': other, 'name': o['name'], 'code': code_of(cross),
                         'up': c.cross_name(other, cross), 'why': why, 'url': f'monkeys/{other}/',
                         'prices': c.cross_prices(other, cross)})
    return {
        'id': tid, 'name': t['name'], 'cls': t.get('class'), 'base': t.get('baseCost'), 'mult': c.mult,
        'paths': [[{'n': u['name'], 'c': u.get('cost')} for u in p] for p in t['paths']],
        'pathNames': PATH_NAMES, 'pop': c.pop.js(tid), 'popKnown': c.pop.has(tid),
        'nonAttacker': tm['non_attacker'] or (c.pop.has(tid) and c.pop.non_attacker(tid)),
        'labels': PROP_LABEL, 'fallback': fallback, 'synPrices': c.syn_prices,
    }


def hard_plans(c):
    """Find the Hard/Impoppable sentences many maps share and keep each map's own notes and key rounds."""
    freq = {}
    per = {}
    for mm in c.map_models:
        ss = sentences(mm['hard'] or '')
        per[mm['id']] = ss
        for s in set(ss):
            freq[s] = freq.get(s, 0) + 1
    n_maps = max(1, len(c.map_models))
    shared = {s for s, k in freq.items() if k >= max(5, n_maps // 9) and not key_round(s)}
    c.hard_general = sorted(shared, key=lambda s: (-freq[s], s))
    c.hard_general_count = max([freq[s] for s in shared] or [0])
    for mm in c.map_models:
        own, keys = [], []
        for s in per[mm['id']]:
            kr = key_round(s)
            if kr:
                keys.append(kr)
            elif s not in shared:
                own.append(s)
        for s in sentences(mm['chimps'].get('summary') or ''):
            kr = key_round(s)
            if kr and kr[0] not in {k for k, _ in keys}:
                keys.append(kr)
        mm['hard_own'] = [x for s in own for x in steps(s)]
        mm['hard_uses_general'] = any(s in shared for s in per[mm['id']])
        mm['key_rounds'] = sorted(keys)


def round_threats(r):
    th = list(r.get('threats') or [])
    comp = r.get('composition') or ''
    for word, key in (('Zebra', 'zebra'), ('Black', 'black'), ('White', 'white')):
        if re.search(r'\b' + word + r'\b', comp) and key not in th:
            th.append(key)
    return th


ACRONYMS = {'MOAB', 'MOABS', 'ZOMG', 'ZOMGS', 'CHIMPS', 'DDTS', 'BFBS', 'RBE'}


def soften_caps(s):
    """'CERAMIC RUSH: ...' -> 'Ceramic rush: ...' (shouting in the data), keeping MOAB/ZOMG/CHIMPS."""
    def fix(m):
        words = m.group(0).split(' ')
        if all(w in ACRONYMS for w in words):
            return m.group(0)
        out = ' '.join(w if w in ACRONYMS else w.lower() for w in words)
        return out[0].upper() + out[1:]
    return re.sub(r'\b[A-Z]{4,}(?: [A-Z]{2,})*\b', fix, s)


def round_models(c):
    rows = [r for r in c.rounds['standard'] if 1 <= (r.get('round') or 0) <= 100]
    first = {}
    for r in rows:
        for k in round_threats(r):
            first.setdefault(k, r['round'])
    c.threat_first = first
    out = []
    for r in rows:
        n = r['round']
        th = round_threats(r)
        need = []
        for k, f in sorted(first.items(), key=lambda kv: kv[1]):
            if f <= n and k in THREAT_CARD and THREAT_CARD[k] not in [x['card'] for x in need]:
                need.append({'key': k, 'label': THREAT_LABEL.get(k, k.capitalize()), 'first': f, 'card': THREAT_CARD[k]})
        nxt = [d for d in DANGER_ROUNDS if d > n][:3]
        coming = [{'key': k, 'label': THREAT_LABEL.get(k, k.capitalize()), 'first': f, 'card': THREAT_CARD.get(k)}
                  for k, f in sorted(first.items(), key=lambda kv: kv[1]) if n < f <= n + 15]
        notes = steps(soften_caps(r.get('notes') or ''), long=90)
        out.append({'n': n, 'r': r, 'threats': th, 'danger': n in DANGER_ROUNDS, 'level': r.get('danger') or 0,
                    'need': need, 'next_danger': nxt, 'coming': coming, 'notes': notes,
                    'url': f'rounds/{n}/'})
    return out


def quick_cards(c, root_unused=None):
    """content/quick/*.md -> cards with fixes generated from the pop model and towers.json (C5)."""
    qdir = os.path.join(CONTENT, 'quick')
    cards = []
    if not os.path.isdir(qdir):
        return cards
    for fn in sorted(os.listdir(qdir)):
        if not fn.endswith('.md') or fn.startswith(('_', '.')):
            continue
        with open(os.path.join(qdir, fn), encoding='utf-8') as f:
            fm, body = parse_frontmatter(f.read())
        slug = slugify(str(fm.get('slug') or fn[:-3]))
        props = fm.get('props') or [slug]
        if isinstance(props, str):
            props = [p.strip() for p in props.strip('[]').split(',') if p.strip()]
        mode = str(fm.get('mode') or 'can')
        rows = []
        for tm in c.tower_models:
            tid = tm['id']
            if not c.pop.has(tid) or c.pop.non_attacker(tid) or tm['non_attacker']:
                continue
            cross = c.pop.cheapest(tid, props, c.cross_medium, mode=mode)
            if cross is None:
                continue
            why = None
            if mode == 'bonus':
                b = c.pop.bonuses(tid, cross, props[0])
                why = b[0].get('note') if b else None
            elif len(props) == 1:
                why = c.pop.note(tid, props[0]) if sum(cross) else None
            rows.append({'tm': tm, 'cross': cross, 'code': code_of(cross), 'up': c.cross_name(tid, cross),
                         'prices': c.cross_prices(tid, cross), 'why': why, 'kind': 'tower',
                         'url': tm['url'] + (f'#u-{max(range(3), key=lambda i: cross[i]) + 1}-{max(cross)}' if sum(cross) else '')})
        rows.sort(key=lambda x: (x['prices']['medium'], x['tm']['t']['name']))
        if mode == 'bonus' and len(rows) < 3:
            # fewer than 3 bonus answers: fill up with the cheapest towers that simply do damage
            have = {x['tm']['id'] for x in rows}
            extra = []
            for tm in c.tower_models:
                if tm['id'] in have or not c.pop.has(tm['id']) or c.pop.non_attacker(tm['id']) or tm['non_attacker']:
                    continue
                cross = c.pop.cheapest(tm['id'], props, c.cross_medium)
                if cross is not None:
                    extra.append({'tm': tm, 'cross': cross, 'code': code_of(cross), 'up': c.cross_name(tm['id'], cross),
                                  'prices': c.cross_prices(tm['id'], cross), 'why': 'any damage works', 'kind': 'tower',
                                  'url': tm['url']})
            extra.sort(key=lambda x: x['prices']['medium'])
            rows += extra[:3 - len(rows)]
        # support fixes: towers/heroes that give the property to others
        need = set()
        for p in props:
            need |= set({'zebra': ['black', 'white'], 'ddt': ['ddt']}.get(p, [p]))
        groups = {}
        for s in c.pop.support:
            key = (s.get('source'), json.dumps(s.get('req'), sort_keys=True))
            groups.setdefault(key, {'s': s, 'grants': set(), 'notes': []})
            groups[key]['grants'].add(s.get('grants'))
            if s.get('note'):
                groups[key]['notes'].append(s['note'])
        support = []
        for (src, _), g in groups.items():
            if not need <= g['grants']:
                continue
            req = g['s'].get('req') or {}
            if src and (src.startswith('hero:') or 'level' in req or src in c.hm_by):
                hid = src.split(':', 1)[1] if src.startswith('hero:') else src
                hm = c.hm_by.get(hid)
                if not hm:
                    continue
                support.append({'kind': 'hero', 'name': hm['h']['name'], 'url': hm['url'], 'code': None,
                                'up': f"level {req.get('level')}", 'prices': hm['prices'],
                                'why': g['notes'][0] if g['notes'] else None})
            elif src in c.tm_by and 'path' in req:
                cross = [0, 0, 0]
                cross[int(req['path'])] = int(req['tier'])
                support.append({'kind': 'support', 'tm': c.tm_by[src], 'name': c.tm_by[src]['t']['name'],
                                'url': c.tm_by[src]['url'] + f"#u-{int(req['path']) + 1}-{int(req['tier'])}",
                                'code': code_of(cross), 'up': c.cross_name(src, cross),
                                'prices': c.cross_prices(src, cross), 'why': g['notes'][0] if g['notes'] else None})
        support.sort(key=lambda x: (x['kind'] == 'hero', x['prices']['medium']))
        heroes = []
        if need <= {'camo', 'lead'}:
            for hm in c.hero_models:
                levels = [((c.pop.heroes.get(hm['id']) or {}).get(p) or {}).get('level') for p in need]
                if levels and all(lv is not None for lv in levels):
                    heroes.append({'hm': hm, 'level': max(levels)})
            heroes.sort(key=lambda x: (x['level'], x['hm']['h'].get('cost') or 0))
        top = rows[:5]
        first_support = support[:1]
        more = rows[5:]
        threat = str(fm.get('threat') or props[0])
        first_round = c.threat_first.get(threat)
        bullets = [re.sub(r'^\s*[-*]\s+', '', ln).strip() for ln in body.splitlines() if re.match(r'^\s*[-*]\s+', ln)]
        cards.append({
            'slug': slug, 'title': str(fm.get('title') or slug.title()), 'tile': str(fm.get('tile') or slug.title()),
            'order': float(fm.get('order') or 99), 'props': props, 'mode': mode,
            'rule': inline_md(fm.get('rule')), 'rule_plain': re.sub(r'\*\*', '', str(fm.get('rule') or '')),
            'sub': inline_md(fm.get('sub')), 'top': top, 'support_top': first_support, 'more': more,
            'support_more': support[1:], 'heroes': heroes, 'n_fixes': len(top) + len(first_support),
            'first': first_round, 'bullets': bullets, 'related': fm.get('related') or [],
            'cheapest': top[0]['prices'] if top else None, 'url': f'quick/{slug}/',
        })
    cards.sort(key=lambda x: (x['order'], x['title']))
    return cards


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
        group = 'Reference' if group.lower().startswith('ref') else ('More' if group.lower() == 'more' else 'Guides')
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
    # glossary-style tables: give each "**Term**" row an id so search can point at it
    def row_id(mo):
        term = htmlmod.unescape(re.sub(r'<[^>]+>', '', mo.group(2)))
        return f'<tr id="g-{slugify(term)}">{mo.group(1)}<strong>{mo.group(2)}</strong>'
    body = re.sub(r'<tr>(\s*<td>)<strong>(.*?)</strong>', row_id, body)
    return body, toc


# ---------------------------------------------------------------- output
class Writer:
    def __init__(self):
        self.files = []

    def write(self, rel, content, binary=False):
        if not safe_rel(rel):
            raise RuntimeError(f'refusing to write {rel}')
        full = os.path.join(ROOT, rel)
        os.makedirs(os.path.dirname(full) or ROOT, exist_ok=True)
        with open(full, 'wb' if binary else 'w', **({} if binary else {'encoding': 'utf-8'})) as f:
            f.write(content)
        self.files.append(rel.replace(os.sep, '/'))


def safe_rel(rel):
    rel = rel.replace('\\', '/').lstrip('/')
    if not rel or '..' in rel.split('/'):
        return False
    if TOOL_OUTPUT.match(rel) or rel == 'tools' or re.match(r'^tools/(?!fixtures$)[a-z0-9-]+$', rel):
        return True
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


def tool_pages():
    """src/pages/<slug>.body.html from the tools stream (C3); slug -> fragment text."""
    out = {}
    if os.path.isdir(PAGES_SRC):
        for fn in sorted(os.listdir(PAGES_SRC)):
            m = re.match(r'^([a-z0-9-]+)\.body\.html$', fn)
            if m and m.group(1) != 'fixtures':
                with open(os.path.join(PAGES_SRC, fn), encoding='utf-8') as f:
                    out[m.group(1)] = f.read()
    return out


def main():
    t0 = time.time()
    # the tool pages' data bundle (tools-data.js, synergy-rules.js) must be rebuilt from data/ before assets are copied
    sys.path.insert(0, SRC)
    import build_tools  # src/build_tools.py
    build_tools.build()
    c = build_model()
    site = c.site
    base = site.get('base', '/')
    removed = clean_previous()
    W = Writer()

    guides = load_guides()
    rounds_md = next((g for g in guides if g['slug'] == 'rounds'), None)
    guides = [g for g in guides if g['slug'] != 'rounds']
    cards = quick_cards(c)
    c.cards = cards
    card_by = {q['slug']: q for q in cards}
    tool_src = tool_pages()
    tool_assets = os.path.join(PAGES_SRC, 'assets')
    has_synergy = os.path.isfile(os.path.join(tool_assets, 'synergy.js'))
    tools = [{'slug': k, 'name': n, 'desc': d, 'url': f'tools/{k}/', 'ready': k in tool_src,
              'icon': TOOL_ICON.get(k, 'plan'), 'door': TOOL_DOOR.get(k, 'door-grass')}
             for k, n, d in TOOLS]
    tools += [{'slug': k, 'name': k.replace('-', ' ').capitalize(), 'desc': '', 'url': f'tools/{k}/', 'ready': True,
               'icon': 'plan', 'door': 'door-grass'}
              for k in tool_src if k not in {t['slug'] for t in tools}]

    # every page path, for link checks inside guides
    planned = {'', 'planner/', 'monkeys/', 'monkeys/heroes/', 'monkeys/paragons/', 'heroes/', 'maps/', 'guides/',
               'guides/rounds/', 'guides/hard-plan/', 'rounds/', 'records/', 'a-z/', 'patch/', 'about/', 'tools/',
               '404.html', 'search-index.json'}
    planned |= {tm['url'] for tm in c.tower_models} | {hm['url'] for hm in c.hero_models}
    planned |= {mm['url'] for mm in c.map_models} | {g['url'] for g in guides}
    planned |= {q['url'] for q in cards} | {r['url'] for r in c.round_models} | {t['url'] for t in tools}

    env = jinja2.Environment(loader=jinja2.FileSystemLoader(TEMPLATES),
                             autoescape=jinja2.select_autoescape(['html']),
                             trim_blocks=True, lstrip_blocks=True, undefined=jinja2.ChainableUndefined)
    env.filters['money'] = money
    env.filters['num'] = num
    env.filters['tidy'] = tidy
    env.filters['rich'] = rich
    env.filters['plain'] = plain
    env.filters['tojson_safe'] = lambda v: Markup(json.dumps(v, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/'))
    env.globals.update(site=site, meta=c.meta, DIFFS=DIFFS, TIERS=TIERS, TIER_XP=TIER_XP, CLASSES=CLASSES,
                       THREAT_LABEL=THREAT_LABEL, mult=c.mult, ctx=c, year=datetime.date.today().year,
                       TOOLS=tools, MORE_LINKS=MORE_LINKS, DANGER_ROUNDS=DANGER_ROUNDS, THREAT_CARD=THREAT_CARD,
                       card_by=card_by, step_label=step_label, has_synergy=has_synergy)

    def lx(text, root, link=True):
        return c.lx(tidy(text or ''), root, link_names=link)
    env.globals['lx'] = lx
    env.globals['lxb'] = lambda text, root: Markup(re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', str(lx(text, root))))

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
    fixture_note = []
    pop_about = about(c, ['wiki', 'fandom', 'nk'], [
        'Fixes are worked out from the site\'s pop model: the cheapest crosspath of each tower that can damage the Bloon, '
        'priced on the difficulty you pick with the $5 rounding the game uses.'] + fixture_note)

    def page(path, template, title, description, section=None, crumbs=None, **kw):
        if 'about' not in kw:
            kw['about'] = None if template in ('404.html', 'redirect.html', 'guide.html', 'about.html') else generic_about
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
    name = site['name']
    counts = {'towers': len(c.towers), 'heroes': len(c.heroes), 'maps': len(c.maps),
              'paragons': sum(1 for t in c.towers if t.get('paragon')), 'guides': len(guides)}
    starter = next((g for g in guides if g['slug'] == 'getting-started'), None)

    # ---- home = quick answers
    page('', 'home.html', f"{name}: BTD6 answers in seconds",
         f"Unofficial Bloons TD 6 help for v{v}: what pops camo, lead, purple, MOABs and DDTs, the cheapest fix on your "
         f"difficulty, every round and every tower, map and hero.",
         section='home', counts=counts, cards=cards, starter=starter, about=pop_about)

    # ---- quick cards
    for q in cards:
        page(q['url'], 'quick.html', f"{q['title']}: what pops it · {name}",
             f"{q['rule_plain']} The cheapest fixes on every difficulty (BTD6 v{v}).",
             section='home', crumbs=[('Quick answers', ''), (q['tile'], None)], q=q,
             rel_cards=[card_by[r] for r in q['related'] if r in card_by], about=pop_about)

    # ---- tools (C3): S's fragments wrapped in the site chrome. The old planner is retired.
    page('tools/', 'tools.html', f"Tools · {name}", 'BTD6 tools: strategy advisor, round simulator, goal tracker, XP calculator and defence check.',
         section='tools', crumbs=[('Tools', None)], about=None)
    for t in tools:
        body = tool_src.get(t['slug'])
        crumbs = [('Tools', 'tools/'), (t['name'], None)]
        sec = 'profile' if t['slug'] == 'profile' else 'tools'  # My profile has its own tab in the header
        if body is not None:
            depth_root = '../../'
            body = body.replace('{{BASE}}static/tools/', depth_root + 'assets/tools/').replace('{{BASE}}', depth_root)
            body = body.replace('{{ROOT}}', depth_root)
            page(t['url'], 'tool.html', f"{t['name']} · {name}", t['desc'] or f"{t['name']}: a BTD6 tool.",
                 section=sec, crumbs=crumbs, tool=t, body=Markup(body), legacy=False,
                 about=None)  # the fragment carries its own "About this data" (C3)
        else:
            page(t['url'], 'tool.html', f"{t['name']} · {name}", t['desc'], section='tools', crumbs=crumbs,
                 tool=t, body=None, legacy=False, starter=starter)
    page('planner/', 'redirect.html', f"Simulator · {name}", 'The planner is now the Simulator.',
         target='tools/simulator/', keep_hash=True, label='Go to the Simulator')

    # ---- monkeys
    by_class = [(cl, [tm for tm in c.tower_models if tm['t'].get('class') == cl]) for cl in CLASSES]
    page('monkeys/', 'monkeys.html', f"Monkeys · {name}",
         f"All {counts['towers']} BTD6 towers by class, with base prices, top crosspaths and paragons (v{v}).",
         section='monkeys', crumbs=[('Monkeys', None)], tab='towers', by_class=by_class)
    page('monkeys/heroes/', 'heroes.html', f"Heroes · {name}",
         f"All {counts['heroes']} BTD6 heroes: price on every difficulty, unlock level, camo and lead answers (v{v}).",
         section='monkeys', crumbs=[('Monkeys', 'monkeys/'), ('Heroes', None)], tab='heroes')
    page('monkeys/paragons/', 'paragons.html', f"Paragons and XP farms · {name}",
         f"Every BTD6 paragon with its price, XP from zero and the best Deflation farm to get there (v{v}).",
         section='monkeys', crumbs=[('Monkeys', 'monkeys/'), ('Paragons', None)], tab='paragons',
         about=about(c, ['wiki', 'fandom', 'community'], ['Farm XP and runs are worked out with the Deflation XP formula '
                     '(Expert map x1.3, Monkey Education on), split by each tower\'s share of the money spent. They are not play-tested.']))
    page('heroes/', 'redirect.html', f"Heroes · {name}", 'Moved to the Monkeys page, Heroes tab.',
         section='monkeys', target='monkeys/heroes/', label='Go to the Heroes list')
    for tm in c.tower_models:
        t = tm['t']
        ab = about_tower(c, tm)
        ab['notes'] = ab['notes'] + fixture_note
        page(tm['url'], 'tower.html', f"{t['name']} · {name}",
             f"{t['name']} (BTD6 v{v}): what it pops on each crosspath, prices on every difficulty, best crosspaths, "
             f"good partners and its paragon.",
             section='monkeys', crumbs=[('Monkeys', 'monkeys/'), (t.get('class'), 'monkeys/#' + slugify(t.get('class'))), (t['name'], None)],
             tm=tm, about=ab, tools_ready={x['slug']: x['ready'] for x in tools})
    for hm in c.hero_models:
        h = hm['h']
        hl = c.hero_levels.get(hm['id'])
        page(hm['url'], 'hero.html', f"{h['name']} · {name}",
             f"{h['name']} (BTD6 v{v}): price, when it sees camo and pops Lead, abilities by level and best maps.",
             section='monkeys', crumbs=[('Monkeys', 'monkeys/'), ('Heroes', 'monkeys/heroes/'), (h['name'], None)], hm=hm,
             hl=hl, about=about_hero(c, hm))

    # ---- maps
    page('maps/', 'maps.html', f"Maps · {name}",
         f"All {counts['maps']} BTD6 maps: filter by difficulty, water and line of sight.",
         section='maps', crumbs=[('Maps', None)])
    for mm in c.map_models:
        m = mm['m']
        page(mm['url'], 'map.html', f"{m['name']} · {name}",
             f"How to beat {m['name']} ({m['difficulty']}) in BTD6 v{v}: steps for Easy, Hard and CHIMPS, key rounds and the best monkeys.",
             section='maps', crumbs=[('Maps', 'maps/'), (m['difficulty'], 'maps/#' + m['difficulty'].lower()), (m['name'], None)], mm=mm,
             about=about_map(c, mm))

    # ---- rounds
    rounds_intro = None
    if rounds_md:
        rounds_md['url'] = 'rounds/'
        rounds_intro, _ = render_markdown(rounds_md, planned, base, '../')
    rounds_entry = {'slug': 'rounds', 'title': 'Rounds', 'group': 'Reference', 'order': rounds_md['order'] if rounds_md else 0,
                    'summary': 'Every round 1–140, standard and ABR, with a page for each of rounds 1–100.',
                    'url': 'rounds/', 'updated': (rounds_md or {}).get('updated') or c.meta['researched'] or '',
                    'gameVersion': (rounds_md or {}).get('gameVersion') or v, 'related': (rounds_md or {}).get('related') or []}
    hard_entry = {'slug': 'hard-plan', 'title': 'General Hard and Impoppable plan', 'group': 'Guides', 'order': 50,
                  'summary': 'What changes on Hard and Impoppable compared with a CHIMPS build, for any map.',
                  'url': 'guides/hard-plan/', 'updated': c.meta['researched'] or '', 'gameVersion': v, 'related': ['chimps', 'economy'],
                  'toc': []}
    all_guides = guides + [rounds_entry, hard_entry]
    groups = [(gname, sorted([g for g in all_guides if g['group'] == gname], key=lambda g: (g['order'], g['title'])))
              for gname in ('Guides', 'Reference')]

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
            elif key == 'rounds':
                out.append(('Rounds', 'rounds/'))
            elif key in {g['slug'] for g in all_guides}:
                g = next(g for g in all_guides if g['slug'] == key)
                out.append((g['title'], g['url']))
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

    page('rounds/', 'rounds.html', f"Rounds 1–140 · {name}",
         'Every BTD6 round 1–140 for standard and Alternate Bloons Rounds: Bloons, RBE, cash, XP and danger rounds.',
         section='guides', crumbs=[('Rounds', None)],
         intro=Markup(rounds_intro) if rounds_intro else None, g=rounds_entry,
         related=related_links(rounds_entry['related'], '../'),
         about=about(c, ['wiki', 'cq', 'nk'], ['Cash is pop cash plus the end-of-round bonus (100 + the round number), with no '
                     'income towers, Monkey Knowledge or Double Cash.', 'Freeplay pop-cash rates for rounds 101-140 (5% and 4%) '
                     'come from the game\'s own income table.']))
    round_about = about(c, ['wiki', 'cq'], ['"What you need by now" lists every Bloon property that has appeared in rounds '
                                           '1 to this one, so a defence that handles them all is ready for this round.'])
    for rm in c.round_models:
        n = rm['n']
        page(rm['url'], 'round.html', f"Round {n} · {name}",
             f"BTD6 round {n}: {rm['r'].get('composition') or ''}. What spawns, the threats and what you need by now.",
             section='guides', crumbs=[('Rounds', 'rounds/'), (f'Round {n}', None)], rm=rm,
             prev=c.rm_by.get(n - 1), next=c.rm_by.get(n + 1), about=round_about)
    page('guides/rounds/', 'redirect.html', f"Rounds · {name}", 'The rounds table moved to /rounds/.',
         target='rounds/', keep_hash=True, label='Go to the rounds table')

    # ---- guides
    for g in guides:
        g['html'], g['toc'] = render_markdown(g, planned, base, '../../')
    page('guides/', 'guides.html', f"Guides · {name}",
         'BTD6 guides and reference: getting started, CHIMPS, XP, rounds, Bloons, modes, Monkey Knowledge and a glossary.',
         section='guides', crumbs=[('Guides', None)], groups=groups, starter=starter)
    for g in guides:
        crumbs = [('Guides', 'guides/')] + ([('Reference', 'guides/#reference')] if g['group'] == 'Reference' else []) + [(g['title'], None)]
        if g['group'] == 'More':
            crumbs = [(g['title'], None)]
        page(g['url'], 'guide.html', f"{g['title']} · {name}",
             g['summary'] or f"{g['title']}: a BTD6 v{v} guide.", section=None if g['group'] == 'More' else 'guides',
             crumbs=crumbs, g=g, related=related_links(g['related'], '../../'))
    hard_entry['html'] = Markup(env.get_template('_hardplan.html').render(lines=c.hard_general, n=c.hard_general_count,
                                                                         root='../../', lx=lx))
    page('guides/hard-plan/', 'guide.html', f"{hard_entry['title']} · {name}", hard_entry['summary'], section='guides',
         crumbs=[('Guides', 'guides/'), (hard_entry['title'], None)], g=hard_entry,
         related=related_links(hard_entry['related'], '../../'))

    # ---- more: records, patch, about
    page('records/', 'records.html', f"Records · {name}",
         'BTD6 Index records for all 90 maps: solo-CHIMPS (2MP) counts, least-cost CHIMPS, lane lengths, entrances and exits.',
         section=None, crumbs=[('Records', None)],
         about=about(c, ['index'], ['Map metadata and records from the BTD6 Index, v57.4 data.']))
    page('patch/', 'patch.html', f"Patch notes {v} · {name}",
         f"Every tower change from v57.0 to v{v}, linked to the upgrade it touches.", section=None,
         crumbs=[('Patch notes', None)], about=about(c, ['nk', 'wiki']))
    page('about/', 'about.html', f"About · {name}",
         f"{name} is an unofficial BTD6 fan project by {site.get('author')} for {site.get('brand', 'Solou')}: credits and how to report errors.",
         section=None, crumbs=[('About', None)])

    # ---- search index + A-Z
    entries = []
    for q in cards:
        entries.append({'t': q['title'], 'k': 'Quick', 'u': q['url'], 's': clip_words(q['rule_plain'], 90)})
    for t in tools:
        entries.append({'t': t['name'], 'k': 'Tool', 'u': t['url'], 's': clip_words(t['desc'], 90)})
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
        entries.append({'t': g['title'], 'k': 'Guide' if g['group'] != 'Reference' else 'Reference', 'u': g['url'],
                        's': clip_words(g['summary'], 80)})
    for r in c.rounds['standard']:
        n = r['round']
        comp = clip_words(r.get('composition') or '', 70)
        entries.append({'t': f"Round {n}", 'k': 'Round', 'u': f"rounds/{n}/" if n <= 100 else f"rounds/#r{n}", 's': comp, 'x': f"r{n}"})
    # glossary terms, bosses and modes
    gl = next((g for g in guides if g['slug'] == 'glossary'), None)
    if gl:
        for gid, term in re.findall(r'<tr id="(g-[a-z0-9-]+)">\s*<td><strong>(.*?)</strong>', gl['html']):
            term = htmlmod.unescape(re.sub(r'<[^>]+>', '', term))
            entries.append({'t': term, 'k': 'Glossary', 'u': f'guides/glossary/#{gid}', 's': 'Glossary',
                            'a': [norm_name(x) for x in term.split('/') if x.strip()]})
    be = next((g for g in guides if g['slug'] == 'boss-events'), None)
    if be:
        for bid, bname in re.findall(r'<h3 id="([^"]+)">(.*?)</h3>', be['html']):
            bname = htmlmod.unescape(re.sub(r'<[^>]+>', '', bname))
            short = bname.split(',')[0].strip()
            entries.append({'t': short, 'k': 'Boss', 'u': f'guides/boss-events/#{bid}', 's': bname, 'a': [norm_name(short)]})
    for md in c.modes:
        if md.get('name'):
            entries.append({'t': md['name'], 'k': 'Mode', 'u': 'guides/modes/', 's': 'Game mode',
                            'a': [norm_name(md['name']), norm_name(md.get('id', '').replace('-', ' '))]})
    entries.append({'t': 'Patch notes', 'k': 'Page', 'u': 'patch/', 's': f'Changes up to v{v}'})
    entries.append({'t': 'About', 'k': 'Page', 'u': 'about/', 's': f"Who makes {name}, credits, report an error"})
    # synonyms (C4): attach player words to the page they mean
    syn = load('search-synonyms.json', {}) or {}
    by_u = {}
    for e in entries:
        by_u.setdefault(e['u'], e)
    for s_ in syn.get('entries', []):
        tgt = s_.get('target', '')
        path = tgt.split('#')[0]
        if path not in planned:
            warn(f"search synonym target '{tgt}' has no page; skipped")
            continue
        e = by_u.get(tgt)
        if not e:
            title = {'rounds/': 'Rounds'}.get(tgt) or tgt.strip('/').split('/')[-1].replace('-', ' ').capitalize()
            e = {'t': title, 'k': 'Page', 'u': tgt, 's': ''}
            entries.append(e)
            by_u[tgt] = e
        e.setdefault('a', [])
        e['a'] += [norm_name(x) for x in s_.get('terms', []) if norm_name(x)]
    for e in entries:
        if 'a' in e:
            e['a'] = sorted(set(a for a in e['a'] if a))
    W.write('search-index.json', json.dumps({'version': site['version'], 'entries': entries}, ensure_ascii=False, separators=(',', ':')))

    az = {}
    for e in entries:
        if e['k'] in ('Round', 'Glossary', 'Page'):
            continue
        letter = norm_name(e['t'])[:1].upper()
        letter = letter if letter.isalpha() else '#'
        az.setdefault(letter, []).append(e)
    az_groups = [(k, sorted(az[k], key=lambda e: (norm_name(e['t']), e['k']))) for k in sorted(az, key=lambda k: (k == '#', k))]
    page('a-z/', 'az.html', f"A–Z index · {name}",
         'Every quick answer, tower, upgrade, paragon, hero, map, boss and guide on the site, A to Z.',
         section=None, crumbs=[('A–Z', None)], az_groups=az_groups)

    page('404.html', '404.html', f"Page not found · {name}", 'This page does not exist.', section=None)

    # ---- static assets (+ the tools stream's assets under assets/tools/)
    for fn in sorted(os.listdir(STATIC)):
        full = os.path.join(STATIC, fn)
        if os.path.isfile(full) and not fn.startswith('.'):
            with open(full, 'rb') as f:
                W.write('assets/' + fn, f.read(), binary=True)
    if os.path.isdir(tool_assets):
        for fn in sorted(os.listdir(tool_assets)):
            full = os.path.join(tool_assets, fn)
            if os.path.isfile(full) and not fn.startswith('.'):
                with open(full, 'rb') as f:
                    W.write('assets/tools/' + fn, f.read(), binary=True)

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
    print('inputs: pop model data/pop-model.json, hero levels data/heroes-levels.json'
          + f", tool pages: {', '.join(sorted(tool_src)) or 'none'}"
          + (', synergy.js: yes' if has_synergy else ', synergy.js: no (built-in hints)'))


if __name__ == '__main__':
    main()
