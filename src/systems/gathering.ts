// Working a resource node: swings at the animation's pace, each strike has a chance to yield an item,
// and nodes run out and grow back. Expected time per item matches the resource's `time` in data/skills.
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Rng } from '../core/rng';
import type { Layout } from '../world/layout';
import { RESOURCES } from '../data/skills';
import { ANIM } from '../data/animation';
import { addXp, levelOf } from './skills';

/** Chance a single swing yields an item: one item per `time` seconds on average, a little better with level. */
export function yieldChance(resourceId: string, level: number): number {
  const r = RESOURCES[resourceId]!;
  const base = ANIM.mineCycle / r.time;
  return Math.min(0.95, base * (1 + (level - r.level) * 0.01));
}

export function updateGathering(state: GameState, layout: Layout, dt: number, rng: Rng, events: EventBus): void {
  for (const n of Object.values(state.nodes)) {
    if (n.depletedUntil && state.time >= n.depletedUntil) { n.depletedUntil = 0; events.emit({ type: 'nodeRespawned', nodeId: n.id }); }
  }
  const task = state.player.task;
  if (task.kind !== 'mine') return;
  const node = state.nodes[task.nodeId], spot = layout.nodes.find(n => n.id === task.nodeId);
  if (!node || !spot) { state.player.task = { kind: 'idle' }; return; }
  const res = RESOURCES[spot.resource]!;
  if (levelOf(state, res.skill) < res.level) {
    // can only happen with an old save; commands already refuse rocks above the player's level
    state.player.task = { kind: 'idle' };
    events.emit({ type: 'levelTooLow', skill: res.skill, need: res.level, what: res.name });
    return;
  }
  if (node.depletedUntil) {
    // wait at the rock with the pick lowered; carry on once it grows back
    task.progress = 0;
    return;
  }
  const before = task.progress;
  task.progress = (task.progress + dt / ANIM.mineCycle) % 1;
  const impact = ANIM.mineImpact / ANIM.mineCycle;
  const crossed = before < impact ? task.progress >= impact || task.progress < before : task.progress < before && task.progress >= impact;
  if (!crossed) return;
  events.emit({ type: 'strike', nodeId: node.id });
  if (rng.next() < yieldChance(res.id, levelOf(state, res.skill))) {
    state.bank[res.item] = (state.bank[res.item] ?? 0) + 1;
    events.emit({ type: 'itemGained', item: res.item, count: 1 });
    addXp(state, res.skill, res.xp, events);
    if (rng.next() < res.deplete) {
      node.depletedUntil = state.time + res.respawn;
      events.emit({ type: 'nodeDepleted', nodeId: node.id });
    }
  }
}
