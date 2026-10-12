// Chapter 2's groundwork (0.0.22): his health, which grows with Vitality, and eating food from his backpack to heal.
import { describe, expect, it } from 'vitest';
import { createState, maxHealth, SAVE_VERSION } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { CAMP } from '../src/world/camp';
import { applyCommands } from '../src/systems/commands';
import { eat } from '../src/systems/food';
import { readSave, serialize } from '../src/core/save';
import { HEALTH } from '../src/data/combat';
import { FOOD } from '../src/data/food';
import { XP_TABLE } from '../src/data/xp';

function setup() {
  const state = createState(CAMP, 1), events = new EventBus(), seen: GameEvent[] = [];
  events.on(e => seen.push(e));
  return { state, events, seen };
}

describe('his health', () => {
  it('starts full, and his most grows with his Vitality level', () => {
    const { state } = setup();
    expect(state.health).toBe(HEALTH.base);
    expect(maxHealth(state)).toBe(HEALTH.base);
    state.skills.vitality = XP_TABLE[5]!;
    expect(maxHealth(state)).toBe(HEALTH.base + 4 * HEALTH.perLevel);
  });
});

describe('eating', () => {
  it('heals by what the food heals, never past his most, one at a time from the backpack', () => {
    const { state, events, seen } = setup();
    state.player.backpack = { cooked_fish: 2, berries: 1 };
    state.health = 3;
    expect(eat(state, 'cooked_fish', events)).toBe(true);
    expect(state.health).toBe(3 + FOOD.cooked_fish!.heals);
    expect(state.player.backpack.cooked_fish).toBe(1);
    expect(seen.at(-1)).toEqual({ type: 'ate', item: 'cooked_fish', healed: FOOD.cooked_fish!.heals, health: state.health });
    state.health = maxHealth(state) - 0.5;
    expect(eat(state, 'berries', events)).toBe(true);
    expect(state.health).toBe(maxHealth(state));
    expect(seen.at(-1)).toMatchObject({ type: 'ate', healed: 0.5 });
    expect('berries' in state.player.backpack).toBe(false);
  });

  it('is refused for what is not food, food he does not carry, and when his health is full', () => {
    const { state, events, seen } = setup();
    state.player.backpack = { raw_fish: 3, berries: 2 };
    state.bank = { cooked_fish: 4 };
    state.health = 2;
    expect(eat(state, 'raw_fish', events)).toBe(false);
    expect(seen.at(-1)).toEqual({ type: 'cantEat', item: 'raw_fish', reason: 'notFood' });
    expect(eat(state, 'cooked_fish', events)).toBe(false);
    expect(seen.at(-1)).toEqual({ type: 'cantEat', item: 'cooked_fish', reason: 'none' });
    state.health = maxHealth(state);
    expect(eat(state, 'berries', events)).toBe(false);
    expect(seen.at(-1)).toEqual({ type: 'cantEat', item: 'berries', reason: 'full' });
    expect(state.player.backpack).toEqual({ raw_fish: 3, berries: 2 });
    expect(state.bank).toEqual({ cooked_fish: 4 });
  });

  it('as a command, leaves whatever he is doing alone', () => {
    const { state, events } = setup();
    state.player.backpack = { berries: 3 };
    state.health = 5;
    state.player.task = { kind: 'gather', nodeId: 'x', progress: 0.4 };
    state.player.path = [{ x: 1, z: 2 }];
    applyCommands(state, CAMP, [{ type: 'eat', item: 'berries' }], events);
    expect(state.health).toBe(5 + FOOD.berries!.heals);
    expect(state.player.task).toEqual({ kind: 'gather', nodeId: 'x', progress: 0.4 });
    expect(state.player.path).toEqual([{ x: 1, z: 2 }]);
  });
});

describe('saves with health (format 10)', () => {
  const raw = (edit: (s: any) => void) => {
    const s = JSON.parse(serialize(createState(CAMP, 1), 1000));
    edit(s);
    return JSON.stringify(s);
  };

  it('a format 9 save loads with his health full and the new skills from 0', () => {
    const back = readSave(raw(s => { s.version = 9; delete s.health; s.skills = { mining: 40, woodcutting: 900 }; }), CAMP).state;
    expect(SAVE_VERSION).toBe(10);
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.health).toBe(maxHealth(back));
    expect(back.skills).toEqual({ ...createState(CAMP).skills, mining: 40, woodcutting: 900 });
  });

  it('keeps a saved health up to his most; a broken one is full', () => {
    const with5 = raw(s => { s.health = 5; s.skills.vitality = XP_TABLE[3]; });
    expect(readSave(with5, CAMP).state.health).toBe(5);
    expect(readSave(raw(s => { s.health = 400; }), CAMP).state.health).toBe(HEALTH.base);
    for (const bad of [0, -2, null, 'lots', Infinity]) expect(readSave(raw(s => { s.health = bad; }), CAMP).state.health).toBe(HEALTH.base);
  });
});
