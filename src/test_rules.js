/* 0.9.1+ rule tests: each one checks a game fact against its source (game file, wiki) or an audit bug.
   Loaded by src/test_tools.js; run with: node src/test_tools.js */
'use strict';
module.exports = function (ok, D, C) {
  let u = 0;
  const pl = (r, t, x, extra) => Object.assign({ uid: 'q' + (++u), r, op: 'place', t, x: x || [0, 0, 0] }, extra || {});
  const up = (r, ref, x) => ({ uid: 'q' + (++u), r, op: 'up', ref: ref.uid, x });
  const sell = (r, ref) => ({ uid: 'q' + (++u), r, op: 'sell', ref: ref.uid });
  const hero = (r, h) => ({ uid: 'q' + (++u), r, op: 'hero', h });
  const med = C.mode(D, 'medium');
  const sim = (modeId, steps, extra) => C.simulate(D, Object.assign({ mapId: 'logs', modeId, noPower: true, steps }, extra || {}));

  console.log('Income (game files: Towers/BananaFarm, Buccaneer, Druid; audit K1-K4)');
  {
    /* bananas or crates x value x Valuable Bananas + Monkey Wall Street's flat $4,000 */
    const farm = { '000': 80, '200': 160, '300': 320, '320': 400, '400': 1500, '420': 1875, '500': 6000, '520': 7500, '003': 320, '004': 1120, '005': 5120, '205': 5400, '024': 1400, '230': 325, '120': 150 };
    const bad = Object.keys(farm).filter((k) => C.incomeFor(D, med, 'farm', k.split('').map(Number)) !== farm[k]);
    ok(!bad.length, 'Banana Farm income matches the game for tiers 0-5 (4-2-0 $1,875, 5-2-0 $7,500, 2-0-5 $5,400)', bad.map((k) => k + '=' + C.incomeFor(D, med, 'farm', k.split('').map(Number))));
    ok(Object.keys(D.farmCross || {}).length === 64, 'every one of the 64 farm crosspaths has its income from the game files');
    ok(C.incomeFor(D, med, 'buccaneer', [0, 0, 3]) === 200 && C.incomeFor(D, med, 'buccaneer', [0, 0, 5]) === 800, 'Merchantman pays $200 and Trade Empire $800 (game file)');
    ok(C.incomeFor(D, med, 'druid', [0, 4, 0]) === 120 && C.incomeFor(D, med, 'druid', [0, 5, 0]) === 1120, 'Jungle\'s Bounty is 0-4-0 ($120); Spirit of the Forest adds $1,000');
    ok(C.incomeFor(D, C.mode(D, 'chimps'), 'buccaneer', [0, 0, 3]) === 0 && C.incomeFor(D, C.mode(D, 'deflation'), 'farm', [4, 2, 0]) === 0, 'no tower income in CHIMPS or Deflation');
    ok(C.incomeFor(D, C.mode(D, 'half-cash'), 'farm', [4, 2, 0]) === C.incomeFor(D, med, 'farm', [4, 2, 0]) * 0.5, 'Half Cash halves farm income');
    const f = pl(10, 'farm');
    const run = sim('medium', [f, up(20, f, [4, 2, 0])]);
    /* R10-19 at $80 (10 rounds), R20-60 at $1,875 (41 rounds) */
    ok(Math.abs(run.income - (10 * 80 + 41 * 1875)) < 1, 'a farm placed R10 and made 4-2-0 at R20 earns $77,675 by R60 (was $9,000)', run.income);
    const ben = sim('medium', [hero(1, 'benjamin')]);
    const none = sim('medium', []);
    ok(ben.income > 5000 && ben.endBank - none.endBank > 3000, 'Benjamin\'s cash per round is counted', ben.income);
    ok(sim('chimps', [hero(6, 'benjamin')]).income === 0, 'Benjamin pays nothing in CHIMPS');
  }

  console.log('Cash rules (audit K5-K7, L16)');
  {
    ok(C.popCashMult(101) === 0.05 && C.popCashMult(121) === 0.04 && C.popCashMult(141) === 0.02, 'freeplay pop cash is 5% (R101-120), 4% (R121-140), 2% after (game IncomeSet)');
    const r103 = C.roundRow(D, med, 103);
    ok(Math.abs(r103.cash - 6170.4) < 0.5, 'R103 pays $6,170 (was $9,751 at the old 8%)', r103.cash);
    const fx = { startCash: 200, heroCostMult: 1, sellAdd: 0, heroXpMult: 1, heroStartLevel: 1, me: false, emt: false, nodes: [] };
    const half = C.simulate(D, { mapId: 'logs', modeId: 'half-cash', noPower: true, fx, steps: [] });
    ok(half.rows[0].bank === 425, 'More Cash in Half Cash starts you at $425, not $525 (Bloons Wiki)', half.rows[0].bank);
    const medMc = C.simulate(D, { mapId: 'logs', modeId: 'medium', noPower: true, fx, steps: [] });
    ok(medMc.rows[0].bank === 850, 'More Cash on Medium: $850');
    const salv = pl(1, 'farm', [0, 0, 2]);
    const s1 = sim('medium', [salv, sell(5, salv)]);
    const sold = s1.steps.find((o) => o.op === 'sell');
    const paid = s1.steps.find((o) => o.op === 'place').cost;
    ok(sold.refund === Math.round(paid * 0.8), 'Banana Salvage farms (x-x-2) sell for 80% (game: sellbackModifierAdd 0.1)', sold.refund + ' of ' + paid);
    const plain = pl(1, 'dart', [0, 0, 2]);
    const s2 = sim('medium', [plain, sell(5, plain)]);
    ok(s2.steps.find((o) => o.op === 'sell').refund === Math.round(s2.steps[0].cost * 0.7), 'other towers still sell for 70%');
    ok(typeof s2.sellRate === 'number', 'the Simulator reports its sell rate for the "Sells for" preview');
    const r40 = C.roundRow(D, med, 40);
    ok(Math.abs(C.popCashPerRbe(r40, 40) * 616 - r40.cashPop) < 1, 'a leaked R40 MOAB costs its $381 of pop cash, not $616 (one per RBE)', r40.cashPop);
  }
  console.log('Mode rules and placement (game Mods files; audit M1-M4)');
  {
    ok(C.modeRange(C.mode(D, 'apopalypse'))[1] === 60, 'Apopalypse ends at R60 (game: EndRoundModModel round 60)');
    ok(sim('apopalypse', []).randomRounds === true, 'Apopalypse says its rounds are random (the standard set is a stand-in)');
    const farm = C.tower(D, 'farm');
    ok(/locked/.test(C.placeIssue(D, C.mode(D, 'deflation'), null, farm) || ''), 'Banana Farm is locked in Deflation (game: LockTowerModModel)');
    const po = C.simulate(D, { mapId: 'logs', modeId: 'primary-only', steps: [pl(1, 'dart'), pl(5, 'sniper', [1, 1, 0]), pl(10, 'heli', [0, 2, 0])] });
    ok(po.badSteps.length === 2 && po.rows[20].cov.camo.length === 0, 'Primary Only: a Sniper and Heli are flagged and don\'t count as camo cover');
    const dry = C.simulate(D, { mapId: 'alpine-run', modeId: 'medium', steps: [pl(1, 'sub'), hero(1, 'brickell')] });
    ok(dry.badSteps.length === 2 && !dry.hero && dry.rows[5].cov.pop.length === 0, 'no water: a Sub and Brickell are flagged and don\'t count', dry.badSteps.map((x) => x.label));
    const cd = C.checkDefence(D, { modeId: 'chimps', round: 95, towers: [{ id: 'dart', x: [0, 0, 0] }] });
    ok(cd.threats.every((t) => t.round <= 100 && t.rounds.every((r) => r <= 100)), 'Check my defence stops at the mode\'s last round (CHIMPS R100)');
    const dd = C.checkDefence(D, { modeId: 'deflation', round: 5, towers: [{ id: 'dart', x: [0, 0, 0] }] });
    ok(dd.threats.every((t) => t.round >= 31), 'Check my defence starts no earlier than the mode (Deflation R31)');
  }

  console.log('Data from the game files (audit G1-G6)');
  {
    const heli = C.tower(D, 'heli');
    ok(heli.paths[0][2].cost === 1450 && heli.paths[0][3].cost === 20000, 'Heli Razor Rotors $1,450 and Apache Dartship $20,000 (game Upgrades files)');
    const P = (id, x) => C.towerProps(D.pop, id, x);
    ok(P('bomb', [0, 0, 2]).black && !P('bomb', [0, 0, 3]).black && !P('bomb', [0, 2, 4]).black && P('bomb', [5, 0, 0]).black, 'Bomb: Frag Bombs pop Black, Cluster Bombs don\'t, Bloon Crush does');
    ok(P('skywarden', [2, 0, 2]).purple && !P('skywarden', [0, 1, 0]).purple, 'Skywarden\'s middle path (Energy/Plasma) can\'t pop Purple');
    ok(P('mermonkey', [0, 2, 0]).white && !P('mermonkey', [0, 3, 0]).white, 'Mermonkey x-3-x (Cold) can\'t pop White');
    ok(!P('heli', [0, 5, 0]).lead && C.conditionalHints(D.pop, 'heli', [0, 5, 0], 'lead').length === 1, 'Heli 0-5-0 Lead is the Special Poperations ability, shown as a hint');
    ok(P('wizard', [0, 1, 0]).purple && P('super', [0, 4, 0]).lead && P('desperado', [3, 0, 0]).lead && P('ice', [3, 0, 0]).white, 'under-claims fixed: Fireball Purple, Tech Terror, Desperado 3-x-x Lead, Ice Shards White');
    ok(!P('ace', [3, 0, 0]).lead && !P('buccaneer', [4, 0, 0]).lead, 'Fighter Plane and Carrier missiles only hit MOAB-class, so no Lead (game files; 0.9.1 got this wrong)');
    const hp = (id, l) => C.heroProps(D.pop, id, l);
    ok(!hp('corvus', 20).camo && !hp('corvus', 20).lead, 'Corvus: camo and Lead come only from spells (game files), not counted as permanent');
    ok(!hp('etienne', 15).lead && hp('etienne', 20).lead, 'Etienne pops Lead with his own attacks from L20 (L10 is the UCAV ability)');
    ok(hp('quincy', 7).lead && !hp('quincy', 6).lead && hp('quincy', 5).camo, 'Quincy: camo from L5, Lead from L7 (game files)');
    const sky = C.tower(D, 'skywarden');
    ok(sky.paths.every((p) => p.every((x) => typeof x.xp === 'number' && x.xp > 0)), 'every Skywarden upgrade has its XP cost from the game files');
    ok(C.tower(D, 'mermonkey').paths.some((p) => p.some((x) => x.name === 'Echosense Precision' && x.xp === 120)), 'Echosense Precision costs 120 XP (game file)');
    const ab = (hid, name) => D.heroLevels[hid].abilities.find((a) => a.name === name).cooldown;
    ok(ab('striker', 'Concussive Shell') === 16 && ab('etienne', 'Drone Swarm') === 70 && ab('psi', 'Psychic Blast') === 45 && ab('dan', 'Transformation') === 20, 'hero ability cooldowns match the game files');
  }

  console.log('Temporary support and leak problems (audit T2, L6)');
  {
    const g = C.coverState(D, [{ uid: 'a', id: 'dart', x: [0, 0, 0], label: 'Dart' }], { id: 'gwendolin', level: 10, label: 'Gwendolin' });
    ok(!g.cov.lead.some((l) => /Dart/.test(l)), 'Gwendolin\'s 8-second Heat It Up doesn\'t count as permanent Lead cover');
    const ger = C.coverState(D, [{ uid: 'a', id: 'bomb', x: [0, 0, 0], label: 'Bomb' }], { id: 'geraldo', level: 10, label: 'Geraldo' });
    ok(ger.cov.camo.length === 0, 'Geraldo\'s one-tower camo potion doesn\'t give every tower camo');
    const hints = C.hintsFor(D, [{ uid: 'a', id: 'dart', x: [0, 0, 0], label: 'Dart' }], 'lead', { id: 'gwendolin', level: 10, label: 'Gwendolin' });
    ok(hints.some((x) => /temporary/.test(x)), 'temporary support still shows as a hint', hints);
    ok(C.leakIsProblem(1, 57, 1) && !C.leakIsProblem(1, 57, 150) && C.leakIsProblem(20, 500, 150) && !C.leakIsProblem(0, 57, 1), 'a 1-RBE leak is a problem in a 1-life mode, not on Medium');
  }

  console.log('Share links keep every step on its tower (audit T1)');
  {
    const A = pl(10, 'dart'), B = pl(11, 'sniper'), U2 = up(12, A, [0, 0, 2]), Cc = pl(3, 'boomerang');
    const plan = { mapId: 'monkey-meadow', modeId: 'medium', steps: [A, B, U2, Cc] };
    const back = C.decodePlan(D, C.encodePlan(plan));
    const fin = (p) => C.simulate(D, p).insts.map((i) => i.label + ' ' + C.code(i.x)).sort().join(', ');
    ok(fin(back) === fin(plan), 'out-of-order steps reload with the upgrade on the right tower', [fin(plan), fin(back)]);
    const S = sell(20, B);
    const plan2 = { mapId: 'logs', modeId: 'medium', steps: [pl(30, 'ninja'), A, S, B, Cc, U2] };
    const back2 = C.decodePlan(D, C.encodePlan(plan2));
    ok(fin(back2) === fin(plan2) && C.simulate(D, back2).steps.filter((o) => o.op === 'sell' && o.refund > 0).length === 1, 'sells survive a share link too');
  }

  console.log('"Pick for me" names the hero the plan uses (audit T7)');
  {
    const carved = C.map(D, 'carved');
    const onlyQ = (id) => id === 'quincy';
    const pick = C.autoHero(D, carved, onlyQ);
    const adv = C.advise(D, { mapId: 'carved', modeId: 'hard', heroId: 'auto', towers: ['dart', 'bomb'], ownsHero: onlyQ });
    ok(pick.id === 'quincy' && adv.hero && adv.hero.id === 'quincy', 'owning only Quincy on Carved: the label and the plan both use Quincy', [pick.id, adv.hero && adv.hero.id]);
    const dryMap = D.maps.find((m) => m.water === 'none');
    ok(C.autoHero(D, dryMap, () => true).id !== 'brickell', 'Pick for me never picks Brickell on a map with no water');
  }

  console.log('Leak check physics (Bloons Wiki bloon data, game mod files; audit L1-L4, L9-L12)');
  {
    ok(C.rbeOf('ceramic', false) === 104 && C.rbeOf('ceramic', true) === 68 && C.rbeOf('lead', false, true) === 26, 'RBE from the layer tree: Ceramic 104, Super Ceramic 68 (R81+), Fortified Lead 26');
    ok(C.hitsToClear('ceramic', 18) === 1 && C.hitsToClear('red', 1) === 1 && C.hitsToClear('zebra', 2) === 13 && C.hitsToClear('zebra', 1) === 23, 'leftover damage carries into children: 18 damage clears a Ceramic in one hit; 2 damage on a Zebra leaves 4 Pinks (1 hit, then 3 per Pink)');
    ok(Math.abs(C.blimpHpMult(100) * 20000 - 28000) < 1 && Math.abs(C.blimpHpMult(140) * 40000 - 200000) < 1, 'blimp HP ramp: R100 BAD 28,000 HP, R140 Fortified BAD 200,000 HP');
    const L = (mapId, modeId, r, list) => C.leakRound(D, C.mode(D, modeId), C.map(D, mapId), r, C.powerWithSupport(C.powerList(D, list.map((x, i) => ({ uid: 'u' + i, id: x[0], x: x[1], label: x[0] + i })), null), C.coverState(D, list.map((x, i) => ({ uid: 'u' + i, id: x[0], x: x[1], label: x[0] + i })), null)));
    const r100 = L('logs', 'chimps', 100, [['dart', [0, 0, 0]]]);
    ok(Math.abs(r100.rbe - C.roundRow(D, C.mode(D, 'chimps'), 100).rbe) <= 1, 'the leak check uses the round table\'s RBE (R100 67,200 with the HP ramp)', r100.rbe);
    ok(L('logs', 'double-hp-moabs', 40, [['dart', [0, 0, 0]]]).blimps[0].hp === 400 && L('logs', 'hard', 40, [['dart', [0, 0, 0]]]).blimps[0].hp === 200, 'Double HP MOABs: the R40 MOAB has 400 HP');
    ok(C.mode(D, 'hard').bloonSpeedMult === 1.25 && C.mode(D, 'medium').bloonSpeedMult === 1.1, 'bloons are faster on Medium (x1.1) and Hard (x1.25), game: GlobalSpeedModModel');
    ok(C.map(D, 'dark-castle').lanes === 4 && C.map(D, 'skull-tweak').lanes === 1 && C.map(D, 'logs').lanes === 1, 'lanes are the map\'s path count, not its lane measurements');
    const quincy = C.powerList(D, [], { id: 'quincy', level: 10, label: 'Quincy' })[0];
    ok(quincy && quincy.frozen === false && quincy.lead === true, 'Quincy pops Lead from L7 but still can\'t pop frozen bloons (his flags are no longer copied from Lead)');
    let u3 = 0; const p3 = (r, t, x) => ({ uid: 'z' + (++u3), r, op: 'place', t, x });
    const ice = C.simulate(D, { mapId: 'glacial-trail', modeId: 'hard', keepLeakCash: true, steps: [p3(3, 'ice', [2, 2, 0]), { uid: 'zq', r: 3, op: 'hero', h: 'quincy' }] });
    const l13 = ice.rows.find((x) => x.r === 13).lives;
    ok(l13 >= 6 && l13 <= 26, 'calibration: lone 2-2-0 Ice + Quincy on Glacial Trail Hard has about 16 lives at R13 (real game: 16)', l13);
  }

  console.log('Co-op start cash (game: Mods/Coop*Cash files)');
  {
    const d = C.mode(D, 'deflation'), m = C.mode(D, 'medium');
    ok(C.coopStart(d, 2) === 12000 && C.coopStart(d, 3) === 8500 && C.coopStart(d, 4) === 7000, 'Deflation co-op: $12,000 / $8,500 / $7,000 each (team $24,000 / $25,500 / $28,000)');
    ok(C.coopStart(m, 2) === 550 && C.coopStart(m, 3) === 500 && C.coopStart(m, 4) === 450, 'standard co-op: $550 / $500 / $450 each (team $1,100 / $1,500 / $1,800)');
  }

};
