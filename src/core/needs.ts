// His needs at the camp (12 and 13 Oct 2026; numbers in data/needs.ts and data/sleep.ts) as saved, and the checks the
// rest of the game shares: how full he is, a meal trip to the chest under way, bed (on his way at bedtime, or asleep)
// and when he gets up, the bedtime the player set, and the last thing tapped while he slept, done when he wakes.
// systems/needs.ts runs them. Headless.
import { canSleep, owned, type Back, type GameState } from './state';
import type { Layout, Vec2 } from '../world/layout';
import { chestHere } from './camp';
import { DAY_SECONDS, dayFraction, nightOf } from './clock';
import { foeKind, foeOf } from './targets';
import { spare } from './building';
import { HUNGER } from '../data/needs';
import { SLEEP } from '../data/sleep';
import { STOKE } from '../data/fire';
import { FOOD, isFood } from '../data/food';
import { GOALS } from '../data/goals';
import { makeDef, type MakeId } from '../data/making';

/** A tap while he sleeps, kept until he wakes (13 Oct 2026, the owner: taps while he sleeps happen when he wakes): the
 *  commands that send him somewhere (systems/commands.ts has them all), the last one tapped. */
export type Later = { type: 'walk'; to: Vec2 } | { type: 'work'; nodeId: string } | { type: 'visit'; id: string; at?: Vec2 }
  | { type: 'pickup'; id: string } | { type: 'make'; id: MakeId } | { type: 'fight'; target: string } | { type: 'cook' }
  | { type: 'next' } | { type: 'build'; id: MakeId };

/** In bed: what he goes back to when he gets up (null for nothing), and when he gets up (in-game seconds; null while he
 *  is on his way to bed sent early by a tap on the shelter: set once he lies down). */
export interface Bed { back: Back | null; until: number | null }

/** fullness: 0 (empty) to 1 (full); below HUNGER.hungry he is hungry. meal: on his way to the chest for something to
 *  eat, and what he goes back to after. bed: on his way to bed, or asleep (Bed). bedtime: the hour he goes to bed, one
 *  of SLEEP.bedtimes (Settings). slept: the last night (nightOf in core/clock.ts) he went to bed, -1 before the first.
 *  later: the last thing tapped while he slept, done when he wakes. retryAt: after finding no way to the chest or the
 *  shelter, he looks again from this in-game time, so a blocked way is never searched every step. */
export interface Needs {
  fullness: number; meal: { back: Back | null } | null; bed: Bed | null;
  bedtime: number; slept: number; later: Later | null; retryAt: number;
}

/** A new game's needs: full, on his way nowhere, to bed at SLEEP.bedtime. */
export const freshNeeds = (): Needs => ({ fullness: 1, meal: null, bed: null, bedtime: SLEEP.bedtime, slept: -1, later: null, retryAt: 0 });

// ---- hunger ----

/** Whether he is hungry. */
export const isHungry = (state: GameState) => state.needs.fullness < HUNGER.hungry;

/** How much as often a tree, a rock or a fishing spot yields: a little less while he is hungry (systems/gathering.ts). */
export const hungerFactor = (state: GameState) => isHungry(state) ? HUNGER.slow : 1;

/** The first goal about food (data/goals.ts: one that needs something to eat, the Berries goal), by its place. */
const FOOD_GOAL = GOALS.findIndex(g => Object.keys(g.needs).some(isFood));

/** Whether he gets hungry yet: only once food is part of his story, the first goal about food the one he is on (every
 *  goal before it done) or behind him; before that he stays as full as he is. */
export const hungerStarted = (state: GameState) => FOOD_GOAL < 0 || GOALS.slice(0, FOOD_GOAL).every(g => state.goalsDone.includes(g.id));

/** How many of `food` he may eat when hungry: what he has, carried or stored, less what the camp's current goal counts
 *  (spare in core/building.ts; the owner: he leaves the goal's food alone). */
export const spareFood = (state: GameState, food: string) => spare(state, food);

/** Whether there is nothing for him to eat: no food to spare, on him or in the storage chest. */
export const nothingToEat = (state: GameState) => !Object.keys(FOOD).some(f => spareFood(state, f) > 0);

/** Food he has (carried or stored) that the current goal counts, every one of it, so he leaves it alone (the most
 *  filling first); null when he has none such. */
export const goalsFood = (state: GameState) =>
  Object.keys(FOOD).sort((a, b) => FOOD[b]!.fills - FOOD[a]!.fills).find(f => owned(state, f) > 0 && spareFood(state, f) === 0) ?? null;

/** How much fullness he uses up in a second of play. */
export const HUNGER_PER_SECOND = HUNGER.perDay / DAY_SECONDS;

/** Whether he is in the middle of a fight: striking a creature that fights back (a rat, a goblin, the chief) that is
 *  still up. Hunger never pulls him out of one, and bedtime waits for it to be over (the owner, 13 Oct 2026). */
export function midFight(state: GameState): boolean {
  const task = state.player.task;
  if (task.kind !== 'fight') return false;
  const foe = foeOf(state, task.target);
  return !!foe && foe.downUntil === null && foe.health > 0;
}

/** Whether he is at the goblin camp's fight (striking a goblin or the chief, or on his way to): a race to beat all
 *  three before they get back up, which a trip to the chest for a meal would lose (he eats what he carries between
 *  goblins). */
export function atGoblins(state: GameState, layout: Layout): boolean {
  const p = state.player, id = p.task.kind === 'fight' ? p.task.target : p.pending?.kind === 'fight' ? p.pending.id : null;
  const kind = id ? foeKind(layout, id) : null;
  return kind === 'goblin' || kind === 'chief';
}

/** Whether he is in the middle of the goblin camp's race (at it, as atGoblins, with a goblin he beat still down or the
 *  chief out): bedtime waits for it to be won (the chief beaten) or lost (knocked out), as for any fight, but no
 *  longer than a race can last (GOBLIN.back) past his bedtime (sinceBedtime): a race he can't win goes on and on. */
export function goblinRace(state: GameState, layout: Layout): boolean {
  return atGoblins(state, layout) && (state.goblinCamp.chiefOut || Object.values(state.goblins).some(g => g.downUntil !== null));
}

// ---- sleep ----

/** The next time of day `hour` o'clock comes, from `time` (in-game seconds; `time` itself when it is that hour). */
export function nextHour(time: number, hour: number): number {
  const t = Math.floor(time / DAY_SECONDS) * DAY_SECONDS + hour * DAY_SECONDS / 24;
  return t >= time ? t : t + DAY_SECONDS;
}

/** The hour he gets up after going to bed at `bedtime`: SLEEP.hours later (04:00 to 07:00). */
export const wakeHour = (bedtime: number) => (bedtime + SLEEP.hours) % 24;

/** Whether `time` is in his hours in bed: from his bedtime until he gets up. */
export function bedHours(time: number, bedtime: number): boolean {
  const h = dayFraction(time) * 24, from = bedtime, to = wakeHour(bedtime);
  return from < to ? h >= from && h < to : h >= from || h < to;
}

/** How long since his bedtime last came round, at `time` (in-game seconds). */
export const sinceBedtime = (time: number, bedtime: number) => ((dayFraction(time) * 24 - bedtime + 24) % 24) / 24 * DAY_SECONDS;

/** When he gets up, having gone to bed at `time`: at his bedtime, at his waking hour; sent to bed early by a tap on the
 *  shelter (`early`), SLEEP.hours later but no later than SLEEP.latest (07:00). */
export function wakeAt(time: number, bedtime: number, early: boolean): number {
  if (!early) return nextHour(time, wakeHour(bedtime));
  return Math.min(time + SLEEP.hours / 24 * DAY_SECONDS, nextHour(time, SLEEP.latest));
}

/** Rested after a night's sleep, he stays so until nightfall (20:00, STOKE.at), whatever time he got up. */
export const restedTill = (time: number) => nextHour(time, STOKE.at * 24);

/** Whether he is due in bed now: at the camp with a shelter standing (the tent, the wall tent or the log cabin), from
 *  his bedtime until SLEEP.late hours before his waking hour, not yet to bed tonight. */
export function bedtimeNow(state: GameState, layout: Layout): boolean {
  const n = state.needs, late = SLEEP.late / 24 * DAY_SECONDS;
  return !!layout.camp && canSleep(state, layout) && bedHours(state.time, n.bedtime) && bedHours(state.time + late, n.bedtime)
    && n.slept < nightOf(state.time);
}

/** Whether a tap waits until he wakes (systems/commands.ts): he is asleep, or on his way to bed at bedtime (going to
 *  bed is a must; sent early by a tap on the shelter, a tap changes his mind). When he gets up then, or null. */
export function sleepsThrough(state: GameState): number | null {
  const bed = state.needs.bed;
  if (!bed || bed.until === null) return null;
  const p = state.player;
  return p.task.kind === 'sleep' || (p.pending?.kind === 'visit' && p.pending.id === 'shelter') ? bed.until : null;
}

// ---- saved ----

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const spot = (v: unknown): Vec2 | undefined => isRecord(v) && finite(v.x) && finite(v.z) ? { x: v.x, z: v.z } : undefined;

/** A tap kept while he slept, as saved: one of Later's commands, with what it names still in the game here (a node, a
 *  pickup, something to make or build). Whether it can be done is seen to when he wakes, as for any tap. */
export function savedLater(v: unknown, state: GameState, layout: Layout): Later | null {
  if (!isRecord(v) || typeof v.type !== 'string') return null;
  const str = (k: string) => typeof v[k] === 'string' ? v[k] as string : null;
  const make = (k: string) => { const id = str(k); return id && makeDef(id) ? id as MakeId : null; };
  switch (v.type) {
    case 'walk': { const to = spot(v.to); return to ? { type: 'walk', to } : null; }
    case 'work': { const id = str('nodeId'); return id && id in state.nodes ? { type: 'work', nodeId: id } : null; }
    case 'visit': { const id = str('id'), at = spot(v.at); return id ? (at ? { type: 'visit', id, at } : { type: 'visit', id }) : null; }
    case 'pickup': { const id = str('id'); return id && (layout.pickups ?? []).some(x => x.id === id) ? { type: 'pickup', id } : null; }
    case 'make': { const id = make('id'); return id ? { type: 'make', id } : null; }
    case 'fight': { const id = str('target'); return id ? { type: 'fight', target: id } : null; }
    case 'cook': return { type: 'cook' };
    case 'next': return { type: 'next' };
    // (since the camp build nothing is placed: a build tap kept from before has its id only)
    case 'build': { const id = make('id'); return id ? { type: 'build', id } : null; }
    default: return null;
  }
}

/** His needs as saved (readSave, after his task, trip, stoking and cooking are checked): fullness a number from 0 to 1,
 *  anything else (none saved, from before needs) full; a meal trip only on his way to a chest that stands, never beside
 *  a trip, stoking or cooking; bed only with a shelter standing, asleep or on his way there, getting up within a
 *  night's sleep from now (asleep in a save from before bedtimes, 0.0.26 and 0.0.27, he sleeps on until his waking hour);
 *  his bedtime one of SLEEP.bedtimes, else SLEEP.bedtime; the night he last went to bed not after this one; a tap kept
 *  only while he sleeps (savedLater). `back` checks what a meal or bed goes back to (savedBack in core/save.ts). */
export function savedNeeds(v: unknown, state: GameState, layout: Layout, back: (v: unknown) => Back | null): Needs {
  const n = isRecord(v) ? v : {}, p = state.player, fresh = freshNeeds();
  const fullness = finite(n.fullness) ? Math.min(1, Math.max(0, n.fullness)) : fresh.fullness;
  const bedtime = SLEEP.bedtimes.includes(n.bedtime as number) ? n.bedtime as number : fresh.bedtime;
  const slept = Number.isSafeInteger(n.slept) && (n.slept as number) <= nightOf(state.time) ? n.slept as number : fresh.slept;
  const retryAt = finite(n.retryAt) && n.retryAt <= state.time + 60 ? n.retryAt : fresh.retryAt;
  const toChest = p.pending?.kind === 'visit' && p.pending.id === 'chest' && chestHere(state, layout);
  const meal = isRecord(n.meal) && toChest && !p.trip && !p.stoke && !p.cook ? { back: back(n.meal.back) } : null;
  const asleep = p.task.kind === 'sleep', toBed = !meal && p.pending?.kind === 'visit' && p.pending.id === 'shelter';
  let bed: Bed | null = null;
  if (canSleep(state, layout) && (asleep || toBed)) {
    const b = isRecord(n.bed) ? n.bed : null, most = state.time + SLEEP.hours / 24 * DAY_SECONDS + 1;
    const until = b && finite(b.until) && b.until > state.time && b.until <= most ? b.until : null;
    if (b && (until !== null || (toBed && b.until === null))) bed = { back: back(b.back), until };
    // asleep in a save from before bedtimes (or a damaged one): he sleeps on until his waking hour
    else if (asleep && wakeAt(state.time, bedtime, false) - state.time <= DAY_SECONDS / 2) bed = { back: null, until: wakeAt(state.time, bedtime, false) };
  }
  const later = bed ? savedLater(n.later, state, layout) : null;
  return { fullness, meal, bed, bedtime, slept: bed ? Math.max(slept, nightOf(state.time)) : slept, later, retryAt };
}
