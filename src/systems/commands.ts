// The only way the UI changes the game: it queues commands, and the simulation applies them at the start of a step.
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout, Vec2 } from '../world/layout';
import { walkTo, goWork, goVisit } from '../actors/player';
import { RESOURCES } from '../data/skills';
import { levelOf } from './skills';

export type Command =
  | { type: 'walk'; to: Vec2 }
  | { type: 'work'; nodeId: string }
  /** a building (by id), or land that isn't the player's yet (parcel id, with where it was tapped) */
  | { type: 'visit'; id: string; at?: Vec2 };

export const isClaimed = (state: GameState, parcelId: string | undefined) => !parcelId || !!state.parcels[parcelId]?.claimed;

export function applyCommands(state: GameState, layout: Layout, queue: Command[], events: EventBus): void {
  for (const c of queue.splice(0)) {
    let ok = true;
    if (c.type === 'walk') ok = walkTo(state, layout, c.to);
    else if (c.type === 'visit') ok = goVisit(state, layout, c.id, c.at);
    else {
      const spot = layout.nodes.find(n => n.id === c.nodeId);
      const res = spot && RESOURCES[spot.resource];
      if (!spot || !res) continue;
      if (!isClaimed(state, spot.parcel)) { ok = goVisit(state, layout, spot.parcel!, spot.pos); }
      else if (levelOf(state, res.skill) < res.level) { events.emit({ type: 'levelTooLow', skill: res.skill, need: res.level, what: res.name }); continue; }
      else ok = goWork(state, layout, c.nodeId);
    }
    if (!ok) { events.emit({ type: 'noPath' }); continue; }
    // the player's command wins over a trip to the bank (the backpack keeps its items), unless it sends him to the
    // bank anyway. Sent to work with a full backpack, hauling starts a new trip at once.
    const toBank = c.type === 'visit' && layout.buildings.find(b => b.id === c.id)?.kind === 'bank';
    if (!toBank) state.player.trip = null;
  }
}
