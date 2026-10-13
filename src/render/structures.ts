// The camp's buildings, drawn at their spots (the camp build, 13 Oct 2026; render/campmodels.ts has the models): each
// spot (data/building.ts LINES: the fire, the tent, the firewood pile, the training dummy) shows the steps built or
// begun there, each at the stage it has reached (footings, frame, half built, built; core/building.ts stageOf), every
// stage's model made the first time it is needed and kept; a new step is drawn round the one before it, which stands
// inside its footings and frame until it is half built (D6: stepShown), the old step's guy ropes or pegs gone once the
// new one is begun. Nothing shows at a spot until its goal comes up (the owner, 13 Oct 2026: "not visible until you put
// it down to build"); then its marker (D1: stakes, a string and a cloth flag, glinting now and then) shows where it
// goes until it is begun. While something is under way a ring round it (as far as it reaches) fills up as it goes up,
// brighter while he works at it. The storage chest is furniture in the shelter (core/camp.ts chestPlace: just inside
// the tent's open front, on the wall tent's and the log cabin's porches), drawn there stage by stage on the shelter's
// floor, its marker a square chalked where it will stand. The fire's flames, its warm light and its smoke belong to the
// spot, the campfire's and then the stone hearth's: they flare up while he stokes it and burn low on a night there were
// no logs (FIRE_LOOK in data/fire.ts). The firewood pile and the woodshed show as many logs as the pile holds; the
// hearth's own fish on its spit are put aside while his cook there (render/cooking.ts); the training dummy wobbles when
// struck. Each spot has one invisible tap area round what shows there, growing with each step (core/camp.ts tapBoxOf),
// tagged with its spot and what is drawn there for ui/input.ts (a tap on what is drawn there is on it, even behind
// another spot's tap area): what a tap there does and its menu are core/camp.ts's (campTap, campActions). Made once
// village.glb is loaded (the campfire and the tent are its models). Reads state; never changes it.
import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { Layout, Vec2 } from '../world/layout';
import { reachOf, shapeOf, stepPlace } from '../world/steps';
import { LINES, MARKER, type LineId } from '../data/building';
import type { MakeId } from '../data/making';
import { FIRE_LOOK } from '../data/fire';
import { markerShown, progressOf, stageOf, stepShown } from '../core/building';
import { chestPlace, tapBoxOf } from '../core/camp';
import { markerModel, stageParts, type Protos } from './campmodels';
import { canvasTexture, counted, mergeByMaterial, sparkleTexture, type Counted } from './parts';

const RING = { width: 0.08, gap: 0.12, segments: 48, color: 0xf1e8d4 };   // the ring round something under way
const POP = 0.45;                  // seconds a new stage takes to settle in
const SMOKE = { puffs: 7, life: 3.6, rise: 2.4, drift: 0.5 };            // the fire's smoke
const GLINT_FOR = 0.55;            // how long a marker's glint lasts

/** One stage of a step, made: its parts merged, and what the view shows and hides on its own. */
interface StageView { root: THREE.Group; guys: THREE.Object3D | null; logs: Counted | null; fish: THREE.Object3D | null; sway: THREE.Object3D | null }
/** A step at its place: its stages as they are made, the stage shown (-1 none), settling in. */
interface StepView { id: MakeId; root: THREE.Group; stages: (StageView | undefined)[]; stage: number; pop: number }
/** The ring round what is under way at a spot, one ring per step (each as far round as it reaches). */
interface RingView { group: THREE.Group; fill: THREE.Mesh; inner: number }
/** A marker (or the chest's chalk square), and where its glint shows (in its own frame). */
interface MarkerView { root: THREE.Group; glint: THREE.Sprite }
interface SpotView { line: LineId; steps: StepView[]; marker: MarkerView | null; rings: Map<MakeId, RingView>; tap: THREE.Mesh; phase: number }
/** A wobble after a strike (the training dummy): seconds since, how far it leans at most (radians), and which way, in
 *  the model's own frame (the top leans along x and z). */
interface Wobble { t: number; amp: number; x: number; z: number }
interface Puff { sprite: THREE.Sprite; age: number }

/** A soft round puff, for the smoke. */
const puffTexture = () => canvasTexture(64, g => {
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 31);
  grad.addColorStop(0, 'rgba(235,235,230,0.9)'); grad.addColorStop(0.5, 'rgba(225,225,220,0.45)'); grad.addColorStop(1, 'rgba(220,220,215,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
});

/** How the training dummy wobbles when struck: the most it leans (radians) for a hit that did damage and for a miss,
 *  how quickly it sways back and forth (a second), how fast it settles, and when it is still again (seconds). */
const WOBBLE = { hit: 0.11, miss: 0.05, rate: 2.2, decay: 3.2, last: 1.6 };

export class CampView {
  readonly pickables: THREE.Object3D[] = [];
  private spots: SpotView[] = [];
  private chest: StepView | null = null;
  private chestMarker: MarkerView | null = null;
  private chestRings = new Map<MakeId, RingView>();
  private chestAt = '';
  private ringMats = { track: this.ringMat(0.3), fill: this.ringMat(0.85) };
  private glintMat: THREE.SpriteMaterial;
  private fire: { pos: Vec2; flames: THREE.Group; parts: THREE.Object3D[]; light: THREE.PointLight; smoke: Puff[] } | null = null;
  private wobble: Wobble | null = null;
  private flare = 0; private low = 0;

  private protos: Protos;

  constructor(private scene: THREE.Scene, private layout: Layout, models: THREE.Object3D) {
    const protos: Protos = name => {
      const o = models.getObjectByName(name);
      if (!o) throw new Error(`village.glb has no ${name}`);
      return o;
    };
    this.protos = protos;
    this.glintMat = new THREE.SpriteMaterial({ map: sparkleTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    for (const line of Object.keys(LINES) as LineId[]) {
      const steps = LINES[line].map(id => this.stepView(id)).filter((v): v is StepView => !!v);
      if (!steps.length) continue;
      const first = LINES[line][0]!, place = stepPlace(layout, first), shape = shapeOf(first);
      const marker = place && shape ? this.markerView(markerModel(shape), place.pos, place.rot) : null;
      const tap = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 16), new THREE.MeshBasicMaterial({ visible: false }));
      // its spot, and what is drawn there (ui/input.ts: a tap on what is drawn is on it, even where another spot's
      // bigger tap area is in front of it)
      tap.visible = false; tap.userData.campSpot = line; tap.userData.drawn = [...steps.map(v => v.root), ...(marker ? [marker.root] : [])];
      scene.add(tap); this.pickables.push(tap);
      this.spots.push({ line, steps, marker, rings: new Map(), tap, phase: this.spots.length * 0.9 });
    }
    // the storage chest, in the shelter (moved to where it stands each frame)
    if (this.spots.some(s => s.line === 'tent') && shapeOf('chest')) {
      const root = new THREE.Group(); scene.add(root);
      this.chest = { id: 'chest', root, stages: [], stage: -1, pop: 1 };
      this.chestMarker = this.markerView(markerModel(shapeOf('chest')!, true), { x: 0, z: 0 }, 0);
      (this.spots.find(s => s.line === 'tent')!.tap.userData.drawn as THREE.Object3D[]).push(root, this.chestMarker.root);
    }
    // the fire's flames (the village hearth's, smaller and glowing), light (always in the scene, dark until it is lit,
    // so lighting it costs no shader rebuild) and smoke, the campfire's and then the stone hearth's
    const fireAt = stepPlace(layout, 'campfire');
    if (fireAt) {
      const flames = new THREE.Group(), parts: THREE.Object3D[] = [], hearth = protos('Hearth');
      flames.scale.setScalar(0.6); flames.position.set(fireAt.pos.x, 0, fireAt.pos.z); flames.visible = false;
      for (const name of ['Flame', 'FlameCore']) {
        const src = hearth.getObjectByName(name) as THREE.Mesh | undefined;
        if (!src?.isMesh) continue;
        const flame = src.clone(), m = (src.material as THREE.MeshStandardMaterial).clone();
        m.emissive.copy(m.color); m.emissiveIntensity = 1.6; m.toneMapped = false; flame.material = m;
        flame.position.set(0, 0, 0); flame.castShadow = false;
        flames.add(flame); parts.push(flame);
      }
      const light = new THREE.PointLight('#ff9a40', 0, 8, 1.6); light.position.set(fireAt.pos.x, 0.9, fireAt.pos.z);
      const puffs = puffTexture(), smoke: Puff[] = [];
      for (let i = 0; i < SMOKE.puffs; i++) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffs, transparent: true, depthWrite: false, opacity: 0 }));
        sprite.visible = false; scene.add(sprite);
        smoke.push({ sprite, age: i / SMOKE.puffs * SMOKE.life });
      }
      scene.add(flames, light);
      this.fire = { pos: fireAt.pos, flames, parts, light, smoke };
    }
  }

  private ringMat(opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color: RING.color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  }

  /** A step at its place in this layout (none where it has none). */
  private stepView(id: MakeId): StepView | null {
    const place = stepPlace(this.layout, id);
    if (!place || !shapeOf(id)) return null;
    const root = new THREE.Group(); root.position.set(place.pos.x, 0, place.pos.z); root.rotation.y = place.rot;
    this.scene.add(root);
    return { id, root, stages: [], stage: -1, pop: 1 };
  }

  /** A marker's parts merged, placed, hidden until it shows, with a glint of its own. */
  private markerView(m: { parts: THREE.Object3D[]; glint: THREE.Vector3 }, pos: Vec2, rot: number): MarkerView {
    const holder = new THREE.Group(); holder.add(...m.parts);
    const root = mergeByMaterial(holder); root.position.set(pos.x, 0, pos.z); root.rotation.y = rot; root.visible = false;
    const glint = new THREE.Sprite(this.glintMat); glint.position.copy(m.glint); glint.scale.setScalar(0); glint.renderOrder = 5;
    root.add(glint);
    this.scene.add(root);
    return { root, glint };
  }

  /** `v` at `stage`, made the first time it is needed: its parts merged by material, what comes and goes kept apart. */
  private stageView(v: StepView, stage: number): StageView {
    const made = v.stages[stage];
    if (made) return made;
    const parts = stageParts(v.id, stage, this.protos, shapeOf(v.id)!);
    const merged = (list: THREE.Object3D[]) => { if (!list.length) return null; const g = new THREE.Group(); g.add(...list); return mergeByMaterial(g); };
    const root = new THREE.Group(), fixed = merged(parts.fixed), guys = merged(parts.guys), fish = merged(parts.fish), sway = merged(parts.sway);
    const logs = parts.logs.length ? counted(parts.logs) : null;
    for (const o of [fixed, guys, fish, sway, logs?.group]) if (o) root.add(o);
    root.visible = false; v.root.add(root);
    return (v.stages[stage] = { root, guys, logs, fish, sway });
  }

  /** The ring round `id` at its place, made the first time it is needed. */
  private ringOf(rings: Map<MakeId, RingView>, id: MakeId, at: THREE.Object3D): RingView {
    let r = rings.get(id);
    if (r) return r;
    const inner = reachOf(id) + RING.gap;
    const geo = new THREE.RingGeometry(inner, inner + RING.width, RING.segments, 1, -Math.PI / 2).rotateX(Math.PI / 2);
    const group = new THREE.Group(), track = new THREE.Mesh(geo, this.ringMats.track), fill = new THREE.Mesh(geo.clone(), this.ringMats.fill.clone());
    track.position.y = 0.03; fill.position.y = 0.035; group.add(track, fill); group.visible = false;
    group.userData.noTap = true;                 // on the grass round it, not part of it (ui/input.ts)
    at.add(group);
    r = { group, fill, inner };
    rings.set(id, r);
    return r;
  }

  /** Show `v` at `stage` (-1: not at all), settling in when it reaches a new one. */
  private show(v: StepView, stage: number, dt: number): StageView | null {
    if (stage !== v.stage) {
      if (v.stage >= 0 && stage > v.stage) v.pop = 0;
      for (const s of v.stages) if (s) s.root.visible = false;
      v.stage = stage;
    }
    v.root.visible = stage >= 0;
    if (stage < 0) return null;
    const view = this.stageView(v, stage);
    view.root.visible = true;
    if (v.pop < 1) {
      v.pop = Math.min(1, v.pop + dt / POP);
      v.root.scale.setScalar(0.9 + 0.1 * (1 - Math.pow(1 - v.pop, 3)));
    }
    return view;
  }

  /** The ring round what is under way (filling up as it goes up, brighter while he works at it), or none. */
  private ring(state: GameState, rings: Map<MakeId, RingView>, under: MakeId | undefined, at: THREE.Object3D): void {
    for (const [id, r] of rings) r.group.visible = id === under;
    if (!under) return;
    const r = this.ringOf(rings, under, at), task = state.player.task;
    r.group.visible = true;
    r.fill.geometry.setDrawRange(0, Math.ceil(progressOf(state, under) * RING.segments) * 6);
    (r.fill.material as THREE.MeshBasicMaterial).opacity = task.kind === 'raise' && task.id === under ? 0.95 : 0.6;
  }

  /** A marker's glint, now and then (every MARKER.every seconds, shifted by `phase`). */
  private glint(m: MarkerView, t: number, phase: number): void {
    const g = ((t + phase) % MARKER.every) / GLINT_FOR;
    m.glint.scale.setScalar(g < 1 ? Math.sin(Math.PI * g) * MARKER.glint : 0);
  }

  /** What is drawn of `id` now (for the tests and the checks in the game): the stage shown (-1: nothing), the group it
   *  is drawn in (placed where it stands), its parts at that stage, and how far round it the ring reaches while it is
   *  under way (null: no ring). */
  drawnOf(id: MakeId): { stage: number; root: THREE.Group; parts: THREE.Group | null; guys: boolean; ring: number | null } | null {
    const spot = this.spots.find(s => s.steps.some(v => v.id === id)), v = id === 'chest' ? this.chest : spot?.steps.find(x => x.id === id);
    if (!v) return null;
    const view = v.stage >= 0 ? v.stages[v.stage] : undefined;
    const ring = (id === 'chest' ? this.chestRings : spot!.rings).get(id);
    return { stage: v.root.visible ? v.stage : -1, root: v.root, parts: view?.root ?? null, guys: !!view?.guys?.visible, ring: ring?.group.visible ? ring.inner : null };
  }

  /** Whether the marker shows at `line`'s spot, or the chalk square for the storage chest (for the tests). */
  markerAt(line: LineId | 'chest'): boolean {
    return !!(line === 'chest' ? this.chestMarker : this.spots.find(s => s.line === line)?.marker)?.root.visible;
  }

  /** He struck `target` (the training dummy) from `from`: it leans away from him and wobbles back, more for a hit that
   *  did damage than for a miss. */
  hit(target: string, damage: number, from: Vec2): void {
    const place = target === 'dummy' ? stepPlace(this.layout, 'dummy') : null;
    if (!place) return;
    const dx = place.pos.x - from.x, dz = place.pos.z - from.z, d = Math.hypot(dx, dz) || 1, c = Math.cos(place.rot), s = Math.sin(place.rot);
    // away from him, in the model's own frame (it is turned by its spot's facing)
    this.wobble = { t: 0, amp: damage > 0 ? WOBBLE.hit : WOBBLE.miss, x: (dx * c - dz * s) / d, z: (dx * s + dz * c) / d };
  }

  /** t: seconds; night: 0 by day .. 1 at night. */
  update(state: GameState, t: number, dt: number, night: number): void {
    const task = state.player.task;
    for (const spot of this.spots) {
      const shown = stepShown(state, spot.line), order = LINES[spot.line], from = shown ? order.indexOf(shown) : 0;
      for (const [i, v] of spot.steps.entries()) {
        const stage = stageOf(state, v.id), view = this.show(v, stage >= 0 && order.indexOf(v.id) >= from ? stage : -1, dt);
        if (!view) continue;
        // the old step's guy ropes (the tent's pegs) go once the new one is begun round it (D6)
        const next = spot.steps[i + 1]?.id;
        if (view.guys) view.guys.visible = !next || stageOf(state, next) < 0;
        if (view.logs) view.logs.show(state.woodpile);
        // the hearth's own fish make way for his on its spit while he cooks (D20)
        if (view.fish) view.fish.visible = task.kind !== 'cook';
        if (view.sway) this.sway(view.sway, dt);
      }
      const first = order[0]!;
      if (spot.marker) {
        spot.marker.root.visible = markerShown(state, this.layout, first);
        if (spot.marker.root.visible) this.glint(spot.marker, t, spot.phase);
      }
      const under = order.find(id => state.underway[id] !== undefined);
      this.ring(state, spot.rings, under, spot.steps.find(v => v.id === under)?.root ?? spot.steps[0]!.root);
      // its tap area, round what shows there now (what a tap on it does, and its menu: core/camp.ts campTap, campActions)
      const box = tapBoxOf(state, this.layout, spot.line);
      spot.tap.visible = !!box;
      if (box) { spot.tap.position.set(box.pos.x, box.tall / 2, box.pos.z); spot.tap.scale.set(box.radius, box.tall, box.radius); }
    }
    this.updateChest(state, t, dt);
    this.updateFire(state, t, dt, night);
  }

  /** The storage chest in the shelter: its stages and its chalk square, where the shelter drawn has it. */
  private updateChest(state: GameState, t: number, dt: number): void {
    if (!this.chest) return;
    const at = chestPlace(state, this.layout);
    if (at) {
      const key = `${at.pos.x.toFixed(3)},${at.pos.z.toFixed(3)},${at.rot.toFixed(3)},${at.floor}`;
      if (key !== this.chestAt) {
        this.chestAt = key;
        for (const o of [this.chest.root, this.chestMarker?.root]) if (o) { o.position.set(at.pos.x, at.floor, at.pos.z); o.rotation.y = at.rot; }
      }
    }
    const stage = at ? stageOf(state, 'chest') : -1;
    this.show(this.chest, stage, dt);
    if (this.chestMarker) {
      this.chestMarker.root.visible = !!at && markerShown(state, this.layout, 'chest');
      if (this.chestMarker.root.visible) this.glint(this.chestMarker, t, 0.4);
    }
    this.ring(state, this.chestRings, at && state.underway.chest !== undefined ? 'chest' : undefined, this.chest.root);
  }

  /** Struck (the training dummy): it leans away and wobbles back, dying away. */
  private sway(o: THREE.Object3D, dt: number): void {
    const w = this.wobble;
    if (!w) { o.rotation.set(0, 0, 0); return; }
    w.t += dt;
    const lean = w.amp * Math.exp(-w.t * WOBBLE.decay) * Math.sin(w.t * WOBBLE.rate * Math.PI * 2);
    o.rotation.set(lean * w.z, 0, -lean * w.x);
    if (w.t > WOBBLE.last) { this.wobble = null; o.rotation.set(0, 0, 0); }
  }

  /** The fire, once the campfire is built (and on under the stone hearth): its flames flicker, flare up while he
   *  stokes it and settle back, and burn low on a night there were no logs; its light warms the camp at night; smoke
   *  rises from it. */
  private updateFire(state: GameState, t: number, dt: number, night: number): void {
    const fire = this.fire;
    if (!fire) return;
    const lit = state.built.includes('campfire'), task = state.player.task;
    fire.flames.visible = lit;
    for (const pt of fire.smoke) pt.sprite.visible = lit;
    if (!lit) { fire.light.intensity = 0; return; }
    const grow = this.spots.find(s => s.line === 'hearth')?.steps[0]?.pop ?? 1;
    const flick = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3 + 1.7) * 0.07;
    this.flare = task.kind === 'stoke' ? Math.min(1, this.flare + dt / FIRE_LOOK.rise) : Math.max(0, this.flare - dt / FIRE_LOOK.settle);
    this.low += ((state.fireLow ? 1 : 0) - this.low) * Math.min(1, dt * FIRE_LOOK.lowEase);
    const size = (1 + (FIRE_LOOK.low - 1) * this.low) * (1 + (FIRE_LOOK.flare - 1) * this.flare);
    const wide = 1 + FIRE_LOOK.widen * (size - 1);
    for (const [i, f] of fire.parts.entries()) f.scale.set(wide, (flick + (i ? 0.08 : 0)) * grow * size, wide);
    fire.light.intensity = (0.8 + night * 7) * flick * (1 + (FIRE_LOOK.lowLight - 1) * this.low) * (1 + FIRE_LOOK.flareLight * this.flare);
    for (const pt of fire.smoke) {
      pt.age = (pt.age + dt) % SMOKE.life;
      const k = pt.age / SMOKE.life;
      pt.sprite.position.set(fire.pos.x + k * SMOKE.drift + Math.sin(t * 0.7 + pt.age * 2) * 0.06, 0.55 + k * SMOKE.rise, fire.pos.z - k * SMOKE.drift * 0.4);
      pt.sprite.scale.setScalar(0.22 + k * 0.75);
      pt.sprite.material.opacity = Math.sin(Math.PI * k) * 0.32 * grow * Math.min(FIRE_LOOK.smokeMax, size);
      pt.sprite.material.color.setScalar(1 - night * 0.7);
    }
  }
}
