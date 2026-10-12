// The goblin camp (chapter 2, its last part): its palisade round the layout's goblin camp (props.ts' palisadeModel, the
// stretches set out by world/goblincamp.ts), the way in a gap, the gate on the way on down the river, shut until the
// camp is cleared and then swinging open; the chief's ragged hide tent (hideTentModel), a totem by the way in, a cold
// fire ring (village.glb's CampfireCold), trodden earth inside and a faint track out of the gate. The goblins
// (creatures.ts' goblinModel, from a load of miner.glb of their own, shared by them all) stand where the simulation has
// them (systems/goblins.ts), posed from what each is doing: walking while it moves, swinging its club on its own swing
// timer while it fights him (so a blow is seen to land when the simulation says it does), knocked over once beaten and
// gone a moment later, until it pops up again in the camp. The chief is bigger, his tunic dyed red, a feather on his
// head; he is unseen in his tent until he comes out of its door. When the camp is cleared the chief topples and the
// goblins still up run off out of the gate. Each one up has an invisible tap area tagged userData.fightId (its id) for
// the input. Reads state; never changes it.
import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { GoblinCampSpot, Layout } from '../world/layout';
import { gateOf, palisadeOf } from '../world/goblincamp';
import { goblinsOf } from '../core/goblins';
import { GOBLIN as GOBLIN_DATA, MILL } from '../data/goblins';
import { goblinModel, GOBLIN, type GoblinModel, type GoblinPose } from './creatures';
import { hideTentModel, palisadeModel, totemModel } from './props';
import { flat } from './parts';

/** How long a beaten goblin lies knocked over before it goes (seconds), how long it takes to go and to pop up again,
 *  how quickly a drawn goblin catches up with where the simulation has it, its tap area (metres); the chief's size
 *  next to a goblin's and his colours; the goblin tent's size next to the shelter's; how far the gate swings open
 *  (radians) and how long it takes; how long goblins run off for once the camp is cleared, and how fast. */
const LOOK = {
  downFor: 2.6, fade: 0.45, pop: 0.4, follow: 12, tap: { radius: 0.5, height: 1.5 },
  chief: { size: 1.16, tunic: '#8c3b2b', tunicDark: '#6a2c22', skin: '#7a9640', feather: '#c8462f', quill: '#efe6cf' },
  tent: 0.9, gate: { open: 1.75, time: 1.4 }, flee: { time: 1.6, speed: 2.6 },
  ground: { earth: 0.6, track: 7 },
};

const smooth = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };

interface GoblinView {
  id: string; chief: boolean; model: GoblinModel; hit: THREE.Mesh; pos: THREE.Vector3; heading: number;
  /** whether it was up last frame (null before the first) */
  up: boolean | null; pop: number;
  /** once the camp is cleared: since when (the view's clock) it runs off or falls, and which */
  leaving: { since: number; fall: boolean } | null;
  /** the chief going back into his tent: since when (the view's clock) he shrinks away */
  goingIn: number | null;
}

/** Trodden earth as a texture: a cloud of brown flecks, thick in the middle and thinning out to nothing at the edge
 *  (along a track, `long` times as long as it is wide, thinning towards its far end). */
function earth(long = 1): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 256; c.height = Math.round(256 * long);
  const g = c.getContext('2d')!;
  let s = 7;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 9000 * long; i++) {
    const x = r(), z = r(), d = long > 1 ? Math.max(Math.abs(x - 0.5) * 2, z) : Math.hypot(x - 0.5, z - 0.5) * 2;
    if (d > 1) continue;
    g.fillStyle = `rgba(${140 + r() * 40 | 0},${108 + r() * 30 | 0},${72 + r() * 22 | 0},${(0.75 * (1 - d * d)).toFixed(2)})`;
    g.fillRect(x * c.width, z * c.height, 3 + r() * 3, 2 + r() * 3);
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A patch of ground drawn flat just over the grass. */
function decal(tex: THREE.Texture, w: number, d: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.rotation.x = -Math.PI / 2; m.receiveShadow = true; m.renderOrder = 1;
  return m;
}

/** The chief: a goblin bigger than the others, his tunic dyed red, his skin a darker green, a feather on his head. */
function chiefModel(miner: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }): GoblinModel {
  const model = goblinModel(miner), C = LOOK.chief;
  model.group.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial, colour = ({ tunic: C.tunic, tunic_dark: C.tunicDark } as Record<string, string>)[mat.name];
    if (colour) mat.color.set(colour);
  });
  const face = model.group.getObjectByName('face') as THREE.Mesh | undefined;
  (face?.material as THREE.MeshStandardMaterial | undefined)?.color.set(C.skin);
  const head = model.group.getObjectByName('head');
  if (head) {
    const feather = new THREE.Group();
    const vane = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.46, 5).scale(1, 1, 0.6), flat(C.feather));
    vane.position.y = 0.25; feather.add(vane);
    const quill = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 4), flat(C.quill));
    quill.position.y = 0.03; feather.add(quill);
    feather.position.set(-0.06, 0.12, 0.06); feather.rotation.set(0.2, 0, 0.45);
    feather.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    head.add(feather);
  }
  return model;
}

export class GoblinsView {
  readonly pickables: THREE.Object3D[] = [];
  private goblins: GoblinView[] = [];
  private gate: THREE.Object3D | null = null;
  private opened: number | null = null;          // how far the gate is open (0..1); null before the first frame
  private clock = 0;
  private at = new THREE.Vector3();

  /** `village`: village.glb's scene (the tent and the fire ring are from it); `miner`: miner.glb loaded for the goblins
   *  alone (goblinModel), or null to draw the camp without them. */
  constructor(scene: THREE.Scene, private layout: Layout, village: THREE.Object3D, miner: { scene: THREE.Object3D; animations: THREE.AnimationClip[] } | null) {
    const camp = layout.goblinCamp;
    if (!camp) return;
    this.buildCamp(scene, camp, village);
    if (!miner) return;
    const tap = new THREE.CylinderGeometry(LOOK.tap.radius, LOOK.tap.radius, LOOK.tap.height, 10), unseen = new THREE.MeshBasicMaterial({ visible: false });
    for (const spot of goblinsOf(layout)) {
      const model = spot.chief ? chiefModel(miner) : goblinModel(miner);
      model.group.visible = false;
      scene.add(model.group);
      const hit = new THREE.Mesh(tap, unseen); hit.userData.fightId = spot.id; hit.visible = false;
      scene.add(hit); this.pickables.push(hit);
      this.goblins.push({ id: spot.id, chief: spot.chief, model, hit, pos: new THREE.Vector3(spot.home.x, 0, spot.home.z), heading: 0, up: null, pop: 1, leaving: null, goingIn: null });
    }
  }

  /** The palisade with its gate, the tent, the totem, the cold fire ring and the trodden earth. */
  private buildCamp(scene: THREE.Scene, camp: GoblinCampSpot, village: THREE.Object3D): void {
    const walls = new THREE.Group();
    palisadeOf(camp).forEach((s, i) => {
      if (s.kind !== 'wall') return;
      const stretch = palisadeModel(s.length, 3 + i);
      stretch.position.set(s.pos.x, 0, s.pos.z); stretch.rotation.y = s.rot;
      walls.add(stretch);
    });
    scene.add(walls);
    // the gate: a stretch of stakes hung from its left-hand end (seen from inside), swinging out
    const g = gateOf(camp), leaf = palisadeModel(g.length - 0.06, 21), pivot = new THREE.Group();
    leaf.position.x = g.length / 2;
    pivot.add(leaf);
    pivot.position.set(g.pos.x - Math.cos(g.rot) * g.length / 2, 0, g.pos.z + Math.sin(g.rot) * g.length / 2);
    pivot.rotation.y = g.rot;
    scene.add(pivot);
    this.gate = pivot;
    // the chief's tent, its door facing the middle; the totem facing out of the way in; the cold fire ring
    const tent = hideTentModel(village);
    tent.scale.setScalar(LOOK.tent); tent.position.set(camp.tent.pos.x, 0, camp.tent.pos.z); tent.rotation.y = camp.tent.rot;
    scene.add(tent);
    const totem = totemModel();
    totem.position.set(camp.totem.x, 0, camp.totem.z); totem.rotation.y = camp.way;
    scene.add(totem);
    const ring = village.getObjectByName('CampfireCold');
    if (ring) {
      const fire = ring.clone(true);
      fire.position.set(camp.fire.pos.x, 0, camp.fire.pos.z); fire.scale.setScalar(camp.fire.radius / 0.6);
      fire.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(fire);
    }
    // trodden earth inside, and a faint track out of the gate, the way on down the river
    const inside = decal(earth(), (camp.radius + LOOK.ground.earth) * 2, (camp.radius + LOOK.ground.earth) * 2);
    inside.position.set(camp.pos.x, 0.012, camp.pos.z);
    scene.add(inside);
    const track = decal(earth(2.5), 1.6, LOOK.ground.track);
    track.rotation.z = g.rot;
    track.position.set(g.pos.x + Math.sin(g.rot) * LOOK.ground.track / 2, 0.013, g.pos.z + Math.cos(g.rot) * LOOK.ground.track / 2);
    scene.add(track);
  }

  /** Where goblin `id` is drawn, or null while it isn't. */
  posOf(id: string): THREE.Vector3 | null {
    const v = this.goblins.find(g => g.id === id);
    return v && v.model.group.visible ? v.pos.clone() : null;
  }

  /** t: seconds on a steady clock; dt: seconds since the last frame. */
  update(state: GameState, t: number, dt: number): void {
    const camp = this.layout.goblinCamp;
    if (!camp) return;
    this.clock += dt;
    const cleared = state.goblinCamp.cleared;
    // the gate: shut, then swinging open once the camp is cleared (open at once in a game loaded that way)
    const open = this.opened === null ? (cleared ? 1 : 0) : Math.min(1, this.opened + (cleared ? dt / LOOK.gate.time : 0));
    this.opened = cleared ? open : 0;
    if (this.gate) this.gate.rotation.y = gateOf(camp).rot - smooth(this.opened) * LOOK.gate.open;
    for (const v of this.goblins) {
      const g = state.goblins[v.id], group = v.model.group, size = v.chief ? LOOK.chief.size : 1;
      const up = !!g && g.downUntil === null && (!v.chief || state.goblinCamp.chiefOut);
      // the camp cleared while it was there: the chief topples, the others run off out of the gate (one lying knocked
      // over goes at once)
      if (cleared && !v.leaving && v.model.group.visible) v.leaving = v.up ? { since: this.clock, fall: v.chief } : { since: this.clock - LOOK.downFor, fall: true };
      if (v.leaving || (cleared && v.up === null)) { this.leave(v, camp, t, dt, size); continue; }
      if (!g) { group.visible = v.hit.visible = false; v.up = false; continue; }
      if (up && v.up !== true) {
        // the first frame, back again in the camp, or the chief out of his tent: straight there, popping up if it was gone
        v.pos.set(g.pos.x, 0, g.pos.z); v.heading = g.heading; v.pop = v.up === false ? 0 : 1;
      }
      const wasUp = v.up;
      v.up = up;
      let pose: GoblinPose, scale: number;
      if (up) {
        v.pos.lerp(this.at.set(g.pos.x, 0, g.pos.z), Math.min(1, dt * LOOK.follow));
        const turn = ((g.heading - v.heading + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        v.heading += turn * Math.min(1, dt * LOOK.follow);
        pose = g.to ? 'walk' : g.swing !== null ? 'attack' : 'idle';
        v.pop = Math.min(1, v.pop + dt / LOOK.pop);
        scale = 0.3 + 0.7 * smooth(v.pop);
      } else if (g.downUntil !== null) {
        // knocked over where it was beaten, then it goes
        const since = state.time - (g.downUntil - GOBLIN_DATA.back);
        pose = 'down';
        scale = wasUp === null && since > LOOK.downFor ? 0 : since < LOOK.downFor ? 1 : 1 - smooth((since - LOOK.downFor) / LOOK.fade);
      } else {
        // the chief, in his tent: going back in (he knocked the player out), he shrinks away where he stood
        if (wasUp) v.goingIn = this.clock;
        pose = 'idle';
        scale = v.goingIn === null ? 0 : 1 - smooth((this.clock - v.goingIn) / LOOK.fade);
        if (scale <= 0.01) v.goingIn = null;
      }
      group.visible = scale > 0.01;
      v.hit.visible = up;
      v.hit.position.set(v.pos.x, LOOK.tap.height / 2, v.pos.z);
      if (!group.visible) continue;
      group.position.copy(v.pos); group.rotation.y = v.heading; group.scale.setScalar(scale * size);
      v.model.update(pose, t, dt, MILL.speed, pose === 'attack' ? g.swing! : undefined);
    }
  }

  /** Once the camp is cleared: the chief lies knocked over a moment, then goes; a goblin runs off out of the gate,
   *  shrinking away as it goes; then neither is drawn again. A game loaded with the camp cleared draws none. */
  private leave(v: GoblinView, camp: GoblinCampSpot, t: number, dt: number, size: number): void {
    v.hit.visible = false; v.up = false;
    const group = v.model.group;
    if (!v.leaving) { group.visible = false; return; }
    const since = this.clock - v.leaving.since;
    let scale: number;
    if (v.leaving.fall) scale = since < LOOK.downFor ? 1 : 1 - smooth((since - LOOK.downFor) / LOOK.fade);
    else {
      const gate = gateOf(camp).pos, out = { x: gate.x + (gate.x - camp.pos.x) * 0.6, z: gate.z + (gate.z - camp.pos.z) * 0.6 };
      const dx = out.x - v.pos.x, dz = out.z - v.pos.z, d = Math.hypot(dx, dz), step = Math.min(d, LOOK.flee.speed * dt);
      if (d > 1e-3) { v.pos.x += dx / d * step; v.pos.z += dz / d * step; v.heading = Math.atan2(-dz, dx); }
      scale = 1 - smooth((since - (LOOK.flee.time - LOOK.fade)) / LOOK.fade);
    }
    group.visible = scale > 0.01;
    if (!group.visible) return;
    group.position.copy(v.pos); group.rotation.y = v.heading; group.scale.setScalar(scale * size);
    v.model.update(v.leaving.fall ? 'down' : 'walk', t, dt, LOOK.flee.speed);
  }
}
