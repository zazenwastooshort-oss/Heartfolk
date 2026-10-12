// The foot of the mountain wall at the camp (world/camp.ts, Falls): where the wall stands, the scree slope banked up
// against it, and the broken rock lying on and below that slope (a few big boulders, more smaller rocks, and rubble
// thinning out onto the grass), with ferns between them. Headless and the same every time, so the drawing
// (render/waterfall.ts, and the stony ground in render/world.ts), walking (world/nav.ts: rocks big enough to stand in
// the way block) and the scatter of trees all use the same shapes.
import type { Falls, Layout, Vec2 } from './layout';
import { waterOf } from './water';

const STRAIGHT = 38;            // the wall's foot runs straight for this far either side of the clearing...
const CURVE = 0.011;            // ...then curves forward into shoulders this sharply
const CENTRE_X = 0;             // the clearing the wall stands round
/** The scree slope runs this far out from the wall's foot (it stays off the walkable land: tests/water.test.ts)... */
export const APRON = 2.5;
/** ...from about this high against the wall, down to the ground. */
export const APRON_HIGH = 2.2;
/** Loose rubble lies up to this far out from the foot. */
export const RUBBLE = 7.5;
/** Rocks at least this big (in radius) stand in the way of walking; smaller ones are stepped over. */
export const BLOCKING = 0.3;

/** Where the foot of the wall is at x, before the rock's jags: straight across the clearing, curving forward into
 *  shoulders at the sides. */
export function wallFootZ(falls: Falls, x: number): number {
  const out = Math.max(0, Math.abs(x - CENTRE_X) - STRAIGHT);
  return falls.lip.z - 0.3 + CURVE * out * out;
}

const smoothstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** How high the scree slope is at (x, z): APRON_HIGH against the wall, falling away to nothing APRON out. It gives way
 *  where the water lands (the pool reaches the rock there) and never rises out of the water. */
export function slopeY(falls: Falls, water: { edge(p: Vec2): number }, x: number, z: number): number {
  const u = Math.max(0, (z - wallFootZ(falls, x)) / APRON);
  if (u >= 1) return 0;
  const gap = smoothstep(falls.width / 2 + 1.4, falls.width / 2 + 5.5, Math.abs(x - falls.lip.x));
  return APRON_HIGH * Math.pow(1 - u, 1.6) * gap * smoothstep(0.2, 1.6, water.edge({ x, z }));
}

/** A rock at the foot of the wall: radius is the ground it covers; y how high its middle sits; tone its shade. */
export interface FootRock { pos: Vec2; radius: number; y: number; tone: number; kind: 'boulder' | 'rock' | 'rubble' }
export interface Foot { rocks: FootRock[]; ferns: Vec2[] }

function seeded(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

const cache = new WeakMap<Layout, Foot>();
/** The rocks and ferns at the foot of the layout's wall (none without falls). Kept clear of the water, the trees and
 *  rocks to work, everything to pick up, the debris, where he starts, and where the tent and the campfire will go. */
export function footOf(layout: Layout): Foot {
  const hit = cache.get(layout);
  if (hit) return hit;
  const foot: Foot = { rocks: [], ferns: [] }, falls = layout.falls;
  cache.set(layout, foot);
  if (!falls) return foot;
  const r = seeded(31), water = waterOf(layout), half = falls.width / 2;
  const d = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
  const clear = (p: Vec2, rad: number) =>
    water.edge(p) > rad + 0.25
    && Math.abs(p.x - falls.lip.x) > half + 1.6
    && d(p, layout.start) > rad + 1.6
    && d(p, layout.hearth.pos) > rad + 2.2
    && (!layout.camp || d(p, layout.camp.tent.pos) > rad + 2.4)
    && layout.nodes.every(n => d(p, n.pos) > rad + n.radius + 0.9)
    && (layout.pickups ?? []).every(k => d(p, k.pos) > rad + 0.9)
    && (layout.debris ?? []).every(k => d(p, k.pos) > rad + k.radius + 0.4)
    && layout.trees.every(t => d(p, t.pos) > rad + 0.6)
    && foot.rocks.every(o => d(p, o.pos) > (rad + o.radius) * 0.8);
  /** A spot `out` metres in front of the foot at x. */
  const at = (x: number, out: number): Vec2 => ({ x, z: wallFootZ(falls, x) + out });
  const add = (p: Vec2, rad: number, kind: FootRock['kind'], sink: number) => {
    foot.rocks.push({ pos: p, radius: rad, y: slopeY(falls, water, p.x, p.z) + rad * sink, tone: 0.78 + r() * 0.3, kind });
  };
  // the two big ones either side of where the water lands
  for (const side of [-1, 1]) add({ x: falls.lip.x + side * (half + 2.2), z: falls.lip.z + 0.6 }, 1.5, 'boulder', 0.45);
  // boulders fallen against the wall, of every size, some well out on the slope
  for (let x = CENTRE_X - STRAIGHT - 14; x <= CENTRE_X + STRAIGHT + 14; x += 2.4 + r() * 2.8) {
    const rad = 0.7 + r() * r() * 1.6, p = at(x + (r() - 0.5) * 1.2, 0.3 + r() * APRON * 0.7);
    if (clear(p, rad)) add(p, rad, 'boulder', 0.3 + r() * 0.25);
  }
  // broken rocks on the slope and just below it
  for (let i = 0; i < 220; i++) {
    const rad = 0.3 + r() * 0.45, p = at(CENTRE_X + (r() - 0.5) * 2 * (STRAIGHT + 14), 0.3 + Math.pow(r(), 1.4) * (APRON + 2.2));
    if (clear(p, rad)) add(p, rad, 'rock', 0.2 + r() * 0.2);
  }
  // rubble, thick on the slope and thinning out onto the grass
  for (let i = 0; i < 1300; i++) {
    const rad = 0.08 + r() * 0.17, p = at(CENTRE_X + (r() - 0.5) * 2 * (STRAIGHT + 14), 0.2 + Math.pow(r(), 1.9) * RUBBLE);
    if (clear(p, rad)) add(p, rad, 'rubble', 0.1);
  }
  // ferns where the slope meets the grass, and here and there among the rocks
  for (let i = 0; i < 260 && foot.ferns.length < 70; i++) {
    const p = at(CENTRE_X + (r() - 0.5) * 2 * (STRAIGHT + 14), APRON * 0.55 + r() * 3.2);
    if (clear(p, 0.5) && foot.ferns.every(f => d(f, p) > 1.1)) foot.ferns.push(p);
  }
  return foot;
}
