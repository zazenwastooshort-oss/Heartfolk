// What can be done at the camp's buildings (the camp build's stage 5; docs/plans/2026-10-13-camp-build-plan.md, In 5,
// In 8; the owner, 13 Oct 2026: "you upgrade by the building tab, and or right clicking the object"). The menu a right
// click or a long press opens on a building (core/camp.ts campActions) and what a plain tap on it does with its words
// under the mouse (campTap, D10, D15), worked out headless: every spot by day and at night, with nothing, a marker, its
// first step begun or built, an upgrade under way or built, the chest built or not, asleep, knocked out (T5.4, T8.5);
// each entry is a command the game takes, and one that can't be chosen says why (ui/campmenu.ts). A marker's tap sends
// what the Build window's row sends (T1.6). The press classifier (ui/gesture.ts, T5.5) and where the menu goes on the
// screen (menuSpot, T5.6). The book's tip about the long press (D18).
import { describe, expect, it } from 'vitest';
import { createState, type GameState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS } from '../src/core/clock';
import { buildRows, stepShown } from '../src/core/building';
import { actionKey, campActions, campTap, hoverOf, tapBoxOf, tapRefused, type CampEntry } from '../src/core/camp';
import { foundNow } from '../src/core/thoughts';
import { step } from '../src/sim';
import { applyCommands, type Command } from '../src/systems/commands';
import { CAMP } from '../src/world/camp';
import { VILLAGE } from '../src/world/layout';
import { commandOf, labelOf, menuKey, menuSpot, noteOf, titleOf, whyText, type Box } from '../src/ui/campmenu';
import { rowCommand } from '../src/ui/build';
import { Gestures, type PointerAt } from '../src/ui/gesture';
import { menuTarget, type Target } from '../src/ui/input';
import { EDGE, GAP } from '../src/ui/windows';
import { LINES, STAGED, type LineId } from '../src/data/building';
import { MAKES, type MakeId } from '../src/data/making';
import { GOALS } from '../src/data/goals';
import { LONG_PRESS, MENU } from '../src/data/input';
import { SURVIVAL } from '../src/data/survival';
import { WOODPILE } from '../src/data/fire';
import { COOK } from '../src/data/cooking';

const LINE_IDS = Object.keys(LINES) as LineId[];
const goalIndex = (makes: MakeId) => GOALS.findIndex(g => g.makes === makes);

function setup(seed = 7) {
  const state = createState(CAMP, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, ctx: { layout: CAMP, rng: createRng(seed), events } };
}
type Setup = ReturnType<typeof setup>;
const send = (s: Setup, c: Command) => applyCommands(s.state, CAMP, [c], s.events);
const run = (s: Setup, seconds: number) => { for (let t = 0; t < seconds; t += STEP) step(s.state, STEP, s.ctx); };

/** A camp at goal `goal` (every goal before it done; all done for null) with `built` standing and `underway` begun, his
 *  tools, by day at `hour`; he stands north of the fire, in the open. */
function camp(built: MakeId[], { goal = null as string | null, underway = {} as Partial<Record<MakeId, number>>, hour = 10, seed = 7 } = {}): Setup {
  const s = setup(seed), i = goal === null ? GOALS.length : GOALS.findIndex(g => g.id === goal);
  s.state.goalsDone = GOALS.slice(0, i).map(g => g.id);
  s.state.built = [...built];
  s.state.underway = { ...underway };
  s.state.tools = { axe: true, pick: true, rod: true };
  s.state.hasBook = true;
  s.state.equipment.weapon = 'stone_club';
  s.state.time = DAY_SECONDS * (1 + hour / 24);
  s.state.player.pos = { x: 3, z: -1 };
  return s;
}
const BASE: MakeId[] = ['campfire', 'woodpile', 'shelter', 'chest', 'dummy'];
const keys = (entries: CampEntry[]) => entries.map(e => actionKey(e.action));
const entryOf = (state: GameState, line: LineId, key: string) => campActions(state, CAMP, line).find(e => actionKey(e.action) === key);

/** The situations every spot is checked in (T5.4): a name, and the state. */
function situations(): [string, Setup][] {
  const out: [string, Setup][] = [];
  for (const hour of [10, 22]) {
    const when = hour === 10 ? 'by day' : 'at night';
    out.push([`a new game ${when}`, camp([], { goal: 'salvage', hour })]);
    for (const id of BASE) {
      const before = BASE.slice(0, BASE.indexOf(id)), goal = GOALS[goalIndex(id)]!.id;
      out.push([`${id}'s marker ${when}`, camp(before, { goal, hour })]);
      out.push([`${id} begun ${when}`, camp(before, { goal, hour, underway: { [id]: MAKES[id].time / 2 } })]);
    }
    out.push([`the camp set up ${when}`, camp(BASE, { hour })]);
    for (const id of ['wall_tent', 'log_cabin', 'stone_hearth', 'woodshed'] as MakeId[]) {
      const prev = STAGED[id]!.upgrades!, before = prev === 'wall_tent' ? [...BASE, 'wall_tent'] as MakeId[] : BASE;
      out.push([`${id} begun ${when}`, camp(before, { hour, underway: { [id]: 10 } })]);
      out.push([`${id} built ${when}`, camp([...before, id], { hour })]);
    }
    const big = camp([...BASE, 'wall_tent', 'log_cabin', 'stone_hearth', 'woodshed'], { hour });
    out.push([`everything at its largest ${when}`, big]);
    const asleep = camp(BASE, { hour, underway: { wall_tent: 30 } }); asleep.state.player.task = { kind: 'sleep' };
    out.push([`asleep, the wall tent begun, ${when}`, asleep]);
    const down = camp(BASE, { hour, underway: { stone_hearth: 30 } }); down.state.player.task = { kind: 'knockedOut', wakeAt: down.state.time + 5, by: 'rat1' };
    out.push([`knocked out ${when}`, down]);
    const poor = camp(BASE, { hour }); poor.state.tools = { axe: true, pick: true, rod: false };
    out.push([`no rod and no fish ${when}`, poor]);
    const full = camp(BASE, { hour }); full.state.player.backpack = { birch_logs: 12, raw_fish: 3, cooked_fish: 2 }; full.state.woodpile = WOODPILE.max;
    out.push([`carrying logs and fish, the pile full, ${when}`, full]);
  }
  return out;
}

describe("the camp's menu (campActions, T5.4)", () => {
  it('at every spot, in every situation: each entry is a command the game takes (Look in opens the chest), each one that cannot be chosen says why, and a tap does one of them', () => {
    for (const [name, s] of situations()) {
      for (const line of LINE_IDS) {
        const entries = campActions(s.state, CAMP, line), tap = campTap(s.state, CAMP, line), box = tapBoxOf(s.state, CAMP, line);
        const where = `${name}, ${line}`;
        // something to do exactly where something shows (its tap area), and a tap does one of the entries
        expect(entries.length > 0, where).toBe(!!box);
        expect(!!tap, where).toBe(!!box);
        if (tap) expect(keys(entries), where).toContain(actionKey(tap.action));
        expect(new Set(keys(entries)).size, where).toBe(entries.length);
        for (const e of entries) {
          const c = commandOf(e.action);
          if (e.action.kind === 'look') expect(c, where).toBeNull(); else expect(c, where).not.toBeNull();
          expect(labelOf(e.action).length, where).toBeGreaterThan(4);
          if (e.why) expect(whyText(e.why), `${where} ${actionKey(e.action)}`).toMatch(/\w.*\.$/);
          // knocked out, everything but looking in the chest waits
          if (s.state.player.task.kind === 'knockedOut') expect(e.why?.kind ?? null, where).toBe(e.action.kind === 'look' ? null : 'down');
        }
        // headed by what is drawn there (the old step until a bigger one is half built round it: review
        // IU-shelter-words-midupgrade), else by its footings or its marker's thing
        expect(titleOf(s.state, CAMP, line), where).toBe(box ? MAKES[stepShown(s.state, line) ?? box.step].name : '');
      }
    }
  });

  it('a new game has nothing anywhere, and the village has no camp menu at all', () => {
    const s = camp([], { goal: 'salvage' });
    for (const line of LINE_IDS) { expect(campActions(s.state, CAMP, line)).toEqual([]); expect(campTap(s.state, CAMP, line)).toBeNull(); }
    const v = createState(VILLAGE, 3);
    v.built = [...BASE];
    for (const line of LINE_IDS) { expect(campActions(v, VILLAGE, line)).toEqual([]); expect(campTap(v, VILLAGE, line)).toBeNull(); }
  });

  it('a marker offers just its thing, Build (or what is still missing); begun, Carry on with it', () => {
    const s = camp([], { goal: 'campfire' });
    expect(campActions(s.state, CAMP, 'hearth')).toEqual([{ action: { kind: 'build', id: 'campfire', how: 'build' }, why: { kind: 'missing', items: MAKES.campfire.needs } }]);
    s.state.player.backpack = { plank: 3, stone: 4 };
    expect(campActions(s.state, CAMP, 'hearth')).toEqual([{ action: { kind: 'build', id: 'campfire', how: 'build' }, why: null }]);
    s.state.underway.campfire = 5;
    expect(campActions(s.state, CAMP, 'hearth')).toEqual([{ action: { kind: 'build', id: 'campfire', how: 'carry' }, why: null }]);
    s.state.player.task = { kind: 'raise', id: 'campfire' };
    expect(campActions(s.state, CAMP, 'hearth')[0]!.why).toEqual({ kind: 'at' });
  });

  it('the shelter by day and at night (T8.5): Look in, Store, Sleep only at night, then its upgrade', () => {
    const day = camp(BASE);
    expect(keys(campActions(day.state, CAMP, 'tent'))).toEqual(['look', 'store', 'sleep:shelter', 'build:wall_tent:upgrade']);
    expect(entryOf(day.state, 'tent', 'sleep:shelter')!.why).toEqual({ kind: 'day' });
    expect(entryOf(day.state, 'tent', 'store')!.why).toEqual({ kind: 'empty' });            // nothing on him to store
    expect(entryOf(day.state, 'tent', 'build:wall_tent:upgrade')!.why).toEqual({ kind: 'missing', items: MAKES.wall_tent.needs });
    day.state.player.backpack = { birch_logs: 3 };
    expect(entryOf(day.state, 'tent', 'store')!.why).toBeNull();
    day.state.player.backpack = { cooked_fish: 3 };                                        // the meals a trip leaves on him anyway
    expect(entryOf(day.state, 'tent', 'store')!.why).toEqual({ kind: 'empty' });
    const night = camp(BASE, { hour: 22 });
    expect(entryOf(night.state, 'tent', 'sleep:shelter')!.why).toBeNull();
    night.state.player.task = { kind: 'sleep' };
    expect(entryOf(night.state, 'tent', 'sleep:shelter')!.why).toEqual({ kind: 'asleep' });
    // before the chest: Sleep, and the chest itself while its goal is up
    const before = camp(['campfire', 'woodpile', 'shelter'], { goal: 'chest' });
    expect(keys(campActions(before.state, CAMP, 'tent'))).toEqual(['sleep:shelter', 'build:chest:build']);
    before.state.underway.chest = 10;
    expect(keys(campActions(before.state, CAMP, 'tent'))).toEqual(['sleep:shelter', 'build:chest:carry']);
    // an upgrade under way: Carry on with it; built, the next upgrade; at the log cabin, none
    const up = camp(BASE, { underway: { wall_tent: 30 } });
    expect(keys(campActions(up.state, CAMP, 'tent'))).toEqual(['look', 'store', 'sleep:shelter', 'build:wall_tent:carry']);
    const wall = camp([...BASE, 'wall_tent']);
    expect(keys(campActions(wall.state, CAMP, 'tent'))).toEqual(['look', 'store', 'sleep:wall_tent', 'build:log_cabin:upgrade']);
    const cabin = camp([...BASE, 'wall_tent', 'log_cabin']);
    expect(keys(campActions(cabin.state, CAMP, 'tent'))).toEqual(['look', 'store', 'sleep:log_cabin']);
  });

  it('the fire, the pile and the dummy: Cook, Stack logs, Practise, then Upgrade or Carry on; one build at a time (D8)', () => {
    const s = camp(BASE);
    expect(keys(campActions(s.state, CAMP, 'hearth'))).toEqual(['cook:campfire', 'build:stone_hearth:upgrade']);
    expect(keys(campActions(s.state, CAMP, 'woodpile'))).toEqual(['stack:woodpile', 'build:woodshed:upgrade']);
    expect(keys(campActions(s.state, CAMP, 'dummy'))).toEqual(['practise']);              // no upgrade for the dummy
    expect(entryOf(s.state, 'hearth', 'cook:campfire')!.why).toEqual({ kind: 'noFish' });
    expect(entryOf(s.state, 'woodpile', 'stack:woodpile')!.why).toEqual({ kind: 'noLogs' });
    s.state.player.backpack = { raw_fish: 2, birch_logs: 4 };
    expect(entryOf(s.state, 'hearth', 'cook:campfire')!.why).toBeNull();
    expect(entryOf(s.state, 'woodpile', 'stack:woodpile')!.why).toBeNull();
    s.state.woodpile = WOODPILE.max;
    expect(entryOf(s.state, 'woodpile', 'stack:woodpile')!.why).toEqual({ kind: 'full' });
    s.state.player.backpack = {}; s.state.bank = { [COOK.raw]: 1 };                       // fish in the chest counts
    expect(entryOf(s.state, 'hearth', 'cook:campfire')!.why).toBeNull();
    // the wall tent under way: the hearth's upgrade waits for it, saying so
    s.state.underway.wall_tent = 20;
    expect(entryOf(s.state, 'hearth', 'build:stone_hearth:upgrade')!.why).toEqual({ kind: 'busy', other: 'wall_tent' });
    expect(whyText({ kind: 'busy', other: 'wall_tent' })).toBe('Finish the wall tent first.');
    // the hearth under way: Carry on with it; built, Cook at it and no more upgrades
    const h = camp(BASE, { underway: { stone_hearth: 30 } });
    expect(keys(campActions(h.state, CAMP, 'hearth'))).toEqual(['cook:campfire', 'build:stone_hearth:carry']);
    const done = camp([...BASE, 'stone_hearth', 'woodshed']);
    expect(keys(campActions(done.state, CAMP, 'hearth'))).toEqual(['cook:stone_hearth']);
    expect(keys(campActions(done.state, CAMP, 'woodpile'))).toEqual(['stack:woodshed']);
  });

  it('asleep, its choices are kept for when he wakes (the build command waits as `later`)', () => {
    const s = camp(BASE, { hour: 23, underway: { woodshed: 20 } });
    s.state.bank = { birch_logs: 3 };                                                     // logs for the fire
    send(s, { type: 'sleep' });
    for (let t = 0; t < 300 && s.state.player.task.kind !== 'sleep'; t += STEP) step(s.state, STEP, s.ctx);
    expect(s.state.player.task).toEqual({ kind: 'sleep' });
    const carry = entryOf(s.state, 'woodpile', 'build:woodshed:carry')!;
    expect(carry.why).toBeNull();
    send(s, commandOf(carry.action)!);
    expect(s.state.needs.later).toEqual({ type: 'build', id: 'woodshed' });
    expect(s.state.player.task).toEqual({ kind: 'sleep' });
  });

  it('each entry that can be chosen does what it says in the game', () => {
    const go = (s: Setup, line: LineId, key: string) => { const e = entryOf(s.state, line, key)!; expect(e.why, key).toBeNull(); send(s, commandOf(e.action)!); };
    // Upgrade: begun at once, what it needs taken, and he walks there
    const up = camp(BASE); up.state.bank = { birch_logs: 20, fibre: 8 };
    go(up, 'tent', 'build:wall_tent:upgrade');
    expect(up.state.underway.wall_tent).toBe(0);
    expect(up.state.bank).toEqual({ birch_logs: 8 });
    expect(up.state.player.pending).toEqual({ kind: 'raise', id: 'wall_tent' });
    // Store: to the chest with everything he carries
    const store = camp(BASE); store.state.player.backpack = { birch_logs: 5, stone: 2 };
    go(store, 'tent', 'store'); run(store, 30);
    expect(store.state.player.backpack).toEqual({});
    expect(store.state.bank).toMatchObject({ birch_logs: 5, stone: 2 });
    // Sleep at night: to bed in the shelter
    const bed = camp(BASE, { hour: 22 });
    go(bed, 'tent', 'sleep:shelter'); run(bed, 30);
    expect(bed.state.player.task.kind).toBe('sleep');
    // Cook: his fish at the fire
    const cook = camp(BASE); cook.state.player.backpack = { raw_fish: 1 };
    go(cook, 'hearth', 'cook:campfire');
    expect(cook.state.player.cook).not.toBeNull();
    // Stack logs: on the pile
    const stack = camp(BASE); stack.state.player.backpack = { birch_logs: 4 };
    go(stack, 'woodpile', 'stack:woodpile'); run(stack, 30);
    expect(stack.state.woodpile).toBe(4);
    // Practise: at the dummy
    const fight = camp(BASE);
    go(fight, 'dummy', 'practise'); run(fight, 20);
    expect(fight.state.player.task).toMatchObject({ kind: 'fight', target: 'dummy' });
    // Carry on: back to the woodshed
    const carry = camp(BASE, { underway: { woodshed: 20 } });
    go(carry, 'woodpile', 'build:woodshed:carry');
    expect(carry.state.player.pending).toEqual({ kind: 'raise', id: 'woodshed' });
  });

  it("the menu's words: entries, notes and reasons in plain words", () => {
    const s = camp(BASE, { underway: { wall_tent: MAKES.wall_tent.time * 0.4 } });
    expect(labelOf({ kind: 'look' })).toBe('Look in the chest');
    expect(labelOf({ kind: 'sleep', shelter: 'wall_tent' })).toBe('Sleep in the wall tent');
    expect(labelOf({ kind: 'sleep', shelter: null })).toBe('Sleep in the shelter');
    expect(labelOf({ kind: 'build', id: 'log_cabin', how: 'upgrade' })).toBe('Upgrade to a log cabin');
    expect(labelOf({ kind: 'build', id: 'wall_tent', how: 'carry' })).toBe('Carry on with the wall tent');
    expect(labelOf({ kind: 'build', id: 'chest', how: 'build' })).toBe('Build the storage chest');
    expect(noteOf(s.state, { kind: 'build', id: 'wall_tent', how: 'carry' })).toBe('Frame, 40% done');
    expect(noteOf(s.state, { kind: 'build', id: 'stone_hearth', how: 'upgrade' })).toBe('a minute and a half: 12 stones and 4 clay');
    expect(whyText({ kind: 'missing', items: { birch_logs: 4, fibre: 8 } })).toBe('Still needs 4 birch logs and 8 fibre.');
    expect(whyText({ kind: 'day' })).toBe("He isn't tired until night falls.");
    expect(whyText({ kind: 'down' })).toBe("He's knocked out.");
  });
});

describe('the menu headed and worded by what is drawn (review IU-shelter-words-midupgrade)', () => {
  it('headed by the tent while the wall tent goes up round it to its frame, then by the wall tent; its Sleep the tent\'s, then the shelter\'s', () => {
    const footings = camp(BASE, { underway: { wall_tent: 9 }, hour: 22 }), half = camp(BASE, { underway: { wall_tent: MAKES.wall_tent.time * 0.7 }, hour: 22 });
    expect(titleOf(footings.state, CAMP, 'tent')).toBe('Tent');
    expect(labelOf(entryOf(footings.state, 'tent', 'sleep:shelter')!.action)).toBe('Sleep in the tent');
    expect(titleOf(half.state, CAMP, 'tent')).toBe('Wall tent');
    expect(entryOf(half.state, 'tent', 'sleep:shelter')).toBeDefined();
    const sleep = campActions(half.state, CAMP, 'tent').find(e => e.action.kind === 'sleep')!;
    expect(labelOf(sleep.action)).toBe('Sleep in the shelter');
    expect(commandOf(sleep.action)).toEqual({ type: 'sleep' });
    expect(titleOf(camp([...BASE, 'wall_tent'], {}).state, CAMP, 'tent')).toBe('Wall tent');
  });
});

describe('a tap that can do nothing now says why, as the menu does, and walks him nowhere (review IU-pile-tap-disagrees)', () => {
  it('the firewood pile or the woodshed with no logs on him, or full; anything else goes ahead', () => {
    for (const built of [BASE, [...BASE, 'woodshed'] as MakeId[]]) {
      const s = camp(built);
      expect(tapRefused(s.state, CAMP, 'woodpile')).toEqual({ kind: 'noLogs' });
      expect(whyText(tapRefused(s.state, CAMP, 'woodpile')!)).toBe('No logs on him to stack.');
      s.state.player.backpack = { birch_logs: 4 };
      expect(tapRefused(s.state, CAMP, 'woodpile')).toBeNull();
      s.state.woodpile = WOODPILE.max;
      expect(tapRefused(s.state, CAMP, 'woodpile')).toEqual({ kind: 'full' });
    }
    // the other spots: the tap's own command says why itself, without walking him (or goes ahead)
    const s = camp(BASE);
    for (const line of ['hearth', 'tent', 'dummy'] as LineId[]) expect(tapRefused(s.state, CAMP, line), line).toBeNull();
    // while the woodshed goes up, a tap carries on with it
    expect(tapRefused(camp(BASE, { underway: { woodshed: 9 } }).state, CAMP, 'woodpile')).toBeNull();
  });
});

describe('the menu by the keyboard (review IU-menu-arrows)', () => {
  it('Up and Left go back, Down and Right go on, round the ends; Home and End; any other key is left to the page', () => {
    expect(menuKey('ArrowDown', -1, 3)).toBe(0); expect(menuKey('ArrowRight', -1, 3)).toBe(0);
    expect(menuKey('ArrowUp', -1, 3)).toBe(2); expect(menuKey('ArrowLeft', -1, 3)).toBe(2);
    expect(menuKey('ArrowRight', 1, 3)).toBe(2); expect(menuKey('ArrowLeft', 1, 3)).toBe(0);
    expect(menuKey('ArrowRight', 2, 3)).toBe(0); expect(menuKey('ArrowLeft', 0, 3)).toBe(2);
    expect(menuKey('Home', 2, 3)).toBe(0); expect(menuKey('End', 0, 3)).toBe(2);
    expect(menuKey('Escape', 0, 3)).toBeUndefined(); expect(menuKey('a', 0, 3)).toBeUndefined();
    expect(menuKey('ArrowLeft', -1, 0)).toBeUndefined();
  });
});

describe('what a plain tap does, and its words under the mouse (campTap, D10, D15)', () => {
  /** The words over `line` in this camp. */
  const hover = (s: Setup, line: LineId) => campTap(s.state, CAMP, line)?.hover ?? null;
  const tapKey = (s: Setup, line: LineId) => { const t = campTap(s.state, CAMP, line); return t ? actionKey(t.action) : null; };

  it('the table of words', () => {
    const rows: [string, Setup, LineId, string | null][] = [
      ['the campfire marker', camp([], { goal: 'campfire' }), 'hearth', 'Build|Campfire'],
      ['nothing yet at the tent', camp([], { goal: 'campfire' }), 'tent', null],
      ['the campfire begun', camp([], { goal: 'campfire', underway: { campfire: 3 } }), 'hearth', 'Carry on|Campfire'],
      ['the firewood pile marker', camp(['campfire'], { goal: 'firewood' }), 'woodpile', 'Stack|Firewood pile'],
      ['the tent by day, before the chest', camp(['campfire', 'woodpile', 'shelter'], { goal: 'stone_pickaxe' }), 'tent', 'Tent'],
      ['the tent at night, before the chest', camp(['campfire', 'woodpile', 'shelter'], { goal: 'stone_pickaxe', hour: 22 }), 'tent', 'Sleep in|Tent'],
      ['the chest marker by day', camp(['campfire', 'woodpile', 'shelter'], { goal: 'chest' }), 'tent', 'Build|Storage chest'],
      ['the chest begun by day', camp(['campfire', 'woodpile', 'shelter'], { goal: 'chest', underway: { chest: 5 } }), 'tent', 'Carry on|Storage chest'],
      ['the chest goal at night', camp(['campfire', 'woodpile', 'shelter'], { goal: 'chest', hour: 22 }), 'tent', 'Sleep in|Tent'],
      ['the chest built, by day', camp(BASE), 'tent', 'Look in|Chest'],
      ['a wall tent under way, by day', camp(BASE, { underway: { wall_tent: 9 } }), 'tent', 'Look in|Chest'],
      ['a wall tent under way, at night', camp(BASE, { underway: { wall_tent: 9 }, hour: 22 }), 'tent', 'Sleep in|Tent'],
      // (review IU-shelter-words-midupgrade) half built, the wall tent is drawn there, not the tent he still sleeps in
      ['a wall tent half built, at night', camp(BASE, { underway: { wall_tent: MAKES.wall_tent.time * 0.7 }, hour: 22 }), 'tent', 'Sleep in|Shelter'],
      ['a log cabin half built, at night', camp([...BASE, 'wall_tent'], { underway: { log_cabin: MAKES.log_cabin.time * 0.7 }, hour: 22 }), 'tent', 'Sleep in|Shelter'],
      ['a log cabin at its frame, at night', camp([...BASE, 'wall_tent'], { underway: { log_cabin: MAKES.log_cabin.time * 0.4 }, hour: 22 }), 'tent', 'Sleep in|Wall tent'],
      ['the wall tent at night', camp([...BASE, 'wall_tent'], { hour: 22 }), 'tent', 'Sleep in|Wall tent'],
      ['the log cabin at night', camp([...BASE, 'wall_tent', 'log_cabin'], { hour: 2 }), 'tent', 'Sleep in|Log cabin'],
      ['the campfire, with a rod', camp(BASE), 'hearth', 'Cook at|Campfire'],
      ['the stone hearth', camp([...BASE, 'stone_hearth']), 'hearth', 'Cook at|Stone hearth'],
      ['the stone hearth under way', camp(BASE, { underway: { stone_hearth: 9 } }), 'hearth', 'Carry on|Stone hearth'],
      ['the firewood pile', camp(BASE), 'woodpile', 'Stack logs on|Firewood pile'],
      ['the woodshed', camp([...BASE, 'woodshed']), 'woodpile', 'Stack logs on|Woodshed'],
      ['the woodshed under way', camp(BASE, { underway: { woodshed: 9 } }), 'woodpile', 'Carry on|Woodshed'],
      ['the training dummy', camp(BASE), 'dummy', 'Practise on|Training dummy'],
    ];
    for (const [name, s, line, words] of rows) expect(hover(s, line), name).toBe(words);
    // a campfire with no rod and no fish: just its name (a tap walks him beside it)
    const poor = camp(BASE); poor.state.tools = { axe: true, pick: true, rod: false };
    expect(hover(poor, 'hearth')).toBe('Campfire');
    poor.state.player.backpack = { raw_fish: 1 };
    expect(hover(poor, 'hearth')).toBe('Cook at|Campfire');
  });

  it('by day the shelter opens the chest once it stands, an upgrade under way too (D10); at night it is bed; the fire and the pile carry on with theirs', () => {
    expect(tapKey(camp(BASE), 'tent')).toBe('look');
    expect(commandOf({ kind: 'look' })).toBeNull();                               // Look in sends nothing: he goes nowhere
    expect(tapKey(camp(BASE, { underway: { log_cabin: 9 } }), 'tent')).toBe('look');
    expect(tapKey(camp(BASE, { hour: 22 }), 'tent')).toBe('sleep:shelter');
    expect(tapKey(camp(BASE, { underway: { woodshed: 9 } }), 'woodpile')).toBe('build:woodshed:carry');
    expect(tapKey(camp(BASE, { underway: { stone_hearth: 9 } }), 'hearth')).toBe('build:stone_hearth:carry');
  });

  it('the tent by day before the chest: "he isn\'t tired yet", naming the tent', () => {
    const s = camp(['campfire', 'woodpile', 'shelter'], { goal: 'stone_pickaxe' });
    const tap = campTap(s.state, CAMP, 'tent')!, pos = { ...s.state.player.pos };
    send(s, commandOf(tap.action)!);
    expect(s.log).toEqual([{ type: 'cantSleep', shelter: 'shelter' }]);
    expect(s.state.player.pos).toEqual(pos);
  });

  it('a marker sends what the Build window row sends (T1.6), for each of the first five at its goal', () => {
    for (const id of BASE) {
      const s = camp(BASE.slice(0, BASE.indexOf(id)), { goal: GOALS[goalIndex(id)]!.id });
      const line = id === 'chest' ? 'tent' : LINE_IDS.find(l => LINES[l][0] === id)!;
      const tap = campTap(s.state, CAMP, line)!, row = buildRows(s.state, CAMP).find(r => r.id === id)!;
      expect(commandOf(tap.action), id).toEqual(rowCommand(row));
      expect(commandOf(tap.action), id).toEqual({ type: 'build', id });
    }
  });

  it('every hover is the words of its action (hoverOf), except the shelter before the chest and the fire before the rod', () => {
    for (const [name, s] of situations()) for (const line of LINE_IDS) {
      const tap = campTap(s.state, CAMP, line);
      if (!tap || !tap.hover.includes('|')) continue;
      expect(tap.hover, `${name}, ${line}`).toBe(hoverOf(CAMP, tap.action));
    }
  });
});

describe('the press classifier (ui/gesture.ts, T5.5)', () => {
  const p = (id: number, kind: PointerAt['kind'], x: number, y: number, t: number, button = 0): PointerAt => ({ id, kind, button, x, y, t });

  it('a long press opens the menu for what the finger went down on, though the camera, following him, has moved it from under the finger since; a right click, for what is under the mouse then (review IU-hold-repick)', () => {
    // what is under the finger's point: the woodshed while the camera is where it was, the grass (or a neighbour) once
    // it has followed him a little way
    const point = { x: 0, y: 0, z: 0 } as unknown as Extract<Target, { point: unknown }>['point'];
    let camera = 0;
    const under = (): Target => camera === 0 ? { kind: 'camp', spot: 'woodpile', point } : camera === 1 ? { kind: 'ground', point } : { kind: 'camp', spot: 'hearth', point };
    const g = new Gestures();
    g.start(p(1, 'touch', 300, 400, 0));
    const held = under();                                           // the ring is drawn over the woodshed
    camera = 1;                                                     // he walks on; the camera follows
    const out = g.tick(LONG_PRESS.ms + 1);
    expect(out).toEqual([{ type: 'menu', x: 300, y: 400, by: 'hold' }]);
    expect(menuTarget('hold', held, under)).toBe('woodpile');
    camera = 2;                                                     // or the fire has slid under the finger
    expect(menuTarget('hold', held, under)).toBe('woodpile');
    // a finger held on the grass opens nothing, whatever slides under it
    expect(menuTarget('hold', { kind: 'ground', point }, under)).toBeNull();
    // a right click: what is under the mouse as it is clicked
    expect(menuTarget('click', held, under)).toBe('hearth');
    camera = 1;
    expect(menuTarget('click', held, under)).toBeNull();
  });

  it('a left click or a finger lifted where it went down is a tap', () => {
    const g = new Gestures();
    expect(g.start(p(1, 'mouse', 100, 100, 0))).toEqual([]);
    expect(g.end(p(1, 'mouse', 102, 101, 120))).toEqual([{ type: 'tap', x: 100, y: 100 }]);
    g.start(p(2, 'touch', 50, 60, 1000));
    expect(g.tick(1200)).toEqual([]);
    expect(g.end(p(2, 'touch', 53, 60, 1250))).toEqual([{ type: 'tap', x: 50, y: 60 }]);
  });

  it('the right button opens the menu and is never a tap; a right drag turns the camera, as before', () => {
    const g = new Gestures();
    g.start(p(1, 'mouse', 200, 150, 0, 2));
    expect(g.end(p(1, 'mouse', 200, 150, 90, 2))).toEqual([{ type: 'menu', x: 200, y: 150, by: 'click' }]);
    g.start(p(1, 'mouse', 200, 150, 500, 2));
    const turns = g.move(p(1, 'mouse', 240, 150, 520, 2));
    expect(turns).toEqual([{ type: 'turn', dx: 40, dy: 0 }]);
    expect(g.end(p(1, 'mouse', 240, 150, 600, 2))).toEqual([]);
    // the middle button only drags
    g.start(p(1, 'mouse', 10, 10, 700, 1));
    expect(g.end(p(1, 'mouse', 10, 10, 760, 1))).toEqual([]);
  });

  it(`a finger held ${LONG_PRESS.ms} ms within ${LONG_PRESS.slop} px opens the menu once, and its release sends nothing`, () => {
    const g = new Gestures();
    g.start(p(1, 'touch', 120, 300, 0));
    expect(g.move(p(1, 'touch', 124, 303, 100))).toEqual([]);                     // a wobble doesn't turn the camera
    expect(g.tick(LONG_PRESS.ms - 1)).toEqual([]);
    expect(g.tick(LONG_PRESS.ms)).toEqual([{ type: 'menu', x: 120, y: 300, by: 'hold' }]);
    expect(g.tick(LONG_PRESS.ms + 400)).toEqual([]);
    // Android's own menu after a long press opens no second one
    expect(g.contextMenu()).toEqual([]);
    expect(g.move(p(1, 'touch', 160, 330, 900))).toEqual([]);                     // the menu is open under the finger: nothing turns
    expect(g.end(p(1, 'touch', 160, 330, 1000))).toEqual([]);
    // a pen the same
    g.start(p(2, 'pen', 10, 10, 2000));
    expect(g.tick(2000 + LONG_PRESS.ms)).toHaveLength(1);
  });

  it('a mouse held down still is never a long press', () => {
    const g = new Gestures();
    g.start(p(1, 'mouse', 10, 10, 0));
    expect(g.tick(5000)).toEqual([]);
    expect(g.cue(5000)).toBeNull();
    expect(g.end(p(1, 'mouse', 10, 10, 5100))).toEqual([{ type: 'tap', x: 10, y: 10 }]);
  });

  it(`moved more than ${LONG_PRESS.slop} px it is a drag: the camera turns, and no tap and no menu follow`, () => {
    const g = new Gestures();
    g.start(p(1, 'touch', 100, 100, 0));
    expect(g.move(p(1, 'touch', 100 + LONG_PRESS.slop + 1, 100, 50))).toEqual([{ type: 'turn', dx: LONG_PRESS.slop + 1, dy: 0 }]);
    expect(g.move(p(1, 'touch', 130, 104, 80))).toEqual([{ type: 'turn', dx: 130 - (100 + LONG_PRESS.slop + 1), dy: 4 }]);
    expect(g.tick(2000)).toEqual([]);
    expect(g.end(p(1, 'touch', 100, 100, 2100))).toEqual([]);                     // even back where it started
  });

  it('two fingers pinch: never a menu or a tap; the one left after turns the camera', () => {
    const g = new Gestures();
    g.start(p(1, 'touch', 100, 100, 0));
    g.start(p(2, 'touch', 200, 100, 30));
    expect(g.move(p(2, 'touch', 210, 100, 40))).toEqual([]);                      // the first measure
    expect(g.move(p(2, 'touch', 220, 100, 50))).toEqual([{ type: 'pinch', scale: 120 / 110 }]);
    expect(g.tick(LONG_PRESS.ms * 3)).toEqual([]);
    expect(g.cue(LONG_PRESS.ms * 3)).toBeNull();
    expect(g.end(p(2, 'touch', 220, 100, 2000))).toEqual([]);
    expect(g.move(p(1, 'touch', 104, 100, 2010))).toEqual([{ type: 'turn', dx: 4, dy: 0 }]);
    expect(g.end(p(1, 'touch', 104, 100, 2050))).toEqual([]);
  });

  it(`the ring fills round a finger held still from ${LONG_PRESS.cue} ms until the menu opens`, () => {
    const g = new Gestures();
    g.start(p(1, 'touch', 40, 50, 1000));
    expect(g.cue(1000 + LONG_PRESS.cue - 1)).toBeNull();
    expect(g.cue(1000 + LONG_PRESS.cue)).toEqual({ x: 40, y: 50, progress: 0 });
    expect(g.cue(1000 + (LONG_PRESS.cue + LONG_PRESS.ms) / 2)!.progress).toBeCloseTo(0.5, 9);
    g.tick(1000 + LONG_PRESS.ms);
    expect(g.cue(1000 + LONG_PRESS.ms)).toBeNull();
  });

  it('a cancelled pointer ends nothing', () => {
    const g = new Gestures();
    g.start(p(1, 'touch', 40, 50, 0));
    expect(g.cancel(p(1, 'touch', 40, 50, 100))).toEqual([]);
    expect(g.tick(LONG_PRESS.ms * 2)).toEqual([]);
    expect(g.down).toBe(0);
  });
});

describe('where the menu goes (menuSpot, T5.6)', () => {
  // the goal card at the top left (its widest, with its Build button) and the row of buttons: along the bottom on a
  // phone held upright, down the right side otherwise (index.html: --edge 16, --rail 72, the top 10 px)
  const SIZES: [number, number][] = [[360, 740], [375, 812], [390, 844], [844, 390], [1280, 800], [1920, 1080]];
  const card = (w: number): Box => ({ left: EDGE, top: 38, right: EDGE + Math.min(340, w - 2 * EDGE), bottom: 38 + 150 });
  const rail = (w: number, h: number): Box => w <= 600 ? { left: EDGE, top: h - 10 - 62, right: w - EDGE, bottom: h - 10 } : { left: w - EDGE - 72, top: 44, right: w - EDGE, bottom: 44 + 5 * 59 + 14 };
  const overlaps = (a: Box, b: Box) => Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
  /** The menu's size: 256 px wide (index.html), its title and up to four entries with a line under each. */
  const MENU_SIZE = { w: 256, h: 34 + 4 * 62 + 12 };

  it('fits inside the screen at every size, clear of the goal card and the buttons, and not under the finger wherever there is room beside it', () => {
    let covered = 0, presses = 0;
    // under the finger: the press nearer the menu than MENU.offset (a fingertip is wider than the point it presses)
    const under = (box: Box, x: number, y: number) => Math.hypot(Math.max(box.left - x, 0, x - box.right), Math.max(box.top - y, 0, y - box.bottom)) < MENU.offset;
    const grown = (b: Box): Box => ({ left: b.left - GAP, top: b.top - GAP, right: b.right + GAP, bottom: b.bottom + GAP });
    const boxAt = (left: number, top: number): Box => ({ left, top, right: left + MENU_SIZE.w, bottom: top + MENU_SIZE.h });
    for (const [w, h] of SIZES) {
      const avoid = [card(w), rail(w, h)];
      for (let x = 4; x < w; x += 37) for (let y = 4; y < h; y += 37) {
        if (avoid.some(b => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom)) continue;   // a press there is on them, not the scene
        const at = menuSpot({ x, y }, MENU_SIZE, { w, h }, avoid), box = boxAt(at.left, at.top);
        const where = `${w}x${h} at ${x},${y}`;
        presses++;
        expect(box.left, where).toBeGreaterThanOrEqual(EDGE);
        expect(box.top, where).toBeGreaterThanOrEqual(EDGE);
        expect(box.right, where).toBeLessThanOrEqual(w - EDGE);
        expect(box.bottom, where).toBeLessThanOrEqual(h - EDGE);
        expect(avoid.some(b => overlaps(box, b)), where).toBe(false);
        if (!under(box, x, y)) continue;
        // over the finger only where nowhere on the screen clear of the card and the buttons (by GAP) would leave it be
        covered++;
        for (let left = EDGE; left + MENU_SIZE.w <= w - EDGE; left += 4) for (let top = EDGE; top + MENU_SIZE.h <= h - EDGE; top += 4) {
          const b = boxAt(left, top);
          expect(!avoid.some(a => overlaps(b, grown(a))) && !under(b, x, y), `${where}: room at ${left},${top}`).toBe(false);
        }
      }
    }
    expect(covered / presses).toBeLessThan(0.1);
  });

  it(`opens beside the press, ${MENU.offset} px to its side and below it, where there is room`, () => {
    expect(menuSpot({ x: 600, y: 400 }, MENU_SIZE, { w: 1280, h: 800 }, [card(1280)])).toEqual({ left: 600 + MENU.offset, top: 400 + MENU.offset });
    // near the right edge: kept on the screen, still below the press
    expect(menuSpot({ x: 1200, y: 300 }, MENU_SIZE, { w: 1280, h: 800 }, [])).toEqual({ left: 1280 - EDGE - MENU_SIZE.w, top: 300 + MENU.offset });
    // near the bottom: still to its right, kept on the screen
    expect(menuSpot({ x: 600, y: 700 }, MENU_SIZE, { w: 1280, h: 800 }, [])).toEqual({ left: 600 + MENU.offset, top: 800 - EDGE - MENU_SIZE.h });
  });
});

describe("the book's tip about the menu (D18)", () => {
  it('comes unstuck once the first upgrade can be built', () => {
    const tip = SURVIVAL.find(p => p.id === 'tip:hold')!;
    expect(tip.text).toMatch(/Hold a finger on a building, or right-click it/);
    expect(foundNow(camp(['campfire', 'woodpile', 'shelter'], { goal: 'chest' }).state, CAMP, tip.found)).toBe(false);
    expect(foundNow(camp(BASE).state, CAMP, tip.found)).toBe(true);
    // in play: the chest built, the page is there
    const s = camp(['campfire', 'woodpile', 'shelter'], { goal: 'chest' });
    s.state.bank = { birch_logs: 10, copper_ore: 3 };
    send(s, { type: 'build', id: 'chest' }); run(s, 120);
    expect(s.state.built).toContain('chest');
    expect(s.state.thoughts.known).toContain('tip:hold');
  });
});
