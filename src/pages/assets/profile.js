/* Monkey Intel: My profile (slug: profile). Needs progress.js (site-wide), tools-data, tools-core, advisor-core, goals-core, tools-ui.
   What you have in your game: unlocks + Paragons per tower, towers you don't have yet, heroes owned, Monkey Knowledge,
   Insta Monkeys, level and Monkey Money. Every tool reads it through progress.js (U.me, U.myUnlocks). */
(function () {
  'use strict';
  const MI = window.MonkeyIntel;
  const C = MI.core, U = MI.ui, h = U.h;
  const D = U.data();
  const root = document.getElementById('prf-root');
  if (!root) return;
  const P = MI.progress;
  if (!P) { root.appendChild(h('p', { class: 'ti-note' }, 'My profile could not load your saved progress.')); return; }

  const CLASSES = ['Primary', 'Military', 'Magic', 'Support'];
  const ins = { t: 'dart', x: [0, 0, 0], n: 1 }; /* the "add an Insta" form */
  let flash = null;
  let jump = null;
  const openPanels = { towers: true, mk: true };

  function render() {
    const s = P.get();
    const fid = document.activeElement && document.activeElement.id;
    U.clear(root);
    root.appendChild(youPanel(s));
    root.appendChild(towersPanel(s));
    root.appendChild(heroesPanel(s));
    root.appendChild(mkPanel(s));
    root.appendChild(instaPanel(s));
    root.appendChild(backupPanel());
    if (jump) {
      const el = document.getElementById(jump);
      jump = null;
      if (el) setTimeout(() => el.scrollIntoView({ block: 'start' }), 0);
    } else if (fid) {
      const el = document.getElementById(fid);
      if (el && el.focus) el.focus({ preventScroll: true });
    }
  }
  function keepOpen(d, key) {
    if (openPanels[key]) d.open = true;
    d.addEventListener('toggle', () => { openPanels[key] = d.open; });
    return d;
  }
  const stat = (label, val, sub) => h('div', { class: 'stat' }, [h('dt', null, label), h('dd', { class: 'stat-v ti-num' }, val), sub ? h('dd', { class: 'stat-s' }, sub) : null]);

  /* ---------- you ---------- */
  function youPanel(s) {
    const pr = s.profile;
    const num = (id, label, val, key, max, ph) => {
      const inp = h('input', { class: 'ti-input', id, type: 'number', min: '0', max: String(max), inputmode: 'numeric', placeholder: ph, value: val == null ? '' : String(val), style: 'width:9em' });
      /* save without re-rendering: a rebuild here would eat the click or Tab that ended the edit */
      inp.addEventListener('change', () => { const v = parseInt(inp.value, 10); P.setProfile({ [key]: isFinite(v) && v >= 0 ? Math.min(v, max) : null }); });
      return U.field(label, inp);
    };
    const name = h('input', { class: 'ti-input', id: 'prf-name', type: 'text', maxlength: '40', placeholder: 'optional', value: pr.name || '', style: 'width:12em', autocomplete: 'off' });
    name.addEventListener('change', () => {
      P.setProfile({ name: name.value.trim().slice(0, 40) });
      const hd = document.getElementById('prf-you-t');
      if (hd) hd.textContent = name.value.trim().slice(0, 40) || 'You';
    });
    const tierSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Hardest maps you have unlocked' }, C.TIERS.map((tr) =>
      h('button', { type: 'button', role: 'radio', id: 'prf-tier-' + tr, 'aria-checked': String(s.settings.maxTier === tr), onclick: () => { P.update((x) => { x.settings.maxTier = tr; }); render(); } }, tr)));
    const towers = D.towers.filter((t) => s.towers[t.id] && s.towers[t.id].set);
    const t5 = D.towers.reduce((n, t) => n + (s.towers[t.id] && s.towers[t.id].set ? s.towers[t.id].u.filter((v) => v === 5).length : 0), 0);
    const paras = D.towers.filter((t) => t.paragon && s.towers[t.id] && s.towers[t.id].p).length;
    const heroes = D.heroes.filter((x) => !pr.heroes || pr.heroes[x.id] !== false).length;
    const mkOn = Object.keys(pr.mk).length + (s.settings.me ? 1 : 0) + (s.settings.emt ? 1 : 0);
    const instaN = pr.instas.reduce((n, i) => n + i.n, 0);
    return h('section', { class: 'panel', 'aria-labelledby': 'prf-you-h' }, [
      h('h2', { class: 'panel-h', id: 'prf-you-h' }, [h('span', { id: 'prf-you-t' }, pr.name ? pr.name : 'You'), h('small', null, 'saved in this browser')]),
      h('div', { class: 'ti-panel-b ti' }, [
        h('div', { class: 'ti-row' }, [U.field('Name', name), num('prf-level', 'Player level', pr.level, 'level', 999, 'e.g. 64'), num('prf-mm', 'Monkey Money', pr.mm, 'mm', 1e9, 'e.g. 12000')]),
        h('div', { class: 'ti-field' }, [h('span', null, 'Hardest maps you have unlocked'), tierSeg]),
        h('dl', { class: 'stats prf-stats' }, [
          stat('Towers set', towers.length + ' / ' + D.towers.length, 'with your unlocks'),
          stat('Tier 5s', String(t5), 'unlocked'),
          stat('Paragons', paras + ' / ' + D.towers.filter((t) => t.paragon).length, 'unlocked'),
          stat('Heroes', heroes + ' / ' + D.heroes.length, pr.heroes ? 'owned' : 'all counted as owned'),
          stat('Monkey Knowledge', String(mkOn), 'nodes ticked'),
          stat('Insta Monkeys', String(instaN), pr.instas.length + ' kind' + (pr.instas.length === 1 ? '' : 's')),
        ]),
        h('p', { class: 'ti-note' }, ['Chasing something? ', h('a', { href: '../goals/' }, 'My goals'), ' tracks a Paragon or tier 5 run by run.']),
      ]),
    ]);
  }

  /* ---------- towers ---------- */
  function towerCard(t, s) {
    const pr = s.profile;
    const tp = s.towers[t.id] || { u: [0, 0, 0], p: false, bank: 0, set: false };
    const u = tp.set ? tp.u : [0, 0, 0];
    const missing = !!pr.missing[t.id];
    const setU = (nu, extra) => { P.setTower(t.id, Object.assign({ u: nu }, extra || {})); render(); };
    const rows = [0, 1, 2].map((p) => {
      const pips = h('span', { class: 'ti-pips', style: 'gap:6px' });
      for (let k = 1; k <= 5; k++) {
        const on = u[p] >= k;
        pips.appendChild(h('button', {
          type: 'button', id: 'pf-' + t.id + '-' + p + k, class: 'ti-pip' + (on ? ' on' : '') + (k === 5 ? ' t5' : ''), 'aria-pressed': String(on),
          'aria-label': C.upgradeName(t, p, k) + (on ? ', unlocked' : ', locked'), title: C.upgradeName(t, p, k), disabled: missing ? true : null,
          onclick: () => { const nu = u.slice(); nu[p] = u[p] === k ? k - 1 : k; setU(nu, nu.join('') !== '555' ? { p: false } : {}); },
        }));
      }
      return h('div', { class: 'prf-path' }, [pips, h('span', { class: 'ti-path-name' }, u[p] ? C.upgradeName(t, p, u[p]) : '–')]);
    });
    const all = u.join('') === '555';
    return h('li', { class: 'ti-card prf-tower' + (missing ? ' prf-missing' : '') + (tp.p ? ' prf-para' : ''), id: 'prf-t-' + t.id }, [
      h('div', { class: 'ti-card-h' }, [h('a', { class: 'ti-card-t', href: U.towerHref(t.id) }, t.name.replace(/ Monkey$/, '')),
        tp.set ? U.x(u) : h('span', { class: 'ti-note' }, 'not set')]),
      h('div', { class: 'prf-paths' }, rows),
      h('div', { class: 'prf-tacts' }, [
        h('button', { type: 'button', class: 'linkbtn ti-link', id: 'pf-' + t.id + '-all', disabled: missing || all ? true : null, onclick: () => setU([5, 5, 5]) }, 'All 15'),
        h('button', { type: 'button', class: 'linkbtn ti-link', id: 'pf-' + t.id + '-none', disabled: missing || !tp.set ? true : null, onclick: () => setU([0, 0, 0], { p: false }) }, 'None'),
        t.paragon ? h('label', { class: 'check prf-pcheck', title: t.paragon.name }, [h('input', { type: 'checkbox', id: 'pf-' + t.id + '-para', checked: tp.p ? true : null, disabled: missing ? true : null,
          onchange: (e) => setU(e.target.checked ? [5, 5, 5] : u, { p: e.target.checked }) }), 'Paragon']) : null,
        h('label', { class: 'check prf-pcheck' }, [h('input', { type: 'checkbox', id: 'pf-' + t.id + '-miss', checked: missing ? true : null,
          onchange: (e) => { const m = Object.assign({}, pr.missing); if (e.target.checked) m[t.id] = true; else delete m[t.id]; P.setProfile({ missing: m }); render(); } }), 'Not unlocked yet']),
      ]),
      tp.bank ? h('p', { class: 'ti-note prf-bank' }, C.int(tp.bank) + ' XP banked (My goals)') : null,
    ]);
  }
  function towersPanel(s) {
    const body = CLASSES.map((cl) => h('div', { class: 'prf-class' }, [
      h('p', { class: 'ti-lbl' }, cl),
      h('ul', { class: 'ti-placed prf-towers' }, D.towers.filter((t) => t.class === cl).map((t) => towerCard(t, s))),
    ]));
    return keepOpen(h('details', { class: 'panel ti-details', id: 'prf-towers' }, [
      h('summary', { class: 'panel-h', id: 'prf-towers-sum' }, ['Towers and upgrades', h('small', null, 'tap the pips you have unlocked')]),
      h('div', { class: 'ti-panel-b ti', style: 'padding-top:10px' }, [
        h('p', { class: 'ti-note' }, 'A filled pip is an upgrade you have unlocked in your game. The Advisor can keep to these, the Simulator flags anything above them, and My goals counts from them.'),
      ].concat(body)),
    ]), 'towers');
  }

  /* ---------- heroes ---------- */
  function heroesPanel(s) {
    const pr = s.profile;
    const owned = (id) => !pr.heroes || pr.heroes[id] !== false;
    const setOwned = (id, v) => {
      const m = {};
      D.heroes.forEach((x) => { m[x.id] = owned(x.id); });
      m[id] = v;
      P.setProfile({ heroes: m });
      render();
    };
    const list = h('ul', { class: 'prf-heroes' }, D.heroes.map((x) => {
      const on = owned(x.id);
      const how = x.unlockLevel ? 'level ' + x.unlockLevel + (x.mmUnlock ? ' or ' + C.int(x.mmUnlock) + ' MM' : '') : 'free';
      return h('li', null, h('button', { type: 'button', id: 'pf-h-' + x.id, class: 'prf-hero' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => setOwned(x.id, !on) }, [
        h('span', { class: 'prf-hero-n' }, x.name), h('span', { class: 'prf-hero-s' }, on ? 'owned' : 'unlock: ' + how)]));
    }));
    return h('section', { class: 'panel', 'aria-labelledby': 'prf-h-h' }, [
      h('h2', { class: 'panel-h', id: 'prf-h-h' }, ['Heroes', h('small', null, pr.heroes ? 'tap to change' : 'all counted as owned until you change one')]),
      h('div', { class: 'ti-panel-b ti', style: 'padding-top:10px' }, [
        list,
        h('div', { class: 'ti-share' }, [
          h('button', { type: 'button', class: 'btn btn-small', id: 'pf-h-all', onclick: () => { P.setProfile({ heroes: null }); render(); } }, 'I own them all'),
          h('button', { type: 'button', class: 'btn btn-small', id: 'pf-h-level', onclick: () => {
            const lv = P.profile().level;
            if (lv == null) { const f = document.getElementById('prf-level'); if (f) { f.focus(); f.scrollIntoView({ block: 'center' }); } return; }
            const m = {}; D.heroes.forEach((x) => { m[x.id] = !x.unlockLevel || x.unlockLevel <= lv; }); P.setProfile({ heroes: m }); render();
          } }, 'Only the ones my level unlocks'),
          h('span', { class: 'ti-note' }, '"Pick for me" in the Advisor chooses the best hero you own.'),
        ]),
      ]),
    ]);
  }

  /* ---------- Monkey Knowledge: the game's six trees ---------- */
  /* Rows follow the point gates (data/monkey-knowledge.json layout, from the game files), arrows are prerequisites.
     A node needs every node it has an arrow from, and enough points already spent in its tree (the game's rule).
     Monkey Education and Elite Military Training live in settings.me / settings.emt; everything else in profile.mk. */
  const MK_TREES = (D.mkMeta && D.mkMeta.trees) || ['Primary', 'Military', 'Magic', 'Support', 'Heroes', 'Powers'];
  const MK = {};
  (D.mk || []).forEach((n) => { MK[n.id] = n; });
  const mkKids = {};
  (D.mk || []).forEach((n) => (n.pre || []).forEach((p) => { (mkKids[p] = mkKids[p] || []).push(n.id); }));
  const mkUi = { tree: MK_TREES[0], sel: null, msg: '', scroll: {} };
  const TILE = { w: 112, h: 52, gx: 16, gy: 30, gate: 24, pad: 8 };
  const SVGNS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs) => { const el = document.createElementNS(SVGNS, tag); Object.keys(attrs || {}).forEach((k) => el.setAttribute(k, attrs[k])); return el; };
  const mkName = (id) => (MK[id] ? MK[id].name : id);
  const list = (ids) => (ids.length <= 2 ? ids.join(' and ') : ids.slice(0, -1).join(', ') + ' and ' + ids[ids.length - 1]);

  function mkState(s) {
    const on = {};
    Object.keys(s.profile.mk).forEach((k) => { if (s.profile.mk[k] && MK[k]) on[k] = true; });
    if (s.settings.me !== false) on['monkey-education'] = true;
    if (s.settings.emt) on['elite-military-training'] = true;
    return on;
  }
  const spentIn = (on, tree, except) => Object.keys(on).filter((k) => MK[k] && MK[k].tree === tree && k !== except).length;
  /* why a node can't be turned on yet (null = it can) */
  function mkBlock(on, n) {
    const miss = (n.pre || []).filter((p) => !on[p]);
    const have = spentIn(on, n.tree, n.id);
    const parts = [];
    if (miss.length) parts.push(list(miss.map(mkName)));
    if (have < (n.ptsNeeded || 0)) parts.push((n.ptsNeeded - have) + ' more point' + (n.ptsNeeded - have === 1 ? '' : 's') + ' in ' + n.tree);
    return parts.length ? 'Needs ' + parts.join(' and ') + ' first.' : null;
  }
  function mkSave(on) {
    const m = {};
    Object.keys(on).forEach((k) => { if (on[k] && k !== 'monkey-education' && k !== 'elite-military-training') m[k] = true; });
    P.update((x) => { x.settings.me = !!on['monkey-education']; x.settings.emt = !!on['elite-military-training']; x.profile.mk = m; });
  }
  /* turn a node on or off; turning off also turns off what needs it (its arrows, or the points it gave) */
  function mkToggle(id) {
    const s = P.get();
    const on = mkState(s);
    const n = MK[id];
    mkUi.sel = id;
    if (!on[id]) {
      const why = mkBlock(on, n);
      if (why) { mkUi.msg = n.name + ': ' + why; render(); return; }
      on[id] = true;
      mkUi.msg = n.name + ' on.';
    } else {
      const ptsOk = {};
      Object.keys(on).forEach((k) => { ptsOk[k] = spentIn(on, MK[k].tree, k) >= (MK[k].ptsNeeded || 0); });
      delete on[id];
      const gone = [];
      for (let changed = true; changed;) {
        changed = false;
        Object.keys(on).forEach((k) => {
          const m = MK[k];
          const preBad = (m.pre || []).some((p) => !on[p]);
          const ptsBad = ptsOk[k] && spentIn(on, m.tree, k) < (m.ptsNeeded || 0);
          if (preBad || ptsBad) { delete on[k]; gone.push(m.name); changed = true; }
        });
      }
      mkUi.msg = n.name + ' off.' + (gone.length ? ' Also turned off ' + list(gone) + ': ' + (gone.length === 1 ? 'it needs' : 'they need') + ' it.' : '');
    }
    mkSave(on);
    render();
  }
  function mkFillTree(tree, v) {
    const on = mkState(P.get());
    (D.mk || []).forEach((n) => { if (n.tree === tree) { if (v) on[n.id] = true; else delete on[n.id]; } });
    mkUi.msg = v ? 'All of ' + tree + ' on.' : tree + ' cleared.';
    mkUi.sel = null;
    mkSave(on);
    render();
  }
  /* pixel geometry of one tree: rows grow by the point gates above them */
  function mkGeo(tree) {
    const ti = (D.mkMeta && D.mkMeta.treeInfo && D.mkMeta.treeInfo[tree]) || {};
    const nodes = (D.mk || []).filter((n) => n.tree === tree && n.layout);
    const rows = ti.rows || 1 + Math.max(0, ...nodes.map((n) => n.layout.row));
    const cols = ti.cols || 1 + Math.max(0, ...nodes.map((n) => n.layout.col));
    const bandRows = ti.bandRows || [0];
    const gatesAbove = (r) => bandRows.filter((br) => br > 0 && br <= r).length;
    const y = (r) => TILE.pad + TILE.gate + r * (TILE.h + TILE.gy) + gatesAbove(r) * TILE.gate;
    const x = (c) => TILE.pad + c * (TILE.w + TILE.gx);
    return { nodes, rows, cols, bandRows, bands: ti.bands || [0], x, y,
      width: x(cols) - TILE.gx + TILE.pad, height: y(rows - 1) + TILE.h + TILE.pad + 6 };
  }
  function mkArrows(g, on) {
    const svg = sv('svg', { class: 'mk-lines', width: g.width, height: g.height, viewBox: '0 0 ' + g.width + ' ' + g.height, 'aria-hidden': 'true', focusable: 'false' });
    const defs = sv('defs');
    ['on', 'off'].forEach((k) => {
      const m = sv('marker', { id: 'mk-head-' + k, viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
      m.appendChild(sv('path', { d: 'M0,0 L10,5 L0,10 z', class: 'mk-head mk-head-' + k }));
      defs.appendChild(m);
    });
    svg.appendChild(defs);
    /* point gates: a dashed line and "N pts" above the first row of each band */
    g.bandRows.forEach((br, i) => {
      const gy = g.y(br) - TILE.gate / 2 - (br > 0 ? TILE.gy / 2 - 4 : 0);
      if (br > 0) svg.appendChild(sv('line', { x1: 2, x2: g.width - 2, y1: gy, y2: gy, class: 'mk-gate' }));
      const t = sv('text', { x: 4, y: gy - 4, class: 'mk-gate-t' });
      t.textContent = (g.bands[i] || 0) + ' pts';
      svg.appendChild(t);
    });
    g.nodes.forEach((n) => (n.pre || []).forEach((pid) => {
      const p = MK[pid];
      if (!p || !p.layout) return;
      const x1 = g.x(p.layout.col) + TILE.w / 2, y1 = g.y(p.layout.row) + TILE.h;
      const x2 = g.x(n.layout.col) + TILE.w / 2, y2 = g.y(n.layout.row) - 2;
      const midTop = y2 - TILE.gy / 2;
      let d;
      if (n.layout.row - p.layout.row === 1) d = 'M' + x1 + ',' + y1 + ' V' + (y1 + (midTop - y1) / 2 + 2) + ' H' + x2 + ' V' + y2;
      else {
        /* longer arrows run down the gap between columns, so they never cross a tile */
        const gut = (x2 >= x1 ? g.x(Math.max(p.layout.col, n.layout.col - 1)) + TILE.w + TILE.gx / 2 : g.x(n.layout.col + 1) - TILE.gx / 2);
        const out = y1 + TILE.gy / 2 - 2;
        d = 'M' + x1 + ',' + y1 + ' V' + out + ' H' + gut + ' V' + midTop + ' H' + x2 + ' V' + y2;
      }
      const lit = on[pid] && on[n.id];
      svg.appendChild(sv('path', { d, class: 'mk-line' + (lit ? ' on' : ''), 'marker-end': 'url(#mk-head-' + (lit ? 'on' : 'off') + ')' }));
    }));
    return svg;
  }
  /* arrow keys move between tiles: nearest tile in that direction */
  function mkKeys(e) {
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    const cur = e.target.closest && e.target.closest('.mk-tile');
    if (!dir || !cur) return;
    const tiles = Array.from(cur.parentNode.querySelectorAll('.mk-tile'));
    const cr = +cur.dataset.row, cc = +cur.dataset.col;
    let best = null, bd = Infinity;
    tiles.forEach((t) => {
      const dr = +t.dataset.row - cr, dc = +t.dataset.col - cc;
      if (t === cur || (dir[0] && Math.sign(dc) !== dir[0]) || (dir[1] && Math.sign(dr) !== dir[1])) return;
      const dist = dir[0] ? Math.abs(dc) * 10 + Math.abs(dr) * 3 : Math.abs(dr) * 10 + Math.abs(dc) * 3;
      if (dist < bd) { bd = dist; best = t; }
    });
    if (best) { e.preventDefault(); best.focus(); }
  }
  function mkTreeView(tree, on) {
    const g = mkGeo(tree);
    const box = h('div', { class: 'mk-tree', style: 'width:' + g.width + 'px;height:' + g.height + 'px', onkeydown: mkKeys });
    box.appendChild(mkArrows(g, on));
    g.nodes.forEach((n) => {
      const isOn = !!on[n.id];
      const why = isOn ? null : mkBlock(on, n);
      const orphan = isOn && (n.pre || []).some((p) => !on[p]);
      const label = n.name + (isOn ? ', on' : why ? ', locked. ' + why : ', off') + (n.use === 'applied' ? ' Used by the tools.' : '');
      box.appendChild(h('button', {
        type: 'button', id: 'pf-mk-' + n.id, class: 'mk-tile' + (isOn ? ' on' : '') + (why ? ' locked' : '') + (orphan ? ' orphan' : '') + (mkUi.sel === n.id ? ' sel' : ''),
        'aria-pressed': String(isOn), 'aria-disabled': why ? 'true' : null, 'aria-label': label, title: n.effect,
        'data-row': n.layout.row, 'data-col': n.layout.col,
        style: 'left:' + g.x(n.layout.col) + 'px;top:' + g.y(n.layout.row) + 'px;width:' + TILE.w + 'px;height:' + TILE.h + 'px',
        onclick: () => mkToggle(n.id), onfocus: () => { if (mkUi.sel !== n.id) { mkUi.sel = n.id; const d = document.getElementById('prf-mk-info'); if (d) d.replaceWith(mkInfo(P.get())); } },
      }, [h('span', { class: 'mk-tile-n' }, n.name), n.use === 'applied' ? h('span', { class: 'mk-used', title: 'Used by the tools' }) : null]));
    });
    const scroller = h('div', { class: 'mk-scroll', id: 'prf-mk-scroll', tabindex: '-1' }, box);
    const hint = h('p', { class: 'ti-note mk-swipe', hidden: true }, 'Swipe sideways for the rest of this tree.');
    scroller.addEventListener('scroll', () => { mkUi.scroll[tree] = scroller.scrollLeft; });
    setTimeout(() => {
      if (mkUi.scroll[tree]) scroller.scrollLeft = mkUi.scroll[tree];
      hint.hidden = !(scroller.scrollWidth > scroller.clientWidth + 2);
    }, 0);
    return [hint, scroller];
  }
  function mkInfo(s) {
    const on = mkState(s);
    const n = mkUi.sel && MK[mkUi.sel];
    if (!n) return h('div', { class: 'mk-info', id: 'prf-mk-info' }, h('p', { class: 'ti-note' }, 'Tap a node to turn it on or off. Its details show here.'));
    const why = on[n.id] ? null : mkBlock(on, n);
    const kids = (mkKids[n.id] || []).map(mkName);
    const use = n.use === 'applied' ? h('span', { class: 'tag tag-banana' }, 'used by the tools') : n.use === 'noted' ? h('span', { class: 'tag' }, 'noted, not used yet') : null;
    return h('div', { class: 'mk-info', id: 'prf-mk-info' }, [
      h('p', { class: 'mk-info-h' }, [h('b', null, n.name), ' ', h('span', { class: 'tag mk-st ' + (on[n.id] ? 'mk-st-on' : '') }, on[n.id] ? 'on' : why ? 'locked' : 'off'), ' ', use]),
      h('p', { class: 'mk-info-d' }, n.effect),
      h('p', { class: 'ti-note' }, [(n.ptsNeeded ? n.ptsNeeded + ' pts in ' + n.tree : 'No points needed') + (n.mm ? ' · ' + C.int(n.mm) + ' MM' : ' · free'),
        (n.pre || []).length ? ' · needs ' + list(n.pre.map(mkName)) : '', kids.length ? ' · leads to ' + list(kids) : '']),
      why ? h('p', { class: 'ti-note mk-why' }, why) : null,
    ]);
  }
  function mkPanel(s) {
    const pr = s.profile;
    const on = mkState(s);
    const fx = C.profileFx(D, pr, s.settings);
    const sum = C.fxSummary(fx);
    const total = Object.keys(on).length;
    const tree = mkUi.tree;
    const treeNodes = (D.mk || []).filter((n) => n.tree === tree);
    const mmIn = treeNodes.filter((n) => on[n.id]).reduce((m, n) => m + (n.mm || 0), 0);
    const orphans = Object.keys(on).filter((k) => (MK[k].pre || []).some((p) => !on[p]));
    const tabs = h('div', { class: 'mk-tabs', role: 'tablist', 'aria-label': 'Monkey Knowledge trees' }, MK_TREES.map((t) => {
      const sel = t === tree;
      return h('button', { type: 'button', role: 'tab', id: 'pf-mkt-' + t, class: 'mk-tab mk-c-' + t.toLowerCase() + (sel ? ' on' : ''), 'aria-selected': String(sel), 'aria-controls': 'prf-mk-tree', tabindex: sel ? '0' : '-1',
        onclick: () => { mkUi.tree = t; mkUi.sel = null; mkUi.msg = ''; render(); },
        onkeydown: (e) => {
          const i = MK_TREES.indexOf(t) + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0);
          if (i !== MK_TREES.indexOf(t) && MK_TREES[i]) { e.preventDefault(); mkUi.tree = MK_TREES[i]; mkUi.sel = null; render(); const b = document.getElementById('pf-mkt-' + MK_TREES[i]); if (b) b.focus(); }
        } }, [h('span', { class: 'mk-dot' }), t, h('small', { class: 'ti-num' }, String(spentIn(on, t)))]);
    }));
    const body = [
      h('div', { class: 'ti-share' }, [
        h('label', { class: 'check' }, [h('input', { type: 'checkbox', id: 'pf-mk-on', checked: pr.mkOn ? true : null, onchange: (e) => { P.setProfile({ mkOn: e.target.checked }); render(); } }), 'Use my Monkey Knowledge in the tools']),
        h('span', { class: 'ti-note' }, pr.mkOn ? (sum.length ? 'Tools apply: ' + sum.join(', ') + '.' : 'Nothing ticked changes cash, prices or XP yet.') : 'Off: the tools plan as if you had none.'),
      ]),
      h('p', { class: 'ti-note' }, 'Tap a node to turn it on. It needs the nodes its arrows come from, and the points shown on its row already spent in that tree. Turning one off also turns off what needs it. A yellow dot marks the ones the Simulator and Advisor use.'),
      orphans.length ? h('p', { class: 'ti-note mk-why' }, orphans.length + ' ticked node' + (orphans.length === 1 ? ' is' : 's are') + ' missing what ' + (orphans.length === 1 ? 'it needs' : 'they need') + ' (saved before the full tree): ' + list(orphans.slice(0, 5).map(mkName).concat(orphans.length > 5 ? [(orphans.length - 5) + ' more'] : [])) + '. Tick the nodes above ' + (orphans.length === 1 ? 'it' : 'them') + '.') : null,
      tabs,
      h('div', { class: 'mk-panel mk-c-' + tree.toLowerCase(), role: 'tabpanel', id: 'prf-mk-tree', 'aria-labelledby': 'pf-mkt-' + tree }, [
        h('div', { class: 'mk-bar' }, [
          h('p', { class: 'mk-spent' }, [h('b', { class: 'ti-num' }, String(spentIn(on, tree))), ' of ' + treeNodes.length + ' points in ' + tree, mmIn ? ' · ' + C.int(mmIn) + ' MM' : '']),
          h('button', { type: 'button', class: 'btn btn-small', id: 'pf-mk-all', onclick: () => mkFillTree(tree, true) }, 'All of ' + tree),
          h('button', { type: 'button', class: 'btn btn-small', id: 'pf-mk-none', onclick: () => mkFillTree(tree, false) }, 'Clear'),
        ]),
        mkTreeView(tree, on),
        h('p', { class: 'ti-note mk-msg', id: 'prf-mk-msg', role: 'status' }, mkUi.msg),
        mkInfo(s),
      ]),
      h('p', { class: 'ti-note' }, [total + ' of ' + (D.mk || []).length + ' nodes on (the game allows ' + ((D.mkMeta && D.mkMeta.maxPoints) || 138) + ' points). CHIMPS and other modes without Monkey Knowledge ignore all of it. What to take first: ', h('a', { href: '../../guides/monkey-knowledge/' }, 'Monkey Knowledge guide'), '.']),
    ];
    return keepOpen(h('details', { class: 'panel ti-details', id: 'prf-mk' }, [
      h('summary', { class: 'panel-h', id: 'prf-mk-sum' }, ['Monkey Knowledge', h('small', null, total + ' ticked')]),
      h('div', { class: 'ti-panel-b ti', style: 'padding-top:10px' }, body),
    ]), 'mk');
  }

  /* ---------- Insta Monkeys ---------- */
  function instaPanel(s) {
    const pr = s.profile;
    const t = C.tower(D, ins.t) || D.towers[0];
    const towerOpts = CLASSES.map((cl) => ({ group: cl, items: D.towers.filter((x) => x.class === cl).map((x) => ({ value: x.id, label: x.name })) }));
    const count = h('input', { class: 'ti-input', id: 'pf-ins-n', type: 'number', min: '1', max: '99', inputmode: 'numeric', value: String(ins.n), style: 'width:6em' });
    count.addEventListener('change', () => { ins.n = Math.max(1, Math.min(99, parseInt(count.value, 10) || 1)); });
    const form = h('div', { class: 'ti-add prf-ins-add' }, [
      h('div', { class: 'ti-row' }, [U.field('Tower', U.combo(towerOpts, t.id, (v) => { ins.t = v; ins.x = [0, 0, 0]; render(); }, { id: 'pf-ins-t' }), 'ti-grow'), U.field('How many', count)]),
      h('div', { class: 'ti-field' }, [h('span', null, ['Crosspath ', U.x(ins.x)]), U.pathSteppers(t, ins.x, (nx) => { ins.x = nx; render(); })]),
      h('div', { class: 'ti-share' }, [h('button', { type: 'button', class: 'btn btn-grass', id: 'pf-ins-add', onclick: () => {
        P.addInsta(t.id, ins.x, ins.n); flash = '+' + ins.n + ' ' + t.name.replace(/ Monkey$/, '') + ' ' + C.code(ins.x); render();
      } }, 'Add to my Instas'), flash ? h('span', { class: 'ti-note', role: 'status' }, flash) : null]),
    ]);
    flash = null;
    const byT = {};
    pr.instas.forEach((i) => { (byT[i.t] = byT[i.t] || []).push(i); });
    const list = Object.keys(byT).length ? h('ul', { class: 'prf-instas' }, D.towers.filter((x) => byT[x.id]).map((x) => h('li', null, [
      h('a', { class: 'prf-ins-t', href: U.towerHref(x.id) }, x.name),
      h('span', { class: 'prf-ins-l' }, byT[x.id].sort((p, q) => q.x.join('').localeCompare(p.x.join(''))).map((i) => h('span', { class: 'prf-ins' }, [
        U.x(i.x), h('span', { class: 'ti-num' }, ' ×' + i.n),
        h('button', { type: 'button', class: 'ti-sbtn', id: 'pf-ins-' + i.t + '-' + i.x.join('') + '-dec', 'aria-label': 'One fewer ' + x.name + ' ' + C.code(i.x), onclick: () => { P.setInsta(i.t, i.x, i.n - 1); render(); } }, '−'),
        h('button', { type: 'button', class: 'ti-sbtn', id: 'pf-ins-' + i.t + '-' + i.x.join('') + '-inc', 'aria-label': 'One more ' + x.name + ' ' + C.code(i.x), onclick: () => { P.setInsta(i.t, i.x, i.n + 1); render(); } }, '+'),
      ]))),
    ]))) : h('p', { class: 'ti-note' }, 'No Insta Monkeys yet. Add the ones in your inventory and the Advisor will start your plan with them for free.');
    return keepOpen(h('details', { class: 'panel ti-details' }, [
      h('summary', { class: 'panel-h', id: 'prf-ins-sum' }, ['Insta Monkeys', h('small', null, pr.instas.reduce((n, i) => n + i.n, 0) + ' in your inventory')]),
      h('div', { class: 'ti-panel-b ti', style: 'padding-top:10px' }, [list, form, h('p', { class: 'ti-note' }, 'Instas are free to place but count as Powers: CHIMPS bans them.')]),
    ]), 'instas');
  }

  /* ---------- backup ---------- */
  function backupPanel() {
    const code = h('textarea', { class: 'ti-input gl-code', rows: '2', readonly: true, 'aria-label': 'Your backup code' });
    code.value = P.exportCode();
    const paste = h('input', { class: 'ti-input', id: 'pf-paste', type: 'text', placeholder: 'Paste a backup code', 'aria-label': 'Paste a backup code', style: 'width:100%' });
    const msg = h('span', { class: 'ti-note', role: 'status' });
    return keepOpen(h('details', { class: 'panel ti-details' }, [
      h('summary', { class: 'panel-h panel-h-light', id: 'prf-bk-sum' }, ['Backup and move to another device', h('small', null, 'tap to open')]),
      h('div', { class: 'ti-panel-b ti', style: 'padding-top:10px' }, [
        h('div', { class: 'ti-field' }, [h('span', null, 'Your profile, goals and runs as one code'), code,
          h('div', { class: 'ti-share' }, [h('button', { type: 'button', class: 'btn btn-small', onclick: (e) => {
            const b = e.currentTarget;
            try { navigator.clipboard.writeText(code.value).then(() => { b.textContent = 'Copied'; }, () => code.select()); } catch (err) { code.select(); }
          } }, 'Copy code')])]),
        h('div', { class: 'ti-field' }, [h('span', null, 'Restore from a code'), paste, h('div', { class: 'ti-share' }, [
          h('button', { type: 'button', class: 'btn btn-small', onclick: () => { if (P.importCode(paste.value)) render(); else msg.textContent = 'That code did not work. Copy the whole thing, starting with MI1.'; } }, 'Restore'), msg])]),
      ]),
    ]), 'backup');
  }

  if (/(^#|&)mk(=|&|$)/.test(String(location.hash || ''))) jump = 'prf-mk';
  const q = String(location.hash || '').match(/tower=([a-z]+)/);
  if (q && C.tower(D, q[1])) { openPanels.towers = true; jump = 'prf-t-' + q[1]; }
  render();
})();
