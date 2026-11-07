"""Build data/tower-power.json: how hard each tower crosspath (and hero level) hits, for the leak check.

    python3 tools/build_power.py /path/to/btd6-game-data [/path/to/DefaultRoundSet.json]
    python3 tools/build_power.py --gd /path/to/btd6-game-data [--rounds /path/to/DefaultRoundSet.json]

The round set is the Bloons Wiki JSON (JSON:Bloons_TD_6/Rounds/DefaultRoundSet, CC BY-NC-SA 4.0):
{"rounds": [{"bloonGroups": [{"bloon", "count", "start", "duration"}]}]}, seconds. It agrees with the game's own
Rounds/DefaultRoundSet on rounds 1-100 and adds 101-140. Without it, the rounds already in data/tower-power.json are kept.

Input: a checkout of https://github.com/Btd6ModHelper/btd6-game-data (game v56): the game's tower models exported with
BTD Mod Helper's "Export Game Data". Data (c) Ninja Kiwi; used for a fan tool.

The tower models are decoded by tools/game/extract_towers.py (the same walker that writes data/game/towers.json): paired
weapons, bursts, alternate shots, multi-tag bonuses, zero-base bonus damage, DoT, ring damage, code-driven pets and the
sub-towers are all read there. This file turns each decoded crosspath into the summary the browser evaluates
(src/pages/assets/tools-core.js, C.leakRound):
  r      attack range (the longest finite attack); g: 1 if global range
  a      [[range, damage, [bloon-hits per second when 1, 2, 4, 8, 16, 32 bloons are in range]], ...]
  m      damage per second against one MOAB-class target (0 = can't hit MOABs); c: the same vs one Ceramic
  f      flags: 'nomoab'
_meta.notes lists every rule and estimate.
"""
import argparse
import json
import math
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, 'tools', 'game'))
import extract_towers as X  # noqa: E402

CROWD = [1, 2, 4, 8, 16, 32]
TOWERS = {k: v for k, v in X.TOWERS.items()}
HEROES = {k: v for k, v in X.HEROES.items()}
TYPE_BITS = {v: k for k, v in X.DAMAGE_TYPES.items()}
# the stream sees these trigger kinds once per bloon the parent hits; exhaust/expire once per parent projectile
PER_HIT = ('contact', 'pierceUsed', 'damage', 'damageState', 'pop', 'galvanized', 'SilasApplyRime', 'FrozenRemainsExplosion',
           'MarkedToPopProjectileBehavior')
PER_PROJECTILE = ('exhaust', 'expire', 'destroy', 'blocker', 'area', 'CreateGreatWhiteEffect')
# sub-towers that are part of normal play (the rest need a sacrifice, an ability, a spell or a transformation)
PERMANENT_VIA = ('placed', 'pet', 'drone', 'attack', 'totem', 'reinforcement', 'projectile')
OWN_COND = (None, 'passive')

NOTES = [
    'Decoding: tools/game/extract_towers.py (game v56 export). Only the tower\'s own attacks count: abilities, Sun Temple / True Sun God '
    'sacrifice add-ons, Corvus spells, submerged-only attacks, Necromancer graveyard attacks, Silas\' ice shards on Ice Monkeys and Adora\'s '
    'Sun God transformation are left out; "passive" damage (Sub Pre-emptive Strike, Druid Spirit of the Forest) is counted.',
    'Rate: projectiles/s = emission count x burst count / cooldown. A weapon with FireWhenAlternateWeaponIsReadyModel (rate 0.05 placeholder, '
    'every Monkey Buccaneer) fires once per shot of its partner, so it uses the partner\'s cooldown.',
    'Alternate shots (AlternateProjectileModel, every k-th shot: Flash Bomb, Bomb Shooter, Quincy...) replace 1 in k shots. BonusProjectileAfterInterval '
    '(Gwendolin) adds 1 every k shots. Swap weapons (Rosalia) count projectile A only.',
    'Damage per hit = DamageModel damage; vs one MOAB / Ceramic add every DamageModifierForTagModel whose tag list (often several tags, e.g. '
    '"Moabs,Ceramic") matches the bloon (MOAB = Moab+Moabs, Ceramic = Ceramic). A DamageModel of 0 with a MOAB bonus (M.A.D. +450) is MOAB-only '
    'damage. BloonTagDamageOverride sets the damage vs that bloon; DamageModifierForBloonType adds damage vs a bloon id (Ceramic, Moab). '
    'Damage >= 1e6 (instant kills: Druid vines) is left out of m and c.',
    'Ring damage (DamageInRingRadiusModel: Mortar The Big One shockwave) counts like an explosion with that damage and the projectile radius.',
    'Crowd model (unchanged from 0.9): with n bloons spread over 2R of track, a projectile reaches 1 + (n-1) x min(1, cover/2R), cover = max(2 x '
    'radius, 0.7 x travel distance); seeking and bouncing projectiles and zones the size of the range, or anything that sits on the track 3 s or more, '
    'reach all n. Hits per projectile = min(pierce, reach x rehits), rehits = lifespan / ClearHitBloons interval, capped at 20.',
    'Spread shots (Arc / RandomArc / Random emission with n projectiles over arc degrees): only 1 + (n-1)(1 - arc/30) of them (at least 1) can reach '
    'one bloon; each extra bloon in range lets one more projectile find a target, so the share that hits is (one + (n-one) x min(1, (N-1)/(n-1)))/n '
    'with N bloons. 8 tacks over 360 degrees: 1 of 8 hit a lone bloon, all 8 with 8 bloons. Seeking projectiles (Ace Flying Fortress radial '
    'darts) all reach the target whatever the spread. Estimate.',
    'State bonuses (DamageModifierForBloonState) count when the same weapon applies that state: Laser Shock (+damage vs shocked), Flash Bomb '
    'stun (+4 for shuriken vs stunned), freeze bonuses. Estimate: assumes the target always carries the state.',
    'Sub-projectiles: on-contact / on-damage / pierce-used children spawn once per bloon the parent hits; on-exhaust / on-expire once per parent '
    'projectile; on-interval every interval of the parent\'s lifespan. A spread of fragments (n > 1 over 90 degrees or more) never hits the bloon '
    'that spawned it: it adds nothing at 1 bloon and needs a second bloon - unless each fragment explodes within its own blast radius of where it '
    'was made (Bomb cluster bombs), then every one of them hits the first bloon too.',
    'DoT refreshes, it does not stack: a bloon carrying it takes damage / interval per second. Bloons holding it at once = min(bloons in range, '
    'applications/s x duration); each tick is a hit of that damage. Vs one MOAB / Ceramic: damage / interval per DoT kind (not per hit). Estimate: '
    'bloons that leave the range keep burning, bloons that pop early waste ticks.',
    'Psi: PsiEffectModel is a DoT (damagePerTick every tickRate up to maxDuration); PsiLimitProjectileModel (how many bloons Psi holds at once) is not '
    'in the export, so the cap is applications/s x maxDuration. Estimate.',
    'Filters: FilterOutTag / FilterWithTag(inclusive=true) drop a tag, FilterWithTag(inclusive=false) keeps only it, FilterMoabModel flip=false '
    'keeps only MOAB-class and flip=true drops them. Attacks that drop MOAB-class get m = 0; attacks that keep only MOAB-class get no stream row.',
    'Sub-towers (permanent only) are added to the parent\'s entry: Engineer sentries at min(max, lifespan / spawn interval) x per spawn (typed '
    'Sentry Expert/Champion sentries: one of the 4 types per spawn, so each type at 1/4), Aircraft Carrier planes (up to 3), Wizard Lord Phoenix\'s '
    'permanent Phoenix, Corvus\' Spirit, Beast Handler pets, Etienne drones, Comanche reinforcements at count x duration / cooldown. Each sub-tower '
    'attack keeps its own range (global ones use 9999). Ability-made towers (Marines, Lord Phoenix, Drone Swarm, UCAV, Sacrificial Totem, Ball of '
    'Light, Sun Avatars) are excluded.',
    'Beast Handler pets use their base-power stats (BeastHandlerPetModel dmgRange/pierceRange scale them with merged power in code; not modelled). '
    'Gyrfalcon line: GyrfalconPatternModel swoop (initialDamage, pierce = grabAmount, radius = grabRadius 45, every cooldown) and grapple damage on the held target (every '
    'grappleDamageRate, in m only). Great White / Orca / Megalodon: thrash explosions (CreateGreatWhiteEffectModel); the grab-and-drown itself is code '
    'and not counted. Estimate.',
    'Zone immunity bypass (Striker Jones L5/L19 Black, Silas White): changes what pops, not the numbers here; the pop model decides that.',
    'Not modelled: buffs from other towers (the engine applies Village / Alchemist itself), crits, ability uptime, targeting priority, exact placement, '
    'MOAB-class children and Ice freezing (the engine handles those).',
]


def num(v, d=0.0):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else d


def node_bits(p):
    if 'imm' in p:
        return int(p['imm'])
    return TYPE_BITS.get(p.get('type'), 0)


def reach(p, n, R):
    """bloons one projectile can touch when n bloons are in range R (spread over 2R of track) - 0.9 model"""
    R = min(max(R, 1.0), 120.0)
    life = num(p.get('life'))
    r = num(p.get('r')) or num((p.get('ring') or {}).get('r'))
    if r >= 0.6 * R or life >= 3.0 or p.get('move') in ('seeking',) or p.get('bounces') or p.get('chain'):
        return float(n)
    travel = num(p.get('speed')) * life if p.get('move') == 'straight' else 0.0
    cover = max(r * 2, 0.7 * travel)
    if p.get('_line'):
        # a beam (LineProjectileEmission: Ray of Doom, Desperado rifle) runs the length of the range: it crosses about
        # half of the track in reach (estimate)
        cover = max(cover, R)
    return 1 + (n - 1) * min(1.0, cover / (2 * R))


def rehits(p):
    life, iv = num(p.get('life')), num(p.get('rehitEvery'))
    if iv > 0 and life > 0:
        return max(1.0, min(20.0, life / iv))
    return 1.0


def spread_share(n, em, arc, N):
    """share of a volley of n projectiles that hits something with N bloons in range"""
    if n <= 1:
        return 1.0
    one = X.hits_one(n, em, arc)
    if N <= 1:
        return one / n
    return min(1.0, (one + (n - one) * min(1.0, (N - 1) / (n - 1))) / n)


def applied_states(p, out=None):
    """states this projectile tree puts on bloons (LaserShock4, Stun:Weak, Freeze...)"""
    out = set() if out is None else out
    for n, _ in X.tree_nodes(p):
        for f in n.get('fx') or []:
            if f.get('k') == 'freeze':
                out.add('Freeze')
            if f.get('id'):
                out.add(str(f['id']))
    return out


def state_bonus(p, states):
    """bonus damage vs bloons in a state the same weapon applies (Laser Shock, Flash Bomb stun, Ice freeze)"""
    add, mult = 0.0, 1.0
    for b in p.get('bonus') or []:
        st = b.get('states')
        if st and not b.get('bloons') and any(any(x == s or x.startswith(s + ':') or x.startswith(s) for x in states) for s in st):
            add += num(b.get('add'))
            mult *= num(b.get('mult'), 1.0)
    return add, mult


def plain_dmg(p, states=()):
    """damage one hit does to an ordinary bloon; 0 if the node only hits MOAB-class or has no DamageModel"""
    if 'dmg' not in p and not p.get('ring'):
        return 0.0
    if X.blocked(p, ('Red',)):
        return 0.0
    add, mult = state_bonus(p, states)
    d = (num(p.get('dmg')) + add) * mult if 'dmg' in p else 0.0
    d += num(p['ring'].get('dmg')) if p.get('ring') else 0.0
    return d


def tag_dmg(p, tags, states=()):
    d = X.node_hit(p, tags, est=True) if 'dmg' in p else 0.0
    if d > 0:
        add, mult = state_bonus(p, states)
        for b in p.get('bonus') or []:  # DamageModifierForBloonType: +damage vs a bloon id (Spike Factory vs Ceramic)
            if b.get('bloons') and not b.get('states') and 'setTo' not in b and any(x in tags for x in b['bloons']):
                add += num(b.get('add'))
                mult *= num(b.get('mult'), 1.0)
        d = (d + add) * mult
    if p.get('ring') and not X.blocked(p, tags):
        d += num(p['ring'].get('dmg'))
    return d


class Acc:
    """rows {(R, dmg, immunity bits, dmg vs Ceramic): [[hits/s at each crowd], pierce]}, single-target MOAB / Ceramic
    dps (MOAB split by immunity bits: mb), and crowd control (cc: freeze, stun, slow, maim)"""

    def __init__(self):
        self.rows = {}
        self.m = 0.0
        self.mb = {}
        self.c = 0.0
        self.dot_m = {}
        self.dot_c = {}
        self.cc = {}
        self.mcrowd = [0.0] * len(CROWD)
        self.dot_mc = {}
        self.flags = set()

    def add_row(self, R, d, hs, scale=1.0, imm=0, pierce=1.0, dc=None):
        if d <= 0 or not any(hs):
            return
        dc = d if dc is None else dc
        key = (round(min(R, 9999.0), 1), round(d, 2), int(imm), round(dc, 2))
        row = self.rows.setdefault(key, [[0.0] * len(CROWD), 0.0])
        for i, h in enumerate(hs):
            row[0][i] += h * scale
        row[1] = max(row[1], pierce)

    def add_m(self, dps, hps, imm, scale=1.0):
        if dps <= 0:
            return
        e = self.mb.setdefault(int(imm), [0.0, 0.0])
        e[0] += dps * scale
        e[1] += hps * scale
        self.m += dps * scale

    def add_cc(self, R, kind, mult, dur, hs, moab, scale=1.0):
        if (max(dur) if isinstance(dur, tuple) else dur) <= 0 or not any(hs):
            return
        key = (round(min(R, 9999.0), 1), kind, round(mult, 3), dur if isinstance(dur, tuple) else round(min(dur, 60.0), 2), int(moab))
        row = self.cc.setdefault(key, [0.0] * len(CROWD))
        for i, h in enumerate(hs):
            row[i] += h * scale

    def merge(self, other, scale):
        for (R, d, imm, dc), (hs, pc) in other.rows.items():
            self.add_row(R, d, hs, scale, imm, pc, dc)
        for imm, (dps, hps) in other.mb_all().items():
            self.add_m(dps, hps, imm, scale)
        self.c += other.total_c() * scale
        for (R, k, mu, du, mo), hs in other.cc.items():
            self.add_cc(R, k, mu, du, hs, mo, scale)
        oc = other.mc_all()
        for i in range(len(CROWD)):
            self.mcrowd[i] += oc[i] * scale

    def mc_all(self):
        """MOAB damage per second with 1, 2, 4... blimps in range (pierce reaching several blimps)"""
        out = list(self.mcrowd)
        for key, (dps, hps, imm) in self.dot_m.items():
            row = self.dot_mc.get(key)
            for i in range(len(CROWD)):
                out[i] += row[i] if row else dps
        return out

    def mb_all(self):
        out = {k: list(v) for k, v in self.mb.items()}
        for (dps, hps, imm) in self.dot_m.values():
            e = out.setdefault(int(imm), [0.0, 0.0])
            e[0] += dps
            e[1] += hps
        return out

    def total_m(self):
        return self.m + sum(v[0] for v in self.dot_m.values())

    def total_c(self):
        return self.c + sum(self.dot_c.values())


def near_burst(p):
    """a 'fragment' that explodes about where it was made (Bomb cluster bombs: lifespan 0, explosion radius 15): its
    explosion still covers the bloon that spawned it"""
    travel = num(p.get('speed')) * num(p.get('life')) if p.get('move') == 'straight' else 0.0
    for s in p.get('subs') or []:
        sp = s.get('p') or {}
        if s.get('on') in PER_PROJECTILE and num(sp.get('r')) >= max(travel, 1.0) and (plain_dmg(sp) > 0 or tag_dmg(sp, ('Moab', 'Moabs')) > 0):
            return True
    return False


def eff_bits(p):
    """immunity bits of one projectile's damage: its own type (decoded from DamageModel), a ChangeDamageType, minus what it bypasses"""
    bits = int(p['setImm']) if 'setImm' in p else node_bits(p)
    bits &= ~int(p.get('bypass', 0))
    ig = p.get('ignoreImm')
    if ig and ig.get('chance', 0) >= 1:
        bits &= ~int(ig['bits'])
    return bits


def dot_imm(f):
    if 'imm' in f:
        return int(f['imm'])
    return TYPE_BITS.get(f.get('type'), 0)


def crowd_control(acc, a, p, R, hits, single, moab_ok):
    """freeze / stun / slow / MOAB maim this node puts on the bloons it hits, as applications per second (the leak
    check stops or slows that share of the bloons in the tower's reach for the effect's duration). Estimate."""
    fx = p.get('fx') or []
    moab_slow = None
    for f in fx:
        if f.get('k') == 'slowMod' and f.get('tag') == 'Moabs':
            moab_slow = 1.0 if f.get('immune') else num(f.get('mult'), 1.0)
    for f in fx:
        k = f.get('k')
        if k == 'freeze':
            mo = bool(f.get('moabs')) and moab_ok
            fm = 1.0
            for g in fx:
                if g.get('k') == 'freezeMod' and 'Ceramic' in (g.get('tags') or []):
                    fm = num(g.get('mult'), 1.0)
            ch = num(f.get('chance'), 1.0) if 'chance' in f else 1.0
            acc.add_cc(R, 'f', round(fm, 2), num(f.get('dur')), [h * ch for h in hits], mo)
        elif k in ('stun', 'slow'):
            mult = num(f.get('mult'), 1.0)
            if mult >= 1.0 or f.get('bloons'):
                continue
            only_moab = f.get('tag') == 'Moabs'
            mo = moab_ok and (moab_slow is None or moab_slow < 1.0) and not X.blocked(p, ('Moab', 'Moabs'))
            kind = 't' if mult <= 0 else 's'
            if only_moab:
                acc.add_cc(R, kind, mult, num(f.get('dur')), [single] * len(CROWD), 2)
            else:
                acc.add_cc(R, kind, mult, num(f.get('dur')), hits, 1 if mo else 0)
        elif k == 'maim' and moab_ok:
            durs = tuple(round(num(f.get(t)), 2) for t in ('moab', 'bfb', 'zomg', 'ddt', 'bad'))
            if any(durs):
                acc.add_cc(R, 'm', num(f.get('mult')), durs, [single] * len(CROWD), 2)


def walk_node(acc, a, p, R, rate_fn, single_rate, depth=0, attack_moab_ok=True, states=()):
    """p: projectile; rate_fn(i) = projectiles/s of this node at crowd i that actually find bloons;
    single_rate = projectiles/s of this node that hit the one big target (MOAB / Ceramic)"""
    if not p or depth > 8:
        return
    hits = []
    for i, n in enumerate(CROWD):
        pierce = num(p.get('pierce'), 1.0)
        # RefreshPierceModel (Wall of Fire, Blooncineration fire): the pierce comes back every interval of its life
        rp = num(p.get('refreshPierceEvery'))
        if rp > 0 and num(p.get('life')) > rp:
            pierce *= min(20.0, num(p.get('life')) / rp)
        h = min(max(pierce, 1.0), reach(p, n, R) * rehits(p))
        hits.append(rate_fn(i) * h)
    d = plain_dmg(p, states)
    imm = eff_bits(p)
    if d > 0 and not X.blocked(a, ('Red',)):
        dc = tag_dmg(p, ('Ceramic',), states) if not X.blocked(a, ('Ceramic',)) else 0.0
        acc.add_row(R, d, hits, 1.0, imm, min(num(p.get('pierce'), 1.0), 1000.0) * rehits(p), dc)
    # single target: a projectile that stays (rehits) hits the same MOAB again, up to its pierce
    rep = min(rehits(p), max(1.0, num(p.get('pierce'), 1.0)))
    if attack_moab_ok:
        dm = tag_dmg(p, ('Moab', 'Moabs'), states)
        acc.add_m(single_rate * rep * dm, single_rate * rep, imm)
        if dm > 0:
            for i in range(len(CROWD)):
                acc.mcrowd[i] += max(single_rate * rep, hits[i]) * dm
    crowd_control(acc, a, p, R, hits, single_rate * rep, attack_moab_ok)
    if not X.blocked(a, ('Ceramic',)):
        acc.c += single_rate * rep * tag_dmg(p, ('Ceramic',), states)
    # DoT: refreshes per bloon
    hit_ok = 'dmg' not in p or num(p.get('dmg')) <= 0 or plain_dmg(p) > 0
    for f in p.get('fx') or []:
        if f.get('k') != 'dot' or num(f.get('dmg')) <= 0:
            continue
        every = num(f.get('every')) or 1.0
        dur = num(f.get('dur')) or every
        per_bloon = f['dmg'] / every
        if not X.blocked(f, ('Red',)) and not X.blocked(p, ('Red',)) and hit_ok:
            dhs = []
            for i, n in enumerate(CROWD):
                holders = min(float(n), hits[i] * dur)
                dhs.append(holders / every)
            acc.add_row(R, f['dmg'], dhs, 1.0, dot_imm(f), 1e3, f['dmg'])
        key = (f.get('id'), f['dmg'], every)
        if single_rate > 0:
            cap = per_bloon if single_rate * dur >= 1 else f['dmg'] * max(1, f.get('ticks') or 1) * single_rate
            if attack_moab_ok and not X.blocked(f, ('Moab', 'Moabs')) and not X.blocked(p, ('Moab', 'Moabs')):
                if cap > acc.dot_m.get(key, (0.0,))[0]:
                    acc.dot_m[key] = (cap, cap / f['dmg'], dot_imm(f))
                    # with n blimps in reach, the burn sits on as many as the attack reaches within its duration
                    acc.dot_mc[key] = [cap * max(1.0, min(float(n), max(single_rate, hits[i]) * dur)) for i, n in enumerate(CROWD)]
            if not X.blocked(f, ('Ceramic',)) and not X.blocked(p, ('Ceramic',)):
                acc.dot_c[key] = max(acc.dot_c.get(key, 0.0), cap)
    # children
    for s in p.get('subs') or []:
        sp = s.get('p')
        if not sp:
            continue
        cnt = num(s.get('n'), 1.0)
        on = s.get('on') or ''
        frag = cnt > 1 and (s.get('em') in ('Arc', 'RandomArc', 'Random') or num(s.get('arc')) >= 90) and not near_burst(sp)
        if on == 'interval':
            every = num(s.get('every'))
            life = num(p.get('life'))
            k = max(1.0, life / every) if every > 0 and life > 0 else 1.0
            per = [rate_fn(i) * cnt * k for i in range(len(CROWD))]
            single = single_rate * cnt * k * 0.5
        elif on in PER_PROJECTILE or not (on in PER_HIT or on.startswith('bloon:')):
            # exhaust / expire, and any other behaviour that holds a projectile (ScaleProjectileOverTime split...): once per projectile
            per = [rate_fn(i) * cnt for i in range(len(CROWD))]
            single = single_rate * (cnt if not frag else 0.0)
        else:  # once per bloon the parent hits (contact, pierce used, damage, pop, galvanized, bloon-borne, Silas rime)
            k = 1.0 / max(1.0, num(s.get('perPierce'), 1.0))
            per = [hits[i] * cnt * k for i in range(len(CROWD))]
            single = single_rate * (cnt if not frag else 0.0) * k
        if frag:
            # fragments fly away from the bloon that made them: nothing at 1 bloon, then the second bloon onwards
            per = [0.0 if CROWD[i] <= 1 else per[i] * spread_share(int(cnt), s.get('em'), num(s.get('arc')), CROWD[i] - 1) for i in range(len(CROWD))]
        walk_node(acc, a, sp, R, (lambda i, per=per: per[i]), single, depth + 1, attack_moab_ok, states)


def walk_attack(acc, a, rng_fallback):
    R = num(a.get('range')) or rng_fallback
    moab_ok = not X.blocked(a, ('Moab', 'Moabs'))
    for w in a.get('weapons') or []:
        sps = num(w.get('sps'))
        if sps <= 0 and a.get('cond') == 'passive' and w.get('p'):
            zone_dot(acc, a, w['p'], moab_ok)
            continue
        if sps <= 0 or not w.get('p'):
            continue
        n = max(1, int(num(w.get('n'), 1)))
        em, arc = w.get('em'), num(w.get('arc'))
        p0 = dict(w['p'], _line=True) if em == 'LineProjectile' else w['p']
        shots = [(p0, sps, n, em, arc)]
        alt = w.get('alt')
        if alt and alt.get('p') and num(alt.get('every')) > 0:
            k = num(alt['every'])
            volleys = sps / n
            shots = [(p0, sps * (k - 1) / k, n, em, arc), (alt['p'], volleys / k * num(alt.get('n'), 1), int(num(alt.get('n'), 1)), None, num(alt.get('arc')))]
        bs = w.get('bonusShot')
        if bs and bs.get('p') and num(bs.get('every')) > 0:
            shots.append((bs['p'], sps / n / num(bs['every']), 1, None, 0))
        if w.get('codeDriven'):
            # Gyrfalcon swoop: grabs up to grabAmount (= pierce) bloons within GyrfalconPatternModel.grabRadius (45)
            shots = [(dict(p, r=45.0) if 'initial' in str(w.get('w')) else p, rt, nn, e, ar) for p, rt, nn, e, ar in shots]
        states = set()
        for p, *_ in shots:
            applied_states(p, states)
        for p, rate, nn, e, ar in shots:
            if p.get('move') == 'seeking':
                e, ar = None, 0  # homing projectiles all turn onto the target, whatever the spread
            fn = (lambda i, rate=rate, nn=nn, e=e, ar=ar: rate * spread_share(nn, e, ar, CROWD[i]))
            single = rate * X.hits_one(nn, e, ar) / nn
            walk_node(acc, a, p, R, fn, single, 0, moab_ok, states)
    return R


def zone_dot(acc, a, p, moab_ok):
    """a DoT zone over the track (Druid Spirit of the Forest): every bloon in it burns at damage/interval. The model has
    Close (<50), Middle (<100) and Far zones; most of a track is Far, so only the Far zone is counted (estimate)"""
    if 'Close' in str(p.get('id')) or 'Medium' in str(p.get('id')) or 'Middle' in str(p.get('id')):
        return
    for f in p.get('fx') or []:
        if f.get('k') != 'dot' or num(f.get('dmg')) <= 0:
            continue
        every = num(f.get('every')) or 1.0
        acc.add_row(9999.0, f['dmg'], [float(n) / every for n in CROWD], 1.0, dot_imm(f), 1e3, f['dmg'])
        if moab_ok:
            acc.dot_m[('zone', p.get('id'))] = (f['dmg'] / every, 1.0 / every, dot_imm(f))
            acc.dot_mc[('zone', p.get('id'))] = [f['dmg'] / every * n for n in CROWD]
        acc.dot_c[('zone', p.get('id'))] = f['dmg'] / every
        acc.ranges_extra = getattr(acc, 'ranges_extra', []) + [9999.0]


def slow_zones(rec):
    """zones that slow every bloon in them (Ice Arctic Wind, Silas) or shove blimps back (Heli MOAB Shove), as
    [radius, speed x for bloons (1 = none), speed x for [MOAB, BFB, ZOMG, DDT, BAD], immunity-like bits of bloons it skips
    (1 Lead, 4 White/Zebra)]"""
    out = []
    rng = num(rec.get('range'))
    for z in rec.get('zones') or []:
        R = rng if z.get('rangeLinked') else num(z.get('r'))
        if R <= 0:
            continue
        excl = z.get('excl') or []
        if z.get('k') == 'slowZone':
            sp = num(z.get('speed'), 1.0)
            moab = 1.0 if 'Moabs' in excl else sp
            skip = (1 if 'Lead' in excl else 0) | (4 if ('Ice' in excl or 'White' in excl) else 0)
            out.append([round(R, 1), sp, [moab, moab, moab, moab, 1.0 if 'Moabs' in excl else sp], skip])
        elif z.get('k') == 'moabShove':
            # MOAB Shove: blimps in reach move at this share of their speed (negative = pushed back); DDT as MOAB, BAD not
            m, b, zg = num(z.get('moab'), 1.0), num(z.get('bfb'), 1.0), num(z.get('zomg'), 1.0)
            out.append([round(R, 1), 1.0, [m, b, zg, m, 1.0], 0])
    return out


def own_attacks(rec):
    return [a for a in rec.get('attacks') or [] if a.get('cond') in OWN_COND]


def sub_count(s, refs):
    """steady-state number of this sub-tower"""
    st = SUBS.get(s['ref']) or {}
    via = s.get('via')
    if via in ('attack', 'projectile'):
        every = num(s.get('every'))
        life = num(st.get('life'))
        per = num(s.get('n'), 1.0)
        if life <= 0 or life >= 1e6:
            cnt = num(s.get('max')) or per
        else:
            cnt = per * (life / every if every > 0 else 1.0)
            if num(s.get('max')) > 0:
                cnt = min(cnt, num(s['max']))
        # typed sentries: one of the sibling types per spawn
        sib = [r for r in refs if r.get('via') == via and r.get('attack') == s.get('attack') and r.get('every') == s.get('every')]
        return cnt / max(1, len(sib))
    if via == 'drone':
        return num(s.get('n'), 1.0)
    if via == 'reinforcement':
        every = num(s.get('every'))
        return num(s.get('n'), 1.0) * (min(1.0, num(s.get('dur')) / every) if every > 0 else 1.0)
    return 1.0


SUBS = {}


def tower_acc(rec, depth=0):
    acc = Acc()
    rng = num(rec.get('range'))
    ranges = []
    for a in own_attacks(rec):
        before = (len(acc.rows), acc.m, acc.c, len(acc.dot_m))
        R = walk_attack(acc, a, rng)
        if (len(acc.rows), acc.m, acc.c, len(acc.dot_m)) != before:
            ranges.append(R)
        if X.blocked(a, ('Moab', 'Moabs')):
            acc.flags.add('nomoab')
    ranges += getattr(acc, 'ranges_extra', [])
    used = []
    refs = rec.get('subTowers') or []
    for s in refs:
        if s.get('via') not in PERMANENT_VIA or depth > 2:
            continue
        st = SUBS.get(s['ref'])
        if not st:
            continue
        sub = tower_acc(st, depth + 1)
        cnt = sub_count(s, refs)
        if cnt <= 0 or (not sub.rows and sub.total_m() <= 0):
            continue
        acc.merge(sub, cnt)
        ranges += sub.ranges
        used.append([st.get('name'), round(cnt, 2)])
    acc.ranges = ranges
    acc.subs_used = used
    return acc


def summarize(rec):
    acc = tower_acc(rec)
    if not acc.rows and acc.total_m() <= 0:
        return None, []
    a_out = []
    for (R, d, imm, dc), (hs, pc) in sorted(acc.rows.items()):
        if not any(hs):
            continue
        row = [R, d, [round(h, 3) for h in hs], imm, round(min(pc, 1000.0), 1)]
        if dc != d:
            row.append(dc)
        a_out.append(row)
    finite = [R for R in acc.ranges if R < 900]
    rr = num(rec.get('range'))
    res = {'r': round(max(finite) if finite else min(max(acc.ranges or [rr]), 9999.0), 1), 'a': a_out,
           'm': round(acc.total_m(), 2), 'c': round(acc.total_c(), 2)}
    mb = [[round(dps, 2), imm, round(hps, 3)] for imm, (dps, hps) in sorted(acc.mb_all().items()) if dps > 0.005]
    if mb and not (len(mb) == 1 and mb[0][1] == 0):
        res['mb'] = mb
    elif mb:
        res['mh'] = mb[0][2]
    mc = acc.mc_all()
    if mc[0] > 0 and any(v > 1.05 * mc[0] for v in mc[1:]):
        res['mc'] = [round(max(1.0, v / mc[0]), 2) for v in mc[1:]]

    if acc.cc:
        res['cc'] = [[R, k, mu, list(du) if isinstance(du, tuple) else du, [round(h, 3) for h in hs], mo]
                     for (R, k, mu, du, mo), hs in sorted(acc.cc.items(), key=lambda kv: str(kv[0])) if any(hs)]
    if rec.get('global') or (acc.ranges and not finite):
        res['g'] = 1
    sz = slow_zones(rec)
    if sz:
        res['sz'] = sz
    if 'nomoab' in acc.flags and res['m'] == 0:
        res['f'] = ['nomoab']
    return res, acc.subs_used


ABILITY_SKIP_TRIGGERS = ('IsPassive', 'activateOnPreLeak', 'activateOnLeak', 'activateOnLivesLost', 'activateOnRoundEnd')


def acc_out(acc):
    """an Acc as the compact {a, m, mb|mh, cc} the browser reads (no range fields)"""
    res, _ = summarize_acc(acc)
    return res


def summarize_acc(acc):
    if not acc.rows and acc.total_m() <= 0:
        return None, []
    a_out = []
    for (R, d, imm, dc), (hs, pc) in sorted(acc.rows.items()):
        if any(hs):
            row = [R, d, [round(h, 3) for h in hs], imm, round(min(pc, 1000.0), 1)]
            if dc != d:
                row.append(dc)
            a_out.append(row)
    res = {'a': a_out, 'm': round(acc.total_m(), 2)}
    mb = [[round(dps, 2), imm, round(hps, 3)] for imm, (dps, hps) in sorted(acc.mb_all().items()) if dps > 0.005]
    if mb and not (len(mb) == 1 and mb[0][1] == 0):
        res['mb'] = mb
    elif mb:
        res['mh'] = mb[0][2]
    mc = acc.mc_all()
    if mc[0] > 0 and any(v > 1.05 * mc[0] for v in mc[1:]):
        res['mc'] = [round(max(1.0, v / mc[0]), 2) for v in mc[1:]]

    if acc.cc:
        res['cc'] = [[R, k, mu, list(du) if isinstance(du, tuple) else du, [round(h, 3) for h in hs], mo]
                     for (R, k, mu, du, mo), hs in sorted(acc.cc.items(), key=lambda kv: str(kv[0])) if any(hs)]
    return res, []


def abilities_of(ex, raw, src, rng, own_rows):
    """the activated abilities of one crosspath / hero level, for the leak check's "abilities used on cooldown" pass.
    Each entry: n name, cd cooldown s, d seconds it acts (0 = one instant volley), and what it adds while active:
    a/m/mb/cc like an attack (per second; per activation when d = 0), t = [cooldown multiplier, extra damage] on the
    tower's own attacks (TurboModel), u = extra damage on own attacks (DamageUpModel), oc / cta = buffs the engine
    gives other towers (Overclock, Call to Arms). Abilities that only trigger on a leak, on lives lost or at round end
    are left out (estimate)."""
    out = []
    cx = X.Ctx(ex, src)
    cx.spell_names = set()
    for b in raw.get('behaviors') or []:
        if X.short(b) != 'AbilityModel':
            continue
        if any(b.get(k) for k in ABILITY_SKIP_TRIGGERS):
            continue
        cd = num(b.get('cooldown')) or num(b.get('cooldownFrames')) / 60.0
        if cd <= 0:
            continue
        ab = {'n': b.get('displayName') or (b.get('name') or '').replace('AbilityModel_', ''), 'cd': round(cd, 2)}
        acc = Acc()
        dur = 0.0
        for bb in b.get('behaviors') or []:
            t = X.short(bb)
            life = num(bb.get('lifespan')) or num(bb.get('lifespanFrames')) / 60.0 or num(bb.get('duration')) or num(bb.get('durationFrames')) / 60.0
            if t == 'ActivateAttackModel':
                one = bool(bb.get('isOneShot')) or life <= 0
                for am in bb.get('attacks') or []:
                    dec = X.attack(am, cx)
                    if one:
                        for w in dec.get('weapons') or []:
                            # fires once on activation: one volley (n projectiles x burst) delivered at once
                            w['sps'] = num(w.get('n'), 1.0) * num((w.get('burst') or {}).get('n'), 1.0)
                    walk_attack(acc, dec, rng)
                    for w in dec.get('weapons') or []:
                        for node, _ in X.tree_nodes(w.get('p')):
                            for tr in node.get('towers') or []:
                                st = SUBS.get(tr['ref']) or ex.subtowers.get(tr['ref'])
                                if st and num(st.get('life')) > 0:
                                    sub = tower_acc(st, 1)
                                    acc.merge(sub, num(w.get('n'), 1.0))
                                    dur = max(dur, min(num(st.get('life')), cd))
                if not one:
                    dur = max(dur, life)
            elif t == 'MoabBarrageModel' and isinstance(bb.get('damageOverTimeModel'), dict):
                # Churchill: missiles burn up to `targets` blimps for the duration; counted on one blimp (estimate)
                dm = bb['damageOverTimeModel']
                iv = num(dm.get('interval')) or 0.5
                acc.add_m(num(dm.get('damage')) / iv, 1.0 / iv, int(num(dm.get('immuneBloonProperties'))))
                dur = max(dur, num(bb.get('durationFrames')) / 60.0)
            elif t in ('CreateProjectileOnAbilityActivateModel', 'PlaceProjectileAtModel') and isinstance(bb.get('projectile') or bb.get('projectileModel'), dict):
                pr = X.projectile(bb.get('projectile') or bb.get('projectileModel'), cx)
                if pr:
                    walk_node(acc, {}, pr, rng or 9999.0, (lambda i: 1.0), 1.0)
            elif t in ('AbilityCreateTowerModel', 'UCAVModel'):
                tm = bb.get('towerModel') or bb.get('ucavTowerModel')
                if isinstance(tm, dict):
                    ref = ex.subtower(tm, cx, via='ability')
                    SUBS.update(ex.subtowers)
                    st = SUBS.get(ref['ref'])
                    tl = num(bb.get('towerLifetime')) or num(bb.get('duration')) or num((st or {}).get('life'))
                    if st and tl > 0:
                        acc.merge(tower_acc(st, 1), 1.0)
                        dur = max(dur, min(tl, cd))
            elif t == 'TurboModel':
                ab['t'] = [num(bb.get('multiplier'), 1.0), num(bb.get('extraDamage'))]
                dur = max(dur, life)
            elif t == 'DamageUpModel':
                ab['u'] = num(bb.get('additionalDamage'))
                dur = max(dur, life)
            elif t == 'OverclockModel':
                ab['oc'] = [num(bb.get('rateModifier'), 1.0), life, [num(x, 1.0) for x in bb.get('tierBasedDurationMultiplier') or []]]
            elif t == 'OverclockPermanentModel':
                ab['ocp'] = [num(bb.get('rateModifier'), 1.0), int(num(bb.get('maxStacks')))]
            elif t == 'CallToArmsModel':
                ab['cta'] = [num(bb.get('multiplier'), 1.0), life]
        body = acc_out(acc)
        if body:
            ab.update(body)
        if not body and not any(k in ab for k in ('t', 'u', 'oc', 'cta')):
            continue
        ab['d'] = round(dur, 2)
        out.append(ab)
    return out


def load(path):
    with open(path, encoding='utf-8-sig') as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser(description='Build data/tower-power.json from the BTD6 game-data export')
    ap.add_argument('gd_pos', nargs='?', help='btd6-game-data checkout (same as --gd)')
    ap.add_argument('rounds_pos', nargs='?', help='Bloons Wiki DefaultRoundSet JSON (same as --rounds)')
    ap.add_argument('--gd', default=None)
    ap.add_argument('--rounds', default=None)
    ap.add_argument('--out', default=os.path.join(REPO, 'data', 'tower-power.json'))
    args = ap.parse_args()
    gd = args.gd or args.gd_pos
    if not gd:
        sys.exit(__doc__)
    rounds_path = args.rounds or args.rounds_pos
    old = load(args.out) if os.path.exists(args.out) else {}
    ex = X.Extractor(gd)
    SUBS.clear()
    out = {'_meta': {
        'source': 'https://github.com/Btd6ModHelper/btd6-game-data (BTD Mod Helper "Export Game Data")',
        'gameVersion': '56.0',
        'note': 'Throughput summary per crosspath for the leak check. a = [[attack range, damage, bloon-hits/s with 1,2,4,8,16,32 bloons in range]], '
                'm / c = damage per second to one MOAB-class / Ceramic, r = range (units; a Red moves 25 units/s). '
                'Own attacks plus permanent sub-towers; no abilities, no buffs from other towers. Data (c) Ninja Kiwi.',
        'crowd': CROWD,
        'notes': NOTES,
        'generator': 'tools/build_power.py (decoder: tools/game/extract_towers.py)',
    }, 'towers': {}, 'heroes': {}, 'bloonSpeed': {}}
    subs_report = {}
    for tid, folder in TOWERS.items():
        rows = {}
        for code in X.crosspaths():
            f = os.path.join(gd, 'Towers', folder, folder + ('' if code == '000' else '-' + code) + '.json')
            if not os.path.exists(f):
                continue
            raw = load(f)
            rec = ex.describe(raw, os.path.relpath(f, gd))
            SUBS.update(ex.subtowers)
            s, used = summarize(rec)
            abl = abilities_of(ex, raw, os.path.relpath(f, gd), num(rec.get('range')), s)
            if abl:
                s = s or {'r': round(num(rec.get('range')), 1), 'a': [], 'm': 0, 'c': 0}
                s['ab'] = abl
            if s:
                rows[code] = s
            if used:
                subs_report.setdefault(tid, {})[code] = used
        out['towers'][tid] = rows
        print(f'{tid:10} {len(rows):3} crosspaths')
    for hid, folder in HEROES.items():
        lv = {}
        for n in range(1, 21):
            f = os.path.join(gd, 'Towers', folder, folder + ('' if n == 1 else ' ' + str(n)) + '.json')
            if not os.path.exists(f):
                continue
            raw = load(f)
            rec = ex.describe(raw, os.path.relpath(f, gd))
            SUBS.update(ex.subtowers)
            s, used = summarize(rec)
            abl = abilities_of(ex, raw, os.path.relpath(f, gd), num(rec.get('range')), s)
            if abl:
                s = s or {'r': round(num(rec.get('range')), 1), 'a': [], 'm': 0, 'c': 0}
                s['ab'] = abl
            if s:
                lv[str(n)] = s
            if used:
                subs_report.setdefault(hid, {})[str(n)] = used
        out['heroes'][hid] = lv
        print(f'{hid:10} {len(lv):3} levels')
    out['_meta']['subTowers'] = 'sub-towers added (name, steady-state count) per crosspath: see _meta.subTowersUsed'
    out['_meta']['subTowersUsed'] = subs_report
    for b in ['Red', 'Blue', 'Green', 'Yellow', 'Pink', 'Black', 'White', 'Purple', 'Lead', 'Zebra', 'Rainbow', 'Ceramic', 'Moab', 'Bfb', 'Zomg', 'Ddt', 'Bad']:
        f = os.path.join(gd, 'Bloons', b, b + '.json')
        if os.path.exists(f):
            out['bloonSpeed'][b.lower()] = num(load(f).get('speed'))
    if rounds_path:
        rs = load(rounds_path)
        out['rounds'] = [[[g['bloon'], int(g['count']), round(float(g['start']), 3), round(float(g['duration']), 3)] for g in r.get('bloonGroups', [])]
                         for r in rs.get('rounds', [])]
        out['_meta']['rounds'] = 'Bloons Wiki JSON:Bloons_TD_6/Rounds/DefaultRoundSet (CC BY-NC-SA 4.0): [bloon, count, start s, duration s] per group'
        print(len(out['rounds']), 'rounds')
    elif old.get('rounds'):
        out['rounds'] = old['rounds']
        out['_meta']['rounds'] = old.get('_meta', {}).get('rounds')
        print(len(out['rounds']), 'rounds kept from the previous file')
    with open(args.out, 'w') as f:
        json.dump(out, f, separators=(',', ':'), sort_keys=True)
    print('wrote', args.out, os.path.getsize(args.out) // 1024, 'KB')


if __name__ == '__main__':
    main()
