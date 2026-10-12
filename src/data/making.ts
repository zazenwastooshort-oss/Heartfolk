// Things he makes (game 0.0.15), as tables only: what each needs, where it is made, how long he works at it and what
// it gives. The campfire is the first. The stone axe, the shelter, the stone pickaxe and the storage chest come in
// later updates, each a row here plus a goal in data/goals.ts that makes it. systems/making.ts does the work.
import type { ToolId } from './skills';

/** Places in a layout where something is built (siteOf in world/layout.ts): 'hearth' is the camp's fire spot. A new
 *  site (the tent's spot for the shelter, one for the storage chest) is a name here and a line in siteOf. */
export type SiteId = 'hearth';

export type MakeId = 'campfire';

/** name: what it is called ("Campfire"). verb: what making it is called, for the hover text over its site
 *  ("Build|Campfire") and the goal card's button ("Build the campfire").
 *  needs: the items it uses up, taken from his backpack first, then the bank.
 *  at: the site where it will stand (he works beside it), or 'here': made wherever he stands (a tool).
 *  time: seconds he works at it.
 *  gives: a structure, which stands at its site from then on (GameState.built) and is in the way like the village's
 *  hearth, or a tool he owns from then on (GameState.tools).
 *  done: the notice once it is made. */
export interface MakeDef {
  id: MakeId; name: string; verb: string;
  needs: Record<string, number>;
  at: SiteId | 'here';
  time: number;
  gives: { kind: 'structure' } | { kind: 'tool'; tool: ToolId };
  done: string;
}

export const MAKES: Record<MakeId, MakeDef> = {
  campfire: {
    id: 'campfire', name: 'Campfire', verb: 'Build', needs: { plank: 3, stone: 4 }, at: 'hearth', time: 4,
    gives: { kind: 'structure' }, done: 'Your campfire is lit. It will light up the camp at night.',
  },
};

/** How far beyond the edge of a site he stands while he builds there. */
export const BUILD_REACH = 0.6;

/** The row for `id`, or null for one that isn't in MAKES (yet). */
export const makeDef = (id: string): MakeDef | null => Object.hasOwn(MAKES, id) ? MAKES[id as MakeId] : null;
