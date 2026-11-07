/* 0.9.3 Strategy Advisor and fix tests (audit T3-T13, C14, C17, C18, Q6): behaviour, not exact leak values, so they keep
   holding when the leak model changes. Loaded by src/test_tools.js; run with: node src/test_tools.js */
'use strict';
module.exports = function (ok, D, C) {
  const arr = (v) => (Array.isArray(v) ? v : []);
  const adv = (o) => C.advise(D, Object.assign({ mapId: 'logs', modeId: 'medium', heroId: '', towers: [] }, o));
  const held = (r) => C.heldTo(r);
  const sets = [
    { mapId: 'logs', modeId: 'chimps', heroId: 'auto', towers: ['dart', 'bomb', 'sniper'] },
    { mapId: 'dark-castle', modeId: 'chimps', heroId: 'auto', towers: ['druid', 'spike', 'village', 'alchemist'] },
    { mapId: 'carved', modeId: 'chimps', heroId: 'auto', towers: ['tack', 'boomerang', 'alchemist', 'village'] },
    { mapId: 'monkey-meadow', modeId: 'hard', heroId: 'auto', towers: ['dart', 'glue'] },
    { mapId: 'infernal', modeId: 'half-cash', heroId: 'quincy', towers: ['ninja', 'sniper', 'village'] },
    { mapId: 'logs', modeId: 'medium', heroId: '', towers: ['dart', 'sniper', 'farm'], players: 2 },
    { mapId: 'logs', modeId: 'impoppable', heroId: 'auto', towers: ['boomerang', 'bomb', 'sniper'] },
  ];
  const fx = C.profileFx(D, { mk: { 'more-cash': true, 'hero-favors': true }, mkOn: true }, { me: true });

  console.log('Strategy Advisor: same cash and lives as the Simulator (audit T3)');
  {
    const bad = [];
    sets.forEach((o) => {
      [null, fx].forEach((f) => {
        const r = adv(Object.assign({}, o, { fx: f }));
        /* what "Open this plan in the Simulator" opens, with the profile the Simulator reads for itself */
        const back = Object.assign(C.decodePlan(D, '#' + C.encodePlan(r.plan)), { fx: f });
        const s2 = C.simulate(D, back);
        if (r.plan.keepLeakCash) bad.push(o.mapId + ': keepLeakCash');
        if (Math.abs(s2.endBank - r.sim.endBank) > 1 || s2.lives !== r.sim.lives || s2.lostAt !== r.sim.lostAt) bad.push(o.mapId + ' ' + o.modeId + (f ? ' +MK' : '') + ': ' + [r.sim.endBank, s2.endBank, r.sim.lives, s2.lives].join('/'));
        if (s2.steps.some((x) => x.short)) bad.push(o.mapId + ' ' + o.modeId + ': a step is short in the Simulator');
      });
    });
    ok(!bad.length, 'Advisor plan and "Open in Simulator" agree on the end bank, lives and the round lives run out, with and without Monkey Knowledge, co-op and Half Cash', bad);
    const r = adv(sets[5]);
    ok(C.encodePlan(r.plan).indexOf('pl=2') >= 0 && C.decodePlan(D, C.encodePlan(r.plan)).players === 2, 'the Simulator link carries co-op players');
  }

  console.log('Strategy Advisor: plans for pop power, says plainly where it breaks');
  {
    let longer = 0, shorter = [];
    const sv = [];
    sets.forEach((o) => {
      const r = adv(o);
      const base = adv(Object.assign({ noPowerPlan: true }, o));
      if (held(r) > held(base)) longer++;
      if (held(r) < held(base)) shorter.push(o.mapId + ' ' + o.modeId + ': ' + held(r) + ' < ' + held(base));
      sv.push(r);
    });
    ok(!shorter.length && longer >= 3, 'buying damage before the leak holds longer than the same picks without it (never shorter)', { longer, shorter });
    const verdictOk = sv.every((r) => {
      const v = r.verdict;
      const firstBad = Math.min(r.sim.first ? r.sim.first.round : Infinity, r.sim.lostAt || Infinity, (r.sim.steps.find((x) => x.short) || { r: Infinity }).r);
      if (v.holds) return firstBad === Infinity && r.sim.problems.length === 0;
      return v.round === firstBad && /^(Breaks at|Runs out of lives around) R\d+$/.test(v.text) && v.why && v.why.length > 10;
    });
    ok(verdictOk, 'the headline is "Holds to R…" only when the plan\'s own run has no problem and keeps its lives; otherwise it names the round and why', sv.map((r) => r.verdict.text));
    ok(sv.every((r) => r.sim.problems.filter((p) => p.prop === 'power' && p.round < (r.verdict.round || Infinity)).length === 0), 'no leak before the round the headline names');
    const easy = adv({ mapId: 'logs', modeId: 'medium', towers: ['dart', 'sniper', 'farm'] });
    ok(easy.verdict.holds && easy.steps.some((s) => arr(s.due).some((d) => d.prop === 'power')), 'Logs Medium Dart + Sniper + Farm: the order buys pop power (tagged) and holds', easy.verdict.text);
    const steps = sv[0].steps.filter((s) => arr(s.due).some((d) => d.prop === 'power'));
    ok(steps.length > 0 && steps.every((s) => s.bank >= -0.5), 'pop power buys are affordable when they are made');
    const lone = adv({ mapId: 'logs', modeId: 'chimps', towers: ['village'] });
    ok(!lone.verdict.holds && /Nothing your picks can buy|could hold it|nothing that attacks|Bloons leak/i.test(lone.verdict.why), 'a Village alone: says nothing in your picks holds it', lone.verdict.why);
    const p1 = sv[0].sim.problems[0];
    ok(!p1 || p1.fixes.length > 0, 'the round it breaks at comes with fixes');
  }

  console.log('Power fixes: searched, ranked, timed (audit T4, T10, T11, T13)');
  {
    let u = 0;
    const pl = (r, t, x) => ({ uid: 'p' + (++u), r, op: 'place', t, x: x || [0, 0, 0] });
    const plan = { mapId: 'monkey-meadow', modeId: 'medium', steps: [pl(1, 'dart')] };
    const sim = C.simulate(D, plan);
    const pr = sim.problems.find((p) => p.prop === 'power');
    ok(pr && pr.fixes.length && pr.fixes.every((f) => f.left < pr.leakInfo.leak), 'every power fix cuts the leak of its round', pr && pr.fixes.map((f) => f.left));
    const reduces = pr.fixes.every((f) => {
      const ap = C.applyFix(D, plan, f, pr.round);
      const s2 = C.simulate(D, ap.plan);
      return s2.rows[pr.round - s2.start].leak < sim.rows[pr.round - sim.start].leak;
    });
    ok(reduces, 'applying each fix in the Simulator cuts that round\'s leak');
    ok(pr.fixes.filter((f) => f.inTime).every((f) => f.at <= pr.round), 'a fix you can pay for in time lands no later than the round that leaks');
    /* any number of tiers: across a few builds some upgrade fix buys 2+ tiers at once */
    const multi = [];
    [['dart', [0, 0, 0]], ['boomerang', [0, 0, 0]], ['sniper', [0, 0, 0]], ['tack', [0, 0, 0]]].forEach(([id, x]) => {
      [10, 20, 30].forEach((r) => {
        const insts = [{ uid: 'a', id, x, label: id }];
        const f = C.powerFixes(D, C.mode(D, 'medium'), C.map(D, 'logs'), r, insts, null, C.coverState(D, insts, null), 5, null, {});
        f.forEach((y) => { if (y.kind === 'upgrade' && y.buy.length >= 2) multi.push(id + '@' + r); });
      });
    });
    ok(multi.length > 0, 'upgrade fixes can buy several tiers at once', multi.slice(0, 4));
    const fixRank = pr.fixes.findIndex((f) => !f.fixes) < 0 || pr.fixes.slice(pr.fixes.findIndex((f) => !f.fixes)).every((f) => !f.fixes);
    ok(fixRank, 'fixes that stop the leak come first');
    ok(pr.fixes.every((f) => typeof f.buyLabel === 'string' && f.buyLabel.indexOf('$') > 0 && (f.kind !== 'upgrade' || /: buy /.test(f.buyLabel))), 'fix labels name what you buy and its price (T13)', pr.fixes.map((f) => f.buyLabel));
    /* unlocks (T10, C14) */
    const lock = C.simulate(D, Object.assign({}, plan, { unlocked: { dart: [0, 0, 0] }, onlyUnlocked: true, missing: { tack: true } }));
    const lf = lock.problems.find((p) => p.prop === 'power').fixes;
    ok(lf.every((f) => !(f.kind === 'upgrade' && f.towerId === 'dart')) && lf.every((f) => f.towerId !== 'tack' || f.locked), '"Only use upgrades I\'ve unlocked": no Dart upgrade beyond your tiers; a tower you haven\'t unlocked is labelled', lf.map((f) => f.buyLabel + (f.locked ? ' [locked]' : '')));
    const lab = C.simulate(D, Object.assign({}, plan, { unlocked: { dart: [0, 0, 0] } })).problems.find((p) => p.prop === 'power').fixes;
    ok(lab.filter((f) => f.kind === 'upgrade' && f.towerId === 'dart').every((f) => f.locked === 'not unlocked'), 'with the switch off, upgrades you haven\'t unlocked are labelled "not unlocked"');
    const lk2 = C.simulate(D, { mapId: 'logs', modeId: 'medium', steps: [pl(1, 'tack')], unlocked: { tack: [0, 0, 0] }, onlyUnlocked: true });
    const cv = C.fixesFor({ D, mode: C.mode(D, 'medium'), map: C.map(D, 'logs'), insts: [{ uid: 'a', id: 'dart', x: [0, 0, 0], label: 'Dart #1' }], hero: null, unlocked: { dart: [0, 0, 0] }, onlyUnlocked: true }, 'camo', 5);
    ok(cv.every((f) => !(f.kind === 'upgrade' && f.towerId === 'dart')) && lk2.problems.length >= 0, 'camo fixes respect "only unlocked" too (C14)', cv.map((f) => f.buyLabel));
    /* weak towers (T11): never offered unless nothing else works, and then labelled */
    const dc = C.simulate(D, { mapId: 'dark-castle', modeId: 'medium', steps: [pl(1, 'dart'), pl(2, 'dart')] });
    const weakIds = D.strats['dark-castle'].avoidTowers;
    const allF = dc.problems.slice(0, 6).reduce((a, p) => a.concat(p.fixes), []);
    ok(allF.every((f) => weakIds.indexOf(f.towerId) < 0 || (f.weak && /weak on this map/.test(f.note))), 'Dark Castle: no Boomerang fix unless labelled weak on this map', allF.filter((f) => weakIds.indexOf(f.towerId) >= 0).map((f) => f.buyLabel));
    /* pairs */
    const pair = { kind: 'pair', parts: [{ kind: 'new', towerId: 'tack', x: [0, 0, 0], cost: 280 }, { kind: 'upgrade', uid: sim.steps[0].uid, towerId: 'dart', from: [0, 0, 0], x: [0, 0, 1], cost: 100 }], cost: 380 };
    const ps = C.fixSteps(sim, pair, pr.round);
    ok(ps.length === 2 && ps[0].op === 'place' && ps[1].op === 'up' && /and/.test(C.fixLabel(D, Object.assign({ label: 'Dart #1' }, pair, { parts: pair.parts.map((x) => Object.assign({ label: x.towerId === 'dart' ? 'Dart #1' : 'Tack Shooter' }, x)) }))), 'a pair fix is two buys, each with its own step');
  }

  console.log('Fix timing and merging (audit T4, T6)');
  {
    const r = adv({ mapId: 'dark-castle', modeId: 'chimps', heroId: 'auto', towers: ['druid', 'spike', 'village', 'alchemist'] });
    const pr = r.sim.problems.find((p) => p.prop === 'power');
    const bad = [];
    (pr ? pr.fixes : []).forEach((f) => {
      const st = C.fixSteps(r.sim, f, pr.round);
      if (!st.length || st.some((s) => s.r > pr.round)) bad.push(f.buyLabel + ' at R' + st.map((s) => s.r).join(','));
    });
    ok(pr && !bad.length, 'Advisor fixes land at or before the round that leaks, even when the plan spends its bank down (was R49 for an R9 leak)', bad);
    let u = 0;
    const pl = (r2, t, x) => ({ uid: 'm' + (++u), r: r2, op: 'place', t, x: x || [0, 0, 0] });
    const d1 = pl(1, 'dart'), b1 = pl(2, 'bomb');
    const plan = { mapId: 'logs', modeId: 'medium', noPower: true, steps: [d1, b1, { uid: 'm9', r: 40, op: 'up', ref: d1.uid, x: [3, 0, 0] }] };
    const sim = C.simulate(D, plan);
    const ap = C.applyFix(D, plan, { kind: 'upgrade', uid: d1.uid, towerId: 'dart', from: [0, 0, 0], x: [0, 0, 2], cost: 200 }, 23);
    const s2 = C.simulate(D, ap.plan);
    const later = ap.plan.steps.find((s) => s.uid === 'm9');
    ok(later && later.x.join('') === '302' && !s2.steps.some((s) => s.flags.some((f) => f.k === 'bad')), 'adding Dart 0-0-2 before a planned 3-0-0 makes it 3-0-2, not a "can\'t go from" step (T6)', later && later.x);
    ok(sim.steps.length + 1 === s2.steps.length, 'the fix is one more step');
    ok(C.mergeCross([0, 2, 4], [2, 0, 0]).join('') === '204' && C.validCross(C.mergeCross([0, 2, 4], [2, 0, 0])), 'a fix on a path the plan doesn\'t use keeps the plan\'s main path (0-2-4 + 2-0-0 -> 2-0-4)');
    /* the Advisor's own re-plan with the fix as an extra keeps the tower's planned crosspath merged */
    const a1 = adv({ mapId: 'logs', modeId: 'medium', towers: ['dart', 'bomb'], force: { dart: [3, 0, 0] } });
    const a2 = adv({ mapId: 'logs', modeId: 'medium', towers: ['dart', 'bomb'], force: { dart: [3, 0, 0] }, extras: [{ kind: 'up', t: 'dart', x: [0, 0, 2], by: 23 }] });
    const dp = a2.picks.find((p) => p.id === 'dart');
    const step = a2.sim.steps.filter((s) => s.towerId === 'dart' && s.x && s.x[2] >= 2)[0];
    ok(dp.x.join('') === '302' && step && step.r <= 23 && !a2.sim.badSteps.length, 'Advisor "Add to my plan" for Dart 0-0-2 by R23: the Dart ends 3-0-2 and has 0-0-2 by R23', [dp.x, step && step.r]);
    ok(a1.picks[0].x.join('') === '300', 'without it the forced 3-0-0 stays');
    const enc = C.encodeAdvice({ mapId: 'logs', modeId: 'medium', heroId: '', towers: ['dart'], force: {}, extras: [{ kind: 'up', t: 'dart', x: [0, 0, 2], by: 23 }, { kind: 'new', t: 'tack', x: [0, 0, 0], by: 9 }, { kind: 'hero', by: 12 }] });
    const dec = C.decodeAdvice(D, '#' + enc);
    ok(dec.extras.length === 3 && dec.extras[1].kind === 'new' && dec.extras[1].t === 'tack' && dec.extras[2].by === 12, 'fixes you added survive the Advisor link', enc);
    const a3 = adv({ mapId: 'logs', modeId: 'medium', towers: ['dart', 'tack'], extras: [{ kind: 'new', t: 'tack', x: [0, 0, 0], by: 3 }] });
    const tk = a3.sim.steps.find((s) => s.towerId === 'tack' && s.op === 'place');
    ok(tk && tk.r <= 3, 'a new-tower fix is placed by its round', tk && tk.r);
  }

  console.log('Hero jobs, a hero alone, links and odd input (audit T8, T9, C17, C18)');
  {
    const bad = [];
    [['streambed', 'impoppable', 'corvus', ['heli', 'sniper', 'bomb']], ['muddy-puddles', 'half-cash', 'churchill', ['dart', 'tack']], ['logs', 'medium', 'auto', ['tack', 'boomerang', 'alchemist', 'village']],
      ['monkey-meadow', 'hard', 'quincy', ['dart', 'glue']], ['carved', 'chimps', 'auto', ['ninja', 'druid']]].forEach(([m, mo, hh, t]) => {
      const r = adv({ mapId: m, modeId: mo, heroId: hh, towers: t });
      arr(r.heroJobs).filter((j) => j.ok).forEach((j) => {
        const row = r.sim.rows.find((x) => x.r === j.round);
        if (!row || row.heroLevel < j.level || !row.cov[j.prop].some((l) => l.indexOf(r.hero.name) === 0)) bad.push(m + ': ' + j.prop + '@' + j.round);
      });
    });
    ok(!bad.length, 'every hero job "X by R" is true in the plan\'s own run: placed when he really is, at the level he really has (T8)', bad);
    const q = C.simulate(D, { mapId: 'logs', modeId: 'medium', steps: [{ uid: 'h', r: 1, op: 'hero', h: 'quincy' }] });
    ok(!q.problems.some((p) => p.prop === 'pop') && C.coverState(D, [], { id: 'quincy', level: 1, label: 'Quincy' }).cov.pop.length === 1, 'a hero on his own counts as something that pops (T9)');
    ok(C.coverState(D, [], { id: 'benjamin', level: 1, label: 'Benjamin' }).cov.pop.length === 0, 'Benjamin (no attack) does not');
    const odd = C.simulate(D, { mapId: 'logs', modeId: 'medium', noPower: true, steps: [{ uid: 'a', r: 5.4, op: 'place', t: 'dart', x: [0, 0, 0] }, { uid: 'b', r: NaN, op: 'place', t: 'tack', x: [0, 0, 0] }, { uid: 'c', r: 9, op: 'place', t: 'sniper', x: [0, 0, 0] }] });
    const by = {}; odd.steps.forEach((s) => { by[s.uid] = s; });
    ok(by.a.r === 5 && !by.a.flags.length && by.b.flags.some((f) => /no round/.test(f.t)) && by.c.r === 9 && !by.c.flags.length, 'a round of 5.4 is R5, a step with no round is flagged, and later steps still count (C17)', odd.steps.map((s) => s.uid + '@' + s.r));
    const many = adv({ towers: ['dart', 'boomerang', 'bomb', 'tack', 'ice', 'glue', 'sniper', 'ninja', 'wizard', 'super'] });
    ok(many.picks.length === 8 && many.dropped.map((d) => d.id).join() === 'wizard,super', 'more than 8 monkeys in a link: the plan says which were left out (C18)', many.dropped);
    const miss = adv({ towers: ['dart', 'tack'], missing: { tack: true } });
    ok(miss.picks.find((p) => p.id === 'tack').notUnlocked, 'a pick you marked not unlocked is labelled (T10)');
    const capped = adv({ mapId: 'logs', modeId: 'chimps', towers: ['dart', 'boomerang'], unlocked: { dart: [2, 0, 2], boomerang: [2, 0, 2] } });
    const over = capped.sim.problems.slice(0, 4).reduce((a, p) => a.concat(p.fixes), []).filter((f) => f.kind === 'upgrade' && !C.geq([2, 0, 2], f.x));
    ok(!over.length && capped.plan.onlyUnlocked, 'Advisor fixes stay inside "Only use upgrades I\'ve unlocked" (T10, C14)', over.map((f) => f.buyLabel));
  }

  console.log('"Start with what\'s strong here" and step labels (audit T11, T13)');
  {
    const opts = { mapId: 'dark-castle', modeId: 'chimps', heroId: 'auto' };
    const best = C.starterPicks(D, opts);
    const strong = adv(Object.assign({}, opts, { towers: D.strats['dark-castle'].strongTowers.slice(0, 4) }));
    ok(best && best.holdsTo >= held(strong), 'the starter holds at least as long as the map\'s strong towers alone', best && [best.source, best.holdsTo, held(strong)]);
    const px = C.mapPlanCross(D, 'dark-castle');
    ok(px.druid && px.druid.some((x) => x.join('') === '015') && C.endCandidates(D, 'druid', [], px.druid).some((c) => c.x.join('') === '015' && c.mapPlan), 'the map page\'s Avatar of Wrath 0-1-5 is an end crosspath option (E15)');
    const mp = adv({ mapId: 'dark-castle', modeId: 'chimps', heroId: 'auto', towers: ['druid'] });
    ok(mp.picks[0].options.some((o) => o.x.join('') === '015' && o.mapPlan), 'and the Advisor lists it as "map plan"');
    const r = adv({ mapId: 'logs', modeId: 'medium', towers: ['druid', 'alchemist'], force: { druid: [1, 0, 1], alchemist: [1, 1, 0] } });
    const names = r.steps.filter((s) => s.op === 'up').every((s) => {
      const t = C.tower(D, r.plan.steps.find((p) => p.uid === s.ref).t);
      return s.buyText === C.buyList(t, s.from, s.x).map((b) => b.name).filter(Boolean).join(', ');
    });
    const druidUp = r.steps.find((s) => s.op === 'up' && s.label === 'Druid' && s.x.join('') === '101' && s.from.join('') === '100');
    ok(names && (!druidUp || druidUp.buyText === C.upgradeName(C.tower(D, 'druid'), 2, 1)), 'a step names the upgrade it buys: Druid 1-0-0 -> 1-0-1 buys Druidic Reach, not Hard Thorns (T13)', druidUp && druidUp.buyText);
    const s = C.simulate(D, { mapId: 'logs', modeId: 'medium', noPower: true, steps: [{ uid: 'a', r: 1, op: 'place', t: 'druid', x: [1, 0, 0] }, { uid: 'b', r: 5, op: 'up', ref: 'a', x: [1, 0, 1] }] });
    ok(s.steps[1].name === C.upgradeName(C.tower(D, 'druid'), 2, 1), 'the Simulator\'s step list names what you buy too');
  }

  console.log('Advisor speed (audit Q6, C19)');
  {
    /* the fast coverage check the Advisor searches with gives the same answer as C.coverState */
    let seed = 7;
    const rnd = (n) => { seed = (seed * 9301 + 49297) % 233280; return Math.floor(seed / 233280 * n); };
    let diff = 0;
    for (let k = 0; k < 400; k++) {
      const insts = [];
      const nT = 1 + rnd(4);
      for (let j = 0; j < nT; j++) { const t = D.towers[rnd(D.towers.length)]; let x = [0, 0, 0]; for (let q = 0; q < 4; q++) x = C.setPath(x, rnd(3), rnd(6)); insts.push({ uid: 'r' + j, id: t.id, x, label: t.id + j }); }
      const hh = rnd(3) ? { id: D.heroes[rnd(D.heroes.length)].id, level: 1 + rnd(20), label: 'H' } : null;
      const a = C.coverState(D, insts, hh).cov, b = C.coverFlags(D, insts, hh);
      if (C.NEEDS.some((p) => (a[p].length > 0) !== b[p])) diff++;
    }
    ok(diff === 0, 'C.coverFlags agrees with C.coverState on 400 random teams', diff);
    const maps = ['logs', 'dark-castle', 'carved', 'erosion', 'monkey-meadow', 'infernal'];
    const picks = [['dart', 'bomb', 'sniper'], ['tack', 'boomerang', 'alchemist', 'village'], ['ninja', 'druid', 'super', 'wizard', 'village', 'alchemist', 'engineer', 'spike'], ['dart', 'glue']];
    let worst = 0, sum = 0, n = 0;
    maps.forEach((m) => ['chimps', 'hard', 'medium'].forEach((mo) => picks.forEach((t) => {
      const t0 = Date.now();
      const r = C.advise(D, { mapId: m, modeId: mo, heroId: 'auto', towers: t });
      if (r.sim.problems[0]) r.sim.problems.slice(0, 1).forEach((p) => p.fixes); /* the page shows the first problem's fixes; the rest on demand */
      const ms = Date.now() - t0;
      worst = Math.max(worst, ms); sum += ms; n++;
    })));
    ok(worst < 250 && sum / n < 80, 'Advisor + the fixes it shows: worst ' + worst + ' ms, average ' + Math.round(sum / n) + ' ms in node (budget about 100 ms, 400 ms on a phone)', [worst, Math.round(sum / n)]);
    const t0 = Date.now();
    const sim = C.simulate(D, { mapId: 'logs', modeId: 'chimps', steps: [{ uid: 'a', r: 6, op: 'place', t: 'dart', x: [0, 0, 0] }] });
    const lazy = Date.now() - t0;
    sim.problems.forEach((p) => p.fixes);
    ok(lazy < 60 && sim.problems[0].fixes.length > 0, 'the Simulator works fixes out only when they are read (' + lazy + ' ms without them)');
  }
};
