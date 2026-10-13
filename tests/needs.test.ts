// His needs at the camp (12 and 13 Oct 2026): hunger falls over game time (about a meal a day) from the first goal about
// food on, and food fills it; hungry, he eats food to spare from his backpack, or walks to the chest for some, and goes
// back to what he was doing; never the food the current goal counts, never in the middle of a fight; with nothing to
// eat he works a little slower, never worse. Going to bed is a must every night once the shelter stands: at his bedtime
// (Settings) he leaves what he does (a fight finished first), sleeps 6 hours, gets up well rested and goes back to what
// he was doing, or does what was tapped while he slept. Never to bed while the game is closed. data/needs.ts,
// data/sleep.ts, core/needs.ts, systems/needs.ts, systems/sleep.ts, ui/needs.ts, ui/bedtime.ts.
import { describe, expect, it } from 'vitest';
import { createState, maxHealth, type GameState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS, dayFraction, isNight, nightOf } from '../src/core/clock';
import { deserialize, serialize } from '../src/core/save';
import { bedHours, freshNeeds, hungerFactor, isHungry, nextHour, nothingToEat, wakeHour } from '../src/core/needs';
import { catchUp, catchUpAway, step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, type Layout } from '../src/world/layout';
import { applyCommands, type Command } from '../src/systems/commands';
import { HUNGER } from '../src/data/needs';
import { SLEEP } from '../src/data/sleep';
import { STOKE } from '../src/data/fire';
import { FOOD, isFood } from '../src/data/food';
import { GEAR } from '../src/data/combat';
import { GOALS } from '../src/data/goals';
import { KEEP_FOOD } from '../src/data/hauling';
import { XP_TABLE } from '../src/data/xp';
import { GOBLIN } from '../src/data/goblins';
import { THOUGHTS, THOUGHT } from '../src/data/thoughts';
import { cued } from '../src/core/thoughts';
import { awayText } from '../src/ui/away';
import { NEEDS_TEXT } from '../src/ui/needs';
import { bedtimeText, hourLabel } from '../src/ui/bedtime';
import { MAKES } from '../src/data/making';

const at = (day: number, hour: number) => (day + hour / 24) * DAY_SECONDS;
const hourOf = (time: number) => dayFraction(time) * 24;
/** The first goal about food (one that needs something to eat): he gets hungry only from there on. */
const FOOD_GOAL = GOALS.find(g => Object.keys(g.needs).some(isFood))!.id;
/** A goal after it that counts no food, where the berries he has are his to eat (whichever goals come between). */
const AFTER_FOOD = GOALS.slice(GOALS.findIndex(g => g.id === FOOD_GOAL) + 1).find(g => !Object.keys(g.needs).some(isFood))!.id;
/** The first goal asking for cooked food (the cooked meal). */
const MEAL_GOAL = GOALS.find(g => (g.needs.cooked_fish ?? 0) > 0)!.id;

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

/** A camp at the goal `goal` (every goal before it done, never counting which they are), morning on day 1. */
function campAt(goal: string, { shelter = true, hour = 8 } = {}): Setup {
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
  s.state.time = at(1, hour);
  s.state.player.pos = { x: 1, z: 4 };
  return s;
}

describe('hunger (data)', () => {
  it('about one cooked fish a day: a fish is a meal, berries a little; hungry about 13 minutes after the first goal about food', () => {
    expect(FOOD.cooked_fish!.fills).toBeGreaterThanOrEqual(HUNGER.full - HUNGER.hungry);
    expect(FOOD.cooked_fish!.fills / HUNGER.perDay).toBeCloseTo(1, 1);
    expect(FOOD.berries!.fills).toBeLessThan(FOOD.cooked_fish!.fills / 2);
    expect(HUNGER.slow).toBeCloseTo(0.8, 5);
    // a new game: no food in his story yet, so he stays full (the goal before the first about food, too)
    const s = setup();
    expect(s.state.needs.fullness).toBe(1);
    run(s, 30 * 60);
    expect(s.state.needs.fullness).toBe(1);
    const before = campAt(GOALS[GOALS.findIndex(g => g.id === FOOD_GOAL) - 1]!.id, { shelter: false });
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
  it('with food to spare on him he eats at once, the most filling first, until he is full; food heals him too', () => {
    const s = campAt(AFTER_FOOD);
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
    const t = campAt(AFTER_FOOD);
    t.state.player.backpack = { berries: 6 };
    nearlyHungry(t);
    run(t, 2);
    expect(of(t, 'meal')[0]!.items).toEqual({ berries: 4 });
    expect(t.state.needs.fullness).toBeGreaterThanOrEqual(HUNGER.full);
    expect(NEEDS_TEXT.meal({ berries: 4 })).toBe('He stops for a bite: 4 berries.');
  });

  it('he leaves the food the current goal counts alone: hungry with only that, he stays hungry until there is food to spare', () => {
    // the berries goal: the berries he picked are for the goal
    const b = campAt(FOOD_GOAL);
    b.state.player.backpack = { berries: 6 };
    nearlyHungry(b);
    run(b, 3);
    expect(isHungry(b.state)).toBe(true);
    expect(of(b, 'meal')).toHaveLength(0);
    expect(b.state.player.backpack.berries).toBe(6);
    expect(nothingToEat(b.state)).toBe(true);
    expect(of(b, 'hungry')).toEqual([{ type: 'hungry', keeps: 'berries' }]);
    // the notice says the berries he can see are for the goal, not that there is nothing to eat
    expect(NEEDS_TEXT.hungry(true, 'berries')).toBe("He's hungry, but the berries are for the goal. A few more from the bushes and he can spare some.");
    expect(NEEDS_TEXT.hungry(true, 'cooked_fish')).toBe("He's hungry, but the cooked fish are for the goal. A few more and he can spare some.");
    expect(NEEDS_TEXT.hungry(true)).toBe("He's hungry, and there's nothing to eat. Berries grow on the bushes by the camp.");
    // the cooked meal's goal: the cooked fish he carries and keeps in the chest are for the goal, so no trip either
    const s = campAt(MEAL_GOAL);
    const want = GOALS.find(g => g.id === MEAL_GOAL)!.needs.cooked_fish!;
    s.state.player.backpack = { cooked_fish: want - 2 };
    s.state.bank = { cooked_fish: 1 };
    nearlyHungry(s);
    run(s, 5);
    expect(of(s, 'meal')).toHaveLength(0);
    expect(of(s, 'mealOff')).toHaveLength(0);
    expect(hungerFactor(s.state)).toBe(HUNGER.slow);
    // two more cooked: the goal has all it counts and is done, and what is over is his to eat
    s.state.bank.cooked_fish = 3;
    run(s, 2);
    expect(s.state.goalsDone).toContain(MEAL_GOAL);
    expect(of(s, 'meal')).toHaveLength(1);
    expect(isHungry(s.state)).toBe(false);
  });

  it('none on him but some in the chest: off to the chest, a meal there and a few to take along, then back to work', () => {
    const s = campAt(AFTER_FOOD);
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
    const s = campAt(AFTER_FOOD);
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

  it('never in the middle of a fight, rats included: he eats once the rat is down', () => {
    const s = campAt('rats', { shelter: false });
    s.state.skills.vitality = XP_TABLE[40]!; s.state.health = maxHealth(s.state);   // no eating to heal meanwhile
    s.state.player.backpack = { cooked_fish: 3 };
    send(s, { type: 'fight', target: 'rat1' });
    runUntil(s, () => s.state.player.task.kind === 'fight', 60);
    s.state.needs.fullness = HUNGER.hungry - 0.01;
    run(s, 0.5);
    expect(of(s, 'meal')).toHaveLength(0);
    const target = (s.state.player.task as { target: string }).target;
    runUntil(s, () => of(s, 'beaten').length > 0, 300);
    expect(s.state.rats[target]!.downUntil).not.toBeNull();
    run(s, 0.2);
    expect(of(s, 'meal')).toHaveLength(1);
    expect(s.log.findIndex(e => e.type === 'meal')).toBeGreaterThan(s.log.findIndex(e => e.type === 'beaten'));
  });

  it('mid-fight with the rats and nothing on him: once the rat is down, to the chest for a bite, then back to the rats', () => {
    const s = campAt('rats', { shelter: false });
    s.state.skills.vitality = XP_TABLE[40]!; s.state.health = maxHealth(s.state);
    s.state.bank = { cooked_fish: 8 };
    s.state.player.backpack = { cooked_fish: 1 };
    send(s, { type: 'fight', target: 'rat1' });
    runUntil(s, () => s.state.player.task.kind === 'fight', 60);
    s.state.player.backpack = {};
    nearlyHungry(s, 0.5);
    runUntil(s, () => of(s, 'mealOff').length > 0, 300);
    expect(of(s, 'mealOff')).toHaveLength(1);
    expect(of(s, 'beaten').length).toBeGreaterThan(0);
    expect(s.state.needs.meal?.back).toMatchObject({ fight: expect.stringMatching(/^rat/) });
    runUntil(s, () => of(s, 'meal').length > 0, 60);
    runUntil(s, () => s.state.player.task.kind === 'fight', 60);
    expect(s.state.player.task.kind).toBe('fight');
  });

  it('fighting the goblins he finishes first: no trip for a meal in the middle of that', () => {
    const s = campAt('goblins');
    s.state.bank = { cooked_fish: 8 };
    send(s, { type: 'fight', target: 'goblin1' });
    s.state.player.backpack = {};
    nearlyHungry(s, 0.5);
    run(s, 4);
    expect(of(s, 'mealOff')).toHaveLength(0);
    expect(s.state.player.pending?.kind === 'fight' || s.state.player.task.kind === 'fight').toBe(true);
  });

  it('a meal trip waits while he walks somewhere; once there, he goes', () => {
    const s = campAt(AFTER_FOOD);
    s.state.bank = { cooked_fish: 4 };
    s.state.needs.fullness = HUNGER.hungry - 0.05;
    send(s, { type: 'walk', to: { x: -3, z: 0 } });
    run(s, 0.5);
    expect(of(s, 'mealOff')).toHaveLength(0);
    expect(s.state.player.task.kind).toBe('walk');
    runUntil(s, () => of(s, 'mealOff').length > 0, 30);
    expect(of(s, 'mealOff')).toHaveLength(1);
  });

  it('asleep, he sleeps on hungry and eats once he is up', () => {
    const s = campAt(AFTER_FOOD);
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
    expect(of(s, 'awake')).toHaveLength(1);
  });

  it('with nothing to eat anywhere: he says so once, works a little slower, and comes to no harm', () => {
    const s = campAt(AFTER_FOOD);
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
    // picking berries (his to eat now), he eats them as they come, and is himself again
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

  it('eating from the backpack fills him (and he may eat at full health while hungry)', () => {
    const s = campAt(AFTER_FOOD);
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

  it('the hungry thought holds only with nothing to eat: not while there is food to spare, carried or in the chest', () => {
    const s = campAt(AFTER_FOOD);
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
    const s = campAt(AFTER_FOOD);
    s.state.bank = {};
    s.state.time = at(1, 23);
    s.state.stokedNight = nightOf(s.state.time);
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

  it('not in the village: no hunger there, and no bed', () => {
    const s = setup(VILLAGE);
    s.state.time = at(1, 0.9);
    run(s, 30 * 60);
    expect(s.state.needs.fullness).toBe(1);
    expect(of(s, 'bedtime')).toHaveLength(0);
  });
});

describe('bedtime', () => {
  it('his hours in bed and when he gets up, for each bedtime he can pick (22:00 to 01:00: up between 04:00 and 07:00)', () => {
    expect(SLEEP.bedtimes).toEqual([22, 23, 0, 1]);
    expect(SLEEP.bedtime).toBe(1);
    expect(SLEEP.bedtimes.map(wakeHour)).toEqual([4, 5, 6, 7]);
    expect(bedHours(at(1, 23.5), 22)).toBe(true);
    expect(bedHours(at(1, 3.9), 22)).toBe(true);
    expect(bedHours(at(1, 4), 22)).toBe(false);
    expect(bedHours(at(1, 21.9), 22)).toBe(false);
    expect(bedHours(at(1, 0.5), 1)).toBe(false);
    expect(bedHours(at(1, 6.5), 1)).toBe(true);
    expect(hourLabel(0)).toBe('00:00');
    expect(bedtimeText(22)).toBe('Once his shelter stands, he sleeps there every night from 22:00 until 04:00.');
    // a waking hour reached by sums never shows a minute early
    for (const bedtime of SLEEP.bedtimes) {
      const up = nextHour(at(3, 21.5), wakeHour(bedtime));
      expect(NEEDS_TEXT.whenAwake(up)).toBe(`He'll see to it when he wakes at ${hourLabel(wakeHour(bedtime))}.`);
    }
  });

  it('at each bedtime he leaves his work for bed, sleeps until 6 hours later, and is back at it well rested', () => {
    for (const bedtime of SLEEP.bedtimes) {
      const s = campAt(AFTER_FOOD, { hour: 19.5 });
      s.state.woodpile = 10;
      s.state.needs.bedtime = bedtime;
      send(s, { type: 'work', nodeId: 'camp_copper1' });
      runUntil(s, () => of(s, 'bedtime').length > 0, DAY_SECONDS);
      expect(of(s, 'stoked'), `${bedtime}`).toHaveLength(1);              // the fire stoked at nightfall, before bed
      expect(hourOf(s.state.time), `${bedtime}`).toBeCloseTo(bedtime, 1);
      const back = s.state.needs.bed!.back as { nodeId: string };
      expect(CAMP.nodes.find(n => n.id === back.nodeId)?.resource, `${bedtime}`).toBe('copper_rock');
      runUntil(s, () => s.state.player.task.kind === 'sleep', 60);
      runUntil(s, () => of(s, 'awake').length > 0, DAY_SECONDS);
      expect(hourOf(s.state.time), `${bedtime}`).toBeCloseTo(wakeHour(bedtime), 2);
      expect(hourOf(s.state.restedUntil), `${bedtime}`).toBeCloseTo(STOKE.at * 24, 3);
      run(s, 0.5);
      expect(workingOn(s.state, 'copper_rock'), `${bedtime}`).toBe(true);
      expect(of(s, 'bedtime'), `${bedtime}`).toHaveLength(1);
      // the bed's notice says when
      expect(of(s, 'fellAsleep')[0]!.until).toBeCloseTo(at(Math.floor(s.state.time / DAY_SECONDS), wakeHour(bedtime)), 1);
    }
  });

  it('the bedtime command takes only the hours he can go to bed at', () => {
    const s = campAt(AFTER_FOOD);
    send(s, { type: 'bedtime', hour: 22 });
    expect(s.state.needs.bedtime).toBe(22);
    send(s, { type: 'bedtime', hour: 21 });
    send(s, { type: 'bedtime', hour: 2 });
    send(s, { type: 'bedtime', hour: 22.5 });
    expect(s.state.needs.bedtime).toBe(22);
  });

  it('mid-haul: he goes to bed with his backpack full, and hauls it once he is up', () => {
    const s = campAt(AFTER_FOOD, { hour: 0.5 });
    s.state.needs.bedtime = 1;
    s.state.player.backpack = { copper_ore: 27 };
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    runUntil(s, () => !!s.state.player.trip, 120);
    expect(s.state.player.trip).not.toBeNull();
    runUntil(s, () => of(s, 'bedtime').length > 0, 120);
    expect(s.state.player.trip).toBeNull();
    expect(s.state.needs.bed!.back).toEqual({ nodeId: 'camp_copper1' });
    runUntil(s, () => of(s, 'awake').length > 0, DAY_SECONDS);
    runUntil(s, () => of(s, 'banked').length > 0, 120);
    runUntil(s, () => s.state.player.task.kind === 'gather', 120);
    expect(workingOn(s.state, 'copper_rock')).toBe(true);
  });

  it('mid-cook: he leaves the fire for bed, nothing lost, and cooks on once he is up', () => {
    const s = campAt(MEAL_GOAL, { hour: 0.9 });
    s.state.player.backpack = { raw_fish: 6 };
    s.state.player.pos = { x: 0, z: 2 };
    send(s, { type: 'cook' });
    runUntil(s, () => s.state.player.task.kind === 'cook', 60);
    runUntil(s, () => of(s, 'bedtime').length > 0, 120);
    const fish = (s.state.player.backpack.raw_fish ?? 0) + (s.state.player.backpack.cooked_fish ?? 0) + (s.state.player.backpack.burnt_fish ?? 0);
    expect(fish).toBe(6);
    expect(s.state.player.cook).toBeNull();
    expect(s.state.needs.bed!.back).toEqual({ cook: true });
    runUntil(s, () => of(s, 'awake').length > 0, DAY_SECONDS);
    runUntil(s, () => s.state.player.task.kind === 'cook', 60);
    expect(s.state.player.task.kind).toBe('cook');
  });

  it('mid-build: he leaves what he builds for bed, and goes back to it once he is up', () => {
    // (the camp build: the woodshed, the firewood pile's upgrade, in place of the log bench there was)
    const s = campAt(AFTER_FOOD, { hour: 0.5 });
    s.state.bank = { birch_logs: 30, bark: 6 };
    s.state.player.pos = { x: 3, z: -1 };
    send(s, { type: 'build', id: 'woodshed' });
    runUntil(s, () => (s.state.underway.woodshed ?? 0) > 3, 60);
    expect(s.state.player.task.kind).toBe('raise');
    s.state.time = at(1, 1) - 1;                                         // a moment before his bedtime
    runUntil(s, () => of(s, 'bedtime').length > 0, 120);
    const worked = s.state.underway.woodshed!;
    expect(worked).toBeGreaterThan(0);
    expect(s.state.needs.bed!.back).toEqual({ raise: 'woodshed' });
    runUntil(s, () => of(s, 'awake').length > 0, DAY_SECONDS);
    expect(s.state.underway.woodshed).toBe(worked);
    runUntil(s, () => s.state.built.includes('woodshed'), MAKES.woodshed.time + 30);
    expect(s.state.built).toContain('woodshed');
  });

  it('mid-fight, a rat or a goblin: the fight is finished first, then bed, then back to them', () => {
    for (const [goal, foe] of [['rats', 'rat1'], ['goblins', 'goblin1']] as const) {
      const s = campAt(goal, { hour: 0.5 });
      s.state.skills.vitality = XP_TABLE[40]!; s.state.health = maxHealth(s.state);
      s.state.player.backpack = { cooked_fish: 10 };
      send(s, { type: 'fight', target: foe });
      runUntil(s, () => s.state.player.task.kind === 'fight', 120);
      s.state.time = at(1, 1);                                           // his bedtime comes as he strikes
      run(s, STEP);
      expect(s.state.player.task.kind, goal).toBe('fight');
      const target = (s.state.player.task as { target: string }).target;
      const foeState = () => s.state.rats[target] ?? s.state.goblins[target]!;
      expect(foeState().downUntil, goal).toBeNull();
      runUntil(s, () => of(s, 'bedtime').length > 0, 300);
      expect(of(s, 'bedtime'), goal).toHaveLength(1);
      expect(of(s, 'beaten').length, goal).toBeGreaterThan(0);
      expect(s.log.findIndex(e => e.type === 'bedtime'), goal).toBeGreaterThan(s.log.findIndex(e => e.type === 'beaten'));
      expect(s.state.needs.bed!.back, goal).toMatchObject({ fight: expect.any(String) });
      runUntil(s, () => of(s, 'awake').length > 0, DAY_SECONDS);
      runUntil(s, () => s.state.player.task.kind === 'fight' || s.state.player.pending?.kind === 'fight', 60);
      expect(s.state.player.task.kind === 'fight' || s.state.player.pending?.kind === 'fight', goal).toBe(true);
    }
  });

  it('at the goblin camp, bedtime waits for the race under way: won (the chief beaten), or lost (knocked out), then bed', () => {
    /** Striking goblin2 at his bedtime (01:00) with goblin1 beaten a moment ago, at `level` in his fighting skills. */
    const race = (level: number, food: number) => {
      const s = campAt('goblins', { hour: 0.5 });
      for (const k of ['attack', 'strength', 'defence', 'vitality'] as const) s.state.skills[k] = XP_TABLE[level]!;
      s.state.health = maxHealth(s.state);
      s.state.player.backpack = food ? { cooked_fish: food } : {};
      send(s, { type: 'fight', target: 'goblin2' });
      runUntil(s, () => s.state.player.task.kind === 'fight', 120);
      s.state.time = at(1, 1);
      Object.assign(s.state.goblins.goblin1!, { health: 0, downUntil: s.state.time + GOBLIN.back - 5, to: null, swing: null });
      return s;
    };
    const won = race(40, 10);
    runUntil(won, () => of(won, 'bedtime').length > 0, DAY_SECONDS / 4);
    expect(of(won, 'campCleared')).toHaveLength(1);
    expect(of(won, 'bedtime')).toHaveLength(1);
    expect(won.log.findIndex(e => e.type === 'bedtime')).toBeGreaterThan(won.log.findIndex(e => e.type === 'campCleared'));
    expect(of(won, 'goblinBack')).toHaveLength(0);
    // too weak to win it, and nothing to eat: knocked out, he wakes at the camp and goes to bed from there
    const lost = race(1, 0);
    lost.state.health = 1;
    runUntil(lost, () => of(lost, 'bedtime').length > 0, DAY_SECONDS / 4);
    expect(of(lost, 'knockedOut')).toHaveLength(1);
    expect(of(lost, 'bedtime')).toHaveLength(1);
    expect(lost.log.findIndex(e => e.type === 'bedtime')).toBeGreaterThan(lost.log.findIndex(e => e.type === 'wokeUp'));
    // between goblins (the one he beat down, none struck): he goes on with the race, but not past a race's length after
    // his bedtime (one he can't win nor lose would go on all night)
    for (const [since, bed] of [[30, 0], [GOBLIN.back + 1, 1]] as const) {
      const s = race(40, 10);
      s.state.time = at(1, 1) + since;
      Object.assign(s.state.goblins.goblin2!, { health: 0, downUntil: s.state.time + GOBLIN.back, to: null, swing: null });
      run(s, 2 * STEP);
      expect(of(s, 'bedtime'), `${since} s after bedtime`).toHaveLength(bed);
    }
  });

  it('a Build start tapped while he sleeps is kept (in a save too), and he sets about it when he wakes', () => {
    // (the camp build: the woodshed in place of the log bench there was; nothing is placed, so a kept build is its id)
    const s = campAt(AFTER_FOOD, { hour: 0.99 });
    s.state.bank = { birch_logs: 30, bark: 6 };
    runUntil(s, () => s.state.player.task.kind === 'sleep', 120);
    send(s, { type: 'build', id: 'woodshed' });
    expect(of(s, 'whenAwake')).toHaveLength(1);
    expect(s.state.needs.later).toEqual({ type: 'build', id: 'woodshed' });
    expect(s.state.underway.woodshed).toBeUndefined();
    // a save keeps it
    const loaded = deserialize(serialize(s.state), CAMP);
    expect(loaded.needs.later).toEqual({ type: 'build', id: 'woodshed' });
    const edit = (later: unknown) => { const r = JSON.parse(serialize(s.state)); r.needs.later = later; return deserialize(JSON.stringify(r), CAMP).needs.later; };
    // one kept by an older game, with where it was placed: its id only
    expect(edit({ type: 'build', id: 'woodshed', at: { x: -1, z: -2.5 }, turn: 2 })).toEqual({ type: 'build', id: 'woodshed' });
    expect(edit({ type: 'build', id: 'nope' })).toBeNull();
    expect(edit({ type: 'build', id: 7 })).toBeNull();
    // he wakes, and sets about it from the save
    const t = { ...s, state: loaded, log: [] as GameEvent[] };
    t.events.on(e => t.log.push(e));
    runUntil(t, () => of(t, 'awake').length > 0, DAY_SECONDS);
    expect(hourOf(loaded.time)).toBeCloseTo(wakeHour(SLEEP.bedtime), 2);
    expect(loaded.underway.woodshed).toBeDefined();
    runUntil(t, () => loaded.player.task.kind === 'raise', 60);
    expect(loaded.player.task.kind).toBe('raise');
  });

  it('a tap or a goal tap on his way to bed, or asleep: he sees to it when he wakes, the last one tapped', () => {
    const s = campAt(AFTER_FOOD, { hour: 0.99 });
    s.state.needs.bedtime = 1;
    runUntil(s, () => of(s, 'bedtime').length > 0, 60);
    send(s, { type: 'work', nodeId: 'camp_birch1' });
    expect(s.state.player.pending).toEqual({ kind: 'visit', id: 'shelter' });
    expect(of(s, 'whenAwake')).toEqual([{ type: 'whenAwake', at: s.state.needs.bed!.until! }]);
    expect(NEEDS_TEXT.whenAwake(s.state.needs.bed!.until!)).toBe("He'll see to it when he wakes at 07:00.");
    runUntil(s, () => s.state.player.task.kind === 'sleep', 60);
    send(s, { type: 'next' });
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    expect(s.state.needs.later).toEqual({ type: 'work', nodeId: 'camp_copper1' });
    // a save keeps it
    expect(deserialize(serialize(s.state), CAMP).needs.later).toEqual({ type: 'work', nodeId: 'camp_copper1' });
    runUntil(s, () => of(s, 'awake').length > 0, DAY_SECONDS);
    expect(s.state.player.pending).toEqual({ kind: 'node', id: 'camp_copper1' });
  });

  it('before the shelter stands nothing changes: he works on through the night', () => {
    const s = campAt('dummy', { shelter: false, hour: 19.5 });
    s.state.woodpile = 10;
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    runUntil(s, () => s.state.time > at(2, 3), DAY_SECONDS);
    expect(of(s, 'bedtime')).toHaveLength(0);
    expect(workingOn(s.state, 'copper_rock')).toBe(true);
  });

  it('kept from bed until shortly before his waking hour, he doesn\'t go that night', () => {
    const s = campAt(AFTER_FOOD, { hour: 6.2 });
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    run(s, 30);
    expect(of(s, 'bedtime')).toHaveLength(0);
    // in the small hours, kept from it till then (a fight, the shelter just built), he still goes
    const t = campAt(AFTER_FOOD, { hour: 4 });
    run(t, 1);
    expect(of(t, 'bedtime')).toHaveLength(1);
  });

  it('while the game is closed he doesn\'t go to bed; left open (a hidden tab), he does', () => {
    const closed = campAt(AFTER_FOOD, { hour: 18 });
    closed.state.woodpile = 20; closed.state.bank = { cooked_fish: 10 };
    send(closed, { type: 'work', nodeId: 'camp_copper1' });
    run(closed, 2);
    const now = 1_800_000_000_000;
    const r = catchUpAway(closed.state, now - 2 * 3600 * 1000, now, closed.ctx);
    expect(r.away.game).toBeGreaterThan(DAY_SECONDS);                   // more than a whole night went by
    expect(of(closed, 'bedtime')).toHaveLength(0);
    expect(r.summary.nights ?? 0).toBe(0);
    expect(of(closed, 'stoked').length).toBeGreaterThan(0);             // the fire is still seen to
    const open = campAt(AFTER_FOOD, { hour: 18 });
    open.state.woodpile = 20;
    send(open, { type: 'work', nodeId: 'camp_copper1' });
    catchUp(open.state, DAY_SECONDS, open.ctx);
    expect(of(open, 'bedtime')).toHaveLength(1);
    expect(of(open, 'awake')).toHaveLength(1);
  });

  it('a save made asleep keeps him asleep until his waking hour; a broken one falls back', () => {
    const s = campAt(AFTER_FOOD, { hour: 0.99 });
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    runUntil(s, () => of(s, 'bedtime').length > 0, 60);
    expect(deserialize(serialize(s.state), CAMP)).toEqual(s.state);
    runUntil(s, () => s.state.player.task.kind === 'sleep', 60);
    expect(deserialize(serialize(s.state), CAMP)).toEqual(s.state);
    const loaded = deserialize(serialize(s.state), CAMP);
    const t = { ...s, state: loaded, log: [] as GameEvent[] };
    t.events.on(e => t.log.push(e));
    runUntil(t, () => loaded.player.task.kind !== 'sleep', DAY_SECONDS);
    expect(hourOf(loaded.time)).toBeCloseTo(wakeHour(SLEEP.bedtime), 2);
    const edit = (needs: unknown) => { const r = JSON.parse(serialize(s.state)); r.needs = needs; return deserialize(JSON.stringify(r), CAMP).needs; };
    const broken = edit({ fullness: 'x', bedtime: 3, slept: 1e9, later: { type: 'work', nodeId: 'nope' }, bed: { back: { nodeId: 'nope' }, until: 'soon' }, retryAt: Infinity });
    expect(broken).toMatchObject({ fullness: 1, meal: null, bedtime: SLEEP.bedtime, later: null, retryAt: 0 });
    expect(broken.bed!.back).toBeNull();
    expect(hourOf(broken.bed!.until!)).toBeCloseTo(wakeHour(SLEEP.bedtime), 3);       // asleep: until his waking hour
    expect(edit({ fullness: -3 }).fullness).toBe(0);
    expect(edit({ fullness: 7 }).fullness).toBe(1);
    expect(edit({ bedtime: 23 }).bedtime).toBe(23);
    expect(edit({ meal: { back: null } }).meal).toBeNull();                          // not on his way to the chest
    // by day, no bed; a save from before needs (0.0.22 to 0.0.27) is full, to bed at the usual hour
    const r = JSON.parse(serialize(s.state)); r.time = at(2, 10); r.player.task = { kind: 'idle' };
    expect(deserialize(JSON.stringify(r), CAMP).needs.bed).toBeNull();
    delete r.needs;
    expect(deserialize(JSON.stringify(r), CAMP).needs).toEqual(freshNeeds());
  });

  it('a save made on his way to the chest for a meal carries on', () => {
    const s = campAt(AFTER_FOOD);
    s.state.bank = { cooked_fish: 9 };
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    runUntil(s, () => s.state.player.task.kind === 'gather', 60);
    nearlyHungry(s, 0.5);
    runUntil(s, () => of(s, 'mealOff').length > 0, 5);
    const loaded = deserialize(serialize(s.state), CAMP);
    expect(loaded).toEqual(s.state);
    expect(loaded.needs.meal).toEqual({ back: { nodeId: 'camp_copper1' } });
  });
});

describe('away', () => {
  it('a catch-up eats as playing does, and the note mentions meals (and nights, left open)', () => {
    const s = campAt(AFTER_FOOD);
    s.state.woodpile = 20; s.state.bank = { cooked_fish: 10, birch_logs: 10 };
    s.state.needs.fullness = 0.5;
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    run(s, 2);
    const now = 1_800_000_000_000;
    const r = catchUpAway(s.state, now - 2 * 3600 * 1000, now, s.ctx);
    expect(r.summary.meals).toBeGreaterThanOrEqual(1);
    const lines = awayText([r.away], r.summary).lines;
    expect(lines.some(l => /^He ate (a meal|\d+ meals)\.$/.test(l))).toBe(true);
    expect(awayText([r.away], { ...r.summary, meals: 1, nights: 2 }).lines).toEqual(expect.arrayContaining(['He ate a meal.', 'He slept 2 nights in the shelter.']));
    expect(isNight(at(1, 2))).toBe(true);
  });
});
