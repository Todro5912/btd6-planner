"""Build data/tower-power.json: how hard each tower crosspath (and hero level) hits, for the leak check.

    python3 tools/build_power.py /path/to/btd6-game-data /path/to/DefaultRoundSet.json

The second file is the Bloons Wiki round set (JSON:Bloons_TD_6/Rounds/DefaultRoundSet, CC BY-NC-SA 4.0):
{"rounds": [{"bloonGroups": [{"bloon", "count", "start", "duration"}]}]}, seconds. It agrees with the game's own
Rounds/DefaultRoundSet on rounds 1-100 and adds 101-140.

Input: a checkout (or partial download) of https://github.com/Btd6ModHelper/btd6-game-data: the game's own
tower models, exported with BTD Mod Helper's "Export Game Data" (Towers/<Name>/<Name>-<abc>.json, heroes as
Towers/<Hero>/<Hero> <level>.json, Bloons/<Name>/<Name>.json). Data (c) Ninja Kiwi; used for a fan tool.

What we keep, per crosspath, is a summary the browser can evaluate fast (src/pages/assets/tools-core.js, C.power*):
  r      attack range (the longest attack); g: 1 if global range
  a      [[range, damage, [bloon-hits per second when 1, 2, 4, 8, 16, 32 bloons are in range]], ...]
         Every projectile is walked: emission count, pierce, sub-projectiles on contact / exhaust / expire /
         interval, damage over time. Explosions only reach the bloons near the target (radius / range).
  m      damage per second against one MOAB-class target (0 = can't hit MOABs); c: the same vs one Ceramic
  f      flags: 'nomoab' (filters MOABs out), 'onlymoab'
Abilities, buffs from other towers (Village, Alchemist), sub-towers and targeting are left out: the leak
check says so on the page. This is an estimate of throughput, not a replay of the game.
"""
import glob
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CROWD = [1, 2, 4, 8, 16, 32]

# our tower ids -> the game's folder names
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
    'sauda': 'Sauda', 'psi': 'Psi', 'geraldo': 'Geraldo', 'corvus': 'Corvus', 'rosalia': 'Rosalia', 'silas': 'Silas',
}
SUB = re.compile(r'CreateProjectileOn(Contact|ExhaustFraction|ExhaustPierce|Expire|Interval|BlockerCollide|TowerDestroy)Model')
SKIP = re.compile(r'(Ability|Sound|Effect|Display|Audio|Sprite|Prefab|Animation|Icon|CreateTowerModel)')


def short(o):
    t = o.get('$type', '') if isinstance(o, dict) else ''
    return t.split(',')[0].split('.')[-1]


def num(v, d=0.0):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else d


def emission_count(e):
    t = short(e)
    if not t:
        return 1
    for k in ('count', 'projectileCount', 'Count'):
        if num(e.get(k)) > 0:
            return int(num(e.get(k)))
    return 1


def lifespan(p):
    best = 0.0
    for b in p.get('behaviors') or []:
        t = short(b)
        if t in ('AgeModel', 'TravelStraitModel', 'TravelStraitSlowdownModel', 'TrackTargetModel', 'ArriveAtTargetModel', 'FollowPathModel'):
            best = max(best, num(b.get('lifespan')))
    return best


def filters(p):
    out = set()
    for f in (p.get('filters') or []):
        t = short(f)
        tag = f.get('tag') if isinstance(f, dict) else None
        if t == 'FilterOutTagModel' and tag in ('Moabs', 'Moab'):
            out.add('nomoab')
        if t in ('FilterMoabModel',) or (t in ('FilterWithTagModel',) and tag in ('Moabs', 'Moab')):
            out.add('onlymoab')
    return out


class Proj:
    """One projectile: pierce, damage per hit, bonus damage, re-hits, sub-projectiles."""

    def __init__(self, p, depth=0):
        self.pierce = max(0.0, num(p.get('pierce'), 1.0))
        if self.pierce <= 0:
            self.pierce = 1.0 if num(p.get('pierce'), -1) < 0 else 0.0
        self.radius = num(p.get('radius'))
        self.dmg = 0.0
        self.bonus = {}
        self.dot = 0.0
        self.rehit = 1.0
        self.subs = []  # (trigger, count, Proj)
        self.flags = filters(p)
        life = lifespan(p)
        self.life = life
        self.travel = 0.0
        for b in p.get('behaviors') or []:
            if short(b) in ('TravelStraitModel', 'TravelStraitSlowdownModel'):
                self.travel = max(self.travel, num(b.get('speed')) * num(b.get('lifespan')))
            if short(b) in ('TrackTargetModel', 'RetargetOnContactModel'):
                self.travel = max(self.travel, 1e9)  # seeks the next bloon
        for b in p.get('behaviors') or []:
            t = short(b)
            if SKIP.search(t):
                continue
            if t == 'DamageModel':
                self.dmg += num(b.get('damage'))
            elif t in ('DamageModifierForTagModel',):
                tag = str(b.get('tag') or '')
                self.bonus[tag] = self.bonus.get(tag, 0.0) + num(b.get('damageAddative'))
            elif t == 'AddBehaviorToBloonModel':
                for bb in (b.get('behaviors') or []):
                    if short(bb) == 'DamageOverTimeModel' and num(bb.get('interval')) > 0:
                        ticks = max(1.0, num(b.get('lifespan'), num(bb.get('interval'))) / num(bb.get('interval')))
                        self.dot += num(bb.get('damage')) * ticks
            elif t == 'ClearHitBloonsModel' and num(b.get('interval')) > 0 and life > 0:
                self.rehit = max(1.0, min(20.0, life / num(b.get('interval'))))
            elif SUB.match(t) and depth < 6 and isinstance(b.get('projectile'), dict):
                trig = SUB.match(t).group(1)
                cnt = emission_count(b.get('emission') or {})
                if trig == 'ExhaustPierce':  # one more every pierceInterval of pierce used: like on-contact, per hit
                    trig = 'Contact'
                    cnt = cnt / max(1.0, num(b.get('pierceInterval'), 1.0))
                if trig == 'Interval' and num(b.get('intervalFrames')) > 0 and life > 0:
                    cnt *= max(1, int(life * 60 / num(b.get('intervalFrames'))))
                self.subs.append((trig, cnt, Proj(b['projectile'], depth + 1)))

    def hits(self, n, R):
        """bloon-hits from one of these when n bloons are in the tower's range R (spread along 2R of track)"""
        R = min(R, 120.0)  # global-range towers still only see the bloons bunched near the target
        if self.radius >= 0.6 * R or self.life >= 3.0:  # a zone the size of the range, or a projectile that sits on the track
            reach = n
        else:
            cover = max(self.radius * 2, 0.7 * self.travel)  # a dart flies through the crowd, an explosion only reaches its radius
            reach = 1 + (n - 1) * min(1.0, cover / (2 * R))
        return min(self.pierce, reach * self.rehit)

    def walk(self, n, R, mult, out):
        """append (damage, bloon-hits) for one shot, times mult"""
        h = self.hits(n, R)
        d = self.dmg + (self.dot / max(1.0, self.rehit))
        if d > 0 and h > 0:
            out.append((d, h * mult))
        for trig, cnt, sp in self.subs:
            k = h if trig == 'Contact' else 1.0
            sp.walk(n, R, mult * cnt * max(k, 0.0), out)

    def single(self, tag):
        """damage dealt to one big target (a MOAB or Ceramic) by one of these"""
        if tag == 'Moabs' and 'nomoab' in self.flags:
            return 0.0
        d = (self.dmg + self.bonus.get(tag, 0.0) + (self.bonus.get('Moab', 0.0) if tag == 'Moabs' else 0.0)) if self.dmg > 0 else 0.0
        d = d * min(self.rehit, max(1.0, self.pierce)) + self.dot
        for trig, cnt, sp in self.subs:
            if trig in ('Contact', 'Expire', 'ExhaustFraction', 'Interval'):
                d += cnt * sp.single(tag) * (1 if trig != 'Interval' else 0.5)
        return d


def attacks(tower):
    out = []

    def find(o, in_skip):
        if isinstance(o, dict):
            t = short(o)
            if t and SKIP.search(t) and t != 'AttackModel':
                return
            if t in ('AttackModel', 'AttackAirUnitModel'):
                out.append(o)
                return
            for v in o.values():
                find(v, in_skip)
        elif isinstance(o, list):
            for v in o:
                find(v, in_skip)
    find(tower.get('behaviors') or [], False)
    return out


def summarize(tower):
    rng = num(tower.get('range'))
    glob_range = bool(tower.get('isGlobalRange'))
    rows = {}
    moab = cer = 0.0
    flags = set()
    any_attack = False
    max_r = 0.0
    for a in attacks(tower):
        R = num(a.get('range'), rng) or rng
        if R > 900 and not [x for x in attacks(tower) if 0 < num(x.get('range')) < 900]:
            glob_range = True
        afl = filters(a)
        for w in a.get('weapons') or []:
            if not isinstance(w, dict) or not isinstance(w.get('projectile'), dict):
                continue
            rate = num(w.get('rate'))
            if rate <= 0:
                continue
            any_attack = True
            max_r = max(max_r, R)
            cnt = emission_count(w.get('emission') or {})
            p = Proj(w['projectile'])
            p.flags |= afl
            flags |= p.flags
            per = cnt / rate
            for i, n in enumerate(CROWD):
                acc = []
                p.walk(n, R, per, acc)
                for d, h in acc:
                    key = (min(R, 9999.0), round(d, 2))
                    rows.setdefault(key, [0.0] * len(CROWD))[i] += h
            moab += per * p.single('Moabs')
            cer += per * p.single('Ceramic')
    if not any_attack:
        return None
    a_out = [[round(R, 1), d, [round(h, 3) for h in hs]] for (R, d), hs in sorted(rows.items()) if any(hs)]
    if not a_out and moab == 0:
        return None
    finite = [R for (R, d) in rows if R < 900]
    res = {'r': round(max(finite) if finite else min(max_r or rng, 9999.0), 1), 'a': a_out, 'm': round(moab, 2), 'c': round(cer, 2)}
    if glob_range:
        res['g'] = 1
    fl = sorted(f for f in flags if f in ('nomoab', 'onlymoab'))
    if 'nomoab' in fl and moab == 0:
        res['f'] = ['nomoab']
    return res


def load(path):
    with open(path, encoding='utf-8-sig') as f:
        return json.load(f)


def crosspaths():
    out = []
    for a in range(6):
        for b in range(6):
            for c in range(6):
                x = [a, b, c]
                nz = [v for v in x if v > 0]
                if len(nz) <= 2 and sorted(x)[1] <= 2:
                    out.append(x)
    return out


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    gd = sys.argv[1]
    out = {'_meta': {
        'source': 'https://github.com/Btd6ModHelper/btd6-game-data (BTD Mod Helper "Export Game Data")',
        'gameVersion': '56.0',
        'note': 'Throughput summary per crosspath for the leak check. a = [[attack range, damage, bloon-hits/s with 1,2,4,8,16,32 bloons in range]], '
                'm / c = damage per second to one MOAB-class / Ceramic, r = range (units; a Red moves 25 units/s). '
                'No abilities, no buffs from other towers, no sub-towers. Data (c) Ninja Kiwi.',
        'crowd': CROWD,
    }, 'towers': {}, 'heroes': {}, 'bloonSpeed': {}}
    for tid, folder in TOWERS.items():
        rows = {}
        for x in crosspaths():
            code = ''.join(map(str, x))
            f = os.path.join(gd, 'Towers', folder, folder + ('' if code == '000' else '-' + code) + '.json')
            if not os.path.exists(f):
                continue
            s = summarize(load(f))
            if s:
                rows[code] = s
        out['towers'][tid] = rows
        print(f'{tid:10} {len(rows):3} crosspaths')
    for hid, folder in HEROES.items():
        lv = {}
        for n in range(1, 21):
            f = os.path.join(gd, 'Towers', folder, folder + ('' if n == 1 else ' ' + str(n)) + '.json')
            if not os.path.exists(f):
                continue
            s = summarize(load(f))
            if s:
                lv[str(n)] = s
        out['heroes'][hid] = lv
        print(f'{hid:10} {len(lv):3} levels')
    for b in ['Red', 'Blue', 'Green', 'Yellow', 'Pink', 'Black', 'White', 'Purple', 'Lead', 'Zebra', 'Rainbow', 'Ceramic', 'Moab', 'Bfb', 'Zomg', 'Ddt', 'Bad']:
        f = os.path.join(gd, 'Bloons', b, b + '.json')
        if os.path.exists(f):
            out['bloonSpeed'][b.lower()] = num(load(f).get('speed'))
    if len(sys.argv) > 2:
        rs = load(sys.argv[2])
        out['rounds'] = [[[g['bloon'], int(g['count']), round(float(g['start']), 3), round(float(g['duration']), 3)] for g in r.get('bloonGroups', [])]
                         for r in rs.get('rounds', [])]
        out['_meta']['rounds'] = 'Bloons Wiki JSON:Bloons_TD_6/Rounds/DefaultRoundSet (CC BY-NC-SA 4.0): [bloon, count, start s, duration s] per group'
        print(len(out['rounds']), 'rounds')
    dest = os.path.join(REPO, 'data', 'tower-power.json')
    with open(dest, 'w') as f:
        json.dump(out, f, separators=(',', ':'), sort_keys=True)
    print('wrote', dest, os.path.getsize(dest) // 1024, 'KB')


if __name__ == '__main__':
    main()
