// What he can fight (chapter 2, holding the camp, 0.0.22): the training dummy, once it stands at its site, and (part 2)
// the rats round the layout's nests (core/rats.ts), which have health of their own and hit back (systems/rats.ts). A
// target says where it is, how big it is (for where he stands to strike it), how well it defends, what it teaches (XP
// for each point of damage) and up to which level; a creature also says how its health stands and whether it is down.
// systems/combat.ts fights it; saves check that a fight still has something to fight.
import type { GameState } from './state';
import type { Layout, Vec2 } from '../world/layout';
import { siteOf } from '../world/layout';
import { DUMMY } from '../data/combat';
import { RAT } from '../data/rats';
import { MAKES } from '../data/making';
import { ratSpot } from './rats';

/** A creature that fights back (the rats): its health now and at most, and whether it is down (beaten, until it comes
 *  back at its nest: there is nothing to strike, and he waits by the nest, which is then where the target is). */
export interface Foe { kind: 'rat'; health: number; maxHealth: number; down: boolean }

/** name: what notices call it. radius: how far it reaches round its middle at striking height. defence, defenceBonus:
 *  its defence level and bonus, against his accuracy (OSRS). xp: XP for each point of damage to the style he trains.
 *  maxLevel: it teaches each style only up to this level (Infinity for no limit). foe: a creature that fights back. */
export interface Target { id: string; name: string; pos: Vec2; radius: number; defence: number; defenceBonus: number; xp: number; maxLevel: number; foe?: Foe }

/** The target `id` as it is now, or null when there is nothing by that id to fight here: the training dummy ('dummy')
 *  once it is built in a layout that has its spot; a rat ('rat1', ...) where the layout has it, up or down (a rat down
 *  is where its nest is, for waiting by it). */
export function targetOf(state: GameState, layout: Layout, id: string): Target | null {
  if (id === 'dummy') {
    const site = siteOf(layout, 'dummy');
    if (!site || !state.built.includes('dummy')) return null;
    return { id, name: MAKES.dummy.name, pos: site.pos, ...DUMMY };
  }
  const spot = ratSpot(layout, id), rat = spot && state.rats[id];
  if (!spot || !rat) return null;
  const down = rat.downUntil !== null;
  return {
    id, name: RAT.name, pos: down ? spot.nest.pos : rat.pos, radius: down ? spot.nest.radius : RAT.radius,
    defence: RAT.defence, defenceBonus: RAT.defenceBonus, xp: RAT.xp, maxLevel: Infinity,
    foe: { kind: 'rat', health: rat.health, maxHealth: RAT.health, down },
  };
}

/** What the hover over something to fight calls it ("Practise on|Training dummy", "Fight|Rat"), or null. */
export function fightLabel(layout: Layout, id: string): string | null {
  if (id === 'dummy') return `Practise on|${MAKES.dummy.name}`;
  return ratSpot(layout, id) ? `Fight|${RAT.name}` : null;
}
