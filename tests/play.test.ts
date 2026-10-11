import { describe, expect, it, vi } from 'vitest';
import { createState, SAVE_VERSION } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { step } from '../src/sim';
import { VILLAGE, type NodeSpot } from '../src/world/layout';
import { navFor, NavGrid } from '../src/world/nav';
import { walkTo, goWork, reachFor } from '../src/actors/player';
import { serialize, deserialize } from '../src/core/save';
import { RESOURCES } from '../src/data/skills';
import { SWINGS } from '../src/data/animation';
import { XP_TABLE } from '../src/data/xp';
import { MOVE_ON_DELAY } from '../src/systems/gathering';

function setup(seed = 1) {
  const state = createState(VILLAGE, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, ctx: { layout: VILLAGE, rng: createRng(seed), events } };
}
const run = (s: ReturnType<typeof setup>, seconds: number) => { for (let t = 0; t < seconds; t += STEP) step(s.state, STEP, s.ctx); };
/** Step until `done` (or `max` seconds pass); returns the seconds it took. */
const runUntil = (s: ReturnType<typeof setup>, done: () => boolean, max: number) => {
  let t = 0;
  for (; t < max && !done(); t += STEP) step(s.state, STEP, s.ctx);
  return t;
};
const copper = VILLAGE.nodes.find(n => n.id === 'copper1')!;
const birch = VILLAGE.nodes.find(n => n.id === 'birch1')!;
/** Swinging at a node that hasn't run out, whichever node it is (he moves on from trees that fall). */
const swinging = (s: ReturnType<typeof setup>) => {
  const task = s.state.player.task;
  return task.kind === 'gather' && !s.state.nodes[task.nodeId]!.depletedUntil;
};
const strikesPerSwing = (s: ReturnType<typeof setup>, cycle: number) => {
  const strikes0 = s.log.filter(e => e.type === 'strike').length;
  let swung = 0, starts = 0, was = false;         // time spent swinging, not walking or waiting for a node to grow back
  for (let t = 0; t < 120; t += STEP) {
    const now = swinging(s);
    if (now) swung += STEP;
    if (now && !was) starts++;
    was = now;
    step(s.state, STEP, s.ctx);
  }
  const strikes = s.log.filter(e => e.type === 'strike').length - strikes0;
  // each time swinging starts again (the node grew back, or he reached the next one) the swing starts fresh, so its
  // strike comes sooner than a full cycle would
  expect(starts).toBeGreaterThan(1);
  expect(strikes).toBeGreaterThanOrEqual(Math.floor(swung / cycle) - 1);
  expect(strikes).toBeLessThanOrEqual(Math.ceil(swung / cycle) + starts + 1);
};

describe('walking', () => {
  it('reaches a tapped spot and stops', () => {
    const s = setup();
    expect(walkTo(s.state, VILLAGE, { x: 3, z: 5 })).toBe(true);
    run(s, 20);
    expect(s.state.player.task.kind).toBe('idle');
    expect(Math.hypot(s.state.player.pos.x - 3, s.state.player.pos.z - 5)).toBeLessThan(0.01);
  });
  it('stops at the nearest open spot when the tap is inside a rock, a building or off the land', () => {
    const s = setup(), nav = navFor(VILLAGE);
    for (const target of [copper.pos, VILLAGE.buildings[0]!.pos, { x: 999, z: -999 }]) {
      walkTo(s.state, VILLAGE, target);
      run(s, 60);
      expect(nav.walkable(s.state.player.pos)).toBe(true);
    }
  });
});

describe('mining', () => {
  it('walks to the rock, stands within reach and starts working', () => {
    const s = setup();
    goWork(s.state, VILLAGE, 'copper1');
    run(s, 40);
    expect(s.state.player.task.kind).toBe('gather');
    expect(Math.hypot(s.state.player.pos.x - copper.pos.x, s.state.player.pos.z - copper.pos.z)).toBeCloseTo(reachFor(copper), 1);
  });
  it('produces ore at roughly the prototype rate, with xp to match', () => {
    const s = setup(3);
    goWork(s.state, VILLAGE, 'copper1');
    run(s, 40);
    run(s, 600);                                    // ten minutes of play
    const ore = s.state.bank.copper_ore ?? 0;
    const r = RESOURCES.copper_rock!;
    expect(ore).toBeGreaterThan(600 / r.time * 0.6);
    expect(ore).toBeLessThan(600 / r.time * 1.3);
    expect(s.state.skills.mining).toBe(ore * r.xp);
    expect(s.log.some(e => e.type === 'levelUp')).toBe(true);
    expect(s.log.filter(e => e.type === 'nodeDepleted').length).toBeGreaterThan(0);
  });
  it('strikes once per swing at the animation impact time', () => {
    const s = setup();
    goWork(s.state, VILLAGE, 'copper1');
    run(s, 40);
    strikesPerSwing(s, SWINGS.mining.cycle);
  });
});

describe('woodcutting', () => {
  it('walks to a birch and stands the axe reach from the trunk, further back from a thicker oak', () => {
    const s = setup();
    goWork(s.state, VILLAGE, 'birch1');
    runUntil(s, () => s.state.player.task.kind === 'gather', 40);     // on arrival: he moves on once it falls
    expect(s.state.player.task).toMatchObject({ kind: 'gather', nodeId: 'birch1' });
    expect(Math.hypot(s.state.player.pos.x - birch.pos.x, s.state.player.pos.z - birch.pos.z)).toBeCloseTo(reachFor(birch), 1);
    const oak = VILLAGE.nodes.find(n => n.id === 'oak1')!;
    expect(reachFor(oak)).toBeGreaterThan(reachFor(birch));
  });
  it('chops logs at roughly the prototype rate, for Woodcutting xp only, and trees fall and grow back', () => {
    const s = setup(4);
    goWork(s.state, VILLAGE, 'birch1');
    run(s, 40);
    run(s, 600);
    const logs = s.state.bank.birch_logs ?? 0, r = RESOURCES.birch_tree!;
    expect(logs).toBeGreaterThan(600 / r.time * 0.55);
    expect(logs).toBeLessThan(600 / r.time * 1.3);
    expect(s.state.skills.woodcutting).toBe(logs * r.xp);
    expect(s.state.skills.mining).toBe(0);
    expect(s.log).toContainEqual({ type: 'levelUp', skill: 'woodcutting', level: 2 });
    expect(s.log.filter(e => e.type === 'nodeDepleted').length).toBeGreaterThan(0);
    expect(s.log.filter(e => e.type === 'nodeRespawned').length).toBeGreaterThan(0);
  });
  it('strikes once per chop at the animation impact time', () => {
    const s = setup(2);
    goWork(s.state, VILLAGE, 'birch1');
    run(s, 40);
    strikesPerSwing(s, SWINGS.woodcutting.cycle);
  });
});

describe('moving on', () => {
  it.each([['birch1', 'birch2'], ['oak1', 'oak2']])('when %s falls, walks to the nearest free tree of its kind (%s) and chops that', (id, nearest) => {
    const s = setup(6), from = VILLAGE.nodes.find(n => n.id === id)!;
    s.state.skills.woodcutting = XP_TABLE[RESOURCES[from.resource]!.level]!;
    goWork(s.state, VILLAGE, id);
    runUntil(s, () => !!s.state.nodes[id]!.depletedUntil, 900);
    expect(s.state.nodes[id]!.depletedUntil).toBeGreaterThan(0);
    // he waits long enough to see it fall, then sets off well before it grows back
    const waited = runUntil(s, () => s.state.player.pending !== null, 1.5);
    expect(waited).toBeGreaterThanOrEqual(MOVE_ON_DELAY - STEP);
    expect(waited).toBeLessThan(1.5);
    const pending = s.state.player.pending;
    expect(pending?.kind).toBe('node');
    // the closest standing tree of its kind from where he waited, measured to where he would stand to chop it
    const at = s.state.player.pos, gap = (n: NodeSpot) => Math.hypot(n.pos.x - at.x, n.pos.z - at.z) - reachFor(n);
    const free = VILLAGE.nodes.filter(n => n.resource === from.resource && s.state.nodes[n.id]!.depletedUntil === 0);
    expect(free.length).toBeGreaterThan(1);
    const closest = free.reduce((a, b) => gap(b) < gap(a) ? b : a);
    expect(closest.id).toBe(nearest);
    expect(pending!.id).toBe(closest.id);
    const to = VILLAGE.nodes.find(n => n.id === pending!.id)!;
    expect(s.state.player.task.kind).toBe('walk');
    const seen = s.log.length;
    runUntil(s, () => s.log.slice(seen).some(e => e.type === 'strike' && e.nodeId === to.id), 20);
    expect(s.state.player.task).toMatchObject({ kind: 'gather', nodeId: to.id });
    expect(s.state.nodes[id]!.depletedUntil).toBeGreaterThan(0);        // got there before the first one grew back
  });

  it('spends little of ten minutes chopping waiting at stumps or walking, and never wanders between trees', () => {
    const s = setup(4), r = RESOURCES.birch_tree!;
    goWork(s.state, VILLAGE, 'birch1');
    runUntil(s, () => s.state.player.task.kind === 'gather', 40);
    const count = (type: GameEvent['type']) => s.log.filter(e => e.type === type).length;
    const falls0 = count('nodeDepleted'), arrivals0 = count('arrived');
    let waiting = 0, walking = 0;
    const worked = new Set<string>();
    for (let t = 0; t < 600; t += STEP) {
      const task = s.state.player.task;
      if (task.kind === 'gather') {
        worked.add(task.nodeId);
        if (s.state.nodes[task.nodeId]!.depletedUntil > 0) waiting += STEP;
      } else if (task.kind === 'walk') walking += STEP;
      step(s.state, STEP, s.ctx);
    }
    expect(waiting / 600).toBeLessThan(0.12);
    expect(walking / 600).toBeLessThan(0.08);         // about 5%; going to a farther tree first would be over 10%
    expect(s.state.bank.birch_logs ?? 0).toBeGreaterThan(600 / r.time * 0.7);
    expect([...worked].every(id => VILLAGE.nodes.find(n => n.id === id)!.resource === 'birch_tree')).toBe(true);
    expect(worked.size).toBeGreaterThan(1);
    // every walk follows a tree falling: no going back and forth between trees
    expect(count('arrived') - arrivals0).toBeLessThanOrEqual(count('nodeDepleted') - falls0);
  });

  it('stays at a copper rock: it grows back sooner than he could walk to the next one', () => {
    const s = setup(3);
    goWork(s.state, VILLAGE, 'copper1');
    runUntil(s, () => s.state.player.task.kind === 'gather', 40);
    const falls0 = s.log.filter(e => e.type === 'nodeDepleted').length, elsewhere = new Set<string>();
    const paths = vi.spyOn(NavGrid.prototype, 'findPath');      // and it costs no pathfinding to decide that
    for (let t = 0; t < 300; t += STEP) {
      step(s.state, STEP, s.ctx);
      const p = s.state.player;
      if (p.task.kind !== 'gather') elsewhere.add(p.task.kind);
      else if (p.task.nodeId !== 'copper1') elsewhere.add(p.task.nodeId);
      if (p.pending) elsewhere.add(p.pending.id);
    }
    expect([...elsewhere]).toEqual([]);
    expect(s.log.filter(e => e.type === 'nodeDepleted').length - falls0).toBeGreaterThan(10);
    expect(paths).not.toHaveBeenCalled();
    paths.mockRestore();
  });
});

describe('saving', () => {
  it('round-trips the game', () => {
    const s = setup();
    goWork(s.state, VILLAGE, 'copper1'); run(s, 60);
    const back = deserialize(serialize(s.state), VILLAGE);
    expect(back).toEqual(s.state);
  });
  it('rejects saves from a newer version and repairs broken or blocked positions', () => {
    const s = setup();
    expect(() => deserialize(JSON.stringify({ ...s.state, version: 999 }), VILLAGE)).toThrow();
    const broken = JSON.parse(serialize(s.state)); broken.player.pos.x = null;
    expect(deserialize(JSON.stringify(broken), VILLAGE).player.pos).toEqual(VILLAGE.start);
    const inside = JSON.parse(serialize(s.state)); inside.player.pos = { ...VILLAGE.buildings[0]!.pos };
    expect(deserialize(JSON.stringify(inside), VILLAGE).player.pos).toEqual(VILLAGE.start);
  });
  it('upgrades a version 1 save (from the clearing) without losing progress', () => {
    const v1 = {
      version: 1, time: 500, seed: 9,
      player: { pos: { x: 2.5, z: -1 }, heading: 0, path: [], task: { kind: 'mine', nodeId: 'rock1', progress: 0.4 }, pendingNode: 'rock1' },
      skills: { mining: 1234, woodcutting: 0 }, bank: { copper_ore: 40, tin_ore: 3 },
      nodes: { rock1: { id: 'rock1', depletedUntil: 0 } },
    };
    const s = deserialize(JSON.stringify(v1), VILLAGE);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.skills.mining).toBe(1234);
    expect(s.bank).toEqual({ copper_ore: 40, tin_ore: 3 });
    expect(s.player.task.kind).toBe('idle');          // rock1 no longer exists
    expect(s.player.pending).toBeNull();
    expect(Object.keys(s.nodes).sort()).toEqual(VILLAGE.nodes.map(n => n.id).sort());
    expect(s.parcels.east).toEqual({ claimed: false });
  });
  it('upgrades a version 2 save (mining before woodcutting): the miner carries on at his rock, trees are added', () => {
    const s0 = setup(3);
    goWork(s0.state, VILLAGE, 'copper1'); run(s0, 40);
    const fresh = s0.state;
    const v2 = {
      ...fresh, version: 2,
      player: { ...fresh.player, task: { kind: 'mine', nodeId: 'copper1', progress: 0.25 } },
      skills: { mining: 900, woodcutting: 0 }, bank: { copper_ore: 12 },
      nodes: Object.fromEntries(Object.entries(fresh.nodes).filter(([id]) => id.startsWith('copper') || id.startsWith('tin'))),
    };
    const s = deserialize(JSON.stringify(v2), VILLAGE);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.player.task).toEqual({ kind: 'gather', nodeId: 'copper1', progress: 0.25 });
    expect(s.skills).toEqual({ mining: 900, woodcutting: 0 });
    expect(s.bank).toEqual({ copper_ore: 12 });
    expect(s.nodes.birch1).toEqual({ id: 'birch1', depletedUntil: 0 });
  });
});

describe('long run (headless)', () => {
  it('keeps the character mining and chopping round the village for two hours of real time with no broken state', () => {
    const s = setup(11), nav = navFor(VILLAGE);
    let t = 0, nextOrder = 0, orders = 0;
    const ids = VILLAGE.nodes.filter(n => !n.parcel && RESOURCES[n.resource]!.level === 1).map(n => n.id);
    while (t < 7200) {
      if (t >= nextOrder) { goWork(s.state, VILLAGE, ids[orders++ % ids.length]!); nextOrder += 300; }
      step(s.state, STEP, s.ctx); t += STEP;
      const p = s.state.player.pos;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) throw new Error(`position broke at ${t.toFixed(1)}s`);
      if (!nav.walkable(p)) throw new Error(`walked into something at ${t.toFixed(1)}s: ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`);
    }
    // still at work: gathering, or walking on to the next tree of the kind
    const { task, pending } = s.state.player;
    expect(task.kind === 'gather' || pending?.kind === 'node', `ended ${task.kind}`).toBe(true);
    expect(s.state.bank.copper_ore ?? 0).toBeGreaterThan(400);
    expect(s.state.bank.birch_logs ?? 0).toBeGreaterThan(400);
  });
});
