import { describe, expect, it, vi } from 'vitest';
import { createState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { step } from '../src/sim';
import { VILLAGE, inArea, type Layout, type NodeSpot } from '../src/world/layout';
import { navFor, NavGrid } from '../src/world/nav';
import { applyCommands, type Command } from '../src/systems/commands';
import { reachFor, WALK_SPEED } from '../src/actors/player';
import { MOVE_ON_DELAY, MOVE_ON_EVERY, MOVE_ON_MARGIN } from '../src/systems/gathering';
import { RESOURCES } from '../src/data/skills';
import { XP_TABLE } from '../src/data/xp';

// the village's tin is in land not yet claimed, so the level rule is tested on a copy with a tin rock in the village
const TEST_LAYOUT: Layout = {
  ...VILLAGE,
  nodes: [...VILLAGE.nodes, { id: 'testTin', resource: 'tin_rock', pos: { x: 3.2, z: 9.8 }, radius: 0.95 }],
};

function setup(layout = TEST_LAYOUT) {
  const state = createState(layout, 5), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, ctx: { layout, rng: createRng(5), events } };
}
const run = (s: ReturnType<typeof setup>, seconds: number) => { for (let t = 0; t < seconds; t += STEP) step(s.state, STEP, s.ctx); };
/** Step until `done` (or `max` seconds pass). */
const runUntil = (s: ReturnType<typeof setup>, done: () => boolean, max: number) => {
  for (let t = 0; t < max && !done(); t += STEP) step(s.state, STEP, s.ctx);
};
// radius: a size-1 birch trunk, as tree() in world/layout.ts makes it
const birchAt = (id: string, x: number, z: number, parcel?: string): NodeSpot =>
  ({ id, resource: 'birch_tree', pos: { x, z }, radius: 0.115, size: 1, parcel });

// a birch in the village by its east edge, and another a few steps away just inside the land not yet claimed,
// close enough to walk to if it were the player's (a layout of its own, since nav grids are cached per layout)
const EDGE_LAYOUT: Layout = {
  ...VILLAGE,
  nodes: [...VILLAGE.nodes, birchAt('edgeBirch', 23.0, 4.0), birchAt('eastBirch', 25.6, 5.5, 'east')],
};

// two birches either side of a long wall: a few steps apart as the crow flies, a long way round on foot
const WALL_LAYOUT: Layout = {
  ...VILLAGE,
  village: { minX: -20, maxX: 20, minZ: -8, maxZ: 8 },
  start: { x: 0, z: -6 },
  hearth: { pos: { x: -18, z: 6 }, radius: 0.5 },
  buildings: [{ id: 'wall', kind: 'barn', model: 'Barn', name: 'Wall', pos: { x: 0, z: 0 }, w: 34, d: 0.6, rot: 0 }],
  props: [], gardens: [], trees: [], bushes: [], lanterns: [], paths: [], parcels: [],
  nodes: [birchAt('north', 0, -1.4), birchAt('south', 0, 1.4)],
};

describe('level requirements', () => {
  const tinLevel = RESOURCES.tin_rock!.level;

  it('refuses a rock above your level, says why, and stays put', () => {
    const s = setup(), queue: Command[] = [{ type: 'work', nodeId: 'testTin' }];
    const start = { ...s.state.player.pos };
    applyCommands(s.state, TEST_LAYOUT, queue, s.events);
    run(s, 10);
    expect(s.state.player.task.kind).toBe('idle');
    expect(s.state.player.pos).toEqual(start);
    expect(s.state.bank.tin_ore ?? 0).toBe(0);
    expect(s.log).toContainEqual({ type: 'levelTooLow', skill: 'mining', need: tinLevel, what: 'Tin rock' });
  });

  it('allows it once you reach the level', () => {
    const s = setup(), queue: Command[] = [{ type: 'work', nodeId: 'testTin' }];
    s.state.skills.mining = XP_TABLE[tinLevel]!;
    applyCommands(s.state, TEST_LAYOUT, queue, s.events);
    run(s, 70);
    expect(s.state.bank.tin_ore ?? 0).toBeGreaterThan(0);
  });

  it('stops an old save that was already mining a rock above the player level', () => {
    const s = setup();
    s.state.player.task = { kind: 'gather', nodeId: 'testTin', progress: 0 };
    run(s, 5);
    expect(s.state.player.task.kind).toBe('idle');
    expect(s.state.bank.tin_ore ?? 0).toBe(0);
  });
});

describe('woodcutting levels', () => {
  const oakLevel = RESOURCES.oak_tree!.level;

  it('refuses the oaks by the river until Woodcutting level 10, whatever the Mining level', () => {
    const s = setup(VILLAGE), queue: Command[] = [{ type: 'work', nodeId: 'oak1' }];
    s.state.skills.mining = XP_TABLE[50]!;
    applyCommands(s.state, VILLAGE, queue, s.events);
    run(s, 5);
    expect(s.state.player.task.kind).toBe('idle');
    expect(s.log).toContainEqual({ type: 'levelTooLow', skill: 'woodcutting', need: oakLevel, what: 'Oak tree' });
  });

  it('chops oak once you reach the level', () => {
    const s = setup(VILLAGE), queue: Command[] = [{ type: 'work', nodeId: 'oak1' }];
    s.state.skills.woodcutting = XP_TABLE[oakLevel]!;
    applyCommands(s.state, VILLAGE, queue, s.events);
    run(s, 90);
    expect(s.state.bank.oak_logs ?? 0).toBeGreaterThan(0);
  });
});

describe('land not yet claimed', () => {
  it('a rock in unexplored land sends you to its edge instead of mining it', () => {
    const s = setup(VILLAGE), queue: Command[] = [{ type: 'work', nodeId: 'tin1' }];
    applyCommands(s.state, VILLAGE, queue, s.events);
    run(s, 60);
    expect(s.log).toContainEqual({ type: 'visited', id: 'east' });
    expect(s.state.bank.tin_ore ?? 0).toBe(0);
    expect(inArea(VILLAGE.village, s.state.player.pos)).toBe(true);
    expect(navFor(VILLAGE).walkable(s.state.player.pos)).toBe(true);
  });
});

describe('buildings', () => {
  it('tapping a building walks to its door, faces it and announces the visit', () => {
    for (const b of VILLAGE.buildings) {
      const s = setup(VILLAGE), queue: Command[] = [{ type: 'visit', id: b.id }];
      applyCommands(s.state, VILLAGE, queue, s.events);
      run(s, 60);
      expect(s.log, b.id).toContainEqual({ type: 'visited', id: b.id });
      expect(s.state.player.task.kind).toBe('idle');
    }
  });
});

describe('moving on', () => {
  const work = (s: ReturnType<typeof setup>, layout: Layout, nodeId: string) => applyCommands(s.state, layout, [{ type: 'work', nodeId }], s.events);
  const falls = (s: ReturnType<typeof setup>, nodeId: string) => s.log.filter(e => e.type === 'nodeDepleted' && e.nodeId === nodeId).length;

  it('never walks to a tree on land not yet claimed, and does once it is claimed', () => {
    const nav = navFor(EDGE_LAYOUT), edge = EDGE_LAYOUT.nodes.find(n => n.id === 'edgeBirch')!, east = EDGE_LAYOUT.nodes.find(n => n.id === 'eastBirch')!;
    // both can be worked from the village side
    expect(nav.walkable({ x: edge.pos.x - reachFor(edge), z: edge.pos.z })).toBe(true);
    expect(nav.walkable({ x: east.pos.x - reachFor(east), z: east.pos.z })).toBe(true);
    expect(inArea(EDGE_LAYOUT.parcels[0]!.area, east.pos) && !inArea(EDGE_LAYOUT.village, east.pos)).toBe(true);

    const s = setup(EDGE_LAYOUT), targets = new Set<string>();
    work(s, EDGE_LAYOUT, 'edgeBirch');
    for (let t = 0; t < 180; t += STEP) {
      step(s.state, STEP, s.ctx);
      const p = s.state.player;
      if (p.task.kind === 'gather') targets.add(p.task.nodeId);
      if (p.pending) targets.add(p.pending.id);
    }
    expect(falls(s, 'edgeBirch')).toBeGreaterThan(2);
    expect([...targets]).toEqual(['edgeBirch']);

    const c = setup(EDGE_LAYOUT);
    c.state.parcels.east!.claimed = true;
    work(c, EDGE_LAYOUT, 'edgeBirch');
    runUntil(c, () => falls(c, 'edgeBirch') > 0, 300);
    runUntil(c, () => c.state.player.pending !== null, 1.5);
    expect(c.state.player.pending).toEqual({ kind: 'node', id: 'eastBirch' });
    runUntil(c, () => c.state.player.task.kind === 'gather', 20);
    expect(c.state.player.task).toMatchObject({ kind: 'gather', nodeId: 'eastBirch' });
    expect(nav.walkable(c.state.player.pos)).toBe(true);
  });

  /** Step up to `seconds`, or until `done`, noting every node he works or walks to and whether he waited at a stump. */
  const watch = (s: ReturnType<typeof setup>, seconds: number, done = () => false) => {
    const targets = new Set<string>();
    let waited = false;
    for (let t = 0; t < seconds && !done(); t += STEP) {
      step(s.state, STEP, s.ctx);
      const p = s.state.player;
      if (p.pending) targets.add(p.pending.id);
      if (p.task.kind === 'gather') {
        targets.add(p.task.nodeId);
        if (s.state.nodes[p.task.nodeId]!.depletedUntil) waited = true;
      }
    }
    return { targets: [...targets], waited };
  };
  const birch = (id: string | undefined) => VILLAGE.nodes.find(n => n.id === id)?.resource === 'birch_tree';

  it('tapping the stump he just moved on from takes him back to wait for it, and he moves on again once he fells it', () => {
    const s = setup(VILLAGE);
    work(s, VILLAGE, 'birch1');
    runUntil(s, () => falls(s, 'birch1') > 0, 300);
    runUntil(s, () => s.state.player.pending !== null, 1.5);
    expect(s.state.player.pending?.id).not.toBe('birch1');               // off to another birch
    run(s, 0.3);
    work(s, VILLAGE, 'birch1');                                           // the player taps the stump
    const back = watch(s, RESOURCES.birch_tree!.respawn, () => s.state.player.task.kind === 'gather' && !s.state.nodes.birch1!.depletedUntil);
    expect(back.targets).toEqual(['birch1']);
    expect(back.waited).toBe(true);                                       // got there before it grew back, and stayed
    expect(s.state.player.task).toMatchObject({ kind: 'gather', nodeId: 'birch1' });
    // working it as usual: once it falls under him, he moves on
    runUntil(s, () => falls(s, 'birch1') > 1, 300);
    runUntil(s, () => s.state.player.pending !== null, 1.5);
    expect(s.state.player.pending?.id).not.toBe('birch1');
    expect(birch(s.state.player.pending?.id)).toBe(true);
  });

  it('tapping the stump he is waiting at keeps him there until it grows back', () => {
    const s = setup(VILLAGE);
    work(s, VILLAGE, 'birch1');
    runUntil(s, () => falls(s, 'birch1') > 0, 300);
    run(s, 0.3);
    expect(s.state.player.pending).toBeNull();
    work(s, VILLAGE, 'birch1');
    const stay = watch(s, RESOURCES.birch_tree!.respawn, () => s.state.player.task.kind === 'gather' && !s.state.nodes.birch1!.depletedUntil);
    expect(stay.targets).toEqual(['birch1']);
    expect(stay.waited).toBe(true);
    expect(s.state.nodes.birch1!.depletedUntil).toBe(0);
    expect(s.state.player.task).toMatchObject({ kind: 'gather', nodeId: 'birch1' });
  });

  it('tapping a stump from elsewhere walks to it and waits there rather than going on to a standing tree', () => {
    const s = setup(VILLAGE), r = RESOURCES.birch_tree!;
    s.state.player.pos = navFor(VILLAGE).nearestWalkable({ x: -6.4, z: 19.6 });
    s.state.nodes.birch2!.depletedUntil = s.state.time + r.respawn - 1;     // felled a moment ago
    work(s, VILLAGE, 'birch2');
    const sent = watch(s, r.respawn, () => s.state.player.task.kind === 'gather' && !s.state.nodes.birch2!.depletedUntil);
    expect(sent.targets).toEqual(['birch2']);
    expect(sent.waited).toBe(true);
    expect(s.state.player.task).toMatchObject({ kind: 'gather', nodeId: 'birch2' });
  });

  it('a command from the player wins over moving on', () => {
    const s = setup(VILLAGE), to = { x: 0, z: 14 };
    work(s, VILLAGE, 'birch1');
    runUntil(s, () => falls(s, 'birch1') > 0, 300);
    run(s, 0.3);
    applyCommands(s.state, VILLAGE, [{ type: 'walk', to }], s.events);
    let wentToNode = false;
    for (let t = 0; t < 20; t += STEP) {
      step(s.state, STEP, s.ctx);
      if (s.state.player.pending?.kind === 'node' || s.state.player.task.kind === 'gather') wentToNode = true;
    }
    expect(wentToNode).toBe(false);
    expect(s.state.player.task.kind).toBe('idle');
    expect(Math.hypot(s.state.player.pos.x - to.x, s.state.player.pos.z - to.z)).toBeLessThan(0.01);
  });

  it('waits rather than walk the long way round to a tree that only looks close', () => {
    const s = setup(WALL_LAYOUT), south = WALL_LAYOUT.nodes.find(n => n.id === 'south')!;
    work(s, WALL_LAYOUT, 'north');
    runUntil(s, () => falls(s, 'north') > 0, 300);
    // as the crow flies the other birch would be worth it
    const p = s.state.player.pos, crow = (Math.hypot(south.pos.x - p.x, south.pos.z - p.z) - reachFor(south)) / WALK_SPEED;
    expect(crow + MOVE_ON_MARGIN).toBeLessThan(RESOURCES.birch_tree!.respawn - MOVE_ON_DELAY);
    let moved = false;
    const paths = vi.spyOn(NavGrid.prototype, 'findPath');
    for (let t = 0; t < RESOURCES.birch_tree!.respawn + 1; t += STEP) {
      step(s.state, STEP, s.ctx);
      if (s.state.player.pending || s.state.player.task.kind !== 'gather') moved = true;
    }
    // it looks again now and then while waiting, not every step
    expect(paths.mock.calls.length).toBeLessThanOrEqual(Math.ceil((RESOURCES.birch_tree!.respawn - MOVE_ON_DELAY) / MOVE_ON_EVERY));
    paths.mockRestore();
    expect(moved).toBe(false);
    expect(s.state.player.task).toMatchObject({ kind: 'gather', nodeId: 'north' });
    expect(s.state.nodes.north!.depletedUntil).toBe(0);
  });
});
