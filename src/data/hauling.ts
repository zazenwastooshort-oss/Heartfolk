// How goods reach the bank (docs/PLAN.md, Hauling), as tables only. Slice 1 is the backpack; a cart, villager
// helpers and caravans come later.

/** Slots in the character's backpack, one item per slot as in OSRS. The size doesn't matter yet and is meant to be
 *  easy to change (the owner, 11 Oct 2026). When it fills while he works, he empties it at the bank by himself. */
export const BACKPACK_SLOTS = 28;

/** Seconds he stands at the bank's door after emptying the backpack on a trip, so the deposit is seen, before he
 *  heads back to work. */
export const BANK_PAUSE = 0.8;
