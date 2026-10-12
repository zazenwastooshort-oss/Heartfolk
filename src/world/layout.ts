// The starting village: where everything is, in metres on the ground (x east, z south; the camera starts
// looking north). Data only; the renderer draws it, the simulation walks and works in it.
//
// It is laid out like a real village, in rings outward from the town square (tests/world.test.ts holds it to this):
//   1. the square: the hearth, a well, a notice board, benches
//   2. the busiest buildings facing the square: city hall at its head, bank, forge, the market, the inn
//   3. workshops and storage: the barn, behind the market on the east road
//   4. homes along the roads, some with vegetable gardens
//   5. the edges: the copper quarry, the birch woods and the oaks by the river (rocks and trees to work), the forest,
//      and land not yet claimed

import type { PickupKind } from '../data/pickups';
import type { ToolId } from '../data/skills';
import type { SiteId } from '../data/making';
import { SHORE_CLEAR, waterShape } from './water';

export interface Vec2 { x: number; z: number }
export interface Area { minX: number; maxX: number; minZ: number; maxZ: number }

export type BuildingKind = 'cityhall' | 'bank' | 'forge' | 'stall' | 'inn' | 'barn' | 'house';
/** which ring a kind of building belongs in; the layout test checks every building sits in order */
export const RING: Record<BuildingKind, number> = { cityhall: 2, bank: 2, forge: 2, stall: 2, inn: 2, barn: 3, house: 4 };

export interface BuildingSpot {
  id: string; kind: BuildingKind; name: string;
  /** the model in assets/models/village.glb */
  model: string;
  pos: Vec2; w: number; d: number;
  /** radians round the vertical axis; 0 faces south (+z). Set so the door faces a road or the square. */
  rot: number;
}
export type PropKind = 'well' | 'board' | 'bench' | 'crates';
export interface PropSpot { kind: PropKind; pos: Vec2; rot: number; radius: number }
/** a fenced vegetable plot: w x d of soil, fenced all round */
export interface GardenSpot { pos: Vec2; rot: number; w: number; d: number }
/** Something to work: a rock or a tree. radius: how much ground it takes up (a tree's trunk at chopping height);
 *  size: scale of a tree's model. */
export interface NodeSpot { id: string; resource: string; pos: Vec2; radius: number; size?: number; parcel?: string }
export type TreeKind = 'birch' | 'oak' | 'pine';
export interface TreeSpot { pos: Vec2; kind: TreeKind; size: number }
export interface Parcel { id: string; name: string; area: Area }
/** The waterfall a new game starts below (world/camp.ts): water pours out of the mist down a towering mountain wall
 *  whose foot runs east-west along z = lip.z, `width` metres wide where it lands in `pool`, and flows on as the
 *  layout's `river`. `height` is how high the wall is drawn before it is lost in mist and cloud; its top, where the
 *  water comes over, is never seen. */
export interface Falls { lip: Vec2; width: number; height: number; pool: { pos: Vec2; radius: number } }
/** Something lying on the ground to pick up by hand (data/pickups.ts): a plank or the book from the wreck, a stone, a
 *  branch. rot: radians round the vertical axis. Pickups don't block walking. */
export interface PickupSpot { id: string; kind: PickupKind; pos: Vec2; rot: number }
/** Scenery that stays where it lies (the wreck's broken hull ribs at the water's edge): a model in village.glb,
 *  sunk `y` metres into the ground or water, blocking `radius` metres of walkable ground (0 for none). */
export interface DebrisSpot { model: string; pos: Vec2; rot: number; y?: number; radius: number }

export interface Layout {
  /** land the player can walk on at the start */
  village: Area;
  start: Vec2;
  hearth: { pos: Vec2; radius: number };
  /** the paved town square round the hearth */
  square: number;
  buildings: BuildingSpot[];
  props: PropSpot[];
  gardens: GardenSpot[];
  nodes: NodeSpot[];
  trees: TreeSpot[];
  bushes: Vec2[];
  lanterns: Vec2[];
  river: { points: Vec2[]; width: number };
  /** roads (wide) and lanes (narrow), drawn as dirt */
  paths: { points: Vec2[]; width: number }[];
  parcels: Parcel[];
  /** the model drawn at the hearth: the village's big Hearth when not given, or null for nothing there yet (the camp,
   *  whose campfire is built there: siteOf, data/making.ts). With nothing there, nothing is in the way either. */
  hearthModel?: string | null;
  /** the camp a new game starts at: the spots where his shelter, a tent, and his storage chest are built (siteOf
   *  'tent' and 'chest'; nothing stands there until then): each one's middle, which way it faces (towards the fire),
   *  how far round it it reaches (its ring, and where he stands to build it), and its width and depth, which are in
   *  the way once it stands. The campfire is built at `hearth`. */
  camp?: { tent: Required<Site>; chest: Required<Site> };
  falls?: Falls;
  /** things lying on the ground to pick up by hand (the camp's wreck, stones and branches) */
  pickups?: PickupSpot[];
  debris?: DebrisSpot[];
  /** the tools a new game here starts with; all of them when not given (the village). At the camp he has none. */
  startTools?: ToolId[];
  /** the ground drawn in detail round the playable land (the village's is the default) */
  ground?: Area;
}

const HEARTH: Vec2 = { x: 0, z: 0 };
const facing = (from: Vec2, to: Vec2) => Math.atan2(to.x - from.x, to.z - from.z);
const SIZE: Record<string, [number, number]> = {
  CityHall: [7, 6], Bank: [5, 4], Forge: [4.6, 4.2], Stall: [3, 2], StallBlue: [3, 2], Inn: [6, 5],
  Barn: [6, 4.5], House: [4.2, 4.2], HouseTall: [4.4, 4.4], HouseLong: [6.5, 3.6],
};
const NAME: Record<string, string> = { House: 'Cottage', HouseTall: 'Townhouse', HouseLong: 'Longhouse' };
function building(id: string, kind: BuildingKind, model: string, x: number, z: number, faces: Vec2 = HEARTH, name?: string): BuildingSpot {
  const [w, d] = SIZE[model]!;
  return { id, kind, model, name: name ?? NAME[model] ?? model, pos: { x, z }, w, d, rot: facing({ x, z }, faces) };
}

/** Trunk radius at chopping height for a size-1 tree, measured from assets-src/village_models.py. */
const TRUNK: Record<string, number> = { birch_tree: 0.115, oak_tree: 0.2 };
function tree(id: string, resource: string, x: number, z: number, size = 1): NodeSpot {
  return { id, resource, pos: { x, z }, radius: TRUNK[resource]! * size, size };
}

/** Where to stand to use a building: just outside the middle of its front. */
export function doorOf(b: BuildingSpot): Vec2 {
  const out = b.d / 2 + 0.85;
  return { x: b.pos.x + Math.sin(b.rot) * out, z: b.pos.z + Math.cos(b.rot) * out };
}

export const inArea = (a: Area, p: Vec2) => p.x >= a.minX && p.x <= a.maxX && p.z >= a.minZ && p.z <= a.maxZ;

/** A place where something is built: its middle; how far round it the thing built there reaches (the ring drawn
 *  round it until then; he stands just beyond it to build); which way it faces (rot as for buildings: 0 faces +z;
 *  none for the round campfire); and for a thing with corners (the tent), its width across and depth along that way.
 *  Once built it is in the way (world/nav.ts): a round thing out to its radius, one with corners by its w x d. */
export interface Site { pos: Vec2; radius: number; rot?: number; w?: number; d?: number }

/** Where something is built (MAKES' `at` in data/making.ts) in this layout: the camp's hearth, where nothing stands
 *  until its campfire is built (the village's already has its big Hearth), the camp's tent spot, where his shelter
 *  goes, and the camp's chest spot beside it; or null where this layout has no such place. A structure built there
 *  stands on it and is in the way (world/nav.ts). */
export function siteOf(layout: Layout, id: SiteId): Site | null {
  if (id === 'hearth') return layout.hearthModel === null ? layout.hearth : null;
  if (id === 'tent') return layout.camp?.tent ?? null;
  if (id === 'chest') return layout.camp?.chest ?? null;
  return null;
}

// a scatter that is the same every time
function seeded(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function forest(): TreeSpot[] {
  const r = seeded(7), out: TreeSpot[] = [];
  const ring = (n: number, area: Area, kinds: TreeKind[]) => {
    for (let i = 0; i < n; i++) out.push({ pos: { x: area.minX + r() * (area.maxX - area.minX), z: area.minZ + r() * (area.maxZ - area.minZ) },
      kind: kinds[Math.floor(r() * kinds.length)]!, size: 0.85 + r() * 0.5 });
  };
  ring(42, { minX: -34, maxX: 44, minZ: -34, maxZ: -26.2 }, ['pine', 'pine', 'oak']);   // north edge
  ring(42, { minX: -34, maxX: 44, minZ: 26.2, maxZ: 34 }, ['pine', 'pine', 'oak']);     // south edge
  ring(22, { minX: -42, maxX: -29.5, minZ: -26, maxZ: 26 }, ['pine', 'oak']);           // across the river
  ring(14, { minX: 39.5, maxX: 46, minZ: -26, maxZ: 26 }, ['pine']);                    // beyond the east land
  ring(16, { minX: 27, maxX: 37.5, minZ: -23, maxZ: 23 }, ['pine', 'oak', 'birch']);    // inside the unexplored land
  return out;
}

const W = (x: number, z: number): Vec2 => ({ x, z });

// the river along the west edge; the forest keeps off it and its bank
const RIVER = { points: [W(-26.4, -36), W(-25.9, -20), W(-26.7, -8), W(-25.8, 4), W(-26.5, 16), W(-26.0, 36)], width: 3.4 };
const WATER = waterShape(RIVER);

export const VILLAGE: Layout = {
  village: { minX: -23.5, maxX: 25, minZ: -24.5, maxZ: 24.5 },
  start: { x: 1.4, z: 3.2 },
  hearth: { pos: HEARTH, radius: 1.2 },
  square: 6.6,
  buildings: [
    // the busiest buildings, facing the square
    building('cityhall', 'cityhall', 'CityHall', 0, -12, HEARTH, 'City hall'),
    building('bank', 'bank', 'Bank', 9.6, -8.6, HEARTH, 'Bank'),
    building('forge', 'forge', 'Forge', -9.9, -8.2, HEARTH, 'Forge'),
    building('stall1', 'stall', 'Stall', 9.6, -2.4, HEARTH, 'Market stall'),
    building('stall2', 'stall', 'StallBlue', 9.6, 3.2, HEARTH, 'Market stall'),
    building('inn', 'inn', 'Inn', -10.2, 8.2, HEARTH, 'Inn'),
    // workshops and storage
    building('barn', 'barn', 'Barn', 15.4, -3.4, W(15.4, 0.4), 'Barn'),
    // homes, facing the roads
    building('house1', 'house', 'House', -17.2, 6.4, W(-17.2, 0)),
    building('house2', 'house', 'HouseTall', -19.2, -5.6, W(-19.2, 0)),
    building('house3', 'house', 'HouseLong', -6.6, 16.8, W(0, 16.8)),
    building('house4', 'house', 'House', 6.4, 15.6, W(0, 15.6)),
    building('house5', 'house', 'HouseTall', -10.8, -21.8, W(-5.4, -21.8)),
    building('house6', 'house', 'House', 10.6, -20.2, W(5.4, -20.2)),
    building('house7', 'house', 'HouseLong', 16.8, 7.2, W(16.8, 0)),
    building('house8', 'house', 'HouseTall', 18.6, -9.6, W(13.2, -9.6)),
    building('house9', 'house', 'House', -16, 16.4),
    building('house10', 'house', 'House', 15.6, 17.2),
  ],
  props: [
    { kind: 'well', pos: W(-4.4, 4.4), rot: 0.6, radius: 1.0 },
    { kind: 'board', pos: W(3.4, -5.2), rot: facing(W(3.4, -5.2), HEARTH), radius: 0.55 },
    ...[45, 135, 225, 315].map(deg => {
      const a = deg * Math.PI / 180, pos = W(Math.cos(a) * 3.4, Math.sin(a) * 3.4);
      return { kind: 'bench' as const, pos, rot: facing(pos, HEARTH) + Math.PI / 2, radius: 0.65 };
    }),
    { kind: 'crates', pos: W(12.6, 0.4), rot: 0.3, radius: 0.85 },
    { kind: 'crates', pos: W(-13.4, 11.6), rot: -0.5, radius: 0.85 },
  ],
  gardens: [
    { pos: W(-17.2, 10.8), rot: 0, w: 3, d: 2 },
    { pos: W(-19.2, -10.2), rot: 0, w: 3, d: 2 },
    { pos: W(10.6, 15.4), rot: Math.PI / 2, w: 3, d: 2 },
    { pos: W(16.8, 12.2), rot: 0, w: 3, d: 2 },
  ],
  nodes: [
    // the copper quarry, north-east
    { id: 'copper1', resource: 'copper_rock', pos: W(20.4, -15.4), radius: 0.95 },
    { id: 'copper2', resource: 'copper_rock', pos: W(22.6, -11.4), radius: 0.95 },
    { id: 'copper3', resource: 'copper_rock', pos: W(18.0, -19.4), radius: 0.95 },
    // the birch woods to the south, either side of the road
    tree('birch1', 'birch_tree', -3.6, 21.4, 1.0), tree('birch2', 'birch_tree', -6.4, 23.0, 1.1),
    tree('birch3', 'birch_tree', -9.2, 21.4, 0.95), tree('birch4', 'birch_tree', 3.6, 21.0, 1.05),
    tree('birch5', 'birch_tree', 6.6, 22.8, 1.0), tree('birch6', 'birch_tree', 9.4, 21.2, 0.9),
    // oaks by the river (Woodcutting level 10)
    tree('oak1', 'oak_tree', -21.2, 11.2, 1.1), tree('oak2', 'oak_tree', -21.6, 2.8, 1.0), tree('oak3', 'oak_tree', -21.4, -14.2, 1.15),
    // tin waits in the unexplored land
    { id: 'tin1', resource: 'tin_rock', pos: W(30.5, -4.5), radius: 0.95, parcel: 'east' },
    { id: 'tin2', resource: 'tin_rock', pos: W(32.6, 3.6), radius: 0.95, parcel: 'east' },
  ],
  // scenery only (the trees to chop are nodes). Inside the village they are pines, so nobody taps a birch or an
  // oak that can't be chopped.
  trees: [
    { pos: W(-21.8, -22.4), kind: 'pine', size: 1.1 }, { pos: W(22.8, 21.6), kind: 'pine', size: 1.0 },
    { pos: W(-21.6, 22.2), kind: 'pine', size: 1.05 }, { pos: W(13.8, -14.2), kind: 'pine', size: 1.0 },
    { pos: W(12.4, 11.2), kind: 'pine', size: 0.9 },
    ...forest().filter(t => WATER.edge(t.pos) > SHORE_CLEAR),
  ],
  bushes: [W(-4.6, -6.8), W(4.4, -6.9), W(-6.2, 11.4), W(12.8, -5.6), W(-14.2, -10.4), W(20.6, -3.2), W(-3.2, -17.8), W(3.4, 11.6)],
  lanterns: [
    W(3.0, -6.4), W(-3.0, -6.4), W(6.8, 1.0), W(-6.8, -1.2), W(1.4, 7.0), W(-1.4, -7.0),
    W(15.0, 1.6), W(-15.0, -1.6), W(1.6, 14.0), W(5.9, -14.0), W(-6.0, -13.0),
  ],
  river: RIVER,
  paths: [
    // main roads out of the square
    { points: [W(-4.6, -5.0), W(-5.2, -15.0), W(-5.6, -26)], width: 2.4 },                // north-west, past the forge
    { points: [W(4.6, -5.0), W(5.2, -15.0), W(5.8, -26)], width: 2.4 },                   // north-east, past the bank
    { points: [W(6.6, 0.4), W(16, 0.4), W(25, 0.4), W(32, 0.2)], width: 2.4 },            // east, through the market past the barn, into the unexplored land
    { points: [W(0, 6.6), W(0, 16), W(0, 26)], width: 2.4 },                              // south, through the birch woods
    { points: [W(-6.6, 0), W(-16, 0), W(-24, 0)], width: 2.4 },                           // west, to the river
    // lanes
    { points: [W(5.2, -15.0), W(12, -16.5), W(18.8, -16.2)], width: 1.4 },                // to the copper quarry
    { points: [W(0, 0), W(0, -8.1)], width: 1.4 },                                        // up to the city hall
    { points: [W(0, 12), W(-10, 13), W(-15.2, 13.6)], width: 1.4 },
    { points: [W(0, 12), W(9.6, 13.4), W(14, 14.2)], width: 1.4 },
  ],
  parcels: [{ id: 'east', name: 'Unexplored land', area: { minX: 25, maxX: 38, minZ: -24.5, maxZ: 24.5 } }],
};
