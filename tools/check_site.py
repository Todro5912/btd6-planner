#!/usr/bin/env python3
"""Static checks on the built site (run after tools/build_site.py).

- every internal link, script, stylesheet and fragment resolves to a generated file,
  read the way GitHub Pages serves it under the site.json base path;
- every page has a <title> and a meta description;
- no private names or workspace words in the output;
- search-index.json parses and every entry points at a real page;
- no button, summary or label text with a stray "(" (the 0.4 "( INTERMEDIATE" bug);
- every quick card shows at least 3 fixes;
- no wall-of-text paragraph over 450 characters outside guides;
- search (static/search-core.js, run with node) puts the right page first for player words.
Exit code 1 on any failure.
"""
import json
import os
import posixpath
import re
import shutil
import subprocess
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANNED = re.compile(r'\b(sean|claude|vault)\b', re.I)
WALL = 450
# query -> the page that must come first (C4). Synonyms live in data/search-synonyms.json.
SEARCH_EXPECT = [
    ('camo', 'quick/camo/'), ('see camo', 'quick/camo/'), ('camo detection', 'quick/camo/'),
    ('lead', 'quick/lead/'), ('pops lead', 'quick/lead/'), ('purple', 'quick/purple/'),
    ('black', 'quick/black-zebra/'), ('zebra', 'quick/black-zebra/'), ('white', 'quick/white-frozen/'),
    ('fortified', 'quick/fortified/'), ('ddt', 'quick/ddt/'), ('moab', 'quick/moab/'),
    ('r63', 'rounds/63/'), ('round 63', 'rounds/63/'), ('63', 'rounds/63/'), ('r100', 'rounds/100/'),
    ('impoppable', 'guides/modes/'), ('chimps', 'guides/chimps/'), ('deflation', 'guides/modes/'),
    ('black border', 'guides/glossary/#g-bb-black-border'), ('lych', 'guides/boss-events/#lych-the-gravelord'),
    ('vortex', 'guides/boss-events/#vortex-deadly-master-of-air'), ('phayze', 'guides/boss-events/#phayze-the-reality-warper'),
    ('xp', 'tools/xp/'), ('farm xp', 'tools/xp/'), ('paragon', 'monkeys/paragons/'), ('monkey money', 'guides/monkey-money/'),
    ('mk', 'guides/monkey-knowledge/'), ('glaive', None), ('infernal', 'maps/infernal/'), ('sniper', 'monkeys/sniper/'),
]


class Text(HTMLParser):
    """Collects text of buttons/summaries/labels and of <p> elements (with the page section they sit in)."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.controls, self.paras, self.fix_counts = [], [], [], []
        self._ctl, self._p, self._fixes = None, None, None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('button', 'summary', 'label') and self._ctl is None:
            self._ctl = [tag, '', 0]
        if self._ctl is not None and tag == self._ctl[0]:
            self._ctl[2] += 1
        if tag == 'p' and self._p is None:
            self._p = ''
        if tag == 'ol' and 'fixes' in (a.get('class') or '').split() and self._fixes is None and not self.fix_counts:
            self._fixes = 0
        if tag == 'li' and self._fixes is not None and 'fix' in (a.get('class') or '').split():
            self._fixes += 1

    def handle_endtag(self, tag):
        if self._ctl is not None and tag == self._ctl[0]:
            self._ctl[2] -= 1
            if self._ctl[2] <= 0:
                self.controls.append((self._ctl[0], ' '.join(self._ctl[1].split())))
                self._ctl = None
        if tag == 'p' and self._p is not None:
            self.paras.append(' '.join(self._p.split()))
            self._p = None
        if tag == 'ol' and self._fixes is not None:
            self.fix_counts.append(self._fixes)
            self._fixes = None

    def handle_data(self, data):
        if self._ctl is not None:
            self._ctl[1] += data
        if self._p is not None:
            self._p += data


def stray_paren(text):
    t = text.strip()
    return t.startswith('(') and ')' not in t or t.count('(') != t.count(')')


def search_check(errors):
    node = shutil.which('node')
    if not node:
        print('search check skipped: node not found')
        return 0
    js = ("const S=require(process.argv[1]);const idx=require(process.argv[2]);const s=S.create(idx.entries);"
          "const qs=JSON.parse(process.argv[3]);const out={};for(const q of qs){out[q]=s.search(q,5).map(e=>e.u);}"
          "console.log(JSON.stringify(out));")
    qs = [q for q, _ in SEARCH_EXPECT]
    r = subprocess.run([node, '-e', js, os.path.join(ROOT, 'assets', 'search-core.js'),
                        os.path.join(ROOT, 'search-index.json'), json.dumps(qs)], capture_output=True, text=True)
    if r.returncode:
        errors.append('search check: node failed: ' + r.stderr.strip()[:300])
        return 0
    got = json.loads(r.stdout)
    n = 0
    for q, want in SEARCH_EXPECT:
        res = got.get(q) or []
        n += 1
        if want is None:
            if not res:
                errors.append(f'search "{q}": no results')
        elif not res or res[0] != want:
            errors.append(f'search "{q}": first result {res[:1]} (want {want})')
    return n


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links, self.ids, self.title, self.desc, self._in_title = [], set(), '', None, False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            self.ids.add(a['id'])
        if tag == 'a' and a.get('name'):
            self.ids.add(a['name'])
        for key in ('href', 'src'):
            if key in a and tag in ('a', 'link', 'script', 'img', 'iframe', 'source'):
                if tag == 'link' and a.get('rel') in ('preconnect', 'canonical'):
                    continue
                self.links.append((tag, a[key]))
        if tag == 'meta' and a.get('name') == 'description':
            self.desc = a.get('content') or ''
        if tag == 'meta' and a.get('http-equiv', '').lower() == 'refresh':
            m = re.search(r'url=(.*)$', a.get('content') or '', re.I)
            if m:
                self.links.append(('meta', m.group(1).strip()))
        if tag == 'title':
            self._in_title = True

    def handle_endtag(self, tag):
        if tag == 'title':
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data


def main():
    with open(os.path.join(ROOT, 'site.json'), encoding='utf-8') as f:
        site = json.load(f)
    base = site['base']
    with open(os.path.join(ROOT, '.build-manifest.json'), encoding='utf-8') as f:
        files = json.load(f)['files']
    fileset = set(files)
    errors = []

    def target_file(path):
        """Site path -> generated file, or None."""
        if path == '' or path.endswith('/'):
            cand = path + 'index.html'
        else:
            cand = path
        if cand in fileset:
            return cand
        if path and not path.endswith('/') and (path + '/index.html') in fileset:
            return path + '/index.html'
        return None

    pages = {}
    for rel in files:
        if rel.endswith('.html'):
            p = Page()
            with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
                text = f.read()
            p.feed(text)
            pages[rel] = (p, text)

    n_links = 0
    for rel, (p, text) in pages.items():
        if not p.title.strip():
            errors.append(f'{rel}: no <title>')
        if not p.desc:
            errors.append(f'{rel}: no meta description')
        url_dir = posixpath.dirname(rel)  # where the browser thinks it is
        if rel == '404.html':
            url_dir = None  # served at any depth: links must be absolute
        for tag, href in p.links:
            if re.match(r'^[a-z][a-z0-9+.-]*:', href, re.I) or href.startswith('//'):
                continue
            n_links += 1
            path, _, frag = href.partition('#')
            path = path.split('?')[0]
            if path == '':
                tgt = rel
            elif path.startswith('/'):
                if not path.startswith(base):
                    errors.append(f'{rel}: absolute link outside the base path: {href}')
                    continue
                tgt = target_file(path[len(base):])
            else:
                if url_dir is None:
                    errors.append(f'{rel}: relative link in a page served at any depth: {href}')
                    continue
                joined = posixpath.normpath(posixpath.join(url_dir, path))
                if joined.startswith('..'):
                    errors.append(f'{rel}: link climbs above the site root: {href}')
                    continue
                joined = '' if joined == '.' else joined
                if path.endswith('/') and joined:
                    joined += '/'
                tgt = target_file(joined)
            if not tgt:
                errors.append(f'{rel}: broken link {href}')
                continue
            if frag and '=' not in frag and tgt.endswith('.html') and tgt in pages and frag not in pages[tgt][0].ids:
                errors.append(f'{rel}: missing anchor #{frag} in {tgt}')

    # buttons, quick cards, paragraph length
    n_ctl = n_cards = 0
    for rel in files:
        if not rel.endswith('.html'):
            continue
        with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
            tp = Text()
            tp.feed(f.read())
        for tag, txt in tp.controls:
            n_ctl += 1
            if stray_paren(txt):
                errors.append(f'{rel}: stray "(" in <{tag}>: "{txt[:60]}"')
        if rel.startswith('quick/') and rel != 'quick/index.html':
            n_cards += 1
            if not tp.fix_counts or tp.fix_counts[0] < 3:
                errors.append(f'{rel}: quick card shows {tp.fix_counts[:1] or [0]} fixes, needs at least 3')
        if not rel.startswith(('guides/', 'tools/simulator/')):
            for ptxt in tp.paras:
                if len(ptxt) > WALL:
                    errors.append(f'{rel}: {len(ptxt)}-character paragraph: "{ptxt[:70]}..."')
    if n_cards < 8:
        errors.append(f'only {n_cards} quick cards built (want 8+)')
    n_search = search_check(errors)

    for rel in files:
        if rel.endswith(('.html', '.json', '.js', '.css')):
            with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
                for i, line in enumerate(f, 1):
                    m = BANNED.search(line)
                    if m:
                        errors.append(f'{rel}:{i}: banned word "{m.group(0)}"')
                        break

    try:
        with open(os.path.join(ROOT, 'search-index.json'), encoding='utf-8') as f:
            idx = json.load(f)
        entries = idx['entries']
        for e in entries:
            if not all(k in e for k in ('t', 'k', 'u')):
                errors.append(f'search-index.json: bad entry {e}')
                continue
            path, _, frag = e['u'].partition('#')
            tgt = target_file(path)
            if not tgt:
                errors.append(f"search-index.json: {e['t']} -> missing page {e['u']}")
            elif frag and frag not in pages[tgt][0].ids:
                errors.append(f"search-index.json: {e['t']} -> missing anchor {e['u']}")
        kinds = {}
        for e in entries:
            kinds[e['k']] = kinds.get(e['k'], 0) + 1
    except (OSError, ValueError, KeyError) as ex:
        errors.append(f'search-index.json does not parse: {ex}')
        kinds = {}

    if not os.path.exists(os.path.join(ROOT, '.nojekyll')):
        errors.append('.nojekyll is missing')

    print(f'{len(pages)} pages, {n_links} internal links checked, {n_ctl} controls, {n_cards} quick cards, '
          f'{n_search} search queries; search index: ' + ', '.join(f'{k} {v}' for k, v in sorted(kinds.items())))
    if errors:
        print(f'{len(errors)} problems:')
        for e in errors[:80]:
            print('  ' + e)
        if len(errors) > 80:
            print(f'  ... and {len(errors) - 80} more')
        return 1
    print('all checks passed')
    return 0


if __name__ == '__main__':
    sys.exit(main())
