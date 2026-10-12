// The camp below the falls, where a new game starts (src/world/camp.ts): he washes up with nothing, the camp is bare,
// everything to work or pick up is in reach from where he washes up, the pool and the river are not walkable, and
// picking up the wreck completes the first goal, however full the backpack got first.
import { describe, expect, it } from 'vitest';
import { canDrop, createState, currentGoal, goalMet, owned, SAVE_VERSION } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { deserialize, serialize } from '../src/core/save';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, inArea, type Vec2 } from '../src/world/layout';
import { navFor, distToLine } from '../src/world/nav';
import { goPickup, PICKUP_REACH, reachFor } from '../src/actors/player';
import { applyCommands, type Command } from '../src/systems/commands';
import { backpackCount } from '../src/systems/backpack';
import { RESOURCES, ITEMS } from '../src/data/skills';
import { GOALS } from '../src/data/goals';
import { PICKUPS, PICKUP_PAUSE, type PickupKind } from '../src/data/pickups';
import { BACKPACK_SLOTS } from '../src/data/hauling';

const nav = navFor(CAMP);
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const pickups = CAMP.pickups!;
const ofKind = (kind: PickupKind) => pickups.filter(p => p.kind === kind);
const WRECK: PickupKind[] = ['plank', 'tarp', 'crate', 'book'];

function setup(seed = 3) {
  const state = createState(CAMP, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, ctx: { layout: CAMP, rng: createRng(seed), events } };
}
type Setup = ReturnType<typeof setup>;
const send = (s: Setup, c: Command) => applyCommands(s.state, CAMP, [c], s.events);
const run = (s: Setup, seconds: number) => { for (let t = 0; t < seconds; t += STEP) step(s.state, STEP, s.ctx); };
const runUntil = (s: Setup, done: () => boolean, max: number) => { for (let t = 0; t < max && !done(); t += STEP) step(s.state, STEP, s.ctx); };
/** Tap a pickup and wait until it is in his backpack (or a minute passes). */
function pickUp(s: Setup, id: string): void {
  send(s, { type: 'pickup', id });
  runUntil(s, () => s.log.some(e => e.type === 'pickedUp' && e.id === id) && s.state.player.task.kind === 'idle', 60);
}
/** Pick up every piece of the wreck, one after another. */
const salvage = (s: Setup) => { for (const kind of WRECK) for (const p of ofKind(kind)) pickUp(s, p.id); };

describe('the camp below the falls', () => {
  it('starts him on open ground by the pool, with a level-1 tree and rock to work', () => {
    expect(nav.walkable(CAMP.start)).toBe(true);
    expect(dist(CAMP.start, CAMP.falls!.pool.pos)).toBeLessThan(CAMP.falls!.pool.radius + 4);
    const level1 = (skill: string) => CAMP.nodes.some(n => RESOURCES[n.resource]!.skill === skill && RESOURCES[n.resource]!.level === 1);
    expect(level1('woodcutting')).toBe(true);
    expect(level1('mining')).toBe(true);
    expect(CAMP.buildings).toEqual([]);                        // no village here
  });

  it('can reach a working spot beside every tree and rock from where he starts', () => {
    for (const n of CAMP.nodes) {
      expect(RESOURCES[n.resource], n.id).toBeDefined();
      expect(inArea(CAMP.village, n.pos), n.id).toBe(true);
      let found = false;
      for (let k = 0; k < 36 && !found; k++) {
        const a = k / 36 * Math.PI * 2, r = reachFor(n), stand = { x: n.pos.x + Math.cos(a) * r, z: n.pos.z + Math.sin(a) * r };
        found = nav.walkable(stand) && nav.findPath(CAMP.start, stand) !== null;
      }
      expect(found, n.id).toBe(true);
    }
  });

  it('keeps the pool and the river out of the way, and lets him walk right to the water', () => {
    const { pool } = CAMP.falls!;
    expect(nav.walkable(pool.pos)).toBe(false);
    for (const p of CAMP.river.points) expect(nav.walkable(p)).toBe(false);
    // all along the bank, the last walkable step towards the river is on dry land right at its edge
    const half = CAMP.river.width / 2;
    for (const z of [-5, -2, 0, 2, 5, 8, 11]) expect(nav.findPath(CAMP.start, { x: -12.2, z }), `z ${z}`).not.toBeNull();
    let checked = 0;
    for (let z = -6; z <= 12; z += 0.1) {
      let x = -12.2;
      if (!nav.walkable({ x, z })) continue;                  // a bush or a wreck rib in the way
      while (nav.walkable({ x: x - 0.02, z })) x -= 0.02;
      const edge = distToLine({ x, z }, CAMP.river.points) - half;
      if (edge > 2) continue;                                 // stopped by something else on the bank
      expect(edge, `z ${z.toFixed(1)}`).toBeGreaterThan(0);
      expect(edge, `z ${z.toFixed(1)}`).toBeLessThan(0.8);
      checked++;
    }
    expect(checked).toBeGreaterThan(150);
    // a step into the water is inside the land's bounds, but not walkable
    for (const wet of [{ x: -15.2, z: 2 }, { x: -14.6, z: -2 }, { x: -15.4, z: 6 }]) {
      expect(inArea(CAMP.village, wet)).toBe(true);
      expect(distToLine(wet, CAMP.river.points)).toBeLessThan(half);
      expect(nav.walkable(wet), `${wet.x}, ${wet.z}`).toBe(false);
    }
    for (const n of CAMP.nodes) expect(dist(n.pos, pool.pos), n.id).toBeGreaterThan(pool.radius + n.radius + 0.5);
  });

  it('sent across the river, he walks to the near bank opposite where was tapped', () => {
    // the nearest walkable spot, checked against every walkable point on a fine grid
    const open: Vec2[] = [];
    for (let x = CAMP.village.minX; x <= CAMP.village.maxX; x += 0.1) for (let z = CAMP.village.minZ; z <= CAMP.village.maxZ; z += 0.1) {
      if (nav.walkable({ x, z })) open.push({ x, z });
    }
    for (const far of [{ x: -25, z: 3 }, { x: -20, z: -8 }, { x: -18, z: -5 }, { x: -31.9, z: -0.06 }, { x: -22, z: 10 }, { x: -60, z: 40 }]) {
      const spot = nav.nearestWalkable(far), best = Math.min(...open.map(p => dist(p, far)));
      expect(nav.walkable(spot), `${far.x}, ${far.z}`).toBe(true);
      expect(dist(spot, far), `${far.x}, ${far.z}`).toBeLessThan(best + 0.3);      // within a cell of the nearest
    }
    // tapped across from the middle of the bank: he ends up on the bank facing it, not far down it
    const s = setup();
    s.state.player.pos = { x: -6, z: -4 };
    send(s, { type: 'walk', to: { x: -25, z: 3 } });
    expect(s.log.some(e => e.type === 'noPath')).toBe(false);
    runUntil(s, () => s.state.player.task.kind === 'idle', 30);
    const end = s.state.player.pos;
    expect(Math.abs(end.z - 3)).toBeLessThan(1);
    expect(distToLine(end, CAMP.river.points) - CAMP.river.width / 2).toBeLessThan(1);
  });

  it('starts bare: no tent and no campfire in the way, their spots kept for later, and no tools', () => {
    const state = createState(CAMP);
    expect(state.tools).toEqual({ axe: false, pick: false });
    expect(state.hasBook).toBe(false);
    expect(CAMP.hearthModel).toBeNull();
    expect(nav.walkable(CAMP.hearth.pos)).toBe(true);
    expect(nav.walkable(CAMP.camp!.tent.pos)).toBe(true);
    // the spots stay clear of trees, rocks and things to pick up, ready for building on
    for (const spot of [CAMP.hearth.pos, CAMP.camp!.tent.pos]) {
      for (const n of CAMP.nodes) expect(dist(n.pos, spot), n.id).toBeGreaterThan(2);
      for (const p of pickups) expect(dist(p.pos, spot), p.id).toBeGreaterThan(1.4);
    }
    // the village keeps its tools and its hearth
    expect(createState(VILLAGE).tools).toEqual({ axe: true, pick: true });
    expect(navFor(VILLAGE).walkable(VILLAGE.hearth.pos)).toBe(false);
  });

  it('refuses to chop without an axe or mine without a pickaxe, says why, and he stays put', () => {
    const s = setup(), start = { ...s.state.player.pos };
    send(s, { type: 'work', nodeId: 'camp_birch1' });
    expect(s.log).toContainEqual({ type: 'needTool', tool: 'axe', skill: 'woodcutting' });
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    expect(s.log).toContainEqual({ type: 'needTool', tool: 'pick', skill: 'mining' });
    run(s, 5);
    expect(s.state.player.task.kind).toBe('idle');
    expect(s.state.player.path).toEqual([]);
    expect(s.state.player.pos).toEqual(start);
    expect(s.log.some(e => e.type === 'itemGained' || e.type === 'strike')).toBe(false);
    // a save that somehow has him chopping without an axe stops him
    const odd = setup();
    odd.state.player.task = { kind: 'gather', nodeId: 'camp_birch1', progress: 0 };
    run(odd, 1);
    expect(odd.state.player.task.kind).toBe('idle');
    expect(odd.log.some(e => e.type === 'needTool')).toBe(true);
  });

  it('chops birch into the backpack once he has an axe, and says so when the backpack is full with nowhere to store it', () => {
    const s = setup();
    s.state.tools.axe = true;                                   // he makes one in a later update
    send(s, { type: 'work', nodeId: 'camp_birch1' });
    runUntil(s, () => (s.state.player.backpack.birch_logs ?? 0) >= 5, 120);
    expect(s.state.player.backpack.birch_logs ?? 0).toBeGreaterThanOrEqual(5);
    runUntil(s, () => s.log.some(e => e.type === 'noStorage'), 900);
    expect(backpackCount(s.state)).toBe(BACKPACK_SLOTS);
    expect(s.log.filter(e => e.type === 'noStorage').length).toBe(1);
    expect(s.state.player.task.kind).toBe('idle');
    expect(nav.walkable(s.state.player.pos)).toBe(true);
  });
});

describe('the wreck, stones and branches', () => {
  it('lays out the wreck along the bank where he washes up, and stones and branches round the clearing', () => {
    for (const p of pickups) {
      expect(PICKUPS[p.kind], p.id).toBeDefined();
      expect(inArea(CAMP.village, p.pos), p.id).toBe(true);
      // on dry land, out of the pool and the river
      expect(dist(p.pos, CAMP.falls!.pool.pos), p.id).toBeGreaterThan(CAMP.falls!.pool.radius);
      expect(distToLine(p.pos, CAMP.river.points), p.id).toBeGreaterThan(CAMP.river.width / 2);
    }
    expect(new Set(pickups.map(p => p.id)).size).toBe(pickups.length);
    const planks = ofKind('plank').length + ofKind('crate').length * (PICKUPS.crate.gives as { count: number }).count;
    expect(planks).toBeGreaterThanOrEqual(GOALS[0]!.needs.plank!);
    expect(ofKind('plank').length).toBeGreaterThanOrEqual(4);
    expect(ofKind('tarp')).toHaveLength(1);
    expect(ofKind('crate')).toHaveLength(1);
    expect(ofKind('book')).toHaveLength(1);
    expect(dist(ofKind('book')[0]!.pos, CAMP.start)).toBeLessThan(2.5);
    for (const kind of WRECK) for (const p of ofKind(kind)) expect(dist(p.pos, CAMP.start), p.id).toBeLessThan(10);
    // a couple of planks right at the water's edge
    const edge = (p: Vec2) => Math.min(dist(p, CAMP.falls!.pool.pos) - CAMP.falls!.pool.radius, distToLine(p, CAMP.river.points) - CAMP.river.width / 2);
    expect(ofKind('plank').filter(p => edge(p.pos) < 0.8).length).toBeGreaterThanOrEqual(2);
    expect(ofKind('stone').length).toBeGreaterThanOrEqual(5);
    expect(ofKind('branch').length).toBeGreaterThanOrEqual(5);
    // nothing he needs is hidden in the trees or bushes
    for (const p of pickups) for (const b of CAMP.bushes) expect(dist(p.pos, b), p.id).toBeGreaterThan(0.8);
  });

  it('can reach every pickup from where he starts, and stands right beside it', () => {
    for (const p of pickups) {
      const s = setup();
      expect(goPickup(s.state, CAMP, p.id), p.id).toBe(true);
      const stand = s.state.player.path.at(-1)!;
      expect(dist(stand, p.pos), p.id).toBeLessThanOrEqual(PICKUP_REACH.at(-1)! + 1e-6);
      expect(nav.walkable(stand), p.id).toBe(true);
    }
  });

  it('picking one up walks him over, stops him a moment beside it, and puts it in his backpack', () => {
    const s = setup(), plank = ofKind('plank')[0]!;
    send(s, { type: 'pickup', id: plank.id });
    expect(s.state.player.pending).toEqual({ kind: 'pickup', id: plank.id });
    runUntil(s, () => s.state.player.task.kind === 'pickup', 30);
    const stoppedAt = s.state.time, pos = { ...s.state.player.pos };
    expect(dist(pos, plank.pos)).toBeLessThanOrEqual(PICKUP_REACH.at(-1)! + 1e-6);
    expect(s.state.player.backpack.plank ?? 0).toBe(0);         // not yet: he stops a moment first
    runUntil(s, () => s.state.player.task.kind !== 'pickup', 5);
    expect(s.state.time - stoppedAt).toBeCloseTo(PICKUP_PAUSE, 1);
    expect(s.state.player.pos).toEqual(pos);                    // stood still while he picked it up
    expect(s.state.player.backpack).toEqual({ plank: 1 });
    expect(s.state.taken[plank.id]).toBeNull();                 // gone from the ground, for good
    expect(s.log).toContainEqual({ type: 'pickedUp', id: plank.id, kind: 'plank', item: 'plank', count: 1 });
    expect(s.log).toContainEqual({ type: 'itemGained', item: 'plank', count: 1 });
    // it isn't there to pick up again
    send(s, { type: 'pickup', id: plank.id });
    expect(s.state.player.task.kind).toBe('idle');
    expect(s.state.player.pending).toBeNull();
  });

  it('the smashed crate gives planks, and every pickup gives a known item', () => {
    const s = setup();
    pickUp(s, ofKind('crate')[0]!.id);
    expect(s.state.player.backpack).toEqual({ plank: 2 });
    for (const def of Object.values(PICKUPS)) if (def.gives !== 'book') expect(Object.hasOwn(ITEMS, def.gives.item), def.kind).toBe(true);
  });

  it('the book takes no backpack slot: it sets hasBook', () => {
    const s = setup();
    pickUp(s, ofKind('book')[0]!.id);
    expect(s.state.hasBook).toBe(true);
    expect(backpackCount(s.state)).toBe(0);
    expect(s.log).toContainEqual({ type: 'pickedUp', id: 'book1', kind: 'book', item: null, count: 1 });
  });

  it('the wreck never comes back; stones and branches lie at their spot again after a while', () => {
    const s = setup(), plank = ofKind('plank')[0]!, stone = ofKind('stone')[0]!, branch = ofKind('branch')[0]!;
    for (const p of [plank, stone, branch]) pickUp(s, p.id);
    expect(s.state.player.backpack).toEqual({ plank: 1, stone: 1, branch: 1 });
    expect(Object.keys(s.state.taken).sort()).toEqual([plank.id, stone.id, branch.id].sort());
    expect(PICKUPS.stone.respawn).toBeGreaterThanOrEqual(90);
    expect(PICKUPS.branch.respawn).toBeLessThanOrEqual(120);
    run(s, Math.max(PICKUPS.stone.respawn!, PICKUPS.branch.respawn!) + 1);
    expect(s.state.taken).toEqual({ [plank.id]: null });
    expect(s.log).toContainEqual({ type: 'pickupBack', id: stone.id });
    expect(s.log).toContainEqual({ type: 'pickupBack', id: branch.id });
    run(s, 3600);
    expect(plank.id in s.state.taken).toBe(true);
    pickUp(s, stone.id);                                        // and can be picked up again
    expect(s.state.player.backpack.stone).toBe(2);
  });

  it('with no room in the backpack he says so and stays put; the book still fits', () => {
    const s = setup(), start = { ...s.state.player.pos };
    s.state.player.backpack = { stone: BACKPACK_SLOTS };
    send(s, { type: 'pickup', id: ofKind('plank')[0]!.id });
    expect(s.log).toContainEqual({ type: 'noRoom' });
    expect(s.state.player.task.kind).toBe('idle');
    run(s, 2);
    expect(s.state.player.pos).toEqual(start);
    pickUp(s, ofKind('book')[0]!.id);
    expect(s.state.hasBook).toBe(true);
  });

  it('salvaging the whole wreck meets the first goal, and the card moves on to the fire', () => {
    const s = setup();
    expect(currentGoal(s.state)).toBe(GOALS[0]);
    expect(GOALS[0]!.title).toBe('Salvage the wreck');
    pickUp(s, 'book1');
    expect(currentGoal(s.state)).toBe(GOALS[0]);               // part of it is not enough
    salvage(s);
    expect(owned(s.state, 'plank')).toBeGreaterThanOrEqual(6);
    expect(owned(s.state, 'tarp')).toBe(1);
    expect(owned(s.state, 'book')).toBe(1);
    expect(goalMet(s.state, GOALS[0]!)).toBe(true);
    expect(currentGoal(s.state).id).toBe('campfire');
    expect(goalMet(s.state, currentGoal(s.state))).toBe(false);
    // stones for the fire, gathered by hand
    for (const p of ofKind('stone').slice(0, GOALS[1]!.needs.stone!)) pickUp(s, p.id);
    expect(goalMet(s.state, GOALS[1]!)).toBe(true);
    // all met: the card stays on the last goal, which then says it has everything
    expect(currentGoal(s.state)).toBe(GOALS.at(-1));
    expect(goalMet(s.state, currentGoal(s.state))).toBe(true);
    expect(nav.walkable(s.state.player.pos)).toBe(true);
  });

  it('the card counts what is banked as well as carried, and goes back a goal if something is lost', () => {
    const s = setup();
    s.state.hasBook = true; s.state.bank = { plank: 4, tarp: 1 }; s.state.player.backpack = { plank: 2 };
    expect(currentGoal(s.state).id).toBe('campfire');
    s.state.player.backpack = { plank: 1 };
    expect(currentGoal(s.state).id).toBe('salvage');
  });

  it('drops what he can find again from the backpack, but keeps the wreck', () => {
    const s = setup(), task = { ...s.state.player.task };
    s.state.player.backpack = { stone: 5, branch: 2, plank: 3, tarp: 1, birch_logs: 4 };
    send(s, { type: 'drop', item: 'stone', count: 1 });
    send(s, { type: 'drop', item: 'branch', count: 99 });          // more than he has: all of it
    send(s, { type: 'drop', item: 'birch_logs', count: 4 });
    expect(s.state.player.backpack).toEqual({ stone: 4, plank: 3, tarp: 1 });
    expect(s.log).toContainEqual({ type: 'dropped', item: 'stone', count: 1 });
    expect(s.log).toContainEqual({ type: 'dropped', item: 'branch', count: 2 });
    send(s, { type: 'drop', item: 'plank', count: 3 });
    send(s, { type: 'drop', item: 'tarp', count: 1 });
    expect(s.state.player.backpack).toEqual({ stone: 4, plank: 3, tarp: 1 });
    expect(s.log).toContainEqual({ type: 'cantDrop', item: 'plank' });
    expect(s.log).toContainEqual({ type: 'cantDrop', item: 'tarp' });
    // nothing to drop, or nonsense: nothing happens
    const before = s.log.length;
    for (const [item, count] of [['copper_ore', 1], ['stone', 0], ['stone', -2], ['stone', NaN], ['__proto__', 1]] as const) send(s, { type: 'drop', item, count });
    expect(s.log.length).toBe(before);
    expect(s.state.player.backpack).toEqual({ stone: 4, plank: 3, tarp: 1 });
    expect(s.state.player.task).toEqual(task);                  // dropping doesn't send him anywhere
    expect([canDrop('stone'), canDrop('branch'), canDrop('birch_logs'), canDrop('copper_ore')]).toEqual([true, true, true, true]);
    expect([canDrop('plank'), canDrop('tarp')]).toEqual([false, false]);
  });

  it("what can't be dropped never fills the backpack, so there is always room for the rest of the wreck", () => {
    let kept = 0;
    for (const p of pickups) {
      const g = PICKUPS[p.kind].gives;
      if (g !== 'book' && !canDrop(g.item)) kept += g.count;
    }
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(BACKPACK_SLOTS);
    for (const p of pickups) {
      const def = PICKUPS[p.kind];
      if (def.respawn === null && def.gives !== 'book') expect(canDrop(def.gives.item), p.id).toBe(false);
    }
  });

  it('a backpack filled with stones and branches before the wreck can be made room in, and the wreck salvaged', () => {
    const s = setup();
    pickUp(s, ofKind('plank')[0]!.id); pickUp(s, ofKind('tarp')[0]!.id);
    // gather every stone and branch, again and again as they come back, until the backpack is full
    const loose = [...ofKind('stone'), ...ofKind('branch')];
    for (let round = 0; round < 6 && backpackCount(s.state) < BACKPACK_SLOTS; round++) {
      for (const p of loose) if (backpackCount(s.state) < BACKPACK_SLOTS) pickUp(s, p.id);
      run(s, Math.max(PICKUPS.stone.respawn!, PICKUPS.branch.respawn!) + 1);
    }
    expect(backpackCount(s.state)).toBe(BACKPACK_SLOTS);
    // full: the next plank is refused and he stays put
    const at = { ...s.state.player.pos };
    send(s, { type: 'pickup', id: ofKind('plank')[1]!.id });
    expect(s.log.at(-1)).toEqual({ type: 'noRoom' });
    run(s, 2);
    expect(s.state.player.pos).toEqual(at);
    // he drops the stones, and the rest of the wreck fits
    send(s, { type: 'drop', item: 'stone', count: BACKPACK_SLOTS });
    salvage(s);
    expect(goalMet(s.state, GOALS[0]!)).toBe(true);
    expect(currentGoal(s.state).id).toBe('campfire');
    expect(backpackCount(s.state)).toBeLessThanOrEqual(BACKPACK_SLOTS);
  });

  it('things lying on the ground never block walking', () => {
    const open = pickups.filter(p => nav.walkable(p.pos));
    expect(open.length).toBeGreaterThan(pickups.length / 2);
    for (const p of open) expect(nav.findPath(CAMP.start, p.pos), p.id).not.toBeNull();
  });
});

describe('saving the camp', () => {
  it('round-trips the tools, the book, what was taken and a pickup under way', () => {
    const s = setup();
    pickUp(s, 'book1'); pickUp(s, ofKind('stone')[0]!.id);
    send(s, { type: 'pickup', id: ofKind('plank')[1]!.id });
    run(s, 0.5);
    s.state.tools.axe = true;
    const back = deserialize(serialize(s.state), CAMP);
    expect(back).toEqual(s.state);
    expect(back.player.pending).toEqual({ kind: 'pickup', id: ofKind('plank')[1]!.id });
    const loaded = { ...setup(), state: back };
    runUntil(loaded, () => loaded.state.player.backpack.plank === 1, 30);
    expect(loaded.state.player.backpack.plank).toBe(1);
  });

  it('gives a version 4 save (before tools) both tools, no book and nothing taken; work carries on', () => {
    const s = setup();
    s.state.tools = { axe: true, pick: true };
    send(s, { type: 'work', nodeId: 'camp_birch2' });
    run(s, 15);
    const { tools: _t, hasBook: _b, taken: _k, ...rest } = JSON.parse(serialize(s.state));
    const back = deserialize(JSON.stringify({ ...rest, version: 4 }), CAMP);
    expect(SAVE_VERSION).toBe(5);
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.tools).toEqual({ axe: true, pick: true });
    expect(back.hasBook).toBe(false);
    expect(back.taken).toEqual({});
    expect(back.player.task).toEqual(s.state.player.task);
    expect(back.skills).toEqual(s.state.skills);
    // and the village's old saves too
    const v4 = JSON.parse(serialize(createState(VILLAGE, 2)));
    delete v4.tools; delete v4.hasBook; delete v4.taken; v4.version = 4;
    expect(deserialize(JSON.stringify(v4), VILLAGE).tools).toEqual({ axe: true, pick: true });
  });

  it('a version 4 camp save left chopping until the backpack was full can drop the logs and salvage the wreck', () => {
    // 0.0.11: he chopped at the camp until the 28-slot backpack was full, then stood still with nowhere to store it
    const old = setup();
    old.state.tools = { axe: true, pick: true };
    send(old, { type: 'work', nodeId: 'camp_birch1' });
    runUntil(old, () => old.log.some(e => e.type === 'noStorage'), 900);
    expect(old.state.player.backpack).toEqual({ birch_logs: BACKPACK_SLOTS });
    const { tools: _t, hasBook: _b, taken: _k, ...rest } = JSON.parse(serialize(old.state));
    const s = { ...setup(), state: deserialize(JSON.stringify({ ...rest, version: 4 }), CAMP) };
    expect(s.state.player.backpack).toEqual({ birch_logs: BACKPACK_SLOTS });   // what he carried is kept
    send(s, { type: 'pickup', id: ofKind('plank')[0]!.id });
    expect(s.log.at(-1)).toEqual({ type: 'noRoom' });
    send(s, { type: 'drop', item: 'birch_logs', count: BACKPACK_SLOTS - 10 });  // keeps some for later
    const dropped = s.log.length;
    salvage(s);
    expect(goalMet(s.state, GOALS[0]!)).toBe(true);
    expect(s.state.player.backpack.birch_logs).toBe(10);
    expect(s.log.slice(dropped).some(e => e.type === 'noRoom')).toBe(false);
  });

  it('repairs damaged tools, book and taken pickups, and drops a pickup that is gone', () => {
    const raw = JSON.parse(serialize(createState(CAMP, 4)));
    raw.tools = { axe: 'yes', pick: true, sword: true };
    raw.hasBook = 'true';
    raw.taken = { plank1: null, stone1: 120, ghost: null, branch1: 'soon', stone2: true };
    raw.player.task = { kind: 'pickup', id: 'plank1', doneAt: 10 };     // already taken
    const back = deserialize(JSON.stringify(raw), CAMP);
    expect(back.tools).toEqual({ axe: false, pick: true });
    expect(back.hasBook).toBe(false);
    expect(back.taken).toEqual({ plank1: null, stone1: 120 });
    expect(back.player.task.kind).toBe('idle');
    for (const bad of [null, 'junk', [1]]) {
      const b = JSON.parse(serialize(createState(CAMP, 4))); b.tools = bad; b.taken = bad;
      const s = deserialize(JSON.stringify(b), CAMP);
      expect(s.tools).toEqual({ axe: false, pick: false });
      expect(s.taken).toEqual({});
    }
  });
});
