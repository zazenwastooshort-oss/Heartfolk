// The row of buttons that open the windows (index.html's .rail, in the bar at the foot since 13 Oct 2026), dressed for
// the camp and kept from overflowing (the rustic UI pass, 13 Oct 2026). Each button gets its hand-inked icon from RAIL_ICONS (ui/pictures.ts) by its data-opens, and each
// window's and note's close button the inked x, so a new window's button and x pick the look up by themselves. When the
// buttons don't all fit along the row at their size (on a small phone held sideways), the last ones go into a More button
// at its end, which opens a small menu listing them (the same plank look; `railShows` decides how many stay, `railSplit`
// which). A button in the menu is the same button, moved: ui/windows.ts still opens its window and shows it as on, Esc
// closes the menu first, and keyboard focus goes back to More when its window closes (`Windows.focusBack`,
// `Windows.escape`). Buttons that wait to be shown (the book's, Build's) take no room until they show. Since the slim bar
// (0.0.38) this also says when his state shows compactly, an icon and a number for each (the bar's .compact): where, with
// its words, it would leave the goal line less than GOAL_WANT beside it (`stripCompact`). Changes nothing in the game.
import { CLOSE_ICON, RAIL_ICONS } from './pictures';
import { EDGE, type Windows } from './windows';

/** The row's measures (px), as index.html draws it: a button's least width, the gap between two buttons, and the row's
 *  own padding at its two ends together (none: the bar at the foot is its backing). */
export interface RailMeasure { size: number; gap: number; pad: number }
/** On a phone (held upright, or sideways: short): each button at least 54 px wide (.rail-btn's min-width there), so its
 *  label ("Backpack", "Settings") stays whole. */
export const RAIL_PHONE: RailMeasure = { size: 54, gap: 3, pad: 0 };
/** On a wider and taller screen: each button at least 60 px wide. */
export const RAIL_WIDE: RailMeasure = { size: 60, gap: 3, pad: 0 };
/** A phone held upright, at most this wide (index.html), and a phone held sideways, at most SHORT_MAX tall. */
export const UPRIGHT_MAX = 600, SHORT_MAX = 499;
/** The bar at the foot in rows, the buttons in a row of their own (index.html): a phone held upright, or a screen at
 *  most ROWS_MAX wide and at least ROWS_TALL tall (a tablet held upright). */
export const ROWS_MAX = 900, ROWS_TALL = 600;
/** Whether the bar is in rows on a `width` x `height` screen. */
export const inRows = (width: number, height: number) => width <= UPRIGHT_MAX || (width <= ROWS_MAX && height >= ROWS_TALL);
/** The bar at the foot (index.html's .dock): its padding and border at its two ends together, the gap between the
 *  things on it, and the least width the goal keeps beside the row (.goal's min-width). */
export const DOCK_PAD = 2 * 4 + 2 * 1, DOCK_GAP = 8, GOAL_MIN = 120;
/** The room the goal line wants beside his state, the clock and (in one row) the buttons before his state shows
 *  compactly (px, 0.0.38): its name cut short, a short count ("2 / 7 planks") and the arrow. */
export const GOAL_WANT = 230;

/** The length of a row of `n` buttons (px). */
export const railLength = (n: number, { size, gap, pad }: RailMeasure) => n * size + Math.max(0, n - 1) * gap + pad;

/** How many of `count` buttons the row shows in `room` px along it: all of them while they fit, else as many as fit with
 *  a More button after them, which holds the rest (at least one stays in the row). */
export function railShows(count: number, room: number, measure: RailMeasure): number {
  const fits = (n: number) => railLength(n, measure) <= room;
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

/** The room along the row on a `width` x `height` screen (px): the bar's whole width while the bar is in rows (the row
 *  has one of its own); else what the bar leaves beside his state and the clock (`beside`: their widths with their gaps,
 *  as measured) and the goal's least width. The buttons' size: a phone's (narrow or short), else a wider screen's. */
export function railRoom(width: number, height: number, beside = 0): { room: number; measure: RailMeasure } {
  const bar = width - 2 * EDGE - DOCK_PAD, measure = width <= UPRIGHT_MAX || height <= SHORT_MAX ? RAIL_PHONE : RAIL_WIDE;
  return { room: inRows(width, height) ? bar : bar - beside - GOAL_MIN - DOCK_GAP, measure };
}

/** Whether his state shows compactly (an icon and a number; 0.0.38, the owner's "where room is short") on a `width` x
 *  `height` screen: when, with its words, it would leave the goal line less than GOAL_WANT. `strip`: his state's width
 *  with its words (0 while nothing shows), `time`: the clock's, both as measured; `buttons`: how many buttons show, which
 *  share the goal's row while the bar is in one row (in rows they have one of their own). */
export function stripCompact(width: number, height: number, strip: number, time: number, buttons: number): boolean {
  if (strip <= 0) return false;
  const bar = width - 2 * EDGE - DOCK_PAD, { measure } = railRoom(width, height);
  const rail = inRows(width, height) ? 0 : railLength(buttons, measure) + DOCK_GAP;
  return bar - strip - DOCK_GAP - time - DOCK_GAP - rail < GOAL_WANT;
}

const svg = (inner: string) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;

export class Rail {
  private rail = document.getElementById('rail')!;
  private buttons: HTMLButtonElement[];
  private more = document.createElement('button');
  private menu = document.createElement('div');
  private rows = matchMedia(`(max-width: ${UPRIGHT_MAX}px), (max-width: ${ROWS_MAX}px) and (min-height: ${ROWS_TALL}px)`);

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

    // the bar changes width with the screen, and his state and the clock beside the row with what they show
    const watch = new ResizeObserver(() => this.fit());
    for (const el of [document.getElementById('dock')!, document.getElementById('strip')!, document.querySelector('.dock-time')!]) watch.observe(el);
    this.rows.addEventListener('change', () => this.fit());
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

  /** His state compact or not (stripCompact); then the buttons that fit stay in the row, in their order, and the rest go
   *  into More's menu. */
  private fit(): void {
    const stage = document.getElementById('stage')!, width = stage.clientWidth, height = stage.clientHeight;
    const dock = document.getElementById('dock')!, strip = document.getElementById('strip')!, time = document.querySelector('.dock-time');
    // his state measured with its words: the compact look taken off a moment (nothing is drawn in between)
    dock.classList.remove('compact');
    const full = strip.getBoundingClientRect().width, shown = this.buttons.filter(b => !b.hidden).length;
    if (width > 0 && stripCompact(width, height, full, time ? time.getBoundingClientRect().width : 0, shown)) dock.classList.add('compact');
    const beside = (el: Element | null) => { const w = el ? el.getBoundingClientRect().width : 0; return w > 0 ? w + DOCK_GAP : 0; };
    const { room, measure } = railRoom(width, height, beside(strip) + beside(time));
    const { row, menu } = railSplit(this.buttons, width > 0 ? room : 0, measure);
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
