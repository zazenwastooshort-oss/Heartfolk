// The waterfall at the camp (world/camp.ts, Falls): a towering mountain wall whose top is lost in mist and cloud, the
// water pouring out of the mist down its face, and the pool at its foot with foam rings and spray. The wall is wide
// and curves forward into rock shoulders at the sides, so from the clearing its ends are never seen. The river below
// the pool is drawn by world.ts like any river. Moves with time only; reads no game state.
// Cheap on phones: the wall, the mist curtain, the cloud puffs, the boulders at its foot and the spray are one mesh
// each; only the boulders cast shadows (the sun is always to the south, so the wall's own shadow falls behind it).
// The mist, the cloud and the water fading in all sit low enough for a low, zoomed-out camera to see them: its view
// reaches only about 15 m up the wall on a wide screen and 20-30 m on a phone held upright, so higher up is never
// seen. The camera never goes behind the wall or the falling water (`clearance`, which render/camera.ts keeps it in
// front of); the boulders at the foot, which it can pass over, are cut away round the camera and its line of sight to
// the character, the mist thins out near the camera, and cloud and spray thin out where they would hide him or fill
// the screen.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Falls } from '../world/layout';

function seeded(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

const LEAN = 0.14;              // the face leans back this far for every metre up
const TOP = 1.3;                // the wall and the water go on this many times `height` up, into the mist
const SPAN = 112;               // the wall runs this far either side of the clearing...
const STRAIGHT = 38;            // ...straight for this far, then curving forward into shoulders
const CURVE = 0.011;            // how sharply the shoulders come forward
const CENTRE_X = 0;             // the clearing the wall stands round
const MIST_FROM = 5;            // the mist starts this many metres up, is half there by MIST_HALF, most of the way by
const MIST_HALF = 11;           // MIST_THICK...
const MIST_THICK = 18;
const MIST_FULL = 28;           // ...and is as thick as the sky above this
const WATER_FROM = 18;          // the falling water comes out of the mist between these heights
const WATER_TO = 34;
const MIST_NEAR = 5;            // the mist is clear within this many metres of the camera, whole beyond MIST_CLEAR
const MIST_CLEAR = 16;
const CLOUD_FROM = 11;          // cloud drifts between these heights
const CLOUD_TO = 30;
const CAMERA_PAD = 0.5;         // the camera stays this far in front of the wall and the water
const CUT_FROM = 0.9;           // boulders are cut away within this many metres of the camera's line of sight to the
const CUT_TO = 1.7;             // character, thinning out (dithered) to whole by this far...
const NEAR_FROM = 2.0;          // ...and within this many metres of the camera itself, whole by NEAR_TO
const NEAR_TO = 4.0;

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

/** A vertical alpha ramp for alphaMap (green channel): `stops` are [v, alpha] with v = 0 at the bottom, 1 at the top. */
function ramp(stops: [number, number][]): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128;
  const g = c.getContext('2d')!, grad = g.createLinearGradient(0, 128, 0, 0);
  for (const [v, a] of stops) { const k = Math.round(a * 255); grad.addColorStop(v, `rgb(${k},${k},${k})`); }
  g.fillStyle = grad; g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

/** A soft white blob for spray and cloud. */
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
  private clouds: THREE.InstancedMesh;
  private cloudAt: { x: number; y: number; z: number; s: number; phase: number }[] = [];
  private curtain: THREE.MeshBasicMaterial;
  private m = new THREE.Matrix4(); private v = new THREE.Vector3(); private sc = new THREE.Vector3();
  private seg = new THREE.Line3(); private near = new THREE.Vector3();
  private cut = { cam: { value: new THREE.Vector3() }, look: { value: new THREE.Vector3(0, -1e4, 0) } };
  /** Where the wall's foot is at x, before the rock's jags (it curves forward into the shoulders). */
  private footZ: (x: number) => number;
  /** How far in front of footZ - LEAN * y the frontmost rock or water is, measured from the geometry itself. */
  private front = -Infinity;

  constructor(scene: THREE.Scene, private falls: Falls) {
    const { lip, width, height: H, pool } = falls, r = seeded(9);
    const top = H * TOP, half = width / 2;
    /** Where the foot of the wall is at x (its line curves forward into the shoulders), before the rock's jags. */
    const footZ = this.footZ = (x: number) => { const out = Math.max(0, Math.abs(x - CENTRE_X) - STRAIGHT); return lip.z - 0.3 + CURVE * out * out; };
    /** Note how far in front of the leaning foot line a point of the wall or the water is. */
    const reachesTo = (x: number, y: number, z: number) => { this.front = Math.max(this.front, z - footZ(x) + LEAN * Math.max(0, y)); };

    // the wall: a faceted grid of rock leaning back as it rises, with vertical ribs, ledges where a row steps back, a
    // little jag, a groove where the water runs and buttresses either side of it. Coloured per facet: grey stone in
    // vertical streaks, the wet rock round the falls, moss on every ledge that faces up and along the foot.
    const cols = 70, rows = 24, xs: number[] = [], ys: number[] = [];
    for (let i = 0; i <= cols; i++) xs.push(CENTRE_X - SPAN + (2 * SPAN * i) / cols + (i % cols ? (r() - 0.5) * 2 : 0));
    for (let j = 0; j <= rows; j++) ys.push(-1 + (top + 1) * Math.pow(j / rows, 1.35));    // finer near the ground
    const ledge = ys.map((y, j) => (j > 1 && r() < 0.55 ? -(0.8 + r() * 2.2) : 0));         // rows that step back
    const rib = xs.map((x, i) => -3.2 * Math.abs(Math.sin(x * 0.16 + 1.3)) - (i % 3 === 0 ? r() * 1.5 : 0));
    const tone = xs.map(() => 0.9 + r() * 0.18);
    const grid: THREE.Vector3[][] = xs.map((x, i) => ys.map((y, j) => {
      const dx = Math.abs(x - lip.x), groove = dx < half + 0.6 ? -0.9 : dx < half + 3.2 ? 0.7 : 0;
      const ribbed = dx < half + 3.2 ? 0 : rib[i]! * Math.min(1, Math.max(0, y) / 4);    // the ribs rise out of the foot
      const patch = Math.max(0, Math.sin(x * 0.09 + j * 1.7) + 0.25);                   // ledges come and go along the wall
      const jag = r() * (y < 2 ? 0.6 : 1.4) - ledge[j]! * Math.min(1, patch);
      return new THREE.Vector3(x + (r() - 0.5) * 1.2, y, footZ(x) - LEAN * Math.max(0, y) - jag + ribbed + groove);
    }));
    const stone = new THREE.Color('#8a8d92'), wet = new THREE.Color('#5d646b'), moss = new THREE.Color('#5f8a48');
    const pos: number[] = [], col: number[] = [], c = new THREE.Color(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const a = grid[i]![j]!, b = grid[i + 1]![j]!, d = grid[i]![j + 1]!, e = grid[i + 1]![j + 1]!;
      for (const tri of [[a, b, e], [a, e, d]] as THREE.Vector3[][]) {
        const mx = (tri[0]!.x + tri[1]!.x + tri[2]!.x) / 3, my = (tri[0]!.y + tri[1]!.y + tri[2]!.y) / 3;
        const up = ab.subVectors(tri[1]!, tri[0]!).cross(ac.subVectors(tri[2]!, tri[0]!)).normalize().y;   // how much it faces up
        c.copy(stone).multiplyScalar(tone[i]! * (0.95 + r() * 0.1));
        if (Math.abs(mx - lip.x) < half + 4) c.lerp(wet, 0.6);
        else if (up > 0.42) c.lerp(moss, Math.min(1, (up - 0.42) * 2.4));
        if (my < 3) c.lerp(moss, 0.5 * (1 - my / 3));
        for (const p of tri) { pos.push(p.x, p.y, p.z); col.push(c.r, c.g, c.b); }
      }
    }
    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    wallGeo.computeVertexNormals();
    for (let i = 0; i < pos.length; i += 3) reachesTo(pos[i]!, pos[i + 1]!, pos[i + 2]!);
    // the camera never goes behind it (clearance), so only its front faces are drawn
    const wall = new THREE.Mesh(wallGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    wall.receiveShadow = true; scene.add(wall);

    // big stones fallen at the foot of the wall, merged into one mesh; two flank the pool
    const stones: THREE.BufferGeometry[] = [];
    const boulder = (x: number, y: number, z: number, rad: number, tone: number) => {
      const g = new THREE.IcosahedronGeometry(rad, 0);
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6)), new THREE.Vector3(1.15, 0.8 + r() * 0.4, 0.75)));
      const n = g.attributes.position!.count, k = new THREE.Color('#8a8d92').multiplyScalar(tone), cs: number[] = [];
      for (let i = 0; i < n; i++) cs.push(k.r, k.g, k.b);
      g.setAttribute('color', new THREE.Float32BufferAttribute(cs, 3));
      stones.push(g);
    };
    for (let x = CENTRE_X - STRAIGHT - 6; x <= CENTRE_X + STRAIGHT + 6; x += 3.2 + r() * 2) {
      if (Math.abs(x - lip.x) < half + 2.6) continue;
      boulder(x, 0.5 + r() * 0.6, footZ(x) + 0.2, 1.1 + r() * 0.8, 0.82 + r() * 0.25);
    }
    for (const side of [-1, 1]) boulder(lip.x + side * (half + 2.2), 0.7, lip.z + 0.6, 1.5, 0.78);
    // the camera can go over them, and near or behind one when the wall pulls it in close: they are cut away round the
    // camera and round its line of sight to the character (between the two only), so they never hide him or fill the
    // screen
    const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    rockMat.onBeforeCompile = shader => {
      shader.uniforms.uCutCam = this.cut.cam; shader.uniforms.uCutLook = this.cut.look;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCutPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvCutPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCutPos;\nuniform vec3 uCutCam;\nuniform vec3 uCutLook;\n'
          + 'const float BAYER[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        {
          vec3 ab = uCutLook - uCutCam;
          float t = dot(vCutPos - uCutCam, ab) / max(dot(ab, ab), 1e-4);
          float keep = smoothstep(${NEAR_FROM.toFixed(2)}, ${NEAR_TO.toFixed(2)}, distance(vCutPos, uCutCam));
          if (t > 0.0 && t < 1.0) keep = min(keep, smoothstep(${CUT_FROM.toFixed(2)}, ${CUT_TO.toFixed(2)}, length(vCutPos - uCutCam - t * ab)));
          ivec2 q = ivec2(mod(gl_FragCoord.xy, 4.0));
          if (keep < (BAYER[q.x + q.y * 4] + 0.5) / 16.0) discard;
        }`);
    };
    const rocks = new THREE.Mesh(mergeGeometries(stones, false)!, rockMat);
    rocks.castShadow = true; rocks.receiveShadow = true; scene.add(rocks);

    // the falling water: a bright sheet in its groove and a fainter, wider one for body, leaning back with the wall
    // and running from up in the mist (where they fade in, WATER_FROM to WATER_TO) down to the pool
    const fadeIn = ramp([[0, 1], [WATER_FROM / top, 1], [(WATER_FROM + WATER_TO) / 2 / top, 0.4], [WATER_TO / top, 0]]);
    const sheet = (w: number, opacity: number, z: number, speed: number) => {
      const tex = streaks(); tex.repeat.set(1, top / 4.5);
      const mat = new THREE.MeshBasicMaterial({ map: tex, alphaMap: fadeIn, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
      const len = top * Math.hypot(1, LEAN);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, len), mat);
      mesh.rotation.x = -Math.atan(LEAN);                       // its top leans back with the face
      mesh.position.set(lip.x, top / 2, lip.z + z - LEAN * top / 2); mesh.renderOrder = 1; scene.add(mesh);
      for (const sx of [-w / 2, w / 2]) for (const y of [0, top]) reachesTo(lip.x + sx, y, lip.z + z - LEAN * y);
      this.sheets.push({ tex, speed });
    };
    sheet(width, 0.92, 0.35, 1.25);
    sheet(width + 0.8, 0.35, 0.6, 0.9);

    // mist: a curtain in front of the high wall, clear below and thickening upward until it is the colour of the sky,
    // and cloud drifting across it, so the top is never seen. One-sided (facing the clearing): from between it and the
    // wall it isn't drawn.
    const mistLow = MIST_FROM, mistHigh = top + 6, cpos: number[] = [], cuv: number[] = [], cidx: number[] = [];
    const cn = 36;
    for (let i = 0; i <= cn; i++) {
      const x = CENTRE_X - SPAN + (2 * SPAN * i) / cn;
      for (const [y, v] of [[mistLow, 0], [mistHigh, 1]] as const) { cpos.push(x, y, footZ(x) - LEAN * y + 3.5); cuv.push(i / cn, v); }
      if (i < cn) cidx.push(2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3);
    }
    const curtainGeo = new THREE.BufferGeometry();
    curtainGeo.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3));
    curtainGeo.setAttribute('uv', new THREE.Float32BufferAttribute(cuv, 2));
    curtainGeo.setIndex(cidx);
    const mistAt = (y: number) => (y - mistLow) / (mistHigh - mistLow);
    this.curtain = new THREE.MeshBasicMaterial({ color: '#b4d3ec', transparent: true, depthWrite: false,
      alphaMap: ramp([[0, 0], [mistAt(MIST_HALF), 0.45], [mistAt(MIST_THICK), 0.8], [mistAt(MIST_FULL), 1], [1, 1]]) });
    // it thins out close to the camera: a camera up near the wall would otherwise look down through it onto the
    // ground below
    this.curtain.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMistPos;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvMistPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vMistPos;')
        .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
        diffuseColor.a *= smoothstep(${MIST_NEAR.toFixed(1)}, ${MIST_CLEAR.toFixed(1)}, distance(vMistPos, cameraPosition));`);
    };
    const curtain = new THREE.Mesh(curtainGeo, this.curtain); curtain.renderOrder = 3; scene.add(curtain);
    const puffTex = puff();
    // cloud drifting a little in front of the mist
    for (let i = 0; i < 34; i++) {
      const x = lip.x + (r() - 0.5) * 120, y = CLOUD_FROM + r() * (CLOUD_TO - CLOUD_FROM);
      this.cloudAt.push({ x, y, z: footZ(x) - LEAN * y + 4 + r() * 4, s: 6 + r() * 7, phase: r() * 100 });
    }
    this.clouds = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: puffTex, transparent: true, opacity: 0.7, depthWrite: false, color: '#eef3f5' }), this.cloudAt.length);
    this.clouds.frustumCulled = false; this.clouds.renderOrder = 4; scene.add(this.clouds);

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
      new THREE.MeshBasicMaterial({ map: puffTex, transparent: true, opacity: 0.45, depthWrite: false, color: '#f4f9fc' }), n);
    this.spray.frustumCulled = false; this.spray.renderOrder = 2; scene.add(this.spray);
  }

  /** How far `p` is in front of the wall and the falling water, less CAMERA_PAD; negative behind. The space in front
   *  is convex (the face leans back as a plane and its foot line curves towards the clearing), as the camera needs. */
  clearance(p: THREE.Vector3): number {
    return p.z - this.footZ(p.x) + LEAN * Math.max(0, p.y) - this.front - CAMERA_PAD;
  }

  /** How much of a puff of size `s` at `at` to draw: none where it would sit on the camera or between the camera and
   *  the character (`look`), so it never fills the screen or hides him; all of it a puff's size away. */
  private clear(at: THREE.Vector3, s: number, camera: THREE.Camera, look: THREE.Vector3): number {
    this.seg.set(camera.position, look).closestPointToPoint(at, true, this.near);
    return THREE.MathUtils.smoothstep(at.distanceTo(this.near), s * 0.35, s * 0.9);
  }

  /** look: the point the camera looks at (the character); sky: the colour of the sky at the horizon (the scene's
   *  background and haze), which the mist thickens into; cloud: the colour of the drifting cloud. */
  update(t: number, dt: number, camera: THREE.Camera, look: THREE.Vector3, sky: THREE.Color, cloud: THREE.Color): void {
    for (const s of this.sheets) s.tex.offset.y += s.speed * dt;
    this.cut.cam.value.copy(camera.position); this.cut.look.value.copy(look);
    this.rings.forEach((ring, i) => {
      const k = ((t * 0.6 + i / this.rings.length) % 1);
      ring.scale.setScalar(1 + k * 2.6);
      (ring.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.55;
    });
    this.sprayAt.forEach((p, i) => {
      const lift = ((t * 0.35 + p.phase) % 1);
      this.v.set(p.x + Math.sin(t + p.phase) * 0.3, p.y + lift * 1.2, p.z);
      const s = p.s * (0.7 + lift * 0.6) * this.clear(this.v, p.s, camera, look); this.sc.set(s, s, 1);
      this.m.compose(this.v, camera.quaternion, this.sc); this.spray.setMatrixAt(i, this.m);
    });
    this.spray.instanceMatrix.needsUpdate = true;
    this.cloudAt.forEach((p, i) => {
      this.v.set(p.x + Math.sin(t * 0.03 + p.phase) * 6, p.y + Math.sin(t * 0.11 + p.phase) * 1.2, p.z);
      const k = this.clear(this.v, p.s * 1.6, camera, look); this.sc.set(p.s * 1.6 * k, p.s * k, 1);
      this.m.compose(this.v, camera.quaternion, this.sc); this.clouds.setMatrixAt(i, this.m);
    });
    this.clouds.instanceMatrix.needsUpdate = true;
    this.curtain.color.copy(sky);
    (this.clouds.material as THREE.MeshBasicMaterial).color.copy(cloud);
  }
}
