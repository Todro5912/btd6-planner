/* Monkey Intel: Strategy Advisor logic. Pure, no DOM. Adds C.advise (and helpers) to MonkeyIntel.core.
   Browser: load after tools-core.js. Node: require('./advisor-core.js') returns the core with these added.

   You bring the map, the mode, a hero (or "pick one for me") and the monkeys you want to use.
   1. End crosspaths: each monkey gets one of its guide's best crosspaths (data/tower-guides.json), chosen
      together so the team answers every bloon property the mode throws at it and the total fits the cash the
      mode pays (coordinate search; trimmed versions of a crosspath are allowed when money is tight).
   2. Deadlines: for each need (camo, lead, MOAB...) in the order the rounds bring them, the cheapest step
      towards those end crosspaths that covers it is given that round as a deadline.
   3. Build order: round by round, buy what is due within the next few rounds first (earliest deadline first),
      then everything else cheapest-first, but only while every deadline left can still be paid for in time.
   4. The order is replayed through C.simulate, so its cash, coverage and leaks are the simulator's own. */
(function (root) {
  'use strict';
  const C = (typeof module !== 'undefined' && module.exports) ? require('./tools-core.js') : root.MonkeyIntel.core;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const arr = (v) => (Array.isArray(v) ? v : []);

  /* how much covering each need is worth when choosing end crosspaths */
  C.NEED_WEIGHT = { pop: 3000, camo: 1000, lead: 1000, purple: 600, black: 700, white: 600, zebra: 600, moab: 1300, ddt: 1000, bad: 900 };
  C.ADVISE_MAX = 8;
  C.URGENT_ROUNDS = 8; /* a deadline this close is bought before anything else */

  const fold = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  C.heroFromName = function (D, name) {
    const n = fold(name);
    if (!n) return null;
    return arr(D.heroes).find((h) => fold(h.name) === n) || arr(D.heroes).find((h) => fold(h.name).split(' ').indexOf(n.split(' ')[0]) >= 0)
      || arr(D.heroes).find((h) => n.split(' ').indexOf(fold(h.name).split(' ')[0]) >= 0) || null;
  };
  /* heroes the map page recommends, as hero objects, best first */
  C.mapHeroes = function (D, mapId) {
    const s = (D.strats || {})[mapId] || {};
    const out = [];
    arr(s.heroes).forEach((nm) => { const h = C.heroFromName(D, nm); if (h && out.indexOf(h) < 0) out.push(h); });
    return out;
  };

  /* first round each need appears in this mode */
  C.needRounds = function (D, mode) {
    const [a, b] = C.modeRange(mode);
    const first = {};
    for (let r = a; r <= b; r++) {
      const need = C.roundNeeds(C.roundRow(D, mode, r));
      Object.keys(need).forEach((p) => { if (first[p] == null) first[p] = r; });
    }
    return first;
  };

  const mainPath = (x) => [0, 1, 2].reduce((m, p) => (x[p] > x[m] ? p : m), 0);
  /* end crosspaths worth trying for one tower: the guide's list in its order, then trimmed copies (main path 4, 3) */
  C.endCandidates = function (D, id, props, planX) {
    const g = (D.guides || {})[id] || {};
    const e = D.pop && D.pop.towers && D.pop.towers[id];
    const out = [];
    const seen = {};
    const push = (x, rank, use, trimmed, mapPlan) => {
      const k = x.join('');
      if (!C.validCross(x) || seen[k]) return;
      seen[k] = 1;
      out.push({ x, rank, use: use || '', trimmed: !!trimmed, mapPlan: !!mapPlan });
    };
    arr(g.bestCrosspaths).forEach((b, i) => { const x = C.parseCode(b && b.code); if (x) push(x, i, b.use, false); });
    /* the map page's own plan ends this tower here (E15: the Druid's 0-1-5 on Dark Castle) */
    arr(planX).forEach((x) => { const k = x.join(''); const c = out.find((o) => o.x.join('') === k); if (c) c.mapPlan = true; else push(x.slice(), 1, 'the map page\'s plan', false, true); });
    out.slice().forEach((c) => {
      const m = mainPath(c.x);
      for (let cap = c.x[m] - 1; cap >= 3; cap--) { const y = c.x.slice(); y[m] = cap; push(y, c.rank + 1 + (c.x[m] - cap), '', true); }
    });
    /* the cheapest crosspaths that answer a need on their own, so a team missing (say) camo can still be fixed in-path */
    arr(props).forEach((p) => {
      if (!e || !e[p] || p === 'ddt') return;
      C.candidateCrosses([e[p]], [0, 0, 0]).sort((x, y) => (x[0] + x[1] + x[2]) - (y[0] + y[1] + y[2])).slice(0, 2)
        .forEach((x) => push(x, 4, '', true));
    });
    if (!out.length) push([0, 0, 0], 4, '', true);
    return out;
  };
  /* every crosspath y with from <= y <= x (componentwise) */
  C.subCrosses = function (x, from) {
    const lo = from || [0, 0, 0];
    const out = [];
    for (let a = lo[0]; a <= x[0]; a++) for (let b = lo[1]; b <= x[1]; b++) for (let c = lo[2]; c <= x[2]; c++) out.push([a, b, c]);
    return out;
  };

  /* opts: {mapId, modeId, heroId ('' | 'auto' | id), towers: [id], force: {id: [a,b,c]}, unlocked: {id: [a,b,c]} (only use these tiers),
           unlocks: {id: [a,b,c]} (what you have unlocked, for labels), missing: {id: true} (towers you marked not unlocked),
           fx: C.profileFx(...) (your Monkey Knowledge), ownsHero: (id) => bool, instas: [{t, x, n}] (place these for free),
           extras: [{kind: 'up'|'new'|'hero', t, x, by}] (fixes you added: buy them by that round), players} */
  /* "Pick for me": the map's best hero you own that can go on this map, else Quincy, else the map's best.
     advisor.js uses the same function for the label, so the label always names the hero the plan uses. */
  C.autoHero = function (D, map, own) {
    own = typeof own === 'function' ? own : () => true;
    const list = C.mapHeroes(D, map && map.id).filter((h) => !C.heroIssue(D, map, h));
    return list.find((h) => own(h.id)) || (own('quincy') ? C.hero(D, 'quincy') : null) || list[0] || C.hero(D, 'quincy');
  };
  /* the crosspaths the map page's own plan (its known start, map-strats) ends each tower at: {id: [[a,b,c], ...]} */
  C.mapPlanCross = function (D, mapId) {
    const p = (D.presets || {})[mapId];
    const out = {};
    if (!p) return out;
    const last = {};
    arr(p.steps).forEach((s) => { if ((s.op === 'place' || s.op === 'up') && s.t && C.validCross(s.x)) last[s.t + '#' + s.n] = { t: s.t, n: s.n, x: s.x.slice() }; });
    Object.keys(last).map((k) => last[k]).sort((p2, q) => p2.n - q.n).forEach((v) => {
      const l = out[v.t] || (out[v.t] = []);
      if (!l.some((x) => x.join('') === v.x.join(''))) l.push(v.x);
    });
    return out;
  };
  C.POWER_LOOK = 3; /* the build order looks this many rounds ahead for a leak, so it can save up for the fix (5 cost 10% more
     leak checks; on 252 test plans 3 kept more lives in total, and the round lives run out moved by under one on average) */
  C.ADVISE_EVALS = 1800; /* the most leak checks one plan may run (keeps the Advisor fast on a phone) */
  C.COPIES_MAX = 4; /* extra copies of a picked tower the build order may add for pop power */
  C.advise = function (D, opts) {
    const mode = C.mode(D, opts.modeId) || C.mode(D, 'medium');
    const map = C.map(D, opts.mapId) || D.maps[0];
    const [a, b] = C.modeRange(mode);
    const mult = num(mode.costMult, 1);
    const fx = C.fxFor(opts.fx, mode);
    const players = C.players(opts.players);
    const base = C.baseCash(D, mode, players);
    /* the Simulator's own cash rules (C.moreCash, C.leakCash), so both tools show the same bank (T3) */
    const more = C.moreCash(fx, mode, players);
    if (more) Object.keys(base).forEach((k) => { base[k] += more; });
    const pm = D.pop || {};
    const force = opts.force || {};
    const heroOpts = C.heroOpts(fx);
    const rules = mode.rules || {};
    const livesStart = num(mode.lives, 100);
    const missing = opts.missing || {};

    /* hero */
    let hero = null, heroWhy = '';
    if (opts.heroId === 'auto') {
      const own = typeof opts.ownsHero === 'function' ? opts.ownsHero : () => true;
      hero = C.autoHero(D, map, own);
      const list = C.mapHeroes(D, map.id);
      heroWhy = 'best hero for ' + map.name + (list[0] && hero !== list[0] && !own(list[0].id) ? ' that you own (' + list[0].name + ' is the top pick)' : '');
    } else if (opts.heroId) { hero = C.hero(D, opts.heroId); heroWhy = 'your pick'; }
    if (hero && C.heroIssue(D, map, hero)) { heroWhy = C.heroIssue(D, map, hero); hero = null; }
    const heroCost = hero ? C.price(hero.cost * (fx ? fx.heroCostMult : 1), mult) || 0 : 0;
    let heroGuess = Math.min(b, a + 3); /* set from the cash once the picks are known */
    const noHeroFor = arr(opts._heroRetry); /* needs the hero turned out too late for (T8): the towers cover them */
    const heroAt = (r) => (hero && r >= heroGuess ? { id: hero.id, label: hero.name, level: Math.max(1, C.heroLevelAt(D, hero.id, heroGuess, r, map.difficulty, heroOpts)) } : null);

    const first = C.needRounds(D, mode);
    const needProps = C.NEEDS.filter((p) => first[p] != null && p !== 'pop');
    const planX = C.mapPlanCross(D, map.id);
    /* picks */
    const unusable = [];
    const dropped = [];
    const seen = {};
    const picks = [];
    arr(opts.towers).forEach((id) => {
      const t = C.tower(D, id);
      if (!t || seen[id]) return;
      seen[id] = 1;
      const issue = C.placeIssue(D, mode, map, t);
      if (issue) { unusable.push({ id, name: t.name, issue }); return; }
      if (picks.length >= C.ADVISE_MAX) { dropped.push({ id, name: t.name }); return; } /* C18: say what was dropped */
      let cands = C.endCandidates(D, id, needProps, planX[id]);
      const lim = opts.unlocked && Array.isArray(opts.unlocked[id]) ? opts.unlocked[id] : null;
      let limited = false;
      if (lim) {
        /* only what you have unlocked: cap every candidate at your tiers (a capped path counts as a cheaper version) */
        const seenX = {};
        cands = cands.map((c) => {
          const x = c.x.map((v, q) => Math.min(v, num(lim[q], 0)));
          const changed = x.join('') !== c.x.join('');
          if (changed) limited = true;
          return { x, rank: c.rank + (changed ? 2 : 0), use: changed ? '' : c.use, trimmed: c.trimmed || changed, mapPlan: c.mapPlan && !changed };
        }).filter((c) => { const k = c.x.join(''); if (!C.validCross(c.x) || seenX[k]) return false; seenX[k] = 1; return true; });
        if (!cands.length) cands = [{ x: [0, 0, 0], rank: 5, use: '', trimmed: true }];
      }
      const f = force[id] && C.validCross(force[id]) ? force[id].slice() : null;
      picks.push({ id, t, name: t.name, label: t.name.replace(/ Monkey$/, ''), cands, forced: f, limited, lim, notUnlocked: !!missing[id] });
    });
    const res = { mode, map, hero, heroWhy, heroCost, start: a, end: b, picks: [], unusable, dropped, steps: [], plan: null, sim: null, leftovers: [], gaps: [], needs: {}, extras: [] };
    if (!picks.length) return res;
    /* when the hero can really be bought: the first round the mode's cash pays for him and your cheapest pick */
    if (hero) {
      const minPlace = Math.min.apply(null, picks.map((p) => C.placeCost(p.t, [0, 0, 0], mult)));
      heroGuess = a;
      while (heroGuess < b && num(base[heroGuess], 0) < heroCost + minPlace) heroGuess++;
      heroGuess = Math.min(b, heroGuess + 1);
    }
    const heroFor = (p, r) => (noHeroFor.indexOf(p) >= 0 ? null : heroAt(r));
    const nPicks = picks.length;

    res.needs = first;
    const needList = C.NEEDS.filter((p) => first[p] != null);
    /* money for the end build: what the mode has paid by ~88% of the way through (a tier 5 bought on the last round is no use) */
    const budgetRound = Math.max(a, b - Math.round((b - a) * 0.12));
    const budget = Math.max(1, num(base[budgetRound], 0) - heroCost);
    const heroEnd = heroAt(b);

    /* ---- 1. end crosspaths ---- */
    const instsFor = (xs) => picks.map((p, i) => ({ uid: 'a' + i, id: p.id, x: xs[i], label: p.label }));
    const costOf = (xs) => picks.reduce((s, p, i) => s + C.placeCost(p.t, xs[i], mult), 0);
    const meta = picks.map((p) => p.cands);
    /* a need counts in full when the end build covers it with the hero at the level it has when that need first shows up,
       half when only the hero's later levels cover it */
    const covMemo = {};
    const covOf = (xs, hh) => {
      const k = xs.map((x) => x.join('')).join(',') + '|' + (hh ? hh.level : 0);
      return covMemo[k] || (covMemo[k] = C.coverFlags(D, instsFor(xs), hh));
    };
    const heroLv = {};
    needList.forEach((p) => { heroLv[p] = heroFor(p, first[p]); });
    const score = (ci) => {
      const xs = picks.map((p, i) => (p.forced || meta[i][ci[i]].x));
      const st = covOf(xs, heroEnd);
      let s = 0;
      needList.forEach((p) => {
        if (!st[p]) return;
        s += (C.NEED_WEIGHT[p] || 500) * (covOf(xs, heroLv[p])[p] ? 1 : 0.5);
      });
      const cost = costOf(xs);
      if (cost > budget) s -= 60 + 400 * (cost - budget) / budget;
      else s += 300 * cost / budget; /* spending the mode's cash on your picks; the build order then checks the damage round by round */
      picks.forEach((p, i) => { if (!p.forced) { const c = meta[i][ci[i]]; s -= c.rank * 8 + (c.trimmed ? 10 : 0); } });
      return s;
    };
    const ci = picks.map(() => 0);
    let best = score(ci);
    for (let pass = 0; pass < 2; pass++) { /* two passes: 4 gave the same end crosspaths on 144 test plans, at twice the cost */
      let changed = false;
      picks.forEach((p, i) => {
        if (p.forced) return;
        for (let k = 0; k < meta[i].length; k++) {
          if (k === ci[i]) continue;
          const old = ci[i];
          ci[i] = k;
          const s = score(ci);
          if (s > best + 1e-9) { best = s; changed = true; } else ci[i] = old;
        }
      });
      if (!changed) break;
    }
    const finals = picks.map((p, i) => (p.forced || meta[i][ci[i]].x).slice());
    const chosen = picks.map((p, i) => (p.forced ? null : meta[i][ci[i]]));

    /* fixes you added (extras): an upgrade raises that tower's end crosspath to include it (merged, T6); a new copy is
       its own tower; each is due by its round */
    const extraDl = []; /* [{i, x, by}] */
    const fixedCopies = []; /* [{id, x, by}] */
    let heroBy = Infinity;
    arr(opts.extras).forEach((e) => {
      if (!e) return;
      const by = Math.max(a, Math.min(b, Math.round(num(e.by, a))));
      if (e.kind === 'hero') { if (hero) heroBy = Math.min(heroBy, by); res.extras.push(e); return; }
      const i = picks.findIndex((p) => p.id === e.t);
      if (!C.validCross(e.x)) return;
      if (i >= 0 && e.kind === 'up') {
        finals[i] = C.mergeCross(finals[i], e.x);
        extraDl.push({ i, x: e.x.slice(), by });
        res.extras.push(e);
      } else if (i >= 0 && e.kind === 'new') {
        if (C.geq(finals[i], e.x)) extraDl.push({ i, x: e.x.slice(), by, place: true });
        else fixedCopies.push({ id: e.t, x: e.x.slice(), by });
        res.extras.push(e);
      }
    });
    const endState = C.coverState(D, instsFor(finals), heroEnd);

    /* ---- 2. deadlines: cheapest step towards the end crosspaths that covers each need in time ---- */
    const target = picks.map(() => null); /* committed crosspath, null = not placed yet */
    const tierDl = picks.map(() => [[], [], []]); /* tierDl[i][path][tier] = deadline round */
    const tierWhy = picks.map(() => [[], [], []]);
    const placeDl = picks.map(() => Infinity);
    const placeWhy = picks.map(() => []);
    const jobs = picks.map(() => []);
    const covers = (tg, p, r) => {
      const insts = [];
      tg.forEach((x, i) => { if (x) insts.push({ uid: 'a' + i, id: picks[i].id, x, label: picks[i].label }); });
      return C.coverFlags(D, insts, heroFor(p, r))[p];
    };
    const deltaCost = (i, from, to) => (from ? C.upgradeCost(picks[i].t, from, to, mult) : C.placeCost(picks[i].t, to, mult));
    const commit = (i, y, p, r) => {
      const from = target[i] || [0, 0, 0];
      if (!target[i]) { placeDl[i] = Math.min(placeDl[i], r); placeWhy[i].push(p); }
      for (let q = 0; q < 3; q++) for (let k = from[q] + 1; k <= y[q]; k++) {
        tierDl[i][q][k] = Math.min(num(tierDl[i][q][k], Infinity), r);
        (tierWhy[i][q][k] = tierWhy[i][q][k] || []).push(p);
      }
      target[i] = C.maxCross(target[i] || [0, 0, 0], y);
      if (p !== 'fix') jobs[i].push({ prop: p, round: r });
    };
    const order = needList.slice().sort((p, q) => (first[p] - first[q]) || (C.NEEDS.indexOf(p) - C.NEEDS.indexOf(q)));
    const heroJobs = [];
    order.forEach((p) => {
      const r = first[p];
      if (!endState.cov[p].length) return; /* the team can't cover it at all: a gap, handled after the sim */
      if (covers(target, p, r)) {
        if (hero && p !== 'pop' && C.coverState(D, [], heroFor(p, r)).cov[p].length && !covers(target, p, r - 1000)) heroJobs.push({ prop: p, round: r });
        return;
      }
      let pick = null;
      picks.forEach((pk, i) => {
        C.subCrosses(finals[i], target[i] || [0, 0, 0]).forEach((y) => {
          if (target[i] && y.join('') === target[i].join('')) return;
          const tg = target.slice();
          tg[i] = y;
          if (!covers(tg, p, r)) return;
          const cost = deltaCost(i, target[i], y);
          if (!pick || cost < pick.cost) pick = { list: [[i, y]], cost };
        });
      });
      if (!pick) {
        /* needs two towers at once (a DDT answer plus support, say): try groups of towers at their end crosspaths */
        for (let mask = 1; mask < (1 << picks.length); mask++) {
          const tg = target.slice();
          let cost = 0;
          const list = [];
          picks.forEach((pk, i) => { if (mask & (1 << i)) { cost += deltaCost(i, target[i], finals[i]); tg[i] = finals[i]; list.push([i, finals[i]]); } });
          if (covers(tg, p, r) && (!pick || cost < pick.cost)) pick = { list, cost };
        }
      }
      if (pick) pick.list.forEach(([i, y]) => commit(i, y, p, r));
    });
    extraDl.forEach((e) => {
      const from = target[e.i] || [0, 0, 0];
      if (!target[e.i]) placeDl[e.i] = Math.min(placeDl[e.i], e.by);
      for (let q = 0; q < 3; q++) for (let k = 1; k <= e.x[q]; k++) {
        tierDl[e.i][q][k] = Math.min(num(tierDl[e.i][q][k], Infinity), e.by);
        if (k > from[q]) (tierWhy[e.i][q][k] = tierWhy[e.i][q][k] || []).push('fix');
      }
      placeDl[e.i] = Math.min(placeDl[e.i], e.by);
    });

    /* ---- 3. build order: round by round, as the Simulator will play it ---- */
    const atoms = [];
    const addAtoms = (i, dlOf) => {
      const pk = picks[i];
      /* your MK price cuts (My profile); first-only ones and the free tower are charged when bought, like the Simulator */
      atoms.push({ i, kind: 'place', cost: C.mkPlaceCost(D, pk.t, [0, 0, 0], mult, fx, null), dl: dlOf('place'), why: dlOf('placeWhy') });
      for (let q = 0; q < 3; q++) for (let k = 1; k <= finals[i][q]; k++) {
        atoms.push({ i, kind: 'tier', path: q, tier: k, cost: C.mkTierCost(pk.t, q, k, mult, fx), dl: dlOf('tier', q, k), why: dlOf('tierWhy', q, k) });
      }
    };
    picks.forEach((pk, i) => addAtoms(i, (w, q, k) => (w === 'place' ? placeDl[i] : w === 'placeWhy' ? placeWhy[i] : w === 'tier' ? num(tierDl[i][q][k], Infinity) : tierWhy[i][q][k] || [])));
    /* a copy you added from a fix: its own tower, due by its round */
    const addCopy = (id, x, by, why) => {
      const src = picks.find((p) => p.id === id);
      const t = src ? src.t : C.tower(D, id);
      const n = picks.filter((p) => p.id === id).length + 1;
      const j = picks.length;
      picks.push({ id, t, name: t.name, label: t.name.replace(/ Monkey$/, ''), copyOf: src ? picks.indexOf(src) : null, copyN: n, cands: [], forced: x, fixed: true });
      finals.push(x.slice());
      chosen.push(null);
      jobs.push([]);
      addAtoms(j, (w) => (w === 'place' || w === 'tier' ? by : [why]));
      return j;
    };
    fixedCopies.forEach((c) => addCopy(c.id, c.x, c.by, 'fix'));
    const heroAtom = hero ? { kind: 'hero', cost: heroCost, dl: Math.min(b, heroBy, heroJobs.length ? heroGuess : a + 6), why: heroJobs.map((j) => j.prop) } : null;
    if (heroAtom) atoms.push(heroAtom);
    /* income pays back only if bought early: farms get soft deadlines from the first rounds */
    if (!(rules.noIncome || rules.noIncomeTowers)) {
      let k = 0;
      atoms.forEach((at) => {
        if (at.kind === 'hero' || picks[at.i].id !== 'farm') return;
        at.dl = Math.min(at.dl, Math.min(b, a + 6 + 3 * (k++)));
        at.why = at.why.concat(['income']);
      });
    }
    const owned = picks.map(() => null);
    /* Glacial Trail freezes each tower by the round it was placed (C.glacialFrozen), so the plan's leak checks need it there */
    const glacial = map.id === 'glacial-trail';
    const placedR = picks.map(() => null);
    let heroRound = null;
    /* Insta Monkeys you own: the best one for each pick (not past its end crosspath) is placed free on the first round */
    const instaUsed = picks.map(() => null);
    const buys = [];
    if (arr(opts.instas).length && !rules.noInsta) {
      const left = arr(opts.instas).map((x) => Object.assign({}, x));
      picks.forEach((pk, i) => {
        if (pk.fixed) return;
        let bst = null;
        left.forEach((ins) => {
          if (ins.t !== pk.id || !(ins.n > 0) || !C.validCross(ins.x) || !C.geq(finals[i], ins.x)) return;
          const save = C.placeCost(pk.t, ins.x, mult);
          if (!bst || save > bst.save) bst = { ins, save };
        });
        if (!bst) return;
        bst.ins.n--;
        instaUsed[i] = { x: bst.ins.x.slice(), save: bst.save };
        owned[i] = bst.ins.x.slice();
        placedR[i] = a;
        atoms.forEach((at) => {
          if (at.i !== i || at.kind === 'hero') return;
          if (at.kind === 'place' || at.tier <= bst.ins.x[at.path]) { at.bought = a; at.cost = 0; }
        });
        buys.push({ r: a, at: atoms.find((at) => at.i === i && at.kind === 'place'), x: bst.ins.x.slice(), insta: true });
      });
    }
    const ready = (at) => {
      if (at.bought) return false;
      if (at.kind === 'place' || at.kind === 'hero') return true;
      const x = owned[at.i];
      return !!x && x[at.path] === at.tier - 1;
    };
    let spent = 0, income = 0, lostCash = 0, lives = livesStart;
    const mkUsed = {};
    const buyAtom = (at, r) => {
      const price = at.kind === 'place' ? C.mkPlaceCost(D, picks[at.i].t, [0, 0, 0], mult, fx, mkUsed) : at.cost;
      at.bought = r;
      spent += price;
      if (at.kind === 'hero') heroRound = r;
      else if (at.kind === 'place') { owned[at.i] = [0, 0, 0]; placedR[at.i] = r; }
      else owned[at.i][at.path] = at.tier;
      buys.push({ r, at, x: at.kind === 'hero' ? null : owned[at.i].slice(), paid: price });
    };

    /* the leak check, as C.simulate runs it, for one moment of the plan (memoised: most moments repeat) */
    const memo = {};
    let evals = 0, searchCut = null;
    const lvAt = (r, hr) => (hero && hr != null && r >= hr ? Math.max(1, C.heroLevelAt(D, hero.id, hr, r, map.difficulty, heroOpts)) : 0);
    /* the attackers of one moment (same for every round with the same towers and hero level): built once */
    const lists = {};
    const listFor = (L, lv, hr) => {
      const k = lv + (glacial && lv ? '@' + hr : '') + '|' + L.map((q) => q.id + q.x.join('') + (glacial ? '@' + q.placedAt : '')).sort().join(',');
      if (lists[k]) return lists[k];
      const hh = lv ? { id: hero.id, level: lv, label: 'hero', placedAt: glacial ? hr : null } : null;
      return (lists[k] = { k, list: C.powerWithSupport(C.powerList(D, L, hh, fx), C.coverState(D, L, hh)) });
    };
    const leakOf = (r, L, lv, hr) => {
      const ls = listFor(L, lv, hr);
      const k = r + '|' + ls.k;
      if (memo[k] !== undefined) return memo[k];
      evals++;
      return (memo[k] = C.leakRound(D, mode, map, r, ls.list, fx));
    };
    const leakAt = (r, own, hr, pr) => {
      const L = [];
      pr = pr || placedR;
      own.forEach((x, i) => { if (x) L.push({ uid: 'a' + i, id: picks[i].id, x, label: 'a' + i, placedAt: glacial ? pr[i] : null }); });
      return leakOf(r, L, lvAt(r, hr), hr);
    };
    const isProblem = (lk, livesLeft) => !!lk && (C.leakIsProblem(lk.leak, lk.rbe, livesStart, lk.lives) || (lk.lives > 0 && livesLeft - lk.lives <= 0));
    const skip = {}; /* rounds the build order couldn't hold: {reason, cost, cash} */
    /* buying more never makes a leak worse (an estimate the full plan run then checks), so rounds already found fine for a
       smaller build stay fine: the scan starts after them. A sale or the hero changing starts it over; after lives are lost,
       a round whose earlier answer is now a problem is checked again with what you own */
    let known = null;
    const grew = (prev) => prev.own.every((x, i) => !x || (owned[i] && C.geq(owned[i], x))) && prev.hr === heroRound;
    const firstProblem = (r) => {
      const hi = Math.min(b, r + C.POWER_LOOK);
      if (!(known && grew(known) && known.okUntil >= r)) known = { lk: {}, okUntil: r - 1 };
      let lv = lives, res = null;
      for (let k = r; k <= hi; k++) {
        const old = k <= known.okUntil;
        let lk = old ? known.lk[k] : (known.lk[k] = leakAt(k, owned, heroRound));
        if (!lk) continue;
        /* a smaller build's result can only say "problem" now because lives were lost since: check it with what you own */
        if (!skip[k] && isProblem(lk, lv) && old) { lk = known.lk[k] = leakAt(k, owned, heroRound); if (!lk) continue; }
        if (!skip[k] && isProblem(lk, lv)) { res = { k, lk, lives: lv }; break; }
        lv -= lk.lives;
      }
      known.okUntil = res ? res.k - 1 : Math.max(known.okUntil, hi);
      known.own = owned.map((x) => (x ? x.slice() : x)); known.hr = heroRound;
      return res;
    };
    /* what the build order can buy for pop power: more tiers on a pick (towards its end crosspath), a copy of a pick, the hero */
    const copyCount = () => picks.filter((p) => p.copyOf != null && !p.fixed).length;
    const powerCands = (r, k) => {
      const out = [];
      picks.forEach((pk, i) => {
        if (pk.fixed && owned[i]) return;
        const cur = owned[i];
        if (pk.fixed) {
          const ats = atoms.filter((at) => at.i === i && !at.bought);
          out.push({ i, y: finals[i], ats, cost: ats.reduce((s2, at) => s2 + at.cost, 0) });
          return;
        }
        C.subCrosses(finals[i], cur || [0, 0, 0]).forEach((y) => {
          if (cur && y.join('') === cur.join('')) return;
          const ats = atoms.filter((at) => at.i === i && !at.bought && (at.kind === 'place' ? !cur : at.tier <= y[at.path] && at.tier > (cur ? cur[at.path] : 0)));
          out.push({ i, y, ats, cost: ats.reduce((s2, at) => s2 + at.cost, 0) });
        });
      });
      if (copyCount() < C.COPIES_MAX) {
        for (let i = 0; i < nPicks; i++) {
          const pk = picks[i];
          if (!owned[i] || C.BUFF_TOWERS.indexOf(pk.id) >= 0 || pk.id === 'farm' || !C.powerOf(D, pk.id, finals[i])) continue;
          if (picks.filter((p) => p.id === pk.id).length > 3) continue;
          const xs = C.subCrosses(finals[i]).filter((y) => y.every((v) => v <= 3)).map((y) => ({ x: y, cost: C.mkPlaceCost(D, pk.t, y, mult, fx, null), px: C.powerProxy(D, pk.id, y) }));
          C.paretoCross(xs.filter((c) => c.px.has), 4).forEach((c) => out.push({ copy: i, y: c.x, cost: c.cost }));
        }
      }
      if (heroAtom && !heroAtom.bought) out.push({ hero: true, cost: heroCost });
      return out;
    };
    const stateWith = (c, r) => {
      const own = owned.slice();
      let hr = heroRound;
      if (c.hero) hr = r;
      else if (c.copy != null) own.push(c.y);
      else own[c.i] = c.y;
      return { own, hr };
    };
    const leakWith = (c, r, k) => {
      const s2 = stateWith(c, r);
      const pr = s2.own.map((x, i) => (i < placedR.length && placedR[i] != null ? placedR[i] : r)); /* a new buy is placed at r */
      if (c.copy != null) {
        /* a copy isn't in picks yet: check it as one more tower */
        const L = [];
        s2.own.forEach((x, i) => { if (x) L.push({ uid: 'a' + i, id: i < picks.length ? picks[i].id : picks[c.copy].id, x, label: 'a' + i, placedAt: glacial ? pr[i] : null }); });
        return leakOf(k, L, lvAt(k, s2.hr), s2.hr);
      }
      return leakAt(k, s2.own, s2.hr, pr);
    };
    const projected = (k, r, cash) => cash + num(base[k], 0) - num(base[r], 0) + income * Math.max(0, k - r);
    const buyCand = (c, r) => {
      if (c.hero) buyAtom(heroAtom, r);
      else if (c.copy != null) {
        const j = addCopy(picks[c.copy].id, c.y, r, 'power');
        picks[j].fixed = false;
        picks[j].copyOf = c.copy;
        atoms.filter((at) => at.i === j).forEach((at) => buyAtom(at, r));
      } else c.ats.slice().sort((p, q) => (p.kind === 'place' ? -1 : q.kind === 'place' ? 1 : p.tier - q.tier)).forEach((at) => buyAtom(at, r));
      powerBuys.push({ r, c });
    };
    const powerBuys = [];
    /* pop power for the first leak in the next few rounds: buy the cheapest thing that stops it if you can pay now; save up when
       you can pay by then; else buy what removes the most leak per $ now. A round nothing can hold is noted and skipped */
    /* would spending `cost` now still leave enough for every deadline left (base income only)? */
    const safeCost = (cost, r, cash, skipAt) => {
      const due = atoms.filter((x) => !x.bought && isFinite(x.dl) && x !== skipAt).sort((p, q) => p.dl - q.dl);
      let need = 0;
      for (const d of due) {
        need += d.cost;
        const dr = Math.max(r, Math.min(b, d.dl));
        if (cash - cost + (base[dr] - base[r]) - need < -0.5) return false;
      }
      return true;
    };
    const powerStep = (pw, r, cash, minor) => {
      /* a small leak (a few of many lives) doesn't take the cash a deadline (camo, a farm) needs */
      const all = powerCands(r, pw.k).filter((c) => !minor || safeCost(c.cost, r, cash)).sort((p, q) => p.cost - q.cost);
      const lim = projected(pw.k, r, cash) + 0.5;
      let fixer = null, partial = null, pv = 0;
      for (const c of all) {
        if (c.cost > lim) break;
        if (evals > C.ADVISE_EVALS) { searchCut = searchCut || r; break; }
        const lk = leakWith(c, r, pw.k);
        if (!lk) continue;
        if (!isProblem(lk, pw.lives)) { fixer = c; break; }
        const gain = pw.lk.leak - lk.leak;
        if (c.cost <= cash + 0.5 && gain > 0.5 && gain / Math.max(1, c.cost) > pv) { pv = gain / Math.max(1, c.cost); partial = c; }
      }
      if (fixer && fixer.cost <= cash + 0.5) return { buy: fixer };
      if (fixer && pw.k > r) return { wait: true };
      if (partial) return { buy: partial };
      if (pw.k > r && !searchCut) return { wait: true };
      /* nothing in time: why? the cheapest buy from your picks that would hold it, whatever the cash */
      let need = null;
      if (!searchCut) for (const c of all) { if (c.cost <= lim) continue; if (evals > C.ADVISE_EVALS) break; const lk = leakWith(c, r, pw.k); if (lk && !isProblem(lk, pw.lives)) { need = c; break; } }
      skip[pw.k] = { reason: need ? 'cash' : 'none', cost: need ? need.cost : null, cash: Math.round(projected(pw.k, r, cash)), leak: pw.lk.leak, rbe: pw.lk.rbe };
      return { skip: true };
    };
    for (let r = a; r <= b; r++) {
      for (let guard = 0; guard < 60; guard++) {
        const cash = base[r] + income - spent - lostCash;
        const open = atoms.filter(ready);
        const pw = searchCut || lives <= 0 || opts.noPowerPlan ? null : firstProblem(r); /* out of lives: the run is over, stop buying for it */
        const urgent = (x) => x.dl <= r + C.URGENT_ROUNDS;
        open.sort((p, q) => (urgent(q) - urgent(p)) || (urgent(p) ? (p.dl - q.dl) : 0) || (p.cost - q.cost) || ((p.i || 0) - (q.i || 0)));
        /* a small leak in a mode with lives to spare: a few lives (an estimate), not a lost run */
        const minor = !!pw && livesStart > 1 && pw.lk.lives <= Math.max(1, 0.03 * livesStart) && pw.lives - pw.lk.lives > 0.5 * livesStart;
        /* 1. a coverage or income deadline that comes before the next leak (or the leak is small) */
        if (open.length && urgent(open[0]) && open[0].cost <= cash + 0.5 && (!pw || minor || open[0].dl <= pw.k)) { buyAtom(open[0], r); continue; }
        /* 2. pop power */
        if (pw) {
          const d = powerStep(pw, r, cash, minor);
          if (d.buy) { buyCand(d.buy, r); continue; }
          if (d.skip) continue;
          break; /* saving up for the fix */
        }
        if (!open.length) break;
        /* 3. everything else, cheapest first, while every deadline left can still be paid for in time (base income only) */
        const buy = open.find((x) => x.cost <= cash + 0.5 && (urgent(x) || safeCost(x.cost, r, cash, x)));
        if (!buy) break;
        buyAtom(buy, r);
      }
      /* the round plays: leaks cost lives and the pop cash of what leaked (C.simulate's rules), then income */
      const lk = lives > 0 ? leakAt(r, owned, heroRound) : null; /* out of lives: the run is over (C.simulate stops checking too) */
      if (lk) { lives = Math.max(0, lives - lk.lives); lostCash += C.leakCash(mode, C.roundRow(D, mode, r), r, lk.leak, players); }
      owned.forEach((x, i) => { if (x) income += C.mkIncome(D, mode, picks[i].id, x, fx); });
      if (hero && heroRound != null) income += C.heroIncome(mode, hero.id, lvAt(r, heroRound));
    }

    /* merge one tower's buys in the same round into one step */
    const steps = [];
    const placeUid = picks.map(() => null);
    const keyOf = {};
    buys.sort((p, q) => p.r - q.r);
    buys.forEach((by) => {
      const at = by.at;
      if (at.kind === 'hero') { steps.push({ uid: 'h1', r: by.r, op: 'hero', h: hero.id, why: at.why.slice(), cost: by.paid }); return; }
      const k = by.r + ':' + at.i + (by.insta ? ':insta' : ''); /* a free Insta never absorbs a paid upgrade */
      const prev = keyOf[k];
      if (prev) { prev.x = by.x.slice(); prev.why = prev.why.concat(at.why); prev.cost += num(by.paid, 0); return; }
      let st;
      if (at.kind === 'place') { placeUid[at.i] = 'p' + at.i; st = { uid: 'p' + at.i, r: by.r, op: 'place', t: picks[at.i].id, x: by.x.slice(), i: at.i, from: [0, 0, 0], why: at.why.slice(), cost: num(by.paid, 0), insta: !!by.insta }; }
      else st = { uid: 'u' + steps.length, r: by.r, op: 'up', ref: placeUid[at.i], x: by.x.slice(), i: at.i, why: at.why.slice(), cost: num(by.paid, 0) };
      keyOf[k] = st;
      steps.push(st);
    });
    powerBuys.forEach((pb) => {
      const st = pb.c.hero ? steps.find((s) => s.op === 'hero') : steps.filter((s) => s.op !== 'hero' && s.r === pb.r && (pb.c.copy != null ? picks[s.i].copyOf === pb.c.copy && s.op === 'place' : s.i === pb.c.i)).pop();
      if (st) st.why = st.why.concat(['power']);
    });
    /* tag a step with the need it is for only when that need is close (a tier bought at R7 for the R90 DDTs is just an early buy) */
    steps.forEach((s) => {
      s.why = s.why.filter((p, j) => s.why.indexOf(p) === j);
      s.due = s.why.filter((p) => p === 'income' || p === 'power' || p === 'fix' || (first[p] != null && s.r >= first[p] - 12)).map((p) => ({ prop: p, by: p === 'income' || p === 'power' || p === 'fix' ? null : first[p] }));
    });
    const plan = { mapId: map.id, modeId: mode.id, heroLevel: null, players, me: !!(fx && fx.me), emt: !!(fx && fx.emt), fx: opts.fx || null,
      unlocked: opts.unlocked || opts.unlocks || null, onlyUnlocked: !!opts.unlocked, missing: opts.missing || null,
      steps: steps.map((s) => (s.op === 'hero' ? { uid: s.uid, r: s.r, op: 'hero', h: s.h } : s.op === 'place' ? Object.assign({ uid: s.uid, r: s.r, op: 'place', t: s.t, x: s.x.slice() }, s.insta ? { insta: true } : {}) : { uid: s.uid, r: s.r, op: 'up', ref: s.ref, x: s.x.slice() })) };
    /* the leak results of the build order's own run are the Simulator's for the same moments: reuse them (not in links) */
    Object.defineProperty(plan, 'leakMemo', { value: memo, enumerable: false, writable: true });
    const sim = C.simulate(D, plan);
    const bankAfter = {}, simCost = {}, simStep = {};
    sim.steps.forEach((o) => { bankAfter[o.uid] = o.bank; simCost[o.uid] = o.cost; simStep[o.uid] = o; });
    steps.forEach((s) => { if (simCost[s.uid] != null) s.cost = simCost[s.uid]; }); /* MK first-only discounts and the free tower */
    steps.forEach((s) => {
      s.bank = bankAfter[s.uid];
      s.label = s.op === 'hero' ? hero.name : picks[s.i].label + (picks.filter((p) => p.id === picks[s.i].id).length > 1 ? ' #' + (simStep[s.op === 'place' ? s.uid : s.ref] && simStep[s.op === 'place' ? s.uid : s.ref].inst ? simStep[s.op === 'place' ? s.uid : s.ref].inst.replace(/^.* #/, '') : '1') : '');
      s.from = s.op === 'up' ? (simStep[s.uid] && simStep[s.uid].from) || null : [0, 0, 0];
      s.name = s.op === 'hero' ? '' : C.topName(picks[s.i].t, s.x);
      /* what you buy in this step (T13): the upgrades between the crosspath before and after */
      s.buy = s.op === 'hero' ? [] : C.buyList(picks[s.i].t, s.from || [0, 0, 0], s.x);
      s.buyText = s.buy.map((u) => u.name).filter(Boolean).join(', ');
    });

    /* ---- 4. explain ---- */
    const orig = picks.slice(0, nPicks);
    res.picks = orig.map((pk, i) => {
      const x = finals[i];
      const own = C.towerProps(pm, pk.id, x) || {};
      const gives = [];
      arr(pm.supportFixes).forEach((f) => {
        if (f.hero || f.source !== pk.id || !C.reqHolds(f.req, x)) return;
        [].concat(f.grants).forEach((g) => { const p = g === 'decamo' ? 'camo' : g; if (C.POP_PROPS.indexOf(p) >= 0 && gives.indexOf(p) < 0) gives.push(p); });
      });
      const cand = pk.forced ? (pk.cands.find((c) => c.x.join('') === x.join('')) || { x, rank: 9, use: '', trimmed: false }) : (chosen[i] && chosen[i].x.join('') === x.join('') ? chosen[i] : (pk.cands.find((c) => c.x.join('') === x.join('')) || { x, rank: 9, use: '', trimmed: false }));
      const exact = pk.cands.find((c) => !c.trimmed && c.x.join('') === x.join(''));
      const parent = cand.trimmed ? pk.cands.find((c) => !c.trimmed && c.x.every((v, q) => v >= x[q])) : null;
      const placed = buys.find((by) => by.at.i === i && by.at.kind === 'place');
      const doneAt = buys.filter((by) => by.at.i === i).reduce((m, by) => Math.max(m, by.r), 0);
      const complete = atoms.filter((at) => at.i === i && at.kind !== 'hero').every((at) => at.bought);
      const copies = picks.map((p, j) => ({ p, j })).filter((o) => o.j >= nPicks && o.p.id === pk.id).map((o) => {
        const pl = buys.find((by) => by.at.i === o.j && by.at.kind === 'place');
        return { x: finals[o.j], placedAt: pl ? pl.r : null, fix: !!o.p.fixed };
      });
      return {
        id: pk.id, name: pk.name, label: pk.label, x, xName: C.topName(pk.t, x), cost: C.placeCost(pk.t, x, mult),
        own: C.POP_PROPS.filter((p) => own[p]).concat(own.ddt ? ['ddt'] : []), gives,
        use: (exact && exact.use) || (parent ? parent.use : ''), trimmedFrom: parent ? parent.x : null, forced: !!pk.forced,
        mapPlan: !!(exact && exact.mapPlan),
        limited: !!pk.limited, lockedForYou: !!(pk.lim && !C.geq(pk.lim, x)), notUnlocked: !!pk.notUnlocked,
        jobs: jobs[i].slice().sort((p, q) => p.round - q.round),
        placedAt: placed ? placed.r : null, doneAt: complete ? doneAt : null, complete, copies,
        options: pk.cands.filter((c) => !c.trimmed).map((c) => ({ x: c.x, use: c.use, name: C.topName(pk.t, c.x), cost: C.placeCost(pk.t, c.x, mult), mapPlan: !!c.mapPlan })),
        timing: ((D.guides || {})[pk.id] || {}).buyTiming || '',
      };
    });
    /* hero jobs from the round the hero is really placed and the level he really has (T8) */
    const pmH = pm.heroes && hero ? pm.heroes[hero.id] : null;
    res.heroJobs = heroJobs.map((j) => {
      const lvl = heroRound != null && j.round >= heroRound ? Math.max(1, C.heroLevelAt(D, hero.id, heroRound, j.round, map.difficulty, heroOpts)) : 0;
      const ok = lvl > 0 && C.coverState(D, [], { id: hero.id, level: lvl, label: hero.name }).cov[j.prop].length > 0;
      if (ok) return { prop: j.prop, round: j.round, level: lvl, ok: true };
      const need = pmH && pmH[j.prop] && pmH[j.prop].level != null ? Math.max(1, pmH[j.prop].level) : null;
      const at = heroRound != null && need != null ? C.heroRoundForLevel(D, hero.id, heroRound, need, map.difficulty, b, heroOpts) : null;
      return { prop: j.prop, round: j.round, level: need, ok: false, from: at };
    });
    /* the hero came too late for a job the plan gave him: plan again with the towers covering it */
    const late = res.heroJobs.filter((j) => !j.ok).map((j) => j.prop);
    if (late.length && !noHeroFor.length) {
      const again = C.advise(D, Object.assign({}, opts, { _heroRetry: late }));
      if (!again.verdict || !res.verdict || C.heldTo(again) >= C.heldTo(Object.assign(res, { sim, end: b }))) return again;
    }
    res.fx = fx;
    res.instaSaved = instaUsed.reduce((s2, u) => s2 + (u ? u.save : 0), 0);
    res.picks.forEach((p, i) => { p.insta = instaUsed[i]; });
    res.heroRound = heroRound;
    res.steps = steps;
    res.plan = plan;
    res.sim = sim;
    res.spent = spent;
    res.budget = budget;
    res.evals = evals;
    res.searchCut = searchCut;
    res.unheld = skip;
    res.leftovers = orig.map((pk, i) => {
      const left = atoms.filter((at) => at.i === i && at.kind !== 'hero' && !at.bought);
      if (!left.length) return null;
      const have = owned[i] || null;
      return { id: pk.id, label: pk.label, have, want: finals[i], cost: left.reduce((s, at) => s + at.cost, 0) };
    }).filter(Boolean);
    if (hero && heroRound == null) res.leftovers.push({ hero: true, label: hero.name, cost: heroCost });
    res.uncoverable = needList.filter((p) => !endState.cov[p].length);
    res.gaps = sim.problems;
    res.verdict = C.adviceVerdict(res);
    return res;
  };
  /* the last round a plan holds to (Infinity when it holds to the end) */
  C.heldTo = function (r) {
    if (!r || !r.sim) return 0;
    const v = r.verdict || C.adviceVerdict(r);
    return v.holds ? Infinity : num(v.round, 0) - 1;
  };
  /* does the plan hold in its own simulation? {holds, round (where it breaks), kind, text, why, lives} */
  C.adviceVerdict = function (res) {
    const sim = res.sim;
    if (!sim) return { holds: false, round: null, kind: 'none', text: 'No plan yet.' };
    const short = sim.steps.find((o) => o.short);
    const f = sim.first;
    const cands = [];
    if (f) cands.push({ round: f.round, kind: f.prop === 'power' ? 'power' : 'coverage', pr: f });
    if (sim.lostAt) cands.push({ round: sim.lostAt, kind: 'lives' });
    if (short) cands.push({ round: short.r, kind: 'cash', step: short });
    cands.sort((p, q) => (p.round - q.round) || (['coverage', 'power', 'lives', 'cash'].indexOf(p.kind) - ['coverage', 'power', 'lives', 'cash'].indexOf(q.kind)));
    const v = cands[0];
    const lives = { start: sim.livesStart, end: sim.lives, lostAt: sim.lostAt, lost: sim.lives != null ? sim.livesStart - sim.lives : null };
    if (!v) return { holds: true, round: null, kind: 'ok', lives, text: 'Holds to R' + res.end, rough: false };
    const u = res.unheld && res.unheld[v.round];
    let why = '';
    if (v.kind === 'coverage') why = C.NEED_TEXT[v.pr.prop].charAt(0).toUpperCase() + C.NEED_TEXT[v.pr.prop].slice(1) + '.';
    else if (v.kind === 'cash') why = 'A buy in the order is short by ' + C.money(v.step.short) + '.';
    else {
      const pr = v.kind === 'power' ? v.pr : sim.problems.find((p) => p.prop === 'power' && p.round <= v.round && p.last >= v.round) || sim.problems.find((p) => p.round <= v.round) || null;
      const lead = pr && pr.prop === 'power' ? 'about ' + C.int(pr.leakInfo.lives) + ' lives\' worth (' + C.int(sim.rows[pr.round - sim.start].leak) + ' of ' + C.int(pr.leakInfo.rbe) + ' RBE) gets through at R' + pr.round + '. ' : pr ? C.NEED_TEXT[pr.prop] + '. ' : '';
      const k = u && u.reason === 'cash' ? 'Your picks could hold it, but the cheapest buy that does costs ' + C.money(u.cost) + ' and you have about ' + C.money(u.cash) + ' by then.'
        : u && u.reason === 'none' ? 'Nothing your picks can buy holds it (an estimate): add a tower from the fixes below.'
          : res.searchCut ? 'The Advisor stopped looking for more damage after R' + res.searchCut + ' (it keeps answers fast).' : '';
      why = (v.kind === 'lives' ? 'Small leaks add up: ' : '') + lead + k;
      why = why.charAt(0).toUpperCase() + why.slice(1);
    }
    return { holds: false, round: v.round, kind: v.kind, lives, why: why.trim(), rough: v.round >= C.ROUGH_FROM,
      text: (v.kind === 'lives' ? 'Runs out of lives around R' + v.round : 'Breaks at R' + v.round) };
  };
  /* "Not sure? Start with what's strong here": the map page's own plan (its known start) when there is one, or the map's
     strong towers, whichever holds longer in its own simulation (T11). Skips towers you can't place or haven't unlocked. */
  C.starterPicks = function (D, opts) {
    const mode = C.mode(D, opts.modeId) || C.mode(D, 'medium');
    const map = C.map(D, opts.mapId);
    if (!map) return null;
    const s = (D.strats || {})[map.id] || {};
    const missing = opts.missing || {};
    const okT = (id) => { const t = C.tower(D, id); return t && !C.placeIssue(D, mode, map, t) && !missing[id]; };
    const tries = [];
    const strong = arr(s.strongTowers).filter(okT).slice(0, 4);
    if (strong.length) tries.push({ towers: strong, force: {}, source: 'strong' });
    const px = C.mapPlanCross(D, map.id);
    const pt = Object.keys(px).filter(okT).slice(0, C.ADVISE_MAX);
    if (pt.length) {
      const force = {};
      pt.forEach((id) => { const x = px[id][0]; if (C.validCross(x) && !(opts.unlocked && C.lockedFor(opts.unlocked, id, x))) force[id] = x.slice(); });
      tries.push({ towers: pt, force, source: 'map plan' });
    }
    if (!tries.length) return null;
    const held = (r) => (r.verdict && r.verdict.holds ? Infinity : r.verdict && r.verdict.round != null ? r.verdict.round : 0);
    let best = null;
    tries.forEach((t) => {
      const r = C.advise(D, Object.assign({}, opts, { towers: t.towers, force: Object.assign({}, t.force) }));
      t.holdsTo = held(r);
      if (!best || t.holdsTo > best.holdsTo || (t.holdsTo === best.holdsTo && t.source === 'map plan')) best = t;
    });
    return best;
  };

  /* hash for the advisor page: #map=..&mode=..&hero=..&t=dart,sniper&f=dart.024 */
  C.encodeAdvice = function (st) {
    const parts = ['map=' + encodeURIComponent(st.mapId), 'mode=' + encodeURIComponent(st.modeId)];
    parts.push('hero=' + encodeURIComponent(st.heroId || 'none'));
    if (arr(st.towers).length) parts.push('t=' + st.towers.join(','));
    const f = Object.keys(st.force || {}).filter((k) => st.towers.indexOf(k) >= 0).map((k) => k + '.' + st.force[k].join(''));
    if (f.length) parts.push('f=' + f.join(','));
    if (st.mine) parts.push('mine=1');
    if (st.noInsta) parts.push('noinsta=1');
    if (C.players(st.players) > 1) parts.push('pl=' + C.players(st.players));
    /* fixes you added: x=dart.002@9 (an upgrade), +tack.000@9 (a new tower), hero@12 */
    const ex = arr(st.extras).map((e) => (e.kind === 'hero' ? 'hero@' + e.by : (e.kind === 'new' ? '+' : '') + e.t + '.' + arr(e.x).join('') + '@' + e.by)).filter(Boolean);
    if (ex.length) parts.push('x=' + ex.join(','));
    return parts.join('&');
  };
  C.decodeAdvice = function (D, hash) {
    const q = {};
    String(hash || '').replace(/^#/, '').split('&').forEach((kv) => {
      const i = kv.indexOf('=');
      if (i > 0) { try { q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { /* malformed link: ignore that part */ } }
    });
    const st = { towers: [], force: {}, mine: q.mine === '1', noInsta: q.noinsta === '1', players: /^[1-4]$/.test(q.pl || '') ? +q.pl : 1 };
    if (q.map && C.map(D, q.map)) st.mapId = q.map;
    if (q.mode && C.mode(D, q.mode) && !C.isSandbox(C.mode(D, q.mode))) st.modeId = q.mode;
    if (q.hero === 'auto' || (q.hero && C.hero(D, q.hero))) st.heroId = q.hero;
    else if (q.hero === 'none' || q.hero === '') st.heroId = '';
    if (q.t) q.t.split(',').forEach((id) => { if (C.tower(D, id) && st.towers.indexOf(id) < 0) st.towers.push(id); });
    if (q.f) q.f.split(',').forEach((tok) => {
      const m = tok.match(/^([a-z]+)\.(\d)(\d)(\d)$/);
      if (m && C.tower(D, m[1])) { const x = [+m[2], +m[3], +m[4]]; if (C.validCross(x)) st.force[m[1]] = x; }
    });
    st.extras = [];
    if (q.x) q.x.split(',').slice(0, 12).forEach((tok) => {
      let m;
      if ((m = tok.match(/^hero@(\d{1,3})$/))) st.extras.push({ kind: 'hero', by: +m[1] });
      else if ((m = tok.match(/^(\+?)([a-z]+)\.(\d)(\d)(\d)@(\d{1,3})$/)) && C.tower(D, m[2])) {
        const x = [+m[3], +m[4], +m[5]];
        if (C.validCross(x)) st.extras.push({ kind: m[1] ? 'new' : 'up', t: m[2], x, by: +m[6] });
      }
    });
    return st;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  root.MonkeyIntel = root.MonkeyIntel || {};
  root.MonkeyIntel.core = C;
})(typeof window !== 'undefined' ? window : globalThis);
