// Keeps the character's hands on the tool's handle. Every clip in miner.glb has its arms baked by a two-bone IK
// (assets-src/export_miner_glb.py), but the game crossfades clips, and a blend of two arm poses does not follow the
// blend of the two tool poses: on its own each fade would take the hands off the handle. After the mixer has run,
// ArmIK fixes the blended pose the same way the recipe checks it (draw_in and solve_arm there): if a grip has gone
// out of an arm's reach, the tool is drawn in toward the shoulders until both grips are in reach; then each arm's
// upper arm and forearm turn so its hand (marker HandL/HandR on fore_l/r) lands on its grip (GripL/GripR on the
// tool), the elbow bending toward its pole (PoleL/PoleR on the hips). Inside a single clip it changes nothing.
import * as THREE from 'three';

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
  private q = { upper: new THREE.Quaternion(), fore: new THREE.Quaternion(), parent: new THREE.Quaternion() };

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

  /** Put both hands back on the handle. Call after mixer.update(). */
  solve(): void {
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
      arm.upper.parent!.getWorldQuaternion(this.q.parent);
      arm.upper.quaternion.copy(this.q.parent.invert().multiply(this.q.upper));
      arm.fore.quaternion.copy(this.q.upper.invert().multiply(this.q.fore));
      arm.upper.updateMatrixWorld(true);
    }
  }
}
