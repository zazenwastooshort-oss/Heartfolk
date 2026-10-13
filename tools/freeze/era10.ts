// Freezing old saves: save format 10 (camp 0.0.22 and 0.0.24, chapter 2's first parts; no building in stages, no
// needs, no tools in the chest). Run by tools/freeze_saves.mjs inside a worktree of the tag, as tests/freeze.test.ts.
// The cases (what the camp build's save migration must carry over, docs/plans/2026-10-13-camp-build-plan.md stage 0):
// each set of base buildings play can leave standing (in goal order), the later ones with a chest full of things; a
// stoke from the chest, on the way there and carrying its logs back; a trip to the chest with a full backpack, and a tap
// on it; a cooking fetch from the chest; and (0.0.24, with the rats) a trip for food to fight with, stored on the way.
import { describe, expect, it } from 'vitest';
import { STOKE } from '../src/data/fire';
import { COOK } from '../src/data/cooking';
import { BACKPACK_SLOTS } from '../src/data/hauling';
import { navFor } from '../src/world/nav';
import type { GameState } from '../src/core/state';
import {
  CAMP, ON, VERSION, at, fillChest, freeze, game, progressTo, run, runUntil, send, standAt, wreckCarried, written, type Game,
} from './freeze_common';

const grid = (s: GameState) => navFor(CAMP, s.built);
const goingTo = (s: GameState, id: string) => s.player.pending?.kind === 'visit' && s.player.pending.id === id;

/** A camp with every goal up to `last` done, in the morning of day 1, him by the fire. */
function camp(last: string | null, seed = 7): Game {
  const g = game(seed);
  progressTo(g.state, last);
  g.state.time = at(1, 9);
  const fire = CAMP.hearth.pos;
  standAt(g.state, { x: fire.x + 2.2, z: fire.z + 1.2 }, grid(g.state));
  return g;
}

describe.skipIf(!ON)(`freeze ${VERSION} (format 10)`, () => {
  it('each set of base buildings', () => {
    // nothing built yet: the wreck salvaged, its things on his back
    let g = camp('salvage'); wreckCarried(g.state); run(g, 1);
    freeze('built-none', g, s => { expect(s.built).toEqual([]); expect(s.goalsDone).toEqual(['salvage']); });
    g = camp('campfire'); g.state.player.backpack = { plank: 4, tarp: 1, stone: 2 }; run(g, 1);
    freeze('built-campfire', g, s => expect(s.built).toEqual(['campfire']));
    g = camp('firewood'); g.state.player.backpack = { plank: 4, tarp: 1, birch_logs: 6 }; run(g, 1);
    freeze('built-campfire-woodpile', g, s => { expect(s.built).toEqual(['campfire', 'woodpile']); expect(s.woodpile).toBe(10); });
    g = camp('shelter'); g.state.player.backpack = { birch_logs: 4, copper_ore: 1, stone: 3 }; run(g, 1);
    freeze('built-to-shelter', g, s => expect(s.built).toEqual(['campfire', 'woodpile', 'shelter']));
    g = camp('chest'); fillChest(g.state); g.state.player.backpack = { birch_logs: 5, branch: 2 }; run(g, 1);
    freeze('built-to-chest', g, s => { expect(s.built).toEqual(['campfire', 'woodpile', 'shelter', 'chest']); expect(Object.keys(s.bank).length).toBeGreaterThanOrEqual(8); });
    g = camp('dummy'); fillChest(g.state); g.state.player.backpack = { stone: 2 }; run(g, 1);
    freeze('built-all', g, s => { expect(s.built).toEqual(['campfire', 'woodpile', 'shelter', 'chest', 'dummy']); expect(Object.keys(s.bank).length).toBeGreaterThanOrEqual(8); });
  });

  it('a stoke from the chest: on the way there, then carrying the logs to the fire', () => {
    const g = camp('dummy');
    fillChest(g.state, { [STOKE.item]: 20 });
    g.state.woodpile = 0;                                   // the pile is empty, so he takes the chest's logs
    g.state.time = at(1, STOKE.at * 24) - 10;
    send(g, { type: 'work', nodeId: 'camp_birch2' });
    runUntil(g, () => !!g.state.player.stoke && goingTo(g.state, 'chest'), 60, 'stoking from the chest');
    run(g, 0.5);
    freeze('stoke-from-chest', g, s => { expect(s.player.stoke).toMatchObject({ from: 'chest', logs: 0 }); expect(goingTo(s, 'chest')).toBe(true); });
    runUntil(g, () => (g.state.player.stoke?.logs ?? 0) > 0, 60, 'logs taken from the chest');
    run(g, 0.5);
    freeze('stoke-carrying-logs', g, s => { expect(s.player.stoke).toMatchObject({ from: 'chest', logs: STOKE.logs }); expect(goingTo(s, 'campfire')).toBe(true); });
  });

  it('a trip to the chest with a full backpack, and a tap on the chest', () => {
    let g = camp('dummy');
    fillChest(g.state);
    g.state.player.backpack = { birch_logs: BACKPACK_SLOTS - 1 };
    send(g, { type: 'work', nodeId: 'camp_birch2' });
    runUntil(g, () => !!g.state.player.trip && goingTo(g.state, 'chest'), 300, 'a trip to the chest');
    run(g, 0.5);
    freeze('chest-trip', g, s => { expect(s.player.trip).toMatchObject({ nodeId: expect.stringMatching(/^camp_birch/) }); expect(goingTo(s, 'chest')).toBe(true); });
    g = camp('dummy');
    fillChest(g.state);
    g.state.player.backpack = { stone: 3, branch: 2, birch_logs: 4 };
    send(g, { type: 'visit', id: 'chest' });
    run(g, 0.5);
    freeze('chest-tapped', g, s => { expect(goingTo(s, 'chest')).toBe(true); expect(s.player.trip).toBeNull(); });
  });

  it('cooking: on the way to the chest for raw fish', () => {
    const g = camp('fish');
    fillChest(g.state, { [COOK.raw]: 8 });
    delete g.state.bank[COOK.cooked];
    g.state.player.backpack = {};
    send(g, { type: 'cook' });
    run(g, 0.5);
    freeze('cook-fetch', g, s => { expect(s.player.cook).toEqual({ fetch: true }); expect(goingTo(s, 'chest')).toBe(true); });
  });

  it('(with the rats) on the way to fight, by the chest for food, the chest tapped meanwhile', () => {
    const g = camp('meal');
    const rats = Object.keys((g.state as GameState & { rats?: Record<string, unknown> }).rats ?? {});
    if (!rats.length) return;                                 // 0.0.22 has no rats yet
    fillChest(g.state);
    g.state.player.backpack = { stone: 2 };
    send(g, { type: 'fight', target: rats[0]! });
    expect(goingTo(g.state, 'chest')).toBe(true);
    send(g, { type: 'visit', id: 'chest' });
    run(g, 0.5);
    freeze('rats-trip-store', g, s => { expect(s.player.trip).toEqual({ fight: rats[0], store: true }); expect(goingTo(s, 'chest')).toBe(true); });
  });

  it('lists what it wrote', () => {
    console.log(`${VERSION}: ${written.length} saves: ${written.join(', ')}`);
  });
});
