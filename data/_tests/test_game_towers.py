"""Known-truth tests for data/game/towers.json (tools/game/extract_towers.py, game v56.0 export).

    python3 data/_tests/test_game_towers.py      (or pytest)

Each assertion names its source: a game file under https://github.com/Btd6ModHelper/btd6-game-data (paths are
relative to that repo, checked out at /home/claude/gd/g), textTable.json (the game's own upgrade descriptions), or a
Bloons Wiki page.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(os.path.dirname(HERE), 'game', 'towers.json'), encoding='utf-8'))
ATT = D['attacks']
ALL = sorted(['red', 'lead', 'black', 'white', 'zebra', 'purple', 'frozen', 'glass', 'ceramic', 'camo', 'camoHit', 'fortified',
              'moab', 'ddt', 'bad', 'boss'])


def cp(t, code):
    return D['towers'][t]['crosspaths'][code]


def attacks(rec):
    return [ATT[k] for k in rec['attacks']]


def can(a):
    return set() if a.get('noDamage') else set(ALL) - set(a.get('cannot', []))


def summary_can(rec):
    s = rec['summary']
    return set() if s.get('noDamage') else set(ALL) - set(s.get('cannot', []))


def main_weapon(t, code, attack_name='Attack'):
    a = next(a for a in attacks(cp(t, code)) if a['a'] == attack_name)
    return a, a['weapons'][0]


# ---------------------------------------------------------------- shape
def test_counts():
    # 64 legal crosspaths (000 plus at most two paths, at most one above tier 2) for each of the 26 towers
    assert len(D['towers']) == 26
    for t, rec in D['towers'].items():
        assert len(rec['crosspaths']) == 64, t
        assert all(len(p) == 5 for p in rec['upgrades']), t
    # 18 heroes x 20 levels, Dan included (Towers/DanDMonke/DanDMonke*.json)
    assert len(D['heroes']) == 18 and all(len(h['levels']) == 20 for h in D['heroes'].values())
    assert 'dan' in D['heroes']


def test_every_record_traceable():
    for t, rec in D['towers'].items():
        for code, c in rec['crosspaths'].items():
            assert c['src'].startswith('Towers/'), (t, code)
            for k in c['attacks']:
                assert k in ATT
            for s in c.get('subTowers', []):
                assert s['ref'] in D['subTowers'], s
    for s in D['subTowers'].values():
        assert s['firstSeen'].startswith('Towers/')


def test_size():
    assert os.path.getsize(os.path.join(os.path.dirname(HERE), 'game', 'towers.json')) < 2_000_000


# ---------------------------------------------------------------- immunity enum
def test_damage_type_enum():
    # Bloons/*/*.json bloonProperties: Lead 1, Black 2, White 4, Purple 8, Glass 64; Sharp (17) = Lead|Frozen
    dt = D['_meta']['damageTypes']
    assert dt['sharp']['bits'] == 17 and dt['sharp']['cantDamage'] == ['lead', 'frozen']
    assert dt['explosion']['bits'] == 2 and dt['explosion']['cantDamage'] == ['black']
    assert dt['energy']['cantDamage'] == ['lead', 'purple', 'glass']
    assert dt['cold']['cantDamage'] == ['lead', 'white']
    assert dt['acid']['cantDamage'] == ['glass']


# ---------------------------------------------------------------- base numbers
def test_dart_base():
    # Towers/DartMonkey/DartMonkey.json: rate 0.95, pierce 2, damage 1, immuneBloonProperties 17, range 32;
    # bloonswiki Dart Monkey (BTD6): 1 damage, 2 pierce, 0.95 s, range 32
    a, w = main_weapon('dart', '000')
    assert a['range'] == 32 and w['cd'] == 0.95 and w['p']['pierce'] == 2 and w['p']['dmg'] == 1 and w['p']['type'] == 'sharp'
    assert not a.get('camo') and w['p'].get('noCamo')
    assert D['towers']['dart']['baseCost'] == 200
    assert D['towers']['dart']['upgrades'][0][0] == {'cost': 140, 'id': 'Sharp Shots', 'name': 'Sharp Shots', 'path': 0, 'tier': 1, 'xp': 0}


def test_bomb_explosion_is_explosion():
    # Towers/BombShooter/BombShooter.json: Explosion DamageModel immuneBloonProperties 2 (Black)
    a, w = main_weapon('bomb', '000')
    ex = w['p']['subs'][0]['p']
    assert ex['id'] == 'Explosion' and ex['type'] == 'explosion'
    assert 'black' in a['cannot'] and 'lead' not in a['cannot'] and a['canDamageVia']['lead'] == 'sub'


def test_tack_and_ace_spread():
    # TackShooter.json: ArcEmissionModel count 8, angle 360; MonkeyAce.json: 8 darts radial, fires without a target
    _, w = main_weapon('tack', '000')
    assert w['n'] == 8 and w['arc'] == 360 and w['em'] == 'Arc'
    _, w = main_weapon('ace', '000')
    assert w['n'] == 8 and w.get('noTarget')


def test_desperado_burst():
    # textTable 'Desperado Description': "Attacks in 2 shot bursts" -> BurstWeaponBehaviorModel count 2
    _, w = main_weapon('desperado', '000')
    assert w['burst']['n'] == 2 and abs(w['sps'] - 2 / 1.2) < 0.01


# ---------------------------------------------------------------- rates the old build_power misread
def test_buccaneer_secondary_is_paired():
    # MonkeyBuccaneer.json: 'Secondary' weapon rate 0.05 with FireWhenAlternateWeaponIsReadyModel: it fires when the
    # primary (rate 1.0, FireAlternateWeaponModel) fires, so its real rate is 1/s, not 20/s
    a = attacks(cp('buccaneer', '000'))[0]
    sec = next(w for w in a['weapons'] if w.get('w') == 'Weapon Secondary')
    assert sec['cd'] == 0.05 and sec['pairedWith'] == 0 and sec['sps'] == 1


def test_mad_moab_damage():
    # DartlingGunner-050.json (M.A.D.): rocket DamageModel damage 0 + DamageModifierForTagModel Moabs +450
    a = attacks(cp('dartling', '050'))[0]
    p = a['weapons'][0]['p']
    assert p.get('dmg', 0) == 0 and {'tags': ['Moabs'], 'add': 450, 'mult': 1} in p['bonus']
    assert a['est']['dpsMoab'] > 1000


def test_flash_bomb_alternate_is_normal():
    # NinjaMonkey-003.json: AlternateProjectileModel interval 4, FlashBomb Explosion DamageModel immune 0 (Normal)
    _, w = main_weapon('ninja', '003')
    assert w['alt']['every'] == 4
    ex = w['alt']['p']['subs'][0]['p']
    assert ex['type'] == 'normal' and ex['dmg'] == 3


# ---------------------------------------------------------------- damage types per crosspath
def test_known_pops():
    # textTable 'Supply Drop Description': "Regular attack also damages Lead Bloons" (SniperMonkey-040 imm 0)
    assert 'lead' in summary_can(cp('sniper', '040'))
    # textTable 'Increased Accuracy Description': "...enough to hit Camo Bloons!" (MortarMonkey-001 FilterInvisible off)
    assert 'camo' in summary_can(cp('mortar', '001')) and 'camo' not in summary_can(cp('mortar', '000'))
    # textTable 'Ball Lightning Description': "Able to perceive Camo Bloons." (Druid-400)
    assert 'camo' in summary_can(cp('druid', '400')) and 'camo' not in summary_can(cp('druid', '300'))
    # textTable 'Blade Shooter Description': "...can shatter frozen Bloons" (TackShooter-030 imm 1 = Shatter)
    assert 'frozen' in summary_can(cp('tack', '030'))
    # bloonswiki Monkey Village: base Village has no attack
    assert cp('village', '000')['summary'].get('noDamage')
    # Wizard base bolts are Energy: no Lead, no Purple (WizardMonkey.json imm 73)
    s = summary_can(cp('wizard', '000'))
    assert 'lead' not in s and 'purple' not in s and 'frozen' in s
    # Ice Monkey base can't hit MOAB-class (IceMonkey.json FilterOutTag Moabs) and can't hit already-frozen bloons
    s = summary_can(cp('ice', '000'))
    assert 'moab' not in s and 'frozen' not in s
    # Fighter Plane missiles only target MOAB-class (MonkeyAce-300.json FilterWithTagModel Moabs inclusive=False)
    assert 'lead' not in summary_can(cp('ace', '300'))


def test_heroes():
    # Towers/Ezili/Ezili.json: main attack has no FilterInvisible -> camo from level 1
    assert 'camo' in summary_can(D['heroes']['ezili']['levels']['1'])
    # Towers/Psi/Psi.json: damage comes from PsiEffectModel (1 per 0.2 s) on an Energy projectile; no Lead at L1
    a = attacks(D['heroes']['psi']['levels']['1'])[0]
    assert any(f['k'] == 'dot' and f['id'] == 'Psi' for f in a['weapons'][0]['p']['fx'])
    assert 'lead' not in can(a) and 'red' in can(a)
    # StrikerJones 19.json: AddBehaviorToBloonInZoneModel + IgnoreDmgImmunityModel(Black, chance 1) -> explosions hit Black
    assert 'black' in summary_can(D['heroes']['striker']['levels']['19'])
    assert 'black' not in summary_can(D['heroes']['striker']['levels']['4'])
    # Benjamin has no damaging attack (bloonswiki Benjamin)
    assert D['heroes']['benjamin']['levels']['20']['summary'].get('noDamage')


# ---------------------------------------------------------------- sub-towers
def test_subtowers():
    # EngineerMonkey-100.json: Spawner attack (rate 10) places 'Sentry' (TowerExpireModel lifespan 25);
    # EngineerMonkey-200.json (Faster Engineering): rate 5
    s = next(x for x in cp('engineer', '100')['subTowers'] if x['ref'].startswith('Sentry#'))
    assert s['every'] == 10 and D['subTowers'][s['ref']]['life'] == 25
    assert next(x for x in cp('engineer', '200')['subTowers'] if x['ref'].startswith('Sentry#'))['every'] == 5
    # MonkeyBuccaneer-400.json: Plane Spawner with SubTowerFilterModel maxNumberOfSubTowers 3
    s = next(x for x in cp('buccaneer', '400')['subTowers'] if x['ref'].startswith('BuccaneerPlane#'))
    assert s['max'] == 3
    # WizardMonkey-050.json: TowerCreateTowerModel PermaPhoenix (Wizard Lord Phoenix keeps a permanent Phoenix)
    assert any(x['ref'].startswith('PermaPhoenix#') and x['via'] == 'placed' for x in cp('wizard', '050')['subTowers'])
    # BeastHandler-005.json: Gyrfalcon pet path 2 tier 5; damage from GyrfalconPatternModel (code-driven)
    s = next(x for x in cp('beast', '005')['subTowers'] if x['via'] == 'pet')
    assert s['pet']['path'] == 2 and s['pet']['tier'] == 5
    g = [ATT[k] for k in D['subTowers'][s['ref']]['attacks']]
    assert any(w.get('codeDriven') for a in g for w in a['weapons'])
    # HeliPilot-004.json: ComancheDefenceModel reinforcementCount 3
    s = next(x for x in cp('heli', '004')['subTowers'] if x['via'] == 'reinforcement')
    assert s['n'] == 3
    # Etienne.json: DroneSupportModel count 1
    assert next(x for x in D['heroes']['etienne']['levels']['1']['subTowers'] if x['via'] == 'drone')['n'] == 1


def test_ability_only_flagged():
    # HeliPilot-050.json: Marines come only from the Special Poperations AbilityModel
    abil = cp('heli', '050')['abilities']
    assert any('Marine' in (a.get('makesTowers') or []) for a in abil)
    assert not any(x['ref'].startswith('Marine#') for x in cp('heli', '050').get('subTowers', []))


def test_upgrade_costs():
    # Upgrades/Glue Splatter.json cost 970; bloonswiki Glue Splatter (BTD6): Medium $970
    assert D['towers']['glue']['upgrades'][1][1]['cost'] == 970
    # Upgrades/Operation Dart Storm.json (file name drops the ':'): Ace 4-0-0, $3,300... resolved by name
    assert D['towers']['ace']['upgrades'][0][3]['name'] == 'Operation: Dart Storm' and D['towers']['ace']['upgrades'][0][3]['cost']


if __name__ == '__main__':
    n = 0
    for name, fn in sorted(globals().items()):
        if name.startswith('test_') and callable(fn):
            fn()
            n += 1
    print('ok', n, 'tests')
