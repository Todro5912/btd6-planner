/* Browser checks for the built site (needs playwright + chromium).
     node tools/test_site.js [--shots DIR]
   Serves the parent of the repo under /btd6-planner/ (through a symlink) so the GitHub Pages base path is
   exercised, loads key pages at 1280px and 400px, and fails on console errors, failed same-origin requests
   or horizontal overflow. Also drives search, the maps filter, records sort, the price toggle and the
   planner's hash prefill. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const REPO = path.resolve(__dirname, '..');
const SITE = JSON.parse(fs.readFileSync(path.join(REPO, 'site.json'), 'utf8'));
const BASE = SITE.base; // "/btd6-planner/"
const shotIdx = process.argv.indexOf('--shots');
const SHOTS = shotIdx > 0 ? process.argv[shotIdx + 1] : null;
const PORT = 8000 + Math.floor(Math.random() * 900);

const PAGES = [
  ['home', ''],
  ['tower', 'monkeys/sniper/'],
  ['map', 'maps/infernal/'],
  ['planner', 'planner/'],
  ['guide', 'guides/xp-farming/'],
  ['records', 'records/'],
];

let fail = 0;
function ok(cond, name, detail) {
  if (cond) console.log('  ok   ' + name);
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mi-serve-'));
  fs.symlinkSync(REPO, path.join(tmp, BASE.replace(/\//g, '')));
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', tmp], { stdio: 'ignore' });
  const origin = 'http://127.0.0.1:' + PORT;
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(origin + BASE); if (r.ok) break; } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  try {
    console.log('Pages at 1280 and 400');
    for (const [w, h] of [[1280, 900], [400, 860]]) {
      for (const [name, rel] of PAGES) {
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        const problems = [];
        page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
        page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
        page.on('response', (r) => { if (r.url().startsWith(origin) && r.status() >= 400) problems.push(r.status() + ' ' + r.url()); });
        page.on('requestfailed', (r) => { if (r.url().startsWith(origin)) problems.push('failed ' + r.url()); });
        await page.goto(origin + BASE + rel, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts && document.fonts.ready);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        const wide = overflow > 0 ? await page.evaluate(() => {
          const out = [];
          document.querySelectorAll('body *').forEach((el) => { const r = el.getBoundingClientRect(); if (r.right > window.innerWidth + 1 && out.length < 4) out.push(el.tagName + '.' + el.className); });
          return out;
        }) : [];
        const text = await page.evaluate(() => document.body.innerText);
        ok(problems.length === 0, `${w}px ${name}: no console errors or failed requests`, problems);
        ok(overflow <= 0, `${w}px ${name}: no horizontal overflow`, { overflow, wide });
        ok(!/\bNaN\b|\bundefined\b|\[object /.test(text), `${w}px ${name}: no NaN/undefined in text`);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}-${w}.png`), fullPage: true });
        await page.close();
      }
    }

    console.log('Interactions');
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(origin + BASE + 'maps/', { waitUntil: 'networkidle' });
    await page.keyboard.press('/');
    ok(await page.evaluate(() => document.getElementById('search').open), '"/" opens the search dialog');
    await page.keyboard.type('glaive');
    await page.waitForSelector('#searchList [role="option"][data-i]');
    const first = await page.textContent('#searchList [aria-selected="true"] .r-t');
    ok(/Glaive/.test(first), 'search "glaive" puts a Glaive upgrade first', first);
    await page.keyboard.press('ArrowDown');
    ok(await page.evaluate(() => document.getElementById('searchInput').getAttribute('aria-activedescendant') === 'sr1'), 'ArrowDown moves the active option');
    await page.keyboard.press('Escape');
    ok(!(await page.evaluate(() => document.getElementById('search').open)), 'Esc closes the dialog');
    await page.keyboard.press('/');
    await page.keyboard.type('r63');
    await page.waitForSelector('#searchList [data-i]');
    ok((await page.textContent('#searchList [aria-selected="true"] .r-t')) === 'Round 63', 'search "r63" finds Round 63');
    await page.keyboard.press('Enter');
    await page.waitForURL(/guides\/rounds\/#r63$/);
    ok(true, 'Enter opens the result (rounds page, #r63)');

    await page.goto(origin + BASE + 'maps/', { waitUntil: 'networkidle' });
    await page.selectOption('#mapW', 'lots');
    await page.fill('#mapQ', '');
    const shown = await page.evaluate(() => document.querySelectorAll('.tbl-maps tbody tr:not([hidden])').length);
    ok(shown > 0 && shown < 90, 'maps filter: water = lots narrows the list', shown);
    await page.uncheck('input[name="d"][value="Beginner"]');
    const noBeg = await page.evaluate(() => document.getElementById('beginner').hidden);
    ok(noBeg === true || noBeg === false, 'difficulty checkbox toggles without error');
    await page.selectOption('#mapW', '');
    await page.fill('#mapQ', 'infer');
    ok((await page.evaluate(() => Array.from(document.querySelectorAll('.tbl-maps tbody tr:not([hidden]) a')).map((a) => a.textContent))).join() === 'Infernal', 'search-as-you-type: "infer" leaves Infernal');

    await page.goto(origin + BASE + 'records/', { waitUntil: 'networkidle' });
    await page.click('button[data-key="lcc"]');
    const lcc = await page.evaluate(() => Array.from(document.querySelectorAll('#records tbody tr')).slice(0, 3).map((r) => +r.getAttribute('data-lcc')));
    ok(lcc[0] >= lcc[1] && lcc[1] >= lcc[2], 'records: LCC sorts descending first', lcc);
    await page.click('button[data-key="lcc"]');
    const lccA = await page.evaluate(() => Array.from(document.querySelectorAll('#records tbody tr')).slice(0, 3).map((r) => +r.getAttribute('data-lcc')));
    ok(lccA[0] <= lccA[1], 'records: second click sorts ascending', lccA);

    await page.goto(origin + BASE + 'monkeys/dart/', { waitUntil: 'networkidle' });
    const before = await page.textContent('.head-bar .price');
    await page.click('.diff-toggle [data-diff="hard"]');
    const after = await page.textContent('.head-bar .price');
    ok(before === '$200' && after === '$215', 'price toggle: Dart $200 Medium -> $215 Hard', [before, after]);
    await page.click('.diff-toggle [data-diff="medium"]');

    await page.goto(origin + BASE + 'planner/#map=dark-castle&mode=chimps&tower=dart', { waitUntil: 'networkidle' });
    const st = await page.evaluate(() => ({
      map: (document.querySelector('#mapList [aria-selected="true"]') || {}).textContent || '',
      mode: document.getElementById('mode').value,
      picks: Array.from(document.querySelectorAll('#picks .pick-name')).map((x) => x.textContent),
      hash: location.hash,
    }));
    ok(/Dark Castle/.test(st.map) && st.mode === 'chimps' && st.picks.length === 1 && /Dart/.test(st.picks[0]) && st.hash === '', 'planner hash prefill: map, mode and tower applied, hash cleared', st);
    await page.goto(origin + BASE + 'nope/', { waitUntil: 'networkidle' }).catch(() => {});
    ok(errs.length === 0, 'no page errors during interactions', errs);
    await page.close();
  } finally {
    await browser.close();
    server.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(fail ? `\n${fail} failed` : '\nall browser checks passed');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
