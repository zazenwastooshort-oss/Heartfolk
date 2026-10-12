// Away time (game 0.0.20; the owner's decision of 11 Oct 2026 in docs/PLAN.md), as tables only. While the game is
// open he works at full speed, even in a background tab or with the screen off. While it is closed he keeps working
// at a fifth of his speed, for at most 2 hours of real time; after that nothing more until you come back. When you come
// back, a short note says what he did. systems/away.ts works out the time and counts what he did; sim.ts catches it up.

export const AWAY = {
  /** while the game is closed he works at this fraction of his speed: a fifth (0.2x) */
  rate: 0.2,
  /** the most real time closed that counts, in seconds: 2 hours, so at most 24 minutes of play. Easy to change. */
  max: 2 * 60 * 60,
  /** a game left open whose frames stopped (a background tab, the screen off) catches up at full speed when it is
   *  looked at again, at most this many seconds of real time at once */
  openMax: 2 * 60 * 60,
  /** the "While you were away" note shows only when at least this many seconds of play were caught up (a minute) and
   *  he did something in them */
  note: 60,
};
