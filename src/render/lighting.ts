// Day and night from the in-game clock: sun position and colour, sky, ambient light and how dark it is
// (`night`, which the village uses for its lanterns, windows and hearth).
import * as THREE from 'three';

// at = fraction of the day (0 midnight, 0.5 noon). Intensities are in three.js physical units (r155+).
interface Key { at: number; sun: string; sunI: number; sky: string; gnd: string; hemiI: number; night: number; horizon: string; bg: string }
const NIGHT = { sun: '#93a9ff', sunI: 0.68, sky: '#2c3d70', gnd: '#10180f', hemiI: 0.57, night: 1, horizon: '#18213d', bg: '#0e1424' };
const DAY = { sun: '#fff3e0', sunI: 2.97, sky: '#bcd7ff', gnd: '#5c7d3a', hemiI: 1.69, night: 0, horizon: '#b4d3ec', bg: '#2c4a26' };
const KEYS: Key[] = [
  { at: 0.00, ...NIGHT },
  { at: 0.21, ...NIGHT },
  { at: 0.27, sun: '#ffb070', sunI: 2.16, sky: '#d9a98a', gnd: '#4a3a2a', hemiI: 1.09, night: 0.3, horizon: '#e7b394', bg: '#3a2e22' },
  { at: 0.34, ...DAY },
  { at: 0.70, ...DAY },
  { at: 0.77, sun: '#ffa45e', sunI: 2.3, sky: '#d8a080', gnd: '#4a3a2a', hemiI: 1.09, night: 0.4, horizon: '#e3a983', bg: '#3a2e22' },
  { at: 0.83, ...NIGHT },
  { at: 1.00, ...NIGHT },
];

export class Lighting {
  readonly hemi = new THREE.HemisphereLight('#bcd7ff', '#5c7d3a', 1.69);
  readonly sun = new THREE.DirectionalLight('#fff3e0', 2.97);
  readonly horizon = new THREE.Color();
  /** 0 in full daylight .. 1 at night */
  night = 0;

  constructor(private scene: THREE.Scene) {
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 90 });
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.02; this.sun.shadow.radius = 3;
    scene.add(this.hemi, this.sun, this.sun.target);
    scene.fog = new THREE.Fog('#b4d3ec', 1000, 2000);
    scene.background = new THREE.Color('#2c4a26');
  }

  /** dayFrac: 0..1 of the day. perspective: true when the camera can see the horizon (sky and haze).
   *  viewDist: how far the camera is from what it looks at; the haze starts beyond that, so zooming out stays clear. */
  update(dayFrac: number, focus: THREE.Vector3, perspective: boolean, viewDist = 12): void {
    let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1]!.at <= dayFrac) i++;
    const a = KEYS[i]!, b = KEYS[i + 1]!, k = (dayFrac - a.at) / Math.max(1e-6, b.at - a.at);
    const c = (x: string, y: string) => new THREE.Color(x).lerp(new THREE.Color(y), k);
    const n = (x: number, y: number) => x + (y - x) * k;
    this.sun.color.copy(c(a.sun, b.sun)); this.sun.intensity = n(a.sunI, b.sunI);
    this.hemi.color.copy(c(a.sky, b.sky)); this.hemi.groundColor.copy(c(a.gnd, b.gnd)); this.hemi.intensity = n(a.hemiI, b.hemiI);
    this.night = n(a.night, b.night);
    this.horizon.copy(c(a.horizon, b.horizon));
    // the sun travels east to west by day; at night the light swings back, from where the sun set to where it will
    // rise, highest at midnight, so the shadows are seen to turn through the night while he sleeps (13 Oct 2026; it
    // meets the sun's path at both ends, so nothing jumps at dusk or dawn)
    const day = dayFrac > 0.23 && dayFrac < 0.8;
    const t = (dayFrac - 0.25) / 0.5, nt = ((dayFrac - 0.8 + 1) % 1) / 0.43;
    const el = day ? Math.max(0.12, Math.sin(Math.PI * Math.min(1, Math.max(0, t)))) : 0.12 + 0.58 * Math.sin(Math.PI * Math.min(1, nt));
    const az = day ? Math.PI * (0.15 + 0.7 * t) : Math.PI * (0.92 - 0.8 * Math.min(1, nt));
    this.sun.position.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).multiplyScalar(30).add(focus);
    this.sun.target.position.copy(focus);
    const fog = this.scene.fog as THREE.Fog;
    (this.scene.background as THREE.Color).copy(perspective ? this.horizon : c(a.bg, b.bg));
    fog.color.copy(this.horizon); fog.near = perspective ? viewDist + 16 : 1000; fog.far = perspective ? viewDist + 75 : 2000;
  }
}
