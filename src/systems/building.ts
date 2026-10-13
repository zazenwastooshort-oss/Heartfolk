// Building in stages (data/building.ts; the owner, 12 and 13 Oct 2026: "as you build you see it progress into that
// structure, this is the carpentry skill and that should also take time"): everything built at the camp's spots, the
// campfire, the firewood pile, the tent, the storage chest and the training dummy as their goals come up (the goal
// card's button, a tap on the marker, the Build window), and the camp's upgrades (the wall tent and the log cabin at the
// tent's spot, the stone hearth at the fire's, the woodshed at the firewood pile's). He sets out to build it: what it
// needs is taken from his backpack, then the chest, there and then, and he works beside it, a knock of his mallet every
// few seconds, each worth Carpentry XP, while it goes up in stages (footings, frame, half built) until it stands; a
// little quicker at higher Carpentry levels, for the same XP (D5). No Carpentry level is ever needed (the owner, 13 Oct
// 2026: "carpentry is now just another skill"). Once begun he is committed (the owner: "player is committed to building
// it"): one thing at a time (D8), nothing is ever given back, and the work done stays when he is sent elsewhere. At
// nightfall to stoke the fire, for a meal, or to bed, he goes back to it after by himself (Back { raise }); after
// anything else, once that ends by itself and nothing else has him, he goes back too (resumeBuild: at once, or a moment
// after a walk he was sent on; D9). Also bark: peeled now and then from the birch logs he chops, once the storage chest
// stands and while something he can build still needs more of it than he has (like gathering stopping once a goal has
// enough).
import { goalFirst, owned, type GameState } from '../core/state';
import type { EventBus } from '../core/events';
import type { Layout } from '../world/layout';
import { begunIds, buildRows, buildSpeed, hasPlaceFor, lacking, stageAt, stagedDef, unlocked } from '../core/building';
import { goBuild } from '../actors/player';
import { MAKES, makeDef, type MakeId } from '../data/making';
import { BARK, CARPENTRY, LINES, RESUME } from '../data/building';
import { WOODPILE } from '../data/fire';
import { addXp } from './skills';
import { addToBackpack, backpackFull, useUp } from './backpack';

/** Off to build `id` (begun), or back to it: on success the way is found again; with no way there he looks again a
 *  while later (RESUME.retry), saying so once (GameState.lostWay; `told`: the caller says so itself, the build
 *  command). Returns whether he set off. */
function goBack(state: GameState, layout: Layout, id: MakeId, events: EventBus, told = false): boolean {
  if (goBuild(state, layout, id)) { state.lostWay = false; return true; }
  state.resumeAt = state.time + RESUME.retry;
  if (!state.lostWay && !told) events.emit({ type: 'noPath' });
  state.lostWay = true;
  return false;
}

/** Whether `id` stands in something built at a spot (StagedDef.inside: the storage chest, in the shelter) and nothing
 *  stands there yet. */
const noShelter = (state: GameState, id: MakeId) => { const inside = stagedDef(id)?.inside; return !!inside && !LINES[inside].some(s => state.built.includes(s)); };

/** The build command (systems/commands.ts): begin `id` or carry on with it. Returns whether he set off, or null when
 *  he doesn't (he was told why, or there is nothing to do: built already, or nothing of it here, the village). In
 *  order: knocked out, he can't; begun already, he goes back to it (unless he is at it); something else under way, he
 *  finishes that first (D8); a goal before the one that makes it still to finish, it waits (the campfire waits for the
 *  wreck); not to be built yet (the step before it, or the storage chest, doesn't stand; for the chest, no shelter);
 *  without everything it needs (what the current goal counts left alone, except for its own thing), he says what's
 *  missing. Otherwise what it needs is taken now, it is begun (its footings out), and he walks to it. */
export function startBuild(state: GameState, layout: Layout, c: { id: MakeId }, events: EventBus): boolean | null {
  const def = makeDef(c.id), task = state.player.task;
  if (!def || !stagedDef(c.id) || state.built.includes(def.id) || !hasPlaceFor(layout, def.id)) return null;
  if (task.kind === 'knockedOut') { events.emit({ type: 'cantBuild', make: def.id, reason: 'down' }); return null; }
  // begun: back to it, wherever he is (unless he is at it already); with no way there the command says so
  if (state.underway[def.id] !== undefined) return task.kind === 'raise' && task.id === def.id ? null : goBack(state, layout, def.id, events, true);
  const other = begunIds(state)[0];
  if (other) { events.emit({ type: 'cantBuild', make: def.id, reason: 'busy', other }); return null; }
  const first = goalFirst(state, def.id);
  if (first) { events.emit({ type: 'goalFirst', make: def.id, goal: first.id }); return null; }
  if (!unlocked(state, layout, def.id)) { events.emit({ type: 'cantBuild', make: def.id, reason: noShelter(state, def.id) ? 'noShelter' : 'locked' }); return null; }
  const missing = lacking(state, def);
  if (Object.keys(missing).length) { events.emit({ type: 'missing', make: def.id, items: missing }); return null; }
  useUp(state, def.needs);
  state.underway[def.id] = 0;
  state.resumeAt = 0;
  events.emit({ type: 'begun', make: def.id });
  return goBack(state, layout, def.id, events, true);
}

/** Back to building `id` after stoking the fire, a meal or bed (systems/hauling.ts backToWork), if it is still to
 *  finish. */
export function backToBuilding(state: GameState, layout: Layout, id: MakeId, events: EventBus): void {
  if (state.underway[id] !== undefined && !state.built.includes(id)) goBack(state, layout, id, events);
}

/** Whether nothing has him: standing about, going nowhere, on no trip, not stoking or cooking, no meal or bed under
 *  way, not off to stoke the fire again tonight (asleep and knocked out aren't standing about). */
function free(state: GameState): boolean {
  const p = state.player, n = state.needs;
  return p.task.kind === 'idle' && !p.pending && !p.path.length && !p.trip && !p.stoke && !p.cook && !n.meal && !n.bed && !state.stokeAgain;
}

/** Going back by himself (D9; the camp build, 13 Oct 2026: "once begun, the player is committed ... sent elsewhere, he
 *  comes back to it after"): at a camp, with something under way and nothing else having him (free), from
 *  GameState.resumeAt on (a walk he was sent on ends a moment before: RESUME.wait, actors/player.ts), he walks back to
 *  it. With no way there he looks again a while later (RESUME.retry), saying so once. Run at the end of each step. */
export function resumeBuild(state: GameState, layout: Layout, events: EventBus): void {
  if (!layout.camp || state.time < state.resumeAt) return;
  const id = begunIds(state)[0];
  if (!id || !free(state)) return;
  goBack(state, layout, id, events);
}

/** At work beside something built in stages: the work done adds up (quicker at higher Carpentry levels: buildSpeed),
 *  each knock of his mallet is Carpentry XP, a stage going up is told, and once it has had all its work it stands
 *  (GameState.built); the firewood pile's logs are stacked in it then (GameState.woodpile). */
export function updateBuilding(state: GameState, layout: Layout, dt: number, events: EventBus): void {
  const p = state.player, task = p.task;
  if (task.kind !== 'raise') return;
  const before = state.underway[task.id];
  if (before === undefined || state.built.includes(task.id) || !stagedDef(task.id)) { p.task = { kind: 'idle' }; return; }
  const def = MAKES[task.id], worked = Math.min(def.time, before + dt * buildSpeed(state));
  state.underway[task.id] = worked;
  const all = Math.floor(def.time / CARPENTRY.knock), knocks = (t: number) => Math.min(all, Math.floor(t / CARPENTRY.knock + 1e-9));
  for (let k = knocks(before); k < knocks(worked); k++) addXp(state, 'carpentry', CARPENTRY.xp, events);
  if (worked >= def.time) {
    delete state.underway[task.id];
    state.built.push(task.id);
    // the firewood pile: the logs it was begun with are stacked in it now, for stoking the fire
    if (def.pile) state.woodpile = Math.min(WOODPILE.max, state.woodpile + (def.needs[def.pile] ?? 0));
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
