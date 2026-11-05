/* Sortable table: header buttons sort by the row's data-<key>; empty values always sort last. */
(function () {
  'use strict';
  document.querySelectorAll('table.sortable').forEach(function (table) {
    var tbody = table.tBodies[0];
    table.querySelectorAll('thead button[data-key]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var th = btn.closest('th'), key = btn.getAttribute('data-key'), isNum = btn.getAttribute('data-type') === 'num';
        var dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : th.getAttribute('aria-sort') === 'descending' ? 'ascending' : (isNum ? 'descending' : 'ascending');
        table.querySelectorAll('thead th').forEach(function (x) { x.setAttribute('aria-sort', 'none'); });
        th.setAttribute('aria-sort', dir);
        var sign = dir === 'ascending' ? 1 : -1;
        var rows = Array.prototype.slice.call(tbody.rows);
        rows.sort(function (a, b) {
          var x = a.getAttribute('data-' + key), y = b.getAttribute('data-' + key);
          if (x === '' || x === null) return y === '' || y === null ? 0 : 1;
          if (y === '' || y === null) return -1;
          if (isNum) {
            if (key === 'ver') { x = x.split('.').map(Number); y = y.split('.').map(Number); return sign * ((x[0] - y[0]) || ((x[1] || 0) - (y[1] || 0))); }
            return sign * (parseFloat(x) - parseFloat(y));
          }
          return sign * x.localeCompare(y);
        });
        rows.forEach(function (r) { tbody.appendChild(r); });
      });
    });
  });
})();
