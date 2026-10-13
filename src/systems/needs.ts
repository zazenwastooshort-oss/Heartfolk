// His needs at the camp (12 and 13 Oct 2026; the owner: "he eats when he needs to eat, he is doing his main job but
// then other needs require his attention as well, like eating, sleeping"; numbers in data/needs.ts and data/sleep.ts,
// what is saved in core/needs.ts).
// - Hunger: how full he is falls over game time, once food is part of his story (from the first goal about food, the
//   Berries goal: hungerStarted). Hungry, he eats at once from his backpack, the most filling food first, until he is
//   full; with none on him he walks to the storage chest, eats there, takes a few meals along (KEEP_FOOD) and goes back
//   to what he was doing (as after stoking the fire: Back). He never eats food the camp's current goal counts (the
//   owner: he leaves the goal's food alone): with only that, he stays hungry until there is food to spare. Never in the
//   middle of a fight (midFight; rats included): he eats once it is over (eating to heal during a fight goes on as
//   before, systems/rats.ts), and never leaves the goblin camp's fight for the chest. A meal trip waits while he is
//   asleep, knocked out, making something, stoking the fire, cooking, on a trip to the chest anyway, or walking
//   somewhere (he sets off once he gets there). With nothing to eat he says so (when he gets hungry, or wakes up
//   hungry) and works a little slower (hungerFactor) until he eats; never worse than that. Food he eats any other way
//   (a tap on Eat, eating when hurt in a fight) fills him too (systems/food.ts).
// - Bedtime: going to bed is a must every night once the shelter stands (the owner: "going to bed is mandatory, every
//   night ... at least 6 hours of sleep, you can set the time"). At his bedtime (Settings: 22:00 to 01:00) he leaves
//   what he does once he has finished the action he is in ("always finish the action before sending to bed": the
//   fight, the swing, the knock, the fish over the fire, making something, stoking the fire, a meal: core/needs.ts
//   midAction) and goes to bed in the shelter for 6 hours (systems/sleep.ts); then he gets up well rested and goes back
//   to what he was doing, or does what was tapped while he slept (the last thing: systems/commands.ts keeps it). Before
//   the shelter stands nothing changes: he works on through the night. While the game is closed (away time) he doesn't
//   go to bed: away work isn't cut by nights (the owner, 13 Oct 2026).
// Only at the camp. It runs every step, so a catch-up eats (and, open, sleeps) as playing does.
import { maxHealth, type GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout } from '../world/layout';
import { nightOf } from '../core/clock';
import { HUNGER_PER_SECOND, atGoblins, bedtimeNow, goalsFood, hungerStarted, isHungry, midAction, midFight, nothingToEat, spareFood } from '../core/needs';
import { chestHere } from '../core/camp';
import { HUNGER, NEEDS_RETRY } from '../data/needs';
import { FOOD } from '../data/food';
import { fill } from './food';
import { KEEP_FOOD } from '../data/hauling';
import { goVisit } from '../actors/player';
import { backpackFull, deposit } from './backpack';
import { backOf } from './fire';
import { backToWork } from './hauling';
import { goToBed } from './sleep';
import { besideChest } from './tools';
import { applyCommands } from './commands';

/** The foods, the most filling first. */
const FILLING_FIRST = Object.keys(FOOD).sort((a, b) => FOOD[b]!.fills - FOOD[a]!.fills);

/** Food he may eat that he carries (spare: not counted by the current goal). */
const carriesFood = (state: GameState) => FILLING_FIRST.some(f => (state.player.backpack[f] ?? 0) > 0 && spareFood(state, f) > 0);
/** Food he may eat in the storage chest, where it stands. */
const chestFood = (state: GameState, layout: Layout) => chestHere(state, layout) && FILLING_FIRST.some(f => (state.bank[f] ?? 0) > 0 && spareFood(state, f) > 0);
const goingTo = (state: GameState, id: string) => state.player.pending?.kind === 'visit' && state.player.pending.id === id;

/** He eats from his backpack until he is full (HUNGER.full) or has nothing more to spare, the most filling food first;
 *  each heals him as food does. `took`: food he has just taken out of the chest to take along, for the notice. */
function eatUp(state: GameState, events: EventBus, took?: Record<string, number>): void {
  const pack = state.player.backpack, n = state.needs, max = maxHealth(state), items: Record<string, number> = {};
  let fed = false;
  for (const food of FILLING_FIRST) {
    while (n.fullness < HUNGER.full && (pack[food] ?? 0) > 0 && spareFood(state, food) > 0) {
      if (--pack[food]! <= 0) delete pack[food];
      if (fill(state, food)) fed = true;
      state.health = Math.min(max, state.health + FOOD[food]!.heals);
      items[food] = (items[food] ?? 0) + 1;
    }
  }
  if (Object.keys(items).length) events.emit(took && Object.keys(took).length ? { type: 'meal', items, fullness: n.fullness, took } : { type: 'meal', items, fullness: n.fullness });
  if (fed) events.emit({ type: 'wellFed' });
}

/** Beside the chest, hungry with nothing to spare on him: out of the chest comes what he eats (the most filling first,
 *  food the goal doesn't count, as much as fits: a full backpack is emptied into the chest first) and a few meals to
 *  take along (KEEP_FOOD); then he eats. */
function eatAtChest(state: GameState, events: EventBus): void {
  if (backpackFull(state)) deposit(state, events);
  const pack = state.player.backpack, bank = state.bank, took: Record<string, number> = {};
  const take = (food: string) => { if (bank[food] === 1) delete bank[food]; else bank[food]!--; pack[food] = (pack[food] ?? 0) + 1; };
  let full = state.needs.fullness, along = FILLING_FIRST.reduce((a, f) => a + (pack[f] ?? 0), 0);
  for (const food of FILLING_FIRST) {
    let can = spareFood(state, food) - (pack[food] ?? 0);
    while (full < HUNGER.full && can > 0 && (bank[food] ?? 0) > 0 && !backpackFull(state)) { take(food); can--; full = Math.min(1, full + FOOD[food]!.fills); }
  }
  for (const food of FILLING_FIRST) {
    while (along < KEEP_FOOD && (bank[food] ?? 0) > 0 && !backpackFull(state)) { take(food); took[food] = (took[food] ?? 0) + 1; along++; }
  }
  eatUp(state, events, took);
}

/** Whether something keeps him from leaving what he does for a meal: asleep or on his way to bed, knocked out, making
 *  something (he finishes it), stoking the fire, cooking (a meal comes off the fire), on a trip to the chest anyway,
 *  walking somewhere (he goes once he gets there), in the middle of a fight, or at the goblin camp's fight. */
function busyForMeal(state: GameState, layout: Layout): boolean {
  const p = state.player, k = p.task.kind;
  return k === 'sleep' || k === 'knockedOut' || k === 'make' || k === 'walk' || !!p.stoke || !!p.cook || !!p.trip
    || !!state.needs.bed || midFight(state) || atGoblins(state, layout);
}

/** Whether something keeps him from going to bed at bedtime just yet: knocked out (he wakes first), making something,
 *  stoking the fire or a meal (each a moment), or in the middle of an action (midAction: the fight he is in, the swing,
 *  the knock, the fish over the fire; at the goblin camp the goblin he is fighting, not the race to their chief). */
function busyForBed(state: GameState, layout: Layout, dt: number): boolean {
  const p = state.player, k = p.task.kind;
  return k === 'sleep' || k === 'knockedOut' || k === 'make' || !!p.stoke || !!state.needs.meal || midAction(state, layout, dt);
}

/** `visited`: the building or built thing he reached this step, unless stoking or cooking saw to it. `down`: he was
 *  asleep or knocked out when the step began (waking hungry with nothing to eat, he says so). `away`: a catch-up of time
 *  the game was closed, when he doesn't go to bed. Returns whether this saw to that visit (reaching the chest for a
 *  meal), so hauling doesn't empty the backpack there again. */
export function updateNeeds(state: GameState, layout: Layout, dt: number, visited: string | null, events: EventBus, down = false, away = false): boolean {
  if (!layout.camp) return false;
  const p = state.player, n = state.needs;
  const wasHungry = isHungry(state);
  if (hungerStarted(state)) n.fullness = Math.max(0, n.fullness - HUNGER_PER_SECOND * dt);
  // up again (at his waking hour, or he never got there): what was tapped while he slept, else back to what he was doing
  // at bedtime; first, so waking hungry he eats on the way
  if (n.bed && p.task.kind !== 'sleep' && !goingTo(state, 'shelter')) {
    const { back } = n.bed, later = n.later;
    n.bed = null; n.later = null;
    if (p.task.kind === 'idle' && !p.pending && !p.path.length) {
      if (later) applyCommands(state, layout, [later], events);
      else if (back) backToWork(state, layout, back, events);
    }
  }
  const awake = p.task.kind !== 'sleep' && p.task.kind !== 'knockedOut', mealHere = !!n.meal && visited === 'chest';
  // hungry: food to spare on him, he eats it at once; none, beside the chest with some in it, he eats from the chest (on
  // a meal trip once he reaches it; not the moment he reaches it on another errand: hauling empties the backpack there
  // first, and he eats a moment later). Not in the middle of a fight
  if (isHungry(state) && awake && !midFight(state)) {
    if (carriesFood(state)) eatUp(state, events);
    else if (chestFood(state, layout) && besideChest(state, layout) && (n.meal ? mealHere : visited !== 'chest')) eatAtChest(state, events);
    else if ((!wasHungry || down) && nothingToEat(state)) { const keeps = goalsFood(state); events.emit(keeps ? { type: 'hungry', keeps } : { type: 'hungry' }); }
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
  const retry = state.time >= n.retryAt;
  // hungry with nothing to spare on him but some in the chest: off to the chest, unless something keeps him
  if (isHungry(state) && awake && retry && !n.meal && !carriesFood(state) && chestFood(state, layout) && !busyForMeal(state, layout) && !goingTo(state, 'chest')) {
    const back = backOf(state);
    if (goVisit(state, layout, 'chest')) { n.meal = { back }; p.trip = null; events.emit({ type: 'mealOff' }); }
    else n.retryAt = state.time + NEEDS_RETRY;
  }
  // bedtime: to bed in the shelter for a night's sleep, from whatever he does once nothing keeps him (never while the
  // game is closed)
  if (!away && retry && !n.bed && bedtimeNow(state, layout) && !busyForBed(state, layout, dt)) {
    const back = backOf(state), was = { task: p.task, path: p.path, pending: p.pending };
    if (goToBed(state, layout, back)) {
      p.trip = null; p.cook = null; state.stokeAgain = false;
      n.slept = nightOf(state.time);
      events.emit({ type: 'bedtime' });
    } else { p.task = was.task; p.path = was.path; p.pending = was.pending; n.retryAt = state.time + NEEDS_RETRY; }
  }
  return false;
}
