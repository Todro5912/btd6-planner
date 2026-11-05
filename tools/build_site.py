#!/usr/bin/env python3
"""Build the deployable site.

1. Runs src/build.py, which inlines the data/ JSON and src/logic.js into
   src/template.html and writes src/btd6-planner.html.
2. Wraps that page in a full HTML document and writes index.html at the
   repo root, which is what GitHub Pages serves.
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src')

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Unofficial Bloons TD 6 planner: map, mode and tower coverage checks, priced build orders, cash curves and tower-XP projections.">
<style>
:root { color-scheme: light; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
img { max-width: 100%; }
[hidden] { display: none !important; }
</style>
</head>
<body>
"""
TAIL = "\n</body>\n</html>\n"


def main():
    subprocess.run([sys.executable, os.path.join(SRC, 'build.py')], check=True)
    with open(os.path.join(SRC, 'btd6-planner.html'), encoding='utf-8') as f:
        page = f.read()
    out = os.path.join(ROOT, 'index.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(HEAD + page + TAIL)
    print(f'wrote {out} ({os.path.getsize(out):,} bytes)')


if __name__ == '__main__':
    main()
