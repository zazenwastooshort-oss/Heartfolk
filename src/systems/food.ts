// Eating (chapter 2, 0.0.22): food from his backpack heals him (FOOD in data/food.ts), never past his most
// (maxHealth). It takes no time: whatever he is doing carries on. Since 13 Oct 2026 it fills him too (his hunger,
// systems/needs.ts), and he may eat at full health while he is hungry.
import { maxHealth, type GameState } from '../core/state';
import type { EventBus } from '../core/events';
import { FED, FOOD, isFood } from '../data/food';
import { isHungry } from '../core/needs';

/** What eating one `item` does besides healing: it fills him (his hunger), and a cooked meal leaves him well fed for a
 *  while (FED: his XP comes a little quicker). Returns whether he has just become well fed (he wasn't already): the
 *  caller says so (`wellFed`) after telling what he ate. */
export function fill(state: GameState, item: string): boolean {
  state.needs.fullness = Math.min(1, state.needs.fullness + FOOD[item]!.fills);
  if (!FOOD[item]!.fed) return false;
  const was = state.time < state.fedUntil;
  state.fedUntil = state.time + FED.time;
  return !was;
}

/** Eat one `item` from his backpack. Refused, with `cantEat`, when it isn't food, he carries none, or his health is
 *  already full and he isn't hungry. */
export function eat(state: GameState, item: string, events: EventBus): boolean {
  const pack = state.player.backpack, max = maxHealth(state);
  const reason = !isFood(item) ? 'notFood' : !((pack[item] ?? 0) > 0) ? 'none' : state.health >= max && !isHungry(state) ? 'full' : null;
  if (reason) { events.emit({ type: 'cantEat', item, reason }); return false; }
  if (--pack[item]! <= 0) delete pack[item];
  const before = state.health;
  state.health = Math.min(max, state.health + FOOD[item]!.heals);
  const fed = fill(state, item);
  events.emit({ type: 'ate', item, healed: state.health - before, health: state.health });
  if (fed) events.emit({ type: 'wellFed' });
  return true;
}
