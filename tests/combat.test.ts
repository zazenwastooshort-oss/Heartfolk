// Chapter 2, holding the camp (0.0.22): combat basics. The OSRS formulas (systems/combat.ts), the training dummy built
// at its own camp spot, the stone club he makes and wears, practising on the dummy (a fight task that strikes on his
// weapon's timer until he is sent elsewhere), the Train choice, the dummy's level limit, his health coming back, goals
// that ask for levels (the practice goal), stoking at nightfall in the middle of it, saves, the village, away time, and
// what the notices and the away note say.
// Chapter 2's goals follow the storage chest, and other goals may sit between or after them: a goal is made current by
// marking every goal before it done, never by its position.
import { describe, expect, it } from 'vitest';
import { allGoalsDone, createState, currentGoal, goalFinished, goalMet, made, maxHealth, owned, SAVE_VERSION } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS } from '../src/core/clock';
import { deserialize, readSave, serialize } from '../src/core/save';
import { bookPages, goalLines } from '../src/core/book';
import { targetOf } from '../src/core/targets';
import { catchUpAway, step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, siteOf, type Layout, type Vec2 } from '../src/world/layout';
import { navFor } from '../src/world/nav';
import { standsOf } from '../src/world/steps';
import { waterOf } from '../src/world/water';
import { applyCommands, type Command } from '../src/systems/commands';
import {
  attackRoll, defenceRoll, effectiveLevel, gearBonus, hitChance, maxHit, maxHitOf, roll, rollStrike, strikeReach, weaponOf, worn,
} from '../src/systems/combat';
import { COMBAT, DUMMY, GEAR, HEALTH, SLOTS, STRIKE, STYLES, strikeEvery, type CombatStyle } from '../src/data/combat';
import { CAMP_DONE, GOALS } from '../src/data/goals';
import { BUILD_REACH, MAKES } from '../src/data/making';
import { STAGED } from '../src/data/building';
import { STOKE } from '../src/data/fire';
import { XP_TABLE, levelFor } from '../src/data/xp';
import { addSummary, emptySummary, tally } from '../src/systems/away';
import { awayText } from '../src/ui/away';
import { cantFightText, goalLevelText, switchedText } from '../src/ui/combat';

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const SPOT = CAMP.camp!.dummy;
const goal = (id: string) => GOALS.find(g => g.id === id)!;
const at = (id: string) => GOALS.findIndex(g => g.id === id);
/** The goals before `id`: marked done, they make `id` the current goal. */
const before = (id: string) => GOALS.slice(0, at(id)).map(g => g.id);
/** In-game time on `day` (from 0) at `hour` o'clock. */
const clock = (day: number, hour: number) => (day + hour / 24) * DAY_SECONDS;
const NIGHTFALL = STOKE.at * 24;

function setup(layout: Layout = CAMP, seed = 7) {
  const state = createState(layout, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, layout, ctx: { layout, rng: createRng(seed), events } };
}
type Setup = ReturnType<typeof setup>;
const send = (s: Setup, c: Command) => applyCommands(s.state, s.layout, [c], s.events);
const runUntil = (s: Setup, done: () => boolean, max: number) => { for (let t = 0; t < max && !done(); t += STEP) step(s.state, STEP, s.ctx); };
const run = (s: Setup, seconds: number) => runUntil(s, () => false, seconds);
const since = (s: Setup, from: number) => s.log.slice(from);
const hits = (s: Setup, from = 0) => since(s, from).filter((e): e is Extract<GameEvent, { type: 'hit' }> => e.type === 'hit');

/** A camp at chapter 2: the campfire, the firewood pile, the shelter and the chest stand, every goal before the
 *  training dummy is done, and he has both tools. Morning, so no night falls in a short test. */
function campSet(seed = 7): Setup {
  const s = setup(CAMP, seed);
  s.state.goalsDone = before('dummy');
  s.state.built = ['campfire', 'woodpile', 'shelter', 'chest'];
  s.state.tools = { axe: true, pick: true, rod: false };
  s.state.hasBook = true;
  s.state.time = clock(0, 8);
  return s;
}
/** That camp with the dummy built and the stone club worn: the practice goal is current. */
function ready(seed = 7): Setup {
  const s = campSet(seed);
  s.state.built.push('dummy');
  s.state.equipment.weapon = 'stone_club';
  s.state.goalsDone = before('practice');
  return s;
}
/** Tap the dummy and wait until he is striking it. */
function practise(s: Setup): void {
  send(s, { type: 'fight', target: 'dummy' });
  runUntil(s, () => s.state.player.task.kind === 'fight', 30);
}

describe('the combat formulas (systems/combat.ts), as in OSRS', () => {
  it('max hit, attack and defence rolls, and the chance a roll lands', () => {
    expect(effectiveLevel(1, false)).toBe(9);
    expect(effectiveLevel(1, true)).toBe(9 + COMBAT.styleBonus);
    expect(maxHit(effectiveLevel(1, false), 0)).toBe(1);
    expect(maxHit(effectiveLevel(99, true), 0)).toBe(11);          // OSRS: 99 Strength, aggressive, no gear
    expect(maxHit(effectiveLevel(3, true), 6)).toBe(2);
    expect(roll(effectiveLevel(1, true), 4)).toBe(816);
    expect(defenceRoll({ defence: 1, defenceBonus: 0 })).toBe(640);
    expect(hitChance(816, 640)).toBeCloseTo(1 - 642 / 1634, 6);
    expect(hitChance(500, 640)).toBeCloseTo(500 / 1282, 6);
    expect(hitChance(1000, 1000)).toBeCloseTo(0.5, 2);
    let last = 0;
    for (let a = 100; a <= 5000; a += 100) {
      const c = hitChance(a, 1500);
      expect(c).toBeGreaterThanOrEqual(last);
      expect(c).toBeGreaterThan(0);
      expect(c).toBeLessThan(1);
      last = c;
    }
  });

  it('his rolls come from his levels, the style he trains and what he wears', () => {
    const s = setup();
    expect(worn(s.state)).toEqual([]);
    expect(weaponOf(s.state)).toBeNull();
    expect(gearBonus(s.state, 'attack')).toBe(0);
    s.state.equipment.weapon = 'stone_club';
    const club = GEAR.stone_club;
    expect(worn(s.state)).toEqual([club]);
    expect(gearBonus(s.state, 'strength')).toBe(club.strength);
    expect(s.state.combatStyle).toBe('attack');
    expect(attackRoll(s.state)).toBe(roll(effectiveLevel(1, true), club.attack));
    expect(maxHitOf(s.state)).toBe(maxHit(effectiveLevel(1, false), club.strength));
    s.state.combatStyle = 'strength';
    expect(attackRoll(s.state)).toBe(roll(effectiveLevel(1, false), club.attack));
    s.state.skills.strength = XP_TABLE[3]!;
    expect(maxHitOf(s.state)).toBe(maxHit(effectiveLevel(3, true), club.strength));
    expect(maxHitOf(s.state)).toBe(2);
  });

  it('a strike at the dummy lands about as often as the hit chance says, for 0 to his max hit', () => {
    const s = ready(), dummy = targetOf(s.state, CAMP, 'dummy')!, rng = createRng(11), n = 20000;
    const chance = hitChance(attackRoll(s.state), defenceRoll(dummy)), most = maxHitOf(s.state);
    const rolls = Array.from({ length: n }, () => rollStrike(s.state, dummy, rng));
    expect(rolls.every(d => Number.isInteger(d) && d >= 0 && d <= most)).toBe(true);
    // damage is even from 0 to his max hit when it lands, so a share most / (most + 1) of the landed ones do some
    expect(rolls.filter(d => d > 0).length / n).toBeCloseTo(chance * most / (most + 1), 1);
    expect(rolls.reduce((a, d) => a + d, 0) / n).toBeCloseTo(chance * most / 2, 1);
  });
});

describe('the dummy, the club and the goals (data)', () => {
  it("chapter 2's goals come after the chest, in order: a training dummy, a stone club, then practice", () => {
    expect(at('dummy')).toBeGreaterThan(at('chest'));
    expect(at('stone_club')).toBeGreaterThan(at('dummy'));
    expect(at('practice')).toBeGreaterThan(at('stone_club'));
    expect(goal('dummy')).toMatchObject({ title: 'A training dummy', makes: 'dummy', needs: MAKES.dummy.needs });
    expect(goal('stone_club')).toMatchObject({ title: 'A stone club', makes: 'stone_club', needs: MAKES.stone_club.needs });
    // practice asks for a level in each of the combat skills, and nothing else
    const practice = goal('practice');
    expect(practice).toMatchObject({ title: 'Practice', needs: {} });
    expect(practice.makes).toBeUndefined();
    expect(Object.keys(practice.levels!).sort()).toEqual([...STYLES].sort());
    for (const n of Object.values(practice.levels!)) expect(n).toBeGreaterThanOrEqual(2);
    // the dummy can teach every level the goal asks, so it is never impossible
    for (const n of Object.values(practice.levels!)) expect(n!).toBeLessThan(DUMMY.maxLevel);
    expect(CAMP_DONE.text).toMatch(/way along the river is open/);
  });

  it('the dummy is a structure at its own camp spot, of logs and branches, built in stages (40 seconds); the club is gear made where he stands', () => {
    expect(MAKES.dummy).toMatchObject({ name: 'Training dummy', verb: 'Build', at: 'dummy', time: 40, gives: { kind: 'structure' } });
    expect(Object.keys(MAKES.dummy.needs).sort()).toEqual(['birch_logs', 'branch']);
    expect(STAGED.dummy).toBeDefined();
    expect(MAKES.stone_club).toMatchObject({ name: 'Stone club', verb: 'Make', at: 'here', gives: { kind: 'gear', gear: 'stone_club' } });
    expect(MAKES.stone_club.time).toBeLessThan(10);
    // gear: every row has a slot, weapons a speed no quicker than the swing; armour has its slots ready
    expect(SLOTS).toEqual(['weapon', 'head', 'body', 'shield']);
    for (const g of Object.values(GEAR)) {
      expect(SLOTS).toContain(g.slot);
      if (g.slot === 'weapon') expect(g.speed!).toBeGreaterThanOrEqual(STRIKE.cycle);
    }
    expect(GEAR.stone_club.slot).toBe('weapon');
    expect(strikeEvery('stone_club')).toBe(GEAR.stone_club.speed);
    expect(strikeEvery(null)).toBe(STRIKE.cycle);
    expect(STRIKE.clip).toBe('Chop');                              // the club swings like the axe: no new clip
    expect(HEALTH.regen).toBeGreaterThan(0);
  });
});

describe("the dummy's spot at the camp", () => {
  it('is in the clearing near the camp, clear of the other spots, trees, rocks, things to pick up and the water', () => {
    expect(siteOf(CAMP, 'dummy')).toEqual(SPOT);
    expect(siteOf(VILLAGE, 'dummy')).toBeNull();
    expect(dist(SPOT.pos, CAMP.hearth.pos)).toBeLessThan(8);
    // its ring and tap area stay clear of the others' (render/structures.ts: a ring reaches 0.2 m past its spot's
    // radius, a tap area 0.37 m), with room to walk between
    const others = [CAMP.hearth, CAMP.camp!.tent, CAMP.camp!.woodpile];
    for (const o of others) expect(dist(o.pos, SPOT.pos)).toBeGreaterThan(o.radius + SPOT.radius + 2 * 0.37 + 1);
    for (const n of CAMP.nodes) expect(dist(n.pos, SPOT.pos), n.id).toBeGreaterThan(2);
    for (const p of CAMP.pickups!) expect(dist(p.pos, SPOT.pos), p.id).toBeGreaterThan(1.4);
    expect(waterOf(CAMP).edge(SPOT.pos)).toBeGreaterThan(3);
    expect(navFor(CAMP).walkable(SPOT.pos)).toBe(true);
    // its crossbar runs east to west, side on to the camera as it starts (looking north), so it reads as a dummy
    expect(SPOT.rot).toBe(0);
  });

  it('once built it blocks walking, with room to stand all round it, and the ways across the camp stay open', () => {
    const all = ['campfire', 'woodpile', 'shelter', 'chest', 'dummy'], nav = navFor(CAMP, all), reach = strikeReach(DUMMY);
    expect(nav.walkable(SPOT.pos)).toBe(false);
    expect(navFor(CAMP, all.slice(0, -1)).walkable(SPOT.pos)).toBe(true);
    let open = 0;
    for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2, stand = { x: SPOT.pos.x + Math.cos(a) * reach, z: SPOT.pos.z + Math.sin(a) * reach };
      if (nav.walkable(stand) && nav.findPath(CAMP.start, stand)) open++;
    }
    expect(open).toBe(24);
    // (the chest is in the shelter, used at its door)
    const places = [CAMP.start, CAMP.hearth.pos, standsOf(CAMP, 'shelter')[0]!, CAMP.camp!.tent.pos, ...CAMP.nodes.map(n => n.pos)];
    for (const from of places) for (const to of places) {
      expect(nav.findPath(nav.nearestWalkable(from), nav.nearestWalkable(to)), `${from.x},${from.z} > ${to.x},${to.z}`).not.toBeNull();
    }
  });
});

describe('building the training dummy and making the stone club', () => {
  it('with the chest built: build the dummy beside its spot, then make the club where he stands and wear it', () => {
    const s = campSet();
    expect(currentGoal(s.state).id).toBe('dummy');
    s.state.player.backpack = { ...MAKES.dummy.needs };
    s.state.player.pos = { x: SPOT.pos.x + 4, z: SPOT.pos.z };
    send(s, { type: 'build', id: 'dummy' });
    expect(s.state.player.backpack).toEqual({});                   // begun: what it needs taken at once
    runUntil(s, () => s.state.player.task.kind === 'raise', 30);
    expect(dist(s.state.player.pos, SPOT.pos)).toBeCloseTo(SPOT.radius + BUILD_REACH, 1);
    runUntil(s, () => made(s.state, 'dummy'), MAKES.dummy.time + 1);
    expect(s.state.built).toContain('dummy');
    expect(s.state.player.backpack).toEqual({});
    run(s, 0.1);
    expect(s.state.goalsDone).toContain('dummy');
    expect(currentGoal(s.state)).toBe(GOALS[at('dummy') + 1]);
    // he stands on open ground beside it, and the dummy itself is in the way
    expect(navFor(CAMP, s.state.built).walkable(s.state.player.pos)).toBe(true);
    // the club, where he stands: he wears it, and it isn't made twice
    s.state.goalsDone = before('stone_club');
    s.state.player.backpack = { ...MAKES.stone_club.needs };
    const where = { ...s.state.player.pos }, from = s.log.length;
    send(s, { type: 'make', id: 'stone_club' });
    runUntil(s, () => made(s.state, 'stone_club'), MAKES.stone_club.time + 1);
    expect(since(s, from)).toContainEqual({ type: 'made', make: 'stone_club' });
    expect(s.state.equipment).toEqual({ weapon: 'stone_club', head: null, body: null, shield: null });
    expect(s.state.player.pos).toEqual(where);
    expect(s.state.player.backpack).toEqual({});
    run(s, 0.1);
    expect(goalFinished(s.state, goal('stone_club'))).toBe(true);
    const after = s.log.length;
    s.state.player.backpack = { ...MAKES.stone_club.needs };
    send(s, { type: 'make', id: 'stone_club' });
    run(s, MAKES.stone_club.time + 1);
    expect(since(s, after).filter(e => e.type === 'made' || e.type === 'missing')).toEqual([]);
    expect(owned(s.state, 'branch')).toBe(MAKES.stone_club.needs.branch);
  });

  it('the goals come in order: the dummy waits for the chest, the club for the dummy', () => {
    const s = campSet();
    s.state.goalsDone = before('chest'); s.state.built = ['campfire', 'woodpile', 'shelter'];
    s.state.player.backpack = { ...MAKES.dummy.needs };
    send(s, { type: 'build', id: 'dummy' });
    expect(s.log.at(-1)).toEqual({ type: 'goalFirst', make: 'dummy', goal: 'chest' });
    expect(s.state.underway).toEqual({});
    const t = campSet();
    t.state.player.backpack = { ...MAKES.stone_club.needs };
    send(t, { type: 'make', id: 'stone_club' });
    expect(t.log.at(-1)).toEqual({ type: 'goalFirst', make: 'stone_club', goal: 'dummy' });
    expect(t.state.player.pending).toBeNull();
  });
});

describe('practising on the dummy', () => {
  it('without a weapon he says so and stays put; with the dummy not built, nothing happens', () => {
    const s = campSet();
    s.state.built.push('dummy');
    const where = { ...s.state.player.pos };
    send(s, { type: 'fight', target: 'dummy' });
    expect(s.log.at(-1)).toEqual({ type: 'cantFight', target: 'dummy', reason: 'weapon', skill: 'attack' });
    run(s, 3);
    expect(s.state.player.pos).toEqual(where);
    expect(s.state.player.task.kind).toBe('idle');
    // the club, but no dummy yet: there is nothing to fight
    const t = campSet();
    t.state.equipment.weapon = 'stone_club';
    send(t, { type: 'fight', target: 'dummy' });
    send(t, { type: 'fight', target: 'goblin_king' });
    run(t, 3);
    expect(t.log.filter(e => e.type !== 'goalDone')).toEqual([]);      // (wearing the club finished its goal)
    expect(t.state.player.task.kind).toBe('idle');
  });

  it('with the club he stands within reach, faces it and strikes on his weapon\'s timer: XP to the style, a third to Vitality', () => {
    const s = ready();
    s.state.player.pos = { x: SPOT.pos.x + 5, z: SPOT.pos.z + 2 };
    send(s, { type: 'fight', target: 'dummy' });
    expect(s.state.player.pending).toEqual({ kind: 'fight', id: 'dummy' });
    runUntil(s, () => s.state.player.task.kind === 'fight', 30);
    expect(dist(s.state.player.pos, SPOT.pos)).toBeCloseTo(strikeReach(DUMMY), 1);
    run(s, 1);
    const face = Math.atan2(-(SPOT.pos.z - s.state.player.pos.z), SPOT.pos.x - s.state.player.pos.x);
    expect(Math.abs(Math.atan2(Math.sin(s.state.player.heading - face), Math.cos(s.state.player.heading - face)))).toBeLessThan(0.05);
    const from = s.log.length, xp0 = { ...s.state.skills };
    run(s, 60);
    const struck = hits(s, from), every = strikeEvery('stone_club');
    expect(struck.length).toBeGreaterThanOrEqual(Math.floor(60 / every) - 1);
    expect(struck.length).toBeLessThanOrEqual(Math.ceil(60 / every) + 1);
    const most = maxHitOf(s.state), damage = struck.reduce((a, e) => a + e.damage, 0);
    expect(struck.every(e => e.target === 'dummy' && e.damage >= 0 && e.damage <= most)).toBe(true);
    expect(struck.some(e => e.damage === 0)).toBe(true);           // misses show 0
    expect(damage).toBeGreaterThan(0);
    expect(s.state.skills.attack - xp0.attack).toBeCloseTo(damage * DUMMY.xp, 6);
    expect(s.state.skills.vitality - xp0.vitality).toBeCloseTo(damage * DUMMY.xp * COMBAT.vitality, 6);
    expect(s.state.skills.strength).toBe(0);
    expect(s.state.skills.defence).toBe(0);
    // an idle activity: still at it minutes later, on the same spot, until sent elsewhere
    const spot = { ...s.state.player.pos };
    run(s, 180);
    expect(s.state.player.task.kind).toBe('fight');
    expect(s.state.player.pos).toEqual(spot);
    send(s, { type: 'walk', to: { x: SPOT.pos.x - 3, z: SPOT.pos.z - 3 } });
    const stopped = s.log.length;
    run(s, 10);
    expect(hits(s, stopped)).toEqual([]);
    expect(s.state.player.task.kind).toBe('idle');
  });

  it('tapping the dummy again while he practises changes nothing', () => {
    const s = ready();
    practise(s);
    run(s, 1.3);
    const task = { ...s.state.player.task };
    send(s, { type: 'fight', target: 'dummy' });
    expect(s.state.player.task).toEqual(task);
  });

  it('the Train choice: XP goes to the style chosen; choosing never stops him; anything else is ignored', () => {
    const s = ready();
    practise(s);
    run(s, 20);
    send(s, { type: 'style', style: 'strength' });
    expect(s.state.combatStyle).toBe('strength');
    expect(s.state.player.task.kind).toBe('fight');
    const attack = s.state.skills.attack;
    run(s, 40);
    expect(s.state.skills.attack).toBe(attack);
    expect(s.state.skills.strength).toBeGreaterThan(0);
    send(s, { type: 'style', style: 'defence' });
    run(s, 40);
    expect(s.state.skills.defence).toBeGreaterThan(0);
    send(s, { type: 'style', style: 'magic' as CombatStyle });
    expect(s.state.combatStyle).toBe('defence');
    expect(s.state.player.task.kind).toBe('fight');
  });

  it('when the style he trains reaches what the practice goal asks, he says so once and trains the next it asks for', () => {
    const s = ready(), need = goal('practice').levels!.attack!;
    s.state.skills.attack = XP_TABLE[need]! - 1;
    practise(s);
    const from = s.log.length;
    runUntil(s, () => since(s, from).some(e => e.type === 'goalLevel'), 120);
    expect(since(s, from).find(e => e.type === 'goalLevel')).toEqual({ type: 'goalLevel', skill: 'attack', level: need, goal: 'practice', next: 'strength' });
    expect(s.state.combatStyle).toBe('strength');
    expect(s.state.player.task.kind).toBe('fight');
    run(s, 60);
    expect(since(s, from).filter(e => e.type === 'goalLevel' && e.skill === 'attack')).toHaveLength(1);
    expect(levelFor(s.state.skills.attack)).toBeGreaterThanOrEqual(need);
    expect(s.state.skills.strength).toBeGreaterThan(0);
  });

  it("the dummy teaches each style up to its level: he moves on to one it can still teach, and stops when it has taught him all three", () => {
    // a tap with Attack at the limit: he trains the next skill the practice goal asks for, and sets off
    const s = ready();
    s.state.skills.attack = XP_TABLE[DUMMY.maxLevel]!;
    send(s, { type: 'fight', target: 'dummy' });
    expect(s.log).toContainEqual({ type: 'switchedStyle', target: 'dummy', from: 'attack', to: 'strength' });
    expect(s.state.combatStyle).toBe('strength');
    expect(s.state.player.pending).toEqual({ kind: 'fight', id: 'dummy' });
    // with no goal asking for levels, reaching the limit mid-practice moves him on to the lowest it can still teach
    const u = ready();
    u.state.goalsDone = before('berries');
    u.state.skills = { ...u.state.skills, attack: XP_TABLE[DUMMY.maxLevel]! - 1, strength: XP_TABLE[5]!, defence: XP_TABLE[4]! };
    practise(u);
    runUntil(u, () => u.log.some(e => e.type === 'switchedStyle'), 300);
    expect(u.log.find(e => e.type === 'switchedStyle')).toEqual({ type: 'switchedStyle', target: 'dummy', from: 'attack', to: 'defence' });
    expect(u.state.player.task.kind).toBe('fight');
    // just below the limit in the last skill it can teach: he practises up to it, then stops by himself, saying so
    const t = ready();
    t.state.goalsDone = before('berries');
    t.state.skills = { ...t.state.skills, attack: XP_TABLE[DUMMY.maxLevel]!, strength: XP_TABLE[DUMMY.maxLevel]!, defence: XP_TABLE[DUMMY.maxLevel]! - 1 };
    t.state.combatStyle = 'defence';
    practise(t);
    runUntil(t, () => t.state.player.task.kind !== 'fight', 300);
    expect(t.log.at(-1)).toEqual({ type: 'cantFight', target: 'dummy', reason: 'taught', skill: 'defence' });
    expect(levelFor(t.state.skills.defence)).toBe(DUMMY.maxLevel);
    send(t, { type: 'fight', target: 'dummy' });
    expect(t.log.at(-1)).toEqual({ type: 'cantFight', target: 'dummy', reason: 'taught', skill: 'defence' });
    expect(t.state.player.pending).toBeNull();
  });

  it('the notices say plainly what happens: make a weapon; he trains the next skill; the dummy has taught him all it can', () => {
    const s = ready(), need = goal('practice').levels!.strength!;
    expect(cantFightText(s.state, CAMP, 'dummy', 'weapon', 'attack')).toBe('You need a weapon to practise with. A stone club will do.');
    // stopped with a goal asking for more of a skill than it teaches (the rats teach more), or with all three taught
    s.state.skills.defence = XP_TABLE[DUMMY.maxLevel]!;
    expect(cantFightText(s.state, CAMP, 'dummy', 'taught', 'defence')).toBe("The training dummy can't teach you any more Defence.");
    s.state.skills.attack = XP_TABLE[DUMMY.maxLevel]!; s.state.skills.strength = XP_TABLE[DUMMY.maxLevel]!;
    expect(cantFightText(s.state, CAMP, 'dummy', 'taught', 'defence')).toBe('The training dummy has taught you all it can.');
    expect(switchedText(s.state, CAMP, 'dummy', 'attack', 'strength')).toBe("The training dummy can't teach you any more Attack. Now he trains Strength.");
    expect(goalLevelText(s.state, 'strength', need, 'practice', 'defence')).toBe(`Strength level ${need}: that's enough for "Practice". Now he trains Defence.`);
    expect(goalLevelText(s.state, 'strength', need, 'practice')).toBe(`Strength level ${need}: that's enough for "Practice".`);
  });

  it('idle practice, switching style when told, finishes the practice goal in a few minutes', () => {
    const s = ready(3), levels = goal('practice').levels!;
    s.state.bank = {};                                              // no logs for the fire: nightfall changes nothing
    practise(s);
    const started = s.state.time;
    for (let guard = 0; guard < 10 && !s.state.goalsDone.includes('practice'); guard++) {
      const from = s.log.length;
      runUntil(s, () => s.state.goalsDone.includes('practice') || since(s, from).some(e => e.type === 'goalLevel'), 900);
      const next = STYLES.find(st => levelFor(s.state.skills[st]) < levels[st]!);
      if (next) send(s, { type: 'style', style: next });
    }
    const minutes = (s.state.time - started) / 60;
    expect(s.state.goalsDone).toContain('practice');
    expect(minutes).toBeGreaterThan(2);
    expect(minutes).toBeLessThan(10);
    for (const st of STYLES) expect(levelFor(s.state.skills[st])).toBeGreaterThanOrEqual(levels[st]!);
    // Vitality came with it: his most health grew, and he is at full health
    expect(levelFor(s.state.skills.vitality)).toBeGreaterThanOrEqual(2);
    expect(maxHealth(s.state)).toBeGreaterThan(HEALTH.base);
    expect(s.state.health).toBe(maxHealth(s.state));
  });
});

describe('the practice goal: a goal that asks for levels', () => {
  it('is met once every level is reached; the card and the book show "level" lines, counting his level', () => {
    const s = ready(), practice = goal('practice');
    expect(currentGoal(s.state)).toBe(practice);
    expect(goalMet(s.state, practice)).toBe(false);
    s.state.skills.attack = XP_TABLE[2]!; s.state.skills.strength = XP_TABLE[3]!;
    const lines = goalLines(s.state, practice);
    expect(lines).toEqual([
      { id: 'attack', need: 3, got: 2, done: false, level: true },
      { id: 'strength', need: 3, got: 3, done: true, level: true },
      { id: 'defence', need: 3, got: 1, done: false, level: true },
    ]);
    expect(bookPages(s.state).at(-1)).toMatchObject({ goal: 'practice', current: true, done: false, hint: practice.hint, lines });
    // levels past what it asks count no more than it asks
    s.state.skills.attack = XP_TABLE[9]!; s.state.skills.defence = XP_TABLE[3]!;
    expect(goalLines(s.state, practice).map(l => l.got)).toEqual([3, 3, 3]);
    expect(goalMet(s.state, practice)).toBe(true);
    expect(goalFinished(s.state, practice)).toBe(true);
    run(s, 0.1);
    expect(s.state.goalsDone).toContain('practice');
    expect(allGoalsDone(s.state)).toBe(at('practice') === GOALS.length - 1);
  });
});

describe('his health', () => {
  it('comes back 1 every HEALTH.regen seconds while hurt, never past his most', () => {
    const s = ready();
    s.state.health = 4;
    run(s, HEALTH.regen * 3);
    expect(s.state.health).toBeGreaterThanOrEqual(6);
    expect(s.state.health).toBeLessThanOrEqual(7);
    run(s, HEALTH.regen * 10);
    expect(s.state.health).toBe(maxHealth(s.state));
    expect(Number.isInteger(s.state.health)).toBe(true);
  });

  it('a Vitality level adds to his health as well as his most', () => {
    const s = ready();
    s.state.skills.vitality = XP_TABLE[2]! - 0.5;
    expect(s.state.health).toBe(HEALTH.base);
    practise(s);
    runUntil(s, () => levelFor(s.state.skills.vitality) >= 2, 300);
    expect(maxHealth(s.state)).toBe(HEALTH.base + HEALTH.perLevel);
    expect(s.state.health).toBe(HEALTH.base + HEALTH.perLevel);
  });
});

describe('stoking the fire at nightfall in the middle of practice', () => {
  it('he leaves the dummy, stokes the fire, then goes back to practising by himself', () => {
    const s = ready();
    s.state.built = s.state.built.filter(b => b !== 'shelter');   // (no shelter: he works through the night, not to bed)
    s.state.woodpile = 6;
    s.state.time = clock(0, NIGHTFALL) - 20;
    practise(s);
    runUntil(s, () => s.log.some(e => e.type === 'stokeOff'), 60);
    expect(s.state.player.stoke?.back).toEqual({ fight: 'dummy' });
    expect(s.state.player.task.kind).toBe('walk');
    runUntil(s, () => s.log.some(e => e.type === 'stoked'), 60);
    expect(s.state.player.pending).toEqual({ kind: 'fight', id: 'dummy' });
    runUntil(s, () => s.state.player.task.kind === 'fight', 30);
    const from = s.log.length;
    run(s, 10);
    expect(hits(s, from).length).toBeGreaterThan(2);
    expect(s.state.woodpile).toBe(6 - STOKE.logs);
  });

  it('on his way to the dummy at nightfall, he stokes first and then goes on to it', () => {
    const s = ready();
    s.state.woodpile = 3;
    s.state.player.pos = { x: 8, z: 9 };
    s.state.time = clock(0, NIGHTFALL) - 0.2;
    send(s, { type: 'fight', target: 'dummy' });
    runUntil(s, () => s.log.some(e => e.type === 'stokeOff'), 5);
    expect(s.state.player.stoke?.back).toEqual({ fight: 'dummy' });
    runUntil(s, () => s.state.player.task.kind === 'fight', 120);
    expect(s.log.some(e => e.type === 'stoked')).toBe(true);
  });
});

describe('saving practice', () => {
  it('a save made mid-practice, or on the way to the dummy, carries on after a reload', () => {
    const s = ready();
    practise(s);
    run(s, 7.3);
    const back = deserialize(serialize(s.state), CAMP);
    expect(back).toEqual(s.state);
    const loaded = { ...setup(CAMP, 9), state: back };
    run(loaded, 10);
    expect(loaded.state.player.task.kind).toBe('fight');
    expect(hits(loaded).length).toBeGreaterThan(2);
    // on the way there
    const w = ready();
    w.state.player.pos = { x: SPOT.pos.x + 6, z: SPOT.pos.z };
    send(w, { type: 'fight', target: 'dummy' });
    run(w, 0.4);
    const walking = { ...setup(CAMP, 9), state: deserialize(serialize(w.state), CAMP) };
    expect(walking.state.player.pending).toEqual({ kind: 'fight', id: 'dummy' });
    runUntil(walking, () => walking.state.player.task.kind === 'fight', 30);
    expect(walking.state.player.task.kind).toBe('fight');
  });

  it('round-trips what he wears and trains; damaged values fall back to a new game\'s', () => {
    const s = ready();
    s.state.combatStyle = 'defence';
    const back = deserialize(serialize(s.state), CAMP);
    expect(back.equipment).toEqual({ weapon: 'stone_club', head: null, body: null, shield: null });
    expect(back.combatStyle).toBe('defence');
    const fresh = createState(CAMP).equipment;
    for (const bad of [{ weapon: 'laser', head: 'stone_club', body: 7 }, 'junk', null, ['stone_club']]) {
      const raw = JSON.parse(serialize(s.state)); raw.equipment = bad; raw.combatStyle = bad;
      const st = deserialize(JSON.stringify(raw), CAMP);
      expect(st.equipment, JSON.stringify(bad)).toEqual(fresh);
      expect(st.combatStyle).toBe('attack');
    }
    // the club goes in the weapon slot only
    const raw = JSON.parse(serialize(s.state)); raw.equipment = { weapon: null, shield: 'stone_club' };
    expect(deserialize(JSON.stringify(raw), CAMP).equipment).toEqual(fresh);
  });

  it('a fight with nothing to fight, no weapon or a broken timer stops cleanly; so does a walk to a dummy not built', () => {
    const s = ready();
    practise(s);
    run(s, 1);
    const good = JSON.parse(serialize(s.state));
    const load = (edit: (raw: any) => void) => { const raw = structuredClone(good); edit(raw); return deserialize(JSON.stringify(raw), CAMP); };
    expect(load(() => {}).player.task.kind).toBe('fight');
    expect(load(r => { r.built = r.built.filter((b: string) => b !== 'dummy'); }).player.task).toEqual({ kind: 'idle' });
    expect(load(r => { r.equipment.weapon = null; }).player.task).toEqual({ kind: 'idle' });
    for (const bad of [null, 'half', -0.2, 1, 7, NaN]) expect(load(r => { r.player.task.progress = bad; }).player.task, String(bad)).toEqual({ kind: 'idle' });
    expect(load(r => { r.player.task.target = 'dragon'; }).player.task).toEqual({ kind: 'idle' });
    // walking to a dummy that isn't there
    const walking = load(r => { r.built = r.built.filter((b: string) => b !== 'dummy'); r.player.task = { kind: 'walk' }; r.player.pending = { kind: 'fight', id: 'dummy' }; r.player.path = [{ x: 1, z: 1 }]; });
    expect(walking.player.pending).toBeNull();
    expect(walking.player.path).toEqual([]);
    expect(walking.player.task).toEqual({ kind: 'idle' });
    // stoking, going back to the dummy afterwards: kept while it stands, dropped when it doesn't
    const stoking = (built: string[]) => load(r => {
      r.built = built; r.woodpile = 0;
      r.player.task = { kind: 'walk' }; r.player.pending = { kind: 'visit', id: 'woodpile' }; r.player.path = [{ x: 4, z: 1.2 }];
      r.player.stoke = { back: { fight: 'dummy' }, logs: 0, empty: false, from: 'woodpile' };
    });
    expect(stoking(['campfire', 'woodpile', 'shelter', 'chest', 'dummy']).player.stoke?.back).toEqual({ fight: 'dummy' });
    expect(stoking(['campfire', 'woodpile', 'shelter', 'chest']).player.stoke?.back).toBeNull();
  });

  it('an old 0.0.21 save (format 9) with every camp goal done loads with the next goal, chapter 2\'s, current', () => {
    const s = campSet();
    s.state.goalsDone = GOALS.slice(0, at('chest') + 1).map(g => g.id);
    const raw = JSON.parse(serialize(s.state, Date.now()));
    raw.version = 9;
    delete raw.health; delete raw.equipment; delete raw.combatStyle;
    raw.skills = { mining: 900, woodcutting: 2400 };
    const back = readSave(JSON.stringify(raw), CAMP).state;
    expect(SAVE_VERSION).toBe(12);
    expect(back.version).toBe(SAVE_VERSION);
    expect(allGoalsDone(back)).toBe(false);
    expect(currentGoal(back)).toBe(GOALS[at('chest') + 1]);
    for (const id of ['dummy', 'stone_club', 'practice']) expect(goalFinished(back, goal(id)), id).toBe(false);
    expect(back.equipment).toEqual(createState(CAMP).equipment);
    expect(back.combatStyle).toBe('attack');
    expect(back.health).toBe(maxHealth(back));
    expect(bookPages(back).at(-1)).toMatchObject({ goal: currentGoal(back).id, current: true, done: false });
    // and the dummy can be built when its goal comes
    const loaded = { ...setup(), state: back };
    loaded.state.goalsDone = before('dummy');
    loaded.state.player.backpack = { ...MAKES.dummy.needs };
    send(loaded, { type: 'build', id: 'dummy' });
    runUntil(loaded, () => made(loaded.state, 'dummy'), 60);
    expect(loaded.state.built).toContain('dummy');
  });

  it('a format 5 save never counts the practice goal done (it asks for levels, which no old save had)', () => {
    const raw = JSON.parse(serialize(createState(CAMP, 4)));
    const { built: _b, goalsDone: _g, equipment: _e, combatStyle: _c, health: _h, ...rest } = raw;
    const back = deserialize(JSON.stringify({ ...rest, version: 5 }), CAMP);
    expect(back.goalsDone).not.toContain('practice');
    expect(back.goalsDone).toEqual([]);
  });
});

describe('the village has no dummy', () => {
  it('fighting does nothing, it cannot be built, and a dummy or a fight in a village save is dropped', () => {
    const s = setup(VILLAGE);
    s.state.equipment.weapon = 'stone_club';
    s.state.player.backpack = { ...MAKES.dummy.needs };
    send(s, { type: 'fight', target: 'dummy' });
    send(s, { type: 'make', id: 'dummy' });
    send(s, { type: 'build', id: 'dummy' });
    run(s, 3);
    expect(s.log).toEqual([]);
    expect(s.state.built).toEqual([]);
    expect(targetOf({ ...s.state, built: ['dummy'] }, VILLAGE, 'dummy')).toBeNull();
    const raw = JSON.parse(serialize(s.state));
    raw.built = ['dummy']; raw.player.task = { kind: 'fight', target: 'dummy', progress: 0.2 };
    const back = deserialize(JSON.stringify(raw), VILLAGE);
    expect(back.built).toEqual([]);
    expect(back.player.task).toEqual({ kind: 'idle' });
    // his health still comes back there
    back.health = 5;
    const v = { ...setup(VILLAGE), state: back };
    run(v, HEALTH.regen * 2 + 1);
    expect(v.state.health).toBeGreaterThan(5);
  });
});

describe('away time while practising', () => {
  it('two hours closed (24 minutes of play) catches up the same every time, quickly, and stops cleanly at the dummy\'s limit', () => {
    // Strength and Defence already as high as the dummy teaches, so reaching its limit in Attack leaves nothing to learn
    const s = ready();
    s.state.skills.strength = XP_TABLE[DUMMY.maxLevel]!; s.state.skills.defence = XP_TABLE[DUMMY.maxLevel]!;
    practise(s);
    run(s, 5);
    const saved = serialize(s.state, 1_000_000), now = 1_000_000 + 2 * 60 * 60 * 1000;
    const reopen = () => {
      const t = setup(CAMP, 21), state = readSave(saved, CAMP).state, log: GameEvent[] = [];
      t.events.on(e => log.push(e));
      // how quick: the processor time this test's own process spent on it, so other work on the machine (the rest of
      // the suite running beside it) doesn't count
      const started = process.cpuUsage();
      const r = catchUpAway(state, 1_000_000, now, { ...t.ctx, rng: createRng(99) });
      const used = process.cpuUsage(started);
      return { state, r, ms: (used.user + used.system) / 1000, log };
    };
    const a = reopen(), b = reopen();
    expect(a.state).toEqual(b.state);
    expect(a.r.summary).toEqual(b.r.summary);
    // (about 0.3 s alone; beside the whole suite on a busy machine, up to about 1.1 s)
    expect(a.ms).toBeLessThan(2000);
    expect(a.r.away.game).toBeCloseTo(24 * 60, 0);
    expect(a.r.summary.xp.attack).toBeGreaterThan(0);
    expect(a.r.summary.xp.vitality).toBeGreaterThan(0);
    // 24 minutes of practice is enough to reach the dummy's limit in Attack: he stopped there, saying so
    expect(levelFor(a.state.skills.attack)).toBe(DUMMY.maxLevel);
    expect(a.state.player.task.kind).toBe('idle');
    expect(a.log.filter(e => e.type === 'cantFight')).toEqual([{ type: 'cantFight', target: 'dummy', reason: 'taught', skill: 'attack' }]);
    // nothing listens to that notice yet when a save is opened, so "While you were away" tells why he stands idle
    expect(a.r.summary.taught).toEqual({ target: 'dummy', skill: 'attack' });
    expect(awayText([a.r.away], a.r.summary).lines.at(-1)).toBe("Then the training dummy couldn't teach him any more Attack, so he stopped.");
  });

  it("the away note counts a stop at the dummy's limit, not a refusal for want of a weapon; a later stop is the one told", () => {
    const s = emptySummary();
    tally(s, { type: 'cantFight', target: 'dummy', reason: 'weapon', skill: 'attack' });
    expect(s).toEqual(emptySummary());
    expect('taught' in s).toBe(false);                             // (so summaries without one compare as before)
    expect(awayText([], s).lines).toEqual([]);
    tally(s, { type: 'cantFight', target: 'dummy', reason: 'taught', skill: 'attack' });
    expect(s.taught).toEqual({ target: 'dummy', skill: 'attack' });
    const into = emptySummary();
    addSummary(into, s);
    expect(into.taught).toEqual({ target: 'dummy', skill: 'attack' });
    const later = emptySummary();
    tally(later, { type: 'cantFight', target: 'dummy', reason: 'taught', skill: 'defence' });
    addSummary(into, later);
    addSummary(into, emptySummary());
    expect(into.taught).toEqual({ target: 'dummy', skill: 'defence' });
    expect(awayText([], into).lines).toEqual(["Then the training dummy couldn't teach him any more Defence, so he stopped."]);
  });
});
