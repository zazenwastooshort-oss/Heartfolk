// His needs at the camp (the idle core, 12 Oct 2026; the owner: "he eats when he needs to eat, he is doing his main job
// but then other needs require his attention as well, like eating, sleeping"; numbers in data/needs.ts, what is saved
// in core/needs.ts).
// - Hunger: how full he is falls over game time, once food is part of his story (from the first goal about food, the
//   Berries goal: core/needs.ts, hungerStarted). Hungry, he eats at once from his backpack, the most filling food first,
//   until he is full; with none on him he walks to the storage chest, eats there, takes a few meals along (KEEP_FOOD)
//   and goes back to what he was doing (as after stoking the fire: Back). He goes at once from whatever he does, unless
//   he is asleep, knocked out, making something, stoking the fire, cooking or on a trip to the chest anyway, or the
//   player sent him somewhere after he got hungry: then once that's done (he is idle, or back at his job). With nothing
//   to eat anywhere he says so (when he gets hungry, or wakes up hungry), and works a little slower (core/needs.ts,
//   hungerFactor) until he eats; never worse than that. Food he eats any other way (a tap on Eat, eating when hurt in a
//   fight) fills him too (systems/food.ts).
// - Sleep: at night, once the fire has been seen to (stokedNight) and with the shelter standing, he goes to bed by
//   himself (the shelter tapped, systems/sleep.ts: play goes quicker while he sleeps) and gets up at dawn well rested,
//   then goes back to what he was doing at bedtime, or to his job (systems/jobs.ts). Not if the player has sent him
//   somewhere since nightfall: then he goes to bed once that's done (he is idle, or back at his job). Without a shelter
//   he works through the night, as before.
// Only at the camp. It runs every step, so catching up (away time) eats and sleeps as playing does.
import { canSleep, maxHealth, type GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout } from '../world/layout';
import { siteOf } from '../world/layout';
import { DAY_SECONDS, isNight, nightOf } from '../core/clock';
import { HUNGER_PER_SECOND, hungerStarted, hungrySince, isHungry, nothingToEat } from '../core/needs';
import { foeKind } from '../core/targets';
import { HUNGER, NEEDS_RETRY } from '../data/needs';
import { FOOD } from '../data/food';
import { STOKE } from '../data/fire';
import { BUILD_REACH } from '../data/making';
import { KEEP_FOOD } from '../data/hauling';
import { goVisit } from '../actors/player';
import { backpackFull, deposit } from './backpack';
import { backOf } from './fire';
import { backToWork } from './hauling';
import { goToBed } from './sleep';

/** The foods, the most filling first. */
const FILLING_FIRST = Object.keys(FOOD).sort((a, b) => FOOD[b]!.fills - FOOD[a]!.fills);

const carriesFood = (state: GameState) => FILLING_FIRST.some(f => (state.player.backpack[f] ?? 0) > 0);
const chestStands = (state: GameState, layout: Layout) => !!siteOf(layout, 'chest') && state.built.includes('chest');
/** Food in the storage chest, where it stands. */
const chestFood = (state: GameState, layout: Layout) => chestStands(state, layout) ? FILLING_FIRST.reduce((a, f) => a + (state.bank[f] ?? 0), 0) : 0;
/** Whether he stands beside the chest (where he stands to use it: actors/player's goBeside). */
function besideChest(state: GameState, layout: Layout): boolean {
  const chest = siteOf(layout, 'chest'), p = state.player.pos;
  return !!chest && Math.hypot(p.x - chest.pos.x, p.z - chest.pos.z) <= chest.radius + BUILD_REACH + 0.4;
}
const goingTo = (state: GameState, id: string) => state.player.pending?.kind === 'visit' && state.player.pending.id === id;

/** Whether he has nothing to do: standing about, going nowhere, on no trip, not cooking or stoking, not on his way to
 *  eat or to bed (systems/jobs.ts sends him back to his job then). */
export function isIdle(state: GameState): boolean {
  const p = state.player, n = state.needs;
  return p.task.kind === 'idle' && !p.pending && !p.path.length && !p.trip && !p.stoke && !p.cook && !n.meal && !n.bed;
}

/** Whether a clock running every NEEDS_RETRY seconds ticked in the last `dt`: he looks for a way to the chest or to bed
 *  at most that often, so a blocked way is never searched every step. */
const retryNow = (time: number, dt: number) => Math.floor(time / NEEDS_RETRY) !== Math.floor((time - dt) / NEEDS_RETRY);

/** He eats from his backpack until he is full (HUNGER.full) or it runs out, the most filling food first; each heals him
 *  as food does. `took`: food he has just taken out of the chest to take along, for the notice. */
function eatUp(state: GameState, events: EventBus, took?: Record<string, number>): void {
  const pack = state.player.backpack, n = state.needs, max = maxHealth(state), items: Record<string, number> = {};
  for (const food of FILLING_FIRST) {
    while (n.fullness < HUNGER.full && (pack[food] ?? 0) > 0) {
      if (--pack[food]! <= 0) delete pack[food];
      n.fullness = Math.min(1, n.fullness + FOOD[food]!.fills);
      state.health = Math.min(max, state.health + FOOD[food]!.heals);
      items[food] = (items[food] ?? 0) + 1;
    }
  }
  if (Object.keys(items).length) events.emit(took && Object.keys(took).length ? { type: 'meal', items, fullness: n.fullness, took } : { type: 'meal', items, fullness: n.fullness });
}

/** Beside the chest, hungry with no food on him: out of the chest comes what he eats (the most filling first, as much as
 *  fits: a full backpack is emptied into the chest first) and a few meals to take along (KEEP_FOOD); then he eats. */
function eatAtChest(state: GameState, events: EventBus): void {
  if (backpackFull(state)) deposit(state, events);
  const pack = state.player.backpack, bank = state.bank, took: Record<string, number> = {};
  const take = (food: string) => { if (bank[food] === 1) delete bank[food]; else bank[food]!--; pack[food] = (pack[food] ?? 0) + 1; };
  let full = state.needs.fullness;
  for (const food of FILLING_FIRST) {
    while (full < HUNGER.full && (bank[food] ?? 0) > 0 && !backpackFull(state)) { take(food); full = Math.min(1, full + FOOD[food]!.fills); }
  }
  let along = 0;
  for (const food of FILLING_FIRST) {
    while (along < KEEP_FOOD && (bank[food] ?? 0) > 0 && !backpackFull(state)) { take(food); took[food] = (took[food] ?? 0) + 1; along++; }
  }
  eatUp(state, events, took);
}

/** Whether something keeps him from leaving what he does for a meal or for bed: asleep, knocked out, making something
 *  (he finishes it), stoking the fire, cooking (a meal comes off the fire), on a trip to the chest anyway, or fighting
 *  the goblins or their chief (a race to beat all three before they get back up, lost by leaving; rats he leaves). */
function busyWithNeeds(state: GameState, layout: Layout): boolean {
  const p = state.player, k = p.task.kind;
  if (k === 'sleep' || k === 'knockedOut' || k === 'make' || p.stoke || p.cook || p.trip) return true;
  const fight = p.task.kind === 'fight' ? p.task.target : p.pending?.kind === 'fight' ? p.pending.id : null;
  const foe = fight ? foeKind(layout, fight) : null;
  return foe === 'goblin' || foe === 'chief';
}

/** The in-game time tonight's nightfall came (STOKE.at). */
const nightfall = (time: number) => (nightOf(time) + STOKE.at) * DAY_SECONDS;

/** Whether his job is under way (set and not paused): whatever the player last sent him to do is done then, so a meal
 *  or bed that waited for it is due. */
const jobOn = (state: GameState) => !!state.job && !state.job.paused;

/** `visited`: the building or built thing he reached this step, unless stoking or cooking saw to it. `down`: he was
 *  asleep or knocked out when the step began (waking hungry with nothing to eat, he says so). Returns whether this saw
 *  to that visit (reaching the chest for a meal), so hauling doesn't empty the backpack there again. */
export function updateNeeds(state: GameState, layout: Layout, dt: number, visited: string | null, events: EventBus, down = false): boolean {
  if (!layout.camp) return false;
  const p = state.player, n = state.needs, k = p.task.kind;
  const wasHungry = isHungry(state);
  if (hungerStarted(state)) n.fullness = Math.max(0, n.fullness - HUNGER_PER_SECOND * dt);
  const awake = k !== 'sleep' && k !== 'knockedOut', mealHere = !!n.meal && visited === 'chest';
  // up again (at dawn, or never got there): back to what he was doing at bedtime (his job, if that was all: jobs.ts);
  // first, so waking hungry he sees to that before his job takes him back
  if (n.bed && k !== 'sleep' && !goingTo(state, 'shelter')) {
    const back = n.bed.back;
    n.bed = null;
    if (back && !isNight(state.time) && k === 'idle' && !p.pending && !p.path.length) backToWork(state, layout, back, events);
  }
  // hungry: food on him, he eats it at once; none, beside the chest with food in it, he eats from the chest (on a meal
  // trip once he reaches it; not the moment he reaches it on another errand: hauling empties the backpack there first,
  // and he eats a moment later)
  if (isHungry(state) && awake) {
    if (carriesFood(state)) eatUp(state, events);
    else if (chestFood(state, layout) > 0 && besideChest(state, layout) && (n.meal ? mealHere : visited !== 'chest')) eatAtChest(state, events);
    else if ((!wasHungry || down) && nothingToEat(state, layout)) events.emit({ type: 'hungry' });
  }
  // the meal trip: at the chest he has eaten (above), and goes back to what he was doing; one that is off track
  // (stoking the fire took him on the way) is over
  if (mealHere) {
    const back = n.meal!.back;
    n.meal = null;
    if (back) backToWork(state, layout, back, events);
    return true;
  }
  if (n.meal && (!goingTo(state, 'chest') || p.stoke)) n.meal = null;
  // he looks for a way to the chest for food, or to bed, every NEEDS_RETRY seconds (retryNow); idle with a job set, at
  // once: his job would take him back to it this very step (systems/jobs.ts runs next), and a look that finds no way
  // can't repeat, as the job then takes him
  const due = (isIdle(state) && !!state.job) || retryNow(state.time, dt);
  // hungry with no food on him but some in the chest: off to the chest, from whatever he does unless something keeps
  // him (busyWithNeeds), or the player sent him somewhere since he got hungry (then once that's done: he is idle, or
  // back at his job)
  if (isHungry(state) && awake && !n.meal && !carriesFood(state) && chestFood(state, layout) > 0 && !busyWithNeeds(state, layout) && !goingTo(state, 'chest')
    && (isIdle(state) || jobOn(state) || n.sentAt < hungrySince(state)) && due) {
    const back = isIdle(state) || goingTo(state, 'shelter') ? null : backOf(state);
    if (goVisit(state, layout, 'chest')) { n.meal = { back }; n.bed = null; p.trip = null; events.emit({ type: 'mealOff' }); }
  }
  // to bed by himself at night, once the fire has been seen to, with the shelter standing (sent somewhere since
  // nightfall, once that's done: he is idle, or back at his job)
  if (!n.bed && !n.meal && canSleep(state, layout) && isNight(state.time) && !busyWithNeeds(state, layout) && !goingTo(state, 'shelter')
    && state.stokedNight >= nightOf(state.time) && !state.stokeAgain && (isIdle(state) || jobOn(state) || n.sentAt < nightfall(state.time)) && due) {
    const back = isIdle(state) ? null : backOf(state);
    if (goToBed(state, layout)) { n.bed = { back }; events.emit({ type: 'bedtime' }); }
  }
  return false;
}
