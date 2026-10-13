// Sleeping in the shelter (12 Oct 2026): the notices that go with it, a slow "z" drifting up over the shelter while he
// sleeps (over the one drawn at the tent's spot: the tent, the wall tent, the log cabin), and the day and night dial
// beside the clock (the owner: "a radial for day and night"): a small disc, the day pale and the night dark, noon at the
// top and midnight at the bottom, with a hand at the time of day. Listens to events and reads the game; changes nothing
// in it.
import type { EventBus } from '../core/events';
import type { GameState } from '../core/state';
import { dayFraction } from '../core/clock';
import { stepShown } from '../core/building';
import { wakeLabel } from './needs';
import type { Layout } from '../world/layout';
import { stepPlace } from '../world/steps';
import { STOKE } from '../data/fire';
import { MAKES } from '../data/making';
import type { Hud } from './hud';

/** The notices, in plain words (by day, he isn't tired yet: in the shelter he would sleep in, by its name). */
export const SLEEP_TEXT = {
  cantSleep: (shelter: string) => `He isn't tired yet. He can sleep in the ${shelter} once night falls.`,
  bedLater: "He'll stoke the fire first, then go to bed.",
  fellAsleep: (until: number) => `Goodnight. He sleeps until ${wakeLabel(until)}.`,
  awake: 'He wakes up healed and well rested: gathering goes faster until nightfall.',
  wellFed: 'A hot meal: he is well fed, and learns a little quicker for a while.',
} as const;

/** The dial hand's angle in degrees, clockwise from the top: noon at the top, midnight at the bottom. */
export const dialAngle = (time: number) => (dayFraction(time) * 360 + 180) % 360;

/** A point on the dial (a 24 x 24 box), `r` from its middle, at `deg` clockwise from the top. */
const at = (deg: number, r: number) => `${(12 + r * Math.sin(deg * Math.PI / 180)).toFixed(2)} ${(12 - r * Math.cos(deg * Math.PI / 180)).toFixed(2)}`;

/** The dial: the night dark, the day pale from dawn to nightfall (STOKE.until to STOKE.at), a cream rim, and the hand. */
export function dialSvg(): string {
  const r = 10.2, from = (STOKE.until * 360 + 180) % 360, to = (STOKE.at * 360 + 180) % 360;
  const sweep = ((to - from) % 360 + 360) % 360;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="${r}" fill="#1f3524"/>` +
    `<path d="M12 12 L${at(from, r)} A${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${at(to, r)} Z" fill="#e6d39c"/>` +
    `<circle cx="12" cy="12" r="${r}" fill="none" stroke="#f1e8d4" stroke-width="1.4"/>` +
    `<g id="dialHand"><line x1="12" y1="12" x2="12" y2="4" stroke="#2a2016" stroke-width="3.2" stroke-linecap="round"/>` +
    `<line x1="12" y1="12" x2="12" y2="4" stroke="#f1e8d4" stroke-width="1.6" stroke-linecap="round"/></g>` +
    `<circle cx="12" cy="12" r="1.7" fill="#f1e8d4" stroke="#2a2016" stroke-width=".8"/></svg>`;
}

/** The notices that go with sleeping. */
export function sleepNotices(events: EventBus, hud: Hud): void {
  events.on(e => {
    if (e.type === 'bedLater' || e.type === 'awake' || e.type === 'wellFed') hud.notice(SLEEP_TEXT[e.type]);
    else if (e.type === 'cantSleep') hud.notice(SLEEP_TEXT.cantSleep(MAKES[e.shelter].name.toLowerCase()));
    else if (e.type === 'fellAsleep') hud.notice(SLEEP_TEXT.fellAsleep(e.until));
  });
}

/** The dial, the "Rested" chip beside it, and the "z" over the shelter while he sleeps. */
export class SleepHud {
  private zIn = 0;
  private hand: Element | null;
  private rested: HTMLElement | null;
  private fed: HTMLElement | null;

  constructor(private layout: Layout, private hud: Hud) {
    const dial = document.getElementById('dial');
    if (dial) dial.innerHTML = dialSvg();
    this.hand = document.getElementById('dialHand');
    this.rested = document.getElementById('rested');
    this.fed = document.getElementById('fed');
  }

  update(state: GameState, dt: number): void {
    this.hand?.setAttribute('transform', `rotate(${dialAngle(state.time).toFixed(1)} 12 12)`);
    if (this.rested) this.rested.hidden = !(state.time < state.restedUntil);
    if (this.fed) this.fed.hidden = !(state.time < state.fedUntil);
    if (state.player.task.kind !== 'sleep') { this.zIn = 0; return; }
    this.zIn -= dt;
    if (this.zIn > 0) return;
    this.zIn = 1.1;
    // over the middle of the shelter drawn at the tent's spot (a wall tent, from half built on)
    const shown = stepShown(state, 'tent'), place = shown ? stepPlace(this.layout, shown) : null;
    if (place) this.hud.drift('z', place.pos);
  }
}
