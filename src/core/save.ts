// Saving: versioned JSON with a migration for every format change, so an update never wipes a village.
import { SAVE_VERSION, createState, made, type GameState } from './state';
import { siteOf, type Layout } from '../world/layout';
import { navFor } from '../world/nav';
import { ITEMS, SKILLS, TOOL_IDS, type SkillId, type ToolId } from '../data/skills';
import { PICKUPS } from '../data/pickups';
import { BOOK, GOALS } from '../data/goals';
import { makeDef, type MakeId } from '../data/making';

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
    const met = GOALS.filter(g => !g.makes && Object.entries(g.needs).every(([id, n]) => have(id) >= n));
    return { ...s, built: [], goalsDone: met.map(g => g.id) };
  },
};

export function serialize(state: GameState): string { return JSON.stringify(state); }

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

/** Goals finished: ids GOALS still has, each once. */
function savedGoals(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter(id => typeof id === 'string' && GOALS.some(g => g.id === id)))] as string[];
}

/** Whether `id` can be made here at all (data/making.ts): it exists, its site is in this layout, and it isn't made
 *  yet (a structure built, a tool owned). */
function makeable(state: GameState, layout: Layout, id: unknown): boolean {
  const def = typeof id === 'string' ? makeDef(id) : null;
  if (!def || (def.at !== 'here' && !siteOf(layout, def.at))) return false;
  return !made(state, def.id);
}

export function deserialize(raw: string, layout: Layout): GameState {
  let data = JSON.parse(raw);
  if (typeof data !== 'object' || data === null || typeof data.version !== 'number') throw new Error('not a Hearthfolk save');
  if (data.version > SAVE_VERSION) throw new Error(`save is from a newer version (${data.version})`);
  while (data.version < SAVE_VERSION) {
    const m = migrations[data.version];
    if (!m) throw new Error(`no migration from save version ${data.version}`);
    data = m(data); data.version++;
  }
  // fill anything missing (for example a rock added to the layout since the save was made)
  const fresh = createState(layout, data.seed ?? 1);
  const state: GameState = {
    ...fresh, ...data,
    player: { ...fresh.player, ...data.player, backpack: savedItems(data.player?.backpack) },
    skills: savedSkills(data.skills, fresh.skills),
    bank: savedItems(data.bank),
    tools: savedTools(data.tools, fresh.tools),
    hasBook: data.hasBook === true,
    taken: savedTaken(data.taken, layout),
    built: savedBuilt(data.built, layout),
    goalsDone: savedGoals(data.goalsDone),
    parcels: { ...fresh.parcels, ...Object.fromEntries(Object.entries(data.parcels ?? {}).filter(([id]) => id in fresh.parcels)) },
  };
  state.nodes = { ...fresh.nodes, ...Object.fromEntries(Object.entries(data.nodes ?? {}).filter(([id]) => id in fresh.nodes)) } as GameState['nodes'];
  // a position that is broken, or now inside a building or off the land, goes back to the start
  const p = state.player;
  if (!Number.isFinite(p.pos?.x) || !Number.isFinite(p.pos?.z) || !navFor(layout, state.built).walkable(p.pos)) {
    p.pos = { ...layout.start }; p.path = []; p.task = { kind: 'idle' }; p.pending = null; p.trip = null;
  }
  // a task or destination pointing at something that no longer exists (or a pickup taken for good) is dropped; a
  // stone or branch that isn't back yet is kept: gathering, he walks to it or waits beside it
  const pickupThere = (id: string) => (layout.pickups ?? []).some(x => x.id === id) && (!(id in state.taken) || state.taken[id] !== null);
  if (p.task.kind === 'gather' && !(p.task.nodeId in state.nodes)) p.task = { kind: 'idle' };
  if (p.task.kind === 'pickup' && (!pickupThere(p.task.id) || !Number.isFinite(p.task.doneAt))) p.task = { kind: 'idle' };
  // making something: only something that can still be made here, with a time it is done
  if (p.task.kind === 'make' && (!makeable(state, layout, p.task.id) || !Number.isFinite(p.task.doneAt))) p.task = { kind: 'idle' };
  if ((p.pending?.kind === 'node' && !(p.pending.id in state.nodes)) || (p.pending?.kind === 'pickup' && !pickupThere(p.pending.id))
    || (p.pending?.kind === 'make' && !makeable(state, layout, p.pending.id))) {
    p.pending = null; p.path = []; if (p.task.kind === 'walk') p.task = { kind: 'idle' };
  }
  // a trip only makes sense on the way to the bank or waiting at its door, back to a node that still exists or to
  // gathering pickups the layout still has
  const trip = p.trip as Partial<{ nodeId: unknown; pickupId: unknown; leaveAt: unknown }> | null;
  if (trip && trip.leaveAt !== undefined && !Number.isFinite(trip.leaveAt)) delete trip.leaveAt;
  const gathered = (id: string) => { const spot = layout.pickups?.find(x => x.id === id); return !!spot && PICKUPS[spot.kind].gather !== null; };
  const backTo = !!trip && (typeof trip.pickupId === 'string' ? gathered(trip.pickupId) : typeof trip.nodeId === 'string' && trip.nodeId in state.nodes);
  if (trip && (!backTo || (p.pending?.kind !== 'visit' && trip.leaveAt === undefined))) p.trip = null;
  return state;
}

export function load(storage: Storage, layout: Layout): GameState | null {
  try {
    const raw = storage.get(SAVE_KEY);
    return raw ? deserialize(raw, layout) : null;
  } catch { return null; }
}

export function save(storage: Storage, state: GameState): boolean {
  try { storage.set(SAVE_KEY, serialize(state)); return true; } catch { return false; }
}

/** Browser storage, failing quietly where it's blocked (private windows, previews). */
export const browserStorage: Storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } },
};
