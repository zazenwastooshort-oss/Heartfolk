// The berry bushes by the camp (chapter 2; data/pickups.ts, kind 'bush'), drawn in code: a round leafy bush of a few
// faceted clumps, dotted with red berries while it is ripe. Picked, it keeps standing and only its berries go; they
// pop back once it is ripe again. It shakes a little while he picks it. While he walks to or waits beside a bare one, a
// cream ring round it fills up as its berries grow back, as for a stone. Each bush has an invisible, finger-sized hit
// area tagged with its id (userData.pickupId), like the other pickups, so a tap picks it (or, bare, sends him to wait
// beside it). Placeholder art, quick to change. Reads state; never changes it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GameState } from '../core/state';
import type { Layout, PickupSpot } from '../world/layout';
import { PICKUPS } from '../data/pickups';

/** The bush: `clumps` leafy lumps (x, y, z, radius in metres), the greens they are drawn in, and `berries` red berries
 *  of radius `berry` on its outside. */
const BUSH = {
  clumps: [[0, 0.36, 0, 0.36], [0.24, 0.26, 0.1, 0.27], [-0.2, 0.25, 0.16, 0.26], [0.02, 0.24, -0.25, 0.27], [-0.1, 0.52, -0.05, 0.22]] as const,
  greens: ['#3f7d34', '#4b8f3c', '#37702e', '#468a38', '#3b7631'], berries: 16, berry: 0.042, reds: ['#cf3346', '#a8263a', '#e04a57'],
};
const HIT_RADIUS = 0.75;          // metres round each bush that a tap counts as on it
const POP = 0.45;                 // seconds for its berries to pop back when it is ripe again
const SHAKE = { amount: 0.05, rate: 17 };
const RING = { inner: 0.7, outer: 0.78, segments: 48, color: 0xf1e8d4 };   // filling up clockwise while he waits

function seeded(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

/** One merged geometry: each part non-indexed, coloured per vertex. */
function merge(parts: { geo: THREE.BufferGeometry; color: string }[]): THREE.BufferGeometry {
  const c = new THREE.Color();
  return mergeGeometries(parts.map(({ geo, color }) => {
    const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position!.count, cs = new Float32Array(n * 3);
    c.set(color);
    for (let i = 0; i < n; i++) cs.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(cs, 3));
    g.deleteAttribute('uv');
    g.computeVertexNormals();
    return g;
  }), false)!;
}

/** A bush's leaves and its berries, a little different for each `seed`. */
function bushModel(seed: number): { leaves: THREE.BufferGeometry; berries: THREE.BufferGeometry } {
  const r = seeded(seed * 7919 + 13), v = new THREE.Vector3();
  const leaves = BUSH.clumps.map(([x, y, z, rad], i) => {
    const g = new THREE.IcosahedronGeometry(rad, 1), pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      const h = Math.sin(v.x * 41.3 + v.y * 17.9 + v.z * 29.1 + seed) * 43758.5453, bump = 0.86 + 0.24 * (h - Math.floor(h));
      pos.setXYZ(k, v.x * bump, v.y * bump * 0.9, v.z * bump);
    }
    g.translate(x, y, z);
    return { geo: g, color: BUSH.greens[(i + seed) % BUSH.greens.length]! };
  });
  // berries on the outside of the clumps, above their middles
  const berries: { geo: THREE.BufferGeometry; color: string }[] = [];
  for (let i = 0; i < BUSH.berries; i++) {
    const [x, y, z, rad] = BUSH.clumps[i % BUSH.clumps.length]!;
    v.set(r() - 0.5, 0.15 + r() * 0.75, r() - 0.5).normalize().multiplyScalar(rad * 0.98);
    berries.push({ geo: new THREE.IcosahedronGeometry(BUSH.berry * (0.85 + r() * 0.3), 0).translate(x + v.x, y + v.y, z + v.z), color: BUSH.reds[i % BUSH.reds.length]! });
  }
  return { leaves: merge(leaves), berries: merge(berries) };
}

interface BushView { spot: PickupSpot; root: THREE.Group; berries: THREE.Mesh; ripe: boolean | null; pop: number }

export class BushesView {
  readonly pickables: THREE.Object3D[] = [];
  private views: BushView[] = [];
  private wait: THREE.Group;
  private fill: THREE.Mesh;

  constructor(scene: THREE.Scene, layout: Layout) {
    const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true });
    const berryMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0, flatShading: true });
    const hitGeo = new THREE.CylinderGeometry(HIT_RADIUS, HIT_RADIUS, 1.1, 10), hitMat = new THREE.MeshBasicMaterial({ visible: false });
    (layout.pickups ?? []).filter(x => PICKUPS[x.kind].plant).forEach((spot, i) => {
      const { leaves, berries } = bushModel(i + 1), root = new THREE.Group();
      root.position.set(spot.pos.x, 0, spot.pos.z); root.rotation.y = spot.rot;
      const leafMesh = new THREE.Mesh(leaves, leafMat), berryMesh = new THREE.Mesh(berries, berryMat);
      leafMesh.castShadow = leafMesh.receiveShadow = true; berryMesh.castShadow = true;
      root.add(leafMesh, berryMesh); scene.add(root);
      const hit = new THREE.Mesh(hitGeo, hitMat); hit.position.set(spot.pos.x, 0.55, spot.pos.z); hit.userData.pickupId = spot.id;
      scene.add(hit); this.pickables.push(hit);
      this.views.push({ spot, root, berries: berryMesh, ripe: null, pop: 1 });
    });
    const ring = new THREE.RingGeometry(RING.inner, RING.outer, RING.segments, 1, -Math.PI / 2).rotateX(Math.PI / 2);
    const ringMat = (opacity: number) => new THREE.MeshBasicMaterial({ color: RING.color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    this.fill = new THREE.Mesh(ring, ringMat(0.75));
    const track = new THREE.Mesh(ring.clone(), ringMat(0.22));
    track.position.y = this.fill.position.y = 0.03;
    this.wait = new THREE.Group(); this.wait.add(track, this.fill); this.wait.visible = false;
    scene.add(this.wait);                                  // not pickable: a tap there goes to the grass
  }

  /** t: seconds. */
  update(state: GameState, t: number, dt: number): void {
    const p = state.player, task = p.task;
    const after = task.kind === 'pickup' ? task.id : p.pending?.kind === 'pickup' ? p.pending.id : null;
    this.wait.visible = false;
    for (const view of this.views) {
      const id = view.spot.id, ripe = !(id in state.taken);
      if (ripe !== view.ripe) {
        if (ripe && view.ripe === false) view.pop = 0;    // ripe again: its berries pop back
        view.berries.visible = ripe; view.ripe = ripe;
      }
      if (view.pop < 1) {
        view.pop = Math.min(1, view.pop + dt / POP);
        const e = 1 + 2.2 * Math.pow(view.pop - 1, 3) + 1.2 * Math.pow(view.pop - 1, 2);    // ease out, a little overshoot
        view.berries.scale.setScalar(Math.max(0.01, e));
      }
      // a little shake while he picks it
      const picking = ripe && task.kind === 'pickup' && task.id === id;
      view.root.rotation.z = picking ? Math.sin(t * SHAKE.rate) * SHAKE.amount : 0;
      // bare, with him on his way to it or waiting beside it: the ring fills up as its berries grow back
      const back = state.taken[id];
      if (after === id && typeof back === 'number') {
        const respawn = PICKUPS[view.spot.kind].respawn ?? 1, near = Math.min(1, Math.max(0, 1 - (back - state.time) / respawn));
        this.wait.position.set(view.spot.pos.x, 0, view.spot.pos.z);
        this.fill.geometry.setDrawRange(0, Math.ceil(near * RING.segments) * 6);
        this.wait.visible = true;
      }
    }
  }
}
