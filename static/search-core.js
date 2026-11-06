/* Monkey Intel search scoring, shared by the site (window.MISearch) and the checks (require from node).
   Order: player-word synonyms and exact titles first, then prefixes, then words, then substrings.
   Letters-in-order fuzzy matching only for queries of 4+ characters, so "camo" or "ddt" can't hit random upgrades. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MISearch = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var KIND_BOOST = { Quick: 9, Tool: 5, Tower: 6, Hero: 6, Map: 5, Boss: 5, Paragon: 4, Guide: 4, Reference: 4, Mode: 3, Glossary: 0, Page: 5, Upgrade: 2, Round: 0 };
  var ROUND = /^(?:r|round |wave )?(\d{1,3})$/;

  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function prep(e) {
    e.n = norm(e.t); e.w = e.n.split(' ');
    e.xn = norm(e.x || ''); e.xw = e.xn ? e.xn.split(' ') : [];
    e.an = (e.a || []).map(norm).filter(Boolean);
    return e;
  }
  function score(e, q, qs) {
    var s = 0, t = e.n, i;
    for (i = 0; i < e.an.length; i++) { if (e.an[i] === q) { s = 150; break; } }
    if (!s && t === q) s = 100;
    if (!s && q.length >= 2) for (i = 0; i < e.an.length; i++) { if (e.an[i].indexOf(q) === 0) { s = 85; break; } }
    if (!s && t.indexOf(q) === 0) s = 80;
    if (!s && qs.every(function (w) {
      return e.w.some(function (x) { return x.indexOf(w) === 0; }) || e.xw.some(function (x) { return x.indexOf(w) === 0; });
    })) s = 60 - e.w.length;
    if (!s && q.length >= 3 && t.indexOf(q) > 0) s = 30;
    if (!s && q.length >= 4) {
      var k = 0; for (i = 0; i < t.length && k < q.length; i++) if (t[i] === q[k]) k++;
      if (k === q.length) s = 8;
    }
    if (!s) return 0;
    return s + (KIND_BOOST[e.k] || 0);
  }
  function create(entries) {
    var list = (entries || []).map(prep);
    function search(raw, limit) {
      var q = norm(raw); if (!q) return [];
      var qs = q.split(' '), out = [];
      var m = q.match(ROUND);
      list.forEach(function (e) {
        var s;
        if (m && e.k === 'Round') s = e.xn === 'r' + m[1] ? 140 : 0;
        else if (m) s = e.an.indexOf(q) >= 0 ? 150 : 0; /* a bare number only finds rounds and exact synonyms */
        else s = score(e, q, qs);
        if (s > 0) out.push([s, e]);
      });
      out.sort(function (a, b) { return b[0] - a[0] || a[1].t.length - b[1].t.length; });
      var seen = {}, res = [];
      for (var i = 0; i < out.length && res.length < (limit || 12); i++) {
        if (seen[out[i][1].u]) continue;
        seen[out[i][1].u] = 1; res.push(out[i][1]);
      }
      return res;
    }
    return { search: search };
  }
  return { create: create, norm: norm };
});
