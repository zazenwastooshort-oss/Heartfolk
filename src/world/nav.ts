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
import { blocksOf, shapeOf } from './steps';

const CELL = 0.4;
const MARGIN = 0.35;                 // keep this far from walls, so the character doesn't clip them
/** How far round (metres) and in how many directions he looks for open ground to step out to, standing where he can't
 *  (NavGrid.route). */
const STEP_OUT = { reach: [0.4, 0.8, 1.2, 1.6, 2, 2.5, 3], ways: 16 };
/** How far round what he has built or begun (metres) open ground is looked at for pockets closed in by it
 *  (NavGrid.closePockets). */
const POCKET_ROOM = 1.2;

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

/** Something in the way with corners (a building, a garden's fence, a step's box), turned `rot`, its half width and
 *  depth with the room kept round it. */
type Rect = { pos: Vec2; rot: number; hw: number; hd: number };
const inRect = (p: Vec2, b: Rect): boolean => {
  const dx = p.x - b.pos.x, dz = p.z - b.pos.z, c = Math.cos(b.rot), s = Math.sin(b.rot);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;      // into the building's own frame
  return Math.abs(lx) <= b.hw && Math.abs(lz) <= b.hd;
};
const inCircle = (p: Vec2, [c, r]: [Vec2, number]): boolean => Math.hypot(p.x - c.x, p.z - c.z) <= r + MARGIN * 0.5;

/** What the steps `ids` built or begun at the camp's spots put in the way (world/steps.ts): their boxes, with the room
 *  kept round a building, and their rings. */
function stepsInWay(layout: Layout, ids: readonly string[]): { rects: Rect[]; circles: [Vec2, number][] } {
  const steps = [...new Set(ids)].map(id => blocksOf(layout, id));
  return { rects: steps.flatMap(b => b.boxes).map(b => ({ pos: b.pos, rot: b.rot, hw: b.hw + MARGIN, hd: b.hd + MARGIN })), circles: steps.flatMap(b => b.rings) };
}

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
    const steps = stepsInWay(layout, [...built, ...begun]);
    const goblins = goblinCampBlocks(layout);
    const circles: [Vec2, number][] = [
      ...(layout.hearthModel !== null ? [[layout.hearth.pos, layout.hearth.radius] as [Vec2, number]] : []),
      ...steps.circles,
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
    const rects: Rect[] = [
      ...layout.buildings.map(b => ({ pos: b.pos, rot: b.rot, hw: b.w / 2 + MARGIN, hd: b.d / 2 + MARGIN })),
      ...layout.gardens.map(g => ({ pos: g.pos, rot: g.rot, hw: g.w / 2 + 0.3 + MARGIN, hd: g.d / 2 + 0.3 + MARGIN })),
      ...steps.rects,
      // (chapter 2) the goblin camp's palisade, its gate and the chief's tent
      ...goblins.rects.map(b => ({ pos: b.pos, rot: b.rot, hw: b.hw + MARGIN, hd: b.hd + MARGIN })),
    ];
    for (let iz = 0; iz < this.nz; iz++) for (let ix = 0; ix < this.nx; ix++) {
      const p = this.center(ix, iz);
      let block = !this.onLand(p);                           // edge cells whose middle lies off the land
      if (!block) for (const b of rects) if (inRect(p, b)) { block = true; break; }
      if (!block) for (const c of circles) if (inCircle(p, c)) { block = true; break; }
      if (!block && water.edge(p) <= waterClear) block = true;   // where the land reaches the water
      if (block) this.blocked[iz * this.nx + ix] = 1;
    }
    this.closePockets(layout, steps);
  }

  /** Open ground closed in on every side by what is built or begun (`steps`: between the stone hearth's ring and its
   *  seats, for one) is in the way too: no way leads in or out of it, so no walk may end there (a tap on
   *  it, a save read back with him moved out of something to the nearest open ground) and nobody can be left in it with
   *  something begun round him. Only the ground round the steps, POCKET_ROOM beyond them, is looked at: any of it that
   *  can't be reached from the edge of that ground, or from where a new game starts, is closed. */
  private closePockets(layout: Layout, steps: { rects: Rect[]; circles: [Vec2, number][] }): void {
    const spans = [...steps.rects.map(b => [b.pos, Math.hypot(b.hw, b.hd)] as const), ...steps.circles.map(([c, r]) => [c, r + MARGIN] as const)];
    if (!spans.length) return;
    const room = (r: number) => r + POCKET_ROOM;
    const [x0, z0] = this.cellOf({ x: Math.min(...spans.map(([c, r]) => c.x - room(r))), z: Math.min(...spans.map(([c, r]) => c.z - room(r))) });
    const [x1, z1] = this.cellOf({ x: Math.max(...spans.map(([c, r]) => c.x + room(r))), z: Math.max(...spans.map(([c, r]) => c.z + room(r))) });
    const ix0 = Math.max(0, x0), iz0 = Math.max(0, z0), ix1 = Math.min(this.nx - 1, x1), iz1 = Math.min(this.nz - 1, z1);
    if (ix0 > ix1 || iz0 > iz1) return;
    const w = ix1 - ix0 + 1, reached = new Uint8Array(w * (iz1 - iz0 + 1)), todo: number[] = [];
    const reach = (ix: number, iz: number) => {
      if (ix < ix0 || ix > ix1 || iz < iz0 || iz > iz1 || !this.open(ix, iz)) return;
      const k = (iz - iz0) * w + (ix - ix0);
      if (!reached[k]) { reached[k] = 1; todo.push(ix, iz); }
    };
    for (let ix = ix0; ix <= ix1; ix++) { reach(ix, iz0); reach(ix, iz1); }
    for (let iz = iz0; iz <= iz1; iz++) { reach(ix0, iz); reach(ix1, iz); }
    reach(...this.cellOf(layout.start));
    // (side to side only: a step across a corner needs both cells beside it open, findPath, so it is never the only way)
    while (todo.length) { const iz = todo.pop()!, ix = todo.pop()!; reach(ix + 1, iz); reach(ix - 1, iz); reach(ix, iz + 1); reach(ix, iz - 1); }
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      if (this.open(ix, iz) && !reached[(iz - iz0) * w + (ix - ix0)]) this.blocked[iz * this.nx + ix] = 1;
    }
  }

  /** This grid (one with nothing built or begun at the camp's spots) with the steps `ids` put in the way as well: the
   *  very grid made from scratch with them, cell for cell (a cell is in the way if anything is in it, so adding them
   *  one by one comes to the same), looking only at the cells round each, a moment's work instead of the whole grid
   *  again (the trees, the rocks and the water's edge; navFor). */
  withSteps(layout: Layout, ids: readonly string[]): NavGrid {
    const out = Object.assign(Object.create(NavGrid.prototype) as NavGrid, this);
    out.blocked = this.blocked.slice();
    const { rects, circles } = stepsInWay(layout, ids);
    const mark = (at: Vec2, reach: number, inside: (p: Vec2) => boolean) => {
      const ix0 = Math.max(0, Math.floor((at.x - reach - this.area.minX) / CELL) - 1), ix1 = Math.min(this.nx - 1, Math.ceil((at.x + reach - this.area.minX) / CELL) + 1);
      const iz0 = Math.max(0, Math.floor((at.z - reach - this.area.minZ) / CELL) - 1), iz1 = Math.min(this.nz - 1, Math.ceil((at.z + reach - this.area.minZ) / CELL) + 1);
      for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) if (inside(this.center(ix, iz))) out.blocked[iz * this.nx + ix] = 1;
    };
    for (const b of rects) mark(b.pos, Math.hypot(b.hw, b.hd), p => inRect(p, b));
    for (const c of circles) mark(c[0], c[1] + MARGIN, p => inCircle(p, c));
    out.closePockets(layout, { rects, circles });
    return out;
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

  /** Open ground to step out to from `from`, where he can't stand (something just begun round him, or, in a save read
   *  back, something bigger than when it was made), nearest first and no further than `upTo` metres: the nearest open
   *  ground, then points on rings round him out to STEP_OUT's furthest. */
  outsFrom(from: Vec2, upTo = Infinity): Vec2[] {
    const d = (o: Vec2) => Math.hypot(o.x - from.x, o.z - from.z);
    return [this.nearestWalkable(from), ...STEP_OUT.reach.flatMap(r => Array.from({ length: STEP_OUT.ways }, (_, i) => {
      const a = i / STEP_OUT.ways * Math.PI * 2;
      return { x: from.x + Math.cos(a) * r, z: from.z + Math.sin(a) * r };
    }))].filter(o => this.walkable(o) && d(o) <= upTo).sort((a, b) => d(a) - d(b));
  }

  /** How far out of something he may step on his way (route): the furthest of STEP_OUT's rings. */
  static readonly stepOutReach = Math.max(...STEP_OUT.reach);

  /** The way from `from` to `to` (null for none). Standing where he can't (something just begun round him, T2.14), he
   *  steps out first, to the nearest open ground that leads there (outsFrom), so he steps straight out rather than across
   *  it; the first point of the way is that ground. (actors/player.ts walks him by it; core/save.ts reads a save made
   *  on the way out back by it.) */
  route(from: Vec2, to: Vec2): Vec2[] | null {
    if (this.walkable(from)) return this.findPath(from, to);
    for (const out of this.outsFrom(from)) { const path = this.findPath(out, to); if (path) return [out, ...path]; }
    return null;
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
 *  at the camp's spots, one kept per layout and set of things in the way. Everything that walks him goes through
 *  walkGrid in core/building.ts, which passes both; only the rats and goblins (core/rats.ts, core/goblins.ts) use what
 *  is built alone, and keep clear of the camp's spots anyway. Land claims (step 7) will rebuild it with more area.
 *  Built and begun block alike, and furniture (the chest) not at all, so the grid is kept by the set of what blocks: the
 *  one made as something is begun is the one used once it stands, and the chest makes none of its own (each new grid
 *  is a moment's work, a stall on a phone). */
export function navFor(layout: Layout, built: readonly string[] = [], begun: readonly string[] = []): NavGrid {
  let grids = cache.get(layout);
  if (!grids) { grids = new Map(); cache.set(layout, grids); }
  const ids = [...new Set([...built, ...begun])].filter(id => !shapeOf(id)?.furniture).sort(), key = ids.join(',');
  let nav = grids.get(key);
  if (nav) return nav;
  // the grid with nothing of the camp's in the way, made once, then each set of steps put on a copy of it
  let bare = grids.get('');
  if (!bare) { bare = new NavGrid(boundsOf(landOf(layout)), layout); grids.set('', bare); }
  nav = ids.length ? bare.withSteps(layout, ids) : bare;
  grids.set(key, nav);
  return nav;
}
