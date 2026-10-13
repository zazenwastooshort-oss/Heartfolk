// Freezing old saves: the needs era (camp 0.0.30, save format 11 with his needs and the tools kept in the chest), on top
// of era11.ts. Run by tools/freeze_saves.mjs inside a worktree of the tag, as tests/freeze_needs.test.ts. The cases
// (docs/plans/2026-10-13-camp-build-plan.md stage 0): tools kept in the chest (chopping with the axe taken out, and on
// his way to the chest to fetch it); a meal trip with the lean-to to go back to (needs.meal.back raise); bed with the
// lean-to to go back to (needs.bed.back raise), on his way and asleep; taps kept while he sleeps (needs.later) for a
// placed log bench and for the campfire; asleep in a lean-to.
import { describe, expect, it } from 'vitest';
import { XP_TABLE } from '../src/data/xp';
import { HUNGER } from '../src/data/needs';
import { nightOf } from '../src/core/clock';
import { fitOf, placeStart, walkGrid } from '../src/core/building';
import type { GameState } from '../src/core/state';
import type { MakeId } from '../src/data/making';
import type { Vec2 } from '../src/world/layout';
import {
  CAMP, ON, VERSION, at, behindTent, fillChest, freeze, game, progressTo, run, runUntil, send, standAt, written, type Game,
} from './freeze_common';

const grid = (s: GameState) => walkGrid(s, CAMP);
const goingTo = (s: GameState, id: string) => s.player.pending?.kind === 'visit' && s.player.pending.id === id;
const MATERIALS = { birch_logs: 80, bark: 20, fibre: 20, clay: 20, branch: 20, stone: 20 };

/** As era11.ts: a camp with every goal up to `last` done, a full chest, Carpentry 3, the morning of day 1, by the fire. */
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

/** Asleep in the shelter at 22:00 (sent early by a tap on it), the fire seen to tonight already. */
function asleep(g: Game): void {
  g.state.time = at(1, 22);
  g.state.stokedNight = nightOf(g.state.time);
  send(g, { type: 'sleep' });
  runUntil(g, () => g.state.player.task.kind === 'sleep', 30, 'asleep');
  run(g, 1);
}

function placeFor(g: Game, id: MakeId): Vec2 {
  const p = g.state.player.pos;
  for (const cam of [{ x: p.x, z: p.z + 10 }, { x: p.x + 10, z: p.z }, { x: p.x, z: p.z - 10 }, { x: p.x - 10, z: p.z }]) {
    const spot = placeStart(g.state, CAMP, id, cam);
    if (!fitOf(g.state, CAMP, id, spot, 0)) return spot;
  }
  throw new Error(`${VERSION}: nowhere to place ${id}`);
}

describe.skipIf(!ON)(`freeze ${VERSION} (the needs era)`, () => {
  it('tools kept in the chest: chopping with the axe taken out, and on his way to fetch it', () => {
    let g = ready();
    send(g, { type: 'visit', id: 'chest' });
    runUntil(g, () => g.state.toolsInChest.length > 0, 60, 'tools put in the chest');
    send(g, { type: 'work', nodeId: 'camp_birch2' });     // beside the chest: he takes the axe out at once
    runUntil(g, () => g.state.player.task.kind === 'gather', 120, 'chopping');
    run(g, 1);
    freeze('tools-in-chest', g, s => { expect(s.toolsInChest).toEqual(['pick']); expect(s.player.task.kind).toBe('gather'); });
    g = ready();
    send(g, { type: 'visit', id: 'chest' });
    runUntil(g, () => g.state.toolsInChest.length > 0, 60, 'tools put in the chest');
    send(g, { type: 'walk', to: CAMP.start });
    runUntil(g, () => g.state.player.task.kind === 'idle' && !g.state.player.path.length, 120, 'walking to the pool');
    send(g, { type: 'work', nodeId: 'camp_birch2' });
    run(g, 1);
    freeze('tool-fetch-trip', g, s => {
      expect(s.toolsInChest).toEqual(['axe', 'pick']);
      expect(s.player.trip).toEqual({ nodeId: 'camp_birch2', tool: true }); expect(goingTo(s, 'chest')).toBe(true);
    });
  });

  it('a meal trip with the lean-to to go back to', () => {
    const g = ready('meal');                                  // hungry from the Berries goal on
    g.state.player.backpack = {};
    g.state.needs.fullness = HUNGER.hungry + 0.005;
    // he works at the back of the tent (the side he comes from), so the walk round to the chest takes a moment
    standAt(g.state, behindTent(3.2), grid(g.state));
    send(g, { type: 'build', id: 'lean_to' });
    runUntil(g, () => !!g.state.needs.meal, 120, 'a meal trip');
    run(g, 0.2);
    freeze('meal-back-raise', g, s => { expect(s.needs.meal).toEqual({ back: { raise: 'lean_to' } }); expect(goingTo(s, 'chest')).toBe(true); });
  });

  it('bedtime with something under way to go back to: on his way to bed, and asleep', () => {
    // the lean-to: he works beside the tent, so bed is a step away (saved the moment he sets off), then asleep
    let g = ready();
    g.state.time = at(2, g.state.needs.bedtime) - 30;      // an in-game hour before his bedtime (01:00)
    g.state.stokedNight = nightOf(g.state.time);
    send(g, { type: 'build', id: 'lean_to' });
    runUntil(g, () => !!g.state.needs.bed, 90, 'bedtime');
    freeze('bed-back-raise-lean_to-going', g, s => { expect(s.needs.bed?.back).toEqual({ raise: 'lean_to' }); expect(goingTo(s, 'shelter')).toBe(true); });
    runUntil(g, () => g.state.player.task.kind === 'sleep', 30, 'asleep');
    run(g, 1);
    freeze('bed-back-raise-lean_to-asleep', g, s => { expect(s.needs.bed?.back).toEqual({ raise: 'lean_to' }); expect(s.player.task.kind).toBe('sleep'); });
    // a log bench placed by the fire: on his way across the camp to bed
    g = ready();
    g.state.time = at(2, g.state.needs.bedtime) - 25;
    g.state.stokedNight = nightOf(g.state.time);
    send(g, { type: 'build', id: 'log_bench', at: placeFor(g, 'log_bench'), turn: 0 });
    runUntil(g, () => !!g.state.needs.bed, 90, 'bedtime');
    run(g, 0.3);
    freeze('bed-back-raise-log_bench-going', g, s => { expect(s.needs.bed?.back).toEqual({ raise: 'log_bench' }); expect(goingTo(s, 'shelter')).toBe(true); expect(s.placed.log_bench).toBeDefined(); });
  });

  it('taps kept while he sleeps: a placed log bench, and the campfire', () => {
    let g = ready();
    asleep(g);
    const spot = placeFor(g, 'log_bench');
    send(g, { type: 'build', id: 'log_bench', at: spot, turn: 1 });
    run(g, 0.5);
    freeze('later-build-log_bench', g, s => { expect(s.needs.later).toEqual({ type: 'build', id: 'log_bench', at: spot, turn: 1 }); expect(s.player.task.kind).toBe('sleep'); });
    g = ready();
    asleep(g);
    send(g, { type: 'make', id: 'campfire' });
    run(g, 0.5);
    freeze('later-make-campfire', g, s => { expect(s.needs.later).toEqual({ type: 'make', id: 'campfire' }); expect(s.player.task.kind).toBe('sleep'); });
  });

  it('asleep in a lean-to', () => {
    const g = ready();
    g.state.built.push('lean_to');
    asleep(g);
    freeze('asleep-in-lean_to', g, s => { expect(s.built).toContain('lean_to'); expect(s.player.task.kind).toBe('sleep'); expect(s.needs.bed?.until).toBeGreaterThan(s.time); });
  });

  it('lists what it wrote', () => {
    console.log(`${VERSION} (needs): ${written.length} saves: ${written.join(', ')}`);
  });
});
