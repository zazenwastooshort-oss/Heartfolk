// Cooking at the fire (chapter 2; systems/cooking.ts), as a placeholder look: while he cooks at the campfire, a fish
// on a stick stuck in the ground at the edge of the fire on his side, a little to his right, leaning over the flames,
// so it shows past him when seen from behind; at the stone hearth (the camp build, 13 Oct 2026), his fish skewered on
// the hearth's spit over the middle of the fire, turning slowly (the spit is set up first of all, with its footings, so
// it is there whenever he cooks there; the hearth's own fish are put aside meanwhile, render/structures.ts). The fish
// goes from raw grey to golden brown as it cooks. Reads state; never changes it.
import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { Layout } from '../world/layout';
import { shapeOf, stepPlace, toGround } from '../world/steps';
import { outermost } from '../core/camp';
import { COOK } from '../data/cooking';

/** The stick: from `from` metres out from the fire's middle (towards him), up to `height` over a point `over` metres
 *  out, just above the tips of the flames, all of it `side` metres to his right, so his body doesn't hide the fish
 *  from a camera behind him (the default camera looks north, and he mostly cooks on the fire's south side); the fish
 *  (`length` long) skewered just below its end, going from `raw` to `done`. On a spit it turns `turn` radians a
 *  second. */
const SPIT = { from: 0.72, over: 0.1, side: 0.4, height: 0.76, stick: '#6f5034', raw: '#9fb1b8', done: '#b8773c', length: 0.28, turn: 1.2 };

export class CookingView {
  private group = new THREE.Group();
  private stick: THREE.Mesh;
  private fish = new THREE.Group();
  private body: THREE.MeshStandardMaterial;
  private raw = new THREE.Color(SPIT.raw); private done = new THREE.Color(SPIT.done);
  private a = new THREE.Vector3(); private b = new THREE.Vector3(); private d = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0); private along = new THREE.Vector3(1, 0, 0);
  private roll = new THREE.Quaternion();

  constructor(scene: THREE.Scene, private layout: Layout) {
    this.stick = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.019, 1, 5), new THREE.MeshStandardMaterial({ color: SPIT.stick, roughness: 1, flatShading: true }));
    this.body = new THREE.MeshStandardMaterial({ color: SPIT.raw, roughness: 0.6, flatShading: true });
    // a plump body along +x, a tail fin behind it
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1).scale(SPIT.length, 0.36 * SPIT.length, 0.2 * SPIT.length), this.body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.09, 4).rotateZ(-Math.PI / 2).scale(1, 1, 0.3).translate(-SPIT.length * 0.55, 0, 0), this.body);
    this.fish.add(body, tail);
    this.stick.castShadow = body.castShadow = true;
    this.group.add(this.stick, this.fish); this.group.visible = false;
    scene.add(this.group);
  }

  /** Where the fish is drawn now (for the tests): its middle, and whether it is on a spit. */
  fishAt(): { pos: THREE.Vector3; onSpit: boolean } | null {
    return this.group.visible ? { pos: this.fish.position.clone(), onSpit: !this.stick.visible } : null;
  }

  update(state: GameState): void {
    const p = state.player, task = p.task, step = outermost(state, 'hearth'), place = step ? stepPlace(this.layout, step) : null;
    this.group.visible = task.kind === 'cook' && !!place;
    if (task.kind !== 'cook' || !place) return;
    const spit = shapeOf(step!)?.spit, fire = place.pos;
    if (spit) {
      // on the spit: across the fire between its posts, turning
      const a = toGround(place, spit.posts[0]), b = toGround(place, spit.posts[1]);
      const dir = this.d.set(b.x - a.x, 0, b.z - a.z).normalize();
      this.stick.visible = false;
      this.fish.position.set((a.x + b.x) / 2, spit.height, (a.z + b.z) / 2);
      this.fish.quaternion.setFromUnitVectors(this.along, dir).multiply(this.roll.setFromAxisAngle(this.along, state.time * SPIT.turn));
    } else {
      // the stick leans from the ground on his side of the fire over the flames, a little to his right (facing the
      // fire, along -toward, his right is (toward.z, -toward.x))
      const toward = this.d.set(p.pos.x - fire.x, 0, p.pos.z - fire.z);
      if (toward.lengthSq() < 1e-6) toward.set(1, 0, 0);
      toward.normalize();
      const sx = toward.z * SPIT.side, sz = -toward.x * SPIT.side;
      const base = this.a.set(fire.x + toward.x * SPIT.from + sx, 0.02, fire.z + toward.z * SPIT.from + sz);
      const end = this.b.set(fire.x + toward.x * SPIT.over + sx, SPIT.height, fire.z + toward.z * SPIT.over + sz);
      const dir = end.clone().sub(base), len = dir.length();
      dir.divideScalar(len);
      this.stick.visible = true;
      this.stick.scale.set(1, len, 1);
      this.stick.position.copy(base).addScaledVector(dir, len / 2);
      this.stick.quaternion.setFromUnitVectors(this.up, dir);
      // the fish along the stick's end
      this.fish.position.copy(end).addScaledVector(dir, -SPIT.length * 0.45);
      this.fish.quaternion.setFromUnitVectors(this.along, dir);
    }
    // browning as it cooks
    const cooked = Math.min(1, Math.max(0, 1 - (task.doneAt - state.time) / COOK.time));
    this.body.color.copy(this.raw).lerp(this.done, cooked);
  }
}
