// Stoking the fire at night (game 0.0.19; data/fire.ts): once the campfire and the storage chest both stand, each
// night at nightfall he leaves what he is doing, walks to the chest, takes a few logs (from the chest first, then his
// backpack; fewer if that's all there is), walks to the fire, stokes it a moment (its flames flare up) and goes back
// to what he was doing. Once a night. With no log anywhere he doesn't go, and the fire burns low until it is next
// stoked; nothing is lost. If he is making something at nightfall he finishes it first. A full backpack (or one he
// was taking to the chest anyway) is emptied at the chest on the way. A command from the player stops it
// (systems/commands): logs he carries go back into the chest, and he doesn't set off again that night; a tap on the
// chest while he is on his way there for the logs only has him empty the backpack there too. It runs every step, so
// catching up (time spent in a background tab, or away time while the game was closed) stokes once a night, as
// playing does.
import { owned, type Back, type GameState, type Stoke } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout } from '../world/layout';
import { siteOf } from '../world/layout';
import { isNight, nightOf } from '../core/clock';
import { goVisit } from '../actors/player';
import { STOKE } from '../data/fire';
import { backpackCount, backpackFull, deposit, isStore, stopStoking, useUp } from './backpack';
import { backToWork } from './hauling';

/** Whether the fire is his to stoke: the campfire and the storage chest both stand in this layout. */
export const canStoke = (state: GameState, layout: Layout) =>
  !!siteOf(layout, 'hearth') && !!siteOf(layout, 'chest') && state.built.includes('campfire') && state.built.includes('chest');

/** What he is doing, to go back to after stoking: on a trip to the chest, back to what the trip goes back to; working
 *  or on the way to work; gathering or picking something up; on the way to make something; walking to a spot. Null
 *  for nothing (he stays by the fire). */
function backOf(state: GameState): Back | null {
  const p = state.player, task = p.task, pending = p.pending;
  if (p.trip) return 'nodeId' in p.trip ? { nodeId: p.trip.nodeId } : { pickupId: p.trip.pickupId };
  if (task.kind === 'gather') return { nodeId: task.nodeId };
  if (task.kind === 'pickup') return { pickupId: task.id };
  if (pending?.kind === 'node') return { nodeId: pending.id };
  if (pending?.kind === 'pickup') return { pickupId: pending.id };
  if (pending?.kind === 'make') return { make: pending.id };
  if (task.kind === 'walk' && !pending && p.path.length) return { to: { ...p.path.at(-1)! } };
  return null;
}

/** The fire burns low tonight: no logs. */
function burnLow(state: GameState, events: EventBus): void {
  state.fireLow = true;
  events.emit({ type: 'fireLow' });
}

/** Done with stoking (or it couldn't go on): back to what he was doing. */
function finish(state: GameState, layout: Layout, stoke: Stoke, events: EventBus): void {
  state.player.stoke = null;
  if (stoke.back) backToWork(state, layout, stoke.back, events);
}

/** At the chest: empty the backpack into it if it is full (or he was bringing it anyway; never an empty one), take the
 *  logs, and on to the fire. */
function atChest(state: GameState, layout: Layout, stoke: Stoke, events: EventBus): void {
  if ((stoke.empty || backpackFull(state)) && backpackCount(state) > 0) deposit(state, events);
  const have = owned(state, STOKE.item);
  if (have <= 0) { burnLow(state, events); finish(state, layout, stoke, events); return; }   // used since he set off
  stoke.logs = Math.min(STOKE.logs, have);
  useUp(state, { [STOKE.item]: stoke.logs }, true);
  if (goVisit(state, layout, 'campfire')) return;
  events.emit({ type: 'noPath' });
  const back = stoke.back;
  stopStoking(state);
  if (back) backToWork(state, layout, back, events);
}

/** `visited`: the building or built thing he reached this step (from updatePlayer), if any. Returns whether stoking
 *  saw to that visit (reaching the chest or the fire), so hauling doesn't see to it again in the same step. */
export function updateFire(state: GameState, layout: Layout, visited: string | null, events: EventBus): boolean {
  const p = state.player, stoke = p.stoke;
  if (stoke) {
    if (visited === 'chest' && stoke.logs === 0) { atChest(state, layout, stoke, events); return true; }
    if (visited === 'campfire' && stoke.logs > 0) { p.task = { kind: 'stoke', doneAt: state.time + STOKE.time }; return true; }
    if (p.task.kind === 'stoke') {
      if (state.time < p.task.doneAt) return false;
      p.task = { kind: 'idle' };
      state.fireLow = false;
      events.emit({ type: 'stoked', logs: stoke.logs });
      finish(state, layout, stoke, events);
      return false;
    }
    // on the way to the chest, or with the logs to the fire: carry on
    if (p.pending?.kind === 'visit' && p.pending.id === (stoke.logs ? 'campfire' : 'chest')) return false;
    // anything else can't happen in play (commands stop stoking); put the logs back and stop
    stopStoking(state);
    return false;
  }
  if (!isNight(state.time)) return false;
  const night = nightOf(state.time);
  if (state.stokedNight >= night) return false;
  // a night that began before the fire and the chest both stood isn't his to see to: from the next one on
  if (!canStoke(state, layout)) { state.stokedNight = night; return false; }
  if (p.task.kind === 'make') return false;                 // he finishes what he is making first
  state.stokedNight = night;
  if (owned(state, STOKE.item) <= 0) { burnLow(state, events); return false; }
  const back = backOf(state);
  // a full backpack on its way to the chest is emptied there on the way (not one just emptied, as he stands at it)
  const empty = (!!p.trip && p.trip.leaveAt === undefined) || (p.pending?.kind === 'visit' && isStore(state, layout, p.pending.id));
  const was = { task: p.task, path: p.path, pending: p.pending };
  if (!goVisit(state, layout, 'chest')) {
    p.task = was.task; p.path = was.path; p.pending = was.pending;
    events.emit({ type: 'noPath' });
    return false;
  }
  p.trip = null;
  p.stoke = { back, logs: 0, empty };
  events.emit({ type: 'stokeOff' });
  return false;
}
