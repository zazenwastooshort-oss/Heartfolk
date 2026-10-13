// Things he makes (game 0.0.15), as tables only: what each needs, where it is made, how long he works at it and what it
// gives. The campfire came first, then the stone axe (0.0.16), then the shelter at the tent's spot and the stone
// pickaxe (0.0.18), then the storage chest (0.0.19; since the camp build furniture in the shelter, by its door), the
// camp's storage like the village's bank, and the firewood pile beside the fire (0.0.21), stacked with logs he stokes
// the fire from at night. Chapter 2 (0.0.22): the training dummy beside the camp, the stone club, his first weapon,
// which he wears (gear: data/combat.ts), and the fishing rod, made where he stands. systems/making.ts does the work for
// what is made where he stands; since the camp build (13 Oct 2026) everything built at the camp's spots goes up in
// stages over its `time` instead, training Carpentry (data/building.ts STAGED, systems/building.ts).
import type { ToolId } from './skills';
import type { GearId } from './combat';

/** Places in a layout where something is built (siteOf in world/layout.ts): 'hearth' is the camp's fire spot, 'tent'
 *  the camp's tent spot (the shelter, and since the camp build the storage chest in it: it has no spot of its own any
 *  more), 'woodpile' the spot beside the fire for the firewood pile, 'dummy' the training dummy's spot beside the camp
 *  (0.0.22). A new site is a name here and a line in siteOf. Each thing built at a spot, and each of its upgrades, has
 *  its own shape there (SHAPES in data/building.ts). */
export type SiteId = 'hearth' | 'tent' | 'woodpile' | 'dummy';

export type MakeId = 'campfire' | 'stone_axe' | 'woodpile' | 'shelter' | 'stone_pickaxe' | 'chest' | 'dummy' | 'stone_club' | 'rod'
  | 'hide_cap' | 'hide_vest' | 'hide_shield'
  // the camp's upgrades (the camp build, 13 Oct 2026), built in stages, training Carpentry (data/building.ts): the tent
  // becomes a wall tent, then a log cabin; the campfire a stone hearth; the firewood pile a woodshed
  | 'wall_tent' | 'log_cabin' | 'stone_hearth' | 'woodshed';

/** name: what it is called ("Campfire"). verb: what making it is called, for the hover text over its site
 *  ("Build|Campfire") and the goal card's button ("Build the campfire", "Make the stone axe").
 *  needs: the items it uses up, taken from his backpack first, then the bank (something built in stages: when he begins
 *  it; something made where he stands: when it is made).
 *  at: the site where it will stand (he works beside it), or 'here': made wherever he stands (a tool). Every spot is
 *  fixed (the owner, 13 Oct 2026: "sure, fixed location"). The storage chest is at the tent's spot: it stands in the
 *  shelter, by its door (SHAPES' chest in data/building.ts), and he builds it from the door.
 *  time: seconds he works at it (something built in stages: at Carpentry level 1; a little less at higher levels, D5).
 *  The brief's first proposal (13 Oct 2026, tunable): campfire 20 s, firewood pile 25, training dummy 40, storage chest
 *  45, tent 60, wall tent 2 minutes, log cabin 4, stone hearth and woodshed 90 s each.
 *  gives: a structure, which stands at its site from then on (GameState.built) and is in the way like the village's
 *  hearth, or a tool he owns from then on (GameState.tools), or (0.0.22) gear he wears from then on (GameState.equipment;
 *  GEAR in data/combat.ts). Each is made once: a tool he already owns (the village's axe and pick, or an old camp
 *  save's), or gear he wears, isn't made again.
 *  done: the notice once it is made.
 *  pile: the item it needs isn't used up but stacked in it once it stands (the firewood pile's logs: GameState.woodpile;
 *  taken when he begins it, like anything built in stages, and stacked when it is built). */
export interface MakeDef {
  id: MakeId; name: string; verb: string;
  needs: Record<string, number>;
  at: SiteId | 'here';
  time: number;
  gives: { kind: 'structure' } | { kind: 'tool'; tool: ToolId } | { kind: 'gear'; gear: GearId };
  done: string;
  pile?: string;
}

export const MAKES: Record<MakeId, MakeDef> = {
  campfire: {
    id: 'campfire', name: 'Campfire', verb: 'Build', needs: { plank: 3, stone: 4 }, at: 'hearth', time: 20,
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
    id: 'woodpile', name: 'Firewood pile', verb: 'Stack', needs: { birch_logs: 10 }, at: 'woodpile', time: 25,
    gives: { kind: 'structure' }, done: 'Your firewood pile is stacked by the fire. At nightfall he stokes the fire from it.',
    pile: 'birch_logs',
  },
  // the tarp over a frame of logs, the planks for a floor, at the tent's spot facing the fire: a tent, the first of the
  // camp's shelters (its goal is still "A shelter"; the wall tent and the log cabin come after it)
  shelter: {
    id: 'shelter', name: 'Tent', verb: 'Build', needs: { tarp: 1, plank: 4, birch_logs: 10 }, at: 'tent', time: 60,
    gives: { kind: 'structure' }, done: 'Your tent is up. Somewhere dry to sleep at last.',
  },
  // like the axe, with a heavier, pointed stone for breaking rock
  stone_pickaxe: {
    id: 'stone_pickaxe', name: 'Stone pickaxe', verb: 'Make', needs: { branch: 2, stone: 3 }, at: 'here', time: 3,
    gives: { kind: 'tool', tool: 'pick' }, done: 'You made a stone pickaxe.',
  },
  // a box of split logs with copper straps, in the shelter by its door (the owner, 13 Oct 2026: "maybe chest is just
  // furniture in the tent or house"): the camp's storage (systems/hauling: a full backpack is emptied into it at the
  // shelter's door, as at the village's bank)
  chest: {
    id: 'chest', name: 'Storage chest', verb: 'Build', needs: { birch_logs: 10, copper_ore: 3 }, at: 'tent', time: 45,
    gives: { kind: 'structure' }, done: 'Your storage chest is built, just inside the tent. A full backpack is emptied into it now.',
  },
  // chapter 2 (0.0.22): a post and crossbar of logs with a stuffed sack for a body, beside the camp; once he has a
  // weapon, tapping it sends him to practise on it (systems/combat.ts)
  dummy: {
    id: 'dummy', name: 'Training dummy', verb: 'Build', needs: { birch_logs: 6, branch: 4 }, at: 'dummy', time: 40,
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
  // the camp's upgrades (the camp build, 13 Oct 2026): built in stages over `time`, training Carpentry (data/building.ts,
  // systems/building.ts), like the camp's first five above, each in place of the step before it at that step's spot,
  // bigger. What each needs is taken when he begins it. The Build list has them once the thing they upgrade and the
  // storage chest stand.
  // a squared timber frame round the old tent's canvas, a raised plank floor, a porch, guy ropes and a stovepipe
  wall_tent: {
    id: 'wall_tent', name: 'Wall tent', verb: 'Build', needs: { birch_logs: 12, fibre: 8 }, at: 'tent', time: 120,
    gives: { kind: 'structure' }, done: 'Your wall tent is up: a proper frame, a plank floor and a porch. He sleeps better in it.',
  },
  // round notched logs, a loft, a stone chimney and a covered porch, in place of the wall tent
  log_cabin: {
    id: 'log_cabin', name: 'Log cabin', verb: 'Build', needs: { birch_logs: 30, clay: 10, stone: 12 }, at: 'tent', time: 240,
    gives: { kind: 'structure' }, done: 'Your log cabin is built. Thick walls and a warm chimney: he sleeps best of all here.',
  },
  // a raised ring of stones round the fire, a spit with fish over it and log seats, in place of the campfire
  stone_hearth: {
    id: 'stone_hearth', name: 'Stone hearth', verb: 'Build', needs: { stone: 12, clay: 4 }, at: 'hearth', time: 90,
    gives: { kind: 'structure' }, done: 'Your stone hearth is built round the fire, with a spit and somewhere to sit.',
  },
  // a bark roof over the firewood, its logs stacked end on, and a chopping block, in place of the firewood pile
  woodshed: {
    id: 'woodshed', name: 'Woodshed', verb: 'Build', needs: { birch_logs: 10, bark: 6 }, at: 'woodpile', time: 90,
    gives: { kind: 'structure' }, done: 'Your woodshed is built. The firewood stays dry under its roof.',
  },
};

/** How far beyond the ring of something round built at a spot (the campfire, the training dummy: data/building.ts
 *  SHAPES' reach, no stands of their own) he stands to build it or use it, on whichever side is nearest. Everything
 *  with corners has its own stands (SHAPES' stands), and the storage chest is used at the shelter's door. */
export const BUILD_REACH = 0.6;

/** The row for `id`, or null for one that isn't in MAKES (yet). */
export const makeDef = (id: string): MakeDef | null => Object.hasOwn(MAKES, id) ? MAKES[id as MakeId] : null;
