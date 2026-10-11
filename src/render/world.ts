// The ground and the river, drawn from the layout: grass, dirt roads and lanes, the paved town square, worn patches
// by doors, rocks and trees, a sandy riverbank, grass tufts, and the river itself (a faceted water strip that gently moves).
import * as THREE from 'three';
import type { Layout, NodeSpot, Vec2 } from '../world/layout';
import { doorOf } from '../world/layout';
import { RESOURCES } from '../data/skills';

const isRock = (n: NodeSpot) => RESOURCES[n.resource]!.model === 'Rock';

function seeded(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

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
  const g = c.getContext('2d')!, px = c.width / W, r = seeded(11);
  const X = (x: number) => (x - G.minX) * px, Z = (z: number) => (z - G.minZ) * px;

  g.fillStyle = '#5ca04a'; g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 160000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(40,90,30,0.16)' : 'rgba(150,210,110,0.14)'; g.fillRect(r() * c.width, r() * c.height, 3, 3); }

  // worn dirt: a cloud of small flecks, thick in the middle and thinning out at the edge
  const dirt = (x: number, z: number, rx: number, rz: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r());
      g.fillStyle = `rgba(${150 + r() * 40 | 0},${118 + r() * 30 | 0},${78 + r() * 22 | 0},${0.7 * (1 - d * d)})`;
      g.fillRect(X(x + Math.cos(a) * d * rx), Z(z + Math.sin(a) * d * rz), 5, 4);
    }
  };
  // sand along the river, then the paths, the square and the patches
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = '#c9b48a'; g.lineWidth = (layout.river.width + 2.6) * px;
  g.beginPath(); layout.river.points.forEach((p, i) => i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z))); g.stroke();
  for (const { points: line, width } of layout.paths) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!, b = line[i + 1]!, n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 3);
      for (let k = 0; k <= n; k++) { const t = k / n; dirt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, width * 0.36, width * 0.36, Math.round(width * 34)); }
    }
  }
  // the town square: a worn dirt circle laid with irregular pale paving stones
  if (layout.square > 0) dirt(layout.hearth.pos.x, layout.hearth.pos.z, layout.square + 0.6, layout.square + 0.6, 9000);
  else dirt(layout.hearth.pos.x, layout.hearth.pos.z, 2.6, 2.6, 2200);          // trodden earth round a campfire
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
  for (let i = 0; i < 260; i++) { g.fillStyle = ['#f4e04d', '#f7f7f7', '#f29bb5'][i % 3]!; g.beginPath(); g.arc(r() * c.width, r() * c.height, 3, 0, 7); g.fill(); }

  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2; ground.position.set((G.minX + G.maxX) / 2, 0, (G.minZ + G.maxZ) / 2);
  ground.receiveShadow = true; scene.add(ground);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: '#4f8f40' }));
  far.rotation.x = -Math.PI / 2; far.position.y = -0.02; far.receiveShadow = true; scene.add(far);

  // grass tufts, kept off paths, the square, buildings, rocks and the river
  const blade = new THREE.ConeGeometry(0.035, 0.16, 3); blade.translate(0, 0.08, 0);
  const n = 4200, inst = new THREE.InstancedMesh(blade, new THREE.MeshLambertMaterial({ color: '#4b8c3b' }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(); let k = 0, tries = 0;
  while (k < n && tries++ < 80000) {
    const v = layout.village, p = { x: v.minX - 7 + r() * (v.maxX - v.minX + 16), z: v.minZ - 2 + r() * (v.maxZ - v.minZ + 4) };
    if (layout.falls && Math.hypot(p.x - layout.falls.pool.pos.x, p.z - layout.falls.pool.pos.z) < layout.falls.pool.radius + 0.6) continue;
    if (Math.hypot(p.x - layout.hearth.pos.x, p.z - layout.hearth.pos.z) < layout.square + 0.8) continue;
    if (distToPolyline(p, layout.river.points) < layout.river.width / 2 + 1.4) continue;
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

  // the river: a strip following the bank line, a few vertices across, rippling slowly
  const pts = layout.river.points, centre: Vec2[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!, steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.9);
    for (let j = 0; j < steps; j++) centre.push({ x: a.x + (b.x - a.x) * j / steps, z: a.z + (b.z - a.z) * j / steps });
  }
  centre.push(pts[pts.length - 1]!);
  // the sideways direction at each point follows its neighbours, so the strip bends without gaps at the corners
  const along = centre.map((p, i) => {
    const prev = centre[Math.max(0, i - 1)]!, next = centre[Math.min(centre.length - 1, i + 1)]!;
    const tx = next.x - prev.x, tz = next.z - prev.z, l = Math.hypot(tx, tz) || 1;
    return { p, side: { x: -tz / l, z: tx / l } };
  });
  const ACROSS = 5, half = layout.river.width / 2;
  const pos = new Float32Array(along.length * ACROSS * 3), base: number[] = [];
  along.forEach((a, i) => {
    for (let j = 0; j < ACROSS; j++) {
      const o = (j / (ACROSS - 1) - 0.5) * 2 * half, idx = (i * ACROSS + j) * 3;
      pos[idx] = a.p.x + a.side.x * o; pos[idx + 1] = 0.08; pos[idx + 2] = a.p.z + a.side.z * o;
      base.push(pos[idx]!, pos[idx + 2]!);
    }
  });
  const idx: number[] = [];
  for (let i = 0; i < along.length - 1; i++) for (let j = 0; j < ACROSS - 1; j++) {
    const a = i * ACROSS + j, b = a + 1, c2 = a + ACROSS, d = c2 + 1;
    idx.push(a, b, c2, b, d, c2);                    // wound so the faces point up
  }
  const riverGeo = new THREE.BufferGeometry();
  riverGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); riverGeo.setIndex(idx);
  const flat = riverGeo.toNonIndexed(); flat.computeVertexNormals();
  const water = new THREE.Mesh(flat, new THREE.MeshStandardMaterial({ color: '#3f86c4', roughness: 0.25, metalness: 0.05, flatShading: true, transparent: true, opacity: 0.93 }));
  water.receiveShadow = true; scene.add(water);
  const wpos = flat.attributes.position as THREE.BufferAttribute;

  return {
    ground: [ground, far],
    update(t: number) {
      for (let i = 0; i < wpos.count; i++) {
        const x = wpos.getX(i), z = wpos.getZ(i);
        // ripples of up to 5 cm either way, always above the riverbank so it never shows through
        wpos.setY(i, 0.08 + Math.sin(t * 1.3 + x * 0.8 + z * 0.55) * 0.03 + Math.sin(t * 0.7 - z * 1.1) * 0.02);
      }
      wpos.needsUpdate = true; flat.computeVertexNormals();
    },
  };
}

