// The character's hands stay on the tool's handle while the game crossfades clips (src/render/arms.ts). Loads the
// real assets/models/miner.glb and drives it the way src/render/view.ts does: an AnimationMixer, 0.18 s crossfades,
// the swing clips frozen (timeScale 0) with their time set from the swing's progress, so an interrupted swing stays
// where it was while the next clip fades in. The free clips (the tool on his back) are left alone by the IK, and the
// rule for when he holds the tool runs headless on the simulation.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { ArmIK, armedWeight, heldTool, LOW_KNOCK, malletLean, malletSwing, toolInHand, toolInTransit, type Held } from '../src/render/arms';
import { malletModel } from '../src/render/campmodels';
import { WEAPON_MODELS } from '../src/render/gear';
import { CARPENTRY } from '../src/data/building';
import { wear } from '../src/systems/combat';
import { CAMP } from '../src/world/camp';
import { ARMED_CLIPS, FADE, GAIT, IDLE, SWINGS } from '../src/data/animation';
import { createState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { step } from '../src/sim';
import { VILLAGE } from '../src/world/layout';
import { applyCommands, type Command } from '../src/systems/commands';

const bytes = readFileSync(new URL('../assets/models/miner.glb', import.meta.url));
const load = (): Promise<GLTF> => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
const CLIPS = ['Idle', 'Walk', 'Run', 'Mine', 'Chop'];        // armed: the tool in both hands
const FREE = [IDLE.freeClip, GAIT.freeClip];                   // the tool on his back, the arms free
const SWING = new Set(['Mine', 'Chop']);
const BONES = ['upper_l', 'fore_l', 'upper_r', 'fore_r'];

function rig(gltf: GLTF) {
  const miner = gltf.scene.getObjectByName('Miner')!;
  const ik = new ArmIK(miner);                      // before the mixer first runs, as in view.ts
  const mixer = new THREE.AnimationMixer(miner);
  const actions = Object.fromEntries(gltf.animations.map(c => [c.name, mixer.clipAction(c)]));
  for (const name of SWING) actions[name]!.timeScale = 0;
  const marker = (name: string) => miner.getObjectByName(name)!;
  const pairs = (['L', 'R'] as const).map(s => [marker(`Hand${s}`), marker(`Grip${s}`)] as const);
  /** The larger distance between a hand centre and its grip on the handle, metres. */
  const gap = () => {
    miner.updateMatrixWorld(true);
    return Math.max(...pairs.map(([h, g]) => h.getWorldPosition(new THREE.Vector3()).distanceTo(g.getWorldPosition(new THREE.Vector3()))));
  };
  const handPos = () => { miner.updateMatrixWorld(true); return pairs.map(([h]) => h.getWorldPosition(new THREE.Vector3())); };
  let current: THREE.AnimationAction | undefined;
  const play = (name: string, fade?: number) => {    // view.ts play()
    const next = actions[name]!; if (next === current) return;
    next.reset().setEffectiveWeight(1).play();
    if (current) {
      const swap = ARMED_CLIPS.has(current.getClip().name) !== ARMED_CLIPS.has(name);
      current.crossFadeTo(next, fade ?? (swap ? FADE.swap : FADE.normal), false);
    }
    current = next;
  };
  const reset = () => { mixer.stopAllAction(); current = undefined; };
  const solve = () => ik.solve(armedWeight(Object.values(actions), current));   // as view.ts draw()
  // a marker in the torso's frame at rest, the hips' own movement taken out: +x forward, +y up, -z his left
  const hips = marker('hips');
  miner.updateMatrixWorld(true);
  const hipsRest = hips.matrixWorld.clone();
  const inTorso = (name: string) => {
    miner.updateMatrixWorld(true);
    const m = hipsRest.clone().multiply(hips.matrixWorld.clone().invert());
    return marker(name).getWorldPosition(new THREE.Vector3()).applyMatrix4(m);
  };
  return { miner, ik, mixer, actions, gap, handPos, play, reset, solve, inTorso };
}

describe('arm IK', () => {
  it('finds every clip and marker in miner.glb, and knows which clips hold the tool', async () => {
    const r = rig(await load());
    for (const c of [...CLIPS, ...FREE]) expect(r.actions[c], c).toBeDefined();
    expect([...ARMED_CLIPS].sort()).toEqual([...CLIPS].sort());
  });

  it('changes nothing inside a single clip', async () => {
    // sampled on the baked keys (100 per second); between keys the interpolated arm can be a fraction of a millimetre
    // off, and near a straight arm (the mining impact) putting that right turns the forearm a degree or so
    const r = rig(await load());
    const bones = BONES.map(n => r.miner.getObjectByName(n)!);
    let worstTurn = 0, worstGap = 0;
    for (const clip of CLIPS) {
      r.reset(); r.play(clip, 0);
      const keys = Math.round(r.actions[clip]!.getClip().duration * 100);
      for (let i = 0; i <= keys; i += 3) {
        r.actions[clip]!.time = i / 100;
        r.mixer.update(0);
        worstGap = Math.max(worstGap, r.gap());
        const before = bones.map(b => b.quaternion.clone());
        r.ik.solve();
        bones.forEach((b, k) => { worstTurn = Math.max(worstTurn, THREE.MathUtils.radToDeg(b.quaternion.angleTo(before[k]!))); });
      }
    }
    expect(worstGap, 'the clips already hold the handle').toBeLessThan(0.003);
    expect(worstTurn, 'degrees the IK turns an arm bone inside a clip').toBeLessThan(0.5);
  });

  it('keeps both hands on the handle through every crossfade, from any phase, interrupted swings included', async () => {
    const worst: Record<string, { raw: number; fixed: number }> = {};
    for (const from of CLIPS) {
      for (const to of CLIPS) {
        if (from === to) continue;
        const r = rig(await load());
        const fromDur = r.actions[from]!.getClip().duration;
        let raw = 0, fixed = 0;
        for (let k = 0; k < 8; k++) {
          r.reset(); r.play(from, 0);
          r.actions[from]!.time = (k / 8) * fromDur;    // a swing stays frozen here once it is left
          r.mixer.update(0);
          r.play(to);
          for (let f = 1; f <= 15; f++) {               // 0.25 s at 60 fps covers the 0.18 s fade
            if (SWING.has(to)) r.actions[to]!.time = f / 60;
            r.mixer.update(1 / 60);
            raw = Math.max(raw, r.gap());
            r.solve();
            fixed = Math.max(fixed, r.gap());
          }
        }
        worst[`${from}->${to}`] = { raw, fixed };
      }
    }
    const off = Object.entries(worst).filter(([, w]) => w.fixed > 0.003).map(([k, w]) => `${k}: ${(w.fixed * 100).toFixed(1)} cm`);
    expect(off, 'hand off its grip during a fade (blended alone: ' +
      Object.entries(worst).map(([k, w]) => `${k} ${(w.raw * 100).toFixed(0)} cm`).join(', ') + ')').toEqual([]);
  });

  it('leaves the free clips alone: the hands are off the handle and the handle stays behind the torso', async () => {
    const r = rig(await load());
    const bones = BONES.map(n => r.miner.getObjectByName(n)!);
    let nearest = Infinity, turned = 0, front = -Infinity;
    for (const clip of FREE) {
      r.reset(); r.play(clip, 0);
      const keys = Math.round(r.actions[clip]!.getClip().duration * 100);
      for (let i = 0; i <= keys; i += 3) {
        r.actions[clip]!.time = i / 100;
        r.mixer.update(0);
        nearest = Math.min(nearest, r.gap());
        const before = bones.map(b => b.quaternion.clone());
        r.solve();
        bones.forEach((b, k) => { turned = Math.max(turned, b.quaternion.angleTo(before[k]!)); });
        // both grips (the handle's lower half) behind his back: the torso reaches 0.17 m behind the shoulder line
        for (const m of ['GripL', 'GripR']) front = Math.max(front, r.inTorso(m).x);
      }
    }
    expect(nearest, 'metres the nearer hand comes to its grip').toBeGreaterThan(0.1);
    expect(turned, 'radians the IK turned an arm bone in a free clip').toBeLessThan(1e-6);
    expect(front, 'how far forward the handle on his back comes (m)').toBeLessThan(-0.17);
  });

  it('lets go of the handle fading to a free clip, and takes hold of it smoothly fading back', async () => {
    const r = rig(await load());
    const bones = BONES.map(n => r.miner.getObjectByName(n)!);
    const issues: string[] = [];
    for (const from of [...CLIPS, ...FREE]) {
      for (const to of [...CLIPS, ...FREE]) {
        if (from === to || (CLIPS.includes(from) && CLIPS.includes(to))) continue;   // armed to armed: the test above
        const fromDur = r.actions[from]!.getClip().duration;
        let jump = 0, touched = 0;
        for (let k = 0; k < 4; k++) {
          r.reset(); r.play(from, 0);
          r.actions[from]!.time = (k / 4) * fromDur;
          r.mixer.update(0); r.solve();
          let last = r.handPos();
          r.play(to);
          for (let f = 1; f <= 15; f++) {
            if (SWING.has(to)) r.actions[to]!.time = f / 60;
            r.mixer.update(1 / 60);
            // the tool is hidden while it goes between his hands and his back (the quick swap fade, about 7 frames)
            const transit = toolInTransit(Object.values(r.actions));
            const swap = CLIPS.includes(from) !== CLIPS.includes(to), swapFrames = Math.floor(FADE.swap * 60);
            if (transit !== (swap && f <= swapFrames) && f !== swapFrames + 1) issues.push(`${from}->${to}: tool ${transit ? 'hidden' : 'shown'} at frame ${f}`);
            const before = bones.map(b => b.quaternion.clone());
            r.solve();
            if (FREE.includes(to)) bones.forEach((b, i) => { touched = Math.max(touched, b.quaternion.angleTo(before[i]!)); });
            const now = r.handPos();
            jump = Math.max(jump, ...now.map((p, i) => p.distanceTo(last[i]!)));
            last = now;
          }
          const end = r.gap();                          // 0.25 s in, the fade is over
          if (FREE.includes(to) && end < 0.1) issues.push(`${from}->${to}: a hand still ${(end * 100).toFixed(0)} cm from the handle`);
          if (CLIPS.includes(to) && end > 0.003) issues.push(`${from}->${to}: a hand ${(end * 100).toFixed(1)} cm off the handle after the fade`);
        }
        if (touched > 1e-6) issues.push(`${from}->${to}: the IK moved the arms fading to a free clip`);
        // a 0.18 s fade moves a hand up to about 12 cm a frame at 60 fps (as between two armed clips, Mine to Run);
        // snapping onto the handle at the start of a fade into an armed clip would jump 50-65 cm
        if (jump > 0.2) issues.push(`${from}->${to}: a hand jumped ${(jump * 100).toFixed(0)} cm in one frame`);
      }
    }
    expect(issues).toEqual([]);
  });
});

describe('tool in hand or on his back', () => {
  it('holds it while he works and on short hops to the next node, and slings it on his back on longer walks and otherwise', () => {
    const state = createState(VILLAGE, 4), events = new EventBus(), log: GameEvent[] = [];
    events.on(e => log.push(e));
    const ctx = { layout: VILLAGE, rng: createRng(4), events };
    const send = (...c: Command[]) => applyCommands(state, VILLAGE, c, events);
    const runUntil = (done: () => boolean, max: number) => { for (let t = 0; t < max && !done(); t += STEP) step(state, STEP, ctx); };
    const p = state.player, held = () => toolInHand(p);

    expect(held(), 'standing about at the start').toBe(false);
    send({ type: 'work', nodeId: 'birch1' });
    expect(p.task.kind).toBe('walk');
    expect(held(), 'on his way to a tree').toBe(false);
    runUntil(() => p.task.kind === 'gather', 60);
    expect(held(), 'chopping').toBe(true);
    runUntil(() => log.some(e => e.type === 'backpackFull'), 600);
    expect(p.pending?.kind).toBe('visit');
    expect(held(), 'on a trip to the bank').toBe(false);
    runUntil(() => p.task.kind === 'idle', 120);
    expect(held(), 'the moment at the bank door').toBe(false);
    runUntil(() => p.task.kind === 'walk', 30);
    expect(p.pending?.kind).toBe('node');
    expect(held(), 'back to work from the bank').toBe(false);
    send({ type: 'walk', to: VILLAGE.start });
    expect(p.task.kind).toBe('walk');
    expect(held(), 'walking to a tapped spot').toBe(false);
    send({ type: 'visit', id: VILLAGE.buildings.find(b => b.kind !== 'bank')!.id });
    expect(p.task.kind).toBe('walk');
    expect(held(), 'visiting a building').toBe(false);
    // waiting at a stump he was sent to is still work
    const still = { pos: { x: 0, z: 0 }, path: [], pending: null };
    expect(toolInHand({ ...still, task: { kind: 'gather', nodeId: 'birch1', progress: 0 } })).toBe(true);
    // a short hop on to the next tree keeps it in his hands; a long walk to one, or a walk anywhere else, doesn't
    const walk = { kind: 'walk' as const }, node = { kind: 'node' as const, id: 'birch2' };
    expect(toolInHand({ task: walk, pending: node, pos: { x: 0, z: 0 }, path: [{ x: 3, z: 0 }, { x: 3, z: 4 }] }), 'a 7 m hop').toBe(true);
    expect(toolInHand({ task: walk, pending: node, pos: { x: 0, z: 0 }, path: [{ x: 6, z: 0 }, { x: 6, z: 6 }] }), 'a 12 m walk').toBe(false);
    expect(toolInHand({ task: walk, pending: null, pos: { x: 0, z: 0 }, path: [{ x: 2, z: 0 }] }), 'a short walk to a spot').toBe(false);
  });
});

describe('his mallet while he builds (the camp build: D11, T2.11)', () => {
  const WEAPONS = new Set(Object.keys(WEAPON_MODELS));

  it('has it in his hands only while he builds, never on the walk there; otherwise the tool for the job or one he carries', () => {
    const state = createState(CAMP, 4), p = state.player;
    state.tools = { axe: true, pick: true, rod: true };
    const held = (last: Held | null = null) => heldTool(state, CAMP, last, WEAPONS);
    expect(held(), 'standing about').toBe('axe');
    expect(held('pick'), 'the one he last had out').toBe('pick');
    p.task = { kind: 'raise', id: 'campfire' };
    expect(held('pick'), 'building').toBe('mallet');
    expect(toolInHand(p), 'building').toBe(true);
    p.task = { kind: 'walk' }; p.pending = { kind: 'raise', id: 'campfire' }; p.path = [{ x: 0, z: 0 }];
    expect(held('pick'), 'on his way to build').toBe('pick');
    expect(toolInHand(p), 'on his way to build').toBe(false);
    p.task = { kind: 'idle' }; p.pending = null; p.path = [];
    expect(held('mallet'), 'done building: back to a tool he carries').toBe('axe');
    const birch = CAMP.nodes.find(n => n.resource === 'birch_tree')!, fish = CAMP.nodes.find(n => n.resource === 'fishing_spot')!;
    p.task = { kind: 'gather', nodeId: birch.id, progress: 0 };
    expect(held('pick'), 'chopping').toBe('axe');
    p.task = { kind: 'gather', nodeId: fish.id, progress: 0 };
    expect(held('axe'), 'fishing').toBe('rod');
    p.task = { kind: 'idle' };
    expect(held('rod'), 'the rod is never carried on his back').toBe('axe');
    wear(state, 'stone_club');
    p.task = { kind: 'fight', target: 'dummy', progress: 0 };
    expect(held('axe'), 'practising').toBe('stone_club');
    // a tool kept in the storage chest isn't on him
    p.task = { kind: 'idle' }; state.toolsInChest = ['axe', 'pick'];
    expect(held('axe'), 'tools in the chest').toBeNull();
    p.task = { kind: 'raise', id: 'campfire' };
    expect(held(), 'building, whatever is in the chest').toBe('mallet');
  });

  it('swings it once for each knock of the work, landing on the knock, standing ready between', () => {
    const { impact, cycle } = SWINGS.mining;
    for (let k = 1; k <= 5; k++) expect(malletSwing(k * CARPENTRY.knock)).toBeCloseTo(impact, 9);
    expect(malletSwing(CARPENTRY.knock - impact)).toBeCloseTo(0, 9);            // the swing begins
    expect(malletSwing(CARPENTRY.knock - impact + cycle + 0.01)).toBeNull();   // and is over: he stands ready
    let swinging = 0;
    for (let t = 0; t < 30; t += 0.01) if (malletSwing(t) !== null) swinging += 0.01;
    expect(swinging / 30).toBeCloseTo(cycle / CARPENTRY.knock, 1);
  });

  it('lands its face on what he builds: CARPENTRY.reach in front of him at the strike, coming down a little beyond it', async () => {
    const gltf = await load(), miner = gltf.scene.getObjectByName('Miner')!;
    const mallet = malletModel(), tool = miner.getObjectByName('pick_head')!.parent!;
    tool.add(mallet.model);
    const mixer = new THREE.AnimationMixer(miner), swing = mixer.clipAction(gltf.animations.find(c => c.name === SWINGS.mining.clip)!);
    swing.play(); swing.timeScale = 0;
    const faceAt = (t: number) => { swing.time = t; mixer.update(0); miner.updateMatrixWorld(true); return mallet.face.getWorldPosition(new THREE.Vector3()); };
    // he faces +x in his own frame (render/view.ts turns him by his heading)
    const hit = faceAt(SWINGS.mining.impact);
    expect(Math.abs(hit.x - CARPENTRY.reach), `lands ${hit.x.toFixed(2)} m in front of him`).toBeLessThan(0.1);
    expect(Math.abs(hit.z)).toBeLessThan(0.05);
    expect(hit.y).toBeGreaterThan(0.3); expect(hit.y).toBeLessThan(1.0);
    let deepest = 0;
    for (let t = 0; t <= SWINGS.mining.cycle; t += 0.01) { const f = faceAt(t); if (f.y < 1.5) deepest = Math.max(deepest, f.x); }
    expect(deepest, 'the furthest the face reaches on the way down, coming down onto the face').toBeLessThan(CARPENTRY.reach + 0.2);
    // leaning down to something low (CARPENTRY.low, footings), it lands on top of it, a little further out and low down
    expect(malletLean(null)).toBe(0); expect(malletLean(0)).toBe(0);
    expect(malletLean(SWINGS.mining.impact)).toBeCloseTo(LOW_KNOCK.lean, 9);
    miner.rotation.z = -malletLean(SWINGS.mining.impact);
    const low = faceAt(SWINGS.mining.impact);
    expect(low.y, 'leaning down').toBeLessThan(0.35); expect(low.y).toBeGreaterThan(0.1);
    expect(low.x).toBeGreaterThan(CARPENTRY.reach); expect(low.x).toBeLessThan(1.0);
  });
});
