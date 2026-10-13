// The camp's buildings as they go up (the camp build's stage 4: render/campmodels.ts, render/structures.ts,
// render/cooking.ts). Every step's stages are drawn, different from each other, within a budget, on the ground and
// inside the step's footprint (and its eaves) (T6.5); a new step's footings and frame keep clear of the step standing
// inside them (T6.6, D6); the view shows each step at its stage, the old step until the new one is half built, the
// markers only while their goal is up, a ring as far round as the step under way reaches and a tap area round what
// stands (T11.3); the chest at its shelter step's place on its floor (T8.6); the logs follow the firewood count; his
// fish on the stone hearth's spit (D20). Loads the real assets/models/village.glb.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { boundsOf, markerModel, stageParts, type Protos, type StageParts } from '../src/render/campmodels';
import { CampView } from '../src/render/structures';
import { CookingView } from '../src/render/cooking';
import { mergeByMaterial } from '../src/render/parts';
import { CARPENTRY, LINES, MARKER, SHAPES, TAP, type LineId } from '../src/data/building';
import { MAKES, type MakeId } from '../src/data/making';
import { WOODPILE } from '../src/data/fire';
import { GOALS } from '../src/data/goals';
import { CAMP } from '../src/world/camp';
import { VILLAGE, type Vec2 } from '../src/world/layout';
import { reachOf, stepPlace, toGround } from '../src/world/steps';
import { createState, type GameState } from '../src/core/state';
import { markerShown, stepShown } from '../src/core/building';
import { chestPlace, outermost, tapBoxOf } from '../src/core/camp';
import { DAY_SECONDS } from '../src/core/clock';

let models: THREE.Object3D;
let P: Protos;
beforeAll(async () => {
  const b = readFileSync(new URL('../assets/models/village.glb', import.meta.url));
  models = (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, '')).scene;
  P = name => models.getObjectByName(name)!;
});

const STEPS = [...new Set(Object.values(LINES).flat()), 'chest'] as MakeId[];
const UPGRADES: [old: MakeId, step: MakeId][] = [['shelter', 'wall_tent'], ['wall_tent', 'log_cabin'], ['campfire', 'stone_hearth'], ['woodpile', 'woodshed']];
/** How many triangles a step may have at any stage, and how many materials (draw calls once merged). */
const BUDGET = { triangles: { log_cabin: 2400, other: 1600 }, materials: 16 };
/** How far a roof's eaves (or a peg, a crank, split wood by the block) may reach past the footprint, metres. */
const EAVE = 0.3;

const all = (p: StageParts) => [...p.fixed, ...p.guys, ...p.logs, ...p.fish, ...p.sway];
const parts = (id: MakeId, stage: number) => stageParts(id, stage, P, SHAPES[id]!);
function triangles(o: THREE.Object3D): number {
  let n = 0;
  o.traverse(m => { const mesh = m as THREE.Mesh; if (mesh.isMesh) { const g = mesh.geometry; n += (g.index ? g.index.count : g.getAttribute('position').count) / 3; } });
  return Math.round(n);
}
const group = (list: THREE.Object3D[]) => { const g = new THREE.Group(); g.add(...list); g.updateMatrixWorld(true); return g; };
/** What a stage looks like, for telling stages apart: its triangles and the box round it. */
function signature(p: StageParts): string {
  const g = group(all(p)), b = new THREE.Box3().setFromObject(g);
  return `${triangles(g)} ${[b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map(v => v.toFixed(2)).join(',')}`;
}

/** Each mesh of `list` (parts of step `id`) and the box round it in the frame of step `frame` (both at the camp). */
function boxesIn(frame: MakeId, id: MakeId, list: THREE.Object3D[]): THREE.Box3[] {
  const f = stepPlace(CAMP, frame)!, place = stepPlace(CAMP, id)!, c = Math.cos(f.rot), s = Math.sin(f.rot);
  const dx = place.pos.x - f.pos.x, dz = place.pos.z - f.pos.z, root = new THREE.Group();
  root.position.set(dx * c - dz * s, 0, dx * s + dz * c); root.rotation.y = place.rot - f.rot;
  root.add(...list); root.updateMatrixWorld(true);
  const out: THREE.Box3[] = [];
  root.traverse(m => { if ((m as THREE.Mesh).isMesh) out.push(new THREE.Box3().setFromObject(m)); });
  return out;
}
/** Where boxes of `a` and `b` overlap above `above` metres (T6.6), as a list of overlaps. */
function clashes(a: THREE.Box3[], b: THREE.Box3[], above = 0.3): string[] {
  const out: string[] = [], tol = 0.005;
  for (const x of a) for (const y of b) {
    const ox = Math.min(x.max.x, y.max.x) - Math.max(x.min.x, y.min.x), oz = Math.min(x.max.z, y.max.z) - Math.max(x.min.z, y.min.z);
    const top = Math.min(x.max.y, y.max.y), bot = Math.max(x.min.y, y.min.y, above);
    if (ox > tol && oz > tol && top - bot > tol) out.push(`${ox.toFixed(2)} x ${oz.toFixed(2)} from ${bot.toFixed(2)} to ${top.toFixed(2)} m`);
  }
  return out;
}

describe('every step at every stage (T6.5)', () => {
  it.each(STEPS)('%s: four stages, each drawn, different, within budget, on the ground and inside its footprint and eaves', id => {
    const shape = SHAPES[id]!, [x0, x1, z0, z1] = boundsOf(shape), seen = new Set<string>();
    for (let stage = 0; stage <= CARPENTRY.stages; stage++) {
      const p = parts(id, stage), g = group(all(p)), box = new THREE.Box3().setFromObject(g);
      expect(all(p).length, `${id} stage ${stage}`).toBeGreaterThan(0);
      expect(triangles(g), `${id} stage ${stage}`).toBeLessThanOrEqual(id === 'log_cabin' ? BUDGET.triangles.log_cabin : BUDGET.triangles.other);
      expect(mergeByMaterial(group(parts(id, stage).fixed)).children.length, `${id} stage ${stage}`).toBeLessThanOrEqual(BUDGET.materials);
      // standing on the ground (stones may sit half sunk in it), never higher than its tap area reaches
      expect(box.min.y, `${id} stage ${stage}`).toBeGreaterThan(-0.25);
      expect(box.min.y, `${id} stage ${stage}`).toBeLessThan(0.02);
      expect(box.max.y, `${id} stage ${stage}`).toBeLessThanOrEqual(shape.tall + 0.1);
      for (const part of all(p)) {
        const b = new THREE.Box3().setFromObject(part);
        expect(b.min.x, `${id} stage ${stage}`).toBeGreaterThanOrEqual(x0 - EAVE); expect(b.max.x, `${id} stage ${stage}`).toBeLessThanOrEqual(x1 + EAVE);
        expect(b.min.z, `${id} stage ${stage}`).toBeGreaterThanOrEqual(z0 - EAVE); expect(b.max.z, `${id} stage ${stage}`).toBeLessThanOrEqual(z1 + EAVE);
      }
      seen.add(signature(p));
    }
    expect(seen.size).toBe(CARPENTRY.stages + 1);
  });

  it('the bigger steps are bigger, with more to them (the owner: "Bigger, more sections")', () => {
    const size = (id: MakeId) => { const b = new THREE.Box3().setFromObject(group(all(parts(id, CARPENTRY.stages)))); return (b.max.x - b.min.x) * (b.max.z - b.min.z) * b.max.y; };
    for (const [old, step] of UPGRADES) {
      expect(size(step), step).toBeGreaterThan(size(old));
      expect(triangles(group(all(parts(step, CARPENTRY.stages)))), step).toBeGreaterThan(triangles(group(all(parts(old, CARPENTRY.stages)))));
    }
  });

  it('the woodshed keeps no axe in its block (tools live in the chest), the wall tent no stump and the cabin no logs where the chest stands', () => {
    for (const shelter of ['wall_tent', 'log_cabin'] as MakeId[]) {
      const [cx, cz] = SHAPES[shelter]!.chest!, floor = SHAPES[shelter]!.floor!;
      const chest = new THREE.Box3(new THREE.Vector3(cx - 0.45, floor + 0.02, cz - 0.28), new THREE.Vector3(cx + 0.45, floor + 0.56, cz + 0.28));
      const inWay = boxesIn(shelter, shelter, all(parts(shelter, CARPENTRY.stages))).filter(b => b.intersectsBox(chest) && b.max.x - b.min.x < 1.5 && b.max.y < 1.2);
      expect(inWay, shelter).toEqual([]);
    }
    // the woodshed's parts by its chopping block are the block and the split pieces, all below knee height
    const block = new THREE.Box3(new THREE.Vector3(0.95, 0.45, 0), new THREE.Vector3(1.5, 1.2, 0.7));
    expect(boxesIn('woodshed', 'woodshed', all(parts('woodshed', CARPENTRY.stages))).filter(b => b.intersectsBox(block))).toEqual([]);
  });
});

describe("a new step's footings and frame keep clear of the old one inside them (T6.6, D6)", () => {
  it.each(UPGRADES)("%s stays whole inside the %s's footings and frame", (old, step) => {
    // the old step built, all of it but its guy ropes (they go once the new one is begun), its pile full
    const o = parts(old, CARPENTRY.stages), oldBoxes = boxesIn(step, old, [...o.fixed, ...o.logs, ...o.fish, ...o.sway]);
    for (const stage of [0, 1]) expect(clashes(boxesIn(step, step, all(parts(step, stage))), oldBoxes), `${step} stage ${stage}`).toEqual([]);
  });

  it('(the check finds a clash where there is one: the new step built, round the old one)', () => {
    for (const [old, step] of UPGRADES.filter(([o]) => o !== 'woodpile')) {
      const o = parts(old, CARPENTRY.stages);
      expect(clashes(boxesIn(step, step, all(parts(step, CARPENTRY.stages))), boxesIn(step, old, o.fixed)).length, step).toBeGreaterThan(0);
    }
  });
});

describe('the marker (D1)', () => {
  it('stands round the first step of each spot with a flag, and is a chalked square for the chest', () => {
    for (const line of Object.keys(LINES) as LineId[]) {
      const shape = SHAPES[LINES[line][0]!]!, m = markerModel(shape), b = new THREE.Box3().setFromObject(group(m.parts));
      expect(b.max.y, line).toBeCloseTo(MARKER.flag, 1);
      expect(b.min.y, line).toBeGreaterThan(-0.01);
      const [x0, x1, z0, z1] = boundsOf(shape);
      expect(b.min.x).toBeLessThanOrEqual(x0); expect(b.max.x).toBeGreaterThanOrEqual(x1);
      expect(b.min.z).toBeLessThanOrEqual(z0); expect(b.max.z).toBeGreaterThanOrEqual(z1);
    }
    const chalk = new THREE.Box3().setFromObject(group(markerModel(SHAPES.chest!, true).parts));
    expect(chalk.max.y).toBeLessThan(0.02);                       // flat on the floor
    expect(chalk.max.x - chalk.min.x).toBeCloseTo(0.9 + 0.035, 2);
  });
});

// ---- the view ----

/** A camp game with the goals up to (not including) the one that makes `upTo` done and their buildings built, by day. */
function camp(built: MakeId[], hour = 10): GameState {
  const state = createState(CAMP, 3);
  state.goalsDone = GOALS.map(g => g.id);
  state.built = [...built];
  state.tools = { axe: true, pick: true, rod: true };
  state.time = DAY_SECONDS * (1 + hour / 24);
  return state;
}
const BASE: MakeId[] = ['campfire', 'woodpile', 'shelter', 'chest', 'dummy'];
function view(state: GameState) {
  const scene = new THREE.Scene(), v = new CampView(scene, CAMP, models);
  v.update(state, 1, 0.5, 0); v.update(state, 2, 0.5, 0);
  return v;
}
const at = (o: THREE.Object3D): Vec2 => { const w = o.getWorldPosition(new THREE.Vector3()); return { x: w.x, z: w.z }; };
const near = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

describe('the camp drawn (render/structures.ts)', () => {
  it('a new game shows nothing at any spot: no step, no marker, no ring, no tap area (In 1)', () => {
    const state = createState(CAMP, 3), v = view(state);
    for (const id of STEPS) expect(v.drawnOf(id)?.stage ?? -1, id).toBe(-1);
    for (const line of [...Object.keys(LINES), 'chest'] as (LineId | 'chest')[]) expect(v.markerAt(line), line).toBe(false);
    expect(v.pickables.filter(o => o.visible)).toEqual([]);
  });

  it('shows each marker exactly while its goal is up (markerShown), and its footings once begun instead', () => {
    for (const [i, goal] of GOALS.entries()) {
      const state = createState(CAMP, 3);
      state.goalsDone = GOALS.slice(0, i).map(g => g.id);
      for (const g of GOALS.slice(0, i)) { const id = g.makes as MakeId | undefined; if (id && MAKES[id].gives.kind === 'structure') state.built.push(id); }
      const v = view(state);
      for (const line of Object.keys(LINES) as LineId[]) expect(v.markerAt(line), `${goal.id} ${line}`).toBe(markerShown(state, CAMP, LINES[line][0]!));
      expect(v.markerAt('chest'), goal.id).toBe(markerShown(state, CAMP, 'chest'));
      const makes = goal.makes as MakeId | undefined;
      if (makes && STEPS.includes(makes)) {
        state.underway[makes] = 0;
        v.update(state, 3, 0.1, 0);
        expect(v.drawnOf(makes)!.stage, goal.id).toBe(0);
        expect(v.markerAt(makes === 'chest' ? 'chest' : Object.keys(LINES).find(l => LINES[l as LineId][0] === makes) as LineId), goal.id).toBe(false);
      }
    }
  });

  it('draws each step at the stage it has reached, a ring as far round as it reaches filling as it goes', () => {
    for (const id of STEPS.filter(x => x !== 'chest')) {
      const before = Object.values(LINES).find(l => l.includes(id))!.slice(0, Object.values(LINES).find(l => l.includes(id))!.indexOf(id));
      const state = camp([...new Set([...BASE.filter(b => !Object.values(LINES).some(l => l.includes(b) && l.includes(id))), ...before])]);
      const v = view(state);
      for (let stage = 0; stage < CARPENTRY.stages; stage++) {
        state.underway[id] = MAKES[id].time * (stage + 0.5) / CARPENTRY.stages;
        v.update(state, 3 + stage, 0.1, 0);
        const d = v.drawnOf(id)!;
        expect(d.stage, `${id} at ${stage}`).toBe(stage);
        expect(d.ring, id).toBeCloseTo(reachOf(id) + 0.12, 5);
      }
      delete state.underway[id]; state.built.push(id);
      v.update(state, 9, 0.1, 0);
      expect(v.drawnOf(id)!.stage, id).toBe(CARPENTRY.stages);
      expect(v.drawnOf(id)!.ring, id).toBeNull();
      const place = stepPlace(CAMP, id)!;
      expect(near(at(v.drawnOf(id)!.root), place.pos), id).toBeLessThan(1e-6);
    }
  });

  it('keeps the old step drawn until the new one is half built, its guy ropes gone once the new one is begun (D6)', () => {
    for (const [old, step] of UPGRADES) {
      const line = Object.keys(LINES).find(l => LINES[l as LineId].includes(step)) as LineId;
      const before = LINES[line].slice(0, LINES[line].indexOf(step));
      const state = camp([...new Set([...BASE, ...before])]), v = view(state);
      expect(v.drawnOf(old)!.stage).toBe(CARPENTRY.stages);
      const pegs = v.drawnOf(old)!.guys;
      for (let stage = 0; stage < CARPENTRY.stages; stage++) {
        state.underway[step] = MAKES[step].time * (stage + 0.5) / CARPENTRY.stages;
        v.update(state, 3 + stage, 0.1, 0);
        expect(v.drawnOf(step)!.stage, `${step} ${stage}`).toBe(stage);
        expect(v.drawnOf(old)!.stage, `${old} while ${step} is at ${stage}`).toBe(stage < CARPENTRY.shown ? CARPENTRY.stages : -1);
        if (stage < CARPENTRY.shown) expect(v.drawnOf(old)!.guys, old).toBe(false);
        expect(stepShown(state, line)).toBe(stage < CARPENTRY.shown ? old : step);
      }
      if (old === 'shelter' || old === 'wall_tent') expect(pegs, `${old} has guy ropes or pegs`).toBe(true);
    }
  });

  it('draws the storage chest stage by stage at the shelter step drawn, on its floor (T8.6)', () => {
    for (const shelters of [['shelter'], ['shelter', 'wall_tent'], ['shelter', 'wall_tent', 'log_cabin']] as MakeId[][]) {
      const state = camp(['campfire', 'woodpile', ...shelters, 'dummy']), v = view(state);
      for (let stage = 0; stage <= CARPENTRY.stages; stage++) {
        if (stage < CARPENTRY.stages) state.underway.chest = MAKES.chest.time * (stage + 0.5) / CARPENTRY.stages;
        else { delete state.underway.chest; state.built.push('chest'); }
        v.update(state, 3 + stage, 0.1, 0);
        const d = v.drawnOf('chest')!, step = stepShown(state, 'tent')!, place = stepPlace(CAMP, step)!;
        expect(d.stage).toBe(stage);
        expect(near(at(d.root), toGround(place, SHAPES[step]!.chest!)), step).toBeLessThan(1e-6);
        expect(d.root.position.y, step).toBeCloseTo(SHAPES[step]!.floor!, 6);
        expect(d.root.rotation.y, step).toBeCloseTo(place.rot, 6);
        expect(chestPlace(state, CAMP)!.floor).toBe(SHAPES[step]!.floor);
      }
    }
    // its chalk square shows while the chest's goal is up, just inside the tent's front
    const state = createState(CAMP, 3), i = GOALS.findIndex(g => g.makes === 'chest');
    state.goalsDone = GOALS.slice(0, i).map(g => g.id); state.built = ['campfire', 'woodpile', 'shelter'];
    expect(markerShown(state, CAMP, 'chest')).toBe(true);
    expect(view(state).markerAt('chest')).toBe(true);
  });

  it('shows as many logs in the pile and in the woodshed as the firewood count, none drawn past it', () => {
    for (const built of [['woodpile'], ['woodpile', 'woodshed']] as MakeId[][]) {
      const state = camp([...BASE, ...built]), v = view(state), id = built[built.length - 1]!;
      for (const n of [0, 7, WOODPILE.max]) {
        state.woodpile = n;
        v.update(state, 3, 0.1, 0);
        let drawnTris = 0;
        v.drawnOf(id)!.parts!.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.visible && m.geometry.drawRange.count !== Infinity) drawnTris += m.geometry.drawRange.count / 3; });
        if (n === 0) expect(drawnTris, `${id} ${n}`).toBe(0);
        else expect(drawnTris, `${id} ${n}`).toBe(Math.round(n * (triangles(group(parts(id, CARPENTRY.stages).logs)) / WOODPILE.max)));
      }
    }
  });
});

describe('tap areas and rings follow each step (T11.3, In 11)', () => {
  it('has none at a spot until its marker shows or something is begun there; then round the step furthest out', () => {
    const state = createState(CAMP, 3);
    for (const line of Object.keys(LINES) as LineId[]) expect(tapBoxOf(state, CAMP, line), line).toBeNull();
    expect(tapBoxOf(state, VILLAGE, 'hearth')).toBeNull();
    // the campfire's goal: its marker's tap area
    state.goalsDone = GOALS.slice(0, GOALS.findIndex(g => g.makes === 'campfire')).map(g => g.id);
    const box = tapBoxOf(state, CAMP, 'hearth')!;
    expect(box.step).toBe('campfire');
    expect(box.radius).toBe(Math.max(reachOf('campfire') + TAP.pad, MARKER.tap));
    expect(near(box.pos, stepPlace(CAMP, 'campfire')!.pos)).toBe(0);
  });

  it('grows with each step along every line, as tall as it is, and the view puts its tap area there', () => {
    for (const line of Object.keys(LINES) as LineId[]) {
      const state = camp(BASE.filter(b => !LINES[line].includes(b))), v = view(state);
      let last = 0;
      for (const id of LINES[line]) {
        for (const phase of ['begun', 'built'] as const) {
          if (phase === 'begun') state.underway[id] = 1; else { delete state.underway[id]; state.built.push(id); }
          v.update(state, 3, 0.1, 0);
          const box = tapBoxOf(state, CAMP, line)!;
          expect(box.step, `${line} ${id} ${phase}`).toBe(outermost(state, line));
          expect(box.radius).toBeCloseTo(Math.max(reachOf(id) + TAP.pad, MARKER.tap), 9);
          expect(box.tall).toBe(SHAPES[id]!.tall);
          expect(near(box.pos, stepPlace(CAMP, id)!.pos)).toBeLessThan(1e-9);
          expect(box.radius).toBeGreaterThanOrEqual(last);
          last = box.radius;
          const tap = v.pickables.find(o => o.userData.campSpot === line)!;
          expect(tap.visible, `${line} ${id} ${phase}`).toBe(true);
          expect(tap.scale.x).toBeCloseTo(box.radius, 9);
          expect(tap.scale.y).toBeCloseTo(box.tall, 9);
          expect(near(at(tap), box.pos)).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('what a tap there does for now (until stage 5): build or carry on, stack, cook, practise; the chest by day, bed at night', () => {
    const tagOf = (state: GameState, line: LineId) => { const v = view(state), t = v.pickables.find(o => o.userData.campSpot === line)!; return t.visible ? { ...t.userData, campSpot: undefined } : null; };
    // the first five while their marker shows or they are under way
    const fresh = createState(CAMP, 3);
    fresh.goalsDone = GOALS.slice(0, GOALS.findIndex(g => g.makes === 'campfire')).map(g => g.id);
    expect(tagOf(fresh, 'hearth')).toEqual({ makeId: 'campfire', campSpot: undefined });
    // a set-up camp by day
    const day = camp(BASE);
    expect(tagOf(day, 'tent')).toMatchObject({ storeId: 'chest' });
    expect(tagOf(day, 'woodpile')).toMatchObject({ storeId: 'woodpile' });
    expect(tagOf(day, 'hearth')).toMatchObject({ cookId: 'campfire' });
    expect(tagOf(day, 'dummy')).toMatchObject({ fightId: 'dummy' });
    // with an upgrade under way: carry on with it, but the chest comes first at the shelter by day, and bed at night
    for (const [line, id] of [['woodpile', 'woodshed'], ['hearth', 'stone_hearth'], ['tent', 'wall_tent']] as [LineId, MakeId][]) {
      const s = camp(BASE); s.underway[id] = 5;
      expect(tagOf(s, line), id).toMatchObject(line === 'tent' ? { storeId: 'chest' } : { raiseId: id });
      const night = camp(BASE, 22); night.underway[id] = 5;
      expect(tagOf(night, line), id).toMatchObject(line === 'tent' ? { sleepId: 'shelter' } : { raiseId: id });
    }
    // a built fire with no cooking to do yet: nothing (a tap walks him beside it)
    const noRod = camp(BASE); noRod.tools = { axe: true, pick: true, rod: false };
    expect(tagOf(noRod, 'hearth')).toBeNull();
  });
});

describe("his fish at the fire (render/cooking.ts, D20)", () => {
  it('at the campfire on a stick at its edge; at the stone hearth on its spit, from its footings on, the hearth\'s own fish put aside', () => {
    const state = camp(BASE), scene = new THREE.Scene(), cook = new CookingView(scene, CAMP);
    state.player.task = { kind: 'cook', doneAt: state.time + 5 };
    cook.update(state);
    const fire = stepPlace(CAMP, 'campfire')!.pos, onStick = cook.fishAt()!;
    expect(onStick.onSpit).toBe(false);
    expect(near({ x: onStick.pos.x, z: onStick.pos.z }, fire)).toBeLessThan(0.7);
    for (const stage of [0, CARPENTRY.stages]) {
      if (stage < CARPENTRY.stages) state.underway.stone_hearth = 1; else { delete state.underway.stone_hearth; state.built.push('stone_hearth'); }
      cook.update(state);
      const fish = cook.fishAt()!, place = stepPlace(CAMP, 'stone_hearth')!, spit = SHAPES.stone_hearth!.spit!;
      const mid = toGround(place, [(spit.posts[0][0] + spit.posts[1][0]) / 2, (spit.posts[0][1] + spit.posts[1][1]) / 2]);
      expect(fish.onSpit, `stage ${stage}`).toBe(true);
      expect(near({ x: fish.pos.x, z: fish.pos.z }, mid)).toBeLessThan(1e-6);
      expect(fish.pos.y).toBeCloseTo(spit.height, 6);
    }
    // the hearth's own roast fish hide while his cook
    const v = view(state), fishOf = () => { let shown = 0; v.drawnOf('stone_hearth')!.parts!.traverse(o => { if (o.visible) shown++; }); return shown; };
    const cooking = fishOf();
    state.player.task = { kind: 'idle' }; v.update(state, 5, 0.1, 0);
    expect(fishOf()).toBeGreaterThan(cooking);
  });
});
