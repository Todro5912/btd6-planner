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
  C.byId = (list, id) => arr(list).find((x) => x && x.id === id) || null;
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
     (2 players: -$100), except Deflation, which splits the start cash; all pop cash and end-of-round bonuses
     are split evenly, and so is More Cash. Tower income (farms) goes to its owner. */
  C.PLAYERS_MAX = 4;
  C.players = (n) => Math.max(1, Math.min(C.PLAYERS_MAX, Math.round(num(n, 1))));
  C.coopStart = function (mode, players) {
    const n = C.players(players);
    const start = num(mode && mode.startCash, 650);
    if (n === 1) return start;
    return mode && mode.id === 'deflation' ? Math.floor(start / n) : Math.max(0, start - 50 * n);
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
     data/tower-power.json (built by tools/build_power.py from the game's own tower models, v56) gives each crosspath
     its attacks as [range, damage, bloon-hits per second with 1/2/4/8/16/32 bloons in range], plus damage per second
     to one MOAB-class (m) or Ceramic (c). For a round we work out how many bloons are in range at once (spawn rate x
     time in range), how long each tower is busy, and how many layers that pops, against the round's RBE.
     Lives lost = RBE that gets through, like the game. Not modelled: abilities, Village / Alchemist buffs, sub-towers,
     targeting, exact placement (C.POWER_SPOT says how much track a tower sees). */
  C.POWER_SPOT = 1.6; /* a decent spot sees this many range-widths of track (bends, loops) */
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
  /* bloon-hits per second at n bloons in range (log interpolation between the sampled crowds) */
  C.hitsAt = function (hs, n) {
    if (n <= 1) return hs[0] * Math.max(0, n);
    for (let i = 1; i < CROWD.length; i++) {
      if (n <= CROWD[i]) { const t = Math.log(n / CROWD[i - 1]) / Math.log(CROWD[i] / CROWD[i - 1]); return hs[i - 1] + (hs[i] - hs[i - 1]) * t; }
    }
    return hs[CROWD.length - 1];
  };
  const bloonType = (name) => {
    const s = String(name || '').toLowerCase();
    const fort = /fortified/.test(s);
    const base = s.replace(/(regrow|camo|fortified)/g, '');
    return { base, fort, camo: /camo/.test(s), regrow: /regrow/.test(s) };
  };
  /* one round, one set of attackers: [{power entry, label, camo: can it hit camo, lead: can it hit lead}] */
  /* ---- bloon physics used by the leak check (game facts, see content/guides/bloons.md) ---- */
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
  /* freeplay ramps (from R81): blimp HP and every bloon's speed */
  C.blimpHpMult = (r) => (r <= 80 ? 1 : r <= 100 ? 1 + 0.02 * (r - 80) : r <= 124 ? 1.4 + 0.05 * (r - 100) : r <= 150 ? 2.6 + 0.15 * (r - 124) : r <= 250 ? 6.5 + 0.35 * (r - 150) : 41.5 + (r - 250));
  C.speedMult = (r) => (r <= 80 ? 1 : r <= 100 ? 1 + 0.02 * (r - 80) : r <= 150 ? 1.6 + 0.02 * (r - 101) : r <= 200 ? 3 + 0.02 * (r - 151) : 4.5);
  C.BLIMP_KIDS = { moab: [['ceramic', 4]], bfb: [['moab', 4]], zomg: [['bfb', 4]], ddt: [['ceramic', 4]], bad: [['zomg', 2], ['ddt', 3]] };
  C.leakRound = function (D, mode, map, r, list, fx) {
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
    const tinFor = (R, sp) => (R >= 900 ? track / sp : Math.min(track / sp, C.POWER_SPOT * 2 * R / sp));
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
    let leak = 0;
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
        const bf = it.buff || {};
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
    frozenShare = Math.min(0.85, frozenShare * C.FREEZE_FIT);
    list.forEach((it) => {
      const e = it.power;
      if (!e) return;
      let p = rawPops(e, false, it.buff);
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
      dur, perSec: Math.round(lambda * 10) / 10, depth: perHit(1), per, blimps: blimpOut, power: Math.round(pops), frozenShare };
  };
  /* Ice freezing factor, fitted to one real game (lone 2-2-0 Ice + Quincy, Glacial Trail Hard, 16 lives at R13). Estimate */
  /* from this round the check flags leaks in builds that win real games (2TC CHIMPS wins: 7% leak at R76, 26% at R80,
     85% at R98), so the tools label it rough. Measured 2026-11-07, see CHANGELOG 0.9.1 */
  C.ROUGH_FROM = 76;
  C.FREEZE_FIT = 0.63; /* 14 lives at R13 with this model; it is a steep curve: 0.60 gives 28, 0.65 gives 4 */
  /* the attackers of one moment, for C.leakRound: towers [{uid, id, x, label}] and the hero {id, level, label} */
  C.powerList = function (D, insts, hero, fx) {
    const pm = D.pop || {};
    const out = [];
    insts.forEach((i) => {
      const e = C.powerOf(D, i.id, i.x);
      if (!e) return;
      const own = C.towerProps(pm, i.id, i.x);
      out.push({ uid: i.uid, id: i.id, x: i.x, label: i.label, power: e, camo: !!own.camo, lead: !!own.lead, black: !!own.black, frozen: !!own.frozen, freezes: i.id === 'ice' });
    });
    if (hero) {
      const e = C.heroPowerOf(D, hero.id, hero.level);
      const hp = C.heroProps(pm, hero.id, hero.level);
      if (e) out.push({ uid: 'hero', id: hero.id, label: hero.label || hero.id, power: e, camo: !!hp.camo, lead: !!hp.lead, black: pm.heroes && pm.heroes[hero.id] && pm.heroes[hero.id].black ? !!hp.black : true, frozen: !!hp.frozen, hero: true });
    }
    /* buffs (values from the game's models, v56), assumed to reach every tower: placing them centrally is the norm.
       Village: +10% range, 2-x-x attacks 15% faster, 3-x-x Primary +1 pierce and +10% range.
       Alchemist Berserker Brew: 3-x-x +1 damage, +2 pierce, +10% speed and range; 4-x-x +3 pierce, +15% (not on Farms/Alchemists). */
    const vil = insts.filter((i) => i.id === 'village').reduce((m, i) => Math.max(m, num(i.x[0], 0)), -1);
    const alch = insts.filter((i) => i.id === 'alchemist').reduce((m, i) => Math.max(m, num(i.x[0], 0)), -1);
    out.forEach((it) => {
      const t = C.tower(D, it.id);
      const primary = t && t.class === 'Primary';
      const bf = { hits: 1, dmg: 0, range: 1 };
      if (vil >= 0) { bf.range *= 1.1; if (vil >= 2) bf.hits /= 0.85; if (vil >= 3 && primary) { bf.hits *= 1.15; bf.range *= 1.1; } }
      if (alch >= 3 && it.id !== 'alchemist') { const big = alch >= 4; bf.dmg += 1; bf.hits *= (big ? 1.15 : 1.1) * (big ? 1.35 : 1.25); bf.range *= big ? 1.15 : 1.1; }
      /* Veteran Monkey Training (Monkey Knowledge): every tower reloads 3% faster */
      if (fx && fx.reloadMult && fx.reloadMult < 1) bf.hits /= fx.reloadMult;
      if (vil >= 0 || alch >= 3 || (fx && fx.reloadMult < 1)) it.buff = bf;
    });
    return out;
  };
  /* camo support (a Village 0-2-0, Shimmer...) lets towers hit camo: take it from the coverage state */
  C.powerWithSupport = function (list, st) {
    const has = (p, label) => arr(st && st.cov && st.cov[p]).some((l) => l === label || l.indexOf(label + ' + ') === 0);
    list.forEach((it) => { if (st) { it.camo = has('camo', it.label); it.lead = has('lead', it.label); it.black = has('black', it.label); } });
    return list;
  };
  /* what to buy when a round leaks: the cheapest pops. Upgrades of what you have and new towers, by leak removed per $ */
  C.powerFixes = function (D, mode, map, r, insts, hero, st, limit, fx) {
    const mult = num(mode.costMult, 1);
    const base = C.leakRound(D, mode, map, r, C.powerWithSupport(C.powerList(D, insts, hero, fx), st), fx);
    if (!base || base.leak <= 0) return [];
    const tryList = (list2) => { const x = C.leakRound(D, mode, map, r, C.powerWithSupport(C.powerList(D, list2, hero, fx), C.coverState(D, list2, hero)), fx); return x ? x.leak : base.leak; };
    const cands = [];
    insts.forEach((i, idx) => {
      const t = C.tower(D, i.id);
      if (!t) return;
      [0, 1, 2].forEach((pth) => {
        const x = i.x.slice();
        x[pth]++;
        if (!C.validCross(x) || x[pth] > 5) return;
        const list2 = insts.map((j, k) => (k === idx ? Object.assign({}, j, { x }) : j));
        const left = tryList(list2);
        if (left >= base.leak) return;
        cands.push({ kind: 'upgrade', uid: i.uid, towerId: i.id, label: i.label, from: i.x.slice(), x, cost: C.upgradeCost(t, i.x, x, mult), name: C.topName(t, x), left });
      });
    });
    arr(D.towers).forEach((t) => {
      if (C.placeIssue(D, mode, map, t)) return;
      [[0, 0, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0], [0, 0, 2], [2, 0, 0], [0, 2, 0], [2, 0, 2], [0, 2, 2], [2, 2, 0], [3, 0, 0], [0, 3, 0], [0, 0, 3]].forEach((x) => {
        if (!C.powerOf(D, t.id, x)) return;
        const add = { uid: 'new', id: t.id, x, label: t.name };
        const left = tryList(insts.concat([add]));
        if (left >= base.leak) return;
        cands.push({ kind: 'new', towerId: t.id, label: t.name, x, cost: C.placeCost(t, x, mult), name: C.topName(t, x), left });
      });
    });
    /* fixes that stop the leak first, cheapest; then the most leak removed per $ */
    cands.forEach((c) => { c.fixes = c.left <= 0; c.value = (base.leak - c.left) / Math.max(1, c.cost); });
    cands.sort((a, b) => (b.fixes - a.fixes) || (b.fixes ? a.cost - b.cost : b.value - a.value));
    const seen = {};
    return cands.filter((c) => { const k = c.kind + c.towerId; if (seen[k]) return false; seen[k] = true; return true; }).slice(0, limit || 3)
      .map((c) => Object.assign(c, { leftLives: c.left }));
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
  C.towerProps = function (pm, id, x) {
    const e = pm && pm.towers && pm.towers[id];
    if (!e) return null;
    const s = {};
    C.POP_PROPS.forEach((p) => { if (C.entryHolds(e[p], x)) s[p] = true; });
    if (C.ddtHolds(e, x)) s.ddt = true;
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
    return arr(pm.supportFixes).filter((f) => {
      if (f.temporary) return false; /* spells, short buffs, one-tower potions: shown as hints, never as cover */
      if (C.isHeroFix(f)) return !!hero && hero.id === f.source && C.reqHolds(f.req, null, hero.level);
      return insts.some((i) => i.id === f.source && C.reqHolds(f.req, i.x));
    });
  };
  C.coverState = function (D, insts, hero) {
    const pm = D.pop || {};
    const fixes = C.activeFixes(D, insts, hero);
    const cov = {};
    C.NEEDS.forEach((n) => { cov[n] = []; });
    const unknown = [];
    const bonuses = {};
    const fixFor = (id) => {
      const g = {};
      /* decamo strips camo from the bloons it reaches: camo solved for the towers that hit them (POP-MODEL.md) */
      fixes.forEach((f) => { if (!f.only || f.only.indexOf(id) >= 0) arr([].concat(f.grants)).forEach((p) => { if (p === 'decamo') p = 'camo'; if (C.POP_PROPS.indexOf(p) >= 0 && !g[p]) g[p] = f; }); });
      return g;
    };
    const add = (label, own, id) => {
      const g = fixFor(id);
      const e = pm.towers && pm.towers[id];
      const eff = Object.assign({}, own);
      Object.keys(g).forEach((p) => { eff[p] = true; });
      /* DDT needs every part on the same tower. Explicit towers (their Lead and Black come from different attacks)
         only count with support when that support gives both Lead and Black (MIB) and the tower hits blimps. */
      if (e && C.ddtExplicit(e)) eff.ddt = !!(own.ddt || (g.lead && g.black && eff.camo && own.moab));
      else eff.ddt = !!(eff.camo && eff.lead && eff.black && eff.moab);
      cov.pop.push(label);
      ['camo', 'lead', 'purple', 'black', 'white', 'zebra', 'moab', 'ddt', 'bad'].forEach((p) => {
        if (eff[p]) cov[p].push(own[p] || p === 'ddt' ? label : label + ' + ' + (g[p].note ? g[p].source : 'support'));
      });
    };
    insts.forEach((i) => {
      const e = pm.towers && pm.towers[i.id];
      if (!e) { if (unknown.indexOf(i.id) < 0) unknown.push(i.id); return; }
      arr(e.bonuses).forEach((b) => { if (b && b.from && C.reqHolds(b.from, i.x)) bonuses[b.vs] = true; });
      /* attacks at this crosspath? (a Village only attacks at 5-x-x; fortified = "can damage anything") */
      const own = C.towerProps(pm, i.id, i.x);
      if (!C.POP_PROPS.some((p) => own[p])) return;
      add(i.label, own, i.id);
    });
    if (hero) {
      const hp = C.heroProps(pm, hero.id, hero.level);
      if (Object.keys(hp).length) add(hero.label || hero.id, hp, hero.id);
    }
    return { cov, fixes, unknown, bonuses };
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
  C.heroLevelAt = function (D, heroId, placedRound, r, mapDifficulty, opts) {
    if (r < placedRound) return 0;
    const table = C.heroXpTable(D, heroId);
    const m = (C.TIER_XP_MULT[mapDifficulty] || 1) * num(opts && opts.xpMult, 1);
    const startLevel = Math.max(1, Math.min(20, num(opts && opts.startLevel, 1)));
    let xp = table[startLevel] || 0;
    for (let k = placedRound; k < r; k++) xp += C.roundXp(k) * m;
    return Math.max(startLevel, C.heroLevelFromXp(table, xp));
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
    if (settings && settings.me !== false) on['monkey-education'] = true;
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
        const list = insts.map((j, k) => (k === idx ? Object.assign({}, j, { x }) : j));
        if (!covers(list, hero)) return;
        const cost = C.upgradeCost(t, i.x, x, mult);
        if (!best || cost < best.cost) best = { kind: 'upgrade', uid: i.uid, towerId: i.id, label: i.label, from: i.x.slice(), x, cost, name: C.topName(t, x) };
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
        const add = { uid: 'new', id, x, label: t.name };
        if (!covers(insts.concat([add]), hero)) return;
        const cost = C.placeCost(t, x, mult);
        const alone = prop === 'pop' || C.coverState(D, [add], null).cov[prop].length > 0;
        if (!best || cost < best.cost) best = { kind: alone ? 'new' : 'support', towerId: id, label: t.name, x, cost, name: C.topName(t, x) };
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
    const out = res.upgrade.slice(0, 2).concat(res.new.slice(0, 2), res.support.slice(0, 1), res.hero);
    return out.slice(0, limit || 3);
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
    const moreCash = fx && fx.startCash ? fx.startCash * (rules.noIncome ? 1 : num(mode.cashMult, 1)) / players : 0;
    if (moreCash) Object.keys(base).forEach((k) => { base[k] += moreCash; });
    const sellRate = num(rules.sellRate, C.SELL_RATE) + (fx ? fx.sellAdd : 0);
    const heroOpts = C.heroOpts(fx);
    const instaLeft = Object.assign({}, plan.instas || {}); /* 'dart.204' -> how many you own */
    const strat = (D.strats || {})[plan.mapId] || {};
    const steps = arr(plan.steps).map((s, i) => Object.assign({ i }, s));
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
    let lostCash = 0; /* pop cash you don't get because those bloons leaked */
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
            res.name = C.topName(t, s.x);
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
      const lk = plan.noPower ? null : C.leakRound(D, mode, map, r, C.powerWithSupport(C.powerList(D, live.map((i) => ({ uid: i.uid, id: i.id, x: i.x, label: i.label })), hero ? { id: hero.id, level: hl, label: hero.name } : null, fx), st), fx);
      if (lk) lives = Math.max(0, lives - lk.lives);
      if (lk && lives <= 0 && lostAt == null) lostAt = r;
      rows.push({ r, leak: lk ? lk.leak : null, leakInfo: lk, lives: lk ? Math.round(lives) : null, avail: base[r] + income + ref0 - spent0 - lostCash,
        bank: base[r] + income + refunds - spent - lostCash, need, missing, heroLevel: hl, danger: row ? num(row.danger, 0) : 0,
        threats: row ? arr(row.threats) : [], composition: row ? row.composition : '', note: row ? row.notes : '',
        live: live.map((i) => i.uid), unknown: st.unknown, bonuses: st.bonuses, cov: st.cov });
      /* leaked layers pay no pop cash (counted from the next round on) */
      if (lk && lk.leak > 0 && !plan.keepLeakCash && !(rules.noIncome || rules.noPopCash)) lostCash += lk.leak * C.popCashPerRbe(row, r) * num(mode.cashMult, 1) / players;
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
        o.flags.push({ k: 'cash', t: 'short by $' + o.short.toLocaleString('en-US') + (er ? ', earliest R' + er : ', not affordable by R' + b) });
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
    /* rounds that leak: not enough pop power (estimate). Small leaks are ignored, unless your lives can't take them (C.leakIsProblem) */
    {
      let open = null;
      rows.forEach((x) => {
        const bad = x.leakInfo && C.leakIsProblem(x.leak, x.leakInfo.rbe, num(mode.lives, 100), x.leakInfo.lives) && !x.missing.length;
        if (bad && !open) { open = { prop: 'power', round: x.r, last: x.r, rounds: 1, lives: x.leakInfo.lives }; problems.push(open); }
        else if (bad) { open.last = x.r; open.rounds++; open.lives += x.leakInfo.lives; }
        else open = null;
      });
    }
    problems.sort((p, q) => (p.round - q.round) || (C.NEEDS.indexOf(p.prop) - C.NEEDS.indexOf(q.prop)));
    problems.forEach((pr) => {
      if (pr.prop !== 'power') return;
      const x = rows[pr.round - a];
      const live = instList.filter((i) => x.live.indexOf(i.uid) >= 0).map((i) => ({ uid: i.uid, id: i.id, x: C.xAt(out, i, pr.round), label: i.label }));
      const h = hero && hero.placed <= pr.round ? { id: hero.id, level: x.heroLevel, label: hero.name } : null;
      pr.estimate = true;
      pr.text = 'not enough popping power: about ' + x.leak + ' of ' + x.leakInfo.rbe + ' RBE gets through';
      pr.bank = x.avail;
      pr.composition = x.composition;
      pr.leakInfo = x.leakInfo;
      pr.fixes = C.powerFixes(D, mode, map, pr.round, live, h, C.coverState(D, live, h), 3, fx);
      pr.fixes.forEach((f) => { f.affordable = pr.bank != null && f.cost <= pr.bank + 0.5; });
      pr.hints = [];
      if (x.leakInfo.frozenShare > 0.05) pr.hints.push('Your Ice Monkey freezes bloons, and Sharp attacks (darts, tacks, Quincy) can\'t pop frozen bloons. Place them apart, or use towers that pop frozen bloons.');
      if (pr.round >= C.ROUGH_FROM) pr.hints.push('From R' + C.ROUGH_FROM + ' the leak check over-predicts leaks: it doesn\'t count abilities or sub-towers yet, and builds that win in real games often show leaks here. Treat this as a warning, not a verdict.');
      pr.hints.push('Estimate from each tower\'s damage, pierce and attack speed vs the round\'s bloons. Placement, abilities and buffs change it.');
    });
    problems.forEach((pr) => {
      if (pr.prop === 'power') return;
      const x = rows[pr.round - a];
      const live = instList.filter((i) => x.live.indexOf(i.uid) >= 0).map((i) => ({ uid: i.uid, id: i.id, x: C.xAt(out, i, pr.round), label: i.label }));
      pr.text = C.NEED_TEXT[pr.prop];
      pr.bank = x.avail;
      pr.fixes = C.fixesFor({ D, mode, map, insts: live, hero: hero && hero.placed <= pr.round ? { id: hero.id, level: x.heroLevel, label: hero.name } : null, heroPlaced: hero ? hero.placed : null, heroOpts, strong: arr(strat.strongTowers) }, pr.prop, 3);
      pr.fixes.forEach((f) => { f.affordable = pr.bank != null && f.cost <= pr.bank + 0.5; });
      pr.hints = C.hintsFor(D, live, pr.prop, hero && hero.placed <= pr.round ? { id: hero.id, level: x.heroLevel, label: hero.name } : null);
      pr.composition = x.composition;
    });
    const unknown = {};
    rows.forEach((x) => x.unknown.forEach((u) => { unknown[u] = true; }));
    return {
      mode, map, start: a, end: b, players, rows, steps: out, problems, first: problems[0] || null,
      badSteps: out.filter((o) => o.flags.some((f) => f.k === 'bad')), randomRounds: mode.roundSet === 'random',
      lives: rows.length && rows[rows.length - 1].lives != null ? rows[rows.length - 1].lives : null, livesStart: num(mode.lives, 100), lostAt,
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
    threats.forEach((t) => { t.fixes = C.fixesFor({ D, mode, map, insts, hero, heroPlaced: null }, t.prop, 3); t.hints = C.hintsFor(D, insts, t.prop, hero); });
    /* enough pop power? (estimate) the first round of the span that leaks, when every type is covered */
    let leak = null;
    if (!threats.length && (insts.length || hero)) {
      const list = C.powerWithSupport(C.powerList(D, insts, hero), st);
      let lost = 0;
      for (let r = r0; r <= end; r++) {
        const lk = C.leakRound(D, mode, map, r, list);
        if (!lk) continue;
        lost += lk.lives;
        if (!leak && C.leakIsProblem(lk.leak, lk.rbe, num(mode.lives, 100), lk.lives)) {
          const row = C.roundRow(D, mode, r);
          leak = { prop: 'power', round: r, rounds: [r], estimate: true, composition: row ? row.composition : '', leakInfo: lk,
            text: 'not enough popping power: about ' + lk.leak + ' of ' + lk.rbe + ' RBE gets through' };
          leak.fixes = C.powerFixes(D, mode, map, r, insts, hero, st, 3);
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
  /* a gap fix as a plan step: the round you can first pay for it, no earlier than the round before it's needed */
  C.fixRound = function (sim, cost, needRound) {
    const rows = arr(sim.rows);
    const minFrom = (r) => rows.filter((x) => x.r >= r).reduce((m, x) => Math.min(m, x.bank), Infinity);
    const r0 = Math.max(sim.start, needRound - 1);
    if (minFrom(r0) >= cost) return r0;
    for (let r = r0 + 1; r <= sim.end; r++) if (minFrom(r) >= cost) return r;
    return r0;
  };
  C.fixStep = function (sim, f, needRound) {
    if (!f || f.kind === 'hero') return null;
    const r = C.fixRound(sim, f.cost, needRound);
    if (f.kind === 'upgrade') return f.uid ? { op: 'up', ref: f.uid, x: f.x.slice(), r } : null;
    return f.towerId ? { op: 'place', t: f.towerId, x: f.x.slice(), r } : null;
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
  C.money = function (v) {
    if (v == null || !isFinite(v)) return '–';
    const n = Math.round(v);
    return (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US');
  };
  C.int = (v) => (v == null || !isFinite(v) ? '–' : Math.round(v).toLocaleString('en-US'));

  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  root.MonkeyIntel = root.MonkeyIntel || {};
  root.MonkeyIntel.core = C;
})(typeof window !== 'undefined' ? window : globalThis);
