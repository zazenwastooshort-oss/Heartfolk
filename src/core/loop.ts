// Fixed time step: the simulation always advances in equal steps, however fast or slow frames arrive,
// so it behaves the same on a phone, a PC and in headless tests.

export const STEP = 1 / 30;
const MAX_FRAME = 0.25;           // after a long pause, don't try to catch up more than this per frame

export class FixedLoop {
  private acc = 0;
  constructor(private step: (dt: number) => void) {}
  /** Feed real elapsed seconds; returns how far into the next step we are (0..1), for smooth drawing. */
  advance(elapsed: number): number {
    this.acc += Math.min(MAX_FRAME, Math.max(0, elapsed));
    while (this.acc >= STEP) { this.step(STEP); this.acc -= STEP; }
    return this.acc / STEP;
  }
}
