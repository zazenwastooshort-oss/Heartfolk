// Helpers for the models built in code from many small parts (gear.ts, props.ts, the goblin's club in creatures.ts):
// one flat-shaded material per look, made once and shared, and merging a finished model's parts into one mesh per
// material, so a phone draws a hide vest or a palisade in a handful of calls instead of one, and a shadow, for every
// stitch and stake (village.ts merges its statics the same way); and things of which as many show as there are (the
// logs in the firewood pile or the woodshed, render/campmodels.ts), merged the same way, each mesh drawn as far as the
// count.
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

/** Things of which as many show as there are (the logs in the firewood pile or the woodshed), merged like
 *  mergeByMaterial into one mesh per material, in a group: `show(n)` draws only the first n of them. */
export interface Counted { group: THREE.Group; size: number; show(n: number): void }

/** `items` (each a mesh or a group of them, placed in a shared frame), first to show first, merged into one mesh per
 *  material: each mesh draws as far as the last item shown, so showing more or fewer costs nothing. */
export function counted(items: THREE.Object3D[]): Counted {
  const holder = new THREE.Group();
  for (const it of items) holder.add(it);
  holder.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; ends: number[] }>();
  items.forEach((it, i) => {
    it.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      let g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      const key = mesh.material as THREE.Material, b = buckets.get(key) ?? buckets.set(key, { geos: [], ends: [] }).get(key)!;
      b.geos.push(g);
      b.ends[i] = (b.ends[i] ?? 0) + g.getAttribute('position').count;
    });
  });
  const group = new THREE.Group(), meshes: { mesh: THREE.Mesh; upTo: number[] }[] = [];
  for (const [material, b] of buckets) {
    const mesh = new THREE.Mesh(mergeGeometries(b.geos, false)!, material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    // upTo[n]: how many vertices the first n items have in this mesh
    const upTo = [0];
    for (let i = 0; i < items.length; i++) upTo.push(upTo[i]! + (b.ends[i] ?? 0));
    meshes.push({ mesh, upTo }); group.add(mesh);
  }
  return {
    group, size: items.length,
    show(n: number) {
      const k = Math.max(0, Math.min(items.length, Math.floor(n)));
      for (const { mesh, upTo } of meshes) { mesh.geometry.setDrawRange(0, upTo[k]!); mesh.visible = upTo[k]! > 0; }
    },
  };
}
