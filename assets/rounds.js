/* Rounds: switch between the standard and ABR tables, optionally show only danger rounds. */
(function () {
  'use strict';
  var tools = document.getElementById('roundTools');
  if (!tools) return;
  tools.hidden = false;
  var only = document.getElementById('dangerOnly'), count = document.getElementById('roundCount');
  var set = /^#abr\d+$/.test(location.hash) ? 'abr' : 'standard';
  function run() {
    ['standard', 'abr'].forEach(function (s) { document.getElementById('set-' + s).hidden = s !== set; });
    tools.querySelectorAll('[data-set]').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-set') === set)); });
    var rows = document.querySelectorAll('#set-' + set + ' tbody tr'), n = 0;
    rows.forEach(function (r) { var hide = only.checked && +r.getAttribute('data-danger') < 3; r.hidden = hide; if (!hide) n++; });
    count.textContent = only.checked ? n + ' danger rounds' : '';
  }
  tools.addEventListener('click', function (e) { var b = e.target.closest('[data-set]'); if (b) { set = b.getAttribute('data-set'); run(); } });
  only.addEventListener('change', run);
  if (window.MI) window.MI.radioKeys(tools.querySelector('.seg'));
  run();
  if (location.hash) { var t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
})();
