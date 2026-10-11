// The character's hands stay on the tool's handle while the game crossfades clips (src/render/arms.ts). Loads the
// real assets/models/miner.glb and drives it the way src/render/view.ts does: an AnimationMixer, 0.18 s crossfades,
// the swing clips frozen (timeScale 0) with their time set from the swing's progress, so an interrupted swing stays
// where it was while the next clip fades in.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { ArmIK } from '../src/render/arms';

const bytes = readFileSync(new URL('../assets/models/miner.glb', import.meta.url));
const load = (): Promise<GLTF> => new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
const CLIPS = ['Idle', 'Walk', 'Run', 'Mine', 'Chop'];
const SWING = new Set(['Mine', 'Chop']);

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
  let current: THREE.AnimationAction | undefined;
  const play = (name: string, fade = 0.18) => {      // view.ts play()
    const next = actions[name]!; if (next === current) return;
    next.reset().setEffectiveWeight(1).play();
    if (current) current.crossFadeTo(next, fade, false);
    current = next;
  };
  const reset = () => { mixer.stopAllAction(); current = undefined; };
  return { miner, ik, mixer, actions, gap, play, reset };
}

describe('arm IK', () => {
  it('finds every clip and marker in miner.glb', async () => {
    const r = rig(await load());
    for (const c of CLIPS) expect(r.actions[c], c).toBeDefined();
  });

  it('changes nothing inside a single clip', async () => {
    // sampled on the baked keys (100 per second); between keys the interpolated arm can be a fraction of a millimetre
    // off, and near a straight arm (the mining impact) putting that right turns the forearm a degree or so
    const r = rig(await load());
    const bones = ['upper_l', 'fore_l', 'upper_r', 'fore_r'].map(n => r.miner.getObjectByName(n)!);
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
            r.ik.solve();
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
});
