/* Tests for the Bloons Planner logic, run against the BUILT page:
   node test_logic.js            -> logic + data checks
   node test_logic.js --browser [--shots] -> also loads the page in Chromium (playwright), checks the console, takes screenshots */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = path.join(__dirname, 'btd6-planner.html');
const html = fs.readFileSync(HTML, 'utf8');

function block(re, what) {
  const m = html.match(re);
  if (!m) throw new Error('could not find ' + what + ' in the built page');
  return m[1];
}
const data = JSON.parse(block(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/, 'data block'));
const logicSrc = block(/<script id="logic">([\s\S]*?)<\/script>/, 'logic block');
const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(logicSrc, ctx, { filename: 'logic(inlined)' });
const L = ctx.BTD;

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
}
const mode = (id) => data.modes.find((m) => m.id === id);
const map = (id) => data.maps.find((m) => m.id === id);

console.log('XP');
const defl = mode('deflation');
ok(L.baseXpRange(31, 60) === 45950, 'Deflation base XP R31-60 = 45,950', L.baseXpRange(31, 60));
ok(Math.round(L.xpPerRunMono(defl, 'Expert', {})) === 59735, 'Expert Deflation XP per run = 59,735', L.xpPerRunMono(defl, 'Expert', {}));
ok(Math.round(L.xpPerRunMono(defl, 'Expert', { me: true, emt: true, military: true })) === 67739, 'with ME + EMT (Military) = 67,739 (matches tower-guides Sniper farm)', L.xpPerRunMono(defl, 'Expert', { me: true, emt: true, military: true }));
ok(L.baseXpRange(3, 80) === 126150 && L.baseXpRange(6, 100) === 231150 && L.baseXpRange(1, 40) === 21400, 'Hard / Impoppable / Easy base totals match chapter 03 table');
ok(data.modes.every((m) => L.isSandbox(m) || m.xpBaseTotal == null || L.baseXpRange(...L.modeRange(m)) === m.xpBaseTotal), 'formula matches modes.json xpBaseTotal for every non-sandbox mode');
const std = data.rounds.standard;
ok(std.every((r) => r.xp == null || r.xp === L.roundXp(r.round)), 'formula matches rounds.json xp for all 140 standard rounds');
ok(L.roundXp(1) === 40 && L.roundXp(20) === 420 && L.roundXp(30) === 820 && L.roundXp(50) === 1620 && L.roundXp(60) === 2520 && L.roundXp(100) === 6120, 'round XP spot values');
ok(L.xpPerRunMono(mode('chimps'), 'Expert', { me: true }) === L.xpPerRunMono(mode('chimps'), 'Expert', {}), 'CHIMPS ignores Monkey Education (MK off)');
ok(L.xpPerRunMono(mode('sandbox-easy'), 'Expert', {}) === 0, 'Sandbox gives 0 XP');

console.log('Prices');
ok(L.price(200, 0.85) === 170 && L.price(200, 1.08) === 215 && L.price(200, 1.2) === 240, 'Dart $200 -> 170 / 215 / 240');
ok(L.price(540, 0.85) === 460 && L.price(540, 1.08) === 585 && L.price(540, 1.2) === 650, 'Quincy $540 -> 460 / 585 / 650');
ok(L.price(350, 1.08) === 380, 'Sniper place on Hard: 350 x 1.08 = 378 -> $380');
ok(L.price(4100, 1.08) === 4430, 'Full Auto Rifle on Hard: 4,428 -> $4,430 (matches Infernal CHIMPS plan)');
ok(L.price(250, 1.08) === 270, 'Night Vision Goggles on Hard: 270 (exact)');
ok(L.price(350, 0.85) === 295, 'tie rounds down: 350 x 0.85 = 297.50 -> $295');
ok(L.price(450, 0.85) === 380, 'tie rounds down: 450 x 0.85 = 382.50 -> $380');
ok(L.price(310, 1.08) === 335, '310 x 1.08 = 334.80 -> $335');
const sniper = L.towerById(data, 'sniper');
ok(L.towerCost(sniper, [0, 2, 4], 1.08) === 9450, 'Sniper 0-2-4 on Hard totals $9,450 (Infernal CHIMPS plan R90 line)', L.towerCost(sniper, [0, 2, 4], 1.08));
ok(L.towerCost(sniper, [0, 3, 2], 1.08) === 4375, 'Sniper 0-3-2 on Hard totals $4,375 (Infernal CHIMPS plan R93 line)', L.towerCost(sniper, [0, 3, 2], 1.08));

console.log('Crosspaths');
ok(L.validCross([2, 0, 4]) && !L.validCross([3, 0, 3]) && !L.validCross([1, 1, 1]) && !L.validCross([6, 0, 0]), 'validCross rules');
ok(JSON.stringify(L.setPath([2, 0, 4], 0, 3)) === '[3,0,2]', 'raising a second path above 2 caps the other at 2', L.setPath([2, 0, 4], 0, 3));
ok(JSON.stringify(L.setPath([2, 0, 4], 1, 1)) === '[0,1,4]', 'a third path drops the smaller other path', L.setPath([2, 0, 4], 1, 1));

console.log('Example setup: Infernal, Deflation, Sniper 2-0-4 x2 + Mortar 0-0-3, Sauda');
const picks = [{ id: 'sniper', cross: [2, 0, 4], count: 2 }, { id: 'mortar', cross: [0, 0, 3], count: 1 }];
const build = L.buildOrder(data, picks, 'sauda', defl, 'mono');
ok(build.unaffordable.length === 0, 'whole build fits in $20,000', build.totalWanted);
ok(build.rows.every((r) => r.round === 31), 'everything is bought on R31 (Deflation)');
ok(build.endAvail === 20000, 'Deflation cash stays at $20,000');
const cov = L.coverage(data, picks, defl, build.ready);
const c = Object.fromEntries(cov.map((r) => [r.prop, r]));
console.log('    ' + cov.map((r) => r.prop + ':' + r.status + '@' + r.firstRound + ' [' + r.by + (r.note ? ' / ' + r.note : '') + ']').join('\n    '));
ok(c.camo.status === 'covered' && /Mortar/.test(c.camo.by) && c.camo.firstRound === 33, 'camo needed R33, covered by Mortar 0-0-3 (Increased Accuracy)');
ok(c.lead.status === 'covered' && c.lead.firstRound === 37, 'lead needed R37, covered', c.lead);
ok(c.purple.status === 'covered' && c.purple.firstRound === 32, 'purple needed R32, covered', c.purple);
ok(c.moab.status === 'covered' && /Sniper/.test(c.moab.by) && c.moab.firstRound === 40, 'MOAB needed R40, covered by Sniper 2-0-4 (Full Auto Rifle)', c.moab);
ok(c.fortified.firstRound === 45 && c.fortified.status === 'partial', 'fortified needed R45, partial (raw damage, no fortified bonus)', c.fortified);
ok(c.ddt.status === 'na' && c.bad.status === 'na', 'DDT and BAD not in R31-60');

const xp = L.xpProjection(data, defl, map('infernal'), build, { me: true, emt: false });
ok(Math.abs(xp.total - 59735 * 1.08) < 1e-6, 'run total = 59,735 x 1.08 = 64,513.8', xp.total);
const sn = xp.perTower.sniper, mo = xp.perTower.mortar;
ok(sn && mo && Math.abs(sn.xp + mo.xp - xp.total) < 1e-6, 'tower shares add up to the run total');
ok(sn.share > 0.85 && sn.share < 0.95, 'Sniper takes ~90% of the cash', sn.share);
const plan = L.levelPlan(data, 'sniper', 0, sn.xp);
ok(plan.paragon && plan.paragon.total === 145200 + 750000, 'Sniper Paragon needs 895,200 XP from zero', plan.paragon && plan.paragon.total);
ok(plan.next && plan.next.name === 'Full Metal Jacket', 'cheapest first unlock from zero is Full Metal Jacket (120 XP)', plan.next);
console.log('    Sniper: ' + Math.round(sn.xp) + ' XP/run (' + (sn.share * 100).toFixed(1) + '%), runs to all T5s ' + plan.allT5.runs.toFixed(2) + ', to Paragon ' + plan.paragon.runs.toFixed(2));
ok(L.levelPlan(data, 'glue', 0, 1000).paragon === null, 'no Paragon row for Glue Gunner');

console.log('Other modes');
const half = L.cashCurve(data, mode('half-cash'));
const hard = L.cashCurve(data, mode('hard'));
ok(Math.abs((L.availAt(half, 81) - 325) * 2 - (L.availAt(hard, 81) - 650)) < 1e-6, 'Half Cash earns exactly half of Hard');
ok(Math.abs(L.availAt(L.cashCurve(data, mode('chimps')), 40) - 16250) < 1e-6, 'CHIMPS cash at start of R40 = $16,250 (matches Infernal plan)');
const leg = L.legality(data, [{ id: 'farm', cross: [2, 0, 0], count: 1 }, { id: 'sub', cross: [0, 0, 0], count: 1 }], mode('chimps'), map('alpine-run'));
ok(leg.some((x) => x.level === 'crit' && /Farm/.test(x.text)) && leg.some((x) => x.level === 'crit' && /water/.test(x.text)), 'CHIMPS bans farms; Sub on a no-water map is flagged');
ok(L.legality(data, [{ id: 'sniper', cross: [0, 0, 0], count: 1 }], mode('primary-only'), map('infernal')).some((x) => x.level === 'crit'), 'Primary Only rejects Sniper');
ok(L.legality(data, [{ id: 'wizard', cross: [0, 0, 0], count: 1 }], mode('magic-monkeys-only'), map('infernal')).every((x) => x.level !== 'crit'), 'Magic Monkeys Only accepts Wizard');
const abrCov = L.coverage(data, picks, mode('abr'), null);
ok(abrCov.find((r) => r.prop === 'camo').firstRound === 5, 'ABR uses its own round set (camo from R5)');

console.log('Index evidence (round 3, btd6index.win v57.4)');
const evI = L.indexEvidence(data, map('infernal'), [{ id: 'sniper', cross: [0, 5, 2], count: 1 }, { id: 'alchemist', cross: [5, 0, 0], count: 1 }, { id: 'beast', cross: [0, 0, 5], count: 1 }], 'geraldo');
const evSn = evI.towers.find((t) => t.id === 'sniper');
ok(evSn.proven && evSn.entities.indexOf('Elite Sniper') >= 0 && evSn.entities.indexOf('Elite Defender') >= 0, 'Infernal: Sniper shows solo-CHIMPS proven (Elite Sniper and Elite Defender)', evSn.entities);
ok(evI.listState === 'complete' && !evI.towers.find((t) => t.id === 'alchemist').proven, 'Infernal: Alchemist has no 2MP entry on a complete list');
ok(evI.towers.find((t) => t.id === 'beast').proven, 'Pouākai (macron) matches through name normalisation', evI.towers.find((t) => t.id === 'beast').entities);
ok(evI.hero && evI.hero.proven, 'Geraldo is 2MP-proven on Infernal (hero matched by name)');
ok(evI.lanes.length === 2 && evI.lanes.every((l) => l.rbs === 19.3) && evI.los === false && evI.water === true && evI.entrances === 2 && evI.exits === 2, 'Infernal Index facts: 19.3 RBS per lane, no LoS, water, 2 entrances / 2 exits', evI);
ok(evI.lcc && evI.lcc.money === 58995 && evI.lcc.version === '51.2', 'Infernal LCC record $58,995 (v51.2)', evI.lcc);
const expert = data.maps.filter((m) => m.difficulty === 'Expert' && m.indexLength).sort((a, b) => b.trackLength - a.trackLength);
ok(expert[0].id === 'infernal' && expert[1].id === 'glacial-trail' && expert[1].trackLength === 17.7, 'Infernal is the longest Expert map; Glacial Trail next at 17.7', expert.slice(0, 2).map((m) => m.id + ' ' + m.trackLength));
const evG = L.indexEvidence(data, map('geared'), [{ id: 'sub', cross: [0, 0, 0], count: 1 }], null);
ok(evG.water === false && evG.flags.some((f) => f.level === 'crit' && /water/.test(f.text)), 'no-water map (Geared) flags Monkey Sub in the Index block', evG.flags);
ok(L.legality(data, [{ id: 'sub', cross: [0, 0, 0], count: 1 }], mode('hard'), map('geared')).some((x) => x.level === 'crit' && /water/.test(x.text)), 'legality also flags Sub on Geared');
const evA = L.indexEvidence(data, map('alpine-run'), [{ id: 'sniper', cross: [0, 0, 0], count: 1 }], 'quincy');
ok(evA.listState === 'none' && !evA.towers[0].proven && !evA.hero.proven, 'map with no captured 2MP names never claims proof');
ok(L.indexNamesForTower(L.towerById(data, 'wizard')).necromancer && !L.indexNamesForTower(L.towerById(data, 'sniper'))['night vision goggles'], 'tier 3-5 names only (+ "Necromancer" short form); tier 1-2 names excluded');
ok(data.maps.every((m) => m.twoMP && Array.isArray(m.twoMP.entities) && typeof m.indexWater === 'boolean'), 'all 90 maps carry Index fields in the built page');

console.log('No errors across every map x mode x playstyle');
let errs = 0, combos = 0;
const allPicks = [{ id: 'sniper', cross: [2, 0, 4], count: 2 }, { id: 'village', cross: [0, 3, 2], count: 1 }, { id: 'farm', cross: [2, 0, 3], count: 2 }, { id: 'skywarden', cross: [0, 2, 3], count: 1 }];
for (const m of data.modes) for (const mp of data.maps) for (const ps of data.economy.playstyles) {
  combos++;
  try {
    const b = L.buildOrder(data, allPicks, 'quincy', m, ps.id);
    L.coverage(data, allPicks, m, b.ready);
    L.legality(data, allPicks, m, mp, 'quincy');
    const x = L.xpProjection(data, m, mp, b, { me: true, emt: true, freeplayTo: 120 });
    Object.keys(x.perTower).forEach((id) => L.levelPlan(data, id, 1000, x.perTower[id].xp));
    L.farmCompare(data, 'sniper', 0.5, { me: true });
    L.incomeRows(data, m); L.dpsRows(data, allPicks); L.mapPlan(data, mp.id, m); L.indexEvidence(data, mp, allPicks, 'quincy');
    if (!isFinite(x.total)) throw new Error('non-finite XP');
  } catch (e) { errs++; if (errs < 4) console.log('    ' + m.id + ' / ' + mp.id + ' / ' + ps.id + ': ' + e.message); }
}
ok(errs === 0, combos + ' combinations ran without throwing', errs);
let towerErr = 0;
for (const t of data.towers) for (const cc of [[5, 2, 0], [0, 5, 2], [2, 0, 5], [0, 0, 0]]) {
  try { L.towerCost(t, cc, 1.2); L.levelPlan(data, t.id, 0, 50000); L.coverage(data, [{ id: t.id, cross: cc, count: 1 }], mode('impoppable')); } catch (e) { towerErr++; }
}
ok(towerErr === 0, 'all 26 towers price, level and cover without throwing');

console.log('\n' + pass + ' passed, ' + fail + ' failed');

async function browser() {
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  const errors = [];
  for (const [w, h, file] of [[1280, 900, 'shot-1280.png'], [400, 860, 'shot-400.png']]) {
    const page = await b.newPage({ viewport: { width: w, height: h } });
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(w + 'px console.' + m.type() + ': ' + m.text()); });
    page.on('pageerror', (e) => errors.push(w + 'px pageerror: ' + e.message));
    await page.goto('file://' + HTML);
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) errors.push(w + 'px: page scrolls sideways by ' + overflow + 'px');
    const txt = await page.evaluate(() => document.getElementById('results').innerText);
    if (/NaN|undefined|\[object/.test(txt)) errors.push(w + 'px: results text contains NaN/undefined');
    if (!(await page.$('#results svg.chart'))) errors.push(w + 'px: cash chart missing');
    if (!(await page.$('#results .ixev .ixchip'))) errors.push(w + 'px: Index evidence block missing');
    if (process.argv.includes('--shots')) await page.screenshot({ path: path.join(__dirname, file), fullPage: false });
    await page.close();
  }
  await b.close();
  console.log(errors.length ? 'Browser problems:\n  ' + errors.join('\n  ') : ('Browser: no console errors, no NaN/undefined, chart present, no horizontal overflow' + (process.argv.includes('--shots') ? '; screenshots written.' : '.')));
  return errors.length;
}

if (process.argv.includes('--browser')) {
  browser().then((n) => process.exit(fail || n ? 1 : 0)).catch((e) => { console.error(e); process.exit(1); });
} else process.exit(fail ? 1 : 0);
