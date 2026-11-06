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
    return MI.core.TIERS.map((tier) => ({ group: tier + ' maps', items: D.maps.filter((m) => m.difficulty === tier).map((m) => ({
      value: m.id, label: m.name,
      keys: [m.water && m.water !== 'none' ? 'water' : 'no water', m.losBlockers && m.losBlockers !== 'none' ? 'line of sight blockers' : ''].join(' '),
    })) }));
  };
  const MODE_KEYS = { abr: 'abr', chimps: 'chimps black border', impoppable: 'imp', 'double-hp-moabs': 'dhp double hp', 'half-cash': 'half cash', 'primary-only': 'primary', 'military-only': 'military', 'magic-monkeys-only': 'magic' };
  U.modeOptions = function (D) {
    const groups = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
    return Object.keys(groups).map((b) => ({ group: groups[b], items: D.modes.filter((m) => m.base === b && !MI.core.isSandbox(m))
      .map((m) => ({ value: m.id, label: m.name, keys: (MODE_KEYS[m.id] || '') + ' R' + m.startRound + ' R' + m.endRound })) }));
  };
  U.heroOptions = function (D, none) {
    return [{ value: '', label: none || 'No hero', keys: 'none' }].concat(D.heroes.map((h) => ({ value: h.id, label: h.name })));
  };

  /* Type-to-search picker with the same arguments as U.select: opts (plain or {group, items}), value, onchange(value), attrs.
     Matches words anywhere in the name, its group ("expert", "hard") or initials ("mm" = Monkey Meadow).
     Keys: arrows move, Enter picks, Esc puts back what was there. Items may carry `keys` (extra search words). */
  let comboN = 0;
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  U.comboScore = function (it, q) {
    const w = fold(q);
    if (!w) return 1;
    const label = fold(it.label);
    const words = label.split(' ');
    const hay = label + ' ' + fold(it.group) + ' ' + fold(it.keys) + ' ' + fold(it.value);
    const initials = words.map((x) => x[0]).join('');
    if (label === w) return 100;
    if (label.indexOf(w) === 0) return 80;
    if (initials.indexOf(w.replace(/ /g, '')) === 0 && w.length >= 2) return 70;
    if (words.some((x) => x.indexOf(w) === 0)) return 60;
    const parts = w.split(' ');
    if (parts.every((p) => hay.split(' ').some((x) => x.indexOf(p) === 0))) return 40;
    if (parts.every((p) => hay.indexOf(p) >= 0)) return 20;
    return 0;
  };
  U.combo = function (opts, value, onchange, attrs) {
    attrs = attrs || {};
    const id = attrs.id || 'ti-combo-' + (++comboN);
    const items = [];
    opts.forEach((o) => {
      if (o.group) o.items.forEach((it) => items.push(Object.assign({ group: o.group }, it)));
      else items.push(o);
    });
    const cur = items.find((it) => it.value === value) || null;
    const listId = id + '-list';
    const input = U.h('input', {
      type: 'text', id, class: 'ti-combo-in', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false',
      'aria-controls': listId, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done',
      placeholder: attrs.placeholder || 'Type to search', 'aria-label': attrs['aria-label'] || null,
    });
    input.value = cur ? cur.label : '';
    const list = U.h('ul', { class: 'ti-combo-list', id: listId, role: 'listbox', hidden: true });
    const wrap = U.h('div', { class: 'ti-combo' + (attrs.class ? ' ' + attrs.class : '') }, [input, U.h('span', { class: 'ti-combo-caret', 'aria-hidden': 'true' }), list]);
    let shown = [];
    let active = -1;
    let open = false;
    let typed = false;
    let done = false; /* picked: the page re-renders and this input is thrown away */
    function paint() {
      U.clear(list);
      let lastGroup = null;
      shown.forEach((it, i) => {
        if (!typed && it.group && it.group !== lastGroup) list.appendChild(U.h('li', { class: 'ti-combo-g', role: 'presentation' }, it.group));
        lastGroup = it.group;
        const li = U.h('li', {
          id: listId + '-' + i, role: 'option', class: 'ti-combo-o' + (i === active ? ' on' : '') + (it.disabled ? ' off' : ''),
          'aria-selected': String(i === active), 'aria-disabled': it.disabled ? 'true' : null,
        }, [U.h('span', null, it.label), typed && it.group ? U.h('small', null, it.group) : null, cur && it.value === cur.value ? U.h('b', { class: 'ti-combo-now' }, 'now') : null]);
        li.addEventListener('mousedown', (e) => { e.preventDefault(); if (!it.disabled) choose(it, false); });
        list.appendChild(li);
      });
      if (!shown.length) list.appendChild(U.h('li', { class: 'ti-combo-none', role: 'presentation' }, 'No match. Try fewer letters.'));
      input.setAttribute('aria-activedescendant', active >= 0 ? listId + '-' + active : '');
      const el = active >= 0 ? document.getElementById(listId + '-' + active) : null;
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }
    function filter(q) {
      typed = !!fold(q);
      if (!typed) { shown = items.slice(); active = cur ? Math.max(0, shown.indexOf(cur)) : 0; }
      else {
        shown = items.map((it, i) => ({ it, i, s: U.comboScore(it, q) })).filter((x) => x.s > 0).sort((a, b) => (b.s - a.s) || (a.i - b.i)).map((x) => x.it);
        active = shown.findIndex((it) => !it.disabled);
      }
      paint();
    }
    function show() {
      if (open) return;
      open = true;
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      wrap.classList.add('open');
    }
    function hide(revert) {
      open = false;
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      wrap.classList.remove('open');
      if (revert) input.value = cur ? cur.label : '';
    }
    function choose(it, byKey) {
      if (done) return;
      done = true;
      hide(false);
      input.value = it.label;
      if (!cur || it.value !== cur.value) onchange(it.value);
      else done = false;
      /* keyboard users keep their place: focus the new copy of this field without opening it */
      const again = byKey ? document.getElementById(id) : null;
      if (again && again !== document.activeElement) { again.dataset.quiet = '1'; again.focus(); }
    }
    input.addEventListener('focus', () => {
      if (input.dataset.quiet) { delete input.dataset.quiet; return; }
      try { input.select(); } catch (e) { /* ignore */ }
      filter('');
      show();
    });
    input.addEventListener('click', () => { if (!open) { filter(''); show(); } });
    input.addEventListener('input', () => { filter(input.value); show(); });
    input.addEventListener('blur', () => {
      if (done) return;
      const exact = typed && shown.find((it) => !it.disabled && fold(it.label) === fold(input.value));
      if (exact) choose(exact, false);
      else hide(true);
    });
    input.addEventListener('keydown', (e) => {
      const k = e.key;
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        e.preventDefault();
        if (!open) { filter(''); show(); return; }
        const step = k === 'ArrowDown' ? 1 : -1;
        for (let n = 0, i = active; n < shown.length; n++) {
          i = (i + step + shown.length) % shown.length;
          if (!shown[i].disabled) { active = i; break; }
        }
        paint();
      } else if (k === 'Enter') {
        if (open && active >= 0 && shown[active] && !shown[active].disabled) { e.preventDefault(); choose(shown[active], true); }
      } else if (k === 'Escape') {
        if (open) { e.preventDefault(); e.stopPropagation(); hide(true); input.select(); }
      } else if (k === 'Tab') {
        if (open && typed && active >= 0 && shown[active] && !shown[active].disabled) choose(shown[active], false);
      }
    });
    return wrap;
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

  /* strategy text from the map pages: **bold**, crosspath codes in mono, {calc}/{unverified} as badges */
  U.richText = function (s) {
    const out = [];
    String(s || '').split(/(\*\*[^*]+\*\*|\{calc\}|\{unverified\}|\b[0-5x]-[0-5x]-[0-5x]\b)/).forEach((part) => {
      if (!part) return;
      if (/^\*\*[^*]+\*\*$/.test(part)) out.push(U.h('b', null, part.slice(2, -2)));
      else if (part === '{calc}') out.push(' ', U.badge('calc', 'calculated'));
      else if (part === '{unverified}') out.push(' ', U.badge('unverified'));
      else if (/^[0-5x]-[0-5x]-[0-5x]$/.test(part)) out.push(U.h('span', { class: 'ti-x' }, part));
      else out.push(part);
    });
    return out;
  };
  U.tips = (mapId) => (root.MonkeyIntelTips && root.MonkeyIntelTips[mapId]) || null;
  /* the map page's plan that fits this mode: CHIMPS, Hard (and harder) or Easy/Medium */
  U.planFor = function (tips, mode) {
    if (!tips || !mode) return null;
    if (mode.id === 'chimps' && tips.chimps.length) return { label: 'CHIMPS plan', steps: tips.chimps };
    if (mode.base === 'hard') return tips.hard.length ? { label: 'Hard plan', steps: tips.hard } : (tips.chimps.length ? { label: 'CHIMPS plan', steps: tips.chimps } : null);
    return tips.easy.length ? { label: 'Easy and Medium plan', steps: tips.easy } : null;
  };
  U.stepList = (list, max) => U.h('ul', { class: 'steps-list' }, list.slice(0, max || list.length).map((s) => U.h('li', null, U.richText(s))));
  U.keyRounds = function (tips, a, b, max) {
    const list = ((tips && tips.keyRounds) || []).filter((k) => k[0] >= a && k[0] <= b).slice(0, max || 99);
    if (!list.length) return null;
    return U.h('ul', { class: 'ti-keyrounds' }, list.map((k) => U.h('li', null, [U.rchip(k[0], 'ti-r-danger'), U.h('span', null, U.richText(k[1]))])));
  };

  /* read-only 3 x 5 pips, the way the game shows a crosspath */
  U.pathPips = function (t, x) {
    const C = MI.core;
    return U.h('div', { class: 'ti-pathpips', role: 'img', 'aria-label': 'Crosspath ' + C.code(x) }, [0, 1, 2].map((p) => {
      const pips = U.h('span', { class: 'ti-pips' });
      for (let k = 1; k <= 5; k++) pips.appendChild(U.h('span', { class: 'ti-pip' + (x[p] >= k ? ' on' : '') + (k === 5 ? ' t5' : '') }));
      return U.h('div', { class: 'ti-pathpip' }, [pips, U.h('span', { class: 'ti-path-name' }, x[p] > 0 ? C.upgradeName(t, p, x[p]) : '–')]);
    }));
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
