// What he can fight (chapter 2, holding the camp, 0.0.22): for now the training dummy, once it stands at its site.
// Creatures (the rats, chunk C) join it later, with health of their own and a way of hitting back. A target says where
// it is, how big it is (for where he stands to strike it), how well it defends, what it teaches (XP for each point of
// damage) and up to which level. systems/combat.ts fights it; saves check that a fight still has something to fight.
import type { GameState } from './state';
import type { Layout, Vec2 } from '../world/layout';
import { siteOf } from '../world/layout';
import { DUMMY } from '../data/combat';
import { MAKES } from '../data/making';

/** name: what notices call it. radius: how far it reaches round its middle at striking height. defence, defenceBonus:
 *  its defence level and bonus, against his accuracy (OSRS). xp: XP for each point of damage to the style he trains.
 *  maxLevel: it teaches each style only up to this level (Infinity for no limit). */
export interface Target { id: string; name: string; pos: Vec2; radius: number; defence: number; defenceBonus: number; xp: number; maxLevel: number }

/** The target `id` as it is now, or null when there is nothing by that id to fight here: the training dummy ('dummy')
 *  once it is built in a layout that has its spot. */
export function targetOf(state: GameState, layout: Layout, id: string): Target | null {
  if (id === 'dummy') {
    const site = siteOf(layout, 'dummy');
    if (!site || !state.built.includes('dummy')) return null;
    return { id, name: MAKES.dummy.name, pos: site.pos, ...DUMMY };
  }
  return null;
}
