/* Monkey Intel synergy engine. Plain browser module, no DOM.
   window.MonkeyIntel.synergy(placed, ctx) -> [{id, kind, strength, label, why, ...}]
     placed: [{id: 'sniper', x: [0, 2, 4]}]  (x may also be a "0-2-4" string)
     ctx:    {modeId, endRound, mapWater, mapLos, heroId, missing: ['camo', ...], bonuses: {moab: true}, rules, towers}
   Rules come from ctx.rules, else window.MonkeyIntel.synergyRules (synergy-rules.js), else window.MonkeyIntelData.synergy.
   Conditions are documented in src/README-tools.md. */
(function (root) {
  'use strict';
  const arr = (v) => (Array.isArray(v) ? v : []);
  const toX = (x) => (Array.isArray(x) ? x.map((v) => +v || 0) : String(x || '0-0-0').split('-').map((v) => +v || 0));
  const match = (x, pat) => {
    if (!pat) return true;
    const p = String(pat).split('-');
    return p.length === 3 && p.every((d, i) => d === 'x' || (x[i] || 0) >= +d);
  };

  function source(ctx) {
    const MI = root.MonkeyIntel || {};
    const bundle = MI.synergyRules || null;
    const D = root.MonkeyIntelData || null;
    const rules = (ctx && ctx.rules) || (bundle && bundle.rules) || (D && D.synergy) || { rules: [], groups: {} };
    let towers = (ctx && ctx.towers) || (bundle && bundle.towers) || null;
    if (!towers && D) { towers = {}; arr(D.towers).forEach((t) => { towers[t.id] = { name: t.name, class: t.class }; }); }
    let heroes = (bundle && bundle.heroes) || null;
    if (!heroes && D) { heroes = {}; arr(D.heroes).forEach((h) => { heroes[h.id] = { name: h.name }; }); }
    return { rules, towers: towers || {}, heroes: heroes || {} };
  }

  function inGroup(src, group, id) {
    const g = (src.rules.groups || {})[group];
    if (!g) return id === group;
    if (Array.isArray(g)) return g.indexOf(id) >= 0;
    if (g.exclude) return g.exclude.indexOf(id) < 0;
    if (g.class) return !!(src.towers[id] && src.towers[id].class === g.class);
    return false;
  }

  function test(cond, P, ctx, src) {
    if (Array.isArray(cond)) return cond.every((c) => test(c, P, ctx, src));
    if (!cond || typeof cond !== 'object') return false;
    if (cond.any) return cond.any.some((c) => test(c, P, ctx, src));
    if (cond.not) return !test(cond.not, P, ctx, src);
    if (cond.has) return P.filter((p) => p.id === cond.has && match(p.x, cond.x)).length >= (cond.count || 1);
    if (cond.lacks) return !P.some((p) => p.id === cond.lacks && match(p.x, cond.x));
    if (cond.hasGroup) return P.some((p) => inGroup(src, cond.hasGroup, p.id));
    if (cond.countGroup) return P.filter((p) => inGroup(src, cond.countGroup, p.id)).length >= (cond.min || 1);
    if (cond.onlyGroup) {
      const atk = P.filter((p) => inGroup(src, 'attackers', p.id));
      return atk.length > 0 && atk.every((p) => inGroup(src, cond.onlyGroup, p.id));
    }
    if (cond.maxTier) return P.some((p) => (!cond.group || inGroup(src, cond.group, p.id)) && Math.max.apply(null, p.x) >= cond.maxTier);
    if (cond.missing) return arr(ctx.missing).indexOf(cond.missing) >= 0;
    if (cond.noBonus) return !(ctx.bonuses && ctx.bonuses[cond.noBonus]);
    if (cond.mode) return cond.mode.indexOf(ctx.modeId) >= 0;
    if (cond.notMode) return !!ctx.modeId && cond.notMode.indexOf(ctx.modeId) < 0;
    if (cond.endRound) return (ctx.endRound || 0) >= cond.endRound;
    if (cond.hero) return cond.hero.indexOf(ctx.heroId) >= 0;
    if (cond.notHero) return cond.notHero.indexOf(ctx.heroId) < 0;
    if (cond.noHero) return !ctx.heroId;
    if (cond.mapWater) return cond.mapWater.indexOf(ctx.mapWater) >= 0;
    if (cond.mapLos) return cond.mapLos.indexOf(ctx.mapLos) >= 0;
    return false;
  }

  function synergy(placed, ctx) {
    ctx = ctx || {};
    const src = source(ctx);
    const P = arr(placed).filter((p) => p && p.id).map((p) => ({ id: p.id, x: toX(p.x) }));
    const out = [];
    arr(src.rules.rules).forEach((r) => {
      if (!test(r.when, P, ctx, src)) return;
      const s = r.suggest || {};
      const avoid = r.kind === 'avoid';
      /* already done? pair rules drop out once you have the suggestion */
      if (!avoid && s.tower && P.some((p) => p.id === s.tower && match(p.x, s.x || '0-0-0'))) return;
      if (!avoid && s.hero && ctx.heroId === s.hero) return;
      const name = s.tower ? (src.towers[s.tower] ? src.towers[s.tower].name : s.tower) : s.hero ? (src.heroes[s.hero] ? src.heroes[s.hero].name : s.hero) : (s.support || '');
      let pairsWith = [];
      if (r.pairsWith) {
        const seen = {};
        P.forEach((p) => {
          if ((r.pairsWith === p.id || inGroup(src, r.pairsWith, p.id) || (r.pairsWith === 'carry' && Math.max.apply(null, p.x) >= 4 && inGroup(src, 'attackers', p.id))) && !seen[p.id]) {
            seen[p.id] = true;
            pairsWith.push(src.towers[p.id] ? src.towers[p.id].name : p.id);
          }
        });
      }
      out.push({
        id: r.id, kind: avoid ? 'avoid' : 'pair', strength: r.strength || 'nice', unverified: !!r.unverified,
        tower: s.tower || null, x: s.x || null, hero: s.hero || null, support: s.support || null,
        label: name + (s.x && !avoid ? ' ' + s.x : ''), name, why: r.why, sources: arr(r.sources),
        trigger: r.trigger || (arr(r.when).some((c) => c && (c.missing || (c.any && c.any.some((d) => d.missing)))) ? 'missing' : 'placed'),
        pairsWith,
        specific: JSON.stringify(r.when).indexOf('"has":') >= 0,
      });
    });
    const rank = (o) => (o.kind === 'avoid' ? 0 : 10) + (o.trigger === 'missing' ? 0 : 2) + (o.strength === 'core' ? 0 : 1) + (o.unverified ? 0.5 : 0) - (o.specific ? 0.3 : 0);
    out.sort((a, b) => rank(a) - rank(b));
    /* one suggestion per tower/hero target, keep the best ranked */
    const seen = {};
    return out.filter((o) => {
      const k = o.kind + ':' + (o.tower || o.hero || o.support) + ':' + (o.kind === 'avoid' ? o.id : '');
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }

  root.MonkeyIntel = root.MonkeyIntel || {};
  root.MonkeyIntel.synergy = synergy;
  if (typeof module !== 'undefined' && module.exports) module.exports = { synergy, match };
})(typeof window !== 'undefined' ? window : globalThis);
