/* Monkey Intel: theme toggle, header menus, round lookup and site search (scoring in search-core.js). No libraries. */
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

  /* ---------- header menus (<details>): close on outside click, Esc, or when another opens ---------- */
  var menus = Array.prototype.slice.call(document.querySelectorAll('[data-menu]'));
  menus.forEach(function (m) {
    m.addEventListener('toggle', function () { if (m.open) menus.forEach(function (o) { if (o !== m) o.open = false; }); });
    /* keyboard: tabbing out of an open menu closes it */
    m.addEventListener('focusout', function (e) { if (m.open && e.relatedTarget && !m.contains(e.relatedTarget)) m.open = false; });
  });
  document.addEventListener('click', function (e) { menus.forEach(function (m) { if (m.open && !m.contains(e.target)) m.open = false; }); });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    menus.forEach(function (m) { if (m.open) { m.open = false; var s = m.querySelector('summary'); if (s) s.focus(); } });
  });

  /* ---------- round lookup: "63" -> rounds/63/ (1-100 have pages; 101-140 sit in the table) ---------- */
  document.querySelectorAll('[data-round-form]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      var n = parseInt((f.querySelector('input') || {}).value, 10);
      if (!(n >= 1 && n <= 140)) return;
      e.preventDefault();
      location.href = ROOT + 'rounds/' + (n <= 100 ? n + '/' : '#r' + n);
    });
  });

  /* ---------- search ---------- */
  var dlg = document.getElementById('search');
  if (!dlg || typeof dlg.showModal !== 'function') return;
  var input = document.getElementById('searchInput');
  var list = document.getElementById('searchList');
  var entries = null, loading = null, results = [], active = -1, opener = null;

  var core = null;
  function load() {
    if (loading) return loading;
    loading = fetch(ROOT + 'search-index.json').then(function (r) { return r.json(); }).then(function (j) {
      entries = j.entries || [];
      core = window.MISearch ? window.MISearch.create(entries) : { search: function () { return []; } };
    }).catch(function () { entries = []; core = { search: function () { return []; } }; });
    return loading;
  }
  function search(raw) { return core ? core.search(raw, 12) : []; }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* empty box: the pages you opened last (saved in this browser by progress.js) */
  function recents() {
    var P = window.MonkeyIntel && window.MonkeyIntel.progress;
    return P ? P.get().recent.slice(0, 8).map(function (r) { return { t: r.t, k: 'Recent · ' + r.k, u: r.u }; }) : [];
  }
  function render() {
    results = input.value.trim() ? search(input.value) : recents();
    active = results.length ? 0 : -1;
    if (!input.value.trim() && !results.length) list.innerHTML = '';
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

/* header "Goals" button: how many goals are still in progress (from the shared progress store) */
(function () {
  var b = document.querySelector('[data-goal-count]');
  var P = window.MonkeyIntel && window.MonkeyIntel.progress;
  if (!b || !P) return;
  var n = 0;
  try { n = P.get().goals.filter(function (g) { return !(g.view && g.view.done); }).length; } catch (e) { return; }
  if (!n) return;
  b.textContent = String(n);
  b.hidden = false;
  var a = b.closest('a');
  if (a) a.setAttribute('aria-label', 'My goals, ' + n + ' in progress');
})();
