// His survival book (data/survival.ts, core/survival.ts, systems/thoughts.ts): what he knows, not a list of orders. Its
// pages are short; they come unstuck as he finds things (first has them, comes near, builds, reaches a goal); Making
// pages when he first needs the thing or has all its parts, counting what he has as the goal card does; Food pages say
// what each heals; the Journal holds his thoughts a few to a page, by day; and the sections come in their order.
import { describe, expect, it } from 'vitest';
import { createState, type GameState } from '../src/core/state';
import { EventBus } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS } from '../src/core/clock';
import { readSave, serialize } from '../src/core/save';
import { goalLines } from '../src/core/book';
import { dayOf, sectionStarts, survivalPages } from '../src/core/survival';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { GOALS } from '../src/data/goals';
import { MAKES } from '../src/data/making';
import { FOOD } from '../src/data/food';
import { JOURNAL_PER_PAGE, MAKE_NOTES, SECTIONS, SURVIVAL } from '../src/data/survival';
import { THOUGHTS } from '../src/data/thoughts';

const at = (id: string) => GOALS.findIndex(g => g.id === id);
const before = (id: string) => GOALS.slice(0, at(id)).map(g => g.id);

function setup(seed = 6) {
  const state = createState(CAMP, seed), events = new EventBus();
  return { state, ctx: { layout: CAMP, rng: createRng(seed), events } };
}
const run = (s: ReturnType<typeof setup>, seconds: number) => { for (let t = 0; t < seconds; t += STEP) step(s.state, STEP, s.ctx); };
const keys = (state: GameState) => survivalPages(state).map(p => p.key);

describe('the pages', () => {
  it('are short, as the book has always been: a sentence or two each', () => {
    const texts = [...SURVIVAL.map(p => [p.id, p.text] as const), ...Object.entries(MAKE_NOTES)];
    for (const [id, text] of texts) {
      expect(text!.length, id).toBeGreaterThan(20);
      expect(text!.length, id).toBeLessThan(140);
      expect(text!.match(/[.!?](\s|$)/g)?.length ?? 0, id).toBeLessThanOrEqual(2);
      expect(text, id).not.toMatch(/!/);
    }
    expect(new Set(SURVIVAL.map(p => p.id)).size).toBe(SURVIVAL.length);
    for (const p of SURVIVAL) if (p.by) expect(GOALS.some(g => g.id === p.by), p.id).toBe(true);
    // every thing he makes has its words
    for (const id of Object.keys(MAKES)) expect(MAKE_NOTES[id as keyof typeof MAKES], id).toBeTruthy();
  });

  it('a new game: the journal, the falls, the wreck and a tip; nothing else yet', () => {
    const s = setup();
    run(s, 1);
    const pages = survivalPages(s.state);
    expect(pages[0]).toMatchObject({ section: 'journal', title: 'Journal' });
    expect(pages[0]!.journal).toEqual([{ text: THOUGHTS[0]!.text, day: 1 }]);
    expect(keys(s.state)).toEqual(expect.arrayContaining(['place:falls', 'place:wreck', 'tip:tap']));
    expect(keys(s.state)).not.toContain('place:copper');
    expect(pages.some(p => p.section === 'making' || p.section === 'food')).toBe(false);
  });

  it('come unstuck as he finds things, and stay: copper ore once he has some, the nest once he comes near it', () => {
    const s = setup();
    s.state.goalsDone = before('copper');
    run(s, 1);
    expect(keys(s.state)).not.toContain('place:copper');
    s.state.player.backpack = { copper_ore: 1 };
    run(s, 1);
    expect(keys(s.state)).toContain('place:copper');
    s.state.player.backpack = {};                                   // used up: the page stays
    run(s, 1);
    expect(keys(s.state)).toContain('place:copper');
    expect(keys(s.state)).not.toContain('place:nest');
    s.state.player.pos = { x: CAMP.nests![0]!.pos.x + 3, z: CAMP.nests![0]!.pos.z };
    run(s, 1);
    expect(keys(s.state)).toContain('place:nest');
    // a tip once its thing is built
    s.state.built.push('shelter');
    run(s, 1);
    expect(keys(s.state)).toContain('tip:sleep');
  });

  it('Making: a page once he needs the thing or has its parts; what it needs, counted as the card counts; made, done', () => {
    const s = setup();
    run(s, 1);
    expect(keys(s.state)).not.toContain('make:campfire');
    s.state.player.backpack = { plank: 3, stone: 4 };              // all its parts, during salvage
    run(s, 1);
    expect(keys(s.state)).toContain('make:campfire');
    const t = setup();
    t.state.goalsDone = before('stone_axe'); t.state.built = ['campfire'];
    t.state.player.backpack = { branch: 1 };
    run(t, 1);
    const axe = survivalPages(t.state).find(p => p.key === 'make:stone_axe')!;
    expect(axe).toMatchObject({ section: 'making', title: MAKES.stone_axe.name, text: MAKE_NOTES.stone_axe, where: 'Made wherever you stand.', done: false });
    expect(axe.lines).toEqual(goalLines(t.state, GOALS[at('stone_axe')]!));
    t.state.tools.axe = true;
    expect(survivalPages(t.state).find(p => p.key === 'make:stone_axe')).toMatchObject({ done: true });
    expect(survivalPages(t.state).find(p => p.key === 'make:campfire')).toMatchObject({ done: true, where: 'Built at the fire spot.' });
  });

  it('Food: what each heals; raw fish needs cooking', () => {
    const s = setup();
    s.state.goalsDone = before('meal');
    s.state.player.backpack = { berries: 1, raw_fish: 1, cooked_fish: 1 };
    run(s, 1);
    const food = survivalPages(s.state).filter(p => p.section === 'food');
    expect(food.map(p => p.key)).toEqual(['food:berries', 'food:raw_fish', 'food:cooked_fish']);
    expect(food.map(p => p.heals)).toEqual([FOOD.berries!.heals, null, FOOD.cooked_fish!.heals]);
    expect(food[1]!.text).toMatch(/[Cc]ook/);
  });

  it('the journal: his thoughts in order, a few to a page, with their days', () => {
    const s = setup();
    s.state.thoughts.journal = THOUGHTS.slice(0, JOURNAL_PER_PAGE * 2 + 1).map((t, i) => ({ id: t.id, at: i * DAY_SECONDS / 2, shown: true }));
    const journal = survivalPages(s.state).filter(p => p.section === 'journal');
    expect(journal).toHaveLength(3);
    expect(journal.flatMap(p => p.journal).map(l => l.text)).toEqual(THOUGHTS.slice(0, JOURNAL_PER_PAGE * 2 + 1).map(t => t.text));
    expect(journal[0]!.journal.map(l => l.day)).toEqual([0, 1, 2, 3, 4].map(i => dayOf(i * DAY_SECONDS / 2)));
    expect(journal.map(p => p.key)).toEqual(['journal:1', 'journal:2', 'journal:3']);
    // an old save's lines have no day
    s.state.thoughts.journal = [{ id: THOUGHTS[0]!.id, at: null, shown: true }];
    expect(survivalPages(s.state)[0]!.journal).toEqual([{ text: THOUGHTS[0]!.text, day: null }]);
  });

  it("the journal: an old save's lines (no day) never share a page with dated ones; the dated start a fresh page", () => {
    const s = setup();
    const undated = JOURNAL_PER_PAGE + 2;                           // a full page and a bit
    s.state.thoughts.journal = THOUGHTS.slice(0, undated + 3).map((t, i) => ({ id: t.id, at: i < undated ? null : 3 * DAY_SECONDS + i, shown: true }));
    const journal = survivalPages(s.state).filter(p => p.section === 'journal');
    expect(journal.map(p => p.journal.length)).toEqual([JOURNAL_PER_PAGE, 2, 3]);
    expect(journal[1]!.journal.every(l => l.day === null)).toBe(true);
    expect(journal[2]!.journal.every(l => l.day === 4)).toBe(true);
    expect(journal.flatMap(p => p.journal).map(l => l.text)).toEqual(THOUGHTS.slice(0, undated + 3).map(t => t.text));
    expect(journal.map(p => p.key)).toEqual(['journal:1', 'journal:2', 'journal:3']);
  });

  it('sections come in order, each starting where its tab jumps to', () => {
    const s = setup();
    s.state.goalsDone = before('goblins');
    s.state.player.backpack = { berries: 1, copper_ore: 1 };
    run(s, 1);
    const pages = survivalPages(s.state), order = SECTIONS.map(x => x.id);
    const seen = pages.map(p => order.indexOf(p.section));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    const starts = sectionStarts(pages);
    for (const sec of SECTIONS) expect(pages[starts[sec.id]!]!.section).toBe(sec.id);
    expect(starts.journal).toBe(0);
  });

  it('what came unstuck is saved', () => {
    const s = setup();
    s.state.goalsDone = before('copper');
    s.state.player.backpack = { copper_ore: 1 };
    run(s, 1);
    const back = readSave(serialize(s.state, Date.now()), CAMP).state;
    expect(keys(back)).toEqual(keys(s.state));
  });
});
