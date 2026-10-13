// The chapter 1 and 2 polish (13 Oct 2026, from the chapter review the owner agreed to): fair rat hides (one at least
// every third rat), "well fed" after a cooked meal (a little more XP for a while), a night's sleep heals him, the saved
// values read back (and damaged ones fall back), and every goal has a tip to show when it starts (ui/hud.ts).
import { describe, expect, it } from 'vitest';
import { createState, maxHealth, type GameState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { deserialize, serialize } from '../src/core/save';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { dropsHide } from '../src/systems/rats';
import { eat } from '../src/systems/food';
import { addXp } from '../src/systems/skills';
import { RAT } from '../src/data/rats';
import { FED } from '../src/data/food';
import { GOALS } from '../src/data/goals';

function setup() {
  const state = createState(CAMP, 7), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, ctx: { layout: CAMP, rng: createRng(7), events } };
}

describe('fair rat hides', () => {
  it('a hide by luck about half the time, and for sure once two rats in a row left none', () => {
    expect(RAT.drop.atLeast).toBe(3);
    expect(dropsHide(0.1, 0)).toBe(true);                      // lucky
    expect(dropsHide(0.9, 0)).toBe(false);
    expect(dropsHide(0.9, 1)).toBe(false);
    expect(dropsHide(0.9, 2)).toBe(true);                      // the third rat without one: for sure
  });

  it('so ten rats leave at least three hides, however unlucky the rolls', () => {
    let since = 0, hides = 0;
    for (let i = 0; i < 10; i++) { if (dropsHide(0.99, since)) { hides++; since = 0; } else since++; }
    expect(hides).toBeGreaterThanOrEqual(3);
  });
});

describe('well fed', () => {
  it('a cooked fish leaves him well fed for a while: told once, after what he ate; berries alone do not', () => {
    const s = setup();
    s.state.player.backpack = { berries: 2, cooked_fish: 2 };
    s.state.health = 3;
    eat(s.state, 'berries', s.events);
    expect(s.state.fedUntil).toBe(0);
    eat(s.state, 'cooked_fish', s.events);
    expect(s.state.fedUntil).toBeCloseTo(s.state.time + FED.time, 6);
    expect(s.log.map(e => e.type).slice(-2)).toEqual(['ate', 'wellFed']);
    eat(s.state, 'cooked_fish', s.events);                    // already well fed: no second word, the time starts again
    expect(s.log.filter(e => e.type === 'wellFed')).toHaveLength(1);
  });

  it('while well fed the XP he gains is a fifth more (rounded); after, as before', () => {
    const s = setup();
    s.state.fedUntil = s.state.time + FED.time;
    addXp(s.state, 'woodcutting', 10, s.events);
    expect(s.state.skills.woodcutting).toBe(12);
    s.state.fedUntil = s.state.time - 1;
    addXp(s.state, 'woodcutting', 10, s.events);
    expect(s.state.skills.woodcutting).toBe(22);
  });
});

describe('sleep heals', () => {
  it('he gets up from a night in the shelter at his full health', () => {
    const s = setup();
    s.state.built = ['campfire', 'woodpile', 'shelter', 'chest'];
    s.state.health = 2;
    s.state.player.task = { kind: 'sleep' };
    s.state.needs.bed = { back: null, until: s.state.time + 1 };
    for (let t = 0; t < 3; t += STEP) step(s.state, STEP, s.ctx);
    expect(s.state.player.task.kind).not.toBe('sleep');
    expect(s.state.health).toBe(maxHealth(s.state));
  });
});

describe('saves', () => {
  const edit = (state: GameState, change: (raw: Record<string, unknown>) => void) => {
    const raw = JSON.parse(serialize(state)) as Record<string, unknown>;
    change(raw);
    return deserialize(JSON.stringify(raw), CAMP);
  };

  it('well fed and the rats since the last hide read back; damaged or missing values fall back', () => {
    const s = setup();
    s.state.fedUntil = s.state.time + 100;
    s.state.ratsSinceHide = 2;
    const back = deserialize(serialize(s.state), CAMP);
    expect(back.fedUntil).toBeCloseTo(s.state.time + 100, 6);
    expect(back.ratsSinceHide).toBe(2);
    expect(edit(s.state, r => { r.fedUntil = 'soon'; r.ratsSinceHide = -1; })).toMatchObject({ fedUntil: 0, ratsSinceHide: 0 });
    expect(edit(s.state, r => { delete r.fedUntil; delete r.ratsSinceHide; })).toMatchObject({ fedUntil: 0, ratsSinceHide: 0 });
    expect(edit(s.state, r => { r.ratsSinceHide = 99; }).ratsSinceHide).toBe(RAT.drop.atLeast - 1);
    expect(edit(s.state, r => { r.fedUntil = (r.time as number) + 1e9; }).fedUntil).toBeCloseTo(s.state.time + FED.time, 3);
  });
});

describe("each goal's tip", () => {
  it('every goal has a tip to show once when it starts (ui/hud.ts)', () => {
    for (const g of GOALS) expect(g.hint.trim().length, g.id).toBeGreaterThan(0);
  });
});
