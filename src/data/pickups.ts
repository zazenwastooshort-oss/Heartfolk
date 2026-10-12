// Things lying on the ground that the character picks up by hand (12 Oct 2026): the wreckage that washed up below the
// falls with him, and the stones and branches round the camp. Tables only. Where each one lies is the layout's
// `pickups` (world/camp.ts); which have been taken, and until when, is GameState.taken.

export type PickupKind = 'plank' | 'tarp' | 'crate' | 'book' | 'stone' | 'branch';

/** What tapping one starts (0.0.14, the owner: the idle feel from the start): he gathers every one of the same
 *  group, nearest first, like moving on from tree to tree. A group whose pieces never come back (the wreck's planks)
 *  is done when none are left; one whose pieces come back (stones, branches) he waits for, until the backpack is full.
 *  name: the hover text ("Gather|Planks") and the notice once none are left ("That's all the planks."). */
export type GatherId = 'planks' | 'stones' | 'branches';
export const GATHERS: Record<GatherId, { name: string }> = {
  planks: { name: 'Planks' },
  stones: { name: 'Stones' },
  branches: { name: 'Branches' },
};

/** name: the hover text for one picked up on its own ("Pick up|Torn tarp"); model: in assets/models/village.glb.
 *  gives: what goes into his backpack (`count` of `item`), or 'book': his book, which he keeps apart from the backpack
 *  (it takes no slot; GameState.hasBook).
 *  respawn: seconds until another lies at the same spot, or null for never (the wreck comes down only once).
 *  gather: the group tapping one gathers (GATHERS), or null for just that one. */
export interface PickupDef {
  kind: PickupKind; name: string; model: string;
  gives: { item: string; count: number } | 'book';
  respawn: number | null;
  gather: GatherId | null;
}

export const PICKUPS: Record<PickupKind, PickupDef> = {
  plank:  { kind: 'plank', name: 'Plank', model: 'Plank', gives: { item: 'plank', count: 1 }, respawn: null, gather: 'planks' },
  tarp:   { kind: 'tarp', name: 'Torn tarp', model: 'Tarp', gives: { item: 'tarp', count: 1 }, respawn: null, gather: null },
  crate:  { kind: 'crate', name: 'Smashed crate', model: 'CrateBroken', gives: { item: 'plank', count: 2 }, respawn: null, gather: 'planks' },
  book:   { kind: 'book', name: 'Book', model: 'Book', gives: 'book', respawn: null, gather: null },
  stone:  { kind: 'stone', name: 'Stone', model: 'Stone', gives: { item: 'stone', count: 1 }, respawn: 100, gather: 'stones' },
  branch: { kind: 'branch', name: 'Branch', model: 'Branch', gives: { item: 'branch', count: 1 }, respawn: 110, gather: 'branches' },
};

/** Seconds he stands beside a pickup before it goes into his backpack: long enough to see him stop for it. */
export const PICKUP_PAUSE = 0.6;
