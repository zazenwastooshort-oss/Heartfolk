// The whole camp, in the game (the camp build's stage 6: docs/plans/2026-10-13-camp-build-plan.md). A save with every
// building at its largest step, tests/fixtures/camp/whole-camp.json, made by playing a new game: the playthrough bot
// plays to the training dummy (chapter 1 and the dummy's goal: the campfire, the firewood pile, the tent, the storage
// chest and the dummy, built by him in stages), then he builds the four upgrades one after another (the wall tent, the
// log cabin, the stone hearth and the woodshed; what each needs is put in the chest first), and the woodshed is filled.
// It opens in the game as it is (no time stamp, so no away time is caught up): paste it as localStorage
// 'hearthfolk_camp' to walk round the camp (tests/fixtures/camp/README.md). Made again with HEARTHFOLK_WHOLE_CAMP=1.
// Here: it is the whole camp, and loads as such; walking round it (and round the camp before the upgrades), he never
// goes through any part of a building between his ankles and his head; and every spot can be tapped, by day and at
// night, a tap there doing one of the things its menu offers. (That a tap on the screen reaches the right spot, the
// training dummy beyond the log cabin's roof included: tests/campmodels.test.ts.) A game handed over by the artifact
// viewer's hot swap, or reloaded, carries on with what is under way and its markers as they were; and the village is
// untouched: none of the camp's buildings, markers, menus, doors or walking there.
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createState, currentGoal, type GameState } from '../src/core/state';
import { EventBus } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS } from '../src/core/clock';
import { deserialize, readSave, serialize, SAVE_KEY } from '../src/core/save';
import { buildOpen, buildRows, markerShown, progressOf, stageOf, walkGrid } from '../src/core/building';
import { actionKey, campActions, campTap, chestHere, chestPlace, outermost, shelterDoor, tapBoxOf } from '../src/core/camp';
import { step } from '../src/sim';
import { applyCommands } from '../src/systems/commands';
import { CAMP } from '../src/world/camp';
import { VILLAGE, type Vec2 } from '../src/world/layout';
import { outsideOf, standsOf, stepPlace } from '../src/world/steps';
import { stageParts, type Protos } from '../src/render/campmodels';
import { CampView } from '../src/render/structures';
import { CARPENTRY, LINES, SHAPES, STAGED, type LineId } from '../src/data/building';
import { MAKES, type MakeId } from '../src/data/making';
import { WOODPILE } from '../src/data/fire';
import { GOALS } from '../src/data/goals';
import { Bot } from './bot';

const FIXTURE = new URL('./fixtures/camp/whole-camp.json', import.meta.url);
const SPOTS = Object.keys(LINES) as LineId[];
/** Every step at the camp's spots, and the storage chest in the shelter. */
const EVERY: MakeId[] = [...SPOTS.flatMap(l => LINES[l]), 'chest'];
/** The upgrades, in the order he builds them. */
const UPGRADES = Object.keys(STAGED).filter(id => STAGED[id as MakeId]!.upgrades) as MakeId[];

/** The whole camp, by play: a new game the bot plays to the training dummy, then each upgrade built by him, what it
 *  needs put in the chest first (with some to spare, so the current goal's share never holds one back). */
function playWholeCamp(seed = 7): GameState {
  const events = new EventBus(), state = createState(CAMP, seed), ctx = { layout: CAMP, rng: createRng(seed), events }, bot = new Bot(CAMP, events);
  for (let t = 0; t < 3 * 3600 && !state.goalsDone.includes('dummy'); t += STEP) { bot.tick(state, events); step(state, STEP, ctx); }
  if (!state.goalsDone.includes('dummy')) throw new Error('the bot did not reach the training dummy');
  for (const id of UPGRADES) {
    for (const [item, n] of Object.entries(MAKES[id].needs)) state.bank[item] = (state.bank[item] ?? 0) + n + 6;
    applyCommands(state, CAMP, [{ type: 'build', id }], events);
    for (let t = 0; t < 3600 && !state.built.includes(id); t += STEP) step(state, STEP, ctx);
    if (!state.built.includes(id)) throw new Error(`${id} was not built`);
  }
  state.woodpile = WOODPILE.max;
  return state;
}

if (process.env.HEARTHFOLK_WHOLE_CAMP === '1') {
  mkdirSync(new URL('./fixtures/camp/', import.meta.url), { recursive: true });
  writeFileSync(FIXTURE, serialize(playWholeCamp()));
}

const loaded = () => readSave(readFileSync(FIXTURE, 'utf8'), CAMP);

describe('the whole camp, a save to open in the game (tests/fixtures/camp/whole-camp.json)', () => {
  it('has every building at its largest step, built by him, nothing under way, the woodshed full; it opens as it is', () => {
    const { state, savedAt } = loaded();
    expect(savedAt).toBeNull();                                         // no away time caught up on opening it
    expect([...state.built].sort()).toEqual([...EVERY].sort());
    for (const line of SPOTS) expect(outermost(state, line), line).toBe(LINES[line].at(-1));
    expect(state.underway).toEqual({});
    expect(state.woodpile).toBe(WOODPILE.max);
    // chapter 1 and the dummy's goal done, and every knock's Carpentry XP of all nine
    expect(state.goalsDone).toEqual(GOALS.slice(0, GOALS.findIndex(g => g.id === 'dummy') + 1).map(g => g.id));
    expect(currentGoal(state).id).toBe('stone_club');
    const knocks = EVERY.reduce((a, id) => a + Math.floor(MAKES[id].time / CARPENTRY.knock) * CARPENTRY.xp, 0);
    expect(state.skills.carpentry).toBe(knocks);
    // he stands on open ground, outside everything
    expect(walkGrid(state, CAMP).walkable(state.player.pos)).toBe(true);
    for (const id of EVERY) expect(outsideOf(CAMP, id, state.player.pos), id).toBeGreaterThan(0);
    expect(SAVE_KEY).toBe('hearthfolk_camp');
  });

  it('is made the same way still: a new game played to the dummy, the upgrades built by him', { timeout: 60_000 }, () => {
    const made = playWholeCamp();
    expect([...made.built].sort()).toEqual([...EVERY].sort());
    expect(made.underway).toEqual({});
    expect(made.skills.carpentry).toBe(loaded().state.skills.carpentry);
  });
});

// ---- walking round it ----

/** Parts of the camp's buildings no walk may come near: from his ankles to the top of his head (he is 1.71 m tall). */
const BODY = { ankle: 0.1, head: 1.7 };
/** The least room between where he walks and any such part, metres: less and a leg or his body would go through it.
 *  (The campfire's stones and the training dummy's arms come nearest, at about 0.16 m: they are in the way as they
 *  always were, tests/layout.test.ts T11.8.) */
const CLEAR = 0.15;

let P: Protos, models: THREE.Object3D;
beforeAll(async () => {
  const b = readFileSync(new URL('../assets/models/village.glb', import.meta.url));
  models = (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, '')).scene;
  P = name => models.getObjectByName(name)!;
});

/** Points of the parts drawn of what stands at each spot (the step furthest out, built), between his ankles and his
 *  head, every 5 cm or so over each face, as they stand at the camp, one to each centimetre square of the ground; found
 *  by where they are, a CLEAR-wide square at a time. Returns the part nearest a point on the ground within CLEAR of it,
 *  and how far it is (Infinity with none that near). */
function partsOf(state: GameState) {
  const cell = CLEAR, at = new Map<number, { x: number; z: number; y: number; id: MakeId }[]>(), seen = new Set<number>();
  const key = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);
  for (const line of SPOTS) {
    const id = outermost(state, line);
    if (!id) continue;
    const place = stepPlace(CAMP, id)!, p = stageParts(id, CARPENTRY.stages, P, SHAPES[id]!);
    const root = new THREE.Group(); root.position.set(place.pos.x, 0, place.pos.z); root.rotation.y = place.rot;
    root.add(...p.fixed, ...p.guys, ...p.logs, ...p.fish, ...p.sway); root.updateMatrixWorld(true);
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], q = new THREE.Vector3();
    root.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const pos = m.geometry.getAttribute('position'), idx = m.geometry.index, n = idx ? idx.count : pos.count;
      for (let t = 0; t < n; t += 3) {
        for (let j = 0; j < 3; j++) v[j]!.fromBufferAttribute(pos, idx ? idx.getX(t + j) : t + j).applyMatrix4(m.matrixWorld);
        const k = Math.max(1, Math.ceil(Math.max(v[0]!.distanceTo(v[1]!), v[1]!.distanceTo(v[2]!), v[0]!.distanceTo(v[2]!)) / 0.05));
        for (let a = 0; a <= k; a++) for (let c = 0; c <= k - a; c++) {
          q.set(0, 0, 0).addScaledVector(v[0]!, a / k).addScaledVector(v[1]!, c / k).addScaledVector(v[2]!, 1 - (a + c) / k);
          if (q.y < BODY.ankle || q.y > BODY.head) continue;
          const cm = key(Math.round(q.x * 100), Math.round(q.z * 100));
          if (seen.has(cm)) continue;
          seen.add(cm);
          const k2 = key(Math.floor(q.x / cell), Math.floor(q.z / cell));
          (at.get(k2) ?? at.set(k2, []).get(k2)!).push({ x: q.x, z: q.z, y: q.y, id });
        }
      }
    });
  }
  return (p: Vec2) => {
    let best = Infinity, part: { x: number; z: number; y: number; id: MakeId } | null = null;
    const cx = Math.floor(p.x / cell), cz = Math.floor(p.z / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const q of at.get(key(cx + i, cz + j)) ?? []) {
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < best) { best = d; part = q; }
    }
    return { best: best < CLEAR ? best : Infinity, part };
  };
}

/** Where he walks to and from round the camp: a ring of points round it, every stand of what stands, and points
 *  scattered among the buildings (those on open ground). */
function endsOf(state: GameState): Vec2[] {
  const rng = createRng(11), out: Vec2[] = [];
  for (let k = 0; k < 20; k++) { const a = k / 20 * Math.PI * 2; out.push({ x: 1.2 + Math.cos(a) * 7, z: 4 + Math.sin(a) * 6.5 }); }
  for (const id of state.built) out.push(...standsOf(CAMP, id));
  for (let k = 0; k < 24; k++) out.push({ x: -5 + rng.next() * 12, z: -1 + rng.next() * 12 });
  const grid = walkGrid(state, CAMP);
  return out.filter(p => grid.walkable(p));
}

describe('walking round the camp, he never goes through a building (the plan: "nothing clips")', () => {
  const STAGES: [string, () => GameState][] = [
    ['the camp of chapter 1 and the dummy', () => { const s = createState(CAMP, 3); s.built = ['campfire', 'woodpile', 'shelter', 'chest', 'dummy']; return s; }],
    ['with the wall tent', () => { const s = createState(CAMP, 3); s.built = ['campfire', 'woodpile', 'shelter', 'chest', 'dummy', 'wall_tent']; return s; }],
    ['the whole camp', () => loaded().state],
  ];
  it.each(STAGES)('%s: every walk between points round it keeps CLEAR of every part between his ankles and his head', { timeout: 60_000 }, (_, make) => {
    const state = make(), grid = walkGrid(state, CAMP), nearest = partsOf(state), ends = endsOf(state), close: string[] = [];
    let walks = 0;
    for (const a of ends) for (const b of ends) {
      if (a === b) continue;
      const path = grid.findPath(a, b);
      if (!path) continue;
      walks++;
      let from = a;
      for (const to of path) {
        const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.1));
        for (let s = 0; s <= n; s++) {
          const p = { x: from.x + (to.x - from.x) * s / n, z: from.z + (to.z - from.z) * s / n }, { best, part } = nearest(p);
          if (best < CLEAR) close.push(`${part!.id}: ${best.toFixed(2)} m from a part ${part!.y.toFixed(2)} m up, walking at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
        }
        from = to;
      }
    }
    expect(walks).toBeGreaterThan(1000);
    expect([...new Set(close)].slice(0, 5)).toEqual([]);
  });
});

// ---- everything can be tapped ----

describe('every spot of the whole camp can be tapped, by day and at night', () => {
  it.each([['by day', 10], ['at night', 22]] as const)('%s: a tap area at each, and a tap there does one of the things its menu offers', (_, hour) => {
    const { state } = loaded();
    state.time = (Math.floor(state.time / DAY_SECONDS) + 1 + hour / 24) * DAY_SECONDS;
    for (const line of SPOTS) {
      const box = tapBoxOf(state, CAMP, line), tap = campTap(state, CAMP, line), menu = campActions(state, CAMP, line);
      expect(box?.step, line).toBe(LINES[line].at(-1));
      expect(tap, line).not.toBeNull();
      expect(menu.map(e => actionKey(e.action)), line).toContain(actionKey(tap!.action));
    }
    // the words under the mouse, as the owner reads them
    const hovers = Object.fromEntries(SPOTS.map(l => [l, campTap(state, CAMP, l)!.hover]));
    // (no logs on him: the woodshed's words are just its name, as the hearth's are with no rod or fish; a tap there only
    // says why)
    expect(hovers).toEqual(hour === 10
      ? { hearth: 'Stone hearth', tent: 'Look in|Chest', woodpile: 'Woodshed', dummy: 'Practise on|Training dummy' }
      : { hearth: 'Stone hearth', tent: 'Sleep in|Log cabin', woodpile: 'Woodshed', dummy: 'Practise on|Training dummy' });
  });
});

// ---- the hot swap, and the village ----

describe('a game handed over by the hot swap, or reloaded, carries on as it was', () => {
  it("the whole camp with the log cabin half built, and a new camp at the campfire's goal: the same steps, progress, stages, markers and places", () => {
    const building = loaded().state;
    building.built = building.built.filter(id => id !== 'log_cabin');
    building.underway = { log_cabin: 100 };
    const marked = createState(CAMP, 5);
    marked.goalsDone = ['salvage'];
    for (const state of [building, marked]) {
      // main.ts: a hot swap hands over serialize(state) and reads it with deserialize; a reload reads the browser's save
      for (const back of [deserialize(serialize(state), CAMP), readSave(serialize(state, Date.now()), CAMP).state]) {
        expect(back).toEqual(state);
        for (const id of EVERY) {
          expect(stageOf(back, id), id).toBe(stageOf(state, id));
          expect(progressOf(back, id), id).toBe(progressOf(state, id));
          expect(markerShown(back, CAMP, id), id).toBe(markerShown(state, CAMP, id));
        }
        for (const line of SPOTS) expect(tapBoxOf(back, CAMP, line), line).toEqual(tapBoxOf(state, CAMP, line));
        expect(shelterDoor(back, CAMP)).toEqual(shelterDoor(state, CAMP));
      }
    }
    expect(stageOf(building, 'log_cabin')).toBe(1);
    expect(markerShown(marked, CAMP, 'campfire')).toBe(true);
  });
});

describe('the village is untouched', () => {
  it('a village game with every camp building in its lists: no marker, tap area, menu, door, chest or Build window, nothing drawn, and walking as before', () => {
    const plain = createState(VILLAGE, 3), camped = createState(VILLAGE, 3);
    camped.built = [...EVERY];
    camped.underway = { log_cabin: 100 };
    camped.goalsDone = GOALS.map(g => g.id);
    for (const s of [plain, camped]) {
      for (const id of EVERY) expect(markerShown(s, VILLAGE, id), id).toBe(false);
      for (const line of SPOTS) {
        expect(tapBoxOf(s, VILLAGE, line), line).toBeNull();
        expect(campTap(s, VILLAGE, line), line).toBeNull();
        expect(campActions(s, VILLAGE, line), line).toEqual([]);
      }
      expect(shelterDoor(s, VILLAGE)).toBeNull();
      expect(chestPlace(s, VILLAGE)).toBeNull();
      expect(chestHere(s, VILLAGE)).toBe(false);
      expect(buildOpen(s, VILLAGE)).toBe(false);
      expect(buildRows(s, VILLAGE)).toEqual([]);
    }
    // walking: exactly the village's own grid, cell by cell
    const a = walkGrid(plain, VILLAGE), b = walkGrid(camped, VILLAGE), v = VILLAGE.village;
    let cells = 0;
    for (let x = v.minX; x <= v.maxX; x += 0.4) for (let z = v.minZ; z <= v.maxZ; z += 0.4) {
      expect(b.walkable({ x, z }), `${x.toFixed(1)},${z.toFixed(1)}`).toBe(a.walkable({ x, z }));
      cells++;
    }
    expect(cells).toBeGreaterThan(1000);
    // drawn: nothing of the camp in the village
    const view = new CampView(new THREE.Scene(), VILLAGE, models);
    view.update(camped, 1, 0.5, 0);
    expect(view.pickables.filter(o => o.visible)).toEqual([]);
    for (const id of EVERY) expect(view.drawnOf(id)?.stage ?? -1, id).toBe(-1);
  });
});
