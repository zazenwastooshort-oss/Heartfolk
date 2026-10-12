// The backpack and trips to the bank (docs/PLAN.md, Hauling): gathering fills the backpack, a full one is carried to
// the bank and emptied there, then he goes back to work (or to gathering things off the ground). Tapping the bank
// empties it too; the player's commands win.
import { describe, expect, it } from 'vitest';
import { createState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { step } from '../src/sim';
import { VILLAGE, doorOf, type Layout, type Vec2 } from '../src/world/layout';
import { reachFor } from '../src/actors/player';
import { navFor } from '../src/world/nav';
import { applyCommands, type Command } from '../src/systems/commands';
import { addToBackpack, backpackCount } from '../src/systems/backpack';
import { serialize, deserialize } from '../src/core/save';
import { ITEMS, RESOURCES } from '../src/data/skills';
import { BACKPACK_SLOTS, BANK_PAUSE } from '../src/data/hauling';

const bank = VILLAGE.buildings.find(b => b.kind === 'bank')!, door = doorOf(bank);
// the village without its bank (a layout of its own, since nav grids are cached per layout)
const NO_BANK: Layout = { ...VILLAGE, buildings: VILLAGE.buildings.filter(b => b.kind !== 'bank') };

function setup(layout: Layout = VILLAGE, seed = 4) {
  const state = createState(layout, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, layout, ctx: { layout, rng: createRng(seed), events } };
}
type Setup = ReturnType<typeof setup>;
const send = (s: Setup, ...commands: Command[]) => applyCommands(s.state, s.layout, commands, s.events);
/** Step until `done` (or `max` seconds pass). */
const runUntil = (s: Setup, done: () => boolean, max: number) => { for (let t = 0; t < max && !done(); t += STEP) step(s.state, STEP, s.ctx); };
const run = (s: Setup, seconds: number) => runUntil(s, () => false, seconds);
const count = (s: Setup, type: GameEvent['type']) => s.log.filter(e => e.type === type).length;
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const node = (id: string) => VILLAGE.nodes.find(n => n.id === id)!;

/** Send him to chop birch until the backpack fills and he sets off for the bank. */
function fillUp(s: Setup) {
  send(s, { type: 'work', nodeId: 'birch1' });
  runUntil(s, () => count(s, 'backpackFull') > 0, 600);
  expect(count(s, 'backpackFull')).toBe(1);
  return s.state.player.trip as { nodeId: string; leaveAt?: number };   // a trip back to a node
}

describe('the backpack', () => {
  it('gathering fills the backpack, not the bank, up to its capacity and never beyond', () => {
    const s = setup();
    send(s, { type: 'work', nodeId: 'birch1' });
    let most = 0, banked = false;
    for (let t = 0; t < 600 && !count(s, 'backpackFull'); t += STEP) {
      step(s.state, STEP, s.ctx);
      most = Math.max(most, backpackCount(s.state));
      if (Object.keys(s.state.bank).length) banked = true;
    }
    expect(most).toBe(BACKPACK_SLOTS);
    expect(banked).toBe(false);
    expect(s.state.player.backpack).toEqual({ birch_logs: BACKPACK_SLOTS });
    expect(count(s, 'itemGained')).toBe(BACKPACK_SLOTS);
    expect(s.state.skills.woodcutting).toBe(BACKPACK_SLOTS * RESOURCES.birch_tree!.xp);
  });

  it('a full backpack takes no more, and with no bank to empty it he stops working', () => {
    const s = setup(NO_BANK);
    for (let i = 0; i < BACKPACK_SLOTS; i++) expect(addToBackpack(s.state, 'copper_ore')).toBe(true);
    expect(addToBackpack(s.state, 'birch_logs')).toBe(false);
    expect(s.state.player.backpack).toEqual({ copper_ore: BACKPACK_SLOTS });
    s.state.player.task = { kind: 'gather', nodeId: 'copper1', progress: 0 };   // as if he were at the rock
    run(s, 60);
    expect(backpackCount(s.state)).toBe(BACKPACK_SLOTS);
    expect(count(s, 'itemGained')).toBe(0);
    expect(count(s, 'noStorage')).toBe(1);              // "nowhere to store it", said once, not every step
    expect(s.state.player.task.kind).toBe('idle');
  });
});

describe('trips to the bank', () => {
  it('a full backpack takes him to the bank door, empties it into the bank, and he goes back to the node he left', () => {
    const s = setup(), p = s.state.player, trip = fillUp(s), carried = { ...p.backpack };
    expect(p.pending).toEqual({ kind: 'visit', id: bank.id });
    expect(p.task.kind).toBe('walk');
    s.state.nodes[trip.nodeId]!.depletedUntil = 0;              // still standing when he is done at the bank
    runUntil(s, () => count(s, 'banked') > 0, 120);
    expect(dist(p.pos, door)).toBeLessThan(0.01);
    expect(s.state.bank).toEqual(carried);
    expect(p.backpack).toEqual({});
    expect(s.log).toContainEqual({ type: 'banked', items: carried });
    // a moment at the door, facing the bank, then off again
    expect(p.pending).toBeNull();
    expect(p.trip?.leaveAt).toBeCloseTo(s.state.time + BANK_PAUSE, 1);
    run(s, BANK_PAUSE / 2);
    expect(p.task.kind).toBe('idle');
    expect(dist(p.pos, door)).toBeLessThan(0.01);
    run(s, BANK_PAUSE / 2 + 2 * STEP);
    expect(p.trip).toBeNull();
    expect(p.pending).toEqual({ kind: 'node', id: trip.nodeId });
    runUntil(s, () => p.task.kind === 'gather', 60);
    expect(p.task).toMatchObject({ kind: 'gather', nodeId: trip.nodeId });
    const items = count(s, 'itemGained');
    runUntil(s, () => count(s, 'itemGained') > items, 60);
    expect(p.backpack).toEqual({ birch_logs: 1 });
  });

  it('goes back to the nearest free node like it when his is down, and waits at his own when they all are', () => {
    const s = setup(), p = s.state.player, trip = fillUp(s), kind = node(trip.nodeId).resource;
    s.state.nodes[trip.nodeId]!.depletedUntil = s.state.time + 1000;     // felled, and slow to grow back
    runUntil(s, () => count(s, 'banked') > 0, 120);
    run(s, BANK_PAUSE + 2 * STEP);
    const gap = (id: string) => dist(node(id).pos, door) - reachFor(node(id));
    const free = VILLAGE.nodes.filter(n => n.resource === kind && s.state.nodes[n.id]!.depletedUntil === 0).map(n => n.id);
    const nearest = free.reduce((a, b) => gap(b) < gap(a) ? b : a);
    expect(nearest).not.toBe(trip.nodeId);
    expect(p.pending).toEqual({ kind: 'node', id: nearest });
    runUntil(s, () => p.task.kind === 'gather', 60);
    expect(p.task).toMatchObject({ kind: 'gather', nodeId: nearest });

    const all = setup(), q = all.state.player, trip2 = fillUp(all);
    for (const n of VILLAGE.nodes) if (n.resource === kind) all.state.nodes[n.id]!.depletedUntil = all.state.time + 1000;
    runUntil(all, () => count(all, 'banked') > 0, 120);
    run(all, BANK_PAUSE + 2 * STEP);
    expect(q.pending).toEqual({ kind: 'node', id: trip2.nodeId });
    runUntil(all, () => q.task.kind === 'gather', 60);
    run(all, 10);
    expect(q.task).toMatchObject({ kind: 'gather', nodeId: trip2.nodeId });
    expect(backpackCount(all.state)).toBe(0);                 // waiting for it to grow back
  });

  it('a command from the player during a trip cancels it, and the backpack keeps its items', () => {
    const s = setup(), p = s.state.player;
    fillUp(s);
    run(s, 1);
    const carried = { ...p.backpack }, to = { x: 0, z: 14 };
    send(s, { type: 'walk', to });
    expect(p.trip).toBeNull();
    run(s, 30);
    expect(p.task.kind).toBe('idle');
    expect(dist(p.pos, to)).toBeLessThan(0.01);
    expect(p.backpack).toEqual(carried);
    expect(s.state.bank).toEqual({});
    expect(count(s, 'banked')).toBe(0);
    expect(count(s, 'backpackFull')).toBe(1);                 // standing about with it full is fine: no new trip
  });

  it('sent to work with a full backpack, he goes to the bank first, then to that node', () => {
    const s = setup(), p = s.state.player;
    p.backpack = { copper_ore: BACKPACK_SLOTS };
    send(s, { type: 'work', nodeId: 'copper2' });
    step(s.state, STEP, s.ctx);
    expect(p.trip).toEqual({ nodeId: 'copper2' });
    expect(p.pending).toEqual({ kind: 'visit', id: bank.id });
    expect(count(s, 'backpackFull')).toBe(1);
    runUntil(s, () => count(s, 'banked') > 0, 120);
    expect(s.state.bank).toEqual({ copper_ore: BACKPACK_SLOTS });
    runUntil(s, () => p.task.kind === 'gather', 60);
    expect(p.task).toMatchObject({ kind: 'gather', nodeId: 'copper2' });
  });
});

describe('tapping the bank', () => {
  it('empties the backpack into the bank, and he stays there', () => {
    const s = setup(), p = s.state.player, carried = { copper_ore: 5, birch_logs: 3 };
    p.backpack = { ...carried };
    send(s, { type: 'visit', id: bank.id });
    runUntil(s, () => count(s, 'banked') > 0, 60);
    expect(s.state.bank).toEqual(carried);
    expect(p.backpack).toEqual({});
    expect(s.log).toContainEqual({ type: 'banked', items: carried });
    run(s, 10);
    expect(p.task.kind).toBe('idle');
    expect(dist(p.pos, door)).toBeLessThan(0.01);
  });

  it('with nothing to bank, says so', () => {
    const s = setup();
    send(s, { type: 'visit', id: bank.id });
    runUntil(s, () => count(s, 'nothingToBank') > 0, 60);
    expect(count(s, 'nothingToBank')).toBe(1);
    expect(count(s, 'banked')).toBe(0);
    expect(s.state.bank).toEqual({});
    // tapped again while standing at the door: said again
    send(s, { type: 'visit', id: bank.id });
    run(s, 1);
    expect(count(s, 'nothingToBank')).toBe(2);
  });

  it('during a trip keeps the trip: he still goes back to work afterwards', () => {
    const s = setup(), p = s.state.player, trip = fillUp(s);
    run(s, 1);
    send(s, { type: 'visit', id: bank.id });
    expect(p.trip).toEqual(trip);
    s.state.nodes[trip.nodeId]!.depletedUntil = 0;
    runUntil(s, () => count(s, 'banked') > 0, 120);
    run(s, BANK_PAUSE + 2 * STEP);
    expect(p.pending).toEqual({ kind: 'node', id: trip.nodeId });
  });

  it('a command during the moment at the bank door wins: he does not go back to work', () => {
    const s = setup(), p = s.state.player;
    fillUp(s);
    runUntil(s, () => count(s, 'banked') > 0, 120);
    const to = { x: door.x + 3, z: door.z + 3 };
    send(s, { type: 'walk', to });
    run(s, 10);
    expect(p.trip).toBeNull();
    expect(p.task.kind).toBe('idle');
    expect(dist(p.pos, to)).toBeLessThan(0.5);
  });
});

describe('gathering off the ground where there is a bank (0.0.14)', () => {
  // the village has nothing to pick up yet: four stones on the open ground by the bank, in a layout of its own
  const nav = navFor(VILLAGE);
  const open = [[3, 3], [-3, 3], [0, 6], [4, 7], [-4, 7], [6, 2], [-6, 2], [2, 10]]
    .map(([dx, dz]) => ({ x: door.x + dx!, z: door.z + dz! })).filter(p => nav.walkable(p)).slice(0, 4);
  const STONY: Layout = { ...VILLAGE, pickups: open.map((pos, i) => ({ id: `stone${i + 1}`, kind: 'stone' as const, pos, rot: 0 })) };

  it('with no room for the next one, empties the backpack at the bank and goes back to gathering', () => {
    expect(open).toHaveLength(4);
    const s = setup(STONY), p = s.state.player;
    p.backpack = { copper_ore: BACKPACK_SLOTS - 2 };
    send(s, { type: 'pickup', id: 'stone1' });
    runUntil(s, () => count(s, 'backpackFull') > 0, 120);
    expect(p.backpack).toEqual({ copper_ore: BACKPACK_SLOTS - 2, stone: 2 });
    expect(p.pending).toEqual({ kind: 'visit', id: bank.id });
    const trip = p.trip as { pickupId: string };
    expect(trip.pickupId).toMatch(/^stone/);
    expect(s.state.taken[trip.pickupId]).toBeUndefined();         // the one he was going for, still lying there
    // a save on the way keeps the trip
    expect(deserialize(serialize(s.state), STONY).player.trip).toEqual(p.trip);
    runUntil(s, () => count(s, 'banked') > 0, 120);
    expect(s.state.bank).toEqual({ copper_ore: BACKPACK_SLOTS - 2, stone: 2 });
    run(s, BANK_PAUSE + 2 * STEP);
    expect(p.trip).toBeNull();
    expect(p.pending?.kind).toBe('pickup');
    // back to gathering: the two left, then he waits for the first to come back
    runUntil(s, () => (p.backpack.stone ?? 0) >= 3, 300);
    expect(p.backpack).toEqual({ stone: 3 });
    expect(count(s, 'noStorage') + count(s, 'allGathered') + count(s, 'noRoom')).toBe(0);
  });

  it('tapping a stone with a full backpack goes to the bank first, as a tree does, then gathers', () => {
    const s = setup(STONY), p = s.state.player;
    p.backpack = { copper_ore: BACKPACK_SLOTS };
    send(s, { type: 'pickup', id: 'stone1' });
    expect(count(s, 'noRoom')).toBe(0);
    step(s.state, STEP, s.ctx);
    expect(count(s, 'backpackFull')).toBe(1);
    expect(p.pending).toEqual({ kind: 'visit', id: bank.id });
    expect(p.trip).toEqual({ pickupId: 'stone1' });
    runUntil(s, () => count(s, 'banked') > 0, 120);
    expect(s.state.bank).toEqual({ copper_ore: BACKPACK_SLOTS });
    runUntil(s, () => (p.backpack.stone ?? 0) >= 1, 120);
    expect(p.backpack).toEqual({ stone: 1 });
    expect(count(s, 'noStorage') + count(s, 'allGathered') + count(s, 'noRoom')).toBe(0);
  });

  it('drops a trip back to gathering something the layout no longer has', () => {
    const s = setup(STONY), raw = JSON.parse(serialize(s.state));
    raw.player.trip = { pickupId: 'stone1' }; raw.player.pending = { kind: 'visit', id: bank.id }; raw.player.path = [door];
    raw.player.task = { kind: 'walk' };
    expect(deserialize(JSON.stringify(raw), STONY).player.trip).toEqual({ pickupId: 'stone1' });
    expect(deserialize(JSON.stringify(raw), VILLAGE).player.trip).toBeNull();
    raw.player.trip = { pickupId: 7 };
    expect(deserialize(JSON.stringify(raw), STONY).player.trip).toBeNull();
  });
});

describe('saving mid-trip', () => {
  it('a save made on the way to the bank carries on with the trip after loading', () => {
    const s = setup(), trip = fillUp(s);
    run(s, 2);
    const loaded = { ...setup(), state: deserialize(serialize(s.state), VILLAGE) }, q = loaded.state.player;
    expect(q.trip).toEqual(trip);
    expect(q.pending).toEqual({ kind: 'visit', id: bank.id });
    const carried = { ...q.backpack };
    expect(backpackCount(loaded.state)).toBe(BACKPACK_SLOTS);
    runUntil(loaded, () => count(loaded, 'banked') > 0, 120);
    expect(loaded.state.bank).toEqual(carried);
    expect(q.backpack).toEqual({});
    runUntil(loaded, () => q.task.kind === 'gather', 60);
    // just where he would have gone had the game not been saved and loaded
    runUntil(s, () => s.state.player.task.kind === 'gather', 180);
    expect(q.task).toEqual(s.state.player.task);
    expect(dist(q.pos, s.state.player.pos)).toBeLessThan(1e-9);
  });

  it('a save made during the moment at the bank door carries on: he still goes back to work', () => {
    const s = setup(), trip = fillUp(s);
    s.state.nodes[trip.nodeId]!.depletedUntil = 0;
    runUntil(s, () => count(s, 'banked') > 0, 120);
    const loaded = { ...setup(), state: deserialize(serialize(s.state), VILLAGE) }, q = loaded.state.player;
    expect(q.trip?.leaveAt).toBe(s.state.player.trip?.leaveAt);
    run(loaded, BANK_PAUSE + 2 * STEP);
    expect(q.trip).toBeNull();
    expect(q.pending).toEqual({ kind: 'node', id: trip.nodeId });
  });

  it('drops a trip back to a node that no longer exists, keeping the backpack', () => {
    const s = setup();
    fillUp(s);
    const raw = JSON.parse(serialize(s.state));
    raw.player.trip = { nodeId: 'gone' };
    const back = deserialize(JSON.stringify(raw), VILLAGE);
    expect(back.player.trip).toBeNull();
    expect(back.player.pending).toEqual({ kind: 'visit', id: bank.id });   // he still goes to the bank, and stays
    expect(backpackCount(back)).toBe(BACKPACK_SLOTS);
  });
});

describe('loading a damaged backpack or bank', () => {
  /** A save of a fresh game with some of its fields replaced, as a damaged or hand-edited save would have them. */
  const edited = (edit: (raw: any) => void) => {
    const raw = JSON.parse(serialize(setup().state));
    edit(raw);
    return deserialize(JSON.stringify(raw), VILLAGE);
  };

  it('every item a node gives is a known item, so loading never drops what he gathered', () => {
    for (const r of Object.values(RESOURCES)) expect(Object.hasOwn(ITEMS, r.item), r.id).toBe(true);
  });

  it('a backpack or bank that is not a list of items starts empty', () => {
    for (const bad of [null, 'junk', 7, true, [3, 4]]) {
      const back = edited(raw => { raw.player.backpack = bad; raw.bank = bad; });
      expect(back.player.backpack, JSON.stringify(bad)).toEqual({});
      expect(back.bank, JSON.stringify(bad)).toEqual({});
    }
    const missing = edited(raw => { delete raw.player.backpack; delete raw.bank; });
    expect(missing.player.backpack).toEqual({});
    expect(missing.bank).toEqual({});
  });

  it('keeps known items counted in whole numbers above 0 and drops the rest', () => {
    const bad = { birch_logs: '3', copper_ore: -5, tin_ore: 0, iron_ore: 2.5, oak_logs: null, mystery_gem: 4, toString: 1 };
    const back = edited(raw => {
      raw.player.backpack = { ...bad, birch_logs: 6 };
      raw.bank = { ...bad, copper_ore: 40, oak_logs: 12 };
    });
    expect(back.player.backpack).toEqual({ birch_logs: 6 });
    expect(back.bank).toEqual({ copper_ore: 40, oak_logs: 12 });
    expect(backpackCount(back)).toBe(6);
    const text = edited(raw => { raw.player.backpack = { birch_logs: '3' }; raw.bank = { birch_logs: '0' }; });
    expect(text.player.backpack).toEqual({});
    expect(text.bank).toEqual({});
  });

  it('keeps XP that is a number of 0 or more, and starts anything else from 0', () => {
    const back = edited(raw => { raw.skills = { mining: '500', woodcutting: 1980, fishing: 300 }; });
    expect(back.skills).toEqual({ mining: 0, woodcutting: 1980 });
    expect(edited(raw => { raw.skills = { mining: -3, woodcutting: null }; }).skills).toEqual({ mining: 0, woodcutting: 0 });
    expect(edited(raw => { raw.skills = null; }).skills).toEqual({ mining: 0, woodcutting: 0 });
  });

  it('after loading a broken backpack he works, fills it and banks real counts', () => {
    for (const bad of [null, 'junk', { birch_logs: '3' }, { birch_logs: -5 }, { mystery_gem: 4 }]) {
      const s = setup();
      s.state = edited(raw => { raw.player.backpack = bad; raw.bank = { birch_logs: '03', copper_ore: 40 }; });
      fillUp(s);
      expect(s.state.player.backpack, JSON.stringify(bad)).toEqual({ birch_logs: BACKPACK_SLOTS });
      runUntil(s, () => count(s, 'banked') > 0, 120);
      expect(s.state.bank, JSON.stringify(bad)).toEqual({ birch_logs: BACKPACK_SLOTS, copper_ore: 40 });
    }
  });
});
