// Fog over land the player hasn't claimed yet: soft puffs drifting slowly, always facing the camera,
// drawn as one instanced mesh. Their colour follows the time of day.
import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { Layout } from '../world/layout';

function seeded(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

interface Puff { parcel: string; x: number; y: number; z: number; s: number; phase: number }

export class FogView {
  private mesh: THREE.InstancedMesh;
  private puffs: Puff[] = [];
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v = new THREE.Vector3(); private sc = new THREE.Vector3();

  constructor(scene: THREE.Scene, layout: Layout) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!, grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    const r = seeded(31);
    for (const p of layout.parcels) {
      const a = p.area, area = (a.maxX - a.minX) * (a.maxZ - a.minZ), n = Math.round(area / 2.6);
      for (let i = 0; i < n; i++) {
        // denser along the border with the village, so the edge reads as a wall of mist
        const edge = r() < 0.35, x = edge ? a.minX + r() * 2.5 : a.minX + r() * (a.maxX - a.minX);
        this.puffs.push({ parcel: p.id, x, y: 0.5 + r() * 2.2, z: a.minZ + r() * (a.maxZ - a.minZ), s: 3 + r() * 3.5, phase: r() * 100 });
      }
    }
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.62, color: '#eef3f5', fog: false }), this.puffs.length);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  update(t: number, camera: THREE.Camera, state: GameState, tint: THREE.Color): void {
    this.q.copy(camera.quaternion);
    let k = 0;
    for (const p of this.puffs) {
      if (state.parcels[p.parcel]?.claimed) continue;          // claimed land clears (step 7 animates this)
      this.v.set(p.x + Math.sin(t * 0.07 + p.phase) * 0.8, p.y + Math.sin(t * 0.21 + p.phase) * 0.15, p.z + Math.cos(t * 0.05 + p.phase) * 0.8);
      this.sc.set(p.s, p.s, 1);
      this.m.compose(this.v, this.q, this.sc); this.mesh.setMatrixAt(k++, this.m);
    }
    this.mesh.count = k; this.mesh.instanceMatrix.needsUpdate = true;
    (this.mesh.material as THREE.MeshBasicMaterial).color.copy(tint);
  }
}
