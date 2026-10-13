// His bedtime, in the Settings window (13 Oct 2026, the owner: "going to bed is mandatory, every night ... you will need
// at least 6 hours of sleep, you can set the time"; "no earlier than 22.00 and indeed latest 7"): a row of buttons, one
// per hour he can go to bed (SLEEP.bedtimes: 22:00 to 01:00), and a line saying when he sleeps. A tap queues the
// bedtime command; the game keeps it (core/needs.ts). Changes nothing in the game itself.
import type { GameState } from '../core/state';
import type { Command } from '../systems/commands';
import { SLEEP } from '../data/sleep';

const $ = (id: string) => document.getElementById(id)!;

/** An hour as the clock shows it: 22:00, 01:00. */
export const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

/** The line under the buttons. */
export const bedtimeText = (bedtime: number) =>
  `Once his shelter stands, he goes to bed there at ${hourLabel(bedtime)} every night, once he has finished what he is doing, and sleeps ${SLEEP.hours} hours.`;

export class BedtimeSetting {
  private shown = -1;
  private buttons: HTMLButtonElement[];

  constructor(queue: Command[]) {
    this.buttons = SLEEP.bedtimes.map(hour => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.hour = String(hour);
      b.textContent = hourLabel(hour);
      b.addEventListener('click', () => queue.push({ type: 'bedtime', hour }));
      return b;
    });
    $('bedtime').replaceChildren(...this.buttons);
  }

  update(state: GameState): void {
    const bedtime = state.needs.bedtime;
    if (bedtime === this.shown) return;
    this.shown = bedtime;
    for (const b of this.buttons) b.setAttribute('aria-pressed', String(Number(b.dataset.hour) === bedtime));
    $('bedtimeSays').textContent = bedtimeText(bedtime);
  }
}
