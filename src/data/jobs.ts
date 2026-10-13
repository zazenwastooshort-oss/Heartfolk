// Jobs (the idle core, 12 Oct 2026; the owner: "you set a job, he initiates it, goes to the bank (the chest) and gets
// his tools, and then goes to the nearest indicated area or material"), as a table. Picked in the Jobs window
// (ui/jobs.ts), a job is his until it is stopped or another is picked: he fetches his tools at the chest (leaving what
// he won't need there), then works the nearest place for it, moving on and hauling a full backpack to the chest and
// back as when he is sent by a tap, and he goes back to it by himself after anything that takes him away (stoking the
// fire, a meal, a night's sleep, being knocked out). systems/jobs.ts runs it; core/jobs.ts says whether one can be
// picked here and now. A new job is one more row; later, levelling up may let him queue several (one after another:
// a job that `ends` hands over to the next).
import type { GatherId } from './pickups';
import { PICKUPS } from './pickups';
import { RESOURCES } from './skills';

export type JobId = 'birch' | 'oak' | 'copper' | 'tin' | 'iron' | 'fish' | 'berries' | 'stones' | 'branches' | 'practice' | 'rats' | 'cook';

/** What a job works: the nearest free resource node of a kind (a tree, a rock, a fishing spot), the nearest of a group
 *  of things picked up by hand (stones, branches, the berry bushes), the training dummy, the rats by their nest, or the
 *  campfire, to cook every raw fish he has. */
export type JobWork =
  | { kind: 'node'; resource: string }
  | { kind: 'gather'; group: GatherId }
  | { kind: 'dummy' }
  | { kind: 'rats' }
  | { kind: 'cook' };

/** name: what the Jobs list (ui/jobs.ts) and the notices call it. doing: what he is doing at it, for the middle of a
 *  sentence ("He stops chopping birch for now."). what: one plain line on what he does. picture: the item (or gear)
 *  drawn beside it (ui/pictures.ts). ends: the job is done once there is nothing left to do (cooking: every raw fish
 *  cooked); the others go on until stopped. */
export interface JobDef { id: JobId; name: string; doing: string; what: string; work: JobWork; picture: string; ends?: true }

export const JOBS: JobDef[] = [
  { id: 'birch', name: 'Chop birch', doing: 'chopping birch', what: 'Chops birch trees, and carries the logs home when his backpack is full.', work: { kind: 'node', resource: 'birch_tree' }, picture: 'birch_logs' },
  { id: 'oak', name: 'Chop oak', doing: 'chopping oak', what: 'Chops oak trees, and carries the logs home when his backpack is full.', work: { kind: 'node', resource: 'oak_tree' }, picture: 'oak_logs' },
  { id: 'copper', name: 'Mine copper', doing: 'mining copper', what: 'Mines the green-flecked rocks for copper ore.', work: { kind: 'node', resource: 'copper_rock' }, picture: 'copper_ore' },
  { id: 'tin', name: 'Mine tin', doing: 'mining tin', what: 'Mines tin rocks for tin ore.', work: { kind: 'node', resource: 'tin_rock' }, picture: 'tin_ore' },
  { id: 'iron', name: 'Mine iron', doing: 'mining iron', what: 'Mines iron rocks for iron ore.', work: { kind: 'node', resource: 'iron_rock' }, picture: 'iron_ore' },
  { id: 'fish', name: 'Fish', doing: 'fishing', what: 'Fishes where the water ripples, in the pool and along the river.', work: { kind: 'node', resource: 'fishing_spot' }, picture: 'raw_fish' },
  { id: 'berries', name: 'Pick berries', doing: 'picking berries', what: 'Picks the berry bushes, and waits beside them while they grow back.', work: { kind: 'gather', group: 'berries' }, picture: 'berries' },
  { id: 'stones', name: 'Gather stones', doing: 'gathering stones', what: 'Gathers stones round the clearing, and waits for more to turn up.', work: { kind: 'gather', group: 'stones' }, picture: 'stone' },
  { id: 'branches', name: 'Gather branches', doing: 'gathering branches', what: 'Gathers fallen branches, and waits for more to turn up.', work: { kind: 'gather', group: 'branches' }, picture: 'branch' },
  { id: 'practice', name: 'Practise at the dummy', doing: 'practising at the dummy', what: 'Swings at the training dummy, training each skill in turn.', work: { kind: 'dummy' }, picture: 'stone_club' },
  { id: 'rats', name: 'Fight rats', doing: 'fighting rats', what: 'Fights the rats by their nest down the river, eating when he gets hurt.', work: { kind: 'rats' }, picture: 'rat_hide' },
  { id: 'cook', name: 'Cook fish', doing: 'cooking fish', what: 'Cooks all his raw fish at the campfire. Then the job is done.', work: { kind: 'cook' }, picture: 'cooked_fish', ends: true },
];

export const JOB_IDS = JOBS.map(j => j.id);

/** A job by id, or undefined for one that isn't in the table (an old or damaged save's). */
export const jobDef = (id: string): JobDef | undefined => JOBS.find(j => j.id === id);

/** What a job brings in, for the goals' "enough" (core/state.ts, goalHasEnough): a node's item, or what a group of
 *  pickups gives; null for a job that brings in nothing of its own (practice, the rats, cooking). */
export function jobItem(def: JobDef): string | null {
  const w = def.work;
  if (w.kind === 'node') return RESOURCES[w.resource]?.item ?? null;
  if (w.kind === 'gather') {
    const kind = (Object.keys(PICKUPS) as (keyof typeof PICKUPS)[]).find(k => PICKUPS[k].gather === w.group);
    const gives = kind ? PICKUPS[kind].gives : 'book';
    return gives === 'book' ? null : gives.item;
  }
  return null;
}
