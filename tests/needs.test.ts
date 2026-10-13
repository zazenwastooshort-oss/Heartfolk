// His needs (the idle core, 12 Oct 2026): hunger falls over game time (about a meal a day) and food fills it; hungry, he
// eats from his backpack, or walks to the chest for food, and goes back to what he was doing; with nothing to eat he
// works a little slower, never worse. At night, once the fire has been seen to and with the shelter standing, he goes
// to bed by himself and gets up at dawn well rested, then back to what he was doing; not if the player sent him
// somewhere since nightfall (then once he is idle). data/needs.ts, core/needs.ts, systems/needs.ts, ui/needs.ts.
import { describe, expect, it } from 'vitest';
import { createState, maxHealth, type GameState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS, isNight, nightOf } from '../src/core/clock';
import { deserialize, serialize } from '../src/core/save';
import { hungerFactor, isHungry } from '../src/core/needs';
import { catchUpAway, step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, type Layout } from '../src/world/layout';
import { applyCommands, type Command } from '../src/systems/commands';
import { HUNGER } from '../src/data/needs';
import { FOOD, isFood } from '../src/data/food';
import { GEAR } from '../src/data/combat';
import { GOALS } from '../src/data/goals';
import { KEEP_FOOD } from '../src/data/hauling';
import { THOUGHTS, THOUGHT } from '../src/data/thoughts';
import { cued } from '../src/core/thoughts';
import type { JobId } from '../src/data/jobs';
import { awayText } from '../src/ui/away';
import { NEEDS_TEXT } from '../src/ui/needs';

const at = (day: number, hour: number) => (day + hour / 24) * DAY_SECONDS;
/** The first goal about food (one that needs something to eat): he gets hungry only from there on. */
const FOOD_GOAL = GOALS.find(g => Object.keys(g.needs).some(isFood))!.id;

function setup(layout: Layout = CAMP, seed = 5) {
  const state = createState(layout, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, layout, ctx: { layout, rng: createRng(seed), events } };
}
type Setup = ReturnType<typeof setup>;
const send = (s: Setup, c: Command) => applyCommands(s.state, s.layout, [c], s.events);
const runUntil = (s: Setup, done: () => boolean, max: number) => { let t = 0; for (; t < max && !done(); t += STEP) step(s.state, STEP, s.ctx); return t; };
const run = (s: Setup, seconds: number) => runUntil(s, () => false, seconds);
const of = <T extends GameEvent['type']>(s: Setup, type: T) => s.log.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const workingOn = (state: GameState, resource: string) => {
  const p = state.player, id = p.task.kind === 'gather' ? p.task.nodeId : p.pending?.kind === 'node' ? p.pending.id : null;
  return !!id && CAMP.nodes.find(n => n.id === id)?.resource === resource;
};
/** Just short of hungry: he gets hungry `in` seconds of play from now. */
const nearlyHungry = (s: Setup, inSeconds = 1) => { s.state.needs.fullness = HUNGER.hungry + HUNGER.perDay / DAY_SECONDS * inSeconds; };

/** A camp at the goal `goal`, as in tests/jobs.test.ts; morning on day 1. */
function campAt(goal: string, { shelter = true } = {}): Setup {
  const s = setup(CAMP), before = GOALS.slice(0, GOALS.findIndex(g => g.id === goal));
  s.state.goalsDone = before.map(g => g.id);
  for (const g of before) {
    const make = g.makes;
    if (!make) continue;
    if (['campfire', 'woodpile', 'shelter', 'chest', 'dummy'].includes(make)) { if (make !== 'shelter' || shelter) s.state.built.push(make as GameState['built'][number]); }
    else if (make === 'stone_axe') s.state.tools.axe = true;
    else if (make === 'stone_pickaxe') s.state.tools.pick = true;
    else if (make === 'rod') s.state.tools.rod = true;
    else if (make in GEAR) s.state.equipment[GEAR[make as keyof typeof GEAR].slot] = make as keyof typeof GEAR;
  }
  s.state.hasBook = true;
  s.state.time = at(1, 8);
  s.state.player.pos = { x: 1, z: 4 };
  return s;
}

describe('hunger (data)', () => {
  it('about one cooked fish a day: a fish is a meal, berries a little; hungry about 13 minutes after the first goal about food', () => {
    expect(FOOD.cooked_fish!.fills).toBeGreaterThanOrEqual(HUNGER.full - HUNGER.hungry);
    expect(FOOD.cooked_fish!.fills / HUNGER.perDay).toBeCloseTo(1, 1);
    expect(FOOD.berries!.fills).toBeLessThan(FOOD.cooked_fish!.fills / 2);
    expect(HUNGER.slow).toBeGreaterThan(0.5);
    expect(HUNGER.slow).toBeLessThan(1);
    // a new game: no food in his story yet, so he stays full (the goal before the first about food, too)
    const s = setup();
    expect(s.state.needs.fullness).toBe(1);
    run(s, 30 * 60);
    expect(s.state.needs.fullness).toBe(1);
    const before = campAt(GOALS[GOALS.findIndex(g => g.id === FOOD_GOAL) - 1]!.id);
    run(before, 30 * 60);
    expect(before.state.needs.fullness).toBe(1);
    // from the first goal about food on (an old save past it too), he gets hungry about 13 minutes of play later
    const f = campAt(FOOD_GOAL, { shelter: false });
    f.state.bank = {};
    const took = runUntil(f, () => isHungry(f.state), 30 * 60);
    expect(took / 60).toBeGreaterThan(11);
    expect(took / 60).toBeLessThan(15);
  });
});

describe('hungry', () => {
  it('with food on him he eats at once, the most filling first, until he is full; food heals him too', () => {
    const s = campAt(FOOD_GOAL);
    s.state.player.backpack = { berries: 6, cooked_fish: 2 };
    s.state.health = 5;
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    nearlyHungry(s);
    run(s, 2);
    expect(of(s, 'meal')).toEqual([{ type: 'meal', items: { cooked_fish: 1 }, fullness: expect.closeTo(HUNGER.hungry + FOOD.cooked_fish!.fills, 2) }]);
    expect(s.state.player.backpack).toEqual({ berries: 6, cooked_fish: 1 });
    expect(s.state.health).toBe(5 + FOOD.cooked_fish!.heals);
    expect(workingOn(s.state, 'copper_rock')).toBe(true);
    // with only berries, he eats a few of them
    const t = campAt(FOOD_GOAL);
    t.state.player.backpack = { berries: 6 };
    nearlyHungry(t);
    run(t, 2);
    expect(of(t, 'meal')[0]!.items).toEqual({ berries: 4 });
    expect(t.state.needs.fullness).toBeGreaterThanOrEqual(HUNGER.full);
    expect(NEEDS_TEXT.meal({ berries: 4 })).toBe('He stops for a bite: 4 berries.');
  });

  it('none on him but some in the chest: off to the chest, a meal there and a few to take along, then back to work', () => {
    const s = campAt(FOOD_GOAL);
    s.state.bank = { cooked_fish: 9 };
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    runUntil(s, () => s.state.player.task.kind === 'gather', 60);
    nearlyHungry(s, 0.5);
    runUntil(s, () => of(s, 'mealOff').length > 0, 5);
    expect(of(s, 'mealOff')).toHaveLength(1);
    expect(s.state.needs.meal).toEqual({ back: { nodeId: 'camp_copper1' } });
    expect(s.state.player.pending).toEqual({ kind: 'visit', id: 'chest' });
    runUntil(s, () => of(s, 'meal').length > 0, 60);
    expect(of(s, 'meal')[0]).toMatchObject({ items: { cooked_fish: 1 }, took: { cooked_fish: KEEP_FOOD } });
    expect(s.state.player.backpack.cooked_fish).toBe(KEEP_FOOD);
    expect(s.state.bank.cooked_fish).toBe(9 - 1 - KEEP_FOOD);
    expect(s.state.needs.meal).toBeNull();
    expect(workingOn(s.state, 'copper_rock')).toBe(true);
    expect(isHungry(s.state)).toBe(false);
  });

  it('mid-trip to the chest with a full backpack: no trip of his own; at the chest, once it is emptied, he eats there', () => {
    const s = campAt(FOOD_GOAL);
    s.state.bank = { cooked_fish: 4 };
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    runUntil(s, () => of(s, 'backpackFull').length > 0, 1500);
    expect(s.state.player.trip).not.toBeNull();
    s.state.needs.fullness = HUNGER.hungry - 0.01;
    run(s, 3);
    expect(of(s, 'mealOff')).toHaveLength(0);
    runUntil(s, () => of(s, 'meal').length > 0, 60);
    expect(of(s, 'banked').length).toBeGreaterThan(0);
    expect(of(s, 'nothingToBank')).toHaveLength(0);
    runUntil(s, () => s.state.player.task.kind === 'gather', 60);
    expect(workingOn(s.state, 'copper_rock')).toBe(true);
  });

  it('mid-fight with the rats and nothing on him: to the chest for a bite, then back to the rats', () => {
    const s = campAt('rats');
    s.state.bank = { cooked_fish: 8 };
    s.state.player.backpack = { cooked_fish: 1 };
    send(s, { type: 'fight', target: 'rat1' });
    runUntil(s, () => s.state.player.task.kind === 'fight', 60);
    s.state.player.backpack = {};
    nearlyHungry(s, 0.5);
    runUntil(s, () => of(s, 'mealOff').length > 0, 5);
    expect(s.state.needs.meal?.back).toMatchObject({ fight: expect.stringMatching(/^rat/) });
    runUntil(s, () => of(s, 'meal').length > 0, 60);
    runUntil(s, () => s.state.player.task.kind === 'fight', 60);
    expect(s.state.player.task.kind).toBe('fight');
  });

  it('fighting the goblins he finishes first: no trip for a meal (or to bed) in the middle of that', () => {
    const s = campAt('goblins');
    s.state.bank = { cooked_fish: 8 };
    send(s, { type: 'fight', target: 'goblin1' });
    s.state.player.backpack = {};
    nearlyHungry(s, 0.5);
    run(s, 4);
    expect(of(s, 'mealOff')).toHaveLength(0);
    expect(s.state.player.pending?.kind === 'fight' || s.state.player.task.kind === 'fight').toBe(true);
  });

  it('asleep, he sleeps on hungry and eats at dawn', () => {
    const s = campAt(FOOD_GOAL);
    s.state.player.backpack = { cooked_fish: 2 };
    s.state.time = at(1, 23);
    s.state.stokedNight = nightOf(s.state.time);
    send(s, { type: 'sleep' });
    runUntil(s, () => s.state.player.task.kind === 'sleep', 60);
    nearlyHungry(s, 5);
    run(s, 60);
    expect(isHungry(s.state)).toBe(true);
    expect(of(s, 'meal')).toHaveLength(0);
    expect(s.state.player.task.kind).toBe('sleep');
    runUntil(s, () => of(s, 'meal').length > 0, DAY_SECONDS);
    expect(isNight(s.state.time)).toBe(false);
    expect(of(s, 'awake')).toHaveLength(1);
  });

  it('with nothing to eat anywhere: he says so once, works a little slower, and comes to no harm', () => {
    const s = campAt(FOOD_GOAL);
    s.state.bank = {};
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    nearlyHungry(s);
    const health = s.state.health;
    run(s, 120);
    expect(of(s, 'hungry')).toHaveLength(1);
    expect(hungerFactor(s.state)).toBe(HUNGER.slow);
    expect(s.state.health).toBe(health);
    expect(workingOn(s.state, 'copper_rock')).toBe(true);
    expect(NEEDS_TEXT.hungry(true)).toBe("He's hungry, and there's nothing to eat. Berries grow on the bushes by the camp.");
    // picking berries, he eats them as they come, and is himself again
    send(s, { type: 'pickup', id: CAMP.pickups!.find(x => x.kind === 'bush')!.id });
    runUntil(s, () => !isHungry(s.state), 120);
    expect(hungerFactor(s.state)).toBe(1);
  });

  it('his gathering really is slower while hungry: a rock yields about HUNGER.slow as often', () => {
    const count = (hungry: boolean) => {
      const s = campAt(FOOD_GOAL, { shelter: false });
      s.state.bank = {};
      send(s, { type: 'work', nodeId: 'camp_copper1' });
      let n = 0;
      s.events.on(e => { if (e.type === 'itemGained') n++; });
      for (let t = 0; t < 2400; t += STEP) {
        s.state.needs.fullness = hungry ? 0 : 1;
        s.state.player.backpack = {};                                   // never full: no trips to time
        step(s.state, STEP, s.ctx);
      }
      return n;
    };
    const fed = count(false), hungry = count(true);
    expect(hungry / fed).toBeGreaterThan(HUNGER.slow - 0.12);
    expect(hungry / fed).toBeLessThan(HUNGER.slow + 0.12);
  });

  it('sent somewhere after he got hungry, the meal waits until he is idle', () => {
    const s = campAt(FOOD_GOAL);
    s.state.bank = { cooked_fish: 4 };
    s.state.needs.fullness = HUNGER.hungry - 0.05;
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    run(s, 5);
    expect(of(s, 'mealOff')).toHaveLength(0);
    expect(workingOn(s.state, 'copper_rock')).toBe(true);
    send(s, { type: 'walk', to: { x: -3, z: 0 } });
    runUntil(s, () => of(s, 'mealOff').length > 0, 30);
    expect(of(s, 'mealOff')).toHaveLength(1);
  });

  it('eating from the backpack fills him (and he may eat at full health while hungry)', () => {
    const s = campAt(FOOD_GOAL);
    s.state.player.backpack = { berries: 2 };
    s.state.needs.fullness = 0.5;
    send(s, { type: 'eat', item: 'berries' });
    expect(of(s, 'cantEat')[0]).toMatchObject({ reason: 'full' });
    s.state.needs.fullness = 0.1;
    s.state.health = maxHealth(s.state);
    send(s, { type: 'eat', item: 'berries' });
    expect(s.state.needs.fullness).toBeCloseTo(0.1 + FOOD.berries!.fills, 5);
  });

  it('a hungry thought, once, when there is nothing to eat', () => {
    const line = THOUGHTS.find(t => 'hungry' in t.cue)!;
    expect(line.text.length).toBeLessThanOrEqual(THOUGHT.maxLength);
    const s = campAt(FOOD_GOAL);
    s.state.bank = {};
    nearlyHungry(s);
    run(s, THOUGHT.quiet + 5);
    expect(s.state.thoughts.journal.some(e => e.id === line.id)).toBe(true);
  });

  it('the hungry thought holds only with nothing to eat: not while there is food in the chest', () => {
    const s = campAt(FOOD_GOAL);
    s.state.needs.fullness = 0.1;
    s.state.bank = { cooked_fish: 3 };
    expect(cued(s.state, CAMP, { hungry: true })).toBe(false);
    s.state.bank = {}; s.state.player.backpack = { berries: 1 };
    expect(cued(s.state, CAMP, { hungry: true })).toBe(false);
    s.state.player.backpack = {};
    expect(cued(s.state, CAMP, { hungry: true })).toBe(true);
    s.state.needs.fullness = 1;
    expect(cued(s.state, CAMP, { hungry: true })).toBe(false);
  });

  it('waking up hungry with nothing to eat, he says so (once)', () => {
    const s = campAt(FOOD_GOAL);
    s.state.bank = {};
    s.state.time = at(1, 23);
    s.state.stokedNight = 1;
    send(s, { type: 'sleep' });
    runUntil(s, () => s.state.player.task.kind === 'sleep', 60);
    s.state.needs.fullness = 0.1;                                       // got hungry in his sleep: no word of it then
    runUntil(s, () => of(s, 'awake').length > 0, DAY_SECONDS);
    run(s, 0.5);
    expect(of(s, 'hungry')).toHaveLength(1);
    expect(s.log.findIndex(e => e.type === 'hungry')).toBeGreaterThan(s.log.findIndex(e => e.type === 'awake'));
    run(s, 30);
    expect(of(s, 'hungry')).toHaveLength(1);
  });

  it('not in the village: no hunger there', () => {
    const s = setup(VILLAGE);
    run(s, 30 * 60);
    expect(s.state.needs.fullness).toBe(1);
  });
});

describe('to bed by himself', () => {
  it('at night, the fire seen to and the shelter standing: bed, the night, up well rested and back to what he was doing', () => {
    const s = campAt('dummy');
    s.state.woodpile = 10;
    s.state.time = at(1, 19.5);
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    runUntil(s, () => of(s, 'bedtime').length > 0, 200);
    expect(of(s, 'stoked')).toHaveLength(1);
    expect(s.state.needs.bed).toEqual({ back: { nodeId: 'camp_copper1' } });
    runUntil(s, () => s.state.player.task.kind === 'sleep', 30);
    runUntil(s, () => of(s, 'awake').length > 0, DAY_SECONDS);
    expect(s.state.restedUntil).toBeGreaterThan(s.state.time);
    run(s, 0.5);
    expect(s.state.needs.bed).toBeNull();
    expect(workingOn(s.state, 'copper_rock')).toBe(true);
  });

  it('sent somewhere since nightfall: not until that is done and he is idle', () => {
    const s = campAt('dummy');
    s.state.woodpile = 10;
    s.state.time = at(1, 19.5);
    runUntil(s, () => of(s, 'stoked').length > 0, 120);
    runUntil(s, () => of(s, 'bedtime').length > 0, 3);
    // (he was doing nothing: straight to bed)
    expect(of(s, 'bedtime')).toHaveLength(1);
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    expect(s.state.needs.bed).toBeNull();
    run(s, 60);
    expect(of(s, 'bedtime')).toHaveLength(1);
    expect(workingOn(s.state, 'copper_rock')).toBe(true);
    send(s, { type: 'walk', to: { x: 0, z: 1 } });
    runUntil(s, () => of(s, 'bedtime').length > 1, 30);
    expect(of(s, 'bedtime')).toHaveLength(2);
  });

  it('without a shelter he works through the night, as before', () => {
    const s = campAt('dummy', { shelter: false });
    s.state.woodpile = 10;
    s.state.time = at(1, 19.5);
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    runUntil(s, () => s.state.time > at(1, 23), DAY_SECONDS);
    expect(of(s, 'bedtime')).toHaveLength(0);
    expect(workingOn(s.state, 'copper_rock')).toBe(true);
  });

  it('a save made on his way to bed or asleep reads back exactly; one that makes no sense drops it', () => {
    const s = campAt('dummy');
    s.state.woodpile = 10;
    s.state.time = at(1, 19.5);
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    runUntil(s, () => of(s, 'bedtime').length > 0, 200);
    expect(deserialize(serialize(s.state), CAMP)).toEqual(s.state);
    runUntil(s, () => s.state.player.task.kind === 'sleep', 30);
    expect(deserialize(serialize(s.state), CAMP)).toEqual(s.state);
    const edit = (needs: unknown) => { const r = JSON.parse(serialize(s.state)); r.needs = needs; return deserialize(JSON.stringify(r), CAMP).needs; };
    expect(edit({ fullness: 'x', sentAt: Infinity, bed: { back: { nodeId: 'nope' } } })).toEqual({ fullness: 1, meal: null, bed: { back: null }, sentAt: -1 });
    expect(edit({ fullness: -3, meal: { back: null } }).fullness).toBe(0);
    expect(edit({ fullness: 7 }).fullness).toBe(1);
    expect(edit({ fullness: 0.4, meal: { back: null } }).meal).toBeNull();       // not on his way to the chest
    expect(edit(null)).toEqual({ fullness: 1, meal: null, bed: null, sentAt: -1 });
    // by day, no bed
    const r = JSON.parse(serialize(s.state)); r.time = at(2, 10);
    expect(deserialize(JSON.stringify(r), CAMP).needs.bed).toBeNull();
  });
});

describe('with a job set', () => {
  // (review, 13 Oct 2026) a meal or bed that waits for what the player sent him to do comes once that's done: his job
  // used to take him back the very step he was idle, so it never came
  it('a tap after he got hungry, food in the chest: once he is there, off for a meal, then back to his job', () => {
    for (const id of ['birch', 'copper', 'practice'] as JobId[]) {
      for (const seed of [5, 11]) {
        const s = campAt(FOOD_GOAL, { shelter: false });
        Object.assign(s.ctx, { rng: createRng(seed) });
        s.state.bank = { cooked_fish: 6 };
        send(s, { type: 'job', job: id });
        runUntil(s, () => !s.state.job!.fetch && s.state.player.task.kind !== 'idle' && !s.state.player.pending, 120);
        s.state.needs.fullness = HUNGER.hungry - 0.01;
        send(s, { type: 'walk', to: { x: -3, z: 0 } });
        expect(s.state.job?.paused, id).toBe(true);
        runUntil(s, () => of(s, 'mealOff').length > 0, 60);
        expect(of(s, 'mealOff'), `${id} ${seed}`).toHaveLength(1);
        expect(of(s, 'jobResumed'), `${id} ${seed}`).toHaveLength(0);       // the meal first
        runUntil(s, () => of(s, 'jobResumed').length > 0, 90);
        expect(of(s, 'meal'), `${id} ${seed}`).toHaveLength(1);
        expect(isHungry(s.state), `${id} ${seed}`).toBe(false);
        expect(s.state.job, `${id} ${seed}`).toMatchObject({ id, paused: false });
      }
    }
  });

  it('a meal that waited is due once he is back at his job (waking hungry, too)', () => {
    const s = campAt(FOOD_GOAL);
    s.state.bank = { cooked_fish: 6 };
    s.state.woodpile = 10;
    s.state.time = at(1, 19.5);
    send(s, { type: 'job', job: 'copper' });
    runUntil(s, () => s.state.player.task.kind === 'sleep', 300);
    expect(s.state.player.task.kind).toBe('sleep');
    s.state.needs.fullness = HUNGER.hungry - 0.01;
    s.state.needs.sentAt = s.state.time;                               // sent somewhere after he got hungry, as it were
    runUntil(s, () => of(s, 'awake').length > 0, DAY_SECONDS);
    runUntil(s, () => of(s, 'meal').length > 0, 60);
    expect(of(s, 'meal')).toHaveLength(1);
    runUntil(s, () => workingOn(s.state, 'copper_rock'), 60);
    expect(s.state.job).toMatchObject({ id: 'copper', paused: false });
  });

  it('a tap at night: to bed once that is done, the night slept, and at dawn back to his job', () => {
    for (const id of ['birch', 'copper', 'practice'] as JobId[]) {
      for (const seed of [5, 11]) {
        const s = campAt('practice');
        Object.assign(s.ctx, { rng: createRng(seed) });
        s.state.woodpile = 10;
        s.state.time = at(1, 19.5);
        send(s, { type: 'job', job: id });
        runUntil(s, () => of(s, 'bedtime').length > 0, 300);
        expect(of(s, 'bedtime'), `${id} ${seed}`).toHaveLength(1);
        send(s, { type: 'walk', to: { x: -3, z: 0 } });
        expect(s.state.needs.bed).toBeNull();
        expect(s.state.job?.paused).toBe(true);
        runUntil(s, () => s.state.player.task.kind === 'sleep', 90);
        expect(of(s, 'bedtime'), `${id} ${seed}`).toHaveLength(2);
        expect(isNight(s.state.time)).toBe(true);
        runUntil(s, () => of(s, 'awake').length > 0, DAY_SECONDS);
        expect(s.state.restedUntil).toBeGreaterThan(s.state.time);
        runUntil(s, () => of(s, 'jobResumed').length > 0, 5);
        expect(s.state.job, `${id} ${seed}`).toMatchObject({ id, paused: false });
      }
    }
  });
});

describe('away', () => {
  it('a catch-up eats and sleeps as playing does, and the note mentions meals and nights', () => {
    const s = campAt(FOOD_GOAL);
    s.state.woodpile = 20; s.state.bank = { cooked_fish: 10, birch_logs: 10 };
    s.state.needs.fullness = 0.5;
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    run(s, 2);
    const now = 1_800_000_000_000;
    const r = catchUpAway(s.state, now - 2 * 3600 * 1000, now, s.ctx);
    expect(r.summary.meals).toBeGreaterThanOrEqual(1);
    expect(r.summary.nights).toBeGreaterThanOrEqual(1);
    const lines = awayText([r.away], r.summary).lines;
    expect(lines.some(l => /^He ate (a meal|\d+ meals)\.$/.test(l))).toBe(true);
    expect(lines.some(l => /^He slept (a night|\d+ nights) in the shelter\.$/.test(l))).toBe(true);
    expect(awayText([r.away], { ...r.summary, meals: 1, nights: 2 }).lines).toEqual(expect.arrayContaining(['He ate a meal.', 'He slept 2 nights in the shelter.']));
  });
});
