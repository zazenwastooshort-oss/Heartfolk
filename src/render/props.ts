// Props for the later chunks of chapter 2, placeholder art made quickly (the owner, 12 Oct 2026), not wired into play:
// the rats' nest (chunk C) and the goblin camp's palisade fence, ragged hide tent and totem (chunk E). Each builder
// returns a group standing on the ground at its origin, its front facing +z, for the caller to place and turn, merged
// into one mesh per colour (parts.ts: a palisade segment of any length is 4 meshes). The colours' materials are made
// once and shared by every prop, so give a prop a clone to change its look; the camp's own models are never changed.
//  - ratNestModel(seed?): a mound of straw and twigs, about 1.1 m across and 0.35 high, a dark hole in its front.
//  - palisadeModel(length?, seed?): a row of sharpened stakes, 1.5 to 1.9 m tall, bound to two rails, `length` metres
//    along x (2.4 if left out), so segments can be set end to end.
//  - hideTentModel(village): village.glb's Tent (its scene is passed in) recoloured as patched hides, with crossed poles
//    at its ends; 1.9 m wide and 2.4 deep like the shelter, its door at +z.
//  - totemModel(): a carved post about 2.3 m tall, a grinning face with horns and pointed ears, painted bands.
import * as THREE from 'three';
import { flat, mergeByMaterial } from './parts';

/** The props' colours (a placeholder, quick to change). */
export const PROP_LOOK = {
  straw: '#c2a15d', strawLight: '#dcc583', bark: ['#6e4f33', '#7a5b3c', '#5e4430'], hole: '#2a1f16',
  stake: ['#8a5f3a', '#7a5434', '#96693f'], rope: '#c9a66b', hide: '#93704b', hideDark: '#5a3e28',
  patch: ['#7a5a3a', '#a8845a', '#6b4c30'], carved: '#7d5634', paint: '#9b4a3a', bone: '#e9dfc4', dark: '#2a1f16',
};

function add(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
function seeded(seed: number) { let s = Math.max(1, Math.floor(Math.abs(seed)) % 2147483646); return () => (s = (s * 16807) % 2147483647) / 2147483647; }
/** A stick from a to b, `r` thick. */
function stick(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, parent: THREE.Object3D, sides = 5): THREE.Mesh {
  const m = add(new THREE.CylinderGeometry(r, r, a.distanceTo(b), sides), mat, parent);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

/** The rats' nest: a lumpy mound of straw, twigs criss-crossed over it, tufts sticking out, a dark hole at its front. */
export function ratNestModel(seed = 7): THREE.Group {
  const g = new THREE.Group(), r = seeded(seed), L = PROP_LOOK;
  const size = { x: 0.55, y: 0.34, z: 0.5 };
  const mound = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), pos = mound.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {            // lumpy, by where each corner is, so shared corners stay joined
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), h = Math.sin(x * 12.9 + z * 78.2 + y * 37.7 + seed) * 43758.5;
    const k = y > 0.01 ? 0.85 + 0.3 * (h - Math.floor(h)) : 1;
    pos.setXYZ(i, x * size.x * k, y * size.y * k, z * size.z * k);
  }
  mound.computeVertexNormals();
  add(mound, flat(L.straw), g);
  const surface = (a: number, up: number) => new THREE.Vector3(Math.cos(a) * Math.cos(up) * size.x, Math.sin(up) * size.y, Math.sin(a) * Math.cos(up) * size.z);
  // the hole, low on its front
  const hole = add(new THREE.CircleGeometry(0.12, 8).scale(1, 0.75, 1), flat(L.hole), g);
  hole.position.copy(surface(Math.PI / 2, 0.32)).multiplyScalar(1.01);
  hole.rotation.x = -0.45;
  // twigs laid over it, criss-crossed
  const barks = L.bark.map(c => flat(c));
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2, up = 0.2 + r() * 1.05, mid = surface(a, up).multiplyScalar(1.02), turn = r() * Math.PI * 2;
    if (Math.abs(a - Math.PI / 2) < 0.35 && up < 0.6) continue;              // keep the hole clear
    const dir = new THREE.Vector3(Math.cos(turn), (r() - 0.5) * 0.3, Math.sin(turn)).normalize().multiplyScalar(0.18 + r() * 0.14);
    stick(mid.clone().sub(dir), mid.clone().add(dir), 0.011 + r() * 0.006, barks[i % barks.length]!, g, 4);
  }
  // straw tufts sticking out
  const tuft = flat(L.strawLight);
  for (let i = 0; i < 12; i++) {
    const a = r() * Math.PI * 2, up = 0.1 + r() * 1.2, at = surface(a, up);
    const m = add(new THREE.ConeGeometry(0.022, 0.13, 4), tuft, g, at.x, at.y, at.z);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), at.clone().normalize().add(new THREE.Vector3(r() - 0.5, 0.3, r() - 0.5)).normalize());
  }
  return mergeByMaterial(g);
}

/** A palisade segment: sharpened stakes side by side along x, leaning a little this way and that, bound with rope to
 *  two rails behind them. */
export function palisadeModel(length = 2.4, seed = 3): THREE.Group {
  const g = new THREE.Group(), r = seeded(seed), L = PROP_LOOK;
  const woods = L.stake.map(c => flat(c)), rope = flat(L.rope), n = Math.max(2, Math.round(length / 0.2)), step = length / n;
  for (let i = 0; i < n; i++) {
    const stake = new THREE.Group(), rad = 0.085 + r() * 0.02, h = 1.5 + r() * 0.4, mat = woods[i % woods.length]!;
    stake.position.set(-length / 2 + step * (i + 0.5), 0, (r() - 0.5) * 0.04);
    stake.rotation.set((r() - 0.5) * 0.08, r() * Math.PI, (r() - 0.5) * 0.06);
    add(new THREE.CylinderGeometry(rad, rad * 1.08, h, 6), mat, stake, 0, h / 2, 0);
    add(new THREE.ConeGeometry(rad, 0.3, 6), mat, stake, 0, h + 0.15, 0);
    for (const y of [0.45, 1.15]) add(new THREE.CylinderGeometry(rad + 0.012, rad + 0.012, 0.05, 6), rope, stake, 0, y, 0);
    g.add(stake);
  }
  for (const y of [0.45, 1.15]) stick(new THREE.Vector3(-length / 2, y, -0.11), new THREE.Vector3(length / 2, y, -0.11), 0.04, woods[1]!, g, 6);
  return mergeByMaterial(g);
}

/** The goblins' tent: village.glb's Tent (pass its scene) with its own materials, its canvas turned into hides with
 *  patches sewn on, and crossed poles standing up at both ends of the ridge. */
export function hideTentModel(village: THREE.Object3D): THREE.Group {
  const tent = village.getObjectByName('Tent');
  if (!tent) throw new Error('village.glb has no Tent');
  const L = PROP_LOOK, g = new THREE.Group(), model = tent.clone(true);
  model.position.set(0, 0, 0); model.rotation.set(0, 0, 0);
  const hides: Record<string, string> = { canvas: L.hide, canvas_dark: L.hideDark };   // its canvas, turned into hides
  const copies = new Map<THREE.Material, THREE.Material>();                            // and a copy of each of the rest
  model.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.material as THREE.Material, hide = hides[src.name];
    m.material = hide ? flat(hide, 0.95, src.side) : copies.get(src) ?? copies.set(src, src.clone()).get(src)!;
  });
  g.add(model);
  // patches on both slopes (the canvas runs from its foot 0.95 m out to the ridge 1.45 m up)
  const slope = Math.atan2(1.45, 0.95), patches = L.patch.map(c => flat(c));
  const spots = [[1, 0.6, 0.5, 0.34, 0.28], [1, 0.95, -0.6, 0.3, 0.24], [-1, 0.5, -0.2, 0.36, 0.3], [-1, 1.0, 0.75, 0.26, 0.22]] as const;
  spots.forEach(([side, y, z, w, d], i) => {           // side: the slope facing +x or -x; y: how high up it
    const out = 0.012, x = side * (0.95 * (1 - y / 1.45) + out * Math.sin(slope)), patch = add(new THREE.BoxGeometry(w, 0.012, d), patches[i % patches.length]!, g, x, y + out * Math.cos(slope), z);
    patch.rotation.z = -side * slope;
  });
  // crossed poles at both ends, poking up past the ridge
  const pole = flat(L.hideDark);
  for (const z of [-1.27, 1.27]) {
    stick(new THREE.Vector3(-0.42, 0.75, z), new THREE.Vector3(0.22, 1.85, z), 0.025, pole, g);
    stick(new THREE.Vector3(0.42, 0.75, z), new THREE.Vector3(-0.22, 1.85, z), 0.025, pole, g);
  }
  return mergeByMaterial(g);
}

/** The goblins' totem: a post with painted bands, topped by a carved head grinning at the front (+z), horns of bone and
 *  pointed ears, strips of hide hanging from it. */
export function totemModel(): THREE.Group {
  const g = new THREE.Group(), L = PROP_LOOK;
  const carved = flat(L.carved), paint = flat(L.paint), bone = flat(L.bone), dark = flat(L.dark);
  add(new THREE.CylinderGeometry(0.15, 0.19, 1.55, 6), flat(L.stake[0]!), g, 0, 0.775, 0);
  for (const y of [0.45, 1.05]) add(new THREE.CylinderGeometry(0.165, 0.17, 0.1, 6), paint, g, 0, y, 0);
  // the head
  const head = new THREE.Group(); head.position.y = 1.8; g.add(head);
  add(new THREE.BoxGeometry(0.46, 0.5, 0.4), carved, head);
  add(new THREE.BoxGeometry(0.48, 0.07, 0.42), paint, head, 0, 0.12, 0);              // a painted brow band
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.1, 0.07, 0.03), dark, head, s * 0.11, 0.03, 0.2);     // eyes
    const ear = add(new THREE.ConeGeometry(0.06, 0.24, 4).scale(1, 1, 0.45), carved, head, s * 0.32, 0.04, 0);
    ear.rotation.z = -s * 1.2;
    const horn = add(new THREE.ConeGeometry(0.055, 0.34, 5), bone, head, s * 0.2, 0.38, 0);
    horn.rotation.z = -s * 0.55;
  }
  add(new THREE.BoxGeometry(0.08, 0.12, 0.08), carved, head, 0, -0.04, 0.22);           // the nose
  add(new THREE.BoxGeometry(0.3, 0.09, 0.03), dark, head, 0, -0.15, 0.2);               // the grin
  for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.035, 0.045, 0.02), bone, head, -0.105 + i * 0.07, -0.13, 0.215);
  // strips of hide hanging from under the head
  const strip = flat(L.hide);
  for (const [x, z, h] of [[-0.2, 0.12, 0.42], [0.21, -0.06, 0.36], [-0.05, -0.2, 0.3]] as const) {
    add(new THREE.BoxGeometry(0.06, h, 0.012), strip, g, x, 1.55 - h / 2, z).rotation.y = x * 2;
  }
  return mergeByMaterial(g);
}
