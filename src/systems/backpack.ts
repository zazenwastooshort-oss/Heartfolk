// The backpack and the bank: what the character carries, one item per slot (BACKPACK_SLOTS in data/hauling), and
// what the bank keeps. Gathering fills the backpack; it is emptied into the bank when he reaches the bank
// (systems/hauling decides when he goes). Where there is no bank yet (the camp) a full backpack is made room in by
// dropping things he can find again (canDrop).
import { canDrop, type GameState } from '../core/state';
import type { EventBus } from '../core/events';
import { BACKPACK_SLOTS } from '../data/hauling';

/** Slots in use. */
export const backpackCount = (state: GameState) => Object.values(state.player.backpack).reduce((a, n) => a + n, 0);
export const backpackFull = (state: GameState) => backpackCount(state) >= BACKPACK_SLOTS;

/** Put one item in the backpack; false (and nothing changes) when it is full. */
export function addToBackpack(state: GameState, item: string): boolean {
  if (backpackFull(state)) return false;
  const pack = state.player.backpack;
  pack[item] = (pack[item] ?? 0) + 1;
  return true;
}

/** Drop up to `count` of an item from the backpack; it is gone for good. Something he can't find again (canDrop: the
 *  wreck's planks and tarp) is refused, and he keeps it. Dropping takes no time and doesn't stop what he is doing. */
export function drop(state: GameState, item: string, count: number, events: EventBus): void {
  const pack = state.player.backpack, have = Object.hasOwn(pack, item) ? pack[item]! : 0;
  const n = Math.min(have, Math.floor(count));
  if (!(n > 0)) return;
  if (!canDrop(item)) { events.emit({ type: 'cantDrop', item }); return; }
  if (n === have) delete pack[item]; else pack[item] = have - n;
  events.emit({ type: 'dropped', item, count: n });
}

/** Use up `items` (item id: count), from the backpack first, then the bank. The caller checks they are all there
 *  (owned in core/state); whatever isn't there is skipped. */
export function useUp(state: GameState, items: Record<string, number>): void {
  for (const [item, n] of Object.entries(items)) {
    let left = n;
    for (const store of [state.player.backpack, state.bank]) {
      const have = Object.hasOwn(store, item) ? store[item]! : 0, take = Math.min(have, left);
      if (take <= 0) continue;
      if (take === have) delete store[item]; else store[item] = have - take;
      left -= take;
    }
  }
}

/** Empty the backpack into the bank and say what was banked, or that there was nothing to bank. */
export function deposit(state: GameState, events: EventBus): void {
  const items: Record<string, number> = {};
  for (const [item, n] of Object.entries(state.player.backpack)) {
    if (n > 0) { items[item] = n; state.bank[item] = (state.bank[item] ?? 0) + n; }
  }
  state.player.backpack = {};
  events.emit(Object.keys(items).length ? { type: 'banked', items } : { type: 'nothingToBank' });
}
