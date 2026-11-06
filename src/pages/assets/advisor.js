/* Monkey Intel: Strategy Advisor (slug: advisor). Needs tools-data, map-tips, tools-core, advisor-core, synergy, tools-ui.
   Pick a map, a mode, a hero and the monkeys you want to use; get crosspaths and jobs, a build order, gaps and map tips. */
(function () {
  'use strict';
  const MI = window.MonkeyIntel;
  const C = MI.core, U = MI.ui, h = U.h;
  const D = U.data();
  const root = document.getElementById('adv-root');
  if (!root) return;
  const KEY = 'mi-adv-v1';
  const arr = (v) => (Array.isArray(v) ? v : []);

  let st = { mapId: 'monkey-meadow', modeId: 'medium', heroId: 'auto', towers: [], force: {} };
  let res = null;

  function loadInitial() {
    const hash = location.hash || '';
    const saved = U.store.get(KEY);
    const src = /[#&](map|mode|t)=/.test(hash) ? hash : saved && saved.hash ? saved.hash : null;
    if (!src) return;
    const p = C.decodeAdvice(D, src);
    st.mapId = p.mapId || st.mapId;
    st.modeId = p.modeId || st.modeId;
    if (p.heroId !== undefined) st.heroId = p.heroId;
    st.towers = p.towers;
    st.force = p.force;
  }
  function persist() {
    const hash = C.encodeAdvice(st);
    try { history.replaceState(null, '', '#' + hash); } catch (e) { /* file:// or sandbox */ }
    U.store.set(KEY, { hash });
  }
  const mode = () => C.mode(D, st.modeId);
  const map = () => C.map(D, st.mapId);
  const strat = () => (D.strats || {})[st.mapId] || {};
  function update() { persist(); render(); }

  function render() {
    res = C.advise(D, { mapId: st.mapId, modeId: st.modeId, heroId: st.heroId, towers: st.towers, force: st.force });
    U.clear(root);
    root.appendChild(gamePanel());
    root.appendChild(picksPanel());
    if (res.picks.length) {
      root.appendChild(answer());
      root.appendChild(rolesPanel());
      root.appendChild(orderPanel());
      root.appendChild(gapsPanel());
    } else if (res.unusable.length) root.appendChild(gapsPanel());
    root.appendChild(tipsPanel());
  }

  /* ---------- inputs ---------- */
  function heroOpts() {
    const best = C.mapHeroes(D, st.mapId)[0];
    return [{ value: 'auto', label: 'Pick for me' + (best ? ' (' + best.name + ')' : ''), keys: 'auto best' }].concat(U.heroOptions(D));
  }
  function gamePanel() {
    const m = mode();
    const [a, b] = C.modeRange(m);
    const kids = [
      U.field('Map', U.combo(U.mapOptions(D), st.mapId, (v) => { st.mapId = v; update(); }, { id: 'adv-map' }), 'ti-grow'),
      U.field('Mode', U.combo(U.modeOptions(D), st.modeId, (v) => { st.modeId = v; update(); }, { id: 'adv-mode' }), 'ti-grow'),
      U.field('Hero', U.combo(heroOpts(), st.heroId, (v) => { st.heroId = v; update(); }, { id: 'adv-hero' }), 'ti-grow'),
    ];
    const facts = h('p', { class: 'ti-note' }, [m.name + ': ', U.rchip(a, 'ti-r-plain'), ' to ', U.rchip(b, 'ti-r-plain'), ', start ', U.money(m.startCash),
      ', prices ×' + m.costMult + (m.rules && m.rules.noSelling ? ', no selling' : '') + (m.rules && m.rules.noIncomeTowers ? ', no farms' : '') + '.']);
    return h('section', { class: 'panel', 'aria-labelledby': 'adv-game-h' }, [h('h2', { class: 'panel-h', id: 'adv-game-h' }, 'Your game'),
      h('div', { class: 'ti-panel-b ti' }, [h('div', { class: 'ti-row' }, kids), facts])]);
  }
  function toggle(id) {
    const i = st.towers.indexOf(id);
    if (i >= 0) { st.towers.splice(i, 1); delete st.force[id]; } else if (st.towers.length < C.ADVISE_MAX) st.towers.push(id);
    update();
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
      hint: (t) => [].concat(arr(s.strongTowers).indexOf(t.id) >= 0 ? [{ cls: 'strong', text: 'Strong' }] : [], arr(s.avoidTowers).indexOf(t.id) >= 0 ? [{ cls: 'avoid', text: 'Avoid' }] : []),
      onpick: (t) => toggle(t.id),
    });
    const strongOk = arr(s.strongTowers).filter((id) => { const t = C.tower(D, id); return t && !C.placeIssue(D, m, mp, t); });
    const bar = h('div', { class: 'ti-share' }, [
      h('span', { class: 'ti-note' }, [h('b', null, String(st.towers.length)), ' picked · up to ' + C.ADVISE_MAX]),
      st.towers.length ? h('button', { type: 'button', class: 'btn btn-small', onclick: () => { st.towers = []; st.force = {}; update(); } }, 'Clear') : null,
      !st.towers.length && strongOk.length ? h('button', { type: 'button', class: 'btn btn-small btn-grass ti-wrap', onclick: () => { st.towers = strongOk.slice(0, 4); update(); } }, 'Not sure? Start with what\'s strong here') : null,
    ]);
    const legend = h('p', { class: 'ti-note' }, [h('span', { class: 'ti-hint ti-hint-strong' }, 'Strong'), ' strong on this map · ', h('span', { class: 'ti-hint ti-hint-avoid' }, 'Avoid'), ' weak here. Tap to pick, tap again to drop.']);
    return h('section', { class: 'panel', 'aria-labelledby': 'adv-picks-h' }, [h('h2', { class: 'panel-h', id: 'adv-picks-h' }, ['Your monkeys', h('small', null, 'the ones you want to use')]),
      h('div', { class: 'ti-panel-b ti' }, [legend, grid, bar])]);
  }

  /* ---------- result ---------- */
  function simLink() { return '../simulator/#' + C.encodePlan(res.plan); }
  function answer() {
    const sim = res.sim;
    const f = sim.first;
    const btns = h('div', { class: 'ti-share' }, [
      h('a', { class: 'btn btn-grass ti-primary', href: simLink(), id: 'adv-to-sim' }, 'Open this plan in the Simulator'),
      h('button', { type: 'button', class: 'btn btn-small', onclick: (e) => copyLink(e.currentTarget) }, 'Copy link'),
    ]);
    if (!f) {
      const left = res.leftovers.length;
      return h('section', { class: 'ti-alert ' + (left ? 'ti-alert-warn' : 'ti-alert-ok'), 'aria-label': 'Result' }, [
        h('p', { class: 'ti-alert-t' }, 'Covered to R' + res.end),
        h('p', { class: 'ti-alert-s' }, ['Every bloon type in ' + res.mode.name + ' has an answer in time. The build costs ', U.money(res.spent), ' of the ', U.money(res.budget + res.heroCost), ' this mode pays by ', 'R' + (res.end - Math.round((res.end - res.start) * 0.12)), '.']),
        left ? h('p', { class: 'ti-alert-s' }, 'Some upgrades don\'t fit in time: see the gaps below.') : null,
        btns,
      ]);
    }
    return h('section', { class: 'ti-alert', 'aria-label': 'First problem' }, [
      h('p', { class: 'ti-alert-t' }, 'R' + f.round + ': ' + f.text),
      h('p', { class: 'ti-alert-s' }, (res.gaps.length > 1 ? res.gaps.length + ' gaps in this plan. ' : '') + 'The fixes are below. Add one in the Simulator, or pick another monkey.'),
      btns,
    ]);
  }
  function copyLink(btn) {
    const url = location.href.split('#')[0] + '#' + C.encodeAdvice(st);
    const done = () => { btn.textContent = 'Link copied'; setTimeout(() => { btn.textContent = 'Copy link'; }, 1600); };
    try { navigator.clipboard.writeText(url).then(done, () => window.prompt('Copy this link', url)); } catch (e) { window.prompt('Copy this link', url); }
  }
  const PROP = (p) => (p === 'income' ? 'Income' : p === 'pop' ? 'First defence' : C.NEED_LABEL[p] || p);
  function jobLine(p) {
    const parts = [];
    p.jobs.forEach((j) => { if (j.prop === 'pop') parts.push('first defence from R' + j.round); else parts.push(PROP(j.prop) + ' by R' + j.round); });
    return parts;
  }
  function rolesPanel() {
    const ul = h('ul', { class: 'ti-placed ti-roles' });
    res.picks.forEach((p) => {
      const t = C.tower(D, p.id);
      const jobs = jobLine(p);
      const sel = U.select([{ value: '', label: 'Let the advisor choose' }].concat(p.options.map((o) => ({ value: o.x.join(''), label: C.code(o.x) + (o.name ? ' ' + o.name : '') + ' · ' + C.money(o.cost) }))),
        p.forced ? p.x.join('') : '', (v) => { if (v) st.force[p.id] = v.split('').map(Number); else delete st.force[p.id]; update(); }, { 'aria-label': 'End crosspath for ' + p.name });
      ul.appendChild(h('li', { class: 'ti-card ti-role' }, [
        h('div', { class: 'ti-card-h' }, [h('span', { class: 'ti-card-t' }, p.name), h('span', { class: 'ti-role-c' }, U.money(p.cost))]),
        h('div', { class: 'ti-role-x' }, [h('span', { class: 'ti-x ti-x-big' }, C.code(p.x)), h('span', { class: 'ti-role-n' }, p.xName || 'Base tower')]),
        U.pathPips(t, p.x),
        p.use ? h('p', { class: 'ti-role-u' }, [p.trimmedFrom ? 'Cheaper tier of ' + C.code(p.trimmedFrom) + ': ' : '', p.use]) : null,
        jobs.length ? h('p', { class: 'ti-role-j' }, [h('b', null, 'Job: '), jobs.join(' · ')]) : h('p', { class: 'ti-role-j' }, [h('b', null, 'Job: '), 'damage and back-up']),
        h('p', { class: 'ti-role-p' }, [h('span', { class: 'ti-lbl' }, 'Hits'), ' '].concat(p.own.filter((x) => ['camo', 'lead', 'purple', 'black', 'white', 'moab', 'ddt'].indexOf(x) >= 0).map((x) => h('span', { class: 'pop pop-y' }, PROP(x))),
          p.own.length ? [] : [h('span', { class: 'ti-note' }, 'nothing on its own: a support tower')])),
        p.gives.length ? h('p', { class: 'ti-role-p' }, [h('span', { class: 'ti-lbl' }, 'Gives towers in range'), ' '].concat(p.gives.map((x) => h('span', { class: 'pop pop-y ti-pop-sup' }, PROP(x))))) : null,
        h('p', { class: 'ti-note' }, p.placedAt ? ['Place ', U.rchip(p.placedAt, 'ti-r-plain'), p.doneAt ? [', finished ', U.rchip(p.doneAt, 'ti-r-plain')] : ', not finished in time'] : 'Not placed: no cash for it in this mode.'),
        p.timing ? h('details', { class: 'ti-role-more' }, [h('summary', null, 'When players usually buy it'), h('p', { class: 'ti-note' }, U.richText(p.timing))]) : null,
        U.field('End crosspath', sel),
      ]));
    });
    if (res.hero) {
      const jobs = arr(res.heroJobs).map((j) => PROP(j.prop) + ' by R' + j.round);
      const hb = C.hero(D, res.hero.id);
      ul.appendChild(h('li', { class: 'ti-card ti-role ti-role-hero' }, [
        h('div', { class: 'ti-card-h' }, [h('span', { class: 'ti-card-t' }, res.hero.name), h('span', { class: 'ti-role-c' }, U.money(res.heroCost))]),
        h('p', { class: 'ti-role-u' }, ['Hero: ' + res.heroWhy + '. ', hb && hb.bestFor ? U.richText(hb.bestFor) : '']),
        jobs.length ? h('p', { class: 'ti-role-j' }, [h('b', null, 'Job: '), jobs.join(' · ')]) : null,
        h('p', { class: 'ti-note' }, res.heroRound ? ['Place ', U.rchip(res.heroRound, 'ti-r-plain'), '. Levels are an estimate.'] : 'Not placed: no cash for it in time.'),
        hb && hb.camo ? h('p', { class: 'ti-note' }, 'Camo: ' + hb.camo) : null,
      ]));
    }
    return h('section', { class: 'panel', 'aria-labelledby': 'adv-roles-h' }, [h('h2', { class: 'panel-h', id: 'adv-roles-h' }, ['How to use each monkey', h('small', null, 'crosspath and job')]), h('div', { class: 'ti-panel-b' }, ul)]);
  }
  function orderPanel() {
    const ol = h('ol', { class: 'ti-steps ti-order-list' });
    res.steps.forEach((s) => {
      const label = s.op === 'hero' ? 'Place ' + s.label
        : s.op === 'place' ? ['Place ' + s.label, s.x.some((v) => v > 0) ? [' at ', U.x(s.x)] : null]
          : [s.label + ' to ', U.x(s.x)];
      const sub = [C.money(s.cost)];
      if (s.name && s.op !== 'hero') sub.push(s.name);
      if (s.bank != null) sub.push('then ' + C.money(s.bank));
      ol.appendChild(h('li', { class: 'ti-step' }, [
        h('span', { class: 'ti-step-r' }, U.rchip(s.r)),
        h('span', { class: 'ti-step-m' }, [h('span', { class: 'ti-step-l' }, label), h('br'), h('span', { class: 'ti-step-s ti-num' }, sub.join(' · '))]),
        h('span', { class: 'ti-step-a ti-due' }, arr(s.due).map((d) => h('span', { class: 'ti-hint ' + (d.prop === 'income' ? 'ti-hint-strong' : 'ti-hint-pair') }, d.by ? PROP(d.prop) + ' by R' + d.by : PROP(d.prop)))),
      ]));
    });
    return h('section', { class: 'panel', 'aria-labelledby': 'adv-order-h' }, [
      h('h2', { class: 'panel-h', id: 'adv-order-h' }, ['Build order', h('small', null, res.steps.length + ' buys')]),
      h('p', { class: 'ti-note ti-panel-b', style: 'margin-top:10px' }, 'Buy in this order. Tags show the threat a buy is for. Cash is after each buy.'),
      ol,
      h('div', { class: 'ti-panel-b ti-share' }, [h('a', { class: 'btn btn-small', href: simLink() }, 'Tweak it in the Simulator')]),
    ]);
  }
  function gapsPanel() {
    const body = [];
    const sim = res.sim;
    if (sim && sim.problems.length) {
      const ul = h('ol', { class: 'ti-problems' });
      sim.problems.forEach((p) => {
        ul.appendChild(h('li', { class: 'ti-prob' }, [
          h('div', { class: 'ti-prob-h' }, [U.rchip(p.round, 'ti-r-danger'), h('span', { class: 'ti-prob-t' }, p.text.charAt(0).toUpperCase() + p.text.slice(1)),
            h('span', { class: 'ti-prob-n' }, p.rounds > 1 ? p.rounds + ' rounds need it, to R' + p.last : '')]),
          U.fixList(p.fixes, { hints: p.hints }),
        ]));
      });
      body.push(ul);
    }
    if (res.leftovers.length) {
      body.push(h('div', { class: 'ti-panel-b' }, [h('p', { class: 'ti-lbl' }, 'No cash for these by R' + res.end),
        h('ul', { class: 'bullets' }, res.leftovers.map((l) => h('li', null, l.hero ? [l.label + ' (', U.money(l.cost), ')'] : [l.label + ' to ', U.x(l.want), ' (', U.money(l.cost), ' more). Pick a cheaper end crosspath above.'])))]));
    }
    if (res.unusable.length) {
      body.push(h('div', { class: 'ti-panel-b' }, [h('p', { class: 'ti-lbl' }, 'Can\'t use here'),
        h('ul', { class: 'bullets' }, res.unusable.map((u) => h('li', null, u.name + ': ' + u.issue + '.')))]));
    }
    if (!body.length) {
      body.push(h('p', { class: 'ti-note ti-panel-b', style: 'margin-top:10px' }, 'No gaps. Your monkeys can hit every bloon type in this mode, in time. That means they can hit them, not that they do enough damage: check the key rounds below in the Simulator.'));
    }
    const n = (sim ? sim.problems.length : 0) + res.leftovers.length + res.unusable.length;
    return h('section', { class: 'panel', 'aria-labelledby': 'adv-gaps-h' }, [h('h2', { class: 'panel-h', id: 'adv-gaps-h' }, ['Gaps and what to add', h('small', null, n ? n + ' to fix' : 'none')])].concat(body));
  }
  function chip(id, kind, picked) {
    const t = C.tower(D, id);
    if (!t) return null;
    return h('button', { type: 'button', class: 'tag ti-tipchip' + (picked ? ' tag-banana' : ''), 'aria-pressed': String(!!picked), title: picked ? 'In your picks: tap to drop' : 'Add to your picks', onclick: () => toggle(id) },
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
      strong.length ? h('div', null, [h('dt', null, 'Strong here'), h('dd', null, strong.map((id) => chip(id, 'strong', st.towers.indexOf(id) >= 0)))]) : null,
      arr(s.avoidTowers).length ? h('div', null, [h('dt', null, 'Weak here'), h('dd', null, arr(s.avoidTowers).map((id) => { const t = C.tower(D, id); return t ? h('span', { class: 'tag' + (st.towers.indexOf(id) >= 0 ? ' tag-danger' : '') }, t.name.replace(/ Monkey$/, '')) : null; }))]) : null,
      C.mapHeroes(D, st.mapId).length ? h('div', null, [h('dt', null, 'Best heroes'), h('dd', null, C.mapHeroes(D, st.mapId).map((hh) => h('button', { type: 'button', class: 'tag ti-tipchip' + (res.hero && res.hero.id === hh.id ? ' tag-banana' : ''), onclick: () => { st.heroId = hh.id; update(); } }, hh.name)))]) : null,
    ]));
    if (weakPicked.length) body.push(h('p', { class: 'ti-note ti-warn' }, weakPicked.map((id) => C.tower(D, id).name).join(', ') + (weakPicked.length > 1 ? ' are' : ' is') + ' weak on ' + mp.name + '. It still works, but expect to spend more.'));
    const plan = U.planFor(tips, m);
    if (plan) body.push(h('div', null, [h('p', { class: 'ti-lbl' }, plan.label + ' from the map page'), U.stepList(plan.steps, 6)]));
    if (tips && tips.placement.length) body.push(h('div', null, [h('p', { class: 'ti-lbl' }, 'Where to place'), U.stepList(tips.placement, 4)]));
    const kr = U.keyRounds(tips, a, b);
    if (kr) body.push(h('div', null, [h('p', { class: 'ti-lbl' }, 'Key rounds'), kr]));
    body.push(h('p', { class: 'ti-note' }, [h('a', { href: '../../maps/' + mp.id + '/' }, 'Full ' + mp.name + ' page'), ' · ', h('a', { href: '../simulator/#map=' + mp.id + '&mode=' + m.id }, 'Start a blank build in the Simulator')]));
    return h('section', { class: 'panel', 'aria-labelledby': 'adv-tips-h' }, [h('h2', { class: 'panel-h', id: 'adv-tips-h' }, ['Map tips', h('small', null, mp.name + ' · ' + mp.difficulty)]), h('div', { class: 'ti-panel-b ti ti-tips' }, body)]);
  }

  loadInitial();
  render();
  persist();
  window.addEventListener('hashchange', () => {
    if (location.hash.slice(1) === C.encodeAdvice(st)) return;
    loadInitial(); render();
  });
})();
