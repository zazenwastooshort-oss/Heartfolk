import { describe, expect, it } from 'vitest';
import { createState, SAVE_VERSION } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { step } from '../src/sim';
import { VILLAGE } from '../src/world/layout';
import { navFor } from '../src/world/nav';
import { walkTo, goWork, reachFor } from '../src/actors/player';
import { serialize, deserialize } from '../src/core/save';
import { RESOURCES } from '../src/data/skills';
import { SWINGS } from '../src/data/animation';

function setup(seed = 1) {
  const state = createState(VILLAGE, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, ctx: { layout: VILLAGE, rng: createRng(seed), events } };
}
const run = (s: ReturnType<typeof setup>, seconds: number) => { for (let t = 0; t < seconds; t += STEP) step(s.state, STEP, s.ctx); };
const copper = VILLAGE.nodes.find(n => n.id === 'copper1')!;
const birch = VILLAGE.nodes.find(n => n.id === 'birch1')!;
const strikesPerSwing = (s: ReturnType<typeof setup>, nodeId: string, cycle: number) => {
  const strikes0 = s.log.filter(e => e.type === 'strike').length, regrown0 = s.log.filter(e => e.type === 'nodeRespawned').length;
  let swinging = 0;                               // time spent swinging, not waiting for the node to grow back
  for (let t = 0; t < 120; t += STEP) {
    if (!s.state.nodes[nodeId]!.depletedUntil) swinging += STEP;
    step(s.state, STEP, s.ctx);
  }
  const strikes = s.log.filter(e => e.type === 'strike').length - strikes0;
  // after the node grows back a fresh swing starts, so its strike comes sooner than a full cycle would
  const regrowths = s.log.filter(e => e.type === 'nodeRespawned').length - regrown0;
  expect(strikes).toBeGreaterThanOrEqual(Math.floor(swinging / cycle) - 1);
  expect(strikes).toBeLessThanOrEqual(Math.ceil(swinging / cycle) + regrowths + 1);
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
    strikesPerSwing(s, 'copper1', SWINGS.mining.cycle);
  });
});

describe('woodcutting', () => {
  it('walks to a birch and stands the axe reach from the trunk, further back from a thicker oak', () => {
    const s = setup();
    goWork(s.state, VILLAGE, 'birch1');
    run(s, 40);
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
    strikesPerSwing(s, 'birch1', SWINGS.woodcutting.cycle);
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
    expect(s.state.player.task.kind).toBe('gather');
    expect(s.state.bank.copper_ore ?? 0).toBeGreaterThan(400);
    expect(s.state.bank.birch_logs ?? 0).toBeGreaterThan(400);
  });
});
