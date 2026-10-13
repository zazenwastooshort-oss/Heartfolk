// His thoughts and what he has found (chapter 2, the survival book), as saved: the journal of every thought he has had
// (data/thoughts.ts, by id, each at most once, ever), the pages of his book that have come unstuck (data/survival.ts,
// and 'make:<id>' for a Making page), and when he last said something out loud. systems/thoughts.ts adds to it as he
// plays; this has the checks both it and the save use: whether a cue holds, whether a page's thing is found, and what
// an old save from before the book already knows. Headless.
import { allGoalsDone, currentGoal, made, owned, type GameState } from './state';
import { isNight, nightOf } from './clock';
import { isHungry, nothingToEat } from './needs';
import { GOALS, type Goal } from '../data/goals';
import { MAKES, makeDef, type MakeDef } from '../data/making';
import { THOUGHT, THOUGHTS, thoughtDef, type Cue, type Place, type ThoughtDef } from '../data/thoughts';
import { SURVIVAL, type Found } from '../data/survival';
import type { Layout, Vec2 } from '../world/layout';

/** One thought in his journal: which (data/thoughts.ts), when he had it (in-game seconds; null for one an old save was
 *  given, from before the book), and whether it was said out loud, in a bubble (a thought that had to wait too long
 *  is only in the journal). */
export interface JournalEntry { id: string; at: number | null; shown: boolean }

/** journal: every thought he has had, in order. known: the book's pages come unstuck (SURVIVAL ids, and 'make:<id>'
 *  for a Making page). last: the thought said out loud last (its bubble), saidAt: when; passingAt: when one of his
 *  passing thoughts (not a goal's) last showed (in-game seconds; null for never). */
export interface Thoughts { journal: JournalEntry[]; known: string[]; last: string | null; saidAt: number | null; passingAt: number | null }

export const freshThoughts = (): Thoughts => ({ journal: [], known: [], last: null, saidAt: null, passingAt: null });

/** The key in `known` for the Making page of `id` (data/making.ts). */
export const makeKey = (id: string) => `make:${id}`;

/** What a thought is: a goal's (said at once), a story moment or a passing thought (at most one of them every few
 *  minutes: THOUGHT.gap; a story moment first). */
export const kindOf = (t: ThoughtDef): 'goal' | 'story' | 'passing' => 'goal' in t.cue ? 'goal' : t.story ? 'story' : 'passing';

/** Where a place is, each spot with how near he must come to have seen it (THOUGHT.see; the goblin camp from past its
 *  palisade). Worked out once per layout. */
const spotsCache = new WeakMap<Layout, Record<Place, { pos: Vec2; reach: number }[]>>();
export function placeSpots(layout: Layout, place: Place): { pos: Vec2; reach: number }[] {
  let all = spotsCache.get(layout);
  if (!all) {
    const near = (pos: Vec2, reach = THOUGHT.see) => ({ pos, reach });
    const pickups = (kinds: string[]) => (layout.pickups ?? []).filter(p => kinds.includes(p.kind)).map(p => near(p.pos));
    const nodes = (resource: string) => layout.nodes.filter(n => n.resource === resource).map(n => near(n.pos));
    const camp = layout.goblinCamp;
    all = {
      wreck: pickups(['plank', 'crate', 'tarp']), bushes: pickups(['bush']), fishing: nodes('fishing_spot'), copper: nodes('copper_rock'),
      nest: (layout.nests ?? []).map(n => near(n.pos)), goblins: camp ? [near(camp.pos, camp.radius + THOUGHT.seeCamp)] : [],
    };
    spotsCache.set(layout, all);
  }
  return all[place];
}

/** Whether he is near enough to a place to have seen it. */
export const sees = (state: GameState, layout: Layout, place: Place) => {
  const at = state.player.pos;
  return placeSpots(layout, place).some(s => Math.hypot(s.pos.x - at.x, s.pos.z - at.z) <= s.reach);
};

/** Whether he has reached a goal: it is the one he is on, or done (every goal done reaches them all). A goal not in
 *  GOALS is never reached. */
export function reached(state: GameState, goal: string): boolean {
  const i = GOALS.findIndex(g => g.id === goal);
  if (i < 0) return false;
  return allGoalsDone(state) || i <= GOALS.indexOf(currentGoal(state));
}

/** Whether a page's thing is found, as things stand now. */
export function foundNow(state: GameState, layout: Layout, f: Found): boolean {
  if ('item' in f) return owned(state, f.item) > 0;
  if ('near' in f) return sees(state, layout, f.near);
  if ('built' in f) return state.built.includes(f.built);
  return reached(state, f.goal);
}

/** Whether a thought's cue holds now (a goal's: it is the one he is on). */
export function cued(state: GameState, layout: Layout, cue: Cue): boolean {
  if ('goal' in cue) return !allGoalsDone(state) && currentGoal(state).id === cue.goal;
  if ('item' in cue) return owned(state, cue.item) > 0;
  if ('near' in cue) return sees(state, layout, cue.near);
  if ('night' in cue) return isNight(state.time);
  // (the idle core) hungry with nothing to eat: none on him, none in the chest
  if ('hungry' in cue) return isHungry(state) && nothingToEat(state, layout);
  return state.player.task.kind === 'knockedOut';
}

/** Whether the Making page of `def` comes unstuck: he needs it (the goal that makes it is reached), he has made it, or
 *  he has everything it needs. */
export function recipeKnown(state: GameState, def: MakeDef): boolean {
  const goal = GOALS.find(g => g.makes === def.id);
  return (!!goal && reached(state, goal.id)) || made(state, def.id) || Object.entries(def.needs).every(([id, n]) => owned(state, id) >= n);
}

/** Whether a goal asks for `item`, or the thing it makes needs it. */
const asks = (g: Goal, item: string) => (g.needs[item] ?? 0) > 0 || ((g.makes ? makeDef(g.makes)?.needs[item] : 0) ?? 0) > 0;

/** Whether a goal that is done asks for `item`: an old save that did it had the item. */
const doneWith = (state: GameState, item: string) => GOALS.some(g => state.goalsDone.includes(g.id) && asks(g, item));

/** The first goal that asks for `item` (or whose thing needs it), for placing an old save's thoughts. */
const firstAsking = (item: string) => GOALS.findIndex(g => asks(g, item));

/** The pages an old save knows: those found now, those whose goal (`by`) it has reached, and the Making pages that would
 *  have come unstuck. */
function impliedKnown(state: GameState, layout: Layout): string[] {
  const pages = SURVIVAL.filter(p => foundNow(state, layout, p.found) || (!!p.by && reached(state, p.by))).map(p => p.id);
  return [...pages, ...Object.values(MAKES).filter(d => recipeKnown(state, d)).map(d => makeKey(d.id))];
}

/** The journal an old save starts with: the thought of every goal up to the one it is on, and the other thoughts its
 *  progress implies (things it has or a finished goal asked for, places whose page it knows, the book, the first night
 *  once past it, after the campfire's goal), each after the goal it belongs with. All as said before the book (at null), so none is said again. */
function impliedJournal(state: GameState, layout: Layout, known: string[]): JournalEntry[] {
  const now = allGoalsDone(state) ? GOALS.length - 1 : GOALS.indexOf(currentGoal(state));
  const placed: { id: string; order: number }[] = [];
  for (const t of THOUGHTS) {
    const cue = t.cue;
    if ('goal' in cue) {
      const i = GOALS.findIndex(g => g.id === cue.goal);
      if (i >= 0 && i <= now) placed.push({ id: t.id, order: i });
    } else if ('item' in cue) {
      if (owned(state, cue.item) > 0 || doneWith(state, cue.item)) { const i = firstAsking(cue.item); placed.push({ id: t.id, order: i < 0 ? GOALS.length : i + 0.5 }); }
    } else if ('near' in cue) {
      const page = SURVIVAL.find(p => 'near' in p.found && p.found.near === cue.near);
      if (sees(state, layout, cue.near) || (page && known.includes(page.id))) {
        const i = page?.by ? GOALS.findIndex(g => g.id === page.by) : -1;
        placed.push({ id: t.id, order: i < 0 ? GOALS.length : i + 0.5 });
      }
    } else if ('night' in cue) {
      // the first night goes just after the campfire's goal (the fire he keeps at night), where it reads in order
      const fire = GOALS.findIndex(g => g.makes === 'campfire');
      if (nightOf(state.time) >= 0) placed.push({ id: t.id, order: fire < 0 ? GOALS.length : fire + 0.5 });
    }
  }
  return placed.sort((a, b) => a.order - b.order).map(p => ({ id: p.id, at: null, shown: true }));
}

/** What an old save from before the book knows and has thought (none in a layout without a camp). */
export function impliedThoughts(state: GameState, layout: Layout): Thoughts {
  if (!layout.camp) return freshThoughts();
  const known = impliedKnown(state, layout);
  return { ...freshThoughts(), known, journal: impliedJournal(state, layout, known) };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** A saved time: a finite number not after now, else null. */
const savedTime = (v: unknown, now: number) => typeof v === 'number' && Number.isFinite(v) && v <= now ? v : null;
/** Whether `id` is a page of the book. */
const isPage = (id: string) => SURVIVAL.some(p => p.id === id) || Object.keys(MAKES).some(m => makeKey(m) === id);

/** His thoughts as saved (`v`, readSave): journal entries for thoughts the table still has, each once, with a time not
 *  after now (or null) and whether it was said; pages the book still has, each once; the times last said. A save from
 *  before the book (no thoughts saved) starts with what its progress implies (impliedThoughts); so does a part that is
 *  damaged (not a list). None in a layout without a camp. */
export function savedThoughts(v: unknown, state: GameState, layout: Layout): Thoughts {
  if (!layout.camp) return freshThoughts();
  if (!isRecord(v)) return impliedThoughts(state, layout);
  const implied = !Array.isArray(v.journal) || !Array.isArray(v.known) ? impliedThoughts(state, layout) : null;
  const seen = new Set<string>();
  const journal = Array.isArray(v.journal) ? v.journal.flatMap((e): JournalEntry[] => {
    if (!isRecord(e) || typeof e.id !== 'string' || !thoughtDef(e.id) || seen.has(e.id)) return [];
    seen.add(e.id);
    return [{ id: e.id, at: savedTime(e.at, state.time), shown: e.shown !== false }];
  }) : implied!.journal;
  const known = Array.isArray(v.known) ? [...new Set(v.known.filter((id): id is string => typeof id === 'string' && isPage(id)))] : implied!.known;
  const saidAt = savedTime(v.saidAt, state.time), last = typeof v.last === 'string' && journal.some(e => e.id === v.last && e.shown) ? v.last : null;
  return { journal, known, last: saidAt === null ? null : last, saidAt, passingAt: savedTime(v.passingAt, state.time) };
}
