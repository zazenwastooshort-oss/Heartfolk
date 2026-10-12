// The water on a map, as one shape: the river (a smooth channel through the layout's river points, its banks gently
// wavy and its width changing a little along it) and, at the camp, the pool below the falls (an irregular round basin
// reaching in under the falling water, which opens smoothly into the river). render/world.ts draws the water and its
// sandy bank from this shape, world/nav.ts keeps walking out of it, and the layouts keep their trees and bushes off it
// and its bank, so what is seen is what blocks.
import type { Area, Falls, Layout, Vec2 } from './layout';

/** The sandy bank runs this far from the water's edge. */
export const BANK = 1.3;
/** Trees, bushes and the grass keep at least this far from the water: off the bank, and a little more. */
export const SHORE_CLEAR = BANK + 0.6;

export interface Water {
  /** How far p is from the water's edge, in metres: negative in the water, positive on land. Close to the true
   *  distance near the edge (it never changes faster than about a metre per metre); far from the water it may come
   *  out lower than the true distance, but always more than 4 m. */
  edge(p: Vec2): number;
  /** a box round all of the water */
  bounds: Area;
}

const STEP = 0.5;                // the river's middle line is sampled this often, in metres
const RUN_ON = 14;               // the river curves on this far past its last point, off the edge of the map...
const RUN_FAR = 72;              // ...then runs straight on this much further, out past the haze (render/lighting.ts)
const JOIN = 2.6;                // how wide the curve is where the pool opens into the river

/** A smooth line through `points` (Catmull-Rom), as points about `step` apart. */
function smooth(points: Vec2[], step: number): Vec2[] {
  if (points.length < 2) return points.map(p => ({ ...p }));
  const n = points.length, P = [
    { x: 2 * points[0]!.x - points[1]!.x, z: 2 * points[0]!.z - points[1]!.z }, ...points,
    { x: 2 * points[n - 1]!.x - points[n - 2]!.x, z: 2 * points[n - 1]!.z - points[n - 2]!.z },
  ];
  const out: Vec2[] = [];
  for (let i = 1; i < P.length - 2; i++) {
    const a = P[i - 1]!, b = P[i]!, c = P[i + 1]!, d = P[i + 2]!, k = Math.max(1, Math.ceil(Math.hypot(c.x - b.x, c.z - b.z) / step));
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const f = (p0: number, p1: number, p2: number, p3: number) =>
        0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
      out.push({ x: f(a.x, b.x, c.x, d.x), z: f(a.z, b.z, c.z, d.z) });
    }
  }
  out.push({ ...points[n - 1]! });
  return out;
}

/** Smooth minimum: the smaller of a and b, rounded off where they are within k of each other (a fillet). */
function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function waterShape(river: Layout['river'], falls?: Falls): Water {
  const pool = falls?.pool;
  /** The pool's radius in the direction a (radians): round, but not a circle. */
  const poolR = (a: number) => pool!.radius * (1 + 0.11 * Math.sin(2 * a + 0.6) + 0.08 * Math.sin(3 * a + 2.2) + 0.045 * Math.sin(5 * a + 0.9));
  const inPool = (p: Vec2) => !!pool && Math.hypot(p.x - pool.pos.x, p.z - pool.pos.z) < pool.radius;
  // the river runs on past an end that isn't in the pool, so it never stops short on the map: curving on a little way,
  // then straight on (below)
  const given = river.points, n = given.length, pts = given.map(p => ({ ...p }));
  /** a point d metres on past e, carrying on from q */
  const past = (e: Vec2, q: Vec2, d: number) => { const l = Math.hypot(e.x - q.x, e.z - q.z) || 1; return { x: e.x + (e.x - q.x) / l * d, z: e.z + (e.z - q.z) / l * d }; };
  const runsOn = [n >= 2 && !inPool(given[0]!), n >= 2 && !inPool(given[n - 1]!)];
  if (runsOn[0]) pts.unshift(past(given[0]!, given[1]!, RUN_ON));
  if (runsOn[1]) pts.push(past(given[n - 1]!, given[n - 2]!, RUN_ON));
  const line = smooth(pts, STEP), along = [0];
  for (let i = 1; i < line.length; i++) along.push(along[i - 1]! + Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.z - line[i - 1]!.z));
  // ...then straight on far past the haze as one long stretch, so its end is never seen (the curve arrives heading
  // straight on). Distances along the curve stay as they were, so its banks don't change.
  if (runsOn[1]) { line.push(past(line[line.length - 1]!, line[line.length - 2]!, RUN_FAR)); along.push(along[along.length - 1]! + RUN_FAR); }
  if (runsOn[0]) { line.unshift(past(line[0]!, line[1]!, RUN_FAR)); along.unshift(-RUN_FAR); }
  const half = river.width / 2;
  /** Half the river's width at s metres along it, on the left (side 1) or right (side -1) bank. */
  const halfAt = (s: number, side: number) => half * (1 + 0.1 * Math.sin(0.21 * s + 0.7) + 0.06 * Math.sin(0.53 * s + 2.1))
    + (side > 0 ? 0.2 * Math.sin(0.37 * s + 1.3) + 0.09 * Math.sin(0.91 * s) : 0.2 * Math.sin(0.31 * s + 4.0) + 0.09 * Math.sin(0.83 * s + 1));
  const riverEdge = (p: Vec2) => {
    let best = Infinity, s = 0, side = 1;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!, b = line[i + 1]!, abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz;
      const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / l2)) : 0;
      const d = Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
      if (d < best) { best = d; s = along[i]! + t * (along[i + 1]! - along[i]!); side = abx * (p.z - a.z) - abz * (p.x - a.x) >= 0 ? 1 : -1; }
    }
    return best - halfAt(s, side);
  };
  // the pool: an irregular round basin, drawn out a little towards the falls so it reaches in under the water
  const lip = falls ? { x: falls.lip.x, z: falls.lip.z - 1.2 } : null, wide = falls ? falls.width / 2 + 1.1 : 0;
  const poolEdge = (p: Vec2) => {
    const c = pool!.pos, dx = p.x - c.x, dz = p.z - c.z, round = Math.hypot(dx, dz) - poolR(Math.atan2(dz, dx));
    // a tapering stretch from the middle of the pool to under the falls
    const ax = lip!.x - c.x, az = lip!.z - c.z, l2 = ax * ax + az * az, t = Math.max(0, Math.min(1, (dx * ax + dz * az) / l2));
    const reach = Math.hypot(dx - ax * t, dz - az * t) - (pool!.radius * 0.8 * (1 - t) + wide * t);
    return Math.min(round, reach);
  };

  const xs = line.map(p => p.x), zs = line.map(p => p.z), pad = half * 1.4 + 0.6;
  const bounds: Area = { minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minZ: Math.min(...zs) - pad, maxZ: Math.max(...zs) + pad };
  if (pool && lip) {
    const r = pool.radius * 1.25;
    bounds.minX = Math.min(bounds.minX, pool.pos.x - r, lip.x - wide); bounds.maxX = Math.max(bounds.maxX, pool.pos.x + r, lip.x + wide);
    bounds.minZ = Math.min(bounds.minZ, pool.pos.z - r, lip.z - wide); bounds.maxZ = Math.max(bounds.maxZ, pool.pos.z + r, lip.z + wide);
  }
  return {
    bounds,
    edge(p: Vec2) {
      // well away from the water, the distance to its box is enough (and quick)
      const ox = Math.max(bounds.minX - p.x, 0, p.x - bounds.maxX), oz = Math.max(bounds.minZ - p.z, 0, p.z - bounds.maxZ), out = Math.hypot(ox, oz);
      if (out > 4) return out;
      const r = riverEdge(p);
      return pool ? smin(r, poolEdge(p), JOIN) : r;
    },
  };
}

const cache = new WeakMap<Layout, Water>();
/** The water on a layout's map (cached). */
export function waterOf(layout: Layout): Water {
  let w = cache.get(layout);
  if (!w) { w = waterShape(layout.river, layout.falls); cache.set(layout, w); }
  return w;
}
