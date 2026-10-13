// Chapter 2, holding the camp, its last part: the goblin camp (systems/goblins.ts, core/goblins.ts, world/goblincamp.ts,
// numbers in data/goblins.ts). Where it is (blocking the way down the river, past the rats' nest, reachable on foot over
// land joined to the clearing with no gap, and seen whole from the camera as it starts); the three goblins milling about
// inside (they never go for him); fighting them through the same fight loop and targets as the rats, each swinging back
// on its own timer (OSRS rolls against his defence); goblins coming back; the chief coming out only once all three are
// down at once, and fought from beside him, so the camera sees him; a goblin coming back while he fights the chief;
// clearing the camp (the torn map, the goal, the end of the chapter); knocked out by a goblin or by
// the chief; food from the chest, a full backpack, stoking at nightfall; saves, old saves and damaged ones; the village;
// away time and its note; a long run at the suggested levels, and a weaker player knocked out.
// Other goals may sit between or after chapter 2's: a goal is made current by marking every goal before it done, never
// by its position.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { allGoalsDone, goalFinished, canDrop, createState, currentGoal, maxHealth, owned, SAVE_VERSION, type GameState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS } from '../src/core/clock';
import { deserialize, readSave, serialize } from '../src/core/save';
import { bookPages } from '../src/core/book';
import { fightLabel, foeName, targetOf } from '../src/core/targets';
import { CHIEF_ID, goblinSpot, goblinsOf } from '../src/core/goblins';
import { catchUpAway, step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, inArea, type Layout, type Vec2 } from '../src/world/layout';
import { navFor } from '../src/world/nav';
import { waterOf } from '../src/world/water';
import { gateOf, palisadeOf, tentDoor, wayInOf } from '../src/world/goblincamp';
import { applyCommands, type Command } from '../src/systems/commands';
import { defenceRoll, defenceRollOf, hitChance, roll, strikeReach } from '../src/systems/combat';
import { backpackCount } from '../src/systems/backpack';
import { wakeSpot } from '../src/systems/rats';
import { addSummary, emptySummary, tally } from '../src/systems/away';
import { COMBAT } from '../src/data/combat';
import { CHIEF, GOBLIN, GOBLIN_SWING, MILL } from '../src/data/goblins';
import { FIGHT_FOOD, KNOCKED_OUT, RAT } from '../src/data/rats';
import { CAMP_DONE, GOALS } from '../src/data/goals';
import { ITEMS } from '../src/data/skills';
import { STOKE } from '../src/data/fire';
import { BACKPACK_SLOTS } from '../src/data/hauling';
import { XP_TABLE } from '../src/data/xp';
import { awayText } from '../src/ui/away';
import { GOBLIN_TEXT } from '../src/ui/goblins';
import { GOBLIN as GOBLIN_LOOK } from '../src/render/creatures';

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const SITE = CAMP.goblinCamp!;
const GOBLINS = ['goblin1', 'goblin2', 'goblin3'];
const at = (id: string) => GOALS.findIndex(g => g.id === id);
/** The goals before `id`: marked done, they make `id` the current goal. */
const before = (id: string) => GOALS.slice(0, at(id)).map(g => g.id);
/** In-game time on `day` (from 0) at `hour` o'clock. */
const clock = (day: number, hour: number) => (day + hour / 24) * DAY_SECONDS;
const NIGHTFALL = STOKE.at * 24;
const BUILT = ['campfire', 'woodpile', 'shelter', 'chest', 'dummy'];
/** Just outside the goblin camp's way in. */
const OUTSIDE = { x: -9.0, z: 16.2 };

function setup(layout: Layout = CAMP, seed = 7) {
  const state = createState(layout, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, layout, ctx: { layout, rng: createRng(seed), events } };
}
type Setup = ReturnType<typeof setup>;
const send = (s: Setup, c: Command) => applyCommands(s.state, s.layout, [c], s.events);
const runUntil = (s: Setup, done: () => boolean, max: number) => { let t = 0; for (; t < max && !done(); t += STEP) step(s.state, STEP, s.ctx); return t; };
const run = (s: Setup, seconds: number) => runUntil(s, () => false, seconds);
const of = <T extends GameEvent['type']>(s: Setup, type: T, from = 0) => s.log.slice(from).filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

/** A camp at the goblin camp's goal: every goal before it done, the camp built, the stone club and the full hide armour
 *  worn, his tools; Attack, Strength, Defence and Vitality at `level`; morning, so no night falls in a short test (and
 *  no logs anywhere, so a nightfall in a long one doesn't send him off); he stands just outside the goblin camp's way
 *  in, with nothing in his backpack and nothing in the chest. */
function ready(seed = 7, level = 9): Setup {
  const s = setup(CAMP, seed);
  s.state.goalsDone = before('goblins');
  s.state.built = [...BUILT] as GameState['built'];
  s.state.tools = { axe: true, pick: true, rod: true };
  s.state.hasBook = true;
  s.state.equipment = { weapon: 'stone_club', head: 'hide_cap', body: 'hide_vest', shield: 'hide_shield' };
  for (const skill of ['attack', 'strength', 'defence', 'vitality'] as const) s.state.skills[skill] = XP_TABLE[level]!;
  s.state.health = maxHealth(s.state);
  s.state.time = clock(0, 8);
  s.state.player.pos = { ...OUTSIDE };
  return s;
}
/** Tap `id` and wait until he is striking it. */
function engage(s: Setup, id = 'goblin1'): void {
  send(s, { type: 'fight', target: id });
  runUntil(s, () => s.state.player.task.kind === 'fight' && (s.state.player.task as { target: string }).target === id, 30);
}
/** Who he fights, or is on his way to fight. */
const fighting = (s: Setup) => { const p = s.state.player; return p.pending?.kind === 'fight' ? p.pending.id : p.task.kind === 'fight' ? p.task.target : null; };
/** Goblin `id` beaten a moment ago (down until GOBLIN.back from `ago` seconds back). */
const knockDown = (s: Setup, id: string, ago = 0) => Object.assign(s.state.goblins[id]!, { health: 0, downUntil: s.state.time - ago + GOBLIN.back, to: null, swing: null });
/** The chief brought out: every goblin down, the last one beaten by him. */
function chiefOutNow(s: Setup): void {
  knockDown(s, 'goblin1', 30); knockDown(s, 'goblin2', 20);
  s.state.player.backpack = { cooked_fish: 4 };
  engage(s, 'goblin3');
  s.state.goblins.goblin3!.health = 1;
  runUntil(s, () => s.state.goblinCamp.chiefOut, 60);
}

describe('the goblins (data)', () => {
  it('are tougher than rats and hit harder; the chief more so; beaten goblins come back after about 90 seconds', () => {
    expect(GOBLIN).toMatchObject({ health: 10, maxHit: 2, every: 3.6 });
    expect(GOBLIN.attack).toBeGreaterThanOrEqual(4); expect(GOBLIN.attack).toBeLessThanOrEqual(6);
    expect(GOBLIN.defence).toBeGreaterThanOrEqual(4); expect(GOBLIN.defence).toBeLessThanOrEqual(6);
    expect(CHIEF).toMatchObject({ health: 20, attack: 10, maxHit: 4, drop: 'old_map' });   // a bit more bite since 13 Oct 2026
    expect(CHIEF.attack).toBeGreaterThanOrEqual(7); expect(CHIEF.defence).toBeGreaterThanOrEqual(7);
    for (const n of [GOBLIN, CHIEF]) {
      expect(n.health).toBeGreaterThan(RAT.health); expect(n.maxHit).toBeGreaterThan(RAT.maxHit);
      expect(n.xp).toBe(RAT.xp);                                // XP per damage as for rats
      expect(n.first).toBeLessThan(n.every);
    }
    expect(GOBLIN.back).toBeGreaterThanOrEqual(75); expect(GOBLIN.back).toBeLessThanOrEqual(105);
    expect(GOBLIN_SWING.lands).toBeLessThan(GOBLIN.every);
    expect(GOBLIN_LOOK.attackImpact).toBe(GOBLIN_SWING.lands);        // the drawn blow lands when the simulation's does
    // the torn map: an item, which can't be dropped
    expect(ITEMS.old_map).toMatchObject({ one: 'Torn map' });
    expect(canDrop('old_map')).toBe(false);
    expect(canDrop('cooked_fish')).toBe(true);
    expect(canDrop('rat_hide')).toBe(true);
  });
});

describe('the goblin camp', () => {
  const nav = navFor(CAMP, BUILT), water = waterOf(CAMP), nest = CAMP.nests![0]!;

  it('blocks the way down the river: past the rats\' nest, where the river leaves the clearing, on its bank', () => {
    expect(SITE.pos.z).toBeGreaterThan(nest.pos.z + nest.roam + SITE.radius);          // past the nest...
    expect(SITE.pos.z).toBeGreaterThan(CAMP.village.maxZ);                            // ...out of the clearing, into the woods
    // its palisade comes down to the river bank on the west, so nobody slips past
    const west = Math.min(...palisadeOf(SITE).map(s => s.pos.x));
    expect(water.edge({ x: west - 0.3, z: SITE.pos.z })).toBeLessThan(1.5);
    expect(water.edge({ x: west, z: SITE.pos.z })).toBeGreaterThan(0);
    // the rats potter well clear of it
    expect(dist(nest.pos, SITE.pos)).toBeGreaterThan(nest.roam + SITE.radius + 2);
  });

  it('its way in faces the camp, its gate the way on down the river; a tent, a totem and a cold fire ring inside', () => {
    const stretches = palisadeOf(SITE), way = wayInOf(SITE), gate = gateOf(SITE);
    expect(stretches).toHaveLength(SITE.sides);
    expect(stretches.filter(s => s.kind === 'way')).toEqual([way]);
    expect(stretches.filter(s => s.kind === 'gate')).toEqual([gate]);
    const out = (s: { pos: Vec2 }) => { const d = dist(s.pos, SITE.pos); return { x: (s.pos.x - SITE.pos.x) / d, z: (s.pos.z - SITE.pos.z) / d }; };
    const towards = (s: { pos: Vec2 }, p: Vec2) => { const o = out(s), d = dist(p, SITE.pos); return (o.x * (p.x - SITE.pos.x) + o.z * (p.z - SITE.pos.z)) / d; };
    expect(towards(way, CAMP.hearth.pos)).toBeGreaterThan(0.6);                         // up the valley, towards the camp
    expect(towards(gate, CAMP.river.points.at(-1)!)).toBeGreaterThan(0.6);             // down the river
    // inside the ring: the tent with its door facing the middle, the totem by the way in, the fire ring in the middle
    for (const p of [SITE.tent.pos, SITE.totem, SITE.fire.pos, tentDoor(SITE)]) expect(dist(p, SITE.pos)).toBeLessThan(SITE.radius - 0.8);
    expect(dist(tentDoor(SITE), SITE.pos)).toBeLessThan(dist(SITE.tent.pos, SITE.pos));
    expect(dist(SITE.totem, way.pos)).toBeLessThan(dist(SITE.totem, gate.pos));
    expect(dist(SITE.fire.pos, SITE.pos)).toBeLessThan(0.6);
  });

  it('is reachable on foot from where he wakes, through the way in; the palisade, its gate, the tent, the totem and the fire block', () => {
    const from = wakeSpot(ready().state, CAMP).pos;
    for (const spot of goblinsOf(CAMP)) {
      expect(nav.walkable(spot.home), spot.id).toBe(true);
      expect(nav.findPath(from, spot.home), spot.id).not.toBeNull();
    }
    expect(nav.walkable(wayInOf(SITE).pos)).toBe(true);
    for (const s of palisadeOf(SITE).filter(s => s.kind !== 'way')) expect(nav.walkable(s.pos), s.kind).toBe(false);
    for (const p of [SITE.tent.pos, SITE.totem, SITE.fire.pos]) expect(nav.walkable(p)).toBe(false);
    // the land reaches it along the bank (CAMP.land), and the woods beyond stay out of reach
    expect(inArea(CAMP.village, SITE.pos)).toBe(false);
    expect(nav.walkable({ x: SITE.pos.x, z: SITE.pos.z + SITE.radius + 1.5 })).toBe(false);
    expect(nav.walkable({ x: 5, z: 22 })).toBe(false);
    // a walk from the start of a new game, past the nest, to the way in
    expect(nav.findPath(CAMP.start, wayInOf(SITE).pos)).not.toBeNull();
  });

  it('its land meets the clearing with no gap: no step of a walk between them is off the land, and a save on the way loads there', () => {
    // from where he wakes to the way in, a save at every step (the game saves every 10 seconds, and when the page is
    // hidden or closed) loads with him where he was, still on his way
    const s = ready();
    s.state.player.pos = wakeSpot(s.state, CAMP).pos;
    send(s, { type: 'walk', to: wayInOf(SITE).pos });
    for (let n = 0; n < 900 && s.state.player.task.kind === 'walk'; n++) {
      step(s.state, STEP, s.ctx);
      const back = deserialize(serialize(s.state), CAMP).player;
      expect(back.pos, `step ${n}`).toEqual(s.state.player.pos);
      expect(back.task.kind, `step ${n}`).toBe(s.state.player.task.kind);
    }
    expect(dist(s.state.player.pos, wayInOf(SITE).pos)).toBeLessThan(0.05);
    // and from the way in to all round the clearing, past the corner where the land along the bank meets its edge
    for (let x = -14; x <= 14; x += 2) for (const z of [6, 10, 13, 14.6]) {
      const w = ready();
      w.state.player.pos = { ...wayInOf(SITE).pos };
      send(w, { type: 'walk', to: { x, z } });
      for (let n = 0; n < 900 && w.state.player.task.kind === 'walk'; n++) {
        step(w.state, STEP, w.ctx);
        if (!nav.walkable(w.state.player.pos)) expect.fail(`to ${x}, ${z}: off the land at ${w.state.player.pos.x}, ${w.state.player.pos.z}`);
      }
    }
  });

  it('has no trees in its clearing, nor just south of it between the camera (as it starts) and him in the camp', () => {
    for (const t of CAMP.trees) {
      expect(dist(t.pos, SITE.pos), `${t.pos.x}, ${t.pos.z}`).toBeGreaterThan(SITE.radius + 1.2);
      const southOf = t.pos.z > SITE.pos.z && t.pos.z < SITE.pos.z + SITE.radius + 4 && Math.abs(t.pos.x - SITE.pos.x) < SITE.radius + 0.5;
      expect(southOf, `${t.pos.x}, ${t.pos.z}`).toBe(false);
    }
    // nor anything to pick up, or the rats' nest
    for (const p of CAMP.pickups!) expect(dist(p.pos, SITE.pos)).toBeGreaterThan(SITE.radius + 1);
  });

  it('starts with three goblins at home round the fire ring and the chief in his tent; the village has none', () => {
    const s = ready();
    expect(goblinsOf(CAMP).map(g => g.id)).toEqual([...GOBLINS, CHIEF_ID]);
    for (const id of GOBLINS) expect(s.state.goblins[id]).toMatchObject({ health: GOBLIN.health, downUntil: null, pos: goblinSpot(CAMP, id)!.home, to: null, swing: null });
    expect(s.state.goblins.chief).toMatchObject({ health: CHIEF.health, downUntil: null, pos: tentDoor(SITE) });
    expect(s.state.goblinCamp).toEqual({ chiefOut: false, cleared: false });
    expect(VILLAGE.goblinCamp).toBeUndefined();
    expect(goblinsOf(VILLAGE)).toEqual([]);
    expect(createState(VILLAGE)).toMatchObject({ goblins: {}, goblinCamp: { chiefOut: false, cleared: false } });
  });
});

describe('the goblins mill about', () => {
  it('inside their camp, on open ground, apart, never going for him; the chief stays in his tent', () => {
    const s = ready(), nav = navFor(CAMP, s.state.built);
    s.state.player.pos = { x: SITE.pos.x + 0.6, z: SITE.pos.z - 1.8 };          // standing in the middle of their camp
    const moved: Record<string, number> = {}, last = Object.fromEntries(GOBLINS.map(id => [id, { ...s.state.goblins[id]!.pos }]));
    for (let t = 0; t < 600; t += 0.5) {
      run(s, 0.5);
      for (const id of GOBLINS) {
        const g = s.state.goblins[id]!;
        expect(dist(g.pos, SITE.pos), id).toBeLessThanOrEqual(SITE.roam + 0.01);
        expect(nav.walkable(g.pos), id).toBe(true);
        moved[id] = (moved[id] ?? 0) + dist(g.pos, last[id]!);
        last[id] = { ...g.pos };
      }
    }
    for (const id of GOBLINS) expect(moved[id], id).toBeGreaterThan(20);
    expect(of(s, 'bitten')).toEqual([]);
    expect(s.state.health).toBe(maxHealth(s.state));
    expect(s.state.goblinCamp.chiefOut).toBe(false);
    expect(s.state.goblins.chief!.pos).toEqual(tentDoor(SITE));
    expect(targetOf(s.state, CAMP, CHIEF_ID)).toBeNull();
  });

  it('the same every time it is played: their milling draws nothing from the shared randomness', () => {
    const a = ready(), b = ready(9);
    run(a, 120); run(b, 120);
    expect(a.state.goblins).toEqual(b.state.goblins);
  });
});

describe('fighting the goblins', () => {
  it('a goblin is a target with health; the hover says "Fight|Goblin"; the chief is none while in his tent', () => {
    const s = ready(), t = targetOf(s.state, CAMP, 'goblin2')!;
    expect(t).toMatchObject({ id: 'goblin2', name: 'Goblin', pos: s.state.goblins.goblin2!.pos, radius: GOBLIN.radius, xp: GOBLIN.xp, maxLevel: Infinity });
    expect(t.foe).toEqual({ kind: 'goblin', health: GOBLIN.health, maxHealth: GOBLIN.health, down: false });
    expect(t.beside).toBeUndefined();                                  // (only the chief is struck from beside)
    expect(defenceRoll(t)).toBe(roll(GOBLIN.defence + 9, GOBLIN.defenceBonus));
    expect(fightLabel(CAMP, 'goblin1')).toBe('Fight|Goblin');
    expect(fightLabel(CAMP, CHIEF_ID)).toBe('Fight|Goblin chief');
    expect(foeName(CAMP, 'rat1')).toBe('Rat');
    expect(fightLabel(VILLAGE, 'goblin1')).toBeNull();
    // the chief in his tent can't be fought: a tap does nothing
    send(s, { type: 'fight', target: CHIEF_ID });
    expect(s.state.player.pending).toBeNull();
    expect(s.log).toEqual([]);
    // a goblin down is where it fell: he faces it there, and waits in the camp
    knockDown(s, 'goblin2');
    expect(targetOf(s.state, CAMP, 'goblin2')).toMatchObject({ pos: s.state.goblins.goblin2!.pos, radius: GOBLIN.radius, foe: { down: true, health: 0 } });
  });

  it('he walks in to the goblin, which waits facing him; it swings back on its own timer, 0 to 2, and XP comes per damage', () => {
    const s = ready();
    s.state.player.backpack = { cooked_fish: 3 };
    send(s, { type: 'fight', target: 'goblin3' });
    expect(s.state.player.pending).toEqual({ kind: 'fight', id: 'goblin3' });
    runUntil(s, () => s.state.player.task.kind === 'fight', 30);
    const g = s.state.goblins.goblin3!;
    expect(dist(s.state.player.pos, g.pos)).toBeCloseTo(strikeReach(GOBLIN), 1);
    run(s, 0.5);
    const face = Math.atan2(-(s.state.player.pos.z - g.pos.z), s.state.player.pos.x - g.pos.x);
    expect(Math.abs(Math.atan2(Math.sin(g.heading - face), Math.cos(g.heading - face)))).toBeLessThan(0.01);
    // his first swing lands before its first
    runUntil(s, () => of(s, 'hit').length > 0 && of(s, 'bitten').length > 0, 10);
    expect(s.log.find(e => e.type === 'hit' || e.type === 'bitten')!.type).toBe('hit');
    const from = s.log.length, t0 = s.state.time, xp0 = { ...s.state.skills }, health0 = g.health;
    runUntil(s, () => g.downUntil !== null, 240);
    const swings = of(s, 'bitten', from), struck = of(s, 'hit', from).reduce((a, e) => a + e.damage, 0);
    expect(swings.length).toBeGreaterThanOrEqual(Math.floor((s.state.time - t0) / GOBLIN.every) - 1);
    expect(swings.length).toBeLessThanOrEqual(Math.ceil((s.state.time - t0) / GOBLIN.every) + 1);
    expect(swings.every(e => e.by === 'goblin3' && e.damage >= 0 && e.damage <= GOBLIN.maxHit)).toBe(true);
    expect(struck).toBe(health0);                                      // what he did took its health to 0, never past
    expect(s.state.skills.attack - xp0.attack).toBeCloseTo(struck * GOBLIN.xp, 6);
    expect(s.state.skills.vitality - xp0.vitality).toBeCloseTo(struck * GOBLIN.xp * COMBAT.vitality, 6);
  });

  it('its swing lands as often as its attack roll against his defence (with his armour) says', () => {
    const s = ready(11);
    s.state.player.backpack = { cooked_fish: 28 };
    s.state.skills.vitality = XP_TABLE[60]!; s.state.health = maxHealth(s.state);
    engage(s, 'goblin1');
    s.state.goblins.goblin1!.health = 1e9;
    run(s, 1500);
    const swings = of(s, 'bitten'), landed = swings.filter(e => e.damage > 0).length / swings.length;
    const chance = hitChance(roll(GOBLIN.attack + 9, GOBLIN.attackBonus), defenceRollOf(s.state));
    expect(swings.length).toBeGreaterThan(350);
    expect(landed).toBeCloseTo(chance * 2 / 3, 1);                     // a blow that lands does 0, 1 or 2, evenly
  });

  it('a beaten goblin topples, leaving nothing, and is up again in the camp 90 seconds later; he goes on to the next', () => {
    const s = ready(3);
    s.state.player.backpack = { cooked_fish: 10 };
    engage(s, 'goblin1');
    runUntil(s, () => of(s, 'beaten').length > 0, 240);
    const [beat] = of(s, 'beaten'), g = s.state.goblins.goblin1!, down = s.state.time;
    expect(beat).toEqual({ type: 'beaten', target: 'goblin1', item: null, foe: 'goblin' });
    expect(g.downUntil).toBeCloseTo(down + GOBLIN.back, 5);
    expect(s.state.player.backpack).toEqual({ cooked_fish: 10 - of(s, 'ate').length });
    // a moment to see it topple, facing it where it fell, then on to the nearest goblin up
    run(s, MILL.moveOnAfter - 0.2);
    expect(s.state.player.task).toMatchObject({ kind: 'fight', target: 'goblin1' });
    const p = s.state.player, toward = Math.atan2(-(g.pos.z - p.pos.z), g.pos.x - p.pos.x);
    expect(Math.abs(Math.atan2(Math.sin(p.heading - toward), Math.cos(p.heading - toward)))).toBeLessThan(0.05);
    run(s, 0.4);
    expect(['goblin2', 'goblin3']).toContain(fighting(s));
    runUntil(s, () => of(s, 'goblinBack').some(e => e.id === 'goblin1'), GOBLIN.back + 1);
    expect(s.state.time - down).toBeCloseTo(GOBLIN.back, 0);
    expect(s.state.goblins.goblin1).toMatchObject({ health: GOBLIN.health, downUntil: null, pos: goblinSpot(CAMP, 'goblin1')!.home });
  });

  it('tapping the goblin he fights changes nothing; another goes to it; any other command stops it', () => {
    const s = ready();
    s.state.player.backpack = { cooked_fish: 3 };
    engage(s, 'goblin1');
    run(s, 1);
    const task = { ...s.state.player.task };
    send(s, { type: 'fight', target: 'goblin1' });
    expect(s.state.player.task).toEqual(task);
    send(s, { type: 'fight', target: 'goblin2' });
    expect(s.state.player.pending).toEqual({ kind: 'fight', id: 'goblin2' });
    runUntil(s, () => s.state.player.task.kind === 'fight', 30);
    send(s, { type: 'walk', to: { x: -8, z: 14 } });
    const from = s.log.length;
    run(s, 10);
    expect(of(s, 'hit', from)).toEqual([]);
    expect(of(s, 'bitten', from)).toEqual([]);
    expect(GOBLINS.every(id => s.state.goblins[id]!.swing === null)).toBe(true);
  });
});

describe('the goblin chief', () => {
  it('comes out only once all three goblins are down at the same time', () => {
    const s = ready(4);
    s.state.player.backpack = { cooked_fish: 6 };
    // goblin1 beaten long ago, up again in a moment; goblin2 down a while yet
    knockDown(s, 'goblin1', GOBLIN.back - 1); knockDown(s, 'goblin2', 10);
    s.state.goblins.goblin3!.health = 1;
    engage(s, 'goblin3');
    runUntil(s, () => s.state.goblins.goblin3!.downUntil !== null, 30);
    expect(s.state.goblins.goblin1!.downUntil).toBeNull();               // it came back first: not all down at once
    run(s, 2);
    expect(of(s, 'chiefOut')).toEqual([]);
    expect(s.state.goblinCamp.chiefOut).toBe(false);
    expect(fighting(s)).toBe('goblin1');                                 // on to the one up
    // beat that one too, while the other two are still down: now all three are, and out he comes
    runUntil(s, () => s.state.player.task.kind === 'fight', 30);
    s.state.goblins.goblin1!.health = 1;
    runUntil(s, () => of(s, 'chiefOut').length > 0, 30);
    expect(GOBLINS.every(id => s.state.goblins[id]!.downUntil !== null)).toBe(true);
    expect(s.state.goblinCamp.chiefOut).toBe(true);
    const chief = s.state.goblins.chief!;
    expect(chief).toMatchObject({ health: CHIEF.health, downUntil: null });
    expect(dist(chief.pos, tentDoor(SITE))).toBeLessThan(0.2);
    expect(targetOf(s.state, CAMP, CHIEF_ID)!.foe).toEqual({ kind: 'chief', health: CHIEF.health, maxHealth: CHIEF.health, down: false });
    // he steps out of his tent, and he goes on to fight him
    runUntil(s, () => s.state.player.task.kind === 'fight' && (s.state.player.task as { target: string }).target === CHIEF_ID, 30);
    expect(dist(s.state.player.pos, chief.pos)).toBeLessThan(strikeReach(CHIEF) + 0.4);
  });

  it('he stands beside the chief to fight him, so the camera as it starts (looking north) never has him hidden behind', () => {
    /** How far off level with him the chief stands, seen from the camera as it starts (looking north, -z), in degrees:
     *  0 beside him, 90 straight behind him (or in front). */
    const offLevel = (s: Setup) => {
      const p = s.state.player.pos, c = s.state.goblins.chief!.pos;
      return Math.asin(Math.abs(c.z - p.z) / dist(c, p)) * 180 / Math.PI;
    };
    const atChief = (s: Setup) => s.state.player.task.kind === 'fight' && (s.state.player.task as { target: string }).target === CHIEF_ID;
    expect(targetOf(ready().state, CAMP, 'goblin1')!.beside).toBeUndefined();
    // as it plays out: he sets off from where he wakes with food from the chest, beats the three, and goes on to him
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = ready(seed);
      s.state.player.pos = wakeSpot(s.state, CAMP).pos;
      s.state.bank = { cooked_fish: 10 };
      send(s, { type: 'fight', target: 'goblin1' });
      runUntil(s, () => atChief(s), 900);
      expect(atChief(s), `seed ${seed}`).toBe(true);
      expect(targetOf(s.state, CAMP, CHIEF_ID)!.beside).toBe(true);
      expect(offLevel(s), `seed ${seed}`).toBeLessThan(25);
      expect(dist(s.state.player.pos, s.state.goblins.chief!.pos)).toBeCloseTo(strikeReach(CHIEF), 1);
    }
    // tapped from anywhere round him, he goes round to his side: the side nearer him, or the other where his tent is
    const nav = navFor(CAMP, BUILT);
    for (let k = 0; k < 8; k++) {
      const s = ready(5);
      chiefOutNow(s);
      const c = s.state.goblins.chief!.pos, a = k * Math.PI / 4;
      s.state.player.pos = nav.nearestWalkable({ x: c.x + Math.cos(a) * 2.5, z: c.z + Math.sin(a) * 2.5 });
      send(s, { type: 'fight', target: CHIEF_ID });
      runUntil(s, () => atChief(s), 30);
      expect(atChief(s), `from ${k * 45} degrees`).toBe(true);
      expect(offLevel(s), `from ${k * 45} degrees`).toBeLessThan(25);
      expect(nav.walkable(s.state.player.pos)).toBe(true);
    }
  });

  it('a goblin coming back while he fights the chief mills about without joining in; he fights on', () => {
    const s = ready(5);
    chiefOutNow(s);
    s.state.player.backpack = { cooked_fish: 10 };
    runUntil(s, () => s.state.player.task.kind === 'fight' && (s.state.player.task as { target: string }).target === CHIEF_ID, 30);
    s.state.goblins.chief!.health = 1e9;
    s.state.goblins.goblin2!.downUntil = s.state.time + 2;
    const from = s.log.length;
    runUntil(s, () => of(s, 'goblinBack', from).length > 0, 5);
    run(s, 30);
    expect(s.state.player.task).toMatchObject({ kind: 'fight', target: CHIEF_ID });
    expect(of(s, 'bitten', from).every(e => e.by === CHIEF_ID)).toBe(true);
    expect(of(s, 'bitten', from).length).toBeGreaterThan(4);
    expect(s.state.goblins.goblin2!.swing).toBeNull();
    expect(s.state.goblinCamp.chiefOut).toBe(true);
  });

  it('beaten, he leaves a torn map in the backpack and the camp is cleared for good: the chapter ends', () => {
    const s = ready(6);
    chiefOutNow(s);
    s.state.goblins.goblin1!.downUntil = s.state.time + 1;                      // one comes back meanwhile
    runUntil(s, () => s.state.player.task.kind === 'fight' && (s.state.player.task as { target: string }).target === CHIEF_ID, 30);
    s.state.goblins.chief!.health = 2;
    runUntil(s, () => s.state.goblinCamp.cleared, 60);
    expect(s.state.goblinCamp).toEqual({ chiefOut: false, cleared: true });
    expect(s.state.goblins).toEqual({});
    expect(of(s, 'beaten').at(-1)).toEqual({ type: 'beaten', target: CHIEF_ID, item: 'old_map', foe: 'chief' });
    expect(of(s, 'campCleared')).toHaveLength(1);
    expect(s.state.player.backpack.old_map).toBe(1);
    // the notice: the player is "you" in notices, so it's clear the map is his, not dropped
    expect(GOBLIN_TEXT.cleared).toBe('You beat the goblin chief, and the goblins run off for good. You find a torn map. The gate stands open.');
    run(s, 1);
    expect(s.state.goalsDone).toContain('goblins');
    expect(of(s, 'goalDone').map(e => e.goal)).toContain('goblins');
    expect(s.state.player.task.kind).toBe('idle');                      // nothing left to fight
    // no goblins, now or ever: none to fight, none come back
    for (const id of [...GOBLINS, CHIEF_ID]) expect(targetOf(s.state, CAMP, id)).toBeNull();
    send(s, { type: 'fight', target: 'goblin1' });
    run(s, 300);
    expect(of(s, 'goblinBack').filter(e => s.log.indexOf(e) > s.log.findIndex(x => x.type === 'campCleared'))).toEqual([]);
    expect(s.state.goblins).toEqual({});
    // he can't drop the map; the chapter's last words on the card and the last page of the book
    send(s, { type: 'drop', item: 'old_map', count: 1 });
    expect(s.log.at(-1)).toEqual({ type: 'cantDrop', item: 'old_map' });
    expect(owned(s.state, 'old_map')).toBe(1);
    if (at('goblins') === GOALS.length - 1) {
      expect(allGoalsDone(s.state)).toBe(true);
      expect(bookPages(s.state).at(-1)).toMatchObject({ goal: 'goblins', done: true, hint: CAMP_DONE.text });
    }
    expect(CAMP_DONE.title).toBe('The way is open');
  });

  it('a map that finds no room in a full backpack goes into the chest instead', () => {
    const s = ready(6);
    chiefOutNow(s);
    runUntil(s, () => s.state.player.task.kind === 'fight' && (s.state.player.task as { target: string }).target === CHIEF_ID, 30);
    // the blow that beats him lands as his backpack is full (a contrived case: hauling would have taken it to the chest)
    s.state.goblins.chief!.health = 0;
    s.state.player.backpack = { stone: BACKPACK_SLOTS };
    step(s.state, STEP, s.ctx);
    expect(s.state.goblinCamp.cleared).toBe(true);
    expect(owned(s.state, 'old_map')).toBe(1);
    expect(s.state.bank.old_map ?? s.state.player.backpack.old_map).toBe(1);
    expect(backpackCount(s.state)).toBeLessThanOrEqual(BACKPACK_SLOTS);
  });
});

describe('knocked out at the goblin camp', () => {
  it('by a goblin: he wakes at camp with everything; the goblin heals back; the chief stays in his tent', () => {
    const s = ready(2);
    s.state.player.backpack = { birch_logs: 3 };
    s.state.skills.defence = 0;
    knockDown(s, 'goblin3');
    engage(s, 'goblin2');
    s.state.health = 1;
    s.state.goblins.goblin2!.health = 9;
    runUntil(s, () => of(s, 'knockedOut').length > 0, 600);
    expect(of(s, 'knockedOut')).toEqual([{ type: 'knockedOut', by: 'goblin2', foe: 'goblin' }]);
    expect(s.state.goblins.goblin2!.health).toBe(GOBLIN.health);
    expect(s.state.goblins.goblin3!.downUntil).not.toBeNull();
    runUntil(s, () => of(s, 'wokeUp').length > 0, KNOCKED_OUT.slump + 1);
    expect(of(s, 'wokeUp')).toEqual([{ type: 'wokeUp', by: 'goblin2' }]);
    const tent = CAMP.camp!.tent;
    expect(dist(s.state.player.pos, tent.pos)).toBeLessThan(tent.radius + 1.2);
    expect(s.state.player.task).toEqual({ kind: 'idle' });
    expect(s.state.health).toBe(Math.ceil(maxHealth(s.state) * KNOCKED_OUT.health));
    expect(s.state.player.backpack).toEqual({ birch_logs: 3 });
    expect(s.state.goblinCamp.chiefOut).toBe(false);
  });

  it('by the chief: he goes back into his tent and heals; the goblins down stay down until their time', () => {
    const s = ready(8);
    chiefOutNow(s);
    runUntil(s, () => s.state.player.task.kind === 'fight' && (s.state.player.task as { target: string }).target === CHIEF_ID, 30);
    s.state.player.backpack = {};
    s.state.skills.defence = 0;
    s.state.health = 1;
    s.state.goblins.chief!.health = 7;
    const downs = GOBLINS.map(id => s.state.goblins[id]!.downUntil);
    runUntil(s, () => of(s, 'knockedOut').length > 0, 600);
    expect(of(s, 'knockedOut').at(-1)).toEqual({ type: 'knockedOut', by: CHIEF_ID, foe: 'chief' });
    expect(s.state.goblinCamp).toEqual({ chiefOut: false, cleared: false });
    expect(s.state.goblins.chief).toMatchObject({ health: CHIEF.health, pos: tentDoor(SITE), to: null, swing: null });
    expect(targetOf(s.state, CAMP, CHIEF_ID)).toBeNull();
    expect(GOBLINS.map(id => s.state.goblins[id]!.downUntil)).toEqual(downs);
    // they come back as usual, and the chief stays in until all three are down at once again
    runUntil(s, () => GOBLINS.every(id => s.state.goblins[id]!.downUntil === null), GOBLIN.back + 5);
    expect(s.state.goblinCamp.chiefOut).toBe(false);
    run(s, 30);
    expect(s.state.goblinCamp.chiefOut).toBe(false);
    expect(s.state.goblins.chief!.pos).toEqual(tentDoor(SITE));
  });
});

describe('food, the chest and the fire, as with the rats', () => {
  it('setting off with no food on him, he takes up to 5 from the chest first, then goes on to the goblins', () => {
    const s = ready();
    s.state.player.pos = wakeSpot(s.state, CAMP).pos;
    s.state.bank = { cooked_fish: 9, berries: 4 };
    send(s, { type: 'fight', target: 'goblin1' });
    expect(s.log.at(-1)).toEqual({ type: 'fetchFood' });
    expect(s.state.player.trip).toEqual({ fight: 'goblin1' });
    runUntil(s, () => of(s, 'tookFood').length > 0, 60);
    expect(of(s, 'tookFood')[0]!.items).toEqual({ cooked_fish: FIGHT_FOOD.take });
    runUntil(s, () => s.state.player.task.kind === 'fight', 90);
    expect(s.state.player.task).toMatchObject({ kind: 'fight', target: 'goblin1' });
  });

  it('below 40% of his most he eats, right after a blow', () => {
    const s = ready();
    s.state.player.backpack = { cooked_fish: 2, berries: 2 };
    engage(s, 'goblin1');
    s.state.goblins.goblin1!.health = 1e9;
    s.state.health = Math.floor(maxHealth(s.state) * FIGHT_FOOD.below);
    runUntil(s, () => of(s, 'ate').length > 0, 60);
    expect(of(s, 'ate')[0]!.item).toBe('cooked_fish');
    for (const [i, e] of s.log.entries()) if (e.type === 'ate') expect(s.log[i - 1]!.type).toBe('bitten');
  });

  it('a full backpack takes him to the chest, where he empties it and takes food, and back to the goblins', () => {
    const s = ready(4);
    s.state.bank = { cooked_fish: 8 };
    s.state.player.backpack = { copper_ore: BACKPACK_SLOTS - 1, cooked_fish: 1 };   // full, with food on him
    send(s, { type: 'fight', target: 'goblin2' });
    runUntil(s, () => of(s, 'backpackFull').length > 0, 10);
    expect(s.state.player.trip).toEqual({ fight: 'goblin2' });
    runUntil(s, () => of(s, 'banked').length > 0, 90);
    expect(s.state.bank.copper_ore).toBe(BACKPACK_SLOTS - 1);
    expect(s.state.player.backpack).toEqual({ cooked_fish: FIGHT_FOOD.take });
    runUntil(s, () => s.state.player.task.kind === 'fight' && !s.state.player.trip, 90);
    expect(GOBLINS).toContain((s.state.player.task as { target: string }).target);
  });

  it('at nightfall he leaves the goblins (or the chief) to stoke the fire, then goes back to them by himself', () => {
    for (const chief of [false, true]) {
      const s = ready();
      s.state.built = s.state.built.filter(b => b !== 'shelter');   // (no shelter: he works through the night, not to bed)
      s.state.player.backpack = { cooked_fish: 6 };
      s.state.woodpile = 6;
      if (chief) chiefOutNow(s);
      const target = chief ? CHIEF_ID : 'goblin1';
      if (!chief) engage(s, target);
      runUntil(s, () => s.state.player.task.kind === 'fight' && (s.state.player.task as { target: string }).target === target, 30);
      s.state.goblins[target]!.health = 1e9;
      s.state.time = clock(0, NIGHTFALL) - 2;
      runUntil(s, () => of(s, 'stokeOff').length > 0, 10);
      expect(s.state.player.stoke?.back, String(chief)).toEqual({ fight: target });
      runUntil(s, () => of(s, 'stoked').length > 0, 180);
      runUntil(s, () => s.state.player.task.kind === 'fight', 180);
      expect(s.state.player.task, String(chief)).toMatchObject({ kind: 'fight', target });
      const from = s.log.length;
      run(s, 10);
      expect(of(s, 'hit', from).length).toBeGreaterThan(2);
    }
  });
});

describe('saving the goblin camp', () => {
  it('a save made mid-fight with the chief reloads cleanly, and the fight goes on', () => {
    const s = ready();
    chiefOutNow(s);
    runUntil(s, () => s.state.player.task.kind === 'fight' && (s.state.player.task as { target: string }).target === CHIEF_ID, 30);
    run(s, 4.1);
    const back = deserialize(serialize(s.state), CAMP);
    expect(back).toEqual(s.state);
    const loaded = { ...setup(CAMP, 9), state: back };
    run(loaded, 8);
    expect(loaded.state.player.task).toMatchObject({ kind: 'fight', target: CHIEF_ID });
    expect(of(loaded, 'bitten').some(e => e.by === CHIEF_ID)).toBe(true);
    // and with goblins down, milling, walking, or the chief walking out of his tent
    const w = ready();
    run(w, 41);
    knockDown(w, 'goblin2');
    expect(deserialize(serialize(w.state), CAMP)).toEqual(w.state);
  });

  it('a save made after clearing reloads cleared: no goblins, the map kept', () => {
    const s = ready();
    chiefOutNow(s);
    s.state.goblins.chief!.health = 1;
    runUntil(s, () => s.state.goblinCamp.cleared, 60);
    run(s, 1);
    const back = deserialize(serialize(s.state), CAMP);
    expect(back).toEqual(s.state);
    expect(back.goblinCamp.cleared).toBe(true);
    expect(back.goblins).toEqual({});
    // goblins in a cleared save are dropped
    const raw = JSON.parse(serialize(s.state));
    raw.goblins = ready().state.goblins;
    expect(deserialize(JSON.stringify(raw), CAMP).goblins).toEqual({});
  });

  it('damaged goblins and camp fall back sensibly; cleared only with the map or its goal to show for it', () => {
    const s = ready();
    run(s, 20);
    const good = JSON.parse(serialize(s.state));
    const load = (edit: (raw: any) => void) => { const raw = structuredClone(good); edit(raw); return deserialize(JSON.stringify(raw), CAMP); };
    const home = (id: string) => goblinSpot(CAMP, id)!.home;
    for (const bad of [null, 'lots', -3, 0, NaN]) expect(load(r => { r.goblins.goblin1.health = bad; }).goblins.goblin1!.health, String(bad)).toBe(GOBLIN.health);
    expect(load(r => { r.goblins.goblin1.health = 99; }).goblins.goblin1!.health).toBe(GOBLIN.health);
    expect(load(r => { r.goblins.goblin2.downUntil = 1e12; }).goblins.goblin2!).toMatchObject({ downUntil: good.time + GOBLIN.back, health: 0 });
    for (const pos of [{ x: 0, z: 0 }, { x: SITE.tent.pos.x, z: SITE.tent.pos.z }, null, { x: 'a', z: 2 }]) {
      expect(load(r => { r.goblins.goblin3.pos = pos; }).goblins.goblin3!.pos, JSON.stringify(pos)).toEqual(home('goblin3'));
    }
    for (const bad of [-1, GOBLIN.every + 1, 'x']) expect(load(r => { r.goblins.goblin1.swing = bad; }).goblins.goblin1!.swing).toBeNull();
    // the chief never down, and in his tent while he isn't out
    expect(load(r => { r.goblins.chief.downUntil = r.time + 5; }).goblins.chief!.downUntil).toBeNull();
    expect(load(r => { r.goblins.chief.pos = { x: SITE.pos.x, z: SITE.pos.z + 2 }; }).goblins.chief!.pos).toEqual(tentDoor(SITE));
    // the camp: junk is as new; cleared without the map (or its goal done) is as new, so the map can still be won
    for (const junk of [null, 'cleared', [1], { chiefOut: 'yes', cleared: 1 }]) expect(load(r => { r.goblinCamp = junk; }).goblinCamp).toEqual({ chiefOut: false, cleared: false });
    const lost = load(r => { r.goblinCamp = { chiefOut: false, cleared: true }; });
    expect(lost.goblinCamp.cleared).toBe(false);
    expect(Object.keys(lost.goblins)).toEqual([...GOBLINS, CHIEF_ID]);
    expect(load(r => { r.goblinCamp = { chiefOut: true, cleared: true }; r.player.backpack = { old_map: 1 }; }).goblinCamp).toEqual({ chiefOut: false, cleared: true });
    expect(load(r => { r.goblinCamp = { chiefOut: false, cleared: true }; r.goalsDone.push('goblins'); }).goblinCamp.cleared).toBe(true);
    // a fight with the chief while he is in his tent stops
    expect(load(r => { r.player.task = { kind: 'fight', target: 'chief', progress: 0.2 }; }).player.task).toEqual({ kind: 'idle' });
  });

  it('"Ready for the goblins" (0.0.25) comes before the camp, and a save that already cleared the camp has it done', () => {
    const g = GOALS[at('goblins') - 1]!;
    expect(g.id).toBe('ready');
    expect(g.levels).toEqual({ attack: 7, strength: 7, defence: 7 });
    const s = ready();
    s.state.goalsDone = GOALS.filter(x => x.id !== 'ready').map(x => x.id);    // every goal, as 0.0.24 had them
    s.state.skills.defence = XP_TABLE[4]!;                                        // below what the new goal asks
    const raw = JSON.parse(serialize(s.state, Date.now()));
    raw.version = 10;
    const back = readSave(JSON.stringify(raw), CAMP).state;
    expect(back.goalsDone).toContain('ready');
    expect(allGoalsDone(back)).toBe(true);
    // one that hadn't cleared the camp yet doesn't
    raw.goalsDone = GOALS.slice(0, at('hide_shield') + 1).map(x => x.id);
    expect(readSave(JSON.stringify(raw), CAMP).state.goalsDone).not.toContain('ready');
  });

  it('0.0.22 and 0.0.23 saves (format 10, before the goblin camp) load with the camp as new', () => {
    const s = ready();
    s.state.goalsDone = GOALS.slice(0, at('hide_shield') + 1).map(g => g.id);
    const raw = JSON.parse(serialize(s.state, Date.now()));
    delete raw.goblins; delete raw.goblinCamp;
    raw.version = 10;                                          // as 0.0.22 to 0.0.24 wrote it
    expect(SAVE_VERSION).toBe(13);
    const v23 = readSave(JSON.stringify(raw), CAMP).state;
    expect(v23.goblinCamp).toEqual({ chiefOut: false, cleared: false });
    expect(Object.keys(v23.goblins)).toEqual([...GOBLINS, CHIEF_ID]);
    expect(v23.goblins.goblin1).toMatchObject({ health: GOBLIN.health, downUntil: null, pos: goblinSpot(CAMP, 'goblin1')!.home, swing: null });
    // the first goal after the hide shield not yet finished ("Ready for the goblins" is met already at these levels)
    expect(currentGoal(v23)).toBe(GOALS.find((g, i) => i > at('hide_shield') && !goalFinished(v23, g)));
    delete raw.rats;                                                  // 0.0.22: no rats either
    const v22 = readSave(JSON.stringify(raw), CAMP).state;
    expect(Object.keys(v22.goblins)).toEqual([...GOBLINS, CHIEF_ID]);
    expect(Object.keys(v22.rats)).toEqual(['rat1', 'rat2', 'rat3']);
    const loaded = { ...setup(), state: v22 };
    loaded.state.player.pos = { ...OUTSIDE };
    loaded.state.player.backpack = { cooked_fish: 2 };
    engage(loaded, 'goblin1');
    expect(loaded.state.player.task.kind).toBe('fight');
  });
});

describe('the village has no goblins', () => {
  it('fighting one there does nothing; goblins in a village save are dropped; walking is as it was', () => {
    const s = setup(VILLAGE);
    s.state.equipment.weapon = 'stone_club';
    send(s, { type: 'fight', target: 'goblin1' });
    send(s, { type: 'fight', target: CHIEF_ID });
    run(s, 3);
    expect(s.log).toEqual([]);
    const raw = JSON.parse(serialize(s.state));
    raw.goblins = ready().state.goblins; raw.goblinCamp = { chiefOut: true, cleared: true };
    raw.player.task = { kind: 'fight', target: 'goblin1', progress: 0.2 };
    const back = deserialize(JSON.stringify(raw), VILLAGE);
    expect(back.goblins).toEqual({});
    expect(back.goblinCamp).toEqual({ chiefOut: false, cleared: false });
    expect(back.player.task).toEqual({ kind: 'idle' });
    expect(VILLAGE.land).toBeUndefined();
  });
});

describe('the rats and the dummy still work beside the goblin camp', () => {
  it('a rat fight and practice at the dummy go on as before, and the goblins take no part', () => {
    const s = ready();
    s.state.player.pos = { x: -7.5, z: 9.5 };
    s.state.player.backpack = { cooked_fish: 5 };
    engage(s, 'rat1');
    runUntil(s, () => of(s, 'beaten').length > 0, 120);
    expect(of(s, 'beaten')[0]).toMatchObject({ target: 'rat1' });
    expect(of(s, 'beaten')[0]!.foe).toBeUndefined();
    expect(of(s, 'bitten').every(e => e.by.startsWith('rat'))).toBe(true);
    s.state.player.pos = { x: 0.2, z: 1.2 };
    send(s, { type: 'fight', target: 'dummy' });
    runUntil(s, () => s.state.player.task.kind === 'fight' && (s.state.player.task as { target: string }).target === 'dummy', 30);
    const from = s.log.length;
    run(s, 30);
    expect(of(s, 'hit', from).every(e => e.target === 'dummy')).toBe(true);
    expect(of(s, 'hit', from).length).toBeGreaterThan(8);
    expect(GOBLINS.every(id => s.state.goblins[id]!.health === GOBLIN.health)).toBe(true);
  });
});

describe('away time at the goblin camp', () => {
  const NOW = 1_000_000;
  const reopen = (saved: string, seed = 21) => {
    const t = setup(CAMP, seed), state = readSave(saved, CAMP).state, log: GameEvent[] = [];
    t.events.on(e => log.push(e));
    // how quick: the processor time this test's own process spent on it, so other work on the machine (the rest of the
    // suite running beside it) doesn't count
    const started = process.cpuUsage();
    const r = catchUpAway(state, NOW, NOW + 2 * 60 * 60 * 1000, { ...t.ctx, rng: createRng(99) });
    const used = process.cpuUsage(started);
    return { state, r, ms: (used.user + used.system) / 1000, log };
  };

  it('two hours closed while fighting the goblins catch up the same every time, quickly; the note tells it all', () => {
    const s = ready();
    s.state.player.backpack = { cooked_fish: 5 };
    engage(s, 'goblin1');
    run(s, 3);
    const saved = serialize(s.state, NOW), a = reopen(saved), b = reopen(saved);
    expect(a.state).toEqual(b.state);
    expect(a.r.summary).toEqual(b.r.summary);
    // quick against the same catch-up of the whole camp left be, timed here alongside it, so a busy machine slows both
    // alike: never 3 times as much (the better of two tries of each, so one slow moment doesn't count)
    const whole = readFileSync(new URL('./fixtures/camp/whole-camp.json', import.meta.url), 'utf8');
    const camp = JSON.stringify({ ...JSON.parse(whole), savedAt: NOW });
    const ref = Math.min(reopen(camp).ms, reopen(camp).ms);
    expect(Math.min(a.ms, b.ms)).toBeLessThan(3 * ref);
    const lines = awayText([a.r.away], a.r.summary).lines;
    // 24 minutes of play is plenty to clear the camp at these levels, with 5 fish along
    expect(a.state.goblinCamp.cleared).toBe(true);
    expect(a.r.summary.cleared).toBe(true);
    expect(lines).toContain('He beat the goblin chief, and the goblins ran off for good. He found a torn map.');
    expect(owned(a.state, 'old_map')).toBe(1);
    expect(a.r.summary.goblins).toBe(a.log.filter(e => e.type === 'beaten' && e.foe === 'goblin').length);
    expect(a.r.summary.goblins).toBeGreaterThan(2);
    expect(lines).toContain(`He beat ${a.r.summary.goblins} goblins.`);
    expect(a.r.summary.beaten).toBeUndefined();                       // goblins aren't counted as rats
  });

  it('the note words goblins, the camp cleared and who knocked him out plainly, and adds them up', () => {
    const s = emptySummary();
    tally(s, { type: 'beaten', target: 'goblin1', item: null, foe: 'goblin' });
    expect(awayText([], s).lines).toEqual(['He beat a goblin.']);
    tally(s, { type: 'beaten', target: 'chief', item: 'old_map', foe: 'chief' });
    tally(s, { type: 'campCleared' });
    tally(s, { type: 'knockedOut', by: 'goblin2', foe: 'goblin' });
    expect(awayText([], s).lines).toEqual(['He beat a goblin.', 'He beat the goblin chief, and the goblins ran off for good. He found a torn map.',
      'Then a goblin knocked him out, and he woke up back at camp.']);
    const c = emptySummary();
    tally(c, { type: 'knockedOut', by: 'chief', foe: 'chief' });
    expect(awayText([], c).lines).toEqual(['Then the goblin chief knocked him out, and he woke up back at camp.']);
    const into = emptySummary();
    addSummary(into, s); addSummary(into, c);
    tally(into, { type: 'knockedOut', by: 'rat1' });
    expect(into.goblins).toBe(1);
    expect(awayText([], into).lines.at(-1)).toBe('He was knocked out 3 times, and each time he woke up back at camp.');
    // a rat's knock-out is worded as before
    const r = emptySummary();
    tally(r, { type: 'knockedOut', by: 'rat1' });
    expect(awayText([], r).lines).toEqual(['Then a rat knocked him out, and he woke up back at camp.']);
    expect('goblins' in emptySummary()).toBe(false);
  });
});

describe('the long run at the goblin camp', () => {
  /** He sets off from where he wakes, with 10 cooked fish in the chest (he takes 5 along), at `level` in Attack,
   *  Strength, Defence and Vitality with the full hide armour: how it ends within `max` seconds. */
  const fightItOut = (seed: number, level: number, max = 1800) => {
    const s = ready(seed, level);
    s.state.player.pos = wakeSpot(s.state, CAMP).pos;
    s.state.bank = { cooked_fish: 10 };
    send(s, { type: 'fight', target: 'goblin1' });
    const t = runUntil(s, () => s.state.goblinCamp.cleared || of(s, 'wokeUp').length > 0, max);
    return { s, t };
  };

  it('at Attack, Strength and Defence 9 with the hide armour and food from the chest, he clears the camp in a few minutes', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { s, t } = fightItOut(seed, 9);
      expect(s.state.goblinCamp.cleared, `seed ${seed}`).toBe(true);
      expect(t / 60, `seed ${seed}`).toBeLessThan(10);
      expect(of(s, 'tookFood')).toHaveLength(1);
      expect(of(s, 'chiefOut').length).toBeGreaterThanOrEqual(1);
      expect(of(s, 'knockedOut')).toEqual([]);
      run(s, 1);
      expect(s.state.goalsDone).toContain('goblins');
      expect(owned(s.state, 'old_map')).toBe(1);
      expect(backpackCount(s.state)).toBeLessThanOrEqual(BACKPACK_SLOTS);
      expect(navFor(CAMP, s.state.built).walkable(s.state.player.pos)).toBe(true);
    }
  });

  it('a weaker one (level 4) is knocked out, gently: he wakes at camp with his things and the camp is as it was', () => {
    for (const seed of [1, 2]) {
      const { s } = fightItOut(seed, 4, 3600);
      expect(s.state.goblinCamp.cleared, `seed ${seed}`).toBe(false);
      expect(of(s, 'wokeUp'), `seed ${seed}`).toHaveLength(1);
      // he stands at the camp; or, woken in his hours in bed (his bedtime came in the long fight), off to bed from there
      if (s.state.needs.bed) expect(s.state.player.pending, `seed ${seed}`).toEqual({ kind: 'visit', id: 'shelter' });
      else expect(s.state.player.task, `seed ${seed}`).toEqual({ kind: 'idle' });
      expect(s.state.health).toBeGreaterThan(0);
      expect(s.state.equipment.shield).toBe('hide_shield');
      expect(s.state.goblinCamp.chiefOut).toBe(false);
      expect(dist(s.state.player.pos, CAMP.camp!.tent.pos)).toBeLessThan(CAMP.camp!.tent.radius + 1.2);
    }
  });
});

describe("the goblin camp's goal", () => {
  it('comes after the hide shield: a gathering goal for the torn map, with a page in his book', () => {
    const goal = GOALS[at('goblins')]!;
    expect(at('goblins')).toBeGreaterThan(at('hide_shield'));
    expect(goal).toMatchObject({ title: 'The goblin camp', needs: { old_map: 1 } });
    expect(goal.makes).toBeUndefined();
    expect(goal.levels).toBeUndefined();
    expect(goal.page).toMatch(/goblin/i);
    expect(goal.page).toMatch(/chief/i);
    expect(goal.page).toMatch(/food/i);
    expect(goal.page).toMatch(/armour/i);
    // it's a race, and the card and the page say so, and how to win it: all three down before any gets back up, and
    // what to train for it (hitting more often and harder)
    expect(goal.hint).toMatch(/all three before they get back up/);
    expect(goal.page).toMatch(/train Attack and Strength/);
    const s = ready();
    expect(currentGoal(s.state)).toBe(goal);
    expect(bookPages(s.state).at(-1)).toMatchObject({ goal: 'goblins', current: true, done: false, text: goal.page, hint: goal.hint });
    expect(CAMP_DONE.text).toMatch(/goblins are gone/);
  });
});
