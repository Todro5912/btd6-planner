/* Monkey Intel: XP and progression calculator (slug: xp). Needs tools-data, tools-core, tools-ui. */
(function () {
  'use strict';
  const MI = window.MonkeyIntel;
  const C = MI.core, U = MI.ui, h = U.h;
  const D = U.data();
  const root = document.getElementById('xpc-root');
  if (!root) return;
  const KEY = 'mi-xp-v1';
  const saved = U.store.get(KEY) || {};
  const st = {
    towerId: saved.towerId && C.tower(D, saved.towerId) ? saved.towerId : 'sniper',
    unlocked: Array.isArray(saved.unlocked) ? saved.unlocked : [0, 0, 0],
    useXp: !!saved.useXp,
    xp: typeof saved.xp === 'number' ? saved.xp : 0,
    target: saved.target && saved.target.kind ? saved.target : { kind: 'paragon' },
    me: saved.me !== false,
    emt: !!saved.emt,
    maxTier: C.TIERS.indexOf(saved.maxTier) >= 0 ? saved.maxTier : 'Expert',
  };
  String(location.hash || '').replace(/^#/, '').split('&').forEach((kv) => {
    const [k, v] = kv.split('=');
    if (k === 'tower' && C.tower(D, v)) { st.towerId = v; st.unlocked = [0, 0, 0]; st.useXp = false; }
  });
  const save = () => U.store.set(KEY, st);

  function current() {
    const t = C.tower(D, st.towerId);
    let unlocked = st.unlocked, unspent = 0;
    if (st.useXp) { const u = C.unlockedFromXp(t, st.xp); unlocked = u.unlocked; unspent = u.unspent; }
    let target = st.target;
    if (target.kind === 'paragon' && !t.paragon) target = { kind: 'all' };
    if (target.kind === 'upgrade' && !(target.path >= 0 && target.tier >= 1)) target = { kind: 'all' };
    return { t, unlocked, unspent, target, plan: C.xpPlan(D, t.id, unlocked, target, unspent) };
  }

  function render() {
    save();
    const cur = current();
    U.clear(root);
    root.appendChild(pickPanel(cur));
    root.appendChild(answerBlock(cur));
    root.appendChild(orderPanel(cur));
    root.appendChild(farmPanel(cur));
    root.appendChild(rulesPanel());
  }

  function pickPanel(cur) {
    const t = cur.t;
    const grid = U.towerGrid(D, { label: 'Pick a tower', pressed: (x) => x.id === st.towerId, cost: null,
      onpick: (x) => { st.towerId = x.id; st.unlocked = [0, 0, 0]; if (st.target.kind === 'upgrade') st.target = { kind: x.paragon ? 'paragon' : 'all' }; render(); } });
    /* clickable 3x5 pips */
    const pipRows = h('div', { class: 'ti-paths', role: 'group', 'aria-label': 'Unlocked upgrades' });
    for (let p = 0; p < 3; p++) {
      const row = h('div', { class: 'ti-pips', style: 'gap:8px' });
      for (let k = 1; k <= 5; k++) {
        const on = cur.unlocked[p] >= k;
        const isTarget = cur.target.kind === 'upgrade' && cur.target.path === p && cur.target.tier === k;
        row.appendChild(h('button', {
          type: 'button', class: 'ti-pip' + (on ? ' on' : '') + (k === 5 ? ' t5' : '') + (isTarget ? ' target' : ''),
          'aria-pressed': String(on), 'aria-label': C.upgradeName(t, p, k) + (on ? ', unlocked' : ', locked'),
          title: C.upgradeName(t, p, k), disabled: st.useXp ? true : null,
          onclick: () => { st.unlocked = st.unlocked.slice(); st.unlocked[p] = st.unlocked[p] === k ? k - 1 : k; render(); },
        }));
      }
      const nm = cur.unlocked[p] ? C.upgradeName(t, p, cur.unlocked[p]) : 'nothing yet';
      pipRows.appendChild(h('div', { class: 'ti-path', style: 'grid-template-columns:auto minmax(0,1fr)' }, [row, h('span', { class: 'ti-path-name' }, 'Path ' + (p + 1) + ': ' + nm)]));
    }
    const xpIn = h('input', { class: 'ti-input', type: 'number', min: '0', step: '100', inputmode: 'numeric', value: String(st.xp), 'aria-label': 'Total XP earned on this tower', style: 'width:10em' });
    xpIn.addEventListener('change', () => { st.xp = Math.max(0, parseInt(xpIn.value, 10) || 0); render(); });
    const modeSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'How to enter progress' }, [
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(!st.useXp), onclick: () => { st.useXp = false; render(); } }, 'Tap upgrades'),
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(st.useXp), onclick: () => { st.useXp = true; render(); } }, 'Enter total XP'),
    ]);
    const targets = [{ value: 'all', label: 'All tier 5s' }];
    if (t.paragon) targets.unshift({ value: 'paragon', label: 'Paragon: ' + t.paragon.name });
    for (let p = 0; p < 3; p++) for (let k = 1; k <= 5; k++) targets.push({ value: 'u' + p + k, label: 'Path ' + (p + 1) + ' tier ' + k + ': ' + C.upgradeName(t, p, k) });
    const tv = cur.target.kind === 'upgrade' ? 'u' + cur.target.path + cur.target.tier : cur.target.kind;
    const tsel = U.select(targets, tv, (v) => { st.target = v[0] === 'u' ? { kind: 'upgrade', path: +v[1], tier: +v[2] } : { kind: v }; render(); }, { id: 'xpc-target' });
    const mk = h('div', { class: 'ti-row' }, [
      h('label', { class: 'check' }, [h('input', { type: 'checkbox', checked: st.me ? true : null, onchange: (e) => { st.me = e.target.checked; render(); } }), 'Monkey Education (+8%)']),
      t.class === 'Military' ? h('label', { class: 'check' }, [h('input', { type: 'checkbox', checked: st.emt ? true : null, onchange: (e) => { st.emt = e.target.checked; render(); } }), 'Elite Military Training (+5%)']) : null,
    ]);
    return h('section', { class: 'panel', 'aria-labelledby': 'xpc-pick-h' }, [
      h('h2', { class: 'panel-h', id: 'xpc-pick-h' }, 'Your tower'),
      h('div', { class: 'ti-panel-b ti' }, [grid,
        h('div', { class: 'ti-row' }, [h('div', { class: 'ti-field' }, [h('span', null, 'Progress on ' + t.name), modeSeg])]),
        st.useXp ? h('div', { class: 'ti-row' }, [U.field('Total XP earned on it', xpIn), h('p', { class: 'ti-note' }, 'Unlocked below assumes you took the cheapest upgrades first.')]) : null,
        pipRows,
        h('div', { class: 'ti-row' }, [U.field('I want', tsel, 'ti-grow')]),
        mk]),
    ]);
  }

  function farms(cur) {
    return C.farmTable(D, cur.t.id, { me: st.me, emt: st.emt, need: cur.plan.need });
  }
  function answerBlock(cur) {
    const p = cur.plan;
    if (p.noParagon) return h('section', { class: 'ti-alert ti-alert-warn' }, [h('p', { class: 'ti-alert-t' }, cur.t.name + ' has no Paragon'), h('p', { class: 'ti-alert-s' }, 'Pick "All tier 5s" instead.')]);
    if (p.done) return h('section', { class: 'ti-alert ti-alert-ok' }, [h('p', { class: 'ti-alert-t' }, 'Already unlocked'), h('p', { class: 'ti-alert-s' }, 'You have ' + p.targetName + '. Pick another target.')]);
    const rows = farms(cur);
    const best = C.farmPick(rows, st.maxTier);
    const g = (D.guides || {})[cur.t.id] || {};
    const mapName = g.farm && g.farm.map && best && best.modeId === 'deflation' && st.maxTier === 'Expert' ? g.farm.map : null;
    const sentence = best ? 'Play ' + best.tier + ' ' + best.modeName + (mapName ? ' (e.g. ' + mapName + ')' : '') + ' with only ' + cur.t.name + 's: ' +
      C.int(best.xp) + ' XP a run, so ' + best.runs + ' run' + (best.runs === 1 ? '' : 's') + ', about ' + hours(best.totalMin) + '.' : '';
    const kids = [
      h('p', { class: 'ti-lbl', style: 'color:inherit' }, 'XP to ' + p.targetName),
      h('p', { class: 'ti-bignum' }, C.int(p.need)),
      h('p', { class: 'ti-pick' }, sentence),
    ];
    if (p.unknown) kids.push(h('p', { class: 'ti-alert-s' }, [p.unknown + ' upgrade' + (p.unknown > 1 ? 's have' : ' has') + ' unknown XP and count as 0 ', U.badge('unverified')]));
    if (cur.unspent > 0) kids.push(h('p', { class: 'ti-alert-s' }, C.int(cur.unspent) + ' XP of what you entered is not spent yet and is taken off.'));
    return h('section', { class: 'ti-alert ti-alert-warn', 'aria-label': 'Result' }, kids);
  }
  function hours(min) {
    if (!isFinite(min)) return '–';
    return min < 90 ? Math.round(min) + ' min' : (min / 60).toFixed(1) + ' hours';
  }

  function orderPanel(cur) {
    const p = cur.plan;
    const ol = h('ol', { class: 'ti-order' });
    p.steps.forEach((s, i) => {
      ol.appendChild(h('li', null, [
        h('span', { class: 'n' }, String(i + 1)),
        h('span', null, s.paragon ? [h('b', null, s.name), ' (Paragon)'] : [h('b', null, s.name), ' ', U.x([0, 1, 2].map((k) => (k === s.path ? s.tier : 0))), s.unknown ? U.badge('unverified', '? XP') : null]),
        h('span', { class: 'ti-num' }, C.int(s.xp)),
      ]));
    });
    return h('section', { class: 'panel', 'aria-labelledby': 'xpc-ord-h' }, [
      h('h2', { class: 'panel-h', id: 'xpc-ord-h' }, ['Unlock order', h('small', null, p.steps.length ? 'cheapest first, each tier needs the one before' : '')]),
      p.steps.length ? h('div', { class: 'ti-panel-b' }, ol) : h('p', { class: 'ti-note ti-panel-b' }, 'Nothing left to unlock.'),
    ]);
  }

  function farmPanel(cur) {
    const rows = farms(cur).filter((r) => r.tier === st.maxTier);
    const best = C.farmPick(farms(cur), st.maxTier);
    const tierSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Hardest maps you have unlocked' }, C.TIERS.map((tr) =>
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(st.maxTier === tr), onclick: () => { st.maxTier = tr; render(); } }, tr)));
    const ease = ['', 'Easy', 'Easy', 'Medium', 'Hard', 'Very hard'];
    const tb = h('tbody');
    rows.slice(0, 14).forEach((r) => {
      const isBest = best && r.modeId === best.modeId && r.tier === best.tier;
      tb.appendChild(h('tr', { class: isBest ? 'ti-tbl-best' : null }, [
        h('th', { scope: 'row' }, [r.tier + ' ' + r.modeName, h('br'), h('span', { class: 'ti-mono', style: 'font-size:12px' }, 'R' + r.rounds[0] + '–' + r.rounds[1])]),
        h('td', { class: 'n' }, C.int(r.xp)),
        h('td', { class: 'n' }, r.runs != null ? String(r.runs) : '–'),
        h('td', { class: 'n hide-s' }, '~' + Math.round(r.minutes) + ' min'),
        h('td', { class: 'n' }, r.totalMin != null ? hours(r.totalMin) : '–'),
        h('td', { class: 'hide-s' }, ease[r.ease] + (r.mk ? '' : ', no MK')),
      ]));
    });
    return h('section', { class: 'panel', 'aria-labelledby': 'xpc-farm-h' }, [
      h('h2', { class: 'panel-h', id: 'xpc-farm-h' }, ['Farms ranked', h('small', null, 'XP per run with only this tower')]),
      h('div', { class: 'ti-panel-b ti-field', style: 'margin-bottom:10px' }, [h('span', null, 'Hardest maps you have unlocked'), tierSeg]),
      h('div', { class: 'table-wrap table-flat', style: 'margin:0 14px' }, h('table', { class: 'tbl' }, [
        h('thead', null, h('tr', null, [h('th', null, 'Farm'), h('th', { class: 'n' }, 'XP / run'), h('th', { class: 'n' }, 'Runs'), h('th', { class: 'n hide-s' }, 'Per run'), h('th', { class: 'n' }, 'Total time'), h('th', { class: 'hide-s' }, 'To win')])),
        tb,
      ])),
      h('p', { class: 'ti-note ti-panel-b', style: 'margin-top:8px' }, ['Map tier multiplies XP: Beginner ×1.0, Intermediate ×1.1, Advanced ×1.2, Expert ×1.3. Times are rough fast-forward estimates ', U.badge('calc', 'estimate'), '.']),
    ]);
  }

  function rulesPanel() {
    return h('details', { class: 'panel ti-details' }, [
      h('summary', { class: 'panel-h panel-h-light' }, ['How tower XP works', h('small', null, 'tap to open')]),
      h('div', { class: 'ti-panel-b', style: 'padding-top:8px' }, h('ul', { class: 'ti-rules' }, [
        h('li', null, ['Every round you beat pays XP: 20 × round + 20 up to ', h('span', { class: 'ti-mono' }, 'R20'), ', then more each round (', h('span', { class: 'ti-mono' }, 'R50'), ' pays 1,620).']),
        h('li', null, 'That XP is split between your tower types by the cash you have put into each one.'),
        h('li', null, 'Your hero takes none of it, so hero spending doesn\'t cut your tower XP.'),
        h('li', null, 'Harder maps pay more: up to ×1.3 on Expert. Monkey Education adds 8%, Elite Military Training 5% on Military towers. Monkey Knowledge is off in CHIMPS.'),
        h('li', null, 'Freeplay rounds after you win pay 30% up to R100, then 10%.'),
        h('li', null, 'A Paragon unlocks with its own XP after all 15 upgrades.'),
      ])),
    ]);
  }
  render();
})();
