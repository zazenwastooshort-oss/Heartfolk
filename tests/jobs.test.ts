// Jobs (the idle core, 12 Oct 2026): picked in the Jobs window, a job is his until it is stopped or another is picked.
// He fetches his tools at the chest (leaving what he won't need there), works the nearest place for it past any goal's
// "enough", hauls a full backpack to the chest and back, and goes back to it by himself after anything that takes him
// away; a tap elsewhere pauses it until that's done. data/jobs.ts, core/jobs.ts, systems/jobs.ts, ui/jobs.ts.
import { describe, expect, it } from 'vitest';
import { createState, currentGoal, type GameState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS, isNight } from '../src/core/clock';
import { deserialize, readSave, serialize } from '../src/core/save';
import { jobBlock, jobHere, savedJob } from '../src/core/jobs';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, type Layout } from '../src/world/layout';
import { applyCommands, type Command } from '../src/systems/commands';
import { backpackCount } from '../src/systems/backpack';
import { JOBS, JOB_IDS, jobDef, jobItem, type JobId } from '../src/data/jobs';
import { GATHERS } from '../src/data/pickups';
import { ITEMS, RESOURCES } from '../src/data/skills';
import { GEAR, DUMMY, STYLES } from '../src/data/combat';
import { GOALS } from '../src/data/goals';
import { BACKPACK_SLOTS, KEEP_FOOD } from '../src/data/hauling';
import { STOKE } from '../src/data/fire';
import { XP_TABLE } from '../src/data/xp';
import { hasPicture } from '../src/ui/pictures';
import { blockText, jobStatus, stoppedText } from '../src/ui/jobs';

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
const of = <T extends GameEvent['type']>(s: Setup, type: T) => s.log.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const job = (s: Setup, id: JobId) => send(s, { type: 'job', job: id });
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const workingOn = (state: GameState, resource: string) => {
  const p = state.player, id = p.task.kind === 'gather' ? p.task.nodeId : p.pending?.kind === 'node' ? p.pending.id : null;
  return !!id && CAMP.nodes.find(n => n.id === id)?.resource === resource;
};

/** A camp at the goal `goal` (every goal before it done, what their making gave built, owned or worn), morning on day 1;
 *  `shelter` false leaves the shelter out, so the night doesn't take him to bed. */
function campAt(goal: string, { shelter = true, seed = 5 } = {}): Setup {
  const s = setup(CAMP, seed), before = GOALS.slice(0, GOALS.findIndex(g => g.id === goal));
  s.state.goalsDone = before.map(g => g.id);
  for (const g of before) {
    const make = g.makes;
    if (!make) continue;
    if (['campfire', 'woodpile', 'shelter', 'chest', 'dummy'].includes(make)) { if (make !== 'shelter' || shelter) s.state.built.push(make as GameState['built'][number]); }
    else if (make === 'stone_axe') s.state.tools.axe = true;
    else if (make === 'stone_pickaxe') s.state.tools.pick = true;
    else if (make === 'rod') s.state.tools.rod = true;
    else if (make in GEAR) s.state.equipment[GEAR[make as keyof typeof GEAR].slot] = make as keyof typeof GEAR;
  }
  s.state.hasBook = true;
  s.state.time = at(1, 8);
  s.state.player.pos = { x: 1, z: 4 };
  return s;
}

describe('the jobs (data)', () => {
  it('each job works something the game has, with a picture, a name and a plain line, each id once', () => {
    expect(new Set(JOB_IDS).size).toBe(JOBS.length);
    for (const def of JOBS) {
      expect(jobDef(def.id)).toBe(def);
      expect(def.name.length, def.id).toBeGreaterThan(2);
      expect(def.what, def.id).toMatch(/^[A-Z].*\.$/);
      expect(def.what, def.id).not.toMatch(/!/);
      expect(def.doing, def.id).toMatch(/^[a-z][a-z ]+[a-z]$/);
      expect(hasPicture(def.picture), def.id).toBe(true);
      if (def.work.kind === 'node') expect(RESOURCES[def.work.resource], def.id).toBeDefined();
      if (def.work.kind === 'gather') expect(GATHERS[def.work.group], def.id).toBeDefined();
      const item = jobItem(def);
      if (item) expect(ITEMS[item], def.id).toBeDefined();
    }
    expect(jobItem(jobDef('birch')!)).toBe('birch_logs');
    expect(jobItem(jobDef('berries')!)).toBe('berries');
    expect(jobItem(jobDef('stones')!)).toBe('stone');
    expect(jobItem(jobDef('practice')!)).toBeNull();
    expect(jobDef('nope')).toBeUndefined();
  });

  it('at the camp: chopping birch, mining copper, fishing, berries, stones, branches, practice, rats and cooking; no oak, tin or iron', () => {
    const s = setup();
    const here = JOBS.filter(d => jobHere(s.state, CAMP, d)).map(d => d.id);
    expect(here).toEqual(['birch', 'copper', 'fish', 'berries', 'stones', 'branches', 'practice', 'rats', 'cook']);
  });

  it('in the village: only trees and rocks on his land (no camp jobs); the tin is on land not his yet', () => {
    const s = setup(VILLAGE);
    const here = JOBS.filter(d => jobHere(s.state, VILLAGE, d)).map(d => d.id);
    expect(here).toEqual(['birch', 'oak', 'copper']);
    expect(jobBlock(s.state, VILLAGE, jobDef('oak')!)).toEqual({ kind: 'level', skill: 'woodcutting', level: 10 });
    expect(blockText({ kind: 'level', skill: 'woodcutting', level: 10 })).toBe('Needs Woodcutting level 10.');
    expect(jobBlock(s.state, VILLAGE, jobDef('birch')!)).toBeNull();
  });
});

describe('picking a job', () => {
  it('without the tool for it, refused, saying so: "Needs a stone axe"; he stays where he is', () => {
    const s = setup();
    job(s, 'birch');
    expect(of(s, 'jobRefused')).toEqual([{ type: 'jobRefused', job: 'birch', block: { kind: 'tool', tool: 'axe' } }]);
    expect(s.state.job).toBeNull();
    expect(s.state.player.task.kind).toBe('idle');
    expect(blockText({ kind: 'tool', tool: 'axe' })).toBe('Needs a stone axe.');
    expect(blockText({ kind: 'tool', tool: 'rod' })).toBe('Needs a fishing rod.');
    job(s, 'practice');
    expect(of(s, 'jobRefused').at(-1)!.block).toEqual({ kind: 'build', make: 'dummy' });
    expect(blockText({ kind: 'build', make: 'dummy' })).toBe('Build the training dummy first.');
    job(s, 'cook');
    expect(of(s, 'jobRefused').at(-1)!.block).toEqual({ kind: 'build', make: 'campfire' });
  });

  it('with the chest standing, he fetches his tools there first (the backpack emptied, a few meals kept), then chops the nearest birch', () => {
    const s = campAt('dummy');
    s.state.player.backpack = { stone: 3, copper_ore: 2, cooked_fish: 7 };
    job(s, 'birch');
    expect(s.state.job).toEqual({ id: 'birch', paused: false, fetch: true });
    expect(of(s, 'jobSet')).toEqual([{ type: 'jobSet', job: 'birch', fetch: true, later: false }]);
    expect(s.state.player.pending).toEqual({ kind: 'visit', id: 'chest' });
    expect(jobStatus(s.state, CAMP)).toBe('Fetching his tools from the chest.');
    runUntil(s, () => !s.state.job!.fetch, 30);
    expect(s.state.player.backpack).toEqual({ cooked_fish: KEEP_FOOD });
    expect(s.state.bank).toMatchObject({ stone: 3, copper_ore: 2, cooked_fish: 2 });
    expect(of(s, 'nothingToBank')).toEqual([]);
    expect(workingOn(s.state, 'birch_tree')).toBe(true);
    runUntil(s, () => s.state.player.task.kind === 'gather', 30);
    expect(jobStatus(s.state, CAMP)).toBe('Hard at it.');
  });

  it("goes on past the goal's \"enough\" (a tap on a tree stops there), hauling a full backpack to the chest and back", () => {
    const s = campAt('dummy');
    expect(currentGoal(s.state).id).toBe('dummy');
    // a plain tap first: he stops once the dummy's goal has the logs it needs
    send(s, { type: 'work', nodeId: 'camp_birch1' });
    runUntil(s, () => of(s, 'goalEnough').length > 0, 600);
    expect(of(s, 'goalEnough').length).toBe(1);
    expect(s.state.player.task.kind).toBe('idle');
    // his job: on and on, through a full backpack and a trip to the chest
    job(s, 'birch');
    runUntil(s, () => of(s, 'backpackFull').length > 0, 1200);
    expect(of(s, 'backpackFull').length).toBe(1);
    runUntil(s, () => of(s, 'banked').length > 1 && workingOn(s.state, 'birch_tree'), 120);
    expect(workingOn(s.state, 'birch_tree')).toBe(true);
    expect(s.state.bank.birch_logs).toBeGreaterThan(20);
    expect(of(s, 'goalEnough').length).toBe(1);
    expect(s.state.job).toEqual({ id: 'birch', paused: false, fetch: false });
  });

  it('the same job again: he says he is at it; another job takes its place', () => {
    const s = campAt('dummy');
    job(s, 'birch');
    job(s, 'birch');
    expect(of(s, 'onIt')).toHaveLength(1);
    job(s, 'stones');
    expect(s.state.job?.id).toBe('stones');
    runUntil(s, () => !s.state.job!.fetch, 30);
    runUntil(s, () => s.state.player.task.kind === 'pickup', 60);
    const id = (s.state.player.task as { id: string }).id;
    expect(CAMP.pickups!.find(x => x.id === id)?.kind).toBe('stone');
  });
});

describe('a tap elsewhere pauses it; stopping it', () => {
  it('a tap on the grass pauses the job; once he is there with nothing to do, he goes back to it', () => {
    const s = campAt('dummy');
    job(s, 'copper');
    runUntil(s, () => s.state.player.task.kind === 'gather', 60);
    send(s, { type: 'walk', to: { x: -4, z: 2 } });
    expect(s.state.job).toMatchObject({ id: 'copper', paused: true });
    expect(jobStatus(s.state, CAMP)).toMatch(/^Paused/);
    runUntil(s, () => of(s, 'jobResumed').length > 0, 60);
    expect(of(s, 'jobResumed')).toEqual([{ type: 'jobResumed', job: 'copper' }]);
    expect(s.state.job).toMatchObject({ id: 'copper', paused: false });
    expect(workingOn(s.state, 'copper_rock')).toBe(true);
  });

  it('the goal card\'s tap pauses it too, and a refused tap leaves it be', () => {
    const s = campAt('dummy');
    job(s, 'copper');
    runUntil(s, () => s.state.player.task.kind === 'gather', 60);
    send(s, { type: 'work', nodeId: 'camp_fish1' });                    // no rod: refused
    expect(of(s, 'needTool')).toHaveLength(1);
    expect(s.state.job?.paused).toBe(false);
    send(s, { type: 'next' });
    expect(s.state.job?.paused).toBe(true);
  });

  it('Stop: no job, and he stops where he is; stopped while paused, what he was sent to do carries on', () => {
    const s = campAt('dummy');
    job(s, 'copper');
    runUntil(s, () => s.state.player.task.kind === 'gather', 60);
    send(s, { type: 'stopJob' });
    expect(s.state.job).toBeNull();
    expect(of(s, 'jobStopped')).toEqual([{ type: 'jobStopped', job: 'copper', why: 'player' }]);
    expect(s.state.player.task.kind).toBe('idle');
    run(s, 10);
    expect(s.state.player.task.kind).toBe('idle');
    const t = campAt('dummy');
    job(t, 'copper');
    runUntil(t, () => t.state.player.task.kind === 'gather', 60);
    send(t, { type: 'work', nodeId: 'camp_birch2' });
    send(t, { type: 'stopJob' });
    expect(t.state.player.pending).toEqual({ kind: 'node', id: 'camp_birch2' });
    expect(stoppedText('birch', 'player')).toBe('He stops chopping birch for now.');
    expect(stoppedText('fish', 'player')).toBe('He stops fishing for now.');
  });
});

describe('it carries on', () => {
  it('through a save and reload', () => {
    const s = campAt('dummy');
    job(s, 'birch');
    run(s, 0.5);
    expect(s.state.job?.fetch).toBe(true);
    const back = deserialize(serialize(s.state), CAMP);
    expect(back.job).toEqual(s.state.job);
    expect(back).toEqual(s.state);
    runUntil(s, () => s.state.player.task.kind === 'gather', 60);
    const later = deserialize(serialize(s.state), CAMP);
    expect(later.job).toEqual({ id: 'birch', paused: false, fetch: false });
  });

  it('stoking the fire at nightfall takes him away, and he goes back to his job (no shelter: no bed)', () => {
    const s = campAt('dummy', { shelter: false });
    s.state.woodpile = 10;
    s.state.time = at(1, 19.5);
    job(s, 'copper');
    runUntil(s, () => of(s, 'stoked').length > 0, 120);
    expect(of(s, 'stoked')).toHaveLength(1);
    runUntil(s, () => s.state.player.task.kind === 'gather', 60);
    expect(workingOn(s.state, 'copper_rock')).toBe(true);
    expect(s.state.job).toMatchObject({ id: 'copper', paused: false });
  });

  it('with the shelter: he stokes, goes to bed, sleeps the night, and at dawn goes back to his job', () => {
    const s = campAt('dummy');
    s.state.woodpile = 10;
    s.state.time = at(1, 19.5);
    job(s, 'copper');
    runUntil(s, () => s.state.player.task.kind === 'sleep', 200);
    expect(of(s, 'stoked')).toHaveLength(1);
    expect(of(s, 'bedtime')).toHaveLength(1);
    expect(jobStatus(s.state, CAMP)).toMatch(/^Asleep/);
    runUntil(s, () => !isNight(s.state.time), DAY_SECONDS);
    run(s, 1);
    expect(of(s, 'awake')).toHaveLength(1);
    expect(workingOn(s.state, 'copper_rock')).toBe(true);
  });

  it('picked while he sleeps, it starts at first light: he sleeps on', () => {
    const s = campAt('dummy');
    s.state.stokedNight = Math.floor(at(1, 23) / DAY_SECONDS - STOKE.at);
    s.state.time = at(1, 23);
    send(s, { type: 'sleep' });
    runUntil(s, () => s.state.player.task.kind === 'sleep', 60);
    job(s, 'birch');
    expect(of(s, 'jobSet').at(-1)).toMatchObject({ job: 'birch', later: true });
    expect(s.state.player.task.kind).toBe('sleep');
    runUntil(s, () => !isNight(s.state.time), DAY_SECONDS);
    expect(s.state.job).toMatchObject({ id: 'birch', fetch: true });
    runUntil(s, () => !s.state.job!.fetch, 30);
    expect(s.state.job!.fetch).toBe(false);
    runUntil(s, () => workingOn(s.state, 'birch_tree'), 60);
    expect(workingOn(s.state, 'birch_tree')).toBe(true);
  });

  it('knocked out on the rats job, he wakes at camp and goes back to the rats (by the chest for food)', () => {
    const s = campAt('rats');
    s.state.bank = { cooked_fish: 10 };
    job(s, 'rats');
    runUntil(s, () => s.state.player.task.kind === 'fight', 120);
    s.state.health = 1;
    s.state.player.backpack = {}; s.state.bank = {};                   // no food anywhere: a rat knocks him out
    for (const r of Object.values(s.state.rats)) r.health = 1e6;
    runUntil(s, () => of(s, 'knockedOut').length > 0, 300);
    expect(of(s, 'knockedOut').length).toBe(1);
    s.state.bank = { cooked_fish: 10 };
    runUntil(s, () => of(s, 'wokeUp').length > 0, 30);
    run(s, 1);
    expect(s.state.job?.id).toBe('rats');
    expect(s.state.player.trip).toMatchObject({ fight: expect.stringMatching(/^rat/) });
    runUntil(s, () => s.state.player.task.kind === 'fight', 120);
    expect(s.state.player.task.kind).toBe('fight');
  });
});

describe('edge cases', () => {
  it('berries with every bush bare: he waits beside the one that comes back soonest', () => {
    const s = campAt('dummy');
    for (const b of CAMP.pickups!.filter(x => x.kind === 'bush')) s.state.taken[b.id] = s.state.time + 60;
    s.state.taken[CAMP.pickups!.find(x => x.kind === 'bush')!.id] = s.state.time + 20;
    s.state.built = s.state.built.filter(b => b !== 'chest');            // no chest: straight there
    job(s, 'berries');
    runUntil(s, () => s.state.player.task.kind === 'pickup', 60);
    const task = s.state.player.task as { id: string; doneAt: number };
    expect(CAMP.pickups!.find(x => x.id === task.id)?.kind).toBe('bush');
    expect(task.doneAt).toBeGreaterThan(s.state.time);
    runUntil(s, () => (s.state.player.backpack.berries ?? 0) > 0, 60);
    expect(s.state.player.backpack.berries).toBeGreaterThan(0);
  });

  it('a full backpack: with the chest he empties it there first; with nowhere to store it, the job stops, saying why', () => {
    const s = campAt('dummy');
    s.state.player.backpack = { stone: BACKPACK_SLOTS };
    job(s, 'birch');
    runUntil(s, () => s.state.player.task.kind === 'gather', 60);
    expect(backpackCount(s.state)).toBeLessThan(3);
    const t = campAt('chest');                                          // before the chest
    t.state.player.backpack = { stone: BACKPACK_SLOTS };
    job(t, 'birch');
    expect(t.state.job).toBeNull();
    expect(of(t, 'jobStopped')).toEqual([{ type: 'jobStopped', job: 'birch', why: 'full' }]);
  });

  it('practice: refused once the dummy has taught him all three; stops when it can teach no more', () => {
    const s = campAt('practice');
    for (const st of STYLES) s.state.skills[st] = XP_TABLE[DUMMY.maxLevel]!;
    job(s, 'practice');
    expect(of(s, 'jobRefused').at(-1)!.block).toEqual({ kind: 'taught' });
    const t = campAt('practice');
    for (const st of STYLES) t.state.skills[st] = XP_TABLE[DUMMY.maxLevel]!;
    t.state.skills.defence = XP_TABLE[DUMMY.maxLevel]! - 20;
    t.state.combatStyle = 'defence';
    t.state.built = t.state.built.filter(b => b !== 'chest');
    job(t, 'practice');
    runUntil(t, () => of(t, 'jobStopped').length > 0, 600);
    expect(t.state.job).toBeNull();
    expect(of(t, 'jobStopped').at(-1)).toMatchObject({ job: 'practice', why: 'blocked', block: { kind: 'taught' } });
  });

  it('cooking: he cooks all his raw fish, then the job is done', () => {
    const s = campAt('meal');
    s.state.player.backpack = { raw_fish: 3 };
    s.state.built = s.state.built.filter(b => b !== 'chest');
    job(s, 'cook');
    runUntil(s, () => of(s, 'jobStopped').length > 0, 120);
    expect(of(s, 'cooked')).toHaveLength(3);
    expect(of(s, 'jobStopped').at(-1)).toMatchObject({ job: 'cook', why: 'done' });
    expect(s.state.job).toBeNull();
  });

  it('cooking, paused by a tap and picked again: he sets off to cook at once, and cooks on', () => {
    const s = campAt('meal');
    s.state.player.backpack = { raw_fish: 3 };
    s.state.built = s.state.built.filter(b => b !== 'chest');
    job(s, 'cook');
    expect(s.state.player.cook).not.toBeNull();
    send(s, { type: 'walk', to: { x: -3, z: 0 } });
    expect(s.state.player.cook).toBeNull();
    expect(s.state.job?.paused).toBe(true);
    job(s, 'cook');
    expect(s.state.job?.paused).toBe(false);
    expect(s.state.player.cook).not.toBeNull();
    // another job instead stops the cooking
    job(s, 'stones');
    expect(s.state.player.cook).toBeNull();
    job(s, 'cook');
    runUntil(s, () => of(s, 'jobStopped').some(e => e.job === 'cook'), 120);
    expect(of(s, 'cooked')).toHaveLength(3);
  });

  it('the village: chopping birch, fetching his tools at the bank first', () => {
    const s = setup(VILLAGE);
    s.state.player.backpack = { copper_ore: 4 };
    job(s, 'birch');
    expect(s.state.player.pending).toMatchObject({ kind: 'visit' });
    runUntil(s, () => !s.state.job!.fetch, 120);
    expect(s.state.bank.copper_ore).toBe(4);
    runUntil(s, () => s.state.player.task.kind === 'gather', 120);
    expect(s.state.player.task.kind).toBe('gather');
  });
});

describe('saves', () => {
  it('an old save (0.0.22 to 0.0.26: no job, no needs) loads with no job, and he is full', () => {
    const s = campAt('rats');
    const old = JSON.parse(serialize(s.state)) as Record<string, unknown>;
    delete old.job; delete old.needs;
    const back = readSave(JSON.stringify(old), CAMP).state;
    expect(back.job).toBeNull();
    expect(back.needs).toEqual({ fullness: 1, meal: null, bed: null, sentAt: -1 });
  });

  it('a damaged job falls back to none; paused and fetch only when they say so, fetch only with somewhere to store', () => {
    const s = campAt('dummy');
    const edit = (v: unknown, state = s.state) => { const r = JSON.parse(serialize(state)); r.job = v; return deserialize(JSON.stringify(r), CAMP).job; };
    for (const bad of ['birch', 7, null, [], { id: 'nope' }, { id: 'oak' }, { id: 3 }]) expect(edit(bad), JSON.stringify(bad)).toBeNull();
    expect(edit({ id: 'birch', paused: 'yes', fetch: 1 })).toEqual({ id: 'birch', paused: false, fetch: false });
    expect(edit({ id: 'birch', paused: true, fetch: true })).toEqual({ id: 'birch', paused: true, fetch: true });
    const t = campAt('chest');
    expect(edit({ id: 'birch', fetch: true }, t.state)).toEqual({ id: 'birch', paused: false, fetch: false });
    expect(savedJob({ id: 'fish' }, s.state, VILLAGE)).toBeNull();
  });
});
