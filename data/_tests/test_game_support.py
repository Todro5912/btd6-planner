"""Known-truth tests for data/game/support.json (abilities and buffs, built by tools/game/extract_support.py).

Plain Python, no dependencies. Run either way:
    python3 data/_tests/test_game_support.py
    python3 -m pytest data/_tests/test_game_support.py

Every assertion names its source. Short keys:
  GF       the game file named in the check (btd6-game-data v56.0, https://github.com/Btd6ModHelper/btd6-game-data)
  BW-BREW  bloonswiki Berserker Brew (BTD6)        https://www.bloonswiki.com/Berserker_Brew_(BTD6)
           (throw 8 s, 6.4 s with 3-0-1; 5 s / 25 shots, 6 s / 40 shots with 3-2-0; rebuff block 5 s, 4 s with 3-2-0;
            +1 damage, +2 pierce, +10% range, cooldown x0.9)
  BW-ACID  bloonswiki Acidic Mixture Dip (BTD6)    https://www.bloonswiki.com/Acidic_Mixture_Dip_(BTD6)
           (10 attacks per dip, stacks to 30, 12 with 2-2-0; dip every 10 s, 8 s with 2-0-1; +1 Ceramic/MOAB/Fortified Lead)
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.dirname(HERE)
GD = os.environ.get('BTD6_GD', '/home/claude/gd/g')
PATH = os.path.join(DATA, 'game', 'support.json')

with open(PATH, encoding='utf-8') as f:
    S = json.load(f)

RESULTS = {'pass': 0, 'fail': []}


def check(cond, msg):
    if cond:
        RESULTS['pass'] += 1
    else:
        RESULTS['fail'].append(msg)


def buffs(group, tid, stat=None, t=None, where=None):
    out = []
    for b in S[group][tid]['buffs']:
        if t and b['t'] != t:
            continue
        if stat and (b.get('n') or {}).get('stat') != stat:
            continue
        if where is not None:
            if group == 'towers' and where not in b['in']:
                continue
            if group == 'heroes' and not in_levels(b['levels'], where):
                continue
        out.append(b)
    return out


def in_levels(spec, lv):
    for part in spec.split(','):
        a, _, b = part.partition('-')
        if int(a) <= lv <= int(b or a):
            return True
    return False


def abil(group, tid, name, where):
    for a in S[group][tid]['abilities']:
        if a['name'] != name:
            continue
        if group == 'towers' and where in a['in']:
            return a
        if group == 'heroes' and in_levels(a['levels'], where):
            return a
    return None


def t_meta_and_size():
    check(S['_meta']['gameVersion'] == '56.0', 'meta gameVersion 56.0')
    check(os.path.getsize(PATH) < 2 * 1024 * 1024, 'support.json under 2 MB')
    check(len(S['towers']) == 26 and len(S['heroes']) == 18, 'all 26 towers and 18 heroes present')
    check(isinstance(S.get('overrides'), list), 'overrides section present and separate')


def t_sources_exist():
    """every record names the game file it came from (GF)"""
    missing = 0
    total = 0
    if not os.path.isdir(GD):
        return
    for g in ('towers', 'heroes'):
        for e in S[g].values():
            for r in e['abilities'] + e['buffs']:
                total += 1
                if not os.path.exists(os.path.join(GD, r['src'])):
                    missing += 1
    check(total > 500 and missing == 0, 'every record src exists in the export (%d missing of %d)' % (missing, total))


def t_village():
    # GF Towers/MonkeyVillage/MonkeyVillage-200.json: RateSupportModel multiplier 0.85 (Jungle Drums)
    r = buffs('towers', 'village', 'rate', 'RateSupportModel', '200')
    check(len(r) == 1 and r[0]['n']['cd'] == 0.85 and r[0]['radius'] == 'tower', 'Jungle Drums: cooldown x0.85 in Village range')
    # GF MonkeyVillage.json: base Village gives +10% range (RangeSupportModel 0.1), range 40
    r = buffs('towers', 'village', 'range', 'RangeSupportModel', '000')
    check(len(r) == 1 and r[0]['n'].get('pct') == 0.1, 'base Village +10% range')
    check(S['towers']['village']['range']['000'] == 40 and S['towers']['village']['range']['100'] == 48, 'Village range 40, 48 with Bigger Radius')
    # GF MonkeyVillage-300.json: Primary Training = +1 pierce, +10% range, +25% projectile speed, Primary only, no attack-speed buff
    r3 = [b for b in buffs('towers', 'village', where='300') if b['v'].get('who', {}).get('sets') == ['Primary']]
    stats = sorted((b['n']['stat'], b['n'].get('add') or b['n'].get('pct')) for b in r3)
    check(stats == [('pierce', 1), ('projectileSpeed', 0.25), ('range', 0.1)], 'Primary Training buffs %s' % stats)
    check(not [b for b in buffs('towers', 'village', 'rate', where='300') if b['v'].get('who')], 'Primary Training has no Primary-only rate buff')
    # GF MonkeyVillage-500.json: Primary Expertise +3 pierce
    r5 = [b for b in buffs('towers', 'village', 'pierce', where='500')]
    check(any(b['n']['add'] == 3 for b in r5), 'Primary Expertise +3 pierce')
    # GF MonkeyVillage-020.json Radar Scanner camo; -030 MIB DamageTypeSupportModel with no immunities
    check(len(buffs('towers', 'village', 'camo', where='020')) == 1, 'Radar Scanner gives camo')
    mib = buffs('towers', 'village', 'damageType', where='030')
    check(len(mib) == 1 and mib[0]['n']['immune'] == [], 'MIB: towers in range hit every type')
    # GF MonkeyVillage-001/-002: Monkey Business 10% (tiers <= 3), Monkey Commerce 5% stacking to 3
    d = sorted((b['n']['pct'], b['n']['stacks'], b['n']['maxTier']) for b in buffs('towers', 'village', 'discount', where='002'))
    check(d == [(0.05, 3, 3), (0.1, 1, 3)], 'Village discounts %s' % d)
    # GF MonkeyVillage-040.json: Call to Arms cooldown 45, x1.5 for 15 s; -050 Homeland Defense x2 for 20 s
    a = abil('towers', 'village', 'Call to Arms', '040')
    check(a and a['cd'] == 45 and a['dur'] == 15, 'Call to Arms 45 s cooldown, 15 s')
    hd = buffs('towers', 'village', 'rate+pierce', where='050')
    check(hd and hd[0]['n']['mult'] == 2 and hd[0]['n']['dur'] == 20, 'Homeland Defense x2 for 20 s')


def t_alchemist():
    def brew(code):
        r = [b for b in buffs('towers', 'alchemist', 'brew', where=code) if 'every' in b]
        return r[0] if len(r) == 1 else None
    b = brew('300')  # BW-BREW
    check(b and b['every'] == 8 and b['n']['dur'] == 5 and b['n']['shots'] == 25 and b['n']['rebuffBlock'] == 5,
          'Berserker Brew: throw 8 s, 5 s / 25 shots, rebuff block 5 s')
    check(b and b['n']['damage'] == 1 and b['n']['pierce'] == 2 and b['n']['cd'] == 0.9 and b['n']['rangePct'] == 0.1,
          'Berserker Brew: +1 damage, +2 pierce, cooldown x0.9, +10% range')
    check(brew('301') and brew('301')['every'] == 6.4, 'Brew 3-0-1 throws every 6.4 s (BW-BREW)')
    b = brew('320')
    check(b and b['n']['shots'] == 40 and b['n']['dur'] == 6 and b['n']['rebuffBlock'] == 4, 'Brew 3-2-0: 40 shots, 6 s, rebuff 4 s (BW-BREW)')
    b = brew('400')  # GF Alchemist-400.json AddBerserkerBrewToProjectileModel
    check(b and b['n']['dur'] == 12 and b['n']['shots'] == 40 and b['n']['pierce'] == 3 and b['n']['cd'] == 0.85,
          'Stronger Stimulant: 12 s / 40 shots, +3 pierce, cooldown x0.85')
    b = brew('500')  # GF Alchemist-500.json lifespan -1
    check(b and b['n'].get('permanent'), 'Permanent Brew is permanent')
    check('Alchemist' in brew('300')['n']['notIds'] and 'BananaFarm' in brew('300')['n']['notIds'], 'Brew skips Alchemists and Farms')

    def acid(code):
        r = [b for b in buffs('towers', 'alchemist', 'acid', where=code) if 'every' in b]
        return r[0] if len(r) == 1 else None
    a = acid('200')  # BW-ACID
    check(a and a['every'] == 10 and a['n']['shotsPerDip'] == 10 and a['n']['shotCap'] == 30, 'Acid dip every 10 s, 10 shots, cap 30')
    check(a and a['n']['bonus'] == {'Ceramic': 1, 'Lead,Fortified': 1, 'Moabs': 1}, 'Acid +1 Ceramic / MOAB / Fortified Lead')
    check(acid('220') and acid('220')['n']['shotsPerDip'] == 12, 'Acid 2-2-0 12 shots per dip (BW-ACID)')
    check(acid('201') and acid('201')['every'] == 8, 'Acid 2-0-1 every 8 s (BW-ACID)')


def t_engineer():
    # GF EngineerMonkey-040.json AbilityModel Overclock: cooldown 45, OverclockModel rateModifier 0.6, 3600 frames
    a = abil('towers', 'engineer', 'Overclock', '040')
    check(a and a['cd'] == 45 and a['dur'] == 60, 'Overclock 45 s cooldown, 60 s')
    o = buffs('towers', 'engineer', 'rate', 'OverclockModel', '040')
    check(o and o[0]['n']['cd'] == 0.6 and o[0]['n']['durByTargetTier'] == [1, 1, 1, 1, 0.75, 0.5], 'Overclock cooldown x0.6, 75%/50% time on tier 4/5')
    a = abil('towers', 'engineer', 'Ultraboost', '050')
    check(a and a['cd'] == 35, 'Ultraboost 35 s cooldown (GF EngineerMonkey-050.json)')
    p = buffs('towers', 'engineer', 'rate', 'OverclockPermanentModel', '050')
    check(p and p[0]['n']['cd'] == 0.96 and p[0]['n']['stacks'] == 10, 'Ultraboost permanent x0.96 per stack, 10 stacks')


def t_other_towers():
    # GF DartMonkey-040.json MonkeyFanClubModel: 10 towers of tier <= 2, 15 s, cooldown 50
    f = buffs('towers', 'dart', t='MonkeyFanClubModel', where='040')
    check(f and f[0]['v']['maxTier'] == 2 and f[0]['v']['towerCount'] == 10 and f[0]['v']['lifespan'] == 15, 'Fan Club: 10 Darts of tier <= 2, 15 s')
    check(abil('towers', 'dart', 'Super Monkey Fan Club', '040')['cd'] == 50, 'Fan Club cooldown 50 s')
    # GF SniperMonkey-050.json: Elite Sniper RateSupportModel 0.75, global, Snipers only
    e = buffs('towers', 'sniper', 'rate', where='050')
    check(e and e[0]['n']['cd'] == 0.75 and e[0]['radius'] == 'global' and e[0]['v']['who']['ids'] == ['SniperMonkey'], 'Elite Sniper: all Snipers cooldown x0.75')
    # GF NinjaMonkey-030.json SupportShinobiTacticsModel 0.92, 20 stacks, Ninjas
    s = buffs('towers', 'ninja', 'rate', 'SupportShinobiTacticsModel', '030')
    check(s and s[0]['n']['cd'] == 0.92 and s[0]['n']['stacks'] == 20, 'Shinobi Tactics x0.92 per stack, 20 stacks')
    # GF Druid-004.json PoplustSupportModel 15% / 15%, 5 stacks
    p = buffs('towers', 'druid', 'rate+pierce', 'PoplustSupportModel', '004')
    check(p and p[0]['n']['pct'] == 0.15 and p[0]['n']['stacks'] == 5, 'Poplust +15% rate/pierce, 5 stacks')
    # GF Druid-040.json Jungle's Bounty: passive, end of round, $120 base
    a = abil('towers', 'druid', "Jungle's Bounty", '040')
    check(a and 'roundEnd' in a['trigger'] and 'passive' in a['trigger'], "Jungle's Bounty is a passive end-of-round ability")
    check(S['towers']['druid']['abilityUnlock']["Jungle's Bounty"] == [{'path': 1, 'tier': 4}], "Jungle's Bounty unlocks at 0-4-0")
    # GF IceMonkey-050.json Absolute Zero: Ice Monkeys globally cooldown x0.6667 for 10 s
    z = buffs('towers', 'ice', 'rate', where='050')
    check(z and z[0]['n']['cd'] == 0.6667 and z[0]['n']['dur'] == 10, 'Absolute Zero Ice buff x0.667 for 10 s')


def t_heroes():
    cd = lambda h, n: S['heroes'][h]['cooldowns'][n]
    # GF "Quincy 3.json" / "Quincy 15.json" AbilityModel cooldown 60 -> 45
    check(cd('quincy', 'Rapid Shot') == {'3': 60, '15': 45}, 'Quincy Rapid Shot 60 s, 45 s from L15')
    check(cd('brickell', 'Mega Mine') == {'10': 60, '13': 50, '18': 40}, 'Brickell Mega Mine 60/50/40')
    check(S['heroes']['brickell']['abilityLevel'].get('Blast Chain Ability') == 7, 'Brickell has a L7 ability (Blast Chain)')
    check(S['heroes']['striker']['abilityLevel'].get('Target Focus') == 7, 'Striker has a L7 ability (Target Focus)')
    # GF "AdmiralBrickell 3/5/8/14.json" Naval Tactics zone models
    nt = buffs('heroes', 'brickell', 'rate', 'ActivateRateSupportZoneModel', 3)
    check(nt and nt[0]['n']['cd'] == 0.5 and nt[0]['n']['dur'] == 8 and nt[0]['v']['who']['area'] == ['water'], 'Naval Tactics: water towers cooldown x0.5 for 8 s')
    check(not buffs('heroes', 'brickell', 'camo', where=7) and buffs('heroes', 'brickell', 'camo', where=8), 'Naval Tactics camo from L8')
    check(buffs('heroes', 'brickell', 'rate', where=14)[0]['n']['dur'] == 10, 'Naval Tactics 10 s from L14')
    # GF "PatFusty 3/9/14.json" Rallying Roar ActivateTowerDamageSupportZoneModel
    roar = lambda lv: buffs('heroes', 'pat', 'damage', where=lv)[0]['n']
    check(roar(3) == {'stat': 'damage', 'add': 1, 'dur': 8} and roar(9)['add'] == 2 and roar(14) == {'stat': 'damage', 'add': 3, 'dur': 10},
          'Rallying Roar +1 (8 s), +2 at L9, +3 for 10 s at L14')
    # GF "Etienne 8.json": UAV sub-tower VisibilitySupportModel isGlobal
    u = buffs('heroes', 'etienne', 'camo', where=8)
    check(u and all(b['radius'] == 'global' for b in u) and not buffs('heroes', 'etienne', 'camo', where=7), 'Etienne UAV global camo from L8')
    # GF "Ezili 7.json" / "Ezili 16.json": Sacrificial Totem lives 30 s (60 s from L16), costs 10 lives (1 from L16)
    tc = buffs('heroes', 'ezili', 'camo', where=7)
    check(tc and tc[0]['subLife'] == 30 and tc[0]['radius'] == 78, 'Sacrificial Totem camo, 78 radius, 30 s')
    check(buffs('heroes', 'ezili', 'camo', where=16)[0]['subLife'] == 60, 'Sacrificial Totem 60 s from L16')
    a7, a16 = abil('heroes', 'ezili', 'Sacrificial Totem', 7), abil('heroes', 'ezili', 'Sacrificial Totem', 16)
    check(a7['livesCost'] == 10 and a16['livesCost'] == 1 and a7['cd'] == 90, 'Totem costs 10 lives (1 from L16), 90 s cooldown')
    # GF "StrikerJones 5.json"/"19.json": IgnoreDmgImmunityModel removes Black (2) with chance 0.5, then 1
    bl = lambda lv: buffs('heroes', 'striker', 'bloonLosesImmunity', where=lv)
    check(bl(5)[0]['n']['chance'] == 0.5 and bl(19)[0]['n']['chance'] == 1 and bl(19)[0]['n']['immune'] == ['black'], 'Striker Black 50% from L5, 100% from L19')
    check(not bl(4), 'no Striker Black effect before L5')
    sw = lambda lv: buffs('heroes', 'silas', 'bloonLosesImmunity', where=lv)
    check(sw(5)[0]['n']['chance'] == 0.5 and sw(13)[0]['n']['chance'] == 1 and sw(13)[0]['n']['immune'] == ['white'], 'Silas White 50% from L5, 100% from L13')
    # GF "Gwendolin 4.json" BonusProjectileAfterIntervalModel interval 40, HeatItUp lifespan 8
    h = buffs('heroes', 'gwendolin', t='HeatItUpDamageBuffModel', where=4)
    check(h and h[0]['afterShots'] == 40 and h[0]['v']['lifespan'] == 8, 'Heat It Up every 40 attacks, lasts 8 s')
    check(not buffs('heroes', 'gwendolin', t='HeatItUpDamageBuffModel', where=3), 'no Heat It Up before L4')
    # GF "Corvus 5.json" VisionModel: unlocksAtLevel 5, 170 mana, 15 s, 30 s cooldown
    v = buffs('heroes', 'corvus', t='VisionModel', where=5)
    check(v and v[0]['v']['initialManaCost'] == 170 and v[0]['v']['duration'] == 15 and v[0]['v']['unlocksAtLevel'] == 5, 'Corvus Vision 170 mana, 15 s, L5')
    # GF "ObynGreenfoot 8.json": camo to Druids and Skywardens in Obyn's range
    o = buffs('heroes', 'obyn', 'camo', where=8)
    check(o and o[0]['v']['who']['ids'] == ['Druid', 'Skywarden'] and o[0]['radius'] == 'tower', "Obyn L8 camo for Druids/Skywardens in range")


def t_geraldo():
    # GF GeraldoItems/SeeInvisibilityPotion.json: level 3, 5 rounds
    g = [x for x in S['geraldoItems'] if x['item'] == 'SeeInvisibilityPotion']
    check(g and g[0]['levelUnlockedAt'] == 3 and g[0]['fx'][0]['rounds'] == 5, 'See Invisibility Potion L3, 5 rounds')


def main():
    for fn in (t_meta_and_size, t_sources_exist, t_village, t_alchemist, t_engineer, t_other_towers, t_heroes, t_geraldo):
        try:
            fn()
        except Exception as e:  # a missing record is a failure, not a crash
            RESULTS['fail'].append('%s raised %r' % (fn.__name__, e))
    total = RESULTS['pass'] + len(RESULTS['fail'])
    for m in RESULTS['fail']:
        print('FAIL:', m)
    print('%d/%d checks passed' % (RESULTS['pass'], total))
    return 1 if RESULTS['fail'] else 0


def test_all():
    assert main() == 0


if __name__ == '__main__':
    sys.exit(main())
