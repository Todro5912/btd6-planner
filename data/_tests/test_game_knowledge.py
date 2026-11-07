"""Known-truth and schema tests for data/game/knowledge.json (tools/game/extract_knowledge.py, game v56.0 export).

Plain Python, no dependencies. Run either way:
    python3 data/_tests/test_game_knowledge.py
    python3 -m pytest data/_tests/test_game_knowledge.py

Every known-truth assertion names its source. Short keys:
  GD:<path>  file in the btd6-game-data export (https://github.com/Btd6ModHelper/btd6-game-data, tag 56.0)
  TT:<key>   textTable.json display text in the same export (the game's own in-game description)
  BW-MK      Bloons Wiki, Monkey Knowledge      https://www.bloonswiki.com/Monkey_Knowledge
  SITE       this repo's data/monkey-knowledge.json / static/progress.js (ids must stay compatible)
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.dirname(HERE)
PATH = os.path.join(DATA, 'game', 'knowledge.json')

with open(PATH, encoding='utf-8') as f:
    K = json.load(f)
N = {n['id']: n for n in K['nodes']}


def eff(nid, kind, **match):
    out = [e for e in N[nid]['effects'] if e['kind'] == kind and all(e.get(k) == v for k, v in match.items())]
    assert out, '%s has no %s effect matching %s: %s' % (nid, kind, match, N[nid]['effects'])
    return out[0]


def towers(nid):
    return {a['site'] for a in N[nid]['applies'] if a.get('site')}


# ---------------------------------------------------------------- schema
def test_schema_and_size():
    assert os.path.getsize(PATH) < 2 * 1024 * 1024
    keys = {'id', 'site', 'name', 'desc', 'tree', 'category', 'idx', 'pts', 'mm', 'pre', 'unlocks', 'tags', 'effects', 'applies',
            'layout', 'src'}
    tags = {'cash', 'prices', 'xp', 'attacks', 'lives', 'abilities', 'powers', 'other'}
    for n in K['nodes']:
        assert keys <= set(n), n['id']
        assert n['src'].startswith('Knowledge/' + n['tree'] + '/'), n['src']
        assert n['effects'] and n['tags'] and set(n['tags']) <= tags, n['id']
        assert n['name'] and n['desc'], n['id']
        assert all('kind' in e and 'type' in e for e in n['effects'])
    assert K['siteIdMap'] and K['overrides'] == []


def test_counts():
    # GD: Knowledge/<Tree>/ file counts; BW-MK: "134 Monkey Knowledge" (32/30/22/22/13/15)
    assert len(K['nodes']) == 134
    want = {'Primary': 32, 'Military': 30, 'Magic': 22, 'Support': 22, 'Heroes': 13, 'Powers': 15}
    assert {t: v['nodes'] for t, v in K['treeInfo'].items()} == want
    assert K['_meta']['pointsToBuyAll'] == 134
    assert K['_meta']['pointsCap'] is None  # not in the export
    assert K['_meta']['pointsCapExternal']['value'] == 138  # Fandom MK page, flagged as non-export
    assert K['_meta']['danglingPrereqs'] == []


def test_category_map():
    # GD: every Knowledge/<Tree>/*.json has a single category; TT:"Primary Knowledge".."Powers Knowledge" order
    assert K['_meta']['categoryMap'] == {'0': 'Primary', '1': 'Military', '2': 'Magic', '3': 'Support', '4': 'Heroes', '5': 'Powers'}
    for n in K['nodes']:
        assert K['_meta']['categoryMap'][str(n['category'])] == n['tree']
    # GD: TowerModel.towerSet == 1 << category, for the towers a single-tree node names explicitly
    sys.path.insert(0, os.path.join(os.path.dirname(DATA), 'tools', 'game'))
    import extract_knowledge as X
    gd = os.environ.get('GD', X.DEFAULT_GD)
    if not os.path.isdir(gd):
        return
    checks = {'EliteMilitaryTraining': 1, 'AdvancedLogistics': 1, 'FastTackAttacks': 0, 'CheapRangs': 0, 'FarmSubsidy': 3}
    for nid, cat in checks.items():
        named = [t for e in N[nid]['effects'] for t in (e.get('towers') or e.get('who') or []) if isinstance(e.get('towers') or e.get('who'), list)]
        named += [a['site'] for a in N[nid]['applies'] if a['kind'] == 'tower']
        assert named, nid
        for t in named:
            folder = X.SITE_TOWERS[t]
            with open(os.path.join(gd, 'Towers', folder, folder + '.json'), encoding='utf-8') as f:
                assert json.load(f)['towerSet'] == 1 << cat, (nid, t)


# ---------------------------------------------------------------- known truths: cost/points (GD knowledge files)
def test_points_and_mm():
    # GD: Knowledge/Primary/MoreCash.json investmentRequired 10, monkeyMoneyCost 1000
    assert (N['MoreCash']['pts'], N['MoreCash']['mm']) == (10, 1000)
    # GD: Knowledge/Support/MonkeyEducation.json 3 / 0, no prerequisite
    assert (N['MonkeyEducation']['pts'], N['MonkeyEducation']['mm'], N['MonkeyEducation']['pre']) == (3, 0, [])
    # GD: Knowledge/Military/BigBloonSabotage.json 14 / 1000, needs Sub Admiral and Master Defender
    assert (N['BigBloonSabotage']['pts'], N['BigBloonSabotage']['mm']) == (14, 1000)
    assert set(N['BigBloonSabotage']['pre']) == {'SubAdmiral', 'MasterDefender'}
    # GD: Knowledge/Magic/MoMonkeyMoney.json needs SpeedyBrewing, which needs MagicTricks (not Lingering Magic)
    assert N['MoMonkeyMoney']['pre'] == ['SpeedyBrewing'] and N['SpeedyBrewing']['pre'] == ['MagicTricks']
    # GD: (pts, mm) gates per tree, matching BW-MK's tier table
    gates = {t: sorted({(n['pts'], n['mm']) for n in K['nodes'] if n['tree'] == t}) for t in K['treeInfo']}
    assert gates['Primary'] == [(0, 0), (5, 0), (8, 250), (10, 500), (10, 1000)]
    assert gates['Military'] == [(0, 0), (4, 0), (8, 250), (8, 500), (14, 1000)]
    assert gates['Powers'] == [(0, 0), (3, 0), (3, 250), (3, 500), (10, 1000)]
    assert K['_meta']['mmToBuyAll'] == sum(v['mmTotal'] for v in K['treeInfo'].values()) == 33750


# ---------------------------------------------------------------- known truths: effects
def test_cash_and_prices():
    # TT:MoreCashDescription "Increase starting cash by 200."
    assert eff('MoreCash', 'startCash')['value'] == 200
    # TT:CheapRangsDescription "Base cost of Boomerang Thrower reduced by 50." (every boomerang, not just the first)
    e = eff('CheapRangs', 'towerCost')
    assert (e['towers'], e['value'], e['firstOnly']) == (['boomerang'], -50, False)
    # TT:FarmSubsidyDescription "First Banana Farm each game costs 100 less."
    e = eff('FarmSubsidy', 'towerCost')
    assert (e['towers'], e['value'], e['firstOnly']) == (['farm'], -100, True)
    # TT:FirstLastLineOfDefenseDescription "... first Spike Factory each game is $150 less."
    assert eff('FirstLastLineOfDefense', 'towerCost')['value'] == -150
    # TT:MilitaryConscriptionDescription "... first Military Monkey each game is two thirds the normal."
    e = eff('MilitaryConscription', 'towerCost')
    assert e['pct'] == -0.33 and e['firstOnly'] and len(e['towers']) == 7
    # TT:AdvancedLogisticsDescription "All Military Monkeys base costs reduced by 5%."
    assert eff('AdvancedLogistics', 'towerCost')['pct'] == -0.05
    # TT:BetterSellDealsDescription "All Monkeys sell for 5% more."
    assert eff('BetterSellDeals', 'sellRate')['add'] == 0.05
    # TT:FlatPackBuildingsDescription "Farm and Village cost 2% less and sell for 2% more."
    assert eff('FlatPackBuildings', 'sellRate')['add'] == 0.02 and towers('FlatPackBuildings') == {'farm', 'village'}
    # TT:HeroFavorsDescription "Heroes' base cost reduced by 10%."
    assert eff('HeroFavors', 'heroCost')['pct'] == -0.1
    # TT:TradeAgreementsDescription "Merchantman generates +$20 per round."
    assert eff('TradeAgreements', 'income', what='perRound')['value'] == 20
    # TT:CheaperDoublesDescription "Ninja Double Shot cost reduced by 100." GD: Upgrades/Double Shot.json cost 900
    e = eff('CheaperDoubles', 'upgradeDiscount')
    assert (e['tower'], e['path'], e['tier'], e['baseCost'], e['cost']) == ('ninja', 1, 3, 900, 800)
    # TT:HiValueMinesDescription "Spiked Mines cost reduced by 1500." (Spike Factory 4-x-x)
    e = eff('HiValueMines', 'upgradeDiscount')
    assert (e['tower'], e['path'], e['tier'], e['value']) == ('spike', 1, 4, -1500)
    # TT:AeronauticSubsidyDescription "Monkey Ace tier 5 upgrades cost 10% less."
    assert sorted(e['tier'] for e in N['AeronauticSubsidy']['effects']) == [5, 5, 5]
    # every upgrade discount names the same tower that carries the mod
    for n in K['nodes']:
        for e in n['effects']:
            if e['kind'] == 'upgradeDiscount':
                assert e['tower'] in towers(n['id']), (n['id'], e)


def test_xp():
    # TT:MonkeyEducationDescription "All Monkeys XP earn rate increased by 8%." GD: mod on all 26 towers and every hero
    e = eff('MonkeyEducation', 'towerXp')
    assert e['mult'] == 1.08 and e['who'] == 'all' and {'quincy', 'dart', 'beast'} <= towers('MonkeyEducation')
    # TT:EliteMilitaryTrainingDescription "+1000xp ... 5% faster"
    assert eff('EliteMilitaryTraining', 'towerXp')['mult'] == 1.05
    assert eff('EliteMilitaryTraining', 'towerXpGrant')['xp'] == 1000
    # GD: Towers/MortarMonkey/*.json carry no EliteMilitaryTraining ApplyModModel (one-off grant still lists Mortar)
    assert 'mortar' not in towers('EliteMilitaryTraining')
    assert 'mortar' in eff('EliteMilitaryTraining', 'towerXpGrant')['towers']
    # TT:SelfTaughtHeroesDescription "Heroes earn XP 10% faster."
    e = eff('SelfTaughtHeroes', 'towerXp')
    assert e['mult'] == 1.1 and e['who'] == 'heroes'
    # TT:EmpoweredHeroesDescription "Heroes start each game at level 3."
    assert eff('EmpoweredHeroes', 'heroStartLevel')['startLevel'] == 3
    # TT:MonkeysTogetherStrongDescription "5% more experience per each Hero placed"
    assert eff('MonkeysTogetherStrong', 'heroXp')['perHeroPlaced'] == 0.05
    # TT:ScholarshipsDescription "Hero training costs reduced by 10%."
    assert eff('Scholarships', 'heroLevelCost')['mult'] == 0.9


def test_attacks_and_others():
    # TT:ExtraDartPopsDescription "+1 pierce to all shots"
    assert eff('ExtraDartPops', 'attack', stat='pierce')['add'] == 1 and towers('ExtraDartPops') == {'dart'}
    # TT:AirforceUpgradesDescription "Tier 3 or higher get +1 pierce"
    assert eff('AirforceUpgrades', 'attack', stat='pierce')['minTier'] == 3
    # TT:VeteranMonkeyTrainingDescription "reload time reduced by 3%"
    assert eff('VeteranMonkeyTraining', 'attack', stat='rate')['pct'] == 0.03
    # TT:FastTackAttacksDescription "attack speed increased by 8%"
    assert eff('FastTackAttacks', 'attack', stat='rate')['pct'] == 0.08
    # TT:HotMagicDescription "can pop Frozen Bloons" -> bloonProperties 16 = Frozen
    assert eff('HotMagic', 'attack', stat='canPop')['props'] == ['Frozen']
    # TT:StrikeDownTheFalseDescription "Sun Avatar can pop Purple Bloons" -> 8 = Purple
    assert eff('StrikeDownTheFalse', 'attack', stat='canPop')['props'] == ['Purple']
    # TT:VineRuptureDescription "big damage to all non-Lead Bloons": immune 17 = Lead + Frozen
    assert 'Lead' in eff('VineRupture', 'ability')['ability']['cantPop']
    # TT:BigBunchDescription "Grape Shot shoots 6 grapes" (base 5): +1
    assert eff('BigBunch', 'attack', stat='projectiles')['add'] == 1
    # TT:BigBloonSabotageDescription "MOAB-Class Bloons spawn in a partially damaged state": 10%
    assert eff('BigBloonSabotage', 'bloonHealth')['pct'] == -0.1
    # TT:ManaShieldDescription "absorbs up to 25 lives"
    assert eff('ManaShield', 'lives')['max'] == 25
    # TT:HealthyBananasDescription "Marketplaces ... 1 life per round and Central Markets produce 3"
    e = eff('HealthyBananas', 'lives')
    assert (e['marketplace'], e['centralMarket']) == (1, 3)


def test_powers():
    # TT:BudgetPontoonsDescription "Pontoon costs 40 Monkey Money." GD: Powers/Pontoon.json cost 50
    e = eff('BudgetPontoons', 'power', stat='mmCost')
    assert (e['power'], e['baseCost'], e['cost']) == ('Pontoon', 50, 40)
    # TT:CheaperLakesDescription "Portable Lake costs 40 Monkey Money."
    assert eff('CheaperLakes', 'power', stat='mmCost')['cost'] == 40
    # TT:SupaThriveDescription "Thrive adds 30% instead of 25%."
    assert eff('SupaThrive', 'power')['add'] == 0.05
    # TT:BiggerCamoTrapDescription "Camo Trap lasts for 600 Bloons." (+100)
    assert eff('BiggerCamoTrap', 'power')['add'] == 100


def test_tower_wiring_rules():
    # GD: Towers/DartMonkey/*: 4And4 only on x-3+-x (Triple Shot) files and the paragon
    w = [a for a in N['4And4']['applies'] if a['site'] == 'dart'][0]
    assert w['when'] == 'x-3+-x + paragon'
    # GD: Towers/BombShooter/*: Fraggy Frags only on x-x-2 (Frag Bombs; Cluster Bombs replaces frags)
    assert [a['when'] for a in N['FraggyFrags']['applies']] == ['x-x-2']
    # GD: Towers/<Hero>/<Hero> 20.json only: Ability Mastery is a level-20 effect
    assert {a['when'] for a in N['AbilityMastery']['applies']} == {'level 20+'}


# ---------------------------------------------------------------- layout
def test_layout():
    for tree, info in K['treeInfo'].items():
        ns = [n for n in K['nodes'] if n['tree'] == tree]
        cells = {(n['layout']['row'], n['layout']['col']) for n in ns}
        assert len(cells) == len(ns), tree + ': two nodes share a cell'
        for n in ns:
            L = n['layout']
            assert L['tree'] == tree and 0 <= L['col'] < info['cols'] and 0 <= L['row'] < info['rows']
            assert info['bands'][L['band']] == n['pts']
            for p in n['pre']:
                assert N[p]['layout']['row'] < L['row'], (n['id'], p)  # every arrow points down
        # higher point gates sit lower
        for a in ns:
            for b in ns:
                if a['pts'] < b['pts']:
                    assert a['layout']['row'] < b['layout']['row']
        assert info['cols'] <= 10, tree


# ---------------------------------------------------------------- site compatibility
def test_site_ids():
    # SITE: profile.mk keys are the old ids; they must map 1:1 onto game ids, and equal kebab(gameId)
    with open(os.path.join(DATA, 'monkey-knowledge.json'), encoding='utf-8') as f:
        old = json.load(f)
    ids = [o['id'] for o in old['nodes']]
    assert sorted(ids) == sorted(K['siteIdMap'])
    for o in old['nodes']:
        gid = K['siteIdMap'][o['id']]
        assert gid in N and N[gid]['site'] == o['id']
        if 'ptsNeeded' in o:
            assert o['ptsNeeded'] == N[gid]['pts'], o['id']
        if 'mm' in o:
            assert o['mm'] == N[gid]['mm'], o['id']
    assert len({n['site'] for n in K['nodes']}) == 134
    assert all(re.match(r'^[a-z0-9]+(-[a-z0-9]+)*$', n['site']) for n in K['nodes'])


if __name__ == '__main__':
    fails = 0
    for name, fn in sorted(globals().items()):
        if name.startswith('test_') and callable(fn):
            try:
                fn()
                print('ok  ', name)
            except AssertionError as e:
                fails += 1
                print('FAIL', name, e)
    sys.exit(1 if fails else 0)
