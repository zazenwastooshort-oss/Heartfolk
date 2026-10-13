// The camp's layout for the camp build (docs/plans/2026-10-13-camp-build-plan.md, In 11; T11.1, T11.2, T11.5, T11.8):
// each spot keeps room for its largest step, every step's footprint lies inside the next one's, walking blocks each
// step by its own shape (and the campfire, the firewood pile, the tent and the dummy exactly as their spots did before;
// the storage chest, furniture in the shelter, not at all), and with everything built at its largest he can still
// reach every door, work point, rock, tree, fishing spot and thing on the ground. (The shelter's door and the chest in
// it: tests/chest.test.ts.)
import { describe, expect, it } from 'vitest';
import { CAMP } from '../src/world/camp';
import { inArea, siteOf, VILLAGE, type BuildingSpot, type Layout, type PropSpot, type Vec2 } from '../src/world/layout';
import { landOf, NavGrid, navFor } from '../src/world/nav';
import { waterOf } from '../src/world/water';
import { APRON, footOf, wallFootZ } from '../src/world/falls';
import { blocksOf, buildStandsOf, outsideOf, shapeOf, standsOf, stepPlace, toGround } from '../src/world/steps';
import { createState } from '../src/core/state';
import { walkGrid } from '../src/core/building';
import { goPickup, goWork } from '../src/actors/player';
import { wakeSpot } from '../src/systems/rats';
import { CARPENTRY, LAYOUT_GAP, LINES, SHAPES, STAGED, type LineId } from '../src/data/building';
import { MAKES, type MakeId } from '../src/data/making';
import { PICKUPS } from '../src/data/pickups';
import { POTTER } from '../src/data/rats';
import { MILL } from '../src/data/goblins';

const SPOTS = Object.keys(LINES) as LineId[];
/** Each spot's largest step. */
const LARGEST = SPOTS.map(l => LINES[l].at(-1)!);
/** Every structure at its largest: the base five, and every upgrade. */
const ALL: MakeId[] = SPOTS.flatMap(l => LINES[l]);
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/** Points of a step's footprint on the ground: along the edge of every block (every `step` metres) and inside it. */
function footprint(layout: Layout, id: MakeId, step = 0.05): { edge: Vec2[]; inside: Vec2[] } {
  const place = stepPlace(layout, id)!, shape = shapeOf(id)!, edge: Vec2[] = [], inside: Vec2[] = [];
  for (const b of shape.blocks) {
    if ('box' in b) {
      const [x0, x1, z0, z1] = b.box, nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
      for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
        const p = toGround(place, [x0 + (x1 - x0) * i / nx, z0 + (z1 - z0) * j / nz]);
        (i === 0 || j === 0 || i === nx || j === nz ? edge : inside).push(p);
      }
    } else {
      const [x, z, r] = b.ring, n = Math.max(12, Math.ceil(2 * Math.PI * r / step));
      for (let k = 0; k < n; k++) for (const f of [1, 0.66, 0.33]) {
        const a = k / n * Math.PI * 2;
        (f === 1 ? edge : inside).push(toGround(place, [x + Math.cos(a) * r * f, z + Math.sin(a) * r * f]));
      }
      inside.push(toGround(place, [x, z]));
    }
  }
  return { edge, inside };
}

/** The things in the camp each spot keeps clear of, as circles (a middle and how far round it). */
function obstacles(layout: Layout): { what: string; at: Vec2; r: number }[] {
  return [
    ...layout.nodes.map(n => ({ what: n.id, at: n.pos, r: n.radius })),
    ...layout.trees.map((t, i) => ({ what: `tree ${i}`, at: t.pos, r: (t.kind === 'oak' ? 0.4 : 0.3) * t.size })),
    ...layout.bushes.map((b, i) => ({ what: `bush ${i}`, at: b, r: 0.45 })),
    ...(layout.pickups ?? []).map(x => ({ what: x.id, at: x.pos, r: PICKUPS[x.kind].plant?.radius ?? 0.35 })),
    ...(layout.debris ?? []).map((d, i) => ({ what: `debris ${i}`, at: d.pos, r: Math.max(0.3, d.radius) })),
    ...footOf(layout).rocks.map((k, i) => ({ what: `rock ${i} at the wall's foot`, at: k.pos, r: k.radius * 1.05 })),
    // the rats' nest and where they potter (a scurry may end a hop past their roam), and the goblin camp, where they mill
    ...(layout.nests ?? []).map(n => ({ what: n.id, at: n.pos, r: n.roam + POTTER.hop[1] })),
    ...(layout.goblinCamp ? [{ what: 'the goblin camp', at: layout.goblinCamp.pos, r: Math.max(layout.goblinCamp.radius, layout.goblinCamp.roam + MILL.hop[1]) }] : []),
  ];
}

/** A state with `built` standing, the camp set up. */
function withBuilt(built: MakeId[]) {
  const state = createState(CAMP, 3);
  state.built = [...built];
  state.tools = { axe: true, pick: true, rod: true };
  return state;
}

describe('the shapes', () => {
  it('every structure has a shape, every step of a spot is built there, and the lines and the upgrades agree', () => {
    for (const def of Object.values(MAKES)) if (def.gives.kind === 'structure') expect(SHAPES[def.id], def.id).toBeDefined();
    for (const [line, steps] of Object.entries(LINES)) {
      for (const id of steps) expect(MAKES[id].at, id).toBe(line);
      steps.slice(1).forEach((id, i) => expect(STAGED[id]?.upgrades, id).toBe(steps[i]));
    }
    for (const id of ALL) expect(stepPlace(CAMP, id), id).not.toBeNull();
    for (const id of ALL) expect(stepPlace(VILLAGE, id), id).toBeNull();
  });

  it('each step is bigger than the one before it, and its ring reaches round all of it', () => {
    for (const id of ALL) {
      const place = stepPlace(CAMP, id)!, { edge } = footprint(CAMP, id);
      expect(Math.max(...edge.map(p => dist(p, place.pos))), id).toBeLessThanOrEqual(SHAPES[id]!.reach + 0.12);
    }
    for (const steps of Object.values(LINES)) for (let i = 1; i < steps.length; i++) {
      expect(SHAPES[steps[i]!]!.reach, steps[i]).toBeGreaterThan(SHAPES[steps[i - 1]!]!.reach);
    }
  });

  it('each stand is outside its step, in front of a face, as far from it as his mallet reaches', () => {
    for (const id of ALL) for (const p of standsOf(CAMP, id)) {
      const out = outsideOf(CAMP, id, p);
      expect(out, `${id} stand`).toBeGreaterThanOrEqual(CARPENTRY.reach - 0.02);
      expect(out, `${id} stand`).toBeLessThanOrEqual(CARPENTRY.reach + 0.12);
    }
  });
});

describe('the layout', () => {
  it('T11.5: every step\'s footprint lies inside the next one\'s', () => {
    for (const steps of Object.values(LINES)) for (let i = 1; i < steps.length; i++) {
      const before = steps[i - 1]!, after = steps[i]!, { edge, inside } = footprint(CAMP, before);
      const out = [...edge, ...inside].filter(p => outsideOf(CAMP, after, p) > 1e-6);
      expect(out, `${before} inside ${after}`).toEqual([]);
    }
  });

  it('T11.1: each spot holds its largest step with room round it: clear of the other spots, the water, the scree, trees, rocks, bushes, things on the ground, the nest and the goblin camp', () => {
    const water = waterOf(CAMP), land = landOf(CAMP), falls = CAMP.falls!, gap = LAYOUT_GAP.gap;
    const spots: MakeId[] = LARGEST;
    for (const id of spots) {
      const { edge, inside } = footprint(CAMP, id), all = [...edge, ...inside];
      // on the land, out of the water by LAYOUT_GAP.water, and off the scree at the wall's foot
      expect(all.filter(p => !land.some(a => inArea(a, p))), `${id} off the land`).toEqual([]);
      expect(Math.min(...all.map(p => water.edge(p))), `${id} to the water`).toBeGreaterThanOrEqual(LAYOUT_GAP.water);
      expect(all.filter(p => p.z < wallFootZ(falls, p.x) + APRON), `${id} on the scree`).toEqual([]);
      for (const o of obstacles(CAMP)) expect(outsideOf(CAMP, id, o.at) - o.r, `${id} to ${o.what}`).toBeGreaterThanOrEqual(gap);
      for (const other of spots) if (other !== id) {
        expect(Math.min(...edge.map(p => outsideOf(CAMP, other, p))), `${id} to ${other}`).toBeGreaterThanOrEqual(gap);
      }
    }
  });

  it('T11.2: at each step of each spot, the others at their largest, his stands are open ground he can walk to from the start', () => {
    for (const line of SPOTS) LINES[line].forEach((id, k) => {
      const built = [...SPOTS.filter(l => l !== line).flatMap(l => LINES[l]), ...LINES[line].slice(0, k + 1), 'chest' as MakeId];
      const nav = navFor(CAMP, built);
      // (and those he builds it from, where it has its own: SHAPES' builds)
      for (const p of [...standsOf(CAMP, id), ...buildStandsOf(CAMP, id)]) {
        expect(nav.walkable(p), `${id} stand ${p.x.toFixed(2)},${p.z.toFixed(2)}`).toBe(true);
        expect(nav.findPath(CAMP.start, p), `${id} stand reached`).not.toBeNull();
      }
    });
  });

  it('T11.2: with everything at its largest he still reaches every rock, tree, fishing spot and thing on the ground, and wakes on open ground after a knock-out', () => {
    const state = withBuilt([...ALL, 'chest']);
    for (const n of CAMP.nodes) {
      state.player.pos = { ...CAMP.start }; state.player.path = []; state.player.pending = null;
      expect(goWork(state, CAMP, n.id), n.id).toBe(true);
    }
    for (const x of CAMP.pickups!) {
      state.player.pos = { ...CAMP.start }; state.player.path = []; state.player.pending = null;
      expect(goPickup(state, CAMP, x.id), x.id).toBe(true);
    }
    const wake = wakeSpot(state, CAMP).pos;
    expect(walkGrid(state, CAMP).walkable(wake)).toBe(true);
    expect(walkGrid(state, CAMP).findPath(CAMP.start, wake)).not.toBeNull();
  });

  it('each set of steps built or begun is put on the bare grid in a moment, and comes out cell for cell as the grid made from scratch with them', { timeout: 30_000 }, () => {
    const area = landOf(CAMP).reduce((a, b) => ({ minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX), minZ: Math.min(a.minZ, b.minZ), maxZ: Math.max(a.maxZ, b.maxZ) }));
    // every way each spot can be (nothing, or its line up to each step, the last of them begun or built), with the
    // other spots bare or at their largest
    const lines = Object.keys(LINES) as LineId[], ways = (line: LineId) => [[], ...LINES[line].map((_, i) => LINES[line].slice(0, i + 1))] as MakeId[][];
    const sets: MakeId[][] = [];
    for (const line of lines) for (const way of ways(line)) for (const others of [false, true]) {
      sets.push(lines.flatMap(l => l === line ? way : others ? LINES[l] : []));
    }
    expect(sets.length).toBe(2 * (3 + 4 + 3 + 2));
    // (each timed on layouts of its own, so none of the sets comes from the grids kept for the camp's: every one is put
    // on the bare grid then and there, twice, on two such layouts)
    const own = [{ ...CAMP }, { ...CAMP }];
    for (const L of own) navFor(L);                                 // (the bare grid, made once for each)
    const took: number[] = [];
    for (const ids of sets) {
      const begun = ids.length % 2 ? ids.slice(-1) : [], built = ids.slice(0, ids.length - begun.length);
      const times = own.map(L => { const started = performance.now(); navFor(L, [...built, 'chest'], begun); return performance.now() - started; });
      took.push(Math.min(...times));
      const stamped = navFor(own[0]!, [...built, 'chest'], begun), scratch = new NavGrid(area, CAMP, built, begun), differ: string[] = [];
      for (let x = area.minX + 0.2; x < area.maxX; x += 0.4) for (let z = area.minZ + 0.2; z < area.maxZ; z += 0.4) {
        if (stamped.walkable({ x, z }) !== scratch.walkable({ x, z })) differ.push(`${x.toFixed(1)},${z.toFixed(1)}`);
      }
      expect(differ, ids.join('+')).toEqual([]);
    }
    // (a whole grid is about 45 ms on a desktop; a set of steps put on the bare one, well under a millisecond: every one
    // of them, the better of its two tries, so a pause of the machine's own doesn't count)
    expect(Math.max(...took)).toBeLessThan(10);
  });

  it("no open ground round the camp's spots is closed in by what is built or begun there: with each spot at each step and the others bare or at their largest, every open cell within 4 m of a spot is reached from where a new game starts (between the stone hearth's ring and its seats, for one)", () => {
    const area = landOf(CAMP).reduce((a, b) => ({ minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX), minZ: Math.min(a.minZ, b.minZ), maxZ: Math.max(a.maxZ, b.maxZ) }));
    const nx = Math.ceil((area.maxX - area.minX) / 0.4), nz = Math.ceil((area.maxZ - area.minZ) / 0.4);
    const mid = (ix: number, iz: number): Vec2 => ({ x: area.minX + (ix + 0.5) * 0.4, z: area.minZ + (iz + 0.5) * 0.4 });
    const spots = SPOTS.map(l => siteOf(CAMP, l)!.pos);
    for (const line of SPOTS) for (let k = 0; k < LINES[line].length; k++) for (const others of [false, true]) {
      const ids = SPOTS.flatMap(l => l === line ? LINES[l].slice(0, k + 1) : others ? LINES[l] : []), nav = navFor(CAMP, ids);
      // every open cell reached from the start, side to side (a step across a corner needs both cells beside it open)
      const reached = new Uint8Array(nx * nz), todo: [number, number][] = [];
      const go = (ix: number, iz: number) => {
        if (ix < 0 || iz < 0 || ix >= nx || iz >= nz || reached[iz * nx + ix] || !nav.walkable(mid(ix, iz))) return;
        reached[iz * nx + ix] = 1; todo.push([ix, iz]);
      };
      const start = nav.nearestWalkable(CAMP.start);
      go(Math.floor((start.x - area.minX) / 0.4), Math.floor((start.z - area.minZ) / 0.4));
      while (todo.length) { const [ix, iz] = todo.pop()!; go(ix + 1, iz); go(ix - 1, iz); go(ix, iz + 1); go(ix, iz - 1); }
      const shut: string[] = [];
      for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
        const p = mid(ix, iz);
        if (nav.walkable(p) && !reached[iz * nx + ix] && spots.some(o => dist(o, p) <= 4)) shut.push(`${p.x.toFixed(1)},${p.z.toFixed(1)}`);
      }
      expect(shut, ids.join('+')).toEqual([]);
    }
  });

  it('T11.8: the campfire, the firewood pile, the tent and the dummy are in the way exactly as their spots were before', () => {
    // the old rule: a round spot blocked out to its radius like a prop, one with corners by its width and depth like a
    // building (world/nav.ts before the camp build). (The storage chest had a spot of its own then; since the camp
    // build's stage 3 it is in the shelter and in the way of nothing: tests/chest.test.ts, T8.1.)
    const sites = { campfire: 'hearth', woodpile: 'woodpile', shelter: 'tent', dummy: 'dummy' } as const;
    const before = (ids: (keyof typeof sites)[]): Layout => {
      const buildings: BuildingSpot[] = [], props: PropSpot[] = [];
      for (const id of ids) {
        const s = siteOf(CAMP, sites[id])!;
        if (s.w !== undefined && s.d !== undefined) buildings.push({ id, kind: 'house', model: '', name: id, pos: s.pos, rot: s.rot ?? 0, w: s.w, d: s.d });
        else props.push({ kind: 'crates', pos: s.pos, rot: 0, radius: s.radius });
      }
      return { ...CAMP, buildings, props };
    };
    const area = landOf(CAMP).reduce((a, b) => ({ minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX), minZ: Math.min(a.minZ, b.minZ), maxZ: Math.max(a.maxZ, b.maxZ) }));
    const sets: (keyof typeof sites)[][] = [...Object.keys(sites).map(id => [id as keyof typeof sites]), Object.keys(sites) as (keyof typeof sites)[]];
    for (const ids of sets) {
      const now = navFor(CAMP, ids), then = navFor(before(ids)), differ: string[] = [];
      for (let x = area.minX + 0.2; x < area.maxX; x += 0.4) for (let z = area.minZ + 0.2; z < area.maxZ; z += 0.4) {
        if (now.walkable({ x, z }) !== then.walkable({ x, z })) differ.push(`${x.toFixed(1)},${z.toFixed(1)}`);
      }
      expect(differ, ids.join('+')).toEqual([]);
    }
  });

  it('a begun step is in the way from its footings on, and a built one by its own shape', () => {
    const state = withBuilt(['campfire', 'woodpile', 'shelter', 'chest']);
    for (const id of ['wall_tent', 'stone_hearth', 'woodshed'] as MakeId[]) {
      // (points well inside: the walking grid's cells are 0.4 m, so a cell whose middle is just outside a small ring,
      // the hearth's seats, stays open though a corner of it is inside)
      const inside = footprint(CAMP, id, 0.3).inside.filter(p => outsideOf(CAMP, id, p) <= -0.11), walk = () => walkGrid(state, CAMP);
      const open = inside.filter(p => walk().walkable(p));
      expect(open.length, `${id} before`).toBeGreaterThan(0);
      state.underway = { [id]: 0 };
      expect(inside.filter(p => walk().walkable(p)), `${id} begun`).toEqual([]);
      state.underway = {};
      expect(blocksOf(CAMP, id).boxes.length + blocksOf(CAMP, id).rings.length, id).toBe(SHAPES[id]!.blocks.length);
    }
  });
});
