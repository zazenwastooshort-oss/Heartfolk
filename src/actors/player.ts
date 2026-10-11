// The player's character: turning taps into a path round buildings and rocks, walking it, and starting work
// (or arriving at a building) at the end.
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout, Vec2 } from '../world/layout';
import { doorOf } from '../world/layout';
import { navFor } from '../world/nav';
import { ANIM } from '../data/animation';

export const WALK_SPEED = 1.45;        // m/s, matches the walk animation's stride
const TURN_RATE = 12;                  // how quickly heading catches up with the walking direction

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z });
const len = (v: Vec2) => Math.hypot(v.x, v.z);
export const headingOf = (d: Vec2) => Math.atan2(-d.z, d.x);

function setPath(state: GameState, path: Vec2[] | null, pending: GameState['player']['pending']): boolean {
  const p = state.player;
  if (!path) return false;
  p.path = path; p.pending = pending; p.task = { kind: 'walk' };
  return true;
}

/** Walk to the walkable spot nearest the tapped point. */
export function walkTo(state: GameState, layout: Layout, target: Vec2): boolean {
  const nav = navFor(layout);
  return setPath(state, nav.findPath(state.player.pos, nav.nearestWalkable(target)), null);
}

/** Walk to a resource node: stand one pick's reach from it, on the side nearest the player if that side is free. */
export function goWork(state: GameState, layout: Layout, nodeId: string): boolean {
  const node = layout.nodes.find(n => n.id === nodeId);
  if (!node) return false;
  const nav = navFor(layout), p = state.player;
  let d = sub(p.pos, node.pos);
  if (len(d) < 1e-4) d = { x: -1, z: 0 };
  const base = Math.atan2(d.z, d.x);
  for (let k = 0; k <= 18; k++) {                     // try straight towards the player first, then fan out
    const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 9);
    const stand = { x: node.pos.x + Math.cos(a) * ANIM.reach, z: node.pos.z + Math.sin(a) * ANIM.reach };
    if (!nav.walkable(stand)) continue;
    if (setPath(state, nav.findPath(p.pos, stand), { kind: 'node', id: nodeId })) return true;
  }
  return false;
}

/** Walk to a building's door, or to the edge of land that isn't the player's yet. */
export function goVisit(state: GameState, layout: Layout, id: string, at?: Vec2): boolean {
  const nav = navFor(layout);
  const b = layout.buildings.find(x => x.id === id);
  const target = b ? doorOf(b) : at ? nav.nearestWalkable(at) : null;
  if (!target) return false;
  return setPath(state, nav.findPath(state.player.pos, target), { kind: 'visit', id });
}

function angleToward(a: number, b: number, t: number): number {
  const d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return a + d * Math.min(1, t);
}

export function updatePlayer(state: GameState, layout: Layout, dt: number, events: EventBus): void {
  const p = state.player;
  if (p.task.kind === 'walk') {
    const target = p.path[0];
    if (!target) { p.task = { kind: 'idle' }; return; }
    const d = sub(target, p.pos), dist = len(d), step = WALK_SPEED * dt;
    if (dist > 1e-6) p.heading = angleToward(p.heading, headingOf(d), TURN_RATE * dt);
    if (dist <= step) {
      p.pos = { ...target }; p.path.shift();
      if (!p.path.length) {
        const pending = p.pending; p.pending = null;
        events.emit({ type: 'arrived' });
        if (pending?.kind === 'node') p.task = { kind: 'mine', nodeId: pending.id, progress: 0 };
        else {
          p.task = { kind: 'idle' };
          if (pending?.kind === 'visit') {
            const b = layout.buildings.find(x => x.id === pending.id);
            if (b) p.heading = headingOf(sub(b.pos, p.pos));      // face the building
            events.emit({ type: 'visited', id: pending.id });
          }
        }
      }
    } else {
      p.pos = { x: p.pos.x + d.x / dist * step, z: p.pos.z + d.z / dist * step };
    }
  } else if (p.task.kind === 'mine') {
    const id = p.task.nodeId, node = layout.nodes.find(n => n.id === id);
    if (node) p.heading = angleToward(p.heading, headingOf(sub(node.pos, p.pos)), TURN_RATE * dt);
  }
}
