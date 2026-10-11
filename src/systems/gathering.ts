// Working a resource node (mining a rock, chopping a tree): swings at that skill's animation pace, each strike has a
// chance to yield an item, and nodes run out and grow back. Expected time per item matches the resource's `time`
// in data/skills. When a node runs out while he works it, the character moves on to the nearest free one of the same
// kind if that is quicker than waiting for it to grow back; a stump or empty rock the player sends him to, he waits at.
// What he gathers goes into his backpack; with it full he stops, and systems/hauling takes him to the bank.
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Rng } from '../core/rng';
import type { Layout, NodeSpot, Vec2 } from '../world/layout';
import { RESOURCES } from '../data/skills';
import { SWINGS } from '../data/animation';
import { goWork, reachFor, WALK_SPEED } from '../actors/player';
import { addXp, levelOf } from './skills';
import { isClaimed } from './commands';
import { addToBackpack, backpackFull } from './backpack';

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
    if (since >= res.moveOnAfter && look(since) > look(since - dt)) moveOn(state, layout, spot, node.depletedUntil - state.time);
    return;
  }
  // no room for another item: he lowers the tool until hauling sends him to the bank
  if (backpackFull(state)) { task.progress = 0; return; }
  const swing = SWINGS[res.skill];
  const before = task.progress;
  task.progress = (task.progress + dt / swing.cycle) % 1;
  const impact = swing.impact / swing.cycle;
  const crossed = before < impact ? task.progress >= impact || task.progress < before : task.progress < before && task.progress >= impact;
  if (!crossed) return;
  events.emit({ type: 'strike', nodeId: node.id });
  if (rng.next() < yieldChance(res.id, levelOf(state, res.skill))) {
    addToBackpack(state, res.item);
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
 *  seconds until `from` grows back (with MOVE_ON_MARGIN to spare). */
function moveOn(state: GameState, layout: Layout, from: NodeSpot, left: number): void {
  if (left > MOVE_ON_MARGIN) workNearestFree(state, layout, from.resource, left - MOVE_ON_MARGIN);
}

/** Set off to work the nearest free node of `resource` on the player's land that he can walk to in under `within`
 *  seconds. Paths are only found for the few nearest whose straight-line walk passes that test. Returns false, with
 *  the player as he was, when there is none. Used for moving on, and for going back to work after the bank. */
export function workNearestFree(state: GameState, layout: Layout, resource: string, within = Infinity): boolean {
  const p = state.player, was = { task: p.task, path: p.path, pending: p.pending }, options: { id: string; walk: number }[] = [];
  for (const n of layout.nodes) {
    if (n.resource !== resource || state.nodes[n.id]?.depletedUntil !== 0 || !isClaimed(state, n.parcel)) continue;
    const walk = Math.max(0, Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z) - reachFor(n)) / WALK_SPEED;
    if (walk < within) options.push({ id: n.id, walk });
  }
  options.sort((a, b) => a.walk - b.walk);
  for (const { id } of options.slice(0, MOVE_ON_TRIES)) {
    if (!goWork(state, layout, id)) continue;
    // the straight line was a lower bound; a path round a building can take longer than waiting
    if (pathLength(p.pos, p.path) / WALK_SPEED < within) return true;
    p.task = was.task; p.path = was.path; p.pending = was.pending;
  }
  return false;
}
