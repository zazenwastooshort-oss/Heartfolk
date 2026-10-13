// His tools and the storage chest (13 Oct 2026, the owner: "tools should be in the chest, because later there will be
// outfits that give skill bonuses"; what is saved in core/tools.ts). Once the chest stands his tools are kept in it and
// he carries only the one he is using:
// - sent to work a tree, rock or fishing spot whose tool is in the chest (a tap, the goal card, going back to work after
//   a trip, stoking, a meal or a night's sleep), he walks to the chest for it first (a trip { nodeId, tool }: hauling
//   empties his backpack there as on any trip), then on to the work; beside the chest already, he takes it at once;
// - at every stop at the chest (a trip, stoking, a meal, cooking, a tap on it) and at the shelter (to bed: the chest is
//   in it, by its door) he leaves there every tool but the one for what he does next (keepTools), so a tool newly made
//   is carried until his next stop there.
// The chest is in the shelter since the camp build: he uses it at the shelter's door (core/camp.ts). Before the chest,
// and in the village, he carries every tool he owns, as before. Weapons and armour stay worn.
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout } from '../world/layout';
import { carries, toolFor } from '../core/tools';
import { chestHere, shelterDoor } from '../core/camp';
import { goVisit, goWork } from '../actors/player';
import { DOOR } from '../data/building';
import { TOOL_IDS, type ToolId } from '../data/skills';

/** Whether he stands at the chest: at the shelter's door (within DOOR.near of it), the chest built in the shelter. */
export function besideChest(state: GameState, layout: Layout): boolean {
  const door = chestHere(state, layout) ? shelterDoor(state, layout) : null, p = state.player.pos;
  return !!door && Math.hypot(p.x - door.x, p.z - door.z) <= DOOR.near;
}

/** Whether working `nodeId` needs its tool fetched from the chest first: he owns it, and it is in the chest. */
export function fetchFirst(state: GameState, layout: Layout, nodeId: string): boolean {
  const tool = toolFor(layout, nodeId);
  return !!tool && !!state.tools[tool] && !carries(state, tool) && chestHere(state, layout);
}

/** At the chest: every tool he owns but `keep` goes into it, and `keep` (when he owns it) comes out. The first time
 *  any go in (none there before: a new chest, or an old save's), he says so (`events`). */
export function keepTools(state: GameState, layout: Layout, keep: ToolId | null, events?: EventBus): void {
  if (!chestHere(state, layout)) return;
  const first = state.toolsInChest.length === 0;
  state.toolsInChest = TOOL_IDS.filter(t => state.tools[t] && t !== keep);
  if (first && state.toolsInChest.length) events?.emit({ type: 'toolsKept' });
}

/** Off to work `nodeId` (as goWork), by way of the chest when its tool is kept there (a trip { nodeId, tool }), or,
 *  beside the chest already, taking it out at once. Returns false, with him as he was, when there is no way. */
export function goWorkWith(state: GameState, layout: Layout, nodeId: string, events: EventBus): boolean {
  if (fetchFirst(state, layout, nodeId)) {
    const tool = toolFor(layout, nodeId)!;
    if (besideChest(state, layout)) keepTools(state, layout, tool);
    else {
      if (!goVisit(state, layout, 'chest')) return false;
      state.player.trip = { nodeId, tool: true };
      events.emit({ type: 'fetchTool', tool });
      return true;
    }
  }
  return goWork(state, layout, nodeId);
}

/** The tool for what he does next: the node he works or is on his way to (or back to, after a trip, stoking the fire,
 *  a meal or a night's sleep). Null for anything else. */
function wanted(state: GameState, layout: Layout): ToolId | null {
  const p = state.player, n = state.needs;
  const node = p.task.kind === 'gather' ? p.task.nodeId : p.pending?.kind === 'node' ? p.pending.id
    : p.trip && 'nodeId' in p.trip ? p.trip.nodeId : null;
  if (node) return toolFor(layout, node);
  for (const back of [p.stoke?.back, n.meal?.back, n.bed?.back]) if (back && 'nodeId' in back) return toolFor(layout, back.nodeId);
  return null;
}

/** `visited`: the building or built thing he reached this step (sim.ts, after everything else has seen to it). At the
 *  chest, or at the shelter it is in (to bed), he leaves there every tool but the one for what he does next. */
export function updateTools(state: GameState, layout: Layout, visited: string | null, events?: EventBus): void {
  if ((visited === 'chest' || visited === 'shelter') && layout.camp) keepTools(state, layout, wanted(state, layout), events);
}
