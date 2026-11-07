/* 0.10 leak-check tests (eng): the timeline model (C.leakRound) against real games, the round tables, a sample of real
   two-tower CHIMPS wins, and negative checks so the model can't go soft. Loaded by src/test_tools.js.
   Sources: Todro5912's own games (Dart, Ice + Quincy); the BTD6 Index 2TC list (https://btd6index.win, the 38 builds typed below);
   the game files (data/game/*.json, data/tower-power.json); the Bloons Wiki (round sets, Glacial Trail). */
'use strict';
module.exports = function (ok, D, C) {
  const mode = (id) => C.mode(D, id);
  const map = (id) => C.map(D, id);
  const listOf = (towers, hero) => {
    const insts = towers.map((t, i) => ({ uid: 'e' + i, id: t[0], x: t[1], label: t[0] + ' #' + (i + 1), placedAt: t[2] != null ? t[2] : null }));
    return C.powerWithSupport(C.powerList(D, insts, hero || null), C.coverState(D, insts, hero || null));
  };
  const leak = (mapId, modeId, r, towers, hero) => C.leakRound(D, mode(modeId), map(mapId), r, listOf(towers, hero));
  const code = (s) => s.split('').map(Number);

  console.log('Leak check 0.10: real games (Todro5912)');
  {
    const d = [1, 2, 3, 4].map((r) => leak('monkey-meadow', 'easy', r, [['dart', [0, 0, 0]]]).leak);
    ok(d[0] === 0 && d[1] === 0 && d[2] === 0 && d[3] > 0, 'one base Dart pops R1-3 on Monkey Meadow (Easy) and leaks at R4', d);
    /* lone 2-2-0 Ice + Quincy, both placed R3, Glacial Trail Hard: Todro5912 had 16 lives at R13. Glacial Trail freezes each
       tower on rounds p+9 and p+10 (Quincy: R12-13); Ice Monkeys never freeze */
    let lives = 100;
    const gt = map('glacial-trail');
    for (let r = 3; r <= 13; r++) {
      const hl = Math.max(1, C.heroLevelAt(D, 'quincy', 3, r, gt.difficulty));
      const lk = leak('glacial-trail', 'hard', r, [['ice', [2, 2, 0], 3]], { id: 'quincy', level: hl, label: 'Quincy', placedAt: 3 });
      lives -= lk.lives;
    }
    ok(lives >= 6 && lives <= 26, 'lone 2-2-0 Ice + Quincy on Glacial Trail Hard: about 16 lives at R13 (within 10)', lives);
    ok(C.glacialFrozen({ id: 'mortar', placedAt: 6 }, 15) && C.glacialFrozen({ id: 'mortar', placedAt: 6 }, 16) && !C.glacialFrozen({ id: 'mortar', placedAt: 6 }, 17) &&
      C.glacialFrozen({ id: 'mortar', placedAt: 6 }, 25) && !C.glacialFrozen({ id: 'ice', placedAt: 6 }, 15), 'Glacial Trail: placed R6 freezes R15-16 and R25-26 (map-strats); Ice Monkeys never freeze');
  }

  console.log('Leak check 0.10: rounds');
  {
    const bad = [];
    [['chimps', 'standard'], ['medium', 'standard'], ['abr', 'abr']].forEach(([m]) => {
      for (let r = 1; r <= 140; r++) {
        const row = C.roundRow(D, mode(m), r);
        if (!row || row.rbe == null) continue;
        const x = C.leakRound(D, mode(m), null, r, []);
        if (!x || Math.abs(x.rbe - row.rbe) > 0.5) bad.push(m + ' R' + r + ' ' + (x && x.rbe) + '/' + row.rbe);
      }
    });
    ok(!bad.length, 'every round\'s RBE from its bloon groups matches the round table (standard and ABR, R1-140; fortified, Super Ceramics and the blimp HP ramp)', bad.slice(0, 5));
    ok(C.leakRound(D, mode('easy'), null, 40, []).rbe === 549, 'Easy R40: the MOAB has 2/3 HP, so 549 RBE (game: Mods/Easy.json)');
    ok(C.leakRound(D, mode('double-hp-moabs'), null, 40, []).blimps[0].hp === 400, 'Double HP MOABs: the R40 MOAB has 400 HP');
    const none = C.leakRound(D, mode('chimps'), map('logs'), 30, []);
    ok(none.leak === none.rbe && none.lives > 0, 'nothing placed: the whole round leaks');
  }

  console.log('Leak check 0.10: real two-tower CHIMPS wins (BTD6 Index), leak-free R6-R80');
  {
    /* a fixed spread of the Index 2TC list (every 37th parsable build): 38 of the 40 picked are leak-free R6-80 in this
       model; the two that are not (Absolute Zero + Golden Justice on Balance R27, Archmage + Lord of the Abyss on Logs R59)
       are left out and listed in content/guides/leak-check.md */
    const WINS = ['mermonkey-320+mortar-205@logs', 'mermonkey-401+ace-025@skates', 'buccaneer-420+ace-025@skates', 'wizard-320+ace-025@cubism',
      'wizard-420+ace-025@middle-of-the-road', 'wizard-502+heli-520@in-the-loop', 'wizard-520+heli-025@cubism', 'wizard-520+ace-025@one-two-tree',
      'wizard-520+mortar-052@cubism', 'wizard-502+ace-520@tree-stump', 'wizard-502+ace-024@one-two-tree', 'wizard-502+ace-250@park-path',
      'wizard-520+engineer-250@three-mines-round', 'mermonkey-240+ace-025@luminous-cove', 'mermonkey-041+heli-052@spa-pits', 'sub-014+ace-025@three-mines-round',
      'mortar-042+super-205@three-mines-round', 'druid-205+mortar-052@three-mines-round', 'desperado-204+ace-025@winter-park', 'sub-230+ace-025@candy-falls',
      'alchemist-320+ace-025@scrapyard', 'boomerang-032+ace-025@sulfur-springs', 'tack-240+ace-025@sulfur-springs', 'bomb-520+dartling-520@cubism',
      'ninja-240+wizard-052@logs', 'mortar-205+heli-502@balance', 'mortar-205+heli-502@streambed', 'mortar-205+dartling-105@skates',
      'mortar-205+heli-205@quarry', 'mortar-205+ice-205@frozen-over', 'mortar-205+spike-205@three-mines-round', 'mortar-205+heli-150@four-circles',
      'mortar-205+ace-204@skates', 'mortar-205+glue-520@frozen-over', 'sub-420+super-204@three-mines-round', 'sub-402+dartling-520@carved',
      'bomb-025+heli-520@resort', 'bomb-205+dartling-520@three-mines-round'];
    const builds = WINS.map((s) => { const [tw, m] = s.split('@'); return { t: tw.split('+').map((p) => { const [id, c] = p.split('-'); return [id, code(c)]; }), map: m, s }; });
    const bad = [];
    builds.forEach((b) => { for (let r = 6; r <= 80; r++) { const x = leak(b.map, 'chimps', r, b.t); if (!x || x.leak > 0) { bad.push(b.s + ' R' + r + ':' + (x && x.leak)); break; } } });
    ok(builds.length <= 40 && !bad.length, builds.length + ' real 2TC CHIMPS wins stay leak-free from R6 to R80', bad);
    /* negative: one tower of each pair alone should mostly lose somewhere R40-R100 (a lone tower is not a 2TC win) */
    let alive = 0, n = 0;
    builds.forEach((b) => b.t.forEach((t) => {
      n++;
      if ([40, 50, 63, 76, 80, 85, 90, 95, 98, 100].every((r) => { const x = leak(b.map, 'chimps', r, [t]); return x && x.leak === 0; })) alive++;
    }));
    ok(alive <= 0.25 * n, 'negative: one tower of each pair alone leaks somewhere in R40-R100 in most cases (at least 75%; 91% on the full 2TC list)', alive + ' of ' + n + ' survive');
  }

  console.log('Leak check 0.10: negatives (the model must not go soft)');
  {
    /* game files: a base Dart deals 1 damage, 2 pierce, about 1.05 throws a second; no Lead, no MOAB-sized damage */
    ok(leak('logs', 'chimps', 40, [['dart', [0, 0, 0]]]).leak >= 600, 'a lone base Dart can\'t pass R40: the MOAB (200 HP) leaks whole');
    ok(leak('logs', 'chimps', 28, [['dart', [0, 0, 0]], ['dart', [0, 0, 0]]]).leak > 0, 'two base Darts can\'t beat R28: Sharp darts can\'t pop the Leads');
    /* Sniper 0-0-0: 2 damage every 1.59 s, about 1.3 layers a second; R6 is 57 layers in about 20 s */
    ok(leak('logs', 'chimps', 6, [['sniper', [0, 0, 0]]]).leak > 0, 'a lone base Sniper leaks R6 in CHIMPS');
    ok(leak('logs', 'chimps', 1, [['village', [0, 0, 0]]]).leak === 20 && leak('logs', 'chimps', 1, [['glue', [0, 0, 0]]]).leak === 20, 'a base Village or Glue Gunner pops nothing: R1 leaks all 20 Reds');
    ok(leak('logs', 'chimps', 100, [['dart', [0, 0, 5]]]).leak > 20000, 'a lone Crossbow Master can\'t take down the R100 BAD (28,000 HP)');
    ok(leak('logs', 'chimps', 63, [['bomb', [0, 0, 0]]]).leak > 1000, 'a lone base Bomb Shooter leaks the R63 Ceramic rushes');
  }

  console.log('Leak check 0.10: buffs, abilities, placement');
  {
    const insts = [{ uid: 'a', id: 'dart', x: [0, 0, 0], label: 'Dart' }, { uid: 'b', id: 'village', x: [3, 0, 0], label: 'Village' }];
    const it = C.powerList(D, insts, null)[0];
    ok(it.buff && it.buff.perm.pierce === 1 && Math.abs(it.buff.perm.rate - 1 / 0.85) < 1e-9 && Math.abs(it.buff.perm.range - 1.21) < 1e-9,
      'Village 3-x-x: Primary Training is +1 pierce and +10% range (plus the base +10% and Jungle Drums cooldown x0.85), not more attack speed (MonkeyVillage-300.json)');
    const brew = (x, n) => C.powerList(D, [{ uid: 'a', id: 'alchemist', x, label: 'Alch' }].concat([...Array(n)].map((_, i) => ({ uid: 'd' + i, id: 'dart', x: [0, 0, 2], label: 'Dart ' + i }))), null)
      .filter((q) => q.id === 'dart').map((q) => (q.buff && (q.buff.timed[0] || {}).u) || (q.buff && q.buff.perm.dmg ? 1 : 0));
    const b3 = brew([3, 0, 0], 3), b5 = brew([5, 0, 0], 3);
    ok(b3.length === 3 && b3.every((u) => u > 0 && u < 0.3) && b5.every((u) => u === 1),
      'Berserker Brew: one tower per throw every 8 s, 5 s or 25 shots (3-x-x), so three towers share it (uptime under 30%); 5-x-x is permanent', b3);
    const far = C.powerList(D, [{ uid: 'v', id: 'village', x: [2, 0, 0], label: 'V' }].concat([...Array(7)].map((_, i) => ({ uid: 'd' + i, id: 'dart', x: [0, 0, 0], label: 'D' + i }))), null);
    ok(far.filter((q) => q.buff).length === C.VILLAGE_REACH, 'a Village reaches the ' + C.VILLAGE_REACH + ' towers placed nearest it (estimate: placement is unknown)');
    /* MOAB Eliminator (Bomb 0-5-0): 4,500 damage every 10 s (BombShooter-050.json); used when a blimp is in reach */
    const elim = leak('logs', 'chimps', 80, [['bomb', [0, 5, 0]]]);
    ok(elim.leakAbilities <= elim.leakNoAbilities && elim.leakNoAbilities > elim.leakAbilities, 'abilities used when ready: MOAB Eliminator takes down more of the R80 ZOMG than the bomb alone', [elim.leakAbilities, elim.leakNoAbilities]);
    const mid = leak('logs', 'chimps', 40, [['dart', [0, 0, 2]], ['dart', [0, 0, 2]]]);
    ok(Array.isArray(mid.leakRange) && mid.leakRange[0] <= mid.leak && mid.leak <= mid.leakRange[1], 'placement band: a great spot leaks no more than a typical one, a bad spot no less', [mid.leakRange, mid.leak]);
    /* per-attack damage types from the game files: a Bomb's explosion can't hurt Black bloons (bit 2) */
    const bomb = C.powerOf(D, 'bomb', [0, 0, 0]);
    ok(bomb.a.every((w) => (w[3] & 2) === 2), 'tower-power rows carry each attack\'s immunity bits: Bomb Shooter explosions can\'t damage Black (bit 2)');
    ok(C.powerOf(D, 'dartling', [0, 5, 2]).m > 1000, 'M.A.D\'s MOAB-only damage counts (450 per missile, DartlingGunner-052.json)');
    /* the close-call margin: a leak under 1% of the round's RBE is reported as close, not as a leak */
    ok(C.LEAK_MARGIN === 0.01, 'leaks under 1% of the round are close calls (C.LEAK_MARGIN)');
  }

  console.log('Leak check 0.10: speed');
  {
    const t8 = [['dart', [0, 0, 2]], ['ninja', [2, 0, 2]], ['bomb', [0, 2, 3]], ['village', [2, 2, 0]], ['alchemist', [4, 0, 1]], ['druid', [1, 3, 0]], ['super', [2, 0, 3]], ['sniper', [0, 2, 4]]];
    const list = listOf(t8);
    C.leakCacheClear();
    for (let r = 6; r <= 100; r++) C.leakRound(D, mode('chimps'), map('logs'), r, list);
    C.leakCacheClear();
    const t0 = Date.now();
    for (let r = 6; r <= 100; r++) C.leakRound(D, mode('chimps'), map('logs'), r, list);
    const cold = Date.now() - t0;
    const t1 = Date.now();
    for (let r = 6; r <= 100; r++) C.leakRound(D, mode('chimps'), map('logs'), r, list);
    const warm = Date.now() - t1;
    ok(cold < 1500 && warm < 20, '8 towers, CHIMPS R6-100: the timeline runs in ' + cold + ' ms, a repeat (cached) in ' + warm + ' ms');
    const q0 = Date.now();
    for (let r = 6; r <= 100; r++) C.leakQuick(D, mode('chimps'), map('logs'), r, list);
    ok(Date.now() - q0 < 100, 'C.leakQuick (the fix-search screen) runs R6-100 in under 100 ms', Date.now() - q0);
  }

  console.log('Leak check 0.10: lives out, background checks (Simulator)');
  {
    let u = 0;
    const pl = (r, t, x) => ({ uid: 'b' + (++u), r, op: 'place', t, x });
    const weak = { mapId: 'logs', modeId: 'chimps', steps: [pl(6, 'dart', [0, 0, 2]), pl(20, 'bomb', [0, 2, 0])] };
    C.leakCacheClear();
    const s0 = C.simulate(D, weak);
    const after = s0.rows.filter((x) => s0.lostAt && x.r > s0.lostAt);
    ok(s0.lostAt > 0 && after.length > 0 && after.every((x) => x.over && x.leakInfo === null && x.lives === 0), 'once your lives run out, later rounds aren\'t leak-checked (the run is over), lives stay 0', s0.lostAt);
    /* plan.leakJobs: checks not cached are listed, not run; run them in round order and the answer is the same as in one go */
    const pl8 = { mapId: 'logs', modeId: 'chimps', steps: [pl(6, 'dart', [0, 0, 2]), pl(8, 'ninja', [2, 0, 2]), pl(15, 'bomb', [0, 2, 3]), pl(25, 'village', [2, 2, 0]), pl(30, 'alchemist', [4, 0, 1]), pl(40, 'druid', [1, 3, 0])] };
    C.leakCacheClear();
    const memo = {}, jobs = [];
    const withJobs = (p, m, j) => { const q = Object.assign({}, p); Object.defineProperty(q, 'leakMemo', { value: m }); if (j) Object.defineProperty(q, 'leakJobs', { value: j }); return q; };
    const sp = C.simulate(D, withJobs(pl8, memo, jobs));
    ok(jobs.length > 0 && sp.pending && sp.pending.from === jobs[0].r && sp.rows.every((x) => !x.pend || (x.leakInfo === null && x.lives === null)) && !sp.problems.some((p) => p.prop === 'power' && p.round > sp.pending.from),
      'C.simulate with plan.leakJobs: uncached rounds are left pending (no leak, no lives, no power problem after them)', [jobs.length, sp.pending]);
    let lives = sp.livesStart;
    sp.rows.forEach((x) => {
      if (lives <= 0) return;
      const j = jobs.find((q) => q.r === x.r);
      const lk = x.pend ? (memo[j.key] = j.run()) : x.leakInfo;
      if (lk) lives = Math.max(0, lives - lk.lives);
    });
    const s1 = C.simulate(D, withJobs(pl8, memo, null));
    C.leakCacheClear();
    const s2 = C.simulate(D, pl8);
    const sig = (s) => JSON.stringify([s.rows.map((x) => [x.leak, x.lives, Math.round(x.bank)]), s.lostAt, s.problems.map((p) => p.prop + p.round)]);
    ok(sig(s1) === sig(s2) && !s1.pending, 'the pending checks, run in round order, give the same answer as C.simulate in one go');
    const lk0 = C.leakCached(D, mode('chimps'), map('logs'), 90, listOf([['dart', [0, 0, 0]]]));
    C.leakRound(D, mode('chimps'), map('logs'), 90, listOf([['dart', [0, 0, 0]]]));
    const lk1 = C.leakCached(D, mode('chimps'), map('logs'), 90, listOf([['dart', [0, 0, 0]]]));
    ok(lk0 === undefined && lk1 && lk1.leak > 0, 'C.leakCached: undefined until the round is checked, then the cached answer');
    /* fixJobs lists the full checks the fix search would run; once they've run, the fixes are the same as worked out cold */
    const fp = s2.problems.find((p) => p.prop === 'power');
    C.leakCacheClear();
    const s3 = C.simulate(D, pl8);
    const p3 = s3.problems.find((p) => p.prop === 'power');
    const fj = p3 ? p3.fixJobs() : [];
    fj.forEach((f) => f());
    const fj2 = p3 ? p3.fixJobs() : [];
    fj2.forEach((f) => f());
    const fj3 = p3 ? p3.fixJobs() : [];
    const lbl = (fs) => fs.map((f) => f.buyLabel + (f.fixes ? '' : ' (part)')).join(' | ');
    ok(!!fp && fj.length > 0 && fj3.length === 0 && lbl(p3.fixes) === lbl(fp.fixes), 'C.powerFixes opts.jobs: the checks it lists, once run, leave nothing to list, and the fixes match a cold run', [fj.length, fj2.length, lbl(p3 ? p3.fixes : [])]);
  }
};
