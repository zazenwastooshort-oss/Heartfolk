// Working a resource node (mining a rock, chopping a tree): swings at that skill's animation pace, each strike has a
// chance to yield an item, and nodes run out and grow back. Expected time per item matches the resource's `time`
// in data/skills. When a node runs out while he works it, the character moves on to the nearest free one of the same
// kind if that is quicker than waiting for it to grow back; a stump or empty rock the player sends him to, he waits at.
import type { GameState, Task } from '../core/state';
import type { EventBus } from '../core/events';
import type { Rng } from '../core/rng';
import type { Layout, NodeSpot, Vec2 } from '../world/layout';
import { RESOURCES } from '../data/skills';
import { SWINGS } from '../data/animation';
import { goWork, reachFor, WALK_SPEED } from '../actors/player';
import { addXp, levelOf } from './skills';
import { isClaimed } from './commands';

// He pauses RESOURCES[...].moveOnAfter seconds after a node runs out (a tree is seen to land), then looks for another.
export const MOVE_ON_EVERY = 0.5;     // then look again this often while still waiting; cheap when time is caught up
export const MOVE_ON_MARGIN = 0.3;    // the walk has to beat the regrowth by this much, so he doesn't set off for nothing
const MOVE_ON_TRIES = 3;              // candidates to find a path to per look

/** Chance a single swing yields an item: one item per `time` seconds on average, a little better with level. */
export function yieldChance(resourceId: string, level: number): number {
  const r = RESOURCES[resourceId]!;
  const base = SWINGS[r.skill].cycle / r.time;
  return Math.min(0.95, base * (1 + (level - r.level) * 0.01));
}

export function updateGathering(state: GameState, layout: Layout, dt: number, rng: Rng, events: EventBus): void {
  for (const n of Object.values(state.nodes)) {
    if (n.depletedUntil && state.time >= n.depletedUntil) { n.depletedUntil = 0; events.emit({ type: 'nodeRespawned', nodeId: n.id }); }
  }
  const task = state.player.task;
  if (task.kind !== 'gather') return;
  const node = state.nodes[task.nodeId], spot = layout.nodes.find(n => n.id === task.nodeId);
  if (!node || !spot) { state.player.task = { kind: 'idle' }; return; }
  const res = RESOURCES[spot.resource]!;
  if (levelOf(state, res.skill) < res.level) {
    // can only happen with an old save; commands already refuse nodes above the player's level
    state.player.task = { kind: 'idle' };
    events.emit({ type: 'levelTooLow', skill: res.skill, need: res.level, what: res.name });
    return;
  }
  if (node.depletedUntil) {
    // wait at the rock or stump with the tool lowered; carry on once it grows back, unless another is quicker. A stump
    // the player sent him to (it was down when he got there) is waited at: their choice wins over moving on.
    task.progress = 0;
    if (!task.mayMoveOn) return;
    const since = state.time - (node.depletedUntil - res.respawn);          // seconds since it ran out under him
    const look = (t: number) => Math.floor((t - res.moveOnAfter) / MOVE_ON_EVERY);
    if (since >= res.moveOnAfter && look(since) > look(since - dt)) moveOn(state, layout, task, spot, node.depletedUntil - state.time);
    return;
  }
  const swing = SWINGS[res.skill];
  const before = task.progress;
  task.progress = (task.progress + dt / swing.cycle) % 1;
  const impact = swing.impact / swing.cycle;
  const crossed = before < impact ? task.progress >= impact || task.progress < before : task.progress < before && task.progress >= impact;
  if (!crossed) return;
  events.emit({ type: 'strike', nodeId: node.id });
  if (rng.next() < yieldChance(res.id, levelOf(state, res.skill))) {
    state.bank[res.item] = (state.bank[res.item] ?? 0) + 1;
    events.emit({ type: 'itemGained', item: res.item, count: 1 });
    addXp(state, res.skill, res.xp, events);
    if (rng.next() < res.deplete) {
      node.depletedUntil = state.time + res.respawn;
      task.mayMoveOn = true;
      events.emit({ type: 'nodeDepleted', nodeId: node.id });
    }
  }
}

const pathLength = (from: Vec2, path: Vec2[]) => {
  let total = 0, at = from;
  for (const w of path) { total += Math.hypot(w.x - at.x, w.z - at.z); at = w; }
  return total;
};

/** Walk to the nearest free node like `from` on the player's land, if getting there takes less than `left`, the
 *  seconds until `from` grows back (with MOVE_ON_MARGIN to spare). Paths are only found for nodes whose straight-line
 *  walk passes that test. */
function moveOn(state: GameState, layout: Layout, task: Task, from: NodeSpot, left: number): void {
  if (left <= MOVE_ON_MARGIN) return;
  const p = state.player, options: { id: string; walk: number }[] = [];
  for (const n of layout.nodes) {
    if (n.resource !== from.resource || state.nodes[n.id]?.depletedUntil !== 0 || !isClaimed(state, n.parcel)) continue;
    const walk = Math.max(0, Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z) - reachFor(n)) / WALK_SPEED;
    if (walk + MOVE_ON_MARGIN < left) options.push({ id: n.id, walk });
  }
  options.sort((a, b) => a.walk - b.walk);
  for (const { id } of options.slice(0, MOVE_ON_TRIES)) {
    if (!goWork(state, layout, id)) continue;
    // the straight line was a lower bound; a path round a building can take longer than waiting
    if (pathLength(p.pos, p.path) / WALK_SPEED + MOVE_ON_MARGIN < left) return;
    p.task = task; p.path = []; p.pending = null;
  }
}
