/* Monkey Intel: round-timeline simulator (slug: simulator). Needs tools-data, map-tips, tools-core, synergy, tools-ui.
   A strategy lab: invent a build, try it round by round, see where it breaks. The Strategy Advisor (advisor.js) is the guided twin. */
(function () {
  'use strict';
  const MI = window.MonkeyIntel;
  const C = MI.core, U = MI.ui, h = U.h;
  const D = U.data();
  const root = document.getElementById('sim-root');
  if (!root) return;
  const KEY = 'mi-sim-v1';
  const NS = 'http://www.w3.org/2000/svg';

  /* ---------- state ---------- */
  let plan = { mapId: 'monkey-meadow', modeId: 'medium', steps: [], heroLevel: null, me: true, emt: false };
  let uidN = 0;
  const newUid = () => 'u' + (++uidN) + Date.now().toString(36).slice(-3);
  let sheet = null; /* add-step sheet state: {op, r, t, x, ref} */
  let presetLoaded = false;
  let stratOpen = null;
  let me = { fx: null, instas: [], instaMap: null, ownsHero: () => true }; /* map-ideas panel: null = open until the build has a few steps */

  const P = MI.progress || null;
  function loadInitial() {
    const hash = location.hash || '';
    const g = P && P.get().game; /* the last game you set up in any tool */
    if (g && !U.store.get(KEY)) { if (g.mapId && C.map(D, g.mapId)) plan.mapId = g.mapId; if (g.modeId && C.mode(D, g.modeId) && !C.isSandbox(C.mode(D, g.modeId))) plan.modeId = g.modeId; }
    if (/[#&](map|mode|b|tower|hero)=/.test(hash)) {
      const p = C.decodePlan(D, hash);
      plan.mapId = p.mapId || plan.mapId;
      plan.modeId = p.modeId || plan.modeId;
      plan.steps = p.steps;
      plan.heroLevel = p.heroLevel != null ? p.heroLevel : null;
      plan.players = p.players || 1;
      return;
    }
    const saved = U.store.get(KEY);
    if (saved && saved.hash) {
      const p = C.decodePlan(D, saved.hash);
      plan.mapId = p.mapId || plan.mapId;
      plan.modeId = p.modeId || plan.modeId;
      plan.steps = p.steps;
      plan.heroLevel = p.heroLevel != null ? p.heroLevel : null;
      plan.players = p.players || 1;
      if (typeof saved.me === 'boolean') plan.me = saved.me;
      if (typeof saved.emt === 'boolean') plan.emt = saved.emt;
    }
  }
  function persist() {
    const hash = C.encodePlan(plan);
    try { history.replaceState(null, '', '#' + hash); } catch (e) { /* file:// or sandbox */ }
    U.store.set(KEY, { hash, me: plan.me, emt: plan.emt });
    if (P) {
      P.setGame({ mapId: plan.mapId, modeId: plan.modeId });
      if (plan.steps.length) P.setPlan('simulator', { hash, label: (map() ? map().name : plan.mapId) + ', ' + (mode() ? mode().name : plan.modeId) + ', ' + plan.steps.length + ' step' + (plan.steps.length === 1 ? '' : 's') });
    }
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
    const step = C.fixStep(sim, f, needRound);
    if (step) addStep(step);
  }

  /* ---------- render ---------- */
  let sim = null;
  function update() { persist(); render(); }

  function render() {
    plan.unlocked = U.myUnlocks(); /* flags steps above what you have unlocked (not part of the share link) */
    me = U.me(D); /* My profile: Monkey Knowledge cash/hero effects and your Insta inventory */
    plan.fx = me.fx;
    plan.instas = me.instaMap;
    sim = C.simulate(D, plan);
    U.clear(root);
    const pv = U.previewNote(D);
    if (pv) root.appendChild(pv);
    root.appendChild(setupPanel());
    root.appendChild(stratPanel());
    root.appendChild(answer());
    root.appendChild(timelinePanel());
    root.appendChild(stepsPanel());
    if (sim.problems.length > 1) root.appendChild(problemsPanel());
    root.appendChild(suggestPanel());
    root.appendChild(xpPanel());
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
    const body = [h('div', { class: 'ti-row' }, kids), h('div', { class: 'ti-row' }, U.playersField(plan.players, (k) => { plan.players = k; update(); }, 'sim-pl')), facts, U.profileLine(D, m, me)];
    body.push(h('div', { class: 'ti-share' }, [
      h('button', { type: 'button', class: 'btn btn-small', onclick: (e) => copyLink(e.currentTarget) }, 'Copy share link'),
      plan.steps.length ? h('button', { type: 'button', class: 'btn btn-small', onclick: () => { if (window.confirm('Clear every step?')) { plan.steps = []; plan.heroLevel = null; update(); } } }, 'Start over') : null,
    ]));
    return h('section', { class: 'panel', 'aria-labelledby': 'sim-setup-h' }, [h('h2', { class: 'panel-h', id: 'sim-setup-h' }, 'Your game'), h('div', { class: 'ti-panel-b ti' }, body)]);
  }
  /* ---------- strategy ideas for the map ---------- */
  function advisorLink() {
    const heroStep = plan.steps.find((s) => s.op === 'hero');
    const ids = [];
    sim.insts.forEach((i) => { if (ids.indexOf(i.id) < 0) ids.push(i.id); });
    return '../advisor/#map=' + plan.mapId + '&mode=' + plan.modeId + '&hero=' + (heroStep ? heroStep.h : 'auto') + (ids.length ? '&t=' + ids.join(',') : '');
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
        onclick: () => { openSheet('place'); sheet.t = id; render(); const el = document.getElementById('sim-sheet'); if (el) el.scrollIntoView({ block: 'nearest' }); } }, '+ ' + t.name.replace(/ Monkey$/, ''));
    };
    const heroes = C.mapHeroes ? C.mapHeroes(D, plan.mapId) : [];
    const body = [h('dl', { class: 'chips-dl ti-tips-dl' }, [
      arr(s.strongTowers).length ? h('div', null, [h('dt', null, 'Strong here'), h('dd', null, arr(s.strongTowers).map(towerChip))]) : null,
      arr(s.avoidTowers).length ? h('div', null, [h('dt', null, 'Weak here'), h('dd', null, arr(s.avoidTowers).map((id) => { const t = C.tower(D, id); return t ? h('span', { class: 'tag' + (used.indexOf(id) >= 0 ? ' tag-danger' : '') }, t.name.replace(/ Monkey$/, '')) : null; }))]) : null,
      heroes.length ? h('div', null, [h('dt', null, 'Best heroes'), h('dd', null, heroes.map((hh) => h('button', { type: 'button', class: 'tag ti-tipchip' + (heroStep && heroStep.h === hh.id ? ' tag-banana' : ''), onclick: () => setHero(hh.id) }, hh.name)))]) : null,
    ])];
    const pl = U.planFor(tips, m);
    if (pl) body.push(h('div', null, [h('p', { class: 'ti-lbl' }, pl.label + ' from the map page'), U.stepList(pl.steps, 4)]));
    const kr = U.keyRounds(tips, a, b, 6);
    if (kr) body.push(h('div', null, [h('p', { class: 'ti-lbl' }, 'Key rounds'), kr]));
    const acts = [];
    if (preset) {
      acts.push(h('button', { type: 'button', class: 'btn btn-small', id: 'sim-preset', onclick: () => { const p = C.presetPlan(D, plan.mapId); if (p) { plan.modeId = p.modeId; plan.steps = p.steps; plan.heroLevel = null; presetLoaded = true; update(); } } }, 'Load the known CHIMPS start'));
      acts.push(U.badge('calc', 'calculated, not play-tested'));
      if (presetLoaded) acts.push(h('span', { class: 'ti-note' }, 'Loaded. Change anything and watch what breaks.'));
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

  function answer() {
    const f = sim.first;
    const cashBad = sim.steps.find((s) => s.short);
    if (!f) {
      const kids = [h('p', { class: 'ti-alert-t' }, 'Covered to R' + sim.end), h('p', { class: 'ti-alert-s' }, 'Every bloon type in this mode has an answer in your build, in time.')];
      if (sim.unknown.length) kids.push(h('p', { class: 'ti-alert-s' }, 'Not counted (no pop data yet): ' + sim.unknown.map((id) => C.tower(D, id).name).join(', ') + '.'));
      if (cashBad) kids.push(h('p', { class: 'ti-alert-s' }, ['But you can\'t afford every step: ', U.rchip(cashBad.r), ' ' + cashBad.label + ' is short by ' + C.money(cashBad.short) + '.']));
      return h('section', { class: 'ti-alert ' + (cashBad ? 'ti-alert-warn' : 'ti-alert-ok'), 'aria-label': 'Result' }, kids);
    }
    const kids = [
      h('p', { class: 'ti-alert-t' }, 'R' + f.round + ': ' + f.text),
      h('p', { class: 'ti-alert-s' }, [f.composition ? 'R' + f.round + ' is ' + f.composition + '. ' : '', 'You have ', U.money(f.bank), ' at the start of that round.']),
    ];
    if (sim.unknown.length) kids.push(h('p', { class: 'ti-alert-s' }, 'Not counted (no pop data yet): ' + sim.unknown.map((id) => C.tower(D, id).name).join(', ') + '.'));
    kids.push(fixBlock(f));
    return h('section', { class: 'ti-alert', 'aria-label': 'First problem' }, kids);
  }
  function fixBlock(pr) {
    const ul = U.fixList(pr.fixes, { hints: pr.hints });
    Array.prototype.forEach.call(ul.children, (li, i) => {
      const fx = pr.fixes[i];
      if (!fx || fx.kind === 'hero') return;
      li.appendChild(h('span', { class: 'ti-fix-a' }, h('button', { type: 'button', class: 'btn btn-small btn-grass', onclick: () => applyFix(sim, fx, pr.round) }, 'Add')));
    });
    return ul;
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
      const cls = !needs ? 'cov-none' : x.missing.length ? 'cov-bad' : 'cov-ok';
      const rc = svg('rect', { class: cls, x: L + (x.r - sim.start) * col + 1, y: covY, width: col - 2, height: covH });
      rc.appendChild(svg('title', {}, 'R' + x.r + ': ' + (x.missing.length ? 'missing ' + x.missing.map((p) => C.NEED_LABEL[p]).join(', ') : needs ? 'covered' : 'nothing new') + (x.heroLevel ? ' · hero L' + x.heroLevel + ' (est.)' : '')));
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
      stat('First leak', sim.first ? 'R' + sim.first.round : 'none', sim.first ? C.NEED_LABEL[sim.first.prop] : ''),
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
      const bad = o.flags.some((f) => f.k === 'bad' || f.k === 'cash');
      const sub = [];
      if (o.op === 'sell') sub.push('+' + C.money(o.refund) + ' back');
      else sub.push(C.money(o.cost));
      if (o.name) sub.push(o.name);
      if (o.bank != null) sub.push('then ' + C.money(o.bank));
      ul.appendChild(h('li', { class: 'ti-step' + (bad ? ' bad' : '') }, [
        h('span', { class: 'ti-step-r' }, [
          h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'One round earlier', onclick: () => { s.r = clampR(s.r - 1); update(); } }, '−'),
          U.rchip(s.r, bad ? 'ti-r-danger' : ''),
          h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'One round later', onclick: () => { s.r = clampR(s.r + 1); update(); } }, '+'),
        ]),
        h('span', { class: 'ti-step-m' }, [
          h('span', { class: 'ti-step-l' }, labelNode(o)),
          h('br'), h('span', { class: 'ti-step-s ti-num' }, sub.join(' · ')),
          o.flags.length ? h('span', { class: 'ti-step-f' }, [h('br'), o.flags.map((f) => f.t).join('; ')]) : null,
        ]),
        h('span', { class: 'ti-step-a' }, [
          h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Move up', disabled: i === 0 ? true : null, onclick: () => moveStep(s.uid, -1) }, '↑'),
          h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Move down', disabled: i === list.length - 1 ? true : null, onclick: () => moveStep(s.uid, 1) }, '↓'),
          h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Delete step', onclick: () => removeStep(s.uid) }, '×'),
        ]),
      ]));
    });
    const body = [];
    if (!list.length) body.push(h('p', { class: 'ti-note ti-panel-b' }, 'No steps yet. Add the towers you place, round by round.'));
    else body.push(ul);
    body.push(sheet ? addSheet() : h('div', { class: 'ti-panel-b' }, h('button', { type: 'button', class: 'btn btn-grass ti-primary', id: 'sim-add', onclick: () => openSheet('place') }, '+ Add a step')));
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
  function addSheet() {
    const m = mode();
    const mult = m.costMult;
    const s = sheet;
    const ops = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Step type' }, [['place', 'Place a tower'], ['up', 'Upgrade'], ['sell', 'Sell']].map(([k, l]) =>
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(s.op === k), onclick: () => { sheet = { op: k, r: s.r, t: null, x: [0, 0, 0], ref: null }; render(); } }, l)));
    const roundCtl = h('div', { class: 'ti-round' }, [
      h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Earlier round', onclick: () => { s.r = clampR(s.r - 1); render(); } }, '−'),
      h('span', { class: 'ti-round-n', 'aria-live': 'polite' }, 'R' + s.r),
      h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Later round', onclick: () => { s.r = clampR(s.r + 1); render(); } }, '+'),
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
        label: 'Pick a tower',
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
            h('button', { type: 'button', class: 'tag ti-tipchip' + (s.insta && s.x.join('') === i.x.join('') ? ' tag-banana' : ''), 'aria-pressed': String(!!(s.insta && s.x.join('') === i.x.join(''))),
              onclick: () => { s.x = i.x.slice(); s.insta = true; render(); } }, 'Insta ' + C.code(i.x) + ' ×' + i.n)))]));
        }
        kids.push(h('div', { class: 'ti-field' }, [h('span', null, t.name + (s.insta ? ' (Insta) at' : ' starts at')), U.pathSteppers(t, s.x, (nx) => { s.x = nx; s.insta = false; render(); })]));
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
        kids.push(U.field('Tower', U.select(live.map((i) => ({ value: i.uid, label: i.label + ' (' + C.code(C.xAt(sim.steps, i, s.r)) + ')' })), s.ref, (v) => { s.ref = v; s.x = null; render(); })));
        const t = C.tower(D, inst.id);
        kids.push(h('div', { class: 'ti-field' }, [h('span', null, ['Upgrade to ', U.x(s.x), ' from ', U.x(curX)]), U.pathSteppers(t, s.x, (nx) => { s.x = nx; render(); }, { min: curX })]));
        cost = C.upgradeCost(t, curX, s.x, mult);
        ready = s.x.join('') !== curX.join('');
      }
    } else {
      const live = liveAt(s.r);
      if (m.rules && m.rules.noSelling) note = 'You can\'t sell in ' + m.name + '.';
      else if (!live.length) note = 'Nothing to sell at R' + s.r + '.';
      else {
        if (!s.ref || !live.some((i) => i.uid === s.ref)) s.ref = live[0].uid;
        kids.push(U.field('Tower', U.select(live.map((i) => ({ value: i.uid, label: i.label })), s.ref, (v) => { s.ref = v; render(); })));
        const inst = live.find((i) => i.uid === s.ref);
        const inv = sim.steps.filter((o) => o.inst === inst.label && (o.op === 'place' || o.op === 'up') && o.r <= s.r).reduce((a, o) => a + o.cost, 0);
        kids.push(h('p', { class: 'ti-note' }, ['Sells for ', U.money(Math.round(inv * C.SELL_RATE)), ' (70% of ', U.money(inv), ').']));
        ready = true;
      }
    }
    if (note) kids.push(h('p', { class: 'ti-note' }, note));
    const after = cashNow - cost;
    kids.push(h('div', { class: 'ti-share' }, [
      h('button', { type: 'button', class: 'btn btn-grass ti-primary', disabled: ready ? null : true, onclick: commitSheet },
        s.op === 'sell' ? 'Add sell step' : ready ? 'Add for ' + C.money(cost) : 'Add step'),
      h('button', { type: 'button', class: 'btn', onclick: () => { sheet = null; render(); } }, 'Cancel'),
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
  function problemsPanel() {
    const ul = h('ol', { class: 'ti-problems' });
    sim.problems.forEach((p) => {
      ul.appendChild(h('li', { class: 'ti-prob' }, [
        h('div', { class: 'ti-prob-h' }, [U.rchip(p.round, 'ti-r-danger'), h('span', { class: 'ti-prob-t' }, p.text.charAt(0).toUpperCase() + p.text.slice(1)),
          h('span', { class: 'ti-prob-n' }, p.rounds > 1 ? p.rounds + ' rounds need it, to R' + p.last : '')]),
        fixBlock(p),
      ]));
    });
    return h('section', { class: 'panel', 'aria-labelledby': 'sim-prob-h' }, [h('h2', { class: 'panel-h', id: 'sim-prob-h' }, ['Problems', h('small', null, sim.problems.length + ', by round')]), ul]);
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
    const opts = h('div', { class: 'ti-row' }, [
      h('label', { class: 'check' }, [h('input', { type: 'checkbox', checked: plan.me ? true : null, disabled: x.mk ? null : true, onchange: (e) => { plan.me = e.target.checked; update(); } }), 'Monkey Education (+8%)']),
      h('label', { class: 'check' }, [h('input', { type: 'checkbox', checked: plan.emt ? true : null, disabled: x.mk ? null : true, onchange: (e) => { plan.emt = e.target.checked; update(); } }), 'Elite Military Training (Military +5%)']),
    ]);
    const body = h('div', { class: 'ti-panel-b ti', style: 'padding-top:10px' }, [
      h('p', { class: 'ti-note' }, ['This run pays ', h('b', { class: 'ti-num' }, C.int(x.total) + ' XP'), ' (round XP × ' + x.mapMult + ' map tier' + (x.meMult > 1 ? ' × 1.08' : '') + '), split by the cash in each tower type every round. The hero takes none.' + (x.mk ? '' : ' Monkey Knowledge is off in this mode.')]),
      opts,
      ids.length ? h('div', { class: 'table-wrap table-flat' }, h('table', { class: 'tbl' }, [h('thead', null, h('tr', null, [h('th', null, 'Tower'), h('th', { class: 'n' }, 'XP this run'), h('th', { class: 'n' }, 'Share')])), tb])) : h('p', { class: 'ti-note' }, 'No towers yet.'),
      x.lost > 0 ? h('p', { class: 'ti-note' }, C.int(x.lost) + ' XP is lost on rounds where nothing is built.') : null,
      C.players(plan.players) > 1 ? h('p', { class: 'ti-note' }, ['In co-op the round\'s XP is split across every player\'s towers by cash spent, so yours get less than this when your partners build too. ', U.badge('unverified')]) : null,
      P && ids.length ? h('div', { class: 'ti-share' }, [
        h('button', { type: 'button', class: 'btn btn-small btn-grass', id: 'sim-log-xp', onclick: (e) => {
          ids.forEach((id) => P.logRun(id, Math.round(x.perTower[id].xp), 'Simulator: ' + (map() ? map().name : '') + ' ' + mode().name));
          e.currentTarget.textContent = 'Logged to My goals';
          e.currentTarget.disabled = true;
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
