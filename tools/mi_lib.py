"""Shared helpers for tools/build_site.py: the pop model (C1), crosspath maths and strategy-text formatting.

Nothing here reads files; build_site.py passes the data in.
"""
import html as htmlmod
import itertools
import re

from markupsafe import Markup

# ---------------------------------------------------------------- pop model (docs/CONTRACTS.md C1)
POP_PROPS = ['camo', 'lead', 'purple', 'black', 'white', 'zebra', 'frozen', 'moab', 'fortified', 'ddt']
PROP_LABEL = {'camo': 'Camo', 'lead': 'Lead', 'purple': 'Purple', 'black': 'Black', 'white': 'White', 'zebra': 'Zebra',
              'frozen': 'Frozen', 'moab': 'MOAB-class', 'fortified': 'Fortified', 'ddt': 'DDT', 'bad': 'BAD'}
# C1: a derived DDT is camo AND lead AND black on one crosspath. A DDT is also MOAB-class, so moab is checked too
# (docs/POP-MODEL.md: the data tests prove it never changes the answer for derived towers). Towers whose ddt has
# "derived": false carry their own any[], which is used as-is. Zebra has its own entry in the data.
DDT_PARTS = ['camo', 'lead', 'black', 'moab']


def valid_cross(c):
    return (c and len(c) == 3 and all(0 <= x <= 5 for x in c)
            and sum(1 for x in c if x > 0) <= 2 and sum(1 for x in c if x > 2) <= 1)


ALL_CROSS = [list(c) for c in itertools.product(range(6), repeat=3) if valid_cross(list(c))]


def code_of(c):
    return '-'.join(str(x) for x in c)


def _holds(req, tiers):
    if req == 'base':
        return True
    if req == 'never' or not isinstance(req, dict):
        return False
    try:
        if 'maxTier' in req:  # POP-MODEL.md extension: an upgrade that loses the ability is not bought
            return tiers[int(req['path'])] <= int(req['maxTier'])
        return tiers[int(req['path'])] >= int(req['tier'])
    except (KeyError, ValueError, IndexError, TypeError):
        return False


class PopModel:
    """Answers "can this crosspath damage X" and "does it get a bonus vs X" from pop-model.json."""

    def __init__(self, data):
        data = data or {}
        self.data = data
        self.towers = data.get('towers') or {}
        self.support = data.get('supportFixes') or []
        self.heroes = data.get('heroes') or {}
        self.immunities = data.get('bloonImmunities') or {}
        self.version = data.get('version')
        self.fixture = bool(data.get('_fixture'))

    def has(self, tid):
        return tid in self.towers

    def non_attacker(self, tid):
        e = self.towers.get(tid) or {}
        if e.get('nonAttacker'):
            return True
        return all(self.entry(tid, p) is None or self.entry(tid, p).get('any') == [['never']]
                   for p in ('camo', 'lead', 'purple', 'moab'))

    def entry(self, tid, prop):
        e = (self.towers.get(tid) or {}).get(prop)
        return e if isinstance(e, dict) else None

    def ddt_explicit(self, tid):
        e = self.entry(tid, 'ddt')
        return bool(e) and e.get('derived') is False

    def can(self, tid, prop, tiers):
        """Can this crosspath damage prop on its own. `conditional` entries never count (see hints())."""
        e = self.entry(tid, prop)
        if prop == 'ddt' and (not e or e.get('derived') is not False):
            return all(self.can(tid, p, tiers) for p in DDT_PARTS)
        if prop == 'zebra' and not e:
            return self.can(tid, 'black', tiers) and self.can(tid, 'white', tiers)
        if not e:
            return False
        return any(all(_holds(r, tiers) for r in alt) for alt in (e.get('any') or []) if isinstance(alt, list))

    def hints(self, tid, prop, tiers=None):
        """`conditional` notes (abilities, effects that need another tower): hints only, never coverage."""
        out = []
        for c in (self.entry(tid, prop) or {}).get('conditional') or []:
            if tiers is None or all(_holds(r, tiers) for r in c.get('req') or []):
                out.append(c)
        return out

    def bonuses(self, tid, tiers, vs=None):
        out = []
        for b in (self.towers.get(tid) or {}).get('bonuses') or []:
            if vs and b.get('vs') != vs:
                continue
            if _holds(b.get('from') or 'never', tiers):
                out.append(b)
        return out

    def note(self, tid, prop):
        e = self.entry(tid, prop)
        return (e or {}).get('note')

    def cheapest(self, tid, props, cost_fn, mode='can'):
        """Cheapest valid crosspath for which every prop holds. mode='bonus' needs a bonus vs props[0]."""
        best = None
        for c in ALL_CROSS:
            if mode == 'bonus':
                if not self.bonuses(tid, c, props[0]):
                    continue
            elif not all(self.can(tid, p, c) for p in props):
                continue
            cost = cost_fn(tid, c)
            key = (cost, sum(c))
            if best is None or key < best[0]:
                best = (key, c)
        return best[1] if best else None

    def js(self, tid):
        """The slice of the model the tower-page picker needs."""
        e = self.towers.get(tid) or {}
        return {k: e[k] for k in e if k in POP_PROPS or k in ('bonuses', 'bad', 'nonAttacker')}


# ---------------------------------------------------------------- text: sentences, bullets, links
SENT_SPLIT = re.compile(r'(?<=[.!?])\s+(?=[A-Z0-9"(])')


def sentences(text):
    """Split prose into sentences without breaking "M.O.A.R" or "x1.2"."""
    text = (text or '').strip()
    if not text:
        return []
    return [s.strip() for s in SENT_SPLIT.split(text) if s.strip()]


def steps(text, long=150):
    """Sentences, with long semicolon chains split into separate steps."""
    out = []
    for s in sentences(text):
        if len(s) > long and '; ' in s:
            parts = [p.strip() for p in s.split('; ') if p.strip()]
            out += [p[0].upper() + p[1:] if p[0].islower() else p for p in parts]
        else:
            out.append(s)
    return out


ROUND_LEAD = re.compile(r'^(?:Key rounds:\s*)?R(\d{1,3}):\s*(.+)$')


def key_round(sentence):
    m = ROUND_LEAD.match(sentence.strip())
    return (int(m.group(1)), m.group(2).strip()) if m else None


class Linker:
    """Turns plain strategy text into HTML: round chips, crosspath codes, bold cash, tower/hero/map links, badges."""

    def __init__(self, names, danger_rounds, badge_fn, max_round=100):
        # names: list of (text, site_path); longest first so "Glaive Lord" wins over "Glaive"
        seen = {}
        for n, u in names:
            if n and len(n) >= 3 and n not in seen:
                seen[n] = u
        self.names = seen
        alts = '|'.join(re.escape(n) for n in sorted(seen, key=len, reverse=True))
        self.re = re.compile(
            r'(?P<tok>\{(?:calc|unverified)\})'
            r'|(?P<rng>\bR(?P<r1>\d{1,3})\s?[-–]\s?R?(?P<r2>\d{1,3})\b)'
            r'|(?P<rnd>\bR(?P<rn>\d{1,3})\b)'
            r'|(?P<code>(?<![\w-])[0-5x]-[0-5x]-[0-5x](?![\w-]))'
            r'|(?P<money>\$\d[\d,]*(?:\.\d+)?k?)'
            + (r'|(?P<name>(?<![\w-])(?:' + alts + r')(?:s|es)?(?![\w-]))' if alts else ''))
        self.danger = set(danger_rounds)
        self.badge = badge_fn
        self.max_round = max_round

    def __call__(self, text, root, link_names=True, skip=()):
        text = text or ''
        out, pos, used = [], 0, set(skip)
        for m in self.re.finditer(text):
            out.append(htmlmod.escape(text[pos:m.start()], quote=False))
            pos = m.end()
            g = m.group(0)
            if m.group('tok'):
                out.append(' ' + self.badge(g.strip('{} ')))
            elif m.group('rng'):
                out.append(f'<span class="rspan">R{m.group("r1")}–{m.group("r2")}</span>')
            elif m.group('rnd'):
                n = int(m.group('rn'))
                if 1 <= n <= self.max_round:
                    cls = 'rchip danger' if n in self.danger else 'rchip'
                    out.append(f'<a class="{cls}" href="{root}rounds/{n}/">R{n}</a>')
                else:
                    out.append(f'<span class="rspan">R{n}</span>')
            elif m.group('code'):
                out.append(f'<code class="xcode">{g}</code>')
            elif m.group('money'):
                out.append(f'<b class="num">{htmlmod.escape(g)}</b>')
            else:
                base = g
                if base not in self.names:
                    base = re.sub(r'(?:es|s)$', '', g) if re.sub(r'(?:es|s)$', '', g) in self.names else g[:-1]
                url = self.names.get(base)
                if link_names and url and url not in used:
                    used.add(url)
                    out.append(f'<a class="tlink" href="{root}{url}">{htmlmod.escape(g, quote=False)}</a>')
                else:
                    out.append(htmlmod.escape(g, quote=False))
        out.append(htmlmod.escape(text[pos:], quote=False))
        return Markup(''.join(out))
