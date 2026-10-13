// Eating (chapter 2, 0.0.22): food from his backpack heals him (FOOD in data/food.ts), never past his most
// (maxHealth). It takes no time: whatever he is doing carries on. Since 13 Oct 2026 it fills him too (his hunger,
// systems/needs.ts), and he may eat at full health while he is hungry.
import { maxHealth, type GameState } from '../core/state';
import type { EventBus } from '../core/events';
import { FOOD, isFood } from '../data/food';
import { isHungry } from '../core/needs';

/** Eat one `item` from his backpack. Refused, with `cantEat`, when it isn't food, he carries none, or his health is
 *  already full and he isn't hungry. */
export function eat(state: GameState, item: string, events: EventBus): boolean {
  const pack = state.player.backpack, max = maxHealth(state);
  const reason = !isFood(item) ? 'notFood' : !((pack[item] ?? 0) > 0) ? 'none' : state.health >= max && !isHungry(state) ? 'full' : null;
  if (reason) { events.emit({ type: 'cantEat', item, reason }); return false; }
  if (--pack[item]! <= 0) delete pack[item];
  const before = state.health;
  state.health = Math.min(max, state.health + FOOD[item]!.heals);
  state.needs.fullness = Math.min(1, state.needs.fullness + FOOD[item]!.fills);
  events.emit({ type: 'ate', item, healed: state.health - before, health: state.health });
  return true;
}
