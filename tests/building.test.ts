// Building it yourself (the owner, 12 Oct 2026): Carpentry, the Build window's list, placing things on a grid where
// they fit (core/building.ts), building them in stages over time (systems/building.ts), the shelter's upgrades with
// sleeping in each, the new materials (fibre from reeds, clay, bark peeled while chopping birch), and saves.
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
  bestShelter, buildOpen, buildRows, buildSite, fitOf, inSight, placeStart, placedRects, rectOf, restBonus, savedBuilding,
  shelterShown, snap, stageOf, STAGED_IDS, walkGrid,
} from '../src/core/building';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, siteOf, type Layout, type Vec2 } from '../src/world/layout';
import { navFor } from '../src/world/nav';
import { waterOf } from '../src/world/water';
import { applyCommands, type Command } from '../src/systems/commands';
import { restedFactor } from '../src/systems/sleep';
import { canMake } from '../src/systems/making';
import { wantsBark } from '../src/systems/building';
import { BARK, CARPENTRY, PLACE, SHELTERS, SOURCES, STAGED } from '../src/data/building';
import { MAKES, type MakeId } from '../src/data/making';
import { ITEMS, SKILLS } from '../src/data/skills';
import { PICKUPS } from '../src/data/pickups';
import { SLEEP } from '../src/data/sleep';
import { STOKE } from '../src/data/fire';
import { GOALS } from '../src/data/goals';
import { XP_TABLE, levelFor } from '../src/data/xp';
import { ITEM_PICTURES, SKILL_ICONS } from '../src/ui/pictures';
import { workTime } from '../src/ui/build';
import { BuildingView } from '../src/render/building';

const at = (day: number, hour: number) => (day + hour / 24) * DAY_SECONDS;
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

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

/** A camp set up (every goal done, so none stops his gathering): the fire, the pile, the shelter and the chest, plenty of
 *  everything in the chest, by day, him standing on open grass south of the fire. */
function camp(hour = 10): Setup {
  const s = setup();
  s.state.goalsDone = GOALS.map(g => g.id);
  s.state.built = ['campfire', 'woodpile', 'shelter', 'chest'];
  s.state.tools = { axe: true, pick: true, rod: true };
  s.state.hasBook = true;
  s.state.bank = { birch_logs: 60, branch: 10, fibre: 20, bark: 12, clay: 20 };
  s.state.time = at(1, hour);
  s.state.player.pos = { x: 3, z: -1 };
  return s;
}

/** A spot on open grass west of the fire where the log bench fits (checked in the first test). */
const OPEN: Vec2 = { x: -1, z: -2.5 };

describe('the data', () => {
  it('Carpentry is a skill with an icon, and the new materials are items with pictures', () => {
    expect(SKILLS.carpentry.name).toBe('Carpentry');
    expect(SKILL_ICONS.carpentry).toContain('<path');
    for (const id of ['fibre', 'bark', 'clay']) { expect(ITEMS[id], id).toBeDefined(); expect(ITEM_PICTURES[id], id).toBeDefined(); }
  });

  it('each new material says where it comes from, for the Build list, and each is needed by something built in stages', () => {
    expect(Object.keys(SOURCES).sort()).toEqual(['bark', 'clay', 'fibre']);
    for (const [id, line] of Object.entries(SOURCES)) {
      expect(line.length, id).toBeGreaterThan(10);
      expect(STAGED_IDS.some(s => (MAKES[s].needs[id] ?? 0) > 0), id).toBe(true);
    }
  });

  it('things built in stages are structures in MAKES, each with what it needs, a time, a level, and its place', () => {
    expect(STAGED_IDS).toEqual(['log_bench', 'workbench', 'lean_to', 'log_hut']);
    for (const id of STAGED_IDS) {
      const def = MAKES[id], staged = STAGED[id]!;
      expect(def.gives.kind, id).toBe('structure');
      expect(def.time, id).toBeGreaterThanOrEqual(30);
      expect(Object.keys(def.needs).length, id).toBeGreaterThan(0);
      for (const item of Object.keys(def.needs)) expect(ITEMS[item], `${id} ${item}`).toBeDefined();
      if (def.at === 'placed') expect(staged.size, id).toBeDefined(); else expect(def.at, id).toBe('tent');
      if (staged.upgrades) expect(SHELTERS.indexOf(staged.upgrades)).toBe(SHELTERS.indexOf(id) - 1);
    }
    // the shelter's upgrades use the new materials: the lean-to logs, bark and fibre; the log hut many logs and clay
    expect(Object.keys(MAKES.lean_to.needs).sort()).toEqual(['bark', 'birch_logs', 'fibre']);
    expect(MAKES.log_hut.needs.birch_logs).toBeGreaterThanOrEqual(15);
    expect(MAKES.log_hut.needs.clay).toBeGreaterThan(0);
    // a better shelter rests him a little better
    expect(STAGED.lean_to!.rest!).toBeGreaterThan(SLEEP.bonus);
    expect(STAGED.log_hut!.rest!).toBeGreaterThan(STAGED.lean_to!.rest!);
  });

  it('the Carpentry levels can be reached in order: the small things train enough for the lean-to, the lean-to for the hut', () => {
    const xp = (id: MakeId) => Math.floor(MAKES[id].time / CARPENTRY.knock) * CARPENTRY.xp;
    expect(levelFor(xp('log_bench') + xp('workbench'))).toBeGreaterThanOrEqual(STAGED.lean_to!.level);
    expect(levelFor(xp('log_bench') + xp('workbench') + xp('lean_to'))).toBeGreaterThanOrEqual(STAGED.log_hut!.level);
    expect(XP_TABLE[STAGED.lean_to!.level]!).toBeGreaterThan(Math.max(xp('log_bench'), xp('workbench')));
  });

  it('the main goal path is unchanged: no goal makes any of them', () => {
    for (const g of GOALS) expect(STAGED_IDS as string[]).not.toContain(g.makes);
  });

  it('says how long the work takes plainly', () => {
    expect([30, 45, 60, 90, 180, 150].map(workTime)).toEqual(['30 seconds', '45 seconds', 'a minute', 'a minute and a half', '3 minutes', '2 and a half minutes']);
  });
});

describe('the Build list', () => {
  it('is empty until the camp is set up (the chest stands), then lists what he can build', () => {
    const s = setup();
    expect(buildOpen(s.state, CAMP)).toBe(false);
    expect(buildRows(s.state, CAMP)).toEqual([]);
    const c = camp();
    expect(buildOpen(c.state, CAMP)).toBe(true);
    expect(buildRows(c.state, CAMP).map(r => r.id)).toEqual(['log_bench', 'workbench', 'lean_to']);   // the hut waits for the lean-to
    const lean = buildRows(c.state, CAMP).find(r => r.id === 'lean_to')!;
    expect(lean.levelOk).toBe(false);                           // Carpentry 2
    c.state.bank = {};
    expect(buildRows(c.state, CAMP).find(r => r.id === 'log_bench')!.missing).toEqual(MAKES.log_bench.needs);
  });

  it('the village has no Build button, and the build command does nothing there', () => {
    const s = setup(VILLAGE);
    s.state.built = ['campfire', 'chest'];
    expect(buildOpen(s.state, VILLAGE)).toBe(false);
    expect(buildRows(s.state, VILLAGE)).toEqual([]);
    send(s, { type: 'build', id: 'lean_to' });
    send(s, { type: 'build', id: 'log_bench', at: { x: 0, z: 8 }, turn: 0 });
    expect(s.state.underway).toEqual({});
    expect(s.state.placed).toEqual({});
  });

  it("the make command (the goal card's Build button, a tap on a site) never makes them in one go", () => {
    const c = camp();
    c.state.skills.carpentry = 1000;
    for (const id of STAGED_IDS) expect(canMake(c.state, CAMP, MAKES[id]), id).toBe(false);
    send(c, { type: 'make', id: 'lean_to' });
    run(c, 10);
    expect(c.state.built).not.toContain('lean_to');
  });
});

describe("the current goal's share", () => {
  it("a build never takes what the current goal still counts, so the goal's count doesn't go backwards", () => {
    const c = camp();
    c.state.goalsDone = GOALS.slice(0, GOALS.findIndex(g => g.makes === 'dummy')).map(g => g.id);
    const goal = MAKES.dummy.needs, bench = MAKES.log_bench.needs;
    c.state.bank = { birch_logs: goal.birch_logs!, branch: goal.branch! };
    expect(buildRows(c.state, CAMP).find(r => r.id === 'log_bench')!.missing).toEqual(bench);
    send(c, { type: 'build', id: 'log_bench', at: OPEN, turn: 0 });
    expect(c.state.underway).toEqual({});
    expect(of(c, 'missing')).toHaveLength(1);
    // with some to spare, it goes ahead and leaves the goal its share
    c.state.bank = { birch_logs: goal.birch_logs! + bench.birch_logs!, branch: goal.branch! + bench.branch! };
    send(c, { type: 'build', id: 'log_bench', at: OPEN, turn: 0 });
    expect(c.state.underway.log_bench).toBe(0);
    expect(owned(c.state, 'birch_logs')).toBe(goal.birch_logs);
    expect(owned(c.state, 'branch')).toBe(goal.branch);
  });
});

describe('placing', () => {
  it('fits on open grass, snapped to the half-metre grid', () => {
    const c = camp();
    expect(fitOf(c.state, CAMP, 'log_bench', OPEN, 0)).toBeNull();
    expect(fitOf(c.state, CAMP, 'log_bench', { x: OPEN.x + 0.1, z: OPEN.z - 0.2 }, 0)).toBeNull();
    expect(snap({ x: 1.26, z: -0.74 })).toEqual({ x: 1.5, z: -0.5 });
  });

  it("doesn't fit off the land, in or at the water, on the camp's spots, trees, rocks, things on the ground, the nest or him", () => {
    const c = camp(), fit = (id: MakeId, p: Vec2, turn = 0) => fitOf(c.state, CAMP, id, p, turn);
    expect(fit('log_bench', { x: 30, z: 0 })).toBe('land');
    const pool = CAMP.falls!.pool.pos;
    expect(fit('log_bench', pool)).toBe('water');
    expect(waterOf(CAMP).edge({ x: -13.5, z: 0 })).toBeLessThan(PLACE.water + 0.5);
    expect(fit('workbench', { x: -13.5, z: 0 })).toBe('water');
    for (const site of ['hearth', 'tent', 'chest', 'woodpile', 'dummy'] as const) expect(fit('log_bench', siteOf(CAMP, site)!.pos), site).toBe('blocked');
    const birch = CAMP.nodes.find(n => n.resource === 'birch_tree')!, rock = CAMP.nodes.find(n => n.resource === 'copper_rock')!;
    expect(fit('log_bench', birch.pos)).toBe('blocked');
    expect(fit('log_bench', rock.pos)).toBe('blocked');
    const stone = CAMP.pickups!.find(x => x.kind === 'stone')!;
    expect(fit('log_bench', stone.pos)).toBe('blocked');
    expect(fit('log_bench', CAMP.nests![0]!.pos)).toBe('blocked');
    expect(fit('log_bench', CAMP.goblinCamp!.pos)).toBe('blocked');
    c.state.player.pos = { ...OPEN };
    expect(fit('log_bench', OPEN)).toBe('him');
  });

  it('a quarter turn turns its footprint: a bench that touches the fire one way fits turned', () => {
    const c = camp(), fire = CAMP.hearth.pos, spot = { x: fire.x - 1.5, z: fire.z };
    expect(rectOf('log_bench', { pos: spot, turn: 1 })!.rot).toBeCloseTo(Math.PI / 2);
    expect(fitOf(c.state, CAMP, 'log_bench', spot, 0)).toBe('blocked');
    expect(fitOf(c.state, CAMP, 'log_bench', spot, 1)).toBeNull();
    expect(fitOf(c.state, CAMP, 'log_bench', spot, 2)).toBe('blocked');
  });

  it('a new copy starts beside him, where it fits', () => {
    const c = camp(), cam = { x: c.state.player.pos.x, z: c.state.player.pos.z + 10 };
    const start = placeStart(c.state, CAMP, 'workbench', cam);
    expect(fitOf(c.state, CAMP, 'workbench', start, 0)).toBeNull();
    expect(dist(start, c.state.player.pos)).toBeLessThan(6);
  });

  it("a new copy starts where it can be seen, not hidden behind the hut", () => {
    const c = camp();
    c.state.built.push('lean_to', 'log_hut');
    // the camera south of the tent's spot, him placed so the spot to his right is just behind the hut from there
    const tent = siteOf(CAMP, 'tent')!.pos, cam = { x: tent.x, z: tent.z + 12 };
    const behind = { x: tent.x, z: tent.z - 2 };
    c.state.player.pos = { x: behind.x - PLACE.ahead, z: behind.z };
    const right = snap({ x: c.state.player.pos.x + (cam.z - c.state.player.pos.z) / dist(cam, c.state.player.pos) * PLACE.ahead, z: behind.z });
    expect(inSight(c.state, CAMP, right, cam)).toBe(false);
    const start = placeStart(c.state, CAMP, 'log_bench', cam);
    expect(fitOf(c.state, CAMP, 'log_bench', start, 0)).toBeNull();
    expect(inSight(c.state, CAMP, start, cam)).toBe(true);
    expect(dist(start, c.state.player.pos)).toBeLessThan(7);
  });

  it('can go right beside the chest and the fire without blocking the way to them', () => {
    const c = camp(), chest = siteOf(CAMP, 'chest')!;
    // the nearest spot to the chest's front (towards the fire) that fits
    let best: Vec2 | null = null;
    for (let dx = -3; dx <= 3; dx += 0.5) for (let dz = -3; dz <= 3; dz += 0.5) {
      const p = snap({ x: chest.pos.x + dx, z: chest.pos.z + dz });
      if (!fitOf(c.state, CAMP, 'log_bench', p, 0) && (!best || dist(p, chest.pos) < dist(best, chest.pos))) best = p;
    }
    expect(best).not.toBeNull();
    expect(dist(best!, chest.pos)).toBeLessThan(2.2);
    send(c, { type: 'build', id: 'log_bench', at: best!, turn: 0 });
    expect(c.state.placed.log_bench).toBeDefined();
    runUntil(c, () => c.state.built.includes('log_bench'), 120);
    expect(c.state.built).toContain('log_bench');
    // the chest and the fire are still a walk away: he stores things and cooks as before
    send(c, { type: 'visit', id: 'chest' });
    expect(c.state.player.pending).toEqual({ kind: 'visit', id: 'chest' });
    runUntil(c, () => of(c, 'visited').length > 0, 30);
    expect(of(c, 'visited').at(-1)).toEqual({ type: 'visited', id: 'chest' });
    send(c, { type: 'visit', id: 'campfire' });
    expect(c.state.player.pending).toEqual({ kind: 'visit', id: 'campfire' });
  });

  it("doesn't fit where it would cut him off from part of the camp", () => {
    // a corridor of land walled across by props, with a gap a bench turned across would close
    const wall = [0, 0.6, 1.2, 1.7, 4.3, 4.9, 5.5, 6.0].map(z => ({ kind: 'crates' as const, pos: { x: 8, z }, rot: 0, radius: 0.3 }));
    const L: Layout = {
      ...CAMP, village: { minX: 0, maxX: 16, minZ: 0, maxZ: 6 }, land: [], start: { x: 2, z: 3 }, nodes: [], trees: [], bushes: [],
      pickups: [], debris: [], nests: [], goblinCamp: undefined, falls: undefined, props: wall,
      river: { points: [{ x: 60, z: 60 }, { x: 90, z: 60 }], width: 2 }, hearth: { pos: { x: 2.5, z: 1 }, radius: 0.5 },
      camp: {
        tent: { pos: { x: 4.5, z: 4.5 }, rot: 0, w: 1.4, d: 1.2, radius: 0.9 }, chest: { pos: { x: 1, z: 5 }, rot: 0, w: 0.9, d: 0.56, radius: 0.6 },
        woodpile: { pos: { x: 5.5, z: 1 }, rot: 0, w: 1, d: 0.5, radius: 0.6 }, dummy: { pos: { x: 1, z: 1.8 }, radius: 0.4 },
      },
    };
    const s = setup(L);
    s.state.built = ['campfire', 'chest'];
    s.state.player.pos = { x: 2, z: 3 };
    // the gap at z 2.0 .. 4.0 between the crates: a bench turned across it closes it, the same bench further on doesn't
    const gap = { x: 8, z: 3 };
    expect(navFor(L).walkable(gap)).toBe(true);
    expect(fitOf(s.state, L, 'log_bench', gap, 1)).toBe('cutOff');
    expect(fitOf(s.state, L, 'log_bench', { x: 11, z: 3 }, 1)).toBeNull();
  });

  it('placing where it does not fit is refused, saying why, and takes nothing', () => {
    const c = camp(), bank = { ...c.state.bank };
    send(c, { type: 'build', id: 'log_bench', at: CAMP.hearth.pos, turn: 0 });
    expect(of(c, 'cantBuild').at(-1)).toMatchObject({ make: 'log_bench', reason: 'fit', misfit: 'blocked' });
    expect(c.state.bank).toEqual(bank);
    expect(c.state.placed).toEqual({});
    expect(c.state.underway).toEqual({});
    // without the place to put it, nothing happens at all
    send(c, { type: 'build', id: 'log_bench' });
    expect(c.state.underway).toEqual({});
  });

  it('a placed thing is in the way from when it is begun, by its own width and depth, turned', () => {
    const c = camp();
    expect(walkGrid(c.state, CAMP).walkable(OPEN)).toBe(true);
    send(c, { type: 'build', id: 'log_bench', at: OPEN, turn: 1 });
    expect(placedRects(c.state)).toEqual([{ pos: OPEN, rot: Math.PI / 2, w: 1.4, d: 0.5 }]);
    const nav = walkGrid(c.state, CAMP);
    expect(nav.walkable(OPEN)).toBe(false);
    expect(nav.walkable({ x: OPEN.x, z: OPEN.z + 0.6 })).toBe(false);    // turned: its length runs north to south
    expect(nav.walkable({ x: OPEN.x + 0.9, z: OPEN.z })).toBe(true);
    expect(navFor(CAMP, c.state.built).walkable(OPEN)).toBe(true);      // without the placed things, it isn't
  });

  it('every walking grid in the game counts the things placed (rats and goblins keep clear of where things can go)', () => {
    const src = fileURLToPath(new URL('../src/', import.meta.url)), files = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []; });
    const loose: string[] = [];
    for (const f of files(src)) {
      if (/[\\/](world[\\/]nav|core[\\/]rats|core[\\/]goblins)\.ts$/.test(f)) continue;
      for (const m of readFileSync(f, 'utf8').matchAll(/navFor\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) if (m[1]!.split(',').length < 3) loose.push(`${f}: ${m[0]}`);
    }
    expect(loose).toEqual([]);
    expect(PLACE.nest).toBeGreaterThan(0);
  });
});

describe('building in stages', () => {
  it('begun: what it needs is taken, he works beside it, it goes up stage by stage with Carpentry XP, then stands', () => {
    const c = camp(), bank = { ...c.state.bank };
    send(c, { type: 'build', id: 'workbench', at: OPEN, turn: 0 });
    expect(of(c, 'begun')).toEqual([{ type: 'begun', make: 'workbench' }]);
    for (const [id, n] of Object.entries(MAKES.workbench.needs)) expect(c.state.bank[id], id).toBe(bank[id]! - n);
    expect(c.state.player.pending).toEqual({ kind: 'raise', id: 'workbench' });
    expect(stageOf(c.state, 'workbench')).toBe(0);              // footings out
    runUntil(c, () => c.state.player.task.kind === 'raise', 30);
    const site = buildSite(c.state, CAMP, 'workbench')!;
    expect(dist(c.state.player.pos, site.pos)).toBeLessThan(site.radius + 1);
    runUntil(c, () => c.state.built.includes('workbench'), MAKES.workbench.time + 1);
    expect(c.state.built).toContain('workbench');
    expect(made(c.state, 'workbench')).toBe(true);
    expect(c.state.underway).toEqual({});
    expect(of(c, 'buildStage').map(e => e.stage)).toEqual([1, 2]);
    expect(of(c, 'made').at(-1)).toEqual({ type: 'made', make: 'workbench' });
    expect(c.state.skills.carpentry).toBe(Math.floor(MAKES.workbench.time / CARPENTRY.knock) * CARPENTRY.xp);
    expect(of(c, 'xpGained').filter(e => e.skill === 'carpentry').length).toBe(Math.floor(MAKES.workbench.time / CARPENTRY.knock));
    expect(c.state.player.task.kind).toBe('idle');
    expect(stageOf(c.state, 'workbench')).toBe(CARPENTRY.stages);
    // built once: it is no longer listed, and a tap on it does nothing
    expect(buildRows(c.state, CAMP).map(r => r.id)).not.toContain('workbench');
    send(c, { type: 'build', id: 'workbench' });
    expect(c.state.player.pending).toBeNull();
  });

  it('without the level or everything it needs he says so and stays put', () => {
    const c = camp();
    send(c, { type: 'build', id: 'lean_to' });
    expect(of(c, 'cantBuild').at(-1)).toEqual({ type: 'cantBuild', make: 'lean_to', reason: 'level', need: STAGED.lean_to!.level });
    c.state.skills.carpentry = XP_TABLE[STAGED.lean_to!.level]!;
    c.state.bank.bark = 1;
    send(c, { type: 'build', id: 'lean_to' });
    expect(of(c, 'missing').at(-1)).toEqual({ type: 'missing', make: 'lean_to', items: { bark: MAKES.lean_to.needs.bark! - 1 } });
    send(c, { type: 'build', id: 'log_hut' });
    expect(of(c, 'cantBuild').at(-1)).toMatchObject({ make: 'log_hut', reason: 'locked' });
    expect(c.state.underway).toEqual({});
  });

  it('sent elsewhere the work stays; a tap on it sends him back to carry on, taking nothing more', () => {
    const c = camp();
    send(c, { type: 'build', id: 'log_bench', at: OPEN, turn: 0 });
    runUntil(c, () => (c.state.underway.log_bench ?? 0) > 12, 60);
    send(c, { type: 'walk', to: { x: 5, z: -6 } });
    run(c, 8);
    const worked = c.state.underway.log_bench!, bank = { ...c.state.bank };
    expect(worked).toBeGreaterThan(12);
    expect(c.state.player.task.kind).not.toBe('raise');
    run(c, 5);
    expect(c.state.underway.log_bench).toBe(worked);              // nothing done while he's away
    send(c, { type: 'build', id: 'log_bench' });
    expect(c.state.player.pending).toEqual({ kind: 'raise', id: 'log_bench' });
    runUntil(c, () => c.state.built.includes('log_bench'), 60);
    expect(c.state.built).toContain('log_bench');
    expect(c.state.bank).toEqual(bank);
    expect(of(c, 'begun')).toHaveLength(1);
  });

  it('at nightfall he leaves it to stoke the fire, then goes back to it by himself', () => {
    const c = camp(19.8);
    c.state.skills.carpentry = XP_TABLE[STAGED.lean_to!.level]!;
    c.state.player.pos = { x: 0, z: 3 };
    send(c, { type: 'build', id: 'lean_to' });
    runUntil(c, () => c.state.player.task.kind === 'raise', 30);
    runUntil(c, () => !!c.state.player.stoke, 120);
    expect(isNight(c.state.time)).toBe(true);
    const before = c.state.underway.lean_to!;
    expect(before).toBeGreaterThan(0);
    runUntil(c, () => of(c, 'stoked').length > 0, 120);
    expect(c.state.player.pending).toEqual({ kind: 'raise', id: 'lean_to' });
    runUntil(c, () => c.state.built.includes('lean_to'), MAKES.lean_to.time + 60);
    expect(c.state.built).toContain('lean_to');
    expect(c.state.underway).toEqual({});
  });

  it('asked to sleep by day while building, he says he is not tired and keeps working', () => {
    const c = camp();
    c.state.skills.carpentry = XP_TABLE[STAGED.lean_to!.level]!;
    send(c, { type: 'build', id: 'lean_to' });
    runUntil(c, () => (c.state.underway.lean_to ?? 0) > 5, 60);
    send(c, { type: 'sleep' });                                    // by day: not tired; he keeps working
    expect(of(c, 'cantSleep')).toHaveLength(1);
    expect(c.state.player.task).toEqual({ kind: 'raise', id: 'lean_to' });
  });
});

describe("the shelter's upgrades", () => {
  /** A camp with the lean-to (and, with `hut`, the log hut) built in place, at `hour`. */
  function upgraded(hour: number, hut = false): Setup {
    const c = camp(hour);
    c.state.built.push('lean_to');
    if (hut) c.state.built.push('log_hut');
    c.state.stokedNight = Math.floor(c.state.time / DAY_SECONDS - STOKE.at);
    return c;
  }

  it('the tent becomes a lean-to, then a log hut, built in place: the old one shows until the new frame is up', () => {
    const c = camp();
    c.state.skills.carpentry = 1000;
    expect(shelterShown(c.state)).toBe('shelter');
    send(c, { type: 'build', id: 'lean_to' });
    expect(buildSite(c.state, CAMP, 'lean_to')).toEqual(siteOf(CAMP, 'tent'));
    expect(shelterShown(c.state)).toBe('shelter');                 // footings round the tent
    runUntil(c, () => stageOf(c.state, 'lean_to') >= 1, 120);
    expect(shelterShown(c.state)).toBe('lean_to');
    runUntil(c, () => c.state.built.includes('lean_to'), 200);
    expect(bestShelter(c.state)).toBe('lean_to');
    expect(buildRows(c.state, CAMP).map(r => r.id)).toContain('log_hut');
    send(c, { type: 'build', id: 'log_hut' });
    runUntil(c, () => c.state.built.includes('log_hut'), 400);
    expect(shelterShown(c.state)).toBe('log_hut');
    expect(bestShelter(c.state)).toBe('log_hut');
    expect(buildOpen(c.state, CAMP)).toBe(true);                   // the button stays, with nothing left: "nothing more"
    expect(buildRows(c.state, CAMP).filter(r => SHELTERS.includes(r.id))).toEqual([]);
  });

  for (const hut of [false, true]) {
    it(`he sleeps in the ${hut ? 'log hut' : 'lean-to'} and wakes better rested than in the tent`, () => {
      const c = upgraded(22, hut);
      expect(canSleep(c.state, CAMP)).toBe(true);
      send(c, { type: 'sleep' });
      runUntil(c, () => c.state.player.task.kind === 'sleep', 60);
      expect(c.state.player.task.kind).toBe('sleep');
      runUntil(c, () => of(c, 'awake').length > 0, DAY_SECONDS);
      expect(restBonus(c.state)).toBe(STAGED[hut ? 'log_hut' : 'lean_to']!.rest);
      expect(restedFactor(c.state)).toBeCloseTo(1 + STAGED[hut ? 'log_hut' : 'lean_to']!.rest!);
    });
  }

  it('in the tent the rested boost is as before', () => {
    const c = camp();
    c.state.restedUntil = c.state.time + 100;
    expect(restedFactor(c.state)).toBeCloseTo(1 + SLEEP.bonus);
  });

  it('a half-built upgrade still has the shelter before it to sleep in at night', () => {
    const c = camp(21);
    c.state.skills.carpentry = 1000;
    c.state.stokedNight = Math.floor(c.state.time / DAY_SECONDS - STOKE.at);
    send(c, { type: 'build', id: 'lean_to' });
    runUntil(c, () => stageOf(c.state, 'lean_to') >= 1, 120);
    send(c, { type: 'sleep' });
    runUntil(c, () => c.state.player.task.kind === 'sleep', 60);
    expect(c.state.player.task.kind).toBe('sleep');
    expect(c.state.underway.lean_to).toBeGreaterThan(0);
  });
});

describe('the new materials', () => {
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

  it('bark is peeled now and then while chopping birch, once he has taken up Carpentry and while something needs it', () => {
    const c = camp();
    c.state.bank = {};
    expect(wantsBark(c.state, CAMP)).toBe(false);                  // no Carpentry yet
    c.state.skills.carpentry = 40;
    expect(wantsBark(c.state, CAMP)).toBe(true);                   // the lean-to needs it
    const birch = CAMP.nodes.find(n => n.resource === BARK.tree)!;
    send(c, { type: 'work', nodeId: birch.id });
    runUntil(c, () => owned(c.state, BARK.item) >= 2, 900);
    expect(owned(c.state, BARK.item)).toBeGreaterThanOrEqual(2);
    expect(of(c, 'barkPeeled').length).toBe(owned(c.state, BARK.item));
    // enough for the lean-to: no more
    c.state.bank.bark = MAKES.lean_to.needs.bark!;
    expect(wantsBark(c.state, CAMP)).toBe(false);
    // chapter 1 (no chest yet) never gets any
    const s = setup();
    s.state.skills.carpentry = 40;
    expect(wantsBark(s.state, CAMP)).toBe(false);
  });
});

describe('saves', () => {
  it('a half-built thing is saved and loaded with where it stands, its turn and how far along, and he carries on', () => {
    const c = camp();
    send(c, { type: 'build', id: 'workbench', at: OPEN, turn: 3 });
    runUntil(c, () => (c.state.underway.workbench ?? 0) > 20, 60);
    const back = deserialize(serialize(c.state, Date.now()), CAMP);
    expect(back.placed.workbench).toEqual({ pos: OPEN, turn: 3 });
    expect(back.underway.workbench).toBeCloseTo(c.state.underway.workbench!);
    expect(back.player.task).toEqual({ kind: 'raise', id: 'workbench' });
    expect(walkGrid(back, CAMP).walkable(OPEN)).toBe(false);
    const r = { ...setup(), state: back };
    runUntil(r, () => back.built.includes('workbench'), 60);
    expect(back.built).toContain('workbench');
  });

  it('something built and placed stays where it was put; a built upgrade stays built', () => {
    const c = camp();
    c.state.built.push('log_bench', 'lean_to');
    c.state.placed.log_bench = { pos: OPEN, turn: 1 };
    const back = deserialize(serialize(c.state), CAMP);
    expect(back.built).toEqual(expect.arrayContaining(['log_bench', 'lean_to']));
    expect(back.placed).toEqual({ log_bench: { pos: OPEN, turn: 1 } });
  });

  it('damaged placements and progress fall back: dropped, and something built with no place to stand is no longer built', () => {
    const c = camp();
    const raw = JSON.parse(serialize(c.state));
    raw.built = [...raw.built, 'log_bench', 'workbench'];
    raw.placed = { log_bench: { pos: { x: 'a', z: 0 }, turn: 0 }, workbench: { pos: OPEN, turn: 7 }, lean_to: { pos: OPEN, turn: 0 } };
    raw.underway = { log_hut: 20, lean_to: -3, workbench: 10, nonsense: 4 };
    const back = deserialize(JSON.stringify(raw), CAMP);
    expect(back.placed).toEqual({});
    expect(back.underway).toEqual({});                             // the hut without the lean-to; negative; built; unknown
    expect(back.built).not.toContain('log_bench');
    expect(back.built).not.toContain('workbench');
    // a placement now in the way of something (in the water), and progress past its time, are dropped too
    raw.built = [...c.state.built];
    raw.placed = { workbench: { pos: CAMP.falls!.pool.pos, turn: 0 } };
    raw.underway = { workbench: 10, lean_to: MAKES.lean_to.time + 5 };
    const again = deserialize(JSON.stringify(raw), CAMP);
    expect(again.placed).toEqual({});
    expect(again.underway).toEqual({});
    // a task or a trip back to something not begun is dropped
    raw.placed = {}; raw.underway = {};
    raw.player.task = { kind: 'raise', id: 'lean_to' };
    raw.player.pending = { kind: 'raise', id: 'workbench' };
    const third = deserialize(JSON.stringify(raw), CAMP);
    expect(third.player.task.kind).toBe('idle');
    expect(third.player.pending).toBeNull();
  });

  it('0.0.25 and 0.0.26 saves (format 11, before building) load with nothing placed or begun', () => {
    const c = camp();
    const raw = JSON.parse(serialize(c.state, Date.now()));
    delete raw.placed; delete raw.underway;
    expect(SAVE_VERSION).toBe(11);
    const back = deserialize(JSON.stringify(raw), CAMP);
    expect(back.placed).toEqual({});
    expect(back.underway).toEqual({});
    expect(back.skills.carpentry).toBe(0);
    expect(back.built).toEqual(c.state.built);
  });

  it('0.0.22 to 0.0.24 saves (format 10) load too', () => {
    const c = camp();
    const raw = JSON.parse(serialize(c.state));
    delete raw.placed; delete raw.underway; delete raw.skills.carpentry;
    raw.version = 10;
    const back = deserialize(JSON.stringify(raw), CAMP);
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.placed).toEqual({});
    expect(back.underway).toEqual({});
    expect(back.skills.carpentry).toBe(0);
  });

  it('a built bench closer to something than placing allows now still stands after a load (only where it cannot be at all is it dropped)', () => {
    const c = camp();
    // a bench a little nearer a plank or a stone than PLACE.gap: placing refuses it, a save keeps it
    const spots = (CAMP.pickups ?? []).flatMap(x => {
      const rp = PICKUPS[x.kind].plant?.radius ?? 0.35, off = rp + PLACE.gap * 0.4 + STAGED.log_bench!.size!.d / 2;
      return [[0, 1, 0], [0, -1, 0], [1, 0, 1], [-1, 0, 1]].map(([ux, uz, turn]) => ({ pos: { x: x.pos.x + ux! * off, z: x.pos.z + uz! * off }, turn: turn! }));
    }).filter(p => dist(snap(p.pos), p.pos) < 1e-9 && fitOf(c.state, CAMP, 'log_bench', p.pos, p.turn) === 'blocked');
    expect(spots.length).toBeGreaterThan(0);
    c.state.built.push('log_bench');
    c.state.placed.log_bench = spots[0]!;
    const back = deserialize(serialize(c.state), CAMP);
    expect(back.placed.log_bench).toEqual(spots[0]);
    expect(back.built).toContain('log_bench');
  });

  it('saved while he is off stoking the fire from his building, he still goes back to it after', () => {
    const c = camp(19.8);
    c.state.skills.carpentry = XP_TABLE[STAGED.lean_to!.level]!;
    c.state.player.pos = { x: 0, z: 3 };
    send(c, { type: 'build', id: 'lean_to' });
    runUntil(c, () => c.state.player.task.kind === 'raise', 30);
    runUntil(c, () => !!c.state.player.stoke, 120);
    expect(c.state.player.stoke?.back).toEqual({ raise: 'lean_to' });
    const back = deserialize(serialize(c.state, Date.now()), CAMP);
    expect(back.player.stoke?.back).toEqual({ raise: 'lean_to' });
    expect(back.underway.lean_to).toBeCloseTo(c.state.underway.lean_to!);
    const r = { ...setup(), state: back };
    runUntil(r, () => of(r, 'stoked').length > 0, 120);
    expect(back.player.pending).toEqual({ kind: 'raise', id: 'lean_to' });
    runUntil(r, () => back.built.includes('lean_to'), MAKES.lean_to.time + 60);
    expect(back.built).toContain('lean_to');
  });

  it('savedBuilding keeps a good placement for something begun', () => {
    const c = camp();
    c.state.built = c.state.built.filter(id => id !== 'log_bench');
    const kept = savedBuilding({ placed: { log_bench: { pos: OPEN, turn: 2 } }, underway: { log_bench: 5 } }, c.state, CAMP);
    expect(kept.placed).toEqual({ log_bench: { pos: OPEN, turn: 2 } });
    expect(kept.underway).toEqual({ log_bench: 5 });
  });
});

describe('the drawing', () => {
  it("a half-built thing's tap area goes into the view's own list of things to tap, and comes out once it is built", () => {
    const c = camp(), pickables: THREE.Object3D[] = [], view = new BuildingView(new THREE.Scene(), CAMP, pickables);
    const taps = () => pickables.filter(o => o.userData.raiseId === 'log_bench');
    view.update(c.state, 0.1);
    expect(taps()).toHaveLength(0);                                // nothing shows until it is placed
    send(c, { type: 'build', id: 'log_bench', at: OPEN, turn: 0 });
    runUntil(c, () => c.state.underway.log_bench !== undefined, 30);
    view.update(c.state, 0.1);
    expect(view.pickables).toBe(pickables);
    expect(taps()).toHaveLength(1);
    runUntil(c, () => c.state.built.includes('log_bench'), 60);
    view.update(c.state, 0.1);
    expect(taps()[0]?.visible ?? false).toBe(false);              // built: a tap no longer sends him back to work
  });
});
