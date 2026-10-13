// The Settings window (the UI foundation, 12 Oct 2026; opened from the Settings button, ui/windows.ts): the text size
// (Small, Normal or Large, remembered in this browser only; index.html sizes its text in rem from html[data-text-size]),
// whether the tag over his head says what he is doing (ui/activity.ts; remembered in this browser only), the game's
// version with "What's new" (ui/news.ts), and Start over (moved here from "What's new"; for testers trying
// new things, the owner, 12 Oct 2026): it erases this browser's game and begins a new one, on a second tap so a stray
// tap never does; main.ts does the erasing. Room for sound and graphics later: each is one more <section class="set">
// in index.html's #settingsWin. Changes nothing in the game.
import { CHANGELOG } from '../data/changelog';
import type { Windows } from './windows';
import { activityShown } from './activity';

export type TextSize = 'small' | 'normal' | 'large';
export const TEXT_SIZES: readonly TextSize[] = ['small', 'normal', 'large'];
const SIZE_KEY = 'hearthfolk_text_size';
const CONFIRM_SECONDS = 6;             // how long Start over waits for the second tap

/** The text size remembered (or chosen): one of TEXT_SIZES, Normal for anything else (nothing stored yet). */
export const textSizeOf = (value: string | null | undefined): TextSize => TEXT_SIZES.find(s => s === value) ?? 'normal';

const sizeStore = {
  get(): string | null { try { return localStorage.getItem(SIZE_KEY); } catch { return null; } },
  set(size: TextSize): void { try { localStorage.setItem(SIZE_KEY, size); } catch { /* storage blocked: it lasts until the page closes */ } },
};

const $ = (id: string) => document.getElementById(id)!;

export class Settings {
  private reset = $('setReset') as HTMLButtonElement;
  private armedUntil = 0;

  /** news: "What's new", to open from here. startOver: erase this browser's game and begin a new one (main.ts), once
   *  Start over is tapped twice. activity: the tag over his head (ui/activity.ts), shown or not. */
  constructor(windows: Windows, news: { show(): void }, startOver: () => void, activity: { shown: boolean }) {
    this.size(textSizeOf(sizeStore.get()));
    const showActivity = (on: boolean) => {
      activity.shown = on;
      for (const b of document.querySelectorAll<HTMLButtonElement>('#activityShow [data-show]')) b.setAttribute('aria-pressed', String((b.dataset.show === 'on') === on));
    };
    showActivity(activity.shown);
    for (const b of document.querySelectorAll<HTMLButtonElement>('#activityShow [data-show]')) {
      b.addEventListener('click', () => { const on = b.dataset.show === 'on'; showActivity(on); activityShown.set(on); });
    }
    for (const b of document.querySelectorAll<HTMLButtonElement>('#textSize [data-size]')) {
      b.addEventListener('click', () => { const size = textSizeOf(b.dataset.size); this.size(size); sizeStore.set(size); });
    }
    $('setVer').textContent = `Version ${CHANGELOG[0]!.version}`;
    $('setNews').addEventListener('click', () => news.show());
    this.reset.addEventListener('click', () => {
      if (performance.now() < this.armedUntil) { startOver(); return; }
      this.armedUntil = performance.now() + CONFIRM_SECONDS * 1000;
      this.armReset(true);
      setTimeout(() => { if (performance.now() >= this.armedUntil) this.armReset(false); }, CONFIRM_SECONDS * 1000 + 50);
    });
    // closing the window takes back a first tap on Start over
    windows.on((id, open) => { if (id === 'settings' && !open) this.armReset(false); });
  }

  /** Show the text at this size (index.html), and which size is chosen. */
  private size(size: TextSize): void {
    const root = document.documentElement;
    if (size === 'normal') delete root.dataset.textSize; else root.dataset.textSize = size;
    for (const b of document.querySelectorAll<HTMLButtonElement>('#textSize [data-size]')) b.setAttribute('aria-pressed', String(b.dataset.size === size));
  }

  /** Start over as it first reads, or waiting for the second tap. */
  private armReset(armed: boolean): void {
    if (!armed) this.armedUntil = 0;
    this.reset.textContent = armed ? 'Tap again to erase your camp and start over' : 'Start over';
    this.reset.classList.toggle('armed', armed);
  }
}
