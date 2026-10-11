// Everything that makes up a saved game. Systems change it; the renderer only reads it.
import type { SkillId } from '../data/skills';
import type { Layout, Vec2 } from '../world/layout';
import { DAY_SECONDS } from './clock';

export const SAVE_VERSION = 3;

/** gather: working a rock or a tree; progress runs 0..1 through one swing of that skill's tool. `mayMoveOn` is set
 *  when the node runs out while he works it, so he can move on to another; a node that was already down when he got
 *  there (the player tapped a stump) is one he was sent to, so he waits at it. */
export type Task = { kind: 'idle' } | { kind: 'walk' } | { kind: 'gather'; nodeId: string; progress: number; mayMoveOn?: boolean };

/** What the player is walking towards: a resource node to work, or a place to visit (a building or land). */
export type Pending = { kind: 'node'; id: string } | { kind: 'visit'; id: string } | null;

export interface PlayerState {
  pos: Vec2;
  heading: number;              // radians; 0 faces +x, positive turns towards -z
  path: Vec2[];                 // waypoints still to walk
  task: Task;
  pending: Pending;
}

export interface NodeState { id: string; depletedUntil: number }   // 0 when available
export interface ParcelState { claimed: boolean }

export interface GameState {
  version: number;
  time: number;                 // in-game seconds since the save was created
  seed: number;
  player: PlayerState;
  skills: Record<SkillId, number>;   // xp per skill
  bank: Record<string, number>;      // items gathered (the backpack and bank split comes in slice 1)
  nodes: Record<string, NodeState>;
  parcels: Record<string, ParcelState>;
}

export function createState(layout: Layout, seed = 1): GameState {
  return {
    version: SAVE_VERSION,
    time: DAY_SECONDS * 0.32,   // start mid-morning (about 7:40)
    seed,
    player: { pos: { ...layout.start }, heading: Math.PI / 2, path: [], task: { kind: 'idle' }, pending: null },
    skills: { mining: 0, woodcutting: 0 },
    bank: {},
    nodes: Object.fromEntries(layout.nodes.map(n => [n.id, { id: n.id, depletedUntil: 0 }])),
    parcels: Object.fromEntries(layout.parcels.map(p => [p.id, { claimed: false }])),
  };
}
