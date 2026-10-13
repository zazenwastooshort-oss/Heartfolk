// Chapter 2, holding the camp, part 2: rats in the woods (systems/rats.ts, core/rats.ts, numbers in data/rats.ts). The
// nest downriver and its three rats pottering about (they never go for him); fighting them with a tap on a rat (his
// strikes as at the training dummy, through the same fight loop and targets; each rat bites back on its own timer, OSRS
// rolls against his Defence and his gear); the hides they leave; going on to the next rat, waiting by the nest, rats
// coming back; eating in a fight; food taken from the chest; a full backpack; being knocked out, gently; stoking at
// nightfall; saves; away time and its note; the village; the goal after the cooked meal.
// Other goals may sit between or after chapter 2's: a goal is made current by marking every goal before it done, never
// by its position.
import { describe, expect, it } from 'vitest';
import { createState, currentGoal, goalFinished, maxHealth, owned, SAVE_VERSION, type GameState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS } from '../src/core/clock';
import { deserialize, readSave, serialize } from '../src/core/save';
import { bookPages } from '../src/core/book';
import { targetOf, fightLabel } from '../src/core/targets';
import { ratsOf, ratSpot } from '../src/core/rats';
import { catchUpAway, step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, siteOf, type Layout, type Vec2 } from '../src/world/layout';
import { navFor } from '../src/world/nav';
import { waterOf } from '../src/world/water';
import { applyCommands, type Command } from '../src/systems/commands';
import { attackRoll, defenceRoll, effectiveLevel, hitChance, maxHitOf, roll, strikeReach } from '../src/systems/combat';
import { backpackCount } from '../src/systems/backpack';
import { wakeSpot } from '../src/systems/rats';
import { COMBAT, DUMMY, GEAR, HEALTH } from '../src/data/combat';
import { BITE_LANDS, FIGHT_FOOD, KNOCKED_OUT, POTTER, RAT } from '../src/data/rats';
import { GOALS } from '../src/data/goals';
import { ITEMS } from '../src/data/skills';
import { STOKE } from '../src/data/fire';
import { BACKPACK_SLOTS } from '../src/data/hauling';
import { XP_TABLE } from '../src/data/xp';
import { addSummary, emptySummary, tally } from '../src/systems/away';
import { awayText } from '../src/ui/away';
import { cantFightText } from '../src/ui/combat';

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const NEST = CAMP.nests![0]!;
const RATS = ratsOf(CAMP).map(r => r.id);
const at = (id: string) => GOALS.findIndex(g => g.id === id);
/** The goals before `id`: marked done, they make `id` the current goal. */
const before = (id: string) => GOALS.slice(0, at(id)).map(g => g.id);
/** In-game time on `day` (from 0) at `hour` o'clock. */
const clock = (day: number, hour: number) => (day + hour / 24) * DAY_SECONDS;
const NIGHTFALL = STOKE.at * 24;
const REACH = strikeReach(RAT);

function setup(layout: Layout = CAMP, seed = 7) {
  const state = createState(layout, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, layout, ctx: { layout, rng: createRng(seed), events } };
}
type Setup = ReturnType<typeof setup>;
const send = (s: Setup, c: Command) => applyCommands(s.state, s.layout, [c], s.events);
const runUntil = (s: Setup, done: () => boolean, max: number) => { let t = 0; for (; t < max && !done(); t += STEP) step(s.state, STEP, s.ctx); return t; };
const run = (s: Setup, seconds: number) => runUntil(s, () => false, seconds);
const since = (s: Setup, from: number) => s.log.slice(from);
const of = <T extends GameEvent['type']>(s: Setup, type: T, from = 0) => since(s, from).filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

/** A camp at the rats' goal: every goal before it done, the camp built, the stone club worn, his tools, a Vitality and
 *  combat levels from practice; morning, so no night falls in a short test; he stands on the grass between the camp and
 *  the nest, with nothing in his backpack and nothing in the chest. */
function ready(seed = 7): Setup {
  const s = setup(CAMP, seed);
  s.state.goalsDone = before('rats');
  s.state.built = ['campfire', 'woodpile', 'shelter', 'chest', 'dummy'];
  s.state.tools = { axe: true, pick: true, rod: true };
  s.state.hasBook = true;
  s.state.equipment.weapon = 'stone_club';
  for (const skill of ['attack', 'strength', 'defence'] as const) s.state.skills[skill] = XP_TABLE[3]!;
  s.state.skills.vitality = XP_TABLE[3]!;
  s.state.health = maxHealth(s.state);
  s.state.time = clock(0, 8);
  s.state.player.pos = { x: -7.5, z: 9.5 };
  return s;
}
/** Tap rat `id` and wait until he is striking it. */
function engage(s: Setup, id = 'rat1'): void {
  send(s, { type: 'fight', target: id });
  runUntil(s, () => s.state.player.task.kind === 'fight', 30);
}

describe('the rats (data)', () => {
  it('are weak: about 5 health, a max hit of 1, slow bites; a hide about half the time; back after about a minute', () => {
    expect(RAT.health).toBeGreaterThanOrEqual(4);
    expect(RAT.health).toBeLessThanOrEqual(6);
    expect(RAT.maxHit).toBe(1);
    expect(RAT.every).toBeGreaterThanOrEqual(2.4);           // no quicker than OSRS's rats
    expect(RAT.first).toBeLessThan(RAT.every);
    expect(BITE_LANDS).toBeLessThan(RAT.every);
    expect(RAT.drop).toEqual({ item: 'rat_hide', chance: 0.5 });
    expect(ITEMS[RAT.drop.item]).toBeDefined();
    expect(RAT.back).toBeGreaterThanOrEqual(45);
    expect(RAT.back).toBeLessThanOrEqual(90);
    expect(RAT.xp).toBe(DUMMY.xp);                          // XP per damage as at the dummy
    expect(FIGHT_FOOD).toEqual({ below: 0.4, take: 5 });
    expect(KNOCKED_OUT.health).toBe(0.5);
    expect(KNOCKED_OUT.slump).toBeGreaterThan(1);
    expect(KNOCKED_OUT.slump).toBeLessThan(6);
  });
});

describe('the nest downriver', () => {
  it('is in the edge of the woods south-west of the camp, along the river bank, a short walk from the shelter', () => {
    expect(CAMP.nests).toHaveLength(1);
    expect(NEST.rats).toBe(3);
    expect(RATS).toEqual(['rat1', 'rat2', 'rat3']);
    // downriver: south-west of the fire and the pool, near the river but clear of its bank
    expect(NEST.pos.x).toBeLessThan(CAMP.hearth.pos.x - 8);
    expect(NEST.pos.z).toBeGreaterThan(CAMP.hearth.pos.z + 5);
    expect(NEST.pos.z).toBeGreaterThan(CAMP.falls!.pool.pos.z + 15);
    const edge = waterOf(CAMP).edge(NEST.pos);
    expect(edge).toBeGreaterThan(NEST.radius + 1.5);
    expect(edge).toBeLessThan(6);
    // the woods begin just south of it
    expect(CAMP.trees.some(t => dist(t.pos, NEST.pos) < 4)).toBe(true);
    // a short walk from the shelter's front: under 25 m along the way
    const nav = navFor(CAMP, ['campfire', 'woodpile', 'shelter', 'chest', 'dummy']);
    const from = wakeSpot(ready().state, CAMP).pos, path = nav.findPath(from, ratSpot(CAMP, 'rat2')!.home)!;
    let len = 0, p = from;
    for (const w of path) { len += dist(p, w); p = w; }
    expect(len).toBeLessThan(25);
  });

  it('is clear of the camp\'s spots, its trees and rocks, the fishing banks, the things to pick up; it blocks walking', () => {
    const spots = [CAMP.hearth, CAMP.camp!.tent, CAMP.camp!.chest, CAMP.camp!.woodpile, CAMP.camp!.dummy];
    for (const o of spots) expect(dist(o.pos, NEST.pos)).toBeGreaterThan(o.radius + NEST.roam + 4);
    for (const n of CAMP.nodes) expect(dist(n.pos, NEST.pos), n.id).toBeGreaterThan(NEST.roam + 2.5);
    for (const p of CAMP.pickups!) expect(dist(p.pos, NEST.pos), p.id).toBeGreaterThan(NEST.radius + 1);
    for (const b of CAMP.bushes) expect(dist(b, NEST.pos)).toBeGreaterThan(NEST.radius + 1.5);
    for (const t of CAMP.trees) expect(dist(t.pos, NEST.pos)).toBeGreaterThan(NEST.radius + 1.5);
    expect(navFor(CAMP).walkable(NEST.pos)).toBe(false);
    expect(siteOf(CAMP, 'dummy')).not.toBeNull();
  });

  it('its rats start at home by its hole, where he can walk up to them, and the ways across the camp stay open', () => {
    const built = ['campfire', 'woodpile', 'shelter', 'chest', 'dummy'], nav = navFor(CAMP, built), s = ready();
    for (const spot of ratsOf(CAMP)) {
      expect(spot.nest).toBe(NEST);
      expect(nav.walkable(spot.home), spot.id).toBe(true);
      expect(dist(spot.home, NEST.pos)).toBeLessThan(NEST.roam);
      expect(s.state.rats[spot.id]).toMatchObject({ health: RAT.health, downUntil: null, pos: spot.home, to: null, bite: null });
      expect(nav.findPath(CAMP.start, spot.home), spot.id).not.toBeNull();
    }
    const places = [CAMP.start, CAMP.hearth.pos, CAMP.camp!.chest.pos, ...CAMP.nodes.map(n => n.pos)];
    for (const from of places) for (const to of places) expect(nav.findPath(nav.nearestWalkable(from), nav.nearestWalkable(to))).not.toBeNull();
  });

  it('the village has no nest and no rats', () => {
    expect(VILLAGE.nests).toBeUndefined();
    expect(ratsOf(VILLAGE)).toEqual([]);
    expect(createState(VILLAGE).rats).toEqual({});
  });
});

describe('the rats potter about', () => {
  it('near the nest, a short scurry at a time, on open ground and apart from the nest, and never go for him', () => {
    const s = ready(), moved: Record<string, number> = {}, last = Object.fromEntries(RATS.map(id => [id, { ...s.state.rats[id]!.pos }]));
    const nav = navFor(CAMP, s.state.built);
    let scurrying = 0, samples = 0;
    for (let t = 0; t < 600; t += 0.5) {
      run(s, 0.5);
      for (const id of RATS) {
        const r = s.state.rats[id]!;
        expect(dist(r.pos, NEST.pos), id).toBeLessThanOrEqual(NEST.roam + 0.01);
        expect(dist(r.pos, NEST.pos), id).toBeGreaterThan(NEST.radius + 0.3);
        expect(nav.walkable(r.pos), id).toBe(true);
        moved[id] = (moved[id] ?? 0) + dist(r.pos, last[id]!);
        last[id] = { ...r.pos };
        if (r.to) scurrying++;
        samples++;
      }
    }
    // each wandered about, mostly sniffing about rather than running
    for (const id of RATS) expect(moved[id], id).toBeGreaterThan(20);
    expect(scurrying / samples).toBeGreaterThan(0.05);
    expect(scurrying / samples).toBeLessThan(0.5);
    // ten minutes beside them: not one bite
    expect(of(s, 'bitten')).toEqual([]);
    expect(s.state.health).toBe(maxHealth(s.state));
    expect(s.state.player.task.kind).toBe('idle');
  });

  it('the same every time it is played', () => {
    const a = ready(), b = ready(9);
    run(a, 120); run(b, 120);
    expect(a.state.rats).toEqual(b.state.rats);        // (the rats draw nothing from the shared randomness)
  });
});

describe('fighting the rats', () => {
  it('without a weapon he says so and stays put; the hover says "Fight|Rat"', () => {
    const s = ready();
    s.state.equipment.weapon = null;
    const where = { ...s.state.player.pos };
    send(s, { type: 'fight', target: 'rat1' });
    expect(s.log.at(-1)).toEqual({ type: 'cantFight', target: 'rat1', reason: 'weapon', skill: 'attack' });
    run(s, 3);
    expect(s.state.player.pos).toEqual(where);
    expect(cantFightText(s.state, CAMP, 'rat1', 'weapon', 'attack')).toBe('You need a weapon to fight a rat. A stone club will do.');
    expect(fightLabel(CAMP, 'rat2')).toBe('Fight|Rat');
    expect(fightLabel(CAMP, 'dummy')).toBe('Practise on|Training dummy');
    expect(fightLabel(CAMP, 'wolf')).toBeNull();
    // a rat nobody here has does nothing
    send(s, { type: 'fight', target: 'rat9' });
    expect(s.state.player.pending).toBeNull();
  });

  it('a rat is a target with health that never stops teaching; the same OSRS rolls as at the dummy', () => {
    const s = ready(), t = targetOf(s.state, CAMP, 'rat2')!;
    expect(t).toMatchObject({ id: 'rat2', name: RAT.name, pos: s.state.rats.rat2!.pos, radius: RAT.radius, xp: RAT.xp, maxLevel: Infinity });
    expect(t.foe).toEqual({ kind: 'rat', health: RAT.health, maxHealth: RAT.health, down: false });
    expect(defenceRoll(t)).toBe(roll(RAT.defence + 9, RAT.defenceBonus));
    expect(targetOf(s.state, CAMP, 'dummy')!.foe).toBeUndefined();
    // a rat down is where its nest is: he waits by it
    s.state.rats.rat2!.downUntil = s.state.time + 10; s.state.rats.rat2!.health = 0;
    expect(targetOf(s.state, CAMP, 'rat2')).toMatchObject({ pos: NEST.pos, radius: NEST.radius, foe: { down: true, health: 0 } });
  });

  it("he walks up to the rat, which waits for him facing him, and strikes it on his weapon's timer; it bites back on its own", () => {
    const s = ready();
    s.state.player.backpack = { cooked_fish: 3 };
    send(s, { type: 'fight', target: 'rat2' });
    expect(s.state.player.pending).toEqual({ kind: 'fight', id: 'rat2' });
    const waits = { ...s.state.rats.rat2!.pos };
    runUntil(s, () => s.state.player.task.kind === 'fight', 30);
    expect(s.state.rats.rat2!.pos).toEqual(waits);                 // it stayed put for him
    expect(dist(s.state.player.pos, waits)).toBeCloseTo(REACH, 1);
    run(s, 0.5);
    const face = Math.atan2(-(s.state.player.pos.z - waits.z), s.state.player.pos.x - waits.x);
    expect(Math.abs(Math.atan2(Math.sin(s.state.rats.rat2!.heading - face), Math.cos(s.state.rats.rat2!.heading - face)))).toBeLessThan(0.01);
    // his first swing lands before its first bite
    runUntil(s, () => of(s, 'hit').length > 0 && of(s, 'bitten').length > 0, 10);
    expect(s.log.find(e => e.type === 'hit' || e.type === 'bitten')!.type).toBe('hit');
    // bites come every RAT.every seconds while he fights it: 0 or 1
    const from = s.log.length, t0 = s.state.time, xp0 = { ...s.state.skills }, health0 = s.state.rats.rat2!.health;
    runUntil(s, () => s.state.rats.rat2!.downUntil !== null, 120);
    const bites = of(s, 'bitten', from), struck = of(s, 'hit', from), took = struck.reduce((a, e) => a + e.damage, 0);
    expect(bites.length).toBeGreaterThanOrEqual(Math.floor((s.state.time - t0) / RAT.every) - 1);
    expect(bites.length).toBeLessThanOrEqual(Math.ceil((s.state.time - t0) / RAT.every) + 1);
    expect(bites.every(e => e.by === 'rat2' && (e.damage === 0 || e.damage === 1))).toBe(true);
    expect(struck.every(e => e.target === 'rat2' && e.damage >= 0 && e.damage <= maxHitOf(s.state))).toBe(true);
    // its health went down by what he did, never past 0, and XP came for each point: to the style, a third to Vitality
    expect(took).toBe(health0);
    expect(s.state.skills.attack - xp0.attack).toBeCloseTo(took * RAT.xp, 6);
    expect(s.state.skills.vitality - xp0.vitality).toBeCloseTo(took * RAT.xp * COMBAT.vitality, 6);
    expect(s.state.skills.strength).toBe(xp0.strength);
  });

  it('a beaten rat topples over, sometimes leaving a hide in his backpack, and comes back at its nest a minute later', () => {
    const s = ready();
    s.state.player.backpack = { cooked_fish: 5 };
    engage(s, 'rat3');
    runUntil(s, () => of(s, 'beaten').length > 0, 120);
    const [beat] = of(s, 'beaten'), r = s.state.rats.rat3!, down = s.state.time;
    expect(beat!.target).toBe('rat3');
    expect(r.health).toBe(0);
    expect(r.downUntil).toBeCloseTo(down + RAT.back, 5);
    expect(owned(s.state, 'rat_hide')).toBe(beat!.item ? 1 : 0);
    expect(s.state.player.backpack.rat_hide ?? 0).toBe(beat!.item ? 1 : 0);
    expect(targetOf(s.state, CAMP, 'rat3')!.foe!.down).toBe(true);
    runUntil(s, () => s.log.some(e => e.type === 'ratBack' && e.id === 'rat3'), RAT.back + 1);
    expect(s.state.time - down).toBeCloseTo(RAT.back, 0);
    expect(s.state.rats.rat3).toMatchObject({ health: RAT.health, downUntil: null, pos: ratSpot(CAMP, 'rat3')!.home });
  });

  it("then he goes on to the next rat that's up; with none up he waits by the nest; a rat back, he fights it: on and on", () => {
    const s = ready(3);
    s.state.built = s.state.built.filter(b => b !== 'shelter');   // (no shelter: he works through the night, not to bed)
    s.state.player.backpack = { cooked_fish: 20 };
    engage(s, 'rat1');
    runUntil(s, () => of(s, 'beaten').length > 0, 120);
    // a moment to see it topple, then on to the nearest rat up
    run(s, POTTER.moveOnAfter - 0.2);
    expect(s.state.player.task).toMatchObject({ kind: 'fight', target: 'rat1' });
    run(s, 0.4);
    expect(s.state.player.pending?.kind).toBe('fight');
    expect(['rat2', 'rat3']).toContain((s.state.player.pending as { id: string }).id);
    // all three down (the last two beaten a while ago, say): he waits by the nest, not striking
    for (const [i, id] of RATS.entries()) Object.assign(s.state.rats[id]!, { health: 0, downUntil: s.state.time + 15 + i * 5, to: null, bite: null });
    run(s, 8);
    const task = s.state.player.task, struckBefore = of(s, 'hit').length;
    expect(task.kind).toBe('fight');
    expect(targetOf(s.state, CAMP, (task as { target: string }).target)!.foe!.down).toBe(true);
    expect(dist(s.state.player.pos, NEST.pos)).toBeLessThan(NEST.roam + 2);
    run(s, 5);
    expect(of(s, 'hit').length).toBe(struckBefore);
    expect(s.state.player.task.kind).toBe('fight');
    // the first back: he goes and fights it
    runUntil(s, () => of(s, 'ratBack').length > 0, RAT.back + 1);
    const back = of(s, 'ratBack')[0]!.id;
    runUntil(s, () => s.state.player.task.kind === 'fight' && (s.state.player.task as { target: string }).target === back, 20);
    expect(dist(s.state.player.pos, s.state.rats[back]!.pos)).toBeLessThan(REACH + 0.4);
    // an idle activity: ten minutes later he is still at it, many rats beaten
    run(s, 600);
    expect(s.state.player.task.kind === 'fight' || s.state.player.pending?.kind === 'fight').toBe(true);
    expect(of(s, 'beaten').length).toBeGreaterThan(10);
  });

  it('about half the rats leave a hide; XP comes with no level limit', () => {
    const s = ready(5);
    s.state.player.backpack = { cooked_fish: 25 };
    s.state.skills.attack = XP_TABLE[DUMMY.maxLevel]!;              // past what the dummy teaches
    engage(s, 'rat2');
    run(s, 1800);
    const beaten = of(s, 'beaten');
    expect(beaten.length).toBeGreaterThan(30);
    const hides = beaten.filter(e => e.item === 'rat_hide').length;
    expect(hides / beaten.length).toBeGreaterThan(0.3);
    expect(hides / beaten.length).toBeLessThan(0.7);
    expect(owned(s.state, 'rat_hide')).toBe(hides);
    expect(of(s, 'cantFight')).toEqual([]);
    expect(s.state.skills.attack).toBeGreaterThan(XP_TABLE[DUMMY.maxLevel]!);
  });

  it('tapping the rat he fights changes nothing; tapping another goes to it; any other command stops it', () => {
    const s = ready();
    s.state.player.backpack = { cooked_fish: 3 };
    engage(s, 'rat1');
    run(s, 1);
    const task = { ...s.state.player.task };
    send(s, { type: 'fight', target: 'rat1' });
    expect(s.state.player.task).toEqual(task);
    send(s, { type: 'fight', target: 'rat3' });
    expect(s.state.player.pending).toEqual({ kind: 'fight', id: 'rat3' });
    runUntil(s, () => s.state.player.task.kind === 'fight', 30);
    send(s, { type: 'walk', to: { x: -6, z: 8 } });
    const from = s.log.length;
    run(s, 10);
    expect(of(s, 'hit', from)).toEqual([]);
    expect(of(s, 'bitten', from)).toEqual([]);
    expect(s.state.player.task.kind).toBe('idle');
    expect(RATS.every(id => s.state.rats[id]!.bite === null)).toBe(true);
  });

  it('the dummy still works as before, through the same targets: no bites, no hides', () => {
    const s = ready();
    s.state.player.pos = { x: 0.2, z: 1.2 };
    send(s, { type: 'fight', target: 'dummy' });
    runUntil(s, () => s.state.player.task.kind === 'fight', 30);
    run(s, 60);
    expect(of(s, 'hit').length).toBeGreaterThan(15);
    expect(of(s, 'hit').every(e => e.target === 'dummy')).toBe(true);
    expect(of(s, 'bitten')).toEqual([]);
    expect(of(s, 'beaten')).toEqual([]);
    expect(s.state.player.task.kind).toBe('fight');
  });
});

describe("a rat's bite, as in OSRS", () => {
  /** Many bites from a rat that never falls, with his Defence level `defence`, training `style`: how many came, and the
   *  share that hurt him. */
  const bitten = (style: 'attack' | 'defence', defence: number, wear: Partial<GameState['equipment']> = {}) => {
    const s = ready(11);
    s.state.built = s.state.built.filter(b => b !== 'shelter');   // (no shelter: he works through the night, not to bed)
    s.state.player.backpack = { cooked_fish: 28 };
    s.state.combatStyle = style;
    Object.assign(s.state.equipment, wear);
    s.state.skills.defence = XP_TABLE[defence]!; s.state.skills.vitality = XP_TABLE[60]!; s.state.health = maxHealth(s.state);
    engage(s, 'rat1');
    s.state.rats.rat1!.health = 1e9;                       // a rat that never falls, for many bites
    run(s, 1500);
    const bites = of(s, 'bitten');
    return { n: bites.length, landed: bites.filter(e => e.damage > 0).length / bites.length };
  };

  it('lands as often as its attack roll against his defence (his Defence level, the defensive style) says', () => {
    const a = bitten('attack', 3), chance = hitChance(roll(RAT.attack + 9, RAT.attackBonus), roll(effectiveLevel(3, false), 0));
    expect(a.n).toBeGreaterThan(400);
    expect(a.landed).toBeCloseTo(chance / 2, 1);             // a landed bite does 0 or 1, evenly
    const d = bitten('defence', 30);
    expect(d.landed).toBeLessThan(a.landed);
    expect(d.landed).toBeCloseTo(hitChance(roll(RAT.attack + 9, RAT.attackBonus), roll(effectiveLevel(30, true), 0)) / 2, 1);
  });

  it("the hide armour's defence counts as well: bites land less often", () => {
    const rat = roll(RAT.attack + 9, RAT.attackBonus), armour = { head: 'hide_cap', body: 'hide_vest', shield: 'hide_shield' } as const;
    const bonus = GEAR.hide_cap.defence! + GEAR.hide_vest.defence! + GEAR.hide_shield.defence!;
    const plain = hitChance(rat, roll(effectiveLevel(3, false), 0)) / 2, geared = hitChance(rat, roll(effectiveLevel(3, false), bonus)) / 2;
    expect(geared).toBeLessThan(plain - 0.03);
    const a = bitten('attack', 3), g = bitten('attack', 3, armour);
    expect(g.n).toBeGreaterThan(400);
    expect(g.landed).toBeCloseTo(geared, 1);
    expect(g.landed).toBeLessThan(a.landed);
  });
});

describe('food in a fight', () => {
  it('below 40% of his most he eats from his backpack, the food that heals most first, one at a time', () => {
    const s = ready();
    s.state.player.backpack = { berries: 3, cooked_fish: 2 };
    engage(s, 'rat2');
    s.state.rats.rat2!.health = 1e9;
    const most = maxHealth(s.state);
    s.state.health = Math.floor(most * FIGHT_FOOD.below);        // just below
    runUntil(s, () => of(s, 'ate').length > 0, 30);
    const [first] = of(s, 'ate');
    expect(first!.item).toBe('cooked_fish');
    expect(of(s, 'ate')).toHaveLength(1);
    expect(s.state.player.backpack.cooked_fish).toBe(1);
    // not again until he drops below it again; then the last fish, then berries
    runUntil(s, () => !s.state.player.backpack.cooked_fish && of(s, 'ate').length >= 2, 600);
    runUntil(s, () => (s.state.player.backpack.berries ?? 0) < 3, 900);
    const ate = of(s, 'ate').map(e => e.item);
    expect(ate.slice(0, 2)).toEqual(['cooked_fish', 'cooked_fish']);
    expect(ate[2]).toBe('berries');
    // each meal came right after a bite, never while above the line
    for (const [i, e] of s.log.entries()) if (e.type === 'ate') expect(s.log[i - 1]!.type).toBe('bitten');
  });

  it('setting off with no food on him but some in the chest, he takes up to 5 from the chest first, the best first', () => {
    const s = ready();
    s.state.bank = { berries: 6, cooked_fish: 3, birch_logs: 10 };
    s.state.player.backpack = { birch_logs: 4 };
    send(s, { type: 'fight', target: 'rat1' });
    expect(s.log.at(-1)).toEqual({ type: 'fetchFood' });
    expect(s.state.player.pending).toEqual({ kind: 'visit', id: 'chest' });
    expect(s.state.player.trip).toEqual({ fight: 'rat1' });
    runUntil(s, () => of(s, 'tookFood').length > 0, 60);
    expect(of(s, 'tookFood')[0]!.items).toEqual({ cooked_fish: 3, berries: 2 });
    expect(s.state.player.backpack).toEqual({ birch_logs: 4, cooked_fish: 3, berries: 2 });   // what he carried he keeps
    expect(s.state.bank).toEqual({ berries: 4, birch_logs: 10 });
    expect(of(s, 'banked')).toEqual([]);
    runUntil(s, () => s.state.player.task.kind === 'fight', 60);
    expect(s.state.player.task).toMatchObject({ kind: 'fight', target: 'rat1' });
    expect(s.state.player.trip).toBeNull();
  });

  it('with food on him, or none anywhere, he goes straight to the rats; a nearly full backpack takes what fits', () => {
    const s = ready();
    s.state.bank = { cooked_fish: 9 };
    s.state.player.backpack = { berries: 1 };
    send(s, { type: 'fight', target: 'rat1' });
    expect(s.state.player.pending).toEqual({ kind: 'fight', id: 'rat1' });
    expect(s.state.player.trip).toBeNull();
    const t = ready();
    send(t, { type: 'fight', target: 'rat1' });
    expect(t.state.player.pending).toEqual({ kind: 'fight', id: 'rat1' });
    expect(of(t, 'fetchFood')).toEqual([]);
    const u = ready();
    u.state.bank = { cooked_fish: 9 };
    u.state.player.backpack = { copper_ore: BACKPACK_SLOTS - 2 };
    send(u, { type: 'fight', target: 'rat3' });
    runUntil(u, () => of(u, 'tookFood').length > 0, 60);
    expect(u.state.player.backpack).toEqual({ copper_ore: BACKPACK_SLOTS - 2, cooked_fish: 2 });
    expect(u.state.bank).toEqual({ cooked_fish: 7 });
    // the chest not built yet: nothing to fetch, straight there
    const v = ready();
    v.state.built = ['campfire', 'woodpile', 'shelter', 'dummy'];
    v.state.bank = { cooked_fish: 9 };
    send(v, { type: 'fight', target: 'rat1' });
    expect(v.state.player.pending).toEqual({ kind: 'fight', id: 'rat1' });
  });

  it('a hide that fills his backpack sends him to the chest, where he empties it and takes food again, then back to the rats', () => {
    const s = ready(4);
    s.state.bank = { cooked_fish: 10 };
    s.state.player.backpack = { birch_logs: BACKPACK_SLOTS - 3, cooked_fish: 2 };
    engage(s, 'rat2');
    runUntil(s, () => of(s, 'backpackFull').length > 0, 900);
    expect(of(s, 'backpackFull')).toHaveLength(1);
    expect(s.state.player.trip).toMatchObject({ fight: expect.stringMatching(/^rat\d$/) });
    expect(s.state.player.pending).toEqual({ kind: 'visit', id: 'chest' });
    runUntil(s, () => of(s, 'banked').length > 0, 60);
    expect(s.state.bank.birch_logs).toBe(BACKPACK_SLOTS - 3);
    expect(s.state.bank.rat_hide).toBeGreaterThan(0);
    expect(of(s, 'tookFood')).toHaveLength(1);
    expect(s.state.player.backpack).toEqual({ cooked_fish: 5 });
    runUntil(s, () => s.state.player.task.kind === 'fight' && !s.state.player.trip, 60);
    const back = s.state.player.task as { target: string };
    expect(RATS).toContain(back.target);
    run(s, 20);
    expect(of(s, 'hit').filter(e => RATS.includes(e.target)).length).toBeGreaterThan(0);
  });

  it('a tap on the chest on his way there for food stores what he carries too; then he takes food and goes back', () => {
    const s = ready();
    s.state.bank = { cooked_fish: 6 };
    s.state.player.backpack = { copper_ore: 2, birch_logs: 3 };
    send(s, { type: 'fight', target: 'rat1' });
    run(s, 1);
    send(s, { type: 'visit', id: 'chest' });
    expect(s.state.player.trip).toEqual({ fight: 'rat1', store: true });
    expect(s.state.player.pending).toEqual({ kind: 'visit', id: 'chest' });
    runUntil(s, () => of(s, 'tookFood').length > 0, 60);
    expect(of(s, 'banked').map(e => e.items)).toEqual([{ copper_ore: 2, birch_logs: 3 }]);
    expect(s.state.player.backpack).toEqual({ cooked_fish: 5 });
    expect(s.state.bank).toEqual({ cooked_fish: 1, copper_ore: 2, birch_logs: 3 });
    runUntil(s, () => s.state.player.task.kind === 'fight', 60);
    expect(s.state.player.task).toMatchObject({ kind: 'fight', target: 'rat1' });
    expect(s.state.player.trip).toBeNull();
  });

  it('nightfall on his way to the chest for food: he takes the logs there but keeps what he carries, then fetches food', () => {
    const go = (tapChest: boolean) => {
      const s = ready();
      s.state.built = s.state.built.filter(b => b !== 'shelter');   // (no shelter: he works through the night, not to bed)
      s.state.woodpile = 0;                                   // the logs come from the chest
      s.state.bank = { birch_logs: 6, cooked_fish: 4 };
      s.state.player.backpack = { copper_ore: 2, rat_hide: 2 };
      s.state.time = clock(0, NIGHTFALL) - 1;
      send(s, { type: 'fight', target: 'rat1' });
      if (tapChest) send(s, { type: 'visit', id: 'chest' });
      runUntil(s, () => of(s, 'stokeOff').length > 0, 10);
      return s;
    };
    const s = go(false);
    expect(s.state.player.stoke).toMatchObject({ from: 'chest', empty: false, back: { fight: 'rat1' } });
    runUntil(s, () => of(s, 'stoked').length > 0, 120);
    expect(s.state.player.backpack).toEqual({ copper_ore: 2, rat_hide: 2 });
    runUntil(s, () => of(s, 'tookFood').length > 0, 120);
    expect(of(s, 'banked')).toEqual([]);
    expect(s.state.player.backpack).toEqual({ copper_ore: 2, rat_hide: 2, cooked_fish: 4 });
    runUntil(s, () => s.state.player.task.kind === 'fight', 60);
    expect(s.state.player.task).toMatchObject({ kind: 'fight', target: 'rat1' });
    // the chest tapped on the way, he stores what he carries there as he takes the logs
    const t = go(true);
    expect(t.state.player.stoke).toMatchObject({ from: 'chest', empty: true });
    runUntil(t, () => of(t, 'stoked').length > 0, 120);
    expect(of(t, 'banked').map(e => e.items)).toEqual([{ copper_ore: 2, rat_hide: 2 }]);
  });
});

describe("food running out, and a few meals kept (0.0.25, the owner's picks)", () => {
  it('out of food mid-fight with food in the chest, he walks back for more and returns to the same rat', () => {
    const s = ready();
    s.state.bank = { cooked_fish: 9 };
    s.state.player.backpack = { berries: 1 };
    engage(s, 'rat2');
    s.state.rats.rat2!.health = 1e9;                                  // a rat that never falls
    s.state.health = Math.floor(maxHealth(s.state) * FIGHT_FOOD.below);
    const from = s.log.length;
    runUntil(s, () => of(s, 'fetchFood', from).length > 0, 120);      // the berry eaten, then nothing left
    expect(of(s, 'ate', from).map(e => e.item)).toContain('berries');
    expect(s.state.player.trip).toEqual({ fight: 'rat2' });
    expect(s.state.player.pending).toEqual({ kind: 'visit', id: 'chest' });
    runUntil(s, () => of(s, 'tookFood', from).length > 0, 90);
    expect(s.state.player.backpack.cooked_fish).toBe(FIGHT_FOOD.take);
    runUntil(s, () => s.state.player.task.kind === 'fight', 90);
    expect((s.state.player.task as { target: string }).target).toBe('rat2');
    // with none in the chest he fights on (and a knock-out stays gentle)
    const t = ready();
    t.state.player.backpack = {};
    engage(t, 'rat1');
    t.state.rats.rat1!.health = 1e9;
    t.state.health = 2;
    run(t, 10);
    expect(of(t, 'fetchFood')).toHaveLength(0);
  });

  it('emptying the backpack into the chest keeps up to 5 food on him, the food that heals most first', () => {
    const s = ready();
    s.state.player.backpack = { copper_ore: 20, cooked_fish: 3, berries: 5 };
    send(s, { type: 'visit', id: 'chest' });
    runUntil(s, () => of(s, 'banked').length > 0, 90);
    expect(s.state.player.backpack).toEqual({ cooked_fish: 3, berries: 2 });
    expect(s.state.bank).toMatchObject({ copper_ore: 20, berries: 3 });
    expect(s.state.bank.cooked_fish ?? 0).toBe(0);
    // carrying a meal or two, the trip for food tops him up to 5
    const t = ready();
    t.state.bank = { cooked_fish: 9 };
    t.state.player.backpack = { copper_ore: BACKPACK_SLOTS - 2, berries: 2 };
    send(t, { type: 'fight', target: 'rat1' });
    runUntil(t, () => of(t, 'tookFood').length > 0, 120);
    expect(of(t, 'tookFood')[0]!.items).toEqual({ cooked_fish: 3 });
    expect(t.state.player.backpack).toEqual({ berries: 2, cooked_fish: 3 });
    expect(t.state.bank).toMatchObject({ copper_ore: BACKPACK_SLOTS - 2, cooked_fish: 6 });
  });
});

describe('knocked out', () => {
  it('at 0 health he slumps a moment, then wakes at the camp by the shelter with half his health, keeping everything', () => {
    const s = ready();
    s.state.player.backpack = { rat_hide: 2, birch_logs: 3 };
    s.state.skills.defence = 0;
    engage(s, 'rat1');
    s.state.health = 1;
    s.state.rats.rat1!.health = 1e9;
    runUntil(s, () => of(s, 'knockedOut').length > 0, 600);
    expect(of(s, 'knockedOut')).toEqual([{ type: 'knockedOut', by: 'rat1' }]);
    expect(s.state.health).toBe(0);
    expect(s.state.player.task).toMatchObject({ kind: 'knockedOut', by: 'rat1' });
    expect(s.state.rats.rat1!.health).toBe(RAT.health);              // the rat heals back
    const where = { ...s.state.player.pos }, out = s.state.time;
    // a short, gentle moment: nothing else in the meantime, and commands wait for him to wake
    send(s, { type: 'walk', to: { x: 0, z: 0 } });
    send(s, { type: 'fight', target: 'rat2' });
    run(s, KNOCKED_OUT.slump - 0.2);
    expect(s.state.player.pos).toEqual(where);
    expect(of(s, 'bitten').filter(e => s.log.indexOf(e) > s.log.findIndex(x => x.type === 'knockedOut'))).toEqual([]);
    runUntil(s, () => of(s, 'wokeUp').length > 0, 1);
    expect(s.state.time - out).toBeCloseTo(KNOCKED_OUT.slump, 1);
    expect(of(s, 'wokeUp')).toEqual([{ type: 'wokeUp', by: 'rat1' }]);
    // by the shelter, facing the fire, on open ground
    const tent = CAMP.camp!.tent, p = s.state.player;
    expect(dist(p.pos, tent.pos)).toBeLessThan(tent.radius + 1.2);
    expect(dist(p.pos, CAMP.hearth.pos)).toBeLessThan(dist(tent.pos, CAMP.hearth.pos));
    expect(navFor(CAMP, s.state.built).walkable(p.pos)).toBe(true);
    expect(p.task).toEqual({ kind: 'idle' });
    expect(p.pending).toBeNull();
    expect(s.state.health).toBe(Math.ceil(maxHealth(s.state) * KNOCKED_OUT.health));
    expect(p.backpack).toEqual({ rat_hide: 2, birch_logs: 3 });
    expect(s.state.equipment.weapon).toBe('stone_club');
    // the fight is over: he stays by the shelter
    run(s, 20);
    expect(dist(p.pos, tent.pos)).toBeLessThan(tent.radius + 1.2);
  });

  it('with no food anywhere he fights on, and in time a rat knocks him out; gently, and he can go back', () => {
    const s = ready(8);
    s.state.skills.defence = 0;
    engage(s, 'rat1');
    runUntil(s, () => of(s, 'wokeUp').length > 0, 3600);
    expect(of(s, 'knockedOut')).toHaveLength(1);
    expect(of(s, 'beaten').length).toBeGreaterThan(0);
    expect(of(s, 'ate')).toEqual([]);
    expect(s.state.player.task.kind).toBe('idle');
    send(s, { type: 'fight', target: 'rat2' });
    runUntil(s, () => s.state.player.task.kind === 'fight', 60);
    expect(s.state.player.task.kind).toBe('fight');
  });

  it('with no shelter he wakes beside the fire', () => {
    const s = ready();
    s.state.built = ['campfire', 'woodpile', 'chest'];
    const at = wakeSpot(s.state, CAMP);
    expect(dist(at.pos, CAMP.hearth.pos)).toBeLessThan(CAMP.hearth.radius + 1.6);
    expect(navFor(CAMP, s.state.built).walkable(at.pos)).toBe(true);
    s.state.built = [];
    expect(wakeSpot(s.state, CAMP).pos).toEqual(CAMP.start);
  });

  it('knocked out on his way back from the chest: no trip is left, and he wakes at camp', () => {
    const s = ready(2);
    s.state.bank = { berries: 1 };
    s.state.skills.defence = 0;
    send(s, { type: 'fight', target: 'rat2' });
    expect(s.state.player.trip).toEqual({ fight: 'rat2' });
    runUntil(s, () => of(s, 'tookFood').length > 0, 60);
    s.state.health = 1;
    s.state.rats.rat2!.health = 1e9;
    runUntil(s, () => of(s, 'knockedOut').length > 0, 900);
    expect(s.state.player.trip).toBeNull();
    runUntil(s, () => of(s, 'wokeUp').length > 0, 10);
    expect(s.state.player).toMatchObject({ trip: null, pending: null, task: { kind: 'idle' } });
    expect(of(s, 'ate').map(e => e.item)).toEqual(['berries']);
  });

  it('only a bite that hurts him knocks him out: one that does nothing never does, whatever his health says', () => {
    const s = ready();
    engage(s, 'rat1');
    s.state.rats.rat1!.health = 1e9;
    // just past a moment his health comes back, so it stays as set until the bite: 0, which can't come about in play,
    // nor from a save (0 only while he is knocked out)
    s.state.time = Math.ceil(s.state.time / HEALTH.regen) * HEALTH.regen + 0.5;
    s.state.health = 0;
    runUntil(s, () => of(s, 'bitten').length > 0, 10);
    expect(of(s, 'bitten')).toEqual([{ type: 'bitten', by: 'rat1', damage: 0 }]);
    expect(of(s, 'knockedOut')).toEqual([]);
    expect(s.state.player.task.kind).toBe('fight');
  });
});

describe('stoking the fire at nightfall in the middle of a fight', () => {
  it('he leaves the rats, stokes the fire, then goes back to them by himself', () => {
    const s = ready();
    s.state.built = s.state.built.filter(b => b !== 'shelter');   // (no shelter: he works through the night, not to bed)
    s.state.player.backpack = { cooked_fish: 4 };
    s.state.woodpile = 6;
    s.state.time = clock(0, NIGHTFALL) - 15;
    engage(s, 'rat1');
    runUntil(s, () => of(s, 'stokeOff').length > 0, 60);
    const back = s.state.player.stoke?.back as { fight: string };
    expect(RATS).toContain(back.fight);
    runUntil(s, () => of(s, 'stoked').length > 0, 120);
    runUntil(s, () => s.state.player.task.kind === 'fight', 60);
    const from = s.log.length;
    run(s, 15);
    expect(of(s, 'hit', from).length).toBeGreaterThan(2);
    expect(s.state.woodpile).toBe(6 - STOKE.logs);
  });

  it('knocked out at nightfall, he stokes the fire once he wakes', () => {
    const s = ready();
    s.state.woodpile = 6;
    s.state.time = clock(0, NIGHTFALL) - 0.5;
    s.state.player.task = { kind: 'knockedOut', wakeAt: s.state.time + 2, by: 'rat1' };
    s.state.health = 0;
    run(s, 1.5);
    expect(of(s, 'stokeOff')).toEqual([]);
    runUntil(s, () => of(s, 'stoked').length > 0, 60);
    expect(of(s, 'wokeUp')).toHaveLength(1);
    expect(s.log.findIndex(e => e.type === 'wokeUp')).toBeLessThan(s.log.findIndex(e => e.type === 'stokeOff'));
  });
});

describe('saving the rats', () => {
  it('a save made mid-fight reloads cleanly: the rats as they were, his task, and the fight goes on', () => {
    const s = ready();
    s.state.player.backpack = { cooked_fish: 3 };
    engage(s, 'rat2');
    run(s, 4.3);
    expect(s.state.rats.rat2!.health).toBeLessThanOrEqual(RAT.health);
    const back = deserialize(serialize(s.state), CAMP);
    expect(back).toEqual(s.state);
    const loaded = { ...setup(CAMP, 9), state: back };
    run(loaded, 6);
    expect(loaded.state.player.task).toMatchObject({ kind: 'fight' });
    expect(of(loaded, 'bitten').length).toBeGreaterThan(0);
    // and while the rats potter about, waiting, coming back or down, with him on his way or knocked out
    const w = ready();
    run(w, 37);
    expect(deserialize(serialize(w.state), CAMP)).toEqual(w.state);
    w.state.rats.rat1!.downUntil = w.state.time + 30; w.state.rats.rat1!.health = 0;
    w.state.player.task = { kind: 'knockedOut', wakeAt: w.state.time + 2, by: 'rat3' };
    w.state.health = 0;
    expect(deserialize(serialize(w.state), CAMP)).toEqual(w.state);
  });

  it('a rat that is down stays down until its time, and comes back after a reload', () => {
    const s = ready();
    s.state.rats.rat3!.downUntil = s.state.time + 20; s.state.rats.rat3!.health = 0; s.state.rats.rat3!.bite = null;
    const loaded = { ...setup(CAMP, 9), state: deserialize(serialize(s.state), CAMP) };
    run(loaded, 19);
    expect(loaded.state.rats.rat3!.downUntil).not.toBeNull();
    run(loaded, 2);
    expect(loaded.state.rats.rat3).toMatchObject({ health: RAT.health, downUntil: null });
  });

  it('damaged rats fall back sensibly: full health, home, staying put; a rat the layout lacks is dropped', () => {
    const s = ready();
    run(s, 20);
    const good = JSON.parse(serialize(s.state));
    const load = (edit: (raw: any) => void) => { const raw = structuredClone(good); edit(raw); return deserialize(JSON.stringify(raw), CAMP); };
    const home = (id: string) => ratSpot(CAMP, id)!.home;
    for (const bad of [null, 'lots', -3, 0, NaN, Infinity]) expect(load(r => { r.rats.rat1.health = bad; }).rats.rat1!.health, String(bad)).toBe(RAT.health);
    expect(load(r => { r.rats.rat1.health = 99; }).rats.rat1!.health).toBe(RAT.health);
    expect(load(r => { r.rats.rat1.health = 2; }).rats.rat1!.health).toBe(2);
    // down until a time: no health, and never later than a beating now would give
    expect(load(r => { r.rats.rat2.downUntil = r.time + 10; r.rats.rat2.health = 4; }).rats.rat2).toMatchObject({ downUntil: good.time + 10, health: 0, bite: null, to: null });
    expect(load(r => { r.rats.rat2.downUntil = 1e12; }).rats.rat2!.downUntil).toBe(good.time + RAT.back);
    expect(load(r => { r.rats.rat2.downUntil = 'soon'; }).rats.rat2!.downUntil).toBeNull();
    // somewhere it couldn't be: home, staying put
    for (const pos of [{ x: 0, z: 0 }, { x: NEST.pos.x, z: NEST.pos.z }, { x: -40, z: 13 }, null, { x: 'a', z: 2 }]) {
      const r = load(raw => { raw.rats.rat3.pos = pos; raw.rats.rat3.to = { x: -11, z: 12 }; }).rats.rat3!;
      expect(r.pos, JSON.stringify(pos)).toEqual(home('rat3'));
      expect(r.to).toBeNull();
    }
    expect(load(r => { r.rats.rat1.to = { x: 5, z: 5 }; }).rats.rat1!.to).toBeNull();
    for (const bad of [-1, RAT.every + 1, 'x', NaN]) expect(load(r => { r.rats.rat1.bite = bad; }).rats.rat1!.bite).toBeNull();
    expect(load(r => { r.rats.rat1.restUntil = 'later'; }).rats.rat1!.restUntil).toBeGreaterThan(good.time);
    expect(load(r => { r.rats.rat1.restUntil = 1e12; }).rats.rat1!.restUntil).toBeLessThan(good.time + 10);
    // a missing rat is a fresh one; one the layout lacks is dropped; junk is all fresh
    expect(load(r => { delete r.rats.rat2; }).rats.rat2).toMatchObject({ health: RAT.health, downUntil: null, pos: home('rat2') });
    expect(Object.keys(load(r => { r.rats.rat7 = r.rats.rat1; }).rats)).toEqual(RATS);
    for (const junk of [null, 'rats', [1, 2], 7]) expect(Object.keys(load(r => { r.rats = junk; }).rats)).toEqual(RATS);
  });

  it('a fight, a trip back to the rats or a knock-out that makes no sense stops cleanly', () => {
    const s = ready();
    s.state.player.backpack = { cooked_fish: 2 };
    engage(s, 'rat1');
    run(s, 1);
    const good = JSON.parse(serialize(s.state));
    const load = (edit: (raw: any) => void) => { const raw = structuredClone(good); edit(raw); return deserialize(JSON.stringify(raw), CAMP); };
    expect(load(() => {}).player.task.kind).toBe('fight');
    expect(load(r => { r.player.task.target = 'rat12'; }).player.task).toEqual({ kind: 'idle' });
    expect(load(r => { r.equipment.weapon = null; }).player.task).toEqual({ kind: 'idle' });
    // on the way to the chest to fetch food for the rats: kept with a weapon, dropped without
    const trip = (edit: (raw: any) => void) => load(r => {
      r.player.task = { kind: 'walk' }; r.player.pending = { kind: 'visit', id: 'chest' }; r.player.path = [{ x: 0.9, z: 6.4 }];
      r.player.trip = { fight: 'rat2' };
      edit(r);
    });
    expect(trip(() => {}).player.trip).toEqual({ fight: 'rat2' });
    expect(trip(r => { r.equipment.weapon = null; }).player.trip).toBeNull();
    expect(trip(r => { r.player.trip = { fight: 'dummy' }; }).player.trip).toBeNull();      // nothing to fetch food for
    // the chest tapped on the way (to store what he carries too): kept as true; anything else, or on a trip back to
    // work, is dropped
    expect(trip(r => { r.player.trip.store = true; }).player.trip).toEqual({ fight: 'rat2', store: true });
    for (const bad of ['yes', 1, null, false]) expect(trip(r => { r.player.trip.store = bad; }).player.trip, String(bad)).toEqual({ fight: 'rat2' });
    const node = CAMP.nodes[0]!.id;
    expect(trip(r => { r.player.trip = { nodeId: node, store: true }; }).player.trip).toEqual({ nodeId: node });
    // knocked out: kept with his health at 0; a broken time wakes him at once
    const out = load(r => { r.player.task = { kind: 'knockedOut', wakeAt: r.time + 1, by: 'rat1' }; r.health = 0; });
    expect(out.player.task).toMatchObject({ kind: 'knockedOut', by: 'rat1' });
    expect(out.health).toBe(0);
    const broken = load(r => { r.player.task = { kind: 'knockedOut', wakeAt: 'never', by: 'rat1' }; r.health = 0; });
    expect(broken.player.task).toEqual({ kind: 'knockedOut', wakeAt: good.time, by: 'rat1' });
    const w = { ...setup(), state: broken };
    run(w, 0.1);
    expect(of(w, 'wokeUp')).toHaveLength(1);
    expect(w.state.health).toBeGreaterThan(0);
    // a wake time far off (damaged or hand-edited) is no later than a knock-out now gives: he wakes, and can be sent off
    const late = load(r => { r.player.task = { kind: 'knockedOut', wakeAt: r.time + 1e9, by: 'rat1' }; r.health = 0; });
    expect(late.player.task).toEqual({ kind: 'knockedOut', wakeAt: good.time + KNOCKED_OUT.slump, by: 'rat1' });
    const l = { ...setup(), state: late };
    run(l, KNOCKED_OUT.slump + 0.1);
    expect(of(l, 'wokeUp')).toHaveLength(1);
    send(l, { type: 'walk', to: { x: -6, z: 8 } });
    expect(l.state.player.task.kind).toBe('walk');
    // not knocked out, a health of 0 is broken: full
    expect(load(r => { r.health = 0; }).health).toBe(maxHealth(load(() => {})));
    // knocked out somewhere he can't be: back at the start and up, so his health is full too, not 0
    const off = load(r => { r.player.task = { kind: 'knockedOut', wakeAt: r.time + 1, by: 'rat1' }; r.health = 0; r.player.pos = { x: 500, z: 500 }; });
    expect(off.player.pos).toEqual(CAMP.start);
    expect(off.player.task).toEqual({ kind: 'idle' });
    expect(off.health).toBe(maxHealth(off));
  });

  it('a 0.0.22 save (format 10, before the rats) loads with the rats at home, and the goal after the meal current', () => {
    const s = ready();
    s.state.goalsDone = GOALS.slice(0, at('meal') + 1).map(g => g.id);
    const raw = JSON.parse(serialize(s.state, Date.now()));
    delete raw.rats;
    raw.version = 10;                                          // as 0.0.22 to 0.0.24 wrote it
    expect(SAVE_VERSION).toBe(11);
    const back = readSave(JSON.stringify(raw), CAMP).state;
    expect(back.rats).toEqual(Object.fromEntries(ratsOf(CAMP).map(r => [r.id, expect.objectContaining({ health: RAT.health, downUntil: null, pos: r.home, to: null, bite: null })])));
    expect(currentGoal(back)).toBe(GOALS[at('meal') + 1]);
    const loaded = { ...setup(), state: back };
    loaded.state.player.backpack = { cooked_fish: 2 };
    engage(loaded, 'rat1');
    expect(loaded.state.player.task.kind).toBe('fight');
  });
});

describe('the village has no rats', () => {
  it('fighting a rat there does nothing, and rats or a rat fight in a village save are dropped', () => {
    const s = setup(VILLAGE);
    s.state.equipment.weapon = 'stone_club';
    send(s, { type: 'fight', target: 'rat1' });
    run(s, 3);
    expect(s.log).toEqual([]);
    expect(targetOf(s.state, VILLAGE, 'rat1')).toBeNull();
    const raw = JSON.parse(serialize(s.state));
    raw.rats = ready().state.rats;
    raw.player.task = { kind: 'fight', target: 'rat1', progress: 0.2 };
    raw.player.trip = { fight: 'rat1' };
    const back = deserialize(JSON.stringify(raw), VILLAGE);
    expect(back.rats).toEqual({});
    expect(back.player.task).toEqual({ kind: 'idle' });
    expect(back.player.trip).toBeNull();
  });
});

describe('away time while fighting the rats', () => {
  const NOW = 1_000_000;
  const reopen = (saved: string, seed = 21) => {
    const t = setup(CAMP, seed), state = readSave(saved, CAMP).state, log: GameEvent[] = [];
    t.events.on(e => log.push(e));
    const started = performance.now();
    const r = catchUpAway(state, NOW, NOW + 2 * 60 * 60 * 1000, { ...t.ctx, rng: createRng(99) });
    return { state, r, ms: performance.now() - started, log };
  };

  it('two hours closed (24 minutes of play) catch up the same every time, quickly; the note tells the rats and hides', () => {
    const s = ready();
    s.state.player.backpack = { cooked_fish: 20 };
    s.state.skills.vitality = XP_TABLE[10]!; s.state.health = maxHealth(s.state);
    engage(s, 'rat1');
    run(s, 3);
    const saved = serialize(s.state, NOW), a = reopen(saved), b = reopen(saved);
    expect(a.state).toEqual(b.state);
    expect(a.r.summary).toEqual(b.r.summary);
    expect(a.ms).toBeLessThan(1000);
    expect(a.r.away.game).toBeCloseTo(24 * 60, 0);
    const { beaten = 0, hides = 0 } = a.r.summary;
    expect(beaten).toBeGreaterThan(15);
    expect(hides).toBe(a.log.filter(e => e.type === 'beaten' && e.item).length);
    expect(a.r.summary.items.rat_hide).toBeUndefined();        // told as hides found, not as something gathered
    expect(a.r.summary.xp.attack).toBeGreaterThan(0);
    expect(awayText([a.r.away], a.r.summary).lines).toContain(`He beat ${beaten} rats and found ${hides} rat hides.`);
  });

  it('knocked out while away: he wakes at camp and stops, and the note says so', () => {
    const s = ready(6);
    s.state.skills.defence = 0;
    engage(s, 'rat2');
    s.state.health = 2;
    const a = reopen(serialize(s.state, NOW));
    expect(a.r.summary.knockedOut).toBe(1);
    expect(a.state.player.task).toEqual({ kind: 'idle' });
    expect(dist(a.state.player.pos, CAMP.camp!.tent.pos)).toBeLessThan(CAMP.camp!.tent.radius + 1.2);
    expect(awayText([a.r.away], a.r.summary).lines.at(-1)).toBe('Then a rat knocked him out, and he woke up back at camp.');
  });

  it('the note words rats, hides and knock-outs plainly, and adds them up across catch-ups', () => {
    const s = emptySummary();
    tally(s, { type: 'beaten', target: 'rat1', item: null });
    expect(awayText([], s).lines).toEqual(['He beat a rat.']);
    tally(s, { type: 'beaten', target: 'rat2', item: 'rat_hide' });
    expect(awayText([], s).lines).toEqual(['He beat 2 rats and found a rat hide.']);
    const into = emptySummary();
    addSummary(into, s); addSummary(into, s);
    tally(into, { type: 'knockedOut', by: 'rat1' }); tally(into, { type: 'knockedOut', by: 'rat3' });
    expect(awayText([], into).lines).toEqual(['He beat 4 rats and found 2 rat hides.', 'Rats knocked him out 2 times, and each time he woke up back at camp.']);
    // summaries without any compare as before
    expect('beaten' in emptySummary()).toBe(false);
  });
});

describe("the rats' goal", () => {
  it('comes after the cooked meal: a gathering goal for 5 rat hides, with a page in his book', () => {
    const goal = GOALS[at('rats')]!;
    expect(at('rats')).toBeGreaterThan(at('meal'));
    expect(goal).toMatchObject({ title: 'Rats in the woods', needs: { rat_hide: 5 } });
    expect(goal.makes).toBeUndefined();
    expect(goal.levels).toBeUndefined();
    expect(goal.page).toMatch(/rats/i);
    expect(goal.hint).toMatch(/rat/i);
    const s = ready();
    expect(currentGoal(s.state)).toBe(goal);
    expect(bookPages(s.state).at(-1)).toMatchObject({ goal: 'rats', current: true, done: false, text: goal.page });
  });

  it('fighting the rats finishes it in a few minutes, the hides carried or in the chest', () => {
    const s = ready(12);
    s.state.built = s.state.built.filter(b => b !== 'shelter');   // (no shelter: he works through the night, not to bed)
    s.state.player.backpack = { cooked_fish: 10 };
    engage(s, 'rat1');
    const took = runUntil(s, () => s.state.goalsDone.includes('rats'), 1800);
    expect(s.state.goalsDone).toContain('rats');
    expect(took / 60).toBeLessThan(10);
    expect(of(s, 'goalDone').map(e => e.goal)).toContain('rats');
    expect(goalFinished(s.state, GOALS[at('rats')]!)).toBe(true);
    // he fights on: hides for the hide armour that comes next
    run(s, 30);
    expect(s.state.player.task.kind === 'fight' || s.state.player.pending?.kind === 'fight').toBe(true);
    expect(backpackCount(s.state)).toBeLessThanOrEqual(BACKPACK_SLOTS);
  });
});
