// Third-person camera, OSRS-style: circles the character, follows them, and is turned by the player
// (drag, arrow keys) and zoomed (wheel, pinch). It never turns on its own.
import * as THREE from 'three';

export class OrbitCamera {
  readonly camera = new THREE.PerspectiveCamera(50, 1.6, 0.05, 200);
  yaw = Math.PI * 0.5;             // radians round the character; PI/2 looks from the front (+z)
  pitch = 38;                       // degrees above the ground
  dist = 13;                        // metres from the character
  readonly look = new THREE.Vector3();

  turn(dYaw: number, dPitch: number): void {
    this.yaw += dYaw; this.pitch = THREE.MathUtils.clamp(this.pitch + dPitch, 10, 82);
  }
  zoom(factor: number): void { this.dist = THREE.MathUtils.clamp(this.dist / factor, 2.5, 28); }

  /** Ease towards the character; k = 1 snaps. */
  follow(target: THREE.Vector3, k: number): void {
    this.look.lerp(new THREE.Vector3(target.x, target.y + 1.0, target.z), k);
    const p = THREE.MathUtils.degToRad(this.pitch);
    this.camera.position.set(Math.cos(p) * Math.cos(this.yaw), Math.sin(p), Math.cos(p) * Math.sin(this.yaw))
      .multiplyScalar(this.dist).add(this.look);
    this.camera.lookAt(this.look);
  }

  /** On a tall screen (a phone held upright) widen the view so it keeps a useful side-to-side field. */
  resize(aspect: number): void {
    const wanted = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(25)) / Math.max(aspect, 0.1)));
    this.camera.fov = aspect >= 1 ? 50 : THREE.MathUtils.clamp(wanted, 50, 72);
    this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
  }
}
