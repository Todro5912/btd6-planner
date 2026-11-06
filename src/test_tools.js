/* Tests for the Monkey Intel tool pages (advisor, simulator, xp, defence) and the synergy engine.
     python3 src/build_tools.py && node src/test_tools.js            logic + data checks
     node src/test_tools.js --browser [--shots]                       also loads each page fragment in a minimal
                                                                       shell in Chromium at 400px and 1280px */
'use strict';
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ASSETS = path.join(HERE, 'pages', 'assets');
global.window = global;
require(path.join(ASSETS, 'tools-data.js'));
const D = global.MonkeyIntelData;
const C = require(path.join(ASSETS, 'advisor-core.js')); /* tools-core plus the Strategy Advisor */
require(path.join(ASSETS, 'map-tips.js'));
const TIPS = global.MonkeyIntelTips;
const { synergy, match } = require(path.join(ASSETS, 'synergy.js'));
const RULES = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'data', 'synergy-rules.json'), 'utf8'));

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
}
const mode = (id) => C.mode(D, id);
let uid = 0;
const place = (r, t, x) => ({ uid: 'p' + (++uid), r, op: 'place', t, x: x || [0, 0, 0] });
const up = (r, ref, x) => ({ uid: 'u' + (++uid), r, op: 'up', ref: ref.uid, x });
const sell = (r, ref) => ({ uid: 's' + (++uid), r, op: 'sell', ref: ref.uid });

console.log('Data bundle');
ok(D.meta.popSource === 'data' && D.heroLevels && D.meta.heroLevelsSource === 'data', 'bundle uses the real data/pop-model.json and data/heroes-levels.json (no fixtures)', D.meta);
ok(D.towers.length === 26 && D.heroes.length >= 18 && D.maps.length === 90, '26 towers, heroes and 90 maps in the bundle');
ok(D.rounds.standard.length === 140 && D.rounds.abr.length === 140, '140 standard and 140 ABR rounds');

console.log('Pop model (contract C1)');
const pm = D.pop;
const checkC1 = (model, label) => {
  const errs = [];
  Object.keys(model.towers || {}).forEach((id) => {
    if (!C.tower(D, id)) errs.push(id + ': unknown tower');
    const e = model.towers[id];
    ['camo', 'lead', 'purple', 'black', 'white', 'moab'].forEach((p) => {
      const v = e[p];
      if (!v || !Array.isArray(v.any)) { errs.push(id + '.' + p + ': no any[]'); return; }
      v.any.forEach((alt) => {
        if (!Array.isArray(alt) || !alt.length) errs.push(id + '.' + p + ': empty alternative');
        else alt.forEach((r) => { if (!(r === 'base' || r === 'never' || (r && r.path >= 0 && r.path <= 2 && ((r.tier >= 1 && r.tier <= 5) || (r.maxTier >= 0 && r.maxTier <= 4))))) errs.push(id + '.' + p + ': bad requirement ' + JSON.stringify(r)); });
      });
    });
    if (!(e.ddt && (e.ddt.derived === true || (e.ddt.derived === false && Array.isArray(e.ddt.any))))) errs.push(id + '.ddt neither derived nor explicit any[]');
  });
  (model.supportFixes || []).forEach((f) => { if (!f.grants || !f.source || !f.req) errs.push('supportFix missing fields ' + JSON.stringify(f)); });
  ok(errs.length === 0, label + ' follows C1 (' + Object.keys(model.towers || {}).length + ' towers, ' + (model.supportFixes || []).length + ' support fixes)', errs.slice(0, 5));
};
checkC1(pm, 'data/pop-model.json');
ok(Object.keys(pm.towers).length === 26 && Object.keys(pm.heroes || {}).length >= 18 && pm.supportFixes.length >= 5, 'pop model covers 26 towers, 18 heroes and support fixes');
ok(!/grants/.test(fs.readFileSync(path.join(ASSETS, 'tools-core.js'), 'utf8').replace(/f\.grants|\.grants\]|grants:|"grants"/g, '')), 'tools-core never reads the old per-upgrade grants tags');

{
  const P = (id, x) => C.towerProps(pm, id, x);
  ok(P('sniper', [1, 1, 0]).camo && P('sniper', [1, 1, 0]).lead && !P('sniper', [0, 0, 0]).lead, 'Sniper: camo at 0-1-0, lead at 1-0-0');
  const s110 = C.coverState(D, [{ uid: 1, id: 'sniper', x: [1, 1, 0], label: 'Sniper' }], null);
  ok(s110.cov.ddt.length === 1 && s110.cov.moab.length === 1, 'Sniper 1-1-0 alone hits DDTs and MOABs (derived DDT)');
  ok(C.coverState(D, [{ uid: 1, id: 'dart', x: [4, 0, 2], label: 'Dart' }], null).cov.ddt.length === 1, 'Dart 4-0-2 hits DDTs');
  ok(C.coverState(D, [{ uid: 1, id: 'dart', x: [0, 0, 0], label: 'Dart' }], null).cov.moab.length === 1, 'Dart 0-0-0 damages MOAB-class');
  const sv = C.coverState(D, [{ uid: 1, id: 'bomb', x: [0, 3, 0], label: 'Bomb' }, { uid: 2, id: 'village', x: [0, 2, 0], label: 'Village' }], null);
  ok(sv.cov.camo.length === 1 && sv.cov.black.length === 0, 'Bomb + Village 0-2-0: radar gives camo; bombs still can\'t pop black');
  const mib = C.coverState(D, [{ uid: 1, id: 'bomb', x: [0, 3, 0], label: 'Bomb' }, { uid: 2, id: 'village', x: [0, 3, 0], label: 'Village' }], null);
  ok(mib.cov.black.length === 1 && mib.cov.ddt.length === 1, 'Bomb + MIB Village: black and DDT covered');
  ok(C.coverState(D, [{ uid: 1, id: 'village', x: [0, 3, 0], label: 'Village' }], null).cov.pop.length === 0, 'a Village alone attacks nothing');
  const acid = C.coverState(D, [{ uid: 1, id: 'dart', x: [0, 0, 2], label: 'Dart' }, { uid: 2, id: 'alchemist', x: [2, 0, 0], label: 'Alch' }], null);
  ok(acid.cov.ddt.length === 1, 'Dart 0-0-2 + Alchemist acid (lead) reaches DDT');
  ok(C.coverState(D, [], { id: 'quincy', level: 4, label: 'Quincy' }).cov.camo.length === 0 && C.coverState(D, [], { id: 'quincy', level: 5, label: 'Quincy' }).cov.camo.length === 1, 'hero levels: Quincy camo from level 5');
  ok(C.coverState(D, [{ uid: 1, id: 'dart', x: [0, 0, 0], label: 'D' }], { id: 'etienne', level: 8, label: 'Etienne' }).cov.camo.length === 2, 'Etienne L8 UAV gives every tower camo');
  /* POP-MODEL.md extensions: maxTier, explicit ddt, conditional = hint only */
  ok(P('tack', [3, 0, 0]).purple && !P('tack', [4, 0, 0]).purple, 'maxTier: Tack 3-0-0 pops Purple, Ring of Fire 4-0-0 does not');
  ok(!P('ice', [2, 0, 0]).ddt && P('ice', [4, 0, 0]).ddt, 'explicit DDT: Ice 2-0-0 can\'t hit DDTs (derived rule would say yes), 4-0-0 can');
  ok(!P('ace', [0, 2, 0]).ddt && P('ace', [5, 2, 0]).ddt, 'explicit DDT: Ace 0-2-0 no, 5-2-0 yes');
  ok(!P('ninja', [0, 0, 3]).ddt && !P('ninja', [0, 0, 4]).ddt, 'explicit DDT: Ninja never alone (Sticky Bomb is a hint only)');
  ok(C.coverState(D, [{ uid: 1, id: 'ninja', x: [0, 0, 0], label: 'N' }, { uid: 2, id: 'village', x: [0, 3, 0], label: 'V' }], null).cov.ddt.length === 1, 'explicit DDT: Ninja inside an MIB Village hits DDTs');
  ok(C.coverState(D, [{ uid: 1, id: 'ace', x: [0, 2, 0], label: 'A' }, { uid: 2, id: 'village', x: [0, 2, 0], label: 'V' }], null).cov.ddt.length === 0, 'explicit DDT: Ace 0-2-0 + Radar still can\'t hit DDTs');
  ok(!P('bomb', [0, 0, 5]).camo && C.conditionalHints(pm, 'bomb', [0, 0, 5], 'camo').length === 1, 'conditional: Bomb Blitz is a hint, not camo coverage');
  ok(C.checkDefence(D, { modeId: 'hard', round: 20, towers: [{ id: 'bomb', x: [0, 0, 5] }], span: 15 }).threats.some((t) => t.prop === 'camo' && t.hints.length === 1), 'defence check: camo still flagged for Bomb 0-0-5, with the Bomb Blitz hint attached');
  const tackFix = C.fixesFor({ D, mode: mode('hard'), map: null, insts: [{ uid: 1, id: 'tack', x: [4, 0, 0], label: 'Tack' }], hero: null }, 'purple', 3);
  ok(tackFix.every((f) => !(f.towerId === 'tack' && f.x[0] >= 4)), 'fixes never suggest a crosspath that breaks a maxTier rule', tackFix);
  ok(C.coverState(D, [{ uid: 1, id: 'dart', x: [0, 0, 0], label: 'D' }], { id: 'obyn', level: 8, label: 'Obyn' }).cov.camo.length === 0, 'Obyn L8 camo only helps Druids and Skywardens');
}

console.log('Cash timeline (rounds.json)');
const chimpsCash = C.baseCash(D, mode('chimps'));
ok(chimpsCash[40] === 16250, 'CHIMPS cash at the start of R40 = $16,250', chimpsCash[40]);
ok(chimpsCash[6] === 650, 'CHIMPS starts with $650 at R6');
const hard = C.baseCash(D, mode('hard')), half = C.baseCash(D, mode('half-cash'));
ok(Math.abs((half[81] - 325) * 2 - (hard[81] - 650)) < 1e-6, 'Half Cash earns exactly half of Hard');
ok(C.baseCash(D, mode('deflation'))[60] === 20000, 'Deflation stays at $20,000');
const r1 = C.simulate(D, { mapId: 'logs', modeId: 'chimps', steps: [] });
ok(r1.rows.length === 95 && r1.rows[0].r === 6 && r1.rows[94].r === 100, 'CHIMPS timeline runs R6 to R100');
ok(Math.abs(r1.rows.find((x) => x.r === 40).avail - 16250) < 1e-6, 'simulator row R40 avail = $16,250 with no buys');
uid = 0;
const s1 = place(6, 'sniper');
const sim2 = C.simulate(D, { mapId: 'logs', modeId: 'chimps', steps: [s1, up(10, s1, [0, 1, 0])] });
ok(sim2.steps[0].cost === 380 && sim2.steps[1].cost === 270, 'Sniper $380 + Night Vision $270 at CHIMPS (Hard) prices', sim2.steps.map((s) => s.cost));
ok(Math.abs(sim2.rows.find((x) => x.r === 40).bank - (16250 - 650)) < 1e-6, 'cash after buys at R40 = $16,250 − $650');
const big = place(6, 'super');
const sim3 = C.simulate(D, { mapId: 'logs', modeId: 'chimps', steps: [big] });
ok(sim3.steps[0].short === C.price(2500, 1.08) - 650 && sim3.steps[0].earliest != null, 'unaffordable step: short by the gap and gives the earliest round', sim3.steps[0]);
const er = sim3.steps[0].earliest;
ok(chimpsCash[er] >= 2700 && chimpsCash[er - 1] < 2700, 'earliest affordable round is the first with $2,700 ($R' + er + ')');

console.log('Selling');
uid = 0;
const d1 = place(1, 'dart');
const sel = C.simulate(D, { mapId: 'monkey-meadow', modeId: 'medium', steps: [d1, up(2, d1, [2, 0, 0]), sell(5, d1)] });
const inv = 200 + 140 + 200;
ok(sel.steps[2].refund === Math.round(inv * 0.7), 'sell refunds 70% of what you spent ($540 -> $378)', sel.steps[2].refund);
ok(Math.abs(sel.rows.find((x) => x.r === 5).bank - (C.baseCash(D, mode('medium'))[5] - inv + 378)) < 1e-6, 'refund lands in the bank on the sell round');
ok(sel.rows.find((x) => x.r === 5).live.length === 0, 'a sold tower stops counting that round');
uid = 0;
const c1 = place(6, 'dart');
const noSell = C.simulate(D, { mapId: 'logs', modeId: 'chimps', steps: [c1, sell(10, c1)] });
ok(noSell.steps[1].refund === 0 && noSell.steps[1].flags.some((f) => /no selling/.test(f.t)), 'CHIMPS: selling is flagged and refunds nothing');

console.log('First uncovered round');
uid = 0;
const dartOnly = C.simulate(D, { mapId: 'logs', modeId: 'chimps', steps: [place(6, 'dart')] });
const probs = dartOnly.problems.map((p) => p.prop + '@' + p.round);
console.log('    Dart-only CHIMPS: ' + probs.join(', '));
ok(dartOnly.first && dartOnly.first.prop === 'camo' && dartOnly.first.round === 24, 'Dart-only CHIMPS: first problem is camo at R24', dartOnly.first);
ok(probs.indexOf('lead@28') >= 0, 'Dart-only CHIMPS: lead flagged at R28');
ok(!dartOnly.problems.some((p) => p.prop === 'moab' || p.prop === 'black' || p.prop === 'fortified'), 'darts hit MOABs and blacks; fortified is never a problem');
const camoFix = dartOnly.first.fixes;
ok(camoFix[0].kind === 'upgrade' && camoFix[0].x.join('') === '002' && camoFix[0].cost === C.price(90, 1.08) + C.price(200, 1.08), 'cheapest camo fix: your Dart to 0-0-2 for $310', camoFix[0]);
ok(camoFix.some((f) => f.kind === 'new'), 'fix list also offers a new tower');
const kinds = camoFix.map((f) => ({ upgrade: 0, new: 1, support: 2, hero: 3 }[f.kind]));
ok(kinds.every((k, i) => i === 0 || k >= kinds[i - 1]), 'fixes ordered: your towers, then new towers, then support');
uid = 0;
const d2 = place(6, 'dart');
const fixed = C.simulate(D, { mapId: 'logs', modeId: 'chimps', steps: [d2, up(20, d2, [0, 0, 2]), place(25, 'bomb')] });
ok(fixed.first && fixed.first.prop === 'ddt' && fixed.first.round === 90, 'adding Dart 0-0-2 and a Bomb moves the first problem to DDT at R90', fixed.first && fixed.first.prop + '@' + fixed.first.round);
uid = 0;
const late = C.simulate(D, { mapId: 'logs', modeId: 'chimps', steps: [place(6, 'dart'), place(30, 'ninja')] });
ok(late.first.prop === 'camo' && late.first.round === 24 && late.first.last < 30, 'a camo answer bought at R30 still leaves R24 flagged, and the span stops before R30');
const empty = C.simulate(D, { mapId: 'monkey-meadow', modeId: 'medium', steps: [] });
ok(empty.problems.length === 1 && empty.first.prop === 'pop' && empty.first.round === 1, 'empty build: one problem, "nothing placed" at R1');
uid = 0;
const bombOnly = C.simulate(D, { mapId: 'logs', modeId: 'chimps', steps: [place(6, 'bomb')] });
const firstBlack = D.rounds.standard.find((r) => r.round >= 6 && /Black|Zebra|Rainbow|Ceramic|Lead/.test(r.composition)).round;
ok(bombOnly.problems.some((p) => p.prop === 'black' && p.round === firstBlack), 'Bomb-only: blacks flagged at R' + firstBlack + ', the first round with blacks (explosions can\'t pop them)', bombOnly.problems.map((p) => p.prop + '@' + p.round));
ok(C.roundNeeds(C.roundRow(D, mode('chimps'), 28)).black, 'lead rounds also need black (leads pop into blacks)');

console.log('Hero level estimate');
ok(C.heroLevelAt(D, 'quincy', 6, 6, 'Beginner') === 1, 'hero is level 1 the round it is placed');
const q20 = C.heroLevelAt(D, 'quincy', 1, 60, 'Beginner');
ok(q20 >= 5 && q20 <= 20 && C.heroLevelAt(D, 'quincy', 1, 100, 'Expert') >= q20, 'Quincy placed at R1 is level ' + q20 + ' by R60 and keeps rising (estimate)');
ok(C.heroLevelAt(D, 'adora', 1, 40, 'Beginner') < C.heroLevelAt(D, 'quincy', 1, 40, 'Beginner'), 'slower heroes (xp ratio 1.71) level up later');
uid = 0;
const hq = C.simulate(D, { mapId: 'logs', modeId: 'chimps', heroLevel: 10, steps: [{ uid: 'h', r: 6, op: 'hero', h: 'quincy' }] });
ok(hq.rows.every((x) => x.heroLevel === 10), 'manual hero level override applies to every round');

console.log('XP calculator');
const sn = C.xpPlan(D, 'sniper', [0, 0, 0], { kind: 'paragon' }, 0);
ok(sn.need === 895200, 'Sniper: 895,200 XP to the Paragon from zero', sn.need);
ok(C.xpPlan(D, 'sniper', [0, 0, 0], { kind: 'all' }, 0).need === 145200, 'Sniper: 145,200 XP to every tier 5');
ok(C.xpPlan(D, 'sniper', [0, 0, 0], { kind: 'upgrade', path: 2, tier: 5 }, 0).need === 130 + 600 + 2750 + 10000 + 30000, 'Sniper: Elite Defender from zero = 43,480');
ok(C.xpPlan(D, 'sniper', [0, 0, 3], { kind: 'upgrade', path: 2, tier: 5 }, 0).need === 40000, 'Sniper with 0-0-3 unlocked: 40,000 to Elite Defender');
ok(C.xpPlan(D, 'glue', [0, 0, 0], { kind: 'paragon' }, 0).noParagon === true, 'Glue Gunner has no Paragon');
const ord = C.xpPlan(D, 'sniper', [0, 0, 0], { kind: 'all' }, 0).steps;
const seen = [0, 0, 0];
let orderOk = true;
ord.forEach((s) => { if (s.tier !== seen[s.path] + 1) orderOk = false; seen[s.path] = s.tier; });
ok(orderOk && ord.length === 15, 'unlock order: 15 steps, each tier straight after the one below it on its path');
ok(ord[0].name === 'Full Metal Jacket' && ord[0].xp === 120, 'cheapest first: Full Metal Jacket (120) is unlocked first');
const dartOrd = C.unlockOrder(C.tower(D, 'dart'), [0, 0, 0]);
ok(dartOrd.findIndex((s) => s.path === 0 && s.tier === 3) > dartOrd.findIndex((s) => s.path === 0 && s.tier === 2), 'Spike-o-pult only after Razor Sharp Shots');
const fromXp = C.unlockedFromXp(C.tower(D, 'sniper'), 1000);
ok(fromXp.unlocked.join('') === '111' && fromXp.unspent === 550, '1,000 total XP on Sniper = 1-1-1 unlocked with 550 unspent (cheapest first)', fromXp);
const farm = C.farmTable(D, 'sniper', { me: false, emt: false, need: 895200 });
const defl = farm.find((r) => r.modeId === 'deflation' && r.tier === 'Expert');
ok(Math.round(defl.xp) === 59735 && defl.runs === 15, 'Expert Deflation = 59,735 XP a run; 15 runs to the Sniper Paragon', defl);
ok(Math.round(C.farmTable(D, 'sniper', { me: true, emt: true }).find((r) => r.modeId === 'deflation' && r.tier === 'Expert').xp) === 67739, 'with ME + EMT: 67,739 (matches tower-guides)');
ok(farm.find((r) => r.modeId === 'chimps').xp === C.farmTable(D, 'sniper', { me: true }).find((r) => r.modeId === 'chimps').xp, 'CHIMPS ignores Monkey Education');
ok(!C.farmTable(D, 'wizard', {}).some((r) => r.modeId === 'military-only' || r.modeId === 'primary-only'), 'class-only modes only list allowed towers');
ok(C.farmPick(farm).modeId === 'deflation', 'best overall for a beginner: Expert Deflation');
let xpErr = 0;
D.towers.forEach((t) => ['all', 'paragon'].forEach((k) => { try { const p = C.xpPlan(D, t.id, [1, 2, 0], { kind: k }, 0); if (!p || !(p.noParagon || isFinite(p.need))) xpErr++; C.farmTable(D, t.id, { need: 1000 }); } catch (e) { xpErr++; } }));
ok(xpErr === 0, 'all 26 towers plan to all tier 5s and Paragon without errors');

console.log('Share links');
uid = 0;
const a1 = place(6, 'sniper'), a2 = place(8, 'dart', [0, 0, 2]);
const planA = { mapId: 'infernal', modeId: 'chimps', heroLevel: 7, steps: [{ uid: 'h1', r: 13, op: 'hero', h: 'geraldo' }, a1, a2, up(10, a1, [0, 1, 0]), sell(50, a2)] };
const enc = C.encodePlan(planA);
ok(enc === 'map=infernal&mode=chimps&b=13hgeraldo_6psniper_8pdart.002_10u1.010_50s2&hl=7', 'compact hash encoding', enc);
const dec = C.decodePlan(D, '#' + enc);
ok(C.encodePlan(dec) === enc, 'decode(encode(plan)) round-trips');
const oldLink = C.decodePlan(D, '#map=infernal&mode=chimps&tower=sniper&hero=quincy');
ok(oldLink.steps.length === 2 && oldLink.steps.some((s) => s.op === 'place' && s.t === 'sniper'), 'old planner links (#tower=, #hero=) still prefill');
ok(C.decodePlan(D, '#map=nope&mode=sandbox-easy&b=6pnotatower_x').steps.length === 0, 'unknown ids and junk tokens are ignored');

console.log('Presets ("known starts")');
const pi = C.presetPlan(D, 'infernal');
const simI = C.simulate(D, pi);
ok(pi && pi.presetSpent === 133760 && simI.spent === 133760, 'Infernal start replays to the map page\'s $133,760 total', simI.spent);
ok(simI.steps.every((s) => !s.short), 'Infernal start is affordable at every step');
ok(Object.keys(D.presets).length >= 5, Object.keys(D.presets).length + ' maps have a parsed known start');
let presetErr = 0;
Object.keys(D.presets).forEach((id) => { const r = C.simulate(D, C.presetPlan(D, id)); if (r.steps.some((s) => s.flags.some((f) => f.k === 'bad'))) presetErr++; });
ok(presetErr === 0, 'every known start replays without bad steps');

console.log('Check my defence');
const dfn = C.checkDefence(D, { modeId: 'hard', round: 20, towers: [{ id: 'dart', x: [0, 0, 0] }, { id: 'bomb', x: [0, 0, 0] }], span: 15 });
ok(dfn.threats.length && dfn.threats[0].prop === 'camo' && dfn.threats[0].round === 24, 'Dart + Bomb at R20 on Hard: camo at R24 is next', dfn.threats.map((t) => t.prop + '@' + t.round));
ok(dfn.threats[0].fixes[0].kind === 'upgrade' && dfn.threats[0].fixes[0].cost === 310, 'cheapest fix uses a tower you own: Dart 0-0-2 for $310 on Hard', dfn.threats[0].fixes[0]);
const dfn2 = C.checkDefence(D, { modeId: 'chimps', round: 85, towers: [{ id: 'sniper', x: [1, 1, 0] }, { id: 'sniper', x: [0, 2, 4] }], span: 15 });
ok(!dfn2.threats.some((t) => t.prop === 'ddt' || t.prop === 'moab'), 'Sniper 1-1-0 covers DDTs at R90 (no false alarm)', dfn2.threats.map((t) => t.prop));
ok(C.checkDefence(D, { modeId: 'chimps', round: 63, towers: [], span: 1 }).threats[0].prop === 'pop', 'no towers: "nothing placed"');
let dErr = 0;
D.modes.filter((m) => !C.isSandbox(m)).forEach((m) => [1, 40, 95, 130].forEach((r) => { try { C.checkDefence(D, { modeId: m.id, round: r, towers: [{ id: 'ninja', x: [4, 0, 1] }, { id: 'heli', x: [0, 2, 3] }], hero: { id: 'psi', level: 9 } }); } catch (e) { dErr++; } }));
ok(dErr === 0, 'defence check runs in every mode and round');

console.log('Synergy engine');
const R = RULES.rules;
ok(R.length >= 40, R.length + ' rules (40+)');
const ids = {};
let ruleErr = [];
R.forEach((r) => {
  if (ids[r.id]) ruleErr.push('dup ' + r.id); ids[r.id] = 1;
  if (!r.why || !r.strength || !Array.isArray(r.sources) || !r.sources.length || !r.when || !r.suggest) ruleErr.push('fields ' + r.id);
  if (['core', 'nice'].indexOf(r.strength) < 0) ruleErr.push('strength ' + r.id);
  if (r.suggest.tower && !C.tower(D, r.suggest.tower)) ruleErr.push('tower ' + r.id);
  if (r.suggest.hero && !C.hero(D, r.suggest.hero)) ruleErr.push('hero ' + r.id);
  if (r.suggest.x && !C.validCross(C.parseCode(r.suggest.x))) ruleErr.push('crosspath ' + r.id);
  JSON.stringify(r.when).replace(/"(?:has|lacks)":"([a-z]+)"/g, (m, t) => { if (!C.tower(D, t)) ruleErr.push('cond tower ' + r.id + ' ' + t); return m; });
});
ok(ruleErr.length === 0, 'every rule has id, when, suggest, why, strength, sources and valid ids/crosspaths', ruleErr);
ok(match([0, 2, 1], '0-2-x') && match([2, 3, 0], 'x-2-x') && !match([0, 1, 0], '0-2-x'), 'crosspath patterns: digits are minimum tiers');
const fire = (placed, ctx) => synergy(placed, Object.assign({ rules: RULES }, ctx)).map((s) => s.id);
ok(fire([{ id: 'dartling', x: [0, 2, 0] }], {}).indexOf('brew-fast-attackers') >= 0, 'Dartling -> Berserker Brew');
ok(fire([{ id: 'sniper', x: [0, 0, 4] }, { id: 'dart', x: [0, 0, 2] }], {}).indexOf('drums-two-attackers') >= 0, 'two attackers -> Jungle Drums');
ok(fire([{ id: 'dart', x: [0, 0, 0] }, { id: 'tack', x: [0, 0, 0] }], { missing: ['lead'] }).indexOf('acid-sharp-lead') >= 0, 'sharp-only + lead missing -> Alchemist 2-0-0');
ok(fire([{ id: 'dart', x: [0, 0, 0] }, { id: 'bomb', x: [0, 0, 0] }], { missing: ['lead'] }).indexOf('acid-sharp-lead') < 0, 'not sharp-only -> no acid rule');
ok(fire([{ id: 'bomb', x: [0, 0, 0] }], {}).indexOf('radar-for-blind-towers') >= 0 && fire([{ id: 'bomb', x: [0, 0, 0] }, { id: 'village', x: [0, 2, 0] }], {}).indexOf('radar-for-blind-towers') < 0, 'Bomb -> Village radar, until you have Village 0-2-x');
ok(fire([{ id: 'sub', x: [0, 0, 0] }], {}).indexOf('brickell-water') >= 0 && fire([{ id: 'sub', x: [0, 0, 0] }], { heroId: 'brickell' }).indexOf('brickell-water') < 0, 'water towers -> Brickell (unless she is your hero)');
ok(fire([{ id: 'farm', x: [2, 0, 0] }], { modeId: 'chimps' }).indexOf('farm-chimps') >= 0, 'farm in CHIMPS -> avoid');
ok(fire([{ id: 'dart', x: [0, 0, 0] }], { modeId: 'chimps', heroId: 'benjamin' }).indexOf('benjamin-chimps') >= 0, 'Benjamin in CHIMPS -> avoid');
ok(fire([{ id: 'sniper', x: [0, 0, 4] }], {}).indexOf('overclock-carry') >= 0, 'tier 4 carry -> Overclock');
ok(fire([{ id: 'dart', x: [0, 0, 0] }], { missing: ['camo'] }).indexOf('etienne-camo') >= 0, 'camo missing, no hero -> Etienne');
const synOut = synergy([{ id: 'ninja', x: '4-0-1' }], { rules: RULES, modeId: 'hard' });
ok(synOut.some((s) => s.id === 'ninja-alch-classic' && s.pairsWith.indexOf('Ninja Monkey') >= 0), 'string crosspaths work and suggestions name the tower they pair with (tower-page use)');
ok(synergy([{ id: 'alchemist', x: [3, 0, 0] }, { id: 'dartling', x: [0, 2, 0] }], { rules: RULES }).every((s) => s.id !== 'brew-fast-attackers'), 'a suggestion drops out once you already have it');

console.log('Strategy Advisor');
{
  const adv = (o) => C.advise(D, Object.assign({ mapId: 'monkey-meadow', modeId: 'medium', heroId: '', towers: [] }, o));
  const r0 = adv({});
  ok(r0.picks.length === 0 && r0.steps.length === 0, 'no picks -> no plan');
  const r1 = adv({ mapId: 'logs', modeId: 'chimps', heroId: 'quincy', towers: ['dart', 'boomerang', 'village', 'alchemist'] });
  ok(r1.picks.length === 4 && r1.picks.every((p) => C.validCross(p.x)), 'every pick gets a legal end crosspath', r1.picks.map((p) => p.x));
  ok(r1.gaps.length === 0, 'Logs CHIMPS Dart/Boomerang/Village/Alch + Quincy: no gaps', r1.gaps.map((g) => g.prop + '@' + g.round));
  ok(r1.sim.steps.every((s) => !s.short && !s.flags.some((f) => f.k === 'bad')), 'every step of the order is affordable and legal in the simulator', r1.sim.steps.filter((s) => s.flags.length));
  ok(r1.spent <= r1.budget + 1 && r1.spent > r1.budget * 0.5, 'CHIMPS plan spends most of the budget without going over', [r1.spent, r1.budget]);
  ok(r1.steps[0].r === 6 && r1.steps[0].op === 'place', 'first buy is a tower on the first round (R6)', r1.steps[0]);
  const lead = r1.sim.rows.find((x) => x.r === 28);
  ok(lead && lead.cov.lead.length > 0, 'lead is covered by R28 (first lead round)');
  const r2 = adv({ modeId: 'easy', towers: ['tack', 'glue'] });
  ok(r2.gaps.some((g) => g.prop === 'camo') && r2.uncoverable.indexOf('camo') >= 0, 'Tack + Glue: camo reported as a gap the picks can\'t cover', r2.uncoverable);
  ok(r2.gaps.find((g) => g.prop === 'camo').fixes.length > 0, 'the camo gap comes with fixes');
  const r3 = adv({ modeId: 'chimps', towers: ['sub', 'farm', 'wizard'], heroId: 'auto' });
  ok(r3.unusable.length === 2 && r3.picks.length === 1, 'Sub (no water) and Farm (CHIMPS) are listed as unusable', r3.unusable);
  ok(r3.hero && r3.hero.id === C.mapHeroes(D, 'monkey-meadow')[0].id, '"pick for me" hero = the map page\'s first hero', r3.hero && r3.hero.id);
  const r4 = adv({ mapId: 'tinkerton', modeId: 'hard', heroId: 'benjamin', towers: ['sniper', 'farm'] });
  const farm = r4.picks.find((p) => p.id === 'farm');
  ok(farm && farm.placedAt != null && farm.placedAt <= 15, 'Banana Farm is bought early so it pays back', farm && farm.placedAt);
  const r5 = adv({ towers: ['dart'], force: { dart: [0, 2, 4] } });
  ok(r5.picks[0].x.join('') === '024' && r5.picks[0].forced, 'a forced end crosspath is kept');
  const enc = C.encodeAdvice({ mapId: 'logs', modeId: 'chimps', heroId: '', towers: ['dart', 'ninja'], force: { ninja: [4, 0, 1] } });
  const dec = C.decodeAdvice(D, '#' + enc);
  ok(dec.mapId === 'logs' && dec.modeId === 'chimps' && dec.heroId === '' && dec.towers.join() === 'dart,ninja' && dec.force.ninja.join('') === '401', 'advisor link round-trips (incl. "no hero" and a forced path)', enc);
  const back = C.decodePlan(D, '#' + C.encodePlan(r1.plan));
  ok(C.simulate(D, back).steps.length === r1.sim.steps.length, 'the plan opens in the simulator with every step');
  let errs = 0, slow = 0;
  const ids = D.towers.map((t) => t.id);
  ['easy', 'medium', 'hard', 'chimps', 'deflation', 'abr', 'primary-only'].forEach((m, k) => D.maps.filter((x, i) => i % 9 === k % 9).forEach((mp) => {
    const t0 = Date.now();
    try { const r = adv({ mapId: mp.id, modeId: m, heroId: 'auto', towers: ids.filter((x, i) => (i + mp.id.length) % 5 === 0) }); if (r.sim && r.sim.steps.some((s) => s.short)) errs++; } catch (e) { errs++; console.log(e); }
    if (Date.now() - t0 > 400) slow++;
  }));
  ok(errs === 0, 'advisor runs on many map x mode x pick mixes with no unaffordable steps', errs);
  ok(slow === 0, 'advisor answers in under 400 ms', slow);
  ok(Object.keys(TIPS).length === D.maps.length && D.maps.every((m) => TIPS[m.id] && Array.isArray(TIPS[m.id].keyRounds)), 'map tips for every map');
  ok(Object.keys(TIPS).every((k) => !TIPS[k].chimps.some((s) => /\[\$|spent \$/.test(s))), 'map tips leave the bracketed build orders out');
}

console.log('Type-to-search picker');
{
  const ui = {};
  global.document = undefined;
  require(path.join(ASSETS, 'tools-ui.js'));
  const U = global.MonkeyIntel.ui;
  ok(U.comboScore({ label: 'Monkey Meadow' }, 'mm') > 0 && U.comboScore({ label: 'Monkey Meadow' }, 'meadow') > 0, 'combo matches initials and later words');
  ok(U.comboScore({ label: 'Dark Castle', group: 'Expert maps' }, 'expert') > 0 && U.comboScore({ label: 'Logs' }, 'zz') === 0, 'combo matches the group and rejects junk');
  ok(U.comboScore({ label: 'Dark Castle' }, 'dark c') > U.comboScore({ label: 'Dark Dungeons' }, 'dark c'), 'combo ranks the closer name first');
  ok(U.comboScore({ label: "Dan D'Monke" }, 'dan d') > 0, 'apostrophes are ignored');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');

async function browser() {
  const { chromium } = require('playwright');
  const tmp = path.join(HERE, '.preview');
  fs.mkdirSync(tmp, { recursive: true });
  const css = path.join(HERE, '..', 'static', 'site.css');
  const pages = fs.readdirSync(path.join(HERE, 'pages')).filter((f) => f.endsWith('.body.html'));
  const b = await chromium.launch();
  const errors = [];
  for (const f of pages) {
    const slug = f.replace('.body.html', '');
    const body = fs.readFileSync(path.join(HERE, 'pages', f), 'utf8').split('{{BASE}}static/tools/').join('file://' + ASSETS + '/');
    if (/\{\{/.test(body)) errors.push(slug + ': unreplaced template tag');
    const file = path.join(tmp, slug + '.smoke.html');
    fs.writeFileSync(file, '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="file://' + css + '"></head><body><main class="wrap wrap-wide">' + body + '</main></body></html>');
    for (const w of [400, 1280]) {
      const page = await b.newPage({ viewport: { width: w, height: 900 } });
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(slug + ' ' + w + 'px console.' + m.type() + ': ' + m.text()); });
      page.on('pageerror', (e) => errors.push(slug + ' ' + w + 'px pageerror: ' + e.message));
      const hash = slug === 'simulator' ? '#map=logs&mode=chimps&b=6pdart_6hquincy' : slug === 'advisor' ? '#map=logs&mode=chimps&hero=quincy&t=dart,boomerang' : '';
      await page.goto('file://' + file + hash);
      await page.waitForTimeout(400);
      /* poke the main controls */
      if (slug === 'simulator') {
        await page.click('.ti-alert .ti-fixes button');
        await page.click('#sim-add'); await page.click('.ti-tile >> nth=2'); await page.click('#sim-sheet .ti-primary');
        await page.click('.ti-details summary');
      } else if (slug === 'advisor') {
        await page.click('.ti-tile >> nth=17'); /* Alchemist */
        await page.click('#adv-map'); await page.keyboard.type('dark c'); await page.keyboard.press('Enter');
        if (!/Dark Castle/.test(await page.inputValue('#adv-map'))) errors.push('advisor ' + w + 'px: typing "dark c" + Enter did not pick Dark Castle');
        await page.selectOption('.ti-role select >> nth=0', { index: 1 });
        if (!(await page.$('#adv-to-sim'))) errors.push('advisor ' + w + 'px: no "Open in Simulator" link');
      } else if (slug === 'defence') {
        await page.click('.ti-tile >> nth=0'); await page.click('.ti-tile >> nth=6');
        await page.click('.ti-card >> nth=0 >> [aria-label="Path 3 up"]');
      } else if (slug === 'xp') {
        await page.click('.ti-pip >> nth=2'); await page.selectOption('#xpc-target', 'all');
        await page.click('.ti-details summary');
      }
      await page.waitForTimeout(200);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) errors.push(slug + ' ' + w + 'px: page scrolls sideways by ' + overflow + 'px');
      const txt = await page.evaluate(() => document.querySelector('main').innerText);
      if (/NaN|undefined|\[object/.test(txt)) errors.push(slug + ' ' + w + 'px: NaN/undefined in the page text');
      if (!(await page.$('.ti-alert'))) errors.push(slug + ' ' + w + 'px: no result block');
      if (process.argv.includes('--shots')) await page.screenshot({ path: path.join(tmp, slug + '-' + w + '.png'), fullPage: true });
      await page.close();
    }
  }
  await b.close();
  console.log(errors.length ? 'Browser problems:\n  ' + errors.join('\n  ') : 'Browser: ' + pages.length + ' tool pages at 400px and 1280px: no console errors, no NaN/undefined, no horizontal overflow.');
  return errors.length;
}

if (process.argv.includes('--browser')) {
  browser().then((n) => process.exit(fail || n ? 1 : 0)).catch((e) => { console.error(e); process.exit(1); });
} else process.exit(fail ? 1 : 0);
