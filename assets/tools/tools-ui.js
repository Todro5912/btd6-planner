/* Monkey Intel tools: small shared DOM helpers (simulator, xp, defence). */
(function (root) {
  'use strict';
  const MI = root.MonkeyIntel = root.MonkeyIntel || {};
  const U = MI.ui = {};

  U.h = function (tag, attrs, kids) {
    const el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach((k) => {
      const v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    const add = (c) => {
      if (c == null || c === false) return;
      if (Array.isArray(c)) { c.forEach(add); return; }
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    };
    add(kids);
    return el;
  };
  U.clear = (el) => { while (el && el.firstChild) el.removeChild(el.firstChild); return el; };
  U.store = {
    get(k) { try { const v = root.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(k, v) { try { root.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage off */ } },
  };
  U.rchip = (r, cls) => U.h('span', { class: 'ti-r' + (cls ? ' ' + cls : '') }, 'R' + r);
  U.x = (x) => U.h('span', { class: 'ti-x' }, MI.core.code(x));
  U.money = (v) => U.h('span', { class: 'ti-money' + (v < 0 ? ' ti-neg' : '') }, MI.core.money(v));
  U.badge = (kind, text) => U.h('span', { class: 'badge badge-' + kind, title: kind === 'unverified' ? 'Not yet checked in game' : 'Worked out from the data, not play-tested' }, text || kind);

  U.data = function () {
    const D = root.MonkeyIntelData;
    if (!D) throw new Error('tools-data.js did not load');
    return D;
  };
  /* "preview data" note while stream D's pop model is missing */
  U.previewNote = function (D) {
    if (!D.meta || D.meta.popSource !== 'fixture') return null;
    const n = Object.keys((D.pop && D.pop.towers) || {}).length;
    return U.h('p', { class: 'ti-preview', role: 'note' }, [
      U.h('b', null, 'Preview data'),
      'What-pops-what uses a preview model for ' + n + ' of ' + D.towers.length + ' towers. Towers outside it are not counted yet.',
    ]);
  };
  U.select = function (opts, value, onchange, attrs) {
    const s = U.h('select', attrs || null);
    opts.forEach((o) => {
      if (o.group) {
        const g = U.h('optgroup', { label: o.group });
        o.items.forEach((it) => g.appendChild(U.h('option', { value: it.value, selected: it.value === value ? true : null, disabled: it.disabled ? true : null }, it.label)));
        s.appendChild(g);
      } else s.appendChild(U.h('option', { value: o.value, selected: o.value === value ? true : null, disabled: o.disabled ? true : null }, o.label));
    });
    s.addEventListener('change', () => onchange(s.value));
    return s;
  };
  U.field = (label, control, cls) => U.h('label', { class: 'ti-field' + (cls ? ' ' + cls : '') }, [U.h('span', null, label), control]);

  U.mapOptions = function (D) {
    return MI.core.TIERS.map((tier) => ({ group: tier + ' maps', items: D.maps.filter((m) => m.difficulty === tier).map((m) => ({ value: m.id, label: m.name })) }));
  };
  U.modeOptions = function (D) {
    const groups = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
    return Object.keys(groups).map((b) => ({ group: groups[b], items: D.modes.filter((m) => m.base === b && !MI.core.isSandbox(m)).map((m) => ({ value: m.id, label: m.name })) }));
  };
  U.heroOptions = function (D, none) {
    return [{ value: '', label: none || 'No hero' }].concat(D.heroes.map((h) => ({ value: h.id, label: h.name })));
  };

  /* tower grid: big tap targets; hint(t) -> [{cls, text}] */
  U.towerGrid = function (D, opts) {
    const C = MI.core;
    const grid = U.h('div', { class: 'ti-towers', role: 'group', 'aria-label': opts.label || 'Towers' });
    ['Primary', 'Military', 'Magic', 'Support'].forEach((cl) => {
      D.towers.filter((t) => t.class === cl).forEach((t) => {
        const issue = opts.issue ? opts.issue(t) : null;
        const hints = opts.hint ? opts.hint(t) : [];
        const b = U.h('button', {
          type: 'button', class: 'ti-tile cls-' + cl, 'aria-pressed': opts.pressed ? String(!!opts.pressed(t)) : null,
          disabled: issue ? true : null, title: issue || null,
          onclick: () => opts.onpick(t),
        }, [
          U.h('span', { class: 'ti-tile-n' }, t.name.replace(/ Monkey$/, '').replace(/^Monkey /, '')),
          U.h('span', { class: 'ti-tile-c' }, opts.cost ? C.money(opts.cost(t)) : ''),
        ].concat(hints.map((x) => U.h('span', { class: 'ti-hint ti-hint-' + x.cls }, x.text))));
        grid.appendChild(b);
      });
    });
    return grid;
  };

  /* three path rows with -/+ steppers and pips; onchange(newX) */
  U.pathSteppers = function (t, x, onchange, opts) {
    const C = MI.core;
    opts = opts || {};
    const wrap = U.h('div', { class: 'ti-paths' });
    for (let p = 0; p < 3; p++) {
      const pips = U.h('span', { class: 'ti-pips', 'aria-hidden': 'true' });
      for (let k = 1; k <= 5; k++) pips.appendChild(U.h('span', { class: 'ti-pip' + (x[p] >= k ? ' on' : '') + (k === 5 ? ' t5' : '') }));
      const nm = x[p] > 0 ? C.upgradeName(t, p, x[p]) : 'Path ' + (p + 1) + ': none';
      const min = opts.min ? opts.min[p] : 0;
      wrap.appendChild(U.h('div', { class: 'ti-path' }, [
        U.h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Path ' + (p + 1) + ' down', disabled: x[p] <= min ? true : null,
          onclick: () => onchange(C.setPath(x, p, x[p] - 1)) }, '−'),
        U.h('div', { class: 'ti-path-mid' }, [pips, U.h('span', { class: 'ti-path-name' }, nm)]),
        U.h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Path ' + (p + 1) + ' up', disabled: x[p] >= 5 ? true : null,
          onclick: () => {
            const nx = C.setPath(x, p, x[p] + 1);
            if (opts.min && !C.geq(nx, opts.min)) return; /* would undo bought tiers */
            onchange(nx);
          } }, '+'),
      ]));
    }
    return wrap;
  };

  U.fixList = function (fixes, opts) {
    const C = MI.core;
    const ul = U.h('ul', { class: 'ti-fixes' });
    const kind = { upgrade: 'Upgrade a tower you have', new: 'Add a tower', support: 'Add support', hero: 'Your hero' };
    fixes.forEach((f) => {
      let label, cost;
      if (f.kind === 'hero') {
        label = [f.label + ' handles it from level ' + f.level + (f.round ? ', about ' : '')].concat(f.round ? [U.rchip(f.round, 'ti-r-plain')] : []);
        cost = U.h('span', { class: 'ti-fix-c' }, [U.h('small', null, 'estimate')]);
      } else {
        label = f.kind === 'upgrade'
          ? [f.label + ' to ', U.x(f.x), f.name ? ' (' + f.name + ')' : '']
          : [f.label + ' ', U.x(f.x), f.name ? ' (' + f.name + ')' : ''];
        cost = U.h('span', { class: 'ti-fix-c' }, [U.money(f.cost), f.affordable === false ? U.h('small', null, 'more than you have') : f.affordable ? U.h('small', null, 'you can afford it') : null]);
      }
      ul.appendChild(U.h('li', null, [U.h('span', null, [U.h('span', { class: 'ti-fix-k' }, kind[f.kind] || ''), U.h('span', { class: 'ti-fix-l' }, label)]), cost]));
    });
    if (!fixes.length) ul.appendChild(U.h('li', null, [U.h('span', { class: 'ti-fix-l' }, (opts && opts.empty) || 'No fix in the data for this mode.'), U.h('span')]));
    /* conditional entries from the pop model: abilities and helper effects. Shown as hints, never counted. */
    ((opts && opts.hints) || []).forEach((t) => ul.appendChild(U.h('li', { class: 'ti-fix-hint' }, [U.h('span', null, [U.h('span', { class: 'ti-fix-k' }, 'Also, not counted'), U.h('span', { class: 'ti-fix-l' }, t)]), U.h('span')])));
    return ul;
  };

  U.suggestionList = function (list, max) {
    const ul = U.h('ul', { class: 'ti-sugs' });
    list.slice(0, max || 6).forEach((s) => {
      const k = s.kind === 'avoid' ? ['ti-sug-no', 'Avoid'] : s.strength === 'core' ? ['ti-sug-core', 'Core'] : ['ti-sug-nice', 'Nice'];
      ul.appendChild(U.h('li', { class: 'ti-sug' + (s.kind === 'avoid' ? ' ti-sug-avoid' : '') }, [
        U.h('span', { class: 'ti-sug-k ' + k[0] }, k[1]),
        U.h('span', null, [
          U.h('span', { class: 'ti-sug-l' }, s.kind === 'avoid' ? s.name : [s.name + ' ', s.x ? U.h('span', { class: 'ti-x' }, s.x) : null]),
          U.h('br'), U.h('span', { class: 'ti-sug-w' }, s.why),
          s.pairsWith && s.pairsWith.length ? U.h('span', { class: 'ti-sug-p' }, [U.h('br'), 'Pairs with your ' + s.pairsWith.join(', ')]) : null,
        ]),
        s.unverified ? U.badge('unverified') : U.h('span'),
      ]));
    });
    return ul;
  };
})(typeof window !== 'undefined' ? window : globalThis);
