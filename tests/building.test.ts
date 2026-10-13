// Building it yourself (the owner, 12 Oct 2026; the camp build, 13 Oct 2026): Carpentry, the Build window's list,
// everything at the camp's spots built in stages over time (systems/building.ts): the campfire, the firewood pile, the
// tent, the storage chest and the training dummy as their goals come up (nothing shows before: the markers), and the
// camp's upgrades at their fixed spots: the wall tent and the log cabin in place of the tent, the stone hearth round the
// fire, the woodshed over the firewood pile; committed once begun (one at a time, nothing given back, going back to it
// after anything else by himself); the goal's count never going backwards while its thing is built; sleeping in each
// shelter; the materials (fibre from reeds, clay, stones, logs, bark peeled while chopping birch); the bench, the
// workbench and placing gone; and saves. Test names start with the plan's test ids (T1.1 and on).
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canSleep, createState, currentGoal, goalHasEnough, goalPaid, made, owned, SAVE_VERSION } from '../src/core/state';
import { goalLines } from '../src/core/book';
import { survivalPages } from '../src/core/survival';
import { makeKey } from '../src/core/thoughts';
import { ratsOf } from '../src/core/rats';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS, isNight } from '../src/core/clock';
import { deserialize, serialize } from '../src/core/save';
import {
  begunIds, bestShelter, buildOpen, buildRows, buildSpeed, buildTime, lacking, markerShown, progressOf, restBonus, savedBuilding, stageOf,
  STAGED_IDS, stepShown, unlocked, walkGrid,
} from '../src/core/building';
import { catchUpAway, step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, type Layout, type Vec2 } from '../src/world/layout';
import { navFor } from '../src/world/nav';
import { outsideOf, stepPlace, toGround } from '../src/world/steps';
import { waterOf } from '../src/world/water';
import { applyCommands, type Command } from '../src/systems/commands';
import { restedFactor } from '../src/systems/sleep';
import { canMake } from '../src/systems/making';
import { wantsBark } from '../src/systems/building';
import { nextStep } from '../src/systems/nextstep';
import { knockOut } from '../src/systems/rats';
import { wear } from '../src/systems/combat';
import { BARK, CARPENTRY, LINES, RESUME, SHAPES, SHELTERS, SOURCES, STAGED, UPGRADES_AFTER } from '../src/data/building';
import { MAKES, makeDef, type MakeId } from '../src/data/making';
import { levelFor, XP_TABLE } from '../src/data/xp';
import { ITEMS, RESOURCES, SKILLS } from '../src/data/skills';
import { PICKUPS } from '../src/data/pickups';
import { SLEEP } from '../src/data/sleep';
import { STOKE } from '../src/data/fire';
import { GOALS } from '../src/data/goals';
import { ITEM_PICTURES, SKILL_ICONS } from '../src/ui/pictures';
import { workTime } from '../src/ui/build';
import { shownSkills } from '../src/ui/skills';
import { BuildingView } from '../src/render/building';
import { Bot } from './bot';

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

/** A camp set up (every goal done, so none stops his gathering): the fire, the pile, the shelter, the chest and the
 *  training dummy, plenty of everything in the chest, by day, him standing on open grass south of the fire. */
function camp(hour = 10): Setup {
  const s = setup();
  s.state.goalsDone = GOALS.map(g => g.id);
  s.state.built = ['campfire', 'woodpile', 'shelter', 'chest', 'dummy'];
  s.state.tools = { axe: true, pick: true, rod: true };
  s.state.hasBook = true;
  s.state.bank = { ...PLENTY };
  s.state.time = at(1, hour);
  s.state.player.pos = { x: 3, z: -1 };
  return s;
}

/** The four upgrades, and what each upgrades. */
const UPGRADES: [MakeId, MakeId][] = [['wall_tent', 'shelter'], ['log_cabin', 'wall_tent'], ['stone_hearth', 'campfire'], ['woodshed', 'woodpile']];
/** The upgrades' ids, and the camp's first five (built in stages since the camp build's stage 2), in goal order. */
const UPGRADE_IDS = UPGRADES.map(([id]) => id);
const BASE: MakeId[] = ['campfire', 'woodpile', 'shelter', 'chest', 'dummy'];

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

  it('T3.1: how long each takes at Carpentry level 1 (the brief\'s first proposal, tunable)', () => {
    expect(Object.fromEntries(STAGED_IDS.map(id => [id, MAKES[id].time]))).toEqual({
      campfire: 20, woodpile: 25, shelter: 60, chest: 45, dummy: 40, wall_tent: 120, log_cabin: 240, stone_hearth: 90, woodshed: 90,
    });
  });

  it('T9.2: every material the upgrades use says where it comes from, and can be gathered at the camp', () => {
    const used = [...new Set(UPGRADE_IDS.flatMap(id => Object.keys(MAKES[id].needs)))].sort();
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

  it('everything built at the camp\'s spots goes up in stages: the first five in goal order, then the upgrades, each upgrading the step before it, the shelters resting him better', () => {
    expect(STAGED_IDS).toEqual([...BASE, ...UPGRADE_IDS]);
    expect(Object.values(MAKES).filter(d => d.gives.kind === 'structure').map(d => d.id).sort()).toEqual([...STAGED_IDS].sort());
    for (const id of BASE) {
      expect(STAGED[id]!.upgrades, id).toBeUndefined();
      expect(GOALS.filter(g => g.makes === id), id).toHaveLength(1);
      expect(STAGED[id]!.blurb.length, id).toBeGreaterThan(10);
    }
    expect(STAGED.chest!.inside).toBe('tent');                     // the chest stands in the shelter
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
    for (const g of GOALS) expect(UPGRADE_IDS as string[]).not.toContain(g.makes);
  });

  it('T2.3: Carpentry XP is a knock\'s worth for every knock of its time: 24, 32, 80, 60, 52, then 160, 320, 120, 120', () => {
    const xp = (id: MakeId) => Math.floor(MAKES[id].time / CARPENTRY.knock) * CARPENTRY.xp;
    expect(STAGED_IDS.map(xp)).toEqual([24, 32, 80, 60, 52, 160, 320, 120, 120]);
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
  it('D4: nothing in a new game; each of the first five from its goal on; the upgrades of what stands once the chest stands, each next step once the one before it stands', () => {
    const s = setup();
    expect(buildOpen(s.state, CAMP)).toBe(false);                   // T5.2: not before the wreck is salvaged
    expect(buildRows(s.state, CAMP)).toEqual([]);
    s.state.goalsDone = ['salvage'];                               // the campfire's goal is up
    expect(buildOpen(s.state, CAMP)).toBe(true);
    expect(buildRows(s.state, CAMP).map(r => r.id)).toEqual(['campfire']);
    expect(buildRows(s.state, CAMP)[0]!.missing).toEqual(MAKES.campfire.needs);
    const c = camp();
    // the chest's goal current, not built yet: its row, and no upgrades, though what they upgrade stands
    c.state.goalsDone = GOALS.slice(0, GOALS.findIndex(g => g.makes === 'chest')).map(g => g.id);
    c.state.built = ['campfire', 'woodpile', 'shelter'];
    expect(buildRows(c.state, CAMP).map(r => r.id)).toEqual(['chest']);
    c.state.goalsDone = GOALS.map(g => g.id);
    c.state.built.push('chest', 'dummy');
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

  it('T2.4: make never builds a structure any more: only things made where he stands can be made; the make command for one of the camp\'s begins it in stages', () => {
    const c = camp();
    for (const def of Object.values(MAKES)) expect(canMake(setup().state, CAMP, def), def.id).toBe(def.at === 'here');
    for (const id of STAGED_IDS) expect(canMake(c.state, CAMP, MAKES[id]), id).toBe(false);
    send(c, { type: 'make', id: 'wall_tent' });
    expect(c.state.underway).toEqual({ wall_tent: 0 });            // begun, what it needs taken: not made in one go
    expect(c.state.player.pending).toEqual({ kind: 'raise', id: 'wall_tent' });
    run(c, 10);
    expect(c.state.built).not.toContain('wall_tent');
    expect(of(c, 'made')).toEqual([]);
    // the campfire's goal: make sends him to build it, in stages
    const s = setup();
    s.state.goalsDone = ['salvage']; s.state.player.backpack = { ...MAKES.campfire.needs };
    send(s, { type: 'make', id: 'campfire' });
    expect(s.state.underway).toEqual({ campfire: 0 });
    expect(s.state.player.backpack).toEqual({});
    runUntil(s, () => s.state.player.task.kind === 'raise', 30);
    run(s, MAKES.campfire.time / 2);
    expect(s.state.built).toEqual([]);
  });
});

describe("the current goal's share", () => {
  it("a build never takes what the current goal still counts, so the goal's count doesn't go backwards", () => {
    const c = camp();
    c.state.goalsDone = GOALS.slice(0, GOALS.findIndex(g => g.makes === 'dummy')).map(g => g.id);
    c.state.built = c.state.built.filter(id => id !== 'dummy');
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

  it('sent elsewhere the work stays; a tap on it sends him back to carry on, taking nothing more; left be, he goes back by himself', () => {
    const c = camp();
    send(c, { type: 'build', id: 'stone_hearth' });
    runUntil(c, () => (c.state.underway.stone_hearth ?? 0) > 12, 60);
    send(c, { type: 'walk', to: { x: 5, z: -6 } });
    runUntil(c, () => c.state.player.task.kind === 'idle', 20);
    const worked = c.state.underway.stone_hearth!, bank = { ...c.state.bank };
    expect(worked).toBeGreaterThan(12);
    run(c, RESUME.wait - 0.5);
    expect(c.state.player.task.kind).toBe('idle');                // a moment where he was sent (D9)
    expect(c.state.underway.stone_hearth).toBe(worked);          // nothing done while he's away
    send(c, { type: 'build', id: 'stone_hearth' });
    expect(c.state.player.pending).toEqual({ kind: 'raise', id: 'stone_hearth' });
    runUntil(c, () => c.state.built.includes('stone_hearth'), MAKES.stone_hearth.time);
    expect(c.state.built).toContain('stone_hearth');
    expect(c.state.bank).toEqual(bank);
    expect(of(c, 'begun')).toHaveLength(1);
    // the same, left be: after the moment, he walks back by himself
    const d = camp();
    send(d, { type: 'build', id: 'woodshed' });
    runUntil(d, () => (d.state.underway.woodshed ?? 0) > 5, 60);
    send(d, { type: 'walk', to: { x: 5, z: -6 } });
    runUntil(d, () => d.state.player.task.kind === 'idle', 20);
    const stopped = d.state.time;
    runUntil(d, () => d.state.player.pending?.kind === 'raise', 30);
    expect(d.state.time - stopped).toBeCloseTo(RESUME.wait, 0);
    runUntil(d, () => d.state.built.includes('woodshed'), MAKES.woodshed.time + 30);
    expect(d.state.built).toContain('woodshed');
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

// ---- everything built in stages (the camp build's stage 2) ----

/** A camp game on the goal that makes `id` (every goal before it done, with what their making gave: structures built,
 *  tools owned, gear worn), carrying what `id` needs, at `hour` on day 1, him on open grass south of the fire. */
function onGoal(id: MakeId, hour = 10): Setup {
  const s = setup(), i = GOALS.findIndex(g => g.makes === id);
  s.state.goalsDone = GOALS.slice(0, i).map(g => g.id);
  for (const g of GOALS.slice(0, i)) {
    const def = g.makes ? makeDef(g.makes) : null;
    if (def?.gives.kind === 'structure') s.state.built.push(def.id);
    else if (def?.gives.kind === 'tool') s.state.tools[def.gives.tool] = true;
    else if (def?.gives.kind === 'gear') wear(s.state, def.gives.gear);
  }
  s.state.hasBook = true;
  if (s.state.built.includes('woodpile')) s.state.woodpile = MAKES.woodpile.needs.birch_logs!;
  s.state.player.backpack = { ...MAKES[id].needs };
  s.state.time = at(1, hour);
  s.state.player.pos = { x: 3, z: -1 };
  expect(currentGoal(s.state).makes).toBe(id);
  return s;
}

/** Whether he is back at `id`, or on his way back to it. */
const backAt = (s: Setup, id: MakeId) => {
  const p = s.state.player;
  return (p.task.kind === 'raise' && p.task.id === id) || (p.pending?.kind === 'raise' && p.pending.id === id);
};

/** Ready to begin `id`: on its goal (the camp's first five), or the camp set up with what each upgrade needs (the log
 *  cabin with the wall tent standing). */
function readyFor(id: MakeId, hour = 10): Setup {
  if (BASE.includes(id)) return onGoal(id, hour);
  const c = camp(hour);
  if (id === 'log_cabin') c.state.built.push('wall_tent');
  return c;
}

/** Whether nothing has him (as resumeBuild sees it): standing about, going nowhere, nothing under way for him. */
const free = (s: Setup) => {
  const p = s.state.player, n = s.state.needs;
  return p.task.kind === 'idle' && !p.pending && !p.path.length && !p.trip && !p.stoke && !p.cook && !n.meal && !n.bed && !s.state.stokeAgain;
};

describe('markers: nothing shows until its goal comes up (In 1)', () => {
  it('T1.1: a new game shows no marker anywhere, with nothing begun or built', () => {
    const s = setup();
    for (const id of BASE) expect(markerShown(s.state, CAMP, id), id).toBe(false);
    expect(s.state.built).toEqual([]);
    expect(s.state.underway).toEqual({});
  });

  it('T1.2: each marker shows exactly while its goal is current; goals that make tools or gear show none; it goes once begun', () => {
    for (let k = 0; k <= GOALS.length; k++) {
      const s = setup(), done = GOALS.slice(0, k);
      s.state.goalsDone = done.map(g => g.id);
      for (const g of done) { const def = g.makes ? makeDef(g.makes) : null; if (def?.gives.kind === 'structure') s.state.built.push(def.id); }
      const now = GOALS[k]?.makes;
      for (const id of BASE) expect(markerShown(s.state, CAMP, id), `${GOALS[k]?.id ?? 'all done'}: ${id}`).toBe(id === now);
      if (now && BASE.includes(now as MakeId)) {
        s.state.underway[now as MakeId] = 0;
        expect(markerShown(s.state, CAMP, now as MakeId), now).toBe(false);
      }
    }
  });

  it('T1.3: the training dummy has no marker, no Build row and can\'t be begun in chapter 1', () => {
    const chest = GOALS.findIndex(g => g.makes === 'chest');
    for (let k = 0; k <= chest; k++) {
      const s = setup();
      s.state.goalsDone = GOALS.slice(0, k).map(g => g.id);
      s.state.bank = { ...MAKES.dummy.needs };
      expect(markerShown(s.state, CAMP, 'dummy'), GOALS[k]!.id).toBe(false);
      expect(unlocked(s.state, CAMP, 'dummy'), GOALS[k]!.id).toBe(false);
      expect(buildRows(s.state, CAMP).map(r => r.id), GOALS[k]!.id).not.toContain('dummy');
    }
  });

  it('T1.4: a goal done whose thing isn\'t built (a hand-edited save) shows a marker and a Build row, and can be built', () => {
    const s = setup();
    s.state.goalsDone = ['salvage', 'campfire', 'stone_axe', 'firewood'];
    s.state.tools.axe = true; s.state.hasBook = true;
    expect(currentGoal(s.state).id).toBe('shelter');
    for (const id of ['campfire', 'woodpile', 'shelter'] as MakeId[]) {
      expect(markerShown(s.state, CAMP, id), id).toBe(true);
      expect(buildRows(s.state, CAMP).map(r => r.id), id).toContain(id);
    }
    expect(markerShown(s.state, CAMP, 'chest')).toBe(false);
    s.state.player.backpack = { plank: 7, stone: 4 };              // (the shelter's goal keeps 4 of the planks)
    send(s, { type: 'build', id: 'campfire' });
    expect(s.state.underway).toEqual({ campfire: 0 });
    expect(s.state.player.backpack).toEqual({ plank: 4 });
    runUntil(s, () => s.state.built.includes('campfire'), 60);
    expect(s.state.built).toEqual(['campfire']);
  });

  it('T1.5: the build command for a thing whose goal hasn\'t come up is refused: goalFirst, nothing taken, he stays put; nothing at all in the village', () => {
    const s = setup(), start = { ...s.state.player.pos };
    s.state.player.backpack = { ...MAKES.campfire.needs, ...MAKES.dummy.needs };
    const pack = { ...s.state.player.backpack };
    send(s, { type: 'build', id: 'campfire' });
    expect(s.log.at(-1)).toEqual({ type: 'goalFirst', make: 'campfire', goal: 'salvage' });
    send(s, { type: 'build', id: 'dummy' });
    expect(s.log.at(-1)).toEqual({ type: 'goalFirst', make: 'dummy', goal: 'salvage' });
    run(s, 2);
    expect(s.state.underway).toEqual({});
    expect(s.state.player.backpack).toEqual(pack);
    expect(s.state.player.pos).toEqual(start);
    const v = setup(VILLAGE);
    v.state.player.backpack = { ...pack };
    for (const id of STAGED_IDS) { send(v, { type: 'build', id }); expect(markerShown(v.state, VILLAGE, id), id).toBe(false); }
    expect(v.log).toEqual([]);
    expect(v.state.underway).toEqual({});
  });
});

describe('everything built in stages, with Carpentry XP (In 2, In 3)', () => {
  it('T2.1: begun at the press, for each of the nine: what it needs taken at once, from the backpack first, then the chest; underway 0; told; nothing more taken after', () => {
    for (const id of STAGED_IDS) {
      const s = readyFor(id);
      // all but one of each in the backpack, the last in the chest
      const needs = MAKES[id].needs;
      s.state.player.backpack = Object.fromEntries(Object.entries(needs).filter(([, n]) => n > 1).map(([i, n]) => [i, n - 1]));
      for (const item of Object.keys(needs)) s.state.bank[item] = (s.state.bank[item] ?? 0) + 1;
      const bank = { ...s.state.bank };
      send(s, { type: 'build', id });
      expect(s.state.underway, id).toEqual({ [id]: 0 });
      expect(of(s, 'begun'), id).toEqual([{ type: 'begun', make: id }]);
      expect(s.state.player.backpack, id).toEqual({});
      for (const item of Object.keys(needs)) expect(s.state.bank[item] ?? 0, `${id} ${item}`).toBe(bank[item]! - 1);
      expect(s.state.player.pending, id).toEqual({ kind: 'raise', id });
      const after = Object.fromEntries(Object.keys(needs).map(i => [i, owned(s.state, i)]));
      runUntil(s, () => s.state.built.includes(id), MAKES[id].time + 60);
      expect(s.state.built, id).toContain(id);
      for (const item of Object.keys(needs)) expect(owned(s.state, item), `${id} ${item}`).toBe(after[item]);
    }
  });

  it('T2.2: four stages, footings, frame, half built, built, each told once as it goes up', () => {
    for (const id of STAGED_IDS) {
      const s = camp(), t = MAKES[id].time;
      s.state.built = s.state.built.filter(b => b !== id);
      expect(stageOf(s.state, id), id).toBe(-1);
      for (const [worked, stage] of [[0, 0], [t / 3 - 0.01, 0], [t / 3, 1], [2 * t / 3, 2], [t - 0.01, 2]] as const) {
        s.state.underway = { [id]: worked };
        expect(stageOf(s.state, id), `${id} at ${worked}`).toBe(stage);
      }
      s.state.underway = {}; s.state.built.push(id);
      expect(stageOf(s.state, id), id).toBe(CARPENTRY.stages);
    }
    const s = onGoal('campfire');
    send(s, { type: 'build', id: 'campfire' });
    runUntil(s, () => s.state.built.includes('campfire'), 60);
    expect(of(s, 'buildStage')).toEqual([{ type: 'buildStage', make: 'campfire', stage: 1 }, { type: 'buildStage', make: 'campfire', stage: 2 }]);
    expect(of(s, 'made')).toEqual([{ type: 'made', make: 'campfire' }]);
  });

  it('T2.3, T3.2: each of the camp\'s first five at Carpentry 1 stands after exactly its time of work, for its knocks\' XP, earned only while he builds', () => {
    for (const id of BASE) {
      const s = onGoal(id);
      expect(s.state.skills.carpentry).toBe(0);
      s.events.on(e => { if (e.type === 'xpGained' && e.skill === 'carpentry') expect(s.state.player.task, id).toEqual({ kind: 'raise', id }); });
      send(s, { type: 'build', id });
      runUntil(s, () => s.state.player.task.kind === 'raise', 30);
      const from = s.state.time;
      runUntil(s, () => s.state.built.includes(id), MAKES[id].time + 5);
      expect(s.state.time - from, id).toBeGreaterThan(MAKES[id].time - 1.5 * STEP);
      expect(s.state.time - from, id).toBeLessThan(MAKES[id].time + 1.5 * STEP);
      expect(s.state.skills.carpentry, id).toBe(Math.floor(MAKES[id].time / CARPENTRY.knock) * CARPENTRY.xp);
      // (each from no Carpentry: level 2, 80 XP, comes no sooner than the tent's last knock)
      expect(levelFor(s.state.skills.carpentry - CARPENTRY.xp), id).toBe(1);
    }
  });

  it('T2.3: no other action gives Carpentry XP: a long run of gathering, making, cooking and fighting gives none', () => {
    const s = camp();
    s.state.equipment.weapon = 'stone_club';
    const orders: Command[] = [
      { type: 'work', nodeId: CAMP.nodes.find(n => n.resource === 'birch_tree')!.id }, { type: 'fight', target: 'dummy' },
      { type: 'pickup', id: CAMP.pickups!.find(p => p.kind === 'stone')!.id }, { type: 'cook' }, { type: 'visit', id: 'chest' },
    ];
    s.state.bank.raw_fish = 4;
    for (const c of orders) { send(s, c); run(s, 40); }
    expect(s.state.skills.carpentry).toBe(0);
    expect(of(s, 'xpGained').filter(e => e.skill === 'carpentry')).toEqual([]);
  });

  it('T4.3: Carpentry shows in the Skills window once it has XP', () => {
    const s = onGoal('campfire');
    expect(shownSkills(s.state)).not.toContain('carpentry');
    send(s, { type: 'build', id: 'campfire' });
    runUntil(s, () => s.state.skills.carpentry > 0, 30);
    expect(shownSkills(s.state)).toContain('carpentry');
  });

  it('T4.4, D5: a higher Carpentry level builds a little quicker (+1% a level above 1), for the same XP; the Build list says how long', () => {
    expect(buildSpeed(setup().state)).toBe(1);
    const times: number[] = [];
    for (const level of [1, 11]) {
      const s = onGoal('campfire');
      s.state.skills.carpentry = XP_TABLE[level]!;
      expect(buildSpeed(s.state)).toBeCloseTo(1 + (level - 1) * CARPENTRY.speed);
      expect(buildTime(s.state, 'campfire')).toBeCloseTo(MAKES.campfire.time / buildSpeed(s.state));
      send(s, { type: 'build', id: 'campfire' });
      runUntil(s, () => s.state.player.task.kind === 'raise', 30);
      const from = s.state.time, xp = s.state.skills.carpentry;
      runUntil(s, () => s.state.built.includes('campfire'), 60);
      times.push(s.state.time - from);
      expect(s.state.skills.carpentry - xp).toBe(24);
    }
    expect(times[0]!).toBeCloseTo(MAKES.campfire.time, 0);
    expect(times[1]!).toBeCloseTo(MAKES.campfire.time / 1.1, 0);
    // the upgrades, from no Carpentry: the levels gained on the way make them a little quicker, never slower
    for (const id of UPGRADE_IDS) {
      const s = readyFor(id);
      send(s, { type: 'build', id });
      runUntil(s, () => s.state.player.task.kind === 'raise', 30);
      const from = s.state.time;
      runUntil(s, () => s.state.built.includes(id), MAKES[id].time + 5);
      expect(s.state.time - from, id).toBeLessThan(MAKES[id].time + 1.5 * STEP);
      expect(s.state.time - from, id).toBeGreaterThan(MAKES[id].time / buildSpeed(s.state) - 1.5 * STEP);
    }
    // half done, the Build list's time is what is left
    const c = camp(); c.state.underway = { woodshed: 45 };
    expect(buildTime(c.state, 'woodshed')).toBeCloseTo(45);
    c.state.underway = {}; c.state.built.push('woodshed');
    expect(buildTime(c.state, 'woodshed')).toBe(0);
  });

  it('T2.7: the goal\'s own materials build its building: at the campfire\'s goal with 3 planks and 4 stones, it begins', () => {
    const s = onGoal('campfire');
    s.state.player.backpack = { plank: 3, stone: 4 };
    expect(lacking(s.state, MAKES.campfire)).toEqual({});
    send(s, { type: 'build', id: 'campfire' });
    expect(s.state.underway).toEqual({ campfire: 0 });
    expect(s.state.player.backpack).toEqual({});
  });

  it('T2.8: a begun goal building keeps the goal satisfied: its lines ticked, no more chopping for it, the next step is to carry on, the bot builds', () => {
    const s = onGoal('shelter');
    const goal = currentGoal(s.state);
    send(s, { type: 'build', id: 'shelter' });
    expect(owned(s.state, 'birch_logs')).toBe(0);
    expect(goalPaid(s.state, goal)).toBe(true);
    expect(goalLines(s.state, goal).every(l => l.done && l.got === l.need)).toBe(true);
    expect(goalHasEnough(s.state, CAMP, 'birch_logs')).toBe(goal);
    expect(currentGoal(s.state)).toBe(goal);
    // he is on his way: the next step is what he does; sent off elsewhere, it is to carry on
    expect(nextStep(s.state, CAMP)).toEqual({ busy: true });
    send(s, { type: 'walk', to: { x: 6, z: -4 } });
    expect(nextStep(s.state, CAMP)).toEqual({ commands: [{ type: 'build', id: 'shelter' }] });
    const bot = new Bot(CAMP, s.events);
    expect(bot.plan(s.state)).toMatchObject({ items: {}, make: 'shelter' });
    expect(bot.decide(s.state)).toEqual([{ type: 'build', id: 'shelter' }]);
    // chopping a birch for it stops at once: the goal has enough
    send(s, { type: 'work', nodeId: CAMP.nodes.find(n => n.resource === 'birch_tree')!.id });
    runUntil(s, () => of(s, 'goalEnough').length > 0, 120);
    expect(of(s, 'goalEnough')[0]).toEqual({ type: 'goalEnough', item: 'birch_logs', goal: 'shelter' });
    expect(owned(s.state, 'birch_logs')).toBeLessThanOrEqual(1);
    // and he goes back to the tent by himself, and it stands
    runUntil(s, () => s.state.built.includes('shelter'), 200);
    expect(s.state.built).toContain('shelter');
  });

  it('T2.9: one build at a time (D8): with the wall tent begun, the stone hearth is refused with why, and nothing is taken', () => {
    const c = camp();
    send(c, { type: 'build', id: 'wall_tent' });
    const bank = { ...c.state.bank };
    send(c, { type: 'build', id: 'stone_hearth' });
    expect(c.log.at(-1)).toEqual({ type: 'cantBuild', make: 'stone_hearth', reason: 'busy', other: 'wall_tent' });
    expect(c.state.underway).toEqual({ wall_tent: 0 });
    expect(c.state.bank).toEqual(bank);
    expect(c.state.player.pending).toEqual({ kind: 'raise', id: 'wall_tent' });
    // the next step for a goal that builds something waits for the one under way (none in chapters 1 and 2 play)
    const s = onGoal('dummy');
    s.state.underway = { woodshed: 10 };
    expect(nextStep(s.state, CAMP)).toEqual({ commands: [{ type: 'build', id: 'woodshed' }] });
  });

  it('T2.10: the firewood pile\'s logs: none in it while it goes up, its 10 once it stands; stoking meanwhile takes them from the chest', () => {
    const c = camp(19.7);
    c.state.built = c.state.built.filter(id => id !== 'woodpile');    // (a hand-edited save: everything else stands)
    c.state.player.pos = { x: 6, z: 0 };
    c.state.bank = { birch_logs: MAKES.woodpile.needs.birch_logs! + 5 };
    send(c, { type: 'build', id: 'woodpile' });
    expect(c.state.woodpile).toBe(0);
    expect(c.state.bank.birch_logs).toBe(5);
    runUntil(c, () => of(c, 'stoked').length > 0, 120);
    expect(c.state.woodpile).toBe(0);
    expect(c.state.bank.birch_logs).toBe(5 - STOKE.logs);           // from the chest, not the pile going up
    runUntil(c, () => c.state.built.includes('woodpile'), 120);
    expect(c.state.woodpile).toBe(MAKES.woodpile.needs.birch_logs);
  });

  it('T2.15: a begun thing\'s Making page in his book has every line ticked; its goal\'s page too', () => {
    const s = onGoal('chest');
    s.state.thoughts.known.push(makeKey('chest'));
    const page = () => survivalPages(s.state).find(p => p.key === makeKey('chest'))!;
    expect(page().lines.every(l => l.done)).toBe(true);
    send(s, { type: 'build', id: 'chest' });
    expect(owned(s.state, 'copper_ore')).toBe(0);
    expect(page().lines.every(l => l.done && l.got === l.need)).toBe(true);
    expect(page().done).toBe(false);
  });

  it('fast taps on Build: begun once, taken once', () => {
    const s = onGoal('dummy');
    s.state.bank = { ...MAKES.dummy.needs };
    for (let i = 0; i < 3; i++) send(s, { type: 'build', id: 'dummy' });
    expect(of(s, 'begun')).toHaveLength(1);
    expect(s.state.bank).toEqual(MAKES.dummy.needs);
    expect(s.state.player.backpack).toEqual({});
  });

  it('knocked out, Build is refused with a notice and nothing is taken; asleep, it waits until he wakes', () => {
    const c = camp();
    knockOut(c.state, ratsOf(CAMP)[0]!.id, c.events);
    const bank = { ...c.state.bank };
    send(c, { type: 'build', id: 'woodshed' });
    expect(c.log.at(-1)).toEqual({ type: 'cantBuild', make: 'woodshed', reason: 'down' });
    expect(c.state.underway).toEqual({});
    expect(c.state.bank).toEqual(bank);
    // asleep: kept as the last thing tapped, done when he wakes
    const n = camp(22);
    n.state.stokedNight = Math.floor(n.state.time / DAY_SECONDS - STOKE.at);
    send(n, { type: 'sleep' });
    runUntil(n, () => n.state.player.task.kind === 'sleep', 60);
    send(n, { type: 'build', id: 'woodshed' });
    expect(n.state.needs.later).toEqual({ type: 'build', id: 'woodshed' });
    expect(n.state.underway).toEqual({});
    runUntil(n, () => of(n, 'awake').length > 0, DAY_SECONDS);
    run(n, 0.2);
    expect(n.state.underway).toEqual({ woodshed: 0 });
    expect(n.state.player.pending).toEqual({ kind: 'raise', id: 'woodshed' });
  });

  it('a half-built campfire saved and loaded keeps its stage and progress, and he carries on', () => {
    const s = onGoal('campfire');
    send(s, { type: 'build', id: 'campfire' });
    runUntil(s, () => stageOf(s.state, 'campfire') === 1, 60);
    const back = deserialize(serialize(s.state), CAMP);
    expect(back).toEqual(s.state);
    expect(stageOf(back, 'campfire')).toBe(1);
    expect(back.player.task).toEqual({ kind: 'raise', id: 'campfire' });
    const r = { ...setup(), state: back };
    runUntil(r, () => back.built.includes('campfire'), MAKES.campfire.time);
    expect(back.built).toContain('campfire');
    expect(back.skills.carpentry).toBe(24);
  });
});

describe('committed: he goes back to what is half built (In 2, D9)', () => {
  /** Runs `s` for `seconds`, checking the build's progress never drops; returns the most it reached. */
  const watch = (s: Setup, id: MakeId, done: () => boolean, seconds: number) => {
    let most = s.state.underway[id] ?? 0;
    for (let t = 0; t < seconds && !done(); t += STEP) {
      step(s.state, STEP, s.ctx);
      const now = s.state.built.includes(id) ? MAKES[id].time : s.state.underway[id];
      expect(now, `${id} at ${t.toFixed(1)} s`).toBeDefined();
      expect(now!, `${id} at ${t.toFixed(1)} s`).toBeGreaterThanOrEqual(most);
      most = now!;
    }
    return most;
  };

  it('T2.6: nightfall during the tent: he stokes the fire, then comes back and finishes it', () => {
    const s = onGoal('shelter', 19.75);
    send(s, { type: 'build', id: 'shelter' });
    watch(s, 'shelter', () => of(s, 'stoked').length > 0, 120);
    expect(of(s, 'stokeOff')).toHaveLength(1);
    expect(s.state.player.pending).toEqual({ kind: 'raise', id: 'shelter' });
    watch(s, 'shelter', () => s.state.built.includes('shelter'), 120);
    expect(s.state.built).toContain('shelter');
  });

  it('T2.6: hungry while he builds, he eats at the chest, then comes back', () => {
    const c = camp();
    c.state.bank.cooked_fish = 6;
    send(c, { type: 'build', id: 'wall_tent' });
    runUntil(c, () => c.state.player.task.kind === 'raise', 30);
    c.state.needs.fullness = 0.3;
    watch(c, 'wall_tent', () => of(c, 'meal').length > 0, 60);
    expect(of(c, 'mealOff')).toHaveLength(1);
    expect(of(c, 'meal')).toHaveLength(1);
    run(c, 0.2);
    expect(backAt(c, 'wall_tent')).toBe(true);
    watch(c, 'wall_tent', () => c.state.built.includes('wall_tent'), MAKES.wall_tent.time + 30);
    expect(c.state.built).toContain('wall_tent');
  });

  it('T2.6: at bedtime he goes to bed, gets up, then comes back', () => {
    const c = camp(SLEEP.bedtime + 24 - 0.1);
    c.state.stokedNight = Math.floor(c.state.time / DAY_SECONDS - STOKE.at);
    send(c, { type: 'build', id: 'wall_tent' });
    watch(c, 'wall_tent', () => c.state.player.task.kind === 'sleep', 60);
    expect(of(c, 'bedtime')).toHaveLength(1);
    expect(c.state.needs.bed?.back).toEqual({ raise: 'wall_tent' });
    watch(c, 'wall_tent', () => of(c, 'awake').length > 0, DAY_SECONDS);
    run(c, 0.2);
    expect(backAt(c, 'wall_tent')).toBe(true);
    watch(c, 'wall_tent', () => c.state.built.includes('wall_tent'), MAKES.wall_tent.time + 30);
    expect(c.state.built).toContain('wall_tent');
  });

  it('T2.6: a tree tapped while he sleeps: on waking he chops until the goal has enough, then comes back', () => {
    const s = onGoal('dummy', SLEEP.bedtime + 24 - 0.1);
    s.state.player.backpack = { branch: 4 };                       // the dummy's goal still wants its logs
    s.state.stokedNight = Math.floor(s.state.time / DAY_SECONDS - STOKE.at);
    s.state.underway = { wall_tent: 30 };                           // (begun earlier: he goes back to it, until bedtime)
    runUntil(s, () => s.state.player.task.kind === 'sleep', 120);
    expect(s.state.player.task.kind).toBe('sleep');
    const worked = s.state.underway.wall_tent!;
    send(s, { type: 'work', nodeId: CAMP.nodes.find(n => n.resource === 'birch_tree')!.id });
    expect(s.state.needs.later?.type).toBe('work');
    watch(s, 'wall_tent', () => of(s, 'awake').length > 0, DAY_SECONDS);
    run(s, 0.2);
    expect(s.state.player.pending?.kind).toBe('node');
    watch(s, 'wall_tent', () => of(s, 'goalEnough').length > 0, 600);
    expect(owned(s.state, 'birch_logs')).toBe(MAKES.dummy.needs.birch_logs);
    run(s, 0.2);
    expect(backAt(s, 'wall_tent')).toBe(true);
    expect(s.state.underway.wall_tent).toBe(worked);                 // nothing done meanwhile
  });

  it('T2.6: a tap on the ground: he walks there, waits a moment (RESUME.wait), then comes back', () => {
    const c = camp();
    send(c, { type: 'build', id: 'stone_hearth' });
    runUntil(c, () => c.state.player.task.kind === 'raise', 30);
    run(c, 3);
    send(c, { type: 'walk', to: { x: -2, z: -4 } });
    watch(c, 'stone_hearth', () => c.state.player.task.kind === 'idle', 30);
    const there = c.state.time;
    watch(c, 'stone_hearth', () => c.state.player.pending?.kind === 'raise', 30);
    expect(c.state.time - there).toBeGreaterThanOrEqual(RESUME.wait - STEP);
    expect(c.state.time - there).toBeLessThan(RESUME.wait + 2 * STEP);
  });

  it('T2.6: fighting a rat, he doesn\'t go back while the fight goes on', () => {
    const c = camp();
    c.state.equipment.weapon = 'stone_club';
    for (const k of ['attack', 'strength', 'defence', 'vitality'] as const) c.state.skills[k] = XP_TABLE[40]!;
    c.state.health = 200;
    c.state.player.backpack = { cooked_fish: 5 };
    send(c, { type: 'build', id: 'woodshed' });
    runUntil(c, () => c.state.player.task.kind === 'raise', 30);
    send(c, { type: 'fight', target: ratsOf(CAMP)[0]!.id });
    for (let t = 0; t < 180; t += STEP) {
      step(c.state, STEP, c.ctx);
      expect(c.state.player.pending?.kind, `${t.toFixed(1)} s`).not.toBe('raise');
      expect(c.state.player.task.kind, `${t.toFixed(1)} s`).not.toBe('raise');
    }
    expect(of(c, 'knockedOut')).toEqual([]);
    expect(of(c, 'beaten').length).toBeGreaterThan(0);
  });

  it('T2.6: knocked out, he wakes at the camp and comes back', () => {
    const c = camp();
    send(c, { type: 'build', id: 'woodshed' });
    runUntil(c, () => c.state.player.task.kind === 'raise', 30);
    knockOut(c.state, ratsOf(CAMP)[0]!.id, c.events);
    watch(c, 'woodshed', () => of(c, 'wokeUp').length > 0, 10);
    run(c, 0.2);
    expect(backAt(c, 'woodshed')).toBe(true);
  });

  it('T2.12: with no way there he looks again a while later, saying so once; the way open again, he goes', () => {
    // the woodpile's spot ringed with rocks (a test layout): no way to stand beside the woodshed
    const place = stepPlace(CAMP, 'woodshed')!, r = SHAPES.woodshed!.reach + 0.6;
    const ringed: Layout = { ...CAMP, props: [...CAMP.props, ...Array.from({ length: 28 }, (_, i) => {
      const a = i / 28 * Math.PI * 2;
      return { kind: 'crates', pos: { x: place.pos.x + Math.cos(a) * r, z: place.pos.z + Math.sin(a) * r }, rot: 0, radius: 0.55 } as Layout['props'][number];
    })] };
    const c = setup(ringed);
    Object.assign(c.state, camp().state);
    send(c, { type: 'build', id: 'woodshed' });
    expect(c.state.underway).toEqual({ woodshed: 0 });              // begun: what it needs is taken
    expect(of(c, 'noPath')).toHaveLength(1);                        // told by the build command
    expect(c.state.resumeAt).toBeCloseTo(c.state.time + RESUME.retry);
    let tries = 0, at = c.state.resumeAt;
    for (let t = 0; t < 45; t += STEP) {
      step(c.state, STEP, c.ctx);
      if (c.state.resumeAt !== at) { tries++; expect(c.state.resumeAt - at).toBeGreaterThanOrEqual(RESUME.retry - 1e-6); at = c.state.resumeAt; }
    }
    expect(tries).toBeGreaterThanOrEqual(3);                        // a look every RESUME.retry seconds, no more often
    expect(of(c, 'noPath')).toHaveLength(1);                        // ...and nothing more said
    // the rocks gone (the camp as it is): the next look finds the way
    c.ctx.layout = CAMP; c.layout = CAMP;
    runUntil(c, () => c.state.player.pending?.kind === 'raise', RESUME.retry + 1);
    expect(c.state.player.pending).toEqual({ kind: 'raise', id: 'woodshed' });
  });

  it('T2.13: away catch-up finishes a begun build, and the note counts it', () => {
    const c = camp();
    send(c, { type: 'build', id: 'stone_hearth' });
    runUntil(c, () => (c.state.underway.stone_hearth ?? 0) > 10, 60);
    const { summary } = catchUpAway(c.state, 1, 1 + 10 * 60_000, c.ctx);
    expect(c.state.built).toContain('stone_hearth');
    expect(summary.made).toEqual(['stone_hearth']);
  });

  it('T2.14: begun while he stands inside it, he is on open ground within a second, and never inside it after', () => {
    const tent = stepPlace(CAMP, 'shelter')!, fire = CAMP.hearth.pos;
    const cases: [MakeId, Vec2][] = [
      ['wall_tent', toGround(tent, SHAPES.shelter!.stands![0]!)],                                  // the tent's door
      ['stone_hearth', { x: fire.x, z: fire.z - (CAMP.hearth.radius + 0.6) }],                    // the campfire's side
    ];
    for (const [id, from] of cases) {
      const c = camp();
      c.state.player.pos = { ...from };
      expect(walkGrid(c.state, CAMP).walkable(from), id).toBe(true);
      send(c, { type: 'build', id });
      expect(outsideOf(CAMP, id, from) < 0.35 || !walkGrid(c.state, CAMP).walkable(from), `${id}: he starts inside it`).toBe(true);
      for (let t = 0; t < 20; t += STEP) {
        step(c.state, STEP, c.ctx);
        if (t >= 1) expect(walkGrid(c.state, CAMP).walkable(c.state.player.pos), `${id} at ${t.toFixed(2)} s`).toBe(true);
        if (t >= 1) expect(outsideOf(CAMP, id, c.state.player.pos), `${id} at ${t.toFixed(2)} s`).toBeGreaterThan(0);
      }
      expect(c.state.player.task, id).toEqual({ kind: 'raise', id });
    }
  });

  it('T2.5: committed, whatever he is sent to do: 200 seeded runs of taps, never two under way, never less done, nothing given back, never left standing', { timeout: 60_000 }, () => {
    const kinds: ((s: Setup, r: () => number) => Command | null)[] = [
      (_, r) => ({ type: 'walk', to: { x: -8 + r() * 16, z: -4 + r() * 14 } }),
      (_, r) => ({ type: 'work', nodeId: CAMP.nodes[Math.floor(r() * CAMP.nodes.length)]!.id }),
      (_, r) => ({ type: 'pickup', id: CAMP.pickups![Math.floor(r() * CAMP.pickups!.length)]!.id }),
      () => ({ type: 'visit', id: 'chest' }), () => ({ type: 'cook' }), () => ({ type: 'fight', target: 'dummy' }),
      (_, r) => ({ type: 'fight', target: ratsOf(CAMP)[Math.floor(r() * 3)]!.id }), () => ({ type: 'sleep' }), () => ({ type: 'next' }),
      (_, r) => ({ type: 'build', id: STAGED_IDS[Math.floor(r() * STAGED_IDS.length)]! }),
      s => { const item = Object.keys(s.state.player.backpack)[0]; return item ? { type: 'drop', item, count: 1 } : null; },
      () => ({ type: 'eat', item: 'cooked_fish' }),
    ];
    const limit = RESUME.wait + RESUME.retry + 1;
    for (let run = 0; run < 200; run++) {
      const rng = createRng(1000 + run), r = () => rng.next();
      const id = STAGED_IDS[run % STAGED_IDS.length]!, s = readyFor(id, 8 + r() * 14);
      s.ctx.rng = createRng(run);
      s.state.equipment.weapon = 'stone_club'; s.state.tools.rod = true;
      s.state.player.backpack.cooked_fish = 3; s.state.bank.raw_fish = 2;
      send(s, { type: 'build', id });
      expect(s.state.underway, `run ${run}`).toEqual({ [id]: 0 });
      let most = 0, standing = 0;
      for (let k = 0; k < 5; k++) {
        const c = kinds[Math.floor(r() * kinds.length)]!(s, r);
        if (c) send(s, c);
        const until = s.state.time + 1 + r() * 11;
        while (s.state.time < until) {
          step(s.state, STEP, s.ctx);
          const begun = begunIds(s.state);
          expect(begun.length, `run ${run}`).toBeLessThanOrEqual(1);
          if (s.state.built.includes(id)) { most = MAKES[id].time; continue; }
          expect(begun, `run ${run}: ${id} never dropped`).toEqual([id]);
          expect(s.state.underway[id]!, `run ${run}`).toBeGreaterThanOrEqual(most);
          most = s.state.underway[id]!;
          standing = free(s) ? standing + STEP : 0;
          expect(standing, `run ${run}: standing about with the ${id} half built, ${JSON.stringify(s.state.player)}`).toBeLessThan(limit);
        }
      }
      expect(of(s, 'begun').filter(e => e.make === id), `run ${run}`).toHaveLength(1);
      expect(badNumbers(s.state), `run ${run}`).toEqual([]);
    }
  });
});

/** Every number in a game that isn't finite (NaN or Infinity crept in), by its path. */
function badNumbers(v: unknown, path = 'state'): string[] {
  if (typeof v === 'number') return Number.isFinite(v) ? [] : [path];
  if (Array.isArray(v)) return v.flatMap((x, i) => badNumbers(x, `${path}[${i}]`));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => badNumbers(x, `${path}.${k}`));
  return [];
}
