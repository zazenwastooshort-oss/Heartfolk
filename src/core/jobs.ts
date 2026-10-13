// His job (the idle core, 12 Oct 2026; data/jobs.ts) as saved, and whether a job can be picked here and now: there is
// somewhere to do it in this layout, and he has what it needs (the tool and level for a tree, rock or fishing spot, the
// training dummy built and a weapon, the campfire and raw fish to cook). The Jobs window (ui/jobs.ts) and the job
// command (systems/jobs.ts) both ask here, so the window's "Needs a stone axe" and the refusal always agree.
import type { GameState } from './state';
import type { Layout } from '../world/layout';
import { siteOf } from '../world/layout';
import { jobDef, type JobDef, type JobId } from '../data/jobs';
import { RESOURCES, type SkillId, type ToolId } from '../data/skills';
import { SWINGS } from '../data/animation';
import { PICKUPS } from '../data/pickups';
import { DUMMY, STYLES } from '../data/combat';
import { COOK } from '../data/cooking';
import { levelFor } from '../data/xp';
import type { MakeId } from '../data/making';

/** His job: which (data/jobs.ts), whether it is paused (the player sent him to do something else meanwhile: he goes
 *  back to it once that is done, or he has nothing to do), and whether he is still to fetch his tools at the chest (or
 *  the bank) before he starts: he empties his backpack there, keeping a few meals. */
export interface Job { id: JobId; paused: boolean; fetch: boolean }

/** Why a job can't be picked now: there is nowhere here to do it ('none': not listed in ui/jobs.ts), he lacks the tool
 *  for it, or the level, something is still to be built ('build': the training dummy, the campfire), he has no weapon,
 *  the training dummy has taught him all it can, or there is no raw fish to cook. */
export type JobBlock = { kind: 'none' } | { kind: 'tool'; tool: ToolId } | { kind: 'level'; skill: SkillId; level: number }
  | { kind: 'build'; make: MakeId } | { kind: 'weapon' } | { kind: 'taught' } | { kind: 'fish' };

const claimed = (state: GameState, parcel: string | undefined) => !parcel || !!state.parcels[parcel]?.claimed;

/** Whether there is somewhere in this layout to do the job: a node of its kind on his land, things of its group to pick
 *  up, the training dummy's spot, a rats' nest, or the camp's fire spot. */
export function jobHere(state: GameState, layout: Layout, def: JobDef): boolean {
  const w = def.work;
  if (w.kind === 'node') return layout.nodes.some(n => n.resource === w.resource && claimed(state, n.parcel));
  if (w.kind === 'gather') return (layout.pickups ?? []).some(p => PICKUPS[p.kind].gather === w.group);
  if (w.kind === 'dummy') return !!siteOf(layout, 'dummy');
  if (w.kind === 'rats') return (layout.nests ?? []).length > 0;
  return !!siteOf(layout, 'hearth');
}

/** Whether there is somewhere to store things: a bank (the village), or the camp's storage chest once it stands. */
export const hasStore = (state: GameState, layout: Layout) =>
  layout.buildings.some(b => b.kind === 'bank') || (!!siteOf(layout, 'chest') && state.built.includes('chest'));

/** Why `def` can't be picked now (JobBlock), or null when it can. */
export function jobBlock(state: GameState, layout: Layout, def: JobDef): JobBlock | null {
  if (!jobHere(state, layout, def)) return { kind: 'none' };
  const w = def.work;
  if (w.kind === 'node') {
    const res = RESOURCES[w.resource]!, tool = SWINGS[res.skill].tool;
    if (!state.tools[tool]) return { kind: 'tool', tool };
    if (levelFor(state.skills[res.skill] ?? 0) < res.level) return { kind: 'level', skill: res.skill, level: res.level };
    return null;
  }
  if (w.kind === 'dummy') {
    if (!state.built.includes('dummy')) return { kind: 'build', make: 'dummy' };
    if (!state.equipment.weapon) return { kind: 'weapon' };
    // he trains each style in turn by himself (systems/combat.ts): only once it has taught him all three is it done
    return STYLES.every(s => levelFor(state.skills[s] ?? 0) >= DUMMY.maxLevel) ? { kind: 'taught' } : null;
  }
  if (w.kind === 'rats') return state.equipment.weapon ? null : { kind: 'weapon' };
  if (w.kind === 'cook') {
    if (!state.built.includes('campfire')) return { kind: 'build', make: 'campfire' };
    const chest = !!siteOf(layout, 'chest') && state.built.includes('chest') ? state.bank[COOK.raw] ?? 0 : 0;
    return (state.player.backpack[COOK.raw] ?? 0) + chest > 0 ? null : { kind: 'fish' };
  }
  return null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** His job as saved (readSave): one the table still has, with somewhere to do it here; paused only when it says so;
 *  still to fetch his tools only where there is somewhere to store things. Anything else (none saved, from before
 *  jobs, or damaged) is no job. Whether he can still do it is seen to as he goes back to it (systems/jobs.ts). */
export function savedJob(v: unknown, state: GameState, layout: Layout): Job | null {
  if (!isRecord(v) || typeof v.id !== 'string') return null;
  const def = jobDef(v.id);
  if (!def || !jobHere(state, layout, def)) return null;
  return { id: def.id, paused: v.paused === true, fetch: v.fetch === true && hasStore(state, layout) };
}
