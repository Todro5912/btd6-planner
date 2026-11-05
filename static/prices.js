/* Difficulty price toggle: swaps every .price to its data-<difficulty> value. Prices are pre-computed at build time
   with the same $5 rounding rule as the planner (src/logic.js L.price). */
(function () {
  'use strict';
  var KEY = 'mi-diff';
  var groups = document.querySelectorAll('.diff-toggle');
  if (!groups.length) return;
  function apply(d) {
    document.querySelectorAll('.price').forEach(function (el) { var v = el.getAttribute('data-' + d); if (v) el.textContent = v; });
    document.querySelectorAll('.diff-toggle [data-diff]').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-diff') === d)); });
    try { localStorage.setItem(KEY, d); } catch (e) { /* storage blocked */ }
  }
  var start = 'medium';
  try { var s = localStorage.getItem(KEY); if (['easy', 'medium', 'hard', 'impoppable'].indexOf(s) >= 0) start = s; } catch (e) { /* ignore */ }
  groups.forEach(function (g) {
    g.hidden = false;
    g.addEventListener('click', function (e) { var b = e.target.closest('[data-diff]'); if (b) apply(b.getAttribute('data-diff')); });
    if (window.MI) window.MI.radioKeys(g);
  });
  apply(start);
})();
