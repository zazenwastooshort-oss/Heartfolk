// Draws the game: the ground and river, the village, fog over unclaimed land, the rocks and trees, things lying on the
// ground to pick up, the camp's buildings as they go up (render/structures.ts), and the character with the tool for the
// job (pick or axe; at the camp they are the stone pickaxe and stone axe he made; since 0.0.22 his stone club while he
// practises on the training dummy, swung with the axe's Chop clip, resting between strikes) and the matching animation,
// placed from the game state every frame, plus effects (chips, the click cross). It reads state; it never changes it.
// The tool is in his hands while he works and on his back otherwise, every walk included (toolInHand picks the armed or
// the free clip), hidden for the moment it moves between the two. A tool he doesn't own is never drawn: with none he
// plays the free clips with nothing on his back. Clips crossfade, and ArmIK puts the hands back on the handle after
// every blend into an armed clip. Since chapter 2: the berry bushes, the fishing spots, the rod he fishes with (held
// only while he fishes, with the armed Idle clip, too long to carry on his back), its line and float, and a fish on a
// stick over the campfire while he cooks. Since chapter 2's rats: the rats and their nest (render/rats.ts), his lean
// into a strike at a rat, standing ready while he waits for them, and toppling over when one knocks him out. Since the
// goblin camp: its palisade, tent, totem and fire ring and the goblins in it (render/goblins.ts, from a load of
// miner.glb of their own). Since the camp build (13 Oct 2026) he builds with a mallet (render/campmodels.ts), drawn on
// the pick's bone in place of the pick, swung with the Mine clip once for each knock of the work, landing on the knock.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import minerUrl from '../../assets/models/miner.glb?url';
import villageUrl from '../../assets/models/village.glb?url';
import type { GameState } from '../core/state';
import type { Layout, NodeSpot } from '../world/layout';
import { footOf } from '../world/falls';
import { waterOf } from '../world/water';
import { RESOURCES } from '../data/skills';
import { ARMED_CLIPS, FADE, GAIT, IDLE, SWINGS } from '../data/animation';
import { STRIKE, strikeEvery, type GearId } from '../data/combat';
import { dayFraction } from '../core/clock';
import { Lighting } from './lighting';
import { OrbitCamera } from './camera';
import { buildWorld, type WorldView } from './world';
import { VillageView } from './village';
import { FogView } from './fog';
import { FallsView } from './waterfall';
import { NodesView } from './nodes';
import { PickupsView } from './pickups';
import { CampView } from './structures';
import { malletModel } from './campmodels';
import { BushesView } from './bushes';
import { FishingView, rodModel } from './fishing';
import { CookingView } from './cooking';
import { ArmIK, armedWeight, heldTool, malletLean, malletSwing, toolInHand, toolInTransit, type Held } from './arms';
import { stageOf } from '../core/building';
import { shapeOf } from '../world/steps';
import { WEAPON_MODELS, armourWorn, wearGear } from './gear';
import { RatsView } from './rats';
import { GoblinsView } from './goblins';
import { targetOf } from '../core/targets';

/** While he makes something where he stands or stokes the fire: a placeholder motion, bowing down to it and back up,
 *  `rate` bows a second. (Building at the camp's spots he swings his mallet.) */
const BUILD_BOW = { lean: 0.42, dip: 0.08, rate: 1.3 };
/** Placeholders for chapter 2: picking a berry bush he bows into it like building, quicker and less deep; cooking he
 *  leans in a little towards the fish over the fire. */
const PICK_BOW = { rate: 1.8, lean: 0.3 };
const COOK_LEAN = 0.18;
/** Placeholders for chapter 2's rats: striking one he leans in, most at the moment the club lands (its `lean`, from
 *  `from` seconds into the swing), so the swing comes down on a rat on the ground; knocked out he topples onto his back
 *  over `time` seconds, the tool hidden (it would go into the ground), and gets up again the same way once he wakes. */
const LOW_STRIKE = { lean: 0.45, from: 0.25 };
const SLUMP = { time: 0.7, angle: Math.PI / 2 - 0.08, lift: 0.13 };
const smooth = (x: number) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };

/** How far he leans into a strike at a rat `t` seconds into the swing. */
function lowLean(t: number): number {
  if (t <= LOW_STRIKE.from) return 0;
  if (t < STRIKE.impact) return LOW_STRIKE.lean * smooth((t - LOW_STRIKE.from) / (STRIKE.impact - LOW_STRIKE.from));
  return LOW_STRIKE.lean * (1 - smooth((t - STRIKE.impact) / (STRIKE.cycle - STRIKE.impact)));
}

/** The camp's tools are the stone axe and stone pickaxe he makes (data/making.ts): miner.glb's axe with its blade
 *  turned into a chunky grey stone (`thick` times as thick) and the iron block behind it into the lashing that ties it
 *  to the handle; the pick's head the same grey stone (`pickThick` times as thick), its collar the lashing. The
 *  village's tools stay iron. */
/** The camp's stone tools (0.0.16; chunkier since 0.0.21, as the owner asked): the axe's blade and the pick's head drawn
 *  as knapped stones, rough many-faceted lumps grown out of the iron ones' shapes (`grow`, per axis; z is their
 *  thickness), on a branch for a handle (`branch` colour, `handle` times thicker), bound with lashing. */
const STONE_TOOLS = {
  stone: '#8f8c86', pickStone: '#7d7a74', lashing: '#b39867', branch: '#7a5b3c', handle: 1.3,
  axe: [1.12, 1.18, 2.8] as const, pick: [1.08, 1.2, 2.3] as const,
};

/** Draw `of` (the iron blade or pick head) as a knapped stone: an irregular faceted lump the size of its shape grown by
 *  `grow`, a child of it, so the view shows and hides it with the tool; the iron mesh itself is no longer drawn. The
 *  facets' corners move in and out by an amount that depends only on where they are, so faces that share one stay
 *  joined. */
function knapStone(of: THREE.Mesh, grow: readonly [number, number, number], color: string, seed: number): void {
  of.geometry.computeBoundingBox();
  const box = of.geometry.boundingBox!, size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
  const g = new THREE.IcosahedronGeometry(0.5, 0), pos = g.getAttribute('position') as THREE.BufferAttribute, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const h = Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719 + seed) * 43758.5453, k = 0.8 + 0.34 * (h - Math.floor(h));
    pos.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  g.scale(size.x * grow[0], size.y * grow[1], size.z * grow[2]);
  g.computeVertexNormals();
  const stone = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true }));
  stone.position.copy(centre); stone.castShadow = true;
  of.material = new THREE.MeshBasicMaterial({ visible: false });
  of.add(stone);
}

/** Thicken `mesh` across its length (the handle into a branch): every axis but its longest times `by`. */
function thicken(mesh: THREE.Mesh, by: number): void {
  mesh.geometry.computeBoundingBox();
  const size = mesh.geometry.boundingBox!.getSize(new THREE.Vector3()), long = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
  for (const axis of ['x', 'y', 'z'] as const) if (axis !== long) mesh.scale[axis] *= by;
}

/** What he can have in his hands: the tools, (0.0.22) his weapon, by its id in GEAR (the stone club; its model is in
 *  render/gear.ts), or (the camp build) his mallet (render/campmodels.ts). */
type Tool = Held;
/** The weapons there are models for. */
const WEAPONS: ReadonlySet<string> = new Set(Object.keys(WEAPON_MODELS));

/** In builds the model is embedded in the page as a data: URL; decode it here rather than fetching it, because
 *  some hosts (artifact links) block fetch() of anything but their own files. The dev server serves a real file. */
export function loadModel(url: string) {
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
  private falls?: FallsView;
  private clock = 0;
  private nodes?: NodesView;
  private pickups?: PickupsView;
  private structures?: CampView;
  private bushes?: BushesView;
  private fishing?: FishingView;
  private cooking?: CookingView;
  private rats?: RatsView;
  private goblins?: GoblinsView;
  private slump = 0;                     // how far he has toppled over, knocked out (0..1)
  private spots: Map<string, NodeSpot>;
  private miner?: THREE.Object3D;
  private tools?: Partial<Record<Tool, { parts: THREE.Object3D[]; tip: THREE.Object3D }>>;
  private tool: Tool | null = null;      // the tool drawn (null: none, he owns no tool)
  private handle?: THREE.Object3D;       // the handle both tools share
  private toolHidden = false;
  private toolsSet = false;
  private armour = '';                   // the armour drawn on him (chunk D), its ids joined: wearGear only on a change
  private mixer?: THREE.AnimationMixer;
  private arms?: ArmIK;
  private actions: Record<string, THREE.AnimationAction> = {};
  private current?: THREE.AnimationAction;
  private shown = { pos: new THREE.Vector3(), heading: 0, ready: false };
  private strikeAt: string | null = null;
  private hitAt: { target: string; damage: number } | null = null;
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
    if (layout.falls) {
      this.falls = new FallsView(this.scene, layout.falls, footOf(layout), waterOf(layout));
      const falls = this.falls;
      this.cam.clearance = p => falls.clearance(p);      // the camera stays in front of the wall and the falls
    }
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.09), new THREE.MeshBasicMaterial({ color: '#ffe100' }));
      bar.rotation.y = a; this.marker.add(bar);
    }
    this.marker.visible = false; this.scene.add(this.marker);
    this.ready = this.load();
  }

  private async load(): Promise<void> {
    // (the goblin camp) the goblins need miner.glb loaded for them alone, shared by them all (goblinModel)
    const [gltf, village, goblinMiner] = await Promise.all([loadModel(minerUrl), loadModel(villageUrl), this.layout.goblinCamp ? loadModel(minerUrl) : null]);
    this.village = new VillageView(this.scene, this.layout, village.scene);
    this.pickables.push(...this.village.pickables);
    gltf.scene.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const find = (name: string) => {
      const o = gltf.scene.getObjectByName(name);
      if (!o) throw new Error(`miner.glb has no ${name}`);
      return o;
    };
    this.miner = find('Miner');
    // the fishing rod (chapter 2), built in code, held at the same grips as the tools' handle
    const rod = rodModel();
    find('tool').add(rod.rod);
    this.tools = {
      pick: { parts: [find('pick_head'), find('pick_collar')], tip: find('PickTip') },
      axe: { parts: [find('axe_head'), find('axe_blade')], tip: find('AxeTip') },
      rod: { parts: [rod.rod], tip: rod.tip },
    };
    // each weapon (0.0.22) on the axe's bone, so it swings like the axe, landing where the blade would
    for (const [id, model] of Object.entries(WEAPON_MODELS)) this.tools[id as GearId] = { parts: [model(find('axe_blade').parent!)], tip: find('AxeTip') };
    // his mallet (the camp build), on the tools' bone like the pick, with a handle of its own
    const mallet = malletModel();
    find('pick_head').parent!.add(mallet.model);
    this.tools.mallet = { parts: [mallet.model], tip: mallet.face };
    this.handle = find('pick_handle');
    if (this.layout.camp) {
      // at the camp his tools are stone ones he made: knapped stone heads on a branch, bound with lashing
      const lashing = new THREE.MeshStandardMaterial({ color: STONE_TOOLS.lashing, roughness: 1 });
      knapStone(find('axe_blade') as THREE.Mesh, STONE_TOOLS.axe, STONE_TOOLS.stone, 1);
      knapStone(find('pick_head') as THREE.Mesh, STONE_TOOLS.pick, STONE_TOOLS.pickStone, 2);
      (find('axe_head') as THREE.Mesh).material = lashing;
      (find('pick_collar') as THREE.Mesh).material = lashing;
      const handle = this.handle as THREE.Mesh;
      handle.material = new THREE.MeshStandardMaterial({ color: STONE_TOOLS.branch, roughness: 1, flatShading: true });
      thicken(handle, STONE_TOOLS.handle);
    }
    this.showTool(null);                 // until draw() knows which tools he owns
    this.nodes = new NodesView(this.scene, this.layout, find('Rock'), village.scene);
    this.pickables.push(...this.nodes.pickables);
    this.pickups = new PickupsView(this.scene, this.layout, village.scene);
    this.pickables.push(...this.pickups.pickables);
    this.structures = new CampView(this.scene, this.layout, village.scene);
    this.pickables.push(...this.structures.pickables);
    this.bushes = new BushesView(this.scene, this.layout);
    this.pickables.push(...this.bushes.pickables);
    this.fishing = new FishingView(this.scene, this.layout);
    this.pickables.push(...this.fishing.pickables);
    this.cooking = new CookingView(this.scene, this.layout);
    this.rats = new RatsView(this.scene, this.layout);
    this.pickables.push(...this.rats.pickables);
    this.goblins = new GoblinsView(this.scene, this.layout, village.scene, goblinMiner);
    this.pickables.push(...this.goblins.pickables);
    this.scene.add(this.miner);
    this.arms = new ArmIK(this.miner);   // reads the rest pose, so before the mixer first runs
    this.mixer = new THREE.AnimationMixer(this.miner);
    for (const clip of gltf.animations) this.actions[clip.name] = this.mixer.clipAction(clip);
    for (const s of Object.values(SWINGS)) if (!s.steady) this.actions[s.clip]!.timeScale = 0;   // the simulation drives each swing, so strikes line up
    for (const c of [GAIT.clip, GAIT.freeClip]) this.actions[c]!.timeScale = GAIT.speed / GAIT.clipSpeed;   // stride matched to the ground speed
    this.play(IDLE.freeClip, 0);
  }

  /** Show the pick or the axe (in his hands or on his back, as the clip has it), or the rod, or neither while it moves
   *  between the two (toolInTransit), or none at all (null: he owns no tool). The rod and the mallet have no part of the
   *  tools' handle. */
  private showTool(tool: Tool | null, hidden = this.toolHidden): void {
    if (!this.tools || !this.handle || (this.toolsSet && tool === this.tool && hidden === this.toolHidden)) return;
    for (const [name, t] of Object.entries(this.tools)) for (const part of t.parts) part.visible = !hidden && name === tool;
    this.handle.visible = !hidden && tool !== null && tool !== 'rod' && tool !== 'mallet';
    this.tool = tool; this.toolHidden = hidden; this.toolsSet = true;
  }

  private play(name: string, fade?: number): void {
    const next = this.actions[name]; if (!next || next === this.current) return;
    next.reset().setEffectiveWeight(1).play();
    if (this.current) {
      const swap = ARMED_CLIPS.has(this.current.getClip().name) !== ARMED_CLIPS.has(name);
      this.current.crossFadeTo(next, fade ?? (swap ? FADE.swap : FADE.normal), false);
    }
    this.current = next;
  }

  showMarker(p: THREE.Vector3, action: boolean): void {
    this.marker.position.set(p.x, 0.02, p.z);
    for (const c of this.marker.children) ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(action ? '#ff2a1a' : '#ffe100');
    this.markerT = 0.45; this.marker.visible = true;
  }

  /** The tool struck a node (or a fish bit). Shown on the next frame, once, however many strikes arrive at once
   *  (catching up). */
  strike(nodeId: string): void { this.strikeAt = nodeId; this.fishing?.strike(nodeId); }

  /** His weapon struck `target` (0.0.22: the training dummy wobbles). Shown on the next frame, once, like strike(). */
  hit(target: string, damage: number): void { this.hitAt = { target, damage }; }

  /** World position of the character as currently drawn. */
  minerPos(): THREE.Vector3 { return this.shown.pos.clone(); }

  /** Where rat `id` is drawn (chapter 2), or null while it isn't: for the numbers and the health bar over it. */
  ratPos(id: string): THREE.Vector3 | null { return this.rats?.posOf(id) ?? null; }

  /** Where creature `id` is drawn (a rat, a goblin, the goblin chief), or null while it isn't. */
  foePos(id: string): THREE.Vector3 | null { return this.rats?.posOf(id) ?? this.goblins?.posOf(id) ?? null; }

  draw(state: GameState, dt: number): void {
    const p = state.player;
    if (this.miner && this.mixer) {
      const target = new THREE.Vector3(p.pos.x, 0, p.pos.z);
      if (!this.shown.ready) { this.shown.pos.copy(target); this.shown.heading = p.heading; this.shown.ready = true; this.cam.follow(target, 1); }
      if (this.shown.pos.distanceTo(target) > 4) this.shown.pos.copy(target);    // (he woke up back at camp) no gliding there
      this.shown.pos.lerp(target, Math.min(1, dt * 20));
      const dh = ((p.heading - this.shown.heading + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      this.shown.heading += dh * Math.min(1, dt * 20);
      this.miner.position.copy(this.shown.pos); this.miner.rotation.y = this.shown.heading;
      this.miner.visible = p.task.kind !== 'sleep';               // asleep, he is inside the shelter
      const task = p.task;
      let lean = 0;
      // the node being worked, or the one he is walking to: its tool rides on his back on the way, out once he is there
      const workId = task.kind === 'gather' ? task.nodeId : p.pending?.kind === 'node' ? p.pending.id : null;
      const spot = workId ? this.spots.get(workId) : undefined;
      const swing = spot ? SWINGS[RESOURCES[spot.resource]!.skill] : null;
      // the tool for the job (the weapon he wears to fight, the rod to fish, his mallet to build), else the one he last
      // had out, else any he carries, else none (render/arms.ts heldTool)
      const tool = heldTool(state, this.layout, this.tool, WEAPONS);
      if (tool !== this.tool) this.showTool(tool);
      // the armour he wears (chunk D: the hide cap, vest and shield), on him all the time once made (render/gear.ts)
      const armour = armourWorn(state.equipment);
      if (armour.join() !== this.armour) { wearGear(this.miner, armour); this.armour = armour.join(); }
      const waiting = task.kind === 'gather' && !!state.nodes[task.nodeId]?.depletedUntil;
      // in his hands only at work with the right tool; otherwise on his back (or he has none)
      const armed = tool !== null && toolInHand(p) && (!swing || swing.tool === tool);
      if (task.kind === 'walk') this.play(armed ? GAIT.clip : GAIT.freeClip);
      else if (task.kind === 'gather' && !waiting && swing && armed) { this.play(swing.clip); if (!swing.steady) this.actions[swing.clip]!.time = task.progress * swing.cycle; }
      else if (task.kind === 'fight' && armed) {
        // a strike: the Chop swing at the start of each round of his weapon, then he rests, the club still in his hands,
        // until the next (systems/combat.ts strikes on the same timer). (Chapter 2) waiting by the nest while the rat he
        // beat is down he stands ready; striking a rat he leans in
        const t = task.progress * strikeEvery(state.equipment.weapon), target = targetOf(state, this.layout, task.target);
        if (target?.foe?.down) this.play(IDLE.clip);
        else if (t < STRIKE.cycle) { this.play(STRIKE.clip); this.actions[STRIKE.clip]!.time = t; if (target?.foe?.kind === 'rat') lean = lowLean(t); }
        else this.play(IDLE.clip);
      }
      else if (task.kind === 'raise' && armed) {
        // building: his mallet (the Mine clip) swung over and over as he works; leaning down as it lands on something
        // low, as far as the stage he builds asks (SHAPES' lean)
        const at = malletSwing(state.underway[task.id] ?? 0);
        this.play(SWINGS.mining.clip); this.actions[SWINGS.mining.clip]!.time = at;
        lean = malletLean(at, shapeOf(task.id)?.lean?.[stageOf(state, task.id)] ?? 0);
      }
      else this.play(armed ? IDLE.clip : IDLE.freeClip);
      // making something where he stands, or stoking the fire: he bows down to it and back up, over and over (a
      // placeholder until there is a clip for it)
      const bow = task.kind === 'make' || task.kind === 'stoke' ? Math.max(0, Math.sin(this.clock * Math.PI * 2 * BUILD_BOW.rate)) : 0;
      // picking a ripe berry bush, he bows into it; cooking, he leans towards the fire (chapter 2 placeholders)
      const bush = task.kind === 'pickup' && !(task.id in state.taken) && this.layout.pickups?.find(x => x.id === task.id)?.kind === 'bush';
      const pick = bush ? Math.max(0, Math.sin(this.clock * Math.PI * 2 * PICK_BOW.rate)) * PICK_BOW.lean : 0;
      // knocked out (chapter 2's rats): he topples onto his back, and gets up again once he wakes
      this.slump = Math.min(1, Math.max(0, this.slump + (task.kind === 'knockedOut' ? 1 : -1) * dt / SLUMP.time));
      const slump = smooth(this.slump);
      this.miner.rotation.z = -bow * BUILD_BOW.lean - pick - (task.kind === 'cook' ? COOK_LEAN : 0) - lean + slump * SLUMP.angle;
      this.miner.position.y = -bow * BUILD_BOW.dip + slump * SLUMP.lift;
      this.mixer.update(dt);
      // a crossfade blends the arms apart from the tool: hands back on the handle (in armed clips only)
      this.arms?.solve(armedWeight(Object.values(this.actions), this.current));
      this.showTool(this.tool, toolInTransit(Object.values(this.actions)) || this.slump > 0.3);   // hidden between hands and back
      if (this.strikeAt && this.tools && this.tool) this.nodes?.hit(this.strikeAt, this.tools[this.tool]!.tip.getWorldPosition(new THREE.Vector3()));
    }
    if (this.hitAt) this.structures?.hit(this.hitAt.target, this.hitAt.damage, p.pos);
    this.strikeAt = null; this.hitAt = null;
    this.nodes?.update(state, dt, this.shown.pos);
    this.pickups?.update(state, this.clock, dt, this.cam.camera, this.lighting.night);
    this.structures?.update(state, this.clock, dt, this.lighting.night);
    this.bushes?.update(state, this.clock, dt);
    const rodTip = this.tool === 'rod' && !this.toolHidden ? this.tools?.rod?.tip.getWorldPosition(new THREE.Vector3()) ?? null : null;
    this.fishing?.update(state, this.clock, dt, rodTip, this.lighting.night);
    this.cooking?.update(state);
    this.rats?.update(state, this.clock, dt);
    this.goblins?.update(state, this.clock, dt);
    if (this.marker.visible) { this.markerT -= dt; this.marker.scale.setScalar(0.4 + this.markerT * 1.6); if (this.markerT <= 0) this.marker.visible = false; }
    this.cam.follow(this.shown.pos, Math.min(1, dt * 6));
    this.lighting.update(dayFraction(state.time), this.shown.pos, true, this.cam.dist);
    this.clock += dt;
    this.world.update(this.clock);
    this.village?.update(this.clock, this.lighting.night, this.cam.look, dt);
    const mist = new THREE.Color('#eef3f5').lerp(this.lighting.horizon, 0.4).multiplyScalar(1 - this.lighting.night * 0.45);
    this.fog.update(this.clock, this.cam.camera, state, mist);
    this.falls?.update(this.clock, dt, this.cam.camera, this.cam.look, this.lighting.horizon, mist);
    this.renderer.render(this.scene, this.cam.camera);
  }

  resize(w: number, h: number): void {
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.cam.resize(w / h);
  }
}
