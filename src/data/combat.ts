// Combat (chapter 2, holding the camp, 0.0.22), as tables. Attack, Strength and Defence work as in OSRS; Vitality sets
// his health (the owner, 12 Oct 2026: not Hitpoints, so it differs a bit). The formulas are in systems/combat.ts; what
// he can fight is core/targets.ts (the training dummy for now, the rats later).
import { SWINGS } from './animation';
import type { SkillId } from './skills';

/** His health at most (maxHealth in core/state.ts): `base` at Vitality level 1, `perLevel` more for each level after.
 *  regen: while hurt he gets 1 health back every `regen` seconds of play (systems/combat.ts). */
export const HEALTH = { base: 10, perLevel: 1, regen: 30 };

/** What he trains while he fights (GameState.combatStyle), chosen in the panel: as in OSRS, the style gives +3 to the
 *  skill it trains (accurate: Attack, aggressive: Strength, defensive: Defence), and the XP goes to that skill. */
export type CombatStyle = Extract<SkillId, 'attack' | 'strength' | 'defence'>;
export const STYLES: CombatStyle[] = ['attack', 'strength', 'defence'];

/** styleBonus: what the style he trains adds to that skill's level in the rolls (OSRS: +3). vitality: the share of
 *  the XP for each point of damage that goes to Vitality as well (OSRS gives Hitpoints a third). */
export const COMBAT = { styleBonus: 3, vitality: 1 / 3 };

/** Where gear is worn (GameState.equipment). Weapons first; armour (head, body, shield) comes with the hide armour. */
export type Slot = 'weapon' | 'head' | 'body' | 'shield';
export const SLOTS: Slot[] = ['weapon', 'head', 'body', 'shield'];

export type GearId = 'stone_club' | 'hide_cap' | 'hide_vest' | 'hide_shield';

/** Gear he wears (made by a MAKES row that gives it, data/making.ts): the slot it goes in, and its bonuses as in OSRS:
 *  `attack` to his accuracy, `strength` to his max hit, `defence` against being hit. A weapon has a `speed`: seconds
 *  from one strike to the next (at least STRIKE.cycle, the swing itself; he rests for the rest of it). `short`: what
 *  the panel's armour line calls a piece of armour ("cap"). */
export interface GearDef { id: GearId; name: string; slot: Slot; attack: number; strength: number; defence: number; speed?: number; short?: string }

export const GEAR: Record<GearId, GearDef> = {
  // a heavy branch with a round stone lashed on: slow and blunt (OSRS's 4-tick weapons strike every 2.4 seconds)
  stone_club: { id: 'stone_club', name: 'Stone club', slot: 'weapon', attack: 4, strength: 6, defence: 0, speed: 2.4 },
  // hide armour (chapter 2, chunk D), stitched from rat hides: defence only, about OSRS's leather (a cowl, a body, a
  // wooden shield). All three, +16, make the roll that has to beat his defence about a fifth less likely to land
  hide_cap: { id: 'hide_cap', name: 'Hide cap', slot: 'head', attack: 0, strength: 0, defence: 3, short: 'cap' },
  hide_vest: { id: 'hide_vest', name: 'Hide vest', slot: 'body', attack: 0, strength: 0, defence: 8, short: 'vest' },
  hide_shield: { id: 'hide_shield', name: 'Hide shield', slot: 'shield', attack: 0, strength: 0, defence: 5, short: 'shield' },
};

export const gearDef = (id: string): GearDef | null => Object.hasOwn(GEAR, id) ? GEAR[id as GearId] : null;

/** A strike with a weapon: the axe's Chop clip (a club swings like the axe, so no new clip is needed), the moment in it
 *  the weapon lands (seconds), how long the swing lasts, and where he stands: `reach` metres from the middle of a target
 *  whose radius is `refRadius`, further back from bigger ones. */
export const STRIKE = {
  clip: SWINGS.woodcutting.clip, impact: SWINGS.woodcutting.impact, cycle: SWINGS.woodcutting.cycle,
  reach: SWINGS.woodcutting.reach, refRadius: SWINGS.woodcutting.refRadius,
};

/** Seconds from one strike to the next with `weapon` (GameState.equipment.weapon): its speed, never quicker than the
 *  swing itself. The simulation strikes on it (systems/combat.ts) and the view swings on it (render/view.ts). */
export const strikeEvery = (weapon: GearId | null) => Math.max(STRIKE.cycle, (weapon && GEAR[weapon].speed) || STRIKE.cycle);

/** The training dummy (core/targets.ts): a post and crossbar with a stuffed sack body. It never hits back and never
 *  falls. radius: the sack's, at striking height (for where he stands); defence, defenceBonus: how hard it is to hit,
 *  as a creature's defence level and bonus; xp: XP for each point of damage, to the style he trains (three times OSRS's
 *  4, so the first levels come in a few minutes); maxLevel: it teaches each style only up to this level (a call for the
 *  owner), then says so and he stops. */
export const DUMMY = { radius: 0.22, defence: 1, defenceBonus: 0, xp: 12, maxLevel: 10 };
