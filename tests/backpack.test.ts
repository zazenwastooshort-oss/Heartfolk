// The Backpack window (the UI foundation, part 2, 12 Oct 2026): every thing he can carry, every piece of gear and every
// skill has a picture drawn in code (ui/pictures.ts); the 28 slots, one thing in each, each kind together
// (ui/backpack.ts); what the bar under them says and offers for a picked thing; what is stored and the firewood pile;
// what he wears and his bonuses (ui/armour.ts); and the window's parts in index.html.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BUNDLE, GEAR_PICTURES, ITEM_PICTURES, SKILL_ICONS, SLOT_SHAPES, hasPicture, picture } from '../src/ui/pictures';
import { itemInfo, pileText, slotsOf, storedList } from '../src/ui/backpack';
import { SLOT_NAMES, bonusText, wornSlots } from '../src/ui/armour';
import { canDrop, createState } from '../src/core/state';
import { gearBonus } from '../src/systems/combat';
import { CAMP } from '../src/world/camp';
import { ITEMS, SKILLS } from '../src/data/skills';
import { GEAR, SLOTS } from '../src/data/combat';
import { FOOD, isFood } from '../src/data/food';
import { BACKPACK_SLOTS } from '../src/data/hauling';
import { WOODPILE } from '../src/data/fire';
import { PICKUPS } from '../src/data/pickups';

/** Whether a picture's markup is well formed: every <g> closed, every other element closed on itself, numbers only. */
function wellFormed(svg: string): boolean {
  const opened = (svg.match(/<g[\s>]/g) ?? []).length, closed = (svg.match(/<\/g>/g) ?? []).length;
  const shapes = [...svg.matchAll(/<(path|circle|ellipse|rect|polygon|line)\b[^>]*?(\/?)>/g)];
  return opened === closed && shapes.length > 0 && shapes.every(m => m[2] === '/') && !/undefined|NaN|null/.test(svg);
}

describe('pictures drawn in code (ui/pictures.ts)', () => {
  it('every thing he can carry has a picture of its own, and there are none for things that do not exist', () => {
    for (const id of Object.keys(ITEMS)) {
      expect(hasPicture(id), id).toBe(true);
      expect(ITEM_PICTURES[id], id).not.toBe(BUNDLE);
      expect(wellFormed(ITEM_PICTURES[id]!), id).toBe(true);
    }
    expect(Object.keys(ITEM_PICTURES).sort()).toEqual(Object.keys(ITEMS).sort());
  });

  it('every piece of gear has a picture, and every place gear goes has a faint shape for when it is empty', () => {
    expect(Object.keys(GEAR_PICTURES).sort()).toEqual(Object.keys(GEAR).sort());
    for (const [id, svg] of Object.entries(GEAR_PICTURES)) expect(wellFormed(svg), id).toBe(true);
    for (const slot of SLOTS) expect(GEAR[SLOT_SHAPES[slot]].slot, slot).toBe(slot);
  });

  it('the pictures differ from each other, so no two things look the same', () => {
    const all = [...Object.values(ITEM_PICTURES), ...Object.values(GEAR_PICTURES)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('every skill has an icon', () => {
    expect(Object.keys(SKILL_ICONS).sort()).toEqual(Object.keys(SKILLS).sort());
    for (const [id, svg] of Object.entries(SKILL_ICONS)) expect(wellFormed(svg), id).toBe(true);
  });

  it('a picture is a whole SVG on the 32 x 32 grid; anything without one shows the bundle', () => {
    const svg = picture('birch_logs');
    expect(svg).toMatch(/^<svg class="item-pic" viewBox="0 0 32 32" aria-hidden="true">[\s\S]+<\/svg>$/);
    expect(svg).toContain(ITEM_PICTURES.birch_logs);
    expect(picture('hide_cap')).toContain(GEAR_PICTURES.hide_cap);
    expect(picture('something_new')).toContain(BUNDLE);
    expect(hasPicture('something_new')).toBe(false);
    expect(wellFormed(BUNDLE)).toBe(true);
  });
});

describe('the slots (ui/backpack.ts)', () => {
  it('an empty backpack is 28 empty slots', () => {
    expect(slotsOf({})).toEqual(Array(BACKPACK_SLOTS).fill(null));
    expect(BACKPACK_SLOTS).toBe(28);                        // 7 across and 4 down in the window
  });

  it('one thing in each slot, each kind together in the order he first put it in, then the empty ones', () => {
    const slots = slotsOf({ birch_logs: 3, stone: 2, berries: 1 });
    expect(slots).toHaveLength(BACKPACK_SLOTS);
    expect(slots.slice(0, 7)).toEqual(['birch_logs', 'birch_logs', 'birch_logs', 'stone', 'stone', 'berries', null]);
    expect(slots.filter(s => s === null)).toHaveLength(BACKPACK_SLOTS - 6);
  });

  it('a full backpack fills every slot, as many as he carries; nothing past the last slot, nothing for none', () => {
    const full = slotsOf({ copper_ore: 20, plank: 8 });
    expect(full.every(s => s !== null)).toBe(true);
    expect(full.filter(s => s === 'plank')).toHaveLength(8);
    expect(slotsOf({ stone: 40 })).toHaveLength(BACKPACK_SLOTS);
    expect(slotsOf({ stone: 0, branch: 2 }).slice(0, 3)).toEqual(['branch', 'branch', null]);
  });

  it('matches what the game counts as carried: the slots in use are the things he carries', () => {
    const state = createState(CAMP, 1);
    state.player.backpack = { birch_logs: 8, copper_ore: 4, cooked_fish: 3, rat_hide: 1 };
    expect(slotsOf(state.player.backpack).filter(Boolean)).toHaveLength(16);
  });
});

describe('the bar under the slots: a picked thing (ui/backpack.ts)', () => {
  it('food can be eaten and dropped, and says how much it heals', () => {
    for (const id of Object.keys(FOOD)) {
      const info = itemInfo(id, 3);
      expect(info, id).toMatchObject({ name: ITEMS[id]!.name, eat: true, drop: canDrop(id) });
      expect(info.note, id).toContain(`3 in your backpack. Each heals ${FOOD[id]!.heals}.`);
    }
    expect(itemInfo('cooked_fish', 1).note).toBe(`1 in your backpack. It heals ${FOOD.cooked_fish!.heals}.`);
  });

  it('one of a thing goes by its name for one: "Birch log", "Plank"', () => {
    expect(itemInfo('birch_logs', 1).name).toBe('Birch log');
    expect(itemInfo('birch_logs', 8).name).toBe('Birch logs');
    expect(itemInfo('plank', 1).name).toBe('Plank');
  });

  it("the wreck's things can't be dropped, and it says why; everything else can", () => {
    const wreck = Object.values(PICKUPS).flatMap(p => (p.respawn === null && p.gives !== 'book' ? [p.gives.item] : []));
    expect(new Set(wreck)).toEqual(new Set(['plank', 'tarp']));
    for (const id of Object.keys(ITEMS)) {
      const info = itemInfo(id, 2);
      expect(info.drop, id).toBe(!wreck.includes(id));
      expect(info.eat, id).toBe(isFood(id));
    }
    expect(itemInfo('plank', 7).note).toBe("7 in your backpack. From the wreck: you won't find more, so you keep them.");
    expect(itemInfo('tarp', 1).note).toBe("1 in your backpack. From the wreck: you won't find another, so you keep it.");
  });

  it('raw and burnt fish say why there is nothing to eat', () => {
    expect(itemInfo('raw_fish', 2)).toMatchObject({ eat: false, drop: true, note: '2 in your backpack. Cook them at the campfire first.' });
    expect(itemInfo('raw_fish', 1).note).toBe('1 in your backpack. Cook it at the campfire first.');
    expect(itemInfo('burnt_fish', 1).note).toBe('1 in your backpack. Too burnt to eat.');
  });
});

describe('what is stored and the firewood pile (ui/backpack.ts)', () => {
  it('lists what is stored kind by kind, with how many', () => {
    expect(storedList({ birch_logs: 22, copper_ore: 1, stone: 0, berries: 1200 })).toEqual([
      { id: 'birch_logs', text: '22 birch logs' },
      { id: 'copper_ore', text: '1 copper ore' },
      { id: 'berries', text: `${(1200).toLocaleString()} berries` },
    ]);
    expect(storedList({})).toEqual([]);
  });

  it('says how many logs the pile holds and how many it can', () => {
    expect(pileText(14)).toBe(`14 / ${WOODPILE.max} logs`);
  });
});

describe('what he wears (ui/armour.ts)', () => {
  it('a tile for each place gear goes, in order, with what is there', () => {
    const state = createState(CAMP, 1);
    expect(wornSlots(state)).toEqual(SLOTS.map(slot => ({ slot, gear: null })));
    state.equipment.weapon = 'stone_club'; state.equipment.head = 'hide_cap';
    expect(wornSlots(state).map(w => w.gear?.id ?? null)).toEqual(['stone_club', 'hide_cap', null, null]);
    expect(Object.keys(SLOT_NAMES)).toEqual(SLOTS);
  });

  it('his bonuses as the rolls count them, once he wears anything', () => {
    const state = createState(CAMP, 1);
    expect(bonusText(state)).toBeNull();
    state.equipment.weapon = 'stone_club';
    expect(bonusText(state)).toBe(`Attack +${GEAR.stone_club.attack}, Strength +${GEAR.stone_club.strength}, Defence +0`);
    state.equipment = { weapon: 'stone_club', head: 'hide_cap', body: 'hide_vest', shield: 'hide_shield' };
    expect(bonusText(state)).toBe(`Attack +${gearBonus(state, 'attack')}, Strength +${gearBonus(state, 'strength')}, Defence +${gearBonus(state, 'defence')}`);
  });
});

describe('the Backpack window in the page (index.html)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const win = html.match(/<section class="win" id="backpackWin"[\s\S]*?<\/section>/)?.[0] ?? '';

  it('has the slots, the bar with its buttons, what he wears, what is stored and the firewood pile, in that order', () => {
    const order = ['id="packCount"', 'id="packList"', 'id="packPick"', 'id="pickEat"', 'id="pickDrop1"', 'id="pickDropAll"',
      'id="armourRow"', 'id="armour"', 'id="bonus"', 'id="bankRow"', 'id="bankName"', 'id="bank"', 'id="pileRow"', 'id="pile"'];
    const at = order.map(id => win.indexOf(id));
    expect(at.every(i => i >= 0), order.filter((_, i) => at[i]! < 0).join(' ')).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('lays the slots out 7 across', () => {
    expect(html).toMatch(/\.pack-slots \{[^}]*grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
  });

  it('its buttons say what they do in plain words', () => {
    expect(win).toContain('>Eat</button>');
    expect(win).toContain('>Drop one</button>');
    expect(win).toContain('>Drop all</button>');
  });
});
