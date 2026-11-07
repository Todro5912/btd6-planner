#!/usr/bin/env python3
"""Extract Powers, Geraldo items, Paragon degree data, game modes (Mods), IncomeSets, hero XP curves, Insta data
and Map metadata from the BTD6 game-data export into data/game/misc.json.

    python3 tools/game/extract_misc.py [--gd /home/claude/gd/g] [--out data/game/misc.json]

Source: https://github.com/Btd6ModHelper/btd6-game-data (game v56.0, BTD Mod Helper "Export Game Data").
Data (c) Ninja Kiwi. stdlib only, deterministic (sorted keys, no timestamps), floats rounded to 4 significant digits.
Every record carries `src` = the export file it came from (relative to the export root).
Values known to change in v57 are NOT edited here; they sit in the separate `overrides` list with their source URL.
"""
import argparse
import glob
import json
import os
import re
import subprocess

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ---------- helpers ----------

def short(o):
    t = o.get('$type', '') if isinstance(o, dict) else ''
    return t.split(',')[0].split('.')[-1]


def r4(v):
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return v
    if isinstance(v, int):
        return v
    if v == 0 or v != v:
        return 0
    if v == int(v) and abs(v) < 1e15:
        return int(v)  # exact integers (9999999 cash, 999999 lives) stay exact
    x = float('%.4g' % v)
    return int(x) if x == int(x) and abs(x) < 1e15 else x


def num(v, d=0.0):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else d


COSMETIC = re.compile(r'(Sound|Effect|Display|Audio|Sprite|Prefab|Animation|Anim|Icon|Asset|Footprint|Spin|Rotate|Shadow|Visual|Fade|ScaleOverTime|Arrow|Emote|Voice|Lightning3D|Orbit3D|Text)', re.I)
# scalar keys that say nothing about gameplay
NOISE_KEYS = {'name', 'collisionPass', 'Lifespan', 'Rate', 'CappedPierce', 'CappedDamage', 'Duration', 'Cooldown',
              'Multiplier', 'guidRef', 'AssetGUID', 'modelName', 'animation', 'ejectX', 'ejectY', 'ejectZ', 'scale',
              'id', 'intID', 'isSelectable', 'lifespanFrames', 'durationFrames', 'delayFrames', 'intervalFrames',
              'countGlueAchievement', 'buffLocsName', 'buffIconName', 'overlayType', 'displayName', 'description',
              'createPopEffect', 'isActionable', 'mutatorId', 'mutationId', 'mutationIds', 'iconPath', 'animationState',
              'lineDotOffset', 'lineDotSpacing', 'activateAnimationState', 'linkAnimationState', 'idleAnimationState',
              'travelEffectSpeed', 'textEffectLifespan', 'tag', 'tags', 'filters'}

# Il2CppAssets.Scripts.Models.Bloons.BloonProperties (verified: Dart 17 = Lead+Frozen, Bomb 2 = Black, Ice 5 = Lead+White)
PROPS = [(1, 'lead'), (2, 'black'), (4, 'white'), (8, 'purple'), (16, 'frozen'), (64, 'bit64')]
# TowerSet enum, verified against Towers/*/<Tower>.json towerSet (Dart 1, Sniper 2, Wizard 4, Farm 8, Quincy 16, power towers 64)
TOWER_SETS = {1: 'Primary', 2: 'Military', 4: 'Magic', 8: 'Support', 16: 'Hero', 64: 'Power'}
MAP_DIFF = ['Beginner', 'Intermediate', 'Advanced', 'Expert']
SUB = re.compile(r'CreateProjectileOn(Contact|ExhaustFraction|ExhaustPierce|Expire|Interval|BlockerCollide|TowerDestroy)Model')


def props(mask):
    m = int(num(mask))
    return [n for b, n in PROPS if m & b]


def camo_blind(filters):
    for f in filters or []:
        if short(f) == 'FilterInvisibleModel' and f.get('isActive'):
            return True
    return False


def scalars(o, keep_zero=False):
    out = {}
    for k, v in o.items():
        if k == '$type' or k in NOISE_KEYS:
            continue
        if isinstance(v, bool):
            if v:
                out[k] = True
        elif isinstance(v, (int, float)):
            if v != 0 or keep_zero:
                out[k] = r4(v)
        elif isinstance(v, str) and v and k in ('roundsetName', 'towerToLock', 'bloonId', 'bloonTag', 'targetTowerBaseId',
                                                 'resultingTowerName', 'towerId', 'mod', 'powerId'):
            out[k] = v
    return out


def proj(p, depth=0):
    """compact projectile: pierce, damage, immune properties, camo, radius, lifespan, bonus damage, slows, sub-projectiles"""
    o = {}
    if num(p.get('pierce')) > 0:
        o['pierce'] = r4(num(p.get('pierce')))
    if num(p.get('maxPierce')) > 0:
        o['maxPierce'] = r4(num(p.get('maxPierce')))
    if num(p.get('radius')) > 0:
        o['radius'] = r4(num(p.get('radius')))
    flt = list(p.get('filters') or [])
    tags = []
    for f in flt:
        t = short(f)
        if t == 'FilterOutTagModel':
            tags.append('not:' + str(f.get('tag')))
        elif t == 'FilterWithTagModel':
            tags.append('only:' + str(f.get('tag')))
        elif t == 'FilterMoabModel':
            tags.append('moabFilter')
    if tags:
        o['targets'] = tags
    o['camo'] = not camo_blind(flt)
    subs = []
    for b in p.get('behaviors') or []:
        t = short(b)
        if not t or COSMETIC.search(t):
            continue
        if t == 'DamageModel':
            o['damage'] = r4(num(o.get('damage', 0)) + num(b.get('damage')))
            o['immune'] = props(b.get('immuneBloonProperties'))
        elif t == 'DamageModifierForTagModel':
            o.setdefault('bonus', []).append({'tag': b.get('tag'), 'add': r4(num(b.get('damageAddative'))), 'mult': r4(num(b.get('damageMultiplier'), 1))})
        elif t == 'AgeModel':
            if num(b.get('lifespan')) < 1e6:
                o['lifespan'] = r4(num(b.get('lifespan')))
        elif t in ('SlowModel',):
            o['slow'] = {'mult': r4(num(b.get('multiplier'))), 'lifespan': r4(num(b.get('lifespan'))), 'layers': int(num(b.get('layers')))}
        elif t == 'SlowModifierForTagModel':
            o.setdefault('slowTag', []).append({'tag': b.get('tag'), 'lifespan': r4(num(b.get('lifespanOverride')))})
        elif t == 'CollideExtraPierceReductionModel':
            o.setdefault('extraPierceCost', {})[str(b.get('bloonTag'))] = int(num(b.get('extraAmount')))
        elif t == 'ClearHitBloonsModel':
            o['rehitInterval'] = r4(num(b.get('interval')))
        elif t == 'RemoveBloonModifiersModel':
            o['removes'] = [k.replace('cleanse', '').lower() for k, v in b.items() if k.startswith('cleanse') and v is True]
        elif t == 'CashModel':
            o['cash'] = {'min': r4(num(b.get('minimum'))), 'max': r4(num(b.get('maximum')))}
        elif t == 'AddBehaviorToBloonModel':
            for bb in b.get('behaviors') or []:
                if short(bb) == 'DamageOverTimeModel':
                    o['dot'] = {'damage': r4(num(bb.get('damage'))), 'interval': r4(num(bb.get('interval'))), 'lifespan': r4(num(b.get('lifespan'))),
                                'immune': props(bb.get('immuneBloonProperties'))}
        elif t in ('PickupModel',):
            o['pickupRadius'] = r4(num(b.get('collectRadius')))
        elif SUB.match(t) and isinstance(b.get('projectile'), dict) and depth < 3:
            em = b.get('emission') or {}
            cnt = int(num(em.get('count'), 1)) if short(em) else 1
            subs.append({'on': SUB.match(t).group(1), 'count': max(1, cnt), 'proj': proj(b['projectile'], depth + 1)})
    if subs:
        o['subs'] = subs
    return o


def weapon(w):
    o = {'rate': r4(num(w.get('rate')))}
    em = w.get('emission') or {}
    if short(em) and num(em.get('count')) > 1:
        o['count'] = int(num(em.get('count')))
    if isinstance(w.get('projectile'), dict):
        o['proj'] = proj(w['projectile'])
    return o


def attack(a):
    o = {'range': r4(num(a.get('range')))}
    flt = []
    for b in a.get('behaviors') or []:
        if short(b) == 'AttackFilterModel':
            flt += b.get('filters') or []
    o['camo'] = not camo_blind(flt)
    ws = [weapon(w) for w in a.get('weapons') or [] if isinstance(w, dict)]
    if ws:
        o['weapons'] = ws
    return o


def generic(b, depth=0):
    """a non-cosmetic behaviour: its type, its gameplay scalars, nested projectiles / attacks"""
    t = short(b)
    o = {'t': t}
    o.update(scalars(b))
    for k, v in b.items():
        if isinstance(v, dict) and short(v) == 'ProjectileModel':
            o[k] = proj(v)
        elif isinstance(v, dict) and short(v) in ('AttackModel', 'AttackAirUnitModel'):
            o[k] = attack(v)
        elif isinstance(v, dict) and short(v) == 'WeaponModel':
            o[k] = weapon(v)
        elif isinstance(v, list) and depth < 2 and k in ('behaviors', 'buffs'):
            kids = [generic(x, depth + 1) for x in v if isinstance(x, dict) and short(x) and not COSMETIC.search(short(x))]
            kids = [x for x in kids if len(x) > 1 or x['t'] not in ('AttackFilterModel',)]
            if kids:
                o[k] = kids
    return o


def tower(tm):
    """compact tower model: range, placement, attacks, abilities, supports, lifetime"""
    o = {'range': r4(num(tm.get('range'))), 'radius': r4(num(tm.get('radius')))}
    if tm.get('areaTypes'):
        o['areaTypes'] = tm['areaTypes']  # 1 water, 2 land (Pontoon: [1], IsExclusivelyWaterBased)
    if tm.get('isGlobalRange'):
        o['global'] = True
    att, abil, other = [], [], []
    for b in tm.get('behaviors') or []:
        t = short(b)
        if not t or COSMETIC.search(t) or t in ('PowerProTowerModel', 'SavedSubTowerModel', 'IgnoreAllMutatorsTowerModel'):
            continue
        if t in ('AttackModel', 'AttackAirUnitModel'):
            a = attack(b)
            if a.get('weapons'):
                att.append(a)
        elif t == 'AbilityModel':
            ab = {'name': b.get('displayName') or b.get('name'), 'cooldown': r4(num(b.get('cooldown'))),
                  'maxPerRound': int(num(b.get('maxActivationsPerRound'), -1))}
            eff = [generic(x, 1) for x in b.get('behaviors') or [] if isinstance(x, dict) and short(x) and not COSMETIC.search(short(x))]
            eff = [e for e in eff if len(e) > 1]
            if eff:
                ab['effects'] = eff
            abil.append(ab)
        else:
            g = generic(b)
            if len(g) > 1:
                other.append(g)
    if att:
        o['attacks'] = att
    if abil:
        o['abilities'] = abil
    if other:
        o['other'] = other
    return o


def load(gd, rel):
    with open(os.path.join(gd, rel), encoding='utf-8') as f:
        return json.load(f)


def rel(gd, path):
    return os.path.relpath(path, gd).replace(os.sep, '/')


# ---------- sections ----------

def powers(gd, T):
    out = []
    for f in sorted(glob.glob(os.path.join(gd, 'Powers', '*.json'))):
        d = json.load(open(f, encoding='utf-8'))
        pid = d.get('PowerId') or d['name']
        tw = d.get('tower')
        rec = {
            'id': pid,
            'name': T.get(pid) or (T.get(tw['name']) if tw else None),
            'description': T.get(pid + ' Description') or (T.get(tw['name'] + ' Description') if tw else None),
            'costMM': d.get('cost'),
            'quantity': d.get('quantity'),
            'pro': bool(d.get('IsPowerPro')),
            'placeable': bool(tw),
            'betweenRounds': bool(d.get('canBeActivatedBetweenRounds')),
            'buyableWithMM': bool(d.get('CanBePurchasedWithMM')),
            'hidden': bool(d.get('isHidden')),
            'availableInMode': d.get('availableInMode') or None,
            'disabledByGameMode': bool(d.get('isDisabledByGameMode')),
            'mkMods': [m.get('mod') for m in d.get('mods') or [] if m.get('mod')],
            'src': rel(gd, f),
        }
        eff = [generic(b) for b in d.get('behaviors') or [] if short(b) and not COSMETIC.search(short(b))]
        eff = [e for e in eff if len(e) > 1]
        if eff:
            rec['effects'] = eff
        if tw:
            rec['tower'] = tower(tw)
            rec['towerId'] = tw.get('name')
        if d.get('towerModels'):
            seen, variants = set(), []
            for tm in d['towerModels']:
                if tm.get('name') in seen:
                    continue
                seen.add(tm.get('name'))
                variants.append({'id': tm.get('name'), 'tiers': tm.get('tiers'), 'model': tower(tm)})
            rec['proVariants'] = variants
            rec['proUpgrades'] = [{'upgrade': u.get('upgrade'), 'tower': u.get('tower'), 'name': T.get(u.get('upgrade'))} for u in d.get('upgrades') or []]
        out.append(rec)
    return out


def geraldo(gd, T):
    out = []
    lvl_text = {n: T.get('Geraldo Level %d Description' % n) for n in range(1, 21)}
    for f in sorted(glob.glob(os.path.join(gd, 'GeraldoItems', '*.json'))):
        d = json.load(open(f, encoding='utf-8'))
        loc = d.get('locsId') or d['name']
        lv = int(d.get('levelUnlockedAt') or 0)
        rec = {
            'id': d['name'],
            'name': T.get(loc + ' name'),
            'description': T.get(loc + ' description'),
            'cost': d.get('cost'),
            'unlockLevel': max(1, lv),  # levelUnlockedAt 0 = available at level 1 (matches 'Geraldo Level 1 Description')
            'startingQuantity': d.get('startingQuantity'),
            'maxQuantity': d.get('maxQuantity'),
            'roundsToReplenish': d.get('roundsToReplenish'),
            'amountToReplenish': d.get('amountToReplenish'),
            'onlyReplenishIfNonePlaced': bool(d.get('onlyReplenishIfNonePlaced')),
            'bannedForModes': d.get('bannedForModesList') or [],
            'betweenRounds': bool(d.get('canBeActivatedBetweenRounds')),
            'blockIfPlaced': d.get('blockPurchaseIfTowerPlaced') or None,
            'iconSwapLevels': d.get('iconSwapLevels') or [],
            'src': rel(gd, f),
        }
        effs, upgrades = [], []
        for b in d.get('behaviorModels') or []:
            t = short(b)
            if COSMETIC.search(t) or t.startswith('CreateEffect') or t.startswith('CreateSound'):
                continue
            if t == 'GeraldoUpgradeTowerModel':
                upgrades.append({'level': b.get('level'), 'towerId': b.get('towerId')})
            elif t == 'GeraldoCreateProjectileModel':
                e = {'t': t, 'proj': proj(b.get('projectileModel') or {})}
                lv_up = b.get('projectileModelUpgradeAtLevels') or []
                ups = b.get('projectileModelUpgrades') or []
                e['upgrades'] = [{'level': l, 'proj': proj(p)} for l, p in zip(lv_up, ups)]
                effs.append(e)
            elif t == 'PetRabbitBehaviorModel':
                effs.append({'t': t, 'tower': tower(b.get('petRabbitBaseTowerModel') or {})})
            else:
                g = generic(b)
                if len(g) > 1:
                    effs.append(g)
        if effs:
            rec['effects'] = effs
        if upgrades:
            rec['upgradesAt'] = upgrades
        # placed items: their tower models live in Towers/<dir>/<towerId>.json
        tids = [d.get('towerId')] + [u['towerId'] for u in upgrades] if d.get('towerId') else []
        towers = []
        for tid in tids:
            hits = glob.glob(os.path.join(gd, 'Towers', '*', tid + '.json'))
            if hits:
                towers.append({'id': tid, 'src': rel(gd, hits[0]), 'model': tower(json.load(open(hits[0], encoding='utf-8')))})
        if towers:
            rec['towers'] = towers
        rec['levelText'] = lvl_text.get(rec['unlockLevel'])
        out.append(rec)
    return out, {str(k): v for k, v in lvl_text.items()}


def paragon(gd, T):
    d = load(gd, 'paragonDegreeData.json')
    req = d['powerDegreeRequirements']
    cdx = num(d['attackCooldownReductionX'])
    table = []
    for deg in range(1, int(d['degreeCount']) + 1):
        k = deg - 1
        table.append({
            'degree': deg, 'power': req[k],
            'cooldownMult': r4(1 / (1 + (k * cdx) ** 0.5 / 100)),
            'damagePct': r4(k * num(d['damagePercentPerDegree'])),
            'damageFlat': int(k // num(d['damageIncreaseForDegrees']) * num(d['damageIncreasePerDegree'])),
            'piercePct': r4(k * num(d['piercePercentPerDegree'])),
            'pierceFlat': r4(k * num(d['pierceIncreasePerDegree'])),
            'bossMult': r4(1 + num(d['bonusBossDamagePercent']) * (deg // int(d['bonusBossDamagePerDegrees']))),
        })
    towers = []
    for f in sorted(glob.glob(os.path.join(gd, 'Upgrades', '* Paragon.json'))):
        u = json.load(open(f, encoding='utf-8'))
        if not u.get('IsParagon'):
            continue  # 'Sentry Paragon' is Master Builder's sentry upgrade, not a tower Paragon
        base = os.path.basename(f)[:-len(' Paragon.json')]
        tf = os.path.join(gd, 'Towers', base, base + '-Paragon.json')
        towers.append({'tower': base, 'name': T.get(u['name']) or T.get(base + ' Paragon'), 'cost': u['cost'], 'xp': u['xpCost'],
                       'src': rel(gd, f), 'towerSrc': rel(gd, tf) if os.path.exists(tf) else None})
    totem = load(gd, 'Towers/ParagonPowerTotem/ParagonPowerTotemTower.json')
    bonus = [b for b in totem['behaviors'] if short(b) == 'ParagonSacrificeBonusModel']
    keys = ['maxPowerFromPops', 'maxPowerFromMoneySpent', 'maxPowerFromNonTier5Count', 'maxPowerFromTier5Count', 'popsOverX',
            'moneySpentOverX', 'nonTier5TowersMultByX', 'tier5TowersMultByX', 'cashEarnedContributionModifier',
            'paidContributionPenalty', 'MaxInvestment', 'attackCooldownReductionX', 'piercePercentPerDegree',
            'pierceIncreasePerDegree', 'damagePercentPerDegree', 'damageIncreasePerDegree', 'damageIncreaseForDegrees',
            'bonusBossDamagePercent', 'bonusBossDamagePerDegrees', 'degreeCount']
    return {
        'src': 'paragonDegreeData.json',
        'params': {k: r4(d[k]) for k in keys},
        'formula': {
            'power': 'min(maxPowerFromMoneySpent, cashSpentOnSacrifices / (paragonCost / moneySpentOverX); slider cash x (1 + paidContributionPenalty)) '
                     '+ min(maxPowerFromTier5Count, extraTier5s x tier5TowersMultByX) + min(maxPowerFromNonTier5Count, nonT5UpgradeTiers x nonTier5TowersMultByX) '
                     '+ min(maxPowerFromPops, damage / popsOverX + cashGenerated x cashEarnedContributionModifier / popsOverX) + totems x totemBonus',
            'cooldownMult': '1 / (1 + sqrt((degree-1) x attackCooldownReductionX) / 100)',
            'damage': 'base x (1 + (degree-1) x damagePercentPerDegree/100) + floor((degree-1)/damageIncreaseForDegrees) x damageIncreasePerDegree',
            'pierce': 'base x (1 + (degree-1) x piercePercentPerDegree/100) + (degree-1) x pierceIncreasePerDegree',
            'bossMult': '1 + bonusBossDamagePercent x floor(degree / bonusBossDamagePerDegrees)',
            'note': 'power/cooldown/damage/pierce/boss formulas are reconstructed from the parameter names and match Bloons Wiki (https://www.bloonswiki.com/Paragon) values at degrees 10/20/100; the game code itself is not in the export',
        },
        'degrees': table,
        'totemPower': r4(num(bonus[0]['bonus'])) if bonus else None,
        'totemSrc': 'Towers/ParagonPowerTotem/ParagonPowerTotemTower.json',
        'towers': towers,
    }


MOD_FLAGS = {'ChimpsModModel': 'chimps', 'DisableSellTowerModModel': 'noSelling', 'DisableContinueModModel': 'noContinues',
             'DisableMonkeyKnowledgeModModel': 'noMK', 'RemoveManaShieldModModel': 'noManaShield', 'ImpoppableModel': 'impoppable',
             'DeflationModel': 'deflation', 'ReverseModel': 'reverse'}


def normalize_mod(mods):
    o, flags, other = {}, [], []
    for m in mods:
        t = short(m)
        if t == 'StartingCashModModel':
            if num(m.get('changeBase')):
                o['startCash'] = r4(num(m['changeBase']))
            elif num(m.get('multiplier')):
                o['startCashMult'] = r4(num(m['multiplier']))
            if num(m.get('addition')):
                o['startCashAdd'] = r4(num(m['addition']))
        elif t == 'StartingHealthModModel':
            o['lives'] = r4(num(m.get('addition')))
        elif t == 'MaxHealthModModel':
            o['maxLives'] = r4(num(m.get('set')))
        elif t == 'SellMultiplierModModel':
            o['sellMult'] = r4(num(m.get('addition')))
        elif t == 'GlobalCostModModel':
            o['costMult'] = r4(num(m.get('multiplier')))
        elif t == 'GlobalSpeedModModel':
            o['bloonSpeedMult'] = r4(num(m.get('multiplier')))
        elif t == 'BonusCashPerRoundModModel':
            o['roundBonus'] = {'base': r4(num(m.get('baseCash'))), 'perRound': r4(num(m.get('roundMultiple')))}
        elif t == 'StartingRoundModModel':
            o['startRound'] = m.get('round')
        elif t == 'EndRoundModModel':
            o['endRound'] = m.get('round')
        elif t == 'MonkeyMoneyModModel':
            o['mm'] = {'base': r4(num(m.get('changeBase'))), 'mult': r4(num(m.get('multiplier')))}
        elif t == 'LockTowerModModel':
            o.setdefault('lockedTowers', []).append(m.get('towerToLock'))
        elif t == 'LockTowerSetModModel':
            o.setdefault('lockedTowerSets', []).append(TOWER_SETS.get(m.get('towerSetToLock'), m.get('towerSetToLock')))
        elif t == 'ModifyAllCashModModel':
            o['cashMult'] = r4(num(m.get('multiplier')))
        elif t == 'BloonHealthModel':
            o.setdefault('bloonHealth', []).append({'tag': m.get('bloonTag'), 'mult': r4(num(m.get('healthMod')))})
        elif t == 'SetHealthForBloonModModel':
            o.setdefault('bloonHealth', []).append({'round': m.get('round'), 'bloon': m.get('bloonId'), 'mult': r4(num(m.get('healthMultiplier')))})
        elif t == 'RoundSetModModel':
            o['roundSet'] = m.get('roundsetName')
        elif t in MOD_FLAGS:
            flags.append(MOD_FLAGS[t])
        else:
            other.append(t)
    if flags:
        o['flags'] = sorted(flags)
    if other:
        o['other'] = other
    return o


# site mode id -> game Mod files applied in order (difficulty first, later mods of the same type replace earlier ones).
# The difficulty each mode sits on is UI/code, not in the export: from https://www.bloonswiki.com/Game_mode (BTD6).
COMPOSE = {
    'easy': ['Easy'], 'primary-only': ['Easy', 'PrimaryOnly'], 'deflation': ['Easy', 'Deflation'], 'sandbox-easy': ['Easy', 'Sandbox'],
    'medium': ['Medium'], 'military-only': ['Medium', 'MilitaryOnly'], 'apopalypse': ['Medium', 'Apopalypse'],
    'reverse': ['Medium', 'Reverse'], 'sandbox-medium': ['Medium', 'Sandbox'],
    'hard': ['Hard'], 'magic-monkeys-only': ['Hard', 'MagicOnly'], 'double-hp-moabs': ['Hard', 'DoubleMoabHealth'],
    'half-cash': ['Hard', 'HalfCash'], 'abr': ['Hard', 'AlternateBloonsRounds'], 'impoppable': ['Hard', 'Impoppable'],
    'chimps': ['Hard', 'Clicks'], 'sandbox-hard': ['Hard', 'Sandbox'],
}


def effective(mods_by_file, files):
    eff = {}
    for fn in files:
        n = mods_by_file[fn]['norm']
        for k, v in n.items():
            if k in ('lockedTowers', 'lockedTowerSets', 'bloonHealth', 'flags', 'other'):
                eff[k] = sorted(set(eff.get(k, []) + v)) if k != 'bloonHealth' else eff.get(k, []) + v
            elif k == 'startCashMult':
                eff['startCash'] = r4(num(eff.get('startCash'), 0) * v)
            elif k == 'mm' and not v['base'] and 'mm' in eff:
                # changeBase 0 keeps the difficulty's base (Impoppable/CHIMPS: Hard 200 x 1.5 = 300, matching in-game rewards)
                eff['mm'] = {'base': eff['mm']['base'], 'mult': v['mult']}
            else:
                eff[k] = v
    eff.setdefault('cashMult', 1)
    eff.setdefault('costMult', 1)
    eff.setdefault('bloonSpeedMult', 1)
    eff.setdefault('startRound', 1)
    if 'maxLives' in eff:
        eff['lives'] = eff['maxLives']
    return eff


def modes(gd, T):
    by = {}
    for f in sorted(glob.glob(os.path.join(gd, 'Mods', '*.json'))):
        d = json.load(open(f, encoding='utf-8'))
        key = os.path.basename(f)[:-5]
        by[key] = {'id': key, 'name': T.get(key), 'raw': [short(m) for m in d.get('mutatorMods') or []],
                   'norm': normalize_mod(d.get('mutatorMods') or []), 'src': rel(gd, f)}
    comp = {sid: {'mods': files, 'effective': effective(by, files)} for sid, files in sorted(COMPOSE.items())}
    return [by[k] for k in sorted(by)], comp


def income_sets(gd):
    out = []
    for f in sorted(glob.glob(os.path.join(gd, 'IncomeSets', '*.json'))):
        d = json.load(open(f, encoding='utf-8'))
        out.append({'id': d['name'], 'thresholds': [[t['threshold'], r4(t['multiplier'])] for t in d['thresholds']],
                    'final': r4(d['finalMultiplier']), 'src': rel(gd, f),
                    'meaning': 'pop cash x multiplier for rounds <= threshold (first matching row); after the last row x final'})
    return out


HEROES = ['Quincy', 'Gwendolin', 'StrikerJones', 'ObynGreenfoot', 'CaptainChurchill', 'Benjamin', 'Ezili', 'PatFusty', 'Adora',
          'AdmiralBrickell', 'Etienne', 'Sauda', 'Psi', 'Geraldo', 'Corvus', 'Rosalia', 'Silas', 'DanDMonke']


def hero_xp(gd):
    out = {}
    for h in HEROES:
        per, cum, src = [], [0, 0], []
        xs = cpx = None
        for n in range(1, 20):
            fn = 'Towers/%s/%s.json' % (h, h if n == 1 else '%s %d' % (h, n))
            d = load(gd, fn)
            if n == 1:
                for b in d.get('behaviors') or []:
                    if short(b) == 'HeroModel':
                        xs, cpx = r4(b.get('xpScale')), r4(b.get('costPerXpToLevel'))
                cost = d.get('cost')
            up = d['upgrades'][0]['upgrade']
            x = load(gd, 'Upgrades/%s.json' % up)['xpCost']
            per.append(x)
            cum.append(cum[-1] + x)
        out[h] = {'xpScale': xs, 'costPerXpToLevel': cpx, 'cost': r4(cost), 'perLevel': per, 'cumulative': cum,
                  'ratioToQuincy': None, 'src': 'Towers/%s/<Hero N>.json upgrades[0].upgrade -> Upgrades/<upgrade>.json xpCost' % h}
    q = out['Quincy']['cumulative'][20]
    for h in out:
        out[h]['ratioToQuincy'] = r4(out[h]['cumulative'][20] / q)
    return out


def maps(gd, T):
    out = []
    for f in sorted(glob.glob(os.path.join(gd, 'Maps', '*', '*.json'))):
        d = json.load(open(f, encoding='utf-8'))
        out.append({'id': d['id'], 'name': T.get(d['id']), 'difficulty': MAP_DIFF[d['difficulty']], 'unlockDifficulty': d.get('unlockDifficulty'),
                    'hasWater': bool(d.get('hasWater')), 'coopDivision': d.get('coopMapDivisionType'), 'theme': d.get('theme'),
                    'isStandard': bool(d.get('IsStandard')), 'isDebug': bool(d.get('isDebug')), 'isBrowserOnly': bool(d.get('isBrowserOnly')),
                    'music': d.get('mapMusic'), 'src': rel(gd, f)})
    out.sort(key=lambda m: (MAP_DIFF.index(m['difficulty']), m['id']))
    return out


def insta(gd, T):
    r = load(gd, 'rogueData.json')
    keys = ['maxInstaInventorySize', 'endOfRoundInstaChance', 'midRoundInstaChance', 'bonusRecruitInstas', 'boostInstaCostMultiplier',
            'instaInventorySizeAdditionChimps', 'chimpsInstacostMultiplier']
    packs = {k: T[k] for k in sorted(T) if k.startswith('btd6_') and 'insta' in k.lower() and k.endswith('Description')}
    return {
        'note': 'The v56 export has no main-game Insta Monkey data (no tier odds, no XP share, no round-100 reward table). '
                'Only Rogue Legends insta settings (rogueData.json) and store-pack text (textTable.json) mention Instas.',
        'rogueLegends': {k: r4(r.get(k)) for k in keys if k in r},
        'rogueSrc': 'rogueData.json',
        'storePackText': packs,
        'storePackSrc': 'textTable.json',
    }


OVERRIDES = [
    {'area': 'paragon', 'field': 'params.maxPowerFromMoneySpent', 'v56': 60000, 'v57': 80000, 'since': '57.0',
     'source': 'https://www.bloonswiki.com/Update_history:Bloons_TD_6/Version_57.0'},
    {'area': 'paragon', 'field': 'params.maxPowerFromPops', 'v56': 90000, 'v57': 125000, 'since': '57.0',
     'source': 'https://www.bloonswiki.com/Update_history:Bloons_TD_6/Version_57.0'},
    {'area': 'paragon', 'field': 'params.maxPowerFromNonTier5Count', 'v56': 10000, 'v57': 0, 'since': '57.0',
     'note': 'upgrade tiers of sacrificed towers no longer give Paragon Power',
     'source': 'https://www.bloonswiki.com/Update_history:Bloons_TD_6/Version_57.0'},
    {'area': 'paragon', 'field': 'towers[SniperMonkey]', 'v56': None, 'v57': {'name': 'S.P.I.D.E.R. Monkey'}, 'since': '57.0',
     'note': 'new Sniper Paragon; cost/XP not in the v56 export (site: $800,000, 750,000 XP, unverified here)',
     'source': 'https://www.bloonswiki.com/Update_history:Bloons_TD_6/Version_57.0'},
    {'area': 'maps', 'field': 'maps[ShipCapture]', 'v56': None, 'v57': {'name': 'Ship Capture', 'difficulty': 'Advanced'}, 'since': '57.0',
     'note': 'map not in the v56 export; the patch intro text calls it Intermediate, the change list says Advanced',
     'source': 'https://www.bloonswiki.com/Update_history:Bloons_TD_6/Version_57.0'},
    {'area': 'maps', 'field': 'maps[LostCrevasse] lanes', 'v56': None, 'v57': 'lanes simplified: all cross the middle, shorter top-left entrance removed, a duplicate left lane added',
     'since': '57.0', 'source': 'https://www.bloonswiki.com/Update_history:Bloons_TD_6/Version_57.0'},
    {'area': 'modes', 'field': 'CHIMPS income: Alchemist Lead to Gold (x-x-3)', 'v56': 'no income in CHIMPS', 'v57': 'earns income in CHIMPS (not Deflation)',
     'since': '57.0', 'note': 'tagged as a bug by the wiki; 57.1 reverted only the x-x-4 gold mutator, not Lead to Gold',
     'source': 'https://www.bloonswiki.com/Update_history:Bloons_TD_6/Version_57.0 ; https://www.bloonswiki.com/Update_history:Bloons_TD_6/Version_57.1'},
    {'area': 'insta', 'field': 'round-100 Insta tier odds', 'v56': None, 'v57': 'Beginner/Intermediate round-100 rewards roll only 2 tiers (changed in 57.1); store packs replaced by Insta Store',
     'since': '57.0/57.1', 'source': 'https://www.bloonswiki.com/Update_history:Bloons_TD_6/Version_57.1'},
    {'area': 'powers', 'field': 'MonkeyBoostPro range bonus', 'v56': 'x0 range mult + 15 (bug)', 'v57': 'x1 + 15', 'since': '57.0',
     'source': 'https://www.bloonswiki.com/Update_history:Bloons_TD_6/Version_57.0'},
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--gd', default='/home/claude/gd/g')
    ap.add_argument('--out', default=os.path.join(REPO, 'data', 'game', 'misc.json'))
    a = ap.parse_args()
    gd = a.gd
    T = load(gd, 'textTable.json')
    try:
        commit = subprocess.run(['git', '-C', gd, 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip() or None
    except Exception:
        commit = None
    gitems, glevels = geraldo(gd, T)
    mod_list, comp = modes(gd, T)
    out = {
        'meta': {'source': 'https://github.com/Btd6ModHelper/btd6-game-data', 'gameVersion': '56.0', 'commit': commit,
                 'script': 'tools/game/extract_misc.py', 'license': 'Data (c) Ninja Kiwi; fan-tool use',
                 'conventions': {'immune': 'DamageModel.immuneBloonProperties bits: 1 lead, 2 black, 4 white, 8 purple, 16 frozen, 64 unknown',
                                 'camo': 'false when a FilterInvisibleModel with isActive=true sits on the attack or projectile',
                                 'towerSets': TOWER_SETS, 'areaTypes': '1 water, 2 land',
                                 'modeComposition': 'site mode = difficulty Mod + mode Mod, applied in order; same field: later wins'}},
        'powers': powers(gd, T),
        'geraldoItems': gitems,
        'geraldoLevelText': glevels,
        'paragon': paragon(gd, T),
        'modes': mod_list,
        'modeComposition': comp,
        'incomeSets': income_sets(gd),
        'xp': {
            'heroes': hero_xp(gd),
            'notTowerData': 'Tower XP per round / per pop, the map-difficulty XP multiplier and Monkey Education are game code, not in the export.',
        },
        'insta': insta(gd, T),
        'maps': maps(gd, T),
        'overrides': OVERRIDES,
    }
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(out, f, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
        f.write('\n')
    print('wrote', a.out, os.path.getsize(a.out), 'bytes;', {k: len(v) for k, v in out.items() if isinstance(v, list)})


if __name__ == '__main__':
    main()
