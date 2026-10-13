// Sleeping in the shelter (12 Oct 2026, the owner): at his bedtime he goes to bed, sleeps 6 hours from when he lies
// down while play goes quicker, and wakes well rested: gathering yields more often until nightfall. Since 0.0.34 only
// his bedtime sends him (the owner, 13 Oct 2026, of a tap on the tent sending him early: "not needed"): the tent's
// Sleep only says when. Going to bed at his bedtime by himself is in tests/needs.test.ts.
import { describe, expect, it } from 'vitest';
import { createState, type GameState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS, dayFraction } from '../src/core/clock';
import { deserialize, serialize } from '../src/core/save';
import { freshNeeds } from '../src/core/needs';
import { campActions, campTap, tapRefused } from '../src/core/camp';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { type Layout } from '../src/world/layout';
import { applyCommands, type Command } from '../src/systems/commands';
import { goToBed, isRested, playSpeed, playTime, restedFactor } from '../src/systems/sleep';
import { SLEEP } from '../src/data/sleep';
import { STOKE } from '../src/data/fire';
import { GOALS } from '../src/data/goals';
import { dialAngle } from '../src/ui/sleep';
import { whyText } from '../src/ui/campmenu';

const at = (day: number, hour: number) => (day + hour / 24) * DAY_SECONDS;
const HOURS6 = SLEEP.hours / 24 * DAY_SECONDS;

function setup(layout: Layout = CAMP, seed = 5) {
  const state = createState(layout, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, layout, ctx: { layout, rng: createRng(seed), events } };
}
type Setup = ReturnType<typeof setup>;
const send = (s: Setup, c: Command) => applyCommands(s.state, s.layout, [c], s.events);
const runUntil = (s: Setup, done: () => boolean, max: number) => { let t = 0; for (; t < max && !done(); t += STEP) step(s.state, STEP, s.ctx); return t; };
const run = (s: Setup, seconds: number) => runUntil(s, () => false, seconds);
const of = (s: Setup, type: GameEvent['type']) => s.log.filter(e => e.type === type);

/** A camp with the shelter, the fire, the pile and the chest built, the chapter 1 goals done, at `hour` on day 1. */
function camp(hour: number, { shelter = true, chest = true } = {}): Setup {
  const s = setup();
  s.state.goalsDone = GOALS.slice(0, GOALS.findIndex(g => g.id === 'chest') + 1).map(g => g.id);
  s.state.built = ['campfire', 'woodpile', ...(shelter ? ['shelter'] : []), ...(chest ? ['chest'] : [])] as GameState['built'];
  s.state.tools = { axe: true, pick: true, rod: false };
  s.state.hasBook = true;
  s.state.time = at(1, hour);
  return s;
}

/** Off to bed, as his bedtime sends him (systems/needs.ts), and asleep once he gets there. */
function toBed(s: Setup): number {
  s.state.stokedNight = Math.floor(s.state.time / DAY_SECONDS - STOKE.at);   // the fire seen to tonight already
  expect(goToBed(s.state, s.layout)).toBe(true);
  runUntil(s, () => s.state.player.task.kind === 'sleep', 60);
  expect(s.state.player.task.kind).toBe('sleep');
  return s.state.time;
}

describe('sleeping in the shelter', () => {
  it('only his bedtime sends him to bed: a tap on the tent, by day or night, says when he sleeps there and walks him nowhere', () => {
    for (const hour of [14, 21, 2]) {
      const s = camp(hour, { chest: false });
      s.state.goalsDone = GOALS.slice(0, GOALS.findIndex(g => g.id === 'shelter') + 1).map(g => g.id);   // the chest's goal not up yet
      const pos = { ...s.state.player.pos };
      s.state.needs.slept = Math.floor(s.state.time / DAY_SECONDS - STOKE.at);  // he has slept tonight (02:00 is in his bed hours)
      expect(campTap(s.state, CAMP, 'tent')!.action.kind).toBe('sleep');
      const why = tapRefused(s.state, CAMP, 'tent');
      expect(why).toEqual({ kind: 'bedtime', hour: SLEEP.bedtime });
      expect(whyText(why!)).toBe('He sleeps here at his bedtime, 01:00.');
      run(s, 1);
      expect(s.state.player.pos).toEqual(pos);
      expect(s.state.needs.bed).toBeNull();
      // its menu has Sleep, faded, saying the same; with the chest in it, a tap opens the chest instead
      expect(campActions(s.state, CAMP, 'tent').find(e => e.action.kind === 'sleep')!.why).toEqual({ kind: 'bedtime', hour: SLEEP.bedtime });
      s.state.built.push('chest');
      expect(campTap(s.state, CAMP, 'tent')!.action.kind).toBe('look');
    }
  });

  it('in bed he sleeps 6 hours from when he lies down, out of sight, then is up well rested until nightfall', () => {
    const s = camp(21);
    const lay = toBed(s), fell = of(s, 'fellAsleep');
    expect(fell).toHaveLength(1);
    expect((fell[0] as { until: number }).until).toBeCloseTo(lay + HOURS6, 3);
    expect(playSpeed(s.state)).toBe(SLEEP.speed);
    expect(isRested(s.state)).toBe(false);
    runUntil(s, () => s.state.player.task.kind !== 'sleep', DAY_SECONDS);
    expect(s.state.time - lay).toBeCloseTo(HOURS6, 0);
    expect(of(s, 'awake')).toHaveLength(1);
    expect(s.state.player.task.kind).toBe('idle');
    expect(isRested(s.state)).toBe(true);
    // rested until nightfall (20:00), whatever the hour he got up
    expect(dayFraction(s.state.restedUntil)).toBeCloseTo(STOKE.at, 5);
    expect(s.state.restedUntil - s.state.time).toBeLessThan(DAY_SECONDS);
    expect(playSpeed(s.state)).toBe(1);
    expect(restedFactor(s.state)).toBe(1 + SLEEP.bonus);
    // up in the small hours, he doesn't go back to bed at his bedtime that night: he has slept
    run(s, 60);
    expect(of(s, 'bedtime')).toHaveLength(0);
    // and the rest wears off by nightfall
    run(s, s.state.restedUntil - s.state.time + 1);
    expect(isRested(s.state)).toBe(false);
  });

  it('only a frame\'s worth of time goes quicker: a long gap (the screen off, the page hidden) counts at real speed', () => {
    const s = camp(23);
    s.state.player.task = { kind: 'sleep' };
    expect(playTime(s.state, 0.016)).toBeCloseTo(0.016 * SLEEP.speed, 6);
    expect(playTime(s.state, 600)).toBeCloseTo(SLEEP.frame * SLEEP.speed + (600 - SLEEP.frame), 6);   // not 12,000
    s.state.player.task = { kind: 'idle' };
    expect(playTime(s.state, 600)).toBeCloseTo(600, 6);
  });

  it('a tap on the goal card or his thought while he sleeps leaves him asleep: he sees to it when he wakes', () => {
    const s = camp(23);
    toBed(s);
    send(s, { type: 'next' });
    expect(s.state.player.task.kind).toBe('sleep');
    const until = s.state.needs.bed!.until;
    expect(of(s, 'whenAwake')).toEqual([{ type: 'whenAwake', at: until }]);
    expect(s.state.needs.later).toEqual({ type: 'next' });
    // a tap in the world leaves him asleep too, and is the one done: the last thing tapped
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    expect(s.state.player.task.kind).toBe('sleep');
    expect(s.state.needs.later).toEqual({ type: 'work', nodeId: 'camp_copper1' });
    runUntil(s, () => s.state.player.task.kind !== 'sleep', DAY_SECONDS);
    expect(s.state.time).toBeCloseTo(until, 1);
    expect(isRested(s.state)).toBe(true);
    expect(s.state.player.pending).toEqual({ kind: 'node', id: 'camp_copper1' });
    expect(s.state.needs.later).toBeNull();
  });

  it('a save from before 0.0.34 on his way to bed sent early by a tap loads with no bed and no walk there: he stays up, and goes at his bedtime', () => {
    const s = camp(21);
    expect(goToBed(s.state, s.layout)).toBe(true);
    run(s, 0.5);
    const raw = JSON.parse(serialize(s.state)) as { needs: { bed: { until: number | null } } };
    raw.needs.bed.until = null;                                       // sent early: set once he lay down
    s.state = deserialize(JSON.stringify(raw), CAMP);
    expect(s.state.needs.bed).toBeNull();
    expect(s.state.player.pending).toBeNull();                       // nor on his way there
    expect(s.state.player.path).toEqual([]);
    runUntil(s, () => s.state.player.pending === null, 60);
    run(s, 5);
    expect(s.state.player.task.kind).not.toBe('sleep');
    runUntil(s, () => s.state.player.task.kind === 'sleep', DAY_SECONDS / 2);
    expect(of(s, 'bedtime')).toHaveLength(1);
    expect(dayFraction(s.state.time) * 24).toBeGreaterThanOrEqual(SLEEP.bedtime);
  });

  it('a save from before 0.0.34 off to stoke the fire, then to bed (a tap on the shelter), loads with nothing to go back to', () => {
    const s = camp(19.9);
    s.state.woodpile = 10;                                            // logs to stoke with
    runUntil(s, () => !!s.state.player.stoke, 30);
    const raw = JSON.parse(serialize(s.state)) as { player: { stoke: { back: unknown } } };
    raw.player.stoke.back = { sleep: true };
    const back = deserialize(JSON.stringify(raw), CAMP);
    expect(back.player.stoke).not.toBeNull();
    expect(back.player.stoke!.back).toBeNull();
  });

  it('well rested, gathering yields more often', () => {
    const chops = (rested: boolean) => {
      const s = camp(8);
      s.state.goalsDone = GOALS.map(g => g.id);                       // no goal stops the chopping at 'enough'
      if (rested) s.state.restedUntil = s.state.time + 10_000;
      send(s, { type: 'work', nodeId: 'camp_birch2' });
      run(s, 400);
      return s.state.skills.woodcutting;
    };
    expect(chops(true)).toBeGreaterThan(chops(false) * 1.1);
  });

  it('saves: asleep carries on until he gets up; a save from the morning finds him up; a broken rest is none', () => {
    const s = camp(22);
    toBed(s);
    const back = deserialize(serialize(s.state), CAMP);
    expect(back.player.task).toEqual({ kind: 'sleep' });
    expect(back.needs.bed).toEqual(s.state.needs.bed);
    const morning = JSON.parse(serialize(s.state)) as GameState;
    morning.time = at(2, 9);
    expect(deserialize(JSON.stringify(morning), CAMP).player.task).toEqual({ kind: 'idle' });
    // asleep in a save from before bedtimes (0.0.26, 0.0.27: no needs saved): he sleeps on until 07:00, as then
    const old = JSON.parse(serialize(s.state)) as Record<string, unknown>;
    delete old.needs; delete old.toolsInChest;
    const loaded = deserialize(JSON.stringify(old), CAMP);
    expect(loaded.player.task).toEqual({ kind: 'sleep' });
    expect(dayFraction(loaded.needs.bed!.until) * 24).toBeCloseTo(7, 3);
    expect(loaded.needs.bed!.until - loaded.time).toBeLessThan(DAY_SECONDS / 2);
    const edit = (rested: unknown) => { const r = JSON.parse(serialize(s.state)); r.restedUntil = rested; return deserialize(JSON.stringify(r), CAMP).restedUntil; };
    expect(edit('soon')).toBe(0);
    expect(edit(-5)).toBe(0);
    expect(dayFraction(edit(s.state.time + 1e9))).toBeCloseTo(STOKE.at, 5);       // never past the next nightfall
    expect(edit(s.state.time + 100)).toBeCloseTo(s.state.time + 100, 3);
    expect(freshNeeds().bedtime).toBe(SLEEP.bedtime);
  });

  it('the dial: noon at the top, midnight at the bottom, turning with the time', () => {
    expect(dialAngle(at(0, 12))).toBeCloseTo(0, 5);
    expect(dialAngle(at(0, 0))).toBeCloseTo(180, 5);
    expect(dialAngle(at(3, 18))).toBeCloseTo(90, 5);
    expect(dialAngle(at(3, 6))).toBeCloseTo(270, 5);
  });
});
