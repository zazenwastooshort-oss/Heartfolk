// Keeps the character's hands on the tool's handle. Every armed clip in miner.glb has its arms baked by a two-bone IK
// (assets-src/export_miner_glb.py), but the game crossfades clips, and a blend of two arm poses does not follow the
// blend of the two tool poses: on its own each fade would take the hands off the handle. After the mixer has run,
// ArmIK fixes the blended pose the same way the recipe checks it (draw_in and solve_arm there): if a grip has gone
// out of an arm's reach, the tool is drawn in toward the shoulders until both grips are in reach; then each arm's
// upper arm and forearm turn so its hand (marker HandL/HandR on fore_l/r) lands on its grip (GripL/GripR on the
// tool), the elbow bending toward its pole (PoleL/PoleR on the hips). Inside a single clip it changes nothing.
// The tool is in his hands while he works and on short hops to the next tree or rock (toolInHand); on longer walks,
// and whenever else he isn't working, the free clips carry it on his back with the arms keyed on their own, and ArmIK
// leaves them be (armedWeight). What he has out (heldTool): the tool for the job, his weapon, or (the camp build) his
// mallet while he builds, swung with the Mine clip once for each knock of the work (malletSwing), leaning down to
// something low (malletLean).
import * as THREE from 'three';
import type { GameState, PlayerState } from '../core/state';
import type { Layout } from '../world/layout';
import { carries } from '../core/tools';
import { ARMED_CLIPS, SHORT_HOP, SWINGS } from '../data/animation';
import { RESOURCES, TOOL_IDS, type ToolId } from '../data/skills';
import { CARPENTRY } from '../data/building';
import type { GearId } from '../data/combat';

/** Whether he has the tool in his hands: while he works a node (waiting at a stump or an empty rock included), and
 *  since 0.0.21 on a short walk to one (under SHORT_HOP along his path: on to the next tree or rock, or the last stretch
 *  of a longer walk to work). On longer walks (to work from afar, back to work from the bank) and on every other walk
 *  (to the bank, a tapped spot, a building), and the rest of the time (standing about, the moment at the bank door) it
 *  is on his back and his arms are free (the owner, 11 and 12 Oct 2026). Fighting (0.0.22: practising on the training
 *  dummy) his weapon is in his hands, as a tool is at work, and (chapter 2) on a short walk on to the next rat; building
 *  (the camp build) his mallet. */
export function toolInHand(p: Pick<PlayerState, 'task' | 'pending' | 'path' | 'pos'>): boolean {
  if (p.task.kind === 'gather' || p.task.kind === 'fight' || p.task.kind === 'raise') return true;
  if (p.task.kind !== 'walk' || (p.pending?.kind !== 'node' && p.pending?.kind !== 'fight')) return false;
  let left = 0, at = p.pos;
  for (const w of p.path) { left += Math.hypot(w.x - at.x, w.z - at.z); at = w; if (left >= SHORT_HOP) return false; }
  return true;
}

/** What he can have out: one of his tools, the weapon he wears (by its id in GEAR), or (the camp build, D11) his
 *  mallet, which isn't one of his tools (nothing to make, fetch or keep in the chest): it is out only while he builds. */
export type Held = ToolId | GearId | 'mallet';

/** What is drawn on him (T2.11): building, the mallet in his hands; fighting, or on his way to, the weapon he wears
 *  (`weapon`, when there is a model for it: `weapons`); fishing, the rod (only then: it is too long to carry on his
 *  back); at work at a tree or rock, or on his way to one, its tool if he carries it; otherwise the one he last had out
 *  (`last`) if he still carries it, else any he carries, else none. A tool kept in the storage chest isn't on him
 *  (core/tools.ts carries). */
export function heldTool(state: GameState, layout: Layout, last: Held | null, weapons: ReadonlySet<string>): Held | null {
  const p = state.player, task = p.task, weapon = state.equipment.weapon;
  if (task.kind === 'raise') return 'mallet';
  const workId = task.kind === 'gather' ? task.nodeId : p.pending?.kind === 'node' ? p.pending.id : null;
  const spot = workId ? layout.nodes.find(n => n.id === workId) : undefined;
  const swing = spot ? SWINGS[RESOURCES[spot.resource]!.skill] : null;
  const fighting = task.kind === 'fight' || p.pending?.kind === 'fight';
  const owns = (t: Held | null | undefined): t is Held => !!t && t !== 'mallet' && (weapons.has(t) ? t === weapon : carries(state, t as ToolId));
  const onBack = (t: Held | null | undefined): t is Held => owns(t) && t !== 'rod';
  if (fighting && owns(weapon)) return weapon!;
  if (swing?.tool === 'rod' && task.kind === 'gather' && owns('rod')) return 'rod';
  if (swing && onBack(swing.tool)) return swing.tool;
  if (onBack(last)) return last;
  return TOOL_IDS.find(onBack) ?? null;
}

/** Where the Mine clip is (seconds into it) while he builds, after `worked` seconds of work (GameState.underway): a
 *  swing of his mallet for each knock, landing (the clip's impact) on the knock itself (CARPENTRY.knock: when its
 *  Carpentry XP comes); between swings he stands ready, the mallet in his hands (null: the armed Idle). */
export function malletSwing(worked: number): number | null {
  const swing = SWINGS.mining, k = CARPENTRY.knock;
  const into = ((worked + swing.impact) % k + k) % k;
  return into < swing.cycle ? into : null;
}

/** Leaning down to something low (CARPENTRY.low) as his mallet comes down on it: how far (radians, forward) `at`
 *  seconds into the Mine clip, most at the moment it lands (`lean`), from `from` seconds in and back up by the end of
 *  the swing, so the strike comes down on the top of a campfire's stones or a chest's boards instead of over them. */
export const LOW_KNOCK = { lean: 0.45, from: 0.4 };
const smooth = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
export function malletLean(at: number | null): number {
  const { impact, cycle } = SWINGS.mining;
  if (at === null || at <= LOW_KNOCK.from) return 0;
  if (at < impact) return LOW_KNOCK.lean * smooth((at - LOW_KNOCK.from) / (impact - LOW_KNOCK.from));
  return LOW_KNOCK.lean * (1 - smooth((at - impact) / (cycle - impact)));
}

/** How much of the blended pose comes from clips that hold the tool, for ArmIK.solve: 0 while the clip being faded
 *  to is a free one, so the hands let go of the handle as the tool goes onto his back; fading into an armed clip it
 *  rises with the armed clips' weight, so the hands take hold of the handle as he takes it out, and it is 1 inside an
 *  armed clip or a fade between two. Call after mixer.update(). */
export function armedWeight(actions: Iterable<THREE.AnimationAction>, target: THREE.AnimationAction | undefined): number {
  if (!target || !ARMED_CLIPS.has(target.getClip().name)) return 0;
  let w = 0;
  for (const a of actions) if (a.isScheduled() && ARMED_CLIPS.has(a.getClip().name)) w += a.getEffectiveWeight();
  return Math.min(1, w);
}

/** Whether a fade between an armed and a free clip is under way. The blend would swing the tool straight through his
 *  body on its way between his hands and his back, so the view hides it for that short swap (FADE.swap in
 *  data/animation). Call after mixer.update(). */
export function toolInTransit(actions: Iterable<THREE.AnimationAction>): boolean {
  let armed = 0, free = 0;
  for (const a of actions) {
    if (!a.isScheduled()) continue;
    if (ARMED_CLIPS.has(a.getClip().name)) armed += a.getEffectiveWeight(); else free += a.getEffectiveWeight();
  }
  return armed > 1e-3 && free > 1e-3;
}

interface Arm {
  upper: THREE.Object3D; fore: THREE.Object3D; grip: THREE.Object3D; pole: THREE.Object3D;
  a: number; b: number;                  // upper arm and forearm lengths
  reach: number;                         // how far the hand can get from the shoulder (the arm straight)
  upperFrame: THREE.Matrix4;             // each bone's own frame (along it, across it, the hinge axis) in its local
  foreFrame: THREE.Matrix4;              // axes, inverted: a posed frame times this is the bone's world rotation
  shoulder: THREE.Vector3; target: THREE.Vector3;   // this frame's shoulder and grip, world space
}

const across = new THREE.Vector3();
/** The orthonormal frame (as matrix columns): along the bone, across it in the bend plane, the hinge axis. */
function frame(axis: THREE.Vector3, hinge: THREE.Vector3, out: THREE.Matrix4): THREE.Matrix4 {
  return out.makeBasis(axis, across.crossVectors(hinge, axis), hinge);
}

export class ArmIK {
  private arms: Arm[];
  private tool: THREE.Object3D;
  private v = { d: new THREE.Vector3(), u: new THREE.Vector3(), w: new THREE.Vector3(), p: new THREE.Vector3(), e: new THREE.Vector3(),
                t: new THREE.Vector3(), n: new THREE.Vector3(), axis: new THREE.Vector3(), move: new THREE.Vector3() };
  private m = new THREE.Matrix4();
  private q = { upper: new THREE.Quaternion(), fore: new THREE.Quaternion(), parent: new THREE.Quaternion(),
                rawUpper: new THREE.Quaternion(), rawFore: new THREE.Quaternion() };

  /** `model` is the character (the glTF scene's Miner node), still in its rest pose: make this before the mixer runs. */
  constructor(private model: THREE.Object3D) {
    const find = (name: string) => {
      const o = model.getObjectByName(name);
      if (!o) throw new Error(`miner.glb has no ${name}`);
      return o;
    };
    this.arms = (['l', 'r'] as const).map(s => {
      const S = s.toUpperCase();
      const upper = find(`upper_${s}`), fore = find(`fore_${s}`), hand = find(`Hand${S}`);
      if (fore.parent !== upper || hand.parent !== fore) throw new Error(`miner.glb: unexpected arm hierarchy (${s})`);
      // the rest pose in the upper arm's own axes: shoulder at 0, the elbow, the hand centre
      const elbow = fore.position.clone();
      const handPos = hand.position.clone().applyQuaternion(fore.quaternion).add(elbow);
      const a = elbow.length(), b = handPos.distanceTo(elbow);
      const u = handPos.clone().normalize();
      const w = elbow.clone().addScaledVector(u, -elbow.dot(u)).normalize();
      const hinge = new THREE.Vector3().crossVectors(u, w);
      const toFore = fore.quaternion.clone().invert();
      return {
        upper, fore, grip: find(`Grip${S}`), pole: find(`Pole${S}`), a, b, reach: a + b - 1e-6,
        upperFrame: frame(elbow.clone().normalize(), hinge, new THREE.Matrix4()).invert(),
        foreFrame: frame(handPos.clone().sub(elbow).normalize().applyQuaternion(toFore), hinge.clone().applyQuaternion(toFore),
                         new THREE.Matrix4()).invert(),
        shoulder: new THREE.Vector3(), target: new THREE.Vector3(),
      };
    });
    this.tool = this.arms[0]!.grip.parent!;
  }

  /** Put both hands back on the handle, `weight` of the way (armedWeight): fully in an armed clip, partly while one
   *  fades in over a free clip, not at all in a free clip (the hands are off the handle there). Call after
   *  mixer.update(). */
  solve(weight = 1): void {
    if (weight <= 0) return;
    weight = Math.min(1, weight);
    const { d, u, w, p, e, t, n, axis, move } = this.v;
    this.model.updateMatrixWorld(true);
    for (const arm of this.arms) { arm.upper.getWorldPosition(arm.shoulder); arm.grip.getWorldPosition(arm.target); }
    // draw the tool in until both grips are within reach (alternating projections onto the two reach balls, which
    // always overlap: the shoulders are 0.54 m apart, the grips 0.08 m)
    move.set(0, 0, 0);
    for (let i = 0; i < 8; i++) {
      for (const arm of this.arms) {
        d.copy(arm.target).add(move).sub(arm.shoulder);
        const len = d.length();
        if (len > arm.reach) move.addScaledVector(d, -(1 - arm.reach / len));
      }
    }
    move.multiplyScalar(weight);
    if (move.lengthSq() > 0) {
      this.tool.position.copy(this.tool.parent!.worldToLocal(this.tool.getWorldPosition(d).add(move)));
      this.tool.updateMatrixWorld(true);
      for (const arm of this.arms) arm.target.add(move);
    }
    // two-bone IK per arm, as solve_arm in the recipe
    for (const arm of this.arms) {
      const { a, b, shoulder: s } = arm;
      d.subVectors(arm.target, s);
      const dist = d.length();
      u.copy(d).divideScalar(dist);
      const reach = Math.min(Math.max(dist, Math.abs(a - b) + 1e-4), a + b - 1e-6);
      const x = (a * a - b * b + reach * reach) / (2 * reach), h = Math.sqrt(Math.max(a * a - x * x, 0));
      arm.pole.getWorldPosition(p).sub(s);
      w.copy(p).addScaledVector(u, -p.dot(u));
      if (w.lengthSq() < 1e-10) { arm.fore.getWorldPosition(w).sub(s); w.addScaledVector(u, -w.dot(u)); }   // keep the current bend
      w.normalize();
      e.copy(s).addScaledVector(u, x).addScaledVector(w, h);            // the elbow
      t.copy(s).addScaledVector(u, reach);                               // the hand
      n.crossVectors(u, w);
      this.q.upper.setFromRotationMatrix(this.m.multiplyMatrices(frame(axis.subVectors(e, s).divideScalar(a), n, this.m), arm.upperFrame));
      this.q.fore.setFromRotationMatrix(this.m.multiplyMatrices(frame(axis.subVectors(t, e).divideScalar(b), n, this.m), arm.foreFrame));
      this.q.rawUpper.copy(arm.upper.quaternion); this.q.rawFore.copy(arm.fore.quaternion);
      arm.upper.parent!.getWorldQuaternion(this.q.parent);
      arm.upper.quaternion.copy(this.q.parent.invert().multiply(this.q.upper));
      arm.fore.quaternion.copy(this.q.upper.invert().multiply(this.q.fore));
      if (weight < 1) {                  // part of the way from the arms the clips give toward the handle
        arm.upper.quaternion.copy(this.q.rawUpper.slerp(arm.upper.quaternion, weight));
        arm.fore.quaternion.copy(this.q.rawFore.slerp(arm.fore.quaternion, weight));
      }
      arm.upper.updateMatrixWorld(true);
    }
  }
}
