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
  C.endCandidates = function (D, id, props) {
    const g = (D.guides || {})[id] || {};
    const e = D.pop && D.pop.towers && D.pop.towers[id];
    const out = [];
    const seen = {};
    const push = (x, rank, use, trimmed) => {
      const k = x.join('');
      if (!C.validCross(x) || seen[k]) return;
      seen[k] = 1;
      out.push({ x, rank, use: use || '', trimmed: !!trimmed });
    };
    arr(g.bestCrosspaths).forEach((b, i) => { const x = C.parseCode(b && b.code); if (x) push(x, i, b.use, false); });
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
           fx: C.profileFx(...) (your Monkey Knowledge), ownsHero: (id) => bool, instas: [{t, x, n}] (place these for free)} */
  C.advise = function (D, opts) {
    const mode = C.mode(D, opts.modeId) || C.mode(D, 'medium');
    const map = C.map(D, opts.mapId) || D.maps[0];
    const [a, b] = C.modeRange(mode);
    const mult = num(mode.costMult, 1);
    const fx = C.fxFor(opts.fx, mode);
    const players = C.players(opts.players);
    const base = C.baseCash(D, mode, players);
    if (fx && fx.startCash) Object.keys(base).forEach((k) => { base[k] += fx.startCash / players; });
    const pm = D.pop || {};
    const force = opts.force || {};
    const heroOpts = C.heroOpts(fx);

    /* hero */
    let hero = null, heroWhy = '';
    if (opts.heroId === 'auto') {
      /* the map's best hero you own (My profile), else the map's best */
      const own = typeof opts.ownsHero === 'function' ? opts.ownsHero : () => true;
      const list = C.mapHeroes(D, map.id);
      hero = list.find((h) => own(h.id)) || (own('quincy') ? C.hero(D, 'quincy') : null) || list[0] || C.hero(D, 'quincy');
      heroWhy = 'best hero for ' + map.name + (list[0] && hero !== list[0] && !own(list[0].id) ? ' that you own (' + list[0].name + ' is the top pick)' : '');
    } else if (opts.heroId) { hero = C.hero(D, opts.heroId); heroWhy = 'your pick'; }
    const heroCost = hero ? C.price(hero.cost * (fx ? fx.heroCostMult : 1), mult) || 0 : 0;
    const heroGuess = Math.min(b, a + 3);
    const heroAt = (r) => (hero && r >= heroGuess ? { id: hero.id, label: hero.name, level: Math.max(1, C.heroLevelAt(D, hero.id, heroGuess, r, map.difficulty, heroOpts)) } : null);

    const first = C.needRounds(D, mode);
    const needProps = C.NEEDS.filter((p) => first[p] != null && p !== 'pop');
    /* picks */
    const unusable = [];
    const seen = {};
    const picks = [];
    arr(opts.towers).forEach((id) => {
      const t = C.tower(D, id);
      if (!t || seen[id]) return;
      seen[id] = 1;
      const issue = C.placeIssue(D, mode, map, t);
      if (issue) { unusable.push({ id, name: t.name, issue }); return; }
      if (picks.length >= C.ADVISE_MAX) return;
      let cands = C.endCandidates(D, id, needProps);
      const lim = opts.unlocked && Array.isArray(opts.unlocked[id]) ? opts.unlocked[id] : null;
      let limited = false;
      if (lim) {
        /* only what you have unlocked: cap every candidate at your tiers (a capped path counts as a cheaper version) */
        const seenX = {};
        cands = cands.map((c) => {
          const x = c.x.map((v, q) => Math.min(v, num(lim[q], 0)));
          const changed = x.join('') !== c.x.join('');
          if (changed) limited = true;
          return { x, rank: c.rank + (changed ? 2 : 0), use: changed ? '' : c.use, trimmed: c.trimmed || changed };
        }).filter((c) => { const k = c.x.join(''); if (!C.validCross(c.x) || seenX[k]) return false; seenX[k] = 1; return true; });
        if (!cands.length) cands = [{ x: [0, 0, 0], rank: 5, use: '', trimmed: true }];
      }
      const f = force[id] && C.validCross(force[id]) ? force[id].slice() : null;
      picks.push({ id, t, name: t.name, label: t.name.replace(/ Monkey$/, ''), cands, forced: f, limited, lim });
    });
    const res = { mode, map, hero, heroWhy, heroCost, start: a, end: b, picks: [], unusable, steps: [], plan: null, sim: null, leftovers: [], gaps: [], needs: {} };
    if (!picks.length) return res;

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
    const score = (ci) => {
      const xs = picks.map((p, i) => (p.forced || meta[i][ci[i]].x));
      const insts = instsFor(xs);
      const byLevel = {};
      const stAt = (r) => { const hh = heroAt(r); const k = hh ? hh.level : 0; return byLevel[k] || (byLevel[k] = C.coverState(D, insts, hh)); };
      const st = stAt(b);
      let s = 0;
      needList.forEach((p) => {
        if (!st.cov[p].length) return;
        s += (C.NEED_WEIGHT[p] || 500) * (stAt(first[p]).cov[p].length ? 1 : 0.5);
      });
      const cost = costOf(xs);
      if (cost > budget) s -= 60 + 400 * (cost - budget) / budget;
      else s += 300 * cost / budget; /* the pop model checks "can hit", not damage: spending the mode's cash is the stand-in for enough damage */
      picks.forEach((p, i) => { if (!p.forced) { const c = meta[i][ci[i]]; s -= c.rank * 8 + (c.trimmed ? 10 : 0); } });
      return s;
    };
    const ci = picks.map(() => 0);
    let best = score(ci);
    for (let pass = 0; pass < 4; pass++) {
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
      return C.coverState(D, insts, heroAt(r)).cov[p].length > 0;
    };
    const deltaCost = (i, from, to) => (from ? C.upgradeCost(picks[i].t, from, to, mult) : C.placeCost(picks[i].t, to, mult));
    const commit = (i, y, p, r) => {
      const from = target[i] || [0, 0, 0];
      if (!target[i]) { placeDl[i] = Math.min(placeDl[i], r); placeWhy[i].push(p); }
      for (let q = 0; q < 3; q++) for (let k = from[q] + 1; k <= y[q]; k++) {
        tierDl[i][q][k] = Math.min(num(tierDl[i][q][k], Infinity), r);
        (tierWhy[i][q][k] = tierWhy[i][q][k] || []).push(p);
      }
      target[i] = y.slice();
      jobs[i].push({ prop: p, round: r });
    };
    const order = needList.slice().sort((p, q) => (first[p] - first[q]) || (C.NEEDS.indexOf(p) - C.NEEDS.indexOf(q)));
    const heroJobs = [];
    order.forEach((p) => {
      const r = first[p];
      if (!endState.cov[p].length) return; /* the team can't cover it at all: a gap, handled after the sim */
      if (covers(target, p, r)) {
        if (hero && p !== 'pop' && C.coverState(D, [], heroAt(r)).cov[p].length && !covers(target, p, r - 1000)) heroJobs.push({ prop: p, round: r });
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

    /* ---- 3. build order ---- */
    const atoms = [];
    picks.forEach((pk, i) => {
      atoms.push({ i, kind: 'place', cost: C.placeCost(pk.t, [0, 0, 0], mult), dl: placeDl[i], why: placeWhy[i] });
      for (let q = 0; q < 3; q++) for (let k = 1; k <= finals[i][q]; k++) {
        const u = pk.t.paths[q] && pk.t.paths[q][k - 1];
        atoms.push({ i, kind: 'tier', path: q, tier: k, cost: C.price(u ? u.cost : 0, mult) || 0, dl: num(tierDl[i][q][k], Infinity), why: tierWhy[i][q][k] || [] });
      }
    });
    if (hero) atoms.push({ kind: 'hero', cost: heroCost, dl: Math.min(b, a + 6), why: heroJobs.map((j) => j.prop) });
    /* income pays back only if bought early: farms get soft deadlines from the first rounds */
    if (!(mode.rules && (mode.rules.noIncome || mode.rules.noIncomeTowers))) {
      let k = 0;
      atoms.forEach((at) => {
        if (at.kind === 'hero' || picks[at.i].id !== 'farm') return;
        at.dl = Math.min(at.dl, Math.min(b, a + 6 + 3 * (k++)));
        at.why = at.why.concat(['income']);
      });
    }
    const owned = picks.map(() => null);
    let heroRound = null;
    /* Insta Monkeys you own: the best one for each pick (not past its end crosspath) is placed free on the first round */
    const instaUsed = picks.map(() => null);
    const preBuys = [];
    if (arr(opts.instas).length && !(mode.rules && mode.rules.noInsta)) {
      const left = arr(opts.instas).map((x) => Object.assign({}, x));
      picks.forEach((pk, i) => {
        let best = null;
        left.forEach((ins) => {
          if (ins.t !== pk.id || !(ins.n > 0) || !C.validCross(ins.x) || !C.geq(finals[i], ins.x)) return;
          const save = C.placeCost(pk.t, ins.x, mult);
          if (!best || save > best.save) best = { ins, save };
        });
        if (!best) return;
        best.ins.n--;
        instaUsed[i] = { x: best.ins.x.slice(), save: best.save };
        owned[i] = best.ins.x.slice();
        atoms.forEach((at) => {
          if (at.i !== i || at.kind === 'hero') return;
          if (at.kind === 'place' || at.tier <= best.ins.x[at.path]) { at.bought = a; at.cost = 0; }
        });
        preBuys.push({ r: a, at: atoms.find((at) => at.i === i && at.kind === 'place'), x: best.ins.x.slice(), insta: true });
      });
    }
    const ready = (at) => {
      if (at.bought) return false;
      if (at.kind === 'place' || at.kind === 'hero') return true;
      const x = owned[at.i];
      return !!x && x[at.path] === at.tier - 1;
    };
    let spent = 0, income = 0;
    const buys = preBuys.slice();
    for (let r = a; r <= b; r++) {
      for (;;) {
        const cash = base[r] + income - spent;
        const open = atoms.filter(ready);
        if (!open.length) break;
        const urgent = (x) => x.dl <= r + C.URGENT_ROUNDS;
        open.sort((p, q) => (urgent(q) - urgent(p)) || (urgent(p) ? (p.dl - q.dl) : 0) || (p.cost - q.cost) || ((p.i || 0) - (q.i || 0)));
        const due = atoms.filter((x) => !x.bought && isFinite(x.dl)).sort((p, q) => p.dl - q.dl);
        /* would buying x now still leave enough for every deadline left (base income only)? */
        const safe = (x) => {
          let need = 0;
          for (const d of due) {
            if (d === x) continue;
            need += d.cost;
            const dr = Math.max(r, Math.min(b, d.dl));
            if (cash - x.cost + (base[dr] - base[r]) - need < -0.5) return false;
          }
          return true;
        };
        let buy = null;
        if (urgent(open[0]) && open[0].cost <= cash + 0.5) buy = open[0];
        else {
          for (const x of open) {
            if (x.cost > cash + 0.5) continue;
            if (urgent(x) || safe(x)) { buy = x; break; }
          }
        }
        if (!buy) break;
        buy.bought = r;
        spent += buy.cost;
        if (buy.kind === 'hero') heroRound = r;
        else if (buy.kind === 'place') owned[buy.i] = [0, 0, 0];
        else owned[buy.i][buy.path] = buy.tier;
        buys.push({ r, at: buy, x: buy.kind === 'hero' ? null : owned[buy.i].slice() });
      }
      owned.forEach((x, i) => { if (x) income += C.incomeFor(D, mode, picks[i].id, x); });
    }

    /* merge one tower's buys in the same round into one step */
    const steps = [];
    const placeUid = picks.map(() => null);
    const keyOf = {};
    buys.forEach((by) => {
      const at = by.at;
      if (at.kind === 'hero') { steps.push({ uid: 'h1', r: by.r, op: 'hero', h: hero.id, why: at.why.slice(), cost: at.cost }); return; }
      const k = by.r + ':' + at.i + (by.insta ? ':insta' : ''); /* a free Insta never absorbs a paid upgrade */
      const prev = keyOf[k];
      if (prev) { prev.x = by.x.slice(); prev.why = prev.why.concat(at.why); prev.cost += at.cost; return; }
      let st;
      if (at.kind === 'place') { placeUid[at.i] = 'p' + at.i; st = { uid: 'p' + at.i, r: by.r, op: 'place', t: picks[at.i].id, x: by.x.slice(), i: at.i, why: at.why.slice(), cost: at.cost, insta: !!by.insta }; }
      else st = { uid: 'u' + steps.length, r: by.r, op: 'up', ref: placeUid[at.i], x: by.x.slice(), i: at.i, why: at.why.slice(), cost: at.cost };
      keyOf[k] = st;
      steps.push(st);
    });
    /* tag a step with the need it is for only when that need is close (a tier bought at R7 for the R90 DDTs is just an early buy) */
    steps.forEach((s) => {
      s.why = s.why.filter((p, j) => s.why.indexOf(p) === j);
      s.due = s.why.filter((p) => p === 'income' || (first[p] != null && s.r >= first[p] - 12)).map((p) => ({ prop: p, by: p === 'income' ? null : first[p] }));
    });
    const plan = { mapId: map.id, modeId: mode.id, heroLevel: null, players, keepLeakCash: true, me: !!(fx && fx.me), emt: !!(fx && fx.emt), fx: opts.fx || null,
      steps: steps.map((s) => (s.op === 'hero' ? { uid: s.uid, r: s.r, op: 'hero', h: s.h } : s.op === 'place' ? Object.assign({ uid: s.uid, r: s.r, op: 'place', t: s.t, x: s.x.slice() }, s.insta ? { insta: true } : {}) : { uid: s.uid, r: s.r, op: 'up', ref: s.ref, x: s.x.slice() })) };
    const sim = C.simulate(D, plan);
    const bankAfter = {};
    sim.steps.forEach((o) => { bankAfter[o.uid] = o.bank; });
    steps.forEach((s) => { s.bank = bankAfter[s.uid]; s.label = s.op === 'hero' ? hero.name : picks[s.i].label; s.name = s.op === 'hero' ? '' : C.topName(picks[s.i].t, s.x); });

    /* ---- 4. explain ---- */
    res.picks = picks.map((pk, i) => {
      const x = finals[i];
      const own = C.towerProps(pm, pk.id, x) || {};
      const gives = [];
      arr(pm.supportFixes).forEach((f) => {
        if (f.hero || f.source !== pk.id || !C.reqHolds(f.req, x)) return;
        [].concat(f.grants).forEach((g) => { const p = g === 'decamo' ? 'camo' : g; if (C.POP_PROPS.indexOf(p) >= 0 && gives.indexOf(p) < 0) gives.push(p); });
      });
      const cand = pk.forced ? (pk.cands.find((c) => c.x.join('') === x.join('')) || { x, rank: 9, use: '', trimmed: false }) : meta[i][ci[i]];
      const exact = pk.cands.find((c) => !c.trimmed && c.x.join('') === x.join(''));
      const parent = cand.trimmed ? pk.cands.find((c) => !c.trimmed && c.x.every((v, q) => v >= x[q])) : null;
      const placed = buys.find((by) => by.at.i === i && by.at.kind === 'place');
      const doneAt = buys.filter((by) => by.at.i === i).reduce((m, by) => Math.max(m, by.r), 0);
      const complete = atoms.filter((at) => at.i === i && at.kind !== 'hero').every((at) => at.bought);
      return {
        id: pk.id, name: pk.name, label: pk.label, x, xName: C.topName(pk.t, x), cost: C.placeCost(pk.t, x, mult),
        own: C.POP_PROPS.filter((p) => own[p]).concat(own.ddt ? ['ddt'] : []), gives,
        use: (exact && exact.use) || (parent ? parent.use : ''), trimmedFrom: parent ? parent.x : null, forced: !!pk.forced,
        limited: !!pk.limited, lockedForYou: !!(pk.lim && !C.geq(pk.lim, x)),
        jobs: jobs[i].slice().sort((p, q) => p.round - q.round),
        placedAt: placed ? placed.r : null, doneAt: complete ? doneAt : null, complete,
        options: pk.cands.filter((c) => !c.trimmed).map((c) => ({ x: c.x, use: c.use, name: C.topName(pk.t, c.x), cost: C.placeCost(pk.t, c.x, mult) })),
        timing: ((D.guides || {})[pk.id] || {}).buyTiming || '',
      };
    });
    res.heroJobs = heroJobs;
    res.fx = fx;
    res.instaSaved = instaUsed.reduce((s2, u) => s2 + (u ? u.save : 0), 0);
    res.picks.forEach((p, i) => { p.insta = instaUsed[i]; });
    res.heroRound = heroRound;
    res.steps = steps;
    res.plan = plan;
    res.sim = sim;
    res.spent = spent;
    res.budget = budget;
    res.leftovers = picks.map((pk, i) => {
      const left = atoms.filter((at) => at.i === i && at.kind !== 'hero' && !at.bought);
      if (!left.length) return null;
      const have = owned[i] || null;
      return { id: pk.id, label: pk.label, have, want: finals[i], cost: left.reduce((s, at) => s + at.cost, 0) };
    }).filter(Boolean);
    if (hero && heroRound == null) res.leftovers.push({ hero: true, label: hero.name, cost: heroCost });
    res.uncoverable = needList.filter((p) => !endState.cov[p].length);
    res.gaps = sim.problems;
    return res;
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
    return st;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  root.MonkeyIntel = root.MonkeyIntel || {};
  root.MonkeyIntel.core = C;
})(typeof window !== 'undefined' ? window : globalThis);
