// His tools and the storage chest (13 Oct 2026, the owner: "tools should be in the chest, because later there will be
// outfits that give skill bonuses"): once the chest stands his tools are kept in it and he carries only the one he is
// using; sent to work something whose tool is in the chest he fetches it first (one stop at the chest), and at every
// stop there he leaves the tools he won't need next. Before the chest, and in the village, he carries them all.
// core/tools.ts, systems/tools.ts.
import { describe, expect, it } from 'vitest';
import { createState, type GameState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS } from '../src/core/clock';
import { deserialize, serialize } from '../src/core/save';
import { carries, toolFor } from '../src/core/tools';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, type Layout } from '../src/world/layout';
import { applyCommands, type Command } from '../src/systems/commands';
import { GOALS } from '../src/data/goals';
import { GEAR } from '../src/data/combat';
import { RESOURCES, TOOL_IDS } from '../src/data/skills';
import { NEEDS_TEXT } from '../src/ui/needs';

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
const carried = (state: GameState) => TOOL_IDS.filter(t => carries(state, t));
const working = (state: GameState) => state.player.task.kind === 'gather' ? state.player.task.nodeId : null;
const nodeOf = (resource: string) => CAMP.nodes.find(n => n.resource === resource)!.id;
/** Stops at the chest: each time he reached it. */
const chestStops = (s: Setup) => s.log.filter(e => e.type === 'visited' && e.id === 'chest').length;

/** A camp at the goal `goal` (every goal before it done, never counting which they are), by day, the shelter built
 *  (since the camp build the chest stands in it, used at its door). */
function campAt(goal: string): Setup {
  const s = setup(CAMP), before = GOALS.slice(0, GOALS.findIndex(g => g.id === goal));
  s.state.goalsDone = before.map(g => g.id);
  for (const g of before) {
    const make = g.makes;
    if (!make) continue;
    if (['campfire', 'woodpile', 'shelter', 'chest', 'dummy'].includes(make)) s.state.built.push(make as GameState['built'][number]);
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
/** What his tools gather: logs, ore, fish. */
const GATHERED = new Set(Object.values(RESOURCES).map(r => r.item));
/** A goal after the chest is built (tools are kept in it from then on) that counts nothing his tools gather, so no goal
 *  has 'enough' and stops him (whichever goals come between). */
const AFTER_CHEST = GOALS.slice(GOALS.findIndex(g => g.makes === 'chest') + 1).find(g => !Object.keys(g.needs).some(i => GATHERED.has(i)))!.id;

describe('tools in the chest', () => {
  it('before the chest stands he carries every tool he owns, as before', () => {
    const s = campAt('chest');
    expect(s.state.built).not.toContain('chest');
    expect(carried(s.state)).toEqual(['axe', 'pick']);
    send(s, { type: 'work', nodeId: nodeOf('birch_tree') });
    runUntil(s, () => working(s.state) !== null, 60);
    expect(of(s, 'fetchTool')).toHaveLength(0);
    expect(s.state.toolsInChest).toEqual([]);
    // a new game has none, and none in the chest
    expect(createState(CAMP).toolsInChest).toEqual([]);
  });

  it('once it stands, at his next stop there he leaves the tools he won\'t need, keeping the one he works with', () => {
    const s = campAt(AFTER_CHEST);
    s.state.goalsDone = GOALS.map(g => g.id);                          // no goal stops the chopping at 'enough'
    expect(carried(s.state)).toEqual(['axe', 'pick']);                 // a game from before: carried until he stops there
    send(s, { type: 'work', nodeId: nodeOf('birch_tree') });
    runUntil(s, () => of(s, 'banked').length > 0, 1500);
    expect(s.state.toolsInChest).toEqual(['pick']);
    expect(carried(s.state)).toEqual(['axe']);
    runUntil(s, () => working(s.state) !== null, 60);
    expect(CAMP.nodes.find(n => n.id === working(s.state))!.resource).toBe('birch_tree');
    // a tap on the chest with nothing to do next: every tool goes in
    send(s, { type: 'visit', id: 'chest' });
    runUntil(s, () => chestStops(s) > 1, 60);
    expect(carried(s.state)).toEqual([]);
    expect(s.state.toolsInChest).toEqual(['axe', 'pick']);
  });

  it('switching from chopping to mining: one stop at the chest, the axe left there and the pickaxe taken', () => {
    const s = campAt(AFTER_CHEST);
    s.state.toolsInChest = ['pick'];
    send(s, { type: 'work', nodeId: nodeOf('birch_tree') });
    runUntil(s, () => working(s.state) !== null, 60);
    expect(of(s, 'fetchTool')).toHaveLength(0);
    const stops = chestStops(s), copper = nodeOf('copper_rock');
    s.state.player.backpack = { cooked_fish: 2 };                       // a few meals he keeps on him: they stay
    send(s, { type: 'work', nodeId: copper });
    expect(of(s, 'fetchTool')).toEqual([{ type: 'fetchTool', tool: 'pick' }]);
    expect(s.state.player.pending).toEqual({ kind: 'visit', id: 'chest' });
    expect(s.state.player.trip).toEqual({ nodeId: copper, tool: true });
    runUntil(s, () => working(s.state) === copper, 120);
    expect(chestStops(s) - stops).toBe(1);
    expect(carried(s.state)).toEqual(['pick']);
    expect(s.state.toolsInChest).toEqual(['axe']);
    expect(of(s, 'nothingToBank')).toHaveLength(0);                     // nothing to store: no word of it
    expect(of(s, 'banked')).toHaveLength(0);
    expect(s.state.player.backpack.cooked_fish).toBe(2);
    expect(NEEDS_TEXT.fetchTool('pick')).toBe('He fetches his stone pickaxe from the chest first.');
    expect(NEEDS_TEXT.fetchTool('axe')).toBe('He fetches his stone axe from the chest first.');
  });

  it("sent to a tree whose logs the goal already has enough of, with the axe in the chest: he fetches it and chops, as with it carried", () => {
    const logsGoal = GOALS.slice(GOALS.findIndex(g => g.makes === 'chest') + 1).find(g => (g.needs.birch_logs ?? 0) > 0)!;
    const birch = nodeOf('birch_tree');
    for (const inChest of [true, false]) {
      const s = campAt(logsGoal.id);
      s.state.bank = { birch_logs: 50 };
      s.state.toolsInChest = inChest ? ['axe', 'pick'] : ['pick'];
      send(s, { type: 'work', nodeId: birch });
      expect(of(s, 'fetchTool'), `in the chest: ${inChest}`).toHaveLength(inChest ? 1 : 0);
      runUntil(s, () => working(s.state) === birch || of(s, 'goalEnough').length > 0, 120);
      expect(working(s.state), `in the chest: ${inChest}`).toBe(birch);
      expect(of(s, 'goalEnough'), `in the chest: ${inChest}`).toHaveLength(0);
      expect(carried(s.state)).toEqual(['axe']);
    }
  });

  it('the first time tools go into the chest he says so, once', () => {
    const s = campAt(AFTER_CHEST);
    expect(s.state.toolsInChest).toEqual([]);
    send(s, { type: 'visit', id: 'chest' });
    runUntil(s, () => chestStops(s) > 0, 60);
    expect(of(s, 'toolsKept')).toHaveLength(1);
    expect(NEEDS_TEXT.toolsKept).toBe('He keeps his tools in the chest now, and takes out the one he needs.');
    send(s, { type: 'work', nodeId: nodeOf('copper_rock') });
    runUntil(s, () => working(s.state) !== null, 120);
    send(s, { type: 'visit', id: 'chest' });
    runUntil(s, () => chestStops(s) > 2, 60);
    expect(of(s, 'toolsKept')).toHaveLength(1);
  });

  it('beside the chest already, he takes the tool out at once', () => {
    const s = campAt(AFTER_CHEST);
    s.state.toolsInChest = ['axe', 'pick'];
    send(s, { type: 'visit', id: 'chest' });
    runUntil(s, () => chestStops(s) > 0, 60);
    run(s, 2);
    send(s, { type: 'work', nodeId: nodeOf('birch_tree') });
    expect(of(s, 'fetchTool')).toHaveLength(0);
    expect(carried(s.state)).toEqual(['axe']);
    expect(s.state.player.pending?.kind).toBe('node');
  });

  it("the goal card's next step needing a tool in the chest: he fetches it, then gets on with the goal", () => {
    const copperGoal = GOALS.find(g => (g.needs.copper_ore ?? 0) > 0 && !g.makes)!.id;
    const s = campAt(copperGoal);
    s.state.built.push('chest');                                       // as if the chest stood this early
    s.state.toolsInChest = ['axe', 'pick'];
    send(s, { type: 'next' });
    expect(of(s, 'fetchTool')).toEqual([{ type: 'fetchTool', tool: 'pick' }]);
    // tapped again on the way: he is on it already
    send(s, { type: 'next' });
    expect(of(s, 'onIt')).toHaveLength(1);
    runUntil(s, () => working(s.state) !== null, 120);
    expect(CAMP.nodes.find(n => n.id === working(s.state))!.resource).toBe('copper_rock');
    expect(carried(s.state)).toEqual(['pick']);
  });

  it('a tool newly made is carried until his next stop at the chest', () => {
    const s = campAt('rod');
    s.state.toolsInChest = ['axe', 'pick'];
    s.state.tools.rod = true;                                          // as if just made
    expect(carried(s.state)).toEqual(['rod']);
    send(s, { type: 'visit', id: 'chest' });
    runUntil(s, () => chestStops(s) > 0, 60);
    expect(carried(s.state)).toEqual([]);
    expect(s.state.toolsInChest).toEqual(['axe', 'pick', 'rod']);
    // fishing: to the chest for the rod
    send(s, { type: 'work', nodeId: nodeOf('fishing_spot') });
    runUntil(s, () => working(s.state) !== null, 120);
    expect(carried(s.state)).toEqual(['rod']);
    expect(toolFor(CAMP, working(s.state)!)).toBe('rod');
  });

  it('weapons and armour stay worn', () => {
    const s = campAt('rats');
    s.state.toolsInChest = ['axe', 'pick', 'rod'];
    send(s, { type: 'visit', id: 'chest' });
    runUntil(s, () => chestStops(s) > 0, 60);
    expect(s.state.equipment.weapon).toBe('stone_club');
  });

  it('saves: the tools in the chest, and a fetch under way, read back; anything odd falls back to carried', () => {
    const s = campAt(AFTER_CHEST);
    s.state.toolsInChest = ['pick'];
    send(s, { type: 'work', nodeId: nodeOf('copper_rock') });
    expect(s.state.player.trip).toMatchObject({ tool: true });
    const back = deserialize(serialize(s.state), CAMP);
    expect(back).toEqual(s.state);
    const edit = (v: unknown, also?: (r: Record<string, unknown>) => void) => {
      const r = JSON.parse(serialize(s.state)); r.toolsInChest = v; also?.(r); return deserialize(JSON.stringify(r), CAMP).toolsInChest;
    };
    expect(edit(['pick', 'pick', 'sword', 7])).toEqual(['pick']);
    expect(edit('pick')).toEqual([]);
    expect(edit(['rod'])).toEqual([]);                                  // not one he owns
    expect(edit(['pick'], r => { r.built = (r.built as string[]).filter(b => b !== 'chest'); })).toEqual([]);   // no chest
    // a save from before (0.0.22 to 0.0.27): its tools are carried
    const old = JSON.parse(serialize(s.state)); delete old.toolsInChest;
    expect(carried(deserialize(JSON.stringify(old), CAMP))).toEqual(['axe', 'pick']);
    // a damaged fetch flag goes
    const r = JSON.parse(serialize(s.state)); r.player.trip.tool = 'yes';
    expect(deserialize(JSON.stringify(r), CAMP).player.trip).toEqual({ nodeId: nodeOf('copper_rock') });
  });

  it('in the village: no chest to keep them in, he carries his tools as now', () => {
    const v = setup(VILLAGE);
    expect(carried(v.state)).toEqual(['axe', 'pick', 'rod'].filter(t => v.state.tools[t as 'axe']));
    const bank = VILLAGE.buildings.find(b => b.kind === 'bank')!;
    send(v, { type: 'visit', id: bank.id });
    runUntil(v, () => of(v, 'visited').length > 0, 120);
    expect(v.state.toolsInChest).toEqual([]);
  });
});
