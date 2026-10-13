// Building in stages (data/building.ts; the owner, 12 Oct 2026): from the Build window he sets out to build something:
// what it needs is taken from his backpack, then the chest, and he works beside it, a knock of his mallet every few
// seconds, each worth Carpentry XP, while it goes up in stages (footings, frame, half built) until it stands. The
// camp's upgrades go up at their spots, each in place of the step before it (the wall tent and the log cabin at the
// tent's, the stone hearth at the fire's, the woodshed at the firewood pile's). No Carpentry level is ever needed (the
// owner, 13 Oct 2026: "carpentry is now just another skill"). Sent elsewhere, at nightfall to stoke the fire, or to
// bed, the work done stays: a tap on the half-built thing (or Carry on in the Build window) sends him back, and after
// stoking he goes back by himself. Also bark: peeled now and then from the birch logs he chops, once the storage chest
// stands and while something he can build still needs more of it than he has (like gathering stopping once a goal has
// enough).
import { owned, type GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout } from '../world/layout';
import { buildRows, lacking, stageAt, stagedDef, unlocked } from '../core/building';
import { goBuild } from '../actors/player';
import { MAKES, makeDef, type MakeId } from '../data/making';
import { BARK, CARPENTRY } from '../data/building';
import { addXp } from './skills';
import { addToBackpack, backpackFull, useUp } from './backpack';

/** The build command (systems/commands.ts): begin `id` or carry on with it. Returns whether he set off, or null when
 *  he doesn't (he was told why, or there is nothing to do). */
export function startBuild(state: GameState, layout: Layout, c: { id: MakeId }, events: EventBus): boolean | null {
  const def = makeDef(c.id), task = state.player.task;
  if (!def || !stagedDef(c.id) || state.built.includes(def.id)) return null;
  // begun: back to it, wherever he is (unless he is at it already)
  if (state.underway[def.id] !== undefined) return task.kind === 'raise' && task.id === def.id ? null : goBuild(state, layout, def.id);
  if (!unlocked(state, layout, def.id)) { events.emit({ type: 'cantBuild', make: def.id, reason: 'locked' }); return null; }
  const missing = lacking(state, def);
  if (Object.keys(missing).length) { events.emit({ type: 'missing', make: def.id, items: missing }); return null; }
  useUp(state, def.needs);
  state.underway[def.id] = 0;
  events.emit({ type: 'begun', make: def.id });
  return goBuild(state, layout, def.id);
}

/** Back to building `id` after stoking the fire (systems/hauling.ts backToWork), if it is still to finish. */
export function backToBuilding(state: GameState, layout: Layout, id: MakeId, events: EventBus): void {
  if (state.underway[id] !== undefined && !state.built.includes(id) && !goBuild(state, layout, id)) events.emit({ type: 'noPath' });
}

/** At work beside something built in stages: the seconds worked add up, each knock of his mallet is Carpentry XP, a
 *  stage going up is told, and once it has had its time it stands (GameState.built). */
export function updateBuilding(state: GameState, layout: Layout, dt: number, events: EventBus): void {
  const p = state.player, task = p.task;
  if (task.kind !== 'raise') return;
  const before = state.underway[task.id];
  if (before === undefined || state.built.includes(task.id) || !stagedDef(task.id)) { p.task = { kind: 'idle' }; return; }
  const def = MAKES[task.id], worked = Math.min(def.time, before + dt);
  state.underway[task.id] = worked;
  const all = Math.floor(def.time / CARPENTRY.knock), knocks = (t: number) => Math.min(all, Math.floor(t / CARPENTRY.knock + 1e-9));
  for (let k = knocks(before); k < knocks(worked); k++) addXp(state, 'carpentry', CARPENTRY.xp, events);
  if (worked >= def.time) {
    delete state.underway[task.id];
    state.built.push(task.id);
    p.task = { kind: 'idle' };
    events.emit({ type: 'made', make: task.id });
    return;
  }
  const stage = stageAt(task.id, worked);
  if (stage > stageAt(task.id, before)) events.emit({ type: 'buildStage', make: task.id, stage });
}

/** A chance, the same every time for the same moment and the same woodcutting XP, so bark needs no draw from the
 *  game's random numbers (what else happens stays as it was). */
function chanceNow(state: GameState): number {
  const h = Math.sin(state.time * 12.9898 + state.skills.woodcutting * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

/** Whether bark is worth peeling: at a camp set up (BARK.after), while something he can build and hasn't begun needs
 *  more bark than he has, carried or stored (SOURCES says so in the Build list). */
export function wantsBark(state: GameState, layout: Layout): boolean {
  if (!layout.camp || !state.built.includes(BARK.after)) return false;
  const need = Math.max(0, ...buildRows(state, layout).filter(r => !r.begun).map(r => r.def.needs[BARK.item] ?? 0));
  return owned(state, BARK.item) < need;
}

/** A log from `resource` just went into his backpack (systems/gathering.ts): from a birch, while bark is worth peeling
 *  (wantsBark), now and then he peels a strip of it too, if there is room for it. */
export function peelBark(state: GameState, layout: Layout, resource: string, events: EventBus): void {
  if (resource !== BARK.tree || backpackFull(state) || !wantsBark(state, layout)) return;
  if (chanceNow(state) >= BARK.chance || !addToBackpack(state, BARK.item)) return;
  events.emit({ type: 'itemGained', item: BARK.item, count: 1 });
  events.emit({ type: 'barkPeeled' });
}
