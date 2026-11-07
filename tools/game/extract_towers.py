#!/usr/bin/env python3
"""Extract every tower's and hero's normal attacks from the BTD6 game-data export into data/game/towers.json.

    python3 tools/game/extract_towers.py [--gd /home/claude/gd/g] [--out data/game/towers.json]

Source: https://github.com/Btd6ModHelper/btd6-game-data (BTD Mod Helper "Export Game Data", game v56.0), a dump of
the game's Unity TowerModels. Data (c) Ninja Kiwi; summarised for a fan tool. Stdlib only, deterministic.

What is kept (schema in _meta.schema of the output, and in reports/game/towers.md):
  towers.<id>.crosspaths.<abc>   every legal crosspath (64 per tower, 000 included)
  heroes.<id>.levels.<n>         levels 1-20
  subTowers.<key>                every sub-tower made by a normal attack or tower behaviour (sentries, pets, planes,
                                 Phoenix, drones, totems...), deduplicated by content; crosspaths reference them by key
For each attack: range, camo targeting, target priorities, filters, and per weapon: cooldown, emission count/spread,
bursts, alternate shots, pairing, crits, plus the full projectile tree (damage, pierce, damage type decoded from the
immunity bitflag, bonus damage by tag/state/bloon, DoT, slow/stun/freeze/knockback/blowback, sub-projectiles).
Abilities are NOT decoded: each one is listed by name with flags (damages? makes towers?). Paragons are skipped.
"""
import argparse
import glob
import hashlib
import json
import math
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GAME_VERSION = '56.0'

TOWERS = {
    'dart': 'DartMonkey', 'boomerang': 'BoomerangMonkey', 'bomb': 'BombShooter', 'tack': 'TackShooter', 'ice': 'IceMonkey',
    'glue': 'GlueGunner', 'desperado': 'Desperado', 'sniper': 'SniperMonkey', 'sub': 'MonkeySub', 'buccaneer': 'MonkeyBuccaneer',
    'ace': 'MonkeyAce', 'heli': 'HeliPilot', 'mortar': 'MortarMonkey', 'dartling': 'DartlingGunner', 'wizard': 'WizardMonkey',
    'super': 'SuperMonkey', 'ninja': 'NinjaMonkey', 'alchemist': 'Alchemist', 'druid': 'Druid', 'mermonkey': 'Mermonkey',
    'skywarden': 'Skywarden', 'farm': 'BananaFarm', 'spike': 'SpikeFactory', 'village': 'MonkeyVillage', 'engineer': 'EngineerMonkey',
    'beast': 'BeastHandler',
}
HEROES = {
    'quincy': 'Quincy', 'gwendolin': 'Gwendolin', 'striker': 'StrikerJones', 'obyn': 'ObynGreenfoot', 'churchill': 'CaptainChurchill',
    'benjamin': 'Benjamin', 'ezili': 'Ezili', 'pat': 'PatFusty', 'adora': 'Adora', 'brickell': 'AdmiralBrickell', 'etienne': 'Etienne',
    'sauda': 'Sauda', 'psi': 'Psi', 'geraldo': 'Geraldo', 'corvus': 'Corvus', 'rosalia': 'Rosalia', 'silas': 'Silas', 'dan': 'DanDMonke',
}

# ---- the immunity bitflag (DamageModel.immuneBloonProperties = BloonProperties the damage can't hurt) -------------------
# Lead/Black/White/Purple/Glass are each bloon's own bloonProperties in Bloons/*.json: Lead 1 (Lead), Black 2 (Black),
# White 4 (White), Zebra 6 (Black|White), DDT 3 (Lead|Black), Purple 8, GoldenLeadPurple 9, GlassBloon 64.
# Frozen 16 is a status, not a bloon: it is the bit Sharp (17) has and Shatter (1) lacks. 32 never occurs.
BITS = [(1, 'lead'), (2, 'black'), (4, 'white'), (8, 'purple'), (16, 'frozen'), (64, 'glass')]
BIT_BY_NAME = {'Lead': 1, 'Black': 2, 'White': 4, 'Purple': 8, 'Frozen': 16, 'Glass': 64}
DAMAGE_TYPES = {0: 'normal', 1: 'shatter', 2: 'explosion', 4: 'glacier', 5: 'cold', 8: 'fire', 12: 'frigid', 17: 'sharp',
                64: 'acid', 72: 'plasma', 73: 'energy'}

SKIP_TYPES = re.compile(r'(Sound|Effect|Display|Audio|Sprite|Prefab|Animation|Icon|Footprint|Curve|Vector|ApplyMod|UpgradePath|'
                        r'ThrowMarker|AssetPath|CreditPops|SavedSubTower)')


def short(o):
    t = o.get('$type', '') if isinstance(o, dict) else ''
    return t.split(',')[0].split('.')[-1]


def num(v, d=0.0):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else d


def sig(v, n=4):
    """round to n significant digits; ints stay ints"""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return v
    if v == 0 or not math.isfinite(v):
        return 0 if v == 0 else v
    if abs(v) >= 1e6:
        return int(round(v))
    r = round(v, n - 1 - int(math.floor(math.log10(abs(v)))))
    return int(r) if r == int(r) else r


def imm_names(bits):
    return [n for b, n in BITS if bits & b]


def flag_bits(s):
    """'Lead, Black' / 'None' / 'Frozen' -> int"""
    if isinstance(s, (int, float)):
        return int(s)
    out = 0
    for part in re.split(r'[,\s|]+', str(s or '')):
        out |= BIT_BY_NAME.get(part, 0)
    return out


def tags_of(m):
    t = m.get('tags') or m.get('bloonTags')
    if isinstance(t, list) and t:
        return [str(x) for x in t]
    s = m.get('tag')
    return [x.strip() for x in str(s).split(',') if x.strip()] if s else []


def load(path):
    with open(path, encoding='utf-8-sig') as f:
        return json.load(f)


DEFAULTS = {'id': 'Projectile', 'w': 'Weapon'}


def compact(d):
    """drop empty / default values so the file stays small (id 'Projectile', weapon 'Weapon', and imm when type names it)"""
    if isinstance(d, dict):
        out = {}
        for k, v in d.items():
            v = compact(v)
            if v is None or v == [] or v == {} or v is False or DEFAULTS.get(k) == v or k.startswith('_'):
                continue
            out[k] = v
        if 'imm' in out and 'type' in out and not str(out['type']).startswith('imm'):
            del out['imm']
        return out
    if isinstance(d, list):
        return [compact(x) for x in d]
    return sig(d)


# ---- filters ---------------------------------------------------------------------------------------------------------
def read_filters(flist):
    """returns (camo_blocked, excl_tags, only_tags, misc)"""
    camo_blocked = False
    excl, only, misc = [], [], []
    for f in flist or []:
        t = short(f)
        if t == 'FilterInvisibleModel':
            if f.get('isActive'):
                camo_blocked = True
        elif t == 'FilterOutTagModel':
            excl += tags_of(f)
        elif t == 'FilterWithTagModel':
            # verified on examples: inclusive=False keeps ONLY the tag (Ace Anti-MOAB missile 'Moabs', Alchemist
            # Lead to Gold splash 'Lead'); inclusive=True drops it (Mermonkey trance 'Moabs')
            (excl if f.get('inclusive') else only).extend(tags_of(f))
        elif t == 'FilterWithTagsModel':
            # inclusive=True drops every listed tag (Buccaneer Takedown can't grab Zomg/Bad, Druid vines 'Moabs')
            (excl if f.get('inclusive') else only).extend(tags_of(f))
        elif t == 'FilterMoabModel':
            # flip=False keeps only MOAB-class (Alchemist Unstable Concoction), flip=True drops them (Ice Arctic Wind)
            (excl if f.get('flip') else only).append('Moabs')
        elif t == 'FilterOutBloonModel':
            excl += [str(x) for x in (f.get('bloonIds') or [f.get('bloonId')]) if x]
        elif t in ('FilterFrozenBloonsModel', 'FilterGlueLevelModel', 'FilterMutatedTargetModel', 'FilterOveridingMutatedTargetModel',
                   'FilterOfftrackModel', 'FilterOnlyCamoInModel', 'FilterMarkedToPopModel', 'FilterWithChanceModel'):
            misc.append(t[6:-5])
        elif t == 'FilterAllModel':
            misc.append('All')
    return camo_blocked, excl, only, misc


# ---- projectiles -----------------------------------------------------------------------------------------------------
EMIT_COUNT_KEYS = ('count', 'projectileCount', 'Count')
SUB_TRIGGERS = {
    'CreateProjectileOnContactModel': 'contact', 'CreateProjectileOnExhaustFractionModel': 'exhaust',
    'CreateDistanceProjectileOnExhaustFractionModel': 'exhaust', 'CreateProjectileOnExhaustPierceModel': 'pierceUsed',
    'CreateProjectileOnExpireModel': 'expire', 'CreateProjectileOnIntervalModel': 'interval',
    'CreateProjectileOnBlockerCollideModel': 'blocker', 'CreateProjectileOnTowerDestroyModel': 'towerDestroyed',
    'EmitOnDamageModel': 'damage', 'EmitOnPopModel': 'pop', 'EmitOnDestroyModel': 'destroy', 'EmitOnDamageWithStateModel': 'damageState',
    'CreateProjectilesInAreaModel': 'area',
}
# projectile behaviours that do something to bloons the DamageModel doesn't describe (kept by name)
SPECIAL = {'EatBloonModel', 'CarryBloonModel', 'MoabTakedownModel', 'LatchToBloonModel', 'TranceBloonModel', 'MorphBloonModel',
           'StripChildrenModel', 'AcidPoolModel', 'GreatWhiteLimitProjectileModel', 'BloonSlapModel', 'MarkedToPopProjectileBehaviorModel',
           'KnockBloonOutOfBoundsModel', 'DesperadoMarkModel', 'SilasApplyRimeModel', 'FrozenRemainsExplosionModel', 'PsiBloonBehaviorModel',
           'AddBonusDamagePerHitToBloonModel', 'IncreaseBloonWorthModel', 'IncreaseBloonWorthWithTierModel', 'AddHeatToBloonModel',
           'AddAcidicMixtureToProjectileModel', 'AddBerserkerBrewToProjectileModel', 'DamagePercentOfMaxModel', 'SkimBloonsModel',
           'WindlashModel', 'ChilledModel', 'HauntModel', 'EmberModel', 'SpikeParagonDamageZoneModel', 'ScaleDamageWithTimeModel',
           'DamageModifierForCashAmountModel', 'DamageModifierWrathModel', 'DamageModifierUnstableConcoctionModel', 'SaudaAfflictionDamageModifierModel',
           'HeatItUpDamageBuffModel', 'DamageModifierForManaShieldModel', 'DamageModifierForLifeBelowMaxModel', 'ProjectileCreateShieldOnPopModel',
           'TrampleModel', 'MoabShoveZoneModel', 'RepelModel', 'GrowBlockModel', 'DamageUpTowersModel', 'DamageUpTagTowersModel',
           'PierceUpTowersModel', 'LightningRodModel', 'LightningRodEmitModel', 'CorvusSpellProjectileModel'}
TOWER_MAKERS = {'CreateTowerModel': ('tower',), 'CreateTypedTowerModel': ('boomTower', 'coldTower', 'crushingTower', 'energyTower', 'tower')}


def emission_info(e):
    """(count, kind, spread angle)"""
    if not isinstance(e, dict):
        return 1, None, None
    t = short(e)
    n = 1
    for k in EMIT_COUNT_KEYS:
        if num(e.get(k)) > 0:
            n = int(num(e.get(k)))
            break
    ang = num(e.get('angle')) or num(e.get('spread')) or None
    kind = t.replace('EmissionModel', '').replace('EmmisionTowardsTargetModel', 'TowardsTarget').replace('Model', '') or None
    return n, kind, ang


class Ctx:
    """walk state shared by one top-level tower: sub-tower registry and the source file"""

    def __init__(self, ex, src):
        self.ex = ex
        self.src = src


def damage_of(b):
    bits = int(num(b.get('immuneBloonProperties')))
    d = {'dmg': num(b.get('damage')), 'imm': bits, 'type': DAMAGE_TYPES.get(bits, 'imm%d' % bits)}
    if num(b.get('maxDamage')) > 0:
        d['maxDmg'] = num(b.get('maxDamage'))
    return d


def projectile(p, cx, depth=0, seen=None):
    seen = seen or set()
    if not isinstance(p, dict) or depth > 8 or id(p) in seen:
        return None
    seen = seen | {id(p)}
    out = {'id': p.get('id') or p.get('name', '').replace('ProjectileModel_', '')}
    pierce = num(p.get('pierce'), 1.0)
    out['pierce'] = pierce
    if num(p.get('maxPierce')) > 0 and num(p.get('maxPierce')) != pierce:
        out['maxPierce'] = num(p.get('maxPierce'))
    if num(p.get('radius')) > 0:
        out['r'] = num(p.get('radius'))
    # filters: on the projectile itself and in ProjectileFilterModel
    flist = list(p.get('filters') or [])
    for b in p.get('behaviors') or []:
        if short(b) == 'ProjectileFilterModel':
            flist += b.get('filters') or []
    camo_blocked, excl, only, misc = read_filters(flist)
    if camo_blocked:
        out['noCamo'] = True
    if excl:
        out['excl'] = sorted(set(excl))
    if only:
        out['only'] = sorted(set(only))
    if misc:
        out['filt'] = sorted(set(misc))
    bonus, fx, subs, towers, special = [], [], [], [], []
    for b in p.get('behaviors') or []:
        t = short(b)
        if t == 'PsiEffectModel':
            # Psi: the hit bloon takes damagePerTick every tickRate until it pops (or maxDuration); the damage type is
            # the projectile's own DamageModel (which itself deals 0)
            dm = next((x for x in p.get('behaviors') or [] if short(x) == 'DamageModel'), {})
            bits = int(num(dm.get('immuneBloonProperties')))
            fx.append({'k': 'dot', 'id': 'Psi', 'dmg': num(b.get('damagePerTick')), 'every': num(b.get('tickRate')),
                       'dur': num(b.get('maxDuration')), 'imm': bits, 'type': DAMAGE_TYPES.get(bits, 'imm%d' % bits)})
            continue
        if t == 'ProjectileFilterModel':
            continue
        if SKIP_TYPES.search(t) and not any(short(v) == 'ProjectileModel' for v in b.values() if isinstance(v, dict)):
            continue  # visual/sound only (CreateGreatWhiteEffectModel carries a real projectile, so it is kept)
        if t == 'DamageModel':
            d = damage_of(b)
            if d['dmg'] >= 1e6:
                out['instakill'] = True
            if 'dmg' in out:  # two DamageModels: keep the sum, note it
                out['dmg'] += d['dmg']
                out.setdefault('notes', []).append('2 DamageModels')
            else:
                out.update(d)
        elif t == 'DamageInRingRadiusModel':
            d = damage_of(b)
            d['ringInner'] = num(b.get('innerRingRadius'))
            out['ring'] = d
        elif t == 'DamageModifierForTagModel':
            add, mult = num(b.get('damageAddative')), num(b.get('damageMultiplier'), 1.0)
            if add or mult != 1.0:
                e = {'tags': tags_of(b), 'add': add, 'mult': mult}
                if b.get('mustIncludeAllTags'):
                    e['all'] = True
                if b.get('applyOverMaxDamage'):
                    e['overMax'] = True
                bonus.append(e)
        elif t in ('DamageModifierForBloonStateModel', 'DamageModifierForBloonTypeModel', 'DamageModifierForBloonStateAndTypeModel'):
            add, mult = num(b.get('damageAdditive')), num(b.get('damageMultiplier'), 1.0)
            if add or mult != 1.0:
                e = {'add': add, 'mult': mult}
                st = b.get('bloonStates') or ([b['bloonState']] if b.get('bloonState') else [])
                if st:
                    e['states'] = st
                ids = b.get('bloonTypes') or b.get('bloonIds') or ([b['bloonId']] if b.get('bloonId') else [])
                if ids:
                    e['bloons'] = ids
                bonus.append(e)
        elif t == 'BloonTagDamageOverrideModel':
            ids = b.get('bloonIds') or [x for x in str(b.get('bloonId') or '').split(',') if x]
            bonus.append({'bloons': ids, 'setTo': num(b.get('damageAdditive'))})
        elif t == 'DamageImmunityBypassModel':
            bits = flag_bits(b.get('properties'))
            if bits:
                out['bypass'] = bits
        elif t == 'IgnoreDmgImmunityModel':
            out['ignoreImm'] = {'bits': int(num(b.get('removeBloonProperties'))), 'chance': num(b.get('chance'), 1.0)}
        elif t == 'ChangeDamageTypeModel':
            out['setImm'] = int(num(b.get('immuneBloonProperties')))
        elif t == 'AddBehaviorToBloonModel':
            life = num(b.get('lifespan'))
            for bb in b.get('behaviors') or []:
                tt = short(bb)
                if tt in ('DamageOverTimeModel', 'DamageOverTimeCustomModel'):
                    bits = int(num(bb.get('immuneBloonProperties')))
                    iv = num(bb.get('interval'))
                    dot = {'k': 'dot', 'id': b.get('mutationId'), 'dmg': num(bb.get('damage')), 'every': iv, 'dur': life,
                           'imm': bits, 'type': DAMAGE_TYPES.get(bits, 'imm%d' % bits)}
                    if iv > 0 and life > 0:
                        dot['ticks'] = int(life / iv + 1e-6) + (1 if bb.get('triggerImmediate') else 0)
                    fl = b.get('filters') or ([b['filter']] if isinstance(b.get('filter'), dict) else [])
                    _, dx, do, _ = read_filters(fl)
                    if dx:
                        dot['excl'] = sorted(set(dx))
                    if do:
                        dot['only'] = sorted(set(do))
                    fx.append(dot)
                elif not SKIP_TYPES.search(tt):
                    fx.append({'k': 'bloonBehavior', 'id': b.get('mutationId'), 'what': tt, 'dur': life})
                # projectiles the affected bloon emits later (Ice Shards when a frozen bloon pops, Icicles, glue splats)
                for pm in find_all(bb, lambda x: short(x) == 'ProjectileModel'):
                    sp = projectile(pm, cx, depth + 1, seen)
                    if sp:
                        subs.append({'on': 'bloon:' + (b.get('mutationId') or tt), 'n': 1, 'p': sp})
        elif t == 'SlowModel':
            m = num(b.get('multiplier'), 1.0)
            fx.append({'k': 'stun' if m == 0 else 'slow', 'id': b.get('mutationId'), 'mult': m, 'dur': num(b.get('lifespan'))})
        elif t == 'SlowForBloonModel':
            fx.append({'k': 'slow', 'id': b.get('mutationId'), 'mult': num(b.get('multiplier'), 1.0), 'dur': num(b.get('lifespan')),
                       'bloons': b.get('bloonIds') or b.get('bloonId'), 'tag': b.get('bloonTag')})
        elif t == 'SlowModifierForTagModel':
            fx.append({'k': 'slowMod', 'tag': b.get('tag'), 'slowId': b.get('slowId'), 'mult': num(b.get('slowMultiplier'), 1.0),
                       'dur': num(b.get('lifespanOverride')), 'immune': bool(b.get('preventMutation'))})
        elif t == 'SlowMaimMoabModel':
            fx.append({'k': 'maim', 'mult': num(b.get('multiplier')), 'moab': num(b.get('moabDuration')), 'bfb': num(b.get('bfbDuration')),
                       'zomg': num(b.get('zomgDuration')), 'ddt': num(b.get('ddtDuration')), 'bad': num(b.get('badDuration'))})
        elif t == 'FreezeModel':
            e = {'k': 'freeze', 'id': b.get('mutationId'), 'dur': num(b.get('lifespan')), 'layers': num(b.get('layers')),
                 'moabs': bool(b.get('canFreezeMoabs'))}
            if b.get('enablePercentChanceToFreeze'):
                e['chance'] = num(b.get('percentChanceToFreeze'))
            if isinstance(b.get('damageModel'), dict):
                e['dmg'] = damage_of(b['damageModel'])
            fx.append(e)
        elif t == 'FreezeModifierForTagsModel':
            fx.append({'k': 'freezeMod', 'tags': tags_of(b), 'mult': num(b.get('freezeTimeMultiplier'), 1.0), 'immune': bool(b.get('preventMutation'))})
        elif t == 'KnockbackModel':
            fx.append({'k': 'knockback', 'dur': num(b.get('lifespan')), 'light': num(b.get('lightMultiplier')), 'heavy': num(b.get('heavyMultiplier')),
                       'moab': num(b.get('moabMultiplier'))})
        elif t == 'WindModel':
            fx.append({'k': 'blowback', 'min': num(b.get('distanceMin')), 'max': num(b.get('distanceMax')), 'chance': num(b.get('chance'), 1.0),
                       'moabs': bool(b.get('affectMoab'))})
        elif t == 'PushBackModel':
            fx.append({'k': 'push', 'amount': num(b.get('pushAmount')), 'tag': b.get('tag'), 'moab': num(b.get('multiplierMOAB')),
                       'bfb': num(b.get('multiplierBFB')), 'zomg': num(b.get('multiplierZOMG')), 'ddt': num(b.get('multiplierDDT'))})
        elif t == 'RemoveBloonModifiersModel':
            what = [k[7:].lower() for k in ('cleanseCamo', 'cleanseRegen', 'cleanseFortified', 'cleanseLead') if b.get(k)]
            if what:
                e = {'k': 'strip', 'what': what}
                if b.get('cleanseOnlyIfDamaged'):
                    e['ifDamaged'] = True
                fx.append(e)
        elif t == 'AddTagToBloonModel':
            fx.append({'k': 'tag', 'tag': b.get('bloonTag') or b.get('tag'), 'dur': num(b.get('lifespan'))})
        elif t == 'CashModel':
            fx.append({'k': 'cash', 'min': num(b.get('minimum')), 'max': num(b.get('maximum'))})
        elif t == 'ClearHitBloonsModel':
            out['rehitEvery'] = num(b.get('interval'))
        elif t == 'RefreshPierceModel':
            out['refreshPierceEvery'] = num(b.get('interval'))
        elif t == 'RetargetOnContactModel':
            out['bounces'] = int(num(b.get('maxBounces')))
        elif t == 'LightningModel':
            out['chain'] = {'splits': int(num(b.get('splits'))), 'range': num(b.get('splitRange'))}
        elif t == 'CritMultiplierModel':
            out['crit'] = {'dmg': num(b.get('damage')), 'every': [num(b.get('lower')), num(b.get('upper'))]}
        elif t in ('AgeModel', 'AgeRandomModel'):
            life = num(b.get('lifespan')) or num(b.get('maxLifespan'))
            if b.get('rounds') and num(b.get('rounds')) > 0 and life <= 0:
                out['lifeRounds'] = num(b.get('rounds'))
            out['life'] = max(num(out.get('life')), life)
            if num(b.get('rounds')) > 0:
                out['rounds'] = num(b.get('rounds'))
        elif t in ('TravelStraitModel', 'TravelStraitSlowdownModel', 'RandomRangeTravelStraitModel'):
            out['speed'] = num(b.get('speed'))
            out['life'] = max(num(out.get('life')), num(b.get('lifespan')))
            out['move'] = 'straight'
        elif t in ('TrackTargetModel', 'TrackTargetWithinTimeModel', 'AdoraTrackTargetModel', 'SilasTrackTargetModel', 'SmartTargetTrackModel'):
            out['move'] = 'seeking'
            if num(b.get('lifespan')) > 0:
                out['life'] = max(num(out.get('life')), num(b.get('lifespan')))
        elif t == 'ArriveAtTargetModel':
            out['move'] = 'lob'
        elif t == 'InstantModel':
            out['move'] = 'instant'
        elif t in ('FollowPathModel', 'TravelAlongPathModel'):
            out['move'] = 'path'
            if num(b.get('lifespan')) > 0:
                out['life'] = max(num(out.get('life')), num(b.get('lifespan')))
        elif t == 'GalvanizedModel':
            sp = projectile(b.get('projectile'), cx, depth + 1, seen)
            if sp:
                subs.append({'on': 'galvanized', 'n': 1, 'p': sp})
            if num(b.get('stunDuration')) > 0:
                fx.append({'k': 'stun', 'id': 'Galvanized', 'mult': num(b.get('stunSpeedMultiplier')), 'dur': num(b.get('stunDuration')),
                           'dmg': num(b.get('stunDamage'))})
        elif t in SUB_TRIGGERS:
            proj = b.get('projectile') or b.get('projectileModel')
            sp = projectile(proj, cx, depth + 1, seen) if isinstance(proj, dict) else None
            n, kind, ang = emission_info(b.get('emission') or b.get('emissionModel'))
            e = {'on': SUB_TRIGGERS[t], 'n': n}
            if kind and kind not in ('Single', 'TowardsTarget', 'InstantDamage'):
                e['em'] = kind
            if ang:
                e['arc'] = ang
            if t == 'CreateProjectileOnIntervalModel':
                e['every'] = num(b.get('intervalFrames')) / 60.0
            if t == 'CreateProjectileOnExhaustPierceModel':
                e['perPierce'] = num(b.get('pierceInterval'), 1.0)
                if num(b.get('count')) > 0:
                    e['max'] = num(b.get('count'))
            if t == 'EmitOnDamageModel' and num(b.get('cooldown')) > 0:
                e['cooldown'] = num(b.get('cooldown'))
            if sp:
                if n > 1 and (kind in ('Arc', 'RandomArc', 'Random') or (ang or 0) >= 90):
                    sp['_single'] = False  # a spread of fragments: at most one reaches the target (est only)
                e['p'] = sp
                subs.append(e)
        elif t in TOWER_MAKERS:
            for key in TOWER_MAKERS[t]:
                if isinstance(b.get(key), dict) and short(b[key]) == 'TowerModel':
                    towers.append(cx.ex.subtower(b[key], cx, via='projectile' if key == 'tower' else 'projectile:' + key))
        elif t in SPECIAL or t.endswith('Model'):
            if t in SPECIAL:
                special.append(t[:-5])
            # any other behaviour that carries a projectile (Silas rime explosion, Frozen Remains, Marked to Pop...)
            for k, v in b.items():
                if isinstance(v, dict) and short(v) == 'ProjectileModel':
                    sp = projectile(v, cx, depth + 1, seen)
                    if sp:
                        subs.append({'on': t[:-5], 'n': 1, 'p': sp})
    if bonus:
        out['bonus'] = bonus
    if fx:
        out['fx'] = fx
    if subs:
        out['subs'] = subs
    if towers:
        out['towers'] = towers
    if special:
        out['special'] = sorted(set(special))
    return out


WEAPON_RATE_MODS = {'BloonDistanceRateBonusModel', 'LifeBasedAttackSpeedModel', 'BloonsInRangeAttackSpeedModel', 'RandomRateModel',
                    'LeakDangerAttackSpeedModel', 'WeaponRateMinModel', 'StandoffModel', 'BerserkerBrewModel'}
WEAPON_CONDITIONS = {'CheckTempleCanFireModel': 'templeSacrifice', 'CheckTempleUnderLevelModel': 'templeUnderLevel',
                     'EmissionsPerRoundFilterModel': 'perRound', 'LimitProjectileModel': 'limited', 'SubTowerFilterModel': 'subTowerCount',
                     'CheckIsOverTrackModel': 'overTrack', 'CheckAirUnitOverTrackModel': 'overTrack', 'PsiLimitProjectileModel': 'limited',
                     'GreatWhiteLimitProjectileModel': 'limited', 'JungleVineLimitProjectileModel': 'limited', 'BananaPeelLimitProjectileModel': 'limited',
                     'LimitByHauntSpellModel': 'limited', 'NecroEmissionFilterModel': 'graveyard', 'MagusPerfectusGraveyardModel': 'graveyard',
                     'PierceFromLivesGainedModel': 'livesGained', 'HasSpellcastProjectileModel': 'spellcast'}


def weapon(w, cx):
    out = {'w': (w.get('name') or '').replace('WeaponModel_', '')}
    rate = num(w.get('rate'))
    out['cd'] = rate
    n, kind, ang = emission_info(w.get('emission'))
    out['n'] = n
    if kind and kind not in ('Single', 'TowardsTarget'):
        out['em'] = kind
    if ang:
        out['arc'] = ang
    if w.get('fireWithoutTarget'):
        out['noTarget'] = True
    if w.get('fireBetweenRounds'):
        out['betweenRounds'] = True
    if w.get('startInCooldown'):
        out['startCd'] = True
    burst = 1
    mods, cond = [], []
    for b in w.get('behaviors') or []:
        t = short(b)
        if t == 'BurstWeaponBehaviorModel' or t == 'BurstWeaponIncreasingArcBehaviorModel':
            burst = int(num(b.get('count'), 1))
            out['burst'] = {'n': burst, 'gap': num(b.get('interval'))}
        elif t == 'AlternateProjectileModel':
            an, ak, aa = emission_info(b.get('emissionModel'))
            ap = projectile(b.get('projectile'), cx)
            out['alt'] = {'every': int(num(b.get('interval'))), 'n': an, 'p': ap}
            if aa:
                out['alt']['arc'] = aa
        elif t == 'BonusProjectileAfterIntervalModel':
            # an extra projectile every `interval` shots (Gwendolin), with its own cooldown
            out['bonusShot'] = {'every': num(b.get('interval')), 'cd': num(b.get('cooldown')), 'p': projectile(b.get('projectileModel') or b.get('projectile'), cx)}
        elif t == 'SwapProjectileModel':
            # the weapon fires projectile A or B depending on a mode the tower switches (Rosalia)
            out['swap'] = [projectile(b.get('projectileModelA'), cx), projectile(b.get('projectileModelB'), cx)]
            mods.append('SwapProjectile')
        elif t == 'ChangeProjectilePerEmitModel':
            out['changed'] = {'forShots': int(num(b.get('forProjectileCount'))), 'p': projectile(b.get('changedProjectileModel'), cx)}
        elif t == 'DuplicateProjectilePerEmitModel':
            out['duplicate'] = {'forShots': int(num(b.get('forProjectileCount'))), 'extra': int(num(b.get('additionalProjectiles'))),
                                'angle': num(b.get('angleOffset'))}
        elif t == 'FireAlternateWeaponModel':
            out['triggers'] = int(num(b.get('weaponId')))
        elif t == 'FireWhenAlternateWeaponIsReadyModel':
            out['firedBy'] = int(num(b.get('weaponId')))
        elif t == 'CritMultiplierModel':
            out['crit'] = {'dmg': num(b.get('damage')), 'every': [num(b.get('lower')), num(b.get('upper'))]}
        elif t == 'CritRollWithDistanceModel':
            mods.append('CritRollWithDistance')
        elif t == 'EmissionsPerRoundFilterModel':
            out['perRound'] = int(num(b.get('count')))
        elif t == 'LimitProjectileModel':
            out['limit'] = int(num(b.get('limit')))
        elif t == 'SubTowerFilterModel':
            out['maxSubTowers'] = int(num(b.get('maxNumberOfSubTowers')))
            cond.append('subTowerCount')
        elif t == 'WeaponRateMinModel':
            out['minCd'] = num(b.get('min') or b.get('rate') or b.get('minRate'))
            mods.append('WeaponRateMin')
        elif t in WEAPON_RATE_MODS:
            mods.append(t[:-5])
        elif t in WEAPON_CONDITIONS:
            cond.append(WEAPON_CONDITIONS[t])
        elif t == 'FilterTargetAngleFilterModel':
            cond.append('targetAngle')
        elif t in ('TheBlazingSunModel',
                   'VagrantWeaponBehaviorModel', 'AcidicMixtureModel', 'SpinModel', 'RandomAngleOffsetModel'):
            mods.append(t[:-5])
    if mods:
        out['mods'] = sorted(set(mods))
    if cond:
        out['cond'] = sorted(set(cond))
    out['p'] = projectile(w.get('projectile'), cx)
    out['sps'] = (n * burst / rate) if rate > 0 else 0.0
    return out


TARGET_RE = re.compile(r'^Target(.*?)(PrioCamo|SharedRange|AirUnit)?Model$')


def attack(a, cx, cond=None):
    out = {'a': (a.get('name') or '').replace('AttackModel_', '').replace('AttackAirUnitModel_', '').strip('_')}
    out['range'] = num(a.get('range'))
    if short(a) == 'AttackAirUnitModel':
        out['air'] = True
    if not cond and a.get('name') in getattr(cx, 'spell_names', ()):
        cond = 'spell'
    if cond:
        out['cond'] = cond
    flist = []
    targets = []
    for b in a.get('behaviors') or []:
        t = short(b)
        if t == 'AttackFilterModel':
            flist += b.get('filters') or []
        m = TARGET_RE.match(t)
        if m and b.get('isSelectable', True):
            nm = m.group(1) + ('*' if m.group(2) == 'PrioCamo' else '')
            if nm not in targets:
                targets.append(nm)
    tp = a.get('targetProvider')
    if isinstance(tp, dict):
        m = TARGET_RE.match(short(tp))
        if m and m.group(1) and m.group(1) not in [x.rstrip('*') for x in targets]:
            targets.insert(0, m.group(1))
        elif short(tp) and not m:
            targets.insert(0, short(tp).replace('Model', ''))
    camo_blocked, excl, only, misc = read_filters(flist)
    out['camo'] = not camo_blocked
    if excl:
        out['excl'] = sorted(set(excl))
    if only:
        out['only'] = sorted(set(only))
    if misc:
        out['filt'] = sorted(set(misc))
    if targets:
        out['targets'] = targets
    ws = [weapon(w, cx) for w in a.get('weapons') or [] if isinstance(w, dict)]
    # FireWhenAlternateWeaponIsReady: the secondary only fires when the weapon that triggers it fires, so its real
    # rate is the trigger's (e.g. Buccaneer 0-4-0 'Grape Shot Secondary' has rate 0.05 but fires once per 1.35 s)
    for i, w in enumerate(ws):
        for j, v in enumerate(ws):
            if i != j and v.get('triggers') is not None and w.get('firedBy') is not None and v['triggers'] == w['firedBy']:
                w['pairedWith'] = j
                w['sps'] = w['n'] * (w.get('burst', {}).get('n', 1)) / v['cd'] if v['cd'] > 0 else 0.0
    if not any(has_damage(w.get('p')) for w in ws):
        ws += code_driven(a, cx)
    out['weapons'] = ws
    return out


def has_damage(p):
    return any('dmg' in n or n.get('ring') or any(f.get('k') == 'dot' for f in n.get('fx') or []) for n, _ in tree_nodes(p))


def code_driven(a, cx):
    """attacks whose damage the game applies in code from DamageModels held by an attack behaviour (Gyrfalcon swoop and
    grapple: GyrfalconPatternModel.initialDamageModel / grapplingDamageModel, cooldown, grappleDamageRate). Returned as
    pseudo weapons flagged codeDriven; the FilterBloonIfDamageTypeModel copy of the same DamageModel is the fallback."""
    ws = []
    holders = list(a.get('behaviors') or []) + ([a['targetProvider']] if isinstance(a.get('targetProvider'), dict) else [])
    seen = set()
    for b in holders:
        t = short(b)
        if t == 'AttackFilterModel':
            continue
        for k, v in sorted(b.items()):
            if isinstance(v, dict) and short(v) == 'DamageModel' and num(v.get('damage')) > 0 and t + k not in seen:
                seen.add(t + k)
                node = {'id': k.replace('Model', ''), 'pierce': num(b.get('grabAmount'), 1.0) if 'initial' in k else 1.0}
                node.update(damage_of(v))
                mod = b.get(k.replace('DamageModel', 'DamageMoabModifierModel'))
                if isinstance(mod, dict) and (num(mod.get('damageAddative')) or num(mod.get('damageMultiplier'), 1.0) != 1.0):
                    node['bonus'] = [{'tags': tags_of(mod), 'add': num(mod.get('damageAddative')), 'mult': num(mod.get('damageMultiplier'), 1.0)}]
                cd = num(b.get('grappleDamageRate')) if 'grappl' in k.lower() else num(b.get('cooldown'))
                ws.append({'w': t[:-5] + '.' + k[:-len('DamageModel')], 'cd': cd, 'n': 1, 'p': node, 'sps': 1.0 / cd if cd > 0 else 0.0,
                           'codeDriven': True})
    if not ws:
        for b in a.get('behaviors') or []:
            if short(b) != 'AttackFilterModel':
                continue
            for f in b.get('filters') or []:
                dm = f.get('damageModel') if short(f) == 'FilterBloonIfDamageTypeModel' else None
                if isinstance(dm, dict) and num(dm.get('damage')) > 0:
                    node = {'id': 'FilterDamageModel', 'pierce': 1.0}
                    node.update(damage_of(dm))
                    ws.append({'w': 'codeDriven', 'cd': 0.0, 'n': 1, 'p': node, 'sps': 0.0, 'codeDriven': True})
                    break
    return ws


# ---- towers ------------------------------------------------------------------------------------------------------------
# tower behaviours that hold attacks which only fire in a special state; recorded with cond=<label>
COND_HOLDERS = {'SubmergeModel': 'submerged', 'NecromancerZoneModel': 'graveyard', 'TempleTowerMutatorGroupTierOneModel': 'templeSacrifice',
                'TempleTowerMutatorGroupTierTwoModel': 'templeSacrifice', 'SpearModel': 'spell', 'EmberModel': 'spell',
                'MalevolenceModel': 'spell', 'AncestralMightModel': 'spell', 'StormModel': 'spell', 'AdoraSunGodTransformationModel': 'transform'}
SUBTOWER_HOLDERS = {  # type: (key(s) holding the TowerModel, via label)
    'TowerCreateTowerModel': (('towerModel',), 'placed'), 'BeastHandlerLeashModel': (('towerModel', 'towerModelSecond'), 'pet'),
    'DroneSupportModel': (('droneModel',), 'drone'), 'ComancheDefenceModel': (('towerModel',), 'reinforcement'),
    'TranceTotemSpawnerModel': (('tower',), 'totem'), 'EchoModel': (('duplicateSpiritModel',), 'spellEcho'),
}


def find_all(o, pred, stop=None):
    """every dict under o for which pred holds (not descending into matches or into stop types)"""
    res = []

    def rec(x):
        if isinstance(x, dict):
            if pred(x):
                res.append(x)
                return
            if stop and stop(x):
                return
            for v in x.values():
                rec(v)
        elif isinstance(x, list):
            for v in x:
                rec(v)
    rec(o)
    return res


# tower behaviours that damage without a WeaponModel (checked one by one): label = cond of the pseudo-attack
PASSIVE = {'SilasIceFragmentsModel': 'iceMonkeyShards', 'PreEmptiveStrikeLauncherModel': 'passive', 'SpiritOfTheForestModel': 'passive',
           'SubmergeEffectModel': 'submerged', 'TrampleModel': 'spell', 'OverloadModel': 'spell', 'CreateProjectileOnTowerDestroyModel': 'onDestroy'}


def passive(b, cx, label='passive'):
    """a tower behaviour (not an attack, not an ability) that damages on its own: Silas ice fragments, Sub Pre-emptive
    Strike, Druid Spirit of the Forest vines, ... -> a pseudo-attack with cond='passive' and cd 0 (rate not in a WeaponModel)"""
    t = short(b)
    projs = find_all(b, lambda x: short(x) == 'ProjectileModel', stop=lambda x: short(x) in ('AbilityModel', 'TowerModel'))
    zones = find_all(b, lambda x: short(x) == 'DamageOverTimeZoneModel', stop=lambda x: short(x) in ('AbilityModel', 'TowerModel'))
    ws = []
    for pm in projs:
        p = projectile(pm, cx)
        if p and (num(p.get('dmg')) > 0 or p.get('bonus') or p.get('subs') or any(f.get('k') == 'dot' for f in p.get('fx') or [])):
            ws.append({'w': t[:-5], 'cd': 0.0, 'n': 1, 'p': p, 'sps': 0.0})
    for z in zones:
        for d in (z.get('behaviors') or []) + ([z['behaviorModel']] if isinstance(z.get('behaviorModel'), dict) else []):
            if short(d) in ('DamageOverTimeModel', 'DamageOverTimeCustomModel'):
                bits = int(num(d.get('immuneBloonProperties')))
                dmg = num(d.get('damage')) * num(d.get('multiplier'), 1.0) + num(d.get('additive'))
                node = {'id': z.get('mutatorId') or 'Zone', 'pierce': 0.0,
                        'fx': [{'k': 'dot', 'dmg': dmg, 'every': num(d.get('interval')), 'imm': bits, 'type': DAMAGE_TYPES.get(bits, 'imm%d' % bits)}]}
                if z.get('filterInvisible'):
                    node['noCamo'] = True
                ws.append({'w': t[:-5], 'cd': 0.0, 'n': 1, 'p': node, 'sps': 0.0})
    if not ws:
        return None
    rng = num(b.get('range')) or num(b.get('zoneRadius'))
    camo_blocked = bool(b.get('filterInvisibleModel')) or any(short(f) == 'FilterInvisibleModel' and f.get('isActive') for f in b.get('filters') or [])
    return {'a': t[:-5], 'cond': label, 'range': rng, 'camo': not camo_blocked, 'weapons': ws}


def zone_info(b):
    """slow / shove / grow-block / camo-block zones around the tower (no damage)"""
    t = short(b)
    if t == 'SlowBloonsZoneModel':
        _, ex_, on_, _ = read_filters(b.get('filters'))
        return compact({'k': 'slowZone', 'id': b.get('mutationId'), 'speed': num(b.get('speedScale'), 1.0), 'r': num(b.get('zoneRadius')),
                        'rangeLinked': bool(b.get('bindRadiusToTowerRange')), 'excl': sorted(set(ex_)), 'only': sorted(set(on_))})
    if t == 'MoabShoveZoneModel':
        return {'k': 'moabShove', 'r': num(b.get('range')), 'moab': num(b.get('moabPushSpeedScaleCap')), 'bfb': num(b.get('bfbPushSpeedScaleCap')),
                'zomg': num(b.get('zomgPushSpeedScaleCap'))}
    if t in ('AddBehaviorToBloonInZoneModel', 'CamoBlockZoneModel', 'BountyHunterZoneModel', 'BonusCashZoneModel'):
        z = {'k': t[:-5], 'id': b.get('mutationId'), 'r': num(b.get('zoneRadius')) or num(b.get('range')),
             'rangeLinked': bool(b.get('bindRadiusToTowerRange'))}
        for bb in b.get('behaviors') or []:
            if short(bb) == 'IgnoreDmgImmunityModel':
                # bloons in the zone lose these immunities against ANY damage (Striker Jones Black, Silas White)
                z['ignoreImm'] = {'bits': int(num(bb.get('removeBloonProperties'))), 'chance': num(bb.get('chance'), 1.0)}
            elif short(bb) == 'GrowBlockModel':
                z['growBlock'] = True
        return compact(z)
    return None


def ability_summary(ab, cx):
    name = ab.get('displayName') or (ab.get('name') or '').replace('AbilityModel_', '')
    dmg = find_all(ab, lambda x: short(x) in ('DamageModel', 'DamageOverTimeModel', 'AbilityDamageAllModel') and num(x.get('damage')) > 0,
                   stop=lambda x: short(x) == 'TowerModel')
    tw = find_all(ab, lambda x: short(x) == 'TowerModel')
    out = {'name': name, 'cd': num(ab.get('cooldown'))}
    if dmg:
        out['damages'] = True
    if tw:
        out['makesTowers'] = sorted(set(t.get('baseId') or t.get('name') for t in tw))
    if ab.get('IsPassive') or ab.get('activateOnLeak') or ab.get('activateOnPreLeak'):
        out['auto'] = True
    return out


def walk_tower(m, cx, label=None):
    """-> dict with range, attacks, subTowers, abilities"""
    out = {'range': num(m.get('range'))}
    if m.get('isGlobalRange'):
        out['global'] = True
    attacks, subs, abilities, notes, zones = [], [], [], [], []
    for b in m.get('behaviors') or []:
        t = short(b)
        if t in ('AttackModel', 'AttackAirUnitModel'):
            attacks.append(attack(b, cx))
        elif t == 'AbilityModel':
            abilities.append(ability_summary(b, cx))
        elif t in SUBTOWER_HOLDERS:
            keys, via = SUBTOWER_HOLDERS[t]
            for k in keys:
                if isinstance(b.get(k), dict) and short(b[k]) == 'TowerModel':
                    ref = cx.ex.subtower(b[k], cx, via=via)
                    if t == 'DroneSupportModel':
                        ref['n'] = int(num(b.get('count'), 1))
                    if t == 'ComancheDefenceModel':
                        ref['n'] = int(num(b.get('reinforcementCount')))
                        ref['dur'] = num(b.get('durationFrames')) / 60.0
                        ref['every'] = num(b.get('cooldownFrames')) / 60.0
                        ref['maxPerRound'] = int(num(b.get('maxActivationsPerRound')))
                    subs.append(ref)
            if t == 'BeastHandlerLeashModel':  # pets that live inside the leash, not as towers
                for k in ('spawnerAttackModel', 'spawnerAttackModelSecond'):
                    pass  # spawner attacks only place the pet (no weapons)
            if t == 'EchoModel':
                notes.append('Echo (spell) duplicates the spirit')
        elif t in COND_HOLDERS:
            for a in find_all(b, lambda x: short(x) in ('AttackModel', 'AttackAirUnitModel'), stop=lambda x: short(x) in ('AbilityModel', 'TowerModel')):
                attacks.append(attack(a, cx, cond=COND_HOLDERS[t]))
            for tm in find_all(b, lambda x: short(x) == 'TowerModel', stop=lambda x: short(x) == 'AbilityModel'):
                subs.append(cx.ex.subtower(tm, cx, via=COND_HOLDERS[t]))
        elif t in ('ZephyrSenseToggleModel', 'ToggleFocusStanceModel', 'DamageBasedAttackSpeedModel', 'OverrideCamoDetectionModel',
                   'TowerExpireModel', 'TowerExpireOnParentDestroyedModel', 'TowerExpireOnParentUpgradedModel'):
            pass
        else:
            # any other behaviour hiding attacks: keep them, labelled by the behaviour
            inner = find_all(b, lambda x: short(x) in ('AttackModel', 'AttackAirUnitModel'), stop=lambda x: short(x) in ('AbilityModel', 'TowerModel'))
            for a in inner:
                attacks.append(attack(a, cx, cond=t[:-5]))
            if not inner and t in PASSIVE:
                z = passive(b, cx, PASSIVE[t])
                if z:
                    attacks.append(z)
            if not inner:
                zi = zone_info(b)
                if zi:
                    zones.append(zi)
    for b in m.get('behaviors') or []:
        t = short(b)
        if t == 'TowerExpireModel':
            out['life'] = num(b.get('lifespan'))
            if num(b.get('rounds')) > 0:
                out['lifeRounds'] = num(b.get('rounds'))
            if b.get('expireOnRoundComplete'):
                out['expiresAtRoundEnd'] = True
        elif t == 'TowerExpireOnParentDestroyedModel':
            out['diesWithParent'] = True
        elif t == 'OverrideCamoDetectionModel' and b.get('detectCamo'):
            out['camoOverride'] = True
        elif t == 'BeastHandlerPetModel':
            # pet stats grow with Beast power (merging handlers); the code applies these ranges, the attack shows base power
            out['pet'] = compact({'path': int(num(b.get('path'))), 'tier': int(num(b.get('tier'))), 'power': [num(b.get('basePower')), num(b.get('maxPower'))],
                                  'needs': int(num(b.get('requiredCount'))), 'dmgRange': num(b.get('damageRange')), 'pierceRange': num(b.get('pierceRange')),
                                  'cdScaleRange': num(b.get('cooldownScaleRange')), 'grappleDmgRange': num(b.get('damageRangeGrappleGyrfalcon')),
                                  'knockbackRange': num(b.get('thrashKnockbackLifetimeRange')), 'stunDivide': num(b.get('stunBonusDivideMicroraptor'))})
        elif t in ('ZephyrSenseToggleModel', 'ToggleFocusStanceModel', 'DamageBasedAttackSpeedModel'):
            notes.append(t[:-5])
    out['attacks'] = attacks
    if zones:
        out['zones'] = zones
    if subs:
        out['subTowers'] = subs
    if abilities:
        out['abilities'] = abilities
    if notes:
        out['notes'] = sorted(set(notes))
    return out


# ---- per-attack summaries ------------------------------------------------------------------------------------------------
def tree_nodes(p, path=()):
    """yield (node, path of triggers) for every projectile in a tree"""
    if not p:
        return
    yield p, path
    for s in p.get('subs') or []:
        yield from tree_nodes(s.get('p'), path + (s['on'],))


def eff_imm(node):
    bits = node.get('setImm', node.get('imm', 0))
    bits &= ~node.get('bypass', 0)
    ig = node.get('ignoreImm')
    if ig and ig.get('chance', 0) >= 1:
        bits &= ~ig['bits']
    return bits


def blocked(node, tags):
    """True when the node's own tag filters stop it hitting a bloon carrying these tags"""
    excl = node.get('excl') or []
    only = node.get('only') or []
    if any(t in tags for t in excl):
        return True
    return bool(only) and not any(t in tags for t in only)


def node_hit(node, tags, est=False):
    """damage one hit of this node does to one bloon carrying `tags` (game tag names, see PROPS). est=True: 0 for
    instakill placeholders (damage >= 1e6: vines, Great White, ...), which no DPS figure should contain"""
    if blocked(node, tags) or (est and node.get('instakill')) or 'dmg' not in node:
        return 0.0  # no DamageModel: bonus entries alone (Acidic Mixture buff carriers) do no damage
    d = num(node.get('dmg'))
    add, mult = 0.0, 1.0
    for b in node.get('bonus') or []:
        if 'setTo' in b:
            if any(x in tags for x in b.get('bloons') or []):
                return b['setTo']
            continue
        if 'tags' in b:
            ok = all(t in tags for t in b['tags']) if b.get('all') else any(t in tags for t in b['tags'])
            if ok:
                add += b['add']
                mult *= b['mult']
    return max(0.0, (d + add) * mult)


# property -> (bloon tags a bloon with it carries (Bloons/*.json), immunity bits it has, needs camo targeting)
PROPS = {
    'red': (('Red',), 0, False), 'lead': (('Lead',), 1, False), 'black': (('Black',), 2, False), 'white': (('White',), 4, False),
    'zebra': (('Zebra', 'Ice'), 6, False), 'purple': (('Purple',), 8, False), 'frozen': (('Red',), 16, False),
    'glass': (('Glass',), 64, False), 'ceramic': (('Ceramic',), 0, False), 'camo': (('Red', 'Camo'), 0, True),
    'camoHit': (('Red', 'Camo'), 0, 'node'),
    'fortified': (('Lead', 'Fortified'), 0, False), 'moab': (('Moab', 'Moabs'), 0, False), 'ddt': (('Ddt', 'Moabs', 'Camo'), 3, True),
    'bad': (('Bad', 'Moabs'), 0, False), 'boss': (('Moabs', 'Boss', 'Bad'), 0, False),
}
# fortified is judged on the cheapest fortified target: a Fortified Lead needs Lead damage, so test plain + moab too
SINGLE_TRIGGERS = ('contact', 'exhaust', 'expire', 'pierceUsed')


def hits_one(n, em, arc):
    """projectiles of one emission that reach a single small target (rough)"""
    if n <= 1:
        return float(n)
    if em in ('Arc', 'RandomArc', 'Random') and arc:
        return 1.0 + (n - 1) * max(0.0, 1.0 - arc / 30.0)
    if em in ('Arc', 'RandomArc', 'Random'):
        return 1.0
    return float(n)


def summarize_attack(a, zone_bits=0):
    """properties each attack can damage (and how: direct / sub / dot), plus rough rates, from the decoded tree"""
    camo = a.get('camo', False)
    rank = {'direct': 0, 'alt': 1, 'sub': 2, 'dot': 3}
    via = {}

    def mark(prop, how):
        if prop not in via or rank[how] < rank[via[prop]]:
            via[prop] = how

    def judge(node, how, dmgfn, bits, ncamo, nodecamo=None):
        for prop, (tags, pbits, needcamo) in PROPS.items():
            if prop == 'fortified':
                continue
            if needcamo == 'node':
                # camoHit: the projectile can hurt a camo bloon it touches, whether or not the attack can aim at one
                # (Spike Factory spikes, Wizard necromancer zombies)
                if not nodecamo or bits & pbits:
                    continue
            elif bits & pbits or (needcamo and not ncamo) or blocked(a, tags):
                continue
            elif prop == 'frozen' and ('FrozenBloons' in (node.get('filt') or []) or 'FrozenBloons' in (a.get('filt') or [])):
                continue  # FilterFrozenBloonsModel: Ice Monkeys can't hit bloons that are already frozen
            if dmgfn(tags) > 0:
                mark(prop, how)
        if any(p in via for p in ('red', 'lead', 'moab', 'ceramic', 'black', 'white', 'purple')):
            mark('fortified', how) if dmgfn(('Fortified', 'Red')) > 0 or dmgfn(('Fortified', 'Moab', 'Moabs')) > 0 else None
    est = {'dps1': 0.0, 'dpsMoab': 0.0, 'dpsCeramic': 0.0, 'dpsBoss': 0.0, 'hitsPerSec': 0.0}
    dots = {}
    for w in a['weapons']:
        sps = w.get('sps', 0.0)
        n = max(1, w.get('n', 1))
        one = hits_one(n, w.get('em'), w.get('arc'))
        shots = [(w.get('p'), sps, one / n)]
        if w.get('alt') and w['alt'].get('p') and w['alt'].get('every', 0) > 0:
            k = w['alt']['every']
            shots = [(w.get('p'), sps * (k - 1) / k, one / n), (w['alt']['p'], sps / k * w['alt'].get('n', 1) / n, 1.0, 'alt')]
        extras = [x.get('p') for x in ([w.get('bonusShot'), w.get('changed')]) if x] + list(w.get('swap') or [])
        shots += [(x, 0.0, 0.0, 'alt') for x in extras if x]
        for shot in shots:
            root, rate, frac = shot[:3]
            top = shot[3] if len(shot) > 3 else 'direct'
            for node, path in tree_nodes(root):
                how = 'sub' if path else top
                ncamo = camo and not node.get('noCamo')
                bits = eff_imm(node) & ~zone_bits
                nodecamo = not node.get('noCamo')
                judge(node, how, lambda tags, nd=node: node_hit(nd, tags), bits, ncamo, nodecamo)
                if node.get('ring'):
                    rg = node['ring']
                    judge(node, how, lambda tags, nd=node, rg=rg: rg['dmg'] if not blocked(nd, tags) else 0, rg['imm'], ncamo, nodecamo)
                for dt in node.get('fx') or []:
                    if dt.get('k') == 'dot' and num(dt.get('dmg')) > 0:
                        # the DoT rides on the hit: a bloon immune to the hit never gets it (Sauda's Normal bleed comes
                        # from a Shatter sword, so no Lead), unless the hit itself does no damage (Psi)
                        hb = bits if num(node.get('dmg')) > 0 else 0
                        judge(dt, 'dot', lambda tags, nd=node, dt=dt: dt['dmg'] if not blocked(nd, tags) and not blocked(dt, tags) else 0,
                              (dt['imm'] | hb) & ~zone_bits, ncamo, nodecamo)
                # rough throughput on one target: root hit + single (n==1) on-contact/exhaust/expire children
                if rate <= 0:
                    continue
                if path:
                    if any(x not in SINGLE_TRIGGERS for x in path):
                        continue
                    if not node.get('_single', True):
                        continue
                for key, tags in (('dps1', ('Red',)), ('dpsMoab', ('Moab', 'Moabs')), ('dpsCeramic', ('Ceramic',)),
                                  ('dpsBoss', ('Moabs', 'Boss', 'Bad'))):
                    if blocked(a, tags):
                        continue
                    est[key] += rate * frac * node_hit(node, tags, est=True)
                    # DoT on the same target refreshes rather than stacks: at most dmg/every per mutation
                    for dt in node.get('fx') or []:
                        if dt.get('k') != 'dot' or num(dt.get('dmg')) <= 0 or blocked(node, tags) or blocked(dt, tags):
                            continue
                        if num(node.get('dmg')) > 0 and node_hit(node, tags) <= 0:
                            continue  # the hit itself is blocked for this target
                        per_hit = dt['dmg'] * max(1, dt.get('ticks') or 1)
                        cap = dt['dmg'] / dt['every'] if num(dt.get('every')) > 0 else per_hit * rate * frac
                        dots[(key, dt.get('id'))] = max(dots.get((key, dt.get('id')), 0.0), min(per_hit * rate * frac, cap))
                if not path:
                    est['hitsPerSec'] += rate * min(1000.0, max(1.0, num(node.get('pierce'), 1.0)))
    for (key, _), v in dots.items():
        est[key] += v
    est = {k: sig(v) for k, v in est.items()}
    if est['dpsCeramic'] == est['dps1']:
        del est['dpsCeramic']
    if est['dpsBoss'] == est['dpsMoab']:
        del est['dpsBoss']
    return sorted(via), via, est


# how a sub-tower appears: these are part of the crosspath's normal play; others (templeSacrifice, transform, spell,
# spellEcho, attack:<cond>) need a sacrifice, a spell or a special state
PERMANENT_VIA = ('placed', 'pet', 'drone', 'attack', 'totem', 'reinforcement', 'projectile')


class Extractor:
    def __init__(self, gd):
        self.gd = gd
        self.subtowers = {}
        self.text = load(os.path.join(gd, 'textTable.json'))
        self._stack = []

    def subtower(self, tm, cx, via):
        name = tm.get('name') or tm.get('baseId') or '?'
        if len(self._stack) > 4 or name in self._stack:
            return {'ref': name + '#loop', 'via': via}
        self._stack.append(name)
        try:
            body = walk_tower(tm, cx)
        finally:
            self._stack.pop()
        for a in body['attacks']:
            hits, v, est = summarize_attack(a)
            a['canDamage'] = hits
            a['est'] = est
        body = compact(body)
        h = hashlib.sha1(json.dumps(body, sort_keys=True).encode()).hexdigest()[:8]
        key = '%s#%s' % (name, h)
        if key not in self.subtowers:
            rec = {'name': name, 'baseId': tm.get('baseId'), 'display': self.text.get(name) or self.text.get(tm.get('baseId') or ''),
                   'firstSeen': cx.src}
            rec.update(body)
            self.subtowers[key] = rec
        ref = {'ref': key, 'via': via}
        if body.get('pet'):
            ref['pet'] = body['pet']
        return ref

    def describe(self, m, src):
        cx = Ctx(self, src)
        # Corvus: attacks his spells switch on also sit, ungated, in the Spirit sub-tower; same name = spell-only
        cx.spell_names = set(a.get('name') for b in m.get('behaviors') or [] if short(b) in COND_HOLDERS and COND_HOLDERS[short(b)] == 'spell'
                             for a in find_all(b, lambda x: short(x) in ('AttackModel', 'AttackAirUnitModel')))
        body = walk_tower(m, cx)
        zone_bits = 0
        for z in body.get('zones') or []:
            ig = z.get('ignoreImm')
            if ig and ig.get('chance', 0) >= 1:
                zone_bits |= ig['bits']
        for a in body['attacks']:
            hits, v, est = summarize_attack(a, zone_bits)
            if zone_bits:
                a['zoneBypass'] = zone_bits
            a['canDamage'] = hits
            a['canDamageVia'] = {k: v[k] for k in sorted(v) if v[k] != 'direct'}
            a['est'] = est
        # hoist towers made by projectiles (sentries, planes, spectres, Ezili/Obyn totems...) to the record's subTowers,
        # with the spawning weapon's rate
        hoisted = []
        for a in body['attacks']:
            for w in a['weapons']:
                for node, path in tree_nodes(w.get('p')):
                    for t in node.get('towers') or []:
                        r = dict(t)
                        r['via'] = 'attack' if not a.get('cond') else 'attack:' + a['cond']
                        r['attack'] = a.get('a')
                        r['n'] = w.get('n', 1)
                        if w.get('cd'):
                            r['every'] = w['cd']
                        if w.get('perRound'):
                            r['perRound'] = w['perRound']
                        if w.get('limit'):
                            r['limit'] = w['limit']
                        if w.get('maxSubTowers'):
                            r['max'] = w['maxSubTowers']
                        if path:
                            r['from'] = '/'.join(path)
                        hoisted.append(r)
        if hoisted:
            body['subTowers'] = (body.get('subTowers') or []) + hoisted
        rec = {'src': src}
        rec.update(body)
        rec['summary'] = self.summary(rec)
        return compact(rec)

    def summary(self, rec):
        """crosspath-level union: what the tower's own normal attacks can damage, what only sub-towers add"""
        own = set()
        cond = set()
        for a in rec['attacks']:
            (cond if a.get('cond') and a.get('cond') != 'passive' else own).update(a.get('canDamage', []))
        sub = set()
        for s in rec.get('subTowers') or []:
            st = self.subtowers.get(s['ref'])
            if not st:
                continue
            permanent = s.get('via') in PERMANENT_VIA
            for a in st.get('attacks', []):
                if not a.get('cond') or a.get('cond') == 'passive':
                    (sub if permanent else cond).update(a.get('canDamage', []))
        camo_own = 'camo' in own
        out = {'canDamage': sorted(own), 'camoTargeting': camo_own}
        extra_sub = sorted(sub - own)
        if extra_sub:
            out['onlyViaSubTowers'] = extra_sub
        extra_cond = sorted(cond - own - sub)
        if extra_cond:
            out['onlyViaConditional'] = extra_cond
        for a in rec['attacks']:
            if a.get('cond') and a.get('cond') != 'passive':
                continue
            for w in a['weapons']:
                for node, _ in tree_nodes(w.get('p')):
                    for f in node.get('fx') or []:
                        if f.get('k') == 'strip':
                            for what in f.get('what') or []:
                                out.setdefault('strips', [])
                                if what not in out['strips']:
                                    out['strips'].append(what)
        if out.get('strips'):
            out['strips'].sort()
        abil = [a['name'] for a in rec.get('abilities') or [] if a.get('damages') or a.get('makesTowers')]
        if abil:
            out['abilityAttacks'] = abil
        return out


ALL_PROPS = sorted(PROPS)


def to_cannot(out):
    """store the (short) complement: cannot = properties of PROPS the attack can't damage; noDamage when it can't damage anything"""
    def conv(d):
        can = d.pop('canDamage', [])
        if not can:
            d['noDamage'] = True
        else:
            d['cannot'] = [p for p in ALL_PROPS if p not in can]

    def recs():
        for t in out['towers'].values():
            yield from t['crosspaths'].values()
        for h in out['heroes'].values():
            yield from h['levels'].values()
        yield from out['subTowers'].values()
    for r in recs():
        for a in r.get('attacks') or []:
            conv(a)
        if 'src' in r:
            r.setdefault('summary', {})
            conv(r['summary'])


def dedupe_attacks(out):
    """move every attack into one table; records keep a list of keys. Identical attacks (same numbers, same name)
    across crosspaths share a key. Key = '<file folder>/<attack name>#<8 hex of its content>'."""
    table = {}

    def recs():
        for t in out['towers'].values():
            for c in t['crosspaths'].values():
                yield c
        for h in out['heroes'].values():
            for c in h['levels'].values():
                yield c
        for s in out['subTowers'].values():
            yield s
    for r in recs():
        src = r.get('src') or r.get('firstSeen') or ''
        folder = src.split('/')[1] if src.count('/') >= 2 else (r.get('name') or '?')
        if r.get('firstSeen'):
            folder = r.get('name') or folder
        keys = []
        for a in r.get('attacks') or []:
            blob = json.dumps(a, sort_keys=True, separators=(',', ':'))
            h = hashlib.sha1(blob.encode()).hexdigest()[:8]
            k = '%s/%s#%s' % (folder, a.get('a') or 'Attack', h)
            existing = [x for x in table if x.endswith('#' + h) and table[x] == a]
            if existing:
                k = existing[0]
            table.setdefault(k, a)
            keys.append(k)
        if 'attacks' in r:
            r['attacks'] = keys
    return {k: table[k] for k in sorted(table)}


def crosspaths():
    out = []
    for a in range(6):
        for b in range(6):
            for c in range(6):
                x = [a, b, c]
                if sum(1 for v in x if v) <= 2 and sorted(x)[1] <= 2:
                    out.append('%d%d%d' % (a, b, c))
    return out


def upgrades_for(ex, folder):
    """[[{name, display, cost, xp} x5] x3] from the single-path files and Upgrades/<name>.json"""
    paths = []
    for p in range(3):
        code = ['0', '0', '0']
        code[p] = '5'
        f = os.path.join(ex.gd, 'Towers', folder, '%s-%s.json' % (folder, ''.join(code)))
        m = load(f)
        names = m.get('appliedUpgrades') or []
        row = []
        for nm in names:
            uf = os.path.join(ex.gd, 'Upgrades', nm + '.json')
            if not os.path.exists(uf):  # the exporter drops characters a file name can't hold (':')
                uf = os.path.join(ex.gd, 'Upgrades', nm.replace(':', '') + '.json')
            u = load(uf) if os.path.exists(uf) else {}
            if not u:
                print('no upgrade file for', nm, file=sys.stderr)
            row.append({'id': nm, 'name': (u.get('localizedNameOverride') or ex.text.get(nm) or nm), 'cost': u.get('cost'),
                        'xp': u.get('xpCost'), 'tier': int(num(u.get('tier'), -1)) + 1, 'path': u.get('path')})
        row.sort(key=lambda r: r['tier'])
        paths.append(row)
    return paths


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--gd', default='/home/claude/gd/g')
    ap.add_argument('--out', default=os.path.join(REPO, 'data', 'game', 'towers.json'))
    args = ap.parse_args()
    gd = os.path.abspath(args.gd)
    ex = Extractor(gd)
    rel = lambda f: os.path.relpath(f, gd)
    out = {'_meta': {
        'source': 'https://github.com/Btd6ModHelper/btd6-game-data (BTD Mod Helper "Export Game Data")', 'gameVersion': GAME_VERSION,
        'generator': 'tools/game/extract_towers.py', 'units': 'distances in game units (a Red moves 25/s), times in seconds',
        'immunityBits': {str(b): n for b, n in BITS},
        'damageTypes': {DAMAGE_TYPES[k]: {'bits': k, 'cantDamage': imm_names(k)} for k in sorted(DAMAGE_TYPES)},
        'schema': {
            'tower': 'name, folder, baseCost, upgrades[path][tier]={id,name,cost,xp}, crosspaths{abc: crosspath}',
            'hero': 'name, folder, baseCost, levels{n: crosspath}',
            'crosspath': 'src, range, global?, attacks[], subTowers[{ref, via, n?, ...}], abilities[{name, cd, damages?, makesTowers?}], summary',
            'summary': 'cannot (properties the own non-conditional attacks cannot damage; noDamage if none), camoTargeting, onlyViaSubTowers '
                       '(properties only sub-towers add), onlyViaConditional, abilityAttacks (abilities that damage or make towers)',
            'properties': 'red lead black white zebra purple frozen glass ceramic camo camoHit fortified moab ddt bad boss: a property counts when some '
                          'damaging node of the attack has dmg+bonus>0 for a bloon with those game tags, its immunity bits allow it, no tag '
                          'filter stops it, and (camo, ddt) the attack and node can target camo; camoHit = the node can hurt camo it touches '
                          'even if the attack cannot aim at camo (spikes on the track). summary.strips = camo/regen/fortified/lead removal',
            'attack': 'a (name), range, air?, cond? (submerged|graveyard|templeSacrifice|spell|transform|...), camo (can target camo), '
                      'targets (priorities; * = camo-first variant), excl/only (bloon tags filtered), weapons[], cannot/noDamage, canDamageVia (sub|dot when not direct), est',
            'weapon': 'w, cd (cooldown s), n (projectiles per shot), em (emission kind), arc (spread deg), burst{n,gap}, alt{every,n,p} '
                      '(every Nth shot is p instead), triggers/firedBy/pairedWith (secondary fires when its partner fires), crit{dmg,every}, '
                      'perRound, limit, minCd, mods (rate modifiers), cond, p (projectile), sps (projectiles/s = n*burst/cd, or partner cd)',
            'projectile': 'id, dmg, type, imm (bits it cannot damage), pierce, r (radius), life, speed, move, noCamo, excl/only, '
                          'bonus[{tags|states|bloons, add, mult, all?} | {bloons, setTo}], bypass (bits ignored), ignoreImm{bits,chance}, setImm, '
                          'fx[{k: dot|slow|stun|freeze|knockback|blowback|push|maim|strip|cash|tag|...}], rehitEvery, refreshPierceEvery, bounces, '
                          'chain{splits,range}, subs[{on: contact|exhaust|expire|interval|pierceUsed|damage|pop|galvanized..., n, every?, p}], '
                          'towers[sub-tower refs], special[behaviours not modelled numerically]',
            'est': 'ROUGH per-attack rates on ONE target: dps1/dpsMoab/dpsCeramic/dpsBoss = projectiles/s that reach it (spread shots: '
                   '1 + (n-1)(1 - arc/30)) x damage of one hit (root + single on-contact/exhaust/expire/pierce children; fragment '
                   'spreads excluded) + DoT capped at dmg/every per mutation (re-application refreshes, it does not stack). '
                   'hitsPerSec = projectiles/s x pierce (pierce capped at 1000). No buffs, crits, rehits, instakills (dmg>=1e6), '
                   'sub-towers or code-driven pets\' power scaling. dpsCeramic/dpsBoss omitted when equal to dps1/dpsMoab.',
            'subTower': 'name, baseId, display, firstSeen (file), range, life, lifeRounds, diesWithParent, pet, attacks[], subTowers, abilities',
        },
        'notes': [
            'Immunity bits verified against Bloons/*.json bloonProperties: Lead 1, Black 2, White 4, Zebra 6, DDT 3, Purple 8, Glass 64; '
            'Frozen 16 = the bit Sharp (17) adds over Shatter (1). Camo is not a damage bit: it is FilterInvisibleModel(isActive) targeting.',
            'Attacks inside AbilityModel are not decoded; abilities are listed by name with damages/makesTowers flags.',
            'A projectile can carry its own noCamo: an attack that sees camo whose projectile has FilterInvisible still cannot hit camo.',
            'cannot/canDamageVia count direct damage, sub-projectiles and DoT; canDamageVia marks properties reached only via sub-projectiles (sub) or DoT.',
            'Records hold attack keys; the attack bodies are in the top-level attacks table (identical attacks are shared).',
            'Paragons are skipped.',
        ],
    }, 'towers': {}, 'heroes': {}, 'subTowers': {}}
    for tid, folder in TOWERS.items():
        base = os.path.join(gd, 'Towers', folder, folder + '.json')
        m0 = load(base)
        rec = {'name': ex.text.get(folder) or folder, 'folder': folder, 'baseCost': m0.get('cost'), 'upgrades': upgrades_for(ex, folder),
               'crosspaths': {}}
        for code in crosspaths():
            f = base if code == '000' else os.path.join(gd, 'Towers', folder, '%s-%s.json' % (folder, code))
            if not os.path.exists(f):
                print('missing', f, file=sys.stderr)
                continue
            rec['crosspaths'][code] = ex.describe(load(f), rel(f))
        out['towers'][tid] = rec
        print('%-10s %2d crosspaths' % (tid, len(rec['crosspaths'])))
    for hid, folder in HEROES.items():
        m1 = load(os.path.join(gd, 'Towers', folder, folder + '.json'))
        rec = {'name': ex.text.get(folder) or folder, 'folder': folder, 'baseCost': m1.get('cost'), 'levels': {}}
        for n in range(1, 21):
            f = os.path.join(gd, 'Towers', folder, folder + ('' if n == 1 else ' %d' % n) + '.json')
            if os.path.exists(f):
                rec['levels'][str(n)] = ex.describe(load(f), rel(f))
        out['heroes'][hid] = rec
        print('%-10s %2d levels' % (hid, len(rec['levels'])))
    out['subTowers'] = {k: ex.subtowers[k] for k in sorted(ex.subtowers)}
    print('%d distinct sub-tower models' % len(out['subTowers']))
    to_cannot(out)
    out['attacks'] = dedupe_attacks(out)
    print('%d distinct attacks' % len(out['attacks']))
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'), sort_keys=True, ensure_ascii=False)
    print('wrote', args.out, os.path.getsize(args.out) // 1024, 'KB')


if __name__ == '__main__':
    main()
