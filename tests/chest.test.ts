// The storage chest at the shelter's door, and where he stands at the camp's bigger buildings (the camp build's stage 3;
// docs/plans/2026-10-13-camp-build-plan.md, In 7, In 8, In 11). The chest is furniture in the shelter (the owner, 13 Oct
// 2026: "maybe chest is just 'furniture' in the tent or house etc, rather than an individual object?"), with no spot of
// its own and in the way of nothing (T8.1). Everything to do with it happens at one door point in front of the shelter
// step furthest out, built or begun (D2, core/camp.ts shelterDoor): storing and hauling a full backpack, logs for the
// fire, fish for cooking, food for a fight, meals and tools (T8.3, T8.4); bed uses the same door. The door is always
// open ground with room round it (T8.2, T11.6). He builds the chest from the door (D3, T8.6), the words say it is in
// the shelter (T8.7), and "Store everything" sends him there (D22, T8.8). He sleeps in each shelter, and during an
// upgrade in the one before it (T6.3); he cooks and stokes at the stone hearth, and stacks and stokes at the woodshed,
// from their own stands, from their footings on (T7.1 to T7.3); everything is built from its own stands.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { createState, type GameState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS, isNight } from '../src/core/clock';
import { stagedDef, walkGrid } from '../src/core/building';
import { atSpot, buildSpot, chestHere, chestPlace, outermost, shelterDoor, spotEnds, useSpot } from '../src/core/camp';
import { survivalPages } from '../src/core/survival';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, type Vec2 } from '../src/world/layout';
import { navFor } from '../src/world/nav';
import { blocksOf, buildStandsOf, outsideOf, shapeOf, standsOf, stepPlace, toGround, toStep } from '../src/world/steps';
import { headingOf } from '../src/actors/player';
import { applyCommands, type Command } from '../src/systems/commands';
import { besideChest } from '../src/systems/tools';
import { knockOut, wakeSpot } from '../src/systems/rats';
import { goToBed, restedFactor } from '../src/systems/sleep';
import { storeAll } from '../src/ui/backpack';
import { stackedText } from '../src/ui/hud';
import { CARPENTRY, DOOR, LINES, SHAPES, SHELTERS, STAGED } from '../src/data/building';
import { MAKES, type MakeId } from '../src/data/making';
import { GOALS } from '../src/data/goals';
import { MAKE_NOTES, MAKE_WHERE } from '../src/data/survival';
import { THOUGHTS } from '../src/data/thoughts';
import { STOKE, WOODPILE } from '../src/data/fire';
import { COOK } from '../src/data/cooking';
import { BACKPACK_SLOTS, KEEP_FOOD } from '../src/data/hauling';
import { HUNGER } from '../src/data/needs';
import { SLEEP } from '../src/data/sleep';

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
/** In-game time on `day` (from 0) at `hour` o'clock. */
const at = (day: number, hour: number) => (day + hour / 24) * DAY_SECONDS;
const NIGHTFALL = STOKE.at * 24;
/** The angle between two headings, 0 to pi. */
const turn = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** What stands at the tent's spot, step by step, built and begun: the tent; a wall tent begun round it (at its
 *  footings, and half built, when it is drawn in the tent's place); the wall tent; a log cabin begun round that; the
 *  log cabin. */
interface Shelter { name: string; built: MakeId[]; underway: Partial<Record<MakeId, number>> }
const SHELTERED: Shelter[] = [
  { name: 'the tent', built: ['shelter'], underway: {} },
  { name: 'the tent, a wall tent at its footings round it', built: ['shelter'], underway: { wall_tent: 0 } },
  { name: 'the tent, a wall tent half built round it', built: ['shelter'], underway: { wall_tent: MAKES.wall_tent.time * 0.7 } },
  { name: 'the wall tent', built: ['shelter', 'wall_tent'], underway: {} },
  { name: 'the wall tent, a log cabin begun round it', built: ['shelter', 'wall_tent'], underway: { log_cabin: MAKES.log_cabin.time * 0.4 } },
  { name: 'the log cabin', built: ['shelter', 'wall_tent', 'log_cabin'], underway: {} },
];
/** The step furthest out at the tent's spot, of these. */
const outerOf = (sh: Shelter): MakeId => (Object.keys(sh.underway)[0] as MakeId | undefined) ?? sh.built.at(-1)!;
/** The camp's other spots: nothing there, their first steps, or their largest. */
const OTHERS: [string, MakeId[]][] = [
  ['nothing else', []],
  ['the campfire, the firewood pile and the dummy', ['campfire', 'woodpile', 'dummy']],
  ['the stone hearth, the woodshed and the dummy', ['campfire', 'stone_hearth', 'woodpile', 'woodshed', 'dummy']],
];

function setup(seed = 5) {
  const state = createState(CAMP, seed), events = new EventBus(), log: GameEvent[] = [];
  /** where he stood when each event came */
  const where: { e: GameEvent; pos: Vec2; heading: number }[] = [];
  events.on(e => { log.push(e); where.push({ e, pos: { ...state.player.pos }, heading: state.player.heading }); });
  return { state, events, log, where, ctx: { layout: CAMP, rng: createRng(seed), events } };
}
type Setup = ReturnType<typeof setup>;
const send = (s: Setup, c: Command) => applyCommands(s.state, CAMP, [c], s.events);
const runUntil = (s: Setup, done: () => boolean, max: number) => { let t = 0; for (; t < max && !done(); t += STEP) step(s.state, STEP, s.ctx); return t; };
const run = (s: Setup, seconds: number) => runUntil(s, () => false, seconds);
const of = <T extends GameEvent['type']>(s: Setup, type: T) => s.log.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
/** Where he stood when the first event of `type` (and, for a visit, to `id`) came. */
const whereAt = (s: Setup, type: GameEvent['type'], id?: string) => s.where.find(w => w.e.type === type && (id === undefined || (w.e as { id?: string }).id === id));

/** The camp set up (every goal done, his tools and the stone club), the shelter `sh` at the tent's spot with the chest
 *  in it, the other spots' `others`, by day at `hour`; he stands by the fire, north of it, in the open. */
function camp(sh: Shelter, hour = 9, others: MakeId[] = ['campfire', 'woodpile', 'dummy']): Setup {
  const s = setup();
  s.state.goalsDone = GOALS.map(g => g.id);
  s.state.built = [...others, ...sh.built, 'chest'];
  s.state.underway = { ...sh.underway };
  s.state.tools = { axe: true, pick: true, rod: true };
  s.state.hasBook = true;
  s.state.equipment.weapon = 'stone_club';
  // (bark the woodshed would want, in the chest: none peeled while he chops)
  s.state.bank = { bark: MAKES.woodshed.needs.bark! };
  s.state.time = at(1, hour);
  s.state.player.pos = { x: 3, z: -1 };
  return s;
}
/** The door, with `sh` at the tent's spot. */
const doorOf = (sh: Shelter) => standsOf(CAMP, outerOf(sh))[0]!;

describe('the chest has no spot of its own (T8.1)', () => {
  it('it is furniture in the shelter, in the way of nothing: a built chest adds nothing to the walking grid', () => {
    expect(Object.keys(CAMP.camp!)).toEqual(['tent', 'woodpile', 'dummy']);
    expect(MAKES.chest.at).toBe('tent');
    expect(SHAPES.chest!.furniture).toBe(true);
    expect(blocksOf(CAMP, 'chest')).toEqual({ boxes: [], rings: [] });
    const area = CAMP.village;
    for (const sh of SHELTERED) {
      const ids = [...sh.built, ...Object.keys(sh.underway)] as MakeId[];
      const without = navFor(CAMP, ids), withChest = navFor(CAMP, [...ids, 'chest']), differ: string[] = [];
      for (let x = area.minX + 0.2; x < area.maxX; x += 0.4) for (let z = area.minZ + 0.2; z < area.maxZ; z += 0.4) {
        if (without.walkable({ x, z }) !== withChest.walkable({ x, z })) differ.push(`${x.toFixed(1)},${z.toFixed(1)}`);
      }
      expect(differ, sh.name).toEqual([]);
    }
    // one grid for the same things in the way: the chest makes none of its own, and the one made as
    // something is begun is the one used once it stands
    const base = ['campfire', 'woodpile', 'shelter'];
    expect(navFor(CAMP, [...base, 'chest'])).toBe(navFor(CAMP, base));
    expect(navFor(CAMP, base, ['chest'])).toBe(navFor(CAMP, base));
    expect(navFor(CAMP, ['campfire', 'shelter'], ['woodpile'])).toBe(navFor(CAMP, base));
    expect(navFor(CAMP, [...base, 'chest'], ['wall_tent'])).toBe(navFor(CAMP, [...base, 'wall_tent', 'chest']));
    expect(navFor(CAMP, [...base, 'wall_tent'])).not.toBe(navFor(CAMP, base));
    // its old spot beside the tent (0.0.19 to 0.0.30) is open ground
    expect(navFor(CAMP, ['campfire', 'shelter', 'chest']).walkable({ x: 0.9, z: 7.3 })).toBe(true);
  });

  it('it is there only in a shelter that stands: built, with the tent, the wall tent or the log cabin standing', () => {
    const state = createState(CAMP);
    // nowhere for it to stand in a new game, nothing at the tent's spot
    expect(chestPlace(state, CAMP)).toBeNull();
    state.built = ['campfire', 'chest'];
    expect(chestHere(state, CAMP)).toBe(false);                    // (a hand-edited save: no shelter)
    expect(chestPlace(state, CAMP)).toBeNull();
    state.underway = { shelter: 30 };
    expect(chestHere(state, CAMP)).toBe(false);                    // the tent only begun
    for (const id of SHELTERS) { state.underway = {}; state.built = ['campfire', id, 'chest']; expect(chestHere(state, CAMP), id).toBe(true); }
    state.built = ['campfire', 'shelter'];
    expect(chestHere(state, CAMP)).toBe(false);                    // not built
    const village = createState(VILLAGE);
    village.built = ['shelter', 'chest'];
    expect(chestHere(village, VILLAGE)).toBe(false);               // the village has its bank
    expect(shelterDoor(village, VILLAGE)).toBeNull();
  });
});

describe("the shelter's door (D2, T8.2, T11.6)", () => {
  it('is the stand of the shelter step furthest out, built or begun; none before anything is at the tent\'s spot', () => {
    const state = createState(CAMP);
    expect(shelterDoor(state, CAMP)).toBeNull();
    state.underway = { shelter: 0 };
    expect(shelterDoor(state, CAMP)).toEqual(standsOf(CAMP, 'shelter')[0]);
    for (const sh of SHELTERED) {
      state.built = [...sh.built]; state.underway = { ...sh.underway };
      expect(outermost(state, 'tent'), sh.name).toBe(outerOf(sh));
      expect(shelterDoor(state, CAMP), sh.name).toEqual(standsOf(CAMP, outerOf(sh))[0]);
    }
  });

  it('T8.2: is in front of its step\'s door, on the way it faces: out from its front, across no further than its doorway', () => {
    for (const id of SHELTERS) {
      const place = stepPlace(CAMP, id)!, [x, z] = toStep(place, standsOf(CAMP, id)[0]!);
      const front = Math.max(...shapeOf(id)!.blocks.map(b => 'box' in b ? b.box[3] : b.ring[1] + b.ring[2]));
      expect(z - front, id).toBeCloseTo(CARPENTRY.reach, 1);
      expect(Math.abs(x), id).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });

  it('at every step, whatever stands at the other spots: open ground outside everything, reached from the start and the fire, with room to each side and in front (T11.6)', () => {
    for (const sh of SHELTERED) for (const [others, ids] of OTHERS) {
      const s = camp(sh, 9, ids), nav = walkGrid(s.state, CAMP), door = shelterDoor(s.state, CAMP)!, what = `${sh.name}, ${others}`;
      expect(door, what).toEqual(doorOf(sh));
      expect(nav.walkable(door), what).toBe(true);
      for (const id of [...s.state.built, ...Object.keys(s.state.underway)]) {
        if (!shapeOf(id)?.furniture) expect(outsideOf(CAMP, id, door), `${what}: ${id}`).toBeGreaterThan(id === outerOf(sh) ? CARPENTRY.reach - 0.02 : 0.5);
      }
      expect(nav.findPath(CAMP.start, door), `${what}: from the start`).not.toBeNull();
      const fire = useSpot(s.state, CAMP, 'campfire');
      if (fire) {
        const from = spotEnds(fire, door).find(p => nav.walkable(p))!;
        expect(nav.findPath(from, door), `${what}: from the fire`).not.toBeNull();
      }
      // DOOR.slack of open ground to each side of it and in front of it, in its step's own frame
      const place = stepPlace(CAMP, outerOf(sh))!, [x, z] = toStep(place, door);
      for (const [dx, dz] of [[DOOR.slack, 0], [-DOOR.slack, 0], [0, DOOR.slack], [DOOR.slack, DOOR.slack], [-DOOR.slack, DOOR.slack]] as const) {
        expect(nav.walkable(toGround(place, [x + dx, z + dz])), `${what}: ${dx}, ${dz} from the door`).toBe(true);
      }
    }
  });
});

describe('everything to do with the chest happens at the door (T8.3, T8.4)', () => {
  for (const sh of SHELTERED) describe(`with ${sh.name}`, () => {
    it('T8.3: a tap on the chest walks him to the door, facing in, and empties his backpack there; at the door he is beside the chest', () => {
      const s = camp(sh);
      s.state.player.backpack = { stone: 3, copper_ore: 2 };
      expect(besideChest(s.state, CAMP)).toBe(false);
      send(s, { type: 'visit', id: 'chest' });
      runUntil(s, () => of(s, 'banked').length > 0, 60);
      const there = whereAt(s, 'visited', 'chest')!, door = doorOf(sh);
      expect(dist(there.pos, door)).toBeLessThanOrEqual(DOOR.near);
      const middle = stepPlace(CAMP, outerOf(sh))!.pos;
      expect(turn(there.heading, headingOf({ x: middle.x - there.pos.x, z: middle.z - there.pos.z }))).toBeLessThan(0.01);
      expect(s.state.bank).toMatchObject({ stone: 3, copper_ore: 2 });
      expect(s.state.player.backpack).toEqual({});
      expect(whereAt(s, 'banked')!.pos).toEqual(there.pos);
      expect(besideChest(s.state, CAMP)).toBe(true);
      expect(walkGrid(s.state, CAMP).walkable(there.pos)).toBe(true);
    });

    it('T8.3: bed: at his bedtime he goes to the same door, where he lies down; nothing is stored', () => {
      const s = camp(sh, 22);
      s.state.player.backpack = { stone: 2 };
      goToBed(s.state, CAMP);                                        // as his bedtime would
      runUntil(s, () => s.state.player.task.kind === 'sleep', 60);
      expect(s.state.player.task.kind).toBe('sleep');
      expect(dist(whereAt(s, 'visited', 'shelter')!.pos, doorOf(sh))).toBeLessThanOrEqual(DOOR.near);
      expect(of(s, 'banked')).toHaveLength(0);
      expect(s.state.player.backpack).toEqual({ stone: 2 });
    });

    it('T8.4: a full backpack while chopping is walked to the door and emptied into the chest, and he goes back to chopping', () => {
      const s = camp(sh);
      send(s, { type: 'work', nodeId: 'camp_birch2' });
      runUntil(s, () => of(s, 'banked').length > 0, 900);
      expect(of(s, 'backpackFull')).toHaveLength(1);
      expect(dist(whereAt(s, 'banked')!.pos, doorOf(sh))).toBeLessThanOrEqual(DOOR.near);
      expect(s.state.bank.birch_logs).toBe(BACKPACK_SLOTS);
      runUntil(s, () => s.state.player.task.kind === 'gather', 60);
      expect(s.state.player.task).toMatchObject({ kind: 'gather' });
    });

    it('T8.4: at nightfall, the pile empty, he takes the logs from the chest at the door and stokes the fire', () => {
      const s = camp(sh, NIGHTFALL - 0.05);
      s.state.woodpile = 0;
      s.state.bank.birch_logs = 5;
      runUntil(s, () => of(s, 'stoked').length > 0, 120);
      expect(of(s, 'stokeOff')).toHaveLength(1);
      expect(dist(whereAt(s, 'visited', 'chest')!.pos, doorOf(sh))).toBeLessThanOrEqual(DOOR.near);
      expect(of(s, 'stoked')).toEqual([{ type: 'stoked', logs: STOKE.logs }]);
      expect(s.state.bank.birch_logs).toBe(5 - STOKE.logs);
    });

    it('T8.4: on his way to the chest for logs, a tap on it empties his backpack there too (stoke.empty)', () => {
      const s = camp(sh, NIGHTFALL - 0.05);
      s.state.woodpile = 0;
      s.state.bank.birch_logs = 5;
      s.state.player.backpack = { stone: 4 };
      runUntil(s, () => of(s, 'stokeOff').length > 0, 5);
      send(s, { type: 'visit', id: 'chest' });
      expect(s.state.player.stoke).toMatchObject({ from: 'chest', empty: true, logs: 0 });
      runUntil(s, () => of(s, 'stoked').length > 0, 120);
      expect(dist(whereAt(s, 'banked')!.pos, doorOf(sh))).toBeLessThanOrEqual(DOOR.near);
      expect(s.state.bank.stone).toBe(4);
    });

    it('T8.4: cooking with no raw fish on him, he fetches them from the chest at the door, then cooks them at the fire', () => {
      const s = camp(sh);
      s.state.bank[COOK.raw] = 3;
      send(s, { type: 'cook' });
      expect(s.state.player.pending).toEqual({ kind: 'visit', id: 'chest' });
      runUntil(s, () => of(s, 'cooked').length >= 3, 120);
      expect(dist(whereAt(s, 'visited', 'chest')!.pos, doorOf(sh))).toBeLessThanOrEqual(DOOR.near);
      expect(of(s, 'cooked')).toHaveLength(3);
      expect(s.state.bank[COOK.raw]).toBeUndefined();
    });

    it('T8.4: off to fight the rats with no food on him, he takes some from the chest at the door; a tap on the chest on the way stores what he carries too (trip.store)', () => {
      for (const tap of [false, true]) {
        const s = camp(sh);
        s.state.bank.cooked_fish = 8;
        s.state.player.backpack = { stone: 3 };
        send(s, { type: 'fight', target: 'rat1' });
        expect(s.state.player.trip).toEqual({ fight: 'rat1' });
        if (tap) { send(s, { type: 'visit', id: 'chest' }); expect(s.state.player.trip).toEqual({ fight: 'rat1', store: true }); }
        runUntil(s, () => of(s, 'tookFood').length > 0, 60);
        expect(dist(whereAt(s, 'tookFood')!.pos, doorOf(sh)), `tap ${tap}`).toBeLessThanOrEqual(DOOR.near);
        expect(s.state.player.backpack.cooked_fish, `tap ${tap}`).toBeGreaterThan(0);
        expect(s.state.bank.stone ?? 0, `tap ${tap}`).toBe(tap ? 3 : 0);
        runUntil(s, () => s.state.player.task.kind === 'fight', 120);
        expect(s.state.player.task, `tap ${tap}`).toMatchObject({ kind: 'fight' });
      }
    });

    it('T8.4: hungry with nothing on him, he walks to the door for a meal from the chest, takes a few along and goes back', () => {
      const s = camp(sh);
      s.state.bank.cooked_fish = 8;
      send(s, { type: 'work', nodeId: 'camp_copper1' });
      runUntil(s, () => s.state.player.task.kind === 'gather', 60);
      s.state.needs.fullness = HUNGER.hungry - 0.01;
      runUntil(s, () => of(s, 'meal').length > 0, 120);
      expect(of(s, 'mealOff')).toHaveLength(1);
      expect(dist(whereAt(s, 'meal')!.pos, doorOf(sh))).toBeLessThanOrEqual(DOOR.near);
      expect(s.state.needs.fullness).toBeGreaterThan(HUNGER.hungry);
      expect(s.state.player.backpack.cooked_fish ?? 0).toBeLessThanOrEqual(KEEP_FOOD);
      runUntil(s, () => s.state.player.task.kind === 'gather', 120);
      expect(s.state.player.task).toMatchObject({ kind: 'gather', nodeId: 'camp_copper1' });
    });

    it('T8.4: his tools are kept in the chest: sent to work, he fetches the one he needs at the door, and leaves the others there', () => {
      const s = camp(sh);
      s.state.toolsInChest = ['axe', 'pick', 'rod'];
      send(s, { type: 'work', nodeId: 'camp_copper1' });
      expect(of(s, 'fetchTool')).toEqual([{ type: 'fetchTool', tool: 'pick' }]);
      runUntil(s, () => s.state.player.task.kind === 'gather', 120);
      expect(dist(whereAt(s, 'visited', 'chest')!.pos, doorOf(sh))).toBeLessThanOrEqual(DOOR.near);
      expect(s.state.toolsInChest).toEqual(['axe', 'rod']);
      // at the door he is beside the chest: a tool is taken out there at once, with no walk
      s.state.player.pos = { ...doorOf(sh) }; s.state.player.path = []; s.state.player.pending = null; s.state.player.task = { kind: 'idle' };
      expect(besideChest(s.state, CAMP)).toBe(true);
      send(s, { type: 'work', nodeId: 'camp_birch1' });
      expect(s.state.toolsInChest).toEqual(['pick', 'rod']);
      expect(s.state.player.pending).toEqual({ kind: 'node', id: 'camp_birch1' });
    });
  });
});

describe('building the chest from the door (D3, T8.6)', () => {
  /** How far the door is from the chest's box, with `sh` standing. */
  function doorToChest(sh: Shelter): number {
    const state = createState(CAMP);
    state.built = [...sh.built, 'chest']; state.underway = { ...sh.underway };
    const place = chestPlace(state, CAMP)!, [x0, x1, z0, z1] = (SHAPES.chest!.blocks[0] as { box: readonly number[] }).box as [number, number, number, number];
    const [x, z] = toStep(place, shelterDoor(state, CAMP)!);
    return Math.hypot(Math.max(0, x0 - x, x - x1), Math.max(0, z0 - z, z - z1));
  }

  it('its goal comes with the tent standing: he walks to the tent\'s door, faces the chest, and builds it there, within his mallet\'s reach', () => {
    const s = setup();
    const i = GOALS.findIndex(g => g.makes === 'chest');
    s.state.goalsDone = GOALS.slice(0, i).map(g => g.id);
    s.state.built = ['campfire', 'woodpile', 'shelter'];
    s.state.tools = { axe: true, pick: true, rod: false };
    s.state.time = at(1, 9);
    s.state.player.pos = { x: 3, z: -1 };
    s.state.player.backpack = { ...MAKES.chest.needs };
    // only a shelter that stands takes a chest (StagedDef.inside), and the upgrades come only after it (D4): so it is
    // always built in the tent
    expect(stagedDef('chest')?.inside).toBe('tent');
    send(s, { type: 'build', id: 'chest' });
    expect(s.state.underway).toEqual({ chest: 0 });
    runUntil(s, () => s.state.player.task.kind === 'raise', 60);
    // facing the point on it his strikes are aimed at (its right end, where his head stays outside the tent: SHAPES' aim)
    const door = standsOf(CAMP, 'shelter')[0]!, place = chestPlace(s.state, CAMP)!, chest = toGround(place, SHAPES.chest!.aim!), p = s.state.player;
    expect(dist(chest, place.pos)).toBeLessThan(0.45);
    expect(dist(p.pos, door)).toBeLessThan(0.1);
    expect(buildSpot(s.state, CAMP, 'chest')).toMatchObject({ stands: [door], face: chest });
    run(s, 1);
    expect(turn(p.heading, headingOf({ x: chest.x - p.pos.x, z: chest.z - p.pos.z }))).toBeLessThan(0.02);
    // (a little back from the tent's open front, under its rolled-back end: his swing, coming down a little beyond his
    // reach, lands on its lid all the same, tests/campmodels.test.ts)
    expect(doorToChest(SHELTERED[0]!)).toBeLessThanOrEqual(CARPENTRY.reach + 0.1);
    runUntil(s, () => s.state.built.includes('chest'), MAKES.chest.time + 5);
    expect(chestHere(s.state, CAMP)).toBe(true);
    expect(dist(s.state.player.pos, door)).toBeLessThan(0.1);
  });

  it('at every shelter it sits on the floor or the porch, by the door: inside its footprint, its front at the front of it, in reach from the door', () => {
    for (const sh of SHELTERED) {
      const state = createState(CAMP);
      state.built = [...sh.built, 'chest']; state.underway = { ...sh.underway };
      const place = chestPlace(state, CAMP)!, shown = sh.underway.wall_tent && sh.underway.wall_tent >= MAKES.wall_tent.time * 2 / 3 ? 'wall_tent'
        : sh.underway.log_cabin !== undefined ? 'wall_tent' : sh.built.at(-1)!;
      // in the shelter drawn there (a new one from half built on), at its `chest`
      expect(place.pos, sh.name).toEqual(toGround(stepPlace(CAMP, shown)!, SHAPES[shown]!.chest!));
      const box = (SHAPES.chest!.blocks[0] as { box: readonly number[] }).box;
      const corners = [[box[0]!, box[2]!], [box[1]!, box[2]!], [box[0]!, box[3]!], [box[1]!, box[3]!]].map(([x, z]) => toGround(place, [x!, z!]));
      for (const c of corners) expect(outsideOf(CAMP, shown, c), `${sh.name}: inside ${shown}`).toBeLessThanOrEqual(1e-6);
      // in reach from the door: as far as his mallet reaches, and a little more where a porch roof reaches out past
      // the floor the chest stands on (the log cabin's, 0.17 m). While a new shelter is at its footings or its frame,
      // the chest is still in the old one, the new one's footings between it and the door that has moved out in front
      // of them (D6: the old one is drawn until the new one is half built)
      expect(doorToChest(sh), sh.name).toBeLessThanOrEqual(shown === outerOf(sh) ? CARPENTRY.reach + 0.2 : 1.25);
    }
  });
});

describe('the words: the chest is in the shelter (T8.7)', () => {
  it('no data says the chest is beside the shelter; its goal, its Making page and its thought say in the shelter', () => {
    const dir = new URL('../src/data/', import.meta.url), wrong: string[] = [];
    for (const f of readdirSync(dir).filter(n => n.endsWith('.ts') && n !== 'changelog.ts')) {
      const text = readFileSync(new URL(f, dir), 'utf8');
      for (const m of text.matchAll(/'[^'\n]*'|"[^"\n]*"|`[^`\n]*`/g)) {
        if (/chest/i.test(m[0]) && /\b(beside|by|next to) the (shelter|tent)\b/i.test(m[0])) wrong.push(`${f}: ${m[0]}`);
      }
    }
    expect(wrong).toEqual([]);
    const goal = GOALS.find(g => g.makes === 'chest')!;
    expect(goal.page).toMatch(/in the shelter/);
    expect(goal.ready).toMatch(/in the shelter/);
    expect(MAKE_WHERE.chest).toMatch(/inside the shelter/);
    expect(MAKE_NOTES.chest).toMatch(/in the shelter/);
    expect(THOUGHTS.find(t => t.id === 'goal:chest')!.text).toMatch(/in the shelter/);
    expect(MAKES.chest.done).toMatch(/inside the tent/);
    const state = createState(CAMP);
    state.goalsDone = GOALS.map(g => g.id); state.built = ['campfire', 'shelter', 'chest']; state.thoughts.known = ['make:chest'];
    expect(survivalPages(state).find(p => p.key === 'make:chest')?.where).toBe(MAKE_WHERE.chest);
  });
});

describe('Store everything (D22, T8.8)', () => {
  it('sends him to the chest while he carries anything, at a camp with the chest in its shelter; hidden otherwise', () => {
    const s = camp(SHELTERED[0]!);
    expect(storeAll(s.state, CAMP)).toBeNull();                       // nothing on him
    s.state.player.backpack = { cooked_fish: 2, berries: 3 };
    expect(storeAll(s.state, CAMP)).toBeNull();                       // only the few meals he keeps on him anyway
    s.state.player.backpack = { cooked_fish: KEEP_FOOD + 1 };
    expect(storeAll(s.state, CAMP)).toEqual({ type: 'visit', id: 'chest' });
    s.state.player.backpack = { stone: 4, cooked_fish: 2 };
    expect(storeAll(s.state, CAMP)).toEqual({ type: 'visit', id: 'chest' });
    const before = createState(CAMP);
    before.player.backpack = { stone: 4 }; before.built = ['campfire', 'shelter'];
    expect(storeAll(before, CAMP)).toBeNull();                         // no chest yet
    const village = createState(VILLAGE);
    village.player.backpack = { stone: 4 };
    expect(storeAll(village, VILLAGE)).toBeNull();                     // the village's bank is a building to tap
    // sent, he walks to the door and puts it all away, a few meals staying on him as on any trip there
    send(s, storeAll(s.state, CAMP)!);
    runUntil(s, () => of(s, 'banked').length > 0, 60);
    expect(of(s, 'banked')).toEqual([{ type: 'banked', items: { stone: 4 } }]);
    expect(s.state.player.backpack).toEqual({ cooked_fish: 2 });
    expect(dist(s.state.player.pos, doorOf(SHELTERED[0]!))).toBeLessThanOrEqual(DOOR.near);
  });

  it('is a button in the Backpack window\'s Chest section', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html).toMatch(/id="bankRow"[^]*?<button type="button" class="btn store-all" id="storeAll" hidden>Store everything<\/button>/);
  });
});

describe('sleeping in each shelter (T6.3)', () => {
  for (const sh of SHELTERED) {
    it(`with ${sh.name}: at his bedtime he goes in at the door and sleeps until his waking hour, then goes back to what he was doing`, () => {
      const s = camp(sh, SLEEP.bedtime + 24 - 0.3);
      s.state.stokedNight = Math.floor(s.state.time / DAY_SECONDS - STOKE.at);     // the fire seen to tonight
      const building = Object.keys(sh.underway)[0] as MakeId | undefined;
      if (building) send(s, { type: 'build', id: building });
      else send(s, { type: 'work', nodeId: 'camp_copper1' });
      runUntil(s, () => s.state.player.task.kind === 'sleep', 120);
      expect(of(s, 'bedtime')).toHaveLength(1);
      expect(s.state.player.task.kind).toBe('sleep');
      expect(dist(s.state.player.pos, doorOf(sh))).toBeLessThanOrEqual(DOOR.near);
      // he sleeps in the best shelter that stands: a new one only once it is built
      const best = [...SHELTERS].reverse().find(id => sh.built.includes(id))!;
      runUntil(s, () => of(s, 'awake').length > 0, DAY_SECONDS);
      expect(restedFactor(s.state)).toBeCloseTo(1 + (STAGED[best]?.rest ?? SLEEP.bonus), 9);
      runUntil(s, () => s.state.player.task.kind === (building ? 'raise' : 'gather'), 120);
      expect(s.state.player.task).toMatchObject(building ? { kind: 'raise', id: building } : { kind: 'gather', nodeId: 'camp_copper1' });
    });
  }

  it('knocked out, he wakes at the door of whichever shelter stands, on open ground, facing the fire', () => {
    for (const sh of SHELTERED) {
      const s = camp(sh);
      knockOut(s.state, 'rat1', s.events);
      const w = wakeSpot(s.state, CAMP);
      expect(dist(w.pos, doorOf(sh)), sh.name).toBeLessThan(0.3);
      expect(walkGrid(s.state, CAMP).walkable(w.pos), sh.name).toBe(true);
      const fire = CAMP.hearth.pos;
      expect(turn(w.heading, headingOf({ x: fire.x - w.pos.x, z: fire.z - w.pos.z })), sh.name).toBeLessThan(1e-6);
    }
  });
});

describe('the stone hearth and the woodshed (T7.1 to T7.3)', () => {
  const HEARTH_UP: MakeId[] = ['campfire', 'stone_hearth', 'woodpile', 'dummy'];
  const SHED_UP: MakeId[] = ['campfire', 'woodpile', 'woodshed', 'dummy'];
  const atStand = (id: MakeId, p: Vec2) => standsOf(CAMP, id).some(q => dist(q, p) < 0.1);

  it('the fire is used from the stone hearth\'s own stands from its footings on, and the firewood from the woodshed\'s', () => {
    const s = camp(SHELTERED[0]!);
    expect(useSpot(s.state, CAMP, 'campfire')).toMatchObject({ stands: [], ring: { pos: CAMP.hearth.pos } });
    expect(useSpot(s.state, CAMP, 'woodpile')!.stands).toEqual(standsOf(CAMP, 'woodpile'));
    s.state.underway = { stone_hearth: 0 };
    expect(useSpot(s.state, CAMP, 'campfire')!.stands).toEqual(standsOf(CAMP, 'stone_hearth'));
    s.state.underway = { woodshed: 0 };
    expect(useSpot(s.state, CAMP, 'woodpile')!.stands).toEqual(standsOf(CAMP, 'woodshed'));
    s.state.underway = {}; s.state.built.push('stone_hearth', 'woodshed');
    expect(useSpot(s.state, CAMP, 'campfire')!.stands).toEqual(standsOf(CAMP, 'stone_hearth'));
    expect(useSpot(s.state, CAMP, 'woodpile')!.stands).toEqual(standsOf(CAMP, 'woodshed'));
    // nothing for what isn't built
    expect(useSpot(createState(CAMP), CAMP, 'campfire')).toBeNull();
    expect(useSpot(createState(CAMP), CAMP, 'chest')).toBeNull();
    expect(useSpot(createState(CAMP), CAMP, 'shelter')).toBeNull();
  });

  it('T7.1: at the stone hearth he cooks as at the campfire (fish from the chest, XP, the same burn chance), and stokes it at nightfall, from its stands', () => {
    const s = camp(SHELTERED[0]!, 9, HEARTH_UP);
    s.state.bank[COOK.raw] = 4;
    send(s, { type: 'cook' });
    runUntil(s, () => of(s, 'cooked').length >= 4, 240);
    expect(of(s, 'cooked')).toHaveLength(4);
    expect(atStand('stone_hearth', whereAt(s, 'visited', 'campfire')!.pos)).toBe(true);
    const good = of(s, 'cooked').filter(e => !e.burnt).length;
    expect(s.state.skills.cooking).toBe(good * COOK.xp);
    // at nightfall: logs from the pile, stoked from a stand of the hearth
    s.state.time = at(1, NIGHTFALL) - 0.05; s.state.woodpile = 10;
    runUntil(s, () => of(s, 'stoked').length > 0, 120);
    expect(atStand('stone_hearth', s.where.filter(w => w.e.type === 'visited' && w.e.id === 'campfire').at(-1)!.pos)).toBe(true);
    expect(s.state.woodpile).toBe(10 - STOKE.logs);
    expect(isNight(s.state.time)).toBe(true);
  });

  it('T7.2: while the stone hearth goes up he stokes the fire and cooks at it from the hearth\'s stands, and comes back to the build after each', () => {
    const s = camp(SHELTERED[0]!, NIGHTFALL - 1);
    s.state.bank = { ...s.state.bank, stone: 12, clay: 4 };
    s.state.woodpile = 10;
    send(s, { type: 'build', id: 'stone_hearth' });
    runUntil(s, () => of(s, 'stoked').length > 0, 120);
    expect(of(s, 'stokeOff')).toHaveLength(1);
    expect(atStand('stone_hearth', s.where.filter(w => w.e.type === 'visited' && w.e.id === 'campfire').at(-1)!.pos)).toBe(true);
    runUntil(s, () => s.state.player.task.kind === 'raise', 30);
    expect(s.state.player.task).toEqual({ kind: 'raise', id: 'stone_hearth' });
    // cooking meanwhile: at the hearth's stand, then back to building
    s.state.player.backpack[COOK.raw] = 2;
    send(s, { type: 'cook' });
    runUntil(s, () => of(s, 'cookedAll').length > 0, 120);
    expect(of(s, 'cooked')).toHaveLength(2);
    expect(atStand('stone_hearth', s.where.filter(w => w.e.type === 'visited' && w.e.id === 'campfire').at(-1)!.pos)).toBe(true);
    runUntil(s, () => s.state.player.task.kind === 'raise', 30);
    expect(s.state.player.task).toEqual({ kind: 'raise', id: 'stone_hearth' });
    expect(walkGrid(s.state, CAMP).walkable(s.state.player.pos)).toBe(true);
  });

  it('T7.3: the woodshed keeps the pile\'s logs, is stacked from its stands up to WOODPILE.max, and is stoked from first', () => {
    const s = camp(SHELTERED[0]!);
    s.state.woodpile = 12;
    s.state.bank = { ...s.state.bank, birch_logs: 10, bark: 6 };
    send(s, { type: 'build', id: 'woodshed' });
    runUntil(s, () => s.state.built.includes('woodshed'), MAKES.woodshed.time + 30);
    expect(s.state.built).toContain('woodshed');
    expect(s.state.woodpile).toBe(12);                                   // its own logs aren't stacked in it
    // a tap on it stacks the logs he carries, up to what it holds, from one of its stands
    s.state.player.backpack = { birch_logs: 25 };
    send(s, { type: 'visit', id: 'woodpile' });
    runUntil(s, () => of(s, 'stacked').length > 0, 60);
    expect(of(s, 'stacked')).toEqual([{ type: 'stacked', logs: WOODPILE.max - 12, pile: WOODPILE.max, at: 'woodshed' }]);
    expect(atStand('woodshed', whereAt(s, 'stacked')!.pos)).toBe(true);
    expect(s.state.player.backpack).toEqual({ birch_logs: 25 - (WOODPILE.max - 12) });
    send(s, { type: 'visit', id: 'woodpile' });
    runUntil(s, () => of(s, 'stacked').length > 1, 60);
    expect(of(s, 'stacked')[1]).toEqual({ type: 'stacked', logs: 0, pile: WOODPILE.max, at: 'woodshed', reason: 'full' });
    // told as the woodshed, which stands there now
    expect(stackedText(of(s, 'stacked')[0]!)).toBe(`Stacked ${WOODPILE.max - 12} birch logs in the woodshed (${WOODPILE.max} there now).`);
    expect(stackedText(of(s, 'stacked')[1]!)).toBe('The woodshed is full.');
    expect(stackedText({ type: 'stacked', logs: 0, pile: 3, at: 'woodshed', reason: 'none' })).toBe('You have no logs to stack in the woodshed.');
    expect(stackedText({ type: 'stacked', logs: 5, pile: 9, at: 'woodpile' })).toBe('Stacked 5 birch logs on the firewood pile (9 there now).');
    expect(stackedText({ type: 'stacked', logs: 0, pile: 30, at: 'woodpile', reason: 'full' })).toBe('The firewood pile is full.');
    expect(stackedText({ type: 'stacked', logs: 0, pile: 3, at: 'woodpile', reason: 'none' })).toBe('You have no logs to stack on the firewood pile.');
    // at nightfall the logs come from it first, though the chest has some
    s.state.bank.birch_logs = 5;
    s.state.time = at(1, NIGHTFALL) - 0.05;
    runUntil(s, () => of(s, 'stoked').length > 0, 120);
    expect(s.state.woodpile).toBe(WOODPILE.max - STOKE.logs);
    expect(s.state.bank.birch_logs).toBe(5);
    expect(atStand('woodshed', s.where.filter(w => w.e.type === 'visited' && w.e.id === 'woodpile').at(-1)!.pos)).toBe(true);
  });

  it('T7.3: a full firewood pile when the woodshed is begun and built: every log kept, none taken for the shed (stage 6 edge case)', () => {
    const s = camp(SHELTERED[0]!);
    s.state.woodpile = WOODPILE.max;
    s.state.bank = { ...s.state.bank, birch_logs: 10, bark: 6 };
    const logs = () => s.state.woodpile + (s.state.bank.birch_logs ?? 0) + (s.state.player.backpack.birch_logs ?? 0);
    send(s, { type: 'build', id: 'woodshed' });
    expect(s.state.underway.woodshed).toBe(0);
    expect(s.state.woodpile).toBe(WOODPILE.max);                      // what the shed needs came from the chest
    expect(s.state.bank.birch_logs ?? 0).toBe(0);
    const before = logs();
    runUntil(s, () => s.state.built.includes('woodshed'), MAKES.woodshed.time + 30);
    expect(s.state.built).toContain('woodshed');
    expect(s.state.woodpile).toBe(WOODPILE.max);
    expect(logs()).toBe(before);
  });

  it('T7.3: while the woodshed goes up, the pile is stacked and stoked from from the woodshed\'s stands, and he comes back to the build', () => {
    const s = camp(SHELTERED[0]!, NIGHTFALL - 1, ['campfire', 'woodpile', 'dummy']);
    s.state.woodpile = 6;
    s.state.bank = { ...s.state.bank, birch_logs: 10, bark: 6 };
    send(s, { type: 'build', id: 'woodshed' });
    runUntil(s, () => of(s, 'stoked').length > 0, 120);
    expect(atStand('woodshed', s.where.filter(w => w.e.type === 'visited' && w.e.id === 'woodpile').at(-1)!.pos)).toBe(true);
    expect(s.state.woodpile).toBe(6 - STOKE.logs);
    runUntil(s, () => s.state.player.task.kind === 'raise', 30);
    expect(s.state.player.task).toEqual({ kind: 'raise', id: 'woodshed' });
    s.state.player.backpack = { birch_logs: 4 };
    send(s, { type: 'visit', id: 'woodpile' });
    runUntil(s, () => of(s, 'stacked').length > 0, 60);
    expect(of(s, 'stacked')).toEqual([{ type: 'stacked', logs: 4, pile: 6 - STOKE.logs + 4, at: 'woodpile' }]);
    expect(atStand('woodshed', whereAt(s, 'stacked')!.pos)).toBe(true);
    runUntil(s, () => s.state.player.task.kind === 'raise', 30);
    expect(s.state.player.task).toEqual({ kind: 'raise', id: 'woodshed' });
  });
});

describe('he builds everything from its own stands (work points at bigger buildings)', () => {
  it("each thing built at the camp's spots: at one of the stands he builds it from (its own, SHAPES' builds, where at its stands his mallet would land on nothing of it: the woodshed, the log cabin), or round it for something round, on open ground, facing it", () => {
    const ids = Object.values(LINES).flat();
    for (const id of ids) {
      const s = camp(SHELTERED[0]!, 9, []);
      // what it upgrades stands; it is begun
      const line = Object.values(LINES).find(l => l.includes(id))!;
      s.state.built = [...line.slice(0, line.indexOf(id)), ...(line.includes('shelter') ? (id === 'shelter' ? [] : ['chest' as MakeId]) : ['shelter', 'chest'] as MakeId[])];
      s.state.underway = { [id]: 0 };
      s.state.player.pos = { x: 3, z: -1 };
      send(s, { type: 'build', id });
      runUntil(s, () => s.state.player.task.kind === 'raise', 90);
      expect(s.state.player.task, id).toEqual({ kind: 'raise', id });
      const spot = buildSpot(s.state, CAMP, id)!, p = s.state.player.pos;
      expect(atSpot(spot, p), `${id} at ${p.x.toFixed(2)},${p.z.toFixed(2)}`).toBe(true);
      if (shapeOf(id)!.stands) expect(buildStandsOf(CAMP, id).some(q => dist(q, p) < 0.1), id).toBe(true);
      expect(walkGrid(s.state, CAMP).walkable(p), id).toBe(true);
      run(s, 1);
      const middle = stepPlace(CAMP, id)!.pos;
      expect(turn(s.state.player.heading, headingOf({ x: middle.x - p.x, z: middle.z - p.z })), id).toBeLessThan(0.02);
    }
  });
});
