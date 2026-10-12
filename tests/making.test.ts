// Making things (game 0.0.15; data/making.ts, systems/making.ts): building the campfire at the camp's fire spot, the
// goals remembering they are finished (systems/goals.ts), saving it all, and the old saves' migration.
import { describe, expect, it } from 'vitest';
import { createState, currentGoal, goalFirst, goalMet, made, owned, SAVE_VERSION } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { deserialize, serialize } from '../src/core/save';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, siteOf, type Layout, type Vec2 } from '../src/world/layout';
import { navFor } from '../src/world/nav';
import { applyCommands, type Command } from '../src/systems/commands';
import { GOALS } from '../src/data/goals';
import { BUILD_REACH, MAKES, type MakeDef, type MakeId } from '../src/data/making';
import type { PickupKind } from '../src/data/pickups';

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const FIRE = CAMP.hearth.pos;
const CAMPFIRE = MAKES.campfire;
const ofKind = (kind: PickupKind) => CAMP.pickups!.filter(p => p.kind === kind);

function setup(layout: Layout = CAMP, seed = 3) {
  const state = createState(layout, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, layout, ctx: { layout, rng: createRng(seed), events } };
}
type Setup = ReturnType<typeof setup>;
/** A fresh camp game with the wreck already salvaged, so the campfire may be built (it waits for the wreck). */
function salvaged(): Setup { const s = setup(); s.state.goalsDone = ['salvage']; return s; }
const send = (s: Setup, c: Command) => applyCommands(s.state, s.layout, [c], s.events);
const runUntil = (s: Setup, done: () => boolean, max: number) => { for (let t = 0; t < max && !done(); t += STEP) step(s.state, STEP, s.ctx); };
const run = (s: Setup, seconds: number) => runUntil(s, () => false, seconds);
const since = (s: Setup, from: number) => s.log.slice(from);
/** Tap a pickup and let him gather until he stops by himself. */
function gather(s: Setup, id: string, max = 600): void {
  const from = s.log.length;
  send(s, { type: 'pickup', id });
  runUntil(s, () => since(s, from).some(e => e.type === 'allGathered' || e.type === 'noStorage' || e.type === 'noRoom'), max);
}
/** Tap a pickup, wait until it is in his backpack, then tap the grass where he stands so he goes no further. */
function pickUp(s: Setup, id: string): void {
  const from = s.log.length;
  send(s, { type: 'pickup', id });
  runUntil(s, () => since(s, from).some(e => e.type === 'pickedUp' && e.id === id), 60);
  send(s, { type: 'walk', to: { ...s.state.player.pos } });
  runUntil(s, () => s.state.player.task.kind === 'idle', 5);
}
/** A fresh camp game played through commands up to having everything for the fire: the wreck salvaged (tap a plank,
 *  then the tarp and the book), then four stones picked up by hand. */
function readyForFire(): Setup {
  const s = setup();
  gather(s, ofKind('plank')[0]!.id);
  pickUp(s, 'tarp1'); pickUp(s, 'book1');
  for (const p of ofKind('stone').slice(0, CAMPFIRE.needs.stone!)) pickUp(s, p.id);
  return s;
}
/** Send him to build the campfire and wait until it is made (or a minute passes). */
function build(s: Setup): void {
  const from = s.log.length;
  send(s, { type: 'make', id: 'campfire' });
  runUntil(s, () => since(s, from).some(e => e.type === 'made' || e.type === 'missing'), 60);
}

describe('the things to make (data/making.ts)', () => {
  it('has the campfire: planks and stones, built at the camp fire spot, a structure', () => {
    expect(CAMPFIRE).toMatchObject({ name: 'Campfire', verb: 'Build', needs: { plank: 3, stone: 4 }, at: 'hearth', gives: { kind: 'structure' } });
    expect(CAMPFIRE.time).toBeGreaterThan(1);
    expect(CAMPFIRE.time).toBeLessThan(10);
    expect(siteOf(CAMP, 'hearth')).toEqual(CAMP.hearth);
    expect(siteOf(VILLAGE, 'hearth')).toBeNull();               // the village's hearth already has its big Hearth
  });

  it('every making goal that can be made asks for what its thing needs; the stone axe comes next update', () => {
    for (const g of GOALS) {
      if (!g.makes) continue;
      const def = (MAKES as Record<string, MakeDef>)[g.makes];
      if (def) expect(g.needs, g.id).toEqual(def.needs);
    }
    const axe = GOALS.find(g => g.id === 'stone_axe')!;
    expect(GOALS.at(-1)).toBe(axe);
    expect(axe).toMatchObject({ title: 'A stone axe', needs: { branch: 2, stone: 2 }, makes: 'stone_axe' });
    expect(axe.ready).toMatch(/next update/);
    expect(GOALS.map(g => g.id)).toEqual(['salvage', 'campfire', 'stone_axe']);
  });
});

describe('building the campfire', () => {
  it('on a fresh camp game: salvage, stones, build; the fire stands, the materials are gone, salvage stays done', () => {
    const s = readyForFire();
    expect(owned(s.state, 'plank')).toBe(7);
    expect(owned(s.state, 'stone')).toBe(4);
    expect(s.state.goalsDone).toEqual(['salvage']);
    expect(currentGoal(s.state).id).toBe('campfire');
    expect(goalMet(s.state, currentGoal(s.state))).toBe(true);
    const from = s.log.length;
    send(s, { type: 'make', id: 'campfire' });
    expect(s.state.player.pending).toEqual({ kind: 'make', id: 'campfire' });
    // he walks over and works beside the spot a few seconds; nothing is used up until it is made
    runUntil(s, () => s.state.player.task.kind === 'make', 30);
    const started = s.state.time, at = { ...s.state.player.pos };
    expect(dist(at, FIRE)).toBeCloseTo(CAMP.hearth.radius + BUILD_REACH, 1);
    run(s, CAMPFIRE.time - 0.3);
    expect(s.state.player.task.kind).toBe('make');
    expect(s.state.built).toEqual([]);
    expect(owned(s.state, 'plank')).toBe(7);
    runUntil(s, () => s.state.built.length > 0, 5);
    expect(s.state.time - started).toBeCloseTo(CAMPFIRE.time, 1);
    expect(since(s, from)).toContainEqual({ type: 'made', make: 'campfire' });
    // the campfire stands; its planks and stones are gone; he didn't move while he worked
    expect(s.state.built).toEqual(['campfire']);
    expect(made(s.state, 'campfire')).toBe(true);
    expect(s.state.player.backpack).toEqual({ plank: 4, tarp: 1 });
    expect(s.state.player.task.kind).toBe('idle');
    expect(s.state.player.pos).toEqual(at);
    // salvage is still done though he has only 4 planks now, the fire is done, and the card is on the stone axe
    run(s, 0.1);
    expect(goalMet(s.state, GOALS[0]!)).toBe(false);
    expect(s.state.goalsDone).toEqual(['salvage', 'campfire']);
    expect(currentGoal(s.state).id).toBe('stone_axe');
    // asked again, nothing happens: there is one campfire
    const after = s.log.length;
    send(s, { type: 'make', id: 'campfire' });
    run(s, 5);
    expect(since(s, after)).toEqual([]);
    expect(s.state.built).toEqual(['campfire']);
  });

  it('without everything it is refused, saying what is still missing, and he stays put', () => {
    const s = salvaged(), start = { ...s.state.player.pos };
    send(s, { type: 'make', id: 'campfire' });
    expect(s.log.at(-1)).toEqual({ type: 'missing', make: 'campfire', items: { plank: 3, stone: 4 } });
    expect(s.state.player.task.kind).toBe('idle');
    expect(s.state.player.pending).toBeNull();
    s.state.player.backpack = { plank: 7, stone: 2 };
    send(s, { type: 'make', id: 'campfire' });
    expect(s.log.at(-1)).toEqual({ type: 'missing', make: 'campfire', items: { stone: 2 } });
    run(s, 3);
    expect(s.state.player.pos).toEqual(start);
    expect(s.state.built).toEqual([]);
    expect(s.state.player.backpack).toEqual({ plank: 7, stone: 2 });
  });

  it('waits for the wreck: with the planks and stones but not the tarp and book, it is refused until salvage is done', () => {
    // a fresh camp game: every plank (tap one) and four stones, but the tarp and the book left lying
    const s = setup(), start = () => ({ ...s.state.player.pos });
    gather(s, ofKind('plank')[0]!.id);
    for (const p of ofKind('stone').slice(0, CAMPFIRE.needs.stone!)) pickUp(s, p.id);
    expect(s.state.player.backpack).toEqual({ plank: 7, stone: 4 });
    expect(currentGoal(s.state).id).toBe('salvage');
    expect(goalFirst(s.state, 'campfire')?.id).toBe('salvage');
    // asked to build (the Build button, or a tap on the fire spot): refused, saying salvage comes first; he stays put
    const at = start();
    send(s, { type: 'make', id: 'campfire' });
    expect(s.log.at(-1)).toEqual({ type: 'goalFirst', make: 'campfire', goal: 'salvage' });
    expect(s.state.player.pending).toBeNull();
    expect(s.state.player.task.kind).toBe('idle');
    run(s, CAMPFIRE.time + 1);
    expect(s.state.player.pos).toEqual(at);
    expect(s.state.built).toEqual([]);
    expect(s.state.player.backpack).toEqual({ plank: 7, stone: 4 });
    expect(s.state.goalsDone).toEqual([]);
    expect(currentGoal(s.state).id).toBe('salvage');
    // the tarp alone isn't enough: the book is still missing
    pickUp(s, 'tarp1');
    send(s, { type: 'make', id: 'campfire' });
    expect(s.log.at(-1)).toEqual({ type: 'goalFirst', make: 'campfire', goal: 'salvage' });
    expect(s.state.built).toEqual([]);
    // with the book too the wreck is salvaged, the card moves on to the fire, and building it works
    pickUp(s, 'book1');
    run(s, 0.1);
    expect(s.state.goalsDone).toEqual(['salvage']);
    expect(currentGoal(s.state).id).toBe('campfire');
    expect(goalFirst(s.state, 'campfire')).toBeNull();
    build(s);
    run(s, 0.1);
    expect(s.state.built).toEqual(['campfire']);
    expect(s.state.player.backpack).toEqual({ plank: 4, tarp: 1 });
    expect(s.state.goalsDone).toEqual(['salvage', 'campfire']);
    expect(currentGoal(s.state).id).toBe('stone_axe');
  });

  it('if something goes missing while he works, he stops, says what, and nothing is used up', () => {
    const s = salvaged();
    s.state.player.backpack = { plank: 3, stone: 4 };
    send(s, { type: 'make', id: 'campfire' });
    runUntil(s, () => s.state.player.task.kind === 'make', 30);
    s.state.player.backpack = { plank: 3, stone: 3 };           // (a hand-edited save, or a stone dropped one day)
    const from = s.log.length;
    run(s, CAMPFIRE.time + 0.5);
    expect(since(s, from)).toContainEqual({ type: 'missing', make: 'campfire', items: { stone: 1 } });
    expect(s.state.built).toEqual([]);
    expect(s.state.player.backpack).toEqual({ plank: 3, stone: 3 });
    expect(s.state.player.task.kind).toBe('idle');
  });

  it('takes from the backpack first, then the bank', () => {
    const s = salvaged();
    s.state.player.backpack = { plank: 1, stone: 4, branch: 2 };
    s.state.bank = { plank: 5, tarp: 1 };
    build(s);
    expect(s.state.built).toEqual(['campfire']);
    expect(s.state.player.backpack).toEqual({ branch: 2 });
    expect(s.state.bank).toEqual({ plank: 3, tarp: 1 });
  });

  it('another command while he walks there or works stops it; the fire is only made when he finishes', () => {
    const s = salvaged();
    s.state.player.backpack = { plank: 3, stone: 4 };
    send(s, { type: 'make', id: 'campfire' });
    runUntil(s, () => s.state.player.task.kind === 'make', 30);
    run(s, 1);
    send(s, { type: 'walk', to: { x: -4, z: -2 } });
    run(s, CAMPFIRE.time + 1);
    expect(s.state.built).toEqual([]);
    expect(s.state.player.backpack).toEqual({ plank: 3, stone: 4 });
    // tapping the spot again starts over and finishes
    build(s);
    expect(s.state.built).toEqual(['campfire']);
  });

  it('once built, the fire spot blocks walking like the village hearth, and he walks round it', () => {
    expect(navFor(CAMP).walkable(FIRE)).toBe(true);
    const nav = navFor(CAMP, ['campfire']);
    expect(nav.walkable(FIRE)).toBe(false);
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const r = CAMP.hearth.radius * 0.9;
      expect(nav.walkable({ x: FIRE.x + Math.cos(a) * r, z: FIRE.z + Math.sin(a) * r })).toBe(false);
    }
    const s = salvaged();
    s.state.player.backpack = { plank: 3, stone: 4 };
    build(s);
    expect(nav.walkable(s.state.player.pos)).toBe(true);        // where he stood to build it is still open ground
    // sent across the spot, his path goes round the fire, never through it
    s.state.player.pos = { x: FIRE.x - 3, z: FIRE.z };
    send(s, { type: 'walk', to: { x: FIRE.x + 3, z: FIRE.z } });
    let closest = Infinity;
    for (let t = 0; t < 20 && s.state.player.task.kind === 'walk'; t += STEP) { step(s.state, STEP, s.ctx); closest = Math.min(closest, dist(s.state.player.pos, FIRE)); }
    expect(dist(s.state.player.pos, { x: FIRE.x + 3, z: FIRE.z })).toBeLessThan(0.1);
    expect(closest).toBeGreaterThan(CAMP.hearth.radius);
    // tapped right on the fire, he walks to the open ground beside it
    send(s, { type: 'walk', to: FIRE });
    runUntil(s, () => s.state.player.task.kind === 'idle', 20);
    expect(dist(s.state.player.pos, FIRE)).toBeGreaterThan(CAMP.hearth.radius);
    expect(dist(s.state.player.pos, FIRE)).toBeLessThan(2);
  });
});

describe('saving the campfire and the goals', () => {
  it('a save and reload keeps the fire lit and the goals done', () => {
    const s = readyForFire();
    build(s);
    run(s, 0.1);
    const back = deserialize(serialize(s.state), CAMP);
    expect(back).toEqual(s.state);
    expect(back.built).toEqual(['campfire']);
    expect(back.goalsDone).toEqual(['salvage', 'campfire']);
    expect(currentGoal(back).id).toBe('stone_axe');
    const loaded = { ...setup(), state: back };
    send(loaded, { type: 'walk', to: FIRE });
    runUntil(loaded, () => loaded.state.player.task.kind === 'idle', 20);
    expect(dist(loaded.state.player.pos, FIRE)).toBeGreaterThan(CAMP.hearth.radius);
  });

  it('a save made while he builds carries on and finishes after a reload', () => {
    const s = salvaged();
    s.state.player.backpack = { plank: 3, stone: 4 };
    send(s, { type: 'make', id: 'campfire' });
    runUntil(s, () => s.state.player.task.kind === 'make', 30);
    run(s, 1);
    const back = deserialize(serialize(s.state), CAMP);
    expect(back.player.task).toEqual(s.state.player.task);
    const loaded = { ...setup(), state: back };
    run(loaded, CAMPFIRE.time);
    expect(loaded.state.built).toEqual(['campfire']);
    // and one sent on the way there still goes
    const w = salvaged();
    w.state.player.backpack = { plank: 3, stone: 4 };
    send(w, { type: 'make', id: 'campfire' });
    run(w, 0.5);
    const walking = { ...setup(), state: deserialize(serialize(w.state), CAMP) };
    expect(walking.state.player.pending).toEqual({ kind: 'make', id: 'campfire' });
    build(walking);
    expect(walking.state.built).toEqual(['campfire']);
  });

  it('repairs damaged built things, goals and a make under way', () => {
    const raw = JSON.parse(serialize(createState(CAMP, 4)));
    raw.built = ['campfire', 'campfire', 'castle', 7];
    raw.goalsDone = ['salvage', 'salvage', 'world_peace', null];
    raw.player.task = { kind: 'make', id: 'campfire', doneAt: 10 };     // the fire already stands
    const back = deserialize(JSON.stringify(raw), CAMP);
    expect(back.built).toEqual(['campfire']);
    expect(back.goalsDone).toEqual(['salvage']);
    expect(back.player.task.kind).toBe('idle');
    for (const bad of [null, 'junk', { campfire: true }]) {
      const b = JSON.parse(serialize(createState(CAMP, 4))); b.built = bad; b.goalsDone = bad;
      b.player.task = { kind: 'make', id: 'tower', doneAt: 5 };
      const st = deserialize(JSON.stringify(b), CAMP);
      expect(st.built).toEqual([]);
      expect(st.goalsDone).toEqual([]);
      expect(st.player.task.kind).toBe('idle');
    }
    // the village has nowhere to build a campfire, so a campfire in a village save is dropped
    const v = JSON.parse(serialize(createState(VILLAGE, 2))); v.built = ['campfire'];
    expect(deserialize(JSON.stringify(v), VILLAGE).built).toEqual([]);
  });

  it('a version 5 save that already salvaged the wreck counts it done, and building the fire keeps it done', () => {
    expect(SAVE_VERSION).toBe(6);
    const s = readyForFire();
    const { built: _b, goalsDone: _g, ...rest } = JSON.parse(serialize(s.state));
    const v5 = { ...rest, version: 5 };
    const back = deserialize(JSON.stringify(v5), CAMP);
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.goalsDone).toEqual(['salvage']);
    expect(back.built).toEqual([]);
    expect(back.player.backpack).toEqual(s.state.player.backpack);
    const loaded = { ...setup(), state: back };
    build(loaded);
    run(loaded, 0.1);
    expect(loaded.state.built).toEqual(['campfire']);
    expect(loaded.state.goalsDone).toEqual(['salvage', 'campfire']);
    expect(currentGoal(loaded.state).id).toBe('stone_axe');
    // with the planks banked (an old village save) it counts too
    const banked = { ...v5, player: { ...v5.player, backpack: {} }, bank: { plank: 9, tarp: 1 } };
    expect(deserialize(JSON.stringify(banked), CAMP).goalsDone).toEqual(['salvage']);
  });

  it('a version 5 save part way through the wreck has no goal done, and nothing built', () => {
    const s = setup();
    pickUp(s, 'book1'); pickUp(s, 'tarp1');
    const { built: _b, goalsDone: _g, ...rest } = JSON.parse(serialize(s.state));
    const back = deserialize(JSON.stringify({ ...rest, version: 5 }), CAMP);
    expect(back.goalsDone).toEqual([]);
    expect(back.built).toEqual([]);
    expect(currentGoal(back).id).toBe('salvage');
    // a damaged backpack or book doesn't count
    const bad = { ...rest, version: 5, hasBook: 'yes', player: { ...rest.player, backpack: { plank: '7', tarp: 1 } } };
    expect(deserialize(JSON.stringify(bad), CAMP).goalsDone).toEqual([]);
  });
});

describe('the stone axe goal and what comes next', () => {
  it('with everything for the stone axe the card waits on it: it can\'t be made until the next update', () => {
    const s = setup();
    s.state.goalsDone = ['salvage', 'campfire'];
    s.state.built = ['campfire'];
    s.state.player.backpack = { branch: 2, stone: 2 };
    run(s, 1);
    expect(currentGoal(s.state).id).toBe('stone_axe');
    expect(goalMet(s.state, currentGoal(s.state))).toBe(true);
    expect(s.state.goalsDone).toEqual(['salvage', 'campfire']);
    expect(made(s.state, 'stone_axe')).toBe(false);
  });

  it('something made where he stands, giving a tool, works the same way (the stone axe next update)', () => {
    const table = MAKES as Record<string, MakeDef>;
    table.test_tool = { id: 'test_tool' as MakeId, name: 'Test axe', verb: 'Make', needs: { branch: 2, stone: 2 }, at: 'here', time: 2,
      gives: { kind: 'tool', tool: 'axe' }, done: 'Made.' };
    try {
      const s = setup(), start = { ...s.state.player.pos };
      s.state.player.backpack = { branch: 3, stone: 2 };
      send(s, { type: 'make', id: 'test_tool' as MakeId });
      run(s, 0.1);
      expect(s.state.player.task).toMatchObject({ kind: 'make', id: 'test_tool' });
      run(s, 2.1);
      expect(s.state.tools.axe).toBe(true);
      expect(made(s.state, 'test_tool')).toBe(true);
      expect(s.state.player.backpack).toEqual({ branch: 1 });
      expect(s.state.player.pos).toEqual(start);
      expect(s.state.built).toEqual([]);
      expect(s.log).toContainEqual({ type: 'made', make: 'test_tool' });
    } finally { delete table.test_tool; }
  });
});

describe('the village is unchanged', () => {
  it('has no campfire to build, the same walking grid and hearth, and no goals written down', () => {
    expect(navFor(VILLAGE, [])).toBe(navFor(VILLAGE));
    expect(navFor(VILLAGE).walkable(VILLAGE.hearth.pos)).toBe(false);
    const s = setup(VILLAGE);
    s.state.player.backpack = { plank: 7, stone: 4, tarp: 1 }; s.state.hasBook = true;
    send(s, { type: 'make', id: 'campfire' });
    expect(s.log).toEqual([]);
    expect(s.state.player.task.kind).toBe('idle');
    run(s, 5);
    expect(s.state.built).toEqual([]);
    expect(s.state.goalsDone).toEqual([]);
    expect(s.state.player.backpack).toEqual({ plank: 7, stone: 4, tarp: 1 });
  });
});
