// The camp's menu (the camp build's stage 5; the owner, 13 Oct 2026: "you upgrade by the building tab, and or right
// clicking the object"; In 5): a right click on a building at the camp, or a long press on a phone, opens a small
// wooden board beside it listing what can be done there (core/camp.ts campActions): Look in the chest, Store
// everything, Sleep, Upgrade to the next step, Carry on with it, Build the chest, Cook, Stack logs, Practise, Build
// what its marker is for. What a plain tap there does is the amber one. One that can't be chosen now stays in the list,
// faded, saying why; chosen anyway (or chosen as the game changed under it: night fell, the build finished), it is
// refused with that reason as a notice. It refreshes while open, keeps on the screen clear of the goal card and the row
// of buttons (menuSpot), its entries at least 44 px tall, and closes on Esc, a tap or click anywhere else, a choice, or
// the camera turning or zooming (ui/input.ts). Look in opens the Backpack window at the chest's section; everything
// else is the command a tap in the world sends (commandOf). Reads state; never changes the game.
import type { GameState } from '../core/state';
import type { Command } from '../systems/commands';
import type { Layout } from '../world/layout';
import type { Hud } from './hud';
import type { Windows } from './windows';
import { actionKey, campActions, campTap, tapBoxOf, type CampAction, type CampEntry, type CampWhy } from '../core/camp';
import { buildTime, progressOf, stageOf, stepShown } from '../core/building';
import { STAGE_NAMES, type LineId } from '../data/building';
import { MAKES } from '../data/making';
import { MENU } from '../data/input';
import { itemList } from './hud';
import { EDGE, GAP } from './windows';
import { buildWhyText, workTime } from './build';

const $ = (id: string) => document.getElementById(id)!;

/** The command an action sends, as a tap in the world would (T1.6: a marker's tap and the Build list's row send the
 *  same); null for Look in, which only opens the chest's section of the Backpack window. */
export function commandOf(action: CampAction): Command | null {
  switch (action.kind) {
    case 'look': return null;
    case 'store': return { type: 'visit', id: 'chest' };
    case 'sleep': return { type: 'sleep' };
    case 'build': return { type: 'build', id: action.id };
    case 'cook': return { type: 'cook' };
    case 'stack': return { type: 'visit', id: 'woodpile' };
    case 'practise': return { type: 'fight', target: 'dummy' };
  }
}

/** An entry's words: "Look in the chest", "Upgrade to a wall tent", "Carry on with the log cabin". */
export function labelOf(action: CampAction): string {
  const name = (id: keyof typeof MAKES) => MAKES[id].name.toLowerCase();
  switch (action.kind) {
    case 'look': return 'Look in the chest';
    case 'store': return 'Store everything';
    case 'sleep': return `Sleep in the ${action.shelter ? name(action.shelter) : 'shelter'}`;
    case 'build': return action.how === 'carry' ? `Carry on with the ${name(action.id)}` : action.how === 'upgrade' ? `Upgrade to a ${name(action.id)}`
      : `${MAKES[action.id].verb} the ${name(action.id)}`;
    case 'cook': return 'Cook fish';
    case 'stack': return 'Stack logs';
    case 'practise': return 'Practise';
  }
}

/** Why an entry can't be chosen now, in plain words. */
export function whyText(why: CampWhy): string {
  switch (why.kind) {
    case 'day': return "He isn't tired until night falls.";
    case 'asleep': return "He's asleep.";
    case 'empty': return 'Nothing on him to store.';
    case 'noFish': return 'No raw fish to cook.';
    case 'noLogs': return 'No logs on him to stack.';
    case 'full': return 'The pile is full.';
    default: return buildWhyText(why);
  }
}

/** A line under an entry that can be chosen: what building it uses and how long it takes, or how far along it is. */
export function noteOf(state: GameState, action: CampAction): string | null {
  if (action.kind !== 'build') return null;
  const id = action.id;
  if (action.how === 'carry') return `${STAGE_NAMES[Math.max(0, stageOf(state, id))]}, ${Math.floor(progressOf(state, id) * 100)}% done`;
  return `${workTime(buildTime(state, id))}: ${itemList(MAKES[id].needs, ' and ')}`;
}

/** What the menu is headed: the thing drawn at the spot (stepShown: the old step until a bigger one is half built round
 *  it), or, with nothing of it drawn yet, what stands there furthest out (its footings) or its marker's thing. */
export function titleOf(state: GameState, layout: Layout, line: LineId): string {
  const box = tapBoxOf(state, layout, line);
  return box ? MAKES[stepShown(state, line) ?? box.step].name : '';
}

/** Where a key moves the focus among the menu's `n` entries from `at` (-1: none yet): Down and Right on, Up and Left
 *  back, round from the last to the first, Home and End to the first and the last; undefined for any other key (it is
 *  the page's: Esc closes the menu). The arrows never reach the camera meanwhile. */
export function menuKey(key: string, at: number, n: number): number | undefined {
  if (!n) return undefined;
  const on = at < 0 ? 0 : at + 1, back = at < 0 ? n - 1 : at - 1;
  const to = ({ ArrowDown: on, ArrowRight: on, ArrowUp: back, ArrowLeft: back, Home: 0, End: n - 1 } as Record<string, number>)[key];
  return to === undefined ? undefined : (to + n) % n;
}

/** A box on the screen (px). */
export interface Box { left: number; top: number; right: number; bottom: number }

/** How much of two boxes overlap (px²). */
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/** Where the menu (`size` px) goes for a press at `at` on a `screen` (px, the stage's own frame) (T5.6): beside the
 *  press, MENU.offset to its right and below it (else to its left, or above it), inside the screen's edge, clear of
 *  each of `avoid` (the goal card, the row of buttons) and not under the finger: of the places tried (round the press,
 *  and round each box to keep clear of), the one that covers least of them, then not over the press, then the first of
 *  those round the press, then the nearest it. On a narrow phone with the finger in the middle there may be no room
 *  beside it: then it opens over the finger (the press that opened it can't choose an entry: CampMenu). */
export function menuSpot(at: { x: number; y: number }, size: { w: number; h: number }, screen: { w: number; h: number }, avoid: readonly Box[]): { left: number; top: number } {
  const off = MENU.offset, maxX = Math.max(EDGE, screen.w - EDGE - size.w), maxY = Math.max(EDGE, screen.h - EDGE - size.h);
  const right = at.x + off, left = at.x - off - size.w, below = at.y + off, above = at.y - off - size.h;
  const tried: [number, number][] = [[right, below], [left, below], [right, above], [left, above]];
  for (const b of avoid) {
    tried.push([right, b.bottom + GAP], [left, b.bottom + GAP], [right, b.top - GAP - size.h], [left, b.top - GAP - size.h],
      [b.right + GAP, below], [b.right + GAP, above], [b.left - GAP - size.w, below], [b.left - GAP - size.w, above]);
  }
  let best: { left: number; top: number } | null = null, bestCost: number[] = [];
  for (const t of tried) {
    const [x, y] = t;
    const spot = { left: Math.min(Math.max(x, EDGE), maxX), top: Math.min(Math.max(y, EDGE), maxY) };
    const box = { left: spot.left, top: spot.top, right: spot.left + size.w, bottom: spot.top + size.h };
    // how far the press is outside it: nearer than MENU.offset, the fingertip covers it
    const dx = Math.max(box.left - at.x, 0, at.x - box.right), dy = Math.max(box.top - at.y, 0, at.y - box.bottom);
    const rank = tried.indexOf(t);
    const cost = [avoid.reduce((a, b) => a + overlap(box, b), 0), Math.hypot(dx, dy) < off ? 1 : 0, rank < 4 ? rank : 4 + Math.hypot(dx, dy)];
    const first = cost.findIndex((c, i) => c !== bestCost[i]);
    if (!best || (first >= 0 && cost[first]! < bestCost[first]!)) { best = spot; bestCost = cost; }
  }
  return best!;
}

export class CampMenu {
  private el = $('campMenu');
  private list = $('campMenuList');
  private title = $('campMenuTitle');
  private spot: LineId | null = null;
  private drawn = '';
  /** a press has gone down on it since it opened: a finger that opened it by a long press, lifted over an entry,
   *  chooses nothing (a click from the keyboard always counts) */
  private armed = false;

  constructor(private state: GameState, private layout: Layout, private queue: Command[], private hud: Hud, windows: Windows, private openChest: () => void) {
    this.list.addEventListener('pointerdown', () => { this.armed = true; });
    this.list.addEventListener('click', e => {
      const b = (e.target as Element).closest<HTMLButtonElement>('button[data-key]');
      if (b && (this.armed || e.detail === 0)) this.choose(b.dataset.key!);
    });
    this.el.tabIndex = -1;
    // a right click (or a long press) on the board itself opens no browser menu over it either
    this.el.addEventListener('contextmenu', e => e.preventDefault());
    // the arrow keys move between its entries (and don't turn the camera meanwhile, nor close it)
    this.el.addEventListener('keydown', e => {
      const items = [...this.list.querySelectorAll<HTMLButtonElement>('button[data-key]')], at = items.indexOf(document.activeElement as HTMLButtonElement);
      const to = menuKey(e.key, at, items.length);
      if (to === undefined) return;
      e.preventDefault(); e.stopPropagation();
      items[to]!.focus();
    });
    // Esc closes it before any window (ui/windows.ts asks this first, after the notes, and then the row's More menu)
    const before = windows.escape;
    windows.escape = () => this.close() || before();
    // a press anywhere else closes it (on the scene, ui/input.ts does, so that press doesn't also walk him)
    document.addEventListener('pointerdown', e => {
      const t = e.target as Element | null;
      if (this.spot && t && !this.el.contains(t) && t.tagName !== 'CANVAS') this.close();
    }, true);
    window.addEventListener('resize', () => this.close());
  }

  get isOpen(): boolean { return this.spot !== null; }

  /** Open the menu for `line`'s spot beside a press at `at` (px, on the page); nothing to do there, nothing opens. */
  open(line: LineId, at: { x: number; y: number }): void {
    if (!campActions(this.state, this.layout, line).length) { this.close(); return; }
    this.spot = line; this.drawn = ''; this.armed = false;
    this.draw();
    const el = this.el, stage = $('stage').getBoundingClientRect();
    el.hidden = false; el.style.visibility = 'hidden'; el.style.left = '0px'; el.style.top = '0px';
    const rel = (r: DOMRect): Box => ({ left: r.left - stage.left, top: r.top - stage.top, right: r.right - stage.left, bottom: r.bottom - stage.top });
    const avoid = ['goal', 'rail'].map(id => $(id)).filter(e => !e.hidden && e.getClientRects().length).map(e => rel(e.getBoundingClientRect()));
    const spot = menuSpot({ x: at.x - stage.left, y: at.y - stage.top }, { w: el.offsetWidth, h: el.offsetHeight }, { w: stage.width, h: stage.height }, avoid);
    el.style.left = `${Math.round(spot.left)}px`; el.style.top = `${Math.round(spot.top)}px`; el.style.visibility = '';
    // keyboard focus on the board itself (the arrow keys go into its entries), so a mouse or a finger sees no focus ring
    el.focus({ preventScroll: true });
  }

  /** Close it; whether it was open. */
  close(): boolean {
    if (!this.spot) return false;
    const had = this.el.contains(document.activeElement);
    this.spot = null; this.el.hidden = true; this.drawn = '';
    if (had) (document.activeElement as HTMLElement | null)?.blur();
    return true;
  }

  /** Each frame while open: its entries as things stand now (night falling, a build finishing); nothing left to do
   *  there, it closes. */
  update(): void {
    if (!this.spot) return;
    if (!campActions(this.state, this.layout, this.spot).length) { this.close(); return; }
    this.draw();
  }

  /** Its title and entries, redrawn only when they changed (keyboard focus kept on the same entry). */
  private draw(): void {
    const line = this.spot!, entries = campActions(this.state, this.layout, line), tap = campTap(this.state, this.layout, line);
    const view = entries.map(e => ({ key: actionKey(e.action), label: labelOf(e.action), note: e.why ? whyText(e.why) : noteOf(this.state, e.action), off: !!e.why }));
    const title = titleOf(this.state, this.layout, line), tapKey = tap ? actionKey(tap.action) : '';
    const drawn = JSON.stringify([title, tapKey, view]);
    if (drawn === this.drawn) return;
    this.drawn = drawn;
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.key;
    this.title.textContent = title;
    this.list.replaceChildren(...view.map(v => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'cm-item' + (v.key === tapKey ? ' tap' : '') + (v.off ? ' off' : '');
      b.setAttribute('role', 'menuitem'); b.dataset.key = v.key;
      if (v.off) b.setAttribute('aria-disabled', 'true');
      const label = document.createElement('span'); label.className = 'cm-label'; label.textContent = v.label;
      b.append(label);
      if (v.note) { const note = document.createElement('small'); note.className = 'cm-note'; note.textContent = v.note; b.append(note); }
      return b;
    }));
    if (focused) this.list.querySelector<HTMLButtonElement>(`button[data-key="${focused}"]`)?.focus({ preventScroll: true });
  }

  /** An entry chosen: looked up again as things stand now; gone, or not to be chosen now, it is refused with a notice
   *  saying why; otherwise the menu closes and it is done. */
  private choose(key: string): void {
    if (!this.spot) return;
    const entry: CampEntry | undefined = campActions(this.state, this.layout, this.spot).find(e => actionKey(e.action) === key);
    if (!entry || entry.why) { this.hud.notice(entry?.why ? whyText(entry.why) : "That can't be done just now."); this.update(); return; }
    this.close();
    if (entry.action.kind === 'look') { this.openChest(); return; }
    const c = commandOf(entry.action);
    if (c) this.queue.push(c);
  }
}
