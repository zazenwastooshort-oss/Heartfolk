// Where each step built at the camp's spots stands (the camp build, 13 Oct 2026; shapes in data/building.ts SHAPES):
// its middle and the way it faces (its spot's, from siteOf in world/layout.ts, moved `at` along that way and turned by
// `turn`), what of it is in the way of walking (world/nav.ts blocks by it), where he stands at it, and how far its ring
// reaches. Headless: core/ and render/ place things by it too.
import type { Layout, Vec2 } from './layout';
import { siteOf } from './layout';
import { makeDef, type MakeId } from '../data/making';
import { SHAPES, type Shape, type StepPoint } from '../data/building';

/** Where a step stands: its middle, and which way its front faces (rot as a building's: 0 faces +z). */
export interface StepPlace { pos: Vec2; rot: number }

/** A box of a step in the way, on the ground: its middle, its turn, and half its width (across) and depth (along). */
export interface BlockBox { pos: Vec2; rot: number; hw: number; hd: number }

/** What of a step is in the way, on the ground: boxes, and rings (a middle and a radius). */
export interface Blocks { boxes: BlockBox[]; rings: [Vec2, number][] }

/** The shape of `id` (data/building.ts), or null for something with none (a tool, or an id from an old save). */
export const shapeOf = (id: string): Shape | null => Object.hasOwn(SHAPES, id) ? SHAPES[id as MakeId]! : null;

/** Where `id` stands in this layout (its spot's middle, moved and turned by its shape), or null where it has no place
 *  here (the village, or something made where he stands). */
export function stepPlace(layout: Layout, id: string): StepPlace | null {
  const def = makeDef(id), shape = shapeOf(id);
  if (!def || !shape || def.at === 'here') return null;
  const site = siteOf(layout, def.at);
  if (!site) return null;
  const facing = site.rot ?? 0, at = shape.at ?? 0;
  return { pos: { x: site.pos.x + Math.sin(facing) * at, z: site.pos.z + Math.cos(facing) * at }, rot: facing + (shape.turn ?? 0) };
}

/** A point in a step's own frame (data/building.ts StepPoint), on the ground. */
export function toGround(place: StepPlace, [x, z]: StepPoint): Vec2 {
  const c = Math.cos(place.rot), s = Math.sin(place.rot);
  return { x: place.pos.x + x * c + z * s, z: place.pos.z - x * s + z * c };
}

/** A point on the ground, in a step's own frame. */
export function toStep(place: StepPlace, p: Vec2): [number, number] {
  const dx = p.x - place.pos.x, dz = p.z - place.pos.z, c = Math.cos(place.rot), s = Math.sin(place.rot);
  return [dx * c - dz * s, dx * s + dz * c];
}

/** What of `id` is in the way in this layout (none where it has no place, and none for furniture, which stands inside
 *  the shelter). */
export function blocksOf(layout: Layout, id: string): Blocks {
  const place = stepPlace(layout, id), shape = shapeOf(id), out: Blocks = { boxes: [], rings: [] };
  if (!place || !shape || shape.furniture) return out;
  for (const b of shape.blocks) {
    if ('box' in b) {
      const [x0, x1, z0, z1] = b.box;
      out.boxes.push({ pos: toGround(place, [(x0 + x1) / 2, (z0 + z1) / 2]), rot: place.rot, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2 });
    } else {
      const [x, z, r] = b.ring;
      out.rings.push([toGround(place, [x, z]), r]);
    }
  }
  return out;
}

/** How far a point on the ground is outside the blocks of `id` (0 or less: inside one; Infinity with none). */
export function outsideOf(layout: Layout, id: string, p: Vec2): number {
  const { boxes, rings } = blocksOf(layout, id);
  let best = Infinity;
  for (const b of boxes) {
    const dx = p.x - b.pos.x, dz = p.z - b.pos.z, c = Math.cos(b.rot), s = Math.sin(b.rot);
    const lx = Math.abs(dx * c - dz * s) - b.hw, lz = Math.abs(dx * s + dz * c) - b.hd;
    best = Math.min(best, lx <= 0 && lz <= 0 ? Math.max(lx, lz) : Math.hypot(Math.max(0, lx), Math.max(0, lz)));
  }
  for (const [c, r] of rings) best = Math.min(best, Math.hypot(p.x - c.x, p.z - c.z) - r);
  return best;
}

/** Where he stands at `id` to build it and use it, on the ground (none where it has no place, or its shape has none:
 *  round things, which he stands beside on whichever side is nearest). */
export function standsOf(layout: Layout, id: string): Vec2[] {
  const place = stepPlace(layout, id), shape = shapeOf(id);
  return place && shape?.stands ? shape.stands.map(p => toGround(place, p)) : [];
}

/** How far round its middle the ring of `id` reaches (0 for something without a shape). */
export const reachOf = (id: string): number => shapeOf(id)?.reach ?? 0;
