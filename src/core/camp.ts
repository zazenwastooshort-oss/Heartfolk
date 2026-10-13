// The camp's places, as everyone reads them (the camp build, 13 Oct 2026): whether there is a fire to cook at and fish
// to cook, where the backpack can be emptied (the village's banks, the camp's storage chest), and whether the fire is
// his to stoke. They lived in systems/ (cooking.ts, backpack.ts, fire.ts, which still offer them) and moved down here
// so that what the camp offers can be worked out without the simulation (the camp build's stage 5 builds the menu of
// things to do at a building from them). Until the camp build's stage 3 the chest still stands at its own spot beside
// the tent. Headless; changes nothing.
import type { GameState } from './state';
import type { Layout, Vec2 } from '../world/layout';
import { doorOf, siteOf } from '../world/layout';
import { COOK } from '../data/cooking';

/** Whether there is a fire to cook at: the campfire stands at this layout's fire spot (never in the village). */
export const canCook = (state: GameState, layout: Layout) => !!siteOf(layout, 'hearth') && state.built.includes('campfire');

/** Whether the storage chest stands at this layout's chest spot (never in the village, which has its bank). */
const chestBuilt = (state: GameState, layout: Layout) => !!siteOf(layout, 'chest') && state.built.includes('chest');

/** Raw fish in the storage chest, where it stands (none before it is built). */
export const fishInChest = (state: GameState, layout: Layout) => chestBuilt(state, layout) ? state.bank[COOK.raw] ?? 0 : 0;

/** Whether he has raw fish to cook, carried or in the chest. */
export const fishToCook = (state: GameState, layout: Layout) => (state.player.backpack[COOK.raw] ?? 0) + fishInChest(state, layout) > 0;

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

/** Whether the fire is his to stoke: the campfire stands, with the firewood pile or the storage chest to take logs from. */
export const canStoke = (state: GameState, layout: Layout) =>
  canCook(state, layout) && ((!!siteOf(layout, 'woodpile') && state.built.includes('woodpile')) || chestBuilt(state, layout));
