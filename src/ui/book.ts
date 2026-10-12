// His book (0.0.17), in a window since the UI foundation (12 Oct 2026; ui/windows.ts): one page per goal. The pages
// come from core/book.ts (which goals show, done or current, the tick and count per line); this only draws them, on
// the muted paper of index.html's .page. It opens by itself at the current page when he picks the book up, with a line
// saying so; once he has it, the Book button in the row opens it (the button shows only then), and so does a tap on the
// goal card (ui/hud.ts), each at the current page. Previous and next turn the page (or the left and right arrow keys
// while it is open); its x, the Book button again or Esc closes it. On a phone it sits under the goal card, so the
// card's Build button stays in sight. Reads state; never changes the game.
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout } from '../world/layout';
import type { Windows } from './windows';
import { bookPages, opensBook, type BookPage } from '../core/book';
import { lineName } from './hud';

const $ = (id: string) => document.getElementById(id)!;
const el = (tag: string, className: string, text = '') => { const e = document.createElement(tag); e.className = className; e.textContent = text; return e; };

export class Book {
  private at = 0;                       // the page shown (an index into bookPages)
  private lead = false;                 // opened by picking it up: a line above the page says so
  private pickedUp = false;             // opening because he just picked it up
  private drawn: string | null = null;  // what the page was last drawn from, so it is redrawn only on a change
  private camp: boolean;

  constructor(private state: GameState, events: EventBus, layout: Layout, private windows: Windows) {
    this.camp = !!layout.camp;
    if (!this.camp) return;               // the goals, and so the book, are the camp's
    $('bookPrev').addEventListener('click', () => this.turn(-1));
    $('bookNext').addEventListener('click', () => this.turn(1));
    // however it opens (the Book button, the goal card, picking it up), it opens at the current page
    windows.on((id, open) => {
      if (id !== 'book') return;
      $('goalOpen').setAttribute('aria-expanded', String(open));
      if (!open) return;
      this.at = bookPages(this.state).length - 1;
      this.lead = this.pickedUp; this.pickedUp = false;
      this.drawn = null;
      this.draw();
      $('bookBody').scrollTop = 0;
    });
    // While it is open, the left and right arrows turn its pages instead of the camera: this listens as the key goes
    // down to the page, before ui/input.ts hears it on the way back up.
    window.addEventListener('keydown', e => {
      if (!windows.isOpen('book')) return;
      if (e.key === 'ArrowLeft') this.turn(-1);
      else if (e.key === 'ArrowRight') this.turn(1);
      else return;
      e.preventDefault(); e.stopPropagation();
    }, true);
    events.on(e => {
      if (!opensBook(e)) return;
      this.pickedUp = true;
      windows.setAvailable('book', true);
      if (windows.isOpen('book')) windows.close('book');   // opened afresh, at the page he is on, with its line
      windows.open('book');
    });
  }

  private turn(by: number): void {
    const last = bookPages(this.state).length - 1, to = Math.max(0, Math.min(last, this.at + by));
    if (to === this.at) return;
    this.at = to; this.lead = false; this.draw();
    $('bookBody').scrollTop = 0;          // a new page starts at its top (live redraws of the same page don't jump)
  }

  private draw(): void {
    const pages = bookPages(this.state);
    this.at = Math.min(this.at, pages.length - 1);
    const page = pages[this.at]!, key = JSON.stringify([page, this.lead, pages.length]);
    if (key === this.drawn) return;
    this.drawn = key;
    $('bookLead').hidden = !this.lead;
    $('bookNo').textContent = `Page ${page.number}`;
    $('bookDone').hidden = !page.done;
    $('bookTitle').textContent = page.title;
    $('bookText').textContent = page.text;
    $('bookNeeds').replaceChildren(...page.lines.map(line => this.line(line)));
    $('bookHint').textContent = page.hint;
    $('bookHint').hidden = !page.hint;    // a finished page has none (its ticks and Done mark say it all), but the last says the camp is set up
    $('bookStuck').hidden = !page.current || page.done;   // with every goal done, nothing is stuck any more
    ($('bookPrev') as HTMLButtonElement).disabled = this.at === 0;
    ($('bookNext') as HTMLButtonElement).disabled = this.at === pages.length - 1;
  }

  /** One thing the page's goal needs: a tick once there are enough, its name and how many of how many (or a skill
   *  level, 0.0.22: "Attack level", 2 / 3). */
  private line(line: BookPage['lines'][number]): HTMLElement {
    const name = lineName(line), li = el('li', line.done ? 'done' : '');
    li.setAttribute('aria-label', `${name}: ${line.got} of ${line.need}${line.done ? ', done' : ''}`);
    const tick = el('span', 'tick'); tick.setAttribute('aria-hidden', 'true');      // the tick is drawn by the page's CSS
    li.append(tick, el('span', 'need-name', name.charAt(0).toUpperCase() + name.slice(1)), el('span', 'need-count', `${line.got} / ${line.need}`));
    return li;
  }

  update(): void {
    if (!this.camp) return;
    // the Book button shows once he has the book, and the goal card says a tap opens it
    const has = this.state.hasBook;
    this.windows.setAvailable('book', has);
    $('goal').classList.toggle('has-book', has);
    if (this.windows.isOpen('book')) this.draw();
  }
}
