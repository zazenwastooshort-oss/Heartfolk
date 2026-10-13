// The goals that take a new player from washing up below the falls to a working camp (12 Oct 2026), in order. Each
// asks for things he has: items carried or banked, and 'book' (BOOK), which counts 1 once he has found his book
// (GameState.hasBook). A goal finished stays finished (GameState.goalsDone, since 0.0.15), so using things up for the
// next one never sends the card back. Gathering goals finish once their needs are all there; making goals (`makes`)
// once the thing is made (a tool once he owns it: an old save that kept its axe and pick has the stone axe and stone
// pickaxe goals done). The goal card shows the first goal not finished. Since 0.0.18: salvage, the campfire, the
// stone axe, firewood (since 0.0.21 a pile stacked beside the fire), the shelter, the stone pickaxe, copper ore, then
// the storage chest (built since 0.0.19); chapter 2 adds food: berries, a fishing rod, fish and a cooked meal. With
// all of them finished the camp is set up: the card and the last page of his book say so (CAMP_DONE). Since 0.0.17
// each goal is a page in his book (core/book.ts; since 0.0.38 Information's Story, ui/info.ts), with a few words of its own (`page`). Chapter 2, holding
// the camp (0.0.22), goes on after the chest: a training dummy, a stone club (his first weapon), then practice on the
// dummy, a goal that asks for levels (`levels`) rather than things; after food, the rats in the woods (their hides),
// the hide armour, and last the goblin camp blocking the way down the river (the chief's torn map): the end of chapter 2.
import { MAKES } from './making';
import type { SkillId } from './skills';

/** needs: what it asks for (the goal card counts them). ready: what the card says once they are all there.
 *  page: what the goal's page in his book says, a sentence or two in the book's warm, plain voice.
 *  makes: for a making goal, the thing it makes (an id in MAKES, data/making.ts): it is finished once that is made,
 *  and with everything there the card offers to make it. A making goal whose thing isn't in MAKES yet (it comes in a
 *  later update) can't be finished, so the card waits on it with its `ready` text. Something built at the camp's spots
 *  goes up in stages (data/building.ts): once it is begun the goal counts as paid for (goalPaid in core/state.ts), its
 *  lines stay ticked while he builds, and its marker (the spot it goes, which shows only while its goal is up) gives
 *  way to its footings.
 *  levels (0.0.22): skill levels it asks for as well, by skill; the card and the book show "Attack level 2 / 3". */
export interface Goal {
  id: string; title: string; page: string; hint: string; ready: string; needs: Record<string, number>; makes?: string;
  levels?: Partial<Record<SkillId, number>>;
}

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
    ready: 'You have it all. Tap Build, or tap the marker at the fire spot.', needs: MAKES.campfire.needs, makes: 'campfire' },
  { id: 'stone_axe', title: 'A stone axe',
    page: "A sharp stone and a sturdy branch, bound together, make an axe. It needn't be pretty.",
    hint: 'Gather branches and stones from the ground.',
    ready: 'You have it all. Tap Make.', needs: MAKES.stone_axe.needs, makes: 'stone_axe' },
  { id: 'firewood', title: 'Firewood',
    page: "A fire is always hungry. Stack a pile of logs beside it, and at night you'll feed it from the pile.",
    hint: 'Tap a birch tree round the clearing to chop it.',
    ready: 'You have it all. Tap Stack, or tap the marker beside the fire.', needs: MAKES.woodpile.needs, makes: 'woodpile' },
  { id: 'shelter', title: 'A shelter',
    page: 'The torn tarp, a few planks and a frame of logs will keep the rain off. Somewhere dry to sleep at last.',
    hint: 'Chop birch trees for logs.',
    ready: 'You have it all. Tap Build, or tap the marker by the fire.', needs: MAKES.shelter.needs, makes: 'shelter' },
  { id: 'stone_pickaxe', title: 'A stone pickaxe',
    page: 'A heavier stone with a point, lashed to a branch, will break rock. The boulders here hide more than moss.',
    hint: 'Gather branches and stones from the ground.',
    ready: 'You have it all. Tap Make.', needs: MAKES.stone_pickaxe.needs, makes: 'stone_pickaxe' },
  { id: 'copper', title: 'Copper ore',
    page: 'The green in those grey rocks is copper. It is no use until it is smelted, one day, in a fire far hotter than a campfire.',
    hint: 'Tap a grey rock flecked with green to mine it.',
    ready: 'You have enough copper ore.', needs: { copper_ore: 3 } },
  { id: 'chest', title: 'A storage chest',
    page: 'Everything you own is on your back. A sturdy chest in the shelter will keep it safe, and logs in it keep the fire going at night.',
    hint: 'Chop birch trees for logs. If your backpack is full, open it and drop what you can spare.',
    ready: 'You have it all. Tap Build, or tap the marker in the shelter.', needs: MAKES.chest.needs, makes: 'chest' },
  // chapter 2, holding the camp (0.0.22)
  { id: 'dummy', title: 'A training dummy',
    page: "The woods won't stay quiet forever. A dummy of logs and sacking is a safe place to learn to fight.",
    hint: 'Chop birch trees for logs, and gather branches from the ground.',
    ready: 'You have it all. Tap Build, or tap the marker beside the camp.', needs: MAKES.dummy.needs, makes: 'dummy' },
  { id: 'stone_club', title: 'A stone club',
    page: 'A heavy branch with a round stone lashed to its end. Nothing fancy, but it hits hard.',
    hint: 'Gather branches and stones from the ground.',
    ready: 'You have it all. Tap Make.', needs: MAKES.stone_club.needs, makes: 'stone_club' },
  { id: 'practice', title: 'Practice',
    page: 'Swing at the dummy until it feels natural. Learn to aim true, to hit hard, and to keep your guard up.',
    hint: 'Tap the training dummy to practise. He trains each skill in turn.',
    ready: 'Well practised.', needs: {}, levels: { attack: 3, strength: 3, defence: 3 } },
  // then food: berries by the camp, a rod, fish from the pool and the river, and a meal cooked at the campfire
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
    ready: 'You have enough fish.', needs: { raw_fish: 8 } },
  { id: 'meal', title: 'A cooked meal',
    page: 'Cook your fish slowly over the fire. A few may burn at first, but you will soon get the knack of it.',
    hint: 'Tap the campfire to cook your fish. If some burn, catch a few more.',
    ready: 'You have a cooked meal.', needs: { cooked_fish: 5 } },
  // then the rats in the woods downriver (part 2): their hides are what hide armour is made from
  { id: 'rats', title: 'Rats in the woods',
    page: "Rats have nested in the woods down the river. They're no real danger, and their hides are tough and warm.",
    hint: 'Tap a rat by the nest down the river to fight it. Keep some food with you: you eat when you get hurt.',
    ready: 'You have enough rat hides.', needs: { rat_hide: 5 } },
  // then hide armour: a cap, a vest and a shield of rat hides, each a making goal (made where he stands and worn at
  // once), each making him harder to hit
  { id: 'hide_cap', title: 'A hide cap',
    page: 'Rat hide is tough stuff, and two hides stitched together make a snug cap. Armour makes you harder to hit.',
    hint: 'Fight rats in the woods for their hides.',
    ready: 'You have it all. Tap Make.', needs: MAKES.hide_cap.needs, makes: 'hide_cap' },
  { id: 'hide_vest', title: 'A hide vest',
    page: 'Four hides make a vest to cover your chest. The more armour you wear, the harder you are to hit.',
    hint: 'Fight rats in the woods for more hides.',
    ready: 'You have it all. Tap Make.', needs: MAKES.hide_vest.needs, makes: 'hide_vest' },
  { id: 'hide_shield', title: 'A hide shield',
    page: 'Stretch hides over a frame of branches and strap it to your arm. With a cap, a vest and a shield, fewer bites will get through.',
    hint: 'Fight rats in the woods for more hides, and gather branches from the ground.',
    ready: 'You have it all. Tap Make.', needs: MAKES.hide_shield.needs, makes: 'hide_shield' },
  // then the goblin camp where the river leaves the valley (its last part): beating the three goblins before any gets
  // back up brings out their chief (a race: hitting hard and often wins it, so the page says what to train), and beaten,
  // he leaves a torn map; the end of chapter 2
  // before the goblins, practice until he can face them (the owner's pick, 12 Oct 2026: a player who had trained only
  // one style couldn't bring their chief out); he trains each skill in turn by himself (systems/combat.ts)
  { id: 'ready', title: 'Ready for the goblins',
    page: 'Goblins are tougher than rats. Grow stronger at the dummy or among the rats before you face their camp.',
    hint: 'Practise at the training dummy or fight rats. He trains each skill in turn.',
    ready: 'Ready for the goblins.', needs: {}, levels: { attack: 7, strength: 7, defence: 7 } },
  { id: 'goblins', title: 'The goblin camp',
    page: 'Goblins have camped where the river leaves the valley, their chief in his tent. Bring food, wear armour, and train Attack and Strength.',
    hint: 'Tap a goblin in the camp past the rats. Beat all three before they get back up, and their chief comes out.',
    ready: 'You have the torn map.', needs: { old_map: 1 } },
];

/** What the goal card says once every goal is finished (allGoalsDone in core/state), and the last page of his book
 *  under its words: since the goblin camp, the end of chapter 2. */
export const CAMP_DONE = { title: 'The way is open', text: 'The goblins are gone, and the way along the river is open. The old village waits beyond, in a later update.' };
