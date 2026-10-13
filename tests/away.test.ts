// Away time (game 0.0.20): while the game is closed he keeps working at a fifth of his speed, for at most 2 hours of
// real time, caught up when its save is opened (catchUpAway and awayOnOpening in sim.ts; the time from
// systems/away.ts); a game left open, in a background tab or with the screen off, catches up at full speed (catchUp,
// openFor; the real time between frames from FrameClock). Saves say the time the game was played up to (format 8).
// The "While you were away" note lists what he did: systems/away.ts counts it from the events and keeps what the note
// tells (tellAway), ui/away.ts words it.
import { describe, expect, it } from 'vitest';
import { createState, owned, SAVE_VERSION, type GameState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS, isNight, nightOf } from '../src/core/clock';
import { clearSave, deserialize, load, readSave, save, SAVE_KEY, serialize, type Storage } from '../src/core/save';
import { awayOnOpening, catchUp, catchUpAway, step } from '../src/sim';
import { addSpan, closedFor, didSomething, emptySummary, FrameClock, openFor, tally, tellAway, worthNoting } from '../src/systems/away';
import { applyCommands, type Command } from '../src/systems/commands';
import { awayText, duration } from '../src/ui/away';
import { CAMP } from '../src/world/camp';
import { VILLAGE, type Layout } from '../src/world/layout';
import { GOALS } from '../src/data/goals';
import { AWAY } from '../src/data/away';
import { STOKE } from '../src/data/fire';
import { RESOURCES } from '../src/data/skills';
import { levelFor } from '../src/data/xp';

/** Any real time will do: the game never reads the clock itself, main.ts hands it in. */
const NOW = Date.UTC(2026, 9, 12, 9, 0, 0);
const MIN = 60 * 1000, HOUR = 60 * MIN;

function setup(layout: Layout = CAMP, seed = 5) {
  const state = createState(layout, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, layout, ctx: { layout, rng: createRng(seed), events } };
}
type Setup = ReturnType<typeof setup>;
const send = (s: Setup, c: Command) => applyCommands(s.state, s.layout, [c], s.events);
const run = (s: Setup, seconds: number) => { for (let t = 0; t < seconds; t += STEP) step(s.state, STEP, s.ctx); };
/** In-game time on `day` (from 0) at `hour` o'clock. */
const at = (day: number, hour: number) => (day + hour / 24) * DAY_SECONDS;
/** A camp with every goal done: the campfire, the shelter and the chest stand, and he has both tools. */
function campSet(seed = 5): Setup {
  const s = setup(CAMP, seed);
  s.state.goalsDone = GOALS.map(g => g.id);
  s.state.built = ['campfire', 'woodpile', 'shelter', 'chest'];
  s.state.tools = { ...s.state.tools, axe: true, pick: true };
  s.state.hasBook = true;
  return s;
}
/** That camp at `hour` o'clock with a few logs in the chest for the fire, him at work on `nodeId`. */
function working(nodeId = 'camp_birch1', hour = 9): Setup {
  const s = campSet();
  s.state.built = s.state.built.filter(b => b !== 'shelter');   // (no shelter: he works through the night, not to bed)
  s.state.bank = { birch_logs: 6 };
  s.state.time = at(0, hour);
  send(s, { type: 'work', nodeId });
  run(s, 10);
  return s;
}
/** Whether he works (or is on his way to work) a birch. */
const atBirch = (state: GameState) => {
  const p = state.player, id = p.task.kind === 'gather' ? p.task.nodeId : p.pending?.kind === 'node' ? p.pending.id : '';
  return id.startsWith('camp_birch');
};

/** The game saved at `savedAt` and opened again at NOW, as main.ts opens it: read back, then away time caught up. */
function reopen(state: GameState, savedAt: number | undefined, layout: Layout = CAMP, seed = 7) {
  const loaded = readSave(serialize(state, savedAt), layout), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { ...loaded, ...catchUpAway(loaded.state, loaded.savedAt, NOW, { layout, rng: createRng(seed), events }), log };
}
/** The same game played on for `seconds` with the same luck, as if it had never closed. */
function playedOn(state: GameState, seconds: number, layout: Layout = CAMP, seed = 7) {
  const s = readSave(serialize(state), layout).state, events = new EventBus(), summary = emptySummary();
  events.on(e => tally(summary, e));
  const ctx = { layout, rng: createRng(seed), events };
  for (let n = Math.round(seconds / STEP); n > 0; n--) step(s, STEP, ctx);
  return { state: s, summary };
}
function memory(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: k => data.get(k) ?? null, set: (k, v) => { data.set(k, v); } };
}

describe('how much play time away is worth', () => {
  it('closed: a fifth of the real time, for at most 2 hours of it (24 minutes of play)', () => {
    expect(AWAY.rate).toBe(0.2);
    expect(AWAY.max).toBe(2 * 60 * 60);
    expect(closedFor(NOW - HOUR, NOW)).toMatchObject({ real: 3600, counted: 3600, open: false });
    expect(closedFor(NOW - HOUR, NOW).game).toBeCloseTo(12 * 60);
    expect(closedFor(NOW - 5 * HOUR, NOW)).toMatchObject({ real: 5 * 3600, counted: 2 * 3600 });
    expect(closedFor(NOW - 5 * HOUR, NOW).game).toBeCloseTo(24 * 60);
  });

  it('none for a save that does not say when, a broken time, or a clock gone backwards', () => {
    for (const savedAt of [null, NaN, Infinity, -Infinity, NOW, NOW + 1, NOW + HOUR]) {
      expect(closedFor(savedAt, NOW), String(savedAt)).toEqual({ real: 0, counted: 0, game: 0, open: false });
    }
    expect(closedFor(NOW - HOUR, NaN).game).toBe(0);
  });

  it('open in a background tab: all of it at full speed, with no limit (0.0.21); nothing for a broken time', () => {
    expect(openFor(600)).toEqual({ real: 600, counted: 600, game: 600, open: true });
    expect(AWAY.openMax).toBe(Infinity);
    expect(openFor(5 * 3600)).toEqual({ real: 5 * 3600, counted: 5 * 3600, game: 5 * 3600, open: true });
    for (const bad of [0, -5, NaN, Infinity]) expect(openFor(bad).game, String(bad)).toBe(0);
  });
});

describe('saves say when they were written (format 8)', () => {
  it('saving records the time; loading gives it back beside the game, not in it', () => {
    const store = memory(), s = working();
    expect(save(store, s.state, NOW)).toBe(true);
    expect(JSON.parse(store.data.get(SAVE_KEY)!)).toMatchObject({ version: SAVE_VERSION, savedAt: NOW });
    const back = load(store, CAMP)!;
    expect(back.savedAt).toBe(NOW);
    expect(back.state).toEqual(s.state);
    expect('savedAt' in back.state).toBe(false);
    expect(load(memory(), CAMP)).toBeNull();
    // the artifact viewer's hand-over of a running game doesn't say, so it never counts as away
    expect(readSave(serialize(s.state), CAMP).savedAt).toBeNull();
  });

  it('Start over erases the save, so the next load begins a new game', () => {
    const store = memory(), s = working();
    save(store, s.state, NOW);
    expect(load(store, CAMP)).not.toBeNull();
    expect(clearSave(store)).toBe(true);
    expect(load(store, CAMP)).toBeNull();
  });

  it('a version 7 save (0.0.19) loads with no time, so nothing is caught up on its first load; the next save says', () => {
    const s = working();
    const v7 = JSON.stringify({ ...JSON.parse(serialize(s.state)), version: 7 });
    const loaded = readSave(v7, CAMP);
    expect(SAVE_VERSION).toBe(11);
    expect(loaded.state.version).toBe(SAVE_VERSION);
    expect(loaded.savedAt).toBeNull();
    expect(loaded.state).toEqual(s.state);
    const { away, summary } = catchUpAway(loaded.state, loaded.savedAt, NOW, s.ctx);
    expect(away.game).toBe(0);
    expect(didSomething(summary)).toBe(false);
    expect(loaded.state).toEqual(s.state);
    const store = memory();
    save(store, loaded.state, NOW);
    expect(load(store, CAMP)!.savedAt).toBe(NOW);
  });

  it('a damaged time is none', () => {
    const raw = serialize(working().state);
    for (const bad of ['"yesterday"', '-5', '0', 'true', '{}', '[1]', 'null', '1e400']) {
      const damaged = raw.replace(/^\{/, `{"savedAt":${bad},`);
      expect(readSave(damaged, CAMP).savedAt, bad).toBeNull();
      expect('savedAt' in deserialize(damaged, CAMP), bad).toBe(false);
    }
  });
});

describe('opening the game after it was closed', () => {
  it('a save written an hour ago opens with 12 minutes of work done: the logs and XP of 12 minutes of chopping', () => {
    const s = working();
    const r = reopen(s.state, NOW - HOUR);
    expect(r.savedAt).toBe(NOW - HOUR);
    expect(r.away).toMatchObject({ real: 3600, counted: 3600, open: false });
    expect(r.state.time - s.state.time).toBeCloseTo(12 * 60, 3);
    // exactly as if the game had stayed open 12 minutes
    const ref = playedOn(s.state, 12 * 60);
    expect(r.state).toEqual(ref.state);
    expect(r.summary).toEqual(ref.summary);
    // and that is 12 minutes' worth: logs at the birch's rate (trips to the chest included), 10 XP each
    const logs = r.summary.items.birch_logs!, birch = RESOURCES.birch_tree!;
    expect(logs).toBeGreaterThan(12 * 60 / birch.time * 0.55);
    expect(logs).toBeLessThan(12 * 60 / birch.time * 1.3);
    expect(r.state.skills.woodcutting - s.state.skills.woodcutting).toBe(logs * birch.xp);
    expect(r.summary.xp).toEqual({ woodcutting: logs * birch.xp });
    // everything he chopped is in the chest or the backpack, less what went on the fire at nightfall
    expect(r.log.filter(e => e.type === 'banked').length).toBeGreaterThan(0);
    expect(owned(r.state, 'birch_logs') - owned(s.state, 'birch_logs')).toBe(logs - STOKE.logs * r.summary.stoked);
    expect(atBirch(r.state)).toBe(true);
  });

  it('5 hours ago counts only 2 of them: 24 minutes of play, the same as 2 hours ago, the fire stoked once a night', () => {
    const s = working();
    const five = reopen(s.state, NOW - 5 * HOUR), two = reopen(s.state, NOW - 2 * HOUR);
    expect(five.away).toMatchObject({ real: 5 * 3600, counted: 2 * 3600, open: false });
    expect(five.state.time - s.state.time).toBeCloseTo(24 * 60, 3);
    expect(five.state).toEqual(two.state);
    expect(five.summary).toEqual(two.summary);
    // 24 minutes are two days of the camp's clock: two nightfalls, two stokes
    expect(five.summary.stoked).toBe(2);
    expect(five.log.filter(e => e.type === 'stokeOff')).toHaveLength(2);
  });

  it('a clock gone backwards (the save looks written in the future) gets nothing, and nothing is played', () => {
    const s = working();
    for (const savedAt of [NOW + HOUR, NOW + 1]) {
      const r = reopen(s.state, savedAt);
      expect(r.away.game).toBe(0);
      expect(r.state).toEqual(s.state);
      expect(r.log).toEqual([]);
    }
  });

  it('a nightfall while away stokes the fire once, with logs from the chest, and he goes back to chopping', () => {
    const s = working('camp_birch1', 15);
    expect(isNight(s.state.time)).toBe(false);
    const r = reopen(s.state, NOW - 20 * MIN);                 // 4 minutes of play: eight hours of the camp's clock
    expect(r.away.game).toBeCloseTo(4 * 60);
    expect(isNight(r.state.time)).toBe(true);
    expect(r.log.filter(e => e.type === 'stokeOff')).toHaveLength(1);
    expect(r.log.filter(e => e.type === 'stoked')).toEqual([{ type: 'stoked', logs: STOKE.logs }]);
    expect(r.summary.stoked).toBe(1);
    expect(r.state.stokedNight).toBe(nightOf(r.state.time));
    expect(r.state.fireLow).toBe(false);
    expect(r.state.player.stoke).toBeNull();
    expect(atBirch(r.state)).toBe(true);
  });

  it('with no logs at nightfall the fire burned low, and the note says so', () => {
    const s = working('camp_copper1', 15);
    s.state.bank = {};
    const r = reopen(s.state, NOW - 20 * MIN);
    expect(r.summary).toMatchObject({ stoked: 0, fireLow: 1 });
    expect(r.state.fireLow).toBe(true);
    expect(r.summary.items.copper_ore).toBeGreaterThan(0);
    expect(awayText([r.away], r.summary).lines).toContain('One night there were no logs, so the fire burned low.');
  });

  it('what he was making when the game closed gets finished, and the note says so', () => {
    const s = campSet();
    s.state.built = ['campfire', 'shelter']; s.state.goalsDone = s.state.goalsDone.filter(g => g !== 'chest');
    s.state.player.backpack = { birch_logs: 10, copper_ore: 3 };
    send(s, { type: 'make', id: 'chest' });
    run(s, 2);
    expect(s.state.built).not.toContain('chest');
    const r = reopen(s.state, NOW - 10 * MIN);
    expect(r.state.built).toContain('chest');
    expect(r.summary.made).toEqual(['chest']);
    expect(awayText([r.away], r.summary).lines).toContain('He finished the storage chest.');
  });

  it('gathering stones with nowhere to store them, he stops once the backpack is full, and the note says why', () => {
    const s = setup(CAMP);
    s.state.player.backpack = { stone: 25 };
    send(s, { type: 'pickup', id: CAMP.pickups!.find(p => p.kind === 'stone')!.id });
    run(s, 0.5);
    expect(s.state.player.backpack).toEqual({ stone: 25 });       // on his way to the first
    const r = reopen(s.state, NOW - 30 * MIN);
    expect(r.state.player.backpack).toEqual({ stone: 28 });
    expect(r.state.player.task.kind).toBe('idle');
    expect(r.summary).toMatchObject({ items: { stone: 3 }, full: true });
    expect(worthNoting(r.away, r.summary)).toBe(true);
    expect(awayText([r.away], r.summary).lines).toEqual(['He gathered 3 stones.', 'Then his backpack was full, with nowhere to store it.']);
  });

  it('the village works too: he mines, banks at the bank, and never stokes a fire', () => {
    const s = setup(VILLAGE, 4);
    send(s, { type: 'work', nodeId: 'copper1' });
    run(s, 20);
    const r = reopen(s.state, NOW - HOUR, VILLAGE);
    expect(r.state).toEqual(playedOn(s.state, 12 * 60, VILLAGE).state);
    const ore = r.summary.items.copper_ore!, copper = RESOURCES.copper_rock!;
    expect(ore).toBeGreaterThan(12 * 60 / copper.time * 0.6);
    expect(r.summary.xp).toEqual({ mining: ore * copper.xp });
    expect(r.log.some(e => e.type === 'banked')).toBe(true);
    expect(r.state.bank.copper_ore).toBeGreaterThan(0);
    expect(r.summary).toMatchObject({ stoked: 0, fireLow: 0, made: [], full: false });
  });

  it('24 minutes of play catch up in well under a second', () => {
    const s = working();
    const t0 = performance.now();
    const r = reopen(s.state, NOW - 5 * HOUR);
    const ms = performance.now() - t0;
    expect(r.away.game).toBeCloseTo(24 * 60);
    expect(ms).toBeLessThan(1000);                           // about 40 ms on the owner's PC
  });
});

describe('a game left open in a background tab', () => {
  it('catches up at full speed, the same as playing on', () => {
    const s = working();
    const ref = playedOn(s.state, 10 * 60, CAMP, 5);
    const away = openFor(10 * 60);
    const summary = catchUp(s.state, away.game, { ...s.ctx, rng: createRng(5) });
    expect(s.state).toEqual(ref.state);
    expect(summary).toEqual(ref.summary);
    expect(worthNoting(away, summary)).toBe(true);
    expect(awayText([away], summary).lead).toBe('Away 10 min. The game was still open, so he worked all that time at full speed.');
    expect(awayText([openFor(5 * 3600)], summary).lead).toBe('Away 5 h. The game was still open, so he worked all that time at full speed.');
  });
});

describe('the real time between frames (FrameClock: main.ts reads both clocks at each frame)', () => {
  it('goes by the steady clock while frames come, so changing the wall clock while playing does nothing', () => {
    const clock = new FrameClock(1000, NOW);
    expect(clock.frame(1016, NOW + 16)).toBeCloseTo(0.016);
    expect(clock.frame(1032, NOW + HOUR)).toBeCloseTo(0.016);       // the wall clock set an hour on
    expect(clock.frame(1048, NOW - HOUR)).toBeCloseTo(0.016);       // and two hours back
    expect(clock.playedTo).toBe(NOW - HOUR);                        // a save says what the wall clock says
  });

  it('a phone asleep with the game open: after the page was hidden, the wall clock counts when the steady clock stopped', () => {
    const clock = new FrameClock(0, NOW - 3 * HOUR - 16);
    clock.frame(16, NOW - 3 * HOUR);
    clock.hide();                                                   // the screen goes off
    const real = clock.frame(2016, NOW);                            // 3 hours on, of which the steady clock ran 2 seconds
    expect(real).toBe(3 * 3600);
    const away = openFor(real);
    expect(away).toEqual({ real: 3 * 3600, counted: 3 * 3600, game: 3 * 3600, open: true });
    expect(awayText([away], emptySummary()).lead).toBe('Away 3 h. The game was still open, so he worked all that time at full speed.');
    expect(clock.playedTo).toBe(NOW);
    expect(clock.frame(2032, NOW + 16)).toBeCloseTo(0.016);         // then the steady clock again
  });

  it('where the steady clock ran on (a background tab, or a PC asleep), the same either way; never a negative time', () => {
    const clock = new FrameClock(0, NOW);
    clock.hide();
    expect(clock.frame(10 * MIN, NOW + 10 * MIN)).toBe(600);
    clock.hide();
    expect(clock.frame(10 * MIN + 5000, NOW - HOUR)).toBe(5);       // the wall clock went back while hidden
    expect(clock.frame(10 * MIN + 4000, NOW - HOUR + 16)).toBe(0);  // a steady clock gone backwards: nothing
    clock.hide();
    expect(clock.frame(NaN, NaN)).toBe(0);                          // broken readings: nothing
  });

  it('a save says the game was played up to the last frame: a hidden page closed later counts its hidden time as closed time', () => {
    const s = working(), store = memory();
    const clock = new FrameClock(0, NOW - 3 * HOUR - 16);
    clock.frame(16, NOW - 3 * HOUR);
    clock.hide();
    save(store, s.state, clock.playedTo);                           // saved on hiding
    save(store, s.state, clock.playedTo);                           // and three hours later the phone closes the page
    const loaded = load(store, CAMP)!;
    expect(loaded.savedAt).toBe(NOW - 3 * HOUR);
    const back = awayOnOpening(loaded, false, NOW, { layout: CAMP, rng: createRng(7), events: new EventBus() })!;
    expect(back.away).toMatchObject({ real: 3 * 3600, counted: AWAY.max, open: false });
    expect(back.away.game).toBeCloseTo(24 * 60);
  });
});

describe('opening the page (awayOnOpening, as main.ts calls it)', () => {
  it('a save read back from this browser: the away time is caught up, and the note tells it', () => {
    const s = working();
    const loaded = readSave(serialize(s.state, NOW - HOUR), CAMP);
    const r = awayOnOpening(loaded, false, NOW, { layout: CAMP, rng: createRng(7), events: new EventBus() })!;
    expect(r.away).toMatchObject({ real: 3600, counted: 3600, open: false });
    expect(loaded.state.time - s.state.time).toBeCloseTo(12 * 60, 3);
    expect(loaded.state).toEqual(playedOn(s.state, 12 * 60).state);
    expect(tellAway(null, r.away, r.summary, false)).toEqual({ spans: [r.away], summary: r.summary });
  });

  it('a running game handed over by the artifact viewer\'s hot swap: none, and nothing is played', () => {
    const s = working();
    const loaded = readSave(serialize(s.state, NOW - HOUR), CAMP);
    expect(awayOnOpening(loaded, true, NOW, s.ctx)).toBeNull();
    expect(loaded.state).toEqual(s.state);
  });

  it('no save (a new game): none', () => {
    const s = setup();
    expect(awayOnOpening(null, false, NOW, s.ctx)).toBeNull();
    expect(s.log).toEqual([]);
  });
});

describe('the "While you were away" note', () => {
  it('lists what he did: what he gathered, the XP and the level reached, and the fire', () => {
    const s = working();
    const r = reopen(s.state, NOW - HOUR);
    const logs = r.summary.items.birch_logs!, level = levelFor(r.state.skills.woodcutting);
    expect(level).toBeGreaterThan(levelFor(s.state.skills.woodcutting));
    expect(r.summary).toEqual({ items: { birch_logs: logs }, xp: { woodcutting: logs * 10 }, levels: { woodcutting: level }, stoked: 1, fireLow: 0, made: [], full: false });
    expect(worthNoting(r.away, r.summary)).toBe(true);
    expect(awayText([r.away], r.summary)).toEqual({
      lead: 'Away 1 h. He worked all that time at a fifth of his speed.',
      lines: [`He gathered ${logs} birch logs.`, `Woodcutting: +${(logs * 10).toLocaleString()} XP, up to level ${level}.`, 'He stoked the fire at nightfall.'],
    });
  });

  it('a catch-up while the note is still up adds to it: the game opened in a background tab and looked at later', () => {
    const s = working();
    const r = reopen(s.state, NOW - 3 * HOUR);
    const first = tellAway(null, r.away, r.summary, false)!;
    expect(first).toEqual({ spans: [r.away], summary: r.summary });
    // the tab sat in the background 5 minutes before anyone looked: that much more at full speed (main.ts tells both)
    const later = openFor(5 * 60), more = catchUp(r.state, later.game, { layout: CAMP, rng: createRng(8), events: new EventBus() });
    expect(more.items.birch_logs).toBeGreaterThan(0);
    const logs = r.summary.items.birch_logs!;
    const told = tellAway(first, later, more, false)!;
    expect(told.spans).toEqual([r.away, later]);
    expect(told.summary.items).toEqual({ birch_logs: logs + more.items.birch_logs! });
    expect(told.summary.xp).toEqual({ woodcutting: r.summary.xp.woodcutting! + more.xp.woodcutting! });
    expect(told.summary.levels).toEqual({ woodcutting: levelFor(r.state.skills.woodcutting) });
    expect(told.summary.stoked).toBe(r.summary.stoked + more.stoked);
    // what the note told before is left as it was
    expect(first).toEqual({ spans: [r.away], summary: r.summary });
    expect(r.summary.items.birch_logs).toBe(logs);
    expect(awayText(told.spans, told.summary).lead)
      .toBe('Away 3 h. He worked for 2 h at a fifth of his speed. Then 5 min more with the game open, and he worked all that time at full speed.');
  });

  it('more catch-ups with the game open join that stretch, so the lead never says more than closed, then open', () => {
    const s = working();
    const r = reopen(s.state, NOW - 3 * HOUR), ctx = { layout: CAMP, rng: createRng(8), events: new EventBus() };
    let told = tellAway(null, r.away, r.summary, false)!;
    for (const minutes of [2, 5, 3]) {
      const away = openFor(minutes * 60);
      told = tellAway(told, away, catchUp(r.state, away.game, ctx), false)!;
    }
    expect(told.spans).toEqual([r.away, { real: 600, counted: 600, game: 600, open: true }]);
    expect(awayText(told.spans, told.summary).lead)
      .toBe('Away 3 h. He worked for 2 h at a fifth of his speed. Then 10 min more with the game open, and he worked all that time at full speed.');
    // with only open stretches, one sentence
    const open = addSpan(addSpan([], openFor(90)), openFor(5 * 3600));
    expect(open).toEqual([{ real: 90 + 5 * 3600, counted: 90 + 5 * 3600, game: 90 + 5 * 3600, open: true }]);
    expect(awayText(open, emptySummary()).lead).toBe('Away 5 h 1 min. The game was still open, so he worked all that time at full speed.');
    // a closed stretch never joins an open one
    expect(addSpan([openFor(90)], closedFor(NOW - HOUR, NOW))).toHaveLength(2);
  });

  it('nothing to tell: under a minute of play, or a brand-new game in its first session (the welcome is theirs)', () => {
    const s = working();
    const away = openFor(10 * 60), summary = catchUp(s.state, away.game, s.ctx);
    expect(worthNoting(away, summary)).toBe(true);
    expect(tellAway(null, away, summary, false)).toEqual({ spans: [away], summary });
    expect(tellAway(null, away, summary, true)).toBeNull();
    const told = tellAway(null, away, summary, false)!;
    const short = openFor(30);
    expect(tellAway(told, short, catchUp(s.state, short.game, s.ctx), false)).toBeNull();
  });

  it('says how much of a long time away counted', () => {
    expect(awayText([closedFor(NOW - 3 * HOUR, NOW)], emptySummary()).lead).toBe('Away 3 h. He worked for 2 h at a fifth of his speed.');
    expect(awayText([closedFor(NOW - 26 * HOUR - 5 * MIN, NOW)], emptySummary()).lead).toBe('Away 26 h 5 min. He worked for 2 h at a fifth of his speed.');
  });

  it('shows only after at least a minute of play in which he did something', () => {
    // closed under 5 minutes is under a minute of play
    const s = working();
    const short = reopen(s.state, NOW - 4 * MIN);
    expect(short.away.game).toBeCloseTo(48);
    expect(didSomething(short.summary)).toBe(true);
    expect(worthNoting(short.away, short.summary)).toBe(false);
    expect(worthNoting(reopen(s.state, NOW - 5 * MIN).away, short.summary)).toBe(true);
    // standing about at a bare camp the whole time: nothing to tell
    const idle = setup(CAMP);
    const r = reopen(idle.state, NOW - 2 * HOUR);
    expect(r.away.game).toBeCloseTo(24 * 60);
    expect(didSomething(r.summary)).toBe(false);
    expect(worthNoting(r.away, r.summary)).toBe(false);
  });

  it('counts each kind of event, and words several of a kind', () => {
    const s = emptySummary();
    const events: GameEvent[] = [
      // picking up sends both (systems/pickups), and his book goes into no backpack
      { type: 'pickedUp', id: 'book', kind: 'book', item: null, count: 1 },
      { type: 'pickedUp', id: 'stone1', kind: 'stone', item: 'stone', count: 1 }, { type: 'itemGained', item: 'stone', count: 1 },
      { type: 'itemGained', item: 'copper_ore', count: 1 }, { type: 'itemGained', item: 'copper_ore', count: 1 },
      { type: 'xpGained', skill: 'mining', amount: 12 }, { type: 'xpGained', skill: 'mining', amount: 12 },
      { type: 'levelUp', skill: 'mining', level: 3 }, { type: 'levelUp', skill: 'mining', level: 4 },
      { type: 'stoked', logs: 3 }, { type: 'stoked', logs: 2 }, { type: 'fireLow' }, { type: 'fireLow' },
      { type: 'strike', nodeId: 'camp_copper1' }, { type: 'banked', items: { copper_ore: 2 } },
    ];
    for (const e of events) tally(s, e);
    expect(s).toEqual({ items: { stone: 1, copper_ore: 2 }, xp: { mining: 24 }, levels: { mining: 4 }, stoked: 2, fireLow: 2, made: [], full: false });
    expect(awayText([openFor(90)], s).lines).toEqual([
      'He gathered 1 stone and 2 copper ore.', 'Mining: +24 XP, up to level 4.',
      'He stoked the fire on 2 nights.', 'On 2 nights there were no logs, so the fire burned low.',
    ]);
  });

  it('words real time plainly', () => {
    expect(duration(60)).toBe('1 min');
    expect(duration(45 * 60 + 59)).toBe('45 min');
    expect(duration(3 * 3600)).toBe('3 h');
    expect(duration(2.5 * 3600)).toBe('2 h 30 min');
    expect(duration(47 * 3600)).toBe('47 h');
    expect(duration(50 * 3600)).toBe('2 days');
    expect(duration(400 * 24 * 3600)).toBe('more than a year');
  });
});

describe('hidden, then closed (0.0.21)', () => {
  it('the time hidden before the game closed counts at full speed and isn’t told; only the time closed is away time', () => {
    const s = working();
    // played up to 3 hours ago, then hidden; the page closed an hour ago
    const loaded = readSave(serialize(s.state, NOW - 3 * HOUR, NOW - HOUR), CAMP);
    expect(loaded.closedAt).toBe(NOW - HOUR);
    const r = catchUpAway(loaded.state, loaded.savedAt, NOW, { ...s.ctx, rng: createRng(5) }, loaded.closedAt);
    expect(r.away).toEqual(closedFor(NOW - HOUR, NOW));
    expect(r.away.game).toBeCloseTo(12 * 60);
    // the same as playing on for the 2 hours hidden and then 12 minutes
    const ref = playedOn(s.state, 2 * 3600 + 12 * 60, CAMP, 5), open = playedOn(s.state, 2 * 3600, CAMP, 5);
    expect(loaded.state).toEqual(ref.state);
    // the note tells only what he did in the 12 minutes after it closed
    const logs = (x: { summary: ReturnType<typeof emptySummary> }) => x.summary.items.birch_logs ?? 0;
    expect(r.summary.items.birch_logs ?? 0).toBe(logs(ref) - logs(open));
    expect(r.summary.items.birch_logs ?? 0).toBeGreaterThan(0);
  });

  it('a save made on closing says when; a closing time before the save time, or without one, is none', () => {
    const st = createState(CAMP, 2);
    expect(readSave(serialize(st, NOW - HOUR, NOW), CAMP).closedAt).toBe(NOW);
    expect(readSave(serialize(st, NOW - HOUR), CAMP).closedAt).toBeNull();
    expect(readSave(serialize(st, NOW, NOW - HOUR), CAMP).closedAt).toBeNull();
    const raw = JSON.parse(serialize(st)); raw.closedAt = NOW;
    expect(readSave(JSON.stringify(raw), CAMP).closedAt).toBeNull();
    const mem = memory();
    save(mem, st, NOW - HOUR, NOW);
    expect(load(mem, CAMP)?.closedAt).toBe(NOW);
    expect(load(mem, CAMP)?.state).toEqual(st);
  });
});
