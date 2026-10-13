// Sleeping in the shelter (12 Oct 2026; bedtimes 13 Oct 2026, the owner: "going to bed is mandatory, every night ...
// you will need at least 6 hours of sleep, you can set the time"). He goes to bed at his bedtime (systems/needs.ts), or
// earlier at night when the player taps the shelter (if he is off to stoke the fire, he stokes it first: Back { sleep }
// in systems/fire.ts). He lies in the shelter until he gets up (Bed.until in core/needs.ts: his waking hour, 6 hours
// after his bedtime; sent early by a tap, 6 hours later but by 07:00), while play goes quicker (playSpeed, used by
// main.ts), so the night is seen to pass. He gets up well rested, his gathering yielding more often until nightfall
// (SLEEP in data/sleep.ts), and systems/needs.ts sends him back to what he was doing, or to what was tapped while he
// slept.
import { canSleep, type GameState } from '../core/state';
import type { EventBus } from '../core/events';
import { isNight, nightOf } from '../core/clock';
import type { Layout } from '../world/layout';
import { goVisit } from '../actors/player';
import { SLEEP } from '../data/sleep';
import { restBonus } from '../core/building';
import { restedTill, wakeAt } from '../core/needs';
import type { Back } from '../core/state';

export { canSleep };

/** Whether he is well rested: a full night's sleep, until nightfall. */
export const isRested = (state: GameState) => state.time < state.restedUntil;

/** How much more often gathering yields while he is well rested: SLEEP.bonus more, or more in a better shelter (the
 *  lean-to, the log hut: restBonus in core/building.ts). */
export const restedFactor = (state: GameState) => isRested(state) ? 1 + restBonus(state) : 1;

/** How many times faster than real time play goes: SLEEP.speed while he sleeps, else 1 (main.ts; never in a catch-up). */
export const playSpeed = (state: GameState) => state.player.task.kind === 'sleep' ? SLEEP.speed : 1;

/** The seconds of play for `real` seconds since the last frame (main.ts): up to SLEEP.frame of them at playSpeed, the
 *  rest at real speed, so a long gap (the page hidden, the screen off) is never multiplied. */
export function playTime(state: GameState, real: number): number {
  const quick = Math.min(real, SLEEP.frame);
  return quick * playSpeed(state) + (real - quick);
}

/** Off to bed: to the shelter, where he lies down (updateSleep). `back`: what he goes back to when he gets up; `until`:
 *  when he gets up, at his bedtime (systems/needs.ts); null when sent early by a tap on the shelter, set once he lies
 *  down. Returns false when there is no way there. The caller checks there is a shelter and that it is time. */
export function goToBed(state: GameState, layout: Layout, back: Back | null = null, until: number | null = null): boolean {
  if (!goVisit(state, layout, 'shelter')) return false;
  state.needs.bed = { back, until };
  return true;
}

/** He lies down when he reaches the shelter at night (`visited`, actors/player) or at his bedtime, until he gets up
 *  (Bed.until; sent early, wakeAt works it out now); then he gets up well rested until nightfall (restedTill). */
export function updateSleep(state: GameState, layout: Layout, visited: string | null, events: EventBus): void {
  const p = state.player, n = state.needs;
  if (visited === 'shelter' && canSleep(state, layout) && (isNight(state.time) || n.bed?.until != null)) {
    const until = n.bed?.until ?? wakeAt(state.time, n.bedtime, true);
    if (until > state.time) {
      n.bed = { back: n.bed?.back ?? null, until };
      n.slept = Math.max(n.slept, nightOf(state.time));
      p.task = { kind: 'sleep' }; p.trip = null; p.cook = null;
      events.emit({ type: 'fellAsleep', until });
      return;
    }
  }
  if (p.task.kind === 'sleep' && (!n.bed || n.bed.until === null || state.time >= n.bed.until)) {
    p.task = { kind: 'idle' };
    state.restedUntil = restedTill(state.time);
    events.emit({ type: 'awake' });
  }
}
