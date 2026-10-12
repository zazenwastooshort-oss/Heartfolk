// One simulation step: the order systems run in. Headless: no drawing, no DOM, so tests can run days of play.
import type { GameState } from './core/state';
import type { EventBus } from './core/events';
import type { Rng } from './core/rng';
import type { Layout } from './world/layout';
import { updatePlayer } from './actors/player';
import { updateGathering } from './systems/gathering';
import { updateHauling } from './systems/hauling';
import { updatePickups } from './systems/pickups';
import { updateMaking } from './systems/making';
import { updateGoals } from './systems/goals';

export interface SimContext { layout: Layout; rng: Rng; events: EventBus }

export function step(state: GameState, dt: number, ctx: SimContext): void {
  state.time += dt;
  const visited = updatePlayer(state, ctx.layout, dt, ctx.events);
  updateGathering(state, ctx.layout, dt, ctx.rng, ctx.events);
  updatePickups(state, ctx.layout, ctx.events);
  // the camp's goals are written down as they finish, before making uses anything up
  if (ctx.layout.camp) updateGoals(state, ctx.events);
  updateMaking(state, ctx.layout, ctx.events);
  // after gathering, so the item that fills the backpack sends him to the bank in the same step
  updateHauling(state, ctx.layout, visited, ctx.events);
}
