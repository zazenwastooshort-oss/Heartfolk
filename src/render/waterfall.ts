// The waterfall at the camp (world/camp.ts, Falls): a towering mountain wall whose top is lost in mist and cloud, the
// water pouring out of the mist down its face, foam rings and spray where it lands in the pool, and the foot of the
// mountain: a scree slope banked up against the wall, broken rock of every size on and below it, moss and ferns (laid
// out headless in world/falls.ts, which walking uses too). The wall is wide and curves forward into rock shoulders at
// the sides, so from the clearing its ends are never seen. The pool and the river are drawn by world.ts as one body of
// water (world/water.ts). Moves with time only; reads no game state.
// Cheap on phones: the wall, the mist curtain, the cloud puffs, the foot (slope, rocks and ferns) and the spray are one
// mesh each; only the foot casts shadows (the sun is always to the south, so the wall's own shadow falls behind it).
// The mist, the cloud and the water fading in all sit low enough for a low, zoomed-out camera to see them: its view
// reaches only about 15 m up the wall on a wide screen and 20-30 m on a phone held upright, so higher up is never
// seen. The camera never goes behind the wall or the falling water (`clearance`, which render/camera.ts keeps it in
// front of); the foot, which it can pass over, is cut away round the camera and its line of sight to the character,
// the mist thins out near the camera, and cloud and spray thin out where they would hide him or fill the screen.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Falls } from '../world/layout';
import type { Water } from '../world/water';
import { APRON, slopeY, wallFootZ, type Foot } from '../world/falls';

function seeded(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

const LEAN = 0.14;              // the face leans back this far for every metre up
const TOP = 1.3;                // the wall and the water go on this many times `height` up, into the mist
const SPAN = 112;               // the wall runs this far either side of the clearing
const CENTRE_X = 0;            // the clearing the wall stands round (its foot: wallFootZ in world/falls.ts)
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

  /** foot: the rocks and ferns at the foot of the wall (world/falls.ts, footOf); water: the pool and river's shape. */
  constructor(scene: THREE.Scene, private falls: Falls, foot: Foot, water: Water) {
    const { lip, width, height: H } = falls, r = seeded(9);
    const top = H * TOP, half = width / 2;
    /** Where the foot of the wall is at x (its line curves forward into the shoulders), before the rock's jags. */
    const footZ = this.footZ = (x: number) => wallFootZ(falls, x);
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
        else if (up > 0.36) c.lerp(moss, Math.min(1, (up - 0.36) * 2.6));
        if (my < 6) c.lerp(moss, 0.4 * (1 - my / 6) * (0.6 + 0.4 * Math.sin(mx * 0.23)));
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

    // the foot of the mountain, merged into one mesh and coloured per facet: a scree slope banked up against the wall,
    // the rocks lying on and below it (world/falls.ts: boulders, smaller rocks, rubble), moss on the stones facing up,
    // and ferns where the slope meets the grass
    const parts: THREE.BufferGeometry[] = [];
    const greyStone = new THREE.Color('#8a8d92'), warmStone = new THREE.Color('#8e8578'), mossy = new THREE.Color('#5f8a48');
    const fc = new THREE.Color(), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
    /** Add a non-indexed geometry, each facet coloured by `shade(facet middle, how much it faces up)`. */
    const add = (geo: THREE.BufferGeometry, shade: (mx: number, mz: number, up: number) => THREE.Color) => {
      const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position!, cs: number[] = [];
      for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
      for (let i = 0; i < p.count; i += 3) {
        A.fromBufferAttribute(p, i); B.fromBufferAttribute(p, i + 1).sub(A); C.fromBufferAttribute(p, i + 2).sub(A);
        const up = B.cross(C).normalize().y, k = shade(A.x, A.z, up);
        for (let j = 0; j < 3; j++) cs.push(k.r, k.g, k.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cs, 3));
      parts.push(g);
    };
    // the slope: a strip along the foot, from up against the wall (tucked in under its face) down to the ground
    const across = [-0.3, 0.12, 0.32, 0.52, 0.7, 0.86, 1.03], slope: THREE.Vector3[][] = [];
    for (let x = CENTRE_X - 58; x <= CENTRE_X + 58; x += 0.9 + r() * 0.4) {
      slope.push(across.map((u, k) => {
        const z = footZ(x) + u * APRON + (k > 0 && k < across.length - 1 ? (r() - 0.5) * 0.3 : 0), h = slopeY(falls, water, x, z);
        const y = h > 0.02 ? h + (k === across.length - 1 ? -0.06 : (r() - 0.4) * 0.5 * Math.min(1, h / 0.6)) : -0.06;
        return new THREE.Vector3(x + (k ? (r() - 0.5) * 0.45 : 0), y, z);
      }));
    }
    const scree = new THREE.Color('#7f7a72'), toe = new THREE.Color('#6e7c52'), sp: number[] = [];
    for (let i = 0; i < slope.length - 1; i++) for (let k = 0; k < across.length - 1; k++) {
      const a = slope[i]![k]!, b = slope[i + 1]![k]!, d = slope[i]![k + 1]!, e = slope[i + 1]![k + 1]!;
      if (Math.max(a.y, b.y, d.y, e.y) < 0.05) continue;                  // nothing rises here (where the water lands)
      for (const t of [[a, e, b], [a, d, e]]) for (const v of t) sp.push(v.x, v.y, v.z);
    }
    const slopeGeo = new THREE.BufferGeometry(); slopeGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    add(slopeGeo, (mx, mz, up) => {
      fc.copy(scree).lerp(r() < 0.5 ? greyStone : warmStone, r() * 0.6).multiplyScalar(0.84 + r() * 0.28);
      if (up > 0.5 && Math.sin(mx * 0.35 + Math.sin(mx * 0.11) * 3) > 0.25) fc.lerp(mossy, 0.45 + r() * 0.25);   // mossy patches
      return fc.lerp(toe, 0.55 * Math.max(0, (mz - footZ(mx)) / APRON - 0.55) / 0.45);                        // into the grass
    });
    // the rocks: boulders rounded and chunky, smaller rocks and rubble more broken
    for (const k of foot.rocks) {
      const geo = k.kind === 'boulder' ? new THREE.IcosahedronGeometry(1, 0) : k.kind === 'rock' ? new THREE.DodecahedronGeometry(1, 0)
        : r() < 0.5 ? new THREE.OctahedronGeometry(1, 0) : new THREE.TetrahedronGeometry(1, 0);
      const flat = k.kind === 'boulder' ? 0.72 + r() * 0.35 : k.kind === 'rock' ? 0.55 + r() * 0.3 : 0.45 + r() * 0.3;
      const tilt = k.kind === 'boulder' ? 0.3 : 3;
      geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(k.pos.x, k.y, k.pos.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * tilt, r() * 6.3, (r() - 0.5) * tilt)),
        new THREE.Vector3(1.12 * k.radius, flat * k.radius, 0.88 * k.radius)));
      const base = new THREE.Color().copy(greyStone).lerp(warmStone, r()).multiplyScalar(k.tone);
      const mossOn = k.kind === 'boulder' ? 0.7 : k.kind === 'rock' ? 0.35 : 0.08;
      add(geo, (_x, _z, up) => {
        fc.copy(base).multiplyScalar(0.92 + r() * 0.14);
        return up > 0.55 && r() < mossOn ? fc.lerp(mossy, 0.5 + r() * 0.3) : fc;
      });
    }
    // ferns: a few arching fronds each
    const fern = new THREE.Color('#4e8a3a'), fp: number[] = [];
    for (const f of foot.ferns) {
      const y = slopeY(falls, water, f.x, f.z), n = 5 + Math.floor(r() * 3), turn = r() * 6.3;
      for (let i = 0; i < n; i++) {
        const a = turn + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.5, L = 0.45 + r() * 0.35, ca = Math.cos(a), sa = Math.sin(a), w = 0.09;
        const base = [f.x, y + 0.02, f.z], tip = [f.x + ca * L, y + 0.1, f.z + sa * L];
        const mid = (s: number) => [f.x + ca * L * 0.5 - sa * w * s, y + 0.3 * L + 0.05, f.z + sa * L * 0.5 + ca * w * s];
        for (const t of [[base, mid(1), tip], [base, tip, mid(-1)]]) {
          // facing up
          const [p0, p1, p2] = (t[1]![2]! - t[0]![2]!) * (t[2]![0]! - t[0]![0]!) - (t[1]![0]! - t[0]![0]!) * (t[2]![2]! - t[0]![2]!) < 0 ? [t[0]!, t[2]!, t[1]!] : t;
          fp.push(...p0!, ...p1!, ...p2!);
        }
      }
    }
    const fernGeo = new THREE.BufferGeometry(); fernGeo.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    add(fernGeo, () => fc.copy(fern).multiplyScalar(0.85 + r() * 0.3));
    const stones = parts;
    // the camera can go over the foot, and near or into it when the wall pulls it in close: it is cut away round the
    // camera and round its line of sight to the character (between the two only), so it never hides him or fills the
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
    const footGeo = mergeGeometries(stones, false)!; footGeo.computeVertexNormals();
    const rocks = new THREE.Mesh(footGeo, rockMat);
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

    // foam rings spreading where the water lands (the pool itself is drawn with the river, render/world.ts)
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
