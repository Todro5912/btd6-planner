#!/usr/bin/env python3
"""Static checks on the built site (run after tools/build_site.py).

- every internal link, script, stylesheet and fragment resolves to a generated file,
  read the way GitHub Pages serves it under the site.json base path;
- every page has a <title> and a meta description;
- no private names or workspace words in the output;
- search-index.json parses and every entry points at a real page.
Exit code 1 on any failure.
"""
import json
import os
import posixpath
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BANNED = re.compile(r'\b(sean|claude|vault)\b', re.I)


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

    print(f'{len(pages)} pages, {n_links} internal links checked, search index: '
          + ', '.join(f'{k} {v}' for k, v in sorted(kinds.items())))
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
