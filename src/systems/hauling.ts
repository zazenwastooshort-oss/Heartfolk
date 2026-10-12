// Hauling, slice 1: the character carries his backpack to the bank on foot (docs/PLAN.md, Hauling). When it fills
// while he works, he walks to the bank by himself, empties it and goes back to work: to the same node if it is
// standing, otherwise the nearest free one like it, otherwise back to his own to wait. Gathering things off the ground
// (0.0.14) goes the same way: with no room for the next one he empties the backpack at the bank and goes back to
// gathering. Tapping the bank empties the backpack too, and he stays there. A command from the player cancels a trip
// (systems/commands). At the camp the storage chest (0.0.19) is the bank: once it is built, trips go to it and tapping
// it empties the backpack (stores in systems/backpack). With nowhere to store things (the camp before its chest), he
// stops and says so. While he is off stoking the fire (systems/fire.ts) hauling waits; stoking empties a full
// backpack at the chest itself. Fighting the rats (chapter 2) goes the same way: a hide that fills the backpack sends
// him to the chest and back to the rats, and setting off to fight with no food he stops at the chest for some
// (systems/rats.ts: at the chest on such a trip only a full backpack is emptied, and food is taken along).
import { goalHasEnough, type Back, type GameState, type Trip } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout, Vec2 } from '../world/layout';
import { goMake, goPickup, goVisit, goWork, walkTo } from '../actors/player';
import { BANK_PAUSE } from '../data/hauling';
import { makeDef } from '../data/making';
import { backpackFull, deposit, isStore, stores } from './backpack';
import { workNearestFree } from './gathering';
import { gatherOf, keepGathering, onGround, roomFor } from './pickups';
import { PICKUPS } from '../data/pickups';
import { RESOURCES } from '../data/skills';
import { canMake } from './making';
import { setOffToFight, stockUp } from './rats';
import { targetOf } from '../core/targets';
import { canCook, fishToCook, goCook } from './cooking';

/** The place to empty the backpack (a bank's door, or the camp's chest) nearest `at`, or null where there is none. */
function nearestStore(state: GameState, layout: Layout, at: Vec2): string | null {
  let best: { id: string; d: number } | null = null;
  for (const x of stores(state, layout)) {
    const d = Math.hypot(x.pos.x - at.x, x.pos.z - at.z);
    if (!best || d < best.d) best = { id: x.id, d };
  }
  return best?.id ?? null;
}

/** `visited`: the building, land or built thing the character reached this step (from updatePlayer), if any. */
export function updateHauling(state: GameState, layout: Layout, visited: string | null, events: EventBus): void {
  const p = state.player;
  if (p.stoke) return;                                      // off to stoke the fire: systems/fire.ts has him
  if (visited && isStore(state, layout, visited)) {
    // on his way to fight the rats (chapter 2), he takes food along, a full backpack emptied first, or any when the
    // player tapped the chest meanwhile (systems/rats.ts)
    if (p.trip && 'fight' in p.trip) stockUp(state, events, p.trip.store === true); else deposit(state, events);
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
  if (pickupId && gatherOf(layout, pickupId) && !roomFor(state, layout, pickupId)) { startTrip(state, layout, { pickupId }, events); return; }
  // fighting the rats (chapter 2), whose hides go into the backpack, or on the way to them: the same, back to the rats
  const fight = p.task.kind === 'fight' ? p.task.target : p.pending?.kind === 'fight' ? p.pending.id : null;
  if (fight && backpackFull(state) && targetOf(state, layout, fight)?.foe) startTrip(state, layout, { fight }, events);
}

function startTrip(state: GameState, layout: Layout, trip: Trip, events: EventBus): void {
  const p = state.player, store = nearestStore(state, layout, p.pos);
  if (store && goVisit(state, layout, store)) {
    p.trip = trip;
    events.emit({ type: 'backpackFull' });
    return;
  }
  // nowhere to empty it: stand still with the full backpack rather than look for a way every step
  p.task = { kind: 'idle' }; p.path = []; p.pending = null; p.trip = null;
  events.emit(store ? { type: 'noPath' } : { type: 'noStorage' });
}

/** Back to what he was doing before a trip to the bank or the chest, or (0.0.19) before stoking the fire: working a
 *  node, gathering things off the ground (or picking up the one he was after), making something, walking on, or
 *  (0.0.22) practising on the training dummy, or (chapter 2) cooking at the campfire while there is raw fish to cook,
 *  or fighting the rats (by way of the chest for food, when he carries none: systems/rats.ts). */
export function backToWork(state: GameState, layout: Layout, back: Trip | Back, events: EventBus): void {
  if ('to' in back) { walkTo(state, layout, back.to); return; }
  if ('fight' in back) { setOffToFight(state, layout, back.fight, events); return; }
  if ('cook' in back) {
    if (canCook(state, layout) && fishToCook(state, layout) && !goCook(state, layout)) events.emit({ type: 'noPath' });
    return;
  }
  if ('make' in back) {
    const def = makeDef(back.make);
    if (def && canMake(state, layout, def)) goMake(state, layout, def.id);
    return;
  }
  if ('pickupId' in back) {
    // back to gathering: the nearest lying on the ground, or the next to come back; or the one thing he was after
    const group = gatherOf(layout, back.pickupId), spot = layout.pickups?.find(x => x.id === back.pickupId);
    const gives = spot ? PICKUPS[spot.kind].gives : 'book';
    if (group) keepGathering(state, layout, group, gives === 'book' ? null : gives.item, events);
    else if (onGround(state, layout, back.pickupId) && roomFor(state, layout, back.pickupId)) goPickup(state, layout, back.pickupId);
    return;
  }
  const nodeId = back.nodeId, node = state.nodes[nodeId], spot = layout.nodes.find(n => n.id === nodeId);
  if (!node || !spot) return;
  // the camp's goal already has enough of what it gives (counting what he just stored): he doesn't go back
  const item = RESOURCES[spot.resource]!.item, enough = goalHasEnough(state, layout, item);
  if (enough) { events.emit({ type: 'goalEnough', item, goal: enough.id }); return; }
  if (!node.depletedUntil && goWork(state, layout, nodeId)) return;
  if (workNearestFree(state, layout, spot.resource)) return;
  // every one like it is down (or out of reach): wait at his own for it to grow back
  if (!goWork(state, layout, nodeId)) events.emit({ type: 'noPath' });
}
