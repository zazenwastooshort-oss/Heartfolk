// Building it yourself (data/building.ts), the parts everyone reads: the simulation, the save and the Build list. What
// is built in stages and how far along each is, and how quickly he works at it by his Carpentry level; the walking grid
// with everything he has built and begun at the camp's spots, each step by its own shape (world/steps.ts); which step
// of a spot is drawn there, which shelter stands and how well he rests in it; what can be built now (the camp's first
// five from their goals on, with the marker showing where while nothing of it is begun; the upgrades once the chest
// stands), what the Build list has and what each still needs, and why one can't be pressed now; and what is under
// way, read back from a save. Headless; changes nothing (systems/building.ts does the work).
import { allGoalsDone, currentGoal, goalFirst, goalPaid, owned, type GameState } from './state';
import type { Layout } from '../world/layout';
import { navFor, type NavGrid } from '../world/nav';
import { stepPlace } from '../world/steps';
import { MAKES, makeDef, type MakeDef, type MakeId } from '../data/making';
import { CARPENTRY, LINES, SHELTERS, STAGED, UPGRADES_AFTER, type LineId, type StagedDef } from '../data/building';
import { SLEEP } from '../data/sleep';
import { GOALS } from '../data/goals';
import { levelFor } from '../data/xp';

/** Everything built in stages, in the Build list's order. */
export const STAGED_IDS = Object.keys(STAGED) as MakeId[];

/** The stages row for `id`, or null for something not built in stages. */
export const stagedDef = (id: string): StagedDef | null => Object.hasOwn(STAGED, id) ? STAGED[id as MakeId]! : null;

/** What he has begun and not finished (GameState.underway), by id. */
export const begunIds = (state: GameState): MakeId[] => (Object.keys(state.underway) as MakeId[]).filter(id => state.underway[id] !== undefined);

/** The walking grid with everything he has built and begun (each in the way from its footings on). Every walk of his
 *  goes by it (a test flags any other use of navFor). */
export const walkGrid = (state: GameState, layout: Layout): NavGrid => navFor(layout, state.built, begunIds(state));

/** How far along something built in stages is, 0..1: 1 once built, 0 before it is begun. */
export function progressOf(state: GameState, id: MakeId): number {
  if (state.built.includes(id)) return 1;
  const worked = state.underway[id];
  return worked === undefined ? 0 : Math.min(1, worked / MAKES[id].time);
}

/** The stage it has reached (STAGE_NAMES): -1 before it is begun, 0 (footings) to CARPENTRY.stages - 1 while he works at
 *  it, CARPENTRY.stages once built. */
export function stageOf(state: GameState, id: MakeId): number {
  if (state.built.includes(id)) return CARPENTRY.stages;
  if (state.underway[id] === undefined) return -1;
  return Math.min(CARPENTRY.stages - 1, Math.floor(progressOf(state, id) * CARPENTRY.stages));
}

/** The stage reached after `worked` seconds at `id` (for systems/building.ts, to tell a stage going up). */
export const stageAt = (id: MakeId, worked: number) => Math.min(CARPENTRY.stages - 1, Math.floor(worked / MAKES[id].time * CARPENTRY.stages));

/** How much quicker than its time he builds (D5): CARPENTRY.speed more for each Carpentry level above 1 (1 at level 1).
 *  The work, its knocks and its XP stay the same; only the time goes down. */
export const buildSpeed = (state: GameState) => 1 + (levelFor(state.skills.carpentry ?? 0) - 1) * CARPENTRY.speed;

/** The seconds of work `id` takes him from here at his Carpentry level now: all of it before it is begun, what is
 *  left once begun, none once built (the Build list shows it). */
export function buildTime(state: GameState, id: MakeId): number {
  if (state.built.includes(id)) return 0;
  return Math.max(0, MAKES[id].time - (state.underway[id] ?? 0)) / buildSpeed(state);
}

/** The spot (LINES) where `id` is built, or null for something built at none. */
export const lineOf = (id: string): LineId | null => (Object.keys(LINES) as LineId[]).find(l => LINES[l].includes(id as MakeId)) ?? null;

/** The step drawn at a spot (D6): the last of its line built, or begun and half built (CARPENTRY.shown); until a new
 *  step is that far along, the one before it still stands inside its stakes and frame. Null while nothing there is. */
export function stepShown(state: GameState, line: LineId): MakeId | null {
  return [...LINES[line]].reverse().find(id => state.built.includes(id) || stageOf(state, id) >= CARPENTRY.shown) ?? null;
}

/** The last step of a spot's line that is built: what stands there to be used (the campfire until the stone hearth is
 *  built, D6), and what it is called. Null while nothing there is built. */
export function builtStep(state: GameState, line: LineId): MakeId | null {
  return [...LINES[line]].reverse().find(id => state.built.includes(id)) ?? null;
}

/** The best shelter that stands (the tent, the wall tent, the log cabin), or null. It is the one he sleeps in: a new one
 *  is slept in only once it is built. */
export function bestShelter(state: GameState): MakeId | null {
  return [...SHELTERS].reverse().find(id => state.built.includes(id)) ?? null;
}

/** How much more often gathering yields while he is well rested: more for a better shelter (data/building.ts): the tent
 *  SLEEP.bonus, the wall tent and the log cabin their own `rest`. */
export function restBonus(state: GameState): number {
  const best = bestShelter(state);
  return (best && stagedDef(best)?.rest) || SLEEP.bonus;
}

/** How many of `item` he has for building `def`: what he has, carried or stored, less what the current goal counts
 *  (spare), except for the thing the goal itself makes (T2.7), which the goal's own count is for. */
export function haveFor(state: GameState, def: MakeDef, item: string): number {
  const own = !allGoalsDone(state) && currentGoal(state).makes === def.id;
  return own ? owned(state, item) : spare(state, item);
}

/** What he still lacks to begin `def`: item id to how many more (empty when he has it all, carried or stored). What the
 *  current goal counts is left alone (spare), except for the thing the goal itself makes, which its own count is for. */
export function lacking(state: GameState, def: MakeDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(def.needs)) { const have = haveFor(state, def, id); if (have < n) out[id] = n - have; }
  return out;
}

/** How many of `item` the camp's current goal counts (what it asks for, or what the thing it makes needs): building
 *  leaves those alone, so the goal's count never goes backwards (13 Oct 2026). None once the camp is set up, and none
 *  once the goal is paid for (the thing it makes begun, what it needed taken then: goalPaid). */
export function forGoal(state: GameState, item: string): number {
  if (allGoalsDone(state)) return 0;
  const goal = currentGoal(state), def = goal.makes ? makeDef(goal.makes) : null;
  if (goalPaid(state, goal)) return 0;
  return (def ? def.needs : goal.needs)[item] ?? 0;
}

/** How many of `item` he has to spare for building: what he has, carried or stored, less what the current goal counts. */
export const spare = (state: GameState, item: string) => Math.max(0, owned(state, item) - forGoal(state, item));

/** Whether this layout has a place for `id`, something built in stages: its spot (a camp's). */
export const hasPlaceFor = (layout: Layout, id: MakeId): boolean => !!stagedDef(id) && !!stepPlace(layout, id);

/** Whether the goal that makes `id` has come up: it is the current goal, or done (every goal before it done too), at a
 *  camp. Something no goal makes (an upgrade) has none. */
const goalUp = (state: GameState, layout: Layout, id: MakeId): boolean =>
  !!layout.camp && GOALS.some(g => g.makes === id) && !goalFirst(state, id);

/** Whether what `staged` stands in (StagedDef.inside: the storage chest, the shelter) stands, when it stands in anything. */
const insideStands = (state: GameState, staged: StagedDef) => !staged.inside || LINES[staged.inside].some(s => state.built.includes(s));

/** Whether `id` can be built here now, so the Build list has it: there is a place for it here, it isn't built, and
 *  (begun, it is listed whatever happens) one of the camp's first five once its goal comes up (the goal current, or done
 *  with it not built: a hand-edited save never leaves it out of reach; D4), the chest once a shelter stands too; an
 *  upgrade once the step before it stands, with the storage chest (UPGRADES_AFTER; D4). */
export function unlocked(state: GameState, layout: Layout, id: MakeId): boolean {
  const staged = stagedDef(id);
  if (!staged || !hasPlaceFor(layout, id) || state.built.includes(id)) return false;
  if (state.underway[id] !== undefined) return true;
  if (!insideStands(state, staged)) return false;
  if (!staged.upgrades) return goalUp(state, layout, id);
  return state.built.includes(staged.upgrades) && state.built.includes(UPGRADES_AFTER);
}

/** Whether the marker shows at `id`'s spot (In 1, D1): one of the camp's first five that can be built now (its goal has
 *  come up: unlocked), with nothing of it begun yet. Nothing shows at a spot before that (the owner, 13 Oct 2026:
 *  "nothing shows until it's needed"); once begun, its footings take the marker's place. Upgrades have none: the step
 *  before them stands there already. */
export function markerShown(state: GameState, layout: Layout, id: MakeId): boolean {
  const staged = stagedDef(id);
  return !!staged && !staged.upgrades && state.underway[id] === undefined && unlocked(state, layout, id);
}

/** A row of the Build list: what it is, how far along, and what it still needs to begin. */
export interface BuildRow {
  id: MakeId; def: MakeDef; staged: StagedDef;
  /** begun: what it needed was taken; he carries on where he left off */
  begun: boolean; progress: number; stage: number;
  missing: Record<string, number>;
}

/** What the Build list has: everything he can build here now, begun ones first. */
export function buildRows(state: GameState, layout: Layout): BuildRow[] {
  return STAGED_IDS.filter(id => unlocked(state, layout, id)).map(id => {
    const def = MAKES[id], staged = STAGED[id]!, begun = state.underway[id] !== undefined;
    return { id, def, staged, begun, progress: progressOf(state, id), stage: stageOf(state, id), missing: begun ? {} : lacking(state, def) };
  }).sort((a, b) => Number(b.begun) - Number(a.begun));
}

/** Why something can't be begun or carried on with now, as the build command would say (systems/building.ts
 *  startBuild), for the Build list's buttons and the camp's menu: he is knocked out ('down'), he is building it right
 *  now ('at'), something else is under way ('busy', D8), or he lacks what it needs ('missing', as `lacking` counts). */
export type BuildWhy =
  | { kind: 'down' } | { kind: 'at' } | { kind: 'busy'; other: MakeId } | { kind: 'missing'; items: Record<string, number> };

/** Why `id` (something the Build list has: it can be built here now, or is begun) can't be begun or carried on with
 *  now, or null when it can: the build command's own refusals in its own order. Asleep it can (the command is kept
 *  until he wakes). */
export function buildWhy(state: GameState, id: MakeId): BuildWhy | null {
  const task = state.player.task;
  if (task.kind === 'knockedOut') return { kind: 'down' };
  if (state.underway[id] !== undefined) return task.kind === 'raise' && task.id === id ? { kind: 'at' } : null;
  const other = begunIds(state)[0];
  if (other) return { kind: 'busy', other };
  const missing = lacking(state, MAKES[id]);
  return Object.keys(missing).length ? { kind: 'missing', items: missing } : null;
}

/** Whether the Build button shows: at a camp, once anything can be built (or has been begun or built). */
export const buildOpen = (state: GameState, layout: Layout) =>
  !!layout.camp && STAGED_IDS.some(id => unlocked(state, layout, id) || state.built.includes(id));

/** What a save has under way, read back (core/save.ts), and what that gives back: progress for something built in
 *  stages, begun and not built, with a number of seconds from 0 up to its time, its place here and the step before it
 *  (or, for the chest, the shelter it stands in) standing. At most one thing is under way (D8): the one he was at or on
 *  his way to (`on`, his task's or his destination's id), else the furthest along; what any other took is given back
 *  (`refund`, into the chest), as is what something begun that can't carry on here took (a damaged save). Something
 *  both built and begun is just built. An id the game no longer has is dropped (old saves' are renamed or given back by
 *  their migration first). A save from before building in stages has none of it. */
export function savedBuilding(data: { underway?: unknown }, state: GameState, layout: Layout, on: unknown): { underway: GameState['underway']; refund: Record<string, number> } {
  const saved = typeof data.underway === 'object' && data.underway !== null && !Array.isArray(data.underway) ? data.underway as Record<string, unknown> : {};
  const refund: Record<string, number> = {}, keep: [MakeId, number][] = [];
  const giveBack = (id: MakeId) => { for (const [item, n] of Object.entries(MAKES[id].needs)) refund[item] = (refund[item] ?? 0) + n; };
  for (const id of STAGED_IDS) {
    if (!Object.hasOwn(saved, id) || state.built.includes(id)) continue;
    const worked = saved[id], staged = STAGED[id]!;
    const ok = typeof worked === 'number' && Number.isFinite(worked) && worked >= 0 && worked < MAKES[id].time
      && hasPlaceFor(layout, id) && (!staged.upgrades || state.built.includes(staged.upgrades)) && insideStands(state, staged);
    if (ok) keep.push([id, worked]); else giveBack(id);
  }
  // the one he was at, else the furthest along (the first in the Build list's order of those as far)
  const first = keep.find(([id]) => id === on) ?? keep.reduce<[MakeId, number] | null>((best, k) => !best || k[1] / MAKES[k[0]].time > best[1] / MAKES[best[0]].time ? k : best, null);
  for (const k of keep) if (k !== first) giveBack(k[0]);
  return { underway: first ? { [first[0]]: first[1] } : {}, refund };
}
