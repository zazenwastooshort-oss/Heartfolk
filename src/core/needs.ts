// His needs (the idle core, 12 Oct 2026; data/needs.ts) as saved: how full he is, a trip to the chest for food or to
// bed by himself under way (each with what he goes back to after), and when the player last sent him somewhere (he
// goes to bed by himself only if they haven't since nightfall; a meal waits for him to be idle if they sent him
// somewhere after he got hungry). systems/needs.ts runs them; these are the checks the rest of the game shares.
import type { Back, GameState } from './state';
import type { Layout } from '../world/layout';
import { siteOf } from '../world/layout';
import { DAY_SECONDS, isNight } from './clock';
import { HUNGER } from '../data/needs';
import { FOOD, isFood } from '../data/food';
import { GOALS } from '../data/goals';

/** fullness: 0 (empty) to 1 (full); below HUNGER.hungry he is hungry. meal: on his way to the chest for something to
 *  eat, and what he goes back to after (null for nothing). bed: gone to bed by himself tonight (on his way, or asleep),
 *  and what he goes back to at dawn. sentAt: the in-game time the player last sent him somewhere (a tap in the world,
 *  the goal card), -1 before the first. */
export interface Needs { fullness: number; meal: { back: Back | null } | null; bed: { back: Back | null } | null; sentAt: number }

/** A new game's needs: full, on his way nowhere. */
export const freshNeeds = (): Needs => ({ fullness: 1, meal: null, bed: null, sentAt: -1 });

/** Whether he is hungry. */
export const isHungry = (state: GameState) => state.needs.fullness < HUNGER.hungry;

/** How much as often a tree, a rock or a fishing spot yields: a little less while he is hungry (systems/gathering.ts). */
export const hungerFactor = (state: GameState) => isHungry(state) ? HUNGER.slow : 1;

/** The first goal about food (data/goals.ts: one that needs something to eat, the Berries goal), by its place. */
const FOOD_GOAL = GOALS.findIndex(g => Object.keys(g.needs).some(isFood));

/** Whether he gets hungry yet: only once food is part of his story, the first goal about food the one he is on (every
 *  goal before it done) or behind him; before that he stays as full as he is. */
export const hungerStarted = (state: GameState) => FOOD_GOAL < 0 || GOALS.slice(0, FOOD_GOAL).every(g => state.goalsDone.includes(g.id));

/** Whether there is nothing for him to eat: no food on him, and none in the storage chest (where it stands). */
export function nothingToEat(state: GameState, layout: Layout): boolean {
  const chest = !!siteOf(layout, 'chest') && state.built.includes('chest');
  return !Object.keys(FOOD).some(f => (state.player.backpack[f] ?? 0) > 0 || (chest && (state.bank[f] ?? 0) > 0));
}

/** How much fullness he uses up in a second of play. */
export const HUNGER_PER_SECOND = HUNGER.perDay / DAY_SECONDS;

/** When he got hungry: how long ago fullness went under HUNGER.hungry, at the rate it falls; now when he isn't. */
export const hungrySince = (state: GameState) => state.time - Math.max(0, HUNGER.hungry - state.needs.fullness) / HUNGER_PER_SECOND;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** His needs as saved (readSave, after his task, trip, stoking and cooking are checked): fullness a number from 0 to 1,
 *  anything else (none saved, from before needs) full; a meal trip only on his way to a chest that stands, never beside
 *  a trip, stoking or cooking; to bed by himself only at night with the shelter standing, asleep or on his way there;
 *  each with what he goes back to after as `back` checks it (savedBack in core/save.ts); the time he was last sent
 *  somewhere not after now. */
export function savedNeeds(v: unknown, state: GameState, layout: Layout, back: (v: unknown) => Back | null): Needs {
  const n = isRecord(v) ? v : {}, p = state.player, fresh = freshNeeds();
  const fullness = typeof n.fullness === 'number' && Number.isFinite(n.fullness) ? Math.min(1, Math.max(0, n.fullness)) : fresh.fullness;
  const sentAt = typeof n.sentAt === 'number' && Number.isFinite(n.sentAt) && n.sentAt <= state.time ? n.sentAt : fresh.sentAt;
  const toChest = p.pending?.kind === 'visit' && p.pending.id === 'chest' && state.built.includes('chest') && !!siteOf(layout, 'chest');
  const meal = isRecord(n.meal) && toChest && !p.trip && !p.stoke && !p.cook ? { back: back(n.meal.back) } : null;
  const toBed = p.task.kind === 'sleep' || (p.pending?.kind === 'visit' && p.pending.id === 'shelter');
  const shelter = !!siteOf(layout, 'tent') && state.built.includes('shelter');
  const bed = isRecord(n.bed) && !meal && toBed && shelter && isNight(state.time) ? { back: back(n.bed.back) } : null;
  return { fullness, meal, bed, sentAt };
}
