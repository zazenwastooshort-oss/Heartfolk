// Away time (game 0.0.20; the owner's decision of 11 Oct 2026 in docs/PLAN.md), as tables only. While the game is
// open he works at full speed, even in a background tab or with the screen off, for as long as it stays open (0.0.21:
// "if it's open it's open"), and that is just play: no note. While it is closed he keeps working at a fifth of his
// speed, for at most 2 hours of real time; after that nothing more until you come back. When you come back from the
// game being closed, a short note says what he did. systems/away.ts works out the time and counts what he did;
// sim.ts catches it up.

export const AWAY = {
  /** while the game is closed he works at this fraction of his speed: a fifth (0.2x) */
  rate: 0.2,
  /** the most real time closed that counts, in seconds: 2 hours, so at most 24 minutes of play. Easy to change. */
  max: 2 * 60 * 60,
  /** a game left open whose frames stopped (a background tab, the screen off) catches up at full speed when it is
   *  looked at again, all of it (no limit since 0.0.21) */
  openMax: Infinity,
  /** a long catch-up while the game is open is spread over frames, at most this many seconds of play a frame (about
   *  0.1 s of work), so the page never freezes */
  chunk: 30 * 60,
  /** the "While you were away" note shows only after the game was closed (0.0.21), when at least this many seconds of
   *  play were caught up (a minute) and he did something in them */
  note: 60,
};
