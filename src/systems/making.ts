// Making things where he stands (data/making.ts: the stone tools, the rod, the club and the hide armour): sent to make
// something, he stays where he stands, works there `time` seconds, and then what it needs is taken from his backpack
// (then the bank) and it is made: he owns a new tool, or (0.0.22) he wears new gear (the stone club). Without everything
// it needs he doesn't set off, and is told what's missing (commands); if something went missing while he worked, he
// stops and is told the same. Since the camp build (13 Oct 2026) nothing built at the camp's spots is made here: the
// campfire, the firewood pile, the tent, the storage chest and the training dummy go up in stages like the camp's
// upgrades (systems/building.ts), and the make command for one begins it there (systems/commands.ts).
import { made, owned, type GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout } from '../world/layout';
import { MAKES, type MakeDef } from '../data/making';
import { useUp } from './backpack';
import { wear } from './combat';

/** What he still lacks to make `def`: item id to how many more (empty when he has it all, carried or banked). */
export function missingFor(state: GameState, def: MakeDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(def.needs)) { const have = owned(state, id); if (have < n) out[id] = n - have; }
  return out;
}

/** Whether `def` is made here (where he stands: everything else is built in stages, systems/building.ts) and isn't
 *  made yet: a tool he doesn't own (the village's axe, or one an old camp save kept), gear he doesn't wear. */
export const canMake = (state: GameState, def: MakeDef) => def.at === 'here' && !made(state, def.id);

export function updateMaking(state: GameState, layout: Layout, events: EventBus): void {
  const p = state.player, task = p.task;
  if (task.kind !== 'make' || state.time < task.doneAt) return;
  p.task = { kind: 'idle' };
  const def = MAKES[task.id];
  if (!canMake(state, def)) return;
  const missing = missingFor(state, def);
  if (Object.keys(missing).length) { events.emit({ type: 'missing', make: def.id, items: missing }); return; }
  useUp(state, def.needs);
  if (def.gives.kind === 'gear') wear(state, def.gives.gear);              // gear (0.0.22): he puts it on
  else if (def.gives.kind === 'tool') state.tools[def.gives.tool] = true;
  events.emit({ type: 'made', make: def.id });
}
