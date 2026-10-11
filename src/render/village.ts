// The village's buildings, props, gardens, trees, bushes, lanterns and hearth, placed from the layout using the
// models in assets/models/village.glb. Everything that never moves is merged into one mesh per material, so a phone
// draws the whole village in a few dozen calls. Windows, lamps and the forge glow at night; the hearth flickers;
// a small pool of lights follows the lanterns nearest the camera.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Layout, Vec2 } from '../world/layout';

function seeded(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

const TREE: Record<string, string> = { birch: 'TreeBirch', oak: 'TreeOak', pine: 'TreePine' };
const PROP: Record<string, string> = { well: 'Well', board: 'NoticeBoard', bench: 'Bench', crates: 'Crates' };
const GLOWS = ['window_glass', 'lamp_glass', 'forge_glow'] as const;
const LAMP_LIGHTS = 6;                 // lights shared out to the nearest lanterns; enough to look right, cheap on phones

export class VillageView {
  readonly pickables: THREE.Object3D[] = [];
  private flames: THREE.Object3D[] = [];
  private hearthLight = new THREE.PointLight('#ff9a40', 3, 9, 1.6);
  private lamps: THREE.Vector3[] = [];
  private lampLights: THREE.PointLight[] = [];
  private glow: Partial<Record<(typeof GLOWS)[number], THREE.MeshStandardMaterial>> = {};
  private sinceSort = Infinity;

  constructor(scene: THREE.Scene, layout: Layout, models: THREE.Object3D) {
    const proto = (name: string) => {
      const o = models.getObjectByName(name);
      if (!o) throw new Error(`village.glb has no ${name}`);
      return o;
    };
    const statics = new THREE.Group();
    const place = (name: string, p: Vec2, rot: number, scale = 1) => {
      const o = proto(name).clone(true); o.position.set(p.x, 0, p.z); o.rotation.y = rot; o.scale.setScalar(scale); statics.add(o);
      return o;
    };
    const r = seeded(21);

    for (const b of layout.buildings) {
      place(b.model, b.pos, b.rot);
      const hit = new THREE.Mesh(new THREE.BoxGeometry(b.w, 3.2, b.d), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(b.pos.x, 1.6, b.pos.z); hit.rotation.y = b.rot; hit.userData.buildingId = b.id;
      scene.add(hit); this.pickables.push(hit);
    }
    for (const p of layout.props) place(PROP[p.kind]!, p.pos, p.rot);
    for (const g of layout.gardens) {
      place('Garden', g.pos, g.rot);
      // a fence all round, in sections stretched to fit each side exactly
      const hw = g.w / 2 + 0.3, hd = g.d / 2 + 0.3, c = Math.cos(g.rot), s = Math.sin(g.rot);
      const sides: [number, number, number, number][] = [[-hw, -hd, hw, -hd], [hw, -hd, hw, hd], [hw, hd, -hw, hd], [-hw, hd, -hw, -hd]];
      for (const [x0, z0, x1, z1] of sides) {
        const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2)), seg = len / n;
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / n, lx = x0 + (x1 - x0) * t, lz = z0 + (z1 - z0) * t;
          const o = place('Fence', { x: g.pos.x + lx * c + lz * s, z: g.pos.z - lx * s + lz * c }, g.rot + Math.atan2(-(z1 - z0), x1 - x0));
          o.scale.set(seg / 2, 1, 1);
        }
      }
    }
    for (const t of layout.trees) place(TREE[t.kind]!, t.pos, r() * Math.PI * 2, t.size);
    for (const p of layout.bushes) place('Bush', p, r() * Math.PI * 2);
    for (const p of layout.lanterns) {
      const face = Math.atan2(layout.hearth.pos.x - p.x, layout.hearth.pos.z - p.z) + Math.PI;   // lamp arm towards the hearth
      place('Lantern', p, face);
      this.lamps.push(new THREE.Vector3(p.x - Math.sin(face) * 0.36, 1.42, p.z - Math.cos(face) * 0.36));
    }
    for (let i = 0; i < Math.min(LAMP_LIGHTS, this.lamps.length); i++) {
      const light = new THREE.PointLight('#ffb050', 0, 7, 1.8); scene.add(light); this.lampLights.push(light);
    }

    const hearth = proto('Hearth').clone(true);
    hearth.position.set(layout.hearth.pos.x, 0, layout.hearth.pos.z); scene.add(hearth);
    hearth.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = !/^Flame/.test(mesh.name); mesh.receiveShadow = true;
      if (/^Flame/.test(mesh.name)) {
        const m = (mesh.material as THREE.MeshStandardMaterial);
        m.emissive.copy(m.color); m.emissiveIntensity = 1.6; m.toneMapped = false;
        this.flames.push(mesh);
      }
    });
    this.hearthLight.position.set(layout.hearth.pos.x, 1.0, layout.hearth.pos.z);
    scene.add(this.hearthLight);

    // land not yet claimed: an invisible box to tap
    for (const p of layout.parcels) {
      const a = p.area, hit = new THREE.Mesh(new THREE.BoxGeometry(a.maxX - a.minX, 4, a.maxZ - a.minZ), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set((a.minX + a.maxX) / 2, 2, (a.minZ + a.maxZ) / 2); hit.userData.parcelId = p.id;
      scene.add(hit); this.pickables.push(hit);
    }

    scene.add(mergeByMaterial(statics));
    scene.traverse(o => {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (mat && (GLOWS as readonly string[]).includes(mat.name)) this.glow[mat.name as (typeof GLOWS)[number]] = mat;
    });
  }

  /** t: seconds; night: 0 in full daylight .. 1 at night; focus: where the camera is looking. */
  update(t: number, night: number, focus: THREE.Vector3, dt: number): void {
    const flick = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3 + 1.7) * 0.07;
    for (const [i, f] of this.flames.entries()) f.scale.set(1, flick + (i ? 0.08 : 0), 1);
    this.hearthLight.intensity = (1.2 + night * 9) * flick;
    // every half second, hand the light pool to the lanterns nearest the camera
    this.sinceSort += dt;
    if (this.sinceSort > 0.5) {
      this.sinceSort = 0;
      const nearest = [...this.lamps].sort((a, b) => a.distanceToSquared(focus) - b.distanceToSquared(focus));
      this.lampLights.forEach((l, i) => l.position.copy(nearest[i]!));
    }
    for (const l of this.lampLights) l.intensity = night * 10;
    const warm = new THREE.Color('#ffc46a');
    for (const name of GLOWS) {
      const m = this.glow[name]; if (!m) continue;
      m.emissive.copy(warm);
      m.emissiveIntensity = name === 'forge_glow' ? 0.9 + night * 0.8 : night * 1.4;
    }
  }
}

/** Merge every mesh under `group` into one mesh per material, with positions baked in. */
function mergeByMaterial(group: THREE.Group): THREE.Group {
  group.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  group.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
    const key = mesh.material as THREE.Material;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(geo.index ? geo.toNonIndexed() : geo);
  });
  const out = new THREE.Group(); out.name = 'village-static';
  for (const [material, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true; mesh.receiveShadow = true; out.add(mesh);
  }
  return out;
}
