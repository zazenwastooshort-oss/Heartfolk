// Fishing (chapter 2): the fishing spots out in the pool and along the river (layout.nodes whose resource is drawn as
// 'Ripples'), each a gentle ring of ripples spreading on the water while there are fish (none while the spot is quiet,
// after the fish moved off; fainter at night), with an invisible hit area tagged with its id (userData.nodeId) for the input; the rod
// he fishes with (rodModel: render/view.ts puts it in his hands while he fishes); and while he fishes, the line from
// the rod's tip down to a float bobbing on the water, which dips under each time a fish bites (strike) and is caught
// now and then. Placeholder art, quick to change. Reads state; never changes it.
import * as THREE from 'three';
import type { GameState } from '../core/state';
import type { Layout, NodeSpot } from '../world/layout';
import { RESOURCES } from '../data/skills';

const WATER_Y = 0.15;               // just above the water's highest ripple (render/world.ts)
/** `night`: how much fainter the rings are at night (they ignore the light, so they would glow on the dark water) */
const RIPPLE = { rings: 2, every: 2.8, from: 0.25, to: 0.95, width: 0.035, opacity: 0.5, night: 0.6 };
const HIT = { radius: 1.0, height: 0.6 };
const FLOAT = { r: 0.045, beyond: 0.25, bob: 0.012, dip: 0.07, dipFor: 0.55, top: '#d8452f', bottom: '#f3efe6' };
const LINE = { points: 14, sag: 0.18, color: '#f4efe2' };
/** The rod (in the tool's own frame in miner.glb, held at the grips 0.42-0.5 m down its handle; in the Idle pose its
 *  +x points forward and up over the water): from `butt` to `tip` along +x, tapering, a branch's colour, with a little
 *  spool of line near the hands. */
const ROD = { butt: -0.3, tip: 1.75, y: -0.46, thick: 0.02, thin: 0.007, wood: '#8a6844', spool: '#efe7d2', lift: 0.06 };

export const isFishingSpot = (spot: NodeSpot) => RESOURCES[spot.resource]?.model === 'Ripples';

/** The rod he fishes with, built in code, to hang on the tool bone of miner.glb (render/view.ts), and a marker at its
 *  tip for the line. */
export function rodModel(): { rod: THREE.Group; tip: THREE.Object3D } {
  const rod = new THREE.Group(), len = ROD.tip - ROD.butt;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(ROD.thin, ROD.thick, len, 6).rotateZ(-Math.PI / 2).translate(ROD.butt + len / 2, 0, 0),
    new THREE.MeshStandardMaterial({ color: ROD.wood, roughness: 0.9, flatShading: true }));
  const spool = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.014, 5, 10).rotateY(Math.PI / 2).translate(0.16, 0, 0),
    new THREE.MeshStandardMaterial({ color: ROD.spool, roughness: 1 }));
  pole.castShadow = spool.castShadow = true;
  const tip = new THREE.Object3D(); tip.position.set(ROD.tip, 0, 0);
  rod.add(pole, spool, tip);
  rod.position.y = ROD.y; rod.rotation.z = ROD.lift;           // a touch above the handle's line, so the tip rises
  return { rod, tip };
}

interface SpotView { spot: NodeSpot; rings: THREE.Mesh[] }

export class FishingView {
  readonly pickables: THREE.Object3D[] = [];
  private spots: SpotView[] = [];
  private float = new THREE.Group();
  private line: THREE.Line;
  private linePos: THREE.BufferAttribute;
  private dip = 0;
  private biteAt: string | null = null;
  private a = new THREE.Vector3(); private b = new THREE.Vector3();

  constructor(scene: THREE.Scene, layout: Layout) {
    const ring = new THREE.RingGeometry(1 - RIPPLE.width, 1, 40).rotateX(-Math.PI / 2);
    const hitGeo = new THREE.CylinderGeometry(HIT.radius, HIT.radius, HIT.height, 12), hitMat = new THREE.MeshBasicMaterial({ visible: false });
    for (const spot of layout.nodes.filter(isFishingSpot)) {
      const color = RESOURCES[spot.resource]!.color, rings: THREE.Mesh[] = [];
      for (let i = 0; i < RIPPLE.rings; i++) {
        const m = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
        m.position.set(spot.pos.x, WATER_Y, spot.pos.z); m.renderOrder = 2;
        scene.add(m); rings.push(m);
      }
      const hit = new THREE.Mesh(hitGeo, hitMat); hit.position.set(spot.pos.x, WATER_Y, spot.pos.z); hit.userData.nodeId = spot.id;
      scene.add(hit); this.pickables.push(hit);
      this.spots.push({ spot, rings });
    }
    // the float: red over white, half in the water
    const half = (color: string, up: boolean) => new THREE.Mesh(
      new THREE.SphereGeometry(FLOAT.r, 10, 5, 0, Math.PI * 2, up ? 0 : Math.PI / 2, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
    this.float.add(half(FLOAT.top, true), half(FLOAT.bottom, false));
    this.float.visible = false; scene.add(this.float);
    this.linePos = new THREE.BufferAttribute(new Float32Array(LINE.points * 3), 3);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', this.linePos);
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: LINE.color, transparent: true, opacity: 0.85 }));
    this.line.frustumCulled = false; this.line.visible = false; scene.add(this.line);
  }

  /** A fish bit at spot `nodeId` (a strike while fishing there): the float dips under. */
  strike(nodeId: string): void { this.biteAt = nodeId; }

  /** t: seconds; tip: where the rod's tip is drawn, or null while he isn't holding it; night: 0 by day .. 1 at night. */
  update(state: GameState, t: number, dt: number, tip: THREE.Vector3 | null, night: number): void {
    const dim = 1 - RIPPLE.night * night;
    for (const [k, { spot, rings }] of this.spots.entries()) {
      const quiet = !!state.nodes[spot.id]?.depletedUntil;
      rings.forEach((m, i) => {
        m.visible = !quiet;
        if (quiet) return;
        const f = ((t + k * 1.3) / RIPPLE.every + i / RIPPLE.rings) % 1, r = RIPPLE.from + (RIPPLE.to - RIPPLE.from) * f;
        m.scale.setScalar(r);
        (m.material as THREE.MeshBasicMaterial).opacity = RIPPLE.opacity * dim * Math.sin(Math.PI * f) * (1 - f * 0.5);
      });
    }
    // fishing at a spot with fish there, the rod in his hands: the float on the water and the line to it
    const p = state.player, task = p.task;
    const spot = task.kind === 'gather' ? this.spots.find(v => v.spot.id === task.nodeId)?.spot : undefined;
    const on = !!spot && !!tip && !state.nodes[spot.id]?.depletedUntil;
    this.float.visible = this.line.visible = on;
    if (this.biteAt && spot && this.biteAt === spot.id) this.dip = 1;
    this.biteAt = null;
    if (!on || !spot || !tip) { this.dip = 0; return; }
    this.dip = Math.max(0, this.dip - dt / FLOAT.dipFor);
    const away = this.a.set(spot.pos.x - p.pos.x, 0, spot.pos.z - p.pos.z);
    if (away.lengthSq() < 1e-6) away.set(1, 0, 0);
    away.normalize().multiplyScalar(FLOAT.beyond);
    const sink = Math.sin(Math.PI * Math.min(1, this.dip * 1.6)) * FLOAT.dip;
    this.float.position.set(spot.pos.x + away.x, WATER_Y - 0.03 + Math.sin(t * 2.3) * FLOAT.bob - sink, spot.pos.z + away.z);
    // the line from the rod's tip down to the float, sagging a little
    const to = this.b.copy(this.float.position); to.y += FLOAT.r * 0.6;
    const sag = LINE.sag * Math.hypot(to.x - tip.x, to.z - tip.z);
    for (let i = 0; i < LINE.points; i++) {
      const s = i / (LINE.points - 1);
      this.linePos.setXYZ(i, tip.x + (to.x - tip.x) * s, tip.y + (to.y - tip.y) * s - sag * 4 * s * (1 - s), tip.z + (to.z - tip.z) * s);
    }
    this.linePos.needsUpdate = true;
  }
}
