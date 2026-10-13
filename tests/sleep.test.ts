// Sleeping in the shelter (12 Oct 2026, the owner): a tap on the built shelter at night sends him to bed early, he
// sleeps 6 hours (by 07:00 at the latest) while play goes quicker, and wakes well rested: gathering yields more often
// until nightfall. Going to bed at his bedtime by himself is in tests/needs.test.ts.
import { describe, expect, it } from 'vitest';
import { createState, type GameState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS, dayFraction, isNight } from '../src/core/clock';
import { deserialize, serialize } from '../src/core/save';
import { freshNeeds } from '../src/core/needs';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, type Layout } from '../src/world/layout';
import { applyCommands, type Command } from '../src/systems/commands';
import { isRested, playSpeed, playTime, restedFactor } from '../src/systems/sleep';
import { SLEEP } from '../src/data/sleep';
import { STOKE } from '../src/data/fire';
import { GOALS } from '../src/data/goals';
import { SLEEP_TEXT, dialAngle } from '../src/ui/sleep';

const at = (day: number, hour: number) => (day + hour / 24) * DAY_SECONDS;

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
function camp(hour: number, { shelter = true } = {}): Setup {
  const s = setup();
  s.state.goalsDone = GOALS.slice(0, GOALS.findIndex(g => g.id === 'chest') + 1).map(g => g.id);
  s.state.built = shelter ? ['campfire', 'woodpile', 'shelter', 'chest'] : ['campfire', 'woodpile', 'chest'];
  s.state.tools = { axe: true, pick: true, rod: false };
  s.state.hasBook = true;
  s.state.time = at(1, hour);
  return s;
}

describe('sleeping in the shelter', () => {
  it('by day he isn\'t tired yet: a tap on the shelter says so and he stays put', () => {
    const s = camp(14);
    const pos = { ...s.state.player.pos };
    send(s, { type: 'sleep' });
    expect(of(s, 'cantSleep')).toEqual([{ type: 'cantSleep', shelter: 'shelter' }]);
    expect(s.state.player.pending).toBeNull();
    expect(s.state.player.pos).toEqual(pos);
    // (the camp build) the notice names the shelter he would sleep in
    expect(SLEEP_TEXT.cantSleep('tent')).toBe("He isn't tired yet. He can sleep in the tent once night falls.");
  });

  it('at night a tap sends him to bed early: out of sight for 6 hours, then up well rested until nightfall', () => {
    const s = camp(21);
    s.state.stokedNight = Math.floor(s.state.time / DAY_SECONDS - STOKE.at);   // the fire seen to tonight already
    send(s, { type: 'sleep' });
    expect(s.state.player.pending).toEqual({ kind: 'visit', id: 'shelter' });
    runUntil(s, () => s.state.player.task.kind === 'sleep', 60);
    const lay = s.state.time, fell = of(s, 'fellAsleep');
    expect(fell).toHaveLength(1);
    expect((fell[0] as { until: number }).until).toBeCloseTo(lay + SLEEP.hours / 24 * DAY_SECONDS, 3);
    expect(playSpeed(s.state)).toBe(SLEEP.speed);
    expect(isRested(s.state)).toBe(false);
    runUntil(s, () => s.state.player.task.kind !== 'sleep', DAY_SECONDS);
    expect(s.state.time - lay).toBeCloseTo(SLEEP.hours / 24 * DAY_SECONDS, 0);
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

  it('sent to bed early in the small hours, he still gets up by 07:00', () => {
    const s = camp(4);
    s.state.needs.bedtime = 22;
    s.state.needs.slept = Math.floor(s.state.time / DAY_SECONDS - STOKE.at);  // he slept already, and is up at 04:00
    s.state.stokedNight = s.state.needs.slept;
    send(s, { type: 'sleep' });
    runUntil(s, () => s.state.player.task.kind === 'sleep', 60);
    expect(isNight(s.state.time)).toBe(true);
    runUntil(s, () => !isNight(s.state.time), DAY_SECONDS);
    expect(s.state.player.task.kind).toBe('sleep');                  // 05:00: still asleep while the dawn comes
    runUntil(s, () => s.state.player.task.kind !== 'sleep', DAY_SECONDS);
    expect(dayFraction(s.state.time) * 24).toBeCloseTo(SLEEP.latest, 1);
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
    s.state.stokedNight = Math.floor(s.state.time / DAY_SECONDS - STOKE.at);
    send(s, { type: 'sleep' });
    runUntil(s, () => s.state.player.task.kind === 'sleep', 60);
    send(s, { type: 'next' });
    expect(s.state.player.task.kind).toBe('sleep');
    const until = s.state.needs.bed!.until!;
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

  it('on his way to bed sent early, a tap elsewhere changes his mind (only bed at his bedtime is a must)', () => {
    const s = camp(21);
    s.state.stokedNight = Math.floor(s.state.time / DAY_SECONDS - STOKE.at);
    send(s, { type: 'sleep' });
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    expect(s.state.player.pending).toEqual({ kind: 'node', id: 'camp_copper1' });
    expect(of(s, 'whenAwake')).toHaveLength(0);
    run(s, 5);
    expect(s.state.needs.bed).toBeNull();
  });

  it('saved and opened on his way to bed sent early, his needs read back as they were: a tap elsewhere still changes his mind, and he goes to bed at his bedtime (review SAVE-slept-tap-to-bed)', () => {
    const s = camp(21);
    s.state.stokedNight = Math.floor(s.state.time / DAY_SECONDS - STOKE.at);
    send(s, { type: 'sleep' });
    run(s, 0.5);
    expect(s.state.player.pending).toEqual({ kind: 'visit', id: 'shelter' });
    const before = structuredClone(s.state.needs);
    s.state = deserialize(serialize(s.state), CAMP);
    expect(s.state.needs).toEqual(before);
    send(s, { type: 'work', nodeId: 'camp_copper1' });
    runUntil(s, () => of(s, 'bedtime').length > 0, DAY_SECONDS / 2);
    expect(of(s, 'bedtime')).toHaveLength(1);
    runUntil(s, () => s.state.player.task.kind === 'sleep', 120);
    expect(s.state.player.task.kind).toBe('sleep');
  });

  it('off to stoke the fire at nightfall, a tap on the shelter waits: he stokes first, then goes to bed', () => {
    const s = camp(19.9);
    s.state.woodpile = 10;                                            // logs to stoke with
    runUntil(s, () => !!s.state.player.stoke, 30);
    expect(s.state.player.stoke).not.toBeNull();
    send(s, { type: 'sleep' });
    expect(of(s, 'bedLater')).toHaveLength(1);
    expect(s.state.player.stoke!.back).toEqual({ sleep: true });
    runUntil(s, () => of(s, 'stoked').length > 0, 120);
    runUntil(s, () => s.state.player.task.kind === 'sleep', 60);
    expect(s.state.player.task.kind).toBe('sleep');
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

  it('with no shelter, or in the village, a tap does nothing', () => {
    const s = camp(22, { shelter: false });
    send(s, { type: 'sleep' });
    expect(s.state.player.pending).toBeNull();
    expect(of(s, 'cantSleep')).toHaveLength(0);
    const v = setup(VILLAGE);
    v.state.time = at(1, 22);
    send(v, { type: 'sleep' });
    expect(v.state.player.pending).toBeNull();
  });

  it('saves: asleep carries on until he gets up; a save from the morning finds him up; a broken rest is none', () => {
    const s = camp(22);
    s.state.stokedNight = Math.floor(s.state.time / DAY_SECONDS - STOKE.at);
    send(s, { type: 'sleep' });
    runUntil(s, () => s.state.player.task.kind === 'sleep', 60);
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
    expect(dayFraction(loaded.needs.bed!.until!) * 24).toBeCloseTo(7, 3);
    expect(loaded.needs.bed!.until! - loaded.time).toBeLessThan(DAY_SECONDS / 2);
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
