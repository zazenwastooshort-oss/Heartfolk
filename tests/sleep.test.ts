// Sleeping in the shelter (12 Oct 2026, the owner): a tap on the built shelter at night sends him to bed, he sleeps
// until dawn while play goes quicker, and wakes well rested: gathering yields more often until nightfall.
import { describe, expect, it } from 'vitest';
import { createState, type GameState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS, isNight } from '../src/core/clock';
import { deserialize, serialize } from '../src/core/save';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, type Layout } from '../src/world/layout';
import { applyCommands, type Command } from '../src/systems/commands';
import { isRested, playSpeed, restedFactor } from '../src/systems/sleep';
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
    expect(of(s, 'cantSleep')).toHaveLength(1);
    expect(s.state.player.pending).toBeNull();
    expect(s.state.player.pos).toEqual(pos);
    expect(SLEEP_TEXT.cantSleep).toContain('once night falls');
  });

  it('at night he walks to the shelter, sleeps out of sight until dawn, and wakes well rested', () => {
    const s = camp(22);
    s.state.stokedNight = Math.floor(s.state.time / DAY_SECONDS - STOKE.at);   // the fire seen to tonight already
    send(s, { type: 'sleep' });
    expect(s.state.player.pending).toEqual({ kind: 'visit', id: 'shelter' });
    runUntil(s, () => s.state.player.task.kind === 'sleep', 60);
    expect(of(s, 'fellAsleep')).toHaveLength(1);
    expect(playSpeed(s.state)).toBe(SLEEP.speed);
    expect(isRested(s.state)).toBe(false);
    runUntil(s, () => s.state.player.task.kind !== 'sleep', DAY_SECONDS);
    expect(isNight(s.state.time)).toBe(false);
    expect(of(s, 'awake')).toHaveLength(1);
    expect(s.state.player.task.kind).toBe('idle');
    expect(isRested(s.state)).toBe(true);
    expect(s.state.restedUntil).toBeCloseTo(s.state.time + SLEEP.rested, 0);
    expect(playSpeed(s.state)).toBe(1);
    expect(restedFactor(s.state)).toBe(1 + SLEEP.bonus);
    // and the rest wears off by nightfall
    run(s, SLEEP.rested + 1);
    expect(isRested(s.state)).toBe(false);
  });

  it('woken early by a tap elsewhere, he gets up without the rest', () => {
    const s = camp(23);
    s.state.stokedNight = Math.floor(s.state.time / DAY_SECONDS - STOKE.at);
    send(s, { type: 'sleep' });
    runUntil(s, () => s.state.player.task.kind === 'sleep', 60);
    send(s, { type: 'walk', to: { x: 2, z: 0 } });
    expect(s.state.player.task.kind).toBe('walk');
    run(s, DAY_SECONDS / 2);
    expect(of(s, 'awake')).toHaveLength(0);
    expect(isRested(s.state)).toBe(false);
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

  it('saves: asleep carries on at night, a save from the morning finds him up; a broken rest is none, a long one a day', () => {
    const s = camp(22);
    s.state.stokedNight = Math.floor(s.state.time / DAY_SECONDS - STOKE.at);
    send(s, { type: 'sleep' });
    runUntil(s, () => s.state.player.task.kind === 'sleep', 60);
    expect(deserialize(serialize(s.state), CAMP).player.task).toEqual({ kind: 'sleep' });
    const morning = JSON.parse(serialize(s.state)) as GameState;
    morning.time = at(2, 9);
    expect(deserialize(JSON.stringify(morning), CAMP).player.task).toEqual({ kind: 'idle' });
    const edit = (rested: unknown) => { const r = JSON.parse(serialize(s.state)); r.restedUntil = rested; return deserialize(JSON.stringify(r), CAMP).restedUntil; };
    expect(edit('soon')).toBe(0);
    expect(edit(-5)).toBe(0);
    expect(edit(s.state.time + 1e9)).toBeCloseTo(s.state.time + SLEEP.rested, 3);
    expect(edit(s.state.time + 100)).toBeCloseTo(s.state.time + 100, 3);
  });

  it('the dial: noon at the top, midnight at the bottom, turning with the time', () => {
    expect(dialAngle(at(0, 12))).toBeCloseTo(0, 5);
    expect(dialAngle(at(0, 0))).toBeCloseTo(180, 5);
    expect(dialAngle(at(3, 18))).toBeCloseTo(90, 5);
    expect(dialAngle(at(3, 6))).toBeCloseTo(270, 5);
  });
});
