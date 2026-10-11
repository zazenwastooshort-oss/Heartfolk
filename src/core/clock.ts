// In-game time of day. One in-game day lasts DAY_SECONDS of real time while the game is open.

export const DAY_SECONDS = 12 * 60;

/** 0 = midnight, 0.25 = 6:00, 0.5 = noon, 0.75 = 18:00 */
export function dayFraction(time: number): number {
  return ((time / DAY_SECONDS) % 1 + 1) % 1;
}

export function clockLabel(time: number): string {
  const mins = Math.floor(dayFraction(time) * 24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
