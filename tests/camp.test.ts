// The camp below the falls, where a new game starts (src/world/camp.ts): everything to work is in reach from where he
// washes up, the pool and the river are not walkable, and chopping fills the backpack for the first goal.
import { describe, expect, it } from 'vitest';
import { createState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { inArea, type Vec2 } from '../src/world/layout';
import { navFor } from '../src/world/nav';
import { reachFor } from '../src/actors/player';
import { applyCommands } from '../src/systems/commands';
import { RESOURCES } from '../src/data/skills';
import { GOALS } from '../src/data/goals';
import { BACKPACK_SLOTS } from '../src/data/hauling';

const nav = navFor(CAMP);
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

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

  it('keeps the pool, the river, the tent and the campfire out of the way', () => {
    const { pool } = CAMP.falls!;
    expect(nav.walkable(pool.pos)).toBe(false);
    for (const p of CAMP.river.points) expect(nav.walkable(p)).toBe(false);
    expect(nav.walkable(CAMP.camp!.tent.pos)).toBe(false);
    expect(nav.walkable(CAMP.hearth.pos)).toBe(false);
    for (const n of CAMP.nodes) {
      expect(dist(n.pos, pool.pos), n.id).toBeGreaterThan(pool.radius + n.radius + 0.5);
      expect(dist(n.pos, CAMP.camp!.tent.pos), n.id).toBeGreaterThan(2);
      expect(dist(n.pos, CAMP.hearth.pos), n.id).toBeGreaterThan(2);
    }
    // the tent and the fire leave room to walk between them and round them
    expect(nav.findPath(CAMP.start, { x: CAMP.hearth.pos.x + 1.6, z: CAMP.hearth.pos.z + 1.6 })).not.toBeNull();
  });

  it('chops birch into the backpack for the first goal, and says so when the backpack is full with nowhere to store it', () => {
    const state = createState(CAMP, 3), events = new EventBus(), log: GameEvent[] = [];
    events.on(e => log.push(e));
    const ctx = { layout: CAMP, rng: createRng(3), events };
    applyCommands(state, CAMP, [{ type: 'work', nodeId: 'camp_birch1' }], events);
    const goal = GOALS[0]!, need = goal.needs.birch_logs!;
    for (let t = 0; t < 120 && (state.player.backpack.birch_logs ?? 0) < need; t += STEP) step(state, STEP, ctx);
    expect(state.player.backpack.birch_logs ?? 0).toBeGreaterThanOrEqual(need);
    for (let t = 0; t < 900 && !log.some(e => e.type === 'noStorage'); t += STEP) step(state, STEP, ctx);
    expect(Object.values(state.player.backpack).reduce((a, b) => a + b, 0)).toBe(BACKPACK_SLOTS);
    expect(log.filter(e => e.type === 'noStorage').length).toBe(1);
    expect(state.player.task.kind).toBe('idle');
    expect(nav.walkable(state.player.pos)).toBe(true);
  });
});
