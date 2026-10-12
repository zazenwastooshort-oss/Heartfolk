// What he builds (data/making.ts), drawn at its site in the layout: the campfire, a ring of stones round three planks
// leaned together, with flickering flames, a little smoke and a warm light that matters at night (the village's
// hearth light, smaller); the shelter, the canvas Tent, its door facing the fire (0.0.18); the storage chest, a
// wooden box with copper straps facing the fire (0.0.19, built here in code). Until one is built its site shows a
// faint ring on the ground with a faint outline of it inside (the campfire's stones, the tent, the chest), and an
// invisible, finger-sized hit area tagged with its id (userData.makeId) for the input; while he builds, the ring fills
// up. Once the chest stands, a hit area tagged userData.storeId lets a tap empty the backpack into it. Since 0.0.19
// the fire flares up while he stokes it and settles back after, and burns low (smaller flames, dimmer light) on a
// night there were no logs, until it is stoked again (FIRE_LOOK in data/fire.ts). Models from
// assets/models/village.glb: CampfireCold's stones and ash, the wreck's Plank, the village Hearth's flames, the Tent.
// Reads state; never changes it.
import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { Layout, Vec2 } from '../world/layout';
import { siteOf } from '../world/layout';
import { MAKES, type MakeDef, type MakeId } from '../data/making';
import { FIRE_LOOK } from '../data/fire';

const RING = { width: 0.08, gap: 0.12, segments: 48, color: 0xf1e8d4 };   // the ring round a site not built yet
const PLAN_OPACITY = 0.3;          // how faint the outline inside it is
const POP = 0.5;                   // seconds a structure takes to settle in once built
const SMOKE = { puffs: 7, life: 3.6, rise: 2.4, drift: 0.5 };            // the campfire's smoke

interface Puff { sprite: THREE.Sprite; age: number }
interface SiteView {
  def: MakeDef; pos: Vec2; plan: THREE.Group; fill: THREE.Mesh; hit: THREE.Mesh; storeHit: THREE.Mesh | null;
  model: THREE.Group; flames: THREE.Object3D[]; light: THREE.PointLight | null; smoke: Puff[];
  shown: boolean | null; pop: number;
  /** the fire: how far it has flared up from being stoked (0..1), and how low it burns (0 normal .. 1 low) */
  flare: number; low: number;
}

/** A soft round puff, for the smoke. */
function puffTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, grad = g.createRadialGradient(32, 32, 0, 32, 32, 31);
  grad.addColorStop(0, 'rgba(235,235,230,0.9)'); grad.addColorStop(0.5, 'rgba(225,225,220,0.45)'); grad.addColorStop(1, 'rgba(220,220,215,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class StructuresView {
  readonly pickables: THREE.Object3D[] = [];
  private views: SiteView[] = [];

  constructor(scene: THREE.Scene, layout: Layout, models: THREE.Object3D) {
    const proto = (name: string) => {
      const o = models.getObjectByName(name);
      if (!o) throw new Error(`village.glb has no ${name}`);
      return o;
    };
    const planMat = new THREE.MeshStandardMaterial({ color: RING.color, transparent: true, opacity: PLAN_OPACITY, depthWrite: false });
    const ringMat = (opacity: number) => new THREE.MeshBasicMaterial({ color: RING.color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
    const puffs = puffTexture();
    for (const def of Object.values(MAKES)) {
      const build = BUILD[def.id];
      if (def.gives.kind !== 'structure' || def.at === 'here' || !build) continue;
      const site = siteOf(layout, def.at);
      if (!site) continue;
      const { model, flames, plan: outline, store } = build(proto);
      // before it is built: a faint outline of it inside a ring on the ground, which fills up while he builds
      const plan = new THREE.Group(); plan.position.set(site.pos.x, 0, site.pos.z);
      outline.rotation.y = site.rot ?? 0;
      outline.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = planMat; });
      const inner = site.radius + RING.gap;
      const ring = new THREE.RingGeometry(inner, inner + RING.width, RING.segments, 1, -Math.PI / 2).rotateX(Math.PI / 2);
      const track = new THREE.Mesh(ring, ringMat(0.32)), fill = new THREE.Mesh(ring.clone(), ringMat(0.85));
      track.position.y = 0.03; fill.position.y = 0.035; fill.visible = false;
      plan.add(outline, track, fill); scene.add(plan);
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(inner + 0.25, inner + 0.25, 0.8, 12), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(site.pos.x, 0.4, site.pos.z); hit.userData.makeId = def.id;
      scene.add(hit); this.pickables.push(hit);
      // once built, something to store things in (the chest) can be tapped to empty the backpack into it
      let storeHit: THREE.Mesh | null = null;
      if (store) {
        storeHit = new THREE.Mesh(new THREE.CylinderGeometry(site.radius + 0.2, site.radius + 0.2, 0.9, 12), new THREE.MeshBasicMaterial({ visible: false }));
        storeHit.position.set(site.pos.x, 0.45, site.pos.z); storeHit.userData.storeId = def.id; storeHit.visible = false;
        scene.add(storeHit); this.pickables.push(storeHit);
      }
      // once built
      model.position.set(site.pos.x, 0, site.pos.z); model.rotation.y = site.rot ?? 0; model.visible = false;
      model.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = !flames.includes(m); m.receiveShadow = true; } });
      scene.add(model);
      // a fire gives light (always in the scene, dark until it is lit, so lighting it costs no shader rebuild) and smoke
      let light: THREE.PointLight | null = null;
      const smoke: Puff[] = [];
      if (flames.length) {
        light = new THREE.PointLight('#ff9a40', 0, 8, 1.6); light.position.set(site.pos.x, 0.9, site.pos.z); scene.add(light);
        for (let i = 0; i < SMOKE.puffs; i++) {
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffs, transparent: true, depthWrite: false, opacity: 0 }));
          sprite.visible = false; scene.add(sprite);
          smoke.push({ sprite, age: i / SMOKE.puffs * SMOKE.life });
        }
      }
      this.views.push({ def, pos: site.pos, plan, fill, hit, storeHit, model, flames, light, smoke, shown: null, pop: 1, flare: 0, low: 0 });
    }
  }

  /** t: seconds; night: 0 by day .. 1 at night. */
  update(state: GameState, t: number, dt: number, night: number): void {
    const task = state.player.task;
    for (const v of this.views) {
      const built = state.built.includes(v.def.id);
      if (built !== v.shown) {
        if (built && v.shown === false) v.pop = 0;               // just built: it settles in
        v.plan.visible = v.hit.visible = !built; v.model.visible = built;
        if (v.storeHit) v.storeHit.visible = built;
        for (const pt of v.smoke) pt.sprite.visible = built;
        v.shown = built;
      }
      if (!built) {
        // while he builds it, the ring fills up
        const working = task.kind === 'make' && task.id === v.def.id;
        v.fill.visible = working;
        if (working) {
          const done = Math.min(1, Math.max(0, 1 - (task.doneAt - state.time) / v.def.time));
          v.fill.geometry.setDrawRange(0, Math.ceil(done * RING.segments) * 6);
        }
        if (v.light) v.light.intensity = 0;
        continue;
      }
      if (v.pop < 1) {
        v.pop = Math.min(1, v.pop + dt / POP);
        v.model.scale.setScalar(0.7 + 0.3 * (1 - Math.pow(1 - v.pop, 3)));
      }
      const flick = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3 + 1.7) * 0.07;
      // stoking: the flames flare up while he stokes, then settle back; with no logs at nightfall they burn low
      v.flare = task.kind === 'stoke' ? Math.min(1, v.flare + dt / FIRE_LOOK.rise) : Math.max(0, v.flare - dt / FIRE_LOOK.settle);
      v.low += ((state.fireLow ? 1 : 0) - v.low) * Math.min(1, dt * FIRE_LOOK.lowEase);
      const size = (1 + (FIRE_LOOK.low - 1) * v.low) * (1 + (FIRE_LOOK.flare - 1) * v.flare);
      const wide = 1 + FIRE_LOOK.widen * (size - 1);
      for (const [i, f] of v.flames.entries()) f.scale.set(wide, (flick + (i ? 0.08 : 0)) * v.pop * size, wide);
      if (v.light) v.light.intensity = (0.8 + night * 7) * flick * (1 + (FIRE_LOOK.lowLight - 1) * v.low) * (1 + FIRE_LOOK.flareLight * v.flare);
      for (const pt of v.smoke) {
        pt.age = (pt.age + dt) % SMOKE.life;
        const k = pt.age / SMOKE.life;
        pt.sprite.position.set(v.pos.x + k * SMOKE.drift + Math.sin(t * 0.7 + pt.age * 2) * 0.06, 0.55 + k * SMOKE.rise, v.pos.z - k * SMOKE.drift * 0.4);
        pt.sprite.scale.setScalar(0.22 + k * 0.75);
        pt.sprite.material.opacity = Math.sin(Math.PI * k) * 0.32 * v.pop * Math.min(FIRE_LOOK.smokeMax, size);
        pt.sprite.material.color.setScalar(1 - night * 0.7);
      }
    }
  }
}

/** How each structure is drawn once built: its model at the site's centre (turned to face the site's way), and its
 *  flames (which flicker), if any; the outline drawn faintly at its site until then; and whether things are stored in
 *  it (the chest: a tap empties the backpack into it). Tools (the stone axe and pickaxe) have none: the view draws
 *  them on him. */
type Built = { model: THREE.Group; flames: THREE.Object3D[]; plan: THREE.Object3D; store?: boolean };

/** The storage chest's look (0.0.19): a box of split-log boards under a lid, two copper straps over it and a copper
 *  latch at the front (+z, which faces the fire), in metres. */
const CHEST = { w: 0.9, d: 0.56, boards: 3, board: 0.14, lid: 0.12, wood: ['#80583a', '#73502f'], lidWood: '#644428', copper: '#e8904e' };

/** The chest, built from boxes (a placeholder, quick to change). */
function chestModel(): THREE.Group {
  const g = new THREE.Group();
  const mat = (color: string, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: metal ? 0.5 : 0.9, metalness: metal, flatShading: true });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b;
  };
  const woods = CHEST.wood.map(c => mat(c)), body = CHEST.boards * CHEST.board;
  for (let i = 0; i < CHEST.boards; i++) box(CHEST.w, CHEST.board, CHEST.d, woods[i % woods.length]!, 0, CHEST.board * (i + 0.5), 0);
  box(CHEST.w + 0.04, CHEST.lid, CHEST.d + 0.04, mat(CHEST.lidWood), 0, body + CHEST.lid / 2, 0);
  const copper = mat(CHEST.copper, 0.25), high = body + CHEST.lid;
  for (const x of [-0.29, 0.29]) box(0.08, high + 0.016, CHEST.d + 0.07, copper, x, (high + 0.016) / 2, 0);
  box(0.12, 0.13, 0.03, copper, 0, body, CHEST.d / 2 + 0.04);
  return g;
}
const BUILD: Partial<Record<MakeId, (proto: (name: string) => THREE.Object3D) => Built>> = {
  campfire: proto => {
    const model = new THREE.Group(), flames: THREE.Object3D[] = [];
    // until it is built: the ring of stones, faint
    const plan = proto('CampfireCold').clone(true);
    plan.children.filter(o => !/^stone/i.test(o.name)).forEach(o => o.removeFromParent());
    // the cold campfire's ring of stones and its ash, without its logs: the fire burns the planks it was built with
    const ring = proto('CampfireCold').clone(true);
    ring.children.filter(o => /^log/i.test(o.name)).forEach(o => o.removeFromParent());
    model.add(ring);
    // three planks, made smaller, leaned together over the ash, their feet showing round the flames
    for (let i = 0; i < 3; i++) {
      const turn = new THREE.Group(), plank = proto('Plank').clone(true);
      turn.rotation.y = i / 3 * Math.PI * 2 + 0.4;
      plank.scale.setScalar(0.72); plank.rotation.z = 2.1; plank.position.set(0.165, 0.285, 0);
      turn.add(plank); model.add(turn);
    }
    // the village hearth's flames, smaller, glowing
    const fire = new THREE.Group(); fire.scale.setScalar(0.6); model.add(fire);
    const hearth = proto('Hearth');
    for (const name of ['Flame', 'FlameCore']) {
      const src = hearth.getObjectByName(name) as THREE.Mesh | undefined;
      if (!src?.isMesh) continue;
      const flame = src.clone(), m = (src.material as THREE.MeshStandardMaterial).clone();
      m.emissive.copy(m.color); m.emissiveIntensity = 1.6; m.toneMapped = false; flame.material = m;
      flame.position.set(0, 0, 0);
      fire.add(flame); flames.push(flame);
    }
    return { model, flames, plan };
  },
  // the shelter: the canvas tent from the tarp, on its poles, pegged down; until it is built, the whole tent faint
  shelter: proto => {
    const model = new THREE.Group();
    model.add(proto('Tent').clone(true));
    return { model, flames: [], plan: proto('Tent').clone(true) };
  },
  // the storage chest beside the shelter; until it is built, the whole chest faint
  chest: () => ({ model: chestModel(), flames: [], plan: chestModel(), store: true }),
};
