// A stand-in for the camp after chunk A, for the opening preview only (not part of the game): the game's own ground
// and river (render/world.ts) with a simplified copy of the new waterfall: a 70 m wall leaning back 0.14 m per metre,
// lost in a mist curtain and cloud near its top, the falling water and the pool; pines round the clearing and the wreck
// on the bank (from village.glb, when it has those models).
import * as THREE from 'three';
import { buildWorld, type WorldView } from '../src/render/world';
import { CAMP } from '../src/world/camp';
import type { OpeningSite } from '../src/world/opening';

function seeded(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export const LEAN = 0.14;
/** The camp after chunk A, as the cinematic's site. */
export const SITE: OpeningSite = {
  lip: { x: -14, z: -15.2 }, width: 3.6, height: 70, pool: { pos: { x: -14, z: -11.2 }, radius: 3.8 },
  start: { x: -8.8, z: -7.6 }, startYaw: Math.PI / 2, lean: LEAN,
};

// the wreck along the bank, as chunk A's camp.ts lays it out: [model, x, z, rot]
const WRECK: [string, number, number, number][] = [
  ['Book', -7.9, -6.7, 0.6], ['Plank', -11.9, -7.5, 1.1], ['Plank', -13.2, -4.0, 2.6], ['Plank', -7.0, -10.4, -0.4],
  ['Plank', -5.6, -4.6, 1.9], ['Tarp', -12.0, -2.6, 0.8], ['CrateBroken', -10.4, -5.6, 0.5], ['HullRib', -10.4, -10.3, 2.2],
];

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  return new THREE.CanvasTexture(c);
}

export class CampStandIn {
  readonly group: THREE.Scene = new THREE.Scene();
  private world: WorldView;
  private sheet: THREE.Texture;
  private clouds: THREE.InstancedMesh;
  private cloudAt: { x: number; y: number; z: number; s: number }[] = [];
  private m = new THREE.Matrix4();

  constructor(models?: THREE.Object3D) {
    const g = this.group, s = SITE, H = s.height, top = H * 1.3, r = seeded(9), { lip } = s;
    // the game's ground and river; the new camp has no upper river, so the old clifftop is left out
    this.world = buildWorld(g, CAMP);
    // the wall: a faceted grid leaning back as it rises
    const cols = 60, rows = 20, xs: number[] = [], ys: number[] = [];
    for (let i = 0; i <= cols; i++) xs.push(-112 + 224 * i / cols + (i % cols ? (r() - 0.5) * 2 : 0));
    for (let j = 0; j <= rows; j++) ys.push(-1 + (top + 1) * Math.pow(j / rows, 1.35));
    const footZ = (x: number) => { const out = Math.max(0, Math.abs(x) - 38); return lip.z - 0.3 + 0.011 * out * out; };
    const grid = xs.map(x => ys.map(y => {
      const dx = Math.abs(x - lip.x), groove = dx < s.width / 2 + 0.6 ? -0.9 : 0;
      return new THREE.Vector3(x, y, footZ(x) - LEAN * Math.max(0, y) - r() * (y < 2 ? 0.6 : 1.4) + groove);
    }));
    const pos: number[] = [], col: number[] = [], c = new THREE.Color();
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const a = grid[i]![j]!, b = grid[i + 1]![j]!, d = grid[i]![j + 1]!, e = grid[i + 1]![j + 1]!;
      for (const tri of [[a, b, e], [a, e, d]]) {
        c.set('#8a8d92').multiplyScalar(0.9 + r() * 0.15);
        if (Math.abs(tri[0]!.x - lip.x) < s.width / 2 + 4) c.lerp(new THREE.Color('#5d646b'), 0.6);
        if (tri[0]!.y < 3) c.lerp(new THREE.Color('#5f8a48'), 0.4);
        for (const p of tri) { pos.push(p.x, p.y, p.z); col.push(c.r, c.g, c.b); }
      }
    }
    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    wallGeo.computeVertexNormals();
    g.add(new THREE.Mesh(wallGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    // the falling water, leaning back with the face
    this.sheet = canvasTex(64, 256, x => {
      x.fillStyle = '#9fcbe6'; x.fillRect(0, 0, 64, 256);
      for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.6})`; x.fillRect(r() * 64, r() * 256, 1 + r() * 3, 20 + r() * 70); }
    });
    this.sheet.wrapS = this.sheet.wrapT = THREE.RepeatWrapping; this.sheet.colorSpace = THREE.SRGBColorSpace; this.sheet.repeat.set(1, top / 4.5);
    const len = top * Math.hypot(1, LEAN);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(s.width, len),
      new THREE.MeshBasicMaterial({ map: this.sheet, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false }));
    sheet.rotation.x = -Math.atan(LEAN); sheet.position.set(lip.x, top / 2, lip.z + 0.35 - LEAN * top / 2); sheet.renderOrder = 1; g.add(sheet);
    // the mist curtain: clear below, the colour of the sky above, so the top is never seen
    const ramp = canvasTex(4, 128, x => {
      const grad = x.createLinearGradient(0, 128, 0, 0);
      for (const [v, a] of [[0, 0], [0.35, 0.55], [0.62, 1], [1, 1]] as const) { const k = Math.round(a * 255); grad.addColorStop(v, `rgb(${k},${k},${k})`); }
      x.fillStyle = grad; x.fillRect(0, 0, 4, 128);
    });
    const low = H * 0.28, high = top + 6;
    const curtain = new THREE.Mesh(new THREE.PlaneGeometry(240, (high - low) * Math.hypot(1, LEAN)),
      new THREE.MeshBasicMaterial({ color: '#b4d3ec', alphaMap: ramp, transparent: true, depthWrite: false }));
    curtain.rotation.x = -Math.atan(LEAN); curtain.position.set(0, (low + high) / 2, lip.z - 0.3 - LEAN * (low + high) / 2 + 3.5); curtain.renderOrder = 3; g.add(curtain);
    const puff = canvasTex(64, 64, x => {
      const grad = x.createRadialGradient(32, 32, 2, 32, 32, 31);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = grad; x.fillRect(0, 0, 64, 64);
    });
    for (let i = 0; i < 30; i++) { const y = H * 0.35 + r() * H * 0.75, x = lip.x + (r() - 0.5) * 120; this.cloudAt.push({ x, y, z: footZ(x) - LEAN * y + 6 + r() * 5, s: 12 + r() * 16 }); }
    this.clouds = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: puff, transparent: true, opacity: 0.7, depthWrite: false, color: '#eef3f5' }), this.cloudAt.length);
    this.clouds.frustumCulled = false; this.clouds.renderOrder = 4; g.add(this.clouds);
    // the pool
    const pool = new THREE.Mesh(new THREE.CircleGeometry(s.pool.radius, 28), new THREE.MeshStandardMaterial({ color: '#4d93cc', roughness: 0.2 }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(s.pool.pos.x, 0.07, s.pool.pos.z); g.add(pool);
    // pines round the clearing (none on the old clifftop) and the wreck on the bank
    const pine = models?.getObjectByName('TreePine');
    if (pine) for (const t of CAMP.trees) if (t.pos.z > lip.z + 3) { const o = pine.clone(); o.position.set(t.pos.x, 0, t.pos.z); o.scale.setScalar(t.size); g.add(o); }
    for (const [name, x, z, rot] of WRECK) {
      const src = models?.getObjectByName(name); if (!src) continue;
      const o = src.clone(); o.position.set(x, 0, z); o.rotation.set(0, rot, 0); g.add(o);
    }
  }

  update(t: number, dt: number, camera: THREE.Camera): void {
    this.world.update(t);
    this.sheet.offset.y += 1.25 * dt;
    const v = new THREE.Vector3(), sc = new THREE.Vector3();
    this.cloudAt.forEach((p, i) => { v.set(p.x + Math.sin(t * 0.03 + i) * 6, p.y, p.z); sc.set(p.s * 1.6, p.s, 1); this.m.compose(v, camera.quaternion, sc); this.clouds.setMatrixAt(i, this.m); });
    this.clouds.instanceMatrix.needsUpdate = true;
  }
}
