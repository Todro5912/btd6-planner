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
  const openPanels = { towers: true };

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

  /* ---------- Monkey Knowledge ---------- */
  function mkPanel(s) {
    const pr = s.profile;
    const isOn = (n) => (n.id === 'monkey-education' ? s.settings.me !== false : n.id === 'elite-military-training' ? !!s.settings.emt : !!pr.mk[n.id]);
    const flip = (n, v) => {
      if (n.id === 'monkey-education') P.update((x) => { x.settings.me = v; });
      else if (n.id === 'elite-military-training') P.update((x) => { x.settings.emt = v; });
      else { const m = Object.assign({}, pr.mk); if (v) m[n.id] = true; else delete m[n.id]; P.setProfile({ mk: m }); }
      render();
    };
    const groups = {};
    (D.mk || []).forEach((n) => { const g = n.tree || n.group || 'Other'; (groups[g] = groups[g] || []).push(n); });
    const order = ((D.mkMeta && D.mkMeta.trees) || []).concat(Object.keys(groups).filter((g) => ((D.mkMeta && D.mkMeta.trees) || []).indexOf(g) < 0));
    const fx = C.profileFx(D, pr, s.settings);
    const sum = C.fxSummary(fx);
    const body = [
      h('div', { class: 'ti-share' }, [
        h('label', { class: 'check' }, [h('input', { type: 'checkbox', id: 'pf-mk-on', checked: pr.mkOn ? true : null, onchange: (e) => { P.setProfile({ mkOn: e.target.checked }); render(); } }), 'Use my Monkey Knowledge in the tools']),
        h('span', { class: 'ti-note' }, pr.mkOn ? (sum.length ? 'Tools apply: ' + sum.join(', ') + '.' : 'Nothing ticked changes cash or heroes yet.') : 'Off: the tools plan as if you had none.'),
      ]),
    ];
    order.forEach((g) => {
      if (!groups[g]) return;
      body.push(h('div', { class: 'prf-mk-g' }, [h('p', { class: 'ti-lbl' }, g), h('ul', { class: 'prf-mk' }, groups[g].map((n) => h('li', null, h('label', { class: 'check prf-mk-i' }, [
        h('input', { type: 'checkbox', id: 'pf-mk-' + n.id, checked: isOn(n) ? true : null, onchange: (e) => flip(n, e.target.checked) }),
        h('span', null, [h('b', null, n.name), n.fx ? [' ', h('span', { class: 'tag tag-sky prf-used' }, 'used by the tools')] : null, n.fx && n.fx.unverified ? [' ', U.badge('unverified')] : null,
          h('br'), h('span', { class: 'ti-note' }, n.effect + (n.ptsNeeded != null || n.mm ? ' · needs ' + (n.ptsNeeded || 0) + ' pts in tree' + (n.mm ? ', ' + C.int(n.mm) + ' MM' : '') : ''))]),
      ]))))]));
    });
    body.push(h('p', { class: 'ti-note' }, ['CHIMPS and other modes without Monkey Knowledge ignore all of it. Full tree and what to take first: ', h('a', { href: '../../guides/monkey-knowledge/' }, 'Monkey Knowledge guide'), '.']));
    return keepOpen(h('details', { class: 'panel ti-details' }, [
      h('summary', { class: 'panel-h', id: 'prf-mk-sum' }, ['Monkey Knowledge', h('small', null, (Object.keys(pr.mk).length + (s.settings.me !== false ? 1 : 0) + (s.settings.emt ? 1 : 0)) + ' ticked')]),
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

  const q = String(location.hash || '').match(/tower=([a-z]+)/);
  if (q && C.tower(D, q[1])) { openPanels.towers = true; jump = 'prf-t-' + q[1]; }
  render();
})();
