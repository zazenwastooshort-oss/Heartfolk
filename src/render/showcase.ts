// A dev-only look at chapter 2's placeholder models (creatures.ts, gear.ts, props.ts) in the game itself, at its camera
// angle and in its light: with ?models in the page's address it sets them out on open ground just east of where a new
// game starts, each labelled, cycling through its poses (the rats, the goblins: their bites and swings kept to an attack
// clock, one every 1.5 s, as combat will time them), clips and pieces of hide armour (two copies of the character).
// Without the flag it does nothing at all. Not part of play: it never reads or changes the game state, and nothing in
// the game knows about it.
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';
import minerUrl from '../../assets/models/miner.glb?url';
import villageUrl from '../../assets/models/village.glb?url';
import type { Layout } from '../world/layout';
import { loadModel, type View } from './view';
import { goblinModel, ratModel, GOBLIN, RAT, type GoblinPose, type RatPose } from './creatures';
import { wearGear, type ArmourId } from './gear';
import { hideTentModel, palisadeModel, ratNestModel, totemModel } from './props';

/** Whether the page was opened with ?models (or &models). */
export const showcaseWanted = (search: string) => /[?&]models(?:[=&]|$)/.test(search);

/** A label floating over a model: cream text on forest green, a fixed size on screen. */
function label(text: string, size = 1): { sprite: THREE.Sprite; set(text: string): void } {
  const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 64;
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
  sprite.scale.set(0.15 * size, 0.03 * size, 1); sprite.renderOrder = 20;
  let shown = '';
  const set = (next: string) => {
    if (next === shown) return;
    shown = next;
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.font = '600 26px system-ui, sans-serif';
    const w = Math.min(canvas.width - 4, g.measureText(next).width + 28);
    g.fillStyle = 'rgba(38, 66, 44, 0.88)';
    g.beginPath(); g.roundRect((canvas.width - w) / 2, 8, w, 48, 14); g.fill();
    g.fillStyle = '#f6efdc'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(next, canvas.width / 2, 33);
    map.needsUpdate = true;
  };
  set(text);
  return { sprite, set };
}

/** The character from miner.glb, copied, with his own mixer: the axe in his hands (the pick hidden). */
function character(miner: GLTF) {
  const body = cloneRig(miner.scene.getObjectByName('Miner')!);
  for (const name of ['pick_head', 'pick_collar']) body.getObjectByName(name)!.visible = false;
  body.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const mixer = new THREE.AnimationMixer(body);
  const actions = new Map(miner.animations.map(c => [c.name, mixer.clipAction(c)]));
  let current: THREE.AnimationAction | undefined;
  const play = (name: string) => {
    const next = actions.get(name);
    if (!next || next === current) return;
    next.reset().play();
    if (current) current.crossFadeTo(next, 0.18, false);
    current = next;
  };
  return { body, mixer, play };
}

const NAMES: Record<RatPose | GoblinPose, string> = { idle: 'idle', scurry: 'scurrying', bite: 'biting', down: 'knocked over', walk: 'walking', attack: 'attacking' };
const HOLD = 3;                      // seconds each pose is shown
const ATTACK_EVERY = 1.5;            // seconds from one bite or swing to the next, timed as combat would (attackT)

/** With ?models in the page's address, set the models out near the start (layout.start) in the view's scene. */
export function showModels(view: View, layout: Layout): void {
  if (!showcaseWanted(location.search)) return;
  void Promise.all([loadModel(minerUrl), loadModel(villageUrl)]).then(([miner, village]) => {
    const scene = view.scene, s = layout.start;
    const at = (x: number, z: number) => new THREE.Vector3(s.x + x, 0, s.z + z);
    const place = (o: THREE.Object3D, x: number, z: number, heading = 0, tag?: string, high = 1) => {
      o.position.copy(at(x, z)); o.rotation.y = heading; scene.add(o);
      if (!tag) return null;
      const l = label(tag); l.sprite.position.set(0, high, 0); o.add(l.sprite);
      return l;
    };
    // a title over each row
    const title = (text: string, x: number, z: number, high: number) => { const l = label(text, 1.25); l.sprite.position.copy(at(x, z)).setY(high); scene.add(l.sprite); };
    const updates: ((t: number, dt: number) => void)[] = [];

    // the rats: one in each pose to begin with, each going on through the others; a scurrying one runs in a ring
    const ratPoses: RatPose[] = ['idle', 'scurry', 'bite', 'down'];
    ratPoses.forEach((_, i) => {
      const rat = ratModel(i + 1), home = at(1.0 + i * 1.1, 1.6), ring = 0.4;
      const tag = place(rat.group, 0, 0, 0, ' ', 0.7 + (i % 2) * 0.3)!;
      let angle = i;
      updates.push((t, dt) => {
        const pose = ratPoses[(i + Math.floor(t / HOLD)) % ratPoses.length]!;
        if (pose === 'scurry') angle += dt * RAT.speed / ring;
        rat.group.position.set(home.x + Math.cos(angle) * ring, 0, home.z + Math.sin(angle) * ring);
        rat.group.rotation.y = Math.atan2(-Math.cos(angle), -Math.sin(angle));
        rat.update(pose, t, dt, undefined, pose === 'bite' ? (t % HOLD) % ATTACK_EVERY : undefined);   // poses change on the HOLD
        tag.set(NAMES[pose]);
      });
    });

    // the goblins, the same way; a walking one walks a ring
    const goblinPoses: GoblinPose[] = ['idle', 'walk', 'attack', 'down'];
    goblinPoses.forEach((_, i) => {
      const goblin = goblinModel(miner), home = at(4.4 + i * 1.3, -2.2), ring = 0.6, speed = GOBLIN.walkSpeed * 0.6;
      const tag = place(goblin.group, 0, 0, 0, ' ', 1.7 + (i % 2) * 0.3)!;
      let angle = 0;
      updates.push((t, dt) => {
        const pose = goblinPoses[(i + Math.floor(t / HOLD)) % goblinPoses.length]!;
        if (pose === 'walk') angle += dt * speed / ring;
        goblin.group.position.set(home.x + Math.sin(angle) * ring, 0, home.z + (1 - Math.cos(angle)) * ring);
        // facing the camera's side (south-east) while standing; along the ring while walking
        goblin.group.rotation.y = pose === 'walk' ? Math.atan2(-Math.sin(angle), Math.cos(angle)) : -Math.PI * 0.3;
        goblin.update(pose, t, dt, speed, pose === 'attack' ? (t % HOLD) % ATTACK_EVERY : undefined);
        tag.set(NAMES[pose]);
      });
    });

    // the character in hide armour: one wearing it all, going through his clips; one trying each piece on in turn
    const full = character(miner), trying = character(miner);
    wearGear(full.body, ['hide_cap', 'hide_vest', 'hide_shield']);
    const fullTag = place(full.body, 1.4, -0.6, -Math.PI * 0.75, ' ', 2.0)!;
    const tryTag = place(trying.body, 2.8, -0.6, -Math.PI * 0.75, ' ', 2.0)!;
    trying.play('IdleFree');
    const clips = ['IdleFree', 'Chop', 'RunFree'], sets: [string, ArmourId[]][] = [
      ['hide cap', ['hide_cap']], ['hide vest', ['hide_vest']], ['hide shield', ['hide_shield']], ['all three', ['hide_cap', 'hide_vest', 'hide_shield']], ['no armour', []],
    ];
    updates.push((t, dt) => {
      const clip = clips[Math.floor(t / HOLD) % clips.length]!;
      full.play(clip); full.mixer.update(dt);
      fullTag.set(`all three: ${clip}`);
      const [name, worn] = sets[Math.floor(t / 2) % sets.length]!;
      wearGear(trying.body, worn); trying.mixer.update(dt);
      tryTag.set(name);
    });

    // the props: the rats' nest, and the goblin camp's palisade, tent and totem
    place(ratNestModel(), 0.9, -4.3, 0, 'rat nest', 0.75);
    place(palisadeModel(), 3.4, -4.9, 0, 'palisade', 2.3);
    place(totemModel(), 5.9, -4.6, 0, 'totem', 2.7);
    place(hideTentModel(village.scene), 8.2, -4.6, 0, 'hide tent', 2.2);
    title('rats', 2.65, 1.6, 1.35);
    title('hide armour', 2.1, -0.6, 2.45);
    title('goblins', 6.35, -2.2, 2.45);

    let last = performance.now() / 1000;
    const tick = () => {
      const t = performance.now() / 1000, dt = Math.min(0.1, t - last);
      last = t;
      for (const update of updates) update(t, dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }).catch(err => console.error('?models:', err));
}
