// The water and the foot of the mountain (src/world/water.ts, src/world/falls.ts): one shape for the pool and the
// river (which runs on past the haze), used by drawing and by walking; trees, bushes and things to pick up kept out of
// the water and off its bank, at the camp and in the village; the rocks at the wall's foot clear of the water and of
// everything he needs, the big ones blocking his way, and the scree slope off the walkable land.
import { describe, expect, it } from 'vitest';
import { CAMP } from '../src/world/camp';
import { VILLAGE, inArea, type Layout, type Vec2 } from '../src/world/layout';
import { navFor } from '../src/world/nav';
import { SHORE_CLEAR, waterOf } from '../src/world/water';
import { APRON, BLOCKING, footOf, wallFootZ } from '../src/world/falls';
import { reachFor, PICKUP_REACH } from '../src/actors/player';

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

describe.each([['the camp', CAMP], ['the village', VILLAGE]] as [string, Layout][])('the water at %s', (_name, layout) => {
  const water = waterOf(layout), nav = navFor(layout);

  it('keeps every tree, bush and rock to work out of the water and off its bank', () => {
    for (const t of layout.trees) expect(water.edge(t.pos), `${t.kind} at ${t.pos.x.toFixed(1)}, ${t.pos.z.toFixed(1)}`).toBeGreaterThan(SHORE_CLEAR);
    for (const b of layout.bushes) expect(water.edge(b), `bush at ${b.x}, ${b.z}`).toBeGreaterThan(SHORE_CLEAR);
    for (const n of layout.nodes) expect(water.edge(n.pos), n.id).toBeGreaterThan(SHORE_CLEAR);
  });

  it('keeps everything to pick up on dry land', () => {
    for (const p of layout.pickups ?? []) expect(water.edge(p.pos), p.id).toBeGreaterThan(0.1);
  });

  it('walking follows the same shape: dry land up to the edge, never the water', () => {
    const a = layout.village;
    let wetChecked = 0;
    for (let x = a.minX + 0.05; x < a.maxX; x += 0.23) for (let z = a.minZ + 0.05; z < a.maxZ; z += 0.23) {
      const e = water.edge({ x, z });
      if (nav.walkable({ x, z })) expect(e, `${x.toFixed(2)}, ${z.toFixed(2)}`).toBeGreaterThan(0);
      if (e < 0) { expect(nav.walkable({ x, z })).toBe(false); wetChecked++; }
    }
    if (layout === CAMP) expect(wetChecked).toBeGreaterThan(500);
    for (const p of layout.river.points) expect(water.edge(p)).toBeLessThan(0);
  });

  it('runs as one channel along the river, its width changing a little and its banks not straight', () => {
    const widths: number[] = [];
    for (let i = 0; i < layout.river.points.length - 1; i++) {
      const a = layout.river.points[i]!, b = layout.river.points[i + 1]!;
      for (let t = 0; t <= 1; t += 0.1) {
        const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        expect(water.edge(p)).toBeLessThan(0);                           // no dry gap anywhere along it
        // across the river, perpendicular to it
        const l = Math.hypot(b.x - a.x, b.z - a.z), sx = -(b.z - a.z) / l, sz = (b.x - a.x) / l;
        let w = 0;
        for (let o = -6; o <= 6; o += 0.05) if (water.edge({ x: p.x + sx * o, z: p.z + sz * o }) < 0) w += 0.05;
        widths.push(w);
      }
    }
    const pool = layout.falls?.pool;
    const river = widths.filter((_, i) => !pool || i > 12);             // past the pool
    expect(Math.min(...river)).toBeGreaterThan(layout.river.width * 0.7);
    expect(Math.max(...river)).toBeLessThan(layout.river.width * 1.6);
    expect(Math.max(...river) - Math.min(...river)).toBeGreaterThan(0.5);
  });

  it('runs on past each end that is not in the pool, out past the haze, so its end is never seen', () => {
    // the haze is thick 75 m past the farthest zoom (render/lighting.ts, render/camera.ts): look 80 m on, and halfway
    const pts = layout.river.points, pool = layout.falls?.pool;
    for (const [e, q] of [[pts[0]!, pts[1]!], [pts.at(-1)!, pts.at(-2)!]] as [Vec2, Vec2][]) {
      if (pool && dist(e, pool.pos) < pool.radius) continue;
      const l = dist(e, q);
      for (const on of [40, 80]) expect(water.edge({ x: e.x + (e.x - q.x) / l * on, z: e.z + (e.z - q.z) / l * on }), `${on} m past ${e.x}, ${e.z}`).toBeLessThan(-1);
    }
  });
});

describe('the pool below the falls', () => {
  const water = waterOf(CAMP), { pool, lip } = CAMP.falls!;
  /** How far from the pool's middle the water's edge is, in the direction a. */
  const reach = (a: number) => { let r = 0; while (water.edge({ x: pool.pos.x + Math.cos(a) * r, z: pool.pos.z + Math.sin(a) * r }) < 0 && r < 40) r += 0.02; return r; };

  it('is an irregular round pool, not a circle, opening into the river and reaching in under the falling water', () => {
    // round the sides away from the river and the falls, the edge comes and goes
    const sides = [-20, 0, 20, 40, 60, 150, 170, 190, 210].map(d => reach(d * Math.PI / 180));
    expect(Math.max(...sides) - Math.min(...sides)).toBeGreaterThan(0.4);
    for (const r of sides) { expect(r).toBeGreaterThan(pool.radius * 0.85); expect(r).toBeLessThan(pool.radius * 1.35); }
    // downstream it carries on into the river
    expect(reach(Math.atan2(CAMP.river.points[1]!.z - pool.pos.z, CAMP.river.points[1]!.x - pool.pos.x))).toBeGreaterThan(9);
    // where the water lands, right in under the wall
    expect(water.edge({ x: lip.x, z: lip.z + 0.4 })).toBeLessThan(-0.5);
    expect(water.edge({ x: lip.x, z: wallFootZ(CAMP.falls!, lip.x) })).toBeLessThan(0);
  });

  it('leaves him on dry land by the pool where he washes up, with the wreck strewn along its bank', () => {
    expect(water.edge(CAMP.start)).toBeGreaterThan(1);
    expect(water.edge(CAMP.start)).toBeLessThan(3.5);
  });
});

describe('the foot of the mountain', () => {
  const falls = CAMP.falls!, foot = footOf(CAMP), water = waterOf(CAMP), nav = navFor(CAMP), area = CAMP.village;

  it('has a scree slope that stays off the walkable land', () => {
    for (let x = area.minX; x <= area.maxX; x += 0.5) expect(wallFootZ(falls, x) + APRON, `x ${x}`).toBeLessThan(area.minZ - 0.3);
  });

  it('has broken rock of every size: a few big boulders, more smaller rocks, and plenty of rubble', () => {
    const kind = (k: string) => foot.rocks.filter(r => r.kind === k);
    expect(kind('boulder').length).toBeGreaterThan(15);
    expect(kind('rock').length).toBeGreaterThan(kind('boulder').length);
    expect(kind('rubble').length).toBeGreaterThan(kind('rock').length * 2);
    const sizes = kind('boulder').map(r => r.radius);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeGreaterThan(0.8);
    expect(foot.ferns.length).toBeGreaterThan(10);
  });

  it('keeps its rocks and ferns out of the water and clear of everything he needs', () => {
    for (const r of foot.rocks) {
      expect(water.edge(r.pos)).toBeGreaterThan(r.radius * 0.5 > 0.5 ? -r.radius : 0);
      expect(dist(r.pos, CAMP.start)).toBeGreaterThan(r.radius + 1);
      for (const p of CAMP.pickups!) expect(dist(r.pos, p.pos), p.id).toBeGreaterThan(r.radius + 0.5);
      for (const n of CAMP.nodes) expect(dist(r.pos, n.pos), n.id).toBeGreaterThan(r.radius + n.radius + 0.5);
    }
    for (const f of foot.ferns) for (const p of CAMP.pickups!) expect(dist(f, p.pos), p.id).toBeGreaterThan(0.8);
  });

  it('blocks walking with the rocks big enough to stand in the way, and lets him step over rubble', () => {
    const big = foot.rocks.filter(r => r.radius >= BLOCKING && inArea(area, r.pos));
    const small = foot.rocks.filter(r => r.radius < 0.2 && inArea(area, r.pos));
    expect(big.length).toBeGreaterThan(0);
    expect(small.length).toBeGreaterThan(0);
    for (const r of big) expect(nav.walkable(r.pos), `${r.pos.x.toFixed(1)}, ${r.pos.z.toFixed(1)}`).toBe(false);
    expect(small.filter(r => nav.walkable(r.pos)).length).toBeGreaterThan(small.length / 2);
    // everything to work or pick up near the wall can still be reached
    for (const p of CAMP.pickups!) {
      let ok = false;
      for (let k = 0; k < 24 && !ok; k++) {
        const a = k / 24 * Math.PI * 2, s = { x: p.pos.x + Math.cos(a) * PICKUP_REACH.at(-1)!, z: p.pos.z + Math.sin(a) * PICKUP_REACH.at(-1)! };
        ok = nav.walkable(s) && nav.findPath(CAMP.start, s) !== null;
      }
      expect(ok, p.id).toBe(true);
    }
    for (const n of CAMP.nodes) {
      let ok = false;
      for (let k = 0; k < 36 && !ok; k++) {
        const a = k / 36 * Math.PI * 2, s = { x: n.pos.x + Math.cos(a) * reachFor(n), z: n.pos.z + Math.sin(a) * reachFor(n) };
        ok = nav.walkable(s) && nav.findPath(CAMP.start, s) !== null;
      }
      expect(ok, n.id).toBe(true);
    }
  });

  it('keeps the woods off the slope', () => {
    for (const t of CAMP.trees) expect(t.pos.z, `${t.pos.x.toFixed(1)}, ${t.pos.z.toFixed(1)}`).toBeGreaterThan(wallFootZ(falls, t.pos.x) + APRON + 0.5);
  });
});
