// Things built in stages (data/building.ts), drawn in code: the log bench and the workbench where the player placed
// them, and the shelter's upgrades at the tent's spot, the lean-to and the log hut. Nothing shows until it is placed
// (or begun); then each stage shows as he reaches it: footings (stakes and a string round where it goes, its first
// logs lying ready), its frame, half built, then built, settling in a little at each step. While it is under way a ring
// round it fills up, and a tap area (userData.raiseId) sends him back to it; at night the shelter's upgrade has none,
// so a tap there is the shelter's own and sends him to bed. An upgrade takes the place of the shelter before it from its
// frame on (render/structures.ts hides that one). Also the see-through copy the Build window places (showGhost): the
// built model, green where it fits and red where it doesn't, with its footprint on the ground. Reads state; never
// changes it. Placeholders, quick to change.
import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { Layout, Vec2 } from '../world/layout';
import { buildSite, isPlaced, progressOf, rectOf, shelterShown, stageOf, STAGED_IDS, turnRot } from '../core/building';
import { isNight } from '../core/clock';
import { CARPENTRY, SHELTERS, STAGED } from '../data/building';
import type { MakeId } from '../data/making';
import { flat } from './parts';

const C = {
  stake: '#6e4f33', string: '#efe2c2', log: '#d6cdb8', logEnd: '#e2c48e', wood: '#8a6440', woodDark: '#6f5034',
  plank: '#c09463', bark: '#8e6a45', barkLight: '#a57e55', fibre: '#b3bf73', clay: '#b0663f', tarp: '#d8c39a', stone: '#8d877d',
};
const RING = { width: 0.07, gap: 0.18, segments: 48, color: 0xf1e8d4 };
const POP = 0.45;                  // seconds to settle in at each stage
const GHOST = { fits: 0x86d97a, misfit: 0xe2715f, opacity: 0.42, ground: 0.3 };

type Part = THREE.Object3D;
const mat = (c: string) => flat(c, 0.92);

/** A box `w` x `h` x `d` of colour `c` with its middle at (x, y, z), turned `ry` round the vertical. */
function box(w: number, h: number, d: number, c: string, x: number, y: number, z: number, ry = 0): Part {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); m.rotation.y = ry; return m;
}

/** A pole or log of radius `r` from point a to point b. */
function pole(r: number, c: string, a: [number, number, number], b: [number, number, number], sides = 7): Part {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), len = va.distanceTo(vb);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, sides), mat(c));
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize());
  return m;
}

/** Footings round a w x d spot: a stake at each corner with a string between them, a couple of logs lying ready. */
function footings(w: number, d: number): Part[] {
  const out: Part[] = [], hw = w / 2 + 0.08, hd = d / 2 + 0.08;
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as const) out.push(box(0.045, 0.3, 0.045, C.stake, x, 0.15, z));
  out.push(box(w + 0.16, 0.012, 0.012, C.string, 0, 0.22, -hd), box(w + 0.16, 0.012, 0.012, C.string, 0, 0.22, hd));
  out.push(box(0.012, 0.012, d + 0.16, C.string, -hw, 0.22, 0), box(0.012, 0.012, d + 0.16, C.string, hw, 0.22, 0));
  out.push(pole(0.06, C.log, [-w / 2 + 0.1, 0.06, hd + 0.25], [w / 2 - 0.1, 0.06, hd + 0.3]), pole(0.055, C.log, [-w / 2 + 0.2, 0.06, hd + 0.4], [w / 2 - 0.25, 0.06, hd + 0.42]));
  return out;
}

/** The log bench (1.4 x 0.5): two stumps, a log laid across them, then split flat to sit on with a rail behind. */
function logBench(stage: number): Part[] {
  const out: Part[] = [];
  if (stage === 0) return footings(1.4, 0.5);
  for (const x of [-0.5, 0.5]) out.push(pole(0.15, C.wood, [x, 0, 0], [x, 0.34, 0], 8), box(0.24, 0.012, 0.24, C.logEnd, x, 0.345, 0));
  if (stage === 2) out.push(pole(0.13, C.log, [-0.7, 0.46, 0], [0.7, 0.46, 0], 8));
  if (stage >= 3) {
    out.push(box(1.4, 0.09, 0.32, C.plank, 0, 0.39, 0.02), box(1.4, 0.02, 0.3, C.logEnd, 0, 0.445, 0.02));
    for (const x of [-0.6, 0.6]) out.push(pole(0.03, C.woodDark, [x, 0.42, -0.16], [x, 0.78, -0.22]));
    out.push(pole(0.05, C.log, [-0.7, 0.76, -0.22], [0.7, 0.76, -0.22]));
  }
  return out;
}

/** The workbench (1.4 x 0.8): four legs and rails, then half its top, then all of it, lashed, with a mallet on it. */
function workbench(stage: number): Part[] {
  const out: Part[] = [];
  if (stage === 0) return footings(1.4, 0.8);
  const H = 0.82;
  for (const [x, z] of [[-0.6, -0.3], [0.6, -0.3], [0.6, 0.3], [-0.6, 0.3]] as const) out.push(box(0.09, H, 0.09, C.wood, x, H / 2, z));
  out.push(box(1.2, 0.06, 0.06, C.woodDark, 0, 0.25, -0.3), box(1.2, 0.06, 0.06, C.woodDark, 0, 0.25, 0.3));
  out.push(box(0.06, 0.06, 0.6, C.woodDark, -0.6, 0.25, 0), box(0.06, 0.06, 0.6, C.woodDark, 0.6, 0.25, 0));
  if (stage >= 2) {
    out.push(box(1.3, 0.06, 0.07, C.woodDark, 0, H - 0.03, -0.3), box(1.3, 0.06, 0.07, C.woodDark, 0, H - 0.03, 0.3));
    const planks = stage >= 3 ? [-0.27, 0, 0.27] : [0.27];
    for (const z of planks) out.push(box(1.4, 0.06, 0.26, C.plank, 0, H + 0.03, z));
  }
  if (stage >= 3) {
    for (const [x, z] of [[-0.6, -0.3], [0.6, -0.3], [0.6, 0.3], [-0.6, 0.3]] as const) out.push(box(0.11, 0.05, 0.11, C.fibre, x, 0.25, z));
    out.push(box(0.18, 0.12, 0.2, C.wood, 0.5, H + 0.12, 0.15));                       // a vice block
    out.push(pole(0.016, C.woodDark, [-0.3, H + 0.08, -0.1], [-0.05, H + 0.08, 0.12]));   // a mallet
    out.push(box(0.14, 0.08, 0.08, C.wood, -0.33, H + 0.1, -0.14, 0.7));
  }
  return out;
}

/** The lean-to, at the tent's spot (1.9 across, 2.4 deep, open to the fire at +z): two posts and a ridge pole with
 *  rafters down to the ground behind, then bark laid up the roof, then all of it, with branch sides and the tarp spread
 *  inside to sleep on. */
function leanTo(stage: number): Part[] {
  const out: Part[] = [];
  if (stage === 0) return footings(2.05, 2.55);
  const top = 1.75, front = 1.12, back = -1.18, xs = [-0.88, -0.3, 0.3, 0.88];
  for (const x of [-0.9, 0.9]) out.push(pole(0.06, C.wood, [x, 0, front], [x, top + 0.05, front]));
  out.push(pole(0.055, C.wood, [-1.02, top, front], [1.02, top, front]));
  for (const x of xs) out.push(pole(0.04, C.log, [x, top + 0.02, front + 0.05], [x, 0.04, back]));
  if (stage >= 2) {
    const n = stage >= 3 ? 6 : 3, L = Math.hypot(top, front - back), tilt = Math.atan2(top, front - back);
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / 6, y = 0.06 + k * (top - 0.06), z = back + k * (front - back);
      const slab = box(2.1, 0.04, L / 6 + 0.08, i % 2 ? C.bark : C.barkLight, 0, y + 0.06, z);
      slab.rotation.x = -tilt; out.push(slab);
    }
    for (const x of [-0.95, 0.95]) out.push(pole(0.03, C.woodDark, [x, 0.02, front - 0.2], [x, 0.02, back + 0.1]));
  }
  if (stage >= 3) {
    for (const x of [-0.97, 0.97]) for (let i = 0; i < 5; i++) {
      const z = back + 0.3 + i * 0.4, h = (z - back) / (front - back) * top;
      out.push(pole(0.025, C.woodDark, [x, 0, z], [x, Math.max(0.15, h - 0.05), z + 0.03], 5));
    }
    out.push(box(1.4, 0.03, 1.7, C.tarp, 0, 0.015, -0.15), box(1.2, 0.06, 0.3, C.fibre, 0, 0.05, -0.85));
    for (const x of [-0.9, 0.9]) out.push(box(0.14, 0.06, 0.14, C.fibre, x, top - 0.05, front));
  }
  return out;
}

/** A triangle of `c` (a gable end) `w` wide at its foot and `h` high, `t` thick, its foot's middle at (0, y, z). */
function gable(w: number, h: number, t: number, c: string, y: number, z: number): Part {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false }).translate(0, 0, -t / 2), mat(c));
  m.position.set(0, y, z); return m;
}

/** The log hut, at the tent's spot (1.9 across, 2.4 deep, its door facing the fire at +z): sill logs, then walls of logs
 *  going up course by course with a gap for the door, clay pressed between them, then the roof and a little clay
 *  chimney at the back. */
function logHut(stage: number): Part[] {
  const out: Part[] = [];
  if (stage === 0) {
    out.push(...footings(2.0, 2.5));
    for (const x of [-0.95, 0.95]) out.push(pole(0.09, C.log, [x, 0.09, -1.25], [x, 0.09, 1.25]));
    return out;
  }
  const r = 0.09, step = 0.17, rows = stage >= 2 ? 8 : 4, door = 0.36;
  for (let i = 0; i < rows; i++) {
    const y = r + i * step, odd = i % 2 === 1;
    // side walls (along z) and the back (along x) whole; the front with a gap for the door, closed above it
    for (const x of [-0.95, 0.95]) out.push(pole(r, C.log, [x, y + (odd ? 0 : step / 2), -1.3], [x, y + (odd ? 0 : step / 2), 1.3]));
    out.push(pole(r, C.log, [-1.05, y + (odd ? step / 2 : 0), -1.2], [1.05, y + (odd ? step / 2 : 0), -1.2]));
    if (i >= 6) out.push(pole(r, C.log, [-1.05, y + (odd ? step / 2 : 0), 1.2], [1.05, y + (odd ? step / 2 : 0), 1.2]));
    else for (const s of [-1, 1]) out.push(pole(r, C.log, [s * 1.05, y + (odd ? step / 2 : 0), 1.2], [s * door, y + (odd ? step / 2 : 0), 1.2]));
    if (stage >= 2 && i < rows - 1) {
      // clay pressed between the courses, a little proud of the logs
      const cy = y + step * 0.75;
      for (const x of [-0.95, 0.95]) out.push(box(0.2, 0.05, 2.4, C.clay, x, cy, 0));
      out.push(box(1.9, 0.05, 0.2, C.clay, 0, cy, -1.2));
    }
  }
  if (stage >= 2) out.push(pole(0.05, C.woodDark, [0, 1.45, -1.35], [0, 2.15, -1.35]), pole(0.05, C.woodDark, [0, 1.45, 1.35], [0, 2.15, 1.35]));
  if (stage >= 3) {
    const eave = 1.42, ridge = 2.15, half = 1.22, L = Math.hypot(half, ridge - eave), tilt = Math.atan2(ridge - eave, half);
    for (const s of [-1, 1]) {
      const roof = box(L + 0.12, 0.06, 2.85, s < 0 ? C.bark : C.barkLight, s * half / 2, (eave + ridge) / 2 + 0.04, 0);
      roof.rotation.z = -s * tilt; out.push(roof);
    }
    out.push(pole(0.06, C.woodDark, [0, ridge + 0.06, -1.45], [0, ridge + 0.06, 1.45]));
    out.push(gable(2.2, ridge - eave, 0.08, C.wood, eave, -1.2), gable(2.2, ridge - eave, 0.08, C.wood, eave, 1.2));
    out.push(box(0.08, 1.2, 0.1, C.woodDark, -door, 0.6, 1.24), box(0.08, 1.2, 0.1, C.woodDark, door, 0.6, 1.24), box(0.8, 0.08, 0.1, C.woodDark, 0, 1.22, 1.24));
    out.push(box(0.62, 1.1, 0.03, C.tarp, 0, 0.58, 1.18));                                // the tarp hung for a door
    out.push(box(0.36, 2.5, 0.36, C.clay, 0.55, 1.25, -1.42), box(0.42, 0.08, 0.42, C.stone, 0.55, 2.52, -1.42));   // chimney
  }
  return out;
}

const MODELS: Partial<Record<MakeId, (stage: number) => Part[]>> = { log_bench: logBench, workbench, lean_to: leanTo, log_hut: logHut };

/** A model at `stage`, its parts in a group. */
function modelAt(id: MakeId, stage: number): THREE.Group {
  const g = new THREE.Group();
  for (const part of MODELS[id]?.(stage) ?? []) {
    part.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    g.add(part);
  }
  return g;
}

/** Frees the geometries under `root` and the materials given (never the shared colours: render/parts.ts keeps those). */
function dispose(root: THREE.Object3D, mats: THREE.Material[] = []): void {
  root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
  for (const m of mats) m.dispose();
}

interface Item {
  id: MakeId; root: THREE.Group; stages: THREE.Group[]; hit: THREE.Mesh; ring: THREE.Group; fill: THREE.Mesh;
  /** where it stands, so a different placement (a reload, a new game) rebuilds it */
  key: string; stage: number; pop: number; upgrade: boolean;
}

export class BuildingView {
  private items = new Map<MakeId, Item>();
  private ghost: { id: MakeId; group: THREE.Group; model: THREE.Group; ground: THREE.Mesh; tint: THREE.MeshBasicMaterial; groundMat: THREE.MeshBasicMaterial } | null = null;
  private ringMat = (opacity: number) => new THREE.MeshBasicMaterial({ color: RING.color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });

  /** `pickables`: the view's own list of things a tap can hit (render/view.ts), shared, so the tap areas this adds and
   *  takes away as things are begun and built reach ui/input.ts. */
  constructor(private scene: THREE.Scene, private layout: Layout, readonly pickables: THREE.Object3D[] = []) {}

  /** Where it stands now (null: nowhere yet), as a key. */
  private keyOf(state: GameState, id: MakeId): string | null {
    const site = buildSite(state, this.layout, id);
    return site ? `${site.pos.x},${site.pos.z},${site.rot ?? 0}` : null;
  }

  private make(state: GameState, id: MakeId, key: string): Item {
    const site = buildSite(state, this.layout, id)!, root = new THREE.Group();
    root.position.set(site.pos.x, 0, site.pos.z); root.rotation.y = site.rot ?? 0;
    const stages = Array.from({ length: CARPENTRY.stages + 1 }, (_, s) => { const g = modelAt(id, s); g.visible = false; root.add(g); return g; });
    const reach = site.radius + 0.25;
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(reach + (isPlaced(id) ? 0 : 0.15), reach + (isPlaced(id) ? 0 : 0.15), 1.6, 12), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(site.pos.x, 0.8, site.pos.z); hit.userData.raiseId = id; hit.visible = false;
    this.scene.add(hit); this.pickables.push(hit);
    const inner = site.radius + RING.gap, geo = new THREE.RingGeometry(inner, inner + RING.width, RING.segments, 1, -Math.PI / 2).rotateX(Math.PI / 2);
    const ring = new THREE.Group(), track = new THREE.Mesh(geo, this.ringMat(0.28)), fill = new THREE.Mesh(geo.clone(), this.ringMat(0.85));
    track.position.y = 0.03; fill.position.y = 0.035; ring.add(track, fill); ring.position.set(site.pos.x, 0, site.pos.z); ring.visible = false;
    this.scene.add(root, ring);
    return { id, root, stages, hit, ring, fill, key, stage: -2, pop: 1, upgrade: !!STAGED[id]?.upgrades };
  }

  private drop(item: Item): void {
    this.scene.remove(item.root, item.ring, item.hit);
    const i = this.pickables.indexOf(item.hit); if (i >= 0) this.pickables.splice(i, 1);
    this.items.delete(item.id);
    dispose(item.root);
    dispose(item.ring, item.ring.children.map(c => (c as THREE.Mesh).material as THREE.Material));
    dispose(item.hit, [item.hit.material as THREE.Material]);
  }

  update(state: GameState, dt: number): void {
    const night = isNight(state.time), task = state.player.task, shelter = SHELTERS.indexOf(shelterShown(state) ?? 'shelter');
    for (const id of STAGED_IDS) {
      const stage = stageOf(state, id), key = stage >= 0 ? this.keyOf(state, id) : null;
      let item = this.items.get(id);
      if (item && item.key !== key) { this.drop(item); item = undefined; }
      if (!key) continue;
      if (!item) { item = this.make(state, id, key); this.items.set(id, item); }
      if (stage !== item.stage) {
        if (item.stage !== -2) item.pop = 0;
        item.stages.forEach((g, s) => { g.visible = s === stage; });
        item.stage = stage;
      }
      // a shelter gives way to its own upgrade once that one's frame is up (the lean-to to the log hut)
      item.root.visible = !SHELTERS.includes(id) || SHELTERS.indexOf(id) >= shelter;
      if (item.pop < 1) {
        item.pop = Math.min(1, item.pop + dt / POP);
        item.root.scale.setScalar(0.92 + 0.08 * (1 - Math.pow(1 - item.pop, 3)));
      }
      const underway = stage < CARPENTRY.stages;
      // a tap on it sends him back to it, by day (at night the shelter's upgrade leaves the tap to the shelter: to bed)
      item.hit.visible = underway && !(item.upgrade && night);
      item.ring.visible = underway;
      if (underway) item.fill.geometry.setDrawRange(0, Math.ceil(progressOf(state, id) * RING.segments) * 6);
      // while he works at it, the ring is brighter
      (item.fill.material as THREE.MeshBasicMaterial).opacity = task.kind === 'raise' && task.id === id ? 0.95 : 0.6;
    }
  }

  /** Show the see-through copy of `id` at `pos`, turned `turn` quarter turns: green where it fits, red where not. */
  showGhost(id: MakeId, pos: Vec2, turn: number, fits: boolean): void {
    if (this.ghost?.id !== id) {
      this.hideGhost();
      const tint = new THREE.MeshBasicMaterial({ color: GHOST.fits, transparent: true, opacity: GHOST.opacity, depthWrite: false });
      const groundMat = new THREE.MeshBasicMaterial({ color: GHOST.fits, transparent: true, opacity: GHOST.ground, depthWrite: false, side: THREE.DoubleSide });
      const model = modelAt(id, CARPENTRY.stages);
      model.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = tint; m.castShadow = false; m.receiveShadow = false; } });
      const size = rectOf(id, { pos: { x: 0, z: 0 }, turn: 0 }) ?? { w: 1, d: 1 };
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(size.w + 0.1, size.d + 0.1).rotateX(-Math.PI / 2), groundMat);
      ground.position.y = 0.04; ground.renderOrder = 4; model.renderOrder = 5;
      const group = new THREE.Group(); group.add(ground, model);
      this.scene.add(group);
      this.ghost = { id, group, model, ground, tint, groundMat };
    }
    const g = this.ghost!;
    g.group.position.set(pos.x, 0, pos.z); g.group.rotation.y = turnRot(turn);
    g.tint.color.setHex(fits ? GHOST.fits : GHOST.misfit); g.groundMat.color.setHex(fits ? GHOST.fits : GHOST.misfit);
    g.group.visible = true;
  }

  hideGhost(): void {
    if (!this.ghost) return;
    this.scene.remove(this.ghost.group);
    dispose(this.ghost.group, [this.ghost.tint, this.ghost.groundMat]);
    this.ghost = null;
  }
}
