// His book (0.0.17): one page per goal (data/goals.ts), in order, up to the goal he is on; the pages after it are
// still stuck together from the river. Headless, so the tests can check what each page shows; the goal card counts
// with goalLines too, so the card and the book always agree. Since the survival book (core/survival.ts) ui/book.ts no
// longer draws these goal pages; goalLines (the card's counts, and the Making pages' counting) and opensBook are used.
import type { GameEvent } from './events';
import { allGoalsDone, currentGoal, goalFinished, goalMet, goalPaid, owned, type GameState } from './state';
import { CAMP_DONE, GOALS, type Goal } from '../data/goals';
import { levelFor } from '../data/xp';
import type { SkillId } from '../data/skills';

/** One line of what a goal needs: `got` of `need` (carried or stored, as the card counts; never more than `need`),
 *  ticked (`done`) once there are enough. A `level` line (0.0.22) is a skill level the goal asks for: `id` is the skill,
 *  `got` his level in it ("Attack level 2 / 3"). */
export interface BookLine { id: string; need: number; got: number; done: boolean; level?: true }

/** One page: its number (from 1), its goal's title, the book's words for it (`text`), what it needs, the hint (the
 *  goal's ready text instead once everything is there; none on a finished page, whose ticks and Done mark say it
 *  all, except the last once every goal is done: it says the camp is set up), whether the goal is finished, and
 *  whether it is the goal he is on now (the last page shown). */
export interface BookPage {
  number: number; goal: string; title: string; text: string; lines: BookLine[]; hint: string; done: boolean; current: boolean;
}

/** What a goal needs and how much of each he has, as the goal card counts it: carried or stored, never more than is
 *  needed. A finished goal has every line ticked, even after its things were used up (the campfire's planks); so does
 *  one paid for (the camp build: the thing it makes begun, what it needed taken), while he builds it. */
export function goalLines(state: GameState, goal: Goal): BookLine[] {
  const finished = goalPaid(state, goal);
  const items = Object.entries(goal.needs).map(([id, need]) => {
    const got = finished ? need : Math.min(need, owned(state, id));
    return { id, need, got, done: got >= need };
  });
  const levels = Object.entries(goal.levels ?? {}).map(([id, need]): BookLine => {
    const got = finished ? need! : Math.min(need!, levelFor(state.skills[id as SkillId] ?? 0));
    return { id, need: need!, got, done: got >= need!, level: true };
  });
  return [...items, ...levels];
}

/** The pages to show: one per goal from the first up to the goal he is on (currentGoal), and none after it. Once
 *  every goal is finished, the last page says the camp is set up (CAMP_DONE) where a hint would be. */
export function bookPages(state: GameState): BookPage[] {
  const now = currentGoal(state), last = GOALS.indexOf(now), allDone = allGoalsDone(state);
  return GOALS.slice(0, last + 1).map((goal, i) => {
    const done = goalFinished(state, goal);
    return {
      number: i + 1, goal: goal.id, title: goal.title, text: goal.page, lines: goalLines(state, goal),
      hint: done ? (allDone && goal === now ? CAMP_DONE.text : '') : goalMet(state, goal) ? goal.ready : goal.hint, done, current: goal === now,
    };
  });
}

/** Whether an event opens the book by itself: picking it up off the shore. */
export const opensBook = (e: GameEvent) => e.type === 'pickedUp' && e.kind === 'book';
