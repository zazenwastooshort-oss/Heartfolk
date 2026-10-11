// Where a new game starts (12 Oct 2026): a clearing at the foot of a waterfall. The river runs along the clifftop to
// the north, pours over the cliff into a pool and flows on to the south-west; the character washes up on the pool's
// bank and makes camp. The village lies far up the river and comes much later (world/layout.ts, VILLAGE).
// Data only, like the village: x east, z south, in metres; the camera starts looking north at the falls.
import type { Area, Layout, NodeSpot, TreeKind, TreeSpot, Vec2 } from './layout';

const W = (x: number, z: number): Vec2 => ({ x, z });
const facing = (from: Vec2, to: Vec2) => Math.atan2(to.x - from.x, to.z - from.z);

/** Trunk radius at chopping height for a size-1 tree (as in layout.ts). */
const TRUNK: Record<string, number> = { birch_tree: 0.115, oak_tree: 0.2 };
const tree = (id: string, resource: string, x: number, z: number, size = 1): NodeSpot =>
  ({ id, resource, pos: { x, z }, radius: TRUNK[resource]! * size, size });
const rock = (id: string, resource: string, x: number, z: number): NodeSpot => ({ id, resource, pos: { x, z }, radius: 0.95 });

function seeded(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

const FIRE = W(2.4, 3.0), TENT = W(-1.6, 5.8);
const CLIFF_HEIGHT = 7;

/** Woods all round the clearing, and on the clifftop above the falls. */
function woods(): TreeSpot[] {
  const r = seeded(13), out: TreeSpot[] = [];
  const ring = (n: number, a: Area, kinds: TreeKind[], y = 0, keepClear?: (p: Vec2) => boolean) => {
    for (let i = 0; i < n; i++) {
      const pos = W(a.minX + r() * (a.maxX - a.minX), a.minZ + r() * (a.maxZ - a.minZ));
      if (keepClear?.(pos)) continue;
      out.push({ pos, kind: kinds[Math.floor(r() * kinds.length)]!, size: 0.85 + r() * 0.5, ...(y ? { y } : {}) });
    }
  };
  ring(34, { minX: -32, maxX: 36, minZ: 16.5, maxZ: 34 }, ['pine', 'pine', 'oak', 'birch']);       // south
  ring(18, { minX: 17.5, maxX: 36, minZ: -13.5, maxZ: 16.5 }, ['pine', 'oak', 'birch']);         // east
  ring(16, { minX: -36, maxX: -20.5, minZ: -12, maxZ: 34 }, ['pine', 'oak']);                    // beyond the river
  // on the clifftop, keeping back from the edge and off the river that runs to the falls
  ring(40, { minX: -40, maxX: 40, minZ: -46, maxZ: -19 }, ['pine', 'pine', 'oak'], CLIFF_HEIGHT, p => Math.abs(p.x + 14) < 4.5);
  return out;
}

export const CAMP: Layout = {
  village: { minX: -12, maxX: 16, minZ: -12.5, maxZ: 15 },
  start: W(-8.8, -7.6),                 // the pool's bank, where the river leaves him
  hearth: { pos: FIRE, radius: 0.62 },  // the campfire (cold until he lights it)
  hearthModel: 'CampfireCold',
  square: 0,
  buildings: [],
  props: [],
  gardens: [],
  nodes: [
    tree('camp_birch1', 'birch_tree', 8.2, -7.6, 1.0), tree('camp_birch2', 'birch_tree', 11.6, -2.4, 0.95),
    tree('camp_birch3', 'birch_tree', 12.4, 6.4, 1.1), tree('camp_birch4', 'birch_tree', 6.4, 11.2, 1.0),
    tree('camp_birch5', 'birch_tree', -5.8, 10.4, 0.9),
    // copper in boulders that came down off the cliff
    rock('camp_copper1', 'copper_rock', 9.8, -10.4), rock('camp_copper2', 'copper_rock', 13.8, -8.2),
  ],
  trees: woods(),
  bushes: [W(-10.6, 3.2), W(14.6, 12.4), W(1.8, 13.6), W(-9.4, 12.6), W(15.2, 1.2)],
  lanterns: [],
  river: { points: [W(-14, -11.2), W(-15.6, -2), W(-16.6, 8), W(-18.2, 20), W(-19.4, 36)], width: 3.4 },
  paths: [{ points: [W(-8.6, -6.2), W(-3.4, -1.4), W(1.4, 2.0)], width: 1.0 }],   // a worn track from the pool to the fire
  parcels: [],
  camp: { tent: { pos: TENT, rot: facing(TENT, FIRE) } },
  falls: {
    lip: W(-14, -15.2), width: 3.6, height: CLIFF_HEIGHT,
    pool: { pos: W(-14, -11.2), radius: 3.8 },
    upper: [W(-14.6, -46), W(-13.2, -30), W(-14, -15.4)],
  },
  ground: { minX: -44, maxX: 44, minZ: -48, maxZ: 40 },
};
