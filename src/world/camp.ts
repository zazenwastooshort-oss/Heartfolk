// Where a new game starts (12 Oct 2026): a clearing at the foot of a waterfall. He went over the falls from so high
// that its top is never seen: the water pours out of the mist down a towering mountain wall to the north, into a pool,
// and flows on to the south-west. He washes up on the pool's bank with nothing, and wreckage washed up with him:
// planks, a torn tarp, a smashed crate and his book, strewn along the bank. Stones and branches lie round the clearing,
// and (for building, data/building.ts) reeds and clay along the river bank.
// The camp starts bare: the campfire, the firewood pile, the shelter (a tent), the storage chest and (0.0.22) the
// training dummy have their spots here and are built later. Since chapter 2 berry bushes grow in a patch east of the
// fire, fish rise in the pool and along the river, and rats live round a nest in the edge of the woods downriver; past
// them, where the river leaves the valley, goblins have made a camp in a small clearing by the bank, blocking the way
// on. The village lies far up the river and comes much later (world/layout.ts, VILLAGE).
// Data only, like the village: x east, z south, in metres; the camera starts looking north at the falls.
import type { Area, Falls, GoblinCampSpot, Layout, NodeSpot, PickupSpot, TreeKind, TreeSpot, Vec2 } from './layout';
import type { PickupKind } from '../data/pickups';
import { SHORE_CLEAR, waterShape } from './water';
import { APRON, wallFootZ } from './falls';

const W = (x: number, z: number): Vec2 => ({ x, z });
const facing = (from: Vec2, to: Vec2) => Math.atan2(to.x - from.x, to.z - from.z);

/** Trunk radius at chopping height for a size-1 tree (as in layout.ts). */
const TRUNK: Record<string, number> = { birch_tree: 0.115, oak_tree: 0.2 };
const tree = (id: string, resource: string, x: number, z: number, size = 1): NodeSpot =>
  ({ id, resource, pos: { x, z }, radius: TRUNK[resource]! * size, size });
const rock = (id: string, resource: string, x: number, z: number): NodeSpot => ({ id, resource, pos: { x, z }, radius: 0.95 });
/** A fishing spot (chapter 2): fish rising out in the water, worked from the bank (SWINGS.fishing's reach). */
const fish = (id: string, x: number, z: number): NodeSpot => ({ id, resource: 'fishing_spot', pos: { x, z }, radius: 0.4 });

function seeded(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// where the campfire and the shelter, a tent, are built (data/making.ts): nothing stands there at the start. Once it
// stands, the tent (village.glb's Tent) is in the way by its canvas, 1.9 m wide and 2.4 deep; its ring, and where he
// stands to build it, reach round its corners and pegs (1.53 m from its middle).
const FIRE = W(2.4, 3.0), TENT = W(-1.6, 5.8), TENT_SIZE = { w: 1.9, d: 2.4, radius: 1.55 };
// where the storage chest is built (0.0.19): beside the tent on its south-east side, a little forward of its middle,
// facing the fire, on open ground between the tent and the fire with room to walk round it. It is 0.9 m across and
// 0.56 deep; its ring reaches just round its corners. It stands 2.9 m from the tent's middle, so its ring and tap area
// stay clear of the tent's (1.75 m and 1.92 m out from the tent's middle; the chest's 0.8 m and 0.97 m).
const CHEST = W(0.9, 7.3), CHEST_SIZE = { w: 0.9, d: 0.56, radius: 0.6 };
// where the firewood pile is stacked (0.0.21): beside the fire on its east side, end on to it, with room to walk
// between them. Logs on two bearers, 1.2 m along and 0.6 across; its ring reaches just round its ends.
const WOODPILE = W(4.6, 2.2), WOODPILE_SIZE = { w: 1.2, d: 0.6, radius: 0.75 };
// where the training dummy stands (0.0.22): on the open grass west of the fire, between the shelter and the pool's bank,
// clear of the camp's other spots and of the stones and branches, with room to walk all round it. A post with its
// crossbar running east to west, side on to the camera as it starts (looking north), so it reads as a dummy (he
// strikes it from whichever side is nearest); it is in the way out to its radius, which reaches past the crossbar's
// ends.
const DUMMY = W(-2.8, 1.2), DUMMY_SIZE = { radius: 0.5 };
// the rats' nest (chapter 2, part 2): in the edge of the woods downriver, south-west of the camp along the river bank, a
// short walk from the shelter, out of the way of the fishing spots' banks and the camp's other spots. A mound of straw
// and twigs about 1.1 m across, in the way out to its radius; its hole faces east, towards the camp, and is seen side on
// from the camera as it starts. Three rats live round it and potter within `roam` of it, on open grass and the sandy bank.
const NEST = W(-12.3, 12.7);
// the goblin camp (chapter 2, its last part): past the nest, where the river leaves the valley into the woods, in a small
// clearing on the bank, so it blocks the way on down the river. A palisade ring 9.2 m across, its way in facing up the
// valley towards the camp and the nest, its gate on the far side facing the way on down the river; inside, the chief's
// tent at the back on the west, its door facing the middle, a totem just inside the way in, a cold fire ring in the
// middle. It is seen whole from the camera as it starts (looking north), with no trees between: those in the clearing
// and just south of it are kept out of the woods (clearOfGoblins). The land reaches it along the bank (`land`).
const GOBLINS = W(-10.9, 22.5), GOBLIN_TENT = W(-12.36, 20.41), GOBLIN_FIRE = W(-10.67, 22.83);
const GOBLIN_CAMP: GoblinCampSpot = {
  pos: GOBLINS, radius: 4.6, sides: 10, way: 2.7, gate: -0.5,
  tent: { pos: GOBLIN_TENT, rot: facing(GOBLIN_TENT, GOBLINS), w: 1.7, d: 2.2, radius: 1.4 },
  totem: W(-8.36, 20.72), fire: { pos: GOBLIN_FIRE, radius: 0.5 }, roam: 3.1, goblins: 3,
};
/** Whether a tree at `p` stays clear of the goblin camp: out of its clearing, and not in the stretch just south of it,
 *  between the camera (as it starts, looking north) and him in the camp. */
const clearOfGoblins = (p: Vec2) => !(p.x > GOBLINS.x - 6 && p.x < GOBLINS.x + 5 && p.z > GOBLINS.z - 5 && p.z < GOBLINS.z + 7);

// the river from the pool south-west past the sandy bank, and the falls pouring into the pool
const RIVER = { points: [W(-14, -11.2), W(-15.6, -2), W(-16.6, 8), W(-18.2, 20), W(-19.4, 36)], width: 3.4 };
const FALLS: Falls = { lip: W(-14, -15.2), width: 3.6, height: 70, pool: { pos: W(-14, -11.2), radius: 3.8 } };
const WATER = waterShape(RIVER, FALLS);

/** Woods all round the clearing, kept off the water and its bank and off the scree at the foot of the wall. */
function woods(): TreeSpot[] {
  const r = seeded(13), out: TreeSpot[] = [];
  const dry = (p: Vec2) => WATER.edge(p) > SHORE_CLEAR && p.z > wallFootZ(FALLS, p.x) + APRON + 1;
  const ring = (n: number, a: Area, kinds: TreeKind[]) => {
    for (let i = 0; i < n; i++) {
      let pos = W(a.minX + r() * (a.maxX - a.minX), a.minZ + r() * (a.maxZ - a.minZ));
      for (let tries = 0; !dry(pos) && tries < 20; tries++) pos = W(a.minX + r() * (a.maxX - a.minX), a.minZ + r() * (a.maxZ - a.minZ));
      if (!dry(pos)) continue;
      out.push({ pos, kind: kinds[Math.floor(r() * kinds.length)]!, size: 0.85 + r() * 0.5 });
    }
  };
  ring(34, { minX: -32, maxX: 36, minZ: 16.5, maxZ: 34 }, ['pine', 'pine', 'oak', 'birch']);       // south
  ring(18, { minX: 17.5, maxX: 36, minZ: -13.5, maxZ: 16.5 }, ['pine', 'oak', 'birch']);         // east
  ring(16, { minX: -36, maxX: -20.5, minZ: -12, maxZ: 34 }, ['pine', 'oak']);                    // beyond the river
  return out;
}

/** Things to pick up: [kind, x, z, rot]; ids are the kind and a number, in order. */
function pickups(list: [PickupKind, number, number, number][]): PickupSpot[] {
  const n: Partial<Record<PickupKind, number>> = {};
  return list.map(([kind, x, z, rot]) => ({ id: `${kind}${(n[kind] = (n[kind] ?? 0) + 1)}`, kind, pos: W(x, z), rot }));
}

export const CAMP: Layout = {
  // the walkable land reaches the water's edge along the river (the river blocks walking, world/nav.ts)
  village: { minX: -15.5, maxX: 16, minZ: -12.5, maxZ: 15 },
  start: W(-8.8, -7.6),                 // the pool's bank, where the river leaves him
  hearth: { pos: FIRE, radius: 0.62 },  // the fire spot (siteOf), where the campfire is built
  hearthModel: null,                    // ...nothing there until then (GameState.built)
  square: 0,
  buildings: [],
  props: [],
  gardens: [],
  nodes: [
    tree('camp_birch1', 'birch_tree', 8.2, -7.6, 1.0), tree('camp_birch2', 'birch_tree', 11.6, -2.4, 0.95),
    tree('camp_birch3', 'birch_tree', 12.4, 6.4, 1.1), tree('camp_birch4', 'birch_tree', 6.4, 11.2, 1.0),
    tree('camp_birch5', 'birch_tree', -5.8, 10.4, 0.9),
    // copper in boulders that came down off the mountain
    rock('camp_copper1', 'copper_rock', 9.8, -10.4), rock('camp_copper2', 'copper_rock', 13.8, -8.2),
    // chapter 2: fish rising in the pool below the falls and along the river, each out of reach of the bank but for a
    // rod, with dry ground on the bank to stand on
    fish('camp_fish1', -12.1, -10.0), fish('camp_fish2', -13.7, -7.4),
    fish('camp_fish3', -15.1, -3.4), fish('camp_fish4', -16.4, 5.0), fish('camp_fish5', -17.0, 10.6),
  ],
  // the woods, and (chapter 2) a pine by the rats' nest, where the woods come down to the river (off to the side, so it
  // never stands between the camera, as it starts, and him at the nest); none in the goblin camp's clearing
  trees: [...woods().filter(t => clearOfGoblins(t.pos)), { pos: W(-13.8, 15.6), kind: 'pine', size: 1.1 }],
  bushes: [W(-10.6, 3.2), W(14.6, 12.4), W(1.8, 13.6), W(-9.4, 12.6), W(15.2, 1.2)],
  lanterns: [],
  river: RIVER,
  paths: [],                            // nobody has worn a track here yet
  parcels: [],
  // the shelter's spot, the storage chest's, the firewood pile's and the training dummy's (siteOf)
  camp: {
    tent: { pos: TENT, rot: facing(TENT, FIRE), ...TENT_SIZE }, chest: { pos: CHEST, rot: facing(CHEST, FIRE), ...CHEST_SIZE },
    woodpile: { pos: WOODPILE, rot: facing(WOODPILE, FIRE), ...WOODPILE_SIZE },
    dummy: { pos: DUMMY, rot: 0, ...DUMMY_SIZE },
  },
  falls: FALLS,
  pickups: pickups([
    // the wreck, strewn along the bank where he washes up: the book beside him, planks at the water's edge
    ['book', -7.9, -6.7, 0.6],
    ['plank', -11.9, -7.5, 1.1], ['plank', -13.2, -4.0, 2.6], ['plank', -7.0, -10.4, -0.4],
    ['plank', -12.6, 0.8, 0.3], ['plank', -5.6, -4.6, 1.9],
    ['tarp', -12.0, -2.6, 0.8],
    ['crate', -10.4, -5.6, 0.5],
    // stones round the clearing and along the bank
    ['stone', -9.6, -2.0, 0], ['stone', -3.0, -9.6, 1.2], ['stone', 3.6, -6.2, 2.1], ['stone', 5.2, 4.4, 0.4],
    ['stone', -3.8, 7.6, 2.8], ['stone', 11.8, -11.4, 1.7], ['stone', -13.6, 6.4, 0.9],
    // branches fallen under the birches and the bushes
    ['branch', 7.0, -6.6, 0.4], ['branch', 10.4, -1.4, 2.2], ['branch', 11.2, 7.6, 1.3], ['branch', -4.6, 9.4, 2.9],
    ['branch', -9.6, 4.2, 0.7], ['branch', 2.4, 12.4, 1.8],
    // chapter 2: berry bushes in a patch east of the fire, between the ways to the birches, with room to walk between
    ['bush', 7.3, 1.9, 0.3], ['bush', 8.9, 0.8, 2.1], ['bush', 9.0, 3.1, 4.0], ['bush', 10.6, 1.9, 1.2], ['bush', 10.4, 4.1, 5.3],
    // building materials (data/building.ts): reeds at the river's edge downstream of the wreck, cut for their fibre, and
    // patches of clay in the bank between them, dug out a lump at a time
    ['reeds', -13.5, 1.6, 0.4], ['reeds', -13.75, 3.0, 2.2], ['reeds', -14.05, 4.5, 1.1], ['reeds', -14.6, 8.0, 3.0], ['reeds', -14.85, 9.1, 0.7],
    ['clay', -12.75, -1.0, 0.3], ['clay', -14.35, 6.9, 1.9], ['clay', -14.6, 10.3, 0.9],
  ]),
  // broken ribs of the wrecked boat, washed up at the water's edge (the pool's, by the start, and the river's)
  debris: [
    { model: 'HullRib', pos: W(-9.8, -10.2), rot: 2.2, y: 0.05, radius: 0.5 },
    { model: 'HullRib', pos: W(-14.5, 2.6), rot: -0.5, y: 0.1, radius: 0.6 },
  ],
  // (chapter 2) the rats' nest downriver, with three rats round it (core/rats.ts)
  nests: [{ id: 'nest', pos: NEST, rot: 1.2, radius: 0.55, rats: 3, roam: 2.4 }],
  // (chapter 2) the goblin camp past the nest, and the land along the bank down to it, from the clearing's south edge
  // (touching it, so no step of the way there is off the land)
  goblinCamp: GOBLIN_CAMP,
  land: [{ minX: -15.5, maxX: -5.5, minZ: 15, maxZ: 27 }],
  startTools: [],                       // he washes up with nothing
  ground: { minX: -44, maxX: 44, minZ: -48, maxZ: 40 },
};
