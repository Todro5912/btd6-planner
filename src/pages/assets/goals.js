/* Monkey Intel: My goals (slug: goals). Needs progress.js (site-wide), tools-data, tools-core, advisor-core, goals-core, tools-ui.
   Track Paragon / tier 5 / upgrade goals: log runs, spend banked XP on the next unlock, see runs left, open the farm. */
(function () {
  'use strict';
  const MI = window.MonkeyIntel;
  const C = MI.core, U = MI.ui, h = U.h;
  const D = U.data();
  const root = document.getElementById('gls-root');
  if (!root) return;
  const P = MI.progress;
  if (!P) { root.appendChild(h('p', { class: 'ti-note' }, 'My goals could not load your saved progress.')); return; }

  const pick = { tower: 'dart', target: 'paragon' };
  let flash = null; /* {id, text}: a line shown on one card after an action */
  let focusId = null;

  const towerOpts = () => ['Primary', 'Military', 'Magic', 'Support'].map((cl) => ({ group: cl, items: D.towers.filter((t) => t.class === cl).map((t) => ({ value: t.id, label: t.name, keys: t.paragon ? 'paragon ' + t.paragon.name : '' })) }));
  const KIND = { paragon: 'Paragon', all: 'Every tier 5', upgrade: 'One upgrade' };
  const towerUrl = (id) => '../../monkeys/' + id + '/';

  function handleHash() {
    const q = {};
    String(location.hash || '').replace(/^#/, '').split('&').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    if (q.add) {
      const m = q.add.match(/^([a-z]+)\.(paragon|all|u(\d)(\d))$/);
      const t = m && C.tower(D, m[1]);
      if (t) {
        const g = m[2] === 'paragon' ? { tower: t.id, kind: t.paragon ? 'paragon' : 'all' } : m[2] === 'all' ? { tower: t.id, kind: 'all' } : { tower: t.id, kind: 'upgrade', path: +m[3], tier: +m[4] };
        if (g.kind !== 'upgrade' || (g.path <= 2 && g.tier >= 1 && g.tier <= 5)) focusId = P.addGoal(g);
        pick.tower = t.id;
      }
    }
    if (q.g) focusId = q.g;
    if (q.tower && C.tower(D, q.tower)) pick.tower = q.tower;
    if (q.add || q.g || q.tower) { try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ } }
  }

  function render() {
    const s = P.get();
    const views = s.goals.map((g) => C.goalView(D, g, s.towers[g.tower], s.settings)).filter(Boolean);
    views.forEach((v) => P.cacheGoal(v.g.id, { name: v.name, tower: v.t.name, pct: v.pct, done: v.complete, next: v.next ? v.next.name : '', runs: v.runsLeft,
      total: v.total, remaining: v.remaining, perRun: v.best ? v.best.xp : 0 }));
    /* keep focus and open panels across the re-render */
    const fid = document.activeElement && document.activeElement.id;
    U.clear(root);
    if (!views.length) root.appendChild(addPanel(true));
    views.forEach((v) => root.appendChild(goalCard(v, s)));
    if (views.length) root.appendChild(addPanel(false));
    root.appendChild(towersPanel(s));
    if (s.log.length) root.appendChild(logPanel(s));
    root.appendChild(settingsPanel(s));
    if (focusId) {
      const el = document.getElementById('goal-' + focusId);
      focusId = null;
      if (el) setTimeout(() => el.scrollIntoView({ block: 'start' }), 0);
    } else if (fid) {
      const el = document.getElementById(fid);
      if (el && el.focus) el.focus({ preventScroll: true });
    }
  }
  const openPanels = {};
  function keepOpen(d, key) {
    if (openPanels[key]) d.open = true;
    d.addEventListener('toggle', () => { openPanels[key] = d.open; });
    return d;
  }

  /* ---------- add a goal ---------- */
  function addPanel(first) {
    const t = C.tower(D, pick.tower) || D.towers[0];
    const targets = [];
    if (t.paragon) targets.push({ value: 'paragon', label: 'Paragon: ' + t.paragon.name });
    targets.push({ value: 'all', label: 'Every tier 5' });
    for (let p = 0; p < 3; p++) for (let k = 3; k <= 5; k++) targets.push({ value: 'u' + p + k, label: 'Path ' + (p + 1) + ' tier ' + k + ': ' + C.upgradeName(t, p, k) });
    if (!targets.some((x) => x.value === pick.target)) pick.target = targets[0].value;
    const add = () => {
      const v = pick.target;
      const g = v === 'paragon' || v === 'all' ? { tower: t.id, kind: v } : { tower: t.id, kind: 'upgrade', path: +v[1], tier: +v[2] };
      focusId = P.addGoal(g);
      render();
    };
    const plan = C.xpPlan(D, t.id, P.tower(t.id).u, pick.target[0] === 'u' ? { kind: 'upgrade', path: +pick.target[1], tier: +pick.target[2] } : { kind: pick.target }, P.tower(t.id).bank);
    const quick = C.paragonsByXp(D).slice(0, 4);
    const body = h('div', { class: 'ti-panel-b ti' }, [
      h('div', { class: 'ti-row' }, [
        U.field('Tower', U.combo(towerOpts(), t.id, (v) => { pick.tower = v; render(); }, { id: 'gls-tower' }), 'ti-grow'),
        U.field('I want', U.select(targets, pick.target, (v) => { pick.target = v; render(); }, { id: 'gls-target' }), 'ti-grow'),
      ]),
      h('div', { class: 'ti-share' }, [
        h('button', { type: 'button', class: 'btn btn-grass ti-primary', id: 'gls-add', onclick: add }, 'Track this goal'),
        h('span', { class: 'ti-note' }, plan && plan.need ? C.int(plan.need) + ' XP to go from what you have now' : 'Already unlocked'),
      ]),
      h('div', null, [h('p', { class: 'ti-lbl' }, 'Quickest Paragons to aim for'),
        h('p', { class: 'ti-quick' }, quick.map((x) => h('button', { type: 'button', class: 'tag ti-tipchip', onclick: () => { focusId = P.addGoal({ tower: x.t.id, kind: 'paragon' }); render(); } }, '+ ' + x.t.paragon.name + ' · ' + Math.round(x.xp / 1000) + 'k XP')))]),
    ]);
    if (first) return h('section', { class: 'panel', 'aria-labelledby': 'gls-add-h' }, [h('h2', { class: 'panel-h', id: 'gls-add-h' }, ['What do you want to unlock?', h('small', null, 'start a goal')]), body]);
    return keepOpen(h('details', { class: 'panel ti-details' }, [h('summary', { class: 'panel-h panel-h-light', id: 'gls-add-sum' }, ['Add another goal', h('small', null, 'tap to open')]), h('div', { style: 'padding-top:10px' }, body)]), 'add');
  }

  /* ---------- one goal ---------- */
  function goalCard(v, s) {
    const id = v.g.id;
    const t = v.t;
    const kids = [];
    kids.push(h('div', { class: 'gl-meter' }, [
      h('span', { class: 'gl-pct ti-num' }, Math.floor(v.pct) + '%'),
      h('span', { class: 'mi-bar mi-bar-big', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.floor(v.pct)), 'aria-label': v.name + ' progress' },
        h('span', { class: 'mi-bar-fill', style: 'width:' + v.pct.toFixed(1) + '%' })),
      h('span', { class: 'gl-meter-s ti-num' }, [C.int(v.earned) + ' of ' + C.int(v.total) + ' XP', v.milestone ? h('span', { class: 'tag tag-banana gl-mile' }, v.milestone) : null]),
    ]));
    if (flash && flash.id === id) kids.push(h('p', { class: 'gl-flash', role: 'status' }, flash.text));
    if (v.complete) {
      kids.push(h('div', { class: 'ti-alert ti-alert-ok gl-done' }, [
        h('p', { class: 'ti-alert-t' }, v.name + ' unlocked'),
        h('p', { class: 'ti-alert-s' }, 'Go build it. Then pick your next goal below.'),
        h('div', { class: 'ti-share' }, [
          h('a', { class: 'btn btn-small', href: '../advisor/#hero=auto&t=' + t.id }, 'Plan a game with it'),
          h('button', { type: 'button', class: 'btn btn-small', onclick: () => { P.removeGoal(id); render(); } }, 'Clear this goal'),
        ]),
      ]));
    } else {
      const nx = v.next;
      const code = nx && !nx.paragon ? [0, 1, 2].map((k) => (k === nx.path ? nx.tier : 0)) : null;
      kids.push(h('div', { class: 'gl-next' }, [
        h('div', null, [h('p', { class: 'ti-lbl' }, 'Next unlock'),
          h('p', { class: 'gl-next-n' }, [nx.name, code ? [' ', U.x(code)] : ' (Paragon)', h('span', { class: 'gl-next-x ti-num' }, C.int(nx.xp) + ' XP'), nx.unknown ? U.badge('unverified', '? XP') : null])]),
        v.canUnlock && affordable(v) > 1
          ? h('div', { class: 'gl-unlocks' }, [
            h('button', { type: 'button', class: 'btn btn-grass gl-unlock', onclick: () => {
              let n = P.tower(t.id), k = 0;
              const g2 = v.g;
              for (;;) {
                const vv = C.goalView(D, g2, n, P.get().settings);
                if (!vv || !vv.canUnlock) break;
                n = C.unlockStep(n, vv.next);
                k++;
              }
              P.setTower(t.id, n);
              flash = { id, text: 'Unlocked ' + k + ' upgrades. ' + (n.bank ? C.int(n.bank) + ' XP still banked.' : '') };
              render();
            } }, 'Unlock all ' + affordable(v) + ' I can afford'),
            h('button', { type: 'button', class: 'btn btn-small', onclick: () => {
              const n = C.unlockStep(P.tower(t.id), nx);
              if (n) { P.setTower(t.id, n); flash = { id, text: 'Unlocked ' + nx.name + '. ' + (n.bank ? C.int(n.bank) + ' XP still banked.' : '') }; render(); }
            } }, 'Just the next one')])
          : v.canUnlock
          ? h('button', { type: 'button', class: 'btn btn-grass gl-unlock', onclick: () => {
            const n = C.unlockStep(P.tower(t.id), nx);
            if (n) { P.setTower(t.id, n); flash = { id, text: 'Unlocked ' + nx.name + '. ' + (n.bank ? C.int(n.bank) + ' XP still banked.' : '') }; render(); }
          } }, 'Unlock it (' + C.int(nx.xp) + ' XP)')
          : h('p', { class: 'gl-need ti-num' }, [h('b', null, C.int(v.nextNeed) + ' XP'), ' more', v.runsNext ? ', about ' + v.runsNext + ' run' + (v.runsNext === 1 ? '' : 's') : '']),
      ]));
      kids.push(h('dl', { class: 'stats gl-stats' }, [
        stat('XP banked', C.int(v.bank), 'on ' + t.name.replace(/ Monkey$/, '')),
        stat('Still to earn', C.int(v.need), v.need ? 'after spending the bank' : 'the bank covers it'),
        stat('Runs left', v.runsLeft ? String(v.runsLeft) : '0', v.best ? v.best.tier + ' ' + v.best.modeName : ''),
        stat('Time left', hours(v.minutesLeft), 'fast-forward estimate'),
      ]));
      kids.push(logRow(v));
      kids.push(farmRow(v, s));
      if (v.steps.length > 1) {
        const ol = h('ol', { class: 'ti-order gl-steps' });
        v.steps.forEach((st, i) => {
          ol.appendChild(h('li', null, [
            h('span', { class: 'n' }, String(i + 1)),
            h('span', null, st.paragon ? [h('b', null, st.name), ' (Paragon)'] : [h('b', null, st.name), ' ', U.x([0, 1, 2].map((k) => (k === st.path ? st.tier : 0)))]),
            h('span', { class: 'ti-num' }, C.int(st.xp)),
          ]));
        });
        kids.push(h('details', { class: 'gl-more' }, [h('summary', null, 'Every unlock left (' + v.steps.length + ')'), ol]));
      }
      kids.push(h('p', { class: 'ti-note gl-have' }, ['Already have the next one in your game? ',
        h('button', { type: 'button', class: 'linkbtn', onclick: () => { const n = C.unlockStep(P.tower(t.id), v.next, true); if (n) { P.setTower(t.id, n); flash = { id, text: 'Marked ' + v.next.name + ' as unlocked.' }; render(); } } }, 'Mark it unlocked'),
        ' (no XP spent). Or set every tier at once in the ', h('a', { href: '../xp/#tower=' + t.id }, 'XP calculator'), '.']));
    }
    kids.push(h('p', { class: 'ti-note gl-foot' }, [h('a', { href: towerUrl(t.id) }, t.name + ' page'), ' · ',
      h('button', { type: 'button', class: 'linkbtn', onclick: () => { if (window.confirm('Stop tracking ' + v.name + '? Your unlocks and banked XP stay.')) { P.removeGoal(id); render(); } } }, 'Stop tracking')]));
    return h('section', { class: 'panel gl-card' + (v.complete ? ' gl-complete' : ''), id: 'goal-' + id, 'aria-labelledby': 'goal-h-' + id }, [
      h('h2', { class: 'panel-h', id: 'goal-h-' + id }, [v.name, h('small', null, t.name + ' · ' + KIND[v.target.kind])]),
      h('div', { class: 'ti-panel-b ti gl-b' }, kids),
    ]);
  }
  /* how many of the next unlocks the bank pays for, in order */
  function affordable(v) {
    let bank = v.bank, k = 0;
    for (const st of v.steps) { if (st.xp > bank) break; bank -= st.xp; k++; }
    return k;
  }
  function stat(label, val, sub) { return h('div', { class: 'stat' }, [h('dt', null, label), h('dd', { class: 'stat-v ti-num' }, val), sub ? h('dd', { class: 'stat-s' }, sub) : null]); }
  function hours(min) { if (!(min > 0)) return '0'; return min < 90 ? Math.round(min) + ' min' : (min / 60).toFixed(1) + ' h'; }

  function logRow(v) {
    const t = v.t;
    const rows = v.farms.slice().sort((a, b) => b.xp - a.xp).slice(0, 8);
    const best = v.best;
    const def = best ? best.modeId : rows[0] && rows[0].modeId;
    const sel = U.select(rows.map((r) => ({ value: r.modeId, label: r.tier + ' ' + r.modeName + ' · ' + C.int(r.xp) + ' XP' + (best && r.modeId === best.modeId ? ' (best)' : '') })), def, () => {}, { 'aria-label': 'Which run did you play?' });
    const xpIn = h('input', { class: 'ti-input', type: 'number', min: '0', step: '100', inputmode: 'numeric', placeholder: 'XP from the end screen', 'aria-label': 'XP earned this run', style: 'width:12em' });
    const logIt = (xp, label) => { P.logRun(t.id, xp, label); flash = { id: v.g.id, text: '+' + C.int(xp) + ' XP banked on ' + t.name.replace(/ Monkey$/, '') + '.' }; render(); };
    return h('div', { class: 'gl-log' }, [
      h('p', { class: 'ti-lbl' }, 'Played a run?'),
      h('div', { class: 'ti-row' }, [
        h('div', { class: 'ti-field ti-grow' }, [h('span', null, 'Run'), sel]),
        h('button', { type: 'button', class: 'btn btn-grass', id: 'gl-logbtn-' + v.g.id, onclick: () => { const r = rows.find((x) => x.modeId === sel.value); if (r) logIt(r.xp, r.tier + ' ' + r.modeName); } }, 'Log a run'),
      ]),
      h('div', { class: 'ti-row' }, [
        h('div', { class: 'ti-field' }, [h('span', null, 'Or the exact XP'), xpIn]),
        h('button', { type: 'button', class: 'btn', onclick: () => { const x = parseInt(xpIn.value, 10); if (x > 0) logIt(x, 'Exact XP'); } }, 'Add XP'),
      ]),
    ]);
  }
  function farmRow(v, s) {
    const t = v.t;
    const fp = C.farmPlan(D, t.id);
    const tier = s.settings.maxTier;
    const best = v.best;
    const acts = [];
    if (fp && tier === 'Expert') {
      acts.push(h('a', { class: 'btn btn-small btn-sky', href: '../simulator/#' + C.encodePlan(fp) }, 'Open the farm in the Simulator'));
      acts.push(h('span', { class: 'ti-note' }, fp.label + (fp.xpPerRun ? ', about ' + C.int(fp.xpPerRun) + ' XP a run' : '')));
    }
    if (best) {
      const mp = fp && tier === 'Expert' ? C.map(D, fp.mapId) : C.farmMap(D, t.id, best.tier);
      acts.push(h('a', { class: 'btn btn-small', href: '../advisor/#map=' + mp.id + '&mode=' + best.modeId + '&hero=auto&t=' + t.id }, 'Plan a ' + best.modeName + ' run in the Advisor'));
    }
    return h('div', { class: 'gl-farm' }, [h('p', { class: 'ti-lbl' }, 'Where to farm'), h('div', { class: 'ti-share' }, acts)]);
  }

  /* ---------- the rest ---------- */
  function towersPanel(s) {
    const ids = Object.keys(s.towers).filter((id) => s.towers[id].set && C.tower(D, id));
    const body = ids.length ? h('ul', { class: 'gl-towers' }, ids.map((id) => {
      const t = C.tower(D, id), p = s.towers[id];
      return h('li', null, [h('a', { href: towerUrl(id) }, t.name), ' ', U.x(p.u), p.p ? h('span', { class: 'tag tag-banana' }, 'Paragon') : null,
        p.bank ? h('span', { class: 'ti-note' }, ' · ' + C.int(p.bank) + ' XP banked') : null,
        ' ', h('a', { class: 'ti-note', href: '../xp/#tower=' + id }, 'edit')]);
    })) : h('p', { class: 'ti-note' }, 'Nothing yet. Start a goal, or set what you have unlocked in the XP calculator.');
    return h('section', { class: 'panel', 'aria-labelledby': 'gls-tw-h' }, [h('h2', { class: 'panel-h', id: 'gls-tw-h' }, ['Your unlocks', h('small', null, 'the Advisor and Simulator use these')]), h('div', { class: 'ti-panel-b', style: 'padding-top:10px' }, body)]);
  }
  function logPanel(s) {
    const ul = h('ul', { class: 'gl-runs' }, s.log.slice(0, 8).map((r) => {
      const t = C.tower(D, r.tower);
      return h('li', null, [h('span', { class: 'ti-num' }, '+' + C.int(r.xp) + ' XP'), ' ' + (t ? t.name : r.tower) + (r.label ? ' · ' + r.label : ''),
        h('small', { class: 'ti-note' }, ' ' + new Date(r.ts).toLocaleDateString()), ' ',
        h('button', { type: 'button', class: 'linkbtn', onclick: () => { P.undoRun(r.id || r.ts); render(); } }, 'undo')]);
    }));
    return h('section', { class: 'panel', 'aria-labelledby': 'gls-log-h' }, [h('h2', { class: 'panel-h', id: 'gls-log-h' }, ['Runs you logged', h('small', null, s.log.length + ' so far')]), h('div', { class: 'ti-panel-b', style: 'padding-top:10px' }, ul)]);
  }
  function settingsPanel(s) {
    const set = (k, v) => { P.update((x) => { x.settings[k] = v; }); render(); };
    const tierSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Hardest maps you have unlocked' }, C.TIERS.map((tr) =>
      h('button', { type: 'button', role: 'radio', id: 'gls-tier-' + tr, 'aria-checked': String(s.settings.maxTier === tr), onclick: () => set('maxTier', tr) }, tr)));
    const code = h('textarea', { class: 'ti-input gl-code', rows: '2', readonly: true, 'aria-label': 'Your backup code' });
    code.value = P.exportCode();
    const paste = h('input', { class: 'ti-input', type: 'text', placeholder: 'Paste a backup code', 'aria-label': 'Paste a backup code', style: 'width:100%' });
    const msg = h('span', { class: 'ti-note', role: 'status' });
    return keepOpen(h('details', { class: 'panel ti-details' }, [
      h('summary', { class: 'panel-h panel-h-light', id: 'gls-set-sum' }, ['Settings and backup', h('small', null, 'tap to open')]),
      h('div', { class: 'ti-panel-b ti', style: 'padding-top:10px' }, [
        h('div', { class: 'ti-row' }, [
          h('label', { class: 'check' }, [h('input', { type: 'checkbox', id: 'gls-me', checked: s.settings.me ? true : null, onchange: (e) => set('me', e.target.checked) }), 'Monkey Education (+8%)']),
          h('label', { class: 'check' }, [h('input', { type: 'checkbox', id: 'gls-emt', checked: s.settings.emt ? true : null, onchange: (e) => set('emt', e.target.checked) }), 'Elite Military Training (Military +5%)']),
        ]),
        h('div', { class: 'ti-field' }, [h('span', null, 'Hardest maps you have unlocked'), tierSeg]),
        h('p', { class: 'ti-note' }, ['Your unlocks, heroes, Monkey Knowledge and Insta Monkeys live in ', h('a', { href: '../profile/' }, 'My profile'), '.']),
        h('div', { class: 'ti-field' }, [h('span', null, 'Move your progress to another device: copy this code, paste it there'), code,
          h('div', { class: 'ti-share' }, [h('button', { type: 'button', class: 'btn btn-small', onclick: (e) => {
            const b = e.currentTarget;
            try { navigator.clipboard.writeText(code.value).then(() => { b.textContent = 'Copied'; }, () => { code.select(); }); } catch (err) { code.select(); }
          } }, 'Copy code')])]),
        h('div', { class: 'ti-field' }, [h('span', null, 'Restore from a code'), paste, h('div', { class: 'ti-share' }, [
          h('button', { type: 'button', class: 'btn btn-small', onclick: () => { if (P.importCode(paste.value)) render(); else msg.textContent = 'That code did not work. Copy the whole thing, starting with MI1.'; } }, 'Restore'), msg])]),
        h('p', null, h('button', { type: 'button', class: 'btn btn-small', onclick: () => { if (window.confirm('Delete every goal, unlock and logged run saved in this browser?')) { P.reset(); render(); } } }, 'Reset everything')),
      ]),
    ]), 'settings');
  }

  handleHash();
  render();
  window.addEventListener('hashchange', () => { handleHash(); render(); });
})();
