// Walking: a grid over the village marking where a person can stand, A* paths across it, and smoothing so the
// paths are straight lines between corners. Buildings, fenced gardens, rocks, tree trunks, the hearth (when one
// stands there), what he has built or begun at the camp's spots (each step by its own shape: world/steps.ts, SHAPES in
// data/building.ts; the campfire's ring, the tent's box, the wall tent's walls and porch), lantern posts, props (the
// well, benches, crates), the water (the river and the pool below the falls, one shape: world/water.ts), the bigger
// rocks at the foot of the camp's wall (world/falls.ts), the wreck's debris and (chapter 2) the berry bushes, the rats'
// nests and the goblin camp's palisade, tent, totem and fire ring block (world/goblincamp.ts); things lying on the
// ground to pick up, and rubble, don't. The forest and land not yet claimed lie outside the walkable area, which is the
// layout's `village` and any more `land` joined to it (the camp's way down the river).
import type { Area, Layout, Vec2 } from './layout';
import { inArea } from './layout';
import { PICKUPS } from '../data/pickups';
import { waterOf } from './water';
import { BLOCKING, footOf } from './falls';
import { goblinCampBlocks } from './goblincamp';
import { blocksOf } from './steps';

const CELL = 0.4;
const MARGIN = 0.35;                 // keep this far from walls, so the character doesn't clip them

/** Distance from p to the nearest point of a polyline. */
export function distToLine(p: Vec2, line: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!, b = line[i + 1]!, abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t)));
  }
  return best;
}

/** The land he can walk on: the layout's `village`, and (chapter 2) any more `land` joined to it. */
export const landOf = (layout: Layout): Area[] => [layout.village, ...(layout.land ?? [])];

/** The box round all of it. */
function boundsOf(land: Area[]): Area {
  return { minX: Math.min(...land.map(a => a.minX)), maxX: Math.max(...land.map(a => a.maxX)), minZ: Math.min(...land.map(a => a.minZ)), maxZ: Math.max(...land.map(a => a.maxZ)) };
}

export class NavGrid {
  readonly nx: number; readonly nz: number;
  private blocked: Uint8Array;
  /** the land within `area` he can walk on: `area` itself, or (with more `land` in the layout) the layout's land */
  private land: Area[];

  /** built: what stands at the layout's spots (GameState.built); begun: what he has begun there (GameState.underway).
   *  Each blocks by its own shape at its spot (blocksOf in world/steps.ts), from its footings on, like a building. */
  constructor(private area: Area, layout: Layout, built: readonly string[] = [], begun: readonly string[] = []) {
    this.land = layout.land?.length ? landOf(layout) : [area];
    this.nx = Math.ceil((area.maxX - area.minX) / CELL);
    this.nz = Math.ceil((area.maxZ - area.minZ) / CELL);
    this.blocked = new Uint8Array(this.nx * this.nz);
    // what he has built or begun: a round part (the campfire) blocks out to its radius, a box (the tent) by its own
    // width and depth, turned its way, like a building
    const steps = [...new Set([...built, ...begun])].map(id => blocksOf(layout, id));
    const goblins = goblinCampBlocks(layout);
    const circles: [Vec2, number][] = [
      ...(layout.hearthModel !== null ? [[layout.hearth.pos, layout.hearth.radius] as [Vec2, number]] : []),
      ...steps.flatMap(b => b.rings),
      ...layout.nodes.map(n => [n.pos, n.radius * 0.8] as [Vec2, number]),
      ...layout.trees.map(t => [t.pos, (t.kind === 'oak' ? 0.4 : 0.3) * t.size] as [Vec2, number]),
      ...layout.bushes.map(b => [b, 0.45] as [Vec2, number]),
      // the berry bushes (chapter 2): growing there, picked or not
      ...(layout.pickups ?? []).flatMap(x => { const plant = PICKUPS[x.kind].plant; return plant ? [[x.pos, plant.radius] as [Vec2, number]] : []; }),
      // the rats' nests (chapter 2)
      ...(layout.nests ?? []).map(n => [n.pos, n.radius] as [Vec2, number]),
      ...layout.lanterns.map(l => [l, 0.2] as [Vec2, number]),
      ...layout.props.map(p => [p.pos, p.radius] as [Vec2, number]),
      // at the camp: the wreck's ribs at the water's edge, and the rocks fallen at the foot of the wall
      ...(layout.debris ?? []).filter(d => d.radius > 0).map(d => [d.pos, d.radius] as [Vec2, number]),
      // (as wide as they are drawn: render/waterfall.ts stretches each to 1.12 of its radius one way, 0.88 the other)
      ...footOf(layout).rocks.filter(k => k.radius >= BLOCKING).map(k => [k.pos, k.radius * 1.05] as [Vec2, number]),
      // (chapter 2) the goblin camp's totem and cold fire ring
      ...goblins.circles,
    ];
    // a cell by the water is open only if all of it is dry land (its centre is half a diagonal from its corners), so
    // he walks right to the water's edge but never into it
    const water = waterOf(layout), waterClear = CELL * Math.SQRT1_2;
    // gardens block with their fence, a little larger than the soil
    const rects = [
      ...layout.buildings.map(b => ({ pos: b.pos, rot: b.rot, hw: b.w / 2 + MARGIN, hd: b.d / 2 + MARGIN })),
      ...layout.gardens.map(g => ({ pos: g.pos, rot: g.rot, hw: g.w / 2 + 0.3 + MARGIN, hd: g.d / 2 + 0.3 + MARGIN })),
      ...steps.flatMap(b => b.boxes).map(b => ({ pos: b.pos, rot: b.rot, hw: b.hw + MARGIN, hd: b.hd + MARGIN })),
      // (chapter 2) the goblin camp's palisade, its gate and the chief's tent
      ...goblins.rects.map(b => ({ pos: b.pos, rot: b.rot, hw: b.hw + MARGIN, hd: b.hd + MARGIN })),
    ];
    for (let iz = 0; iz < this.nz; iz++) for (let ix = 0; ix < this.nx; ix++) {
      const p = this.center(ix, iz);
      let block = !this.onLand(p);                           // edge cells whose middle lies off the land
      if (!block) for (const b of rects) {
        const dx = p.x - b.pos.x, dz = p.z - b.pos.z, c = Math.cos(b.rot), s = Math.sin(b.rot);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;      // into the building's own frame
        if (Math.abs(lx) <= b.hw && Math.abs(lz) <= b.hd) { block = true; break; }
      }
      if (!block) for (const [c, r] of circles) if (Math.hypot(p.x - c.x, p.z - c.z) <= r + MARGIN * 0.5) { block = true; break; }
      if (!block && water.edge(p) <= waterClear) block = true;   // where the land reaches the water
      if (block) this.blocked[iz * this.nx + ix] = 1;
    }
  }

  private center(ix: number, iz: number): Vec2 { return { x: this.area.minX + (ix + 0.5) * CELL, z: this.area.minZ + (iz + 0.5) * CELL }; }
  private cellOf(p: Vec2): [number, number] { return [Math.floor((p.x - this.area.minX) / CELL), Math.floor((p.z - this.area.minZ) / CELL)]; }
  private open(ix: number, iz: number): boolean { return ix >= 0 && iz >= 0 && ix < this.nx && iz < this.nz && !this.blocked[iz * this.nx + ix]; }
  private onLand(p: Vec2): boolean { return this.land.some(a => inArea(a, p)); }

  /** Whether he can stand at p. With more `land` joined to the layout's `village`, the land is whole cells (a cell is
   *  land when its middle is), so no sliver where the pieces meet is off the land while its cell is open: a straight
   *  walk from one piece to the other never leaves the land, and a save made anywhere on the way loads there. */
  walkable(p: Vec2): boolean { return (this.land.length > 1 || this.onLand(p)) && this.open(...this.cellOf(p)); }

  /** The walkable spot closest to p (p itself if it is walkable), also for a point off the grid, such as a tap
   *  across the river. Searches square rings of cells round p's cell, outward. The first ring with an open cell
   *  isn't enough: a cell in ring r can be up to r * 1.41 cells away, so a closer one may lie in a later ring. Every
   *  cell in ring r is at least r - 0.5 cells from p, so the search stops once that passes the best distance found. */
  nearestWalkable(p: Vec2): Vec2 {
    if (this.walkable(p)) return { ...p };
    const [cx, cz] = this.cellOf(p), lastX = this.nx - 1, lastZ = this.nz - 1;
    const first = Math.max(0, -cx, cx - lastX, -cz, cz - lastZ);      // the first ring that reaches the grid
    const last = Math.max(cx, lastX - cx, cz, lastZ - cz);            // the ring through the grid's farthest corner
    let best: Vec2 | null = null, bd = Infinity;
    const visit = (ix: number, iz: number) => {
      if (!this.open(ix, iz)) return;
      const c = this.center(ix, iz), d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < bd) { bd = d; best = c; }
    };
    for (let r = first; r <= last && (r - 0.5) * CELL < bd; r++) {
      // the ring's top and bottom rows, then its sides, each clipped to the grid
      for (const iz of r ? [cz - r, cz + r] : [cz]) {
        if (iz >= 0 && iz <= lastZ) for (let ix = Math.max(0, cx - r); ix <= Math.min(lastX, cx + r); ix++) visit(ix, iz);
      }
      for (const ix of r ? [cx - r, cx + r] : []) {
        if (ix >= 0 && ix <= lastX) for (let iz = Math.max(0, cz - r + 1); iz <= Math.min(lastZ, cz + r - 1); iz++) visit(ix, iz);
      }
    }
    return best ?? { ...p };
  }

  /** Straight line clear of anything blocking? Visits every cell the line passes through (Amanatides-Woo),
   *  so a line can't slip across the corner of a blocked cell between samples. */
  lineOfSight(a: Vec2, b: Vec2): boolean {
    if (!this.walkable(a) || !this.walkable(b)) return false;
    let [ix, iz] = this.cellOf(a);
    const [tx, tz] = this.cellOf(b), dx = b.x - a.x, dz = b.z - a.z;
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    let tMaxX = dx !== 0 ? (this.area.minX + (ix + (sx > 0 ? 1 : 0)) * CELL - a.x) / dx : Infinity;
    let tMaxZ = dz !== 0 ? (this.area.minZ + (iz + (sz > 0 ? 1 : 0)) * CELL - a.z) / dz : Infinity;
    const tdX = dx !== 0 ? CELL / Math.abs(dx) : Infinity, tdZ = dz !== 0 ? CELL / Math.abs(dz) : Infinity;
    for (let guard = 0; (ix !== tx || iz !== tz) && guard < 10000; guard++) {
      if (Math.abs(tMaxX - tMaxZ) < 1e-9) {
        // through a corner exactly: both side cells must be open, or the line squeezes between two blocks
        if (!this.open(ix + sx, iz) || !this.open(ix, iz + sz)) return false;
        ix += sx; iz += sz; tMaxX += tdX; tMaxZ += tdZ;
      } else if (tMaxX < tMaxZ) { ix += sx; tMaxX += tdX; }
      else { iz += sz; tMaxZ += tdZ; }
      if (!this.open(ix, iz)) return false;
    }
    return true;
  }

  /** Waypoints from `from` to `to` (excluding `from`), or null when there is no way through. */
  findPath(from: Vec2, to: Vec2): Vec2[] | null {
    const start = this.walkable(from) ? from : this.nearestWalkable(from);
    if (!this.walkable(to)) return null;
    if (this.lineOfSight(start, to)) return [{ ...to }];
    const [sx, sz] = this.cellOf(start), [tx, tz] = this.cellOf(to);
    const N = this.nx * this.nz, g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const h = (ix: number, iz: number) => { const dx = Math.abs(ix - tx), dz = Math.abs(iz - tz); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    const heap: [number, number][] = [];                                  // [f, cell], a binary heap on f
    const push = (f: number, c: number) => {
      heap.push([f, c]); let i = heap.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p]![0] <= f) break; [heap[p], heap[i]] = [heap[i]!, heap[p]!]; i = p; }
    };
    const pop = (): number => {
      const top = heap[0]!, last = heap.pop()!;
      if (heap.length) {
        heap[0] = last; let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
          if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
          if (m === i) break; [heap[m], heap[i]] = [heap[i]!, heap[m]!]; i = m;
        }
      }
      return top[1];
    };
    const s = sz * this.nx + sx, t = tz * this.nx + tx;
    g[s] = 0; push(h(sx, sz), s);
    while (heap.length) {
      const c = pop();
      if (closed[c]) continue;
      if (c === t) break;
      closed[c] = 1;
      const cx = c % this.nx, cz = (c - cx) / this.nx;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const ix = cx + dx, iz = cz + dz;
        if (!this.open(ix, iz)) continue;
        if (dx && dz && (!this.open(cx + dx, cz) || !this.open(cx, cz + dz))) continue;   // no cutting corners
        const n = iz * this.nx + ix, ng = g[c]! + (dx && dz ? Math.SQRT2 : 1);
        if (ng < g[n]!) { g[n] = ng; came[n] = c; push(ng + h(ix, iz), n); }
      }
    }
    if (came[t] === -1 && t !== s) return null;
    const cells: Vec2[] = [];
    for (let c = t; c !== -1 && c !== s; c = came[c]!) { const cx = c % this.nx; cells.push(this.center(cx, (c - cx) / this.nx)); }
    cells.reverse(); cells[cells.length - 1] = { ...to };
    // string-pulling: from each point jump to the farthest point still in a straight line of sight
    const out: Vec2[] = []; let at = start, i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.lineOfSight(at, cells[j]!)) j--;
      out.push(cells[j]!); at = cells[j]!; i = j + 1;
    }
    return out;
  }
}

const cache = new WeakMap<Layout, Map<string, NavGrid>>();
/** The walking grid for the land the player has, with what he has built (GameState.built) and begun (GameState.underway)
 *  at the camp's spots, one kept per layout and set of built and begun things. Everything that walks him goes through
 *  walkGrid in core/building.ts, which passes both; only the rats and goblins (core/rats.ts, core/goblins.ts) use what
 *  is built alone, and keep clear of the camp's spots anyway. Land claims (step 7) will rebuild it with more area. */
export function navFor(layout: Layout, built: readonly string[] = [], begun: readonly string[] = []): NavGrid {
  let grids = cache.get(layout);
  if (!grids) { grids = new Map(); cache.set(layout, grids); }
  const key = [...new Set(built)].sort().join(',') + '|' + [...new Set(begun)].sort().join(',');
  let nav = grids.get(key);
  if (!nav) { nav = new NavGrid(boundsOf(landOf(layout)), layout, built, begun); grids.set(key, nav); }
  return nav;
}
