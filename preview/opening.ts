// Dev preview of the opening cinematic over a stand-in of the camp (not part of the game build). Play/Restart, Pause,
// Skip, a time scrubber; URL ?t=<seconds> freezes at that time, ?rm=1 forces the reduced-motion version.
// Plays the way the game will: OpeningView (render) moves the camera and the character, OpeningOverlay (ui) shows the
// bars and the Skip button; once it is done both are disposed and the game camera carries on from where it ended.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import minerUrl from '../assets/models/miner.glb?url';
import villageUrl from '../assets/models/village.glb?url';
import { Lighting } from '../src/render/lighting';
import { OrbitCamera } from '../src/render/camera';
import { OpeningView } from '../src/render/opening';
import { OpeningOverlay, prefersReducedMotion } from '../src/ui/opening';
import { openingDuration, openingFrame, orbitCamera, type OpeningCamera } from '../src/world/opening';
import { CampStandIn, SITE } from './standin';

const params = new URLSearchParams(location.search);
const frozenAt = params.has('t') ? Number(params.get('t')) : null;
let reduced = params.get('rm') === '1' || (params.get('rm') !== '0' && prefersReducedMotion());

const stage = document.getElementById('stage')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true;
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
stage.prepend(renderer.domElement);
const scene = new THREE.Scene();
const cam = new OrbitCamera();
const lighting = new Lighting(scene);

/** In the built page the models are embedded as data: URLs, and artifact links block fetch() of those, so decode them
 *  here (as render/view.ts does for the game). village.glb is copied in from main: it has the wreck models. */
function loadModel(url: string) {
  const loader = new GLTFLoader();
  if (!url.startsWith('data:')) return loader.loadAsync(url);
  const comma = url.indexOf(','), head = url.slice(0, comma), body = url.slice(comma + 1);
  const bytes = head.endsWith(';base64') ? Uint8Array.from(atob(body), c => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(body));
  return loader.parseAsync(bytes.buffer, '');
}

const [miner, village] = await Promise.all([loadModel(minerUrl), loadModel(villageUrl)]);
const camp = new CampStandIn(village.scene, miner.scene.getObjectByName('Rock')!);
scene.add(camp.group);
const hero = miner.scene.getObjectByName('Miner')!;
for (const n of ['pick_head', 'pick_collar', 'axe_head', 'axe_blade', 'pick_handle']) { const o = miner.scene.getObjectByName(n); if (o) o.visible = false; }
hero.traverse(o => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
scene.add(hero);
const mixer = new THREE.AnimationMixer(hero);
const actions = new Map(miner.animations.map(c => [c.name, mixer.clipAction(c)]));
let current: THREE.AnimationAction | undefined;
function play(name: string, speed: number) {
  const next = actions.get(name); if (!next) return;
  next.timeScale = speed;
  if (next === current) return;
  next.reset().setEffectiveWeight(1).play();
  if (current) current.crossFadeTo(next, 0.25, false);
  current = next;
}

let endCam: OpeningCamera = orbitCamera(SITE.start);
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
  renderer.setSize(w, h, false); cam.resize(w / h);
  endCam = orbitCamera(SITE.start, cam.yaw, cam.pitch, cam.dist, cam.camera.fov);
}
new ResizeObserver(resize).observe(stage); resize();

let view: OpeningView | null = null, overlay: OpeningOverlay | null = null;
let t = frozenAt ?? 0, playing = frozenAt === null, clock = 0;

function begin() {
  if (!view) view = new OpeningView({ scene, camera: cam.camera, hero, play, models: village.scene, setWorldVisible: v => { camp.group.visible = v; } }, SITE);
  if (!overlay) overlay = new OpeningOverlay(stage, { onSkip: () => { t = openingDuration(reduced); } });
}
function finish() {
  view?.dispose(); overlay?.dispose(); view = null; overlay = null;
  // the game takes over: standing at the start, the orbit camera where the cinematic left it
  hero.position.set(SITE.start.x, 0, SITE.start.z); hero.quaternion.identity(); hero.rotation.y = SITE.startYaw ?? Math.PI / 2;
  play('IdleFree', 1);
  cam.follow(hero.position, 1);
}
begin();

const scrub = document.getElementById('scrub') as HTMLInputElement, read = document.getElementById('read')!;
const rmBox = document.getElementById('rm') as HTMLInputElement, pauseBtn = document.getElementById('pause')!;
rmBox.checked = reduced;
const syncScrub = () => { scrub.max = String(openingDuration(reduced)); };
syncScrub();
document.getElementById('play')!.addEventListener('click', () => { t = 0; playing = true; begin(); });
document.getElementById('skipDev')!.addEventListener('click', () => { t = openingDuration(reduced); begin(); });
pauseBtn.addEventListener('click', () => { playing = !playing; begin(); });
scrub.addEventListener('input', () => { t = Number(scrub.value); playing = false; begin(); });
rmBox.addEventListener('change', () => { reduced = rmBox.checked; syncScrub(); t = 0; playing = true; begin(); });

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; clock += dt;
  lighting.update(0.42, new THREE.Vector3(SITE.start.x, 0, SITE.start.z), true, cam.dist);
  if (view && overlay) {
    if (playing) t += dt;
    const f = openingFrame(SITE, endCam, t, reduced);
    view.update(f, dt); overlay.update(f);
    camp.setMist(f.camera.pos.y < 12);                // the waterfall's mist only once the camera is down near the pool
    scrub.value = String(f.t);
    read.textContent = `t ${f.t.toFixed(2)}  shot ${f.shot}  ${f.hero.pose}  story ${f.story.toFixed(2)}${f.speed < 0.99 ? ` (x${f.speed.toFixed(2)})` : ''}`;
    if (f.done && playing) finish();
  } else {
    cam.follow(hero.position, 1);
    camp.setMist(true);
    read.textContent = 'done: the game camera';
  }
  pauseBtn.textContent = playing ? 'Pause' : 'Play';
  mixer.update(dt);
  camp.update(clock, dt, cam.camera);
  renderer.render(scene, cam.camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
(window as unknown as { opening: unknown }).opening = { SITE, get t() { return t; }, scene, cam, hero };
