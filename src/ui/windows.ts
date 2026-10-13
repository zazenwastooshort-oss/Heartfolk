// The windows (the UI foundation, the owner's go of 12 Oct 2026): panels that open from the row of buttons (index.html's
// .rail: Backpack, Skills, Book, Settings) and close with their x, with the same button, or with Esc. On a phone one
// window is open at a time, so opening one closes the other; on a wide screen two may stand side by side beside the
// buttons, while they fit clear of the goal card. One look for all (index.html's .win): forest-green canvas in a wooden
// frame, cream text, a header board with the close button, scrolling inside when tall. A window is a <section class="win" data-win="id"
// data-width="360"> in #wins with its title bar and body, and its button a <button data-opens="id"> in the row: a new
// window later is one more of each (tests/windows.test.ts checks every window has both). The notes over the game (.note:
// the welcome, "What's new", "While you were away") are parchment with dark ink; their x does what their own button
// does, and Esc closes a note before any window. With the buttons down the right side the windows stand against them from the top,
// unless that would cover the goal card (a mid-size screen: a tablet held upright, a phone held sideways): then they
// start under the card where there's height for them, or else stand between the card and the buttons, narrower
// (`windowSpot`), so its Build button stays one tap away. This also keeps places on the stage up to date: --below-card
// (the goal card's foot: the hint and notices go under it, and on a phone held upright the windows too), --above-bottom
// (the top of the strip or of the buttons at the foot, where a phone's window ends), --free-width (how much of the
// screen's width is left of the open windows, or of the buttons: the hint and notices sit in the middle of it), and
// --wins-top or --wins-left while the windows make way for the card. Changes nothing in the game.

/** An open window: its id and when it opened (a count). Kept in slot order: slot 0 is next to the buttons. */
export interface Opened { id: string; at: number }

/** The window open longest, or null when none is. */
const longest = (open: readonly Opened[]) => open.reduce<Opened | null>((a, w) => (!a || w.at < a.at ? w : a), null);
/** The window opened last (Esc closes it), or null when none is. */
const newest = (open: readonly Opened[]) => open.reduce<Opened | null>((a, w) => (!a || w.at > a.at ? w : a), null);

/** The open windows after `id` opens at `at`: beside the others while they all fit (`fits`, given the ids in slot
 *  order), otherwise in the place of the one open longest, otherwise alone. One already open stays as it is. */
export function opening(open: readonly Opened[], id: string, at: number, fits: (ids: string[]) => boolean): Opened[] {
  if (open.some(w => w.id === id)) return [...open];
  const one = { id, at }, ids = (list: Opened[]) => list.map(w => w.id);
  const beside = [...open, one];
  if (fits(ids(beside))) return beside;
  const oldest = longest(open);
  const instead = open.map(w => (w === oldest ? one : w));
  return oldest && fits(ids(instead)) ? instead : [one];
}

/** The open windows after `id` closes: the others move up, so the first is always next to the buttons. */
export const closing = (open: readonly Opened[], id: string): Opened[] => open.filter(w => w.id !== id);

/** The open windows that still fit after the screen changed size (turned sideways, a window made narrower): the ones
 *  open longest close first. */
export function fitting(open: readonly Opened[], fits: (ids: string[]) => boolean): Opened[] {
  let kept = [...open];
  while (kept.length > 1 && !fits(kept.map(w => w.id))) kept = closing(kept, longest(kept)!.id);
  return kept;
}

/** Room between things (px), and from the screen's edge (as index.html's --edge). */
export const GAP = 8, EDGE = 16;
/** How much of a wide screen's left side the goal card may take (px, its widest: .goal's max-width in index.html): a
 *  second window opens only clear of it. */
export const GOAL_ROOM = 340;
/** Making way for the goal card: the least height under it worth starting the windows there, and the least width
 *  between it and the buttons worth standing them there (px; the backpack's 7 slots across stay about 40 px). */
export const MIN_UNDER = 360, MIN_BESIDE = 320;

/** Where the open windows stand with the buttons down the right side: against them from the top ('top'), unless that
 *  would cover the goal card; then under the card where there is height enough ('under'), else between the card and
 *  the buttons, narrower ('beside'), while that leaves width enough; else whichever of the two leaves more. `right` and
 *  `bottom` are the windows' room's right and bottom edges, `card` the goal card's box (null while there is none) and
 *  `widths` the open windows' widths, the first next to the buttons (px, from the screen's top left). */
export type Spot = 'top' | 'under' | 'beside';
export interface Room { right: number; bottom: number; card: { right: number; bottom: number } | null; widths: number[] }

export function windowSpot({ right, bottom, card, widths }: Room): Spot {
  if (!card || !widths.length) return 'top';
  const left = right - widths.reduce((a, w) => a + w, GAP * (widths.length - 1));
  if (left >= card.right + GAP) return 'top';
  const under = bottom - (card.bottom + GAP), beside = right - (card.right + GAP);
  if (under >= MIN_UNDER) return 'under';
  if (beside >= MIN_BESIDE) return 'beside';
  return under >= beside ? 'under' : 'beside';
}

const $ = (id: string) => document.getElementById(id)!;
/** A phone: held upright (narrow) or sideways (short). One window at a time. */
const PHONE = '(max-width: 600px), (max-height: 499px)';
/** Held upright (index.html): the buttons along the bottom, and a window between the goal card and the strip. */
const UPRIGHT = '(max-width: 600px)';

interface Win { id: string; el: HTMLElement; button: HTMLButtonElement | null; width: number; available: boolean }

export class Windows {
  private wins = new Map<string, Win>();
  private opened: Opened[] = [];
  private count = 0;
  private listeners: ((id: string, open: boolean) => void)[] = [];
  private stage = $('stage');
  private rail = $('rail');
  private phone = matchMedia(PHONE);
  private upright = matchMedia(UPRIGHT);

  constructor() {
    for (const el of document.querySelectorAll<HTMLElement>('#wins > .win[data-win]')) {
      const id = el.dataset.win!, width = Number(el.dataset.width) || 360;
      const button = this.rail.querySelector<HTMLButtonElement>(`[data-opens="${id}"]`);
      el.style.setProperty('--w', `${width}px`);
      this.wins.set(id, { id, el, button, width, available: !!button && !button.hidden });
      el.querySelector('.win-x')?.addEventListener('click', () => this.close(id));
      button?.addEventListener('click', () => this.toggle(id));
    }
    // a note's x does what its own button does ("Got it", "Get up")
    for (const x of document.querySelectorAll<HTMLButtonElement>('.note .win-x[data-close]')) {
      x.addEventListener('click', () => document.getElementById(x.dataset.close!)?.click());
    }
    // Esc closes a note first, else the window opened last. This listens as the key goes down to the page, before the
    // notes' own handlers and ui/input.ts, so one press closes one thing.
    window.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      const note = [...document.querySelectorAll<HTMLElement>('.note')].find(n => !n.hidden), last = newest(this.opened);
      if (note) document.getElementById(note.querySelector<HTMLElement>('[data-close]')?.dataset.close ?? '')?.click();
      else if (this.escape()) { /* the row's More menu closed first (ui/rail.ts) */ }
      else if (last) this.close(last.id);
      else return;
      e.preventDefault(); e.stopPropagation();
    }, true);
    // where the goal card ends and the strip and buttons begin change with the screen, the text size and what they show
    const place = new ResizeObserver(() => this.place());
    for (const id of ['stage', 'goal', 'strip', 'rail']) place.observe($(id));
    window.addEventListener('resize', () => { this.refit(); this.place(); });
    this.place();
  }

  /** Esc closes this first, before any window, when it says it did (ui/rail.ts: the row's More menu while it is open). */
  escape: () => boolean = () => false;
  /** Where keyboard focus goes back to when a window closes: its button, or what stands in for it while the button can't
   *  be seen (ui/rail.ts: the row's More, while the button is in its menu). */
  focusBack: (button: HTMLButtonElement) => HTMLElement = b => b;

  /** Called with a window's id whenever it opens or closes (closed to make room for another, too). */
  on(listener: (id: string, open: boolean) => void): void { this.listeners.push(listener); }

  isOpen(id: string): boolean { return this.opened.some(w => w.id === id); }

  /** Whether a window can be opened now: its button shows (the book's once he has it). */
  isAvailable(id: string): boolean { return this.wins.get(id)?.available ?? false; }

  /** Show or hide a window's button (his book once he has it); a window no longer available closes. */
  setAvailable(id: string, yes: boolean): void {
    const w = this.wins.get(id);
    if (!w || w.available === yes) return;
    w.available = yes;
    if (w.button) w.button.hidden = !yes;
    if (!yes) this.close(id);
  }

  toggle(id: string): void { if (this.isOpen(id)) this.close(id); else this.open(id); }

  /** Open a window: beside the others while they fit, else in place of the one open longest (on a phone, the one open). */
  open(id: string): void {
    const w = this.wins.get(id);
    if (!w || this.isOpen(id)) return;
    const before = this.opened;
    this.opened = opening(before, id, ++this.count, this.fits);
    this.show();
    for (const o of before) if (!this.isOpen(o.id)) this.tell(o.id, false);
    this.tell(id, true);
    w.el.querySelector<HTMLElement>('.win-x')?.focus({ preventScroll: true });
  }

  close(id: string): void {
    const w = this.wins.get(id);
    if (!w || !this.isOpen(id)) return;
    const focused = w.el.contains(document.activeElement);
    this.opened = closing(this.opened, id);
    this.show();
    // keyboard focus goes back to the window's button, rather than being lost with the window
    if (focused) {
      if (w.button && !w.button.hidden) this.focusBack(w.button).focus({ preventScroll: true });
      else (document.activeElement as HTMLElement | null)?.blur();
    }
    this.tell(id, false);
  }

  /** Whether these windows fit side by side: one always does; on a phone no more; on a wider screen while they fit
   *  between the goal card and the buttons. */
  private fits = (ids: string[]): boolean => {
    if (ids.length <= 1) return true;
    if (this.phone.matches) return false;
    const room = this.rail.getBoundingClientRect().left - GAP - EDGE - ($('goal').hidden ? 0 : GOAL_ROOM + GAP);
    return ids.reduce((a, id) => a + (this.wins.get(id)?.width ?? 0), 0) + GAP * (ids.length - 1) <= room;
  };

  /** Each window shown or hidden, in its slot (the first next to the buttons), and its button saying so. */
  private show(): void {
    for (const w of this.wins.values()) {
      const slot = this.opened.findIndex(o => o.id === w.id), on = slot >= 0;
      if (w.el.hidden === on) w.el.hidden = !on;
      w.el.style.order = String(Math.max(0, slot));
      if (w.button) { w.button.classList.toggle('on', on); w.button.setAttribute('aria-expanded', String(on)); }
    }
    this.place();
  }

  private tell(id: string, open: boolean): void { for (const l of this.listeners) l(id, open); }

  /** The screen changed size: close the windows that no longer fit side by side. */
  private refit(): void {
    const kept = fitting(this.opened, this.fits);
    if (kept.length === this.opened.length) return;
    const gone = this.opened.filter(w => !kept.includes(w));
    this.opened = kept;
    this.show();
    for (const w of gone) this.tell(w.id, false);
  }

  /** --below-card: just under the goal card (or the top bar where there is no card). On a phone held upright,
   *  --above-bottom: just over the strip (while it shows) or the buttons, measured from the foot of the screen, and
   *  --free-width the whole width (a notice shows over the window). With the buttons down the right side, the windows
   *  make way for the goal card (windowSpot: --wins-top under it, or --wins-left beside it), and --free-width is the
   *  width left of the open windows, or of the buttons while none is open or the windows are under the card (a notice
   *  shows over them then, as on a phone). */
  private place(): void {
    const stage = this.stage.getBoundingClientRect(), card = $('goal'), cardBox = card.hidden ? null : card.getBoundingClientRect();
    const under = (cardBox ?? document.querySelector('.topbar')!.getBoundingClientRect()).bottom;
    this.setVar('--below-card', under - stage.top + GAP);
    if (this.upright.matches) {
      const strip = $('strip').getBoundingClientRect(), top = Math.min(this.rail.getBoundingClientRect().top, strip.height > 0 ? strip.top : Infinity);
      this.setVar('--above-bottom', stage.bottom - top + GAP);
      this.setVar('--free-width', stage.width);
      this.setVar('--wins-top', null); this.setVar('--wins-left', null);
      return;
    }
    // the windows' room ends at the buttons and the screen's foot, whether or not they make way for the card
    const room = $('wins').getBoundingClientRect();
    const spot = windowSpot({ right: room.right, bottom: room.bottom, card: cardBox, widths: this.opened.map(o => this.wins.get(o.id)!.width) });
    this.setVar('--wins-top', spot === 'under' ? under - stage.top + GAP : null);
    this.setVar('--wins-left', spot === 'beside' ? cardBox!.right - stage.left + GAP : null);
    const lefts = spot === 'under' ? [] : this.opened.map(o => this.wins.get(o.id)!.el.getBoundingClientRect().left);
    this.setVar('--free-width', (lefts.length ? Math.min(...lefts) : this.rail.getBoundingClientRect().left) - GAP - stage.left);
  }

  /** Set a place on the stage (px), or take it away (null) so index.html's own value holds. */
  private setVar(name: string, px: number | null): void {
    const value = px === null ? '' : `${Math.round(px)}px`;
    if (this.stage.style.getPropertyValue(name) === value) return;
    if (px === null) this.stage.style.removeProperty(name); else this.stage.style.setProperty(name, value);
  }
}
