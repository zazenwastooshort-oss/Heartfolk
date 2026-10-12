// Third-person camera, OSRS-style: circles the character, follows them, and is turned by the player
// (drag, arrow keys) and zoomed (wheel, pinch). It never turns on its own. Where something tall stands round the land
// (the camp's towering wall and its falls), `clearance` says how far a point is in front of it; the camera never goes
// behind it: it comes in along its line of sight to the character until it is in front.
import * as THREE from 'three';

const NEAREST = 0.6;                // the camera comes no nearer the character than this

export class OrbitCamera {
  readonly camera = new THREE.PerspectiveCamera(50, 1.6, 0.05, 200);
  yaw = Math.PI * 0.5;             // radians round the character; PI/2 looks from the front (+z)
  pitch = 38;                       // degrees above the ground
  dist = 13;                        // metres from the character, as the player zoomed it
  readonly look = new THREE.Vector3();
  /** How far a point is in front of anything the camera may not go behind (negative behind it), or null for nothing.
   *  The space in front must be convex (a plane, or the side of a wall that curves towards the land). */
  clearance: ((p: THREE.Vector3) => number) | null = null;
  /** How far the camera actually is from the character: `dist`, or nearer while it would be behind the wall. */
  reach = this.dist;
  private pulled = false;           // whether the wall brought it in, so it eases back out once clear
  private dir = new THREE.Vector3();
  private at = new THREE.Vector3();

  turn(dYaw: number, dPitch: number): void {
    this.yaw += dYaw; this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, 10, 82);
  }
  zoom(factor: number): void { this.dist = THREE.MathUtils.clamp(this.dist / factor, 2.5, 28); }

  /** How far along the line of sight from the look point the camera can go and stay in front (up to `dist`). The
   *  space in front is convex, so the line leaves it at most once: found by halving. */
  private allowed(): number {
    const clear = this.clearance, ok = (t: number) => clear!(this.at.copy(this.dir).multiplyScalar(t).add(this.look)) >= 0;
    if (!clear || ok(this.dist) || !ok(0)) return this.dist;
    let lo = 0, hi = this.dist;
    for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
    return Math.max(NEAREST, lo);
  }

  /** Ease towards the character; k = 1 snaps. */
  follow(target: THREE.Vector3, k: number): void {
    this.look.lerp(new THREE.Vector3(target.x, target.y + 1.0, target.z), k);
    const p = THREE.MathUtils.degToRad(this.pitch);
    this.dir.set(Math.cos(p) * Math.cos(this.yaw), Math.sin(p), Math.cos(p) * Math.sin(this.yaw));
    const want = this.allowed(), blocked = want < this.dist;
    // in at once, so the wall is never seen from behind; back out smoothly once clear; zooming is as it was
    if (want < this.reach || k >= 1 || (!blocked && !this.pulled)) this.reach = want;
    else this.reach += (want - this.reach) * k;
    if (blocked) this.pulled = true;
    else if (this.reach > this.dist - 0.01) { this.pulled = false; this.reach = this.dist; }
    this.camera.position.copy(this.dir).multiplyScalar(this.reach).add(this.look);
    this.camera.lookAt(this.look);
  }

  /** On a tall screen (a phone held upright) widen the view so it keeps a useful side-to-side field. */
  resize(aspect: number): void {
    const wanted = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(25)) / Math.max(aspect, 0.1)));
    this.camera.fov = aspect >= 1 ? 50 : THREE.MathUtils.clamp(wanted, 50, 72);
    this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
  }
}
