/* Tower page: crosspath picker. 3 paths x tiers 0-5 with the game's rule (two paths at most, only one past tier 2).
   Shows live: the total price on the chosen difficulty, what the crosspath can pop (pop-model.json, C1) and towers that
   pair well with it (window.MonkeyIntel.synergy from the tools stream when loaded, else built-in hints). */
(function () {
  'use strict';
  var box = document.getElementById('picker');
  var dataEl = box && box.querySelector('.pk-data');
  if (!box || !dataEl) return;
  var D;
  try { D = JSON.parse(dataEl.textContent); } catch (e) { return; }
  var ROOT = (window.MI && window.MI.root) || document.documentElement.getAttribute('data-root') || '';
  var DIFF_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard', impoppable: 'Impoppable' };
  var PROPS = ['camo', 'lead', 'purple', 'black', 'white', 'frozen', 'moab', 'fortified', 'ddt'];
  /* derived DDT = camo AND lead AND black (+ MOAB-class) on this crosspath; ddt.derived === false uses its own any[] */
  var DDT_PARTS = ['camo', 'lead', 'black', 'moab'];
  var GAPS = ['camo', 'lead', 'purple', 'black', 'white', 'zebra', 'moab', 'ddt'];
  var tiers = [0, 0, 0];
  var diff = 'medium';
  try { var s = localStorage.getItem('mi-diff'); if (DIFF_LABEL[s]) diff = s; } catch (e) { /* storage blocked */ }

  /* same rule as L.price in src/logic.js and price() in tools/build_site.py: nearest $5, exact ties round down */
  function price(base, mult) {
    if (base == null) return 0;
    var cents = Math.round(base * Math.round(mult * 100));
    var q = Math.floor(cents / 500), rem = cents - q * 500;
    return (rem > 250 ? q + 1 : q) * 5;
  }
  function money(v) { return '$' + Math.round(v).toLocaleString('en-US'); }
  function total(t, d) {
    var m = D.mult[d] || 1, sum = price(D.base, m);
    for (var p = 0; p < 3; p++) for (var i = 0; i < t[p]; i++) sum += price(D.paths[p][i].c, m);
    return sum;
  }
  function valid(t) {
    var used = 0, high = 0;
    for (var i = 0; i < 3; i++) { if (t[i] < 0 || t[i] > 5) return false; if (t[i] > 0) used++; if (t[i] > 2) high++; }
    return used <= 2 && high <= 1;
  }
  function holds(req, t) {
    if (req === 'base') return true;
    if (!req || req === 'never' || typeof req !== 'object') return false;
    if (req.maxTier != null) return t[+req.path] <= +req.maxTier; /* the upgrade that loses the ability is not bought */
    return t[+req.path] >= +req.tier;
  }
  function anyHolds(e, t) {
    return !!(e && e.any) && e.any.some(function (alt) { return Array.isArray(alt) && alt.every(function (r) { return holds(r, t); }); });
  }
  function can(prop, t) {
    var e = D.pop && D.pop[prop];
    if (prop === 'ddt' && !(e && e.derived === false)) return DDT_PARTS.every(function (p) { return can(p, t); });
    if (prop === 'zebra' && !e) return can('black', t) && can('white', t);
    return anyHolds(e, t);
  }
  /* conditional entries: abilities and effects that need another tower. Shown as hints, never as "can pop". */
  function hints(t) {
    var out = [];
    PROPS.forEach(function (k) {
      var e = D.pop && D.pop[k];
      ((e && e.conditional) || []).forEach(function (c) {
        if ((c.req || []).every(function (r) { return holds(r, t); }) && !can(k, t)) out.push((D.labels[k] || k) + ': ' + c.note);
      });
    });
    return out;
  }
  function bonuses(t) {
    return ((D.pop && D.pop.bonuses) || []).filter(function (b) { return holds(b.from, t); });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function code(t) { return t.join('-'); }

  /* ---------- synergy: the tools stream's engine first, then built-in hints ---------- */
  function normSyn(x) {
    if (!x) return null;
    if (typeof x === 'string') return { why: x };
    return {
      tower: x.tower || x.towerId || x.id || null, name: x.name || x.towerName || x.title || null,
      code: x.code || x.crosspath || x.path || null, why: x.why || x.reason || x.text || x.note || x.description || '',
      url: x.url || null, prices: x.prices || null, kind: x.kind || 'pair', unverified: !!x.unverified
    };
  }
  /* Adapter for the tools stream's engine: synergy(placed, ctx) -> [{label, why, strength, kind, unverified,
     pairsWith, tower, x, hero}]. We pass this crosspath plus what it can't pop, and map each result to the list
     items this page renders: {tower, name, code, why, url, prices, kind, unverified}. */
  function external(t) {
    var S = window.MonkeyIntel && window.MonkeyIntel.synergy;
    if (typeof S !== 'function' || !(window.MonkeyIntel.synergyRules || window.MonkeyIntelData)) return null;
    var missing = D.nonAttacker || !D.popKnown ? [] : GAPS.filter(function (k) { return !can(k, t); });
    var bon = {};
    bonuses(t).forEach(function (b) { bon[b.vs] = true; });
    var res;
    try { res = S([{ id: D.id, x: t.slice() }], { missing: missing, bonuses: bon, modeId: null }); } catch (e) { return null; }
    if (!Array.isArray(res)) return null;
    return res.filter(function (x) { return x && (x.tower !== D.id || x.kind === 'avoid'); }).map(function (x) {
      var url = x.tower ? 'monkeys/' + x.tower + '/' : x.hero ? 'heroes/' + x.hero + '/' : null;
      return {
        tower: x.tower || x.hero || null, name: x.name || x.label, code: x.kind === 'avoid' ? null : x.x, why: x.why,
        url: url, kind: x.kind, unverified: !!x.unverified,
        prices: x.tower && x.x ? (D.synPrices || {})[x.tower + ':' + x.x] : null
      };
    });
  }
  function builtin(t) {
    var out = [], seen = {};
    var attacker = !D.nonAttacker;
    D.fallback.forEach(function (f) {
      var on = false;
      if (f.when === 'attacker') on = attacker;
      else if (f.when === 'primary') on = attacker && D.cls === 'Primary';
      else if (f.when === 'support') on = !attacker;
      else if (f.when.indexOf('no-') === 0) on = attacker && D.popKnown && !can(f.when.slice(3), t);
      var k = f.tower + f.code;
      if (on && !seen[k]) { seen[k] = 1; out.push(f); }
    });
    return out.slice(0, 4);
  }
  var synList = box.querySelector('.pk-syn'), synSrc = box.querySelector('.pk-src');
  var synToken = 0;
  function renderSyn(items, source) {
    if (!items || !items.length) { synList.innerHTML = '<li class="muted">Nothing special: any support tower nearby helps.</li>'; return; }
    synList.innerHTML = items.map(function (x) {
      var who = x.url ? '<a href="' + esc(ROOT + x.url) + '">' + esc(x.name || x.tower) + '</a>' : '<b>' + esc(x.name || x.tower || '') + '</b>';
      var p = x.prices ? ' <span class="pk-sp">' + esc(money(x.prices[diff])) + '</span>' : '';
      var tag = x.kind === 'avoid' ? '<span class="tag tag-danger">avoid</span> ' : '';
      var unv = x.unverified ? ' <span class="badge badge-unverified">unverified</span>' : '';
      /* every pairing gets an action: plan a game with both in the Strategy Advisor */
      var plan = '';
      if (x.kind !== 'avoid' && x.url) {
        var isHero = /^heroes\//.test(x.url), oid = x.url.split('/')[1];
        if (oid && oid !== D.id) plan = ' <a class="pk-plan" href="' + esc(ROOT + 'tools/advisor/#' + (isHero ? 'hero=' + oid + '&t=' + D.id : 'hero=auto&t=' + D.id + ',' + oid)) + '">Plan with both</a>';
      }
      return '<li>' + tag + who + (x.code ? ' <code class="xcode">' + esc(x.code) + '</code>' : '') + p + unv + plan + (x.why ? '<span class="pk-why">' + esc(x.why) + '</span>' : '') + '</li>';
    }).join('');
    synSrc.textContent = source;
  }
  function synergy(t) {
    var token = ++synToken;
    var ext = external(t);
    var done = function (res) {
      if (token !== synToken) return;
      var items = Array.isArray(res) ? res.map(normSyn).filter(Boolean) : null;
      if (items && items.length) renderSyn(items.slice(0, 5), 'Suggestions from the synergy rules.');
      else renderSyn(builtin(t), 'Simple built-in hints: what this crosspath is missing, and the usual buffs.');
    };
    if (ext && typeof ext.then === 'function') ext.then(done, function () { done(null); });
    else done(ext);
  }

  /* ---------- render ---------- */
  var rule = box.querySelector('.pk-rule');
  var RULE = rule.textContent;
  function render(msg) {
    for (var p = 0; p < 3; p++) {
      var row = box.querySelector('.pk-row[data-p="' + p + '"]');
      row.querySelectorAll('.pip').forEach(function (pip, i) {
        pip.classList.toggle('on', i < tiers[p]);
        pip.classList.toggle('t5', i === 4 && tiers[p] === 5);
      });
      var up = tiers.slice(); up[p]++;
      row.querySelector('[data-d="1"]').disabled = !valid(up);
      row.querySelector('[data-d="-1"]').disabled = tiers[p] === 0;
      row.querySelector('.pk-up').textContent = tiers[p] ? D.paths[p][tiers[p] - 1].n : 'none';
      row.classList.toggle('on', tiers[p] > 0);
    }
    box.querySelector('.pk-code').textContent = code(tiers);
    box.querySelector('.pk-cost').textContent = money(total(tiers, diff));
    box.querySelector('.pk-diff').textContent = DIFF_LABEL[diff];
    rule.textContent = msg || RULE;
    rule.classList.toggle('warn', !!msg);
    var pops = box.querySelector('.pk-pops');
    /* fortified = "can damage anything" (POP-MODEL.md), so it doubles as "attacks at this crosspath" */
    if (!D.popKnown) pops.innerHTML = '<li class="pop pop-na">Not in the pop model yet</li>';
    else if (!can('fortified', tiers)) pops.innerHTML = '<li class="pop pop-na">Doesn\'t attack' + (D.nonAttacker ? '' : ' at this crosspath') + '</li>';
    else pops.innerHTML = PROPS.map(function (k) {
      var y = can(k, tiers);
      return '<li class="pop ' + (y ? 'pop-y' : 'pop-n') + '"><span class="sr-only">' + (y ? 'can pop ' : 'cannot pop ') + '</span>' + esc(D.labels[k] || k) + '</li>';
    }).join('');
    var b = bonuses(tiers), bEl = box.querySelector('.pk-bonus');
    var hs = D.nonAttacker || !D.popKnown ? [] : hints(tiers);
    bEl.hidden = !b.length && !hs.length;
    bEl.innerHTML = (b.length ? '<b>Bonus:</b> ' + b.map(function (x) { return esc((D.labels[x.vs] || x.vs) + (x.note ? ': ' + x.note : '')); }).join('; ') : '')
      + (hs.length ? (b.length ? '<br>' : '') + '<b>Also, not counted:</b> ' + hs.map(esc).join('; ') : '');
    synergy(tiers);
  }
  function why(p) {
    var up = tiers.slice(); up[p]++;
    if (up[p] > 5) return 'That path is maxed.';
    var used = up.filter(function (x) { return x > 0; }).length;
    if (used > 2) return 'Only two paths can be upgraded. Lower one first.';
    return 'Only one path can go past tier 2. Lower the other one first.';
  }
  box.addEventListener('click', function (e) {
    var b = e.target.closest('.pk-btn');
    if (b) {
      var p = +b.getAttribute('data-p'), d = +b.getAttribute('data-d');
      var next = tiers.slice(); next[p] += d;
      if (valid(next)) { tiers = next; render(); } else render(why(p));
      return;
    }
    if (e.target.closest('.pk-reset')) { tiers = [0, 0, 0]; render(); }
  });
  /* disabled buttons don't get clicks: explain on the row instead */
  box.querySelectorAll('.pk-row').forEach(function (row) {
    row.addEventListener('pointerdown', function (e) {
      var b = e.target.closest('.pk-btn');
      if (b && b.disabled && b.getAttribute('data-d') === '1') render(why(+b.getAttribute('data-p')));
    });
  });
  document.addEventListener('click', function (e) {
    var s = e.target.closest('[data-set-cross]');
    if (!s) return;
    var t = s.getAttribute('data-set-cross').split('-').map(Number);
    if (t.length === 3 && valid(t)) {
      tiers = t; render();
      box.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  });
  document.addEventListener('mi:diff', function (e) { diff = e.detail; render(); });
  box.hidden = false;
  render();
  window.MI = window.MI || {};
  window.MI.picker = { set: function (t) { if (valid(t)) { tiers = t.slice(); render(); } }, get: function () { return tiers.slice(); } };
})();
