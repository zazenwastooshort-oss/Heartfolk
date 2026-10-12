// Building materials lying about the camp (data/building.ts), drawn in code for render/pickups.ts, which places them like
// the wreck's pieces from village.glb: a clump of reeds at the river's edge (cut for fibre) and a patch of clay in the
// bank (dug a lump at a time). Placeholders, quick to change.
import * as THREE from 'three';
import { flat } from './parts';

function seeded(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

/** A clump of reeds: thin blades leaning out from the middle, three of them topped with a brown head. */
function reeds(): THREE.Group {
  const g = new THREE.Group(), r = seeded(31);
  const greens = ['#7f9a4a', '#93ab58', '#a7b56a'].map(c => flat(c, 0.9, THREE.DoubleSide)), head = flat('#6b4a2c');
  for (let i = 0; i < 11; i++) {
    const h = 0.55 + r() * 0.4, blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, h, 0.012).translate(0, h / 2, 0), greens[i % greens.length]!);
    const a = (i / 11) * Math.PI * 2 + r() * 0.4, out = 0.04 + r() * 0.08;
    blade.position.set(Math.cos(a) * out, 0, Math.sin(a) * out);
    blade.rotation.set(Math.sin(a) * (0.12 + r() * 0.2), r() * Math.PI, -Math.cos(a) * (0.12 + r() * 0.2));
    g.add(blade);
    if (i % 4 === 0) {
      const cat = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.13, 6), head);
      cat.position.set(0, h + 0.05, 0); blade.add(cat);
    }
  }
  return g;
}

/** A patch of clay in the bank: a low, smooth mound with a dug hollow and a couple of lumps beside it. */
function clayPatch(): THREE.Group {
  const g = new THREE.Group(), clay = flat('#a85f3a', 0.8), wet = flat('#8a4b2c', 0.6), lump = flat('#b8714a', 0.85);
  const mound = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), clay);
  mound.scale.set(1.1, 0.28, 0.85); g.add(mound);
  const hollow = new THREE.Mesh(new THREE.CircleGeometry(0.12, 10).rotateX(-Math.PI / 2), wet);
  hollow.position.set(0.06, 0.096, -0.02); g.add(hollow);
  for (const [x, z, s] of [[-0.28, 0.2, 0.07], [0.3, 0.16, 0.055]] as const) {
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), lump); l.position.set(x, s * 0.6, z); l.scale.y = 0.7; g.add(l);
  }
  return g;
}

const MODELS: Record<string, () => THREE.Object3D> = { Reeds: reeds, ClayPatch: clayPatch };

/** The model named `name` (PICKUPS' model in data/pickups.ts) if it is one drawn here, else null. */
export const codeModel = (name: string): THREE.Object3D | null => (Object.hasOwn(MODELS, name) ? MODELS[name]!() : null);
