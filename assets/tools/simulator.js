/* Monkey Intel: round-timeline simulator (slug: simulator). Needs tools-data, map-tips, tools-core, synergy, tools-ui.
   A strategy lab: invent a build, try it round by round, see where it breaks. The Strategy Advisor (advisor.js) is the guided twin. */
(function () {
  'use strict';
  const MI = window.MonkeyIntel;
  const C = MI.core, U = MI.ui, h = U.h;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const D = U.data();
  const root = document.getElementById('sim-root');
  if (!root) return;
  const KEY = 'mi-sim-v1';
  const NS = 'http://www.w3.org/2000/svg';

  /* ---------- state ---------- */
  let plan = { mapId: 'monkey-meadow', modeId: 'medium', steps: [], heroLevel: null, me: false, emt: false };
  let uidN = 0;
  const newUid = () => 'u' + (++uidN) + Date.now().toString(36).slice(-3);
  let sheet = null; /* add-step sheet state: {op, r, t, x, ref} */
  let presetLoaded = false;
  let stratOpen = null;
  let showAllProblems = false;
  let me = { fx: null, instas: [], instaMap: null, ownsHero: () => true }; /* map-ideas panel: null = open until the build has a few steps */
  /* a line above the result after a link or another tool changed your game: {kind: 'link' | 'game' | 'done', ...} */
  let notice = null;
  let prev = null; /* the build a link or "use that game" replaced: {hash, label}, for undo */

  const P = MI.progress || null;
  const validMap = (id) => !!(id && C.map(D, id));
  const validMode = (id) => !!(id && C.mode(D, id) && !C.isSandbox(C.mode(D, id)));
  function planLabel(p) {
    const m = C.map(D, p.mapId), md = C.mode(D, p.modeId);
    const n = (p.steps || []).length;
    return (m ? m.name : p.mapId) + ', ' + (md ? md.name : p.modeId) + ', ' + n + ' step' + (n === 1 ? '' : 's');
  }
  function applyPlan(p) {
    plan.mapId = p.mapId || plan.mapId;
    plan.modeId = p.modeId || plan.modeId;
    plan.steps = p.steps || [];
    plan.heroLevel = p.heroLevel != null ? p.heroLevel : null;
    plan.players = p.players || 1;
  }
  const heroOf = (p) => { const s = (p.steps || []).find((x) => x.op === 'hero'); return s ? s.h : ''; };
  /* the last game you set up in another tool (the Advisor, Check my defence): does it differ from this build? */
  function gameDiffers(g) {
    if (!g) return false;
    return (validMap(g.mapId) && g.mapId !== plan.mapId) || (validMode(g.modeId) && g.modeId !== plan.modeId)
      || (g.players >= 1 && C.players(g.players) !== C.players(plan.players)) || (g.heroId && C.hero(D, g.heroId) && g.heroId !== heroOf(plan));
  }
  function gameLabel(g) {
    const bits = [];
    if (validMap(g.mapId)) bits.push(C.map(D, g.mapId).name);
    if (validMode(g.modeId)) bits.push(C.mode(D, g.modeId).name);
    if (g.heroId && C.hero(D, g.heroId)) bits.push(C.hero(D, g.heroId).name);
    if (g.players > 1) bits.push(g.players + ' players');
    return bits.join(', ');
  }
  /* take map, mode, hero and players from the last game; your steps stay (moved inside the mode's rounds) */
  function adoptGame(g) {
    if (validMap(g.mapId)) plan.mapId = g.mapId;
    if (validMode(g.modeId)) plan.modeId = g.modeId;
    if (g.players >= 1) plan.players = C.players(g.players);
    if (g.heroId && C.hero(D, g.heroId)) {
      const cur = plan.steps.find((x) => x.op === 'hero');
      if (cur) cur.h = g.heroId; else plan.steps.unshift({ uid: newUid(), op: 'hero', h: g.heroId, r: range()[0] });
    }
    plan.steps.forEach((x) => { x.r = clampR(x.r); });
  }
  function loadInitial() {
    const hash = location.hash || '';
    const saved = U.store.get(KEY);
    const g = P && P.get().game; /* the last game you set up in any tool */
    const savedPlan = saved && saved.hash ? C.decodePlan(D, saved.hash) : null;
    notice = null;
    prev = saved && saved.prev && saved.prev.hash ? saved.prev : null;
    plan = { mapId: 'monkey-meadow', modeId: 'medium', steps: [], heroLevel: null, players: 1 };
    if (savedPlan) applyPlan(savedPlan);
    else if (g) adoptGame(g);
    if (/[#&](map|mode|b|tower|hero)=/.test(hash)) {
      const p = C.decodePlan(D, hash);
      const partial = !/[#&]b=/.test(hash);
      /* a link that doesn't name the map, mode or players takes them from your last game, else from your build */
      if (!p.mapId) p.mapId = g && validMap(g.mapId) ? g.mapId : plan.mapId;
      if (!p.modeId) {
        p.modeId = g && validMode(g.modeId) ? g.modeId : plan.modeId;
        const a = C.modeRange(C.mode(D, p.modeId))[0];
        p.steps.forEach((x) => { if (x.r < a) x.r = a; });
      }
      if (partial && !/[#&]pl=/.test(hash)) p.players = g && g.players >= 1 ? g.players : plan.players;
      const before = savedPlan && savedPlan.steps.length ? { hash: saved.hash, label: planLabel(savedPlan) } : null;
      const linkHash = C.encodePlan(p);
      applyPlan(p);
      /* opening a link never loses the build you had: it is kept for "Back to my build" */
      if (before && before.hash !== linkHash) {
        prev = before;
        notice = { kind: 'link', partial, adds: partial ? p.steps.filter((x) => x.op === 'place' || x.op === 'hero') : [], mapOnly: partial && !p.steps.length };
        U.store.set(KEY, { hash: linkHash, ts: Date.now(), prev });
      }
      return;
    }
    if (g && g.from !== 'simulator' && g.ts > ((saved && saved.ts) || 0) && gameDiffers(g)) {
      if (!plan.steps.length) { adoptGame(g); notice = { kind: 'done', text: 'Set up from your last game: ' + gameLabel(g) + '.' }; }
      else notice = { kind: 'game', game: g };
    }
  }
  function persist() {
    const hash = C.encodePlan(plan);
    try { history.replaceState(null, '', '#' + hash); } catch (e) { /* file:// or sandbox */ }
    if (P) {
      const hs = plan.steps.find((x) => x.op === 'hero');
      P.setGame({ mapId: plan.mapId, modeId: plan.modeId, heroId: hs ? hs.h : '', players: C.players(plan.players), from: 'simulator' });
      if (plan.steps.length) P.setPlan('simulator', { hash, label: (map() ? map().name : plan.mapId) + ', ' + (mode() ? mode().name : plan.modeId) + ', ' + plan.steps.length + ' step' + (plan.steps.length === 1 ? '' : 's') });
    }
    U.store.set(KEY, { hash, ts: Date.now() + 1, prev });
  }
  const mode = () => C.mode(D, plan.modeId);
  const map = () => C.map(D, plan.mapId);
  const range = () => C.modeRange(mode());
  const strat = () => (D.strats || {})[plan.mapId] || {};

  /* ---------- plan edits ---------- */
  function clampR(r) { const [a, b] = range(); return Math.max(a, Math.min(b, Math.round(r))); }
  function addStep(s) { s.uid = s.uid || newUid(); s.r = clampR(s.r); plan.steps.push(s); presetLoaded = false; update(); }
  function removeStep(uid) {
    const s = plan.steps.find((x) => x.uid === uid);
    plan.steps = plan.steps.filter((x) => x.uid !== uid && !(s && s.op === 'place' && x.ref === uid));
    update();
  }
  function sortedSteps() { return plan.steps.map((s, i) => ({ s, i })).sort((p, q) => (p.s.r - q.s.r) || (p.i - q.i)).map((o) => o.s); }
  function moveStep(uid, dir) {
    const list = sortedSteps();
    const i = list.findIndex((s) => s.uid === uid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const a = list[i], b = list[j];
    if (a.r !== b.r) a.r = b.r; /* moving past a neighbour takes its round */
    list.splice(i, 1); list.splice(j, 0, a);
    plan.steps = list;
    update();
  }
  function setHero(id) {
    const cur = plan.steps.find((s) => s.op === 'hero');
    if (!id) { plan.steps = plan.steps.filter((s) => s.op !== 'hero'); }
    else if (cur) cur.h = id;
    else plan.steps.push({ uid: newUid(), op: 'hero', h: id, r: range()[0] });
    update();
  }
  /* round to buy a fix: the round before it is needed, if it never pushes the bank negative; else the first round that fits */
  function applyFix(sim, f, needRound) {
    /* the same rule as the Advisor: pairs add both towers, a later planned upgrade keeps the fix's tiers, and steps that
       can't be paid any more move to the first round they can (C.applyFix) */
    const res = C.applyFix(D, plan, f, needRound);
    if (!res || !res.plan) return;
    res.plan.steps.forEach((s) => { if (!s.uid || /^fx\d+$/.test(s.uid)) s.uid = newUid(); });
    plan.steps = res.plan.steps;
    presetLoaded = false;
    update();
  }

  /* ---------- render ---------- */
  let sim = null;
  function update() { persist(); render(); }

  /* The leak check is the slow part (a long build can take a few hundred ms on a phone). Each render shows cash and coverage
     at once, runs the leak checks it can in LEAK_SYNC_MS, and runs the rest in short slices between your taps (a new edit
     cancels them), then draws the page again. Rounds already checked come from the leak cache, so most edits finish at once. */
  const LEAK_SYNC_MS = 25, LEAK_SLICE_MS = 12;
  let leakGen = 0, leakJob = null;
  const now = () => (window.performance && performance.now ? performance.now() : Date.now());
  function simPlan(memo, jobs) {
    const p = Object.assign({}, plan);
    Object.defineProperty(p, 'leakMemo', { value: memo });
    if (jobs) Object.defineProperty(p, 'leakJobs', { value: jobs });
    return p;
  }
  /* run pending leak checks in round order until `until`; lives are counted as C.simulate does, so none run after they're gone */
  function drain(job, until) {
    const rows = job.sim.rows;
    while (job.i < rows.length) {
      if (job.lives <= 0) { job.i = rows.length; break; }
      const row = rows[job.i];
      let lk = row.leakInfo;
      if (row.pend) { const j = job.byR[row.r]; lk = job.memo[j.key] !== undefined ? job.memo[j.key] : (job.memo[j.key] = j.run()); job.done++; }
      if (lk) job.lives = Math.max(0, job.lives - lk.lives);
      job.i++;
      if (now() > until) break;
    }
    job.r = job.i < rows.length ? rows[job.i].r : sim.end;
    return job.i >= rows.length;
  }
  /* the leak checks, then the ones the fixes on show need (C.powerFixes opts.jobs: the single buys, then a second pass for
     the pairs it tries when no single buy is enough), one problem at a time; true when all are done */
  function advance(job, until) {
    if (!job.final) {
      if (!drain(job, until)) return false;
      job.final = job.sim.pending ? C.simulate(D, simPlan(job.memo, null)) : job.sim;
      job.probs = job.final.problems.slice(0, showAllProblems ? Infinity : 4).filter((p) => p.fixJobs);
      job.pi = 0; job.pass = 1; job.fixes = []; job.fi = 0; job.ran = false;
    }
    for (;;) {
      if (now() >= until) return false;
      if (job.fi < job.fixes.length) { job.fixes[job.fi++](); job.ran = true; continue; }
      if (job.pi < job.probs.length) { job.fixes = job.probs[job.pi++].fixJobs(); job.fi = 0; continue; }
      if (job.pass === 1 && job.ran) { job.pass = 2; job.pi = 0; job.ran = false; continue; }
      return true;
    }
  }
  function leakStep(gen) {
    const job = leakJob;
    if (!job || job.gen !== gen || gen !== leakGen) return;
    if (!advance(job, now() + LEAK_SLICE_MS)) { leakProgress(job); setTimeout(() => leakStep(gen), 0); return; }
    leakJob = null;
    sim = job.final;
    draw();
  }
  const leakLabel = (job) => (job.final ? 'finding fixes' : 'R' + job.r + ' of R' + sim.end);
  function leakProgress(job) {
    const el = document.getElementById('sim-leak-at');
    if (el) el.textContent = leakLabel(job);
  }

  function render() {
    plan.unlocked = U.myUnlocks(); /* flags steps above what you have unlocked (not part of the share link) */
    me = U.me(D); /* My profile: Monkey Knowledge cash/hero effects and your Insta inventory */
    plan.fx = me.fx;
    plan.missing = me.missing || null; /* towers marked "not unlocked yet" in My profile: fixes label them */
    plan.instas = me.instaMap;
    /* Monkey Education and Elite Military Training: one switch each, in My profile (shared with My goals and the XP calculator) */
    const mk = U.mkSettings(P ? P.get().settings : null);
    plan.me = mk.me; plan.emt = mk.emt;
    const gen = ++leakGen;
    leakJob = null;
    const memo = {}, jobs = [];
    sim = C.simulate(D, simPlan(memo, jobs));
    const job = { gen, memo, sim, i: 0, done: 0, r: sim.start, lives: sim.livesStart, byR: {}, final: null };
    jobs.forEach((j) => { job.byR[j.r] = j; });
    if (advance(job, now() + LEAK_SYNC_MS)) sim = job.final;
    else { leakJob = job; setTimeout(() => leakStep(gen), 0); }
    draw();
  }
  function draw() {
    hintSeen = {};
    const snap = U.snapFocus();
    U.clear(root);
    const pv = U.previewNote(D);
    if (pv) root.appendChild(pv);
    root.appendChild(setupPanel());
    root.appendChild(stratPanel());
    const res = answer();
    root.appendChild(res);
    root.appendChild(timelinePanel());
    root.appendChild(stepsPanel());
    if (sim.problems.length > 1) root.appendChild(problemsPanel());
    root.appendChild(suggestPanel());
    root.appendChild(xpPanel());
    U.restoreFocus(snap, root);
    U.resultDock(res, dockInfo());
  }
  /* one line for the bar that keeps the result in reach on a phone */
  function dockInfo() {
    const f = sim.first;
    if (leakWait()) return { tone: 'wait', text: 'Checking leaks…' + (f && f.prop !== 'power' ? ' First gap: R' + f.round : '') };
    if (f) return { tone: 'bad', text: 'R' + f.round + ': ' + (f.prop === 'power' ? 'leaks (about ' + C.int(sim.rows[f.round - sim.start] ? sim.rows[f.round - sim.start].leak : 0) + ' RBE)' : f.text.split(',')[0]) + U.cheapestFix(f.fixes) };
    if (sim.lostAt) return { tone: 'bad', text: 'Lives run out around R' + sim.lostAt };
    const cashBad = sim.steps.find((x) => x.short);
    if (cashBad) return { tone: 'warn', text: 'Covered, but R' + cashBad.r + ' is short by ' + C.money(cashBad.short) };
    return { tone: 'ok', text: 'Covered to R' + sim.end };
  }

  function setupPanel() {
    const m = mode();
    const heroStep = plan.steps.find((s) => s.op === 'hero');
    const kids = [
      U.field('Map', U.combo(U.mapOptions(D), plan.mapId, (v) => { plan.mapId = v; update(); }, { id: 'sim-map' }), 'ti-grow'),
      U.field('Mode', U.combo(U.modeOptions(D), plan.modeId, (v) => { plan.modeId = v; plan.steps.forEach((s) => { s.r = clampR(s.r); }); update(); }, { id: 'sim-mode' }), 'ti-grow'),
      U.field('Hero', U.combo(U.heroOptions(D).map((o) => (o.value && !me.ownsHero(o.value) ? Object.assign({}, o, { label: o.label + ' (not owned)' }) : o)), heroStep ? heroStep.h : '', setHero, { id: 'sim-hero' }), 'ti-grow'),
    ];
    if (heroStep) {
      const lvl = h('input', { class: 'ti-input', type: 'number', min: '1', max: '20', inputmode: 'numeric', placeholder: 'auto', value: plan.heroLevel != null ? String(plan.heroLevel) : '', 'aria-label': 'Hero level override', style: 'width:6.5em' });
      lvl.addEventListener('change', () => { const v = parseInt(lvl.value, 10); plan.heroLevel = v >= 1 && v <= 20 ? v : null; update(); });
      kids.push(U.field('Hero level', lvl));
    }
    const facts = h('p', { class: 'ti-note' }, [
      m.name + ': ', U.rchip(range()[0], 'ti-r-plain'), ' to ', U.rchip(range()[1], 'ti-r-plain'),
      U.startFact(m, plan.players), ', prices ×' + m.costMult + (m.rules && m.rules.noSelling ? ', no selling' : '') + (m.rules && m.rules.noIncomeTowers ? ', no farms' : ''),
      heroStep && sim.rows.length ? ['. Hero level ', plan.heroLevel != null ? 'set to ' + plan.heroLevel : 'is an estimate', U.badge('calc', plan.heroLevel != null ? 'manual' : 'estimate')] : null,
    ]);
    const body = [noticeBox(), h('div', { class: 'ti-row' }, kids), h('div', { class: 'ti-row' }, U.playersField(plan.players, (k) => { plan.players = k; update(); }, 'sim-pl')), facts, U.profileLine(D, m, me)];
    body.push(h('div', { class: 'ti-share' }, [
      h('button', { type: 'button', class: 'btn btn-small', onclick: (e) => copyLink(e.currentTarget) }, 'Copy share link'),
      plan.steps.length ? h('button', { type: 'button', class: 'btn btn-small', id: 'sim-clear', onclick: () => { if (window.confirm('Clear every step?')) { keepPrev(); plan.steps = []; plan.heroLevel = null; notice = { kind: 'done', text: 'Cleared.', undo: true }; update(); } } }, 'Start over') : null,
    ]));
    return h('section', { class: 'panel', 'aria-labelledby': 'sim-setup-h' }, [h('h2', { class: 'panel-h', id: 'sim-setup-h' }, 'Your game'), h('div', { class: 'ti-panel-b ti' }, body)]);
  }
  /* ---------- after a link or another tool: keep my build / load this one ---------- */
  function keepPrev() { prev = { hash: C.encodePlan(plan), label: planLabel(plan) }; }
  function backToPrev() {
    if (!prev) return;
    const was = { hash: C.encodePlan(plan), label: planLabel(plan) };
    applyPlan(C.decodePlan(D, prev.hash));
    prev = was;
    notice = { kind: 'done', text: 'Back to your build. The other one is a tap away.', undo: true, undoLabel: 'Switch back' };
    update();
  }
  function noticeBox() {
    if (!notice) return null;
    const n = notice;
    const close = h('button', { type: 'button', class: 'btn btn-small', id: 'sim-nt-ok', onclick: () => { notice = null; render(); } }, 'OK');
    if (n.kind === 'link') {
      const acts = [h('button', { type: 'button', class: 'btn btn-small btn-grass', id: 'sim-nt-back', onclick: backToPrev }, 'Back to my build')];
      if (n.adds.length || n.mapOnly) acts.push(h('button', { type: 'button', class: 'btn btn-small', id: 'sim-nt-add', onclick: () => {
        const mine = C.decodePlan(D, prev.hash);
        const was = { hash: C.encodePlan(plan), label: planLabel(plan) };
        const linkMap = plan.mapId;
        applyPlan(mine);
        if (n.mapOnly) plan.mapId = linkMap;
        n.adds.forEach((x) => {
          if (x.op === 'hero') { const cur = plan.steps.find((y) => y.op === 'hero'); if (cur) { cur.h = x.h; return; } }
          plan.steps.push(Object.assign({}, x, { uid: newUid(), r: clampR(x.r) }));
        });
        prev = was;
        notice = { kind: 'done', text: n.mapOnly ? 'Your steps, on ' + map().name + '.' : 'Added to your build.', undo: true, undoLabel: 'Undo' };
        update();
      } }, n.mapOnly ? 'Keep my steps on this map' : 'Add it to my build instead'));
      acts.push(close);
      return h('div', { class: 'ti-notice', role: 'status' }, [h('p', null, ['Opened from a link. Your build (' + prev.label + ') is kept.']), h('div', { class: 'ti-share' }, acts)]);
    }
    if (n.kind === 'game') {
      const g = n.game;
      return h('div', { class: 'ti-notice', role: 'status' }, [h('p', null, 'Your last game in another tool: ' + gameLabel(g) + '. This build is ' + planLabel(plan) + '.'),
        h('div', { class: 'ti-share' }, [
          h('button', { type: 'button', class: 'btn btn-small btn-grass', id: 'sim-nt-use', onclick: () => { keepPrev(); adoptGame(g); notice = { kind: 'done', text: 'Now ' + gameLabel(g) + ', with your steps.', undo: true, undoLabel: 'Undo' }; update(); } }, 'Use that game'),
          h('button', { type: 'button', class: 'btn btn-small', id: 'sim-nt-keep', onclick: () => { notice = null; update(); } }, 'Keep my build'),
        ])]);
    }
    return h('div', { class: 'ti-notice', role: 'status' }, [h('p', null, n.text), h('div', { class: 'ti-share' }, [
      n.undo && prev ? h('button', { type: 'button', class: 'btn btn-small', id: 'sim-nt-undo', onclick: backToPrev }, n.undoLabel || 'Undo') : null, close])]);
  }

  /* ---------- strategy ideas for the map ---------- */
  function advisorLink() {
    const heroStep = plan.steps.find((s) => s.op === 'hero');
    const ids = [];
    sim.insts.forEach((i) => { if (ids.indexOf(i.id) < 0) ids.push(i.id); });
    return '../advisor/#map=' + plan.mapId + '&mode=' + plan.modeId + '&hero=' + (heroStep ? heroStep.h : 'auto') + (ids.length ? '&t=' + ids.join(',') : '') + (C.players(plan.players) > 1 ? '&pl=' + C.players(plan.players) : '');
  }
  function stratPanel() {
    const s = strat();
    const m = mode(), mp = map();
    const tips = U.tips(plan.mapId);
    const [a, b] = range();
    const preset = (D.presets || {})[plan.mapId];
    const used = sim.insts.map((i) => i.id);
    const heroStep = plan.steps.find((x) => x.op === 'hero');
    const towerChip = (id) => {
      const t = C.tower(D, id);
      if (!t) return null;
      const issue = C.placeIssue(D, m, mp, t);
      return h('button', { type: 'button', class: 'tag ti-tipchip' + (used.indexOf(id) >= 0 ? ' tag-banana' : ''), disabled: issue ? true : null, title: issue || 'Add a ' + t.name + ' step',
        'data-fk': 'sim-chip-' + id, onclick: () => { openSheet('place'); sheet.t = id; render(); const el = document.getElementById('sim-sheet'); if (el) el.scrollIntoView({ block: 'nearest' }); focusSheet(); } }, '+ ' + t.name.replace(/ Monkey$/, ''));
    };
    const heroes = C.mapHeroes ? C.mapHeroes(D, plan.mapId) : [];
    const body = [h('dl', { class: 'chips-dl ti-tips-dl' }, [
      arr(s.strongTowers).length ? h('div', null, [h('dt', null, 'Strong here'), h('dd', null, arr(s.strongTowers).map(towerChip))]) : null,
      /* weak here: a link to the tower page (what it's for), and one line on why it isn't offered as a step */
      arr(s.avoidTowers).length ? h('div', null, [h('dt', null, 'Weak here'), h('dd', null, arr(s.avoidTowers).map((id) => { const t = C.tower(D, id); return t ? h('a', { class: 'tag ti-tipchip ti-weak' + (used.indexOf(id) >= 0 ? ' tag-danger' : ''), href: U.towerHref(id), title: t.name + ' is weak on ' + mp.name + ' (map page). Tap for the tower page.' }, t.name.replace(/ Monkey$/, '')) : null; })),
        h('dd', { class: 'ti-note ti-weak-n' }, ['The map page rates these weak here, so they aren\'t offered as steps. You can still add one with "+ Add a step". ', used.some((id) => arr(s.avoidTowers).indexOf(id) >= 0) ? h('b', null, 'Red: in your build. ') : null, h('a', { href: '../../maps/' + mp.id + '/' }, 'Why, on the map page')])]) : null,
      heroes.length ? h('div', null, [h('dt', null, 'Best heroes'), h('dd', null, heroes.map((hh) => {
        const own = me.ownsHero(hh.id);
        return h('button', { type: 'button', class: 'tag ti-tipchip' + (heroStep && heroStep.h === hh.id ? ' tag-banana' : '') + (own ? '' : ' ti-notown'), 'data-fk': 'sim-bh-' + hh.id,
          title: own ? 'Use ' + hh.name : hh.name + ': not owned in My profile. Tap to plan with this hero anyway.', onclick: () => setHero(hh.id) }, own ? hh.name : [hh.name, h('small', null, ' not owned')]);
      })),
      heroes.some((hh) => !me.ownsHero(hh.id)) ? h('dd', { class: 'ti-note' }, ['"Not owned" comes from ', h('a', { href: '../profile/' }, 'My profile'), '. You can still plan with them.']) : null]) : null,
    ])];
    const pl = U.planFor(tips, m);
    if (pl) body.push(h('div', null, [h('p', { class: 'ti-lbl' }, pl.label + ' from the map page'), U.stepList(pl.steps, 4)]));
    const kr = U.keyRounds(tips, a, b, 6);
    if (kr) body.push(h('div', null, [h('p', { class: 'ti-lbl' }, 'Key rounds'), kr]));
    const acts = [];
    if (preset) {
      acts.push(h('button', { type: 'button', class: 'btn btn-small', id: 'sim-preset', onclick: () => { const p = C.presetPlan(D, plan.mapId); if (p) { if (plan.steps.length) { keepPrev(); notice = { kind: 'done', text: 'Loaded the map page\'s CHIMPS plan. Your own steps are kept.', undo: true, undoLabel: 'Back to my build' }; } plan.modeId = p.modeId; plan.steps = p.steps; plan.heroLevel = null; presetLoaded = true; update(); } } }, 'Load the map page\'s CHIMPS plan'));
      acts.push(U.badge('calc', 'calculated, not play-tested'));
      /* these plans were worked out from the map page's strategy text, not played; say what our own check makes of them */
      if (presetLoaded) acts.push(h('span', { class: 'ti-note', id: 'sim-preset-note' }, 'Loaded. It was worked out from the map page, not played.' + (sim && sim.lostAt ? ' Our leak check says it runs out of lives around R' + sim.lostAt + ': fix it from there, or trust your own game.' : ' Change anything and watch what breaks.')));
    }
    acts.push(h('a', { class: 'btn btn-small', href: '../../maps/' + mp.id + '/' }, 'Full map page'));
    body.push(h('div', { class: 'ti-share' }, acts));
    body.push(h('div', { class: 'ti-cta' }, [h('p', null, 'Know which monkeys you want, but not how to use them?'),
      h('a', { class: 'btn btn-small btn-grass', href: advisorLink(), id: 'sim-to-adv' }, 'Let the Strategy Advisor plan it')]));
    const open = stratOpen != null ? stratOpen : plan.steps.length < 3;
    const d = h('details', { class: 'panel ti-details ti-strat', open: open ? true : null }, [
      h('summary', { class: 'panel-h' }, ['Strategy ideas', h('small', null, mp.name + (open ? '' : ' · tap to open'))]),
      h('div', { class: 'ti-panel-b ti ti-tips', style: 'padding-top:10px' }, body),
    ]);
    d.addEventListener('toggle', () => { stratOpen = d.open; });
    return d;
  }

  function copyLink(btn) {
    const url = location.href.split('#')[0] + '#' + C.encodePlan(plan);
    const done = () => { btn.textContent = 'Link copied'; setTimeout(() => { btn.textContent = 'Copy share link'; }, 1600); };
    try { navigator.clipboard.writeText(url).then(done, () => window.prompt('Copy this link', url)); } catch (e) { window.prompt('Copy this link', url); }
  }

  /* leak checks still running, and no problem known before the first round they cover */
  function leakWait() { return !!(leakJob && !(sim.pending && sim.first && sim.first.round < sim.pending.from)); }
  function answer() {
    const f = sim.first;
    const cashBad = sim.steps.find((s) => s.short);
    const extra = [];
    const box = (cls, label, kids) => h('section', { class: 'ti-alert' + (cls ? ' ' + cls : ''), id: 'sim-res', tabindex: '-1', 'data-fk': 'sim-res', 'aria-label': label }, kids);
    if (sim.randomRounds) extra.push(h('p', { class: 'ti-alert-s' }, sim.mode.name + ' has random rounds. This uses the standard rounds as a stand-in, so treat every round here as a rough guide.'));
    if (sim.badSteps.length) extra.push(h('p', { class: 'ti-alert-s' }, ['Not counted: ', U.rchip(sim.badSteps[0].r), ' ' + sim.badSteps[0].label + ' (' + sim.badSteps[0].flags.find((x) => x.k === 'bad').t + ')' + (sim.badSteps.length > 1 ? ' and ' + (sim.badSteps.length - 1) + ' more step' + (sim.badSteps.length > 2 ? 's' : '') + ' marked in red below' : '') + '.']));
    if (leakWait()) {
      /* cash and coverage are ready; the leak check fills in the rest without blocking the page */
      const gap = f && f.prop !== 'power' ? f : null;
      const kids = [h('p', { class: 'ti-alert-t' }, 'Checking leaks…'), h('p', { class: 'ti-alert-s', role: 'status' }, 'Cash and coverage are ready. The leak check runs in the background: you can keep editing.'),
        h('p', { class: 'ti-alert-s' }, ['Now: ', h('b', { id: 'sim-leak-at' }, leakLabel(leakJob))])];
      if (gap) kids.push(h('p', { class: 'ti-alert-s' }, ['First gap so far: ', U.rchip(gap.round), ' '].concat(U.probText(gap.text, { noLink: true }))));
      return box('ti-alert-wait', 'Result', kids.concat(extra));
    }
    if (!f && sim.lostAt) {
      /* no single round shows a problem, but small leaks add up and your lives run out: fix the round that costs the most */
      const lf = livesFixes();
      const kids = [h('p', { class: 'ti-alert-t' }, 'Lives run out around R' + sim.lostAt), h('p', { class: 'ti-alert-s' }, ['No single round leaks much, but the small leaks add up. ',
        lf ? ['The round that costs the most lives is ', U.rchip(lf.round), ' (about ' + C.int(lf.lives) + '). Fix it before R' + sim.lostAt + ':'] : 'Add popping power before R' + sim.lostAt + '.'])].concat(extra);
      kids.push(livesLine());
      if (lf) kids.push(fixBlock({ round: lf.round, fixes: lf.fixes, hints: [], estimate: true }));
      kids.push(defenceLink(lf ? lf.round : sim.lostAt));
      return box('', 'First problem', kids);
    }
    if (!f) {
      const kids = [h('p', { class: 'ti-alert-t' }, 'Covered to R' + sim.end), h('p', { class: 'ti-alert-s' }, 'Every bloon type in this mode has an answer in your build, in time.')].concat(extra);
      if (sim.unknown.length) kids.push(h('p', { class: 'ti-alert-s' }, 'Not counted (no pop data yet): ' + sim.unknown.map((id) => C.tower(D, id).name).join(', ') + '.'));
      if (cashBad) kids.push(h('p', { class: 'ti-alert-s' }, ['But you can\'t afford every step: ', U.rchip(cashBad.r), ' ' + cashBad.label + ' is short by ' + C.money(cashBad.short) + '.']));
      if (sim.lives != null) kids.push(livesLine());
      return box(cashBad ? 'ti-alert-warn' : 'ti-alert-ok', 'Result', kids);
    }
    const kids = [
      h('p', { class: 'ti-alert-t' }, ['R' + f.round + ': '].concat(U.probText(f.text, { noLink: true }))),
      h('p', { class: 'ti-alert-s' }, [f.composition ? 'R' + f.round + ' is ' + f.composition + '. ' : '', 'You have ', U.money(f.bank), ' at the start of that round.']),
    ].concat(extra);
    if (f.estimate) kids.push(U.rbeNote());
    if (sim.unknown.length) kids.push(h('p', { class: 'ti-alert-s' }, 'Not counted (no pop data yet): ' + sim.unknown.map((id) => C.tower(D, id).name).join(', ') + '.'));
    if (sim.lives != null) kids.push(livesLine());
    kids.push(fixBlock(f));
    kids.push(defenceLink(f.round));
    return box('', 'First problem', kids);
  }
  /* the fixes for "lives run out": the round (up to the one you run out on) that costs the most lives */
  function livesFixes() {
    let worst = null;
    sim.rows.forEach((x) => { if (x.r <= sim.lostAt && x.leakInfo && x.leakInfo.lives > 0 && (!worst || x.leakInfo.lives > worst.leakInfo.lives)) worst = x; });
    if (!worst) return null;
    const r = worst.r;
    const live = sim.insts.filter((i) => worst.live.indexOf(i.uid) >= 0).map((i) => ({ uid: i.uid, id: i.id, x: C.xAt(sim.steps, i, r), label: i.label }));
    const hero = sim.hero && sim.hero.placed <= r ? { id: sim.hero.id, level: worst.heroLevel, label: sim.hero.name } : null;
    const fixes = C.powerFixes(D, mode(), map(), r, live, hero, C.coverState(D, live, hero), 3, C.fxFor(plan.fx, mode()));
    fixes.forEach((fx) => { fx.affordable = fx.cost <= worst.avail + 0.5; });
    return { round: r, lives: worst.leakInfo.lives, fixes };
  }
  /* "Check my defence at R__": the towers live at that round, as you'd tap them in mid-game */
  function defenceLink(r) {
    const x = sim.rows[r - sim.start];
    if (!x) return null;
    const ts = sim.insts.filter((i) => x.live.indexOf(i.uid) >= 0).map((i) => i.id + '.' + C.xAt(sim.steps, i, r).join(''));
    if (!ts.length && !(sim.hero && sim.hero.placed <= r)) return null;
    let href = '../defence/#mode=' + plan.modeId + '&map=' + plan.mapId + '&round=' + r + (ts.length ? '&t=' + ts.slice(0, 20).join(',') : '');
    if (sim.hero && sim.hero.placed <= r) href += '&hero=' + sim.hero.id + '&hl=' + (x.heroLevel || 1);
    return h('p', { class: 'ti-alert-s' }, [h('a', { class: 'btn btn-small', href, id: 'sim-to-dfn' }, 'Check my defence at R' + r), ' the next 15 rounds with what you have then.']);
  }
  /* lives over the run, from the pop-power estimate */
  function livesLine() {
    const lost = sim.livesStart - (sim.lostAt ? 0 : sim.lives);
    const txt = sim.lostAt ? 'You run out of lives around R' + sim.lostAt + '. ' : lost > 0 ? 'About ' + C.int(lost) + ' of your ' + C.int(sim.livesStart) + ' lives leak by R' + sim.end + '. ' : 'Enough popping power for every round: no lives lost. ';
    const rough = sim.lostAt && sim.lostAt >= C.ROUGH_FROM ? 'From R' + C.ROUGH_FROM + ' this over-predicts leaks (no abilities yet). ' : '';
    return h('p', { class: 'ti-alert-s' }, [txt, rough, U.badge('calc', 'estimate'), ' ', h('a', { href: '../../guides/leak-check/' }, 'how it works')]);
  }
  /* hints already shown on this page (the same "Estimate from..." line is said once) */
  let hintSeen = null;
  function fixBlock(pr) {
    const hints = (pr.hints || []).filter((t) => { if (!hintSeen) return true; if (hintSeen[t]) return false; hintSeen[t] = 1; return true; });
    const ul = U.fixList(pr.fixes, { hints, hintLabel: pr.estimate ? 'Good to know' : null, empty: pr.estimate ? 'Nothing cheap fixes it on its own: add more towers or upgrades.' : null });
    Array.prototype.forEach.call(ul.children, (li, i) => {
      const fx = pr.fixes[i];
      if (!fx) return;
      const key = 'fix-' + pr.round + '-' + (pr.prop || 'lives') + '-' + i;
      if (fx.kind === 'hero') { li.appendChild(heroFixAction(fx, pr, key)); return; }
      li.appendChild(h('span', { class: 'ti-fix-a' }, h('button', { type: 'button', class: 'btn btn-small btn-grass', 'data-fk': key, 'data-fkb': 'sim-res', onclick: () => applyFix(sim, fx, pr.round) },
        fx.kind === 'upgrade' ? 'Upgrade' : 'Add')));
    });
    return ul;
  }
  /* a hero fix ("Quincy handles it from level 7, about R19"): place the hero earlier when you can, else say why not */
  function heroFixAction(fx, pr, key) {
    const hs = plan.steps.find((x) => x.op === 'hero');
    const a = range()[0];
    if (hs && hs.r > a) {
      return h('span', { class: 'ti-fix-a' }, h('button', { type: 'button', class: 'btn btn-small btn-grass', 'data-fk': key, 'data-fkb': 'sim-res', onclick: () => { hs.r = a; update(); } }, 'Place ' + fx.label + ' at R' + a));
    }
    const late = fx.round && fx.round >= pr.round;
    return h('span', { class: 'ti-fix-a ti-fix-why' }, h('small', null, late ? fx.label + ' is placed as early as the mode allows and still levels too late. Add a tower fix above.' : 'Nothing to buy: ' + fx.label + ' gets there by levelling.'));
  }

  /* ---------- timeline ---------- */
  function svg(tag, attrs, kids) {
    const el = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, attrs[k]));
    [].concat(kids || []).forEach((c) => { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function timelinePanel() {
    const rows = sim.rows;
    const n = rows.length;
    const col = n > 60 ? 12 : 16;
    const L = 52, R = 14, top = 40, ch = 150, covY = top + ch + 12, covH = 16;
    const W = L + n * col + R, H = covY + covH + 34;
    const maxV = Math.max(1000, ...rows.map((x) => x.avail), ...rows.map((x) => x.bank));
    const minV = Math.min(0, ...rows.map((x) => x.bank));
    const y = (v) => top + ch - ((v - minV) / (maxV - minV)) * ch;
    const cx = (r) => L + (r - sim.start) * col + col / 2;
    const g = svg('svg', { class: 'ti-tl', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      'aria-label': 'Cash and threats from R' + sim.start + ' to R' + sim.end + (sim.first ? '. First problem R' + sim.first.round + ': ' + sim.first.prop : '. No uncovered rounds.') });
    /* grid + y labels */
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = minV + (maxV - minV) * i / ticks;
      g.appendChild(svg('line', { class: 'grid', x1: L, x2: W - R, y1: y(v), y2: y(v) }));
      g.appendChild(svg('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end' }, C.money(v).replace(',000', 'k').replace(/\$(\d+),(\d)\d\d$/, '$$$1.$2k')));
    }
    if (minV < 0) g.appendChild(svg('rect', { class: 'neg', x: L, y: y(0), width: n * col, height: top + ch - y(0) }));
    g.appendChild(svg('line', { class: 'ax', x1: L, x2: W - R, y1: y(0), y2: y(0) }));
    /* lines */
    g.appendChild(svg('polyline', { class: 'cash', points: rows.map((x) => cx(x.r) + ',' + y(x.avail).toFixed(1)).join(' ') }));
    g.appendChild(svg('polyline', { class: 'bank', points: rows.map((x) => cx(x.r) + ',' + y(x.bank).toFixed(1)).join(' ') }));
    /* buys */
    sim.steps.forEach((s) => {
      if (s.bank == null || s.r < sim.start || s.r > sim.end) return;
      const bad = s.flags.some((f) => f.k === 'bad' || f.k === 'cash');
      const c = svg('circle', { class: bad ? 'buy-bad' : 'buy', cx: cx(s.r), cy: Math.max(top, Math.min(top + ch, y(s.bank))).toFixed(1), r: 5 });
      c.appendChild(svg('title', {}, 'R' + s.r + ' ' + s.label + ' ' + C.money(s.cost) + (bad ? ' (' + s.flags.map((f) => f.t).join('; ') + ')' : '')));
      g.appendChild(c);
    });
    /* threats along the top */
    let flip = 0;
    rows.forEach((x) => {
      if (x.danger < 2) return;
      const c = svg('circle', { class: x.danger >= 3 ? 'dng' : 'dng2', cx: cx(x.r), cy: 30, r: x.danger >= 3 ? 5 : 3.5 });
      c.appendChild(svg('title', {}, 'R' + x.r + ': ' + (x.note || x.composition)));
      g.appendChild(c);
      if (x.danger >= 3) { g.appendChild(svg('text', { class: 'mono', x: cx(x.r), y: flip ? 20 : 11, 'text-anchor': 'middle' }, 'R' + x.r)); flip = 1 - flip; }
    });
    /* coverage strip */
    rows.forEach((x) => {
      const needs = Object.keys(x.need).length > 0;
      const leaks = x.leakInfo && C.leakIsProblem(x.leak, x.leakInfo.rbe, sim.livesStart, x.leakInfo.lives);
      const cls = !needs ? 'cov-none' : x.missing.length || leaks ? 'cov-bad' : 'cov-ok';
      const rc = svg('rect', { class: cls, x: L + (x.r - sim.start) * col + 1, y: covY, width: col - 2, height: covH });
      rc.appendChild(svg('title', {}, 'R' + x.r + ': ' + (x.missing.length ? 'missing ' + x.missing.map((p) => C.NEED_LABEL[p]).join(', ') : leaks ? 'about ' + C.int(x.leak) + ' of ' + C.int(x.leakInfo.rbe) + ' RBE leaks (estimate)' : needs ? 'covered' : 'nothing new') + (x.lives != null ? ' · ' + C.int(x.lives) + ' lives' : '') + (x.heroLevel ? ' · hero L' + x.heroLevel + ' (est.)' : '')));
      g.appendChild(rc);
    });
    /* x labels */
    rows.forEach((x) => {
      if (x.r % 10 && x.r !== sim.start && x.r !== sim.end) return;
      g.appendChild(svg('text', { class: 'mono', x: cx(x.r), y: covY + covH + 16, 'text-anchor': 'middle' }, 'R' + x.r));
    });
    /* first problem */
    if (sim.first) {
      const fx = cx(sim.first.round);
      g.appendChild(svg('line', { class: 'first', x1: fx, x2: fx, y1: top - 4, y2: covY + covH }));
    }
    const wrap = h('div', { class: 'ti-tl-wrap', tabindex: '0', 'aria-label': 'Timeline, scrolls sideways' }, g);
    setTimeout(() => { if (sim && sim.first && wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = Math.max(0, cx(sim.first.round) - wrap.clientWidth / 2); }, 0);
    const legend = h('div', { class: 'ti-legend' }, [
      h('span', null, [h('i', { class: 'ti-key' }), 'Cash at round start']),
      h('span', null, [h('i', { class: 'ti-key ti-key-bank' }), 'Cash after your buys']),
      h('span', null, [h('i', { class: 'ti-key-sq', style: 'background:var(--ok)' }), 'Covered']),
      h('span', null, [h('i', { class: 'ti-key-sq', style: 'background:var(--danger)' }), 'Leaks']),
      h('span', null, [h('i', { class: 'ti-key-sq', style: 'background:var(--banana);border-radius:999px' }), 'Your buys']),
    ]);
    const short = sim.steps.filter((s) => s.short);
    const head = [h('h2', { class: 'panel-h', id: 'sim-tl-h' }, ['Timeline', h('small', null, 'R' + sim.start + ' to R' + sim.end)])];
    const stats = h('dl', { class: 'stats' }, [
      stat('Spent', C.money(sim.spent)),
      stat('Left at the end', C.money(sim.endBank)),
      stat('Steps you can\'t afford', String(short.length), short.length ? 'first: R' + short[0].r : 'none'),
      leakWait() ? stat('First leak', '…', 'checking leaks') : stat('First leak', sim.first ? 'R' + sim.first.round : 'none', sim.first ? C.NEED_LABEL[sim.first.prop] : ''),
      sim.lives != null ? stat('Lives at the end', sim.lostAt ? '0' : C.int(sim.lives), sim.lostAt ? 'out of lives at R' + sim.lostAt + ' (estimate)' : 'of ' + C.int(sim.livesStart) + ' (estimate)') : null,
    ]);
    return h('section', { class: 'panel', 'aria-labelledby': 'sim-tl-h' }, head.concat([stats, wrap, legend]));
  }
  function stat(label, v, sub) { return h('div', { class: 'stat' }, [h('dt', null, label), h('dd', { class: 'stat-v ti-num' }, v), sub ? h('dd', { class: 'stat-s' }, sub) : null]); }

  /* ---------- steps ---------- */
  function stepsPanel() {
    const res = {};
    sim.steps.forEach((s) => { res[s.uid] = s; });
    const list = sortedSteps();
    const ul = h('ol', { class: 'ti-steps' });
    list.forEach((s, i) => {
      const o = res[s.uid] || { label: s.op, flags: [], cost: 0 };
      const k = 'st-' + s.uid;
      const nb = list[i + 1] || list[i - 1]; /* after a delete, focus moves to the next step */
      const bad = o.flags.some((f) => f.k === 'bad' || f.k === 'cash');
      const sub = [];
      if (o.op === 'sell') sub.push('+' + C.money(o.refund) + ' back');
      else sub.push(C.money(o.cost));
      if (o.name) sub.push(o.name);
      if (o.bank != null) sub.push('then ' + C.money(o.bank));
      ul.appendChild(h('li', { class: 'ti-step' + (bad ? ' bad' : '') }, [
        h('span', { class: 'ti-step-r' }, [
          h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'One round earlier', 'data-fk': k + '-rm', 'data-fkb': k + '-rp', onclick: () => { s.r = clampR(s.r - 1); update(); } }, '−'),
          U.rchip(s.r, bad ? 'ti-r-danger' : ''),
          h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'One round later', 'data-fk': k + '-rp', 'data-fkb': k + '-rm', onclick: () => { s.r = clampR(s.r + 1); update(); } }, '+'),
        ]),
        h('span', { class: 'ti-step-m' }, [
          h('span', { class: 'ti-step-l' }, labelNode(o)),
          h('br'), h('span', { class: 'ti-step-s ti-num' }, sub.join(' · ')),
          o.flags.length ? h('span', { class: 'ti-step-f' }, [h('br'), o.flags.map((f) => f.t).join('; ')]) : null,
        ]),
        h('span', { class: 'ti-step-a' }, [
          h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Move up', 'data-fk': k + '-up', 'data-fkb': k + '-dn', disabled: i === 0 ? true : null, onclick: () => moveStep(s.uid, -1) }, '↑'),
          h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Move down', 'data-fk': k + '-dn', 'data-fkb': k + '-up', disabled: i === list.length - 1 ? true : null, onclick: () => moveStep(s.uid, 1) }, '↓'),
          h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Delete step', 'data-fk': k + '-del', 'data-fkb': nb ? 'st-' + nb.uid + '-del' : 'sim-add', onclick: () => removeStep(s.uid) }, '×'),
        ]),
      ]));
    });
    const body = [];
    if (!list.length) body.push(h('p', { class: 'ti-note ti-panel-b' }, 'No steps yet. Add the towers you place, round by round.'));
    else body.push(ul);
    body.push(sheet ? addSheet() : h('div', { class: 'ti-panel-b' }, h('button', { type: 'button', class: 'btn btn-grass ti-primary', id: 'sim-add', onclick: () => { openSheet('place'); focusSheet(); } }, '+ Add a step')));
    return h('section', { class: 'panel', 'aria-labelledby': 'sim-steps-h' }, [h('h2', { class: 'panel-h', id: 'sim-steps-h' }, ['Build steps', h('small', null, list.length + ' step' + (list.length === 1 ? '' : 's'))])].concat(body));
  }
  function labelNode(o) {
    if (o.op === 'up' && o.x) return [o.inst + ' to ', U.x(o.x)];
    if (o.op === 'place' && o.x && o.x.some((v) => v > 0)) return ['Place ' + o.inst + ' at ', U.x(o.x)];
    return o.label;
  }
  function liveAt(r) {
    return sim.insts.filter((i) => i.placedAt <= r && (i.soldAt == null || i.soldAt > r));
  }
  function openSheet(op) {
    const last = sortedSteps().slice(-1)[0];
    sheet = { op, r: last ? last.r : range()[0], t: null, x: [0, 0, 0], ref: null };
    render();
    const el = document.getElementById('sim-sheet');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }
  /* keyboard users land in the sheet they just opened */
  function focusSheet() { const b = document.querySelector('#sim-sheet [data-fk="sh-op-' + (sheet ? sheet.op : 'place') + '"]'); if (b) b.focus({ preventScroll: true }); }
  function addSheet() {
    const m = mode();
    const mult = m.costMult;
    const s = sheet;
    const ops = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Step type' }, [['place', 'Place a tower'], ['up', 'Upgrade'], ['sell', 'Sell']].map(([k, l]) =>
      h('button', { type: 'button', role: 'radio', 'data-fk': 'sh-op-' + k, 'aria-checked': String(s.op === k), onclick: () => { sheet = { op: k, r: s.r, t: null, x: [0, 0, 0], ref: null }; render(); } }, l)));
    const roundCtl = h('div', { class: 'ti-round' }, [
      h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Earlier round', 'data-fk': 'sh-rm', 'data-fkb': 'sh-rp', onclick: () => { s.r = clampR(s.r - 1); render(); } }, '−'),
      h('span', { class: 'ti-round-n', 'aria-live': 'polite' }, 'R' + s.r),
      h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Later round', 'data-fk': 'sh-rp', 'data-fkb': 'sh-rm', onclick: () => { s.r = clampR(s.r + 1); render(); } }, '+'),
    ]);
    const row = sim.rows.find((x) => x.r === s.r);
    const cashNow = row ? row.bank : 0;
    const kids = [ops, h('div', { class: 'ti-row' }, [h('div', { class: 'ti-field' }, [h('span', null, 'Round'), roundCtl]), h('p', { class: 'ti-note' }, ['Cash after your other buys at R' + s.r + ': ', U.money(cashNow)])])];
    let cost = 0, ready = false, note = null;
    if (s.op === 'place') {
      const st = strat();
      const placed = liveAt(s.r).map((i) => ({ id: i.id, x: i.x }));
      const sugs = MI.synergy(placed, ctxFor(placed));
      const pairIds = sugs.filter((x) => x.kind === 'pair' && x.tower).map((x) => x.tower);
      kids.push(h('p', { class: 'ti-note' }, [h('span', { class: 'ti-hint ti-hint-strong' }, 'Strong'), ' strong on this map · ', h('span', { class: 'ti-hint ti-hint-avoid' }, 'Avoid'), ' weak here · ', h('span', { class: 'ti-hint ti-hint-pair' }, 'Pairs'), ' goes well with your build']));
      kids.push(U.towerGrid(D, {
        label: 'Pick a tower', key: 'sh-t',
        pressed: (t) => s.t === t.id,
        issue: (t) => C.placeIssue(D, m, map(), t),
        cost: (t) => C.price(t.baseCost, mult),
        hint: (t) => [].concat(arr(st.strongTowers).indexOf(t.id) >= 0 ? [{ cls: 'strong', text: 'Strong' }] : [],
          arr(st.avoidTowers).indexOf(t.id) >= 0 ? [{ cls: 'avoid', text: 'Avoid' }] : [],
          pairIds.indexOf(t.id) >= 0 ? [{ cls: 'pair', text: 'Pairs' }] : []),
        onpick: (t) => { s.t = t.id; s.x = [0, 0, 0]; s.insta = false; render(); },
      }));
      if (s.t) {
        const t = C.tower(D, s.t);
        const mine = (me.instas || []).filter((i) => i.t === t.id);
        if (mine.length && !(m.rules && m.rules.noInsta)) {
          kids.push(h('div', { class: 'ti-field' }, [h('span', null, 'From your Insta Monkeys (free)'), h('div', { class: 'ti-share' }, mine.map((i) =>
            h('button', { type: 'button', class: 'tag ti-tipchip' + (s.insta && s.x.join('') === i.x.join('') ? ' tag-banana' : ''), 'data-fk': 'sh-ins-' + i.x.join(''), 'aria-pressed': String(!!(s.insta && s.x.join('') === i.x.join(''))),
              onclick: () => { s.x = i.x.slice(); s.insta = true; render(); } }, 'Insta ' + C.code(i.x) + ' ×' + i.n)))]));
        }
        kids.push(h('div', { class: 'ti-field' }, [h('span', null, t.name + (s.insta ? ' (Insta) at' : ' starts at')), U.pathSteppers(t, s.x, (nx) => { s.x = nx; s.insta = false; render(); }, { key: 'sh-x' })]));
        cost = s.insta ? 0 : C.placeCost(t, s.x, mult);
        ready = true;
      }
    } else if (s.op === 'up') {
      const live = liveAt(s.r);
      if (!live.length) note = 'Nothing is placed by R' + s.r + '. Place a tower first, or pick a later round.';
      else {
        if (!s.ref || !live.some((i) => i.uid === s.ref)) { s.ref = live[live.length - 1].uid; s.x = null; }
        const inst = live.find((i) => i.uid === s.ref);
        const curX = C.xAt(sim.steps, inst, s.r);
        if (!s.x || !C.geq(s.x, curX)) s.x = nextTier(curX);
        kids.push(U.field('Tower', U.select(live.map((i) => ({ value: i.uid, label: i.label + ' (' + C.code(C.xAt(sim.steps, i, s.r)) + ')' })), s.ref, (v) => { s.ref = v; s.x = null; render(); }, { id: 'sh-up-t' })));
        const t = C.tower(D, inst.id);
        kids.push(h('div', { class: 'ti-field' }, [h('span', null, ['Upgrade to ', U.x(s.x), ' from ', U.x(curX)]), U.pathSteppers(t, s.x, (nx) => { s.x = nx; render(); }, { min: curX, key: 'sh-x' })]));
        cost = C.upgradeCost(t, curX, s.x, mult);
        ready = s.x.join('') !== curX.join('');
      }
    } else {
      const live = liveAt(s.r);
      if (m.rules && m.rules.noSelling) note = 'You can\'t sell in ' + m.name + '.';
      else if (!live.length) note = 'Nothing to sell at R' + s.r + '.';
      else {
        if (!s.ref || !live.some((i) => i.uid === s.ref)) s.ref = live[0].uid;
        kids.push(U.field('Tower', U.select(live.map((i) => ({ value: i.uid, label: i.label })), s.ref, (v) => { s.ref = v; render(); }, { id: 'sh-sell-t' })));
        const inst = live.find((i) => i.uid === s.ref);
        const inv = sim.steps.filter((o) => o.inst === inst.label && (o.op === 'place' || o.op === 'up') && o.r <= s.r).reduce((a, o) => a + o.cost, 0);
        /* same rule as the Simulator: an Insta's value counts, Monkey Knowledge and Banana Salvage raise the rate */
        const worth = inv + (inst.insta ? num(inst.instaValue, 0) : 0);
        const rate = C.sellRateFor(D, num(sim.sellRate, C.SELL_RATE), inst.id, C.xAt(sim.steps, inst, s.r));
        kids.push(h('p', { class: 'ti-note' }, ['Sells for ', U.money(Math.round(worth * rate)), ' (' + Math.round(rate * 100) + '% of ', U.money(worth), inst.insta ? ', its value as an Insta' : '', ').']));
        ready = true;
      }
    }
    if (note) kids.push(h('p', { class: 'ti-note' }, note));
    const after = cashNow - cost;
    kids.push(h('div', { class: 'ti-share' }, [
      h('button', { type: 'button', class: 'btn btn-grass ti-primary', 'data-fk': 'sh-commit', 'data-fkb': 'sim-add', disabled: ready ? null : true, onclick: commitSheet },
        s.op === 'sell' ? 'Add sell step' : ready ? 'Add for ' + C.money(cost) : 'Add step'),
      h('button', { type: 'button', class: 'btn', 'data-fk': 'sh-cancel', 'data-fkb': 'sim-add', onclick: () => { sheet = null; render(); } }, 'Cancel'),
      ready && s.op !== 'sell' ? h('span', { class: 'ti-note' }, after < 0 ? ['Short by ', U.money(-after), ' at R' + s.r] : ['Leaves ', U.money(after)]) : null,
    ]));
    return h('div', { class: 'ti-add', id: 'sim-sheet' }, kids);
  }
  function nextTier(x) {
    const main = [0, 1, 2].reduce((b, p) => (x[p] > x[b] ? p : b), 0);
    const nx = C.setPath(x, main, Math.min(5, x[main] + 1));
    return C.geq(nx, x) ? nx : x.slice();
  }
  function commitSheet() {
    const s = sheet;
    sheet = null;
    if (s.op === 'place' && s.t) addStep(Object.assign({ op: 'place', t: s.t, x: s.x.slice(), r: s.r }, s.insta ? { insta: true } : {}));
    else if (s.op === 'up' && s.ref) addStep({ op: 'up', ref: s.ref, x: s.x.slice(), r: s.r });
    else if (s.op === 'sell' && s.ref) addStep({ op: 'sell', ref: s.ref, r: s.r });
    else render();
  }
  const arr = (v) => (Array.isArray(v) ? v : []);

  /* ---------- problems ---------- */
  /* every problem after the first (the first is in the box above), 3 at a time; the shared notes are said once */
  function problemsPanel() {
    const rest = sim.problems.slice(1);
    const show = showAllProblems ? rest : rest.slice(0, 3);
    const ul = h('ol', { class: 'ti-problems', start: '2' });
    show.forEach((p) => {
      ul.appendChild(h('li', { class: 'ti-prob' }, [
        h('div', { class: 'ti-prob-h' }, [U.rchip(p.round, 'ti-r-danger'), h('span', { class: 'ti-prob-t' }, [].concat(U.probText(p.text.charAt(0).toUpperCase() + p.text.slice(1), { noLink: true }), p.estimate ? [' ', U.badge('calc', 'estimate')] : [])),
          h('span', { class: 'ti-prob-n' }, p.rounds > 1 ? p.rounds + ' rounds need it, to R' + p.last : '')]),
        fixBlock(p),
      ]));
    });
    const more = rest.length > 3 ? h('div', { class: 'ti-panel-b' }, h('button', { type: 'button', class: 'btn btn-small', id: 'sim-prob-more', 'aria-expanded': String(showAllProblems),
      onclick: () => { showAllProblems = !showAllProblems; render(); } }, showAllProblems ? 'Show the first 3' : 'Show all ' + rest.length)) : null;
    return h('section', { class: 'panel', 'aria-labelledby': 'sim-prob-h' }, [h('h2', { class: 'panel-h', id: 'sim-prob-h', tabindex: '-1' }, ['More problems', h('small', null, rest.length + ' after the first, by round')]), ul, more]);
  }

  /* ---------- synergy ---------- */
  function ctxFor(placed) {
    const heroStep = plan.steps.find((s) => s.op === 'hero');
    const m = mode(), mp = map();
    const missing = {};
    sim.problems.forEach((p) => { missing[p.prop] = true; });
    const last = sim.rows[sim.rows.length - 1];
    return { modeId: m.id, endRound: m.endRound, heroId: heroStep ? heroStep.h : null, mapWater: mp && mp.water, mapLos: mp && mp.losBlockers,
      missing: Object.keys(missing), bonuses: last ? last.bonuses : {} };
  }
  function suggestPanel() {
    const end = sim.end;
    const placed = liveAt(end).map((i) => ({ id: i.id, x: i.x }));
    const list = placed.length ? MI.synergy(placed, ctxFor(placed)) : [];
    const body = list.length ? U.suggestionList(list, 6, (b) => { if (b.hero) { plan.steps = plan.steps.filter((x) => x.op !== 'hero'); addStep({ op: 'hero', h: b.hero, r: sim.start }); return; } const t = C.tower(D, b.id); addStep({ op: 'place', t: b.id, x: b.x, r: C.fixRound(sim, C.placeCost(t, b.x, C.mode(D, plan.modeId).costMult), sim.start) }); }) : h('p', { class: 'ti-note ti-panel-b' }, 'Place a few towers to see what pairs well with them.');
    return h('section', { class: 'panel', 'aria-labelledby': 'sim-syn-h' }, [h('h2', { class: 'panel-h', id: 'sim-syn-h' }, ['Pairs well', h('small', null, 'with what you placed')]), body]);
  }

  /* ---------- XP per run (collapsed) ---------- */
  function xpPanel() {
    const x = sim.xp;
    const ids = Object.keys(x.perTower).sort((p, q) => x.perTower[q].xp - x.perTower[p].xp);
    const tb = h('tbody');
    ids.forEach((id) => {
      const p = x.perTower[id];
      tb.appendChild(h('tr', null, [h('th', { scope: 'row' }, p.name), h('td', { class: 'n' }, C.int(p.xp)), h('td', { class: 'n' }, Math.round(p.share * 100) + '%')]));
    });
    /* the same two switches as My profile and My goals: changing one here changes it everywhere */
    const setMk = (k, v) => { if (P) P.update((st) => { st.settings[k] = v; }); render(); };
    const unset = P && P.get().settings.me == null;
    const opts = h('div', { class: 'ti-row' }, [
      h('label', { class: 'check' }, [h('input', { type: 'checkbox', id: 'sim-me', checked: plan.me ? true : null, disabled: x.mk ? null : true, onchange: (e) => setMk('me', e.target.checked) }), 'Monkey Education (+8%)']),
      h('label', { class: 'check' }, [h('input', { type: 'checkbox', id: 'sim-emt', checked: plan.emt ? true : null, disabled: x.mk ? null : true, onchange: (e) => setMk('emt', e.target.checked) }), 'Elite Military Training (Military +5%)']),
      h('p', { class: 'ti-note' }, [unset ? 'Not set yet, so counted as off. ' : '', 'Shared with ', h('a', { href: '../profile/#mk' }, 'My profile'), '.']),
    ]);
    const body = h('div', { class: 'ti-panel-b ti', style: 'padding-top:10px' }, [
      h('p', { class: 'ti-note' }, ['This run pays ', h('b', { class: 'ti-num' }, C.int(x.total) + ' XP'), ' (round XP × ' + x.mapMult + ' map tier' + (x.meMult > 1 ? ' × 1.08' : '') + '), split by the cash in each tower type every round. The hero takes none.' + (x.mk ? '' : ' Monkey Knowledge is off in this mode.')]),
      opts,
      ids.length ? h('div', { class: 'table-wrap table-flat' }, h('table', { class: 'tbl' }, [h('thead', null, h('tr', null, [h('th', null, 'Tower'), h('th', { class: 'n' }, 'XP this run'), h('th', { class: 'n' }, 'Share')])), tb])) : h('p', { class: 'ti-note' }, 'No towers yet.'),
      x.lost > 0 ? h('p', { class: 'ti-note' }, C.int(x.lost) + ' XP is lost on rounds where nothing is built.') : null,
      plan.steps.some((st) => st.op === 'place' && st.insta) ? h('p', { class: 'ti-note' }, ['Insta Monkeys cost $0 here, so the cash split gives them no XP. ', U.badge('unverified')]) : null,
      C.players(plan.players) > 1 ? h('p', { class: 'ti-note' }, ['In co-op the round\'s XP is split across every player\'s towers by cash spent, so yours get less than this when your partners build too. ', U.badge('unverified')]) : null,
      P && ids.length ? h('div', { class: 'ti-share' }, [
        h('button', { type: 'button', class: 'btn btn-small btn-grass', id: 'sim-log-xp', onclick: (e) => {
          const b = e.currentTarget;
          let saved = true;
          ids.forEach((id) => { if (P.logRun(id, Math.round(x.perTower[id].xp), 'Simulator: ' + (map() ? map().name : '') + ' ' + mode().name) === false) saved = false; });
          /* "Logged" only when it reached this browser's storage (private windows can refuse it) */
          b.textContent = saved ? 'Logged to My goals' : 'Not saved: this browser blocks storage';
          b.disabled = saved;
        } }, 'I played this: log the XP to My goals'),
        h('a', { class: 'ti-note', href: '../goals/' }, 'My goals'),
      ]) : null,
      h('p', { class: 'ti-note' }, h('a', { href: '../xp/' }, 'Plan a full unlock in the XP calculator')),
    ]);
    return h('details', { class: 'panel ti-details' }, [h('summary', { class: 'panel-h panel-h-light' }, ['Tower XP from this run', h('small', null, 'tap to open')]), body]);
  }

  loadInitial();
  try { history.replaceState(null, '', '#' + C.encodePlan(plan)); } catch (e) { /* ignore */ }
  render();
  window.addEventListener('hashchange', () => {
    if (location.hash.slice(1) === C.encodePlan(plan)) return;
    loadInitial(); render();
  });
})();
