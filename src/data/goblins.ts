// The goblin camp (chapter 2, holding the camp, its last part), as tables: the goblins and their chief, how they fight
// back, when beaten goblins come back, how they mill about inside their camp, and what the chief leaves. Goblins block
// the way out of the valley where the river leaves it (the owner's decision of 12 Oct 2026); beating them opens it.
// The OSRS formulas are in systems/combat.ts; systems/goblins.ts runs the goblins; the camp is in the layout
// (world/camp.ts, world/goblincamp.ts).
import { SWINGS } from './animation';

/** A goblin, tougher than a rat and hitting harder. name: what notices and the hover call it. health: what it starts
 *  and comes back with. attack, attackBonus: its attack level and bonus, for its roll against his defence (OSRS's
 *  creature roll: (level + 9) times (bonus + 64)); defence, defenceBonus: the same against his accuracy. maxHit: the
 *  most a blow of its club does (0 to this when it lands). every: seconds from one swing to the next; first: its first
 *  swing begins this long after he starts fighting it, so his first swing comes first. radius: how far from its middle
 *  he stands to strike it, through strikeReach in systems/combat.ts. xp: XP for each point of damage to the style he
 *  trains (as the rats'), a third as much to Vitality. back: seconds until a beaten goblin is up again in the camp,
 *  while its chief still stands. regen: a hurt goblin he isn't fighting gets 1 health back every this many seconds. */
export const GOBLIN = {
  name: 'Goblin',
  health: 10, attack: 5, attackBonus: 0, defence: 5, defenceBonus: 0, maxHit: 2,
  every: 3.6, first: 1.4,
  radius: 0.27,
  xp: 12,
  back: 90,
  regen: 15,
};

/** The goblin chief, bigger and tougher: as a goblin (GOBLIN), but he stays in his tent until all three goblins are
 *  down at the same time, then comes out. Beaten, he leaves `drop` (a torn map, which can't be dropped: canDrop in
 *  core/state.ts) and the camp is cleared for good. regen: while he is out and nobody fights him, 1 health back every
 *  this many seconds; knocked back into his tent (he knocked the player out), he heals at once. */
export const CHIEF = {
  name: 'Goblin chief',
  health: 20, attack: 8, attackBonus: 0, defence: 8, defenceBonus: 0, maxHit: 3,
  every: 3.6, first: 1.4,
  radius: 0.32,
  xp: 12,
  regen: 10,
  drop: 'old_map',
};

/** A goblin's swing is the character's Chop clip (render/creatures.ts goblinModel): its blow lands `lands` seconds into
 *  it, so the simulation lands it when the drawn club does (the render's attack clock is the swing's timer). */
export const GOBLIN_SWING = { lands: SWINGS.woodcutting.impact };

/** How the goblins (and the chief, once out) mill about inside their camp while nobody fights them: walks of `hop`
 *  metres (shortest, longest) at `speed` metres a second, then a while standing about for `rest` seconds (shortest,
 *  longest), keeping `apart` metres from each other and from him, within the camp's `roam` (world/layout.ts,
 *  GoblinCampSpot). `moveOnAfter`: the seconds he watches a beaten goblin topple before he goes on to the next. `out`:
 *  how far the chief walks out from his tent's door when he comes out. */
export const MILL = { hop: [0.8, 2.4] as const, speed: 1.1, rest: [2.5, 7] as const, apart: 1.1, moveOnAfter: 1.2, out: 1.6 };
