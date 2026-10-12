// Eating (chapter 2, 0.0.22): food from his backpack heals him (FOOD in data/food.ts), never past his most
// (maxHealth). It takes no time: whatever he is doing carries on.
import { maxHealth, type GameState } from '../core/state';
import type { EventBus } from '../core/events';
import { FOOD, isFood } from '../data/food';

/** Eat one `item` from his backpack. Refused, with `cantEat`, when it isn't food, he carries none, or his health is
 *  already full. */
export function eat(state: GameState, item: string, events: EventBus): boolean {
  const pack = state.player.backpack, max = maxHealth(state);
  const reason = !isFood(item) ? 'notFood' : !((pack[item] ?? 0) > 0) ? 'none' : state.health >= max ? 'full' : null;
  if (reason) { events.emit({ type: 'cantEat', item, reason }); return false; }
  if (--pack[item]! <= 0) delete pack[item];
  const before = state.health;
  state.health = Math.min(max, state.health + FOOD[item]!.heals);
  events.emit({ type: 'ate', item, healed: state.health - before, health: state.health });
  return true;
}
