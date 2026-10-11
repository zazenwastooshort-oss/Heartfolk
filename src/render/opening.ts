// Draws the opening cinematic (world/opening.ts) over the game's scene: the clifftop set (the plateau top, the upper
// river narrowing to the lip, the water curling white over the edge and falling, the sea of cloud below it), the wreck
// drifting and falling with him, cloud streaks rushing past in the fall, the splash and foam at impact and ripples as
// he swims. It moves the camera and the character it is handed, and plays his clips through a callback, so the game's
// view can hand over its own camera and character. The clifftop exists only while this runs: dispose() removes all of
// it, so the game camera can never see it. Reads the frame; changes no game state.
//
// Clips: only the character's own (IdleFree, RunFree) with whole-body turns from the frame: floating on his back is
// IdleFree lying flat, the tumble RunFree fast while he spins, swimming RunFree slow, face down and low in the water.
import * as THREE from 'three';
import {
  cloudDeckY, edgeZ, faceZ, riverHalfWidth, type OpeningFrame, type OpeningHero, type OpeningPose, type OpeningSite,
} from '../world/opening';

export interface OpeningHost {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** the character, a direct child of the scene; placed by the cinematic every frame while it runs */
  hero: THREE.Object3D;
  /** play one of the character's clips (crossfading is the host's business); speed 1 = as authored */
  play(clip: string, speed: number): void;
  /** village.glb's scene: Plank and CrateBroken are used for the wreck if it has them, else plain boxes */
  models?: THREE.Object3D;
  /** show or hide the camp below; it is hidden while the camera is above the cloud deck */
  setWorldVisible?(visible: boolean): void;
  /** hip height of the character standing (he turns about his hips); measured from the model when not given */
  hip?: number;
}

/** pose -> [clip, speed] */
const CLIP: Record<OpeningPose, [string, number]> = {
  float: ['IdleFree', 0.4], tumble: ['RunFree', 2.4], swim: ['RunFree', 0.7], crawl: ['RunFree', 0.45],
  lie: ['IdleFree', 0.25], rise: ['IdleFree', 0.8], stand: ['IdleFree', 1],
};

function seeded(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
/** soft white blob for cloud, mist and spray */
const puffTex = () => canvasTex(64, 64, g => {
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(0.6, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
}, false);
/** pale streaks running along v, for flowing and falling water */
const streakTex = (base: string, seed: number) => canvasTex(64, 256, g => {
  const r = seeded(seed); g.fillStyle = base; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6})`; g.fillRect(r() * 64, r() * 256, 1 + r() * 3, 18 + r() * 70); }
});
/** the top of the cloud sea: lumpy white */
const cloudTex = () => canvasTex(512, 512, g => {
  const r = seeded(21); g.fillStyle = '#e9eff3'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) {
    const x = r() * 512, y = r() * 512, rad = 18 + r() * 60, light = r() < 0.6;
    for (const [dx, dy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]] as const) {
      const grad = g.createRadialGradient(x + dx, y + dy, 1, x + dx, y + dy, rad);
      grad.addColorStop(0, light ? 'rgba(255,255,255,0.55)' : 'rgba(196,208,220,0.35)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
    }
  }
});

interface Billboards { mesh: THREE.InstancedMesh; at: { x: number; y: number; z: number; s: number; phase: number }[] }

export class OpeningView {
  private root = new THREE.Group();          // everything this adds to the scene
  private set = new THREE.Group();           // the clifftop and the cloud sea
  private own: { dispose(): void }[] = [];   // geometries, materials, textures made here
  private flows: { tex: THREE.Texture; speed: number }[] = [];
  private sky: THREE.Mesh;
  private clouds: Billboards;
  private mist: Billboards;
  private wreck: THREE.Object3D[] = [];
  private streaks: THREE.InstancedMesh;
  private streakMat: THREE.MeshBasicMaterial;
  private splash: THREE.InstancedMesh;
  private splashMat: THREE.MeshBasicMaterial;
  private foam: THREE.Mesh; private foamRing: THREE.Mesh;
  private ripples: THREE.Mesh[] = [];
  private hip: number;
  private clip = '';
  private clipSpeed = -1;
  private worldShown: boolean | null = null;
  private saved: { far: number; fov: number; fog?: { near: number; far: number } };
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private q2 = new THREE.Quaternion();
  private v = new THREE.Vector3(); private sc = new THREE.Vector3(); private e = new THREE.Euler();

  constructor(private host: OpeningHost, private site: OpeningSite) {
    const { camera, scene } = host;
    this.saved = { far: camera.far, fov: camera.fov };
    if (scene.fog instanceof THREE.Fog) this.saved.fog = { near: scene.fog.near, far: scene.fog.far };
    const box = new THREE.Box3().setFromObject(host.hero);
    this.hip = host.hip ?? (box.isEmpty() ? 0.9 : Math.max(0.5, (box.max.y - box.min.y) * 0.5));
    this.root.add(this.set); scene.add(this.root);
    this.buildClifftop();
    this.buildWater();
    // a sky that deepens overhead, so white cloud and mist read against it (the game's sky is pale haze)
    const skyGeo = this.keep(new THREE.SphereGeometry(1300, 24, 12)), skyCol: number[] = [], top = new THREE.Color('#4f93d6');
    const low = new THREE.Color('#cfe2f0'), sp = skyGeo.attributes.position!, k = new THREE.Color();
    for (let i = 0; i < sp.count; i++) { k.copy(low).lerp(top, Math.pow(clamp01(sp.getY(i) / 1300), 0.55)); skyCol.push(k.r, k.g, k.b); }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyCol, 3));
    this.sky = new THREE.Mesh(skyGeo, this.keep(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
    this.sky.renderOrder = -1; this.set.add(this.sky);
    const puff = this.keep(puffTex());
    this.clouds = this.buildClouds(puff);
    this.mist = this.buildMist(puff);
    this.buildWreck();
    // cloud rushing past in the fall: long thin streaks round the camera
    this.streakMat = this.keep(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.streaks = new THREE.InstancedMesh(this.keep(new THREE.PlaneGeometry(0.07, 4.5)), this.streakMat, 70);
    this.streaks.frustumCulled = false; this.streaks.renderOrder = 6; this.root.add(this.streaks);
    // the splash: spray thrown up, a foam disc and a ring running out over the pool
    this.splashMat = this.keep(new THREE.MeshBasicMaterial({ map: puff, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
    this.splash = new THREE.InstancedMesh(this.keep(new THREE.PlaneGeometry(1, 1)), this.splashMat, 30);
    this.splash.frustumCulled = false; this.splash.renderOrder = 5; this.root.add(this.splash);
    const flatWhite = (o: number) => this.keep(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: o, depthWrite: false }));
    this.foam = new THREE.Mesh(this.keep(new THREE.CircleGeometry(1, 28)), flatWhite(0));
    this.foamRing = new THREE.Mesh(this.keep(new THREE.RingGeometry(0.82, 1, 40)), flatWhite(0));
    for (const o of [this.foam, this.foamRing]) { o.rotation.x = -Math.PI / 2; o.renderOrder = 4; this.root.add(o); }
    for (let i = 0; i < 6; i++) {
      const ring = new THREE.Mesh(this.keep(new THREE.RingGeometry(0.8, 1, 32)), flatWhite(0));
      ring.rotation.x = -Math.PI / 2; ring.renderOrder = 4; this.ripples.push(ring); this.root.add(ring);
    }
  }

  private keep<T extends { dispose(): void }>(x: T): T { this.own.push(x); return x; }

  /** The plateau top round the river and the face below its edge, down into the cloud: one faceted mesh each. */
  private buildClifftop(): void {
    const s = this.site, H = s.height, eZ = edgeZ(s), cx = s.lip.x, r = seeded(31), deck = cloudDeckY(s);
    // ground height at (x, z) on the plateau: the river bed, its banks, then rough grass rising gently away
    const ground = (x: number, z: number) => {
      const d = Math.abs(x - cx) - riverHalfWidth(s, z);
      if (d < 0) return H - 0.5;
      if (d < 1.2) return H - 0.5 + d / 1.2;
      return H + 0.5 + 0.5 * Math.sin(x * 0.21 + z * 0.13) * Math.sin(z * 0.17 - x * 0.07) + Math.max(0, d - 25) * 0.05 + Math.max(0, eZ - 90 - z) * 0.03;
    };
    const xs: number[] = [];
    for (const o of [-320, -200, -130, -85, -55, -38, -27, -20]) xs.push(cx + o);
    for (let o = -15; o <= 15.001; o += 0.75) xs.push(cx + o);
    for (const o of [20, 27, 38, 55, 85, 130, 200, 320]) xs.push(cx + o);
    const half = s.width / 2;
    xs.push(cx - half, cx + half); xs.sort((a, b) => a - b);
    const zs: number[] = [];
    for (let z = eZ - 340; z < eZ - 60; z += 20) zs.push(z);
    for (let z = eZ - 60; z < eZ - 0.01; z += 1.5) zs.push(z);
    zs.push(eZ);
    const grass = new THREE.Color('#6aa84f'), dry = new THREE.Color('#8fae5a'), stone = new THREE.Color('#8a8d92'), wet = new THREE.Color('#5d646b');
    const pos: number[] = [], col: number[] = [], c = new THREE.Color();
    const quad = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3, e: THREE.Vector3, colour: (m: THREE.Vector3) => THREE.Color) => {
      for (const tri of [[a, e, b], [a, d, e]]) {
        const m = new THREE.Vector3().add(tri[0]!).add(tri[1]!).add(tri[2]!).divideScalar(3), k = colour(m);
        for (const p of tri) { pos.push(p.x, p.y, p.z); col.push(k.r, k.g, k.b); }
      }
    };
    const top = zs.map(z => xs.map(x => new THREE.Vector3(x, ground(x, z) + (z < eZ ? (r() - 0.5) * 0.25 : 0), z)));
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
      quad(top[j]![i]!, top[j]![i + 1]!, top[j + 1]![i]!, top[j + 1]![i + 1]!, m => {
        const d = Math.abs(m.x - cx) - riverHalfWidth(s, m.z);
        if (d < 1.3) return c.copy(wet);
        c.copy(grass).lerp(dry, 0.5 + 0.5 * Math.sin(m.x * 0.3 + m.z * 0.2)).multiplyScalar(0.92 + r() * 0.12);
        return eZ - m.z < 4 ? c.lerp(stone, 0.7) : c;
      });
    }
    // the face: from the edge down into the cloud, leaning back like the camp's wall, with a jagged surface
    const ys: number[] = [];
    for (let k = 0; k <= 22; k++) ys.push(H - (H - (deck - 34)) * Math.pow(k / 22, 1.2));
    const face = ys.map((y, k) => xs.map(x => new THREE.Vector3(x + (k ? (r() - 0.5) * 0.8 : 0),
      k === 0 ? ground(x, eZ) : y, k === 0 ? eZ : faceZ(s, y) - r() * 1.2 - (Math.abs(x - cx) < half + 0.5 ? 0.6 : 0))));
    for (let k = 0; k < ys.length - 1; k++) for (let i = 0; i < xs.length - 1; i++) {
      // wound so the faces point south, out of the rock
      quad(face[k + 1]![i]!, face[k + 1]![i + 1]!, face[k]![i]!, face[k]![i + 1]!, m => {
        c.copy(stone).multiplyScalar(0.85 + r() * 0.2);
        return Math.abs(m.x - cx) < half + 3 ? c.lerp(wet, 0.6) : c;
      });
    }
    const geo = this.keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })));
    this.set.add(mesh);

    // the sea of cloud below the lip: an opaque deck (nothing below it shows from above) and a soft layer over it
    const tex = this.keep(cloudTex()); tex.repeat.set(40, 40);
    const deckMesh = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(3000, 3000)),
      this.keep(new THREE.MeshBasicMaterial({ map: tex, color: '#f4f8fa', side: THREE.DoubleSide })));
    deckMesh.rotation.x = -Math.PI / 2; deckMesh.position.set(cx, deck, eZ); this.set.add(deckMesh);
    const tex2 = this.keep(cloudTex()); tex2.repeat.set(23, 23);
    const soft = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(3000, 3000)),
      this.keep(new THREE.MeshBasicMaterial({ map: tex2, color: '#ffffff', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })));
    soft.rotation.x = -Math.PI / 2; soft.position.set(cx + 7, deck + 2.5, eZ); this.set.add(soft);
  }

  /** The upper river, and the water curling white over the edge and falling down the face into the cloud. */
  private buildWater(): void {
    const s = this.site, H = s.height, eZ = edgeZ(s), cx = s.lip.x, deck = cloudDeckY(s);
    // the river: a strip at y = H, wide upstream and narrowing to the lip, whiter where it speeds up for the edge
    const rTex = this.keep(streakTex('#7fb2d8', 7)); rTex.repeat.set(2, 1);
    const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
    const rows: number[] = [];
    for (let z = eZ - 340; z < eZ - 40; z += 10) rows.push(z);
    for (let z = eZ - 40; z <= eZ + 1e-6; z += 0.8) rows.push(z);
    const blue = new THREE.Color('#4d93cc'), white = new THREE.Color('#e9f3fa'), c = new THREE.Color();
    rows.forEach((z, j) => {
      const hw = riverHalfWidth(s, z) + 0.35, k = clamp01((z - (eZ - 6)) / 6);
      c.copy(blue).lerp(white, k * k * 0.8);
      for (const side of [-1, 1]) { pos.push(cx + side * hw, H, z); uv.push(side < 0 ? 0 : hw / 4, z / 6); col.push(c.r, c.g, c.b); }
      if (j) { const a = (j - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    const geo = this.keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const river = new THREE.Mesh(geo, this.keep(new THREE.MeshStandardMaterial({ map: rTex, vertexColors: true, roughness: 0.25, metalness: 0.05, side: THREE.DoubleSide })));
    this.set.add(river);
    this.flows.push({ tex: rTex, speed: -0.5 });

    // over the edge: a curl, then the falling sheet in front of the face, down into the cloud
    const path: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; path.push(new THREE.Vector3(0, H - 1.6 * (1 - Math.cos(a)), eZ + 1.0 * Math.sin(a))); }
    for (let y = H - 2.5; y > deck - 30; y -= 3) path.push(new THREE.Vector3(0, y, faceZ(s, y) + 1.0));
    const fTex = this.keep(streakTex('#cfe4f2', 5));
    const sheet = (w: number, opacity: number, ahead: number, speed: number) => {
      const p2: number[] = [], u2: number[] = [], i2: number[] = [];
      let along = 0;
      path.forEach((p, i) => {
        if (i) along += p.distanceTo(path[i - 1]!);
        const hw = w / 2 + along * 0.02;
        for (const side of [-1, 1]) { p2.push(cx + side * hw, p.y, p.z + ahead); u2.push(side < 0 ? 0 : 1, -along / 5); }
        if (i) { const a = (i - 1) * 2; i2.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      });
      const g = this.keep(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(u2, 2)); g.setIndex(i2);
      const tex = fTex.clone(); this.keep(tex); tex.needsUpdate = true;
      const mesh = new THREE.Mesh(g, this.keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false })));
      mesh.renderOrder = 1; this.set.add(mesh); this.flows.push({ tex, speed });
    };
    sheet(s.width, 0.95, 0, 1.4);
    sheet(s.width + 1.2, 0.4, 0.3, 1.0);
  }

  private billboards(tex: THREE.Texture, n: number, colour: string, opacity: number, place: (r: () => number) => Billboards['at'][number]): Billboards {
    const r = seeded(n * 7 + 3), at = Array.from({ length: n }, () => place(r));
    const mesh = new THREE.InstancedMesh(this.keep(new THREE.PlaneGeometry(1, 1)),
      this.keep(new THREE.MeshBasicMaterial({ map: tex, color: colour, transparent: true, opacity, depthWrite: false })), n);
    mesh.frustumCulled = false; mesh.renderOrder = 3; this.set.add(mesh);
    return { mesh, at };
  }
  /** cloud heaped on the deck, all round */
  private buildClouds(tex: THREE.Texture): Billboards {
    const s = this.site, deck = cloudDeckY(s), eZ = edgeZ(s);
    return this.billboards(tex, 90, '#ffffff', 0.85, r => {
      const a = r() * Math.PI * 2, d = 12 + Math.pow(r(), 0.7) * 260;
      return { x: s.lip.x + Math.cos(a) * d, y: deck + 1 + r() * 4, z: Math.max(eZ + 6, eZ + Math.sin(a) * d), s: 14 + r() * 26, phase: r() * 100 };
    });
  }
  /** mist where the water turns white: down the falls and over the cliff foot into the cloud */
  private buildMist(tex: THREE.Texture): Billboards {
    const s = this.site, H = s.height, deck = cloudDeckY(s);
    return this.billboards(tex, 46, '#f4f8fb', 0.55, r => {
      const y = deck - 6 + Math.pow(r(), 1.6) * (H - deck + 2);
      return { x: s.lip.x + (r() - 0.5) * (s.width + 10), y, z: faceZ(s, y) + 1.5 + r() * 4, s: 4 + r() * 6, phase: r() * 100 };
    });
  }

  private buildWreck(): void {
    const find = (name: string) => this.host.models?.getObjectByName(name);
    const brown = this.keep(new THREE.MeshLambertMaterial({ color: '#8a5a33', flatShading: true }));
    const piece = (kind: 'plank' | 'crate') => {
      const model = find(kind === 'plank' ? 'Plank' : 'CrateBroken');
      if (model) { const o = model.clone(); o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); return o; }
      return new THREE.Mesh(this.keep(kind === 'plank' ? new THREE.BoxGeometry(1.8, 0.07, 0.28) : new THREE.BoxGeometry(0.7, 0.55, 0.7)), brown);
    };
    for (const kind of ['plank', 'plank', 'crate'] as const) { const o = piece(kind); this.wreck.push(o); this.root.add(o); }
  }

  /** Place him from the frame: turned about his hips, which sit `lift` of the way from lying to standing. */
  private placeHero(h: OpeningHero): void {
    const o = this.host.hero, hipY = 0.15 + (this.hip - 0.15) * h.lift;
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), h.yaw);
    this.q2.setFromEuler(this.e.set(h.roll, 0, -h.pitch, 'XYZ'));
    this.q.multiply(this.q2);
    o.quaternion.copy(this.q);
    o.position.set(0, -this.hip, 0).applyQuaternion(this.q).add(this.v.set(h.pos.x, h.pos.y + hipY, h.pos.z));
    const [clip, speed] = CLIP[h.pose];
    if (clip !== this.clip || speed !== this.clipSpeed) { this.host.play(clip, speed); this.clip = clip; this.clipSpeed = speed; }
  }

  /** Draw frame f; dt is the real time since the last call (for the flowing water only, so a frozen frame still
   *  flows). Call after the game's own lighting update, since this sets the haze for the high shots. */
  update(f: OpeningFrame, dt: number): void {
    const { camera, scene } = this.host, cam = f.camera;
    camera.position.set(cam.pos.x, cam.pos.y, cam.pos.z);
    camera.lookAt(cam.look.x, cam.look.y, cam.look.z);
    if (camera.fov !== cam.fov || camera.far < 1500) { camera.fov = cam.fov; camera.far = Math.max(camera.far, 1500); camera.updateProjectionMatrix(); }
    if (scene.fog instanceof THREE.Fog && f.showSet) { scene.fog.near = 150; scene.fog.far = 1200; }
    this.sky.position.copy(camera.position);
    if (f.showWorld !== this.worldShown) { this.host.setWorldVisible?.(f.showWorld); this.worldShown = f.showWorld; }
    this.set.visible = f.showSet;
    this.placeHero(f.hero);
    for (const fl of this.flows) fl.tex.offset.y += fl.speed * dt;

    // the wreck
    f.wreck.forEach((w, i) => {
      const o = this.wreck[i]; if (!o) return;
      o.visible = w.visible; o.position.set(w.pos.x, w.pos.y, w.pos.z);
      o.rotation.set(0, w.yaw, 0); o.rotateX(w.pitch);
    });

    // cloud and mist face the camera and drift a little
    const bill = (b: Billboards, drift: number) => {
      b.at.forEach((p, i) => {
        this.v.set(p.x + Math.sin(f.t * 0.05 + p.phase) * drift, p.y + Math.sin(f.t * 0.3 + p.phase) * 0.4, p.z);
        // shrink those right by the camera, so it never looks through a flat white card
        const near = clamp01((this.v.distanceTo(camera.position) - p.s * 0.4) / (p.s * 1.2));
        this.sc.set(p.s * 1.5 * near, p.s * near, 1); this.m.compose(this.v, camera.quaternion, this.sc); b.mesh.setMatrixAt(i, this.m);
      });
      b.mesh.instanceMatrix.needsUpdate = true;
    };
    if (f.showSet) { bill(this.clouds, 3); bill(this.mist, 0.8); }

    // streaks rushing up past the camera in the fall, standing upright and turned to face it
    this.streakMat.opacity = 0.55 * f.streaks;
    this.streaks.visible = f.streaks > 0.01;
    if (this.streaks.visible) {
      const r = seeded(77), R = 40;
      for (let i = 0; i < this.streaks.count; i++) {
        const a = r() * Math.PI * 2, d = 1.8 + r() * 10, ph = r();
        const x = cam.pos.x + Math.cos(a) * d, z = cam.pos.z + Math.sin(a) * d;
        const y = cam.pos.y + (((ph * R + f.t * 30) % R) - R / 2);
        this.q.setFromAxisAngle(this.v.set(0, 1, 0), Math.atan2(cam.pos.x - x, cam.pos.z - z));
        this.m.compose(this.v.set(x, y, z), this.q, this.sc.set(1, 0.6 + ph, 1)); this.streaks.setMatrixAt(i, this.m);
      }
      this.streaks.instanceMatrix.needsUpdate = true;
    }

    // the splash: spray thrown up and falling back, foam spreading and fading, a ring running out
    const sp = f.events.find(e => e.kind === 'splash');
    const age = sp ? sp.age : Infinity;
    this.splash.visible = age < 2.6;
    this.foam.visible = this.foamRing.visible = age < 4;
    if (sp && age < 4) {
      const r = seeded(91);
      for (let i = 0; i < this.splash.count; i++) {
        const a = r() * Math.PI * 2, vr = 0.5 + r() * 2.4, vy = 4 + r() * 8, size = 0.45 + r() * 0.9;
        const y = Math.max(0, vy * age - 4.9 * age * age);
        this.v.set(sp.pos.x + Math.cos(a) * vr * age, sp.pos.y + y, sp.pos.z + Math.sin(a) * vr * age);
        this.sc.setScalar(size * (1 + age * 0.8)); this.m.compose(this.v, camera.quaternion, this.sc); this.splash.setMatrixAt(i, this.m);
      }
      this.splash.instanceMatrix.needsUpdate = true;
      this.splashMat.opacity = 0.85 * clamp01(1 - age / 2.6);
      this.foam.position.set(sp.pos.x, sp.pos.y + 0.03, sp.pos.z); this.foam.scale.setScalar(1 + 2.4 * (1 - Math.exp(-2.5 * age)));
      (this.foam.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - clamp01(age / 4));
      this.foamRing.position.set(sp.pos.x, sp.pos.y + 0.04, sp.pos.z); this.foamRing.scale.setScalar(1 + 4.2 * (1 - Math.exp(-1.6 * age)));
      (this.foamRing.material as THREE.MeshBasicMaterial).opacity = 0.7 * clamp01(1 - age / 2.8);
    }
    // ripples where he surfaces, with each stroke and as he reaches the bank
    const rip = f.events.filter(e => (e.kind === 'surface' || e.kind === 'stroke' || e.kind === 'ashore') && e.age < 1.6);
    this.ripples.forEach((ring, i) => {
      const e = rip[i]; ring.visible = !!e; if (!e) return;
      ring.position.set(e.pos.x, e.pos.y + 0.03, e.pos.z); ring.scale.setScalar(0.35 + 1.5 * e.age);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - e.age / 1.6);
    });
  }

  /** Remove everything this added and give the camera, the haze and the camp back as they were. */
  dispose(): void {
    const { camera, scene } = this.host;
    this.root.removeFromParent();
    for (const x of this.own) x.dispose();
    this.own = [];
    camera.far = this.saved.far; camera.fov = this.saved.fov; camera.updateProjectionMatrix();
    if (scene.fog instanceof THREE.Fog && this.saved.fog) { scene.fog.near = this.saved.fog.near; scene.fog.far = this.saved.fog.far; }
    if (this.worldShown === false) this.host.setWorldVisible?.(true);
  }
}
