// The storage chest and the fire at night (game 0.0.19): at the camp the chest is the bank (systems/hauling: a full
// backpack is walked to it, emptied and he goes back to work; tapping it empties the backpack; what's in it counts
// for the goals), and once the campfire and the chest both stand he stokes the fire each night at nightfall with logs
// from the chest, or his backpack (systems/fire.ts): once a night, in catch-up too; with no logs the fire burns low.
// Saves carry it all (format 7). The village, with its bank and no campfire, is unchanged.
import { describe, expect, it } from 'vitest';
import { allGoalsDone, createState, owned, SAVE_VERSION, type GameState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS, isNight, nightOf } from '../src/core/clock';
import { deserialize, serialize } from '../src/core/save';
import { goalLines } from '../src/core/book';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, type Layout, type Vec2 } from '../src/world/layout';
import { navFor } from '../src/world/nav';
import { applyCommands, type Command } from '../src/systems/commands';
import { backpackCount } from '../src/systems/backpack';
import { GOALS } from '../src/data/goals';
import { BACKPACK_SLOTS } from '../src/data/hauling';
import { STOKE } from '../src/data/fire';

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const FIRE = CAMP.hearth.pos, CHEST = CAMP.camp!.chest.pos;
const LOGS = STOKE.item;

function setup(layout: Layout = CAMP, seed = 5) {
  const state = createState(layout, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, layout, ctx: { layout, rng: createRng(seed), events } };
}
type Setup = ReturnType<typeof setup>;
/** A camp with every goal done: the campfire, the shelter and the chest stand, and he has both tools. */
function campSet(seed = 5): Setup {
  const s = setup(CAMP, seed);
  s.state.goalsDone = GOALS.map(g => g.id);
  s.state.built = ['campfire', 'shelter', 'chest'];
  s.state.tools = { axe: true, pick: true };
  s.state.hasBook = true;
  return s;
}
/** The same, but its chest not built yet. */
function noChest(seed = 5): Setup {
  const s = campSet(seed);
  s.state.built = ['campfire', 'shelter']; s.state.goalsDone = s.state.goalsDone.filter(g => g !== 'chest');
  return s;
}
const send = (s: Setup, c: Command) => applyCommands(s.state, s.layout, [c], s.events);
const runUntil = (s: Setup, done: () => boolean, max: number) => { for (let t = 0; t < max && !done(); t += STEP) step(s.state, STEP, s.ctx); };
const run = (s: Setup, seconds: number) => runUntil(s, () => false, seconds);
const count = (s: Setup, type: GameEvent['type']) => s.log.filter(e => e.type === type).length;
/** In-game time on `day` (from 0) at `hour` o'clock. */
const at = (day: number, hour: number) => (day + hour / 24) * DAY_SECONDS;
const NIGHTFALL = STOKE.at * 24;
/** A setup's game, saved and loaded again, carrying on with fresh events and randomness. */
function reload(s: Setup): Setup {
  const t = setup(CAMP, 9);
  return { ...t, state: deserialize(serialize(s.state), CAMP) };
}
/** Whether he works (or is on his way to work) a birch. */
const atBirch = (state: GameState) => {
  const p = state.player, id = p.task.kind === 'gather' ? p.task.nodeId : p.pending?.kind === 'node' ? p.pending.id : '';
  return id.startsWith('camp_birch');
};

describe('the storage chest stores things, like the bank', () => {
  it('a full backpack while chopping is walked to the chest, emptied into it, and he goes back to chopping', () => {
    const s = campSet();
    send(s, { type: 'work', nodeId: 'camp_birch1' });
    runUntil(s, () => count(s, 'backpackFull') > 0, 900);
    expect(count(s, 'noStorage')).toBe(0);
    const trip = s.state.player.trip as { nodeId: string };     // back to the birch he was on (he moves on as trees fall)
    expect(trip.nodeId).toMatch(/^camp_birch/);
    expect(s.state.player.pending).toEqual({ kind: 'visit', id: 'chest' });
    runUntil(s, () => count(s, 'banked') > 0, 60);
    expect(s.log.find(e => e.type === 'banked')).toEqual({ type: 'banked', items: { birch_logs: BACKPACK_SLOTS } });
    expect(s.state.bank).toEqual({ birch_logs: BACKPACK_SLOTS });
    expect(s.state.player.backpack).toEqual({});
    expect(dist(s.state.player.pos, CHEST)).toBeLessThan(CAMP.camp!.chest.radius + 1);
    // after a moment at the chest he goes back to the birches
    runUntil(s, () => s.state.player.trip === null, 5);
    expect(atBirch(s.state)).toBe(true);
    runUntil(s, () => s.state.player.task.kind === 'gather', 60);
    expect(s.state.player.task.kind).toBe('gather');
    // and goals count what is in the chest
    expect(owned(s.state, 'birch_logs')).toBe(BACKPACK_SLOTS);
  });

  it('before the chest is built, a full backpack still stops him with a notice', () => {
    const s = noChest();
    send(s, { type: 'work', nodeId: 'camp_birch1' });
    runUntil(s, () => count(s, 'noStorage') > 0, 900);
    expect(count(s, 'noStorage')).toBe(1);
    expect(count(s, 'backpackFull')).toBe(0);
    expect(backpackCount(s.state)).toBe(BACKPACK_SLOTS);
    // tapping the chest's spot asks to build it rather than store anything
    send(s, { type: 'visit', id: 'chest' });
    expect(s.log.at(-1)).toEqual({ type: 'noPath' });
    expect(s.state.bank).toEqual({});
  });

  it('tapping the chest walks him over and empties the backpack into it, and he stays; with nothing to store it says so', () => {
    const s = campSet();
    s.state.player.backpack = { birch_logs: 4, copper_ore: 2, stone: 1 };
    s.state.bank = { birch_logs: 3 };
    send(s, { type: 'visit', id: 'chest' });
    runUntil(s, () => count(s, 'banked') > 0, 60);
    expect(s.state.bank).toEqual({ birch_logs: 7, copper_ore: 2, stone: 1 });
    expect(s.state.player.backpack).toEqual({});
    run(s, 3);
    expect(s.state.player.task.kind).toBe('idle');
    expect(dist(s.state.player.pos, CHEST)).toBeLessThan(CAMP.camp!.chest.radius + 1);
    expect(navFor(CAMP, s.state.built).walkable(s.state.player.pos)).toBe(true);
    send(s, { type: 'visit', id: 'chest' });
    run(s, 1);
    expect(count(s, 'nothingToBank')).toBe(1);
  });

  it('stored things count for the goals, and making takes from the backpack first, then the chest', () => {
    const s = noChest();
    s.state.bank = { birch_logs: 6, copper_ore: 3 };             // say, from an earlier version
    s.state.player.backpack = { birch_logs: 4 };
    const chest = GOALS.find(g => g.id === 'chest')!;
    expect(goalLines(s.state, chest)).toEqual([{ id: 'birch_logs', need: 10, got: 10, done: true }, { id: 'copper_ore', need: 3, got: 3, done: true }]);
    send(s, { type: 'make', id: 'chest' });
    runUntil(s, () => s.state.built.includes('chest'), 60);
    expect(s.state.player.backpack).toEqual({});
    expect(s.state.bank).toEqual({});
  });

  it('dropping from the backpack still works once the chest stands, and gathering stones with no room goes to the chest first', () => {
    const s = campSet();
    s.state.player.backpack = { birch_logs: 26, branch: 2 };
    send(s, { type: 'drop', item: 'branch', count: 1 });
    expect(s.state.player.backpack).toEqual({ birch_logs: 26, branch: 1 });
    expect(s.log.at(-1)).toEqual({ type: 'dropped', item: 'branch', count: 1 });
    s.state.player.backpack.birch_logs = 27;
    const stone = CAMP.pickups!.find(p => p.kind === 'stone')!;
    send(s, { type: 'pickup', id: stone.id });
    runUntil(s, () => count(s, 'banked') > 0, 120);
    expect(s.state.bank).toEqual({ birch_logs: 27, branch: 1 });
    runUntil(s, () => owned(s.state, 'stone') > 0, 60);
    expect(s.state.player.backpack.stone).toBe(1);
  });
});

describe('stoking the fire at night', () => {
  it('the night runs from nightfall to the next: once a night, the small hours belonging to the night before', () => {
    expect(NIGHTFALL).toBe(20);
    expect(isNight(at(0, 19.9))).toBe(false);
    expect(isNight(at(0, 20))).toBe(true);
    expect(isNight(at(1, 2))).toBe(true);
    expect(isNight(at(1, 6))).toBe(false);
    expect(nightOf(at(0, 20.5))).toBe(0);
    expect(nightOf(at(1, 3))).toBe(0);
    expect(nightOf(at(1, 21))).toBe(1);
    expect(createState(CAMP).stokedNight).toBe(-1);
    expect(STOKE.logs).toBe(3);
  });

  it('at nightfall he leaves the birches, takes logs from the chest, stokes the fire, goes back; not twice in a night, again the next', () => {
    const s = campSet();
    s.state.bank = { birch_logs: 5 };
    s.state.time = at(0, NIGHTFALL) - 3;
    send(s, { type: 'work', nodeId: 'camp_birch2' });
    runUntil(s, () => count(s, 'stokeOff') > 0, 10);
    expect(count(s, 'stokeOff')).toBe(1);
    expect(s.state.player.stoke).toMatchObject({ back: { nodeId: 'camp_birch2' }, logs: 0 });
    expect(s.state.player.pending).toEqual({ kind: 'visit', id: 'chest' });
    // at the chest: 3 logs taken from it, carried to the fire
    runUntil(s, () => (s.state.player.stoke?.logs ?? 0) > 0, 60);
    expect(s.state.bank).toEqual({ birch_logs: 2 });
    expect(s.state.player.stoke!.logs).toBe(3);
    expect(dist(s.state.player.pos, CHEST)).toBeLessThan(CAMP.camp!.chest.radius + 1);
    expect(s.state.player.pending).toEqual({ kind: 'visit', id: 'campfire' });
    runUntil(s, () => s.state.player.task.kind === 'stoke', 60);
    expect(dist(s.state.player.pos, FIRE)).toBeLessThan(CAMP.hearth.radius + 1);
    const stoking = s.state.time;
    runUntil(s, () => count(s, 'stoked') > 0, 10);
    expect(s.state.time - stoking).toBeCloseTo(STOKE.time, 1);
    expect(s.log.find(e => e.type === 'stoked')).toEqual({ type: 'stoked', logs: 3 });
    expect(s.state.fireLow).toBe(false);
    expect(s.state.player.stoke).toBeNull();
    // back to the birch he was chopping
    expect(s.state.player.pending).toEqual({ kind: 'node', id: 'camp_birch2' });
    runUntil(s, () => s.state.player.task.kind === 'gather', 60);
    // the rest of the night, and the day after, he chops on
    runUntil(s, () => s.state.time >= at(1, NIGHTFALL) - 1, DAY_SECONDS);
    expect(count(s, 'stokeOff')).toBe(1);
    expect(count(s, 'stoked')).toBe(1);
    expect(s.state.stokedNight).toBe(0);
    // the next nightfall, again (logs from the chest, where his full backpacks went meanwhile)
    runUntil(s, () => count(s, 'stoked') > 1, 120);
    expect(count(s, 'stokeOff')).toBe(2);
    expect(count(s, 'stoked')).toBe(2);
    expect(s.state.stokedNight).toBe(1);
  });

  it('with too few logs in the chest he takes them from his backpack; with fewer than 3 in all he uses what there is', () => {
    const s = campSet();
    s.state.player.backpack = { birch_logs: 5, copper_ore: 2 };
    s.state.time = at(0, NIGHTFALL) - 0.5;
    runUntil(s, () => count(s, 'stoked') > 0, 120);
    expect(count(s, 'stokeOff')).toBe(1);
    expect(s.state.player.backpack).toEqual({ birch_logs: 2, copper_ore: 2 });
    expect(s.state.bank).toEqual({});
    // he was doing nothing, so he stays by the fire
    expect(s.state.player.task.kind).toBe('idle');
    expect(dist(s.state.player.pos, FIRE)).toBeLessThan(CAMP.hearth.radius + 1);
    // one in the chest and one in the backpack: the chest's first, then the backpack's
    const t = campSet();
    t.state.bank = { birch_logs: 1 }; t.state.player.backpack = { birch_logs: 1 };
    t.state.time = at(0, NIGHTFALL) - 0.5;
    runUntil(t, () => count(t, 'stoked') > 0, 120);
    expect(t.log.find(e => e.type === 'stoked')).toEqual({ type: 'stoked', logs: 2 });
    expect(owned(t.state, LOGS)).toBe(0);
  });

  it('with no logs at all he stays at work, the fire burns low with nothing lost, and burns normally once stoked', () => {
    const s = campSet();
    s.state.player.backpack = { copper_ore: 2 };
    s.state.time = at(0, NIGHTFALL) - 0.5;
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    runUntil(s, () => count(s, 'fireLow') > 0, 5);
    expect(count(s, 'fireLow')).toBe(1);
    expect(count(s, 'stokeOff')).toBe(0);
    expect(s.state.fireLow).toBe(true);
    expect(s.state.player.stoke).toBeNull();
    expect(s.state.player.pending).toEqual({ kind: 'node', id: 'camp_copper1' });
    runUntil(s, () => s.state.player.task.kind === 'gather', 30);
    expect(s.state.player.task).toMatchObject({ kind: 'gather', nodeId: 'camp_copper1' });
    // not again that night, even with logs in the chest by then; it stays low through the day
    s.state.bank = { birch_logs: 4 };
    runUntil(s, () => s.state.time >= at(1, NIGHTFALL) - 1, DAY_SECONDS);
    expect(count(s, 'fireLow')).toBe(1);
    expect(count(s, 'stokeOff')).toBe(0);
    expect(s.state.fireLow).toBe(true);
    // the next nightfall he stokes it, and it burns normally again
    runUntil(s, () => count(s, 'stoked') > 0, 120);
    expect(s.state.fireLow).toBe(false);
    expect(owned(s.state, 'copper_ore')).toBeGreaterThanOrEqual(2);
  });

  it('if he is making something at nightfall he finishes first, then goes; afterwards he does not make it again', () => {
    const s = campSet();
    s.state.tools.pick = false;                                   // say he lost it: a stone pickaxe to make
    s.state.player.backpack = { branch: 2, stone: 3 };
    s.state.bank = { birch_logs: 3 };
    s.state.time = at(0, NIGHTFALL) - 1;
    send(s, { type: 'make', id: 'stone_pickaxe' });
    runUntil(s, () => count(s, 'stokeOff') > 0, 10);
    expect(s.state.tools.pick).toBe(true);
    expect(s.state.time).toBeGreaterThan(at(0, NIGHTFALL));
    expect(s.state.player.stoke?.back).toBeNull();
    runUntil(s, () => count(s, 'stoked') > 0, 120);
    expect(count(s, 'made')).toBe(1);
  });

  it('a command from the player stops it: logs he carries go back into the chest, and he does not set off again that night', () => {
    const s = campSet();
    s.state.bank = { birch_logs: 4 };
    s.state.time = at(0, NIGHTFALL) - 0.5;
    runUntil(s, () => (s.state.player.stoke?.logs ?? 0) > 0, 60);
    expect(s.state.bank).toEqual({ birch_logs: 1 });
    send(s, { type: 'walk', to: { x: 6, z: -2 } });
    expect(s.state.player.stoke).toBeNull();
    expect(s.state.bank).toEqual({ birch_logs: 4 });
    runUntil(s, () => s.state.time >= at(1, 6), DAY_SECONDS);
    expect(count(s, 'stokeOff')).toBe(1);
    expect(count(s, 'stoked')).toBe(0);
    expect(owned(s.state, LOGS)).toBe(4);
    // dropping something doesn't stop it
    const t = campSet();
    t.state.bank = { birch_logs: 4 }; t.state.player.backpack = { stone: 2 };
    t.state.time = at(0, NIGHTFALL) - 0.5;
    runUntil(t, () => count(t, 'stokeOff') > 0, 5);
    send(t, { type: 'drop', item: 'stone', count: 1 });
    runUntil(t, () => count(t, 'stoked') > 0, 120);
    expect(count(t, 'stoked')).toBe(1);
  });

  it('a full backpack he was taking to the chest is emptied there on the way, then he stokes and goes back to work', () => {
    const s = campSet();
    s.state.bank = { birch_logs: 2 };
    send(s, { type: 'work', nodeId: 'camp_birch1' });
    runUntil(s, () => count(s, 'backpackFull') > 0, 900);
    // nightfall strikes on the way to the chest
    s.state.time = Math.max(s.state.time, at(0, NIGHTFALL) - STEP);
    run(s, STEP * 2);
    expect(count(s, 'stokeOff')).toBe(1);
    expect(s.state.player.trip).toBeNull();
    expect((s.state.player.stoke?.back as { nodeId: string }).nodeId).toMatch(/^camp_birch/);
    expect(s.state.player.stoke).toMatchObject({ logs: 0, empty: true });
    runUntil(s, () => count(s, 'stoked') > 0, 120);
    expect(count(s, 'banked')).toBe(1);
    expect(owned(s.state, LOGS)).toBe(2 + BACKPACK_SLOTS - 3);
    expect(s.state.bank.birch_logs).toBe(2 + BACKPACK_SLOTS - 3);
    expect(atBirch(s.state)).toBe(true);
  });

  it('nightfall in the moment he stands at the chest, a full backpack just emptied: no "backpack is empty" notice', () => {
    const s = campSet();
    s.state.bank = { birch_logs: 2 };
    s.state.player.backpack = { birch_logs: BACKPACK_SLOTS - 1 };
    s.state.time = at(0, 12);
    send(s, { type: 'work', nodeId: 'camp_birch1' });
    runUntil(s, () => count(s, 'banked') > 0, 120);
    const p = s.state.player;
    expect(p.trip?.leaveAt).toBeDefined();
    // nightfall strikes while he pauses at the chest
    const shift = at(0, NIGHTFALL) - STEP / 2 - s.state.time;
    s.state.time += shift; p.trip!.leaveAt! += shift;
    step(s.state, STEP, s.ctx);
    expect(count(s, 'stokeOff')).toBe(1);
    expect(p.stoke).toMatchObject({ logs: 0, empty: false });
    runUntil(s, () => count(s, 'stoked') > 0, 120);
    expect(count(s, 'nothingToBank')).toBe(0);
    expect(count(s, 'banked')).toBe(1);
    expect(s.state.bank).toEqual({ birch_logs: 2 + BACKPACK_SLOTS - 3 });
    expect(atBirch(s.state)).toBe(true);
    // the logs used up on his way to the chest: the fire burns low, and no notice about the backpack either
    const t = campSet();
    t.state.bank = { birch_logs: 3 };
    t.state.time = at(0, NIGHTFALL) - 0.5;
    runUntil(t, () => count(t, 'stokeOff') > 0, 5);
    t.state.bank = {};
    runUntil(t, () => t.state.player.stoke === null, 60);
    expect(count(t, 'fireLow')).toBe(1);
    expect(count(t, 'nothingToBank') + count(t, 'banked')).toBe(0);
  });

  it('tapping the chest on his way there for the logs keeps stoking: he empties the backpack there and stokes on', () => {
    const s = campSet();
    s.state.bank = { birch_logs: 4 }; s.state.player.backpack = { stone: 2, branch: 1 };
    s.state.time = at(0, NIGHTFALL) - 0.5;
    runUntil(s, () => count(s, 'stokeOff') > 0, 5);
    send(s, { type: 'visit', id: 'chest' });
    expect(s.state.player.stoke).toMatchObject({ logs: 0, empty: true });
    runUntil(s, () => count(s, 'stoked') > 0, 120);
    expect(count(s, 'stoked')).toBe(1);
    expect(count(s, 'banked')).toBe(1);
    expect(s.state.bank).toEqual({ birch_logs: 1, stone: 2, branch: 1 });
    expect(s.state.player.backpack).toEqual({});
    // with the logs already in hand, a tap on the chest still stops it, and the logs go back
    const t = campSet();
    t.state.bank = { birch_logs: 4 };
    t.state.time = at(0, NIGHTFALL) - 0.5;
    runUntil(t, () => (t.state.player.stoke?.logs ?? 0) > 0, 60);
    send(t, { type: 'visit', id: 'chest' });
    expect(t.state.player.stoke).toBeNull();
    expect(t.state.bank).toEqual({ birch_logs: 4 });
  });

  it('catching up two nights at once (the tab in the background) stokes twice, once a night', () => {
    const s = campSet();
    s.state.bank = { birch_logs: 20 };
    s.state.time = at(0, 12);
    send(s, { type: 'work', nodeId: 'camp_birch3' });
    // as main.ts catches up: steps one after another, with nothing drawn in between
    const n = Math.round(2 * DAY_SECONDS / STEP);
    for (let i = 0; i < n; i++) step(s.state, STEP, s.ctx);
    expect(count(s, 'stokeOff')).toBe(2);
    expect(count(s, 'stoked')).toBe(2);
    expect(s.state.stokedNight).toBe(1);
    expect(s.state.fireLow).toBe(false);
    expect(Number.isFinite(s.state.player.pos.x)).toBe(true);
    expect(navFor(CAMP, s.state.built).walkable(s.state.player.pos)).toBe(true);
  });

  it('a night that began before the chest stood is not his to see to: built that night, he stokes from the next', () => {
    const s = noChest();
    s.state.player.backpack = { birch_logs: 10, copper_ore: 3 };
    s.state.time = at(0, NIGHTFALL + 1);
    run(s, 0.1);
    expect(s.state.stokedNight).toBe(0);
    send(s, { type: 'make', id: 'chest' });
    runUntil(s, () => s.state.built.includes('chest'), 60);
    s.state.bank = { birch_logs: 3 };
    runUntil(s, () => s.state.time >= at(1, 12), DAY_SECONDS);
    expect(count(s, 'stokeOff') + count(s, 'fireLow')).toBe(0);
    runUntil(s, () => count(s, 'stoked') > 0, DAY_SECONDS);
    expect(nightOf(s.state.time)).toBe(1);
    expect(allGoalsDone(s.state)).toBe(true);
  });
});

describe('saving the chest and the fire', () => {
  it('a save made on the way to the chest, carrying the logs, or stoking carries on after a reload, stoking once', () => {
    for (const stage of ['chest', 'fire', 'stoke'] as const) {
      const s = campSet();
      s.state.bank = { birch_logs: 5 };
      s.state.time = at(0, NIGHTFALL) - 3;
      send(s, { type: 'work', nodeId: 'camp_birch2' });
      runUntil(s, () => count(s, 'stokeOff') > 0, 10);
      if (stage !== 'chest') runUntil(s, () => (s.state.player.stoke?.logs ?? 0) > 0, 60);
      if (stage === 'stoke') { runUntil(s, () => s.state.player.task.kind === 'stoke', 60); run(s, 0.5); }
      else run(s, 0.3);
      const loaded = reload(s);
      expect(loaded.state.player.stoke, stage).toEqual(s.state.player.stoke);
      expect(loaded.state.player.task, stage).toEqual(s.state.player.task);
      runUntil(loaded, () => count(loaded, 'stoked') > 0, 120);
      expect(count(loaded, 'stoked'), stage).toBe(1);
      expect(count(loaded, 'stokeOff'), stage).toBe(0);
      expect(loaded.state.bank, stage).toEqual({ birch_logs: 2 });
      expect(loaded.state.player.pending, stage).toEqual({ kind: 'node', id: 'camp_birch2' });
      run(loaded, 30);
      expect(count(loaded, 'stoked'), stage).toBe(1);
    }
  });

  it('round-trips the night seen to and a fire burning low', () => {
    const s = campSet();
    s.state.stokedNight = 3; s.state.fireLow = true;
    const back = deserialize(serialize(s.state), CAMP);
    expect(back).toEqual(s.state);
  });

  it('a version 6 save (0.0.18) loads with no night seen to, the fire burning normally, and nothing under way', () => {
    const s = noChest();
    s.state.player.backpack = { birch_logs: 7, copper_ore: 3 };
    send(s, { type: 'work', nodeId: 'camp_birch1' });
    run(s, 5);
    const { stokedNight: _n, fireLow: _l, ...rest } = JSON.parse(serialize(s.state));
    const { stoke: _s, ...player } = rest.player;
    const back = deserialize(JSON.stringify({ ...rest, player, version: 6 }), CAMP);
    expect(SAVE_VERSION).toBe(7);
    expect(back.version).toBe(7);
    expect(back.stokedNight).toBe(-1);
    expect(back.fireLow).toBe(false);
    expect(back.player.stoke).toBeNull();
    expect(back.player.task).toEqual(s.state.player.task);
    expect(back.player.backpack).toEqual(s.state.player.backpack);
    expect(back.built).toEqual(['campfire', 'shelter']);
  });

  it('repairs a damaged stoke: logs it carried go back into the chest, and a stoke task without one stops', () => {
    const s = campSet();
    s.state.bank = { birch_logs: 1 };
    const raw = JSON.parse(serialize(s.state));
    raw.player.stoke = { back: { nodeId: 'gone' }, logs: 3, empty: 'yes' };       // and he isn't on his way anywhere
    raw.stokedNight = 'last night'; raw.fireLow = 1;
    const back = deserialize(JSON.stringify(raw), CAMP);
    expect(back.player.stoke).toBeNull();
    expect(back.bank).toEqual({ birch_logs: 4 });
    expect(back.stokedNight).toBe(-1);
    expect(back.fireLow).toBe(false);
    raw.player.stoke = null; raw.player.task = { kind: 'stoke', doneAt: 50 };
    expect(deserialize(JSON.stringify(raw), CAMP).player.task).toEqual({ kind: 'idle' });
    // on the way to the fire with logs, the stoke is kept with a bad back dropped
    raw.player.stoke = { back: { nodeId: 'gone' }, logs: 3, empty: false }; raw.player.task = { kind: 'walk' };
    raw.player.pending = { kind: 'visit', id: 'campfire' }; raw.player.path = [{ x: FIRE.x - 1.3, z: FIRE.z }];
    expect(deserialize(JSON.stringify(raw), CAMP).player.stoke).toEqual({ back: null, logs: 3, empty: false });
    // without a chest there is no stoking to carry on
    raw.built = ['campfire', 'shelter'];
    const noChestBack = deserialize(JSON.stringify(raw), CAMP);
    expect(noChestBack.player.stoke).toBeNull();
  });
});

describe('the village is unchanged', () => {
  it('banks at the bank, never stokes, and keeps its storage line the bank', () => {
    const s = setup(VILLAGE, 4);
    s.state.time = at(0, NIGHTFALL) - 30;
    send(s, { type: 'work', nodeId: 'birch1' });
    runUntil(s, () => count(s, 'banked') > 0, 900);
    expect(s.state.player.trip).not.toBeNull();
    expect(s.state.bank).toEqual({ birch_logs: BACKPACK_SLOTS });
    runUntil(s, () => s.state.time >= at(1, 8), DAY_SECONDS);
    expect(count(s, 'stokeOff') + count(s, 'stoked') + count(s, 'fireLow')).toBe(0);
    expect(s.state.stokedNight).toBe(-1);
    expect(s.state.fireLow).toBe(false);
    // the chest can't be built or visited there
    s.state.player.backpack = { birch_logs: 10, copper_ore: 3 };
    const from = s.log.length;
    send(s, { type: 'make', id: 'chest' });
    expect(s.log.slice(from)).toEqual([]);
    send(s, { type: 'visit', id: 'chest' });
    expect(s.log.slice(from)).toEqual([{ type: 'noPath' }]);
  });
});
