// Picking things up off the ground by hand (data/pickups.ts, layout.pickups): he stands beside one a moment
// (PICKUP_PAUSE), then it goes into his backpack and is gone from the ground. The wreck's pieces never come back;
// stones and branches lie at their spot again after a while. His book takes no backpack slot: it sets hasBook.
// Tapping a plank, a stone or a branch starts gathering (0.0.14): after each one he goes on to the nearest of its
// group still lying on the ground (GATHERS), until none are left. Stones and branches come back, so then he walks to
// the one that comes back soonest and waits beside it. With no room for the next one, systems/hauling takes over:
// to the bank and back, or, with nowhere to store it (the camp), he stops. The torn tarp and the book are picked up
// on their own.
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout } from '../world/layout';
import { PICKUPS, PICKUP_PAUSE, type GatherId } from '../data/pickups';
import { BACKPACK_SLOTS } from '../data/hauling';
import { goPickup } from '../actors/player';
import { backpackCount } from './backpack';

/** Whether the pickup `id` is lying on the ground (it exists and isn't taken). */
export const onGround = (state: GameState, layout: Layout, id: string) =>
  !!layout.pickups?.some(x => x.id === id) && !(id in state.taken);

/** The group tapping the pickup `id` gathers (GATHERS), or null for one picked up on its own (or one that isn't there). */
export function gatherOf(layout: Layout, id: string): GatherId | null {
  const spot = layout.pickups?.find(x => x.id === id);
  return spot ? PICKUPS[spot.kind].gather : null;
}

/** Whether the backpack has room for everything the pickup `id` gives (the book needs none). */
export function roomFor(state: GameState, layout: Layout, id: string): boolean {
  const spot = layout.pickups?.find(x => x.id === id), gives = spot && PICKUPS[spot.kind].gives;
  if (!gives) return false;
  return gives === 'book' || backpackCount(state) + gives.count <= BACKPACK_SLOTS;
}

/** Set off for the next of `group` to pick up: the nearest lying on the ground, or with none there, the one that comes
 *  back soonest, to wait beside it. Ones that fit in the backpack come first, so with one slot left he takes a loose
 *  plank before the smashed crate's two. Returns false, with the player as he was, when there is none left to gather. */
export function gatherNext(state: GameState, layout: Layout, group: GatherId): boolean {
  const p = state.player, all = (layout.pickups ?? []).filter(x => PICKUPS[x.kind].gather === group);
  const away = (pos: { x: number; z: number }) => Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z);
  const fits = (id: string) => Number(roomFor(state, layout, id));
  const lying = all.filter(x => !(x.id in state.taken)).sort((a, b) => fits(b.id) - fits(a.id) || away(a.pos) - away(b.pos));
  const backAt = (id: string) => state.taken[id] ?? Infinity;
  const coming = all.filter(x => typeof state.taken[x.id] === 'number').sort((a, b) => backAt(a.id) - backAt(b.id));
  return [...lying, ...coming].some(x => goPickup(state, layout, x.id));
}

/** On to the next of `group`, or stop and say that was all of them. */
function keepGathering(state: GameState, layout: Layout, group: GatherId, events: EventBus): void {
  if (!gatherNext(state, layout, group)) events.emit({ type: 'allGathered', gather: group });
}

export function updatePickups(state: GameState, layout: Layout, events: EventBus): void {
  for (const [id, back] of Object.entries(state.taken)) {
    if (back !== null && state.time >= back) { delete state.taken[id]; events.emit({ type: 'pickupBack', id }); }
  }
  const p = state.player, task = p.task;
  if (task.kind !== 'pickup' || state.time < task.doneAt) return;
  const spot = layout.pickups?.find(x => x.id === task.id);
  if (!spot) { p.task = { kind: 'idle' }; return; }
  const def = PICKUPS[spot.kind];
  if (!onGround(state, layout, spot.id)) {
    // beside a stone or branch that isn't back yet: he waits, and picks it up a moment after it lies there again
    const back = state.taken[spot.id];
    if (typeof back === 'number') { task.doneAt = back + PICKUP_PAUSE; return; }
    p.task = { kind: 'idle' };
    if (def.gather) keepGathering(state, layout, def.gather, events);
    return;
  }
  p.task = { kind: 'idle' };
  if (!roomFor(state, layout, spot.id)) { events.emit({ type: 'noRoom' }); return; }
  if (def.gives === 'book') state.hasBook = true;
  else {
    const pack = p.backpack;
    pack[def.gives.item] = (pack[def.gives.item] ?? 0) + def.gives.count;
  }
  state.taken[spot.id] = def.respawn === null ? null : state.time + def.respawn;
  const item = def.gives === 'book' ? null : def.gives.item, count = def.gives === 'book' ? 1 : def.gives.count;
  events.emit({ type: 'pickedUp', id: spot.id, kind: spot.kind, item, count });
  if (item) events.emit({ type: 'itemGained', item, count });
  if (def.gather) keepGathering(state, layout, def.gather, events);
}
