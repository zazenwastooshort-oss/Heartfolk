// The only way the UI changes the game: it queues commands, and the simulation applies them at the start of a step.
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout, Vec2 } from '../world/layout';
import { walkTo, goWork, goVisit, goPickup } from '../actors/player';
import { RESOURCES } from '../data/skills';
import { SWINGS } from '../data/animation';
import { levelOf } from './skills';
import { gatherOf, onGround, roomFor } from './pickups';
import { drop } from './backpack';

export type Command =
  | { type: 'walk'; to: Vec2 }
  | { type: 'work'; nodeId: string }
  /** a building (by id), or land that isn't the player's yet (parcel id, with where it was tapped) */
  | { type: 'visit'; id: string; at?: Vec2 }
  /** something lying on the ground (layout.pickups, by id): walk over and pick it up; a plank, stone or branch starts
   *  gathering more like it (systems/pickups) */
  | { type: 'pickup'; id: string }
  /** drop `count` of an item from the backpack (all of it when `count` is more than he carries) */
  | { type: 'drop'; item: string; count: number };

export const isClaimed = (state: GameState, parcelId: string | undefined) => !parcelId || !!state.parcels[parcelId]?.claimed;

export function applyCommands(state: GameState, layout: Layout, queue: Command[], events: EventBus): void {
  for (const c of queue.splice(0)) {
    // dropping something doesn't send him anywhere: whatever he is doing carries on, a trip to the bank included
    if (c.type === 'drop') { drop(state, c.item, c.count, events); continue; }
    let ok = true;
    if (c.type === 'walk') ok = walkTo(state, layout, c.to);
    else if (c.type === 'visit') ok = goVisit(state, layout, c.id, c.at);
    else if (c.type === 'pickup') {
      if (!onGround(state, layout, c.id)) continue;
      // no room for it: where there is a bank, gathering starts with a trip to empty the backpack (systems/hauling),
      // as working a tree does; otherwise he says so and stays put
      const toBankFirst = !!gatherOf(layout, c.id) && layout.buildings.some(b => b.kind === 'bank');
      if (!roomFor(state, layout, c.id) && !toBankFirst) { events.emit({ type: 'noRoom' }); continue; }
      ok = goPickup(state, layout, c.id);
    } else {
      const spot = layout.nodes.find(n => n.id === c.nodeId);
      const res = spot && RESOURCES[spot.resource];
      if (!spot || !res) continue;
      const tool = SWINGS[res.skill].tool;
      if (!isClaimed(state, spot.parcel)) { ok = goVisit(state, layout, spot.parcel!, spot.pos); }
      // without the tool for it he can't work it at all, so he doesn't set off
      else if (!state.tools[tool]) { events.emit({ type: 'needTool', tool, skill: res.skill }); continue; }
      else if (levelOf(state, res.skill) < res.level) { events.emit({ type: 'levelTooLow', skill: res.skill, need: res.level, what: res.name }); continue; }
      else ok = goWork(state, layout, c.nodeId);
    }
    if (!ok) { events.emit({ type: 'noPath' }); continue; }
    // the player's command wins over a trip to the bank (the backpack keeps its items), unless it sends him to the
    // bank anyway. Sent to work (or to gather) with a full backpack, hauling starts a new trip at once.
    const toBank = c.type === 'visit' && layout.buildings.find(b => b.id === c.id)?.kind === 'bank';
    if (!toBank) state.player.trip = null;
  }
}
