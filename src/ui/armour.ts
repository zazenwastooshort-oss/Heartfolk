// The armour line in the panel (chapter 2, hide armour): the armour he wears and what it adds to his defence, "Armour
// cap, vest, shield (+16 defence)", shown once he wears any. Reads state; never changes the game.
import type { GameState } from '../core/state';
import { GEAR, SLOTS } from '../data/combat';

const $ = (id: string) => document.getElementById(id)!;

/** The line's words after "Armour" ("cap, vest (+11 defence)"), or null while he wears no armour (his weapon isn't
 *  armour). The defence is the whole defence bonus of what he wears, as the roll against being hit counts it. */
export function armourText(state: GameState): string | null {
  const worn = SLOTS.flatMap(s => { const id = state.equipment[s]; return id ? [GEAR[id]] : []; });
  const armour = worn.filter(g => g.slot !== 'weapon');
  if (!armour.length) return null;
  return `${armour.map(g => g.short ?? g.name.toLowerCase()).join(', ')} (+${worn.reduce((a, g) => a + g.defence, 0)} defence)`;
}

/** Show the line (index.html's #armourRow) while he wears armour. */
export function showArmour(state: GameState): void {
  const text = armourText(state), words = $('armour');
  $('armourRow').hidden = text === null;
  if (text !== null && words.textContent !== text) words.textContent = text;
}
