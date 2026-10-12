// His book (0.0.17): one page per goal, shown over the game, which keeps running behind it. The pages come from
// core/book.ts (which goals show, done or current, the tick and count per line); this only draws them. It opens by
// itself at the current page when he picks the book up; once he has it, tapping the goal card opens it (the card's
// Build button still does its own thing), and a small "Book" cue on the card says so (a button, for keyboards). It
// sits clear of the card (index.html), so the Build button stays in sight. Previous and next turn the page (or the
// left and right arrow keys); the close button or Esc closes it. Reads state; never changes the game.
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout } from '../world/layout';
import { bookPages, opensBook, type BookPage } from '../core/book';
import { itemName } from './hud';

const $ = (id: string) => document.getElementById(id)!;
const el = (tag: string, className: string, text = '') => { const e = document.createElement(tag); e.className = className; e.textContent = text; return e; };

export class Book {
  private panel = $('book');
  private card = $('goal');
  private at = 0;                       // the page shown (an index into bookPages)
  private lead = false;                 // opened by picking it up: a line above the page says so
  private drawn: string | null = null;  // what the page was last drawn from, so it is redrawn only on a change
  private cardHasBook: boolean | null = null;
  private camp: boolean;

  constructor(private state: GameState, events: EventBus, layout: Layout) {
    this.camp = !!layout.camp;
    if (!this.camp) return;               // the goals, and so the book, are the camp's
    $('bookClose').addEventListener('click', () => this.close());
    $('bookPrev').addEventListener('click', () => this.turn(-1));
    $('bookNext').addEventListener('click', () => this.turn(1));
    // a tap anywhere on the card, or on its "Book" cue (a real button, for keyboards), opens or closes it
    this.card.addEventListener('click', e => {
      if ((e.target as HTMLElement).closest('#goalBuild') || !this.state.hasBook) return;
      if (this.panel.hidden) this.open(false); else this.close();
    });
    // While it is open, Esc closes it and the left and right arrows turn its pages instead of the camera: this
    // listens as the key goes down to the page, before ui/input.ts hears it on the way back up.
    window.addEventListener('keydown', e => {
      if (this.panel.hidden) return;
      if (e.key === 'Escape') this.close();
      else if (e.key === 'ArrowLeft') this.turn(-1);
      else if (e.key === 'ArrowRight') this.turn(1);
      else return;
      e.preventDefault(); e.stopPropagation();
    }, true);
    events.on(e => { if (opensBook(e)) this.open(true); });
  }

  /** Open at the current page (the last one shown). */
  private open(pickedUp: boolean): void {
    this.at = bookPages(this.state).length - 1;
    this.lead = pickedUp;
    this.drawn = null;
    this.panel.hidden = false;
    $('hint').classList.add('gone');      // the how-to-play hint would peek out behind it; he knows his way by now
    this.draw();
    $('bookPage').scrollTop = 0;
    $('goalBook').setAttribute('aria-expanded', 'true');
    ($('bookClose') as HTMLButtonElement).focus({ preventScroll: true });
  }

  private close(): void {
    this.panel.hidden = true;
    $('goalBook').setAttribute('aria-expanded', 'false');
    if (document.activeElement && this.panel.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  }

  private turn(by: number): void {
    const last = bookPages(this.state).length - 1, to = Math.max(0, Math.min(last, this.at + by));
    if (to === this.at) return;
    this.at = to; this.lead = false; this.draw();
    $('bookPage').scrollTop = 0;          // a new page starts at its top (live redraws of the same page don't jump)
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

  /** One thing the page's goal needs: a tick once there are enough, its name and how many of how many. */
  private line(line: BookPage['lines'][number]): HTMLElement {
    const name = itemName(line.id, line.need), li = el('li', line.done ? 'done' : '');
    li.setAttribute('aria-label', `${name}: ${line.got} of ${line.need}${line.done ? ', done' : ''}`);
    const tick = el('span', 'tick'); tick.setAttribute('aria-hidden', 'true');      // the tick is drawn by the page's CSS
    li.append(tick, el('span', 'need-name', name.charAt(0).toUpperCase() + name.slice(1)), el('span', 'need-count', `${line.got} / ${line.need}`));
    return li;
  }

  update(): void {
    if (!this.camp) return;
    // the card can be tapped once he has the book, with a small cue saying so
    const has = this.state.hasBook;
    if (has !== this.cardHasBook) {
      this.cardHasBook = has;
      this.card.classList.toggle('has-book', has);
      $('goalBook').hidden = !has;
    }
    if (!this.panel.hidden) this.draw();
  }
}
