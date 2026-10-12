// The player's character: turning taps into a path round buildings, rocks and trees, walking it, and starting work
// (or arriving at a building or beside something he built, stopping beside something to pick up, or starting to build
// something) at the end.
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout, NodeSpot, Site, Vec2 } from '../world/layout';
import { doorOf, siteOf } from '../world/layout';
import { navFor, type NavGrid } from '../world/nav';
import { GAIT, SWINGS } from '../data/animation';
import { RESOURCES } from '../data/skills';
import { PICKUP_PAUSE } from '../data/pickups';
import { BUILD_REACH, MAKES, makeDef, type MakeId } from '../data/making';

export const WALK_SPEED = GAIT.speed;  // m/s
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
  const nav = navFor(layout, state.built);
  return setPath(state, nav.findPath(state.player.pos, nav.nearestWalkable(target)), null);
}

/** How far from a node's centre to stand so the tool lands on it: the swing's reach, further back from bigger nodes. */
export function reachFor(spot: NodeSpot): number {
  const swing = SWINGS[RESOURCES[spot.resource]!.skill];
  return swing.reach + (spot.radius - swing.refRadius);
}

/** Walk to a resource node: stand within the tool's reach of it, on the side nearest the player if that side is free. */
export function goWork(state: GameState, layout: Layout, nodeId: string): boolean {
  const node = layout.nodes.find(n => n.id === nodeId);
  if (!node) return false;
  const nav = navFor(layout, state.built), p = state.player, reach = reachFor(node);
  let d = sub(p.pos, node.pos);
  if (len(d) < 1e-4) d = { x: -1, z: 0 };
  const base = Math.atan2(d.z, d.x);
  for (let k = 0; k <= 18; k++) {                     // try straight towards the player first, then fan out
    const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 9);
    const stand = { x: node.pos.x + Math.cos(a) * reach, z: node.pos.z + Math.sin(a) * reach };
    if (!nav.walkable(stand)) continue;
    if (setPath(state, nav.findPath(p.pos, stand), { kind: 'node', id: nodeId })) return true;
  }
  return false;
}

/** How far from something on the ground he stands to pick it up: beside it, as near as the ground allows (by the
 *  water's edge he may have to reach a little further). */
export const PICKUP_REACH = [0.55, 0.8, 1.05];

/** Walk to stand beside something lying on the ground (layout.pickups), on the side nearest him if that side is free.
 *  Already beside it, he stays where he is. */
export function goPickup(state: GameState, layout: Layout, id: string): boolean {
  const spot = layout.pickups?.find(x => x.id === id);
  if (!spot) return false;
  const nav = navFor(layout, state.built), p = state.player;
  let d = sub(p.pos, spot.pos);
  if (len(d) <= PICKUP_REACH[0]! + 0.1 && nav.walkable(p.pos)) return setPath(state, [{ ...p.pos }], { kind: 'pickup', id });
  if (len(d) < 1e-4) d = { x: -1, z: 0 };
  const base = Math.atan2(d.z, d.x);
  for (const reach of PICKUP_REACH) {
    for (let k = 0; k <= 18; k++) {
      const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 9);
      const stand = { x: spot.pos.x + Math.cos(a) * reach, z: spot.pos.z + Math.sin(a) * reach };
      if (!nav.walkable(stand)) continue;
      if (setPath(state, nav.findPath(p.pos, stand), { kind: 'pickup', id })) return true;
    }
  }
  return false;
}

/** Walk to stand just beyond the edge of a site (BUILD_REACH), on the side nearest him, on ground open in `stands`
 *  (the walking grid once the thing stands there); already there, he stays. */
function goBeside(state: GameState, layout: Layout, site: Site, stands: NavGrid, pending: GameState['player']['pending']): boolean {
  const nav = navFor(layout, state.built), p = state.player, reach = site.radius + BUILD_REACH;
  let d = sub(p.pos, site.pos);
  if (Math.abs(len(d) - reach) < 0.3 && stands.walkable(p.pos)) return setPath(state, [{ ...p.pos }], pending);
  if (len(d) < 1e-4) d = { x: -1, z: 0 };
  const base = Math.atan2(d.z, d.x);
  for (let k = 0; k <= 18; k++) {
    const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 9);
    const stand = { x: site.pos.x + Math.cos(a) * reach, z: site.pos.z + Math.sin(a) * reach };
    if (!stands.walkable(stand)) continue;
    if (setPath(state, nav.findPath(p.pos, stand), pending)) return true;
  }
  return false;
}

/** Where he makes something (data/making.ts): beside its site, on the side nearest him, on ground that stays open
 *  once it stands there; or right where he is, for something made anywhere. Already beside the site, he stays. */
export function goMake(state: GameState, layout: Layout, id: MakeId): boolean {
  const def = MAKES[id], p = state.player, pending = { kind: 'make' as const, id };
  if (def.at === 'here') return setPath(state, [{ ...p.pos }], pending);
  const site = siteOf(layout, def.at);
  if (!site) return false;
  return goBeside(state, layout, site, navFor(layout, [...state.built, id]), pending);
}

/** Where he faces while making something: its site, or straight ahead for something made where he stands. */
const makeAt = (layout: Layout, id: MakeId) => { const at = MAKES[id].at; return at === 'here' ? undefined : siteOf(layout, at)?.pos; };

/** The site of something he has built that stands in this layout (the campfire, the storage chest), by its id in
 *  data/making.ts; null for anything else. */
export function builtSite(state: GameState, layout: Layout, id: string): Site | null {
  const def = makeDef(id);
  if (!def || def.at === 'here' || !state.built.includes(def.id)) return null;
  return siteOf(layout, def.at);
}

/** Walk to a building's door, to stand beside something he has built (since 0.0.19: the storage chest, to empty the
 *  backpack; the campfire, to stoke it), or to the edge of land that isn't the player's yet. */
export function goVisit(state: GameState, layout: Layout, id: string, at?: Vec2): boolean {
  const nav = navFor(layout, state.built);
  const b = layout.buildings.find(x => x.id === id), site = b ? null : builtSite(state, layout, id);
  if (site) return goBeside(state, layout, site, nav, { kind: 'visit', id });
  const target = b ? doorOf(b) : at ? nav.nearestWalkable(at) : null;
  if (!target) return false;
  return setPath(state, nav.findPath(state.player.pos, target), { kind: 'visit', id });
}

function angleToward(a: number, b: number, t: number): number {
  const d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return a + d * Math.min(1, t);
}

/** Walks and turns the character. Returns the id of the building, land or built thing (the chest, the campfire) he
 *  reached this step, if any, so the system that runs it (the bank and the chest, stoking the fire, the merchant
 *  later) can act in the same step. */
export function updatePlayer(state: GameState, layout: Layout, dt: number, events: EventBus): string | null {
  const p = state.player;
  if (p.task.kind === 'walk') {
    const target = p.path[0];
    if (!target) { p.task = { kind: 'idle' }; return null; }
    const d = sub(target, p.pos), dist = len(d), step = WALK_SPEED * dt;
    if (dist > 1e-6) p.heading = angleToward(p.heading, headingOf(d), TURN_RATE * dt);
    if (dist <= step) {
      p.pos = { ...target }; p.path.shift();
      if (!p.path.length) {
        const pending = p.pending; p.pending = null;
        events.emit({ type: 'arrived' });
        if (pending?.kind === 'node') p.task = { kind: 'gather', nodeId: pending.id, progress: 0 };
        else if (pending?.kind === 'pickup') p.task = { kind: 'pickup', id: pending.id, doneAt: state.time + PICKUP_PAUSE };
        else if (pending?.kind === 'make') p.task = { kind: 'make', id: pending.id, doneAt: state.time + MAKES[pending.id].time };
        else {
          p.task = { kind: 'idle' };
          if (pending?.kind === 'visit') {
            const face = layout.buildings.find(x => x.id === pending.id)?.pos ?? builtSite(state, layout, pending.id)?.pos;
            if (face) p.heading = headingOf(sub(face, p.pos));    // face the building, or what he built
            events.emit({ type: 'visited', id: pending.id });
            return pending.id;
          }
        }
      }
    } else {
      p.pos = { x: p.pos.x + d.x / dist * step, z: p.pos.z + d.z / dist * step };
    }
  } else if (p.task.kind === 'gather' || p.task.kind === 'pickup' || p.task.kind === 'make' || p.task.kind === 'stoke') {
    // face what he works, picks up, builds or stokes
    const task = p.task;
    const at = task.kind === 'gather' ? layout.nodes.find(n => n.id === task.nodeId)?.pos
      : task.kind === 'pickup' ? layout.pickups?.find(x => x.id === task.id)?.pos
      : task.kind === 'make' ? makeAt(layout, task.id) : siteOf(layout, 'hearth')?.pos;
    if (at && len(sub(at, p.pos)) > 1e-3) p.heading = angleToward(p.heading, headingOf(sub(at, p.pos)), TURN_RATE * dt);
  }
  return null;
}
