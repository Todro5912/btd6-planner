/* Monkey Intel: XP and progression calculator (slug: xp). Needs tools-data, tools-core, goals-core, tools-ui.
   Reads and writes your unlocks in the shared progress store (progress.js), so My goals, the Advisor and the Simulator agree. */
(function () {
  'use strict';
  const MI = window.MonkeyIntel;
  const C = MI.core, U = MI.ui, h = U.h;
  const D = U.data();
  const root = document.getElementById('xpc-root');
  if (!root) return;
  const KEY = 'mi-xp-v1';
  const saved = U.store.get(KEY) || {};
  const P = MI.progress || null;
  const mine = (id) => (P ? P.tower(id) : null);
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
  /* #tower=<id> (and ?tower=<id> from older links) */
  String(location.hash || '').replace(/^#/, '').split('&').concat(String(location.search || '').replace(/^\?/, '').split('&')).forEach((kv) => {
    const [k, v] = kv.split('=');
    if (k === 'tower' && C.tower(D, v)) { st.towerId = v; st.unlocked = [0, 0, 0]; st.useXp = false; }
  });
  /* your saved unlocks for this tower win over the calculator's own memory */
  /* Monkey Education / Elite Military Training are part of My profile */
  /* the hardest map tier and the tower's banked XP too, so this page and My goals give the same answer */
  if (P) { const set = P.get().settings; st.me = set.me === true; st.emt = !!set.emt; st.maxTier = set.maxTier || st.maxTier; }
  const saveMk = () => { if (P) P.update((x) => { x.settings.me = st.me; x.settings.emt = st.emt; x.settings.maxTier = st.maxTier; }); };
  const bankOf = (id) => { const m = mine(id); return m ? m.bank || 0 : 0; };
  const loadMine = () => { const m = mine(st.towerId); if (m && m.set) st.unlocked = m.u.slice(); };
  loadMine();
  const save = () => U.store.set(KEY, st);
  /* only a tap on the unlock pips writes to the shared store (so a stale tab can't put old tiers back) */
  const saveMine = () => { if (P) P.setTower(st.towerId, { u: st.unlocked.slice() }); };

  function current() {
    const t = C.tower(D, st.towerId);
    let unlocked = st.unlocked, unspent = 0, bank = 0;
    if (st.useXp) { const u = C.unlockedFromXp(t, st.xp); unlocked = u.unlocked; unspent = u.unspent; }
    else { bank = bankOf(t.id); unspent = bank; } /* XP you banked in My goals counts towards the next unlock */
    let target = st.target;
    if (target.kind === 'paragon' && !t.paragon) target = { kind: 'all' };
    if (target.kind === 'upgrade' && !(target.path >= 0 && target.tier >= 1)) target = { kind: 'all' };
    const plan = C.xpPlan(D, t.id, unlocked, target, unspent);
    /* the Paragon is already yours (My profile / My goals): nothing left, the same as the goal card */
    if (target.kind === 'paragon' && P && P.tower(t.id).p && !st.useXp) { plan.steps = []; plan.need = 0; plan.done = true; }
    return { t, unlocked, unspent, bank, target, plan };
  }

  function render() {
    save();
    const cur = current();
    const snap = U.snapFocus();
    U.clear(root);
    root.appendChild(pickPanel(cur));
    root.appendChild(answerBlock(cur));
    root.appendChild(orderPanel(cur));
    root.appendChild(farmPanel(cur));
    root.appendChild(rulesPanel());
    U.restoreFocus(snap, root);
  }

  function pickPanel(cur) {
    const t = cur.t;
    const grid = U.towerGrid(D, { label: 'Pick a tower', key: 'xpc-t', pressed: (x) => x.id === st.towerId, cost: null,
      onpick: (x) => { st.towerId = x.id; st.unlocked = [0, 0, 0]; loadMine(); if (st.target.kind === 'upgrade') st.target = { kind: x.paragon ? 'paragon' : 'all' }; render(); } });
    /* clickable 3x5 pips */
    const pipRows = h('div', { class: 'ti-paths', role: 'group', 'aria-label': 'Unlocked upgrades' });
    for (let p = 0; p < 3; p++) {
      const row = h('div', { class: 'ti-pips', style: 'gap:8px' });
      for (let k = 1; k <= 5; k++) {
        const on = cur.unlocked[p] >= k;
        const isTarget = cur.target.kind === 'upgrade' && cur.target.path === p && cur.target.tier === k;
        row.appendChild(h('button', {
          type: 'button', id: 'xpc-pip-' + p + k, class: 'ti-pip' + (on ? ' on' : '') + (k === 5 ? ' t5' : '') + (isTarget ? ' target' : ''),
          'aria-pressed': String(on), 'aria-label': C.upgradeName(t, p, k) + (on ? ', unlocked' : ', locked'),
          title: C.upgradeName(t, p, k), disabled: st.useXp ? true : null,
          onclick: () => { loadMine(); st.unlocked = st.unlocked.slice(); st.unlocked[p] = st.unlocked[p] === k ? k - 1 : k; saveMine(); render(); },
        }));
      }
      const nm = cur.unlocked[p] ? C.upgradeName(t, p, cur.unlocked[p]) : 'nothing yet';
      pipRows.appendChild(h('div', { class: 'ti-path', style: 'grid-template-columns:auto minmax(0,1fr)' }, [row, h('span', { class: 'ti-path-name' }, 'Path ' + (p + 1) + ': ' + nm)]));
    }
    const xpIn = h('input', { class: 'ti-input', type: 'number', min: '0', step: '100', inputmode: 'numeric', value: String(st.xp), 'aria-label': 'Total XP earned on this tower', style: 'width:10em' });
    xpIn.addEventListener('change', () => { st.xp = Math.max(0, parseInt(xpIn.value, 10) || 0); render(); });
    const modeSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'How to enter progress' }, [
      h('button', { type: 'button', role: 'radio', id: 'xpc-in-tap', 'aria-checked': String(!st.useXp), onclick: () => { st.useXp = false; render(); } }, 'Tap upgrades'),
      h('button', { type: 'button', role: 'radio', id: 'xpc-in-xp', 'aria-checked': String(st.useXp), onclick: () => { st.useXp = true; render(); } }, 'Enter total XP'),
    ]);
    const targets = [{ value: 'all', label: 'All tier 5s' }];
    if (t.paragon) targets.unshift({ value: 'paragon', label: 'Paragon: ' + t.paragon.name });
    for (let p = 0; p < 3; p++) for (let k = 1; k <= 5; k++) targets.push({ value: 'u' + p + k, label: 'Path ' + (p + 1) + ' tier ' + k + ': ' + C.upgradeName(t, p, k) });
    const tv = cur.target.kind === 'upgrade' ? 'u' + cur.target.path + cur.target.tier : cur.target.kind;
    const tsel = U.select(targets, tv, (v) => { st.target = v[0] === 'u' ? { kind: 'upgrade', path: +v[1], tier: +v[2] } : { kind: v }; render(); }, { id: 'xpc-target' });
    const mk = h('div', { class: 'ti-row' }, [
      h('label', { class: 'check' }, [h('input', { type: 'checkbox', id: 'xpc-me', checked: st.me ? true : null, onchange: (e) => { st.me = e.target.checked; saveMk(); render(); } }), 'Monkey Education (+8%)' + (P && P.get().settings.me == null ? ': not set, counted as off' : '')]),
      t.class === 'Military' ? h('label', { class: 'check' }, [h('input', { type: 'checkbox', id: 'xpc-emt', checked: st.emt ? true : null, onchange: (e) => { st.emt = e.target.checked; saveMk(); render(); } }), 'Elite Military Training (+5%)']) : null,
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

  /* the same farm and XP a run as My goals (goals-core C.goalFarm) */
  function farmOf(cur) { return C.goalFarm(D, cur.t.id, cur.plan.need, { me: st.me, emt: st.emt, maxTier: st.maxTier }); }
  function farms(cur) { return farmOf(cur).rows; }
  function answerBlock(cur) {
    const p = cur.plan;
    if (p.noParagon) return h('section', { class: 'ti-alert ti-alert-warn' }, [h('p', { class: 'ti-alert-t' }, cur.t.name + ' has no Paragon'), h('p', { class: 'ti-alert-s' }, 'Pick "All tier 5s" instead.')]);
    if (p.done) return h('section', { class: 'ti-alert ti-alert-ok' }, [h('p', { class: 'ti-alert-t' }, 'Already unlocked'), h('p', { class: 'ti-alert-s' }, 'You have ' + p.targetName + '. Pick another target.')]);
    const gf = farmOf(cur);
    const best = gf.best;
    const mapName = gf.guide ? C.map(D, gf.guide.mapId).name : null;
    const sentence = best ? 'Play ' + best.tier + ' ' + best.modeName + (mapName ? ' on ' + mapName : '') + ' with ' + gf.who + ': ' +
      C.int(gf.perRun) + ' XP a run, so ' + gf.runs + ' run' + (gf.runs === 1 ? '' : 's') + ', about ' + hours(gf.minutes) + '.' : '';
    const kids = [
      h('p', { class: 'ti-lbl', style: 'color:inherit' }, 'XP to ' + p.targetName),
      h('p', { class: 'ti-bignum' }, C.int(p.need)),
      h('p', { class: 'ti-pick' }, sentence),
    ];
    if (cur.bank > 0) kids.push(h('p', { class: 'ti-alert-s' }, ['After the ' + C.int(cur.bank) + ' XP banked on ' + cur.t.name.replace(/ Monkey$/, '') + ' in ', h('a', { href: '../goals/' }, 'My goals'), '.']));
    if (best) kids.push(h('p', { class: 'ti-alert-s' }, ['Hardest maps you have: ' + st.maxTier + ' (from ', h('a', { href: '../profile/' }, 'My profile'), '; change it below).']));
    if (p.unknown) kids.push(h('p', { class: 'ti-alert-s' }, [p.unknown + ' upgrade' + (p.unknown > 1 ? 's have' : ' has') + ' unknown XP and count as 0 ', U.badge('unverified')]));
    if (cur.unspent > 0 && !cur.bank) kids.push(h('p', { class: 'ti-alert-s' }, C.int(cur.unspent) + ' XP of what you entered is not spent yet and is taken off.'));
    if (P) {
      const t = cur.t, tg = cur.target;
      const add = tg.kind === 'upgrade' ? t.id + '.u' + tg.path + tg.tier : t.id + '.' + tg.kind;
      kids.push(h('div', { class: 'ti-share' }, [h('a', { class: 'btn btn-grass', id: 'xpc-goal', href: '../goals/#add=' + add }, 'Track this as a goal'),
        h('span', { class: 'ti-alert-s' }, 'Log runs and watch the bar fill. Your unlocks above are saved for every tool.')]));
    }
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
    const gf = farmOf(cur);
    const rows = gf.rows.filter((r) => r.tier === st.maxTier);
    const best = gf.best;
    const tierSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Hardest maps you have unlocked' }, C.TIERS.map((tr) =>
      h('button', { type: 'button', role: 'radio', id: 'xpc-tier-' + tr, 'aria-checked': String(st.maxTier === tr), onclick: () => { st.maxTier = tr; saveMk(); render(); } }, tr)));
    const ease = ['', 'Easy', 'Easy', 'Medium', 'Hard', 'Very hard'];
    const tb = h('tbody');
    rows.slice(0, 14).forEach((r) => {
      const isBest = best && r.modeId === best.modeId && r.tier === best.tier;
      const guide = isBest && gf.guide && gf.share < 0.995; /* the guide's farm: its helpers take part of the XP */
      tb.appendChild(h('tr', { class: isBest ? 'ti-tbl-best' : null }, [
        h('th', { scope: 'row' }, [r.tier + ' ' + r.modeName, guide ? ' (guide farm)' : '', h('br'), h('span', { class: 'ti-mono', style: 'font-size:12px' }, 'R' + r.rounds[0] + '–' + r.rounds[1])]),
        h('td', { class: 'n' }, C.int(guide ? gf.perRun : r.xp)),
        h('td', { class: 'n' }, guide ? String(gf.runs) : r.runs != null ? String(r.runs) : '–'),
        h('td', { class: 'n hide-s' }, '~' + Math.round(r.minutes) + ' min'),
        h('td', { class: 'n' }, guide ? hours(gf.minutes) : r.totalMin != null ? hours(r.totalMin) : '–'),
        h('td', { class: 'hide-s' }, ease[r.ease] + (r.mk ? '' : ', no MK')),
      ]));
    });
    return h('section', { class: 'panel', 'aria-labelledby': 'xpc-farm-h' }, [
      h('h2', { class: 'panel-h', id: 'xpc-farm-h' }, ['Farms ranked', h('small', null, 'XP per run with only this tower (the guide farm: with its helpers)')]),
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
