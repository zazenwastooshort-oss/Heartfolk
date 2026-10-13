// His needs on the screen (12 and 13 Oct 2026): "Hungry" in the strip at the foot while he is hungry, with a thin bar of
// how full he is (with food to spare he eats at once, so it shows only while there is nothing to eat), and the notices
// that go with eating when hungry, his bedtime, a tap kept until he wakes, and fetching a tool from the chest (and, the
// first time, that his tools are kept there). Reads
// state and listens to events; changes nothing in the game.
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout } from '../world/layout';
import type { Hud } from './hud';
import { isHungry } from '../core/needs';
import { clockLabel } from '../core/clock';
import type { ToolId } from '../data/skills';
import { itemList, itemName } from './hud';
import { toolName } from './backpack';

const $ = (id: string) => document.getElementById(id)!;

/** When he wakes, as the clock shows it ("07:00"): a hair past it, so a waking hour reached by sums never shows a minute
 *  early ("06:59"). */
export const wakeLabel = (time: number) => clockLabel(time + 1e-3);

/** The notices, in plain words. */
export const NEEDS_TEXT = {
  meal: (items: Record<string, number>, took?: Record<string, number>) =>
    `He stops for a bite: ${itemList(items, ' and ')}.${took && Object.keys(took).length ? ` He takes ${itemList(took, ' and ')} along.` : ''}`,
  mealOff: "He's hungry: off to the chest for a bite.",
  /** `keeps`: food he has that the goal counts, all of it, which he leaves alone */
  hungry: (bushes: boolean, keeps?: string) => keeps
    ? `He's hungry, but the ${itemName(keeps, 2)} are for the goal. A few more${keeps === 'berries' && bushes ? ' from the bushes' : ''} and he can spare some.`
    : `He's hungry, and there's nothing to eat.${bushes ? ' Berries grow on the bushes by the camp.' : ''}`,
  bedtime: 'Bedtime. He heads for the shelter.',
  whenAwake: (at: number) => `He'll see to it when he wakes at ${wakeLabel(at)}.`,
  fetchTool: (tool: ToolId) => `He fetches his ${toolName(tool).toLowerCase()} from the chest first.`,
  toolsKept: 'He keeps his tools in the chest now, and takes out the one he needs.',
} as const;

export class NeedsHud {
  constructor(private layout: Layout, events: EventBus, hud: Hud) {
    const bushes = (layout.pickups ?? []).some(p => p.kind === 'bush');
    events.on(e => {
      if (e.type === 'meal') hud.notice(NEEDS_TEXT.meal(e.items, e.took));
      else if (e.type === 'mealOff') hud.notice(NEEDS_TEXT.mealOff);
      else if (e.type === 'hungry') hud.notice(NEEDS_TEXT.hungry(bushes, e.keeps));
      else if (e.type === 'bedtime') hud.notice(NEEDS_TEXT.bedtime);
      else if (e.type === 'whenAwake') hud.notice(NEEDS_TEXT.whenAwake(e.at));
      else if (e.type === 'fetchTool') hud.notice(NEEDS_TEXT.fetchTool(e.tool));
      else if (e.type === 'toolsKept') hud.notice(NEEDS_TEXT.toolsKept);
    });
  }

  update(state: GameState): void {
    const hungry = !!this.layout.camp && isHungry(state);
    $('hungerRow').hidden = !hungry;
    if (hungry) $('hungerBar').style.width = `${Math.max(0, Math.min(1, state.needs.fullness)) * 100}%`;
  }
}
