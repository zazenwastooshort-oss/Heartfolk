// His thoughts (the survival book; data/thoughts.ts, systems/thoughts.ts, core/thoughts.ts): the lines themselves (short,
// plain, no exclamation marks, never the same twice, one for every goal), and the rules: a new goal's thought is said at
// once, even straight after another bubble; passing thoughts come at most one every few minutes, story moments once it
// is quiet; none is ever said twice; every one is in his journal, which a save keeps; an old save starts with what its
// progress implies; the village has none. Goals are made current by marking the goals before them done, never by
// position.
import { describe, expect, it } from 'vitest';
import { allGoalsDone, createState, currentGoal, SAVE_VERSION, type GameState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS, isNight } from '../src/core/clock';
import { readSave, serialize } from '../src/core/save';
import { impliedThoughts, kindOf } from '../src/core/thoughts';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, type Layout } from '../src/world/layout';
import { maySay } from '../src/systems/thoughts';
import { BOOK, GOALS } from '../src/data/goals';
import { ITEMS } from '../src/data/skills';
import { STOKE } from '../src/data/fire';
import { THOUGHT, THOUGHTS, goalThought, thoughtDef } from '../src/data/thoughts';
import { Bot } from './bot';

const at = (id: string) => GOALS.findIndex(g => g.id === id);
/** The goals before `id`, by id: marking them done makes `id` the current goal. */
const before = (id: string) => GOALS.slice(0, at(id)).map(g => g.id);

function setup(layout: Layout = CAMP, seed = 5) {
  const state = createState(layout, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, layout, ctx: { layout, rng: createRng(seed), events } };
}
type Setup = ReturnType<typeof setup>;
const run = (s: Setup, seconds: number) => { for (let t = 0; t < seconds; t += STEP) step(s.state, STEP, s.ctx); };
/** Play on until `done` (at most `max` seconds), noting each thought said out loud (its id and when). */
function watch(s: Setup, seconds: number, said: { id: string; at: number }[] = []): { id: string; at: number }[] {
  let last = s.state.thoughts.saidAt;
  for (let t = 0; t < seconds; t += STEP) {
    step(s.state, STEP, s.ctx);
    const th = s.state.thoughts;
    if (th.saidAt !== last) { last = th.saidAt; said.push({ id: th.last!, at: th.saidAt! }); }
  }
  return said;
}
const journalIds = (state: GameState) => state.thoughts.journal.map(e => e.id);
/** A goal's thought id. */
const goalLine = (id: string) => goalThought(id)!.id;

describe('the lines', () => {
  it('are short, plain and calm: at most THOUGHT.maxLength characters, no exclamation marks, a full stop at the end', () => {
    for (const t of THOUGHTS) {
      expect(t.text.length, t.id).toBeLessThanOrEqual(THOUGHT.maxLength);
      expect(t.text.length, t.id).toBeGreaterThan(10);
      expect(t.text, t.id).not.toMatch(/!/);
      expect(t.text, t.id).toMatch(/[.?]$/);
    }
    expect(THOUGHT.maxLength).toBeLessThanOrEqual(60);
  });

  it('never say the same thing twice: every id and every line differs', () => {
    expect(new Set(THOUGHTS.map(t => t.id)).size).toBe(THOUGHTS.length);
    expect(new Set(THOUGHTS.map(t => t.text.toLowerCase())).size).toBe(THOUGHTS.length);
  });

  it('every goal has its thought (a new goal needs a line in data/thoughts.ts), and every cue points at something real', () => {
    for (const g of GOALS) expect(goalThought(g.id), `add a thought for goal "${g.id}" in data/thoughts.ts`).toBeTruthy();
    for (const t of THOUGHTS) {
      const cue = t.cue;
      if ('goal' in cue) expect(GOALS.some(g => g.id === cue.goal), t.id).toBe(true);
      if ('item' in cue) expect(cue.item === BOOK || cue.item in ITEMS, t.id).toBe(true);
    }
    // each goal has one, and only one
    for (const g of GOALS) expect(THOUGHTS.filter(t => 'goal' in t.cue && t.cue.goal === g.id)).toHaveLength(1);
  });

  it('the numbers keep bubbles apart: minutes between passing thoughts, a quiet spell before any', () => {
    expect(THOUGHT.gap).toBeGreaterThanOrEqual(120);
    expect(THOUGHT.quiet).toBeGreaterThanOrEqual(10);
    expect(THOUGHT.wait).toBeLessThan(THOUGHT.gap);
  });
});

describe('when he says them', () => {
  it('a new game: washing up is the first thing he thinks, said at once and written in his journal', () => {
    const s = setup();
    expect(s.state.thoughts.journal).toEqual([]);
    run(s, STEP);
    expect(s.state.thoughts.journal).toEqual([{ id: goalLine('salvage'), at: s.state.time, shown: true }]);
    expect(s.state.thoughts).toMatchObject({ last: goalLine('salvage'), saidAt: s.state.time });
  });

  it("a new goal's thought always shows, even straight after another bubble", () => {
    const s = setup();
    s.state.goalsDone = before('copper');
    s.state.tools.pick = true; s.state.tools.axe = true;
    run(s, 1);
    expect(s.state.thoughts.last).toBe(goalLine('copper'));
    // a passing thought just now (his first copper ore)
    s.state.player.backpack = { copper_ore: 1 };
    run(s, THOUGHT.quiet + 1);
    expect(s.state.thoughts.last).toBe('first:copper');
    // the copper goal is done a moment later: the chest's thought is said at once all the same
    s.state.player.backpack = { copper_ore: 3 };
    const said = watch(s, 0.2);
    expect(said.map(x => x.id)).toEqual([goalLine('chest')]);
    expect(said[0]!.at - s.state.thoughts.passingAt!).toBeLessThan(THOUGHT.quiet);   // well inside the quiet spell
  });

  it('goals finished in the same moment are written in the journal unsaid; only the one he is on is said', () => {
    const s = setup();
    s.state.goalsDone = before('berries');
    run(s, 1);
    s.state.goalsDone = before('fish');               // berries and the rod done at once (a loaded save, say)
    s.state.tools.rod = true;
    const said = watch(s, 1);
    expect(said.map(x => x.id)).toEqual([goalLine('fish')]);
    const rod = s.state.thoughts.journal.find(e => e.id === goalLine('rod'))!;
    expect(rod.shown).toBe(false);
    // and a skipped goal's thought is never said later
    expect(watch(s, THOUGHT.wait + 5).map(x => x.id)).not.toContain(goalLine('rod'));
  });

  it('passing thoughts come at most one every few minutes; one that waits too long is only in the journal', () => {
    const s = setup();
    s.state.goalsDone = before('meal');
    run(s, THOUGHT.quiet + 1);                           // the meal's thought, then quiet
    s.state.player.backpack = { berries: 2, raw_fish: 1, burnt_fish: 1 };
    const said = watch(s, THOUGHT.gap * 2);
    const passing = said.filter(x => kindOf(thoughtDef(x.id)!) === 'passing');
    expect(passing).toHaveLength(1);                     // the other two waited, then went quietly into the journal
    const firsts = ['first:berries', 'first:fish', 'first:burnt'];
    expect(firsts.every(id => journalIds(s.state).includes(id))).toBe(true);
    expect(s.state.thoughts.journal.filter(e => firsts.includes(e.id) && !e.shown)).toHaveLength(2);
  });

  it('a story moment waits its turn like a passing thought, but goes first when both wait', () => {
    const s = setup();
    s.state.goalsDone = before('meal');
    run(s, 1);
    s.state.player.backpack = { berries: 1, old_map: 1 };   // a first find and a story moment at once
    const said = watch(s, THOUGHT.gap);
    expect(said.map(x => x.id)).toEqual(['story:map']);
    expect(said[0]!.at - s.state.thoughts.journal.find(e => e.id === goalLine('meal'))!.at!).toBeGreaterThanOrEqual(THOUGHT.quiet - STEP);
    expect(s.state.thoughts.journal.find(e => e.id === 'first:berries')).toMatchObject({ shown: false });
    // a story moment soon after a passing thought waits for the gap; a goal's never waits
    s.state.thoughts.passingAt = s.state.time;
    s.state.thoughts.saidAt = s.state.time - THOUGHT.quiet;
    expect(maySay(s.state, 'story')).toBe(false);
    expect(maySay(s.state, 'passing')).toBe(false);
    expect(maySay(s.state, 'goal')).toBe(true);
  });

  it('the first night is a story moment, and so is the torn map', () => {
    const s = setup();
    run(s, 1);
    s.state.time = (Math.floor(s.state.time / DAY_SECONDS) + STOKE.at) * DAY_SECONDS + 1;
    expect(watch(s, THOUGHT.quiet + 2).map(x => x.id)).toContain('story:night');
    s.state.player.backpack = { old_map: 1 };
    s.state.thoughts.passingAt = null;                   // (a few minutes on)
    expect(watch(s, THOUGHT.quiet + 2).map(x => x.id)).toContain('story:map');
  });

  it('a story moment is never dropped for waiting: said once its turn comes, however long; the first night only at night', () => {
    const s = setup();
    run(s, 1);
    expect(THOUGHT.gap).toBeGreaterThan(THOUGHT.wait);
    s.state.thoughts.passingAt = s.state.time;           // a passing thought just said: minutes to wait
    s.state.hasBook = true;
    const said = watch(s, THOUGHT.gap + 2);
    expect(said.map(x => x.id)).toEqual(['story:book']);
    expect(said[0]!.at - s.state.thoughts.journal.find(e => e.id === 'story:book')!.at!).toBeGreaterThan(THOUGHT.wait);
    // the first night, had just before dawn with a passing thought just said: it waits past dawn, through the day,
    // and is said the next night
    const day = Math.floor(s.state.time / DAY_SECONDS) + 1;
    s.state.time = (day + STOKE.until) * DAY_SECONDS - 5;
    s.state.thoughts.passingAt = s.state.time;
    expect(watch(s, 30).map(x => x.id)).toEqual([]);
    expect(s.state.thoughts.journal.find(e => e.id === 'story:night')).toMatchObject({ shown: false });
    s.state.thoughts.passingAt = null;                   // (minutes on, in the day)
    expect(watch(s, THOUGHT.quiet + 2).map(x => x.id)).toEqual([]);
    s.state.time = (day + STOKE.at) * DAY_SECONDS + 1;
    expect(watch(s, THOUGHT.quiet + 2).map(x => x.id)).toEqual(['story:night']);
  });

  it('nothing is ever thought twice: things gone and found again, places left and come back to', () => {
    const s = setup();
    s.state.goalsDone = before('rats');
    run(s, 1);
    s.state.player.pos = { ...CAMP.nests![0]!.pos, x: CAMP.nests![0]!.pos.x + 2 };
    run(s, THOUGHT.quiet + 2);
    expect(journalIds(s.state)).toContain('first:nest');
    s.state.player.pos = { ...CAMP.start };
    run(s, 2);
    s.state.player.pos = { ...CAMP.nests![0]!.pos, x: CAMP.nests![0]!.pos.x + 2 };
    s.state.player.backpack = { rat_hide: 1 };
    run(s, THOUGHT.gap + 5);
    s.state.player.backpack = {};
    run(s, 2);
    s.state.player.backpack = { rat_hide: 1 };
    run(s, THOUGHT.gap + 5);
    const ids = journalIds(s.state);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('played games: bubbles never pile up or repeat, passing ones minutes apart, every bubble in the journal, and every story moment said', () => {
    for (const seed of [1, 2, 3, 4]) {
      const s = setup(CAMP, seed), bot = new Bot(CAMP, s.events);
      const said: { id: string; at: number }[] = [];
      let last = s.state.thoughts.saidAt;
      for (let t = 0; t < 3 * 3600 && !allGoalsDone(s.state); t += STEP) {
        bot.tick(s.state, s.events);
        step(s.state, STEP, s.ctx);
        const th = s.state.thoughts;
        if (th.saidAt !== last) { last = th.saidAt; said.push({ id: th.last!, at: th.saidAt! }); }
      }
      // (the torn map comes with the last goal: a few more minutes for its turn)
      for (let t = 0; t < THOUGHT.gap + THOUGHT.quiet; t += STEP) {
        step(s.state, STEP, s.ctx);
        const th = s.state.thoughts;
        if (th.saidAt !== last) { last = th.saidAt; said.push({ id: th.last!, at: th.saidAt! }); }
      }
      expect(allGoalsDone(s.state), `seed ${seed}`).toBe(true);
      expect(new Set(said.map(x => x.id)).size, `seed ${seed}`).toBe(said.length);    // never the same line twice
      const ids = journalIds(s.state);
      expect(new Set(ids).size).toBe(ids.length);
      for (const x of said) expect(s.state.thoughts.journal.find(e => e.id === x.id)?.shown, x.id).toBe(true);
      const passing = said.filter(x => kindOf(thoughtDef(x.id)!) !== 'goal');
      for (let i = 1; i < passing.length; i++) expect(passing[i]!.at - passing[i - 1]!.at).toBeGreaterThanOrEqual(THOUGHT.gap - STEP);
      for (let i = 1; i < said.length; i++) {
        if (kindOf(thoughtDef(said[i]!.id)!) !== 'goal') expect(said[i]!.at - said[i - 1]!.at, said[i]!.id).toBeGreaterThanOrEqual(THOUGHT.quiet - STEP);
      }
      // every story moment was said out loud (delayed for its turn, never dropped), the first night at night
      for (const id of ['story:book', 'story:night', 'story:map']) {
        expect(said.map(x => x.id), `seed ${seed}: ${id}`).toContain(id);
        expect(s.state.thoughts.journal.find(e => e.id === id), `seed ${seed}: ${id}`).toMatchObject({ shown: true, at: expect.any(Number) });
      }
      expect(isNight(said.find(x => x.id === 'story:night')!.at), `seed ${seed}`).toBe(true);
      // every goal's thought was had, and he said a good few things beyond them
      for (const g of GOALS) expect(ids).toContain(goalLine(g.id));
      expect(said.length).toBeGreaterThan(GOALS.length * 0.6);
      if (process.env.HEARTHFOLK_PACING) {
        const start = createState(CAMP, seed).time, min = (x: number) => ((x - start) / 60).toFixed(1);
        const cuedAt = (id: string) => s.state.thoughts.journal.find(e => e.id === id)?.at;
        const lines = said.map(x => `  ${min(x.at)}  ${thoughtDef(x.id)!.text}${thoughtDef(x.id)!.story ? `  (story, had at ${min(cuedAt(x.id)!)})` : ''}`);
        console.log([`thoughts, seed ${seed}: ${said.length} bubbles in ${min(s.state.time)} minutes of play (${passing.length} not a goal's), ${ids.length} in the journal`, ...lines].join('\n'));
      }
    }
  }, 120_000);

  it('the village has no thoughts', () => {
    const s = setup(VILLAGE);
    run(s, 30);
    expect(s.state.thoughts).toEqual({ journal: [], known: [], last: null, saidAt: null, passingAt: null });
  });
});

describe('saving his thoughts', () => {
  it('the journal, the pages and when he last spoke come back after a reload, and nothing is said again', () => {
    const s = setup();
    s.state.goalsDone = before('copper'); s.state.tools.pick = true;
    s.state.player.backpack = { copper_ore: 1 };
    run(s, THOUGHT.quiet + 2);
    const before_ = structuredClone(s.state.thoughts);
    expect(before_.journal.length).toBeGreaterThan(1);
    const back = readSave(serialize(s.state, Date.now()), CAMP).state;
    expect(back.thoughts).toEqual(before_);
    expect(watch({ ...setup(), state: back }, 5)).toEqual([]);
  });

  it('damaged thoughts are mended: unknown lines, repeats, times to come and stray pages are dropped', () => {
    const s = setup();
    run(s, 1);
    const data = JSON.parse(serialize(s.state));
    data.thoughts = {
      journal: [{ id: 'goal:salvage', at: 1, shown: true }, { id: 'goal:salvage', at: 2, shown: true }, { id: 'nonsense', at: 3 },
        { id: 'story:book', at: 1e12, shown: 'yes' }, 'junk', null],
      known: ['place:falls', 'place:falls', 'nowhere', 7, 'make:campfire'],
      last: 'nonsense', saidAt: 'soon', passingAt: Infinity,
    };
    const back = readSave(JSON.stringify(data), CAMP).state.thoughts;
    expect(back.journal).toEqual([{ id: 'goal:salvage', at: 1, shown: true }, { id: 'story:book', at: null, shown: true }]);
    expect(back.known).toEqual(['place:falls', 'make:campfire']);
    expect(back).toMatchObject({ last: null, saidAt: null, passingAt: null });
    // not a list at all: what his progress implies
    data.thoughts = { journal: 'lost', known: {} };
    const mended = readSave(JSON.stringify(data), CAMP).state.thoughts;
    expect(mended.journal.map(e => e.id)).toContain('goal:salvage');
  });

  it('an old save (format 10, 0.0.22, before the book) loads with the journal and pages its progress implies, said before the book', () => {
    const s = setup();
    s.state.goalsDone = before('rats'); s.state.hasBook = true;
    s.state.built = ['campfire', 'woodpile', 'shelter', 'chest', 'dummy'];
    s.state.tools = { axe: true, pick: true, rod: true } as GameState['tools'];
    s.state.equipment.weapon = 'stone_club';
    s.state.bank = { cooked_fish: 4, berries: 3 };
    s.state.time = 3.4 * DAY_SECONDS;                     // days in: past the first night
    const old = JSON.parse(serialize(s.state));
    delete old.thoughts; old.version = 10;
    for (const k of ['goblins', 'goblinCamp', 'restedUntil']) delete old[k];
    const back = readSave(JSON.stringify(old), CAMP).state;
    expect(back.version).toBe(SAVE_VERSION);
    expect(currentGoal(back).id).toBe('rats');
    const ids = journalIds(back);
    // every goal's thought up to the rats, in order, and the book; nothing from after the rats
    const upTo = GOALS.slice(0, at('rats') + 1).map(g => goalLine(g.id));
    expect(ids.filter(id => id.startsWith('goal:'))).toEqual(upTo);
    expect(ids).toContain('story:book');
    // the first night reads in order: just after the campfire's goal, before the goal after it
    const fire = GOALS.findIndex(g => g.makes === 'campfire');
    expect(ids.indexOf('story:night')).toBeGreaterThan(ids.indexOf(goalLine(GOALS[fire]!.id)));
    expect(ids.indexOf('story:night')).toBeLessThan(ids.indexOf(goalLine(GOALS[fire + 1]!.id)));
    expect(ids).toContain('first:copper');
    expect(ids).not.toContain('first:hide');
    expect(ids).not.toContain(goalLine('hide_cap'));
    expect(back.thoughts.journal.every(e => e.at === null && e.shown)).toBe(true);
    expect(back.thoughts.known).toEqual(expect.arrayContaining(['place:copper', 'place:fishing', 'food:cooked_fish', 'tip:chest', 'make:campfire', 'make:rod']));
    expect(back.thoughts.known).not.toContain('place:goblins');
    // played on, the rats' thought isn't said again (it is in the journal)
    const said = watch({ ...setup(), state: back }, 2);
    expect(said.map(x => x.id)).not.toContain(goalLine('rats'));
    // a brand-new game implies only the thought of the goal it is on
    expect(impliedThoughts(createState(CAMP, 1), CAMP).journal).toEqual([{ id: goalLine('salvage'), at: null, shown: true }]);
  });

  it('a village save has no thoughts, whatever it says', () => {
    const s = setup(VILLAGE);
    const data = JSON.parse(serialize(s.state));
    data.thoughts = { journal: [{ id: 'goal:salvage', at: 1, shown: true }], known: ['place:falls'] };
    expect(readSave(JSON.stringify(data), VILLAGE).state.thoughts.journal).toEqual([]);
  });
});
