// Cooking at the campfire (chapter 2, holding the camp; numbers in data/cooking.ts): tapping the built campfire with
// raw fish, he walks to it and cooks them one after another, each over the flames for COOK.time seconds (Task 'cook'):
// it comes out cooked (Cooking XP) or now and then burnt, less often as his Cooking level rises. A raw fish is used up
// only once it comes off the fire, so nothing is lost when he is interrupted. He cooks the raw fish in his backpack;
// with none there but some in the chest, he fetches them from the chest first (as many as fit in his backpack; a full
// backpack is emptied into the chest first, as for stoking), then goes back to the fire. With none left anywhere he
// stops and says so. A command from the player stops it (systems/commands); at nightfall stoking the fire takes him
// away and he comes back to it after (Back { cook } in systems/fire.ts). It runs every step, so catching up (a
// background tab, or away time) cooks as playing does.
import type { GameState } from '../core/state';
import type { Goal } from '../data/goals';
import type { EventBus } from '../core/events';
import type { Rng } from '../core/rng';
import type { Layout } from '../world/layout';
import { siteOf } from '../world/layout';
import { goVisit } from '../actors/player';
import { COOK, burnChance } from '../data/cooking';
import { BACKPACK_SLOTS } from '../data/hauling';
import { backpackCount, deposit } from './backpack';
import { addXp, levelOf } from './skills';

/** Whether there is a fire to cook at: the campfire stands at this layout's fire spot (never in the village). */
export const canCook = (state: GameState, layout: Layout) => !!siteOf(layout, 'hearth') && state.built.includes('campfire');

/** Raw fish he carries. */
const carried = (state: GameState) => state.player.backpack[COOK.raw] ?? 0;

/** Raw fish in the storage chest, where it stands (none before it is built). */
const inChest = (state: GameState, layout: Layout) =>
  !!siteOf(layout, 'chest') && state.built.includes('chest') ? state.bank[COOK.raw] ?? 0 : 0;

/** Whether he has raw fish to cook, carried or in the chest. */
export const fishToCook = (state: GameState, layout: Layout) => carried(state) + inChest(state, layout) > 0;

/** Set off to cook: to the fire with the raw fish he carries, or with none, to the chest for them first. Returns false,
 *  with him as he was, when there is no way there. The caller checks there is a fire (canCook) and fish (fishToCook). */
export function goCook(state: GameState, layout: Layout): boolean {
  const fetch = carried(state) <= 0;
  if (!goVisit(state, layout, fetch ? 'chest' : 'campfire')) return false;
  state.player.cook = { fetch };
  return true;
}

/** Once he has caught enough raw fish for a goal that asks for cooked ones (goalHasEnough), he takes them to the fire
 *  by himself rather than stand idle. Returns whether he set off. */
export function cookForGoal(state: GameState, layout: Layout, goal: Goal): boolean {
  if (goal.needs[COOK.cooked] === undefined || !canCook(state, layout) || !fishToCook(state, layout)) return false;
  return goCook(state, layout);
}

/** Stop cooking: nothing left to cook (he says so), or no way to go on. */
function stop(state: GameState, events: EventBus, why: 'cookedAll' | 'noPath'): void {
  state.player.cook = null;
  events.emit({ type: why });
}

/** On to the next fish: the next one he carries goes over the fire, or with none left, to the chest for more, or with
 *  none there either, he is done. */
function next(state: GameState, layout: Layout, events: EventBus): void {
  const p = state.player;
  if (carried(state) > 0) { p.task = { kind: 'cook', doneAt: state.time + COOK.time }; return; }
  if (!inChest(state, layout)) { stop(state, events, 'cookedAll'); return; }
  if (!goCook(state, layout)) stop(state, events, 'noPath');
}

/** At the chest for raw fish: room made first if the backpack is full (it is emptied into the chest), then as many as
 *  fit taken out, and back to the fire. */
function fetchFish(state: GameState, layout: Layout, events: EventBus): void {
  const p = state.player;
  if (backpackCount(state) >= BACKPACK_SLOTS) deposit(state, events);
  const take = Math.min(inChest(state, layout), BACKPACK_SLOTS - backpackCount(state));
  if (take <= 0) { stop(state, events, 'cookedAll'); return; }
  const left = state.bank[COOK.raw]! - take;
  if (left > 0) state.bank[COOK.raw] = left; else delete state.bank[COOK.raw];
  p.backpack[COOK.raw] = carried(state) + take;
  p.cook = { fetch: false };
  if (!goVisit(state, layout, 'campfire')) stop(state, events, 'noPath');
}

/** One fish off the fire: cooked, with Cooking XP, or burnt, by the chance at his Cooking level. */
function cookOne(state: GameState, rng: Rng, events: EventBus): void {
  const pack = state.player.backpack;
  if (carried(state) <= 0) return;                    // dropped meanwhile: nothing came off the fire
  if (--pack[COOK.raw]! <= 0) delete pack[COOK.raw];
  const burnt = rng.next() < burnChance(levelOf(state, 'cooking')), out = burnt ? COOK.burnt : COOK.cooked;
  pack[out] = (pack[out] ?? 0) + 1;
  events.emit({ type: 'cooked', burnt });
  if (!burnt) addXp(state, 'cooking', COOK.xp, events);
}

/** `visited`: the building or built thing he reached this step (from updatePlayer), unless stoking saw to it. Returns
 *  whether this saw to that visit (reaching the chest for raw fish, or the fire to cook), so hauling doesn't empty the
 *  backpack at the chest in the same step. */
export function updateCooking(state: GameState, layout: Layout, visited: string | null, rng: Rng, events: EventBus): boolean {
  const p = state.player, cook = p.cook;
  if (!cook || p.stoke) return false;
  if (!canCook(state, layout)) { p.cook = null; if (p.task.kind === 'cook') p.task = { kind: 'idle' }; return false; }
  if (cook.fetch && visited === 'chest') { fetchFish(state, layout, events); return true; }
  if (!cook.fetch && visited === 'campfire') { next(state, layout, events); return true; }
  if (p.task.kind === 'cook') {
    if (state.time < p.task.doneAt) return false;
    p.task = { kind: 'idle' };
    cookOne(state, rng, events);
    next(state, layout, events);
    return false;
  }
  // on the way to the chest or the fire: carry on; anything else can't happen in play (commands stop cooking)
  if (p.pending?.kind !== 'visit' || p.pending.id !== (cook.fetch ? 'chest' : 'campfire')) p.cook = null;
  return false;
}
