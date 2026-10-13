// His tools and the storage chest (13 Oct 2026, the owner: "tools should be in the chest, because later there will be
// outfits that give skill bonuses"): once the chest stands his tools (the axe, the pickaxe, the rod) are kept in it,
// and he carries only the one he is using; before the chest (and in the village) he carries every tool he owns.
// GameState.tools says which he owns, GameState.toolsInChest which of those are in the chest. systems/tools.ts fetches
// and puts them back; the view draws only what he carries. Headless.
import type { GameState } from './state';
import type { Layout } from '../world/layout';
import { siteOf } from '../world/layout';
import { RESOURCES, TOOL_IDS, type ToolId } from '../data/skills';
import { SWINGS } from '../data/animation';

/** Whether the storage chest stands here, where his tools are kept (the camp's, once built). */
export const chestStands = (state: GameState, layout: Layout) => !!siteOf(layout, 'chest') && state.built.includes('chest');

/** Whether he carries `tool`: he owns it, and it isn't in the chest. */
export const carries = (state: GameState, tool: ToolId) => !!state.tools[tool] && !state.toolsInChest.includes(tool);

/** The tool working node `nodeId` needs, or null for no such node. */
export function toolFor(layout: Layout, nodeId: string): ToolId | null {
  const spot = layout.nodes.find(n => n.id === nodeId), res = spot && RESOURCES[spot.resource];
  return res ? SWINGS[res.skill].tool : null;
}

/** The tools in the chest as saved: tools he owns, each once, and only where the chest stands; anything else (none
 *  saved, from before the chest kept them) is none, so an old save's tools are all carried. */
export function savedToolsInChest(v: unknown, state: GameState, layout: Layout): ToolId[] {
  if (!Array.isArray(v) || !chestStands(state, layout)) return [];
  return TOOL_IDS.filter(t => v.includes(t) && state.tools[t]);
}
