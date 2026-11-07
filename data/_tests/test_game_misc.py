"""Known truths checked against data/game/misc.json (built by tools/game/extract_misc.py from btd6-game-data v56.0).

    python3 data/_tests/test_game_misc.py

Each assertion cites its source: the game export file (G: path, relative to the export root) and, where a public
reference states the same value, a wiki URL.
"""
import json
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
D = json.load(open(os.path.join(REPO, 'data', 'game', 'misc.json'), encoding='utf-8'))
FAILS = []


def check(cond, msg):
    if not cond:
        FAILS.append(msg)


P = {p['id']: p for p in D['powers']}
GI = {g['id']: g for g in D['geraldoItems']}
M = {m['id']: m for m in D['modes']}
E = {k: v['effective'] for k, v in D['modeComposition'].items()}
MAPS = {m['id']: m for m in D['maps']}


def eff(p, t):
    return next(e for e in p.get('effects', []) if e['t'] == t)


# ---------- powers ----------
check(len(D['powers']) == 28, 'G: Powers/ holds 28 power files')
mb = eff(P['MonkeyBoost'], 'MonkeyBoostModel')
check(mb['rateScale'] == 0.5 and mb['duration'] == 15, 'G: Powers/MonkeyBoost.json rateScale 0.5, 15 s; textTable "attack twice as fast"; https://www.bloonswiki.com/Monkey_Boost')
check(P['MonkeyBoost']['costMM'] == 100, 'G: Powers/MonkeyBoost.json cost 100')
cd = eff(P['CashDrop'], 'CashDropModel')['projectileModel']['cash']
check(cd == {'min': 2500, 'max': 2500}, 'G: Powers/CashDrop.json CashModel 2500; https://www.bloonswiki.com/Cash_Drop')
check(eff(P['Thrive'], 'ThriveModel')['cashScale'] == 1.25, 'G: Powers/Thrive.json cashScale 1.25 (+25%)')
rs = eff(P['RoadSpikes'], 'RoadSpikesModel')['projectileModel']
check(rs['pierce'] == 20 and rs['damage'] == 1 and P['RoadSpikes']['quantity'] == 5, 'G: Powers/RoadSpikes.json pierce 20, 5 piles; textTable "5 piles of Road Spikes"')
mm = eff(P['MoabMine'], 'MoabMineModel')['projectileModel']
check(mm['damage'] == 5000 and mm['pierce'] == 10, 'G: Powers/MoabMine.json damage 5000, 10 targets; textTable "detonate on 10 targets"')
check({'tag': 'Boss', 'add': -4500, 'mult': 1} in mm['bonus'], 'G: Powers/MoabMine.json Boss -4500 (bosses take 500)')
gt = eff(P['GlueTrap'], 'GlueTrapModel')['projectileModel']
check(gt['pierce'] == 300 and gt['slow']['mult'] == 0.5 and P['GlueTrap']['quantity'] == 2, 'G: Powers/GlueTrap.json pierce 300, 50% slow, 2 per purchase')
check(gt['extraPierceCost'].get('Bad') == 99, 'G: Powers/GlueTrap.json BAD costs 100 pierce')
check(eff(P['CamoTrap'], 'CamoTrapModel')['projectileModel']['pierce'] == 500, 'G: Powers/CamoTrap.json pierce 500')
check(eff(P['SuperMonkeyStorm'], 'DamageAllModel')['amount'] == 4000, 'G: Powers/SuperMonkeyStorm.json DamageAllModel 4000')
dt = eff(P['DartTime'], 'DartTimeModel')
check(dt['bloonSpeed'] == 0.3 and dt['towerAttackSpeed'] == 0.7 and dt['duration'] == 10, 'G: Powers/DartTime.json (Time Stop)')
et = {o['t']: o for o in P['EnergisingTotem']['tower']['other']}
check(et['RateSupportModel']['multiplier'] == 0.75 and et['EnergisingTotemBehaviorModel']['rounds'] == 5,
      'G: Powers/EnergisingTotem.json; textTable "+25% attack speed... Lasts 5 rounds"')
check(et['EnergisingTotemBehaviorModel']['monkeyMoneyCost'] == 20, 'G: Powers/EnergisingTotem.json recharge 20 MM')
check(P['HealthPotion']['availableInMode'] == 'Frontier', 'G: Powers/HealthPotion.json availableInMode Frontier')
check(P['Pontoon']['tower']['areaTypes'] == [1], 'G: Powers/Pontoon.json placed on water (areaTypes [1])')
check(P['TechBotPrime']['pro'] and P['MonkeyBoostPro']['pro'], 'G: Powers/*Pro*.json IsPowerPro')
check(P['BananaFarmer']['tower']['range'] == 60, 'G: Powers/BananaFarmer.json collect range 60')

# ---------- Geraldo items ----------
check(len(GI) == 16, 'G: GeraldoItems/ holds 16 files')
lv = {g: GI[g]['unlockLevel'] for g in GI}
want = {'ShootyTurret': 1, 'StackOfOldNails': 1, 'CreepyIdol': 1, 'JarOfPickles': 1, 'RareQuincyActionFigure': 2, 'SeeInvisibilityPotion': 3,
        'TubeOfAmazoGlue': 4, 'SharpeningStone': 5, 'WornHerosCape': 6, 'BladeTrap': 7, 'BottleHotSauce': 8, 'Fertilizer': 9, 'PetRabbit': 10,
        'RejuvPotion': 11, 'GenieBottle': 12, 'ParagonPowerTotem': 20}
check(lv == want, 'G: GeraldoItems/*.json levelUnlockedAt == textTable "Geraldo Level N Description"; https://www.bloonswiki.com/Geraldo_(BTD6)')
check(GI['ParagonPowerTotem']['cost'] == 26000, 'G: GeraldoItems/ParagonPowerTotem.json cost 26000')
check(D['paragon']['totemPower'] == 2000, 'G: Towers/ParagonPowerTotem/ParagonPowerTotemTower.json ParagonSacrificeBonusModel 2000; https://www.bloonswiki.com/Paragon_Power_Totem')
check(GI['RareQuincyActionFigure']['bannedForModes'] == ['Clicks', 'Deflation', 'BossRush'], 'G: GeraldoItems/RareQuincyActionFigure.json bannedForModes')
check(GI['Fertilizer']['bannedForModes'] == ['Clicks'], 'G: GeraldoItems/Fertilizer.json banned in CHIMPS (Clicks)')
rj = next(e for e in GI['RejuvPotion']['effects'] if e['t'] == 'RejuvPotionBehaviorModel')
check(rj['livesGained'] == 50, 'G: GeraldoItems/RejuvPotion.json 50 lives; textTable "restores 50 lives"')
sp = next(e for e in GI['SeeInvisibilityPotion']['effects'] if e['t'] == 'SeeInvisibilityPotionBehaviorModel')
check(sp['rounds'] == 5 and sp['roundsUpgradedTo'] == 10 and sp['upgradeV2At'] == 14, 'G: GeraldoItems/SeeInvisibilityPotion.json')
check([u['level'] for u in GI['CreepyIdol']['upgradesAt']] == [12, 18], 'G: GeraldoItems/CreepyIdol.json V2 at 12, V3 at 18')

# ---------- paragon ----------
deg = {x['degree']: x for x in D['paragon']['degrees']}
check(len(deg) == 100 and deg[1]['power'] == 0 and deg[2]['power'] == 2000 and deg[100]['power'] == 200000, 'G: paragonDegreeData.json powerDegreeRequirements')
check(deg[20]['power'] == 11032 and deg[80]['power'] == 120115, 'G: paragonDegreeData.json degree 20 = 11032, 80 = 120115')
check(abs(deg[10]['cooldownMult'] - 0.825083) < 1e-3 and abs(deg[100]['cooldownMult'] - 0.586854) < 1e-3,
      'cooldown 82.5083% at 10, 58.6854% at 100: https://www.bloonswiki.com/Paragon')
check(deg[19]['bossMult'] == 1 and deg[20]['bossMult'] == 1.25 and deg[100]['bossMult'] == 2.25, 'boss x1.25 per 20 degrees: https://www.bloonswiki.com/Paragon')
pp = D['paragon']['params']
check(pp['maxPowerFromMoneySpent'] == 60000 and pp['maxPowerFromPops'] == 90000 and pp['tier5TowersMultByX'] == 6000,
      'G: paragonDegreeData.json v56 caps (v57 values live in overrides)')
pt = {t['tower']: t for t in D['paragon']['towers']}
check(len(pt) == 13 and pt['DartMonkey']['cost'] == 150000 and pt['MonkeyAce']['cost'] == 900000, 'G: Upgrades/* Paragon.json, 13 paragons in v56')
check('SniperMonkey' not in pt, 'G: no Sniper paragon in v56 (added 57.0)')

# ---------- modes ----------
check(len(M) == 22, 'G: Mods/ holds 22 files')
h = E['hard']
check(h['costMult'] == 1.08 and h['startRound'] == 3 and h['endRound'] == 80 and h['lives'] == 100 and h['bloonSpeedMult'] == 1.25, 'G: Mods/Hard.json')
check(E['medium']['bloonSpeedMult'] == 1.1 and E['medium']['lives'] == 150 and E['medium']['costMult'] == 1, 'G: Mods/Medium.json')
check(E['easy']['costMult'] == 0.85 and E['easy']['endRound'] == 40 and E['easy']['lives'] == 200, 'G: Mods/Easy.json')
c = E['chimps']
check(c['lives'] == 1 and c['sellMult'] == 0 and 'BananaFarm' in c['lockedTowers'] and 'noMK' in c['flags'] and c['startRound'] == 6 and c['endRound'] == 100,
      'G: Mods/Hard.json + Mods/Clicks.json (CHIMPS)')
check(E['impoppable']['costMult'] == 1.2 and E['impoppable']['lives'] == 1, 'G: Mods/Impoppable.json GlobalCostModModel 1.2, MaxHealth set 1')
df = E['deflation']
check(df['startCash'] == 20000 and df['startRound'] == 31 and df['endRound'] == 60 and df['cashMult'] == 0 and 'BananaFarm' in df['lockedTowers'], 'G: Mods/Deflation.json')
check(E['half-cash']['startCash'] == 325 and E['half-cash']['cashMult'] == 0.5, 'G: Mods/HalfCash.json x0.5')
check(E['abr']['roundSet'] == 'AlternateRoundSet', 'G: Mods/AlternateBloonsRounds.json')
check(E['magic-monkeys-only']['lockedTowerSets'] == ['Military', 'Primary', 'Support'], 'G: Mods/MagicOnly.json locks sets 1, 2, 8')
check(M['CoopDeflationCash2']['norm']['startCash'] == 24000 and M['CoopStandardCash2']['norm']['startCash'] == 1100, 'G: Mods/Coop*Cash2.json')
check(E['easy']['roundBonus'] == {'base': 100, 'perRound': 1}, 'G: Mods/Easy.json BonusCashPerRoundModModel: 100 + round')
check(E['impoppable']['mm']['base'] * E['impoppable']['mm']['mult'] == 300, 'G: Mods/Impoppable.json MM x1.5 of Hard 200')

# ---------- income sets ----------
inc = {i['id']: i for i in D['incomeSets']}
check(inc['DefaultIncomeSet']['thresholds'] == [[50, 1], [60, 0.5], [85, 0.2], [100, 0.1], [120, 0.05], [140, 0.04]] and inc['DefaultIncomeSet']['final'] == 0.02,
      'G: IncomeSets/DefaultIncomeSet.json; https://www.bloonswiki.com/Freeplay (cash per pop drops after R50)')
check(len(inc) == 7, 'G: IncomeSets/ holds 7 files')

# ---------- XP ----------
hx = D['xp']['heroes']
check(hx['Quincy']['cumulative'][20] == 213560 and hx['Quincy']['cumulative'][2] == 180, 'G: Upgrades/<Quincy level>.json xpCost sums')
check(hx['CaptainChurchill']['ratioToQuincy'] == 1.71 and hx['Benjamin']['ratioToQuincy'] == 1.5 and hx['Ezili']['ratioToQuincy'] == 1.425,
      'hero XP ratios 1.71 / 1.5 / 1.425: https://www.bloonswiki.com/Heroes_(BTD6)')
check(len(hx) == 18, 'G: 18 heroes in v56')

# ---------- maps ----------
check(len(D['maps']) == 90, 'G: Maps/*/ holds 90 files')
check(sum(1 for m in D['maps'] if m['difficulty'] == 'Expert') == 14, 'G: Maps/Expert/ holds 14 maps')
check(MAPS['Tutorial']['name'] == 'Monkey Meadow' and MAPS['Tutorial']['hasWater'] is False, 'G: Maps/Beginner/Tutorial.json + textTable')
check(MAPS['Blons']['isStandard'] is False and MAPS['ProtectTheYacht']['isStandard'] is False, 'G: Maps/*: Blons, Protect The Yacht not standard (no medals)')
check('ShipCapture' not in MAPS, 'G: Ship Capture is a v57 map')

# ---------- overrides & traceability ----------
check(all(o.get('source', '').startswith('https://') for o in D['overrides']), 'every override carries a source URL')
for sec in ('powers', 'geraldoItems', 'modes', 'incomeSets', 'maps'):
    check(all(x.get('src') for x in D[sec]), sec + ': every record has src')
check(os.path.getsize(os.path.join(REPO, 'data', 'game', 'misc.json')) < 2_000_000, 'misc.json under 2 MB')

if FAILS:
    print('FAIL', len(FAILS))
    for f in FAILS:
        print(' -', f)
    sys.exit(1)
print('ok: test_game_misc')
