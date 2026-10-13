// What he is doing, over his head (13 Oct 2026; ui/activity.ts): the tag's words for each kind of work, the bar for
// what has a clear end, nothing while he stands idle or just walks, and the Settings switch in index.html.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createState } from '../src/core/state';
import { EventBus } from '../src/core/events';
import { createRng } from '../src/core/rng';
import { STEP } from '../src/core/loop';
import { step } from '../src/sim';
import { CAMP } from '../src/world/camp';
import { applyCommands, type Command } from '../src/systems/commands';
import { activityOf, activityShown } from '../src/ui/activity';
import { MAKES } from '../src/data/making';
import { COOK } from '../src/data/cooking';
import { GOALS } from '../src/data/goals';
import { SKILL_ICONS } from '../src/ui/pictures';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/** A camp set up as far as the training dummy, by day, with his tools on him. */
function camp() {
  const state = createState(CAMP, 3), events = new EventBus();
  state.goalsDone = GOALS.slice(0, GOALS.findIndex(g => g.makes === 'dummy') + 1).map(g => g.id);
  state.built = ['campfire', 'woodpile', 'shelter', 'chest', 'dummy'];
  state.tools = { axe: true, pick: true, rod: true };
  state.hasBook = true;
  const ctx = { layout: CAMP, rng: createRng(3), events };
  const send = (c: Command) => applyCommands(state, CAMP, [c], events);
  const run = (seconds: number, until?: () => boolean) => { for (let t = 0; t < seconds && !until?.(); t += STEP) step(state, STEP, ctx); };
  return { state, send, run };
}

describe('the tag over his head (activityOf)', () => {
  it('says nothing while he stands idle, or just walks', () => {
    const c = camp();
    expect(activityOf(c.state, CAMP)).toBeNull();
    c.send({ type: 'walk', to: { x: c.state.player.pos.x + 3, z: c.state.player.pos.z } });
    expect(c.state.player.task.kind).toBe('walk');
    expect(activityOf(c.state, CAMP)).toBeNull();
  });

  it('chopping a birch: "Chopping birch", with the Woodcutting icon and no bar (it has no end)', () => {
    const c = camp();
    const birch = CAMP.nodes.find(n => n.resource === 'birch_tree')!;
    c.send({ type: 'work', nodeId: birch.id });
    expect(activityOf(c.state, CAMP)?.text).toBe('Off to chop birch');
    c.run(60, () => c.state.player.task.kind === 'gather');
    expect(activityOf(c.state, CAMP)).toEqual({ icon: SKILL_ICONS.woodcutting, text: 'Chopping birch', progress: null });
  });

  it('building in stages: "Building the wall tent", with a bar for how far along it is', () => {
    const c = camp();
    c.state.underway = { wall_tent: MAKES.wall_tent.time / 4 };
    c.state.player.task = { kind: 'raise', id: 'wall_tent' };
    const a = activityOf(c.state, CAMP)!;
    expect(a.text).toBe('Building the wall tent');
    expect(a.icon).toBe(SKILL_ICONS.carpentry);
    expect(a.progress).toBeCloseTo(0.25, 5);
  });

  it('cooking and making have a bar that fills as the time runs out', () => {
    const c = camp();
    c.state.player.task = { kind: 'cook', doneAt: c.state.time + COOK.time / 2 };
    expect(activityOf(c.state, CAMP)).toMatchObject({ text: 'Cooking fish', progress: 0.5 });
    c.state.player.task = { kind: 'make', id: 'stone_club', doneAt: c.state.time + MAKES.stone_club.time };
    expect(activityOf(c.state, CAMP)).toMatchObject({ text: 'Making the stone club', progress: 0 });
  });

  it('practising at the dummy, and asleep until his waking hour', () => {
    const c = camp();
    c.state.player.task = { kind: 'fight', target: 'dummy', progress: 0 };
    expect(activityOf(c.state, CAMP)?.text).toBe('Practising at the dummy');
    c.state.player.task = { kind: 'sleep' };
    c.state.needs.bed = { back: null, until: (Math.floor(c.state.time / 720) + 1) * 720 + (7 / 24) * 720 };
    expect(activityOf(c.state, CAMP)?.text).toBe('Asleep until 07:00');
  });

  it('on his way with a load: "Taking his load to the chest"', () => {
    const c = camp();
    const birch = CAMP.nodes.find(n => n.resource === 'birch_tree')!;
    c.state.player.task = { kind: 'walk' };
    c.state.player.trip = { nodeId: birch.id };
    expect(activityOf(c.state, CAMP)?.text).toBe('Taking his load to the chest');
  });
});

describe('the Settings switch', () => {
  it('shows the tag unless it was switched off in this browser', () => {
    expect(activityShown.get()).toBe(true);                      // no storage here: shown
  });

  it('index.html has it in Settings, with a choice to show what he is doing or nothing', () => {
    expect(html).toMatch(/<div class="seg" id="activityShow"[^>]*><button type="button" data-show="on">[^<]+<\/button><button type="button" data-show="off">[^<]+<\/button><\/div>/);
  });
});
