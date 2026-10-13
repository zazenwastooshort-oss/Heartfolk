// His survival book's pages (chapter 2): what ui/book.ts draws, worked out headless so the tests can check it. In the
// order of SECTIONS (data/survival.ts): the Journal (his thoughts so far, a few to a page, by day), Making (a page for
// each thing whose page has come unstuck: what it needs, how many of each he has, and where it is made; done once it
// is made), Food (with how much each heals), Materials and places, and Tips. Only pages that have come unstuck
// (GameState.thoughts.known, systems/thoughts.ts) are in it; the rest are still stuck together from the river.
import type { GameState } from './state';
import { begun, made, owned } from './state';
import { DAY_SECONDS } from './clock';
import type { BookLine } from './book';
import { MAKES } from '../data/making';
import { FOOD } from '../data/food';
import { thoughtDef } from '../data/thoughts';
import { JOURNAL_PER_PAGE, MAKE_NOTES, MAKE_WHERE, SECTIONS, SITE_WHERE, SURVIVAL, type Section } from '../data/survival';
import { makeKey } from './thoughts';

/** A line in the journal: what he thought, and on which day (from 1; null for one an old save was given). */
export interface JournalLine { text: string; day: number | null }

/** One page. key: which page it is (stays the same as the book grows). section: its section. title, text: its words.
 *  lines: what a Making page's thing needs, how many he has of each (carried or stored, never more than needed),
 *  ticked once there are enough (all ticked once it is made). where: where a Making page's thing is made. heals: how
 *  much a Food page's food heals (null for one that isn't food). journal: a Journal page's lines. done: a Making page's
 *  thing is made. (A thing begun, being built in stages, has every line ticked, its `done` still false.) */
export interface SurvivalPage {
  key: string; section: Section; title: string; text: string; lines: BookLine[]; where: string; heals: number | null;
  journal: JournalLine[]; done: boolean;
}

const page = (p: Pick<SurvivalPage, 'key' | 'section' | 'title'> & Partial<SurvivalPage>): SurvivalPage =>
  ({ text: '', lines: [], where: '', heals: null, journal: [], done: false, ...p });

/** The day an in-game time falls on, from 1. */
export const dayOf = (time: number) => Math.floor(time / DAY_SECONDS) + 1;

/** The Journal's pages: his thoughts in order, JOURNAL_PER_PAGE to a page; one empty page before he has any. Lines from
 *  before the book kept days (an old save's, day null) never share a page with dated ones: the dated lines start a
 *  fresh page, so each page is either "Earlier" or by day. */
function journalPages(state: GameState): SurvivalPage[] {
  const lines = state.thoughts.journal.flatMap((e): JournalLine[] => {
    const def = thoughtDef(e.id);
    return def ? [{ text: def.text, day: e.at === null ? null : dayOf(e.at) }] : [];
  });
  // runs of undated and dated lines, each paged on its own
  const runs: JournalLine[][] = [];
  for (const line of lines) {
    const run = runs[runs.length - 1];
    if (run && (run[0]!.day === null) === (line.day === null)) run.push(line); else runs.push([line]);
  }
  const pages: SurvivalPage[] = [];
  const add = (journal: JournalLine[]) => pages.push(page({ key: `journal:${pages.length + 1}`, section: 'journal', title: 'Journal', journal }));
  for (const run of runs) for (let i = 0; i < run.length; i += JOURNAL_PER_PAGE) add(run.slice(i, i + JOURNAL_PER_PAGE));
  if (!pages.length) add([]);
  return pages;
}

/** Every page of the book that has come unstuck, in its sections' order. */
export function survivalPages(state: GameState): SurvivalPage[] {
  const known = new Set(state.thoughts.known);
  const making = Object.values(MAKES).filter(d => known.has(makeKey(d.id))).map(d => {
    // (the camp build) begun, what it needed was taken: every line ticked while he builds it, as once it is made
    const done = made(state, d.id), paid = done || begun(state, d.id);
    const lines = Object.entries(d.needs).map(([id, need]) => {
      const got = paid ? need : Math.min(need, owned(state, id));
      return { id, need, got, done: got >= need };
    });
    return page({ key: makeKey(d.id), section: 'making', title: d.name, text: MAKE_NOTES[d.id] ?? '', lines, where: MAKE_WHERE[d.id] ?? SITE_WHERE[d.at] ?? '', done });
  });
  const others = SURVIVAL.filter(p => known.has(p.id)).map(p => {
    const item = 'item' in p.found ? p.found.item : null;
    return page({ key: p.id, section: p.section, title: p.title, text: p.text, heals: p.section === 'food' && item ? FOOD[item]?.heals ?? null : null });
  });
  const all = [...journalPages(state), ...making, ...others];
  return SECTIONS.flatMap(s => all.filter(p => p.section === s.id));
}

/** Where each section starts in `pages` (an index), for its tab; a section with no pages has none. */
export function sectionStarts(pages: SurvivalPage[]): Partial<Record<Section, number>> {
  const out: Partial<Record<Section, number>> = {};
  pages.forEach((p, i) => { if (out[p.section] === undefined) out[p.section] = i; });
  return out;
}
