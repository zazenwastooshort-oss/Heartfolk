// One simulation step: the order systems run in. Headless: no drawing, no DOM, so tests can run days of play.
// Catching up (time the tab spent in the background, or away time when a save is opened) is many steps in a row.
import type { GameState } from './core/state';
import type { Loaded } from './core/save';
import type { EventBus } from './core/events';
import type { Rng } from './core/rng';
import type { Layout } from './world/layout';
import { STEP } from './core/loop';
import { updatePlayer } from './actors/player';
import { updateGathering } from './systems/gathering';
import { updateHauling } from './systems/hauling';
import { updatePickups } from './systems/pickups';
import { updateMaking } from './systems/making';
import { updateGoals } from './systems/goals';
import { updateFire } from './systems/fire';
import { updateCombat } from './systems/combat';
import { restockIfOut, updateRats } from './systems/rats';
import { updateGoblins } from './systems/goblins';
import { updateCooking } from './systems/cooking';
import { closedFor, emptySummary, openFor, tally, type Away, type AwaySummary } from './systems/away';

export interface SimContext { layout: Layout; rng: Rng; events: EventBus }

export function step(state: GameState, dt: number, ctx: SimContext): void {
  state.time += dt;
  const visited = updatePlayer(state, ctx.layout, dt, ctx.events);
  updateGathering(state, ctx.layout, dt, ctx.rng, ctx.events);
  updateCombat(state, ctx.layout, dt, ctx.rng, ctx.events);     // fighting (the training dummy), and health coming back
  updateRats(state, ctx.layout, dt, ctx.rng, ctx.events);       // the rats round their nest (chapter 2): they bite back
  updateGoblins(state, ctx.layout, dt, ctx.rng, ctx.events);    // the goblin camp (chapter 2): goblins, then their chief
  restockIfOut(state, ctx.layout, ctx.events);                  // out of food mid-fight: back to the chest for more
  updatePickups(state, ctx.layout, ctx.events);
  // the camp's goals are written down as they finish, before making uses anything up
  if (ctx.layout.camp) updateGoals(state, ctx.events);
  updateMaking(state, ctx.layout, ctx.events);
  // the camp's fire at night: at nightfall he leaves what he is doing to stoke it (hauling waits meanwhile); reaching
  // the chest for logs is stoking's to see to, so hauling doesn't empty the backpack there again in the same step
  const stoking = ctx.layout.camp ? updateFire(state, ctx.layout, visited, ctx.events) : false;
  // cooking at the campfire (chapter 2): reaching the chest for raw fish is cooking's to see to, as for stoking
  const cooking = ctx.layout.camp ? updateCooking(state, ctx.layout, stoking ? null : visited, ctx.rng, ctx.events) : false;
  // after gathering, so the item that fills the backpack sends him to the bank (the chest) in the same step
  updateHauling(state, ctx.layout, stoking || cooking ? null : visited, ctx.events);
}

/** Catch up `seconds` of play in whole steps, one after another with nothing drawn in between: time the tab spent in
 *  the background, or away time. Every system runs as in play, so he hauls, moves on and stokes the fire once a night
 *  as he would have. Returns what he did meanwhile, counted from the events (systems/away.ts). */
export function catchUp(state: GameState, seconds: number, ctx: SimContext): AwaySummary {
  const summary = emptySummary(), off = ctx.events.on(e => tally(summary, e));
  try { for (let n = Math.round(seconds / STEP); n > 0; n--) step(state, STEP, ctx); }
  finally { off(); }
  return summary;
}

/** Opening a saved game: it was played up to `savedAt` (real time, ms since 1970). If its page was then hidden and
 *  closed at `closedAt` (0.0.21), the time in between was still open: caught up at full speed, as play, and not told.
 *  From when it was closed (or, not knowing, from `savedAt`) until `now` it was away, and he kept working at a fifth of
 *  his speed for at most 2 hours of that (closedFor in systems/away.ts): at most 24 minutes of play, well under a
 *  second. Both before the first frame. What he did while away is returned, for the note. */
export function catchUpAway(state: GameState, savedAt: number | null, now: number, ctx: SimContext, closedAt: number | null = null): { away: Away; summary: AwaySummary } {
  if (savedAt !== null && closedAt !== null && closedAt > savedAt) catchUp(state, openFor((closedAt - savedAt) / 1000).game, ctx);
  const away = closedFor(closedAt ?? savedAt, now);
  return { away, summary: catchUp(state, away.game, ctx) };
}

/** Opening the page (main.ts): away time is caught up only for a save read back from this browser (`loaded`), the
 *  page having been opened or reloaded. None for a new game (no save), and none when the artifact viewer's hot swap
 *  handed over the running game (`handedOver`): it never stopped. */
export function awayOnOpening(loaded: Loaded | null, handedOver: boolean, now: number, ctx: SimContext): { away: Away; summary: AwaySummary } | null {
  return loaded && !handedOver ? catchUpAway(loaded.state, loaded.savedAt, now, ctx, loaded.closedAt) : null;
}
