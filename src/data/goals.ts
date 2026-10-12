// The goals that take a new player from washing up below the falls to a working camp (12 Oct 2026), in order. Each
// asks for things he has: items carried or banked, and 'book' (BOOK), which counts 1 once he has found his book
// (GameState.hasBook). A goal finished stays finished (GameState.goalsDone, since 0.0.15), so using things up for the
// next one never sends the card back. Gathering goals finish once their needs are all there; making goals (`makes`)
// once the thing is made (a tool once he owns it: an old save that kept its axe and pick has the stone axe and stone
// pickaxe goals done). The goal card shows the first goal not finished. Since 0.0.18: salvage, the campfire, the
// stone axe, firewood (since 0.0.21 a pile stacked beside the fire), the shelter, the stone pickaxe, copper ore, then
// the storage chest (built since 0.0.19); chapter 2 adds food: berries, a fishing rod, fish and a cooked meal. With
// all of them finished the camp is set up: the card and the last page of his book say so (CAMP_DONE). Since 0.0.17
// each goal is a page in his book (core/book.ts, ui/book.ts), with a few words of its own (`page`).
import { MAKES } from './making';

/** needs: what it asks for (the goal card counts them). ready: what the card says once they are all there.
 *  page: what the goal's page in his book says, a sentence or two in the book's warm, plain voice.
 *  makes: for a making goal, the thing it makes (an id in MAKES, data/making.ts): it is finished once that is made,
 *  and with everything there the card offers to make it. A making goal whose thing isn't in MAKES yet (it comes in a
 *  later update) can't be finished, so the card waits on it with its `ready` text. */
export interface Goal { id: string; title: string; page: string; hint: string; ready: string; needs: Record<string, number>; makes?: string }

/** The key in `needs` for his book, which is not an item: it takes no backpack slot. */
export const BOOK = 'book';

export const GOALS: Goal[] = [
  { id: 'salvage', title: 'Salvage the wreck',
    page: 'Whatever washed up with you is all you have now. Gather it up and keep it close.',
    hint: 'Pick up what washed up along the bank.',
    ready: 'You have it all.', needs: { plank: 7, tarp: 1, [BOOK]: 1 } },
  { id: 'campfire', title: 'A fire for the night',
    page: 'First, a fire. It keeps the cold and the dark away, and makes anywhere feel a little like home.',
    hint: 'Gather stones from the ground.',
    ready: 'You have it all. Tap Build, or tap the fire spot.', needs: MAKES.campfire.needs, makes: 'campfire' },
  { id: 'stone_axe', title: 'A stone axe',
    page: "A sharp stone and a sturdy branch, bound together, make an axe. It needn't be pretty.",
    hint: 'Gather branches and stones from the ground.',
    ready: 'You have it all. Tap Make.', needs: MAKES.stone_axe.needs, makes: 'stone_axe' },
  { id: 'firewood', title: 'Firewood',
    page: "A fire is always hungry. Stack a pile of logs beside it, and at night you'll feed it from the pile.",
    hint: 'Tap a birch tree round the clearing to chop it.',
    ready: 'You have it all. Tap Stack, or tap the spot beside the fire.', needs: MAKES.woodpile.needs, makes: 'woodpile' },
  { id: 'shelter', title: 'A shelter',
    page: 'The torn tarp, a few planks and a frame of logs will keep the rain off. Somewhere dry to sleep at last.',
    hint: 'Chop birch trees for logs.',
    ready: 'You have it all. Tap Build, or tap the shelter spot by the fire.', needs: MAKES.shelter.needs, makes: 'shelter' },
  { id: 'stone_pickaxe', title: 'A stone pickaxe',
    page: 'A heavier stone with a point, lashed to a branch, will break rock. The boulders here hide more than moss.',
    hint: 'Gather branches and stones from the ground.',
    ready: 'You have it all. Tap Make.', needs: MAKES.stone_pickaxe.needs, makes: 'stone_pickaxe' },
  { id: 'copper', title: 'Copper ore',
    page: 'The green in those grey rocks is copper. Soft enough for a stone pick, and good for better tools one day.',
    hint: 'Tap a grey rock flecked with green to mine it.',
    ready: 'You have enough copper ore.', needs: { copper_ore: 3 } },
  { id: 'chest', title: 'A storage chest',
    page: 'Everything you own is on your back. A sturdy chest by the shelter will keep it safe, and logs in it keep the fire going at night.',
    hint: 'Chop birch trees for logs, and keep 3 copper ore. If your backpack is full, open it and drop some spare ore.',
    ready: 'You have it all. Tap Build, or tap the chest spot beside the shelter.', needs: MAKES.chest.needs, makes: 'chest' },
  // chapter 2, food (one block, to follow the combat goals once merged): berries by the camp, a rod, fish from the pool
  // and the river, then a meal cooked at the campfire
  { id: 'berries', title: 'Berries',
    page: 'Red berries grow on the bushes by the camp, and come back after you pick them. A handful will keep you going.',
    hint: 'Tap a berry bush by the camp to pick it.',
    ready: 'You have enough berries.', needs: { berries: 10 } },
  { id: 'rod', title: 'A fishing rod',
    page: "Fish rise in the pool below the falls. A few long branches make a rod, and the tarp's frayed edge gives thread for a line.",
    hint: 'Gather branches from the ground.',
    ready: 'You have it all. Tap Make.', needs: MAKES.rod.needs, makes: 'rod' },
  { id: 'fish', title: 'Fish',
    page: 'Stand on the bank where the water ripples, and cast your line. Be patient, and the fish will come.',
    hint: 'Tap the ripples in the pool or the river to fish.',
    ready: 'You have enough fish.', needs: { raw_fish: 5 } },
  { id: 'meal', title: 'A cooked meal',
    page: 'Cook your fish slowly over the fire. A few may burn at first, but you will soon get the knack of it.',
    hint: 'Tap the campfire to cook your fish. If some burn, catch a few more.',
    ready: 'You have a cooked meal.', needs: { cooked_fish: 5 } },
];

/** What the goal card says once every goal is finished (allGoalsDone in core/state), and the last page of his book
 *  under its words. */
export const CAMP_DONE = { title: 'Your camp', text: 'Your camp is set up. More comes in later updates.' };
