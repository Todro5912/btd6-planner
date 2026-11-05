/* Monkey Intel: theme toggle and site search. No libraries. */
(function () {
  'use strict';
  var doc = document.documentElement;
  var ROOT = doc.getAttribute('data-root') || '';

  /* ---------- theme ---------- */
  var KEY = 'mi-theme';
  function getTheme() { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function setTheme(v) {
    if (v === 'light' || v === 'dark') doc.setAttribute('data-theme', v); else doc.removeAttribute('data-theme');
    try { if (v === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch (e) { /* storage blocked */ }
    document.querySelectorAll('[data-theme-set]').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-theme-set') === v)); });
  }
  var tt = document.querySelector('.theme-toggle');
  if (tt) {
    tt.hidden = false;
    setTheme(getTheme());
    tt.addEventListener('click', function (e) { var b = e.target.closest('[data-theme-set]'); if (b) setTheme(b.getAttribute('data-theme-set')); });
    radioKeys(tt);
  }

  /* arrow keys inside a role=radiogroup made of buttons */
  function radioKeys(group) {
    group.addEventListener('keydown', function (e) {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) < 0) return;
      var bs = Array.prototype.slice.call(group.querySelectorAll('[role="radio"]'));
      var i = bs.indexOf(document.activeElement); if (i < 0) return;
      e.preventDefault();
      var n = bs[(i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + bs.length) % bs.length];
      n.focus(); n.click();
    });
  }
  window.MI = { radioKeys: radioKeys, root: ROOT };

  /* ---------- search ---------- */
  var dlg = document.getElementById('search');
  if (!dlg || typeof dlg.showModal !== 'function') return;
  var input = document.getElementById('searchInput');
  var list = document.getElementById('searchList');
  var entries = null, loading = null, results = [], active = -1, opener = null;

  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function load() {
    if (loading) return loading;
    loading = fetch(ROOT + 'search-index.json').then(function (r) { return r.json(); }).then(function (j) {
      entries = (j.entries || []).map(function (e) { e.n = norm(e.t); e.w = e.n.split(' '); e.xn = norm(e.x || ''); return e; });
    }).catch(function () { entries = []; });
    return loading;
  }
  var KIND_BOOST = { Tower: 6, Hero: 6, Map: 5, Paragon: 4, Guide: 4, Reference: 4, Upgrade: 2, Round: 0 };
  /* Prefix-first matching: whole title, then word prefixes, then substring, then letters in order. */
  function score(e, q, qs) {
    var s = 0, t = e.n;
    if (t === q) s = 100;
    else if (t.indexOf(q) === 0) s = 80;
    else if (qs.every(function (w) { return e.w.some(function (x) { return x.indexOf(w) === 0; }) || e.xn.split(' ').some(function (x) { return x.indexOf(w) === 0; }); })) s = 60 - e.w.length;
    else if (t.indexOf(q) > 0) s = 30;
    else {
      var i = 0; for (var k = 0; k < t.length && i < q.length; k++) if (t[k] === q[i]) i++;
      if (i === q.length && q.length > 2) s = 8;
    }
    if (!s) return 0;
    var m = q.match(/^(?:r|round )?(\d{1,3})$/);
    if (e.k === 'Round') return m && e.xn === 'r' + m[1] ? 120 : (m ? 0 : s - 20);
    return s + (KIND_BOOST[e.k] || 0);
  }
  function search(raw) {
    var q = norm(raw); if (!q || !entries) return [];
    var qs = q.split(' '), out = [];
    var m = q.match(/^(?:r|round )?(\d{1,3})$/);
    entries.forEach(function (e) {
      var s = m && e.k === 'Round' ? (e.xn === 'r' + m[1] ? 120 : 0) : score(e, q, qs);
      if (s > 0) out.push([s, e]);
    });
    out.sort(function (a, b) { return b[0] - a[0] || a[1].t.length - b[1].t.length; });
    return out.slice(0, 12).map(function (x) { return x[1]; });
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function render() {
    results = search(input.value);
    active = results.length ? 0 : -1;
    if (!input.value.trim()) list.innerHTML = '';
    else if (!results.length) list.innerHTML = '<li class="r-empty" role="option" aria-disabled="true" aria-selected="false">Nothing matches. Try a shorter word.</li>';
    else list.innerHTML = results.map(function (e, i) {
      return '<li role="option" id="sr' + i + '" aria-selected="' + (i === active) + '" data-i="' + i + '"><span class="r-t">' + esc(e.t) + '</span><span class="r-k">' + esc(e.k) + '</span>' + (e.s ? '<span class="r-s">' + esc(e.s) + '</span>' : '') + '</li>';
    }).join('');
    input.setAttribute('aria-expanded', String(results.length > 0));
    sync();
  }
  function sync() {
    Array.prototype.forEach.call(list.querySelectorAll('[role="option"][data-i]'), function (li) { li.setAttribute('aria-selected', String(+li.getAttribute('data-i') === active)); });
    if (active >= 0) { input.setAttribute('aria-activedescendant', 'sr' + active); var el = document.getElementById('sr' + active); if (el) el.scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  }
  function go(i) { var e = results[i]; if (e) { dlg.close(); location.href = ROOT + e.u; } }
  function open(q) {
    if (!dlg.open) { opener = document.activeElement; dlg.showModal(); }
    input.value = q || '';
    input.focus();
    load().then(render);
  }
  input.addEventListener('input', function () { if (entries) render(); else load().then(render); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!results.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      sync();
    } else if (e.key === 'Enter') { e.preventDefault(); go(active < 0 ? 0 : active); }
    else if (e.key === 'Escape') { e.preventDefault(); dlg.close(); }
  });
  list.addEventListener('click', function (e) { var li = e.target.closest('[data-i]'); if (li) go(+li.getAttribute('data-i')); });
  list.addEventListener('mousemove', function (e) { var li = e.target.closest('[data-i]'); if (li && +li.getAttribute('data-i') !== active) { active = +li.getAttribute('data-i'); sync(); } });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  dlg.querySelector('[data-search-close]').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('close', function () {
    input.setAttribute('aria-expanded', 'false');
    input.blur();
    if (opener && opener !== document.body && document.contains(opener) && opener.focus) opener.focus();
  });

  document.querySelectorAll('[data-search-open]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); open(''); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || dlg.open) return;
    var t = e.target, tag = t && t.tagName;
    if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) && !(t.closest && t.closest('#search'))) return;
    e.preventDefault();
    open('');
  });
  /* the home page box hands its text to the dialog */
  document.querySelectorAll('[data-search-proxy]').forEach(function (inp) {
    var form = inp.form;
    function hand(e) { if (e) e.preventDefault(); var v = inp.value; inp.value = ''; open(v); }
    inp.addEventListener('input', function () { if (inp.value) hand(); });
    if (form) form.addEventListener('submit', hand);
  });
  var q = new URLSearchParams(location.search).get('q');
  if (q) open(q);
})();
