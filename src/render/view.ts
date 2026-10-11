// Draws the game: the ground and river, the village, fog over unclaimed land, the miner and the rocks, placed from
// the game state every frame, with the matching animation and effects (chips, the click cross).
// It reads state; it never changes it.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import minerUrl from '../../assets/models/miner.glb?url';
import villageUrl from '../../assets/models/village.glb?url';
import type { GameState } from '../core/state';
import type { Layout } from '../world/layout';
import { RESOURCES } from '../data/skills';
import { ANIM } from '../data/animation';
import { dayFraction } from '../core/clock';
import { Lighting } from './lighting';
import { OrbitCamera } from './camera';
import { buildWorld, type WorldView } from './world';
import { VillageView } from './village';
import { FogView } from './fog';

interface RockView { root: THREE.Object3D; ores: THREE.Mesh[]; mats: { m: THREE.MeshStandardMaterial; base: THREE.Color }[] }

/** In builds the model is embedded in the page as a data: URL; decode it here rather than fetching it, because
 *  some hosts (artifact links) block fetch() of anything but their own files. The dev server serves a real file. */
function loadModel(url: string) {
  const loader = new GLTFLoader();
  if (!url.startsWith('data:')) return loader.loadAsync(url);
  const comma = url.indexOf(','), head = url.slice(0, comma), body = url.slice(comma + 1);
  const bytes = head.endsWith(';base64') ? Uint8Array.from(atob(body), c => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(body));
  return loader.parseAsync(bytes.buffer, '');
}

export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cam = new OrbitCamera();
  private lighting: Lighting;
  private world: WorldView;
  private village?: VillageView;
  private fog: FogView;
  private clock = 0;
  private miner?: THREE.Object3D;
  private tip?: THREE.Object3D;
  private mixer?: THREE.AnimationMixer;
  private actions: Record<string, THREE.AnimationAction> = {};
  private current?: THREE.AnimationAction;
  private rocks = new Map<string, RockView>();
  private shown = { pos: new THREE.Vector3(), heading: 0, ready: false };
  private chips: { m: THREE.Mesh; v: THREE.Vector3; life: number; spin: number }[] = [];
  private marker = new THREE.Group();
  private markerT = 0;
  readonly pickables: THREE.Object3D[] = [];
  readonly ground: THREE.Object3D[] = [];
  ready: Promise<void>;

  constructor(container: HTMLElement, private layout: Layout) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;   // PCFSoftShadowMap was removed in three r180+; softness comes from shadow.radius
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    container.prepend(this.renderer.domElement);
    this.world = buildWorld(this.scene, layout);
    this.ground.push(...this.world.ground);
    this.lighting = new Lighting(this.scene);
    this.fog = new FogView(this.scene, layout);
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.09), new THREE.MeshBasicMaterial({ color: '#ffe100' }));
      bar.rotation.y = a; this.marker.add(bar);
    }
    this.marker.visible = false; this.scene.add(this.marker);
    this.ready = this.load();
  }

  private async load(): Promise<void> {
    const [gltf, village] = await Promise.all([loadModel(minerUrl), loadModel(villageUrl)]);
    this.village = new VillageView(this.scene, this.layout, village.scene);
    this.pickables.push(...this.village.pickables);
    gltf.scene.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.miner = gltf.scene.getObjectByName('Miner')!;
    this.tip = gltf.scene.getObjectByName('PickTip')!;
    const rockSrc = gltf.scene.getObjectByName('Rock')!;
    this.scene.add(this.miner);
    this.mixer = new THREE.AnimationMixer(this.miner);
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.actions.Mine!.timeScale = 0;               // the simulation drives the swing, so strikes line up
    for (const spot of this.layout.nodes) {
      const root = rockSrc.clone(true); root.position.set(spot.pos.x, 0, spot.pos.z);
      root.rotation.y = (spot.pos.x * 1.7 + spot.pos.z) % (Math.PI * 2);
      const view: RockView = { root, ores: [], mats: [] };
      const oreColor = new THREE.Color(RESOURCES[spot.resource]!.color);
      root.traverse(o => {
        const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
        mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone();
        const m = mesh.material as THREE.MeshStandardMaterial;
        if (/^Ore/.test(mesh.name)) { m.color.copy(oreColor); view.ores.push(mesh); }
        view.mats.push({ m, base: m.color.clone() });
        mesh.userData.nodeId = spot.id;
        this.pickables.push(mesh);
      });
      this.scene.add(root); this.rocks.set(spot.id, view);
    }
    this.play('Idle', 0);
  }

  private play(name: string, fade = 0.18): void {
    const next = this.actions[name]; if (!next || next === this.current) return;
    next.reset().setEffectiveWeight(1).play();
    if (this.current) this.current.crossFadeTo(next, fade, false);
    this.current = next;
  }

  showMarker(p: THREE.Vector3, action: boolean): void {
    this.marker.position.set(p.x, 0.02, p.z);
    for (const c of this.marker.children) ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(action ? '#ff2a1a' : '#ffe100');
    this.markerT = 0.45; this.marker.visible = true;
  }

  strike(): void {
    if (!this.tip) return;
    const p = this.tip.getWorldPosition(new THREE.Vector3());
    const geo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: i % 3 ? '#8d8f94' : '#d98a4a' }));
      m.position.copy(p); m.castShadow = true; this.scene.add(m);
      this.chips.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 2.2, 1.6 + Math.random() * 1.6, (Math.random() - 0.5) * 2.2), life: 0.7 + Math.random() * 0.3, spin: Math.random() * 10 });
    }
  }

  /** World position of the character as currently drawn. */
  minerPos(): THREE.Vector3 { return this.shown.pos.clone(); }

  draw(state: GameState, dt: number): void {
    const p = state.player;
    if (this.miner && this.mixer) {
      const target = new THREE.Vector3(p.pos.x, 0, p.pos.z);
      if (!this.shown.ready) { this.shown.pos.copy(target); this.shown.heading = p.heading; this.shown.ready = true; this.cam.follow(target, 1); }
      this.shown.pos.lerp(target, Math.min(1, dt * 20));
      const dh = ((p.heading - this.shown.heading + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      this.shown.heading += dh * Math.min(1, dt * 20);
      this.miner.position.copy(this.shown.pos); this.miner.rotation.y = this.shown.heading;
      const task = p.task;
      const waiting = task.kind === 'mine' && !!state.nodes[task.nodeId]?.depletedUntil;
      if (task.kind === 'walk') this.play('Walk');
      else if (task.kind === 'mine' && !waiting) { this.play('Mine'); this.actions.Mine!.time = task.progress * ANIM.mineCycle; }
      else this.play('Idle');
      this.mixer.update(dt);
    }
    for (const [id, rv] of this.rocks) {
      const until = state.nodes[id]?.depletedUntil ?? 0;
      const spot = this.layout.nodes.find(n => n.id === id)!;
      const left = until ? Math.max(0, until - state.time) / RESOURCES[spot.resource]!.respawn : 0;
      for (const o of rv.ores) {
        o.visible = !until;
        o.scale.lerp(new THREE.Vector3(1, 1, 1), Math.min(1, dt * 8));
        if (until) o.scale.setScalar(0.2);
      }
      for (const { m, base } of rv.mats) m.color.copy(base).lerp(new THREE.Color('#6d6f73'), left * 0.6);
    }
    for (let i = this.chips.length - 1; i >= 0; i--) {
      const c = this.chips[i]!; c.life -= dt; c.v.y -= 9 * dt; c.m.position.addScaledVector(c.v, dt);
      if (c.m.position.y < 0.03) { c.m.position.y = 0.03; c.v.multiplyScalar(0.4); c.v.y = Math.abs(c.v.y) * 0.3; }
      c.m.rotation.x += c.spin * dt; c.m.rotation.y += c.spin * dt; c.m.scale.setScalar(Math.min(1, c.life * 3));
      if (c.life <= 0) { this.scene.remove(c.m); (c.m.material as THREE.Material).dispose(); this.chips.splice(i, 1); }
    }
    if (this.marker.visible) { this.markerT -= dt; this.marker.scale.setScalar(0.4 + this.markerT * 1.6); if (this.markerT <= 0) this.marker.visible = false; }
    this.cam.follow(this.shown.pos, Math.min(1, dt * 6));
    this.lighting.update(dayFraction(state.time), this.shown.pos, true, this.cam.dist);
    this.clock += dt;
    this.world.update(this.clock);
    this.village?.update(this.clock, this.lighting.night, this.cam.look, dt);
    const mist = new THREE.Color('#eef3f5').lerp(this.lighting.horizon, 0.4).multiplyScalar(1 - this.lighting.night * 0.45);
    this.fog.update(this.clock, this.cam.camera, state, mist);
    this.renderer.render(this.scene, this.cam.camera);
  }

  resize(w: number, h: number): void {
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.cam.resize(w / h);
  }
}
