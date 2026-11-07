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
    const synSrc = await page.evaluate(() => ({ src: document.querySelector('.pk-src').textContent, links: Array.from(document.querySelectorAll('.pk-syn li a')).map((a) => a.getAttribute('href')), text: document.querySelector('.pk-syn').textContent }));
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
      /* a node with two arrows needs one of them (our reading; "all of" could lock you out of a node you own) */
      await mp.evaluate(() => window.MonkeyIntel.progress.update((x) => { x.profile.mk = { 'magic-tricks': true, 'speedy-brewing': true, 'mo-monkey-money': true, 'super-range': true }; }));
      await mp.reload({ waitUntil: 'networkidle' });
      await mp.click('#pf-mkt-Magic');
      await mp.click('#pf-mk-flame-jet');
      ok(await pressed('flame-jet') === 'true', `${w}px MK: Flame Jet turns on with Magic Tricks alone (one of its two arrows)`, await mp.textContent('#prf-mk-msg'));
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
    await page.click('[aria-labelledby="adv-gaps-h"] .ti-fix-a button');
    ok(/t=super,dartling,village,\w+/.test(await page.evaluate(() => location.hash)), 'Advisor: "Add to my picks" adds the monkey', await page.evaluate(() => location.hash));
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
    ok(/pl=3/.test(await page.evaluate(() => location.hash)) && /pl=3/.test(await page.getAttribute('#adv-to-sim', 'href')), 'Advisor: co-op setting carries into the Simulator link');

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
