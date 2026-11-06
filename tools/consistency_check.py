#!/usr/bin/env python3
"""One source of truth: every "can it pop X" answer on the site must come out the same from data/pop-model.json.

    python3 tools/consistency_check.py            sample crosspaths, plus the built tower pages in Chromium
    python3 tools/consistency_check.py --all      every legal crosspath (the browser part stays on the sample)
    python3 tools/consistency_check.py --no-browser

For every tower and crosspath it compares:
  (a) the data stream's reference evaluator (data/_tests/test_pop_model.py: can());
  (b) the site build's evaluator (tools/mi_lib.py PopModel.can, which feeds quick cards, key answers and picker data);
  (c) the tools' evaluator (src/pages/assets/tools-core.js C.towerProps, run in node);
  (d) the tower-page picker (static/picker.js) on the built site, read back from the rendered "Can pop" list.
It also checks that every quick-card fix and every tower-page key answer is a crosspath that (a) says works, and that
it is the cheapest such crosspath. Sample crosspaths: 0-0-0, every single-path tier, and every crosspath listed in
towers.json. Exit code 1 on any disagreement.
"""
import importlib.util
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))

PROPS = ['camo', 'lead', 'purple', 'black', 'white', 'zebra', 'frozen', 'moab', 'bad', 'fortified', 'ddt']
PICKER_PROPS = ['camo', 'lead', 'purple', 'black', 'white', 'frozen', 'moab', 'fortified', 'ddt']


def load_reference():
    spec = importlib.util.spec_from_file_location('pop_ref', os.path.join(ROOT, 'data', '_tests', 'test_pop_model.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def legal(c):
    return all(0 <= x <= 5 for x in c) and sum(1 for x in c if x) <= 2 and sum(1 for x in c if x > 2) <= 1


def samples(towers, everything=False):
    out = {}
    for t in towers:
        codes = []
        if everything:
            codes = [[a, b, c] for a in range(6) for b in range(6) for c in range(6) if legal([a, b, c])]
        else:
            codes.append([0, 0, 0])
            for p in range(3):
                for tier in range(1, 6):
                    c = [0, 0, 0]
                    c[p] = tier
                    codes.append(c)
            for x in t.get('crosspaths') or []:
                try:
                    c = [int(v) for v in str(x.get('code')).split('-')]
                except ValueError:
                    continue
                if len(c) == 3 and legal(c):
                    codes.append(c)
        seen, uniq = set(), []
        for c in codes:
            k = tuple(c)
            if k not in seen:
                seen.add(k)
                uniq.append(c)
        out[t['id']] = uniq
    return out


NODE = r"""
const fs = require('fs');
const C = require(process.argv[1]);
const req = JSON.parse(fs.readFileSync(0, 'utf8'));
const pm = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = {};
for (const id of Object.keys(req)) {
  out[id] = req[id].map((x) => { const s = C.towerProps(pm, id, x) || {}; return Object.keys(s).filter((k) => s[k]); });
}
process.stdout.write(JSON.stringify(out));
"""


def tools_core(sample):
    core = os.path.join(ROOT, 'src', 'pages', 'assets', 'tools-core.js')
    pm = os.path.join(ROOT, 'data', 'pop-model.json')
    r = subprocess.run(['node', '-e', NODE, core, pm], input=json.dumps(sample), capture_output=True, text=True)
    if r.returncode:
        sys.exit('node failed: ' + r.stderr)
    return json.loads(r.stdout)


def picker(sample):
    """(d) the rendered picker on every built tower page, served over http so the page runs as on GitHub Pages."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None, 'playwright not installed'
    import http.server
    import threading
    import functools
    site = json.load(open(os.path.join(ROOT, 'site.json'), encoding='utf-8'))
    base = (site.get('base') or '/').strip('/')

    class H(http.server.SimpleHTTPRequestHandler):
        def translate_path(self, path):
            p = path.split('?')[0].split('#')[0]
            if base and p.startswith('/' + base):
                p = p[len(base) + 1:]
            return os.path.join(ROOT, p.lstrip('/'))

        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    port = srv.server_address[1]
    out = {}
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        page = b.new_page()
        for tid, codes in sample.items():
            url = f'http://127.0.0.1:{port}/{base + "/" if base else ""}monkeys/{tid}/'
            page.goto(url)
            page.wait_for_function('window.MI && window.MI.picker')
            res = page.evaluate("""(codes) => {
              const box = document.getElementById('picker');
              const D = JSON.parse(box.querySelector('.pk-data').textContent);
              const byLabel = {}; Object.keys(D.labels).forEach((k) => { byLabel[D.labels[k]] = k; });
              return codes.map((c) => {
                window.MI.picker.set(c);
                const lis = Array.from(box.querySelectorAll('.pk-pops .pop'));
                if (lis.length === 1 && lis[0].classList.contains('pop-na')) return [];
                return lis.filter((li) => li.classList.contains('pop-y'))
                  .map((li) => byLabel[li.textContent.replace(/^(can pop|cannot pop)\\s*/, '').trim()]);
              });
            }""", codes)
            out[tid] = res
        b.close()
    srv.shutdown()
    return out, None


def main():
    everything = '--all' in sys.argv
    ref = load_reference()
    from mi_lib import PopModel, ALL_CROSS
    model = json.load(open(os.path.join(ROOT, 'data', 'pop-model.json'), encoding='utf-8'))
    towers = json.load(open(os.path.join(ROOT, 'data', 'towers.json'), encoding='utf-8'))['towers']
    pm = PopModel(model)
    sample = samples(towers, everything)
    core = tools_core(sample)
    errors, n = [], 0
    for tid, codes in sample.items():
        for i, c in enumerate(codes):
            code = '-'.join(map(str, c))
            s_core = set(core[tid][i])
            for prop in PROPS:
                a = bool(ref.can(tid, code, prop))
                b = bool(pm.can(tid, prop, c))
                cc = prop in s_core
                n += 1
                if not (a == b == cc):
                    errors.append(f'{tid} {code} {prop}: reference={a} site-build={b} tools-core={cc}')
    print(f'(a) reference vs (b) site build vs (c) tools-core: {n} answers over '
          f'{sum(len(v) for v in sample.values())} tower crosspaths, {len(errors)} disagreements')

    # quick cards and key answers: each fix must work per the reference, and be the cheapest that does
    import build_site
    c = build_site.build_model()
    cards = build_site.quick_cards(c)
    nq = 0
    for q in cards:
        for row in q['top'] + q['more']:
            nq += 1
            tid, code = row['tm']['id'], row['code']
            if q['mode'] == 'bonus':
                continue
            for prop in q['props']:
                if not ref.can(tid, code, prop):
                    errors.append(f'quick card {q["slug"]}: {tid} {code} listed but the reference says it can\'t pop {prop}')
            cheapest = min((x for x in ALL_CROSS if all(ref.can(tid, '-'.join(map(str, x)), p) for p in q['props'])),
                           key=lambda x: (c.cross_medium(tid, x), sum(x)), default=None)
            if cheapest is not None and c.cross_medium(tid, cheapest) < row['prices']['medium']:
                errors.append(f'quick card {q["slug"]}: {tid} {code} is not the cheapest (reference: {cheapest})')
    na = 0
    for tm in c.tower_models:
        for a in tm.get('answers') or []:
            if a['label'] == 'MOAB bonus':
                continue
            na += 1
            if a['state'] == 'never':
                if any(ref.can(tm['id'], '-'.join(map(str, x)), a['prop']) for x in ALL_CROSS):
                    errors.append(f'{tm["id"]} key answer {a["prop"]}: "never" but the reference finds a crosspath')
            elif not ref.can(tm['id'], a['code'], a['prop']):
                errors.append(f'{tm["id"]} key answer {a["prop"]} {a["code"]}: the reference says no')
    print(f'quick-card fixes checked: {nq}; tower key answers checked: {na}')

    if '--no-browser' not in sys.argv:
        bsample = samples(towers, False)
        for tid, code in (('sniper', [1, 1, 0]), ('ice', [2, 0, 0]), ('ace', [0, 2, 0]), ('tack', [4, 0, 0])):
            if code not in bsample[tid]:
                bsample[tid].append(code)
        got, why = picker(bsample)
        if got is None:
            print('(d) picker: skipped (' + why + ')')
        else:
            nb = 0
            for tid, codes in bsample.items():
                for i, cr in enumerate(codes):
                    code = '-'.join(map(str, cr))
                    shown = set(got[tid][i])
                    for prop in PICKER_PROPS:
                        nb += 1
                        a = bool(ref.can(tid, code, prop))
                        if a != (prop in shown):
                            errors.append(f'picker {tid} {code} {prop}: reference={a} page={prop in shown}')
            print(f'(d) built tower-page pickers: {nb} answers checked')
            # the data stream's known truths, read off the rendered pages
            idx = {tid: {'-'.join(map(str, x)): set(got[tid][i]) for i, x in enumerate(codes)} for tid, codes in bsample.items()}
            truths = [('sniper', '1-1-0', 'ddt', True), ('dart', '0-0-0', 'lead', False), ('bomb', '0-0-0', 'black', False),
                      ('wizard', '0-0-0', 'lead', False), ('ice', '2-0-0', 'ddt', False), ('ace', '0-2-0', 'ddt', False),
                      ('tack', '4-0-0', 'purple', False)]
            for tid, code, prop, want in truths:
                have = prop in idx[tid][code]
                print(f'    known truth on the page: {tid} {code} {prop} {"yes" if have else "no"}'
                      f' ({"ok" if have == want else "WRONG"})')
                if have != want:
                    errors.append(f'known truth: {tid} {code} {prop} should be {want}')
            bad_fort = [f'{tid} {code}' for tid, m in idx.items() for code, shown in m.items()
                        if (shown - {'fortified'}) and 'fortified' not in shown]
            print(f'    Fortified shown as "can\'t" while a base type is "can": {len(bad_fort)} crosspaths')
            errors += ['fortified ✗ with a base type ✓: ' + x for x in bad_fort]

    if errors:
        print('\n'.join('  ' + e for e in errors[:80]))
        print(f'FAILED: {len(errors)} disagreements')
        sys.exit(1)
    print('consistency check passed: every evaluator agrees 100%')


if __name__ == '__main__':
    main()
