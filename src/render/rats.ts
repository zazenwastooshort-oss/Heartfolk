// The rats round their nests (chapter 2, holding the camp, part 2): the nest (props.ts' ratNestModel) at each of the
// layout's nests, and each rat (creatures.ts' ratModel) where the simulation has it (systems/rats.ts), posed from what
// it is doing: scurrying while it moves, biting on its own bite timer while it fights him (so a bite is seen to land
// when the simulation says it does), knocked over once beaten and gone a moment later, until it comes back at its nest,
// where it pops up. Each rat that is up has an invisible, finger-sized tap area tagged userData.fightId (its id) for
// the input, which goes with it. Reads state; never changes it.
import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { Layout } from '../world/layout';
import { ratsOf } from '../core/rats';
import { POTTER, RAT } from '../data/rats';
import { ratModel, type RatModel, type RatPose } from './creatures';
import { ratNestModel } from './props';

/** How long a beaten rat lies knocked over before it goes (seconds), how long it takes to go and to pop back up at its
 *  nest, how quickly a drawn rat catches up with where the simulation has it, and its tap area (metres). */
const LOOK = { downFor: 2.6, fade: 0.4, pop: 0.35, follow: 14, tap: { radius: 0.45, height: 0.6 } };

const smooth = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };

interface RatView { id: string; model: RatModel; hit: THREE.Mesh; pos: THREE.Vector3; heading: number; up: boolean | null; pop: number }

export class RatsView {
  readonly pickables: THREE.Object3D[] = [];
  private rats: RatView[] = [];
  private at = new THREE.Vector3();

  constructor(scene: THREE.Scene, layout: Layout) {
    (layout.nests ?? []).forEach((nest, i) => {
      const model = ratNestModel(7 + i);
      model.position.set(nest.pos.x, 0, nest.pos.z); model.rotation.y = nest.rot;
      scene.add(model);
    });
    const tap = new THREE.CylinderGeometry(LOOK.tap.radius, LOOK.tap.radius, LOOK.tap.height, 10), unseen = new THREE.MeshBasicMaterial({ visible: false });
    ratsOf(layout).forEach((spot, i) => {
      const model = ratModel(i + 1);
      model.group.visible = false;
      scene.add(model.group);
      const hit = new THREE.Mesh(tap, unseen); hit.userData.fightId = spot.id; hit.visible = false;
      scene.add(hit); this.pickables.push(hit);
      this.rats.push({ id: spot.id, model, hit, pos: new THREE.Vector3(spot.home.x, 0, spot.home.z), heading: 0, up: null, pop: 1 });
    });
  }

  /** Where rat `id` is drawn, or null while it isn't (gone after it was beaten). */
  posOf(id: string): THREE.Vector3 | null {
    const v = this.rats.find(r => r.id === id);
    return v && v.model.group.visible ? v.pos.clone() : null;
  }

  /** t: seconds on a steady clock; dt: seconds since the last frame. */
  update(state: GameState, t: number, dt: number): void {
    for (const v of this.rats) {
      const r = state.rats[v.id], g = v.model.group;
      if (!r) { g.visible = v.hit.visible = false; continue; }
      const up = r.downUntil === null;
      if (up && v.up !== true) {
        // the first frame, or it came back at the nest: straight there, popping up if it was gone
        v.pos.set(r.pos.x, 0, r.pos.z); v.heading = r.heading; v.pop = v.up === false ? 0 : 1;
      }
      v.up = up;
      let pose: RatPose, scale: number;
      if (up) {
        v.pos.lerp(this.at.set(r.pos.x, 0, r.pos.z), Math.min(1, dt * LOOK.follow));
        const turn = ((r.heading - v.heading + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        v.heading += turn * Math.min(1, dt * LOOK.follow);
        pose = r.to ? 'scurry' : r.bite !== null ? 'bite' : 'idle';
        v.pop = Math.min(1, v.pop + dt / LOOK.pop);
        scale = 0.3 + 0.7 * smooth(v.pop);
      } else {
        // knocked over where it was beaten, then it goes
        const since = state.time - (r.downUntil! - RAT.back);
        pose = 'down';
        scale = since < LOOK.downFor ? 1 : 1 - smooth((since - LOOK.downFor) / LOOK.fade);
      }
      g.visible = scale > 0.01;
      v.hit.visible = up;
      v.hit.position.set(v.pos.x, LOOK.tap.height / 2, v.pos.z);
      if (!g.visible) continue;
      g.position.copy(v.pos); g.rotation.y = v.heading; g.scale.setScalar(scale);
      v.model.update(pose, t, dt, POTTER.speed, pose === 'bite' ? r.bite! : undefined);
    }
  }
}
