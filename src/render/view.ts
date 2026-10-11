// Draws the game: the ground and river, the village, fog over unclaimed land, the rocks and trees, and the character
// with the tool for the job (pick or axe) and the matching animation, placed from the game state every frame, plus
// effects (chips, the click cross). It reads state; it never changes it.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import minerUrl from '../../assets/models/miner.glb?url';
import villageUrl from '../../assets/models/village.glb?url';
import type { GameState } from '../core/state';
import type { Layout, NodeSpot } from '../world/layout';
import { RESOURCES } from '../data/skills';
import { SWINGS, type Swing } from '../data/animation';
import { dayFraction } from '../core/clock';
import { Lighting } from './lighting';
import { OrbitCamera } from './camera';
import { buildWorld, type WorldView } from './world';
import { VillageView } from './village';
import { FogView } from './fog';
import { NodesView } from './nodes';

type Tool = Swing['tool'];

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
  private nodes?: NodesView;
  private spots: Map<string, NodeSpot>;
  private miner?: THREE.Object3D;
  private tools?: Record<Tool, { parts: THREE.Object3D[]; tip: THREE.Object3D }>;
  private tool: Tool | null = null;
  private mixer?: THREE.AnimationMixer;
  private actions: Record<string, THREE.AnimationAction> = {};
  private current?: THREE.AnimationAction;
  private shown = { pos: new THREE.Vector3(), heading: 0, ready: false };
  private strikeAt: string | null = null;
  private marker = new THREE.Group();
  private markerT = 0;
  readonly pickables: THREE.Object3D[] = [];
  readonly ground: THREE.Object3D[] = [];
  ready: Promise<void>;

  constructor(container: HTMLElement, private layout: Layout) {
    this.spots = new Map(layout.nodes.map(n => [n.id, n]));
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
    const find = (name: string) => {
      const o = gltf.scene.getObjectByName(name);
      if (!o) throw new Error(`miner.glb has no ${name}`);
      return o;
    };
    this.miner = find('Miner');
    this.tools = {
      pick: { parts: [find('pick_head'), find('pick_collar')], tip: find('PickTip') },
      axe: { parts: [find('axe_head'), find('axe_blade')], tip: find('AxeTip') },
    };
    this.useTool('pick');
    this.nodes = new NodesView(this.scene, this.layout, find('Rock'), village.scene);
    this.pickables.push(...this.nodes.pickables);
    this.scene.add(this.miner);
    this.mixer = new THREE.AnimationMixer(this.miner);
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    for (const s of Object.values(SWINGS)) this.actions[s.clip]!.timeScale = 0;   // the simulation drives each swing, so strikes line up
    this.play('Idle', 0);
  }

  /** Show the pick or the axe in the character's hands. */
  private useTool(tool: Tool): void {
    if (!this.tools || tool === this.tool) return;
    for (const [name, t] of Object.entries(this.tools)) for (const part of t.parts) part.visible = name === tool;
    this.tool = tool;
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

  /** The tool struck a node. Shown on the next frame, once, however many strikes arrive at once (catching up). */
  strike(nodeId: string): void { this.strikeAt = nodeId; }

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
      // the node being worked, or the one he is walking to: he takes out the tool for it on the way
      const workId = task.kind === 'gather' ? task.nodeId : p.pending?.kind === 'node' ? p.pending.id : null;
      const spot = workId ? this.spots.get(workId) : undefined;
      const swing = spot ? SWINGS[RESOURCES[spot.resource]!.skill] : null;
      if (swing) this.useTool(swing.tool);
      const waiting = task.kind === 'gather' && !!state.nodes[task.nodeId]?.depletedUntil;
      if (task.kind === 'walk') this.play('Walk');
      else if (task.kind === 'gather' && !waiting && swing) { this.play(swing.clip); this.actions[swing.clip]!.time = task.progress * swing.cycle; }
      else this.play('Idle');
      this.mixer.update(dt);
      if (this.strikeAt && this.tools && this.tool) this.nodes?.hit(this.strikeAt, this.tools[this.tool].tip.getWorldPosition(new THREE.Vector3()));
    }
    this.strikeAt = null;
    this.nodes?.update(state, dt, this.shown.pos);
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
