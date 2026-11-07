/* Difficulty price toggle: swaps every .price to its data-<difficulty> value. Prices are pre-computed at build time
   with the same $5 rounding rule as the tools (tools-core C.price). The choice is remembered and announced as an
   "mi:diff" event so live widgets (the crosspath picker) can follow.
   Your last game: when a tool (Advisor, Simulator, Check my defence) set up a game more recently than you last tapped
   this toggle, prices start on that game's difficulty (CHIMPS -> Hard prices, Deflation -> Easy). Tapping wins again. */
(function () {
  'use strict';
  var KEY = 'mi-diff', KEY_TS = 'mi-diff-ts';
  var DIFFS = ['easy', 'medium', 'hard', 'impoppable'];
  /* each mode's price list: its "base" difficulty, Impoppable its own x1.2 (data/modes.json base + costMult; test_ui.js checks it) */
  var MODE_DIFF = {
    easy: 'easy', 'primary-only': 'easy', deflation: 'easy',
    medium: 'medium', 'military-only': 'medium', apopalypse: 'medium', reverse: 'medium',
    hard: 'hard', 'magic-monkeys-only': 'hard', 'double-hp-moabs': 'hard', 'half-cash': 'hard', abr: 'hard', chimps: 'hard',
    impoppable: 'impoppable',
  };
  var groups = document.querySelectorAll('.diff-toggle');
  window.MonkeyIntelModeDiff = MODE_DIFF;
  if (!groups.length) return;
  var note = null;
  function apply(d, byUser) {
    document.querySelectorAll('.price').forEach(function (el) { var v = el.getAttribute('data-' + d); if (v) el.textContent = v; });
    document.querySelectorAll('.diff-toggle [data-diff]').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-diff') === d)); });
    if (byUser) {
      try { localStorage.setItem(KEY, d); localStorage.setItem(KEY_TS, String(Date.now())); } catch (e) { /* storage blocked */ }
      if (note) { note.remove(); note = null; }
    }
    document.dispatchEvent(new CustomEvent('mi:diff', { detail: d }));
  }
  var start = 'medium', ts = 0, from = null;
  try {
    var s = localStorage.getItem(KEY);
    if (DIFFS.indexOf(s) >= 0) start = s;
    ts = +localStorage.getItem(KEY_TS) || 0;
  } catch (e) { /* ignore */ }
  try {
    var P = window.MonkeyIntel && window.MonkeyIntel.progress;
    var g = P && P.get().game;
    if (g && g.modeId && MODE_DIFF[g.modeId] && g.ts > ts && MODE_DIFF[g.modeId] !== start) { start = MODE_DIFF[g.modeId]; from = g.modeId; }
  } catch (e) { /* ignore */ }
  groups.forEach(function (g) {
    g.hidden = false;
    g.addEventListener('click', function (e) { var b = e.target.closest('[data-diff]'); if (b) apply(b.getAttribute('data-diff'), true); });
    if (window.MI && window.MI.radioKeys) window.MI.radioKeys(g);
  });
  if (from) {
    /* say why the prices moved, next to the first toggle */
    note = document.createElement('small');
    note.className = 'diff-note';
    var NAMES = { chimps: 'CHIMPS', abr: 'ABR', 'double-hp-moabs': 'Double HP MOABs' };
    var nm = NAMES[from] || (from.charAt(0).toUpperCase() + from.slice(1).replace(/-/g, ' '));
    note.textContent = 'Prices for your last game: ' + nm;
    groups[0].insertAdjacentElement('afterend', note);
  }
  apply(start, false);
})();
