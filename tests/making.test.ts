// Making things (game 0.0.15; data/making.ts, systems/making.ts): building the campfire at the camp's fire spot, the
// goals remembering they are finished (systems/goals.ts), saving it all, and the old saves' migration. Since 0.0.16
// the stone axe, made where he stands, then firewood chopped with it, and old saves that kept their axe.
import { describe, expect, it } from 'vitest';
import { createState, currentGoal, goalFinished, goalFirst, goalMet, made, owned, SAVE_VERSION } from '../src/core/state';
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
import { BUILD_REACH, MAKES, makeDef, type MakeDef } from '../src/data/making';
import type { PickupKind } from '../src/data/pickups';

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const FIRE = CAMP.hearth.pos;
const CAMPFIRE = MAKES.campfire, STONE_AXE = MAKES.stone_axe;
const goal = (id: string) => GOALS.find(g => g.id === id)!;
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

  it('has the stone axe: branches and stones, made where he stands in a few seconds, gives the axe', () => {
    expect(STONE_AXE).toMatchObject({ name: 'Stone axe', verb: 'Make', needs: { branch: 2, stone: 2 }, at: 'here', gives: { kind: 'tool', tool: 'axe' } });
    expect(STONE_AXE.time).toBeGreaterThan(1);
    expect(STONE_AXE.time).toBeLessThan(10);
    expect(STONE_AXE.done).toBe('You made a stone axe.');
  });

  it('the goals: salvage, the fire, the stone axe, firewood, then the shelter, which comes in a later update', () => {
    expect(GOALS.map(g => g.id)).toEqual(['salvage', 'campfire', 'stone_axe', 'firewood', 'shelter']);
    // every making goal that can be made asks for what its thing needs
    for (const g of GOALS) {
      if (!g.makes) continue;
      const def = (MAKES as Record<string, MakeDef>)[g.makes];
      if (def) expect(g.needs, g.id).toEqual(def.needs);
    }
    expect(goal('stone_axe')).toMatchObject({ title: 'A stone axe', needs: { branch: 2, stone: 2 }, makes: 'stone_axe' });
    expect(goal('firewood')).toMatchObject({ title: 'Firewood', needs: { birch_logs: 10 } });
    expect(goal('firewood').makes).toBeUndefined();
    expect(goal('firewood').hint).toMatch(/birch/);
    expect(goal('shelter')).toMatchObject({ title: 'A shelter', needs: { tarp: 1, plank: 4, birch_logs: 10 }, makes: 'shelter' });
    expect(makeDef('shelter')).toBeNull();
    expect(goal('shelter').ready).toMatch(/later update/);
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

/** A fresh camp game played through commands up to the stone axe: the wreck salvaged, the campfire built, then two
 *  branches and two stones picked up by hand. */
function readyForAxe(): Setup {
  const s = readyForFire();
  build(s);
  for (const p of ofKind('branch').slice(0, STONE_AXE.needs.branch!)) pickUp(s, p.id);
  // stones the fire didn't take: those are still to come back
  for (const p of ofKind('stone').slice(CAMPFIRE.needs.stone!, CAMPFIRE.needs.stone! + STONE_AXE.needs.stone!)) pickUp(s, p.id);
  return s;
}
/** Send him to make the stone axe and wait until it is made (or refused). */
function makeAxe(s: Setup): void {
  const from = s.log.length;
  send(s, { type: 'make', id: 'stone_axe' });
  runUntil(s, () => since(s, from).some(e => e.type === 'made' || e.type === 'missing' || e.type === 'goalFirst'), 30);
}
/** A camp game with the wreck salvaged and the fire built, carrying what the campfire left. */
function fireLit(): Setup {
  const s = setup();
  s.state.goalsDone = ['salvage', 'campfire']; s.state.built = ['campfire'];
  s.state.player.backpack = { plank: 4, tarp: 1 }; s.state.hasBook = true;
  return s;
}

describe('making the stone axe', () => {
  it('on a fresh camp game: made where he stands, then birches chopped for firewood, and the card moves on to the shelter', () => {
    const s = readyForAxe();
    expect(s.state.built).toEqual(['campfire']);
    expect(s.state.player.backpack).toEqual({ plank: 4, tarp: 1, branch: 2, stone: 2 });
    expect(currentGoal(s.state).id).toBe('stone_axe');
    expect(goalMet(s.state, currentGoal(s.state))).toBe(true);
    // without the axe a birch is refused
    send(s, { type: 'work', nodeId: 'camp_birch1' });
    expect(s.log.at(-1)).toEqual({ type: 'needTool', tool: 'axe', skill: 'woodcutting' });
    // he makes it right where he stands, a few seconds' work; nothing is used up until it is made
    const at = { ...s.state.player.pos }, from = s.log.length;
    send(s, { type: 'make', id: 'stone_axe' });
    runUntil(s, () => s.state.player.task.kind === 'make', 0.2);
    expect(s.state.player.task).toMatchObject({ kind: 'make', id: 'stone_axe' });
    const started = s.state.time;
    run(s, STONE_AXE.time - 0.3);
    expect(s.state.tools.axe).toBe(false);
    expect(owned(s.state, 'branch')).toBe(2);
    runUntil(s, () => s.state.tools.axe, 2);
    expect(s.state.time - started).toBeCloseTo(STONE_AXE.time, 1);
    expect(since(s, from)).toContainEqual({ type: 'made', make: 'stone_axe' });
    // he owns the axe, the branches and stones are gone, he never moved, nothing was built, the card is on firewood
    expect(s.state.tools).toEqual({ axe: true, pick: false });
    expect(s.state.player.backpack).toEqual({ plank: 4, tarp: 1 });
    expect(s.state.player.pos).toEqual(at);
    expect(s.state.player.task.kind).toBe('idle');
    expect(s.state.built).toEqual(['campfire']);
    run(s, 0.1);
    expect(s.state.goalsDone).toEqual(['salvage', 'campfire', 'stone_axe']);
    expect(currentGoal(s.state).id).toBe('firewood');
    // asked again, nothing happens: he has his axe
    const after = s.log.length;
    s.state.player.backpack = { plank: 4, tarp: 1, branch: 2, stone: 2 };
    send(s, { type: 'make', id: 'stone_axe' });
    run(s, STONE_AXE.time + 1);
    expect(since(s, after)).toEqual([]);
    expect(owned(s.state, 'branch')).toBe(2);
    s.state.player.backpack = { plank: 4, tarp: 1 };
    // tap a birch: he chops it, moving on to the next birch when one falls, until he has 10 logs
    send(s, { type: 'work', nodeId: 'camp_birch1' });
    runUntil(s, () => owned(s.state, 'birch_logs') >= 10, 900);
    expect(owned(s.state, 'birch_logs')).toBeGreaterThanOrEqual(10);
    expect(s.state.skills.woodcutting).toBeGreaterThan(0);
    run(s, 0.1);
    expect(s.state.goalsDone).toContain('firewood');
    expect(currentGoal(s.state).id).toBe('shelter');
    // he has all the shelter asks for, but it can't be built yet: the card waits on it
    send(s, { type: 'walk', to: { ...s.state.player.pos } });
    run(s, 1);
    expect(goalMet(s.state, currentGoal(s.state))).toBe(true);
    expect(goalFinished(s.state, goal('shelter'))).toBe(false);
    expect(currentGoal(s.state).id).toBe('shelter');
  });

  it('without everything it is refused, saying what is still missing, and he stays put', () => {
    const s = fireLit(), start = { ...s.state.player.pos };
    send(s, { type: 'make', id: 'stone_axe' });
    expect(s.log.at(-1)).toEqual({ type: 'missing', make: 'stone_axe', items: { branch: 2, stone: 2 } });
    s.state.player.backpack = { plank: 4, tarp: 1, branch: 3, stone: 1 };
    send(s, { type: 'make', id: 'stone_axe' });
    expect(s.log.at(-1)).toEqual({ type: 'missing', make: 'stone_axe', items: { stone: 1 } });
    expect(s.state.player.pending).toBeNull();
    run(s, STONE_AXE.time + 1);
    expect(s.state.player.task.kind).toBe('idle');
    expect(s.state.player.pos).toEqual(start);
    expect(s.state.tools.axe).toBe(false);
    expect(s.state.player.backpack).toEqual({ plank: 4, tarp: 1, branch: 3, stone: 1 });
    // with the last stone banked (a storage chest one day) it works, taking from the backpack first, then the bank
    s.state.bank = { stone: 1 };
    makeAxe(s);
    expect(s.state.tools.axe).toBe(true);
    expect(s.state.player.backpack).toEqual({ plank: 4, tarp: 1, branch: 1 });
    expect(s.state.bank).toEqual({});
  });

  it('waits for the campfire: with branches and stones but no fire yet, it is refused', () => {
    const s = setup();
    s.state.goalsDone = ['salvage'];
    s.state.player.backpack = { plank: 7, tarp: 1, branch: 2, stone: 2 }; s.state.hasBook = true;
    send(s, { type: 'make', id: 'stone_axe' });
    expect(s.log.at(-1)).toEqual({ type: 'goalFirst', make: 'stone_axe', goal: 'campfire' });
    run(s, STONE_AXE.time + 1);
    expect(s.state.tools.axe).toBe(false);
    expect(s.state.player.backpack).toEqual({ plank: 7, tarp: 1, branch: 2, stone: 2 });
  });

  it('a save made while he works on it carries on and finishes after a reload', () => {
    const s = fireLit();
    s.state.player.backpack = { plank: 4, tarp: 1, branch: 2, stone: 2 };
    send(s, { type: 'make', id: 'stone_axe' });
    run(s, 1);
    const back = deserialize(serialize(s.state), CAMP);
    expect(back.player.task).toEqual(s.state.player.task);
    const loaded = { ...setup(), state: back };
    run(loaded, STONE_AXE.time);
    expect(loaded.state.tools.axe).toBe(true);
    expect(loaded.state.player.backpack).toEqual({ plank: 4, tarp: 1 });
    // and once made, a save keeps it
    const again = deserialize(serialize(loaded.state), CAMP);
    expect(again.tools.axe).toBe(true);
    expect(currentGoal(again).id).toBe('firewood');
    // a save that owns the axe but says he is still making one (hand-edited) has him just standing
    const raw = JSON.parse(serialize(loaded.state)); raw.player.task = { kind: 'make', id: 'stone_axe', doneAt: 5 };
    expect(deserialize(JSON.stringify(raw), CAMP).player.task.kind).toBe('idle');
  });
});

describe('old saves that already have an axe', () => {
  it('a 0.0.11 camp save (format 4, before owned tools) keeps its axe, so the stone axe goal is done', () => {
    const s = setup();
    pickUp(s, 'book1');
    const { tools: _t, hasBook: _h, taken: _k, built: _b, goalsDone: _g, ...rest } = JSON.parse(serialize(s.state));
    const back = deserialize(JSON.stringify({ ...rest, version: 4 }), CAMP);
    expect(back.tools).toEqual({ axe: true, pick: true });
    expect(made(back, 'stone_axe')).toBe(true);
    expect(goalFinished(back, goal('stone_axe'))).toBe(true);
    expect(currentGoal(back).id).toBe('salvage');               // the goals before it still come first
    const loaded = { ...setup(), state: back };
    run(loaded, 0.1);
    expect(loaded.state.goalsDone).toContain('stone_axe');
    // once the wreck is salvaged and the fire built, the card skips the stone axe and goes to firewood
    loaded.state.goalsDone.push('salvage', 'campfire'); loaded.state.built = ['campfire'];
    expect(currentGoal(loaded.state).id).toBe('firewood');
    // asked to make one anyway, nothing happens and nothing is used up
    loaded.state.player.backpack = { branch: 2, stone: 2 };
    const from = loaded.log.length;
    send(loaded, { type: 'make', id: 'stone_axe' });
    run(loaded, STONE_AXE.time + 1);
    expect(since(loaded, from)).toEqual([]);
    expect(loaded.state.player.backpack).toEqual({ branch: 2, stone: 2 });
  });

  it('a 0.0.15 camp save that owns an axe has the stone axe goal done, and can chop for firewood at once', () => {
    const raw = JSON.parse(serialize(fireLit().state)); raw.tools = { axe: true, pick: true };
    const loaded = { ...setup(), state: deserialize(JSON.stringify(raw), CAMP) };
    expect(currentGoal(loaded.state).id).toBe('firewood');
    send(loaded, { type: 'work', nodeId: 'camp_birch2' });
    runUntil(loaded, () => owned(loaded.state, 'birch_logs') >= 10, 900);
    run(loaded, 0.1);
    expect(loaded.state.goalsDone).toEqual(['salvage', 'campfire', 'stone_axe', 'firewood']);
    expect(currentGoal(loaded.state).id).toBe('shelter');
  });
});

describe('the village is unchanged', () => {
  it('has no campfire or stone axe to make, the same walking grid and hearth, and no goals written down', () => {
    expect(navFor(VILLAGE, [])).toBe(navFor(VILLAGE));
    expect(navFor(VILLAGE).walkable(VILLAGE.hearth.pos)).toBe(false);
    const s = setup(VILLAGE);
    s.state.player.backpack = { plank: 7, stone: 4, tarp: 1 }; s.state.hasBook = true;
    send(s, { type: 'make', id: 'campfire' });
    // he has the village's iron axe already, so a stone axe isn't made either
    s.state.player.backpack.branch = 2;
    send(s, { type: 'make', id: 'stone_axe' });
    expect(s.log).toEqual([]);
    expect(s.state.player.task.kind).toBe('idle');
    run(s, 5);
    expect(s.state.built).toEqual([]);
    expect(s.state.goalsDone).toEqual([]);
    expect(s.state.tools).toEqual({ axe: true, pick: true });
    expect(s.state.player.backpack).toEqual({ plank: 7, stone: 4, tarp: 1, branch: 2 });
  });
});
