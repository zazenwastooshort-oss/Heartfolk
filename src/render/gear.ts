// What he wears, drawn in code (chapter 2, 0.0.22). His one weapon so far, the stone club: a heavy branch with a round
// stone lashed on, carried on the tool's bone so it swings with the handle like the axe (render/view.ts shows it while
// he practises on the training dummy); each weapon has its own model, by its id in GEAR (data/combat.ts). And the hide
// armour (chunk D; render/view.ts puts on him what he wears, armourWorn): wearGear(character, worn) shows the pieces in
// `worn` on the right bones and hides the others: a hide cap on his head, a hide vest over his chest (on the hips
// bone, which carries the torso in miner.glb), a round hide shield on his left forearm. Brown leather with cream
// stitch lines, low-poly and flat-shaded.
// Each piece is built the first time it is worn, merged into one mesh per colour (parts.ts: the full armour is 10
// meshes, its materials shared by every piece and everyone wearing one), and then only shown or hidden. `character` is
// miner.glb's Miner node (or a copy of it, such as a goblin's: creatures.ts); ids it doesn't know are ignored, so a list
// of everything he wears can be passed as it is. Pieces are drawn in the frame of the mesh they sit on (the hair, the
// torso, the forearm), whose sizes in miner.glb they are fitted to. Placeholders, quick to change. Reads nothing from
// the game but what it is given.
import * as THREE from 'three';
import { SLOTS, type GearId, type Slot } from '../data/combat';
import { flat, mergeByMaterial } from './parts';

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


/** The hide armour's pieces (chunk D adds them to GEAR in data/combat.ts with their slots and bonuses). */
export type ArmourId = 'hide_cap' | 'hide_vest' | 'hide_shield';

/** The leather's colours and the stitches' (a placeholder, quick to change). */
export const HIDE = { leather: '#a4774a', dark: '#77532f', stitch: '#efe2c2', wood: '#8a5f3a' };

function add(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Stitches: short cream dashes along the curve `at` (t from 0 to 1), each lying along it. */
function stitches(parent: THREE.Object3D, at: (t: number) => THREE.Vector3, count: number, mat: THREE.Material, len = 0.026): void {
  const dash = new THREE.BoxGeometry(0.009, 0.009, len), z = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count, p0 = at(t), along = at(Math.min(1, t + 0.01)).sub(at(Math.max(0, t - 0.01))).normalize();
    add(dash, mat, parent, p0.x, p0.y, p0.z).quaternion.setFromUnitVectors(z, along);
  }
}

/** The cap, in the head bone's frame (the hair's: it reaches 0.25 m up, 0.18 to 0.22 m round; +x is his front): a
 *  dome of hide tipped back a little, a rolled band round it, seams over the top front to back and side to side. */
function hideCap(): THREE.Object3D {
  const cap = new THREE.Group(); cap.position.set(-0.02, 0.07, 0); cap.rotation.z = 0.2;
  const leather = flat(HIDE.leather), stitch = flat(HIDE.stitch);
  const r = { x: 0.216, y: 0.2, z: 0.21 };
  add(new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.52).scale(r.x, r.y, r.z), leather, cap);
  add(new THREE.TorusGeometry(1, 0.11, 4, 12).rotateX(Math.PI / 2).scale(r.x, 0.2, r.z), flat(HIDE.dark), cap, 0, -0.012, 0);
  const out = 1.03, arc = 1.25;
  stitches(cap, t => { const a = (t * 2 - 1) * arc; return new THREE.Vector3(Math.sin(a) * r.x * out, Math.cos(a) * r.y * out, 0); }, 9, stitch);
  stitches(cap, t => { const a = (t * 2 - 1) * arc; return new THREE.Vector3(0, Math.cos(a) * r.y * out, Math.sin(a) * r.z * out); }, 9, stitch);
  return cap;
}

/** The torso in miner.glb: an octagonal prism, its half widths (x, z) from `waist` at y 0 to `chest` at y 0.6. The
 *  octagon's corners, going round from his front right; its front face (the last to first) is left open. */
const TORSO = { waist: [0.133, 0.185], chest: [0.166, 0.231], top: 0.6 } as const;
const OCTAGON = [[1, 0.414], [0.414, 1], [-0.414, 1], [-1, 0.414], [-1, -0.414], [-0.414, -1], [0.414, -1], [1, -0.414]] as const;

/** The vest, in the hips bone's frame (the torso's): a sleeveless shell of hide a little bigger than the torso, open
 *  down the front where his tunic shows, laced across, stitched down both front edges. */
function hideVest(): THREE.Object3D {
  const vest = new THREE.Group();
  const grow = 1.1, bottom = 0.05, top = 0.54;
  const corner = (i: number, y: number) => {
    const t = y / TORSO.top, [cx, cz] = OCTAGON[i % OCTAGON.length]!;
    const hx = (TORSO.waist[0] + (TORSO.chest[0] - TORSO.waist[0]) * t) * grow, hz = (TORSO.waist[1] + (TORSO.chest[1] - TORSO.waist[1]) * t) * grow;
    return new THREE.Vector3(cx * hx, y, cz * hz);
  };
  const tris: number[] = [];
  for (let i = 0; i < OCTAGON.length - 1; i++) {           // every face but the front one
    const a = corner(i, bottom), b = corner(i + 1, bottom), c = corner(i + 1, top), d = corner(i, top);
    tris.push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...d.toArray());
  }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
  shell.computeVertexNormals();
  add(shell, flat(HIDE.leather, 0.95, THREE.DoubleSide), vest);
  const stitch = flat(HIDE.stitch), out = 1.02;
  // stitched down both front edges, and laced across the opening between them
  for (const i of [0, 7]) stitches(vest, t => corner(i, bottom + (top - bottom) * t).multiplyScalar(out).setY(bottom + (top - bottom) * t), 8, stitch);
  for (const y of [0.17, 0.29, 0.41]) {
    const l = corner(7, y), r = corner(0, y);
    add(new THREE.BoxGeometry(0.008, 0.008, r.z - l.z), stitch, vest, (l.x + r.x) / 2 + 0.004, y, 0);
  }
  // a darker hem round the bottom
  for (let i = 0; i < OCTAGON.length - 1; i++) {
    const a = corner(i, bottom + 0.012), b = corner(i + 1, bottom + 0.012), hem = add(new THREE.BoxGeometry(0.022, 0.026, a.distanceTo(b) + 0.01), flat(HIDE.dark), vest);
    hem.position.copy(a).add(b).multiplyScalar(0.5);
    hem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize());
  }
  return vest;
}

/** The shield, in the left forearm mesh's frame (the forearm runs from the elbow at (0, -0.28, -0.23) to the wrist at
 *  (0, -0.5, -0.16); his left, the outside of the arm, is -z; his front +x): a round shield of hide on a wooden rim,
 *  strapped to the outside of the forearm, turned a little to the front, with a boss and stitches round the edge. */
function hideShield(): THREE.Object3D {
  const shield = new THREE.Group(); shield.position.set(0.0, -0.4, -0.275);
  shield.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.5, -0.2, -1).normalize());
  const radius = 0.2, thick = 0.035;
  add(new THREE.CylinderGeometry(radius, radius, thick, 10), flat(HIDE.leather), shield);
  add(new THREE.TorusGeometry(radius, 0.022, 4, 14).rotateX(Math.PI / 2), flat(HIDE.wood), shield);
  add(new THREE.SphereGeometry(0.055, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), flat(HIDE.dark), shield, 0, thick / 2, 0);
  stitches(shield, t => new THREE.Vector3(Math.cos(t * Math.PI * 2) * radius * 0.78, thick / 2 + 0.003, Math.sin(t * Math.PI * 2) * radius * 0.78), 14, flat(HIDE.stitch), 0.03);
  return shield;
}

/** Each piece: the bone it is worn on, the mesh whose frame it is drawn in if not the bone's own, and how it is built. */
export const ARMOUR_MODELS: Record<ArmourId, { bone: string; frame?: string; build: () => THREE.Object3D }> = {
  hide_cap: { bone: 'head', build: hideCap },
  hide_vest: { bone: 'hips', build: hideVest },
  hide_shield: { bone: 'fore_l', frame: 'forearm_l', build: hideShield },
};

/** What wearGear puts on him from what he wears (GameState.equipment, given by the view): every piece but his weapon,
 *  which the view draws as a tool, in his hands or on his back. */
export const armourWorn = (equipment: Readonly<Record<Slot, GearId | null>>): GearId[] =>
  SLOTS.flatMap(s => { const id = equipment[s]; return s !== 'weapon' && id ? [id] : []; });

/** Show the pieces in `worn` on `character` (miner.glb's Miner, or a copy) and hide the rest. Cheap to call every
 *  frame: a piece is built, merged and put on its bone the first time it is worn, after that only shown or hidden. */
export function wearGear(character: THREE.Object3D, worn: Iterable<string>): void {
  const want = new Set(worn);
  for (const [id, piece] of Object.entries(ARMOUR_MODELS)) {
    let held = character.getObjectByName(`gear:${id}`);
    if (!want.has(id)) { if (held) held.visible = false; continue; }
    if (!held) {
      const bone = character.getObjectByName(piece.bone), frame = piece.frame ? character.getObjectByName(piece.frame) : bone;
      if (!bone || !frame) throw new Error(`the character has no ${piece.frame ?? piece.bone}`);
      held = new THREE.Group(); held.name = `gear:${id}`;
      if (frame !== bone) { held.position.copy(frame.position); held.quaternion.copy(frame.quaternion); held.scale.copy(frame.scale); }
      held.add(mergeByMaterial(piece.build()));          // rigid on its bone: one mesh per colour
      bone.add(held);
    }
    held.visible = true;
  }
}
