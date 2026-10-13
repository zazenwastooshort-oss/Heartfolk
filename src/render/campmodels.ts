// The camp's buildings as they go up (the camp build, 13 Oct 2026: "as you build you see it progress into that
// structure"), drawn in code from simple solids in the game's flat-shaded look, each step at each of its stages
// (data/building.ts CARPENTRY: footings, frame, half built, built): the campfire, the firewood pile, the tent (from
// village.glb's CampfireCold, Plank and Tent), the storage chest and the training dummy; and the upgrades the owner
// picked from the design pictures (docs/designs/, 13 Oct 2026: "i like the wall tent and the log cabin for the rest
// are good upgrades (minus the storage chest visual)"), brought in from wt/designs/designs/models.ts with each part
// given the stage it goes up in: the wall tent (squared timber round the old canvas, a raised plank floor, a porch,
// guy ropes, a stovepipe), the log cabin (round notched logs, a loft window, a stone chimney, a covered porch), the
// stone hearth (a raised ring of stones, a spit with fish, log seats) and the woodshed (a bark roof over the logs
// stacked end on, a chopping block; its axe left out, since tools are kept in the chest). Stakes with a string
// between them stand round a step's footprint while its footings and frame go up. A new step's footings and frame
// keep clear of the step before it, which stands inside them until the new one is half built (D6; the tests check).
// Also the marker that shows where something is to be built (D1: stakes, a string and a cloth flag; for the chest, a
// square chalked on the shelter's floor) and his mallet (D11). Each step's own frame: +z is its front (door, porch),
// which faces the fire; it stands on the ground at its middle. render/structures.ts places, shows and merges them.
import * as THREE from 'three';
import { flat, mergeByMaterial } from './parts';
import { CARPENTRY, MARKER, type Shape } from '../data/building';
import { WOODPILE } from '../data/fire';
import type { MakeId } from '../data/making';

/** village.glb's models by name (render/structures.ts hands them in once the file is loaded). */
export type Protos = (name: string) => THREE.Object3D;

/** One stage of a step, part by part, before merging: what never moves apart (`fixed`), the guy ropes and stakes (or
 *  the tent's pegs) that go once the next step is begun (D6), logs that come and go with the firewood count (bottom
 *  row first), the fish roasting on the hearth's spit (hidden while his own cooks there, D20), and what wobbles when
 *  struck (the training dummy, leaning from its foot). */
export interface StageParts { fixed: THREE.Object3D[]; guys: THREE.Object3D[]; logs: THREE.Object3D[]; fish: THREE.Object3D[]; sway: THREE.Object3D[] }

/** The palette: the game's warm woods, cream canvas and greys (the designs' colours). */
const C = {
  log: '#a87c4c', logLight: '#b98f5c', logEnd: '#e2c48e', wood: '#8a6440', woodDark: '#6f5034', timber: '#5b4130',
  plank: '#c09463', plankDark: '#a27a50', bark: '#6e4c31', barkLight: '#84603f', rope: '#d2bb86', clay: '#b0663f',
  claySoft: '#c27a52', stone: '#8f897f', stoneLight: '#a7a094', stoneDark: '#77726a', tarp: '#d8c39a', tarpDark: '#bba57c',
  dark: '#3a2a1f', ash: '#4a423b', roast: '#b97a45', stake: '#6e4f33', string: '#efe2c2', chalk: '#f4efe2', flag: '#c8643c',
};

type V3 = [number, number, number];
const mat = (c: string, side: THREE.Side = THREE.FrontSide) => flat(c, 0.92, side);
const vec = (a: V3) => new THREE.Vector3(...a);

/** A box w x h x d of colour c, its middle at (x, y, z), turned ry round the vertical. */
function box(w: number, h: number, d: number, c: string, x: number, y: number, z: number, ry = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); m.rotation.y = ry; return m;
}

/** A round pole or log of radius r from a to b. */
function pole(r: number, c: string, a: V3, b: V3, sides = 6): THREE.Mesh {
  const va = vec(a), vb = vec(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, va.distanceTo(vb), sides), mat(c));
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize());
  return m;
}

/** A squared beam s x s from a to b. */
function beam(s: number, c: string, a: V3, b: V3): THREE.Mesh {
  const va = vec(a), vb = vec(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(s, va.distanceTo(vb), s), mat(c));
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize());
  return m;
}

/** A flat slab t thick: a rectangle from corner p0 along edges u and v (square to each other), its thickness on the
 *  upper side (a roof's boards sit on its rafters). */
function panel(c: string, p0: V3, u: V3, v: V3, t: number): THREE.Mesh {
  const U = vec(u), W = vec(v), ex = U.clone().normalize(), ez = new THREE.Vector3().crossVectors(U, W).normalize();
  if (ez.y < 0) { ez.negate(); ex.negate(); }
  const ey = new THREE.Vector3().crossVectors(ez, ex);
  const m = new THREE.Mesh(new THREE.BoxGeometry(U.length(), W.length(), t), mat(c));
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez));
  m.position.copy(vec(p0)).addScaledVector(U, 0.5).addScaledVector(W, 0.5).addScaledVector(ez, t / 2);
  return m;
}

/** A flat outline (x, y points) t thick, standing across the front (in the x-y plane) at depth z. */
function front(c: string, pts: [number, number][], z: number, t: number): THREE.Mesh {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false }).translate(0, 0, -t / 2), mat(c));
  m.position.z = z; return m;
}

/** A stone: a squashed, turned dodecahedron (or a cheaper icosahedron when small). */
function rock(r: number, c: string, x: number, y: number, z: number, squash = 0.7, turn = 0): THREE.Mesh {
  const g = r > 0.13 ? new THREE.DodecahedronGeometry(r, 0) : new THREE.IcosahedronGeometry(r, 0);
  const m = new THREE.Mesh(g, mat(c)); m.scale.set(1, squash, 0.88); m.rotation.set(turn * 0.6, turn, turn * 0.25); m.position.set(x, y, z);
  return m;
}

/** Logs laid along x at height y and depth z from x0 to x1, broken where a gap [a, b, y0, y1] spans that height. */
function logRunX(out: THREE.Object3D[], r: number, c: string, y: number, z: number, x0: number, x1: number, gaps: [number, number, number, number][] = []) {
  let from = x0;
  for (const [a, b] of gaps.filter(g => y > g[2] && y < g[3]).sort((p, q) => p[0] - q[0])) {
    if (a > from) out.push(pole(r, c, [from, y, z], [a, y, z]));
    from = b;
  }
  if (x1 > from) out.push(pole(r, c, [from, y, z], [x1, y, z]));
}
function logRunZ(out: THREE.Object3D[], r: number, c: string, y: number, x: number, z0: number, z1: number, gaps: [number, number, number, number][] = []) {
  let from = z0;
  for (const [a, b] of gaps.filter(g => y > g[2] && y < g[3]).sort((p, q) => p[0] - q[0])) {
    if (a > from) out.push(pole(r, c, [x, y, from], [x, y, a]));
    from = b;
  }
  if (z1 > from) out.push(pole(r, c, [x, y, from], [x, y, z1]));
}

/** A shutter or flap: a board w x h hinged on its edge at `at`, swung open by `open` radians round the vertical. */
function shutter(w: number, h: number, c: string, at: V3, open: number): THREE.Object3D {
  const pivot = new THREE.Group(); pivot.position.set(...at); pivot.rotation.y = open;
  pivot.add(box(w, h, 0.04, c, w / 2, 0, 0.02));
  return pivot;
}

/** A clay pot (a squat jar). */
function pot(r: number, h: number, c: string, x: number, y: number, z: number): THREE.Mesh {
  const pts = [[0, 0], [r * 0.7, 0], [r, h * 0.35], [r * 0.9, h * 0.8], [r * 0.6, h], [r * 0.68, h * 1.06], [0, h * 1.06]].map(([a, b]) => new THREE.Vector2(a, b));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 7), mat(c)); m.position.set(x, y, z); return m;
}

/** A small fish: a body and a tail, nose along +x. */
function fishModel(c: string, x: number, y: number, z: number, turn = 0): THREE.Object3D {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), mat(c)); body.scale.set(1.25, 0.5, 0.32);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.1, 4), mat(c)); tail.rotation.z = -Math.PI / 2; tail.position.x = -0.15; tail.scale.z = 0.3;
  g.add(body, tail); g.position.set(x, y, z); g.rotation.y = turn;
  return g;
}

/** A doorway: a dark opening (the shade inside) w x h on a wall face at depth z, from the ground at y0. */
const doorway = (w: number, h: number, y0: number, z: number) => box(w, h, 0.03, C.dark, 0, y0 + h / 2, z);

/** The box round all of a shape's blocks, in its own frame: [x0, x1, z0, z1]. */
export function boundsOf(shape: Shape): [number, number, number, number] {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const b of shape.blocks) {
    const [a0, a1, c0, c1] = 'box' in b ? b.box : [b.ring[0] - b.ring[2], b.ring[0] + b.ring[2], b.ring[1] - b.ring[2], b.ring[1] + b.ring[2]];
    x0 = Math.min(x0, a0); x1 = Math.max(x1, a1); z0 = Math.min(z0, c0); z1 = Math.max(z1, c1);
  }
  return [x0, x1, z0, z1];
}

/** Stakes `high` metres high at the corners of a shape's footprint with a string tied between them, `string` up. */
function stakesRound(shape: Shape, high: number, string = 0.22): THREE.Object3D[] {
  const [x0, x1, z0, z1] = boundsOf(shape), out: THREE.Object3D[] = [], w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] as const) out.push(box(0.045, high, 0.045, C.stake, x, high / 2, z));
  out.push(box(w, 0.012, 0.012, C.string, cx, string, z0), box(w, 0.012, 0.012, C.string, cx, string, z1));
  out.push(box(0.012, 0.012, d, C.string, x0, string, cz), box(0.012, 0.012, d, C.string, x1, string, cz));
  return out;
}

/** The parts of a step, each with the stages it shows at (from `from` to `to`, CARPENTRY.stages being built), and what
 *  kind of part it is. */
class Stages {
  private all: { from: number; to: number; kind: keyof StageParts; part: THREE.Object3D }[] = [];
  /** fixed parts from stage `from` on */
  add(from: number, ...parts: THREE.Object3D[]): void { this.put(from, CARPENTRY.stages, 'fixed', parts); }
  /** fixed parts from stage `from` to stage `to` only */
  only(from: number, to: number, ...parts: THREE.Object3D[]): void { this.put(from, to, 'fixed', parts); }
  put(from: number, to: number, kind: keyof StageParts, parts: THREE.Object3D[]): void { for (const part of parts) this.all.push({ from, to, kind, part }); }
  at(stage: number): StageParts {
    const out: StageParts = { fixed: [], guys: [], logs: [], fish: [], sway: [] };
    for (const p of this.all) if (stage >= p.from && stage <= p.to) out[p.kind].push(p.part);
    return out;
  }
}

/** The stakes and string round a step's footprint while its footings and frame go up. */
const footings = (s: Stages, shape: Shape) => s.only(0, 1, ...stakesRound(shape, 0.36));

/** A copy of one of village.glb's models (or a part of it, by name), its parts given the shared flat materials' look
 *  kept (their own materials, cloned with it). */
const copy = (P: Protos, name: string, part?: string): THREE.Object3D => {
  const o = P(name);
  const got = part ? o.getObjectByName(part) : o;
  if (!got) throw new Error(`village.glb's ${name} has no ${part}`);
  return got.clone(true);
};

/** Only the triangles of `mesh` whose middle `keep` holds (half of the tent's canvas, thrown over one side). */
function trimmed(mesh: THREE.Mesh, keep: (x: number, y: number, z: number) => boolean): THREE.Mesh {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  const pos = g.getAttribute('position'), kept: number[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    if (keep(x, y, z)) for (let k = 0; k < 3; k++) kept.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
  }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(kept, 3)); out.computeVertexNormals();
  const m = new THREE.Mesh(out, mesh.material); m.position.copy(mesh.position); m.quaternion.copy(mesh.quaternion); m.scale.copy(mesh.scale);
  return m;
}

// ---------------------------------------------------------------------------------------------------------------------
// The camp's first five.

/** The campfire: the cold campfire's ash and ring of stones laid out (four, then all nine), then planks leaned together
 *  over the ash (the fire burns the planks it was built with); the flames are the view's, shared with the stone hearth. */
function campfire(s: Stages, P: Protos, shape: Shape): void {
  footings(s, shape);
  const ring = copy(P, 'CampfireCold'), parts = ring.children.filter(o => !/^log/i.test(o.name));
  parts.forEach((o, i) => s.add(/^ash/i.test(o.name) || i % 2 ? 0 : 1, o.clone(true)));
  for (let i = 0; i < 3; i++) {
    const turn = new THREE.Group(), plank = copy(P, 'Plank');
    turn.rotation.y = i / 3 * Math.PI * 2 + 0.4;
    plank.scale.setScalar(0.72); plank.rotation.z = 2.1; plank.position.set(0.165, 0.285, 0);
    turn.add(plank); s.add(i < 2 ? 2 : 3, turn);
  }
}

/** The firewood pile's look: logs lying across two bearers (along its depth, +z faces the fire), in rows that step in
 *  as they go up, WOODPILE.max of them; while it goes up a few of the logs he brought, once built as many as it holds. */
const PILE = { w: 1.2, len: 0.56, r: 0.055, bark: ['#b9b2a3', '#a8a091', '#c4bdae'], bearer: '#6e4f33', rising: [0, 4, 8] };

/** The pile's logs, bottom row first. */
function pileLogs(): THREE.Object3D[] {
  const logs: THREE.Object3D[] = [], across = Math.floor(PILE.w / (PILE.r * 2.05));
  for (let row = 0; logs.length < WOODPILE.max; row++) {
    const n = across - row;
    if (n <= 0) break;
    for (let i = 0; i < n && logs.length < WOODPILE.max; i++) {
      const m = pole(PILE.r, PILE.bark[(row * 3 + i) % PILE.bark.length]!, [0, 0, -PILE.len / 2], [0, 0, PILE.len / 2], 7);
      m.position.set((i - (n - 1) / 2) * PILE.r * 2.05, 0.06 + PILE.r + row * PILE.r * 1.75, 0);
      m.rotation.z = ((row + i) % 3 - 1) * 0.05;
      logs.push(m);
    }
  }
  return logs;
}

function woodpile(s: Stages, shape: Shape): void {
  footings(s, shape);
  for (const x of [-0.4, 0.4]) s.add(0, box(0.08, 0.06, PILE.len + 0.08, PILE.bearer, x, 0.03, 0));
  // while it goes up, the first few logs; built, as many as it holds
  for (const stage of [1, 2]) s.only(stage, stage, ...pileLogs().slice(0, PILE.rising[stage]));
  s.put(CARPENTRY.stages, CARPENTRY.stages, 'logs', pileLogs());
}

/** The tent (the shelter): pegs and the floor's planks stacked ready at the front, then the poles and ridge with the
 *  planks laid for a floor, then the tarp thrown over one side, then village.glb's Tent pegged out whole, its front
 *  open (In 8: the chest is seen just inside it): the canvas's front and its door flap left out, the flaps rolled up
 *  and tied at the sides instead. The pegs go once the wall tent is begun round it (D6). */
function shelter(s: Stages, P: Protos, shape: Shape): void {
  footings(s, shape);
  const tent = copy(P, 'Tent'), part = (re: RegExp) => tent.children.filter(o => re.test(o.name));
  s.put(0, CARPENTRY.stages, 'guys', part(/^peg/i).map(o => o.clone(true)));
  // the planks stacked across the front of where the floor goes, where his mallet comes down from the door
  for (let i = 0; i < 3; i++) {
    const plank = copy(P, 'Plank'); plank.position.set(-0.04 + (i % 2) * 0.05, 0.016 + i * 0.066, 0.97 - (i % 2) * 0.03); plank.rotation.y = (i - 1) * 0.06;
    s.only(0, 0, plank);
  }
  s.add(1, ...part(/^(pole|ridge)/i).map(o => o.clone(true)));
  // the planks for a floor, along its length (the chest stands on them, SHAPES' floor)
  for (let i = 0; i < 4; i++) {
    const plank = copy(P, 'Plank'); plank.rotation.y = Math.PI / 2; plank.scale.set(2.05, 1, 1); plank.position.set(-0.57 + i * 0.38, 0, 0.1);
    s.add(1, plank);
  }
  // the canvas without its front (the triangle across the door, z 1.2): over one side, then all of it
  const back = (z: number) => z < 1.1;
  for (const canvas of part(/^canvas/i) as THREE.Mesh[]) {
    s.only(2, 2, trimmed(canvas, (x, _y, z) => x < 0.02 && back(z)));
    s.add(3, trimmed(canvas, (_x, _y, z) => back(z)));
  }
  // the front's flaps rolled up along its edges and tied, either side of the doorway
  for (const sx of [-1, 1]) {
    const foot: V3 = [sx * 0.9, 0.04, 1.23], top: V3 = [sx * 0.07, 1.36, 1.23];
    const at = (k: number): V3 => [foot[0] + (top[0] - foot[0]) * k, foot[1] + (top[1] - foot[1]) * k, foot[2]];
    s.add(3, pole(0.05, C.tarpDark, foot, top, 6));
    for (const k of [0.3, 0.62]) s.add(3, pole(0.058, C.rope, at(k - 0.02), at(k + 0.02), 6));
  }
}

/** The storage chest's look (0.0.19): a box of split-log boards under a lid, two copper straps over it and a copper
 *  latch at the front (+z, out of the shelter's door), in metres. Side by side, each side board by board, so what he
 *  works on is at its full height from the start (his mallet lands on it from the door, all but upright, his head
 *  outside the tent): the bottom and the two ends, then the back, then the front, then the lid and the copper. */
const CHEST = { w: 0.9, d: 0.56, boards: 3, board: 0.14, side: 0.045, lid: 0.12, wood: ['#80583a', '#73502f'], lidWood: '#644428', copper: '#e8904e' };

function chest(s: Stages): void {
  const metal = new THREE.MeshStandardMaterial({ color: CHEST.copper, roughness: 0.5, metalness: 0.25, flatShading: true });
  const body = CHEST.boards * CHEST.board, high = body + CHEST.lid, t = CHEST.side, wood = (i: number) => CHEST.wood[i % CHEST.wood.length]!;
  s.add(0, box(CHEST.w - 2 * t, t, CHEST.d - 2 * t, wood(1), 0, t / 2, 0));
  for (let i = 0; i < CHEST.boards; i++) {
    const y = CHEST.board * (i + 0.5);
    for (const sx of [-1, 1]) s.add(0, box(t, CHEST.board, CHEST.d, wood(i + 1), sx * (CHEST.w - t) / 2, y, 0));
    s.add(1, box(CHEST.w - 2 * t, CHEST.board, t, wood(i), 0, y, -(CHEST.d - t) / 2));
    s.add(2, box(CHEST.w - 2 * t, CHEST.board, t, wood(i), 0, y, (CHEST.d - t) / 2));
  }
  s.add(3, box(CHEST.w + 0.04, CHEST.lid, CHEST.d + 0.04, CHEST.lidWood, 0, body + CHEST.lid / 2, 0));
  for (const x of [-0.29, 0.29]) { const strap = box(0.08, high + 0.016, CHEST.d + 0.07, C.log, x, (high + 0.016) / 2, 0); strap.material = metal; s.add(3, strap); }
  const latch = box(0.12, 0.13, 0.03, C.log, 0, body, CHEST.d / 2 + 0.04); latch.material = metal; s.add(3, latch);
  // the square chalked on the floor where it goes, under it while it goes up
  s.only(0, 2, ...chalkSquare());
}

/** The training dummy's look (0.0.22), in metres: a post on two crossed feet, crossbar arms wrapped at the ends, a
 *  stuffed sack for a body (where the swing lands: STRIKE in data/combat.ts meets it at about 0.9 m up) and a small
 *  sack for a head, tied with rope. Its arms run across the way it faces. Feet, then the post, then the arms and the
 *  body, then the head and the ties; built, everything above its feet wobbles when struck. */
const DUMMY_LOOK = { wood: '#7a5b3c', feet: '#6a4b31', sack: '#c9ab7c', head: '#d4bb8f', rope: '#7d6440', post: 1.48, arms: 1.2, span: 0.84 };

function dummy(s: Stages, shape: Shape): void {
  footings(s, shape);
  const L = DUMMY_LOOK;
  for (const [w, d] of [[0.62, 0.09], [0.09, 0.62]] as const) s.add(0, box(w, 0.06, d, L.feet, 0, 0.03, 0));
  const upper = (): THREE.Object3D[][] => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, L.post, 7), mat(L.wood)); post.position.y = L.post / 2;
    const body = new THREE.Mesh(new THREE.LatheGeometry([0.12, 0.2, 0.225, 0.23, 0.215, 0.18, 0.1, 0.04].map((r, i) => new THREE.Vector2(r, i * 0.082)), 8), mat(L.sack));
    body.position.y = 0.62;
    const tie = (r: number, y: number) => { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.014, 4, 10), mat(L.rope)); t.rotation.x = Math.PI / 2; t.position.y = y; return t; };
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.115, 1), mat(L.head)); head.position.y = 1.36; head.scale.y = 1.1;
    const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, L.span, 6), mat(L.wood)); arms.rotation.z = Math.PI / 2; arms.position.y = L.arms;
    const wraps = [-1, 1].map(x => { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.13, 7), mat(L.sack)); w.rotation.z = Math.PI / 2; w.position.set(x * (L.span / 2 - 0.07), L.arms, 0); return w; });
    return [[post], [arms, body], [tie(0.163, 0.66), tie(0.232, 0.9), head, tie(0.06, 1.245), ...wraps]];
  };
  const [p1, p2] = upper();
  s.only(1, 2, ...p1!); s.only(2, 2, ...p2!);
  s.put(3, 3, 'sway', upper().flat());
}

// ---------------------------------------------------------------------------------------------------------------------
// The upgrades (wt/designs/designs/models.ts, the owner's picks).

/** C1, the wall tent (2.8 x 3.9, 2.9 high): the tarp over a squared timber frame with upright canvas walls, on a raised
 *  plank floor, the roof run on out front over a porch, guy ropes, flaps tied back, and a clay stovepipe. Footings:
 *  sleepers along its sides; frame: the timbers, standing outside the old tent (which stands inside it until this one
 *  is half built); half built: the floor, the side and back walls and one side of the roof; built: the front round the
 *  doorway, the flaps, the rest of the roof, the guy ropes, the stovepipe and the porch's crate. The design's stump on
 *  the porch is left out: the chest stands there (SHAPES' chest). */
function wallTent(s: Stages, shape: Shape): void {
  footings(s, shape);
  const y0 = 0.16, X = 1.2, zb = -1.45, zf = 1.45, eave = 1.42, ridge = 2.45, zp = 2.25;
  // footings: sleepers along its sides, clear of the old tent
  for (const x of [-1.12, 1.12]) s.add(0, box(0.1, 0.08, zp - zb + 0.25, C.timber, x, 0.04, (zb + zp) / 2));
  // frame: the squared timbers, posts from the ground (the floor goes round them later), eave plates, ridge posts and
  // beam, the porch's rafters
  for (const z of [zb - 0.05, zf + 0.05, zp]) for (const sx of [-1, 1]) s.add(1, box(0.1, eave, 0.1, C.timber, sx * (X + 0.06), eave / 2, z));
  for (const sx of [-1, 1]) s.add(1, box(0.1, 0.1, zp - zb + 0.2, C.timber, sx * (X + 0.06), eave + 0.02, (zb + zp) / 2));
  for (const z of [zb - 0.1, zp]) s.add(1, box(0.1, ridge + 0.02, 0.1, C.timber, 0, (ridge + 0.02) / 2, z));
  s.add(1, box(0.11, 0.11, zp - zb + 0.3, C.timber, 0, ridge + 0.04, (zb + zp) / 2));
  for (const sx of [-1, 1]) s.add(1, beam(0.08, C.timber, [sx * (X + 0.06), eave + 0.04, zp], [0, ridge + 0.02, zp]));
  // half built: the plank floor, the canvas walls at the sides and the back, one side of the roof
  for (let i = 0; i < 5; i++) s.add(2, box(0.55, y0, zp - zb + 0.25, i % 2 ? C.plank : C.plankDark, -1.12 + i * 0.56, y0 / 2, (zb + zp) / 2));
  for (const sx of [-1, 1]) s.add(2, box(0.04, eave - y0, zf - zb, C.tarp, sx * X, (eave + y0) / 2, (zb + zf) / 2));
  s.add(2, front(C.tarp, [[-X, y0], [X, y0], [X, eave], [0, ridge], [-X, eave]], zb, 0.04));
  const roof = (sx: number) => [
    panel(C.tarp, [sx * (X + 0.14), eave - 0.1, zb - 0.15], [0, 0, zp - zb + 0.3], [-sx * (X + 0.14), ridge - eave + 0.12, 0], 0.04),
    box(0.05, 0.14, zp - zb + 0.3, C.tarpDark, sx * (X + 0.15), eave - 0.15, (zb + zp) / 2),
  ];
  s.add(2, ...roof(-1));
  // built: the front round the doorway, the flaps tied back, the other side of the roof, the guy ropes to their stakes,
  // the stovepipe through the roof at the back, a crate for a table and a pot under the porch
  const dw = 0.46, dh = 1.62;
  s.add(3, front(C.tarp, [[-X, y0], [-dw, y0], [-dw, dh], [dw, dh], [dw, y0], [X, y0], [X, eave], [0, ridge], [-X, eave]], zf, 0.04));
  s.add(3, box(2 * dw, dh - y0, 0.02, C.dark, 0, (dh + y0) / 2, zf - 0.05));
  for (const sx of [-1, 1]) {
    const flap = new THREE.Group(); flap.position.set(sx * dw, y0, zf + 0.02); flap.rotation.y = -sx * 0.9;
    flap.add(box(0.26, dh - y0 - 0.05, 0.05, C.tarpDark, sx * 0.13, (dh - y0) / 2, 0), box(0.28, 0.05, 0.08, C.rope, sx * 0.13, 0.75, 0));
    s.add(3, flap);
  }
  s.add(3, ...roof(1));
  for (const sx of [-1, 1]) for (const z of [-1.0, 0.1, 1.2]) {
    s.put(3, 3, 'guys', [pole(0.01, C.rope, [sx * (X + 0.2), eave - 0.08, z], [sx * 1.75, 0.08, z], 4), box(0.05, 0.16, 0.05, C.woodDark, sx * 1.75, 0.08, z)]);
  }
  s.add(3, pole(0.085, C.clay, [0.62, 1.7, -0.75], [0.62, 2.82, -0.75], 7), pole(0.12, C.claySoft, [0.62, 2.78, -0.75], [0.62, 2.9, -0.75], 7));
  s.add(3, box(0.5, 0.42, 0.42, C.plankDark, 0.62, y0 + 0.21, 1.9), box(0.52, 0.05, 0.44, C.plank, 0.62, y0 + 0.43, 1.9));
  s.add(3, pot(0.07, 0.16, C.clay, 0.5, y0 + 0.45, 1.85));
}

/** A2, the log cabin (4.6 x 4.4, 4.0 high to the chimney): walls of round logs notched at the corners with their ends
 *  showing, a steep bark roof with a gable to the front and a loft window in it (and a hoist beam), a plank door, a
 *  porch across the front, and on its left side (-x) a shuttered window and a stone chimney. Footings: the corner
 *  stones; frame: the side walls' lower courses, the chimney's base and the porch posts, all clear of the wall tent
 *  standing inside until this is half built; half built: every wall up round the door, the porch's floor and beam, the
 *  chimney's stack half up; built: the roof, the gables and the loft window, the door, the side window, the porch roof
 *  and its bench, the chimney's top. The design's logs on the porch are left out: the chest stands there. */
function logCabin(s: Stages, shape: Shape): void {
  footings(s, shape);
  const X = 1.7, Z = 1.4, r = 0.16, step = 0.32, courses = 6, over = 0.24, doorW = 0.44, doorTop = 1.62, low = 3;
  const doorGap: [number, number, number, number][] = [[-doorW, doorW, 0, doorTop]];
  const winGap: [number, number, number, number][] = [[0.3, 1.0, 0.7, 1.45]];
  for (const [x, z] of [[-X, -Z], [X, -Z], [X, Z], [-X, Z]] as const) s.add(0, rock(0.2, C.stone, x, 0.02, z, 0.55, x + z));
  for (let i = 0; i < courses; i++) {
    const yf = r + i * step, ys = yf + step / 2, c = i % 2 ? C.log : C.logLight, c2 = i % 2 ? C.logLight : C.log;
    const sides: THREE.Object3D[] = [], ends: THREE.Object3D[] = [];
    logRunX(ends, r, c, yf, Z, -X - over, X + over, doorGap);
    logRunX(ends, r, c, yf, -Z, -X - over, X + over);
    logRunZ(sides, r, c2, ys, -X, -Z - over, Z + over, winGap);
    logRunZ(sides, r, c2, ys, X, -Z - over, Z + over);
    s.add(i < low ? 1 : 2, ...sides); s.add(2, ...ends);
  }
  const wallTop = r + (courses - 1) * step + step / 2 + r;
  // the roof: steep, gable to the front, bark slabs in overlapping rows, a ridge log
  const eaveX = X + 0.32, eaveY = wallTop - 0.08, ridge = 3.45, zb = -Z - 0.38, zf = Z + 0.42, rows = 3;
  for (const sx of [-1, 1]) for (let k = 0; k < rows; k++) {
    const a = k / rows, b = (k + 1) / rows + 0.04;
    const p0: V3 = [sx * eaveX * (1 - a), eaveY + (ridge - eaveY) * a + 0.02 * k, zb];
    s.add(3, panel(k % 2 ? C.barkLight : C.bark, p0, [0, 0, zf - zb], [-sx * eaveX * (b - a), (ridge - eaveY) * (b - a), 0], 0.1));
  }
  s.add(3, pole(0.08, C.woodDark, [0, ridge + 0.1, zb - 0.05], [0, ridge + 0.1, zf + 0.05]));
  // the gables: boards, with the loft's window in the front one and a hoist beam over it
  const under = (x: number) => eaveY + (ridge - eaveY) * (1 - Math.abs(x) / eaveX) - 0.02;
  const gable: [number, number][] = [[-X, wallTop - step / 2 - 0.02], [X, wallTop - step / 2 - 0.02], [X, under(X)], [0, ridge - 0.03], [-X, under(X)]];
  s.add(3, front(C.plank, gable, Z, 0.1), front(C.plank, gable, -Z, 0.1));
  for (const x of [-1.05, 1.05]) s.add(3, box(0.07, under(x) - wallTop + step / 2, 0.04, C.plankDark, x, (under(x) + wallTop - step / 2) / 2, Z + 0.06));
  s.add(3, box(0.62, 0.56, 0.04, C.woodDark, 0, 2.52, Z + 0.06), box(0.5, 0.44, 0.04, C.dark, 0, 2.52, Z + 0.08));
  s.add(3, shutter(0.25, 0.44, C.plankDark, [0.25, 2.52, Z + 0.09], -1.1));
  s.add(3, pole(0.06, C.woodDark, [0, 3.0, Z - 0.1], [0, 3.0, Z + 0.62]), pole(0.012, C.rope, [0, 3.0, Z + 0.56], [0, 2.45, Z + 0.56]));
  // the door: planks with a Z brace, in a frame (the doorway's shade from half built on)
  s.add(2, doorway(2 * doorW, doorTop, 0, Z - 0.05));
  s.add(3, box(0.78, 1.5, 0.06, C.plankDark, 0, 0.76, Z + 0.02));
  s.add(3, box(0.78, 0.08, 0.04, C.wood, 0, 0.36, Z + 0.07), box(0.78, 0.08, 0.04, C.wood, 0, 1.2, Z + 0.07));
  s.add(3, beam(0.07, C.wood, [-0.32, 0.38, Z + 0.07], [0.32, 1.18, Z + 0.07]));
  for (const sx of [-1, 1]) s.add(2, box(0.1, doorTop + 0.05, 0.12, C.woodDark, sx * (doorW + 0.02), doorTop / 2, Z + 0.04));
  s.add(2, box(2 * doorW + 0.3, 0.12, 0.14, C.woodDark, 0, doorTop + 0.04, Z + 0.04));
  // the side window, shuttered open
  s.add(3, box(0.05, 0.64, 0.68, C.dark, -X - 0.06, 1.12, 0.65), box(0.14, 0.06, 0.82, C.woodDark, -X - 0.14, 0.8, 0.65));
  s.add(3, shutter(0.32, 0.6, C.plankDark, [-X - 0.17, 1.12, 0.99], -Math.PI / 2 - 0.5), shutter(0.32, 0.6, C.plankDark, [-X - 0.17, 1.12, 0.31], Math.PI / 2 + 0.5));
  // the porch: two posts (frame), a raised plank floor and the beam over it (half built), a lower bark roof and a bench
  const pz = Z + 1.12;
  for (const x of [-1.62, 1.62]) s.add(1, pole(0.075, C.log, [x, 0, pz - 0.12], [x, 1.56, pz - 0.12]));
  for (let i = 0; i < 3; i++) s.add(2, box(2 * X + 0.2, 0.1, 0.37, i % 2 ? C.plank : C.plankDark, 0, 0.13, Z + 0.21 + i * 0.37));
  s.add(2, pole(0.08, C.log, [-X - 0.1, 0.07, pz - 0.05], [X + 0.1, 0.07, pz - 0.05]));
  s.add(2, pole(0.07, C.woodDark, [-X - 0.12, 1.56, pz - 0.12], [X + 0.12, 1.56, pz - 0.12]));
  s.add(3, panel(C.barkLight, [-X - 0.22, 1.98, Z + 0.06], [2 * X + 0.44, 0, 0], [0, -0.44, pz - Z + 0.12], 0.08));
  s.add(3, pole(0.09, C.logLight, [-1.45, 0.48, Z + 0.32], [-0.62, 0.48, Z + 0.32]));
  for (const x of [-1.32, -0.75]) s.add(3, pole(0.1, C.wood, [x, 0.18, Z + 0.32], [x, 0.44, Z + 0.32]));
  // the stone chimney up the side wall (-x): a broad base (frame), a shoulder and the stack's lower half (half built),
  // the rest of the stack and its cap (built), in courses of stone
  const cz = -0.55, base = -X - 0.5, tones = [C.stone, C.stoneLight, C.stoneDark];
  for (let i = 0; i < 5; i++) s.add(1, box(0.72 + (i % 2) * 0.05, 0.3, 0.92 - (i % 3) * 0.04, tones[i % 3]!, base - (i % 2) * 0.02, 0.15 + i * 0.3, cz + ((i * 7) % 3 - 1) * 0.02));
  s.add(1, rock(0.16, C.stoneDark, base - 0.4, 0.06, cz + 0.42, 0.6, 1), rock(0.12, C.stone, base - 0.36, 0.05, cz - 0.5, 0.7, 2));
  s.add(2, box(0.6, 0.3, 0.74, C.stone, base + 0.04, 1.65, cz));
  for (let i = 0; i < 7; i++) s.add(i < 3 ? 2 : 3, box(0.46 + (i % 2) * 0.04, 0.32, 0.58 - (i % 3) * 0.03, tones[(i + 1) % 3]!, base + 0.08, 1.96 + i * 0.32, cz));
  s.add(3, box(0.6, 0.08, 0.72, C.stoneDark, base + 0.08, 4.12, cz));
}

/** The stone hearth (3.5 across with its seats; the hearth itself 1.5): a ring of big stones with a second course on
 *  top round an ash bed and a few logs, a spit on two forked posts with two fish roasting, a clay pot, two log seats
 *  and a stump stool round it. Footings: the big stones laid round the old campfire and the spit set up over it first
 *  (so he can cook there all along; render/cooking.ts); frame: the seats' stumps, the plain log and the stool; half
 *  built (the campfire's planks gone): the ash bed and its logs, the second course, the split log on its stumps;
 *  built: the fish on the spit and the pots. The flames are the view's, the campfire's. */
function stoneHearth(s: Stages, shape: Shape): void {
  footings(s, shape);
  const tones = [C.stone, C.stoneLight, C.stoneDark];
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; s.add(0, rock(0.19, tones[i % 3]!, Math.cos(a) * 0.66, 0.1, Math.sin(a) * 0.66, 0.72, i * 1.3)); }
  // the spit: two forked posts across the fire, a pole, a crank at one end
  for (const sx of [-1, 1]) {
    const x = sx * 0.95;
    s.add(0, pole(0.035, C.woodDark, [x, 0, 0], [x, 0.82, 0]));
    s.add(0, pole(0.025, C.woodDark, [x, 0.74, 0], [x - sx * 0.05, 0.98, 0.1]), pole(0.025, C.woodDark, [x, 0.74, 0], [x + sx * 0.03, 0.98, -0.1]));
  }
  s.add(0, pole(0.022, C.wood, [-1.12, 0.86, 0], [1.12, 0.86, 0]), pole(0.02, C.wood, [1.12, 0.86, 0], [1.12, 0.66, 0.04]));
  s.put(3, 3, 'fish', [fishModel(C.roast, -0.18, 0.86, 0, 0), fishModel(C.roast, 0.2, 0.86, 0, Math.PI)]);
  // the ash bed, a few logs over it, the second course of stones
  s.add(2, pole(0.5, C.ash, [0, 0, 0], [0, 0.05, 0], 9));
  for (let i = 0; i < 9; i++) { const a = (i + 0.5) / 9 * Math.PI * 2; s.add(2, rock(0.13, tones[(i + 1) % 3]!, Math.cos(a) * 0.6, 0.27, Math.sin(a) * 0.6, 0.75, i * 2.1)); }
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2 + 0.3;
    s.add(2, pole(0.05, C.log, [Math.cos(a) * 0.36, 0.05, Math.sin(a) * 0.36], [Math.cos(a) * 0.04, 0.42, Math.sin(a) * 0.04]));
  }
  s.add(3, pot(0.13, 0.26, C.clay, 0.42, 0.04, 0.82), pot(0.08, 0.17, C.claySoft, 0.62, 0.04, 0.95));
  // the seats: a log split flat on two short stumps behind, a plain log in front, a stump stool at the back right
  const seat = (a: number, rr: number, len: number, legs: boolean) => {
    const g = new THREE.Group(), top = new THREE.Group();
    g.rotation.y = -a + Math.PI / 2; g.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
    top.rotation.copy(g.rotation); top.position.copy(g.position);
    if (legs) {
      for (const x of [-len / 2 + 0.18, len / 2 - 0.18]) g.add(pole(0.12, C.wood, [x, 0, 0], [x, 0.24, 0], 7));
      top.add(pole(0.15, C.logLight, [-len / 2, 0.36, 0], [len / 2, 0.36, 0], 6), box(len - 0.04, 0.03, 0.22, C.logEnd, 0, 0.47, 0));
    } else g.add(pole(0.17, C.log, [-len / 2, 0.15, 0], [len / 2, 0.15, 0], 6));
    s.add(1, g); if (legs) s.add(2, top);
  };
  seat(-Math.PI / 2 - 0.12, 1.55, 1.5, true); seat(Math.PI / 2 + 0.35, 1.5, 1.2, false);
  const a = -0.55, sr = 1.45;
  s.add(1, pole(0.19, C.wood, [Math.cos(a) * sr, 0, Math.sin(a) * sr], [Math.cos(a) * sr, 0.42, Math.sin(a) * sr], 7), box(0.26, 0.02, 0.26, C.logEnd, Math.cos(a) * sr, 0.425, Math.sin(a) * sr));
}

/** The woodshed's logs, bottom row first: rows across, cut ends to the front, stepping in a little as they go up. */
function shedLogs(): THREE.Object3D[] {
  const logs: THREE.Object3D[] = [], Z = 0.42, r = 0.085, len = 2 * Z + 0.02, across = 7, barks = [C.log, C.logLight, C.wood];
  const endGeo = new THREE.CircleGeometry(r * 0.96, 6);
  for (let row = 0; logs.length < WOODPILE.max; row++) {
    const n = across - (row % 2);
    for (let i = 0; i < n && logs.length < WOODPILE.max; i++) {
      const log = new THREE.Group(); log.position.set((i - (n - 1) / 2) * r * 2.08, 0.07 + r + row * r * 1.78, 0);
      log.add(pole(r, barks[(row * 3 + i) % 3]!, [0, 0, -len / 2], [0, 0, len / 2], 6));
      const end = new THREE.Mesh(endGeo, mat(C.logEnd)); end.position.z = len / 2 + 0.002; end.rotation.z = Math.PI / 6; log.add(end);
      logs.push(log);
    }
  }
  return logs;
}

/** The woodshed (2.4 x 1.3, 1.65 high): four posts under a bark roof sloping to the back, slats across the back, the
 *  logs stacked on bearers with their cut ends to the front (as many as the firewood count, at most WOODPILE.max), and
 *  a chopping block. Footings: the chopping block and a few split pieces; frame: the posts, beams, back slats and
 *  bearers, round the old pile; half built: the logs moved in from the pile and half the roof; built: the whole roof. */
function woodshed(s: Stages, shape: Shape): void {
  footings(s, shape);
  const X = 0.68, Z = 0.42, hf = 1.38, hb = 1.08;
  s.add(0, pole(0.21, C.wood, [X + 0.5, 0, 0.3], [X + 0.5, 0.42, 0.3], 7), box(0.3, 0.02, 0.3, C.logEnd, X + 0.5, 0.425, 0.3));
  // (the split pieces clear of the chopping block and of the stake at its corner)
  for (const [x, z, t] of [[X + 0.35, 0.72, 0.4], [X + 0.68, 0.62, 0.72]] as const) s.add(0, box(0.4, 0.08, 0.1, C.logEnd, x, 0.04, z, t));
  for (const x of [-X, X]) s.add(1, pole(0.055, C.wood, [x, 0, Z], [x, hf, Z]), pole(0.055, C.wood, [x, 0, -Z], [x, hb, -Z]));
  s.add(1, pole(0.05, C.woodDark, [-X - 0.12, hf, Z], [X + 0.12, hf, Z]), pole(0.05, C.woodDark, [-X - 0.12, hb, -Z], [X + 0.12, hb, -Z]));
  for (const y of [0.32, 0.64, 0.94]) s.add(1, box(2 * X, 0.1, 0.04, C.plankDark, 0, y, -Z - 0.04));
  for (const x of [-0.45, 0.45]) s.add(1, box(0.09, 0.07, 2 * Z + 0.1, C.woodDark, x, 0.035, 0));
  const z0 = -Z - 0.25, z1 = Z + 0.28, rise = (hf - hb) / (2 * Z), y0 = hb + 0.05 + (z0 + Z) * rise, y1 = hf + 0.05 + (z1 - Z) * rise;
  s.add(2, panel(C.bark, [-X - 0.22, y0, z0], [X + 0.22, 0, 0], [0, y1 - y0, z1 - z0], 0.07));
  s.add(3, panel(C.barkLight, [0, y0, z0], [X + 0.22, 0, 0], [0, y1 - y0, z1 - z0], 0.07));
  s.put(2, 3, 'logs', shedLogs());
}

/** Every step's parts by stage. */
const STEPS: Partial<Record<MakeId, (s: Stages, P: Protos, shape: Shape) => void>> = {
  campfire, shelter,
  woodpile: (s, _P, shape) => woodpile(s, shape),
  chest: s => chest(s),
  dummy: (s, _P, shape) => dummy(s, shape),
  wall_tent: (s, _P, shape) => wallTent(s, shape),
  log_cabin: (s, _P, shape) => logCabin(s, shape),
  stone_hearth: (s, _P, shape) => stoneHearth(s, shape),
  woodshed: (s, _P, shape) => woodshed(s, shape),
};

/** `id` (a step built at the camp, data/building.ts SHAPES `shape`) at `stage` (0 footings .. CARPENTRY.stages built),
 *  part by part, in its own frame. */
export function stageParts(id: MakeId, stage: number, P: Protos, shape: Shape): StageParts {
  const s = new Stages();
  STEPS[id]!(s, P, shape);
  return s.at(stage);
}

// ---------------------------------------------------------------------------------------------------------------------
// The marker and the mallet.

/** A square chalked on the floor where the chest will stand (its footprint), with a cross in it. */
function chalkSquare(): THREE.Object3D[] {
  const w = CHEST.w, d = CHEST.d, t = 0.035, y = 0.004;
  const out = [box(w, 0.006, t, C.chalk, 0, y, -d / 2), box(w, 0.006, t, C.chalk, 0, y, d / 2), box(t, 0.006, d, C.chalk, -w / 2, y, 0), box(t, 0.006, d, C.chalk, w / 2, y, 0)];
  const diag = Math.hypot(w, d), a = Math.atan2(d, w);
  for (const turn of [a, -a]) out.push(box(diag - 0.1, 0.006, t * 0.8, C.chalk, 0, y, 0, turn));
  return out;
}

/** The marker where something is to be built (D1), in the first step's frame: stakes MARKER.stake high at the corners
 *  of its footprint with a string between them and a cloth flag on a stick MARKER.flag high at its front right corner;
 *  for the chest (`chalk`), the square chalked on the floor. `glint`: where its glint shows, over the flag, or for the
 *  chest just in front of the square, in the shelter's doorway, where it is seen past the canvas. */
export function markerModel(shape: Shape, chalk = false): { parts: THREE.Object3D[]; glint: THREE.Vector3 } {
  if (chalk) return { parts: chalkSquare(), glint: new THREE.Vector3(0, 0.35, CHEST.d / 2 + 0.2) };
  const [, x1, , z1] = boundsOf(shape), parts = stakesRound(shape, MARKER.stake);
  const fx = x1 + 0.08, fz = z1 + 0.08;
  parts.push(pole(0.016, C.stake, [fx, 0, fz], [fx, MARKER.flag, fz], 5));
  const cloth = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.24, -0.06), new THREE.Vector2(0, -0.15)]);
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(cloth), mat(C.flag, THREE.DoubleSide));
  flag.position.set(fx, MARKER.flag - 0.02, fz); flag.rotation.y = Math.PI / 4;
  parts.push(flag);
  return { parts, glint: new THREE.Vector3(fx, MARKER.flag + 0.08, fz) };
}

/** His mallet (D11), drawn on the tool bone in place of the pick (render/view.ts), in the bone's frame: a short handle
 *  down from his hands (at y -0.42 and -0.5) to a round wooden head across it at `at`, `len` long, its striking face
 *  (`face`) towards the pick's tip, so the Mine swing brings the face down CARPENTRY.reach in front of him, onto the
 *  face of what he builds (tests/arms.test.ts measures it on the real clip). */
const MALLET = { top: -0.38, at: -0.74, len: 0.26, r: 0.075, handle: 0.024, wood: '#8a6440', head: '#a87c4c', band: '#5b4130' };

export function malletModel(): { model: THREE.Group; face: THREE.Object3D } {
  const M = MALLET, parts = new THREE.Group();
  parts.add(pole(M.handle, M.wood, [0, M.top, 0], [0, M.at - M.r * 0.6, 0], 6));
  parts.add(pole(M.r, M.head, [-M.len / 2, M.at, 0], [M.len / 2, M.at, 0], 8));
  for (const x of [-M.len / 2 + 0.035, M.len / 2 - 0.035]) parts.add(pole(M.r + 0.008, M.band, [x - 0.015, M.at, 0], [x + 0.015, M.at, 0], 8));
  const model = mergeByMaterial(parts), face = new THREE.Object3D();
  face.position.set(-M.len / 2, M.at, 0); model.add(face);
  model.name = 'mallet';
  return { model, face };
}
