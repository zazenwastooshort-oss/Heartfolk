// In-game time of day. One in-game day lasts DAY_SECONDS of real time while the game is open.
import { STOKE } from '../data/fire';
import { SLEEP } from '../data/sleep';

export const DAY_SECONDS = 12 * 60;

/** 0 = midnight, 0.25 = 6:00, 0.5 = noon, 0.75 = 18:00 */
export function dayFraction(time: number): number {
  return ((time / DAY_SECONDS) % 1 + 1) % 1;
}

export function clockLabel(time: number): string {
  const mins = Math.floor(dayFraction(time) * 24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/** Which night `time` falls in, counting from 0 for the first evening: a night runs from nightfall (STOKE.at in
 *  data/fire.ts, 20:00) to the next nightfall, so the small hours after midnight belong to the night before. */
export const nightOf = (time: number) => Math.floor(time / DAY_SECONDS - STOKE.at);

/** Whether `time` is between nightfall and dawn (STOKE.at to STOKE.until), when he stokes the fire. */
export function isNight(time: number): boolean {
  const f = dayFraction(time);
  return f >= STOKE.at || f < STOKE.until;
}

/** Whether, once in bed, he sleeps on at `time`: at night, and in the morning until he gets up (SLEEP.wake, 07:00),
 *  after the light has turned to dawn. He goes to bed only at night (isNight). */
export const sleepsOn = (time: number) => isNight(time) || dayFraction(time) < SLEEP.wake;
