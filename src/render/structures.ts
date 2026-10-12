// What he builds (data/making.ts), drawn at its site in the layout: the campfire, a ring of stones round three planks
// leaned together, with flickering flames, a little smoke and a warm light that matters at night (the village's
// hearth light, smaller). Until it is built its site shows a faint ring on the ground with a faint ring of stones
// inside, and an invisible, finger-sized hit area tagged with its id (userData.makeId) for the input; while he builds,
// the ring fills up. Models from assets/models/village.glb: CampfireCold's stones and ash, the wreck's Plank, the
// village Hearth's flames. Reads state; never changes it.
import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { Layout, Vec2 } from '../world/layout';
import { siteOf } from '../world/layout';
import { MAKES, type MakeDef, type MakeId } from '../data/making';

const RING = { width: 0.08, gap: 0.12, segments: 48, color: 0xf1e8d4 };   // the ring round a site not built yet
const PLAN_OPACITY = 0.3;          // how faint the stones inside it are
const POP = 0.5;                   // seconds a structure takes to settle in once built
const SMOKE = { puffs: 7, life: 3.6, rise: 2.4, drift: 0.5 };            // the campfire's smoke

interface Puff { sprite: THREE.Sprite; age: number }
interface SiteView {
  def: MakeDef; pos: Vec2; plan: THREE.Group; fill: THREE.Mesh; hit: THREE.Mesh;
  model: THREE.Group; flames: THREE.Object3D[]; light: THREE.PointLight | null; smoke: Puff[];
  shown: boolean | null; pop: number;
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
      // before it is built: a faint ring of stones inside a ring on the ground, which fills up while he builds
      const plan = new THREE.Group(); plan.position.set(site.pos.x, 0, site.pos.z);
      const stones = proto('CampfireCold').clone(true);
      stones.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = planMat; });
      stones.children.filter(o => !/^stone/i.test(o.name)).forEach(o => o.removeFromParent());
      const inner = site.radius + RING.gap;
      const ring = new THREE.RingGeometry(inner, inner + RING.width, RING.segments, 1, -Math.PI / 2).rotateX(Math.PI / 2);
      const track = new THREE.Mesh(ring, ringMat(0.32)), fill = new THREE.Mesh(ring.clone(), ringMat(0.85));
      track.position.y = 0.03; fill.position.y = 0.035; fill.visible = false;
      plan.add(stones, track, fill); scene.add(plan);
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(inner + 0.25, inner + 0.25, 0.8, 12), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(site.pos.x, 0.4, site.pos.z); hit.userData.makeId = def.id;
      scene.add(hit); this.pickables.push(hit);
      // once built
      const { model, flames } = build(proto);
      model.position.set(site.pos.x, 0, site.pos.z); model.visible = false;
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
      this.views.push({ def, pos: site.pos, plan, fill, hit, model, flames, light, smoke, shown: null, pop: 1 });
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
      for (const [i, f] of v.flames.entries()) f.scale.set(1, (flick + (i ? 0.08 : 0)) * v.pop, 1);
      if (v.light) v.light.intensity = (0.8 + night * 7) * flick;
      for (const pt of v.smoke) {
        pt.age = (pt.age + dt) % SMOKE.life;
        const k = pt.age / SMOKE.life;
        pt.sprite.position.set(v.pos.x + k * SMOKE.drift + Math.sin(t * 0.7 + pt.age * 2) * 0.06, 0.55 + k * SMOKE.rise, v.pos.z - k * SMOKE.drift * 0.4);
        pt.sprite.scale.setScalar(0.22 + k * 0.75);
        pt.sprite.material.opacity = Math.sin(Math.PI * k) * 0.32 * v.pop;
        pt.sprite.material.color.setScalar(1 - night * 0.7);
      }
    }
  }
}

/** How each structure is drawn once built: its model at the site's centre, and its flames (which flicker), if any.
 *  Tools (the stone axe) have none: the view draws them on him. */
const BUILD: Partial<Record<MakeId, (proto: (name: string) => THREE.Object3D) => { model: THREE.Group; flames: THREE.Object3D[] }>> = {
  campfire: proto => {
    const model = new THREE.Group(), flames: THREE.Object3D[] = [];
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
    return { model, flames };
  },
};
