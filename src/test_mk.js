/* Monkey Knowledge tests: the full 134-node data and every effect the engine applies (C.profileFx, C.mkPlaceCost, C.mkTierCost,
   C.mkIncome, C.mkSellAdd, and their use in C.simulate / C.advise). Exact values from the game files:
     GD  btd6-game-data v56.0 Knowledge/<Tree>/<Id>.json (also data/game/knowledge.json), Towers/<T>/*.json, Upgrades/<name>.json
     TT  the game's own descriptions (textTable.json)
   Loaded by src/test_tools.js; run with: node src/test_tools.js */
'use strict';
module.exports = function (ok, D, C) {
  let u = 0;
  const pl = (r, t, x) => ({ uid: 'm' + (++u), r, op: 'place', t, x: x || [0, 0, 0] });
  const up = (r, ref, x) => ({ uid: 'm' + (++u), r, op: 'up', ref: ref.uid, x });
  const sell = (r, ref) => ({ uid: 'm' + (++u), r, op: 'sell', ref: ref.uid });
  const fxOf = (ids, settings) => { const mk = {}; ids.forEach((id) => { mk[id] = true; }); return C.profileFx(D, { mk, mkOn: true }, settings || { me: false }); };
  const sim = (modeId, steps, fx) => C.simulate(D, { mapId: 'logs', modeId, noPower: true, steps, fx });
  const T = (id) => C.tower(D, id);
  const byId = {};
  D.mk.forEach((n) => { byId[n.id] = n; });

  console.log('Monkey Knowledge data (GD Knowledge/, tools/game/build_mk.py)');
  {
    const per = {};
    D.mk.forEach((n) => { per[n.tree] = (per[n.tree] || 0) + 1; });
    ok(D.mk.length === 134 && JSON.stringify(per) === JSON.stringify({ Primary: 32, Military: 30, Magic: 22, Support: 22, Heroes: 13, Powers: 15 }), 'all 134 nodes in six trees (GD: 32/30/22/22/13/15)', per);
    const bad = D.mk.filter((n) => !n.name || !n.effect || !n.tree || n.ptsNeeded == null || n.mm == null || !n.layout || !Array.isArray(n.pre) || n.pre.some((p) => !byId[p]));
    ok(!bad.length, 'every node has a name, effect, tree, points, MM, layout and real prerequisites', bad.map((n) => n.id));
    const old = { 'more-cash': { startCash: 200 }, 'hero-favors': { heroCostMult: 0.9 }, 'empowered-heroes': { heroStartLevel: 3 }, 'monkey-education': { xpMult: 1.08 },
      'elite-military-training': { militaryXpMult: 1.05 }, 'self-taught-heroes': { heroXpMult: 1.1 }, 'better-sell-deals': { sellAdd: 0.05 } };
    ok(Object.keys(old).every((id) => byId[id] && Object.keys(old[id]).every((k) => byId[id].fx[k] === old[id][k])), 'the 0.9 fx values are kept (saved profiles behave the same)');
    const ids29 = ['mo-monkey-money', 'monkey-education', 'elite-military-training', 'self-taught-heroes', 'hero-favors', 'extra-dart-pops', 'naval-upgrades', 'farm-subsidy',
      'first-last-line-of-defense', 'more-cash', 'bonus-monkey', 'bonus-glue-gunner', 'better-sell-deals', 'veteran-monkey-training', 'global-ability-cooldowns', 'healthy-bananas',
      'empowered-heroes', 'mana-shield', 'big-bloon-sabotage', 'military-conscription', 'bank-deposits', 'paragon-of-power', 'pre-game-prep', 'monkeys-together-strong',
      'more-valuable-bananas', 'bigger-banks', 'backroom-deals', 'trade-agreements', 'inland-revenue-streams'];
    ok(ids29.every((id) => byId[id]), 'the 29 ids saved profiles use still exist', ids29.filter((id) => !byId[id]));
    ok(byId['more-cash'].ptsNeeded === 10 && byId['more-cash'].mm === 1000 && byId['more-cash'].pre.join() === 'bonus-glue-gunner,bonus-monkey', 'More Cash: 10 pts, 1,000 MM, needs both free-tower nodes (GD MoreCash.json)');
    ok(byId['mo-monkey-money'].pre[0] === 'speedy-brewing' && byId['speedy-brewing'].pre[0] === 'magic-tricks', 'Mo\' Monkey Money comes after Speedy Brewing, after Magic Tricks (GD Magic/)');
    const cell = {};
    const clash = D.mk.filter((n) => { const k = n.tree + n.layout.row + '.' + n.layout.col; if (cell[k]) return true; cell[k] = 1; return false; });
    ok(!clash.length && D.mk.every((n) => n.pre.every((p) => byId[p].layout.row < n.layout.row)), 'tree layout: one node per cell, every prerequisite sits above', clash.map((n) => n.id));
  }

  console.log('Monkey Knowledge effects the tools apply (GD values)');
  {
    const med = C.mode(D, 'medium'), hard = C.mode(D, 'hard');
    /* noted for the leak check: Big Bloon Sabotage percentageHealthReduced 0.1; Veteran Monkey Training reload -3% */
    ok(fxOf(['big-bloon-sabotage']).blimpHpMult === 0.9, 'Big Bloon Sabotage: MOAB-class HP x0.9 (GD BloonHealthModModel 0.1)');
    ok(fxOf(['veteran-monkey-training']).reloadMult === 0.97, 'Veteran Monkey Training: reload x0.97 (GD WeaponReloadPercentageModModel 0.03)');
    ok(fxOf(['fast-tack-attacks']).attack.some((a) => a.towers[0] === 'tack' && a.stat === 'rate' && a.pct === 0.08), 'tower attack nodes are carried for the leak check (Fast Tack Attacks 8%)');
    /* free tower: FreeTowerModModel, one per game */
    const fb = fxOf(['bonus-monkey']);
    ok(fb.freeTowers.join() === 'dart', 'Bonus Monkey! gives a free Dart Monkey');
    const d1 = pl(1, 'dart'), d2 = pl(1, 'dart'), d3 = pl(2, 'dart', [2, 0, 0]);
    const sb = sim('medium', [d1, d2], fb);
    ok(sb.steps[0].cost === 0 && sb.steps[1].cost === 200, 'the first Dart is free, the second costs $200 (Medium)', sb.steps.map((o) => o.cost));
    const sb2 = sim('medium', [d3], fb);
    ok(sb2.steps[0].cost === C.upgradeCost(T('dart'), [0, 0, 0], [2, 0, 0], 1), 'a free Dart placed at 2-0-0 still pays its upgrades');
    const both = fxOf(['bonus-monkey', 'bonus-glue-gunner']);
    const g1 = pl(1, 'glue'), d4 = pl(1, 'dart');
    const sbo = sim('medium', [g1, d4], both);
    ok(sbo.steps[0].cost === 0 && sbo.steps[1].cost === 200, 'with both nodes you still get one free tower a game (TT "Only 1 free Monkey Tower per game")', sbo.steps.map((o) => o.cost));
    /* tower prices: SimTowerDiscountModModel */
    const cr = sim('medium', [pl(1, 'boomerang'), pl(1, 'boomerang')], fxOf(['cheap-rangs']));
    ok(cr.steps[0].cost === 265 && cr.steps[1].cost === 265, 'Cheap \'Rangs: every Boomerang $50 less ($315 -> $265, GD subtraction 50, charges 999999)');
    ok(sim('hard', [pl(3, 'boomerang')], fxOf(['cheap-rangs'])).steps[0].cost === C.price(315, hard.costMult) - 50, 'a flat discount comes off after the difficulty price (Hard $340 -> $290)');
    const fs = sim('medium', [pl(1, 'farm'), pl(1, 'farm')], fxOf(['farm-subsidy']));
    ok(fs.steps[0].cost === 1150 && fs.steps[1].cost === 1250, 'Farm Subsidy: the first Farm $100 less, the second full price');
    ok(sim('medium', [pl(1, 'spike'), pl(1, 'spike')], fxOf(['first-last-line-of-defense'])).steps.map((o) => o.cost).join() === '850,1000', 'First Last Line of Defense: first Spike Factory $150 less');
    const mc = sim('medium', [pl(1, 'sniper'), pl(1, 'heli'), pl(1, 'sniper')], fxOf(['military-conscription']));
    ok(mc.steps.map((o) => o.cost).join() === '235,1500,350', 'Military Conscription: only the first Military tower is two thirds ($350 -> $235)', mc.steps.map((o) => o.cost));
    ok(sim('hard', [pl(3, 'sniper')], fxOf(['military-conscription'])).steps[0].cost === C.price(350 * 0.67, hard.costMult), 'Military Conscription on Hard: 67% of the base, then the Hard price');
    ok(sim('medium', [pl(1, 'heli')], fxOf(['advanced-logistics'])).steps[0].cost === 1425, 'Advanced Logistics: Military towers 5% cheaper ($1,500 -> $1,425)');
    ok(sim('medium', [pl(1, 'heli')], fxOf(['advanced-logistics', 'military-conscription'])).steps[0].cost === C.price(1500 * 0.67 * 0.95, 1), 'Conscription and Logistics stack on the first Military tower');
    ok(sim('medium', [pl(1, 'dart')], fxOf(['military-conscription', 'advanced-logistics'])).steps[0].cost === 200, 'Military discounts leave a Primary tower alone');
    const fp = fxOf(['flat-pack-buildings']);
    const f1 = pl(1, 'farm'), dd = pl(1, 'dart');
    const fps = sim('medium', [f1, dd, sell(3, f1), sell(3, dd)], fp);
    ok(fps.steps[0].cost === 1225 && fps.steps[2].refund === Math.round(1225 * 0.72) && fps.steps[3].refund === Math.round(200 * 0.7), 'Flat Pack Buildings: Farm 2% cheaper and sells for 72%; a Dart still sells for 70%', fps.steps.map((o) => o.cost + '/' + o.refund));
    /* upgrade prices: UpgradeCostModModel */
    const ut = (ids, t, from, to, mode) => C.mkUpgradeCost(T(t), from, to, (mode || med).costMult, fxOf(ids));
    const plain = (t, from, to, mode) => C.upgradeCost(T(t), from, to, (mode || med).costMult);
    const cases = [
      ['cheaper-doubles', 'ninja', [2, 0, 0], [3, 0, 0], 100, 'Cheaper Doubles: Double Shot $900 -> $800'],
      ['budget-clusters', 'bomb', [0, 0, 2], [0, 0, 3], 100, 'Budget Clusters: Cluster Bombs $100 less'],
      ['cheaper-solution', 'glue', [3, 0, 0], [4, 0, 0], 1000, 'Cheaper Solution: Bloon Liquefier $1,000 less'],
      ['cheaper-maiming', 'sniper', [3, 0, 0], [4, 0, 0], 1000, 'Cheaper Maiming: Maim MOAB $1,000 less'],
      ['budget-battery', 'mortar', [0, 3, 0], [0, 4, 0], 600, 'Budget Battery: Artillery Battery $600 less'],
      ['hi-value-mines', 'spike', [3, 0, 0], [4, 0, 0], 1500, 'Hi-Value Mines: Spiked Mines $9,500 -> $8,000'],
      ['warm-oak', 'druid', [0, 1, 0], [0, 2, 0], 100, 'Warm Oak: Heart of Oak $100 less'],
      ['magic-tricks', 'wizard', [0, 0, 0], [1, 0, 1], 50, 'Magic Tricks: Guided Magic and Intense Magic $25 less each'],
      ['aeronautic-subsidy', 'ace', [4, 0, 0], [5, 0, 0], 4250, 'Aeronautic Subsidy: Sky Shredder 10% less ($42,500 -> $38,250)'],
    ];
    cases.forEach(([id, t, from, to, save, name]) => {
      const got = plain(t, from, to) - ut([id], t, from, to);
      ok(got === save, name, got);
    });
    ok(ut(['cheaper-doubles'], 'ninja', [0, 0, 0], [2, 0, 0]) === plain('ninja', [0, 0, 0], [2, 0, 0]), 'an upgrade discount touches only its own upgrade');
    const nj = pl(1, 'ninja'), nu = up(2, nj, [3, 0, 0]);
    ok(sim('medium', [nj, nu], fxOf(['cheaper-doubles'])).steps[1].cost === plain('ninja', [0, 0, 0], [3, 0, 0]) - 100, 'the Simulator charges the discounted upgrade');
    /* income */
    const ta = fxOf(['trade-agreements']);
    ok(C.mkIncome(D, med, 'buccaneer', [0, 0, 3], ta) === 220 && C.mkIncome(D, med, 'buccaneer', [0, 0, 5], ta) === 820 && C.mkIncome(D, med, 'buccaneer', [0, 0, 2], ta) === 0,
      'Trade Agreements: Merchantman $200 -> $220 a round, Trade Empire $820 (GD CashPerRoundModModel 20)');
    ok(C.mkIncome(D, C.mode(D, 'chimps'), 'buccaneer', [0, 0, 3], ta) === 0 && C.mkIncome(D, C.mode(D, 'half-cash'), 'buccaneer', [0, 0, 3], ta) === 110, 'Trade Agreements follows the mode: none in CHIMPS, halved in Half Cash');
    const mvb = fxOf(['more-valuable-bananas']);
    const farm = (x, fx) => C.mkIncome(D, med, 'farm', x, fx);
    ok(farm([4, 2, 0], mvb) === 1950 && farm([0, 2, 0], mvb) === 104 && farm([5, 2, 0], mvb) === 7800 && farm([0, 2, 5], mvb) === 5456,
      'More Valuable Bananas: Valuable Bananas +30% not +25% (4-2-0 $1,875 -> $1,950, 5-2-0 $7,500 -> $7,800)', [farm([4, 2, 0], mvb), farm([0, 2, 0], mvb), farm([5, 2, 0], mvb), farm([0, 2, 5], mvb)]);
    ok(farm([4, 0, 0], mvb) === 1500 && farm([0, 3, 0], mvb) === C.incomeFor(D, med, 'farm', [0, 3, 0]), 'farms without Valuable Bananas, and banks, are unchanged');
    const b1 = pl(1, 'buccaneer', [0, 0, 3]);
    const s0 = sim('medium', [b1]), s1 = sim('medium', [b1], ta);
    ok(Math.abs((s1.rows[10].bank - s0.rows[10].bank) - 200) < 1e-6, 'the Simulator adds Trade Agreements: +$20 a round, $200 by round 11', s1.rows[10].bank - s0.rows[10].bank);
    ok(fxOf(['inland-revenue-streams']).townPopCashAdd === 0.1 && fxOf(['bigger-banks']).bankCapAdd === 2500, 'Inland Revenue Streams (+10% Monkey Town) and Bigger Banks (+$2,500) are carried');
    /* hero XP */
    ok(Math.abs(fxOf(['monkeys-together-strong']).heroXpMult - 1.05) < 1e-9, 'Monkeys Together Strong: +5% hero XP with your one hero (GD HeroXPBonusModModel 0.05)');
    ok(Math.abs(fxOf(['self-taught-heroes', 'monkeys-together-strong'], { me: true }).heroXpMult - 1.08 * 1.1 * 1.05) < 1e-9, 'hero XP bonuses multiply: Monkey Education x Self Taught x Monkeys Together Strong');
    /* modes */
    const all = fxOf(['cheap-rangs', 'farm-subsidy', 'bonus-monkey', 'trade-agreements', 'cheaper-doubles', 'flat-pack-buildings', 'more-cash']);
    const ch = sim('chimps', [pl(6, 'boomerang'), pl(6, 'dart')], all), ch0 = sim('chimps', [pl(6, 'boomerang'), pl(6, 'dart')]);
    ok(ch.steps.every((o, i) => o.cost === ch0.steps[i].cost) && ch.rows[0].bank === ch0.rows[0].bank, 'CHIMPS ignores every Monkey Knowledge price and cash effect');
    const half = sim('half-cash', [], fxOf(['more-cash']));
    const defl = sim('deflation', [], fxOf(['more-cash'])), defl0 = sim('deflation', []);
    ok(half.rows[0].bank === 425 && defl.rows[0].bank - defl0.rows[0].bank === 200, 'More Cash keeps 0.9.1 rules: x cashMult (Half Cash $425), full $200 in Deflation');
    ok(C.profileFx(D, { mk: { 'cheap-rangs': true }, mkOn: false }, {}) === null, 'MK off-switch: no effects at all');
    ok(C.fxSummary(all).indexOf('tower and upgrade discounts') >= 0 && C.fxSummary(all).indexOf('a free Dart') >= 0, 'the profile summary names the new effects', C.fxSummary(all));
    /* the Advisor shows what the Simulator charges */
    const adv = C.advise(D, { mapId: 'monkey-meadow', modeId: 'medium', heroId: '', towers: ['dart', 'boomerang', 'sniper'], fx: fxOf(['bonus-monkey', 'cheap-rangs', 'military-conscription']) });
    const cost = {}; adv.sim.steps.forEach((o) => { cost[o.uid] = o.cost; });
    ok(adv.steps.length && adv.steps.every((st) => cost[st.uid] === st.cost), 'Advisor step prices with MK discounts match the Simulator');
    const fd = adv.steps.find((st) => st.op === 'place' && st.t === 'dart');
    ok(fd && fd.cost === C.upgradeCost(T('dart'), [0, 0, 0], fd.x, 1), 'Advisor: Bonus Monkey makes its first Dart free', fd);
  }
};
