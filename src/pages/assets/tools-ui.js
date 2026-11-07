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

  /* Solo / 2 / 3 / 4 players (co-op splits pop cash and round bonuses evenly) */
  U.playersField = function (n, onchange, idp) {
    const C = MI.core;
    const cur = C.players(n);
    const seg = U.h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Players' }, [1, 2, 3, 4].map((k) =>
      U.h('button', { type: 'button', role: 'radio', id: idp + '-' + k, 'aria-checked': String(cur === k), onclick: () => onchange(k) }, k === 1 ? 'Solo' : k + ' co-op')));
    return U.h('div', { class: 'ti-field' }, [U.h('span', null, 'Players'), seg]);
  };
  /* the "start $650" fact, with your co-op share */
  U.startFact = function (m, n) {
    const C = MI.core;
    n = C.players(n);
    if (n === 1) return [', start ', U.money(m.startCash)];
    return [', you start with ', U.money(C.coopStart(m, n)), ' and get 1/' + n + ' of pop cash and round bonuses ', U.badge('unverified')];
  };
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
    const list = U.h('ul', { class: 'ti-combo-list', id: listId, role: 'listbox', hidden: true, tabindex: '-1' }); /* a scrolling list is a tab stop in Chrome: not this one */
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
          type: 'button', class: 'ti-tile cls-' + cl, 'aria-pressed': opts.pressed ? String(!!opts.pressed(t)) : null, 'data-fk': (opts.key || 'tile') + '-' + t.id,
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
      const k = (opts.key || 'px') + '-p' + p;
      wrap.appendChild(U.h('div', { class: 'ti-path' }, [
        U.h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Path ' + (p + 1) + ' down', 'data-fk': k + '-dn', 'data-fkb': k + '-up', disabled: x[p] <= min ? true : null,
          onclick: () => onchange(C.setPath(x, p, x[p] - 1)) }, '−'),
        U.h('div', { class: 'ti-path-mid' }, [pips, U.h('span', { class: 'ti-path-name' }, nm)]),
        U.h('button', { type: 'button', class: 'ti-sbtn', 'aria-label': 'Path ' + (p + 1) + ' up', 'data-fk': k + '-up', 'data-fkb': k + '-dn', disabled: x[p] >= 5 ? true : null,
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

  /* tool pages live at /tools/<slug>/: tower pages are two folders up */
  U.towerHref = (id) => '../../monkeys/' + id + '/';
  /* your unlocks from My goals / the XP calculator, as {towerId: [a,b,c]} (only towers you have set) */
  U.myUnlocks = function () {
    const P = MI.progress;
    if (!P) return null;
    const s = P.get();
    const out = {};
    Object.keys(s.towers).forEach((id) => { if (s.towers[id].set) out[id] = s.towers[id].u.slice(); });
    return Object.keys(out).length ? out : null;
  };

  /* Monkey Education is true / false / null (not set yet). The engine counts anything but false as on, so the tools pass
     this: on only when you set it. */
  U.mkSettings = (st) => ({ me: !!(st && st.me === true), emt: !!(st && st.emt), maxTier: st && st.maxTier });
  /* your profile for the tools: Monkey Knowledge effects, heroes you own, Insta inventory. Safe without progress.js. */
  U.me = function (D) {
    const P = MI.progress;
    const C = MI.core;
    if (!P) return { fx: null, ownsHero: () => true, instas: [], instaMap: null, profile: null, summary: [], has: false };
    const s = P.get();
    const pr = s.profile;
    const fx = C.profileFx(D, pr, U.mkSettings(s.settings));
    const instaMap = {};
    pr.instas.forEach((i) => { const k = i.t + '.' + i.x.join(''); instaMap[k] = (instaMap[k] || 0) + i.n; });
    const ownsHero = (id) => !pr.heroes || pr.heroes[id] !== false;
    return { fx, ownsHero, instas: pr.instas, instaMap, profile: pr, settings: s.settings, summary: C.fxSummary(fx), meUnset: s.settings.me == null,
      missing: pr.missing || {}, has: !!(Object.keys(pr.mk).length || pr.instas.length || pr.heroes || Object.keys(pr.missing).length || pr.level != null) };
  };
  /* one line under "Your game": what your profile changes in this mode */
  U.profileLine = function (D, mode, me) {
    const C = MI.core;
    if (!MI.progress) return null;
    const href = '../profile/';
    if (!me.has && !me.summary.length) return U.h('p', { class: 'ti-note ti-prof' }, ['Set your Monkey Knowledge, heroes and Insta Monkeys in ', U.h('a', { href }, 'My profile'), ' and the tools will use them. Until then they plan with none (no Monkey Education).']);
    if (!C.mkActive(mode)) return U.h('p', { class: 'ti-note ti-prof' }, [mode.name + ' turns Monkey Knowledge off, so the bonuses in ', U.h('a', { href }, 'your profile'), ' don\'t apply here.']);
    const bits = me.summary.length ? me.summary.join(', ') : 'no Monkey Knowledge that changes cash or heroes';
    return U.h('p', { class: 'ti-note ti-prof' }, [U.h('span', { class: 'tag tag-sky' }, 'Your profile'), ' ' + bits + (me.meUnset ? ' (Monkey Education not set: counted as off)' : '') + (me.fx && me.fx.unverified ? ' ' : ''), me.fx && me.fx.unverified ? U.badge('unverified') : null, ' · ', U.h('a', { href, class: 'ti-tap' }, 'edit')]);
  };

  /* ---------- focus and place across a re-render ----------
     The tools rebuild their root on every edit. Before: U.snapFocus() remembers the control you used (its data-fk key or id,
     or the button you just tapped: phones don't focus buttons) and where it sat on screen. After: U.restoreFocus(snap, root)
     focuses the new copy without scrolling, then scrolls by the difference so that control stays under your finger.
     A control that is gone or disabled hands over to its data-fkb fallback, then to the nearest panel heading. */
  let lastTap = null;
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('pointerdown', (e) => {
      const el = e.target && e.target.closest ? e.target.closest('button, a, input, select, summary, [tabindex]') : null;
      lastTap = el ? { el, t: Date.now() } : null;
    }, true);
  }
  const keyOf = (el) => (el && el.getAttribute ? el.getAttribute('data-fk') || el.id || null : null);
  U.snapFocus = function () {
    if (typeof document === 'undefined') return null;
    let el = document.activeElement;
    if ((!el || el === document.body) && lastTap && Date.now() - lastTap.t < 1500) el = lastTap.el;
    if (!el || el === document.body || !el.getBoundingClientRect) return null;
    const key = keyOf(el);
    if (!key) return null;
    return { key, fb: el.getAttribute('data-fkb'), y: el.getBoundingClientRect().top, focused: document.activeElement === el };
  };
  const findKey = (root, k) => {
    if (!k) return null;
    const esc = (v) => (window.CSS && CSS.escape ? CSS.escape(v) : v.replace(/["\\]/g, '\\$&'));
    return root.querySelector('[data-fk="' + esc(k) + '"]') || document.getElementById(k);
  };
  U.restoreFocus = function (snap, root) {
    if (!snap || !root) return null;
    let el = findKey(root, snap.key);
    if (!el || el.disabled || el.hidden) el = findKey(root, snap.fb) || el;
    if (el && el.disabled) el = (el.parentNode && el.parentNode.querySelector('button:not([disabled])')) || null;
    if (!el) {
      el = root.querySelector('.panel-h[tabindex], .ti-alert[tabindex]');
      if (!el) return null;
    }
    const y0 = snap.y;
    if (el.classList && el.classList.contains('ti-combo-in')) el.dataset.quiet = '1'; /* don't reopen the list */
    if (snap.focused || document.activeElement === document.body || !document.activeElement) {
      try { el.focus({ preventScroll: true }); } catch (e) { /* old browser */ }
      if (el.dataset && el.dataset.quiet) delete el.dataset.quiet;
    }
    const dy = el.getBoundingClientRect().top - y0;
    if (Math.abs(dy) > 2 && !root.dataset.noAnchor) window.scrollBy(0, dy);
    return el;
  };
  /* rebuild root with build(), keeping focus and place */
  U.rerender = function (root, build) {
    const snap = U.snapFocus();
    build();
    U.restoreFocus(snap, root);
  };

  /* ---------- the result, kept in reach on a phone ----------
     A slim bar fixed to the bottom of the screen with the result in one line. It shows only on narrow screens and only
     while the result box itself is out of view, so it never covers what you are reading. Tap it to jump to the result. */
  let dock = null, dockObs = null, dockTarget = null, dockSeen = true;
  U.resultDock = function (target, info) {
    if (typeof document === 'undefined' || !target) return;
    if (!dock) {
      dock = U.h('button', { type: 'button', class: 'ti-dock', id: 'ti-dock', hidden: true, 'aria-live': 'polite' }, [U.h('span', { class: 'ti-dock-t' }), U.h('span', { class: 'ti-dock-go' }, 'See')]);
      dock.addEventListener('click', () => {
        if (!dockTarget) return;
        dockTarget.scrollIntoView({ block: 'start', behavior: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        if (!dockTarget.hasAttribute('tabindex')) dockTarget.setAttribute('tabindex', '-1');
        try { dockTarget.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      });
      document.body.appendChild(dock);
    }
    dock.className = 'ti-dock ti-dock-' + (info.tone || 'bad');
    dock.firstChild.textContent = info.text;
    dock.setAttribute('aria-label', info.text + '. Show the result');
    if (dockObs) dockObs.disconnect();
    dockTarget = target;
    const sync = () => { dock.hidden = dockSeen; document.body.classList.toggle('has-dock', !dockSeen); };
    if (typeof IntersectionObserver === 'undefined') { dockSeen = true; sync(); return; }
    dockObs = new IntersectionObserver((ents) => { ents.forEach((e) => { dockSeen = e.isIntersecting; }); sync(); }, { threshold: 0 });
    dockObs.observe(target);
  };

  /* " · cheapest fix $280" for the dock line */
  U.cheapestFix = function (fixes) {
    const c = (fixes || []).filter((f) => f.kind !== 'hero' && f.cost > 0).map((f) => f.cost);
    return c.length ? ' · cheapest fix ' + MI.core.money(Math.min.apply(null, c)) : '';
  };
  /* problem text from the engine: big numbers get separators, "RBE" links to the glossary (first time only) */
  U.probText = function (s, opts) {
    const out = [];
    let linked = !!(opts && opts.noLink);
    String(s || '').replace(/\b\d{4,}\b/g, (n) => (+n).toLocaleString('en-US')).split(/(\bRBE\b)/).forEach((part) => {
      if (part === 'RBE' && !linked) { linked = true; out.push(U.h('a', { href: '../../guides/glossary/#g-rbe', class: 'ti-rbe', title: 'Red Bloon Equivalent: how many single pops it takes to clear the bloons and all their children' }, 'RBE')); }
      else if (part) out.push(part);
    });
    return out;
  };
  /* "RBE" in one short line, for result boxes that show it */
  U.rbeNote = () => U.h('p', { class: 'ti-alert-s ti-rbe-note' }, ['RBE (Red Bloon Equivalent) is how many single pops it takes to clear a round. ', U.h('a', { href: '../../guides/glossary/#g-rbe' }, 'Glossary')]);

  U.fixList = function (fixes, opts) {
    const C = MI.core;
    const ul = U.h('ul', { class: 'ti-fixes' });
    const kind = { upgrade: 'Upgrade a tower you have', new: 'Add a tower', support: 'Add support', hero: 'Your hero', pair: 'Two buys together' };
    fixes.forEach((f) => {
      let label, cost;
      if (f.kind === 'hero') {
        label = [f.label + ' handles it from level ' + f.level + (f.round ? ', about ' : '')].concat(f.round ? [U.rchip(f.round, 'ti-r-plain')] : []);
        cost = U.h('span', { class: 'ti-fix-c' }, [U.h('small', null, 'estimate')]);
      } else {
        label = f.kind === 'pair'
          ? [].concat(...(f.parts || []).map((p, i) => [i ? ' + ' : '', p.kind === 'upgrade' ? p.label + ' to ' : (p.towerId ? U.h('a', { href: U.towerHref(p.towerId) }, p.label) : p.label) + ' ', U.x(p.x)]))
          : f.kind === 'upgrade'
            ? [f.label + ' to ', U.x(f.x), f.name ? ' (' + f.name + ')' : '']
            : [f.towerId ? U.h('a', { href: U.towerHref(f.towerId) }, f.label) : f.label, ' ', U.x(f.x), f.name ? ' (' + f.name + ')' : ''];
        if (f.note) label = label.concat([U.h('small', { class: 'ti-fix-note' }, ' ' + f.note)]);
        cost = U.h('span', { class: 'ti-fix-c' }, [U.money(f.cost), f.affordable === false ? U.h('small', null, 'more than you have') : f.affordable ? U.h('small', null, 'you can afford it') : null]);
      }
      ul.appendChild(U.h('li', null, [U.h('span', null, [U.h('span', { class: 'ti-fix-k' }, kind[f.kind] || ''), U.h('span', { class: 'ti-fix-l' }, label)]), cost]));
    });
    if (!fixes.length) ul.appendChild(U.h('li', null, [U.h('span', { class: 'ti-fix-l' }, (opts && opts.empty) || 'No fix in the data for this mode.'), U.h('span')]));
    /* conditional entries from the pop model: abilities and helper effects. Shown as hints, never counted. */
    ((opts && opts.hints) || []).forEach((t) => ul.appendChild(U.h('li', { class: 'ti-fix-hint' }, [U.h('span', null, [U.h('span', { class: 'ti-fix-k' }, (opts && opts.hintLabel) || 'Also, not counted'), U.h('span', { class: 'ti-fix-l' }, t)]), U.h('span')])));
    return ul;
  };

  /* a suggestion as {id, x} ("x" read as 0: "x-x-3" is 0-0-3) or {hero}; null for support and avoid lines */
  U.sugBuild = function (s) {
    const C = MI.core;
    if (s && s.kind !== 'avoid' && s.hero && !s.tower && C.hero(U.data(), s.hero)) return { hero: s.hero };
    if (!s || s.kind === 'avoid' || !s.tower || !C.tower(U.data(), s.tower)) return null;
    const x = String(s.x || '0-0-0').split('-').map((v) => (/^\d$/.test(v) ? +v : 0));
    return x.length === 3 && C.validCross(x) ? { id: s.tower, x } : null;
  };
  /* onAdd(build, s): when given, each tower suggestion gets an Add button */
  U.suggestionList = function (list, max, onAdd) {
    const ul = U.h('ul', { class: 'ti-sugs' });
    list.slice(0, max || 6).forEach((s) => {
      const k = s.kind === 'avoid' ? ['ti-sug-no', 'Avoid'] : s.strength === 'core' ? ['ti-sug-core', 'Core'] : ['ti-sug-nice', 'Nice'];
      ul.appendChild(U.h('li', { class: 'ti-sug' + (s.kind === 'avoid' ? ' ti-sug-avoid' : '') }, [
        U.h('span', { class: 'ti-sug-k ' + k[0] }, k[1]),
        U.h('span', null, [
          U.h('span', { class: 'ti-sug-l' }, s.kind === 'avoid' ? s.name : [s.name + ' ', s.x ? U.h('span', { class: 'ti-x' }, s.x) : null]),
          U.h('br'), U.h('span', { class: 'ti-sug-w' }, s.why),
          s.pairsWith && s.pairsWith.length ? U.h('span', { class: 'ti-sug-p' }, [U.h('br'), 'Pairs with your ' + s.pairsWith.join(', ')]) : null,
          onAdd && U.sugBuild(s) ? U.h('span', { class: 'ti-fix-a', style: 'justify-content:flex-start' }, U.h('button', { type: 'button', class: 'btn btn-small btn-grass', 'data-fk': 'sug-' + (s.tower || s.hero) + '-' + (s.x || ''), 'data-fkb': 'sug-panel', onclick: () => onAdd(U.sugBuild(s), s) }, (U.sugBuild(s).hero ? 'Use ' : 'Add ') + s.name.replace(/ Monkey$/, ''))) : null,
        ]),
        s.unverified ? U.badge('unverified') : U.h('span'),
      ]));
    });
    return ul;
  };
})(typeof window !== 'undefined' ? window : globalThis);
