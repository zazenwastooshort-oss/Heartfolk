// "Go do it" (the survival book; systems/nextstep.ts): a tap on the goal card or on his thought sends him off on the
// current goal's next step, the same as tapping the right thing in the world. Checked for every kind of goal: gathering
// off the ground, from trees and rocks, berries and fish; making; levels at the training dummy; the cooked meal; the
// rats' hides; the goblin camp; and when there is nothing to do yet (stones not back), he is at it already, or every
// goal is done. Then a player who only ever taps the card plays a new game to the end of chapter 2. Goals are made
// current by marking the goals before them done, never by position.
import { describe, expect, it } from 'vitest';
import { allGoalsDone, canDrop, createState, currentGoal, goalMet, owned, type GameState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { ratsOf } from '../src/core/rats';
import { CHIEF_ID, chiefOut, goblinSpot } from '../src/core/goblins';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, type Layout, type Vec2 } from '../src/world/layout';
import { applyCommands, type Command } from '../src/systems/commands';
import { nextStep } from '../src/systems/nextstep';
import { stores } from '../src/systems/backpack';
import { wear } from '../src/systems/combat';
import { GOALS } from '../src/data/goals';
import { PICKUPS } from '../src/data/pickups';
import { RESOURCES } from '../src/data/skills';
import { makeDef } from '../src/data/making';
import { BACKPACK_SLOTS } from '../src/data/hauling';
import { XP_TABLE } from '../src/data/xp';

const at = (id: string) => GOALS.findIndex(g => g.id === id);
/** The goals before `id`, by id: marking them done makes `id` the current goal. */
const before = (id: string) => GOALS.slice(0, at(id)).map(g => g.id);
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const xpFor = (level: number) => XP_TABLE[level]!;

function setup(layout: Layout = CAMP, seed = 4) {
  const state = createState(layout, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, layout, ctx: { layout, rng: createRng(seed), events } };
}
type Setup = ReturnType<typeof setup>;
const send = (s: Setup, c: Command) => applyCommands(s.state, s.layout, [c], s.events);
const run = (s: Setup, seconds: number) => { for (let t = 0; t < seconds; t += STEP) step(s.state, STEP, s.ctx); };
const commands = (s: Setup) => { const n = nextStep(s.state, s.layout); return 'commands' in n ? n.commands : n; };

/** A camp game on goal `id`, with what the goals before it left him: the things built, the tools and the club. */
function on(id: string, seed = 4): Setup {
  const s = setup(CAMP, seed), i = at(id);
  s.state.goalsDone = before(id);
  for (const g of GOALS.slice(0, i)) {
    const def = g.makes ? makeDef(g.makes) : null;
    if (!def) continue;
    if (def.gives.kind === 'structure') s.state.built.push(def.id);
    else if (def.gives.kind === 'tool') s.state.tools[def.gives.tool] = true;
    else wear(s.state, def.gives.gear);
  }
  s.state.hasBook = true;
  expect(currentGoal(s.state).id).toBe(id);
  return s;
}

describe('the next step for each kind of goal', () => {
  it('gathering off the ground: the nearest thing the goal still needs (salvage: a plank, the tarp or his book)', () => {
    const s = setup();
    const next = commands(s) as Command[];
    expect(next).toHaveLength(1);
    expect(next[0]!.type).toBe('pickup');
    const id = (next[0] as { id: string }).id, spots = CAMP.pickups!.filter(p => ['plank', 'crate', 'tarp', 'book'].includes(p.kind));
    const nearest = spots.reduce((a, b) => dist(b.pos, s.state.player.pos) < dist(a.pos, s.state.player.pos) ? b : a);
    expect(id).toBe(nearest.id);
    // the tap does what that tap in the world does: he sets off to pick it up
    send(s, { type: 'next' });
    expect(s.state.player.pending).toEqual({ kind: 'pickup', id });
  });

  it('nothing to do yet: every stone taken and not back, he says so and stays put', () => {
    const s = on('campfire');
    s.state.player.backpack = { plank: 3, stone: 1 };
    for (const p of CAMP.pickups!.filter(p => p.kind === 'stone')) s.state.taken[p.id] = s.state.time + 50;
    expect(nextStep(s.state, CAMP)).toEqual({ wait: 'stone' });
    send(s, { type: 'next' });
    expect(s.log).toContainEqual({ type: 'nothingYet', item: 'stone' });
    expect(s.state.player.task.kind).toBe('idle');
    expect(s.state.player.pending).toBeNull();
    // once one is back, the tap sends him to it
    run(s, 51);
    expect((commands(s) as Command[])[0]).toMatchObject({ type: 'pickup' });
  });

  it('making: with everything there, he makes it; tapped again on his way, he says he is at it already', () => {
    const s = on('campfire');
    s.state.player.backpack = { plank: 3, stone: 4 };
    expect(commands(s)).toEqual([{ type: 'make', id: 'campfire' }]);
    send(s, { type: 'next' });
    expect(s.state.player.pending).toEqual({ kind: 'make', id: 'campfire' });
    const from = s.log.length;
    send(s, { type: 'next' });
    expect(s.log.slice(from)).toEqual([{ type: 'onIt' }]);
    expect(s.state.player.pending).toEqual({ kind: 'make', id: 'campfire' });
    // a tool made where he stands
    const t = on('stone_axe');
    t.state.player.backpack = { branch: 2, stone: 2 };
    expect(commands(t)).toEqual([{ type: 'make', id: 'stone_axe' }]);
  });

  it('gathering from trees and rocks: the nearest standing one he has the tool for', () => {
    const s = on('firewood');
    const next = commands(s) as Command[];
    expect(next).toHaveLength(1);
    const node = CAMP.nodes.find(n => n.id === (next[0] as { nodeId: string }).nodeId)!;
    expect(RESOURCES[node.resource]!.item).toBe('birch_logs');
    const birches = CAMP.nodes.filter(n => RESOURCES[n.resource]?.item === 'birch_logs');
    expect(dist(node.pos, s.state.player.pos)).toBe(Math.min(...birches.map(n => dist(n.pos, s.state.player.pos))));
    // felled, the next nearest standing one
    s.state.nodes[node.id]!.depletedUntil = s.state.time + 100;
    expect((commands(s) as Command[])[0]).not.toEqual(next[0]);
    // working one already: he's at it
    send(s, { type: 'next' });
    const from = s.log.length;
    send(s, { type: 'next' });
    expect(s.log.slice(from)).toEqual([{ type: 'onIt' }]);
    // copper ore from a copper rock
    const c = on('copper');
    const rock = CAMP.nodes.find(n => n.id === ((commands(c) as Command[])[0] as { nodeId: string }).nodeId)!;
    expect(rock.resource).toBe('copper_rock');
  });

  it('berries and fish: the nearest bush (a bare one only when none is ripe), the nearest fishing spot', () => {
    const s = on('berries');
    expect((commands(s) as Command[])[0]).toMatchObject({ type: 'pickup' });
    const bushes = CAMP.pickups!.filter(p => PICKUPS[p.kind].plant);
    for (const b of bushes) s.state.taken[b.id] = s.state.time + 30;
    const bare = (commands(s) as Command[])[0] as { type: string; id: string };
    expect(bare.type).toBe('pickup');
    expect(bushes.map(b => b.id)).toContain(bare.id);
    const f = on('fish');
    const spot = CAMP.nodes.find(n => n.id === ((commands(f) as Command[])[0] as { nodeId: string }).nodeId)!;
    expect(spot.resource).toBe('fishing_spot');
  });

  it('levels: practice at the training dummy, training a skill the goal still asks for', () => {
    const s = on('practice');
    expect(commands(s)).toEqual([{ type: 'fight', target: 'dummy' }]);
    // Attack is there already: he trains the next it asks for
    s.state.skills.attack = xpFor(3);
    s.state.combatStyle = 'attack';
    expect(commands(s)).toEqual([{ type: 'style', style: 'strength' }, { type: 'fight', target: 'dummy' }]);
    send(s, { type: 'next' });
    expect(s.state.combatStyle).toBe('strength');
    expect(s.state.player.pending).toEqual({ kind: 'fight', id: 'dummy' });
    // "Ready for the goblins" the same
    const r = on('ready');
    expect((commands(r) as Command[]).at(-1)).toEqual({ type: 'fight', target: 'dummy' });
  });

  it('the meal: cook the raw fish he has; with none, catch some first; fishing for it, he is at it', () => {
    const s = on('meal');
    s.state.player.backpack = { raw_fish: 3 };
    expect(commands(s)).toEqual([{ type: 'cook' }]);
    s.state.player.backpack = {};
    s.state.bank = { raw_fish: 2 };
    expect(commands(s)).toEqual([{ type: 'cook' }]);                // from the chest
    s.state.bank = {};
    const fish = (commands(s) as Command[])[0] as { type: string; nodeId: string };
    expect(fish.type).toBe('work');
    expect(CAMP.nodes.find(n => n.id === fish.nodeId)!.resource).toBe('fishing_spot');
    send(s, { type: 'next' });
    expect(nextStep(s.state, CAMP)).toEqual({ busy: true });
  });

  it('the meal from one tap: he catches enough raw fish, takes them to the fire by himself and cooks the meal', () => {
    for (const seed of [4, 7]) {
      const s = on('meal', seed);
      s.state.tools.rod = true;
      send(s, { type: 'next' });
      for (let t = 0; t < 900 && currentGoal(s.state).id === 'meal'; t += 1) run(s, 1);
      expect(currentGoal(s.state).id, `seed ${seed}`).not.toBe('meal');
      expect(s.log.some(e => e.type === 'goalEnough' && e.item === 'raw_fish'), `seed ${seed}`).toBe(true);
    }
  });

  it("the rats' hides: the nearest rat that is up; with every one down, one by its nest, to wait for it", () => {
    const s = on('rats');
    s.state.player.backpack = { cooked_fish: 3 };
    const next = (commands(s) as Command[])[0] as { type: string; target: string };
    expect(next.type).toBe('fight');
    const rats = ratsOf(CAMP).map(r => r.id);
    expect(rats).toContain(next.target);
    for (const id of rats) { s.state.rats[id]!.downUntil = s.state.time + 30; s.state.rats[id]!.health = 0; }
    const down = (commands(s) as Command[])[0] as { type: string; target: string };
    expect(down.type).toBe('fight');
    expect(rats).toContain(down.target);
    send(s, { type: 'next' });
    expect(s.state.player.pending).toMatchObject({ kind: 'fight' });
    // the hide armour goals want hides too
    const cap = on('hide_cap');
    expect((commands(cap) as Command[])[0]).toMatchObject({ type: 'fight' });
  });

  it('the goblin camp: a goblin; once the chief is out, the chief', () => {
    const s = on('goblins');
    const next = (commands(s) as Command[])[0] as { type: string; target: string };
    expect(next.type).toBe('fight');
    expect(goblinSpot(CAMP, next.target)?.chief).toBe(false);
    s.state.goblinCamp.chiefOut = true;
    s.state.goblins[CHIEF_ID] = chiefOut(goblinSpot(CAMP, CHIEF_ID)!, s.state.time);
    expect(commands(s)).toEqual([{ type: 'fight', target: CHIEF_ID }]);
  });

  it('every goal done, the village, or knocked out: nothing happens', () => {
    const s = setup();
    s.state.goalsDone = GOALS.map(g => g.id);
    expect(allGoalsDone(s.state)).toBe(true);
    expect(nextStep(s.state, CAMP)).toEqual({ done: true });
    send(s, { type: 'next' });
    expect(s.log).toEqual([]);
    const v = setup(VILLAGE);
    expect(nextStep(v.state, VILLAGE)).toEqual({ done: true });
    const k = setup();
    k.state.player.task = { kind: 'knockedOut', wakeAt: k.state.time + 5, by: 'rat1' };
    send(k, { type: 'next' });
    expect(k.state.player.task.kind).toBe('knockedOut');
    expect(k.state.player.pending).toBeNull();
  });
});

/** A player who only taps the card glances at it this often (seconds of play), and taps it: he carries on if he is at
 *  it already (fighting rats on for hides the goal no longer needs, he goes for what it does need). */
const GLANCE = 60;

/** Whether he has nothing to do: standing about, going nowhere, on no trip, not cooking or stoking. */
const idle = (state: GameState) => {
  const p = state.player;
  return p.task.kind === 'idle' && !p.pending && !p.trip && !p.cook && !p.stoke && !p.path.length;
};

describe('a player who only taps the goal card', () => {
  it.each([1, 2, 3])('plays a new game (seed %i) to the end of chapter 2: a tap whenever he stands idle, the card moves on or turns ready, and now and then', seed => {
    const s = setup(CAMP, seed);
    let goal = '', ready = false, taps = 0, quietUntil = 0, glance = 0;
    const limit = 4 * 3600;
    for (let t = 0; t < limit && !allGoalsDone(s.state); t += STEP) {
      const p = s.state.player, now = currentGoal(s.state).id, met = goalMet(s.state, currentGoal(s.state));
      if (p.task.kind !== 'knockedOut' && !p.stoke && s.state.time >= quietUntil && (idle(s.state) || now !== goal || met !== ready || s.state.time >= glance)) {
        goal = now; ready = met; glance = s.state.time + GLANCE;
        // with nowhere to store things yet and the backpack (nearly) full, room first: drop what the goal doesn't need
        if (!stores(s.state, CAMP).length && Object.values(p.backpack).reduce((a, n) => a + n, 0) >= BACKPACK_SLOTS - 1) {
          const g = currentGoal(s.state), needs = (g.makes ? makeDef(g.makes)?.needs : null) ?? g.needs;
          for (const [item, n] of Object.entries(p.backpack)) if (canDrop(item) && n > (needs[item] ?? 0)) send(s, { type: 'drop', item, count: n - (needs[item] ?? 0) });
        }
        send(s, { type: 'next' }); taps++;
        quietUntil = s.state.time + 1;
      }
      step(s.state, STEP, s.ctx);
    }
    expect(allGoalsDone(s.state), `stuck on ${currentGoal(s.state).id}: ${JSON.stringify({ pack: s.state.player.backpack, task: s.state.player.task })}`).toBe(true);
    expect(owned(s.state, 'old_map')).toBeGreaterThan(0);
    expect(taps).toBeGreaterThan(GOALS.length);
    if (process.env.HEARTHFOLK_PACING) console.log(`card player, seed ${seed}: chapter 2 done in ${((s.state.time - createState(CAMP, seed).time) / 60).toFixed(1)} minutes of play, ${taps} taps`);
  }, 60_000);
});
