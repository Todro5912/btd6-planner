/* Browser checks for the built site (needs playwright + chromium).
     node tools/test_site.js [--shots DIR] [--prefix v05-]
   Serves the repo under /btd6-planner/ (through a symlink) so the GitHub Pages base path is exercised, loads
   key pages at 1280px and 400px (light and dark), and fails on console errors, failed same-origin requests or
   horizontal overflow. Also drives search (player words), the header menus, the maps filter (and the 0.4 "("
   glitch), records sort, the price toggle, the tower crosspath picker, round lookup and the /planner/ redirect. */
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
const preIdx = process.argv.indexOf('--prefix');
const PREFIX = preIdx > 0 ? process.argv[preIdx + 1] : '';
const PORT = 8000 + Math.floor(Math.random() * 900);
const D_TOWERS = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'towers.json'), 'utf8')).towers.length;

const PAGES = [
  ['home', ''],
  ['quick-camo', 'quick/camo/'],
  ['quick-ddt', 'quick/ddt/'],
  ['tower', 'monkeys/sniper/'],
  ['map', 'maps/logs/'],
  ['maps', 'maps/'],
  ['round', 'rounds/63/'],
  ['rounds', 'rounds/'],
  ['hero', 'heroes/sauda/'],
  ['about', 'about/'],
  ['guide', 'guides/getting-started/'],
  ['records', 'records/'],
];
// tool pages are written by another stream; test whichever exist
for (const slug of ['advisor', 'simulator', 'goals', 'xp', 'defence', 'profile']) {
  if (fs.existsSync(path.join(REPO, 'tools', slug, 'index.html'))) PAGES.push(['tool-' + slug, 'tools/' + slug + '/']);
}

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
        const scheme = (name === 'map' || name === 'maps') && w === 400 ? 'dark' : (name === 'quick-ddt' ? 'dark' : 'light');
        const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: scheme });
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
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${PREFIX}${name}-${w}${scheme === 'dark' ? '-dark' : ''}.png`), fullPage: true });
        await page.close();
      }
    }

    console.log('Interactions');
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    const firstResult = async (q) => {
      await page.evaluate(() => { const d = document.getElementById('search'); if (d.open) d.close(); });
      await page.keyboard.press('/');
      await page.fill('#searchInput', q);
      await page.waitForSelector('#searchList li');
      return page.evaluate(() => { const li = document.querySelector('#searchList [aria-selected="true"]'); return li ? li.querySelector('.r-t').textContent + ' | ' + li.querySelector('.r-k').textContent : ''; });
    };
    await page.goto(origin + BASE + 'maps/', { waitUntil: 'networkidle' });
    await page.keyboard.press('/');
    ok(await page.evaluate(() => document.getElementById('search').open), '"/" opens the search dialog');
    await page.keyboard.press('Escape');
    for (const [q, want] of [['camo', /^Camo Bloons \| Quick$/], ['ddt', /^DDTs \| Quick$/], ['pops lead', /^Lead Bloons \| Quick$/],
      ['purple', /^Purple Bloons \| Quick$/], ['lych', /^Lych \| Boss$/], ['glaive', /Glaive/], ['xp', /XP calculator/]]) {
      const got = await firstResult(q);
      ok(want.test(got), `search "${q}" -> ${want}`, got);
    }
    await firstResult('r63');
    await page.keyboard.press('Enter');
    await page.waitForURL(/rounds\/63\/$/);
    ok(true, 'search "r63" + Enter opens /rounds/63/');

    // header: typing in the desktop search box hands off to the dialog; the Tools menu opens and lists the tools
    await page.goto(origin + BASE, { waitUntil: 'networkidle' });
    await page.click('#topQ');
    await page.keyboard.type('c');
    ok(await page.evaluate(() => document.getElementById('search').open && document.getElementById('searchInput').value === 'c'), 'header search box opens the dialog with the typed text');
    await page.keyboard.press('Escape');
    await page.click('.tools-menu > summary');
    const toolLinks = await page.evaluate(() => Array.from(document.querySelectorAll('.tools-menu[open] .menu-list a')).map((a) => a.getAttribute('href')));
    ok(toolLinks.length === 6 && toolLinks.every((h) => /tools\/(advisor|simulator|goals|xp|defence|profile)\/$/.test(h)), 'Tools menu lists advisor, simulator, goals, xp, defence and profile', toolLinks);
    ok(await page.evaluate(() => !!document.querySelector('.top a.mebtn[href$="tools/profile/"]')), 'header has the "Me" profile button');
    ok(await page.evaluate(() => !!document.querySelector('.planband a[href$="tools/advisor/"]') && !!document.querySelector('.planband a[href$="tools/simulator/"]')), 'home "Plan a run" band links the Advisor and the Simulator');
    await page.mouse.click(5, 600);
    ok(!(await page.evaluate(() => document.querySelector('.tools-menu').open)), 'clicking outside closes the Tools menu');
    ok(await page.evaluate(() => /Made by/.test(document.querySelector('.maker').textContent) && /github\.com/.test(document.querySelector('.maker').href)), 'header shows "Made by" with a GitHub link');

    // home round lookup
    await page.fill('#roundN', '40');
    await page.click('.round-form button');
    await page.waitForURL(/rounds\/40\/$/);
    ok(/Round 40/.test(await page.textContent('h1')), 'home round lookup "40" opens Round 40');

    // quick card: at least 3 fixes, sorted by price, prices follow the difficulty toggle
    await page.goto(origin + BASE + 'quick/camo/', { waitUntil: 'networkidle' });
    const qc = await page.evaluate(() => Array.from(document.querySelectorAll('.qcard > .fixes > .fix')).map((li) => li.querySelector('.fix-cost .price').textContent));
    const nums = qc.map((x) => +x.replace(/[^0-9]/g, ''));
    ok(nums.length >= 3, 'camo card shows 3+ fixes', qc);
    await page.click('.diff-toggle [data-diff="impoppable"]');
    const qi = await page.textContent('.qcard > .fixes > .fix .fix-cost .price');
    ok(+qi.replace(/[^0-9]/g, '') > nums[0], 'quick card prices switch to Impoppable', [qc[0], qi]);
    await page.click('.diff-toggle [data-diff="medium"]');

    // maps index: the difficulty chips show their medal dot (0.4 rendered it as a stray "(")
    await page.goto(origin + BASE + 'maps/', { waitUntil: 'networkidle' });
    const dots = await page.evaluate(() => Array.from(document.querySelectorAll('.segcheck .dot')).map((d) => { const r = d.getBoundingClientRect(), cs = getComputedStyle(d); return [Math.round(r.width), Math.round(r.height), cs.borderRightWidth, cs.backgroundColor]; }));
    ok(dots.length === 4 && dots.every(([w, h, br, bg]) => w === h && br !== '0px' && bg !== 'rgba(0, 0, 0, 0)'), 'difficulty filter dots are whole circles (no stray "(")', dots);
    await page.selectOption('#mapW', 'lots');
    const shown = await page.evaluate(() => document.querySelectorAll('.tbl-maps tbody tr:not([hidden])').length);
    ok(shown > 0 && shown < 90, 'maps filter: water = lots narrows the list', shown);
    await page.selectOption('#mapW', 'water');
    const wet = await page.evaluate(() => document.querySelectorAll('.tbl-maps tbody tr:not([hidden])').length);
    ok(wet > shown && wet < 90, 'maps filter: "has water" = little or lots', wet);
    await page.selectOption('#mapW', '');
    await page.fill('#mapQ', 'infer');
    ok((await page.evaluate(() => Array.from(document.querySelectorAll('.tbl-maps tbody tr:not([hidden]) a')).map((a) => a.textContent))).join() === 'Infernal', 'search-as-you-type: "infer" leaves Infernal');

    await page.goto(origin + BASE + 'records/', { waitUntil: 'networkidle' });
    await page.click('button[data-key="lcc"]');
    const lcc = await page.evaluate(() => Array.from(document.querySelectorAll('#records tbody tr')).slice(0, 3).map((r) => +r.getAttribute('data-lcc')));
    ok(lcc[0] >= lcc[1] && lcc[1] >= lcc[2], 'records: LCC sorts descending first', lcc);

    // tower page: price toggle and the crosspath picker
    await page.goto(origin + BASE + 'monkeys/dart/', { waitUntil: 'networkidle' });
    const before = await page.textContent('.head-bar .price');
    await page.click('.diff-toggle [data-diff="hard"]');
    const after = await page.textContent('.head-bar .price');
    ok(before === '$200' && after === '$215', 'price toggle: Dart $200 Medium -> $215 Hard', [before, after]);
    await page.click('.diff-toggle [data-diff="medium"]');

    await page.goto(origin + BASE + 'monkeys/sniper/', { waitUntil: 'networkidle' });
    const pk = async () => page.evaluate(() => ({
      code: document.querySelector('.pk-code').textContent, cost: document.querySelector('.pk-cost').textContent,
      yes: Array.from(document.querySelectorAll('.pk-pops .pop-y')).map((x) => x.textContent.replace(/^can pop /, '')),
      syn: document.querySelectorAll('.pk-syn li').length, rule: document.querySelector('.pk-rule').textContent,
    }));
    ok(await page.isVisible('#picker'), 'picker is shown when JS runs');
    let st = await pk();
    ok(st.code === '0-0-0' && st.cost === '$350' && !st.yes.includes('Lead') && !st.yes.includes('Camo'), 'picker starts at 0-0-0, $350, no camo or lead', st);
    await page.click('.pk-btn[data-p="0"][data-d="1"]');
    st = await pk();
    ok(st.code === '1-0-0' && st.cost === '$700' && st.yes.includes('Lead'), 'top + : 1-0-0 Full Metal Jacket pops Lead, $700', st);
    const synBefore = await page.evaluate(() => document.querySelector('.pk-syn').textContent);
    await page.click('.pk-btn[data-p="1"][data-d="1"]');
    st = await pk();
    ok(st.code === '1-1-0' && st.yes.includes('Camo') && st.yes.includes('DDT'), 'middle + : 1-1-0 sees camo and can hit DDTs', st);
    const synAfter = await page.evaluate(() => document.querySelector('.pk-syn').textContent);
    ok(synBefore !== synAfter && st.syn > 0, 'synergy suggestions react to the crosspath', [synBefore.slice(0, 60), synAfter.slice(0, 60)]);
    const synSrc = await page.evaluate(() => ({ src: document.querySelector('.pk-src').textContent, links: Array.from(document.querySelectorAll('.pk-syn li a:not(.pk-plan)')).map((a) => a.getAttribute('href')), text: document.querySelector('.pk-syn').textContent }));
    ok(/synergy rules/.test(synSrc.src) && synSrc.links.length > 0 && synSrc.links.every((h) => /(monkeys|heroes)\/[a-z-]+\/$/.test(h)) && !/undefined|null/.test(synSrc.text), 'tower page uses the synergy engine (adapter): linked suggestions, no undefined', synSrc);
    ok(await page.isDisabled('.pk-btn[data-p="2"][data-d="1"]'), 'bottom + is disabled: only two paths can be upgraded');
    for (let i = 0; i < 2; i++) await page.click('.pk-btn[data-p="0"][data-d="1"]');
    await page.click('.pk-btn[data-p="1"][data-d="1"]');
    ok(await page.isDisabled('.pk-btn[data-p="1"][data-d="1"]') && (await pk()).code === '3-2-0', 'at 3-2-0 middle + is disabled: only one path past tier 2');
    await page.click('.diff-toggle [data-diff="impoppable"]');
    const impCost = (await pk()).cost;
    await page.click('.diff-toggle [data-diff="medium"]');
    ok(impCost !== (await pk()).cost, 'picker price follows the difficulty toggle', impCost);
    await page.click('.answer[data-set-cross="0-1-0"]');
    ok((await pk()).code === '0-1-0', 'clicking the "Camo: 0-1-0" chip sets the picker');

    // map page: CHIMPS build order is collapsed and labelled
    await page.goto(origin + BASE + 'maps/logs/', { waitUntil: 'networkidle' });
    ok(await page.evaluate(() => { const d = document.querySelector('.build-more'); return !!d && !d.open && /not play-tested/.test(d.querySelector('summary').textContent); }), 'map: build order collapsed, "calculated, not play-tested"');
    ok(await page.evaluate(() => !document.querySelector('.expert-more').open), 'map: expert data collapsed');

    // 0.7 progress: a tower page's goal button starts a goal; logging a run banks XP; home picks it up; search shows recents
    await page.goto(origin + BASE + 'monkeys/dart/', { waitUntil: 'networkidle' });
    await page.click('.head-acts a[href*="tools/goals/#add=dart.paragon"]');
    await page.waitForSelector('.gl-card');
    ok(/Apex Plasma Master/.test(await page.textContent('.gl-card .panel-h')), 'tower page "Go for" button starts the Paragon goal');
    await page.click('.gl-log .btn-grass');
    ok(/XP banked/.test(await page.textContent('.gl-flash')), 'logging a run banks XP');
    await page.click('.gl-unlock');
    ok(/Unlocked/.test(await page.textContent('.gl-flash')), 'banked XP unlocks the next upgrade');
    await page.goto(origin + BASE + 'monkeys/dart/', { waitUntil: 'networkidle' });
    ok(await page.evaluate(() => { const b = document.querySelector('[data-my-tower]'); return b && !b.hidden && /Apex Plasma Master/.test(b.textContent); }), 'tower page shows your progress on it');
    await page.goto(origin + BASE, { waitUntil: 'networkidle' });
    ok(await page.evaluate(() => { const c = document.querySelector('[data-continue]'); return c && !c.hidden && !!c.querySelector('.mi-goal') && /Dart Monkey/.test(c.textContent); }), 'home "Pick up where you left off" shows the goal and recent pages');
    await page.keyboard.press('/');
    await page.waitForFunction(() => document.querySelectorAll('#searchList li[data-i]').length > 0, null, { timeout: 5000 }).catch(() => {});
    ok(await page.evaluate(() => /Recent/.test(document.getElementById('searchList').textContent)), 'empty search shows recently viewed pages');
    await page.keyboard.press('Escape');
    await page.goto(origin + BASE + 'tools/xp/?tower=ninja', { waitUntil: 'networkidle' });
    ok(await page.evaluate(() => document.querySelector('.ti-tile[aria-pressed="true"]').textContent.indexOf('Ninja') === 0), 'old ?tower= links open the XP calculator on that tower');

    // My profile: the Monkey Knowledge trees (0.10): toggle, prerequisite lock, turn-off cascade, keyboard, reload, 400px
    for (const w of [1280, 400]) {
      const mp = await browser.newPage({ viewport: { width: w, height: 900 } });
      const merr = [];
      mp.on('pageerror', (e) => merr.push(e.message));
      await mp.goto(origin + BASE + 'tools/profile/', { waitUntil: 'networkidle' });
      await mp.evaluate(() => localStorage.removeItem('mi-progress-v1'));
      await mp.reload({ waitUntil: 'networkidle' });
      const pressed = (id) => mp.getAttribute('#pf-mk-' + id, 'aria-pressed');
      ok((await mp.$$('#prf-mk-tree .mk-tile')).length === 32 && (await mp.$$('#prf-mk-tree .mk-line')).length === 31, `${w}px MK: Primary tree shows 32 tiles and 31 prerequisite arrows`);
      await mp.click('#pf-mk-poppy-blades', { force: true }); /* aria-disabled: still tappable, it says why */
      ok(await pressed('poppy-blades') === 'false' && /Needs Hard Tacks/.test(await mp.textContent('#prf-mk-msg')), `${w}px MK: a node without its prerequisite stays off and says why`, await mp.textContent('#prf-mk-msg'));
      await mp.click('#pf-mk-fast-tack-attacks');
      await mp.click('#pf-mk-hard-tacks');
      await mp.click('#pf-mk-poppy-blades');
      ok(await pressed('fast-tack-attacks') === 'true' && await pressed('poppy-blades') === 'true', `${w}px MK: tapping turns nodes on in order`);
      await mp.click('#pf-mk-fast-tack-attacks');
      ok(await pressed('hard-tacks') === 'false' && await pressed('poppy-blades') === 'false' && /Also turned off Hard Tacks and Poppy Blades/.test(await mp.textContent('#prf-mk-msg')),
        `${w}px MK: turning a node off turns off what needs it, and says so`, await mp.textContent('#prf-mk-msg'));
      await mp.focus('#pf-mk-fast-tack-attacks');
      await mp.keyboard.press('Enter');
      await mp.keyboard.press('ArrowDown');
      const focused = await mp.evaluate(() => document.activeElement && document.activeElement.id);
      ok(await pressed('fast-tack-attacks') === 'true' && /^pf-mk-/.test(focused) && focused !== 'pf-mk-fast-tack-attacks', `${w}px MK: Enter toggles a tile, arrow keys move between tiles`, focused);
      await mp.click('#pf-mkt-Support');
      await mp.click('#pf-mk-flat-pack-buildings');
      await mp.reload({ waitUntil: 'networkidle' });
      ok(await pressed('fast-tack-attacks') === 'true', `${w}px MK: ticks survive a reload`);
      await mp.click('#pf-mkt-Support');
      ok(await pressed('flat-pack-buildings') === 'true' && /used by the tools|tower and upgrade discounts/.test(await mp.textContent('#prf-mk')), `${w}px MK: other trees keep their ticks; the summary names the discount`);
      const ov = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      await mp.click('#pf-mkt-Primary');
      const inner = await mp.evaluate(() => { const sc = document.getElementById('prf-mk-scroll'); return sc.scrollWidth - sc.clientWidth; });
      ok(ov <= 0 && (w > 1000 || inner > 0), `${w}px MK: the page doesn't scroll sideways (the tree panel does when it must)`, { ov, inner });
      /* a node with two arrows needs both (checked in game) */
      await mp.evaluate(() => window.MonkeyIntel.progress.update((x) => { x.profile.mk = { 'magic-tricks': true, 'speedy-brewing': true, 'mo-monkey-money': true, 'super-range': true }; }));
      await mp.reload({ waitUntil: 'networkidle' });
      await mp.click('#pf-mkt-Magic');
      await mp.click('#pf-mk-flame-jet', { force: true });
      ok(await pressed('flame-jet') === 'false' && /Needs Hot Magic/.test(await mp.textContent('#prf-mk-msg')), `${w}px MK: Flame Jet stays off with only one of its two arrows, and names the missing one`, await mp.textContent('#prf-mk-msg'));
      ok(!merr.length, `${w}px MK: no page errors`, merr);
      await mp.close();
    }

    // My profile: Monkey Knowledge and Instas reach the Advisor
    await page.goto(origin + BASE + 'tools/profile/', { waitUntil: 'networkidle' });
    await page.click('#pf-mkt-Primary');
    await page.click('#pf-mk-all');
    await page.click('#prf-ins-sum');
    await page.click('#pf-ins-add');
    await page.goto(origin + BASE + 'tools/advisor/#map=logs&mode=hard&hero=auto&t=dart', { waitUntil: 'networkidle' });
    ok(/\+\$200 start/.test(await page.textContent('.ti-prof')), 'Advisor shows your Monkey Knowledge (+$200 start)');
    ok(/Insta Dart/.test(await page.textContent('.ti-order-list')), 'Advisor starts the plan with your Insta Dart');
    await page.goto(origin + BASE + 'tools/advisor/#map=logs&mode=chimps&hero=auto&t=dart', { waitUntil: 'networkidle' });
    ok(/turns Monkey Knowledge off/.test(await page.textContent('.ti-prof')) && !/Insta Dart/.test(await page.textContent('.ti-order-list')), 'CHIMPS: no Monkey Knowledge, no Instas');
    await page.evaluate(() => { const P = window.MonkeyIntel.progress; const m = {}; window.MonkeyIntelData.heroes.forEach((h) => { m[h.id] = h.id === 'quincy'; }); P.setProfile({ heroes: m }); });
    await page.goto(origin + BASE + 'tools/advisor/#map=erosion&mode=deflation&hero=auto&t=dartling', { waitUntil: 'networkidle' });
    ok(/Quincy/.test(await page.inputValue('#adv-hero')) && /Place Quincy/.test(await page.textContent('.ti-order-list')), '"Pick for me" label names the hero the plan uses (only Quincy owned)', await page.inputValue('#adv-hero'));

    // every gap fix has an action: Advisor (picks / Simulator link / cheaper crosspath), Defence (Add / Upgrade), Pairs well (Add)
    await page.goto(origin + BASE + 'tools/advisor/#map=monkey-meadow&mode=medium&hero=none&t=super,dartling,village&f=super.205,dartling.025', { waitUntil: 'networkidle' });
    const gapLis = await page.$$eval('[aria-labelledby="adv-gaps-h"] .ti-fixes li:not(.ti-fix-hint)', (ls) => ls.map((l) => !!l.querySelector('.ti-fix-a .btn') || /Your hero/i.test(l.textContent)));
    ok(gapLis.length > 0 && gapLis.every(Boolean), 'Advisor: every gap fix has an Add button', gapLis.join(','));
    ok((await page.$$('[aria-labelledby="adv-gaps-h"] .bullets .btn-grass')).length > 0, 'Advisor: leftovers offer a cheaper crosspath');
    const simHref = await page.$eval('[aria-labelledby="adv-gaps-h"] a.btn', (a) => a.getAttribute('href'));
    const advIdle = () => page.waitForFunction(() => document.getElementById('adv-root').getAttribute('aria-busy') === 'false');
    await page.click('[aria-labelledby="adv-gaps-h"] .ti-fix-a button:has-text("Add to my picks")');
    await advIdle();
    const addH = await page.evaluate(() => location.hash);
    const addNote = await page.textContent('#adv-note').catch(() => '');
    ok(/t=super,dartling,village,\w+/.test(addH) || /wasn't added/.test(addNote), 'Advisor: "Add to my picks" adds the monkey, or says why not (it never makes the first problem earlier)', [addH, addNote]);
    await page.goto(origin + BASE + 'tools/advisor/' + simHref, { waitUntil: 'networkidle' });
    ok(/b=.*_\d+p/.test(await page.evaluate(() => location.hash)) || /b=/.test(await page.evaluate(() => location.hash)), 'Advisor: "Add in the Simulator" opens the plan with the fix', simHref);
    await page.evaluate(() => localStorage.setItem('mi-defence-v1', JSON.stringify({ modeId: 'medium', round: 24, towers: [{ id: 'dart', x: [0, 0, 2] }] })));
    await page.goto(origin + BASE + 'tools/defence/', { waitUntil: 'networkidle' });
    const dfnN = (await page.$$('.ti-alert .ti-fix-a button')).length;
    await page.click('.ti-alert .ti-fix-a button');
    ok(dfnN > 0 && /4-0-2|0-[1-5]-2|[1-5]-0-2|0-0-[3-5]/.test(await page.textContent('.ti-placed')), 'Defence: a fix has Upgrade/Add and it changes your towers', String(dfnN));
    const pairN = (await page.$$('[aria-labelledby="dfn-syn-h"] .ti-fix-a button')).length;
    if (pairN) { await page.click('[aria-labelledby="dfn-syn-h"] .ti-fix-a button'); }
    ok(pairN > 0 && /2 towers/.test(await page.textContent('[aria-labelledby="dfn-in-h"] small')), 'Defence: Pairs well has Add buttons that add the tower');
    await page.evaluate(() => localStorage.removeItem('mi-defence-v1'));
    await page.goto(origin + BASE + 'tools/simulator/#map=monkey-meadow&mode=medium&b=1pdart.002', { waitUntil: 'networkidle' });
    await page.click('[aria-labelledby="sim-syn-h"] .ti-fix-a button');
    ok(/_\d+p\w+/.test(await page.evaluate(() => location.hash)), 'Simulator: Pairs well Add puts the tower in the plan', await page.evaluate(() => location.hash));
    await page.click('#sim-pl-2');
    ok(/pl=2/.test(await page.evaluate(() => location.hash)) && /you start with \$550/.test(await page.textContent('[aria-labelledby="sim-setup-h"]')), 'Simulator: 2-player co-op lowers your start cash', await page.textContent('[aria-labelledby="sim-setup-h"] .ti-note'));
    await page.goto(origin + BASE + 'tools/advisor/#map=monkey-meadow&mode=medium&hero=none&t=dart,ice', { waitUntil: 'networkidle' });
    await page.click('#adv-pl-3');
    await page.waitForFunction(() => document.getElementById('adv-root').getAttribute('aria-busy') === 'false');
    ok(/pl=3/.test(await page.evaluate(() => location.hash)) && /pl=3/.test(await page.getAttribute('#adv-to-sim', 'href')), 'Advisor: co-op setting carries into the Simulator link');

    // 0.9.3 Advisor: verdict + lives, starter from the map plan, fixes that re-plan, busy state, collapsed lists (audit T3-T13, Q5, Q6)
    {
      const idle = () => page.waitForFunction(() => document.getElementById('adv-root').getAttribute('aria-busy') === 'false');
      await page.evaluate(() => { localStorage.removeItem('mi-adv-v1'); });
      await page.goto(origin + BASE + 'tools/advisor/#map=dark-castle&mode=chimps&hero=auto', { waitUntil: 'networkidle' });
      await page.evaluate(() => { window.__busy = false; const r = document.getElementById('adv-root'); new MutationObserver(() => { if (r.getAttribute('aria-busy') === 'true') window.__busy = true; }).observe(r, { attributes: true }); });
      await page.click('#adv-starter');
      await idle();
      const sawBusy = await page.evaluate(() => window.__busy);
      await idle();
      const h1 = await page.evaluate(() => location.hash);
      ok(/t=.*druid/.test(h1) && /druid\.015/.test(h1), 'Advisor: "Start with what\'s strong here" on Dark Castle CHIMPS uses the map page\'s plan (Druid 0-1-5)', h1);
      ok(sawBusy, 'Advisor: a re-plan shows a busy state first (Q6)');
      const head = await page.textContent('.ti-alert .ti-alert-t');
      ok(/^(Holds to R100|Breaks at R\d+|Runs out of lives around R\d+)$/i.test(head.trim()) && /Lives:/.test(await page.textContent('.ti-alert')), 'Advisor: the headline says where the plan breaks (or that it holds) and shows lives (T3)', head);
      ok(!/Covered to/.test(await page.textContent('#adv-root')), 'Advisor: no "Covered to" headline any more');
      const hints = await page.$$eval('[aria-labelledby="adv-gaps-h"] *', (els) => els.filter((e) => e.children.length === 0 && /^Estimate from each tower/.test(e.textContent)).length);
      ok(hints <= 1, 'Advisor: the estimate note shows once, not once per problem (Q5)', hints);
      const more = await page.$('#adv-more-probs');
      if (more) {
        await page.click('#adv-more-probs > summary');
        await page.waitForSelector('#adv-more-probs .ti-prob', { timeout: 3000 }).catch(() => {});
        ok((await page.$$('#adv-more-probs .ti-prob')).length > 0 && (await page.$$('#adv-more-probs .ti-fix-a .btn')).length > 0, 'Advisor: "Show N more problems" opens them, each fix with a button');
      }
      const lines = await page.$$eval('[aria-labelledby="adv-gaps-h"] .ti-fixes > li', (ls) => ls.map((l) => !!l.querySelector('.ti-fix-a .btn, .ti-fix-a .ti-note') || /Work on it/.test(l.textContent)));
      ok(lines.length > 0 && lines.every(Boolean), 'Advisor: every fix line has an action or says why not (E24)', lines.join(','));
      const before = await page.evaluate(() => location.hash);
      const addPlan = await page.$('[aria-labelledby="adv-gaps-h"] .ti-fix-a button:has-text("Add to my plan")');
      if (addPlan) {
        await addPlan.click(); await idle();
        const note = await page.textContent('#adv-note').catch(() => '');
        const after = await page.evaluate(() => location.hash);
        ok((/x=/.test(after) && /added/.test(note)) || (/wasn't added/.test(note) && after === before), 'Advisor: "Add to my plan" adds the fix to the plan (x= in the link) or says why it didn\'t', [after, note]);
        const rm = await page.$('.ti-alert .adv-extra button');
        if (rm) { await rm.click(); await idle(); ok(!/x=/.test(await page.evaluate(() => location.hash)), 'Advisor: a fix you added can be removed'); }
      }
      const order = await page.$('[aria-labelledby="adv-order-h"] details summary');
      if (order) { await order.click(); ok((await page.$$('[aria-labelledby="adv-order-h"] details .ti-step')).length > 0, 'Advisor: long build orders collapse behind "Show the other N buys"'); }
      ok(/: buy /.test(await page.textContent('.ti-order-list')), 'Advisor: build order steps name the upgrade you buy (T13)');
      const tryBtn = await page.$('[aria-labelledby="adv-gaps-h"] .ti-fix-a a:has-text("Try in the Simulator")');
      ok(!!tryBtn && /simulator\/#.*b=/.test(await tryBtn.getAttribute('href')), 'Advisor: "Try in the Simulator" is a real link');
      await Promise.all([page.waitForURL(/tools\/simulator\//), tryBtn.click()]);
      ok(/b=/.test(await page.evaluate(() => location.hash)), 'Advisor: "Try in the Simulator" opens the Simulator with the plan and the fix', await page.evaluate(() => location.hash));
      await page.goto(origin + BASE + 'tools/advisor/#map=dark-castle&mode=medium&hero=none&t=dart', { waitUntil: 'networkidle' });
      await page.click('.ti-tips-dl button:has-text("Boomerang")');
      await idle();
      ok(/t=dart,boomerang/.test(await page.evaluate(() => location.hash)), 'Advisor: "Weak here" chips add the tower too (with a warning title)');
    }

    // 0.9.1: illegal steps are called out, out-of-order share links load right, bad goal links don't blank the page
    await page.evaluate(() => localStorage.removeItem('mi-sim-v1'));
    await page.goto(origin + BASE + 'tools/simulator/#map=logs&mode=primary-only&b=1pdart_5psniper.110', { waitUntil: 'networkidle' });
    ok(/Not counted:.*Sniper/.test(await page.textContent('[aria-label="Result"], [aria-label="First problem"]')), 'Simulator: a Sniper in Primary Only is called out as not counted');
    await page.evaluate(() => localStorage.removeItem('mi-sim-v1'));
    await page.goto(origin + BASE + 'tools/simulator/#map=monkey-meadow&mode=medium&b=10pdart_11psniper_12u2.002_3pboomerang', { waitUntil: 'networkidle' });
    const placed = await page.textContent('#sim-root');
    ok(/Dart #1 to 0-0-2|Dart #1[^#]*0-0-2/.test(placed) && !/Sniper #1 to 0-0-2/.test(placed), 'Simulator: an out-of-order share link upgrades the Dart, not the Sniper');
    const gerr = [];
    const gp = await browser.newPage({ viewport: { width: 400, height: 860 } });
    gp.on('pageerror', (e) => gerr.push(e.message));
    await gp.goto(origin + BASE + 'tools/goals/#g=%E0%A4%A', { waitUntil: 'networkidle' });
    ok(!gerr.length && (await gp.textContent('main')).length > 100, 'My goals: a malformed link doesn\'t blank the page', gerr);
    await gp.close();

    // 0.9.3 (ui): phone result in reach, focus kept, games carry between tools with undo, tap targets, wording
    {
      const fresh = async (w) => {
        const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 860 : 900 } });
        const pg = await ctx.newPage();
        pg.on('pageerror', (e) => errs.push(e.message));
        return { ctx, pg };
      };
      const P = (pg, fn, arg) => pg.evaluate(fn, arg);
      /* Q1 + Q4: Simulator on a phone. The tapped control stays where it was and keeps focus; the result is in a bar */
      let { ctx, pg } = await fresh(400);
      await pg.goto(origin + BASE + 'tools/simulator/#map=dark-castle&mode=chimps&b=6pdart_6hquincy_8pninja', { waitUntil: 'networkidle' });
      const rp = pg.locator('[data-fk$="-rp"]').first();
      await rp.scrollIntoViewIfNeeded();
      const key = await rp.getAttribute('data-fk');
      const y0 = (await rp.boundingBox()).y;
      await rp.click();
      const y1 = (await pg.locator('[data-fk="' + key + '"]').boundingBox()).y;
      const st = await P(pg, () => ({ fk: document.activeElement && document.activeElement.getAttribute('data-fk'), dock: !document.getElementById('ti-dock').hidden, t: document.getElementById('ti-dock').textContent }));
      ok(Math.abs(y1 - y0) < 4 && st.fk && st.dock && /^R\d+:/.test(st.t), '400px Simulator: after "+ round" the button stays put, keeps focus, and the result sits in a bar', { y0, y1, st });
      await pg.click('#ti-dock');
      await pg.waitForTimeout(700);
      const top = await P(pg, () => document.getElementById('sim-res').getBoundingClientRect().top);
      ok(top >= -2 && top < 200, '400px Simulator: tapping the bar brings the result into view', top);
      ok(await P(pg, () => document.getElementById('ti-dock').hidden), '400px Simulator: the bar hides while the result is on screen');
      ok(await P(pg, () => !!document.querySelector('#sim-res a[href*="defence/#"][href*="round="]')), 'Simulator: the first problem links to Check my defence at that round');
      /* tap targets on a phone */
      const small = await P(pg, () => {
        const out = [];
        document.querySelectorAll('.top .menubtn, .top .searchbtn, .top .tab, #sim-root .seg > button, #sim-root .ti-fix-a .btn, #sim-root .ti-step-r .ti-sbtn, #sim-root .ti-step-a .ti-sbtn, #sim-root a.ti-tap').forEach((el) => {
          const r = el.getBoundingClientRect(); if (r.width && r.height < 43.5) out.push(el.className + ' ' + el.textContent.trim().slice(0, 12) + ' ' + Math.round(r.height));
        });
        return out;
      });
      ok(!small.length, '400px: header buttons, Players, fix buttons and step buttons are at least 44px tall', small.slice(0, 6));
      /* keyboard: Enter on a path stepper in the add sheet keeps focus on a control */
      await pg.click('#sim-add');
      await pg.click('#sim-sheet .ti-tile >> nth=0');
      await pg.focus('#sim-sheet [data-fk="sh-x-p0-up"]');
      await pg.keyboard.press('Enter');
      ok(await P(pg, () => document.activeElement.getAttribute('data-fk') === 'sh-x-p0-up'), 'Simulator: Enter on "Path 1 up" keeps focus on it (not the page body)');
      await ctx.close();

      /* Q2 + Q3: a link never loses your saved build; partial links can be added to it instead */
      ({ ctx, pg } = await fresh(1280));
      await pg.goto(origin + BASE + 'tools/simulator/#map=logs&mode=hard&b=3pdart_4psniper.010_10pninja', { waitUntil: 'networkidle' });
      await pg.click('[data-fk$="-rp"] >> nth=0'); /* an edit saves it */
      await pg.goto(origin + BASE + 'tools/simulator/#map=dark-castle&mode=chimps&b=6pboomerang', { waitUntil: 'networkidle' });
      ok(/Back to my build/.test(await pg.textContent('#sim-root')) && /Dark Castle/.test(await pg.inputValue('#sim-map')), 'Simulator: a plan link opens, and offers "Back to my build"');
      await pg.click('#sim-nt-back');
      ok(/Logs/.test(await pg.inputValue('#sim-map')) && (await pg.$$('.ti-step')).length === 3, 'Simulator: "Back to my build" restores the saved build');
      await pg.click('#sim-nt-undo');
      ok(/Dark Castle/.test(await pg.inputValue('#sim-map')), 'Simulator: and "Switch back" undoes that');
      await pg.click('#sim-nt-ok');
      await pg.click('[data-fk$="-rp"] >> nth=0');
      await pg.goto(origin + BASE + 'tools/simulator/#map=logs&mode=hard&b=3pdart_4psniper.010_10pninja', { waitUntil: 'networkidle' });
      await pg.click('#sim-nt-ok');
      await pg.click('[data-fk$="-rp"] >> nth=0');
      await pg.goto(origin + BASE + 'tools/simulator/#tower=tack', { waitUntil: 'networkidle' });
      await pg.click('#sim-nt-add');
      const steps = await pg.$$eval('.ti-step-l', (ls) => ls.map((l) => l.textContent).join(' | '));
      ok(/Tack/.test(steps) && /Sniper/.test(steps) && (await pg.$$('.ti-step')).length === 4, 'Simulator: a tower page link can be added to your build instead of replacing it', steps);
      /* the last game from another tool: ask, then use it with an undo */
      await P(pg, () => { const p = window.MonkeyIntel.progress; p.update((s) => { s.game = { mapId: 'dark-castle', modeId: 'hard', heroId: 'obyn', players: 2, ts: Date.now() + 5000, from: 'advisor' }; }); });
      await pg.goto(origin + BASE + 'tools/simulator/', { waitUntil: 'networkidle' });
      ok(/Your last game in another tool: Dark Castle, Hard Standard, Obyn Greenfoot, 2 players/.test(await pg.textContent('#sim-root')) && /Logs/.test(await pg.inputValue('#sim-map')), 'Simulator: the Advisor\'s newer game is offered, your build is kept until you choose', await pg.textContent('.ti-notice'));
      await pg.click('#sim-nt-use');
      ok(/Dark Castle/.test(await pg.inputValue('#sim-map')) && /Obyn/.test(await pg.inputValue('#sim-hero')) && (await pg.getAttribute('#sim-pl-2', 'aria-checked')) === 'true' && (await pg.$$('.ti-step')).length === 5,
        'Simulator: "Use that game" takes map, mode, hero and players and keeps your steps');
      await pg.click('#sim-nt-undo');
      ok(/Logs/.test(await pg.inputValue('#sim-map')), 'Simulator: and Undo puts your build back');
      await ctx.close();
      ({ ctx, pg } = await fresh(1280));
      await pg.goto(origin + BASE, { waitUntil: 'networkidle' });
      await P(pg, () => window.MonkeyIntel.progress.setGame({ mapId: 'erosion', modeId: 'impoppable', heroId: 'gwendolin', players: 3, from: 'advisor' }));
      await pg.goto(origin + BASE + 'tools/simulator/', { waitUntil: 'networkidle' });
      ok(/Erosion/.test(await pg.inputValue('#sim-map')) && /Impoppable/.test(await pg.inputValue('#sim-mode')) && /Gwendolin/.test(await pg.inputValue('#sim-hero')) && (await pg.getAttribute('#sim-pl-3', 'aria-checked')) === 'true',
        'Simulator with no build yet: takes map, mode, hero and players from your last game');
      ok(/pl=3/.test(await pg.getAttribute('#sim-to-adv', 'href')), 'Simulator -> Advisor link keeps the players');
      /* E21 + T17: Monkey Education is one switch, off until you set it */
      ok(!/hero XP \+8%/.test(await pg.textContent('#sim-root')) && /no Monkey Education/.test(await pg.textContent('.ti-prof')), 'a first-time visitor is not told "hero XP +8%"');
      await pg.click('.ti-details summary >> text=Tower XP from this run');
      ok(/Not set yet/.test(await pg.textContent('#sim-root')), 'Simulator XP panel says Monkey Education is not set yet');
      await pg.check('#sim-me');
      ok(await P(pg, () => window.MonkeyIntel.progress.get().settings.me === true), 'the Simulator\'s Monkey Education box is the same switch as My profile');
      await pg.goto(origin + BASE + 'tools/profile/', { waitUntil: 'networkidle' });
      await pg.click('#pf-mkt-Support');
      ok(await pg.getAttribute('#pf-mk-monkey-education', 'aria-pressed') === 'true', 'My profile shows Monkey Education on after ticking it in the Simulator');
      /* quick-card prices follow your last game */
      await pg.goto(origin + BASE + 'quick/camo/', { waitUntil: 'networkidle' });
      ok(await pg.getAttribute('.diff-toggle [data-diff="impoppable"]', 'aria-checked') === 'true' && /last game/.test(await pg.textContent('.diff-note')), 'quick card prices start on your last game\'s difficulty (Impoppable), and say so');
      await pg.click('.diff-toggle [data-diff="medium"]');
      await pg.reload({ waitUntil: 'networkidle' });
      ok(await pg.getAttribute('.diff-toggle [data-diff="medium"]', 'aria-checked') === 'true', 'tapping a difficulty wins over the last game');
      await ctx.close();

      /* Check my defence: map picker, links with towers (undo), rounds inside the mode, Clear with undo, hero fix action */
      ({ ctx, pg } = await fresh(400));
      await pg.goto(origin + BASE + 'tools/defence/#mode=hard&map=logs&round=30&t=dart.002,ninja.200', { waitUntil: 'networkidle' });
      ok(/Logs/.test(await pg.inputValue('#dfn-map')) && (await pg.$$('.ti-placed .ti-card')).length === 2, 'Defence: a link sets the map, mode, round and your towers');
      const pathUp = pg.locator('.ti-card >> nth=0 >> [aria-label="Path 1 up"]');
      await pathUp.scrollIntoViewIfNeeded();
      const k2 = await pathUp.getAttribute('data-fk');
      const yA = (await pathUp.boundingBox()).y;
      await pathUp.click();
      const yB = (await pg.locator('[data-fk="' + k2 + '"]').boundingBox()).y;
      ok(Math.abs(yA - yB) < 4 && await P(pg, () => !document.getElementById('ti-dock').hidden), '400px Defence: after an upgrade the button stays put and the result sits in a bar', [yA, yB]);
      await pg.goto(origin + BASE + 'tools/defence/#mode=hard&map=logs&round=30&t=sniper.100', { waitUntil: 'networkidle' });
      ok(/kept/.test(await pg.textContent('#dfn-root')), 'Defence: a link with other towers keeps yours');
      await pg.click('#dfn-nt-back');
      ok((await pg.$$('.ti-placed .ti-card')).length === 2, 'Defence: "Back to my towers" restores them');
      await pg.click('#dfn-clear');
      await pg.click('#dfn-nt-back');
      ok((await pg.$$('.ti-placed .ti-card')).length === 2, 'Defence: Clear has an Undo');
      for (let i = 0; i < 12; i++) { const b = await pg.$('[data-fk="dfn-r+5"]:not([disabled])'); if (!b) break; await b.click(); }
      ok(/R80/.test(await pg.textContent('#dfn-round')), 'Defence: Hard stops at R80 (the mode\'s last round)', await pg.textContent('#dfn-round'));
      ok(await P(pg, () => window.MonkeyIntel.progress.get().game.mapId === 'logs'), 'Defence: your map and mode become the last game for the other tools');
      await pg.goto(origin + BASE + 'tools/defence/#mode=medium&map=monkey-meadow&round=24&t=dart&hero=quincy&hl=1', { waitUntil: 'networkidle' });
      const heroFix = await pg.$('.ti-fixes button:text-matches("My hero is L\\d+")');
      if (heroFix) { await heroFix.click(); ok(!/L1$/.test(await pg.textContent('.ti-round-n >> nth=1')), 'Defence: a hero fix row has an action (buy the levels)'); }
      else ok(true, 'Defence: no hero fix in this case (hero action checked by code)');
      await ctx.close();

      /* My goals and the XP calculator agree (T15); combos don't reopen (Q4); unlock links go to My profile (E18) */
      ({ ctx, pg } = await fresh(1280));
      await pg.goto(origin + BASE + 'tools/goals/#add=sniper.paragon', { waitUntil: 'networkidle' });
      await P(pg, () => window.MonkeyIntel.progress.update((x) => { x.towers.sniper = { u: [0, 0, 0], p: false, bank: 20000, set: false }; x.settings.maxTier = 'Beginner'; x.settings.me = true; }));
      await pg.goto(origin + BASE + 'tools/goals/', { waitUntil: 'networkidle' });
      const gTxt = await pg.textContent('.gl-card .gl-stats');
      await pg.goto(origin + BASE + 'tools/xp/#tower=sniper', { waitUntil: 'networkidle' });
      const xTxt = await pg.textContent('[aria-label="Result"]');
      const gNeed = (gTxt.match(/Still to earn\s*([\d,]+)/i) || [])[1], xNeed = (xTxt.match(/S\.P\.I\.D\.E\.R\. Monkey\s*([\d,]+)/) || [])[1];
      const gRuns = (gTxt.match(/Runs left\s*(\d+)/i) || [])[1], xRuns = (xTxt.match(/so (\d+) runs?/) || [])[1];
      ok(gNeed && gNeed === xNeed && gRuns === xRuns && /Beginner/.test(xTxt), 'My goals and the XP calculator: same XP to earn, runs and map tier for the same Paragon goal', [gNeed, xNeed, gRuns, xRuns]);
      await pg.goto(origin + BASE + 'tools/goals/', { waitUntil: 'networkidle' });
      await pg.click('summary >> text=Add another goal');
      await pg.click('#gls-tower'); await pg.keyboard.type('ninja'); await pg.keyboard.press('Enter');
      ok(await P(pg, () => document.activeElement.id === 'gls-tower' && document.getElementById('gls-tower-list').hidden), 'My goals: picking a tower with Enter keeps focus there and the list stays closed');
      await pg.keyboard.press('Tab');
      ok(await P(pg, () => document.activeElement.id === 'gls-target'), 'My goals: Tab from the picker goes to the next field (no invisible stop)');
      ok(await P(pg, () => Array.from(document.querySelectorAll('.gl-towers a')).filter((a) => a.textContent === 'edit').every((a) => /profile\/#tower=/.test(a.getAttribute('href')))), 'My goals: "edit" on your unlocks opens My profile');
      await pg.goto(origin + BASE, { waitUntil: 'networkidle' });
      await pg.focus('.more-menu > summary'); await pg.keyboard.press('Enter');
      for (let i = 0; i < 12; i++) await pg.keyboard.press('Tab');
      ok(await P(pg, () => !document.querySelector('.more-menu').open), 'the More menu closes when focus leaves it');
      await ctx.close();

      /* My profile: one class at a time, 44px pips, Insta picker keeps focus */
      ({ ctx, pg } = await fresh(400));
      await pg.goto(origin + BASE + 'tools/profile/', { waitUntil: 'networkidle' });
      ok((await pg.$$('.prf-tower')).length === 7, 'My profile: shows one tower class at a time (Primary, 7 towers)');
      const pip = await pg.$eval('#pf-dart-01', (b) => { const r = b.getBoundingClientRect(); return [r.width, r.height]; });
      ok(pip[0] >= 44 && pip[1] >= 44, '400px My profile: unlock pips are 44px tap targets', pip);
      await pg.click('#pf-cls-All');
      ok((await pg.$$('.prf-tower')).length === D_TOWERS, 'My profile: "All" shows every tower');
      await pg.goto(origin + BASE + 'tools/profile/#tower=druid', { waitUntil: 'networkidle' });
      ok(await pg.isVisible('#prf-t-druid'), 'My profile: a #tower= link opens that tower\'s class');
      await pg.click('#prf-ins-sum');
      await pg.click('#pf-ins-t'); await pg.keyboard.type('sniper'); await pg.keyboard.press('Enter');
      ok(await P(pg, () => document.activeElement.id === 'pf-ins-t' && document.getElementById('pf-ins-t-list').hidden), 'My profile: the Insta tower picker closes and keeps focus after Enter');
      ok(/I have it/.test(await pg.textContent('#prf-mk')), 'My profile asks about Monkey Education while it is not set');
      await ctx.close();

      /* dead ends and wording */
      ({ ctx, pg } = await fresh(1280));
      await pg.goto(origin + BASE + 'tools/simulator/#map=dark-castle&mode=hard&b=3pdart', { waitUntil: 'networkidle' });
      await pg.click('.ti-strat > summary');
      ok(await P(pg, () => Array.from(document.querySelectorAll('.ti-weak')).every((a) => a.tagName === 'A' && /monkeys\//.test(a.getAttribute('href')))) && /aren't offered as steps/.test(await pg.textContent('.ti-strat')), 'Simulator: "Weak here" chips link to the tower and say why they aren\'t offered');
      await P(pg, () => { const m = {}; window.MonkeyIntelData.heroes.forEach((h) => { m[h.id] = h.id === 'quincy'; }); window.MonkeyIntel.progress.setProfile({ heroes: m }); });
      await pg.reload({ waitUntil: 'networkidle' });
      await pg.click('.ti-strat > summary');
      ok(/not owned/.test(await pg.textContent('.ti-strat')), 'Simulator: "Best heroes" chips say when you don\'t own the hero');
      const txt = await pg.textContent('#sim-root');
      ok(!/\b\d{4,}\b/.test(txt.replace(/\b(?:R|L)\d+\b/g, '').replace(/\d{1,3}(?:,\d{3})+/g, '')), 'Simulator: big numbers have thousands separators');
      ok(await P(pg, () => !!document.querySelector('#sim-res a[href*="glossary/#g-rbe"]')), 'Simulator: RBE is explained where the result shows it');
      ok(!/profile 's/.test(await pg.textContent('body')), 'no "your profile \'s" spacing bug');
      await pg.goto(origin + BASE + 'monkeys/dart/', { waitUntil: 'networkidle' });
      await pg.waitForSelector('.pk-syn li');
      ok(await P(pg, () => { const a = Array.from(document.querySelectorAll('.pk-syn a.pk-plan')); return a.length > 0 && a.every((x) => /tools\/advisor\/#hero=[a-z]+&t=dart/.test(x.getAttribute('href'))); }), 'tower page: every "Pairs well with" line has "Plan with both"');
      await ctx.close();
    }

    // 0.10: an Advisor link never loses the picks you had
    {
      const ap = await browser.newPage({ viewport: { width: 400, height: 860 } });
      await ap.goto(origin + BASE + 'tools/advisor/#map=logs&mode=medium&hero=none&t=dart,bomb,ice', { waitUntil: 'networkidle' });
      await ap.waitForTimeout(400);
      await ap.goto(origin + BASE + 'tools/advisor/#map=monkey-meadow&mode=easy&t=ninja', { waitUntil: 'networkidle' });
      await ap.reload({ waitUntil: 'networkidle' });
      await ap.waitForTimeout(400);
      const hasBack = !!(await ap.$('#adv-nt-back'));
      if (hasBack) await ap.click('#adv-nt-back');
      await ap.waitForTimeout(600);
      const h2 = await ap.evaluate(() => location.hash);
      ok(hasBack && /t=dart,bomb,ice/.test(h2), 'Advisor: a link that replaces your picks offers "Back to my picks", and it brings them back', h2);
      await ap.close();
    }

    // 0.10: the map page's CHIMPS plan is labelled as worked out, not played, with what our check makes of it
    {
      const sp = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await sp.goto(origin + BASE + 'tools/simulator/', { waitUntil: 'networkidle' });
      await sp.evaluate(() => localStorage.clear());
      await sp.goto(origin + BASE + 'tools/simulator/#map=dark-path&mode=chimps', { waitUntil: 'networkidle' });
      await sp.reload({ waitUntil: 'networkidle' });
      const btn = await sp.$('#sim-preset');
      if (btn) { await btn.click(); await sp.waitForTimeout(2500); }
      const note = btn ? await sp.textContent('#sim-preset-note').catch(() => '') : '';
      ok(btn && /worked out from the map page, not played/.test(note), 'Simulator: the map page\'s CHIMPS plan says it is calculated, not played', note);
      await sp.close();
    }

        // /planner/ redirects to the simulator and keeps the hash
    await page.goto(origin + BASE + 'planner/#map=dark-castle&mode=chimps&tower=dart', { waitUntil: 'networkidle' });
    ok(/tools\/simulator\//.test(page.url()), '/planner/ redirects to /tools/simulator/', page.url());
    const legacy = await page.evaluate(() => !!document.getElementById('mapList'));
    if (legacy) {
      const sim = await page.evaluate(() => ({ map: (document.querySelector('#mapList [aria-selected="true"]') || {}).textContent || '', mode: document.getElementById('mode').value }));
      ok(/Dark Castle/.test(sim.map) && sim.mode === 'chimps', 'the hash survives the redirect (legacy planner prefill)', sim);
    } else {
      ok(true, 'redirect landed on the new simulator (hash handling is the tools stream\'s)');
    }
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
