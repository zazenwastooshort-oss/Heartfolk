// The Build window, the camp's overview (the camp build's stage 5; In 5; the owner, 13 Oct 2026: "The build section was a
// great suggestion, and thats where we can see if we have anything to upgreade anything to build etc, give a good
// overview and pressing it make the charachter walk to the building to start upgrading"): what it lists in each state
// of a game, in its sections (T5.1), when its button shows (T5.2), what pressing a row does (T5.3), what each row
// needs as have / need with how many are kept for the goal, how long it takes and how far along it is, its button and
// why it can't be pressed (ui/build.ts), the goal card's button beside it (T5.7), and what it says with nothing in it
// (T5.8).
import { describe, expect, it } from 'vitest';
import { createState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS } from '../src/core/clock';
import { buildOpen, buildRows } from '../src/core/building';
import { step } from '../src/sim';
import { applyCommands, type Command } from '../src/systems/commands';
import { CAMP } from '../src/world/camp';
import { VILLAGE } from '../src/world/layout';
import { buildEmpty, buildSections, needLines, percentDone, progressLine, rowButton, rowCommand, workTime } from '../src/ui/build';
import { noteOf } from '../src/ui/campmenu';
import { goalCard } from '../src/ui/hud';
import { MAKES, type MakeId } from '../src/data/making';
import { GOALS } from '../src/data/goals';

function setup(seed = 11) {
  const state = createState(CAMP, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, ctx: { layout: CAMP, rng: createRng(seed), events } };
}
type Setup = ReturnType<typeof setup>;
const send = (s: Setup, c: Command) => applyCommands(s.state, CAMP, [c], s.events);

/** A camp at goal `goal` (every goal before it done; null: all of them) with `built` standing, by day. */
function camp(built: MakeId[], goal: string | null = null, underway: Partial<Record<MakeId, number>> = {}): Setup {
  const s = setup(), i = goal === null ? GOALS.length : GOALS.findIndex(g => g.id === goal);
  s.state.goalsDone = GOALS.slice(0, i).map(g => g.id);
  s.state.built = [...built]; s.state.underway = { ...underway };
  // his tools as the goals done made them (a tool he owns finishes its goal)
  const done = (g: string) => s.state.goalsDone.includes(g);
  s.state.tools = { axe: done('stone_axe'), pick: done('stone_pickaxe'), rod: done('rod') };
  s.state.time = DAY_SECONDS * (1 + 10 / 24);
  s.state.player.pos = { x: 3, z: -1 };
  return s;
}
const BASE: MakeId[] = ['campfire', 'woodpile', 'shelter', 'chest', 'dummy'];
const ids = (s: Setup) => buildRows(s.state, CAMP).map(r => r.id);
const sections = (s: Setup) => buildSections(buildRows(s.state, CAMP)).map(x => [x.title, x.rows.map(r => r.id)]);
const row = (s: Setup, id: MakeId) => buildRows(s.state, CAMP).find(r => r.id === id)!;

describe('what the Build window lists (T5.1)', () => {
  it('in each state of a game: nothing at first, the goal\'s thing as it comes up, the upgrades once the chest stands, anything begun first', () => {
    expect(ids(camp([], 'salvage'))).toEqual([]);
    expect(sections(camp([], 'campfire'))).toEqual([['To build', ['campfire']]]);
    expect(ids(camp(['campfire'], 'stone_axe'))).toEqual([]);                                 // a tool, made where he stands
    expect(sections(camp(['campfire', 'woodpile'], 'shelter'))).toEqual([['To build', ['shelter']]]);
    expect(sections(camp(['campfire', 'woodpile', 'shelter'], 'chest'))).toEqual([['To build', ['chest']]]);
    // chapter 1 done: the upgrades of what stands, and the dummy as its goal comes up
    expect(sections(camp(['campfire', 'woodpile', 'shelter', 'chest'], 'dummy'))).toEqual([['To build', ['dummy']], ['Upgrades', ['wall_tent', 'stone_hearth', 'woodshed']]]);
    expect(sections(camp(BASE))).toEqual([['Upgrades', ['wall_tent', 'stone_hearth', 'woodshed']]]);
    // the wall tent begun: first, under way; the cabin waits for it to stand
    expect(sections(camp(BASE, null, { wall_tent: 30 }))).toEqual([['Under way', ['wall_tent']], ['Upgrades', ['stone_hearth', 'woodshed']]]);
    expect(sections(camp([...BASE, 'wall_tent']))).toEqual([['Upgrades', ['log_cabin', 'stone_hearth', 'woodshed']]]);
  });

  it('each row: have / need, what is short, how many the goal keeps, how long it takes; begun, its stage and how far along', () => {
    // the dummy's goal keeps its own logs: the woodshed has only what is spare, and says how many the goal keeps
    const s = camp(['campfire', 'woodpile', 'shelter', 'chest'], 'dummy');
    s.state.bank = { birch_logs: 12, branch: 4, bark: 6 };
    expect(needLines(s.state, row(s, 'woodshed'))).toEqual([
      { id: 'birch_logs', have: 6, need: 10, short: true, kept: 4 },
      { id: 'bark', have: 6, need: 6, short: false, kept: 0 },
    ]);
    expect(row(s, 'woodshed').missing).toEqual({ birch_logs: 4 });
    // the goal's own thing counts all of it (T2.7)
    expect(needLines(s.state, row(s, 'dummy'))).toEqual([
      { id: 'birch_logs', have: 6, need: 6, short: false, kept: 0 },
      { id: 'branch', have: 4, need: 4, short: false, kept: 0 },
    ]);
    expect(workTime(MAKES.woodshed.time)).toBe('a minute and a half');
    // begun: no needs any more, how far along
    const b = camp(BASE, null, { log_cabin: MAKES.log_cabin.time * 0.5 });
    b.state.built.push('wall_tent');
    expect(row(b, 'log_cabin')).toMatchObject({ begun: true, progress: 0.5, stage: 1, missing: {} });
  });

  it("each row's button: Build (the firewood pile's too, not Stack), Upgrade, Carry on; and why it can't be pressed now", () => {
    const s = camp(['campfire'], 'firewood');
    expect(rowButton(s.state, row(s, 'woodpile'))).toEqual({ label: 'Build', ready: false, why: 'Still needs 10 birch logs.' });
    s.state.player.backpack = { birch_logs: 10 };
    expect(rowButton(s.state, row(s, 'woodpile'))).toEqual({ label: 'Build', ready: true, why: null });
    const c = camp(BASE);
    c.state.bank = { stone: 12, clay: 4, birch_logs: 12, fibre: 8 };
    expect(rowButton(c.state, row(c, 'stone_hearth'))).toEqual({ label: 'Upgrade', ready: true, why: null });
    send(c, rowCommand(row(c, 'wall_tent')));
    expect(rowButton(c.state, row(c, 'wall_tent'))).toEqual({ label: 'Carry on', ready: true, why: null });
    expect(rowButton(c.state, row(c, 'stone_hearth'))).toEqual({ label: 'Upgrade', ready: false, why: 'Finish the wall tent first.' });
    c.state.player.task = { kind: 'raise', id: 'wall_tent' }; c.state.player.pending = null;
    expect(rowButton(c.state, row(c, 'wall_tent'))).toEqual({ label: 'Carry on', ready: false, why: "He's at it now." });
    c.state.player.task = { kind: 'knockedOut', wakeAt: c.state.time + 5, by: 'rat1' };
    expect(rowButton(c.state, row(c, 'wall_tent'))).toEqual({ label: 'Carry on', ready: false, why: "He's knocked out." });
  });
});

describe('the Build button (T5.2)', () => {
  it('shows from the campfire goal on, never before the wreck is salvaged, never in the village', () => {
    expect(buildOpen(camp([], 'salvage').state, CAMP)).toBe(false);
    expect(buildOpen(camp([], 'campfire').state, CAMP)).toBe(true);
    expect(buildOpen(camp(['campfire'], 'stone_axe').state, CAMP)).toBe(true);           // nothing in it, but it stays
    const v = createState(VILLAGE, 1);
    expect(buildOpen(v, VILLAGE)).toBe(false);
    expect(buildRows(v, VILLAGE)).toEqual([]);
  });
});

describe('pressing a row (T5.3)', () => {
  it('begins it there and then (what it needs taken) and he walks to it; short of something, nothing is taken and he says what', () => {
    const s = camp(BASE);
    s.state.bank = { stone: 12, clay: 3 };
    send(s, rowCommand(row(s, 'stone_hearth')));
    // (pressing it discovers the stone hearth: Discovery)
    expect(s.log.filter(e => e.type !== 'discovered')).toEqual([{ type: 'missing', make: 'stone_hearth', items: { clay: 1 } }]);
    expect(s.state.bank).toEqual({ stone: 12, clay: 3 });
    expect(s.state.underway).toEqual({});
    s.state.bank.clay = 4;
    send(s, rowCommand(row(s, 'stone_hearth')));
    expect(s.state.underway).toEqual({ stone_hearth: 0 });
    expect(s.state.bank).toEqual({});
    expect(s.state.player.pending).toEqual({ kind: 'raise', id: 'stone_hearth' });
    for (let t = 0; t < 30 && s.state.player.task.kind !== 'raise'; t += STEP) step(s.state, STEP, s.ctx);
    expect(s.state.player.task).toEqual({ kind: 'raise', id: 'stone_hearth' });
  });

  it('the chest with no shelter standing (a hand-edited save) says the shelter comes first, and takes nothing', () => {
    const s = camp(['campfire', 'woodpile'], 'chest');
    s.state.bank = { ...MAKES.chest.needs };
    send(s, { type: 'build', id: 'chest' });
    expect(s.log.filter(e => e.type !== 'discovered')).toEqual([{ type: 'cantBuild', make: 'chest', reason: 'noShelter' }]);
    expect(s.state.bank).toEqual(MAKES.chest.needs);
    expect(s.state.underway).toEqual({});
  });
});

describe('the goal card beside it (T5.7)', () => {
  it("its button builds the goal's thing as the Build window's row does, and says Carry on once begun", () => {
    const s = camp([], 'campfire');
    s.state.player.backpack = { ...MAKES.campfire.needs };
    expect(goalCard(s.state).build).toEqual({ id: 'campfire', label: 'Build the campfire', send: 'build' });
    expect(rowCommand(row(s, 'campfire'))).toEqual({ type: 'build', id: 'campfire' });
    send(s, { type: 'build', id: 'campfire' });
    s.state.player.pending = null; s.state.player.path = []; s.state.player.task = { kind: 'idle' };
    expect(goalCard(s.state).build).toEqual({ id: 'campfire', label: 'Carry on with the campfire', send: 'build' });
    expect(rowButton(s.state, row(s, 'campfire')).label).toBe('Carry on');
  });
});

describe('how far along, as the menu says it', () => {
  it('in whole percent rounded down, so it never says 100% while it is still going up; the same as the camp menu says', () => {
    for (const [worked, words] of [[MAKES.wall_tent.time * 0.995, 'Half built: 99% done'], [MAKES.wall_tent.time * 0.039, 'Footings: 3% done'], [0, 'Footings: 0% done']] as const) {
      const s = camp(BASE, null, { wall_tent: worked });
      expect(progressLine(row(s, 'wall_tent'))).toBe(words);
      expect(noteOf(s.state, { kind: 'build', id: 'wall_tent', how: 'carry' })).toBe(words.replace(':', ','));
    }
    expect(percentDone(0.999)).toBe(99);
    expect(percentDone(1)).toBe(100);
  });
});

describe('with nothing in it (T5.8)', () => {
  it('says what comes next, or that everything at the camp is built', () => {
    expect(buildEmpty(camp(['campfire'], 'stone_axe').state, CAMP)).toBe('Nothing to build right now. Next: Firewood.');
    expect(buildEmpty(camp(['campfire', 'woodpile', 'shelter'], 'stone_pickaxe').state, CAMP)).toBe('Nothing to build right now. Next: A storage chest.');
    expect(buildEmpty(camp(['campfire', 'woodpile', 'shelter'], 'copper').state, CAMP)).toBe('Nothing to build right now. Next: A storage chest.');
    const all = camp([...BASE, 'wall_tent', 'log_cabin', 'stone_hearth', 'woodshed']);
    expect(buildEmpty(all.state, CAMP)).toBe('Everything at the camp is built.');
    expect(buildEmpty(camp([], 'campfire').state, CAMP)).toBeNull();                 // it lists the campfire
  });
});
