// Old saves (the camp build: docs/plans/2026-10-13-camp-build-plan.md, In 12): players have saves from 0.0.22 on, and
// every one must load without losing anything. tests/fixtures/saves/ holds real saves frozen from the release tags by
// tools/freeze_saves.mjs: each made by that version's own code (createState, its simulation played into the situation,
// serialize), <version>-<case>.json, exactly the text the game keeps in the browser. Here: every release and case the
// plan asks for is there, each is a save as its version wrote it, and each loads in today's game with nothing lost, as
// the camp build says (T12.1, T12.2): the lean-to and the log hut are the wall tent and the log cabin, the log bench and
// the workbench gone with what they took given back to the chest, and one thing at most under way. A damaged save
// never throws, and one that can't be read is kept aside (T12.3); an old sleeper behind the tent sleeps on, moved out
// of the wall tent that now stands there (T12.4); a damaged save with two things under way keeps one (T12.5).
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { campBuildSave, load, readSave, SAVE_KEY, serialize, UNREAD_KEY, type Storage } from '../src/core/save';
import { createState, currentGoal, SAVE_VERSION, type GameState } from '../src/core/state';
import { begunIds, walkGrid } from '../src/core/building';
import { EventBus } from '../src/core/events';
import { createRng, type Rng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE } from '../src/world/layout';
import { outsideOf } from '../src/world/steps';
import { STOKE } from '../src/data/fire';
import { GOALS } from '../src/data/goals';
import { LOAD } from '../src/data/building';
import { MAKES, type MakeId } from '../src/data/making';

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
const REMOVED_IDS = ['log_bench', 'workbench', 'lean_to', 'log_hut'];
const STAGED = [
  'lean_to-stage0', 'lean_to-stage1', 'lean_to-stage2', 'lean_to-built', 'log_hut-begun', 'log_hut-built',
  'log_bench-begun', 'log_bench-built', 'workbench-begun', 'workbench-built', 'bench-and-workbench-begun', 'bench-and-workbench-built',
  'log_bench-and-lean_to-begun', ...REMOVED_IDS.flatMap(id => [`pending-raise-${id}`, `stoke-back-raise-${id}`]), 'pending-raise-lean_to-first',
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

// ---- what the camp build says becomes of an old save (the plan's stage 1), written out here on its own ----

/** A saved game as plain data (any version's shape). */
type Saved = Record<string, any>;
/** Renamed: the lean-to is the wall tent, the log hut the log cabin. */
const RENAME: Record<string, MakeId> = { lean_to: 'wall_tent', log_hut: 'log_cabin' };
/** Removed, and what each took, given back to the chest: the bench 4 birch logs and 2 branches, the workbench 6 birch
 *  logs and 4 fibre. */
const GIVEN_BACK: Record<string, Record<string, number>> = { log_bench: { birch_logs: 4, branch: 2 }, workbench: { birch_logs: 6, fibre: 4 } };
/** How long the renamed ones took then: begun, the same share of the new one's time. */
const THEN: Record<string, number> = { lean_to: 90, log_hut: 180 };
/** An old id as it is now: renamed, null for one removed. */
const now = (id: string): string | null => RENAME[id] ?? (id in GIVEN_BACK ? null : id);
/** What he goes back to, as it is now: back to something removed is nothing. */
const backNow = (b: any) => b && typeof b.raise === 'string' ? (now(b.raise) === null ? null : { ...b, raise: now(b.raise) }) : b;

/** What stands, from an old save's list: renamed (a log hut stood in place of a lean-to: the wall tent too), the
 *  removed ones gone, and a chest standing with no shelter given its tent. */
function builtNow(saved: Saved): string[] {
  const out = new Set<string>();
  for (const id of saved.built as string[]) {
    if (id === 'log_hut') out.add('wall_tent');
    if (now(id)) out.add(now(id)!);
  }
  if (out.has('chest')) out.add('shelter');
  return [...out].sort();
}
/** What is under way now: renamed, as the same share of the new time; the removed ones gone. */
function underwayNow(saved: Saved): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, worked] of Object.entries((saved.underway ?? {}) as Record<string, number>)) {
    if (id in GIVEN_BACK) continue;
    out[now(id)!] = id in RENAME ? worked / THEN[id]! * MAKES[RENAME[id]!].time : worked;
  }
  return out;
}
/** What the removed ones took, given back: each once, built or begun. */
function refundOf(saved: Saved): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of new Set([...(saved.built as string[]), ...Object.keys(saved.underway ?? {})])) {
    for (const [item, n] of Object.entries(GIVEN_BACK[id] ?? {})) out[item] = (out[item] ?? 0) + n;
  }
  return out;
}
/** His task and where he was going, now: at or on his way to something renamed, the new one; something removed, nothing. */
function taskNow(saved: Saved) {
  const p = saved.player;
  let task = p.task, pending = p.pending;
  if (task.kind === 'raise') task = now(task.id) ? { ...task, id: now(task.id) } : { kind: 'idle' };
  if (pending?.kind === 'raise') {
    if (now(pending.id)) pending = { ...pending, id: now(pending.id) };
    else { pending = null; if (task.kind === 'walk') task = { kind: 'idle' }; }
  }
  return { task, pending };
}

/** Everything he owns of `item`: carried, stored, carried off to stoke the fire, and (logs) stacked in the firewood pile. */
function ownedIn(s: Saved | GameState, item: string): number {
  const p = s.player;
  return (p.backpack?.[item] ?? 0) + (s.bank?.[item] ?? 0)
    + (item === STOKE.item ? (p.stoke?.logs ?? 0) + (s.woodpile ?? 0) : 0);
}
const itemsIn = (s: Saved | GameState) => new Set([...Object.keys(s.bank ?? {}), ...Object.keys(s.player.backpack ?? {}), STOKE.item]);

/** Every number in a game is finite (no NaN or Infinity crept in). */
function badNumbers(v: unknown, path = 'state'): string[] {
  if (typeof v === 'number') return Number.isFinite(v) ? [] : [path];
  if (Array.isArray(v)) return v.flatMap((x, i) => badNumbers(x, `${path}[${i}]`));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => badNumbers(x, `${path}.${k}`));
  return [];
}

/** Plays `seconds` of the game from `state` with nothing tapped, a step at a time. Returns the longest he walked without
 *  getting anywhere (stuck), and anything wrong seen along the way. */
function play(state: GameState, seconds: number, seed = 1): { stuck: number; wrong: string[] } {
  const ctx = { layout: CAMP, rng: createRng(seed), events: new EventBus() }, wrong: string[] = [];
  let still = 0, worst = 0, last = { ...state.player.pos };
  for (let t = 0; t < seconds; t += STEP) {
    step(state, STEP, ctx);
    const p = state.player.pos, moved = Math.hypot(p.x - last.x, p.z - last.z) > 1e-6;
    still = state.player.task.kind === 'walk' && !moved ? still + STEP : 0;
    worst = Math.max(worst, still);
    last = { ...p };
    if (Math.round(t / STEP) % Math.round(30 / STEP) === 0) {
      wrong.push(...badNumbers(state).slice(0, 3));
      // (the first second after something is begun under him he is walking out of it)
      if (!walkGrid(state, CAMP).walkable(p) && state.player.task.kind !== 'walk') wrong.push(`stands on blocked ground at ${p.x.toFixed(2)},${p.z.toFixed(2)} (${state.player.task.kind}) after ${Math.round(t)} s`);
    }
  }
  return { stuck: worst, wrong };
}

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

  // T12.1, T12.2
  it.each(ALL)('%s loads in the game today with nothing lost, as the camp build has it', file => {
    const raw = rawOf(file), saved = JSON.parse(raw) as Saved, { state, savedAt } = readSave(raw, CAMP);
    expect(savedAt).toBe(saved.savedAt);
    expect(state.version).toBe(SAVE_VERSION);
    // everything he owns, item by item, and what the bench and the workbench took, given back into the chest
    const refund = refundOf(saved);
    for (const item of new Set([...itemsIn(saved), ...itemsIn(state), ...Object.keys(refund)])) {
      expect(ownedIn(state, item), item).toBe(ownedIn(saved, item) + (refund[item] ?? 0));
    }
    // XP, the goals done (never fewer, and the card never further back)
    expect(state.skills).toEqual(expect.objectContaining(saved.skills));
    expect(state.goalsDone).toEqual(expect.arrayContaining(saved.goalsDone));
    const wasAt = GOALS.findIndex(g => !(saved.goalsDone as string[]).includes(g.id));
    expect(GOALS.indexOf(currentGoal(state))).toBeGreaterThanOrEqual(wasAt < 0 ? GOALS.length - 1 : wasAt);
    // what stands and what is under way: renamed, the removed ones gone, at most one under way
    expect([...state.built].sort()).toEqual(builtNow(saved));
    const under = underwayNow(saved);
    expect(Object.keys(state.underway)).toEqual(Object.keys(under));
    for (const [id, worked] of Object.entries(under)) expect(state.underway[id as MakeId], id).toBeCloseTo(worked, 9);
    expect(Object.keys(state.underway).length).toBeLessThanOrEqual(1);
    expect(state).not.toHaveProperty('placed');
    // what he was doing, and on his way to: as it was, or the renamed one, or nothing for something removed
    const p = state.player, was = saved.player, { task, pending } = taskNow(saved);
    expect(p.task).toEqual(task);
    expect(p.pending).toEqual(pending);
    expect(p.trip).toEqual(was.trip);
    expect(p.stoke).toEqual(was.stoke ? { ...was.stoke, back: backNow(was.stoke.back) } : was.stoke);
    expect(p.cook).toEqual(was.cook);
    // where he stands: where he was, or, where something now stands (a bigger step), the nearest open ground close by;
    // always on open ground, outside everything built or begun
    const grid = walkGrid(state, CAMP);
    if (grid.walkable(was.pos)) expect(p.pos).toEqual(was.pos);
    else expect(Math.hypot(p.pos.x - was.pos.x, p.pos.z - was.pos.z)).toBeLessThanOrEqual(LOAD.nudge);
    expect(grid.walkable(p.pos)).toBe(true);
    for (const id of [...state.built, ...begunIds(state)]) expect(outsideOf(CAMP, id, p.pos), id).toBeGreaterThan(0);
    // his needs and the tools in the chest (the needs era), as saved, with backs and a kept build as they are now
    if (saved.needs) {
      const n = saved.needs, later = n.later?.type === 'build' ? (now(n.later.id) ? { type: 'build', id: now(n.later.id) } : null) : n.later;
      expect(state.needs).toEqual({
        ...n, later,
        meal: n.meal ? { ...n.meal, back: backNow(n.meal.back) } : n.meal,
        bed: n.bed ? { ...n.bed, back: backNow(n.bed.back) } : n.bed,
      });
      expect(state.toolsInChest).toEqual(saved.toolsInChest);
    }
    // nothing anywhere still names what was removed or renamed
    expect(JSON.stringify(state)).not.toMatch(/log_bench|workbench|lean_to|log_hut/);
    // saved again and read back: the same, with nothing given back twice
    expect(readSave(serialize(state, savedAt ?? undefined), CAMP).state).toEqual(state);
  });

  // T12.2: 10 minutes of play from each
  it.each(ALL)('%s plays on for 10 minutes: nothing thrown, no NaN, never stuck', file => {
    const { state } = readSave(rawOf(file), CAMP);
    const { stuck, wrong } = play(state, 600);
    expect(wrong).toEqual([]);
    expect(stuck).toBeLessThan(5);
  });
});

describe('the camp build\'s migration (format 11 to 12)', () => {
  it('a chest standing with no shelter (a hand-edited save) gets the tent it now stands in', () => {
    const s = createState(CAMP);
    const raw = { ...JSON.parse(serialize(s)), version: 11, built: ['campfire', 'chest'] };
    expect(readSave(JSON.stringify(raw), CAMP).state.built.sort()).toEqual(['campfire', 'chest', 'shelter']);
  });

  it('never throws, whatever the parts are: missing, of the wrong sort, or not there at all', () => {
    for (const v of [null, 5, 'x', [], {}, { built: 'x', underway: 5, player: null, needs: 'x', thoughts: { known: 'x' } },
      { built: [7, null, 'log_hut', 'log_bench'], underway: { lean_to: 'x', log_bench: null }, bank: { birch_logs: 'x' }, player: { task: 5, pending: 'x', stoke: { back: { raise: 7 } } }, needs: { meal: 1, bed: { back: { raise: 'workbench' } }, later: { type: 'build', id: 5 } } }]) {
      expect(() => campBuildSave(v)).not.toThrow();
    }
    // a bench in a damaged bank: given back all the same
    const out = campBuildSave({ built: ['log_bench'], bank: { birch_logs: 'x', branch: 3 } });
    expect(out.bank).toEqual({ birch_logs: 4, branch: 5 });
    expect(out.built).toEqual([]);
  });
});

describe('damaged and unreadable saves (T12.3)', () => {
  /** Every path into a saved game (its keys, its keys' keys, ...), but its version, which says what it is. */
  function paths(v: unknown, at: string[] = [], depth = 0): string[][] {
    if (!v || typeof v !== 'object' || depth > 4) return [];
    return Object.keys(v).flatMap(k => {
      const p = [...at, k];
      if (p.length === 1 && k === 'version') return [];
      return [p, ...paths((v as Record<string, unknown>)[k], p, depth + 1)];
    });
  }
  const JUNK: unknown[] = [null, 'x', -1, 0, 1e9, true, [], {}, { x: 1 }, [null], [{ x: 'a', z: 2 }]];
  /** A copy of `saved` with a few of its parts garbled or deleted, at random. */
  function garble(saved: Saved, rng: Rng): Saved {
    const out = JSON.parse(JSON.stringify(saved)) as Saved, all = paths(out);
    for (let k = 1 + Math.floor(rng.next() * 4); k > 0; k--) {
      const path = all[Math.floor(rng.next() * all.length)]!;
      let o: any = out;
      for (const key of path.slice(0, -1)) { o = o?.[key]; if (!o || typeof o !== 'object') break; }
      if (!o || typeof o !== 'object') continue;
      const last = path.at(-1)!, r = rng.next();
      if (r < 0.25) delete o[last]; else o[last] = JUNK[Math.floor(rng.next() * JUNK.length)];
    }
    return out;
  }

  it('every frozen save, with parts garbled or deleted at random, still loads and plays on: nothing thrown, no NaN', () => {
    const rng = createRng(20261013), failed: string[] = [];
    for (const file of ALL) for (let n = 0; n < 6; n++) {
      const bad = JSON.stringify(garble(JSON.parse(rawOf(file)), rng));
      try {
        const { state } = readSave(bad, CAMP);
        const nan = badNumbers(state);
        if (nan.length) { failed.push(`${file} #${n}: ${nan.slice(0, 3).join(', ')} on loading`); continue; }
        const { wrong } = play(state, 5, n);
        if (wrong.length) failed.push(`${file} #${n}: ${wrong[0]}`);
      } catch (e) { failed.push(`${file} #${n}: ${(e as Error).message}\n${bad.slice(0, 400)}`); }
    }
    expect(failed).toEqual([]);
  });

  it('a save of the right version with every part broken loads as a new game would have it, where he starts', () => {
    const broken = { version: SAVE_VERSION, time: 'x', seed: 'y', player: 'z', bank: 5, built: 5, underway: 5, needs: 5, thoughts: 5, nodes: 5, rats: 5, goblins: 5 };
    const { state } = readSave(JSON.stringify(broken), CAMP);
    expect(state.player.pos).toEqual(CAMP.start);
    expect(state.player.task).toEqual({ kind: 'idle' });
    expect(badNumbers(state)).toEqual([]);
    expect(() => play(state, 5)).not.toThrow();
  });

  it('a save that can\'t be read is kept under its own key before a new game writes over it; only the first such', () => {
    const data = new Map<string, string>();
    const store: Storage = { get: k => data.get(k) ?? null, set: (k, v) => { data.set(k, v); } };
    // none at all, or one erased by Start over: nothing kept aside
    expect(load(store, CAMP)).toBeNull();
    data.set(SAVE_KEY, '');
    expect(load(store, CAMP)).toBeNull();
    expect(data.has(UNREAD_KEY)).toBe(false);
    // one that can't be read: kept aside as it was
    data.set(SAVE_KEY, '{"version": 12, "player": {broken');
    expect(load(store, CAMP)).toBeNull();
    expect(data.get(UNREAD_KEY)).toBe('{"version": 12, "player": {broken');
    // another later doesn't write over it, nor does one from a newer game, nor a good one
    data.set(SAVE_KEY, 'not even json');
    expect(load(store, CAMP)).toBeNull();
    data.set(SAVE_KEY, JSON.stringify({ ...createState(CAMP), version: SAVE_VERSION + 1 }));
    expect(load(store, CAMP)).toBeNull();
    data.set(SAVE_KEY, serialize(createState(CAMP), Date.now()));
    expect(load(store, CAMP)).not.toBeNull();
    expect(data.get(UNREAD_KEY)).toBe('{"version": 12, "player": {broken');
    // and where storage is blocked, it still just starts a new game
    const blocked: Storage = { get: () => { throw new Error('blocked'); }, set: () => { throw new Error('blocked'); } };
    expect(load(blocked, CAMP)).toBeNull();
  });

  it('a village save reads back as before (the camp build changes nothing there)', () => {
    const s = createState(VILLAGE, 2);
    s.bank = { birch_logs: 40 };
    expect(readSave(serialize(s), VILLAGE).state).toEqual(s);
  });
});

describe('an old sleeper behind the tent (T12.4)', () => {
  it.each(['0.0.27', '0.0.29', '0.0.30'])('%s asleep behind the lean-to: still asleep, moved out of the wall tent now standing there, his bed kept', v => {
    const raw = rawOf(`${v}-asleep-behind-lean_to.json`), saved = JSON.parse(raw) as Saved, { state } = readSave(raw, CAMP);
    expect(state.built).toContain('wall_tent');
    expect(state.player.task).toEqual({ kind: 'sleep' });
    // he lay inside where the wall tent now stands: out to the nearest open ground, beside it, not back at the river
    expect(outsideOf(CAMP, 'wall_tent', saved.player.pos)).toBeLessThan(0);
    expect(state.player.pos).not.toEqual(saved.player.pos);
    expect(Math.hypot(state.player.pos.x - saved.player.pos.x, state.player.pos.z - saved.player.pos.z)).toBeLessThanOrEqual(LOAD.nudge);
    expect(walkGrid(state, CAMP).walkable(state.player.pos)).toBe(true);
    expect(state.needs.bed).not.toBeNull();
    if (saved.needs) expect(state.needs.bed).toEqual(saved.needs.bed);
    // and he wakes as he would have
    const ctx = { layout: CAMP, rng: createRng(1), events: new EventBus() };
    let awake = false; ctx.events.on(e => { if (e.type === 'awake') awake = true; });
    for (let t = 0; t < 600 && !awake; t += STEP) step(state, STEP, ctx);
    expect(awake).toBe(true);
  });

  it('asleep behind the tent alone (no upgrade): exactly where he was', () => {
    for (const v of ['0.0.27', '0.0.29', '0.0.30']) {
      const raw = rawOf(`${v}-asleep-behind-tent.json`), saved = JSON.parse(raw) as Saved, { state } = readSave(raw, CAMP);
      expect(state.player.task, v).toEqual({ kind: 'sleep' });
      expect(state.player.pos, v).toEqual(saved.player.pos);
    }
  });
});

describe('a damaged save with two things under way (T12.5)', () => {
  it('keeps the one he was at, gives back what the other took; with him at neither, keeps the furthest along', () => {
    const { state } = readSave(rawOf('0.0.30-lean_to-stage1.json'), CAMP);
    expect(state.player.task).toEqual({ kind: 'raise', id: 'wall_tent' });
    const raw = JSON.parse(serialize(state));
    raw.underway.stone_hearth = 80;                                  // further along, but he is at the wall tent
    const back = readSave(JSON.stringify(raw), CAMP).state;
    expect(back.underway).toEqual({ wall_tent: state.underway.wall_tent });
    for (const [item, n] of Object.entries(MAKES.stone_hearth.needs)) expect(back.bank[item], item).toBe((state.bank[item] ?? 0) + n);
    // him idle: the furthest along stays (the hearth's 80 of 90 s), the wall tent's needs given back
    raw.player.task = { kind: 'idle' };
    const idle = readSave(JSON.stringify(raw), CAMP).state;
    expect(idle.underway).toEqual({ stone_hearth: 80 });
    for (const [item, n] of Object.entries(MAKES.wall_tent.needs)) expect(idle.bank[item], item).toBe((state.bank[item] ?? 0) + n);
    // read back again: nothing given back twice
    expect(readSave(serialize(idle), CAMP).state).toEqual(idle);
  });
});
