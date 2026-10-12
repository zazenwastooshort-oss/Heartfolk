// Fishing (chapter 2, food): the Fishing skill worked at fishing spots out in the pool below the falls and along the
// river (resource nodes, data/skills.ts 'fishing_spot'), standing on the bank, never in the water, with a fishing rod
// (a tool made where he stands from branches: data/making.ts). Idle like chopping: fish after fish until the backpack
// is full (then off to the chest and back) or the goal has enough; a spot gone quiet sends him to another. Saves and
// away time carry it. The village has no fishing spots.
import { describe, expect, it } from 'vitest';
import { createState, currentGoal, goalFirst, made } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS } from '../src/core/clock';
import { deserialize, readSave, serialize } from '../src/core/save';
import { catchUpAway, step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, type Vec2 } from '../src/world/layout';
import { navFor } from '../src/world/nav';
import { waterOf } from '../src/world/water';
import { reachFor } from '../src/actors/player';
import { applyCommands, type Command } from '../src/systems/commands';
import { GOALS } from '../src/data/goals';
import { RESOURCES, TOOLS } from '../src/data/skills';
import { SWINGS } from '../src/data/animation';
import { MAKES } from '../src/data/making';
import { BACKPACK_SLOTS } from '../src/data/hauling';
import { AWAY } from '../src/data/away';
import { awayText } from '../src/ui/away';

const SPOT = RESOURCES.fishing_spot!;
const spots = CAMP.nodes.filter(n => n.resource === 'fishing_spot');
const water = waterOf(CAMP), nav = navFor(CAMP);
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const at = (day: number, hour: number) => (day + hour / 24) * DAY_SECONDS;
const NOW = Date.UTC(2026, 9, 12, 9, 0, 0);

function setup(seed = 11) {
  const state = createState(CAMP, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, ctx: { layout: CAMP, rng: createRng(seed), events } };
}
type Setup = ReturnType<typeof setup>;
/** A camp game whose current goal is `goal`: every goal before it done, the first chapter's things standing, his stone
 *  tools (and the rod once its goal is done), early in the morning so no night falls in a test. */
/** The goal after the cooked meal: no goal asks for fish then, so nothing stops his fishing (since 13 Oct 2026 the meal
 *  stops it once he has enough raw fish to cook it). */
const AFTER_MEAL = GOALS[GOALS.findIndex(g => g.id === 'meal') + 1]!.id;

function campAt(goal: string, { chest = true, seed = 11 } = {}): Setup {
  const s = setup(seed), i = GOALS.findIndex(g => g.id === goal);
  s.state.goalsDone = GOALS.slice(0, i).map(g => g.id);
  s.state.built = chest ? ['campfire', 'woodpile', 'shelter', 'chest'] : ['campfire', 'woodpile', 'shelter'];
  s.state.tools = { ...s.state.tools, axe: true, pick: true, rod: s.state.goalsDone.includes('rod') };
  s.state.hasBook = true;
  s.state.time = at(1, 6.5);
  return s;
}
const send = (s: Setup, c: Command) => applyCommands(s.state, CAMP, [c], s.events);
const runUntil = (s: Setup, done: () => boolean, max: number) => { for (let t = 0; t < max && !done(); t += STEP) step(s.state, STEP, s.ctx); };
const run = (s: Setup, seconds: number) => runUntil(s, () => false, seconds);
const count = (s: Setup, type: GameEvent['type']) => s.log.filter(e => e.type === type).length;
const fish = (s: Setup) => s.state.player.backpack.raw_fish ?? 0;
const fishingAt = (s: Setup) => { const t = s.state.player.task; return t.kind === 'gather' ? t.nodeId : null; };

describe('the fishing spots', () => {
  it('lie out in the pool below the falls and along the river, apart from each other', () => {
    expect(spots.length).toBeGreaterThanOrEqual(4);
    const pool = CAMP.falls!.pool;
    const inPool = spots.filter(n => dist(n.pos, pool.pos) < pool.radius + 1.5);
    expect(inPool.length).toBeGreaterThanOrEqual(1);
    expect(spots.length - inPool.length).toBeGreaterThanOrEqual(2);            // and along the river
    for (const n of spots) {
      expect(water.edge(n.pos), n.id).toBeLessThan(-0.8);                     // well out in the water
      for (const o of spots) if (o !== n) expect(dist(n.pos, o.pos), `${n.id} ${o.id}`).toBeGreaterThan(2.5);
    }
    expect(SPOT).toMatchObject({ skill: 'fishing', item: 'raw_fish', level: 1 });
    expect(SWINGS.fishing.tool).toBe('rod');
    expect(TOOLS.rod.a).toBe('a fishing rod');
  });

  it('each can be fished from dry ground on the bank that he can walk to from where he washed up', () => {
    for (const n of spots) {
      const r = reachFor(n);
      let found = 0;
      for (let k = 0; k < 72; k++) {
        const a = k / 72 * Math.PI * 2, stand = { x: n.pos.x + Math.cos(a) * r, z: n.pos.z + Math.sin(a) * r };
        if (!nav.walkable(stand) || !nav.findPath(CAMP.start, stand)) continue;
        expect(water.edge(stand), n.id).toBeGreaterThan(0);
        found++;
      }
      expect(found, n.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('sent to fish, from anywhere, he walks the bank and stands on dry ground to fish, never in the water', () => {
    for (const n of spots) {
      for (const from of [CAMP.start, { x: 3, z: 1 }, { x: -8, z: 10 }]) {
        const s = campAt('fish');
        s.state.player.pos = navFor(CAMP, s.state.built).nearestWalkable(from);
        send(s, { type: 'work', nodeId: n.id });
        expect(s.state.player.pending, `${n.id} from ${from.x}, ${from.z}`).toEqual({ kind: 'node', id: n.id });
        let dry = true;
        runUntil(s, () => { if (water.edge(s.state.player.pos) <= 0) dry = false; return s.state.player.task.kind === 'gather'; }, 60);
        expect(dry, n.id).toBe(true);
        expect(s.state.player.task, n.id).toMatchObject({ kind: 'gather', nodeId: n.id });
        expect(dist(s.state.player.pos, n.pos), n.id).toBeCloseTo(reachFor(n), 0);
      }
    }
  });
});

describe('the fishing rod', () => {
  it('without one, fishing is refused before he walks, saying what he needs', () => {
    const s = campAt('rod'), start = { ...s.state.player.pos };
    expect(s.state.tools.rod).toBe(false);
    send(s, { type: 'work', nodeId: spots[0]!.id });
    expect(s.log).toContainEqual({ type: 'needTool', tool: 'rod', skill: 'fishing' });
    run(s, 3);
    expect(s.state.player.pos).toEqual(start);
    expect(s.state.player.task.kind).toBe('idle');
  });

  it('is made where he stands from branches, once the goals before it are done, and finishes its goal', () => {
    expect(MAKES.rod).toMatchObject({ at: 'here', needs: { branch: 3 }, gives: { kind: 'tool', tool: 'rod' } });
    const goal = GOALS.find(g => g.id === 'rod')!;
    expect(goal).toMatchObject({ makes: 'rod', needs: MAKES.rod.needs });
    // before the berries it waits for them
    const early = campAt('berries');
    early.state.player.backpack = { branch: 3 };
    send(early, { type: 'make', id: 'rod' });
    expect(early.log.at(-1)).toEqual({ type: 'goalFirst', make: 'rod', goal: 'berries' });
    expect(goalFirst(early.state, 'rod')?.id).toBe('berries');
    // its turn: made in a moment where he stands, the branches used up
    const s = campAt('rod'), where = { ...s.state.player.pos };
    s.state.player.backpack = { branch: 4 };
    send(s, { type: 'make', id: 'rod' });
    runUntil(s, () => made(s.state, 'rod'), MAKES.rod.time + 2);
    expect(s.state.tools.rod).toBe(true);
    expect(s.state.player.pos).toEqual(where);
    expect(s.state.player.backpack).toEqual({ branch: 1 });
    expect(s.log).toContainEqual({ type: 'made', make: 'rod' });
    run(s, 0.1);
    expect(s.state.goalsDone).toContain('rod');
    expect(currentGoal(s.state).id).toBe('fish');
  });
});

describe('fishing', () => {
  it('fish after fish into the backpack, with Fishing XP, at about the spot\'s pace', () => {
    const s = campAt(AFTER_MEAL);                                              // past the meal: no goal stops his fishing
    send(s, { type: 'work', nodeId: spots[2]!.id });
    runUntil(s, () => fishingAt(s) !== null, 60);
    const started = s.state.time;
    runUntil(s, () => fish(s) >= 12, 600);
    expect(fish(s)).toBe(12);
    const each = (s.state.time - started) / 12;
    expect(each).toBeGreaterThan(SPOT.time * 0.5);
    expect(each).toBeLessThan(SPOT.time * 2);
    expect(s.state.skills.fishing).toBe(12 * SPOT.xp);
    expect(count(s, 'strike')).toBeGreaterThan(12);                            // bites that got away, too
  });

  it('the Fish goal: he stops once he has the 8 it asks for (0.0.25: 5 left too few for the meal, with some burning)', () => {
    const s = campAt('fish');
    expect(currentGoal(s.state).id).toBe('fish');
    send(s, { type: 'work', nodeId: spots[1]!.id });
    runUntil(s, () => count(s, 'goalEnough') > 0, 300);
    expect(s.log).toContainEqual({ type: 'goalEnough', item: 'raw_fish', goal: 'fish' });
    expect(fish(s)).toBe(8);
    expect(s.state.player.task.kind).toBe('idle');
    run(s, 0.1);
    expect(currentGoal(s.state).id).toBe('meal');
  });

  it('a full backpack goes to the chest, is emptied there, and he comes back to fish', () => {
    const s = campAt('meal');
    s.state.player.backpack = { birch_logs: BACKPACK_SLOTS - 2 };
    send(s, { type: 'work', nodeId: spots[0]!.id });
    runUntil(s, () => count(s, 'backpackFull') > 0, 300);
    expect(s.state.player.trip).toMatchObject({ nodeId: expect.stringMatching(/^camp_fish/) });
    runUntil(s, () => count(s, 'banked') > 0, 60);
    expect(s.state.bank).toMatchObject({ birch_logs: BACKPACK_SLOTS - 2, raw_fish: 2 });
    runUntil(s, () => fishingAt(s) !== null, 60);
    expect(fishingAt(s)).toMatch(/^camp_fish/);
    runUntil(s, () => fish(s) > 0, 120);
    expect(fish(s)).toBeGreaterThan(0);
  });

  it('when the fish move off a spot he goes on to another rather than wait', () => {
    const s = campAt('meal');
    send(s, { type: 'work', nodeId: spots[2]!.id });
    runUntil(s, () => count(s, 'nodeDepleted') > 0, 900);
    const quiet = s.log.find(e => e.type === 'nodeDepleted') as { nodeId: string };
    runUntil(s, () => fishingAt(s) !== null && fishingAt(s) !== quiet.nodeId, 30);
    expect(fishingAt(s)).not.toBe(quiet.nodeId);
    expect(s.state.nodes[quiet.nodeId]!.depletedUntil).toBeGreaterThan(s.state.time);
  });

  it('a save made while fishing, or on the way to the chest, carries on after a reload', () => {
    const s = campAt('meal');
    send(s, { type: 'work', nodeId: spots[3]!.id });
    runUntil(s, () => fish(s) >= 2, 300);
    const back = deserialize(serialize(s.state), CAMP);
    expect(back).toEqual(s.state);
    const again = { ...setup(5), state: back };
    runUntil(again, () => (again.state.player.backpack.raw_fish ?? 0) >= 4, 300);
    expect(again.state.player.backpack.raw_fish).toBe(4);
    // on the way to the chest with a full backpack
    const t = campAt('meal');
    t.state.player.backpack = { stone: BACKPACK_SLOTS - 1 };
    send(t, { type: 'work', nodeId: spots[0]!.id });
    runUntil(t, () => count(t, 'backpackFull') > 0, 300);
    run(t, 0.5);
    const tripped = { ...setup(6), state: deserialize(serialize(t.state), CAMP) };
    expect(tripped.state.player.trip).toEqual(t.state.player.trip);
    runUntil(tripped, () => tripped.log.some(e => e.type === 'banked'), 60);
    runUntil(tripped, () => tripped.state.player.task.kind === 'gather', 60);
    expect(fishingAt(tripped)).toMatch(/^camp_fish/);
  });

  it('away time while fishing: he fishes on while the game is closed, and the note says so', () => {
    const s = campAt(AFTER_MEAL);
    send(s, { type: 'work', nodeId: spots[1]!.id });
    runUntil(s, () => fishingAt(s) !== null, 60);
    const loaded = readSave(serialize(s.state, NOW - 30 * 60 * 1000), CAMP);
    const r = catchUpAway(loaded.state, loaded.savedAt, NOW, { layout: CAMP, rng: createRng(3), events: new EventBus() });
    expect(r.away.game).toBeCloseTo(30 * 60 * AWAY.rate, 0);
    expect(r.summary.items.raw_fish ?? 0).toBeGreaterThan(10);
    expect(r.summary.xp.fishing).toBe((r.summary.items.raw_fish ?? 0) * SPOT.xp);
    const { lines } = awayText([r.away], r.summary);
    expect(lines.some(l => /raw fish/.test(l))).toBe(true);
    expect(lines.some(l => /^Fishing: \+/.test(l))).toBe(true);
  });
});

describe('the village has no fishing', () => {
  it('no fishing spots, though his village tools include a rod', () => {
    expect(VILLAGE.nodes.some(n => RESOURCES[n.resource]!.skill === 'fishing')).toBe(false);
    expect(createState(VILLAGE).tools.rod).toBe(true);
    expect(createState(CAMP).tools.rod).toBe(false);
  });
});
