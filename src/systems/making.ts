// Making things (data/making.ts): sent to make something, he walks to where it is made (beside its site, or he stays
// where he stands), works there `time` seconds, and then what it needs is taken from his backpack (then the bank) and
// it is made: a structure stands at its site from then on (GameState.built; it is in the way, world/nav.ts), or he
// owns a new tool. Without everything it needs he doesn't set off, and is told what's missing (commands); if
// something went missing while he worked, he stops and is told the same.
import { made, owned, type GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout } from '../world/layout';
import { siteOf } from '../world/layout';
import { MAKES, type MakeDef } from '../data/making';
import { useUp } from './backpack';

/** What he still lacks to make `def`: item id to how many more (empty when he has it all, carried or banked). */
export function missingFor(state: GameState, def: MakeDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(def.needs)) { const have = owned(state, id); if (have < n) out[id] = n - have; }
  return out;
}

/** Whether `def` can be made in this layout: its site is here (or it is made anywhere), and a structure isn't built
 *  yet. */
export const canMake = (state: GameState, layout: Layout, def: MakeDef) =>
  (def.at === 'here' || siteOf(layout, def.at) !== null) && !(def.gives.kind === 'structure' && made(state, def.id));

export function updateMaking(state: GameState, layout: Layout, events: EventBus): void {
  const p = state.player, task = p.task;
  if (task.kind !== 'make' || state.time < task.doneAt) return;
  p.task = { kind: 'idle' };
  const def = MAKES[task.id];
  if (!canMake(state, layout, def)) return;
  const missing = missingFor(state, def);
  if (Object.keys(missing).length) { events.emit({ type: 'missing', make: def.id, items: missing }); return; }
  useUp(state, def.needs);
  if (def.gives.kind === 'structure') state.built.push(def.id);
  else state.tools[def.gives.tool] = true;
  events.emit({ type: 'made', make: def.id });
}
