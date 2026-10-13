// Stoking the fire at night (game 0.0.19; data/fire.ts): once the campfire stands with somewhere to take logs from
// (the firewood pile since 0.0.21, or the storage chest), each night at nightfall he leaves what he is doing, walks
// to the pile (or, with the pile empty or not built, the chest), takes a few logs (fewer if that's all there is),
// walks to the fire, stokes it a moment (its flames flare up) and goes back to what he was doing. Once a night. With
// neither holding a log he takes them from his backpack and goes straight to the fire; with no log anywhere he doesn't
// go, and the fire burns low until it is next stoked; nothing is lost. If he is making something at nightfall he
// finishes it first. A full backpack (or one he was taking to the chest anyway) is emptied at the chest on the way. A
// command from the player stops it (systems/commands): logs he carries go back where he took them from, and since
// 0.0.21 he sets off again once he has nothing to do, the same night (the owner, 12 Oct 2026); a tap on the pile or the
// chest while he is on his way there for the logs only sends him on. A tap on the built pile stacks the logs he
// carries on it. It runs every step, so catching up (time in a background tab, or away time while the game was closed)
// stokes once a night, as playing does. Cooking at the campfire (chapter 2) is left like anything else, and gone back to.
import { owned, type Back, type GameState, type Stoke } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout } from '../world/layout';
import { siteOf } from '../world/layout';
import { isNight, nightOf } from '../core/clock';
import { goVisit } from '../actors/player';
import { canStoke, chestHere } from '../core/camp';
import { STOKE, WOODPILE } from '../data/fire';
import { backpackCount, backpackFull, deposit, isStore, stopStoking, useUp } from './backpack';
import { backToWork } from './hauling';

// whether the fire is his to stoke (the campfire, with the pile or the chest to take logs from): core/camp.ts
export { canStoke };

/** Whether the firewood pile stands here, or the storage chest (in the shelter: core/camp.ts). */
const isBuilt = (state: GameState, layout: Layout, id: 'woodpile' | 'chest') =>
  id === 'chest' ? chestHere(state, layout) : !!siteOf(layout, id) && state.built.includes(id);

/** Where he takes the logs from: the pile while it holds any, else the chest while it holds any, else his backpack
 *  (null); or nowhere (false) when there is no log anywhere. */
function logsFrom(state: GameState, layout: Layout): 'woodpile' | 'chest' | null | false {
  if (isBuilt(state, layout, 'woodpile') && state.woodpile > 0) return 'woodpile';
  if (isBuilt(state, layout, 'chest') && (state.bank[STOKE.item] ?? 0) > 0) return 'chest';
  return (state.player.backpack[STOKE.item] ?? 0) > 0 ? null : false;
}

/** What he is doing, to go back to after stoking: cooking at the campfire (chapter 2); on a trip to the chest, back to
 *  what the trip goes back to; working or on the way to work; gathering or picking something up; on the way to make
 *  something; walking to a spot; (0.0.22) practising on the training dummy or on the way to it. Null for nothing (he
 *  stays by the fire). */
export function backOf(state: GameState): Back | null {
  const p = state.player, task = p.task, pending = p.pending;
  if (p.cook) return { cook: true };
  if (p.trip) return 'nodeId' in p.trip ? { nodeId: p.trip.nodeId } : 'pickupId' in p.trip ? { pickupId: p.trip.pickupId } : { fight: p.trip.fight };
  if (task.kind === 'gather') return { nodeId: task.nodeId };
  if (task.kind === 'pickup') return { pickupId: task.id };
  if (task.kind === 'fight') return { fight: task.target };
  if (task.kind === 'raise') return { raise: task.id };
  if (pending?.kind === 'node') return { nodeId: pending.id };
  if (pending?.kind === 'pickup') return { pickupId: pending.id };
  if (pending?.kind === 'make') return { make: pending.id };
  if (pending?.kind === 'fight') return { fight: pending.id };
  if (pending?.kind === 'raise') return { raise: pending.id };
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

/** With the logs in hand: on to the fire, or (no way there) put them back and go back to what he was doing. */
function toFire(state: GameState, layout: Layout, stoke: Stoke, events: EventBus): void {
  if (goVisit(state, layout, 'campfire')) return;
  events.emit({ type: 'noPath' });
  const back = stoke.back;
  stopStoking(state);
  if (back) backToWork(state, layout, back, events);
}

/** At the pile or the chest: take the logs there and on to the fire. At the chest, empty the backpack into it first if
 *  it is full (or he was bringing it anyway; never an empty one). If the pile ran out since he set off, the logs come
 *  from the chest and his backpack instead; with none anywhere the fire burns low. */
function atSource(state: GameState, layout: Layout, stoke: Stoke, events: EventBus): void {
  if (stoke.from === 'chest' && (stoke.empty || backpackFull(state)) && backpackCount(state) > 0) deposit(state, events);
  if (stoke.from === 'woodpile' && state.woodpile > 0) {
    stoke.logs = Math.min(STOKE.logs, state.woodpile);
    state.woodpile -= stoke.logs;
  } else {
    const have = owned(state, STOKE.item);
    if (have <= 0) { burnLow(state, events); finish(state, layout, stoke, events); return; }   // used since he set off
    stoke.logs = Math.min(STOKE.logs, have);
    useUp(state, { [STOKE.item]: stoke.logs }, true);
    stoke.from = 'chest';                      // put back into the chest, should he be stopped on the way to the fire
  }
  toFire(state, layout, stoke, events);
}

/** A tap on the firewood pile: the logs he carries are stacked on it, up to what it holds. */
function stackLogs(state: GameState, events: EventBus): void {
  const pack = state.player.backpack, have = pack[STOKE.item] ?? 0, n = Math.min(have, WOODPILE.max - state.woodpile);
  if (n <= 0) { events.emit({ type: 'stacked', logs: 0, pile: state.woodpile, reason: have > 0 ? 'full' : 'none' }); return; }
  if (n === have) delete pack[STOKE.item]; else pack[STOKE.item] = have - n;
  state.woodpile += n;
  events.emit({ type: 'stacked', logs: n, pile: state.woodpile });
}

/** Set off to stoke the fire: for the logs to the pile or the chest, or straight to the fire with logs from his
 *  backpack. With no log anywhere the fire burns low. */
function setOff(state: GameState, layout: Layout, events: EventBus): void {
  const p = state.player, from = logsFrom(state, layout);
  if (from === false) { burnLow(state, events); return; }
  const back = backOf(state);
  // a full backpack on its way to the chest is emptied there on the way (not one just emptied, as he stands at it; nor
  // one on its way there for raw fish to cook, which isn't a trip to store things; nor, chapter 2, for food to fight
  // with, unless the player tapped the chest meanwhile: a full one is emptied all the same, atSource)
  const food = !!p.trip && 'fight' in p.trip && !p.trip.store;
  const empty = from === 'chest' && !food && ((!!p.trip && p.trip.leaveAt === undefined) || (p.pending?.kind === 'visit' && isStore(state, layout, p.pending.id) && !p.cook));
  const was = { task: p.task, path: p.path, pending: p.pending };
  if (from === null) {
    // nothing in the pile or the chest: the logs come out of his backpack, and he goes straight to the fire
    if (!goVisit(state, layout, 'campfire')) { p.task = was.task; p.path = was.path; p.pending = was.pending; events.emit({ type: 'noPath' }); return; }
    const logs = Math.min(STOKE.logs, p.backpack[STOKE.item] ?? 0);
    useUp(state, { [STOKE.item]: logs });
    p.trip = null; p.cook = null;
    p.stoke = { back, logs, empty: false, from: null };
  } else {
    if (!goVisit(state, layout, from)) { p.task = was.task; p.path = was.path; p.pending = was.pending; events.emit({ type: 'noPath' }); return; }
    p.trip = null; p.cook = null;
    p.stoke = { back, logs: 0, empty, from };
  }
  events.emit({ type: 'stokeOff' });
}

/** Whether he has nothing to do: standing about, going nowhere, on no trip. */
const idle = (state: GameState) => { const p = state.player; return p.task.kind === 'idle' && !p.pending && !p.trip && !p.path.length; };

/** `visited`: the building or built thing he reached this step (from updatePlayer), if any. Returns whether this saw
 *  to that visit (reaching the pile, the chest or the fire for stoking, or the pile to stack logs), so hauling doesn't
 *  see to it again in the same step. */
export function updateFire(state: GameState, layout: Layout, visited: string | null, events: EventBus): boolean {
  const p = state.player, stoke = p.stoke;
  if (stoke) {
    if (visited && visited === stoke.from && stoke.logs === 0) { atSource(state, layout, stoke, events); return true; }
    if (visited === 'campfire' && stoke.logs > 0) { p.task = { kind: 'stoke', doneAt: state.time + STOKE.time }; return true; }
    if (p.task.kind === 'stoke') {
      if (state.time < p.task.doneAt) return false;
      p.task = { kind: 'idle' };
      state.fireLow = false;
      events.emit({ type: 'stoked', logs: stoke.logs });
      finish(state, layout, stoke, events);
      return false;
    }
    // on the way to the logs, or with the logs to the fire: carry on
    if (p.pending?.kind === 'visit' && p.pending.id === (stoke.logs ? 'campfire' : stoke.from)) return false;
    // anything else can't happen in play (commands stop stoking); put the logs back and stop
    stopStoking(state);
    return false;
  }
  if (visited === 'woodpile' && isBuilt(state, layout, 'woodpile')) { stackLogs(state, events); return true; }
  if (!isNight(state.time)) { state.stokeAgain = false; return false; }
  const night = nightOf(state.time);
  if (state.stokedNight >= night) {
    // the player stopped him on his way tonight: he goes again once he has nothing to do
    if (state.stokeAgain && idle(state) && canStoke(state, layout)) { state.stokeAgain = false; setOff(state, layout, events); }
    return false;
  }
  // a night that began before the fire and somewhere to take logs from both stood isn't his to see to: from the next on
  if (!canStoke(state, layout)) { state.stokedNight = night; return false; }
  if (p.task.kind === 'make') return false;                 // he finishes what he is making first
  if (p.task.kind === 'knockedOut') return false;           // (chapter 2's rats) he wakes up first
  state.stokedNight = night;
  state.stokeAgain = false;
  setOff(state, layout, events);
  return false;
}
