// His thoughts (chapter 2, the survival book): what he says to himself, in a bubble over his head (ui/thoughts.ts), and
// writes into the journal in his book, and the book's pages coming unstuck as he finds things (core/thoughts.ts holds
// the checks, data/thoughts.ts and data/survival.ts the words). The rules, from THOUGHT in data/thoughts.ts:
// - a new goal's thought is said at once, even straight after another bubble (goals finished in the same moment as it
//   began are only written in the journal: a goal skipped over isn't said);
// - any other (a first find, a story moment) waits until nothing was said for `quiet` seconds, and for `gap` since the
//   last of them: at most one every few minutes; a story moment goes first when both wait;
// - a first find that can't be said within `wait` seconds is only in the journal; a story moment is never dropped: it
//   waits for its turn however long that takes, said while its cue still holds (the first night's at night);
// - each is had once, ever (the journal remembers, saved), so none repeats;
// - only at the camp (a layout with one): the village has none.
// Every thought is in the journal from the moment he has it, so nothing said is ever missed.
import { allGoalsDone, currentGoal, type GameState } from '../core/state';
import type { Layout } from '../world/layout';
import { cued, foundNow, kindOf, makeKey, recipeKnown, type Thoughts } from '../core/thoughts';
import { GOALS } from '../data/goals';
import { MAKES } from '../data/making';
import { SURVIVAL } from '../data/survival';
import { THOUGHT, THOUGHTS, goalThought, thoughtDef } from '../data/thoughts';

const had = (t: Thoughts, id: string) => t.journal.some(e => e.id === id);

/** Whether a thought of this kind may be said now (a goal's always may). */
export function maySay(state: GameState, kind: 'goal' | 'story' | 'passing'): boolean {
  if (kind === 'goal') return true;
  const t = state.thoughts, now = state.time;
  if (t.saidAt !== null && now - t.saidAt < THOUGHT.quiet) return false;
  return t.passingAt === null || now - t.passingAt >= THOUGHT.gap;
}

/** Say a thought out loud: its bubble shows (ui/thoughts.ts sees `last` and `saidAt` change). */
function say(state: GameState, id: string): void {
  const t = state.thoughts, entry = t.journal.find(e => e.id === id), def = thoughtDef(id);
  if (!entry || !def) return;
  entry.shown = true;
  t.saidAt = state.time;
  t.last = id;
  if (kindOf(def) !== 'goal') t.passingAt = state.time;
}

/** The goal he is on now has its thought: in the journal and said at once. Goals before it whose thoughts he never had
 *  (finished in the same moment) go into the journal unsaid. */
function goalBegun(state: GameState): void {
  if (allGoalsDone(state)) return;
  const t = state.thoughts, goal = currentGoal(state), line = goalThought(goal.id);
  if (!line || had(t, line.id)) return;
  for (const g of GOALS.slice(0, GOALS.indexOf(goal))) {
    const skipped = goalThought(g.id);
    if (skipped && !had(t, skipped.id)) t.journal.push({ id: skipped.id, at: state.time, shown: false });
  }
  t.journal.push({ id: line.id, at: state.time, shown: false });
  say(state, line.id);
}

/** Every step at the camp: a new goal's thought at once; a few times a second, what he has found (pages coming
 *  unstuck), new thoughts, and the oldest waiting thought said once it may be. */
export function updateThoughts(state: GameState, layout: Layout, dt: number): void {
  if (!layout.camp) return;
  goalBegun(state);
  if (Math.floor(state.time / THOUGHT.look) === Math.floor((state.time - dt) / THOUGHT.look)) return;
  const t = state.thoughts;
  for (const page of SURVIVAL) {
    if (!t.known.includes(page.id) && foundNow(state, layout, page.found)) t.known.push(page.id);
  }
  for (const def of Object.values(MAKES)) {
    const key = makeKey(def.id);
    if (!t.known.includes(key) && recipeKnown(state, def)) t.known.push(key);
  }
  for (const line of THOUGHTS) {
    if (kindOf(line) === 'goal' || had(t, line.id) || !cued(state, layout, line.cue)) continue;
    t.journal.push({ id: line.id, at: state.time, shown: false });
  }
  // the thought waiting longest that may be said now, a story moment first (a skipped goal's is never said; a first
  // find only within THOUGHT.wait; a story moment however long it waited, while its cue still holds)
  const waiting = t.journal.filter(e => {
    const def = !e.shown && e.at !== null ? thoughtDef(e.id) : undefined;
    if (!def || kindOf(def) === 'goal' || !maySay(state, kindOf(def))) return false;
    return def.story ? cued(state, layout, def.cue) : state.time - e.at! < THOUGHT.wait;
  });
  const next = waiting.find(e => thoughtDef(e.id)!.story) ?? waiting[0];
  if (next) say(state, next.id);
}
