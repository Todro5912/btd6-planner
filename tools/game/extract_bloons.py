#!/usr/bin/env python3
"""Extract every bloon, boss and round set from the BTD6 game-data export (BTD Mod Helper "Export Game Data",
https://github.com/Btd6ModHelper/btd6-game-data, game v56.0) into two compact files:

  data/game/bloons.json  - every BloonModel in Bloons/ (regular, camo/regrow/fortified variants, MOAB-class,
                           Golden, Frontier Legends bloons, boss parts), the 7 bosses x 10 tiers, the bloon-affecting
                           game-mode mods (Mods/), and wiki-sourced overrides for rules that live in game CODE
                           (freeplay ramps, Super Ceramics) - kept apart from export values.
  data/game/rounds.json  - Rounds/DefaultRoundSet and Rounds/AlternateRoundSet: every group (bloon, count, start,
                           end, spacing) in seconds, plus per-round derived RBE, leak lives and pop cash.

Usage: python3 tools/game/extract_bloons.py [--gd /home/claude/gd/g] [--out data/game]
stdlib only, deterministic (sorted keys, fixed rounding: 4 significant digits for floats).
"""
import argparse
import glob
import json
import math
import os
import sys
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))

FPS = 60.0  # BloonGroupModel start/end are frames (seconds * 60): BTD Mod Helper RoundModelExt.AddBloonGroup docs
RED_SPEED = 25.0  # a Red's speed in the export; RBS (red bloon speed) = speed / 25

# BloonProperties bits (BloonModel.bloonProperties) and the damage-type masks they are checked against
# (DamageModel.immuneBloonProperties: an attack can't damage a bloon when mask & props != 0).
# Bits verified by which bloons carry them: Lead=1 (Lead, DDT, Dreadbloon), Black=2 (Black, Zebra, DDT),
# White=4 (White, Zebra), Purple=8 (Purple, Blastapopoulos), Frozen=16 (status: sharp mask 17 = Lead|Frozen),
# 64 only on GlassBloon (Frontier "immune to energy and plasma": energy 73 and plasma 72 both contain 64).
PROP_BITS = [(1, 'lead'), (2, 'black'), (4, 'white'), (8, 'purple'), (16, 'frozen'), (32, 'bit32'), (64, 'glass')]
# Damage-type masks: names from data/pop-model.json damageTypes, masks = the immuneBloonProperties values
# that occur in Towers/ (0, 1, 2, 4, 5, 8, 12, 17, 64, 72, 73).
DAMAGE_MASKS = OrderedDict([('normal', 0), ('sharp', 17), ('shatter', 1), ('explosion', 2), ('glacier', 4),
                            ('cold', 5), ('fire', 8), ('frigid', 12), ('acid', 64), ('plasma', 72), ('energy', 73)])

BOSSES = ['Bloonarius', 'Blastapopoulos', 'Diamondback', 'Dreadbloon', 'Lych', 'Phayze', 'Vortex']

# behaviour models that are pure presentation; dropped from the compact boss/special behaviour lists
COSMETIC = {'DisplayModel', 'PopEffectModel', 'CreateSoundOnDamageBloonModel', 'PlayAnimTriggerActionModel',
            'CreateSoundOnActionModel', 'AnimDamageStateModel', 'CreateSoundOnSpawnBloonModel', 'ShowDamageTextModel',
            'SpawnDeathAnimModel', 'CreateSoundOnDamageArmourModel', 'CreateSoundOnBreakArmourModel',
            'CreateEffectActionModel', 'BloonSpawnEffectModel', 'BloonDeathEffectModel', 'CreatePropsOnBloonActionModel',
            'CreateEffectOnPopModel', 'DistributeCashModel', 'SpawnChildrenModel', 'GrowModel'}
ASSET_WORDS = ('guid', 'sound', 'display', 'effect', 'asset', 'prefab', 'anim', 'fx', 'icon', 'overlay')

# Rules that are NOT in the export (they live in game code / FreeplayGroupData.asset, which the export only names
# in resources.json). Kept separate from export values; each carries its source.
OVERRIDES = {
    'freeplaySpeed': {
        'what': 'Bloon speed multiplier from round 81 (all bloons). Additive bands.',
        'bands': [[81, 100, 1.02, 0.02], [101, 150, 1.6, 0.02], [151, 200, 3.0, 0.02], [201, 251, 4.5, 0.02],
                  [252, None, 6.0, 0.0]],
        'bandFormat': '[fromRound, toRound, multAtFrom, addPerRound]',
        'source': 'https://www.bloonswiki.com/Freeplay (fetched 2026-11-07)',
    },
    'freeplayBlimpHealth': {
        'what': 'MOAB-class health multiplier from round 81. Additive bands.',
        'bands': [[81, 100, 1.02, 0.02], [101, 124, 1.45, 0.05], [125, 150, 2.75, 0.15], [151, 250, 6.85, 0.35],
                  [251, 300, 42.5, 1.0], [301, 400, 93.0, 1.5], [401, 500, 244.0, 2.5], [501, None, 496.5, 5.0]],
        'bandFormat': '[fromRound, toRound, multAtFrom, addPerRound]',
        'source': 'https://www.bloonswiki.com/Freeplay (fetched 2026-11-07). The page lists 101-125 as +5% but its '
                  'own endpoints (R125 = 2.75, R126 = 2.90) put the +15% step at R125; the Bloons Wiki round table '
                  'RBE for R125 (939,624 standard, 981,096 ABR) only reproduces with R125 = 2.75.',
    },
    'superCeramic': {
        'what': 'From round 81 every Ceramic is a Super Ceramic, and every non-MOAB-class bloon spawns only ONE child.',
        'fromRound': 81, 'hp': 60, 'hpFortified': 120, 'children': [['Rainbow', 1]], 'rbe': 68, 'rbeFortified': 128,
        'cashCeramicLayer': 87, 'leak': 65, 'leakFortified': 75,
        'source': 'https://www.bloonswiki.com/Ceramic_(BTD6) (Super Ceramic section, fetched 2026-11-07)',
    },
    'v57': {
        'what': 'v57.0-57.4 bloon/boss/round changes (export is v56). None touch regular rounds, regular bloons or '
                'normal boss events; Boss Rush bosses were retuned (not modelled here).',
        'bossRush': {'BloonariusSpeed': [1.25, 1.2], 'BlastapopoulosSpeed': [1.25, 1.2],
                     'BlastapopoulosStartHealth': [350, 325], 'DreadbloonBaseHealth': [130, 140],
                     'cashReward': [1000, 1100]},
        'blastapopoulosHeat': 'Skywarden bottom path main attack reduces heat: x-x-3 -30, x-x-4 -100, x-x-5 -500',
        'source': 'https://www.bloonswiki.com/Update_history:Bloons_TD_6/Version_57.0 ; 57.1-57.4 pages list no '
                  'bloon/round changes outside quests and paragons',
    },
}


def sig(v, n=4):
    if isinstance(v, bool) or not isinstance(v, float):
        return v
    if not math.isfinite(v):
        return v
    if v == int(v):
        return int(v)  # integer-valued floats stay exact (HP, counts, frame totals)
    r = round(v, n - 1 - int(math.floor(math.log10(abs(v)))))
    return int(r) if r == int(r) and abs(r) < 1e15 else r


def exact(v):
    """sums (RBE, leak, cash): exact integers, else 3 decimals - never 4-sig rounding"""
    v = float(v)
    return int(v) if v == int(v) else round(v, 3)


def tname(o):
    return str(o.get('$type', '')).split(',')[0].split('.')[-1]


def compact(o):
    """strip asset references, $type (kept as _t on behaviour objects), empty values; round floats"""
    if isinstance(o, dict):
        out = OrderedDict()
        t = tname(o)
        if t:
            out['_t'] = t
        for k in sorted(o):
            if k == '$type' or k == 'name' or any(w in k.lower() for w in ASSET_WORDS):
                continue
            v = compact(o[k])
            if v in (None, '', [], {}):
                continue
            out[k] = v
        return out
    if isinstance(o, list):
        return [compact(x) for x in o]
    return sig(o) if isinstance(o, float) else o


def load(path):
    with open(path, encoding='utf-8-sig') as f:
        return json.load(f)


def props_names(p):
    if p == -1:
        return ['all']
    return [n for b, n in PROP_BITS if p & b]


def immune_to(p):
    return [k for k, m in DAMAGE_MASKS.items() if m and (p & m)]


def bloon_class(d, tags):
    bid = d['id']
    if d.get('isBoss') and any(bid.startswith(b) and bid[len(b):].lstrip('Elite').isdigit() for b in BOSSES):
        return 'boss'
    if any(bid.startswith(x) for x in ('DiamondbackHead', 'DiamondbackMiddle', 'DiamondbackTail', 'DiamondbackDiamond',
                                       'MiniLych', 'Tombstone', 'DreadRock', 'Undead')):
        return 'boss-part'
    if 'Frontier' in tags or d.get('IsExclusiveToLegends'):
        return 'legends'
    if 'Golden' in tags:
        return 'golden'
    if 'Test' in tags:
        return 'test'
    if d.get('isMoab'):
        return 'moab'
    return 'regular'


def extract_bloons(gd):
    text = load(os.path.join(gd, 'textTable.json'))
    raw = {}
    for f in sorted(glob.glob(os.path.join(gd, 'Bloons', '*', '*.json'))):
        d = load(f)
        raw[d['id']] = (os.path.relpath(f, gd).replace(os.sep, '/'), d)

    recs = OrderedDict()
    for bid in sorted(raw):
        src, d = raw[bid]
        beh = d.get('behaviors') or []
        kids = OrderedDict()
        for b in beh:
            if tname(b) == 'SpawnChildrenModel':
                for c in b.get('children') or []:
                    kids[c] = kids.get(c, 0) + 1
        cash = [b for b in beh if tname(b) == 'DistributeCashModel']
        grow = [b for b in beh if tname(b) == 'GrowModel']
        tags = list(d.get('tags') or [])
        props = int(d.get('bloonProperties') or 0)
        r = OrderedDict()
        r['src'] = src
        r['base'] = d.get('baseId')
        r['name'] = text.get(d.get('baseId') or '', None)
        r['class'] = bloon_class(d, tags)
        r['hp'] = int(d['maxHealth'])
        r['speed'] = sig(float(d['speed']))
        r['rbs'] = sig(float(d['speed']) / RED_SPEED)
        r['children'] = [[k, v] for k, v in kids.items()]
        r['props'] = props
        r['propNames'] = props_names(props)
        r['immuneTo'] = immune_to(props)
        r['tags'] = tags
        flags = [k for k, f in (('camo', 'isCamo'), ('regrow', 'isGrow'), ('fortified', 'isFortified'),
                                ('moab', 'isMoab'), ('boss', 'isBoss')) if d.get(f)]
        r['flags'] = flags
        r['leakDamage'] = sig(float(d.get('leakDamage') or 0))
        r['cash'] = sig(float(cash[0]['cash'])) if cash else 0
        if grow:
            r['regrowRate'] = sig(float(grow[0]['rate']))
            if grow[0].get('growToId'):
                r['growTo'] = grow[0]['growToId']
        r['layer'] = d.get('layerNumber')
        r['danger'] = sig(float(d.get('danger') or 0))
        r['radius'] = sig(float(d.get('radius') or 0))
        if d.get('isImmuneToSlow'):
            r['immuneToSlow'] = True
        if any(tname(b) == 'BadImmunityModel' for b in beh):
            r['badImmunity'] = True  # BAD-style immunity (instakill/knockback/etc. effects that skip BADs)
        if d.get('mods'):
            r['relicMods'] = sorted(m['mod'] for m in d['mods'])  # relic hooks (textTable Relic<name>: Heartless, Sharpsplosion...)
        if d.get('IsExclusiveToLegends') or d.get('legendsType', -1) != -1:
            r['legends'] = True
            desc = text.get('ft_' + bid.lower() + 'description')
            if desc:
                r['desc'] = desc
        special = [compact(b) for b in beh if tname(b) not in COSMETIC and tname(b) not in ('BadImmunityModel',)]
        if special and r['class'] != 'boss':
            r['behaviors'] = special
        recs[bid] = r

    # derived totals from the tree (export rule set, i.e. rounds 1-80)
    memo = {}

    def tot(bid):
        if bid in memo:
            return memo[bid]
        r = recs[bid]
        rbe, leak, cash = r['hp'], r['leakDamage'], r['cash']
        for c, n in r['children']:
            a, b, k = tot(c)
            rbe += n * a
            leak += n * b
            cash += n * k
        memo[bid] = (rbe, leak, cash)
        return memo[bid]

    for bid, r in recs.items():
        if r['class'] == 'boss':
            continue
        rbe, leak, cash = tot(bid)
        r['rbe'] = exact(rbe)
        r['leak'] = exact(leak)
        r['cashTotal'] = exact(cash)

    # bosses
    bosses = OrderedDict()
    for b in BOSSES:
        tiers = OrderedDict()
        for elite in (False, True):
            for n in range(1, 6):
                bid = b + ('Elite' if elite else '') + str(n)
                if bid not in recs:
                    continue
                src, d = raw[bid]
                r = recs.pop(bid)
                beh = d.get('behaviors') or []
                skulls, skull_actions, bleed = [], [], None
                for x in beh:
                    if tname(x) == 'HealthPercentTriggerModel':
                        vals = [sig(float(v)) for v in x.get('percentageValues') or []]
                        if x.get('repeatFirst'):
                            bleed = {'everyPct': vals[0] if vals else None, 'actions': x.get('actionIds') or []}
                        elif not skulls:
                            skulls, skull_actions = vals, x.get('actionIds') or []
                    if tname(x) == 'LychBossSuperScriptModel' and not skulls:
                        skulls = [sig(float(v)) for v in x.get('etherealHealthPercentageValues') or []]
                        skull_actions = x.get('etherealEnterActionIds') or []
                t = OrderedDict()
                t['id'] = bid
                t['src'] = src
                t['elite'] = elite
                t['tier'] = n
                t['hp'] = r['hp']
                t['speed'] = r['speed']
                t['rbs'] = r['rbs']
                t['props'] = r['props']
                t['propNames'] = r['propNames']
                t['immuneTo'] = r['immuneTo']
                t['tags'] = r['tags']
                t['skulls'] = skulls
                t['skullActions'] = skull_actions
                if bleed:
                    t['bleed'] = bleed
                t['behaviors'] = [compact(x) for x in beh if tname(x) not in COSMETIC]
                tiers[('e' if elite else '') + str(n)] = t
        bosses[b] = OrderedDict([('name', text.get(b, b)),
                                 ('tagLine', ' - '.join(x for x in (text.get(b + 'TagLine'), text.get(b + 'TagLine2')) if x)),
                                 ('info', text.get(b + 'InfoPanelDescription')),
                                 ('tiers', tiers)])
    return recs, bosses


def extract_modes(gd):
    out = OrderedDict()
    for f in sorted(glob.glob(os.path.join(gd, 'Mods', '*.json'))):
        d = load(f)
        mods = []
        for m in d.get('mutatorMods') or []:
            mods.append(compact(m))
        out[d.get('name') or os.path.basename(f)[:-5]] = OrderedDict(
            [('src', os.path.relpath(f, gd).replace(os.sep, '/')), ('mods', mods)])
    # the values the bloon engine needs, read straight from the mods above
    eff = OrderedDict()
    for name, m in out.items():
        e = OrderedDict()
        for x in m['mods']:
            t = x['_t']
            if t == 'GlobalSpeedModModel':
                e['bloonSpeedMult'] = x.get('multiplier')
            elif t == 'BloonHealthModel':
                e['healthMult'] = {'tag': x.get('bloonTag'), 'mult': x.get('healthMod')}
            elif t == 'SetHealthForBloonModModel':
                e.setdefault('setHealth', []).append({'round': x.get('round'), 'bloon': x.get('bloonId'),
                                                      'mult': x.get('healthMultiplier')})
            elif t == 'StartingRoundModModel':
                e['startRound'] = x.get('round')
            elif t == 'EndRoundModModel':
                e['endRound'] = x.get('round')
            elif t == 'RoundSetModModel':
                e['roundSet'] = x.get('roundsetName')
            elif t in ('ReverseModel', 'ImpoppableModel', 'ChimpsModModel', 'DeflationModel'):
                e.setdefault('flags', []).append(t)
            elif t == 'ModifyAllCashModModel':
                e['cashMult'] = x.get('multiplier')
            elif t == 'MaxHealthModModel':
                e['livesSet'] = x.get('set')
            elif t == 'StartingHealthModModel':
                e['lives'] = x.get('addition')
        if e:
            eff[name] = e
    return out, eff


def income_set(gd, name='DefaultIncomeSet'):
    d = load(os.path.join(gd, 'IncomeSets', name + '.json'))
    return {'src': 'IncomeSets/%s.json' % name,
            'thresholds': [[t['threshold'], sig(float(t['multiplier']))] for t in d['thresholds']],
            'final': sig(float(d['finalMultiplier'])),
            'rule': 'pop cash x multiplier of the first threshold with round <= threshold (1-based); else final'}


def pop_mult(inc, r):
    for th, m in inc['thresholds']:
        if r <= th:
            return m
    return inc['final']


def band_mult(bands, r):
    if r < bands[0][0]:
        return 1.0
    for a, b, m0, step in bands:
        if b is None or r <= b:
            return m0 + step * (r - a)
    return 1.0


def late_totals(recs, bid, r, memo):
    """RBE / leak / cash of one bloon at round r under the freeplay rules (OVERRIDES): from R81 non-MOAB bloons
    spawn one child, Ceramics are Super Ceramics (60 HP, x2 fortified), MOAB-class HP x freeplayBlimpHealth."""
    key = (bid, r)
    if key in memo:
        return memo[key]
    rec = recs[bid]
    sc = OVERRIDES['superCeramic']
    hp = float(rec['hp'])
    leak = float(rec['leakDamage'])
    cash = float(rec['cash'])
    kids = rec['children']
    is_moab = 'moab' in rec['flags']
    if r >= sc['fromRound']:
        if is_moab:
            hm = band_mult(OVERRIDES['freeplayBlimpHealth']['bands'], r)
            hp *= hm
        else:
            if kids:
                kids = [[kids[0][0], 1]]
            if rec['base'] == 'Ceramic':
                hp = float(sc['hpFortified'] if 'fortified' in rec['flags'] else sc['hp'])
                cash = float(sc['cashCeramicLayer'])
                leak = None  # wiki: Super Ceramic leak 65 / 75 total (not a sum of layers)
    rbe, lk, ch = hp, leak, cash
    for c, n in kids:
        a, b, k = late_totals(recs, c, r, memo)
        rbe += n * a
        ch += n * k
        if lk is not None:
            lk += n * b
    if lk is None:
        lk = float(sc['leakFortified'] if 'fortified' in rec['flags'] else sc['leak'])
    memo[key] = (rbe, lk, ch)
    return memo[key]


def extract_rounds(gd, recs, inc):
    sets = OrderedDict()
    memo = {}
    for set_name in ('DefaultRoundSet', 'AlternateRoundSet'):
        files = glob.glob(os.path.join(gd, 'Rounds', set_name, '*.json'))
        rounds = []
        for f in sorted(files, key=lambda p: int(os.path.basename(p)[:-5])):
            n = int(os.path.basename(f)[:-5])
            d = load(f)
            groups = []
            rbe = leak = cash = 0.0
            rbe_l = leak_l = cash_l = 0.0
            t1 = 0.0
            for g in d.get('groups') or []:
                b, c = g['bloon'], int(g['count'])
                s, e = float(g['start']) / FPS, float(g['end']) / FPS
                sp = (e - s) / (c - 1) if c > 1 else 0.0
                groups.append([b, c, sig(s), sig(e), sig(sp)])
                t1 = max(t1, e)
                rec = recs[b]
                rbe += c * rec['rbe']
                leak += c * rec['leak']
                cash += c * rec['cashTotal']
                if n >= 81:
                    a, lk, ch = late_totals(recs, b, n, memo)
                    rbe_l += c * a
                    leak_l += c * lk
                    cash_l += c * ch
            pm = pop_mult(inc, n)
            row = OrderedDict()
            row['round'] = n
            row['src'] = 'Rounds/%s/%d.json' % (set_name, n)
            row['groups'] = groups
            row['bloons'] = sum(g[1] for g in groups)
            row['last'] = sig(t1)  # seconds until the last spawn (unscaled game time)
            row['rbe'] = exact(rbe)
            row['leak'] = exact(leak)
            row['cashRaw'] = exact(cash)  # pop cash before the round's income multiplier
            row['popMult'] = pm
            row['cashPop'] = exact(cash * pm)
            if n >= 81:
                row['late'] = OrderedDict([('rbe', exact(rbe_l)), ('leak', exact(leak_l)), ('cashRaw', exact(cash_l)),
                                           ('cashPop', exact(cash_l * pm)),
                                           ('blimpHpMult', sig(band_mult(OVERRIDES['freeplayBlimpHealth']['bands'], n))),
                                           ('speedMult', sig(band_mult(OVERRIDES['freeplaySpeed']['bands'], n)))])
            rounds.append(row)
        sets['default' if set_name == 'DefaultRoundSet' else 'abr'] = rounds
    return sets


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--gd', default='/home/claude/gd/g')
    ap.add_argument('--out', default=os.path.join(REPO, 'data', 'game'))
    a = ap.parse_args()
    recs, bosses = extract_bloons(a.gd)
    modes, eff = extract_modes(a.gd)
    inc = income_set(a.gd)
    sets = extract_rounds(a.gd, recs, inc)
    meta = OrderedDict([
        ('source', 'https://github.com/Btd6ModHelper/btd6-game-data (BTD Mod Helper "Export Game Data"), game v56.0'),
        ('generatedBy', 'tools/game/extract_bloons.py'),
        ('gameVersion', '56.0'),
        ('units', 'speed = game units/s (a Red = 25); rbs = speed / 25. hp = maxHealth of that layer. '
                  'leakDamage/cash = this layer only; rbe/leak/cashTotal = this layer + all children (export tree, '
                  'rounds 1-80 rules). Golden/boss cash 0 = paid by other code.'),
        ('propBits', OrderedDict((str(b), n) for b, n in PROP_BITS)),
        ('damageMasks', DAMAGE_MASKS),
        ('immunityRule', 'a damage type with mask M cannot damage a bloon with props P when M & P != 0'),
        ('notInExport', 'Freeplay ramps and Super Ceramics are game code (resources.json only names '
                        'Assets/Data/RoundSets/FreeplayGroupData.asset); see overrides.'),
        ('license', 'Data (c) Ninja Kiwi; wiki overrides CC BY-NC-SA 4.0 bloonswiki.com'),
    ])
    out_b = OrderedDict([('_meta', meta), ('bloons', recs), ('bosses', bosses), ('modeEffects', eff),
                         ('modes', modes), ('overrides', OVERRIDES)])
    rmeta = OrderedDict([
        ('source', meta['source']),
        ('generatedBy', 'tools/game/extract_bloons.py'),
        ('gameVersion', '56.0'),
        ('groupFormat', '[bloon id (see bloons.json), count, start s, end s, spacing s]; times = game frames / 60, '
                        'before mode speed. spacing = (end-start)/(count-1) (inferred: first spawn at start, last at end).'),
        ('rowFields', 'rbe/leak/cashRaw = sum over groups with the export tree; cashPop = cashRaw x popMult '
                      '(IncomeSets/DefaultIncomeSet). late = R81+ values under overrides (Super Ceramic, one child, '
                      'blimp HP ramp). End-of-round bonus (100 + round) is NOT included.'),
        ('incomeSet', inc),
    ])
    out_r = OrderedDict([('_meta', rmeta), ('sets', sets)])
    os.makedirs(a.out, exist_ok=True)
    for name, obj in (('bloons.json', out_b), ('rounds.json', out_r)):
        p = os.path.join(a.out, name)
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
            f.write('\n')
        print(p, os.path.getsize(p), 'bytes')
    print(len(recs), 'bloons;', sum(len(b['tiers']) for b in bosses.values()), 'boss tiers;',
          ', '.join('%s %d rounds' % (k, len(v)) for k, v in sets.items()))


if __name__ == '__main__':
    sys.exit(main())
