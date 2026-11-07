#!/usr/bin/env python3
"""Extract all Monkey Knowledge nodes from the BTD6 game-data export into data/game/knowledge.json.

Source: https://github.com/Btd6ModHelper/btd6-game-data (game v56.0), read-only.
  Knowledge/<Tree>/<Id>.json   KnowledgeModel: category, investmentRequired, monkeyMoneyCost, prerequisiteIds, mod.mutatorMods
  textTable.json               display name (<Id>) and description (<Id>Description)
  Towers/<T>/*.json            TowerModel.mods[] = ApplyModModel{mod: <knowledge id>, target}: which towers, crosspaths,
                               hero levels and weapons/projectiles a node is wired to
  Powers/*.json                PowerModel (cost) + ApplyModModel for the Powers tree
  Upgrades/<name>.json         UpgradeModel (cost, path, tier) for upgrade discounts

Every node gets: id, name, desc, tree, category, idx, pts (investmentRequired), mm, pre, unlocks, effects[], tags[],
applies[] (tower wiring), layout {tree, band, row, col}, src. Deterministic, stdlib only.

Usage: python3 tools/game/extract_knowledge.py [--gd PATH] [--out PATH]
"""
import argparse
import glob
import json
import math
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_GD = '/home/claude/gd/g'
DEFAULT_OUT = os.path.join(REPO, 'data', 'game', 'knowledge.json')

# KnowledgeModel.category -> tree. Proof (checked at run time, see prove_categories): every file in
# Knowledge/<Tree>/ carries one category value, and the folders give 0..5 in this order, which is also the
# order of the game's own tab labels in textTable ("Primary Knowledge" ... "Powers Knowledge").
# For 0..4 it also matches TowerModel.towerSet = 1 << category (Primary 1, Military 2, Magic 4, Support 8, Hero 16).
CATEGORY = {0: 'Primary', 1: 'Military', 2: 'Magic', 3: 'Support', 4: 'Heroes', 5: 'Powers'}
TREES = [CATEGORY[i] for i in range(6)]

# the site's tower / hero ids -> game folder names (same table as tools/build_power.py)
SITE_TOWERS = {
    'dart': 'DartMonkey', 'boomerang': 'BoomerangMonkey', 'bomb': 'BombShooter', 'tack': 'TackShooter', 'ice': 'IceMonkey',
    'glue': 'GlueGunner', 'desperado': 'Desperado', 'sniper': 'SniperMonkey', 'sub': 'MonkeySub', 'buccaneer': 'MonkeyBuccaneer',
    'ace': 'MonkeyAce', 'heli': 'HeliPilot', 'mortar': 'MortarMonkey', 'dartling': 'DartlingGunner', 'wizard': 'WizardMonkey',
    'super': 'SuperMonkey', 'ninja': 'NinjaMonkey', 'alchemist': 'Alchemist', 'druid': 'Druid', 'mermonkey': 'Mermonkey',
    'skywarden': 'Skywarden', 'farm': 'BananaFarm', 'spike': 'SpikeFactory', 'village': 'MonkeyVillage', 'engineer': 'EngineerMonkey',
    'beast': 'BeastHandler',
}
SITE_HEROES = {
    'quincy': 'Quincy', 'gwendolin': 'Gwendolin', 'striker': 'StrikerJones', 'obyn': 'ObynGreenfoot', 'churchill': 'CaptainChurchill',
    'benjamin': 'Benjamin', 'ezili': 'Ezili', 'pat': 'PatFusty', 'adora': 'Adora', 'brickell': 'AdmiralBrickell', 'etienne': 'Etienne',
    'sauda': 'Sauda', 'psi': 'Psi', 'geraldo': 'Geraldo', 'corvus': 'Corvus', 'rosalia': 'Rosalia', 'silas': 'Silas',
    'dan': 'DanDMonke',
}
GAME_TO_SITE = {v: k for k, v in list(SITE_TOWERS.items()) + list(SITE_HEROES.items())}
HERO_FOLDERS = set(SITE_HEROES.values())

# the site's node ids (data/monkey-knowledge.json, kept in profile.mk / settings.me / settings.emt) are kebab-case
# game ids: MoreCash -> more-cash, 4And4 -> 4-and-4. siteIdMap in the output proves it for the 29 existing ids.
def kebab(game_id):
    s = re.sub(r'(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Za-z])(?=[0-9])', '-', game_id)
    return s.lower()


def sig(v, n=4):
    """round floats to n significant digits; ints stay ints"""
    if isinstance(v, bool) or v is None:
        return v
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        if v == 0 or not math.isfinite(v):
            return 0 if v == 0 else v
        r = round(v, n - 1 - int(math.floor(math.log10(abs(v)))))
        return int(r) if r == int(r) and abs(r) < 1e15 else r
    return v


def short(o):
    t = o.get('$type', '') if isinstance(o, dict) else ''
    return t.split(',')[0].split('.')[-1]


def find_all(o, cls, out=None):
    out = [] if out is None else out
    if isinstance(o, dict):
        if short(o) == cls:
            out.append(o)
        for v in o.values():
            find_all(v, cls, out)
    elif isinstance(o, list):
        for v in o:
            find_all(v, cls, out)
    return out


def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def split_list(s):
    return [x.strip() for x in str(s or '').split(',') if x.strip()]


# ---------------------------------------------------------------- tower wiring
def legal_cross(x):
    return sum(1 for v in x if v > 0) <= 2 and sum(1 for v in x if v > 2) <= 1


ALL_CROSS = [(a, b, c) for a in range(6) for b in range(6) for c in range(6) if legal_cross((a, b, c))]


def cross_rule(present):
    """smallest description of a set of crosspaths: 'all', one path condition, or two; else an explicit list"""
    S = set(present)
    U = set(ALL_CROSS)
    if S >= U:
        return 'all'
    conds = []
    for p in range(3):
        for lo in range(6):
            for hi in range(lo, 6):
                if lo == 0 and hi == 5:
                    continue
                conds.append((p, lo, hi))

    def sat(x, c):
        return c[1] <= x[c[0]] <= c[2]

    def fmt(c):
        p, lo, hi = c
        slot = ['x', 'x', 'x']
        slot[p] = str(lo) + ('+' if hi == 5 else ('' if hi == lo else '-' + str(hi)))
        return '-'.join(slot)
    for c in conds:
        if {x for x in U if sat(x, c)} == S:
            return fmt(c)
    for i, c1 in enumerate(conds):
        for c2 in conds[i + 1:]:
            if c1[0] == c2[0]:
                continue
            if {x for x in U if sat(x, c1) and sat(x, c2)} == S:
                return fmt(c1) + ' & ' + fmt(c2)
    # union of single-path conditions (e.g. 3+ on top OR 3+ on middle)
    for i, c1 in enumerate(conds):
        for c2 in conds[i + 1:]:
            if {x for x in U if sat(x, c1) or sat(x, c2)} == S:
                return fmt(c1) + ' | ' + fmt(c2)
    return sorted(''.join(map(str, x)) for x in S)


def tower_wiring(gd, kn_ids):
    """knowledge id -> [{tower, site, kind, when, targets}] from TowerModel.mods (and PowerModel for powers)"""
    per = {}
    folders = sorted(d for d in os.listdir(os.path.join(gd, 'Towers')) if os.path.isdir(os.path.join(gd, 'Towers', d)))
    info = {}
    upgrade_owner = {}
    for folder in folders:
        hero = folder in HERO_FOLDERS
        files = sorted(glob.glob(os.path.join(gd, 'Towers', folder, '*.json')))
        keys, sets, cost0 = set(), set(), None
        for f in files:
            d = load(f)
            base = os.path.basename(f)[:-5]
            sets.add(d.get('towerSet'))
            if hero:
                m = re.match(r'.* (\d+)$', base)
                key = ('lvl', int(m.group(1)) if m else 1)
            elif base.endswith('-Paragon'):
                key = ('paragon',)
            else:
                key = tuple(d.get('tiers') or [0, 0, 0])
            keys.add(key)
            if key in (('lvl', 1), (0, 0, 0)):
                cost0 = d.get('cost')
            for u in d.get('appliedUpgrades') or []:
                upgrade_owner.setdefault(u, folder)
            for m in d.get('mods') or []:
                mid = m.get('mod')
                if mid not in kn_ids:
                    continue
                e = per.setdefault(mid, {}).setdefault(folder, {'keys': set(), 'targets': set()})
                e['keys'].add(key)
                for t in split_list(m.get('target')):
                    e['targets'].add(t)
        info[folder] = {'files': len(files), 'towerSet': sorted(s for s in sets if s is not None), 'cost': cost0,
                        'allkeys': keys, 'hero': hero}
    out = {}
    for mid, by in per.items():
        rows = []
        for folder in sorted(by):
            e = by[folder]
            allk = info[folder]['allkeys']
            have = e['keys']
            if have >= allk:
                when = 'all'
            elif info[folder]['hero']:
                lv = sorted(k[1] for k in have)
                when = 'level ' + str(lv[0]) + ('+' if lv == list(range(lv[0], max(k[1] for k in allk) + 1)) else '') if lv else 'none'
                if not when.endswith('+') and len(lv) > 1:
                    when = 'levels ' + ','.join(map(str, lv))
            else:
                cr = [k for k in have if len(k) == 3]
                when = cross_rule(cr) if cr else 'paragon only'
                if ('paragon',) in allk and ('paragon',) not in have and when == 'all':
                    when = 'all but paragon'
                elif ('paragon',) in have and isinstance(when, str) and when != 'all':
                    when = when + ' + paragon'
            site = GAME_TO_SITE.get(folder)
            kind = 'hero' if info[folder]['hero'] else ('tower' if folder in SITE_TOWERS.values() else 'sub')
            rows.append({'tower': folder, 'site': site, 'kind': kind, 'when': when, 'targets': sorted(e['targets'])})
        korder = {'tower': 0, 'hero': 1, 'sub': 2}
        out[mid] = sorted(rows, key=lambda r: (korder[r['kind']], r['site'] or r['tower']))
    # Powers: PowerModel files carry ApplyModModel for the Powers tree
    for f in sorted(glob.glob(os.path.join(gd, 'Powers', '*.json'))):
        d = load(f)
        for m in find_all(d, 'ApplyModModel'):
            if m.get('mod') in kn_ids:
                out.setdefault(m['mod'], []).append({'power': d.get('name'), 'kind': 'power', 'mmCost': d.get('cost'),
                                                     'src': os.path.relpath(f, gd)})
    return out, info, upgrade_owner


# ---------------------------------------------------------------- effect decoding
BP = {1: 'Lead', 2: 'Black', 4: 'White', 8: 'Purple', 16: 'Frozen'}


def props(mask):
    return [n for b, n in sorted(BP.items()) if mask & b] or ([] if not mask else ['bits:' + str(mask)])


def proj_summary(p):
    """pierce, damage, radius, lifespan of an embedded projectile"""
    if not isinstance(p, dict):
        return None
    dm = find_all(p, 'DamageModel')
    age = find_all(p, 'AgeModel')
    r = {'pierce': sig(p.get('pierce')), 'radius': sig(p.get('radius'))}
    if dm:
        r['damage'] = sig(dm[0].get('damage'))
        imm = dm[0].get('immuneBloonProperties') or 0
        if imm:
            r['cantPop'] = props(imm)
    if age:
        r['lifespan'] = sig(age[0].get('lifespan'))
    if p.get('filters') and any(short(x) == 'FilterInvisibleModel' and x.get('isActive') for x in p['filters']):
        r['camo'] = False
    return r


def ability_summary(a):
    return {'name': a.get('displayName') or a.get('name'), 'cooldown': sig(a.get('cooldown')),
            'betweenRounds': bool(a.get('canActivateBetweenRounds'))}


def decode(m, ctx):
    """one mutator model -> plain effect record {kind, ..., type}"""
    t = short(m)
    g = m.get
    e = None
    if t == 'StartingCashModModel':
        e = {'kind': 'startCash', 'value': sig(g('addition'))}
        if g('multiplier') not in (None, 1, 1.0):
            e['mult'] = sig(g('multiplier'))
    elif t == 'CashPerRoundModModel':
        e = {'kind': 'income', 'what': 'perRound', 'value': sig(g('additionalMoney'))}
    elif t == 'CashModModel':
        e = {'kind': 'income', 'what': 'cashBonus', 'pct': sig(g('percentBonus'))}
        if g('bonusMultiplierBuff'):
            e = {'kind': 'income', 'what': 'bananaValueBuff', 'add': sig(g('bonusMultiplierBuff'))}
    elif t == 'CashIncreaseModModel':
        e = {'kind': 'income', 'what': 'popCashBonus', 'add': sig(g('percentIncrease')), 'flat': sig(g('additionalAmount'))}
    elif t == 'BankModModel':
        e = {'kind': 'income', 'what': 'bankCapacity', 'add': sig(g('additionalCapacity'))}
    elif t == 'ImfLoanModModel':
        e = {'kind': 'income', 'what': 'imfLoan', 'loanAdd': sig(g('additionalLoanAmount')), 'repayRateAdd': -sig(g('interestRateDecreaseAmount'))}
    elif t == 'BankDepositsModModel':
        e = {'kind': 'income', 'what': 'bankDeposits', 'depositPct': sig(g('depositPercent'))}
    elif t == 'TowerSellModModel':
        e = {'kind': 'sellRate', 'add': sig(g('mutltiplier')), 'flat': sig(g('additional'))}
    elif t == 'SimTowerDiscountModModel':
        e = {'kind': 'heroCost' if g('useAllHeroes') else 'towerCost',
             'towers': [] if g('useAllHeroes') else [GAME_TO_SITE.get(x, x) for x in split_list(g('tower'))]}
        if g('multiplier'):
            e['pct'] = -sig(g('multiplier'))
        if g('subtraction'):
            e['value'] = -sig(g('subtraction'))
        e['firstOnly'] = g('charges') == 1
        if not e['firstOnly']:
            e['charges'] = 'all'
    elif t == 'UpgradeCostModModel':
        name = g('upgradeName')
        owner = ctx['upgrade_owner'].get(name)
        up = ctx['upgrades'].get(name) or {}
        e = {'kind': 'upgradeDiscount', 'upgrade': name, 'tower': GAME_TO_SITE.get(owner, owner),
             'path': (up.get('path', -1) + 1) or None, 'tier': (up.get('tier', -1) + 1) or None}
        if g('amountReduced'):
            e['value'] = -g('amountReduced')
        if g('percentageReduced'):
            e['pct'] = -sig(g('percentageReduced'))
        if 'cost' in up:
            base = up['cost']
            e['baseCost'] = base
            e['cost'] = sig(base - (g('amountReduced') or 0) - base * (g('percentageReduced') or 0))
    elif t == 'DiscountZoneModModel':
        e = {'kind': 'discountZone', 'add': sig(g('additionalMultiplier')), 'zone': g('specificScriptId')}
    elif t == 'FreeTowerModModel':
        e = {'kind': 'freeTower', 'tower': GAME_TO_SITE.get(g('baseTowerID'), g('baseTowerID')), 'count': g('charges'),
             'exclusiveWith': GAME_TO_SITE.get(g('mutuallyExclusiveWith'), g('mutuallyExclusiveWith'))}
    elif t == 'TowerXpModModel':
        e = {'kind': 'towerXp', 'mult': sig(1 + g('multiplier'))}
    elif t == 'OnMonkeyKnowledgePurchaseModModel':
        e = {'kind': 'towerXpGrant', 'xp': sig(g('xpToAdd')), 'towers': [GAME_TO_SITE.get(x, x) for x in split_list(g('towers'))]}
    elif t == 'HeroXPBonusModModel':
        e = {'kind': 'heroXp', 'perHeroPlaced': sig(g('percentMultiplier'))}
    elif t == 'HeroXpInjectionModModel':
        e = {'kind': 'heroStartLevel', 'addLevels': g('levels'), 'startLevel': 1 + (g('levels') or 0), 'xp': g('amount')}
    elif t == 'HeroCostToLevelModModel':
        e = {'kind': 'heroLevelCost', 'mult': sig(g('costMultiplier'))}
    elif t == 'WeaponReloadPercentageModModel':
        e = {'kind': 'attack', 'stat': 'rate', 'pct': sig(g('multiplier'))}
    elif t == 'WeaponReloadPercentageOnTargetPrioModModel':
        e = {'kind': 'attack', 'stat': 'rate', 'pct': sig(g('multiplier')), 'whenTargeting': g('targetType')}
    elif t == 'WeaponReloadReductionModModel':
        e = {'kind': 'attack', 'stat': 'rate', 'reduction': sig(g('reductionAmount'))}
    elif t == 'RangeModModel':
        e = {'kind': 'attack', 'stat': 'range', 'add': sig(g('additive'))}
        if g('multiplier') not in (None, 1, 1.0):
            e['mult'] = sig(g('multiplier'))
    elif t == 'ProjectilePierceModModel':
        e = {'kind': 'attack', 'stat': 'pierce', 'add': sig(g('amount'))}
        if g('minTier'):
            e['minTier'] = g('minTier')
    elif t == 'RoadSpikesPierceModModel':
        e = {'kind': 'power', 'power': 'RoadSpikes', 'stat': 'pierce', 'add': sig(g('addition'))}
    elif t == 'DamageModifierForTagModModel':
        e = {'kind': 'attack', 'stat': 'damageVs', 'tag': g('bloonTag'), 'add': sig(g('addative'))}
        if g('multiplierAdditive'):
            e['multAdd'] = sig(g('multiplierAdditive'))
    elif t == 'DamageModifierForBloonTypeModModel':
        e = {'kind': 'attack', 'stat': 'damageVs', 'tag': g('withTag'), 'add': sig(g('additiveBonus'))}
    elif t == 'DamageTypeModModel':
        e = {'kind': 'attack', 'stat': 'canPop', 'props': props(g('canHitbloonProperties') or 0)}
    elif t == 'IgnoreImmunityForBloonTypeModModel':
        e = {'kind': 'attack', 'stat': 'canPop', 'props': props(g('bloonProperties') or 0)}
    elif t == 'ProjectileSpeedModModel':
        e = {'kind': 'attack', 'stat': 'projectileSpeed', 'pct': sig(g('multiplier'))}
    elif t == 'ProjectileTrackTargetModModel':
        e = {'kind': 'attack', 'stat': 'turnRate', 'pct': sig(g('multiplierTurnRate'))}
    elif t == 'ProjectileRangePercentageModModel':
        e = {'kind': 'attack', 'stat': 'lifespan', 'pct': sig(g('percentIncrease'))}
    elif t == 'EmissionArcCountModModel':
        e = {'kind': 'attack', 'stat': 'projectiles', 'add': g('additionalCount')}
    elif t == 'AlternateArcModModel':
        e = {'kind': 'attack', 'stat': 'projectiles', 'add': g('increase'), 'everyNthShot': g('shotCount')}
    elif t == 'ProjectileRadiusModModel':
        e = {'kind': 'attack', 'stat': 'radius', 'add': sig(g('additiveAmount'))}
        if g('multiplierAmount') not in (None, 1, 1.0):
            e['mult'] = sig(g('multiplierAmount'))
    elif t == 'RetargetIncreaseModModel':
        e = {'kind': 'attack', 'stat': 'bounces', 'add': g('amount')}
    elif t == 'PushBackIncreaseModModel':
        e = {'kind': 'attack', 'stat': 'pushBack', 'pct': sig(g('amount'))}
    elif t == 'KnockbackModModel':
        e = {'kind': 'attack', 'stat': 'knockback', 'pctAdd': sig(g('percentMultiplierAdded'))}
    elif t == 'WindModModel':
        e = {'kind': 'attack', 'stat': 'distractChance', 'add': sig(g('chanceIncrease'))}
    elif t == 'SlowModifierModModel':
        e = {'kind': 'attack', 'stat': 'slow', 'mutation': g('mutationId'), 'slowAdd': sig(g('slowModifier')),
             'durationPct': sig(g('durationModifier'))}
    elif t == 'SlowModifierForTagModModel':
        e = {'kind': 'attack', 'stat': 'slow', 'tag': g('tag'), 'slowMult': sig(g('slowModifier'))}
    elif t == 'FreezeModifierModModel':
        e = {'kind': 'attack', 'stat': 'freezeTime', 'mutation': g('mutationId'), 'add': sig(g('durationAdd'))}
    elif t == 'CeramicShockModModel':
        s = g('slowModelToUse') or {}
        e = {'kind': 'attack', 'stat': 'slow', 'tag': s.get('bloonTag'), 'speedMult': sig(s.get('Multiplier')),
             'duration': sig(s.get('Lifespan'))}
    elif t == 'ColdFrontModModel':
        f = g('freeze') or {}
        e = {'kind': 'attack', 'stat': 'freeze', 'layers': f.get('layers'), 'duration': sig(f.get('Lifespan')), 'moabs': bool(f.get('canFreezeMoabs'))}
    elif t == 'GorgonStormModModel':
        s = g('slowModel') or {}
        mm = g('moabModifierModel') or {}
        e = {'kind': 'attack', 'stat': 'stun', 'duration': sig(s.get('Lifespan')), 'moabDuration': sig(mm.get('lifespanOverride'))}
    elif t == 'DamageOverTimeModModel':
        e = {'kind': 'attack', 'stat': 'burnInterval', 'add': -sig(g('timeReductionAmount')), 'damageAdd': g('damageIncreaseAmount')}
    elif t == 'AcidPoolModModel':
        e = {'kind': 'attack', 'stat': 'poolLifespan', 'add': sig(g('additionalTime'))}
    elif t == 'ActivateAttackModModel':
        e = {'kind': 'attack', 'stat': 'activeTime', 'add': sig(g('additionalTime'))}
    elif t == 'IncreaseRangeModModel':
        e = {'kind': 'attack', 'stat': 'rangeFrames', 'add': g('additionalFrames')}
    elif t == 'IgnoreBlockersModModel':
        e = {'kind': 'attack', 'stat': 'ignoreBlockers', 'value': True}
    elif t == 'GrantCamoDetectForAbilityModModel':
        e = {'kind': 'attack', 'stat': 'camoDuringAbility', 'value': True}
    elif t == 'PaintStripperModModel':
        e = {'kind': 'attack', 'stat': 'removeFortified', 'tags': split_list(g('removeTagsFromExcludeList'))}
    elif t == 'TargetedPineapplesModModel':
        e = {'kind': 'attack', 'stat': 'dropOnlyOverTrack', 'value': True}
    elif t == 'WingmonkeyModModel':
        p = g('wingmonkeyPatternModel') or {}
        e = {'kind': 'attack', 'stat': 'flightPattern', 'pattern': 'Wingmonkey', 'maxSpeed': sig(p.get('maxSpeed'))}
    elif t == 'RecurringRangsModModel':
        e = {'kind': 'attack', 'stat': 'rethrow', 'variant': g('id'),
             'when': [g('path1TierMin'), g('path1TierMax'), g('path2TierMin'), g('path2TierMax'), g('path3TierMin'), g('path3TierMax')]}
    elif t == 'TCBOOModModel':
        e = {'kind': 'attack', 'stat': 'thereCanBeOnlyOne', 'value': True}
    elif t == 'ComeOnEverybodyModModel':
        e = {'kind': 'conditional', 'what': 'Primary towers on the map',
             'rateMult': sig(g('rateMultiplier')), 'rateWhen': 'all Primary towers below tier 3',
             'pct': -sig(g('discountMultiplier')), 'discountWhen': 'all Primary towers tier 3 or 4'}
    elif t == 'ParagonOfPowerModModel':
        e = {'kind': 'attack', 'stat': 'rate', 'paragonOnly': True, 'rateMult': sig(g('rateMultiplier')),
             'when': 'no tier 5 of the same tower'}
    elif t == 'SupportMaxRangeModModel':
        e = {'kind': 'attack', 'stat': 'buffRangeGlobal', 'value': True}
    elif t == 'TierFiveCountModModel':
        e = {'kind': 'limit', 'tower': GAME_TO_SITE.get(g('towerBaseId'), g('towerBaseId')), 'path': g('path'), 'tier': g('tier'),
             'maxAdd': g('maxCountAdditive')}
    elif t in ('AbilityCooldownPercentageModModel',):
        e = {'kind': 'ability', 'stat': 'cooldown', 'pct': -sig(g('cooldownPercentageReduction'))}
    elif t == 'AbilityCooldownTimeModModel':
        e = {'kind': 'ability', 'stat': 'cooldown', 'seconds': -sig(g('cooldownTimeReduction'))}
    elif t == 'AddAbilityToTowerModModel':
        e = {'kind': 'ability', 'stat': 'newAbility', 'ability': ability_summary(g('abilityModel') or {})}
        vr = find_all(g('abilityModel'), 'DamageModel')
        if vr:
            e['ability']['damage'] = sig(vr[0].get('damage'))
            if vr[0].get('immuneBloonProperties'):
                e['ability']['cantPop'] = props(vr[0]['immuneBloonProperties'])
    elif t in ('DoorGunnerModModel', 'EmergencyUnlockModModel'):
        e = {'kind': 'ability', 'stat': 'abilityLogic', 'value': t[:-len('ModModel')]}
    elif t == 'TurboDurationIncreaseModModel':
        e = {'kind': 'ability', 'stat': 'duration', 'add': sig(g('amount'))}
    elif t == 'CreateEffectOnAbilityModModel':
        e = {'kind': 'ability', 'stat': 'effectDuration', 'add': sig(g('additionalLifespan'))}
    elif t == 'CallToArmsModModel':
        e = {'kind': 'ability', 'stat': 'duration', 'add': sig(g('additionalTime'))}
    elif t == 'TowerExpireModModel':
        e = {'kind': 'attack', 'stat': 'subTowerLifespan', 'add': sig(g('aditionalTimeBonus'))}
    elif t == 'EatBloonModModel':
        e = {'kind': 'attack', 'stat': 'trapCapacity', 'add': sig(g('additionalTrapAmount'))}
    elif t == 'CrossTheStreamsModModel':
        e = {'kind': 'attack', 'stat': 'newEffect', 'what': 'plasma pools', 'rate': sig(g('rate')), 'projectile': proj_summary(g('projectile'))}
    elif t == 'TinyTornadoesModModel':
        e = {'kind': 'attack', 'stat': 'newEffect', 'what': 'tiny tornadoes', 'projectile': proj_summary(g('projectileModel'))}
    elif t == 'StartingShieldModModel':
        e = {'kind': 'lives', 'what': 'shield', 'start': sig(g('startingShield')), 'max': sig(g('maxShield')), 'perRound': sig(g('shieldPerRound'))}
    elif t == 'LivesModModel':
        e = {'kind': 'lives', 'what': 'abilityLives', 'pct': sig(g('percentBonus'))}
    elif t == 'HealthyBananasModModel':
        e = {'kind': 'lives', 'what': 'perRound', 'marketplace': g('marketplaceLives'), 'centralMarket': g('centralMarketLives')}
    elif t == 'BloonHealthModModel':
        e = {'kind': 'bloonHealth', 'tag': 'Moabs', 'pct': -sig(g('percentageHealthReduced'))}
    elif t == 'MonkeyMoneyModModel':
        e = {'kind': 'monkeyMoney', 'mult': sig(g('multiplier'))}
    elif t == 'PowerModModel':
        e = {'kind': 'power', 'stat': 'mmCost', 'value': -sig(g('costDecrease'))}
    elif t == 'CamoTrapModModel':
        e = {'kind': 'power', 'power': 'CamoTrap', 'stat': 'pierce', 'add': sig(g('pierceIncrease'))}
    elif t == 'MoabMineModModel':
        e = {'kind': 'power', 'power': 'MoabMine', 'stat': 'damage', 'add': sig(g('damageIncrease')), 'bossAdd': sig(g('damageBossIncrease'))}
    elif t == 'SuperMonkeyStormModModel':
        e = {'kind': 'power', 'power': 'SuperMonkeyStorm', 'stat': 'damage', 'add': sig(g('damageIncrease'))}
    elif t == 'DartTimeModModel':
        e = {'kind': 'power', 'power': 'DartTime', 'stat': 'duration', 'add': sig(g('durationIncrease'))}
    elif t == 'MonkeyBoostModModel':
        e = {'kind': 'power', 'power': 'MonkeyBoost', 'stat': 'duration', 'add': sig(g('durationIncrease'))}
    elif t == 'BananaFarmerModModel':
        e = {'kind': 'power', 'power': 'BananaFarmer', 'stat': 'range', 'mult': sig(g('rangeMultiplier'))}
    elif t == 'ThriveModModel':
        e = {'kind': 'power', 'power': 'Thrive', 'stat': 'cashMult', 'add': sig(g('cashMultiplierIncrease'))}
    elif t == 'GlueTrapModModel':
        e = {'kind': 'power', 'power': 'GlueTrap', 'stat': 'canGlueMoabs', 'value': True}
    elif t == 'AmbushTechModModel':
        e = {'kind': 'power', 'power': 'TechBot', 'stat': 'ambushTargeting', 'value': True}
    elif t == 'PreGamePrepModModel':
        e = {'kind': 'power', 'power': 'RoadSpikes', 'stat': 'freePermanentPile', 'distFromEnd': sig(g('distFromEdgeOfMap')),
             'projectile': proj_summary(g('projectileModel'))}
    if e is None:
        e = {'kind': 'other', 'raw': {k: sig(v) for k, v in m.items() if not isinstance(v, (dict, list)) and k not in ('$type', 'name')}}
    e['type'] = t
    return e


KIND_TAG = {'startCash': 'cash', 'income': 'cash', 'sellRate': 'cash', 'towerCost': 'prices', 'heroCost': 'prices',
            'upgradeDiscount': 'prices', 'discountZone': 'prices', 'freeTower': 'prices', 'heroLevelCost': 'prices',
            'towerXp': 'xp', 'towerXpGrant': 'xp', 'heroXp': 'xp', 'heroStartLevel': 'xp', 'attack': 'attacks',
            'lives': 'lives', 'ability': 'abilities', 'power': 'powers', 'monkeyMoney': 'other', 'bloonHealth': 'other',
            'limit': 'other', 'conditional': 'attacks', 'other': 'other'}


def tags_for(effects):
    tags = []
    for e in effects:
        tg = KIND_TAG.get(e['kind'], 'other')
        if e['kind'] == 'conditional':
            for x in ('attacks', 'prices'):
                if x not in tags:
                    tags.append(x)
            continue
        if tg not in tags:
            tags.append(tg)
    return tags


# special cases where the effect's scope is not in the mutator: description/target tell it, the tower wiring proves it
SCOPE_NOTES = {
    'AbilityDiscipline': 'hero level-10 (2nd) ability only (ApplyModModel targets name that ability per hero)',
    'AbilityMastery': 'hero level-20 file only, targets the level-3 (1st) ability',
    'TradeAgreements': 'Merchantman (x-x-3+) and up; mod on every Buccaneer file, logic in CashPerRound behaviour',
    'InlandRevenueStreams': 'Monkey Town (x-x-3+) pop-cash bonus',
    'MoreValuableBananas': 'Valuable Bananas (x-2+-x) farms: banana value +5 percentage points',
    'ChargedChinooks': 'Support Chinook / Special Poperations ability (Heli x-4+-x) lives and cash crates +25%',
    'FlatPackBuildings': 'sell bonus only on Banana Farm and Monkey Village (the two towers carrying the mod)',
}


# ---------------------------------------------------------------- layout
def layout_tree(nodes):
    """Grid layout for one tree, drawn the way the game gates it.
    row: the point band (investmentRequired) first, then depth inside the band, so a prerequisite in the same band
         sits one row above its child (e.g. Hard Tacks above Poppy Blades, both 0 pts).
    col: a tidy-tree (Reingold-Tilford style) layout over each node's primary prerequisite (the one in the nearest row),
         children left-to-right in the game's idx order, each parent centred over its children, subtrees packed as
         close as their row contours allow. A node with two prerequisites is then moved under the middle of both
         when that cell is free. Every prerequisite arrow points strictly downwards."""
    by = {n['id']: n for n in nodes}
    bands = sorted({n['pts'] for n in nodes})
    depth = {}

    def dep(i):
        if i not in depth:
            same = [p for p in by[i]['pre'] if p in by and by[p]['pts'] == by[i]['pts']]
            depth[i] = 0 if not same else 1 + max(dep(p) for p in same)
        return depth[i]
    for i in by:
        dep(i)
    offset, cur = {}, 0
    for b in bands:
        offset[b] = cur
        cur += 1 + max(depth[i] for i in by if by[i]['pts'] == b)
    row = {i: offset[by[i]['pts']] + depth[i] for i in by}
    nrows = cur
    idx = lambda i: by[i]['idx']
    parent = {}
    for i in by:
        ps = [p for p in by[i]['pre'] if p in by]
        parent[i] = max(ps, key=lambda p: (row[p], -idx(p))) if ps else None
    kids = {i: sorted([k for k in by if parent[k] == i], key=idx) for i in by}
    roots = sorted([i for i in by if parent[i] is None], key=idx)

    def build(i):
        """returns (positions relative to i: {node: col}, contour {row: (min, max)})"""
        pos = {i: 0}
        cont = {row[i]: (0, 0)}
        if not kids[i]:
            return pos, cont
        placed = []  # (child, offset, pos, contour)
        acc = {}     # merged contour of children placed so far, absolute in child-space
        for k in kids[i]:
            kp, kc = build(k)
            off = 0
            if acc:
                need = [acc[r][1] - kc[r][0] + 1 for r in kc if r in acc]
                off = max(need) if need else (placed[-1][1] + 1)
            for r, (lo, hi) in kc.items():
                if r in acc:
                    acc[r] = (min(acc[r][0], lo + off), max(acc[r][1], hi + off))
                else:
                    acc[r] = (lo + off, hi + off)
            placed.append((k, off, kp, kc))
        mid = (placed[0][1] + placed[-1][1]) // 2
        for k, off, kp, kc in placed:
            for n, c in kp.items():
                pos[n] = c + off - mid
        for r, (lo, hi) in acc.items():
            cont[r] = (lo - mid, hi - mid)
        return pos, cont
    col = {}
    acc = {}
    last = None
    for r0 in roots:
        kp, kc = build(r0)
        off = 0
        if acc:
            need = [acc[r][1] - kc[r][0] + 1 for r in kc if r in acc]
            off = max(need) if need else last + 1
        for n, c in kp.items():
            col[n] = c + off
        for r, (lo, hi) in kc.items():
            acc[r] = (min(acc[r][0], lo + off), max(acc[r][1], hi + off)) if r in acc else (lo + off, hi + off)
        last = off
    # nodes with two or more prerequisites: move under the middle of them if that cell is free and it has no children
    taken = {(row[i], col[i]) for i in by}
    for i in sorted(by, key=idx):
        ps = [p for p in by[i]['pre'] if p in by]
        if len(ps) < 2 or kids[i]:
            continue
        want = int(math.floor(sum(col[p] for p in ps) / len(ps) + 0.5))
        if want != col[i] and (row[i], want) not in taken:
            cost = lambda c: sum(abs(c - col[p]) for p in ps)
            if cost(want) < cost(col[i]):
                taken.discard((row[i], col[i]))
                col[i] = want
                taken.add((row[i], want))
    mn = min(col.values())
    out = {i: {'tree': by[i]['tree'], 'band': bands.index(by[i]['pts']), 'row': row[i], 'col': col[i] - mn} for i in by}
    length = 0
    for i in by:
        for p in by[i]['pre']:
            if p in out:
                length += abs(out[i]['col'] - out[p]['col']) + abs(out[i]['row'] - out[p]['row'])
    stats = {'rows': nrows, 'cols': 1 + max(v['col'] for v in out.values()), 'bands': bands,
             'bandRows': [offset[b] for b in bands], 'arrows': sum(len([p for p in by[i]['pre'] if p in by]) for i in by),
             'arrowLength': length}
    return out, stats


# ---------------------------------------------------------------- main
def prove_categories(raw):
    seen = {}
    for tree, d in raw:
        seen.setdefault(tree, set()).add(d['category'])
    proof = {}
    for tree, cats in seen.items():
        if len(cats) != 1:
            sys.exit('category not unique in folder %s: %s' % (tree, cats))
        c = next(iter(cats))
        if CATEGORY.get(c) != tree:
            sys.exit('category %s in folder %s disagrees with the mapping' % (c, tree))
        proof[tree] = c
    return proof


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--gd', default=DEFAULT_GD)
    ap.add_argument('--out', default=DEFAULT_OUT)
    a = ap.parse_args()
    gd = a.gd
    text = load(os.path.join(gd, 'textTable.json'))
    files = sorted(glob.glob(os.path.join(gd, 'Knowledge', '*', '*.json')))
    raw = [(f.split(os.sep)[-2], load(f), os.path.relpath(f, gd)) for f in files]
    proof = prove_categories([(t, d) for t, d, _ in raw])
    kn_ids = {d['name'] for _, d, _ in raw}
    wiring, info, upgrade_owner = tower_wiring(gd, kn_ids)
    upgrades = {}
    for f in glob.glob(os.path.join(gd, 'Upgrades', '*.json')):
        u = load(f)
        upgrades[u.get('name')] = {'cost': u.get('cost'), 'path': u.get('path'), 'tier': u.get('tier')}
    ctx = {'upgrade_owner': upgrade_owner, 'upgrades': upgrades}
    tower_cost = {f: info[f]['cost'] for f in info}

    nodes = []
    for tree, d, rel in raw:
        nid = d['name']
        effects = [decode(m, ctx) for m in (d.get('mod') or {}).get('mutatorMods') or []]
        for e in effects:
            if e['kind'] == 'towerCost':
                costs = {}
                for t in e['towers']:
                    folder = SITE_TOWERS.get(t, t)
                    if tower_cost.get(folder) is not None:
                        costs[t] = sig(tower_cost[folder])
                if costs:
                    e['baseCost'] = costs
            if e['kind'] == 'power' and e.get('stat') == 'mmCost':
                pw = [w for w in wiring.get(nid, []) if w.get('kind') == 'power']
                if pw:
                    e['power'] = pw[0]['power']
                    e['baseCost'] = pw[0]['mmCost']
                    e['cost'] = pw[0]['mmCost'] + e['value']
        if not effects:
            effects = [{'kind': 'other', 'what': 'no mutator in the export (logic outside the model)', 'type': None}]
        for e in effects:
            if e['kind'] == 'towerXp':
                ap = wiring.get(nid, [])
                kinds = {w['kind'] for w in ap}
                sites = {w['site'] for w in ap if w['kind'] == 'tower'}
                if kinds == {'hero'} or (kinds <= {'hero', 'sub'} and not sites):
                    e['who'] = 'heroes'
                elif sites and sites == set(SITE_TOWERS) and 'hero' in kinds:
                    e['who'] = 'all'
                else:
                    e['who'] = sorted(sites)
            if e['kind'] == 'heroCost':
                e['towers'] = 'heroes'
        rec = {
            'id': nid,
            'site': kebab(nid),
            'name': text.get(nid, nid),
            'desc': text.get(nid + 'Description', ''),
            'tree': tree,
            'category': d['category'],
            'idx': d['idx'],
            'pts': d['investmentRequired'],
            'mm': d['monkeyMoneyCost'],
            'pre': list(d.get('prerequisiteIds') or []),
            'effects': effects,
            'tags': tags_for(effects),
            'applies': wiring.get(nid, []),
            'src': rel,
        }
        if nid in SCOPE_NOTES:
            rec['scope'] = SCOPE_NOTES[nid]
        if not rec['applies']:
            rec['applies'] = []
            rec['appliedBy'] = 'game logic (no ApplyModModel on any tower/power: simulation-level effect)'
        nodes.append(rec)
    unlock = {n['id']: [] for n in nodes}
    for n in nodes:
        for p in n['pre']:
            unlock.setdefault(p, []).append(n['id'])
    for n in nodes:
        n['unlocks'] = sorted(unlock.get(n['id'], []))
    trees = {}
    for tree in TREES:
        tn = [n for n in nodes if n['tree'] == tree]
        lay, stats = layout_tree(tn)
        for n in tn:
            n['layout'] = lay[n['id']]
        trees[tree] = dict({'category': proof[tree], 'label': text.get(tree + ' Knowledge', tree), 'nodes': len(tn),
                            'mmTotal': sum(n['mm'] for n in tn)}, **stats)
    tree_order = {t: i for i, t in enumerate(TREES)}
    nodes.sort(key=lambda n: (tree_order[n['tree']], n['idx']))
    # field order inside each node for readability
    order = ['id', 'site', 'name', 'desc', 'tree', 'category', 'idx', 'pts', 'mm', 'pre', 'unlocks', 'tags', 'effects', 'scope',
             'applies', 'appliedBy', 'layout', 'src']
    nodes = [{k: n[k] for k in order if k in n} for n in nodes]
    dangling = sorted({p for n in nodes for p in n['pre'] if p not in kn_ids})
    out = {
        '_meta': {
            'source': 'https://github.com/Btd6ModHelper/btd6-game-data',
            'gameVersion': '56.0',
            'generator': 'tools/game/extract_knowledge.py',
            'nodes': len(nodes),
            'trees': TREES,
            'categoryMap': {str(v): k for k, v in proof.items()},
            'categoryProof': 'each Knowledge/<Tree>/ folder holds one category value (Primary 0, Military 1, Magic 2, Support 3, '
                             'Heroes 4, Powers 5); same order as textTable "Primary Knowledge".."Powers Knowledge"; for 0-4 '
                             'TowerModel.towerSet == 1<<category for towers the tree names (tests check it)',
            'pointsToBuyAll': len(nodes),
            'mmToBuyAll': sum(n['mm'] for n in nodes),
            'pointsCap': None,
            'pointsCapNote': 'not in the export: KnowledgeModel has no point-cost field (every node costs 1 point) and no file '
                             'holds a player-level/points cap. Buying everything takes exactly %d points.' % len(nodes),
            'pointsCapExternal': {'value': 138, 'source': 'https://bloons.fandom.com/wiki/Monkey_Knowledge_(BTD6)',
                                  'note': 'NOT from the export: "reaching level 155 and getting all achievements with Knowledge '
                                          'Point rewards" (Fandom, least trusted; matches data/monkey-knowledge.json maxPoints)'},
            'danglingPrereqs': dangling,
            'notes': [
                'pts = investmentRequired: points already spent in THIS tree before the node can be bought (sets its band/row).',
                'attack rate pct: WeaponReloadPercentageModModel.multiplier; the description says "attack speed +x%" / '
                '"reload time -x%". The export has no code, so whether reload is *(1-x) or /(1+x) is not provable here.',
                'applies[].when: crosspaths (or hero levels) whose tower file carries the ApplyModModel. "x-x-3+" = bottom '
                'path tier 3 or more. targets = weapon/projectile/ability names the mod is pointed at ("" = whole tower).',
                'canPop props: bloonProperties bitflag Lead 1, Black 2, White 4, Purple 8, Frozen 16 (descriptions of Hot '
                'Magic/Hard Tacks = Frozen 16, Strike Down the False = Purple 8, Vine Rupture immune 17 = "non-Lead").',
            ],
        },
        'treeInfo': trees,
        'nodes': nodes,
        'siteIdMap': None,  # filled below
        'overrides': [],
        'overridesNote': 'no v57 Monkey Knowledge change found: Bloons Wiki v57.0 update-history page could not be read '
                         '(fetch failed); nothing invented. Values above are v56.0 export values.',
    }
    # old site ids -> game ids
    site_path = os.path.join(REPO, 'data', 'monkey-knowledge.json')
    m = {}
    if os.path.exists(site_path):
        old = load(site_path)
        byname = {re.sub(r'[^a-z0-9]', '', n['name'].lower()): n['id'] for n in nodes}
        bykebab = {n['site']: n['id'] for n in nodes}
        for o in old.get('nodes', []):
            gid = bykebab.get(o['id']) or byname.get(re.sub(r'[^a-z0-9]', '', o['name'].lower()))
            m[o['id']] = gid
    out['siteIdMap'] = dict(sorted(m.items()))
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    s = json.dumps(out, indent=1, ensure_ascii=False, sort_keys=False)
    with open(a.out, 'w', encoding='utf-8') as f:
        f.write(s + '\n')
    print('wrote %s: %d nodes, %d bytes' % (os.path.relpath(a.out, REPO), len(nodes), len(s)))


if __name__ == '__main__':
    main()
