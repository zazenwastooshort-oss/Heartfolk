// Information (0.0.38; ui/info.ts, core/survival.ts's informationPages): the "i" beside the clock opens a window with
// three tabs, Story (the goal pages, one per goal in order, as his first book had them), Journal and Tips (as his
// survival book has them); the goal line's name opens it at Story on the current goal's page (D6), the "i" where it was
// last or there the first time (D7); a tab opens at its own place; a dot for a new journal entry or tip. Headless: the
// pages, where it opens and what is new; and the window in index.html.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createState, currentGoal } from '../src/core/state';
import { EventBus } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS } from '../src/core/clock';
import { bookPages } from '../src/core/book';
import { informationPages, survivalPages } from '../src/core/survival';
import { INFO_TABS, infoNews, journalTitle, keysOf, openAt, tabHome } from '../src/ui/info';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { GOALS } from '../src/data/goals';
import { JOURNAL_PER_PAGE, SURVIVAL } from '../src/data/survival';
import { THOUGHTS } from '../src/data/thoughts';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const before = (id: string) => GOALS.slice(0, GOALS.findIndex(g => g.id === id)).map(g => g.id);

function setup(seed = 4) {
  const state = createState(CAMP, seed), events = new EventBus();
  return { state, ctx: { layout: CAMP, rng: createRng(seed), events } };
}
const run = (s: ReturnType<typeof setup>, seconds: number) => { for (let t = 0; t < seconds; t += STEP) step(s.state, STEP, s.ctx); };
/** A state with `n` journal entries over a few days, and the tips of the goals before `goal` come unstuck. */
function written(n: number, goal = 'rats') {
  const s = setup();
  s.state.goalsDone = before(goal);
  s.state.thoughts.journal = THOUGHTS.slice(0, n).map((t, i) => ({ id: t.id, at: i * DAY_SECONDS / 3, shown: true }));
  s.state.thoughts.known = SURVIVAL.filter(p => p.section === 'tips').slice(0, 4).map(p => p.id);
  return s;
}

describe("Information's pages (informationPages)", () => {
  it('Story: a page per goal, in order, up to the one he is on, as his first book had them', () => {
    for (const i of [0, 3, GOALS.length - 1]) {
      const s = setup();
      s.state.goalsDone = GOALS.slice(0, i).map(g => g.id);
      const { story } = informationPages(s.state);
      expect(story).toEqual(bookPages(s.state));
      expect(story.map(p => p.goal)).toEqual(GOALS.slice(0, i + 1).map(g => g.id));
      expect(story.at(-1)).toMatchObject({ goal: currentGoal(s.state).id, current: true, text: GOALS[i]!.page });
    }
  });

  it("Journal and Tips: the same pages as the survival book's Journal and Tips sections, nothing lost", () => {
    const s = written(12);
    const pages = informationPages(s.state), book = survivalPages(s.state);
    expect(pages.journal).toEqual(book.filter(p => p.section === 'journal'));
    expect(pages.tips).toEqual(book.filter(p => p.section === 'tips'));
    expect(pages.journal).toHaveLength(Math.ceil(12 / JOURNAL_PER_PAGE));
    expect(pages.journal.flatMap(p => p.journal.map(l => l.text))).toEqual(THOUGHTS.slice(0, 12).map(t => t.text));
    expect(pages.tips.map(p => p.key)).toEqual(s.state.thoughts.known);
  });

  it("doesn't wait for his book (D8): a new game has the first goal's page, his first thought and the first tip", () => {
    const s = setup();
    run(s, 1);
    expect(s.state.hasBook).toBe(false);
    const pages = informationPages(s.state);
    expect(pages.story.map(p => p.goal)).toEqual(['salvage']);
    expect(pages.journal[0]!.journal).toEqual([{ text: THOUGHTS[0]!.text, day: 1 }]);
    expect(pages.tips.map(p => p.key)).toEqual(['tip:tap']);
  });

  it('every page has a key of its own in its tab, which stays the same as the tab grows', () => {
    const s = written(7);
    const pages = informationPages(s.state);
    for (const tab of INFO_TABS) expect(new Set(keysOf(pages, tab)).size, tab).toBe(pages[tab].length);
    expect(keysOf(pages, 'story')[0]).toBe('goal:salvage');
    const grown = written(12), later = informationPages(grown.state);
    expect(keysOf(later, 'journal').slice(0, 2)).toEqual(keysOf(pages, 'journal'));
  });
});

describe('where Information opens (openAt, tabHome)', () => {
  const s = written(12), pages = informationPages(s.state), none = new Set<string>();
  const current = pages.story.length - 1;

  it("from the goal line's name: Story, at the current goal's page, wherever it was last (D6)", () => {
    expect(openAt('goal', null, pages, none)).toEqual({ tab: 'story', at: current });
    expect(openAt('goal', { tab: 'journal', key: 'journal:1' }, pages, none)).toEqual({ tab: 'story', at: current });
    expect(pages.story[current]).toMatchObject({ goal: 'rats', current: true });
  });

  it('from the "i": Story at the current goal the first time, then where it was last (D7)', () => {
    expect(openAt('button', null, pages, none)).toEqual({ tab: 'story', at: current });
    expect(openAt('button', { tab: 'journal', key: 'journal:2' }, pages, none)).toEqual({ tab: 'journal', at: 1 });
    expect(openAt('button', { tab: 'story', key: 'goal:campfire' }, pages, none)).toEqual({ tab: 'story', at: 1 });
    expect(openAt('button', { tab: 'tips', key: pages.tips[2]!.key }, pages, none)).toEqual({ tab: 'tips', at: 2 });
    // a page no longer there (an old journal page's key in a new game): its tab's own place
    expect(openAt('button', { tab: 'journal', key: 'journal:9' }, pages, none)).toEqual({ tab: 'journal', at: pages.journal.length - 1 });
  });

  it('a tab opens at its own place: Story at the current goal, Journal at its newest page, Tips at the first not read', () => {
    expect(tabHome(pages, 'story', none)).toBe(current);
    expect(tabHome(pages, 'journal', none)).toBe(pages.journal.length - 1);
    expect(tabHome(pages, 'tips', none)).toBe(0);
    expect(tabHome(pages, 'tips', new Set(pages.tips.slice(0, 2).map(p => p.key)))).toBe(2);
    expect(tabHome(pages, 'tips', new Set(pages.tips.map(p => p.key)))).toBe(0);         // all read: the first
  });
});

describe("what's new: a dot on the \"i\" and on a tab (infoNews)", () => {
  it('a journal entry since the Journal was last seen, a tip not read yet; the Story never', () => {
    const s = written(6), pages = informationPages(s.state), tips = new Set(pages.tips.map(p => p.key));
    expect(infoNews(s.state, pages, { journal: 6, tips })).toEqual({ story: false, journal: false, tips: false });
    expect(infoNews(s.state, pages, { journal: 5, tips })).toEqual({ story: false, journal: true, tips: false });
    const unread = new Set(tips); unread.delete(pages.tips[1]!.key);
    expect(infoNews(s.state, pages, { journal: 6, tips: unread })).toEqual({ story: false, journal: false, tips: true });
  });

  it('as he plays: his thoughts and the tips that come unstuck are new until seen', () => {
    const s = setup();
    const seen = { journal: s.state.thoughts.journal.length, tips: new Set(informationPages(s.state).tips.map(p => p.key)) };
    run(s, 1);
    const news = infoNews(s.state, informationPages(s.state), seen);
    expect(news).toEqual({ story: false, journal: true, tips: true });
  });
});

describe('a journal page', () => {
  it('is titled by its days, "Earlier" for an old save\'s undated lines, "Journal" while empty', () => {
    const s = written(12), [first, second] = informationPages(s.state).journal;
    expect(journalTitle(first!)).toBe('Days 1 to 2');
    expect(journalTitle(second!)).toMatch(/^Days? \d/);
    expect(journalTitle({ ...first!, journal: [] })).toBe('Journal');
    expect(journalTitle({ ...first!, journal: [{ text: 'x', day: null }] })).toBe('Earlier');
    expect(journalTitle({ ...first!, journal: [{ text: 'x', day: 3 }] })).toBe('Day 3');
  });
});

describe('the window in the page (index.html)', () => {
  const win = html.slice(html.indexOf('<section class="win" id="infoWin"'), html.indexOf('</section>', html.indexOf('<section class="win" id="infoWin"')));

  it('is titled Information (D9), opened by the "i" beside the clock', () => {
    expect(win).toMatch(/data-win="info" data-width="\d+" role="dialog" aria-labelledby="infoTitle" hidden>/);
    expect(win).toContain('<h2 class="win-title" id="infoTitle">Information</h2>');
    expect(html).toMatch(/<button class="info-btn" id="infoBtn" type="button" data-opens="info" aria-controls="infoWin"[^>]*aria-label="[^"]+"[^>]*>i<\/button>/);
  });

  it('has the three tabs in order, a choice like the Settings\' (.seg), Story pressed to begin with', () => {
    const tabs = [...win.matchAll(/<button type="button" data-tab="(\w+)" aria-pressed="(true|false)">(\w+)<\/button>/g)];
    expect(tabs.map(m => m[1])).toEqual([...INFO_TABS]);
    expect(tabs.map(m => m[3])).toEqual(['Story', 'Journal', 'Tips']);
    expect(tabs.map(m => m[2])).toEqual(['true', 'false', 'false']);
    expect(win).toContain('<div class="seg info-tabs" id="infoTabs" role="group"');
  });

  it('has everything ui/info.ts fills in, on the paper of the book (.page), and Previous and Next 44 px or taller', () => {
    for (const id of ['infoBody', 'infoPage', 'infoHead', 'infoDone', 'infoPageTitle', 'infoText', 'infoNeeds', 'infoHint', 'infoJournal', 'infoMore']) {
      expect(win, id).toContain(`id="${id}"`);
    }
    expect(win).toContain('<div class="page" id="infoPage">');
    expect(win).toMatch(/<button type="button" class="btn" id="infoPrev">[^<]+<\/button><span class="info-count" id="infoCount"><\/span><button type="button" class="btn" id="infoNext">/);
    expect(Number(html.match(/\.info-turn \.btn \{[^}]*min-height: (\d+)px/)?.[1])).toBeGreaterThanOrEqual(44);
  });

  it('its own CSS stands right after the .book-tabs rules (merged beside the Discovery window\'s)', () => {
    const at = html.indexOf('.book-tabs button:focus-visible');
    const next = html.indexOf('\n', at) + 1;
    expect(html.slice(next, next + 40)).toMatch(/^\/\* Information \(src\/ui\/info\.ts/);
  });

  it('the "i" is round, the clock\'s height, and 44 px to tap', () => {
    expect(html).toMatch(/\.info-btn \{[^}]*width: calc\(1\.05rem \+ 8px\); height: calc\(1\.05rem \+ 8px\);[^}]*border-radius: 50%;/);
    expect(html).toContain('.info-btn::after { content: \'\'; position: absolute; inset: calc(-22px + (1.05rem + 8px) / 2);');
    // the clock's height: its line (0.875rem at 1.2) and its 4 px padding above and below
    expect(html).toMatch(/\.clock \{[^}]*padding: 4px [^}]*font: 700 0\.875rem\/1\.2 var\(--body\)/);
  });
});

describe('words in the game point to Information, not his book', () => {
  it('the welcome and the tip on finding the way say where the goal and the "i" are now', () => {
    const intro = html.slice(html.indexOf('<div class="win note" id="intro"'), html.indexOf('<div class="win note" id="news"'));
    expect(intro).toContain('The goal at the foot shows what\'s next. Tap its arrow and he sets off to do it.');
    expect(intro).toMatch(/Tap the goal's name, or the "i" by the clock, to read his story, his journal and a few tips\./);
    expect(intro).not.toContain('goal at the top');
    const tip = SURVIVAL.find(p => p.id === 'tip:tap')!;
    expect(tip.text).toContain("goal's arrow at the foot");
    expect(tip.text).not.toContain('at the top');
  });
});
