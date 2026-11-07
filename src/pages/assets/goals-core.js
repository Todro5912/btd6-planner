/* Monkey Intel: goal tracking logic (My goals). Pure, no DOM. Adds helpers to MonkeyIntel.core.
   Browser: load after tools-core.js. Node: require('./goals-core.js') returns the core with these added.

   A goal is {tower, kind: 'paragon' | 'all' | 'upgrade', path, tier}. Tower progress (shared by every goal on
   that tower) is {u: [a,b,c] unlocked tiers, p: Paragon unlocked, bank: XP earned but not spent}.
   Like the game: runs add XP to the bank, and you spend it to unlock the next upgrade. */
(function (root) {
  'use strict';
  const C = (typeof module !== 'undefined' && module.exports) ? require('./tools-core.js') : root.MonkeyIntel.core;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const arr = (v) => (Array.isArray(v) ? v : []);

  C.goalTarget = (g) => (g.kind === 'upgrade' ? { kind: 'upgrade', path: g.path, tier: g.tier } : { kind: g.kind === 'paragon' ? 'paragon' : 'all' });
  C.goalName = function (D, g) {
    const t = C.tower(D, g.tower);
    if (!t) return '';
    if (g.kind === 'paragon') return t.paragon ? t.paragon.name : 'Every ' + t.name + ' tier 5';
    if (g.kind === 'upgrade') return C.upgradeName(t, g.path, g.tier) || t.name + ' upgrade';
    return 'Every ' + t.name.replace(/ Monkey$/, '') + ' tier 5';
  };
  /* where to farm a goal and how much XP a run pays: the one figure My goals and the XP calculator both show.
     settings: {me, emt, maxTier} from My profile (me must be true to count Monkey Education).
     When the tower guide's farm is the pick (Expert map, same mode), its helpers take part of the XP: the guide's
     xpPerRun is worked out with Monkey Education (and Elite Military Training for Military), so its share of that
     solo figure is applied to yours. Otherwise the run is "only this tower" and takes all of it. */
  C.goalFarm = function (D, towerId, need, settings) {
    settings = settings || {};
    const t = C.tower(D, towerId);
    const tier = C.TIERS.indexOf(settings.maxTier) >= 0 ? settings.maxTier : 'Expert';
    const me = settings.me === true, emt = !!settings.emt;
    const rows = C.farmTable(D, towerId, { me, emt, need });
    const best = C.farmPick(rows, tier);
    const fp = C.farmPlan(D, towerId);
    let share = 1, guide = null;
    if (best && fp && fp.xpPerRun > 0 && tier === 'Expert' && fp.modeId === best.modeId) {
      const ref = C.farmTable(D, towerId, { me: true, emt: true, need: 0 }).find((r) => r.modeId === best.modeId && r.tier === 'Expert');
      if (ref && ref.xp > 0) { share = Math.min(1, fp.xpPerRun / ref.xp); guide = fp; }
    }
    const perRun = best ? Math.round(best.xp * share) : 0;
    const runs = need > 0 && perRun > 0 ? Math.ceil(need / perRun) : 0;
    return { tier, rows, best, fp, guide, share, perRun, runs, minutes: best ? runs * best.minutes : 0,
      who: guide && share < 0.995 ? 'the guide\'s farm (its helpers take ' + Math.round((1 - share) * 100) + '% of the XP)' : 'only ' + (t ? t.name + 's' : 'this tower') };
  };
  /* everything the goal card needs, from the tower's progress and the settings ({me, emt, maxTier}) */
  C.goalView = function (D, g, prog, settings) {
    const t = C.tower(D, g.tower);
    if (!t) return null;
    if (g.kind === 'upgrade' && !([0, 1, 2].indexOf(g.path) >= 0 && g.tier >= 1 && g.tier <= 5)) return null; /* no path: not a goal */
    settings = settings || {};
    prog = prog || { u: [0, 0, 0], p: false, bank: 0 };
    const target = C.goalTarget(g);
    if (target.kind === 'paragon' && !t.paragon) target.kind = 'all';
    const u = arr(prog.u).length === 3 ? prog.u.slice() : [0, 0, 0];
    const bank = Math.max(0, num(prog.bank, 0));
    const full = C.xpPlan(D, t.id, [0, 0, 0], target, 0);
    const left = C.xpPlan(D, t.id, u, target, 0);
    if (target.kind === 'paragon' && prog.p) { left.steps = []; left.gross = 0; }
    const total = Math.max(1, full.gross);
    const remaining = left.gross; /* XP still to spend on unlocks */
    const need = Math.max(0, remaining - bank); /* XP still to earn */
    const earned = total - remaining + Math.min(bank, remaining);
    const complete = left.steps.length === 0; /* not remaining === 0: some upgrades cost 0 XP */
    const gf = C.goalFarm(D, t.id, need, settings);
    const tier = gf.tier, best = gf.best, perRun = gf.perRun;
    const next = left.steps[0] || null;
    const runsLeft = gf.runs;
    const nextNeed = next ? Math.max(0, next.xp - bank) : 0;
    return {
      t, g, target, name: C.goalName(D, g), u, p: !!prog.p, bank, total, remaining, need, earned,
      pct: complete ? 100 : Math.min(99.9, 100 * earned / total), complete,
      steps: left.steps, next, canUnlock: !!next && bank >= next.xp, nextNeed,
      runsNext: nextNeed > 0 && perRun > 0 ? Math.ceil(nextNeed / perRun) : 0,
      runsLeft, minutesLeft: best ? runsLeft * best.minutes : 0, best, perRun, farm: gf, farms: gf.rows.filter((r) => r.tier === tier), unknown: left.unknown,
      milestone: complete ? 'Unlocked' : earned / total >= 0.75 ? 'Nearly there' : earned / total >= 0.5 ? 'Halfway' : earned / total >= 0.25 ? 'A quarter done' : '',
    };
  };
  /* spend banked XP on one unlock; returns the new tower progress (or null if the bank can't pay) */
  C.unlockStep = function (prog, step, free) {
    if (!step) return null;
    const bank = Math.max(0, num(prog.bank, 0));
    if (!free && bank < step.xp) return null;
    const out = { u: arr(prog.u).slice(), p: !!prog.p, bank: free ? bank : bank - step.xp };
    if (step.paragon) out.p = true;
    else out.u[step.path] = Math.max(out.u[step.path], step.tier);
    return out;
  };

  /* the tower guide's farm as a Simulator plan: "4x Dart Monkey 4-0-2; 3x Dart Monkey 0-2-4" on "Dark Castle", "Expert Deflation" */
  const fold = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  C.towerFromName = function (D, name) {
    const n = fold(name);
    return arr(D.towers).find((t) => fold(t.name) === n) || arr(D.towers).find((t) => fold(t.name.replace(/ Monkey$/, '')) === n) || null;
  };
  C.farmPlan = function (D, towerId) {
    const g = (D.guides || {})[towerId] || {};
    const f = g.farm;
    if (!f || !f.setup) return null;
    /* "Tricky Tracks or Dark Castle": the first named map where every tower of the setup can be placed */
    const maps = String(f.map || '').split(/ or /).map((n) => n.replace(/\s*\(.*$/, '')).map((n) => arr(D.maps).find((m) => fold(m.name) === fold(n))).filter(Boolean);
    let map = maps[0];
    const mm = String(f.mode || '').toLowerCase();
    const mode = arr(D.modes).find((m) => mm.indexOf(m.name.toLowerCase()) >= 0 && !C.isSandbox(m))
      || (mm.indexOf('deflation') >= 0 ? C.mode(D, 'deflation') : mm.indexOf('impoppable') >= 0 ? C.mode(D, 'impoppable') : null);
    if (!map || !mode) return null;
    const start = C.modeRange(mode)[0];
    const steps = [];
    let n = 0;
    const re = /(?:(\d+)x )?([A-Z][A-Za-z .']+?) (\d)-(\d)-(\d)/g;
    const text = f.setup + '; ' + (f.helpers || '');
    let m;
    while ((m = re.exec(text))) {
      const t = C.towerFromName(D, m[2]);
      const x = [+m[3], +m[4], +m[5]];
      if (!t || !C.validCross(x)) continue;
      for (let k = 0; k < Math.min(8, +(m[1] || 1)); k++) steps.push({ uid: 'f' + (++n), r: start, op: 'place', t: t.id, x });
    }
    const hm = String(f.helpers || '').match(/hero ([A-Z][A-Za-z .']+?) \(/);
    const hero = hm && C.heroFromName ? C.heroFromName(D, hm[1]) : null;
    if (hero) steps.unshift({ uid: 'f0', r: start, op: 'hero', h: hero.id });
    if (!steps.some((s) => s.op === 'place' && s.t === towerId)) return null;
    const legal = (mp) => steps.every((s) => s.op !== 'place' || !C.placeIssue(D, mode, mp, C.tower(D, s.t)));
    map = maps.find(legal) || map;
    return { mapId: map.id, modeId: mode.id, steps, heroLevel: null, label: map.name + ', ' + mode.name, xpPerRun: f.xpPerRun };
  };
  /* a map to farm on when the guide has no farm: one of the hardest tier you have, where the tower is strong */
  C.farmMap = function (D, towerId, tier) {
    const maps = arr(D.maps).filter((m) => m.difficulty === tier);
    const strong = maps.find((m) => arr(((D.strats || {})[m.id] || {}).strongTowers).indexOf(towerId) >= 0);
    return strong || maps[0] || arr(D.maps)[0];
  };
  /* the Paragons ordered by XP from zero: what to aim for first */
  C.paragonsByXp = function (D) {
    return arr(D.towers).filter((t) => t.paragon).map((t) => ({ t, xp: C.xpPlan(D, t.id, [0, 0, 0], { kind: 'paragon' }, 0).gross }))
      .sort((a, b) => a.xp - b.xp);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  root.MonkeyIntel = root.MonkeyIntel || {};
  root.MonkeyIntel.core = C;
})(typeof window !== 'undefined' ? window : globalThis);
