// The rats round the layout's nests (chapter 2, holding the camp, part 2): which rats a layout has (their ids, 'rat1',
// 'rat2', ..., in nest order), the nest each lives round and its home spot by the nest's hole, where it starts and
// where it comes back once beaten; a rat as a new game has it; whether a rat is up; and a saved rat read back: what it
// was doing that matters (its health, whether it is down and until when) is kept, and where it pottered to while that
// is still somewhere it could be (else it is home). systems/rats.ts runs them; core/targets.ts makes them something to
// fight; render/rats.ts draws them. The village has no nests, so no rats.
import type { GameState, RatState } from './state';
import type { Layout, NestSpot, Vec2 } from '../world/layout';
import { navFor } from '../world/nav';
import { POTTER, RAT } from '../data/rats';

/** A rat in a layout: its id, its nest, which of the nest's rats it is, and its home spot by the nest's hole. */
export interface RatSpot { id: string; nest: NestSpot; index: number; home: Vec2 }

/** How far in front of the nest's middle the rats' home spots are, past its edge, and how far apart side by side. */
const HOME = { out: 0.6, apart: 0.6 };

const cache = new WeakMap<Layout, RatSpot[]>();
/** The rats a layout has, in nest order (cached). */
export function ratsOf(layout: Layout): RatSpot[] {
  let rats = cache.get(layout);
  if (rats) return rats;
  rats = [];
  for (const nest of layout.nests ?? []) {
    // in front of the hole (rot as for buildings: 0 faces +z), side by side across it
    const fx = Math.sin(nest.rot), fz = Math.cos(nest.rot), out = nest.radius + HOME.out;
    for (let i = 0; i < nest.rats; i++) {
      const side = (i - (nest.rats - 1) / 2) * HOME.apart;
      rats.push({ id: `rat${rats.length + 1}`, nest, index: i, home: { x: nest.pos.x + fx * out + fz * side, z: nest.pos.z + fz * out - fx * side } });
    }
  }
  cache.set(layout, rats);
  return rats;
}

/** The rat `id` in this layout, or null. */
export const ratSpot = (layout: Layout, id: string): RatSpot | null => ratsOf(layout).find(r => r.id === id) ?? null;

/** Whether rat `id` is up (not beaten, or back again). */
export const ratUp = (state: GameState, id: string) => state.rats[id]?.downUntil === null;

/** The heading (as the character's: 0 faces +x, positive turns towards -z) that faces from `from` to `to`; never -0,
 *  so a saved heading reads back the same. */
export const facing = (from: Vec2, to: Vec2) => Math.atan2(-(to.z - from.z), to.x - from.x) + 0;

/** A rat as it starts, and comes back: at home, full of health, looking out from the nest; it first moves a moment
 *  after `time`, each rat at its own moment. */
export function freshRat(spot: RatSpot, time: number): RatState {
  const out = { x: spot.home.x + Math.sin(spot.nest.rot), z: spot.home.z + Math.cos(spot.nest.rot) };
  return { health: RAT.health, downUntil: null, pos: { ...spot.home }, heading: facing(spot.home, out), to: null, restUntil: time + 1 + spot.index * 1.3, bite: null };
}

/** Every rat in the layout as it starts. */
export const freshRats = (layout: Layout, time: number): Record<string, RatState> =>
  Object.fromEntries(ratsOf(layout).map(r => [r.id, freshRat(r, time)]));

/** Whether a rat of `nest` could be at `p`: on ground he can stand on (with `built` standing), off the nest, within its
 *  roam (and a little more: a scurry may end just past it). */
export function ratCanBe(layout: Layout, built: readonly string[], nest: NestSpot, p: Vec2): boolean {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return false;
  const d = Math.hypot(p.x - nest.pos.x, p.z - nest.pos.z);
  return d > nest.radius && d <= nest.roam + POTTER.hop[1] && navFor(layout, built).walkable(p);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const point = (v: unknown): Vec2 | null => isRecord(v) && finite(v.x) && finite(v.z) ? { x: v.x, z: v.z } : null;

/** The rats in a save (chapter 2), checked against the layout: every rat the layout has, each from the save where it
 *  makes sense. Down until a finite time (at most RAT.back from now: no later than a beating now would give), with no
 *  health; or up with health above 0 up to its most (else full). Where it is, and where it scurries to, while somewhere
 *  it could be (ratCanBe), else home and staying put; a finite heading and time it next moves; its bite under way while
 *  it is up, within one bite's time. A rat the save doesn't have (from before the rats, 0.0.22) is a fresh one, and a
 *  rat the layout doesn't have is dropped. */
export function savedRats(v: unknown, state: GameState, layout: Layout): Record<string, RatState> {
  const out: Record<string, RatState> = {};
  for (const spot of ratsOf(layout)) {
    const fresh = freshRat(spot, state.time), s = isRecord(v) ? v[spot.id] : undefined;
    if (!isRecord(s)) { out[spot.id] = fresh; continue; }
    const downUntil = finite(s.downUntil) ? Math.min(s.downUntil, state.time + RAT.back) : null;
    const health = downUntil !== null ? 0 : finite(s.health) && s.health > 0 ? Math.min(s.health, RAT.health) : RAT.health;
    const at = point(s.pos), pos = at && ratCanBe(layout, state.built, spot.nest, at) ? at : null;
    const to = downUntil === null && pos ? point(s.to) : null;
    out[spot.id] = {
      health, downUntil,
      pos: pos ?? fresh.pos,
      heading: pos && finite(s.heading) ? s.heading : fresh.heading,
      to: to && ratCanBe(layout, state.built, spot.nest, to) ? to : null,
      restUntil: finite(s.restUntil) ? Math.min(s.restUntil, state.time + POTTER.rest[1] + 2) : fresh.restUntil,
      bite: downUntil === null && finite(s.bite) && s.bite >= 0 && s.bite <= RAT.every ? s.bite : null,
    };
  }
  return out;
}
