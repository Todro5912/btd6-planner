/* Monkey Intel: Strategy Advisor (slug: advisor). Needs tools-data, map-tips, tools-core, advisor-core, synergy, tools-ui.
   Pick a map, a mode, a hero and the monkeys you want to use; get crosspaths and jobs, a build order that is checked round by
   round in the Simulator's own run (cash, lives, pop power), what breaks and what to add, and map tips.
   Every line has an action, or says why there isn't one. */
(function () {
  'use strict';
  const MI = window.MonkeyIntel;
  const C = MI.core, U = MI.ui, h = U.h;
  const D = U.data();
  const root = document.getElementById('adv-root');
  if (!root) return;
  const busyEl = document.getElementById('adv-busy');
  const KEY = 'mi-adv-v1';
  const arr = (v) => (Array.isArray(v) ? v : []);
  const SHOW_PROBLEMS = 1; /* the first problem shown open with its fixes; the rest behind "Show N more" */
  const SHOW_STEPS = 14;

  let st = { mapId: 'monkey-meadow', modeId: 'medium', heroId: 'auto', towers: [], force: {}, mine: false, extras: [] };
  const P = MI.progress || null;
  let res = null;
  let me = { fx: null, ownsHero: () => true, instas: [], missing: {} };
  let note = null; /* one message from the last action ("not added: ...") */
  let ready = null; /* a result already worked out for the next render: {key, res} */

  function loadInitial() {
    const hash = location.hash || '';
    const saved = U.store.get(KEY);
    const fromLink = /[#&](map|mode|t|hero)=/.test(hash);
    /* a link from another page only says part of the game: fill the rest from the last game you set up anywhere */
    const g = P && P.get().game;
    if (g) { if (g.mapId && C.map(D, g.mapId)) st.mapId = g.mapId; if (g.modeId && C.mode(D, g.modeId)) st.modeId = g.modeId; }
    const src = fromLink ? hash : saved && saved.hash ? saved.hash : null;
    if (!src) return;
    /* a link never loses the picks you had: they're kept for "Back to my picks" (audit Q3) */
    if (fromLink && saved && saved.hash && saved.hash !== hash.replace(/^#/, '') && C.decodeAdvice(D, saved.hash).towers.length) prevHash = saved.hash;
    applyAdvice(src);
  }
  let prevHash = null;
  function applyAdvice(src) {
    const p = C.decodeAdvice(D, src);
    st.mapId = p.mapId || st.mapId;
    st.modeId = p.modeId || st.modeId;
    if (p.heroId !== undefined) st.heroId = p.heroId;
    st.towers = p.towers;
    st.force = p.force;
    st.mine = !!p.mine;
    st.noInsta = !!p.noInsta;
    st.players = p.players || 1;
    st.extras = p.extras || [];
  }
  function persist() {
    const hash = C.encodeAdvice(st);
    try { history.replaceState(null, '', '#' + hash); } catch (e) { /* file:// or sandbox */ }
    U.store.set(KEY, { hash });
    if (P) {
      P.setGame({ mapId: st.mapId, modeId: st.modeId, heroId: st.heroId, players: st.players || 1, from: 'advisor' });
      if (st.towers.length) P.setPlan('advisor', { hash, label: (map() ? map().name : st.mapId) + ', ' + (mode() ? mode().name : st.modeId) + ', ' + st.towers.length + ' monkey' + (st.towers.length === 1 ? '' : 's') });
    }
  }
  const mode = () => C.mode(D, st.modeId);
  const map = () => C.map(D, st.mapId);
  const strat = () => (D.strats || {})[st.mapId] || {};
  const copySt = (s) => Object.assign({}, s, { towers: s.towers.slice(), force: Object.assign({}, s.force), extras: arr(s.extras).map((e) => Object.assign({}, e)) });
  function adviseFor(s) {
    const mineAll = U.myUnlocks();
    return C.advise(D, { mapId: s.mapId, modeId: s.modeId, heroId: s.heroId, towers: s.towers, force: s.force, players: s.players,
      unlocked: s.mine ? mineAll : null, unlocks: mineAll, missing: me.missing, extras: s.extras,
      fx: me.fx, ownsHero: me.ownsHero, instas: s.noInsta ? [] : me.instas });
  }

  /* re-planning takes a moment on a phone: dim the result and say so, then work it out (Q6) */
  let pending = false;
  function setBusy(on) {
    root.setAttribute('aria-busy', on ? 'true' : 'false');
    root.classList.toggle('adv-busy', !!on);
    if (busyEl) busyEl.hidden = !on;
  }
  function update(keepNote) {
    if (!keepNote) note = null;
    persist();
    setBusy(true);
    if (pending) return;
    pending = true;
    const go = () => { pending = false; render(); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(go, 0)); else setTimeout(go, 0);
  }
  /* run a slow action (a re-plan) after the busy state has painted */
  function later(fn) {
    setBusy(true);
    const go = () => { try { fn(); } finally { if (!pending) setBusy(false); } };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(go, 0)); else setTimeout(go, 0);
  }

  function render() {
    me = U.me(D);
    const key = C.encodeAdvice(st) + '|' + (st.mine ? 1 : 0);
    res = ready && ready.key === key ? ready.res : adviseFor(st);
    ready = null;
    const focusId = document.activeElement && document.activeElement.id;
    U.clear(root);
    if (prevHash) {
      const back = C.decodeAdvice(D, prevHash);
      root.appendChild(h('div', { class: 'ti-notice', role: 'status' }, [h('p', null, 'This link replaced your picks (' + back.towers.length + ' monkey' + (back.towers.length === 1 ? '' : 's') + ').'),
        h('div', { class: 'ti-share' }, [
          h('button', { type: 'button', class: 'btn btn-small btn-grass', id: 'adv-nt-back', onclick: () => { const cur = C.encodeAdvice(st); applyAdvice(prevHash); prevHash = cur; persist(); render(); } }, 'Back to my picks'),
          h('button', { type: 'button', class: 'btn btn-small', id: 'adv-nt-keep', onclick: () => { prevHash = null; render(); } }, 'Keep this')])]));
    }
    root.appendChild(gamePanel());
    root.appendChild(picksPanel());
    if (res.picks.length) {
      root.appendChild(answer());
      root.appendChild(rolesPanel());
      root.appendChild(orderPanel());
      root.appendChild(gapsPanel());
    } else if (res.unusable.length || res.dropped.length) root.appendChild(gapsPanel());
    root.appendChild(tipsPanel());
    /* keep your place: the control you used keeps the focus (Q4) */
    if (focusId) { const el = document.getElementById(focusId); if (el && el.tagName !== 'INPUT') try { el.focus({ preventScroll: true }); } catch (e) { /* old browser */ } }
    setBusy(false);
  }

  /* ---------- inputs ---------- */
  function heroOpts() {
    /* show the hero the plan really uses: the same pick as C.advise (C.autoHero) */
    const own = res && res.hero && st.heroId === 'auto' ? res.hero : C.autoHero(D, C.map(D, st.mapId), (id) => me.ownsHero(id));
    return [{ value: 'auto', label: 'Pick for me' + (own ? ' (' + own.name + ')' : ''), keys: 'auto best' }].concat(U.heroOptions(D).map((o) => (o.value && !me.ownsHero(o.value) ? Object.assign({}, o, { label: o.label + ' (not owned)' }) : o)));
  }
  function gamePanel() {
    const m = mode();
    const [a, b] = C.modeRange(m);
    const kids = [
      U.field('Map', U.combo(U.mapOptions(D), st.mapId, (v) => { st.mapId = v; update(); }, { id: 'adv-map' }), 'ti-grow'),
      U.field('Mode', U.combo(U.modeOptions(D), st.modeId, (v) => { st.modeId = v; update(); }, { id: 'adv-mode' }), 'ti-grow'),
      U.field('Hero', U.combo(heroOpts(), st.heroId, (v) => { st.heroId = v; update(); }, { id: 'adv-hero' }), 'ti-grow'),
    ];
    const facts = h('p', { class: 'ti-note' }, [m.name + ': ', U.rchip(a, 'ti-r-plain'), ' to ', U.rchip(b, 'ti-r-plain'), U.startFact(m, st.players),
      ', prices ×' + m.costMult + ', ' + C.int(m.lives) + (m.lives === 1 ? ' life' : ' lives') + (m.rules && m.rules.noSelling ? ', no selling' : '') + (m.rules && m.rules.noIncomeTowers ? ', no farms' : '') + '.']);
    return h('section', { class: 'panel', 'aria-labelledby': 'adv-game-h' }, [h('h2', { class: 'panel-h', id: 'adv-game-h' }, 'Your game'),
      h('div', { class: 'ti-panel-b ti' }, [h('div', { class: 'ti-row' }, kids), h('div', { class: 'ti-row' }, U.playersField(st.players, (k) => { st.players = k; update(); }, 'adv-pl')), facts, U.profileLine(D, m, me)])]);
  }
  function instaRow() {
    if (!me.instas || !me.instas.length) return null;
    const m = mode();
    if (m.rules && m.rules.noInsta) return h('p', { class: 'ti-note' }, 'No Insta Monkeys in ' + m.name + '.');
    return h('div', { class: 'ti-share ti-mine' }, [
      h('label', { class: 'check' }, [h('input', { type: 'checkbox', id: 'adv-insta', checked: st.noInsta ? null : true, onchange: (e) => { st.noInsta = !e.target.checked; update(); } }), 'Use my Insta Monkeys']),
      h('span', { class: 'ti-note' }, st.noInsta ? 'Off: the plan pays for every tower.' : res && res.instaSaved ? 'Saves ' + C.money(res.instaSaved) + ' in this plan.' : 'None of your Instas fit these picks.'),
    ]);
  }
  function toggle(id) {
    const i = st.towers.indexOf(id);
    if (i >= 0) { st.towers.splice(i, 1); delete st.force[id]; st.extras = st.extras.filter((e) => e.t !== id); } else if (st.towers.length < C.ADVISE_MAX) st.towers.push(id);
    update();
  }
  function starter() {
    later(() => {
      const best = C.starterPicks(D, { mapId: st.mapId, modeId: st.modeId, heroId: st.heroId, players: st.players, missing: me.missing,
        unlocked: st.mine ? U.myUnlocks() : null, unlocks: U.myUnlocks(), fx: me.fx, ownsHero: me.ownsHero, instas: st.noInsta ? [] : me.instas });
      if (!best) return;
      st.towers = best.towers.slice();
      st.force = Object.assign({}, best.force);
      st.extras = [];
      note = best.source === 'map plan' ? 'Started from the ' + map().name + ' page\'s own plan: its towers at the crosspaths it ends on.' : 'Started from the towers that are strong on ' + map().name + '.';
      update(true);
    });
  }
  function picksPanel() {
    const s = strat();
    const m = mode(), mp = map();
    const full = st.towers.length >= C.ADVISE_MAX;
    const grid = U.towerGrid(D, {
      label: 'Pick the monkeys you want to use',
      pressed: (t) => st.towers.indexOf(t.id) >= 0,
      issue: (t) => C.placeIssue(D, m, mp, t) || (full && st.towers.indexOf(t.id) < 0 ? 'Up to ' + C.ADVISE_MAX + ' monkeys' : null),
      cost: (t) => C.price(t.baseCost, m.costMult),
      hint: (t) => [].concat(arr(s.strongTowers).indexOf(t.id) >= 0 ? [{ cls: 'strong', text: 'Strong' }] : [], arr(s.avoidTowers).indexOf(t.id) >= 0 ? [{ cls: 'avoid', text: 'Weak here' }] : [],
        me.missing && me.missing[t.id] ? [{ cls: 'avoid', text: 'Not unlocked' }] : [],
        me.instas && me.instas.some((i) => i.t === t.id) ? [{ cls: 'pair', text: 'Insta' }] : []),
      onpick: (t) => toggle(t.id),
    });
    const strongOk = arr(s.strongTowers).filter((id) => { const t = C.tower(D, id); return t && !C.placeIssue(D, m, mp, t); });
    const mineAll = U.myUnlocks();
    const tracked = mineAll ? st.towers.filter((id) => mineAll[id]) : [];
    const mineRow = P ? h('div', { class: 'ti-share ti-mine' }, mineAll ? [
      h('label', { class: 'check' }, [h('input', { type: 'checkbox', id: 'adv-mine', checked: st.mine ? true : null, onchange: (e) => { st.mine = e.target.checked; update(); } }), 'Only use upgrades I\'ve unlocked']),
      h('span', { class: 'ti-note' }, st.mine ? (tracked.length ? 'Using your unlocks for ' + tracked.map((id) => C.tower(D, id).name.replace(/ Monkey$/, '')).join(', ') + ', and in the fixes. Others: everything.' : 'None of your picks has saved unlocks yet.') : 'Fixes you haven\'t unlocked are labelled.'),
      h('a', { class: 'ti-note', href: '../profile/' }, 'Your unlocks'),
    ] : [h('span', { class: 'ti-note' }, ['Haven\'t unlocked every tier 5? Save your unlocks in ', h('a', { href: '../profile/' }, 'My profile'), ' and the Advisor can stick to them.'])]) : null;
    const bar = h('div', { class: 'ti-share' }, [
      h('span', { class: 'ti-note' }, [h('b', null, String(st.towers.length)), ' picked · up to ' + C.ADVISE_MAX]),
      st.towers.length ? h('button', { type: 'button', class: 'btn btn-small', onclick: () => { st.towers = []; st.force = {}; st.extras = []; update(); } }, 'Clear') : null,
      !st.towers.length && strongOk.length ? h('button', { type: 'button', class: 'btn btn-small btn-grass ti-wrap', id: 'adv-starter', onclick: starter }, 'Not sure? Start with what\'s strong here') : null,
    ]);
    const legend = h('p', { class: 'ti-note' }, [h('span', { class: 'ti-hint ti-hint-strong' }, 'Strong'), ' strong on this map · ', h('span', { class: 'ti-hint ti-hint-avoid' }, 'Weak here'), ' weak on this map. Tap to pick, tap again to drop.']);
    return h('section', { class: 'panel', 'aria-labelledby': 'adv-picks-h' }, [h('h2', { class: 'panel-h', id: 'adv-picks-h' }, ['Your monkeys', h('small', null, 'the ones you want to use')]),
      h('div', { class: 'ti-panel-b ti' }, [legend, grid, bar, mineRow, instaRow()])]);
  }

  /* ---------- result ---------- */
  function simLink(plan) { return '../simulator/#' + C.encodePlan(plan || res.plan); }
  function livesLine() {
    const v = res.verdict, sim = res.sim;
    if (sim.lives == null) return h('p', { class: 'ti-alert-s' }, 'Lives: not checked in ' + res.mode.name + ' (no leak check for these rounds).');
    const lost = Math.max(0, sim.livesStart - sim.lives);
    const txt = sim.lostAt ? 'Lives: all ' + C.int(sim.livesStart) + ' gone around R' + sim.lostAt + '.'
      : lost > 0 ? 'Lives: about ' + C.int(lost) + ' of your ' + C.int(sim.livesStart) + ' leak by R' + res.end + '.' : 'Lives: none lost, all ' + C.int(sim.livesStart) + ' kept.';
    return h('p', { class: 'ti-alert-s', id: 'adv-lives' }, [txt + ' ', U.badge('calc', 'estimate'), ' ', h('a', { href: '../../guides/leak-check/' }, 'how the leak check works'), v.rough ? ' From R' + C.ROUGH_FROM + ' it over-predicts leaks (abilities aren\'t counted yet).' : '']);
  }
  function answer() {
    const v = res.verdict;
    const btns = h('div', { class: 'ti-share' }, [
      h('a', { class: 'btn btn-grass ti-primary', href: simLink(), id: 'adv-to-sim' }, 'Open this plan in the Simulator'),
      h('button', { type: 'button', class: 'btn btn-small', onclick: (e) => copyLink(e.currentTarget) }, 'Copy link'),
    ]);
    const extra = [];
    if (note) extra.push(h('p', { class: 'ti-alert-s', id: 'adv-note', role: 'status' }, note));
    if (res.sim.randomRounds) extra.push(h('p', { class: 'ti-alert-s' }, res.mode.name + ' sends its rounds in a random order, so the round checks here use the standard order: a rough guide only.'));
    if (res.dropped.length) extra.push(h('p', { class: 'ti-alert-s' }, 'Up to ' + C.ADVISE_MAX + ' monkeys: ' + res.dropped.map((d) => d.name).join(', ') + (res.dropped.length > 1 ? ' were' : ' was') + ' left out of this plan. Drop a pick to use ' + (res.dropped.length > 1 ? 'them' : 'it') + '.'));
    if (res.extras.length) {
      extra.push(h('div', { class: 'ti-alert-s' }, ['Fixes you added: '].concat(res.extras.map((e, i) => h('span', { class: 'adv-extra' }, [
        e.kind === 'hero' ? 'place ' + (res.hero ? res.hero.name : 'your hero') + ' by R' + e.by : (e.kind === 'new' ? 'a ' : '') + C.tower(D, e.t).name.replace(/ Monkey$/, '') + ' ' + C.code(e.x) + ' by R' + e.by,
        ' ', h('button', { type: 'button', class: 'btn btn-small', onclick: () => { st.extras = st.extras.filter((x) => !(x.kind === e.kind && x.t === e.t && x.by === e.by && arr(x.x).join('') === arr(e.x).join(''))); update(); } }, 'Remove'), i < res.extras.length - 1 ? ' · ' : ''])))));
    }
    if (v.holds) {
      const left = res.leftovers.length;
      return h('section', { class: 'ti-alert ' + (left ? 'ti-alert-warn' : 'ti-alert-ok'), 'aria-label': 'Result' }, [
        h('p', { class: 'ti-alert-t' }, 'Holds to R' + res.end),
        h('p', { class: 'ti-alert-s' }, ['Every round in ' + res.mode.name + ' holds in the Simulator\'s own run of this order: every bloon type has an answer in time and the leak check says your towers pop enough. The build costs ', U.money(res.spent), ' of the ', U.money(res.budget + res.heroCost), ' this mode pays by R' + (res.end - Math.round((res.end - res.start) * 0.12)), '.']),
        livesLine(),
        left ? h('p', { class: 'ti-alert-s' }, ['Some upgrades don\'t fit in time: ', h('a', { href: '#adv-gaps-h' }, 'see what\'s left'), '.']) : null,
      ].concat(extra, [btns]));
    }
    const kinds = { power: 'not enough popping power', coverage: 'a bloon type you can\'t hit', lives: 'lives run out', cash: 'cash' };
    return h('section', { class: 'ti-alert', 'aria-label': 'First problem' }, [
      h('p', { class: 'ti-alert-t' }, v.text),
      h('p', { class: 'ti-alert-s' }, [h('b', null, 'Why: '), v.why || kinds[v.kind] || '']),
      res.verdict.round > res.start ? h('p', { class: 'ti-alert-s' }, 'The order holds every round before R' + v.round + '.') : null,
      livesLine(),
      h('p', { class: 'ti-alert-s' }, [h('a', { href: '#adv-gaps-h' }, 'What to add'), ': each fix has a button that adds it to the plan or tries it in the Simulator.']),
    ].concat(extra, [btns]));
  }
  function copyLink(btn) {
    const url = location.href.split('#')[0] + '#' + C.encodeAdvice(st);
    const done = () => { btn.textContent = 'Link copied'; setTimeout(() => { btn.textContent = 'Copy link'; }, 1600); };
    try { navigator.clipboard.writeText(url).then(done, () => window.prompt('Copy this link', url)); } catch (e) { window.prompt('Copy this link', url); }
  }
  const PROP = (p) => (p === 'income' ? 'Income' : p === 'pop' ? 'First defence' : p === 'power' ? 'Pop power' : p === 'fix' ? 'Your fix' : C.NEED_LABEL[p] || (String(p).charAt(0).toUpperCase() + String(p).slice(1)));
  function jobLine(p) {
    const parts = [];
    p.jobs.forEach((j) => { if (j.prop === 'pop') parts.push('first defence from R' + j.round); else parts.push(PROP(j.prop) + ' by R' + j.round); });
    return parts;
  }
  /* the latest round the hero can go down and still reach `level` by round r */
  function heroBy(level, r) {
    if (!res.hero) return null;
    const opts = C.heroOpts(res.fx);
    for (let p = r; p >= res.start; p--) if (C.heroLevelAt(D, res.hero.id, p, r, res.map.difficulty, opts) >= level) return p;
    return null;
  }
  function heroAction(level, r) {
    const p = heroBy(level, r);
    if (p == null) return h('span', { class: 'ti-note' }, ' Even placed at R' + res.start + ' he isn\'t level ' + level + ' by R' + r + ': add a tower from the fixes instead.');
    if (res.heroRound != null && res.heroRound <= p) return h('span', { class: 'ti-note' }, ' He is placed at R' + res.heroRound + ', in time.');
    return h('button', { type: 'button', class: 'btn btn-small btn-grass', onclick: () => addExtra([{ kind: 'hero', by: p }], 'Placing ' + res.hero.name + ' by R' + p) }, 'Place ' + res.hero.name + ' by R' + p);
  }
  function rolesPanel() {
    const ul = h('ul', { class: 'ti-placed ti-roles' });
    res.picks.forEach((p) => {
      const t = C.tower(D, p.id);
      const jobs = jobLine(p);
      const sel = U.select([{ value: '', label: 'Let the advisor choose' }].concat(p.options.map((o) => ({ value: o.x.join(''), label: C.code(o.x) + (o.name ? ' ' + o.name : '') + ' · ' + C.money(o.cost) + (o.mapPlan ? ' · map plan' : '') }))),
        p.forced ? p.x.join('') : '', (v) => { if (v) st.force[p.id] = v.split('').map(Number); else delete st.force[p.id]; update(); }, { 'aria-label': 'End crosspath for ' + p.name });
      ul.appendChild(h('li', { class: 'ti-card ti-role', id: 'adv-role-' + p.id }, [
        h('div', { class: 'ti-card-h' }, [h('a', { class: 'ti-card-t', href: U.towerHref(p.id) }, p.name), h('span', { class: 'ti-role-c' }, U.money(p.cost))]),
        h('div', { class: 'ti-role-x' }, [h('span', { class: 'ti-x ti-x-big' }, C.code(p.x)), h('span', { class: 'ti-role-n' }, p.xName || 'Base tower')]),
        U.pathPips(t, p.x),
        p.use ? h('p', { class: 'ti-role-u' }, [p.trimmedFrom ? 'Cheaper tier of ' + C.code(p.trimmedFrom) + ': ' : '', p.use]) : null,
        p.notUnlocked ? h('p', { class: 'ti-note ti-warn' }, ['Not unlocked yet (My profile): you picked it, so it stays in the plan. ', h('a', { href: '../profile/' }, 'Update My profile')]) : null,
        p.limited ? h('p', { class: 'ti-note' }, ['Kept to what you have unlocked. ', h('a', { href: '../goals/#add=' + p.id + '.all' }, 'Go for its tier 5s')]) : null,
        p.insta ? h('p', { class: 'ti-role-u' }, [h('span', { class: 'tag tag-sky' }, 'Insta'), ' Start with your ', U.x(p.insta.x), ' Insta Monkey: saves ', U.money(p.insta.save), '.']) : null,
        jobs.length ? h('p', { class: 'ti-role-j' }, [h('b', null, 'Job: '), jobs.join(' · ')]) : h('p', { class: 'ti-role-j' }, [h('b', null, 'Job: '), 'damage and back-up']),
        h('p', { class: 'ti-role-p' }, [h('span', { class: 'ti-lbl' }, 'Hits'), ' '].concat(p.own.filter((x) => ['camo', 'lead', 'purple', 'black', 'white', 'moab', 'ddt'].indexOf(x) >= 0).map((x) => h('span', { class: 'pop pop-y' }, PROP(x))),
          p.own.length ? [] : [h('span', { class: 'ti-note' }, 'nothing on its own: a support tower')])),
        p.gives.length ? h('p', { class: 'ti-role-p' }, [h('span', { class: 'ti-lbl' }, 'Gives towers in range'), ' '].concat(p.gives.map((x) => h('span', { class: 'pop pop-y ti-pop-sup' }, PROP(x))))) : null,
        h('p', { class: 'ti-note' }, p.placedAt ? ['Place ', U.rchip(p.placedAt, 'ti-r-plain'), p.doneAt ? [', finished ', U.rchip(p.doneAt, 'ti-r-plain')] : ', not finished in time: pick a cheaper end crosspath below'] : 'Not placed: no cash for it in this mode. Pick a cheaper end crosspath below, or drop it.'),
        p.copies.length ? h('p', { class: 'ti-note' }, ['For pop power the order adds ' + p.copies.length + ' more: ', p.copies.map((c) => C.code(c.x) + (c.placedAt ? ' at R' + c.placedAt : '') + (c.fix ? ' (your fix)' : '')).join(', '), '.']) : null,
        p.timing ? h('details', { class: 'ti-role-more' }, [h('summary', null, 'When players usually buy it'), h('p', { class: 'ti-note' }, U.richText(p.timing))]) : null,
        U.field('End crosspath', sel),
      ]));
    });
    if (res.hero) {
      const hb = C.hero(D, res.hero.id);
      const jobs = arr(res.heroJobs).map((j) => (j.ok ? h('span', null, PROP(j.prop) + ' by R' + j.round + ' (level ' + j.level + ')') : h('span', null, [PROP(j.prop) + (j.from ? ' from R' + j.from : ' too late') + ' (needed by R' + j.round + ')', j.level ? heroAction(j.level, j.round) : null])));
      ul.appendChild(h('li', { class: 'ti-card ti-role ti-role-hero' }, [
        h('div', { class: 'ti-card-h' }, [h('span', { class: 'ti-card-t' }, res.hero.name), h('span', { class: 'ti-role-c' }, U.money(res.heroCost))]),
        h('p', { class: 'ti-role-u' }, ['Hero: ' + res.heroWhy + '. ', hb && hb.bestFor ? U.richText(hb.bestFor) : '']),
        jobs.length ? h('p', { class: 'ti-role-j' }, [h('b', null, 'Job: ')].concat(jobs.map((j, i) => [j, i < jobs.length - 1 ? ' · ' : '']))) : null,
        h('p', { class: 'ti-note' }, res.heroRound ? ['Place ', U.rchip(res.heroRound, 'ti-r-plain'), '. Levels are an estimate.'] : 'Not placed: no cash for him in time. Pick "No hero" or cheaper end crosspaths.'),
        hb && hb.camo ? h('p', { class: 'ti-note' }, 'Camo: ' + hb.camo) : null,
      ]));
    } else if (st.heroId && res.heroWhy && !res.hero) {
      ul.appendChild(h('li', { class: 'ti-card ti-role ti-role-hero' }, [h('p', { class: 'ti-note' }, 'Hero: ' + res.heroWhy + ', so the plan has no hero. Pick another one above.')]));
    }
    return h('section', { class: 'panel', 'aria-labelledby': 'adv-roles-h' }, [h('h2', { class: 'panel-h', id: 'adv-roles-h' }, ['How to use each monkey', h('small', null, 'crosspath and job')]), h('div', { class: 'ti-panel-b' }, ul)]);
  }
  /* what a step buys (T13): "Druid #1: buy Druidic Reach (1-0-1)" */
  function stepLabel(s) {
    if (s.op === 'hero') return 'Place ' + s.label;
    if (s.op === 'place') return [(s.insta ? 'Insta ' : 'Place ') + s.label, s.x.some((v) => v > 0) ? [' with ' + (s.buyText || 'upgrades') + ' (', U.x(s.x), ')'] : null, s.insta ? ' (free)' : null];
    return [s.label + ': buy ' + (s.buyText || 'the upgrade') + ' (', U.x(s.x), ')'];
  }
  function stepLi(s) {
    const sub = [C.money(s.cost)];
    if (s.bank != null) sub.push('then ' + C.money(s.bank));
    return h('li', { class: 'ti-step' }, [
      h('span', { class: 'ti-step-r' }, U.rchip(s.r)),
      h('span', { class: 'ti-step-m' }, [h('span', { class: 'ti-step-l' }, stepLabel(s)), h('br'), h('span', { class: 'ti-step-s ti-num' }, sub.join(' · '))]),
      h('span', { class: 'ti-step-a ti-due' }, arr(s.due).map((d) => h('span', { class: 'ti-hint ' + (d.prop === 'income' ? 'ti-hint-strong' : 'ti-hint-pair') }, d.by ? PROP(d.prop) + ' by R' + d.by : PROP(d.prop)))),
    ]);
  }
  function orderPanel() {
    const ol = h('ol', { class: 'ti-steps ti-order-list' });
    res.steps.slice(0, SHOW_STEPS).forEach((s) => ol.appendChild(stepLi(s)));
    const rest = res.steps.slice(SHOW_STEPS);
    const more = rest.length ? h('details', { class: 'ti-details adv-more' }, [h('summary', null, ['Show the other ' + rest.length + ' buys ', h('small', null, 'R' + rest[0].r + ' to R' + rest[rest.length - 1].r)]),
      h('ol', { class: 'ti-steps ti-order-list', start: String(SHOW_STEPS + 1) }, rest.map(stepLi))]) : null;
    return h('section', { class: 'panel', 'aria-labelledby': 'adv-order-h' }, [
      h('h2', { class: 'panel-h', id: 'adv-order-h' }, ['Build order', h('small', null, res.steps.length + ' buys')]),
      h('p', { class: 'ti-note ti-panel-b', style: 'margin-top:10px' }, 'Buy in this order. Tags show what a buy is for: a bloon type by its round, Pop power for a round that would leak, Income for farms. Cash is after each buy, as the Simulator counts it.'),
      ol, more,
      h('div', { class: 'ti-panel-b ti-share' }, [h('a', { class: 'btn btn-small', href: simLink() }, 'Tweak it in the Simulator')]),
    ]);
  }

  /* ---------- fixes: every one gets an action ---------- */
  /* a fix as plan extras (bought by the round of the problem) */
  function extrasFor(f, round) {
    if (!f) return [];
    if (f.kind === 'pair') return [].concat(...arr(f.parts).map((p) => extrasFor(p, round)));
    if (f.kind === 'hero') { const p = heroBy(f.level, round); return p == null ? [] : [{ kind: 'hero', by: p }]; }
    if (f.kind === 'upgrade') {
      const m = /^p(\d+)$/.exec(f.uid || '');
      const orig = m && +m[1] < res.picks.length;
      return [{ kind: orig ? 'up' : 'new', t: f.towerId, x: f.x.slice(), by: round }];
    }
    return [{ kind: 'new', t: f.towerId, x: f.x.slice(), by: round }];
  }
  const firstBad = (r) => (r.verdict && r.verdict.holds ? Infinity : r.verdict && r.verdict.round != null ? r.verdict.round : 0);
  /* add fixes to the plan and re-plan; never make the first problem earlier (T5) */
  function addExtra(ex, what) {
    if (!ex.length) return;
    later(() => {
      const s2 = copySt(st);
      ex.forEach((e) => {
        if (e.t && s2.towers.indexOf(e.t) < 0) s2.towers.push(e.t);
        if (!s2.extras.some((x) => x.kind === e.kind && x.t === e.t && arr(x.x).join('') === arr(e.x).join(''))) s2.extras.push(e);
      });
      if (s2.towers.length > C.ADVISE_MAX) { note = 'Up to ' + C.ADVISE_MAX + ' monkeys: drop one first.'; update(true); return; }
      const r2 = adviseFor(s2);
      const was = firstBad(res), now = firstBad(r2);
      if (now < was) {
        note = what + ' would make the plan break at R' + now + ' instead of R' + was + ', so it wasn\'t added. Try it in the Simulator to see why.';
        update(true);
        return;
      }
      st = s2;
      ready = { key: C.encodeAdvice(st) + '|' + (st.mine ? 1 : 0), res: r2 };
      note = what + ' added. ' + (now === Infinity ? 'The plan now holds to R' + r2.end + '.' : now > was ? 'The plan now holds to R' + (now - 1) + ' (was R' + (was - 1) + ').' : 'The first problem is still at R' + now + '.');
      update(true);
    });
  }
  /* open the Simulator with the fix: the better of a re-plan around it and the plan with the fix slotted in (T4, T6) */
  function trySim(f, round) {
    later(() => {
      const s2 = copySt(st);
      const ex = extrasFor(f, round);
      ex.forEach((e) => { if (e.t && s2.towers.indexOf(e.t) < 0 && s2.towers.length < C.ADVISE_MAX) s2.towers.push(e.t); s2.extras.push(e); });
      const opts = [];
      if (ex.length) { const r2 = adviseFor(s2); opts.push({ plan: r2.plan, held: firstBad(r2) }); }
      const ap = C.applyFix(D, res.plan, f, round);
      const sim = C.simulate(D, ap.plan);
      opts.push({ plan: ap.plan, held: firstBad({ sim, verdict: C.adviceVerdict({ sim, end: res.end, start: res.start }) }) });
      opts.sort((p, q) => q.held - p.held);
      location.href = simLink(opts[0].plan);
    });
  }
  function fixLine(f, pr) {
    const t = f.towerId && C.tower(D, f.towerId);
    const kind = { upgrade: 'Upgrade a tower you have', new: 'Add a tower', support: 'Add support', hero: 'Your hero', pair: 'Two buys together' }[f.kind] || '';
    const label = f.kind === 'hero' ? f.label + ' handles it from level ' + f.level + (f.round ? ', about R' + f.round : '') : (f.buyLabel || C.fixLabel(D, f));
    const facts = [];
    if (f.kind !== 'hero') {
      if (pr.estimate) facts.push(f.fixes ? 'stops the leak' : 'cuts it to about ' + C.int(f.left) + ' RBE');
      facts.push(f.inTime ? 'you can pay for it by R' + f.at : f.affordable === false ? 'more than you have by R' + pr.round : 'needs cash the plan spends before R' + pr.round + ' (adding it re-plans around it)');
    }
    if (f.note) facts.push(f.note);
    const acts = [];
    if (f.kind === 'hero') acts.push(heroAction(f.level, pr.round));
    else {
      const ex = extrasFor(f, pr.round);
      const newT = ex.filter((e) => e.t && st.towers.indexOf(e.t) < 0).map((e) => e.t).filter((x, i, a2) => a2.indexOf(x) === i);
      const room = st.towers.length + newT.length <= C.ADVISE_MAX;
      if (room) acts.push(h('button', { type: 'button', class: 'btn btn-small btn-grass', onclick: () => addExtra(ex, newT.length ? 'Adding ' + newT.map((x) => C.tower(D, x).name).join(' and ') : 'This fix') }, newT.length ? 'Add to my picks' : 'Add to my plan'));
      else acts.push(h('span', { class: 'ti-note' }, C.ADVISE_MAX + ' monkeys already: drop one to add this here. '));
      /* the link works without the click handler too: the plan with the fix's buys slotted in */
      const steps = C.fixSteps(res.sim, f, pr.round).map((s2, i) => Object.assign({ uid: 'fx' + (i + 1) }, s2));
      acts.push(h('a', { class: 'btn btn-small' + (room ? '' : ' btn-grass'), href: simLink(Object.assign({}, res.plan, { steps: res.plan.steps.concat(steps) })), onclick: (e) => { e.preventDefault(); trySim(f, pr.round); } }, 'Try in the Simulator'));
    }
    return h('li', null, [
      h('span', null, [h('span', { class: 'ti-fix-k' }, kind), h('span', { class: 'ti-fix-l' }, [t && f.kind !== 'pair' ? h('a', { href: U.towerHref(t.id), class: 'adv-tlink' }, label) : label]),
        facts.length ? h('span', { class: 'ti-fix-n ti-note' }, [' ' + facts.join(' · ')]) : null]),
      h('span', { class: 'ti-fix-c' }, f.kind === 'hero' ? h('small', null, 'estimate') : U.money(f.cost)),
      h('span', { class: 'ti-fix-a' }, acts),
    ]);
  }
  function fixBlock(pr, hintsSeen) {
    const ul = h('ul', { class: 'ti-fixes' });
    const fixes = pr.fixes;
    fixes.forEach((f) => ul.appendChild(fixLine(f, pr)));
    if (!fixes.length) ul.appendChild(h('li', null, [h('span', { class: 'ti-fix-l' }, pr.estimate ? 'Nothing you could buy by then stops it on its own (an estimate): add more towers to your picks, or start earlier with cheaper crosspaths.' : 'No fix in the data for this mode.'), h('span'),
      h('span', { class: 'ti-fix-a' }, h('a', { class: 'btn btn-small', href: simLink() }, 'Work on it in the Simulator'))]));
    /* hints once per panel, not once per problem (E17) */
    arr(pr.hints).forEach((t2) => { if (hintsSeen.indexOf(t2) < 0) hintsSeen.push(t2); });
    return ul;
  }
  function probLi(p, hintsSeen) {
    return h('li', { class: 'ti-prob', id: 'adv-prob-' + p.round + '-' + p.prop }, [
      h('div', { class: 'ti-prob-h' }, [U.rchip(p.round, 'ti-r-danger'), h('span', { class: 'ti-prob-t' }, [p.text.charAt(0).toUpperCase() + p.text.slice(1), p.estimate ? ' ' : null, p.estimate ? U.badge('calc', 'estimate') : null]),
        h('span', { class: 'ti-prob-n' }, p.rounds > 1 ? p.rounds + ' rounds need it, to R' + p.last : '')]),
      fixBlock(p, hintsSeen),
    ]);
  }
  /* a leftover's way out: the dearest end crosspath that fits the cash the plan did find for it */
  function cheaperBtn(l) {
    const pk = res.picks.find((p) => p.id === l.id);
    if (!pk) return null;
    const fits = pk.options.filter((o) => o.cost <= pk.cost - l.cost && o.x.join('') !== pk.x.join('')).sort((a, b) => b.cost - a.cost)[0]
      || pk.options.filter((o) => o.cost < pk.cost).sort((a, b) => a.cost - b.cost)[0];
    if (!fits) return null;
    return h('button', { type: 'button', class: 'btn btn-small btn-grass', onclick: () => { st.force[pk.id] = fits.x.slice(); update(); } }, ['Use ', C.code(fits.x), ' instead']);
  }
  function gapsPanel() {
    const body = [];
    const sim = res.sim;
    const hintsSeen = [];
    if (sim && sim.problems.length) {
      const probs = sim.problems;
      const ul = h('ol', { class: 'ti-problems' });
      probs.slice(0, SHOW_PROBLEMS).forEach((p) => ul.appendChild(probLi(p, hintsSeen)));
      body.push(ul);
      const rest = probs.slice(SHOW_PROBLEMS);
      if (rest.length) {
        /* the rest, worked out when you open them (each one's fixes are a search) */
        const inner = h('ol', { class: 'ti-problems', start: String(SHOW_PROBLEMS + 1) });
        const det = h('details', { class: 'ti-details adv-more', id: 'adv-more-probs' }, [h('summary', null, ['Show ' + rest.length + ' more problem' + (rest.length > 1 ? 's' : '') + ' ', h('small', null, 'R' + rest[0].round + ' to R' + rest[rest.length - 1].last)]), inner]);
        let filled = false;
        det.addEventListener('toggle', () => {
          if (!det.open || filled) return;
          filled = true;
          const seen = hintsSeen.slice();
          rest.forEach((p) => inner.appendChild(probLi(p, seen)));
          seen.filter((x) => hintsSeen.indexOf(x) < 0).forEach((x) => inner.appendChild(h('li', { class: 'ti-fix-hint ti-note' }, x)));
        });
        body.push(h('div', { class: 'ti-panel-b' }, det));
      }
      if (hintsSeen.length) body.push(h('div', { class: 'ti-panel-b' }, [h('p', { class: 'ti-lbl' }, 'Good to know'), h('ul', { class: 'bullets' }, hintsSeen.map((x) => h('li', null, x)))]));
    }
    if (res.leftovers.length) {
      body.push(h('div', { class: 'ti-panel-b' }, [h('p', { class: 'ti-lbl' }, 'No cash for these by R' + res.end),
        h('ul', { class: 'bullets' }, res.leftovers.map((l) => h('li', null, l.hero ? [l.label + ' (', U.money(l.cost), '). ', h('button', { type: 'button', class: 'btn btn-small', onclick: () => { st.heroId = ''; update(); } }, 'Plan with no hero')]
          : [l.label + ' to ', U.x(l.want), ' (', U.money(l.cost), ' more). ', cheaperBtn(l) || h('a', { href: '#adv-role-' + l.id }, 'Pick a cheaper end crosspath')])))]));
    }
    if (res.unusable.length) {
      body.push(h('div', { class: 'ti-panel-b' }, [h('p', { class: 'ti-lbl' }, 'Can\'t use here'),
        h('ul', { class: 'bullets' }, res.unusable.map((u) => h('li', null, [u.name + ': ' + u.issue + '. ', h('button', { type: 'button', class: 'btn btn-small', onclick: () => toggle(u.id) }, 'Remove')])))]));
    }
    if (res.dropped.length) {
      body.push(h('div', { class: 'ti-panel-b' }, [h('p', { class: 'ti-lbl' }, 'Left out (up to ' + C.ADVISE_MAX + ' monkeys)'),
        h('ul', { class: 'bullets' }, res.dropped.map((u) => h('li', null, [u.name + '. ', h('button', { type: 'button', class: 'btn btn-small', onclick: () => toggle(u.id) }, 'Remove from picks')])))]));
    }
    if (!body.length) {
      body.push(h('p', { class: 'ti-note ti-panel-b', style: 'margin-top:10px' }, 'Nothing to fix. Every round holds in the Simulator\'s own run: your monkeys hit every bloon type in time and the leak check (an estimate) says they pop enough. Placement still matters: check the key rounds in the Simulator.'));
    }
    const n = (sim ? sim.problems.length : 0) + res.leftovers.length + res.unusable.length + res.dropped.length;
    return h('section', { class: 'panel', 'aria-labelledby': 'adv-gaps-h' }, [h('h2', { class: 'panel-h', id: 'adv-gaps-h' }, ['What breaks and what to add', h('small', null, n ? n + ' to fix' : 'none')])].concat(body));
  }
  function chip(id, picked, weak) {
    const t = C.tower(D, id);
    if (!t) return null;
    const m = mode(), mp = map();
    const issue = C.placeIssue(D, m, mp, t);
    const full = !picked && st.towers.length >= C.ADVISE_MAX;
    return h('button', { type: 'button', class: 'tag ti-tipchip' + (picked ? (weak ? ' tag-danger' : ' tag-banana') : ''), 'aria-pressed': String(!!picked), disabled: issue || full ? true : null,
      title: issue || (full ? 'Up to ' + C.ADVISE_MAX + ' monkeys' : picked ? 'In your picks: tap to drop' : weak ? 'Weak on this map: tap to add it anyway' : 'Add to your picks'), onclick: () => toggle(id) },
    (picked ? '✓ ' : '+ ') + t.name.replace(/ Monkey$/, ''));
  }
  function tipsPanel() {
    const s = strat();
    const mp = map(), m = mode();
    const tips = U.tips(st.mapId);
    const [a, b] = C.modeRange(m);
    const body = [];
    const strong = arr(s.strongTowers);
    const weakPicked = st.towers.filter((id) => arr(s.avoidTowers).indexOf(id) >= 0);
    body.push(h('dl', { class: 'chips-dl ti-tips-dl' }, [
      strong.length ? h('div', null, [h('dt', null, 'Strong here'), h('dd', null, strong.map((id) => chip(id, st.towers.indexOf(id) >= 0, false)))]) : null,
      arr(s.avoidTowers).length ? h('div', null, [h('dt', null, 'Weak here'), h('dd', null, arr(s.avoidTowers).map((id) => chip(id, st.towers.indexOf(id) >= 0, true)))]) : null,
      C.mapHeroes(D, st.mapId).length ? h('div', null, [h('dt', null, 'Best heroes'), h('dd', null, C.mapHeroes(D, st.mapId).map((hh) => {
        const issue = C.heroIssue(D, mp, hh);
        return h('button', { type: 'button', class: 'tag ti-tipchip' + (res.hero && res.hero.id === hh.id ? ' tag-banana' : ''), disabled: issue ? true : null, title: issue || null, onclick: () => { st.heroId = hh.id; update(); } }, hh.name + (me.ownsHero(hh.id) ? '' : ' (not owned)'));
      }))]) : null,
    ]));
    if (weakPicked.length) body.push(h('p', { class: 'ti-note ti-warn' }, weakPicked.map((id) => C.tower(D, id).name).join(', ') + (weakPicked.length > 1 ? ' are' : ' is') + ' weak on ' + mp.name + '. It still works, but expect to spend more.'));
    const plan = U.planFor(tips, m);
    if (plan) body.push(h('div', null, [h('p', { class: 'ti-lbl' }, plan.label + ' from the map page'), U.stepList(plan.steps, 6),
      !st.towers.length && C.mapPlanCross(D, st.mapId) && Object.keys(C.mapPlanCross(D, st.mapId)).length ? h('button', { type: 'button', class: 'btn btn-small', onclick: starter }, 'Plan with it') : null]));
    if (tips && tips.placement.length) body.push(h('div', null, [h('p', { class: 'ti-lbl' }, 'Where to place'), U.stepList(tips.placement, 4)]));
    const kr = U.keyRounds(tips, a, b);
    if (kr) body.push(h('div', null, [h('p', { class: 'ti-lbl' }, 'Key rounds'), kr]));
    body.push(h('p', { class: 'ti-note' }, [h('a', { href: '../../maps/' + mp.id + '/' }, 'Full ' + mp.name + ' page'), ' · ', h('a', { href: '../simulator/#map=' + mp.id + '&mode=' + m.id + (C.players(st.players) > 1 ? '&pl=' + C.players(st.players) : '') }, 'Start a blank build in the Simulator')]));
    return h('section', { class: 'panel', 'aria-labelledby': 'adv-tips-h' }, [h('h2', { class: 'panel-h', id: 'adv-tips-h' }, ['Map tips', h('small', null, mp.name + ' · ' + mp.difficulty)]), h('div', { class: 'ti-panel-b ti ti-tips' }, body)]);
  }

  loadInitial();
  me = U.me(D);
  render();
  persist();
  window.addEventListener('hashchange', () => {
    if (location.hash.slice(1) === C.encodeAdvice(st)) return;
    loadInitial(); render(); /* a link to this page: answer at once */
  });
})();
