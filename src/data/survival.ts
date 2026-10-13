// His survival book (chapter 2): not a list of orders but what he knows, in sections: the Journal (his thoughts so far,
// data/thoughts.ts), Making (a page per thing he can make: what it needs and where it is made), Food, Materials and
// places, and a few Tips. A page comes unstuck (the book was soaked in the river) once he finds what it is about: the
// first time he has the thing, comes near the place, builds something, or reaches a goal (core/survival.ts). Making
// pages come unstuck when he first needs the thing (its goal is the one he is on) or first has all its parts.
// Tables only, in the book's plain, warm voice; each page a sentence or two (tests/survival.test.ts keeps them short).
import type { Place } from './thoughts';
import type { MakeId, SiteId } from './making';

export type Section = 'journal' | 'making' | 'food' | 'places' | 'tips';

/** The sections in the book's order, with the name on its tab and the name on its pages. */
export const SECTIONS: { id: Section; tab: string; name: string }[] = [
  { id: 'journal', tab: 'Journal', name: 'Journal' },
  { id: 'making', tab: 'Making', name: 'Making' },
  { id: 'food', tab: 'Food', name: 'Food' },
  { id: 'places', tab: 'Places', name: 'Materials and places' },
  { id: 'tips', tab: 'Tips', name: 'Tips' },
];

/** What unsticks a page: the first time he has an item (carried or stored), comes near a place, has built something
 *  (data/making.ts, a structure that stands), or reaches a goal (data/goals.ts: it is the one he is on, or done). */
export type Found = { item: string } | { near: Place } | { built: MakeId } | { goal: string };

/** One page. by: a goal (by id) by which a player surely knows it: an old save from before the book that reached that
 *  goal has the page already (the thing may have been used up since). */
export interface SurvivalDef { id: string; section: 'food' | 'places' | 'tips'; title: string; text: string; found: Found; by?: string }

export const SURVIVAL: SurvivalDef[] = [
  // food (each food page also says how much it heals: FOOD in data/food.ts)
  { id: 'food:berries', section: 'food', title: 'Berries', found: { item: 'berries' }, by: 'berries',
    text: "Sweet and a little sour. A handful won't fill you, but it helps when you're hurt." },
  { id: 'food:raw_fish', section: 'food', title: 'Raw fish', found: { item: 'raw_fish' }, by: 'fish',
    text: "Don't eat it raw. Cook it over the campfire first." },
  { id: 'food:cooked_fish', section: 'food', title: 'Cooked fish', found: { item: 'cooked_fish' }, by: 'meal',
    text: 'Warm and filling: the best food you have. Pack some before a fight.' },
  { id: 'food:burnt_fish', section: 'food', title: 'Burnt fish', found: { item: 'burnt_fish' },
    text: 'Charred through and no good to eat. You burn fewer as you learn.' },

  // materials and places
  { id: 'place:falls', section: 'places', title: 'The falls', found: { goal: 'salvage' },
    text: 'Far too high and sheer to climb. The only way on is down the river.' },
  { id: 'place:wreck', section: 'places', title: 'The wreck', found: { near: 'wreck' }, by: 'salvage',
    text: 'Planks, a torn tarp and a crate came down the falls with you. Nothing more will wash up.' },
  { id: 'place:stones', section: 'places', title: 'Stones', found: { item: 'stone' }, by: 'campfire',
    text: 'Smooth river stones lie about the clearing. Take them, and more turn up in a while.' },
  { id: 'place:branches', section: 'places', title: 'Branches', found: { item: 'branch' }, by: 'stone_axe',
    text: 'Fallen branches lie under the trees, and the woods keep dropping more.' },
  { id: 'place:birch', section: 'places', title: 'Birch trees', found: { item: 'birch_logs' }, by: 'firewood',
    text: 'They ring the clearing. An axe brings one down, and the stump grows back in time.' },
  { id: 'place:copper', section: 'places', title: 'Copper rocks', found: { item: 'copper_ore' }, by: 'copper',
    text: 'Grey rocks flecked with green, up near the falls. A stone pick breaks the ore out.' },
  { id: 'place:bushes', section: 'places', title: 'Berry bushes', found: { near: 'bushes' }, by: 'berries',
    text: 'Red berries grow east of the fire. Pick a bush bare and it fruits again a while later.' },
  { id: 'place:fishing', section: 'places', title: 'Fishing spots', found: { near: 'fishing' }, by: 'fish',
    text: 'Where the water ripples, fish are feeding: in the pool and along the river.' },
  { id: 'place:nest', section: 'places', title: "The rats' nest", found: { near: 'nest' }, by: 'rats',
    text: "A mound of straw at the edge of the woods downriver. The rats don't stray far from it." },
  { id: 'place:goblins', section: 'places', title: 'The goblin camp', found: { near: 'goblins' }, by: 'goblins',
    text: 'A ring of stakes where the river leaves the valley. Goblins, and a chief in a hide tent.' },

  // practical tips
  { id: 'tip:tap', section: 'tips', title: 'Finding your way', found: { goal: 'salvage' },
    text: 'Tap the goal at the top, or his thought, and he sets off to do it. Or tap anything you like.' },
  { id: 'tip:night', section: 'tips', title: 'The fire at night', found: { built: 'woodpile' },
    text: 'At nightfall he feeds the fire from the firewood pile by himself. Keep it stacked.' },
  { id: 'tip:sleep', section: 'tips', title: 'Sleep', found: { built: 'shelter' },
    text: 'He sleeps at his bedtime (Settings), or early if you tap the shelter. He wakes rested, and gathers quicker until dusk.' },
  { id: 'tip:chest', section: 'tips', title: 'A full backpack', found: { built: 'chest' },
    text: 'A full backpack goes into the chest by itself, and his tools are kept there. He fetches the one he needs.' },
  { id: 'tip:styles', section: 'tips', title: 'Fighting', found: { goal: 'practice' },
    text: 'Each way of fighting trains its own skill. He moves on to the next by himself.' },
  { id: 'tip:food', section: 'tips', title: 'Food in a fight', found: { goal: 'rats' },
    text: "Carry food when you fight. He eats by himself when he's hurt." },
  { id: 'tip:armour', section: 'tips', title: 'Armour', found: { goal: 'hide_cap' },
    text: 'Armour makes you harder to hit, and every piece helps.' },
  { id: 'tip:goblins', section: 'tips', title: 'The goblins', found: { goal: 'goblins' },
    text: 'Beat all three goblins before any is up again, and their chief comes out.' },
];

/** The Making pages' words, a sentence about each thing he makes (data/making.ts, by id). One without words here has
 *  only its title, what it needs and where it is made. */
export const MAKE_NOTES: Partial<Record<MakeId, string>> = {
  campfire: 'Stones in a ring, planks to get it going. It keeps the cold and the dark away.',
  stone_axe: "A sharp stone bound to a sturdy branch. It needn't be pretty.",
  woodpile: 'Logs stacked beside the fire, ready for the night.',
  shelter: 'The torn tarp over a frame of logs, with planks to sleep on.',
  stone_pickaxe: 'A heavier, pointed stone lashed to a branch. It breaks rock.',
  chest: 'Logs held together with copper. It keeps your things safe by the shelter.',
  dummy: 'Logs and sacking on a post. A safe thing to learn to fight on.',
  stone_club: 'A heavy branch with a round stone lashed to its end. It hits hard.',
  rod: "Long branches, and thread from the tarp's frayed edge for a line.",
  hide_cap: 'Two hides stitched into a snug cap.',
  hide_vest: 'Four hides to cover your chest.',
  hide_shield: 'Hides stretched over a frame of branches, strapped to your arm.',
  wall_tent: 'A squared frame of logs round the old canvas, lashed with fibre, a plank floor and a porch. Snug and dry.',
  log_cabin: 'Round logs notched at the corners, clay in the gaps, a loft and a stone chimney. A proper home.',
  stone_hearth: 'A raised ring of stones set in clay round the fire, a spit across it and logs to sit on.',
  woodshed: 'A bark roof on four posts over the firewood, to keep it dry, and a block to split logs on.',
};

/** Where things are built, for the Making pages ("Built at the fire spot"); 'here' is wherever he stands. A site with no
 *  words here says nothing of where. */
export const SITE_WHERE: Partial<Record<SiteId | 'here', string>> = {
  hearth: 'Built at the fire spot.',
  tent: 'Built at the shelter spot by the fire.',
  chest: 'Built beside the shelter.',
  woodpile: 'Stacked beside the fire.',
  dummy: 'Built on the grass west of the fire.',
  here: 'Made wherever you stand.',
};

/** Where one thing is built, for its Making page, when its site's words (SITE_WHERE) don't say it best: the camp's
 *  upgrades, each in place of the thing before it. */
export const MAKE_WHERE: Partial<Record<MakeId, string>> = {
  wall_tent: 'Built round the tent, at the shelter spot.',
  log_cabin: 'Built in place of the wall tent, at the shelter spot.',
  stone_hearth: 'Built round the campfire.',
  woodshed: 'Built over the firewood pile, beside the fire.',
};

/** Journal lines on a page of the book. */
export const JOURNAL_PER_PAGE = 5;
