"""Extract abilities and tower-to-tower buffs from the BTD6 game-data export into data/game/support.json.

    python3 tools/game/extract_support.py [--gd /home/claude/gd/g] [--out data/game/support.json]

Input: a checkout of https://github.com/Btd6ModHelper/btd6-game-data (game v56.0, BTD Mod Helper "Export Game Data").
Data (c) Ninja Kiwi; used for a fan tool. Python 3 stdlib only; the output is deterministic (sorted, rounded).

What is walked
  * every main tower crosspath the game allows (Towers/<T>/<T>-ABC.json) plus <T>-Paragon.json,
  * every hero level (Towers/<H>/<H>.json = level 1, "<H> <n>.json"); skins (other file stems) are skipped,
  * GeraldoItems/*.json (Geraldo's shop) and Buffs/*.json (buff indicator models).
Inside a tower model the walker goes everywhere (attacks, projectiles, abilities, sub-towers such as the Drone, UAV,
Trance Totem, Spirit) and records two kinds of thing:
  * abilities: every AbilityModel (cooldown, trigger, unlock, and its behaviours summarised in numbers),
  * buffs: every model that changes OTHER towers (support models, support zones, brews, temple mutators, income
    and discount models, Corvus spells, Overclock ...), with the radius it reaches and the towers it accepts.
Identical records across crosspaths / levels are merged: each record lists where it appears ("in") and the first
file it was read from ("src"), so it can be traced back to the game file.
"""
import argparse
import glob
import json
import math
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

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
# TowerModel.towerSet bit flags (checked: Dart 1, Sniper 2, Wizard 4, Village 8, heroes 16)
TOWER_SETS = {1: 'Primary', 2: 'Military', 4: 'Magic', 8: 'Support', 16: 'Hero'}
# DamageModel.immuneBloonProperties bit flags (BloonProperties enum)
IMMUNE = [(1, 'lead'), (2, 'black'), (4, 'white'), (8, 'purple'), (16, 'frozen')]
# PlaceableArea / areaTypes: 0 land, 1 water (FilterTowerByPlaceableAreaModel areaTypes [1] = water towers)
AREAS = {0: 'land', 1: 'water', 2: 'track', 3: 'unplaceable', 4: 'ice'}

NOISE = re.compile(r'(Sound|Effect(?!Zone)|Display|Audio|Sprite|Prefab|Animation|Icon(?!Per)|Footprint|ApplyMod|TargetType|UpgradePath|'
                   r'Vector|Curve|Rotate|Eject|Orbit|ScaleProjectile|Blink|Shake|Overlay|Asset|Spin|Tint|Colou?r|Camera|Particle|Emote)')
# model classes that change other towers (or the player's cash/lives on behalf of other towers)
BUFF_EXACT = {
    'DiscountZoneModel', 'CallToArmsModel', 'MonkeyTempleModel', 'TempleTowerMutatorGroupTierOneModel', 'TempleTowerMutatorGroupTierTwoModel',
    'PerRoundCashBonusTowerModel', 'CashIncreaseModel', 'MonkeyCityModel', 'BonusLivesPerRoundModel', 'OverclockModel', 'OverclockPermanentModel',
    'AddBerserkerBrewToProjectileModel', 'AddAcidicMixtureToProjectileModel', 'HeatItUpDamageBuffModel', 'MonkeyFanClubModel',
    'CashPerTowerInRangeModel', 'BonusLivesOnAbilityModel', 'BiohackModel', 'StartOfRoundRateBuffModel', 'FlagshipAttackSpeedIncreaseModel',
    'TradeEmpireBuffModel', 'BananaCentralBuffModel', 'CentralMarketBuffModel', 'DruidOfWrathBuffModel', 'ObynBuffModel', 'ColdChainBuffModel',
    'TowerRangeDamageBuffModel', 'WintersMercyTowerBuffModel', 'PrinceOfDarknessZombieBuffModel', 'GroundZeroBombBuffModel',
    'BrickellFreezeMinesAbilityBuffModel', 'BuffBlowbackZoneModel', 'BloodSacrificeModel', 'SyphonFundingModel', 'ImfLoanModel',
    'SupportStackingRangeModel', 'BananaFarmerCamoBananasModel', 'CashbackZoneModel', 'DruidVengeanceEffectModel',
    'GenericTowerBehaviorBuffModel', 'ParagonSacrificeBonusModel', 'DamageUpModel', 'IncreaseRangeModel', 'MonkeyopolisModel',
    'AddBehaviorToBloonInZoneModel', 'PierceUpTowersModel', 'BeastHandlerPetModel', 'SlowBloonsZoneModel', 'CamoBlockZoneModel', 'BountyHunterZoneModel', 'BonusCashZoneModel',
}
BUFF_RE = re.compile(r'(Support\w*Model$|^Activate\w+SupportZoneModel$|^Add\w*ToTower\w*Model$|TowerMutatorModel$)')
SKIP_BUFF = {'PyrotechnicsSupportFilterModel', 'CanBuffIndicatorModel', 'DrawSubtowerRangeCircleModel'}
# fields that never carry gameplay numbers
DROP = {'name', 'buffIconName', 'showBuffIcon', 'onlyShowBuffIfMutated', 'animation', 'animationOffset', 'animationOffsetFrames',
        'dontShowStacked', 'animateOnMainAttackDisplay', 'alwaysSetAnimationState', 'hideAbilityIfInCooldown', 'enabled', 'modelName',
        'corvusAnimationState', 'spiritAnimationState', 'textLifespan', 'heroOverlapYAdjustment', 'upgradeAnimation', 'icon', 'buffDisplayModel',
        'collisionPass', 'overlayType', 'countGlueAchievement', 'id', 'scale', 'ejectX', 'ejectY', 'ejectZ', 'cantbePaused', 'displayPath',
        'mutatorsToRemoveList', 'ignoreWithMutatorsList', 'bannedForModesList', 'createPopEffect', 'immuneBloonPropertiesOriginal',
        'dontUseCollisionChecker', 'collisionPasses', 'canCollideWithBloons', 'ignoreBlockers', 'hasDamageModifiers', 'priority',
        'mutatorPriority', 'curveSamples', 'samples', 'path', 'distributeToChildren', 'reapplyOnUpgrade', 'ignoreMutationsByOrder',
        'mutatorsToRemove', 'spawnMarkerStartsX', 'spawnMarkerStartsY', 'spawnMarkerEndsX', 'spawnMarkerEndsY', 'spawnIndexRotation',
        'spawnAnimState', 'helperMessageLocsKey', 'helperMessageInvalidLocsKey', 'createDroneUpgradeEffect', 'SpellCategory',
        'assetSizeModifier', 'spriteRadius', 'displayRadius'}


def short(o):
    return o.get('$type', '').split(',')[0].split('.')[-1] if isinstance(o, dict) else ''


def r4(v):
    """round a number to 4 significant digits; ints stay ints"""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return v
    if isinstance(v, int) or (isinstance(v, float) and v.is_integer() and abs(v) < 1e15):
        return int(v)
    if v == 0 or not math.isfinite(v):
        return 0
    d = 4 - int(math.floor(math.log10(abs(v)))) - 1
    x = round(v, d)
    return int(x) if float(x).is_integer() else x


def num(v, d=0.0):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else d


def big(v):
    return num(v) >= 9e5


def immune(bits):
    bits = int(num(bits))
    return [n for b, n in IMMUNE if bits & b]


def filt(fs):
    """summarise a filters list (tower filters on supports, bloon filters on attacks)"""
    out = {}
    for f in fs or []:
        t = short(f)
        if t == 'FilterInSetModel':
            out['sets'] = sorted({TOWER_SETS.get(int(s), str(s)) for s in (f.get('towerSets') or [f.get('towerSet')]) if s is not None})
        elif t in ('FilterInBaseTowerIdModel', 'FilterInTowerIdModel'):
            out.setdefault('ids', []).extend(f.get('baseIds') or f.get('towerIds') or [])
        elif t == 'FilterOutBaseTowerIdModel' or t == 'FilterOutTowerIdModel':
            out.setdefault('notIds', []).extend(f.get('baseIds') or f.get('towerIds') or [])
        elif t == 'FilterTowerByPlaceableAreaModel':
            out['area'] = [AREAS.get(int(a), str(a)) for a in f.get('areaTypes') or []]
            if f.get('exclusive'):
                out['areaExclusive'] = True
        elif t == 'FilterInvisibleModel':
            if f.get('isActive'):
                out['noCamo'] = True
        elif t == 'FilterOutTagModel':
            out.setdefault('notTags', []).append(f.get('tag'))
        elif t in ('FilterWithTagModel', 'FilterWithTagsModel', 'FilterMoabModel'):
            out.setdefault('onlyTags', []).extend(f.get('tags') or [f.get('tag') or 'Moabs'])
        elif t == 'FilterInOwnedByModel':
            out['ownOnly'] = True
        elif t == 'FilterInTowerTiersModel':
            # towers whose crosspath sits inside these per-path tier bounds (path1 = top)
            tb = {}
            for i in (1, 2, 3):
                lo, hi = int(num(f.get('path%dMinTier' % i))), num(f.get('path%dMaxTier' % i))
                if lo > 0 or hi < 9e5:
                    tb['p%d' % i] = [lo, 'max' if hi >= 9e5 else int(hi)]
            out['tiers'] = tb
        elif t and not NOISE.search(t) and t not in ('FilterOutOffscreenModel', 'FilterAllExceptTargetModel', 'FilterBadImmunityModel',
                                                       'FilterBloonIfDamageTypeModel'):
            out.setdefault('other', []).append(t.replace('Model', ''))
    for k in ('ids', 'notIds', 'notTags', 'onlyTags', 'other'):
        if k in out:
            out[k] = sorted(set(str(x) for x in out[k] if x is not None))
    return out


def proj(p, depth=0):
    """compact summary of a ProjectileModel: what one projectile does to bloons"""
    o = {}
    pierce = num(p.get('pierce'))
    o['pierce'] = 'inf' if big(pierce) else r4(pierce)
    if num(p.get('radius')):
        o['radius'] = r4(num(p.get('radius')))
    f = filt(p.get('filters'))
    if f.get('noCamo'):
        o['noCamo'] = True
    if f.get('notTags'):
        o['notTags'] = f['notTags']
    if f.get('onlyTags'):
        o['onlyTags'] = f['onlyTags']
    other = []
    for b in p.get('behaviors') or []:
        t = short(b)
        if not t or NOISE.search(t):
            continue
        if t == 'DamageModel':
            d = num(b.get('damage'))
            o['dmg'] = 'inf' if big(d) else r4(o.get('dmg', 0) + d if isinstance(o.get('dmg'), (int, float)) else d)
            o['immune'] = immune(b.get('immuneBloonProperties'))
        elif t == 'DamageModifierForTagModel':
            tag = ','.join(b.get('tags') or [str(b.get('tag'))])
            m = {}
            if num(b.get('damageAddative')):
                m['add'] = r4(num(b.get('damageAddative')))
            if num(b.get('damageMultiplier'), 1) != 1:
                m['mult'] = r4(num(b.get('damageMultiplier'), 1))
            if m:
                o.setdefault('bonus', {})[tag] = m
        elif t in ('AgeModel', 'TravelStraitModel', 'TrackTargetModel', 'ArriveAtTargetModel'):
            if num(b.get('lifespan')) and not big(b.get('lifespan')):
                o['life'] = r4(max(num(o.get('life')), num(b.get('lifespan'))))
        elif t == 'AddBehaviorToBloonModel':
            for bb in b.get('behaviors') or []:
                tb = short(bb)
                if tb == 'DamageOverTimeModel':
                    o['dot'] = {'dmg': r4(num(bb.get('damage'))), 'every': r4(num(bb.get('interval'))), 'for': r4(num(b.get('lifespan')))}
            other.append(t.replace('Model', '') + ':' + str(b.get('mutationId') or ''))
        elif t == 'SlowModel':
            o['slow'] = {'mult': r4(num(b.get('multiplier'))), 'for': r4(num(b.get('lifespan'))), 'layers': r4(num(b.get('layers')))}
        elif t in ('FreezeModel',):
            o['freeze'] = {'for': r4(num(b.get('lifespan'))), 'layers': r4(num(b.get('layers')))}
        elif 'Stun' in t:
            o['stun'] = {'for': r4(num(b.get('lifespan') or b.get('duration')))}
        elif t == 'CashModel':
            o['cash'] = [r4(num(b.get('minimum'))), r4(num(b.get('maximum')))]
        elif t.startswith('CreateProjectileOn') and isinstance(b.get('projectile'), dict) and depth < 2:
            em = b.get('emission') or {}
            cnt = next((num(em.get(k)) for k in ('count', 'projectileCount', 'Count') if num(em.get(k)) > 0), 1)
            o.setdefault('subs', []).append({'on': t.replace('CreateProjectileOn', '').replace('Model', ''), 'n': r4(cnt), 'p': proj(b['projectile'], depth + 1)})
        elif t not in ('ProjectileFilterModel', 'InstantModel', 'CollideOnlyWithTargetModel', 'DestroyIfTargetLostModel'):
            other.append(t.replace('Model', ''))
    if other:
        o['beh'] = sorted(set(other))
    return o


def attack(a):
    """compact summary of an AttackModel inside an ability or a temple mutator"""
    o = {'range': 'global' if big(a.get('range')) else r4(num(a.get('range')))}
    if any(short(b) == 'UseTowerRangeModel' for b in a.get('behaviors') or []):
        o['range'] = 'tower'
    ws = []
    for w in a.get('weapons') or []:
        if not isinstance(w, dict):
            continue
        em = w.get('emission') or {}
        cnt = next((num(em.get(k)) for k in ('count', 'projectileCount', 'Count', 'amount') if num(em.get(k)) > 0), 1)
        x = {'rate': 'once' if num(w.get('rate')) >= 9999 else r4(num(w.get('rate'))), 'n': r4(cnt)}
        if isinstance(w.get('projectile'), dict):
            x['p'] = proj(w['projectile'])
        ws.append(x)
    o['w'] = ws
    af = {}
    for b in a.get('behaviors') or []:
        if short(b) == 'AttackFilterModel':
            af = filt(b.get('filters'))
    if af.get('noCamo'):
        o['noCamo'] = True
    return o


def summ(o, depth=0):
    """generic compact summary of a model: its numbers, flags and nested models, display noise removed"""
    if isinstance(o, list):
        if all(not isinstance(x, (dict, list)) for x in o):
            return [r4(x) for x in o] if len(o) <= 12 else None
        out = [summ(x, depth + 1) for x in o]
        out = [x for x in out if x not in (None, {}, [])]
        return out or None
    if not isinstance(o, dict):
        return r4(o)
    t = short(o)
    if t and NOISE.search(t):
        return None
    if t == 'TowerModel':
        return {'$': 'TowerModel', 'tower': o.get('baseId') or o.get('name'), 'range': r4(num(o.get('range')))}
    if t in ('AttackModel', 'AttackAirUnitModel'):
        return attack(o)
    if t == 'ProjectileModel':
        return proj(o)
    if depth > 5:
        return {'$': t} if t else None
    r = {}
    if t:
        r['$'] = t
    for k, v in o.items():
        if k == '$type' or k in DROP or (k[:1].isupper()) or v is None or v is False or v == '' or v == [] or v == {}:
            continue
        if k == 'filters':
            fv = filt(v)
            if fv:
                r['who'] = fv
            continue
        if k in ('immuneBloonProperties', 'ifCantHitBloonProperties'):
            r[k] = immune(v)
            continue
        if isinstance(v, (int, float)) and not isinstance(v, bool) and v == 0:
            continue
        s = summ(v, depth + 1)
        if s in (None, {}, []):
            continue
        r[k] = s
    return r


def frames(m, k):
    v = num(m.get(k))
    if v <= 0 or big(v):
        v = num(m.get(k + 'Frames')) / 60.0
    return r4(v) if 0 < v < 9e5 else None


def normalize(t, m):
    """engine-ready reading of the common buff models: stat, operation, value, duration, stacking.
    rate 'cd' = multiplier on the attack cooldown (0.85 -> 1/0.85 = 1.176x attacks); range 'pct' = +fraction; 'add' = flat."""
    n = {}
    dur = frames(m, 'lifespan')
    if t in ('RateSupportModel', 'RateSupportExplosiveModel'):
        n = {'stat': 'rate', 'cd': r4(num(m.get('multiplier')))}
    elif t == 'ActivateRateSupportZoneModel':
        n = {'stat': 'rate', 'cd': r4(num(m.get('rateModifier')))}
    elif t == 'SupportShinobiTacticsModel':
        n = {'stat': 'rate', 'cd': r4(num(m.get('multiplier'))), 'perStack': True}
    elif t == 'FlagshipAttackSpeedIncreaseModel':
        n = {'stat': 'rate', 'cd': r4(num(m.get('attackSpeedIncrease')))}
    elif t == 'PoplustSupportModel':
        n = {'stat': 'rate+pierce', 'pct': r4(num(m.get('ratePercentIncrease'))), 'piercePct': r4(num(m.get('piercePercentIncrease'))), 'perStack': True}
    elif t in ('RangeSupportModel',):
        n = {'stat': 'range'}
        if num(m.get('multiplier')):
            n['pct'] = r4(num(m.get('multiplier')))
        if num(m.get('additive')):
            n['add'] = r4(num(m.get('additive')))
    elif t == 'ActivateRangeSupportZoneModel':
        n = {'stat': 'range', 'add': r4(num(m.get('additive')))}
    elif t == 'SupportStackingRangeModel':
        n = {'stat': 'range', 'pct': r4(num(m.get('rangeMultiplier'))), 'perStack': True}
    elif t == 'PierceSupportModel':
        n = {'stat': 'pierce', 'add': r4(num(m.get('pierce')))}
    elif t == 'ActivatePierceSupportZoneModel':
        n = {'stat': 'pierce', 'add': r4(num(m.get('pierceIncrease')))}
    elif t == 'PierceUpTowersModel':
        n = {'stat': 'pierce', 'add': r4(num(m.get('increase')))}
    elif t == 'PiercePercentageSupportModel':
        n = {'stat': 'pierce', 'mult': r4(num(m.get('percentIncrease')))}
    elif t == 'ActivateTowerDamageSupportZoneModel':
        n = {'stat': 'damage', 'add': r4(num(m.get('damageIncrease')))}
        if m.get('replaceImmuneBloonProperties'):
            n['immune'] = immune(m.get('immuneBloonProperties'))
    elif t == 'DamageSupportModel':
        n = {'stat': 'damage', 'add': r4(num(m.get('increase')))}
    elif t in ('DamageModifierSupportModel', 'ActivateDamageModifierSupportZoneModel'):
        dm = m.get('damageModifierModel') or {}
        n = {'stat': 'tagDamage', 'tag': ','.join(dm.get('tags') or [str(dm.get('tag'))]), 'add': r4(num(dm.get('damageAddative')))}
    elif t in ('VisibilitySupportModel', 'ActivateVisibilitySupportZoneModel'):
        n = {'stat': 'camo'}
    elif t == 'DamageTypeSupportModel':
        n = {'stat': 'damageType', 'immune': immune(m.get('immuneBloonProperties'))}
    elif t == 'AddBerserkerBrewToProjectileModel':
        perma = num(m.get('lifespan')) < 0
        n = {'stat': 'brew', 'damage': r4(num(m.get('damageUp'))), 'pierce': r4(num(m.get('pierceUp'))),
             'cd': r4(1 - num(m.get('rateUp'))), 'rangePct': r4(num(m.get('rangeUp')))}
        if perma:
            n['permanent'] = True
        else:
            n['shots'] = r4(num(m.get('cap')))
            dur = r4(num(m.get('lifespan')))
            n['rebuffBlock'] = r4(num(m.get('rebuffBlockTime')))
        n['notIds'] = sorted(set(str(m.get('ignoreList') or '').split(',')) - {''})
    elif t == 'AddAcidicMixtureToProjectileModel':
        chk = next((b for b in m.get('towerBehaviors') or [] if short(b) == 'AcidicMixtureCheckModel'), {})
        n = {'stat': 'acid', 'shotsPerDip': r4(num(chk.get('maxCount'))), 'shotCap': r4(num(m.get('cap'))), 'grants': ['lead']}
        bonus = {}
        for b in m.get('projBehaviors') or []:
            if short(b) == 'DamageModifierForTagModel':
                bonus[','.join(b.get('tags') or [])] = r4(num(b.get('damageAddative')))
        n['bonus'] = bonus
        n['notIds'] = sorted(set(str(m.get('ignoreList') or '').split(',')) - {''})
        if big(chk.get('maxCount')):
            n['permanent'] = True
    elif t in ('OverclockModel', 'OverclockPermanentModel'):
        n = {'stat': 'rate', 'cd': r4(num(m.get('rateModifier'))), 'target': 'one tower'}
        if t == 'OverclockPermanentModel':
            n['perStack'] = True
            n['stacks'] = r4(num(m.get('maxStacks')))
        if m.get('tierBasedDurationMultiplier'):
            n['durByTargetTier'] = [r4(x) for x in m['tierBasedDurationMultiplier']]
        dur = dur or frames(m, 'lifespan')
    elif t == 'CallToArmsModel':
        n = {'stat': 'rate+pierce', 'mult': r4(num(m.get('multiplier')))}
    elif t == 'AbilityCooldownScaleSupportModel':
        n = {'stat': 'abilityCooldown', 'speed': r4(num(m.get('abilityCooldownSpeedScale')))}
    elif t in ('ProjectileSpeedSupportModel',):
        n = {'stat': 'projectileSpeed', 'pct': r4(num(m.get('multiplier')))}
    elif t in ('ProjectileRadiusSupportModel',):
        n = {'stat': 'projectileRadius', 'mult': r4(num(m.get('multiplier')))}
    elif t == 'DiscountZoneModel':
        n = {'stat': 'discount', 'pct': r4(num(m.get('discountMultiplier'))), 'stacks': r4(num(m.get('stackLimit'))), 'maxTier': r4(num(m.get('tierCap')))}
    elif t == 'MonkeyCityIncomeSupportModel':
        n = {'stat': 'income', 'mult': r4(num(m.get('incomeModifier')))}
    elif t == 'FreezeDurationSupportModel':
        n = {'stat': 'freezeDuration', 'mult': r4(num(m.get('multiplier')))}
    elif t == 'SubCommanderSupportModel':
        n = {'stat': 'damage+pierce', 'damageMult': r4(num(m.get('damageScale'))), 'pierceAdd': r4(num(m.get('pierceIncrease')))}
    elif t == 'TradeEmpireBuffModel':
        n = {'stat': 'damage', 'add': r4(num(m.get('damageBuff'))), 'moab': r4(num(m.get('moabDamageBuff'))), 'ceramic': r4(num(m.get('ceramicDamageBuff')))}
    elif t == 'AddBehaviorToBloonInZoneModel':
        for b in m.get('behaviors') or []:
            if short(b) == 'IgnoreDmgImmunityModel':
                n = {'stat': 'bloonLosesImmunity', 'immune': immune(b.get('removeBloonProperties')), 'chance': r4(num(b.get('chance')))}
            elif short(b) == 'GrowBlockModel':
                n = {'stat': 'degrow'}
    if not n:
        return None
    if dur and dur > 0:
        n['dur'] = dur
    if num(m.get('maxStacks')) > 1 and 'stacks' not in n:
        n['stacks'] = r4(num(m.get('maxStacks')))
    return n


def find_files(gd, folder, hero):
    base = os.path.join(gd, 'Towers', folder)
    out = []
    if hero:
        for n in range(1, 21):
            f = os.path.join(base, folder + ('' if n == 1 else ' ' + str(n)) + '.json')
            if os.path.exists(f):
                out.append((str(n), f))
        return out
    for a in range(6):
        for b in range(6):
            for c in range(6):
                x = [a, b, c]
                if len([v for v in x if v]) > 2 or sorted(x)[1] > 2:
                    continue
                code = '%d%d%d' % (a, b, c)
                f = os.path.join(base, folder + ('' if code == '000' else '-' + code) + '.json')
                if os.path.exists(f):
                    out.append((code, f))
    f = os.path.join(base, folder + '-Paragon.json')
    if os.path.exists(f):
        out.append(('Paragon', f))
    return out


class Walker:
    """collects abilities and buffs from one tower model"""

    def __init__(self, upgrades, root_range):
        self.upgrades = upgrades
        self.root_range = root_range
        self.abilities = []
        self.buffs = []

    def radius(self, m, owner_range, ctx_range, in_sub=False):
        r = self._radius(m, owner_range, ctx_range)
        return 'tower' if r == r4(self.root_range) and not in_sub else r

    def _radius(self, m, owner_range, ctx_range):
        if m.get('isGlobal') or m.get('isGlobalRange') or big(m.get('customRadius')) or big(m.get('range')) and not m.get('useTowerRange'):
            return 'global'
        if m.get('isCustomRadius') and num(m.get('customRadius')) > 0:
            return r4(num(m.get('customRadius')))
        if m.get('useTowerRange'):
            return r4(owner_range)
        if ctx_range is not None:
            return ctx_range
        if num(m.get('range')) > 0:
            return r4(num(m.get('range')))
        return r4(owner_range)

    def ability(self, a, ctx, owner_range):
        x = {'name': a.get('displayName') or a.get('modelName'), 'model': a.get('modelName')}
        cd = num(a.get('cooldown'))
        if not cd and num(a.get('cooldownFrames')):
            cd = num(a.get('cooldownFrames')) / 60.0
        x['cd'] = r4(cd)
        trig = []
        for k, lab in (('activateOnPreLeak', 'preLeak'), ('activateOnLeak', 'leak'), ('activateOnLivesLost', 'livesLost'),
                       ('activateOnRoundEnd', 'roundEnd'), ('IsPassive', 'passive'), ('isHidden', 'hidden')):
            if a.get(k):
                trig.append(lab)
        for b in a.get('behaviors') or []:
            if short(b) == 'ActivateAbilityAfterIntervalModel':
                trig.append('interval')
        x['trigger'] = trig or ['manual']
        for k, lab in (('maxActivationsPerRound', 'perRound'), ('maxActivationsPerGame', 'perGame'), ('livesCost', 'livesCost'),
                       ('additionalCharges', 'charges'), ('cooldownSpeedScale', 'cdScale')):
            v = num(a.get(k))
            if v > 0 and not (k == 'cooldownSpeedScale' and v == 1):
                x[lab] = r4(v)
        for k in ('sharedCooldown', 'startOffCooldown', 'canActivateBetweenRounds', 'resetCooldownOnTierUpgrade'):
            if a.get(k):
                x[k] = True
        up = a.get('addedViaUpgrade')
        if up:
            x['upgrade'] = up
            u = self.upgrades.get(up)
            if u:
                x['unlock'] = u
        if ctx:
            x['ctx'] = ctx
        fx = []
        dur = 0.0
        for b in a.get('behaviors') or []:
            t = short(b)
            if not t or NOISE.search(t):
                continue
            s = summ(b)
            if s:
                fx.append(s)
            for k in ('lifespan', 'duration', 'Lifespan'):
                if num(b.get(k)) > 0 and not big(b.get(k)):
                    dur = max(dur, num(b.get(k)))
            if num(b.get('lifespanFrames')) > 0 and not big(b.get('lifespanFrames')):
                dur = max(dur, num(b.get('lifespanFrames')) / 60.0)
        if dur:
            x['dur'] = r4(dur)
        x['fx'] = fx
        self.abilities.append(x)

    def buff(self, m, ctx, owner_range, ctx_range, extra=None):
        t = short(m)
        x = {'t': t}
        if ctx:
            x['ctx'] = ctx
        x['radius'] = self.radius(m, owner_range, ctx_range, any(c.startswith('sub:') for c in ctx))
        s = summ(m)
        s.pop('$', None)
        if extra:
            x.update(extra)
        x['v'] = s
        n = normalize(t, m)
        if n:
            x['n'] = n
        self.buffs.append(x)

    def walk(self, o, ctx, owner_range, ctx_range=None, extra=None, root=False):
        if isinstance(o, list):
            for v in o:
                self.walk(v, ctx, owner_range, ctx_range, extra)
            return
        if not isinstance(o, dict):
            return
        t = short(o)
        if t and NOISE.search(t):
            return
        if t == 'TowerModel' and not root:
            sub = o.get('baseId') or o.get('name')
            ex = dict(extra or {})
            for b in o.get('behaviors') or []:
                if short(b) == 'TowerExpireModel' and 0 < num(b.get('lifespan')) < 9e5:
                    ex['subLife'] = r4(num(b.get('lifespan')))  # the sub-tower (totem, UAV...) disappears after this many seconds
            self.walk(o.get('behaviors') or [], ctx + ['sub:' + str(sub)], num(o.get('range')), None, ex or None)
            return
        if t == 'AbilityModel':
            self.ability(o, ctx, owner_range)
            self.walk(o.get('behaviors') or [], ctx + ['ab:' + str(o.get('displayName') or o.get('modelName'))], owner_range)
            return
        if t in ('AttackModel', 'AttackAirUnitModel'):
            nm = re.sub(r'^Attack(AirUnit)?Model_|_$', '', str(o.get('name') or ''))
            rng = 'global' if big(o.get('range')) else r4(num(o.get('range'), owner_range))
            for w in o.get('weapons') or []:
                if isinstance(w, dict):
                    ex = {'every': r4(num(w.get('rate')))} if num(w.get('rate')) else {}
                    self.walk(w, ctx + ['atk:' + nm], owner_range, rng, ex)
            self.walk(o.get('behaviors') or [], ctx + ['atk:' + nm], owner_range, rng)
            return
        if t == 'BonusProjectileAfterIntervalModel':
            ex = dict(extra or {})
            ex['afterShots'] = r4(num(o.get('interval')))
            if num(o.get('cooldown')):
                ex['minGap'] = r4(num(o.get('cooldown')))
            pm = o.get('projectileModel') or o.get('projectile') or {}
            # the bonus projectile is a burst around the tower: what it buffs is what its radius reaches
            self.walk(pm, ctx, owner_range, r4(num(pm.get('radius'))) or ctx_range, ex)
            return
        if t not in SKIP_BUFF and (t in BUFF_EXACT or BUFF_RE.search(t) or ('initialManaCost' in o and 'unlocksAtLevel' in o)):
            self.buff(o, ctx, owner_range, ctx_range, extra)
            # brews and temple mutators hold no further buffs; support models may hold sub-towers (Drone)
            for k, v in o.items():
                if isinstance(v, dict) and short(v) == 'TowerModel':
                    self.walk(v, ctx, owner_range)
            return
        for k, v in o.items():
            if isinstance(v, (dict, list)) and k not in ('upgrades', 'appliedUpgrades', 'mods'):
                self.walk(v, ctx, owner_range, ctx_range, extra)


def load(path):
    with open(path, encoding='utf-8-sig') as f:
        return json.load(f)


def req_from(codes):
    """the smallest {path, tier} set every listed crosspath meets: what unlocks a record"""
    cs = [c for c in codes if c != 'Paragon']
    if not cs:
        return [{'paragon': True}]
    out = []
    for p in range(3):
        t = min(int(c[p]) for c in cs)
        if t:
            out.append({'path': p, 'tier': t})
    return out


def merge(items, key_of):
    """merge identical records, keeping where each appears and the first source file"""
    seen = {}
    order = []
    for where, src, rec in items:
        k = json.dumps(rec, sort_keys=True)
        if k not in seen:
            seen[k] = dict(rec, **{'in': [], 'src': src})
            order.append(k)
        if where not in seen[k]['in']:
            seen[k]['in'].append(where)
    return [seen[k] for k in order]


def collapse_levels(levels):
    """[3,4,5,9] -> '3-5,9'"""
    ls = sorted(int(x) for x in levels)
    out = []
    i = 0
    while i < len(ls):
        j = i
        while j + 1 < len(ls) and ls[j + 1] == ls[j] + 1:
            j += 1
        out.append(str(ls[i]) if i == j else '%d-%d' % (ls[i], ls[j]))
        i = j + 1
    return ','.join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--gd', default='/home/claude/gd/g')
    ap.add_argument('--out', default=os.path.join(REPO, 'data', 'game', 'support.json'))
    args = ap.parse_args()
    gd = args.gd
    text = load(os.path.join(gd, 'textTable.json'))
    upgrades = {}
    for f in sorted(glob.glob(os.path.join(gd, 'Upgrades', '*.json'))):
        u = load(f)
        if isinstance(u, dict) and u.get('name'):
            upgrades[u['name']] = {'path': int(u.get('path', 0)), 'tier': int(u.get('tier', 0)) + 1}
    rel = lambda p: os.path.relpath(p, gd).replace(os.sep, '/')

    out = {'_meta': {
        'source': 'https://github.com/Btd6ModHelper/btd6-game-data (BTD Mod Helper "Export Game Data"), game v56.0. Data (c) Ninja Kiwi.',
        'gameVersion': '56.0',
        'built': 'tools/game/extract_support.py',
        'schema': {
            'towers.<id>.abilities[]': 'name, cd (s), dur (longest lifespan among its behaviours, s), trigger (manual | passive | roundEnd | preLeak | '
                                       'livesLost | interval), unlock {path 0-2, tier 1-5} (from addedViaUpgrade, else req), fx (behaviours summarised), '
                                       'in (crosspaths "ABC" / hero levels), src (first file)',
            'towers.<id>.buffs[]': 't (model class), ctx (where it sits: ab:<ability>, atk:<attack>, sub:<sub-tower>), radius (units | "global"), '
                                   'every (s between throws when delivered by an attack), afterShots (Gwendolin-style "every Nth shot"), '
                                   'v (the model numbers; v.who = tower filter: sets/ids/area/notIds), req (smallest crosspath that has it), in, src',
            'heroes.<id>': 'same, with "levels" (e.g. "3-14") instead of req; cooldowns[name] = {level: cd} at each change; '
                           'abilityLevel[name] = first level; levelText = the game text "<Hero> Level N Description"',
            'towers.<id>.abilityUnlock': '{ability name: [{path, tier}]} smallest crosspath requirement over every file that has it',
            'range': 'towers.<id>.range = the tower range per crosspath (heroes: per level, at each change); radius "tower" means this range',
            'radius': 'global if isGlobal or radius >= 9e5; else customRadius when isCustomRadius; else the owning (sub-)tower range when '
                      'useTowerRange or nothing else; projectile-delivered buffs use the attack range',
            'multipliers': 'RateSupportModel.multiplier multiplies the attack cooldown (0.85 = 15% shorter cooldown = 1/0.85 = 1.176x attacks); '
                           'RangeSupportModel.multiplier is additive (+0.1 = +10% range); brew rateUp 0.1 = cooldown x0.9',
            'n': 'engine-ready reading of a buff (where the class is understood): stat (rate | range | pierce | damage | camo | damageType | '
                 'brew | acid | discount | income | ...), cd = attack-cooldown multiplier, pct = +fraction, add = flat, mult = multiplier, '
                 'dur = seconds the buff lasts, stacks = max stacks, perStack = value applies per stack. Brew: shots = attacks the buff lasts, '
                 'rebuffBlock = seconds before a tower can be re-brewed; buffs[].every = seconds between throws. Acid: shotsPerDip, shotCap.',
            'subLife': 'seconds the sub-tower carrying the buff lives (Sacrificial Totem 30 s, 60 s at L20)',
            'immune': 'damage immunities from DamageModel.immuneBloonProperties bit flags 1 lead 2 black 4 white 8 purple 16 frozen',
        },
    }, 'towers': {}, 'heroes': {}, 'geraldoItems': [], 'buffIndicators': [], 'text': {}}

    names = set()
    for group, table, hero in (('towers', TOWERS, False), ('heroes', HEROES, True)):
        for tid, folder in sorted(table.items()):
            ab_items, bf_items = [], []
            ranges = {}
            for where, f in find_files(gd, folder, hero):
                d = load(f)
                w = Walker(upgrades, num(d.get('range')))
                rng = r4(num(d.get('range')))
                if not ranges or list(ranges.values())[-1] != rng or not hero:
                    ranges[where] = rng
                w.walk(d, [], num(d.get('range')), root=True)
                for a in w.abilities:
                    ab_items.append((where, rel(f), a))
                    names.add(a['name'])
                for b in w.buffs:
                    bf_items.append((where, rel(f), b))
            abil = merge(ab_items, None)
            buffs = merge(bf_items, None)
            for rec in abil + buffs:
                if hero:
                    rec['levels'] = collapse_levels(rec.pop('in'))
                else:
                    rec['req'] = req_from(rec['in'])
                    if 'unlock' not in rec and 't' not in rec:
                        rec['unlock'] = rec['req'][0] if len(rec['req']) == 1 else rec['req']
            entry = {'folder': folder, 'abilities': abil, 'buffs': buffs, 'range': ranges}
            # first crosspath / level each ability name exists at (union over its records)
            seen_in = {}
            for where, src, a in ab_items:
                seen_in.setdefault(a['name'], []).append(where)
            if hero:
                entry['abilityLevel'] = {n: min(int(w) for w in ws) for n, ws in sorted(seen_in.items())}
                lt = {}
                for n in range(1, 21):
                    v = text.get('%s Level %d Description' % (folder, n))
                    if isinstance(v, str):
                        lt[str(n)] = v
                entry['levelText'] = lt
            else:
                entry['abilityUnlock'] = {n: req_from(ws) for n, ws in sorted(seen_in.items())}
            if hero:
                cds = {}
                for where, src, a in sorted(ab_items, key=lambda z: int(z[0])):
                    c = cds.setdefault(a['name'], {})
                    if not c or list(c.values())[-1] != a['cd']:
                        c[where] = a['cd']
                entry['cooldowns'] = cds
            out[group][tid] = entry
            print('%-10s %3d abilities %3d buffs' % (tid, len(abil), len(buffs)), file=sys.stderr)

    for f in sorted(glob.glob(os.path.join(gd, 'GeraldoItems', '*.json'))):
        g = load(f)
        rec = {'item': g.get('name'), 'src': rel(f)}
        for k in ('cost', 'levelUnlockedAt', 'startingQuantity', 'maxQuantity', 'roundsToReplenish', 'amountToReplenish', 'maxPurchases', 'towerId'):
            if g.get(k) not in (None, '', 0):
                rec[k] = r4(g.get(k))
        rec['fx'] = [s for s in (summ(b) for b in g.get('behaviorModels') or []) if s]
        rec['text'] = text.get(g.get('locsId') or '', g.get('locsId'))
        out['geraldoItems'].append(rec)

    for f in sorted(glob.glob(os.path.join(gd, 'Buffs', '*.json'))):
        b = load(f)
        rec = {'buff': b.get('buffName'), 'icon': b.get('iconName'), 'src': rel(f)}
        for k in ('stackable', 'maxStackSize', 'globalRange'):
            if b.get(k):
                rec[k] = r4(b.get(k))
        out['buffIndicators'].append(rec)

    for n in sorted(names):
        for k in (n, n + ' Ability', n.replace(' ', '') + 'Ability'):
            if isinstance(text.get(k), str):
                out['text'][n] = text[k]
                d = text.get(k + ' Description') or text.get(k + 'Description')
                if isinstance(d, str):
                    out['text'][n + ' Description'] = d
                break

    out['overrides'] = OVERRIDES
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'), sort_keys=True, ensure_ascii=False)
    print('wrote', args.out, os.path.getsize(args.out) // 1024, 'KB', file=sys.stderr)


# v57 changes the export (v56) cannot show. Kept apart from export values; each needs its source.
V57 = 'https://www.bloonswiki.com/Update_history:Bloons_TD_6/Version_57.0'
V571 = 'https://www.bloonswiki.com/Update_history:Bloons_TD_6/Version_57.1'
OVERRIDES = [
    {'hero': 'brickell', 'levels': '3-15', 'what': 'Naval Tactics attack-cooldown modifier', 'v56': 0.5, 'v57': 0.66, 'note': 'L16+ stays 0.5', 'source': V57},
    {'hero': 'brickell', 'levels': '4-7', 'what': 'water-tower +1 pierce aura (PierceSupportModel)', 'v56': 'from L8', 'v57': 'from L4', 'source': V57},
    {'hero': 'brickell', 'levels': '8+', 'what': 'Naval Tactics tower filter', 'v56': 'water-exclusive towers (Subs, Buccaneers, Brickell)',
     'v57': 'all water and amphibious towers', 'source': V57},
    {'hero': 'brickell', 'levels': '14+', 'what': 'Naval Tactics damage', 'v56': 0, 'v57': '+1 damage', 'source': V57},
    {'hero': 'brickell', 'levels': '7+', 'what': 'Blast Chain mine delay multiplier', 'v56': 0.25, 'v57': 0.2, 'source': V57},
    {'hero': 'brickell', 'levels': '16+', 'what': 'range (radius of Naval Tactics before L19)', 'v56': 62, 'v57': 58, 'source': V57},
    {'hero': 'brickell', 'levels': '10-17', 'what': 'Mega Mine duration', 'v56': '150 s', 'v57': '120 s', 'source': V57},
    {'hero': 'etienne', 'levels': '16+', 'what': 'range buff to towers in radius', 'v56': 1.2, 'v57': 1.21, 'note': 'two 1.1x buffs', 'source': V57},
    {'tower': 'village', 'req': 'x-4-x / x-5-x', 'what': 'Call to Arms / Homeland Defense stacking', 'v57': 'Call to Arms cannot activate while either buff is active; '
     'Homeland Defense can apply over Call to Arms but not over Homeland Defense', 'source': V57},
    {'tower': 'dart', 'req': 'x-4-x / x-5-x', 'what': 'Fan Club ability', 'v57': 'no longer stacks with Total Transformation or vice versa',
     'note': 'v56 MorphTowerModel already skips MonkeyFanClub-mutated towers', 'source': V57},
    {'tower': 'alchemist', 'req': 'x-5-x', 'what': 'Total Transformation', 'v57': 'no longer stacks with Super/Plasma Monkey Fan Club', 'source': V57},
    {'tower': 'skywarden', 'req': '1-x-x', 'what': 'Aerial Attunement range buff', 'v56': '+2 range per stack, 5 stacks, every tier',
     'v57': '+3 per stack, 3 stacks, only towers up to one tier above the Skywarden', 'source': V57},
    {'tower': 'skywarden', 'req': 'x-4-x', 'what': 'ability duration', 'v56': '15 s', 'v57': '9 s', 'note': 'v57.1: re-activation downtime matches (9 s)',
     'source': V57},
    {'tower': 'bomb', 'req': 'x-x-5', 'what': 'Bomb Blitz passive', 'v57': 'triggers at most once per round', 'source': V57},
    {'tower': 'sniper', 'req': 'x-4-x / x-5-x', 'what': 'Supply Drop', 'v57': 'toggle: cash crate or ammo crate (+3 pierce, 2x damage, 2x lifespan, '
     'Normal damage for a limited number of shots; x-5-x also buffs up to 2 nearby Snipers); shared cooldown', 'source': V57},
    {'tower': 'sniper', 'req': 'x-x-5', 'what': 'Elite Defender passive cooldown multiplier', 'v56': 0.25, 'v57': '0.5 in 57.0, back to 0.25 in 57.1',
     'source': V571},
    {'tower': 'super', 'req': '4-x-x+', 'what': 'Sun Temple $20,001+ Magic sacrifice (Storm Blast)', 'v57': 'pierce 500 -> 100; targets and decamos '
     'Camo (not DDT); $35,001+ also hits DDTs', 'source': V57},
    {'tower': 'super', 'req': '5-x-x', 'what': 'Permanent Brew on sacrificed Alchemists', 'v57': 'no longer kept after sacrifice', 'source': V57},
]

if __name__ == '__main__':
    main()
