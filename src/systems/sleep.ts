// Sleeping in the shelter (12 Oct 2026, the owner): at night a tap on the built shelter sends him to bed (if he is off
// to stoke the fire, he stokes it first: Back { sleep } in systems/fire.ts). He lies in the tent until dawn, while play
// goes quicker (playSpeed, used by main.ts), so the night is seen to pass; at dawn he gets up well rested, and his
// gathering yields more often until nightfall (SLEEP in data/sleep.ts). Sent elsewhere in the night, he gets up without
// the rest. Numbers in data/sleep.ts.
import { canSleep, type GameState } from '../core/state';
import type { EventBus } from '../core/events';
import { isNight } from '../core/clock';
import type { Layout } from '../world/layout';
import { goVisit } from '../actors/player';
import { SLEEP } from '../data/sleep';
import { restBonus } from '../core/building';

export { canSleep };

/** Whether he is well rested: a full night's sleep, until nightfall. */
export const isRested = (state: GameState) => state.time < state.restedUntil;

/** How much more often gathering yields while he is well rested: SLEEP.bonus more, or more in a better shelter (the
 *  lean-to, the log hut: restBonus in core/building.ts). */
export const restedFactor = (state: GameState) => isRested(state) ? 1 + restBonus(state) : 1;

/** How many times faster than real time play goes: SLEEP.speed while he sleeps, else 1 (main.ts; never in a catch-up). */
export const playSpeed = (state: GameState) => state.player.task.kind === 'sleep' ? SLEEP.speed : 1;

/** Off to bed (the sleep command, or after stoking the fire): to the shelter, where he lies down (updateSleep). Returns
 *  false when there is no way there. The caller checks there is a shelter and that it is night. */
export const goToBed = (state: GameState, layout: Layout) => goVisit(state, layout, 'shelter');

/** He lies down when he reaches the shelter at night (`visited`, actors/player), and gets up at dawn, well rested. */
export function updateSleep(state: GameState, layout: Layout, visited: string | null, events: EventBus): void {
  const p = state.player;
  if (visited === 'shelter' && canSleep(state, layout) && isNight(state.time)) {
    p.task = { kind: 'sleep' }; p.trip = null; p.cook = null;
    events.emit({ type: 'fellAsleep' });
    return;
  }
  if (p.task.kind === 'sleep' && !isNight(state.time)) {
    p.task = { kind: 'idle' };
    state.restedUntil = state.time + SLEEP.rested;
    events.emit({ type: 'awake' });
  }
}
