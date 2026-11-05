/* Bloons Planner: pure logic. No DOM access in this file.
   Inlined into the page by build.py and loaded by test_logic.js. */
(function (root) {
  'use strict';
  const L = {};

  L.TIER_XP_MULT = { Beginner: 1.0, Intermediate: 1.1, Advanced: 1.2, Expert: 1.3 };
  L.DIFF_ORDER = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
  L.PROPS = ['camo', 'lead', 'purple', 'fortified', 'moab', 'ddt', 'bad'];
  L.PROP_LABEL = { camo: 'Camo', lead: 'Lead', purple: 'Purple', fortified: 'Fortified', moab: 'MOAB', ddt: 'DDT', bad: 'BAD' };
  L.NON_ATTACKERS = ['farm', 'village'];
  /* Towers whose attack does not need line of sight. Everything else is warned on heavy-LoS maps. */
  L.LOS_FREE = ['mortar', 'heli', 'ace', 'spike', 'farm', 'village', 'skywarden'];

  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const arr = (v) => (Array.isArray(v) ? v : []);

  /* ---------- XP ---------- */
  L.roundXp = function (r) {
    if (r <= 20) return 20 * r + 20;
    if (r <= 50) return 40 * (r - 20) + 420;
    return 90 * (r - 50) + 1620;
  };
  L.baseXpRange = function (a, b) {
    let s = 0;
    for (let r = a; r <= b; r++) s += L.roundXp(r);
    return s;
  };
  L.freeplayFactor = function (r, endRound) {
    if (r <= endRound) return 1;
    return r <= 100 ? 0.3 : 0.1;
  };

  /* ---------- Prices ---------- */
  /* base x mult, rounded to the nearest $5; an exact tie rounds down. Integer maths avoids float drift. */
  L.price = function (base, mult) {
    if (base == null || !isFinite(base)) return null;
    const cents = Math.round(base * Math.round(num(mult, 1) * 100));
    const q = Math.floor(cents / 500);
    const rem = cents - q * 500;
    return (rem > 250 ? q + 1 : q) * 5;
  };

  /* ---------- Modes ---------- */
  L.isSandbox = function (mode) {
    return !!(mode && ((mode.rules && mode.rules.noRewards) || mode.startRound == null));
  };
  L.modeRange = function (mode) {
    const a = num(mode && mode.startRound, 1);
    const b = num(mode && mode.endRound, 100);
    return [a, b];
  };
  L.modeTier = function (mode) {
    /* which strategy text applies: easy | hard | chimps */
    if (!mode) return 'easy';
    if (mode.id === 'chimps') return 'chimps';
    return mode.base === 'hard' ? 'hard' : 'easy';
  };
  L.roundSetFor = function (data, mode) {
    const rs = (data && data.rounds) || {};
    if (mode && mode.roundSet === 'abr') return arr(rs.abr);
    return arr(rs.standard);
  };
  L.roundMap = function (rounds) {
    const m = {};
    arr(rounds).forEach((r) => { if (r && r.round != null) m[r.round] = r; });
    return m;
  };
  L.mkActive = function (mode) {
    return !(mode && mode.rules && mode.rules.noMK);
  };

  /* Cash available at the START of each round r (before r is played), for r = start..end+1.
     Deflation (rules.noIncome) stays flat at its starting cash. Tower income is not modelled. */
  L.cashCurve = function (data, mode) {
    const [a, b] = L.modeRange(mode);
    const rm = L.roundMap(L.roundSetFor(data, mode));
    const start = num(mode && mode.startCash, 650);
    const noIncome = !!(mode && mode.rules && (mode.rules.noIncome || mode.rules.noPopCash));
    const mult = noIncome ? 0 : num(mode && mode.cashMult, 1);
    const out = [];
    let cum = 0;
    for (let r = a; r <= b + 1; r++) {
      out.push({ round: r, avail: start + cum * mult, earned: cum * mult });
      const rr = rm[r];
      cum += rr ? num(rr.cash, 0) : 0;
    }
    return out;
  };
  L.availAt = function (curve, r) {
    for (let i = 0; i < curve.length; i++) if (curve[i].round === r) return curve[i].avail;
    return curve.length ? curve[curve.length - 1].avail : 0;
  };

  /* ---------- Towers and crosspaths ---------- */
  L.towerById = function (data, id) {
    return arr(data && data.towers).find((t) => t && t.id === id) || null;
  };
  L.heroById = function (data, id) {
    return arr(data && data.heroes).find((h) => h && h.id === id) || null;
  };
  L.code = (c) => arr(c).map((x) => num(x, 0)).join('-');
  L.parseCode = function (s) {
    const m = String(s || '').match(/(\d)\s*-\s*(\d)\s*-\s*(\d)/);
    return m ? [+m[1], +m[2], +m[3]] : null;
  };
  L.validCross = function (c) {
    if (!Array.isArray(c) || c.length !== 3) return false;
    if (c.some((x) => !(x >= 0 && x <= 5 && Math.floor(x) === x))) return false;
    if (c.filter((x) => x > 0).length > 2) return false;
    if (c.filter((x) => x > 2).length > 1) return false;
    return true;
  };
  /* Set path i to v, then repair the other paths so the crosspath stays legal:
     only one path above 2, and at most two paths upgraded at all. */
  L.setPath = function (cross, i, v) {
    const c = arr(cross).slice(0, 3).map((x) => num(x, 0));
    while (c.length < 3) c.push(0);
    v = Math.max(0, Math.min(5, Math.round(num(v, 0))));
    c[i] = v;
    if (v > 2) for (let j = 0; j < 3; j++) if (j !== i && c[j] > 2) c[j] = 2;
    if (v > 0 && c.filter((x) => x > 0).length > 2) {
      const others = [0, 1, 2].filter((j) => j !== i).sort((p, q) => c[p] - c[q]);
      c[others[0]] = 0;
    }
    return c;
  };
  L.mainPath = function (c) {
    let best = 0;
    for (let i = 1; i < 3; i++) if (c[i] > c[best]) best = i;
    return best;
  };
  L.upgrade = function (tower, path, tier) {
    const p = tower && arr(tower.paths)[path];
    return (p && arr(p)[tier - 1]) || null;
  };

  /* Ordered purchase steps for one tower at crosspath c, priced at mult.
     Order: place, then tiers 1-2 of the main and the second path interleaved, then main path 3-5. */
  L.towerSteps = function (tower, c, mult) {
    if (!tower) return [];
    const main = L.mainPath(c);
    const sec = [0, 1, 2].filter((i) => i !== main && c[i] > 0)[0];
    const steps = [];
    const cur = [0, 0, 0];
    steps.push({ kind: 'place', path: null, tier: 0, name: 'Place', cost: L.price(tower.baseCost, mult), grants: [], code: '0-0-0' });
    const add = (p, t) => {
      const u = L.upgrade(tower, p, t);
      cur[p] = t;
      steps.push({ kind: 'upgrade', path: p, tier: t, name: u ? u.name : 'Tier ' + t, cost: L.price(u ? u.cost : 0, mult) || 0, grants: arr(u && u.grants), code: L.code(cur) });
    };
    for (let t = 1; t <= 2; t++) {
      if (c[main] >= t) add(main, t);
      if (sec != null && c[sec] >= t) add(sec, t);
    }
    for (let t = 3; t <= 5; t++) if (c[main] >= t) add(main, t);
    if (sec != null) for (let t = 3; t <= c[sec]; t++) add(sec, t); /* unreachable for legal codes, kept defensive */
    return steps;
  };
  L.towerCost = function (tower, c, mult) {
    return L.towerSteps(tower, c, mult).reduce((s, x) => s + num(x.cost, 0), 0);
  };
  L.boughtUpgrades = function (tower, c) {
    const out = [];
    for (let p = 0; p < 3; p++) for (let t = 1; t <= num(c[p], 0); t++) {
      const u = L.upgrade(tower, p, t);
      if (u) out.push({ path: p, tier: t, name: u.name, grants: arr(u.grants) });
    }
    return out;
  };
  L.hasIncome = function (tower, c) {
    if (!tower) return false;
    if (tower.id === 'farm') return true;
    return L.boughtUpgrades(tower, c).some((u) => u.grants.indexOf('income') >= 0);
  };

  /* ---------- Coverage ---------- */
  L.firstNeed = function (rounds, a, b, prop) {
    const match = {
      moab: ['moab', 'bfb', 'zomg', 'ddt', 'bad'],
      ddt: ['ddt'], bad: ['bad'], camo: ['camo'], lead: ['lead'], purple: ['purple'], fortified: ['fortified'],
    }[prop] || [prop];
    for (const r of arr(rounds)) {
      if (!r || r.round < a || r.round > b) continue;
      if (arr(r.threats).some((t) => match.indexOf(t) >= 0)) return r;
    }
    return null;
  };

  /* picks: [{id, cross:[a,b,c], count}]. ready: optional {pickIndex: {"p:t": round}} from the build order.
     Returns one row per property with status covered | late | partial | uncovered | na. */
  L.coverage = function (data, picks, mode, ready) {
    const [a, b] = L.modeRange(mode);
    const rounds = L.roundSetFor(data, mode);
    ready = ready || {};
    const items = [];
    arr(picks).forEach((pk, i) => {
      const t = L.towerById(data, pk.id);
      if (!t || !(num(pk.count, 1) > 0)) return;
      items.push({ i, t, c: pk.cross, ups: L.boughtUpgrades(t, pk.cross), attacker: L.NON_ATTACKERS.indexOf(t.id) < 0 });
    });
    const label = (it, up) => {
      const head = it.t.name + ' ' + L.code(it.c);
      return up ? head + ' (' + up.name + ')' : head + ' (innate)';
    };
    const readyOf = (it, up) => {
      const m = ready[it.i] || {};
      const k = up ? up.path + ':' + up.tier : 'place';
      return m[k] != null ? m[k] : null;
    };
    /* sources: list of {it, up|null} that provide token directly */
    const sources = (test) => {
      const out = [];
      items.forEach((it) => {
        const s = test(it);
        if (s === true) out.push({ it, up: null });
        else if (s) out.push({ it, up: s });
      });
      return out;
    };
    const grantUp = (it, tokens, minTier) => it.ups.find((u) => u.tier >= (minTier || 0) && u.grants.some((g) => tokens.indexOf(g) >= 0)) || null;
    const village = items.filter((it) => it.t.id === 'village');
    const globalGrant = (tokens) => {
      for (const it of village) { const u = grantUp(it, tokens); if (u) return { it, up: u }; }
      return null;
    };
    const best = (list) => {
      if (!list.length) return null;
      return list.slice().sort((x, y) => {
        const rx = readyOf(x.it, x.up), ry = readyOf(y.it, y.up);
        if (rx != null && ry != null && rx !== ry) return rx - ry;
        return (x.up ? x.up.tier : 0) - (y.up ? y.up.tier : 0);
      })[0];
    };

    const rows = [];
    L.PROPS.forEach((prop) => {
      const need = L.firstNeed(rounds, a, b, prop);
      const row = { prop, label: L.PROP_LABEL[prop], firstRound: need ? need.round : null, needNote: need ? need.notes || need.composition || '' : '', status: 'na', by: '', note: '', readyRound: null };
      let src = null, partial = null;
      const atk = (fn) => (it) => (it.attacker ? fn(it) : false);
      if (prop === 'camo') {
        src = best(sources(atk((it) => (it.t.innate && it.t.innate.camo) || grantUp(it, ['camo']))).concat(globalGrant(['camo']) ? [globalGrant(['camo'])] : []));
        if (!src) { const d = best(sources((it) => grantUp(it, ['decamo']))); if (d) partial = { s: d, note: 'decamo only' }; }
      } else if (prop === 'lead') {
        src = best(sources(atk((it) => (it.t.innate && it.t.innate.lead) || grantUp(it, ['lead']))).concat(globalGrant(['lead']) ? [globalGrant(['lead'])] : []));
      } else if (prop === 'purple') {
        src = best(sources(atk((it) => (it.t.innate && it.t.innate.purple) || grantUp(it, ['purple']))).concat(globalGrant(['purple']) ? [globalGrant(['purple'])] : []));
      } else if (prop === 'fortified') {
        src = best(sources((it) => grantUp(it, ['fortified', 'defortify'])));
        if (!src) {
          const m = best(sources(atk((it) => grantUp(it, ['moab']))));
          if (m) partial = { s: m, note: 'raw damage, no fortified bonus' };
        }
      } else if (prop === 'moab') {
        src = best(sources(atk((it) => (it.t.innate && it.t.innate.moabDamage) || grantUp(it, ['moab']))));
        if (!src) {
          const h = best(sources(atk((it) => it.ups.find((u) => u.tier >= 3) || false)));
          if (h) partial = { s: h, note: 'no MOAB-bonus upgrade, raw damage only' };
        }
      } else if (prop === 'ddt') {
        src = best(sources((it) => grantUp(it, ['ddt'])));
        if (!src) {
          const gCamo = globalGrant(['camo']), gLead = globalGrant(['lead']), gBlack = globalGrant(['black']);
          const full = sources(atk((it) => {
            const camo = (it.t.innate && it.t.innate.camo) || grantUp(it, ['camo']) || gCamo;
            const lead = (it.t.innate && it.t.innate.lead) || grantUp(it, ['lead']) || gLead;
            const black = (it.t.innate && it.t.innate.black) || grantUp(it, ['black']) || gBlack;
            const moab = grantUp(it, ['moab']);
            return camo && lead && black && moab ? moab : false;
          }));
          src = best(full);
          if (!src) {
            const anyCamo = items.some((it) => it.attacker && ((it.t.innate && it.t.innate.camo) || grantUp(it, ['camo', 'decamo']))) || gCamo;
            const anyLead = items.some((it) => it.attacker && ((it.t.innate && it.t.innate.lead) || grantUp(it, ['lead'])));
            const m = best(sources(atk((it) => grantUp(it, ['moab']))));
            if (anyCamo && anyLead && m) partial = { s: m, note: 'camo, lead and MOAB damage are split across towers; one tower must have all three' };
          }
        }
      } else if (prop === 'bad') {
        src = best(sources(atk((it) => grantUp(it, ['moab'], 5))));
        if (!src) {
          const m = best(sources(atk((it) => grantUp(it, ['moab'], 4))));
          if (m) partial = { s: m, note: 'tier 4 only; check DPS' };
        }
      }
      if (src) {
        row.status = 'covered';
        row.by = label(src.it, src.up);
        row.readyRound = readyOf(src.it, src.up);
        if (row.firstRound != null && row.readyRound != null && row.readyRound > row.firstRound) {
          row.status = 'late';
          row.note = 'bought R' + row.readyRound + ', needed R' + row.firstRound;
        }
      } else if (partial) {
        row.status = 'partial';
        row.by = label(partial.s.it, partial.s.up);
        row.note = partial.note;
        row.readyRound = readyOf(partial.s.it, partial.s.up);
      } else {
        row.status = 'uncovered';
      }
      if (row.firstRound == null) { row.na = true; row.coveredIfNeeded = row.status; row.status = 'na'; row.note = ''; }
      rows.push(row);
    });
    return rows;
  };

  /* ---------- Legality ---------- */
  L.legality = function (data, picks, mode, map, heroId) {
    const out = []; /* {level: ok|warn|crit, text} */
    if (!mode) return out;
    if (L.isSandbox(mode)) out.push({ level: 'crit', text: mode.name + ' pays no XP and no rewards.' });
    if (mode.roundSet === 'random') out.push({ level: 'warn', text: 'Apopalypse rounds are random and continuous. Cash and threats below use the standard round set as a stand-in.' });
    const allowed = Array.isArray(mode.allowedClasses) ? mode.allowedClasses : null;
    const rules = mode.rules || {};
    arr(picks).forEach((pk) => {
      const t = L.towerById(data, pk.id);
      if (!t) return;
      if (allowed && allowed.indexOf(t.class) < 0) out.push({ level: 'crit', text: t.name + ' is ' + t.class + '; ' + mode.name + ' allows ' + allowed.join(', ') + ' towers only.' });
      if (rules.noIncomeTowers && t.id === 'farm') out.push({ level: 'crit', text: 'Banana Farm cannot be placed in ' + mode.name + '.' });
      else if (rules.noIncomeTowers && L.hasIncome(t, pk.cross)) out.push({ level: 'warn', text: t.name + ' ' + L.code(pk.cross) + ' has an income upgrade that pays nothing in ' + mode.name + '.' });
      else if (rules.noIncome && L.hasIncome(t, pk.cross)) out.push({ level: 'warn', text: t.name + ' ' + L.code(pk.cross) + ' earns nothing in Deflation (no income).' });
      if (map) {
        if (t.waterOnly && map.water === 'none') out.push({ level: 'crit', text: map.name + ' has no water, so ' + t.name + ' cannot be placed.' });
        else if (t.waterOnly && map.water === 'little') out.push({ level: 'warn', text: map.name + ' has only a little water; check there is room for ' + num(pk.count, 1) + ' ' + t.name + (num(pk.count, 1) > 1 ? 's' : '') + '.' });
        if (map.losBlockers === 'heavy' && L.LOS_FREE.indexOf(t.id) < 0) out.push({ level: 'warn', text: map.name + ' has heavy line-of-sight blockers; ' + t.name + ' needs a clear view of the track.' });
      }
    });
    if (rules.noMK) out.push({ level: 'warn', text: 'Monkey Knowledge is off in ' + mode.name + ', so Monkey Education and Elite Military Training do not apply.' });
    if (!out.some((x) => x.level !== 'ok')) out.push({ level: 'ok', text: 'Every tower is legal on this map and mode.' });
    return out;
  };

  /* ---------- Build order ---------- */
  L.PLAYSTYLE_STRATEGY = { safe: 'breadth', eco: 'eco', 'rush-t5': 'rush', mono: 'sequential', lcc: 'cheapest', 'chimps-tight': 'breadth', freeplay: 'eco', boss: 'rush' };

  L.buildOrder = function (data, picks, heroId, mode, playstyleId) {
    const mult = num(mode && mode.costMult, 1);
    const [a, b] = L.modeRange(mode);
    const curve = L.cashCurve(data, mode);
    const strategy = L.PLAYSTYLE_STRATEGY[playstyleId] || 'breadth';

    /* one queue per tower instance */
    const queues = [];
    arr(picks).forEach((pk, i) => {
      const t = L.towerById(data, pk.id);
      if (!t) return;
      const n = Math.max(0, Math.min(20, Math.round(num(pk.count, 1))));
      for (let k = 0; k < n; k++) {
        const steps = L.towerSteps(t, pk.cross, mult).map((s) => Object.assign({}, s, { pick: i, inst: k, towerId: t.id, towerName: t.name, target: L.code(pk.cross) }));
        queues.push({ pick: i, inst: k, tower: t, steps, income: L.hasIncome(t, pk.cross), total: steps.reduce((s, x) => s + x.cost, 0) });
      }
    });
    const hero = L.heroById(data, heroId);
    const heroStep = hero ? { kind: 'hero', pick: -1, inst: 0, towerId: hero.id, towerName: hero.name, name: 'Hero', cost: L.price(hero.cost, mult) || 0, code: '', grants: [] } : null;

    const order = [];
    const take = (q) => order.push(q.steps.shift());
    const cheapestHead = (qs, pred) => {
      let best = null;
      qs.forEach((q) => {
        if (!q.steps.length) return;
        const h = q.steps[0];
        if (pred && !pred(h, q)) return;
        if (!best || h.cost < best.steps[0].cost) best = q;
      });
      return best;
    };
    const drainCheapest = (qs, pred) => { let q; while ((q = cheapestHead(qs, pred))) take(q); };
    const pushHero = () => { if (heroStep && order.indexOf(heroStep) < 0) order.push(heroStep); };
    const openerFrom = (qs) => {
      const q = cheapestHead(qs, (h) => h.kind === 'place');
      if (q) take(q);
      pushHero();
    };

    if (strategy === 'sequential') {
      queues.forEach((q, idx) => { while (q.steps.length) take(q); if (idx === 0) pushHero(); });
    } else if (strategy === 'cheapest') {
      openerFrom(queues);
      drainCheapest(queues);
    } else if (strategy === 'eco') {
      const nonInc = queues.filter((q) => !q.income);
      const inc = queues.filter((q) => q.income);
      openerFrom(nonInc.length ? nonInc : queues);
      drainCheapest(inc);
      drainCheapest(queues, (h) => h.tier <= 2);
      drainCheapest(queues);
    } else if (strategy === 'rush') {
      openerFrom(queues);
      const carry = queues.slice().sort((x, y) => y.total - x.total)[0];
      if (carry) while (carry.steps.length) take(carry);
      drainCheapest(queues);
    } else { /* breadth */
      openerFrom(queues);
      drainCheapest(queues, (h) => h.tier <= 2);
      drainCheapest(queues);
    }
    pushHero();

    /* simulate: each step lands at the earliest round whose starting cash covers everything bought so far */
    let spent = 0, lastRound = a;
    const blocked = {};
    const rows = [];
    order.forEach((s) => {
      const key = s.pick + ':' + s.inst;
      if (blocked[key]) { rows.push(Object.assign({}, s, { round: null, cum: spent, flag: 'blocked' })); return; }
      let r = null;
      for (let i = 0; i < curve.length; i++) {
        const c = curve[i];
        if (c.round < lastRound || c.round > b) continue;
        if (c.avail + 1e-6 >= spent + s.cost) { r = c.round; break; }
      }
      if (r == null) {
        if (s.pick >= 0) blocked[key] = true;
        rows.push(Object.assign({}, s, { round: null, cum: spent, flag: 'unaffordable' }));
      } else {
        spent += s.cost;
        lastRound = r;
        rows.push(Object.assign({}, s, { round: r, cum: spent, bank: L.availAt(curve, r) - spent }));
      }
    });

    /* completion per instance, ready rounds per upgrade, investment per round per tower type */
    const done = {};
    const ready = {};
    rows.forEach((s) => {
      if (s.pick < 0) return;
      const key = s.pick + ':' + s.inst;
      if (!done[key]) done[key] = { pick: s.pick, inst: s.inst, towerName: s.towerName, target: s.target, round: 0, ok: true };
      if (s.round == null) done[key].ok = false;
      else done[key].round = Math.max(done[key].round, s.round);
      if (s.round != null) {
        ready[s.pick] = ready[s.pick] || {};
        const k = s.kind === 'place' ? 'place' : s.path + ':' + s.tier;
        if (ready[s.pick][k] == null || s.round < ready[s.pick][k]) ready[s.pick][k] = s.round;
      }
    });
    const totalWanted = queues.reduce((s, q) => s + q.total, 0) + (heroStep ? heroStep.cost : 0);
    return {
      rows, curve, spent, totalWanted, start: a, end: b,
      completes: Object.keys(done).map((k) => done[k]),
      ready,
      unaffordable: rows.filter((r) => r.round == null),
      endAvail: L.availAt(curve, b + 1),
    };
  };

  /* invested $ per tower type at the end of round r (hero excluded) */
  L.investmentAt = function (rows, r) {
    const inv = {};
    arr(rows).forEach((s) => {
      if (s.pick < 0 || s.round == null || s.round > r) return;
      inv[s.towerId] = (inv[s.towerId] || 0) + num(s.cost, 0);
    });
    return inv;
  };

  /* ---------- XP projection ---------- */
  /* opts: {me, emt, freeplayTo}. Returns {base, mapMult, meMult, total (single-tower), perTower:{id:{xp, share}}, lost} */
  L.xpProjection = function (data, mode, map, build, opts) {
    opts = opts || {};
    const res = { base: 0, mapMult: 1, meMult: 1, total: 0, perTower: {}, lost: 0, rounds: 0 };
    if (!mode || L.isSandbox(mode)) return res;
    const [a, b] = L.modeRange(mode);
    const mk = L.mkActive(mode);
    const mapMult = L.TIER_XP_MULT[map && map.difficulty] || 1;
    const meMult = mk && opts.me ? 1.08 : 1;
    const emtMult = mk && opts.emt ? 1.05 : 1;
    const fpTo = Math.max(b, Math.min(1000, Math.round(num(opts.freeplayTo, b))));
    res.mapMult = mapMult; res.meMult = meMult; res.emtMult = emtMult; res.freeplayTo = fpTo;
    const rows = build ? build.rows : [];
    let finalInv = null;
    for (let r = a; r <= fpTo; r++) {
      const f = L.freeplayFactor(r, b);
      const x = L.roundXp(r) * f;
      if (r <= b) res.base += L.roundXp(r);
      res.rounds++;
      const xr = x * mapMult * meMult;
      res.total += xr;
      const inv = r <= b ? L.investmentAt(rows, r) : (finalInv || (finalInv = L.investmentAt(rows, b)));
      const tot = Object.keys(inv).reduce((s, k) => s + inv[k], 0);
      if (!(tot > 0)) { res.lost += xr; continue; }
      Object.keys(inv).forEach((id) => {
        const t = L.towerById(data, id);
        const em = t && t.class === 'Military' ? emtMult : 1;
        const p = res.perTower[id] || (res.perTower[id] = { xp: 0, share: 0, invested: 0 });
        p.xp += xr * (inv[id] / tot) * em;
      });
    }
    const fin = L.investmentAt(rows, b);
    const ft = Object.keys(fin).reduce((s, k) => s + fin[k], 0);
    Object.keys(res.perTower).forEach((id) => {
      res.perTower[id].invested = fin[id] || 0;
      res.perTower[id].share = ft > 0 ? (fin[id] || 0) / ft : 0;
    });
    return res;
  };

  /* Simple single-tower XP for a whole run of mode on a map tier (no split). */
  L.xpPerRunMono = function (mode, mapDifficulty, opts) {
    opts = opts || {};
    if (!mode || L.isSandbox(mode)) return 0;
    const [a, b] = L.modeRange(mode);
    const mk = L.mkActive(mode);
    const m = (L.TIER_XP_MULT[mapDifficulty] || 1) * (mk && opts.me ? 1.08 : 1) * (mk && opts.emt && opts.military ? 1.05 : 1);
    return L.baseXpRange(a, b) * m;
  };

  L.towerXpTotals = function (data, towerId) {
    const t = L.towerById(data, towerId);
    const g = (data.guides || {})[towerId] || {};
    let sum = 0, missing = 0;
    if (t) arr(t.paths).forEach((p) => arr(p).forEach((u) => { if (u && u.xp == null) missing++; else sum += num(u && u.xp, 0); }));
    const all = num(g.xpAllUpgrades, sum);
    const paragon = t && t.paragon ? num(t.paragon.xp, num(g.xpParagon, null)) : null;
    return { all, paragon, missing, sum };
  };

  /* Cheapest-first unlock sequence (tiers in a path unlock in order). Returns [{path,tier,name,xp,cum}] */
  L.unlockSequence = function (tower) {
    if (!tower) return [];
    const next = [1, 1, 1];
    const seq = [];
    let cum = 0;
    for (;;) {
      let pick = -1, pxp = Infinity;
      for (let p = 0; p < 3; p++) {
        if (next[p] > 5) continue;
        const u = L.upgrade(tower, p, next[p]);
        const x = num(u && u.xp, 0);
        if (x < pxp) { pxp = x; pick = p; }
      }
      if (pick < 0) break;
      const u = L.upgrade(tower, pick, next[pick]);
      cum += pxp;
      seq.push({ path: pick, tier: next[pick], name: u ? u.name : '', xp: pxp, xpUnknown: !u || u.xp == null, cum });
      next[pick]++;
    }
    return seq;
  };

  /* banked = lifetime XP on this tower (spent on unlocks + unspent). */
  L.levelPlan = function (data, towerId, banked, perRun) {
    const t = L.towerById(data, towerId);
    const totals = L.towerXpTotals(data, towerId);
    banked = Math.max(0, num(banked, 0));
    const runs = (need) => (need <= 0 ? 0 : perRun > 0 ? need / perRun : Infinity);
    const seq = L.unlockSequence(t);
    const nxt = seq.find((s) => s.cum > banked) || null;
    const out = {
      towerId, perRun, banked,
      next: nxt ? { name: nxt.name, code: L.code([0, 1, 2].map((p) => (p === nxt.path ? nxt.tier : 0))), path: nxt.path, tier: nxt.tier, need: nxt.cum - banked, runs: runs(nxt.cum - banked) } : null,
      allT5: { need: Math.max(0, totals.all - banked), runs: runs(totals.all - banked), total: totals.all },
      paragon: null,
      missingXp: totals.missing,
    };
    if (t && t.paragon && totals.paragon != null) {
      const total = totals.all + totals.paragon;
      out.paragon = { name: t.paragon.name, need: Math.max(0, total - banked), runs: runs(total - banked), total, cost: t.paragon.cost };
    }
    return out;
  };

  L.FARM_COMPARE = [
    { modeId: 'deflation', label: 'Expert Deflation' },
    { modeId: 'hard', label: 'Expert Hard' },
    { modeId: 'impoppable', label: 'Expert Impoppable' },
  ];
  L.farmCompare = function (data, towerId, share, opts) {
    const t = L.towerById(data, towerId);
    const military = !!(t && t.class === 'Military');
    return L.FARM_COMPARE.map((f) => {
      const mode = arr(data.modes).find((m) => m.id === f.modeId);
      if (!mode) return null;
      const mono = L.xpPerRunMono(mode, 'Expert', { me: opts && opts.me, emt: opts && opts.emt, military });
      const [a, b] = L.modeRange(mode);
      return { label: f.label, modeId: f.modeId, rounds: 'R' + a + '–' + b, mono, yours: mono * num(share, 0) };
    }).filter(Boolean);
  };

  /* ---------- Economy ---------- */
  const INCOME_TOWER = { 'Banana Farm': 'farm', 'Monkey Buccaneer': 'buccaneer', 'Sniper Monkey': 'sniper', 'Alchemist': 'alchemist', 'Druid': 'druid', 'Engineer Monkey': 'engineer', 'Monkey Village': 'village' };
  L.incomeRows = function (data, mode) {
    const src = arr(data.economy && data.economy.incomeSources);
    const rules = (mode && mode.rules) || {};
    const [, b] = L.modeRange(mode);
    const mult = num(mode && mode.costMult, 1);
    const cashMult = num(mode && mode.cashMult, 1);
    const allowed = mode && Array.isArray(mode.allowedClasses) ? mode.allowedClasses : null;
    return src.map((s) => {
      const tid = INCOME_TOWER[s.tower] || null;
      const t = tid ? L.towerById(data, tid) : null;
      const cost = L.price(s.cost, mult);
      const inc = num(s.incomePerRound, 0) * cashMult;
      const row = { id: s.id, tower: s.tower, code: s.code, cost, income: inc, payback: inc > 0 ? cost / inc : null, notes: s.notes || '', status: 'ok', lastBuy: null };
      if (rules.noIncomeTowers || s.chimpsLegal === false && mode && mode.id === 'chimps') row.status = 'banned';
      else if (rules.noIncome) row.status = /deflation/i.test(s.notes || '') ? 'special' : 'none';
      else if (allowed && t && allowed.indexOf(t.class) < 0) row.status = 'class';
      else if (allowed && !t && /hero/i.test(s.tower) === false) row.status = 'class';
      if (row.status === 'ok' && row.payback != null) row.lastBuy = Math.floor(b - row.payback);
      return row;
    });
  };
  L.dpsRows = function (data, picks) {
    const ids = arr(picks).map((p) => p.id);
    const codes = {};
    arr(picks).forEach((p) => { codes[p.id + ':' + L.code(p.cross)] = true; });
    return arr(data.economy && data.economy.dpsTable)
      .filter((d) => ids.indexOf(d.towerId) >= 0)
      .map((d) => Object.assign({}, d, { match: !!codes[d.towerId + ':' + d.code] }))
      .sort((x, y) => (y.match - x.match) || (num(y.dpsPerK, 0) - num(x.dpsPerK, 0)));
  };

  /* ---------- Map strategy ---------- */
  L.mapPlan = function (data, mapId, mode) {
    const s = (data.strats || {})[mapId] || null;
    if (!s) return null;
    const tier = L.modeTier(mode);
    const plan = tier === 'chimps' ? s.chimpsPlan : tier === 'hard' ? s.hardPlan : s.easyPlan;
    return { tier, plan: plan || '', s };
  };

  /* ---------- Index evidence (btd6index.win, v57.4 data) ---------- */
  /* Normalise an upgrade/entity name: "Pre-Emptive Strike" -> "pre emptive strike", "Pouākai" -> "pouakai", "M.a.d" -> "mad". */
  L.normName = function (s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/-/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  };
  /* The Index names a 0-0-0 tower "Base <short>"; these are its short names. */
  L.INDEX_BASE = { dart: 'dart', boomerang: 'boomer', bomb: 'bomb', tack: 'tack', ice: 'ice', glue: 'glue', sniper: 'sniper', sub: 'sub',
    buccaneer: 'bucc', ace: 'ace', heli: 'heli', mortar: 'mortar', dartling: 'dartling', wizard: 'wizard', super: 'super', ninja: 'ninja',
    alchemist: 'alch', druid: 'druid', spike: 'spact', engineer: 'engi', beast: 'beast', skywarden: 'skywarden', mermonkey: 'merm',
    desperado: 'desperado', village: 'village', farm: 'farm' };
  L.INDEX_HERO_ALIAS = { gwendolin: ['gwen'], striker: ['jones'] };
  const HERO_SKIP = ['captain', 'admiral', 'the'];
  /* Names under which a tower can appear in a 2MP list: its tier 3-5 upgrades (plus the part before a colon,
     e.g. "Necromancer") and "Base <short>". */
  L.indexNamesForTower = function (t) {
    const out = {};
    arr(t && t.paths).forEach((p) => arr(p).forEach((u) => {
      if (!u || num(u.tier, 0) < 3) return;
      out[L.normName(u.name)] = u.name;
      if (String(u.name).indexOf(':') > 0) out[L.normName(String(u.name).split(':')[0])] = u.name;
    }));
    if (t && L.INDEX_BASE[t.id]) out['base ' + L.INDEX_BASE[t.id]] = 'Base ' + t.name;
    return out;
  };
  L.indexNamesForHero = function (h) {
    const out = {};
    if (!h) return out;
    out[L.normName(h.name)] = h.name;
    L.normName(h.name).split(' ').forEach((w) => { if (w && HERO_SKIP.indexOf(w) < 0) out[w] = h.name; });
    arr(L.INDEX_HERO_ALIAS[h.id]).forEach((a) => { out[a] = h.name; });
    return out;
  };
  L.indexEvidence = function (data, map, picks, heroId) {
    if (!map) return null;
    const tm = map.twoMP || null;
    const ents = arr(tm && tm.entities);
    const listState = !tm ? 'none' : tm.complete ? 'complete' : ents.length ? 'partial' : 'none';
    const norm = ents.map((e) => ({ e, n: L.normName(e) }));
    const match = (names) => norm.filter((x) => Object.prototype.hasOwnProperty.call(names, x.n)).map((x) => x.e);
    const seen = {};
    const towers = [];
    const flags = [];
    arr(picks).forEach((p) => {
      if (!p || seen[p.id]) return;
      seen[p.id] = true;
      const t = L.towerById(data, p.id);
      if (!t) return;
      const hits = match(L.indexNamesForTower(t));
      towers.push({ id: t.id, name: t.name, kind: 'tower', proven: hits.length > 0, entities: hits, listState });
      if (t.waterOnly && map.indexWater === false) flags.push({ level: 'crit', text: 'Index: ' + map.name + ' has no water, so ' + t.name + ' cannot be placed.' });
      if (map.indexLos === true && L.LOS_FREE.indexOf(t.id) < 0 && map.losBlockers !== 'heavy') flags.push({ level: 'info', text: 'Index: ' + map.name + ' has line-of-sight blockers; check ' + t.name + '\'s view of the track.' });
    });
    let hero = null;
    const h = heroId ? L.heroById(data, heroId) : null;
    if (h) {
      const hits = match(L.indexNamesForHero(h));
      hero = { id: h.id, name: h.name, kind: 'hero', proven: hits.length > 0, entities: hits, listState };
    }
    return {
      lanes: arr(map.rbs && map.rbs.lanes), avg: map.rbs ? map.rbs.avg : null, laneNotes: map.rbs ? map.rbs.notes : null,
      entrances: map.entrances == null ? null : map.entrances, exits: map.exits == null ? null : map.exits,
      water: typeof map.indexWater === 'boolean' ? map.indexWater : null,
      los: typeof map.indexLos === 'boolean' ? map.indexLos : null,
      removalCost: map.removalCost || null, lcc: map.lcc || null,
      twoMP: tm ? { count: tm.count, complete: !!tm.complete, shown: ents.length } : null,
      listState, towers, hero, flags, conflicts: arr(map.conflicts),
    };
  };

  /* ---------- Formatting ---------- */
  L.money = function (v) {
    if (v == null || !isFinite(v)) return '–';
    const n = Math.round(v);
    return (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US');
  };
  L.int = (v) => (v == null || !isFinite(v) ? '–' : Math.round(v).toLocaleString('en-US'));
  L.runs = (v) => (v == null ? '–' : !isFinite(v) ? 'never' : v === 0 ? 'done' : v < 10 ? v.toFixed(1) : String(Math.ceil(v)));

  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  root.BTD = L;
})(typeof window !== 'undefined' ? window : globalThis);
