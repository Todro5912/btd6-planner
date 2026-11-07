/* Monkey Intel tools: pure logic shared by the simulator, XP and defence pages.
   No DOM access. Browser: window.MonkeyIntel.core. Node: module.exports.
   Data comes from window.MonkeyIntelData (tools-data.js, built by src/build_tools.py). */
(function (root) {
  'use strict';
  const C = {};
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const arr = (v) => (Array.isArray(v) ? v : []);

  C.TIER_XP_MULT = { Beginner: 1.0, Intermediate: 1.1, Advanced: 1.2, Expert: 1.3 };
  C.TIERS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
  C.SELL_RATE = 0.7;
  /* Properties a round can demand. 'pop' = anything that attacks at all. Fortified is extra HP, never a need. */
  C.NEEDS = ['pop', 'camo', 'lead', 'purple', 'black', 'white', 'zebra', 'moab', 'ddt', 'bad'];
  C.POP_PROPS = ['camo', 'lead', 'purple', 'black', 'white', 'zebra', 'frozen', 'moab', 'bad', 'fortified'];
  C.NEED_LABEL = { pop: 'Bloons', camo: 'Camo', lead: 'Lead', purple: 'Purple', black: 'Black', white: 'White', zebra: 'Zebra', moab: 'MOAB', ddt: 'DDT', bad: 'BAD', power: 'Pop power' };
  C.NEED_TEXT = {
    pop: 'bloons leak, you have nothing placed that attacks',
    camo: 'camo leaks, you have nothing that sees camo',
    lead: 'lead leaks, nothing you have pops lead',
    purple: 'purples leak, nothing you have pops purple',
    black: 'blacks leak, explosions can\'t pop them',
    white: 'whites leak, ice can\'t pop them',
    zebra: 'zebras leak, you need one tower that pops black and white',
    moab: 'MOABs get through, nothing damages MOAB-class',
    ddt: 'DDTs get through, one tower must see camo and pop lead and black',
    bad: 'the BAD gets through, nothing damages it',
  };
  /* Hero XP to reach each level, cumulative, for a 1.0x hero (level 1 = 0). Estimate: see README-tools.md. */
  C.HERO_XP_1X = [0, 0, 180, 640, 1640, 3500, 6780, 11960, 20280, 29660, 43280, 59660, 74060, 90710, 105650, 122030, 139850, 159110, 179810, 196280, 213560];
  /* Rough minutes per round on fast-forward, for farm time estimates only. */
  C.minutesForRound = (r) => (r <= 40 ? 0.25 : r <= 60 ? 0.4 : r <= 80 ? 0.6 : r <= 100 ? 0.8 : 1.2);

  /* ---------- basics ---------- */
  C.roundXp = function (r) {
    if (r <= 20) return 20 * r + 20;
    if (r <= 50) return 40 * (r - 20) + 420;
    return 90 * (r - 50) + 1620;
  };
  C.baseXpRange = function (a, b) { let s = 0; for (let r = a; r <= b; r++) s += C.roundXp(r); return s; };
  C.price = function (base, mult) {
    if (base == null || !isFinite(base)) return null;
    const cents = Math.round(base * Math.round(num(mult, 1) * 100));
    const q = Math.floor(cents / 500);
    const rem = cents - q * 500;
    return (rem > 250 ? q + 1 : q) * 5;
  };
  C.isSandbox = (mode) => !!(mode && ((mode.rules && mode.rules.noRewards) || mode.startRound == null));
  C.modeRange = (mode) => [num(mode && mode.startRound, 1), num(mode && mode.endRound, 100)];
  C.mkActive = (mode) => !(mode && mode.rules && mode.rules.noMK);
  /* lookups by id, indexed once per list (the leak check asks for towers thousands of times per plan) */
  const idIndex = typeof WeakMap === 'function' ? new WeakMap() : null;
  C.byId = function (list, id) {
    if (!Array.isArray(list)) return null;
    if (!idIndex) return list.find((x) => x && x.id === id) || null;
    let m = idIndex.get(list);
    if (!m || m.n !== list.length) { m = { n: list.length, by: {} }; list.forEach((x) => { if (x && x.id != null && !(x.id in m.by)) m.by[x.id] = x; }); idIndex.set(list, m); }
    return Object.prototype.hasOwnProperty.call(m.by, id) ? m.by[id] : null;
  };
  C.tower = (D, id) => C.byId(D && D.towers, id);
  C.hero = (D, id) => C.byId(D && D.heroes, id);
  C.mode = (D, id) => C.byId(D && D.modes, id);
  C.map = (D, id) => C.byId(D && D.maps, id);
  C.roundsFor = function (D, mode) {
    const rs = (D && D.rounds) || {};
    return arr(mode && mode.roundSet === 'abr' ? rs.abr : rs.standard);
  };
  C.roundRow = function (D, mode, r) {
    const list = C.roundsFor(D, mode);
    const row = list[r - 1];
    return row && row.round === r ? row : list.find((x) => x.round === r) || null;
  };
  /* Co-op (Bloons Wiki, unverified in game): each player starts with $50 less per player in the match
     (2 players: -$100; checked in the game's co-op files), except Deflation (see C.coopStart); all pop cash and end-of-round bonuses
     are split evenly, and so is More Cash. Tower income (farms) goes to its owner. */
  C.PLAYERS_MAX = 4;
  C.players = (n) => Math.max(1, Math.min(C.PLAYERS_MAX, Math.round(num(n, 1))));
  C.coopStart = function (mode, players) {
    const n = C.players(players);
    const start = num(mode && mode.startCash, 650);
    if (n === 1) return start;
    /* Deflation co-op: the team starts with $24,000 / $25,500 / $28,000 for 2/3/4 players, split evenly
       (game: Mods/CoopDeflationCash2-4.json). Standard co-op files (1,100 / 1,500 / 1,800) match start - $50 per player */
    if (mode && mode.id === 'deflation') return Math.floor({ 2: 24000, 3: 25500, 4: 28000 }[n] / n);
    return Math.max(0, start - 50 * n);
  };
  /* Cash at the START of round r from bloons alone: startCash + cashMult x sum(cash of rounds a..r-1).
     players > 1: your share in co-op (see C.coopStart). */
  C.baseCash = function (D, mode, players) {
    const [a, b] = C.modeRange(mode);
    const rules = (mode && mode.rules) || {};
    const noIncome = !!(rules.noIncome || rules.noPopCash);
    const n = C.players(players);
    const mult = noIncome ? 0 : num(mode && mode.cashMult, 1) / n;
    const start = C.coopStart(mode, n);
    const out = {};
    let cum = 0;
    for (let r = a; r <= Math.max(b + 1, a); r++) {
      out[r] = start + cum * mult;
      const row = C.roundRow(D, mode, r);
      cum += row ? num(row.cash, 0) : 0;
    }
    return out;
  };

  /* ---------- pop power: can the build pop ENOUGH, not just hit every type (estimate) ----------
     The leak check (0.10) is a timeline. Each round's bloon groups (start, spacing, count: the game's round sets) spawn at the
     start of a track as long as the map (map.rbs Red-bloon seconds x 25 units), and move at their own speed (difficulty and
     freeplay ramps included). Every tower covers a window of that track: C.POWER_SPOT range-widths (a typical spot with a
     bend), all windows centred on the same spot (towers placed together). Each step, every attack of every tower fires at
     its real rate: hits per second at the number of bloons in its window (data/tower-power.json, from the game's tower
     models: pierce, spread, sub-projectiles, DoT, sub-towers), spread over the bloons it can see (camo). A hit only damages
     a layer its damage type can (per attack immunity bits: Lead, Black, White, Purple, Frozen); leftover damage carries
     into the children, which spawn where the parent popped and move at their own speed. Blimps have HP (ramped from R81,
     fortified x2) and take the towers' single-target damage, front one first; their children spawn where they died.
     Freeze, stun, slow and MOAB maim stop or slow the share of bloons they hit. Abilities fire when ready (first target,
     then every cooldown). What reaches the end of the track leaks. Bloons are bucketed (a group is split into chunks, and
     children of one bucket stay together), so it is fast enough for fix search. Estimates are listed in
     content/guides/leak-check.md. */
  C.POWER_SPOT = 3.0; /* a typical spot sees this many range-widths of track (bends, loops): fitted, see leak-check.md */
  C.SPOT_RANGE = [4.0, 1.0]; /* great spot (a loop) and bad spot (a straight) for leakRange */
  C.BLOON_RBE = { red: 1, blue: 2, green: 3, yellow: 4, pink: 5, black: 11, white: 11, purple: 11, lead: 23, zebra: 23, rainbow: 47, ceramic: 104, moab: 616, bfb: 3164, zomg: 16656, ddt: 816, bad: 55760 };
  C.BLOON_DEPTH = { red: 1, blue: 2, green: 3, yellow: 4, pink: 5, black: 6, white: 6, purple: 6, lead: 7, zebra: 7, rainbow: 8, ceramic: 18 };
  C.BLIMP_HP = { moab: 200, bfb: 700, zomg: 4000, ddt: 400, bad: 20000 };
  const CROWD = [1, 2, 4, 8, 16, 32];
  C.powerOf = function (D, id, x) {
    const pw = (D.power || {}).towers;
    return pw && pw[id] ? pw[id][arr(x).join('')] || null : null;
  };
  C.heroPowerOf = function (D, id, level) {
    const pw = (D.power || {}).heroes;
    if (!pw || !pw[id]) return null;
    for (let l = Math.max(1, Math.min(20, Math.round(num(level, 1)))); l >= 1; l--) if (pw[id][String(l)]) return pw[id][String(l)];
    return null;
  };
  /* bloon-hits per second at n bloons in range (log interpolation between the sampled crowds; an attack still scaling at 32
     bloons, such as a global infinite-pierce strike, keeps scaling) */
  C.hitsAt = function (hs, n) {
    if (n <= 1) return hs[0] * Math.max(0, n);
    for (let i = 1; i < CROWD.length; i++) {
      if (n <= CROWD[i]) { const t = Math.log(n / CROWD[i - 1]) / Math.log(CROWD[i] / CROWD[i - 1]); return hs[i - 1] + (hs[i] - hs[i - 1]) * t; }
    }
    return hs[5] > 1.9 * hs[4] ? hs[5] * n / 32 : hs[5];
  };
  const bloonType = (name) => {
    const s = String(name || '').toLowerCase();
    const fort = /fortified/.test(s);
    const base = s.replace(/(regrow|camo|fortified)/g, '');
    return { base, fort, camo: /camo/.test(s), regrow: /regrow/.test(s) };
  };
  /* ---- bloon physics (game facts, see content/guides/bloons.md) ---- */
  /* layer tree: [shell HP, children]. From R81 Ceramics are Super Ceramics (60 HP) and every non-blimp bloon has one child */
  const TREE = { red: [1, []], blue: [1, ['red']], green: [1, ['blue']], yellow: [1, ['green']], pink: [1, ['yellow']],
    black: [1, ['pink', 'pink']], white: [1, ['pink', 'pink']], purple: [1, ['pink', 'pink']], zebra: [1, ['black', 'white']],
    lead: [1, ['black', 'black']], rainbow: [1, ['zebra', 'zebra']], ceramic: [10, ['rainbow', 'rainbow']] };
  const node = (t, late, fort) => {
    const e = TREE[t] || TREE.red;
    let hp = t === 'ceramic' && late ? 60 : e[0];
    if (fort) hp = t === 'lead' ? 4 : t === 'ceramic' ? hp * 2 : hp;
    return [hp, late ? e[1].slice(0, 1) : e[1]];
  };
  /* immunity bits of each layer (game: bloonProperties; Lead 1, Black 2, White 4, Purple 8, DDT = Lead + Black) */
  const PROP = { red: 0, blue: 0, green: 0, yellow: 0, pink: 0, black: 2, white: 4, purple: 8, lead: 1, zebra: 6, rainbow: 0, ceramic: 0, moab: 0, bfb: 0, zomg: 0, ddt: 3, bad: 0 };
  /* hits needed to clear one bloon with damage d per hit. Leftover damage carries into every child (Bloons Wiki "Damage") */
  const hitMemo = {};
  C.hitsToClear = function (t, d, late, fort) {
    d = Math.max(1, Math.min(400, Math.round(num(d, 1) * 4) / 4));
    const key = t + '|' + d + '|' + (late ? 1 : 0) + (fort ? 1 : 0);
    if (hitMemo[key] != null) return hitMemo[key];
    const g = (bt, free, f) => {
      const [hp, kids] = node(bt, late, f);
      let hits = 0, over;
      if (free >= hp) over = free - hp;
      else { const k = Math.ceil((hp - free) / d - 1e-9); hits = k; over = k * d - (hp - free); }
      kids.forEach((c) => { hits += g(c, over, false); });
      return hits;
    };
    hitMemo[key] = g(t, 0, fort);
    return hitMemo[key];
  };
  const rbeMemo = {};
  C.rbeOf = function (t, late, fort) {
    const key = t + (late ? 1 : 0) + (fort ? 1 : 0);
    if (rbeMemo[key] != null) return rbeMemo[key];
    const [hp, kids] = node(t, late, fort);
    rbeMemo[key] = hp + kids.reduce((a, c) => a + C.rbeOf(c, late, false), 0);
    return rbeMemo[key];
  };
  /* one pop of a bloon with d damage of these immunity bits: hits it takes, and the children left after the leftover damage
     runs into them (children the damage type can't hurt keep their layer) */
  const popMemo = {};
  const popOf = (t, late, fort, d, imm) => {
    const key = t + '|' + (late ? 1 : 0) + (fort ? 1 : 0) + '|' + d + '|' + imm;
    let e = popMemo[key];
    if (e) return e;
    const [hp] = node(t, late, fort);
    const k = Math.max(1, Math.ceil(hp / d - 1e-9));
    const kids = {};
    const spill = (bt, free) => {
      const [h, ch] = node(bt, late, false);
      if (free >= h && !(imm & PROP[bt])) { ch.forEach((c) => spill(c, free - h)); return; }
      kids[bt] = (kids[bt] || 0) + 1;
    };
    node(t, late, fort)[1].forEach((c) => spill(c, k * d - hp));
    e = { k, kids: Object.keys(kids).map((c) => [c, kids[c]]) };
    e.removed = C.rbeOf(t, late, fort) - e.kids.reduce((a, [c, n]) => a + n * C.rbeOf(c, late, false), 0);
    e.kk = e.kids.map(([c]) => KI[c]); /* the children as kind numbers and counts, for the timeline's hot loop */
    e.kn = e.kids.map(([, n]) => n);
    popMemo[key] = e;
    return e;
  };
  /* freeplay ramps (from R81): blimp HP and every bloon's speed */
  C.blimpHpMult = (r) => (r <= 80 ? 1 : r <= 100 ? 1 + 0.02 * (r - 80) : r <= 124 ? 1.4 + 0.05 * (r - 100) : r <= 150 ? 2.6 + 0.15 * (r - 124) : r <= 250 ? 6.5 + 0.35 * (r - 150) : 41.5 + (r - 250));
  C.speedMult = (r) => (r <= 80 ? 1 : r <= 100 ? 1 + 0.02 * (r - 80) : r <= 150 ? 1.6 + 0.02 * (r - 101) : r <= 200 ? 3 + 0.02 * (r - 151) : 4.5);
  C.BLIMP_KIDS = { moab: [['ceramic', 4]], bfb: [['moab', 4]], zomg: [['bfb', 4]], ddt: [['ceramic', 4]], bad: [['zomg', 2], ['ddt', 3]] };
  const MAIM = { moab: 0, bfb: 1, zomg: 2, ddt: 3, bad: 4 };
  const KI = {};
  const KTYPE = Object.keys(PROP);
  KTYPE.forEach((t, i) => { KI[t] = i; });
  const KACC = new Float64Array(KTYPE.length), KTOUCH = new Int32Array(KTYPE.length);

  /* the attackers of one leak run: rows / blimp damage / crowd control per tower, with buffs applied.
     buff: {rate: attack-speed multiplier, pierce: +flat, dmg: +flat, range: multiplier, u: uptime 0-1 (the buffed share of the
     time; the rest runs unbuffed)}; it.buff is permanent, it.abBuff only counts with abilities on (Overclock, Call to Arms) */
  const applyRows = (rows, bf, grant, out, wt) => {
    rows.forEach((w) => {
      const R0 = w[0], d0 = w[1], hs0 = w[2], imm0 = num(w[3], 0) & ~grant, p0 = num(w[4], 1), dc0 = w.length > 5 ? w[5] : d0;
      const R = R0 >= 900 ? 9999 : R0 * num(bf.range, 1) + num(bf.rangeAdd, 0);
      const dp = num(bf.pierce, 0), rate = num(bf.rate, 1) * wt;
      const hs = hs0.map((h, i) => { const n = CROWD[i]; return h * rate * (dp > 0 ? Math.min(p0 + dp, n) / Math.max(1, Math.min(p0, n)) : 1); });
      const dd = num(bf.dmg, 0);
      out.push({ R, d: d0 + dd, dc: dc0 > 0 ? dc0 + dd + num(bf.dcAdd, 0) : 0, hs, imm: imm0 & ~num(bf.grant, 0) });
    });
  };
  const blimpDps = (e, bf, grant, wt) => {
    const mb = e.mb ? e.mb : (e.m > 0 ? [[e.m, 0, num(e.mh, e.m)]] : []);
    return mb.map(([dps, imm, hps]) => ({ dps: (dps + num(hps, 0) * (num(bf.dmg, 0) + num(bf.mAdd, 0))) * num(bf.rate, 1) * wt, imm: num(imm, 0) & ~grant }));
  };
  /* a stable id per power entry, and each list item's buffs as text once (cache keys and "same tower" checks) */
  let powerIds = 0;
  const pid = (e) => (e ? e.__id || Object.defineProperty(e, '__id', { value: ++powerIds, enumerable: false }).__id : 0);
  const buffText = (it) => {
    const b = it.buff || null, ab = it.abBuff || null;
    if (it.__bt && it.__bt[0] === b && it.__bt[1] === ab) return it.__bt[2];
    const t = (b ? JSON.stringify(b) : '') + '~' + (ab ? JSON.stringify(ab) : '');
    Object.defineProperty(it, '__bt', { value: [b, ab, t], enumerable: false, configurable: true, writable: true });
    return t;
  };
  /* what a tower brings to a run depends only on its power entry, buffs, support and camo: built once, shared by every run */
  const tplMemo = new Map();
  const buildAttacker = (it, abilities, out) => {
    const e = it.power;
    if (!e) return;
    const grant0 = num(it.grant, 0);
    const sig = it.id + ':' + pid(e) + ':' + (it.camo !== false ? 1 : 0) + ':' + grant0 + ':' + (abilities ? 1 : 0) + ':' + buffText(it);
    let tpl = tplMemo.get(sig);
    if (!tpl) {
      const tmp = [];
      buildTemplate(it, abilities, tmp);
      tpl = tmp[0];
      tpl.sig = sig;
      if (tplMemo.size > 5000) tplMemo.clear();
      tplMemo.set(sig, tpl);
    }
    out.push({ sig, tpl, label: it.label, mobile: tpl.mobile, self: tpl.self, camo: tpl.camo, rows: tpl.rows, m: tpl.m, mc: tpl.mc, cc: tpl.cc, sz: tpl.sz, R: tpl.R, base: tpl.base, pops: 0,
      ab: tpl.ab.map((b) => Object.assign({}, b)) });
  };
  const buildTemplate = (it, abilities, out) => {
    const e = it.power;
    const grant = num(it.grant, 0);
    const parts = [];
    const b1 = Object.assign({}, it.buff || {});
    let b2 = it.abBuff && abilities ? it.abBuff : null;
    /* an uptime-limited buff: split the tower into its buffed and unbuffed share of the time */
    const variants = [];
    const merge = (a, b) => ({ rate: num(a.rate, 1) * num(b.rate, 1), pierce: num(a.pierce, 0) + num(b.pierce, 0), dmg: num(a.dmg, 0) + num(b.dmg, 0),
      range: num(a.range, 1) * num(b.range, 1), rangeAdd: num(a.rangeAdd, 0) + num(b.rangeAdd, 0), grant: num(a.grant, 0) | num(b.grant, 0),
      dcAdd: num(a.dcAdd, 0) + num(b.dcAdd, 0), mAdd: num(a.mAdd, 0) + num(b.mAdd, 0) });
    const base = merge(b1.perm || {}, {});
    let list = [[base, 1]];
    arr(b1.timed).concat(b2 ? arr(b2.timed) : []).forEach((tb) => {
      const u = Math.max(0, Math.min(1, num(tb.u, 1)));
      const next = [];
      list.forEach(([bf, w]) => { if (u < 1) next.push([bf, w * (1 - u)]); if (u > 0) next.push([merge(bf, tb), w * u]); });
      list = next.length > 4 ? next.sort((a, b) => b[1] - a[1]).slice(0, 4) : next;
    });
    list.forEach(([bf, w]) => variants.push([bf, w]));
    const rows = [], m = [];
    variants.forEach(([bf, w]) => { applyRows(arr(e.a), bf, grant, rows, w); blimpDps(e, bf, grant, w).forEach((x) => m.push(x)); });
    const cc = arr(e.cc).map(([R, k, mu, du, hs, mo]) => ({ R: R >= 900 ? 9999 : R * num(base.range, 1), k, mu, du, hs: hs.map((h) => h * num(base.rate, 1)), mo }));
    let Rmax = 0;
    rows.forEach((w) => { Rmax = Math.max(Rmax, w.R); });
    const at = { label: it.label, mobile: it.id === 'heli', self: it.id === 'ice', camo: it.camo !== false, rows, m, mc: e.mc || null, cc, sz: arr(e.sz).map(([R, sp, sb, skip]) => ({ R: R * num(base.range, 1), sp, sb, skip })), ab: [], R: Rmax || num(e.r, 40), pops: 0, base };
    if (abilities) {
      arr(e.ab).forEach((ab) => {
        const a2 = { n: ab.n, cd: num(ab.cd, 60), d: num(ab.d, 0), rows: [], m: [], mc: ab.mc || null, cc: [], t: ab.t, u: ab.u };
        applyRows(arr(ab.a), base, grant, a2.rows, 1);
        blimpDps(ab, base, grant, 1).forEach((x) => a2.m.push(x));
        a2.cc = arr(ab.cc).map(([R, k, mu, du, hs, mo]) => ({ R: R >= 900 ? 9999 : R, k, mu, du, hs, mo }));
        if (a2.rows.length || a2.m.length || a2.cc.length || a2.t || a2.u) at.ab.push(a2);
      });
    }
    out.push(at);
  };

  /* round setup, shared by every run of the same round and mode */
  const roundMemo = {};
  const roundSetup = (D, mode, r, fx) => {
    const pw = D.power || {};
    const abr = mode && mode.roundSet === 'abr';
    const hpMult = C.blimpHpMult(r) * (mode && mode.id === 'double-hp-moabs' ? 2 : 1) * num(fx && fx.blimpHpMult, 1);
    const vMult = num(mode && mode.bloonSpeedMult, 1) * C.speedMult(r);
    const easyR40 = r === 40 && mode && mode.base === 'easy' ? 0.6667 : 1;
    const key = (abr ? 'a' : 's') + r + '|' + hpMult + '|' + vMult + '|' + easyR40 + '|' + C.CHUNKS;
    if (roundMemo[key]) return roundMemo[key];
    const groups = arr(arr(abr ? pw.roundsAbr : pw.rounds)[r - 1]);
    if (!groups.length) return null;
    const late = r >= 81;
    const speed = {};
    Object.keys(C.BLOON_RBE).forEach((t) => { speed[t] = num((pw.bloonSpeed || {})[t], 25) * vMult; });
    /* Double HP MOABs (game: DoubleMoabHealth x2), Big Bloon Sabotage (Monkey Knowledge: 10% less blimp HP), Easy R40 MOAB 2/3 HP */
    const hpOf = (t, fort) => C.BLIMP_HP[t] * (fort ? 2 : 1) * hpMult * (t === 'moab' ? easyR40 : 1);
    const bMemo = {};
    const rbeFull = (t, fort) => {
      if (!C.BLIMP_HP[t]) return C.rbeOf(t, late, fort);
      const k = t + (fort ? 1 : 0);
      if (bMemo[k] == null) bMemo[k] = hpOf(t, fort) + arr(C.BLIMP_KIDS[t]).reduce((a, [c, n]) => a + n * rbeFull(c, fort && !!C.BLIMP_HP[c] || fort), 0);
      return bMemo[k];
    };
    const spawns = [];
    let t0 = Infinity, t1 = 0, total = 0, nStream = 0, R1 = 0, H1 = 0;
    groups.forEach(([name, count, start, dur], gi) => {
      const b = bloonType(name);
      if (!(count > 0) || PROP[b.base] == null) return;
      t0 = Math.min(t0, start); t1 = Math.max(t1, start + dur);
      const blimp = !!C.BLIMP_HP[b.base];
      total += count * rbeFull(b.base, b.fort);
      if (!blimp) { nStream += count; R1 += count * C.rbeOf(b.base, late, b.fort); H1 += count * C.hitsToClear(b.base, 1, late, b.fort); }
      /* chunks: about one per 1.5 s of the group's spawn time, at most 12 (8 for blimps, one per blimp when few) */
      const k = Math.max(1, Math.min(count, blimp ? C.CHUNKS[1] : C.CHUNKS[0], Math.round(dur / C.CHUNKS[2]) + 1));
      for (let i = 0; i < k; i++) spawns.push({ t: start + (k === 1 ? dur / 2 : (i + 0.5) * dur / k), type: b.base, fort: b.fort, camo: b.camo || b.base === 'ddt', n: count / k, blimp, g: gi });
    });
    spawns.sort((a, b) => a.t - b.t);
    const res = { groups, late, speed, hpOf, rbeFull, spawns, t0: t0 === Infinity ? 0 : t0, t1, total, nStream, depth: H1 > 0 ? R1 / H1 : 1 };
    roundMemo[key] = res;
    return res;
  };

  /* one run of the timeline. spot = track seen per range-width; returns the leak and its parts */
  /* identical towers (two 0-0-2 Darts with the same buffs) act as one with their hits, damage and effects added up: the
     same result for less work */
  const sigAt = (a) => (a.camo ? 'c' : '') + (a.self ? 's' : '') + (a.mobile ? 'm' : '') + a.R + '|' + a.rows.map((w) => w.R + ',' + w.d + ',' + w.dc + ',' + w.imm + ',' + w.hs.join(',')).join(';') +
    '|' + a.m.map((m) => m.dps + ',' + m.imm).join(';') + '|' + (a.mc || '') + '|' + a.cc.map((c) => [c.R, c.k, c.mu, c.du, c.hs, c.mo].join(',')).join(';') +
    '|' + a.sz.map((z) => [z.R, z.sp, z.sb, z.skip].join(',')).join(';') + '|' + a.ab.map((b) => b.n + b.cd + ',' + b.d).join(';');
  const scaleRows = (rows, k) => rows.map((w) => Object.assign({}, w, { hs: w.hs.map((h) => h * k), pc0: null, pc1: null }));
  const scaleAt = (a, k) => {
    a.rows = scaleRows(a.rows, k);
    a.m = a.m.map((m) => Object.assign({}, m, { dps: m.dps * k }));
    a.cc = a.cc.map((c) => Object.assign({}, c, { hs: c.hs.map((h) => h * k) }));
    a.ab = a.ab.map((b) => Object.assign({}, b, { rows: scaleRows(b.rows, k), m: b.m.map((m) => Object.assign({}, m, { dps: m.dps * k })), cc: b.cc.map((c) => Object.assign({}, c, { hs: c.hs.map((h) => h * k) })) }));
  };
  const mergeSame = (ats) => {
    const by = {}, out = [];
    ats.forEach((a) => { const k = a.sig || sigAt(a); if (by[k]) by[k].copies.push(a); else { by[k] = a; a.copies = [a]; out.push(a); } });
    out.forEach((a) => { if (a.copies.length > 1) scaleAt(a, a.copies.length); });
    return out;
  };
  /* buckets are reused between steps and runs: a new object with a dozen number fields costs a dozen heap numbers */
  function Bucket() {
    this.type = ''; this.ki = 0; this.fort = false; this.camo = false; this.n = 0.5; this.x = 0.5; this.blimp = false; this.acc = 0.5; this.g = null;
    this.fz = 0.5; this.fzD = 0.5; this.sn = 0.5; this.snD = 0.5; this.sl = 0.5; this.slM = 0.5; this.slD = 0.5;
    this.pn = 0; this.ph = 0; this.pt = 0; this.cl = 0.5; this.pendDmg = 0.5; this.aF = 0.5; this.aS = 0.5; this.aL = 0.5; this.nb = false;
    this.prop = 0; this.cer = false; this.spd = 0.5; this.hp = 0.5; /* the kind's property bits, Ceramic or not, speed: looked up once, not per hit */
  }
  const POOL = [];
  /* pending hits of one step, for every bucket: amount, pop effect, tower, next hit on the same bucket (a list per bucket) */
  const PK = [0.5], PP = [], PA = [], PNX = [0];
  let PN = 0;
  /* the cell table of runTimeline (bucket key -> bucket): open addressing on typed arrays, emptied by bumping a stamp
     (a Map allocated a new table on every clear, every step) */
  let HT_BITS = 12, HT_N = 1 << HT_BITS, HT_K = new Float64Array(HT_N), HT_S = new Int32Array(HT_N), HT_V = new Array(HT_N).fill(null), HT_ST = 1, HT_C = 0;
  const htClear = () => { HT_C = 0; if (++HT_ST > 2e9) { HT_S.fill(0); HT_ST = 1; } };
  const htSlot = (k) => {
    let i = Math.imul((k > 0x7fffffff ? k % 0x7fffffff : k) | 0, 0x9E3779B1) >>> (32 - HT_BITS);
    while (HT_S[i] === HT_ST && HT_K[i] !== k) i = (i + 1) & (HT_N - 1);
    return i;
  };
  const htGet = (k) => { const i = htSlot(k); return HT_S[i] === HT_ST ? HT_V[i] : null; };
  const htGrow = () => {
    const oK = HT_K, oS = HT_S, oV = HT_V, oN = HT_N, st = HT_ST;
    HT_BITS++; HT_N = 1 << HT_BITS; HT_K = new Float64Array(HT_N); HT_S = new Int32Array(HT_N); HT_V = new Array(HT_N).fill(null); HT_ST = 1; HT_C = 0;
    for (let i = 0; i < oN; i++) if (oS[i] === st) { const j = htSlot(oK[i]); HT_S[j] = 1; HT_K[j] = oK[i]; HT_V[j] = oV[i]; HT_C++; }
  };
  const htSet = (k, v) => {
    if (HT_C * 2 >= HT_N) htGrow();
    const i = htSlot(k);
    if (HT_S[i] !== HT_ST) { HT_S[i] = HT_ST; HT_K[i] = k; HT_C++; }
    HT_V[i] = v;
  };
  const winCache = new Map();
  let STAMP = 0;
  /* a tower's attack rows grouped by reach (one window each), once per row list */
  const groupMemo = new WeakMap();
  const groupRows = (rows) => {
    let g = groupMemo.get(rows);
    if (g) return g;
    const by = new Map();
    rows.forEach((w) => { let x = by.get(w.R); if (!x) { x = []; by.set(w.R, x); } x.push(w); });
    g = Array.from(by.entries()).sort((p, q) => p[0] - q[0]);
    groupMemo.set(rows, g);
    return g;
  };
  const runTimeline = (S, ats0, map, spot, opts) => {
    const ats = mergeSame(ats0);
    const late = S.late;
    const L = map && map.rbs ? map.rbs * 25 : 30 * 25;
    const lanes = map && map.lanes ? Math.max(1, map.lanes) : 1;
    const fast = !!(opts && opts.fast);
    const B = []; /* live buckets */
    let stamp = 0;
    /* windows: every tower's reach, centred on one spot halfway down the track. Each step a window lists the buckets in it.
       Windows are kept between runs (same track length and spot), their per-step lists are stamped with a global step count */
    const wkey = L + '|' + spot + '|';
    let wins = winCache.get(wkey);
    if (!wins) { if (winCache.size > 200) winCache.clear(); wins = {}; winCache.set(wkey, wins); }
    const win = (R, self) => {
      const key = (R >= 900 ? 'g' : Math.round(R * 10)) + (self ? 's' : '');
      if (wins[key]) return wins[key];
      /* a blast around the tower itself (Ice Monkey) covers at most its diameter of track: bends don't add to it */
      const W = R >= 900 ? L : Math.min(L, (self ? C.SPOT_SELF * spot / C.POWER_SPOT : spot) * 2 * R);
      const lo = Math.max(0, Math.min(L / 2 - W / 2, L - W));
      wins[key] = { lo, hi: Math.min(L, lo + W), st: -1, sA: [], sN: [], bA: [], bN: [], nA: 0, nN: 0, mA: 0, mN: 0, cSA: 0, cSN: 0, cBA: 0, cBN: 0 };
      return wins[key];
    };
    const look = (w) => {
      if (w.st === stamp) return w;
      /* the lists are reused: cSA... say how much of each is this step's (no array resizing in the hot loop) */
      w.st = stamp; w.nA = 0; w.nN = 0; w.mA = 0; w.mN = 0;
      let sa = 0, sn = 0, ba = 0, bn = 0;
      const lo = w.lo, hi = w.hi;
      /* B is sorted front first: skip the buckets past the window by halving */
      let i0 = 0, i1 = B.length;
      while (i0 < i1) { const mid = (i0 + i1) >> 1; if (B[mid].x > hi) i0 = mid + 1; else i1 = mid; }
      for (let i = i0; i < B.length; i++) {
        const b = B[i];
        if (b.x < lo) break;
        if (b.blimp) { w.bA[ba++] = b; w.mA += b.n; if (!b.camo) { w.bN[bn++] = b; w.mN += b.n; } }
        else { w.sA[sa++] = b; w.nA += b.n; if (!b.camo) { w.sN[sn++] = b; w.nN += b.n; } }
      }
      w.cSA = sa; w.cSN = sn; w.cBA = ba; w.cBN = bn;
      return w;
    };
    const densOf = (R) => { const w = win(R); return Math.min(1, 1.6 * 2 * Math.min(R, 120) / Math.max(1, w.hi - w.lo)); };
    let uLo = L, uHi = 0, wMin = L, fLo = L, fHi = 0;
    const span1 = (w) => { uLo = Math.min(uLo, w.lo); uHi = Math.max(uHi, w.hi); if (w.hi - w.lo < L - 1e-6) { fLo = Math.min(fLo, w.lo); fHi = Math.max(fHi, w.hi); } };
    const units = [];
    const zones = []; /* slow zones (Arctic Wind) and MOAB Shove */
    ats.forEach((a) => {
      /* a Heli Pilot flies to the bloons (Follow / Pursuit): its reach is the whole track, but only its range around it at once */
      const wR = (R) => (a.mobile ? 9999 : R);
      const ws = groupRows(a.rows).map(([R, rows]) => ({ w: win(wR(R), a.self), rows, R0: R, dens: a.mobile ? Math.min(1, 1.6 * 2 * Math.min(R, 120) / L) : densOf(R) }));
      const mw = win(wR(a.R), a.self);
      const cw = a.cc.map((c) => Object.assign({ w: win(wR(c.R), a.self) }, c));
      units.push({ a, ws, mw, cw });
      a.sz.forEach((z) => { zones.push({ w: win(z.R), sp: z.sp, sb: z.sb, skip: z.skip }); });
      ws.forEach((x) => { span1(x.w); wMin = Math.min(wMin, x.w.hi - x.w.lo, x.R0 >= 900 ? L : C.POWER_SPOT * 2 * x.R0); });
      if (a.m.length) span1(mw);
      cw.forEach((c) => span1(c.w));
      a.ab.forEach((ab) => {
        ab.ws = groupRows(ab.rows).map(([R, rows]) => ({ w: win(R), rows, dens: densOf(R) }));
        ab.ws.forEach((x) => span1(x.w));
        ab.mw = mw;
        ab.cw = ab.cc.map((c) => Object.assign({ w: win(c.R) }, c));
        ab.next = null; ab.until = -1; ab.fired = 0; ab.str = 1;
      });
    });
    if (uHi <= uLo) { uLo = L; uHi = L; }
    let vStream = 1;
    S.spawns.forEach((s) => { vStream = Math.max(vStream, S.speed[s.type]); if (PROP[s.type] !== 0 || C.BLIMP_HP[s.type] || s.type === 'ceramic' || s.type === 'rainbow' || s.type === 'pink') vStream = Math.max(vStream, S.speed.pink); });
    const k0 = fast ? C.STEP_FAST[0] : C.STEP[0], dtMax = fast ? C.STEP_FAST[1] : C.STEP[1];
    let si = 0, t = S.t0, leak = 0, guard = 0, work = 0;
    const sh = { hits: 0.5, wasted: 0.5 }; /* fields, not closure variables: a double in a closure is a new heap number per write */
    sh.hits = 0; sh.wasted = 0;
    const blimpStat = {};
    const hpOf = S.hpOf;
    const remRbe = (b) => (b.blimp ? b.n * S.rbeFull(b.type, b.fort) - b.acc : b.n * C.rbeOf(b.type, late, b.fort));
    /* leaks are counted in whole bloons: the timeline splits bloons into fractions (a share popped, a share not), and a
       fraction of a bloon is a chance, so each kind's leaked count is rounded at the end */
    const leaked = [], leakAt = new Int32Array(KTYPE.length * 4); /* per kind (type, fortified, camo), in the order they first leak */
    const leakB = (b) => { const k = b.ki * 2 + (b.camo ? 1 : 0); let e = leakAt[k] ? leaked[leakAt[k] - 1] : null; if (!e) { e = { n: 0.5, rbe: 0.5 }; e.n = 0; e.rbe = 0; leaked.push(e); leakAt[k] = leaked.length; } e.n += b.n; e.rbe += remRbe(b); };
    /* buckets: one per bloon kind (type, fortified, camo; blimps also by group) and track cell. Children born in a cell join
       that cell's bucket, and after every move buckets that share a cell merge, so the count stays bounded */
    const cs = Math.max(8, 0.3 * wMin);
    htClear();
    const BORN = [], BORN_N = [0.5], BORN_X = [0.5], GONE = []; /* children of this step: kind etc., and count and spot (numbers only, unboxed) */
    let bornNow = false;
    /* fine cells where a tower with a local reach acts, coarse ones where only global attacks reach */
    const coarse = Math.max(cs, L / 10);
    const cellOf = (x) => (x < fLo ? Math.floor(x / coarse) : x > fHi ? 2000 + Math.floor((x - fHi) / coarse) : 1000 + Math.floor((x - fLo) / cs));
    const keyOf = (type, fort, camo, g, x) => ((((g == null ? 0 : g + 1) * 40 + KI[type]) * 4 + (fort ? 2 : 0) + (camo ? 1 : 0)) * 4096 + Math.min(4095, cellOf(x)));
    /* keyOf for a bucket, from its kind number (b.ki = kind * 2 + fortified): the same number, without a lookup by name */
    const keyB = (b) => (((b.blimp && b.g != null ? b.g + 1 : 0) * 160 + 2 * b.ki + (b.camo ? 1 : 0)) * 4096 + Math.min(4095, cellOf(b.x)));
    const addBucket = (type, fort, camo, n, x, from, g) => {
      if (n <= 1e-6) return;
      work++;
      const blimp = !!C.BLIMP_HP[type];
      const key = keyOf(type, fort, camo, blimp ? g : null, x);
      const q = htGet(key);
      if (q) {
        const w = q.n + n;
        q.x = (q.x * q.n + x * n) / w;
        q.fz = (q.fz * q.n + (from ? from.fz : 0) * n) / w;
        q.sl = (q.sl * q.n + (from ? from.sl : 0) * n) / w;
        q.sn = q.sn * q.n / w;
        q.n = w;
        return;
      }
      const b = POOL.length ? POOL.pop() : new Bucket();
      b.type = type; b.ki = KI[type] * 2 + (fort ? 1 : 0); b.fort = fort; b.camo = camo; b.n = n; b.x = x; b.blimp = blimp; b.acc = 0; b.g = g;
      b.fz = from ? from.fz : 0; b.fzD = from ? from.fzD : 1; b.sn = 0; b.snD = 1; b.sl = from ? from.sl : 0; b.slM = from ? from.slM : 1; b.slD = from ? from.slD : 1;
      b.pn = 0; b.ph = 0; b.pt = 0; b.cl = 0; b.pendDmg = 0; b.aF = 0; b.aS = 0; b.aL = 0; b.nb = bornNow;
      b.prop = PROP[type]; b.cer = type === 'ceramic'; b.spd = S.speed[type]; b.hp = blimp ? hpOf(type, fort) : 0;
      B.push(b);
      htSet(key, b);
    };
    /* after moving: merge buckets that now share a cell (blimps keep their damage: they merge only when both are unhurt) */
    const rebin = () => {
      htClear();
      let j = 0;
      for (let i = 0; i < B.length; i++) {
        const b = B[i];
        const key = keyB(b);
        const q = htGet(key);
        if (q && !(b.blimp && (b.acc > 0 || q.acc > 0))) {
          const w = q.n + b.n;
          q.x = (q.x * q.n + b.x * b.n) / w;
          q.fz = (q.fz * q.n + b.fz * b.n) / w; q.sn = (q.sn * q.n + b.sn * b.n) / w; q.sl = (q.sl * q.n + b.sl * b.n) / w;
          q.fzD = Math.max(q.fzD, b.fzD); q.snD = Math.max(q.snD, b.snD); q.slD = Math.max(q.slD, b.slD); q.slM = Math.min(q.slM, b.slM);
          q.n = w;
          POOL.push(b);
          continue;
        }
        if (!q) htSet(key, b);
        B[j++] = b;
      }
      B.length = j;
    };
    /* abilities: used when a target is first in reach, then every cooldown. Cooldowns only run during rounds, so a round
       shorter than the cooldown can't count on it every time: the first use counts for (round time / cooldown) */
    const span = Math.max(1, S.t1 - S.t0 + L / Math.max(1, vStream));
    /* one share of a row's hits on one bucket: pops pending until the step ends */
    const giveHit = (a, w, b, h, sharp, d, dc, mod, pc) => {
      /* an Ice Monkey's blast skips bloons that are still frozen */
      if (a.self && b.fz > 0) h *= 1 - b.fz;
      if (sharp) { sh.hits += h; if (b.fz > 0) { const lost = h * b.fz; sh.wasted += lost; h -= lost; } }
      if (w.imm & b.prop || h <= 0) return 0;
      const dd = b.cer ? dc : d;
      if (!(dd > 0)) return 0;
      const pe = mod ? popOf(b.type, late, b.fort, Math.round(dd * 4) / 4, w.imm) : (pc[b.ki] || (pc[b.ki] = popOf(b.type, late, b.fort, Math.round(dd * 4) / 4, w.imm)));
      const k = h / pe.k;
      work++;
      const i = PN++;
      PK[i] = k; PP[i] = pe; PA[i] = a; PNX[i] = -1;
      if (b.pn === 0) b.ph = i; else PNX[b.pt] = i;
      b.pt = i; b.pn++;
      return k;
    };
    const ccOk = (c, b) => (c.mo === 2 ? b.blimp && b.type !== 'bad' : b.blimp ? (c.mo && b.type !== 'bad') : !(c.k === 'f' && (b.prop & 4)));
    /* fire's time scale goes in a field: a number passed to a call that isn't inlined is a new heap number each time */
    const FS = { scale: 0.5 };
    const fire = (a, wsList, mw, mList, mod, cws, mcs) => {
      const scale = FS.scale;
      const cam = a.camo;
      const M = look(mw);
      const nB = cam ? M.mA : M.mN;
      let nS = 0, kR = 1;
      for (let xi = 0; xi < wsList.length; xi++) {
        const x = wsList[xi];
        const W = look(x.w);
        const sl = cam ? W.sA : W.sN, slN = cam ? W.cSA : W.cSN;
        const n = cam ? W.nA : W.nN;
        if (n <= 1e-9) continue;
        if (n > nS) nS = n;
        /* the crowd tables assume the bloons sit within about 1.6 x 2R of track (C.POWER_SPOT); a global attack's window is
           the whole track, so only that much of it counts as "together" */
        const crowd = (n + nB) / lanes * Math.min(1, x.dens);
        const shareS = n / (n + nB);
        /* interpolation weights for this crowd, shared by the window's rows (as C.hitsAt) */
        let ci = 0, ct = 0, cs1 = 0;
        if (crowd <= 1) { ci = -1; ct = Math.max(0, crowd); }
        else if (crowd > 32) { ci = 6; cs1 = crowd / 32; }
        else { ci = 1; while (crowd > CROWD[ci]) ci++; ct = Math.log(crowd / CROWD[ci - 1]) / Math.log(CROWD[ci] / CROWD[ci - 1]); }
        for (let ri = 0; ri < x.rows.length; ri++) {
          const w = x.rows[ri];
          let rate = 1, d = w.d, dc = w.dc;
          if (mod) {
            if (mod.t) { rate /= Math.max(0.05, num(mod.t[0], 1)); d += num(mod.t[1], 0); if (dc > 0) dc += num(mod.t[1], 0); }
            if (mod.u) { d += mod.u; if (dc > 0) dc += mod.u; }
          }
          const hs = w.hs;
          const h0 = ci < 0 ? hs[0] * ct : ci === 6 ? (hs[5] > 1.9 * hs[4] ? hs[5] * cs1 : hs[5]) : hs[ci - 1] + (hs[ci] - hs[ci - 1]) * ct;
          if (ri === 0 && w.hs[0] > 0) kR = Math.max(kR, h0 / w.hs[0]);
          const H = h0 * rate * scale * shareS;
          if (H <= 0) continue;
          const sharp = w.imm & 16;
          const pc = late ? (w.pc1 || (w.pc1 = [])) : (w.pc0 || (w.pc0 = []));
          /* where the hits land: C.TARGET_FRONT of them go to the bloons furthest along (First targeting: a tower keeps
             shooting the front ones until they pop), the rest spread over the crowd in reach (pierce, splash) */
          const per = H * (1 - C.TARGET_FRONT) / n;
          let rem = H * C.TARGET_FRONT;
          /* window lists are built from B sorted front first */
          for (let bi = 0; bi < slN; bi++) { const b = sl[bi]; b.cl += giveHit(a, w, b, per * b.n, sharp, d, dc, mod, pc); }
          for (let bi = 0; bi < slN && rem > 1e-9; bi++) {
            const b = sl[bi];
            if (w.imm & b.prop) continue;
            const dd = b.cer ? dc : d;
            if (!(dd > 0)) continue;
            const pe = pc[b.ki] || popOf(b.type, late, b.fort, Math.round(dd * 4) / 4, w.imm);
            const room = Math.max(0, b.n - b.cl) * pe.k / Math.max(0.05, 1 - (sharp ? b.fz : 0));
            if (room <= 0) continue;
            const h = Math.min(rem, room);
            b.cl += giveHit(a, w, b, h, sharp, d, dc, mod, pc);
            rem -= h;
          }
        }
      }
      /* blimps: towers aim at them when they are in reach (Strong targeting), front one first; an attack that pierces or
         splashes reaches several (tower-power mc: MOAB damage with 2, 4 ... 32 blimps in reach) */
      if (nB > 0 && mList.length) {
        const tm = mod && mod.t ? 1 / Math.max(0.05, num(mod.t[0], 1)) : 1;
        let one = 0, oneD = 0;
        for (let i = 0; i < mList.length; i++) { const v = mList[i].dps * scale * tm; one += v; if (!(mList[i].imm & 3)) oneD += v; }
        const tgt = cam ? M.bA : M.bN, tgtN = cam ? M.cBA : M.cBN;
        /* blimps close behind the front one (within about 1.6 x 2R of track, R capped at 120) count as together */
        let near = 0;
        const span2 = 1.6 * 2 * Math.min(120, a.R);
        for (let i = 0; i < tgtN; i++) if (tgt[0].x - tgt[i].x <= span2) near += tgt[i].n;
        const k = mcs ? Math.min(near, C.hitsAt(mcs.length === 5 ? (mcs.full || (mcs.full = [1].concat(mcs))) : mcs, near / lanes) || 1) : 1;
        let left = one * Math.max(1, k), leftD = oneD * Math.max(1, k);
        for (let i = 0; i < tgtN && left > 1e-9; i++) {
          const b = tgt[i];
          const cap = (b.type === 'ddt' ? oneD : one) * Math.max(1, b.n);
          const pool = Math.min(cap, b.type === 'ddt' ? Math.min(left, leftD) : left);
          if (pool <= 0) continue;
          const need = b.n * b.hp - b.acc - b.pendDmg;
          const use = Math.min(pool, Math.max(0, need));
          b.pendDmg += use;
          a.pops += use;
          left -= use; leftD = Math.max(0, leftD - use);
        }
      }
      /* freeze / stun / slow / maim */
      if (cws) for (let ci = 0; ci < cws.length; ci++) {
        const c = cws[ci];
        const W = look(c.w);
        const P1 = cam ? W.sA : W.sN, n1 = cam ? W.cSA : W.cSN, P2 = cam ? W.bA : W.bN, n2 = c.mo ? (cam ? W.cBA : W.cBN) : 0;
        let n = 0;
        for (let i = 0; i < n1; i++) if (ccOk(c, P1[i])) n += P1[i].n;
        for (let i = 0; i < n2; i++) if (ccOk(c, P2[i])) n += P2[i].n;
        if (n <= 1e-9) continue;
        /* applications per bloon per second (scale is dt for attacks, 1 for an instant ability) */
        const per = (c.mo === 2 ? c.hs[0] : C.hitsAt(c.hs, n / lanes)) * scale / n;
        for (let i = 0; i < n1 + n2; i++) {
          const b = i < n1 ? P1[i] : P2[i - n1];
          if (!ccOk(c, b)) continue;
          if (c.k === 'f') { b.aF += per; b.fzD = Math.max(0.2, c.du * (b.type === 'ceramic' ? num(c.mu, 1) : 1)); }
          else if (c.k === 't') { b.aS += per; b.snD = Math.max(0.1, c.du); }
          else if (c.k === 's') { b.aL += per; b.slM = Math.min(b.slM, c.mu); b.slD = Math.max(0.2, c.du); }
          else if (c.k === 'm') { const du = arr(c.du)[MAIM[b.type]]; if (du > 0) { b.aS += per; b.snD = du; } }
        }
      }
    };
    /* freeze / stun / slow over one step: each is applied at a rate (a per second, or a one-off share from an instant
       ability) and wears off after its duration; solved exactly over the step: x -> s + (x - s) e^-(a + 1/d) dt */
    const relax = (x, a, d, dt) => {
      if (a <= 0) return x <= 0 ? 0 : d < 1e5 ? x * Math.exp(-dt / d) : x;
      if (a >= 1e6) return 1;
      const k = a / dt + 1 / d, st = (a / dt) / k;
      return st + (x - st) * Math.exp(-k * dt);
    };
    while (guard++ < 5000) {
      while (si < S.spawns.length && S.spawns[si].t <= t) {
        const s = S.spawns[si++];
        addBucket(s.type, s.fort, s.camo, s.n, Math.min(L, S.speed[s.type] * (t - s.t)), null, s.g);
        if (s.blimp) { const st = blimpStat[s.g] || (blimpStat[s.g] = { type: s.type, count: 0, killed: 0, dmg: 0, hp: Math.round(hpOf(s.type, s.fort)) }); st.count += s.n; }
      }
      if (!B.length && si >= S.spawns.length) break;
      /* what is past every window leaks (nothing can touch it any more) */
      let any = false, stream = false, vB = 1;
      for (let i = 0; i < B.length; i++) {
        const b = B[i];
        if (b.x >= uLo) any = true;
        if (!b.blimp) stream = true; else vB = Math.max(vB, b.spd);
      }
      /* step: short while small bloons are in reach, longer while only slow blimps are */
      const vNow = stream || (si < S.spawns.length && !S.spawns[si].blimp && S.spawns[si].t < t + 2) ? vStream : Math.max(vB, S.speed.ceramic * 0.5);
      const dt = Math.max(0.04, Math.min(dtMax, k0 * Math.max(10, wMin) / vNow));
      /* nothing in reach: jump to the next spawn or the next bucket reaching the windows */
      if (!any) {
        let tn = si < S.spawns.length ? S.spawns[si].t : Infinity;
        for (let i = 0; i < B.length; i++) { const b = B[i]; const v = b.spd * (1 - Math.min(1, b.fz + b.sn)); if (v > 0) tn = Math.min(tn, t + (uLo - b.x) / v); }
        if (tn === Infinity) { B.forEach(leakB); B.forEach((b) => POOL.push(b)); B.length = 0; break; }
        const jump = Math.max(0, tn - t);
        if (jump > dt) {
          for (let i = 0; i < B.length; i++) { const b = B[i]; b.x += b.spd * jump * (1 - Math.min(1, b.fz + b.sn)) * (1 - b.sl * (1 - b.slM)); }
          t += jump;
          rebin();
          continue;
        }
      }
      stamp = ++STAMP;
      work += 2 * units.length + 3 * B.length;
      for (let i = 1; i < B.length; i++) { const b = B[i]; let j = i - 1; while (j >= 0 && B[j].x < b.x) { B[j + 1] = B[j]; j--; } B[j + 1] = b; }
      for (let i = 0; i < B.length; i++) { B[i].cl = 0; B[i].pn = 0; }
      PN = 0;
      /* every attack of this step, from the state at its start */
      for (let ui = 0; ui < units.length; ui++) {
        const u = units[ui], a = u.a;
        let boost = null;
        for (let k = 0; k < a.ab.length; k++) {
          const ab = a.ab[k];
          /* used like a player would: when it is ready and a blimp is in reach (blimp abilities), a big crowd is in reach
             (15% of the round's RBE), or bloons are about to get past every tower */
          if (ab.next == null || (t >= ab.next && ab.until < t)) {
            const wantB = !ab.rows.length && ab.m.length;
            let rbeIn = 0, late2 = false, blimpIn = false;
            const edge = uHi - 0.2 * (uHi - uLo);
            for (let wi = -1; wi < ab.ws.length; wi++) {
              const w = wi < 0 ? ab.mw : ab.ws[wi].w;
              if (wi >= 0 && w === ab.mw) continue;
              const W = look(w);
              if ((a.camo ? W.mA : W.mN) > 0) blimpIn = true;
              const sl = a.camo ? W.sA : W.sN, slN = a.camo ? W.cSA : W.cSN;
              for (let i = 0; i < slN; i++) { rbeIn += sl[i].n * C.rbeOf(sl[i].type, late, sl[i].fort); if (sl[i].x > edge) late2 = true; }
              const bl = a.camo ? W.bA : W.bN, blN = a.camo ? W.cBA : W.cBN;
              for (let i = 0; i < blN; i++) { rbeIn += bl[i].n * S.rbeFull(bl[i].type, bl[i].fort); if (bl[i].x > edge) late2 = true; }
            }
            const go = wantB ? blimpIn : (blimpIn || late2 || rbeIn >= 0.15 * S.total);
            if (go && ab.next == null) { ab.next = t; ab.str = Math.min(1, span / ab.cd); }
            else if (!go && ab.next != null) ab.hold = true;
            else ab.hold = false;
          }
          if (ab.next != null && t >= ab.next && ab.until < t && !ab.hold) { ab.until = t + Math.max(ab.d, 0); ab.next = t + ab.cd; ab.fired++; if (ab.fired > 1) ab.str = 1; }
          if (ab.until >= t) {
            const inst = ab.d <= 0;
            if (ab.ws.length || ab.m.length || ab.cw.length) { FS.scale = (inst ? 1 : dt) * ab.str; fire(a, ab.ws, ab.mw, ab.m, null, ab.cw, ab.mc); }
            if ((ab.t || ab.u) && !boost && ab.str >= 0.5) boost = ab;
            if (inst) ab.until = -1;
          }
        }
        /* the tower's own attacks (Turbo Charge / Perma Charge change them while active) */
        FS.scale = dt;
        fire(a, u.ws, u.mw, a.m, boost, u.cw, a.mc);
      }
      /* apply pops */
      let nb = 0;
      for (let i = B.length - 1; i >= 0; i--) {
        const b = B[i];
        if (b.blimp) {
          if (b.pendDmg > 0) {
            b.acc += b.pendDmg; b.pendDmg = 0;
            const hp = b.hp;
            let k = Math.min(b.n, Math.floor(b.acc / hp + 1e-9));
            /* a fraction of a blimp left: it pops when its share of the HP is done */
            if (b.n - k < 1 && b.acc - k * hp >= (b.n - k) * hp * (1 - 1e-6) - 1e-6) k = b.n;
            if (k > 0) {
              b.n -= k; b.acc = Math.max(0, b.acc - k * hp);
              const st = blimpStat[b.g]; if (st && st.type === b.type) st.killed += k;
              const kids = C.BLIMP_KIDS[b.type];
              for (let q = 0; q < kids.length; q++) { const c = kids[q][0]; const z = BORN[nb] || (BORN[nb] = []); z[0] = c; z[1] = b.fort; z[2] = b.camo || b.type === 'ddt' || c === 'ddt'; BORN_N[nb] = k * kids[q][1]; BORN_X[nb] = b.x; z[5] = b; z[6] = b.g; nb++; }
            }
          }
        } else if (b.pn > 0) {
          let tot = 0;
          for (let j = b.ph, c = 0; c < b.pn; j = PNX[j], c++) tot += PK[j];
          const sc = tot > b.n ? b.n / tot : 1;
          /* the children of every hit on this bucket, added up per kind: they all appear at the bucket's spot */
          let nk = 0;
          for (let j = b.ph, c = 0; c < b.pn; j = PNX[j], c++) {
            const k = PK[j] * sc, pe = PP[j];
            PA[j].pops += k * pe.removed;
            const kk = pe.kk, kn = pe.kn;
            for (let q = 0; q < kk.length; q++) {
              const ki = kk[q];
              if (KACC[ki] === 0) KTOUCH[nk++] = ki;
              KACC[ki] += k * kn[q];
            }
          }
          for (let q = 0; q < nk; q++) {
            const ki = KTOUCH[q];
            const z = BORN[nb] || (BORN[nb] = []); z[0] = KTYPE[ki]; z[1] = false; z[2] = b.camo; BORN_N[nb] = KACC[ki]; BORN_X[nb] = b.x; z[5] = b; z[6] = null; nb++;
            KACC[ki] = 0;
          }
          b.n -= tot * sc;
          b.pn = 0;
        }
      }
      /* popped-out buckets go back to the pool after their children are placed (a child reads its parent's freeze) */
      let j2 = 0, nGone = 0;
      for (let i = 0; i < B.length; i++) if (B[i].n > 1e-6) B[j2++] = B[i]; else GONE[nGone++] = B[i];
      B.length = j2;
      bornNow = true;
      for (let i = 0; i < nb; i++) { const z = BORN[i]; addBucket(z[0], z[1], z[2], BORN_N[i], BORN_X[i], z[5], z[6]); z[5] = null; }
      for (let i = 0; i < nGone; i++) { POOL.push(GONE[i]); GONE[i] = null; }
      bornNow = false;
      /* move, thaw; what reaches the end (or passes every window) leaks */
      let j = 0;
      for (let i = 0; i < B.length; i++) {
        const b = B[i];
        let stop = 0;
        if (b.fz > 0 || b.sn > 0 || b.sl > 0 || b.aF > 0 || b.aS > 0 || b.aL > 0) {
          const fz0 = b.fz, sn0 = b.sn;
          b.fz = Math.min(1, relax(b.fz, b.aF * Math.max(0, 1 - b.sn), b.fzD, dt));
          b.sn = Math.min(1 - b.fz, relax(b.sn, b.aS * Math.max(0, 1 - b.fz), b.snD, dt));
          b.sl = Math.min(1, relax(b.sl, b.aL, b.slD, dt));
          b.aF = 0; b.aS = 0; b.aL = 0;
          stop = Math.min(1, (fz0 + sn0 + b.fz + b.sn) / 2);
        }
        let zf = 1;
        for (let zi = 0; zi < zones.length; zi++) {
          const z = zones[zi];
          if (b.x < z.w.lo || b.x > z.w.hi) continue;
          if (b.blimp) zf = Math.min(zf, num(arr(z.sb)[MAIM[b.type]], 1));
          else if (!(b.prop & z.skip)) zf = Math.min(zf, z.sp);
        }
        /* children born during the step are born halfway through it on average */
        const part = b.nb ? 0.5 : 1;
        b.nb = false;
        b.x = Math.max(0, b.x + b.spd * dt * part * (1 - stop) * (1 - b.sl * (1 - b.slM)) * zf);
        if (b.x >= L || b.x > uHi) { leakB(b); POOL.push(b); } else B[j++] = b;
      }
      B.length = j;
      rebin();
      t += dt;
    }
    B.forEach(leakB);
    B.forEach((b) => POOL.push(b));
    let leakExp = 0;
    leaked.forEach((e) => { leakExp += e.rbe; const whole = Math.round(e.n); if (whole > 0) leak += e.rbe * whole / e.n; });
    Object.keys(blimpStat).forEach((g) => { const st = blimpStat[g]; st.killed = Math.round(st.killed * 100) / 100; st.dmg = Math.round(Math.min(1, st.killed / Math.max(1e-9, st.count)) * st.hp); });
    return { work, leak: Math.max(0, Math.min(S.total, leak)), leakExp, blimps: Object.keys(blimpStat).map((g) => blimpStat[g]), frozenShare: sh.hits > 0 ? sh.wasted / sh.hits : 0,
      per: ats0.map((a) => { const h = ats.find((q) => q.copies.indexOf(a) >= 0); return { label: a.label, pops: Math.round(h.pops / h.copies.length) }; }) };
  };

  /* one round, one set of attackers (C.powerList). Result: leak (RBE that gets through) and lives, with abilities used
     on cooldown when that predicts real games better (C.LEAK_WITH_ABILITIES); leakNoAbilities / leakAbilities both ways;
     leakRange [great spot, bad spot] (computed on first read). opts.fast: a coarser timeline for fix search. */
  C.glacialFrozen = (it, r) => !!(it && it.id !== 'ice' && it.placedAt != null && r - it.placedAt >= 9 && [9, 0].indexOf((r - it.placedAt) % 10) >= 0);
  C.LEAK_WITH_ABILITIES = true;
  C.LEAK_MARGIN = 0.01;
  C.STEP = [0.6, 1.5]; /* time step: share of the smallest reach the fastest bloon crosses per step, and the longest step (s) */
  C.STEP_FAST = [0.8, 3];
  C.CHUNKS = [12, 8, 1.5]; /* a group splits into one batch per this many seconds, at most [small bloons, blimps] batches */
  C.SPOT_SELF = 4.2; /* an Ice Monkey: bloons stall in its frozen circle, so it works over more track than its range says (fitted to one real game, see leak-check.md) */
  C.TARGET_FRONT = 0.5;
  /* results are cached by everything they depend on (the Simulator re-runs every round on each edit; most rounds don't change) */
  const leakCache = new Map();
  C.LEAK_CACHE = 4000;
  const sigOf = (D, mode, map, r, list, fx, opts) => {
    let k = (mode && mode.id) + '|' + (mode && mode.roundSet) + '|' + (map ? map.id + ':' + map.rbs + ':' + map.lanes : '-') + '|' + r + '|' + (opts && opts.fast ? 'f' : '') +
      '|' + C.POWER_SPOT + ',' + C.SPOT_SELF + ',' + C.LEAK_WITH_ABILITIES + ',' + C.LEAK_MARGIN + ',' + C.TARGET_FRONT + ',' + C.STEP + ',' + C.STEP_FAST + ',' + C.SPOT_RANGE;
    if (fx) k += '|fx' + num(fx.blimpHpMult, 1) + ',' + num(fx.reloadMult, 1) + ',' + arr(fx.attack).map((a) => a.node).join(',');
    arr(list).forEach((it) => {
      k += '|' + it.label + '~' + it.id + '~' + (it.x ? it.x.join('') : '') + '~' + (it.hero ? it.level || '' : '') + '~' + (it.camo ? 1 : 0) + (it.lead ? 1 : 0) + (it.black ? 1 : 0) + '~' + num(it.grant, 0) +
        '~' + buffText(it) + '~' + (map && map.id === 'glacial-trail' && C.glacialFrozen(it, r) ? 'F' : '') + '~' + pid(it.power);
    });
    return k;
  };
  C.leakRound = function (D, mode, map, r, list, fx, opts) {
    const key = sigOf(D, mode, map, r, list, fx, opts);
    const hit = leakCache.get(key);
    if (hit && hit.D === D) return hit.res;
    const res = leakRoundRaw(D, mode, map, r, list, fx, opts);
    if (leakCache.size >= C.LEAK_CACHE) leakCache.delete(leakCache.keys().next().value);
    leakCache.set(key, { D, res });
    return res;
  };
  C.leakCacheClear = () => leakCache.clear();
  /* the cached answer, or undefined when it would have to be worked out */
  C.leakCached = function (D, mode, map, r, list, fx, opts) {
    const hit = leakCache.get(sigOf(D, mode, map, r, list, fx, opts));
    return hit && hit.D === D ? hit.res : undefined;
  };
  const leakRoundRaw = function (D, mode, map, r, list, fx, opts) {
    const S = roundSetup(D, mode, r, fx);
    const row = C.roundRow(D, mode, r);
    if (!S || !row) return null;
    /* Glacial Trail: each tower freezes (can't attack) on rounds p+9 and p+10 of every 10-round cycle from the round p it
       was placed on (data/map-strats-b.json, Bloons Wiki); Ice Monkeys never freeze. Needs it.placedAt */
    if (map && map.id === 'glacial-trail') list = arr(list).filter((it) => !C.glacialFrozen(it, r));
    /* the same towers give the same answer whatever order they're listed in (the Advisor and the Simulator list them differently) */
    const canon = (it) => (it.hero ? '1' : '0') + it.id + (it.x ? it.x.join('') : '') + (it.hero ? num(it.level, 0) : '');
    list = arr(list).map((it) => [canon(it), it]).sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0)).map((p) => p[1]);
    const anyAb = arr(list).some((it) => it.power && (arr(it.power.ab).length || it.abBuff));
    const run = (abilities, spot) => {
      const ats = [];
      arr(list).forEach((it) => buildAttacker(it, abilities, ats));
      return runTimeline(S, ats, map, spot, opts);
    };
    const withAb = C.LEAK_WITH_ABILITIES && anyAb;
    const main = run(withAb, C.POWER_SPOT);
    const other = anyAb ? (withAb ? null : null) : main;
    const livesPerRbe = num(row.lives, 0) > 0 && num(row.rbe, 0) > 0 ? Math.min(1, row.lives / row.rbe) : 1;
    const total = S.total;
    /* the timeline's resolution: a leak under C.LEAK_MARGIN of the round's RBE (one Ceramic of a blimp round) is within
       the check's own error, so it is reported as a close call (close), not as a leak */
    const cut = (v) => (v > 0 && v < C.LEAK_MARGIN * total ? 0 : Math.round(v));
    const lk = cut(main.leak);
    let pops = 0;
    main.per.forEach((p) => { pops += p.pops; });
    const res = { r, rbe: Math.round(total), popped: Math.round(Math.max(0, total - lk)), leak: lk, lives: Math.round(lk * livesPerRbe),
      share: total > 0 ? Math.max(0, 1 - lk / total) : 1, dur: Math.max(1, S.t1 - S.t0), perSec: Math.round(S.nStream / Math.max(1, S.t1 - S.t0) * 10) / 10,
      depth: S.depth, per: main.per, blimps: main.blimps, power: Math.round(pops), frozenShare: main.frozenShare, abilities: withAb, spot: C.POWER_SPOT,
      work: main.work, close: lk === 0 && main.leak >= 0.5 ? { leak: Math.round(main.leak), lives: Math.round(main.leak * livesPerRbe) } : null };
    const memo = {};
    const lazy = (k, f) => Object.defineProperty(res, k, { enumerable: true, configurable: true, get() { if (!(k in memo)) memo[k] = f(); return memo[k]; } });
    lazy('leakNoAbilities', () => (withAb ? cut(run(false, C.POWER_SPOT).leak) : lk));
    lazy('livesNoAbilities', () => Math.round(res.leakNoAbilities * livesPerRbe));
    lazy('leakAbilities', () => (withAb || !anyAb ? lk : cut(run(true, C.POWER_SPOT).leak)));
    lazy('livesAbilities', () => Math.round(res.leakAbilities * livesPerRbe));
    lazy('leakRange', () => C.SPOT_RANGE.map((s) => cut(run(withAb, s).leak)));
    lazy('livesRange', () => res.leakRange.map((x) => Math.round(x * livesPerRbe)));
    void other;
    return res;
  };
  /* C.leakQuick: the 0.9.2 averaged-stream estimate, kept as a fast screen (about 0.01 ms) for fix search. It is coarse (one
     averaged stream per round, blimp children as Ceramics) and only ranks candidates: confirm what you show with C.leakRound */
  const quickBuff = (it) => {
    const b = it.buff;
    if (!b) return null;
    const p = b.perm || {};
    let hits = num(p.rate, 1) * (num(p.pierce, 0) > 0 ? 1 + 0.25 * p.pierce : 1), dmg = num(p.dmg, 0), range = num(p.range, 1);
    arr(b.timed).forEach((t) => { const u = num(t.u, 1); hits *= 1 + u * (num(t.rate, 1) * (num(t.pierce, 0) > 0 ? 1 + 0.25 * t.pierce : 1) - 1); dmg += u * num(t.dmg, 0); range *= 1 + u * (num(t.range, 1) - 1); });
    return { hits, dmg, range };
  };
  C.QUICK_SPOT = 1.6;
  C.QUICK_FREEZE = 0.63;
  C.leakQuick = function (D, mode, map, r, list, fx) {
    const pw = D.power || {};
    const abr = mode && mode.roundSet === 'abr';
    /* bloon groups from the game's round sets (data/game/rounds.json; ABR too) */
    const groups = arr(arr(abr ? pw.roundsAbr : pw.rounds)[r - 1]);
    const row = C.roundRow(D, mode, r);
    if (!groups.length || !row) return null;
    const late = r >= 81;
    /* every bloon moves faster on Medium (x1.1) and Hard/CHIMPS (x1.25), game: GlobalSpeedModModel; and from R81 */
    const vMult = num(mode && mode.bloonSpeedMult, 1) * C.speedMult(r);
    const speedOf = (t) => num((pw.bloonSpeed || {})[t], 25) * vMult;
    /* Double HP MOABs (game: DoubleMoabHealth x2), Big Bloon Sabotage (Monkey Knowledge: blimps spawn with 10% less HP) */
    const hpMult = C.blimpHpMult(r) * (mode && mode.id === 'double-hp-moabs' ? 2 : 1) * num(fx && fx.blimpHpMult, 1);
    /* Easy difficulty (Easy, Primary Only, Deflation): the R40 MOAB has 2/3 HP (game: Mods/Easy.json SetHealthForBloonModModel) */
    const easyR40 = r === 40 && mode && mode.base === 'easy' ? 0.6667 : 1;
    const hpOf = (t, fort) => C.BLIMP_HP[t] * (fort ? 2 : 1) * hpMult * (t === 'moab' ? easyR40 : 1);
    let t0 = Infinity, t1 = 0, rbe = 0;
    const stream = {}; /* 'type|fort|camo' -> count */
    const addStream = (t, c, fort, camo) => { const k = t + '|' + (fort ? 1 : 0) + '|' + (camo ? 1 : 0); stream[k] = (stream[k] || 0) + c; };
    const blimpsIn = [];
    groups.forEach(([name, count, start, dur]) => {
      const b = bloonType(name);
      t0 = Math.min(t0, start); t1 = Math.max(t1, start + dur);
      if (C.BLIMP_HP[b.base]) { blimpsIn.push({ type: b.base, count, dur, fort: b.fort, camo: b.camo || b.base === 'ddt', reach: 1 }); return; }
      addStream(b.base, count, b.fort, b.camo);
    });
    const dur = Math.max(1, t1 - t0);
    const track = map && map.rbs ? map.rbs * 25 : 30 * 25;
    const lanes = map && map.lanes ? map.lanes : 1;
    const tinFor = (R, sp) => (R >= 900 ? track / sp : Math.min(track / sp, C.QUICK_SPOT * 2 * R / sp));
    /* blimps: each shell must die inside the towers' reach, or it leaks whole (lives = its RBE). A killed blimp's
       children spawn where it died, so they only get the reach that was left */
    const bMemo = {};
    const blimpRbe = (t, fort, late2) => {
      const key = t + (fort ? 1 : 0);
      if (bMemo[key] != null) return bMemo[key];
      const kids = arr(C.BLIMP_KIDS[t]);
      const hp = hpOf(t, fort);
      bMemo[key] = hp + kids.reduce((a, [k, c]) => a + c * (C.BLIMP_HP[k] ? blimpRbe(k, fort, late2) : C.rbeOf(k, late2, fort)), 0);
      return bMemo[key];
    };
    let leak = 0, margin = 99;
    const blimpOut = [];
    const queue = blimpsIn.slice();
    const ORDER = ['bad', 'zomg', 'bfb', 'ddt', 'moab'];
    queue.sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
    let guard = 0;
    while (queue.length && guard++ < 200) {
      const b = queue.shift();
      const hp = hpOf(b.type, b.fort);
      const v = speedOf(b.type);
      let dmg = 0, over = 0;
      list.forEach((it) => {
        const e = it.power;
        if (!e || !(e.m > 0) || (b.camo && it.camo === false) || (b.type === 'ddt' && (it.lead === false || it.black === false))) return;
        const bf = quickBuff(it) || {};
        const m = e.m * num(bf.hits, 1) * (1 + num(bf.dmg, 0) * 0.5);
        const tin = tinFor(num(e.r, 40) * num(bf.range, 1), v) * b.reach;
        dmg += m * tin; /* what one blimp takes on its way past */
        over += m * (b.dur + tin); /* what the whole group can take */
      });
      /* 0% of them die at 70% of their HP in reach, all at 130% (placement varies): an estimate */
      const each = Math.max(0, Math.min(1, (dmg / hp - 0.7) / 0.6));
      const killed = Math.min(b.count * each, over / hp);
      leak += (b.count - killed) * blimpRbe(b.type, b.fort, late);
      const left = dmg > 0 ? Math.max(0, 1 - hp / dmg) : 0; /* share of the reach left when it died */
      arr(C.BLIMP_KIDS[b.type]).forEach(([k, c]) => {
        if (killed <= 0) return;
        if (C.BLIMP_HP[k]) queue.push({ type: k, count: killed * c, dur: b.dur, fort: b.fort, camo: b.camo || k === 'ddt', reach: b.reach * left, child: true });
        else addStream(k, killed * c, b.fort, b.camo || b.type === 'ddt');
      });
      queue.sort((a, q) => ORDER.indexOf(a.type) - ORDER.indexOf(q.type));
      if (!b.child) blimpOut.push({ type: b.type, count: b.count, killed, dmg: Math.round(dmg), hp: Math.round(hp) });
      margin = Math.min(margin, b.count > 0 ? dmg / hp : 99);
    }
    /* the stream: every non-blimp bloon, plus what popped blimps released */
    let n = 0, vSum = 0, streamRbe = 0, camoRbe = 0, leadShell = 0;
    const kinds = Object.keys(stream).map((k) => { const [t, f, c] = k.split('|'); return { t, fort: f === '1', camo: c === '1', n: stream[k] }; });
    kinds.forEach((g) => {
      const e = C.rbeOf(g.t, late, g.fort) * g.n;
      n += g.n; vSum += speedOf(g.t) * g.n; streamRbe += e;
      if (g.camo) camoRbe += e;
      else if (g.t === 'lead') leadShell += node('lead', late, g.fort)[0] * g.n; /* only the Lead shell needs a Lead popper */
    });
    /* our bloon tree reproduces the game's round RBE exactly (tested), so no scaling: modes that change blimp HP
       (Double HP MOABs, Easy R40, Big Bloon Sabotage) change the RBE too */
    const scale = 1;
    const total = streamRbe + blimpsIn.reduce((a, b) => a + b.count * blimpRbe(b.type, b.fort, late), 0);
    const v = n ? vSum / n : 25;
    const lambda = n / dur; /* bloons spawned per second */
    /* RBE removed per hit with d damage (leftover damage carries into children) */
    const perHitMemo = {};
    const perHit = (d) => {
      const key = Math.round(d * 4);
      if (perHitMemo[key] != null) return perHitMemo[key];
      let R = 0, H = 0;
      kinds.forEach((g) => { R += C.rbeOf(g.t, late, g.fort) * g.n; H += C.hitsToClear(g.t, d, late, g.fort) * g.n; });
      perHitMemo[key] = H > 0 ? R / H : 1;
      return perHitMemo[key];
    };
    let pops = 0;
    const per = [];
    let frozenShare = 0;
    const rawPops = (e, hitsOnly, bf) => {
      let p = 0;
      bf = bf || {};
      arr(e.a).forEach(([R0, dmg0, hs0]) => {
        const dmg = dmg0 + num(bf.dmg, 0);
        const R = R0 >= 900 ? R0 : R0 * num(bf.range, 1);
        const hs = bf.hits ? hs0.map((h) => h * bf.hits) : hs0;
        const tin = tinFor(R, v);
        const k = lambda * tin / lanes;
        const present = 1 - Math.exp(-k);
        const nIn = Math.max(1, k / Math.max(present, 1e-6));
        p += C.hitsAt(hs, nIn) * (hitsOnly ? 1 : perHit(dmg)) * present * (dur + tin);
      });
      return p;
    };
    /* an Ice Monkey's frozen bloons can't be popped by Sharp attacks (darts, tacks, Quincy...) until they thaw */
    list.forEach((it) => { if (it.freezes && it.power) frozenShare += rawPops(it.power, true) / Math.max(1, n); });
    frozenShare = Math.min(0.85, frozenShare * C.QUICK_FREEZE);
    list.forEach((it) => {
      const e = it.power;
      if (!e) return;
      let p = rawPops(e, false, quickBuff(it));
      const blocked = (it.camo === false ? camoRbe : 0) + (it.lead === false ? leadShell : 0);
      p *= Math.max(0, 1 - blocked / Math.max(1, streamRbe));
      if (frozenShare > 0 && !it.freezes && it.frozen === false) p *= 1 - frozenShare;
      p *= scale;
      per.push({ label: it.label, pops: Math.round(p) });
      pops += p;
    });
    leak += Math.max(0, streamRbe * scale - pops);
    leak = Math.min(total, leak);
    /* lives: a leaked bloon costs its layers, but from R81 blimps don't cost their ramped HP and Super Ceramics cost 65,
       so lives per leaked RBE follow the game's round table (data/game/rounds.json leak vs rbe) */
    const livesPerRbe = num(row.lives, 0) > 0 && num(row.rbe, 0) > 0 ? Math.min(1, row.lives / row.rbe) : 1;
    return { r, rbe: Math.round(total), popped: Math.round(Math.max(0, total - leak)), leak: Math.round(leak), lives: Math.round(leak * livesPerRbe), share: total > 0 ? Math.max(0, 1 - leak / total) : 1,
      quick: true, surplus: Math.min(margin, streamRbe > 0 ? pops / streamRbe : 99) };
  };
  /* from this round the check is labelled rough in the tools (see content/guides/leak-check.md for the calibration) */
  C.ROUGH_FROM = 86;
  C.FREEZE_FIT = 1; /* kept for older callers; freezing is now modelled from the Ice Monkey's own freeze data */

  /* the attackers of one moment, for C.leakRound: towers [{uid, id, x, label}] and the hero {id, level, label} */
  /* buffs from the game files (data/game/support.json, v56). Placement is unknown, so: a Village reaches the C.VILLAGE_REACH
     towers placed nearest it and an Alchemist brews one tower per throw shared over the C.BREW_REACH attackers nearest it.
     Estimate: players put support next to their main damage, so "nearest" = the strongest attackers (most hits a second,
     ties by tower and crosspath). This doesn't depend on the order towers are listed, so the Advisor and the Simulator agree. */
  C.VILLAGE_REACH = 4;
  C.BREW_REACH = 3;
  const matchWhen = (x, when, id) => {
    if (!when) return true;
    if (Array.isArray(when)) return false;
    const pat = when[id];
    if (!pat) return true;
    const p0 = String(pat).split(' ')[0].split('-');
    if (p0.length !== 3) return false;
    return p0.every((p, i) => p === 'x' || (p.slice(-1) === '+' ? num(x[i], 0) >= +p.slice(0, -1) : num(x[i], 0) === +p));
  };
  const near = (insts, idx, n, byIdx, hitsOf) => insts.map((j, k) => [k, byIdx[k] ? hitsOf(byIdx[k]) : -1, j.id + (j.x ? j.x.join('') : '')]).filter(([k, h]) => k !== idx && h >= 0)
    .sort((a, b) => b[1] - a[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0)).slice(0, n).map(([k]) => k);
  C.powerList = function (D, insts, hero, fx) {
    const pm = D.pop || {};
    const out = [];
    insts.forEach((i, idx) => {
      const e = C.powerOf(D, i.id, i.x);
      if (!e) return;
      const own = C.towerProps(pm, i.id, i.x);
      out.push({ uid: i.uid, id: i.id, x: i.x, idx, label: i.label, placedAt: i.placedAt != null ? i.placedAt : null, power: e, camo: !!own.camo, lead: !!own.lead, black: !!own.black, white: !!own.white, purple: !!own.purple, frozen: !!own.frozen, freezes: i.id === 'ice' });
    });
    if (hero) {
      const e = C.heroPowerOf(D, hero.id, hero.level);
      const hp = C.heroProps(pm, hero.id, hero.level);
      if (e) out.push({ uid: 'hero', id: hero.id, idx: -1, label: hero.label || hero.id, placedAt: hero.placedAt != null ? hero.placedAt : null, power: e, camo: !!hp.camo, lead: !!hp.lead, black: pm.heroes && pm.heroes[hero.id] && pm.heroes[hero.id].black ? !!hp.black : true, white: true, purple: true, frozen: !!hp.frozen, hero: true });
    }
    const add = (it, key, b) => { const bf = it[key] || (it[key] = { perm: {}, timed: [] }); if (b.u == null || b.u >= 1) { const p = bf.perm; ['rate', 'range'].forEach((k) => { if (b[k] != null) p[k] = num(p[k], 1) * b[k]; }); ['pierce', 'dmg', 'rangeAdd', 'dcAdd', 'mAdd'].forEach((k) => { if (b[k] != null) p[k] = num(p[k], 0) + b[k]; }); if (b.grant) p.grant = num(p.grant, 0) | b.grant; } else bf.timed.push(b); };
    const byIdx = {};
    out.forEach((it) => { if (it.idx >= 0) byIdx[it.idx] = it; });
    const hitsOf = (it) => { const a = arr(it.power.a); let s = 0; a.forEach((w) => { s += w[2][0]; }); return Math.max(0.2, s || num(it.power.mh, 1)); };
    /* Village (MonkeyVillage*.json): +10% range in its radius; Jungle Drums 2xx cooldown x0.85; Primary Training 3xx +1 pierce,
       +10% range (Primary only); 4xx +5 range; 5xx +3 pierce. Several Villages don't stack (same mutator): the best one counts */
    const vBest = {};
    insts.forEach((v, vi) => {
      if (v.id !== 'village') return;
      near(insts, vi, C.VILLAGE_REACH, byIdx, hitsOf).forEach((k) => { const t = num(v.x[0], 0); if (!(k in vBest) || t > vBest[k]) vBest[k] = t; });
    });
    out.forEach((it) => {
      const t = C.tower(D, it.id);
      const primary = t && t.class === 'Primary';
      if (it.idx >= 0 && it.idx in vBest) {
        const vt = vBest[it.idx];
        add(it, 'buff', { range: 1.1 });
        if (vt >= 2) add(it, 'buff', { rate: 1 / 0.85 });
        if (vt >= 3 && primary) add(it, 'buff', { pierce: vt >= 5 ? 3 : 1, range: 1.1, rangeAdd: vt >= 4 ? 5 : 0 });
      }
      if (it.hero && insts.some((v) => v.id === 'village')) {
        const vt = insts.filter((v) => v.id === 'village').reduce((m, v) => Math.max(m, num(v.x[0], 0)), 0);
        add(it, 'buff', { range: 1.1 }); if (vt >= 2) add(it, 'buff', { rate: 1 / 0.85 });
      }
    });
    /* Alchemist Berserker Brew (Alchemist-300/400/500.json): one tower per throw every 8 s (6.4 s with x-x-1); 3xx +1 damage,
       +2 pierce, cooldown x0.9, +10% range for 5 s or 25 shots; 4xx +1 damage, +3 pierce, x0.85, +15% for 12 s or 40 shots;
       5xx permanent. Not on Farms, Alchemists, Villages, Beast Handlers or Etienne. Uptime per tower = min(1, lasting / (8 s x
       towers sharing it)) */
    const NOBREW = { farm: 1, alchemist: 1, village: 1, beast: 1, etienne: 1 };
    insts.forEach((al, ai) => {
      if (al.id !== 'alchemist' || num(al.x[0], 0) < 3) return;
      const tier = num(al.x[0], 0);
      const every = num(al.x[2], 0) >= 1 ? 6.4 : 8;
      const cands = near(insts, ai, C.BREW_REACH, byIdx, hitsOf).map((k) => byIdx[k]).filter((it) => it && !NOBREW[it.id]);
      if (hero && C.hero(D, hero.id) && !NOBREW[hero.id]) { const h = out.find((it) => it.hero); if (h && cands.length < C.BREW_REACH) cands.push(h); }
      if (!cands.length) return;
      const b = tier >= 4 ? { dmg: 1, pierce: 3, rate: 1 / 0.85, range: 1.15 } : { dmg: 1, pierce: 2, rate: 1 / 0.9, range: 1.1 };
      cands.forEach((it) => {
        let u = 1;
        if (tier < 5) {
          const dur = tier >= 4 ? (num(al.x[1], 0) >= 2 ? 13 : 12) : (num(al.x[1], 0) >= 2 ? 6 : 5);
          const shots = tier >= 4 ? 40 : num(al.x[1], 0) >= 2 ? 40 : 25;
          const last = Math.min(dur, shots / (hitsOf(it) * b.rate));
          u = Math.min(1, last / (every * cands.length));
        }
        add(it, 'buff', Object.assign({ u }, b));
      });
    });
    /* Monkey Knowledge (fx.attack, clear stat changes only): rate %, pierce +, range +, damage vs MOAB / Ceramic +, can pop Frozen / Purple */
    out.forEach((it) => {
      if (fx && fx.reloadMult && fx.reloadMult < 1) add(it, 'buff', { rate: 1 / fx.reloadMult });
      arr(fx && fx.attack).forEach((m) => {
        if (it.hero || arr(m.towers).indexOf(it.id) < 0 || !matchWhen(it.x, m.when, it.id)) return;
        if (m.minTier && !(Math.max.apply(null, it.x) >= m.minTier)) return;
        if (m.stat === 'rate' && m.pct && !m.whenTargeting) add(it, 'buff', { rate: 1 + m.pct });
        else if (m.stat === 'rate' && m.reduction) add(it, 'buff', { rate: 1 / (1 - m.reduction) });
        else if (m.stat === 'pierce' && m.add) add(it, 'buff', { pierce: m.add });
        else if (m.stat === 'range' && m.add) add(it, 'buff', { rangeAdd: m.add });
        else if (m.stat === 'damageVs' && m.tag === 'Moabs') add(it, 'buff', { mAdd: m.add });
        else if (m.stat === 'damageVs' && m.tag === 'Ceramic') add(it, 'buff', { dcAdd: m.add });
        else if (m.stat === 'canPop') add(it, 'buff', { grant: arr(m.props).reduce((g, p) => g | ({ Frozen: 16, Purple: 8, Lead: 1 }[p] || 0), 0) });
      });
    });
    /* ability buffs on other towers, counted only with abilities on: Overclock 0-4-0 (cooldown x0.6 for 60 s on a 45 s cooldown;
       tier-4 targets 75%, tier-5 50% of the time), Ultraboost 0-5-0 (35 s, plus x0.96 per use up to 10: counted as x0.66 after
       10 uses), Call to Arms 4-x-x x1.5 for 15 s every 45 s, Homeland Defense x2 for 20 s every 45 s (EngineerMonkey-040/050,
       MonkeyVillage-040/050). Each Engineer boosts the strongest other tower */
    insts.forEach((en) => {
      if (en.id !== 'engineer' || num(en.x[1], 0) < 4) return;
      const ultra = num(en.x[1], 0) >= 5;
      const cands = out.filter((it) => !it.hero && it.uid !== en.uid && it.id !== 'farm' && it.id !== 'village');
      if (!cands.length) return;
      const best = cands.sort((p, q) => num(q.power.m, 0) + hitsOf(q) * 20 - num(p.power.m, 0) - hitsOf(p) * 20)[0];
      const tier = Math.max.apply(null, best.x);
      const u = ultra ? 1 : Math.min(1, 60 * [1, 1, 1, 1, 0.75, 0.5][tier] / 45);
      add(best, 'abBuff', { rate: 1 / 0.6, u });
      if (ultra) add(best, 'abBuff', { rate: 1 / Math.pow(0.96, 10) });
    });
    const vMax = insts.filter((v) => v.id === 'village').reduce((m, v) => Math.max(m, num(v.x[0], 0)), 0);
    if (vMax >= 4) out.forEach((it) => { if (it.id !== 'village' && it.id !== 'farm' && (it.hero || it.idx in vBest || vMax >= 5)) add(it, 'abBuff', vMax >= 5 ? { rate: 2, u: 20 / 45 } : { rate: 1.5, u: 15 / 45 }); });
    return out;
  };
  /* support (a Village 0-2-0 for camo, MIB, Alchemist acid, Shimmer...) lets towers hit what their own attacks can't: take it
     from the coverage state, and clear those immunity bits from the tower's attacks (grant) */
  C.powerWithSupport = function (list, st) {
    const has = (p, label) => arr(st && st.cov && st.cov[p]).some((l) => l === label || l.indexOf(label + ' + ') === 0);
    const viaSupport = (p, label) => arr(st && st.cov && st.cov[p]).some((l) => l.indexOf(label + ' + ') === 0);
    list.forEach((it) => {
      if (!st) return;
      it.camo = has('camo', it.label); it.lead = has('lead', it.label); it.black = has('black', it.label);
      let g = 0;
      [['lead', 1], ['black', 2], ['white', 4], ['purple', 8]].forEach(([p, bit]) => { if (viaSupport(p, it.label)) g |= bit; });
      it.grant = g;
    });
    return list;
  };
  /* ---------- what to buy when a round leaks (pop power) ----------
     Searched, not listed: every upgrade of every tower you have (any number of tiers, legal crosspaths), new towers at their
     guide crosspaths plus the cheap ones, and pairs of the best two when no single buy stops the leak. Ranked: buys that stop
     the leak first (cheapest first), then the most leak removed per $. Pruned before the leak check runs: a crosspath that
     costs more than everything the game has paid you by this round (opts.cashCap), or that adds no attack, range or pop
     property over a cheaper one of the same tower, isn't tried.
     opts: {cashCap, unlocked: {id: [a,b,c]}, onlyUnlocked, missing: {id: true}, weak: [ids], strong: [ids], livesStart, pairs} */
  C.POWER_CHEAP = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [2, 0, 0], [0, 2, 0], [0, 0, 2], [1, 1, 0], [1, 0, 1], [0, 1, 1], [2, 0, 2], [0, 2, 2], [2, 2, 0], [3, 0, 0], [0, 3, 0], [0, 0, 3], [3, 0, 2], [3, 2, 0], [2, 3, 0], [0, 3, 2], [2, 0, 3], [0, 2, 3]];
  C.BUFF_TOWERS = ['village', 'alchemist'];
  const proxyMemo = {};
  /* a rough size of a crosspath's attack (stream and blimp parts), only to skip crosspaths that add nothing */
  const powerProxy = (D, id, x) => {
    const k = id + x.join('');
    if (proxyMemo[k]) return proxyMemo[k];
    const e = C.powerOf(D, id, x);
    let s = 0;
    if (e) arr(e.a).forEach((a) => { const hs = arr(a && a[2]); s += num(hs[3], num(hs[hs.length - 1], 0)) * Math.min(num(a && a[1], 1), 8) * Math.max(0.5, Math.min(3, num(a && a[0], 40) / 40)); });
    const own = C.towerProps(D.pop || {}, id, x) || {};
    const props = ['camo', 'lead', 'black', 'purple', 'white', 'frozen', 'moab'].reduce((m, p, i) => m | (own[p] ? 1 << i : 0), 0);
    return (proxyMemo[k] = { s, m: e ? num(e.m, 0) : 0, props, has: !!e });
  };
  C.powerProxy = powerProxy;
  C.paretoCross = (list, cap) => pareto(list, cap);
  const dominates = (d, c) => d.cost <= c.cost && d.px.s >= c.px.s - 1e-9 && d.px.m >= c.px.m - 1e-9 && (d.px.props & c.px.props) === c.px.props;
  /* keep the crosspaths no cheaper one beats (same tower), cheapest first, at most cap */
  const pareto = (list, cap) => {
    const sorted = list.slice().sort((p, q) => p.cost - q.cost);
    const keep = [];
    sorted.forEach((c) => { if (!keep.some((d) => dominates(d, c))) keep.push(c); });
    return keep.slice(0, cap);
  };
  /* crosspaths y >= x a tower can go to: every legal one */
  C.upCrosses = function (x) {
    const out = [];
    for (let p = x[0]; p <= 5; p++) for (let q = x[1]; q <= 5; q++) for (let w = x[2]; w <= 5; w++) {
      const y = [p, q, w];
      if ((p !== x[0] || q !== x[1] || w !== x[2]) && C.validCross(y)) out.push(y);
    }
    return out;
  };
  /* is crosspath x one you haven't unlocked? (only when your unlocks for that tower are known) */
  C.lockedFor = (unlocked, id, x) => !!(unlocked && Array.isArray(unlocked[id]) && !C.geq(unlocked[id], x));
  C.FIX_SCREEN = 16; /* candidates the quick screen passes on (re-ranked with the coarse timeline when more than C.FIX_CONFIRM) */
  C.FIX_CONFIRM = 16; /* candidates the fix search checks with the full leak check */
  C.powerFixes = function (D, mode, map, r, insts, hero, st, limit, fx, opts) {
    opts = opts || {};
    const mult = num(mode.costMult, 1);
    const livesStart = num(opts.livesStart, num(mode.lives, 100));
    /* opts.jobs (an array): only list the full leak checks this search would run that aren't cached yet (as functions), so a
       page can run them in slices first; the search then finds them cached. Returns [] */
    const jobs = Array.isArray(opts.jobs) ? opts.jobs : null;
    const later = (list) => { const hit = C.leakCached(D, mode, map, r, list, fx); if (hit === undefined) jobs.push(() => C.leakRound(D, mode, map, r, list, fx)); return hit; };
    const l0 = C.powerWithSupport(C.powerList(D, insts, hero, fx), st);
    const base = jobs ? later(l0) : C.leakRound(D, mode, map, r, l0, fx);
    if (!base || base.leak <= 0) return [];
    const cap = num(opts.cashCap, Infinity);
    const weak = arr(opts.weak), strong = arr(opts.strong);
    const memo = opts.memo || {};
    let evals = 0;
    const keyL = (list2) => list2.map((i) => i.id + i.x.join('')).sort().join(',');
    const tryList = (list2) => {
      const k = keyL(list2);
      if (memo[k]) return memo[k];
      evals++;
      const l2 = C.powerWithSupport(C.powerList(D, list2, hero, fx), C.coverState(D, list2, hero));
      const lk = jobs ? later(l2) : C.leakRound(D, mode, map, r, l2, fx);
      if (lk === undefined) return { left: base.leak, lives: base.lives, problem: true }; /* listed for later */
      return (memo[k] = lk ? { left: lk.leak, lives: lk.lives, problem: C.leakIsProblem(lk.leak, lk.rbe, livesStart, lk.lives) } : { left: base.leak, lives: base.lives, problem: true });
    };
    /* every candidate is screened with the quick estimate (C.leakQuick, about 0.1 ms); the C.FIX_CONFIRM best of them are
       then checked with the full leak check, and only checked ones are shown */
    const qmemo = opts.qmemo || {};
    const qOf = (list2) => {
      const k = keyL(list2);
      if (qmemo[k]) return qmemo[k];
      const lk = C.leakQuick(D, mode, map, r, C.powerWithSupport(C.powerList(D, list2, hero, fx), C.coverState(D, list2, hero)), fx);
      return (qmemo[k] = lk ? { left: lk.leak, lives: lk.lives, problem: C.leakIsProblem(lk.leak, lk.rbe, livesStart, lk.lives) } : { left: Infinity, problem: true });
    };
    const qBase = qOf(insts);
    const screen = (list2) => { const q = qOf(list2); return { left: q.left < qBase.left || qBase.left <= 0 ? -1 : Infinity, q, list2 }; };
    const locked = (id, x) => C.lockedFor(opts.unlocked, id, x);
    const cands = [];
    /* 1. upgrades of every tower you have (two copies at the same crosspath are tried once) */
    const seenInst = {};
    insts.forEach((i, idx) => {
      const t = C.tower(D, i.id);
      const k0 = i.id + i.x.join('');
      if (!t || seenInst[k0]) return;
      seenInst[k0] = 1;
      const px0 = powerProxy(D, i.id, i.x);
      const buff = C.BUFF_TOWERS.indexOf(i.id) >= 0 || !px0.has;
      let list = C.upCrosses(i.x).map((x) => ({ x, cost: C.upgradeCost(t, i.x, x, mult), px: powerProxy(D, i.id, x) }))
        .filter((c) => c.cost <= cap && !(opts.onlyUnlocked && locked(i.id, c.x)));
      if (buff) list = list.filter((c) => c.x.reduce((s2, v) => s2 + v, 0) - i.x.reduce((s2, v) => s2 + v, 0) <= 3).sort((p, q) => p.cost - q.cost).slice(0, 8);
      else list = pareto(list.filter((c) => c.px.has && (c.px.s > px0.s + 1e-9 || c.px.m > px0.m + 1e-9 || (c.px.props & ~px0.props))), 7);
      list.forEach((c) => {
        const res = screen(insts.map((j, kk) => (kk === idx ? Object.assign({}, j, { x: c.x }) : j)));
        if (res.left >= base.leak) return;
        cands.push({ kind: 'upgrade', uid: i.uid, towerId: i.id, label: i.label, from: i.x.slice(), x: c.x, cost: c.cost, name: C.buyText(t, i.x, c.x), buy: C.buyList(t, i.x, c.x),
          top: C.topName(t, c.x), res, locked: locked(i.id, c.x) ? 'not unlocked' : null, weak: false });
      });
    });
    /* 2. new towers: their guide crosspaths, cheaper tiers of those, and the cheap ones */
    arr(D.towers).forEach((t) => {
      if (C.placeIssue(D, mode, map, t)) return;
      const seen = {};
      const xs = [];
      const push = (x) => { if (x && C.validCross(x) && !seen[x.join('')]) { seen[x.join('')] = 1; xs.push(x); } };
      arr(((D.guides || {})[t.id] || {}).bestCrosspaths).forEach((g) => {
        const x = C.parseCode(g && g.code);
        if (!x) return;
        push(x);
        const m = [0, 1, 2].reduce((a2, p) => (x[p] > x[a2] ? p : a2), 0);
        for (let cap2 = x[m] - 1; cap2 >= 3; cap2--) { const y = x.slice(); y[m] = cap2; push(y); }
      });
      C.POWER_CHEAP.forEach(push);
      const miss = !!(opts.missing && opts.missing[t.id]);
      let list = xs.map((x) => ({ x, cost: C.placeCost(t, x, mult), px: powerProxy(D, t.id, x) }))
        .filter((c) => c.cost <= cap && !(opts.onlyUnlocked && locked(t.id, c.x)));
      if (C.BUFF_TOWERS.indexOf(t.id) >= 0) list = list.filter((c) => insts.length).sort((p, q) => p.cost - q.cost).slice(0, 5);
      else list = pareto(list.filter((c) => c.px.has), 4);
      list.forEach((c) => {
        const res = screen(insts.concat([{ uid: 'new', id: t.id, x: c.x, label: t.name }]));
        if (res.left >= base.leak) return;
        cands.push({ kind: 'new', towerId: t.id, label: t.name, x: c.x, cost: c.cost, name: C.topName(t, c.x), top: C.topName(t, c.x), buy: C.buyList(t, [0, 0, 0], c.x),
          res, locked: miss ? 'not unlocked' : locked(t.id, c.x) ? 'not unlocked' : null, weak: weak.indexOf(t.id) >= 0 });
      });
    });
    /* narrow down in two steps: the quick estimate ranks every candidate, the coarse timeline (opts.fast) re-ranks the best
       C.FIX_SCREEN of them, and the full check confirms the best C.FIX_CONFIRM; only confirmed ones are shown */
    {
      const fmemo = {};
      const fOf = (list2) => {
        const k = keyL(list2);
        if (fmemo[k]) return fmemo[k];
        const lk = C.leakRound(D, mode, map, r, C.powerWithSupport(C.powerList(D, list2, hero, fx), C.coverState(D, list2, hero)), fx, { fast: true });
        return (fmemo[k] = lk ? { left: lk.leak, problem: C.leakIsProblem(lk.leak, lk.rbe, livesStart, lk.lives) } : { left: Infinity, problem: true });
      };
      const rk = (get, b0) => (p, q) => (get(p).problem - get(q).problem) || (!get(p).problem ? p.cost - q.cost : ((b0 - get(q).left) / Math.max(1, q.cost)) - ((b0 - get(p).left) / Math.max(1, p.cost)));
      const pick = (list, n, keep, seenQ) => list.filter((c) => { const k = c.kind + c.towerId; if (seenQ[k] >= 2 || keep.indexOf(c) >= 0) return false; seenQ[k] = (seenQ[k] || 0) + 1; return true; }).slice(0, n);
      const k1 = [], s1 = {};
      pick(cands.slice().sort(rk((c) => c.res.q, qBase.left)), Math.ceil(C.FIX_SCREEN * 0.6), k1, s1).forEach((c) => k1.push(c));
      pick(cands.slice().sort((p, q) => p.res.q.left - q.res.q.left || p.cost - q.cost), C.FIX_SCREEN - k1.length, k1, s1).forEach((c) => k1.push(c));
      let k2 = [];
      if (C.FIX_SCREEN > C.FIX_CONFIRM) {
        const fBase = fOf(insts);
        k1.forEach((c) => { c.res.f = fOf(c.res.list2); });
        const s2 = {};
        pick(k1.filter((c) => c.res.f.left < fBase.left || fBase.left <= 0).sort(rk((c) => c.res.f, fBase.left)), C.FIX_CONFIRM, k2, s2).forEach((c) => k2.push(c));
      } else k2 = k1;
      cands.length = 0;
      k2.forEach((c) => { const res = tryList(c.res.list2); if (res.left < base.leak) { c.res = res; cands.push(c); } });
    }
    cands.forEach((c) => { c.left = c.res.left; c.leftLives = c.res.lives; c.fixes = !c.res.problem; c.value = (base.leak - c.left) / Math.max(1, c.cost); });
    const usable = (c) => !c.locked && !c.weak;
    /* 3. pairs: when no single buy you can use stops it, the best two together (different towers) */
    if (opts.pairs !== false && !cands.some((c) => c.fixes && usable(c))) {
      const top = cands.filter(usable).sort((p, q) => q.value - p.value).slice(0, 4);
      for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
        const A = top[i], B = top[j];
        if (A.kind === 'upgrade' && B.kind === 'upgrade' && A.uid === B.uid) continue;
        if (A.cost + B.cost > cap) continue;
        let list2 = insts.slice();
        [A, B].forEach((f) => { list2 = f.kind === 'upgrade' ? list2.map((q) => (q.uid === f.uid ? Object.assign({}, q, { x: f.x }) : q)) : list2.concat([{ uid: 'new' + f.towerId, id: f.towerId, x: f.x, label: f.label }]); });
        const res = tryList(list2);
        if (res.left >= Math.min(A.left, B.left)) continue;
        cands.push({ kind: 'pair', parts: [A, B], towerId: A.towerId, label: A.label + ' + ' + B.label, x: A.x, cost: A.cost + B.cost, name: '', res,
          left: res.left, leftLives: res.lives, fixes: !res.problem, value: (base.leak - res.left) / Math.max(1, A.cost + B.cost), locked: null, weak: false });
      }
    }
    const rank = (p, q) => (q.fixes - p.fixes) || (p.fixes ? (p.cost - q.cost) || ((strong.indexOf(q.towerId) >= 0) - (strong.indexOf(p.towerId) >= 0)) : q.value - p.value);
    const seen = {};
    const one = (c) => { const k = c.kind + (c.kind === 'pair' ? c.parts.map((f) => f.kind + f.towerId).join('+') : c.towerId); if (seen[k]) return false; seen[k] = true; return true; };
    const ok = cands.filter(usable).sort(rank).filter(one);
    const n = limit || 3;
    let out = ok.slice(0, n);
    /* a tower you haven't unlocked, or one the map calls weak, only when nothing else stops the leak (and it's labelled) */
    if (!out.some((c) => c.fixes)) {
      const alt = cands.filter((c) => !usable(c) && c.fixes).sort((p, q) => (!!p.locked - !!q.locked) || rank(p, q)).filter(one)[0];
      if (alt) out = out.slice(0, n - 1).concat([alt]);
    }
    if (!out.length) out = cands.filter((c) => !usable(c)).sort(rank).filter(one).slice(0, 1);
    out.forEach((c) => {
      delete c.res;
      if (c.weak) c.note = 'weak on this map, but nothing else here stops the leak';
      else if (c.locked) c.note = 'you haven\'t unlocked this yet (My profile)';
      c.buyLabel = C.fixLabel(D, c);
    });
    out.evals = evals;
    return out;
  };
  /* one sentence for a fix, naming what you buy (T13): "Druid #1: buy Druidic Reach (1-0-1), $110" */
  C.fixLabel = function (D, f) {
    if (!f) return '';
    if (f.kind === 'pair') return f.parts.map((p) => C.fixLabel(D, p)).join(' and ');
    if (f.kind === 'hero') return f.label + ' handles it from level ' + f.level + (f.round ? ', about R' + f.round : '');
    const t = C.tower(D, f.towerId);
    if (f.kind === 'upgrade') return f.label + ': buy ' + (C.buyText(t, f.from || [0, 0, 0], f.x) || 'the upgrade') + ' (' + C.code(f.x) + '), ' + C.money(f.cost);
    return 'New ' + (t ? t.name : f.label) + (f.x.some((v) => v > 0) ? ' at ' + C.code(f.x) + (f.name ? ' (' + f.name + ')' : '') : '') + ', ' + C.money(f.cost);
  };
  /* freeplay pop cash (game: IncomeSets/DefaultIncomeSet.json) */
  /* is this leak a problem? Over 2% of the round, or any leak worth 10% of your starting lives
     (in CHIMPS and Impoppable, with 1 life, that's any leak at all) */
  C.leakIsProblem = (leak, rbe, livesStart, lives) => leak != null && leak >= 1 && (leak > Math.max(1, 0.02 * num(rbe, 0)) || num(lives, leak) >= 0.1 * num(livesStart, 100));
  C.popCashMult = (r) => (r <= 50 ? 1 : r <= 60 ? 0.5 : r <= 85 ? 0.2 : r <= 100 ? 0.1 : r <= 120 ? 0.05 : r <= 140 ? 0.04 : 0.02);
  /* pop cash per leaked RBE this round: the round's own pop cash over its RBE (a MOAB pays $381 for 616 RBE) */
  C.popCashPerRbe = function (row, r) {
    const pop = num(row && row.cashPop, NaN), rbe = num(row && row.rbe, NaN);
    if (pop >= 0 && rbe > 0) return pop / rbe;
    return C.popCashMult(r);
  };
  /* pop cash you don't get because `leak` RBE leaked in round r (your share in co-op). The Simulator and the Advisor
     both use this, so their banks agree (T3) */
  C.leakCash = function (mode, row, r, leak, players) {
    const rules = (mode && mode.rules) || {};
    if (!(leak > 0) || rules.noIncome || rules.noPopCash) return 0;
    return leak * C.popCashPerRbe(row, r) * num(mode && mode.cashMult, 1) / C.players(players);
  };
  /* More Cash (+$200) as the Simulator pays it: halved in Half Cash, full in Deflation, split in co-op */
  C.moreCash = function (fx, mode, players) {
    const rules = (mode && mode.rules) || {};
    return fx && fx.startCash ? fx.startCash * (rules.noIncome ? 1 : num(mode && mode.cashMult, 1)) / C.players(players) : 0;
  };
  /* ---------- crosspaths ---------- */
  C.code = (x) => arr(x).map((v) => num(v, 0)).join('-');
  C.parseCode = function (s) {
    const m = String(s || '').match(/^\s*(\d)\s*-?\s*(\d)\s*-?\s*(\d)\s*$/);
    return m ? [+m[1], +m[2], +m[3]] : null;
  };
  C.validCross = function (c) {
    if (!Array.isArray(c) || c.length !== 3) return false;
    if (c.some((v) => !(v >= 0 && v <= 5 && Math.floor(v) === v))) return false;
    if (c.filter((v) => v > 0).length > 2) return false;
    if (c.filter((v) => v > 2).length > 1) return false;
    return true;
  };
  C.setPath = function (cross, i, v) {
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
  C.geq = (x, y) => [0, 1, 2].every((i) => num(x[i], 0) >= num(y[i], 0));
  C.maxCross = (x, y) => [0, 1, 2].map((i) => Math.max(num(x[i], 0), num(y[i], 0)));
  C.upgradeName = function (t, p, tier) { const u = t && arr(t.paths)[p] && t.paths[p][tier - 1]; return u ? u.name : ''; };
  C.topName = function (t, x) {
    let best = -1;
    for (let p = 0; p < 3; p++) if (x[p] > 0 && (best < 0 || x[p] > x[best])) best = p;
    return best < 0 ? '' : C.upgradeName(t, best, x[best]);
  };
  /* the upgrades you buy going from crosspath `from` to `to`, path by path, in tier order */
  C.buyList = function (t, from, to) {
    const out = [];
    for (let p = 0; p < 3; p++) for (let k = num(from && from[p], 0) + 1; k <= num(to && to[p], 0); k++) out.push({ path: p, tier: k, name: C.upgradeName(t, p, k) });
    return out;
  };
  C.buyText = (t, from, to) => C.buyList(t, from, to).map((u) => u.name).filter(Boolean).join(', ');
  C.upgradeCost = function (t, from, to, mult) {
    if (!t) return 0;
    let s = 0;
    for (let p = 0; p < 3; p++) for (let k = num(from[p], 0) + 1; k <= num(to[p], 0); k++) {
      const u = t.paths[p] && t.paths[p][k - 1];
      s += C.price(u ? u.cost : 0, mult) || 0;
    }
    return s;
  };
  C.placeCost = (t, x, mult) => (t ? (C.price(t.baseCost, mult) || 0) + C.upgradeCost(t, [0, 0, 0], x || [0, 0, 0], mult) : 0);
  /* pattern "0-2-x": digits are minimum tiers, x matches anything */
  C.matchPattern = function (x, pat) {
    if (!pat) return true;
    const parts = String(pat).split('-');
    return parts.length === 3 && parts.every((p, i) => p === 'x' || num(x[i], 0) >= +p);
  };

  /* ---------- pop model (contract C1) ---------- */
  C.reqHolds = function (req, x, level) {
    if (req === 'base') return true;
    if (req === 'never' || req == null) return false;
    if (typeof req === 'object') {
      if (req.level !== undefined) return req.level != null && num(level, 0) >= Math.max(1, req.level);
      /* maxTier (POP-MODEL.md extension): the upgrade that loses the ability is not bought */
      if (req.path !== undefined && req.maxTier !== undefined) return !!x && num(x[req.path], 0) <= num(req.maxTier, 5);
      if (req.path !== undefined) return !!x && num(x[req.path], 0) >= num(req.tier, 0);
    }
    return false;
  };
  C.entryHolds = function (entry, x) {
    if (!entry || !Array.isArray(entry.any)) return false;
    return entry.any.some((alt) => Array.isArray(alt) && alt.length > 0 && alt.every((req) => C.reqHolds(req, x)));
  };
  C.entryPossible = (entry) => !!(entry && Array.isArray(entry.any) && entry.any.some((alt) => Array.isArray(alt) && alt.length && alt.indexOf('never') < 0));
  C.isAttacker = (entry) => !!entry && C.POP_PROPS.some((p) => C.entryPossible(entry[p]));
  /* DDT: explicit entries (ddt.derived === false) carry their own any[] and must be used as-is (POP-MODEL.md).
     Derived: camo AND lead AND black on the same crosspath, plus the MOAB-class check (a DDT is a blimp). */
  C.ddtExplicit = (e) => !!(e && e.ddt && e.ddt.derived === false);
  C.ddtHolds = function (e, x, own) {
    if (!e) return false;
    if (C.ddtExplicit(e)) return C.entryHolds(e.ddt, x);
    const s = own || {};
    return ['camo', 'lead', 'black', 'moab'].every((p) => (own ? s[p] : C.entryHolds(e[p], x)));
  };
  /* Props a tower at crosspath x can damage on its own (conditional entries are hints, never coverage). */
  /* memoised per pop model: the Advisor and the leak fixes ask for the same crosspaths thousands of times. Read-only result. */
  const propMemo = typeof WeakMap === 'function' ? new WeakMap() : null;
  C.towerProps = function (pm, id, x) {
    const e = pm && pm.towers && pm.towers[id];
    if (!e) return null;
    let m = null;
    const key = id + ':' + num(x && x[0], 0) + num(x && x[1], 0) + num(x && x[2], 0);
    if (propMemo) { m = propMemo.get(pm); if (!m) { m = {}; propMemo.set(pm, m); } if (m[key]) return m[key]; }
    const s = {};
    C.POP_PROPS.forEach((p) => { if (C.entryHolds(e[p], x)) s[p] = true; });
    if (C.ddtHolds(e, x)) s.ddt = true;
    if (m) m[key] = s;
    return s;
  };
  /* "Also:" hints: conditional entries (abilities, effects that need another tower) whose req holds. Never coverage. */
  C.conditionalHints = function (pm, id, x, prop) {
    const e = pm && pm.towers && pm.towers[id];
    const spec = e && e[prop];
    return arr(spec && spec.conditional).filter((c) => c && arr(c.req).every((r) => C.reqHolds(r, x))).map((c) => c.note);
  };
  C.hintsFor = function (D, insts, prop, hero) {
    const pm = D.pop || {};
    const out = [];
    const add = (t) => { if (out.indexOf(t) < 0) out.push(t); };
    arr(insts).forEach((i) => C.conditionalHints(pm, i.id, i.x, prop).forEach((n) => add(i.label + ': ' + n)));
    /* temporary support (spells, short buffs): it helps, but don't count on it */
    arr(pm.supportFixes).forEach((f) => {
      if (!f.temporary || f.grants !== prop) return;
      const on = C.isHeroFix(f) ? !!hero && hero.id === f.source && C.reqHolds(f.req, null, hero.level) : arr(insts).some((i) => i.id === f.source && C.reqHolds(f.req, i.x));
      if (on) add((C.isHeroFix(f) ? (hero.label || hero.id) : f.source) + ': ' + f.note + ' (temporary, not counted)');
    });
    return out;
  };
  /* does this hero attack at this level? (power data from the game models; Benjamin has no attack) */
  C.heroAttacks = function (D, id, level) {
    const e = C.heroPowerOf(D, id, level);
    return !!(e && (arr(e.a).length || num(e.m, 0) > 0));
  };
  C.heroProps = function (pm, id, level) {
    const e = pm && pm.heroes && pm.heroes[id];
    const s = {};
    if (!e) return s;
    C.POP_PROPS.forEach((p) => { if (e[p] && C.reqHolds({ level: e[p].level }, null, level)) s[p] = true; });
    return s;
  };
  C.heroPropLevel = function (pm, id, prop) {
    const e = pm && pm.heroes && pm.heroes[id] && pm.heroes[id][prop];
    return e && e.level != null ? Math.max(1, e.level) : null;
  };
  /* minimal crosspaths >= cur that satisfy every entry (one alternative from each), legal only */
  C.candidateCrosses = function (entries, cur) {
    let combos = [cur.slice()];
    for (const e of entries) {
      if (!e || !Array.isArray(e.any)) return [];
      const next = [];
      for (const base of combos) for (const alt of e.any) {
        if (!Array.isArray(alt) || !alt.length || alt.indexOf('never') >= 0) continue;
        let x = base.slice();
        let ok = true;
        for (const req of alt) {
          if (req === 'base') continue;
          if (req && req.path !== undefined && req.maxTier !== undefined) continue; /* checked below */
          if (req && req.path !== undefined) x[req.path] = Math.max(x[req.path], num(req.tier, 0));
          else ok = false;
        }
        if (ok && C.validCross(x)) next.push(x);
      }
      combos = next;
      if (!combos.length) return [];
    }
    const seen = {};
    /* raising one path can break another entry's maxTier: keep only crosspaths where every entry still holds */
    return combos.filter((x) => { const k = x.join(''); if (seen[k]) return false; seen[k] = 1; return entries.every((e) => C.entryHolds(e, x)); });
  };

  /* ---------- bloon needs per round ---------- */
  const CHILD = { lead: ['black'], zebra: ['black', 'white'], rainbow: ['zebra'], ceramic: ['rainbow'], moab: ['ceramic'], bfb: ['moab'], zomg: ['bfb'], ddt: ['ceramic'], bad: ['zomg', 'ddt'] };
  C.roundNeeds = function (row) {
    const need = {};
    if (!row) return need;
    const txt = String(row.composition || '').toLowerCase();
    const types = {};
    ['black', 'white', 'zebra', 'purple', 'lead', 'rainbow', 'ceramic', 'moab', 'bfb', 'zomg', 'ddt', 'bad'].forEach((w) => {
      if (new RegExp('\\b' + w + '\\b').test(txt)) types[w] = true;
    });
    arr(row.threats).forEach((t) => { if (CHILD[t] || t === 'purple' || t === 'lead') types[t] = true; });
    const stack = Object.keys(types);
    while (stack.length) { const t = stack.pop(); arr(CHILD[t]).forEach((c) => { if (!types[c]) { types[c] = true; stack.push(c); } }); }
    if (txt.trim() || arr(row.threats).length) need.pop = true;
    if (/\bcamo\b/.test(txt) || arr(row.threats).indexOf('camo') >= 0) need.camo = true;
    ['lead', 'purple', 'black', 'white', 'zebra', 'ddt', 'bad'].forEach((p) => { if (types[p]) need[p] = true; });
    if (types.moab || types.bfb || types.zomg || types.ddt || types.bad) need.moab = true;
    return need;
  };

  /* ---------- coverage of one moment ---------- */
  /* insts: [{uid, id, x, label}], hero: {id, level, label} | null */
  /* a support fix comes from a hero when it says so or when its req is a hero level (data/pop-model.json) */
  C.isHeroFix = (f) => !!(f && (f.hero || (f.req && f.req.level !== undefined)));
  C.activeFixes = function (D, insts, hero) {
    const pm = D.pop || {};
    const all = arr(pm.supportFixes);
    const out = [];
    for (let k = 0; k < all.length; k++) {
      const f = all[k];
      if (f.temporary) continue; /* spells, short buffs, one-tower potions: shown as hints, never as cover */
      if (C.isHeroFix(f)) { if (hero && hero.id === f.source && C.reqHolds(f.req, null, hero.level)) out.push(f); continue; }
      for (let j = 0; j < insts.length; j++) if (insts[j].id === f.source && C.reqHolds(f.req, insts[j].x)) { out.push(f); break; }
    }
    return out;
  };
  /* what a support fix gives, as pop properties (decamo strips camo from the bloons it reaches: camo solved, POP-MODEL.md) */
  const grantMemo = typeof WeakMap === 'function' ? new WeakMap() : null;
  const supportGives = (f) => {
    let g = grantMemo && grantMemo.get(f);
    if (g) return g;
    g = arr([].concat(f.grants)).map((p) => (p === 'decamo' ? 'camo' : p)).filter((p) => C.POP_PROPS.indexOf(p) >= 0);
    if (grantMemo) grantMemo.set(f, g);
    return g;
  };
  const COV_PROPS = ['camo', 'lead', 'purple', 'black', 'white', 'zebra', 'moab', 'ddt', 'bad'];
  /* the same answer as C.coverState, as {need: true|false} with no labels: for searches that only ask "is it covered?" */
  C.coverFlags = (D, insts, hero) => cover(D, insts, hero, true);
  C.coverState = (D, insts, hero) => cover(D, insts, hero, false);
  const cover = function (D, insts, hero, flags) {
    const pm = D.pop || {};
    const fixes = C.activeFixes(D, insts, hero);
    const cov = {};
    for (let k = 0; k < C.NEEDS.length; k++) cov[C.NEEDS[k]] = flags ? false : [];
    const unknown = [];
    const bonuses = {};
    const fixMemo = {};
    const fixFor = (id) => {
      if (fixMemo[id]) return fixMemo[id];
      const g = {};
      for (let k = 0; k < fixes.length; k++) {
        const f = fixes[k];
        if (f.only && f.only.indexOf(id) < 0) continue;
        const gs = supportGives(f);
        for (let j = 0; j < gs.length; j++) if (!g[gs[j]]) g[gs[j]] = f;
      }
      return (fixMemo[id] = g);
    };
    const add = (label, own, id) => {
      const g = fixFor(id);
      const e = pm.towers && pm.towers[id];
      const has = (p) => !!(own[p] || g[p]);
      /* DDT needs every part on the same tower. Explicit towers (their Lead and Black come from different attacks)
         only count with support when that support gives both Lead and Black (MIB) and the tower hits blimps. */
      const ddt = e && C.ddtExplicit(e) ? !!(own.ddt || (g.lead && g.black && has('camo') && own.moab)) : (has('camo') && has('lead') && has('black') && has('moab'));
      if (flags) {
        cov.pop = true;
        for (let k = 0; k < COV_PROPS.length; k++) { const p = COV_PROPS[k]; if (p === 'ddt' ? ddt : has(p)) cov[p] = true; }
        return;
      }
      cov.pop.push(label);
      for (let k = 0; k < COV_PROPS.length; k++) {
        const p = COV_PROPS[k];
        if (p === 'ddt' ? ddt : has(p)) cov[p].push(own[p] || p === 'ddt' ? label : label + ' + ' + (g[p].note ? g[p].source : 'support'));
      }
    };
    for (let k = 0; k < insts.length; k++) {
      const i = insts[k];
      const e = pm.towers && pm.towers[i.id];
      if (!e) { if (unknown.indexOf(i.id) < 0) unknown.push(i.id); continue; }
      if (e.bonuses) arr(e.bonuses).forEach((bn) => { if (bn && bn.from && C.reqHolds(bn.from, i.x)) bonuses[bn.vs] = true; });
      /* attacks at this crosspath? (a Village only attacks at 5-x-x; fortified = "can damage anything") */
      const own = C.towerProps(pm, i.id, i.x);
      let any = false;
      for (let j = 0; j < C.POP_PROPS.length; j++) if (own[C.POP_PROPS[j]]) { any = true; break; }
      if (any) add(i.label, own, i.id);
    }
    if (hero) {
      /* a hero with an attack always counts as something that pops (T9), even before his camo or Lead levels */
      const hp = C.heroProps(pm, hero.id, hero.level);
      if (Object.keys(hp).length || C.heroAttacks(D, hero.id, hero.level)) add(hero.label || hero.id, hp, hero.id);
    }
    return flags ? cov : { cov, fixes, unknown, bonuses };
  };
  /* with nothing that attacks, every other need is moot: report just 'pop' */
  C.missingFor = function (state, need) {
    if (need.pop && !state.cov.pop.length) return ['pop'];
    return C.NEEDS.filter((n) => need[n] && !state.cov[n].length);
  };

  /* ---------- hero levels (estimate) ---------- */
  C.heroXpTable = function (D, heroId) {
    const hl = D.heroLevels && D.heroLevels[heroId];
    if (hl && Array.isArray(hl.xpTable) && hl.xpTable.length >= 20) return hl.xpTable.slice();
    const h = C.hero(D, heroId);
    const ratio = num(hl && hl.xpRatio, num(h && h.xpCurve, 1));
    return C.HERO_XP_1X.map((x) => Math.round(x * ratio));
  };
  C.heroLevelFromXp = function (table, xp) {
    let lvl = 1;
    for (let L = 2; L <= 20; L++) if (xp >= table[L]) lvl = L;
    return lvl;
  };
  /* level during round r for a hero placed at round p (XP from completed rounds p..r-1) */
  /* opts (from your profile's Monkey Knowledge): {xpMult: hero XP multiplier, startLevel: e.g. 3 with Empowered Heroes} */
  /* memoised per data set: the Advisor asks for the same hero, round and placement thousands of times */
  const heroLvMemo = typeof WeakMap === 'function' ? new WeakMap() : null;
  C.heroLevelAt = function (D, heroId, placedRound, r, mapDifficulty, opts) {
    if (r < placedRound) return 0;
    const key = heroId + '|' + placedRound + '|' + r + '|' + mapDifficulty + '|' + num(opts && opts.xpMult, 1) + '|' + num(opts && opts.startLevel, 1);
    let mm = heroLvMemo && heroLvMemo.get(D);
    if (mm && mm.has(key)) return mm.get(key);
    const table = C.heroXpTable(D, heroId);
    const m = (C.TIER_XP_MULT[mapDifficulty] || 1) * num(opts && opts.xpMult, 1);
    const startLevel = Math.max(1, Math.min(20, num(opts && opts.startLevel, 1)));
    let xp = table[startLevel] || 0;
    for (let k = placedRound; k < r; k++) xp += C.roundXp(k) * m;
    const v = Math.max(startLevel, C.heroLevelFromXp(table, xp));
    if (heroLvMemo) { if (!mm) heroLvMemo.set(D, (mm = new Map())); if (mm.size > 50000) mm.clear(); mm.set(key, v); }
    return v;
  };
  C.heroRoundForLevel = function (D, heroId, placedRound, level, mapDifficulty, lastRound, opts) {
    for (let r = placedRound; r <= (lastRound || 140); r++) if (C.heroLevelAt(D, heroId, placedRound, r, mapDifficulty, opts) >= level) return r;
    return null;
  };

  /* ---------- your profile (My profile page): Monkey Knowledge effects the tools model ---------- */
  /* profile: progress.js profile; settings: {me, emt}. Returns null when you switched MK off. Modes with noMK ignore it (simulate checks).
     Every number comes from the node's fx in data/monkey-knowledge.json, built by tools/game/build_mk.py from the game files
     (btd6-game-data v56.0, Knowledge/<Tree>/<Id>.json; each node keeps its file in "source"). What the tools apply:
       startCash            More Cash +$200 (StartingCashModModel addition 200)
       heroCostMult         Hero Favors x0.9 (SimTowerDiscountModModel multiplier 0.1, all heroes)
       heroXpMult           Monkey Education x1.08, Self Taught Heroes x1.1 (TowerXpModModel), Monkeys Together Strong
                            x1.05 (HeroXPBonusModModel 0.05 per hero placed; one hero per game here)
       heroStartLevel       Empowered Heroes 3 (HeroXpInjectionModModel levels 2)
       sellAdd / sellAddFor Better Sell Deals +0.05 all; Flat Pack Buildings +0.02 Farm and Village (TowerSellModModel)
       towerCost            Cheap 'Rangs -$50 every Boomerang; Farm Subsidy -$100 first Farm; First Last Line of Defense -$150
                            first Spike Factory; Military Conscription -33% first Military tower; Advanced Logistics -5% Military;
                            Flat Pack Buildings -2% Farm and Village (SimTowerDiscountModModel; charges 1 = first only)
       upgradeCost          12 upgrade discounts (UpgradeCostModModel amountReduced / percentageReduced)
       freeTowers           Bonus Monkey! / Bonus Glue Gunner: the base price of your first Dart or Glue is free (FreeTowerModModel,
                            one free tower per game)
       incomeAdd            Trade Agreements +$20 a round per Buccaneer x-x-3+ (CashPerRoundModModel 20)
       bananaValueAdd       More Valuable Bananas: Valuable Bananas farms (x-2-x) +30% instead of +25% (CashModModel 0.05)
     Carried for other tools, not used in sums yet: blimpHpMult (Big Bloon Sabotage x0.9 MOAB-class HP), reloadMult (Veteran Monkey
     Training x0.97), attack[] (per-tower pierce, range, rate, damage, can-pop), townPopCashAdd, bankCapAdd, loanAdd,
     heroLevelCostMult, lives[].
     Prices: a percentage comes off the base price before the difficulty multiplier and $5 rounding (as Hero Favors always did);
     a flat discount comes off after it. The game files hold no rule for this; it is our choice until tested in game. */
  C.profileFx = function (D, profile, settings) {
    if (profile && profile.mkOn === false) return null;
    const on = Object.assign({}, (profile && profile.mk) || {});
    if (settings && settings.me === true) on['monkey-education'] = true; /* unset counts as off (0.10) */
    if (settings && settings.emt) on['elite-military-training'] = true;
    const fx = { startCash: 0, heroCostMult: 1, sellAdd: 0, heroXpMult: 1, heroStartLevel: 1, me: false, emt: false, nodes: [], unverified: false,
      towerCost: [], upgradeCost: {}, freeTowers: [], sellAddFor: {}, incomeAdd: [], bananaValueAdd: 0, heroXpPerHero: 0,
      blimpHpMult: 1, reloadMult: 1, attack: [], townPopCashAdd: 0, bankCapAdd: 0, loanAdd: 0, heroLevelCostMult: 1, lives: [], noted: [] };
    arr(D.mk).forEach((n) => {
      if (!on[n.id] || !n.fx) return;
      const f = n.fx;
      if (f.startCash) fx.startCash += f.startCash;
      if (f.heroCostMult) fx.heroCostMult *= f.heroCostMult;
      if (f.sellAdd) fx.sellAdd += f.sellAdd;
      if (f.heroXpMult) fx.heroXpMult *= f.heroXpMult;
      if (f.xpMult) { fx.heroXpMult *= f.xpMult; fx.me = true; }
      if (f.militaryXpMult) fx.emt = true;
      if (f.heroStartLevel) fx.heroStartLevel = Math.max(fx.heroStartLevel, f.heroStartLevel);
      if (f.unverified) fx.unverified = true;
      arr(f.towerCost).forEach((row) => fx.towerCost.push(Object.assign({ key: n.id }, row)));
      arr(f.upgradeCost).forEach((row) => {
        const k = row.tower + '.' + row.path + '.' + row.tier;
        const cur = fx.upgradeCost[k] || (fx.upgradeCost[k] = { pct: 0, flat: 0 });
        cur.pct += num(row.pct, 0); cur.flat += num(row.flat, 0);
      });
      if (f.freeTower && fx.freeTowers.indexOf(f.freeTower) < 0) fx.freeTowers.push(f.freeTower);
      Object.keys(f.sellAddFor || {}).forEach((t) => { fx.sellAddFor[t] = num(fx.sellAddFor[t], 0) + f.sellAddFor[t]; });
      arr(f.incomeAdd).forEach((row) => fx.incomeAdd.push(row));
      if (f.bananaValueAdd) fx.bananaValueAdd += f.bananaValueAdd;
      if (f.heroXpPerHero) { fx.heroXpPerHero += f.heroXpPerHero; fx.heroXpMult *= 1 + f.heroXpPerHero; }
      /* carried, not applied yet */
      if (f.blimpHpMult) fx.blimpHpMult *= f.blimpHpMult;
      if (f.reloadMult) fx.reloadMult *= f.reloadMult;
      arr(f.attack).forEach((row) => fx.attack.push(Object.assign({ node: n.id }, row)));
      if (f.townPopCashAdd) fx.townPopCashAdd += f.townPopCashAdd;
      if (f.bankCapAdd) fx.bankCapAdd += f.bankCapAdd;
      if (f.loanAdd) fx.loanAdd += f.loanAdd;
      if (f.heroLevelCostMult) fx.heroLevelCostMult *= f.heroLevelCostMult;
      if (f.lives) fx.lives.push(Object.assign({ node: n.id }, f.lives));
      if (n.use === 'noted') fx.noted.push(n.name); else fx.nodes.push(n.name);
    });
    return fx;
  };
  /* the fx that apply in this mode (CHIMPS and other no-MK modes: none) */
  C.fxFor = (fx, mode) => (fx && C.mkActive(mode) ? fx : null);
  C.heroOpts = (fx) => (fx ? { xpMult: fx.heroXpMult, startLevel: fx.heroStartLevel } : null);
  /* placement price of tower t at crosspath x with your MK. used: {} you keep per game (first-only discounts and the free tower
     are spent from it); pass null to price without them (a tower that isn't your first). */
  C.mkPlaceCost = function (D, t, x, mult, fx, used) {
    if (!t) return 0;
    const ups = C.mkUpgradeCost(t, [0, 0, 0], x || [0, 0, 0], mult, fx);
    if (!fx) return C.placeCost(t, x, mult);
    let keep = 1, flat = 0;
    arr(fx.towerCost).forEach((row) => {
      if (arr(row.towers).indexOf(t.id) < 0) return;
      if (row.first) { if (!used || used[row.key]) return; used[row.key] = true; }
      keep *= 1 + num(row.pct, 0);
      flat += num(row.flat, 0);
    });
    if (used && !used.free && arr(fx.freeTowers).indexOf(t.id) >= 0) { used.free = t.id; return ups; }
    return Math.max(0, (C.price(t.baseCost * keep, mult) || 0) + flat) + ups;
  };
  /* price of one upgrade tier (path 0-2, tier 1-5) with your MK upgrade discounts */
  C.mkTierCost = function (t, p, k, mult, fx) {
    const u = t && t.paths[p] && t.paths[p][k - 1];
    const adj = fx && fx.upgradeCost ? fx.upgradeCost[t.id + '.' + p + '.' + k] : null;
    if (!adj) return C.price(u ? u.cost : 0, mult) || 0;
    return Math.max(0, (C.price((u ? u.cost : 0) * (1 + num(adj.pct, 0)), mult) || 0) + num(adj.flat, 0));
  };
  C.mkUpgradeCost = function (t, from, to, mult, fx) {
    if (!t) return 0;
    if (!fx || !fx.upgradeCost || !Object.keys(fx.upgradeCost).length) return C.upgradeCost(t, from, to, mult);
    let s = 0;
    for (let p = 0; p < 3; p++) for (let k = num(from[p], 0) + 1; k <= num(to[p], 0); k++) s += C.mkTierCost(t, p, k, mult, fx);
    return s;
  };
  /* extra sell rate for one tower (Flat Pack Buildings: Farm and Village only) */
  C.mkSellAdd = (fx, id) => (fx && fx.sellAddFor ? num(fx.sellAddFor[id], 0) : 0);
  /* end-of-round income for one tower with your MK: Trade Agreements, More Valuable Bananas; same mode rules as C.incomeFor */
  C.mkIncome = function (D, mode, id, x, fx) {
    const base = C.incomeFor(D, mode, id, x);
    if (!fx) return base;
    const rules = (mode && mode.rules) || {};
    if (rules.noIncome || rules.noIncomeTowers) return base;
    let add = 0;
    arr(fx.incomeAdd).forEach((row) => { if (row.tower === id && C.geq(x, row.min)) add += num(row.value, 0); });
    /* Valuable Bananas (x-2-x) is +25% on the bananas; the farm data holds it, so the bananas alone are (x-2-x minus x-0-x) / 0.25 */
    if (fx.bananaValueAdd && id === 'farm' && num(x[1], 0) === 2) {
      const plain = C.incomeFor(D, mode, id, [x[0], 0, x[2]]);
      add += (base - plain) / 0.25 * fx.bananaValueAdd;
    }
    return base + add * (rules.incomeHalved ? 0.5 : 1);
  };
  C.fxSummary = function (fx) {
    if (!fx) return [];
    const out = [];
    if (fx.startCash) out.push('+$' + fx.startCash + ' start');
    if (arr(fx.freeTowers).length) out.push('a free ' + fx.freeTowers.map((t) => (t === 'dart' ? 'Dart' : t === 'glue' ? 'Glue Gunner' : t)).join(' or '));
    if (fx.heroCostMult < 1) out.push('heroes ' + Math.round((1 - fx.heroCostMult) * 100) + '% cheaper');
    if (arr(fx.towerCost).length || Object.keys(fx.upgradeCost || {}).length) out.push('tower and upgrade discounts');
    if (fx.sellAdd) out.push('sell +' + Math.round(fx.sellAdd * 100) + '%');
    if (arr(fx.incomeAdd).length || fx.bananaValueAdd) out.push('more income');
    if (fx.heroStartLevel > 1) out.push('heroes start at level ' + fx.heroStartLevel);
    if (fx.heroXpMult > 1.0001) out.push('hero XP +' + Math.round((fx.heroXpMult - 1) * 100) + '%');
    return out;
  };

  /* ---------- legality of placing a tower ---------- */
  /* a hero that can't go on this map (Brickell is water-only) */
  C.heroIssue = function (D, map, h) {
    if (h && h.waterOnly && map && map.water === 'none') return map.name + ' has no water';
    return null;
  };
  C.placeIssue = function (D, mode, map, t) {
    if (!t) return 'unknown tower';
    const allowed = mode && Array.isArray(mode.allowedClasses) ? mode.allowedClasses : null;
    if (allowed && allowed.indexOf(t.class) < 0) return mode.name + ' allows ' + allowed.join(', ') + ' towers only';
    if (t.id === 'farm' && mode && mode.rules && mode.rules.noIncomeTowers) return 'Banana Farms are banned in ' + mode.name;
    if (mode && mode.rules && arr(mode.rules.lockedTowers).indexOf(t.id) >= 0) return t.name + ' is locked in ' + mode.name;
    if (t.waterOnly && map && map.water === 'none') return map.name + ' has no water';
    return null;
  };

  /* ---------- fixes for a missing need ---------- */
  /* ctx: {D, mode, map, insts, hero, need, prop}. Returns fixes ordered: your towers, new towers, support. */
  C.fixesFor = function (ctx, prop, limit) {
    const { D, mode, map } = ctx;
    const pm = D.pop || {};
    const mult = num(mode && mode.costMult, 1);
    const insts = arr(ctx.insts);
    const hero = ctx.hero || null;
    const covers = (list, h) => C.coverState(D, list, h).cov[prop].length > 0;
    const parts = prop === 'ddt' ? ['camo', 'lead', 'black', 'moab'] : prop === 'pop' ? [] : [prop];
    const srcReqs = (id) => arr(pm.supportFixes).filter((f) => !f.hero && f.source === id && f.req && f.req.path !== undefined).map((f) => f.req);
    const crossesFor = (id, cur) => {
      const e = pm.towers && pm.towers[id];
      let out = [];
      if (e && C.isAttacker(e) && parts.length) {
        if (prop === 'ddt' && C.ddtExplicit(e)) out = out.concat(C.candidateCrosses([e.ddt], cur));
        if (prop === 'ddt') {
          /* every subset of the four parts, so support can fill the rest */
          for (let mask = 1; mask < 16; mask++) {
            const ents = parts.filter((p, i) => mask & (1 << i)).map((p) => e[p]);
            out = out.concat(C.candidateCrosses(ents, cur));
          }
        } else out = C.candidateCrosses([e[prop]], cur);
      }
      srcReqs(id).forEach((req) => { const x = cur.slice(); x[req.path] = Math.max(x[req.path], req.tier); if (C.validCross(x)) out.push(x); });
      return out;
    };
    const res = { upgrade: [], new: [], support: [], hero: [] };
    /* 1. towers you own */
    insts.forEach((i, idx) => {
      const t = C.tower(D, i.id);
      let best = null;
      crossesFor(i.id, i.x).forEach((x) => {
        if (x.join('') === i.x.join('')) return;
        if (ctx.onlyUnlocked && C.lockedFor(ctx.unlocked, i.id, x)) return;
        const list = insts.map((j, k) => (k === idx ? Object.assign({}, j, { x }) : j));
        if (!covers(list, hero)) return;
        const cost = C.upgradeCost(t, i.x, x, mult);
        if (!best || cost < best.cost) best = { kind: 'upgrade', uid: i.uid, towerId: i.id, label: i.label, from: i.x.slice(), x, cost, name: C.buyText(t, i.x, x), top: C.topName(t, x), locked: C.lockedFor(ctx.unlocked, i.id, x) ? 'not unlocked' : null };
      });
      if (best) res.upgrade.push(best);
    });
    /* 2 + 3. new towers */
    const ids = Object.keys(pm.towers || {});
    arr(pm.supportFixes).forEach((f) => { if (!f.hero && ids.indexOf(f.source) < 0 && C.tower(D, f.source)) ids.push(f.source); });
    ids.forEach((id) => {
      const t = C.tower(D, id);
      if (!t || C.placeIssue(D, mode, map, t)) return;
      const e = pm.towers && pm.towers[id];
      const cands = prop === 'pop' ? (e && C.entryHolds(e.fortified, [0, 0, 0]) ? [[0, 0, 0]] : []) : crossesFor(id, [0, 0, 0]);
      let best = null;
      cands.forEach((x) => {
        if (ctx.onlyUnlocked && C.lockedFor(ctx.unlocked, id, x)) return;
        const add = { uid: 'new', id, x, label: t.name };
        if (!covers(insts.concat([add]), hero)) return;
        const cost = C.placeCost(t, x, mult);
        const alone = prop === 'pop' || C.coverState(D, [add], null).cov[prop].length > 0;
        if (!best || cost < best.cost) best = { kind: alone ? 'new' : 'support', towerId: id, label: t.name, x, cost, name: C.topName(t, x),
          locked: (ctx.missing && ctx.missing[id]) || C.lockedFor(ctx.unlocked, id, x) ? 'not unlocked' : null, weak: arr(ctx.weak).indexOf(id) >= 0 };
      });
      if (best) res[best.kind].push(best);
    });
    /* hero: wait for a level */
    if (hero && pm.heroes && pm.heroes[hero.id] && prop !== 'pop') {
      const lv = prop === 'ddt' ? null : C.heroPropLevel(pm, hero.id, prop);
      if (lv != null && lv > num(hero.level, 0)) {
        const at = ctx.heroPlaced != null ? C.heroRoundForLevel(D, hero.id, ctx.heroPlaced, lv, map && map.difficulty, null, ctx.heroOpts) : null;
        res.hero.push({ kind: 'hero', heroId: hero.id, label: hero.label || hero.id, level: lv, round: at, cost: 0 });
      }
    }
    const uniq = {};
    res.upgrade = res.upgrade.filter((f) => { const k = f.towerId + f.x.join(''); if (uniq[k]) return false; uniq[k] = 1; return true; });
    const strong = (ctx.strong || []);
    const sortBy = (list) => list.sort((a, b) => (a.cost - b.cost) || ((strong.indexOf(b.towerId) >= 0) - (strong.indexOf(a.towerId) >= 0)));
    sortBy(res.upgrade); sortBy(res.new); sortBy(res.support);
    if (prop === 'pop' && strong.length) res.new.sort((a, b) => ((strong.indexOf(b.towerId) >= 0) - (strong.indexOf(a.towerId) >= 0)) || (a.cost - b.cost));
    /* towers you haven't unlocked and the map's weak towers go last, labelled; they're only offered when nothing else is (T10, T11) */
    const okF = (f) => !f.locked && !f.weak;
    const late = (list) => list.filter(okF).concat(list.filter((f) => !okF(f)).sort((a, b) => (!!a.locked - !!b.locked) || (a.cost - b.cost)));
    res.upgrade = late(res.upgrade); res.new = late(res.new); res.support = late(res.support);
    const plain = res.upgrade.filter(okF).length + res.new.filter(okF).length + res.support.filter(okF).length;
    const pickN = (list, n) => list.filter((f) => okF(f) || !plain).slice(0, n);
    let out = pickN(res.upgrade, 2).concat(pickN(res.new, 2), pickN(res.support, 1), res.hero);
    if (!out.length) out = res.upgrade.concat(res.new, res.support).slice(0, 1);
    out = out.slice(0, limit || 3);
    out.forEach((f) => {
      if (f.weak) f.note = 'weak on this map, but nothing else here covers it';
      else if (f.locked) f.note = 'you haven\'t unlocked this yet (My profile)';
      f.buyLabel = C.fixLabel(D, f);
    });
    return out;
  };

  /* ---------- income (farms etc.) ---------- */
  const INCOME_TOWER = { 'Banana Farm': 'farm', 'Monkey Buccaneer': 'buccaneer', 'Sniper Monkey': 'sniper', 'Alchemist': 'alchemist', 'Druid': 'druid', 'Engineer Monkey': 'engineer', 'Monkey Village': 'village' };
  /* the crosspath at the start of an income code: "4-2-0 Banana Research Facility" -> [4, 2, 0] */
  C.leadCode = function (s) {
    const m = String(s || '').match(/^\s*(\d)-(\d)-(\d)(?:\s|$)/);
    return m ? [+m[1], +m[2], +m[3]] : null;
  };
  /* a farm crosspath from the game files (data/economy.json farmCross): {income, sellAdd, bank} */
  C.farmAt = (D, x) => ((D && D.farmCross) || {})[arr(x).map((v) => num(v, 0)).join('')] || null;
  C.incomeFor = function (D, mode, id, x) {
    const rules = (mode && mode.rules) || {};
    if (rules.noIncome || rules.noIncomeTowers) return 0; /* Deflation; CHIMPS: no farms, income upgrades pay nothing */
    let best = 0;
    const farm = id === 'farm' ? C.farmAt(D, x) : null;
    if (farm) best = num(farm.income, 0);
    else {
      arr(D.income).forEach((s) => {
        if (INCOME_TOWER[s.tower] !== id) return;
        const c = C.leadCode(s.code);
        if (c && C.geq(x, c)) best = Math.max(best, num(s.incomePerRound, 0));
      });
    }
    return best * (rules.incomeHalved ? 0.5 : 1);
  };
  /* Benjamin's cash per round by level (game: PerRoundCashBonusTowerModel; level bands from data/economy.json) */
  C.BENJAMIN_CASH = [[1, 90], [2, 140], [8, 250], [11, 1000], [15, 2500], [17, 5000]];
  C.heroIncome = function (mode, heroId, level) {
    const rules = (mode && mode.rules) || {};
    if (heroId !== 'benjamin' || rules.noIncome || rules.noIncomeTowers) return 0;
    let v = 0;
    C.BENJAMIN_CASH.forEach(([l, c]) => { if (num(level, 1) >= l) v = c; });
    return v * (rules.incomeHalved ? 0.5 : 1);
  };
  /* sell rate for one tower: the mode's rate, Monkey Knowledge, Banana Salvage (farms x-x-2+ sell for 10% more) */
  C.sellRateFor = function (D, rate, id, x) {
    const farm = id === 'farm' ? C.farmAt(D, x) : null;
    return Math.min(0.95, rate + (farm ? num(farm.sellAdd, 0) : 0));
  };

  /* ---------- the simulator ---------- */
  /* plan: {mapId, modeId, heroLevel (override|null), me, emt,
            steps: [{uid, r, op:'hero'|'place'|'up'|'sell', h, t, x:[a,b,c], ref}]} */
  C.simulate = function (D, plan) {
    const mode = C.mode(D, plan.modeId) || C.mode(D, 'medium');
    const map = C.map(D, plan.mapId);
    const [a, b] = C.modeRange(mode);
    const mult = num(mode.costMult, 1);
    const rules = mode.rules || {};
    const fx = C.fxFor(plan.fx, mode); /* your Monkey Knowledge (My profile), off in CHIMPS */
    const mkUsed = {}; /* MK first-only discounts and the free tower, spent once per game (C.mkPlaceCost) */
    const players = C.players(plan.players);
    const base = C.baseCash(D, mode, players);
    /* More Cash: +$200, halved in Half Cash (Bloons Wiki "More Cash"); Deflation keeps the full $200 */
    const moreCash = C.moreCash(fx, mode, players);
    if (moreCash) Object.keys(base).forEach((k) => { base[k] += moreCash; });
    const sellRate = num(rules.sellRate, C.SELL_RATE) + (fx ? fx.sellAdd : 0);
    const heroOpts = C.heroOpts(fx);
    const instaLeft = Object.assign({}, plan.instas || {}); /* 'dart.204' -> how many you own */
    const strat = (D.strats || {})[plan.mapId] || {};
    /* rounds are whole numbers: 5.5 is R6; a step with no usable round is flagged and skipped (C17) */
    const noRound = [];
    const steps = [];
    arr(plan.steps).forEach((s, i) => {
      const r = s && s.r !== null && s.r !== '' && isFinite(+s.r) ? Math.round(+s.r) : NaN;
      if (isNaN(r)) noRound.push(Object.assign({ i }, s));
      else steps.push(Object.assign({ i }, s, { r }));
    });
    steps.sort((p, q) => (p.r - q.r) || (p.i - q.i));
    const insts = {}; /* uid -> {uid, id, x, invested, placedAt, soldAt, n} */
    const counts = {};
    let order = 0;
    let spent = 0, refunds = 0, income = 0;
    let hero = null; /* {id, placed} */
    const rows = [];
    const out = [];
    let si = 0;
    let lives = num(mode.lives, 100);
    let lostAt = null; /* the round your lives run out (estimate) */
    let unsure = false; /* a round before this one is still pending (plan.leakJobs): lives from here on aren't known yet */
    let lostCash = 0; /* pop cash you don't get because those bloons leaked */
    noRound.forEach((s) => out.push({ uid: s.uid, r: null, op: s.op, cost: 0, refund: 0, flags: [{ k: 'bad', t: 'no round given' }], label: s.op, bank: null }));
    for (let r = a; r <= b; r++) {
      const spent0 = spent, ref0 = refunds;
      while (si < steps.length && steps[si].r < a) {
        const s = steps[si++];
        out.push({ uid: s.uid, r: s.r, op: s.op, cost: 0, refund: 0, flags: [{ k: 'bad', t: 'before the first round (R' + a + ')' }], label: s.op, bank: null });
      } /* steps before the start round are dropped */
      while (si < steps.length && steps[si].r === r) {
        const s = steps[si++];
        const res = { uid: s.uid, r, op: s.op, cost: 0, refund: 0, flags: [], label: '' };
        if (s.op === 'hero') {
          const h = C.hero(D, s.h);
          if (!h) { res.flags.push({ k: 'bad', t: 'unknown hero' }); }
          else if (hero) { res.flags.push({ k: 'bad', t: 'only one hero per game' }); res.label = 'Place ' + h.name; }
          else if (C.heroIssue(D, map, h)) { res.flags.push({ k: 'bad', t: C.heroIssue(D, map, h) }); res.label = 'Place ' + h.name; }
          else {
            res.cost = C.price(h.cost * (fx ? fx.heroCostMult : 1), mult) || 0;
            hero = { id: h.id, placed: r, name: h.name };
            res.label = 'Place ' + h.name;
            res.heroId = h.id;
          }
        } else if (s.op === 'place') {
          const t = C.tower(D, s.t);
          const x = C.validCross(s.x) ? s.x.slice() : [0, 0, 0];
          if (!t) { res.flags.push({ k: 'bad', t: 'unknown tower' }); }
          else {
            counts[t.id] = (counts[t.id] || 0) + 1;
            const inst = { uid: s.uid, id: t.id, x, invested: 0, placedAt: r, soldAt: null, n: counts[t.id], ord: ++order, name: t.name };
            inst.label = t.name.replace(/ Monkey$/, '') + ' #' + inst.n;
            res.cost = s.insta ? 0 : C.mkPlaceCost(D, t, x, mult, fx, mkUsed);
            if (!s.insta && fx && res.cost < C.placeCost(t, x, mult)) res.mkSave = C.placeCost(t, x, mult) - res.cost;
            inst.invested = res.cost;
            if (s.insta) {
              inst.insta = true;
              inst.instaValue = C.placeCost(t, x, mult);
              res.insta = true;
              if (rules.noInsta) res.flags.push({ k: 'bad', t: 'no Insta Monkeys in ' + mode.name });
              else if (plan.instas) {
                const key = t.id + '.' + x.join('');
                if (!(instaLeft[key] > 0)) res.flags.push({ k: 'warn', t: 'not in your Insta inventory' });
                else instaLeft[key]--;
              }
            }
            insts[s.uid] = inst;
            res.label = (s.insta ? 'Insta ' : 'Place ') + inst.label + (x.some((v) => v > 0) ? ' at ' + C.code(x) : '');
            if (x.some((v) => v > 0)) { res.name = C.buyText(t, [0, 0, 0], x); res.buy = C.buyList(t, [0, 0, 0], x); }
            res.towerId = t.id; res.x = x; res.inst = inst.label;
            const issue = C.placeIssue(D, mode, map, t);
            if (issue) { res.flags.push({ k: 'bad', t: issue + ' (not counted)' }); inst.illegal = true; }
            if (arr(strat.avoidTowers).indexOf(t.id) >= 0) res.flags.push({ k: 'warn', t: 'weak on this map' });
            if (plan.unlocked && plan.unlocked[t.id] && !C.geq(plan.unlocked[t.id], x)) res.flags.push({ k: 'warn', t: 'you haven\'t unlocked ' + C.code(x) + ' yet' });
          }
        } else if (s.op === 'up') {
          const inst = insts[s.ref];
          const t = inst && C.tower(D, inst.id);
          if (!inst || inst.placedAt > r) { res.flags.push({ k: 'bad', t: 'not placed yet' }); res.label = 'Upgrade'; }
          else if (inst.soldAt != null) { res.flags.push({ k: 'bad', t: 'already sold' }); res.label = 'Upgrade ' + inst.label; }
          else if (!C.validCross(s.x) || !C.geq(s.x, inst.x)) { res.flags.push({ k: 'bad', t: 'can\'t go from ' + C.code(inst.x) + ' to ' + C.code(s.x || []) }); res.label = 'Upgrade ' + inst.label; }
          else {
            res.cost = C.mkUpgradeCost(t, inst.x, s.x, mult, fx);
            res.from = inst.x.slice();
            inst.x = s.x.slice();
            inst.invested += res.cost;
            res.label = inst.label + ' to ' + C.code(s.x);
            /* name what you buy (T13): Druid #1 from 1-0-0 to 1-0-1 buys Druidic Reach, not "Hard Thorns" */
            res.name = C.buyText(t, res.from, s.x);
            res.buy = C.buyList(t, res.from, s.x);
            res.towerId = inst.id; res.x = s.x.slice(); res.inst = inst.label;
            if (plan.unlocked && plan.unlocked[inst.id] && !C.geq(plan.unlocked[inst.id], s.x)) res.flags.push({ k: 'warn', t: 'you haven\'t unlocked ' + C.code(s.x) + ' yet' });
          }
        } else if (s.op === 'sell') {
          const inst = insts[s.ref];
          if (!inst || inst.placedAt > r || inst.soldAt != null) { res.flags.push({ k: 'bad', t: 'nothing to sell' }); res.label = 'Sell'; }
          else if (rules.noSelling) { res.flags.push({ k: 'bad', t: 'no selling in ' + mode.name }); res.label = 'Sell ' + inst.label; }
          else {
            /* an Insta sells like a bought tower: its value counts, though it cost you nothing */
            res.refund = Math.round((inst.invested + (inst.insta ? num(inst.instaValue, 0) : 0)) * C.sellRateFor(D, sellRate + C.mkSellAdd(fx, inst.id), inst.id, inst.x));
            inst.soldAt = r;
            res.label = 'Sell ' + inst.label;
            res.towerId = inst.id; res.inst = inst.label;
          }
        }
        spent += res.cost; refunds += res.refund;
        res.bank = base[r] + income + refunds - spent - lostCash;
        out.push(res);
      }
      /* state during round r */
      const live = Object.keys(insts).map((k) => insts[k]).filter((i) => i.placedAt <= r && i.soldAt == null && !i.illegal);
      let hl = null;
      if (hero) {
        hl = plan.heroLevel != null && plan.heroLevel >= 1 ? Math.min(20, Math.round(plan.heroLevel)) : Math.max(1, C.heroLevelAt(D, hero.id, hero.placed, r, map && map.difficulty, heroOpts));
      }
      const st = C.coverState(D, live.map((i) => ({ uid: i.uid, id: i.id, x: i.x, label: i.label })), hero ? { id: hero.id, level: hl, label: hero.name } : null);
      const row = C.roundRow(D, mode, r);
      const need = C.roundNeeds(row);
      const missing = C.missingFor(st, need);
      /* pop power (estimate): how much of the round gets through, and the lives it costs */
      /* plan.leakMemo (optional, not in links): leak results the caller already worked out for the same towers, hero level and round.
         On Glacial Trail towers freeze by the round they were placed, so placement is part of the key there */
      let lk = null, pend = false;
      /* once your lives run out the run is over: later rounds aren't leak-checked (that was 40% of the Advisor's leak work) */
      const over = !plan.noPower && !unsure && lives <= 0;
      if (!plan.noPower && !over) {
        const glacial = map && map.id === 'glacial-trail';
        const lkKey = plan.leakMemo ? r + '|' + (hero ? hl + (glacial ? '@' + hero.placed : '') : 0) + '|' + live.map((i) => i.id + i.x.join('') + (glacial ? '@' + i.placedAt : '')).sort().join(',') : null;
        if (lkKey && plan.leakMemo[lkKey] !== undefined) lk = plan.leakMemo[lkKey];
        else {
          const list = C.powerWithSupport(C.powerList(D, live.map((i) => ({ uid: i.uid, id: i.id, x: i.x, label: i.label, placedAt: i.placedAt })), hero ? { id: hero.id, level: hl, label: hero.name, placedAt: hero.placed } : null, fx), st);
          /* plan.leakJobs (an array, with plan.leakMemo): leak checks not done before are listed for the caller to run later
             (the Simulator runs them without blocking the page), and the round is left pending */
          const hit = plan.leakJobs ? C.leakCached(D, mode, map, r, list, fx) : undefined;
          if (plan.leakJobs && hit === undefined) { pend = true; unsure = true; plan.leakJobs.push({ r, key: lkKey, run: () => C.leakRound(D, mode, map, r, list, fx) }); }
          else lk = hit !== undefined ? hit : C.leakRound(D, mode, map, r, list, fx);
          if (lkKey && !pend) plan.leakMemo[lkKey] = lk;
        }
      }
      if (lk) lives = Math.max(0, lives - lk.lives);
      if (lk && lives <= 0 && lostAt == null && !unsure) lostAt = r;
      rows.push({ r, leak: lk ? lk.leak : null, leakInfo: lk, lives: unsure ? null : lk || over ? Math.round(lives) : null, over, pend, avail: base[r] + income + ref0 - spent0 - lostCash, spentSoFar: spent0,
        bank: base[r] + income + refunds - spent - lostCash, need, missing, heroLevel: hl, danger: row ? num(row.danger, 0) : 0,
        threats: row ? arr(row.threats) : [], composition: row ? row.composition : '', note: row ? row.notes : '',
        live: live.map((i) => i.uid), unknown: st.unknown, bonuses: st.bonuses, cov: st.cov });
      /* leaked layers pay no pop cash (counted from the next round on) */
      if (lk && !plan.keepLeakCash) lostCash += C.leakCash(mode, row, r, lk.leak, players);
      /* end of round: income, paid into the next round */
      live.forEach((i) => { income += C.mkIncome(D, mode, i.id, i.x, fx); });
      if (hero) income += C.heroIncome(mode, hero.id, hl);
    }
    /* steps after the last round */
    while (si < steps.length) { const s = steps[si++]; out.push({ uid: s.uid, r: s.r, op: s.op, cost: 0, refund: 0, flags: [{ k: 'bad', t: 'after the last round (R' + b + ')' }], label: s.op, bank: null }); }
    /* affordability: a step is short when the bank right after it is negative */
    const bankEnd = {};
    rows.forEach((x) => { bankEnd[x.r] = x.bank; });
    out.forEach((o) => {
      if (o.bank == null) return;
      if (o.cost > 0 && o.bank < -0.5) {
        o.short = Math.round(-o.bank);
        let er = null;
        for (let r = o.r + 1; r <= b; r++) if (bankEnd[r] >= -0.5) { er = r; break; }
        o.earliest = er;
        o.flags.push({ k: 'cash', t: 'short by ' + C.money(o.short) + (er ? ', earliest R' + er : ', not affordable by R' + b) });
      }
    });
    /* problems */
    const problems = [];
    const instList = Object.keys(insts).map((k) => insts[k]);
    C.NEEDS.forEach((p) => {
      let open = null;
      rows.forEach((x) => {
        if (!x.need[p]) return;
        const miss = x.missing.indexOf(p) >= 0;
        if (miss && !open) {
          open = { prop: p, round: x.r, last: x.r, rounds: 1 };
          problems.push(open);
        } else if (miss) { open.last = x.r; open.rounds++; }
        else open = null;
      });
    });
    const pendRow = rows.find((x) => x.pend);
    const pendFrom = pendRow ? pendRow.r : null;
    /* rounds that leak: not enough pop power (estimate). Small leaks are ignored, unless your lives can't take them (C.leakIsProblem) */
    {
      let open = null;
      rows.forEach((x) => {
        /* while leak checks are pending, rounds after the first pending one aren't judged yet (your lives may run out before) */
        const bad = x.leakInfo && C.leakIsProblem(x.leak, x.leakInfo.rbe, num(mode.lives, 100), x.leakInfo.lives) && !x.missing.length && !(pendFrom != null && x.r > pendFrom);
        if (bad && !open) { open = { prop: 'power', round: x.r, last: x.r, rounds: 1, lives: x.leakInfo.lives }; problems.push(open); }
        else if (bad) { open.last = x.r; open.rounds++; open.lives += x.leakInfo.lives; }
        else open = null;
      });
    }
    problems.sort((p, q) => (p.round - q.round) || (C.NEEDS.indexOf(p.prop) - C.NEEDS.indexOf(q.prop)));
    /* what the fixes may use: your unlocks (only them, when you asked), towers you haven't unlocked (labelled), the map's weak towers */
    const fixOpts = { unlocked: plan.unlocked || null, onlyUnlocked: !!plan.onlyUnlocked, missing: plan.missing || null,
      weak: arr(strat.avoidTowers), strong: arr(strat.strongTowers), livesStart: num(mode.lives, 100) };
    const timeline = { rows, start: a, end: b };
    /* fixes are worked out when something reads them (a page that shows 3 problems doesn't pay for 12) */
    const lazyFixes = (pr, make) => {
      let val = null;
      Object.defineProperty(pr, 'fixes', { enumerable: true, configurable: true,
        get() {
          if (val) return val;
          val = make();
          val.forEach((f) => {
            f.affordable = pr.bank != null && f.cost <= pr.bank + 0.5;
            /* timing: the earliest round you can pay for it that is still in time (C.fixRoundFor) */
            if (f.kind !== 'hero') { f.at = C.fixRoundFor(timeline, f.cost, pr.round); f.inTime = f.at <= pr.round && rows[f.at - a] && rows[f.at - a].bank >= f.cost - 0.5; }
          });
          return val;
        },
        set(v) { val = v; } });
    };
    problems.forEach((pr) => {
      if (pr.prop !== 'power') return;
      const x = rows[pr.round - a];
      const live = instList.filter((i) => x.live.indexOf(i.uid) >= 0).map((i) => ({ uid: i.uid, id: i.id, x: C.xAt(out, i, pr.round), label: i.label }));
      const h = hero && hero.placed <= pr.round ? { id: hero.id, level: x.heroLevel, label: hero.name } : null;
      pr.estimate = true;
      pr.text = 'not enough popping power: about ' + C.int(x.leak) + ' of ' + C.int(x.leakInfo.rbe) + ' RBE gets through';
      pr.bank = x.avail;
      pr.composition = x.composition;
      pr.leakInfo = x.leakInfo;
      const cap = x.avail + x.spentSoFar; /* everything the game has paid you by this round */
      const share = { qmemo: {}, memo: {} }; /* the quick screen and the checks done, shared by fixJobs and fixes */
      lazyFixes(pr, () => C.powerFixes(D, mode, map, pr.round, live, h, C.coverState(D, live, h), 3, fx, Object.assign({ cashCap: cap }, fixOpts, share)));
      /* the leak checks reading pr.fixes would run that aren't cached yet (C.powerFixes opts.jobs), for a page to run first */
      Object.defineProperty(pr, 'fixJobs', { value: () => { const jobs = []; C.powerFixes(D, mode, map, pr.round, live, h, C.coverState(D, live, h), 3, fx, Object.assign({ cashCap: cap, jobs }, fixOpts, share)); return jobs; } });
      pr.hints = [];
      if (x.leakInfo.frozenShare > 0.05) pr.hints.push('Your Ice Monkey freezes bloons, and Sharp attacks (darts, tacks, Quincy) can\'t pop frozen bloons. Place them apart, or use towers that pop frozen bloons.');
      if (pr.round >= C.ROUGH_FROM) pr.hints.push('From R' + C.ROUGH_FROM + ' the leak check over-predicts leaks: it doesn\'t count abilities yet, and builds that win in real games often show leaks here. Treat this as a warning, not a verdict.');
      pr.hints.push('Estimate from each tower\'s damage, pierce and attack speed vs the round\'s bloons. Placement, abilities and buffs change it.');
    });
    problems.forEach((pr) => {
      if (pr.prop === 'power') return;
      const x = rows[pr.round - a];
      const live = instList.filter((i) => x.live.indexOf(i.uid) >= 0).map((i) => ({ uid: i.uid, id: i.id, x: C.xAt(out, i, pr.round), label: i.label }));
      pr.text = C.NEED_TEXT[pr.prop];
      pr.bank = x.avail;
      lazyFixes(pr, () => C.fixesFor(Object.assign({ D, mode, map, insts: live, hero: hero && hero.placed <= pr.round ? { id: hero.id, level: x.heroLevel, label: hero.name } : null, heroPlaced: hero ? hero.placed : null, heroOpts }, fixOpts), pr.prop, 3));
      pr.hints = C.hintsFor(D, live, pr.prop, hero && hero.placed <= pr.round ? { id: hero.id, level: x.heroLevel, label: hero.name } : null);
      pr.composition = x.composition;
    });
    const unknown = {};
    rows.forEach((x) => x.unknown.forEach((u) => { unknown[u] = true; }));
    return {
      mode, map, start: a, end: b, players, rows, steps: out, problems, first: problems[0] || null,
      badSteps: out.filter((o) => o.flags.some((f) => f.k === 'bad')), randomRounds: mode.roundSet === 'random',
      lives: rows.length && rows[rows.length - 1].lives != null ? rows[rows.length - 1].lives : null, livesStart: num(mode.lives, 100), lostAt,
      pending: pendFrom != null ? { from: pendFrom, rounds: rows.filter((x) => x.pend).length } : null,
      leakTotal: rows.reduce((acc, x) => acc + (x.leak || 0), 0),
      spent, refunds, income, insts: instList, hero, unknown: Object.keys(unknown), sellRate,
      endBank: rows.length ? rows[rows.length - 1].bank : 0,
      xp: C.runXp(D, mode, map, out, instList, a, b, plan),
    };
  };
  /* crosspath of an instance during round r (replays its upgrade steps) */
  C.xAt = function (out, inst, r) {
    let x = null;
    out.forEach((o) => {
      if (o.r > r || o.inst !== inst.label) return;
      if (o.op === 'place' && o.x) x = o.x.slice();
      if (o.op === 'up' && o.x && !o.flags.some((f) => f.k === 'bad')) x = o.x.slice();
    });
    return x || inst.x.slice();
  };

  /* XP a run pays each tower type: round XP x map tier x ME, split by cash invested (hero excluded). */
  C.runXp = function (D, mode, map, out, insts, a, b, opts) {
    const res = { total: 0, lost: 0, perTower: {}, mapMult: 1, meMult: 1, mk: C.mkActive(mode) };
    if (!mode || C.isSandbox(mode)) return res;
    const mapMult = C.TIER_XP_MULT[map && map.difficulty] || 1;
    const meMult = res.mk && opts && opts.me ? 1.08 : 1;
    const emtMult = res.mk && opts && opts.emt ? 1.05 : 1;
    res.mapMult = mapMult; res.meMult = meMult; res.emtMult = emtMult;
    const inv = {}; /* uid -> invested */
    const byUid = {};
    insts.forEach((i) => { byUid[i.label] = i; });
    let oi = 0;
    const sorted = out.filter((o) => o.bank != null).slice().sort((p, q) => p.r - q.r);
    for (let r = a; r <= b; r++) {
      while (oi < sorted.length && sorted[oi].r <= r) {
        const o = sorted[oi++];
        const inst = byUid[o.inst];
        if (!inst || o.flags.some((f) => f.k === 'bad')) continue;
        if (o.op === 'place' || o.op === 'up') inv[inst.label] = (inv[inst.label] || 0) + o.cost;
        if (o.op === 'sell') delete inv[inst.label];
      }
      const xr = C.roundXp(r) * mapMult * meMult;
      res.total += xr;
      const byType = {};
      Object.keys(inv).forEach((k) => { const id = byUid[k].id; byType[id] = (byType[id] || 0) + inv[k]; });
      const tot = Object.keys(byType).reduce((s, k) => s + byType[k], 0);
      if (!(tot > 0)) { res.lost += xr; continue; }
      Object.keys(byType).forEach((id) => {
        const t = C.tower(D, id);
        const p = res.perTower[id] || (res.perTower[id] = { xp: 0, name: t ? t.name : id });
        p.xp += xr * (byType[id] / tot) * (t && t.class === 'Military' ? emtMult : 1);
      });
    }
    const sum = Object.keys(res.perTower).reduce((s, k) => s + res.perTower[k].xp, 0);
    Object.keys(res.perTower).forEach((k) => { res.perTower[k].share = sum > 0 ? res.perTower[k].xp / sum : 0; });
    return res;
  };

  /* ---------- defence check (mid-game) ---------- */
  /* towers: [{id, x}], hero: {id, level}|null. Returns the uncovered threats from round r to r+span. */
  C.checkDefence = function (D, opts) {
    const mode = C.mode(D, opts.modeId) || C.mode(D, 'medium');
    const map = C.map(D, opts.mapId) || null;
    const [ma, mb] = C.modeRange(mode);
    const r0 = Math.max(ma, Math.min(mb, Math.round(num(opts.round, ma)))); /* the mode's own rounds only */
    const span = num(opts.span, 15);
    const end = Math.min(mb, r0 + span - 1);
    const counts = {};
    const insts = arr(opts.towers).map((t, i) => {
      const tw = C.tower(D, t.id);
      counts[t.id] = (counts[t.id] || 0) + 1;
      return { uid: 'd' + i, id: t.id, x: C.validCross(t.x) ? t.x.slice() : [0, 0, 0], label: (tw ? tw.name.replace(/ Monkey$/, '') : t.id) + ' #' + counts[t.id] };
    });
    const h = opts.hero && C.hero(D, opts.hero.id);
    const hero = h ? { id: h.id, level: Math.max(1, Math.min(20, Math.round(num(opts.hero.level, 1)))), label: h.name } : null;
    const st = C.coverState(D, insts, hero);
    const threats = [];
    const seen = {};
    let nextDanger = null;
    for (let r = r0; r <= end; r++) {
      const row = C.roundRow(D, mode, r);
      if (!row) continue;
      if (nextDanger == null && num(row.danger, 0) >= 2) nextDanger = { r, note: row.notes, composition: row.composition };
      const need = C.roundNeeds(row);
      C.missingFor(st, need).forEach((p) => {
        if (seen[p]) { seen[p].rounds.push(r); return; }
        seen[p] = { prop: p, round: r, rounds: [r], text: C.NEED_TEXT[p], composition: row.composition };
        threats.push(seen[p]);
      });
    }
    const strat = (map && (D.strats || {})[map.id]) || {};
    const fixOpts = { weak: arr(strat.avoidTowers), strong: arr(strat.strongTowers), unlocked: opts.unlocked || null, onlyUnlocked: !!opts.onlyUnlocked, missing: opts.missing || null, livesStart: num(mode.lives, 100) };
    threats.forEach((t) => { t.fixes = C.fixesFor(Object.assign({ D, mode, map, insts, hero, heroPlaced: null }, fixOpts), t.prop, 3); t.hints = C.hintsFor(D, insts, t.prop, hero); });
    /* enough pop power? (estimate) the first round of the span that leaks, when every type is covered */
    let leak = null;
    if (!threats.length && (insts.length || hero)) {
      const dfx = C.fxFor(opts.fx, mode); /* your Monkey Knowledge (My profile), off in CHIMPS */
      const list = C.powerWithSupport(C.powerList(D, insts, hero, dfx), st);
      let lost = 0;
      for (let r = r0; r <= end; r++) {
        const lk = C.leakRound(D, mode, map, r, list, dfx);
        if (!lk) continue;
        lost += lk.lives;
        if (!leak && C.leakIsProblem(lk.leak, lk.rbe, num(mode.lives, 100), lk.lives)) {
          const row = C.roundRow(D, mode, r);
          leak = { prop: 'power', round: r, rounds: [r], estimate: true, composition: row ? row.composition : '', leakInfo: lk,
            text: 'not enough popping power: about ' + lk.leak + ' of ' + lk.rbe + ' RBE gets through' };
          leak.fixes = C.powerFixes(D, mode, map, r, insts, hero, st, 3, dfx, fixOpts);
          leak.hints = lk.frozenShare > 0.05 ? ['Your Ice Monkey freezes bloons, and Sharp attacks can\'t pop frozen bloons.'] : [];
          leak.hints.push('Estimate from each tower\'s damage, pierce and attack speed. Placement, abilities and buffs change it.');
        } else if (leak && C.leakIsProblem(lk.leak, lk.rbe, num(mode.lives, 100), lk.lives)) leak.rounds.push(r);
      }
      if (leak) { leak.lives = lost; threats.push(leak); }
    }
    return { mode, map, round: r0, end, threats, nextDanger, state: st, insts, hero };
  };

  /* ---------- XP / progression ---------- */
  C.towerUpgrades = function (t) {
    const out = [];
    if (t) for (let p = 0; p < 3; p++) for (let k = 1; k <= 5; k++) {
      const u = t.paths[p] && t.paths[p][k - 1];
      out.push({ path: p, tier: k, name: u ? u.name : '', xp: u && u.xp != null ? u.xp : 0, unknown: !u || u.xp == null });
    }
    return out;
  };
  C.paragonXp = function (D, t) {
    if (!t || !t.paragon) return null;
    const g = (D.guides || {})[t.id] || {};
    return num(t.paragon.xp, num(g.xpParagon, null));
  };
  /* cheapest-first unlock order of the locked upgrades (tier N needs N-1 on the same path) */
  C.unlockOrder = function (t, unlocked, onlyPath) {
    const next = [0, 1, 2].map((p) => num(unlocked[p], 0) + 1);
    const seq = [];
    let cum = 0;
    for (;;) {
      let pick = -1, best = Infinity;
      for (let p = 0; p < 3; p++) {
        if (onlyPath != null && p !== onlyPath.path) continue;
        if (next[p] > 5 || (onlyPath != null && next[p] > onlyPath.tier)) continue;
        const u = t.paths[p][next[p] - 1];
        const x = num(u && u.xp, 0);
        if (x < best) { best = x; pick = p; }
      }
      if (pick < 0) break;
      const u = t.paths[pick][next[pick] - 1];
      cum += best;
      seq.push({ path: pick, tier: next[pick], name: u ? u.name : '', xp: best, unknown: !u || u.xp == null, cum });
      next[pick]++;
    }
    return seq;
  };
  /* lifetime XP -> unlocked tiers, assuming cheapest-first unlocking */
  C.unlockedFromXp = function (t, xp) {
    const u = [0, 0, 0];
    let left = Math.max(0, num(xp, 0));
    for (const s of C.unlockOrder(t, [0, 0, 0])) {
      if (s.xp > left) break;
      left -= s.xp;
      u[s.path] = s.tier;
    }
    return { unlocked: u, unspent: left };
  };
  C.xpSpent = function (t, unlocked) {
    let s = 0;
    for (let p = 0; p < 3; p++) for (let k = 1; k <= num(unlocked[p], 0); k++) s += num(t.paths[p][k - 1] && t.paths[p][k - 1].xp, 0);
    return s;
  };
  /* target: {kind:'upgrade', path, tier} | {kind:'all'} | {kind:'paragon'} */
  C.xpPlan = function (D, towerId, unlocked, target, unspent) {
    const t = C.tower(D, towerId);
    if (!t) return null;
    unlocked = [0, 1, 2].map((p) => Math.max(0, Math.min(5, Math.round(num(unlocked && unlocked[p], 0)))));
    const pxp = C.paragonXp(D, t);
    const out = { tower: t, target, unlocked, hasParagon: !!(t.paragon && pxp != null), paragonXp: pxp, steps: [], need: 0, unknown: 0, done: false };
    let steps;
    if (target.kind === 'upgrade') {
      steps = C.unlockOrder(t, unlocked, { path: target.path, tier: target.tier });
      out.targetName = C.upgradeName(t, target.path, target.tier);
    } else steps = C.unlockOrder(t, unlocked);
    if (target.kind === 'paragon') {
      if (!out.hasParagon) { out.noParagon = true; return out; }
      const last = steps.length ? steps[steps.length - 1].cum : 0;
      steps.push({ paragon: true, name: t.paragon.name, xp: pxp, cum: last + pxp });
      out.targetName = t.paragon.name;
    }
    if (target.kind === 'all') out.targetName = 'every tier 5';
    out.steps = steps;
    out.unknown = steps.filter((s) => s.unknown).length;
    const total = steps.length ? steps[steps.length - 1].cum : 0;
    out.gross = total;
    out.need = Math.max(0, total - Math.max(0, num(unspent, 0)));
    out.done = out.need === 0;
    out.military = t.class === 'Military';
    return out;
  };
  C.FARM_MODES = ['deflation', 'easy', 'medium', 'hard', 'impoppable', 'chimps', 'primary-only', 'military-only', 'magic-monkeys-only'];
  C.FARM_EASE = { deflation: 1, easy: 1, 'primary-only': 2, medium: 2, 'military-only': 2, hard: 3, 'magic-monkeys-only': 3, impoppable: 4, chimps: 5 };
  /* every sensible map tier x mode farm for one tower, ranked by XP per run */
  C.farmTable = function (D, towerId, opts) {
    const t = C.tower(D, towerId);
    if (!t) return [];
    const rows = [];
    C.FARM_MODES.forEach((mid) => {
      const mode = C.mode(D, mid);
      if (!mode || C.isSandbox(mode)) return;
      if (Array.isArray(mode.allowedClasses) && mode.allowedClasses.indexOf(t.class) < 0) return;
      if (mid === 'chimps' && t.id === 'farm') return;
      const [a, b] = C.modeRange(mode);
      const mk = C.mkActive(mode);
      const m = (mk && opts.me ? 1.08 : 1) * (mk && opts.emt && t.class === 'Military' ? 1.05 : 1);
      let minutes = 0;
      for (let r = a; r <= b; r++) minutes += C.minutesForRound(r);
      C.TIERS.forEach((tier) => {
        const xp = C.baseXpRange(a, b) * C.TIER_XP_MULT[tier] * m;
        rows.push({ modeId: mid, modeName: mode.name, tier, rounds: [a, b], xp, minutes, perMin: xp / minutes, ease: C.FARM_EASE[mid] || 3, mk });
      });
    });
    rows.sort((p, q) => q.xp - p.xp || p.minutes - q.minutes);
    if (opts.need > 0) rows.forEach((r) => { r.runs = Math.ceil(opts.need / r.xp); r.totalMin = r.runs * r.minutes; });
    return rows;
  };
  /* best overall: most XP per minute among farms a beginner can reliably win (ease <= 2), on an Expert map */
  C.farmPick = function (rows, tier) {
    const ok = rows.filter((r) => r.tier === (tier || 'Expert') && r.ease <= 2);
    const list = ok.length ? ok : rows;
    return list.slice().sort((p, q) => q.perMin - p.perMin)[0] || null;
  };

  /* ---------- share links ---------- */
  /* a buy with no deadline (a "pairs well" suggestion): the first round from `needRound - 1` on after which the bank never
     drops below its cost. Fixes for a problem use C.fixRoundFor, which keeps them in time */
  C.fixRound = function (sim, cost, needRound) {
    const rows = arr(sim.rows);
    const minFrom = (r) => rows.filter((x) => x.r >= r).reduce((m, x) => Math.min(m, x.bank), Infinity);
    const r0 = Math.max(sim.start, needRound - 1);
    if (minFrom(r0) >= cost) return r0;
    for (let r = r0 + 1; r <= sim.end; r++) if (minFrom(r) >= cost) return r;
    return r0;
  };
  /* a gap fix as a plan step, in time for the round that needs it (T4):
     1. the round before it's needed, when buying it then never pushes the bank negative later;
     2. else the earliest round up to the one that needs it where you have the cash right then (later buys may then be
        short: C.applyFix moves them later);
     3. else the round that needs it (it shows as short, with the round you could first afford it). */
  C.fixRoundFor = function (sim, cost, needRound, minRound) {
    const rows = arr(sim.rows);
    const a = Math.max(num(sim.start, 1), Math.round(num(minRound, 0))), b = num(sim.end, 100);
    const need = Math.max(a, Math.min(b, Math.round(num(needRound, a))));
    const s0 = num(sim.start, 1);
    const at = (r) => (rows[r - s0] && rows[r - s0].r === r ? rows[r - s0] : rows.find((x) => x.r === r)) || null;
    const minFrom = (r) => rows.reduce((m, x) => (x.r >= r ? Math.min(m, x.bank) : m), Infinity);
    const r0 = Math.max(a, need - 1);
    if (minFrom(r0) >= cost - 0.5) return r0;
    for (let r = a; r <= need; r++) { const x = at(r); if (x && x.bank >= cost - 0.5) return r; }
    return need;
  };
  C.fixStep = function (sim, f, needRound) {
    if (!f || f.kind === 'hero') return null;
    if (f.kind === 'pair') return C.fixSteps(sim, f, needRound)[0] || null;
    /* an upgrade can't land before its tower is placed */
    const placed = f.kind === 'upgrade' ? arr(sim.steps).find((o) => o.uid === f.uid && o.op === 'place') : null;
    const r = C.fixRoundFor(sim, f.cost, needRound, placed ? placed.r : null);
    if (f.kind === 'upgrade') return f.uid ? { op: 'up', ref: f.uid, x: f.x.slice(), r } : null;
    return f.towerId ? { op: 'place', t: f.towerId, x: f.x.slice(), r } : null;
  };
  /* every step a fix needs (a pair is two buys, each timed on its own cost) */
  C.fixSteps = function (sim, f, needRound) {
    if (!f) return [];
    if (f.kind === 'pair') return arr(f.parts).map((p) => C.fixStep(sim, p, needRound)).filter(Boolean);
    const s = C.fixStep(sim, f, needRound);
    return s ? [s] : [];
  };
  /* the legal crosspath nearest to `want` that keeps everything in `keep` (a fix's tiers): merges a later planned upgrade
     with a fix (T6). maxCross when that's legal, else the legal crosspath >= keep sharing the most tiers with want */
  C.mergeCross = function (want, keep) {
    const m = C.maxCross(want, keep);
    if (C.validCross(m)) return m;
    let best = null, bs = -1;
    C.upCrosses(keep).concat([keep.slice()]).forEach((y) => {
      if (!C.geq(m, y)) return;
      const sc = [0, 1, 2].reduce((s, p) => s + Math.min(y[p], num(want[p], 0)), 0);
      if (sc > bs) { bs = sc; best = y; }
    });
    return best || keep.slice();
  };
  /* add a fix to a plan the way a player would: at the round C.fixRoundFor picks, later upgrades of the same tower merged
     with it (T6), and any later buy that is now short moved to the first round you can pay for it.
     Returns {plan, uids (the fix's steps), moved: [{uid, from, to}], merged: [uid]} */
  C.applyFix = function (D, plan, f, needRound, opts) {
    const sim0 = C.simulate(D, plan);
    const p2 = Object.assign({}, plan, { steps: arr(plan.steps).map((s) => Object.assign({}, s, s.x ? { x: s.x.slice() } : {})) });
    let n = 0;
    const uid = () => { let u; do { u = 'fx' + (++n); } while (p2.steps.some((s) => s.uid === u)); return u; };
    const add = C.fixSteps(sim0, f, needRound).map((s) => Object.assign({ uid: uid() }, s));
    const merged = [];
    add.forEach((s) => {
      if (s.op !== 'up') return;
      /* the tower's crosspath when the fix lands, and every later upgrade of it kept >= the fix */
      const later = p2.steps.filter((q) => q.op === 'up' && q.ref === s.ref && q.r >= s.r);
      later.forEach((q) => {
        if (C.geq(q.x, s.x)) return;
        q.x = C.mergeCross(q.x, s.x);
        merged.push(q.uid);
      });
      /* a later upgrade that no longer adds anything is dropped */
      p2.steps = p2.steps.filter((q) => !(q.op === 'up' && q.ref === s.ref && q.r >= s.r && q.x.join('') === s.x.join('')));
    });
    p2.steps = p2.steps.concat(add);
    const fixIds = add.map((s) => s.uid);
    const moved = [];
    const maxMoves = num(opts && opts.maxMoves, 30);
    for (let k = 0; k < maxMoves; k++) {
      const sim = C.simulate(D, p2); /* fixes are lazy: this run doesn't work them out */
      const bad = sim.steps.find((o) => o.short && o.earliest && fixIds.indexOf(o.uid) < 0 && o.r != null);
      if (!bad) break;
      const s = p2.steps.find((q) => q.uid === bad.uid);
      if (!s) break;
      const to = bad.earliest;
      moved.push({ uid: s.uid, from: s.r, to });
      const from = s.r;
      s.r = to;
      /* keep the same tower's later steps after it (an upgrade can't come before its tower, or before the tier below) */
      const tower = s.op === 'place' ? s.uid : s.ref;
      p2.steps.forEach((q) => { if (q !== s && (q.ref === tower || q.uid === tower) && q.r >= from && q.r < to && fixIds.indexOf(q.uid) < 0 && (q.op !== 'place' || s.op !== 'place')) q.r = to; });
    }
    return { plan: p2, uids: fixIds, moved, merged };
  };
  C.encodePlan = function (plan) {
    const parts = [];
    if (plan.mapId) parts.push('map=' + encodeURIComponent(plan.mapId));
    if (plan.modeId) parts.push('mode=' + encodeURIComponent(plan.modeId));
    const ord = {};
    let n = 0;
    const toks = [];
    arr(plan.steps).slice().sort((p, q) => p.r - q.r).forEach((s) => {
      if (s.op === 'place') ord[s.uid] = ++n;
    });
    arr(plan.steps).forEach((s) => {
      if (s.op === 'hero') toks.push(s.r + 'h' + s.h);
      else if (s.op === 'place') toks.push(s.r + (s.insta ? 'i' : 'p') + s.t + (s.x && s.x.some((v) => v > 0) ? '.' + s.x.join('') : ''));
      else if (s.op === 'up' && ord[s.ref]) toks.push(s.r + 'u' + ord[s.ref] + '.' + arr(s.x).join(''));
      else if (s.op === 'sell' && ord[s.ref]) toks.push(s.r + 's' + ord[s.ref]);
    });
    if (toks.length) parts.push('b=' + toks.join('_'));
    if (plan.heroLevel != null) parts.push('hl=' + plan.heroLevel);
    if (C.players(plan.players) > 1) parts.push('pl=' + C.players(plan.players));
    return parts.join('&');
  };
  C.decodePlan = function (D, hash) {
    const q = {};
    String(hash || '').replace(/^#/, '').split('&').forEach((kv) => {
      const i = kv.indexOf('=');
      if (i > 0) { try { q[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { /* malformed link: ignore that part */ } }
    });
    const plan = { steps: [] };
    if (q.map && C.map(D, q.map)) plan.mapId = q.map;
    if (q.mode && C.mode(D, q.mode) && !C.isSandbox(C.mode(D, q.mode))) plan.modeId = q.mode;
    if (q.hl && /^\d+$/.test(q.hl)) plan.heroLevel = Math.max(1, Math.min(20, +q.hl));
    if (q.pl && /^[1-4]$/.test(q.pl)) plan.players = +q.pl;
    let uid = 0;
    const placed = [];
    const mk = () => 's' + (++uid);
    /* two passes: "u2" and "s2" mean the 2nd tower by placing round over ALL places in the link (as encodePlan
       numbers them), so read every place first, then resolve upgrades and sells */
    const toks = q.b ? q.b.split('_') : [];
    const parsed = toks.map((tok) => {
      let m;
      if ((m = tok.match(/^(\d{1,3})h([a-z]+)$/)) && C.hero(D, m[2])) return { uid: mk(), r: +m[1], op: 'hero', h: m[2] };
      if ((m = tok.match(/^(\d{1,3})([pi])([a-z]+)(?:\.(\d)(\d)(\d))?$/)) && C.tower(D, m[3])) {
        const x = m[4] != null ? [+m[4], +m[5], +m[6]] : [0, 0, 0];
        const s = { uid: mk(), r: +m[1], op: 'place', t: m[3], x: C.validCross(x) ? x : [0, 0, 0] };
        if (m[2] === 'i') s.insta = true;
        placed.push(s);
        return s;
      }
      if ((m = tok.match(/^(\d{1,3})u(\d+)\.(\d)(\d)(\d)$/))) return { pending: 'up', r: +m[1], n: +m[2], x: [+m[3], +m[4], +m[5]] };
      if ((m = tok.match(/^(\d{1,3})s(\d+)$/))) return { pending: 'sell', r: +m[1], n: +m[2] };
      return null;
    });
    const byRound = placed.slice().sort((p, q2) => p.r - q2.r);
    parsed.forEach((s) => {
      if (!s) return;
      if (!s.pending) { plan.steps.push(s); return; }
      const ref = byRound[s.n - 1];
      if (!ref) return;
      if (s.pending === 'up') plan.steps.push({ uid: mk(), r: s.r, op: 'up', ref: ref.uid, x: s.x });
      else plan.steps.push({ uid: mk(), r: s.r, op: 'sell', ref: ref.uid });
    });
    /* old planner links: #tower=<id>&hero=<id> */
    const mode = C.mode(D, plan.modeId || 'medium');
    const a = C.modeRange(mode)[0];
    if (q.hero && C.hero(D, q.hero) && !plan.steps.some((s) => s.op === 'hero')) plan.steps.push({ uid: mk(), r: a, op: 'hero', h: q.hero });
    if (q.tower && C.tower(D, q.tower) && !q.b) plan.steps.push({ uid: mk(), r: a, op: 'place', t: q.tower, x: [0, 0, 0] });
    plan.nextUid = uid;
    return plan;
  };
  /* preset "known starts" built from map-strats by build_tools.py */
  C.presetPlan = function (D, mapId) {
    const p = (D.presets || {})[mapId];
    if (!p) return null;
    let uid = 0;
    const byKey = {};
    const steps = [];
    p.steps.forEach((s) => {
      if (s.op === 'hero') steps.push({ uid: 'p' + (++uid), r: s.r, op: 'hero', h: s.h });
      else if (s.op === 'place') { const st = { uid: 'p' + (++uid), r: s.r, op: 'place', t: s.t, x: s.x.slice() }; byKey[s.t + '#' + s.n] = st; steps.push(st); }
      else if (s.op === 'up' && byKey[s.t + '#' + s.n]) steps.push({ uid: 'p' + (++uid), r: s.r, op: 'up', ref: byKey[s.t + '#' + s.n].uid, x: s.x.slice() });
    });
    return { mapId, modeId: p.mode || 'chimps', steps, nextUid: uid, presetSpent: p.spent };
  };

  /* ---------- formatting ---------- */
  /* thousands separators by hand: toLocaleString is slow, and the Advisor writes hundreds of numbers per plan */
  const sep = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  C.money = function (v) {
    if (v == null || !isFinite(v)) return '–';
    const n = Math.round(v);
    return (n < 0 ? '−$' : '$') + sep(Math.abs(n));
  };
  C.int = (v) => (v == null || !isFinite(v) ? '–' : (Math.round(v) < 0 ? '-' : '') + sep(Math.abs(Math.round(v))));

  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  root.MonkeyIntel = root.MonkeyIntel || {};
  root.MonkeyIntel.core = C;
})(typeof window !== 'undefined' ? window : globalThis);
