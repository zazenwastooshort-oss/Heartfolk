// The backpack and the bank: what the character carries, one item per slot (BACKPACK_SLOTS in data/hauling), and
// what is stored (GameState.bank): at the village's bank, or at the camp in the storage chest once it is built
// (0.0.19). Gathering fills the backpack; it is emptied into storage when he reaches the bank or the chest
// (systems/hauling decides when he goes). Where there is nowhere to store things yet (the camp before its chest) a
// full backpack is made room in by dropping things he can find again (canDrop); dropping always works.
import { canDrop, type GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout, Vec2 } from '../world/layout';
import { doorOf, siteOf } from '../world/layout';
import { BACKPACK_SLOTS, KEEP_FOOD } from '../data/hauling';
import { FOOD } from '../data/food';
import { STOKE, WOODPILE } from '../data/fire';

/** The places he can empty his backpack, by id, with where he stands to do it: each bank's door (the village), and
 *  the camp's storage chest once it stands ('chest', the id of what he built; he stands beside it). */
export function stores(state: GameState, layout: Layout): { id: string; pos: Vec2 }[] {
  const out = layout.buildings.filter(b => b.kind === 'bank').map(b => ({ id: b.id, pos: doorOf(b) }));
  const chest = siteOf(layout, 'chest');
  if (chest && state.built.includes('chest')) out.push({ id: 'chest', pos: chest.pos });
  return out;
}

/** Whether `id` (a building, or something he built) is somewhere to empty the backpack: a bank, or the built chest. */
export const isStore = (state: GameState, layout: Layout, id: string) => stores(state, layout).some(x => x.id === id);

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

/** Use up `items` (item id: count), from the backpack first, then the bank (the chest); or with `storedFirst`, from
 *  the bank (the chest) first, then the backpack. The caller checks they are all there (owned in core/state);
 *  whatever isn't there is skipped. */
export function useUp(state: GameState, items: Record<string, number>, storedFirst = false): void {
  for (const [item, n] of Object.entries(items)) {
    let left = n;
    for (const store of storedFirst ? [state.bank, state.player.backpack] : [state.player.backpack, state.bank]) {
      const have = Object.hasOwn(store, item) ? store[item]! : 0, take = Math.min(have, left);
      if (take <= 0) continue;
      if (take === have) delete store[item]; else store[item] = have - take;
      left -= take;
    }
  }
}

/** Empty the backpack into the bank (the chest) and say what was stored, or that there was nothing to store. */
export function deposit(state: GameState, events: EventBus): void {
  const items: Record<string, number> = {}, pack = state.player.backpack, kept: Record<string, number> = {};
  // a few meals stay on him (KEEP_FOOD), the food that heals most first
  let keep = KEEP_FOOD;
  for (const food of Object.keys(FOOD).sort((a, b) => FOOD[b]!.heals - FOOD[a]!.heals)) {
    const n = Math.min(keep, pack[food] ?? 0);
    if (n > 0) { kept[food] = n; keep -= n; }
  }
  for (const [item, n] of Object.entries(pack)) {
    const store = n - (kept[item] ?? 0);
    if (store > 0) { items[item] = store; state.bank[item] = (state.bank[item] ?? 0) + store; }
  }
  state.player.backpack = kept;
  events.emit(Object.keys(items).length ? { type: 'banked', items } : { type: 'nothingToBank' });
}

/** Stop stoking the fire (systems/fire.ts), when the player sends him elsewhere: the logs he carries go back where
 *  he took them from (the firewood pile, the chest, or his backpack), so nothing is lost. */
export function stopStoking(state: GameState): void {
  const stoke = state.player.stoke;
  if (!stoke) return;
  if (stoke.logs > 0) {
    if (stoke.from === 'woodpile') state.woodpile = Math.min(WOODPILE.max, state.woodpile + stoke.logs);
    else if (stoke.from === 'chest') state.bank[STOKE.item] = (state.bank[STOKE.item] ?? 0) + stoke.logs;
    else state.player.backpack[STOKE.item] = (state.player.backpack[STOKE.item] ?? 0) + stoke.logs;
  }
  state.player.stoke = null;
}
