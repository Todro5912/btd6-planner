/* Maps index: filter by name, difficulty, water and line of sight. Without JS the full list shows. */
(function () {
  'use strict';
  var form = document.getElementById('mapFilters');
  if (!form) return;
  form.hidden = false;
  var q = document.getElementById('mapQ'), w = document.getElementById('mapW'), l = document.getElementById('mapL');
  var count = document.getElementById('mapCount');
  var rows = Array.prototype.slice.call(document.querySelectorAll('.tbl-maps tbody tr'));
  var groups = document.querySelectorAll('.map-group');
  function run() {
    var text = q.value.trim().toLowerCase();
    var ds = Array.prototype.slice.call(form.querySelectorAll('input[name="d"]:checked')).map(function (x) { return x.value; });
    var shown = 0;
    rows.forEach(function (r) {
      var ok = (!text || r.getAttribute('data-name').indexOf(text) >= 0) && ds.indexOf(r.getAttribute('data-d')) >= 0 &&
        (!w.value || r.getAttribute('data-w') === w.value) && (!l.value || r.getAttribute('data-l') === l.value);
      r.hidden = !ok; if (ok) shown++;
    });
    groups.forEach(function (g) { g.hidden = !g.querySelector('tbody tr:not([hidden])'); });
    count.textContent = shown === rows.length ? 'All ' + rows.length + ' maps' : shown + ' of ' + rows.length + ' maps' + (shown ? '' : '. Loosen a filter.');
  }
  form.addEventListener('input', run);
  form.addEventListener('change', run);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  run();
})();
