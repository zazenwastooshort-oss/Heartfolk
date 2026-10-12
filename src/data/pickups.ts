// Things lying on the ground that the character picks up by hand (12 Oct 2026): the wreckage that washed up below the
// falls with him, and the stones and branches round the camp. Tables only. Where each one lies is the layout's
// `pickups` (world/camp.ts); which have been taken, and until when, is GameState.taken.

export type PickupKind = 'plank' | 'tarp' | 'crate' | 'book' | 'stone' | 'branch';

/** name: the hover text ("Pick up|Plank"); model: in assets/models/village.glb.
 *  gives: what goes into his backpack (`count` of `item`), or 'book': his book, which he keeps apart from the backpack
 *  (it takes no slot; GameState.hasBook).
 *  respawn: seconds until another lies at the same spot, or null for never (the wreck comes down only once). */
export interface PickupDef {
  kind: PickupKind; name: string; model: string;
  gives: { item: string; count: number } | 'book';
  respawn: number | null;
}

export const PICKUPS: Record<PickupKind, PickupDef> = {
  plank:  { kind: 'plank', name: 'Plank', model: 'Plank', gives: { item: 'plank', count: 1 }, respawn: null },
  tarp:   { kind: 'tarp', name: 'Torn tarp', model: 'Tarp', gives: { item: 'tarp', count: 1 }, respawn: null },
  crate:  { kind: 'crate', name: 'Smashed crate', model: 'CrateBroken', gives: { item: 'plank', count: 2 }, respawn: null },
  book:   { kind: 'book', name: 'Book', model: 'Book', gives: 'book', respawn: null },
  stone:  { kind: 'stone', name: 'Stone', model: 'Stone', gives: { item: 'stone', count: 1 }, respawn: 100 },
  branch: { kind: 'branch', name: 'Branch', model: 'Branch', gives: { item: 'branch', count: 1 }, respawn: 110 },
};

/** Seconds he stands beside a pickup before it goes into his backpack: long enough to see him stop for it. */
export const PICKUP_PAUSE = 0.6;
