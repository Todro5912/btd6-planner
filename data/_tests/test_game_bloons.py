"""Known-truth tests for data/game/bloons.json and data/game/rounds.json (tools/game/extract_bloons.py).

Plain Python, no dependencies:  python3 data/_tests/test_game_bloons.py   (or python3 -m pytest ...)

Sources (short keys used in the assertions):
  GD       the game-data export itself, file named in the message (btd6-game-data, v56.0)
  BW-RBE   bloonswiki BTD6 RBE / HP values (Ceramic 104, MOAB 616, BFB 3,164, ZOMG 16,656, DDT 816, BAD 55,760)
           https://www.bloonswiki.com/MOAB_(BTD6) and the bloon pages it links
  BW-FP    bloonswiki Freeplay: pre-freeplay vs freeplay lives table and the MOAB HP ramp
           https://www.bloonswiki.com/Freeplay
  BW-CER   bloonswiki Ceramic (Super Ceramic: 60 HP, 1 Rainbow, RBE 68)  https://www.bloonswiki.com/Ceramic_(BTD6)
  BW-RT    bloonswiki round tables (RBE per round), as copied into data/rounds.json by the site
  BW-SPD   bloonswiki bloon speeds relative to Red (Ceramic 2.5, BFB 0.25, ZOMG 0.18, DDT 2.64)
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.dirname(HERE)
B = json.load(open(os.path.join(DATA, 'game', 'bloons.json'), encoding='utf-8'))
R = json.load(open(os.path.join(DATA, 'game', 'rounds.json'), encoding='utf-8'))
BL = B['bloons']
STD = R['sets']['default']
ABR = R['sets']['abr']

passed = failed = 0


def ok(cond, name, detail=None):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print('FAIL', name, '' if detail is None else '-> %r' % (detail,))
        if 'pytest' in sys.modules:
            raise AssertionError('%s %r' % (name, detail))


def test_rbe_known():
    # BW-RBE
    for bid, rbe in (('Ceramic', 104), ('Moab', 616), ('Bfb', 3164), ('Zomg', 16656), ('Ddt', 816), ('DdtCamo', 816),
                     ('Bad', 55760), ('Rainbow', 47), ('Lead', 23), ('Zebra', 23), ('Black', 11), ('Pink', 5)):
        ok(BL[bid]['rbe'] == rbe, 'RBE %s = %d (BW-RBE)' % (bid, rbe), BL[bid]['rbe'])
    # BW-FP "pre-freeplay lives cost" column = leak lives rounds 1-80, incl. fortified
    for bid, lives in (('LeadFortified', 26), ('CeramicFortified', 114), ('MoabFortified', 856), ('BfbFortified', 4824),
                       ('ZomgFortified', 27296), ('DdtFortified', 1256), ('BadFortified', 98360), ('Bad', 55760)):
        ok(BL[bid]['leak'] == lives, 'leak %s = %d (BW-FP)' % (bid, lives), BL[bid]['leak'])


def test_hp_speed_children():
    # GD Bloons/<x>/<x>.json maxHealth
    for bid, hp in (('Ceramic', 10), ('CeramicFortified', 20), ('LeadFortified', 4), ('Moab', 200), ('MoabFortified', 400),
                    ('Bfb', 700), ('Zomg', 4000), ('Ddt', 400), ('Bad', 20000), ('BadFortified', 40000)):
        ok(BL[bid]['hp'] == hp, 'HP %s = %d (GD)' % (bid, hp), BL[bid]['hp'])
    # BW-SPD; GD speed 25 = 1 RBS
    for bid, rbs in (('Red', 1), ('Ceramic', 2.5), ('Pink', 3.5), ('Bfb', 0.25), ('Zomg', 0.18), ('Ddt', 2.64), ('Bad', 0.18)):
        ok(abs(BL[bid]['rbs'] - rbs) < 1e-9, 'speed %s = %s RBS (BW-SPD)' % (bid, rbs), BL[bid]['rbs'])
    # GD SpawnChildrenModel
    ok(BL['Bad']['children'] == [['Zomg', 2], ['DdtCamo', 3]], 'BAD -> 2 ZOMG + 3 camo DDT (GD Bloons/Bad/Bad.json)', BL['Bad']['children'])
    ok(BL['DdtCamo']['children'] == [['CeramicRegrowCamo', 4]], 'camo DDT -> 4 camo regrow Ceramic (GD Bloons/Ddt/DdtCamo.json)')
    ok(BL['CeramicFortified']['children'] == [['Rainbow', 2]], 'fortified Ceramic drops plain Rainbows (GD)')
    ok(BL['MoabFortified']['children'] == [['CeramicFortified', 4]], 'fortified MOAB drops fortified Ceramics (GD)')
    ok(BL['Zebra']['children'] == [['Black', 1], ['White', 1]], 'Zebra -> 1 Black + 1 White (GD)')


def test_cash():
    # GD DistributeCashModel cash 1 per layer; BW-CER "Popping the Ceramic layer gives $1"
    ok(BL['Ceramic']['cash'] == 1 and BL['Ceramic']['cashTotal'] == 95, 'Ceramic pays $1 per layer, $95 in total (GD, BW-CER)')
    ok(BL['Moab']['cashTotal'] == 381, 'MOAB $381 total pop cash (GD tree)', BL['Moab']['cashTotal'])
    ok(BL['Bad']['cashTotal'] == 13346, 'BAD $13,346 total pop cash (GD tree)', BL['Bad']['cashTotal'])
    ok(BL['Golden']['cash'] == 0, 'Golden Bloon DistributeCash 0: its reward is paid by GoldenBloonModel code (GD)')


def test_immunity():
    # GD bloonProperties bits + DamageModel masks; matches data/pop-model.json damageTypes and BW Sharp table
    ok('sharp' in BL['Lead']['immuneTo'] and 'explosion' not in BL['Lead']['immuneTo'], 'Lead: sharp-immune, not explosion')
    ok(BL['Black']['immuneTo'] == ['explosion'], 'Black: explosion only', BL['Black']['immuneTo'])
    ok(set(BL['Ddt']['immuneTo']) == {'sharp', 'shatter', 'explosion', 'cold', 'energy'}, 'DDT = Lead + Black immunities')
    ok(set(BL['Purple']['immuneTo']) == {'fire', 'frigid', 'plasma', 'energy'}, 'Purple: fire/frigid/plasma/energy')
    ok(BL['Ddt']['props'] == 3 and 'camo' not in BL['Ddt']['flags'] and 'camo' in BL['DdtCamo']['flags'],
       'DDT model has Lead|Black; camo comes from the DdtCamo variant used by every round (GD)')
    ok(B['bosses']['Blastapopoulos']['tiers']['1']['propNames'] == ['purple'], 'Blastapopoulos has Purple (GD)')
    ok(B['bosses']['Dreadbloon']['tiers']['1']['propNames'] == ['lead'], 'Dreadbloon has Lead (GD)')


def test_rounds():
    ok(len(STD) == 140 and len(ABR) == 140, '140 standard and 140 ABR rounds (GD Rounds/)')
    g = STD[0]['groups']
    ok(g == [['Red', 20, 0, 17.51, 0.9217]], 'R1 = 20 Red, 0 -> 17.51 s (GD Rounds/DefaultRoundSet/1.json, 1050.75 frames)', g)
    ok(STD[39]['groups'][0][:2] == ['Moab', 1], 'R40 = 1 MOAB (GD)')
    ok(STD[99]['groups'][0][:2] == ['Bad', 1] and STD[99]['rbe'] == 55760, 'R100 = 1 BAD (GD)')
    ok(STD[62]['rbe'] == 14413 and STD[62]['cashPop'] == 2663, 'R63 RBE 14,413 / pop cash $2,663 (BW-RT)')
    ok(ABR[0]['groups'][0][:2] == ['Blue', 10], 'ABR R1 = 10 Blue (GD Rounds/AlternateRoundSet/1.json)')
    # GD IncomeSets/DefaultIncomeSet.json
    for n, m in ((50, 1), (51, 0.5), (60, 0.5), (61, 0.2), (85, 0.2), (86, 0.1), (100, 0.1), (101, 0.05), (121, 0.04), (140, 0.04)):
        ok(STD[n - 1]['popMult'] == m, 'pop cash multiplier R%d = %s (GD)' % (n, m), STD[n - 1]['popMult'])


def test_freeplay_overrides():
    # BW-RT (via data/rounds.json): R81+ RBE with Super Ceramics, one child and the blimp ramp
    for n, rbe in ((81, 44506), (100, 67200), (125, 939624), (140, 645440)):
        ok(STD[n - 1]['late']['rbe'] == rbe, 'R%d freeplay-rule RBE = %d (BW-RT)' % (n, rbe), STD[n - 1]['late']['rbe'])
    ok(STD[99]['late']['leak'] == 50300, 'R100 BAD leaks 50,300 lives in freeplay (BW-FP)', STD[99]['late']['leak'])
    ok(STD[99]['late']['blimpHpMult'] == 1.4 and STD[124]['late']['blimpHpMult'] == 2.75, 'blimp HP x1.40 at R100, x2.75 at R125 (BW-FP)')
    ok(B['overrides']['superCeramic']['hp'] == 60 and B['overrides']['superCeramic']['rbe'] == 68, 'Super Ceramic 60 HP / RBE 68 (BW-CER)')


def test_modes():
    e = B['modeEffects']
    ok(e['Medium']['bloonSpeedMult'] == 1.1 and e['Hard']['bloonSpeedMult'] == 1.25, 'Medium x1.1, Hard x1.25 (GD Mods/*.json GlobalSpeedModModel)')
    ok('bloonSpeedMult' not in e['Easy'], 'Easy has no speed mod (GD Mods/Easy.json)')
    ok(e['DoubleMoabHealth']['healthMult'] == {'tag': 'Moabs', 'mult': 2}, 'Double HP MOABs: x2 to tag Moabs (GD)')
    ok(e['Easy']['setHealth'][0]['round'] == 40 and abs(e['Easy']['setHealth'][0]['mult'] - 2 / 3) < 1e-3, 'Easy R40 MOAB 2/3 HP (GD)')
    ok(e['Apopalypse']['endRound'] == 60, 'Apopalypse ends R60 (GD Mods/Apopalypse.json)')
    ok(e['AlternateBloonsRounds']['roundSet'] == 'AlternateRoundSet', 'ABR swaps the round set (GD)')


def test_bosses():
    bs = B['bosses']
    ok(sorted(bs) == ['Blastapopoulos', 'Bloonarius', 'Diamondback', 'Dreadbloon', 'Lych', 'Phayze', 'Vortex'], '7 bosses')
    ok(all(len(b['tiers']) == 10 for b in bs.values()), '5 normal + 5 elite tiers each (GD Bloons/<Boss>/)')
    t = bs['Bloonarius']['tiers']
    ok(t['1']['hp'] == 20000 and t['e5']['hp'] == 40000000, 'Bloonarius T1 20,000 HP, Elite T5 40,000,000 (GD)')
    ok(t['1']['skulls'] == [0.75, 0.5, 0.25] and t['1']['bleed']['everyPct'] == 0.01, 'Bloonarius T1 skulls 75/50/25, bleed every 1% (GD)')
    ok(len(bs['Lych']['tiers']['1']['skulls']) == 5, 'Lych 5 ethereal skulls (GD LychBossSuperScriptModel)')
    lw = [x for x in bs['Lych']['tiers']['1']['behaviors'] if x['_t'] == 'WorthReductionModel']
    ok(lw and lw[0]['worthMultiplier'] == 0.35, 'Lych cuts sell value to 35% (GD WorthReductionModel)')
    vb = [x for x in bs['Vortex']['tiers']['1']['behaviors'] if x['_t'] == 'BuffBloonSpeedModel']
    ok(vb and vb[0]['speedBoost'] == 2.5, 'Vortex gives bloons 2.5x speed (GD BuffBloonSpeedModel)')


def test_traceable_and_compact():
    ok(all('src' in r for r in BL.values()) and all('src' in r for r in STD + ABR), 'every record carries its source file')
    for name in ('bloons.json', 'rounds.json'):
        size = os.path.getsize(os.path.join(DATA, 'game', name))
        ok(size < 2_000_000, '%s under 2 MB' % name, size)


if __name__ == '__main__':
    for k, f in sorted(globals().items()):
        if k.startswith('test_') and callable(f):
            f()
    print('%d passed, %d failed' % (passed, failed))
    sys.exit(1 if failed else 0)
