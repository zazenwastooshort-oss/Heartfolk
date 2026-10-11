// The waterfall at the camp (world/camp.ts, Falls): the clifftop the river runs along, a cliff face of big stones,
// the falling water, and the pool at its foot with foam rings and spray. The river below the pool is drawn by
// world.ts like any river. Moves with time only; reads no game state.
import * as THREE from 'three';
import type { Falls } from '../world/layout';

function seeded(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

const WATER = '#3f86c4';

/** Pale streaks running down, for the falling sheet; the texture scrolls so the water seems to pour. */
function streaks(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d')!, r = seeded(5);
  g.fillStyle = '#9fcbe6'; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.6})`;
    g.fillRect(r() * 64, r() * 256, 1 + r() * 3, 20 + r() * 70);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A soft white blob for spray. */
function puff(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class FallsView {
  private sheets: { tex: THREE.Texture; speed: number }[] = [];
  private rings: THREE.Mesh[] = [];
  private spray: THREE.InstancedMesh;
  private sprayAt: { x: number; y: number; z: number; s: number; phase: number }[] = [];
  private m = new THREE.Matrix4(); private v = new THREE.Vector3(); private sc = new THREE.Vector3();

  constructor(scene: THREE.Scene, private falls: Falls) {
    const { lip, width, height: H, pool } = falls, r = seeded(9);
    const stone = new THREE.MeshLambertMaterial({ color: '#8a8d92', flatShading: true });
    const stoneDark = new THREE.MeshLambertMaterial({ color: '#73767b', flatShading: true });
    const grass = new THREE.MeshLambertMaterial({ color: '#5ca04a' });

    // the clifftop: one big block whose front face is the cliff, grass on top
    const top = new THREE.Mesh(new THREE.BoxGeometry(110, H, 36), [stone, stone, grass, stone, stone, stone]);
    top.position.set(0, H / 2, lip.z - 18); top.receiveShadow = true; top.castShadow = true; scene.add(top);

    // big stones along the cliff face break up its straight edge; two flank the falls
    const boulder = (x: number, y: number, z: number, rad: number, dark: boolean) => {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rad, 0), dark ? stoneDark : stone);
      b.position.set(x, y, z); b.rotation.set(r() * 6, r() * 6, r() * 6); b.scale.set(1.15, 0.85 + r() * 0.4, 0.7);
      b.castShadow = true; b.receiveShadow = true; scene.add(b);
    };
    for (let x = -52; x <= 52; x += 3.4 + r() * 1.6) {
      if (Math.abs(x - lip.x) < width / 2 + 0.8) continue;
      boulder(x, 0.9 + r() * 1.2, lip.z + 0.3, 1.5 + r() * 0.9, r() < 0.4);
      boulder(x + 1.2, H - 1.2 - r() * 1.6, lip.z + 0.1, 1.6 + r() * 1.0, r() < 0.5);
    }
    for (const side of [-1, 1]) boulder(lip.x + side * (width / 2 + 1.1), H * 0.55, lip.z + 0.5, 1.7, true);

    // the river on the clifftop, a flat ribbon running to the lip
    const pts = falls.upper, half = width / 2, ribbon: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!, b = pts[i + 1]!, dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      const sx = -dz / l * half, sz = dx / l * half, y = H + 0.05;
      ribbon.push(a.x - sx, y, a.z - sz, b.x - sx, y, b.z - sz, a.x + sx, y, a.z + sz,
                  b.x - sx, y, b.z - sz, b.x + sx, y, b.z + sz, a.x + sx, y, a.z + sz);
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(ribbon, 3)); rg.computeVertexNormals();
    const water = new THREE.MeshStandardMaterial({ color: WATER, roughness: 0.25, metalness: 0.05, side: THREE.DoubleSide });
    scene.add(new THREE.Mesh(rg, water));

    // the falling water: a bright sheet in front of the cliff, and a fainter, wider one for body
    const sheet = (w: number, opacity: number, z: number, speed: number) => {
      const tex = streaks(); tex.repeat.set(1, 1.6);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, H + 0.2), mat);
      mesh.position.set(lip.x, H / 2, lip.z + z); mesh.renderOrder = 1; scene.add(mesh);
      this.sheets.push({ tex, speed });
    };
    sheet(width, 0.92, 0.35, 1.25);
    sheet(width + 0.8, 0.35, 0.6, 0.9);

    // the pool at the foot, lighter where the water churns
    const poolMesh = new THREE.Mesh(new THREE.CircleGeometry(pool.radius, 28), new THREE.MeshStandardMaterial({ color: '#4d93cc', roughness: 0.2 }));
    poolMesh.rotation.x = -Math.PI / 2; poolMesh.position.set(pool.pos.x, 0.07, pool.pos.z); poolMesh.receiveShadow = true; scene.add(poolMesh);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.75, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(lip.x, 0.1, lip.z + 1.4); scene.add(ring); this.rings.push(ring);
    }

    // spray rising where the water lands
    const n = 22;
    for (let i = 0; i < n; i++) this.sprayAt.push({ x: lip.x + (r() - 0.5) * (width + 1), y: 0.3 + r() * 2.2, z: lip.z + 0.8 + r() * 1.8, s: 1 + r() * 1.6, phase: r() * 10 });
    this.spray = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: puff(), transparent: true, opacity: 0.45, depthWrite: false, color: '#f4f9fc' }), n);
    this.spray.frustumCulled = false; this.spray.renderOrder = 2; scene.add(this.spray);
  }

  update(t: number, dt: number, camera: THREE.Camera): void {
    for (const s of this.sheets) s.tex.offset.y += s.speed * dt;
    this.rings.forEach((ring, i) => {
      const k = ((t * 0.6 + i / this.rings.length) % 1);
      ring.scale.setScalar(1 + k * 2.6);
      (ring.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.55;
    });
    this.sprayAt.forEach((p, i) => {
      const lift = ((t * 0.35 + p.phase) % 1);
      this.v.set(p.x + Math.sin(t + p.phase) * 0.3, p.y + lift * 1.2, p.z);
      const s = p.s * (0.7 + lift * 0.6); this.sc.set(s, s, 1);
      this.m.compose(this.v, camera.quaternion, this.sc); this.spray.setMatrixAt(i, this.m);
    });
    this.spray.instanceMatrix.needsUpdate = true;
  }
}
