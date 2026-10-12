// Things he makes (game 0.0.15), as tables only: what each needs, where it is made, how long he works at it and what
// it gives. The campfire came first, then the stone axe (0.0.16), then the shelter at the tent's spot and the stone
// pickaxe (0.0.18), then the storage chest beside the shelter (0.0.19), the camp's storage like the village's bank,
// and the firewood pile beside the fire (0.0.21), stacked with logs he stokes the fire from at night. Chapter 2 (0.0.22):
// the training dummy beside the camp, the stone club, his first weapon, which he wears (gear: data/combat.ts), and the
// fishing rod, made where he stands. systems/making.ts does the work.
import type { ToolId } from './skills';
import type { GearId } from './combat';

/** Places in a layout where something is built (siteOf in world/layout.ts): 'hearth' is the camp's fire spot, 'tent'
 *  the camp's tent spot, 'chest' the camp's chest spot beside the shelter, 'woodpile' the spot beside the fire for the
 *  firewood pile, 'dummy' the training dummy's spot beside the camp (0.0.22). A new site is a name here and a line in
 *  siteOf. */
export type SiteId = 'hearth' | 'tent' | 'chest' | 'woodpile' | 'dummy';

export type MakeId = 'campfire' | 'stone_axe' | 'woodpile' | 'shelter' | 'stone_pickaxe' | 'chest' | 'dummy' | 'stone_club' | 'rod'
  | 'hide_cap' | 'hide_vest' | 'hide_shield'
  // built in stages, training Carpentry (data/building.ts): placed where the player puts them, or the shelter's upgrades
  | 'log_bench' | 'workbench' | 'lean_to' | 'log_hut';

/** name: what it is called ("Campfire"). verb: what making it is called, for the hover text over its site
 *  ("Build|Campfire") and the goal card's button ("Build the campfire", "Make the stone axe").
 *  needs: the items it uses up, taken from his backpack first, then the bank.
 *  at: the site where it will stand (he works beside it), or 'here': made wherever he stands (a tool), or 'placed': where
 *  the player puts it down (the Build list; GameState.placed), built there in stages (data/building.ts).
 *  time: seconds he works at it.
 *  gives: a structure, which stands at its site from then on (GameState.built) and is in the way like the village's
 *  hearth, or a tool he owns from then on (GameState.tools), or (0.0.22) gear he wears from then on (GameState.equipment;
 *  GEAR in data/combat.ts). Each is made once: a tool he already owns (the village's axe and pick, or an old camp
 *  save's), or gear he wears, isn't made again.
 *  done: the notice once it is made.
 *  pile: the item it needs isn't used up but stacked in it (the firewood pile's logs: GameState.woodpile). */
export interface MakeDef {
  id: MakeId; name: string; verb: string;
  needs: Record<string, number>;
  at: SiteId | 'here' | 'placed';
  time: number;
  gives: { kind: 'structure' } | { kind: 'tool'; tool: ToolId } | { kind: 'gear'; gear: GearId };
  done: string;
  pile?: string;
}

export const MAKES: Record<MakeId, MakeDef> = {
  campfire: {
    id: 'campfire', name: 'Campfire', verb: 'Build', needs: { plank: 3, stone: 4 }, at: 'hearth', time: 4,
    gives: { kind: 'structure' }, done: 'Your campfire is lit. It will light up the camp at night.',
  },
  // a branch for the handle, a stone knocked into a head, lashed together where he stands
  stone_axe: {
    id: 'stone_axe', name: 'Stone axe', verb: 'Make', needs: { branch: 2, stone: 2 }, at: 'here', time: 3,
    gives: { kind: 'tool', tool: 'axe' }, done: 'You made a stone axe.',
  },
  // logs stacked on two bearers beside the fire: at night he stokes the fire from it (systems/fire.ts), and a tap on it
  // stacks the logs he carries on it
  woodpile: {
    id: 'woodpile', name: 'Firewood pile', verb: 'Stack', needs: { birch_logs: 10 }, at: 'woodpile', time: 4,
    gives: { kind: 'structure' }, done: 'Your firewood pile is stacked by the fire. At nightfall he stokes the fire from it.',
    pile: 'birch_logs',
  },
  // the tarp over a frame of logs, the planks for a floor, at the tent's spot facing the fire
  shelter: {
    id: 'shelter', name: 'Shelter', verb: 'Build', needs: { tarp: 1, plank: 4, birch_logs: 10 }, at: 'tent', time: 6,
    gives: { kind: 'structure' }, done: 'Your shelter is up. Somewhere dry to sleep at last.',
  },
  // like the axe, with a heavier, pointed stone for breaking rock
  stone_pickaxe: {
    id: 'stone_pickaxe', name: 'Stone pickaxe', verb: 'Make', needs: { branch: 2, stone: 3 }, at: 'here', time: 3,
    gives: { kind: 'tool', tool: 'pick' }, done: 'You made a stone pickaxe.',
  },
  // a box of split logs with copper straps, beside the shelter: the camp's storage (systems/hauling: a full backpack is
  // emptied into it, as at the village's bank)
  chest: {
    id: 'chest', name: 'Storage chest', verb: 'Build', needs: { birch_logs: 10, copper_ore: 3 }, at: 'chest', time: 5,
    gives: { kind: 'structure' }, done: 'Your storage chest is built. A full backpack is emptied into it now.',
  },
  // chapter 2 (0.0.22): a post and crossbar of logs with a stuffed sack for a body, beside the camp; once he has a
  // weapon, tapping it sends him to practise on it (systems/combat.ts)
  dummy: {
    id: 'dummy', name: 'Training dummy', verb: 'Build', needs: { birch_logs: 6, branch: 4 }, at: 'dummy', time: 5,
    gives: { kind: 'structure' }, done: 'Your training dummy stands ready. Make a weapon, then tap the dummy to practise.',
  },
  // his first weapon: a heavy branch with a round stone lashed on, made where he stands like the stone tools; he wears
  // it (GEAR in data/combat.ts) and swings it like the axe
  stone_club: {
    id: 'stone_club', name: 'Stone club', verb: 'Make', needs: { branch: 2, stone: 2 }, at: 'here', time: 3,
    gives: { kind: 'gear', gear: 'stone_club' }, done: 'You made a stone club. Tap the training dummy to practise with it.',
  },
  // chapter 2: long branches bound end to end, the line threads pulled from the tarp's frayed edge, so branches are all
  // it uses up; made where he stands, like the stone tools
  rod: {
    id: 'rod', name: 'Fishing rod', verb: 'Make', needs: { branch: 3 }, at: 'here', time: 3,
    gives: { kind: 'tool', tool: 'rod' }, done: "You made a fishing rod, its line pulled from the tarp's frayed edge.",
  },
  // chapter 2, hide armour (chunk D): rat hides stitched together where he stands, like the club; he puts each piece on
  // as it is made (GEAR in data/combat.ts: defence, so he is harder to hit). 9 hides in all, for rats that drop one
  // about half the time; the shield's frame is branches
  hide_cap: {
    id: 'hide_cap', name: 'Hide cap', verb: 'Make', needs: { rat_hide: 2 }, at: 'here', time: 3,
    gives: { kind: 'gear', gear: 'hide_cap' }, done: 'You made a hide cap and put it on. A little harder to hit now.',
  },
  hide_vest: {
    id: 'hide_vest', name: 'Hide vest', verb: 'Make', needs: { rat_hide: 4 }, at: 'here', time: 4,
    gives: { kind: 'gear', gear: 'hide_vest' }, done: 'You made a hide vest and put it on. Even harder to hit now.',
  },
  hide_shield: {
    id: 'hide_shield', name: 'Hide shield', verb: 'Make', needs: { rat_hide: 3, branch: 2 }, at: 'here', time: 4,
    gives: { kind: 'gear', gear: 'hide_shield' }, done: 'You made a hide shield and strapped it to your arm. Your hide armour is all on.',
  },
  // built in stages over `time`, training Carpentry (data/building.ts, systems/building.ts): the Build list has them
  // once the camp is set up. What each needs is taken when he starts on it. A log bench and a workbench go where the
  // player places them; the lean-to and then the log hut go up at the tent's spot, in place of the shelter before
  log_bench: {
    id: 'log_bench', name: 'Log bench', verb: 'Build', needs: { birch_logs: 4, branch: 2 }, at: 'placed', time: 30,
    gives: { kind: 'structure' }, done: 'Your log bench is built. A good spot to sit by the fire.',
  },
  workbench: {
    id: 'workbench', name: 'Workbench', verb: 'Build', needs: { birch_logs: 6, fibre: 4 }, at: 'placed', time: 45,
    gives: { kind: 'structure' }, done: 'Your workbench is built. Carpentry will be done here one day.',
  },
  lean_to: {
    id: 'lean_to', name: 'Lean-to', verb: 'Build', needs: { birch_logs: 8, bark: 6, fibre: 6 }, at: 'tent', time: 90,
    gives: { kind: 'structure' }, done: 'Your lean-to is built where the tent stood. Snug and dry: he sleeps better now.',
  },
  log_hut: {
    id: 'log_hut', name: 'Log hut', verb: 'Build', needs: { birch_logs: 20, clay: 10 }, at: 'tent', time: 180,
    gives: { kind: 'structure' }, done: 'Your log hut is built. Real walls at last: he sleeps best of all now.',
  },
};

/** How far beyond the edge of a site he stands while he builds there. */
export const BUILD_REACH = 0.6;

/** The row for `id`, or null for one that isn't in MAKES (yet). */
export const makeDef = (id: string): MakeDef | null => Object.hasOwn(MAKES, id) ? MAKES[id as MakeId] : null;
