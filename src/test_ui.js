/* UI-side rules (0.9.3, stream "ui"): the shared progress store, Monkey Education's "not set yet", the goals cap,
   My goals and the XP calculator agreeing on one farm, search for player phrases, quick-card copy and the mode ->
   price list map. Loaded by src/test_tools.js; run with: node src/test_tools.js */
'use strict';
const fs = require('fs');
const path = require('path');
module.exports = function (ok, D, C) {
  const ROOT = path.join(__dirname, '..');
  const ASSETS = path.join(__dirname, 'pages', 'assets');
  const mem = {};
  let broken = false;
  global.localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { if (broken) throw new Error('quota'); mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
  };
  global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
  global.atob = (s) => Buffer.from(s, 'base64').toString('binary');
  delete require.cache[require.resolve(path.join(ROOT, 'static', 'progress.js'))];
  require(path.join(ROOT, 'static', 'progress.js'));
  const P = global.MonkeyIntel.progress;
  require(path.join(ASSETS, 'goals-core.js'));
  require(path.join(ASSETS, 'tools-ui.js'));
  const U = global.MonkeyIntel.ui;
  const KEY = P.KEY;

  console.log('UI: Monkey Education starts "not set" (E21)');
  {
    P.reset();
    ok(P.get().settings.me === null, 'a first-time visitor has Monkey Education not set (null), not on');
    ok(U.mkSettings(P.get().settings).me === false && C.profileFx(D, P.get().profile, U.mkSettings(P.get().settings)).heroXpMult === 1,
      'not set counts as off: no hero XP +8% in the tools');
    ok(!C.fxSummary(C.profileFx(D, P.get().profile, U.mkSettings(P.get().settings))).some((x) => /hero XP/.test(x)), 'the profile summary line has no "hero XP +8%" for a new visitor');
    mem[KEY] = JSON.stringify({ v: 1, settings: { me: true, emt: false, maxTier: 'Expert' }, profile: { mk: {} } });
    ok(P.get().settings.me === null, 'an old save with the 0.9.2 default "on" and no Monkey Knowledge ticked reads as not set');
    mem[KEY] = JSON.stringify({ v: 1, settings: { me: true }, profile: { mk: { 'more-cash': true } } });
    ok(P.get().settings.me === true, 'an old save where you ticked Monkey Knowledge yourself keeps Monkey Education on');
    mem[KEY] = JSON.stringify({ v: 1, settings: { me: false }, profile: {} });
    ok(P.get().settings.me === false, 'an old save with Monkey Education off stays off');
    P.update((s) => { s.settings.me = true; });
    ok(P.get().settings.me === true && JSON.parse(mem[KEY]).settings.meV === 2, 'once you set it, it is saved as yours (meV 2)');
    P.update((s) => { s.settings.me = null; });
    ok(P.get().settings.me === null, 'and "not set" survives a save');
  }

  console.log('UI: progress store edge cases (T17)');
  {
    P.reset();
    const ids = [];
    let first = null;
    D.towers.forEach((t) => { ['all', 'paragon'].forEach((k) => { if (k === 'paragon' && !t.paragon) return; const id = P.addGoal({ tower: t.id, kind: k }); if (!first) first = id; ids.push(id); }); });
    for (let p = 0; ids.length < P.GOALS_MAX; p = (p + 1) % 3) ids.push(P.addGoal({ tower: D.towers[ids.length % D.towers.length].id, kind: 'upgrade', path: p, tier: 1 + (ids.length % 5) }));
    const n = P.get().goals.length;
    const have = {};
    P.get().goals.forEach((g) => { have[P.goalKey(g)] = 1; });
    let fresh = null;
    D.towers.some((t) => [0, 1, 2].some((pp) => [1, 2, 3, 4, 5].some((k) => { const g = { tower: t.id, kind: 'upgrade', path: pp, tier: k }; if (!have[P.goalKey(g)]) { fresh = g; return true; } return false; })));
    const extra = P.addGoal(fresh);
    ok(n === P.GOALS_MAX && extra === null && P.lastError === 'full' && P.get().goals.some((g) => g.id === first),
      'a goal past the limit is refused (and says why) instead of silently deleting your oldest', [n, extra, P.lastError]);
    P.reset();
    const code = 'MI1.' + global.btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, goals: [{ id: 'g1', tower: 'dart', kind: 'upgrade' }, { id: 'g2', tower: 'dart', kind: 'paragon' }] }))));
    ok(P.importCode(code) && P.get().goals.length === 1 && P.get().goals[0].id === 'g2', 'a goal with no path or tier is dropped on import');
    ok(C.goalView(D, { tower: 'dart', kind: 'upgrade' }, null, {}) === null, 'goalView refuses a path-less upgrade goal (it used to show 100%)');
    ok(P.logRun('dart', 1000, 'x') === true, 'logging a run reports that it was saved');
    broken = true;
    ok(P.logRun('dart', 1000, 'x') === false, 'logging a run reports false when storage refuses it ("Logged" only when saved)');
    broken = false;
    P.reset();
    P.setGame({ mapId: 'logs', modeId: 'hard', heroId: 'quincy', players: 2, from: 'advisor' });
    const g1 = P.get().game;
    P.setGame({ mapId: 'logs', modeId: 'hard', heroId: 'quincy', from: 'simulator' });
    const g2 = P.get().game;
    ok(g1.players === 2 && g2.players === 2 && g2.ts === g1.ts && g2.from === 'advisor', 'the same game set again keeps its time and source; a tool that does not know the players keeps them');
    P.setGame({ mapId: 'dark-castle', modeId: 'hard', heroId: 'quincy', from: 'simulator' });
    ok(P.get().game.mapId === 'dark-castle' && P.get().game.from === 'simulator' && P.get().game.ts >= g1.ts, 'a new game takes the new map and source');
  }

  console.log('UI: My goals and the XP calculator agree (T15)');
  {
    const settings = { me: true, emt: false, maxTier: 'Expert' };
    const prog = { u: [0, 0, 0], p: false, bank: 20000 };
    const v = C.goalView(D, { tower: 'sniper', kind: 'paragon' }, prog, settings);
    const plan = C.xpPlan(D, 'sniper', [0, 0, 0], { kind: 'paragon' }, prog.bank); /* what xp.js asks for: banked XP counts */
    const gf = C.goalFarm(D, 'sniper', plan.need, settings);
    ok(v.need === plan.need && v.runsLeft === gf.runs && v.perRun === gf.perRun, 'same Paragon goal, same XP to earn, XP a run and runs left on both pages', [v.need, plan.need, v.runsLeft, gf.runs, v.perRun, gf.perRun]);
    ok(v.runsLeft === Math.ceil(v.need / v.perRun), '"Runs left" uses the XP a run the card shows');
    ok(gf.guide && Math.abs(gf.share - 0.849) < 0.01, 'the Sniper guide farm (2 Snipers + Village + Quincy) keeps about 85% of the XP, from the guide\'s own figures', gf.share);
    const solo = C.goalFarm(D, 'dart', 500000, settings);
    ok(solo.share === 1 && solo.perRun === Math.round(solo.best.xp), 'a guide farm with only the goal\'s tower takes all the XP');
    const off = C.goalFarm(D, 'sniper', plan.need, { me: false, maxTier: 'Expert' });
    ok(off.perRun < gf.perRun && Math.abs(off.perRun * 1.08 - gf.perRun) < 2, 'Monkey Education off: 8% less XP a run', [off.perRun, gf.perRun]);
    const beg = C.goalView(D, { tower: 'sniper', kind: 'paragon' }, prog, { me: true, maxTier: 'Beginner' });
    ok(beg.best.tier === 'Beginner' && !beg.farm.guide && beg.runsLeft > v.runsLeft, 'Beginner maps only: a Beginner farm, more runs, no Expert guide farm');
  }

  console.log('UI: search finds player phrases (Q7)');
  {
    const S = require(path.join(ROOT, 'static', 'search-core.js'));
    let idx = JSON.parse(fs.readFileSync(path.join(ROOT, 'search-index.json'), 'utf8'));
    if (!Array.isArray(idx)) idx = idx.entries || Object.values(idx).find(Array.isArray);
    const s = S.create(idx);
    const first = (q) => { const r = s.search(q, 3)[0]; return r ? r.t + ' | ' + r.k : ''; };
    [['lead fix', /^Lead Bloons \| Quick$/], ['how do i beat 63', /^Round 63 \| Round$/], ['insta', /^My profile \| Tool$/], ['instas', /^My profile \| Tool$/],
      ['how to beat round 98', /^Round 98 \| Round$/], ['camo fix', /^Camo Bloons \| Quick$/], ['camo', /^Camo Bloons \| Quick$/], ['r63', /^Round 63/]].forEach(([q, want]) => {
      const got = first(q);
      ok(want.test(got), 'search "' + q + '" -> ' + want, got);
    });
    ok(s.search('zzzq qqqz', 5).length === 0, 'junk still finds nothing');
  }

  console.log('UI: quick-card copy and price lists');
  {
    const camo = fs.readFileSync(path.join(ROOT, 'quick', 'camo', 'index.html'), 'utf8');
    ok(!/Zephyr Sense \(Wind path/.test(camo) && /Wind path detects camo/.test(camo), 'camo card: Skywarden row says "Wind path detects camo" without repeating "Zephyr Sense"');
    const bad = [];
    fs.readdirSync(path.join(ROOT, 'quick')).forEach((slug) => {
      const f = path.join(ROOT, 'quick', slug, 'index.html');
      if (!fs.existsSync(f)) return;
      const html = fs.readFileSync(f, 'utf8');
      (html.match(/<span class="fix-why">[^<]*<\/span>/g) || []).forEach((w) => { if (/synced with the game files|derived rule|towers\.json|wiki table|fandom/i.test(w)) bad.push(slug + ': ' + w.slice(0, 90)); });
    });
    ok(!bad.length, 'quick cards carry no research asides ("synced with the game files", "derived rule")', bad);
    const src = fs.readFileSync(path.join(ROOT, 'static', 'prices.js'), 'utf8');
    const box = { document: { querySelectorAll: () => [] } };
    box.window = box;
    require('vm').runInNewContext(src, box);
    const map = box.MonkeyIntelModeDiff || {};
    const wrong = D.modes.filter((m) => !C.isSandbox(m)).filter((m) => map[m.id] !== (m.costMult > 1.1 ? 'impoppable' : m.base));
    ok(!wrong.length && Object.keys(map).length === D.modes.filter((m) => !C.isSandbox(m)).length, 'prices.js maps every mode to its price list (base difficulty, Impoppable x1.2)', wrong.map((m) => m.id));
  }
  delete global.localStorage;
};
