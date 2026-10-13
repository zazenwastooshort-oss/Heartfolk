// The row of buttons that open the windows (index.html's .rail), dressed for the camp and kept from overflowing (the rustic
// UI pass, 13 Oct 2026). Each button gets its hand-inked icon from RAIL_ICONS (ui/pictures.ts) by its data-opens, and each
// window's and note's close button the inked x, so a new window's button and x pick the look up by themselves. When the
// buttons don't all fit along the row at their size (six on a phone held sideways), the last ones go into a More button
// at its end, which opens a small menu listing them (the same plank look; `railShows` decides how many stay, `railSplit`
// which). A button in the menu is the same button, moved: ui/windows.ts still opens its window and shows it as on, Esc
// closes the menu first, and keyboard focus goes back to More when its window closes (`Windows.focusBack`,
// `Windows.escape`). Buttons that wait to be shown (the book's, Build's) take no room until they show. Changes nothing in
// the game.
import { CLOSE_ICON, RAIL_ICONS } from './pictures';
import { EDGE, type Windows } from './windows';

/** The row's measures (px), as index.html draws it: a button's length along the row (its height down the right side, its
 *  least width along the bottom), the gap between two buttons, and the row's padding and edge at its two ends together. */
export interface RailMeasure { size: number; gap: number; pad: number }
/** Down the right side: each button 56 px tall (.rail-btn's min-height). */
export const RAIL_SIDE: RailMeasure = { size: 56, gap: 3, pad: 14 };
/** Along the bottom on a phone held upright: each button at least 54 px wide (.rail-btn's min-width there), so its label
 *  ("Backpack", "Settings") stays whole. */
export const RAIL_UPRIGHT: RailMeasure = { size: 54, gap: 3, pad: 12 };
/** Where the row starts down the right side, from the screen's top (px; index.html: the top bar's 10 px and 34 px). */
export const RAIL_TOP = 44;
/** A phone held upright (index.html): the row along the bottom. */
export const UPRIGHT_MAX = 600;

/** How many of `count` buttons the row shows in `room` px along it: all of them while they fit, else as many as fit with
 *  a More button after them, which holds the rest (at least one stays in the row). */
export function railShows(count: number, room: number, { size, gap, pad }: RailMeasure): number {
  const fits = (n: number) => n * size + Math.max(0, n - 1) * gap + pad <= room;
  if (fits(count)) return count;
  let n = count - 1;
  while (n > 1 && !fits(n + 1)) n--;
  return Math.max(0, n);
}

/** Which buttons stay in the row and which go into More's menu, in `room` px along the row: only the buttons that show
 *  take room (a hidden one, waiting to be shown, stays in the row out of sight), the first ones that fit stay in their
 *  order, and the rest go into the menu in theirs. Before the row's room is known (0), they all stay. */
export function railSplit<T extends { hidden: boolean | string }>(buttons: readonly T[], room: number, measure: RailMeasure): { row: T[]; menu: T[] } {
  const shown = buttons.filter(b => !b.hidden);
  const inMenu = new Set(room > 0 ? shown.slice(railShows(shown.length, room, measure)) : []);
  return { row: buttons.filter(b => !inMenu.has(b)), menu: buttons.filter(b => inMenu.has(b)) };
}

/** The room along the row on a `width` x `height` screen (px, no notch): along the bottom on a phone held upright, the
 *  width less the screen's edges; down the right side, from under the clock to the bottom edge. */
export function railRoom(width: number, height: number): { room: number; measure: RailMeasure } {
  return width <= UPRIGHT_MAX ? { room: width - 2 * EDGE, measure: RAIL_UPRIGHT } : { room: height - RAIL_TOP - EDGE, measure: RAIL_SIDE };
}

const svg = (inner: string) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;

export class Rail {
  private rail = document.getElementById('rail')!;
  private buttons: HTMLButtonElement[];
  private more = document.createElement('button');
  private menu = document.createElement('div');
  /** An invisible box over the room the row may take (index.html's .rail-room), measured for `railShows`. */
  private room = document.createElement('div');
  private upright = matchMedia(`(max-width: ${UPRIGHT_MAX}px)`);

  constructor(private windows: Windows) {
    this.buttons = [...this.rail.querySelectorAll<HTMLButtonElement>('.rail-btn[data-opens]')];
    for (const b of this.buttons) {
      const icon = RAIL_ICONS[b.dataset.opens!], el = b.querySelector('svg.icon');
      if (icon && el) el.innerHTML = icon;
    }
    for (const el of document.querySelectorAll('.win-x svg.icon')) el.innerHTML = CLOSE_ICON;

    const more = this.more, menu = this.menu;
    more.type = 'button'; more.className = 'rail-btn rail-more'; more.hidden = true;
    more.setAttribute('aria-expanded', 'false'); more.setAttribute('aria-controls', 'railMenu');
    more.innerHTML = `${svg(RAIL_ICONS.more!)}<span>More</span>`;
    menu.className = 'rail-menu'; menu.id = 'railMenu'; menu.hidden = true;
    menu.setAttribute('role', 'group'); menu.setAttribute('aria-label', 'More windows');
    this.rail.append(more, menu);
    this.room.className = 'rail-room'; this.room.setAttribute('aria-hidden', 'true');
    this.rail.parentElement!.append(this.room);

    more.addEventListener('click', () => this.showMenu(!!menu.hidden));
    // a button in the menu opens or closes its window (ui/windows.ts listens to it), then the menu closes
    menu.addEventListener('click', e => { if ((e.target as Element).closest('.rail-btn')) this.showMenu(false); });
    // a tap anywhere else closes it, on another button in the row too (More itself opens and closes it by its click)
    document.addEventListener('pointerdown', e => {
      const t = e.target as Node;
      if (!menu.hidden && !menu.contains(t) && !more.contains(t)) this.showMenu(false);
    }, true);
    windows.escape = () => { if (menu.hidden) return false; this.showMenu(false); return true; };
    windows.focusBack = b => (menu.contains(b) ? more : b);

    new ResizeObserver(() => this.fit()).observe(this.room);
    this.upright.addEventListener('change', () => this.fit());
    // a button shown or hidden (the book's once he has it), a window opened or closed from the menu, the book's new page
    new MutationObserver(records => {
      if (records.some(r => r.target !== more && r.target !== menu)) this.fit();
    }).observe(this.rail, { subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
    this.fit();
  }

  /** Open or close the menu; closing it while focus is inside gives focus back to More. */
  private showMenu(open: boolean): void {
    if (open === !this.menu.hidden) return;
    const inside = this.menu.contains(document.activeElement);
    this.menu.hidden = !open;
    this.more.setAttribute('aria-expanded', String(open));
    this.rail.classList.toggle('menu-open', open);
    this.mark();
    if (open) this.menu.querySelector<HTMLButtonElement>('.rail-btn:not([hidden])')?.focus({ preventScroll: true });
    else if (inside) this.more.focus({ preventScroll: true });
  }

  /** The buttons that fit stay in the row, in their order, and the rest go into More's menu. */
  private fit(): void {
    const upright = this.upright.matches;
    const room = upright ? this.room.clientWidth : this.room.clientHeight;
    const { row, menu } = railSplit(this.buttons, room, upright ? RAIL_UPRIGHT : RAIL_SIDE);
    const inMenu = new Set(menu);
    const focused = document.activeElement;
    // the menu's buttons first, out of the row, so More and its menu never move (only buttons are put in before them)
    this.order(this.menu, menu);
    this.order(this.rail, [...row, this.more, this.menu]);
    if (focused instanceof HTMLElement && focused !== document.activeElement && (this.buttons.includes(focused as HTMLButtonElement) || focused === this.more)) {
      (inMenu.has(focused as HTMLButtonElement) && this.menu.hidden ? this.more : focused).focus({ preventScroll: true });
    }
    if (this.more.hidden !== !inMenu.size) this.more.hidden = !inMenu.size;
    if (!inMenu.size) this.showMenu(false);
    this.mark();
  }

  /** More shows as on while its menu is open or a window from it is, and with the book's dot while a button in it has one. */
  private mark(): void {
    const items = [...this.menu.children];
    const on = !this.menu.hidden || items.some(b => b.classList.contains('on'));
    if (this.more.classList.contains('on') !== on) this.more.classList.toggle('on', on);
    const isNew = items.some(b => b.classList.contains('new'));
    if (this.more.classList.contains('new') !== isNew) this.more.classList.toggle('new', isNew);
  }

  /** Put `children` into `parent` in this order, moving only the ones out of place (a moved button loses focus). */
  private order(parent: HTMLElement, children: Element[]): void {
    children.forEach((el, i) => { if (parent.children[i] !== el) parent.insertBefore(el, parent.children[i] ?? null); });
  }
}
