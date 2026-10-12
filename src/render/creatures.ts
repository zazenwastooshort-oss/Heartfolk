// Creatures for chapter 2, placeholder art made quickly (the owner, 12 Oct 2026): the rat (rats in the woods, in play
// since part 2: render/rats.ts places them) and the goblin (chunk E, the goblin camp up the river, not in play yet).
// Render-side models with a small API: whoever places them drives them each frame from what the simulation says they
// are doing.
//  - ratModel(seed) -> { group, update(pose, t, dt, speed?, attackT?) }: built in code, low-poly and flat-shaded; poses
//    'idle' (sniffing, looking about), 'scurry' (running), 'bite' (rears back, snaps forward), 'down' (knocked over).
//  - goblinModel(miner) -> { group, mixer, update(pose, t, dt, speed?, attackT?), play(clip, fade?) }: the character
//    from a load of miner.glb of its own (loaded once, shared by every goblin) with his own rig and clips, smaller,
//    green, with pointed ears and a crude club instead of his tools; poses 'idle' (IdleFree), 'walk' (RunFree),
//    'attack' (Chop) and 'down' (falls on his back).
// Given an attack clock (attackT: the seconds since this bite or swing began, the way the view holds the character's
// swings to the simulation's task.progress), an attack plays one bite or swing and then holds still, ready, until
// attackT starts again from 0; without one it loops on its own. The rat's bite is timed by data/rats.ts (RAT_BITE),
// where the simulation lands it (systems/rats.ts); the goblin's GOBLIN.attackImpact by data/goblins.ts (GOBLIN_SWING),
// where the simulation lands its blow (systems/goblins.ts).
// Both face +x at rotation 0, like the character, so `group.rotation.y = heading` (actors/player.ts headingOf) turns
// one to face where it goes. The group's own transform is the caller's; the animation only moves what is inside it.
// They read nothing from the game state.
import * as THREE from 'three';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';
import { toolInTransit } from './arms';
import { mergeByMaterial } from './parts';
import { ARMED_CLIPS, FADE, GAIT, SWINGS } from '../data/animation';
import { RAT_BITE } from '../data/rats';
import { GOBLIN_SWING } from '../data/goblins';

const flat = (color: string, roughness = 0.9) => new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
function part(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
const smooth = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };

// --- the rat --------------------------------------------------------------------------------------------------------

export type RatPose = 'idle' | 'scurry' | 'bite' | 'down';

/** One bite, in seconds whatever the bites' pace: the rat rears back for `rear`, snaps forward in `snap` (its head
 *  furthest forward at the end of it, where the bite lands) and settles back in `settle` (data/rats.ts). */
const BITE = RAT_BITE;

/** The rat's look and motion (metres, seconds): built 0.42 m long, drawn `size` times that (a chunky body about 0.5 m
 *  long and 0.32 high, a 0.55 m tail), big enough to read from the game's camera. */
export const RAT = {
  fur: ['#8a7b6c', '#7b6d60', '#968979'], skin: '#d4a093', eye: '#1b1410',
  size: 1.2,
  stride: 0.5,             // metres one scurrying stride covers, so the feet keep up with `speed`
  speed: 1.5,              // metres a second it scurries at when the caller gives no speed
  bite: BITE,
  biteStrike: BITE.rear + BITE.snap,   // seconds into a bite that it strikes: its head furthest forward (0.5 s)
  biteCycle: 0.9,          // with no attack clock, it bites again every this many seconds from when the pose began
  ease: 8,                 // how quickly it moves between poses (higher is quicker)
};

export interface RatModel {
  group: THREE.Group;
  /** pose: what it is doing; t: seconds on any steady clock; dt: seconds since the last frame; speed: metres a second
   *  it is moving while scurrying (RAT.speed if left out); attackT: while biting, the seconds since the bite under way
   *  began, for bites the caller times: one bite (striking RAT.biteStrike in), then still and ready until attackT
   *  starts again from 0. Left out, it bites every RAT.biteCycle seconds from when the pose began. */
  update(pose: RatPose, t: number, dt: number, speed?: number, attackT?: number): void;
}

/** How far the rat lunges `s` seconds into a bite (1 furthest forward, below 0 reared back): it rears back from `from`
 *  (where the last bite had got to when this one began, 0 once it has settled), snaps forward, settles back to 0 and
 *  stays there. */
function lungeAt(s: number, from: number): number {
  const { rear, snap, settle } = RAT.bite;
  if (s < rear) return from + (-0.4 - from) * smooth(s / rear);
  if (s < rear + snap) return -0.4 + 1.4 * (s - rear) / snap;
  return 1 - smooth((s - rear - snap) / settle);
}

/** A rat. `seed` picks its fur from RAT.fur and sets its idle rhythm apart from its neighbours'. */
export function ratModel(seed = 1): RatModel {
  const fur = flat(RAT.fur[Math.abs(Math.round(seed)) % RAT.fur.length]!), skin = flat(RAT.skin), eye = flat(RAT.eye, 0.4);
  const group = new THREE.Group(), rig = new THREE.Group(); rig.scale.setScalar(RAT.size); group.add(rig);
  const body = new THREE.Group(); body.name = 'rat_body'; body.position.y = 0.15; rig.add(body);   // rolls over about its middle
  // a chunky body, the rump bigger than the chest
  const torso = new THREE.SphereGeometry(1, 8, 6), pos = torso.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), k = 1 - 0.22 * x;
    pos.setXYZ(i, x * 0.21, pos.getY(i) * 0.12 * k, pos.getZ(i) * 0.13 * k);
  }
  torso.computeVertexNormals();
  part(torso, fur, body);
  // the head: a round skull, a pointed snout with a pink nose, black eyes, round pink ears
  const head = new THREE.Group(); head.position.set(0.17, 0.035, 0); body.add(head);
  part(new THREE.SphereGeometry(0.078, 7, 5), fur, head);
  part(new THREE.ConeGeometry(0.062, 0.16, 6).rotateZ(-Math.PI / 2), fur, head, 0.1, -0.012, 0);
  part(new THREE.SphereGeometry(0.02, 5, 4), skin, head, 0.18, -0.012, 0);
  for (const s of [-1, 1]) {
    part(new THREE.SphereGeometry(0.014, 5, 4), eye, head, 0.05, 0.03, s * 0.043);
    const ear = part(new THREE.CylinderGeometry(0.042, 0.042, 0.012, 8).rotateZ(Math.PI / 2), skin, head, -0.01, 0.07, s * 0.052);
    ear.rotation.y = -s * 0.55;
  }
  // legs on pivots at the hip, so they can swing: small front paws, bigger hind legs under the rump
  const leg = (x: number, z: number, w: number, h: number) => {
    const pivot = new THREE.Group(); pivot.position.set(x, h - 0.15, z); body.add(pivot);
    part(new THREE.BoxGeometry(w, h, w * 0.9), skin, pivot, 0, -h / 2, 0);
    return pivot;
  };
  const legs = { fl: leg(0.1, -0.06, 0.035, 0.08), fr: leg(0.1, 0.06, 0.035, 0.08), hl: leg(-0.1, -0.08, 0.05, 0.09), hr: leg(-0.1, 0.08, 0.05, 0.09) };
  // the tail: a chain of tapering segments from the rump, each turned a little from the one before
  const tail: THREE.Group[] = [];
  let at: THREE.Object3D = body;
  for (let i = 0, n = 6, len = 0.075; i < n; i++) {
    const seg = new THREE.Group(); seg.position.set(i ? -len : -0.19, i ? 0 : 0.01, 0); at.add(seg);
    const r0 = 0.022 - 0.016 * i / n, r1 = 0.022 - 0.016 * (i + 1) / n;
    part(new THREE.CylinderGeometry(r1, r0, len, 5).rotateZ(Math.PI / 2).translate(-len / 2, 0, 0), skin, seg);
    tail.push(seg); at = seg;
  }

  const w = { scurry: 0, bite: 0, down: 0 };
  const phase = seed * 1.7;
  let pose: RatPose | null = null, since = 0, stride = 0, biteS = Infinity, from = 0, reach = 0;
  return {
    group,
    update(next, t, dt, speed = RAT.speed, attackT) {
      if (next !== pose) { pose = next; since = t; }
      const k = Math.min(1, dt * RAT.ease);
      w.scurry += ((pose === 'scurry' ? 1 : 0) - w.scurry) * k;
      w.bite += ((pose === 'bite' ? 1 : 0) - w.bite) * k;
      w.down += ((pose === 'down' ? 1 : 0) - w.down) * k * 0.7;
      const up = 1 - w.down, calm = Math.max(0, 1 - w.scurry - w.bite) * up;
      // idle: sniffing in little bursts, looking about, breathing
      const sniff = Math.sin(t * 24) * 0.07 * Math.max(0, Math.sin(t * 1.3 + phase)) * calm;
      const look = Math.sin(t * 0.8 + phase) * 0.5 * calm;
      // scurrying: legs in diagonal pairs at the pace it moves, the body bobbing, the head low, the tail out behind
      stride += dt * Math.max(0.5, speed) / RAT.stride * Math.PI * 2 * w.scurry;
      const swing = Math.sin(stride) * 0.9 * w.scurry * up;
      legs.fl.rotation.z = legs.hr.rotation.z = swing;
      legs.fr.rotation.z = legs.hl.rotation.z = -swing;
      // biting: rears back, snaps forward, settles back; once per attack on the caller's clock, else every biteCycle
      const s = Math.max(0, attackT ?? (t - since) % RAT.biteCycle);
      if (s < biteS) from = reach;                   // a new bite: it rears back from wherever the last one had got to
      biteS = s; reach = lungeAt(s, from);
      const lunge = reach * w.bite * up;
      body.position.x = lunge * 0.09;
      body.position.y = 0.15 + Math.abs(Math.sin(stride)) * 0.025 * w.scurry - 0.02 * w.down;
      body.rotation.z = -lunge * 0.3 - 0.06 * w.scurry;
      body.scale.y = 1 + Math.sin(t * 3 + phase) * 0.025 * up;
      head.rotation.z = 0.08 + sniff - 0.18 * w.scurry + 0.25 * Math.max(0, lunge) - 0.3 * w.down;
      head.rotation.y = look;
      // knocked over: rolled onto its side, legs stiff and out, the tail limp
      body.rotation.x = w.down * 1.5;
      for (const [name, l] of Object.entries(legs)) l.rotation.x = w.down * (name.endsWith('l') ? -0.45 : 0.45);
      const wave = (0.25 + 0.2 * w.scurry) * up, rate = 2.2 + 6 * w.scurry;
      tail.forEach((seg, i) => {
        seg.rotation.y = Math.sin(t * rate - i * 0.8 + phase) * wave * (0.4 + i * 0.12);
        seg.rotation.z = i ? 0.1 * (1 - w.scurry) * up + 0.03 : -0.35 + 0.25 * w.scurry + 0.3 * w.down;
      });
    },
  };
}

// --- the goblin -----------------------------------------------------------------------------------------------------

export type GoblinPose = 'idle' | 'walk' | 'attack' | 'down';

/** The goblin's look: the character at `scale` (about 1.37 m), his colours by material name in miner.glb turned into a
 *  goblin's, the clip each pose plays, how long he takes to fall over. One swing of his club is the Chop clip, 1.10 s
 *  long (the clip's own length: left to himself he swings again every 1.10 s), its blow landing `attackImpact` seconds
 *  in, the club's end then about 1.0 m in front of him, 0.85 m up and 0.25 m to his right (+z). Knocked over, he lands
 *  on his back on the club, which is hidden from `clubDown` of the way down (it would go into the ground). */
const GOBLIN_SCALE = 0.8;
export const GOBLIN = {
  scale: GOBLIN_SCALE,
  colours: {
    skin: '#86a24a', tunic: '#7a5b39', tunic_dark: '#5b432d', legs: '#4d4a2c', boots: '#33261a', hair: '#2a2418',
    eye: '#d8b02c', buckle: '#d6caa6', pouch: '#5e4a33',
  } as Record<string, string>,
  ear: { length: 0.2, width: 0.06 },
  club: { wood: '#8a5f3a', knot: '#6a4628', from: -0.36, to: -1.16, thin: 0.03, thick: 0.078 },
  clips: { idle: 'IdleFree', walk: GAIT.freeClip, attack: SWINGS.woodcutting.clip, down: 'IdleFree' } as Record<GoblinPose, string>,
  attackImpact: GOBLIN_SWING.lands,
  /** metres a second his walk covers at its own pace (the character's stride, at his size) */
  walkSpeed: GAIT.clipSpeed * GOBLIN_SCALE,
  fall: 0.45,
  clubDown: 0.85,
};

export interface GoblinModel {
  group: THREE.Group;
  /** His own mixer, run by update(): to see what plays, mixer.existingAction(clip) gives a clip's weight and time. */
  mixer: THREE.AnimationMixer;
  /** pose: what he is doing; t, dt: seconds (as the rat's); speed: metres a second he walks at, so his feet keep up
   *  (GOBLIN.walkSpeed if left out); attackT: while attacking, the seconds since the swing under way began, for swings
   *  the caller times: the Chop clip is held at that moment (its blow at GOBLIN.attackImpact), and once past its end he
   *  stands still, ready, until attackT starts again from 0. Left out, he swings on and on. Each new pose starts its
   *  clip from the beginning. */
  update(pose: GoblinPose, t: number, dt: number, speed?: number, attackT?: number): void;
  /** Play any clip in miner.glb by name (crossfading as the character does); update() then keeps it until the pose
   *  changes. */
  play(clip: string, fade?: number): void;
}

/** A goblin, built from miner.glb loaded for the goblins alone (`miner` is that glTF: the scene and the clips), once,
 *  then shared by every goblin, as showcase.ts does. Not the view's load: the view moves its Miner into the game's
 *  scene, and he is the player, wearing whatever the player wears. Each goblin is a copy with its own materials and
 *  mixer, so the load itself is never changed. */
export function goblinModel(miner: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }): GoblinModel {
  const source = miner.scene.getObjectByName('Miner');
  if (!source || source === miner.scene) {
    throw new Error('goblinModel needs miner.glb loaded for the goblins (once, shared by them all), not the view\'s load or its Miner');
  }
  const body = cloneRig(source);
  body.position.set(0, 0, 0); body.rotation.set(0, 0, 0); body.scale.setScalar(GOBLIN.scale);
  const find = (name: string) => {
    const o = body.getObjectByName(name);
    if (!o) throw new Error(`miner.glb has no ${name}`);
    return o;
  };
  // his own materials, recoloured: green skin, ragged browns
  const made = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  body.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.material as THREE.MeshStandardMaterial;
    let mat = made.get(src);
    if (!mat) {
      mat = src.clone();
      const colour = GOBLIN.colours[src.name];
      if (colour) mat.color.set(colour);
      made.set(src, mat);
    }
    m.material = mat; m.castShadow = true; m.receiveShadow = true;
  });
  const skin = (find('face') as THREE.Mesh).material as THREE.MeshStandardMaterial;      // his green, recoloured above
  // a bigger nose; pointed ears instead of round ones
  const nose = find('nose') as THREE.Mesh;
  nose.geometry = nose.geometry.clone();
  const nb = new THREE.Box3().setFromBufferAttribute(nose.geometry.getAttribute('position') as THREE.BufferAttribute), nc = nb.getCenter(new THREE.Vector3());
  nose.geometry.translate(-nc.x, -nc.y, -nc.z).scale(1.5, 1.35, 1.5).translate(nc.x + 0.02, nc.y - 0.01, nc.z);
  const head = find('head');
  for (const o of head.children) if (/^ear/.test(o.name)) o.visible = false;    // 'ear' and 'ear001' once loaded
  for (const s of [-1, 1]) {
    const { length, width } = GOBLIN.ear;
    const dir = new THREE.Vector3(-0.35, 0.4, s).normalize();
    const ear = part(new THREE.ConeGeometry(width, length, 4).scale(0.45, 1, 1), skin, head);
    ear.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    ear.position.set(-0.02, 0.01, s * 0.16).addScaledVector(dir, length / 2);
  }
  // a crude club on the tool's bone instead of his pick and axe: thin at the grip, thick and knotted at the end, merged
  // into a mesh per colour (parts.ts)
  for (const name of ['pick_head', 'pick_collar', 'pick_handle', 'axe_head', 'axe_blade']) find(name).visible = false;
  const c = GOBLIN.club, built = new THREE.Group(); built.name = 'club';
  const wood = flat(c.wood), knot = flat(c.knot);
  part(new THREE.CylinderGeometry(c.thin, c.thick, c.from - c.to, 6), wood, built, 0, (c.from + c.to) / 2, 0);
  part(new THREE.IcosahedronGeometry(c.thick * 0.85, 0), wood, built, 0, c.to + 0.02, 0);
  for (const [x, y, z] of [[0.06, -0.98, 0.02], [-0.05, -1.06, -0.04], [0.01, -0.9, -0.06], [-0.03, -1.12, 0.05]] as const) {
    part(new THREE.IcosahedronGeometry(0.03, 0), knot, built, x, y, z);
  }
  part(new THREE.CylinderGeometry(c.thin * 1.25, c.thin * 1.25, 0.12, 6), knot, built, 0, c.from - 0.12, 0);   // the grip, bound
  const club = mergeByMaterial(built); find('tool').add(club);

  const pivot = new THREE.Group(); pivot.add(body);           // he falls over about his heels
  const group = new THREE.Group(); group.add(pivot);
  const mixer = new THREE.AnimationMixer(body);
  const actions = new Map(miner.animations.map(clip => [clip.name, mixer.clipAction(clip)]));
  let current: THREE.AnimationAction | undefined;
  const play = (name: string, fade?: number) => {
    const next = actions.get(name);
    if (!next || next === current) return;
    next.reset().setEffectiveWeight(1).play();
    if (current) {
      const swap = ARMED_CLIPS.has(current.getClip().name) !== ARMED_CLIPS.has(name);
      current.crossFadeTo(next, fade ?? (swap ? FADE.swap : FADE.normal), false);
    }
    current = next;
  };
  let pose: GoblinPose | null = null, down = 0;
  play(GOBLIN.clips.idle, 0);
  return {
    group, mixer, play,
    update(next, _t, dt, speed = GOBLIN.walkSpeed, attackT) {
      if (next !== pose) {
        pose = next;
        if (pose === 'attack' && current === actions.get(GOBLIN.clips.attack)) current!.reset();   // a fresh swing
        play(GOBLIN.clips[pose]);
      }
      const walk = actions.get(GOBLIN.clips.walk);
      if (walk) walk.timeScale = speed / GOBLIN.walkSpeed;
      // a swing the caller times is held at attackT seconds in (and at its end once past it), as view.ts holds the
      // character's swings to the simulation; otherwise it plays on, over and over
      const swing = actions.get(GOBLIN.clips.attack);
      if (swing) {
        swing.timeScale = attackT === undefined ? 1 : 0;
        if (attackT !== undefined && pose === 'attack') swing.time = Math.min(Math.max(0, attackT), swing.getClip().duration);
      }
      // knocked over: he topples onto his back, quicker as he goes, and lies still
      down = Math.min(1, Math.max(0, down + (pose === 'down' ? 1 : -1) * dt / GOBLIN.fall));
      const fall = pose === 'down' ? down * down : smooth(down);
      pivot.rotation.z = fall * (Math.PI / 2 - 0.06);
      pivot.position.y = fall * 0.13;
      mixer.timeScale = 1 - 0.9 * fall;
      mixer.update(dt);
      // the club is hidden for the moment it moves between his back and his hands, as the character's tool is, and
      // once he lands on it
      club.visible = fall < GOBLIN.clubDown && !toolInTransit(actions.values());
    },
  };
}
