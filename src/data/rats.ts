// The rats in the woods (chapter 2, holding the camp, part 2), as tables: how a rat fights back, what it leaves, when it
// comes back and how it potters about its nest; and what fighting something that hits back asks of him: eating when
// hurt, taking food along, and being knocked out (gently: he wakes at the camp, the owner's decision of 12 Oct 2026).
// The OSRS formulas are in systems/combat.ts; systems/rats.ts runs the rats; the nest is in the layout (world/camp.ts).

/** A rat. name: what notices and the hover call it. health: what it starts with and comes back with. attack,
 *  attackBonus: its attack level and bonus, for its roll against his defence (OSRS's creature roll: (level + 9) times
 *  (bonus + 64)); defence, defenceBonus: the same against his accuracy. maxHit: the most a bite does (0 to this when it
 *  lands). every: seconds from one bite to the next (slow: OSRS's rats bite every 2.4 s); first: its first bite begins
 *  this long after he starts fighting it, so his first swing comes first. radius: how far from its middle he stands to
 *  strike it, through strikeReach in systems/combat.ts (his swing reaches down to it as he leans in: render/view.ts).
 *  xp: XP for each point of damage to the style he trains (as the training dummy's), a third as much to Vitality.
 *  drop: what a beaten rat leaves (a rat hide, what hide armour is made from) and how often (about half the time); it
 *  goes into his backpack. atLeast (13 Oct 2026, from the chapter review: "fair rat hides: guarantee one at least every
 *  few rats"): a hide at least every this many rats, so the goal's time doesn't hang on luck (GameState.ratsSinceHide). back: seconds until a beaten rat comes back at its nest. regen: a hurt rat he isn't
 *  fighting gets 1 health back every this many seconds. */
export const RAT = {
  name: 'Rat',
  health: 5, attack: 1, attackBonus: 0, defence: 1, defenceBonus: 0, maxHit: 1,
  every: 3, first: 1.4,
  radius: 0.37,
  xp: 12,
  drop: { item: 'rat_hide', chance: 0.5, atLeast: 3 },
  back: 60,
  regen: 20,
};

/** How a rat potters about its nest while nobody fights it: scurries of `hop` metres (shortest, longest) at `speed`
 *  metres a second, then it stays put sniffing about for `rest` seconds (shortest, longest), keeping `apart` metres from
 *  the other rats and within its nest's `roam` (world/layout.ts, NestSpot), never on the nest itself. `moveOnAfter`:
 *  the seconds he watches a beaten rat topple before he goes on to the next. */
export const POTTER = { hop: [0.5, 1.6] as const, speed: 1.4, rest: [2.5, 7] as const, apart: 0.7, turn: 8, moveOnAfter: 1.2 };

/** One bite (seconds, whatever the bites' pace): the rat rears back for `rear`, snaps forward in `snap`, its head
 *  furthest forward at the end of it, where the bite lands, and settles back in `settle`. render/creatures.ts draws
 *  it from these, so a bite is seen to land when the simulation says it does. */
export const RAT_BITE = { rear: 0.4, snap: 0.1, settle: 0.35 };
/** Seconds into a bite that it lands. */
export const BITE_LANDS = RAT_BITE.rear + RAT_BITE.snap;

/** Food in a fight: below `below` of his most health he eats from his backpack, the food that heals most first, one
 *  each time a bite comes; setting off to fight with no food in his backpack but some in the chest, he first takes up
 *  to `take` of it from the chest (the food that heals most first). */
export const FIGHT_FOOD = { below: 0.4, take: 5 };

/** Knocked out (at 0 health): he slumps for `slump` seconds, then wakes at the camp by the shelter (by the fire if
 *  there is none) with `health` of his most back, keeping everything he carries and wears. */
export const KNOCKED_OUT = { slump: 3, health: 0.5 };
