/* Monkey Intel: "Check my defence" (slug: defence). Needs tools-data, tools-core, synergy, tools-ui. */
(function () {
  'use strict';
  const MI = window.MonkeyIntel;
  const C = MI.core, U = MI.ui, h = U.h;
  const D = U.data();
  const root = document.getElementById('dfn-root');
  if (!root) return;
  const KEY = 'mi-defence-v1';
  const saved = U.store.get(KEY) || {};
  const st = {
    modeId: C.mode(D, saved.modeId) && !C.isSandbox(C.mode(D, saved.modeId)) ? saved.modeId : 'medium',
    round: typeof saved.round === 'number' ? saved.round : 24,
    towers: Array.isArray(saved.towers) ? saved.towers.filter((t) => t && C.tower(D, t.id) && C.validCross(t.x)) : [],
    heroId: saved.heroId && C.hero(D, saved.heroId) ? saved.heroId : '',
    heroLevel: typeof saved.heroLevel === 'number' ? saved.heroLevel : 5,
    open: !(Array.isArray(saved.towers) && saved.towers.length),
  };
  /* #mode=…&round=… prefill */
  String(location.hash || '').replace(/^#/, '').split('&').forEach((kv) => {
    const [k, v] = kv.split('=');
    if (k === 'mode' && C.mode(D, v) && !C.isSandbox(C.mode(D, v))) st.modeId = v;
    if (k === 'round' && /^\d+$/.test(v)) st.round = +v;
  });
  const mode = () => C.mode(D, st.modeId);
  const save = () => U.store.set(KEY, { modeId: st.modeId, round: st.round, towers: st.towers, heroId: st.heroId, heroLevel: st.heroLevel });
  const clampR = (r) => Math.max(1, Math.min(140, Math.round(r)));

  function render() {
    save();
    const res = C.checkDefence(D, { modeId: st.modeId, round: st.round, towers: st.towers, hero: st.heroId ? { id: st.heroId, level: st.heroLevel } : null, span: 15 });
    U.clear(root);
    const pv = U.previewNote(D);
    if (pv) root.appendChild(pv);
    root.appendChild(result(res));
    root.appendChild(inputs(res));
    const placed = st.towers.map((t) => ({ id: t.id, x: t.x }));
    if (placed.length) {
      const m = mode();
      const sugs = MI.synergy(placed, { modeId: m.id, endRound: m.endRound, heroId: st.heroId || null, missing: res.threats.map((t) => t.prop), bonuses: res.state.bonuses });
      if (sugs.length) root.appendChild(h('section', { class: 'panel', 'aria-labelledby': 'dfn-syn-h' }, [h('h2', { class: 'panel-h', id: 'dfn-syn-h' }, ['Pairs well', h('small', null, 'with what you have')]), U.suggestionList(sugs, 4, (b) => { if (b.hero) { st.heroId = b.hero; st.heroLevel = Math.max(1, C.heroLevelAt(D, b.hero, C.modeRange(mode())[0], Math.max(st.round, C.modeRange(mode())[0]), 'Beginner')); } else st.towers.push(b); render(); })]));
    }
  }

  function result(res) {
    const head = h('div', { class: 'ti-row' }, [
      h('span', { class: 'ti-lbl' }, 'Next 15 rounds'), U.rchip(res.round, 'ti-r-plain'), '→', U.rchip(res.end, 'ti-r-plain'),
    ]);
    if (!st.towers.length && !st.heroId) {
      return h('section', { class: 'ti-alert ti-alert-warn', 'aria-label': 'Result' }, [h('p', { class: 'ti-alert-t' }, 'Add your towers'), h('p', { class: 'ti-alert-s' }, 'Tap each tower you have below, then set its upgrades.')]);
    }
    if (!res.threats.length) {
      const kids = [head, h('p', { class: 'ti-alert-t' }, 'Clear to R' + res.end)];
      kids.push(h('p', { class: 'ti-alert-s' }, 'Every bloon type in these rounds has an answer.' + (res.nextDanger ? ' Next big round: R' + res.nextDanger.r + ', ' + res.nextDanger.composition + '.' : '')));
      if (res.state.unknown.length) kids.push(h('p', { class: 'ti-alert-s' }, 'Not counted (no pop data yet): ' + res.state.unknown.map((id) => C.tower(D, id).name).join(', ') + '.'));
      return h('section', { class: 'ti-alert ti-alert-ok', 'aria-label': 'Result' }, kids);
    }
    const kids = [head];
    res.threats.forEach((t, i) => {
      kids.push(h('p', { class: 'ti-alert-t', style: i ? 'font-size:clamp(20px,4vw,28px);margin-top:6px' : null }, 'R' + t.round + ': ' + t.text));
      if (t.estimate) kids.push(h('p', { class: 'ti-alert-s' }, ['R' + t.round + ' is ' + t.composition + '. ' + (t.rounds.length > 1 ? t.rounds.length + ' of the next 15 rounds leak, ' + (t.lives >= mode().lives ? 'enough to end your game' : 'about ' + C.int(t.lives) + ' lives in all') + '. ' : ''), U.badge('calc', 'estimate')]));
      else kids.push(h('p', { class: 'ti-alert-s' }, 'R' + t.round + ' is ' + t.composition + (t.rounds.length > 1 ? '. ' + t.rounds.length + ' of the next 15 rounds need it.' : '.')));
      kids.push(fixBlock(t));
    });
    if (res.state.unknown.length) kids.push(h('p', { class: 'ti-alert-s' }, 'Not counted (no pop data yet): ' + res.state.unknown.map((id) => C.tower(D, id).name).join(', ') + '.'));
    return h('section', { class: 'ti-alert', 'aria-label': 'Threats' }, kids);
  }

  /* "Add" on a fix: a new tower goes into your list, an upgrade changes the tower you have */
  function applyFix(f) {
    if (f.kind === 'upgrade') {
      const tw = st.towers[+String(f.uid).slice(1)];
      if (tw && tw.id === f.towerId) tw.x = f.x.slice();
    } else if (f.towerId) st.towers.push({ id: f.towerId, x: f.x.slice() });
    render();
  }
  function fixBlock(t) {
    const ul = U.fixList(t.fixes, { hints: t.hints, hintLabel: t.estimate ? 'Good to know' : null, empty: t.estimate ? 'Nothing cheap fixes it on its own: add more towers or upgrades.' : null });
    Array.prototype.forEach.call(ul.children, (li, i) => {
      const f = t.fixes[i];
      if (!f || f.kind === 'hero') return;
      li.appendChild(h('span', { class: 'ti-fix-a' }, h('button', { type: 'button', class: 'btn btn-small btn-grass', onclick: () => applyFix(f) }, f.kind === 'upgrade' ? 'Upgrade' : 'Add')));
    });
    return ul;
  }

  function inputs() {
    const m = mode();
    const roundCtl = h('div', { class: 'ti-round' }, [
      h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': '5 rounds earlier', onclick: () => { st.round = clampR(st.round - 5); render(); } }, '«'),
      h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Earlier round', onclick: () => { st.round = clampR(st.round - 1); render(); } }, '−'),
      h('span', { class: 'ti-round-n', id: 'dfn-round' }, 'R' + st.round),
      h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Later round', onclick: () => { st.round = clampR(st.round + 1); render(); } }, '+'),
      h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': '5 rounds later', onclick: () => { st.round = clampR(st.round + 5); render(); } }, '»'),
    ]);
    const top = h('div', { class: 'ti-row' }, [
      U.field('Mode', U.combo(U.modeOptions(D), st.modeId, (v) => { st.modeId = v; render(); }, { id: 'dfn-mode' }), 'ti-grow'),
      h('div', { class: 'ti-field' }, [h('span', null, 'Round now'), roundCtl]),
    ]);
    const heroRow = h('div', { class: 'ti-row' }, [
      U.field('Hero', U.combo(U.heroOptions(D), st.heroId, (v) => { st.heroId = v; if (v) st.heroLevel = Math.max(1, C.heroLevelAt(D, v, C.modeRange(m)[0], Math.max(st.round, C.modeRange(m)[0]), 'Beginner')); render(); }, { id: 'dfn-hero' }), 'ti-grow'),
      st.heroId ? h('div', { class: 'ti-field' }, [h('span', null, 'Hero level'), h('div', { class: 'ti-round' }, [
        h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Lower hero level', onclick: () => { st.heroLevel = Math.max(1, st.heroLevel - 1); render(); } }, '−'),
        h('span', { class: 'ti-round-n', style: 'font-size:30px' }, 'L' + st.heroLevel),
        h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Raise hero level', onclick: () => { st.heroLevel = Math.min(20, st.heroLevel + 1); render(); } }, '+'),
      ])]) : null,
    ]);
    const cards = h('ul', { class: 'ti-placed' });
    const counts = {};
    st.towers.forEach((tw, i) => {
      const t = C.tower(D, tw.id);
      counts[tw.id] = (counts[tw.id] || 0) + 1;
      cards.appendChild(h('li', { class: 'ti-card' }, [
        h('div', { class: 'ti-card-h' }, [h('span', { class: 'ti-card-t' }, [t.name.replace(/ Monkey$/, '') + ' #' + counts[tw.id] + ' ', U.x(tw.x)]),
          h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Remove ' + t.name, onclick: () => { st.towers.splice(i, 1); render(); } }, '×')]),
        U.pathSteppers(t, tw.x, (nx) => { tw.x = nx; render(); }),
      ]));
    });
    const addBtn = h('button', { type: 'button', class: 'btn btn-grass ti-primary', 'aria-expanded': String(st.open), onclick: () => { st.open = !st.open; render(); } }, st.open ? 'Done adding' : '+ Add a tower');
    const grid = st.open ? U.towerGrid(D, {
      label: 'Add a tower',
      issue: (t) => C.placeIssue(D, m, null, t),
      cost: (t) => C.price(t.baseCost, m.costMult),
      onpick: (t) => { st.towers.push({ id: t.id, x: [0, 0, 0] }); render(); },
    }) : null;
    return h('section', { class: 'panel', 'aria-labelledby': 'dfn-in-h' }, [
      h('h2', { class: 'panel-h', id: 'dfn-in-h' }, ['Your game', h('small', null, st.towers.length + ' tower' + (st.towers.length === 1 ? '' : 's'))]),
      h('div', { class: 'ti-panel-b ti' }, [top, heroRow, st.towers.length ? cards : null, h('div', { class: 'ti-share' }, [addBtn,
        st.towers.length ? h('button', { type: 'button', class: 'btn', onclick: () => { st.towers = []; st.open = true; render(); } }, 'Clear') : null]), grid]),
    ]);
  }
  render();
})();
