#!/usr/bin/env python3
"""Find research and process wording in player-facing text.

    python3 tools/leak_scan.py data [--list]   # every string the generators render from data/
    python3 tools/leak_scan.py html [--list]   # the built pages (run tools/build_site.py first)

"data" walks exactly what reaches a page: the tool pages' data bundle (src/build_tools.py collect(),
much of what tools/build_site.py renders) plus the hero, map and tower fields only the site
pages use. Keys the generators never render (notes_internal, _src, source) are skipped.

"html" reads every built .html page except /guides/ prose (the rounds table is kept). It scans visible text and text
attributes, plus the string values of the planner's embedded JSON (rendered in the browser).
Intended wording is skipped and counted on its own line: the "About this data" section, the
"unverified"/"calculated" badges and the footer credits. Guide prose (.prose) is not scanned.

Prints a count per pattern. Exit code is always 0; this is a report, not a gate.
"""
import json
import os
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'src'))

PATTERNS = [
    ('wiki', r'wiki'),
    ('bloonswiki', r'bloonswiki'),
    ('fandom', r'fandom'),
    ('Index v', r'\bIndex v\d'),
    ('ch0', r'\bch0\d'),
    ('chapter', r'\bchapter'),
    ('calc', r'\bcalc'),
    ('my calc', r'\bmy calc'),
    ('per the', r'\bper the\b'),
    ('source', r'source'),
    ('checked 20', r'\bchecked 20\d\d'),
    ('derived', r'\bderived'),
    ('alt:', r'\balt:'),
    ('unverified', r'\bunverified'),
    ('verify', r'\bverif'),
    ('(calc)', r'\(calc\)'),
    ('Sean', r'\bsean\b'),
    ('research', r'\bresearch'),
    ('dataset', r'\bdataset'),
    ('data notes', r'\bdata notes'),
    # extra: other research shorthand found during the copy pass
    ('See 0x Part', r'\bSee 0\d[a-z]? Part'),
    ('see Methods', r'\(see Methods\)'),
    ('Template X:', r'\bTemplate [A-Z]+:'),
    ('Proven/named', r'Proven/named'),
    ('first person', r'\bmy (?:cash|addition|calc)|\bI (?:swapped|couldn)'),
]
RX = [(name, re.compile(rx, re.I)) for name, rx in PATTERNS]
SKIP_KEYS = {'notes_internal', '_src', 'source', 'id', 'towerId', 'mapId'}


# badge tokens render as the intended "unverified"/"calculated" badges; real names that only look like hits
TOKENS = re.compile(r'\{(?:calc|unverified)\}')
ALLOW = re.compile(r'Banana Research Facility|from all sources', re.I)


def hits(s):
    s = ALLOW.sub('', TOKENS.sub('', s))
    return [name for name, rx in RX if rx.search(s)]


def walk(obj, path, out):
    if isinstance(obj, str):
        out.append((path, obj))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            walk(v, f'{path}[{i}]', out)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            if k in SKIP_KEYS:
                continue
            walk(v, f'{path}.{k}' if path else k, out)


def data_strings():
    import build_tools  # src/build_tools.py
    out = []
    walk(build_tools.collect(), '', out)
    # fields only the site pages render (not in the tool pages' data bundle)
    with open(os.path.join(ROOT, 'data', 'tower-guides.json'), encoding='utf-8') as f:
        for g in json.load(f):
            if g.get('lead'):
                out.append((f"guides.{g.get('towerId')}.lead", g['lead']))
    return out


class Text(HTMLParser):
    """Visible text and text attributes, minus scripts/styles and intended wording."""
    SKIP_CLASSES = ('about-data', 'badge', 'credits', 'prose')
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []  # (tag, skipping)
        self.chunks, self.skipped, self.json_blobs = [], [], []
        self._json = None

    def skipping(self):
        return any(s for _, s in self.stack)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = (a.get('class') or '').split()
        skip = tag in ('script', 'style') or any(c in self.SKIP_CLASSES for c in cls)
        if tag == 'script' and a.get('type') == 'application/json':
            self._json = []
        if tag not in self.VOID:
            self.stack.append((tag, skip))
        if not (skip or self.skipping()):
            for k in ('title', 'alt', 'aria-label', 'placeholder'):
                if a.get(k):
                    self.chunks.append(a[k])
            if tag == 'meta' and a.get('name') == 'description':
                self.chunks.append(a.get('content') or '')

    def handle_endtag(self, tag):
        if tag == 'script' and self._json is not None:
            self.json_blobs.append(''.join(self._json))
            self._json = None
        if tag in self.VOID or all(t != tag for t, _ in self.stack):
            return
        while self.stack:
            t, _ = self.stack.pop()
            if t == tag:
                break

    def handle_data(self, data):
        if self._json is not None:
            self._json.append(data)
            return
        (self.skipped if self.skipping() else self.chunks).append(data)


def html_strings():
    with open(os.path.join(ROOT, '.build-manifest.json'), encoding='utf-8') as f:
        files = json.load(f)['files']
    out, intended = [], []
    for rel in files:
        if not rel.endswith('.html') or rel.startswith('guides/') and rel not in ('guides/index.html', 'guides/rounds/index.html'):
            continue
        p = Text()
        with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
            p.feed(f.read())
        text = re.sub(r'\s+', ' ', ' '.join(p.chunks))
        # split into sentences so one page can report several hits
        for s in re.split(r'(?<=[.;:!?])\s+', text):
            out.append((rel, s))
        intended.append((rel, re.sub(r'\s+', ' ', ' '.join(p.skipped))))
        for blob in p.json_blobs:
            try:
                walk(json.loads(blob), rel + '#data', out)
            except ValueError:
                out.append((rel + '#data', blob))
    return out, intended


def report(items, listing):
    counts = {name: 0 for name, _ in PATTERNS}
    flagged = []
    for where, s in items:
        h = hits(s)
        for name in h:
            counts[name] += 1
        if h:
            flagged.append((where, s, h))
    if listing:
        for where, s, h in flagged:
            print(f'{where}  [{", ".join(h)}]\n    {s}')
        print()
    print(f'{len(flagged)} flagged strings of {len(items)} scanned')
    for name, n in counts.items():
        if n:
            print(f'  {name:12} {n}')
    return flagged


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'data'
    listing = '--list' in sys.argv
    if mode == 'data':
        report(data_strings(), listing)
    elif mode == 'html':
        items, intended = html_strings()
        report(items, listing)
        n = sum(len(hits(s)) for _, s in intended)
        print(f'  (skipped as intended: {n} pattern hits in "About this data", badges and footer credits)')
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main()
