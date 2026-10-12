// His survival book (since 0.0.17 his book; the survival book in chapter 2), in a window (ui/windows.ts): what he knows,
// not a list of orders. The pages come from core/survival.ts (the Journal of his thoughts, Making, Food, Materials and
// places, Tips; only those come unstuck); this only draws them, on the muted paper of index.html's .page. Tabs above the
// page jump to a section; a dot marks a section (and the Book button) with a page not read yet. It opens by itself
// when he picks the book up, with a line saying so; once he has it, the Book button in the row opens it, each time at
// the newest page of his journal. Previous and next turn the page (or the left and right arrow keys while it is open);
// its x, the Book button again or Esc closes it. Reads state; never changes the game.
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout } from '../world/layout';
import type { Windows } from './windows';
import type { BookLine } from '../core/book';
import { opensBook } from '../core/book';
import { sectionStarts, survivalPages, type SurvivalPage } from '../core/survival';
import { SECTIONS } from '../data/survival';
import { lineName } from './hud';

const $ = (id: string) => document.getElementById(id)!;
const el = (tag: string, className: string, text = '') => { const e = document.createElement(tag); e.className = className; e.textContent = text; return e; };

export class Book {
  private at = 0;                       // the page shown (an index into survivalPages)
  private key: string | null = null;    // ...and which page that is, so it stays put as pages come unstuck before it
  private lead = false;                 // opened by picking it up: a line above the page says so
  private pickedUp = false;             // opening because he just picked it up
  private drawn: string | null = null;  // what the page was last drawn from, so it is redrawn only on a change
  private camp: boolean;
  /** pages read (by key); the pages a save had when the game opened count as read */
  private read = new Set<string>();
  private known = -1;                   // how many pages had come unstuck when the dots were last worked out

  constructor(private state: GameState, events: EventBus, layout: Layout, private windows: Windows) {
    this.camp = !!layout.camp;
    if (!this.camp) return;               // the goals, and so the book, are the camp's
    for (const p of survivalPages(state)) if (p.section !== 'journal') this.read.add(p.key);
    $('bookPrev').addEventListener('click', () => this.turn(-1));
    $('bookNext').addEventListener('click', () => this.turn(1));
    // however it opens (the Book button, picking it up), it opens at the newest page of his journal
    windows.on((id, open) => {
      if (id !== 'book' || !open) return;
      const pages = survivalPages(this.state), starts = sectionStarts(pages);
      this.at = (starts.making ?? starts.food ?? starts.places ?? starts.tips ?? pages.length) - 1;
      this.key = pages[this.at]?.key ?? null;
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

  private go(to: number): void {
    const pages = survivalPages(this.state);
    to = Math.max(0, Math.min(pages.length - 1, to));
    if (to === this.at && pages[to]?.key === this.key) return;
    this.at = to; this.key = pages[to]?.key ?? null; this.lead = false; this.draw();
    $('bookBody').scrollTop = 0;          // a new page starts at its top (live redraws of the same page don't jump)
  }

  private turn(by: number): void { this.go(this.at + by); }

  private draw(): void {
    const pages = survivalPages(this.state);
    // the page shown stays the same page as others come unstuck before it
    const kept = this.key ? pages.findIndex(p => p.key === this.key) : -1;
    this.at = kept >= 0 ? kept : Math.min(this.at, pages.length - 1);
    const page = pages[this.at]!, key = JSON.stringify([page, this.lead, this.at, pages.length, [...this.read].length]);
    this.key = page.key;
    if (page.section !== 'journal') this.read.add(page.key);
    if (key === this.drawn) return;
    this.drawn = key;
    this.tabs(pages, page);
    const section = SECTIONS.find(s => s.id === page.section)!;
    $('bookLead').hidden = !this.lead;
    $('bookNo').textContent = section.name;
    $('bookDone').hidden = !page.done;
    $('bookDone').textContent = page.where.startsWith('Made') ? 'Made' : 'Built';
    $('bookTitle').textContent = page.section === 'journal' ? this.journalTitle(page) : page.title;
    $('bookText').textContent = page.text;
    $('bookText').hidden = !page.text;
    $('bookHeals').textContent = page.heals === null ? '' : `Heals ${page.heals}.`;
    $('bookHeals').hidden = page.heals === null;
    $('bookNeeds').replaceChildren(...page.lines.map(line => this.line(line)));
    $('bookNeeds').hidden = !page.lines.length;
    $('bookWhere').textContent = page.where;
    $('bookWhere').hidden = !page.where;
    $('bookJournal').replaceChildren(...this.journal(page));
    $('bookJournal').hidden = page.section !== 'journal';
    $('bookStuck').hidden = this.at !== pages.length - 1;   // under the last page: more are still stuck together
    $('bookCount').textContent = `${this.at + 1} / ${pages.length}`;
    ($('bookPrev') as HTMLButtonElement).disabled = this.at === 0;
    ($('bookNext') as HTMLButtonElement).disabled = this.at === pages.length - 1;
  }

  /** A journal page's title: the days its lines are from ("Day 2", "Days 2 to 3"), "Earlier" for lines from before the
   *  book kept days (an old save's), or "Journal" while it is empty. */
  private journalTitle(page: SurvivalPage): string {
    const days = page.journal.flatMap(l => l.day === null ? [] : [l.day]);
    if (!days.length) return page.journal.length ? 'Earlier' : 'Journal';
    const lo = Math.min(...days), hi = Math.max(...days);
    return lo === hi ? `Day ${lo}` : `Days ${lo} to ${hi}`;
  }

  /** A journal page's lines, a small day heading before each new day's (none for ones from before the book). */
  private journal(page: SurvivalPage): HTMLElement[] {
    if (page.section !== 'journal') return [];
    if (!page.journal.length) return [el('li', 'said', 'Nothing written yet.')];
    const out: HTMLElement[] = [];
    let day: number | null | undefined;
    const multi = new Set(page.journal.map(l => l.day)).size > 1;
    for (const line of page.journal) {
      if (multi && line.day !== day && line.day !== null) out.push(el('li', 'day', `Day ${line.day}`));
      day = line.day;
      out.push(el('li', 'said', line.text));
    }
    return out;
  }

  /** The tabs: one per section with pages, the one shown pressed, a dot on one with a page not read yet. */
  private tabs(pages: SurvivalPage[], shown: SurvivalPage): void {
    const starts = sectionStarts(pages), row = $('bookTabs');
    row.replaceChildren(...SECTIONS.filter(s => starts[s.id] !== undefined).map(s => {
      const b = el('button', pages.some(p => p.section === s.id && s.id !== 'journal' && !this.read.has(p.key)) ? 'new' : '', s.tab) as HTMLButtonElement;
      b.type = 'button';
      b.setAttribute('aria-selected', String(s.id === shown.section));
      b.addEventListener('click', () => this.go(starts[s.id]!));
      return b;
    }));
  }

  /** One thing a Making page's thing needs: a tick once there are enough, its name and how many of how many. */
  private line(line: BookLine): HTMLElement {
    const name = lineName(line), li = el('li', line.done ? 'done' : '');
    li.setAttribute('aria-label', `${name}: ${line.got} of ${line.need}${line.done ? ', done' : ''}`);
    const tick = el('span', 'tick'); tick.setAttribute('aria-hidden', 'true');      // the tick is drawn by the page's CSS
    li.append(tick, el('span', 'need-name', name.charAt(0).toUpperCase() + name.slice(1)), el('span', 'need-count', `${line.got} / ${line.need}`));
    return li;
  }

  update(): void {
    if (!this.camp) return;
    // the Book button shows once he has the book, with a dot while a page has come unstuck that isn't read yet
    const has = this.state.hasBook;
    this.windows.setAvailable('book', has);
    if (this.windows.isOpen('book')) this.draw();
    if (this.state.thoughts.known.length !== this.known || this.windows.isOpen('book')) {
      this.known = this.state.thoughts.known.length;
      const unread = survivalPages(this.state).some(p => p.section !== 'journal' && !this.read.has(p.key));
      document.querySelector('[data-opens="book"]')?.classList.toggle('new', has && unread);
    }
  }
}
