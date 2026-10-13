// Freezing old saves: save format 11 with building in stages (camp 0.0.27, 0.0.29, and 0.0.30 before its needs cases:
// the log bench and the workbench placed by the player, the lean-to and the log hut at the tent's spot, all of which the
// camp build removes or turns into the wall tent and the log cabin). Run by tools/freeze_saves.mjs inside a worktree of
// the tag, as tests/freeze.test.ts. The cases (docs/plans/2026-10-13-camp-build-plan.md stage 0): the lean-to begun at
// each stage and built; the log hut begun and built; the bench and the workbench each placed and begun, placed and
// built, and both together; a bench and a lean-to begun in the same save; for each of the four, on his way to it (a
// pending raise) and stoking the fire with it to go back to (stoke.back raise), at work at it being the begun cases; a
// cooking fetch; a trip for food to fight rats with, the chest tapped on the way; asleep at the back of the tent (and of
// the lean-to); and two saves the playthrough bot played to (the end of chapter 1, and the cooked meal in chapter 2).
import { describe, expect, it } from 'vitest';
import { STOKE } from '../src/data/fire';
import { COOK } from '../src/data/cooking';
import { MAKES, type MakeId } from '../src/data/making';
import { XP_TABLE } from '../src/data/xp';
import { nightOf } from '../src/core/clock';
import { fitOf, isPlaced, placeStart, stageOf, walkGrid } from '../src/core/building';
import { step } from '../src/sim';
import type { GameState } from '../src/core/state';
import type { Vec2 } from '../src/world/layout';
import { Bot } from './bot';
import {
  CAMP, ON, STEP, VERSION, at, behindTent, fillChest, freeze, game, progressTo, run, runUntil, send, standAt, written, type Game,
} from './freeze_common';

const grid = (s: GameState) => walkGrid(s, CAMP);
const goingTo = (s: GameState, id: string) => s.player.pending?.kind === 'visit' && s.player.pending.id === id;
const raising = (s: GameState, id: MakeId) => s.player.task.kind === 'raise' && s.player.task.id === id;
const worked = (s: GameState, id: MakeId) => s.underway[id] ?? -1;
/** How far behind the tent's middle (away from the fire) `p` is. */
const behind = (p: Vec2) => {
  const tent = CAMP.camp!.tent.pos, fire = CAMP.hearth.pos, d = Math.hypot(tent.x - fire.x, tent.z - fire.z);
  return ((p.x - tent.x) * (tent.x - fire.x) + (p.z - tent.z) * (tent.z - fire.z)) / d;
};

/** What building takes, on top of a full chest: plenty for everything at once. */
const MATERIALS = { birch_logs: 80, bark: 20, fibre: 20, clay: 20, branch: 20, stone: 20 };
const REMOVED: MakeId[] = ['log_bench', 'workbench', 'lean_to', 'log_hut'];

/** A camp with every goal up to `last` done (by default the training dummy: chapter 2 begun, before he gets hungry), a
 *  full chest with plenty to build with, Carpentry at level 3 (everything unlocked), in the morning of day 1, him by
 *  the fire. */
function ready(last = 'dummy', seed = 7): Game {
  const g = game(seed), s = g.state;
  progressTo(s, last);
  fillChest(s, MATERIALS);
  s.skills.carpentry = XP_TABLE[3]!;
  s.time = at(1, 8);
  const fire = CAMP.hearth.pos;
  standAt(s, { x: fire.x + 2.2, z: fire.z + 1.2 }, grid(s));
  return g;
}

/** A spot where `id` fits, beside him, as the Build window's see-through copy would start. */
function placeFor(g: Game, id: MakeId): Vec2 {
  const p = g.state.player.pos;
  for (const cam of [{ x: p.x, z: p.z + 10 }, { x: p.x + 10, z: p.z }, { x: p.x, z: p.z - 10 }, { x: p.x - 10, z: p.z }]) {
    const spot = placeStart(g.state, CAMP, id, cam);
    if (!fitOf(g.state, CAMP, id, spot, 0)) return spot;
  }
  throw new Error(`${VERSION}: nowhere to place ${id}`);
}

/** Press Build for `id` (placing it beside him first, for the bench and the workbench). */
function begin(g: Game, id: MakeId): void {
  if (isPlaced(id)) send(g, { type: 'build', id, at: placeFor(g, id), turn: 0 });
  else send(g, { type: 'build', id });
  expect(g.state.underway[id], `${id} begun`).toBe(0);
  if (isPlaced(id)) expect(g.state.placed[id]).toBeDefined();
}

/** Begin `id` and work at it until `seconds` of it are done. */
function workAt(g: Game, id: MakeId, seconds: number): void {
  begin(g, id);
  runUntil(g, () => raising(g.state, id) && worked(g.state, id) >= seconds, seconds + 120, `${seconds} s of work at ${id}`);
}

describe.skipIf(!ON)(`freeze ${VERSION} (format 11, building in stages)`, () => {
  it('the lean-to begun at each stage, and built', () => {
    const g = ready(), T = MAKES.lean_to.time;
    workAt(g, 'lean_to', 4);
    freeze('lean_to-stage0', g, s => { expect(stageOf(s, 'lean_to')).toBe(0); expect(raising(s, 'lean_to')).toBe(true); });
    runUntil(g, () => worked(g.state, 'lean_to') >= T / 3 + 4, T);
    freeze('lean_to-stage1', g, s => { expect(stageOf(s, 'lean_to')).toBe(1); expect(raising(s, 'lean_to')).toBe(true); });
    runUntil(g, () => worked(g.state, 'lean_to') >= T * 2 / 3 + 4, T);
    freeze('lean_to-stage2', g, s => { expect(stageOf(s, 'lean_to')).toBe(2); expect(raising(s, 'lean_to')).toBe(true); });
    runUntil(g, () => g.state.built.includes('lean_to'), T);
    run(g, 1);
    freeze('lean_to-built', g, s => { expect(s.built).toContain('lean_to'); expect(s.underway).toEqual({}); });
  });

  it('the log hut begun, and built', () => {
    const g = ready(), T = MAKES.log_hut.time;
    g.state.built.push('lean_to');
    workAt(g, 'log_hut', 20);
    freeze('log_hut-begun', g, s => { expect(s.built).toContain('lean_to'); expect(worked(s, 'log_hut')).toBeGreaterThan(0); expect(raising(s, 'log_hut')).toBe(true); });
    runUntil(g, () => g.state.built.includes('log_hut'), T);
    run(g, 1);
    freeze('log_hut-built', g, s => { expect(s.built).toEqual(expect.arrayContaining(['shelter', 'lean_to', 'log_hut'])); expect(s.underway).toEqual({}); });
  });

  it('the log bench and the workbench: each placed and begun, placed and built, and both together', () => {
    for (const id of ['log_bench', 'workbench'] as MakeId[]) {
      const g = ready();
      workAt(g, id, 5);
      freeze(`${id}-begun`, g, s => { expect(s.placed[id]).toBeDefined(); expect(worked(s, id)).toBeGreaterThan(0); expect(raising(s, id)).toBe(true); });
      runUntil(g, () => g.state.built.includes(id), MAKES[id].time);
      run(g, 1);
      freeze(`${id}-built`, g, s => { expect(s.built).toContain(id); expect(s.placed[id]).toBeDefined(); expect(s.underway).toEqual({}); });
    }
    const g = ready();
    workAt(g, 'log_bench', 6);
    workAt(g, 'workbench', 6);
    freeze('bench-and-workbench-begun', g, s => {
      expect(Object.keys(s.placed).sort()).toEqual(['log_bench', 'workbench']);
      expect(worked(s, 'log_bench')).toBeGreaterThan(0); expect(worked(s, 'workbench')).toBeGreaterThan(0);
    });
    runUntil(g, () => g.state.built.includes('workbench'), MAKES.workbench.time);
    send(g, { type: 'build', id: 'log_bench' });              // carry on with the bench
    runUntil(g, () => g.state.built.includes('log_bench'), MAKES.log_bench.time + 30);
    run(g, 1);
    freeze('bench-and-workbench-built', g, s => { expect(s.built).toEqual(expect.arrayContaining(['log_bench', 'workbench'])); expect(Object.keys(s.placed).sort()).toEqual(['log_bench', 'workbench']); });
  });

  it('a bench and a lean-to begun in the same save', () => {
    const g = ready();
    workAt(g, 'log_bench', 8);
    workAt(g, 'lean_to', 10);
    freeze('log_bench-and-lean_to-begun', g, s => {
      expect(worked(s, 'log_bench')).toBeGreaterThan(0); expect(worked(s, 'lean_to')).toBeGreaterThan(0);
      expect(s.placed.log_bench).toBeDefined(); expect(raising(s, 'lean_to')).toBe(true);
    });
  });

  it('on his way to each removed thing (a pending raise), and stoking the fire with it to go back to', () => {
    for (const id of REMOVED) {
      // begun by the fire, sent off to the pool, then Carry on: on his way back
      let g = ready();
      if (id === 'log_hut') g.state.built.push('lean_to');
      workAt(g, id, 3);
      send(g, { type: 'walk', to: CAMP.start });
      runUntil(g, () => g.state.player.task.kind === 'idle' && !g.state.player.path.length, 120, 'walking to the pool');
      send(g, { type: 'build', id });
      run(g, 1);
      freeze(`pending-raise-${id}`, g, s => { expect(s.player.pending).toEqual({ kind: 'raise', id }); expect(worked(s, id)).toBeGreaterThan(0); });
      // at work at it when night falls: off to stoke the fire, then back to it
      g = ready();
      if (id === 'log_hut') g.state.built.push('lean_to');
      g.state.time = at(1, STOKE.at * 24) - 25;
      begin(g, id);
      runUntil(g, () => !!g.state.player.stoke, 60, 'stoking at nightfall');
      run(g, 0.5);
      freeze(`stoke-back-raise-${id}`, g, s => { expect(s.player.stoke?.back).toEqual({ raise: id }); expect(worked(s, id)).toBeGreaterThan(0); });
    }
    // the first press, from the pool: on his way with nothing done yet
    const g = ready();
    standAt(g.state, CAMP.start, grid(g.state));
    begin(g, 'lean_to');
    run(g, 1);
    freeze('pending-raise-lean_to-first', g, s => { expect(s.player.pending).toEqual({ kind: 'raise', id: 'lean_to' }); expect(worked(s, 'lean_to')).toBe(0); });
  });

  it('cooking: on the way to the chest for raw fish', () => {
    const g = ready('fish');
    g.state.bank[COOK.raw] = 8;
    delete g.state.bank[COOK.cooked];
    g.state.player.backpack = {};
    send(g, { type: 'cook' });
    run(g, 0.5);
    freeze('cook-fetch', g, s => { expect(s.player.cook).toEqual({ fetch: true }); expect(goingTo(s, 'chest')).toBe(true); });
  });

  it('on the way to fight a rat, by the chest for food, the chest tapped meanwhile', () => {
    const g = ready('meal'), rat = Object.keys(g.state.rats)[0]!;
    g.state.player.backpack = { stone: 2 };
    send(g, { type: 'fight', target: rat });
    expect(goingTo(g.state, 'chest')).toBe(true);
    send(g, { type: 'visit', id: 'chest' });
    run(g, 0.5);
    freeze('rats-trip-store', g, s => { expect(s.player.trip).toEqual({ fight: rat, store: true }); expect(goingTo(s, 'chest')).toBe(true); });
  });

  it('asleep at the back of the tent, and of the lean-to', () => {
    for (const shelter of ['tent', 'lean_to']) {
      const g = ready();
      if (shelter === 'lean_to') g.state.built.push('lean_to');
      g.state.time = at(1, 22);
      g.state.stokedNight = nightOf(g.state.time);           // the fire seen to tonight already
      standAt(g.state, behindTent(3.2), grid(g.state));
      send(g, { type: 'sleep' });
      runUntil(g, () => g.state.player.task.kind === 'sleep', 30, 'asleep');
      run(g, 1);
      freeze(`asleep-behind-${shelter}`, g, s => { expect(s.player.task.kind).toBe('sleep'); expect(behind(s.player.pos)).toBeGreaterThan(1.5); });
    }
  });

  it('played by the bot: the end of chapter 1, and the cooked meal in chapter 2', () => {
    const g = game(3), bot = new Bot(CAMP, g.events);
    const play = (done: () => boolean, max: number, what: string) => {
      for (let t = 0; t < max && !done(); t += STEP) { bot.tick(g.state, g.events); step(g.state, STEP, g.ctx); }
      if (!done()) throw new Error(`${VERSION}: the bot never reached ${what}`);
    };
    play(() => g.state.goalsDone.includes('chest'), 3600, 'the storage chest');
    run(g, 2);
    freeze('played-chapter1', g, s => expect(s.goalsDone).toContain('chest'));
    play(() => g.state.goalsDone.includes('meal'), 7200, 'the cooked meal');
    run(g, 2);
    freeze('played-chapter2-meal', g, s => expect(s.goalsDone).toContain('meal'));
  });

  it('lists what it wrote', () => {
    console.log(`${VERSION}: ${written.length} saves: ${written.join(', ')}`);
  });
});
