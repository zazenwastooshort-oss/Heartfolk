// His job (the idle core, 12 Oct 2026; the jobs are rows in data/jobs.ts, what can be picked and the saved job in
// core/jobs.ts). Picked in the Jobs window (the job command), a job is his until the player stops it or picks another:
// - where there is somewhere to store things (the camp's chest, the village's bank) he first walks there to fetch his
//   tools and leave what he won't need (the backpack emptied, a few meals kept on him), then goes to the nearest place
//   for the job and works it, moving on and hauling a full backpack to the chest and back as when he is sent by a tap
//   (systems/gathering.ts, pickups.ts, hauling.ts, combat.ts, rats.ts, cooking.ts do the work); a job goes on past any
//   goal's "enough" (core/state.ts, goalHasEnough);
// - after anything that takes him away (stoking the fire, a meal, a night's sleep, being knocked out, a trip to the
//   chest) he goes back to it by himself: what took him away goes back to what he was doing (Back), and with nothing to
//   do he goes back to his job;
// - a tap in the world (or the goal card's) sends him there as ever and leaves the job set but paused: once that's done,
//   or he has nothing to do, he goes back to it;
// - picked while he is asleep, knocked out, stoking the fire or on his way to eat or to bed, it starts once that's done;
// - a job that can't go on (the training dummy has taught him all it can, a backpack full with nowhere to store it, no
//   way there) stops, saying why; cooking ends once every raw fish is cooked. With nothing to work just now (the bushes
//   bare, the trees felled, the rats down) he waits by them, as when sent by a tap.
// It runs every step, so catching up (away time) keeps at the job as playing does.
import type { GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout, Vec2 } from '../world/layout';
import { hasStore, jobBlock, type JobBlock } from '../core/jobs';
import { ratUp, ratsOf } from '../core/rats';
import { isNight } from '../core/clock';
import { jobDef, type JobDef } from '../data/jobs';
import { PICKUPS } from '../data/pickups';
import { isFood } from '../data/food';
import { KEEP_FOOD } from '../data/hauling';
import { goVisit, goWork } from '../actors/player';
import { backpackFull, deposit, isStore, stores } from './backpack';
import { workNearestFree } from './gathering';
import { gatherNext } from './pickups';
import { mayFight } from './combat';
import { setOffToFight } from './rats';
import { canCook, fishToCook, goCook } from './cooking';
import { isIdle } from './needs';

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/** The place to store things nearest him (a bank's door, the chest), or null where there is none. */
function nearestStore(state: GameState, layout: Layout): string | null {
  const at = state.player.pos;
  return stores(state, layout).reduce<{ id: string; d: number } | null>((b, x) => { const d = dist(x.pos, at); return !b || d < b.d ? { id: x.id, d } : b; }, null)?.id ?? null;
}

/** Whether what he is doing is already the job's work (or on his way to it), so picking it leaves him to it. */
function doingIt(state: GameState, layout: Layout, def: JobDef): boolean {
  const p = state.player, task = p.task, pending = p.pending, w = def.work;
  const node = task.kind === 'gather' ? task.nodeId : pending?.kind === 'node' ? pending.id : null;
  const pickup = task.kind === 'pickup' ? task.id : pending?.kind === 'pickup' ? pending.id : null;
  const fight = task.kind === 'fight' ? task.target : pending?.kind === 'fight' ? pending.id : null;
  if (w.kind === 'node') return !!node && layout.nodes.find(n => n.id === node)?.resource === w.resource;
  if (w.kind === 'gather') { const kind = layout.pickups?.find(x => x.id === pickup)?.kind; return !!kind && PICKUPS[kind].gather === w.group; }
  if (w.kind === 'dummy') return fight === 'dummy';
  if (w.kind === 'rats') return !!fight && ratsOf(layout).some(r => r.id === fight);
  return !!p.cook;
}

/** The rat to fight: the nearest that is up, else the nearest (he waits by its nest until one is back). */
function ratToFight(state: GameState, layout: Layout): string | null {
  const rats = ratsOf(layout).filter(r => state.rats[r.id]), up = rats.filter(r => ratUp(state, r.id)), at = state.player.pos;
  const from = up.length ? up : rats;
  return from.reduce<{ id: string; d: number } | null>((b, r) => { const d = dist(state.rats[r.id]!.pos, at); return !b || d < b.d ? { id: r.id, d } : b; }, null)?.id ?? null;
}

/** The job stops (it can't go on, or it is done), saying why. Returns false, for startJob. */
function stop(state: GameState, def: JobDef, events: EventBus, why: 'blocked' | 'full' | 'noPath' | 'done', block?: JobBlock): false {
  state.job = null;
  events.emit(block ? { type: 'jobStopped', job: def.id, why, block } : { type: 'jobStopped', job: def.id, why });
  return false;
}

/** Set off on his job: to the chest (or the bank) for his tools first while he still has to fetch them, else to the
 *  nearest place to do it. Returns whether he set off (or is at it already); false when the job stopped (stop). */
function startJob(state: GameState, layout: Layout, events: EventBus): boolean {
  const job = state.job!, def = jobDef(job.id)!, w = def.work;
  const block = jobBlock(state, layout, def);
  if (block) return stop(state, def, events, def.ends && block.kind === 'fish' ? 'done' : 'blocked', block);
  if (doingIt(state, layout, def)) { job.fetch = false; return true; }
  if (job.fetch) {
    const store = nearestStore(state, layout);
    if (store && goVisit(state, layout, store)) return true;
    job.fetch = false;
  }
  // a full backpack with nowhere to store it: he can't gather any more
  if ((w.kind === 'node' || w.kind === 'gather') && backpackFull(state) && !stores(state, layout).length) return stop(state, def, events, 'full');
  if (w.kind === 'node') {
    if (workNearestFree(state, layout, w.resource)) return true;
    // every one down: he waits at the nearest for it to grow back
    const at = state.player.pos, nearest = layout.nodes.filter(n => n.resource === w.resource && (!n.parcel || state.parcels[n.parcel]?.claimed))
      .sort((a, b) => dist(a.pos, at) - dist(b.pos, at));
    return nearest.some(n => goWork(state, layout, n.id)) || stop(state, def, events, 'noPath');
  }
  if (w.kind === 'gather') return gatherNext(state, layout, w.group) || stop(state, def, events, 'noPath');
  if (w.kind === 'dummy' || w.kind === 'rats') {
    const target = w.kind === 'dummy' ? 'dummy' : ratToFight(state, layout);
    if (!target || !mayFight(state, layout, target, events)) return stop(state, def, events, 'blocked', { kind: 'taught' });
    return setOffToFight(state, layout, target, events) || stop(state, def, events, 'noPath');
  }
  return (canCook(state, layout) && fishToCook(state, layout) && goCook(state, layout)) || stop(state, def, events, 'noPath');
}

/** The job command (systems/commands.ts): `id` becomes his job. Refused, saying why, when it can't be picked here and
 *  now (core/jobs.ts); the same job under way already, he says he's at it. Picked while he is asleep, knocked out,
 *  stoking the fire or on his way to eat or to bed, it starts once that's done (what that would have gone back to is
 *  dropped: he goes to the job). Returns true when he set off on it now (the command then stops anything else, as any
 *  command does), else null. */
export function pickJob(state: GameState, layout: Layout, id: string, events: EventBus): true | null {
  const def = jobDef(id);
  if (!def) return null;
  const block = jobBlock(state, layout, def);
  if (block) { events.emit({ type: 'jobRefused', job: def.id, block }); return null; }
  const p = state.player, n = state.needs, was = state.job;
  if (was?.id === def.id && !was.paused) { events.emit({ type: 'onIt' }); return null; }
  const later = !!p.stoke || !!n.meal || !!n.bed || p.task.kind === 'sleep' || p.task.kind === 'knockedOut';
  // (picked again while paused, it carries on where it was: his tools fetched or not)
  const fetch = was?.id === def.id ? was.fetch : hasStore(state, layout) && !doingIt(state, layout, def);
  state.job = { id: def.id, paused: false, fetch };
  events.emit({ type: 'jobSet', job: def.id, fetch, later });
  if (later) {
    if (p.stoke) p.stoke.back = null;
    if (n.meal) n.meal.back = null;
    if (n.bed) n.bed.back = null;
    return null;
  }
  p.trip = null;
  if (def.work.kind !== 'cook') p.cook = null;                  // any other job stops cooking (cooking: goCook sets it up)
  return startJob(state, layout, events) ? true : null;
}

/** The Stop button (ui/jobs.ts): no job any more. Working at it, he stops where he is (and what stoking the fire, a meal or
 *  bed would have gone back to is dropped); busy with something the player sent him to do, he carries on with that. */
export function stopJob(state: GameState, events: EventBus): void {
  const job = state.job;
  if (!job) return;
  state.job = null;
  const p = state.player, n = state.needs;
  if (!job.paused) {
    if (p.stoke) p.stoke.back = null;
    if (n.meal) n.meal.back = null;
    if (n.bed) n.bed.back = null;
    const away = !!p.stoke || !!n.meal || !!n.bed || p.task.kind === 'sleep' || p.task.kind === 'knockedOut';
    if (!away) { p.task = { kind: 'idle' }; p.path = []; p.pending = null; p.trip = null; p.cook = null; }
  }
  events.emit({ type: 'jobStopped', job: job.id, why: 'player' });
}

/** After a command from the player that sent him somewhere (systems/commands.ts): when it was (a meal waits for him to
 *  be idle then, and so does bed by himself tonight: systems/needs.ts), a meal or bed under way is off, and his job is
 *  paused until that's done. A job just picked (`picked`) is his own doing, not the player sending him anywhere. */
export function sent(state: GameState, picked: boolean): void {
  const n = state.needs;
  n.meal = null; n.bed = null;
  if (picked) return;
  n.sentAt = state.time;
  if (state.job) state.job.paused = true;
}

/** Whether he carries anything to leave at the chest: anything but food, or more food than he keeps on him. */
function spare(state: GameState): boolean {
  const pack = Object.entries(state.player.backpack);
  return pack.some(([id]) => !isFood(id)) || pack.reduce((a, [, n]) => a + n, 0) > KEEP_FOOD;
}

/** `visited`: the building or built thing he reached this step, unless stoking, cooking or a meal saw to it. Returns
 *  whether this saw to that visit (reaching the chest to fetch his tools), so hauling doesn't empty the backpack there
 *  again. */
export function updateJobs(state: GameState, layout: Layout, visited: string | null, events: EventBus): boolean {
  const job = state.job;
  if (!job) return false;
  // at the chest (or the bank): his tools fetched; setting out on the job, he leaves there what he won't need
  if (job.fetch && visited && isStore(state, layout, visited)) {
    job.fetch = false;
    if (state.player.trip || job.paused) return false;            // on another errand there: hauling sees to it
    if (spare(state)) deposit(state, events);
    startJob(state, layout, events);
    return true;
  }
  // nothing to do (what the player sent him to do is done; back from a meal, a night's sleep, being knocked out): back
  // to his job, unless the fire is still to be stoked tonight (systems/fire.ts takes him first)
  if (isIdle(state) && !(state.stokeAgain && isNight(state.time))) {
    const resumed = job.paused;
    job.paused = false;
    if (startJob(state, layout, events) && resumed) events.emit({ type: 'jobResumed', job: job.id });
  }
  return false;
}
