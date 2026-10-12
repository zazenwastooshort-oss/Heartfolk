// His book (game 0.0.17; core/book.ts, drawn by ui/book.ts): one page per goal, in order, up to the goal he is on and
// no further; finished pages stay done after their things are used up; each line's tick and count match the goal
// card's (which counts with the same goalLines); and picking the book up opens it.
import { describe, expect, it } from 'vitest';
import { createState, currentGoal, owned } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { bookPages, goalLines, opensBook } from '../src/core/book';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { applyCommands, type Command } from '../src/systems/commands';
import { GOALS } from '../src/data/goals';
import { MAKES } from '../src/data/making';
import type { PickupKind } from '../src/data/pickups';

const ofKind = (kind: PickupKind) => CAMP.pickups!.filter(p => p.kind === kind);

function setup(seed = 3) {
  const state = createState(CAMP, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, ctx: { layout: CAMP, rng: createRng(seed), events } };
}
type Setup = ReturnType<typeof setup>;
const send = (s: Setup, c: Command) => applyCommands(s.state, CAMP, [c], s.events);
const runUntil = (s: Setup, done: () => boolean, max: number) => { for (let t = 0; t < max && !done(); t += STEP) step(s.state, STEP, s.ctx); };
const since = (s: Setup, from: number) => s.log.slice(from);
/** Tap a pickup, wait until it is in his backpack, then tap the grass where he stands so he goes no further. */
function pickUp(s: Setup, id: string): void {
  const from = s.log.length;
  send(s, { type: 'pickup', id });
  runUntil(s, () => since(s, from).some(e => e.type === 'pickedUp' && e.id === id), 60);
  send(s, { type: 'walk', to: { ...s.state.player.pos } });
  runUntil(s, () => s.state.player.task.kind === 'idle', 5);
}
/** Tap a pickup and let him gather until he stops by himself. */
function gather(s: Setup, id: string): void {
  const from = s.log.length;
  send(s, { type: 'pickup', id });
  runUntil(s, () => since(s, from).some(e => e.type === 'allGathered' || e.type === 'noStorage' || e.type === 'noRoom'), 600);
}

describe('the pages of his book', () => {
  it('every goal has a page of its own: a sentence or two', () => {
    for (const g of GOALS) {
      expect(g.page.length, g.id).toBeGreaterThan(20);
      expect(g.page.length, g.id).toBeLessThan(140);
      expect(g.page.match(/[.!?](\s|$)/g)?.length ?? 0, g.id).toBeLessThanOrEqual(2);
    }
  });

  it('a new game shows just the first page: the current one, nothing ticked yet', () => {
    const s = setup(), pages = bookPages(s.state);
    expect(pages.map(p => p.goal)).toEqual(['salvage']);
    expect(pages[0]).toMatchObject({ number: 1, title: 'Salvage the wreck', text: GOALS[0]!.page, hint: GOALS[0]!.hint, done: false, current: true });
    expect(pages[0]!.lines).toEqual([
      { id: 'plank', need: 7, got: 0, done: false }, { id: 'tarp', need: 1, got: 0, done: false }, { id: 'book', need: 1, got: 0, done: false },
    ]);
  });

  it('shows pages up to the goal he is on and no further, the ones before it done', () => {
    for (let i = 0; i < GOALS.length; i++) {
      const s = setup();
      s.state.goalsDone = GOALS.slice(0, i).map(g => g.id);
      const pages = bookPages(s.state);
      expect(pages.map(p => p.goal)).toEqual(GOALS.slice(0, i + 1).map(g => g.id));
      expect(pages.map(p => p.number)).toEqual(pages.map((_, n) => n + 1));
      expect(pages.at(-1)!.goal).toBe(currentGoal(s.state).id);
      expect(pages.map(p => p.current)).toEqual(pages.map((_, n) => n === i));
      expect(pages.map(p => p.done)).toEqual(pages.map((_, n) => n < i));
    }
  });

  it('with every goal finished, the last page is the current one, and done', () => {
    const s = setup();
    s.state.goalsDone = GOALS.map(g => g.id);
    const pages = bookPages(s.state);
    expect(pages).toHaveLength(GOALS.length);
    expect(pages.at(-1)).toMatchObject({ current: true, done: true, hint: '' });
  });

  it('a finished page stays done, every line ticked, after its things are used up: the campfire takes planks', () => {
    const s = setup();
    gather(s, ofKind('plank')[0]!.id);
    pickUp(s, 'tarp1'); pickUp(s, 'book1');
    for (const p of ofKind('stone').slice(0, MAKES.campfire.needs.stone!)) pickUp(s, p.id);
    expect(bookPages(s.state).map(p => p.goal)).toEqual(['salvage', 'campfire']);
    const from = s.log.length;
    send(s, { type: 'make', id: 'campfire' });
    runUntil(s, () => since(s, from).some(e => e.type === 'made'), 60);
    expect(s.state.built).toContain('campfire');
    expect(owned(s.state, 'plank')).toBeLessThan(GOALS[0]!.needs.plank!);   // the fire used some of the wreck's planks
    const [salvage, campfire, axe, ...rest] = bookPages(s.state);
    expect(rest).toEqual([]);
    expect(salvage).toMatchObject({ done: true, current: false });
    expect(salvage!.lines.every(l => l.done && l.got === l.need)).toBe(true);
    expect(campfire).toMatchObject({ done: true, current: false });
    expect(campfire!.lines.every(l => l.done && l.got === l.need)).toBe(true);   // its stones and planks are gone too
    expect([salvage!.hint, campfire!.hint]).toEqual(['', '']);                   // nothing left to do on a finished page
    expect(axe).toMatchObject({ goal: 'stone_axe', done: false, current: true, hint: GOALS[2]!.hint });
  });

  it("counts and ticks each line as the goal card does: carried or stored, never more than needed", () => {
    const s = setup();
    s.state.goalsDone = ['salvage', 'campfire'];
    s.state.player.backpack = { branch: 1, stone: 3 };
    s.state.bank = { stone: 1 };
    const page = bookPages(s.state).at(-1)!;
    expect(page.goal).toBe('stone_axe');
    expect(page.lines).toEqual(goalLines(s.state, currentGoal(s.state)));       // the card counts with goalLines
    expect(page.lines).toEqual([
      { id: 'branch', need: 2, got: 1, done: false },
      { id: 'stone', need: 2, got: 2, done: true },
    ]);
    expect(page.hint).toBe(GOALS[2]!.hint);
    s.state.bank.branch = 1;                                                     // a stored branch counts too
    const ready = bookPages(s.state).at(-1)!;
    expect(ready.lines.every(l => l.done)).toBe(true);
    expect(ready.hint).toBe(GOALS[2]!.ready);                                    // with it all there: the card's ready text
    expect(ready.done).toBe(false);                                              // not done until the axe is made
  });

  it('the card and the book agree on the current goal through a played game', () => {
    const s = setup();
    const agree = () => expect(bookPages(s.state).at(-1)!.lines).toEqual(goalLines(s.state, currentGoal(s.state)));
    agree();
    pickUp(s, 'book1'); agree();
    gather(s, ofKind('plank')[0]!.id); agree();
    pickUp(s, 'tarp1'); agree();
    pickUp(s, ofKind('stone')[0]!.id); agree();
    expect(bookPages(s.state).at(-1)!.lines).toEqual([
      { id: 'plank', need: 3, got: 3, done: true }, { id: 'stone', need: 4, got: 1, done: false },
    ]);
  });
});

describe('opening the book', () => {
  it('picking the book up opens it; picking up anything else does not', () => {
    const s = setup();
    pickUp(s, ofKind('plank')[0]!.id);
    pickUp(s, 'tarp1');
    expect(s.log.some(opensBook)).toBe(false);
    pickUp(s, 'book1');
    expect(s.state.hasBook).toBe(true);
    expect(s.log.filter(opensBook)).toEqual([{ type: 'pickedUp', id: 'book1', kind: 'book', item: null, count: 1 }]);
    // it opens at the current page: the last one shown
    expect(bookPages(s.state).at(-1)!.current).toBe(true);
  });
});
