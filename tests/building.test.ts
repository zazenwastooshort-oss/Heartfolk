// Building it yourself (the owner, 12 Oct 2026; the camp build, 13 Oct 2026): Carpentry, the Build window's list, the
// camp's upgrades built in stages over time at their fixed spots (systems/building.ts): the wall tent and the log cabin
// in place of the tent, the stone hearth round the fire, the woodshed over the firewood pile; sleeping in each shelter;
// the materials (fibre from reeds, clay, stones, logs, bark peeled while chopping birch); the bench, the workbench and
// placing gone; and saves.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canSleep, createState, made, owned, SAVE_VERSION } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS, isNight } from '../src/core/clock';
import { deserialize, serialize } from '../src/core/save';
import {
  begunIds, bestShelter, buildOpen, buildRows, lacking, restBonus, savedBuilding, stageOf, STAGED_IDS, stepShown, unlocked, walkGrid,
} from '../src/core/building';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, type Layout, type Vec2 } from '../src/world/layout';
import { navFor } from '../src/world/nav';
import { outsideOf, stepPlace, toGround } from '../src/world/steps';
import { waterOf } from '../src/world/water';
import { applyCommands, type Command } from '../src/systems/commands';
import { restedFactor } from '../src/systems/sleep';
import { canMake } from '../src/systems/making';
import { wantsBark } from '../src/systems/building';
import { BARK, CARPENTRY, LINES, SHAPES, SHELTERS, SOURCES, STAGED, UPGRADES_AFTER } from '../src/data/building';
import { MAKES, type MakeId } from '../src/data/making';
import { ITEMS, RESOURCES, SKILLS } from '../src/data/skills';
import { PICKUPS } from '../src/data/pickups';
import { SLEEP } from '../src/data/sleep';
import { STOKE } from '../src/data/fire';
import { GOALS } from '../src/data/goals';
import { ITEM_PICTURES, SKILL_ICONS } from '../src/ui/pictures';
import { workTime } from '../src/ui/build';
import { BuildingView } from '../src/render/building';

const at = (day: number, hour: number) => (day + hour / 24) * DAY_SECONDS;
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const files = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []; });

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

/** Plenty of everything the upgrades use. */
const PLENTY = { birch_logs: 80, branch: 10, fibre: 20, bark: 12, clay: 30, stone: 40 };

/** A camp set up (every goal done, so none stops his gathering): the fire, the pile, the shelter and the chest, plenty of
 *  everything in the chest, by day, him standing on open grass south of the fire. */
function camp(hour = 10): Setup {
  const s = setup();
  s.state.goalsDone = GOALS.map(g => g.id);
  s.state.built = ['campfire', 'woodpile', 'shelter', 'chest'];
  s.state.tools = { axe: true, pick: true, rod: true };
  s.state.hasBook = true;
  s.state.bank = { ...PLENTY };
  s.state.time = at(1, hour);
  s.state.player.pos = { x: 3, z: -1 };
  return s;
}

/** The four upgrades, and what each upgrades. */
const UPGRADES: [MakeId, MakeId][] = [['wall_tent', 'shelter'], ['log_cabin', 'wall_tent'], ['stone_hearth', 'campfire'], ['woodshed', 'woodpile']];

describe('the data', () => {
  it('Carpentry is a skill with an icon, and the materials are items with pictures', () => {
    expect(SKILLS.carpentry.name).toBe('Carpentry');
    expect(SKILL_ICONS.carpentry).toContain('<path');
    for (const id of ['fibre', 'bark', 'clay', 'stone', 'birch_logs']) { expect(ITEMS[id], id).toBeDefined(); expect(ITEM_PICTURES[id], id).toBeDefined(); }
  });

  it('T9.1: what each upgrade needs (the brief\'s first proposal, tunable)', () => {
    expect(MAKES.wall_tent.needs).toEqual({ birch_logs: 12, fibre: 8 });
    expect(MAKES.log_cabin.needs).toEqual({ birch_logs: 30, clay: 10, stone: 12 });
    expect(MAKES.stone_hearth.needs).toEqual({ stone: 12, clay: 4 });
    expect(MAKES.woodshed.needs).toEqual({ birch_logs: 10, bark: 6 });
    // the camp's own buildings keep what they needed before
    expect(MAKES.campfire.needs).toEqual({ plank: 3, stone: 4 });
    expect(MAKES.woodpile.needs).toEqual({ birch_logs: 10 });
    expect(MAKES.shelter.needs).toEqual({ tarp: 1, plank: 4, birch_logs: 10 });
    expect(MAKES.chest.needs).toEqual({ birch_logs: 10, copper_ore: 3 });
    expect(MAKES.dummy.needs).toEqual({ birch_logs: 6, branch: 4 });
  });

  it('T3.1: how long each upgrade takes (the camp\'s first five get their times when they are built in stages too)', () => {
    expect(Object.fromEntries(STAGED_IDS.map(id => [id, MAKES[id].time]))).toEqual({ wall_tent: 120, log_cabin: 240, stone_hearth: 90, woodshed: 90 });
  });

  it('T9.2: every material the upgrades use says where it comes from, and can be gathered at the camp', () => {
    const used = [...new Set(STAGED_IDS.flatMap(id => Object.keys(MAKES[id].needs)))].sort();
    expect(used).toEqual(['bark', 'birch_logs', 'clay', 'fibre', 'stone']);
    for (const item of used) {
      expect(SOURCES[item]?.length ?? 0, item).toBeGreaterThan(10);
      const fromNode = CAMP.nodes.some(n => RESOURCES[n.resource]!.item === item);
      const fromGround = (CAMP.pickups ?? []).some(x => { const g = PICKUPS[x.kind].gives; return g !== 'book' && g.item === item && PICKUPS[x.kind].respawn !== null; });
      const peeled = item === BARK.item && CAMP.nodes.some(n => n.resource === BARK.tree);
      expect(fromNode || fromGround || peeled, item).toBe(true);
    }
    // the bark line says when bark comes: once the storage chest stands, while something needs it
    expect(SOURCES.bark).toMatch(/storage chest/);
    expect(SOURCES.bark).toMatch(/needs it/);
  });

  it('the upgrades are structures built in stages at their spots, each upgrading the step before it, the shelters resting him better', () => {
    expect(STAGED_IDS).toEqual(['wall_tent', 'log_cabin', 'stone_hearth', 'woodshed']);
    for (const [id, from] of UPGRADES) {
      expect(MAKES[id].gives.kind, id).toBe('structure');
      expect(STAGED[id]!.upgrades, id).toBe(from);
      expect(MAKES[id].at, id).toBe(MAKES[from].at);
      expect(STAGED[id]!.blurb.length, id).toBeGreaterThan(10);
      for (const item of Object.keys(MAKES[id].needs)) expect(ITEMS[item], `${id} ${item}`).toBeDefined();
    }
    expect(SHELTERS).toEqual(['shelter', 'wall_tent', 'log_cabin']);
    expect(LINES.tent).toEqual(SHELTERS);
    // the tent is called a tent now; its goal is still "A shelter"
    expect(MAKES.shelter.name).toBe('Tent');
    expect(GOALS.find(g => g.makes === 'shelter')!.title).toBe('A shelter');
    expect(UPGRADES_AFTER).toBe('chest');
  });

  it('the main goal path is unchanged: no goal makes an upgrade', () => {
    for (const g of GOALS) expect(STAGED_IDS as string[]).not.toContain(g.makes);
  });

  it('T2.3 (for the upgrades): Carpentry XP is a knock\'s worth for every knock of its time', () => {
    const xp = (id: MakeId) => Math.floor(MAKES[id].time / CARPENTRY.knock) * CARPENTRY.xp;
    expect(STAGED_IDS.map(xp)).toEqual([160, 320, 120, 120]);
  });

  it('says how long the work takes plainly', () => {
    expect([30, 45, 60, 90, 180, 150, 240].map(workTime)).toEqual(['30 seconds', '45 seconds', 'a minute', 'a minute and a half', '3 minutes', '2 and a half minutes', '4 minutes']);
  });
});

describe('the bench, the workbench, the lean-to, the log hut and placing are gone', () => {
  it('T10.1: no source file mentions them, but the save migration (and the changelog\'s history)', () => {
    const named: string[] = [];
    for (const f of files(SRC)) {
      if (/[\\/](core[\\/]save|data[\\/]changelog)\.ts$/.test(f)) continue;
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/log_bench|workbench|lean_to|log_hut|lean-to|log hut|log bench/gi)) named.push(`${f}: ${m[0]}`);
    }
    expect(named).toEqual([]);
  });

  it('T10.2: the page has no place bar, and nothing is placed', () => {
    const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(page).not.toMatch(/placeBar|placebar|place-do/);
    expect(createState(CAMP)).not.toHaveProperty('placed');
    for (const id of STAGED_IDS) expect(MAKES[id].at, id).not.toBe('placed');
  });

  it('T4.2: Carpentry is just another skill: no level is asked for anywhere', () => {
    for (const f of ['core/events.ts', 'systems/building.ts', 'ui/build.ts', 'data/building.ts']) {
      expect(readFileSync(join(SRC, f), 'utf8'), f).not.toMatch(/'level'|levelOk|Needs Carpentry level|staged\.level/);
    }
    for (const id of STAGED_IDS) expect(STAGED[id], id).not.toHaveProperty('level');
  });
});

describe('the Build list', () => {
  it('D4: empty until the chest stands; then the upgrades of what stands, each next step once the one before it stands', () => {
    const s = setup();
    expect(buildOpen(s.state, CAMP)).toBe(false);
    expect(buildRows(s.state, CAMP)).toEqual([]);
    const c = camp();
    // the chest not built yet: no upgrades, though what they upgrade stands
    c.state.built = ['campfire', 'woodpile', 'shelter'];
    expect(buildRows(c.state, CAMP)).toEqual([]);
    c.state.built.push('chest');
    expect(buildOpen(c.state, CAMP)).toBe(true);
    expect(buildRows(c.state, CAMP).map(r => r.id)).toEqual(['wall_tent', 'stone_hearth', 'woodshed']);   // the cabin waits for the wall tent
    expect(unlocked(c.state, CAMP, 'log_cabin')).toBe(false);
    c.state.built.push('wall_tent');
    expect(buildRows(c.state, CAMP).map(r => r.id)).toEqual(['log_cabin', 'stone_hearth', 'woodshed']);
    // without the firewood pile, no woodshed
    c.state.built = c.state.built.filter(id => id !== 'woodpile');
    expect(buildRows(c.state, CAMP).map(r => r.id)).not.toContain('woodshed');
    // what is short, with nothing in the chest
    c.state.bank = {};
    expect(buildRows(c.state, CAMP).find(r => r.id === 'stone_hearth')!.missing).toEqual(MAKES.stone_hearth.needs);
  });

  it('a begun one comes first, with how far along it is; a built one is no longer listed', () => {
    const c = camp();
    send(c, { type: 'build', id: 'woodshed' });
    runUntil(c, () => (c.state.underway.woodshed ?? 0) > MAKES.woodshed.time / 2, 120);
    const rows = buildRows(c.state, CAMP);
    expect(rows[0]).toMatchObject({ id: 'woodshed', begun: true, missing: {} });
    expect(rows[0]!.progress).toBeGreaterThan(0.5);
    expect(rows[0]!.stage).toBe(1);
    runUntil(c, () => c.state.built.includes('woodshed'), 120);
    expect(buildRows(c.state, CAMP).map(r => r.id)).not.toContain('woodshed');
  });

  it('the village has no Build button, and the build command does nothing there', () => {
    const s = setup(VILLAGE);
    s.state.built = ['campfire', 'chest'];
    s.state.bank = { ...PLENTY };
    expect(buildOpen(s.state, VILLAGE)).toBe(false);
    expect(buildRows(s.state, VILLAGE)).toEqual([]);
    for (const id of STAGED_IDS) send(s, { type: 'build', id });
    expect(s.state.underway).toEqual({});
    expect(s.state.bank).toEqual(PLENTY);
  });

  it("the make command (the goal card's Build button, a tap on a site) never makes them in one go", () => {
    const c = camp();
    for (const id of STAGED_IDS) expect(canMake(c.state, CAMP, MAKES[id]), id).toBe(false);
    send(c, { type: 'make', id: 'wall_tent' });
    run(c, 10);
    expect(c.state.built).not.toContain('wall_tent');
    expect(c.state.underway).toEqual({});
  });
});

describe("the current goal's share", () => {
  it("a build never takes what the current goal still counts, so the goal's count doesn't go backwards", () => {
    const c = camp();
    c.state.goalsDone = GOALS.slice(0, GOALS.findIndex(g => g.makes === 'dummy')).map(g => g.id);
    const goal = MAKES.dummy.needs, shed = MAKES.woodshed.needs;
    c.state.bank = { birch_logs: goal.birch_logs!, branch: goal.branch!, bark: shed.bark! };
    expect(buildRows(c.state, CAMP).find(r => r.id === 'woodshed')!.missing).toEqual({ birch_logs: shed.birch_logs });
    send(c, { type: 'build', id: 'woodshed' });
    expect(c.state.underway).toEqual({});
    expect(of(c, 'missing')).toHaveLength(1);
    // with some to spare, it goes ahead and leaves the goal its share
    c.state.bank.birch_logs = goal.birch_logs! + shed.birch_logs!;
    send(c, { type: 'build', id: 'woodshed' });
    expect(c.state.underway.woodshed).toBe(0);
    expect(owned(c.state, 'birch_logs')).toBe(goal.birch_logs);
    expect(owned(c.state, 'branch')).toBe(goal.branch);
  });

  it('(T2.7) the thing the current goal makes may use the goal\'s own count', () => {
    const c = camp();
    c.state.goalsDone = GOALS.slice(0, GOALS.findIndex(g => g.makes === 'chest')).map(g => g.id);
    c.state.built = ['campfire', 'woodpile', 'shelter'];
    c.state.bank = { ...MAKES.chest.needs };
    expect(lacking(c.state, MAKES.chest)).toEqual({});              // the chest's own goal: its own logs and copper
    expect(lacking(c.state, MAKES.woodshed)).toEqual({ birch_logs: 10, bark: 6 });   // anything else: none of them
  });
});

describe('building in stages', () => {
  it('begun: what it needs is taken, he works beside it, it goes up stage by stage with Carpentry XP, then stands', () => {
    const c = camp(), bank = { ...c.state.bank };
    send(c, { type: 'build', id: 'woodshed' });
    expect(of(c, 'begun')).toEqual([{ type: 'begun', make: 'woodshed' }]);
    for (const [id, n] of Object.entries(MAKES.woodshed.needs)) expect(c.state.bank[id], id).toBe(bank[id as keyof typeof bank]! - n);
    expect(c.state.player.pending).toEqual({ kind: 'raise', id: 'woodshed' });
    expect(stageOf(c.state, 'woodshed')).toBe(0);              // footings out
    expect(begunIds(c.state)).toEqual(['woodshed']);
    runUntil(c, () => c.state.player.task.kind === 'raise', 30);
    const place = stepPlace(CAMP, 'woodshed')!;
    expect(dist(c.state.player.pos, place.pos)).toBeLessThan(SHAPES.woodshed!.reach + 1);
    runUntil(c, () => c.state.built.includes('woodshed'), MAKES.woodshed.time + 1);
    expect(c.state.built).toContain('woodshed');
    expect(made(c.state, 'woodshed')).toBe(true);
    expect(c.state.underway).toEqual({});
    expect(of(c, 'buildStage').map(e => e.stage)).toEqual([1, 2]);
    expect(of(c, 'made').at(-1)).toEqual({ type: 'made', make: 'woodshed' });
    expect(c.state.skills.carpentry).toBe(Math.floor(MAKES.woodshed.time / CARPENTRY.knock) * CARPENTRY.xp);
    expect(of(c, 'xpGained').filter(e => e.skill === 'carpentry').length).toBe(Math.floor(MAKES.woodshed.time / CARPENTRY.knock));
    expect(c.state.player.task.kind).toBe('idle');
    expect(stageOf(c.state, 'woodshed')).toBe(CARPENTRY.stages);
    // the firewood pile's logs are as they were: the woodshed's own logs are used up building it
    expect(c.state.woodpile).toBe(0);
    // built once: a build of it again does nothing
    send(c, { type: 'build', id: 'woodshed' });
    expect(c.state.player.pending).toBeNull();
  });

  it('T4.1: with no Carpentry at all and what each needs, every upgrade can be begun', () => {
    for (const [id, from] of UPGRADES) {
      const c = camp();
      if (from === 'wall_tent') c.state.built.push('wall_tent');
      expect(c.state.skills.carpentry).toBe(0);
      send(c, { type: 'build', id });
      expect(c.state.underway[id], id).toBe(0);
      expect(of(c, 'cantBuild'), id).toEqual([]);
    }
  });

  it('without everything it needs, or before the step before it stands, he says so and stays put', () => {
    const c = camp();
    c.state.bank = { ...PLENTY, fibre: 1 };
    send(c, { type: 'build', id: 'wall_tent' });
    expect(of(c, 'missing').at(-1)).toEqual({ type: 'missing', make: 'wall_tent', items: { fibre: MAKES.wall_tent.needs.fibre! - 1 } });
    send(c, { type: 'build', id: 'log_cabin' });
    expect(of(c, 'cantBuild').at(-1)).toEqual({ type: 'cantBuild', make: 'log_cabin', reason: 'locked' });
    expect(c.state.underway).toEqual({});
    expect(c.state.player.pending).toBeNull();
    expect(c.state.bank).toEqual({ ...PLENTY, fibre: 1 });
  });

  it('sent elsewhere the work stays; a tap on it sends him back to carry on, taking nothing more', () => {
    const c = camp();
    send(c, { type: 'build', id: 'stone_hearth' });
    runUntil(c, () => (c.state.underway.stone_hearth ?? 0) > 12, 60);
    send(c, { type: 'walk', to: { x: 5, z: -6 } });
    run(c, 8);
    const worked = c.state.underway.stone_hearth!, bank = { ...c.state.bank };
    expect(worked).toBeGreaterThan(12);
    expect(c.state.player.task.kind).not.toBe('raise');
    run(c, 5);
    expect(c.state.underway.stone_hearth).toBe(worked);          // nothing done while he's away
    send(c, { type: 'build', id: 'stone_hearth' });
    expect(c.state.player.pending).toEqual({ kind: 'raise', id: 'stone_hearth' });
    runUntil(c, () => c.state.built.includes('stone_hearth'), MAKES.stone_hearth.time);
    expect(c.state.built).toContain('stone_hearth');
    expect(c.state.bank).toEqual(bank);
    expect(of(c, 'begun')).toHaveLength(1);
  });

  it('at nightfall he leaves it to stoke the fire, then goes back to it by himself', () => {
    const c = camp(19.8);
    c.state.player.pos = { x: 0, z: 3 };
    send(c, { type: 'build', id: 'wall_tent' });
    runUntil(c, () => c.state.player.task.kind === 'raise', 30);
    runUntil(c, () => !!c.state.player.stoke, 120);
    expect(isNight(c.state.time)).toBe(true);
    const before = c.state.underway.wall_tent!;
    expect(before).toBeGreaterThan(0);
    runUntil(c, () => of(c, 'stoked').length > 0, 120);
    expect(c.state.player.pending).toEqual({ kind: 'raise', id: 'wall_tent' });
    runUntil(c, () => c.state.built.includes('wall_tent'), MAKES.wall_tent.time + 60);
    expect(c.state.built).toContain('wall_tent');
    expect(c.state.underway).toEqual({});
  });

  it('asked to sleep by day while building, he says he is not tired and keeps working', () => {
    const c = camp();
    send(c, { type: 'build', id: 'wall_tent' });
    runUntil(c, () => (c.state.underway.wall_tent ?? 0) > 5, 60);
    send(c, { type: 'sleep' });                                    // by day: not tired; he keeps working
    expect(of(c, 'cantSleep')).toHaveLength(1);
    expect(c.state.player.task).toEqual({ kind: 'raise', id: 'wall_tent' });
  });

  it('T6.4: walking is blocked by the step that stands, and by a new step from its footings on', () => {
    const c = camp(), place = stepPlace(CAMP, 'wall_tent')!;
    // behind the tent, inside where the wall tent goes
    const behind = toGround(place, [0, -1.3]);
    expect(outsideOf(CAMP, 'shelter', behind)).toBeGreaterThan(0.4);
    expect(walkGrid(c.state, CAMP).walkable(behind)).toBe(true);
    send(c, { type: 'build', id: 'wall_tent' });
    expect(c.state.underway.wall_tent).toBe(0);
    expect(walkGrid(c.state, CAMP).walkable(behind)).toBe(false);
    expect(navFor(CAMP, c.state.built).walkable(behind)).toBe(true);   // only what stands: open
    c.state.underway = {}; c.state.built.push('wall_tent');
    expect(walkGrid(c.state, CAMP).walkable(behind)).toBe(false);
  });
});

describe("the shelter's upgrades", () => {
  /** A camp with the wall tent (and, with `cabin`, the log cabin) built in place, at `hour`. */
  function upgraded(hour: number, cabin = false): Setup {
    const c = camp(hour);
    c.state.built.push('wall_tent');
    if (cabin) c.state.built.push('log_cabin');
    c.state.stokedNight = Math.floor(c.state.time / DAY_SECONDS - STOKE.at);
    return c;
  }

  it('T6.1: the tent becomes a wall tent, then a log cabin, in order; the old one shows until the new one is half built, and is slept in until it is built', () => {
    const c = camp();
    expect(stepShown(c.state, 'tent')).toBe('shelter');
    send(c, { type: 'build', id: 'log_cabin' });                    // not before the wall tent
    expect(c.state.underway.log_cabin).toBeUndefined();
    send(c, { type: 'build', id: 'wall_tent' });
    expect(stepShown(c.state, 'tent')).toBe('shelter');             // footings round the tent
    runUntil(c, () => stageOf(c.state, 'wall_tent') >= 1, 200);
    expect(stepShown(c.state, 'tent')).toBe('shelter');             // its frame round the tent
    runUntil(c, () => stageOf(c.state, 'wall_tent') >= CARPENTRY.shown, 200);
    expect(stepShown(c.state, 'tent')).toBe('wall_tent');
    expect(bestShelter(c.state)).toBe('shelter');                  // ...but slept in only once built
    runUntil(c, () => c.state.built.includes('wall_tent'), 200);
    expect(bestShelter(c.state)).toBe('wall_tent');
    expect(buildRows(c.state, CAMP).map(r => r.id)).toContain('log_cabin');
    send(c, { type: 'build', id: 'log_cabin' });
    runUntil(c, () => c.state.built.includes('log_cabin'), 400);
    expect(stepShown(c.state, 'tent')).toBe('log_cabin');
    expect(bestShelter(c.state)).toBe('log_cabin');
    expect(buildOpen(c.state, CAMP)).toBe(true);                   // the button stays, with the shelter's line done
    expect(buildRows(c.state, CAMP).filter(r => SHELTERS.includes(r.id))).toEqual([]);
    expect(c.state.skills.carpentry).toBe((Math.floor(120 / CARPENTRY.knock) + Math.floor(240 / CARPENTRY.knock)) * CARPENTRY.xp);
  });

  it('T6.2: he rests better in a better shelter: the tent 0.25, the wall tent 0.35, the log cabin 0.5', () => {
    const c = camp();
    expect(restBonus(c.state)).toBe(0.25);
    expect(SLEEP.bonus).toBe(0.25);
    c.state.built.push('wall_tent');
    expect(restBonus(c.state)).toBe(0.35);
    c.state.built.push('log_cabin');
    expect(restBonus(c.state)).toBe(0.5);
  });

  for (const cabin of [false, true]) {
    it(`he sleeps in the ${cabin ? 'log cabin' : 'wall tent'} and wakes better rested than in the tent`, () => {
      const c = upgraded(22, cabin);
      expect(canSleep(c.state, CAMP)).toBe(true);
      send(c, { type: 'sleep' });
      runUntil(c, () => c.state.player.task.kind === 'sleep', 60);
      expect(c.state.player.task.kind).toBe('sleep');
      runUntil(c, () => of(c, 'awake').length > 0, DAY_SECONDS);
      expect(restBonus(c.state)).toBe(STAGED[cabin ? 'log_cabin' : 'wall_tent']!.rest);
      expect(restedFactor(c.state)).toBeCloseTo(1 + STAGED[cabin ? 'log_cabin' : 'wall_tent']!.rest!);
    });
  }

  it('canSleep counts any shelter step at the tent spot (never in the village)', () => {
    const c = camp();
    c.state.built = ['campfire', 'chest', 'wall_tent'];
    expect(canSleep(c.state, CAMP)).toBe(true);
    c.state.built = ['campfire', 'chest', 'log_cabin'];
    expect(canSleep(c.state, CAMP)).toBe(true);
    c.state.built = ['campfire', 'chest'];
    expect(canSleep(c.state, CAMP)).toBe(false);
    expect(canSleep({ ...c.state, built: ['shelter', 'wall_tent'] }, VILLAGE)).toBe(false);
  });

  it('a half-built upgrade still has the shelter before it to sleep in at night', () => {
    const c = camp(21);
    c.state.stokedNight = Math.floor(c.state.time / DAY_SECONDS - STOKE.at);
    send(c, { type: 'build', id: 'wall_tent' });
    runUntil(c, () => stageOf(c.state, 'wall_tent') >= CARPENTRY.shown, 200);
    send(c, { type: 'sleep' });
    runUntil(c, () => c.state.player.task.kind === 'sleep', 60);
    expect(c.state.player.task.kind).toBe('sleep');
    expect(c.state.underway.wall_tent).toBeGreaterThan(0);
  });
});

describe('the materials', () => {
  it('reeds along the river bank give fibre and clay patches there give clay; both come back', () => {
    const reeds = CAMP.pickups!.filter(x => x.kind === 'reeds'), clay = CAMP.pickups!.filter(x => x.kind === 'clay');
    expect(reeds.length).toBeGreaterThanOrEqual(4);
    expect(clay.length).toBeGreaterThanOrEqual(3);
    const water = waterOf(CAMP);
    for (const x of [...reeds, ...clay]) {
      expect(water.edge(x.pos), x.id).toBeGreaterThan(0);          // on the bank, out of the water
      expect(water.edge(x.pos), x.id).toBeLessThan(1.5);           // ...by the river
    }
    expect(PICKUPS.reeds.gives).toEqual({ item: 'fibre', count: 1 });
    expect(PICKUPS.clay.gives).toEqual({ item: 'clay', count: 1 });
    const s = setup();
    send(s, { type: 'pickup', id: reeds[0]!.id });
    runUntil(s, () => owned(s.state, 'fibre') >= 2, 120);
    expect(owned(s.state, 'fibre')).toBeGreaterThanOrEqual(2);
    send(s, { type: 'pickup', id: clay[0]!.id });
    runUntil(s, () => owned(s.state, 'clay') >= 1, 120);
    expect(owned(s.state, 'clay')).toBeGreaterThanOrEqual(1);
    run(s, Math.max(PICKUPS.reeds.respawn!, PICKUPS.clay.respawn!) + 5);
    expect(s.log.some(e => e.type === 'pickupBack' && e.id === reeds[0]!.id)).toBe(true);
  });

  it('T7.4: bark is peeled now and then while chopping birch, once the chest stands, only while the woodshed (or something else he can build) needs it', () => {
    const c = camp();
    c.state.bank = {};
    expect(c.state.skills.carpentry).toBe(0);
    expect(wantsBark(c.state, CAMP)).toBe(true);                   // the woodshed needs it (no Carpentry needed first)
    const birch = CAMP.nodes.find(n => n.resource === BARK.tree)!;
    send(c, { type: 'work', nodeId: birch.id });
    runUntil(c, () => owned(c.state, BARK.item) >= 2, 900);
    expect(owned(c.state, BARK.item)).toBeGreaterThanOrEqual(2);
    expect(of(c, 'barkPeeled').length).toBe(owned(c.state, BARK.item));
    // enough for the woodshed: no more
    c.state.bank.bark = MAKES.woodshed.needs.bark!;
    expect(wantsBark(c.state, CAMP)).toBe(false);
    // the woodshed begun (its bark taken) or built: nothing else needs bark, so none
    c.state.bank.bark = 0;
    c.state.built.push('woodshed');
    expect(wantsBark(c.state, CAMP)).toBe(false);
    // chapter 1 (no chest yet) never gets any
    const s = setup();
    s.state.built = ['campfire', 'woodpile', 'shelter'];
    expect(wantsBark(s.state, CAMP)).toBe(false);
  });
});

describe('saves', () => {
  it('a half-built thing is saved and loaded with how far along it is, and he carries on', () => {
    const c = camp();
    send(c, { type: 'build', id: 'wall_tent' });
    runUntil(c, () => (c.state.underway.wall_tent ?? 0) > 20, 60);
    const back = deserialize(serialize(c.state, Date.now()), CAMP);
    expect(back.underway.wall_tent).toBeCloseTo(c.state.underway.wall_tent!);
    expect(back.player.task).toEqual({ kind: 'raise', id: 'wall_tent' });
    expect(back.player.pos).toEqual(c.state.player.pos);
    expect(walkGrid(back, CAMP).walkable(toGround(stepPlace(CAMP, 'wall_tent')!, [0, -1.3]))).toBe(false);
    const r = { ...setup(), state: back };
    runUntil(r, () => back.built.includes('wall_tent'), MAKES.wall_tent.time);
    expect(back.built).toContain('wall_tent');
  });

  it('a built upgrade stays built, and nothing placed is saved', () => {
    const c = camp();
    c.state.built.push('wall_tent', 'log_cabin', 'stone_hearth', 'woodshed');
    const raw = serialize(c.state);
    expect(JSON.parse(raw)).not.toHaveProperty('placed');
    const back = deserialize(raw, CAMP);
    expect(back.built).toEqual(c.state.built);
    expect(back).not.toHaveProperty('placed');
    expect(back.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(12);
  });

  it('damaged progress falls back, and what a dropped one took goes back into the chest', () => {
    const c = camp();
    const raw = JSON.parse(serialize(c.state));
    // the cabin with no wall tent standing; a negative time; built and begun; an id the game doesn't have; a placement
    raw.underway = { log_cabin: 20, stone_hearth: -3, nonsense: 4 };
    raw.built = [...raw.built, 'woodshed']; raw.underway.woodshed = 5;
    raw.placed = { woodshed: { pos: { x: 1, z: 1 }, turn: 0 } };
    const back = deserialize(JSON.stringify(raw), CAMP);
    expect(back.underway).toEqual({});
    expect(back).not.toHaveProperty('placed');
    // the cabin's and the hearth's needs given back; the woodshed, built, took its own
    const expected = { ...PLENTY } as Record<string, number>;
    for (const id of ['log_cabin', 'stone_hearth'] as MakeId[]) for (const [item, n] of Object.entries(MAKES[id].needs)) expected[item] = (expected[item] ?? 0) + n;
    expect(back.bank).toEqual(expected);
    // a task or a destination back to something not begun is dropped
    raw.underway = {};
    raw.player.task = { kind: 'raise', id: 'wall_tent' };
    raw.player.pending = { kind: 'raise', id: 'stone_hearth' };
    const third = deserialize(JSON.stringify(raw), CAMP);
    expect(third.player.task.kind).toBe('idle');
    expect(third.player.pending).toBeNull();
  });

  it('savedBuilding: at most one under way, the one he is at, else the furthest along; the others given back', () => {
    const c = camp();
    c.state.built.push('wall_tent');
    const under = { log_cabin: 60, stone_hearth: 10, woodshed: 80 };
    const on = savedBuilding({ underway: under }, c.state, CAMP, 'stone_hearth');
    expect(on.underway).toEqual({ stone_hearth: 10 });
    expect(on.refund).toEqual({ birch_logs: 40, clay: 10, stone: 12, bark: 6 });
    // none he is at: the furthest along (the woodshed, 80 of 90 s, before the cabin's 60 of 240)
    expect(savedBuilding({ underway: under }, c.state, CAMP, null).underway).toEqual({ woodshed: 80 });
    expect(savedBuilding({ underway: under }, c.state, CAMP, 'nonsense').underway).toEqual({ woodshed: 80 });
    // one alone stays as it is, with nothing given back; none at all, nothing
    expect(savedBuilding({ underway: { woodshed: 5 } }, c.state, CAMP, null)).toEqual({ underway: { woodshed: 5 }, refund: {} });
    expect(savedBuilding({}, c.state, CAMP, null)).toEqual({ underway: {}, refund: {} });
    expect(savedBuilding({ underway: 'x' }, c.state, CAMP, null)).toEqual({ underway: {}, refund: {} });
  });

  it('0.0.25 and 0.0.26 saves (format 11, before building) load with nothing begun', () => {
    const c = camp();
    const raw = JSON.parse(serialize(c.state, Date.now()));
    delete raw.underway; delete raw.resumeAt;
    raw.version = 11;
    const back = deserialize(JSON.stringify(raw), CAMP);
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.underway).toEqual({});
    expect(back.resumeAt).toBe(0);
    expect(back.skills.carpentry).toBe(0);
    expect(back.built).toEqual(c.state.built);
    expect(back.bank).toEqual(c.state.bank);
  });

  it('0.0.22 to 0.0.24 saves (format 10) load too', () => {
    const c = camp();
    const raw = JSON.parse(serialize(c.state));
    delete raw.underway; delete raw.resumeAt; delete raw.skills.carpentry;
    raw.version = 10;
    const back = deserialize(JSON.stringify(raw), CAMP);
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.underway).toEqual({});
    expect(back.skills.carpentry).toBe(0);
  });

  it('saved while he is off stoking the fire from his building, he still goes back to it after', () => {
    const c = camp(19.8);
    c.state.player.pos = { x: 0, z: 3 };
    send(c, { type: 'build', id: 'wall_tent' });
    runUntil(c, () => c.state.player.task.kind === 'raise', 30);
    runUntil(c, () => !!c.state.player.stoke, 120);
    expect(c.state.player.stoke?.back).toEqual({ raise: 'wall_tent' });
    const back = deserialize(serialize(c.state, Date.now()), CAMP);
    expect(back.player.stoke?.back).toEqual({ raise: 'wall_tent' });
    expect(back.underway.wall_tent).toBeCloseTo(c.state.underway.wall_tent!);
    const r = { ...setup(), state: back };
    runUntil(r, () => of(r, 'stoked').length > 0, 120);
    expect(back.player.pending).toEqual({ kind: 'raise', id: 'wall_tent' });
    runUntil(r, () => back.built.includes('wall_tent'), MAKES.wall_tent.time + 60);
    expect(back.built).toContain('wall_tent');
  });
});

describe('the drawing', () => {
  it("a half-built thing's tap area goes into the view's own list of things to tap, and comes out once it is built", () => {
    const c = camp(), pickables: THREE.Object3D[] = [], view = new BuildingView(new THREE.Scene(), CAMP, pickables);
    const taps = () => pickables.filter(o => o.userData.raiseId === 'woodshed');
    view.update(c.state, 0.1);
    expect(taps()).toHaveLength(0);                                // nothing shows until it is begun
    send(c, { type: 'build', id: 'woodshed' });
    view.update(c.state, 0.1);
    expect(view.pickables).toBe(pickables);
    expect(taps()).toHaveLength(1);
    expect(taps()[0]!.visible).toBe(true);
    runUntil(c, () => c.state.built.includes('woodshed'), MAKES.woodshed.time + 30);
    view.update(c.state, 0.1);
    expect(taps()[0]?.visible ?? false).toBe(false);              // built: a tap no longer sends him back to work
  });

  it('at night the shelter\'s upgrade leaves its tap to the shelter (bed); the fire\'s and the pile\'s keep theirs', () => {
    const c = camp(22), pickables: THREE.Object3D[] = [], view = new BuildingView(new THREE.Scene(), CAMP, pickables);
    c.state.underway = { wall_tent: 5 };
    view.update(c.state, 0.1);
    expect(pickables.find(o => o.userData.raiseId === 'wall_tent')!.visible).toBe(false);
    c.state.underway = { woodshed: 5 };
    view.update(c.state, 0.1);
    expect(pickables.find(o => o.userData.raiseId === 'woodshed')!.visible).toBe(true);
  });
});
