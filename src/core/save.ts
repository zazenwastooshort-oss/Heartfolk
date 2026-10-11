// Saving: versioned JSON with a migration for every format change, so an update never wipes a village.
import { SAVE_VERSION, createState, type GameState } from './state';
import type { Layout } from '../world/layout';
import { navFor } from '../world/nav';

export interface Storage { get(key: string): string | null; set(key: string, value: string): void }

export const SAVE_KEY = 'hearthfolk_save';

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
};

export function serialize(state: GameState): string { return JSON.stringify(state); }

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
    player: { ...fresh.player, ...data.player },
    skills: { ...fresh.skills, ...data.skills },
    parcels: { ...fresh.parcels, ...Object.fromEntries(Object.entries(data.parcels ?? {}).filter(([id]) => id in fresh.parcels)) },
  };
  state.nodes = { ...fresh.nodes, ...Object.fromEntries(Object.entries(data.nodes ?? {}).filter(([id]) => id in fresh.nodes)) } as GameState['nodes'];
  // a position that is broken, or now inside a building or off the land, goes back to the start
  const p = state.player;
  if (!Number.isFinite(p.pos?.x) || !Number.isFinite(p.pos?.z) || !navFor(layout).walkable(p.pos)) {
    p.pos = { ...layout.start }; p.path = []; p.task = { kind: 'idle' }; p.pending = null;
  }
  // a task or destination pointing at something that no longer exists is dropped
  if (p.task.kind === 'gather' && !(p.task.nodeId in state.nodes)) p.task = { kind: 'idle' };
  if (p.pending?.kind === 'node' && !(p.pending.id in state.nodes)) { p.pending = null; p.path = []; if (p.task.kind === 'walk') p.task = { kind: 'idle' }; }
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
