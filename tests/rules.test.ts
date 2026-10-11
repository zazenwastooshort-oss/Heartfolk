import { describe, expect, it } from 'vitest';
import { createState } from '../src/core/state';
import { EventBus, type GameEvent } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { step } from '../src/sim';
import { VILLAGE, inArea, type Layout } from '../src/world/layout';
import { navFor } from '../src/world/nav';
import { applyCommands, type Command } from '../src/systems/commands';
import { RESOURCES } from '../src/data/skills';
import { XP_TABLE } from '../src/data/xp';

// the village's tin is in land not yet claimed, so the level rule is tested on a copy with a tin rock in the village
const TEST_LAYOUT: Layout = {
  ...VILLAGE,
  nodes: [...VILLAGE.nodes, { id: 'testTin', resource: 'tin_rock', pos: { x: 3.2, z: 9.8 }, radius: 0.95 }],
};

function setup(layout = TEST_LAYOUT) {
  const state = createState(layout, 5), events = new EventBus(), log: GameEvent[] = [];
  events.on(e => log.push(e));
  return { state, events, log, ctx: { layout, rng: createRng(5), events } };
}
const run = (s: ReturnType<typeof setup>, seconds: number) => { for (let t = 0; t < seconds; t += STEP) step(s.state, STEP, s.ctx); };

describe('level requirements', () => {
  const tinLevel = RESOURCES.tin_rock!.level;

  it('refuses a rock above your level, says why, and stays put', () => {
    const s = setup(), queue: Command[] = [{ type: 'work', nodeId: 'testTin' }];
    const start = { ...s.state.player.pos };
    applyCommands(s.state, TEST_LAYOUT, queue, s.events);
    run(s, 10);
    expect(s.state.player.task.kind).toBe('idle');
    expect(s.state.player.pos).toEqual(start);
    expect(s.state.bank.tin_ore ?? 0).toBe(0);
    expect(s.log).toContainEqual({ type: 'levelTooLow', skill: 'mining', need: tinLevel, what: 'Tin rock' });
  });

  it('allows it once you reach the level', () => {
    const s = setup(), queue: Command[] = [{ type: 'work', nodeId: 'testTin' }];
    s.state.skills.mining = XP_TABLE[tinLevel]!;
    applyCommands(s.state, TEST_LAYOUT, queue, s.events);
    run(s, 70);
    expect(s.state.bank.tin_ore ?? 0).toBeGreaterThan(0);
  });

  it('stops an old save that was already mining a rock above the player level', () => {
    const s = setup();
    s.state.player.task = { kind: 'gather', nodeId: 'testTin', progress: 0 };
    run(s, 5);
    expect(s.state.player.task.kind).toBe('idle');
    expect(s.state.bank.tin_ore ?? 0).toBe(0);
  });
});

describe('woodcutting levels', () => {
  const oakLevel = RESOURCES.oak_tree!.level;

  it('refuses the oaks by the river until Woodcutting level 10, whatever the Mining level', () => {
    const s = setup(VILLAGE), queue: Command[] = [{ type: 'work', nodeId: 'oak1' }];
    s.state.skills.mining = XP_TABLE[50]!;
    applyCommands(s.state, VILLAGE, queue, s.events);
    run(s, 5);
    expect(s.state.player.task.kind).toBe('idle');
    expect(s.log).toContainEqual({ type: 'levelTooLow', skill: 'woodcutting', need: oakLevel, what: 'Oak tree' });
  });

  it('chops oak once you reach the level', () => {
    const s = setup(VILLAGE), queue: Command[] = [{ type: 'work', nodeId: 'oak1' }];
    s.state.skills.woodcutting = XP_TABLE[oakLevel]!;
    applyCommands(s.state, VILLAGE, queue, s.events);
    run(s, 90);
    expect(s.state.bank.oak_logs ?? 0).toBeGreaterThan(0);
  });
});

describe('land not yet claimed', () => {
  it('a rock in unexplored land sends you to its edge instead of mining it', () => {
    const s = setup(VILLAGE), queue: Command[] = [{ type: 'work', nodeId: 'tin1' }];
    applyCommands(s.state, VILLAGE, queue, s.events);
    run(s, 60);
    expect(s.log).toContainEqual({ type: 'visited', id: 'east' });
    expect(s.state.bank.tin_ore ?? 0).toBe(0);
    expect(inArea(VILLAGE.village, s.state.player.pos)).toBe(true);
    expect(navFor(VILLAGE).walkable(s.state.player.pos)).toBe(true);
  });
});

describe('buildings', () => {
  it('tapping a building walks to its door, faces it and announces the visit', () => {
    for (const b of VILLAGE.buildings) {
      const s = setup(VILLAGE), queue: Command[] = [{ type: 'visit', id: b.id }];
      applyCommands(s.state, VILLAGE, queue, s.events);
      run(s, 60);
      expect(s.log, b.id).toContainEqual({ type: 'visited', id: b.id });
      expect(s.state.player.task.kind).toBe('idle');
    }
  });
});
