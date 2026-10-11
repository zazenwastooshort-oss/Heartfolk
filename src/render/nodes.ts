// Rocks and trees, drawn from the layout's nodes and the game state. A rock loses its ore when it runs out and gets
// it back; a tree falls away from the woodcutter, leaving a stump, and grows back. Each strike throws chips (and
// knocks a few leaves off a tree) and shakes the tree. Reads state; never changes it.
import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { Layout, NodeSpot } from '../world/layout';
import { RESOURCES } from '../data/skills';

interface RockView { kind: 'rock'; spot: NodeSpot; ores: THREE.Mesh[]; mats: { m: THREE.MeshStandardMaterial; base: THREE.Color }[] }
interface TreeView {
  kind: 'tree'; spot: NodeSpot; tree: THREE.Object3D; stump: THREE.Object3D | null; yaw: THREE.Quaternion; leaf: THREE.Color;
  felled: boolean;               // whether the view has it down
  fall: number;                  // seconds since it began to fall; -1 once it's gone (or was already down)
  fallAxis: THREE.Vector3;
  grow: number;                  // 0..1 while growing back
  shake: number; shakeAxis: THREE.Vector3;
}
type NodeView = RockView | TreeView;
interface Particle { m: THREE.Mesh; v: THREE.Vector3; life: number; spin: number; leaf: boolean }

const FALL = 0.9, LIE = 0.7, SINK = 0.5;      // seconds: toppling, lying on the ground, shrinking away
const GROW = 1.1;                              // seconds to grow back
const SHAKE = 0.45;
const MAX_PARTICLES = 160;
const GREY = new THREE.Color('#6d6f73');
const UP = new THREE.Vector3(0, 1, 0);

export class NodesView {
  readonly pickables: THREE.Object3D[] = [];
  private views = new Map<string, NodeView>();
  private particles: Particle[] = [];
  private chipGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  private leafGeo = new THREE.BoxGeometry(0.09, 0.012, 0.07);
  private materials = new Map<string, THREE.MeshLambertMaterial>();

  /** rock: the Rock node from miner.glb; models: village.glb's scene, for trees and stumps */
  constructor(private scene: THREE.Scene, layout: Layout, rock: THREE.Object3D, models: THREE.Object3D) {
    const proto = (name: string) => {
      const o = models.getObjectByName(name);
      if (!o) throw new Error(`village.glb has no ${name}`);
      return o;
    };
    const tag = (root: THREE.Object3D, spot: NodeSpot) => root.traverse(o => {
      const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.nodeId = spot.id; this.pickables.push(mesh);
    });
    for (const spot of layout.nodes) {
      const res = RESOURCES[spot.resource]!;
      const turn = (spot.pos.x * 1.7 + spot.pos.z) % (Math.PI * 2);
      if (res.model === 'Rock') {
        const root = rock.clone(true); root.position.set(spot.pos.x, 0, spot.pos.z); root.rotation.y = turn;
        const view: RockView = { kind: 'rock', spot, ores: [], mats: [] };
        const ore = new THREE.Color(res.color);
        root.traverse(o => {
          const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
          const m = (mesh.material as THREE.MeshStandardMaterial).clone(); mesh.material = m;
          if (/^Ore/.test(mesh.name)) { m.color.copy(ore); view.ores.push(mesh); }
          view.mats.push({ m, base: m.color.clone() });
        });
        tag(root, spot); scene.add(root); this.views.set(spot.id, view);
        continue;
      }
      const size = spot.size ?? 1, yaw = new THREE.Quaternion().setFromAxisAngle(UP, turn);
      const tree = proto(res.model).clone(true); tree.position.set(spot.pos.x, 0, spot.pos.z); tree.quaternion.copy(yaw); tree.scale.setScalar(size);
      let leaf = new THREE.Color('#6fae4a');
      tree.traverse(o => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m?.name.includes('leaf')) leaf = m.color.clone(); });
      tag(tree, spot); scene.add(tree);
      let stump: THREE.Object3D | null = null;
      if (res.stump) {
        stump = proto(res.stump).clone(true); stump.position.copy(tree.position); stump.quaternion.copy(yaw); stump.scale.setScalar(size);
        stump.visible = false; tag(stump, spot); scene.add(stump);
      }
      this.views.set(spot.id, { kind: 'tree', spot, tree, stump, yaw, leaf, felled: false, fall: -1, fallAxis: new THREE.Vector3(), grow: 1, shake: 0, shakeAxis: new THREE.Vector3() });
    }
  }

  private material(color: THREE.ColorRepresentation): THREE.MeshLambertMaterial {
    const key = new THREE.Color(color).getHexString();
    let m = this.materials.get(key);
    if (!m) { m = new THREE.MeshLambertMaterial({ color }); this.materials.set(key, m); }
    return m;
  }

  private spawn(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, at: THREE.Vector3, v: THREE.Vector3, life: number, leaf: boolean): void {
    if (this.particles.length >= MAX_PARTICLES) this.scene.remove(this.particles.shift()!.m);
    const m = new THREE.Mesh(geo, this.material(color));
    m.position.copy(at); m.castShadow = !leaf; m.rotation.set(Math.random() * 6, Math.random() * 6, 0); this.scene.add(m);
    this.particles.push({ m, v, life, spin: (Math.random() - 0.5) * 12, leaf });
  }

  /** A tool struck node `id` at `at` (where its tip is). */
  hit(id: string, at: THREE.Vector3): void {
    const view = this.views.get(id); if (!view) return;
    const res = RESOURCES[view.spot.resource]!;
    // away from the striker: from the tool tip towards the node's middle
    const away = new THREE.Vector3(view.spot.pos.x - at.x, 0, view.spot.pos.z - at.z);
    if (away.lengthSq() < 1e-6) away.set(1, 0, 0);
    away.normalize();
    const rnd = (k: number) => (Math.random() - 0.5) * k;
    if (view.kind === 'rock') {
      for (let i = 0; i < 10; i++) {
        this.spawn(this.chipGeo, i % 3 ? '#8d8f94' : res.color, at, new THREE.Vector3(rnd(2.2), 1.6 + Math.random() * 1.6, rnd(2.2)), 0.7 + Math.random() * 0.3, false);
      }
      return;
    }
    // wood chips fly back towards the woodcutter and to the sides
    const dark = new THREE.Color(res.color).multiplyScalar(0.7);
    for (let i = 0; i < 8; i++) {
      const v = away.clone().multiplyScalar(-1.2 - Math.random()).add(new THREE.Vector3(rnd(1.8), 1.2 + Math.random() * 1.4, rnd(1.8)));
      this.spawn(this.chipGeo, i % 2 ? res.color : dark, at, v, 0.7 + Math.random() * 0.3, false);
    }
    const size = view.spot.size ?? 1;
    for (let i = 0; i < 3; i++) {
      const from = new THREE.Vector3(view.spot.pos.x + rnd(1.4) * size, (1.9 + Math.random() * 0.8) * size, view.spot.pos.z + rnd(1.4) * size);
      this.spawn(this.leafGeo, view.leaf, from, new THREE.Vector3(rnd(0.6), -0.2, rnd(0.6)), 2.2 + Math.random(), true);
    }
    view.shake = SHAKE; view.shakeAxis.set(away.z, 0, -away.x);
  }

  /** player: where the character is drawn, so a felled tree falls away from them. */
  update(state: GameState, dt: number, player: THREE.Vector3): void {
    for (const view of this.views.values()) {
      const until = state.nodes[view.spot.id]?.depletedUntil ?? 0;
      if (view.kind === 'rock') this.updateRock(view, until, state.time, dt);
      else this.updateTree(view, until, state.time, dt, player);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i]!; pt.life -= dt;
      if (pt.leaf) {
        // leaves drift down slowly, swaying, and settle on the grass
        pt.v.y = Math.max(pt.v.y - 2 * dt, -0.55);
        pt.m.position.addScaledVector(pt.v, dt); pt.m.position.x += Math.sin(pt.life * 5 + pt.spin) * dt * 0.4;
        if (pt.m.position.y <= 0.02) { pt.m.position.y = 0.02; pt.v.set(0, 0, 0); pt.m.rotation.set(0, pt.m.rotation.y, 0); }
        else { pt.m.rotation.x += pt.spin * dt * 0.3; pt.m.rotation.z += pt.spin * dt * 0.2; }
      } else {
        pt.v.y -= 9 * dt; pt.m.position.addScaledVector(pt.v, dt);
        if (pt.m.position.y < 0.03) { pt.m.position.y = 0.03; pt.v.multiplyScalar(0.4); pt.v.y = Math.abs(pt.v.y) * 0.3; }
        pt.m.rotation.x += pt.spin * dt; pt.m.rotation.y += pt.spin * dt;
      }
      pt.m.scale.setScalar(Math.min(1, pt.life * 3));
      if (pt.life <= 0) { this.scene.remove(pt.m); this.particles.splice(i, 1); }
    }
  }

  private updateRock(view: RockView, until: number, time: number, dt: number): void {
    const left = until ? Math.max(0, until - time) / RESOURCES[view.spot.resource]!.respawn : 0;
    for (const o of view.ores) {
      o.visible = !until;
      if (until) o.scale.setScalar(0.2); else o.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 8));
    }
    for (const { m, base } of view.mats) m.color.copy(base).lerp(GREY, left * 0.6);
  }

  private updateTree(view: TreeView, until: number, time: number, dt: number, player: THREE.Vector3): void {
    const res = RESOURCES[view.spot.resource]!;
    if (until && !view.felled) {
      view.felled = true; view.grow = 1; view.shake = 0;
      if (view.stump) view.stump.visible = true;
      // it fell just now if nearly all its regrowth time is still to come; otherwise (a loaded save, or time caught
      // up in one go) it's simply a stump already
      if (until - time > res.respawn - 1) {
        const dir = new THREE.Vector3(view.spot.pos.x - player.x, 0, view.spot.pos.z - player.z);
        if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
        dir.normalize(); view.fallAxis.set(dir.z, 0, -dir.x); view.fall = 0;
      } else view.fall = -1;
    } else if (!until && view.felled) {
      view.felled = false; view.fall = -1; view.grow = 0;
      if (view.stump) view.stump.visible = false;
    }
    const size = view.spot.size ?? 1;
    let tilt = 0, scale = 1, visible = true;
    if (view.felled) {
      if (view.fall < 0) visible = false;
      else {
        view.fall += dt;
        const t = view.fall;
        tilt = Math.PI / 2 * 0.95 * Math.min(1, (t / FALL) ** 2);          // speeds up as it goes over, like a real tree
        if (t > FALL + LIE) scale = Math.max(0, 1 - (t - FALL - LIE) / SINK);
        if (t > FALL + LIE + SINK) { view.fall = -1; visible = false; }
      }
    } else if (view.grow < 1) {
      view.grow = Math.min(1, view.grow + dt / GROW);
      scale = 0.2 + 0.8 * (1 - (1 - view.grow) ** 3);
    }
    view.tree.visible = visible;
    if (!visible) return;
    let wobble = 0;
    if (view.shake > 0) {
      view.shake = Math.max(0, view.shake - dt);
      const t = SHAKE - view.shake;
      wobble = 0.045 * Math.sin(t * 38) * Math.exp(-t * 7);
    }
    const q = new THREE.Quaternion().setFromAxisAngle(view.fallAxis, tilt)
      .multiply(new THREE.Quaternion().setFromAxisAngle(view.shakeAxis.lengthSq() ? view.shakeAxis : UP, wobble))
      .multiply(view.yaw);
    view.tree.quaternion.copy(q);
    view.tree.scale.setScalar(size * scale);
  }
}
