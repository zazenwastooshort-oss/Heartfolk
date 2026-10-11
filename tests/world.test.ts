// The village map itself: nothing overlaps, everything the player needs is reachable, paths never cross walls.
import { describe, expect, it } from 'vitest';
import { VILLAGE, RING, doorOf, inArea, type Vec2 } from '../src/world/layout';
import { navFor } from '../src/world/nav';
import { RESOURCES } from '../src/data/skills';
import { reachFor } from '../src/actors/player';

const nav = navFor(VILLAGE);
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const radius = (w: number, d: number) => Math.hypot(w, d) / 2;

function pathIsClear(path: Vec2[], from: Vec2): boolean {
  let at = from;
  for (const p of path) { if (!nav.lineOfSight(at, p)) return false; at = p; }
  return true;
}

describe('village layout', () => {
  it('has every slice 1 building, the start on open ground, and data for every rock', () => {
    const kinds = new Set(VILLAGE.buildings.map(b => b.kind));
    for (const k of ['bank', 'cityhall', 'forge', 'stall', 'house'] as const) expect(kinds.has(k), k).toBe(true);
    expect(nav.walkable(VILLAGE.start)).toBe(true);
    for (const n of VILLAGE.nodes) expect(RESOURCES[n.resource], n.id).toBeDefined();
  });

  it('is laid out like a real village: the busiest buildings nearest the square, then workshops, then homes', () => {
    const d = (b: (typeof VILLAGE.buildings)[number]) => dist(b.pos, VILLAGE.hearth.pos);
    for (const a of VILLAGE.buildings) for (const b of VILLAGE.buildings) {
      if (RING[a.kind] < RING[b.kind]) expect(d(a), `${a.id} (ring ${RING[a.kind]}) should be nearer the square than ${b.id} (ring ${RING[b.kind]})`).toBeLessThan(d(b));
    }
    // the square itself stays open: nothing but the hearth, the well, the notice board and benches inside it
    for (const b of VILLAGE.buildings) expect(dist(b.pos, VILLAGE.hearth.pos) - radius(b.w, b.d), b.id).toBeGreaterThan(VILLAGE.square - 0.5);
    // the resources lie beyond the homes
    const homes = Math.max(...VILLAGE.buildings.filter(b => b.kind === 'house').map(d));
    for (const n of VILLAGE.nodes) expect(dist(n.pos, VILLAGE.hearth.pos), n.id).toBeGreaterThan(homes * 0.85);
  });

  it('keeps gardens and props clear of buildings and doors', () => {
    for (const g of VILLAGE.gardens) for (const b of VILLAGE.buildings) {
      expect(dist(g.pos, b.pos), `garden at ${g.pos.x},${g.pos.z} / ${b.id}`).toBeGreaterThan(radius(g.w, g.d) + radius(b.w, b.d) * 0.75);
      expect(nav.walkable(doorOf(b)), `${b.id} door`).toBe(true);
    }
    for (const p of VILLAGE.props) for (const b of VILLAGE.buildings) expect(dist(p.pos, doorOf(b)), `${p.kind} / ${b.id} door`).toBeGreaterThan(p.radius + 0.8);
  });

  it('keeps buildings apart from each other, from rocks, trees and the hearth', () => {
    const bs = VILLAGE.buildings;
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i]!;
      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j]!;
        expect(dist(a.pos, b.pos), `${a.id} / ${b.id}`).toBeGreaterThan(radius(a.w, a.d) * 0.75 + radius(b.w, b.d) * 0.75 + 1);
      }
      for (const n of VILLAGE.nodes) expect(dist(a.pos, n.pos), `${a.id} / ${n.id}`).toBeGreaterThan(radius(a.w, a.d) + n.radius);
      for (const t of VILLAGE.trees.filter(t => inArea(VILLAGE.village, t.pos)))
        expect(dist(a.pos, t.pos), `${a.id} / tree at ${t.pos.x},${t.pos.z}`).toBeGreaterThan(radius(a.w, a.d) * 0.8 + 0.6);
      expect(dist(a.pos, VILLAGE.hearth.pos)).toBeGreaterThan(radius(a.w, a.d) + VILLAGE.hearth.radius + 1);
    }
  });

  it('can reach every door from the start, along paths that never cross a wall', () => {
    for (const b of VILLAGE.buildings) {
      const door = doorOf(b);
      expect(nav.walkable(door), `${b.id} door`).toBe(true);
      const path = nav.findPath(VILLAGE.start, door);
      expect(path, `${b.id} path`).not.toBeNull();
      expect(pathIsClear(path!, VILLAGE.start)).toBe(true);
    }
  });

  it('can reach a working spot beside every rock and tree in the village', () => {
    for (const n of VILLAGE.nodes.filter(n => !n.parcel)) {
      let found = false;
      for (let k = 0; k < 36 && !found; k++) {
        const a = k / 36 * Math.PI * 2, r = reachFor(n), stand = { x: n.pos.x + Math.cos(a) * r, z: n.pos.z + Math.sin(a) * r };
        found = nav.walkable(stand) && nav.findPath(VILLAGE.start, stand) !== null;
      }
      expect(found, n.id).toBe(true);
    }
  });

  it('keeps unclaimed land and the river out of reach', () => {
    for (const parcel of VILLAGE.parcels) {
      const middle = { x: (parcel.area.minX + parcel.area.maxX) / 2, z: (parcel.area.minZ + parcel.area.maxZ) / 2 };
      expect(nav.walkable(middle)).toBe(false);
      expect(inArea(VILLAGE.village, nav.nearestWalkable(middle))).toBe(true);
    }
    for (const p of VILLAGE.river.points) expect(nav.walkable(p)).toBe(false);
    for (const n of VILLAGE.nodes.filter(n => n.parcel)) expect(inArea(VILLAGE.village, n.pos)).toBe(false);
  });

  it('finds paths quickly enough to answer a tap at once', () => {
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) nav.findPath({ x: -20, z: 20 }, { x: 22, z: -20 });
    expect((performance.now() - t0) / 50).toBeLessThan(15);
  });
});
