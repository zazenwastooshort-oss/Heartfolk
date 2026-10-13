// Cooking at the campfire (chapter 2, food; systems/cooking.ts, numbers in data/cooking.ts): a tap on the built
// campfire with raw fish sets him cooking them one after another, each cooked (Cooking XP) or now and then burnt, less
// often as his level rises; with none in his backpack he fetches them from the chest first. Stoking the fire at
// nightfall interrupts it and he goes back to it. Saves (format 10, unreleased) carry it, an old 0.0.21 save loads, and
// away time cooks too. The village has no campfire to cook at.
import { describe, expect, it } from 'vitest';
import { createState, currentGoal, maxHealth, SAVE_VERSION, type GameState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS } from '../src/core/clock';
import { deserialize, readSave, serialize } from '../src/core/save';
import { catchUpAway, step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, type Layout, type Vec2 } from '../src/world/layout';
import { navFor } from '../src/world/nav';
import { applyCommands, type Command } from '../src/systems/commands';
import { backpackCount } from '../src/systems/backpack';
import { GOALS } from '../src/data/goals';
import { COOK, burnChance } from '../src/data/cooking';
import { DOOR } from '../src/data/building';
import { standsOf } from '../src/world/steps';
import { STOKE } from '../src/data/fire';
import { BACKPACK_SLOTS } from '../src/data/hauling';
import { XP_TABLE } from '../src/data/xp';
import { awayText } from '../src/ui/away';

/** The fire, and the shelter's door (the tent's), where the chest in it is used since the camp build. */
const FIRE = CAMP.hearth.pos, CHEST = standsOf(CAMP, 'shelter')[0]!;
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const at = (day: number, hour: number) => (day + hour / 24) * DAY_SECONDS;
const NIGHTFALL = STOKE.at * 24;
const NOW = Date.UTC(2026, 9, 12, 9, 0, 0);

function setup(layout: Layout = CAMP, seed = 13) {
  const state = createState(layout, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, layout, ctx: { layout, rng: createRng(seed), events } };
}
type Setup = ReturnType<typeof setup>;
/** A camp game whose current goal is `goal`: every goal before it done, the first chapter's things standing, his tools
 *  (and the rod once its goal is done), early in the morning so no night falls in a test unless it says so. */
function campAt(goal: string, { chest = true, seed = 13 } = {}): Setup {
  const s = setup(CAMP, seed), i = GOALS.findIndex(g => g.id === goal);
  s.state.goalsDone = GOALS.slice(0, i).map(g => g.id);
  s.state.built = chest ? ['campfire', 'woodpile', 'shelter', 'chest'] : ['campfire', 'woodpile', 'shelter'];
  s.state.tools = { ...s.state.tools, axe: true, pick: true, rod: s.state.goalsDone.includes('rod') };
  s.state.hasBook = true;
  s.state.time = at(1, 6.5);
  s.state.player.pos = { x: -2, z: 1 };
  return s;
}
const send = (s: Setup, c: Command) => applyCommands(s.state, s.layout, [c], s.events);
const runUntil = (s: Setup, done: () => boolean, max: number) => { for (let t = 0; t < max && !done(); t += STEP) step(s.state, STEP, s.ctx); };
const run = (s: Setup, seconds: number) => runUntil(s, () => false, seconds);
const count = (s: Setup, type: GameEvent['type']) => s.log.filter(e => e.type === type).length;
const cooked = (s: Setup) => s.log.filter((e): e is Extract<GameEvent, { type: 'cooked' }> => e.type === 'cooked');
const has = (state: GameState, item: string) => (state.player.backpack[item] ?? 0) + (state.bank[item] ?? 0);

describe('the chance a fish burns', () => {
  it('is now and then at first, less as his Cooking level rises, and none from level ' + COOK.safe, () => {
    expect(burnChance(1)).toBeCloseTo(COOK.burn);
    expect(COOK.burn).toBeGreaterThan(0.1);
    expect(COOK.burn).toBeLessThan(0.5);
    for (let l = 1; l < COOK.safe; l++) expect(burnChance(l + 1), `level ${l + 1}`).toBeLessThan(burnChance(l));
    for (const l of [COOK.safe, COOK.safe + 1, 50, 99]) expect(burnChance(l)).toBe(0);
  });

  it('burns fewer of many fish at a higher level', () => {
    const burnt = (xp: number) => {
      const s = campAt('meal');
      s.state.skills.cooking = xp;
      s.state.player.backpack = { raw_fish: 25 };
      send(s, { type: 'cook' });
      runUntil(s, () => count(s, 'cookedAll') > 0, 200);
      expect(cooked(s)).toHaveLength(25);
      return cooked(s).filter(e => e.burnt).length;
    };
    const low = burnt(0), mid = burnt(XP_TABLE[15]!), high = burnt(XP_TABLE[COOK.safe]!);
    expect(low).toBeGreaterThan(0);
    expect(mid).toBeLessThan(low);
    expect(high).toBe(0);
  });
});

describe('cooking at the campfire', () => {
  it('with no raw fish in his backpack or the chest, a tap on the fire says so and he stays put', () => {
    const s = campAt('meal'), start = { ...s.state.player.pos };
    s.state.player.backpack = { berries: 3, cooked_fish: 1 };
    s.state.bank = { birch_logs: 4 };
    send(s, { type: 'cook' });
    expect(s.log.at(-1)).toEqual({ type: 'cantCook' });
    run(s, 3);
    expect(s.state.player.pos).toEqual(start);
    expect(s.state.player.cook).toBeNull();
    // no campfire yet: nothing to cook at, nothing happens; nor in the village
    const bare = campAt('meal');
    bare.state.built = ['shelter', 'chest']; bare.state.player.backpack = { raw_fish: 2 };
    send(bare, { type: 'cook' });
    expect(bare.log).toEqual([]);
    const v = setup(VILLAGE);
    v.state.player.backpack = { raw_fish: 2 };
    send(v, { type: 'cook' });
    run(v, 3);
    expect(v.log.filter(e => e.type !== 'arrived')).toEqual([]);
    expect(v.state.player.backpack).toEqual({ raw_fish: 2 });
  });

  it('before he owns a rod, a tap on the fire with no raw fish only walks him beside it, with no notice', () => {
    const s = campAt('rod');
    expect(s.state.tools.rod).toBe(false);
    s.state.player.backpack = { berries: 3 };
    send(s, { type: 'cook' });
    expect(s.state.player.pending).toEqual({ kind: 'visit', id: 'campfire' });
    expect(s.state.player.cook).toBeNull();
    runUntil(s, () => s.state.player.task.kind === 'idle' && !s.state.player.pending, 30);
    expect(dist(s.state.player.pos, FIRE)).toBeLessThan(CAMP.hearth.radius + 1);
    expect(s.log.filter(e => e.type !== 'arrived' && e.type !== 'visited')).toEqual([]);
    expect(s.state.player.backpack).toEqual({ berries: 3 });
    // once he owns one, the same tap says there is nothing to cook, and he stays put
    s.state.tools.rod = true;
    send(s, { type: 'cook' });
    expect(s.log.at(-1)).toEqual({ type: 'cantCook' });
    expect(s.state.player.pending).toBeNull();
  });

  it('cooks the raw fish he carries one after another at the fire, cooked or burnt, XP for the cooked, then stops', () => {
    const s = campAt('meal');
    s.state.player.backpack = { raw_fish: 6, berries: 2 };
    send(s, { type: 'cook' });
    expect(s.state.player.pending).toEqual({ kind: 'visit', id: 'campfire' });
    expect(s.state.player.cook).toEqual({ fetch: false });
    runUntil(s, () => s.state.player.task.kind === 'cook', 60);
    expect(dist(s.state.player.pos, FIRE)).toBeLessThan(CAMP.hearth.radius + 1);
    const started = s.state.time;
    runUntil(s, () => cooked(s).length === 1, 10);
    expect(s.state.time - started).toBeCloseTo(COOK.time, 1);
    runUntil(s, () => count(s, 'cookedAll') > 0, 60);
    expect(s.state.time - started).toBeCloseTo(6 * COOK.time, 0);
    const out = cooked(s), good = out.filter(e => !e.burnt).length;
    expect(out).toHaveLength(6);
    expect(s.state.player.backpack).toEqual({ berries: 2, ...(good ? { cooked_fish: good } : {}), ...(good < 6 ? { burnt_fish: 6 - good } : {}) });
    expect(s.state.skills.cooking).toBe(good * COOK.xp);
    expect(s.state.player.cook).toBeNull();
    expect(s.state.player.task.kind).toBe('idle');
    expect(navFor(CAMP, s.state.built).walkable(s.state.player.pos)).toBe(true);
  });

  it('with none in his backpack, he fetches the raw fish from the chest first, keeping his own food with him', () => {
    const s = campAt('meal');
    s.state.player.backpack = { cooked_fish: 2, berries: 3 };
    s.state.bank = { raw_fish: 5, birch_logs: 6 };
    send(s, { type: 'cook' });
    expect(s.state.player.pending).toEqual({ kind: 'visit', id: 'chest' });
    expect(s.state.player.cook).toEqual({ fetch: true });
    runUntil(s, () => s.state.player.cook?.fetch === false, 60);
    expect(dist(s.state.player.pos, CHEST)).toBeLessThanOrEqual(DOOR.near);
    expect(s.state.bank).toEqual({ birch_logs: 6 });                           // the fish taken, the logs left
    expect(s.state.player.backpack).toEqual({ cooked_fish: 2, berries: 3, raw_fish: 5 });
    expect(count(s, 'banked')).toBe(0);
    expect(s.state.player.pending).toEqual({ kind: 'visit', id: 'campfire' });
    runUntil(s, () => count(s, 'cookedAll') > 0, 60);
    expect(cooked(s)).toHaveLength(5);
    expect(has(s.state, 'raw_fish')).toBe(0);
    expect(has(s.state, 'cooked_fish') + has(s.state, 'burnt_fish')).toBe(7);
  });

  it('more fish in the chest than his backpack holds: he takes what fits, a full backpack emptied first, and goes back for the rest', () => {
    const s = campAt('meal');
    s.state.player.backpack = { stone: BACKPACK_SLOTS };
    s.state.bank = { raw_fish: BACKPACK_SLOTS + 4 };
    send(s, { type: 'cook' });
    runUntil(s, () => s.state.player.cook?.fetch === false, 60);
    expect(count(s, 'banked')).toBe(1);                                        // room made first
    expect(s.state.player.backpack).toEqual({ raw_fish: BACKPACK_SLOTS });
    expect(s.state.bank).toEqual({ stone: BACKPACK_SLOTS, raw_fish: 4 });
    runUntil(s, () => count(s, 'cookedAll') > 0, 400);
    expect(cooked(s)).toHaveLength(BACKPACK_SLOTS + 4);
    expect(has(s.state, 'raw_fish')).toBe(0);
    expect(backpackCount(s.state)).toBeLessThanOrEqual(BACKPACK_SLOTS);
  });

  it('a command from the player stops it, the raw fish kept; a tap on the fire while he cooks changes nothing', () => {
    const s = campAt('meal');
    s.state.player.backpack = { raw_fish: 4 };
    send(s, { type: 'cook' });
    runUntil(s, () => cooked(s).length === 1, 60);
    const task = { ...s.state.player.task };
    send(s, { type: 'cook' });
    expect(s.state.player.task).toEqual(task);
    send(s, { type: 'walk', to: { x: 6, z: 6 } });
    expect(s.state.player.cook).toBeNull();
    run(s, 20);
    expect(cooked(s)).toHaveLength(1);
    expect(s.state.player.backpack.raw_fish).toBe(3);
    // eating and dropping don't stop it
    const t = campAt('meal');
    t.state.player.backpack = { raw_fish: 3, berries: 2, stone: 1 }; t.state.health = 5;
    send(t, { type: 'cook' });
    runUntil(t, () => t.state.player.task.kind === 'cook', 60);
    send(t, { type: 'eat', item: 'berries' });
    send(t, { type: 'drop', item: 'stone', count: 1 });
    runUntil(t, () => count(t, 'cookedAll') > 0, 60);
    expect(cooked(t)).toHaveLength(3);
  });

  it('nightfall while he cooks: he goes for logs, stokes the fire, and goes back to cooking until the fish are done', () => {
    const s = campAt('meal');
    s.state.woodpile = 6;
    s.state.player.backpack = { raw_fish: 8 };
    s.state.time = at(1, NIGHTFALL) - 8;
    send(s, { type: 'cook' });
    runUntil(s, () => count(s, 'stokeOff') > 0, 30);
    expect(s.state.player.stoke?.back).toEqual({ cook: true });
    expect(s.state.player.cook).toBeNull();
    const before = cooked(s).length;
    runUntil(s, () => count(s, 'stoked') > 0, 60);
    expect(cooked(s)).toHaveLength(before);                                    // none while he stoked
    runUntil(s, () => count(s, 'cookedAll') > 0, 60);
    expect(cooked(s)).toHaveLength(8);
    expect(count(s, 'stoked')).toBe(1);
    expect(s.state.woodpile).toBe(6 - STOKE.logs);
  });

  it('nightfall with him cooking right at the fire and the logs in his backpack: he stokes it there and cooks on', () => {
    const s = campAt('meal');
    s.state.built = ['campfire', 'shelter', 'chest'];                          // no pile, an empty chest
    s.state.player.backpack = { raw_fish: 6, birch_logs: 3 };
    s.state.time = at(1, NIGHTFALL) - 30;
    send(s, { type: 'cook' });
    runUntil(s, () => s.state.player.task.kind === 'cook', 30);
    const stand = { ...s.state.player.pos };
    runUntil(s, () => count(s, 'stoked') > 0, 60);
    expect(dist(s.state.player.pos, stand)).toBeLessThan(0.5);                 // stoked from where he stood
    expect(s.state.player.backpack.birch_logs ?? 0).toBe(0);
    runUntil(s, () => count(s, 'cookedAll') > 0, 60);
    expect(cooked(s)).toHaveLength(6);
    expect(count(s, 'stokeOff')).toBe(1);
  });

  it('nightfall on his way to the chest for raw fish, the pile empty: logs from the chest, his food kept, he stokes, then fetches and cooks', () => {
    const s = campAt('meal');
    s.state.woodpile = 0;                                                      // the pile empty, logs in the chest
    s.state.player.backpack = { berries: 4, cooked_fish: 2 };
    s.state.bank = { raw_fish: 4, birch_logs: 5 };
    s.state.time = at(1, NIGHTFALL) - 0.5;
    send(s, { type: 'cook' });
    expect(s.state.player.pending).toEqual({ kind: 'visit', id: 'chest' });
    runUntil(s, () => count(s, 'stokeOff') > 0, 5);
    expect(dist(s.state.player.pos, CHEST)).toBeGreaterThan(DOOR.near);   // still on his way
    // a fetch for cooking isn't a trip to store things: the backpack (not full) isn't emptied at the chest
    expect(s.state.player.stoke).toEqual({ back: { cook: true }, logs: 0, empty: false, from: 'chest' });
    runUntil(s, () => count(s, 'stoked') > 0, 120);
    expect(count(s, 'banked')).toBe(0);
    expect(s.state.player.backpack).toEqual({ berries: 4, cooked_fish: 2 });
    expect(s.state.bank).toEqual({ raw_fish: 4, birch_logs: 5 - STOKE.logs });
    // then back to the chest for the fish, and he cooks them all
    runUntil(s, () => count(s, 'cookedAll') > 0, 120);
    expect(cooked(s)).toHaveLength(4);
    const good = cooked(s).filter(e => !e.burnt).length;
    expect(s.state.player.backpack).toEqual({ berries: 4, cooked_fish: 2 + good, ...(good < 4 ? { burnt_fish: 4 - good } : {}) });
    expect(s.state.bank).toEqual({ birch_logs: 5 - STOKE.logs });
    expect(count(s, 'banked')).toBe(0);
    expect(count(s, 'stoked')).toBe(1);
  });

  it('cooking the meal: once 5 come out cooked the goal is done; burnt ones mean catching a few more', () => {
    const s = campAt('meal');
    expect(currentGoal(s.state).id).toBe('meal');
    expect(GOALS.find(g => g.id === 'meal')!.needs).toEqual({ cooked_fish: 5 });
    s.state.player.backpack = { raw_fish: 5 };
    send(s, { type: 'cook' });
    runUntil(s, () => count(s, 'cookedAll') > 0, 60);
    run(s, 0.1);
    const good = cooked(s).filter(e => !e.burnt).length;
    expect(s.state.goalsDone.includes('meal')).toBe(good >= 5);
    s.state.player.backpack.raw_fish = 10;
    send(s, { type: 'cook' });
    runUntil(s, () => count(s, 'cookedAll') > 1, 60);
    run(s, 0.1);
    expect(s.state.goalsDone).toContain('meal');
  });
});

describe('saving while cooking', () => {
  it('a save made mid-cooking, or on the way to the chest for fish, carries on after a reload', () => {
    const s = campAt('meal');
    s.state.player.backpack = { raw_fish: 4 };
    send(s, { type: 'cook' });
    runUntil(s, () => cooked(s).length === 1, 60);
    run(s, 1);
    const back = deserialize(serialize(s.state), CAMP);
    expect(back).toEqual(s.state);
    expect(back.player.task.kind).toBe('cook');
    const again = { ...setup(CAMP, 4), state: back };
    runUntil(again, () => count(again, 'cookedAll') > 0, 60);
    expect(cooked(again)).toHaveLength(3);
    // on the way to the chest
    const f = campAt('meal');
    f.state.bank = { raw_fish: 3 };
    send(f, { type: 'cook' });
    run(f, 0.5);
    const fetched = { ...setup(CAMP, 4), state: deserialize(serialize(f.state), CAMP) };
    expect(fetched.state.player.cook).toEqual({ fetch: true });
    runUntil(fetched, () => count(fetched, 'cookedAll') > 0, 90);
    expect(cooked(fetched)).toHaveLength(3);
  });

  it('cooking that makes no sense in a save (damaged, or no fire or chest) stops, and nothing is lost', () => {
    const base = () => {
      const s = campAt('meal');
      s.state.player.backpack = { raw_fish: 2 };
      send(s, { type: 'cook' });
      runUntil(s, () => s.state.player.task.kind === 'cook', 60);
      return JSON.parse(serialize(s.state));
    };
    const load = (raw: unknown) => deserialize(JSON.stringify(raw), CAMP);
    let raw = base(); raw.player.cook = 'yes';
    expect(load(raw).player).toMatchObject({ cook: null, task: { kind: 'idle' }, backpack: { raw_fish: 2 } });
    raw = base(); raw.player.task.doneAt = 'soon';
    expect(load(raw).player).toMatchObject({ cook: null, task: { kind: 'idle' } });
    raw = base(); raw.built = ['shelter', 'chest'];                            // no campfire
    expect(load(raw).player).toMatchObject({ cook: null, task: { kind: 'idle' } });
    raw = base(); raw.player.cook = { fetch: true };                           // fetching, but standing at the fire cooking
    expect(load(raw).player.cook).toBeNull();
    raw = base(); raw.player.task = { kind: 'idle' }; raw.player.cook = { fetch: true }; raw.player.pending = { kind: 'visit', id: 'chest' };
    raw.player.path = [{ ...CHEST }]; raw.built = ['campfire', 'shelter'];   // fetching from a chest not built
    expect(load(raw).player.cook).toBeNull();
    // stoking that goes back to cooking keeps that; with no campfire it goes back to nothing
    raw = base(); raw.player.cook = null; raw.player.task = { kind: 'walk' }; raw.player.pending = { kind: 'visit', id: 'woodpile' };
    raw.player.path = [{ x: 4.6, z: 3.4 }]; raw.woodpile = 5; raw.player.stoke = { back: { cook: true }, logs: 0, empty: false, from: 'woodpile' };
    expect(load(raw).player.stoke).toEqual({ back: { cook: true }, logs: 0, empty: false, from: 'woodpile' });
  });

  it('an old 0.0.21 save (format 9) loads: no rod, nothing cooking, every bush ripe, and on to chapter 2 once the camp is set up', () => {
    const s = campAt('berries');
    s.state.goalsDone = GOALS.slice(0, GOALS.findIndex(g => g.id === 'chest') + 1).map(g => g.id);
    // no logs stored, so whatever goal follows the chest, chopping goes on (a goal with enough logs would stop it)
    s.state.bank = { copper_ore: 2 };
    send(s, { type: 'work', nodeId: 'camp_birch2' });
    run(s, 20);
    const old = JSON.parse(serialize(s.state, NOW - 60 * 1000));
    old.version = 9; delete old.health; delete old.player.cook; delete old.tools.rod;
    old.skills = { mining: old.skills.mining, woodcutting: old.skills.woodcutting };
    old.nodes = Object.fromEntries(Object.entries(old.nodes).filter(([id]) => !id.startsWith('camp_fish')));
    const loaded = readSave(JSON.stringify(old), CAMP);
    expect(loaded.state.version).toBe(SAVE_VERSION);
    expect(loaded.state.tools).toEqual({ axe: true, pick: true, rod: false });
    expect(loaded.state.player.cook).toBeNull();
    expect(loaded.state.health).toBe(maxHealth(loaded.state));
    expect(Object.keys(loaded.state.nodes).filter(id => id.startsWith('camp_fish'))).toHaveLength(5);
    expect(Object.keys(loaded.state.taken).some(id => id.startsWith('bush'))).toBe(false);
    expect(loaded.state.player.task).toEqual(s.state.player.task);
    expect(currentGoal(loaded.state).id).toBe(GOALS[GOALS.findIndex(g => g.id === 'chest') + 1]!.id);
    // and it plays on, chopping, with away time caught up
    const r = catchUpAway(loaded.state, loaded.savedAt, NOW, { layout: CAMP, rng: createRng(2), events: new EventBus() });
    expect(r.summary.items.birch_logs ?? 0).toBeGreaterThan(0);
  });
});

describe('away time while cooking', () => {
  it('he cooks on while the game is closed, and the note says how many fish he cooked and burnt', () => {
    const s = campAt('meal');
    s.state.player.backpack = { raw_fish: 20 };
    send(s, { type: 'cook' });
    runUntil(s, () => s.state.player.task.kind === 'cook', 60);
    const loaded = readSave(serialize(s.state, NOW - 10 * 60 * 1000), CAMP);
    const r = catchUpAway(loaded.state, loaded.savedAt, NOW, { layout: CAMP, rng: createRng(8), events: new EventBus() });
    expect(r.summary.cooked).toBe(20);
    const burnt = r.summary.burnt ?? 0;
    expect(loaded.state.player.backpack.burnt_fish ?? 0).toBe(burnt);
    expect(loaded.state.player.backpack.cooked_fish).toBe(20 - burnt);
    expect(r.summary.xp.cooking).toBe((20 - burnt) * COOK.xp);
    const { lines } = awayText([r.away], r.summary);
    expect(lines).toContain(burnt ? `He cooked 20 fish, ${burnt} of them burnt.` : 'He cooked 20 fish.');
    expect(awayText([r.away], { ...r.summary, cooked: 1, burnt: 1 }).lines).toContain('He cooked a fish, but it burnt.');
    expect(awayText([r.away], { ...r.summary, cooked: 3, burnt: 0 }).lines).toContain('He cooked 3 fish.');
  });
});

describe('long run (headless)', () => {
  it('three days of berries, fishing and cooking round the camp, stoking every night, with nothing broken or stuck', () => {
    const s = campAt('meal', { seed: 21 }), pick = createRng(99), p = s.state.player;
    s.state.tools.rod = true; s.state.woodpile = 20; s.state.bank = { birch_logs: 30 };
    const nav = navFor(CAMP, s.state.built), spots = CAMP.nodes.filter(n => n.resource === 'fishing_spot');
    const bushes = CAMP.pickups!.filter(x => x.kind === 'bush');
    const orders: (() => Command)[] = [
      () => ({ type: 'pickup', id: bushes[Math.floor(pick.next() * bushes.length)]!.id }),
      () => ({ type: 'work', nodeId: spots[Math.floor(pick.next() * spots.length)]!.id }),
      () => ({ type: 'work', nodeId: spots[Math.floor(pick.next() * spots.length)]!.id }),
      () => ({ type: 'cook' }),
      () => ({ type: 'cook' }),
      () => ({ type: 'visit', id: 'chest' }),
      () => ({ type: 'eat', item: pick.next() < 0.5 ? 'berries' : 'cooked_fish' }),
      () => ({ type: 'walk', to: { x: -14 + pick.next() * 28, z: -11 + pick.next() * 24 } }),
    ];
    const start = s.state.time, days = 3;
    let busy = 0, steps = 0, nextOrder = start;
    while (s.state.time < start + days * DAY_SECONDS) {
      if (s.state.time >= nextOrder) { send(s, orders[Math.floor(pick.next() * orders.length)]!()); nextOrder = s.state.time + 40 + pick.next() * 120; }
      if (pick.next() < 0.0005) s.state.health = Math.max(1, s.state.health - 3);   // as if he got hurt now and then
      step(s.state, STEP, s.ctx);
      steps++;
      if (p.task.kind !== 'idle') busy++;
      if (steps % 30) continue;
      expect(Number.isFinite(p.pos.x) && Number.isFinite(p.pos.z)).toBe(true);
      expect(nav.walkable(p.pos), `${p.pos.x}, ${p.pos.z}`).toBe(true);
      expect(backpackCount(s.state)).toBeLessThanOrEqual(BACKPACK_SLOTS);
      // cooking is always going somewhere: at the fire cooking, or on the way to the chest or the fire, never with stoking
      if (p.cook) {
        expect(p.stoke).toBeNull();
        const to = p.pending?.kind === 'visit' ? p.pending.id : null;
        expect(p.task.kind === 'cook' || to === (p.cook.fetch ? 'chest' : 'campfire'), JSON.stringify(p)).toBe(true);
      }
      if (p.task.kind === 'cook') expect(p.cook).not.toBeNull();
      for (const [item, n] of [...Object.entries(p.backpack), ...Object.entries(s.state.bank)]) expect(Number.isSafeInteger(n) && n > 0, item).toBe(true);
    }
    expect(count(s, 'stoked') + count(s, 'fireLow')).toBe(days);
    expect(cooked(s).length).toBeGreaterThan(10);
    expect(s.log.filter(e => e.type === 'pickedUp' && e.kind === 'bush').length).toBeGreaterThan(5);
    expect(s.state.skills.fishing).toBeGreaterThan(0);
    expect(busy / steps).toBeGreaterThan(0.25);                                // at something much of the time (a walk or a
    // tap on the chest leaves him standing until the next order)
    // and the game saves and loads as it stands
    expect(deserialize(serialize(s.state), CAMP)).toEqual(s.state);
  });
});
