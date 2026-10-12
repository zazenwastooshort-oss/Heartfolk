// Things lying on the ground to pick up (layout.pickups, data/pickups.ts), placed from the layout with the models in
// assets/models/village.glb, each model merged into one mesh coloured per vertex so a phone draws each pickup in one
// call. Taken ones are hidden; a stone or branch that lies there again pops back. Each has an
// invisible, finger-sized hit area tagged with its id (userData.pickupId) for the input to find, and a soft glint
// twinkles over it now and then so it can be spotted on a phone. While he walks to, or waits beside, a stone or branch
// that isn't back yet, a faint one stands at its spot inside a cream ring that fills up as it comes back, so he plainly
// waits for something (like at a stump) rather than standing about on bare grass. Reads state; never changes it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GameState } from '../core/state';
import type { Layout, PickupSpot } from '../world/layout';
import { PICKUPS } from '../data/pickups';
import { codeModel } from './materials';

function seeded(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

const HIT_RADIUS = 0.6;           // metres round each pickup that a tap counts as on it
const POP = 0.4;                  // seconds to pop back up when one lies there again
const GLINT_EVERY = 2.8;          // seconds between one pickup's glints...
const GLINT_FOR = 0.55;           // ...each lasting this long
const GHOST = [0.2, 0.55];        // how see-through the one he waits for is: just taken .. about to lie there again
const RING = { inner: 0.36, outer: 0.44, segments: 48, color: 0xf1e8d4 };   // the ring round it, filling up clockwise

interface PickupView { spot: PickupSpot; root: THREE.Mesh; hit: THREE.Mesh; top: number; shown: boolean | null; pop: number; phase: number }

/** One geometry for a whole model, its parts placed and each coloured with its material's colour. */
function flatten(proto: THREE.Object3D): THREE.BufferGeometry {
  proto.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [], toRoot = proto.matrixWorld.clone().invert();
  proto.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    let g = mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld));
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    const c = (mesh.material as THREE.MeshStandardMaterial).color, n = g.attributes.position!.count, cs = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) cs.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(cs, 3));
    parts.push(g);
  });
  return mergeGeometries(parts, false)!;
}

/** A four-pointed sparkle with a soft glow, for additive blending. */
function sparkle(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, glow = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  glow.addColorStop(0, 'rgba(255,250,220,0.9)'); glow.addColorStop(0.25, 'rgba(255,240,190,0.35)'); glow.addColorStop(1, 'rgba(255,240,190,0)');
  g.fillStyle = glow; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,240,0.95)';
  for (const [w, h] of [[3, 30], [30, 3]]) { g.beginPath(); g.ellipse(32, 32, w!, h!, 0, 0, Math.PI * 2); g.fill(); }
  return new THREE.CanvasTexture(c);
}

export class PickupsView {
  readonly pickables: THREE.Object3D[] = [];
  private views: PickupView[] = [];
  private glints: THREE.InstancedMesh;
  // the stone or branch he walks to or waits beside while it isn't back yet: a faint one and a ring that fills up
  private wait = new THREE.Group();
  private ghost = new THREE.Mesh(undefined, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.85, metalness: 0, transparent: true, opacity: GHOST[0], depthWrite: false }));
  private fill: THREE.Mesh;
  private m = new THREE.Matrix4(); private v = new THREE.Vector3(); private sc = new THREE.Vector3(); private c = new THREE.Color();

  constructor(scene: THREE.Scene, layout: Layout, models: THREE.Object3D) {
    const r = seeded(17), hitGeo = new THREE.CylinderGeometry(HIT_RADIUS, HIT_RADIUS, 0.7, 10);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false }), box = new THREE.Box3();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
    const shapes = new Map<string, THREE.BufferGeometry>();
    for (const spot of layout.pickups ?? []) {
      if (PICKUPS[spot.kind].plant) continue;          // the berry bushes are render/bushes.ts's (chapter 2)
      const name = PICKUPS[spot.kind].model;
      let geo = shapes.get(name);
      if (!geo) {
        const proto = models.getObjectByName(name) ?? codeModel(name);      // (the reeds and the clay: drawn in code)
        if (!proto) throw new Error(`village.glb has no ${name}`);
        geo = flatten(proto); shapes.set(name, geo);
      }
      const root = new THREE.Mesh(geo, material); root.position.set(spot.pos.x, 0, spot.pos.z); root.rotation.y = spot.rot;
      root.castShadow = true; root.receiveShadow = true; root.userData.pickupId = spot.id; this.pickables.push(root);
      scene.add(root);
      const hit = new THREE.Mesh(hitGeo, hitMat); hit.position.set(spot.pos.x, 0.35, spot.pos.z); hit.userData.pickupId = spot.id;
      scene.add(hit); this.pickables.push(hit);
      root.updateMatrixWorld(true);
      this.views.push({ spot, root, hit, top: box.setFromObject(root).max.y, shown: null, pop: 1, phase: r() * GLINT_EVERY });
    }
    this.glints = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: sparkle(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), Math.max(1, this.views.length));
    this.glints.frustumCulled = false; this.glints.renderOrder = 5; this.glints.count = 0;
    this.glints.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, this.views.length) * 3), 3);
    scene.add(this.glints);
    const ring = new THREE.RingGeometry(RING.inner, RING.outer, RING.segments, 1, -Math.PI / 2).rotateX(Math.PI / 2);
    const ringMat = (opacity: number) => new THREE.MeshBasicMaterial({ color: RING.color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    this.fill = new THREE.Mesh(ring, ringMat(0.75));
    const track = new THREE.Mesh(ring.clone(), ringMat(0.22));
    track.position.y = this.fill.position.y = 0.03;
    this.wait.add(this.ghost, track, this.fill); this.wait.visible = false;
    scene.add(this.wait);                                  // not pickable: a tap there goes to the grass
  }

  /** The stone or branch he walks to or waits beside while it isn't back yet: a faint one at its spot, fading in, and
   *  the ring round it filling up, as it comes back. */
  private updateWaiting(state: GameState): void {
    const p = state.player, id = p.task.kind === 'pickup' ? p.task.id : p.pending?.kind === 'pickup' ? p.pending.id : null;
    const back = id ? state.taken[id] : undefined, view = this.views.find(v => v.spot.id === id);
    this.wait.visible = typeof back === 'number' && !!view;
    if (typeof back !== 'number' || !view) return;
    const respawn = PICKUPS[view.spot.kind].respawn ?? 1, near = Math.min(1, Math.max(0, 1 - (back - state.time) / respawn));
    this.wait.position.copy(view.root.position);
    this.ghost.geometry = view.root.geometry; this.ghost.rotation.y = view.spot.rot;
    this.ghost.material.opacity = GHOST[0]! + (GHOST[1]! - GHOST[0]!) * near;
    this.fill.geometry.setDrawRange(0, Math.ceil(near * RING.segments) * 6);
  }

  /** t: seconds; night: 0 by day .. 1 at night (the glint shows more in the dark). */
  update(state: GameState, t: number, dt: number, camera: THREE.Camera, night: number): void {
    this.updateWaiting(state);
    let k = 0;
    for (const view of this.views) {
      const there = !(view.spot.id in state.taken);
      if (there !== view.shown) {
        if (there && view.shown === false) view.pop = 0;          // a stone or branch lies there again
        view.root.visible = view.hit.visible = there; view.shown = there;
      }
      if (!there) continue;
      if (view.pop < 1) {
        view.pop = Math.min(1, view.pop + dt / POP);
        const e = 1 + 2.2 * Math.pow(view.pop - 1, 3) + 1.2 * Math.pow(view.pop - 1, 2);    // ease out with a little overshoot
        view.root.scale.setScalar(Math.max(0.01, e));
      }
      const g = ((t + view.phase) % GLINT_EVERY) / GLINT_FOR;
      if (g >= 1) continue;
      const s = Math.sin(Math.PI * g) * 0.42;
      this.v.set(view.spot.pos.x, view.top + 0.12, view.spot.pos.z); this.sc.set(s, s, 1);
      this.m.compose(this.v, camera.quaternion, this.sc); this.glints.setMatrixAt(k, this.m);
      this.glints.setColorAt(k, this.c.setScalar(0.75 + night * 0.5));
      k++;
    }
    this.glints.count = k;
    this.glints.instanceMatrix.needsUpdate = true;
    if (this.glints.instanceColor) this.glints.instanceColor.needsUpdate = true;
  }
}
