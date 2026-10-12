// Picking things up off the ground by hand (data/pickups.ts, layout.pickups): he stands beside one a moment
// (PICKUP_PAUSE), then it goes into his backpack and is gone from the ground. The wreck's pieces never come back;
// stones and branches lie at their spot again after a while. His book takes no backpack slot: it sets hasBook.
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout } from '../world/layout';
import { PICKUPS } from '../data/pickups';
import { BACKPACK_SLOTS } from '../data/hauling';
import { backpackCount } from './backpack';

/** Whether the pickup `id` is lying on the ground (it exists and isn't taken). */
export const onGround = (state: GameState, layout: Layout, id: string) =>
  !!layout.pickups?.some(x => x.id === id) && !(id in state.taken);

/** Whether the backpack has room for everything the pickup `id` gives (the book needs none). */
export function roomFor(state: GameState, layout: Layout, id: string): boolean {
  const spot = layout.pickups?.find(x => x.id === id), gives = spot && PICKUPS[spot.kind].gives;
  if (!gives) return false;
  return gives === 'book' || backpackCount(state) + gives.count <= BACKPACK_SLOTS;
}

export function updatePickups(state: GameState, layout: Layout, events: EventBus): void {
  for (const [id, back] of Object.entries(state.taken)) {
    if (back !== null && state.time >= back) { delete state.taken[id]; events.emit({ type: 'pickupBack', id }); }
  }
  const p = state.player, task = p.task;
  if (task.kind !== 'pickup' || state.time < task.doneAt) return;
  p.task = { kind: 'idle' };
  const spot = layout.pickups?.find(x => x.id === task.id);
  if (!spot || !onGround(state, layout, spot.id)) return;
  if (!roomFor(state, layout, spot.id)) { events.emit({ type: 'noRoom' }); return; }
  const def = PICKUPS[spot.kind];
  if (def.gives === 'book') state.hasBook = true;
  else {
    const pack = p.backpack;
    pack[def.gives.item] = (pack[def.gives.item] ?? 0) + def.gives.count;
  }
  state.taken[spot.id] = def.respawn === null ? null : state.time + def.respawn;
  const item = def.gives === 'book' ? null : def.gives.item, count = def.gives === 'book' ? 1 : def.gives.count;
  events.emit({ type: 'pickedUp', id: spot.id, kind: spot.kind, item, count });
  if (item) events.emit({ type: 'itemGained', item, count });
}
