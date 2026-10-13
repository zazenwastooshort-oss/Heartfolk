// Information (0.0.38; the owner: "Let's do Journaling and tips as a (informstion) button somewhere", then, on a small
// "i" beside the clock, "Yupp beside the clock"): a window (ui/windows.ts, index.html's #infoWin) opened by the round
// "i" beside the clock, with three tabs: Story (the goal pages, one per goal in order up to the one he is on, as his
// first book had them: core/book.ts), Journal (his thoughts so far, a few to a page by day) and Tips (a page each, as
// they come unstuck); the pages come from core/survival.ts's informationPages, drawn on the book's muted paper. The
// goal line's name opens it at Story, on the current goal's page (D6); the "i" opens it on the tab with something new
// (the Journal before Tips), else where it was last, or there the first time (D7). A tab opens at its own place
// (tabHome): Story at the current goal, Journal at its newest page, Tips at the first not read yet. Previous and Next
// (or the left and right arrow keys while it is open) turn the pages within a tab; its x, the "i" again or Esc closes
// it. A dot on the "i", and on a tab, while a journal entry or a tip has come that hasn't been seen (infoNews; whatever
// a game had when it was opened counts as seen). It doesn't wait for his book (D8). Reads state; never changes the
// game.
import type { GameState } from '../core/state';
import type { Layout } from '../world/layout';
import type { Windows } from './windows';
import type { BookLine } from '../core/book';
import { informationPages, type InformationPages, type SurvivalPage } from '../core/survival';
import { lineName } from './hud';

/** The tabs, in their order (index.html's #infoTabs, by data-tab). */
export type InfoTab = 'story' | 'journal' | 'tips';
export const INFO_TABS: readonly InfoTab[] = ['story', 'journal', 'tips'];

/** Each page's key in a tab, which stays the same page as the tab grows: a goal's page by its goal, the rest their own. */
export function keysOf(pages: InformationPages, tab: InfoTab): string[] {
  return tab === 'story' ? pages.story.map(p => `goal:${p.goal}`) : pages[tab].map(p => p.key);
}

/** Where a tab opens (an index into its pages): Story at the current goal's page (the last), Journal at its newest page
 *  (the last), Tips at the first not read yet, else the first. */
export function tabHome(pages: InformationPages, tab: InfoTab, readTips: ReadonlySet<string>): number {
  if (tab === 'tips') return Math.max(0, pages.tips.findIndex(p => !readTips.has(p.key)));
  return Math.max(0, pages[tab].length - 1);
}

/** Where it was last: a tab, and the page shown in it (its key). */
export interface InfoPlace { tab: InfoTab; key: string | null }

/** Where Information opens: from the goal line's name (`goal`), Story at the current goal's page; from the "i", the
 *  tab with something new (`news`, the dot it shows: the Journal at its newest page before Tips at the first not read),
 *  else where it was last (`last`: the same page, found by its key, or its tab's own place if that page is gone), or
 *  Story at the current goal the first time. */
export function openAt(from: 'goal' | 'button', last: InfoPlace | null, pages: InformationPages, readTips: ReadonlySet<string>,
  news: Record<InfoTab, boolean> = { story: false, journal: false, tips: false }): { tab: InfoTab; at: number } {
  if (from === 'button') {
    const tab = INFO_TABS.find(t => news[t]);
    if (tab) return { tab, at: tabHome(pages, tab, readTips) };
  }
  if (from === 'goal' || !last) return { tab: 'story', at: tabHome(pages, 'story', readTips) };
  const at = last.key === null ? -1 : keysOf(pages, last.tab).indexOf(last.key);
  return { tab: last.tab, at: at >= 0 ? at : tabHome(pages, last.tab, readTips) };
}

/** What has been seen: how many journal entries there were when the Journal's newest page last showed, and the tips
 *  read (by key). */
export interface Seen { journal: number; tips: ReadonlySet<string> }

/** What is new, by tab (a dot on each; either, a dot on the "i"): a journal entry since the Journal was last seen, a tip
 *  not read yet. The Story has none: the goal line shows a new goal already. */
export function infoNews(state: GameState, pages: InformationPages, seen: Seen): Record<InfoTab, boolean> {
  return { story: false, journal: state.thoughts.journal.length > seen.journal, tips: pages.tips.some(p => !seen.tips.has(p.key)) };
}

/** A journal page's title: the days its lines are from ("Day 2", "Days 2 to 3"), "Earlier" for lines from before the
 *  book kept days (an old save's), or "Journal" while it is empty (as the old book titled them). */
export function journalTitle(page: SurvivalPage): string {
  const days = page.journal.flatMap(l => l.day === null ? [] : [l.day]);
  if (!days.length) return page.journal.length ? 'Earlier' : 'Journal';
  const lo = Math.min(...days), hi = Math.max(...days);
  return lo === hi ? `Day ${lo}` : `Days ${lo} to ${hi}`;
}

/** The words for a tab with nothing in it yet (Tips, before the first comes unstuck). */
export const NO_TIPS = 'Tips come as you find your way.';
/** Under the current goal's page, while the story goes on. */
export const STORY_ON = 'More of his story comes as you go.';

const $ = (id: string) => document.getElementById(id)!;
const el = (tag: string, className: string, text = '') => { const e = document.createElement(tag); e.className = className; e.textContent = text; return e; };

export class Information {
  private tab: InfoTab = 'story';
  private at = 0;                               // the page shown, an index into its tab's pages
  private key: string | null = null;            // ...and which page that is, so it stays put as pages come before it
  private last: InfoPlace | null = null;        // where it was last, for the "i"
  private from: 'goal' | 'button' = 'button';   // how it is being opened
  private drawn: string | null = null;          // what the page was last drawn from, so it is redrawn only on a change
  private dotted: string | null = null;         // which dots were last drawn
  private counted: string | null = null;        // the journal's and the unstuck pages' counts when the dots were worked out
  private seenJournal: number;                  // journal entries seen
  private readTips = new Set<string>();         // tips read, by key
  private tabs: HTMLButtonElement[];
  private camp: boolean;

  constructor(private state: GameState, layout: Layout, private windows: Windows) {
    this.camp = !!layout.camp;
    this.tabs = [...$('infoTabs').querySelectorAll<HTMLButtonElement>('button[data-tab]')];
    // whatever the game had when it was opened counts as seen
    this.seenJournal = state.thoughts.journal.length;
    for (const p of informationPages(state).tips) this.readTips.add(p.key);
    if (!this.camp) { windows.setAvailable('info', false); return; }   // the goals, and so the story, are the camp's
    for (const b of this.tabs) b.addEventListener('click', () => this.show(b.dataset.tab as InfoTab));
    $('infoPrev').addEventListener('click', () => this.turn(-1));
    $('infoNext').addEventListener('click', () => this.turn(1));
    // opened (by the "i", or by the goal line's name through showGoal): at the place openAt says
    windows.on((id, open) => {
      if (id !== 'info' || !open) return;
      const pages = informationPages(this.state), news = infoNews(this.state, pages, { journal: this.seenJournal, tips: this.readTips });
      const place = openAt(this.from, this.last, pages, this.readTips, news);
      this.from = 'button';
      this.go(place.tab, place.at, pages);
    });
    // While it is open, the left and right arrows turn its pages instead of the camera: this listens as the key goes
    // down to the page, before ui/input.ts hears it on the way back up.
    window.addEventListener('keydown', e => {
      if (!windows.isOpen('info') || e.altKey || e.ctrlKey || e.metaKey) return;
      // keys pressed in another window are its own (Discovery's tree follows its lines with them)
      const t = e.target as Element | null;
      if (t?.closest?.('.win') && !t.closest('#infoWin')) return;
      if (e.key === 'ArrowLeft') this.turn(-1);
      else if (e.key === 'ArrowRight') this.turn(1);
      else return;
      e.preventDefault(); e.stopPropagation();
    }, true);
  }

  /** The goal line's name (D6): Information at Story, on the current goal's page; opened, or turned there if open. */
  showGoal(): void {
    if (!this.camp) return;
    if (!this.windows.isOpen('info')) { this.from = 'goal'; this.windows.open('info'); return; }
    const pages = informationPages(this.state);
    this.go('story', tabHome(pages, 'story', this.readTips), pages);
  }

  /** A tab, at its own place. */
  private show(tab: InfoTab): void {
    const pages = informationPages(this.state);
    this.go(tab, tabHome(pages, tab, this.readTips), pages);
  }

  private turn(by: number): void {
    const pages = informationPages(this.state), to = this.at + by;
    if (to < 0 || to >= keysOf(pages, this.tab).length) return;
    this.go(this.tab, to, pages);
  }

  /** Show page `at` of `tab`, from its top (live redraws of the same page, update(), don't jump). */
  private go(tab: InfoTab, at: number, pages: InformationPages): void {
    const keys = keysOf(pages, tab);
    this.tab = tab; this.at = Math.max(0, Math.min(keys.length - 1, at)); this.key = keys[this.at] ?? null;
    this.draw(pages);
    $('infoBody').scrollTop = 0;
  }

  private draw(pages: InformationPages): void {
    const keys = keysOf(pages, this.tab);
    // the page shown stays the same page as others come before it
    const kept = this.key ? keys.indexOf(this.key) : -1;
    this.at = kept >= 0 ? kept : Math.max(0, Math.min(this.at, keys.length - 1));
    this.key = keys[this.at] ?? null;
    this.last = { tab: this.tab, key: this.key };
    // seen: a tip once its page shows, the journal's entries once its newest page does
    if (this.tab === 'tips' && this.key) this.readTips.add(this.key);
    if (this.tab === 'journal' && this.at === keys.length - 1) this.seenJournal = this.state.thoughts.journal.length;
    this.dots(pages);
    const story = this.tab === 'story' ? pages.story[this.at] ?? null : null;
    const page = this.tab !== 'story' ? pages[this.tab][this.at] ?? null : null;
    const key = JSON.stringify([this.tab, this.at, keys.length, story, page]);
    if (key === this.drawn) return;
    this.drawn = key;
    for (const b of this.tabs) b.setAttribute('aria-pressed', String(b.dataset.tab === this.tab));
    const journal = this.tab === 'journal' && page ? page : null;
    $('infoHead').textContent = story ? `Page ${story.number}` : this.tab === 'journal' ? 'Journal' : 'Tips';
    $('infoDone').hidden = !story?.done;
    $('infoPageTitle').textContent = story ? story.title : journal ? journalTitle(journal) : page?.title ?? 'Tips';
    const text = story ? story.text : journal ? '' : page?.text ?? NO_TIPS;
    $('infoText').textContent = text;
    $('infoText').hidden = !text;
    $('infoNeeds').replaceChildren(...(story?.lines ?? []).map(line => this.line(line)));
    $('infoNeeds').hidden = !story?.lines.length;
    $('infoHint').textContent = story?.hint ?? '';
    $('infoHint').hidden = !story?.hint;
    $('infoJournal').replaceChildren(...(journal ? this.journal(journal) : []));
    $('infoJournal').hidden = !journal;
    // under the current goal's page, while there are goals still to come
    const more = !!story && story.current && !story.done;
    $('infoMore').textContent = more ? STORY_ON : '';
    $('infoMore').hidden = !more;
    $('infoCount').textContent = keys.length ? `${this.at + 1} / ${keys.length}` : '';
    ($('infoPrev') as HTMLButtonElement).disabled = this.at <= 0;
    ($('infoNext') as HTMLButtonElement).disabled = this.at >= keys.length - 1;
  }

  /** A journal page's lines, a small day heading before each new day's (none for ones from before the book). */
  private journal(page: SurvivalPage): HTMLElement[] {
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

  /** One thing a goal needs: a tick once there are enough, its name and how many of how many. */
  private line(line: BookLine): HTMLElement {
    const name = lineName(line), li = el('li', line.done ? 'done' : '');
    li.setAttribute('aria-label', `${name}: ${line.got} of ${line.need}${line.done ? ', done' : ''}`);
    const tick = el('span', 'tick'); tick.setAttribute('aria-hidden', 'true');      // the tick is drawn by the page's CSS
    li.append(tick, el('span', 'need-name', name.charAt(0).toUpperCase() + name.slice(1)), el('span', 'need-count', `${line.got} / ${line.need}`));
    return li;
  }

  /** The dots: on a tab with something new, and on the "i" while any has. */
  private dots(pages: InformationPages): void {
    const news = infoNews(this.state, pages, { journal: this.seenJournal, tips: this.readTips });
    const key = `${news.journal}|${news.tips}`;
    if (key === this.dotted) return;
    this.dotted = key;
    for (const b of this.tabs) b.classList.toggle('new', news[b.dataset.tab as InfoTab]);
    $('infoBtn').classList.toggle('new', news.journal || news.tips);
  }

  update(): void {
    if (!this.camp) return;
    if (this.windows.isOpen('info')) { this.draw(informationPages(this.state)); return; }
    // closed: the dots are worked out again only when a thought or a page has come
    const t = this.state.thoughts, counted = `${t.journal.length}|${t.known.length}`;
    if (counted === this.counted) return;
    this.counted = counted;
    this.dots(informationPages(this.state));
  }
}
