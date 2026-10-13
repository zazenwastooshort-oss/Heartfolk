// His needs on the screen (the idle core, 12 Oct 2026): "Hungry" in the strip at the foot while he is hungry, with a
// thin bar of how full he is (with food about he eats at once, so it shows only while there is nothing to eat), and the
// notices that go with eating when hungry and going to bed by himself. Reads state and listens to events; changes
// nothing in the game.
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout } from '../world/layout';
import type { Hud } from './hud';
import { isHungry } from '../core/needs';
import { itemList } from './hud';

const $ = (id: string) => document.getElementById(id)!;

/** The notices, in plain words. */
export const NEEDS_TEXT = {
  meal: (items: Record<string, number>, took?: Record<string, number>) =>
    `He stops for a bite: ${itemList(items, ' and ')}.${took && Object.keys(took).length ? ` He takes ${itemList(took, ' and ')} along.` : ''}`,
  mealOff: "He's hungry: off to the chest for a bite.",
  hungry: (bushes: boolean) => `He's hungry, and there's nothing to eat.${bushes ? ' Berries grow on the bushes by the camp.' : ''}`,
  bedtime: 'Bedtime. He heads for the shelter.',
} as const;

export class NeedsHud {
  constructor(private layout: Layout, events: EventBus, hud: Hud) {
    const bushes = (layout.pickups ?? []).some(p => p.kind === 'bush');
    events.on(e => {
      if (e.type === 'meal') hud.notice(NEEDS_TEXT.meal(e.items, e.took));
      else if (e.type === 'mealOff') hud.notice(NEEDS_TEXT.mealOff);
      else if (e.type === 'hungry') hud.notice(NEEDS_TEXT.hungry(bushes));
      else if (e.type === 'bedtime') hud.notice(NEEDS_TEXT.bedtime);
    });
  }

  update(state: GameState): void {
    const hungry = !!this.layout.camp && isHungry(state);
    $('hungerRow').hidden = !hungry;
    if (hungry) $('hungerBar').style.width = `${Math.max(0, Math.min(1, state.needs.fullness)) * 100}%`;
  }
}
