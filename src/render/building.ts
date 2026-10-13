// Things built in stages (data/building.ts), drawn at their spots (world/steps.ts): the camp's upgrades, the wall tent
// and the log cabin at the tent's spot, the stone hearth round the fire and the woodshed over the firewood pile.
// Nothing shows until one is begun; then each stage shows as he reaches it: footings (stakes and a string round where
// it goes, its first logs lying ready), then, as placeholders until the camp build's stage 4 draws the chosen designs,
// its footprint (SHAPES' blocks) as a see-through block rising a third of the way, two thirds, then all of it once
// built, settling in a little at each step. While it is under way a ring round it fills up, and a tap area
// (userData.raiseId) sends him back to it; at night the shelter's upgrade has none, so a tap there is the shelter's own
// and sends him to bed. A step gives way to the next one at its spot once that one is half built (stepShown in
// core/building.ts; render/structures.ts hides the tent the same way). Reads state; never changes it.
import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { Layout } from '../world/layout';
import { lineOf, progressOf, stageOf, stepShown, STAGED_IDS } from '../core/building';
import { shapeOf, stepPlace } from '../world/steps';
import { isNight } from '../core/clock';
import { CARPENTRY, LINES, STAGED, type Shape } from '../data/building';
import type { MakeId } from '../data/making';
import { flat } from './parts';

const C = { stake: '#6e4f33', string: '#efe2c2', log: '#d6cdb8' };
/** The placeholder's colour for each upgrade, and how see-through it is while it goes up and once built. */
const LOOK: Partial<Record<MakeId, string>> = { wall_tent: '#d8c39a', log_cabin: '#8a6440', stone_hearth: '#8d877d', woodshed: '#8e6a45' };
const OPACITY = { rising: 0.35, built: 0.6 };
const RING = { width: 0.07, gap: 0.18, segments: 48, color: 0xf1e8d4 };
const POP = 0.45;                  // seconds to settle in at each stage

type Part = THREE.Object3D;
const mat = (c: string) => flat(c, 0.92);

/** A box `w` x `h` x `d` of colour `c` with its middle at (x, y, z). */
function box(w: number, h: number, d: number, c: string, x: number, y: number, z: number): Part {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); return m;
}

/** A pole or log of radius `r` from point a to point b. */
function pole(r: number, c: string, a: [number, number, number], b: [number, number, number], sides = 7): Part {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), len = va.distanceTo(vb);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, sides), mat(c));
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize());
  return m;
}

/** The box round all of a shape's blocks, in its own frame: [x0, x1, z0, z1]. */
function bounds(shape: Shape): [number, number, number, number] {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const b of shape.blocks) {
    const [a0, a1, c0, c1] = 'box' in b ? b.box : [b.ring[0] - b.ring[2], b.ring[0] + b.ring[2], b.ring[1] - b.ring[2], b.ring[1] + b.ring[2]];
    x0 = Math.min(x0, a0); x1 = Math.max(x1, a1); z0 = Math.min(z0, c0); z1 = Math.max(z1, c1);
  }
  return [x0, x1, z0, z1];
}

/** Footings round a shape: a stake at each corner of its footprint with a string between them, a couple of logs lying
 *  ready in front. */
function footings(shape: Shape): Part[] {
  const [x0, x1, z0, z1] = bounds(shape), out: Part[] = [], w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] as const) out.push(box(0.045, 0.3, 0.045, C.stake, x, 0.15, z));
  out.push(box(w, 0.012, 0.012, C.string, cx, 0.22, z0), box(w, 0.012, 0.012, C.string, cx, 0.22, z1));
  out.push(box(0.012, 0.012, d, C.string, x0, 0.22, cz), box(0.012, 0.012, d, C.string, x1, 0.22, cz));
  out.push(pole(0.06, C.log, [x0 + 0.2, 0.06, z1 + 0.25], [x1 - 0.2, 0.06, z1 + 0.3]), pole(0.055, C.log, [x0 + 0.3, 0.06, z1 + 0.42], [x1 - 0.35, 0.06, z1 + 0.44]));
  return out;
}

/** A placeholder at `stage` (1 to CARPENTRY.stages): every block of its footprint as a see-through solid, rising with
 *  each stage to its full height once built. */
function rising(id: MakeId, shape: Shape, stage: number): Part[] {
  const h = Math.max(0.05, shape.tall * stage / CARPENTRY.stages), built = stage >= CARPENTRY.stages;
  const m = new THREE.MeshStandardMaterial({ color: LOOK[id] ?? '#b49a74', roughness: 0.9, transparent: true, opacity: built ? OPACITY.built : OPACITY.rising, depthWrite: false });
  return shape.blocks.map(b => {
    const mesh = 'box' in b
      ? new THREE.Mesh(new THREE.BoxGeometry(b.box[1] - b.box[0], h, b.box[3] - b.box[2]), m)
      : new THREE.Mesh(new THREE.CylinderGeometry(b.ring[2], b.ring[2], h, 16), m);
    mesh.position.set('box' in b ? (b.box[0] + b.box[1]) / 2 : b.ring[0], h / 2, 'box' in b ? (b.box[2] + b.box[3]) / 2 : b.ring[1]);
    return mesh;
  });
}

/** `id` at `stage`, its parts in a group. */
function modelAt(id: MakeId, shape: Shape, stage: number): THREE.Group {
  const g = new THREE.Group();
  for (const part of stage === 0 ? footings(shape) : rising(id, shape, stage)) {
    part.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    g.add(part);
  }
  return g;
}

interface Item {
  id: MakeId; root: THREE.Group; stages: THREE.Group[]; hit: THREE.Mesh; ring: THREE.Group; fill: THREE.Mesh;
  stage: number; pop: number; upgrade: boolean;
}

export class BuildingView {
  private items = new Map<MakeId, Item>();
  private ringMat = (opacity: number) => new THREE.MeshBasicMaterial({ color: RING.color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });

  /** `pickables`: the view's own list of things a tap can hit (render/view.ts), shared, so the tap areas this adds and
   *  takes away as things are begun and built reach ui/input.ts. */
  constructor(private scene: THREE.Scene, private layout: Layout, readonly pickables: THREE.Object3D[] = []) {}

  private make(id: MakeId): Item | null {
    const place = stepPlace(this.layout, id), shape = shapeOf(id);
    if (!place || !shape) return null;
    const root = new THREE.Group();
    root.position.set(place.pos.x, 0, place.pos.z); root.rotation.y = place.rot;
    const stages = Array.from({ length: CARPENTRY.stages + 1 }, (_, s) => { const g = modelAt(id, shape, s); g.visible = false; root.add(g); return g; });
    const reach = shape.reach + 0.4;
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(reach, reach, shape.tall, 12), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(place.pos.x, shape.tall / 2, place.pos.z); hit.userData.raiseId = id; hit.visible = false;
    this.scene.add(hit); this.pickables.push(hit);
    const inner = shape.reach + RING.gap, geo = new THREE.RingGeometry(inner, inner + RING.width, RING.segments, 1, -Math.PI / 2).rotateX(Math.PI / 2);
    const ring = new THREE.Group(), track = new THREE.Mesh(geo, this.ringMat(0.28)), fill = new THREE.Mesh(geo.clone(), this.ringMat(0.85));
    track.position.y = 0.03; fill.position.y = 0.035; ring.add(track, fill); ring.position.set(place.pos.x, 0, place.pos.z); ring.visible = false;
    this.scene.add(root, ring);
    return { id, root, stages, hit, ring, fill, stage: -2, pop: 1, upgrade: !!STAGED[id]?.upgrades };
  }

  update(state: GameState, dt: number): void {
    const night = isNight(state.time), task = state.player.task;
    for (const id of STAGED_IDS) {
      const stage = stageOf(state, id);
      let item = this.items.get(id);
      if (stage < 0 && !item) continue;
      if (!item) { const made = this.make(id); if (!made) continue; item = made; this.items.set(id, item); }
      if (stage !== item.stage) {
        if (item.stage !== -2) item.pop = 0;
        item.stages.forEach((g, s) => { g.visible = s === stage; });
        item.stage = stage;
      }
      // a step gives way to the next one at its spot once that one is half built (the wall tent to the log cabin)
      const line = lineOf(id), shown = line ? stepShown(state, line) : null;
      item.root.visible = stage >= 0 && (!line || !shown || LINES[line].indexOf(id) >= LINES[line].indexOf(shown));
      if (item.pop < 1) {
        item.pop = Math.min(1, item.pop + dt / POP);
        item.root.scale.setScalar(0.92 + 0.08 * (1 - Math.pow(1 - item.pop, 3)));
      }
      const underway = stage >= 0 && stage < CARPENTRY.stages;
      // a tap on it sends him back to it, by day (at night the shelter's upgrade leaves the tap to the shelter: to bed)
      item.hit.visible = underway && !(item.upgrade && line === 'tent' && night);
      item.ring.visible = underway;
      if (underway) item.fill.geometry.setDrawRange(0, Math.ceil(progressOf(state, id) * RING.segments) * 6);
      // while he works at it, the ring is brighter
      (item.fill.material as THREE.MeshBasicMaterial).opacity = task.kind === 'raise' && task.id === id ? 0.95 : 0.6;
    }
  }
}
