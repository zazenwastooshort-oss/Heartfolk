// The player's character: turning taps into a path round buildings, rocks and trees, walking it, and starting work
// (or arriving at a building or at something he built, stopping beside something to pick up, starting to build
// something, or (0.0.22) starting to strike something, the training dummy) at the end. At the camp's spots he stands
// where core/camp.ts says (the camp build, 13 Oct 2026): at the shelter's door for the shelter and the storage chest in
// it, at a step's own stands (in front of its faces, as far out as his mallet reaches) to build it and use it, or round
// something round on its ring. Standing where something has just been begun (its footings out round him), he steps out
// of it the shortest way first. A walk he was sent on that ends with nothing to do there leaves him a moment
// (RESUME.wait) before he goes back by himself to anything half built (systems/building.ts).
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import { targetOf } from '../core/targets';
import type { Layout, NodeSpot, Vec2 } from '../world/layout';
import { doorOf, siteOf } from '../world/layout';
import type { NavGrid } from '../world/nav';
import { GAIT, SWINGS } from '../data/animation';
import { RESOURCES } from '../data/skills';
import { pauseFor } from '../data/pickups';
import { MAKES, type MakeId } from '../data/making';
import { RESUME } from '../data/building';
import { walkGrid } from '../core/building';
import { AT_SPOT, atSpot, buildSpot, spotEnds, useSpot, type UseSpot } from '../core/camp';

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

/** How far round (metres) and in how many directions he looks for open ground to step out to, standing where he can't. */
const STEP_OUT = { reach: [0.4, 0.8, 1.2, 1.6, 2, 2.5, 3], ways: 16 };

/** The way from `from` to `to` on `nav` (null for none). Standing where he can't (something just begun round him,
 *  T2.14), he steps out first, to the nearest open ground that leads there (the very nearest may be a pocket closed in
 *  by what was begun, between a stone hearth's ring and its seats), so he steps straight out rather than across it. */
function route(nav: NavGrid, from: Vec2, to: Vec2): Vec2[] | null {
  if (nav.walkable(from)) return nav.findPath(from, to);
  const outs = [nav.nearestWalkable(from), ...STEP_OUT.reach.flatMap(r => Array.from({ length: STEP_OUT.ways }, (_, i) => {
    const a = i / STEP_OUT.ways * Math.PI * 2;
    return { x: from.x + Math.cos(a) * r, z: from.z + Math.sin(a) * r };
  }))].filter(o => nav.walkable(o)).sort((a, b) => len(sub(a, from)) - len(sub(b, from)));
  for (const out of outs) { const path = nav.findPath(out, to); if (path) return [out, ...path]; }
  return null;
}

/** Walk to the walkable spot nearest the tapped point. */
export function walkTo(state: GameState, layout: Layout, target: Vec2): boolean {
  const nav = walkGrid(state, layout);
  return setPath(state, route(nav, state.player.pos, nav.nearestWalkable(target)), null);
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
  const nav = walkGrid(state, layout), p = state.player, reach = reachFor(node);
  let d = sub(p.pos, node.pos);
  if (len(d) < 1e-4) d = { x: -1, z: 0 };
  const base = Math.atan2(d.z, d.x);
  for (let k = 0; k <= 18; k++) {                     // try straight towards the player first, then fan out
    const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 9);
    const stand = { x: node.pos.x + Math.cos(a) * reach, z: node.pos.z + Math.sin(a) * reach };
    if (!nav.walkable(stand)) continue;
    if (setPath(state, route(nav, p.pos, stand), { kind: 'node', id: nodeId })) return true;
  }
  return false;
}

/** Walk to stand `reach` metres from `at`, on the side nearest him if that side is free, fanning out round it if not;
 *  already about there, he stays. For striking something (0.0.22, systems/combat.ts: the training dummy). `beside`
 *  (the goblin chief, core/targets.ts): due east or west of it instead, the side nearer him unless there is no room
 *  there, so the camera as it starts (looking north) sees it beside him, not hidden behind him. */
export function goNear(state: GameState, layout: Layout, at: Vec2, reach: number, pending: GameState['player']['pending'], beside = false): boolean {
  const nav = walkGrid(state, layout), p = state.player;
  let d = sub(p.pos, at);
  if (beside) {
    const near = d.x < 0 ? -1 : 1;
    d = { x: [near, -near].find(s => nav.walkable({ x: at.x + s * reach, z: at.z })) ?? near, z: 0 };
  } else if (Math.abs(len(d) - reach) < 0.15 && nav.walkable(p.pos)) return setPath(state, [{ ...p.pos }], pending);
  if (len(d) < 1e-4) d = { x: -1, z: 0 };
  const base = Math.atan2(d.z, d.x);
  for (let k = 0; k <= 18; k++) {
    const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 9);
    const stand = { x: at.x + Math.cos(a) * reach, z: at.z + Math.sin(a) * reach };
    if (!nav.walkable(stand)) continue;
    if (setPath(state, route(nav, p.pos, stand), pending)) return true;
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
  const nav = walkGrid(state, layout), p = state.player;
  let d = sub(p.pos, spot.pos);
  if (len(d) <= PICKUP_REACH[0]! + 0.1 && nav.walkable(p.pos)) return setPath(state, [{ ...p.pos }], { kind: 'pickup', id });
  if (len(d) < 1e-4) d = { x: -1, z: 0 };
  const base = Math.atan2(d.z, d.x);
  for (const reach of PICKUP_REACH) {
    for (let k = 0; k <= 18; k++) {
      const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 9);
      const stand = { x: spot.pos.x + Math.cos(a) * reach, z: spot.pos.z + Math.sin(a) * reach };
      if (!nav.walkable(stand)) continue;
      if (setPath(state, route(nav, p.pos, stand), { kind: 'pickup', id })) return true;
    }
  }
  return false;
}

/** Walk to where he stands at something at the camp's spots (core/camp.ts UseSpot): the nearest of its stands he can
 *  walk to (or the open ground nearest it, just by it), or for something round, round its ring on the side nearest
 *  him, fanning out round it where that side isn't open. Already there, he stays. */
function goSpot(state: GameState, layout: Layout, spot: UseSpot, pending: GameState['player']['pending']): boolean {
  const nav = walkGrid(state, layout), p = state.player;
  if (atSpot(spot, p.pos) && nav.walkable(p.pos)) return setPath(state, [{ ...p.pos }], pending);
  for (const end of spotEnds(spot, p.pos)) {
    const at = nav.walkable(end) || !spot.stands.length ? end : nav.nearestWalkable(end);
    if (!nav.walkable(at) || len(sub(at, end)) > AT_SPOT.slip) continue;
    if (setPath(state, route(nav, p.pos, at), pending)) return true;
  }
  return false;
}

/** Where he makes something made where he stands (data/making.ts: a tool, gear): right where he is. (Everything built
 *  at the camp's spots goes up in stages since the camp build: goBuild.) */
export function goMake(state: GameState, layout: Layout, id: MakeId): boolean {
  const p = state.player;
  return MAKES[id].at === 'here' && setPath(state, [{ ...p.pos }], { kind: 'make', id });
}

/** Walk to where he builds something built in stages (systems/building.ts: everything built at the camp's spots, each
 *  at its spot; core/camp.ts buildSpot): one of its stands, or round it for something round, and the storage chest
 *  from the shelter's door. Already there, he stays. It is in the way from when it is begun: standing inside it then, he
 *  steps out first (route). */
export function goBuild(state: GameState, layout: Layout, id: MakeId): boolean {
  const spot = buildSpot(state, layout, id);
  return !!spot && goSpot(state, layout, spot, { kind: 'raise', id });
}


/** Walk to a building's door, to where he uses something he has built at the camp (core/camp.ts useSpot: the
 *  shelter's door, for the storage chest in it and for bed; the campfire, to stoke it or cook at it, and the firewood
 *  pile, to take logs from it or stack them on it, at the step of their spot furthest out), or to the edge of land
 *  that isn't the player's yet. */
export function goVisit(state: GameState, layout: Layout, id: string, at?: Vec2): boolean {
  const nav = walkGrid(state, layout);
  const b = layout.buildings.find(x => x.id === id), spot = b ? null : useSpot(state, layout, id);
  if (spot) return goSpot(state, layout, spot, { kind: 'visit', id });
  const target = b ? doorOf(b) : at ? nav.nearestWalkable(at) : null;
  if (!target) return false;
  return setPath(state, route(nav, state.player.pos, target), { kind: 'visit', id });
}

/** What he faces once he is where he was going to visit `id`: a building, or what he built (the shelter, from its door;
 *  the campfire; the firewood pile). */
const faceOf = (state: GameState, layout: Layout, id: string): Vec2 | undefined =>
  layout.buildings.find(x => x.id === id)?.pos ?? useSpot(state, layout, id)?.face;

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
        else if (pending?.kind === 'pickup') {
          const kind = layout.pickups?.find(x => x.id === pending.id)?.kind;
          p.task = { kind: 'pickup', id: pending.id, doneAt: state.time + (kind ? pauseFor(kind) : 0) };
        }
        else if (pending?.kind === 'make') p.task = { kind: 'make', id: pending.id, doneAt: state.time + MAKES[pending.id].time };
        else if (pending?.kind === 'fight') p.task = { kind: 'fight', target: pending.id, progress: 0 };
        else if (pending?.kind === 'raise') p.task = { kind: 'raise', id: pending.id };
        else {
          p.task = { kind: 'idle' };
          // a walk he was sent on, done: he stays a moment before going back by himself to anything half built (D9)
          if (!pending) state.resumeAt = state.time + RESUME.wait;
          if (pending?.kind === 'visit') {
            const face = faceOf(state, layout, pending.id);
            if (face) p.heading = headingOf(sub(face, p.pos));    // face the building, or what he built
            events.emit({ type: 'visited', id: pending.id });
            return pending.id;
          }
        }
      }
    } else {
      p.pos = { x: p.pos.x + d.x / dist * step, z: p.pos.z + d.z / dist * step };
    }
  } else if (p.task.kind === 'gather' || p.task.kind === 'pickup' || p.task.kind === 'make' || p.task.kind === 'stoke' || p.task.kind === 'cook' || p.task.kind === 'fight' || p.task.kind === 'raise') {
    // face what he works, picks up, builds, stokes, cooks at or (0.0.22) strikes
    const task = p.task;
    const at = task.kind === 'gather' ? layout.nodes.find(n => n.id === task.nodeId)?.pos
      : task.kind === 'pickup' ? layout.pickups?.find(x => x.id === task.id)?.pos
      : task.kind === 'make' ? undefined : task.kind === 'fight' ? targetOf(state, layout, task.target)?.pos
      : task.kind === 'raise' ? buildSpot(state, layout, task.id)?.face
      : siteOf(layout, 'hearth')?.pos;
    if (at && len(sub(at, p.pos)) > 1e-3) p.heading = angleToward(p.heading, headingOf(sub(at, p.pos)), TURN_RATE * dt);
  }
  return null;
}
