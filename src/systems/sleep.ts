// Sleeping in the shelter (12 Oct 2026; bedtimes 13 Oct 2026, the owner: "going to bed is mandatory, every night ...
// you will need at least 6 hours of sleep, you can set the time"). He goes to bed at his bedtime (systems/needs.ts),
// and only then (the owner, 13 Oct 2026, of a tap on the tent sending him early: "not needed"). He lies in the shelter
// for 6 hours from when he lies down (Bed.until in core/needs.ts), however late that is, while play goes quicker
// (playSpeed, used by main.ts), so the night is seen to pass. He gets up well rested, his gathering yielding more often
// until nightfall (SLEEP in data/sleep.ts), and systems/needs.ts sends him back to what he was doing, or to what was
// tapped while he slept.
import { canSleep, maxHealth, type GameState } from '../core/state';
import type { EventBus } from '../core/events';
import { nightOf } from '../core/clock';
import type { Layout, Vec2 } from '../world/layout';
import { WALK_SPEED, goVisit } from '../actors/player';
import { SLEEP } from '../data/sleep';
import { restBonus } from '../core/building';
import { restedTill, wakeAt } from '../core/needs';
import type { Back } from '../core/state';
import { stopStoking } from './backpack';

export { canSleep };

/** Whether he is well rested: a full night's sleep, until nightfall. */
export const isRested = (state: GameState) => state.time < state.restedUntil;

/** How much more often gathering yields while he is well rested: SLEEP.bonus more, or more in a better shelter (the
 *  wall tent, the log cabin: restBonus in core/building.ts). */
export const restedFactor = (state: GameState) => isRested(state) ? 1 + restBonus(state) : 1;

/** How many times faster than real time play goes: SLEEP.speed while he sleeps, else 1 (main.ts; never in a catch-up). */
export const playSpeed = (state: GameState) => state.player.task.kind === 'sleep' ? SLEEP.speed : 1;

/** The seconds of play for `real` seconds since the last frame (main.ts): up to SLEEP.frame of them at playSpeed, the
 *  rest at real speed, so a long gap (the page hidden, the screen off) is never multiplied. */
export function playTime(state: GameState, real: number): number {
  const quick = Math.min(real, SLEEP.frame);
  return quick * playSpeed(state) + (real - quick);
}

/** How long the walk along `path` from `from` takes, in seconds. */
function walkTime(from: Vec2, path: Vec2[]): number {
  let total = 0, at = from;
  for (const w of path) { total += Math.hypot(w.x - at.x, w.z - at.z); at = w; }
  return total / WALK_SPEED;
}

/** Off to bed at his bedtime (systems/needs.ts): to the shelter, where he lies down (updateSleep). `back`: what he goes
 *  back to when he gets up; he gets up SLEEP.hours after he gets there (the walk there counted, so a tap on his way is
 *  told the right time). Returns false when there is no way there. The caller checks there is a shelter and that it is
 *  time. */
export function goToBed(state: GameState, layout: Layout, back: Back | null = null): boolean {
  if (!goVisit(state, layout, 'shelter')) return false;
  state.needs.bed = { back, until: wakeAt(state.time + walkTime(state.player.pos, state.player.path)) };
  return true;
}

/** He lies down when he reaches the shelter (`visited`, actors/player) on his way to bed, for SLEEP.hours from then at
 *  least (Bed.until, as worked out when he set off, or later should he have been held up); then he gets up well rested
 *  until nightfall (restedTill). Lying down he leaves nothing on the go: no walk, no trip, no cooking, and no stoking
 *  (a stoke the fire set off on in this same step, as he reached the door, is stopped, its logs put back, and not set
 *  off again tonight), so when he gets up nothing stale keeps him from going back to what he was doing. */
export function updateSleep(state: GameState, layout: Layout, visited: string | null, events: EventBus): void {
  const p = state.player, n = state.needs;
  if (visited === 'shelter' && canSleep(state, layout) && n.bed && p.task.kind !== 'sleep') {
    const until = Math.max(n.bed.until, wakeAt(state.time));
    n.bed = { back: n.bed.back, until };
    n.slept = Math.max(n.slept, nightOf(state.time));
    p.task = { kind: 'sleep' }; p.trip = null; p.cook = null; p.path = []; p.pending = null;
    stopStoking(state); state.stokeAgain = false;
    events.emit({ type: 'fellAsleep', until });
    return;
  }
  if (p.task.kind === 'sleep' && (!n.bed || state.time >= n.bed.until)) {
    p.task = { kind: 'idle' };
    state.restedUntil = restedTill(state.time);
    state.health = maxHealth(state);                       // a night's sleep heals him (13 Oct 2026, the chapter review)
    events.emit({ type: 'awake' });
  }
}
