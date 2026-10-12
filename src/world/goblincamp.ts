// The goblin camp's palisade and what stands inside it (chapter 2, its last part), worked out from the layout's
// GoblinCampSpot (world/camp.ts): the straight stretches of the palisade round its ring, the gap that is the way in, the
// gate on the way on down the river; where the chief's tent door is; what is in the way of walking. Walking
// (world/nav.ts), the goblins (core/goblins.ts) and drawing (render/goblins.ts) all use it. Data only.
import type { GoblinCampSpot, Layout, Vec2 } from './layout';

/** One stretch of the palisade: its middle, which way it faces (out of the camp; a heading as for buildings: 0 faces
 *  +z), how long it is, and what it is: 'wall' (stakes, in the way), 'way' (the gap he walks in through) or 'gate'
 *  (stakes on hinges, shut until the camp is cleared, then standing open; in the way of walking either way, since the
 *  way on beyond it comes in a later update). */
export interface Stretch { pos: Vec2; rot: number; length: number; kind: 'wall' | 'way' | 'gate' }

/** How thick the palisade is for walking (metres either side of its line): its stakes and the rails behind them. */
export const PALISADE_DEPTH = 0.16;
/** How far round its post the totem is in the way. */
export const TOTEM_RADIUS = 0.3;

/** The shortest turn from heading a to heading b, in radians (-PI..PI). */
const turn = (a: number, b: number) => ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;

const cache = new WeakMap<GoblinCampSpot, Stretch[]>();
/** The palisade's stretches, the way in first, then on round the ring (cached): `sides` of them, each from corner to
 *  corner of the ring, the one nearest `gate` the gate. */
export function palisadeOf(camp: GoblinCampSpot): Stretch[] {
  let out = cache.get(camp);
  if (out) return out;
  const step = 2 * Math.PI / camp.sides, inner = camp.radius * Math.cos(step / 2), length = 2 * camp.radius * Math.sin(step / 2);
  let gate = 1;
  for (let k = 1; k < camp.sides; k++) if (Math.abs(turn(camp.way + k * step, camp.gate)) < Math.abs(turn(camp.way + gate * step, camp.gate))) gate = k;
  out = [];
  for (let k = 0; k < camp.sides; k++) {
    const rot = camp.way + k * step;
    out.push({ pos: { x: camp.pos.x + Math.sin(rot) * inner, z: camp.pos.z + Math.cos(rot) * inner }, rot, length, kind: k === 0 ? 'way' : k === gate ? 'gate' : 'wall' });
  }
  cache.set(camp, out);
  return out;
}

/** The stretch of the palisade that is the gate. */
export const gateOf = (camp: GoblinCampSpot) => palisadeOf(camp).find(s => s.kind === 'gate')!;
/** The stretch of the palisade that is the way in. */
export const wayInOf = (camp: GoblinCampSpot) => palisadeOf(camp)[0]!;

/** Where the chief steps out of his tent: just outside its door, facing the camp's middle. */
export function tentDoor(camp: GoblinCampSpot): Vec2 {
  const t = camp.tent, out = t.d / 2 + 0.45;
  return { x: t.pos.x + Math.sin(t.rot) * out, z: t.pos.z + Math.cos(t.rot) * out };
}

/** What in the goblin camp is in the way of walking (world/nav.ts): the palisade's walls and its gate, and the tent,
 *  as turned rectangles (their middle, which way they face, half their length along it and half their depth); the
 *  totem and the cold fire ring as circles. None where the layout has no goblin camp. */
export function goblinCampBlocks(layout: Layout): { rects: { pos: Vec2; rot: number; hw: number; hd: number }[]; circles: [Vec2, number][] } {
  const camp = layout.goblinCamp;
  if (!camp) return { rects: [], circles: [] };
  const rects = palisadeOf(camp).filter(s => s.kind !== 'way').map(s => ({ pos: s.pos, rot: s.rot, hw: s.length / 2 + 0.05, hd: PALISADE_DEPTH }));
  rects.push({ pos: camp.tent.pos, rot: camp.tent.rot, hw: camp.tent.w / 2, hd: camp.tent.d / 2 });
  return { rects, circles: [[camp.totem, TOTEM_RADIUS], [camp.fire.pos, camp.fire.radius]] };
}
