/* Monkey Intel: your progress, kept in this browser (localStorage). Loaded on every page, before the tool scripts.
   window.MonkeyIntel.progress: per-tower unlocks + banked XP, goals, run log, recent pages, last plans, settings.
   Also fills the home "Pick up where you left off" strip and the "your progress" box on tower pages.
   Nothing is sent anywhere. A backup code moves it to another device. */
(function (root) {
  'use strict';
  var KEY = 'mi-progress-v1';
  var MI = root.MonkeyIntel = root.MonkeyIntel || {};
  var TIERS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
  var GOALS_MAX = 60;

  function blank() {
    return { v: 1, towers: {}, goals: [], log: [], recent: [], plans: {}, settings: { me: null, emt: false, maxTier: 'Expert', meV: 2 }, game: null, profile: blankProfile() };
  }
  /* My profile: player level, Monkey Money, heroes owned (null = not told us = all), towers you don't have yet,
     Monkey Knowledge nodes (Monkey Education and Elite Military Training live in settings.me / settings.emt), Insta Monkeys */
  function blankProfile() { return { level: null, mm: null, heroes: null, missing: {}, mk: {}, mkOn: true, instas: [], name: '' }; }
  function cleanProfile(p) {
    var b = blankProfile();
    if (!p || typeof p !== 'object') return b;
    var n = function (v, max) { v = Math.round(+v); return isFinite(v) && v >= 0 ? Math.min(v, max) : null; };
    b.level = p.level == null ? null : n(p.level, 999);
    b.mm = p.mm == null ? null : n(p.mm, 1e9);
    b.name = typeof p.name === 'string' ? p.name.slice(0, 40) : '';
    if (p.heroes && typeof p.heroes === 'object') { b.heroes = {}; Object.keys(p.heroes).forEach(function (k) { b.heroes[k] = !!p.heroes[k]; }); }
    if (p.missing && typeof p.missing === 'object') Object.keys(p.missing).forEach(function (k) { if (p.missing[k]) b.missing[k] = true; });
    if (p.mk && typeof p.mk === 'object') Object.keys(p.mk).forEach(function (k) { if (p.mk[k]) b.mk[k] = true; });
    b.mkOn = p.mkOn !== false;
    var legal = function (x) { return x.filter(function (v) { return v > 0; }).length <= 2 && x.filter(function (v) { return v > 2; }).length <= 1; };
    b.instas = Array.isArray(p.instas) ? p.instas.filter(function (i) { return i && typeof i.t === 'string' && /^[a-z]+$/.test(i.t) && Array.isArray(i.x) && i.x.length === 3 && Math.round(+i.n) > 0; }).map(function (i) {
      return { t: i.t, x: i.x.map(function (v) { v = Math.round(+v || 0); return Math.max(0, Math.min(5, v)); }), n: Math.min(999, Math.round(+i.n)) };
    }).filter(function (i) { return legal(i.x); }).slice(0, 200) : [];
    return b;
  }
  function clean(s) {
    var b = blank();
    if (!s || typeof s !== 'object') return b;
    b.towers = s.towers && typeof s.towers === 'object' ? s.towers : {};
    Object.keys(b.towers).forEach(function (id) {
      var t = b.towers[id] || {};
      var u = Array.isArray(t.u) ? t.u.slice(0, 3).map(function (v) { v = Math.round(+v || 0); return Math.max(0, Math.min(5, v)); }) : [0, 0, 0];
      while (u.length < 3) u.push(0);
      b.towers[id] = { u: u, p: !!t.p, bank: Math.max(0, Math.round(+t.bank || 0)), set: t.set === true };
    });
    /* an "upgrade" goal needs a path (0-2) and a tier (1-5): without them it would read as done */
    b.goals = Array.isArray(s.goals) ? s.goals.filter(function (g) {
      if (!g || !g.id || !g.tower || ['paragon', 'all', 'upgrade'].indexOf(g.kind) < 0) return false;
      return g.kind !== 'upgrade' || ([0, 1, 2].indexOf(g.path) >= 0 && [1, 2, 3, 4, 5].indexOf(g.tier) >= 0);
    }).slice(0, GOALS_MAX) : [];
    b.log = Array.isArray(s.log) ? s.log.slice(0, 60) : [];
    b.recent = Array.isArray(s.recent) ? s.recent.filter(function (r) { return r && r.u && r.t; }).slice(0, 12) : [];
    b.plans = s.plans && typeof s.plans === 'object' ? s.plans : {};
    if (s.settings && typeof s.settings === 'object') {
      /* Monkey Education: true / false / null (not set yet: the tools assume you don't have it). Before 0.9.3 it
         defaulted to on, so an old "on" only counts when you had also ticked Monkey Knowledge yourself. */
      var me = s.settings.me;
      if (s.settings.meV === 2) b.settings.me = me === true ? true : me === false ? false : null;
      else b.settings.me = me === false ? false : me === true && s.profile && s.profile.mk && Object.keys(s.profile.mk).length ? true : null;
      b.settings.emt = !!s.settings.emt;
      b.settings.maxTier = TIERS.indexOf(s.settings.maxTier) >= 0 ? s.settings.maxTier : 'Expert';
    }
    b.game = s.game && typeof s.game === 'object' ? s.game : null;
    if (b.game) b.game = { mapId: b.game.mapId, modeId: b.game.modeId, heroId: b.game.heroId, players: b.game.players, ts: +b.game.ts || 0, from: b.game.from };
    b.profile = cleanProfile(s.profile);
    return b;
  }
  function read() {
    try { var raw = root.localStorage.getItem(KEY); return raw ? clean(JSON.parse(raw)) : blank(); } catch (e) { return blank(); }
  }
  var P = MI.progress = {
    KEY: KEY,
    get: read,
    save: function (s) { try { root.localStorage.setItem(KEY, JSON.stringify(clean(s))); return true; } catch (e) { return false; } },
    update: function (fn) { var s = read(); fn(s); P.saved = P.save(s); return s; },
    saved: true, /* did the last update reach localStorage? (private windows and blocked storage say no) */
    tower: function (id) { var t = read().towers[id]; return t ? { u: t.u.slice(), p: t.p, bank: t.bank, set: t.set } : { u: [0, 0, 0], p: false, bank: 0, set: false }; },
    setTower: function (id, patch) {
      return P.update(function (s) {
        var t = s.towers[id] || { u: [0, 0, 0], p: false, bank: 0 };
        var unlocks = ('u' in patch) || ('p' in patch);
        Object.keys(patch).forEach(function (k) { t[k] = patch[k]; });
        if (unlocks) t.set = true;
        s.towers[id] = t;
        /* unlocks changed outside My goals: the cached % can't be redone here, so mark it until the goals page refreshes it */
        s.goals.forEach(function (g) { if (g.tower === id && g.view && unlocks) g.view.stale = true; });
        refreshViews(s, id);
      });
    },
    GOALS_MAX: GOALS_MAX,
    lastError: null,
    goalKey: function (g) { return g.tower + '.' + (g.kind === 'upgrade' ? 'u' + g.path + g.tier : g.kind); },
    addGoal: function (g) {
      var id = null;
      P.lastError = null;
      P.update(function (s) {
        var key = P.goalKey(g);
        var have = s.goals.find(function (x) { return P.goalKey(x) === key; });
        if (have) { id = have.id; return; }
        if (s.goals.length >= GOALS_MAX) { id = null; P.lastError = 'full'; return; }
        id = 'g' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
        s.goals.unshift({ id: id, tower: g.tower, kind: g.kind, path: g.path, tier: g.tier, added: Date.now() });
        /* a goal alone says nothing about what you have unlocked: set stays false until you enter or unlock tiers */
        if (!s.towers[g.tower]) s.towers[g.tower] = { u: [0, 0, 0], p: false, bank: 0, set: false };
      });
      return id;
    },
    removeGoal: function (id) { P.update(function (s) { s.goals = s.goals.filter(function (g) { return g.id !== id; }); }); },
    /* the goals page stores a summary so the home page can show it without the big data bundle */
    cacheGoal: function (id, view) { P.update(function (s) { var g = s.goals.find(function (x) { return x.id === id; }); if (g) g.view = view; }); },
    /* keep the cached summary roughly right when XP is banked elsewhere (the goals page recomputes it exactly) */
    logRun: function (tower, xp, label) {
      xp = Math.max(0, Math.round(+xp || 0));
      if (!xp) return false;
      P.update(function (s) {
        var t = s.towers[tower] || { u: [0, 0, 0], p: false, bank: 0, set: false };
        t.bank = (t.bank || 0) + xp;
        s.towers[tower] = t;
        s.log.unshift({ id: 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), ts: Date.now(), tower: tower, xp: xp, label: label || '' });
        s.log = s.log.slice(0, 60);
        refreshViews(s, tower);
      });
      return P.saved; /* true only when it was saved */
    },
    undoRun: function (rid) {
      P.update(function (s) {
        var i = s.log.findIndex(function (r) { return r.id === rid || (!r.id && r.ts === rid); });
        if (i < 0) return;
        var r = s.log[i];
        var t = s.towers[r.tower];
        if (t) t.bank = Math.max(0, (t.bank || 0) - r.xp);
        s.log.splice(i, 1);
        refreshViews(s, r.tower);
      });
    },
    profile: function () { return read().profile; },
    setProfile: function (patch) { return P.update(function (s) { Object.keys(patch).forEach(function (k) { s.profile[k] = patch[k]; }); }); },
    ownsHero: function (id) { var h = read().profile.heroes; return !h || h[id] !== false; },
    addInsta: function (t, x, n) {
      P.update(function (s) {
        var have = s.profile.instas.find(function (i) { return i.t === t && i.x.join('') === x.join(''); });
        if (have) have.n = Math.min(999, have.n + (n || 1)); else s.profile.instas.push({ t: t, x: x.slice(), n: n || 1 });
      });
    },
    setInsta: function (t, x, n) {
      P.update(function (s) {
        s.profile.instas = s.profile.instas.map(function (i) { return i.t === t && i.x.join('') === x.join('') ? { t: t, x: i.x, n: n } : i; }).filter(function (i) { return i.n > 0; });
      });
    },
    setPlan: function (tool, info) { P.update(function (s) { info.ts = Date.now(); s.plans[tool] = info; }); },
    /* the last game you set up in any tool: map, mode, hero, players. A tool that doesn't know the players keeps the old value. */
    setGame: function (g) {
      P.update(function (s) {
        var old = s.game || {};
        var same = old.mapId === g.mapId && old.modeId === g.modeId && old.heroId === g.heroId && (g.players === undefined || old.players === g.players);
        s.game = { mapId: g.mapId, modeId: g.modeId, heroId: g.heroId, players: g.players !== undefined ? g.players : old.players,
          ts: same && old.ts ? old.ts : Date.now(), from: same && old.from ? old.from : g.from };
      });
    },
    exportCode: function () {
      var s = read();
      var slim = { v: 1, towers: s.towers, goals: s.goals.map(function (g) { return { id: g.id, tower: g.tower, kind: g.kind, path: g.path, tier: g.tier, added: g.added }; }), settings: s.settings, log: s.log.slice(0, 20), profile: s.profile };
      return 'MI1.' + btoa(unescape(encodeURIComponent(JSON.stringify(slim))));
    },
    importCode: function (code) {
      var m = String(code || '').replace(/\s+/g, '').match(/^MI1\.([A-Za-z0-9+/=]+)$/);
      if (!m) return false;
      try {
        var s = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
        if (!s || s.v !== 1) return false;
        var cur = read();
        var next = clean(s);
        next.recent = cur.recent; next.plans = cur.plans; next.game = cur.game;
        return P.save(next);
      } catch (e) { return false; }
    },
    /* "Reset everything" also forgets the XP calculator's own copy of your unlocks */
    reset: function () { try { root.localStorage.removeItem(KEY); root.localStorage.removeItem('mi-xp-v1'); } catch (e) { /* ignore */ } },
  };

  /* cached goal summary after the bank changes: same sums as goals-core goalView (earned = done + min(bank, remaining)) */
  function refreshViews(s, tower) {
    var t = s.towers[tower];
    if (!t) return;
    s.goals.forEach(function (g) {
      var v = g.view;
      if (g.tower !== tower || !v || !(v.total > 0) || v.remaining == null) return;
      var bank = t.bank || 0;
      var earned = v.total - v.remaining + Math.min(bank, v.remaining);
      v.pct = v.remaining === 0 ? 100 : Math.min(99.9, 100 * earned / v.total);
      var need = Math.max(0, v.remaining - bank);
      v.runs = need > 0 && v.perRun > 0 ? Math.ceil(need / v.perRun) : 0;
    });
  }

  /* ---------- page hooks (need the DOM) ---------- */
  if (typeof document === 'undefined') return;
  /* data-root is relative ("../../"): turn it into the site's absolute base path ("/btd6-planner/") */
  var ROOT = '/';
  try { ROOT = new URL(document.documentElement.getAttribute('data-root') || './', location.href).pathname; } catch (e) { /* old browser */ }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); } });
    [].concat(kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  var KIND = { monkeys: 'Tower', heroes: 'Hero', maps: 'Map', rounds: 'Round', guides: 'Guide', quick: 'Quick', tools: 'Tool' };
  function recordVisit() {
    var path = location.pathname;
    if (path.indexOf(ROOT) !== 0) return;
    var rel = path.slice(ROOT.length);
    var m = rel.match(/^(monkeys|heroes|maps|rounds|guides|quick|tools)\/([a-z0-9-]+)\/(?:index\.html)?$/);
    if (!m || (m[1] === 'monkeys' && m[2] === 'paragons')) return;
    var h1 = document.querySelector('main h1');
    var title = h1 ? h1.textContent.replace(/\s+/g, ' ').trim() : document.title.split('·')[0].trim();
    if (!title) return;
    var u = m[1] + '/' + m[2] + '/';
    P.update(function (s) {
      s.recent = s.recent.filter(function (r) { return r.u !== u; });
      s.recent.unshift({ u: u, t: title, k: KIND[m[1]], ts: Date.now() });
      s.recent = s.recent.slice(0, 12);
    });
  }
  function bar(pct) {
    var b = el('span', { class: 'mi-bar', role: 'img', 'aria-label': Math.round(pct) + '% done' }, el('span', { class: 'mi-bar-fill', style: 'width:' + Math.max(0, Math.min(100, pct)).toFixed(1) + '%' }));
    return b;
  }
  function fmt(n) { return Math.round(n || 0).toLocaleString('en-US'); }
  function ago(ts) {
    var m = Math.round((Date.now() - ts) / 60000);
    if (m < 60) return m <= 1 ? 'just now' : m + ' min ago';
    var hr = Math.round(m / 60);
    if (hr < 36) return hr + ' h ago';
    return Math.round(hr / 24) + ' days ago';
  }
  /* home: "Pick up where you left off" */
  function fillContinue(box) {
    var s = read();
    var goals = s.goals.filter(function (g) { return g.view; }).slice(0, 3);
    var plans = ['advisor', 'simulator'].map(function (k) { return s.plans[k] ? { k: k, p: s.plans[k] } : null; }).filter(Boolean).sort(function (a, b) { return b.p.ts - a.p.ts; });
    var recent = s.recent.slice(0, 6);
    if (!goals.length && !plans.length && !recent.length) return;
    var kids = [];
    if (goals.length) {
      kids.push(el('ul', { class: 'mi-goals' }, goals.map(function (g) {
        var v = g.view;
        return el('li', null, el('a', { class: 'mi-goal', href: ROOT + 'tools/goals/#g=' + g.id }, [
          el('span', { class: 'mi-goal-t' }, [v.name, el('small', null, v.tower)]),
          bar(v.pct),
          el('span', { class: 'mi-goal-s' }, v.done ? 'Unlocked' : v.stale ? 'Open My goals to update' : Math.floor(v.pct) + '% · ' + (v.next ? 'next: ' + v.next : '') + (v.runs ? ' · about ' + v.runs + ' run' + (v.runs === 1 ? '' : 's') + ' left' : '')),
        ]));
      })));
    }
    if (plans.length) {
      kids.push(el('ul', { class: 'mi-plans' }, plans.map(function (x) {
        return el('li', null, el('a', { class: 'btn btn-small', href: ROOT + 'tools/' + x.k + '/#' + x.p.hash }, [(x.k === 'advisor' ? 'Resume your plan: ' : 'Resume your build: ') + x.p.label, el('small', null, ' · ' + ago(x.p.ts))]));
      })));
    }
    if (recent.length) {
      kids.push(el('p', { class: 'mi-recent' }, [el('span', { class: 'toolbar-l' }, 'Recently viewed')].concat(recent.map(function (r) {
        return el('a', { class: 'tag', href: ROOT + r.u }, r.t);
      }))));
    }
    box.appendChild(el('h2', { class: 'panel-h', id: 'ct' }, ['Pick up where you left off', el('small', null, 'saved in this browser')]));
    box.appendChild(el('div', { class: 'panel-b mi-cont-b' }, kids));
    box.hidden = false;
  }
  /* tower pages: what you have unlocked on it, and its goals */
  function fillTower(box) {
    var id = box.getAttribute('data-my-tower');
    var s = read();
    var t = s.towers[id];
    var goals = s.goals.filter(function (g) { return g.tower === id; });
    var kids = [];
    if (t && t.set) {
      kids.push(el('span', { class: 'mi-mine-l' }, 'You have'));
      kids.push(el('code', { class: 'xcode' }, t.u.join('-')));
      if (t.p) kids.push(el('span', null, '+ Paragon'));
    }
    if (t && t.bank) kids.push(el('span', null, fmt(t.bank) + ' XP banked'));
    goals.forEach(function (g) {
      if (!g.view) return;
      kids.push(el('a', { class: 'mi-mine-goal', href: ROOT + 'tools/goals/#g=' + g.id }, [g.view.name + ' ', bar(g.view.pct), g.view.stale ? ' update' : ' ' + Math.floor(g.view.pct) + '%']));
    });
    if (!kids.length) return;
    kids.push(el('a', { class: 'mi-mine-edit', href: ROOT + 'tools/profile/#tower=' + id }, 'edit in My profile'));
    box.appendChild(el('p', { class: 'mi-mine' }, kids));
    box.hidden = false;
  }
  function boot() {
    recordVisit();
    var c = document.querySelector('[data-continue]');
    if (c) fillContinue(c);
    var t = document.querySelector('[data-my-tower]');
    if (t) fillTower(t);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
