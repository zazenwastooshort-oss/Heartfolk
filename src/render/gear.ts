// What he wears, drawn in code (chapter 2, 0.0.22). For now his one weapon, the stone club: a heavy branch with a round
// stone lashed on, carried on the tool's bone so it swings with the handle like the axe (render/view.ts shows it while
// he practises on the training dummy). Each weapon has its own model here, by its id in GEAR (data/combat.ts); armour
// (the hide armour, chunk D) can join it. Placeholders, quick to change. Reads nothing from the game.
import * as THREE from 'three';
import type { GearId } from '../data/combat';

/** The stone club, his first weapon: a heavier branch than the tools' handle, widening to the end, with a round stone
 *  lashed on the side it strikes with (where the axe's blade is, so it lands where the blade would), in metres in the
 *  tool's own frame (the handle runs down its -y from the grips, the blade out along -x). */
const CLUB = { stone: '#8a867f', branch: '#6f5034', lashing: '#b39867', radius: 0.085, at: [-0.105, -1.08] as const, sleeve: [0.04, 0.056] as const };

/** The club's head and its heavier end, made in code as a group on the tool's bone (`tool`), so it swings with the
 *  handle. */
function clubModel(tool: THREE.Object3D): THREE.Group {
  const g = new THREE.Group(), mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true });
  const stoneGeo = new THREE.IcosahedronGeometry(CLUB.radius, 1), pos = stoneGeo.getAttribute('position') as THREE.BufferAttribute, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const h = Math.sin(v.x * 91.7 + v.y * 47.3 + v.z * 13.1) * 43758.5453, k = 0.88 + 0.2 * (h - Math.floor(h));
    pos.setXYZ(i, v.x * k, v.y * k * 0.92, v.z * k);       // a little lumpy, the same at every shared corner
  }
  stoneGeo.computeVertexNormals();
  const stone = new THREE.Mesh(stoneGeo, mat(CLUB.stone)); stone.position.set(CLUB.at[0], CLUB.at[1], 0);
  // the branch widening to its heavy end, over the handle from below the grips to the head
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(CLUB.sleeve[1], CLUB.sleeve[0], 0.44, 7), mat(CLUB.branch)); sleeve.position.set(0, -0.92, 0);
  const lashing = mat(CLUB.lashing);
  for (const y of [-1.03, -1.12]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.035, 8), lashing); band.position.set(-0.02, y, 0); band.scale.x = 1.5; g.add(band);
  }
  g.add(stone, sleeve);
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  tool.add(g);
  return g;
}

/** Each weapon's model, by its id in GEAR: made on the tool's bone (`tool`) and returned, for the view to show and
 *  hide. A new weapon adds its model here. */
export const WEAPON_MODELS: Partial<Record<GearId, (tool: THREE.Object3D) => THREE.Object3D>> = {
  stone_club: clubModel,
};
