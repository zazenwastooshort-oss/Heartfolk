// What he wears (chapter 2, hide armour; in the Backpack window since the UI foundation, 12 Oct 2026): a tile for each
// place gear goes (weapon, head, body, shield) with the piece's picture and name, or the place's name over a faint
// shape while it is empty, and under them his bonuses from all of it, "Attack +4, Strength +6, Defence +3", as the
// rolls count them (systems/combat.ts). Shown once he wears anything. armourText is the old one-line summary ("cap,
// vest, shield (+16 defence)"), which tests/armour.test.ts still checks. Reads state; never changes the game.
import type { GameState } from '../core/state';
import { GEAR, SLOTS, type GearDef, type Slot } from '../data/combat';
import { picture, SLOT_SHAPES } from './pictures';

const $ = (id: string) => document.getElementById(id)!;

/** The armour's words ("cap, vest (+11 defence)"), or null while he wears no armour (his weapon isn't armour). The
 *  defence is the whole defence bonus of what he wears, as the roll against being hit counts it. */
export function armourText(state: GameState): string | null {
  const worn = SLOTS.flatMap(s => { const id = state.equipment[s]; return id ? [GEAR[id]] : []; });
  const armour = worn.filter(g => g.slot !== 'weapon');
  if (!armour.length) return null;
  return `${armour.map(g => g.short ?? g.name.toLowerCase()).join(', ')} (+${worn.reduce((a, g) => a + g.defence, 0)} defence)`;
}

/** What each place is called on its tile while it is empty. */
export const SLOT_NAMES: Record<Slot, string> = { weapon: 'Weapon', head: 'Head', body: 'Body', shield: 'Shield' };

/** What he wears, place by place in SLOTS' order: the gear there, or null. */
export const wornSlots = (state: GameState): { slot: Slot; gear: GearDef | null }[] =>
  SLOTS.map(slot => { const id = state.equipment[slot]; return { slot, gear: id ? GEAR[id] : null }; });

/** His bonuses from everything he wears, "Attack +4, Strength +6, Defence +3", or null while he wears nothing. */
export function bonusText(state: GameState): string | null {
  const worn = wornSlots(state).flatMap(w => (w.gear ? [w.gear] : []));
  if (!worn.length) return null;
  const sum = (kind: 'attack' | 'strength' | 'defence') => worn.reduce((a, g) => a + g[kind], 0);
  return `Attack +${sum('attack')}, Strength +${sum('strength')}, Defence +${sum('defence')}`;
}

let drawn: string | null = null;

/** Show what he wears (index.html's #armourRow, in the Backpack window) once he wears anything; redrawn on a change. */
export function showArmour(state: GameState): void {
  const key = SLOTS.map(s => state.equipment[s] ?? '').join('|');
  if (key === drawn) return;
  drawn = key;
  const bonus = bonusText(state);
  $('armourRow').hidden = bonus === null;
  if (bonus === null) return;
  $('armour').replaceChildren(...wornSlots(state).map(({ slot, gear }) => {
    const tile = document.createElement('div');
    tile.className = gear ? 'worn-tile' : 'worn-tile empty';
    tile.innerHTML = picture(gear?.id ?? SLOT_SHAPES[slot]);
    const name = document.createElement('small');
    name.textContent = gear?.name ?? SLOT_NAMES[slot];
    tile.append(name);
    tile.title = gear ? `${gear.name} (${SLOT_NAMES[slot].toLowerCase()})` : `${SLOT_NAMES[slot]}: nothing yet`;
    return tile;
  }));
  $('bonus').textContent = bonus;
  $('armour').setAttribute('aria-label', `Wearing: ${wornSlots(state).flatMap(w => (w.gear ? [w.gear.name] : [])).join(', ')}. ${bonus}.`);
}
