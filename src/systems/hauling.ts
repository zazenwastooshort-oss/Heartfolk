// Hauling, slice 1: the character carries his backpack to the bank on foot (docs/PLAN.md, Hauling). When it fills
// while he works, he walks to the bank by himself, empties it and goes back to work: to the same node if it is
// standing, otherwise the nearest free one like it, otherwise back to his own to wait. Gathering things off the ground
// (0.0.14) goes the same way: with no room for the next one he empties the backpack at the bank and goes back to
// gathering. Tapping the bank empties the backpack too, and he stays there. A command from the player cancels a trip
// (systems/commands). With no bank (the camp, before its storage), he stops and says so.
import type { GameState, Trip } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout, Vec2 } from '../world/layout';
import { doorOf } from '../world/layout';
import { goVisit, goWork } from '../actors/player';
import { BANK_PAUSE } from '../data/hauling';
import { backpackFull, deposit } from './backpack';
import { workNearestFree } from './gathering';
import { gatherNext, gatherOf, roomFor } from './pickups';

/** The bank whose door is nearest `at` (the village has one; more may come). */
function nearestBank(layout: Layout, at: Vec2) {
  let best: { id: string; d: number } | null = null;
  for (const b of layout.buildings) {
    if (b.kind !== 'bank') continue;
    const door = doorOf(b), d = Math.hypot(door.x - at.x, door.z - at.z);
    if (!best || d < best.d) best = { id: b.id, d };
  }
  return best?.id ?? null;
}

/** `visited`: the building or land the character reached this step (from updatePlayer), if any. */
export function updateHauling(state: GameState, layout: Layout, visited: string | null, events: EventBus): void {
  const p = state.player;
  if (visited && layout.buildings.find(b => b.id === visited)?.kind === 'bank') {
    deposit(state, events);
    if (p.trip) p.trip.leaveAt = state.time + BANK_PAUSE;    // a moment at the door, so the deposit is seen
    return;
  }
  if (p.trip?.leaveAt !== undefined) {
    if (state.time < p.trip.leaveAt) return;
    const trip = p.trip; p.trip = null;
    backToWork(state, layout, trip, events);
    return;
  }
  // working, or on the way to work, with no room left: off to the bank first
  const nodeId = p.task.kind === 'gather' ? p.task.nodeId : p.pending?.kind === 'node' ? p.pending.id : null;
  if (nodeId && backpackFull(state)) { startTrip(state, layout, { nodeId }, events); return; }
  // gathering off the ground, with no room for the next one (or the one he waits beside): the same
  const pickupId = p.task.kind === 'pickup' ? p.task.id : p.pending?.kind === 'pickup' ? p.pending.id : null;
  if (pickupId && gatherOf(layout, pickupId) && !roomFor(state, layout, pickupId)) startTrip(state, layout, { pickupId }, events);
}

function startTrip(state: GameState, layout: Layout, trip: Trip, events: EventBus): void {
  const p = state.player, bank = nearestBank(layout, p.pos);
  if (bank && goVisit(state, layout, bank)) {
    p.trip = trip;
    events.emit({ type: 'backpackFull' });
    return;
  }
  // nowhere to empty it: stand still with the full backpack rather than look for a way every step
  p.task = { kind: 'idle' }; p.path = []; p.pending = null; p.trip = null;
  events.emit(bank ? { type: 'noPath' } : { type: 'noStorage' });
}

function backToWork(state: GameState, layout: Layout, trip: Trip, events: EventBus): void {
  if ('pickupId' in trip) {
    // back to gathering: the nearest lying on the ground, or the next to come back
    const group = gatherOf(layout, trip.pickupId);
    if (group && !gatherNext(state, layout, group)) events.emit({ type: 'allGathered', gather: group });
    return;
  }
  const nodeId = trip.nodeId, node = state.nodes[nodeId], spot = layout.nodes.find(n => n.id === nodeId);
  if (!node || !spot) return;
  if (!node.depletedUntil && goWork(state, layout, nodeId)) return;
  if (workNearestFree(state, layout, spot.resource)) return;
  // every one like it is down (or out of reach): wait at his own for it to grow back
  if (!goWork(state, layout, nodeId)) events.emit({ type: 'noPath' });
}
