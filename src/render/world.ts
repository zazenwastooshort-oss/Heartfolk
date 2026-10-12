// The ground and the water, drawn from the layout: grass, dirt roads and lanes, the paved town square, worn patches
// by doors, rocks and trees, a sandy bank with shingle all round the water, stony ground at the foot of the camp's
// wall, grass tufts (kept off the bank, the scree and anything lying on the ground to pick up), and the water itself:
// the river and the camp's pool as one faceted sheet cut to the water's outline (world/water.ts, the shape walking
// uses too), gently moving. The river runs on past the detailed ground until the haze hides it, with a faceted sand
// bank of its own out there.
import * as THREE from 'three';
import type { Layout, NodeSpot, Vec2 } from '../world/layout';
import { doorOf } from '../world/layout';
import { BANK, waterOf } from '../world/water';
import { APRON, RUBBLE, wallFootZ } from '../world/falls';
import { RESOURCES } from '../data/skills';

const isRock = (n: NodeSpot) => RESOURCES[n.resource]!.model === 'Rock';

function seeded(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const smoothstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const VILLAGE_GROUND = { minX: -44, maxX: 50, minZ: -38, maxZ: 38 };   // the detailed ground, in metres, unless the layout says

function distToPolyline(p: Vec2, line: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]!, b = line[i + 1]!, ab = { x: b.x - a.x, z: b.z - a.z }, l2 = ab.x * ab.x + ab.z * ab.z;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.z - a.z) * ab.z) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + ab.x * t), p.z - (a.z + ab.z * t)));
  }
  return best;
}

export interface WorldView { ground: THREE.Object3D[]; update(t: number): void }

export function buildWorld(scene: THREE.Scene, layout: Layout): WorldView {
  const G = layout.ground ?? VILLAGE_GROUND;
  const W = G.maxX - G.minX, D = G.maxZ - G.minZ;
  const c = document.createElement('canvas'); c.width = 3072; c.height = Math.round(3072 * D / W);
  const g = c.getContext('2d')!, px = c.width / W, r = seeded(11), rs = seeded(23);
  const X = (x: number) => (x - G.minX) * px, Z = (z: number) => (z - G.minZ) * px;
  const water = waterOf(layout), falls = layout.falls;

  g.fillStyle = '#5ca04a'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 160000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(40,90,30,0.16)' : 'rgba(150,210,110,0.14)'; g.fillRect(r() * c.width, r() * c.height, 3, 3); }

  // the water's shape sampled every 25 cm round the water, for the bank, the shingle and the grass (quicker than asking
  // the shape itself for every pixel); away from the water it asks the shape
  const S = 0.25, wb = water.bounds, gx0 = Math.max(G.minX, wb.minX - BANK - 1), gz0 = Math.max(G.minZ, wb.minZ - BANK - 1);
  const gnx = Math.max(0, Math.ceil((Math.min(G.maxX, wb.maxX + BANK + 1) - gx0) / S) + 2);
  const gnz = Math.max(0, Math.ceil((Math.min(G.maxZ, wb.maxZ + BANK + 1) - gz0) / S) + 2);
  const near = new Float32Array(gnx * gnz);
  for (let j = 0; j < gnz; j++) for (let i = 0; i < gnx; i++) near[j * gnx + i] = water.edge({ x: gx0 + i * S, z: gz0 + j * S });
  const edgeAt = (x: number, z: number) => {
    const fx = (x - gx0) / S, fz = (z - gz0) / S, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= gnx - 1 || j >= gnz - 1) return water.edge({ x, z });
    const tx = fx - i, tz = fz - j, k = j * gnx + i;
    return (near[k]! * (1 - tx) + near[k + 1]! * tx) * (1 - tz) + (near[k + gnx]! * (1 - tx) + near[k + gnx + 1]! * tx) * tz;
  };

  // the bank: sand all round the water, darker and wet at the water's edge and under it, its outer edge ragged where it
  // gives way to the grass. One pass over the pixels near the water.
  if (gnx > 1 && gnz > 1) {
    const x0 = Math.max(0, Math.floor(X(gx0))), z0 = Math.max(0, Math.floor(Z(gz0)));
    const x1 = Math.min(c.width, Math.floor(X(gx0 + (gnx - 1) * S))), z1 = Math.min(c.height, Math.floor(Z(gz0 + (gnz - 1) * S)));
    if (x1 > x0 && z1 > z0) {
      const img = g.getImageData(x0, z0, x1 - x0, z1 - z0), d = img.data;
      for (let py = 0; py < z1 - z0; py++) for (let qx = 0; qx < x1 - x0; qx++) {
        const wx = G.minX + (x0 + qx + 0.5) / px, wz = G.minZ + (z0 + py + 0.5) / px, e = edgeAt(wx, wz);
        if (e > BANK + 0.7) continue;
        const ragged = BANK + 0.28 * (Math.sin(wx * 1.7 + Math.sin(wz * 0.9) * 2) * 0.6 + Math.sin(wz * 2.3 + wx * 0.4) * 0.4);
        const t = smoothstep(ragged + 0.3, ragged - 0.05, e);
        if (t <= 0) continue;
        const wet = smoothstep(0.5, -0.05, e), grain = (rs() - 0.5) * 22;
        const cr = 201 - 50 * wet + grain, cg = 180 - 42 * wet + grain, cb = 138 - 34 * wet + grain * 0.8;
        const k = (py * (x1 - x0) + qx) * 4;
        d[k] = d[k]! * (1 - t) + cr * t; d[k + 1] = d[k + 1]! * (1 - t) + cg * t; d[k + 2] = d[k + 2]! * (1 - t) + cb * t;
      }
      g.putImageData(img, x0, z0);
      // shingle: small grey and brown pebbles on the bank, most of them near the water
      for (let i = 0, n = 0; i < 40000 && n < 6000; i++) {
        const x = gx0 + rs() * (gnx - 1) * S, z = gz0 + rs() * (gnz - 1) * S, e = edgeAt(x, z);
        if (e < -0.15 || e > BANK * 0.9 || rs() < e / BANK) continue;
        const tone = 110 + rs() * 70 | 0, w = (0.05 + rs() * 0.09) * px;
        g.fillStyle = `rgba(${tone + 6},${tone},${tone - 10},0.9)`;
        g.beginPath(); g.ellipse(X(x), Z(z), w, w * (0.55 + rs() * 0.35), rs() * Math.PI, 0, 7); g.fill(); n++;
      }
    }
  }

  // the foot of the camp's wall: bare rock and earth under the scree slope, then grit and gravel thinning out into the
  // grass, with moss between the stones
  const onScree = (x: number, z: number) => !!falls && z < wallFootZ(falls, x) + APRON + 0.3;
  if (falls) {
    g.fillStyle = '#7d766a'; g.beginPath();
    for (let x = G.minX; x <= G.maxX; x += 1) g.lineTo(X(x), Z(wallFootZ(falls, x) - 3));
    for (let x = G.maxX; x >= G.minX; x -= 1) g.lineTo(X(x), Z(wallFootZ(falls, x) + APRON * (0.95 + 0.15 * Math.sin(x * 0.7))));
    g.closePath(); g.fill();
    const reach = RUBBLE + 1.5;
    for (let i = 0; i < 70000; i++) {
      const x = G.minX + rs() * W, out = Math.pow(rs(), 1.7) * reach, z = wallFootZ(falls, x) + APRON * 0.7 + out;
      if (edgeAt(x, z) < 0.15) continue;
      const fade = 1 - out / reach, tone = 100 + rs() * 50;
      g.fillStyle = `rgba(${tone + 8 | 0},${tone | 0},${tone - 12 | 0},${(0.9 * fade).toFixed(2)})`;
      g.fillRect(X(x), Z(z), 3 + rs() * 6, 3 + rs() * 5);
    }
    for (let i = 0; i < 9000; i++) {
      const x = G.minX + rs() * W, z = wallFootZ(falls, x) + APRON * 0.5 + Math.pow(rs(), 1.3) * (RUBBLE - 1);
      if (edgeAt(x, z) < 0.3) continue;
      g.fillStyle = `rgba(${60 + rs() * 25 | 0},${100 + rs() * 30 | 0},${40 + rs() * 15 | 0},0.45)`;
      g.fillRect(X(x), Z(z), 4 + rs() * 8, 4 + rs() * 6);
    }
  }

  // worn dirt: a cloud of small flecks, thick in the middle and thinning out at the edge
  const dirt = (x: number, z: number, rx: number, rz: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      g.fillStyle = `rgba(${150 + r() * 40 | 0},${118 + r() * 30 | 0},${78 + r() * 22 | 0},${0.7 * (1 - d * d)})`;
      g.fillRect(X(x + Math.cos(a) * d * rx), Z(z + Math.sin(a) * d * rz), 5, 4);
    }
  };
  // the paths, the square and the patches
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const { points: line, width } of layout.paths) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!, b = line[i + 1]!, n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 3);
      for (let k = 0; k <= n; k++) { const t = k / n; dirt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, width * 0.36, width * 0.36, Math.round(width * 34)); }
    }
  }
  // the town square: a worn dirt circle laid with irregular pale paving stones
  if (layout.square > 0) dirt(layout.hearth.pos.x, layout.hearth.pos.z, layout.square + 0.6, layout.square + 0.6, 9000);
  else dirt(layout.hearth.pos.x, layout.hearth.pos.z, 2.6, 2.6, 2200);   // trodden earth round a campfire, or where the camp's will be built
  for (let i = 0; i < (layout.square > 0 ? 1400 : 0); i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (layout.square - 0.3);
    const x = layout.hearth.pos.x + Math.cos(a) * d, z = layout.hearth.pos.z + Math.sin(a) * d, sz = (0.28 + r() * 0.3) * px;
    const tone = 150 + r() * 35 | 0;
    g.fillStyle = `rgba(${tone},${tone - 8},${tone - 22},0.85)`;
    g.save(); g.translate(X(x), Z(z)); g.rotate(r() * Math.PI); g.fillRect(-sz / 2, -sz / 2, sz, sz * (0.7 + r() * 0.5)); g.restore();
  }
  for (const b of layout.buildings) { const d = doorOf(b); dirt(d.x, d.z, 1.4, 1.4, 900); }
  // a quarry floor round each rock; a smaller trampled patch where the woodcutter stands round a tree
  for (const n of layout.nodes) if (isRock(n)) dirt(n.pos.x, n.pos.z, 2.0, 1.7, 2600); else dirt(n.pos.x, n.pos.z, 1.5, 1.5, 900);
  // land not yet claimed lies a little darker under its fog
  for (const p of layout.parcels) { g.fillStyle = 'rgba(20,40,25,0.18)'; g.fillRect(X(p.area.minX), Z(p.area.minZ), (p.area.maxX - p.area.minX) * px, (p.area.maxZ - p.area.minZ) * px); }
  // flowers in the grass, none on the bank or the stones
  for (let i = 0; i < 260; i++) {
    const fx = r() * c.width, fz = r() * c.height, wx = G.minX + fx / px, wz = G.minZ + fz / px;
    if (edgeAt(wx, wz) < BANK + 0.3 || onScree(wx, wz - 1.5)) continue;
    g.fillStyle = ['#f4e04d', '#f7f7f7', '#f29bb5'][i % 3]!; g.beginPath(); g.arc(fx, fz, 3, 0, 7); g.fill();
  }

  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2; ground.position.set((G.minX + G.maxX) / 2, 0, (G.minZ + G.maxZ) / 2);
  ground.receiveShadow = true; scene.add(ground);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: '#4f8f40' }));
  far.rotation.x = -Math.PI / 2; far.position.y = -0.02; far.receiveShadow = true; scene.add(far);

  // grass tufts, kept off paths, the square, buildings, rocks, the bank and the scree
  const blade = new THREE.ConeGeometry(0.035, 0.16, 3); blade.translate(0, 0.08, 0);
  const n = 4200, inst = new THREE.InstancedMesh(blade, new THREE.MeshLambertMaterial({ color: '#4b8c3b' }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(); let k = 0, tries = 0;
  while (k < n && tries++ < 80000) {
    const v = layout.village, p = { x: v.minX - 7 + r() * (v.maxX - v.minX + 16), z: v.minZ - 2 + r() * (v.maxZ - v.minZ + 4) };
    if (Math.hypot(p.x - layout.hearth.pos.x, p.z - layout.hearth.pos.z) < layout.square + 0.8) continue;
    // nothing to pick up hides in the grass
    if (layout.pickups?.some(pk => Math.hypot(p.x - pk.pos.x, p.z - pk.pos.z) < 0.7)) continue;
    if (edgeAt(p.x, p.z) < BANK + 0.2 || onScree(p.x, p.z)) continue;
    if (layout.paths.some(l => distToPolyline(p, l.points) < l.width * 0.5 + 0.3)) continue;
    if (layout.gardens.some(gd => Math.hypot(p.x - gd.pos.x, p.z - gd.pos.z) < Math.hypot(gd.w, gd.d) / 2 + 0.4)) continue;
    if (layout.nodes.some(nd => Math.hypot(p.x - nd.pos.x, p.z - nd.pos.z) < (isRock(nd) ? 1.9 : 1.1))) continue;
    if (layout.buildings.some(b => Math.hypot(p.x - b.pos.x, p.z - b.pos.z) < Math.hypot(b.w, b.d) / 2 + 0.3)) continue;
    for (let j = 0; j < 3 && k < n; j++, k++) {
      q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.5, r() * 6.3, (r() - 0.5) * 0.5)); s.setScalar(0.7 + r() * 0.6);
      m.compose(new THREE.Vector3(p.x + (r() - 0.5) * 0.12, 0, p.z + (r() - 0.5) * 0.12), q, s); inst.setMatrixAt(k, m);
    }
  }
  inst.count = k; inst.receiveShadow = true; scene.add(inst);

  // the water: one faceted sheet over a jittered grid, each triangle cut to the outline (a little past it, over the
  // wet sand, so no gap shows at the edge). Lighter where the falls churn it and in the shallows along the edge. The
  // river runs on far past the detailed ground, until the haze hides its end (world/water.ts): out there the ground
  // has no bank drawn, so the same grid lays a faceted sand bank under the water, and the water lies still.
  const CELL = 0.7, rj = seeded(29), M = BANK + 0.6;
  const b = { minX: wb.minX - M, maxX: wb.maxX + M, minZ: wb.minZ - M, maxZ: wb.maxZ + M };
  const nx = Math.ceil((b.maxX - b.minX) / CELL) + 1, nz = Math.ceil((b.maxZ - b.minZ) / CELL) + 1;
  const vx = new Float32Array(nx * nz), vz = new Float32Array(nx * nz), ve = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const at = j * nx + i, inner = i > 0 && j > 0 && i < nx - 1 && j < nz - 1;
    vx[at] = b.minX + i * CELL + (inner ? (rj() - 0.5) * 0.4 : 0); vz[at] = b.minZ + j * CELL + (inner ? (rj() - 0.5) * 0.4 : 0);
    ve[at] = water.edge({ x: vx[at]!, z: vz[at]! });
  }
  /** How far (x, z) is outside the detailed ground: above 0 outside it. */
  const outside = (x: number, z: number) => Math.max(G.minX - x, x - G.maxX, G.minZ - z, z - G.maxZ);
  type P = [number, number, number];   // x, z, and how far from the water's edge
  /** The part of a convex polygon where f < 0 (f taken as straight-line between its corners). */
  const cut = (poly: P[], f: (p: P) => number): P[] => {
    const out: P[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!, o = poly[(i + 1) % poly.length]!, fp = f(p), fo = f(o);
      if (fp < 0) out.push(p);
      if ((fp < 0) !== (fo < 0)) { const t = fp / (fp - fo); out.push([p[0] + (o[0] - p[0]) * t, p[1] + (o[1] - p[1]) * t, p[2] + (o[2] - p[2]) * t]); }
    }
    return out;
  };
  interface Sheet { p: number[]; c: number[] }
  const live: Sheet = { p: [], c: [] }, still: Sheet = { p: [], c: [] }, sand: Sheet = { p: [], c: [] };
  /** Each triangle of a cut polygon, facing up, into a sheet at height y, in the colour colour(middle x, z, edge). */
  const fan = (poly: P[], y: number, to: (mx: number, mz: number) => Sheet, colour: (mx: number, mz: number, me: number) => THREE.Color) => {
    for (let i = 1; i + 1 < poly.length; i++) {
      let a = poly[0]!, b2 = poly[i]!, c2 = poly[i + 1]!;
      if ((b2[1] - a[1]) * (c2[0] - a[0]) - (b2[0] - a[0]) * (c2[1] - a[1]) < 0) [b2, c2] = [c2, b2];
      const mx = (a[0] + b2[0] + c2[0]) / 3, mz = (a[1] + b2[1] + c2[1]) / 3, s = to(mx, mz);
      const k = colour(mx, mz, (a[2] + b2[2] + c2[2]) / 3);
      for (const p of [a, b2, c2]) { s.p.push(p[0], y, p[1]); s.c.push(k.r, k.g, k.b); }
    }
  };
  const deep = new THREE.Color('#3f86c4'), churned = new THREE.Color('#62a4d6'), shallow = new THREE.Color('#6fb0cc'), col = new THREE.Color();
  const land = falls ? { x: falls.lip.x, z: falls.lip.z + 1.2 } : null;
  const waterColour = (mx: number, mz: number, me: number) => {
    col.copy(deep);
    if (land) col.lerp(churned, 0.85 * (1 - smoothstep(1.5, 6.5, Math.hypot(mx - land.x, mz - land.z))));
    return col.lerp(shallow, 0.5 * smoothstep(-0.7, 0.2, me)).multiplyScalar(0.97 + rj() * 0.06);
  };
  // the water ripples on the detailed ground, dying away within 2 m past its edge; beyond 3 m out it lies still, so
  // the two meet without a crack
  const waterSheet = (mx: number, mz: number) => outside(mx, mz) > 3 ? still : live;
  // the bank beyond the detailed ground: sand like the drawn bank (darker and wet at the water), a few pebbles, its
  // edge a little ragged; cut to the land outside the ground in four parts (beyond each side, the corners with the
  // north and south ones), so it meets the drawn bank exactly at the ground's edge
  const drySand = new THREE.Color('#c4ae86'), wetSand = new THREE.Color('#978a68'), pebble = new THREE.Color('#8f887a');
  const sandColour = (_mx: number, _mz: number, me: number) => {
    col.copy(drySand).lerp(wetSand, smoothstep(0.5, -0.05, me));
    if (rj() < 0.2) col.lerp(pebble, 0.45);
    return col.multiplyScalar(0.94 + rj() * 0.12);
  };
  const bankEdge = (p: P) => p[2] - (BANK + 0.1 + 0.28 * Math.sin(p[0] * 1.7 + Math.sin(p[1] * 0.9) * 2));
  const beyond: ((p: P) => number)[][] = [
    [p => G.maxZ - p[1]],                                                  // south of it
    [p => p[1] - G.minZ],                                                  // north of it
    [p => p[0] - G.minX, p => G.minZ - p[1], p => p[1] - G.maxZ],          // west of it
    [p => G.maxX - p[0], p => G.minZ - p[1], p => p[1] - G.maxZ],          // east of it
  ];
  const tri = (a: P, b2: P, c2: P) => {
    const vs = [a, b2, c2];
    if (vs.some(p => p[2] < 0.1)) fan(cut(vs, p => p[2] - 0.1), 0.08, waterSheet, waterColour);
    if (vs.some(p => outside(p[0], p[1]) > 0) && vs.some(p => bankEdge(p) < 0)) {
      const banked = cut(vs, bankEdge);
      for (const part of beyond) fan(part.reduce((poly, f) => poly.length < 3 ? poly : cut(poly, f), banked), 0.01, () => sand, sandColour);
    }
  };
  const V = (i: number, j: number): P => { const at = j * nx + i; return [vx[at]!, vz[at]!, ve[at]!]; };
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const p00 = V(i, j), p10 = V(i + 1, j), p01 = V(i, j + 1), p11 = V(i + 1, j + 1);
    if ((i + j) % 2) { tri(p00, p10, p11); tri(p00, p11, p01); } else { tri(p00, p10, p01); tri(p10, p11, p01); }
  }
  const sheet = (s: Sheet, mat: THREE.Material) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(s.p, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(s.c, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = true; scene.add(mesh);
    return geo;
  };
  const waterMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.05, flatShading: true, transparent: true, opacity: 0.93 });
  const flat = sheet(live, waterMat);
  if (still.p.length) sheet(still, waterMat);
  if (sand.p.length) sheet(sand, new THREE.MeshLambertMaterial({ vertexColors: true }));
  const wpos = flat.attributes.position as THREE.BufferAttribute, amp = new Float32Array(wpos.count);
  for (let i = 0; i < wpos.count; i++) amp[i] = 1 - smoothstep(0, 2, outside(wpos.getX(i), wpos.getZ(i)));

  return {
    ground: [ground, far],
    update(t: number) {
      for (let i = 0; i < wpos.count; i++) {
        const x = wpos.getX(i), z = wpos.getZ(i);
        // ripples of up to 5 cm either way, always above the bank so it never shows through
        wpos.setY(i, 0.08 + amp[i]! * (Math.sin(t * 1.3 + x * 0.8 + z * 0.55) * 0.03 + Math.sin(t * 0.7 - z * 1.1) * 0.02));
      }
      wpos.needsUpdate = true; flat.computeVertexNormals();
    },
  };
}
