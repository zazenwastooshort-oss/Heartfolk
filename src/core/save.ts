// Saving: versioned JSON with a migration for every format change, so an update never wipes a village.
import { SAVE_VERSION, canSleep, createState, made, maxHealth, owned, type Back, type Cook, type GameState, type Pending, type Stoke, type Task } from './state';
import { siteOf, type Layout, type Vec2 } from '../world/layout';
import { ITEMS, SKILLS, TOOL_IDS, type SkillId, type ToolId } from '../data/skills';
import { PICKUPS } from '../data/pickups';
import { BOOK, GOALS } from '../data/goals';
import { MAKES, makeDef, type MakeId } from '../data/making';
import { LOAD, RESUME } from '../data/building';
import { STOKE, WOODPILE } from '../data/fire';
import { SLOTS, STYLES, gearDef, type CombatStyle, type GearId, type Slot } from '../data/combat';
import { targetOf } from './targets';
import { savedRats } from './rats';
import { savedGoblins } from './goblins';
import { KNOCKED_OUT } from '../data/rats';
import { CHIEF } from '../data/goblins';
import { savedThoughts } from './thoughts';
import { lineOf, savedBuilding, walkGrid } from './building';
import type { NavGrid } from '../world/nav';
import { restedTill, savedNeeds } from './needs';
import { savedToolsInChest } from './tools';
import { AT_SPOT, atSpot, buildSpot, canCook, chestHere, spotEnds, useSpot } from './camp';

export interface Storage { get(key: string): string | null; set(key: string, value: string): void }

// The camp game (12 Oct 2026) keeps its save under its own name, apart from the village build's 'hearthfolk_save'.
export const SAVE_KEY = 'hearthfolk_camp';

/** migrations[n] turns a version-n save into version n+1 */
const migrations: Record<number, (s: any) => any> = {
  // 0.0.4: the village replaced the clearing. `pendingNode` became `pending` (a node or a place to visit),
  // and land parcels were added. Rocks that no longer exist are dropped when loading.
  1: (s) => {
    const { pendingNode, ...player } = s.player ?? {};
    return { ...s, player: { ...player, pending: pendingNode ? { kind: 'node', id: pendingNode } : null }, parcels: {} };
  },
  // 0.0.6: woodcutting. The 'mine' task became 'gather', for rocks and trees alike.
  2: (s) => {
    const task = s.player?.task;
    return task?.kind === 'mine' ? { ...s, player: { ...s.player, task: { ...task, kind: 'gather' } } } : s;
  },
  // 0.0.9: the backpack. Gathering fills it and he carries it to the bank; what was gathered before stays banked.
  3: (s) => ({ ...s, player: { ...s.player, backpack: {}, trip: null } }),
  // 0.0.12: owned tools, the book and pickups. Older saves had the axe and the pick all along, so they keep both;
  // nothing has been picked up yet.
  4: (s) => ({ ...s, tools: { axe: true, pick: true }, hasBook: false, taken: {} }),
  // 0.0.15: goals remember they are finished, and things get built. Nothing was built before. A save that already
  // had everything a gathering goal asks for (salvaging the wreck) counts it finished, so using planks for the fire
  // can't send the card back to it.
  5: (s) => {
    const have = (id: string) => id === BOOK ? (s.hasBook === true ? 1 : 0) : (savedItems(s.player?.backpack)[id] ?? 0) + (savedItems(s.bank)[id] ?? 0);
    // (a goal that asks for levels, 0.0.22, didn't exist then: it isn't counted)
    const met = GOALS.filter(g => !g.makes && !g.levels && Object.entries(g.needs).every(([id, n]) => have(id) >= n));
    return { ...s, built: [], goalsDone: met.map(g => g.id) };
  },
  // 0.0.19: the storage chest, and stoking the fire at night. No chest stood before, so no night has been seen to
  // and the fire burns as it always did; he isn't off stoking it.
  6: (s) => ({ ...s, stokedNight: -1, fireLow: false, player: { ...s.player, stoke: null } }),
  // 0.0.20: away time. A save says when it was written (savedAt); an older one doesn't, so its first load has no away
  // time. The next save says.
  7: (s) => ({ ...s, savedAt: null }),
  // 0.0.21: the firewood pile. Firewood was a gathering goal before (10 logs, then used for the shelter); a save that
  // finished it gets the pile, built and empty, to stack logs on. Stoking under way took its logs from the chest.
  8: (s) => {
    const built = Array.isArray(s.built) ? s.built : [];
    const done = Array.isArray(s.goalsDone) && s.goalsDone.includes('firewood');
    const stoke = s.player?.stoke;
    return {
      ...s, woodpile: 0, stokeAgain: false,
      built: done && !built.includes('woodpile') ? [...built, 'woodpile'] : built,
      player: { ...s.player, stoke: stoke && typeof stoke === 'object' ? { ...stoke, from: 'chest' } : null },
    };
  },
  // 0.0.22: chapter 2. The combat and food skills start from 0 XP (as a new game has them, filled in below), and his
  // health is full.
  9: (s) => ({ ...s, health: null }),
  // 0.0.25: "Ready for the goblins" (levels) came in before the goblin camp; a save that already cleared the camp
  // has it done, so the card never goes back to it
  10: (s) => {
    const done: unknown[] = Array.isArray(s.goalsDone) ? s.goalsDone : [];
    return done.includes('goblins') && !done.includes('ready') ? { ...s, goalsDone: [...done, 'ready'] } : s;
  },
  // the camp build (13 Oct 2026): the lean-to and the log hut became the wall tent and the log cabin, the log bench and
  // the workbench and placing them went (campBuildSave)
  11: (s) => campBuildSave(s),
};

// ---- the camp build's save (format 11 to 12) ----

/** Ids the camp build renamed: the lean-to is the wall tent now, the log hut the log cabin (a built log hut stood in
 *  place of a lean-to, so it gives the wall tent as well). */
const RENAMED: Record<string, MakeId> = { lean_to: 'wall_tent', log_hut: 'log_cabin' };
/** Ids it removed (the owner, 13 Oct 2026: "remove the bench and workbench, these can be added later if needed"), each
 *  with what it took, given back to the chest whether it was built or begun. */
const REMOVED: Record<string, Record<string, number>> = { log_bench: { birch_logs: 4, branch: 2 }, workbench: { birch_logs: 6, fibre: 4 } };
/** How long the renamed ones took to build: one begun keeps the same share of the new one's time (D12; the new one's
 *  materials differ, and nothing more is asked for). */
const OLD_TIME: Record<string, number> = { lean_to: 90, log_hut: 180 };

/** An id as the camp build has it: renamed, null for one it removed, anything else as it was. */
const campId = (id: unknown): unknown => typeof id !== 'string' ? id : Object.hasOwn(RENAMED, id) ? RENAMED[id] : Object.hasOwn(REMOVED, id) ? null : id;

/** What he goes back to (after stoking the fire, a meal or bed), as the camp build has it: back to something removed is
 *  nothing (null). */
function campBack(b: unknown): unknown {
  if (!isRecord(b) || !('raise' in b)) return b;
  const id = campId(b.raise);
  return id === null ? null : { ...b, raise: id };
}

/** A format 11 save (0.0.25 to 0.0.30) as format 12, the camp build's (13 Oct 2026). Every part is read with checks: a
 *  save from before needs (0.0.25 to 0.0.29) has no `needs` or `toolsInChest`, a damaged one anything at all, and this
 *  never throws (readSave checks what comes out, and a new game would write over a save that couldn't be read).
 *  built: the lean-to is the wall tent, the log hut the wall tent and the log cabin; the log bench and the workbench are
 *  gone, what they took given back into the chest (GameState.bank).
 *  underway: a begun lean-to is a wall tent begun, a begun log hut a log cabin, each as far along as a share of its
 *  time; a begun bench or workbench is gone, what it took given back (once, even if it was built too).
 *  placed: gone (nothing is placed any more; the spots are fixed).
 *  his task, where he was on his way to, and what stoking, a meal or bed goes back to: at work at or on his way to
 *  something renamed, the same with the new one; to something removed, nothing.
 *  a tap kept while he slept: a build keeps only its id, renamed; one of something removed is dropped.
 *  the book's Making pages he knows: renamed, the removed ones dropped.
 *  A storage chest standing with no shelter (never in play: a hand-edited save) gets the tent it now stands in. */
export function campBuildSave(s: any): any {
  if (!isRecord(s)) return s;
  const out: Record<string, unknown> = { ...s };
  const bank: Record<string, unknown> = isRecord(s.bank) ? { ...s.bank } : {};
  const given = new Set<string>();
  const giveBack = (id: string) => {
    if (given.has(id)) return;
    given.add(id);
    for (const [item, n] of Object.entries(REMOVED[id]!)) {
      const had = bank[item];
      bank[item] = (Number.isSafeInteger(had) && (had as number) > 0 ? had as number : 0) + n;
    }
  };
  const wasBuilt: unknown[] = Array.isArray(s.built) ? s.built : [];
  const built: unknown[] = [];
  const add = (id: unknown) => { if (!built.includes(id)) built.push(id); };
  for (const id of wasBuilt) {
    if (id === 'log_hut') { add('wall_tent'); add('log_cabin'); }
    else if (typeof id === 'string' && Object.hasOwn(REMOVED, id)) giveBack(id);
    else add(campId(id));
  }
  if (built.includes('chest') && !built.includes('shelter')) built.push('shelter');
  const underway: Record<string, unknown> = {};
  if (isRecord(s.underway)) for (const [id, worked] of Object.entries(s.underway)) {
    if (Object.hasOwn(REMOVED, id)) giveBack(id);
    else if (Object.hasOwn(RENAMED, id)) {
      const to = RENAMED[id]!;
      underway[to] = typeof worked === 'number' && Number.isFinite(worked) ? worked / OLD_TIME[id]! * MAKES[to].time : worked;
    } else underway[id] = worked;
  }
  out.built = built; out.underway = underway; out.bank = bank;
  delete out.placed;
  if (isRecord(s.player)) {
    const p: Record<string, unknown> = { ...s.player };
    if (isRecord(p.task) && p.task.kind === 'raise') {
      const id = campId(p.task.id);
      p.task = id === null ? { kind: 'idle' } : { ...p.task, id };
    }
    if (isRecord(p.pending) && p.pending.kind === 'raise') {
      const id = campId(p.pending.id);
      if (id !== null) p.pending = { ...p.pending, id };
      else { p.pending = null; p.path = []; if (isRecord(p.task) && p.task.kind === 'walk') p.task = { kind: 'idle' }; }
    }
    if (isRecord(p.stoke) && 'back' in p.stoke) p.stoke = { ...p.stoke, back: campBack(p.stoke.back) };
    out.player = p;
  }
  if (isRecord(s.needs)) {
    const n: Record<string, unknown> = { ...s.needs };
    if (isRecord(n.meal) && 'back' in n.meal) n.meal = { ...n.meal, back: campBack(n.meal.back) };
    if (isRecord(n.bed) && 'back' in n.bed) n.bed = { ...n.bed, back: campBack(n.bed.back) };
    const later = n.later;
    if (isRecord(later) && (later.type === 'build' || later.type === 'make')) {
      const id = campId(later.id);
      n.later = id === null ? null : later.type === 'build' ? { type: 'build', id } : { ...later, id };
    }
    out.needs = n;
  }
  if (isRecord(s.thoughts) && Array.isArray(s.thoughts.known)) {
    const page = (k: unknown): unknown[] => {
      if (typeof k !== 'string' || !k.startsWith(MAKE_PAGE)) return [k];
      const id = campId(k.slice(MAKE_PAGE.length));
      return id === null ? [] : [MAKE_PAGE + String(id)];
    };
    out.thoughts = { ...s.thoughts, known: s.thoughts.known.flatMap(page) };
  }
  return out;
}

/** How a Making page of the book is known by its id (makeKey in core/thoughts.ts). */
const MAKE_PAGE = 'make:';

/** The game as saved text. `savedAt` (since 0.0.20): the real time the game had been played up to when it was saved,
 *  in ms since 1970 (Date.now()), from which away time is counted when it is opened again (sim.ts, catchUpAway).
 *  Left out, as in the artifact viewer's hand-over of a running game, it is none. `closedAt` (since 0.0.21): the real
 *  time the page was closed, when it was saved on closing: from `savedAt` to then the game was still open (hidden),
 *  which counts at full speed; only from then on is it away time. */
export function serialize(state: GameState, savedAt?: number, closedAt?: number): string {
  if (savedAt === undefined) return JSON.stringify(state);
  return JSON.stringify(closedAt === undefined ? { ...state, savedAt } : { ...state, savedAt, closedAt });
}

/** A save read back: the game, the real time it had been played up to when it was saved (ms since 1970), or null when
 *  the save doesn't say (from before 0.0.20, or a hand-over of a running game) or says something broken; and when the
 *  page was closed, if it was saved on closing (0.0.21), or null. */
export interface Loaded { state: GameState; savedAt: number | null; closedAt: number | null }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The items kept from a saved backpack or bank: known items only (ITEMS), each a whole number above 0. Anything else,
 *  from a damaged or hand-edited save, is dropped, so it can't break the backpack or spread into the bank. An item
 *  the game renames gets a migration, like any other format change. */
function savedItems(v: unknown): Record<string, number> {
  if (!isRecord(v)) return {};
  return Object.fromEntries(Object.entries(v).filter(([id, n]) => Object.hasOwn(ITEMS, id) && Number.isSafeInteger(n) && (n as number) > 0)) as Record<string, number>;
}

/** XP per skill: a known skill keeps its saved XP if it is a number of 0 or more; anything else starts from 0. */
function savedSkills(v: unknown, fresh: Record<SkillId, number>): Record<SkillId, number> {
  const skills = { ...fresh };
  if (isRecord(v)) for (const id of Object.keys(SKILLS) as SkillId[]) {
    const xp = v[id];
    if (typeof xp === 'number' && Number.isFinite(xp) && xp >= 0) skills[id] = xp;
  }
  return skills;
}

/** Tools owned: a known tool keeps its saved true or false; anything else is as a new game here has it. */
function savedTools(v: unknown, fresh: Record<ToolId, boolean>): Record<ToolId, boolean> {
  const tools = { ...fresh };
  if (isRecord(v)) for (const id of TOOL_IDS) if (typeof v[id] === 'boolean') tools[id] = v[id] as boolean;
  return tools;
}

/** Pickups taken: ids the layout still has, each with a finite time it comes back, or null for never. */
function savedTaken(v: unknown, layout: Layout): Record<string, number | null> {
  if (!isRecord(v)) return {};
  const ids = new Set((layout.pickups ?? []).map(p => p.id));
  return Object.fromEntries(Object.entries(v).filter(([id, t]) => ids.has(id) && (t === null || (typeof t === 'number' && Number.isFinite(t))))) as Record<string, number | null>;
}

/** What stands built: things in MAKES that give a structure and whose site this layout has, each once. */
function savedBuilt(v: unknown, layout: Layout): MakeId[] {
  if (!Array.isArray(v)) return [];
  const ok = (id: unknown) => {
    const def = typeof id === 'string' ? makeDef(id) : null;
    return !!def && def.gives.kind === 'structure' && def.at !== 'here' && siteOf(layout, def.at) !== null;
  };
  return [...new Set(v.filter(ok))] as MakeId[];
}

/** What he wears (0.0.22): in each slot, gear that exists and goes in that slot; anything else is nothing. */
function savedEquipment(v: unknown, fresh: Record<Slot, GearId | null>): Record<Slot, GearId | null> {
  const out = { ...fresh };
  if (isRecord(v)) for (const slot of SLOTS) { const def = typeof v[slot] === 'string' ? gearDef(v[slot] as string) : null; if (def?.slot === slot) out[slot] = def.id; }
  return out;
}

/** Goals finished: ids GOALS still has, each once. */
function savedGoals(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter(id => typeof id === 'string' && GOALS.some(g => g.id === id)))] as string[];
}

/** Where he goes back to after stoking the fire: a node this layout has, a pickup it has, something he can still
 *  make here, or a spot (finite numbers); anything else is null (he stays by the fire). */
function savedBack(v: unknown, state: GameState, layout: Layout): Back | null {
  if (!isRecord(v)) return null;
  if (typeof v.nodeId === 'string') return v.nodeId in state.nodes ? { nodeId: v.nodeId } : null;
  if (typeof v.pickupId === 'string') return (layout.pickups ?? []).some(x => x.id === v.pickupId) ? { pickupId: v.pickupId } : null;
  if (typeof v.make === 'string') return makeable(state, layout, v.make) ? { make: v.make as MakeId } : null;
  if (typeof v.fight === 'string') return targetOf(state, layout, v.fight) && state.equipment.weapon ? { fight: v.fight } : null;
  if (v.cook === true) return savedCook({ fetch: false }, state, layout) ? { cook: true } : null;
  if (v.sleep === true) return canSleep(state, layout) ? { sleep: true } : null;
  if (typeof v.raise === 'string') return Object.hasOwn(state.underway, v.raise) ? { raise: v.raise as MakeId } : null;
  const to = v.to as { x?: unknown; z?: unknown } | undefined;
  if (isRecord(to) && Number.isFinite(to.x) && Number.isFinite(to.z)) return { to: { x: to.x as number, z: to.z as number } };
  return null;
}

/** Stoking the fire (0.0.19), as saved: only where the fire is his to stoke (the campfire stands, with the firewood
 *  pile or the chest), fetching the logs from one that stands (or with logs from his backpack already in hand: `from`
 *  null; one that doesn't say, from before 0.0.21 or damaged, came from the chest), with a whole number of logs
 *  carried (none before he reaches the pile or the chest). Anything else is null. The chest is in the shelter since the
 *  camp build (core/camp.ts chestHere), so a save from before it, stoking from the chest at its own spot, carries on at
 *  the shelter's door with the logs it had. */
function savedStoke(v: unknown, state: GameState, layout: Layout): Stoke | null {
  const has = (id: 'woodpile' | 'chest') => id === 'chest' ? chestHere(state, layout) : state.built.includes(id) && !!siteOf(layout, id);
  if (!isRecord(v) || !state.built.includes('campfire') || !siteOf(layout, 'hearth') || (!has('woodpile') && !has('chest'))) return null;
  const from = v.from === 'woodpile' || v.from === 'chest' ? v.from : v.from === null ? null : has('chest') ? 'chest' : null;
  if (from && !has(from)) return null;
  const logs = Number.isSafeInteger(v.logs) && (v.logs as number) > 0 ? Math.min(v.logs as number, STOKE.logs) : 0;
  if (!from && !logs) return null;
  return { back: savedBack(v.back, state, layout), logs, empty: v.empty === true && from === 'chest', from };
}

/** Cooking at the campfire (chapter 2), as saved: only where the campfire stands, and fetching raw fish only from a
 *  chest that stands (in the shelter since the camp build). Anything else is null. */
function savedCook(v: unknown, state: GameState, layout: Layout): Cook | null {
  if (!isRecord(v) || !canCook(state, layout)) return null;
  const fetch = v.fetch === true;
  return fetch && !chestHere(state, layout) ? null : { fetch };
}

/** Whether `id` can be made at all (data/making.ts): it exists, it is made where he stands, and it isn't made yet (a
 *  tool owned, gear worn). Since the camp build what is built at the camp's spots goes up in stages: an old save making
 *  one (a `make` task, on his way to make it, or going back to it after stoking the fire) took nothing yet, so that is
 *  just dropped, and he begins it again with the build command. */
function makeable(state: GameState, _layout: Layout, id: unknown): boolean {
  const def = typeof id === 'string' ? makeDef(id) : null;
  return !!def && def.at === 'here' && !made(state, def.id);
}

/** A finite point, or null. */
const pointOf = (v: unknown): Vec2 | null => isRecord(v) && Number.isFinite(v.x) && Number.isFinite(v.z) ? { x: v.x as number, z: v.z as number } : null;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === 'string';

/** His task as saved, in its shape (what it names is checked against the game in readSave): a kind the game has with
 *  the fields it needs, of the right sort; anything else (a damaged save) is idle. */
function savedTask(v: unknown): Task {
  if (!isRecord(v)) return { kind: 'idle' };
  switch (v.kind) {
    case 'idle': case 'walk': case 'sleep': return { kind: v.kind };
    case 'gather': {
      if (!str(v.nodeId)) break;
      const progress = finite(v.progress) && v.progress >= 0 && v.progress < 1 ? v.progress : 0;
      return v.mayMoveOn === true ? { kind: 'gather', nodeId: v.nodeId, progress, mayMoveOn: true } : { kind: 'gather', nodeId: v.nodeId, progress };
    }
    case 'pickup': return str(v.id) && finite(v.doneAt) ? { kind: 'pickup', id: v.id, doneAt: v.doneAt } : { kind: 'idle' };
    case 'make': return str(v.id) && finite(v.doneAt) ? { kind: 'make', id: v.id as MakeId, doneAt: v.doneAt } : { kind: 'idle' };
    case 'stoke': return finite(v.doneAt) ? { kind: 'stoke', doneAt: v.doneAt } : { kind: 'idle' };
    case 'cook': return finite(v.doneAt) ? { kind: 'cook', doneAt: v.doneAt } : { kind: 'idle' };
    case 'fight': return str(v.target) && finite(v.progress) ? { kind: 'fight', target: v.target, progress: v.progress } : { kind: 'idle' };
    // (knocked out: when he wakes is checked in readSave, which wakes him at once if it is broken)
    case 'knockedOut': return { kind: 'knockedOut', wakeAt: finite(v.wakeAt) ? v.wakeAt : NaN, by: str(v.by) ? v.by : '' };
    case 'raise': return str(v.id) ? { kind: 'raise', id: v.id as MakeId } : { kind: 'idle' };
  }
  return { kind: 'idle' };
}

/** Where he was on his way to, in its shape: a kind the game has with an id; anything else is nowhere (null). */
function savedPending(v: unknown): Pending {
  if (!isRecord(v) || !str(v.id)) return null;
  switch (v.kind) {
    case 'node': case 'visit': case 'pickup': case 'fight': return { kind: v.kind, id: v.id };
    case 'make': return { kind: 'make', id: v.id as MakeId };
    case 'raise': return { kind: 'raise', id: v.id as MakeId };
  }
  return null;
}

/** The way he was walking: finite points (none, for a damaged one). */
const savedPath = (v: unknown): Vec2[] => {
  if (!Array.isArray(v)) return [];
  const path = v.map(pointOf);
  return path.every(p => p !== null) ? path as Vec2[] : [];
};

/** Whether the way still ahead of him, from `from` along `path`, is clear on `nav` (something now stands across it: a
 *  bigger step than when the save was made). */
function wayClear(nav: NavGrid, from: Vec2, path: Vec2[]): boolean {
  let at = from;
  for (const next of path) { if (!nav.lineOfSight(at, next)) return false; at = next; }
  return true;
}

/** Where he stands, read back (readSave), and the way he was walking: a broken position, or one more than LOAD.nudge
 *  from open ground, starts him again where a new game starts, doing nothing; one where something now stands (a bigger
 *  step than when the save was made) moves him out to the nearest open ground, and he carries on with what he was
 *  doing (asleep, building, knocked out). A way he was walking that something now stands across is walked again round
 *  it, to where it went (or, now under something, the nearest open ground to there within LOAD.nudge); with no way
 *  there, he stops where he is. */
function savedWhere(state: GameState, layout: Layout): void {
  const p = state.player, nav = walkGrid(state, layout);
  const stop = () => { p.path = []; p.pending = null; if (p.task.kind === 'walk') p.task = { kind: 'idle' }; };
  const near = (q: Vec2): Vec2 | null => {
    if (nav.walkable(q)) return q;
    const n = nav.nearestWalkable(q);
    return nav.walkable(n) && Math.hypot(n.x - q.x, n.z - q.z) <= LOAD.nudge ? n : null;
  };
  const at = pointOf(p.pos) && near(p.pos);
  if (!at) {
    p.pos = { ...layout.start }; p.path = []; p.task = { kind: 'idle' }; p.pending = null; p.trip = null;
    return;
  }
  const moved = at !== p.pos;
  p.pos = { ...at };
  if (!p.path.length || (!moved && wayClear(nav, p.pos, p.path))) return;
  const end = near(p.path.at(-1)!), way = end && nav.findPath(p.pos, end);
  if (way) p.path = way; else stop();
}

/** Whether a visit to `id` is to something at the camp: the storage chest, the shelter, or something built at the
 *  camp's spots (the campfire, the firewood pile), not one of the village's buildings or its land. */
const campVisit = (id: string) => id === 'chest' || id === 'shelter' || lineOf(id) !== null;

/** Where he was on his way to at the camp, read back (readSave, after where he stands and what he was going to are
 *  checked): a visit to the chest, the shelter, the campfire or the firewood pile, or building something. Each is
 *  where he stands for it now (core/camp.ts): the chest, at its own spot before the camp build, is in the shelter and
 *  used at its door; the firewood pile's spot moved out along its line; a bigger step has its own stands. A way that
 *  doesn't end there is found again from where he stands, to the nearest he can reach; with no way there, or nothing
 *  there to go to now, he stops where he is (what the way was for, stoking the fire, a meal, bed, cooking or a trip,
 *  is seen to after this as for any way that stopped). */
function savedCampWay(state: GameState, layout: Layout): void {
  const p = state.player, pending = p.pending;
  if (pending?.kind !== 'raise' && (pending?.kind !== 'visit' || !campVisit(pending.id))) return;
  const spot = pending.kind === 'raise' ? buildSpot(state, layout, pending.id) : useSpot(state, layout, pending.id);
  const stop = () => { p.pending = null; p.path = []; if (p.task.kind === 'walk') p.task = { kind: 'idle' }; };
  if (!spot) { stop(); return; }
  if (atSpot(spot, p.path.at(-1) ?? p.pos)) return;
  const nav = walkGrid(state, layout);
  for (const end of spotEnds(spot, p.pos)) {
    const at = nav.walkable(end) || !spot.stands.length ? end : nav.nearestWalkable(end);
    if (!nav.walkable(at) || Math.hypot(at.x - end.x, at.z - end.z) > AT_SPOT.slip) continue;
    const way = nav.findPath(p.pos, at);
    if (way) { p.path = way; return; }
  }
  stop();
}

/** The game in a save, without when it was saved (readSave has both). */
export function deserialize(raw: string, layout: Layout): GameState { return readSave(raw, layout).state; }

/** A save read back. Throws only for something that isn't a Hearthfolk save at all (or is from a newer version): every
 *  part of one is checked, and a damaged part is as a new game has it, so a damaged save still loads. */
export function readSave(raw: string, layout: Layout): Loaded {
  let data = JSON.parse(raw);
  if (typeof data !== 'object' || data === null || Array.isArray(data) || typeof data.version !== 'number') throw new Error('not a Hearthfolk save');
  if (data.version > SAVE_VERSION) throw new Error(`save is from a newer version (${data.version})`);
  while (data.version < SAVE_VERSION) {
    const m = migrations[data.version];
    if (!m) throw new Error(`no migration from save version ${data.version}`);
    data = m(data); data.version++;
  }
  // when it was saved goes beside the game, not into it; a time from a damaged or hand-edited save (not a number, not
  // after 1970, infinite) is none, so no away time is counted from it
  const savedAt: number | null = typeof data.savedAt === 'number' && Number.isFinite(data.savedAt) && data.savedAt > 0 ? data.savedAt : null;
  // when the page was closed: only with a time it was played up to, and not before it
  const closedAt: number | null = savedAt !== null && typeof data.closedAt === 'number' && Number.isFinite(data.closedAt) && data.closedAt >= savedAt ? data.closedAt : null;
  delete data.savedAt; delete data.closedAt;
  // (nothing is placed since the camp build: a placement must not be saved again for ever)
  delete data.placed;
  // fill anything missing (for example a rock added to the layout since the save was made)
  const seed = Number.isSafeInteger(data.seed) ? data.seed as number : 1;
  const fresh = createState(layout, seed);
  const player = isRecord(data.player) ? data.player : {};
  const state: GameState = {
    ...fresh, ...data,
    version: SAVE_VERSION, seed,
    time: finite(data.time) && data.time >= 0 ? data.time : fresh.time,
    player: {
      ...fresh.player, ...player, backpack: savedItems(player.backpack),
      pos: pointOf(player.pos) ?? { x: NaN, z: NaN }, heading: finite(player.heading) ? player.heading : fresh.player.heading,
      path: savedPath(player.path), task: savedTask(player.task), pending: savedPending(player.pending),
      trip: isRecord(player.trip) ? { ...player.trip } as GameState['player']['trip'] : null,
    },
    skills: savedSkills(data.skills, fresh.skills),
    bank: savedItems(data.bank),
    tools: savedTools(data.tools, fresh.tools),
    hasBook: data.hasBook === true,
    taken: savedTaken(data.taken, layout),
    built: savedBuilt(data.built, layout),
    goalsDone: savedGoals(data.goalsDone),
    stokedNight: Number.isSafeInteger(data.stokedNight) ? data.stokedNight : -1,
    fireLow: data.fireLow === true,
    woodpile: 0,
    stokeAgain: data.stokeAgain === true,
    parcels: { ...fresh.parcels, ...Object.fromEntries(Object.entries(isRecord(data.parcels) ? data.parcels : {}).filter(([id, v]) => id in fresh.parcels && isRecord(v)).map(([id, v]) => [id, { claimed: (v as Record<string, unknown>).claimed === true }])) },
    // what he wears and what fighting trains (0.0.22): anything unknown is as a new game has it
    equipment: savedEquipment(data.equipment, fresh.equipment),
    combatStyle: STYLES.includes(data.combatStyle) ? data.combatStyle as CombatStyle : fresh.combatStyle,
    // (the camp build) going back by himself to something half built: from when it was saved to wait (a moment after a
    // walk, a while after finding no way), never longer than a wait could be; none (0) for anything else, or a save from
    // before it
    resumeAt: 0,
  };
  const wait = Math.max(RESUME.wait, RESUME.retry);
  if (finite(data.resumeAt) && data.resumeAt > 0 && data.resumeAt <= state.time + wait) state.resumeAt = data.resumeAt;
  // building in stages: what he has begun (core/building.ts), at most one thing, the one he was at or on his way to; what
  // anything else begun took goes back into the chest. None in an older save
  const raising = [player.task, player.pending].find(t => isRecord(t) && t.kind === 'raise') as Record<string, unknown> | undefined;
  const { underway, refund } = savedBuilding(data, state, layout, raising?.id);
  state.underway = underway;
  for (const [item, n] of Object.entries(refund)) state.bank[item] = (state.bank[item] ?? 0) + n;
  // the rats round their nests (chapter 2): each keeps what it was doing that matters, or is a fresh one (core/rats.ts)
  state.rats = savedRats(data.rats, state, layout);
  // the goblin camp (chapter 2): cleared for good only with the chief's torn map to show for it (carried, stored, or its
  // goal done), so a damaged save never leaves that goal impossible; the chief out of his tent only while it isn't
  // cleared; then each goblin keeps what it was doing that matters, or is a fresh one (core/goblins.ts). A save from
  // before the goblin camp (0.0.22, 0.0.23) has the camp as new.
  const camp = isRecord(data.goblinCamp) ? data.goblinCamp : {};
  const cleared = !!layout.goblinCamp && camp.cleared === true
    && (owned(state, CHIEF.drop) > 0 || GOALS.some(g => (g.needs[CHIEF.drop] ?? 0) > 0 && state.goalsDone.includes(g.id)));
  state.goblinCamp = { chiefOut: !!layout.goblinCamp && !cleared && camp.chiefOut === true, cleared };
  state.goblins = savedGoblins(data.goblins, state, layout);
  // his health: a number above 0 up to his most; anything else (none saved, from before 0.0.22, or damaged) is full
  // well rested: a finite time, never past the next nightfall (one gone by is kept as it was: it reads back exactly, and
  // means not rested all the same)
  state.restedUntil = typeof data.restedUntil === 'number' && Number.isFinite(data.restedUntil) && data.restedUntil > 0
    ? (data.restedUntil <= restedTill(state.time) + 1e-6 ? data.restedUntil : restedTill(state.time)) : 0;
  const max = maxHealth(state);
  state.health = typeof data.health === 'number' && Number.isFinite(data.health) && data.health > 0 ? Math.min(data.health, max) : max;
  // the firewood pile's logs: a whole number up to what it holds, and none unless it stands
  if (state.built.includes('woodpile') && Number.isSafeInteger(data.woodpile) && data.woodpile > 0) state.woodpile = Math.min(data.woodpile, WOODPILE.max);
  // the rocks and trees: each the layout has, run out until a finite time (or not)
  const nodes = isRecord(data.nodes) ? data.nodes : {};
  state.nodes = Object.fromEntries(Object.entries(fresh.nodes).map(([id, n]) => {
    const v = nodes[id], until = isRecord(v) ? v.depletedUntil : undefined;
    return [id, finite(until) ? { id, depletedUntil: until } : n];
  }));
  // his thoughts and the pages of his book (the survival book): checked, or what an older save's progress implies
  state.thoughts = savedThoughts(data.thoughts, state, layout);
  // where he stands, and the way he was walking: a broken position starts him again; one where something now stands, or
  // a way that something now stands across, is moved out to open ground round it (savedWhere)
  savedWhere(state, layout);
  const p = state.player;
  // a task or destination pointing at something that no longer exists (or a pickup taken for good) is dropped; a
  // stone or branch that isn't back yet is kept: gathering, he walks to it or waits beside it
  const pickupThere = (id: string) => (layout.pickups ?? []).some(x => x.id === id) && (!(id in state.taken) || state.taken[id] !== null);
  if (p.task.kind === 'gather' && !(p.task.nodeId in state.nodes)) p.task = { kind: 'idle' };
  if (p.task.kind === 'pickup' && (!pickupThere(p.task.id) || !Number.isFinite(p.task.doneAt))) p.task = { kind: 'idle' };
  // making something: only something that can still be made here, with a time it is done
  if (p.task.kind === 'make' && (!makeable(state, layout, p.task.id) || !Number.isFinite(p.task.doneAt))) p.task = { kind: 'idle' };
  // building in stages: only something begun and not finished
  if (p.task.kind === 'raise' && !Object.hasOwn(state.underway, p.task.id)) p.task = { kind: 'idle' };
  // asleep: only in a shelter that stands (until when: his needs, below)
  if (p.task.kind === 'sleep' && !canSleep(state, layout)) p.task = { kind: 'idle' };
  // knocked out (chapter 2's rats): he wakes when it says, but no later than a knock-out now would give (at once if that
  // is broken), and lies there with the 0 health he was knocked out with
  if (p.task.kind === 'knockedOut') {
    const { wakeAt, by } = p.task, ok = Number.isFinite(wakeAt) && typeof by === 'string';
    p.task = { kind: 'knockedOut', wakeAt: ok ? Math.min(wakeAt, state.time + KNOCKED_OUT.slump) : state.time, by: String(by) };
    if (data.health === 0) state.health = 0;
  }
  // fighting (0.0.22): only something there to fight (the dummy, built; a rat the layout has), with a weapon, part way
  // from one strike to the next
  if (p.task.kind === 'fight' && (!targetOf(state, layout, p.task.target) || !state.equipment.weapon
    || !Number.isFinite(p.task.progress) || p.task.progress < 0 || p.task.progress >= 1)) p.task = { kind: 'idle' };
  if ((p.pending?.kind === 'node' && !(p.pending.id in state.nodes)) || (p.pending?.kind === 'pickup' && !pickupThere(p.pending.id))
    || (p.pending?.kind === 'make' && !makeable(state, layout, p.pending.id))
    || (p.pending?.kind === 'raise' && !Object.hasOwn(state.underway, p.pending.id))
    || (p.pending?.kind === 'fight' && (!targetOf(state, layout, p.pending.id) || !state.equipment.weapon))) {
    p.pending = null; p.path = []; if (p.task.kind === 'walk') p.task = { kind: 'idle' };
  }
  // (the camp build) on his way to something at the camp: walked again to where he stands for it now (the chest at the
  // shelter's door, the firewood pile's moved stand, a bigger step's own stands), or stopped
  savedCampWay(state, layout);
  // a trip only makes sense on the way to the bank or waiting at its door, back to a node that still exists or to
  // gathering pickups the layout still has
  const trip = p.trip as Partial<{ nodeId: unknown; pickupId: unknown; fight: unknown; store: unknown; leaveAt: unknown }> | null;
  if (trip && trip.leaveAt !== undefined && !Number.isFinite(trip.leaveAt)) delete trip.leaveAt;
  // (chapter 2) the chest tapped on the way for food to fight with: true, on a trip { fight }, or not at all
  if (trip && trip.store !== undefined && (trip.store !== true || typeof trip.fight !== 'string')) delete trip.store;
  // (13 Oct 2026) on his way to the chest for a tool: true, on a trip { nodeId }, or not at all
  const t = trip as { tool?: unknown } | null;
  if (t && t.tool !== undefined && (t.tool !== true || typeof trip!.nodeId !== 'string')) delete t.tool;
  const gathered = (id: string) => { const spot = layout.pickups?.find(x => x.id === id); return !!spot && PICKUPS[spot.kind].gather !== null; };
  const backTo = !!trip && (typeof trip.fight === 'string' ? !!targetOf(state, layout, trip.fight)?.foe && !!state.equipment.weapon
    : typeof trip.pickupId === 'string' ? gathered(trip.pickupId) : typeof trip.nodeId === 'string' && trip.nodeId in state.nodes);
  if (trip && (!backTo || (p.pending?.kind !== 'visit' && trip.leaveAt === undefined))) p.trip = null;
  // stoking the fire (0.0.19) carries on only on the way to the pile or the chest (no logs yet), with the logs on the
  // way to the fire, or stoking it; otherwise it stops, and logs he carried go back where they came from. A stoke task
  // needs it.
  const stoke = savedStoke(p.stoke, state, layout);
  const goingTo = p.pending?.kind === 'visit' ? p.pending.id : null;
  const onTrack = !!stoke && (p.task.kind === 'stoke' ? stoke.logs > 0 && Number.isFinite(p.task.doneAt) : goingTo === (stoke.logs ? 'campfire' : stoke.from));
  p.stoke = onTrack ? stoke : null;
  if (stoke && !onTrack && stoke.logs > 0) {
    if (stoke.from === 'woodpile') state.woodpile = Math.min(WOODPILE.max, state.woodpile + stoke.logs);
    else if (stoke.from === 'chest') state.bank[STOKE.item] = (state.bank[STOKE.item] ?? 0) + stoke.logs;
    else p.backpack[STOKE.item] = (p.backpack[STOKE.item] ?? 0) + stoke.logs;
  }
  if (p.task.kind === 'stoke' && !p.stoke) p.task = { kind: 'idle' };
  if (p.stoke) p.trip = null;
  // cooking at the campfire (chapter 2) carries on only on the way to the chest for raw fish, on the way to the fire,
  // or cooking (with a time the fish is done), and never alongside stoking; otherwise it stops. A cook task needs it.
  const cook = p.stoke ? null : savedCook(p.cook, state, layout);
  p.cook = cook && (p.task.kind === 'cook' ? !cook.fetch && Number.isFinite(p.task.doneAt) : goingTo === (cook.fetch ? 'chest' : 'campfire')) ? cook : null;
  if (p.task.kind === 'cook' && !p.cook) p.task = { kind: 'idle' };
  if (p.cook) p.trip = null;
  // (13 Oct 2026) his needs and the tools kept in the chest, checked (core/needs.ts, core/tools.ts): a save from before
  // them (0.0.22 to 0.0.27) has him full, to bed at the usual hour (asleep, until then), and carrying his tools
  state.needs = savedNeeds(data.needs, state, layout, b => savedBack(b, state, layout));
  if (p.task.kind === 'sleep' && !state.needs.bed) p.task = { kind: 'idle' };
  state.toolsInChest = savedToolsInChest(data.toolsInChest, state, layout);
  return { state, savedAt, closedAt };
}

/** Where a save that can't be read is kept (only the first such: a later one never writes over it), so a new game's
 *  first save doesn't lose it for good: it can be looked at, and perhaps mended, later. */
export const UNREAD_KEY = `${SAVE_KEY}.unread`;

/** The saved game and when it was saved, or null when there is none (or it can't be read: then it is kept under
 *  UNREAD_KEY first, as a new game is about to save over it). */
export function load(storage: Storage, layout: Layout): Loaded | null {
  let raw: string | null = null;
  try {
    raw = storage.get(SAVE_KEY);
    return raw ? readSave(raw, layout) : null;
  } catch {
    try { if (raw && !storage.get(UNREAD_KEY)) storage.set(UNREAD_KEY, raw); } catch { /* storage blocked */ }
    return null;
  }
}

/** Save the game, saying it had been played up to `savedAt` (real time, ms since 1970: see serialize), and, saved
 *  as the page closes, when that was (`closedAt`). */
export function save(storage: Storage, state: GameState, savedAt: number, closedAt?: number): boolean {
  try { storage.set(SAVE_KEY, serialize(state, savedAt, closedAt)); return true; } catch { return false; }
}

/** Erase the saved game (Start over, in the "What's new" panel: the owner, 12 Oct 2026, for testers): the next load
 *  finds none and a new game begins. */
export function clearSave(storage: Storage): boolean {
  try { storage.set(SAVE_KEY, ''); return true; } catch { return false; }
}

/** Browser storage, failing quietly where it's blocked (private windows, previews). */
export const browserStorage: Storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } },
};
