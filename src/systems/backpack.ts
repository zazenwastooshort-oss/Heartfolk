// The backpack and the bank: what the character carries, one item per slot (BACKPACK_SLOTS in data/hauling), and
// what the bank keeps. Gathering fills the backpack; it is emptied into the bank when he reaches the bank
// (systems/hauling decides when he goes).
import type { GameState } from '../core/state';
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

/** Empty the backpack into the bank and say what was banked, or that there was nothing to bank. */
export function deposit(state: GameState, events: EventBus): void {
  const items: Record<string, number> = {};
  for (const [item, n] of Object.entries(state.player.backpack)) {
    if (n > 0) { items[item] = n; state.bank[item] = (state.bank[item] ?? 0) + n; }
  }
  state.player.backpack = {};
  events.emit(Object.keys(items).length ? { type: 'banked', items } : { type: 'nothingToBank' });
}
