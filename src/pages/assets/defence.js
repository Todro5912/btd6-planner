/* Monkey Intel: "Check my defence" (slug: defence). Needs tools-data, tools-core, synergy, tools-ui.
   Mid-game: tap the towers you have, see what leaks in the next 15 rounds and the cheapest fix.
   Links: #mode=&map=&round=&t=dart.002,ninja.400&hero=quincy&hl=7 (the Simulator's "Check my defence at R__"). */
(function () {
  'use strict';
  const MI = window.MonkeyIntel;
  const C = MI.core, U = MI.ui, h = U.h;
  const D = U.data();
  const root = document.getElementById('dfn-root');
  if (!root) return;
  const KEY = 'mi-defence-v1';
  const P = MI.progress || null;
  const validMap = (id) => !!(id && C.map(D, id));
  const validMode = (id) => !!(id && C.mode(D, id) && !C.isSandbox(C.mode(D, id)));
  let kN = 0;
  const withKey = (t) => Object.assign({ k: 'w' + (++kN) }, t);
  const cleanTowers = (list) => (Array.isArray(list) ? list.filter((t) => t && C.tower(D, t.id) && C.validCross(t.x)).map((t) => withKey({ id: t.id, x: t.x.slice() })) : []);
  const saved = U.store.get(KEY) || {};
  const g = P && P.get().game;
  const st = {
    modeId: validMode(saved.modeId) ? saved.modeId : g && validMode(g.modeId) ? g.modeId : 'medium',
    mapId: validMap(saved.mapId) ? saved.mapId : saved.modeId == null && g && validMap(g.mapId) ? g.mapId : '',
    round: typeof saved.round === 'number' ? saved.round : 24,
    towers: cleanTowers(saved.towers),
    heroId: saved.heroId && C.hero(D, saved.heroId) ? saved.heroId : '',
    heroLevel: typeof saved.heroLevel === 'number' ? saved.heroLevel : 5,
  };
  st.open = !st.towers.length;
  let prev = saved.prev && Array.isArray(saved.prev.towers) ? saved.prev : null; /* what a link or Clear replaced, for undo */
  let notice = null;
  const snapshot = () => ({ modeId: st.modeId, mapId: st.mapId, round: st.round, towers: st.towers.map((t) => ({ id: t.id, x: t.x.slice() })), heroId: st.heroId, heroLevel: st.heroLevel });
  const restore = (s) => {
    st.modeId = validMode(s.modeId) ? s.modeId : st.modeId; st.mapId = validMap(s.mapId) ? s.mapId : '';
    st.round = typeof s.round === 'number' ? s.round : st.round; st.towers = cleanTowers(s.towers);
    st.heroId = s.heroId && C.hero(D, s.heroId) ? s.heroId : ''; st.heroLevel = typeof s.heroLevel === 'number' ? s.heroLevel : st.heroLevel;
  };
  const sameTowers = (a, b) => a.map((t) => t.id + t.x.join('')).sort().join() === b.map((t) => t.id + t.x.join('')).sort().join();

  /* #mode=…&map=…&round=…&t=…&hero=…&hl=… prefill */
  let fromLink = false; /* a link names its own game: don't also offer the last game */
  function readHash() {
    const q = {};
    String(location.hash || '').replace(/^#/, '').split('&').forEach((kv) => {
      const i = kv.indexOf('=');
      if (i > 0) { try { q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); } catch (e) { /* malformed: skip */ } }
    });
    if (!Object.keys(q).length) return;
    fromLink = true;
    const before = snapshot();
    if (validMode(q.mode)) st.modeId = q.mode;
    else if (g && validMode(g.modeId) && !validMode(saved.modeId)) st.modeId = g.modeId;
    if (validMap(q.map)) st.mapId = q.map;
    else if (g && validMap(g.mapId) && !st.mapId) st.mapId = g.mapId;
    if (/^\d+$/.test(q.round || '')) st.round = +q.round;
    if (q.t != null) {
      const list = String(q.t).split(',').map((tok) => { const m = tok.match(/^([a-z]+)(?:\.(\d)(\d)(\d))?$/); return m ? { id: m[1], x: m[2] != null ? [+m[2], +m[3], +m[4]] : [0, 0, 0] } : null; }).filter(Boolean).slice(0, 30);
      const towers = cleanTowers(list);
      if (before.towers.length && !sameTowers(before.towers, towers)) { prev = before; notice = { kind: 'link' }; }
      st.towers = towers;
      if (q.hero && C.hero(D, q.hero)) { st.heroId = q.hero; if (/^\d+$/.test(q.hl || '')) st.heroLevel = Math.max(1, Math.min(20, +q.hl)); }
      else if (q.hero === '' || q.hero === 'none') st.heroId = '';
    }
    st.open = !st.towers.length;
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
  }
  readHash();
  /* the last game you set up in another tool is newer than what you had here */
  if (!notice && !fromLink && g && g.from !== 'defence' && g.ts > (saved.ts || 0) && ((validMap(g.mapId) && g.mapId !== st.mapId) || (validMode(g.modeId) && g.modeId !== st.modeId))) {
    if (!st.towers.length) { if (validMap(g.mapId)) st.mapId = g.mapId; if (validMode(g.modeId)) st.modeId = g.modeId; }
    else notice = { kind: 'game', game: g };
  }
  const mode = () => C.mode(D, st.modeId);
  const save = () => {
    U.store.set(KEY, { modeId: st.modeId, mapId: st.mapId, round: st.round, towers: st.towers.map((t) => ({ id: t.id, x: t.x })), heroId: st.heroId, heroLevel: st.heroLevel, ts: Date.now() + 1, prev });
    if (P) P.setGame({ mapId: st.mapId || (g && g.mapId), modeId: st.modeId, heroId: st.heroId, from: 'defence' });
  };
  const clampR = (r) => { const [a, b] = C.modeRange(mode()); return Math.max(a, Math.min(b, Math.round(r))); };
  let me = U.me(D);

  function render() {
    st.round = clampR(st.round);
    save();
    me = U.me(D);
    const meNow = U.me(D);
    const res = C.checkDefence(D, { modeId: st.modeId, mapId: st.mapId || null, round: st.round, towers: st.towers, hero: st.heroId ? { id: st.heroId, level: st.heroLevel } : null, span: 15,
      fx: meNow.fx, missing: meNow.missing || null });
    const snap = U.snapFocus();
    U.clear(root);
    const pv = U.previewNote(D);
    if (pv) root.appendChild(pv);
    const out = result(res);
    root.appendChild(out);
    root.appendChild(inputs(res));
    const placed = st.towers.map((t) => ({ id: t.id, x: t.x }));
    if (placed.length) {
      const m = mode(), mp = st.mapId ? C.map(D, st.mapId) : null;
      const sugs = MI.synergy(placed, { modeId: m.id, endRound: m.endRound, heroId: st.heroId || null, missing: res.threats.map((t) => t.prop), bonuses: res.state.bonuses, mapWater: mp && mp.water, mapLos: mp && mp.losBlockers });
      if (sugs.length) root.appendChild(h('section', { class: 'panel', 'aria-labelledby': 'dfn-syn-h' }, [h('h2', { class: 'panel-h', id: 'dfn-syn-h' }, ['Pairs well', h('small', null, 'with what you have')]), U.suggestionList(sugs, 4, (b) => { if (b.hero) { st.heroId = b.hero; st.heroLevel = Math.max(1, C.heroLevelAt(D, b.hero, C.modeRange(mode())[0], Math.max(st.round, C.modeRange(mode())[0]), 'Beginner')); } else st.towers.push(withKey(b)); render(); })]));
    }
    U.restoreFocus(snap, root);
    U.resultDock(out, dockInfo(res));
  }
  function dockInfo(res) {
    if (!st.towers.length && !st.heroId) return { tone: 'warn', text: 'Add your towers' };
    const t = res.threats[0];
    if (!t) return { tone: 'ok', text: 'Clear to R' + res.end };
    return { tone: 'bad', text: 'R' + t.round + ': ' + (t.prop === 'power' ? 'leaks (about ' + C.int(t.leakInfo ? t.leakInfo.leak : 0) + ' RBE)' : t.text.split(',')[0]) + U.cheapestFix(t.fixes) };
  }

  function result(res) {
    const head = h('div', { class: 'ti-row' }, [
      h('span', { class: 'ti-lbl' }, 'Next ' + (res.end - res.round + 1) + ' round' + (res.end === res.round ? '' : 's')), U.rchip(res.round, 'ti-r-plain'), '→', U.rchip(res.end, 'ti-r-plain'),
      h('span', { class: 'ti-note', style: 'color:inherit' }, res.map ? res.map.name : 'no map picked'),
    ]);
    const box = (cls, label, kids) => h('section', { class: 'ti-alert' + (cls ? ' ' + cls : ''), id: 'dfn-res', tabindex: '-1', 'data-fk': 'dfn-res', 'aria-label': label }, kids);
    if (!st.towers.length && !st.heroId) {
      return box('ti-alert-warn', 'Result', [noticeBox(), h('p', { class: 'ti-alert-t' }, 'Add your towers'), h('p', { class: 'ti-alert-s' }, 'Tap each tower you have below, then set its upgrades.')]);
    }
    const mapNote = !res.map ? h('p', { class: 'ti-alert-s' }, 'Pick your map below: the leak check uses its track, and water towers need water.') : null;
    if (!res.threats.length) {
      const kids = [noticeBox(), head, h('p', { class: 'ti-alert-t' }, 'Clear to R' + res.end)];
      kids.push(h('p', { class: 'ti-alert-s' }, 'Every bloon type in these rounds has an answer, and your towers pop enough (estimate).' + (res.nextDanger ? ' Next big round: R' + res.nextDanger.r + ', ' + res.nextDanger.composition + '.' : '')));
      if (res.state.unknown.length) kids.push(h('p', { class: 'ti-alert-s' }, 'Not counted (no pop data yet): ' + res.state.unknown.map((id) => C.tower(D, id).name).join(', ') + '.'));
      kids.push(mapNote);
      return box('ti-alert-ok', 'Result', kids);
    }
    const kids = [noticeBox(), head];
    let rbe = false;
    res.threats.forEach((t, i) => {
      kids.push(h('p', { class: 'ti-alert-t', style: i ? 'font-size:clamp(20px,4vw,28px);margin-top:6px' : null }, ['R' + t.round + ': '].concat(U.probText(t.text, { noLink: true }))));
      if (t.estimate) {
        rbe = true;
        kids.push(h('p', { class: 'ti-alert-s' }, ['R' + t.round + ' is ' + t.composition + '. ' + (t.rounds.length > 1 ? t.rounds.length + ' of the next 15 rounds leak, ' + (t.lives >= mode().lives ? 'enough to end your game' : 'about ' + C.int(t.lives) + ' lives in all') + '. ' : ''), U.badge('calc', 'estimate')]));
      } else kids.push(h('p', { class: 'ti-alert-s' }, 'R' + t.round + ' is ' + t.composition + (t.rounds.length > 1 ? '. ' + t.rounds.length + ' of the next 15 rounds need it.' : '.')));
      kids.push(fixBlock(t, i));
    });
    if (rbe) kids.push(U.rbeNote());
    if (res.state.unknown.length) kids.push(h('p', { class: 'ti-alert-s' }, 'Not counted (no pop data yet): ' + res.state.unknown.map((id) => C.tower(D, id).name).join(', ') + '.'));
    kids.push(mapNote);
    return box('', 'Threats', kids);
  }
  function noticeBox() {
    if (!notice) return null;
    const ok = h('button', { type: 'button', class: 'btn btn-small', id: 'dfn-nt-ok', onclick: () => { notice = null; render(); } }, 'OK');
    if (notice.kind === 'link' || notice.kind === 'cleared') {
      return h('div', { class: 'ti-notice', role: 'status' }, [h('p', null, notice.kind === 'link' ? 'Opened your towers from a link. The ones you had here are kept.' : 'Cleared.'),
        h('div', { class: 'ti-share' }, [prev ? h('button', { type: 'button', class: 'btn btn-small btn-grass', id: 'dfn-nt-back', onclick: () => { const was = snapshot(); restore(prev); prev = was; notice = { kind: 'back' }; render(); } }, notice.kind === 'link' ? 'Back to my towers' : 'Undo') : null, ok])]);
    }
    if (notice.kind === 'back') return h('div', { class: 'ti-notice', role: 'status' }, [h('p', null, 'Your towers are back.'), h('div', { class: 'ti-share' }, [h('button', { type: 'button', class: 'btn btn-small', id: 'dfn-nt-undo', onclick: () => { const was = snapshot(); restore(prev); prev = was; notice = null; render(); } }, 'Switch back'), ok])]);
    const gg = notice.game;
    const label = [validMap(gg.mapId) ? C.map(D, gg.mapId).name : null, validMode(gg.modeId) ? C.mode(D, gg.modeId).name : null].filter(Boolean).join(', ');
    return h('div', { class: 'ti-notice', role: 'status' }, [h('p', null, 'Your last game in another tool: ' + label + '.'), h('div', { class: 'ti-share' }, [
      h('button', { type: 'button', class: 'btn btn-small btn-grass', id: 'dfn-nt-use', onclick: () => { prev = snapshot(); if (validMap(gg.mapId)) st.mapId = gg.mapId; if (validMode(gg.modeId)) st.modeId = gg.modeId; notice = { kind: 'back' }; render(); } }, 'Use it'),
      h('button', { type: 'button', class: 'btn btn-small', id: 'dfn-nt-keep', onclick: () => { notice = null; render(); } }, 'Keep mine')])]);
  }

  /* "Add" on a fix: a new tower goes into your list, an upgrade changes the tower you have */
  function applyFix(f) {
    (f.kind === 'pair' ? f.parts || [] : [f]).forEach((p) => {
      if (p.kind === 'upgrade') {
        const tw = st.towers[+String(p.uid).slice(1)];
        if (tw && tw.id === p.towerId) tw.x = p.x.slice();
      } else if (p.towerId) st.towers.push(withKey({ id: p.towerId, x: p.x.slice() }));
    });
    render();
  }
  function fixBlock(t, ti) {
    const ul = U.fixList(t.fixes, { hints: t.hints, hintLabel: t.estimate ? 'Good to know' : null, empty: t.estimate ? 'Nothing cheap fixes it on its own: add more towers or upgrades.' : null });
    Array.prototype.forEach.call(ul.children, (li, i) => {
      const f = t.fixes[i];
      if (!f) return;
      const key = 'dfn-fix-' + t.prop + '-' + i;
      if (f.kind === 'hero') {
        /* a hero fix: buy the levels (the game sells hero levels for cash) */
        li.appendChild(h('span', { class: 'ti-fix-a' }, h('button', { type: 'button', class: 'btn btn-small btn-grass', 'data-fk': key, 'data-fkb': 'dfn-res', onclick: () => { st.heroLevel = Math.max(st.heroLevel, f.level); render(); } }, 'My hero is L' + f.level + ' now')));
        return;
      }
      li.appendChild(h('span', { class: 'ti-fix-a' }, h('button', { type: 'button', class: 'btn btn-small btn-grass', 'data-fk': key, 'data-fkb': 'dfn-res', onclick: () => applyFix(f) }, f.kind === 'upgrade' ? 'Upgrade' : 'Add')));
    });
    void ti;
    return ul;
  }

  function inputs() {
    const m = mode();
    const [ra, rb] = C.modeRange(m);
    const step = (d, label, txt, key) => h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': label, 'data-fk': key, 'data-fkb': 'dfn-round', disabled: (d < 0 ? st.round <= ra : st.round >= rb) ? true : null, onclick: () => { st.round = clampR(st.round + d); render(); } }, txt);
    const roundCtl = h('div', { class: 'ti-round' }, [
      step(-5, '5 rounds earlier', '«', 'dfn-r-5'), step(-1, 'Earlier round', '−', 'dfn-r-1'),
      h('span', { class: 'ti-round-n', id: 'dfn-round', tabindex: '-1' }, 'R' + st.round),
      step(1, 'Later round', '+', 'dfn-r+1'), step(5, '5 rounds later', '»', 'dfn-r+5'),
    ]);
    const mapOpts = [{ value: '', label: 'No map (any)', keys: 'none any' }].concat(U.mapOptions(D));
    const top = h('div', { class: 'ti-row' }, [
      U.field('Map', U.combo(mapOpts, st.mapId, (v) => { st.mapId = v; render(); }, { id: 'dfn-map' }), 'ti-grow'),
      U.field('Mode', U.combo(U.modeOptions(D), st.modeId, (v) => { st.modeId = v; render(); }, { id: 'dfn-mode' }), 'ti-grow'),
    ]);
    const roundRow = h('div', { class: 'ti-row' }, [h('div', { class: 'ti-field' }, [h('span', null, 'Round now (' + m.name + ': R' + ra + '–' + rb + ')'), roundCtl])]);
    const heroOpts = U.heroOptions(D).map((o) => (o.value && !me.ownsHero(o.value) ? Object.assign({}, o, { label: o.label + ' (not owned)' }) : o));
    const heroRow = h('div', { class: 'ti-row' }, [
      U.field('Hero', U.combo(heroOpts, st.heroId, (v) => { st.heroId = v; if (v) st.heroLevel = Math.max(1, C.heroLevelAt(D, v, ra, Math.max(st.round, ra), 'Beginner')); render(); }, { id: 'dfn-hero' }), 'ti-grow'),
      st.heroId ? h('div', { class: 'ti-field' }, [h('span', null, 'Hero level'), h('div', { class: 'ti-round' }, [
        h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Lower hero level', 'data-fk': 'dfn-hl-', 'data-fkb': 'dfn-hl+', disabled: st.heroLevel <= 1 ? true : null, onclick: () => { st.heroLevel = Math.max(1, st.heroLevel - 1); render(); } }, '−'),
        h('span', { class: 'ti-round-n', style: 'font-size:30px' }, 'L' + st.heroLevel),
        h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Raise hero level', 'data-fk': 'dfn-hl+', 'data-fkb': 'dfn-hl-', disabled: st.heroLevel >= 20 ? true : null, onclick: () => { st.heroLevel = Math.min(20, st.heroLevel + 1); render(); } }, '+'),
      ])]) : null,
    ]);
    const cards = h('ul', { class: 'ti-placed' });
    const counts = {};
    st.towers.forEach((tw, i) => {
      const t = C.tower(D, tw.id);
      counts[tw.id] = (counts[tw.id] || 0) + 1;
      const next = st.towers[i + 1] || st.towers[i - 1];
      const issue = C.placeIssue(D, m, st.mapId ? C.map(D, st.mapId) : null, t);
      cards.appendChild(h('li', { class: 'ti-card' + (issue ? ' ti-card-bad' : '') }, [
        h('div', { class: 'ti-card-h' }, [h('span', { class: 'ti-card-t' }, [t.name.replace(/ Monkey$/, '') + ' #' + counts[tw.id] + ' ', U.x(tw.x)]),
          h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Remove ' + t.name, 'data-fk': tw.k + '-del', 'data-fkb': next ? next.k + '-del' : 'dfn-add', onclick: () => { st.towers.splice(i, 1); render(); } }, '×')]),
        issue ? h('p', { class: 'ti-note ti-warn' }, 'Not counted: ' + issue + '.') : null,
        U.pathSteppers(t, tw.x, (nx) => { tw.x = nx; render(); }, { key: tw.k }),
      ]));
    });
    const addBtn = h('button', { type: 'button', class: 'btn btn-grass ti-primary', id: 'dfn-add', 'aria-expanded': String(st.open), onclick: () => { st.open = !st.open; render(); } }, st.open ? 'Done adding' : '+ Add a tower');
    const grid = st.open ? U.towerGrid(D, {
      label: 'Add a tower', key: 'dfn-t',
      issue: (t) => C.placeIssue(D, m, st.mapId ? C.map(D, st.mapId) : null, t),
      cost: (t) => C.price(t.baseCost, m.costMult),
      onpick: (t) => { st.towers.push(withKey({ id: t.id, x: [0, 0, 0] })); render(); },
    }) : null;
    return h('section', { class: 'panel', 'aria-labelledby': 'dfn-in-h' }, [
      h('h2', { class: 'panel-h', id: 'dfn-in-h' }, ['Your game', h('small', null, st.towers.length + ' tower' + (st.towers.length === 1 ? '' : 's'))]),
      h('div', { class: 'ti-panel-b ti' }, [top, roundRow, heroRow, U.profileLine(D, m, me), st.towers.length ? cards : null, h('div', { class: 'ti-share' }, [addBtn,
        st.towers.length ? h('button', { type: 'button', class: 'btn', id: 'dfn-clear', 'data-fkb': 'dfn-add', onclick: () => { prev = snapshot(); st.towers = []; st.open = true; notice = { kind: 'cleared' }; render(); } }, 'Clear') : null,
        h('a', { class: 'btn btn-small', href: simLink() }, 'Open in the Simulator')]), grid]),
    ]);
  }
  /* the same towers as a Simulator build, all placed at this round */
  function simLink() {
    const toks = [];
    if (st.heroId) toks.push(st.round + 'h' + st.heroId);
    st.towers.forEach((t) => toks.push(st.round + 'p' + t.id + (t.x.some((v) => v > 0) ? '.' + t.x.join('') : '')));
    return '../simulator/#' + (st.mapId ? 'map=' + st.mapId + '&' : '') + 'mode=' + st.modeId + (toks.length ? '&b=' + toks.join('_') : '') + (st.heroId ? '&hl=' + st.heroLevel : '');
  }
  render();
  /* a link opened while this page is open (same page, new #hash) */
  window.addEventListener('hashchange', () => { if (location.hash.length > 1) { readHash(); render(); } });
})();
