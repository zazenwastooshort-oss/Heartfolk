// Making things (game 0.0.15; data/making.ts, systems/making.ts): building the campfire at the camp's fire spot, the
// goals remembering they are finished (systems/goals.ts), saving it all, and the old saves' migration. Since 0.0.16
// the stone axe, made where he stands, then firewood chopped with it, and old saves that kept their axe. Since 0.0.18
// the shelter built at the tent spot, the stone pickaxe, copper ore mined with it, the storage chest waiting for the
// next update, and old saves that kept their pick.
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
import { onGround } from '../src/systems/pickups';

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const FIRE = CAMP.hearth.pos;
const CAMPFIRE = MAKES.campfire, STONE_AXE = MAKES.stone_axe, SHELTER = MAKES.shelter, STONE_PICK = MAKES.stone_pickaxe;
const TENT = CAMP.camp!.tent.pos;
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

  it('the goals: salvage, the fire, the stone axe, firewood, the shelter, the stone pickaxe, copper, then the chest, which comes in the next update', () => {
    expect(GOALS.map(g => g.id)).toEqual(['salvage', 'campfire', 'stone_axe', 'firewood', 'shelter', 'stone_pickaxe', 'copper', 'chest']);
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
    expect(goal('stone_pickaxe')).toMatchObject({ title: 'A stone pickaxe', needs: { branch: 2, stone: 3 }, makes: 'stone_pickaxe' });
    expect(goal('copper')).toMatchObject({ title: 'Copper ore', needs: { copper_ore: 3 } });
    expect(goal('copper').makes).toBeUndefined();
    expect(goal('copper').hint).toMatch(/orange lumps/);           // as the copper rocks look (render/nodes.ts)
    // the chest is a making goal whose thing comes in the next update: the card waits on its ready text
    expect(goal('chest')).toMatchObject({ title: 'A storage chest', needs: { birch_logs: 10, copper_ore: 3 }, makes: 'chest' });
    expect(makeDef('chest')).toBeNull();
    expect(goal('chest').ready).toMatch(/next update/);
    // he keeps mining after the copper goal until his backpack is full, so the hint says to make room for the logs
    expect(goal('chest').hint).toMatch(/If your backpack is full, open it and drop some spare ore/);
    // every other making goal can be made now
    expect(GOALS.filter(g => g.makes && !makeDef(g.makes)).map(g => g.id)).toEqual(['chest']);
  });

  it('has the shelter: the tarp, planks and logs, built at the camp tent spot in a few seconds, a structure', () => {
    expect(SHELTER).toMatchObject({ name: 'Shelter', verb: 'Build', needs: { tarp: 1, plank: 4, birch_logs: 10 }, at: 'tent', gives: { kind: 'structure' } });
    expect(SHELTER.time).toBeGreaterThan(1);
    expect(SHELTER.time).toBeLessThan(10);
    expect(siteOf(CAMP, 'tent')).toEqual(CAMP.camp!.tent);
    expect(siteOf(CAMP, 'tent')!.pos).toEqual({ x: -1.6, z: 5.8 });
    expect(siteOf(VILLAGE, 'tent')).toBeNull();                 // the village has no camp
  });

  it('has the stone pickaxe: branches and stones, made where he stands in a few seconds, gives the pick', () => {
    expect(STONE_PICK).toMatchObject({ name: 'Stone pickaxe', verb: 'Make', needs: { branch: 2, stone: 3 }, at: 'here', gives: { kind: 'tool', tool: 'pick' } });
    expect(STONE_PICK.time).toBeGreaterThan(1);
    expect(STONE_PICK.time).toBeLessThan(10);
    expect(STONE_PICK.done).toBe('You made a stone pickaxe.');
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
    // he has all the shelter asks for; it isn't built until he is sent to build it (tests below)
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
    // (it owns the pick too, so the stone pickaxe goal is done as well: below)
    expect(loaded.state.goalsDone).toEqual(['salvage', 'campfire', 'stone_axe', 'stone_pickaxe', 'firewood']);
    expect(currentGoal(loaded.state).id).toBe('shelter');
  });
});

/** Pick up `n` stones or branches by hand, one at a time, each the first lying on the ground (the player can only tap
 *  ones that are there); with none there, wait until one comes back. */
function pickUpSome(s: Setup, kind: PickupKind, n: number): void {
  for (let i = 0; i < n; i++) {
    const lying = () => ofKind(kind).find(p => onGround(s.state, CAMP, p.id));
    runUntil(s, () => !!lying(), 240);
    pickUp(s, lying()!.id);
  }
}
/** A fresh camp game played through commands up to the shelter: the wreck salvaged, the campfire built, the stone
 *  axe made, then birches chopped until he has the 10 logs; then he stops where he is. */
function readyForShelter(): Setup {
  const s = readyForAxe();
  makeAxe(s);
  send(s, { type: 'work', nodeId: 'camp_birch1' });
  runUntil(s, () => owned(s.state, 'birch_logs') >= SHELTER.needs.birch_logs!, 900);
  send(s, { type: 'walk', to: { ...s.state.player.pos } });
  runUntil(s, () => s.state.player.task.kind === 'idle', 5);
  return s;
}
/** Send him to make `id` and wait until it is made (or refused). */
function makeIt(s: Setup, id: 'shelter' | 'stone_pickaxe'): void {
  const from = s.log.length;
  send(s, { type: 'make', id });
  runUntil(s, () => since(s, from).some(e => e.type === 'made' || e.type === 'missing' || e.type === 'goalFirst'), 60);
}
/** A camp game with the stone axe made and the firewood chopped, carrying what the shelter needs. */
function firewoodIn(): Setup {
  const s = fireLit();
  s.state.goalsDone.push('stone_axe', 'firewood'); s.state.tools.axe = true;
  s.state.player.backpack = { plank: 4, tarp: 1, birch_logs: 10 };
  return s;
}
/** A camp game with the shelter built and nothing left in the backpack. */
function shelterUp(): Setup {
  const s = firewoodIn();
  s.state.goalsDone.push('shelter'); s.state.built.push('shelter');
  s.state.player.backpack = {};
  return s;
}

describe('building the shelter', () => {
  it('on a fresh camp game, after the stone axe and firewood: built at the tent spot, the materials gone, the tent saved and in the way, the card on the stone pickaxe', () => {
    const s = readyForShelter();
    const logs = owned(s.state, 'birch_logs');
    expect(logs).toBeGreaterThanOrEqual(10);
    expect(s.state.player.backpack).toEqual({ plank: 4, tarp: 1, birch_logs: logs });
    run(s, 0.1);
    expect(s.state.goalsDone).toEqual(['salvage', 'campfire', 'stone_axe', 'firewood']);
    expect(currentGoal(s.state).id).toBe('shelter');
    expect(goalMet(s.state, currentGoal(s.state))).toBe(true);
    expect(navFor(CAMP, s.state.built).walkable(TENT)).toBe(true);   // nothing stands there yet
    // sent to build it (the Build button, or a tap on the tent spot), he walks there and works beside it a few seconds
    const from = s.log.length;
    send(s, { type: 'make', id: 'shelter' });
    expect(s.state.player.pending).toEqual({ kind: 'make', id: 'shelter' });
    runUntil(s, () => s.state.player.task.kind === 'make', 60);
    const started = s.state.time, at = { ...s.state.player.pos };
    expect(dist(at, TENT)).toBeCloseTo(CAMP.camp!.tent.radius + BUILD_REACH, 1);
    run(s, SHELTER.time - 0.3);
    expect(s.state.player.task.kind).toBe('make');
    expect(s.state.built).toEqual(['campfire']);                // nothing is used up until it is made
    expect(owned(s.state, 'tarp')).toBe(1);
    runUntil(s, () => s.state.built.includes('shelter'), 5);
    expect(s.state.time - started).toBeCloseTo(SHELTER.time, 1);
    expect(since(s, from)).toContainEqual({ type: 'made', make: 'shelter' });
    // the tent stands; the tarp, planks and 10 logs are gone; he didn't move while he worked
    expect(s.state.built).toEqual(['campfire', 'shelter']);
    expect(made(s.state, 'shelter')).toBe(true);
    expect(s.state.player.backpack).toEqual(logs > 10 ? { birch_logs: logs - 10 } : {});
    expect(s.state.player.pos).toEqual(at);
    expect(s.state.player.task.kind).toBe('idle');
    run(s, 0.1);
    expect(s.state.goalsDone).toEqual(['salvage', 'campfire', 'stone_axe', 'firewood', 'shelter']);
    expect(currentGoal(s.state).id).toBe('stone_pickaxe');
    // it is in the way; where he stood to build it is still open ground
    const nav = navFor(CAMP, s.state.built);
    expect(nav.walkable(TENT)).toBe(false);
    expect(nav.walkable(at)).toBe(true);
    // a save and reload keeps it standing and in the way
    const back = deserialize(serialize(s.state), CAMP);
    expect(back).toEqual(s.state);
    expect(back.built).toEqual(['campfire', 'shelter']);
    expect(currentGoal(back).id).toBe('stone_pickaxe');
    expect(navFor(CAMP, back.built).walkable(TENT)).toBe(false);
    // asked again, nothing happens: there is one shelter
    const after = s.log.length;
    s.state.player.backpack = { plank: 4, tarp: 1, birch_logs: 10 };
    send(s, { type: 'make', id: 'shelter' });
    run(s, SHELTER.time + 1);
    expect(since(s, after)).toEqual([]);
    expect(s.state.player.backpack).toEqual({ plank: 4, tarp: 1, birch_logs: 10 });
  });

  it('once built he walks round the tent, never into its canvas (1.9 by 2.4 m, its door facing the fire)', () => {
    const s = shelterUp(), tent = CAMP.camp!.tent;
    expect(tent).toMatchObject({ w: 1.9, d: 2.4 });                 // village.glb's Tent
    expect(tent.radius).toBeGreaterThan(Math.hypot(tent.w / 2, tent.d / 2));   // its ring goes round its corners
    const nav = navFor(CAMP, s.state.built);
    // the tent's own frame, turned as world/nav.ts turns a building (and render/structures.ts the model): x across, z
    // along, the door at +z
    const c = Math.cos(tent.rot), sn = Math.sin(tent.rot);
    const toWorld = (lx: number, lz: number): Vec2 => ({ x: TENT.x + lx * c + lz * sn, z: TENT.z - lx * sn + lz * c });
    /** How far p is outside the canvas, in the tent's frame (below 0: inside it). */
    const outside = (p: Vec2) => {
      const dx = p.x - TENT.x, dz = p.z - TENT.z;
      return Math.max(Math.abs(dx * c - dz * sn) - tent.w / 2, Math.abs(dx * sn + dz * c) - tent.d / 2);
    };
    // the door faces the fire
    expect(dist(toWorld(0, 1), FIRE)).toBeLessThan(dist(TENT, FIRE) - 0.99);
    // every bit of the canvas, out to its corners, is in the way
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) {
      expect(nav.walkable(toWorld(i / 4 * tent.w / 2, j / 4 * tent.d / 2)), `${i},${j}`).toBe(false);
    }
    // walks straight across it from all round, through its middle and a metre to either side: neither the route nor
    // where he is at any moment on it comes inside the canvas, and he gets there
    let closest = Infinity, walks = 0;
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, ux = Math.cos(a), uz = Math.sin(a);
      for (const off of [-1, 0, 1]) {
        const from = nav.nearestWalkable({ x: TENT.x - ux * 4 - uz * off, z: TENT.z - uz * 4 + ux * off });
        const to = nav.nearestWalkable({ x: TENT.x + ux * 4 - uz * off, z: TENT.z + uz * 4 + ux * off });
        s.state.player.pos = from;                                 // (he stopped at the end of the last walk)
        send(s, { type: 'walk', to });
        expect(s.state.player.task.kind, `walk ${k} ${off}`).toBe('walk');
        let at = from;
        for (const w of s.state.player.path) {
          for (let t = 0; t <= 1; t += 0.01) closest = Math.min(closest, outside({ x: at.x + (w.x - at.x) * t, z: at.z + (w.z - at.z) * t }));
          at = w;
        }
        for (let t = 0; t < 20 && s.state.player.task.kind === 'walk'; t += STEP) { step(s.state, STEP, s.ctx); closest = Math.min(closest, outside(s.state.player.pos)); }
        expect(dist(s.state.player.pos, to), `walk ${k} ${off}`).toBeLessThan(0.1);
        walks++;
      }
    }
    expect(walks).toBe(48);
    expect(closest).toBeGreaterThan(0);
  });

  it('without everything it is refused, saying what is still missing, and he stays put', () => {
    const s = firewoodIn(), start = { ...s.state.player.pos };
    s.state.player.backpack = { plank: 2, tarp: 1, birch_logs: 6 };   // (firewood chopped earlier, some logs since dropped)
    send(s, { type: 'make', id: 'shelter' });
    expect(s.log.at(-1)).toEqual({ type: 'missing', make: 'shelter', items: { plank: 2, birch_logs: 4 } });
    expect(s.state.player.pending).toBeNull();
    run(s, SHELTER.time + 1);
    expect(s.state.player.pos).toEqual(start);
    expect(s.state.built).toEqual(['campfire']);
    expect(s.state.player.backpack).toEqual({ plank: 2, tarp: 1, birch_logs: 6 });
  });

  it('waits for the stone axe: with the tarp, planks and logs but no axe made, it is refused', () => {
    const s = fireLit();
    s.state.player.backpack = { plank: 4, tarp: 1, birch_logs: 10 };   // (a hand-edited save)
    send(s, { type: 'make', id: 'shelter' });
    expect(s.log.at(-1)).toEqual({ type: 'goalFirst', make: 'shelter', goal: 'stone_axe' });
    expect(s.state.player.pending).toBeNull();
    run(s, SHELTER.time + 1);
    expect(s.state.built).toEqual(['campfire']);
    expect(s.state.player.backpack).toEqual({ plank: 4, tarp: 1, birch_logs: 10 });
  });

  it('a save made while he builds it carries on and finishes after a reload', () => {
    const s = firewoodIn();
    send(s, { type: 'make', id: 'shelter' });
    runUntil(s, () => s.state.player.task.kind === 'make', 60);
    run(s, 1);
    const back = deserialize(serialize(s.state), CAMP);
    expect(back.player.task).toEqual(s.state.player.task);
    const loaded = { ...setup(), state: back };
    run(loaded, SHELTER.time);
    expect(loaded.state.built).toEqual(['campfire', 'shelter']);
    expect(loaded.state.player.backpack).toEqual({});
  });
});

describe('the stone pickaxe and copper ore', () => {
  it('on a fresh camp game, after the shelter: the pickaxe made where he stands, then 3 copper ore mined, and the card is on the chest', () => {
    const s = readyForShelter();
    makeIt(s, 'shelter');
    run(s, 0.1);
    expect(currentGoal(s.state).id).toBe('stone_pickaxe');
    // without a pick a copper rock is refused
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    expect(s.log.at(-1)).toEqual({ type: 'needTool', tool: 'pick', skill: 'mining' });
    // two branches and three stones from the ground (ones the fire and the axe took come back after a while)
    pickUpSome(s, 'branch', STONE_PICK.needs.branch!);
    pickUpSome(s, 'stone', STONE_PICK.needs.stone!);
    expect(owned(s.state, 'branch')).toBe(2);
    expect(owned(s.state, 'stone')).toBe(3);
    expect(goalMet(s.state, currentGoal(s.state))).toBe(true);
    // made right where he stands, a few seconds' work
    const at = { ...s.state.player.pos }, from = s.log.length;
    send(s, { type: 'make', id: 'stone_pickaxe' });
    runUntil(s, () => s.state.player.task.kind === 'make', 0.2);
    const started = s.state.time;
    run(s, STONE_PICK.time - 0.3);
    expect(s.state.tools.pick).toBe(false);
    runUntil(s, () => s.state.tools.pick, 2);
    expect(s.state.time - started).toBeCloseTo(STONE_PICK.time, 1);
    expect(since(s, from)).toContainEqual({ type: 'made', make: 'stone_pickaxe' });
    expect(s.state.tools).toEqual({ axe: true, pick: true });
    expect(owned(s.state, 'branch')).toBe(0);
    expect(owned(s.state, 'stone')).toBe(0);
    expect(s.state.player.pos).toEqual(at);
    expect(s.state.built).toEqual(['campfire', 'shelter']);
    run(s, 0.1);
    expect(s.state.goalsDone).toEqual(['salvage', 'campfire', 'stone_axe', 'firewood', 'shelter', 'stone_pickaxe']);
    expect(currentGoal(s.state).id).toBe('copper');
    // tap a copper rock: he mines it, hopping between the two rocks, until he has 3 ore
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    runUntil(s, () => owned(s.state, 'copper_ore') >= 3, 300);
    expect(owned(s.state, 'copper_ore')).toBeGreaterThanOrEqual(3);
    expect(s.state.skills.mining).toBeGreaterThan(0);
    run(s, 0.1);
    expect(s.state.goalsDone).toEqual(['salvage', 'campfire', 'stone_axe', 'firewood', 'shelter', 'stone_pickaxe', 'copper']);
    // the card is on the storage chest: it wants 10 more logs (the shelter took them), and can't be built yet
    send(s, { type: 'walk', to: { ...s.state.player.pos } });
    run(s, 1);
    expect(currentGoal(s.state).id).toBe('chest');
    s.state.player.backpack.birch_logs = 10;
    run(s, 0.1);
    expect(goalMet(s.state, currentGoal(s.state))).toBe(true);
    expect(goalFinished(s.state, goal('chest'))).toBe(false);
    expect(currentGoal(s.state).id).toBe('chest');
  });

  it('without everything the pickaxe is refused, saying what is still missing, and he stays put', () => {
    const s = shelterUp(), start = { ...s.state.player.pos };
    send(s, { type: 'make', id: 'stone_pickaxe' });
    expect(s.log.at(-1)).toEqual({ type: 'missing', make: 'stone_pickaxe', items: { branch: 2, stone: 3 } });
    s.state.player.backpack = { branch: 2, stone: 1 };
    send(s, { type: 'make', id: 'stone_pickaxe' });
    expect(s.log.at(-1)).toEqual({ type: 'missing', make: 'stone_pickaxe', items: { stone: 2 } });
    expect(s.state.player.pending).toBeNull();
    run(s, STONE_PICK.time + 1);
    expect(s.state.player.pos).toEqual(start);
    expect(s.state.tools.pick).toBe(false);
    expect(s.state.player.backpack).toEqual({ branch: 2, stone: 1 });
  });

  it('waits for the shelter: with branches and stones but no shelter yet, it is refused', () => {
    const s = firewoodIn();
    s.state.player.backpack = { plank: 4, tarp: 1, birch_logs: 10, branch: 2, stone: 3 };
    send(s, { type: 'make', id: 'stone_pickaxe' });
    expect(s.log.at(-1)).toEqual({ type: 'goalFirst', make: 'stone_pickaxe', goal: 'shelter' });
    run(s, STONE_PICK.time + 1);
    expect(s.state.tools.pick).toBe(false);
    expect(owned(s.state, 'stone')).toBe(3);
    expect(currentGoal(s.state).id).toBe('shelter');
  });
});

describe('old saves that already have a pick', () => {
  it('a 0.0.17 camp save that owns both tools skips the stone pickaxe goal: after the shelter the card is on copper', () => {
    const raw = JSON.parse(serialize(firewoodIn().state)); raw.tools = { axe: true, pick: true };
    const loaded = { ...setup(), state: deserialize(JSON.stringify(raw), CAMP) };
    expect(made(loaded.state, 'stone_pickaxe')).toBe(true);
    expect(goalFinished(loaded.state, goal('stone_pickaxe'))).toBe(true);
    expect(currentGoal(loaded.state).id).toBe('shelter');        // the goals before it still come first
    makeIt(loaded, 'shelter');
    run(loaded, 0.1);
    expect(loaded.state.built).toEqual(['campfire', 'shelter']);
    expect(loaded.state.goalsDone).toContain('stone_pickaxe');
    expect(currentGoal(loaded.state).id).toBe('copper');
    // asked to make one anyway, nothing happens and nothing is used up
    loaded.state.player.backpack = { branch: 2, stone: 3 };
    const from = loaded.log.length;
    send(loaded, { type: 'make', id: 'stone_pickaxe' });
    run(loaded, STONE_PICK.time + 1);
    expect(since(loaded, from)).toEqual([]);
    expect(loaded.state.player.backpack).toEqual({ branch: 2, stone: 3 });
    // and he can mine at once
    send(loaded, { type: 'work', nodeId: 'camp_copper2' });
    runUntil(loaded, () => owned(loaded.state, 'copper_ore') >= 3, 300);
    run(loaded, 0.1);
    expect(currentGoal(loaded.state).id).toBe('chest');
  });

  it('a 0.0.11 camp save (format 4) was given both tools, so the stone pickaxe goal is done too', () => {
    const s = setup();
    const { tools: _t, hasBook: _h, taken: _k, built: _b, goalsDone: _g, ...rest } = JSON.parse(serialize(s.state));
    const back = deserialize(JSON.stringify({ ...rest, version: 4 }), CAMP);
    expect(back.tools).toEqual({ axe: true, pick: true });
    expect(goalFinished(back, goal('stone_pickaxe'))).toBe(true);
    back.goalsDone = ['salvage', 'campfire', 'stone_axe', 'firewood', 'shelter']; back.built = ['campfire', 'shelter'];
    expect(currentGoal(back).id).toBe('copper');
  });
});

describe('the village is unchanged', () => {
  it('has nothing to make, the same walking grid and hearth, and no goals written down', () => {
    expect(navFor(VILLAGE, [])).toBe(navFor(VILLAGE));
    expect(navFor(VILLAGE).walkable(VILLAGE.hearth.pos)).toBe(false);
    const s = setup(VILLAGE);
    s.state.player.backpack = { plank: 7, stone: 4, tarp: 1 }; s.state.hasBook = true;
    send(s, { type: 'make', id: 'campfire' });
    // he has the village's iron axe and pick already, so stone ones aren't made either; there is no tent spot
    s.state.player.backpack.branch = 2; s.state.player.backpack.birch_logs = 10;
    send(s, { type: 'make', id: 'stone_axe' });
    send(s, { type: 'make', id: 'stone_pickaxe' });
    send(s, { type: 'make', id: 'shelter' });
    expect(s.log).toEqual([]);
    expect(s.state.player.task.kind).toBe('idle');
    run(s, 5);
    expect(s.state.built).toEqual([]);
    expect(s.state.goalsDone).toEqual([]);
    expect(s.state.tools).toEqual({ axe: true, pick: true });
    expect(s.state.player.backpack).toEqual({ plank: 7, stone: 4, tarp: 1, branch: 2, birch_logs: 10 });
    // a shelter in a village save is dropped: the village has nowhere to put it
    const v = JSON.parse(serialize(createState(VILLAGE, 2))); v.built = ['shelter', 'campfire'];
    expect(deserialize(JSON.stringify(v), VILLAGE).built).toEqual([]);
  });
});
