// Helpers for the models built in code from many small parts (gear.ts, props.ts, the goblin's club in creatures.ts):
// one flat-shaded material per look, made once and shared, and merging a finished model's parts into one mesh per
// material, so a phone draws a hide vest or a palisade in a handful of calls instead of one, and a shadow, for every
// stitch and stake (village.ts merges its statics the same way).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const made = new Map<string, THREE.MeshStandardMaterial>();

/** A flat-shaded material of `color`, made the first time it is asked for and shared by everything that asks for the
 *  same look after that: to change one model's, give it a clone, never change this one. */
export function flat(color: string, roughness = 0.95, side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
  const key = `${color} ${roughness} ${side}`;
  let m = made.get(key);
  if (!m) made.set(key, (m = new THREE.MeshStandardMaterial({ color, roughness, flatShading: true, side })));
  return m;
}

/** `root`'s meshes merged into one mesh per material, in a new group that takes root's place, turn and size, so it
 *  goes wherever root would have gone. For parts that never move apart: what moves on its own must stay out. Keeps
 *  positions and normals only (the materials are plain colours). Each merged mesh is named after its material. */
export function mergeByMaterial(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert(), buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    let g = mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld));
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const key = mesh.material as THREE.Material;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(g);
  });
  const out = new THREE.Group();
  out.name = root.name; out.position.copy(root.position); out.quaternion.copy(root.quaternion); out.scale.copy(root.scale);
  for (const [material, geos] of buckets) {
    const mesh = new THREE.Mesh(mergeGeometries(geos, false)!, material);
    mesh.name = material.name; mesh.castShadow = true; mesh.receiveShadow = true;
    out.add(mesh);
  }
  return out;
}
