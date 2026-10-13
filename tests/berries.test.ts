// The berry bushes by the camp (chapter 2, food; data/pickups.ts kind 'bush', world/camp.ts): picked by hand like
// stones, one bush after another, waiting beside the next to ripen when none are ripe, until the backpack is full (then
// the chest, once it stands) or the current goal has enough. A bush stays standing when picked; its berries grow back.
// Food can be dropped; the wreck's things still can't. The village has no bushes.
import { describe, expect, it } from 'vitest';
import { canDrop, createState, currentGoal, type GameState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS } from '../src/core/clock';
import { deserialize, serialize } from '../src/core/save';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, inArea, siteOf, type Vec2 } from '../src/world/layout';
import { navFor } from '../src/world/nav';
import { waterOf, SHORE_CLEAR } from '../src/world/water';
import { goPickup, PICKUP_REACH } from '../src/actors/player';
import { applyCommands, type Command } from '../src/systems/commands';
import { backpackCount } from '../src/systems/backpack';
import { GOALS } from '../src/data/goals';
import { PICKUPS } from '../src/data/pickups';
import { BACKPACK_SLOTS } from '../src/data/hauling';
import { MAKES } from '../src/data/making';
import { outsideOf, standsOf } from '../src/world/steps';
import { LAYOUT_GAP } from '../src/data/building';

const BUSH = PICKUPS.bush, BERRIES = (BUSH.gives as { item: string; count: number });
const bushes = CAMP.pickups!.filter(p => p.kind === 'bush');
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
/** In-game time on `day` (from 0) at `hour` o'clock. */
const at = (day: number, hour: number) => (day + hour / 24) * DAY_SECONDS;

function setup(seed = 7) {
  const state = createState(CAMP, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, ctx: { layout: CAMP, rng: createRng(seed), events } };
}
type Setup = ReturnType<typeof setup>;
/** A camp game whose current goal is `goal`: every goal before it done, the first chapter's things standing (the
 *  campfire, the firewood pile, the shelter and the chest), his stone tools (and the rod once its goal is done), early
 *  in the morning so no night falls in a test. `chest` false: the chest isn't built yet. */
function campAt(goal: string, { chest = true, seed = 7 } = {}): Setup {
  const s = setup(seed), i = GOALS.findIndex(g => g.id === goal);
  s.state.goalsDone = GOALS.slice(0, i).map(g => g.id);
  s.state.built = chest ? ['campfire', 'woodpile', 'shelter', 'chest'] : ['campfire', 'woodpile', 'shelter'];
  s.state.tools = { ...s.state.tools, axe: true, pick: true, rod: s.state.goalsDone.includes('rod') };
  s.state.hasBook = true;
  s.state.time = at(1, 7.5);
  return s;
}
const send = (s: Setup, c: Command) => applyCommands(s.state, CAMP, [c], s.events);
const runUntil = (s: Setup, done: () => boolean, max: number) => { for (let t = 0; t < max && !done(); t += STEP) step(s.state, STEP, s.ctx); };
const run = (s: Setup, seconds: number) => runUntil(s, () => false, seconds);
const count = (s: Setup, type: GameEvent['type']) => s.log.filter(e => e.type === type).length;
/** Where he stood each time he picked a bush, and what it gave. */
function picks(s: Setup) {
  const out: { id: string; at: Vec2; time: number }[] = [];
  s.events.on(e => { if (e.type === 'pickedUp' && e.kind === 'bush') out.push({ id: e.id, at: { ...s.state.player.pos }, time: s.state.time }); });
  return out;
}
const berries = (state: GameState) => state.player.backpack.berries ?? 0;

describe('the berry bushes by the camp', () => {
  it('grow in a patch near the camp, on dry ground off the bank, out of the way of the camp and of each other', () => {
    expect(bushes.length).toBeGreaterThanOrEqual(4);
    const fire = CAMP.hearth.pos, water = waterOf(CAMP);
    // (the fire, the tent's spot, and its door, where the chest in it is used)
    const spots = [fire, CAMP.camp!.tent.pos, standsOf(CAMP, 'shelter')[0]!];
    for (const b of bushes) {
      expect(inArea(CAMP.village, b.pos), b.id).toBe(true);
      expect(water.edge(b.pos), b.id).toBeGreaterThan(SHORE_CLEAR);
      expect(dist(b.pos, fire), b.id).toBeLessThan(10);                      // close to the camp
      for (const p of spots) expect(dist(b.pos, p), b.id).toBeGreaterThan(2.5);
      // (the firewood pile's spot, moved out from the fire for the woodshed in the camp build: clear of the woodshed by
      // the room every spot keeps, tests/layout.test.ts)
      expect(outsideOf(CAMP, 'woodshed', b.pos), b.id).toBeGreaterThan(PICKUPS.bush.plant!.radius + LAYOUT_GAP.gap);
      for (const o of bushes) if (o !== b) expect(dist(b.pos, o.pos), `${b.id} ${o.id}`).toBeGreaterThan(1.5);
      for (const p of CAMP.pickups!) if (p.kind !== 'bush') expect(dist(b.pos, p.pos), `${b.id} ${p.id}`).toBeGreaterThan(1.4);
      for (const n of CAMP.nodes) expect(dist(b.pos, n.pos), `${b.id} ${n.id}`).toBeGreaterThan(2);
      for (const t of CAMP.trees) expect(dist(b.pos, t.pos), b.id).toBeGreaterThan(1.2);
      for (const d of CAMP.bushes) expect(dist(b.pos, d), b.id).toBeGreaterThan(1.5);
    }
  });

  it('are in the way, with room to stand beside each and walk between them; the ways round the camp stay open', () => {
    const nav = navFor(CAMP), built = navFor(CAMP, ['campfire', 'woodpile', 'shelter', 'chest']);
    for (const b of bushes) {
      expect(nav.walkable(b.pos), b.id).toBe(false);
      const s = setup();
      expect(goPickup(s.state, CAMP, b.id), b.id).toBe(true);
      const stand = s.state.player.path.at(-1)!;
      expect(dist(stand, b.pos), b.id).toBeLessThanOrEqual(PICKUP_REACH.at(-1)! + 1e-6);
      expect(built.walkable(stand), b.id).toBe(true);
    }
    // from the fire to everything he works and back to where he washed up, round the bushes
    const fire = { x: CAMP.hearth.pos.x - 1.3, z: CAMP.hearth.pos.z };
    const dests = [CAMP.start, standsOf(CAMP, 'shelter')[0]!, ...CAMP.nodes.filter(n => n.resource !== 'fishing_spot').map(n => n.pos)];
    for (const d of dests) {
      const to = built.nearestWalkable(d), path = built.findPath(fire, to);
      expect(path, `${d.x}, ${d.z}`).not.toBeNull();
      // no long way round: at most a third longer than straight
      let len = 0, from = fire;
      for (const w of path!) { len += dist(from, w); from = w; }
      expect(len, `${d.x}, ${d.z}`).toBeLessThan(dist(fire, to) * 1.34 + 1);
    }
  });

  it('a tap on a bush: he picks it, a couple of berries go into his backpack, it stands bare, and he goes on to the next', () => {
    const s = campAt('berries'), got = picks(s), first = bushes[0]!;
    send(s, { type: 'pickup', id: first.id });
    expect(s.state.player.pending).toEqual({ kind: 'pickup', id: first.id });
    runUntil(s, () => s.state.player.task.kind === 'pickup', 60);
    const stoppedAt = s.state.time;
    runUntil(s, () => got.length > 0, 10);
    expect(s.state.time - stoppedAt).toBeCloseTo(BUSH.pause!, 1);            // picking takes a moment
    expect(got[0]!.id).toBe(first.id);
    expect(berries(s.state)).toBe(BERRIES.count);
    expect(s.state.taken[first.id]).toBeCloseTo(s.state.time + BUSH.respawn!, 3);
    expect(s.log).toContainEqual({ type: 'itemGained', item: 'berries', count: BERRIES.count });
    // the bush is still there, in the way; he heads for the nearest ripe one
    expect(navFor(CAMP, s.state.built).walkable(first.pos)).toBe(false);
    const next = s.state.player.pending as { kind: 'pickup'; id: string };
    expect(next.kind).toBe('pickup');
    const ripe = bushes.filter(b => !(b.id in s.state.taken));
    const nearest = ripe.reduce((a, b) => dist(b.pos, got[0]!.at) < dist(a.pos, got[0]!.at) ? b : a);
    expect(next.id).toBe(nearest.id);
  });

  it('with every bush bare he waits beside the first to ripen, picks it when its berries are back, and goes on', () => {
    const s = campAt('rod'), got = picks(s);                                // berries done: picking goes on past 10
    send(s, { type: 'pickup', id: bushes[0]!.id });
    runUntil(s, () => got.length === bushes.length, 120);
    expect(got.map(g => g.id).sort()).toEqual(bushes.map(b => b.id).sort());
    const soonest = got[0]!.id;
    runUntil(s, () => s.state.player.task.kind === 'pickup', 30);
    expect(s.state.player.task).toMatchObject({ kind: 'pickup', id: soonest });
    expect(s.state.taken[soonest]).toBeGreaterThan(s.state.time);           // not ripe yet: he waits beside it
    const waitAt = { ...s.state.player.pos };
    runUntil(s, () => s.log.some(e => e.type === 'pickupBack' && e.id === soonest), BUSH.respawn! + 5);
    expect(s.state.player.pos).toEqual(waitAt);
    runUntil(s, () => got.length > bushes.length, BUSH.pause! + 1);
    expect(got.at(-1)!.id).toBe(soonest);
    expect(berries(s.state)).toBe((bushes.length + 1) * BERRIES.count);
    // they all grow back in their own time
    run(s, BUSH.respawn! + 10);
    expect(count(s, 'pickupBack')).toBeGreaterThanOrEqual(bushes.length);
  });

  it('a tap on a bare bush sends him to wait beside it; a tap on one he can see is ripe goes straight there', () => {
    const s = campAt('rod'), b = bushes[2]!;
    s.state.taken[b.id] = s.state.time + 20;                                 // picked a little while ago
    const back = s.state.taken[b.id]!;
    send(s, { type: 'pickup', id: b.id });
    expect(s.state.player.pending).toEqual({ kind: 'pickup', id: b.id });
    runUntil(s, () => s.state.player.task.kind === 'pickup', 30);
    expect(s.state.time).toBeLessThan(back);                                 // there before its berries are back
    const waitAt = { ...s.state.player.pos }, got = picks(s);
    runUntil(s, () => got.length > 0, 30);
    expect(got[0]!.id).toBe(b.id);
    // he waited beside it, where he stood, until its berries were back, then picked it
    expect(got[0]!.time).toBeGreaterThanOrEqual(back + BUSH.pause! - STEP);
    expect(got[0]!.at).toEqual(waitAt);
    // a stone that isn't back yet still can't be tapped (it isn't there to see)
    const stone = CAMP.pickups!.find(p => p.kind === 'stone')!;
    s.state.taken[stone.id] = s.state.time + 50;
    const before = { ...s.state.player };
    send(s, { type: 'pickup', id: stone.id });
    expect(s.state.player.pending).toEqual(before.pending);
  });

  it('the Berries goal: picking stops once he has the 10 it asks for, though the goal after it wants something else', () => {
    const s = campAt('berries');
    expect(currentGoal(s.state).id).toBe('berries');
    const goal = GOALS.find(g => g.id === 'berries')!, after = GOALS[GOALS.indexOf(goal) + 1]!;
    expect(goal.needs).toEqual({ berries: 10 });
    expect(after.needs.berries).toBeUndefined();
    send(s, { type: 'pickup', id: bushes[1]!.id });
    runUntil(s, () => count(s, 'goalEnough') > 0, 300);
    expect(s.log).toContainEqual({ type: 'goalEnough', item: 'berries', goal: 'berries' });
    expect(berries(s.state)).toBe(10);
    expect(s.state.player.task.kind).toBe('idle');
    expect(s.state.player.pending).toBeNull();
    run(s, 1);
    expect(s.state.goalsDone).toContain('berries');
    expect(currentGoal(s.state).id).toBe(after.id);
    // tapped again later, he picks on (for food), the goal being done
    send(s, { type: 'pickup', id: bushes[0]!.id });
    runUntil(s, () => berries(s.state) > 10, BUSH.respawn! + 60);
    expect(berries(s.state)).toBeGreaterThan(10);
  });

  it('a full backpack goes to the chest and he comes back to the bushes; with no chest yet, a tap is refused with the usual notice', () => {
    const s = campAt('rod');
    s.state.player.backpack = { birch_logs: BACKPACK_SLOTS - 3 };
    send(s, { type: 'pickup', id: bushes[0]!.id });
    runUntil(s, () => count(s, 'backpackFull') > 0, 120);
    expect(s.state.player.pending).toEqual({ kind: 'visit', id: 'chest' });
    expect(s.state.player.trip).toMatchObject({ pickupId: expect.stringMatching(/^bush/) });
    runUntil(s, () => count(s, 'banked') > 0, 60);
    expect(s.state.bank.birch_logs).toBe(BACKPACK_SLOTS - 3);
    // the few berries he picked stay on him: a few meals are kept when the backpack is emptied (KEEP_FOOD, 0.0.25)
    expect(s.state.player.backpack.berries).toBeGreaterThan(0);
    expect(s.state.bank.berries ?? 0).toBe(0);
    runUntil(s, () => s.state.player.trip === null, 5);
    expect(s.state.player.pending?.kind).toBe('pickup');                     // back to the bushes
    const got = picks(s);
    runUntil(s, () => got.length > 0, BUSH.respawn! + 60);
    expect(got.length).toBeGreaterThan(0);
    // tapped with a full backpack: straight to the chest first
    const f = campAt('rod');
    f.state.player.backpack = { birch_logs: BACKPACK_SLOTS };
    send(f, { type: 'pickup', id: bushes[0]!.id });
    runUntil(f, () => count(f, 'banked') > 0, 60);
    expect(count(f, 'noRoom')).toBe(0);
    // no chest: refused before he walks, with the usual notice
    const n = campAt('rod', { chest: false }), start = { ...n.state.player.pos };
    n.state.player.backpack = { birch_logs: BACKPACK_SLOTS - 1 };              // no room for a bush's two berries
    send(n, { type: 'pickup', id: bushes[0]!.id });
    expect(n.log.at(-1)).toEqual({ type: 'noRoom' });
    run(n, 2);
    expect(n.state.player.pos).toEqual(start);
    // ...and a backpack filling up while picking stops him with the usual notice
    n.state.player.backpack = { birch_logs: BACKPACK_SLOTS - 4 };
    send(n, { type: 'pickup', id: bushes[0]!.id });
    runUntil(n, () => count(n, 'noStorage') > 0, 120);
    expect(backpackCount(n.state)).toBe(BACKPACK_SLOTS);
    expect(n.state.player.task.kind).toBe('idle');
  });

  it('food can be dropped (berries, raw, cooked and burnt fish); the wreck still keeps its planks and tarp', () => {
    for (const item of ['berries', 'raw_fish', 'cooked_fish', 'burnt_fish', 'stone', 'branch', 'birch_logs', 'copper_ore']) expect(canDrop(item), item).toBe(true);
    for (const item of ['plank', 'tarp']) expect(canDrop(item), item).toBe(false);
    const s = campAt('rod');
    s.state.player.backpack = { berries: 4, cooked_fish: 2, burnt_fish: 3 };
    send(s, { type: 'drop', item: 'burnt_fish', count: 3 });
    send(s, { type: 'drop', item: 'berries', count: 1 });
    expect(s.state.player.backpack).toEqual({ berries: 3, cooked_fish: 2 });
  });

  it('a save made while picking, or waiting beside a bare bush, carries on after a reload', () => {
    const s = campAt('rod'), got = picks(s);
    send(s, { type: 'pickup', id: bushes[0]!.id });
    runUntil(s, () => got.length === bushes.length, 120);
    runUntil(s, () => s.state.player.task.kind === 'pickup', 30);
    const back = deserialize(serialize(s.state), CAMP);
    expect(back).toEqual(s.state);
    const again = { ...setup(), state: back }, againGot = picks(again);
    runUntil(again, () => againGot.length > 0, BUSH.respawn! + 10);
    expect(againGot[0]!.id).toBe((s.state.player.task as { id: string }).id);
  });

  it('the village has no berry bushes, and its walking is as it was', () => {
    expect((VILLAGE.pickups ?? []).some(p => p.kind === 'bush')).toBe(false);
    expect(siteOf(VILLAGE, 'hearth')).toBeNull();
    expect(MAKES.rod.at).toBe('here');
  });
});
