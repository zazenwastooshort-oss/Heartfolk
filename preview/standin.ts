// The camp, for the opening preview only (not part of the game): drawn with the game's own views, so the cinematic
// lands in the camp as it is now: the ground, the pool and the river as one body of water (render/world.ts,
// world/water.ts), the towering wall with its rocky foot, the falls and the mist (render/waterfall.ts), the trees,
// bushes and the boat's ribs (render/village.ts), the wreck, stones and branches (render/pickups.ts) and the birches
// and copper rocks (render/nodes.ts), from a new game's state.
import * as THREE from 'three';
import { buildWorld, type WorldView } from '../src/render/world';
import { FallsView } from '../src/render/waterfall';
import { VillageView } from '../src/render/village';
import { PickupsView } from '../src/render/pickups';
import { NodesView } from '../src/render/nodes';
import { createState, type GameState } from '../src/core/state';
import { CAMP } from '../src/world/camp';
import { footOf } from '../src/world/falls';
import { waterOf } from '../src/world/water';
import type { OpeningSite } from '../src/world/opening';

/** The wall leans back this far for every metre up (as render/waterfall.ts draws it). */
export const LEAN = 0.14;
const FALLS = CAMP.falls!;
/** The camp's falls and where he wakes up, as the cinematic's site. */
export const SITE: OpeningSite = {
  lip: FALLS.lip, width: FALLS.width, height: FALLS.height, pool: FALLS.pool, start: CAMP.start, startYaw: Math.PI / 2, lean: LEAN,
};
const SKY = new THREE.Color('#b4d3ec'), CLOUD = new THREE.Color('#eef3f5');

export class CampStandIn {
  readonly group: THREE.Scene = new THREE.Scene();
  private world: WorldView;
  private falls: FallsView;
  private village: VillageView;
  private pickups: PickupsView;
  private nodes: NodesView;
  private state: GameState = createState(CAMP, 1);
  private look = new THREE.Vector3(CAMP.start.x, 1, CAMP.start.z);

  /** models: village.glb's scene; rock: miner.glb's Rock (the copper rocks). */
  constructor(models: THREE.Object3D, rock: THREE.Object3D) {
    const g = this.group;
    this.world = buildWorld(g, CAMP);
    this.falls = new FallsView(g, FALLS, footOf(CAMP), waterOf(CAMP));
    this.village = new VillageView(g, CAMP, models);
    this.pickups = new PickupsView(g, CAMP, models);
    this.nodes = new NodesView(g, CAMP, rock, models);
  }

  /** The waterfall's mist curtain and cloud: hidden while the cinematic's camera is up high, falling past the face. */
  setMist(visible: boolean): void { this.falls.setMistVisible(visible); }

  update(t: number, dt: number, camera: THREE.Camera): void {
    this.world.update(t);
    this.falls.update(t, dt, camera, this.look, SKY, CLOUD);
    this.village.update(t, 0, this.look, dt);
    this.pickups.update(this.state, t, dt, camera, 0);
    this.nodes.update(this.state, dt, this.look);
  }
}
