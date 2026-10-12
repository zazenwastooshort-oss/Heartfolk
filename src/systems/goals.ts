// The camp's goals (data/goals.ts) remember they are finished (since 0.0.15): a gathering goal once its needs are all
// there, a making goal once its thing is made (goalFinished in core/state). Each is written into GameState.goalsDone
// the step it finishes, so using things up later (planks for the fire) never sends the goal card back.
import { goalFinished, type GameState } from '../core/state';
import type { EventBus } from '../core/events';
import { GOALS } from '../data/goals';

export function updateGoals(state: GameState, events: EventBus): void {
  for (const goal of GOALS) {
    if (state.goalsDone.includes(goal.id) || !goalFinished(state, goal)) continue;
    state.goalsDone.push(goal.id);
    events.emit({ type: 'goalDone', goal: goal.id });
  }
}
