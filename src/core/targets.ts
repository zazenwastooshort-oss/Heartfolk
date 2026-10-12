// What he can fight (chapter 2, holding the camp, 0.0.22): the training dummy, once it stands at its site, (part 2)
// the rats round the layout's nests (core/rats.ts), and (its last part) the goblins in the goblin camp and their chief
// once he is out of his tent (core/goblins.ts); creatures have health of their own and hit back (systems/rats.ts,
// systems/goblins.ts). A target says where it is, how big it is (for where he stands to strike it), how well it
// defends, what it teaches (XP for each point of damage) and up to which level; a creature also says how its health
// stands and whether it is down. systems/combat.ts fights it; saves check that a fight still has something to fight.
import type { GameState, GoblinState, RatState } from './state';
import type { Layout, Vec2 } from '../world/layout';
import { siteOf } from '../world/layout';
import { DUMMY } from '../data/combat';
import { RAT } from '../data/rats';
import { CHIEF, GOBLIN } from '../data/goblins';
import { MAKES } from '../data/making';
import { ratSpot, ratsOf } from './rats';
import { goblinNumbers, goblinSpot, goblinsOf } from './goblins';

/** A creature that fights back (a rat, a goblin, the goblin chief): its health now and at most, and whether it is down
 *  (beaten, until it comes back at its nest or in its camp: there is nothing to strike, and he waits by the nest or in
 *  the camp, which is then where the target is). */
export interface Foe { kind: 'rat' | 'goblin' | 'chief'; health: number; maxHealth: number; down: boolean }

/** name: what notices call it. radius: how far it reaches round its middle at striking height. defence, defenceBonus:
 *  its defence level and bonus, against his accuracy (OSRS). xp: XP for each point of damage to the style he trains.
 *  maxLevel: it teaches each style only up to this level (Infinity for no limit). foe: a creature that fights back.
 *  beside: he strikes it from beside it, east or west of it, so the camera as it starts (looking north) sees it next to
 *  him and never hidden behind him (the goblin chief, at the chapter's last fight; actors/player.ts goNear). */
export interface Target { id: string; name: string; pos: Vec2; radius: number; defence: number; defenceBonus: number; xp: number; maxLevel: number; foe?: Foe; beside?: boolean }

/** The target `id` as it is now, or null when there is nothing by that id to fight here: the training dummy ('dummy')
 *  once it is built in a layout that has its spot; a rat ('rat1', ...) where the layout has it, up or down (a rat down
 *  is where its nest is, for waiting by it); a goblin ('goblin1', ...) where the layout has a goblin camp not yet
 *  cleared, up or down (a goblin down is where it fell: he faces it as it topples, and waits there); the chief
 *  ('chief') once he is out of his tent, struck from beside him. */
export function targetOf(state: GameState, layout: Layout, id: string): Target | null {
  if (id === 'dummy') {
    const site = siteOf(layout, 'dummy');
    if (!site || !state.built.includes('dummy')) return null;
    return { id, name: MAKES.dummy.name, pos: site.pos, ...DUMMY };
  }
  const spot = ratSpot(layout, id), rat = spot && state.rats[id];
  if (spot && rat) {
    const down = rat.downUntil !== null;
    return {
      id, name: RAT.name, pos: down ? spot.nest.pos : rat.pos, radius: down ? spot.nest.radius : RAT.radius,
      defence: RAT.defence, defenceBonus: RAT.defenceBonus, xp: RAT.xp, maxLevel: Infinity,
      foe: { kind: 'rat', health: rat.health, maxHealth: RAT.health, down },
    };
  }
  const g = goblinSpot(layout, id), goblin = g && state.goblins[id];
  if (!g || !goblin || (g.chief && !state.goblinCamp.chiefOut)) return null;
  const n = goblinNumbers(g), down = goblin.downUntil !== null;
  return {
    id, name: n.name, pos: goblin.pos, radius: n.radius,
    defence: n.defence, defenceBonus: n.defenceBonus, xp: n.xp, maxLevel: Infinity,
    foe: { kind: g.chief ? 'chief' : 'goblin', health: goblin.health, maxHealth: n.health, down },
    ...(g.chief ? { beside: true } : {}),
  };
}

/** The creature `id` itself (a rat, a goblin, the chief), for what fighting does to its health; undefined for anything
 *  else. */
export const foeOf = (state: GameState, id: string): RatState | GoblinState | undefined => state.rats[id] ?? state.goblins[id];

/** What kind of creature this id is (a rat, a goblin, the goblin chief), whatever it is doing now; null for anything
 *  else. */
export function foeKind(layout: Layout, id: string): Foe['kind'] | null {
  if (ratSpot(layout, id)) return 'rat';
  const g = goblinSpot(layout, id);
  return g ? (g.chief ? 'chief' : 'goblin') : null;
}

/** What a creature by this id is called ("Rat", "Goblin", "Goblin chief"), whatever it is doing now; null for anything
 *  else. */
export function foeName(layout: Layout, id: string): string | null {
  const kind = foeKind(layout, id);
  return kind ? { rat: RAT, goblin: GOBLIN, chief: CHIEF }[kind].name : null;
}

/** Every creature the layout has, by id: its rats, then its goblins and their chief. */
export const foeIds = (layout: Layout): string[] => [...ratsOf(layout), ...goblinsOf(layout)].map(c => c.id);

/** What the hover over something to fight calls it ("Practise on|Training dummy", "Fight|Rat", "Fight|Goblin chief"), or
 *  null. */
export function fightLabel(layout: Layout, id: string): string | null {
  if (id === 'dummy') return `Practise on|${MAKES.dummy.name}`;
  const name = foeName(layout, id);
  return name ? `Fight|${name}` : null;
}
