// Chapter 2, hide armour (chunk D): the hide cap, vest and shield (GEAR in data/combat.ts), made from rat hides where he
// stands like the club and worn at once (MAKES in data/making.ts); the goals that ask for them, one block that follows
// the rats once merged; armour making the same attacker land less often (the OSRS rolls in systems/combat.ts); saves;
// the view putting on him what he wears (render/gear.ts); the panel's armour line (ui/armour.ts); the village.
// Other goals may sit before or after the armour's block: a goal is made current by marking every goal before it done,
// never by its position, and nothing is assumed about the goal after the block.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { allGoalsDone, createState, currentGoal, goalFinished, made, owned, type GameState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { DAY_SECONDS } from '../src/core/clock';
import { deserialize, readSave, serialize } from '../src/core/save';
import { bookPages, goalLines } from '../src/core/book';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { VILLAGE, type Layout } from '../src/world/layout';
import { applyCommands, type Command } from '../src/systems/commands';
import { attackRoll, defenceRollOf, gearBonus, hitChance, maxHitOf, roll, worn } from '../src/systems/combat';
import { GEAR, SLOTS, type GearId } from '../src/data/combat';
import { MAKES, type MakeId } from '../src/data/making';
import { GOALS } from '../src/data/goals';
import { ITEMS } from '../src/data/skills';
import { XP_TABLE } from '../src/data/xp';
import { ARMOUR_MODELS, WEAPON_MODELS, armourWorn, wearGear } from '../src/render/gear';
import { armourText } from '../src/ui/armour';
import { itemList } from '../src/ui/hud';

/** The pieces, in the order their goals come. */
const PIECES = ['hide_cap', 'hide_vest', 'hide_shield'] as const satisfies readonly (GearId & MakeId)[];
type Piece = typeof PIECES[number];
const goal = (id: string) => GOALS.find(g => g.id === id)!;
const at = (id: string) => GOALS.findIndex(g => g.id === id);
/** The goals before `id`: marked done, they make `id` the current goal. */
const before = (id: string) => GOALS.slice(0, at(id)).map(g => g.id);
const clock = (day: number, hour: number) => (day + hour / 24) * DAY_SECONDS;

function setup(layout: Layout = CAMP, seed = 5) {
  const state = createState(layout, seed), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, layout, ctx: { layout, rng: createRng(seed), events } };
}
type Setup = ReturnType<typeof setup>;
const send = (s: Setup, c: Command) => applyCommands(s.state, s.layout, [c], s.events);
const runUntil = (s: Setup, done: () => boolean, max: number) => { for (let t = 0; t < max && !done(); t += STEP) step(s.state, STEP, s.ctx); };
const run = (s: Setup, seconds: number) => runUntil(s, () => false, seconds);
const since = (s: Setup, from: number) => s.log.slice(from);

/** A camp with everything of chapter 2's first part: the camp's structures and the training dummy stand, he has his
 *  tools and wears the stone club, and every goal before `id` is done. Morning, so no night falls in a short test. */
function campAt(id: string, seed = 5): Setup {
  const s = setup(CAMP, seed);
  s.state.goalsDone = before(id);
  s.state.built = ['campfire', 'woodpile', 'shelter', 'chest', 'dummy'];
  s.state.tools = { axe: true, pick: true, rod: true };
  s.state.equipment.weapon = 'stone_club';
  s.state.hasBook = true;
  s.state.time = clock(0, 8);
  return s;
}
/** Send him to make `id` and wait until it is made (or refused, or the time runs out). */
function make(s: Setup, id: MakeId): void {
  const from = s.log.length;
  send(s, { type: 'make', id });
  runUntil(s, () => since(s, from).some(e => e.type === 'made' || e.type === 'missing'), MAKES[id].time + 2);
  run(s, 0.1);
}
/** A creature's attack roll, as a creature's defence roll is made (OSRS): (its level + 9) times (its bonus + 64). It
 *  rolls against his defence roll, defenceRollOf (systems/combat.ts), as anything that hits back at him does. */
const creature = (level: number, bonus = 0) => roll(level + 9, bonus);

describe('the hide armour (data)', () => {
  it('three pieces, one for each armour slot, defence only', () => {
    expect(PIECES.map(id => GEAR[id].slot)).toEqual(['head', 'body', 'shield']);
    expect(SLOTS.filter(s => s !== 'weapon')).toEqual(['head', 'body', 'shield']);
    for (const id of PIECES) {
      const g = GEAR[id];
      expect(g, id).toMatchObject({ id, attack: 0, strength: 0 });
      expect(g.defence, id).toBeGreaterThan(0);
      expect(g.speed, id).toBeUndefined();
      expect(g.name, id).toMatch(/^Hide /);
    }
    // the vest covers the most, the cap the least
    expect(GEAR.hide_vest.defence).toBeGreaterThan(GEAR.hide_shield.defence);
    expect(GEAR.hide_shield.defence).toBeGreaterThan(GEAR.hide_cap.defence);
  });

  it('each is made from rat hides where he stands, in a few seconds, and gives him the piece to wear', () => {
    expect(ITEMS.rat_hide).toMatchObject({ name: 'Rat hides', one: 'Rat hide' });
    expect(MAKES.hide_cap).toMatchObject({ name: 'Hide cap', verb: 'Make', needs: { rat_hide: 2 }, at: 'here', gives: { kind: 'gear', gear: 'hide_cap' } });
    expect(MAKES.hide_vest).toMatchObject({ name: 'Hide vest', verb: 'Make', needs: { rat_hide: 4 }, at: 'here', gives: { kind: 'gear', gear: 'hide_vest' } });
    expect(MAKES.hide_shield).toMatchObject({ name: 'Hide shield', verb: 'Make', needs: { rat_hide: 3, branch: 2 }, at: 'here', gives: { kind: 'gear', gear: 'hide_shield' } });
    for (const id of PIECES) {
      expect(MAKES[id].time, id).toBeGreaterThan(1);
      expect(MAKES[id].time, id).toBeLessThan(10);
      expect(MAKES[id].done, id).toMatch(new RegExp(`^You made a ${MAKES[id].name.toLowerCase()}`));
    }
    // 9 hides in all, for rats that drop one about half the time
    expect(PIECES.reduce((a, id) => a + MAKES[id].needs.rat_hide!, 0)).toBe(9);
  });

  it('the goals: a hide cap, a hide vest and a hide shield, together, each a making goal; the book says armour makes him harder to hit', () => {
    expect(PIECES.map(at)).toEqual([at('hide_cap'), at('hide_cap') + 1, at('hide_cap') + 2]);
    expect(at('hide_cap')).toBeGreaterThan(at('stone_club'));       // after he has a weapon to fight the rats with
    expect(PIECES.map(id => goal(id).title)).toEqual(['A hide cap', 'A hide vest', 'A hide shield']);
    for (const id of PIECES) {
      expect(goal(id), id).toMatchObject({ makes: id, needs: MAKES[id].needs, ready: 'You have it all. Tap Make.' });
      expect(goal(id).levels, id).toBeUndefined();
      expect(goal(id).hint, id).toMatch(/rats/);
    }
    expect(goal('hide_shield').hint).toMatch(/branches/);
    expect(goal('hide_cap').page).toMatch(/[Aa]rmour makes you harder to hit/);
    expect(goal('hide_vest').page).toMatch(/harder you are to hit/);
  });
});

describe('armour makes him harder to hit', () => {
  it('the same attacker lands less often on him in armour: each piece a little less, all three about a fifth less', () => {
    // him as the armour's goals find him, Defence level 3 from the practice goal, with his armour on or not
    const him = (armour: readonly Piece[] = []) => {
      const state = setup().state;
      state.skills.defence = XP_TABLE[3]!;
      for (const id of armour) state.equipment[GEAR[id].slot] = id;
      return state;
    };
    // his defence roll counts his armour (OSRS): (Defence level 3 + 8) times (the armour's defence bonus + 64)
    const armour = PIECES.reduce((a, id) => a + GEAR[id].defence, 0), all = him(PIECES);
    expect(defenceRollOf(him())).toBe(11 * 64);
    expect(defenceRollOf(all)).toBe(11 * (64 + armour));
    const rat = creature(1), bare = hitChance(rat, defenceRollOf(him()));
    expect(bare).toBeGreaterThan(0.3);
    const chances = [bare, ...PIECES.map((_, i) => hitChance(rat, defenceRollOf(him(PIECES.slice(0, i + 1)))))];
    for (let i = 1; i < chances.length; i++) expect(chances[i]!).toBeLessThan(chances[i - 1]!);
    expect(gearBonus(all, 'defence')).toBe(armour);
    expect(chances.at(-1)! / bare).toBeCloseTo(64 / (64 + armour), 2);
    expect(chances.at(-1)! / bare).toBeLessThan(0.85);
    // and against an attacker stronger than his defence roll (the other side of the OSRS formula), too
    const brute = creature(30, 20);
    expect(brute).toBeGreaterThan(defenceRollOf(all));
    expect(hitChance(brute, defenceRollOf(all))).toBeLessThan(hitChance(brute, defenceRollOf(him())));
    // the same over many rolls with the same dice
    const lands = (state: GameState) => { const rng = createRng(3); let n = 0; for (let i = 0; i < 20000; i++) if (rng.next() < hitChance(rat, defenceRollOf(state))) n++; return n; };
    expect(lands(all)).toBeLessThan(lands(him()) * 0.85);
  });

  it('armour changes only his defence: his accuracy and his max hit stay as they were', () => {
    const bare = setup(), armoured = setup();
    for (const st of [bare.state, armoured.state]) { st.equipment.weapon = 'stone_club'; st.skills.strength = XP_TABLE[4]!; }
    for (const id of PIECES) armoured.state.equipment[GEAR[id].slot] = id;
    expect(worn(armoured.state).map(g => g.id)).toEqual(['stone_club', ...PIECES]);
    for (const style of ['attack', 'strength', 'defence'] as const) {
      bare.state.combatStyle = style; armoured.state.combatStyle = style;
      expect(attackRoll(armoured.state)).toBe(attackRoll(bare.state));
      expect(maxHitOf(armoured.state)).toBe(maxHitOf(bare.state));
    }
    // training Defence adds to his defence roll, armour on or off: +3 to his level (Defence 1 here)
    armoured.state.combatStyle = 'attack';
    const off = defenceRollOf(armoured.state);
    expect(off).toBe(9 * (64 + gearBonus(armoured.state, 'defence')));
    armoured.state.combatStyle = 'defence';
    expect(defenceRollOf(armoured.state)).toBe(12 * (64 + gearBonus(armoured.state, 'defence')));
    expect(defenceRollOf(armoured.state)).toBeGreaterThan(off);
  });
});

describe('making the hide armour', () => {
  it('each piece where he stands, from the hides he has: he puts it on, the goal is done, and it is never made twice', () => {
    const s = campAt('hide_cap');
    for (const id of PIECES) {
      s.state.goalsDone = before(id);
      expect(currentGoal(s.state).id).toBe(id);
      s.state.player.backpack = { ...MAKES[id].needs };
      const where = { ...s.state.player.pos }, from = s.log.length;
      make(s, id);
      expect(since(s, from)).toContainEqual({ type: 'made', make: id });
      expect(s.state.equipment[GEAR[id].slot], id).toBe(id);
      expect(made(s.state, id)).toBe(true);
      expect(s.state.player.pos).toEqual(where);
      expect(s.state.player.backpack).toEqual({});
      expect(s.state.goalsDone).toContain(id);
      expect(currentGoal(s.state).id !== id || allGoalsDone(s.state)).toBe(true);   // on to the next (if there is one)
    }
    expect(s.state.equipment).toEqual({ weapon: 'stone_club', head: 'hide_cap', body: 'hide_vest', shield: 'hide_shield' });
    // worn, none of them is made again: nothing happens and the hides stay
    for (const id of PIECES) {
      s.state.player.backpack = { ...MAKES[id].needs };
      const from = s.log.length;
      make(s, id);
      expect(since(s, from).filter(e => e.type === 'made' || e.type === 'missing' || e.type === 'goalFirst'), id).toEqual([]);
      expect(owned(s.state, 'rat_hide')).toBe(MAKES[id].needs.rat_hide);
    }
  });

  it('without enough hides he says what is still missing, stays put, and nothing is used up', () => {
    const s = campAt('hide_vest');
    s.state.equipment.head = 'hide_cap';
    s.state.player.backpack = { rat_hide: 3 };
    const where = { ...s.state.player.pos };
    send(s, { type: 'make', id: 'hide_vest' });
    expect(s.log.at(-1)).toEqual({ type: 'missing', make: 'hide_vest', items: { rat_hide: 1 } });
    run(s, 3);
    expect(s.state.player.pos).toEqual(where);
    expect(s.state.player.pending).toBeNull();
    expect(s.state.player.backpack).toEqual({ rat_hide: 3 });
    expect(s.state.equipment.body).toBeNull();
    // the shield, without its branches
    const t = campAt('hide_shield');
    t.state.equipment.head = 'hide_cap'; t.state.equipment.body = 'hide_vest';
    t.state.player.backpack = { rat_hide: 1 };
    send(t, { type: 'make', id: 'hide_shield' });
    expect(t.log.at(-1)).toEqual({ type: 'missing', make: 'hide_shield', items: { rat_hide: 2, branch: 2 } });
    // which the notice reads as "To make the hide shield you still need 2 rat hides and 2 branches."
    expect(itemList({ rat_hide: 2, branch: 2 }, ' and ')).toBe('2 rat hides and 2 branches');
    expect(itemList({ rat_hide: 1 }, ' and ')).toBe('1 rat hide');
  });

  it('hides stored in the chest count, and are taken once the backpack has none', () => {
    const s = campAt('hide_cap');
    s.state.player.backpack = { rat_hide: 1 };
    s.state.bank = { rat_hide: 3 };
    make(s, 'hide_cap');
    expect(s.state.equipment.head).toBe('hide_cap');
    expect(s.state.player.backpack).toEqual({});
    expect(s.state.bank).toEqual({ rat_hide: 2 });
  });

  it('the goals come in order: the cap waits for the goals before it, the vest for the cap, the shield for the vest', () => {
    const s = campAt('hide_cap');
    s.state.goalsDone = before('hide_cap').slice(0, -1);
    s.state.player.backpack = { ...MAKES.hide_cap.needs };
    const first = GOALS.slice(0, at('hide_cap')).find(g => !goalFinished(s.state, g));
    expect(first).toBeDefined();
    send(s, { type: 'make', id: 'hide_cap' });
    expect(s.log.at(-1)).toEqual({ type: 'goalFirst', make: 'hide_cap', goal: first!.id });
    expect(s.state.player.pending).toBeNull();
    for (const [id, waitsFor] of [['hide_vest', 'hide_cap'], ['hide_shield', 'hide_vest']] as const) {
      const t = campAt(waitsFor);
      t.state.player.backpack = { ...MAKES[id].needs };
      send(t, { type: 'make', id });
      expect(t.log.at(-1), id).toEqual({ type: 'goalFirst', make: id, goal: waitsFor });
      run(t, MAKES[id].time + 1);
      expect(t.state.equipment[GEAR[id].slot], id).toBeNull();
    }
  });

  it('his book shows each piece\'s page with the hides it needs, ticked once he wears it', () => {
    const s = campAt('hide_cap');
    s.state.player.backpack = { rat_hide: 1 };
    expect(goalLines(s.state, goal('hide_cap'))).toEqual([{ id: 'rat_hide', need: 2, got: 1, done: false }]);
    expect(bookPages(s.state).at(-1)).toMatchObject({ goal: 'hide_cap', title: 'A hide cap', current: true, done: false, hint: goal('hide_cap').hint });
    s.state.player.backpack = { rat_hide: 2 };
    expect(bookPages(s.state).at(-1)).toMatchObject({ goal: 'hide_cap', hint: 'You have it all. Tap Make.' });
    make(s, 'hide_cap');
    const page = bookPages(s.state).find(p => p.goal === 'hide_cap')!;
    expect(page).toMatchObject({ done: true, current: false, lines: [{ id: 'rat_hide', need: 2, got: 2, done: true }] });
  });
});

describe('saving the hide armour', () => {
  it('a save with armour worn reloads with it, the same game; one made mid-piece finishes after a reload', () => {
    const s = campAt('hide_shield');
    s.state.equipment = { weapon: 'stone_club', head: 'hide_cap', body: 'hide_vest', shield: null };
    s.state.player.backpack = { ...MAKES.hide_shield.needs };
    send(s, { type: 'make', id: 'hide_shield' });
    run(s, 1.5);
    expect(s.state.player.task).toMatchObject({ kind: 'make', id: 'hide_shield' });
    const back = deserialize(serialize(s.state), CAMP);
    expect(back).toEqual(s.state);
    const loaded = { ...setup(CAMP, 9), state: back };
    runUntil(loaded, () => made(loaded.state, 'hide_shield'), MAKES.hide_shield.time + 1);
    expect(loaded.state.equipment).toEqual({ weapon: 'stone_club', head: 'hide_cap', body: 'hide_vest', shield: 'hide_shield' });
    const again = deserialize(serialize(loaded.state, Date.now()), CAMP);
    expect(again.equipment).toEqual(loaded.state.equipment);
    expect(armourText(again)).toBe(armourText(loaded.state));
  });

  it('damaged armour in a save falls back to none: a piece in the wrong slot, something unknown, junk', () => {
    const s = campAt('hide_cap');
    s.state.equipment = { weapon: 'stone_club', head: 'hide_cap', body: 'hide_vest', shield: 'hide_shield' };
    const good = JSON.parse(serialize(s.state));
    const load = (equipment: unknown) => { const raw = structuredClone(good); raw.equipment = equipment; return deserialize(JSON.stringify(raw), CAMP).equipment; };
    expect(load(good.equipment)).toEqual(s.state.equipment);
    expect(load({ weapon: 'hide_shield', head: 'hide_vest', body: 'hide_cap', shield: 'stone_club' })).toEqual({ weapon: null, head: null, body: null, shield: null });
    expect(load({ head: 'hide_cap', body: 'golden_vest', shield: 7 })).toEqual({ weapon: null, head: 'hide_cap', body: null, shield: null });
    expect(load({ weapon: 'stone_club', body: 'hide_vest', shield: ['hide_shield'] })).toEqual({ weapon: 'stone_club', head: null, body: 'hide_vest', shield: null });
    for (const bad of ['hide_cap', null, 12, ['hide_cap', 'hide_vest']]) expect(load(bad), JSON.stringify(bad)).toEqual(createState(CAMP).equipment);
  });

  it('a 0.0.22 save (format 10, no armour) loads as it was: the armour goals not done, the goal after the 0.0.22 ones current', () => {
    // 0.0.22's goals ended with the cooked meal; a save that had them all done had its camp set up
    const s = campAt('meal');
    s.state.goalsDone = GOALS.slice(0, at('meal') + 1).map(g => g.id);
    s.state.skills = { ...s.state.skills, attack: XP_TABLE[3]!, strength: XP_TABLE[3]!, defence: XP_TABLE[3]!, vitality: 300 };
    s.state.bank = { cooked_fish: 4, birch_logs: 12 };
    const raw = JSON.parse(serialize(s.state, Date.now()));
    raw.version = 10;                                          // as 0.0.22 to 0.0.24 wrote it
    expect(raw.equipment).toEqual({ weapon: 'stone_club', head: null, body: null, shield: null });
    const back = readSave(JSON.stringify(raw), CAMP).state;
    expect(back.equipment).toEqual(raw.equipment);
    expect(back.goalsDone).toEqual(raw.goalsDone);
    expect(back.bank).toEqual(raw.bank);
    expect(allGoalsDone(back)).toBe(false);
    expect(currentGoal(back)).toBe(GOALS[at('meal') + 1]);
    for (const id of PIECES) expect(goalFinished(back, goal(id)), id).toBe(false);
    expect(armourText(back)).toBeNull();
    // and once its goal comes, the cap can be made in it
    const loaded = { ...setup(CAMP, 4), state: back };
    loaded.state.goalsDone = before('hide_cap');
    loaded.state.player.backpack = { rat_hide: 2 };
    make(loaded, 'hide_cap');
    expect(loaded.state.equipment.head).toBe('hide_cap');
    // a format 9 save (0.0.21, before gear) has nothing on either
    const old = JSON.parse(serialize(createState(CAMP, 2), Date.now()));
    old.version = 9; delete old.equipment; delete old.health; delete old.combatStyle;
    expect(readSave(JSON.stringify(old), CAMP).state.equipment).toEqual({ weapon: null, head: null, body: null, shield: null });
  });
});

describe('the view puts on him what he wears (render/gear.ts)', () => {
  const miner = async () => {
    const b = readFileSync(new URL('../assets/models/miner.glb', import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, '');
    return gltf.scene.getObjectByName('Miner')!;
  };

  it('armourWorn picks the armour from his equipment, never the weapon', () => {
    expect(armourWorn(createState(CAMP).equipment)).toEqual([]);
    expect(armourWorn({ weapon: 'stone_club', head: null, body: null, shield: null })).toEqual([]);
    expect(armourWorn({ weapon: 'stone_club', head: 'hide_cap', body: null, shield: 'hide_shield' })).toEqual(['hide_cap', 'hide_shield']);
    expect(armourWorn({ weapon: null, head: 'hide_cap', body: 'hide_vest', shield: 'hide_shield' })).toEqual([...PIECES]);
  });

  it('every piece of armour has a model, every weapon has its own; wearGear shows just what he wears', async () => {
    for (const g of Object.values(GEAR)) {
      if (g.slot === 'weapon') expect(Object.hasOwn(WEAPON_MODELS, g.id), g.id).toBe(true);
      else expect(Object.hasOwn(ARMOUR_MODELS, g.id), g.id).toBe(true);
    }
    const him = await miner(), state = createState(CAMP);
    // the club on the tool's bone, as the view makes it, and everything of his own: wearing armour never hides any of it
    const club = WEAPON_MODELS.stone_club!(him.getObjectByName('axe_blade')!.parent!);
    const own = new Map<THREE.Object3D, boolean>();
    him.traverse(o => own.set(o, o.visible));
    const shown = () => PIECES.filter(id => him.getObjectByName(`gear:${id}`)?.visible);
    for (const equipment of [
      { weapon: 'stone_club', head: 'hide_cap', body: null, shield: null },
      { weapon: 'stone_club', head: 'hide_cap', body: 'hide_vest', shield: 'hide_shield' },
      { weapon: null, head: null, body: 'hide_vest', shield: null },
      { weapon: 'stone_club', head: null, body: null, shield: null },
    ] as GameState['equipment'][]) {
      state.equipment = equipment;
      wearGear(him, armourWorn(state.equipment));
      expect(shown()).toEqual(PIECES.filter(id => SLOTS.some(s => equipment[s] === id)));
      for (const [o, visible] of own) expect(o.visible, o.name).toBe(visible);
    }
    expect(own.get(club)).toBe(true);                              // the club among them, shown all along
    expect(him.getObjectByName('gear:stone_club')).toBeUndefined();
  });

  it('the view puts it on from his equipment, only reading it (tests/architecture.test.ts checks all of render/)', () => {
    const src = readFileSync(new URL('../src/render/view.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/wearGear\(this\.miner,/);
    expect(src).toMatch(/armourWorn\(state\.equipment\)/);
  });
});

describe('the armour line in the panel (ui/armour.ts)', () => {
  it('says what he wears and what it adds to his defence, once he wears any', () => {
    const s = setup();
    expect(armourText(s.state)).toBeNull();
    s.state.equipment.weapon = 'stone_club';
    expect(armourText(s.state)).toBeNull();                        // a weapon isn't armour
    s.state.equipment.head = 'hide_cap';
    expect(armourText(s.state)).toBe(`cap (+${GEAR.hide_cap.defence} defence)`);
    s.state.equipment.body = 'hide_vest'; s.state.equipment.shield = 'hide_shield';
    const all = GEAR.hide_cap.defence + GEAR.hide_vest.defence + GEAR.hide_shield.defence;
    expect(armourText(s.state)).toBe(`cap, vest, shield (+${all} defence)`);
    expect(all).toBe(gearBonus(s.state, 'defence'));
    s.state.equipment.head = null;
    expect(armourText(s.state)).toBe(`vest, shield (+${GEAR.hide_vest.defence + GEAR.hide_shield.defence} defence)`);
  });
});

describe('the village', () => {
  it('has no goals, but armour can be made where he stands there too, and a village save keeps it', () => {
    const s = setup(VILLAGE);
    s.state.player.backpack = { rat_hide: 9, branch: 2 };
    for (const id of PIECES) make(s, id);
    expect(s.state.equipment).toEqual({ weapon: null, head: 'hide_cap', body: 'hide_vest', shield: 'hide_shield' });
    expect(s.state.player.backpack).toEqual({});
    expect(s.state.goalsDone).toEqual([]);
    const back = deserialize(serialize(s.state), VILLAGE);
    expect(back.equipment).toEqual(s.state.equipment);
    expect(armourText(back)).toMatch(/^cap, vest, shield/);
  });
});
