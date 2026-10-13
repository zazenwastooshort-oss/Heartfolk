// Old saves (the camp build: docs/plans/2026-10-13-camp-build-plan.md, In 12): players have saves from 0.0.22 on, and
// every one must load without losing anything. tests/fixtures/saves/ holds real saves frozen from the release tags by
// tools/freeze_saves.mjs: each made by that version's own code (createState, its simulation played into the situation,
// serialize), <version>-<case>.json, exactly the text the game keeps in the browser. Here: every release and case the
// plan asks for is there, each is a save as its version wrote it, and each loads in today's game with nothing lost.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { readSave } from '../src/core/save';
import { SAVE_VERSION, type GameState } from '../src/core/state';
import { walkGrid } from '../src/core/building';
import { CAMP } from '../src/world/camp';
import { STOKE } from '../src/data/fire';

const DIR = new URL('./fixtures/saves/', import.meta.url);
const FILES = readdirSync(DIR).filter(f => f.endsWith('.json')).sort();
const rawOf = (file: string) => readFileSync(new URL(file, DIR), 'utf8');

// ---- the cases, by release (the plan's stage 0, and a few beside them) ----

/** Format 10 (0.0.22, 0.0.24): each set of base buildings play can leave standing, the later ones with a full chest;
 *  errands at the chest (a stoke from it, going and carrying the logs; a trip with a full backpack; a tap on it; a
 *  cooking fetch). */
const BASE = ['built-none', 'built-campfire', 'built-campfire-woodpile', 'built-to-shelter', 'built-to-chest', 'built-all'];
const AT_CHEST = ['stoke-from-chest', 'stoke-carrying-logs', 'chest-trip', 'chest-tapped', 'cook-fetch'];
/** Format 11 (0.0.27, 0.0.29, 0.0.30): what the camp build removes or turns into the wall tent and the log cabin, begun
 *  (at work at it), built, on his way to it, and waiting while he stokes the fire; errands at the chest; asleep behind
 *  the tent; and two saves the playthrough bot played to. */
const REMOVED = ['log_bench', 'workbench', 'lean_to', 'log_hut'];
const STAGED = [
  'lean_to-stage0', 'lean_to-stage1', 'lean_to-stage2', 'lean_to-built', 'log_hut-begun', 'log_hut-built',
  'log_bench-begun', 'log_bench-built', 'workbench-begun', 'workbench-built', 'bench-and-workbench-begun', 'bench-and-workbench-built',
  'log_bench-and-lean_to-begun', ...REMOVED.flatMap(id => [`pending-raise-${id}`, `stoke-back-raise-${id}`]), 'pending-raise-lean_to-first',
  'cook-fetch', 'rats-trip-store', 'asleep-behind-tent', 'asleep-behind-lean_to', 'played-chapter1', 'played-chapter2-meal',
];
/** The needs era (0.0.30): tools kept in the chest; a meal, bed and taps kept while he sleeps, with things under way. */
const NEEDS = [
  'tools-in-chest', 'tool-fetch-trip', 'meal-back-raise', 'bed-back-raise-lean_to-going', 'bed-back-raise-lean_to-asleep',
  'bed-back-raise-log_bench-going', 'later-build-log_bench', 'later-make-campfire', 'asleep-in-lean_to',
];
const CASES: Record<string, { format: number; cases: string[] }> = {
  '0.0.22': { format: 10, cases: [...BASE, ...AT_CHEST] },
  '0.0.24': { format: 10, cases: [...BASE, ...AT_CHEST, 'rats-trip-store'] },
  '0.0.27': { format: 11, cases: STAGED },
  '0.0.29': { format: 11, cases: STAGED },
  '0.0.30': { format: 11, cases: [...STAGED, ...NEEDS] },
};
const ALL = Object.entries(CASES).flatMap(([v, { cases }]) => cases.map(c => `${v}-${c}.json`)).sort();

/** A saved game as plain data (any version's shape). */
type Saved = Record<string, any>;
/** Everything he owns of `item`: carried, stored, carried off to stoke the fire, and (logs) stacked in the firewood pile. */
function ownedIn(s: Saved | GameState, item: string): number {
  const p = s.player;
  return (p.backpack?.[item] ?? 0) + (s.bank?.[item] ?? 0)
    + (item === STOKE.item ? (p.stoke?.logs ?? 0) + (s.woodpile ?? 0) : 0);
}
const itemsIn = (s: Saved | GameState) => new Set([...Object.keys(s.bank ?? {}), ...Object.keys(s.player.backpack ?? {}), STOKE.item]);

describe('old saves, frozen from the releases', () => {
  it('every release and case the plan asks for is there, and nothing else', () => {
    expect(FILES).toEqual(ALL);
  });

  it.each(ALL)('%s is a save as its version wrote it: its format, and the time it was played up to', file => {
    const data = JSON.parse(rawOf(file)) as Saved, version = file.slice(0, file.indexOf('-'));
    expect(data.version).toBe(CASES[version]!.format);
    expect(data.version).toBeLessThanOrEqual(SAVE_VERSION);
    expect(Number.isFinite(data.savedAt) && data.savedAt > Date.UTC(2026, 9, 11)).toBe(true);
    expect(data.player && data.bank && Array.isArray(data.built)).toBeTruthy();
  });

  it.each(ALL)('%s loads in the game today with nothing lost', file => {
    const raw = rawOf(file), saved = JSON.parse(raw) as Saved, { state, savedAt } = readSave(raw, CAMP);
    expect(savedAt).toBe(saved.savedAt);
    expect(state.version).toBe(SAVE_VERSION);
    // everything he owns, item by item
    for (const item of new Set([...itemsIn(saved), ...itemsIn(state)])) expect(ownedIn(state, item), item).toBe(ownedIn(saved, item));
    // what stands, what is under way and where he placed things
    expect(state.built).toEqual(expect.arrayContaining(saved.built));
    expect(state.underway).toEqual(saved.underway ?? {});
    expect(state.placed).toEqual(saved.placed ?? {});
    // what he was doing, where, and on his way to
    const p = state.player, was = saved.player;
    expect(p.task).toEqual(was.task);
    expect(p.pending).toEqual(was.pending);
    expect(p.pos).toEqual(was.pos);
    expect(walkGrid(state, CAMP).walkable(p.pos)).toBe(true);
    expect(p.trip).toEqual(was.trip);
    expect(p.stoke).toEqual(was.stoke);
    expect(p.cook).toEqual(was.cook);
    // his needs and the tools in the chest (the needs era), as saved
    if (saved.needs) {
      expect(state.needs).toEqual(saved.needs);
      expect(state.toolsInChest).toEqual(saved.toolsInChest);
    }
    expect(state.goalsDone).toEqual(saved.goalsDone);
    expect(state.skills).toEqual(expect.objectContaining(saved.skills));
  });
});
